/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 10:
 * src/trading/ai-meta-learning/strategy-promotion-engine.ts
 *
 * Deterministic production-grade strategy promotion engine.
 */

import {
  type StrategyDescriptor,
  type StrategyLearningScore,
  type StrategyLifecycleState,
  type StrategyPromotionAssessment,
  type StrategyPromotionDecision,
  type StrategyPromotionEnginePort,
  type StrategyPromotionPolicy,
  type StrategyPromotionRequest,
  type StrategyPromotionResult,
  type StrategyReinforcementState,
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

interface PromotionContext {
  readonly descriptor: StrategyDescriptor;
  readonly learningScore?: StrategyLearningScore;
  readonly reinforcementState?: StrategyReinforcementState;
}

export interface StrategyPromotionEngineOptions {
  readonly performanceWeight?: number;
  readonly stabilityWeight?: number;
  readonly regimeRobustnessWeight?: number;
  readonly sampleAdequacyWeight?: number;
  readonly learningConfidenceWeight?: number;
  readonly reinforcementConfidenceWeight?: number;
  readonly positiveFeedbackWeight?: number;
  readonly negativeFeedbackPenaltyWeight?: number;
}

export class StrategyPromotionEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "STRATEGY_PROMOTION_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "StrategyPromotionEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StrategyPromotionEngine implements StrategyPromotionEnginePort {
  private readonly performanceWeight: number;
  private readonly stabilityWeight: number;
  private readonly regimeRobustnessWeight: number;
  private readonly sampleAdequacyWeight: number;
  private readonly learningConfidenceWeight: number;
  private readonly reinforcementConfidenceWeight: number;
  private readonly positiveFeedbackWeight: number;
  private readonly negativeFeedbackPenaltyWeight: number;

  public constructor(options: StrategyPromotionEngineOptions = {}) {
    this.performanceWeight = nonNegative(options.performanceWeight ?? 0.3);
    this.stabilityWeight = nonNegative(options.stabilityWeight ?? 0.2);
    this.regimeRobustnessWeight = nonNegative(
      options.regimeRobustnessWeight ?? 0.18,
    );
    this.sampleAdequacyWeight = nonNegative(
      options.sampleAdequacyWeight ?? 0.12,
    );
    this.learningConfidenceWeight = nonNegative(
      options.learningConfidenceWeight ?? 0.1,
    );
    this.reinforcementConfidenceWeight = nonNegative(
      options.reinforcementConfidenceWeight ?? 0.1,
    );
    this.positiveFeedbackWeight = nonNegative(
      options.positiveFeedbackWeight ?? 0.12,
    );
    this.negativeFeedbackPenaltyWeight = nonNegative(
      options.negativeFeedbackPenaltyWeight ?? 0.12,
    );
  }

  public evaluate(request: StrategyPromotionRequest): StrategyPromotionResult {
    this.assertRequest(request);

    const warnings: string[] = [];
    const scoreByStrategy = new Map(
      request.learningScores.map((score) => [score.strategyId, score] as const),
    );
    const stateByStrategy = new Map(
      request.reinforcementStates.map(
        (state) => [state.strategyId, state] as const,
      ),
    );

    const assessments = request.descriptors
      .slice()
      .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
      .map((descriptor) => {
        const learningScore = scoreByStrategy.get(descriptor.strategyId);
        const reinforcementState = stateByStrategy.get(descriptor.strategyId);

        if (!learningScore) {
          warnings.push(
            `Strategy '${descriptor.strategyId}' has no learning score; promotion was deferred or kept unchanged.`,
          );
        }

        if (!reinforcementState) {
          warnings.push(
            `Strategy '${descriptor.strategyId}' has no reinforcement state; neutral reinforcement evidence was used.`,
          );
        }

        return this.assess(
          { descriptor, learningScore, reinforcementState },
          request.policy,
        );
      });

    const promotedStrategyIds = assessments
      .filter((assessment) => assessment.decision === "PROMOTE")
      .map((assessment) => assessment.strategyId)
      .sort();

    const deferredStrategyIds = assessments
      .filter((assessment) => assessment.decision === "DEFER")
      .map((assessment) => assessment.strategyId)
      .sort();

    const descriptorIds = new Set(
      request.descriptors.map((descriptor) => descriptor.strategyId),
    );

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

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      assessments,
      promotedStrategyIds,
      deferredStrategyIds,
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private assess(
    context: PromotionContext,
    policy: StrategyPromotionPolicy,
  ): StrategyPromotionAssessment {
    const { descriptor, learningScore, reinforcementState } = context;
    const reasons: string[] = [];

    const performanceScore = clamp01(
      learningScore?.normalizedScore ?? 0,
    );
    const stabilityScore = clamp01(
      learningScore?.stabilityScore ?? 0,
    );
    const regimeRobustnessScore = clamp01(
      learningScore?.regimeRobustnessScore ?? 0,
    );
    const sampleAdequacyScore = this.sampleAdequacyScore(learningScore);
    const confidence = this.calculateConfidence(
      learningScore,
      reinforcementState,
      performanceScore,
      stabilityScore,
      regimeRobustnessScore,
      sampleAdequacyScore,
    );

    const positiveFeedbackCount =
      reinforcementState?.positiveFeedbackCount ?? 0;
    const negativeFeedbackCount =
      reinforcementState?.negativeFeedbackCount ?? 0;
    const neutralFeedbackCount =
      reinforcementState?.neutralFeedbackCount ?? 0;
    const totalFeedback =
      positiveFeedbackCount + negativeFeedbackCount + neutralFeedbackCount;

    const performancePassed =
      performanceScore + EPSILON >= policy.minimumPerformanceScore;
    const stabilityPassed =
      stabilityScore + EPSILON >= policy.minimumStabilityScore;
    const robustnessPassed =
      regimeRobustnessScore + EPSILON >=
      policy.minimumRegimeRobustnessScore;
    const samplePassed =
      sampleAdequacyScore + EPSILON >= policy.minimumSampleAdequacyScore;
    const confidencePassed =
      confidence + EPSILON >= policy.minimumConfidence;
    const successfulRunsPassed =
      positiveFeedbackCount >= policy.requiredConsecutiveSuccessfulRuns;

    this.addThresholdReason(
      reasons,
      "Performance",
      performanceScore,
      policy.minimumPerformanceScore,
      performancePassed,
    );
    this.addThresholdReason(
      reasons,
      "Stability",
      stabilityScore,
      policy.minimumStabilityScore,
      stabilityPassed,
    );
    this.addThresholdReason(
      reasons,
      "Regime robustness",
      regimeRobustnessScore,
      policy.minimumRegimeRobustnessScore,
      robustnessPassed,
    );
    this.addThresholdReason(
      reasons,
      "Sample adequacy",
      sampleAdequacyScore,
      policy.minimumSampleAdequacyScore,
      samplePassed,
    );
    this.addThresholdReason(
      reasons,
      "Promotion confidence",
      confidence,
      policy.minimumConfidence,
      confidencePassed,
    );

    if (successfulRunsPassed) {
      reasons.push(
        `Positive reinforcement count (${positiveFeedbackCount}) satisfies the required successful-run evidence (${policy.requiredConsecutiveSuccessfulRuns}).`,
      );
    } else {
      reasons.push(
        `Positive reinforcement count (${positiveFeedbackCount}) does not yet satisfy the required successful-run evidence (${policy.requiredConsecutiveSuccessfulRuns}).`,
      );
    }

    reasons.push(
      "The contracts do not retain ordered run outcomes, so positive reinforcement count is used as the deterministic proxy for consecutive successful runs.",
    );

    if (totalFeedback === 0) {
      reasons.push(
        "No reinforcement history was available; reinforcement evidence is neutral.",
      );
    } else if (negativeFeedbackCount > positiveFeedbackCount) {
      reasons.push(
        "Negative reinforcement exceeds positive reinforcement and reduces promotion confidence.",
      );
    } else if (positiveFeedbackCount > negativeFeedbackCount) {
      reasons.push(
        "Positive reinforcement exceeds negative reinforcement and supports promotion confidence.",
      );
    }

    const allPolicyConditionsPassed =
      performancePassed &&
      stabilityPassed &&
      robustnessPassed &&
      samplePassed &&
      confidencePassed &&
      successfulRunsPassed;

    const transition = this.determineTransition(
      descriptor.lifecycleState,
      allPolicyConditionsPassed,
      {
        hasLearningScore: learningScore !== undefined,
        hasReinforcementState: reinforcementState !== undefined,
        metricConditionsPassed:
          performancePassed &&
          stabilityPassed &&
          robustnessPassed &&
          samplePassed,
        confidencePassed,
        successfulRunsPassed,
      },
      reasons,
    );

    return freezeAssessment({
      strategyId: descriptor.strategyId,
      currentState: descriptor.lifecycleState,
      proposedState: transition.proposedState,
      decision: transition.decision,
      performanceScore: round(performanceScore),
      stabilityScore: round(stabilityScore),
      regimeRobustnessScore: round(regimeRobustnessScore),
      sampleAdequacyScore: round(sampleAdequacyScore),
      confidence: round(confidence),
      reasons: Array.from(new Set(reasons)),
    });
  }

  private determineTransition(
    currentState: StrategyLifecycleState,
    allPolicyConditionsPassed: boolean,
    evidence: Readonly<{
      hasLearningScore: boolean;
      hasReinforcementState: boolean;
      metricConditionsPassed: boolean;
      confidencePassed: boolean;
      successfulRunsPassed: boolean;
    }>,
    reasons: string[],
  ): Readonly<{
    readonly decision: StrategyPromotionDecision;
    readonly proposedState: StrategyLifecycleState;
  }> {
    if (currentState === "RETIRED" || currentState === "ARCHIVED") {
      reasons.push(
        `Lifecycle state '${currentState}' is terminal for this promotion engine.`,
      );
      return Object.freeze({
        decision: "REJECT",
        proposedState: currentState,
      });
    }

    if (currentState === "ACTIVE") {
      reasons.push("The strategy is already active; no promotion is required.");
      return Object.freeze({
        decision: "KEEP_CURRENT",
        proposedState: "ACTIVE",
      });
    }

    if (allPolicyConditionsPassed) {
      const proposedState = nextPromotedState(currentState);
      reasons.push(
        `All promotion policy conditions passed; lifecycle transition '${currentState}' to '${proposedState}' is proposed.`,
      );
      return Object.freeze({
        decision: "PROMOTE",
        proposedState,
      });
    }

    const evidenceIncomplete =
      !evidence.hasLearningScore || !evidence.hasReinforcementState;
    const pendingEvidence =
      evidence.metricConditionsPassed &&
      (!evidence.confidencePassed || !evidence.successfulRunsPassed);

    if (evidenceIncomplete || pendingEvidence) {
      reasons.push(
        evidenceIncomplete
          ? "Required promotion evidence is incomplete, so the decision is deferred."
          : "Core metrics passed, but confidence or successful-run evidence remains insufficient; promotion is deferred.",
      );
      return Object.freeze({
        decision: "DEFER",
        proposedState: currentState,
      });
    }

    reasons.push(
      "One or more core promotion metrics failed; the current lifecycle state is retained.",
    );
    return Object.freeze({
      decision: "KEEP_CURRENT",
      proposedState: currentState,
    });
  }

  private sampleAdequacyScore(
    learningScore: StrategyLearningScore | undefined,
  ): number {
    if (!learningScore) {
      return 0;
    }

    return clamp01(1 - learningScore.sampleSizePenalty);
  }

  private calculateConfidence(
    learningScore: StrategyLearningScore | undefined,
    reinforcementState: StrategyReinforcementState | undefined,
    performanceScore: number,
    stabilityScore: number,
    regimeRobustnessScore: number,
    sampleAdequacyScore: number,
  ): number {
    if (!learningScore) {
      return 0;
    }

    const positiveFeedbackCount =
      reinforcementState?.positiveFeedbackCount ?? 0;
    const negativeFeedbackCount =
      reinforcementState?.negativeFeedbackCount ?? 0;
    const neutralFeedbackCount =
      reinforcementState?.neutralFeedbackCount ?? 0;
    const totalFeedback =
      positiveFeedbackCount + negativeFeedbackCount + neutralFeedbackCount;

    const positiveRatio =
      totalFeedback <= 0
        ? 0.5
        : safeDivide(positiveFeedbackCount, totalFeedback);
    const negativeRatio =
      totalFeedback <= 0
        ? 0
        : safeDivide(negativeFeedbackCount, totalFeedback);

    const numerator =
      performanceScore * this.performanceWeight +
      stabilityScore * this.stabilityWeight +
      regimeRobustnessScore * this.regimeRobustnessWeight +
      sampleAdequacyScore * this.sampleAdequacyWeight +
      learningScore.confidence * this.learningConfidenceWeight +
      (reinforcementState?.confidence ?? 0.5) *
        this.reinforcementConfidenceWeight +
      positiveRatio * this.positiveFeedbackWeight;

    const denominator =
      this.performanceWeight +
      this.stabilityWeight +
      this.regimeRobustnessWeight +
      this.sampleAdequacyWeight +
      this.learningConfidenceWeight +
      this.reinforcementConfidenceWeight +
      this.positiveFeedbackWeight;

    const baseConfidence = safeDivide(numerator, denominator);
    const negativePenalty =
      negativeRatio * this.negativeFeedbackPenaltyWeight;

    return clamp01(baseConfidence - negativePenalty);
  }

  private addThresholdReason(
    reasons: string[],
    label: string,
    value: number,
    threshold: number,
    passed: boolean,
  ): void {
    reasons.push(
      `${label} score ${format(value)} ${
        passed ? "meets" : "does not meet"
      } the required threshold ${format(threshold)}.`,
    );
  }

  private assertRequest(request: StrategyPromotionRequest): void {
    if (request === null || typeof request !== "object") {
      throw new StrategyPromotionEngineError(
        "Strategy promotion request must be an object.",
        "INVALID_STRATEGY_PROMOTION_REQUEST",
      );
    }

    assertNonEmptyString(
      request.requestId,
      "requestId",
      "INVALID_STRATEGY_PROMOTION_REQUEST_ID",
    );
    assertTimestamp(request.generatedAt, "generatedAt");

    if (!Array.isArray(request.descriptors)) {
      throw new StrategyPromotionEngineError(
        "descriptors must be an array.",
        "INVALID_PROMOTION_DESCRIPTORS",
      );
    }

    if (!Array.isArray(request.learningScores)) {
      throw new StrategyPromotionEngineError(
        "learningScores must be an array.",
        "INVALID_PROMOTION_LEARNING_SCORES",
      );
    }

    if (!Array.isArray(request.reinforcementStates)) {
      throw new StrategyPromotionEngineError(
        "reinforcementStates must be an array.",
        "INVALID_PROMOTION_REINFORCEMENT_STATES",
      );
    }

    this.assertPolicy(request.policy);
    assertUniqueStrategyIds(request.descriptors, "descriptors");
    assertUniqueStrategyIds(request.learningScores, "learningScores");
    assertUniqueStrategyIds(request.reinforcementStates, "reinforcementStates");

    for (const descriptor of request.descriptors) {
      assertNonEmptyString(
        descriptor.strategyId,
        "descriptor.strategyId",
        "INVALID_PROMOTION_STRATEGY_ID",
      );

      if (!LIFECYCLE_STATES.includes(descriptor.lifecycleState)) {
        throw new StrategyPromotionEngineError(
          `Strategy '${descriptor.strategyId}' has unsupported lifecycle state '${String(descriptor.lifecycleState)}'.`,
          "INVALID_PROMOTION_LIFECYCLE_STATE",
        );
      }
    }

    for (const score of request.learningScores) {
      assertNonEmptyString(
        score.strategyId,
        "learningScore.strategyId",
        "INVALID_PROMOTION_SCORE_STRATEGY_ID",
      );
      assertUnitInterval(score.normalizedScore, "normalizedScore");
      assertUnitInterval(score.stabilityScore, "stabilityScore");
      assertUnitInterval(
        score.regimeRobustnessScore,
        "regimeRobustnessScore",
      );
      assertUnitInterval(score.confidence, "learningScore.confidence");
      assertUnitInterval(score.sampleSizePenalty, "sampleSizePenalty");
    }

    for (const state of request.reinforcementStates) {
      assertNonEmptyString(
        state.strategyId,
        "reinforcementState.strategyId",
        "INVALID_REINFORCEMENT_STATE_STRATEGY_ID",
      );
      assertNonNegativeInteger(
        state.positiveFeedbackCount,
        "positiveFeedbackCount",
      );
      assertNonNegativeInteger(
        state.negativeFeedbackCount,
        "negativeFeedbackCount",
      );
      assertNonNegativeInteger(
        state.neutralFeedbackCount,
        "neutralFeedbackCount",
      );
      assertUnitInterval(state.confidence, "reinforcementState.confidence");
      assertTimestamp(state.lastUpdatedAt, "lastUpdatedAt");
      assertFinite(state.cumulativeReward, "cumulativeReward");
      assertFinite(
        state.exponentiallyWeightedReward,
        "exponentiallyWeightedReward",
      );
    }
  }

  private assertPolicy(policy: StrategyPromotionPolicy): void {
    if (policy === null || typeof policy !== "object") {
      throw new StrategyPromotionEngineError(
        "policy must be an object.",
        "INVALID_STRATEGY_PROMOTION_POLICY",
      );
    }

    assertUnitInterval(
      policy.minimumPerformanceScore,
      "minimumPerformanceScore",
    );
    assertUnitInterval(
      policy.minimumStabilityScore,
      "minimumStabilityScore",
    );
    assertUnitInterval(
      policy.minimumRegimeRobustnessScore,
      "minimumRegimeRobustnessScore",
    );
    assertUnitInterval(
      policy.minimumSampleAdequacyScore,
      "minimumSampleAdequacyScore",
    );
    assertUnitInterval(policy.minimumConfidence, "minimumConfidence");
    assertPositiveInteger(
      policy.requiredConsecutiveSuccessfulRuns,
      "requiredConsecutiveSuccessfulRuns",
    );
  }
}

export function createStrategyPromotionEngine(
  options: StrategyPromotionEngineOptions = {},
): StrategyPromotionEngine {
  return new StrategyPromotionEngine(options);
}

function nextPromotedState(
  currentState: StrategyLifecycleState,
): StrategyLifecycleState {
  switch (currentState) {
    case "CANDIDATE":
      return "EXPERIMENTAL";
    case "EXPERIMENTAL":
    case "PROBATION":
    case "DEGRADED":
      return "ACTIVE";
    case "ACTIVE":
    case "RETIRED":
    case "ARCHIVED":
      return currentState;
  }
}

function freezeAssessment(
  assessment: StrategyPromotionAssessment,
): StrategyPromotionAssessment {
  return Object.freeze({
    ...assessment,
    reasons: Object.freeze([...assessment.reasons]),
  });
}

function freezeResult(result: StrategyPromotionResult): StrategyPromotionResult {
  return Object.freeze({
    ...result,
    assessments: Object.freeze(
      result.assessments.map((assessment) => freezeAssessment(assessment)),
    ),
    promotedStrategyIds: Object.freeze([...result.promotedStrategyIds]),
    deferredStrategyIds: Object.freeze([...result.deferredStrategyIds]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function assertUniqueStrategyIds(
  values: readonly { readonly strategyId: string }[],
  fieldName: string,
): void {
  const ids = values.map((value) => value.strategyId);
  if (new Set(ids).size !== ids.length) {
    throw new StrategyPromotionEngineError(
      `${fieldName} contains duplicate strategyId values.`,
      "DUPLICATE_PROMOTION_STRATEGY_ID",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  fieldName: string,
  code: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StrategyPromotionEngineError(
      `${fieldName} must be a non-empty string.`,
      code,
    );
  }
}

function assertTimestamp(value: unknown, fieldName: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new StrategyPromotionEngineError(
      `${fieldName} must be a valid timestamp.`,
      "INVALID_STRATEGY_PROMOTION_TIMESTAMP",
    );
  }
}

function assertUnitInterval(value: unknown, fieldName: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new StrategyPromotionEngineError(
      `${fieldName} must be a finite number between 0 and 1.`,
      "INVALID_STRATEGY_PROMOTION_RANGE",
    );
  }
}

function assertFinite(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StrategyPromotionEngineError(
      `${fieldName} must be a finite number.`,
      "INVALID_STRATEGY_PROMOTION_NUMBER",
    );
  }
}

function assertNonNegativeInteger(value: unknown, fieldName: string): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new StrategyPromotionEngineError(
      `${fieldName} must be a non-negative integer.`,
      "INVALID_STRATEGY_PROMOTION_COUNT",
    );
  }
}

function assertPositiveInteger(value: unknown, fieldName: string): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new StrategyPromotionEngineError(
      `${fieldName} must be a positive integer.`,
      "INVALID_STRATEGY_PROMOTION_COUNT",
    );
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
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