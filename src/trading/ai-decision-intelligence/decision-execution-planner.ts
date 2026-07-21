/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 10:
 * src/trading/ai-decision-intelligence/decision-execution-planner.ts
 *
 * Deterministic execution planner for governed decision plans.
 *
 * This implementation is intentionally adapter-neutral. It validates and
 * schedules the plan, evaluates dependencies and blocking relationships,
 * applies execution-mode semantics, simulates deterministic action outcomes,
 * observes retry and failure policies, performs rollback bookkeeping, and
 * returns an immutable execution result. A later integration layer may replace
 * the deterministic action handler with live strategy, portfolio, risk, and
 * execution adapters without changing the Milestone 35 contracts.
 */

import type {
  DecisionAction,
  DecisionActionExecutionResult,
  DecisionActionExecutionStatus,
  DecisionExecutionMode,
  DecisionFailurePolicy,
  DecisionIntelligenceId,
  DecisionIntelligenceTimestamp,
  DecisionMetadata,
  DecisionPlanExecutionResult,
  DecisionPlanExecutionStatus,
  DecisionPlanExecutorPort,
  DecisionExecutionPlan,
} from "./ai-decision-intelligence-contracts";

const DEFAULT_MAXIMUM_ACTIONS = 1_000;
const DEFAULT_MAXIMUM_DEPENDENCY_DEPTH = 128;
const DEFAULT_SIMULATED_ACTION_DURATION_MS = 1;
const EPSILON = 1e-12;

export interface DecisionExecutionPlannerOptions {
  readonly maximumActions?: number;
  readonly maximumDependencyDepth?: number;
  readonly simulatedActionDurationMs?: number;
  readonly failOnPlanWarnings?: boolean;
  readonly deterministicFailureActionIds?: readonly DecisionIntelligenceId[];
  readonly deterministicRetryableFailureActionIds?: readonly DecisionIntelligenceId[];
  readonly deterministicSkipActionIds?: readonly DecisionIntelligenceId[];
}

