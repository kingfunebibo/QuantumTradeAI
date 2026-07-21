/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 7:
 * src/trading/ai-decision-intelligence/decision-optimization-engine.ts
 *
 * Deterministic multi-objective plan optimizer. It selects a feasible subset of
 * scored decision candidates, projects the resulting strategy state, constructs
 * dependency-aware actions, and returns an immutable execution plan.
 */

import type {
  DecisionAction,
  DecisionActionRollback,
  DecisionActionType,
  DecisionExecutionPlan,
  DecisionFailurePolicy,
  DecisionIntelligenceDecision,
  DecisionIntelligenceId,
  DecisionMetadata,
  DecisionOptimizationConstraints,
  DecisionPlanMetrics,
  DecisionPlanOptimizationRequest,
  DecisionPlanOptimizerPort,
  DecisionPriority,
  DecisionStrategyId,
  ScoredDecisionCandidate,
  StrategyDecisionState,
  StrategyOperatingMode,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;
const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_MAXIMUM_ATTEMPTS = 3;

export interface DecisionOptimizationEngineOptions {
  readonly actionTimeoutMs?: number;
  readonly maximumAttempts?: number;
  readonly minimumNetUtility?: number;
  readonly minimumConfidence?: number;
  readonly rejectNegativeUtilityCandidates?: boolean;
  readonly preferStablePlans?: boolean;
  readonly failurePolicy?: DecisionFailurePolicy;
}

export class DecisionOptimizationError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "DECISION_OPTIMIZATION_ERROR") {
    super(message);
    this.name = "DecisionOptimizationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface OptimizationState {
  selected: ScoredDecisionCandidate[];
  readonly rejected: ScoredDecisionCandidate[];
  readonly warnings: string[];
  readonly selectedIds: Set<string>;
  readonly selectedStrategyIds: Set<string>;
  readonly strategyWeightChanges: Map<string, number>;
  expectedTurnover: number;
  expectedCapitalChange: number;
  expectedRiskDelta: number;
}

export class DecisionOptimizationEngine implements DecisionPlanOptimizerPort {
  private readonly actionTimeoutMs: number;
  private readonly maximumAttempts: number;
  private readonly minimumNetUtility: number;
  private readonly minimumConfidence: number;
  private readonly rejectNegativeUtilityCandidates: boolean;
  private readonly preferStablePlans: boolean;
  private readonly failurePolicy: DecisionFailurePolicy;

  public constructor(options: DecisionOptimizationEngineOptions = {}) {
    this.actionTimeoutMs = positiveInteger(
      options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS,
      "actionTimeoutMs",
    );
    this.maximumAttempts = positiveInteger(
      options.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS,
      "maximumAttempts",
    );
    this.minimumNetUtility = finite(
      options.minimumNetUtility ?? 0,
      "minimumNetUtility",
    );
    this.minimumConfidence = unitInterval(
      options.minimumConfidence ?? 0,
      "minimumConfidence",
    );
    this.rejectNegativeUtilityCandidates =
      options.rejectNegativeUtilityCandidates ?? true;
    this.preferStablePlans = options.preferStablePlans ?? true;
    this.failurePolicy =
      options.failurePolicy ?? "ROLLBACK_ACTION";
  }

