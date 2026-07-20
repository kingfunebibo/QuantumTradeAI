/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 12:
 * src/trading/ai-meta-learning/meta-learning-explainability-engine.ts
 *
 * Deterministic production-grade meta-learning explainability engine.
 */

import {
  type AdaptiveStrategyWeight,
  type LearnedRegimeProfile,
  type MetaLearningDecision,
  type MetaLearningExplainabilityEnginePort,
  type MetaLearningExplainabilityRequest,
  type MetaLearningExplainabilityResult,
  type MetaLearningExplanationFactor,
  type PatternDirection,
  type PerformancePattern,
  type StrategyEvolutionAction,
  type StrategyEvolutionCandidate,
  type StrategyLearningScore,
  type StrategyMetaLearningExplanation,
  type StrategyPromotionAssessment,
  type StrategyReinforcementState,
  type StrategyRetirementAssessment,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;
const DEFAULT_PRECISION = 12;

const PATTERN_DIRECTIONS: readonly PatternDirection[] = Object.freeze([
  "POSITIVE",
  "NEGATIVE",
  "MIXED",
  "NEUTRAL",
]);

const EVOLUTION_ACTIONS: readonly StrategyEvolutionAction[] = Object.freeze([
  "NO_CHANGE",
  "REWEIGHT",
  "TUNE_PARAMETERS",
  "CLONE",
  "MUTATE",
  "CROSSOVER",
  "PROMOTE",
  "DEMOTE",
  "RETIRE",
  "ARCHIVE",
]);

interface StrategyExplainabilityContext {
  readonly strategyId: string;
  readonly learningScore?: StrategyLearningScore;
  readonly weight?: AdaptiveStrategyWeight;
  readonly reinforcementState?: StrategyReinforcementState;
  readonly candidates: readonly StrategyEvolutionCandidate[];
  readonly promotion?: StrategyPromotionAssessment;
  readonly retirement?: StrategyRetirementAssessment;
  readonly patterns: readonly PerformancePattern[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
}

export interface MetaLearningExplainabilityEngineOptions {
  readonly maximumFactorsPerStrategy?: number;
  readonly maximumEvidencePerFactor?: number;
  readonly materialWeightDelta?: number;
  readonly materialRiskThreshold?: number;
  readonly lowConfidenceThreshold?: number;
  readonly highTurnoverThreshold?: number;
}

export class MetaLearningExplainabilityEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "META_LEARNING_EXPLAINABILITY_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "MetaLearningExplainabilityEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MetaLearningExplainabilityEngine
  implements MetaLearningExplainabilityEnginePort
{
  private readonly maximumFactorsPerStrategy: number;
  private readonly maximumEvidencePerFactor: number;
  private readonly materialWeightDelta: number;
  private readonly materialRiskThreshold: number;
  private readonly lowConfidenceThreshold: number;
  private readonly highTurnoverThreshold: number;

  public constructor(options: MetaLearningExplainabilityEngineOptions = {}) {
    this.maximumFactorsPerStrategy = positiveIntegerOption(
      options.maximumFactorsPerStrategy ?? 8,
      "maximumFactorsPerStrategy",
    );
    this.maximumEvidencePerFactor = positiveIntegerOption(
      options.maximumEvidencePerFactor ?? 5,
      "maximumEvidencePerFactor",
    );
    this.materialWeightDelta = unitIntervalOption(
      options.materialWeightDelta ?? 0.01,
      "materialWeightDelta",
    );
    this.materialRiskThreshold = unitIntervalOption(
      options.materialRiskThreshold ?? 0.5,
      "materialRiskThreshold",
    );
    this.lowConfidenceThreshold = unitIntervalOption(
      options.lowConfidenceThreshold ?? 0.6,
      "lowConfidenceThreshold",
    );
    this.highTurnoverThreshold = unitIntervalOption(
      options.highTurnoverThreshold ?? 0.2,
      "highTurnoverThreshold",
    );
  }

  public explain(
    request: MetaLearningExplainabilityRequest,
  ): MetaLearningExplainabilityResult {
    this.assertRequest(request);

    const warnings = this.collectWarnings(request);
    const strategyIds = this.collectStrategyIds(request);
    const learningByStrategy = indexByStrategy(request.learningResult.scores);
    const weightByStrategy = indexByStrategy(request.weightLearningResult.weights);
    const reinforcementByStrategy = indexByStrategy(request.feedbackResult.states);
    const promotionByStrategy = indexByStrategy(
      request.promotionResult.assessments,
    );
    const retirementByStrategy = indexByStrategy(
      request.retirementResult.assessments,
    );
    const candidatesByStrategy = groupCandidatesByParent(
      request.evolutionResult.candidates,
    );
    const patternsByStrategy = groupPatternsByStrategy(request.patterns);

    const strategyExplanations = strategyIds.map((strategyId) =>
      this.explainStrategy({
        strategyId,
        learningScore: learningByStrategy.get(strategyId),
        weight: weightByStrategy.get(strategyId),
        reinforcementState: reinforcementByStrategy.get(strategyId),
        candidates: candidatesByStrategy.get(strategyId) ?? Object.freeze([]),
        promotion: promotionByStrategy.get(strategyId),
        retirement: retirementByStrategy.get(strategyId),
        patterns: patternsByStrategy.get(strategyId) ?? Object.freeze([]),
        regimeProfiles: request.regimeProfiles,
      }),
    );

    const portfolioRisks = this.buildPortfolioRisks(request, strategyExplanations);
    const appliedSafeguards = this.buildAppliedSafeguards(
      request,
      strategyExplanations,
    );
    const confidence = this.calculateOverallConfidence(
      request,
      strategyExplanations,
    );
    const executiveSummary = this.buildExecutiveSummary(
      request,
      strategyExplanations,
      portfolioRisks,
      confidence,
    );

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      executiveSummary,
      strategyExplanations,
      portfolioRisks,
      appliedSafeguards,
      confidence: round(confidence),
      warnings,
    });
  }

  private explainStrategy(
    context: StrategyExplainabilityContext,
  ): StrategyMetaLearningExplanation {
    const factors: MetaLearningExplanationFactor[] = [];

    this.addLearningFactors(context, factors);
    this.addWeightFactor(context, factors);
    this.addReinforcementFactor(context, factors);
    this.addEvolutionFactors(context, factors);
    this.addLifecycleFactors(context, factors);
    this.addPatternFactors(context, factors);
    this.addRegimeFactor(context, factors);

    const rankedFactors = factors
      .sort(compareFactors)
      .slice(0, this.maximumFactorsPerStrategy);
    const decision = determineDecision(context);
    const evolutionAction = determineEvolutionAction(context);
    const risks = this.buildStrategyRisks(context);
    const safeguards = this.buildStrategySafeguards(context, decision, risks);
    const summary = buildStrategySummary(
      context,
      decision,
      evolutionAction,
      rankedFactors,
    );

    return freezeStrategyExplanation({
      strategyId: context.strategyId,
      summary,
      decision,
      evolutionAction,
      previousWeight: context.weight?.previousWeight,
      proposedWeight: context.weight?.boundedWeight,
      factors: rankedFactors,
      risks,
      safeguards,
    });
  }

  private addLearningFactors(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    const score = context.learningScore;
    if (!score) return;

    factors.push(
      freezeFactor({
        factor: "LEARNED_PERFORMANCE_QUALITY",
        direction: directionFromCentered(score.normalizedScore),
        importance: 0.95,
        contribution: centeredContribution(score.normalizedScore, 0.95),
        evidence: [
          `Normalized score: ${format(score.normalizedScore)}.`,
          `Risk-adjusted score: ${format(score.riskAdjustedScore)}.`,
          ...score.reasons,
        ],
      }, this.maximumEvidencePerFactor),
      freezeFactor({
        factor: "STABILITY_AND_REGIME_ROBUSTNESS",
        direction: directionFromCentered(
          average([score.stabilityScore, score.regimeRobustnessScore]),
        ),
        importance: 0.8,
        contribution: centeredContribution(
          average([score.stabilityScore, score.regimeRobustnessScore]),
          0.8,
        ),
        evidence: [
          `Stability score: ${format(score.stabilityScore)}.`,
          `Regime robustness score: ${format(score.regimeRobustnessScore)}.`,
          `Learning confidence: ${format(score.confidence)}.`,
        ],
      }, this.maximumEvidencePerFactor),
    );

    const aggregatePenalty = average([
      score.drawdownPenalty,
      score.tailRiskPenalty,
      score.executionCostPenalty,
      score.sampleSizePenalty,
    ]);
    factors.push(
      freezeFactor({
        factor: "LEARNING_RISK_PENALTIES",
        direction: aggregatePenalty > EPSILON ? "NEGATIVE" : "NEUTRAL",
        importance: 0.85,
        contribution: -aggregatePenalty * 0.85,
        evidence: [
          `Drawdown penalty: ${format(score.drawdownPenalty)}.`,
          `Tail-risk penalty: ${format(score.tailRiskPenalty)}.`,
          `Execution-cost penalty: ${format(score.executionCostPenalty)}.`,
          `Sample-size penalty: ${format(score.sampleSizePenalty)}.`,
        ],
      }, this.maximumEvidencePerFactor),
    );
  }

  private addWeightFactor(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    const weight = context.weight;
    if (!weight) return;

    factors.push(
      freezeFactor({
        factor: "ADAPTIVE_WEIGHT_CHANGE",
        direction:
          weight.delta > EPSILON
            ? "POSITIVE"
            : weight.delta < -EPSILON
              ? "NEGATIVE"
              : "NEUTRAL",
        importance: clamp01(
          0.5 + Math.min(0.5, Math.abs(weight.delta) * 5),
        ),
        contribution: clamp(weight.delta * 5, -1, 1),
        evidence: [
          `Previous weight: ${format(weight.previousWeight)}.`,
          `Proposed weight: ${format(weight.proposedWeight)}.`,
          `Bounded weight: ${format(weight.boundedWeight)}.`,
          `Weight confidence: ${format(weight.confidence)}.`,
          ...weight.reasons,
        ],
      }, this.maximumEvidencePerFactor),
    );
  }

  private addReinforcementFactor(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    const state = context.reinforcementState;
    if (!state) return;

    const total =
      state.positiveFeedbackCount +
      state.negativeFeedbackCount +
      state.neutralFeedbackCount;
    const feedbackBalance = safeDivide(
      state.positiveFeedbackCount - state.negativeFeedbackCount,
      Math.max(1, total),
    );
    const combined = clamp(
      average([feedbackBalance, state.exponentiallyWeightedReward]),
      -1,
      1,
    );

    factors.push(
      freezeFactor({
        factor: "REINFORCEMENT_FEEDBACK",
        direction: directionFromSigned(combined),
        importance: clamp01(0.55 + state.confidence * 0.4),
        contribution: combined * clamp01(state.confidence),
        evidence: [
          `Exponentially weighted reward: ${format(state.exponentiallyWeightedReward)}.`,
          `Cumulative reward: ${format(state.cumulativeReward)}.`,
          `Positive/negative/neutral events: ${state.positiveFeedbackCount}/${state.negativeFeedbackCount}/${state.neutralFeedbackCount}.`,
          `Reinforcement confidence: ${format(state.confidence)}.`,
        ],
      }, this.maximumEvidencePerFactor),
    );
  }

  private addEvolutionFactors(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    for (const candidate of [...context.candidates].sort(compareCandidates)) {
      const contribution = clamp(
        candidate.expectedImprovement - Math.max(0, candidate.expectedRiskChange),
        -1,
        1,
      );
      factors.push(
        freezeFactor({
          factor: `EVOLUTION_${candidate.action}`,
          direction: directionFromSigned(contribution),
          importance: clamp01(candidate.confidence),
          contribution,
          evidence: [
            `Candidate '${candidate.candidateId}' proposes '${candidate.action}'.`,
            `Expected improvement: ${format(candidate.expectedImprovement)}.`,
            `Expected risk change: ${format(candidate.expectedRiskChange)}.`,
            `Novelty score: ${format(candidate.noveltyScore)}.`,
            ...candidate.reasons,
          ],
        }, this.maximumEvidencePerFactor),
      );
    }
  }

  private addLifecycleFactors(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    const promotion = context.promotion;
    if (promotion) {
      const positive = promotion.decision === "PROMOTE";
      const negative = promotion.decision === "REJECT";
      factors.push(
        freezeFactor({
          factor: "PROMOTION_ASSESSMENT",
          direction: positive ? "POSITIVE" : negative ? "NEGATIVE" : "NEUTRAL",
          importance: clamp01(promotion.confidence),
          contribution: positive
            ? promotion.confidence
            : negative
              ? -promotion.confidence
              : 0,
          evidence: [
            `Promotion decision: ${promotion.decision}.`,
            `Lifecycle transition: ${promotion.currentState} -> ${promotion.proposedState}.`,
            `Performance/stability/regime/sample scores: ${format(promotion.performanceScore)}/${format(promotion.stabilityScore)}/${format(promotion.regimeRobustnessScore)}/${format(promotion.sampleAdequacyScore)}.`,
            ...promotion.reasons,
          ],
        }, this.maximumEvidencePerFactor),
      );
    }

    const retirement = context.retirement;
    if (retirement) {
      const negative =
        retirement.decision === "RETIRE" ||
        retirement.decision === "PLACE_ON_PROBATION";
      factors.push(
        freezeFactor({
          factor: "RETIREMENT_ASSESSMENT",
          direction: negative ? "NEGATIVE" : "NEUTRAL",
          importance: clamp01(retirement.confidence),
          contribution: negative
            ? -average([
                retirement.degradationScore,
                retirement.drawdownSeverity,
                retirement.negativeFeedbackScore,
                retirement.regimeObsolescenceScore,
              ])
            : 0,
          evidence: [
            `Retirement decision: ${retirement.decision}.`,
            `Lifecycle transition: ${retirement.currentState} -> ${retirement.proposedState}.`,
            `Degradation score: ${format(retirement.degradationScore)}.`,
            `Drawdown severity: ${format(retirement.drawdownSeverity)}.`,
            `Negative feedback score: ${format(retirement.negativeFeedbackScore)}.`,
            ...retirement.reasons,
          ],
        }, this.maximumEvidencePerFactor),
      );
    }
  }

  private addPatternFactors(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    const patterns = [...context.patterns]
      .sort(comparePatterns)
      .slice(0, 3);

    for (const pattern of patterns) {
      const signedImpact =
        pattern.direction === "NEGATIVE"
          ? -Math.abs(pattern.expectedImpact)
          : pattern.direction === "POSITIVE"
            ? Math.abs(pattern.expectedImpact)
            : pattern.expectedImpact;
      factors.push(
        freezeFactor({
          factor: `PATTERN_${normalizeLabel(pattern.name)}`,
          direction: pattern.direction,
          importance: clamp01(
            average([pattern.confidence, pattern.stabilityScore]),
          ),
          contribution: clamp(signedImpact * pattern.confidence, -1, 1),
          evidence: [
            pattern.description,
            `Pattern confidence/support: ${format(pattern.confidence)}/${format(pattern.support)}.`,
            `Sample size: ${pattern.sampleSize}.`,
            `Expected impact: ${format(pattern.expectedImpact)}.`,
          ],
        }, this.maximumEvidencePerFactor),
      );
    }
  }

  private addRegimeFactor(
    context: StrategyExplainabilityContext,
    factors: MetaLearningExplanationFactor[],
  ): void {
    const evidence = context.regimeProfiles.flatMap((profile) =>
      profile.strategyEvidence
        .filter((item) => item.strategyId === context.strategyId)
        .map((item) => ({ profile, item })),
    );
    const preferred = context.regimeProfiles.filter((profile) =>
      profile.preferredStrategyIds.includes(context.strategyId),
    );
    const avoided = context.regimeProfiles.filter((profile) =>
      profile.avoidedStrategyIds.includes(context.strategyId),
    );

    if (evidence.length === 0 && preferred.length === 0 && avoided.length === 0) {
      return;
    }

    const weightedScore = weightedAverage(
      evidence.map(({ profile, item }) => ({
        value: item.score,
        weight: item.confidence * profile.confidence,
      })),
    );
    const preferenceBias = safeDivide(
      preferred.length - avoided.length,
      Math.max(1, preferred.length + avoided.length),
    );
    const regimeSignal = clamp(
      evidence.length > 0
        ? average([weightedScore * 2 - 1, preferenceBias])
        : preferenceBias,
      -1,
      1,
    );

    factors.push(
      freezeFactor({
        factor: "LEARNED_REGIME_RELEVANCE",
        direction: directionFromSigned(regimeSignal),
        importance: clamp01(
          average(context.regimeProfiles.map((profile) => profile.confidence)),
        ),
        contribution: regimeSignal,
        evidence: [
          `Preferred in ${preferred.length} learned regime profile(s).`,
          `Avoided in ${avoided.length} learned regime profile(s).`,
          `Weighted strategy-regime score: ${format(weightedScore)}.`,
          ...preferred.map((profile) => `Preferred in ${profile.regime}.`),
          ...avoided.map((profile) => `Avoided in ${profile.regime}.`),
        ],
      }, this.maximumEvidencePerFactor),
    );
  }

  private buildStrategyRisks(
    context: StrategyExplainabilityContext,
  ): readonly string[] {
    const risks: string[] = [];
    const score = context.learningScore;
    if (!score) risks.push("No learning score was available for this strategy.");
    if (score && score.confidence < this.lowConfidenceThreshold) {
      risks.push(`Learning confidence is low (${format(score.confidence)}).`);
    }
    if (score && score.drawdownPenalty >= this.materialRiskThreshold) {
      risks.push(`Drawdown penalty is elevated (${format(score.drawdownPenalty)}).`);
    }
    if (score && score.tailRiskPenalty >= this.materialRiskThreshold) {
      risks.push(`Tail-risk penalty is elevated (${format(score.tailRiskPenalty)}).`);
    }
    if (score && score.executionCostPenalty >= this.materialRiskThreshold) {
      risks.push(`Execution-cost penalty is elevated (${format(score.executionCostPenalty)}).`);
    }
    if (context.weight && context.weight.confidence < this.lowConfidenceThreshold) {
      risks.push(`Weight-change confidence is low (${format(context.weight.confidence)}).`);
    }
    for (const candidate of context.candidates) {
      if (candidate.expectedRiskChange > 0) {
        risks.push(
          `Evolution candidate '${candidate.candidateId}' increases expected risk by ${format(candidate.expectedRiskChange)}.`,
        );
      }
    }
    if (context.retirement?.decision === "RETIRE") {
      risks.push("Retirement criteria were satisfied.");
    } else if (context.retirement?.decision === "PLACE_ON_PROBATION") {
      risks.push("Lifecycle deterioration requires probation.");
    }
    if (context.patterns.some((pattern) => pattern.direction === "NEGATIVE")) {
      risks.push("One or more learned performance patterns are negative.");
    }
    return Object.freeze(Array.from(new Set(risks)).sort());
  }

  private buildStrategySafeguards(
    context: StrategyExplainabilityContext,
    decision: MetaLearningDecision,
    risks: readonly string[],
  ): readonly string[] {
    const safeguards: string[] = [];
    if (context.weight) {
      safeguards.push("The proposed allocation uses the bounded adaptive weight.");
    }
    if (context.candidates.length > 0) {
      safeguards.push("Evolution candidates remain subject to all required validation stages.");
    }
    if (decision === "DEFER") {
      safeguards.push("The change is deferred until evidence or confidence improves.");
    }
    if (decision === "REJECT") {
      safeguards.push("The proposed strategy change is rejected from automatic application.");
    }
    if (context.promotion?.decision === "DEFER") {
      safeguards.push("Promotion is deferred pending additional successful evidence.");
    }
    if (context.retirement?.decision === "PLACE_ON_PROBATION") {
      safeguards.push("Probation is applied before final retirement.");
    }
    if (risks.length > 0) {
      safeguards.push("Material risks are explicitly surfaced for downstream policy review.");
    }
    return Object.freeze(Array.from(new Set(safeguards)).sort());
  }

  private buildPortfolioRisks(
    request: MetaLearningExplainabilityRequest,
    explanations: readonly StrategyMetaLearningExplanation[],
  ): readonly string[] {
    const risks: string[] = [];
    if (request.weightLearningResult.expectedTurnover >= this.highTurnoverThreshold) {
      risks.push(
        `Expected portfolio turnover is elevated at ${format(request.weightLearningResult.expectedTurnover)}.`,
      );
    }
    if (request.weightLearningResult.confidence < this.lowConfidenceThreshold) {
      risks.push(
        `Portfolio weight-learning confidence is low at ${format(request.weightLearningResult.confidence)}.`,
      );
    }
    if (request.weightLearningResult.totalAllocatedWeight > 1 + EPSILON) {
      risks.push("Total allocated strategy weight exceeds one.");
    }
    if (request.retirementResult.retiredStrategyIds.length > 0) {
      risks.push(
        `${request.retirementResult.retiredStrategyIds.length} strategy or strategies are proposed for retirement.`,
      );
    }
    const riskIncreasingCandidates = request.evolutionResult.candidates.filter(
      (candidate) => candidate.expectedRiskChange > 0,
    );
    if (riskIncreasingCandidates.length > 0) {
      risks.push(
        `${riskIncreasingCandidates.length} evolution candidate(s) have positive expected risk change.`,
      );
    }
    const rejected = explanations.filter(
      (explanation) => explanation.decision === "REJECT",
    ).length;
    if (rejected > 0) {
      risks.push(`${rejected} strategy decision(s) were rejected.`);
    }
    if (request.regimeProfiles.length === 0) {
      risks.push("No learned regime profiles were available for contextual validation.");
    }
    return Object.freeze(Array.from(new Set(risks)).sort());
  }

  private buildAppliedSafeguards(
    request: MetaLearningExplainabilityRequest,
    explanations: readonly StrategyMetaLearningExplanation[],
  ): readonly string[] {
    const safeguards: string[] = [
      "All explanations were generated deterministically from immutable milestone outputs.",
      "Adaptive allocations are reported using bounded weights rather than unbounded proposals.",
      "Evolution candidates preserve their required validation-stage requirements.",
      "Promotion and retirement assessments remain separate from direct execution.",
    ];
    if (request.weightLearningResult.reserveWeight > 0) {
      safeguards.push(
        `A portfolio reserve weight of ${format(request.weightLearningResult.reserveWeight)} is preserved.`,
      );
    }
    if (explanations.some((item) => item.decision === "DEFER")) {
      safeguards.push("Low-evidence or low-confidence strategy changes are deferred.");
    }
    if (request.retirementResult.probationStrategyIds.length > 0) {
      safeguards.push("Probation is used as an intermediate lifecycle control.");
    }
    return Object.freeze(Array.from(new Set(safeguards)).sort());
  }

  private calculateOverallConfidence(
    request: MetaLearningExplainabilityRequest,
    explanations: readonly StrategyMetaLearningExplanation[],
  ): number {
    const values: number[] = [request.weightLearningResult.confidence];
    values.push(...request.learningResult.scores.map((score) => score.confidence));
    values.push(...request.feedbackResult.states.map((state) => state.confidence));
    values.push(...request.evolutionResult.candidates.map((item) => item.confidence));
    values.push(...request.promotionResult.assessments.map((item) => item.confidence));
    values.push(...request.retirementResult.assessments.map((item) => item.confidence));
    values.push(...request.patterns.map((item) => item.confidence));
    values.push(...request.regimeProfiles.map((item) => item.confidence));

    const evidenceCoverage = clamp01(
      safeDivide(
        explanations.filter((item) => item.factors.length > 0).length,
        Math.max(1, explanations.length),
      ),
    );
    return clamp01(average(values.filter(Number.isFinite)) * 0.85 + evidenceCoverage * 0.15);
  }

  private buildExecutiveSummary(
    request: MetaLearningExplainabilityRequest,
    explanations: readonly StrategyMetaLearningExplanation[],
    portfolioRisks: readonly string[],
    confidence: number,
  ): string {
    const counts = countDecisions(explanations);
    return [
      `Meta-learning explainability evaluated ${explanations.length} strategy or strategies.`,
      `${counts.APPLY} apply, ${counts.HOLD} hold, ${counts.DEFER} defer, and ${counts.REJECT} reject decision(s) were produced.`,
      `${request.evolutionResult.candidates.length} evolution candidate(s), ${request.promotionResult.promotedStrategyIds.length} promotion(s), ${request.retirementResult.retiredStrategyIds.length} retirement(s), and ${request.retirementResult.probationStrategyIds.length} probation action(s) were represented.`,
      `Expected portfolio turnover is ${format(request.weightLearningResult.expectedTurnover)}, with explainability confidence ${format(confidence)}.`,
      `${portfolioRisks.length} portfolio-level risk statement(s) were identified.`,
    ].join(" ");
  }

  private collectWarnings(
    request: MetaLearningExplainabilityRequest,
  ): readonly string[] {
    const warnings = [
      ...request.learningResult.warnings,
      ...request.weightLearningResult.warnings,
      ...request.feedbackResult.warnings,
      ...request.evolutionResult.warnings,
      ...request.promotionResult.warnings,
      ...request.retirementResult.warnings,
    ];
    const strategyIds = this.collectStrategyIds(request);
    if (strategyIds.length === 0) {
      warnings.push("No strategy evidence was available to explain.");
    }
    return Object.freeze(Array.from(new Set(warnings.map((item) => item.trim()).filter(Boolean))).sort());
  }

  private collectStrategyIds(
    request: MetaLearningExplainabilityRequest,
  ): readonly string[] {
    const ids = new Set<string>();
    request.learningResult.scores.forEach((item) => ids.add(item.strategyId));
    request.weightLearningResult.weights.forEach((item) => ids.add(item.strategyId));
    request.feedbackResult.states.forEach((item) => ids.add(item.strategyId));
    request.feedbackResult.events.forEach((item) => ids.add(item.strategyId));
    request.evolutionResult.candidates.forEach((item) => {
      item.parentStrategyIds.forEach((id) => ids.add(id));
    });
    request.evolutionResult.unchangedStrategyIds.forEach((id) => ids.add(id));
    request.promotionResult.assessments.forEach((item) => ids.add(item.strategyId));
    request.retirementResult.assessments.forEach((item) => ids.add(item.strategyId));
    request.patterns.forEach((item) => item.strategyIds.forEach((id) => ids.add(id)));
    request.regimeProfiles.forEach((profile) => {
      profile.preferredStrategyIds.forEach((id) => ids.add(id));
      profile.avoidedStrategyIds.forEach((id) => ids.add(id));
      profile.strategyEvidence.forEach((item) => ids.add(item.strategyId));
    });
    return Object.freeze([...ids].sort());
  }

  private assertRequest(request: MetaLearningExplainabilityRequest): void {
    if (request === null || typeof request !== "object") {
      throw new MetaLearningExplainabilityEngineError(
        "Meta-learning explainability request must be an object.",
        "INVALID_META_LEARNING_EXPLAINABILITY_REQUEST",
      );
    }
    assertNonEmptyString(request.requestId, "requestId");
    assertTimestamp(request.generatedAt, "generatedAt");
    assertObject(request.learningResult, "learningResult");
    assertObject(request.weightLearningResult, "weightLearningResult");
    assertObject(request.feedbackResult, "feedbackResult");
    assertObject(request.evolutionResult, "evolutionResult");
    assertObject(request.promotionResult, "promotionResult");
    assertObject(request.retirementResult, "retirementResult");
    assertArray(request.patterns, "patterns");
    assertArray(request.regimeProfiles, "regimeProfiles");

    assertArray(request.learningResult.scores, "learningResult.scores");
    assertArray(request.learningResult.bestStrategyIds, "learningResult.bestStrategyIds");
    assertArray(request.learningResult.underperformingStrategyIds, "learningResult.underperformingStrategyIds");
    assertArray(request.learningResult.warnings, "learningResult.warnings");
    assertArray(request.weightLearningResult.weights, "weightLearningResult.weights");
    assertArray(request.weightLearningResult.warnings, "weightLearningResult.warnings");
    assertArray(request.feedbackResult.events, "feedbackResult.events");
    assertArray(request.feedbackResult.states, "feedbackResult.states");
    assertArray(request.feedbackResult.warnings, "feedbackResult.warnings");
    assertArray(request.evolutionResult.candidates, "evolutionResult.candidates");
    assertArray(request.evolutionResult.unchangedStrategyIds, "evolutionResult.unchangedStrategyIds");
    assertArray(request.evolutionResult.warnings, "evolutionResult.warnings");
    assertArray(request.promotionResult.assessments, "promotionResult.assessments");
    assertArray(request.promotionResult.promotedStrategyIds, "promotionResult.promotedStrategyIds");
    assertArray(request.promotionResult.deferredStrategyIds, "promotionResult.deferredStrategyIds");
    assertArray(request.promotionResult.warnings, "promotionResult.warnings");
    assertArray(request.retirementResult.assessments, "retirementResult.assessments");
    assertArray(request.retirementResult.retiredStrategyIds, "retirementResult.retiredStrategyIds");
    assertArray(request.retirementResult.probationStrategyIds, "retirementResult.probationStrategyIds");
    assertArray(request.retirementResult.warnings, "retirementResult.warnings");

    assertUnitInterval(request.weightLearningResult.confidence, "weightLearningResult.confidence");
    assertFinite(request.weightLearningResult.reserveWeight, "weightLearningResult.reserveWeight");
    assertFinite(request.weightLearningResult.totalAllocatedWeight, "weightLearningResult.totalAllocatedWeight");
    assertFinite(request.weightLearningResult.expectedTurnover, "weightLearningResult.expectedTurnover");

    assertUnique(request.learningResult.scores.map((item) => item.strategyId), "learningResult.scores");
    assertUnique(request.weightLearningResult.weights.map((item) => item.strategyId), "weightLearningResult.weights");
    assertUnique(request.feedbackResult.states.map((item) => item.strategyId), "feedbackResult.states");
    assertUnique(request.promotionResult.assessments.map((item) => item.strategyId), "promotionResult.assessments");
    assertUnique(request.retirementResult.assessments.map((item) => item.strategyId), "retirementResult.assessments");

    request.learningResult.scores.forEach((item, index) => this.assertLearningScore(item, `learningResult.scores[${index}]`));
    request.weightLearningResult.weights.forEach((item, index) => this.assertWeight(item, `weightLearningResult.weights[${index}]`));
    request.feedbackResult.states.forEach((item, index) => this.assertReinforcementState(item, `feedbackResult.states[${index}]`));
    request.evolutionResult.candidates.forEach((item, index) => this.assertCandidate(item, `evolutionResult.candidates[${index}]`));
    request.promotionResult.assessments.forEach((item, index) => this.assertPromotion(item, `promotionResult.assessments[${index}]`));
    request.retirementResult.assessments.forEach((item, index) => this.assertRetirement(item, `retirementResult.assessments[${index}]`));
    request.patterns.forEach((item, index) => this.assertPattern(item, `patterns[${index}]`));
    request.regimeProfiles.forEach((item, index) => this.assertRegimeProfile(item, `regimeProfiles[${index}]`));
  }

  private assertLearningScore(item: StrategyLearningScore, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.strategyId, `${path}.strategyId`);
    ["normalizedScore", "confidence", "stabilityScore", "regimeRobustnessScore", "riskAdjustedScore", "drawdownPenalty", "tailRiskPenalty", "executionCostPenalty", "sampleSizePenalty"].forEach((field) =>
      assertUnitInterval(item[field as keyof StrategyLearningScore] as number, `${path}.${field}`),
    );
    assertFinite(item.rawScore, `${path}.rawScore`);
    assertArray(item.reasons, `${path}.reasons`);
  }

  private assertWeight(item: AdaptiveStrategyWeight, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.strategyId, `${path}.strategyId`);
    assertFinite(item.previousWeight, `${path}.previousWeight`);
    assertFinite(item.proposedWeight, `${path}.proposedWeight`);
    assertFinite(item.boundedWeight, `${path}.boundedWeight`);
    assertFinite(item.delta, `${path}.delta`);
    assertUnitInterval(item.confidence, `${path}.confidence`);
    assertArray(item.reasons, `${path}.reasons`);
  }

  private assertReinforcementState(item: StrategyReinforcementState, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.strategyId, `${path}.strategyId`);
    assertFinite(item.cumulativeReward, `${path}.cumulativeReward`);
    assertFinite(item.exponentiallyWeightedReward, `${path}.exponentiallyWeightedReward`);
    assertNonNegativeInteger(item.positiveFeedbackCount, `${path}.positiveFeedbackCount`);
    assertNonNegativeInteger(item.negativeFeedbackCount, `${path}.negativeFeedbackCount`);
    assertNonNegativeInteger(item.neutralFeedbackCount, `${path}.neutralFeedbackCount`);
    assertUnitInterval(item.confidence, `${path}.confidence`);
    assertTimestamp(item.lastUpdatedAt, `${path}.lastUpdatedAt`);
  }

  private assertCandidate(item: StrategyEvolutionCandidate, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.candidateId, `${path}.candidateId`);
    assertNonEmptyString(item.proposedStrategyId, `${path}.proposedStrategyId`);
    assertArray(item.parentStrategyIds, `${path}.parentStrategyIds`);
    if (item.parentStrategyIds.length === 0) throw invalid(`${path}.parentStrategyIds must not be empty.`);
    if (!EVOLUTION_ACTIONS.includes(item.action)) throw invalid(`${path}.action is invalid.`);
    assertArray(item.parameterMutations, `${path}.parameterMutations`);
    assertFinite(item.expectedImprovement, `${path}.expectedImprovement`);
    assertFinite(item.expectedRiskChange, `${path}.expectedRiskChange`);
    assertUnitInterval(item.noveltyScore, `${path}.noveltyScore`);
    assertUnitInterval(item.confidence, `${path}.confidence`);
    assertArray(item.requiredValidationStages, `${path}.requiredValidationStages`);
    assertArray(item.reasons, `${path}.reasons`);
  }

  private assertPromotion(item: StrategyPromotionAssessment, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.strategyId, `${path}.strategyId`);
    ["performanceScore", "stabilityScore", "regimeRobustnessScore", "sampleAdequacyScore", "confidence"].forEach((field) =>
      assertUnitInterval(item[field as keyof StrategyPromotionAssessment] as number, `${path}.${field}`),
    );
    assertArray(item.reasons, `${path}.reasons`);
  }

  private assertRetirement(item: StrategyRetirementAssessment, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.strategyId, `${path}.strategyId`);
    ["degradationScore", "drawdownSeverity", "negativeFeedbackScore", "regimeObsolescenceScore", "confidence"].forEach((field) =>
      assertUnitInterval(item[field as keyof StrategyRetirementAssessment] as number, `${path}.${field}`),
    );
    assertArray(item.reasons, `${path}.reasons`);
  }

  private assertPattern(item: PerformancePattern, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.patternId, `${path}.patternId`);
    assertNonEmptyString(item.name, `${path}.name`);
    assertNonEmptyString(item.description, `${path}.description`);
    assertArray(item.strategyIds, `${path}.strategyIds`);
    assertArray(item.regimes, `${path}.regimes`);
    if (!PATTERN_DIRECTIONS.includes(item.direction)) throw invalid(`${path}.direction is invalid.`);
    assertUnitInterval(item.confidence, `${path}.confidence`);
    assertUnitInterval(item.support, `${path}.support`);
    assertNonNegativeInteger(item.sampleSize, `${path}.sampleSize`);
    assertFinite(item.expectedImpact, `${path}.expectedImpact`);
    assertUnitInterval(item.stabilityScore, `${path}.stabilityScore`);
    assertTimestamp(item.discoveredAt, `${path}.discoveredAt`);
  }

  private assertRegimeProfile(item: LearnedRegimeProfile, path: string): void {
    assertObject(item, path);
    assertNonEmptyString(item.profileId, `${path}.profileId`);
    assertTimestamp(item.generatedAt, `${path}.generatedAt`);
    assertArray(item.preferredStrategyIds, `${path}.preferredStrategyIds`);
    assertArray(item.avoidedStrategyIds, `${path}.avoidedStrategyIds`);
    assertArray(item.strategyEvidence, `${path}.strategyEvidence`);
    assertUnitInterval(item.confidence, `${path}.confidence`);
    assertUnitInterval(item.stabilityScore, `${path}.stabilityScore`);
  }
}

