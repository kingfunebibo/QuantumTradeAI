/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/regime-strategy-selector.ts
 *
 * Purpose:
 * Produces deterministic, immutable, and explainable regime-fitness assessments
 * for every strategy candidate. The selector blends the full regime probability
 * distribution, explicit compatibility declarations, conservative family priors,
 * performance evidence, operational state, and deterministic fallback behavior.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyFamily,
  type AiStrategyMarketRegime,
  type AiStrategyRegimeFitness,
  type AiStrategyRegimeProbability,
  type AiStrategyRegimeSelectorPort,
  type AiStrategyRegimeSnapshot,
} from "./ai-strategy-portfolio-contracts";

export interface RegimeStrategySelectorOptions {
  readonly explicitSupportScore?: number;
  readonly neutralCompatibilityScore?: number;
  readonly explicitExclusionScore?: number;
  readonly unknownRegimeScore?: number;
  readonly familyPriorWeight?: number;
  readonly explicitCompatibilityWeight?: number;
  readonly performanceEvidenceWeight?: number;
  readonly operationalHealthWeight?: number;
  readonly minimumHistoricalSampleSize?: number;
  readonly fullConfidenceSampleSize?: number;
  readonly stalePerformanceAfterMilliseconds?: number;
  readonly deterministicFallbackFloor?: number;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly explicitSupportScore: number;
  readonly neutralCompatibilityScore: number;
  readonly explicitExclusionScore: number;
  readonly unknownRegimeScore: number;
  readonly familyPriorWeight: number;
  readonly explicitCompatibilityWeight: number;
  readonly performanceEvidenceWeight: number;
  readonly operationalHealthWeight: number;
  readonly minimumHistoricalSampleSize: number;
  readonly fullConfidenceSampleSize: number;
  readonly stalePerformanceAfterMilliseconds: number;
  readonly deterministicFallbackFloor: number;
  readonly metadata: StrategyMetadata;
}

interface RegimeAssessment {
  readonly regime: AiStrategyMarketRegime;
  readonly probability: number;
  readonly compatibilityScore: number;
  readonly familyPriorScore: number;
  readonly blendedScore: number;
  readonly explicitlySupported: boolean;
  readonly explicitlyExcluded: boolean;
}

const DEFAULT_EXPLICIT_SUPPORT_SCORE = 1;
const DEFAULT_NEUTRAL_COMPATIBILITY_SCORE = 0.5;
const DEFAULT_EXPLICIT_EXCLUSION_SCORE = 0;
const DEFAULT_UNKNOWN_REGIME_SCORE = 0.4;
const DEFAULT_FAMILY_PRIOR_WEIGHT = 0.4;
const DEFAULT_EXPLICIT_COMPATIBILITY_WEIGHT = 0.6;
const DEFAULT_PERFORMANCE_EVIDENCE_WEIGHT = 0.2;
const DEFAULT_OPERATIONAL_HEALTH_WEIGHT = 0.1;
const DEFAULT_MINIMUM_HISTORICAL_SAMPLE_SIZE = 20;
const DEFAULT_FULL_CONFIDENCE_SAMPLE_SIZE = 200;
const DEFAULT_STALE_PERFORMANCE_AFTER_MILLISECONDS = 86_400_000;
const DEFAULT_DETERMINISTIC_FALLBACK_FLOOR = 0.35;
const EPSILON = 1e-12;

const ALL_REGIMES: readonly AiStrategyMarketRegime[] = Object.freeze([
  "STRONG_BULL_TREND",
  "WEAK_BULL_TREND",
  "STRONG_BEAR_TREND",
  "WEAK_BEAR_TREND",
  "SIDEWAYS_LOW_VOLATILITY",
  "SIDEWAYS_HIGH_VOLATILITY",
  "BREAKOUT_EXPANSION",
  "MEAN_REVERTING",
  "LIQUIDITY_STRESSED",
  "FUNDING_DISLOCATION",
  "BASIS_DISLOCATION",
  "EVENT_DRIVEN",
  "UNKNOWN",
]);