  public optimize(input: DecisionPlanOptimizationRequest): DecisionExecutionPlan {
    this.assertRequest(input);

    const constraints = input.request.configuration.optimizationConstraints;
    const eligibleCandidates = input.candidates
      .filter((candidate) => candidate.eligible)
      .sort(compareCandidates);

    const state: OptimizationState = {
      selected: [],
      rejected: [],
      warnings: [],
      selectedIds: new Set<string>(),
      selectedStrategyIds: new Set<string>(),
      strategyWeightChanges: new Map<string, number>(),
      expectedTurnover: 0,
      expectedCapitalChange: 0,
      expectedRiskDelta: 0,
    };

    for (const candidate of eligibleCandidates) {
      const rejection = this.evaluateCandidate(
        candidate,
        state,
        constraints,
        input,
      );

      if (rejection !== undefined) {
        state.rejected.push(candidate);
        state.warnings.push(
          `Candidate ${candidate.candidateId} was excluded: ${rejection}`,
        );
        continue;
      }

      this.acceptCandidate(candidate, state, input);
    }

    this.enforcePrerequisites(state, eligibleCandidates);
    this.enforceSelectedCandidateLimit(state, constraints);
    this.enforceConcurrentActionLimit(state, constraints);

    const orderedCandidates = this.orderSelectedCandidates(state.selected);
    const actions = this.buildActions(orderedCandidates, input);
    const targetStrategyWeights = this.projectStrategyWeights(
      input.request.strategyStates,
      orderedCandidates,
      constraints,
      state.warnings,
    );
    const targetOperatingModes = this.projectOperatingModes(
      input.request.strategyStates,
      orderedCandidates,
    );

    const metrics = this.buildMetrics(
      input,
      orderedCandidates,
      state.rejected,
      actions,
      targetStrategyWeights,
    );

    const decision = this.determineDecision(
      orderedCandidates,
      metrics,
      input,
    );

    const planId = deterministicId(
      "decision-plan",
      `${input.runId}|${input.request.requestId}|${orderedCandidates
        .map((candidate) => candidate.candidateId)
        .join("|")}`,
    );

    const validUntil = earliestExpiration(orderedCandidates);
    const safeguards = this.buildSafeguards(input, orderedCandidates, metrics);
    const warnings = uniqueStrings([
      ...state.warnings,
      ...orderedCandidates.flatMap((candidate) => candidate.warnings),
      ...(orderedCandidates.length === 0
        ? ["No feasible actionable candidates remained after optimization."]
        : []),
    ]);

    return Object.freeze({
      planId,
      runId: input.runId,
      requestId: input.request.requestId,
      portfolioId: input.request.portfolioId,
      createdAt: input.generatedAt,
      ...(validUntil === undefined ? {} : { validUntil }),
      executionMode: input.request.configuration.executionMode,
      decision,
      actions: Object.freeze(actions),
      targetStrategyWeights: Object.freeze(targetStrategyWeights),
      targetOperatingModes: Object.freeze(targetOperatingModes),
      metrics,
      conflicts: Object.freeze([...input.conflicts]),
      safeguards: Object.freeze(safeguards),
      warnings: Object.freeze(warnings),
      metadata: Object.freeze({
        optimizer: "DecisionOptimizationEngine",
        deterministic: true,
        selectedCandidateIds: orderedCandidates.map(
          (candidate) => candidate.candidateId,
        ),
        rejectedCandidateIds: state.rejected.map(
          (candidate) => candidate.candidateId,
        ),
      }),
    });
  }

  private evaluateCandidate(
    candidate: ScoredDecisionCandidate,
    state: OptimizationState,
    constraints: DecisionOptimizationConstraints,
    input: DecisionPlanOptimizationRequest,
  ): string | undefined {
    if (candidate.type === "NO_ACTION") {
      return "NO_ACTION is represented by the plan decision rather than an execution action.";
    }

    if (candidate.confidence.score + EPSILON < this.minimumConfidence) {
      return "confidence is below the optimizer minimum.";
    }

    if (
      this.rejectNegativeUtilityCandidates &&
      candidate.finalScore + EPSILON < this.minimumNetUtility
    ) {
      return "net utility is below the optimizer minimum.";
    }

    if (!candidate.riskImpact.withinRiskBudget) {
      return "candidate exceeds its assessed risk budget.";
    }

    if (
      candidate.riskImpact.projectedRiskScore >
      constraints.maximumRiskScore + EPSILON
    ) {
      return "projected risk score exceeds the configured maximum.";
    }

    if (
      state.selected.length >= constraints.maximumSelectedCandidates
    ) {
      return "maximum selected-candidate count has been reached.";
    }

    if (
      candidate.strategyId !== undefined &&
      state.selectedStrategyIds.has(candidate.strategyId) &&
      this.isIncompatibleWithSelected(candidate, state.selected)
    ) {
      return "another incompatible action already targets this strategy.";
    }

    if (
      candidate.mutuallyExclusiveWith.some((candidateId) =>
        state.selectedIds.has(candidateId),
      )
    ) {
      return "candidate is mutually exclusive with an already selected candidate.";
    }

    const proposedTurnover =
      state.expectedTurnover + estimateCandidateTurnover(candidate, input);
    if (
      proposedTurnover >
      Math.min(
        constraints.maximumPortfolioTurnover,
        input.request.configuration.safetyPolicy.maximumPortfolioTurnover,
      ) +
        EPSILON
    ) {
      return "portfolio turnover limit would be exceeded.";
    }

    const proposedCapitalChange =
      state.expectedCapitalChange +
      Math.abs(candidate.proposedCapital ?? 0);
    if (
      proposedCapitalChange >
      input.request.configuration.safetyPolicy
        .maximumCapitalReallocatedPerRun +
        EPSILON
    ) {
      return "capital reallocation limit would be exceeded.";
    }

    const proposedRiskDelta =
      state.expectedRiskDelta + Math.max(0, candidate.riskImpact.riskDelta);
    if (
      proposedRiskDelta >
      input.request.configuration.safetyPolicy.maximumAllowedRiskIncrease +
        EPSILON
    ) {
      return "maximum allowed risk increase would be exceeded.";
    }

    if (
      candidate.proposedWeight !== undefined &&
      (candidate.proposedWeight <
        constraints.minimumStrategyWeight - EPSILON ||
        candidate.proposedWeight >
          constraints.maximumStrategyWeight + EPSILON)
    ) {
      return "proposed strategy weight is outside optimization bounds.";
    }

    if (
      candidate.strategyId !== undefined &&
      candidate.proposedWeight !== undefined
    ) {
      const currentWeight =
        input.request.portfolio.strategyWeights[candidate.strategyId] ?? 0;
      if (
        Math.abs(candidate.proposedWeight - currentWeight) >
        constraints.maximumWeightChangePerStrategy + EPSILON
      ) {
        return "maximum per-strategy weight change would be exceeded.";
      }
    }

    return undefined;
  }

