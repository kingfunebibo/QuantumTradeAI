/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 4:
 * src/trading/ai-decision-intelligence/decision-candidate-generator.ts
 *
 * Deterministic generation of immutable orchestration candidates from the
 * aggregated decision context, current strategy states and meta-learning input.
 */

import type {
  AdaptiveStrategyWeight,
  MetaLearningLifecycleChange,
  StrategyEvolutionCandidate,
  StrategyLearningScore,
  StrategyReinforcementState,
  StrategyRiskObservation,
} from "../ai-meta-learning/ai-meta-learning-contracts";
import type {
  DecisionCandidate,
  DecisionCandidateBuilderPort,
  DecisionCandidateBuilderRequest,
  DecisionCandidateBuilderResult,
  DecisionCandidateType,
  DecisionConfidenceAssessment,
  DecisionConstraint,
  DecisionCostComponents,
  DecisionEvidence,
  DecisionEvidenceDirection,
  DecisionEvidenceSource,
  DecisionIntelligenceId,
  DecisionIntelligenceRunRequest,
  DecisionPriority,
  DecisionRiskImpact,
  DecisionStrategyId,
  DecisionUrgency,
  DecisionUtilityComponents,
  StrategyDecisionState,
  StrategyOperatingMode,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;

export interface DecisionCandidateGeneratorOptions {
  readonly minimumWeightDelta?: number;
  readonly minimumActivationHealth?: number;
  readonly minimumActivationConfidence?: number;
  readonly pauseRiskThreshold?: number;
  readonly deactivateRiskThreshold?: number;
  readonly promotionScoreThreshold?: number;
  readonly demotionScoreThreshold?: number;
  readonly retirementScoreThreshold?: number;
  readonly maximumGeneratedCandidates?: number;
  readonly candidateTtlMs?: number;
  readonly includeDefensiveCandidates?: boolean;
  readonly includeLifecycleCandidates?: boolean;
  readonly includeEvolutionCandidates?: boolean;
  readonly includeNoActionCandidate?: boolean;
}

export class DecisionCandidateGenerationError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "DECISION_CANDIDATE_GENERATION_ERROR",
  ) {
    super(message);
    this.name = "DecisionCandidateGenerationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DecisionCandidateGenerator implements DecisionCandidateBuilderPort {
  private readonly minimumWeightDelta: number;
  private readonly minimumActivationHealth: number;
  private readonly minimumActivationConfidence: number;
  private readonly pauseRiskThreshold: number;
  private readonly deactivateRiskThreshold: number;
  private readonly promotionScoreThreshold: number;
  private readonly demotionScoreThreshold: number;
  private readonly retirementScoreThreshold: number;
  private readonly maximumGeneratedCandidates: number;
  private readonly candidateTtlMs: number;
  private readonly includeDefensiveCandidates: boolean;
  private readonly includeLifecycleCandidates: boolean;
  private readonly includeEvolutionCandidates: boolean;
  private readonly includeNoActionCandidate: boolean;

  public constructor(options: DecisionCandidateGeneratorOptions = {}) {
    this.minimumWeightDelta = unit(options.minimumWeightDelta ?? 0.01);
    this.minimumActivationHealth = unit(options.minimumActivationHealth ?? 0.62);
    this.minimumActivationConfidence = unit(
      options.minimumActivationConfidence ?? 0.58,
    );
    this.pauseRiskThreshold = unit(options.pauseRiskThreshold ?? 0.78);
    this.deactivateRiskThreshold = unit(
      options.deactivateRiskThreshold ?? 0.9,
    );
    this.promotionScoreThreshold = unit(
      options.promotionScoreThreshold ?? 0.78,
    );
    this.demotionScoreThreshold = unit(options.demotionScoreThreshold ?? 0.35);
    this.retirementScoreThreshold = unit(
      options.retirementScoreThreshold ?? 0.18,
    );
    this.maximumGeneratedCandidates = positiveInteger(
      options.maximumGeneratedCandidates ?? 100,
    );
    this.candidateTtlMs = positive(options.candidateTtlMs ?? 15 * 60 * 1000);
    this.includeDefensiveCandidates = options.includeDefensiveCandidates ?? true;
    this.includeLifecycleCandidates = options.includeLifecycleCandidates ?? true;
    this.includeEvolutionCandidates = options.includeEvolutionCandidates ?? true;
    this.includeNoActionCandidate = options.includeNoActionCandidate ?? true;
  }

  public build(input: DecisionCandidateBuilderRequest): DecisionCandidateBuilderResult {
    this.assertInput(input);

    const candidates: DecisionCandidate[] = [];
    const warnings: string[] = [];
    let rejectedCandidateCount = 0;

    const push = (candidate: DecisionCandidate | undefined): void => {
      if (!candidate) {
        rejectedCandidateCount += 1;
        return;
      }
      candidates.push(candidate);
    };

    for (const state of stableSort(
      input.request.strategyStates,
      (value) => value.strategy.strategyId,
    )) {
      const risk = findRisk(input.request, state.strategy.strategyId);
      const learning = findLearningScore(input.request, state.strategy.strategyId);
      const reinforcement = findReinforcement(
        input.request,
        state.strategy.strategyId,
      );
      const adaptiveWeight = findAdaptiveWeight(
        input.request,
        state.strategy.strategyId,
      );

      push(
        this.buildRiskLifecycleCandidate(
          input,
          state,
          risk,
          learning,
          reinforcement,
        ),
      );
      push(
        this.buildActivationCandidate(
          input,
          state,
          risk,
          learning,
          reinforcement,
        ),
      );
      push(
        this.buildAdaptiveWeightCandidate(
          input,
          state,
          adaptiveWeight,
          risk,
          learning,
          reinforcement,
        ),
      );
      push(this.buildLearningLifecycleCandidate(input, state, learning, risk));
    }

    if (this.includeLifecycleCandidates) {
      for (const change of stableSort(
        input.request.metaLearning?.lifecycleChanges ?? [],
        (value) => `${value.strategyId}:${value.action}`,
      )) {
        push(this.buildLifecycleChangeCandidate(input, change));
      }
    }

    if (this.includeEvolutionCandidates) {
      for (const evolution of stableSort(
        input.request.metaLearning?.evolutionCandidates ?? [],
        (value) => value.candidateId,
      )) {
        push(this.buildEvolutionCandidate(input, evolution));
      }
    }

    if (this.includeDefensiveCandidates) {
      push(this.buildPortfolioDefenseCandidate(input));
      push(this.buildPortfolioRebalanceCandidate(input));
    }

    const uniqueCandidates = deduplicateCandidates(candidates);
    if (uniqueCandidates.length < candidates.length) {
      warnings.push(
        `${candidates.length - uniqueCandidates.length} duplicate candidate(s) were removed.`,
      );
      rejectedCandidateCount += candidates.length - uniqueCandidates.length;
    }

    const includeNoAction =
      this.includeNoActionCandidate ||
      input.request.configuration.includeNoActionCandidate;
    if (includeNoAction) {
      uniqueCandidates.push(this.buildNoActionCandidate(input));
    }

    const ordered = stableSort(uniqueCandidates, candidateSortKey);
    const limited = ordered.slice(0, this.maximumGeneratedCandidates);
    if (ordered.length > limited.length) {
      const removed = ordered.length - limited.length;
      rejectedCandidateCount += removed;
      warnings.push(
        `${removed} candidate(s) exceeded the configured generation limit.`,
      );
    }

    if (input.context.blockingConditions.length > 0) {
      warnings.push(
        `Context contains ${input.context.blockingConditions.length} blocking condition(s).`,
      );
    }

    return deepFreeze({
      requestId: input.request.requestId,
      generatedAt: input.generatedAt,
      candidates: limited,
      rejectedCandidateCount,
      warnings: uniqueStrings(warnings),
    });
  }

  public generate(
    input: DecisionCandidateBuilderRequest,
  ): DecisionCandidateBuilderResult {
    return this.build(input);
  }

  private buildRiskLifecycleCandidate(
    input: DecisionCandidateBuilderRequest,
    state: StrategyDecisionState,
    risk: StrategyRiskObservation | undefined,
    learning: StrategyLearningScore | undefined,
    reinforcement: StrategyReinforcementState | undefined,
  ): DecisionCandidate | undefined {
    if (!risk) return undefined;

    let type: DecisionCandidateType | undefined;
    let operatingMode: StrategyOperatingMode | undefined;

    if (
      risk.riskScore >= this.deactivateRiskThreshold ||
      risk.breachedLimits.length >= 2
    ) {
      type = "DEACTIVATE_STRATEGY";
      operatingMode = "DISABLED";
    } else if (
      risk.riskScore >= this.pauseRiskThreshold ||
      risk.remainingRiskBudget <= 0.05
    ) {
      type = "PAUSE_STRATEGY";
      operatingMode = "OBSERVE_ONLY";
    }

    if (!type) return undefined;
    if (
      state.orchestrationState === "INACTIVE" ||
      state.orchestrationState === "STOPPED" ||
      state.operatingMode === "DISABLED"
    ) {
      return undefined;
    }

    const riskSeverity = unit(
      Math.max(risk.riskScore, 1 - risk.remainingRiskBudget),
    );
    const confidence = weightedAverage([
      [riskSeverity, 0.55],
      [1 - unit(state.healthScore), 0.2],
      [learning ? 1 - unit(learning.normalizedScore) : 0.5, 0.15],
      [
        reinforcement
          ? unit(Math.max(0, -reinforcement.exponentiallyWeightedReward))
          : 0.5,
        0.1,
      ],
    ]);

    return this.createCandidate(input, {
      type,
      strategyId: state.strategy.strategyId,
      proposedWeight: 0,
      proposedCapital: 0,
      proposedRiskBudget: 0,
      proposedOperatingMode: operatingMode,
      urgency: riskSeverity >= 0.9 ? "IMMEDIATE" : "HIGH",
      priority: riskSeverity >= 0.9 ? "CRITICAL" : "VERY_HIGH",
      confidence,
      utility: {
        expectedReturnUtility: 0.15,
        riskAdjustedUtility: 0.7,
        drawdownProtectionUtility: riskSeverity,
        diversificationUtility: 0.35,
        regimeAlignmentUtility: 0.5,
        learningUtility: 0.25,
        executionUtility: unit(state.executionQualityScore),
        operationalUtility: unit(input.context.systemReadinessScore),
        stabilityUtility: 0.7,
      },
      costs: {
        expectedTransactionCost: unit(state.currentWeight * 0.25),
        expectedSlippageCost: unit(state.currentWeight * 0.2),
        expectedMarketImpactCost: unit(state.currentWeight * 0.2),
        expectedTurnoverCost: unit(state.currentWeight),
        operationalCost: 0.2,
        opportunityCost: unit(state.performanceScore * 0.5),
        modelRiskCost: 1 - confidence,
      },
      risk,
      projectedRiskScore: unit(risk.riskScore * (type === "DEACTIVATE_STRATEGY" ? 0.3 : 0.55)),
      evidence: [
        evidence(input, "RISK_STATE", state.strategy.strategyId, "STRONGLY_SUPPORTIVE", riskSeverity, confidence,
          `${type} is supported by elevated strategy risk.`),
        evidence(input, "STRATEGY_STATE", state.strategy.strategyId,
          state.healthScore < 0.5 ? "SUPPORTIVE" : "NEUTRAL",
          1 - state.healthScore, state.confidence,
          `Strategy health is ${round(state.healthScore)}.`),
      ],
      rationale: [
        `Strategy risk score is ${round(risk.riskScore)}.`,
        `Remaining risk budget is ${round(risk.remainingRiskBudget)}.`,
        ...(risk.breachedLimits.length > 0
          ? [`Breached limits: ${risk.breachedLimits.join(", ")}.`]
          : []),
      ],
      warnings: risk.breachedLimits,
    });
  }

  private buildActivationCandidate(
    input: DecisionCandidateBuilderRequest,
    state: StrategyDecisionState,
    risk: StrategyRiskObservation | undefined,
    learning: StrategyLearningScore | undefined,
    reinforcement: StrategyReinforcementState | undefined,
  ): DecisionCandidate | undefined {
    const inactive =
      state.orchestrationState === "INACTIVE" ||
      state.orchestrationState === "PAUSED" ||
      state.orchestrationState === "STOPPED" ||
      state.operatingMode === "DISABLED" ||
      state.operatingMode === "OBSERVE_ONLY";
    if (!inactive) return undefined;
    if (!input.context.eligibleStrategyIds.includes(state.strategy.strategyId)) {
      return undefined;
    }
    if (
      state.healthScore < this.minimumActivationHealth ||
      state.confidence < this.minimumActivationConfidence
    ) {
      return undefined;
    }
    if (risk && risk.riskScore >= this.pauseRiskThreshold) return undefined;

    const type: DecisionCandidateType =
      state.orchestrationState === "PAUSED" ? "RESUME_STRATEGY" : "ACTIVATE_STRATEGY";
    const targetWeight = boundedTargetWeight(input.request, state, learning);
    const confidence = weightedAverage([
      [state.healthScore, 0.25],
      [state.confidence, 0.2],
      [state.regimeAlignmentScore, 0.2],
      [learning?.normalizedScore ?? state.performanceScore, 0.2],
      [reinforcement?.confidence ?? 0.5, 0.15],
    ]);

    return this.createCandidate(input, {
      type,
      strategyId: state.strategy.strategyId,
      proposedWeight: targetWeight,
      proposedCapital: input.request.portfolio.totalEquity * targetWeight,
      proposedRiskBudget: risk?.remainingRiskBudget,
      proposedOperatingMode: activationMode(input.request, state),
      urgency: input.context.marketOpportunityScore >= 0.75 ? "HIGH" : "NORMAL",
      priority: confidence >= 0.8 ? "HIGH" : "MEDIUM",
      confidence,
      utility: {
        expectedReturnUtility: learning?.normalizedScore ?? state.performanceScore,
        riskAdjustedUtility: learning?.riskAdjustedScore ?? 1 - (risk?.riskScore ?? 0.5),
        drawdownProtectionUtility: 1 - (risk?.drawdownRisk ?? 0.5),
        diversificationUtility: diversificationUtility(input.request, state.strategy.strategyId),
        regimeAlignmentUtility: state.regimeAlignmentScore,
        learningUtility: learning?.confidence ?? state.confidence,
        executionUtility: state.executionQualityScore,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: state.stabilityScore,
      },
      costs: activationCosts(state, targetWeight),
      risk,
      projectedRiskScore: unit((risk?.riskScore ?? input.context.marketRiskScore) + targetWeight * 0.15),
      evidence: [
        evidence(input, "STRATEGY_STATE", state.strategy.strategyId, "SUPPORTIVE", state.healthScore, state.confidence,
          `Strategy health and confidence satisfy activation thresholds.`),
        evidence(input, "MARKET_CONTEXT", state.strategy.strategyId, "SUPPORTIVE", state.regimeAlignmentScore,
          input.context.regimeConfidence, `Strategy aligns with ${input.context.activeRegime}.`),
        ...(learning
          ? [evidence(input, "META_LEARNING", state.strategy.strategyId, "SUPPORTIVE",
              learning.normalizedScore, learning.confidence,
              `Meta-learning score supports activation.`)]
          : []),
      ],
      rationale: [
        `Strategy is eligible in the active ${input.context.activeRegime} regime.`,
        `Health score ${round(state.healthScore)} and confidence ${round(state.confidence)} exceed activation thresholds.`,
        `Proposed portfolio weight is ${round(targetWeight)}.`,
      ],
      warnings: [],
    });
  }

  private buildAdaptiveWeightCandidate(
    input: DecisionCandidateBuilderRequest,
    state: StrategyDecisionState,
    adaptive: AdaptiveStrategyWeight | undefined,
    risk: StrategyRiskObservation | undefined,
    learning: StrategyLearningScore | undefined,
    reinforcement: StrategyReinforcementState | undefined,
  ): DecisionCandidate | undefined {
    if (!adaptive) return undefined;
    const delta = adaptive.boundedWeight - state.currentWeight;
    if (Math.abs(delta) + EPSILON < this.minimumWeightDelta) return undefined;

    const increasing = delta > 0;
    if (increasing && risk && risk.riskScore >= this.pauseRiskThreshold) {
      return undefined;
    }

    const confidence = weightedAverage([
      [adaptive.confidence, 0.4],
      [learning?.confidence ?? state.confidence, 0.2],
      [state.regimeAlignmentScore, 0.15],
      [1 - (risk?.riskScore ?? 0.5), 0.15],
      [reinforcement?.confidence ?? 0.5, 0.1],
    ]);

    return this.createCandidate(input, {
      type: "REWEIGHT_STRATEGY",
      strategyId: state.strategy.strategyId,
      proposedWeight: adaptive.boundedWeight,
      proposedCapital: input.request.portfolio.totalEquity * adaptive.boundedWeight,
      proposedRiskBudget: risk?.remainingRiskBudget,
      urgency: Math.abs(delta) >= 0.15 ? "HIGH" : "NORMAL",
      priority: Math.abs(delta) >= 0.15 ? "HIGH" : "MEDIUM",
      confidence,
      utility: {
        expectedReturnUtility: learning?.normalizedScore ?? state.performanceScore,
        riskAdjustedUtility: learning?.riskAdjustedScore ?? 1 - (risk?.riskScore ?? 0.5),
        drawdownProtectionUtility: increasing ? 0.4 : 0.7,
        diversificationUtility: diversificationUtility(input.request, state.strategy.strategyId),
        regimeAlignmentUtility: state.regimeAlignmentScore,
        learningUtility: adaptive.confidence,
        executionUtility: state.executionQualityScore,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: 1 - unit(Math.abs(delta)),
      },
      costs: reweightCosts(state, delta),
      risk,
      projectedRiskScore: unit((risk?.riskScore ?? input.context.marketRiskScore) + Math.max(0, delta) * 0.2 - Math.max(0, -delta) * 0.15),
      evidence: [
        evidence(input, "META_LEARNING", state.strategy.strategyId,
          increasing ? "SUPPORTIVE" : "OPPOSING", Math.abs(delta), adaptive.confidence,
          `Adaptive weight changed from ${round(state.currentWeight)} to ${round(adaptive.boundedWeight)}.`),
        evidence(input, "RISK_STATE", state.strategy.strategyId,
          increasing ? "NEUTRAL" : "SUPPORTIVE", risk?.riskScore ?? 0.5,
          confidence, `Risk was considered before proposing the weight change.`),
      ],
      rationale: [
        ...adaptive.reasons,
        `Weight delta is ${round(delta)}.`,
      ],
      warnings: risk?.breachedLimits ?? [],
    });
  }

  private buildLearningLifecycleCandidate(
    input: DecisionCandidateBuilderRequest,
    state: StrategyDecisionState,
    learning: StrategyLearningScore | undefined,
    risk: StrategyRiskObservation | undefined,
  ): DecisionCandidate | undefined {
    if (!learning || !this.includeLifecycleCandidates) return undefined;

    let type: DecisionCandidateType | undefined;
    let priority: DecisionPriority = "MEDIUM";
    let urgency: DecisionUrgency = "LOW";

    if (learning.normalizedScore <= this.retirementScoreThreshold) {
      type = "RETIRE_STRATEGY";
      priority = "HIGH";
      urgency = "NORMAL";
    } else if (learning.normalizedScore <= this.demotionScoreThreshold) {
      type = "DEMOTE_STRATEGY";
    } else if (
      learning.normalizedScore >= this.promotionScoreThreshold &&
      state.healthScore >= this.minimumActivationHealth
    ) {
      type = "PROMOTE_STRATEGY";
      priority = "HIGH";
      urgency = "NORMAL";
    }

    if (!type) return undefined;
    const confidence = weightedAverage([
      [learning.confidence, 0.4],
      [learning.stabilityScore, 0.2],
      [learning.regimeRobustnessScore, 0.2],
      [state.healthScore, 0.1],
      [1 - (risk?.riskScore ?? 0.5), 0.1],
    ]);

    return this.createCandidate(input, {
      type,
      strategyId: state.strategy.strategyId,
      proposedOperatingMode:
        type === "PROMOTE_STRATEGY"
          ? promotedMode(state.operatingMode)
          : type === "DEMOTE_STRATEGY"
            ? demotedMode(state.operatingMode)
            : "DISABLED",
      proposedWeight: type === "RETIRE_STRATEGY" ? 0 : undefined,
      proposedCapital: type === "RETIRE_STRATEGY" ? 0 : undefined,
      urgency,
      priority,
      confidence,
      utility: {
        expectedReturnUtility: type === "PROMOTE_STRATEGY" ? learning.normalizedScore : 0.35,
        riskAdjustedUtility: type === "PROMOTE_STRATEGY" ? learning.riskAdjustedScore : 0.65,
        drawdownProtectionUtility: type === "PROMOTE_STRATEGY" ? 0.45 : 0.75,
        diversificationUtility: 0.5,
        regimeAlignmentUtility: learning.regimeRobustnessScore,
        learningUtility: learning.confidence,
        executionUtility: state.executionQualityScore,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: learning.stabilityScore,
      },
      costs: lifecycleCosts(state, type),
      risk,
      projectedRiskScore: unit(
        (risk?.riskScore ?? input.context.marketRiskScore) +
          (type === "PROMOTE_STRATEGY" ? 0.05 : -0.08),
      ),
      evidence: [
        evidence(input, "META_LEARNING", state.strategy.strategyId,
          type === "PROMOTE_STRATEGY" ? "STRONGLY_SUPPORTIVE" : "STRONGLY_OPPOSING",
          type === "PROMOTE_STRATEGY" ? learning.normalizedScore : 1 - learning.normalizedScore,
          learning.confidence,
          `${type} follows the normalized learning score ${round(learning.normalizedScore)}.`),
      ],
      rationale: [...learning.reasons],
      warnings: [],
    });
  }

  private buildLifecycleChangeCandidate(
    input: DecisionCandidateBuilderRequest,
    change: MetaLearningLifecycleChange,
  ): DecisionCandidate | undefined {
    const state = findState(input.request, change.strategyId);
    if (!state) return undefined;

    const type = lifecycleActionToCandidateType(change.action);
    if (!type) return undefined;

    const confidence = unit(
      input.request.metaLearning?.actionPlan?.confidence ?? state.confidence,
    );

    return this.createCandidate(input, {
      type,
      strategyId: change.strategyId,
      proposedOperatingMode: lifecycleStateToMode(change.proposedState),
      proposedWeight: type === "RETIRE_STRATEGY" || type === "DEACTIVATE_STRATEGY" ? 0 : undefined,
      proposedCapital: type === "RETIRE_STRATEGY" || type === "DEACTIVATE_STRATEGY" ? 0 : undefined,
      urgency: change.requiresApproval ? "NORMAL" : "LOW",
      priority: change.requiresApproval ? "HIGH" : "MEDIUM",
      confidence,
      utility: neutralUtility(input, state),
      costs: lifecycleCosts(state, type),
      risk: findRisk(input.request, change.strategyId),
      projectedRiskScore: findRisk(input.request, change.strategyId)?.riskScore ?? input.context.marketRiskScore,
      evidence: [
        evidence(input, "META_LEARNING", change.strategyId, "SUPPORTIVE", confidence, confidence, change.reason),
      ],
      rationale: [change.reason],
      warnings: change.requiresApproval ? ["Meta-learning lifecycle change requires approval."] : [],
      metadata: { requiresApproval: change.requiresApproval, previousState: change.previousState, proposedState: change.proposedState },
    });
  }

  private buildEvolutionCandidate(
    input: DecisionCandidateBuilderRequest,
    evolution: StrategyEvolutionCandidate,
  ): DecisionCandidate | undefined {
    if (evolution.confidence <= 0 || evolution.expectedImprovement <= 0) {
      return undefined;
    }

    const strategyId = evolution.parentStrategyIds[0];
    return this.createCandidate(input, {
      type: evolution.action === "TUNE_PARAMETERS" || evolution.action === "MUTATE"
        ? "CHANGE_PARAMETERS"
        : "EVOLVE_STRATEGY",
      strategyId,
      replacementStrategyId: evolution.proposedStrategyId,
      proposedParameters: Object.fromEntries(
        evolution.parameterMutations.map((mutation) => [
          mutation.key,
          mutation.boundedValue,
        ]),
      ),
      urgency: "LOW",
      priority: evolution.expectedImprovement >= 0.2 ? "HIGH" : "MEDIUM",
      confidence: evolution.confidence,
      utility: {
        expectedReturnUtility: unit(evolution.expectedImprovement),
        riskAdjustedUtility: unit(evolution.expectedImprovement - Math.max(0, evolution.expectedRiskChange)),
        drawdownProtectionUtility: unit(1 - Math.max(0, evolution.expectedRiskChange)),
        diversificationUtility: evolution.noveltyScore,
        regimeAlignmentUtility: input.context.regimeConfidence,
        learningUtility: unit((evolution.noveltyScore + evolution.confidence) / 2),
        executionUtility: input.context.executionReadinessScore,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: unit(1 - evolution.noveltyScore * 0.5),
      },
      costs: {
        expectedTransactionCost: 0.05,
        expectedSlippageCost: 0.02,
        expectedMarketImpactCost: 0.02,
        expectedTurnoverCost: 0.05,
        operationalCost: unit(0.2 + evolution.noveltyScore * 0.35),
        opportunityCost: 0.1,
        modelRiskCost: unit(1 - evolution.confidence + evolution.noveltyScore * 0.25),
      },
      projectedRiskScore: unit(input.context.marketRiskScore + evolution.expectedRiskChange),
      evidence: [
        evidence(input, "META_LEARNING", evolution.candidateId, "SUPPORTIVE",
          evolution.expectedImprovement, evolution.confidence,
          `Evolution candidate expects improvement ${round(evolution.expectedImprovement)}.`),
      ],
      rationale: evolution.reasons,
      warnings: evolution.requiredValidationStages.map((stage) => `Requires validation stage: ${stage}.`),
      metadata: { evolutionCandidateId: evolution.candidateId, action: evolution.action, requiredValidationStages: evolution.requiredValidationStages },
    });
  }

  private buildPortfolioDefenseCandidate(
    input: DecisionCandidateBuilderRequest,
  ): DecisionCandidate | undefined {
    const portfolioRisk = unit(input.request.portfolio.portfolioRiskScore);
    const marketRisk = unit(input.context.marketRiskScore);
    const severity = Math.max(portfolioRisk, marketRisk);
    const maximumRisk = input.request.configuration.optimizationConstraints.maximumRiskScore;
    if (severity < Math.min(maximumRisk, 0.72)) return undefined;

    const targetReduction = unit(
      Math.max(0.05, Math.min(0.5, severity - Math.max(0.3, maximumRisk * 0.7))),
    );
    const confidence = weightedAverage([
      [severity, 0.45],
      [1 - input.context.portfolioHealthScore, 0.2],
      [input.context.evidenceQualityScore, 0.2],
      [input.context.systemReadinessScore, 0.15],
    ]);

    return this.createCandidate(input, {
      type: "REDUCE_EXPOSURE",
      proposedWeight: unit(1 - targetReduction),
      proposedCapital: Math.max(0, input.request.portfolio.deployedCapital * (1 - targetReduction)),
      urgency: severity >= 0.9 ? "IMMEDIATE" : "HIGH",
      priority: severity >= 0.9 ? "CRITICAL" : "VERY_HIGH",
      confidence,
      utility: {
        expectedReturnUtility: 0.2,
        riskAdjustedUtility: 0.8,
        drawdownProtectionUtility: severity,
        diversificationUtility: 0.55,
        regimeAlignmentUtility: 1 - marketRisk,
        learningUtility: 0.3,
        executionUtility: input.context.executionReadinessScore,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: 0.75,
      },
      costs: {
        expectedTransactionCost: targetReduction * 0.3,
        expectedSlippageCost: targetReduction * 0.25,
        expectedMarketImpactCost: targetReduction * 0.25,
        expectedTurnoverCost: targetReduction,
        operationalCost: 0.15,
        opportunityCost: targetReduction * input.context.marketOpportunityScore,
        modelRiskCost: 1 - confidence,
      },
      projectedRiskScore: unit(severity * (1 - targetReduction * 0.7)),
      evidence: [
        evidence(input, "PORTFOLIO_STATE", input.request.portfolioId, "STRONGLY_SUPPORTIVE",
          portfolioRisk, confidence, `Portfolio risk is ${round(portfolioRisk)}.`),
        evidence(input, "MARKET_CONTEXT", input.context.assessmentId, "SUPPORTIVE",
          marketRisk, input.context.regimeConfidence, `Market risk is ${round(marketRisk)}.`),
      ],
      rationale: [
        `Portfolio or market risk exceeds the defensive-action threshold.`,
        `Target exposure reduction is ${round(targetReduction)}.`,
      ],
      warnings: input.context.blockingConditions,
    });
  }

  private buildPortfolioRebalanceCandidate(
    input: DecisionCandidateBuilderRequest,
  ): DecisionCandidate | undefined {
    const adaptive = input.request.metaLearning?.adaptiveWeights ?? [];
    if (adaptive.length < 2) return undefined;

    const expectedTurnover = unit(
      adaptive.reduce((sum, weight) => sum + Math.abs(weight.delta), 0) / 2,
    );
    if (expectedTurnover < this.minimumWeightDelta) return undefined;

    const confidence = average(adaptive.map((weight) => weight.confidence));
    return this.createCandidate(input, {
      type: "REBALANCE_PORTFOLIO",
      urgency: expectedTurnover >= 0.25 ? "HIGH" : "NORMAL",
      priority: expectedTurnover >= 0.25 ? "HIGH" : "MEDIUM",
      confidence,
      utility: {
        expectedReturnUtility: input.context.marketOpportunityScore,
        riskAdjustedUtility: 1 - input.context.marketRiskScore,
        drawdownProtectionUtility: 1 - input.request.portfolio.currentDrawdown,
        diversificationUtility: 0.75,
        regimeAlignmentUtility: input.context.regimeConfidence,
        learningUtility: confidence,
        executionUtility: input.context.executionReadinessScore,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: 1 - expectedTurnover,
      },
      costs: {
        expectedTransactionCost: expectedTurnover * 0.3,
        expectedSlippageCost: expectedTurnover * 0.25,
        expectedMarketImpactCost: expectedTurnover * 0.2,
        expectedTurnoverCost: expectedTurnover,
        operationalCost: 0.15,
        opportunityCost: 0.05,
        modelRiskCost: 1 - confidence,
      },
      projectedRiskScore: unit(input.request.portfolio.portfolioRiskScore - 0.05),
      evidence: [
        evidence(input, "META_LEARNING", input.request.requestId, "SUPPORTIVE",
          expectedTurnover, confidence,
          `${adaptive.length} adaptive strategy weights support portfolio rebalancing.`),
      ],
      rationale: [
        `Adaptive weights imply expected turnover ${round(expectedTurnover)}.`,
        `Rebalance coordinates individual weight changes as one portfolio action.`,
      ],
      warnings: [],
      metadata: {
        proposedWeights: Object.fromEntries(
          adaptive.map((weight) => [weight.strategyId, weight.boundedWeight]),
        ),
      },
    });
  }

  private buildNoActionCandidate(
    input: DecisionCandidateBuilderRequest,
  ): DecisionCandidate {
    const stability = weightedAverage([
      [input.context.portfolioHealthScore, 0.25],
      [1 - input.context.marketRiskScore, 0.2],
      [input.context.strategyHealthScore, 0.2],
      [input.context.systemReadinessScore, 0.15],
      [input.context.evidenceQualityScore, 0.2],
    ]);

    return this.createCandidate(input, {
      type: "NO_ACTION",
      urgency: "INFORMATIONAL",
      priority: "LOW",
      confidence: stability,
      utility: {
        expectedReturnUtility: 0.35,
        riskAdjustedUtility: 1 - input.context.marketRiskScore,
        drawdownProtectionUtility: 1 - unit(Math.abs(input.request.portfolio.currentDrawdown)),
        diversificationUtility: 0.5,
        regimeAlignmentUtility: input.context.regimeConfidence,
        learningUtility: 0.25,
        executionUtility: 1,
        operationalUtility: input.context.systemReadinessScore,
        stabilityUtility: stability,
      },
      costs: zeroCosts(),
      projectedRiskScore: input.request.portfolio.portfolioRiskScore,
      evidence: [
        evidence(input, "SYSTEM_HEALTH", input.context.assessmentId, "NEUTRAL",
          stability, input.context.evidenceQualityScore,
          `No action preserves the current portfolio and strategy configuration.`),
      ],
      rationale: [
        `No action is retained as a deterministic baseline alternative.`,
        ...(input.context.blockingConditions.length > 0
          ? [`Blocking conditions favor preserving the current state.`]
          : []),
      ],
      warnings: input.context.blockingConditions,
    });
  }

  private createCandidate(
    input: DecisionCandidateBuilderRequest,
    specification: CandidateSpecification,
  ): DecisionCandidate {
    const candidateId = deterministicId(
      "candidate",
      input.request.requestId,
      specification.type,
      specification.strategyId ?? "portfolio",
      specification.replacementStrategyId ?? "none",
      input.generatedAt,
    );

    const utility = finalizeUtility(specification.utility);
    const costs = finalizeCosts(specification.costs);
    const riskImpact = buildRiskImpact(
      specification.risk,
      input.request.portfolio.portfolioRiskScore,
      specification.projectedRiskScore,
    );
    const confidence = buildConfidence(
      specification.confidence,
      specification.evidence,
      input,
    );

    return deepFreeze({
      candidateId,
      type: specification.type,
      portfolioId: input.request.portfolioId,
      ...(specification.strategyId
        ? { strategyId: specification.strategyId }
        : {}),
      ...(specification.replacementStrategyId
        ? { replacementStrategyId: specification.replacementStrategyId }
        : {}),
      ...(specification.symbol ? { symbol: specification.symbol } : {}),
      ...(specification.timeframe ? { timeframe: specification.timeframe } : {}),
      generatedAt: input.generatedAt,
      urgency: specification.urgency,
      priority: specification.priority,
      ...(specification.proposedWeight !== undefined
        ? { proposedWeight: unit(specification.proposedWeight) }
        : {}),
      ...(specification.proposedCapital !== undefined
        ? { proposedCapital: Math.max(0, finite(specification.proposedCapital)) }
        : {}),
      ...(specification.proposedRiskBudget !== undefined
        ? { proposedRiskBudget: unit(specification.proposedRiskBudget) }
        : {}),
      ...(specification.proposedOperatingMode
        ? { proposedOperatingMode: specification.proposedOperatingMode }
        : {}),
      ...(specification.proposedParameters
        ? { proposedParameters: specification.proposedParameters }
        : {}),
      utility,
      costs,
      riskImpact,
      confidence,
      evidence: specification.evidence,
      constraints: applicableConstraints(
        input.request.constraints,
        specification.strategyId,
      ),
      prerequisites: [],
      mutuallyExclusiveWith: [],
      expiresAt: new Date(
        Date.parse(input.generatedAt) + this.candidateTtlMs,
      ).toISOString(),
      rationale: uniqueStrings(specification.rationale),
      warnings: uniqueStrings(specification.warnings),
      metadata: {
        generator: "DecisionCandidateGenerator",
        contextAssessmentId: input.context.assessmentId,
        deterministicSeed: input.request.configuration.deterministicSeed ?? "",
        ...specification.metadata,
      },
    });
  }

  private assertInput(input: DecisionCandidateBuilderRequest): void {
    if (!input || typeof input !== "object") {
      throw new DecisionCandidateGenerationError(
        "Candidate builder input must be an object.",
        "INVALID_CANDIDATE_BUILDER_INPUT",
      );
    }
    if (!input.request || !input.context || !input.generatedAt) {
      throw new DecisionCandidateGenerationError(
        "request, context and generatedAt are required.",
        "INCOMPLETE_CANDIDATE_BUILDER_INPUT",
      );
    }
    if (input.context.generatedAt > input.generatedAt) {
      throw new DecisionCandidateGenerationError(
        "Context assessment cannot be generated after candidate generation time.",
        "FUTURE_CONTEXT_ASSESSMENT",
      );
    }
  }
}

