/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File:
 * src/trading/ai-meta-learning/strategy-learning-engine.ts
 *
 * Deterministic production-grade strategy learning engine.
 *
 * Responsibilities:
 * - Aggregate strategy observations.
 * - Score strategy quality against the configured learning objective.
 * - Incorporate pattern, feature, regime, execution-cost, and risk evidence.
 * - Penalize insufficient samples, drawdowns, tail risk, and instability.
 * - Produce immutable and deterministically ordered results.
 */

import {
  type LearnedRegimeProfile,
  type LearningObjective,
  type MarketRegime,
  type PerformancePattern,
  type StrategyDescriptor,
  type StrategyFeatureVector,
  type StrategyLearningEnginePort,
  type StrategyLearningRequest,
  type StrategyLearningResult,
  type StrategyLearningScore,
  type StrategyPerformanceObservation,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;

interface AggregateMetrics {
  readonly sampleSize: number;
  readonly observationCount: number;
  readonly trades: number;
  readonly weightedReturnRate: number;
  readonly weightedVolatility: number;
  readonly weightedMaximumDrawdown: number;
  readonly weightedSharpeRatio: number;
  readonly weightedSortinoRatio: number;
  readonly weightedCalmarRatio: number;
  readonly weightedProfitFactor: number;
  readonly weightedWinRate: number;
  readonly weightedExpectancy: number;
  readonly weightedTailLoss: number;
  readonly weightedValueAtRisk: number;
  readonly weightedConditionalValueAtRisk: number;
  readonly weightedTurnover: number;
  readonly weightedExecutionCost: number;
  readonly weightedSlippageCost: number;
  readonly profitableObservationRate: number;
  readonly regimeCount: number;
  readonly activeRegimes: readonly MarketRegime[];
}

interface ScoreComponents {
  readonly performance: number;
  readonly stability: number;
  readonly regimeRobustness: number;
  readonly riskAdjusted: number;
  readonly pattern: number;
  readonly featureQuality: number;
  readonly drawdownPenalty: number;
  readonly tailRiskPenalty: number;
  readonly executionCostPenalty: number;
  readonly sampleSizePenalty: number;
  readonly rawScore: number;
}

interface StrategyContext {
  readonly descriptor: StrategyDescriptor;
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly featureVectors: readonly StrategyFeatureVector[];
  readonly patterns: readonly PerformancePattern[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
}

export interface StrategyLearningEngineOptions {
  readonly bestStrategyFraction?: number;
  readonly underperformingStrategyFraction?: number;
  readonly minimumBestStrategyCount?: number;
  readonly minimumUnderperformingStrategyCount?: number;
  readonly maximumAbsoluteRatio?: number;
}

export class StrategyLearningEngineError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "STRATEGY_LEARNING_ENGINE_ERROR") {
    super(message);
    this.name = "StrategyLearningEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StrategyLearningEngine implements StrategyLearningEnginePort {
  private readonly bestStrategyFraction: number;
  private readonly underperformingStrategyFraction: number;
  private readonly minimumBestStrategyCount: number;
  private readonly minimumUnderperformingStrategyCount: number;
  private readonly maximumAbsoluteRatio: number;

  public constructor(options: StrategyLearningEngineOptions = {}) {
    this.bestStrategyFraction = clamp(
      options.bestStrategyFraction ?? 0.2,
      0,
      1,
    );
    this.underperformingStrategyFraction = clamp(
      options.underperformingStrategyFraction ?? 0.2,
      0,
      1,
    );
    this.minimumBestStrategyCount = Math.max(
      0,
      Math.trunc(options.minimumBestStrategyCount ?? 1),
    );
    this.minimumUnderperformingStrategyCount = Math.max(
      0,
      Math.trunc(options.minimumUnderperformingStrategyCount ?? 1),
    );
    this.maximumAbsoluteRatio = Math.max(
      1,
      options.maximumAbsoluteRatio ?? 20,
    );
  }

  public learn(request: StrategyLearningRequest): StrategyLearningResult {
    this.assertRequest(request);

    const scores = request.descriptors
      .map((descriptor) =>
        this.scoreStrategy({
          descriptor,
          observations: request.observations.filter(
            (item) => item.strategyId === descriptor.strategyId,
          ),
          featureVectors: request.featureVectors.filter(
            (item) => item.strategyId === descriptor.strategyId,
          ),
          patterns: request.patterns.filter((item) =>
            item.strategyIds.includes(descriptor.strategyId),
          ),
          regimeProfiles: request.regimeProfiles.filter(
            (profile) =>
              profile.preferredStrategyIds.includes(descriptor.strategyId) ||
              profile.avoidedStrategyIds.includes(descriptor.strategyId) ||
              profile.strategyEvidence.some(
                (evidence) =>
                  evidence.strategyId === descriptor.strategyId,
              ),
          ),
        }, request),
      )
      .sort(compareLearningScores);

    const bestStrategyCount = calculateSelectionCount(
      scores.length,
      this.bestStrategyFraction,
      this.minimumBestStrategyCount,
    );
    const underperformingStrategyCount = calculateSelectionCount(
      scores.length,
      this.underperformingStrategyFraction,
      this.minimumUnderperformingStrategyCount,
    );

    const bestStrategyIds = scores
      .slice(0, bestStrategyCount)
      .filter((item) => item.confidence > 0)
      .map((item) => item.strategyId);

    const underperformingStrategyIds = scores
      .slice(
        Math.max(0, scores.length - underperformingStrategyCount),
      )
      .filter(
        (item) =>
          item.normalizedScore < 0.5 ||
          item.confidence < 0.5 ||
          item.sampleSizePenalty >= 0.5,
      )
      .map((item) => item.strategyId);

    const warnings = this.buildWarnings(request, scores);

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      scores,
      bestStrategyIds,
      underperformingStrategyIds,
      warnings,
    });
  }

  private scoreStrategy(
    context: StrategyContext,
    request: StrategyLearningRequest,
  ): StrategyLearningScore {
    const aggregate = this.aggregateObservations(context.observations);
    const components = this.calculateComponents(context, aggregate, request);
    const normalizedScore = normalizeRawScore(components.rawScore);

    const confidence = clamp01(
      weightedAverage([
        {
          value: sampleConfidence(
            aggregate.sampleSize,
            request.minimumSampleSize,
          ),
          weight: 0.4,
        },
        {
          value: observationConfidence(aggregate.observationCount),
          weight: 0.15,
        },
        {
          value: components.featureQuality,
          weight: 0.15,
        },
        {
          value: profileConfidence(context.regimeProfiles),
          weight: 0.15,
        },
        {
          value: patternConfidence(context.patterns),
          weight: 0.15,
        },
      ]),
    );

    const reasons = this.buildReasons(
      context,
      aggregate,
      components,
      normalizedScore,
      confidence,
      request.objective,
    );

    return freezeScore({
      strategyId: context.descriptor.strategyId,
      objective: request.objective,
      rawScore: round(components.rawScore),
      normalizedScore: round(normalizedScore),
      confidence: round(confidence),
      stabilityScore: round(components.stability),
      regimeRobustnessScore: round(components.regimeRobustness),
      riskAdjustedScore: round(components.riskAdjusted),
      drawdownPenalty: round(components.drawdownPenalty),
      tailRiskPenalty: round(components.tailRiskPenalty),
      executionCostPenalty: round(components.executionCostPenalty),
      sampleSizePenalty: round(components.sampleSizePenalty),
      reasons,
    });
  }

  private aggregateObservations(
    observations: readonly StrategyPerformanceObservation[],
  ): AggregateMetrics {
    if (observations.length === 0) {
      return Object.freeze({
        sampleSize: 0,
        observationCount: 0,
        trades: 0,
        weightedReturnRate: 0,
        weightedVolatility: 0,
        weightedMaximumDrawdown: 0,
        weightedSharpeRatio: 0,
        weightedSortinoRatio: 0,
        weightedCalmarRatio: 0,
        weightedProfitFactor: 0,
        weightedWinRate: 0,
        weightedExpectancy: 0,
        weightedTailLoss: 0,
        weightedValueAtRisk: 0,
        weightedConditionalValueAtRisk: 0,
        weightedTurnover: 0,
        weightedExecutionCost: 0,
        weightedSlippageCost: 0,
        profitableObservationRate: 0,
        regimeCount: 0,
        activeRegimes: Object.freeze([]),
      });
    }

    const weights = observations.map((item) =>
      Math.max(1, item.sampleSize),
    );
    const totalWeight = sum(weights);
    const weighted = (
      selector: (item: StrategyPerformanceObservation) => number,
    ): number =>
      safeDivide(
        observations.reduce(
          (accumulator, item, index) =>
            accumulator + selector(item) * weights[index],
          0,
        ),
        totalWeight,
      );

    const regimes = Array.from(
      new Set(observations.map((item) => item.regime)),
    ).sort();

    return Object.freeze({
      sampleSize: observations.reduce(
        (total, item) => total + item.sampleSize,
        0,
      ),
      observationCount: observations.length,
      trades: observations.reduce(
        (total, item) => total + item.trades,
        0,
      ),
      weightedReturnRate: weighted((item) => item.returnRate),
      weightedVolatility: weighted((item) => item.volatility),
      weightedMaximumDrawdown: weighted(
        (item) => item.maximumDrawdown,
      ),
      weightedSharpeRatio: weighted((item) => item.sharpeRatio),
      weightedSortinoRatio: weighted((item) => item.sortinoRatio),
      weightedCalmarRatio: weighted((item) => item.calmarRatio),
      weightedProfitFactor: weighted((item) => item.profitFactor),
      weightedWinRate: weighted((item) => item.winRate),
      weightedExpectancy: weighted((item) => item.expectancy),
      weightedTailLoss: weighted((item) => item.tailLoss),
      weightedValueAtRisk: weighted((item) => item.valueAtRisk),
      weightedConditionalValueAtRisk: weighted(
        (item) => item.conditionalValueAtRisk,
      ),
      weightedTurnover: weighted((item) => item.turnover),
      weightedExecutionCost: weighted((item) => item.executionCost),
      weightedSlippageCost: weighted((item) => item.slippageCost),
      profitableObservationRate: safeDivide(
        observations.filter((item) => item.netProfit > 0).length,
        observations.length,
      ),
      regimeCount: regimes.length,
      activeRegimes: Object.freeze(regimes),
    });
  }

  private calculateComponents(
    context: StrategyContext,
    aggregate: AggregateMetrics,
    request: StrategyLearningRequest,
  ): ScoreComponents {
    const performance = this.performanceScore(aggregate);
    const stability = this.stabilityScore(aggregate, context.observations);
    const regimeRobustness = this.regimeRobustnessScore(
      context,
      aggregate,
    );
    const riskAdjusted = this.riskAdjustedScore(aggregate);
    const pattern = this.patternScore(context.patterns);
    const featureQuality = this.featureQualityScore(
      context.featureVectors,
    );

    const drawdownPenalty = clamp01(
      aggregate.weightedMaximumDrawdown / 0.4,
    );
    const tailRiskPenalty = clamp01(
      Math.max(
        aggregate.weightedTailLoss,
        aggregate.weightedConditionalValueAtRisk,
        aggregate.weightedValueAtRisk,
      ) / 0.3,
    );
    const executionCostPenalty = clamp01(
      Math.max(
        0,
        aggregate.weightedExecutionCost +
          aggregate.weightedSlippageCost,
      ) / 0.05,
    );
    const sampleSizePenalty =
      1 -
      sampleConfidence(
        aggregate.sampleSize,
        request.minimumSampleSize,
      );

    const objectiveScore = this.objectiveScore(
      request.objective,
      {
        performance,
        stability,
        regimeRobustness,
        riskAdjusted,
        pattern,
        featureQuality,
      },
    );

    const totalPenalty =
      drawdownPenalty * 0.28 +
      tailRiskPenalty * 0.24 +
      executionCostPenalty * 0.16 +
      sampleSizePenalty * 0.32;

    const rawScore = clamp(
      objectiveScore - totalPenalty,
      -1,
      1,
    );

    return Object.freeze({
      performance,
      stability,
      regimeRobustness,
      riskAdjusted,
      pattern,
      featureQuality,
      drawdownPenalty,
      tailRiskPenalty,
      executionCostPenalty,
      sampleSizePenalty,
      rawScore,
    });
  }

  private performanceScore(aggregate: AggregateMetrics): number {
    const returnScore = normalizeSigned(
      aggregate.weightedReturnRate,
      0.25,
    );
    const expectancyScore = normalizeSigned(
      aggregate.weightedExpectancy,
      0.05,
    );
    const profitFactorScore = normalizePositiveRatio(
      aggregate.weightedProfitFactor,
      this.maximumAbsoluteRatio,
    );
    const winRateScore = clamp01(aggregate.weightedWinRate);
    const profitableObservationScore = clamp01(
      aggregate.profitableObservationRate,
    );

    return clamp01(
      weightedAverage([
        { value: returnScore, weight: 0.28 },
        { value: expectancyScore, weight: 0.18 },
        { value: profitFactorScore, weight: 0.2 },
        { value: winRateScore, weight: 0.16 },
        { value: profitableObservationScore, weight: 0.18 },
      ]),
    );
  }

  private stabilityScore(
    aggregate: AggregateMetrics,
    observations: readonly StrategyPerformanceObservation[],
  ): number {
    if (observations.length === 0) {
      return 0;
    }

    const returns = observations.map((item) => item.returnRate);
    const returnDispersion = standardDeviation(returns);
    const returnConsistency = 1 - clamp01(returnDispersion / 0.2);
    const drawdownConsistency =
      1 - clamp01(aggregate.weightedMaximumDrawdown / 0.3);
    const volatilityConsistency =
      1 - clamp01(aggregate.weightedVolatility / 0.25);
    const profitableConsistency = aggregate.profitableObservationRate;

    return clamp01(
      weightedAverage([
        { value: returnConsistency, weight: 0.3 },
        { value: drawdownConsistency, weight: 0.25 },
        { value: volatilityConsistency, weight: 0.2 },
        { value: profitableConsistency, weight: 0.25 },
      ]),
    );
  }

  private regimeRobustnessScore(
    context: StrategyContext,
    aggregate: AggregateMetrics,
  ): number {
    const supportedRegimeCount = Math.max(
      1,
      context.descriptor.supportedRegimes.length,
    );
    const observedCoverage = clamp01(
      aggregate.regimeCount / supportedRegimeCount,
    );

    const profileEvidence = context.regimeProfiles.flatMap(
      (profile) =>
        profile.strategyEvidence.filter(
          (evidence) =>
            evidence.strategyId === context.descriptor.strategyId,
        ),
    );

    const evidenceScore =
      profileEvidence.length === 0
        ? 0.5
        : clamp01(
            weightedAverage(
              profileEvidence.map((evidence) => ({
                value: clamp01(evidence.score),
                weight: Math.max(
                  EPSILON,
                  evidence.confidence * Math.max(1, evidence.sampleSize),
                ),
              })),
            ),
          );

    const preferredCount = context.regimeProfiles.filter((profile) =>
      profile.preferredStrategyIds.includes(
        context.descriptor.strategyId,
      ),
    ).length;
    const avoidedCount = context.regimeProfiles.filter((profile) =>
      profile.avoidedStrategyIds.includes(
        context.descriptor.strategyId,
      ),
    ).length;
    const profileCount = Math.max(1, context.regimeProfiles.length);
    const preferenceBalance = clamp01(
      0.5 +
        safeDivide(preferredCount - avoidedCount, profileCount) * 0.5,
    );

    return clamp01(
      weightedAverage([
        { value: observedCoverage, weight: 0.35 },
        { value: evidenceScore, weight: 0.4 },
        { value: preferenceBalance, weight: 0.25 },
      ]),
    );
  }

  private riskAdjustedScore(aggregate: AggregateMetrics): number {
    const sharpe = normalizeSignedRatio(
      aggregate.weightedSharpeRatio,
      this.maximumAbsoluteRatio,
    );
    const sortino = normalizeSignedRatio(
      aggregate.weightedSortinoRatio,
      this.maximumAbsoluteRatio,
    );
    const calmar = normalizeSignedRatio(
      aggregate.weightedCalmarRatio,
      this.maximumAbsoluteRatio,
    );
    const volatilityControl =
      1 - clamp01(aggregate.weightedVolatility / 0.3);
    const drawdownControl =
      1 - clamp01(aggregate.weightedMaximumDrawdown / 0.4);

    return clamp01(
      weightedAverage([
        { value: sharpe, weight: 0.25 },
        { value: sortino, weight: 0.25 },
        { value: calmar, weight: 0.2 },
        { value: volatilityControl, weight: 0.15 },
        { value: drawdownControl, weight: 0.15 },
      ]),
    );
  }

  private patternScore(
    patterns: readonly PerformancePattern[],
  ): number {
    if (patterns.length === 0) {
      return 0.5;
    }

    const total = patterns.reduce((accumulator, pattern) => {
      const directionMultiplier =
        pattern.direction === "POSITIVE"
          ? 1
          : pattern.direction === "NEGATIVE"
            ? -1
            : pattern.direction === "MIXED"
              ? 0
              : 0;

      return (
        accumulator +
        directionMultiplier *
          pattern.confidence *
          pattern.support *
          pattern.stabilityScore *
          clamp(pattern.expectedImpact, -1, 1)
      );
    }, 0);

    return clamp01(0.5 + safeDivide(total, patterns.length) * 0.5);
  }

  private featureQualityScore(
    vectors: readonly StrategyFeatureVector[],
  ): number {
    if (vectors.length === 0) {
      return 0;
    }

    return clamp01(
      weightedAverage(
        vectors.map((vector) => ({
          value: vector.qualityScore,
          weight: Math.max(1, vector.features.length),
        })),
      ),
    );
  }

  private objectiveScore(
    objective: LearningObjective,
    values: {
      readonly performance: number;
      readonly stability: number;
      readonly regimeRobustness: number;
      readonly riskAdjusted: number;
      readonly pattern: number;
      readonly featureQuality: number;
    },
  ): number {
    switch (objective) {
      case "MAXIMIZE_RISK_ADJUSTED_RETURN":
        return weightedAverage([
          { value: values.riskAdjusted, weight: 0.45 },
          { value: values.performance, weight: 0.2 },
          { value: values.stability, weight: 0.15 },
          { value: values.regimeRobustness, weight: 0.1 },
          { value: values.pattern, weight: 0.05 },
          { value: values.featureQuality, weight: 0.05 },
        ]);

      case "MAXIMIZE_ABSOLUTE_RETURN":
        return weightedAverage([
          { value: values.performance, weight: 0.5 },
          { value: values.riskAdjusted, weight: 0.15 },
          { value: values.stability, weight: 0.1 },
          { value: values.regimeRobustness, weight: 0.1 },
          { value: values.pattern, weight: 0.1 },
          { value: values.featureQuality, weight: 0.05 },
        ]);

      case "MINIMIZE_DRAWDOWN":
        return weightedAverage([
          { value: values.stability, weight: 0.35 },
          { value: values.riskAdjusted, weight: 0.3 },
          { value: values.regimeRobustness, weight: 0.15 },
          { value: values.performance, weight: 0.1 },
          { value: values.pattern, weight: 0.05 },
          { value: values.featureQuality, weight: 0.05 },
        ]);

      case "MINIMIZE_TAIL_RISK":
        return weightedAverage([
          { value: values.riskAdjusted, weight: 0.4 },
          { value: values.stability, weight: 0.25 },
          { value: values.regimeRobustness, weight: 0.2 },
          { value: values.performance, weight: 0.05 },
          { value: values.pattern, weight: 0.05 },
          { value: values.featureQuality, weight: 0.05 },
        ]);

      case "MAXIMIZE_STABILITY":
        return weightedAverage([
          { value: values.stability, weight: 0.5 },
          { value: values.riskAdjusted, weight: 0.2 },
          { value: values.regimeRobustness, weight: 0.15 },
          { value: values.performance, weight: 0.05 },
          { value: values.pattern, weight: 0.05 },
          { value: values.featureQuality, weight: 0.05 },
        ]);

      case "MAXIMIZE_REGIME_ROBUSTNESS":
        return weightedAverage([
          { value: values.regimeRobustness, weight: 0.5 },
          { value: values.stability, weight: 0.15 },
          { value: values.riskAdjusted, weight: 0.15 },
          { value: values.performance, weight: 0.1 },
          { value: values.pattern, weight: 0.05 },
          { value: values.featureQuality, weight: 0.05 },
        ]);

      case "BALANCED":
      default:
        return weightedAverage([
          { value: values.performance, weight: 0.24 },
          { value: values.stability, weight: 0.2 },
          { value: values.regimeRobustness, weight: 0.18 },
          { value: values.riskAdjusted, weight: 0.24 },
          { value: values.pattern, weight: 0.08 },
          { value: values.featureQuality, weight: 0.06 },
        ]);
    }
  }

  private buildReasons(
    context: StrategyContext,
    aggregate: AggregateMetrics,
    components: ScoreComponents,
    normalizedScore: number,
    confidence: number,
    objective: LearningObjective,
  ): readonly string[] {
    const reasons: string[] = [];

    reasons.push(`Learning objective: ${objective}.`);

    if (aggregate.sampleSize === 0) {
      reasons.push("No performance observations were available.");
    } else {
      reasons.push(
        `Aggregated ${aggregate.observationCount} observations containing ${aggregate.sampleSize} samples and ${aggregate.trades} trades.`,
      );
    }

    if (components.performance >= 0.7) {
      reasons.push("Historical performance evidence is strong.");
    } else if (components.performance <= 0.3) {
      reasons.push("Historical performance evidence is weak.");
    }

    if (components.stability >= 0.7) {
      reasons.push("Returns and drawdowns are comparatively stable.");
    } else if (components.stability <= 0.3) {
      reasons.push("Observed performance is unstable.");
    }

    if (components.regimeRobustness >= 0.7) {
      reasons.push("The strategy shows broad regime robustness.");
    } else if (components.regimeRobustness <= 0.3) {
      reasons.push("Regime evidence is narrow or unfavorable.");
    }

    if (components.riskAdjusted >= 0.7) {
      reasons.push("Risk-adjusted performance is favorable.");
    } else if (components.riskAdjusted <= 0.3) {
      reasons.push("Risk-adjusted performance is unfavorable.");
    }

    if (components.drawdownPenalty >= 0.5) {
      reasons.push("Drawdown severity materially reduced the score.");
    }

    if (components.tailRiskPenalty >= 0.5) {
      reasons.push("Tail-risk evidence materially reduced the score.");
    }

    if (components.executionCostPenalty >= 0.5) {
      reasons.push("Execution and slippage costs materially reduced the score.");
    }

    if (components.sampleSizePenalty >= 0.5) {
      reasons.push("Insufficient sample depth reduced confidence and score.");
    }

    if (context.patterns.length > 0) {
      reasons.push(
        `${context.patterns.length} learned performance pattern(s) influenced the assessment.`,
      );
    }

    if (context.regimeProfiles.length > 0) {
      reasons.push(
        `${context.regimeProfiles.length} learned regime profile(s) contributed evidence.`,
      );
    }

    reasons.push(
      `Final normalized score is ${round(normalizedScore)} with confidence ${round(confidence)}.`,
    );

    return Object.freeze(reasons);
  }

  private buildWarnings(
    request: StrategyLearningRequest,
    scores: readonly StrategyLearningScore[],
  ): readonly string[] {
    const warnings: string[] = [];

    if (request.descriptors.length === 0) {
      warnings.push("No strategy descriptors were supplied.");
    }

    const observationStrategyIds = new Set(
      request.observations.map((item) => item.strategyId),
    );
    const descriptorStrategyIds = new Set(
      request.descriptors.map((item) => item.strategyId),
    );

    for (const strategyId of observationStrategyIds) {
      if (!descriptorStrategyIds.has(strategyId)) {
        warnings.push(
          `Observation data for unknown strategy '${strategyId}' was ignored.`,
        );
      }
    }

    for (const descriptor of request.descriptors) {
      if (!observationStrategyIds.has(descriptor.strategyId)) {
        warnings.push(
          `Strategy '${descriptor.strategyId}' has no performance observations.`,
        );
      }
    }

    if (scores.every((item) => item.confidence < 0.5) && scores.length > 0) {
      warnings.push(
        "All strategy learning scores have confidence below 0.5.",
      );
    }

    return Object.freeze(
      Array.from(new Set(warnings)).sort((left, right) =>
        left.localeCompare(right),
      ),
    );
  }

  private assertRequest(request: StrategyLearningRequest): void {
    if (request === null || typeof request !== "object") {
      throw new StrategyLearningEngineError(
        "Strategy learning request must be an object.",
        "INVALID_STRATEGY_LEARNING_REQUEST",
      );
    }

    if (
      typeof request.requestId !== "string" ||
      request.requestId.trim().length === 0
    ) {
      throw new StrategyLearningEngineError(
        "requestId must be a non-empty string.",
        "INVALID_STRATEGY_LEARNING_REQUEST_ID",
      );
    }

    if (
      typeof request.generatedAt !== "string" ||
      request.generatedAt.trim().length === 0
    ) {
      throw new StrategyLearningEngineError(
        "generatedAt must be a non-empty timestamp.",
        "INVALID_STRATEGY_LEARNING_TIMESTAMP",
      );
    }

    if (!Array.isArray(request.descriptors)) {
      throw new StrategyLearningEngineError(
        "descriptors must be an array.",
        "INVALID_STRATEGY_DESCRIPTORS",
      );
    }

    if (!Array.isArray(request.observations)) {
      throw new StrategyLearningEngineError(
        "observations must be an array.",
        "INVALID_STRATEGY_OBSERVATIONS",
      );
    }

    if (!Array.isArray(request.featureVectors)) {
      throw new StrategyLearningEngineError(
        "featureVectors must be an array.",
        "INVALID_STRATEGY_FEATURE_VECTORS",
      );
    }

    if (!Array.isArray(request.regimeProfiles)) {
      throw new StrategyLearningEngineError(
        "regimeProfiles must be an array.",
        "INVALID_REGIME_PROFILES",
      );
    }

    if (!Array.isArray(request.patterns)) {
      throw new StrategyLearningEngineError(
        "patterns must be an array.",
        "INVALID_PERFORMANCE_PATTERNS",
      );
    }

    if (
      !Number.isInteger(request.minimumSampleSize) ||
      request.minimumSampleSize <= 0
    ) {
      throw new StrategyLearningEngineError(
        "minimumSampleSize must be a positive integer.",
        "INVALID_MINIMUM_SAMPLE_SIZE",
      );
    }

    const strategyIds = request.descriptors.map(
      (descriptor) => descriptor.strategyId,
    );
    if (new Set(strategyIds).size !== strategyIds.length) {
      throw new StrategyLearningEngineError(
        "Strategy descriptors contain duplicate strategyId values.",
        "DUPLICATE_STRATEGY_ID",
      );
    }
  }
}

