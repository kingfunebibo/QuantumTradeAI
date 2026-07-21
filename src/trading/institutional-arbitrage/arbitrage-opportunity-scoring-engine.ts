/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-opportunity-scoring-engine.ts
 *
 * Purpose:
 * Deterministic, immutable, policy-aware scoring of institutional arbitrage
 * opportunities across profitability, confidence, liquidity, execution,
 * latency, settlement, capital efficiency, diversification, and risk.
 */

import {
  type ArbitrageEvaluationPolicy,
  type ArbitrageId,
  type ArbitrageOpportunityScoreBreakdown,
  type ArbitrageRiskAssessment,
  type ArbitrageScore,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";
import { assertInstitutionalArbitrageOpportunity } from "./institutional-arbitrage-validator";

const MINIMUM_SCORE = 0;
const MAXIMUM_SCORE = 100;
const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;

export const ARBITRAGE_SCORE_COMPONENTS = [
  "profitabilityScore",
  "confidenceScore",
  "liquidityScore",
  "executionScore",
  "latencyScore",
  "settlementScore",
  "capitalEfficiencyScore",
  "diversificationScore",
  "riskAdjustedScore",
] as const;

export type ArbitrageScoreComponent =
  (typeof ARBITRAGE_SCORE_COMPONENTS)[number];

export interface ArbitrageOpportunityScoreWeights {
  readonly profitabilityScore: number;
  readonly confidenceScore: number;
  readonly liquidityScore: number;
  readonly executionScore: number;
  readonly latencyScore: number;
  readonly settlementScore: number;
  readonly capitalEfficiencyScore: number;
  readonly diversificationScore: number;
  readonly riskAdjustedScore: number;
}

export interface ArbitrageOpportunityScoringEngineOptions {
  readonly weights?: Partial<ArbitrageOpportunityScoreWeights>;
  readonly decimalPlaces?: number;
  readonly validateOpportunity?: boolean;
  readonly rejectBlockingRiskFindings?: boolean;
  readonly riskPenaltyMultiplier?: number;
  readonly insufficientLiquidityPenalty?: number;
  readonly expiredOpportunityScore?: number;
}

export interface ArbitragePortfolioDiversificationContext {
  readonly activeOpportunityTypeCounts?: Readonly<Record<string, number>>;
  readonly activeVenueCounts?: Readonly<Record<string, number>>;
  readonly activeAssetCounts?: Readonly<Record<string, number>>;
  readonly maximumPreferredTypeConcentration?: number;
  readonly maximumPreferredVenueConcentration?: number;
  readonly maximumPreferredAssetConcentration?: number;
}

export interface ArbitrageOpportunityScoringRequest {
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly riskAssessment: ArbitrageRiskAssessment;
  readonly policy?: ArbitrageEvaluationPolicy;
  readonly scoredAt: ArbitrageTimestamp;
  readonly diversificationContext?: ArbitragePortfolioDiversificationContext;
  readonly componentOverrides?: Partial<
    Readonly<Record<ArbitrageScoreComponent, ArbitrageScore>>
  >;
}

export interface ArbitrageOpportunityScoringDiagnostics {
  readonly opportunityId: ArbitrageId;
  readonly score: ArbitrageOpportunityScoreBreakdown;
  readonly weightedComponentContributions: Readonly<
    Record<ArbitrageScoreComponent, number>
  >;
  readonly penalties: readonly string[];
  readonly observations: readonly string[];
}

export interface ArbitrageOpportunityComparisonResult {
  readonly preferredOpportunityId: ArbitrageId;
  readonly secondaryOpportunityId: ArbitrageId;
  readonly scoreDifference: number;
  readonly reason: string;
}

export type ArbitrageOpportunityScoringErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_WEIGHT"
  | "INVALID_WEIGHT_TOTAL"
  | "INVALID_DECIMAL_PLACES"
  | "OPPORTUNITY_RISK_MISMATCH"
  | "INVALID_TIMESTAMP";

export class ArbitrageOpportunityScoringError extends Error {
  public readonly code: ArbitrageOpportunityScoringErrorCode;

  public constructor(
    code: ArbitrageOpportunityScoringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArbitrageOpportunityScoringError";
    this.code = code;
  }
}

interface NormalizedScoringOptions {
  readonly weights: ArbitrageOpportunityScoreWeights;
  readonly decimalPlaces: number;
  readonly validateOpportunity: boolean;
  readonly rejectBlockingRiskFindings: boolean;
  readonly riskPenaltyMultiplier: number;
  readonly insufficientLiquidityPenalty: number;
  readonly expiredOpportunityScore: number;
}

const DEFAULT_WEIGHTS: ArbitrageOpportunityScoreWeights = Object.freeze({
  profitabilityScore: 0.22,
  confidenceScore: 0.12,
  liquidityScore: 0.12,
  executionScore: 0.10,
  latencyScore: 0.10,
  settlementScore: 0.08,
  capitalEfficiencyScore: 0.10,
  diversificationScore: 0.06,
  riskAdjustedScore: 0.10,
});

const DEFAULT_OPTIONS: Omit<NormalizedScoringOptions, "weights"> =
  Object.freeze({
    decimalPlaces: DEFAULT_DECIMAL_PLACES,
    validateOpportunity: true,
    rejectBlockingRiskFindings: true,
    riskPenaltyMultiplier: 1,
    insufficientLiquidityPenalty: 20,
    expiredOpportunityScore: 0,
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
    throw new ArbitrageOpportunityScoringError(
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
    throw new ArbitrageOpportunityScoringError(
      "INVALID_ARGUMENT",
      `${field} must be greater than or equal to zero.`,
    );
  }
}

function assertTimestamp(
  value: number,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ArbitrageOpportunityScoringError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative integer timestamp.`,
    );
  }
}

function assertDecimalPlaces(decimalPlaces: number): void {
  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageOpportunityScoringError(
      "INVALID_DECIMAL_PLACES",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }
}

function clampScore(value: number): number {
  assertFinite(value, "score");
  return Math.min(MAXIMUM_SCORE, Math.max(MINIMUM_SCORE, value));
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

function normalizedRatio(
  value: number,
  target: number,
): number {
  if (target <= 0) {
    return value > 0 ? 1 : 0;
  }

  return Math.min(1, Math.max(0, value / target));
}

function inverseRatioScore(
  value: number,
  maximum: number,
): number {
  if (maximum <= 0) {
    return value <= 0 ? MAXIMUM_SCORE : MINIMUM_SCORE;
  }

  return clampScore(
    (1 - Math.min(1, Math.max(0, value / maximum))) *
      MAXIMUM_SCORE,
  );
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) /
    values.length;
}

function normalizeWeights(
  partial:
    | Partial<ArbitrageOpportunityScoreWeights>
    | undefined,
): ArbitrageOpportunityScoreWeights {
  const merged: ArbitrageOpportunityScoreWeights = {
    ...DEFAULT_WEIGHTS,
    ...(partial ?? {}),
  };

  let total = 0;

  for (const component of ARBITRAGE_SCORE_COMPONENTS) {
    const weight = merged[component];

    if (!Number.isFinite(weight) || weight < 0) {
      throw new ArbitrageOpportunityScoringError(
        "INVALID_WEIGHT",
        `weights.${component} must be a finite non-negative number.`,
      );
    }

    total += weight;
  }

  if (total <= 0) {
    throw new ArbitrageOpportunityScoringError(
      "INVALID_WEIGHT_TOTAL",
      "At least one scoring weight must be greater than zero.",
    );
  }

  const normalized = {} as Record<
    ArbitrageScoreComponent,
    number
  >;

  for (const component of ARBITRAGE_SCORE_COMPONENTS) {
    normalized[component] = merged[component] / total;
  }

  return deepFreeze(
    normalized as unknown as ArbitrageOpportunityScoreWeights,
  );
}

function normalizeOptions(
  options: ArbitrageOpportunityScoringEngineOptions | undefined,
): NormalizedScoringOptions {
  const expiredOpportunityScore = clampScore(
    options?.expiredOpportunityScore ??
      DEFAULT_OPTIONS.expiredOpportunityScore,
  );

  const normalized: NormalizedScoringOptions = {
    weights: normalizeWeights(options?.weights),
    decimalPlaces:
      options?.decimalPlaces ?? DEFAULT_OPTIONS.decimalPlaces,
    validateOpportunity:
      options?.validateOpportunity ??
      DEFAULT_OPTIONS.validateOpportunity,
    rejectBlockingRiskFindings:
      options?.rejectBlockingRiskFindings ??
      DEFAULT_OPTIONS.rejectBlockingRiskFindings,
    riskPenaltyMultiplier:
      options?.riskPenaltyMultiplier ??
      DEFAULT_OPTIONS.riskPenaltyMultiplier,
    insufficientLiquidityPenalty:
      options?.insufficientLiquidityPenalty ??
      DEFAULT_OPTIONS.insufficientLiquidityPenalty,
    expiredOpportunityScore,
  };

  assertDecimalPlaces(normalized.decimalPlaces);
  assertNonNegative(
    normalized.riskPenaltyMultiplier,
    "riskPenaltyMultiplier",
  );
  assertNonNegative(
    normalized.insufficientLiquidityPenalty,
    "insufficientLiquidityPenalty",
  );

  return deepFreeze(normalized);
}

function validateRequest(
  request: ArbitrageOpportunityScoringRequest,
  options: NormalizedScoringOptions,
): void {
  assertTimestamp(request.scoredAt, "scoredAt");

  if (options.validateOpportunity) {
    assertInstitutionalArbitrageOpportunity(
      request.opportunity,
      request.scoredAt,
    );
  }

  if (
    request.riskAssessment.opportunityId !==
    request.opportunity.opportunityId
  ) {
    throw new ArbitrageOpportunityScoringError(
      "OPPORTUNITY_RISK_MISMATCH",
      "riskAssessment.opportunityId must match opportunity.opportunityId.",
    );
  }

  if (
    request.componentOverrides !== undefined
  ) {
    for (const component of ARBITRAGE_SCORE_COMPONENTS) {
      const value =
        request.componentOverrides[component];

      if (value !== undefined) {
        assertFinite(
          value,
          `componentOverrides.${component}`,
        );
      }
    }
  }
}

function calculateProfitabilityScore(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy | undefined,
): number {
  const estimate = opportunity.profitEstimate;

  const netReturnTarget =
    policy?.minimumNetReturnPercentage ?? 0;
  const netProfitTarget =
    policy?.minimumNetProfit ?? 0;
  const grossProfitTarget =
    policy?.minimumGrossProfit ?? 0;

  const returnScore =
    netReturnTarget > 0
      ? normalizedRatio(
          estimate.netReturnPercentage,
          netReturnTarget * 2,
        ) * MAXIMUM_SCORE
      : clampScore(
          50 + estimate.netReturnPercentage * 10,
        );

  const netProfitScore =
    netProfitTarget > 0
      ? normalizedRatio(
          estimate.expectedNetProfit,
          netProfitTarget * 2,
        ) * MAXIMUM_SCORE
      : (
          estimate.expectedNetProfit > 0
            ? 75
            : estimate.expectedNetProfit === 0
              ? 50
              : 0
        );

  const grossProfitScore =
    grossProfitTarget > 0
      ? normalizedRatio(
          estimate.grossProfit,
          grossProfitTarget * 2,
        ) * MAXIMUM_SCORE
      : (
          estimate.grossProfit > 0
            ? 75
            : estimate.grossProfit === 0
              ? 50
              : 0
        );

  const stressedScore =
    estimate.stressedNetProfit > 0
      ? 100
      : estimate.stressedNetProfit === 0
        ? 50
        : 0;

  return clampScore(
    returnScore * 0.4 +
      netProfitScore * 0.3 +
      grossProfitScore * 0.15 +
      stressedScore * 0.15,
  );
}

function calculateConfidenceScore(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy | undefined,
): number {
  const confidence = opportunity.confidence;
  const minimumConfidence = policy?.minimumConfidence;

  if (minimumConfidence === undefined) {
    return clampScore(confidence);
  }

  if (minimumConfidence <= 0) {
    return clampScore(confidence);
  }

  const thresholdScore =
    normalizedRatio(
      confidence,
      minimumConfidence,
    ) * 70;

  const upsideScore =
    confidence > minimumConfidence
      ? normalizedRatio(
          confidence - minimumConfidence,
          Math.max(1, MAXIMUM_SCORE - minimumConfidence),
        ) * 30
      : 0;

  return clampScore(thresholdScore + upsideScore);
}

function calculateLiquidityScore(
  opportunity: InstitutionalArbitrageOpportunity,
  insufficientLiquidityPenalty: number,
): number {
  if (opportunity.legs.length === 0) {
    return 0;
  }

  const legScores = opportunity.legs.map((leg) => {
    const fillRatio =
      leg.liquidity.requestedQuantity > 0
        ? leg.liquidity.executableQuantity /
          leg.liquidity.requestedQuantity
        : 1;

    const utilizationScore =
      100 -
      clampScore(
        leg.liquidity.liquidityUtilizationPercentage,
      );

    const notionalRatio =
      leg.liquidity.requestedNotional > 0
        ? leg.liquidity.executableNotional /
          leg.liquidity.requestedNotional
        : 1;

    let score =
      clampScore(fillRatio * 100) * 0.55 +
      clampScore(notionalRatio * 100) * 0.30 +
      utilizationScore * 0.15;

    if (!leg.liquidity.sufficient) {
      score -= insufficientLiquidityPenalty;
    }

    return clampScore(score);
  });

  return clampScore(
    Math.min(...legScores) * 0.7 +
      average(legScores) * 0.3,
  );
}

function calculateExecutionScore(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy | undefined,
): number {
  if (opportunity.legs.length === 0) {
    return 0;
  }

  const legScores = opportunity.legs.map((leg) => {
    let score = 100;

    if (leg.requiresTransfer) {
      score -= 15;
    }

    if (leg.requiresBorrowing) {
      score -= 10;
    }

    if (leg.dependencyLegIds.length > 0) {
      score -= Math.min(
        20,
        leg.dependencyLegIds.length * 5,
      );
    }

    if (leg.orderType === undefined) {
      score -= 5;
    }

    if (leg.timeInForce === undefined) {
      score -= 5;
    }

    const maximumSlippage =
      policy?.maximumSlippageBps ??
      leg.slippageEstimate.maximumSlippageBps;

    if (
      maximumSlippage > 0 &&
      leg.slippageEstimate.expectedSlippageBps >
        maximumSlippage
    ) {
      score -= 25;
    }

    return clampScore(score);
  });

  const transferPenalty =
    Math.min(25, opportunity.transfers.length * 8);

  return clampScore(
    average(legScores) - transferPenalty,
  );
}

function calculateLatencyScore(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy | undefined,
): number {
  if (opportunity.legs.length === 0) {
    return 0;
  }

  const legScores = opportunity.legs.map((leg) => {
    const maximum =
      policy?.maximumExecutionLatencyMs ??
      leg.latency.maximumPermittedLatencyMs;

    const totalLatencyScore = inverseRatioScore(
      leg.latency.expectedTotalLatencyMs,
      maximum,
    );

    const marketDataScore =
      policy === undefined
        ? inverseRatioScore(
            leg.latency.marketDataAgeMs,
            leg.latency.maximumPermittedLatencyMs,
          )
        : inverseRatioScore(
            leg.latency.marketDataAgeMs,
            policy.maximumMarketDataAgeMs,
          );

    return clampScore(
      totalLatencyScore * 0.7 +
      marketDataScore * 0.3,
    );
  });

  return clampScore(
    Math.min(...legScores) * 0.6 +
      average(legScores) * 0.4,
  );
}

function calculateSettlementScore(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy | undefined,
): number {
  if (opportunity.transfers.length === 0) {
    const legSettlementLatency =
      opportunity.legs.map(
        (leg) =>
          leg.latency.expectedSettlementLatencyMs,
      );

    if (legSettlementLatency.length === 0) {
      return 100;
    }

    const maximum =
      policy?.maximumSettlementLatencyMs ??
      Math.max(
        1,
        ...opportunity.legs.map(
          (leg) =>
            leg.latency.maximumPermittedLatencyMs,
        ),
      );

    return inverseRatioScore(
      Math.max(...legSettlementLatency),
      maximum,
    );
  }

  const transferScores = opportunity.transfers.map(
    (transfer) => {
      const maximum =
        policy?.maximumSettlementLatencyMs ??
        transfer.maximumDurationMs;

      const durationScore = inverseRatioScore(
        transfer.expectedDurationMs,
        maximum,
      );

      const safetyMargin =
        transfer.maximumDurationMs > 0
          ? (
              transfer.maximumDurationMs -
              transfer.expectedDurationMs
            ) /
            transfer.maximumDurationMs
          : 0;

      return clampScore(
        durationScore * 0.75 +
        clampScore(safetyMargin * 100) * 0.25,
      );
    },
  );

  return clampScore(
    Math.min(...transferScores) * 0.7 +
      average(transferScores) * 0.3,
  );
}

function calculateCapitalEfficiencyScore(
  opportunity: InstitutionalArbitrageOpportunity,
  policy: ArbitrageEvaluationPolicy | undefined,
): number {
  if (opportunity.requestedCapital <= 0) {
    return 0;
  }

  const returnScore = clampScore(
    50 +
    opportunity.profitEstimate.netReturnPercentage * 10,
  );

  const capitalUsage =
    opportunity.maximumCapital > 0
      ? opportunity.requestedCapital /
        opportunity.maximumCapital
      : 1;

  const utilizationScore =
    clampScore(capitalUsage * 100);

  let policyScore = 100;

  if (
    policy !== undefined &&
    policy.maximumCapitalPerOpportunity > 0
  ) {
    policyScore = inverseRatioScore(
      opportunity.requestedCapital,
      policy.maximumCapitalPerOpportunity * 1.25,
    );
  }

  return clampScore(
    returnScore * 0.55 +
      utilizationScore * 0.25 +
      policyScore * 0.20,
  );
}

function concentrationScore(
  identifiers: readonly string[],
  counts: Readonly<Record<string, number>> | undefined,
  maximumPreferredConcentration: number | undefined,
): number {
  if (
    identifiers.length === 0 ||
    counts === undefined
  ) {
    return 100;
  }

  const maximumPreferred =
    maximumPreferredConcentration ?? 3;

  const scores = identifiers.map((identifier) => {
    const currentCount = counts[identifier] ?? 0;
    return inverseRatioScore(
      currentCount,
      maximumPreferred,
    );
  });

  return average(scores);
}

function collectVenueIds(
  opportunity: InstitutionalArbitrageOpportunity,
): readonly string[] {
  return Object.freeze(
    Array.from(
      new Set(
        opportunity.legs.map(
          (leg) => leg.venue.venueId,
        ),
      ),
    ).sort(),
  );
}

function collectAssets(
  opportunity: InstitutionalArbitrageOpportunity,
): readonly string[] {
  const assets = opportunity.legs.flatMap(
    (leg) => [leg.inputAsset, leg.outputAsset],
  );

  return Object.freeze(
    Array.from(new Set(assets)).sort(),
  );
}

function calculateDiversificationScore(
  opportunity: InstitutionalArbitrageOpportunity,
  context:
    | ArbitragePortfolioDiversificationContext
    | undefined,
): number {
  if (context === undefined) {
    return 100;
  }

  const typeScore = concentrationScore(
    [opportunity.type],
    context.activeOpportunityTypeCounts,
    context.maximumPreferredTypeConcentration,
  );

  const venueScore = concentrationScore(
    collectVenueIds(opportunity),
    context.activeVenueCounts,
    context.maximumPreferredVenueConcentration,
  );

  const assetScore = concentrationScore(
    collectAssets(opportunity),
    context.activeAssetCounts,
    context.maximumPreferredAssetConcentration,
  );

  return clampScore(
    typeScore * 0.35 +
      venueScore * 0.35 +
      assetScore * 0.30,
  );
}

function calculateRiskAdjustedScore(
  riskAssessment: ArbitrageRiskAssessment,
  riskPenaltyMultiplier: number,
  rejectBlockingRiskFindings: boolean,
): number {
  let score =
    MAXIMUM_SCORE -
    riskAssessment.overallRiskScore *
      riskPenaltyMultiplier;

  const blockingFindings =
    riskAssessment.findings.filter(
      (finding) => finding.blocking,
    );

  const nonBlockingPenalty =
    riskAssessment.findings
      .filter((finding) => !finding.blocking)
      .reduce(
        (total, finding) =>
          total + finding.score * 0.05,
        0,
      );

  score -= nonBlockingPenalty;

  if (!riskAssessment.approved) {
    score = Math.min(score, 25);
  }

  if (
    rejectBlockingRiskFindings &&
    blockingFindings.length > 0
  ) {
    score = 0;
  }

  return clampScore(score);
}

function overrideComponent(
  component: ArbitrageScoreComponent,
  calculated: number,
  overrides:
    | Partial<
        Readonly<
          Record<ArbitrageScoreComponent, ArbitrageScore>
        >
      >
    | undefined,
): number {
  const override = overrides?.[component];
  return clampScore(override ?? calculated);
}

function buildComponents(
  request: ArbitrageOpportunityScoringRequest,
  options: NormalizedScoringOptions,
): Readonly<
  Record<ArbitrageScoreComponent, number>
> {
  const opportunity = request.opportunity;

  return deepFreeze({
    profitabilityScore: overrideComponent(
      "profitabilityScore",
      calculateProfitabilityScore(
        opportunity,
        request.policy,
      ),
      request.componentOverrides,
    ),
    confidenceScore: overrideComponent(
      "confidenceScore",
      calculateConfidenceScore(
        opportunity,
        request.policy,
      ),
      request.componentOverrides,
    ),
    liquidityScore: overrideComponent(
      "liquidityScore",
      calculateLiquidityScore(
        opportunity,
        options.insufficientLiquidityPenalty,
      ),
      request.componentOverrides,
    ),
    executionScore: overrideComponent(
      "executionScore",
      calculateExecutionScore(
        opportunity,
        request.policy,
      ),
      request.componentOverrides,
    ),
    latencyScore: overrideComponent(
      "latencyScore",
      calculateLatencyScore(
        opportunity,
        request.policy,
      ),
      request.componentOverrides,
    ),
    settlementScore: overrideComponent(
      "settlementScore",
      calculateSettlementScore(
        opportunity,
        request.policy,
      ),
      request.componentOverrides,
    ),
    capitalEfficiencyScore: overrideComponent(
      "capitalEfficiencyScore",
      calculateCapitalEfficiencyScore(
        opportunity,
        request.policy,
      ),
      request.componentOverrides,
    ),
    diversificationScore: overrideComponent(
      "diversificationScore",
      calculateDiversificationScore(
        opportunity,
        request.diversificationContext,
      ),
      request.componentOverrides,
    ),
    riskAdjustedScore: overrideComponent(
      "riskAdjustedScore",
      calculateRiskAdjustedScore(
        request.riskAssessment,
        options.riskPenaltyMultiplier,
        options.rejectBlockingRiskFindings,
      ),
      request.componentOverrides,
    ),
  });
}

function calculateFinalScore(
  components: Readonly<
    Record<ArbitrageScoreComponent, number>
  >,
  weights: ArbitrageOpportunityScoreWeights,
): number {
  return ARBITRAGE_SCORE_COMPONENTS.reduce(
    (total, component) =>
      total + components[component] * weights[component],
    0,
  );
}

function buildDiagnostics(
  request: ArbitrageOpportunityScoringRequest,
  score: ArbitrageOpportunityScoreBreakdown,
  options: NormalizedScoringOptions,
): ArbitrageOpportunityScoringDiagnostics {
  const contributions = {} as Record<
    ArbitrageScoreComponent,
    number
  >;

  for (const component of ARBITRAGE_SCORE_COMPONENTS) {
    contributions[component] =
      score[component] * options.weights[component];
  }

  const penalties: string[] = [];
  const observations: string[] = [];

  if (request.scoredAt >= request.opportunity.expiresAt) {
    penalties.push("Opportunity is expired.");
  }

  if (!request.riskAssessment.approved) {
    penalties.push("Risk assessment is not approved.");
  }

  const blockingCount =
    request.riskAssessment.findings.filter(
      (finding) => finding.blocking,
    ).length;

  if (blockingCount > 0) {
    penalties.push(
      `${blockingCount} blocking risk finding(s) detected.`,
    );
  }

  const insufficientLegs =
    request.opportunity.legs.filter(
      (leg) => !leg.liquidity.sufficient,
    ).length;

  if (insufficientLegs > 0) {
    penalties.push(
      `${insufficientLegs} leg(s) have insufficient liquidity.`,
    );
  }

  observations.push(
    `Expected net profit: ${request.opportunity.profitEstimate.expectedNetProfit} ${request.opportunity.reportingAsset}.`,
  );
  observations.push(
    `Expected net return: ${request.opportunity.profitEstimate.netReturnPercentage}%.`,
  );
  observations.push(
    `Opportunity confidence: ${request.opportunity.confidence}.`,
  );
  observations.push(
    `Overall risk score: ${request.riskAssessment.overallRiskScore}.`,
  );

  return deepFreeze({
    opportunityId: request.opportunity.opportunityId,
    score,
    weightedComponentContributions: contributions,
    penalties,
    observations,
  });
}

export class ArbitrageOpportunityScoringEngine {
  private readonly options: NormalizedScoringOptions;

  public constructor(
    options?: ArbitrageOpportunityScoringEngineOptions,
  ) {
    this.options = normalizeOptions(options);
  }

  public getOptions(): Readonly<NormalizedScoringOptions> {
    return this.options;
  }

  public score(
    request: ArbitrageOpportunityScoringRequest,
  ): ArbitrageOpportunityScoreBreakdown {
    validateRequest(request, this.options);

    if (request.scoredAt >= request.opportunity.expiresAt) {
      const expiredScore =
        roundDeterministically(
          this.options.expiredOpportunityScore,
          this.options.decimalPlaces,
        );

      return deepFreeze({
        profitabilityScore: expiredScore,
        confidenceScore: expiredScore,
        liquidityScore: expiredScore,
        executionScore: expiredScore,
        latencyScore: expiredScore,
        settlementScore: expiredScore,
        capitalEfficiencyScore: expiredScore,
        diversificationScore: expiredScore,
        riskAdjustedScore: expiredScore,
        finalScore: expiredScore,
      });
    }

    const components = buildComponents(
      request,
      this.options,
    );

    const roundedComponents = {} as Record<
      ArbitrageScoreComponent,
      number
    >;

    for (const component of ARBITRAGE_SCORE_COMPONENTS) {
      roundedComponents[component] =
        roundDeterministically(
          components[component],
          this.options.decimalPlaces,
        );
    }

    let finalScore = calculateFinalScore(
      roundedComponents,
      this.options.weights,
    );

    if (
      this.options.rejectBlockingRiskFindings &&
      request.riskAssessment.findings.some(
        (finding) => finding.blocking,
      )
    ) {
      finalScore = 0;
    }

    return deepFreeze({
      ...roundedComponents,
      finalScore: roundDeterministically(
        clampScore(finalScore),
        this.options.decimalPlaces,
      ),
    } as ArbitrageOpportunityScoreBreakdown);
  }

  public scoreWithDiagnostics(
    request: ArbitrageOpportunityScoringRequest,
  ): ArbitrageOpportunityScoringDiagnostics {
    const score = this.score(request);

    return buildDiagnostics(
      request,
      score,
      this.options,
    );
  }

  public scoreBatch(
    requests: readonly ArbitrageOpportunityScoringRequest[],
  ): ReadonlyMap<
    ArbitrageId,
    ArbitrageOpportunityScoreBreakdown
  > {
    const entries = requests
      .map(
        (request) =>
          [
            request.opportunity.opportunityId,
            this.score(request),
          ] as const,
      )
      .sort(([left], [right]) =>
        left.localeCompare(right),
      );

    return new Map(entries);
  }

  public compare(
    primary: ArbitrageOpportunityScoringRequest,
    secondary: ArbitrageOpportunityScoringRequest,
  ): ArbitrageOpportunityComparisonResult {
    const primaryScore = this.score(primary);
    const secondaryScore = this.score(secondary);

    const primaryId =
      primary.opportunity.opportunityId;
    const secondaryId =
      secondary.opportunity.opportunityId;

    let preferredOpportunityId = primaryId;
    let secondaryOpportunityId = secondaryId;

    if (
      secondaryScore.finalScore >
        primaryScore.finalScore ||
      (
        secondaryScore.finalScore ===
          primaryScore.finalScore &&
        secondaryId.localeCompare(primaryId) < 0
      )
    ) {
      preferredOpportunityId = secondaryId;
      secondaryOpportunityId = primaryId;
    }

    const preferredScore =
      preferredOpportunityId === primaryId
        ? primaryScore
        : secondaryScore;

    const otherScore =
      preferredOpportunityId === primaryId
        ? secondaryScore
        : primaryScore;

    const difference = roundDeterministically(
      preferredScore.finalScore -
        otherScore.finalScore,
      this.options.decimalPlaces,
    );

    return deepFreeze({
      preferredOpportunityId,
      secondaryOpportunityId,
      scoreDifference: difference,
      reason:
        difference === 0
          ? "Scores are equal; deterministic opportunity-id ordering resolved the tie."
          : `${preferredOpportunityId} has the higher final score by ${difference}.`,
    });
  }
}

export function createArbitrageOpportunityScoringEngine(
  options?: ArbitrageOpportunityScoringEngineOptions,
): ArbitrageOpportunityScoringEngine {
  return new ArbitrageOpportunityScoringEngine(options);
}

export function scoreArbitrageOpportunity(
  request: ArbitrageOpportunityScoringRequest,
  options?: ArbitrageOpportunityScoringEngineOptions,
): ArbitrageOpportunityScoreBreakdown {
  return createArbitrageOpportunityScoringEngine(
    options,
  ).score(request);
}