const FAMILY_REGIME_PRIORS: Readonly<
  Partial<Record<AiStrategyFamily, Partial<Record<AiStrategyMarketRegime, number>>>>
> = Object.freeze({
  TREND_FOLLOWING: Object.freeze({
    STRONG_BULL_TREND: 1,
    WEAK_BULL_TREND: 0.8,
    STRONG_BEAR_TREND: 1,
    WEAK_BEAR_TREND: 0.8,
    BREAKOUT_EXPANSION: 0.85,
    SIDEWAYS_LOW_VOLATILITY: 0.2,
    MEAN_REVERTING: 0.25,
  }),
  MOMENTUM: Object.freeze({
    STRONG_BULL_TREND: 0.95,
    WEAK_BULL_TREND: 0.75,
    STRONG_BEAR_TREND: 0.9,
    WEAK_BEAR_TREND: 0.7,
    BREAKOUT_EXPANSION: 1,
    SIDEWAYS_LOW_VOLATILITY: 0.2,
  }),
  MEAN_REVERSION: Object.freeze({
    MEAN_REVERTING: 1,
    SIDEWAYS_LOW_VOLATILITY: 0.9,
    SIDEWAYS_HIGH_VOLATILITY: 0.65,
    STRONG_BULL_TREND: 0.2,
    STRONG_BEAR_TREND: 0.2,
    BREAKOUT_EXPANSION: 0.25,
  }),
  BREAKOUT: Object.freeze({
    BREAKOUT_EXPANSION: 1,
    STRONG_BULL_TREND: 0.8,
    STRONG_BEAR_TREND: 0.8,
    SIDEWAYS_HIGH_VOLATILITY: 0.65,
    SIDEWAYS_LOW_VOLATILITY: 0.35,
  }),
  VOLUME_BASED: Object.freeze({
    BREAKOUT_EXPANSION: 0.85,
    EVENT_DRIVEN: 0.8,
    STRONG_BULL_TREND: 0.7,
    STRONG_BEAR_TREND: 0.7,
    LIQUIDITY_STRESSED: 0.25,
  }),
  GRID_TRADING: Object.freeze({
    SIDEWAYS_LOW_VOLATILITY: 1,
    MEAN_REVERTING: 0.9,
    SIDEWAYS_HIGH_VOLATILITY: 0.55,
    STRONG_BULL_TREND: 0.25,
    STRONG_BEAR_TREND: 0.2,
    BREAKOUT_EXPANSION: 0.2,
  }),
  MARKET_MAKING: Object.freeze({
    SIDEWAYS_LOW_VOLATILITY: 0.9,
    MEAN_REVERTING: 0.8,
    SIDEWAYS_HIGH_VOLATILITY: 0.55,
    LIQUIDITY_STRESSED: 0.15,
    EVENT_DRIVEN: 0.35,
  }),
  STATISTICAL_ARBITRAGE: Object.freeze({
    MEAN_REVERTING: 0.95,
    SIDEWAYS_LOW_VOLATILITY: 0.85,
    SIDEWAYS_HIGH_VOLATILITY: 0.7,
    LIQUIDITY_STRESSED: 0.3,
  }),
  CROSS_EXCHANGE_ARBITRAGE: Object.freeze({
    SIDEWAYS_HIGH_VOLATILITY: 0.8,
    LIQUIDITY_STRESSED: 0.7,
    EVENT_DRIVEN: 0.75,
    BREAKOUT_EXPANSION: 0.65,
  }),
  TRIANGULAR_ARBITRAGE: Object.freeze({
    SIDEWAYS_HIGH_VOLATILITY: 0.75,
    EVENT_DRIVEN: 0.7,
    LIQUIDITY_STRESSED: 0.45,
  }),
  FUNDING_RATE_ARBITRAGE: Object.freeze({
    FUNDING_DISLOCATION: 1,
    STRONG_BULL_TREND: 0.65,
    STRONG_BEAR_TREND: 0.65,
    EVENT_DRIVEN: 0.6,
  }),
  CASH_AND_CARRY: Object.freeze({
    BASIS_DISLOCATION: 1,
    FUNDING_DISLOCATION: 0.75,
    STRONG_BULL_TREND: 0.55,
    EVENT_DRIVEN: 0.55,
  }),
  STABLECOIN_ARBITRAGE: Object.freeze({
    LIQUIDITY_STRESSED: 0.95,
    EVENT_DRIVEN: 0.85,
    SIDEWAYS_HIGH_VOLATILITY: 0.65,
  }),
  CROSS_DEX_ARBITRAGE: Object.freeze({
    LIQUIDITY_STRESSED: 0.8,
    EVENT_DRIVEN: 0.8,
    SIDEWAYS_HIGH_VOLATILITY: 0.75,
  }),
  CROSS_CHAIN_ARBITRAGE: Object.freeze({
    LIQUIDITY_STRESSED: 0.75,
    EVENT_DRIVEN: 0.8,
    SIDEWAYS_HIGH_VOLATILITY: 0.7,
  }),
  OPTIONS_AND_DERIVATIVES: Object.freeze({
    SIDEWAYS_HIGH_VOLATILITY: 0.85,
    EVENT_DRIVEN: 0.85,
    STRONG_BULL_TREND: 0.7,
    STRONG_BEAR_TREND: 0.7,
    BREAKOUT_EXPANSION: 0.75,
  }),
  EXECUTION_ALGORITHM: Object.freeze({
    SIDEWAYS_LOW_VOLATILITY: 0.7,
    SIDEWAYS_HIGH_VOLATILITY: 0.7,
    STRONG_BULL_TREND: 0.7,
    STRONG_BEAR_TREND: 0.7,
    LIQUIDITY_STRESSED: 0.55,
  }),
  AI_NATIVE: Object.freeze({ UNKNOWN: 0.55 }),
  COMPOSITE: Object.freeze({ UNKNOWN: 0.6 }),
  CUSTOM: Object.freeze({ UNKNOWN: 0.5 }),
});

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (
    value < AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM ||
    value > AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM
  ) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function freezeMetadata(
  ...sources: readonly (StrategyMetadata | undefined)[]
): StrategyMetadata {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    if (source === undefined) continue;
    for (const [key, value] of Object.entries(source)) merged[key] = value;
  }
  return Object.freeze(merged) as StrategyMetadata;
}

