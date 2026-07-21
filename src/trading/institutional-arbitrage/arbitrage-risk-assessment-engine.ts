/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-risk-assessment-engine.ts
 *
 * Purpose:
 * Deterministic, immutable, policy-aware institutional arbitrage risk
 * assessment across centralized, decentralized, and cross-chain strategies.
 */

import {
  type ArbitrageDecimal,
  type ArbitrageEvaluationPolicy,
  type ArbitrageId,
  type ArbitrageRejectionCode,
  type ArbitrageRiskAssessment,
  type ArbitrageRiskFactor,
  type ArbitrageRiskFinding,
  type ArbitrageRiskLevel,
  type ArbitrageScore,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageOpportunity,
  type InstitutionalArbitrageRiskEvaluator,
} from "./institutional-arbitrage-contracts";
import {
  assertArbitrageEvaluationPolicy,
  assertInstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;
const SCORE_MINIMUM = 0;
const SCORE_MAXIMUM = 100;

export interface ArbitrageRiskFactorWeights {
  readonly marketDataStaleness: number;
  readonly priceVolatility: number;
  readonly executionSlippage: number;
  readonly insufficientLiquidity: number;
  readonly partialFill: number;
  readonly legImbalance: number;
  readonly venueCounterparty: number;
  readonly transferDelay: number;
  readonly settlementDelay: number;
  readonly bridgeFailure: number;
  readonly chainRisk: number;
  readonly smartContract: number;
  readonly gasPrice: number;
  readonly stablecoinDepeg: number;
  readonly fundingRateReversal: number;
  readonly basisCompression: number;
  readonly liquidation: number;
  readonly borrowAvailability: number;
  readonly inventoryImbalance: number;
  readonly concentration: number;
  readonly capitalLockup: number;
  readonly modelUncertainty: number;
}

export interface ArbitrageRiskAssessmentEngineOptions {
  readonly decimalPlaces?: number;
  readonly validateInputs?: boolean;
  readonly factorWeights?: Partial<ArbitrageRiskFactorWeights>;
  readonly blockingFindingScore?: number;
  readonly highRiskScore?: number;
  readonly criticalRiskScore?: number;
  readonly minimumApprovedCapitalPercentage?: number;
  readonly defaultMaximumLeverage?: number;
  readonly fullyAutomatedMaximumLeverage?: number;
  readonly semiAutomatedMaximumLeverage?: number;
  readonly signalOnlyMaximumLeverage?: number;
}

export interface ArbitrageRiskAssessmentDiagnostics {
  readonly assessment: ArbitrageRiskAssessment;
  readonly weightedRiskScore: number;
  readonly blockingFindingCount: number;
  readonly highestRiskFactors: readonly ArbitrageRiskFactor[];
  readonly observations: readonly string[];
}

export type ArbitrageRiskAssessmentErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_DECIMAL_PLACES"
  | "INVALID_THRESHOLD"
  | "INVALID_WEIGHT";

export class ArbitrageRiskAssessmentError extends Error {
  public readonly code: ArbitrageRiskAssessmentErrorCode;

  public constructor(
    code: ArbitrageRiskAssessmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArbitrageRiskAssessmentError";
    this.code = code;
  }
}

interface NormalizedRiskAssessmentOptions {
  readonly decimalPlaces: number;
  readonly validateInputs: boolean;
  readonly factorWeights: ArbitrageRiskFactorWeights;
  readonly blockingFindingScore: number;
  readonly highRiskScore: number;
  readonly criticalRiskScore: number;
  readonly minimumApprovedCapitalPercentage: number;
  readonly defaultMaximumLeverage: number;
  readonly fullyAutomatedMaximumLeverage: number;
  readonly semiAutomatedMaximumLeverage: number;
  readonly signalOnlyMaximumLeverage: number;
}

interface FindingInput {
  readonly factor: ArbitrageRiskFactor;
  readonly score: number;
  readonly message: string;
  readonly affectedLegIds?: readonly ArbitrageId[];
  readonly blocking?: boolean;
  readonly rejectionCode?: ArbitrageRejectionCode;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

const DEFAULT_FACTOR_WEIGHTS: ArbitrageRiskFactorWeights =
  Object.freeze({
    marketDataStaleness: 1.1,
    priceVolatility: 1,
    executionSlippage: 1.2,
    insufficientLiquidity: 1.3,
    partialFill: 1.1,
    legImbalance: 1,
    venueCounterparty: 1.1,
    transferDelay: 1.1,
    settlementDelay: 1.15,
    bridgeFailure: 1.35,
    chainRisk: 1.2,
    smartContract: 1.25,
    gasPrice: 0.8,
    stablecoinDepeg: 1.4,
    fundingRateReversal: 1,
    basisCompression: 1,
    liquidation: 1.35,
    borrowAvailability: 1.1,
    inventoryImbalance: 0.9,
    concentration: 0.9,
    capitalLockup: 0.8,
    modelUncertainty: 1,
  });

const FACTOR_WEIGHT_KEY: Readonly<
  Record<ArbitrageRiskFactor, keyof ArbitrageRiskFactorWeights>
> = Object.freeze({
  MARKET_DATA_STALENESS: "marketDataStaleness",
  PRICE_VOLATILITY: "priceVolatility",
  EXECUTION_SLIPPAGE: "executionSlippage",
  INSUFFICIENT_LIQUIDITY: "insufficientLiquidity",
  PARTIAL_FILL: "partialFill",
  LEG_IMBALANCE: "legImbalance",
  VENUE_OUTAGE: "venueCounterparty",
  VENUE_COUNTERPARTY: "venueCounterparty",
  TRANSFER_DELAY: "transferDelay",
  WITHDRAWAL_DELAY: "transferDelay",
  SETTLEMENT_DELAY: "settlementDelay",
  BRIDGE_FAILURE: "bridgeFailure",
  CHAIN_CONGESTION: "chainRisk",
  CHAIN_REORGANIZATION: "chainRisk",
  SMART_CONTRACT: "smartContract",
  GAS_PRICE: "gasPrice",
  STABLECOIN_DEPEG: "stablecoinDepeg",
  FUNDING_RATE_REVERSAL: "fundingRateReversal",
  BASIS_COMPRESSION: "basisCompression",
  LIQUIDATION: "liquidation",
  BORROW_AVAILABILITY: "borrowAvailability",
  BORROW_RATE: "borrowAvailability",
  INVENTORY_IMBALANCE: "inventoryImbalance",
  CONCENTRATION: "concentration",
  CORRELATION: "concentration",
  CAPITAL_LOCKUP: "capitalLockup",
  MODEL_UNCERTAINTY: "modelUncertainty",
});

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(
    value as Record<string, unknown>,
  )) {
    deepFreeze(nested);
  }

  return value;
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new ArbitrageRiskAssessmentError(
      "INVALID_ARGUMENT",
      `${field} must be a finite number.`,
    );
  }
}

