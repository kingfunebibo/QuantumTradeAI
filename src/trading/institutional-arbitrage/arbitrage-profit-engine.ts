/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-profit-engine.ts
 *
 * Purpose:
 * Production-grade, deterministic, and immutable profitability estimation
 * for institutional arbitrage opportunities.
 */

import {
  type ArbitrageAsset,
  type ArbitrageBasisPoints,
  type ArbitrageDecimal,
  type ArbitrageFeeBreakdown,
  type ArbitrageId,
  type ArbitrageLeg,
  type ArbitragePercentage,
  type ArbitrageProfitEstimate,
  type ArbitrageSlippageEstimate,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";
import { assertInstitutionalArbitrageOpportunity } from "./institutional-arbitrage-validator";

const BASIS_POINTS_DIVISOR = 10_000;
const PERCENTAGE_MULTIPLIER = 100;
const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;
const DEFAULT_DECIMAL_PLACES = 12;
const MAX_DECIMAL_PLACES = 18;

export const ARBITRAGE_PROFIT_COST_COMPONENTS = [
  "fees",
  "slippage",
  "financing",
  "gas",
  "bridge",
] as const;

export type ArbitrageProfitCostComponent =
  (typeof ARBITRAGE_PROFIT_COST_COMPONENTS)[number];

export type ArbitrageGrossProfitMode =
  | "PROVIDED"
  | "LEG_OUTPUT_DELTA"
  | "TERMINAL_VALUE_DELTA";

export interface ArbitrageProfitEngineOptions {
  readonly decimalPlaces?: number;
  readonly defaultStressMultiplier?: ArbitrageDecimal;
  readonly minimumHoldingPeriodMs?: number;
  readonly validateOpportunity?: boolean;
}

export interface ArbitrageProfitCostOverrides {
  readonly totalFees?: ArbitrageDecimal;
  readonly expectedSlippageCost?: ArbitrageDecimal;
  readonly stressedSlippageCost?: ArbitrageDecimal;
  readonly expectedFinancingCost?: ArbitrageDecimal;
  readonly stressedFinancingCost?: ArbitrageDecimal;
  readonly expectedGasCost?: ArbitrageDecimal;
  readonly stressedGasCost?: ArbitrageDecimal;
  readonly expectedBridgeCost?: ArbitrageDecimal;
  readonly stressedBridgeCost?: ArbitrageDecimal;
}

export interface ArbitrageProfitEstimationRequest {
  readonly reportingAsset: ArbitrageAsset;
  readonly investedCapital: ArbitrageDecimal;
  readonly grossProfit: ArbitrageDecimal;
  readonly holdingPeriodMs?: number;
  readonly feeBreakdowns?: readonly ArbitrageFeeBreakdown[];
  readonly slippageEstimates?: readonly ArbitrageSlippageEstimate[];
  readonly costOverrides?: ArbitrageProfitCostOverrides;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly decimalPlaces?: number;
}

export interface ArbitrageLegProfitEstimationRequest {
  readonly leg: ArbitrageLeg;
  readonly reportingAsset: ArbitrageAsset;
  readonly investedCapital?: ArbitrageDecimal;
  readonly grossProfit?: ArbitrageDecimal;
  readonly holdingPeriodMs?: number;
  readonly costOverrides?: ArbitrageProfitCostOverrides;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly decimalPlaces?: number;
}

export interface ArbitrageOpportunityProfitEstimationRequest {
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly grossProfitMode?: ArbitrageGrossProfitMode;
  readonly grossProfit?: ArbitrageDecimal;
  readonly terminalValue?: ArbitrageDecimal;
  readonly investedCapital?: ArbitrageDecimal;
  readonly holdingPeriodMs?: number;
  readonly costOverrides?: ArbitrageProfitCostOverrides;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly decimalPlaces?: number;
  readonly validateOpportunity?: boolean;
}

export interface ArbitrageProfitThresholdPolicy {
  readonly minimumGrossProfit?: ArbitrageDecimal;
  readonly minimumExpectedNetProfit?: ArbitrageDecimal;
  readonly minimumStressedNetProfit?: ArbitrageDecimal;
  readonly minimumGrossReturnPercentage?: ArbitragePercentage;
  readonly minimumNetReturnPercentage?: ArbitragePercentage;
  readonly minimumAnnualizedReturnPercentage?: ArbitragePercentage;
  readonly maximumBreakEvenPriceMovementBps?: ArbitrageBasisPoints;
}

export interface ArbitrageProfitPolicyAssessment {
  readonly accepted: boolean;
  readonly grossProfitAccepted: boolean;
  readonly expectedNetProfitAccepted: boolean;
  readonly stressedNetProfitAccepted: boolean;
  readonly grossReturnAccepted: boolean;
  readonly netReturnAccepted: boolean;
  readonly annualizedReturnAccepted: boolean;
  readonly breakEvenAccepted: boolean;
  readonly reasons: readonly string[];
}

export interface ArbitrageProfitSensitivityScenario {
  readonly scenarioId: ArbitrageId;
  readonly grossProfitMultiplier?: ArbitrageDecimal;
  readonly feeMultiplier?: ArbitrageDecimal;
  readonly slippageMultiplier?: ArbitrageDecimal;
  readonly financingMultiplier?: ArbitrageDecimal;
  readonly gasMultiplier?: ArbitrageDecimal;
  readonly bridgeMultiplier?: ArbitrageDecimal;
}

export interface ArbitrageProfitSensitivityResult {
  readonly scenarioId: ArbitrageId;
  readonly estimate: ArbitrageProfitEstimate;
}

export type ArbitrageProfitEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_DECIMAL_PLACES"
  | "INVALID_REPORTING_ASSET"
  | "REPORTING_ASSET_MISMATCH"
  | "INVALID_HOLDING_PERIOD"
  | "GROSS_PROFIT_UNAVAILABLE";

export class ArbitrageProfitEngineError extends Error {
  public readonly code: ArbitrageProfitEngineErrorCode;

  public constructor(
    code: ArbitrageProfitEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArbitrageProfitEngineError";
    this.code = code;
  }
}

interface NormalizedOptions {
  readonly decimalPlaces: number;
  readonly defaultStressMultiplier: number;
  readonly minimumHoldingPeriodMs: number;
  readonly validateOpportunity: boolean;
}

interface AggregatedCosts {
  readonly totalFees: number;
  readonly expectedSlippageCost: number;
  readonly stressedSlippageCost: number;
  readonly expectedFinancingCost: number;
  readonly stressedFinancingCost: number;
  readonly expectedGasCost: number;
  readonly stressedGasCost: number;
  readonly expectedBridgeCost: number;
  readonly stressedBridgeCost: number;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  defaultStressMultiplier: 1.25,
  minimumHoldingPeriodMs: 1,
  validateOpportunity: true,
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

  for (const nestedValue of Object.values(
    value as Record<string, unknown>,
  )) {
    deepFreeze(nestedValue);
  }

  return value;
}

function assertFinite(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value)) {
    throw new ArbitrageProfitEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a finite number.`,
    );
  }
}

function assertNonNegative(
  value: number,
  field: string,
): void {
  assertFinite(value, field);

  if (value < 0) {
    throw new ArbitrageProfitEngineError(
      "INVALID_ARGUMENT",
      `${field} must be greater than or equal to zero.`,
    );
  }
}

function assertPositive(
  value: number,
  field: string,
): void {
  assertFinite(value, field);

  if (value <= 0) {
    throw new ArbitrageProfitEngineError(
      "INVALID_ARGUMENT",
      `${field} must be greater than zero.`,
    );
  }
}

function assertReportingAsset(
  reportingAsset: string,
): void {
  if (reportingAsset.trim().length === 0) {
    throw new ArbitrageProfitEngineError(
      "INVALID_REPORTING_ASSET",
      "reportingAsset must be a non-empty string.",
    );
  }
}

function assertDecimalPlaces(
  decimalPlaces: number,
): void {
  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageProfitEngineError(
      "INVALID_DECIMAL_PLACES",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }
}

function roundDeterministically(
  value: number,
  decimalPlaces: number,
): number {
  assertFinite(value, "value");

  const factor = 10 ** decimalPlaces;
  const rounded =
    Math.round((value + Number.EPSILON) * factor) / factor;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function percentage(
  numerator: number,
  denominator: number,
): number {
  if (denominator === 0) {
    return 0;
  }

  return (numerator / denominator) * PERCENTAGE_MULTIPLIER;
}

function normalizeOptions(
  options: ArbitrageProfitEngineOptions | undefined,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    decimalPlaces:
      options?.decimalPlaces ?? DEFAULT_OPTIONS.decimalPlaces,
    defaultStressMultiplier:
      options?.defaultStressMultiplier ??
      DEFAULT_OPTIONS.defaultStressMultiplier,
    minimumHoldingPeriodMs:
      options?.minimumHoldingPeriodMs ??
      DEFAULT_OPTIONS.minimumHoldingPeriodMs,
    validateOpportunity:
      options?.validateOpportunity ??
      DEFAULT_OPTIONS.validateOpportunity,
  };

  assertDecimalPlaces(normalized.decimalPlaces);
  assertNonNegative(
    normalized.defaultStressMultiplier,
    "defaultStressMultiplier",
  );

  if (
    !Number.isInteger(normalized.minimumHoldingPeriodMs) ||
    normalized.minimumHoldingPeriodMs <= 0
  ) {
    throw new ArbitrageProfitEngineError(
      "INVALID_HOLDING_PERIOD",
      "minimumHoldingPeriodMs must be a positive integer.",
    );
  }

  return deepFreeze(normalized);
}

function verifyReportingAsset(
  reportingAsset: ArbitrageAsset,
  actualAsset: ArbitrageAsset,
  field: string,
): void {
  if (actualAsset !== reportingAsset) {
    throw new ArbitrageProfitEngineError(
      "REPORTING_ASSET_MISMATCH",
      `${field}.reportingAsset must equal ${reportingAsset}.`,
    );
  }
}

function sumFeeBreakdowns(
  breakdowns: readonly ArbitrageFeeBreakdown[],
  reportingAsset: ArbitrageAsset,
): number {
  return breakdowns.reduce((total, breakdown, index) => {
    verifyReportingAsset(
      reportingAsset,
      breakdown.reportingAsset,
      `feeBreakdowns[${index}]`,
    );
    assertNonNegative(
      breakdown.totalFee,
      `feeBreakdowns[${index}].totalFee`,
    );

    return total + breakdown.totalFee;
  }, 0);
}

function sumExpectedSlippage(
  estimates: readonly ArbitrageSlippageEstimate[],
  reportingAsset: ArbitrageAsset,
): number {
  return estimates.reduce((total, estimate, index) => {
    verifyReportingAsset(
      reportingAsset,
      estimate.reportingAsset,
      `slippageEstimates[${index}]`,
    );
    assertNonNegative(
      estimate.expectedSlippageValue,
      `slippageEstimates[${index}].expectedSlippageValue`,
    );

    return total + estimate.expectedSlippageValue;
  }, 0);
}

function sumStressedSlippage(
  estimates: readonly ArbitrageSlippageEstimate[],
  reportingAsset: ArbitrageAsset,
): number {
  return estimates.reduce((total, estimate, index) => {
    verifyReportingAsset(
      reportingAsset,
      estimate.reportingAsset,
      `slippageEstimates[${index}]`,
    );
    assertNonNegative(
      estimate.stressedSlippageValue,
      `slippageEstimates[${index}].stressedSlippageValue`,
    );

    return total + estimate.stressedSlippageValue;
  }, 0);
}

function aggregateCosts(
  request: ArbitrageProfitEstimationRequest,
  stressMultiplier: number,
): AggregatedCosts {
  const feeBreakdowns = request.feeBreakdowns ?? [];
  const slippageEstimates = request.slippageEstimates ?? [];
  const overrides = request.costOverrides;

  const totalFees =
    overrides?.totalFees ??
    sumFeeBreakdowns(feeBreakdowns, request.reportingAsset);

  const expectedSlippageCost =
    overrides?.expectedSlippageCost ??
    sumExpectedSlippage(
      slippageEstimates,
      request.reportingAsset,
    );

  const stressedSlippageCost =
    overrides?.stressedSlippageCost ??
    (
      slippageEstimates.length > 0
        ? sumStressedSlippage(
            slippageEstimates,
            request.reportingAsset,
          )
        : expectedSlippageCost * stressMultiplier
    );

  const expectedFinancingCost =
    overrides?.expectedFinancingCost ?? 0;
  const stressedFinancingCost =
    overrides?.stressedFinancingCost ??
    expectedFinancingCost * stressMultiplier;

  const expectedGasCost =
    overrides?.expectedGasCost ?? 0;
  const stressedGasCost =
    overrides?.stressedGasCost ??
    expectedGasCost * stressMultiplier;

  const expectedBridgeCost =
    overrides?.expectedBridgeCost ?? 0;
  const stressedBridgeCost =
    overrides?.stressedBridgeCost ??
    expectedBridgeCost * stressMultiplier;

  const values: Readonly<Record<string, number>> = {
    totalFees,
    expectedSlippageCost,
    stressedSlippageCost,
    expectedFinancingCost,
    stressedFinancingCost,
    expectedGasCost,
    stressedGasCost,
    expectedBridgeCost,
    stressedBridgeCost,
  };

  for (const [field, value] of Object.entries(values)) {
    assertNonNegative(value, field);
  }

  return deepFreeze({
    totalFees,
    expectedSlippageCost,
    stressedSlippageCost,
    expectedFinancingCost,
    stressedFinancingCost,
    expectedGasCost,
    stressedGasCost,
    expectedBridgeCost,
    stressedBridgeCost,
  });
}

function resolveAnnualizedReturn(
  netReturnPercentage: number,
  holdingPeriodMs: number | undefined,
  minimumHoldingPeriodMs: number,
): number | undefined {
  if (holdingPeriodMs === undefined) {
    return undefined;
  }

  if (
    !Number.isFinite(holdingPeriodMs) ||
    holdingPeriodMs < minimumHoldingPeriodMs
  ) {
    throw new ArbitrageProfitEngineError(
      "INVALID_HOLDING_PERIOD",
      `holdingPeriodMs must be at least ${minimumHoldingPeriodMs}.`,
    );
  }

  const holdingPeriodDays =
    holdingPeriodMs / MILLISECONDS_PER_DAY;

  return (
    netReturnPercentage *
    (DAYS_PER_YEAR / holdingPeriodDays)
  );
}

function calculateBreakEvenPriceMovementBps(
  totalExpectedCosts: number,
  investedCapital: number,
): number {
  if (investedCapital === 0) {
    return 0;
  }

  return (
    totalExpectedCosts /
    investedCapital *
    BASIS_POINTS_DIVISOR
  );
}

function resolveLegGrossProfit(
  request: ArbitrageLegProfitEstimationRequest,
): number {
  if (request.grossProfit !== undefined) {
    return request.grossProfit;
  }

  return (
    request.leg.expectedOutputQuantity -
    request.leg.inputQuantity
  );
}

function resolveOpportunityGrossProfit(
  request: ArbitrageOpportunityProfitEstimationRequest,
): number {
  const mode = request.grossProfitMode ?? "PROVIDED";

  switch (mode) {
    case "PROVIDED":
      if (request.grossProfit === undefined) {
        throw new ArbitrageProfitEngineError(
          "GROSS_PROFIT_UNAVAILABLE",
          "grossProfit is required when grossProfitMode is PROVIDED.",
        );
      }
      return request.grossProfit;

    case "LEG_OUTPUT_DELTA":
      return request.opportunity.legs.reduce(
        (total, leg) =>
          total +
          leg.expectedOutputQuantity -
          leg.inputQuantity,
        0,
      );

    case "TERMINAL_VALUE_DELTA":
      if (request.terminalValue === undefined) {
        throw new ArbitrageProfitEngineError(
          "GROSS_PROFIT_UNAVAILABLE",
          "terminalValue is required when grossProfitMode is TERMINAL_VALUE_DELTA.",
        );
      }

      return (
        request.terminalValue -
        (
          request.investedCapital ??
          request.opportunity.requestedCapital
        )
      );

    default: {
      const exhaustiveCheck: never = mode;
      throw new ArbitrageProfitEngineError(
        "INVALID_ARGUMENT",
        `Unsupported grossProfitMode: ${String(exhaustiveCheck)}.`,
      );
    }
  }
}

function collectOpportunityFeeBreakdowns(
  opportunity: InstitutionalArbitrageOpportunity,
): readonly ArbitrageFeeBreakdown[] {
  return Object.freeze(
    opportunity.legs.map((leg) => leg.feeEstimate),
  );
}

function collectOpportunitySlippageEstimates(
  opportunity: InstitutionalArbitrageOpportunity,
): readonly ArbitrageSlippageEstimate[] {
  return Object.freeze(
    opportunity.legs.map((leg) => leg.slippageEstimate),
  );
}

function deriveOpportunityCostOverrides(
  opportunity: InstitutionalArbitrageOpportunity,
  overrides: ArbitrageProfitCostOverrides | undefined,
): ArbitrageProfitCostOverrides {
  const gasFromLegs = opportunity.legs.reduce(
    (total, leg) => total + leg.feeEstimate.gasFee,
    0,
  );

  const bridgeFromLegs = opportunity.legs.reduce(
    (total, leg) => total + leg.feeEstimate.bridgeFee,
    0,
  );

  const financingFromLegs = opportunity.legs.reduce(
    (total, leg) =>
      total +
      leg.feeEstimate.fundingFee +
      leg.feeEstimate.borrowingFee,
    0,
  );

  return deepFreeze({
    ...overrides,
    expectedFinancingCost:
      overrides?.expectedFinancingCost ??
      financingFromLegs,
    expectedGasCost:
      overrides?.expectedGasCost ??
      gasFromLegs,
    expectedBridgeCost:
      overrides?.expectedBridgeCost ??
      bridgeFromLegs,
  });
}

export class ArbitrageProfitEngine {
  private readonly options: NormalizedOptions;

  public constructor(options?: ArbitrageProfitEngineOptions) {
    this.options = normalizeOptions(options);
  }

  public getOptions(): Readonly<NormalizedOptions> {
    return this.options;
  }

  public estimate(
    request: ArbitrageProfitEstimationRequest,
  ): ArbitrageProfitEstimate {
    assertReportingAsset(request.reportingAsset);
    assertNonNegative(
      request.investedCapital,
      "investedCapital",
    );
    assertFinite(request.grossProfit, "grossProfit");

    const decimalPlaces =
      request.decimalPlaces ?? this.options.decimalPlaces;
    const stressMultiplier =
      request.stressMultiplier ??
      this.options.defaultStressMultiplier;

    assertDecimalPlaces(decimalPlaces);
    assertNonNegative(stressMultiplier, "stressMultiplier");

    const costs = aggregateCosts(request, stressMultiplier);

    /*
     * totalFees contains all fee components. Financing, gas, and bridge
     * are exposed separately in ArbitrageProfitEstimate, but they are
     * subtracted only once. When totalFees is generated from complete
     * fee breakdowns, remove these three components from the generic fee
     * bucket before adding their dedicated cost fields.
     */
    const dedicatedExpectedCosts =
      costs.expectedFinancingCost +
      costs.expectedGasCost +
      costs.expectedBridgeCost;

    const genericExpectedFees = Math.max(
      0,
      costs.totalFees - dedicatedExpectedCosts,
    );

    const dedicatedStressedCosts =
      costs.stressedFinancingCost +
      costs.stressedGasCost +
      costs.stressedBridgeCost;

    const expectedTotalCosts =
      genericExpectedFees +
      costs.expectedSlippageCost +
      dedicatedExpectedCosts;

    const stressedTotalCosts =
      genericExpectedFees +
      costs.stressedSlippageCost +
      dedicatedStressedCosts;

    const expectedNetProfit =
      request.grossProfit - expectedTotalCosts;
    const stressedNetProfit =
      request.grossProfit - stressedTotalCosts;

    const grossReturnPercentage = percentage(
      request.grossProfit,
      request.investedCapital,
    );

    const netReturnPercentage = percentage(
      expectedNetProfit,
      request.investedCapital,
    );

    const annualizedReturnPercentage =
      resolveAnnualizedReturn(
        netReturnPercentage,
        request.holdingPeriodMs,
        this.options.minimumHoldingPeriodMs,
      );

    const breakEvenPriceMovementBps =
      calculateBreakEvenPriceMovementBps(
        expectedTotalCosts,
        request.investedCapital,
      );

    const estimate: ArbitrageProfitEstimate = {
      grossProfit: roundDeterministically(
        request.grossProfit,
        decimalPlaces,
      ),
      totalFees: roundDeterministically(
        costs.totalFees,
        decimalPlaces,
      ),
      expectedSlippageCost: roundDeterministically(
        costs.expectedSlippageCost,
        decimalPlaces,
      ),
      expectedFinancingCost: roundDeterministically(
        costs.expectedFinancingCost,
        decimalPlaces,
      ),
      expectedGasCost: roundDeterministically(
        costs.expectedGasCost,
        decimalPlaces,
      ),
      expectedBridgeCost: roundDeterministically(
        costs.expectedBridgeCost,
        decimalPlaces,
      ),
      expectedNetProfit: roundDeterministically(
        expectedNetProfit,
        decimalPlaces,
      ),
      stressedNetProfit: roundDeterministically(
        stressedNetProfit,
        decimalPlaces,
      ),
      grossReturnPercentage: roundDeterministically(
        grossReturnPercentage,
        decimalPlaces,
      ),
      netReturnPercentage: roundDeterministically(
        netReturnPercentage,
        decimalPlaces,
      ),
      ...(annualizedReturnPercentage === undefined
        ? {}
        : {
            annualizedReturnPercentage:
              roundDeterministically(
                annualizedReturnPercentage,
                decimalPlaces,
              ),
          }),
      breakEvenPriceMovementBps: roundDeterministically(
        breakEvenPriceMovementBps,
        decimalPlaces,
      ),
      reportingAsset: request.reportingAsset,
    };

    return deepFreeze(estimate);
  }

  public estimateLeg(
    request: ArbitrageLegProfitEstimationRequest,
  ): ArbitrageProfitEstimate {
    const investedCapital =
      request.investedCapital ??
      (
        request.leg.expectedPrice === undefined
          ? request.leg.inputQuantity
          : request.leg.inputQuantity *
            request.leg.expectedPrice
      );

    const grossProfit = resolveLegGrossProfit(request);

    const derivedOverrides: ArbitrageProfitCostOverrides = {
      ...request.costOverrides,
      expectedFinancingCost:
        request.costOverrides?.expectedFinancingCost ??
        (
          request.leg.feeEstimate.fundingFee +
          request.leg.feeEstimate.borrowingFee
        ),
      expectedGasCost:
        request.costOverrides?.expectedGasCost ??
        request.leg.feeEstimate.gasFee,
      expectedBridgeCost:
        request.costOverrides?.expectedBridgeCost ??
        request.leg.feeEstimate.bridgeFee,
    };

    return this.estimate({
      reportingAsset: request.reportingAsset,
      investedCapital,
      grossProfit,
      holdingPeriodMs: request.holdingPeriodMs,
      feeBreakdowns: [request.leg.feeEstimate],
      slippageEstimates: [request.leg.slippageEstimate],
      costOverrides: derivedOverrides,
      stressMultiplier: request.stressMultiplier,
      decimalPlaces: request.decimalPlaces,
    });
  }

  public estimateOpportunity(
    request: ArbitrageOpportunityProfitEstimationRequest,
  ): ArbitrageProfitEstimate {
    const validateOpportunity =
      request.validateOpportunity ??
      this.options.validateOpportunity;

    if (validateOpportunity) {
      assertInstitutionalArbitrageOpportunity(
        request.opportunity,
      );
    }

    const investedCapital =
      request.investedCapital ??
      request.opportunity.requestedCapital;

    const grossProfit =
      resolveOpportunityGrossProfit(request);

    return this.estimate({
      reportingAsset:
        request.opportunity.reportingAsset,
      investedCapital,
      grossProfit,
      holdingPeriodMs: request.holdingPeriodMs,
      feeBreakdowns:
        collectOpportunityFeeBreakdowns(
          request.opportunity,
        ),
      slippageEstimates:
        collectOpportunitySlippageEstimates(
          request.opportunity,
        ),
      costOverrides:
        deriveOpportunityCostOverrides(
          request.opportunity,
          request.costOverrides,
        ),
      stressMultiplier: request.stressMultiplier,
      decimalPlaces: request.decimalPlaces,
    });
  }

  public assessPolicy(
    estimate: ArbitrageProfitEstimate,
    policy: ArbitrageProfitThresholdPolicy,
  ): ArbitrageProfitPolicyAssessment {
    const minimumGrossProfit =
      policy.minimumGrossProfit ?? Number.NEGATIVE_INFINITY;
    const minimumExpectedNetProfit =
      policy.minimumExpectedNetProfit ??
      Number.NEGATIVE_INFINITY;
    const minimumStressedNetProfit =
      policy.minimumStressedNetProfit ??
      Number.NEGATIVE_INFINITY;
    const minimumGrossReturnPercentage =
      policy.minimumGrossReturnPercentage ??
      Number.NEGATIVE_INFINITY;
    const minimumNetReturnPercentage =
      policy.minimumNetReturnPercentage ??
      Number.NEGATIVE_INFINITY;
    const minimumAnnualizedReturnPercentage =
      policy.minimumAnnualizedReturnPercentage ??
      Number.NEGATIVE_INFINITY;
    const maximumBreakEvenPriceMovementBps =
      policy.maximumBreakEvenPriceMovementBps ??
      Number.POSITIVE_INFINITY;

    const finitePolicyValues: Readonly<
      Record<string, number | undefined>
    > = {
      minimumGrossProfit: policy.minimumGrossProfit,
      minimumExpectedNetProfit:
        policy.minimumExpectedNetProfit,
      minimumStressedNetProfit:
        policy.minimumStressedNetProfit,
      minimumGrossReturnPercentage:
        policy.minimumGrossReturnPercentage,
      minimumNetReturnPercentage:
        policy.minimumNetReturnPercentage,
      minimumAnnualizedReturnPercentage:
        policy.minimumAnnualizedReturnPercentage,
      maximumBreakEvenPriceMovementBps:
        policy.maximumBreakEvenPriceMovementBps,
    };

    for (const [field, value] of Object.entries(
      finitePolicyValues,
    )) {
      if (value !== undefined) {
        assertFinite(value, `policy.${field}`);
      }
    }

    const grossProfitAccepted =
      estimate.grossProfit >= minimumGrossProfit;
    const expectedNetProfitAccepted =
      estimate.expectedNetProfit >=
      minimumExpectedNetProfit;
    const stressedNetProfitAccepted =
      estimate.stressedNetProfit >=
      minimumStressedNetProfit;
    const grossReturnAccepted =
      estimate.grossReturnPercentage >=
      minimumGrossReturnPercentage;
    const netReturnAccepted =
      estimate.netReturnPercentage >=
      minimumNetReturnPercentage;
    const annualizedReturnAccepted =
      policy.minimumAnnualizedReturnPercentage === undefined ||
      (
        estimate.annualizedReturnPercentage !== undefined &&
        estimate.annualizedReturnPercentage >=
          minimumAnnualizedReturnPercentage
      );
    const breakEvenAccepted =
      estimate.breakEvenPriceMovementBps <=
      maximumBreakEvenPriceMovementBps;

    const reasons: string[] = [];

    if (!grossProfitAccepted) {
      reasons.push(
        `Gross profit ${estimate.grossProfit} is below minimum ${minimumGrossProfit}.`,
      );
    }

    if (!expectedNetProfitAccepted) {
      reasons.push(
        `Expected net profit ${estimate.expectedNetProfit} is below minimum ${minimumExpectedNetProfit}.`,
      );
    }

    if (!stressedNetProfitAccepted) {
      reasons.push(
        `Stressed net profit ${estimate.stressedNetProfit} is below minimum ${minimumStressedNetProfit}.`,
      );
    }

    if (!grossReturnAccepted) {
      reasons.push(
        `Gross return ${estimate.grossReturnPercentage}% is below minimum ${minimumGrossReturnPercentage}%.`,
      );
    }

    if (!netReturnAccepted) {
      reasons.push(
        `Net return ${estimate.netReturnPercentage}% is below minimum ${minimumNetReturnPercentage}%.`,
      );
    }

    if (!annualizedReturnAccepted) {
      reasons.push(
        estimate.annualizedReturnPercentage === undefined
          ? "Annualized return is unavailable because no holding period was supplied."
          : `Annualized return ${estimate.annualizedReturnPercentage}% is below minimum ${minimumAnnualizedReturnPercentage}%.`,
      );
    }

    if (!breakEvenAccepted) {
      reasons.push(
        `Break-even movement ${estimate.breakEvenPriceMovementBps} bps exceeds maximum ${maximumBreakEvenPriceMovementBps} bps.`,
      );
    }

    return deepFreeze({
      accepted:
        grossProfitAccepted &&
        expectedNetProfitAccepted &&
        stressedNetProfitAccepted &&
        grossReturnAccepted &&
        netReturnAccepted &&
        annualizedReturnAccepted &&
        breakEvenAccepted,
      grossProfitAccepted,
      expectedNetProfitAccepted,
      stressedNetProfitAccepted,
      grossReturnAccepted,
      netReturnAccepted,
      annualizedReturnAccepted,
      breakEvenAccepted,
      reasons,
    });
  }

  public runSensitivityAnalysis(
    request: ArbitrageProfitEstimationRequest,
    scenarios: readonly ArbitrageProfitSensitivityScenario[],
  ): readonly ArbitrageProfitSensitivityResult[] {
    const results = scenarios.map((scenario) => {
      assertPositive(
        scenario.grossProfitMultiplier ?? 1,
        `${scenario.scenarioId}.grossProfitMultiplier`,
      );
      assertNonNegative(
        scenario.feeMultiplier ?? 1,
        `${scenario.scenarioId}.feeMultiplier`,
      );
      assertNonNegative(
        scenario.slippageMultiplier ?? 1,
        `${scenario.scenarioId}.slippageMultiplier`,
      );
      assertNonNegative(
        scenario.financingMultiplier ?? 1,
        `${scenario.scenarioId}.financingMultiplier`,
      );
      assertNonNegative(
        scenario.gasMultiplier ?? 1,
        `${scenario.scenarioId}.gasMultiplier`,
      );
      assertNonNegative(
        scenario.bridgeMultiplier ?? 1,
        `${scenario.scenarioId}.bridgeMultiplier`,
      );

      const baseCosts = aggregateCosts(
        request,
        request.stressMultiplier ??
          this.options.defaultStressMultiplier,
      );

      const costOverrides: ArbitrageProfitCostOverrides = {
        totalFees:
          baseCosts.totalFees *
          (scenario.feeMultiplier ?? 1),
        expectedSlippageCost:
          baseCosts.expectedSlippageCost *
          (scenario.slippageMultiplier ?? 1),
        stressedSlippageCost:
          baseCosts.stressedSlippageCost *
          (scenario.slippageMultiplier ?? 1),
        expectedFinancingCost:
          baseCosts.expectedFinancingCost *
          (scenario.financingMultiplier ?? 1),
        stressedFinancingCost:
          baseCosts.stressedFinancingCost *
          (scenario.financingMultiplier ?? 1),
        expectedGasCost:
          baseCosts.expectedGasCost *
          (scenario.gasMultiplier ?? 1),
        stressedGasCost:
          baseCosts.stressedGasCost *
          (scenario.gasMultiplier ?? 1),
        expectedBridgeCost:
          baseCosts.expectedBridgeCost *
          (scenario.bridgeMultiplier ?? 1),
        stressedBridgeCost:
          baseCosts.stressedBridgeCost *
          (scenario.bridgeMultiplier ?? 1),
      };

      return deepFreeze({
        scenarioId: scenario.scenarioId,
        estimate: this.estimate({
          ...request,
          grossProfit:
            request.grossProfit *
            (scenario.grossProfitMultiplier ?? 1),
          feeBreakdowns: [],
          slippageEstimates: [],
          costOverrides,
        }),
      });
    });

    return deepFreeze(results);
  }

  public recalculateOpportunity(
    request: ArbitrageOpportunityProfitEstimationRequest,
  ): InstitutionalArbitrageOpportunity {
    const profitEstimate =
      this.estimateOpportunity(request);

    return deepFreeze({
      ...request.opportunity,
      profitEstimate,
      accountIds: [
        ...request.opportunity.accountIds,
      ],
      legs: [...request.opportunity.legs],
      transfers: [...request.opportunity.transfers],
      metadata: { ...request.opportunity.metadata },
    }) as InstitutionalArbitrageOpportunity;
  }
}

export function createArbitrageProfitEngine(
  options?: ArbitrageProfitEngineOptions,
): ArbitrageProfitEngine {
  return new ArbitrageProfitEngine(options);
}

export function estimateArbitrageProfit(
  request: ArbitrageProfitEstimationRequest,
  options?: ArbitrageProfitEngineOptions,
): ArbitrageProfitEstimate {
  return createArbitrageProfitEngine(options).estimate(
    request,
  );
}

export function estimateArbitrageLegProfit(
  request: ArbitrageLegProfitEstimationRequest,
  options?: ArbitrageProfitEngineOptions,
): ArbitrageProfitEstimate {
  return createArbitrageProfitEngine(options).estimateLeg(
    request,
  );
}

export function estimateArbitrageOpportunityProfit(
  request: ArbitrageOpportunityProfitEstimationRequest,
  options?: ArbitrageProfitEngineOptions,
): ArbitrageProfitEstimate {
  return createArbitrageProfitEngine(
    options,
  ).estimateOpportunity(request);
}