function stableCandidateCompare(
  left: AiStrategyCandidate,
  right: AiStrategyCandidate,
): number {
  return (
    left.identity.candidateId.localeCompare(right.identity.candidateId) ||
    left.identity.strategyId.localeCompare(right.identity.strategyId) ||
    left.identity.strategyInstanceId.localeCompare(
      right.identity.strategyInstanceId,
    ) ||
    left.identity.strategyVersion.localeCompare(right.identity.strategyVersion)
  );
}

function isDeterministicFallback(candidate: AiStrategyCandidate): boolean {
  return (
    candidate.classification.intelligenceType === "DETERMINISTIC_RULE_BASED" ||
    candidate.classification.intelligenceType === "DETERMINISTIC_ARBITRAGE"
  );
}

function normalizeOptions(
  options: RegimeStrategySelectorOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = Object.freeze({
    explicitSupportScore:
      options.explicitSupportScore ?? DEFAULT_EXPLICIT_SUPPORT_SCORE,
    neutralCompatibilityScore:
      options.neutralCompatibilityScore ??
      DEFAULT_NEUTRAL_COMPATIBILITY_SCORE,
    explicitExclusionScore:
      options.explicitExclusionScore ?? DEFAULT_EXPLICIT_EXCLUSION_SCORE,
    unknownRegimeScore:
      options.unknownRegimeScore ?? DEFAULT_UNKNOWN_REGIME_SCORE,
    familyPriorWeight:
      options.familyPriorWeight ?? DEFAULT_FAMILY_PRIOR_WEIGHT,
    explicitCompatibilityWeight:
      options.explicitCompatibilityWeight ??
      DEFAULT_EXPLICIT_COMPATIBILITY_WEIGHT,
    performanceEvidenceWeight:
      options.performanceEvidenceWeight ?? DEFAULT_PERFORMANCE_EVIDENCE_WEIGHT,
    operationalHealthWeight:
      options.operationalHealthWeight ?? DEFAULT_OPERATIONAL_HEALTH_WEIGHT,
    minimumHistoricalSampleSize:
      options.minimumHistoricalSampleSize ??
      DEFAULT_MINIMUM_HISTORICAL_SAMPLE_SIZE,
    fullConfidenceSampleSize:
      options.fullConfidenceSampleSize ?? DEFAULT_FULL_CONFIDENCE_SAMPLE_SIZE,
    stalePerformanceAfterMilliseconds:
      options.stalePerformanceAfterMilliseconds ??
      DEFAULT_STALE_PERFORMANCE_AFTER_MILLISECONDS,
    deterministicFallbackFloor:
      options.deterministicFallbackFloor ??
      DEFAULT_DETERMINISTIC_FALLBACK_FLOOR,
    metadata: freezeMetadata(EMPTY_STRATEGY_METADATA, options.metadata),
  });

  assertUnitInterval(normalized.explicitSupportScore, "explicitSupportScore");
  assertUnitInterval(
    normalized.neutralCompatibilityScore,
    "neutralCompatibilityScore",
  );
  assertUnitInterval(
    normalized.explicitExclusionScore,
    "explicitExclusionScore",
  );
  assertUnitInterval(normalized.unknownRegimeScore, "unknownRegimeScore");
  assertUnitInterval(normalized.familyPriorWeight, "familyPriorWeight");
  assertUnitInterval(
    normalized.explicitCompatibilityWeight,
    "explicitCompatibilityWeight",
  );
  assertUnitInterval(
    normalized.performanceEvidenceWeight,
    "performanceEvidenceWeight",
  );
  assertUnitInterval(
    normalized.operationalHealthWeight,
    "operationalHealthWeight",
  );
  assertNonNegativeInteger(
    normalized.minimumHistoricalSampleSize,
    "minimumHistoricalSampleSize",
  );
  assertNonNegativeInteger(
    normalized.fullConfidenceSampleSize,
    "fullConfidenceSampleSize",
  );
  assertNonNegativeInteger(
    normalized.stalePerformanceAfterMilliseconds,
    "stalePerformanceAfterMilliseconds",
  );
  assertUnitInterval(
    normalized.deterministicFallbackFloor,
    "deterministicFallbackFloor",
  );

  if (normalized.fullConfidenceSampleSize < normalized.minimumHistoricalSampleSize) {
    throw new Error(
      "fullConfidenceSampleSize must be greater than or equal to minimumHistoricalSampleSize.",
    );
  }

  const mainWeightTotal =
    normalized.familyPriorWeight + normalized.explicitCompatibilityWeight;
  if (mainWeightTotal <= EPSILON) {
    throw new Error(
      "familyPriorWeight and explicitCompatibilityWeight cannot both be zero.",
    );
  }

  if (
    normalized.performanceEvidenceWeight +
      normalized.operationalHealthWeight >=
    1
  ) {
    throw new Error(
      "performanceEvidenceWeight plus operationalHealthWeight must be less than 1.",
    );
  }

  return normalized;
}