  private acceptCandidate(
    candidate: ScoredDecisionCandidate,
    state: OptimizationState,
    input: DecisionPlanOptimizationRequest,
  ): void {
    state.selected.push(candidate);
    state.selectedIds.add(candidate.candidateId);

    if (candidate.strategyId !== undefined) {
      state.selectedStrategyIds.add(candidate.strategyId);
      if (candidate.proposedWeight !== undefined) {
        const currentWeight =
          input.request.portfolio.strategyWeights[candidate.strategyId] ?? 0;
        state.strategyWeightChanges.set(
          candidate.strategyId,
          candidate.proposedWeight - currentWeight,
        );
      }
    }

    state.expectedTurnover += estimateCandidateTurnover(candidate, input);
    state.expectedCapitalChange += Math.abs(candidate.proposedCapital ?? 0);
    state.expectedRiskDelta += Math.max(0, candidate.riskImpact.riskDelta);
  }

  private enforcePrerequisites(
    state: OptimizationState,
    eligibleCandidates: readonly ScoredDecisionCandidate[],
  ): void {
    const eligibleById = new Map(
      eligibleCandidates.map((candidate) => [
        candidate.candidateId,
        candidate,
      ] as const),
    );

    let changed = true;
    while (changed) {
      changed = false;

      for (const candidate of [...state.selected]) {
        const missing = candidate.prerequisites.filter(
          (prerequisiteId) => !state.selectedIds.has(prerequisiteId),
        );

        if (missing.length === 0) {
          continue;
        }

        const resolvable = missing
          .map((prerequisiteId) => eligibleById.get(prerequisiteId))
          .filter(
            (
              prerequisite,
            ): prerequisite is ScoredDecisionCandidate =>
              prerequisite !== undefined &&
              prerequisite.eligible &&
              prerequisite.type !== "NO_ACTION",
          );

        if (resolvable.length === missing.length) {
          for (const prerequisite of resolvable.sort(compareCandidates)) {
            if (!state.selectedIds.has(prerequisite.candidateId)) {
              state.selected.push(prerequisite);
              state.selectedIds.add(prerequisite.candidateId);
              if (prerequisite.strategyId !== undefined) {
                state.selectedStrategyIds.add(prerequisite.strategyId);
              }
              changed = true;
            }
          }
          continue;
        }

        state.selected = state.selected.filter(
          (selected) => selected.candidateId !== candidate.candidateId,
        );
        state.selectedIds.delete(candidate.candidateId);
        if (candidate.strategyId !== undefined) {
          state.selectedStrategyIds.delete(candidate.strategyId);
        }
        state.rejected.push(candidate);
        state.warnings.push(
          `Candidate ${candidate.candidateId} was removed because prerequisites could not be satisfied.`,
        );
        changed = true;
      }
    }
  }

  private enforceSelectedCandidateLimit(
    state: OptimizationState,
    constraints: DecisionOptimizationConstraints,
  ): void {
    if (state.selected.length <= constraints.maximumSelectedCandidates) {
      return;
    }

    const ordered = [...state.selected].sort(compareCandidates);
    const kept = ordered.slice(0, constraints.maximumSelectedCandidates);
    const removed = ordered.slice(constraints.maximumSelectedCandidates);

    state.selected = kept;
    state.selectedIds.clear();
    kept.forEach((candidate) => state.selectedIds.add(candidate.candidateId));
    state.rejected.push(...removed);
    removed.forEach((candidate) =>
      state.warnings.push(
        `Candidate ${candidate.candidateId} was removed by the selected-candidate limit.`,
      ),
    );
  }