export class DecisionExecutionPlannerError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(
    message: string,
    code = "DECISION_EXECUTION_PLANNER_ERROR",
    retryable = false,
  ) {
    super(message);
    this.name = "DecisionExecutionPlannerError";
    this.code = code;
    this.retryable = retryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface MutableExecutionState {
  readonly resultsByActionId: Map<
    DecisionIntelligenceId,
    DecisionActionExecutionResult
  >;
  readonly completedActionIds: Set<DecisionIntelligenceId>;
  readonly failedActionIds: Set<DecisionIntelligenceId>;
  readonly skippedActionIds: Set<DecisionIntelligenceId>;
  readonly rolledBackActionIds: Set<DecisionIntelligenceId>;
  readonly warnings: string[];
  stopRequested: boolean;
  rollbackPlanRequested: boolean;
  escalationRequested: boolean;
}

interface ActionAttemptOutcome {
  readonly status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly retryable: boolean;
  readonly message: string;
  readonly errorCode?: string;
  readonly warnings: readonly string[];
  readonly previousState: DecisionMetadata;
  readonly resultingState: DecisionMetadata;
  readonly externalReferenceId?: string;
}

export class DecisionExecutionPlanner implements DecisionPlanExecutorPort {
  private readonly maximumActions: number;
  private readonly maximumDependencyDepth: number;
  private readonly simulatedActionDurationMs: number;
  private readonly failOnPlanWarnings: boolean;
  private readonly deterministicFailureActionIds: ReadonlySet<string>;
  private readonly deterministicRetryableFailureActionIds: ReadonlySet<string>;
  private readonly deterministicSkipActionIds: ReadonlySet<string>;

  public constructor(options: DecisionExecutionPlannerOptions = {}) {
    this.maximumActions = positiveInteger(
      options.maximumActions ?? DEFAULT_MAXIMUM_ACTIONS,
      "maximumActions",
    );
    this.maximumDependencyDepth = positiveInteger(
      options.maximumDependencyDepth ??
        DEFAULT_MAXIMUM_DEPENDENCY_DEPTH,
      "maximumDependencyDepth",
    );
    this.simulatedActionDurationMs = nonNegativeInteger(
      options.simulatedActionDurationMs ??
        DEFAULT_SIMULATED_ACTION_DURATION_MS,
      "simulatedActionDurationMs",
    );
    this.failOnPlanWarnings = options.failOnPlanWarnings ?? false;
    this.deterministicFailureActionIds = new Set(
      options.deterministicFailureActionIds ?? [],
    );
    this.deterministicRetryableFailureActionIds = new Set(
      options.deterministicRetryableFailureActionIds ?? [],
    );
    this.deterministicSkipActionIds = new Set(
      options.deterministicSkipActionIds ?? [],
    );
  }

  public execute(
    plan: DecisionExecutionPlan,
  ): DecisionPlanExecutionResult {
    this.assertPlan(plan);

    const startedAt = normalizeTimestamp(plan.createdAt);
    const executionId = deterministicId(
      "decision-execution",
      [
        plan.planId,
        plan.runId,
        plan.requestId,
        startedAt,
        plan.executionMode,
      ].join("|"),
    );

    const orderedActions = this.orderActions(plan.actions);
    const state = this.createExecutionState();

    if (this.failOnPlanWarnings && plan.warnings.length > 0) {
      return this.buildImmediateFailure(
        executionId,
        plan,
        startedAt,
        "PLAN_WARNINGS_REJECTED",
        "Execution was rejected because the plan contains warnings.",
        plan.warnings,
      );
    }

    if (!isExecutableDecision(plan.decision)) {
      return this.buildNonExecutableResult(
        executionId,
        plan,
        orderedActions,
        startedAt,
      );
    }

    if (
      plan.validUntil !== undefined &&
      Date.parse(plan.validUntil) < Date.parse(startedAt)
    ) {
      return this.buildExpiredPlanResult(
        executionId,
        plan,
        orderedActions,
        startedAt,
      );
    }

    for (const action of orderedActions) {
      if (state.stopRequested) {
        this.markSkipped(
          action,
          state,
          startedAt,
          "Execution stopped by a previous action failure policy.",
          "PLAN_STOPPED",
        );
        continue;
      }

      const dependencyFailure =
        this.findDependencyFailure(action, state);
      if (dependencyFailure !== undefined) {
        this.markSkipped(
          action,
          state,
          startedAt,
          `Dependency ${dependencyFailure} did not complete successfully.`,
          "DEPENDENCY_NOT_SATISFIED",
        );
        continue;
      }

      const activeBlocker = this.findActiveBlocker(action, state);
      if (activeBlocker !== undefined) {
        this.markSkipped(
          action,
          state,
          startedAt,
          `Action is blocked by completed action ${activeBlocker}.`,
          "ACTION_BLOCKED",
        );
        continue;
      }

      if (this.isActionExpired(action, startedAt)) {
        this.markFailed(
          action,
          state,
          0,
          startedAt,
          startedAt,
          "Action expired before execution.",
          false,
          "ACTION_EXPIRED",
          [],
        );
        this.applyFailurePolicy(action, state, orderedActions, startedAt);
        continue;
      }

      if (!this.isEarliestExecutionSatisfied(action, startedAt)) {
        this.markSkipped(
          action,
          state,
          startedAt,
          "Action earliestExecutionAt is later than the deterministic execution time.",
          "ACTION_NOT_YET_EXECUTABLE",
        );
        continue;
      }

      this.executeAction(
        action,
        plan.executionMode,
        state,
        startedAt,
      );

      const result = state.resultsByActionId.get(action.actionId);
      if (result?.status === "FAILED") {
        this.applyFailurePolicy(
          action,
          state,
          orderedActions,
          startedAt,
        );
      }
    }

    if (state.rollbackPlanRequested) {
      this.rollbackCompletedActions(
        orderedActions,
        state,
        startedAt,
      );
    }

    const completedAt = addMilliseconds(
      startedAt,
      Math.max(
        1,
        orderedActions.length * this.simulatedActionDurationMs,
      ),
    );
    const status = determinePlanStatus(
      orderedActions.length,
      state,
    );

    return Object.freeze({
      executionId,
      planId: plan.planId,
      portfolioId: plan.portfolioId,
      status,
      startedAt,
      completedAt,
      actionResults: Object.freeze(
        orderedActions.map((action) => {
          const result = state.resultsByActionId.get(action.actionId);
          if (result === undefined) {
            throw new DecisionExecutionPlannerError(
              `Missing execution result for action ${action.actionId}.`,
              "MISSING_ACTION_RESULT",
            );
          }
          return result;
        }),
      ),
      completedActionIds: Object.freeze(
        [...state.completedActionIds].sort(compareText),
      ),
      failedActionIds: Object.freeze(
        [...state.failedActionIds].sort(compareText),
      ),
      skippedActionIds: Object.freeze(
        [...state.skippedActionIds].sort(compareText),
      ),
      rolledBackActionIds: Object.freeze(
        [...state.rolledBackActionIds].sort(compareText),
      ),
      warnings: Object.freeze(uniqueStrings(state.warnings)),
      metadata: Object.freeze({
        planner: "DecisionExecutionPlanner",
        deterministic: true,
        executionMode: plan.executionMode,
        actionCount: orderedActions.length,
        stopRequested: state.stopRequested,
        rollbackPlanRequested: state.rollbackPlanRequested,
        escalationRequested: state.escalationRequested,
      }),
    });
  }

  private executeAction(
    action: DecisionAction,
    executionMode: DecisionExecutionMode,
    state: MutableExecutionState,
    planStartedAt: string,
  ): void {
    const maximumAttempts = Math.max(1, action.maximumAttempts);
    let lastOutcome: ActionAttemptOutcome | undefined;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt += 1
    ) {
      const startedAt = addMilliseconds(
        planStartedAt,
        Math.max(
          0,
          (action.sequence - 1) *
            this.simulatedActionDurationMs +
            (attempt - 1),
        ),
      );

      const outcome = this.performDeterministicAttempt(
        action,
        executionMode,
        attempt,
      );
      lastOutcome = outcome;

      const completedAt = addMilliseconds(
        startedAt,
        this.simulatedActionDurationMs,
      );

      if (outcome.status === "SUCCEEDED") {
        const result = this.createActionResult({
          action,
          status: "SUCCEEDED",
          attempt,
          startedAt,
          completedAt,
          message: outcome.message,
          retryable: false,
          warnings: outcome.warnings,
          previousState: outcome.previousState,
          resultingState: outcome.resultingState,
          externalReferenceId: outcome.externalReferenceId,
        });
        state.resultsByActionId.set(action.actionId, result);
        state.completedActionIds.add(action.actionId);
        state.warnings.push(...outcome.warnings);
        return;
      }

      if (outcome.status === "SKIPPED") {
        const result = this.createActionResult({
          action,
          status: "SKIPPED",
          attempt,
          startedAt,
          completedAt,
          message: outcome.message,
          retryable: false,
          warnings: outcome.warnings,
          previousState: outcome.previousState,
          resultingState: outcome.resultingState,
          externalReferenceId: outcome.externalReferenceId,
          errorCode: outcome.errorCode,
        });
        state.resultsByActionId.set(action.actionId, result);
        state.skippedActionIds.add(action.actionId);
        state.warnings.push(...outcome.warnings);
        return;
      }

      const canRetry =
        outcome.retryable && attempt < maximumAttempts;
      if (canRetry) {
        state.warnings.push(
          `Action ${action.actionId} attempt ${attempt} failed and will be retried.`,
        );
        continue;
      }

      const result = this.createActionResult({
        action,
        status: "FAILED",
        attempt,
        startedAt,
        completedAt,
        message: outcome.message,
        retryable: outcome.retryable,
        warnings: outcome.warnings,
        previousState: outcome.previousState,
        resultingState: outcome.resultingState,
        externalReferenceId: outcome.externalReferenceId,
        errorCode: outcome.errorCode,
      });
      state.resultsByActionId.set(action.actionId, result);
      state.failedActionIds.add(action.actionId);
      state.warnings.push(...outcome.warnings);
      return;
    }

    this.markFailed(
      action,
      state,
      maximumAttempts,
      planStartedAt,
      addMilliseconds(
        planStartedAt,
        maximumAttempts * this.simulatedActionDurationMs,
      ),
      lastOutcome?.message ??
        "Action failed without a deterministic outcome.",
      lastOutcome?.retryable ?? false,
      lastOutcome?.errorCode ?? "ACTION_EXECUTION_FAILED",
      lastOutcome?.warnings ?? [],
    );
  }

  private performDeterministicAttempt(
    action: DecisionAction,
    executionMode: DecisionExecutionMode,
    attempt: number,
  ): ActionAttemptOutcome {
    const previousState = buildPreviousState(action);
    const resultingState = buildResultingState(
      action,
      executionMode,
    );

    if (
      this.deterministicSkipActionIds.has(action.actionId)
    ) {
      return Object.freeze({
        status: "SKIPPED",
        retryable: false,
        message:
          "Action was skipped by deterministic execution configuration.",
        errorCode: "DETERMINISTIC_SKIP",
        warnings: Object.freeze([
          "No external side effect was produced.",
        ]),
        previousState,
        resultingState: previousState,
      });
    }

    if (
      this.deterministicRetryableFailureActionIds.has(
        action.actionId,
      )
    ) {
      return Object.freeze({
        status: "FAILED",
        retryable: true,
        message: `Deterministic retryable failure on attempt ${attempt}.`,
        errorCode: "DETERMINISTIC_RETRYABLE_FAILURE",
        warnings: Object.freeze([
          "The action may be retried according to maximumAttempts.",
        ]),
        previousState,
        resultingState: previousState,
      });
    }

    if (
      this.deterministicFailureActionIds.has(action.actionId)
    ) {
      return Object.freeze({
        status: "FAILED",
        retryable: false,
        message: "Deterministic non-retryable action failure.",
        errorCode: "DETERMINISTIC_ACTION_FAILURE",
        warnings: Object.freeze([]),
        previousState,
        resultingState: previousState,
      });
    }

    if (executionMode === "DRY_RUN") {
      return Object.freeze({
        status: "SUCCEEDED",
        retryable: false,
        message:
          "Dry-run validation completed; no external state was changed.",
        warnings: Object.freeze([
          "Dry-run mode produced a projected resulting state only.",
        ]),
        previousState,
        resultingState,
        externalReferenceId: deterministicId(
          "dry-run",
          `${action.actionId}|${attempt}`,
        ),
      });
    }

    if (
      executionMode === "SIMULATED" ||
      executionMode === "SHADOW"
    ) {
      return Object.freeze({
        status: "SUCCEEDED",
        retryable: false,
        message: `${executionMode.toLowerCase()} action completed deterministically.`,
        warnings: Object.freeze([]),
        previousState,
        resultingState,
        externalReferenceId: deterministicId(
          "simulation",
          `${action.actionId}|${attempt}|${executionMode}`,
        ),
      });
    }

    return Object.freeze({
      status: "SUCCEEDED",
      retryable: false,
      message:
        "Guarded execution step accepted by the adapter-neutral planner.",
      warnings: Object.freeze([
        "Live side effects require an external execution adapter.",
      ]),
      previousState,
      resultingState,
      externalReferenceId: deterministicId(
        "execution-intent",
        `${action.actionId}|${attempt}|${executionMode}`,
      ),
    });
  }

  private applyFailurePolicy(
    failedAction: DecisionAction,
    state: MutableExecutionState,
    orderedActions: readonly DecisionAction[],
    timestamp: string,
  ): void {
    switch (failedAction.failurePolicy) {
      case "STOP_PLAN":
        state.stopRequested = true;
        state.warnings.push(
          `Plan stopped after action ${failedAction.actionId} failed.`,
        );
        break;

      case "CONTINUE_INDEPENDENT_ACTIONS":
        state.warnings.push(
          `Independent actions may continue after ${failedAction.actionId} failed.`,
        );
        break;

      case "ROLLBACK_PLAN":
        state.rollbackPlanRequested = true;
        state.stopRequested = true;
        state.warnings.push(
          `Plan rollback requested after action ${failedAction.actionId} failed.`,
        );
        break;

      case "ROLLBACK_ACTION":
        this.rollbackSingleAction(
          failedAction,
          state,
          timestamp,
        );
        break;

      case "ESCALATE":
        state.escalationRequested = true;
        state.stopRequested = true;
        state.warnings.push(
          `Execution escalation requested after action ${failedAction.actionId} failed.`,
        );
        break;

      default: {
        const exhaustive: never =
          failedAction.failurePolicy;
        throw new DecisionExecutionPlannerError(
          `Unsupported failure policy ${String(exhaustive)}.`,
          "UNSUPPORTED_FAILURE_POLICY",
        );
      }
    }

    if (state.stopRequested) {
      for (const action of orderedActions) {
        if (
          !state.resultsByActionId.has(action.actionId) &&
          action.sequence > failedAction.sequence
        ) {
          this.markSkipped(
            action,
            state,
            timestamp,
            `Skipped because action ${failedAction.actionId} triggered ${failedAction.failurePolicy}.`,
            "FAILURE_POLICY_STOP",
          );
        }
      }
    }
  }

  private rollbackSingleAction(
    action: DecisionAction,
    state: MutableExecutionState,
    timestamp: string,
  ): void {
    if (!action.rollback.supported) {
      state.escalationRequested = true;
      state.warnings.push(
        `Action ${action.actionId} requested rollback but rollback is unsupported.`,
      );
      return;
    }

    state.rolledBackActionIds.add(action.actionId);
    const existing = state.resultsByActionId.get(action.actionId);
    if (existing !== undefined) {
      state.resultsByActionId.set(
        action.actionId,
        Object.freeze({
          ...existing,
          status: "ROLLED_BACK",
          completedAt: timestamp,
          message: `${existing.message} Rollback completed.`,
          resultingState: Object.freeze({
            rollbackApplied: true,
            rollbackActionType:
              action.rollback.actionType ?? action.type,
            targetWeight: action.rollback.targetWeight,
            targetOperatingMode:
              action.rollback.targetOperatingMode,
            targetParameters:
              action.rollback.targetParameters,
          }),
          warnings: Object.freeze(
            uniqueStrings([
              ...existing.warnings,
              ...action.rollback.instructions,
            ]),
          ),
        }),
      );
    }
  }

  private rollbackCompletedActions(
    orderedActions: readonly DecisionAction[],
    state: MutableExecutionState,
    timestamp: string,
  ): void {
    for (const action of [...orderedActions].reverse()) {
      if (!state.completedActionIds.has(action.actionId)) {
        continue;
      }

      if (!action.rollback.supported) {
        state.warnings.push(
          `Completed action ${action.actionId} could not be rolled back.`,
        );
        state.escalationRequested = true;
        continue;
      }

      this.rollbackSingleAction(action, state, timestamp);
      state.completedActionIds.delete(action.actionId);
    }
  }

  private markSkipped(
    action: DecisionAction,
    state: MutableExecutionState,
    timestamp: string,
    message: string,
    errorCode: string,
  ): void {
    if (state.resultsByActionId.has(action.actionId)) {
      return;
    }

    state.resultsByActionId.set(
      action.actionId,
      this.createActionResult({
        action,
        status: "SKIPPED",
        attempt: 0,
        startedAt: timestamp,
        completedAt: timestamp,
        message,
        retryable: false,
        warnings: [],
        previousState: buildPreviousState(action),
        resultingState: buildPreviousState(action),
        errorCode,
      }),
    );
    state.skippedActionIds.add(action.actionId);
  }

  private markFailed(
    action: DecisionAction,
    state: MutableExecutionState,
    attempt: number,
    startedAt: string,
    completedAt: string,
    message: string,
    retryable: boolean,
    errorCode: string,
    warnings: readonly string[],
  ): void {
    state.resultsByActionId.set(
      action.actionId,
      this.createActionResult({
        action,
        status: "FAILED",
        attempt,
        startedAt,
        completedAt,
        message,
        retryable,
        warnings,
        previousState: buildPreviousState(action),
        resultingState: buildPreviousState(action),
        errorCode,
      }),
    );
    state.failedActionIds.add(action.actionId);
  }

  private createActionResult(input: {
    readonly action: DecisionAction;
    readonly status: DecisionActionExecutionStatus;
    readonly attempt: number;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly externalReferenceId?: string;
    readonly previousState?: DecisionMetadata;
    readonly resultingState?: DecisionMetadata;
    readonly message: string;
    readonly retryable: boolean;
    readonly errorCode?: string;
    readonly warnings: readonly string[];
  }): DecisionActionExecutionResult {
    return Object.freeze({
      actionId: input.action.actionId,
      status: input.status,
      attempt: input.attempt,
      ...(input.startedAt === undefined
        ? {}
        : { startedAt: input.startedAt }),
      ...(input.completedAt === undefined
        ? {}
        : { completedAt: input.completedAt }),
      ...(input.externalReferenceId === undefined
        ? {}
        : {
            externalReferenceId:
              input.externalReferenceId,
          }),
      ...(input.previousState === undefined
        ? {}
        : { previousState: input.previousState }),
      ...(input.resultingState === undefined
        ? {}
        : { resultingState: input.resultingState }),
      message: input.message,
      retryable: input.retryable,
      ...(input.errorCode === undefined
        ? {}
        : { errorCode: input.errorCode }),
      warnings: Object.freeze([...input.warnings]),
    });
  }

  private findDependencyFailure(
    action: DecisionAction,
    state: MutableExecutionState,
  ): string | undefined {
    for (const dependencyId of action.dependsOnActionIds) {
      const result =
        state.resultsByActionId.get(dependencyId);
      if (
        result === undefined ||
        result.status !== "SUCCEEDED"
      ) {
        return dependencyId;
      }
    }
    return undefined;
  }

  private findActiveBlocker(
    action: DecisionAction,
    state: MutableExecutionState,
  ): string | undefined {
    for (const blockerId of action.blocksActionIds) {
      const result = state.resultsByActionId.get(blockerId);
      if (
        result?.status === "SUCCEEDED" ||
        result?.status === "ROLLED_BACK"
      ) {
        return blockerId;
      }
    }
    return undefined;
  }

  private isActionExpired(
    action: DecisionAction,
    timestamp: string,
  ): boolean {
    return (
      action.expiresAt !== undefined &&
      Date.parse(action.expiresAt) <
        Date.parse(timestamp)
    );
  }

  private isEarliestExecutionSatisfied(
    action: DecisionAction,
    timestamp: string,
  ): boolean {
    return (
      action.earliestExecutionAt === undefined ||
      Date.parse(action.earliestExecutionAt) <=
        Date.parse(timestamp)
    );
  }

  private orderActions(
    actions: readonly DecisionAction[],
  ): readonly DecisionAction[] {
    const byId = new Map(
      actions.map((action) => [
        action.actionId,
        action,
      ] as const),
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: DecisionAction[] = [];

    const visit = (
      action: DecisionAction,
      depth: number,
    ): void => {
      if (visited.has(action.actionId)) {
        return;
      }
      if (depth > this.maximumDependencyDepth) {
        throw new DecisionExecutionPlannerError(
          `Dependency depth exceeds ${this.maximumDependencyDepth}.`,
          "DEPENDENCY_DEPTH_EXCEEDED",
        );
      }
      if (visiting.has(action.actionId)) {
        throw new DecisionExecutionPlannerError(
          `Circular dependency detected at action ${action.actionId}.`,
          "CIRCULAR_ACTION_DEPENDENCY",
        );
      }

      visiting.add(action.actionId);
      for (const dependencyId of action.dependsOnActionIds) {
        const dependency = byId.get(dependencyId);
        if (dependency === undefined) {
          throw new DecisionExecutionPlannerError(
            `Action ${action.actionId} references missing dependency ${dependencyId}.`,
            "MISSING_ACTION_DEPENDENCY",
          );
        }
        visit(dependency, depth + 1);
      }
      visiting.delete(action.actionId);
      visited.add(action.actionId);
      ordered.push(action);
    };

    [...actions].sort(compareActions).forEach((action) =>
      visit(action, 0),
    );

    return Object.freeze(ordered);
  }

  private buildNonExecutableResult(
    executionId: string,
    plan: DecisionExecutionPlan,
    actions: readonly DecisionAction[],
    startedAt: string,
  ): DecisionPlanExecutionResult {
    const actionResults = actions.map((action) =>
      this.createActionResult({
        action,
        status: "SKIPPED",
        attempt: 0,
        startedAt,
        completedAt: startedAt,
        message: `Plan decision ${plan.decision} does not authorize execution.`,
        retryable: false,
        errorCode: "PLAN_NOT_EXECUTABLE",
        warnings: [],
        previousState: buildPreviousState(action),
        resultingState: buildPreviousState(action),
      }),
    );

    return Object.freeze({
      executionId,
      planId: plan.planId,
      portfolioId: plan.portfolioId,
      status: "CANCELLED",
      startedAt,
      completedAt: startedAt,
      actionResults: Object.freeze(actionResults),
      completedActionIds: Object.freeze([]),
      failedActionIds: Object.freeze([]),
      skippedActionIds: Object.freeze(
        actions.map((action) => action.actionId),
      ),
      rolledBackActionIds: Object.freeze([]),
      warnings: Object.freeze([
        `Plan decision ${plan.decision} prevented execution.`,
      ]),
      metadata: Object.freeze({
        planner: "DecisionExecutionPlanner",
        deterministic: true,
        executionMode: plan.executionMode,
      }),
    });
  }

  private buildExpiredPlanResult(
    executionId: string,
    plan: DecisionExecutionPlan,
    actions: readonly DecisionAction[],
    startedAt: string,
  ): DecisionPlanExecutionResult {
    const actionResults = actions.map((action) =>
      this.createActionResult({
        action,
        status: "SKIPPED",
        attempt: 0,
        startedAt,
        completedAt: startedAt,
        message: "Plan expired before execution.",
        retryable: false,
        errorCode: "PLAN_EXPIRED",
        warnings: [],
        previousState: buildPreviousState(action),
        resultingState: buildPreviousState(action),
      }),
    );

    return Object.freeze({
      executionId,
      planId: plan.planId,
      portfolioId: plan.portfolioId,
      status: "CANCELLED",
      startedAt,
      completedAt: startedAt,
      actionResults: Object.freeze(actionResults),
      completedActionIds: Object.freeze([]),
      failedActionIds: Object.freeze([]),
      skippedActionIds: Object.freeze(
        actions.map((action) => action.actionId),
      ),
      rolledBackActionIds: Object.freeze([]),
      warnings: Object.freeze([
        "Plan validity window expired before execution.",
      ]),
      metadata: Object.freeze({
        planner: "DecisionExecutionPlanner",
        deterministic: true,
        validUntil: plan.validUntil,
      }),
    });
  }

  private buildImmediateFailure(
    executionId: string,
    plan: DecisionExecutionPlan,
    startedAt: string,
    errorCode: string,
    message: string,
    warnings: readonly string[],
  ): DecisionPlanExecutionResult {
    return Object.freeze({
      executionId,
      planId: plan.planId,
      portfolioId: plan.portfolioId,
      status: "FAILED",
      startedAt,
      completedAt: startedAt,
      actionResults: Object.freeze([]),
      completedActionIds: Object.freeze([]),
      failedActionIds: Object.freeze([]),
      skippedActionIds: Object.freeze([]),
      rolledBackActionIds: Object.freeze([]),
      warnings: Object.freeze(
        uniqueStrings([
          message,
          `Error code: ${errorCode}.`,
          ...warnings,
        ]),
      ),
      metadata: Object.freeze({
        planner: "DecisionExecutionPlanner",
        deterministic: true,
        errorCode,
      }),
    });
  }

  private createExecutionState(): MutableExecutionState {
    return {
      resultsByActionId: new Map(),
      completedActionIds: new Set(),
      failedActionIds: new Set(),
      skippedActionIds: new Set(),
      rolledBackActionIds: new Set(),
      warnings: [],
      stopRequested: false,
      rollbackPlanRequested: false,
      escalationRequested: false,
    };
  }

  private assertPlan(
    plan: DecisionExecutionPlan,
  ): void {
    if (plan === null || typeof plan !== "object") {
      throw new DecisionExecutionPlannerError(
        "Execution plan is required.",
        "INVALID_PLAN",
      );
    }

    nonEmpty(plan.planId, "planId");
    nonEmpty(plan.runId, "runId");
    nonEmpty(plan.requestId, "requestId");
    nonEmpty(plan.portfolioId, "portfolioId");
    validTimestamp(plan.createdAt, "createdAt");

    if (
      plan.validUntil !== undefined &&
      !Number.isFinite(Date.parse(plan.validUntil))
    ) {
      throw new DecisionExecutionPlannerError(
        "validUntil must be a valid timestamp.",
        "INVALID_VALID_UNTIL",
      );
    }

    if (!Array.isArray(plan.actions)) {
      throw new DecisionExecutionPlannerError(
        "actions must be an array.",
        "INVALID_ACTIONS",
      );
    }

    if (plan.actions.length > this.maximumActions) {
      throw new DecisionExecutionPlannerError(
        `Plan contains ${plan.actions.length} actions; maximum is ${this.maximumActions}.`,
        "ACTION_LIMIT_EXCEEDED",
      );
    }

    const actionIds = new Set<string>();
    const sequences = new Set<number>();

    for (const action of plan.actions) {
      nonEmpty(action.actionId, "action.actionId");
      nonEmpty(action.candidateId, "action.candidateId");

      if (actionIds.has(action.actionId)) {
        throw new DecisionExecutionPlannerError(
          `Duplicate actionId ${action.actionId}.`,
          "DUPLICATE_ACTION_ID",
        );
      }
      actionIds.add(action.actionId);

      if (
        !Number.isInteger(action.sequence) ||
        action.sequence <= 0
      ) {
        throw new DecisionExecutionPlannerError(
          `Action ${action.actionId} sequence must be a positive integer.`,
          "INVALID_ACTION_SEQUENCE",
        );
      }
      if (sequences.has(action.sequence)) {
        throw new DecisionExecutionPlannerError(
          `Duplicate action sequence ${action.sequence}.`,
          "DUPLICATE_ACTION_SEQUENCE",
        );
      }
      sequences.add(action.sequence);

      positiveInteger(
        action.timeoutMs,
        `action[${action.actionId}].timeoutMs`,
      );
      positiveInteger(
        action.maximumAttempts,
        `action[${action.actionId}].maximumAttempts`,
      );
      unitInterval(
        action.confidence,
        `action[${action.actionId}].confidence`,
      );
      finite(
        action.expectedUtility,
        `action[${action.actionId}].expectedUtility`,
      );
      finite(
        action.expectedRiskDelta,
        `action[${action.actionId}].expectedRiskDelta`,
      );
    }

    for (const action of plan.actions) {
      for (const dependencyId of action.dependsOnActionIds) {
        if (!actionIds.has(dependencyId)) {
          throw new DecisionExecutionPlannerError(
            `Action ${action.actionId} references unknown dependency ${dependencyId}.`,
            "UNKNOWN_ACTION_DEPENDENCY",
          );
        }
        if (dependencyId === action.actionId) {
          throw new DecisionExecutionPlannerError(
            `Action ${action.actionId} cannot depend on itself.`,
            "SELF_ACTION_DEPENDENCY",
          );
        }
      }

      for (const blockerId of action.blocksActionIds) {
        if (!actionIds.has(blockerId)) {
          throw new DecisionExecutionPlannerError(
            `Action ${action.actionId} references unknown blocker ${blockerId}.`,
            "UNKNOWN_ACTION_BLOCKER",
          );
        }
        if (blockerId === action.actionId) {
          throw new DecisionExecutionPlannerError(
            `Action ${action.actionId} cannot block itself.`,
            "SELF_ACTION_BLOCKER",
          );
        }
      }
    }
  }
}

function determinePlanStatus(
  actionCount: number,
  state: MutableExecutionState,
): DecisionPlanExecutionStatus {
  if (state.rolledBackActionIds.size > 0) {
    return state.failedActionIds.size > 0
      ? "ROLLED_BACK"
      : "PARTIALLY_COMPLETED";
  }

  if (state.failedActionIds.size > 0) {
    if (state.completedActionIds.size > 0) {
      return "PARTIALLY_COMPLETED";
    }
    return "FAILED";
  }

  if (
    state.completedActionIds.size === actionCount &&
    actionCount > 0
  ) {
    return "COMPLETED";
  }

  if (
    actionCount === 0 ||
    state.skippedActionIds.size === actionCount
  ) {
    return "CANCELLED";
  }

  if (state.completedActionIds.size > 0) {
    return "PARTIALLY_COMPLETED";
  }

  return "FAILED";
}

function isExecutableDecision(
  decision: DecisionExecutionPlan["decision"],
): boolean {
  return (
    decision === "EXECUTE" ||
    decision === "EXECUTE_WITH_RESTRICTIONS"
  );
}

function buildPreviousState(
  action: DecisionAction,
): DecisionMetadata {
  return Object.freeze({
    portfolioId: action.portfolioId,
    strategyId: action.strategyId,
    actionType: action.type,
    stateCaptured: true,
  });
}

function buildResultingState(
  action: DecisionAction,
  executionMode: DecisionExecutionMode,
): DecisionMetadata {
  return Object.freeze({
    portfolioId: action.portfolioId,
    strategyId: action.strategyId,
    replacementStrategyId:
      action.replacementStrategyId,
    symbol: action.symbol,
    timeframe: action.timeframe,
    actionType: action.type,
    targetWeight: action.targetWeight,
    targetCapital: action.targetCapital,
    targetRiskBudget: action.targetRiskBudget,
    targetOperatingMode:
      action.targetOperatingMode,
    targetParameters: action.targetParameters,
    executionMode,
    projected: true,
  });
}

function compareActions(
  left: DecisionAction,
  right: DecisionAction,
): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return compareText(left.actionId, right.actionId);
}