function determineDecision(context: StrategyExplainabilityContext): MetaLearningDecision {
  if (context.retirement?.decision === "RETIRE" || context.promotion?.decision === "REJECT") return "REJECT";
  if (context.retirement?.decision === "DEFER" || context.promotion?.decision === "DEFER") return "DEFER";
  if (context.retirement?.decision === "PLACE_ON_PROBATION") return "DEFER";
  if (context.promotion?.decision === "PROMOTE") return "APPLY";
  if (context.candidates.length > 0) return "APPLY";
  if (context.weight && Math.abs(context.weight.delta) > EPSILON) return "APPLY";
  return "HOLD";
}

function determineEvolutionAction(context: StrategyExplainabilityContext): StrategyEvolutionAction {
  if (context.retirement?.decision === "RETIRE") return "RETIRE";
  if (context.retirement?.decision === "PLACE_ON_PROBATION") return "DEMOTE";
  if (context.promotion?.decision === "PROMOTE") return "PROMOTE";
  const candidate = [...context.candidates].sort(compareCandidates)[0];
  if (candidate) return candidate.action;
  if (context.weight && Math.abs(context.weight.delta) > EPSILON) return "REWEIGHT";
  return "NO_CHANGE";
}

function buildStrategySummary(
  context: StrategyExplainabilityContext,
  decision: MetaLearningDecision,
  action: StrategyEvolutionAction,
  factors: readonly MetaLearningExplanationFactor[],
): string {
  const dominant = factors[0];
  const weightText = context.weight
    ? ` Weight changes from ${format(context.weight.previousWeight)} to ${format(context.weight.boundedWeight)}.`
    : "";
  const dominantText = dominant
    ? ` The dominant factor is ${dominant.factor} with ${dominant.direction.toLowerCase()} direction.`
    : " No material explanatory factor was available.";
  return `Strategy '${context.strategyId}' receives decision '${decision}' with evolution action '${action}'.${weightText}${dominantText}`;
}

