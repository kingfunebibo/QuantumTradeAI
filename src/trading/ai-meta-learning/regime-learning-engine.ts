/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 6:
 * src/trading/ai-meta-learning/regime-learning-engine.ts
 *
 * Deterministic production-grade market regime learning engine.
 */

import {
  type ExtractedFeature,
  type LearnedRegimeProfile,
  type MarketContextSnapshot,
  type MarketRegime,
  type MarketRegimeLearningEnginePort,
  type MarketRegimeLearningRequest,
  type MarketRegimeLearningResult,
  type PerformancePattern,
  type RegimeLearningEvidence,
  type StrategyFeatureVector,
  type StrategyPerformanceObservation,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;

interface RegimeAggregate {
  readonly regime: MarketRegime;
  readonly contexts: readonly MarketContextSnapshot[];
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly vectors: readonly StrategyFeatureVector[];
  readonly patterns: readonly PerformancePattern[];
}

interface StrategyEvidenceAggregate {
  readonly strategyId: string;
  readonly regime: MarketRegime;
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly score: number;
  readonly confidence: number;
  readonly sampleSize: number;
  readonly observationIds: readonly string[];
}

export interface MarketRegimeLearningEngineOptions {
  readonly preferredStrategyThreshold?: number;
  readonly avoidedStrategyThreshold?: number;
  readonly maximumDominantFeatures?: number;
  readonly transitionLookback?: number;
}

export class MarketRegimeLearningEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "MARKET_REGIME_LEARNING_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "MarketRegimeLearningEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MarketRegimeLearningEngine
  implements MarketRegimeLearningEnginePort
{
  private readonly preferredStrategyThreshold: number;
  private readonly avoidedStrategyThreshold: number;
  private readonly maximumDominantFeatures: number;
  private readonly transitionLookback: number;

  public constructor(options: MarketRegimeLearningEngineOptions = {}) {
    this.preferredStrategyThreshold = clamp01(
      options.preferredStrategyThreshold ?? 0.65,
    );
    this.avoidedStrategyThreshold = clamp01(
      options.avoidedStrategyThreshold ?? 0.35,
    );
    this.maximumDominantFeatures = Math.max(
      1,
      Math.trunc(options.maximumDominantFeatures ?? 8),
    );
    this.transitionLookback = Math.max(
      2,
      Math.trunc(options.transitionLookback ?? 500),
    );
  }

  public learn(
    request: MarketRegimeLearningRequest,
  ): MarketRegimeLearningResult {
    this.assertRequest(request);

    const warnings: string[] = [];
    const unknownContextIds: string[] = [];

    const validContexts = request.marketContexts
      .filter((context) => {
        const valid = this.isKnownContext(context);

        if (!valid) {
          unknownContextIds.push(context.snapshotId);
          warnings.push(
            `Market context '${context.snapshotId}' could not be used because its regime or timestamp is invalid.`,
          );
        }

        return valid;
      })
      .sort(
        (left, right) =>
          Date.parse(left.timestamp) -
            Date.parse(right.timestamp) ||
          left.snapshotId.localeCompare(right.snapshotId),
      );

    const regimes = Array.from(
      new Set([
        ...validContexts.map((context) => context.regime),
        ...request.observations.map(
          (observation) => observation.regime,
        ),
        ...request.featureVectors.map((vector) => vector.regime),
        ...request.knownPatterns.flatMap(
          (pattern) => pattern.regimes,
        ),
      ]),
    ).sort();

    const profiles = regimes
      .map((regime) =>
        this.buildProfile(
          request,
          this.aggregateRegime(
            regime,
            validContexts,
            request.observations,
            request.featureVectors,
            request.knownPatterns,
          ),
          validContexts,
        ),
      )
      .filter(
        (profile) =>
          profile.strategyEvidence.some(
            (evidence) =>
              evidence.sampleSize >= request.minimumSampleSize,
          ) ||
          profile.confidence > 0,
      )
      .sort((left, right) =>
        left.regime.localeCompare(right.regime),
      );

    if (request.marketContexts.length === 0) {
      warnings.push("No market contexts were supplied.");
    }

    if (request.observations.length === 0) {
      warnings.push(
        "No strategy performance observations were supplied.",
      );
    }

    if (profiles.length === 0) {
      warnings.push(
        "No learned regime profiles satisfied the available evidence.",
      );
    }

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      profiles,
      unknownContextIds: Array.from(
        new Set(unknownContextIds),
      ).sort(),
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private aggregateRegime(
    regime: MarketRegime,
    contexts: readonly MarketContextSnapshot[],
    observations: readonly StrategyPerformanceObservation[],
    vectors: readonly StrategyFeatureVector[],
    patterns: readonly PerformancePattern[],
  ): RegimeAggregate {
    return Object.freeze({
      regime,
      contexts: Object.freeze(
        contexts.filter((context) => context.regime === regime),
      ),
      observations: Object.freeze(
        observations.filter(
          (observation) => observation.regime === regime,
        ),
      ),
      vectors: Object.freeze(
        vectors.filter((vector) => vector.regime === regime),
      ),
      patterns: Object.freeze(
        patterns.filter((pattern) =>
          pattern.regimes.includes(regime),
        ),
      ),
    });
  }

  private buildProfile(
    request: MarketRegimeLearningRequest,
    aggregate: RegimeAggregate,
    allContexts: readonly MarketContextSnapshot[],
  ): LearnedRegimeProfile {
    const evidence = this.buildStrategyEvidence(
      aggregate,
      request.minimumSampleSize,
    );

    const preferredStrategyIds = evidence
      .filter(
        (item) =>
          item.sampleSize >= request.minimumSampleSize &&
          item.score >= this.preferredStrategyThreshold,
      )
      .map((item) => item.strategyId)
      .sort();

    const avoidedStrategyIds = evidence
      .filter(
        (item) =>
          item.sampleSize >= request.minimumSampleSize &&
          item.score <= this.avoidedStrategyThreshold,
      )
      .map((item) => item.strategyId)
      .sort();

    const dominantFeatures = this.extractDominantFeatures(
      aggregate.contexts,
      aggregate.vectors,
    );

    const transitionProbabilities =
      this.calculateTransitionProbabilities(
        aggregate.regime,
        allContexts,
      );

    const sampleConfidence = clamp01(
      safeDivide(
        evidence.reduce(
          (total, item) => total + item.sampleSize,
          0,
        ),
        Math.max(
          1,
          request.minimumSampleSize *
            Math.max(1, evidence.length),
        ),
      ),
    );

    const contextConfidence =
      aggregate.contexts.length === 0
        ? 0
        : average(
            aggregate.contexts.map(
              (context) => context.regimeConfidence,
            ),
          );

    const evidenceConfidence =
      evidence.length === 0
        ? 0
        : weightedAverage(
            evidence.map((item) => ({
              value: item.confidence,
              weight: Math.max(1, item.sampleSize),
            })),
          );

    const patternConfidence =
      aggregate.patterns.length === 0
        ? 0.5
        : weightedAverage(
            aggregate.patterns.map((pattern) => ({
              value: pattern.confidence,
              weight: Math.max(EPSILON, pattern.support),
            })),
          );

    const confidence = clamp01(
      sampleConfidence * 0.3 +
        contextConfidence * 0.25 +
        evidenceConfidence * 0.3 +
        patternConfidence * 0.15,
    );

    const stabilityScore = this.calculateRegimeStability(
      aggregate.contexts,
      aggregate.observations,
      transitionProbabilities,
    );

    return freezeProfile({
      profileId: `${request.requestId}:regime-profile:${aggregate.regime}`,
      regime: aggregate.regime,
      generatedAt: request.generatedAt,
      dominantFeatures,
      preferredStrategyIds,
      avoidedStrategyIds,
      strategyEvidence: evidence,
      transitionProbabilities,
      confidence: round(confidence),
      stabilityScore: round(stabilityScore),
    });
  }

  private buildStrategyEvidence(
    aggregate: RegimeAggregate,
    minimumSampleSize: number,
  ): readonly RegimeLearningEvidence[] {
    const strategyIds = Array.from(
      new Set([
        ...aggregate.observations.map(
          (observation) => observation.strategyId,
        ),
        ...aggregate.vectors.map((vector) => vector.strategyId),
        ...aggregate.patterns.flatMap(
          (pattern) => pattern.strategyIds,
        ),
      ]),
    ).sort();

    return Object.freeze(
      strategyIds
        .map((strategyId) =>
          this.calculateStrategyEvidence(
            strategyId,
            aggregate,
            minimumSampleSize,
          ),
        )
        .sort((left, right) => {
          if (left.score !== right.score) {
            return right.score - left.score;
          }

          if (left.confidence !== right.confidence) {
            return right.confidence - left.confidence;
          }

          return left.strategyId.localeCompare(
            right.strategyId,
          );
        }),
    );
  }

  private calculateStrategyEvidence(
    strategyId: string,
    aggregate: RegimeAggregate,
    minimumSampleSize: number,
  ): RegimeLearningEvidence {
    const observations = aggregate.observations.filter(
      (observation) => observation.strategyId === strategyId,
    );

    const vectors = aggregate.vectors.filter(
      (vector) => vector.strategyId === strategyId,
    );

    const patterns = aggregate.patterns.filter((pattern) =>
      pattern.strategyIds.includes(strategyId),
    );

    const sampleSize = observations.reduce(
      (total, observation) =>
        total + observation.sampleSize,
      0,
    );

    const performanceScore =
      observations.length === 0
        ? 0.5
        : this.calculatePerformanceScore(observations);

    const featureScore =
      vectors.length === 0
        ? 0.5
        : average(
            vectors.map((vector) => vector.qualityScore),
          );

    const patternScore =
      patterns.length === 0
        ? 0.5
        : this.calculatePatternScore(patterns);

    const score = clamp01(
      performanceScore * 0.65 +
        featureScore * 0.15 +
        patternScore * 0.2,
    );

    const sampleConfidence = clamp01(
      safeDivide(sampleSize, minimumSampleSize),
    );

    const observationDepth =
      observations.length === 0
        ? 0
        : clamp01(1 - Math.exp(-observations.length / 5));

    const featureConfidence =
      vectors.length === 0
        ? 0.5
        : average(
            vectors.map((vector) => vector.qualityScore),
          );

    const patternConfidence =
      patterns.length === 0
        ? 0.5
        : weightedAverage(
            patterns.map((pattern) => ({
              value: pattern.confidence,
              weight: Math.max(EPSILON, pattern.support),
            })),
          );

    const confidence = clamp01(
      sampleConfidence * 0.45 +
        observationDepth * 0.2 +
        featureConfidence * 0.15 +
        patternConfidence * 0.2,
    );

    return freezeEvidence({
      strategyId,
      regime: aggregate.regime,
      score: round(score),
      confidence: round(confidence),
      sampleSize,
      observationIds: observations
        .map((observation) => observation.observationId)
        .sort(),
    });
  }

  private calculatePerformanceScore(
    observations: readonly StrategyPerformanceObservation[],
  ): number {
    const totalWeight = observations.reduce(
      (total, observation) =>
        total + Math.max(1, observation.sampleSize),
      0,
    );

    const weighted = (
      selector: (
        observation: StrategyPerformanceObservation,
      ) => number,
    ): number =>
      safeDivide(
        observations.reduce(
          (total, observation) =>
            total +
            selector(observation) *
              Math.max(1, observation.sampleSize),
          0,
        ),
        totalWeight,
      );

    const returnScore = normalizeSigned(
      weighted((item) => item.returnRate),
      0.25,
    );
    const sharpeScore = normalizeSigned(
      weighted((item) => item.sharpeRatio),
      3,
    );
    const sortinoScore = normalizeSigned(
      weighted((item) => item.sortinoRatio),
      3,
    );
    const winRateScore = clamp01(
      weighted((item) => item.winRate),
    );
    const drawdownControl =
      1 -
      clamp01(
        weighted((item) => item.maximumDrawdown) / 0.4,
      );
    const tailRiskControl =
      1 -
      clamp01(
        weighted((item) =>
          Math.max(
            item.tailLoss,
            item.valueAtRisk,
            item.conditionalValueAtRisk,
          ),
        ) / 0.3,
      );

    return clamp01(
      returnScore * 0.25 +
        sharpeScore * 0.18 +
        sortinoScore * 0.17 +
        winRateScore * 0.15 +
        drawdownControl * 0.15 +
        tailRiskControl * 0.1,
    );
  }

  private calculatePatternScore(
    patterns: readonly PerformancePattern[],
  ): number {
    const contributions = patterns.map((pattern) => {
      const direction =
        pattern.direction === "POSITIVE"
          ? 1
          : pattern.direction === "NEGATIVE"
            ? -1
            : 0;

      return {
        value: clamp01(
          0.5 +
            direction *
              clamp(pattern.expectedImpact, -1, 1) *
              0.5,
        ),
        weight: Math.max(
          EPSILON,
          pattern.confidence *
            pattern.support *
            pattern.stabilityScore,
        ),
      };
    });

    return clamp01(weightedAverage(contributions));
  }

  private extractDominantFeatures(
    contexts: readonly MarketContextSnapshot[],
    vectors: readonly StrategyFeatureVector[],
  ): readonly string[] {
    const scores = new Map<string, number[]>();

    for (const context of contexts) {
      const builtIn: Readonly<Record<string, number>> = {
        "market.regimeConfidence": context.regimeConfidence,
        "market.trendStrength": context.trendStrength,
        "market.realizedVolatility":
          context.realizedVolatility,
        "market.liquidityScore": context.liquidityScore,
        "market.momentumScore": context.momentumScore,
        "market.meanReversionScore":
          context.meanReversionScore,
        "market.riskOnScore": context.riskOnScore,
        "market.stressScore": context.stressScore,
      };

      for (const [name, value] of Object.entries(builtIn)) {
        appendScore(scores, name, Math.abs(value));
      }

      for (const [name, value] of Object.entries(
        context.features,
      )) {
        appendScore(
          scores,
          `market.custom.${name}`,
          Math.abs(value),
        );
      }
    }

    for (const vector of vectors) {
      for (const feature of vector.features) {
        const value = featureImportanceValue(feature);

        if (value === undefined) {
          continue;
        }

        appendScore(
          scores,
          feature.name,
          Math.abs(value) *
            clamp01(feature.importanceHint ?? 0.5),
        );
      }
    }

    return Object.freeze(
      Array.from(scores.entries())
        .map(([name, values]) => ({
          name,
          score: average(values),
          count: values.length,
        }))
        .sort((left, right) => {
          if (left.score !== right.score) {
            return right.score - left.score;
          }

          if (left.count !== right.count) {
            return right.count - left.count;
          }

          return left.name.localeCompare(right.name);
        })
        .slice(0, this.maximumDominantFeatures)
        .map((item) => item.name),
    );
  }

  private calculateTransitionProbabilities(
    sourceRegime: MarketRegime,
    contexts: readonly MarketContextSnapshot[],
  ): Readonly<Partial<Record<MarketRegime, number>>> {
    const ordered = [...contexts]
      .sort(
        (left, right) =>
          Date.parse(left.timestamp) -
            Date.parse(right.timestamp) ||
          left.snapshotId.localeCompare(right.snapshotId),
      )
      .slice(-this.transitionLookback);

    const counts = new Map<MarketRegime, number>();
    let totalTransitions = 0;

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];

      if (current.regime !== sourceRegime) {
        continue;
      }

      counts.set(
        next.regime,
        (counts.get(next.regime) ?? 0) + 1,
      );
      totalTransitions += 1;
    }

    const result: Partial<Record<MarketRegime, number>> = {};

    for (const [regime, count] of Array.from(
      counts.entries(),
    ).sort(([left], [right]) => left.localeCompare(right))) {
      result[regime] = round(
        safeDivide(count, totalTransitions),
      );
    }

    return Object.freeze(result);
  }

  private calculateRegimeStability(
    contexts: readonly MarketContextSnapshot[],
    observations: readonly StrategyPerformanceObservation[],
    transitions: Readonly<
      Partial<Record<MarketRegime, number>>
    >,
  ): number {
    const contextConfidence =
      contexts.length === 0
        ? 0
        : average(
            contexts.map(
              (context) => context.regimeConfidence,
            ),
          );

    const selfTransitionProbability =
      Object.entries(transitions).reduce(
        (maximum, [, probability]) =>
          Math.max(maximum, probability ?? 0),
        0,
      );

    const returnDispersion =
      observations.length <= 1
        ? 0
        : standardDeviation(
            observations.map(
              (observation) => observation.returnRate,
            ),
          );

    const returnConsistency =
      1 - clamp01(returnDispersion / 0.2);

    return clamp01(
      contextConfidence * 0.4 +
        selfTransitionProbability * 0.3 +
        returnConsistency * 0.3,
    );
  }

  private isKnownContext(
    context: MarketContextSnapshot,
  ): boolean {
    return (
      typeof context.snapshotId === "string" &&
      context.snapshotId.trim().length > 0 &&
      typeof context.regime === "string" &&
      context.regime.trim().length > 0 &&
      Number.isFinite(Date.parse(context.timestamp))
    );
  }

  private assertRequest(
    request: MarketRegimeLearningRequest,
  ): void {
    if (request === null || typeof request !== "object") {
      throw new MarketRegimeLearningEngineError(
        "Market regime learning request must be an object.",
        "INVALID_MARKET_REGIME_LEARNING_REQUEST",
      );
    }

    if (
      typeof request.requestId !== "string" ||
      request.requestId.trim().length === 0
    ) {
      throw new MarketRegimeLearningEngineError(
        "requestId must be a non-empty string.",
        "INVALID_MARKET_REGIME_LEARNING_REQUEST_ID",
      );
    }

    if (
      typeof request.generatedAt !== "string" ||
      !Number.isFinite(Date.parse(request.generatedAt))
    ) {
      throw new MarketRegimeLearningEngineError(
        "generatedAt must be a valid timestamp.",
        "INVALID_MARKET_REGIME_LEARNING_TIMESTAMP",
      );
    }

    if (!Array.isArray(request.marketContexts)) {
      throw new MarketRegimeLearningEngineError(
        "marketContexts must be an array.",
        "INVALID_MARKET_CONTEXTS",
      );
    }

    if (!Array.isArray(request.featureVectors)) {
      throw new MarketRegimeLearningEngineError(
        "featureVectors must be an array.",
        "INVALID_REGIME_FEATURE_VECTORS",
      );
    }

    if (!Array.isArray(request.observations)) {
      throw new MarketRegimeLearningEngineError(
        "observations must be an array.",
        "INVALID_REGIME_OBSERVATIONS",
      );
    }

    if (!Array.isArray(request.knownPatterns)) {
      throw new MarketRegimeLearningEngineError(
        "knownPatterns must be an array.",
        "INVALID_REGIME_PATTERNS",
      );
    }

    if (
      !Number.isInteger(request.minimumSampleSize) ||
      request.minimumSampleSize <= 0
    ) {
      throw new MarketRegimeLearningEngineError(
        "minimumSampleSize must be a positive integer.",
        "INVALID_REGIME_MINIMUM_SAMPLE_SIZE",
      );
    }

    const contextIds = request.marketContexts.map(
      (context) => context.snapshotId,
    );

    if (new Set(contextIds).size !== contextIds.length) {
      throw new MarketRegimeLearningEngineError(
        "marketContexts contain duplicate snapshotId values.",
        "DUPLICATE_MARKET_SNAPSHOT_ID",
      );
    }
  }
}