function validateRegimeSnapshot(regime: AiStrategyRegimeSnapshot): void {
  if (regime.regimeId.trim().length === 0) {
    throw new Error("regime.regimeId cannot be empty.");
  }
  if (!Number.isInteger(regime.timestamp) || regime.timestamp < 0) {
    throw new Error("regime.timestamp must be a non-negative integer.");
  }
  assertUnitInterval(regime.confidence, "regime.confidence");
  assertUnitInterval(regime.volatilityScore, "regime.volatilityScore");
  assertUnitInterval(regime.trendScore, "regime.trendScore");
  assertUnitInterval(regime.liquidityScore, "regime.liquidityScore");
  assertUnitInterval(regime.stressScore, "regime.stressScore");
  if (regime.source.trim().length === 0) {
    throw new Error("regime.source cannot be empty.");
  }
  if (regime.probabilities.length === 0) {
    throw new Error("regime.probabilities must contain at least one entry.");
  }

  const seen = new Set<AiStrategyMarketRegime>();
  for (const [index, probability] of regime.probabilities.entries()) {
    assertUnitInterval(
      probability.probability,
      `regime.probabilities[${index}].probability`,
    );
    if (seen.has(probability.regime)) {
      throw new Error(
        `regime.probabilities contains duplicate regime ${probability.regime}.`,
      );
    }
    seen.add(probability.regime);
  }
}

