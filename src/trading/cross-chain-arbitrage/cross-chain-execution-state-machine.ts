import type {
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import type {
  CrossChainExecutionPlan,
  CrossChainExecutionPlanStep,
  CrossChainExecutionStepStatus,
} from "./cross-chain-execution-plan-builder";

export type CrossChainExecutionPlanRuntimeStatus =
  | "PLANNED"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export interface CrossChainExecutionStepRuntime {
  readonly step: CrossChainExecutionPlanStep;
  readonly status: CrossChainExecutionStepStatus;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly failedAt: number | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly executionReference: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainExecutionRuntime {
  readonly plan: CrossChainExecutionPlan;
  readonly status: CrossChainExecutionPlanRuntimeStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly failedAt: number | null;
  readonly cancelledAt: number | null;
  readonly expiresAt: number;
  readonly activeStepId: CrossChainIdentifier | null;
  readonly steps: readonly CrossChainExecutionStepRuntime[];
  readonly version: number;
}

export interface CrossChainExecutionRuntimeSnapshot {
  readonly runtime: CrossChainExecutionRuntime;
}

export interface StartCrossChainExecutionStepRequest {
  readonly stepId: CrossChainIdentifier;
  readonly startedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CompleteCrossChainExecutionStepRequest {
  readonly stepId: CrossChainIdentifier;
  readonly completedAt: number;
  readonly executionReference?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FailCrossChainExecutionStepRequest {
  readonly stepId: CrossChainIdentifier;
  readonly failedAt: number;
  readonly failureCode: string;
  readonly failureMessage: string;
  readonly executionReference?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CancelCrossChainExecutionRequest {
  readonly cancelledAt: number;
  readonly reason?: string;
}

export class CrossChainExecutionStateMachineError
  extends Error {
  public readonly code: string;
  public readonly referenceId:
    CrossChainIdentifier | null;

  public constructor(
    code: string,
    message: string,
    referenceId: CrossChainIdentifier | null = null,
  ) {
    super(message);

    this.name =
      "CrossChainExecutionStateMachineError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function freezeArray<T>(
  values: readonly T[],
): readonly T[] {
  return Object.freeze([...values]);
}

function freezeRecord(
  value:
    Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(value ?? {}),
  });
}

function mergeMetadata(
  current: Readonly<Record<string, unknown>>,
  incoming:
    Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...current,
    ...(incoming ?? {}),
  });
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new CrossChainExecutionStateMachineError(
      "INVALID_IDENTIFIER",
      `${fieldName} must not be empty.`,
      value,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CrossChainExecutionStateMachineError(
      "INVALID_TIMESTAMP",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function freezeStepRuntime(
  runtime: CrossChainExecutionStepRuntime,
): CrossChainExecutionStepRuntime {
  return Object.freeze({
    ...runtime,
    step: Object.freeze({
      ...runtime.step,
      dependsOnStepIds: freezeArray(
        runtime.step.dependsOnStepIds,
      ),
      metadata: freezeRecord(
        runtime.step.metadata,
      ),
    }),
    metadata: freezeRecord(runtime.metadata),
  });
}

function freezeRuntime(
  runtime: CrossChainExecutionRuntime,
): CrossChainExecutionRuntime {
  return Object.freeze({
    ...runtime,
    plan: Object.freeze({
      ...runtime.plan,
      steps: freezeArray(runtime.plan.steps),
      metadata: freezeRecord(
        runtime.plan.metadata,
      ),
    }),
    steps: freezeArray(
      runtime.steps.map(freezeStepRuntime),
    ),
  });
}

function derivePlanStatus(
  steps: readonly CrossChainExecutionStepRuntime[],
  currentStatus: CrossChainExecutionPlanRuntimeStatus,
): CrossChainExecutionPlanRuntimeStatus {
  if (
    currentStatus === "CANCELLED" ||
    currentStatus === "EXPIRED"
  ) {
    return currentStatus;
  }

  if (
    steps.some((step) => step.status === "FAILED")
  ) {
    return "FAILED";
  }

  if (
    steps.every(
      (step) =>
        step.status === "COMPLETED" ||
        step.status === "SKIPPED",
    )
  ) {
    return "COMPLETED";
  }

  if (
    steps.some(
      (step) =>
        step.status === "PENDING" ||
        step.status === "READY",
    )
  ) {
    return steps.some(
      (step) =>
        step.startedAt !== null ||
        step.status === "COMPLETED",
    )
      ? "RUNNING"
      : "READY";
  }

  return currentStatus;
}

export class DeterministicCrossChainExecutionStateMachine {
  private runtimeValue: CrossChainExecutionRuntime;

  public constructor(
    plan: CrossChainExecutionPlan,
  ) {
    this.validatePlan(plan);

    const steps =
      plan.steps.map(
        (
          step,
        ): CrossChainExecutionStepRuntime =>
          Object.freeze({
            step,
            status: step.status,
            startedAt: null,
            completedAt: null,
            failedAt: null,
            failureCode: null,
            failureMessage: null,
            executionReference: null,
            metadata: Object.freeze({}),
          }),
      );

    this.runtimeValue = freezeRuntime({
      plan,
      status: derivePlanStatus(
        steps,
        "PLANNED",
      ),
      createdAt: plan.createdAt,
      updatedAt: plan.createdAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      expiresAt: plan.expiresAt,
      activeStepId: null,
      steps,
      version: 0,
    });
  }

  public get runtime():
    CrossChainExecutionRuntime {
    return this.runtimeValue;
  }

  public get status():
    CrossChainExecutionPlanRuntimeStatus {
    return this.runtimeValue.status;
  }

  public get version(): number {
    return this.runtimeValue.version;
  }

  public startStep(
    request: StartCrossChainExecutionStepRequest,
  ): CrossChainExecutionRuntime {
    this.assertMutable();
    this.assertNotExpired(request.startedAt);
    assertNonEmptyString(
      request.stepId,
      "request.stepId",
    );
    assertNonNegativeInteger(
      request.startedAt,
      "request.startedAt",
    );

    if (
      this.runtimeValue.activeStepId !== null
    ) {
      throw new CrossChainExecutionStateMachineError(
        "ACTIVE_STEP_EXISTS",
        `Step "${this.runtimeValue.activeStepId}" is already active.`,
        this.runtimeValue.activeStepId,
      );
    }

    const stepIndex =
      this.requireStepIndex(request.stepId);
    const current =
      this.runtimeValue.steps[stepIndex];

    if (
      current.status !== "READY" &&
      current.status !== "PENDING"
    ) {
      throw new CrossChainExecutionStateMachineError(
        "STEP_NOT_STARTABLE",
        `Step "${request.stepId}" cannot be started from status "${current.status}".`,
        request.stepId,
      );
    }

    this.assertDependenciesCompleted(current);

    if (
      request.startedAt <
      this.runtimeValue.updatedAt
    ) {
      throw new CrossChainExecutionStateMachineError(
        "NON_MONOTONIC_TIMESTAMP",
        "startedAt must not be earlier than the runtime updatedAt timestamp.",
        request.stepId,
      );
    }

    const updatedSteps =
      this.runtimeValue.steps.map(
        (step, index) =>
          index === stepIndex
            ? freezeStepRuntime({
                ...step,
                status: "PENDING",
                startedAt: request.startedAt,
                metadata: mergeMetadata(
                  step.metadata,
                  request.metadata,
                ),
              })
            : step,
      );

    this.runtimeValue = freezeRuntime({
      ...this.runtimeValue,
      status: "RUNNING",
      updatedAt: request.startedAt,
      startedAt:
        this.runtimeValue.startedAt ??
        request.startedAt,
      activeStepId: request.stepId,
      steps: updatedSteps,
      version:
        this.runtimeValue.version + 1,
    });

    return this.runtimeValue;
  }

  public completeStep(
    request:
      CompleteCrossChainExecutionStepRequest,
  ): CrossChainExecutionRuntime {
    this.assertMutable();
    assertNonEmptyString(
      request.stepId,
      "request.stepId",
    );
    assertNonNegativeInteger(
      request.completedAt,
      "request.completedAt",
    );

    const stepIndex =
      this.requireStepIndex(request.stepId);
    const current =
      this.runtimeValue.steps[stepIndex];

    if (current.status !== "PENDING") {
      throw new CrossChainExecutionStateMachineError(
        "STEP_NOT_ACTIVE",
        `Step "${request.stepId}" is not active.`,
        request.stepId,
      );
    }

    if (
      this.runtimeValue.activeStepId !==
      request.stepId
    ) {
      throw new CrossChainExecutionStateMachineError(
        "ACTIVE_STEP_MISMATCH",
        `Step "${request.stepId}" is not the current active step.`,
        request.stepId,
      );
    }

    if (
      current.startedAt !== null &&
      request.completedAt < current.startedAt
    ) {
      throw new CrossChainExecutionStateMachineError(
        "INVALID_COMPLETION_TIMESTAMP",
        "completedAt must not be earlier than startedAt.",
        request.stepId,
      );
    }

    const updatedSteps =
      this.runtimeValue.steps.map(
        (step, index) => {
          if (index === stepIndex) {
            return freezeStepRuntime({
              ...step,
              status: "COMPLETED",
              completedAt:
                request.completedAt,
              executionReference:
                request.executionReference ??
                step.executionReference,
              metadata: mergeMetadata(
                step.metadata,
                request.metadata,
              ),
            });
          }

          if (
            step.step.dependsOnStepIds.includes(
              request.stepId,
            ) &&
            step.status === "BLOCKED"
          ) {
            return freezeStepRuntime({
              ...step,
              status: "READY",
            });
          }

          return step;
        },
      );

    const nextStatus = derivePlanStatus(
      updatedSteps,
      this.runtimeValue.status,
    );

    this.runtimeValue = freezeRuntime({
      ...this.runtimeValue,
      status: nextStatus,
      updatedAt: request.completedAt,
      completedAt:
        nextStatus === "COMPLETED"
          ? request.completedAt
          : null,
      activeStepId: null,
      steps: updatedSteps,
      version:
        this.runtimeValue.version + 1,
    });

    return this.runtimeValue;
  }

  public failStep(
    request: FailCrossChainExecutionStepRequest,
  ): CrossChainExecutionRuntime {
    this.assertMutable();
    assertNonEmptyString(
      request.stepId,
      "request.stepId",
    );
    assertNonEmptyString(
      request.failureCode,
      "request.failureCode",
    );
    assertNonEmptyString(
      request.failureMessage,
      "request.failureMessage",
    );
    assertNonNegativeInteger(
      request.failedAt,
      "request.failedAt",
    );

    const stepIndex =
      this.requireStepIndex(request.stepId);
    const current =
      this.runtimeValue.steps[stepIndex];

    if (
      current.status !== "PENDING" &&
      current.status !== "READY"
    ) {
      throw new CrossChainExecutionStateMachineError(
        "STEP_NOT_FAILABLE",
        `Step "${request.stepId}" cannot fail from status "${current.status}".`,
        request.stepId,
      );
    }

    if (
      current.startedAt !== null &&
      request.failedAt < current.startedAt
    ) {
      throw new CrossChainExecutionStateMachineError(
        "INVALID_FAILURE_TIMESTAMP",
        "failedAt must not be earlier than startedAt.",
        request.stepId,
      );
    }

    const updatedSteps =
      this.runtimeValue.steps.map(
        (step, index) =>
          index === stepIndex
            ? freezeStepRuntime({
                ...step,
                status: "FAILED",
                failedAt: request.failedAt,
                failureCode:
                  request.failureCode,
                failureMessage:
                  request.failureMessage,
                executionReference:
                  request.executionReference ??
                  step.executionReference,
                metadata: mergeMetadata(
                  step.metadata,
                  request.metadata,
                ),
              })
            : step,
      );

    this.runtimeValue = freezeRuntime({
      ...this.runtimeValue,
      status: "FAILED",
      updatedAt: request.failedAt,
      failedAt: request.failedAt,
      activeStepId: null,
      steps: updatedSteps,
      version:
        this.runtimeValue.version + 1,
    });

    return this.runtimeValue;
  }

  public cancel(
    request: CancelCrossChainExecutionRequest,
  ): CrossChainExecutionRuntime {
    this.assertMutable();
    assertNonNegativeInteger(
      request.cancelledAt,
      "request.cancelledAt",
    );

    if (
      request.cancelledAt <
      this.runtimeValue.updatedAt
    ) {
      throw new CrossChainExecutionStateMachineError(
        "NON_MONOTONIC_TIMESTAMP",
        "cancelledAt must not be earlier than runtime updatedAt.",
        this.runtimeValue.plan.planId,
      );
    }

    const updatedSteps =
      this.runtimeValue.steps.map(
        (step) =>
          step.status === "COMPLETED" ||
          step.status === "FAILED"
            ? step
            : freezeStepRuntime({
                ...step,
                status: "SKIPPED",
                metadata: mergeMetadata(
                  step.metadata,
                  request.reason === undefined
                    ? undefined
                    : {
                        cancellationReason:
                          request.reason,
                      },
                ),
              }),
      );

    this.runtimeValue = freezeRuntime({
      ...this.runtimeValue,
      status: "CANCELLED",
      updatedAt: request.cancelledAt,
      cancelledAt: request.cancelledAt,
      activeStepId: null,
      steps: updatedSteps,
      version:
        this.runtimeValue.version + 1,
    });

    return this.runtimeValue;
  }

  public expire(
    expiredAt: number,
  ): CrossChainExecutionRuntime {
    this.assertMutable();
    assertNonNegativeInteger(
      expiredAt,
      "expiredAt",
    );

    if (expiredAt < this.runtimeValue.expiresAt) {
      throw new CrossChainExecutionStateMachineError(
        "NOT_YET_EXPIRED",
        "expiredAt must be greater than or equal to the plan expiresAt timestamp.",
        this.runtimeValue.plan.planId,
      );
    }

    const updatedSteps =
      this.runtimeValue.steps.map(
        (step) =>
          step.status === "COMPLETED" ||
          step.status === "FAILED"
            ? step
            : freezeStepRuntime({
                ...step,
                status: "SKIPPED",
                metadata: mergeMetadata(
                  step.metadata,
                  {
                    skippedReason:
                      "PLAN_EXPIRED",
                  },
                ),
              }),
      );

    this.runtimeValue = freezeRuntime({
      ...this.runtimeValue,
      status: "EXPIRED",
      updatedAt: expiredAt,
      activeStepId: null,
      steps: updatedSteps,
      version:
        this.runtimeValue.version + 1,
    });

    return this.runtimeValue;
  }

  public snapshot():
    CrossChainExecutionRuntimeSnapshot {
    return Object.freeze({
      runtime: this.runtimeValue,
    });
  }

  public restore(
    snapshot:
      CrossChainExecutionRuntimeSnapshot,
  ): CrossChainExecutionRuntime {
    this.validateRuntime(snapshot.runtime);

    if (
      snapshot.runtime.plan.planId !==
      this.runtimeValue.plan.planId
    ) {
      throw new CrossChainExecutionStateMachineError(
        "PLAN_ID_MISMATCH",
        "Snapshot plan ID does not match this state machine.",
        snapshot.runtime.plan.planId,
      );
    }

    this.runtimeValue =
      freezeRuntime(snapshot.runtime);

    return this.runtimeValue;
  }

  private requireStepIndex(
    stepId: CrossChainIdentifier,
  ): number {
    const index =
      this.runtimeValue.steps.findIndex(
        (step) => step.step.stepId === stepId,
      );

    if (index < 0) {
      throw new CrossChainExecutionStateMachineError(
        "STEP_NOT_FOUND",
        `Step "${stepId}" was not found.`,
        stepId,
      );
    }

    return index;
  }

  private assertDependenciesCompleted(
    runtime: CrossChainExecutionStepRuntime,
  ): void {
    for (
      const dependencyId of
      runtime.step.dependsOnStepIds
    ) {
      const dependency =
        this.runtimeValue.steps.find(
          (step) =>
            step.step.stepId ===
            dependencyId,
        );

      if (
        dependency === undefined ||
        (
          dependency.status !== "COMPLETED" &&
          dependency.status !== "SKIPPED"
        )
      ) {
        throw new CrossChainExecutionStateMachineError(
          "DEPENDENCY_NOT_COMPLETED",
          `Dependency "${dependencyId}" is not completed.`,
          dependencyId,
        );
      }
    }
  }

  private assertMutable(): void {
    if (
      this.runtimeValue.status ===
        "COMPLETED" ||
      this.runtimeValue.status === "FAILED" ||
      this.runtimeValue.status ===
        "EXPIRED" ||
      this.runtimeValue.status ===
        "CANCELLED"
    ) {
      throw new CrossChainExecutionStateMachineError(
        "TERMINAL_RUNTIME",
        `Execution runtime is already terminal with status "${this.runtimeValue.status}".`,
        this.runtimeValue.plan.planId,
      );
    }
  }

  private assertNotExpired(
    timestamp: number,
  ): void {
    if (timestamp >= this.runtimeValue.expiresAt) {
      throw new CrossChainExecutionStateMachineError(
        "PLAN_EXPIRED",
        "Execution plan has expired.",
        this.runtimeValue.plan.planId,
      );
    }
  }

  private validatePlan(
    plan: CrossChainExecutionPlan,
  ): void {
    assertNonEmptyString(
      plan.planId,
      "plan.planId",
    );
    assertNonNegativeInteger(
      plan.createdAt,
      "plan.createdAt",
    );
    assertNonNegativeInteger(
      plan.expiresAt,
      "plan.expiresAt",
    );

    if (plan.steps.length === 0) {
      throw new CrossChainExecutionStateMachineError(
        "EMPTY_PLAN",
        "Execution plan must contain at least one step.",
        plan.planId,
      );
    }

    const seen =
      new Set<CrossChainIdentifier>();

    plan.steps.forEach((step, index) => {
      assertNonEmptyString(
        step.stepId,
        `plan.steps[${index}].stepId`,
      );

      if (seen.has(step.stepId)) {
        throw new CrossChainExecutionStateMachineError(
          "DUPLICATE_STEP_ID",
          `Duplicate step ID "${step.stepId}".`,
          step.stepId,
        );
      }

      seen.add(step.stepId);
    });
  }

  private validateRuntime(
    runtime: CrossChainExecutionRuntime,
  ): void {
    this.validatePlan(runtime.plan);
    assertNonNegativeInteger(
      runtime.version,
      "runtime.version",
    );
    assertNonNegativeInteger(
      runtime.updatedAt,
      "runtime.updatedAt",
    );

    if (
      runtime.steps.length !==
      runtime.plan.steps.length
    ) {
      throw new CrossChainExecutionStateMachineError(
        "RUNTIME_STEP_COUNT_MISMATCH",
        "Runtime step count does not match the execution plan.",
        runtime.plan.planId,
      );
    }
  }
}