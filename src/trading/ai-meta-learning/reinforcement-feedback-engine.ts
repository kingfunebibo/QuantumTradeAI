/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 8:
 * src/trading/ai-meta-learning/reinforcement-feedback-engine.ts
 *
 * Deterministic production-grade reinforcement feedback engine.
 *
 * Responsibilities:
 * - Convert realized strategy performance into bounded reinforcement rewards.
 * - Compare realized outcomes with learned expectations.
 * - Classify deterministic positive, neutral, and negative feedback signals.
 * - Merge new feedback with prior reinforcement state.
 * - Produce immutable, stable, and reproducible results.
 */

import {
  type ReinforcementFeedbackEnginePort,
  type ReinforcementFeedbackEvent,
  type ReinforcementFeedbackRequest,
  type ReinforcementFeedbackResult,
  type ReinforcementSignal,
  type StrategyLearningScore,
  type StrategyPerformanceObservation,
  type StrategyReinforcementState,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;
const DEFAULT_PRECISION = 12;

interface OutcomeComponents {
  readonly returnQuality: number;
  readonly riskAdjustedQuality: number;
  readonly drawdownQuality: number;
  readonly tailRiskQuality: number;
  readonly tradeQuality: number;
  readonly executionQuality: number;
  readonly stabilityQuality: number;
  readonly sampleConfidence: number;
  readonly rawOutcome: number;
}

interface StrategyFeedbackAccumulator {
  readonly strategyId: string;
  readonly rewards: readonly number[];
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly neutralCount: number;
  readonly latestTimestamp: string;
  readonly evidenceConfidence: number;
}

export interface ReinforcementFeedbackEngineOptions {
  /** Scale applied before tanh-normalizing return-rate and expectancy values. */
  readonly returnScale?: number;
  /** Scale applied before tanh-normalizing volatility. */
  readonly volatilityScale?: number;
  /** Scale applied before tanh-normalizing drawdown values. */
  readonly drawdownScale?: number;
  /** Scale applied before tanh-normalizing tail-loss and CVaR values. */
  readonly tailRiskScale?: number;
  /** Scale applied before tanh-normalizing execution and slippage costs. */
  readonly executionCostScale?: number;
  /** Absolute bound used when normalizing Sharpe, Sortino, and Calmar ratios. */
  readonly maximumAbsoluteRatio?: number;
  /** Sample size at which an individual observation reaches full confidence. */
  readonly fullConfidenceSampleSize?: number;
  /** Maximum absolute reward emitted for one observation. */
  readonly maximumAbsoluteReward?: number;
  /** Weight assigned to realized outcome in reward generation. */
  readonly outcomeRewardWeight?: number;
  /** Weight assigned to prediction error in reward generation. */
  readonly predictionErrorWeight?: number;
  /** Weight assigned to the learning score's confidence. */
  readonly learningConfidenceWeight?: number;
}

export class ReinforcementFeedbackEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "REINFORCEMENT_FEEDBACK_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "ReinforcementFeedbackEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ReinforcementFeedbackEngine
  implements ReinforcementFeedbackEnginePort
{
  private readonly returnScale: number;
  private readonly volatilityScale: number;
  private readonly drawdownScale: number;
  private readonly tailRiskScale: number;
  private readonly executionCostScale: number;
  private readonly maximumAbsoluteRatio: number;
  private readonly fullConfidenceSampleSize: number;
  private readonly maximumAbsoluteReward: number;
  private readonly outcomeRewardWeight: number;
  private readonly predictionErrorWeight: number;
  private readonly learningConfidenceWeight: number;

  public constructor(options: ReinforcementFeedbackEngineOptions = {}) {
    this.returnScale = positive(options.returnScale ?? 0.1, 0.1);
    this.volatilityScale = positive(options.volatilityScale ?? 0.25, 0.25);
    this.drawdownScale = positive(options.drawdownScale ?? 0.3, 0.3);
    this.tailRiskScale = positive(options.tailRiskScale ?? 0.2, 0.2);
    this.executionCostScale = positive(
      options.executionCostScale ?? 0.02,
      0.02,
    );
    this.maximumAbsoluteRatio = positive(
      options.maximumAbsoluteRatio ?? 20,
      20,
    );
    this.fullConfidenceSampleSize = Math.max(
      1,
      Math.trunc(options.fullConfidenceSampleSize ?? 100),
    );
    this.maximumAbsoluteReward = positive(
      options.maximumAbsoluteReward ?? 1,
      1,
    );
    this.outcomeRewardWeight = nonNegative(
      options.outcomeRewardWeight ?? 0.6,
    );
    this.predictionErrorWeight = nonNegative(
      options.predictionErrorWeight ?? 0.3,
    );
    this.learningConfidenceWeight = nonNegative(
      options.learningConfidenceWeight ?? 0.1,
    );
  }

  public apply(
    request: ReinforcementFeedbackRequest,
  ): ReinforcementFeedbackResult {
    this.assertRequest(request);

    const warnings: string[] = [];
    const learningScores = new Map(
      request.learningScores.map((score) => [score.strategyId, score]),
    );

    const observations = [...request.observations].sort(compareObservations);

    const events = observations.map((observation, index) => {
      const learningScore = learningScores.get(observation.strategyId);

      if (!learningScore) {
        warnings.push(
          `Strategy '${observation.strategyId}' has no learning score; a neutral expected outcome was used.`,
        );
      }

      return this.createFeedbackEvent(
        request,
        observation,
        learningScore,
        index,
      );
    });

    const states = this.buildStates(request, events, warnings);

    if (observations.length === 0) {
      warnings.push(
        "No performance observations were available for reinforcement feedback.",
      );
    }

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      events: events.sort(compareEvents),
      states: states.sort((left, right) =>
        left.strategyId.localeCompare(right.strategyId),
      ),
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private createFeedbackEvent(
    request: ReinforcementFeedbackRequest,
    observation: StrategyPerformanceObservation,
    learningScore: StrategyLearningScore | undefined,
    deterministicIndex: number,
  ): ReinforcementFeedbackEvent {
    const outcome = this.calculateOutcome(observation);
    const expectedOutcome = this.calculateExpectedOutcome(learningScore);
    const predictionError = outcome.rawOutcome - expectedOutcome;
    const reward = this.calculateReward(
      outcome.rawOutcome,
      predictionError,
      outcome.sampleConfidence,
      learningScore?.confidence ?? 0.5,
    );
    const signal = classifySignal(
      reward,
      request.positiveThreshold,
      request.negativeThreshold,
    );

    return freezeEvent({
      eventId: createDeterministicEventId(
        request.requestId,
        observation,
        deterministicIndex,
      ),
      strategyId: observation.strategyId,
      timestamp: observation.endedAt,
      signal,
      reward: round(reward),
      rawOutcome: round(outcome.rawOutcome),
      expectedOutcome: round(expectedOutcome),
      predictionError: round(
        round(outcome.rawOutcome) - round(expectedOutcome),
      ),
      regime: observation.regime,
      source: "STRATEGY_PERFORMANCE_OBSERVATION",
      observationId: observation.observationId,
      explanation: this.buildExplanation(
        observation,
        outcome,
        expectedOutcome,
        predictionError,
        reward,
        signal,
        learningScore,
      ),
      metadata: Object.freeze({
        sampleSize: observation.sampleSize,
        trades: observation.trades,
        returnRate: round(observation.returnRate),
        maximumDrawdown: round(observation.maximumDrawdown),
        sampleConfidence: round(outcome.sampleConfidence),
        learningScoreAvailable: learningScore !== undefined,
        learningScoreConfidence: round(learningScore?.confidence ?? 0.5),
        returnQuality: round(outcome.returnQuality),
        riskAdjustedQuality: round(outcome.riskAdjustedQuality),
        drawdownQuality: round(outcome.drawdownQuality),
        tailRiskQuality: round(outcome.tailRiskQuality),
        tradeQuality: round(outcome.tradeQuality),
        executionQuality: round(outcome.executionQuality),
        stabilityQuality: round(outcome.stabilityQuality),
      }),
    });
  }

  private calculateOutcome(
    observation: StrategyPerformanceObservation,
  ): OutcomeComponents {
    const returnQuality = average([
      normalizeSigned(observation.returnRate, this.returnScale),
      normalizeSigned(observation.averageTradeReturn, this.returnScale / 4),
      normalizeSigned(observation.expectancy, this.returnScale / 4),
      normalizeSigned(observation.netProfit, profitScale(observation)),
    ]);

    const riskAdjustedQuality = average([
      normalizeSignedRatio(
        observation.sharpeRatio,
        this.maximumAbsoluteRatio,
      ),
      normalizeSignedRatio(
        observation.sortinoRatio,
        this.maximumAbsoluteRatio,
      ),
      normalizeSignedRatio(
        observation.calmarRatio,
        this.maximumAbsoluteRatio,
      ),
      normalizeProfitFactor(observation.profitFactor),
    ]);

    const drawdownQuality = 1 - average([
      normalizeMagnitude(
        observation.maximumDrawdown,
        this.drawdownScale,
      ),
      normalizeMagnitude(
        observation.averageDrawdown,
        this.drawdownScale / 2,
      ),
    ]);

    const tailRiskQuality = 1 - average([
      normalizeMagnitude(observation.tailLoss, this.tailRiskScale),
      normalizeMagnitude(observation.valueAtRisk, this.tailRiskScale),
      normalizeMagnitude(
        observation.conditionalValueAtRisk,
        this.tailRiskScale,
      ),
    ]);

    const tradeQuality = average([
      clamp01(observation.winRate),
      normalizeTradeBalance(observation),
      normalizeProfitFactor(observation.profitFactor),
    ]);

    const executionQuality = 1 - average([
      normalizeMagnitude(
        observation.executionCost,
        this.executionCostScale,
      ),
      normalizeMagnitude(
        observation.slippageCost,
        this.executionCostScale,
      ),
      normalizeMagnitude(observation.turnover, 2),
    ]);

    const stabilityQuality = average([
      1 - normalizeMagnitude(observation.volatility, this.volatilityScale),
      drawdownQuality,
      tailRiskQuality,
    ]);

    const sampleConfidence = clamp01(
      observation.sampleSize / this.fullConfidenceSampleSize,
    );

    const normalizedOutcome = weightedAverage([
      { value: returnQuality, weight: 0.26 },
      { value: riskAdjustedQuality, weight: 0.22 },
      { value: drawdownQuality, weight: 0.16 },
      { value: tailRiskQuality, weight: 0.12 },
      { value: tradeQuality, weight: 0.1 },
      { value: executionQuality, weight: 0.07 },
      { value: stabilityQuality, weight: 0.07 },
    ]);

    const confidenceAdjustedOutcome =
      0.5 + (normalizedOutcome - 0.5) * (0.4 + 0.6 * sampleConfidence);

    return Object.freeze({
      returnQuality: clamp01(returnQuality),
      riskAdjustedQuality: clamp01(riskAdjustedQuality),
      drawdownQuality: clamp01(drawdownQuality),
      tailRiskQuality: clamp01(tailRiskQuality),
      tradeQuality: clamp01(tradeQuality),
      executionQuality: clamp01(executionQuality),
      stabilityQuality: clamp01(stabilityQuality),
      sampleConfidence,
      rawOutcome: clamp(confidenceAdjustedOutcome * 2 - 1, -1, 1),
    });
  }

  private calculateExpectedOutcome(
    score: StrategyLearningScore | undefined,
  ): number {
    if (!score) {
      return 0;
    }

    const normalizedExpectation = weightedAverage([
      { value: clamp01(score.normalizedScore), weight: 0.38 },
      { value: clamp01(score.riskAdjustedScore), weight: 0.24 },
      { value: clamp01(score.stabilityScore), weight: 0.16 },
      { value: clamp01(score.regimeRobustnessScore), weight: 0.12 },
      { value: clamp01((clamp(score.rawScore, -1, 1) + 1) / 2), weight: 0.1 },
    ]);

    const confidence = clamp01(score.confidence);
    const confidenceAdjusted =
      0.5 + (normalizedExpectation - 0.5) * confidence;

    return clamp(confidenceAdjusted * 2 - 1, -1, 1);
  }

  private calculateReward(
    rawOutcome: number,
    predictionError: number,
    sampleConfidence: number,
    learningConfidence: number,
  ): number {
    const totalWeight =
      this.outcomeRewardWeight +
      this.predictionErrorWeight +
      this.learningConfidenceWeight;

    if (totalWeight <= EPSILON) {
      return 0;
    }

    const confidenceSignal =
      clamp01(learningConfidence) * Math.sign(rawOutcome) * Math.abs(rawOutcome);

    const baseReward =
      rawOutcome * this.outcomeRewardWeight +
      predictionError * this.predictionErrorWeight +
      confidenceSignal * this.learningConfidenceWeight;

    const evidenceMultiplier = 0.5 + 0.5 * clamp01(sampleConfidence);

    return clamp(
      safeDivide(baseReward, totalWeight) *
        evidenceMultiplier *
        this.maximumAbsoluteReward,
      -this.maximumAbsoluteReward,
      this.maximumAbsoluteReward,
    );
  }

  private buildStates(
    request: ReinforcementFeedbackRequest,
    events: readonly ReinforcementFeedbackEvent[],
    warnings: string[],
  ): StrategyReinforcementState[] {
    const previousStates = new Map(
      request.previousStates.map((state) => [state.strategyId, state]),
    );

    const strategyIds = Array.from(
      new Set([
        ...request.previousStates.map((state) => state.strategyId),
        ...request.learningScores.map((score) => score.strategyId),
        ...request.observations.map((observation) => observation.strategyId),
      ]),
    ).sort();

    return strategyIds.map((strategyId) => {
      const previous = previousStates.get(strategyId);
      const strategyEvents = events
        .filter((event) => event.strategyId === strategyId)
        .sort(compareEvents);
      const learningScore = request.learningScores.find(
        (score) => score.strategyId === strategyId,
      );
      const accumulator = this.accumulateFeedback(
        strategyId,
        strategyEvents,
        learningScore,
        request.generatedAt,
      );

      if (!previous && strategyEvents.length === 0) {
        warnings.push(
          `Strategy '${strategyId}' has no previous reinforcement state or new feedback events; a neutral state was initialized.`,
        );
      }

      let exponentiallyWeightedReward =
        previous?.exponentiallyWeightedReward ?? 0;

      for (const reward of accumulator.rewards) {
        exponentiallyWeightedReward =
          request.rewardDecay * exponentiallyWeightedReward +
          (1 - request.rewardDecay) * reward;
      }

      const previousFeedbackCount = previous
        ? previous.positiveFeedbackCount +
          previous.negativeFeedbackCount +
          previous.neutralFeedbackCount
        : 0;
      const newFeedbackCount = accumulator.rewards.length;
      const totalFeedbackCount = previousFeedbackCount + newFeedbackCount;

      const historicalConfidence = previous?.confidence ?? 0;
      const historicalWeight = Math.max(0, previousFeedbackCount);
      const evidenceWeight = Math.max(0, newFeedbackCount);
      const confidence =
        totalFeedbackCount === 0
          ? clamp01(learningScore?.confidence ?? 0)
          : clamp01(
              weightedAverage([
                { value: historicalConfidence, weight: historicalWeight },
                {
                  value: accumulator.evidenceConfidence,
                  weight: evidenceWeight,
                },
              ]),
            );

      return freezeState({
        strategyId,
        cumulativeReward: round(
          (previous?.cumulativeReward ?? 0) + sum(accumulator.rewards),
        ),
        exponentiallyWeightedReward: round(exponentiallyWeightedReward),
        positiveFeedbackCount:
          (previous?.positiveFeedbackCount ?? 0) + accumulator.positiveCount,
        negativeFeedbackCount:
          (previous?.negativeFeedbackCount ?? 0) + accumulator.negativeCount,
        neutralFeedbackCount:
          (previous?.neutralFeedbackCount ?? 0) + accumulator.neutralCount,
        confidence: round(confidence),
        lastUpdatedAt:
          strategyEvents.length > 0
            ? accumulator.latestTimestamp
            : previous?.lastUpdatedAt ?? request.generatedAt,
      });
    });
  }

  private accumulateFeedback(
    strategyId: string,
    events: readonly ReinforcementFeedbackEvent[],
    learningScore: StrategyLearningScore | undefined,
    fallbackTimestamp: string,
  ): StrategyFeedbackAccumulator {
    const rewards = events.map((event) => event.reward);
    const positiveCount = events.filter(
      (event) =>
        event.signal === "POSITIVE" ||
        event.signal === "STRONGLY_POSITIVE",
    ).length;
    const negativeCount = events.filter(
      (event) =>
        event.signal === "NEGATIVE" ||
        event.signal === "STRONGLY_NEGATIVE",
    ).length;
    const neutralCount = events.length - positiveCount - negativeCount;

    const evidenceConfidence =
      events.length === 0
        ? clamp01(learningScore?.confidence ?? 0)
        : clamp01(
            weightedAverage(
              events.map((event) => ({
                value: metadataNumber(event.metadata, "sampleConfidence", 0),
                weight: 1,
              })),
            ) * 0.7 +
              clamp01(learningScore?.confidence ?? 0.5) * 0.3,
          );

    return Object.freeze({
      strategyId,
      rewards: Object.freeze(rewards),
      positiveCount,
      negativeCount,
      neutralCount,
      latestTimestamp:
        events.length === 0
          ? fallbackTimestamp
          : events.reduce((latest, event) =>
              Date.parse(event.timestamp) > Date.parse(latest)
                ? event.timestamp
                : latest,
            events[0].timestamp),
      evidenceConfidence,
    });
  }

  private buildExplanation(
    observation: StrategyPerformanceObservation,
    outcome: OutcomeComponents,
    expectedOutcome: number,
    predictionError: number,
    reward: number,
    signal: ReinforcementSignal,
    learningScore: StrategyLearningScore | undefined,
  ): string {
    const parts: string[] = [];

    parts.push(
      `${signal.replaceAll("_", " ")} reinforcement was generated for strategy '${observation.strategyId}'.`,
    );
    parts.push(
      `The realized outcome was ${formatSigned(outcome.rawOutcome)} versus an expected outcome of ${formatSigned(expectedOutcome)}, producing a prediction error of ${formatSigned(predictionError)}.`,
    );
    parts.push(`The bounded reward was ${formatSigned(reward)}.`);

    if (outcome.returnQuality >= 0.7) {
      parts.push("Return and expectancy evidence was favorable.");
    } else if (outcome.returnQuality <= 0.3) {
      parts.push("Return and expectancy evidence was unfavorable.");
    }

    if (outcome.riskAdjustedQuality >= 0.7) {
      parts.push("Risk-adjusted performance supported positive feedback.");
    } else if (outcome.riskAdjustedQuality <= 0.3) {
      parts.push("Weak risk-adjusted performance reduced the reward.");
    }

    if (outcome.drawdownQuality <= 0.3) {
      parts.push("Drawdown severity materially reduced the realized outcome.");
    }

    if (outcome.tailRiskQuality <= 0.3) {
      parts.push("Tail-risk evidence materially reduced the realized outcome.");
    }

    if (outcome.executionQuality <= 0.3) {
      parts.push("Execution cost, slippage, or turnover reduced the reward.");
    }

    if (outcome.sampleConfidence < 0.5) {
      parts.push("Limited sample evidence reduced feedback magnitude.");
    }

    if (!learningScore) {
      parts.push("No strategy learning score was available, so expectation was neutral.");
    }

    return parts.join(" ");
  }

  private assertRequest(request: ReinforcementFeedbackRequest): void {
    if (request === null || typeof request !== "object") {
      throw new ReinforcementFeedbackEngineError(
        "Reinforcement feedback request must be an object.",
        "INVALID_REINFORCEMENT_FEEDBACK_REQUEST",
      );
    }

    assertNonEmptyString(request.requestId, "requestId");
    assertTimestamp(request.generatedAt, "generatedAt");

    if (!Array.isArray(request.observations)) {
      throw new ReinforcementFeedbackEngineError(
        "observations must be an array.",
        "INVALID_REINFORCEMENT_OBSERVATIONS",
      );
    }

    if (!Array.isArray(request.learningScores)) {
      throw new ReinforcementFeedbackEngineError(
        "learningScores must be an array.",
        "INVALID_REINFORCEMENT_LEARNING_SCORES",
      );
    }

    if (!Array.isArray(request.previousStates)) {
      throw new ReinforcementFeedbackEngineError(
        "previousStates must be an array.",
        "INVALID_PREVIOUS_REINFORCEMENT_STATES",
      );
    }

    assertUnitInterval(request.rewardDecay, "rewardDecay");
    assertFiniteNumber(request.positiveThreshold, "positiveThreshold");
    assertFiniteNumber(request.negativeThreshold, "negativeThreshold");

    if (request.negativeThreshold > request.positiveThreshold) {
      throw new ReinforcementFeedbackEngineError(
        "negativeThreshold cannot exceed positiveThreshold.",
        "INVALID_REINFORCEMENT_THRESHOLD_RANGE",
      );
    }

    assertUnique(
      request.learningScores.map((score) => score.strategyId),
      "learningScores",
    );
    assertUnique(
      request.previousStates.map((state) => state.strategyId),
      "previousStates",
    );
    assertUnique(
      request.observations.map((observation) => observation.observationId),
      "observations",
    );

    for (const [index, observation] of request.observations.entries()) {
      this.assertObservation(observation, `observations[${index}]`);
    }

    for (const [index, score] of request.learningScores.entries()) {
      this.assertLearningScore(score, `learningScores[${index}]`);
    }

    for (const [index, state] of request.previousStates.entries()) {
      this.assertPreviousState(state, `previousStates[${index}]`);
    }
  }

  private assertObservation(
    observation: StrategyPerformanceObservation,
    path: string,
  ): void {
    if (observation === null || typeof observation !== "object") {
      throw new ReinforcementFeedbackEngineError(
        `${path} must be an object.`,
        "INVALID_REINFORCEMENT_OBSERVATION",
      );
    }

    assertNonEmptyString(observation.observationId, `${path}.observationId`);
    assertNonEmptyString(observation.strategyId, `${path}.strategyId`);
    assertTimestamp(observation.startedAt, `${path}.startedAt`);
    assertTimestamp(observation.endedAt, `${path}.endedAt`);

    if (Date.parse(observation.endedAt) < Date.parse(observation.startedAt)) {
      throw new ReinforcementFeedbackEngineError(
        `${path}.endedAt cannot precede startedAt.`,
        "INVALID_OBSERVATION_TIME_RANGE",
      );
    }

    if (!Number.isInteger(observation.sampleSize) || observation.sampleSize < 0) {
      throw new ReinforcementFeedbackEngineError(
        `${path}.sampleSize must be a non-negative integer.`,
        "INVALID_OBSERVATION_SAMPLE_SIZE",
      );
    }

    for (const field of ["trades", "winningTrades", "losingTrades"] as const) {
      const value = observation[field];
      if (!Number.isInteger(value) || value < 0) {
        throw new ReinforcementFeedbackEngineError(
          `${path}.${field} must be a non-negative integer.`,
          "INVALID_OBSERVATION_COUNT",
        );
      }
    }

    const numericFields: readonly (keyof StrategyPerformanceObservation)[] = [
      "grossProfit",
      "grossLoss",
      "netProfit",
      "returnRate",
      "volatility",
      "maximumDrawdown",
      "averageDrawdown",
      "sharpeRatio",
      "sortinoRatio",
      "calmarRatio",
      "profitFactor",
      "winRate",
      "expectancy",
      "averageTradeReturn",
      "tailLoss",
      "valueAtRisk",
      "conditionalValueAtRisk",
      "turnover",
      "averageHoldingPeriodMs",
      "executionCost",
      "slippageCost",
    ];

    for (const field of numericFields) {
      assertFiniteNumber(observation[field] as number, `${path}.${field}`);
    }

    if (observation.winRate < 0 || observation.winRate > 1) {
      throw new ReinforcementFeedbackEngineError(
        `${path}.winRate must be between 0 and 1.`,
        "INVALID_OBSERVATION_WIN_RATE",
      );
    }
  }

  private assertLearningScore(
    score: StrategyLearningScore,
    path: string,
  ): void {
    if (score === null || typeof score !== "object") {
      throw new ReinforcementFeedbackEngineError(
        `${path} must be an object.`,
        "INVALID_REINFORCEMENT_LEARNING_SCORE",
      );
    }

    assertNonEmptyString(score.strategyId, `${path}.strategyId`);
    assertFiniteNumber(score.rawScore, `${path}.rawScore`);

    for (const field of [
      "normalizedScore",
      "confidence",
      "stabilityScore",
      "regimeRobustnessScore",
      "riskAdjustedScore",
      "drawdownPenalty",
      "tailRiskPenalty",
      "executionCostPenalty",
      "sampleSizePenalty",
    ] as const) {
      assertUnitInterval(score[field], `${path}.${field}`);
    }
  }

  private assertPreviousState(
    state: StrategyReinforcementState,
    path: string,
  ): void {
    if (state === null || typeof state !== "object") {
      throw new ReinforcementFeedbackEngineError(
        `${path} must be an object.`,
        "INVALID_PREVIOUS_REINFORCEMENT_STATE",
      );
    }

    assertNonEmptyString(state.strategyId, `${path}.strategyId`);
    assertFiniteNumber(state.cumulativeReward, `${path}.cumulativeReward`);
    assertFiniteNumber(
      state.exponentiallyWeightedReward,
      `${path}.exponentiallyWeightedReward`,
    );
    assertNonNegativeInteger(
      state.positiveFeedbackCount,
      `${path}.positiveFeedbackCount`,
    );
    assertNonNegativeInteger(
      state.negativeFeedbackCount,
      `${path}.negativeFeedbackCount`,
    );
    assertNonNegativeInteger(
      state.neutralFeedbackCount,
      `${path}.neutralFeedbackCount`,
    );
    assertUnitInterval(state.confidence, `${path}.confidence`);
    assertTimestamp(state.lastUpdatedAt, `${path}.lastUpdatedAt`);
  }
}

export function createReinforcementFeedbackEngine(
  options: ReinforcementFeedbackEngineOptions = {},
): ReinforcementFeedbackEngine {
  return new ReinforcementFeedbackEngine(options);
}

function classifySignal(
  reward: number,
  positiveThreshold: number,
  negativeThreshold: number,
): ReinforcementSignal {
  const positiveMagnitude = Math.max(EPSILON, Math.abs(positiveThreshold));
  const negativeMagnitude = Math.max(EPSILON, Math.abs(negativeThreshold));

  if (reward >= positiveThreshold * 2 && reward > 0) {
    return "STRONGLY_POSITIVE";
  }

  if (reward >= positiveThreshold) {
    return "POSITIVE";
  }

  if (reward <= negativeThreshold * 2 && reward < 0) {
    return "STRONGLY_NEGATIVE";
  }

  if (reward <= negativeThreshold) {
    return "NEGATIVE";
  }

  if (reward >= positiveMagnitude * 2) {
    return "STRONGLY_POSITIVE";
  }

  if (reward <= -negativeMagnitude * 2) {
    return "STRONGLY_NEGATIVE";
  }

  return "NEUTRAL";
}

function compareObservations(
  left: StrategyPerformanceObservation,
  right: StrategyPerformanceObservation,
): number {
  const strategyComparison = left.strategyId.localeCompare(right.strategyId);
  if (strategyComparison !== 0) {
    return strategyComparison;
  }

  const timeComparison = Date.parse(left.endedAt) - Date.parse(right.endedAt);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.observationId.localeCompare(right.observationId);
}

function compareEvents(
  left: ReinforcementFeedbackEvent,
  right: ReinforcementFeedbackEvent,
): number {
  const strategyComparison = left.strategyId.localeCompare(right.strategyId);
  if (strategyComparison !== 0) {
    return strategyComparison;
  }

  const timeComparison = Date.parse(left.timestamp) - Date.parse(right.timestamp);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.eventId.localeCompare(right.eventId);
}

function createDeterministicEventId(
  requestId: string,
  observation: StrategyPerformanceObservation,
  index: number,
): string {
  const seed = [
    requestId,
    observation.strategyId,
    observation.observationId,
    observation.endedAt,
    index.toString(10),
  ].join("|");

  return `reinforcement-feedback-${stableHash(seed)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function freezeEvent(
  event: ReinforcementFeedbackEvent,
): ReinforcementFeedbackEvent {
  return Object.freeze({
    ...event,
    metadata: Object.freeze({ ...event.metadata }),
  });
}

function freezeState(
  state: StrategyReinforcementState,
): StrategyReinforcementState {
  return Object.freeze({ ...state });
}

function freezeResult(
  result: ReinforcementFeedbackResult,
): ReinforcementFeedbackResult {
  return Object.freeze({
    ...result,
    events: Object.freeze([...result.events]),
    states: Object.freeze([...result.states]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function normalizeSigned(value: number, scale: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return clamp01((Math.tanh(value / Math.max(EPSILON, scale)) + 1) / 2);
}

function normalizeSignedRatio(value: number, maximumAbsolute: number): number {
  const bounded = clamp(value, -maximumAbsolute, maximumAbsolute);
  return clamp01((bounded / maximumAbsolute + 1) / 2);
}

function normalizeMagnitude(value: number, scale: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return clamp01(Math.abs(value) / Math.max(EPSILON, scale));
}

function normalizeProfitFactor(value: number): number {
  if (!Number.isFinite(value)) {
    return value === Number.POSITIVE_INFINITY ? 1 : 0;
  }

  if (value <= 0) {
    return 0;
  }

  return clamp01(value / 2);
}

function normalizeTradeBalance(
  observation: StrategyPerformanceObservation,
): number {
  const classifiedTrades = observation.winningTrades + observation.losingTrades;
  if (classifiedTrades <= 0) {
    return observation.trades <= 0 ? 0.5 : clamp01(observation.winRate);
  }

  return clamp01(observation.winningTrades / classifiedTrades);
}

function profitScale(observation: StrategyPerformanceObservation): number {
  const grossMagnitude =
    Math.abs(observation.grossProfit) + Math.abs(observation.grossLoss);
  return Math.max(1, grossMagnitude, Math.abs(observation.netProfit));
}

function metadataNumber(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function weightedAverage(
  entries: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
): number {
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

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return safeDivide(sum(values), values.length);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
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

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReinforcementFeedbackEngineError(
      `${fieldName} must be a non-empty string.`,
      "INVALID_REINFORCEMENT_STRING",
    );
  }
}

function assertTimestamp(value: string, fieldName: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new ReinforcementFeedbackEngineError(
      `${fieldName} must be a valid timestamp.`,
      "INVALID_REINFORCEMENT_TIMESTAMP",
    );
  }
}

function assertFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new ReinforcementFeedbackEngineError(
      `${fieldName} must be a finite number.`,
      "INVALID_REINFORCEMENT_NUMBER",
    );
  }
}

function assertUnitInterval(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ReinforcementFeedbackEngineError(
      `${fieldName} must be a finite number between 0 and 1.`,
      "INVALID_REINFORCEMENT_UNIT_INTERVAL",
    );
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ReinforcementFeedbackEngineError(
      `${fieldName} must be a non-negative integer.`,
      "INVALID_REINFORCEMENT_COUNT",
    );
  }
}

function assertUnique(values: readonly string[], fieldName: string): void {
  if (new Set(values).size !== values.length) {
    throw new ReinforcementFeedbackEngineError(
      `${fieldName} contains duplicate identifiers.`,
      "DUPLICATE_REINFORCEMENT_IDENTIFIER",
    );
  }
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = DEFAULT_PRECISION): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatSigned(value: number): string {
  const rounded = round(value, 6);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}