function assertRange(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
): void {
  assertFinite(value, field);

  if (value < minimum || value > maximum) {
    throw new ArbitrageRiskAssessmentError(
      "INVALID_THRESHOLD",
      `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ArbitrageRiskAssessmentError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative integer timestamp.`,
    );
  }
}

function clampScore(value: number): number {
  return Math.min(
    SCORE_MAXIMUM,
    Math.max(SCORE_MINIMUM, value),
  );
}

function roundDeterministically(
  value: number,
  decimalPlaces: number,
): number {
  const factor = 10 ** decimalPlaces;
  const rounded =
    Math.round((value + Number.EPSILON) * factor) / factor;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeOptions(
  options: ArbitrageRiskAssessmentEngineOptions | undefined,
): NormalizedRiskAssessmentOptions {
  const decimalPlaces =
    options?.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;

  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageRiskAssessmentError(
      "INVALID_DECIMAL_PLACES",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }

  const blockingFindingScore =
    options?.blockingFindingScore ?? 80;
  const highRiskScore = options?.highRiskScore ?? 60;
  const criticalRiskScore =
    options?.criticalRiskScore ?? 80;
  const minimumApprovedCapitalPercentage =
    options?.minimumApprovedCapitalPercentage ?? 10;

  assertRange(
    blockingFindingScore,
    "blockingFindingScore",
    0,
    100,
  );
  assertRange(highRiskScore, "highRiskScore", 0, 100);
  assertRange(
    criticalRiskScore,
    "criticalRiskScore",
    highRiskScore,
    100,
  );
  assertRange(
    minimumApprovedCapitalPercentage,
    "minimumApprovedCapitalPercentage",
    0,
    100,
  );

  const factorWeights = {
    ...DEFAULT_FACTOR_WEIGHTS,
    ...options?.factorWeights,
  };

  for (const [key, value] of Object.entries(factorWeights)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new ArbitrageRiskAssessmentError(
        "INVALID_WEIGHT",
        `factorWeights.${key} must be greater than zero.`,
      );
    }
  }

  const leverageValues = {
    defaultMaximumLeverage:
      options?.defaultMaximumLeverage ?? 1,
    fullyAutomatedMaximumLeverage:
      options?.fullyAutomatedMaximumLeverage ?? 2,
    semiAutomatedMaximumLeverage:
      options?.semiAutomatedMaximumLeverage ?? 1,
    signalOnlyMaximumLeverage:
      options?.signalOnlyMaximumLeverage ?? 1,
  };

  for (const [key, value] of Object.entries(leverageValues)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new ArbitrageRiskAssessmentError(
        "INVALID_THRESHOLD",
        `${key} must be greater than zero.`,
      );
    }
  }

  return deepFreeze({
    decimalPlaces,
    validateInputs: options?.validateInputs ?? true,
    factorWeights,
    blockingFindingScore,
    highRiskScore,
    criticalRiskScore,
    minimumApprovedCapitalPercentage,
    ...leverageValues,
  });
}