function normalizedProbabilities(
  snapshot: AiStrategyRegimeSnapshot,
): readonly AiStrategyRegimeProbability[] {
  const byRegime = new Map<AiStrategyMarketRegime, number>();
  for (const entry of snapshot.probabilities) {
    byRegime.set(entry.regime, entry.probability);
  }

  if (!byRegime.has(snapshot.primaryRegime)) {
    byRegime.set(snapshot.primaryRegime, snapshot.confidence);
  }

  const total = [...byRegime.values()].reduce((sum, value) => sum + value, 0);
  if (total <= EPSILON) {
    return Object.freeze([
      Object.freeze({
        regime: snapshot.primaryRegime,
        probability: 1,
      }),
    ]);
  }

  return Object.freeze(
    ALL_REGIMES.filter((regime) => byRegime.has(regime)).map((regime) =>
      Object.freeze({
        regime,
        probability: round((byRegime.get(regime) ?? 0) / total),
      }),
    ),
  );
}

function familyPrior(
  family: AiStrategyFamily,
  regime: AiStrategyMarketRegime,
  unknownScore: number,
): number {
  const familyMap = FAMILY_REGIME_PRIORS[family];
  const explicit = familyMap?.[regime];
  if (explicit !== undefined) return explicit;
  if (regime === "UNKNOWN") return familyMap?.UNKNOWN ?? unknownScore;
  return 0.5;
}

function explicitCompatibility(
  candidate: AiStrategyCandidate,
  regime: AiStrategyMarketRegime,
  options: NormalizedOptions,
): {
  readonly score: number;
  readonly explicitlySupported: boolean;
  readonly explicitlyExcluded: boolean;
} {
  const excluded = candidate.compatibility.excludedRegimes.includes(regime);
  if (excluded) {
    return Object.freeze({
      score: options.explicitExclusionScore,
      explicitlySupported: false,
      explicitlyExcluded: true,
    });
  }

  const supported = candidate.compatibility.supportedRegimes.includes(regime);
  if (supported) {
    return Object.freeze({
      score: options.explicitSupportScore,
      explicitlySupported: true,
      explicitlyExcluded: false,
    });
  }

  if (regime === "UNKNOWN") {
    return Object.freeze({
      score: options.unknownRegimeScore,
      explicitlySupported: false,
      explicitlyExcluded: false,
    });
  }

  return Object.freeze({
    score: options.neutralCompatibilityScore,
    explicitlySupported: false,
    explicitlyExcluded: false,
  });
}