function groupCandidatesByParent(items: readonly StrategyEvolutionCandidate[]): ReadonlyMap<string, readonly StrategyEvolutionCandidate[]> {
  const map = new Map<string, StrategyEvolutionCandidate[]>();
  for (const item of items) {
    for (const strategyId of item.parentStrategyIds) {
      const current = map.get(strategyId) ?? [];
      current.push(item);
      map.set(strategyId, current);
    }
  }
  return new Map([...map.entries()].map(([key, value]) => [key, Object.freeze(value.sort(compareCandidates))]));
}

function groupPatternsByStrategy(items: readonly PerformancePattern[]): ReadonlyMap<string, readonly PerformancePattern[]> {
  const map = new Map<string, PerformancePattern[]>();
  for (const item of items) {
    for (const strategyId of item.strategyIds) {
      const current = map.get(strategyId) ?? [];
      current.push(item);
      map.set(strategyId, current);
    }
  }
  return new Map([...map.entries()].map(([key, value]) => [key, Object.freeze(value.sort(comparePatterns))]));
}

function indexByStrategy<T extends { readonly strategyId: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  return new Map([...items].sort((a, b) => a.strategyId.localeCompare(b.strategyId)).map((item) => [item.strategyId, item]));
}

function compareFactors(a: MetaLearningExplanationFactor, b: MetaLearningExplanationFactor): number {
  return b.importance - a.importance || Math.abs(b.contribution) - Math.abs(a.contribution) || a.factor.localeCompare(b.factor);
}