  private enforceConcurrentActionLimit(
    state: OptimizationState,
    constraints: DecisionOptimizationConstraints,
  ): void {
    const limit = constraints.maximumConcurrentActions;
    if (limit <= 0 || state.selected.length <= limit) {
      return;
    }

    const ordered = this.orderSelectedCandidates(state.selected);
    state.selected = ordered.map((candidate, index) =>
      index < limit
        ? candidate
        : Object.freeze({
            ...candidate,
            prerequisites: Object.freeze([
              ...candidate.prerequisites,
              ordered[index - limit].candidateId,
            ]),
          }),
    );
  }

  private orderSelectedCandidates(
    candidates: readonly ScoredDecisionCandidate[],
  ): readonly ScoredDecisionCandidate[] {
    const byId = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate] as const),
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: ScoredDecisionCandidate[] = [];

    const visit = (candidate: ScoredDecisionCandidate): void => {
      if (visited.has(candidate.candidateId)) {
        return;
      }
      if (visiting.has(candidate.candidateId)) {
        return;
      }

      visiting.add(candidate.candidateId);
      for (const prerequisiteId of candidate.prerequisites) {
        const prerequisite = byId.get(prerequisiteId);
        if (prerequisite !== undefined) {
          visit(prerequisite);
        }
      }
      visiting.delete(candidate.candidateId);
      visited.add(candidate.candidateId);
      ordered.push(candidate);
    };

    [...candidates].sort(compareCandidates).forEach(visit);
    return Object.freeze(ordered);
  }

  private buildActions(
    candidates: readonly ScoredDecisionCandidate[],
    input: DecisionPlanOptimizationRequest,
  ): readonly DecisionAction[] {
    const actionIdByCandidateId = new Map<string, string>();

    candidates.forEach((candidate, index) => {
      actionIdByCandidateId.set(
        candidate.candidateId,
        deterministicId(
          "decision-action",
          `${input.runId}|${candidate.candidateId}|${index + 1}`,
        ),
      );
    });

    return Object.freeze(
      candidates.map((candidate, index) => {
        const actionId = actionIdByCandidateId.get(candidate.candidateId);
        if (actionId === undefined) {
          throw new DecisionOptimizationError(
            `Missing action id for candidate ${candidate.candidateId}.`,
            "ACTION_ID_MISSING",
          );
        }

        const rollback = this.buildRollback(candidate, input);
        const dependsOnActionIds = candidate.prerequisites
          .map((candidateId) => actionIdByCandidateId.get(candidateId))
          .filter((value): value is string => value !== undefined);

        const blocksActionIds = candidate.mutuallyExclusiveWith
          .map((candidateId) => actionIdByCandidateId.get(candidateId))
          .filter((value): value is string => value !== undefined);

        const action: DecisionAction = Object.freeze({
          actionId,
          candidateId: candidate.candidateId,
          type: candidate.type as DecisionActionType,
          sequence: index + 1,
          portfolioId: candidate.portfolioId,
          ...(candidate.strategyId === undefined
            ? {}
            : { strategyId: candidate.strategyId }),
          ...(candidate.replacementStrategyId === undefined
            ? {}
            : { replacementStrategyId: candidate.replacementStrategyId }),
          ...(candidate.symbol === undefined ? {} : { symbol: candidate.symbol }),
          ...(candidate.timeframe === undefined
            ? {}
            : { timeframe: candidate.timeframe }),
          ...(candidate.proposedWeight === undefined
            ? {}
            : { targetWeight: candidate.proposedWeight }),
          ...(candidate.proposedCapital === undefined
            ? {}
            : { targetCapital: candidate.proposedCapital }),
          ...(candidate.proposedRiskBudget === undefined
            ? {}
            : { targetRiskBudget: candidate.proposedRiskBudget }),
          ...(candidate.proposedOperatingMode === undefined
            ? {}
            : { targetOperatingMode: candidate.proposedOperatingMode }),
          ...(candidate.proposedParameters === undefined
            ? {}
            : {
                targetParameters: Object.freeze({
                  ...candidate.proposedParameters,
                }),
              }),
          dependsOnActionIds: Object.freeze(dependsOnActionIds),
          blocksActionIds: Object.freeze(blocksActionIds),
          earliestExecutionAt: input.generatedAt,
          ...(candidate.expiresAt === undefined
            ? {}
            : { expiresAt: candidate.expiresAt }),
          timeoutMs: this.actionTimeoutMs,
          maximumAttempts: this.maximumAttempts,
          failurePolicy: this.failurePolicy,
          rollback,
          expectedUtility: candidate.finalScore,
          expectedRiskDelta: candidate.riskImpact.riskDelta,
          confidence: candidate.confidence.score,
          rationale: Object.freeze([...candidate.rationale]),
          metadata: Object.freeze({
            candidateRank: candidate.rank,
            candidatePriority: candidate.priority,
            grossScore: candidate.grossScore,
            penaltyScore: candidate.penaltyScore,
            optimizer: "DecisionOptimizationEngine",
          }),
        });

        return action;
      }),
    );
  }

  private buildRollback(
    candidate: ScoredDecisionCandidate,
    input: DecisionPlanOptimizationRequest,
  ): DecisionActionRollback {
    const strategyState = candidate.strategyId
      ? findStrategyState(input.request.strategyStates, candidate.strategyId)
      : undefined;

    const rollbackType = rollbackActionType(candidate.type);
    const supported =
      rollbackType !== undefined ||
      candidate.type === "CHANGE_PARAMETERS" ||
      candidate.type === "REWEIGHT_STRATEGY";

    return Object.freeze({
      supported,
      ...(rollbackType === undefined ? {} : { actionType: rollbackType }),
      ...(strategyState === undefined
        ? {}
        : { targetWeight: strategyState.currentWeight }),
      ...(strategyState === undefined
        ? {}
        : { targetOperatingMode: strategyState.operatingMode }),
      instructions: Object.freeze(
        supported
          ? [
              "Restore the pre-plan strategy allocation and operating state.",
              "Revalidate portfolio and risk state after rollback.",
            ]
          : ["Escalate to the orchestration manager for manual recovery."],
      ),
    });
  }

  private projectStrategyWeights(
    strategyStates: readonly StrategyDecisionState[],
    candidates: readonly ScoredDecisionCandidate[],
    constraints: DecisionOptimizationConstraints,
    warnings: string[],
  ): Readonly<Record<DecisionStrategyId, number>> {
    const weights: Record<string, number> = {};

    for (const state of strategyStates) {
      weights[state.strategy.strategyId] = clamp(
        state.currentWeight,
        0,
        constraints.maximumStrategyWeight,
      );
    }

    for (const candidate of candidates) {
      if (candidate.strategyId === undefined) {
        continue;
      }

      switch (candidate.type) {
        case "DEACTIVATE_STRATEGY":
        case "RETIRE_STRATEGY":
        case "PAUSE_STRATEGY":
          weights[candidate.strategyId] = 0;
          break;

        case "ACTIVATE_STRATEGY":
        case "RESUME_STRATEGY":
        case "REWEIGHT_STRATEGY":
        case "INCREASE_EXPOSURE":
        case "REDUCE_EXPOSURE":
          if (candidate.proposedWeight !== undefined) {
            weights[candidate.strategyId] = clamp(
              candidate.proposedWeight,
              constraints.minimumStrategyWeight,
              constraints.maximumStrategyWeight,
            );
          }
          break;

        default:
          if (candidate.proposedWeight !== undefined) {
            weights[candidate.strategyId] = clamp(
              candidate.proposedWeight,
              constraints.minimumStrategyWeight,
              constraints.maximumStrategyWeight,
            );
          }
          break;
      }
    }

    const reserveFloor = constraints.minimumReserveWeight;
    const maximumAllocated = Math.max(0, 1 - reserveFloor);
    const total = sum(Object.values(weights));

    if (total > maximumAllocated + EPSILON) {
      const scale = maximumAllocated / total;
      for (const strategyId of Object.keys(weights)) {
        weights[strategyId] = weights[strategyId] * scale;
      }
      warnings.push(
        "Projected strategy weights were scaled to preserve the minimum reserve weight.",
      );
    } else if (
      constraints.normalizeWeightsToOne &&
      total > EPSILON &&
      total < maximumAllocated - EPSILON
    ) {
      const scale = maximumAllocated / total;
      for (const strategyId of Object.keys(weights)) {
        weights[strategyId] = Math.min(
          constraints.maximumStrategyWeight,
          weights[strategyId] * scale,
        );
      }

      const normalizedTotal = sum(Object.values(weights));
      if (normalizedTotal < maximumAllocated - 1e-9) {
        warnings.push(
          "Weight normalization was bounded by per-strategy maximums; excess remains in reserve.",
        );
      }
    }

    return Object.freeze(
      Object.fromEntries(
        Object.entries(weights)
          .sort(([left], [right]) => compareText(left, right))
          .map(([strategyId, weight]) => [
            strategyId,
            round(weight, 12),
          ]),
      ),
    );
  }

  private projectOperatingModes(
    strategyStates: readonly StrategyDecisionState[],
    candidates: readonly ScoredDecisionCandidate[],
  ): Readonly<Record<DecisionStrategyId, StrategyOperatingMode>> {
    const modes: Record<string, StrategyOperatingMode> = {};

    for (const state of strategyStates) {
      modes[state.strategy.strategyId] = state.operatingMode;
    }

    for (const candidate of candidates) {
      if (candidate.strategyId === undefined) {
        continue;
      }

      if (candidate.proposedOperatingMode !== undefined) {
        modes[candidate.strategyId] = candidate.proposedOperatingMode;
        continue;
      }

      switch (candidate.type) {
        case "ACTIVATE_STRATEGY":
        case "RESUME_STRATEGY":
          if (modes[candidate.strategyId] === "DISABLED") {
            modes[candidate.strategyId] = "SHADOW";
          }
          break;
        case "PAUSE_STRATEGY":
          modes[candidate.strategyId] = "OBSERVE_ONLY";
          break;
        case "DEACTIVATE_STRATEGY":
        case "RETIRE_STRATEGY":
          modes[candidate.strategyId] = "DISABLED";
          break;
        default:
          break;
      }
    }

    return Object.freeze(
      Object.fromEntries(
        Object.entries(modes).sort(([left], [right]) =>
          compareText(left, right),
        ),
      ),
    );
  }

  private buildMetrics(
    input: DecisionPlanOptimizationRequest,
    selected: readonly ScoredDecisionCandidate[],
    rejected: readonly ScoredDecisionCandidate[],
    actions: readonly DecisionAction[],
    targetWeights: Readonly<Record<DecisionStrategyId, number>>,
  ): DecisionPlanMetrics {
    const expectedGrossUtility = sum(
      selected.map((candidate) => candidate.grossScore),
    );
    const expectedNetUtility = sum(
      selected.map((candidate) => candidate.finalScore),
    );
    const expectedCost = sum(
      selected.map((candidate) => candidate.costs.totalCost),
    );
    const expectedRiskDelta = sum(
      selected.map((candidate) => candidate.riskImpact.riskDelta),
    );
    const expectedTurnover = calculateTurnover(
      input.request.portfolio.strategyWeights,
      targetWeights,
    );
    const expectedCapitalChange = sum(
      selected.map((candidate) => Math.abs(candidate.proposedCapital ?? 0)),
    );
    const allocatedWeight = sum(Object.values(targetWeights));
    const expectedReserveWeight = clamp(1 - allocatedWeight, 0, 1);

    return Object.freeze({
      candidateCount: input.candidates.length,
      selectedCandidateCount: selected.length,
      rejectedCandidateCount:
        input.candidates.length - selected.length,
      actionCount: actions.length,
      expectedGrossUtility: round(expectedGrossUtility, 12),
      expectedNetUtility: round(expectedNetUtility, 12),
      expectedCost: round(expectedCost, 12),
      expectedRiskDelta: round(expectedRiskDelta, 12),
      expectedTurnover: round(expectedTurnover, 12),
      expectedCapitalChange: round(expectedCapitalChange, 12),
      expectedReserveWeight: round(expectedReserveWeight, 12),
      diversificationScore: round(
        weightedAverage(
          selected,
          (candidate) => candidate.utility.diversificationUtility,
        ),
        12,
      ),
      regimeAlignmentScore: round(
        weightedAverage(
          selected,
          (candidate) => candidate.utility.regimeAlignmentUtility,
        ),
        12,
      ),
      stabilityScore: round(
        weightedAverage(
          selected,
          (candidate) => candidate.utility.stabilityUtility,
        ),
        12,
      ),
      confidence: round(
        weightedAverage(
          selected,
          (candidate) => candidate.confidence.score,
        ),
        12,
      ),
    });
  }

  private determineDecision(
    selected: readonly ScoredDecisionCandidate[],
    metrics: DecisionPlanMetrics,
    input: DecisionPlanOptimizationRequest,
  ): DecisionIntelligenceDecision {
    if (input.context.blockingConditions.length > 0) {
      return "HOLD";
    }

    if (selected.length === 0 || metrics.actionCount === 0) {
      return "HOLD";
    }

    if (
      metrics.expectedNetUtility <= this.minimumNetUtility + EPSILON ||
      metrics.confidence <
        input.request.configuration.safetyPolicy.minimumDecisionConfidence
    ) {
      return "HOLD";
    }

    if (
      input.request.configuration.executionMode === "LIVE_AUTONOMOUS" &&
      input.request.configuration.safetyPolicy
        .requireHumanApprovalForLiveAutonomousMode
    ) {
      return "EXECUTE_WITH_RESTRICTIONS";
    }

    if (
      metrics.expectedRiskDelta >
        input.request.configuration.governancePolicy
          .maximumAutonomousRiskIncrease ||
      metrics.expectedTurnover >
        input.request.configuration.governancePolicy.maximumAutonomousTurnover
    ) {
      return "EXECUTE_WITH_RESTRICTIONS";
    }

    return "EXECUTE";
  }

  private buildSafeguards(
    input: DecisionPlanOptimizationRequest,
    selected: readonly ScoredDecisionCandidate[],
    metrics: DecisionPlanMetrics,
  ): readonly string[] {
    const safeguards = [
      "Validate portfolio state immediately before execution.",
      "Re-run risk checks before each capital or exposure change.",
      "Stop dependent actions when a prerequisite action fails.",
      "Persist pre-action state for rollback and audit.",
    ];

    if (
      input.request.configuration.safetyPolicy.requireRollbackForLiveActions
    ) {
      safeguards.push("Require rollback support for every live action.");
    }

    if (metrics.expectedRiskDelta > 0) {
      safeguards.push(
        "Reconfirm remaining risk budget before risk-increasing actions.",
      );
    }

    if (
      selected.some(
        (candidate) =>
          candidate.type === "PROMOTE_STRATEGY" ||
          candidate.type === "RETIRE_STRATEGY",
      )
    ) {
      safeguards.push(
        "Require lifecycle governance approval before promotion or retirement.",
      );
    }

    return Object.freeze(uniqueStrings(safeguards));
  }

  private isIncompatibleWithSelected(
    candidate: ScoredDecisionCandidate,
    selected: readonly ScoredDecisionCandidate[],
  ): boolean {
    return selected.some(
      (existing) =>
        existing.strategyId === candidate.strategyId &&
        lifecycleFamily(existing.type) !== lifecycleFamily(candidate.type),
    );
  }

  private assertRequest(input: DecisionPlanOptimizationRequest): void {
    if (input === null || typeof input !== "object") {
      throw new DecisionOptimizationError(
        "Optimization request is required.",
        "INVALID_REQUEST",
      );
    }

    nonEmpty(input.runId, "runId");
    nonEmpty(input.request.requestId, "request.requestId");
    nonEmpty(input.request.portfolioId, "request.portfolioId");
    validTimestamp(input.generatedAt, "generatedAt");

    if (!Array.isArray(input.candidates)) {
      throw new DecisionOptimizationError(
        "candidates must be an array.",
        "INVALID_CANDIDATES",
      );
    }

    const ids = new Set<string>();
    for (const candidate of input.candidates) {
      nonEmpty(candidate.candidateId, "candidate.candidateId");
      if (ids.has(candidate.candidateId)) {
        throw new DecisionOptimizationError(
          `Duplicate candidateId: ${candidate.candidateId}`,
          "DUPLICATE_CANDIDATE_ID",
        );
      }
      ids.add(candidate.candidateId);
      finite(candidate.finalScore, `${candidate.candidateId}.finalScore`);
      unitInterval(
        candidate.confidence.score,
        `${candidate.candidateId}.confidence.score`,
      );
    }
  }
}