function assessRegime(
  candidate: AiStrategyCandidate,
  probability: AiStrategyRegimeProbability,
  options: NormalizedOptions,
): RegimeAssessment {
  const compatibility = explicitCompatibility(
    candidate,
    probability.regime,
    options,
  );
  const prior = familyPrior(
    candidate.classification.family,
    probability.regime,
    options.unknownRegimeScore,
  );
  const denominator =
    options.familyPriorWeight + options.explicitCompatibilityWeight;
  const blended =
    denominator <= EPSILON
      ? 0
      : (prior * options.familyPriorWeight +
          compatibility.score * options.explicitCompatibilityWeight) /
        denominator;

  return Object.freeze({
    regime: probability.regime,
    probability: probability.probability,
    compatibilityScore: round(compatibility.score),
    familyPriorScore: round(prior),
    blendedScore: round(clampUnit(blended)),
    explicitlySupported: compatibility.explicitlySupported,
    explicitlyExcluded: compatibility.explicitlyExcluded,
  });
}

function performanceEvidence(candidate: AiStrategyCandidate): number {
  const performance = candidate.performance;
  const components: number[] = [];

  if (performance.winRate !== undefined) {
    components.push(clampUnit(performance.winRate));
  }
  if (performance.profitFactor !== undefined) {
    components.push(clampUnit(performance.profitFactor / 2));
  }
  if (performance.sharpeRatio !== undefined) {
    components.push(clampUnit((performance.sharpeRatio + 1) / 3));
  }
  if (performance.sortinoRatio !== undefined) {
    components.push(clampUnit((performance.sortinoRatio + 1) / 4));
  }
  if (performance.maximumDrawdown !== undefined) {
    components.push(clampUnit(1 - Math.abs(performance.maximumDrawdown)));
  }
  if (performance.realizedPnl !== undefined) {
    components.push(performance.realizedPnl > 0 ? 0.75 : performance.realizedPnl < 0 ? 0.25 : 0.5);
  }

  if (components.length === 0) return 0.5;
  return round(components.reduce((sum, value) => sum + value, 0) / components.length);
}

function operationalHealth(candidate: AiStrategyCandidate): number {
  switch (candidate.status) {
    case "SELECTED":
    case "ELIGIBLE":
      return 1;
    case "RESERVE":
      return 0.9;
    case "DISCOVERED":
      return 0.7;
    case "INELIGIBLE":
      return 0.2;
    case "SUSPENDED":
      return 0.1;
    case "DISABLED":
      return 0;
    default:
      return 0.5;
  }
}

function historicalSampleSize(candidate: AiStrategyCandidate): number {
  return Math.max(
    0,
    candidate.performance.totalTrades ?? candidate.performance.totalEvaluations,
  );
}

function sampleConfidence(sampleSize: number, options: NormalizedOptions): number {
  if (options.fullConfidenceSampleSize === 0) return 1;
  return clampUnit(sampleSize / options.fullConfidenceSampleSize);
}

function freshnessConfidence(
  candidate: AiStrategyCandidate,
  timestamp: UnixTimestampMilliseconds,
  options: NormalizedOptions,
): number {
  const observedAt =
    candidate.lastEvaluatedAt ??
    candidate.performance.timestamp ??
    candidate.discoveredAt;
  if (observedAt > timestamp) return 0;
  if (options.stalePerformanceAfterMilliseconds === 0) return 1;
  const age = timestamp - observedAt;
  return clampUnit(1 - age / options.stalePerformanceAfterMilliseconds);
}

function calculateExpectedReturn(candidate: AiStrategyCandidate): number | undefined {
  const pnl = candidate.performance.realizedPnl;
  const trades = candidate.performance.totalTrades;
  if (pnl === undefined || trades === undefined || trades <= 0) return undefined;
  return round(pnl / trades);
}

function calculateExpectedVolatility(
  candidate: AiStrategyCandidate,
): number | undefined {
  const sharpe = candidate.performance.sharpeRatio;
  const pnl = candidate.performance.realizedPnl;
  if (sharpe === undefined || pnl === undefined || Math.abs(sharpe) <= EPSILON) {
    return undefined;
  }
  return round(Math.abs(pnl / sharpe));
}