function compareCandidates(a: StrategyEvolutionCandidate, b: StrategyEvolutionCandidate): number {
  return b.confidence - a.confidence || b.expectedImprovement - a.expectedImprovement || a.candidateId.localeCompare(b.candidateId);
}

function comparePatterns(a: PerformancePattern, b: PerformancePattern): number {
  return b.confidence - a.confidence || b.support - a.support || a.patternId.localeCompare(b.patternId);
}

function directionFromCentered(value: number): PatternDirection {
  if (value > 0.55) return "POSITIVE";
  if (value < 0.45) return "NEGATIVE";
  return "NEUTRAL";
}

function directionFromSigned(value: number): PatternDirection {
  if (value > EPSILON) return "POSITIVE";
  if (value < -EPSILON) return "NEGATIVE";
  return "NEUTRAL";
}

function centeredContribution(value: number, importance: number): number {
  return clamp((clamp01(value) - 0.5) * 2 * clamp01(importance), -1, 1);
}

function countDecisions(items: readonly StrategyMetaLearningExplanation[]): Readonly<Record<MetaLearningDecision, number>> {
  const counts: Record<MetaLearningDecision, number> = { APPLY: 0, HOLD: 0, DEFER: 0, REJECT: 0 };
  items.forEach((item) => { counts[item.decision] += 1; });
  return Object.freeze(counts);
}