function deterministicId(
  prefix: string,
  seed: string,
): DecisionIntelligenceId {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0)
    .toString(36)
    .padStart(7, "0")}`;
}

function addMilliseconds(
  timestamp: DecisionIntelligenceTimestamp,
  milliseconds: number,
): DecisionIntelligenceTimestamp {
  return new Date(
    Date.parse(timestamp) + milliseconds,
  ).toISOString();
}

function normalizeTimestamp(
  timestamp: DecisionIntelligenceTimestamp,
): DecisionIntelligenceTimestamp {
  return new Date(Date.parse(timestamp)).toISOString();
}

function uniqueStrings(
  values: readonly string[],
): string[] {
  return [...new Set(values)]
    .filter((value) => value.trim().length > 0)
    .sort(compareText);
}

function compareText(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonEmpty(
  value: string,
  name: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new DecisionExecutionPlannerError(
      `${name} must be a non-empty string.`,
      "INVALID_STRING",
    );
  }
  return value;
}

function finite(
  value: number,
  name: string,
): number {
  if (!Number.isFinite(value)) {
    throw new DecisionExecutionPlannerError(
      `${name} must be finite.`,
      "INVALID_NUMBER",
    );
  }
  return value;
}

function unitInterval(
  value: number,
  name: string,
): number {
  finite(value, name);
  if (value < -EPSILON || value > 1 + EPSILON) {
    throw new DecisionExecutionPlannerError(
      `${name} must be between 0 and 1.`,
      "INVALID_RANGE",
    );
  }
  return value;
}

function positiveInteger(
  value: number,
  name: string,
): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DecisionExecutionPlannerError(
      `${name} must be a positive integer.`,
      "INVALID_INTEGER",
    );
  }
  return value;
}

function nonNegativeInteger(
  value: number,
  name: string,
): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DecisionExecutionPlannerError(
      `${name} must be a non-negative integer.`,
      "INVALID_INTEGER",
    );
  }
  return value;
}

function validTimestamp(
  value: string,
  name: string,
): string {
  nonEmpty(value, name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new DecisionExecutionPlannerError(
      `${name} must be a valid timestamp.`,
      "INVALID_TIMESTAMP",
    );
  }
  return value;
}