export function createMarketRegimeLearningEngine(
  options: MarketRegimeLearningEngineOptions = {},
): MarketRegimeLearningEngine {
  return new MarketRegimeLearningEngine(options);
}

function freezeEvidence(
  evidence: RegimeLearningEvidence,
): RegimeLearningEvidence {
  return Object.freeze({
    ...evidence,
    observationIds: Object.freeze([
      ...evidence.observationIds,
    ]),
  });
}

function freezeProfile(
  profile: LearnedRegimeProfile,
): LearnedRegimeProfile {
  return Object.freeze({
    ...profile,
    dominantFeatures: Object.freeze([
      ...profile.dominantFeatures,
    ]),
    preferredStrategyIds: Object.freeze([
      ...profile.preferredStrategyIds,
    ]),
    avoidedStrategyIds: Object.freeze([
      ...profile.avoidedStrategyIds,
    ]),
    strategyEvidence: Object.freeze([
      ...profile.strategyEvidence,
    ]),
    transitionProbabilities: Object.freeze({
      ...profile.transitionProbabilities,
    }),
  });
}

function freezeResult(
  result: MarketRegimeLearningResult,
): MarketRegimeLearningResult {
  return Object.freeze({
    ...result,
    profiles: Object.freeze([...result.profiles]),
    unknownContextIds: Object.freeze([
      ...result.unknownContextIds,
    ]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function featureImportanceValue(
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
    return normalizeSigned(feature.numericValue, 1);
  }

  if (feature.booleanValue !== undefined) {
    return feature.booleanValue ? 1 : 0;
  }

  return undefined;
}

function appendScore(
  map: Map<string, number[]>,
  name: string,
  value: number,
): void {
  const existing = map.get(name) ?? [];
  existing.push(value);
  map.set(name, existing);
}

function normalizeSigned(
  value: number,
  scale: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const safeScale = Math.max(EPSILON, Math.abs(scale));
  return clamp01((Math.tanh(value / safeScale) + 1) / 2);
}

function weightedAverage(
  values: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
): number {
  let numerator = 0;
  let denominator = 0;

  for (const item of values) {
    if (
      !Number.isFinite(item.value) ||
      !Number.isFinite(item.weight) ||
      item.weight <= 0
    ) {
      continue;
    }

    numerator += item.value * item.weight;
    denominator += item.weight;
  }

  return safeDivide(numerator, denominator);
}

function average(values: readonly number[]): number {
  return safeDivide(
    values.reduce(
      (total, value) =>
        total + (Number.isFinite(value) ? value : 0),
      0,
    ),
    values.length,
  );
}

function standardDeviation(
  values: readonly number[],
): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance = average(
    values.map((value) => (value - mean) ** 2),
  );

  return Math.sqrt(Math.max(0, variance));
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