function freezeFactor(item: MetaLearningExplanationFactor, maximumEvidence: number): MetaLearningExplanationFactor {
  return Object.freeze({
    factor: item.factor,
    direction: item.direction,
    importance: round(clamp01(item.importance)),
    contribution: round(clamp(item.contribution, -1, 1)),
    evidence: Object.freeze(Array.from(new Set(item.evidence.map((value) => value.trim()).filter(Boolean))).slice(0, maximumEvidence)),
  });
}

function freezeStrategyExplanation(item: StrategyMetaLearningExplanation): StrategyMetaLearningExplanation {
  return Object.freeze({
    strategyId: item.strategyId,
    summary: item.summary,
    decision: item.decision,
    evolutionAction: item.evolutionAction,
    ...(item.previousWeight === undefined ? {} : { previousWeight: round(item.previousWeight) }),
    ...(item.proposedWeight === undefined ? {} : { proposedWeight: round(item.proposedWeight) }),
    factors: Object.freeze([...item.factors]),
    risks: Object.freeze([...item.risks]),
    safeguards: Object.freeze([...item.safeguards]),
  });
}

function freezeResult(item: MetaLearningExplainabilityResult): MetaLearningExplainabilityResult {
  return Object.freeze({
    requestId: item.requestId,
    generatedAt: item.generatedAt,
    executiveSummary: item.executiveSummary,
    strategyExplanations: Object.freeze([...item.strategyExplanations]),
    portfolioRisks: Object.freeze([...item.portfolioRisks]),
    appliedSafeguards: Object.freeze([...item.appliedSafeguards]),
    confidence: round(item.confidence),
    warnings: Object.freeze([...item.warnings]),
  });
}