function createReasons(
  candidate: AiStrategyCandidate,
  snapshot: AiStrategyRegimeSnapshot,
  assessments: readonly RegimeAssessment[],
  fitnessScore: number,
  confidence: number,
  sampleSize: number,
  options: NormalizedOptions,
): readonly string[] {
  const reasons: string[] = [];
  const primary = assessments.find(
    (assessment) => assessment.regime === snapshot.primaryRegime,
  );
  const excludedProbability = assessments
    .filter((assessment) => assessment.explicitlyExcluded)
    .reduce((sum, assessment) => sum + assessment.probability, 0);
  const supportedProbability = assessments
    .filter((assessment) => assessment.explicitlySupported)
    .reduce((sum, assessment) => sum + assessment.probability, 0);

  reasons.push(
    `Probability-weighted regime fitness is ${fitnessScore.toFixed(6)} for primary regime ${snapshot.primaryRegime}.`,
  );

  if (primary?.explicitlySupported) {
    reasons.push(`The strategy explicitly supports ${snapshot.primaryRegime}.`);
  } else if (primary?.explicitlyExcluded) {
    reasons.push(`The strategy explicitly excludes ${snapshot.primaryRegime}.`);
  } else {
    reasons.push(
      `No explicit primary-regime declaration was provided; family priors and neutral compatibility were applied.`,
    );
  }

  if (supportedProbability > EPSILON) {
    reasons.push(
      `${round(supportedProbability * 100).toFixed(4)}% of regime probability mass is explicitly supported.`,
    );
  }
  if (excludedProbability > EPSILON) {
    reasons.push(
      `${round(excludedProbability * 100).toFixed(4)}% of regime probability mass is explicitly excluded.`,
    );
  }
  if (sampleSize < options.minimumHistoricalSampleSize) {
    reasons.push(
      `Historical sample size ${sampleSize} is below the preferred minimum ${options.minimumHistoricalSampleSize}.`,
    );
  }
  if (isDeterministicFallback(candidate)) {
    reasons.push(
      `Deterministic fallback protection applies with floor ${options.deterministicFallbackFloor.toFixed(6)}.`,
    );
  }
  if (candidate.status === "SUSPENDED" || candidate.status === "DISABLED") {
    reasons.push(`Operational status ${candidate.status} materially reduces fitness.`);
  }
  reasons.push(`Assessment confidence is ${confidence.toFixed(6)}.`);

  return freezeStrings(reasons);
}

