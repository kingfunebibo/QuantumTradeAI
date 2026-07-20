/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 5:
 * src/trading/ai-meta-learning/performance-pattern-miner.ts
 *
 * Deterministic production-grade performance pattern miner.
 */

import {
  type ExtractedFeature,
  type MarketRegime,
  type MetaLearningNumericRange,
  type PatternConfidenceBand,
  type PatternDirection,
  type PatternMiningRequest,
  type PatternMiningResult,
  type PerformancePattern,
  type PerformancePatternMinerPort,
  type StrategyFeatureVector,
  type StrategyPerformanceObservation,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;

interface PatternCandidate {
  readonly strategyId: string;
  readonly regime: MarketRegime;
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly featureVectors: readonly StrategyFeatureVector[];
  readonly direction: PatternDirection;
  readonly confidence: number;
  readonly support: number;
  readonly sampleSize: number;
  readonly expectedImpact: number;
  readonly stabilityScore: number;
  readonly featureConditions: Readonly<Record<string, MetaLearningNumericRange>>;
  readonly evidenceObservationIds: readonly string[];
}

interface ObservationStatistics {
  readonly sampleSize: number;
  readonly weightedReturn: number;
  readonly weightedExpectancy: number;
  readonly weightedSharpe: number;
  readonly weightedDrawdown: number;
  readonly weightedTailLoss: number;
  readonly profitableRate: number;
  readonly returnStandardDeviation: number;
}

export interface PerformancePatternMinerOptions {
  readonly maximumFeatureConditions?: number;
  readonly positiveImpactThreshold?: number;
  readonly negativeImpactThreshold?: number;
  readonly mixedDirectionTolerance?: number;
}

export class PerformancePatternMinerError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "PERFORMANCE_PATTERN_MINER_ERROR",
  ) {
    super(message);
    this.name = "PerformancePatternMinerError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PerformancePatternMiner
  implements PerformancePatternMinerPort
{
  private readonly maximumFeatureConditions: number;
  private readonly positiveImpactThreshold: number;
  private readonly negativeImpactThreshold: number;
  private readonly mixedDirectionTolerance: number;

  public constructor(options: PerformancePatternMinerOptions = {}) {
    this.maximumFeatureConditions = Math.max(
      1,
      Math.trunc(options.maximumFeatureConditions ?? 8),
    );
    this.positiveImpactThreshold =
      options.positiveImpactThreshold ?? 0.01;
    this.negativeImpactThreshold =
      options.negativeImpactThreshold ?? -0.01;
    this.mixedDirectionTolerance = Math.max(
      0,
      options.mixedDirectionTolerance ?? 0.35,
    );
  }

  public mine(request: PatternMiningRequest): PatternMiningResult {
    this.assertRequest(request);

    const observationById = new Map(
      request.observations.map((observation) => [
        observation.observationId,
        observation,
      ]),
    );

    const warnings: string[] = [];
    const grouped = new Map<string, {
      readonly strategyId: string;
      readonly regime: MarketRegime;
      observations: StrategyPerformanceObservation[];
      featureVectors: StrategyFeatureVector[];
    }>();

    for (const observation of request.observations) {
      const key = groupKey(observation.strategyId, observation.regime);
      const existing = grouped.get(key);

      if (existing) {
        existing.observations.push(observation);
      } else {
        grouped.set(key, {
          strategyId: observation.strategyId,
          regime: observation.regime,
          observations: [observation],
          featureVectors: [],
        });
      }
    }

    for (const vector of request.featureVectors) {
      if (!vector.observationId) {
        warnings.push(
          `Feature vector '${vector.featureVectorId}' has no observationId and was ignored.`,
        );
        continue;
      }

      const observation = observationById.get(vector.observationId);

      if (!observation) {
        warnings.push(
          `Feature vector '${vector.featureVectorId}' references unknown observation '${vector.observationId}'.`,
        );
        continue;
      }

      if (
        observation.strategyId !== vector.strategyId ||
        observation.regime !== vector.regime
      ) {
        warnings.push(
          `Feature vector '${vector.featureVectorId}' does not match its referenced observation and was ignored.`,
        );
        continue;
      }

      const key = groupKey(vector.strategyId, vector.regime);
      grouped.get(key)?.featureVectors.push(vector);
    }

    const totalSampleSize = request.observations.reduce(
      (total, observation) => total + observation.sampleSize,
      0,
    );

    const candidates = Array.from(grouped.values())
      .map((group) =>
        this.createCandidate(
          group.strategyId,
          group.regime,
          group.observations,
          group.featureVectors,
          totalSampleSize,
        ),
      )
      .sort(compareCandidates);

    const accepted: PerformancePattern[] = [];
    let rejectedPatternCount = 0;

    for (const candidate of candidates) {
      if (
        candidate.sampleSize < request.minimumSampleSize ||
        candidate.support < request.minimumSupport ||
        candidate.confidence < request.minimumConfidence
      ) {
        rejectedPatternCount += 1;
        continue;
      }

      if (accepted.length >= request.maximumPatterns) {
        rejectedPatternCount += 1;
        continue;
      }

      accepted.push(
        this.toPattern(
          request,
          candidate,
          accepted.length + 1,
        ),
      );
    }

    if (request.observations.length === 0) {
      warnings.push("No performance observations were supplied.");
    }

    if (accepted.length === 0 && request.observations.length > 0) {
      warnings.push(
        "No performance patterns satisfied the configured support, confidence, and sample-size thresholds.",
      );
    }

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      patterns: accepted,
      rejectedPatternCount,
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private createCandidate(
    strategyId: string,
    regime: MarketRegime,
    observations: readonly StrategyPerformanceObservation[],
    featureVectors: readonly StrategyFeatureVector[],
    totalSampleSize: number,
  ): PatternCandidate {
    const statistics = calculateStatistics(observations);
    const direction = this.determineDirection(
      statistics,
      observations,
    );
    const support = safeDivide(
      statistics.sampleSize,
      totalSampleSize,
    );
    const stabilityScore = calculateStability(statistics);
    const directionalAgreement = calculateDirectionalAgreement(
      observations,
      direction,
    );
    const sampleConfidence =
      1 - Math.exp(-statistics.sampleSize / 100);
    const confidence = clamp01(
      directionalAgreement * 0.4 +
        stabilityScore * 0.35 +
        sampleConfidence * 0.25,
    );

    return Object.freeze({
      strategyId,
      regime,
      observations: Object.freeze([...observations]),
      featureVectors: Object.freeze([...featureVectors]),
      direction,
      confidence,
      support: clamp01(support),
      sampleSize: statistics.sampleSize,
      expectedImpact: clamp(
        statistics.weightedReturn +
          statistics.weightedExpectancy,
        -1,
        1,
      ),
      stabilityScore,
      featureConditions:
        this.extractFeatureConditions(featureVectors),
      evidenceObservationIds: Object.freeze(
        observations
          .map((observation) => observation.observationId)
          .sort(),
      ),
    });
  }

  private determineDirection(
    statistics: ObservationStatistics,
    observations: readonly StrategyPerformanceObservation[],
  ): PatternDirection {
    const positiveCount = observations.filter(
      (observation) =>
        observation.returnRate > this.positiveImpactThreshold,
    ).length;
    const negativeCount = observations.filter(
      (observation) =>
        observation.returnRate < this.negativeImpactThreshold,
    ).length;
    const total = Math.max(1, observations.length);

    const positiveRate = positiveCount / total;
    const negativeRate = negativeCount / total;

    if (
      positiveRate >= 1 - this.mixedDirectionTolerance &&
      statistics.weightedReturn > this.positiveImpactThreshold
    ) {
      return "POSITIVE";
    }

    if (
      negativeRate >= 1 - this.mixedDirectionTolerance &&
      statistics.weightedReturn < this.negativeImpactThreshold
    ) {
      return "NEGATIVE";
    }

    if (
      positiveRate >= this.mixedDirectionTolerance &&
      negativeRate >= this.mixedDirectionTolerance
    ) {
      return "MIXED";
    }

    if (statistics.weightedReturn > this.positiveImpactThreshold) {
      return "POSITIVE";
    }

    if (statistics.weightedReturn < this.negativeImpactThreshold) {
      return "NEGATIVE";
    }

    return "NEUTRAL";
  }

  private extractFeatureConditions(
    vectors: readonly StrategyFeatureVector[],
  ): Readonly<Record<string, MetaLearningNumericRange>> {
    const valuesByName = new Map<string, number[]>();

    for (const vector of vectors) {
      for (const feature of vector.features) {
        const value = numericFeatureValue(feature);

        if (value === undefined || !Number.isFinite(value)) {
          continue;
        }

        const existing = valuesByName.get(feature.name) ?? [];
        existing.push(value);
        valuesByName.set(feature.name, existing);
      }
    }

    const ranked = Array.from(valuesByName.entries())
      .map(([name, values]) => ({
        name,
        values,
        spread: calculateSpread(values),
        count: values.length,
      }))
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        if (left.spread !== right.spread) {
          return left.spread - right.spread;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, this.maximumFeatureConditions);

    const conditions: Record<string, MetaLearningNumericRange> = {};

    for (const item of ranked) {
      conditions[item.name] = Object.freeze({
        minimum: round(Math.min(...item.values)),
        maximum: round(Math.max(...item.values)),
      });
    }

    return Object.freeze(conditions);
  }

  private toPattern(
    request: PatternMiningRequest,
    candidate: PatternCandidate,
    ordinal: number,
  ): PerformancePattern {
    const directionLabel = candidate.direction.toLowerCase();
    const regimeLabel = candidate.regime
      .toLowerCase()
      .replaceAll("_", " ");

    return freezePattern({
      patternId: `${request.requestId}:pattern:${ordinal}:${candidate.strategyId}:${candidate.regime}`,
      name: `${candidate.strategyId} ${directionLabel} ${candidate.regime}`,
      description:
        `Strategy '${candidate.strategyId}' exhibits a ${directionLabel} performance pattern in ${regimeLabel} conditions.`,
      strategyIds: [candidate.strategyId],
      regimes: [candidate.regime],
      direction: candidate.direction,
      confidence: round(candidate.confidence),
      confidenceBand: confidenceBand(candidate.confidence),
      support: round(candidate.support),
      sampleSize: candidate.sampleSize,
      expectedImpact: round(candidate.expectedImpact),
      stabilityScore: round(candidate.stabilityScore),
      featureConditions: candidate.featureConditions,
      evidenceObservationIds: candidate.evidenceObservationIds,
      discoveredAt: request.generatedAt,
    });
  }

  private assertRequest(request: PatternMiningRequest): void {
    if (request === null || typeof request !== "object") {
      throw new PerformancePatternMinerError(
        "Pattern mining request must be an object.",
        "INVALID_PATTERN_MINING_REQUEST",
      );
    }

    if (
      typeof request.requestId !== "string" ||
      request.requestId.trim().length === 0
    ) {
      throw new PerformancePatternMinerError(
        "requestId must be a non-empty string.",
        "INVALID_PATTERN_MINING_REQUEST_ID",
      );
    }

    if (
      typeof request.generatedAt !== "string" ||
      request.generatedAt.trim().length === 0
    ) {
      throw new PerformancePatternMinerError(
        "generatedAt must be a non-empty timestamp.",
        "INVALID_PATTERN_MINING_TIMESTAMP",
      );
    }

    if (!Array.isArray(request.featureVectors)) {
      throw new PerformancePatternMinerError(
        "featureVectors must be an array.",
        "INVALID_PATTERN_MINING_FEATURE_VECTORS",
      );
    }

    if (!Array.isArray(request.observations)) {
      throw new PerformancePatternMinerError(
        "observations must be an array.",
        "INVALID_PATTERN_MINING_OBSERVATIONS",
      );
    }

    assertUnitInterval(
      request.minimumSupport,
      "minimumSupport",
    );
    assertUnitInterval(
      request.minimumConfidence,
      "minimumConfidence",
    );

    if (
      !Number.isInteger(request.minimumSampleSize) ||
      request.minimumSampleSize <= 0
    ) {
      throw new PerformancePatternMinerError(
        "minimumSampleSize must be a positive integer.",
        "INVALID_PATTERN_MINING_SAMPLE_SIZE",
      );
    }

    if (
      !Number.isInteger(request.maximumPatterns) ||
      request.maximumPatterns <= 0
    ) {
      throw new PerformancePatternMinerError(
        "maximumPatterns must be a positive integer.",
        "INVALID_PATTERN_MINING_MAXIMUM_PATTERNS",
      );
    }

    const observationIds = request.observations.map(
      (observation) => observation.observationId,
    );

    if (new Set(observationIds).size !== observationIds.length) {
      throw new PerformancePatternMinerError(
        "observations contain duplicate observationId values.",
        "DUPLICATE_PATTERN_MINING_OBSERVATION_ID",
      );
    }
  }
}

export function createPerformancePatternMiner(
  options: PerformancePatternMinerOptions = {},
): PerformancePatternMiner {
  return new PerformancePatternMiner(options);
}

function calculateStatistics(
  observations: readonly StrategyPerformanceObservation[],
): ObservationStatistics {
  if (observations.length === 0) {
    return Object.freeze({
      sampleSize: 0,
      weightedReturn: 0,
      weightedExpectancy: 0,
      weightedSharpe: 0,
      weightedDrawdown: 0,
      weightedTailLoss: 0,
      profitableRate: 0,
      returnStandardDeviation: 0,
    });
  }

  const weights = observations.map((observation) =>
    Math.max(1, observation.sampleSize),
  );
  const totalWeight = sum(weights);

  const weighted = (
    selector: (observation: StrategyPerformanceObservation) => number,
  ): number =>
    safeDivide(
      observations.reduce(
        (total, observation, index) =>
          total + selector(observation) * weights[index],
        0,
      ),
      totalWeight,
    );

  const returns = observations.map(
    (observation) => observation.returnRate,
  );

  return Object.freeze({
    sampleSize: observations.reduce(
      (total, observation) =>
        total + observation.sampleSize,
      0,
    ),
    weightedReturn: weighted(
      (observation) => observation.returnRate,
    ),
    weightedExpectancy: weighted(
      (observation) => observation.expectancy,
    ),
    weightedSharpe: weighted(
      (observation) => observation.sharpeRatio,
    ),
    weightedDrawdown: weighted(
      (observation) => observation.maximumDrawdown,
    ),
    weightedTailLoss: weighted(
      (observation) => observation.tailLoss,
    ),
    profitableRate: safeDivide(
      observations.filter(
        (observation) => observation.netProfit > 0,
      ).length,
      observations.length,
    ),
    returnStandardDeviation: standardDeviation(returns),
  });
}

function calculateStability(
  statistics: ObservationStatistics,
): number {
  const returnConsistency =
    1 - clamp01(statistics.returnStandardDeviation / 0.2);
  const drawdownControl =
    1 - clamp01(statistics.weightedDrawdown / 0.4);
  const tailRiskControl =
    1 - clamp01(statistics.weightedTailLoss / 0.3);
  const sharpeQuality = clamp01(
    (Math.tanh(statistics.weightedSharpe / 3) + 1) / 2,
  );

  return clamp01(
    returnConsistency * 0.35 +
      drawdownControl * 0.25 +
      tailRiskControl * 0.2 +
      sharpeQuality * 0.2,
  );
}

function calculateDirectionalAgreement(
  observations: readonly StrategyPerformanceObservation[],
  direction: PatternDirection,
): number {
  if (observations.length === 0) {
    return 0;
  }

  if (direction === "NEUTRAL") {
    return safeDivide(
      observations.filter(
        (observation) =>
          Math.abs(observation.returnRate) <= 0.01,
      ).length,
      observations.length,
    );
  }

  if (direction === "MIXED") {
    const positive = observations.some(
      (observation) => observation.returnRate > 0,
    );
    const negative = observations.some(
      (observation) => observation.returnRate < 0,
    );
    return positive && negative ? 0.75 : 0.25;
  }

  const matching = observations.filter((observation) =>
    direction === "POSITIVE"
      ? observation.returnRate > 0
      : observation.returnRate < 0,
  ).length;

  return safeDivide(matching, observations.length);
}

function numericFeatureValue(
  feature: ExtractedFeature,
): number | undefined {
  if (
    feature.normalizedValue !== undefined &&
    Number.isFinite(feature.normalizedValue)
  ) {
    return feature.normalizedValue;
  }

  if (
    feature.numericValue !== undefined &&
    Number.isFinite(feature.numericValue)
  ) {
    return feature.numericValue;
  }

  if (feature.booleanValue !== undefined) {
    return feature.booleanValue ? 1 : 0;
  }

  return undefined;
}

function compareCandidates(
  left: PatternCandidate,
  right: PatternCandidate,
): number {
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  if (left.support !== right.support) {
    return right.support - left.support;
  }

  if (left.stabilityScore !== right.stabilityScore) {
    return right.stabilityScore - left.stabilityScore;
  }

  if (left.strategyId !== right.strategyId) {
    return left.strategyId.localeCompare(right.strategyId);
  }

  return left.regime.localeCompare(right.regime);
}

function confidenceBand(
  confidence: number,
): PatternConfidenceBand {
  if (confidence >= 0.9) {
    return "VERY_HIGH";
  }

  if (confidence >= 0.75) {
    return "HIGH";
  }

  if (confidence >= 0.55) {
    return "MEDIUM";
  }

  if (confidence >= 0.35) {
    return "LOW";
  }

  return "VERY_LOW";
}

function groupKey(
  strategyId: string,
  regime: MarketRegime,
): string {
  return `${strategyId}::${regime}`;
}

function freezePattern(
  pattern: PerformancePattern,
): PerformancePattern {
  return Object.freeze({
    ...pattern,
    strategyIds: Object.freeze([...pattern.strategyIds]),
    regimes: Object.freeze([...pattern.regimes]),
    featureConditions: Object.freeze({
      ...pattern.featureConditions,
    }),
    evidenceObservationIds: Object.freeze([
      ...pattern.evidenceObservationIds,
    ]),
  });
}

function freezeResult(
  result: PatternMiningResult,
): PatternMiningResult {
  return Object.freeze({
    ...result,
    patterns: Object.freeze([...result.patterns]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function calculateSpread(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
}

function standardDeviation(
  values: readonly number[],
): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = safeDivide(sum(values), values.length);
  const variance = safeDivide(
    values.reduce(
      (total, value) => total + (value - mean) ** 2,
      0,
    ),
    values.length,
  );

  return Math.sqrt(Math.max(0, variance));
}

function assertUnitInterval(
  value: number,
  name: string,
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new PerformancePatternMinerError(
      `${name} must be a finite number between 0 and 1.`,
      "INVALID_PATTERN_MINING_THRESHOLD",
    );
  }
}

function safeDivide(
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    Math.abs(denominator) <= EPSILON
  ) {
    return 0;
  }

  return numerator / denominator;
}

function sum(values: readonly number[]): number {
  return values.reduce(
    (total, value) =>
      total + (Number.isFinite(value) ? value : 0),
    0,
  );
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 12): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}