export function createDecisionCandidateGenerator(
  options: DecisionCandidateGeneratorOptions = {},
): DecisionCandidateGenerator {
  return new DecisionCandidateGenerator(options);
}

interface CandidateSpecification {
  readonly type: DecisionCandidateType;
  readonly strategyId?: DecisionStrategyId;
  readonly replacementStrategyId?: DecisionStrategyId;
  readonly symbol?: string;
  readonly timeframe?: string;
  readonly proposedWeight?: number;
  readonly proposedCapital?: number;
  readonly proposedRiskBudget?: number;
  readonly proposedOperatingMode?: StrategyOperatingMode;
  readonly proposedParameters?: Readonly<Record<string, number | string | boolean>>;
  readonly urgency: DecisionUrgency;
  readonly priority: DecisionPriority;
  readonly confidence: number;
  readonly utility: Omit<DecisionUtilityComponents, "totalUtility">;
  readonly costs: Omit<DecisionCostComponents, "totalCost">;
  readonly risk?: StrategyRiskObservation;
  readonly projectedRiskScore: number;
  readonly evidence: readonly DecisionEvidence[];
  readonly rationale: readonly string[];
  readonly warnings: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function findState(
  request: DecisionIntelligenceRunRequest,
  strategyId: string,
): StrategyDecisionState | undefined {
  return request.strategyStates.find(
    (state) => state.strategy.strategyId === strategyId,
  );
}

function findRisk(
  request: DecisionIntelligenceRunRequest,
  strategyId: string,
): StrategyRiskObservation | undefined {
  return request.riskObservations.find(
    (observation) => observation.strategyId === strategyId,
  );
}

function findLearningScore(
  request: DecisionIntelligenceRunRequest,
  strategyId: string,
): StrategyLearningScore | undefined {
  return request.metaLearning?.strategyLearningScores.find(
    (score) => score.strategyId === strategyId,
  );
}

function findReinforcement(
  request: DecisionIntelligenceRunRequest,
  strategyId: string,
): StrategyReinforcementState | undefined {
  return request.metaLearning?.reinforcementStates.find(
    (state) => state.strategyId === strategyId,
  );
}

function findAdaptiveWeight(
  request: DecisionIntelligenceRunRequest,
  strategyId: string,
): AdaptiveStrategyWeight | undefined {
  return request.metaLearning?.adaptiveWeights.find(
    (weight) => weight.strategyId === strategyId,
  );
}

function boundedTargetWeight(
  request: DecisionIntelligenceRunRequest,
  state: StrategyDecisionState,
  learning: StrategyLearningScore | undefined,
): number {
  const constraints = request.configuration.optimizationConstraints;
  const learned = learning?.normalizedScore ?? state.performanceScore;
  const raw = Math.max(
    constraints.minimumStrategyWeight,
    Math.min(
      constraints.maximumStrategyWeight,
      Math.max(state.currentWeight, learned * constraints.maximumStrategyWeight),
    ),
  );
  return unit(raw);
}

function activationMode(
  request: DecisionIntelligenceRunRequest,
  state: StrategyDecisionState,
): StrategyOperatingMode {
  if (request.configuration.executionMode === "DRY_RUN") return "SHADOW";
  if (request.configuration.executionMode === "SIMULATED") return "PAPER";
  if (request.configuration.executionMode === "SHADOW") return "SHADOW";
  if (state.operatingMode === "DISABLED" || state.operatingMode === "OBSERVE_ONLY") {
    return "LIMITED_LIVE";
  }
  return state.operatingMode;
}

function promotedMode(mode: StrategyOperatingMode): StrategyOperatingMode {
  const order: readonly StrategyOperatingMode[] = [
    "DISABLED", "OBSERVE_ONLY", "SHADOW", "PAPER", "LIMITED_LIVE", "LIVE",
  ];
  const index = order.indexOf(mode);
  return order[Math.min(order.length - 1, Math.max(0, index + 1))] ?? "LIMITED_LIVE";
}

function demotedMode(mode: StrategyOperatingMode): StrategyOperatingMode {
  const order: readonly StrategyOperatingMode[] = [
    "DISABLED", "OBSERVE_ONLY", "SHADOW", "PAPER", "LIMITED_LIVE", "LIVE",
  ];
  const index = order.indexOf(mode);
  return order[Math.max(0, index - 1)] ?? "OBSERVE_ONLY";
}

function lifecycleStateToMode(state: string): StrategyOperatingMode {
  switch (state) {
    case "ACTIVE": return "LIVE";
    case "PAPER": return "PAPER";
    case "SHADOW": return "SHADOW";
    case "PAUSED": return "OBSERVE_ONLY";
    case "RETIRED":
    case "DISABLED": return "DISABLED";
    default: return "OBSERVE_ONLY";
  }
}

function lifecycleActionToCandidateType(action: string): DecisionCandidateType | undefined {
  switch (action) {
    case "PROMOTE": return "PROMOTE_STRATEGY";
    case "DEMOTE": return "DEMOTE_STRATEGY";
    case "RETIRE": return "RETIRE_STRATEGY";
    case "ACTIVATE": return "ACTIVATE_STRATEGY";
    case "DEACTIVATE": return "DEACTIVATE_STRATEGY";
    case "PAUSE": return "PAUSE_STRATEGY";
    case "RESUME": return "RESUME_STRATEGY";
    case "MUTATE":
    case "PARAMETER_MUTATION": return "CHANGE_PARAMETERS";
    case "CLONE":
    case "CROSSOVER":
    case "EVOLVE": return "EVOLVE_STRATEGY";
    default: return undefined;
  }
}

function activationCosts(
  state: StrategyDecisionState,
  targetWeight: number,
): Omit<DecisionCostComponents, "totalCost"> {
  return {
    expectedTransactionCost: targetWeight * 0.25,
    expectedSlippageCost: targetWeight * 0.2,
    expectedMarketImpactCost: targetWeight * 0.15,
    expectedTurnoverCost: Math.abs(targetWeight - state.currentWeight),
    operationalCost: 0.15,
    opportunityCost: 0.05,
    modelRiskCost: 1 - state.confidence,
  };
}

function reweightCosts(
  state: StrategyDecisionState,
  delta: number,
): Omit<DecisionCostComponents, "totalCost"> {
  const turnover = unit(Math.abs(delta));
  return {
    expectedTransactionCost: turnover * 0.3,
    expectedSlippageCost: turnover * 0.25,
    expectedMarketImpactCost: turnover * 0.2,
    expectedTurnoverCost: turnover,
    operationalCost: 0.08,
    opportunityCost: delta < 0 ? state.performanceScore * turnover : 0.03,
    modelRiskCost: 1 - state.confidence,
  };
}

function lifecycleCosts(
  state: StrategyDecisionState,
  type: DecisionCandidateType,
): Omit<DecisionCostComponents, "totalCost"> {
  const closing =
    type === "RETIRE_STRATEGY" ||
    type === "DEACTIVATE_STRATEGY" ||
    type === "PAUSE_STRATEGY";
  return {
    expectedTransactionCost: closing ? state.currentWeight * 0.2 : 0.05,
    expectedSlippageCost: closing ? state.currentWeight * 0.15 : 0.02,
    expectedMarketImpactCost: closing ? state.currentWeight * 0.15 : 0.02,
    expectedTurnoverCost: closing ? state.currentWeight : 0.05,
    operationalCost: 0.15,
    opportunityCost: closing ? state.performanceScore * 0.4 : 0.05,
    modelRiskCost: 1 - state.confidence,
  };
}

function neutralUtility(
  input: DecisionCandidateBuilderRequest,
  state: StrategyDecisionState,
): Omit<DecisionUtilityComponents, "totalUtility"> {
  return {
    expectedReturnUtility: state.performanceScore,
    riskAdjustedUtility: 1 - input.context.marketRiskScore,
    drawdownProtectionUtility: 1 - Math.abs(input.request.portfolio.currentDrawdown),
    diversificationUtility: 0.5,
    regimeAlignmentUtility: state.regimeAlignmentScore,
    learningUtility: state.confidence,
    executionUtility: state.executionQualityScore,
    operationalUtility: input.context.systemReadinessScore,
    stabilityUtility: state.stabilityScore,
  };
}

function diversificationUtility(
  request: DecisionIntelligenceRunRequest,
  strategyId: string,
): number {
  const state = findState(request, strategyId);
  if (!state) return 0.5;
  const conflicts = state.conflictsWith.length;
  const dependencies = state.dependencies.length;
  return unit(1 - conflicts * 0.1 - dependencies * 0.03);
}

function evidence(
  input: DecisionCandidateBuilderRequest,
  source: DecisionEvidenceSource,
  sourceId: string,
  direction: DecisionEvidenceDirection,
  strength: number,
  confidence: number,
  summary: string,
): DecisionEvidence {
  return deepFreeze({
    evidenceId: deterministicId(
      "evidence",
      input.request.requestId,
      source,
      sourceId,
      summary,
    ),
    source,
    sourceId,
    observedAt: input.generatedAt,
    direction,
    strength: unit(strength),
    confidence: unit(confidence),
    freshness: 1,
    relevance: unit(strength),
    summary,
    attributes: {},
    metadata: {},
  });
}

function buildConfidence(
  score: number,
  evidenceItems: readonly DecisionEvidence[],
  input: DecisionCandidateBuilderRequest,
): DecisionConfidenceAssessment {
  const evidenceCoverage = unit(
    evidenceItems.length === 0 ? 0 : Math.min(1, evidenceItems.length / 4),
  );
  const directions = evidenceItems.map((value) => directionValue(value.direction));
  const consistency = directions.length <= 1
    ? 1
    : unit(1 - standardDeviation(directions));
  const finalScore = weightedAverage([
    [score, 0.5],
    [evidenceCoverage, 0.1],
    [consistency, 0.1],
    [input.context.evidenceQualityScore, 0.1],
    [input.context.regimeConfidence, 0.1],
    [1 - input.context.marketRiskScore, 0.1],
  ]);

  return deepFreeze({
    score: round(finalScore),
    band: confidenceBand(finalScore),
    evidenceCoverage: round(evidenceCoverage),
    evidenceConsistency: round(consistency),
    modelAgreement: round(score),
    dataQuality: round(input.context.evidenceQualityScore),
    regimeCertainty: round(input.context.regimeConfidence),
    riskCertainty: round(1 - input.context.marketRiskScore),
    uncertainty: round(1 - finalScore),
    reasons: uniqueStrings([
      `Base candidate confidence is ${round(score)}.`,
      `Evidence coverage is ${round(evidenceCoverage)}.`,
      `Evidence consistency is ${round(consistency)}.`,
    ]),
  });
}

function buildRiskImpact(
  risk: StrategyRiskObservation | undefined,
  portfolioRiskScore: number,
  projectedRiskScore: number,
): DecisionRiskImpact {
  const current = unit(risk?.riskScore ?? portfolioRiskScore);
  const projected = unit(projectedRiskScore);
  return deepFreeze({
    currentRiskScore: round(current),
    projectedRiskScore: round(projected),
    riskDelta: round(projected - current),
    concentrationRiskDelta: round((projected - current) * (risk?.concentrationRisk ?? 0.5)),
    correlationRiskDelta: round((projected - current) * (risk?.correlationRisk ?? 0.5)),
    liquidityRiskDelta: round((projected - current) * (risk?.liquidityRisk ?? 0.5)),
    leverageRiskDelta: round((projected - current) * (risk?.leverageRisk ?? 0.5)),
    volatilityRiskDelta: round((projected - current) * (risk?.volatilityRisk ?? 0.5)),
    drawdownRiskDelta: round((projected - current) * (risk?.drawdownRisk ?? 0.5)),
    tailRiskDelta: round((projected - current) * (risk?.tailRisk ?? 0.5)),
    operationalRiskDelta: round((projected - current) * (risk?.operationalRisk ?? 0.5)),
    withinRiskBudget: projected <= 1 && (risk?.remainingRiskBudget ?? 1) > 0,
    breachedLimits: risk?.breachedLimits ?? [],
    warnings: projected > current ? ["Candidate increases projected risk."] : [],
  });
}

function finalizeUtility(
  value: Omit<DecisionUtilityComponents, "totalUtility">,
): DecisionUtilityComponents {
  const normalized = {
    expectedReturnUtility: unit(value.expectedReturnUtility),
    riskAdjustedUtility: unit(value.riskAdjustedUtility),
    drawdownProtectionUtility: unit(value.drawdownProtectionUtility),
    diversificationUtility: unit(value.diversificationUtility),
    regimeAlignmentUtility: unit(value.regimeAlignmentUtility),
    learningUtility: unit(value.learningUtility),
    executionUtility: unit(value.executionUtility),
    operationalUtility: unit(value.operationalUtility),
    stabilityUtility: unit(value.stabilityUtility),
  };
  return deepFreeze({
    ...normalized,
    totalUtility: round(average(Object.values(normalized))),
  });
}

function finalizeCosts(
  value: Omit<DecisionCostComponents, "totalCost">,
): DecisionCostComponents {
  const normalized = {
    expectedTransactionCost: unit(value.expectedTransactionCost),
    expectedSlippageCost: unit(value.expectedSlippageCost),
    expectedMarketImpactCost: unit(value.expectedMarketImpactCost),
    expectedTurnoverCost: unit(value.expectedTurnoverCost),
    operationalCost: unit(value.operationalCost),
    opportunityCost: unit(value.opportunityCost),
    modelRiskCost: unit(value.modelRiskCost),
  };
  return deepFreeze({
    ...normalized,
    totalCost: round(average(Object.values(normalized))),
  });
}

function zeroCosts(): Omit<DecisionCostComponents, "totalCost"> {
  return {
    expectedTransactionCost: 0,
    expectedSlippageCost: 0,
    expectedMarketImpactCost: 0,
    expectedTurnoverCost: 0,
    operationalCost: 0,
    opportunityCost: 0,
    modelRiskCost: 0,
  };
}

function applicableConstraints(
  constraints: readonly DecisionConstraint[],
  strategyId?: string,
): readonly DecisionConstraint[] {
  return constraints.filter(
    (constraint) =>
      constraint.enabled &&
      (constraint.strategyId === undefined || constraint.strategyId === strategyId),
  );
}

function candidateSortKey(candidate: DecisionCandidate): string {
  return [
    String(priorityRank(candidate.priority)).padStart(2, "0"),
    String(urgencyRank(candidate.urgency)).padStart(2, "0"),
    String(1 - candidate.confidence.score).padStart(12, "0"),
    candidate.type,
    candidate.strategyId ?? "",
    candidate.candidateId,
  ].join(":");
}

function deduplicateCandidates(
  candidates: readonly DecisionCandidate[],
): DecisionCandidate[] {
  const selected = new Map<string, DecisionCandidate>();
  for (const candidate of candidates) {
    const key = [
      candidate.type,
      candidate.strategyId ?? "portfolio",
      candidate.replacementStrategyId ?? "none",
      candidate.symbol ?? "all",
      candidate.timeframe ?? "all",
    ].join(":");
    const existing = selected.get(key);
    if (!existing || candidate.confidence.score > existing.confidence.score) {
      selected.set(key, candidate);
    }
  }
  return [...selected.values()];
}

function deterministicId(prefix: string, ...parts: readonly string[]): DecisionIntelligenceId {
  const input = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableSort<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function priorityRank(value: DecisionPriority): number {
  switch (value) {
    case "CRITICAL": return 0;
    case "VERY_HIGH": return 1;
    case "HIGH": return 2;
    case "MEDIUM": return 3;
    case "LOW": return 4;
  }
}

function urgencyRank(value: DecisionUrgency): number {
  switch (value) {
    case "IMMEDIATE": return 0;
    case "HIGH": return 1;
    case "NORMAL": return 2;
    case "LOW": return 3;
    case "INFORMATIONAL": return 4;
  }
}

function confidenceBand(score: number): DecisionConfidenceAssessment["band"] {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  if (score >= 0.3) return "LOW";
  return "VERY_LOW";
}

function directionValue(direction: DecisionEvidenceDirection): number {
  switch (direction) {
    case "STRONGLY_SUPPORTIVE": return 1;
    case "SUPPORTIVE": return 0.75;
    case "NEUTRAL": return 0.5;
    case "OPPOSING": return 0.25;
    case "STRONGLY_OPPOSING": return 0;
  }
}

function weightedAverage(values: readonly (readonly [number, number])[]): number {
  let weighted = 0;
  let weight = 0;
  for (const [value, contribution] of values) {
    const validWeight = Math.max(0, finite(contribution));
    weighted += unit(value) * validWeight;
    weight += validWeight;
  }
  return weight <= EPSILON ? 0 : unit(weighted / weight);
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + finite(value), 0) / values.length;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function unit(value: number): number {
  return Math.min(1, Math.max(0, finite(value)));
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function positiveInteger(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function round(value: number): number {
  return Number(finite(value).toFixed(12));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}