function riskLevelFromScore(
  score: number,
): ArbitrageRiskLevel {
  if (score >= 80) {
    return "CRITICAL";
  }

  if (score >= 60) {
    return "HIGH";
  }

  if (score >= 35) {
    return "MODERATE";
  }

  if (score >= 15) {
    return "LOW";
  }

  return "MINIMAL";
}

function stableHash(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function findingId(
  opportunityId: ArbitrageId,
  factor: ArbitrageRiskFactor,
  index: number,
): ArbitrageId {
  return `risk-${stableHash(
    `${opportunityId}|${factor}|${index}`,
  )}`;
}

function calculateFeePercentage(
  opportunity: InstitutionalArbitrageOpportunity,
): number {
  if (opportunity.requestedCapital <= 0) {
    return 100;
  }

  return (
    opportunity.profitEstimate.totalFees /
    opportunity.requestedCapital
  ) * 100;
}

function maximumLegValue(
  opportunity: InstitutionalArbitrageOpportunity,
  selector: (leg: InstitutionalArbitrageOpportunity["legs"][number]) => number,
): number {
  return opportunity.legs.reduce(
    (maximum, leg) => Math.max(maximum, selector(leg)),
    0,
  );
}

function averageLegValue(
  opportunity: InstitutionalArbitrageOpportunity,
  selector: (leg: InstitutionalArbitrageOpportunity["legs"][number]) => number,
): number {
  if (opportunity.legs.length === 0) {
    return 0;
  }

  return (
    opportunity.legs.reduce(
      (total, leg) => total + selector(leg),
      0,
    ) / opportunity.legs.length
  );
}

function addGenericFindings(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy,
  findings: FindingInput[],
): void {
  const maximumMarketDataAge = maximumLegValue(
    opportunity,
    (leg) => leg.latency.marketDataAgeMs,
  );

  if (maximumMarketDataAge > policy.maximumMarketDataAgeMs) {
    const ratio =
      maximumMarketDataAge /
      Math.max(policy.maximumMarketDataAgeMs, 1);

    findings.push({
      factor: "MARKET_DATA_STALENESS",
      score: clampScore(50 + (ratio - 1) * 50),
      message:
        `Market data age ${maximumMarketDataAge}ms exceeds policy limit ` +
        `${policy.maximumMarketDataAgeMs}ms.`,
      affectedLegIds: opportunity.legs
        .filter(
          (leg) =>
            leg.latency.marketDataAgeMs >
            policy.maximumMarketDataAgeMs,
        )
        .map((leg) => leg.legId),
      blocking: true,
      rejectionCode: "MARKET_DATA_STALE",
    });
  }

  const maximumSlippage = maximumLegValue(
    opportunity,
    (leg) => leg.slippageEstimate.stressedSlippageBps,
  );

  if (maximumSlippage > policy.maximumSlippageBps) {
    const ratio =
      maximumSlippage /
      Math.max(policy.maximumSlippageBps, 1);

    findings.push({
      factor: "EXECUTION_SLIPPAGE",
      score: clampScore(55 + (ratio - 1) * 45),
      message:
        `Stressed slippage ${maximumSlippage} bps exceeds policy limit ` +
        `${policy.maximumSlippageBps} bps.`,
      affectedLegIds: opportunity.legs
        .filter(
          (leg) =>
            leg.slippageEstimate.stressedSlippageBps >
            policy.maximumSlippageBps,
        )
        .map((leg) => leg.legId),
      blocking: true,
      rejectionCode: "SLIPPAGE_LIMIT_EXCEEDED",
    });
  } else if (policy.maximumSlippageBps > 0) {
    findings.push({
      factor: "EXECUTION_SLIPPAGE",
      score: clampScore(
        (maximumSlippage / policy.maximumSlippageBps) * 55,
      ),
      message: `Stressed slippage utilization is ${roundDeterministically(
        (maximumSlippage / policy.maximumSlippageBps) * 100,
        4,
      )}% of policy capacity.`,
      affectedLegIds: opportunity.legs.map(
        (leg) => leg.legId,
      ),
    });
  }

  const insufficientLegs = opportunity.legs.filter(
    (leg) => !leg.liquidity.sufficient,
  );

  if (insufficientLegs.length > 0) {
    findings.push({
      factor: "INSUFFICIENT_LIQUIDITY",
      score: clampScore(
        70 +
          (insufficientLegs.length /
            Math.max(opportunity.legs.length, 1)) *
            30,
      ),
      message:
        `${insufficientLegs.length} of ${opportunity.legs.length} legs ` +
        "have insufficient executable liquidity.",
      affectedLegIds: insufficientLegs.map(
        (leg) => leg.legId,
      ),
      blocking: true,
      rejectionCode: "INSUFFICIENT_LIQUIDITY",
    });
  } else {
    const averageUtilization = averageLegValue(
      opportunity,
      (leg) =>
        leg.liquidity.liquidityUtilizationPercentage,
    );

    findings.push({
      factor: "INSUFFICIENT_LIQUIDITY",
      score: clampScore(averageUtilization),
      message:
        `Average liquidity utilization is ${roundDeterministically(
          averageUtilization,
          4,
        )}%.`,
      affectedLegIds: opportunity.legs.map(
        (leg) => leg.legId,
      ),
    });
  }

  const maximumExecutionLatency = maximumLegValue(
    opportunity,
    (leg) => leg.latency.expectedExecutionLatencyMs,
  );

  if (
    maximumExecutionLatency >
    policy.maximumExecutionLatencyMs
  ) {
    findings.push({
      factor: "PARTIAL_FILL",
      score: clampScore(
        60 +
          ((maximumExecutionLatency /
            Math.max(policy.maximumExecutionLatencyMs, 1)) -
            1) *
            40,
      ),
      message:
        `Expected execution latency ${maximumExecutionLatency}ms exceeds ` +
        `policy limit ${policy.maximumExecutionLatencyMs}ms.`,
      affectedLegIds: opportunity.legs
        .filter(
          (leg) =>
            leg.latency.expectedExecutionLatencyMs >
            policy.maximumExecutionLatencyMs,
        )
        .map((leg) => leg.legId),
      blocking: true,
      rejectionCode: "LATENCY_LIMIT_EXCEEDED",
    });
  }

  const maximumSettlementLatency = maximumLegValue(
    opportunity,
    (leg) =>
      leg.latency.expectedSettlementLatencyMs,
  );

  if (
    maximumSettlementLatency >
    policy.maximumSettlementLatencyMs
  ) {
    findings.push({
      factor: "SETTLEMENT_DELAY",
      score: clampScore(
        60 +
          ((maximumSettlementLatency /
            Math.max(policy.maximumSettlementLatencyMs, 1)) -
            1) *
            40,
      ),
      message:
        `Expected settlement latency ${maximumSettlementLatency}ms exceeds ` +
        `policy limit ${policy.maximumSettlementLatencyMs}ms.`,
      affectedLegIds: opportunity.legs
        .filter(
          (leg) =>
            leg.latency.expectedSettlementLatencyMs >
            policy.maximumSettlementLatencyMs,
        )
        .map((leg) => leg.legId),
      blocking: true,
      rejectionCode: "SETTLEMENT_LIMIT_EXCEEDED",
    });
  }

  const feePercentage = calculateFeePercentage(opportunity);

  if (feePercentage > policy.maximumFeePercentage) {
    findings.push({
      factor: "CAPITAL_LOCKUP",
      score: clampScore(
        55 +
          ((feePercentage /
            Math.max(policy.maximumFeePercentage, 0.000001)) -
            1) *
            45,
      ),
      message:
        `Fee percentage ${roundDeterministically(
          feePercentage,
          6,
        )}% exceeds policy limit ${policy.maximumFeePercentage}%.`,
      affectedLegIds: opportunity.legs.map(
        (leg) => leg.legId,
      ),
      blocking: true,
      rejectionCode: "FEE_LIMIT_EXCEEDED",
    });
  }

  if (
    opportunity.requestedCapital >
    policy.maximumCapitalPerOpportunity
  ) {
    findings.push({
      factor: "CONCENTRATION",
      score: clampScore(
        65 +
          ((opportunity.requestedCapital /
            Math.max(
              policy.maximumCapitalPerOpportunity,
              0.000001,
            )) -
            1) *
            35,
      ),
      message:
        `Requested capital ${opportunity.requestedCapital} exceeds policy ` +
        `maximum ${policy.maximumCapitalPerOpportunity}.`,
      blocking: true,
      rejectionCode: "CAPITAL_LIMIT_EXCEEDED",
    });
  }

  const transferLatency = opportunity.transfers.reduce(
    (maximum, transfer) =>
      Math.max(maximum, transfer.expectedDurationMs),
    0,
  );

  if (transferLatency > 0) {
    const transferLimit = Math.max(
      policy.maximumSettlementLatencyMs,
      1,
    );

    findings.push({
      factor: "TRANSFER_DELAY",
      score: clampScore(
        (transferLatency / transferLimit) * 60,
      ),
      message:
        `Maximum expected transfer duration is ${transferLatency}ms.`,
    });
  }

  if (
    opportunity.profitEstimate.stressedNetProfit <= 0
  ) {
    findings.push({
      factor: "MODEL_UNCERTAINTY",
      score: 90,
      message:
        `Stressed net profit is non-positive at ` +
        `${opportunity.profitEstimate.stressedNetProfit} ` +
        `${opportunity.reportingAsset}.`,
      blocking: true,
      rejectionCode: "INSUFFICIENT_NET_PROFIT",
    });
  } else {
    const stressRetention =
      opportunity.profitEstimate.expectedNetProfit > 0
        ? opportunity.profitEstimate.stressedNetProfit /
          opportunity.profitEstimate.expectedNetProfit
        : 0;

    findings.push({
      factor: "MODEL_UNCERTAINTY",
      score: clampScore((1 - stressRetention) * 100),
      message:
        `Stress-case profit retention is ${roundDeterministically(
          stressRetention * 100,
          4,
        )}%.`,
    });
  }
}

function addTypeSpecificFindings(
  opportunity: InstitutionalArbitrageOpportunity,
  findings: FindingInput[],
): void {
  switch (opportunity.type) {
    case "CROSS_EXCHANGE": {
      if (
        !opportunity.details.inventoryPrepositioned
      ) {
        findings.push({
          factor: "INVENTORY_IMBALANCE",
          score: 78,
          message:
            "Cross-exchange inventory is not prepositioned.",
          blocking: false,
          rejectionCode: "INSUFFICIENT_INVENTORY",
        });
      }

      findings.push({
        factor: "VENUE_COUNTERPARTY",
        score: 30,
        message:
          "Cross-exchange execution introduces multi-venue counterparty exposure.",
      });
      break;
    }

    case "TRIANGULAR": {
      findings.push({
        factor: "LEG_IMBALANCE",
        score: clampScore(
          15 + opportunity.details.cycleLength * 8,
        ),
        message:
          `Triangular route contains ${opportunity.details.cycleLength} execution legs.`,
        affectedLegIds: opportunity.legs.map(
          (leg) => leg.legId,
        ),
      });
      break;
    }

    case "FUNDING_RATE": {
      findings.push({
        factor: "FUNDING_RATE_REVERSAL",
        score: clampScore(
          35 +
            Math.max(
              0,
              3 - opportunity.details.expectedHoldingPeriods,
            ) *
              10,
        ),
        message:
          `Funding-rate exposure spans ${opportunity.details.expectedHoldingPeriods} holding periods.`,
      });

      if (!opportunity.details.deltaNeutral) {
        findings.push({
          factor: "LIQUIDATION",
          score: 85,
          message:
            "Funding-rate position is not delta neutral.",
          blocking: true,
          rejectionCode: "RISK_LIMIT_EXCEEDED",
        });
      }
      break;
    }

    case "CASH_AND_CARRY": {
      findings.push({
        factor: "BASIS_COMPRESSION",
        score: clampScore(
          30 +
            Math.max(
              0,
              30 - opportunity.details.holdingPeriodDays,
            ),
        ),
        message:
          `Cash-and-carry holding period is ${opportunity.details.holdingPeriodDays} days.`,
      });

      findings.push({
        factor: "CAPITAL_LOCKUP",
        score: clampScore(
          Math.min(
            75,
            opportunity.details.holdingPeriodDays / 2,
          ),
        ),
        message:
          "Cash-and-carry capital remains committed through the hedge horizon.",
      });
      break;
    }

    case "STABLECOIN": {
      const safety =
        opportunity.details.safetyAssessment;
      const safetyRisk = Math.max(
        safety.reserveRiskScore,
        safety.liquidityRiskScore,
        safety.issuerRiskScore,
        safety.redemptionRiskScore,
        safety.chainRiskScore,
      );

      findings.push({
        factor: "STABLECOIN_DEPEG",
        score: safetyRisk,
        message:
          `Stablecoin safety risk score is ${safetyRisk}.`,
        blocking: !safety.safetyRulesPassed,
        rejectionCode: !safety.safetyRulesPassed
          ? "STABLECOIN_SAFETY_RULE_FAILED"
          : undefined,
        metadata: {
          failedRuleCount: safety.failedRuleIds.length,
          redemptionAvailable:
            opportunity.details.redemptionAvailable,
        },
      });
      break;
    }

    case "CROSS_DEX": {
      const capital = Math.max(
        opportunity.requestedCapital,
        0.000001,
      );
      const gasPercentage =
        (opportunity.details.expectedGasCost /
          capital) *
        100;

      findings.push({
        factor: "GAS_PRICE",
        score: clampScore(gasPercentage * 10),
        message:
          `Expected gas cost is ${roundDeterministically(
            gasPercentage,
            6,
          )}% of requested capital.`,
      });

      findings.push({
        factor: "SMART_CONTRACT",
        score: 55,
        message:
          "Cross-DEX execution carries protocol and smart-contract risk.",
      });
      break;
    }

    case "CROSS_CHAIN": {
      const details = opportunity.details;
      const chainRisk = Math.max(
        details.sourceChainRiskScore,
        details.destinationChainRiskScore,
      );

      findings.push({
        factor: "CHAIN_CONGESTION",
        score: chainRisk,
        message:
          `Maximum chain risk score is ${chainRisk}.`,
      });

      findings.push({
        factor: "BRIDGE_FAILURE",
        score: details.bridgeRiskScore,
        message:
          `Bridge risk score is ${details.bridgeRiskScore}.`,
        blocking: details.bridgeRiskScore >= 80,
        rejectionCode:
          details.bridgeRiskScore >= 80
            ? "BRIDGE_UNAVAILABLE"
            : undefined,
      });

      if (
        details.expectedSettlementTimeMs >
        details.maximumSettlementTimeMs
      ) {
        findings.push({
          factor: "SETTLEMENT_DELAY",
          score: 90,
          message:
            "Expected cross-chain settlement exceeds the opportunity maximum.",
          blocking: true,
          rejectionCode:
            "SETTLEMENT_LIMIT_EXCEEDED",
        });
      }
      break;
    }

    default: {
      const exhaustiveCheck: never = opportunity;
      throw new ArbitrageRiskAssessmentError(
        "INVALID_ARGUMENT",
        `Unsupported opportunity type: ${String(
          exhaustiveCheck,
        )}.`,
      );
    }
  }
}

function createFindings(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy,
  options: NormalizedRiskAssessmentOptions,
): readonly ArbitrageRiskFinding[] {
  const inputs: FindingInput[] = [];

  addGenericFindings(opportunity, policy, inputs);
  addTypeSpecificFindings(opportunity, inputs);

  return deepFreeze(
    inputs
      .map((input, index) => {
        const score = roundDeterministically(
          clampScore(input.score),
          options.decimalPlaces,
        );
        const blocking =
          input.blocking === true ||
          score >= options.blockingFindingScore;

        return {
          findingId: findingId(
            opportunity.opportunityId,
            input.factor,
            index,
          ),
          factor: input.factor,
          level: riskLevelFromScore(score),
          score,
          message: input.message,
          blocking,
          affectedLegIds: [
            ...(input.affectedLegIds ?? []),
          ],
          metadata: {
            ...(input.metadata ?? {}),
            rejectionCode:
              input.rejectionCode ?? null,
          },
        } satisfies ArbitrageRiskFinding;
      })
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        const factorComparison =
          left.factor.localeCompare(right.factor);

        if (factorComparison !== 0) {
          return factorComparison;
        }

        return left.findingId.localeCompare(
          right.findingId,
        );
      }),
  );
}