function weightedAverage(items: readonly { readonly value: number; readonly weight: number }[]): number {
  let numerator = 0;
  let denominator = 0;
  for (const item of items) {
    if (!Number.isFinite(item.value) || !Number.isFinite(item.weight) || item.weight <= 0) continue;
    numerator += item.value * item.weight;
    denominator += item.weight;
  }
  return safeDivide(numerator, denominator);
}

function average(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  return finite.length === 0 ? 0 : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) <= EPSILON) return 0;
  return numerator / denominator;
}

function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
}
function round(value: number, precision = DEFAULT_PRECISION): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function format(value: number): string { return round(value, 6).toFixed(6); }
function normalizeLabel(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "UNNAMED";
}

function positiveIntegerOption(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new MetaLearningExplainabilityEngineError(`${field} must be a positive integer.`, "INVALID_META_LEARNING_EXPLAINABILITY_OPTION");
  return value;
}
function unitIntervalOption(value: number, field: string): number {
  assertUnitInterval(value, field);
  return value;
}
function invalid(message: string): MetaLearningExplainabilityEngineError {
  return new MetaLearningExplainabilityEngineError(message, "INVALID_META_LEARNING_EXPLAINABILITY_INPUT");
}
function assertObject(value: unknown, path: string): asserts value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid(`${path} must be an object.`);
}
function assertArray(value: unknown, path: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw invalid(`${path} must be an array.`);
}
function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw invalid(`${path} must be a non-empty string.`);
}
function assertTimestamp(value: unknown, path: string): asserts value is string {
  assertNonEmptyString(value, path);
  if (!Number.isFinite(Date.parse(value))) throw invalid(`${path} must be a valid timestamp.`);
}
function assertFinite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(`${path} must be a finite number.`);
}
function assertUnitInterval(value: unknown, path: string): asserts value is number {
  assertFinite(value, path);
  if (value < 0 || value > 1) throw invalid(`${path} must be between 0 and 1.`);
}
function assertNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) throw invalid(`${path} must be a non-negative integer.`);
}
function assertUnique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmptyString(value, path);
    if (seen.has(value)) throw invalid(`${path} contains duplicate strategyId '${value}'.`);
    seen.add(value);
  }
}