function estimateCandidateTurnover(
  candidate: ScoredDecisionCandidate,
  input: DecisionPlanOptimizationRequest,
): number {
  if (
    candidate.strategyId !== undefined &&
    candidate.proposedWeight !== undefined
  ) {
    const current =
      input.request.portfolio.strategyWeights[candidate.strategyId] ?? 0;
    return Math.abs(candidate.proposedWeight - current);
  }

  if (
    candidate.proposedCapital !== undefined &&
    input.request.portfolio.totalEquity > EPSILON
  ) {
    return Math.abs(candidate.proposedCapital) /
      input.request.portfolio.totalEquity;
  }

  return candidate.costs.expectedTurnoverCost;
}

function calculateTurnover(
  current: Readonly<Record<string, number>>,
  target: Readonly<Record<string, number>>,
): number {
  const ids = new Set([...Object.keys(current), ...Object.keys(target)]);
  let turnover = 0;

  for (const id of ids) {
    turnover += Math.abs((target[id] ?? 0) - (current[id] ?? 0));
  }

  return turnover / 2;
}

function weightedAverage(
  candidates: readonly ScoredDecisionCandidate[],
  selector: (candidate: ScoredDecisionCandidate) => number,
): number {
  if (candidates.length === 0) {
    return 0;
  }

  const weights = candidates.map((candidate) =>
    Math.max(candidate.confidence.score, EPSILON),
  );
  const denominator = sum(weights);
  if (denominator <= EPSILON) {
    return 0;
  }

  return (
    candidates.reduce(
      (total, candidate, index) =>
        total + selector(candidate) * weights[index],
      0,
    ) / denominator
  );
}