function calculateWeightedScore(
  findings: readonly ArbitrageRiskFinding[],
  options: NormalizedRiskAssessmentOptions,
): number {
  if (findings.length === 0) {
    return 0;
  }

  let weightedTotal = 0;
  let weightTotal = 0;

  for (const finding of findings) {
    const key = FACTOR_WEIGHT_KEY[finding.factor];
    const weight = options.factorWeights[key];

    weightedTotal += finding.score * weight;
    weightTotal += weight;
  }

  const weightedAverage =
    weightTotal === 0 ? 0 : weightedTotal / weightTotal;
  const maximumFinding = Math.max(
    ...findings.map((finding) => finding.score),
  );

  return clampScore(
    weightedAverage * 0.7 + maximumFinding * 0.3,
  );
}

function collectRejectionCodes(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy,
  findings: readonly ArbitrageRiskFinding[],
  overallRiskScore: number,
  assessedAt: number,
): readonly ArbitrageRejectionCode[] {
  const codes = new Set<ArbitrageRejectionCode>();

  if (assessedAt >= opportunity.expiresAt) {
    codes.add("OPPORTUNITY_EXPIRED");
  }

  if (
    opportunity.profitEstimate.grossProfit <
    policy.minimumGrossProfit
  ) {
    codes.add("INSUFFICIENT_GROSS_EDGE");
  }

  if (
    opportunity.profitEstimate.expectedNetProfit <
    policy.minimumNetProfit
  ) {
    codes.add("INSUFFICIENT_NET_PROFIT");
  }

  if (
    opportunity.profitEstimate.netReturnPercentage <
    policy.minimumNetReturnPercentage
  ) {
    codes.add("INSUFFICIENT_RETURN");
  }

  if (opportunity.confidence < policy.minimumConfidence) {
    codes.add("INSUFFICIENT_CONFIDENCE");
  }

  if (overallRiskScore > policy.maximumRiskScore) {
    codes.add("RISK_LIMIT_EXCEEDED");
  }

  for (const finding of findings) {
    const code = finding.metadata.rejectionCode;

    if (
      finding.blocking &&
      typeof code === "string"
    ) {
      codes.add(code as ArbitrageRejectionCode);
    }
  }

  return Object.freeze(
    [...codes].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function maximumLeverage(
  opportunity: InstitutionalArbitrageOpportunity,
  options: NormalizedRiskAssessmentOptions,
): number {
  switch (opportunity.automationMode) {
    case "FULLY_AUTOMATED":
      return options.fullyAutomatedMaximumLeverage;
    case "SEMI_AUTOMATED":
      return options.semiAutomatedMaximumLeverage;
    case "SIGNAL_ONLY":
      return options.signalOnlyMaximumLeverage;
    default:
      return options.defaultMaximumLeverage;
  }
}

function maximumApprovedCapital(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy,
  overallRiskScore: number,
  approved: boolean,
  options: NormalizedRiskAssessmentOptions,
): ArbitrageDecimal {
  if (!approved) {
    return 0;
  }

  const riskRetention = Math.max(
    options.minimumApprovedCapitalPercentage / 100,
    1 - overallRiskScore / 100,
  );

  return roundDeterministically(
    Math.min(
      opportunity.requestedCapital,
      opportunity.maximumCapital,
      policy.maximumCapitalPerOpportunity,
    ) * riskRetention,
    options.decimalPlaces,
  );
}

export class ArbitrageRiskAssessmentEngine
  implements InstitutionalArbitrageRiskEvaluator
{
  private readonly options: NormalizedRiskAssessmentOptions;

  public constructor(
    options?: ArbitrageRiskAssessmentEngineOptions,
  ) {
    this.options = normalizeOptions(options);
  }

  public getOptions(): Readonly<NormalizedRiskAssessmentOptions> {
    return this.options;
  }

  public assess(
    opportunity: InstitutionalArbitrageOpportunity,
    policy: ArbitrageEvaluationPolicy,
    assessedAt: ArbitrageTimestamp,
  ): ArbitrageRiskAssessment {
    assertTimestamp(assessedAt, "assessedAt");

    if (this.options.validateInputs) {
      assertInstitutionalArbitrageOpportunity(
        opportunity,
        assessedAt,
      );
      assertArbitrageEvaluationPolicy(policy);
    }

    const findings = createFindings(
      opportunity,
      policy,
      this.options,
    );

    const overallRiskScore = roundDeterministically(
      calculateWeightedScore(findings, this.options),
      this.options.decimalPlaces,
    );

    const rejectionCodes = collectRejectionCodes(
      opportunity,
      policy,
      findings,
      overallRiskScore,
      assessedAt,
    );

    const approved =
      rejectionCodes.length === 0 &&
      !findings.some((finding) => finding.blocking) &&
      overallRiskScore <= policy.maximumRiskScore;

    return deepFreeze({
      opportunityId: opportunity.opportunityId,
      assessedAt,
      overallRiskLevel:
        riskLevelFromScore(overallRiskScore),
      overallRiskScore,
      approved,
      findings,
      rejectionCodes,
      maximumApprovedCapital:
        maximumApprovedCapital(
          opportunity,
          policy,
          overallRiskScore,
          approved,
          this.options,
        ),
      maximumApprovedLeverage: approved
        ? roundDeterministically(
            maximumLeverage(
              opportunity,
              this.options,
            ),
            this.options.decimalPlaces,
          )
        : 0,
      metadata: {
        engine:
          "ArbitrageRiskAssessmentEngine",
        assessmentVersion: 1,
        findingCount: findings.length,
        blockingFindingCount: findings.filter(
          (finding) => finding.blocking,
        ).length,
        policyMaximumRiskScore:
          policy.maximumRiskScore,
      },
    });
  }

  public assessBatch(
    opportunities: readonly InstitutionalArbitrageOpportunity[],
    policy: ArbitrageEvaluationPolicy,
    assessedAt: ArbitrageTimestamp,
  ): ReadonlyMap<ArbitrageId, ArbitrageRiskAssessment> {
    const seen = new Set<ArbitrageId>();

    const entries = opportunities.map((opportunity) => {
      if (seen.has(opportunity.opportunityId)) {
        throw new ArbitrageRiskAssessmentError(
          "INVALID_ARGUMENT",
          `Duplicate opportunityId: ${opportunity.opportunityId}.`,
        );
      }

      seen.add(opportunity.opportunityId);

      return [
        opportunity.opportunityId,
        this.assess(opportunity, policy, assessedAt),
      ] as const;
    });

    entries.sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return new Map(entries);
  }

  public assessWithDiagnostics(
    opportunity: InstitutionalArbitrageOpportunity,
    policy: ArbitrageEvaluationPolicy,
    assessedAt: ArbitrageTimestamp,
  ): ArbitrageRiskAssessmentDiagnostics {
    const assessment = this.assess(
      opportunity,
      policy,
      assessedAt,
    );

    const highestRiskFactors =
      assessment.findings
        .filter(
          (finding) =>
            finding.score ===
            Math.max(
              ...assessment.findings.map(
                (entry) => entry.score,
              ),
            ),
        )
        .map((finding) => finding.factor);

    const observations = [
      `Overall risk score: ${assessment.overallRiskScore}.`,
      `Overall risk level: ${assessment.overallRiskLevel}.`,
      `Approved: ${assessment.approved}.`,
      `Maximum approved capital: ${assessment.maximumApprovedCapital} ${opportunity.reportingAsset}.`,
      `Maximum approved leverage: ${assessment.maximumApprovedLeverage}.`,
      `Blocking findings: ${
        assessment.findings.filter(
          (finding) => finding.blocking,
        ).length
      }.`,
    ];

    return deepFreeze({
      assessment,
      weightedRiskScore:
        assessment.overallRiskScore,
      blockingFindingCount:
        assessment.findings.filter(
          (finding) => finding.blocking,
        ).length,
      highestRiskFactors,
      observations,
    });
  }
}

export function createArbitrageRiskAssessmentEngine(
  options?: ArbitrageRiskAssessmentEngineOptions,
): ArbitrageRiskAssessmentEngine {
  return new ArbitrageRiskAssessmentEngine(options);
}

export function assessArbitrageRisk(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy,
  assessedAt: ArbitrageTimestamp,
  options?: ArbitrageRiskAssessmentEngineOptions,
): ArbitrageRiskAssessment {
  return createArbitrageRiskAssessmentEngine(
    options,
  ).assess(opportunity, policy, assessedAt);
}