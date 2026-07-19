import type {
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import type {
  CrossChainExecutionRuntime,
  CrossChainExecutionStepRuntime,
} from "./cross-chain-execution-state-machine";
import type {
  CrossChainSettlementVerificationResult,
} from "./cross-chain-settlement-verifier";

export type CrossChainRecoveryActionType =
  | "RETRY_STEP"
  | "WAIT_FOR_CONFIRMATIONS"
  | "REQUEST_REFUND"
  | "COMPENSATING_TRANSFER"
  | "REVERIFY_SETTLEMENT"
  | "MANUAL_REVIEW"
  | "NO_ACTION";

export type CrossChainRecoveryPlanStatus =
  | "NOT_REQUIRED"
  | "ACTION_REQUIRED"
  | "MANUAL_REVIEW_REQUIRED"
  | "UNRECOVERABLE";

export interface CrossChainRecoveryCapabilityProjection {
  readonly bridgeId: CrossChainIdentifier;
  readonly supportsRetry: boolean;
  readonly supportsRefund: boolean;
  readonly supportsCompensatingTransfer: boolean;
  readonly maximumRetryCount: number;
  readonly refundDelayMilliseconds: number;
}

export interface CrossChainRecoveryCapabilityAdapter {
  readonly project: (
    runtime: CrossChainExecutionRuntime,
  ) => CrossChainRecoveryCapabilityProjection;
}

export interface CrossChainRecoveryPolicy {
  readonly currentRetryCount?: number;
  readonly maximumRecoveryActions?: number;
  readonly requireManualReviewAfterFailure?: boolean;
  readonly allowCompensatingTransfer?: boolean;
}

export interface CrossChainRecoveryPlanningRequest {
  readonly runtime: CrossChainExecutionRuntime;
  readonly settlement:
    CrossChainSettlementVerificationResult | null;
  readonly plannedAt: number;
  readonly policy?: CrossChainRecoveryPolicy;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CrossChainRecoveryAction {
  readonly actionId: CrossChainIdentifier;
  readonly sequence: number;
  readonly actionType: CrossChainRecoveryActionType;
  readonly stepId: CrossChainIdentifier | null;
  readonly earliestExecutionAt: number;
  readonly reasonCode: string;
  readonly description: string;
  readonly requiresManualApproval: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainRecoveryPlan {
  readonly recoveryPlanId: CrossChainIdentifier;
  readonly executionPlanId: CrossChainIdentifier;
  readonly opportunityId: CrossChainIdentifier;
  readonly bridgeId: CrossChainIdentifier;
  readonly createdAt: number;
  readonly status: CrossChainRecoveryPlanStatus;
  readonly actions: readonly CrossChainRecoveryAction[];
  readonly reasons: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainRecoveryPlannerOptions {
  readonly capabilityAdapter:
    CrossChainRecoveryCapabilityAdapter;
  readonly recoveryPlanIdFactory?: (
    request: CrossChainRecoveryPlanningRequest,
  ) => CrossChainIdentifier;
  readonly actionIdFactory?: (
    recoveryPlanId: CrossChainIdentifier,
    sequence: number,
    actionType: CrossChainRecoveryActionType,
  ) => CrossChainIdentifier;
}

export class CrossChainRecoveryPlanningError
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

    this.name = "CrossChainRecoveryPlanningError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface RecoveryActionDraft {
  readonly actionType: CrossChainRecoveryActionType;
  readonly stepId: CrossChainIdentifier | null;
  readonly earliestExecutionAt: number;
  readonly reasonCode: string;
  readonly description: string;
  readonly requiresManualApproval: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
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

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new CrossChainRecoveryPlanningError(
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
    throw new CrossChainRecoveryPlanningError(
      "INVALID_INTEGER",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CrossChainRecoveryPlanningError(
      "INVALID_INTEGER",
      `${fieldName} must be a positive integer.`,
    );
  }
}

function findFailedStep(
  runtime: CrossChainExecutionRuntime,
): CrossChainExecutionStepRuntime | null {
  return (
    runtime.steps.find(
      (step) => step.status === "FAILED",
    ) ?? null
  );
}

function findActiveOrIncompleteStep(
  runtime: CrossChainExecutionRuntime,
): CrossChainExecutionStepRuntime | null {
  return (
    runtime.steps.find(
      (step) =>
        step.status === "PENDING" ||
        step.status === "READY" ||
        step.status === "BLOCKED",
    ) ?? null
  );
}

export class DeterministicCrossChainRecoveryPlanner {
  private readonly capabilityAdapter:
    CrossChainRecoveryCapabilityAdapter;

  private readonly recoveryPlanIdFactory: (
    request: CrossChainRecoveryPlanningRequest,
  ) => CrossChainIdentifier;

  private readonly actionIdFactory: (
    recoveryPlanId: CrossChainIdentifier,
    sequence: number,
    actionType: CrossChainRecoveryActionType,
  ) => CrossChainIdentifier;

  public constructor(
    options: CrossChainRecoveryPlannerOptions,
  ) {
    if (
      options.capabilityAdapter === null ||
      typeof options.capabilityAdapter !== "object" ||
      typeof options.capabilityAdapter.project !==
        "function"
    ) {
      throw new CrossChainRecoveryPlanningError(
        "INVALID_CAPABILITY_ADAPTER",
        "options.capabilityAdapter.project must be a function.",
      );
    }

    this.capabilityAdapter =
      options.capabilityAdapter;

    this.recoveryPlanIdFactory =
      options.recoveryPlanIdFactory ??
      ((request) =>
        [
          "cross-chain-recovery",
          request.runtime.plan.planId,
          request.plannedAt.toString(),
        ].join(":"));

    this.actionIdFactory =
      options.actionIdFactory ??
      ((
        recoveryPlanId,
        sequence,
        actionType,
      ) =>
        [
          recoveryPlanId,
          sequence.toString().padStart(3, "0"),
          actionType,
        ].join(":"));
  }

  public plan(
    request: CrossChainRecoveryPlanningRequest,
  ): CrossChainRecoveryPlan {
    this.validateRequest(request);

    const capability = Object.freeze({
      ...this.capabilityAdapter.project(
        request.runtime,
      ),
    });

    this.validateCapability(capability);

    const recoveryPlanId =
      this.recoveryPlanIdFactory(request);

    assertNonEmptyString(
      recoveryPlanId,
      "recoveryPlanId",
    );

    const policy = request.policy ?? {};
    const currentRetryCount =
      policy.currentRetryCount ?? 0;
    const maximumRecoveryActions =
      policy.maximumRecoveryActions ?? 10;

    assertNonNegativeInteger(
      currentRetryCount,
      "policy.currentRetryCount",
    );
    assertPositiveInteger(
      maximumRecoveryActions,
      "policy.maximumRecoveryActions",
    );

    const drafts: RecoveryActionDraft[] = [];
    const reasons = new Set<string>();

    const settlement = request.settlement;

    if (
      request.runtime.status === "COMPLETED" &&
      settlement?.status === "VERIFIED"
    ) {
      drafts.push({
        actionType: "NO_ACTION",
        stepId: null,
        earliestExecutionAt:
          request.plannedAt,
        reasonCode: "SETTLEMENT_VERIFIED",
        description:
          "Execution and settlement are already verified.",
        requiresManualApproval: false,
      });
      reasons.add("SETTLEMENT_VERIFIED");
    } else if (
      settlement?.status ===
      "PENDING_CONFIRMATIONS"
    ) {
      drafts.push({
        actionType: "WAIT_FOR_CONFIRMATIONS",
        stepId: null,
        earliestExecutionAt:
          request.plannedAt,
        reasonCode:
          "PENDING_CONFIRMATIONS",
        description:
          "Wait for the required blockchain confirmations before re-verifying settlement.",
        requiresManualApproval: false,
      });
      drafts.push({
        actionType: "REVERIFY_SETTLEMENT",
        stepId: null,
        earliestExecutionAt:
          request.plannedAt,
        reasonCode:
          "REVERIFY_AFTER_CONFIRMATIONS",
        description:
          "Re-run settlement verification after confirmations advance.",
        requiresManualApproval: false,
      });
      reasons.add("PENDING_CONFIRMATIONS");
    } else {
      const failedStep =
        findFailedStep(request.runtime);
      const incompleteStep =
        findActiveOrIncompleteStep(
          request.runtime,
        );

      if (
        failedStep !== null &&
        capability.supportsRetry &&
        currentRetryCount <
          capability.maximumRetryCount
      ) {
        drafts.push({
          actionType: "RETRY_STEP",
          stepId: failedStep.step.stepId,
          earliestExecutionAt:
            request.plannedAt,
          reasonCode: "RETRYABLE_STEP_FAILURE",
          description:
            "Retry the failed execution step using the same deterministic plan context.",
          requiresManualApproval:
            policy
              .requireManualReviewAfterFailure ??
            false,
          metadata: {
            currentRetryCount,
            maximumRetryCount:
              capability.maximumRetryCount,
          },
        });
        reasons.add("RETRYABLE_STEP_FAILURE");
      } else if (
        failedStep !== null &&
        capability.supportsRefund
      ) {
        drafts.push({
          actionType: "REQUEST_REFUND",
          stepId: failedStep.step.stepId,
          earliestExecutionAt:
            request.plannedAt +
            capability.refundDelayMilliseconds,
          reasonCode: "REFUND_AVAILABLE",
          description:
            "Request a bridge refund after the configured refund delay.",
          requiresManualApproval: true,
          metadata: {
            refundDelayMilliseconds:
              capability.refundDelayMilliseconds,
          },
        });
        reasons.add("REFUND_AVAILABLE");
      } else if (
        (
          settlement?.status ===
            "OUTPUT_BELOW_MINIMUM" ||
          settlement?.status ===
            "BALANCE_MISMATCH"
        ) &&
        capability
          .supportsCompensatingTransfer &&
        (
          policy.allowCompensatingTransfer ??
          true
        )
      ) {
        drafts.push({
          actionType:
            "COMPENSATING_TRANSFER",
          stepId: incompleteStep?.step.stepId ?? null,
          earliestExecutionAt:
            request.plannedAt,
          reasonCode:
            "SETTLEMENT_BALANCE_MISMATCH",
          description:
            "Create a compensating transfer to reconcile the settlement balance difference.",
          requiresManualApproval: true,
        });
        reasons.add(
          "SETTLEMENT_BALANCE_MISMATCH",
        );
      } else if (
        request.runtime.status === "EXPIRED"
      ) {
        drafts.push({
          actionType: "MANUAL_REVIEW",
          stepId:
            incompleteStep?.step.stepId ?? null,
          earliestExecutionAt:
            request.plannedAt,
          reasonCode: "EXECUTION_EXPIRED",
          description:
            "Execution expired before completion and requires manual reconciliation.",
          requiresManualApproval: true,
        });
        reasons.add("EXECUTION_EXPIRED");
      } else {
        drafts.push({
          actionType: "MANUAL_REVIEW",
          stepId:
            failedStep?.step.stepId ??
            incompleteStep?.step.stepId ??
            null,
          earliestExecutionAt:
            request.plannedAt,
          reasonCode:
            "AUTOMATED_RECOVERY_UNAVAILABLE",
          description:
            "No supported automated recovery path is available.",
          requiresManualApproval: true,
        });
        reasons.add(
          "AUTOMATED_RECOVERY_UNAVAILABLE",
        );
      }
    }

    const limitedDrafts = drafts.slice(
      0,
      maximumRecoveryActions,
    );

    const seenActionIds =
      new Set<CrossChainIdentifier>();

    const actions =
      limitedDrafts.map(
        (
          draft,
          index,
        ): CrossChainRecoveryAction => {
          const sequence = index + 1;
          const actionId =
            this.actionIdFactory(
              recoveryPlanId,
              sequence,
              draft.actionType,
            );

          assertNonEmptyString(
            actionId,
            `actions[${index}].actionId`,
          );

          if (seenActionIds.has(actionId)) {
            throw new CrossChainRecoveryPlanningError(
              "DUPLICATE_ACTION_ID",
              `Recovery action ID "${actionId}" was generated more than once.`,
              actionId,
            );
          }

          seenActionIds.add(actionId);

          return Object.freeze({
            actionId,
            sequence,
            actionType: draft.actionType,
            stepId: draft.stepId,
            earliestExecutionAt:
              draft.earliestExecutionAt,
            reasonCode: draft.reasonCode,
            description: draft.description,
            requiresManualApproval:
              draft.requiresManualApproval,
            metadata:
              freezeRecord(draft.metadata),
          });
        },
      );

    const status =
      this.derivePlanStatus(actions);

    return Object.freeze({
      recoveryPlanId,
      executionPlanId:
        request.runtime.plan.planId,
      opportunityId:
        request.runtime.plan.opportunityId,
      bridgeId:
        request.runtime.plan.bridgeId,
      createdAt: request.plannedAt,
      status,
      actions: freezeArray(actions),
      reasons: freezeArray(
        [...reasons].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
      metadata: Object.freeze({
        ...request.metadata,
        executionStatus:
          request.runtime.status,
        settlementStatus:
          request.settlement?.status ?? null,
        currentRetryCount,
        maximumRetryCount:
          capability.maximumRetryCount,
      }),
    });
  }

  private derivePlanStatus(
    actions: readonly CrossChainRecoveryAction[],
  ): CrossChainRecoveryPlanStatus {
    if (
      actions.length === 1 &&
      actions[0].actionType === "NO_ACTION"
    ) {
      return "NOT_REQUIRED";
    }

    if (
      actions.some(
        (action) =>
          action.actionType ===
          "MANUAL_REVIEW",
      )
    ) {
      return "MANUAL_REVIEW_REQUIRED";
    }

    if (actions.length === 0) {
      return "UNRECOVERABLE";
    }

    return "ACTION_REQUIRED";
  }

  private validateRequest(
    request: CrossChainRecoveryPlanningRequest,
  ): void {
    assertNonNegativeInteger(
      request.plannedAt,
      "request.plannedAt",
    );

    if (
      request.plannedAt <
      request.runtime.updatedAt
    ) {
      throw new CrossChainRecoveryPlanningError(
        "NON_MONOTONIC_TIMESTAMP",
        "plannedAt must not be earlier than runtime.updatedAt.",
        request.runtime.plan.planId,
      );
    }

    assertNonEmptyString(
      request.runtime.plan.planId,
      "runtime.plan.planId",
    );
    assertNonEmptyString(
      request.runtime.plan.opportunityId,
      "runtime.plan.opportunityId",
    );
    assertNonEmptyString(
      request.runtime.plan.bridgeId,
      "runtime.plan.bridgeId",
    );

    if (
      request.settlement !== null &&
      request.settlement.planId !==
        request.runtime.plan.planId
    ) {
      throw new CrossChainRecoveryPlanningError(
        "SETTLEMENT_PLAN_MISMATCH",
        "Settlement verification plan ID does not match the execution runtime.",
        request.settlement.planId,
      );
    }
  }

  private validateCapability(
    capability:
      CrossChainRecoveryCapabilityProjection,
  ): void {
    assertNonEmptyString(
      capability.bridgeId,
      "capability.bridgeId",
    );
    assertNonNegativeInteger(
      capability.maximumRetryCount,
      "capability.maximumRetryCount",
    );
    assertNonNegativeInteger(
      capability.refundDelayMilliseconds,
      "capability.refundDelayMilliseconds",
    );
  }
}