export function createStrategyLearningEngine(
  options: StrategyLearningEngineOptions = {},
): StrategyLearningEngine {
  return new StrategyLearningEngine(options);
}

function compareLearningScores(
  left: StrategyLearningScore,
  right: StrategyLearningScore,
): number {
  if (left.normalizedScore !== right.normalizedScore) {
    return right.normalizedScore - left.normalizedScore;
  }

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  if (left.riskAdjustedScore !== right.riskAdjustedScore) {
    return right.riskAdjustedScore - left.riskAdjustedScore;
  }

  if (left.stabilityScore !== right.stabilityScore) {
    return right.stabilityScore - left.stabilityScore;
  }

  return left.strategyId.localeCompare(right.strategyId);
}

function calculateSelectionCount(
  total: number,
  fraction: number,
  minimum: number,
): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(
    total,
    Math.max(minimum, Math.ceil(total * fraction)),
  );
}

function freezeScore(
  value: StrategyLearningScore,
): StrategyLearningScore {
  return Object.freeze({
    ...value,
    reasons: Object.freeze([...value.reasons]),
  });
}

function freezeResult(
  value: StrategyLearningResult,
): StrategyLearningResult {
  return Object.freeze({
    ...value,
    scores: Object.freeze([...value.scores]),
    bestStrategyIds: Object.freeze([...value.bestStrategyIds]),
    underperformingStrategyIds: Object.freeze([
      ...value.underperformingStrategyIds,
    ]),
    warnings: Object.freeze([...value.warnings]),
  });
}