function assessCandidate(
  candidate: AiStrategyCandidate,
  snapshot: AiStrategyRegimeSnapshot,
  probabilities: readonly AiStrategyRegimeProbability[],
  timestamp: UnixTimestampMilliseconds,
  options: NormalizedOptions,
): AiStrategyRegimeFitness {
  const assessments = Object.freeze(
    probabilities.map((probability) =>
      assessRegime(candidate, probability, options),
    ),
  );

  const probabilityWeightedCompatibility = assessments.reduce(
    (sum, assessment) =>
      sum + assessment.probability * assessment.blendedScore,
    0,
  );
  const performance = performanceEvidence(candidate);
  const health = operationalHealth(candidate);
  const baseWeight =
    1 - options.performanceEvidenceWeight - options.operationalHealthWeight;

  let fitness =
    probabilityWeightedCompatibility * baseWeight +
    performance * options.performanceEvidenceWeight +
    health * options.operationalHealthWeight;

  const excludedProbability = assessments
    .filter((assessment) => assessment.explicitlyExcluded)
    .reduce((sum, assessment) => sum + assessment.probability, 0);
  fitness *= 1 - excludedProbability;

  if (candidate.status === "SUSPENDED") fitness *= 0.25;
  if (candidate.status === "DISABLED") fitness = 0;
  if (candidate.status === "INELIGIBLE") fitness *= 0.5;
  if (isDeterministicFallback(candidate) && candidate.status !== "DISABLED") {
    fitness = Math.max(fitness, options.deterministicFallbackFloor);
  }

  const sampleSize = historicalSampleSize(candidate);
  const dataConfidence = sampleConfidence(sampleSize, options);
  const freshness = freshnessConfidence(candidate, timestamp, options);
  const distributionConfidence = clampUnit(
    snapshot.confidence * 0.75 +
      Math.max(...probabilities.map((entry) => entry.probability)) * 0.25,
  );
  const declarationConfidence =
    candidate.compatibility.supportedRegimes.length +
      candidate.compatibility.excludedRegimes.length >
    0
      ? 1
      : 0.65;
  const confidence = round(
    clampUnit(
      distributionConfidence * 0.45 +
        dataConfidence * 0.25 +
        freshness * 0.2 +
        declarationConfidence * 0.1,
    ),
  );
  const finalFitness = round(clampUnit(fitness));

  return Object.freeze({
    candidateId: candidate.identity.candidateId,
    regime: snapshot.primaryRegime,
    fitnessScore: finalFitness,
    confidence,
    historicalSampleSize: sampleSize,
    expectedReturn: calculateExpectedReturn(candidate),
    expectedVolatility: calculateExpectedVolatility(candidate),
    expectedDrawdown:
      candidate.performance.maximumDrawdown === undefined
        ? undefined
        : round(Math.abs(candidate.performance.maximumDrawdown)),
    reasons: createReasons(
      candidate,
      snapshot,
      assessments,
      finalFitness,
      confidence,
      sampleSize,
      options,
    ),
    metadata: freezeMetadata(
      options.metadata,
      candidate.metadata,
      snapshot.metadata,
      {
        regimeId: snapshot.regimeId,
        regimeSource: snapshot.source,
        regimeTimestamp: snapshot.timestamp,
        assessedAt: timestamp,
        family: candidate.classification.family,
        intelligenceType: candidate.classification.intelligenceType,
        automationLevel: candidate.classification.automationLevel,
        probabilityWeightedCompatibility: round(
          probabilityWeightedCompatibility,
        ),
        performanceEvidence: performance,
        operationalHealth: health,
        excludedProbability: round(excludedProbability),
        normalizedProbabilities: probabilities,
        regimeAssessments: assessments,
      } as unknown as StrategyMetadata,
    ),
  });
}

export class RegimeStrategySelector implements AiStrategyRegimeSelectorPort {
  private readonly options: NormalizedOptions;

  public constructor(options: RegimeStrategySelectorOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public assess(
    candidates: readonly AiStrategyCandidate[],
    regime: AiStrategyRegimeSnapshot,
    timestamp: UnixTimestampMilliseconds,
  ): readonly AiStrategyRegimeFitness[] {
    if (!Number.isInteger(timestamp) || timestamp < 0) {
      throw new Error("timestamp must be a non-negative integer.");
    }
    validateRegimeSnapshot(regime);
    if (regime.timestamp > timestamp) {
      throw new Error("regime.timestamp cannot be later than assessment timestamp.");
    }

    const candidateIds = new Set<AiStrategyCandidateId>();
    for (const candidate of candidates) {
      const candidateId = candidate.identity.candidateId;
      if (candidateId.trim().length === 0) {
        throw new Error("candidate.identity.candidateId cannot be empty.");
      }
      if (candidateIds.has(candidateId)) {
        throw new Error(`Duplicate candidateId ${candidateId}.`);
      }
      candidateIds.add(candidateId);
    }

    const probabilities = normalizedProbabilities(regime);
    const orderedCandidates = [...candidates].sort(stableCandidateCompare);
    const assessments = orderedCandidates.map((candidate) =>
      assessCandidate(candidate, regime, probabilities, timestamp, this.options),
    );

    return Object.freeze(assessments);
  }
}

export function createRegimeStrategySelector(
  options: RegimeStrategySelectorOptions = {},
): RegimeStrategySelector {
  return new RegimeStrategySelector(options);
}
