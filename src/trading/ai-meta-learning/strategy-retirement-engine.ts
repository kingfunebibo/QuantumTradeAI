/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 11:
 * src/trading/ai-meta-learning/strategy-retirement-engine.ts
 *
 * Deterministic production-grade strategy retirement engine.
 */

import {
  type LearnedRegimeProfile,
  type StrategyDescriptor,
  type StrategyLearningScore,
  type StrategyLifecycleState,
  type StrategyPerformanceObservation,
  type StrategyReinforcementState,
  type StrategyRetirementAssessment,
  type StrategyRetirementDecision,
  type StrategyRetirementEnginePort,
  type StrategyRetirementPolicy,
  type StrategyRetirementRequest,
  type StrategyRetirementResult,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;

const LIFECYCLE_STATES: readonly StrategyLifecycleState[] = Object.freeze([
  "CANDIDATE",
  "EXPERIMENTAL",
  "ACTIVE",
  "PROBATION",
  "DEGRADED",
  "RETIRED",
  "ARCHIVED",
]);

interface RetirementContext {
  readonly descriptor: StrategyDescriptor;
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly learningScore?: StrategyLearningScore;
  readonly reinforcementState?: StrategyReinforcementState;
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
}

interface RetirementEvidence {
  readonly degradationScore: number;
  readonly drawdownSeverity: number;
  readonly negativeFeedbackScore: number;
  readonly regimeRelevanceScore: number;
  readonly regimeObsolescenceScore: number;
  readonly confidence: number;
  readonly failedRunEvidence: number;
  readonly hasLearningScore: boolean;
  readonly hasObservations: boolean;
  readonly hasReinforcementState: boolean;
  readonly hasRegimeEvidence: boolean;
}

export interface StrategyRetirementEngineOptions {
  readonly performanceDegradationWeight?: number;
  readonly stabilityDegradationWeight?: number;
  readonly riskAdjustedDegradationWeight?: number;
  readonly drawdownPenaltyWeight?: number;
  readonly tailRiskPenaltyWeight?: number;
  readonly executionCostPenaltyWeight?: number;
  readonly samplePenaltyWeight?: number;
  readonly drawdownSeverityWeight?: number;
  readonly negativeFeedbackWeight?: number;
  readonly regimeObsolescenceWeight?: number;
  readonly learningConfidenceWeight?: number;
  readonly reinforcementConfidenceWeight?: number;
  readonly observationConfidenceWeight?: number;
  readonly regimeConfidenceWeight?: number;
  readonly fullConfidenceObservationCount?: number;
}

export class StrategyRetirementEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "STRATEGY_RETIREMENT_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "StrategyRetirementEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StrategyRetirementEngine implements StrategyRetirementEnginePort {
  private readonly performanceDegradationWeight: number;
  private readonly stabilityDegradationWeight: number;
  private readonly riskAdjustedDegradationWeight: number;
  private readonly drawdownPenaltyWeight: number;
  private readonly tailRiskPenaltyWeight: number;
  private readonly executionCostPenaltyWeight: number;
  private readonly samplePenaltyWeight: number;
  private readonly drawdownSeverityWeight: number;
  private readonly negativeFeedbackWeight: number;
  private readonly regimeObsolescenceWeight: number;
  private readonly learningConfidenceWeight: number;
  private readonly reinforcementConfidenceWeight: number;
  private readonly observationConfidenceWeight: number;
  private readonly regimeConfidenceWeight: number;
  private readonly fullConfidenceObservationCount: number;

  public constructor(options: StrategyRetirementEngineOptions = {}) {
    this.performanceDegradationWeight = nonNegative(
      options.performanceDegradationWeight ?? 0.28,
    );
    this.stabilityDegradationWeight = nonNegative(
      options.stabilityDegradationWeight ?? 0.18,
    );
    this.riskAdjustedDegradationWeight = nonNegative(
      options.riskAdjustedDegradationWeight ?? 0.16,
    );
    this.drawdownPenaltyWeight = nonNegative(
      options.drawdownPenaltyWeight ?? 0.14,
    );
    this.tailRiskPenaltyWeight = nonNegative(
      options.tailRiskPenaltyWeight ?? 0.1,
    );
    this.executionCostPenaltyWeight = nonNegative(
      options.executionCostPenaltyWeight ?? 0.06,
    );
    this.samplePenaltyWeight = nonNegative(
      options.samplePenaltyWeight ?? 0.08,
    );
    this.drawdownSeverityWeight = nonNegative(
      options.drawdownSeverityWeight ?? 0.25,
    );
    this.negativeFeedbackWeight = nonNegative(
      options.negativeFeedbackWeight ?? 0.25,
    );
    this.regimeObsolescenceWeight = nonNegative(
      options.regimeObsolescenceWeight ?? 0.2,
    );
    this.learningConfidenceWeight = nonNegative(
      options.learningConfidenceWeight ?? 0.35,
    );
    this.reinforcementConfidenceWeight = nonNegative(
      options.reinforcementConfidenceWeight ?? 0.25,
    );
    this.observationConfidenceWeight = nonNegative(
      options.observationConfidenceWeight ?? 0.25,
    );
    this.regimeConfidenceWeight = nonNegative(
      options.regimeConfidenceWeight ?? 0.15,
    );
    this.fullConfidenceObservationCount = positiveIntegerOption(
      options.fullConfidenceObservationCount ?? 20,
      "fullConfidenceObservationCount",
    );
  }

  public evaluate(request: StrategyRetirementRequest): StrategyRetirementResult {
    this.assertRequest(request);

    const warnings: string[] = [];
    const descriptorIds = new Set(
      request.descriptors.map((descriptor) => descriptor.strategyId),
    );

    const observationsByStrategy = groupByStrategy(
      request.observations,
      compareObservations,
    );
    const learningScoresByStrategy = indexByStrategy(request.learningScores);
    const reinforcementStatesByStrategy = indexByStrategy(
      request.reinforcementStates,
    );

    this.collectUnknownStrategyWarnings(
      request,
      descriptorIds,
      warnings,
    );

    const sortedDescriptors = [...request.descriptors].sort((left, right) =>
      left.strategyId.localeCompare(right.strategyId),
    );

    const assessments = sortedDescriptors.map((descriptor) =>
      this.assess(
        {
          descriptor,
          observations:
            observationsByStrategy.get(descriptor.strategyId) ?? Object.freeze([]),
          learningScore: learningScoresByStrategy.get(descriptor.strategyId),
          reinforcementState: reinforcementStatesByStrategy.get(
            descriptor.strategyId,
          ),
          regimeProfiles: request.regimeProfiles,
        },
        request.policy,
      ),
    );

    const retiredStrategyIds = assessments
      .filter((assessment) => assessment.decision === "RETIRE")
      .map((assessment) => assessment.strategyId)
      .sort();

    const probationStrategyIds = assessments
      .filter((assessment) => assessment.decision === "PLACE_ON_PROBATION")
      .map((assessment) => assessment.strategyId)
      .sort();

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      assessments,
      retiredStrategyIds,
      probationStrategyIds,
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private assess(
    context: RetirementContext,
    policy: StrategyRetirementPolicy,
  ): StrategyRetirementAssessment {
    const evidence = this.calculateEvidence(context, policy);
    const reasons: string[] = [];

    const degradationFailed =
      evidence.degradationScore + EPSILON >= policy.minimumDegradationScore;
    const drawdownFailed =
      evidence.drawdownSeverity > policy.maximumAcceptableDrawdown + EPSILON;
    const feedbackFailed =
      evidence.negativeFeedbackScore + EPSILON >=
      policy.maximumNegativeFeedbackScore;
    const regimeFailed =
      evidence.regimeRelevanceScore + EPSILON <
      policy.minimumRegimeRelevanceScore;
    const confidencePassed =
      evidence.confidence + EPSILON >= policy.minimumConfidence;
    const failedRunsPassed =
      evidence.failedRunEvidence >= policy.requiredConsecutiveFailedRuns;

    this.addThresholdReason(
      reasons,
      "Degradation",
      evidence.degradationScore,
      policy.minimumDegradationScore,
      degradationFailed,
      "at or above",
    );
    this.addThresholdReason(
      reasons,
      "Drawdown severity",
      evidence.drawdownSeverity,
      policy.maximumAcceptableDrawdown,
      drawdownFailed,
      "above",
    );
    this.addThresholdReason(
      reasons,
      "Negative feedback",
      evidence.negativeFeedbackScore,
      policy.maximumNegativeFeedbackScore,
      feedbackFailed,
      "at or above",
    );
    this.addThresholdReason(
      reasons,
      "Regime relevance",
      evidence.regimeRelevanceScore,
      policy.minimumRegimeRelevanceScore,
      regimeFailed,
      "below",
    );
    this.addThresholdReason(
      reasons,
      "Retirement confidence",
      evidence.confidence,
      policy.minimumConfidence,
      confidencePassed,
      "at or above",
    );

    if (failedRunsPassed) {
      reasons.push(
        `Negative reinforcement count (${evidence.failedRunEvidence}) satisfies the required failed-run evidence (${policy.requiredConsecutiveFailedRuns}).`,
      );
    } else {
      reasons.push(
        `Negative reinforcement count (${evidence.failedRunEvidence}) does not yet satisfy the required failed-run evidence (${policy.requiredConsecutiveFailedRuns}).`,
      );
    }

    reasons.push(
      "The contracts do not retain ordered run outcomes, so negative reinforcement count is used as the deterministic proxy for consecutive failed runs.",
    );

    this.addEvidenceAvailabilityReasons(reasons, evidence);

    const materialFailureCount = [
      degradationFailed,
      drawdownFailed,
      feedbackFailed,
      regimeFailed,
    ].filter(Boolean).length;

    const retirementConditionsPassed =
      degradationFailed &&
      confidencePassed &&
      failedRunsPassed &&
      materialFailureCount >= 2;

    const probationConditionsPassed =
      degradationFailed ||
      drawdownFailed ||
      feedbackFailed ||
      regimeFailed;

    const transition = this.determineTransition(
      context.descriptor.lifecycleState,
      policy,
      {
        retirementConditionsPassed,
        probationConditionsPassed,
        confidencePassed,
        failedRunsPassed,
        evidenceComplete:
          evidence.hasLearningScore &&
          evidence.hasObservations &&
          evidence.hasReinforcementState,
      },
      reasons,
    );

    return freezeAssessment({
      strategyId: context.descriptor.strategyId,
      currentState: context.descriptor.lifecycleState,
      proposedState: transition.proposedState,
      decision: transition.decision,
      degradationScore: round(evidence.degradationScore),
      drawdownSeverity: round(evidence.drawdownSeverity),
      negativeFeedbackScore: round(evidence.negativeFeedbackScore),
      regimeObsolescenceScore: round(evidence.regimeObsolescenceScore),
      confidence: round(evidence.confidence),
      reasons: Array.from(new Set(reasons)),
    });
  }

  private calculateEvidence(
    context: RetirementContext,
    policy: StrategyRetirementPolicy,
  ): RetirementEvidence {
    const learningScore = context.learningScore;

    const degradationNumerator =
      (1 - clamp01(learningScore?.normalizedScore ?? 0.5)) *
        this.performanceDegradationWeight +
      (1 - clamp01(learningScore?.stabilityScore ?? 0.5)) *
        this.stabilityDegradationWeight +
      (1 - clamp01(learningScore?.riskAdjustedScore ?? 0.5)) *
        this.riskAdjustedDegradationWeight +
      clamp01(learningScore?.drawdownPenalty ?? 0) *
        this.drawdownPenaltyWeight +
      clamp01(learningScore?.tailRiskPenalty ?? 0) *
        this.tailRiskPenaltyWeight +
      clamp01(learningScore?.executionCostPenalty ?? 0) *
        this.executionCostPenaltyWeight +
      clamp01(learningScore?.sampleSizePenalty ?? 0) *
        this.samplePenaltyWeight;

    const degradationDenominator =
      this.performanceDegradationWeight +
      this.stabilityDegradationWeight +
      this.riskAdjustedDegradationWeight +
      this.drawdownPenaltyWeight +
      this.tailRiskPenaltyWeight +
      this.executionCostPenaltyWeight +
      this.samplePenaltyWeight;

    const baseDegradation = clamp01(
      safeDivide(degradationNumerator, degradationDenominator),
    );

    const drawdownSeverity = this.calculateDrawdownSeverity(
      context.observations,
    );
    const negativeFeedbackScore = this.calculateNegativeFeedbackScore(
      context.reinforcementState,
    );
    const regimeRelevance = this.calculateRegimeRelevance(context);
    const regimeObsolescenceScore = clamp01(1 - regimeRelevance.score);

    const compositePenaltyNumerator =
      drawdownSeverity * this.drawdownSeverityWeight +
      negativeFeedbackScore * this.negativeFeedbackWeight +
      regimeObsolescenceScore * this.regimeObsolescenceWeight;
    const compositePenaltyDenominator =
      this.drawdownSeverityWeight +
      this.negativeFeedbackWeight +
      this.regimeObsolescenceWeight;
    const compositePenalty = safeDivide(
      compositePenaltyNumerator,
      compositePenaltyDenominator,
    );

    const degradationScore = clamp01(
      baseDegradation * 0.7 + compositePenalty * 0.3,
    );

    const observationConfidence = clamp01(
      context.observations.length / this.fullConfidenceObservationCount,
    );
    const confidenceNumerator =
      (learningScore?.confidence ?? 0) * this.learningConfidenceWeight +
      (context.reinforcementState?.confidence ?? 0) *
        this.reinforcementConfidenceWeight +
      observationConfidence * this.observationConfidenceWeight +
      regimeRelevance.confidence * this.regimeConfidenceWeight;
    const confidenceDenominator =
      this.learningConfidenceWeight +
      this.reinforcementConfidenceWeight +
      this.observationConfidenceWeight +
      this.regimeConfidenceWeight;

    const evidenceCoverage = average([
      learningScore ? 1 : 0,
      context.observations.length > 0 ? 1 : 0,
      context.reinforcementState ? 1 : 0,
      regimeRelevance.hasEvidence ? 1 : 0,
    ]);

    const confidence = clamp01(
      safeDivide(confidenceNumerator, confidenceDenominator) *
        (0.5 + evidenceCoverage * 0.5),
    );

    return Object.freeze({
      degradationScore: round(degradationScore),
      drawdownSeverity: round(drawdownSeverity),
      negativeFeedbackScore: round(negativeFeedbackScore),
      regimeRelevanceScore: round(regimeRelevance.score),
      regimeObsolescenceScore: round(regimeObsolescenceScore),
      confidence: round(confidence),
      failedRunEvidence:
        context.reinforcementState?.negativeFeedbackCount ?? 0,
      hasLearningScore: learningScore !== undefined,
      hasObservations: context.observations.length > 0,
      hasReinforcementState: context.reinforcementState !== undefined,
      hasRegimeEvidence: regimeRelevance.hasEvidence,
    });
  }

  private calculateDrawdownSeverity(
    observations: readonly StrategyPerformanceObservation[],
  ): number {
    if (observations.length === 0) {
      return 0;
    }

    const weightedTotal = observations.reduce(
      (total, observation) =>
        total +
        clamp01(Math.abs(observation.maximumDrawdown)) *
          Math.max(1, observation.sampleSize),
      0,
    );
    const weight = observations.reduce(
      (total, observation) => total + Math.max(1, observation.sampleSize),
      0,
    );
    const weightedAverage = safeDivide(weightedTotal, weight);
    const worstDrawdown = observations.reduce(
      (worst, observation) =>
        Math.max(worst, clamp01(Math.abs(observation.maximumDrawdown))),
      0,
    );

    return clamp01(weightedAverage * 0.65 + worstDrawdown * 0.35);
  }

  private calculateNegativeFeedbackScore(
    state: StrategyReinforcementState | undefined,
  ): number {
    if (!state) {
      return 0;
    }

    const total =
      state.positiveFeedbackCount +
      state.negativeFeedbackCount +
      state.neutralFeedbackCount;
    const negativeRatio =
      total === 0 ? 0 : safeDivide(state.negativeFeedbackCount, total);
    const rewardPressure = clamp01(
      Math.max(0, -state.exponentiallyWeightedReward),
    );
    const cumulativePressure =
      total === 0
        ? 0
        : clamp01(Math.max(0, -safeDivide(state.cumulativeReward, total)));

    return clamp01(
      negativeRatio * 0.6 + rewardPressure * 0.25 + cumulativePressure * 0.15,
    );
  }

  private calculateRegimeRelevance(
    context: RetirementContext,
  ): Readonly<{
    readonly score: number;
    readonly confidence: number;
    readonly hasEvidence: boolean;
  }> {
    if (context.regimeProfiles.length === 0) {
      return Object.freeze({ score: 0.5, confidence: 0, hasEvidence: false });
    }

    let weightedRelevance = 0;
    let confidenceWeight = 0;
    let relevantProfileCount = 0;

    for (const profile of [...context.regimeProfiles].sort((left, right) =>
      left.profileId.localeCompare(right.profileId),
    )) {
      const supportsRegime = context.descriptor.supportedRegimes.includes(
        profile.regime,
      );
      const preferred = profile.preferredStrategyIds.includes(
        context.descriptor.strategyId,
      );
      const avoided = profile.avoidedStrategyIds.includes(
        context.descriptor.strategyId,
      );
      const evidence = profile.strategyEvidence.find(
        (item) => item.strategyId === context.descriptor.strategyId,
      );

      if (!supportsRegime && !preferred && !avoided && !evidence) {
        continue;
      }

      const base = preferred ? 1 : avoided ? 0 : supportsRegime ? 0.65 : 0.5;
      const evidenceScore = evidence ? clamp01((evidence.score + 1) / 2) : base;
      const relevance = clamp01(base * 0.55 + evidenceScore * 0.45);
      const weight = Math.max(
        EPSILON,
        average([profile.confidence, profile.stabilityScore]),
      );

      weightedRelevance += relevance * weight;
      confidenceWeight += weight;
      relevantProfileCount += 1;
    }

    if (relevantProfileCount === 0) {
      return Object.freeze({ score: 0, confidence: 0.25, hasEvidence: true });
    }

    return Object.freeze({
      score: clamp01(safeDivide(weightedRelevance, confidenceWeight)),
      confidence: clamp01(
        safeDivide(confidenceWeight, relevantProfileCount),
      ),
      hasEvidence: true,
    });
  }

  private determineTransition(
    currentState: StrategyLifecycleState,
    policy: StrategyRetirementPolicy,
    evidence: Readonly<{
      retirementConditionsPassed: boolean;
      probationConditionsPassed: boolean;
      confidencePassed: boolean;
      failedRunsPassed: boolean;
      evidenceComplete: boolean;
    }>,
    reasons: string[],
  ): Readonly<{
    readonly decision: StrategyRetirementDecision;
    readonly proposedState: StrategyLifecycleState;
  }> {
    if (currentState === "ARCHIVED") {
      reasons.push("The strategy is archived; no retirement transition is applicable.");
      return Object.freeze({ decision: "KEEP_ACTIVE", proposedState: "ARCHIVED" });
    }

    if (currentState === "RETIRED") {
      reasons.push("The strategy is already retired; the terminal state is retained.");
      return Object.freeze({ decision: "KEEP_ACTIVE", proposedState: "RETIRED" });
    }

    if (!evidence.evidenceComplete && !evidence.retirementConditionsPassed) {
      reasons.push(
        "Required retirement evidence is incomplete, so the lifecycle decision is deferred.",
      );
      return Object.freeze({ decision: "DEFER", proposedState: currentState });
    }

    if (evidence.retirementConditionsPassed) {
      if (policy.probationBeforeRetirement && currentState !== "PROBATION") {
        reasons.push(
          `Retirement conditions passed, but policy requires probation first; lifecycle transition '${currentState}' to 'PROBATION' is proposed.`,
        );
        return Object.freeze({
          decision: "PLACE_ON_PROBATION",
          proposedState: "PROBATION",
        });
      }

      reasons.push(
        `Retirement conditions passed; lifecycle transition '${currentState}' to 'RETIRED' is proposed.`,
      );
      return Object.freeze({ decision: "RETIRE", proposedState: "RETIRED" });
    }

    if (evidence.probationConditionsPassed) {
      if (!evidence.confidencePassed || !evidence.failedRunsPassed) {
        reasons.push(
          "Degradation evidence exists, but retirement confidence or failed-run evidence is insufficient; probation is proposed.",
        );
      } else {
        reasons.push(
          "One or more deterioration indicators breached policy thresholds; probation is proposed for additional observation.",
        );
      }

      if (currentState === "PROBATION") {
        return Object.freeze({
          decision: "PLACE_ON_PROBATION",
          proposedState: "PROBATION",
        });
      }

      return Object.freeze({
        decision: "PLACE_ON_PROBATION",
        proposedState: "PROBATION",
      });
    }

    reasons.push(
      "Retirement and probation conditions were not met; the current lifecycle state is retained.",
    );
    return Object.freeze({ decision: "KEEP_ACTIVE", proposedState: currentState });
  }

  private addEvidenceAvailabilityReasons(
    reasons: string[],
    evidence: RetirementEvidence,
  ): void {
    if (!evidence.hasLearningScore) {
      reasons.push("No strategy learning score was available.");
    }
    if (!evidence.hasObservations) {
      reasons.push("No performance observations were available.");
    }
    if (!evidence.hasReinforcementState) {
      reasons.push("No reinforcement state was available.");
    }
    if (!evidence.hasRegimeEvidence) {
      reasons.push("No strategy-specific regime relevance evidence was available.");
    }
  }

  private addThresholdReason(
    reasons: string[],
    label: string,
    value: number,
    threshold: number,
    breached: boolean,
    comparison: "above" | "at or above" | "below",
  ): void {
    reasons.push(
      `${label} (${format(value)}) is ${breached ? "" : "not "}${comparison} the policy threshold (${format(threshold)}).`,
    );
  }

  private collectUnknownStrategyWarnings(
    request: StrategyRetirementRequest,
    descriptorIds: ReadonlySet<string>,
    warnings: string[],
  ): void {
    for (const observation of request.observations) {
      if (!descriptorIds.has(observation.strategyId)) {
        warnings.push(
          `Performance observation '${observation.observationId}' references unknown strategy '${observation.strategyId}' and was ignored.`,
        );
      }
    }
    for (const score of request.learningScores) {
      if (!descriptorIds.has(score.strategyId)) {
        warnings.push(
          `Learning score for unknown strategy '${score.strategyId}' was ignored.`,
        );
      }
    }
    for (const state of request.reinforcementStates) {
      if (!descriptorIds.has(state.strategyId)) {
        warnings.push(
          `Reinforcement state for unknown strategy '${state.strategyId}' was ignored.`,
        );
      }
    }
  }

  private assertRequest(request: StrategyRetirementRequest): void {
    if (request === null || typeof request !== "object") {
      throw new StrategyRetirementEngineError(
        "request must be an object.",
        "INVALID_STRATEGY_RETIREMENT_REQUEST",
      );
    }

    assertNonEmptyString(
      request.requestId,
      "request.requestId",
      "INVALID_STRATEGY_RETIREMENT_REQUEST_ID",
    );
    assertTimestamp(request.generatedAt, "request.generatedAt");
    assertArray(request.descriptors, "request.descriptors");
    assertArray(request.observations, "request.observations");
    assertArray(request.learningScores, "request.learningScores");
    assertArray(request.reinforcementStates, "request.reinforcementStates");
    assertArray(request.regimeProfiles, "request.regimeProfiles");

    assertUniqueStrategyIds(request.descriptors, "request.descriptors");
    assertUniqueStrategyIds(request.learningScores, "request.learningScores");
    assertUniqueStrategyIds(
      request.reinforcementStates,
      "request.reinforcementStates",
    );

    request.descriptors.forEach((descriptor, index) =>
      this.assertDescriptor(descriptor, `request.descriptors[${index}]`),
    );
    request.observations.forEach((observation, index) =>
      this.assertObservation(observation, `request.observations[${index}]`),
    );
    request.learningScores.forEach((score, index) =>
      this.assertLearningScore(score, `request.learningScores[${index}]`),
    );
    request.reinforcementStates.forEach((state, index) =>
      this.assertReinforcementState(
        state,
        `request.reinforcementStates[${index}]`,
      ),
    );
    request.regimeProfiles.forEach((profile, index) =>
      this.assertRegimeProfile(profile, `request.regimeProfiles[${index}]`),
    );
    this.assertPolicy(request.policy);
  }

  private assertDescriptor(descriptor: StrategyDescriptor, path: string): void {
    if (descriptor === null || typeof descriptor !== "object") {
      throw new StrategyRetirementEngineError(
        `${path} must be an object.`,
        "INVALID_STRATEGY_RETIREMENT_DESCRIPTOR",
      );
    }
    assertNonEmptyString(descriptor.strategyId, `${path}.strategyId`, "INVALID_STRATEGY_RETIREMENT_STRATEGY_ID");
    if (!LIFECYCLE_STATES.includes(descriptor.lifecycleState)) {
      throw new StrategyRetirementEngineError(
        `${path}.lifecycleState is invalid.`,
        "INVALID_STRATEGY_RETIREMENT_LIFECYCLE_STATE",
      );
    }
    assertArray(descriptor.supportedRegimes, `${path}.supportedRegimes`);
  }

  private assertObservation(
    observation: StrategyPerformanceObservation,
    path: string,
  ): void {
    if (observation === null || typeof observation !== "object") {
      throw new StrategyRetirementEngineError(`${path} must be an object.`, "INVALID_STRATEGY_RETIREMENT_OBSERVATION");
    }
    assertNonEmptyString(observation.observationId, `${path}.observationId`, "INVALID_STRATEGY_RETIREMENT_OBSERVATION_ID");
    assertNonEmptyString(observation.strategyId, `${path}.strategyId`, "INVALID_STRATEGY_RETIREMENT_STRATEGY_ID");
    assertTimestamp(observation.startedAt, `${path}.startedAt`);
    assertTimestamp(observation.endedAt, `${path}.endedAt`);
    if (Date.parse(observation.startedAt) > Date.parse(observation.endedAt)) {
      throw new StrategyRetirementEngineError(`${path}.startedAt cannot be after endedAt.`, "INVALID_STRATEGY_RETIREMENT_OBSERVATION_PERIOD");
    }
    assertNonNegativeInteger(observation.sampleSize, `${path}.sampleSize`);
    assertNonNegativeInteger(observation.trades, `${path}.trades`);
    assertUnitInterval(observation.winRate, `${path}.winRate`);
    assertFinite(observation.maximumDrawdown, `${path}.maximumDrawdown`);
  }

  private assertLearningScore(score: StrategyLearningScore, path: string): void {
    if (score === null || typeof score !== "object") {
      throw new StrategyRetirementEngineError(`${path} must be an object.`, "INVALID_STRATEGY_RETIREMENT_LEARNING_SCORE");
    }
    assertNonEmptyString(score.strategyId, `${path}.strategyId`, "INVALID_STRATEGY_RETIREMENT_STRATEGY_ID");
    assertUnitInterval(score.normalizedScore, `${path}.normalizedScore`);
    assertUnitInterval(score.confidence, `${path}.confidence`);
    assertUnitInterval(score.stabilityScore, `${path}.stabilityScore`);
    assertUnitInterval(score.regimeRobustnessScore, `${path}.regimeRobustnessScore`);
    assertUnitInterval(score.riskAdjustedScore, `${path}.riskAdjustedScore`);
    assertUnitInterval(score.drawdownPenalty, `${path}.drawdownPenalty`);
    assertUnitInterval(score.tailRiskPenalty, `${path}.tailRiskPenalty`);
    assertUnitInterval(score.executionCostPenalty, `${path}.executionCostPenalty`);
    assertUnitInterval(score.sampleSizePenalty, `${path}.sampleSizePenalty`);
  }

  private assertReinforcementState(
    state: StrategyReinforcementState,
    path: string,
  ): void {
    if (state === null || typeof state !== "object") {
      throw new StrategyRetirementEngineError(`${path} must be an object.`, "INVALID_STRATEGY_RETIREMENT_REINFORCEMENT_STATE");
    }
    assertNonEmptyString(state.strategyId, `${path}.strategyId`, "INVALID_STRATEGY_RETIREMENT_STRATEGY_ID");
    assertFinite(state.cumulativeReward, `${path}.cumulativeReward`);
    assertFinite(state.exponentiallyWeightedReward, `${path}.exponentiallyWeightedReward`);
    assertNonNegativeInteger(state.positiveFeedbackCount, `${path}.positiveFeedbackCount`);
    assertNonNegativeInteger(state.negativeFeedbackCount, `${path}.negativeFeedbackCount`);
    assertNonNegativeInteger(state.neutralFeedbackCount, `${path}.neutralFeedbackCount`);
    assertUnitInterval(state.confidence, `${path}.confidence`);
    assertTimestamp(state.lastUpdatedAt, `${path}.lastUpdatedAt`);
  }

  private assertRegimeProfile(profile: LearnedRegimeProfile, path: string): void {
    if (profile === null || typeof profile !== "object") {
      throw new StrategyRetirementEngineError(`${path} must be an object.`, "INVALID_STRATEGY_RETIREMENT_REGIME_PROFILE");
    }
    assertNonEmptyString(profile.profileId, `${path}.profileId`, "INVALID_STRATEGY_RETIREMENT_PROFILE_ID");
    assertTimestamp(profile.generatedAt, `${path}.generatedAt`);
    assertArray(profile.preferredStrategyIds, `${path}.preferredStrategyIds`);
    assertArray(profile.avoidedStrategyIds, `${path}.avoidedStrategyIds`);
    assertArray(profile.strategyEvidence, `${path}.strategyEvidence`);
    assertUnitInterval(profile.confidence, `${path}.confidence`);
    assertUnitInterval(profile.stabilityScore, `${path}.stabilityScore`);
  }

  private assertPolicy(policy: StrategyRetirementPolicy): void {
    if (policy === null || typeof policy !== "object") {
      throw new StrategyRetirementEngineError("request.policy must be an object.", "INVALID_STRATEGY_RETIREMENT_POLICY");
    }
    assertUnitInterval(policy.minimumDegradationScore, "request.policy.minimumDegradationScore");
    assertUnitInterval(policy.maximumAcceptableDrawdown, "request.policy.maximumAcceptableDrawdown");
    assertUnitInterval(policy.maximumNegativeFeedbackScore, "request.policy.maximumNegativeFeedbackScore");
    assertUnitInterval(policy.minimumRegimeRelevanceScore, "request.policy.minimumRegimeRelevanceScore");
    assertUnitInterval(policy.minimumConfidence, "request.policy.minimumConfidence");
    if (typeof policy.probationBeforeRetirement !== "boolean") {
      throw new StrategyRetirementEngineError("request.policy.probationBeforeRetirement must be boolean.", "INVALID_STRATEGY_RETIREMENT_POLICY");
    }
    assertPositiveInteger(policy.requiredConsecutiveFailedRuns, "request.policy.requiredConsecutiveFailedRuns");
  }
}

export function createStrategyRetirementEngine(
  options: StrategyRetirementEngineOptions = {},
): StrategyRetirementEngine {
  return new StrategyRetirementEngine(options);
}

function groupByStrategy<T extends { readonly strategyId: string }>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const bucket = grouped.get(value.strategyId) ?? [];
    bucket.push(value);
    grouped.set(value.strategyId, bucket);
  }
  return new Map(
    [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([strategyId, bucket]) => [strategyId, Object.freeze([...bucket].sort(compare))]),
  );
}