function normalizeRawScore(value: number): number {
  return clamp01((clamp(value, -1, 1) + 1) / 2);
}

function sampleConfidence(
  sampleSize: number,
  minimumSampleSize: number,
): number {
  if (sampleSize <= 0) {
    return 0;
  }

  const denominator = Math.max(1, minimumSampleSize);
  return clamp01(sampleSize / denominator);
}

function observationConfidence(observationCount: number): number {
  if (observationCount <= 0) {
    return 0;
  }

  return clamp01(1 - Math.exp(-observationCount / 5));
}

function patternConfidence(
  patterns: readonly PerformancePattern[],
): number {
  if (patterns.length === 0) {
    return 0.5;
  }

  return clamp01(
    weightedAverage(
      patterns.map((pattern) => ({
        value: pattern.confidence,
        weight: Math.max(EPSILON, pattern.support),
      })),
    ),
  );
}

function profileConfidence(
  profiles: readonly LearnedRegimeProfile[],
): number {
  if (profiles.length === 0) {
    return 0.5;
  }

  return clamp01(
    weightedAverage(
      profiles.map((profile) => ({
        value: profile.confidence,
        weight: Math.max(EPSILON, profile.stabilityScore),
      })),
    ),
  );
}

function normalizePositiveRatio(
  value: number,
  maximum: number,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return clamp01(value / Math.max(1, maximum));
}

function normalizeSignedRatio(
  value: number,
  maximumAbsolute: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const bounded = clamp(
    value,
    -maximumAbsolute,
    maximumAbsolute,
  );
  return clamp01((bounded / maximumAbsolute + 1) / 2);
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

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = safeDivide(sum(values), values.length);
  const variance = safeDivide(
    values.reduce(
      (accumulator, value) =>
        accumulator + (value - mean) ** 2,
      0,
    ),
    values.length,
  );

  return Math.sqrt(Math.max(0, variance));
}

function weightedAverage(
  entries: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
): number {
  if (entries.length === 0) {
    return 0;
  }

  let numerator = 0;
  let denominator = 0;

  for (const entry of entries) {
    if (
      !Number.isFinite(entry.value) ||
      !Number.isFinite(entry.weight) ||
      entry.weight <= 0
    ) {
      continue;
    }

    numerator += entry.value * entry.weight;
    denominator += entry.weight;
  }

  return safeDivide(numerator, denominator);
}

function safeDivide(numerator: number, denominator: number): number {
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
    (accumulator, value) =>
      accumulator + (Number.isFinite(value) ? value : 0),
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