function earliestExpiration(
  candidates: readonly ScoredDecisionCandidate[],
): string | undefined {
  const expirations = candidates
    .map((candidate) => candidate.expiresAt)
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  return expirations[0];
}

function rollbackActionType(
  actionType: ScoredDecisionCandidate["type"],
): DecisionActionType | undefined {
  switch (actionType) {
    case "ACTIVATE_STRATEGY":
      return "DEACTIVATE_STRATEGY";
    case "DEACTIVATE_STRATEGY":
      return "ACTIVATE_STRATEGY";
    case "PAUSE_STRATEGY":
      return "RESUME_STRATEGY";
    case "RESUME_STRATEGY":
      return "PAUSE_STRATEGY";
    case "PROMOTE_STRATEGY":
      return "DEMOTE_STRATEGY";
    case "DEMOTE_STRATEGY":
      return "PROMOTE_STRATEGY";
    case "INCREASE_EXPOSURE":
      return "REDUCE_EXPOSURE";
    case "REDUCE_EXPOSURE":
      return "INCREASE_EXPOSURE";
    case "CHANGE_EXECUTION_MODE":
      return "CHANGE_EXECUTION_MODE";
    default:
      return undefined;
  }
}

function lifecycleFamily(
  type: ScoredDecisionCandidate["type"],
): string {
  switch (type) {
    case "ACTIVATE_STRATEGY":
    case "RESUME_STRATEGY":
      return "ACTIVATE";
    case "PAUSE_STRATEGY":
    case "DEACTIVATE_STRATEGY":
    case "RETIRE_STRATEGY":
      return "DEACTIVATE";
    case "PROMOTE_STRATEGY":
      return "PROMOTE";
    case "DEMOTE_STRATEGY":
      return "DEMOTE";
    case "REWEIGHT_STRATEGY":
    case "INCREASE_EXPOSURE":
    case "REDUCE_EXPOSURE":
      return "ALLOCATION";
    default:
      return type;
  }
}