function indexByStrategy<T extends { readonly strategyId: string }>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(
    [...values]
      .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
      .map((value) => [value.strategyId, value]),
  );
}

function compareObservations(
  left: StrategyPerformanceObservation,
  right: StrategyPerformanceObservation,
): number {
  return Date.parse(left.endedAt) - Date.parse(right.endedAt) ||
    left.observationId.localeCompare(right.observationId);
}

function freezeAssessment(
  assessment: StrategyRetirementAssessment,
): StrategyRetirementAssessment {
  return Object.freeze({
    ...assessment,
    reasons: Object.freeze([...assessment.reasons]),
  });
}

function freezeResult(result: StrategyRetirementResult): StrategyRetirementResult {
  return Object.freeze({
    ...result,
    assessments: Object.freeze([...result.assessments]),
    retiredStrategyIds: Object.freeze([...result.retiredStrategyIds]),
    probationStrategyIds: Object.freeze([...result.probationStrategyIds]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function assertUniqueStrategyIds(
  values: readonly { readonly strategyId: string }[],
  fieldName: string,
): void {
  const ids = values.map((value) => value.strategyId);
  if (new Set(ids).size !== ids.length) {
    throw new StrategyRetirementEngineError(
      `${fieldName} contains duplicate strategyId values.`,
      "DUPLICATE_STRATEGY_RETIREMENT_STRATEGY_ID",
    );
  }
}

function assertArray(value: unknown, fieldName: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new StrategyRetirementEngineError(`${fieldName} must be an array.`, "INVALID_STRATEGY_RETIREMENT_ARRAY");
  }
}

function assertNonEmptyString(
  value: unknown,
  fieldName: string,
  code: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a non-empty string.`, code);
  }
}

function assertTimestamp(value: unknown, fieldName: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a valid timestamp.`, "INVALID_STRATEGY_RETIREMENT_TIMESTAMP");
  }
}

function assertUnitInterval(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a finite number between 0 and 1.`, "INVALID_STRATEGY_RETIREMENT_RANGE");
  }
}

function assertFinite(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a finite number.`, "INVALID_STRATEGY_RETIREMENT_NUMBER");
  }
}

function assertNonNegativeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a non-negative integer.`, "INVALID_STRATEGY_RETIREMENT_COUNT");
  }
}

function assertPositiveInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a positive integer.`, "INVALID_STRATEGY_RETIREMENT_COUNT");
  }
}

function positiveIntegerOption(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new StrategyRetirementEngineError(`${fieldName} must be a positive integer.`, "INVALID_STRATEGY_RETIREMENT_OPTION");
  }
  return value;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : safeDivide(values.reduce((sum, value) => sum + value, 0), values.length);
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) <= EPSILON) {
    return 0;
  }
  return numerator / denominator;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function round(value: number, precision = 12): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function format(value: number): string {
  return round(value, 4).toFixed(4);
}