function findStrategyState(
  states: readonly StrategyDecisionState[],
  strategyId: string,
): StrategyDecisionState | undefined {
  return states.find(
    (state) => state.strategy.strategyId === strategyId,
  );
}

function compareCandidates(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): number {
  const priorityDelta =
    priorityScore(right.priority) - priorityScore(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const scoreDelta = right.finalScore - left.finalScore;
  if (Math.abs(scoreDelta) > EPSILON) {
    return scoreDelta;
  }

  const confidenceDelta =
    right.confidence.score - left.confidence.score;
  if (Math.abs(confidenceDelta) > EPSILON) {
    return confidenceDelta;
  }

  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  return compareText(left.candidateId, right.candidateId);
}

function priorityScore(priority: DecisionPriority): number {
  switch (priority) {
    case "CRITICAL":
      return 5;
    case "VERY_HIGH":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default: {
      const exhaustive: never = priority;
      return exhaustive;
    }
  }
}

function deterministicId(prefix: string, seed: string): DecisionIntelligenceId {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonEmpty(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DecisionOptimizationError(
      `${name} must be a non-empty string.`,
      "INVALID_STRING",
    );
  }
  return value;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new DecisionOptimizationError(
      `${name} must be finite.`,
      "INVALID_NUMBER",
    );
  }
  return value;
}

function unitInterval(value: number, name: string): number {
  finite(value, name);
  if (value < 0 || value > 1) {
    throw new DecisionOptimizationError(
      `${name} must be between 0 and 1.`,
      "INVALID_RANGE",
    );
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DecisionOptimizationError(
      `${name} must be a positive integer.`,
      "INVALID_INTEGER",
    );
  }
  return value;
}

function validTimestamp(value: string, name: string): string {
  nonEmpty(value, name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new DecisionOptimizationError(
      `${name} must be a valid timestamp.`,
      "INVALID_TIMESTAMP",
    );
  }
  return value;
}