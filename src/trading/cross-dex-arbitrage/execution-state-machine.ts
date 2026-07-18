/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic execution lifecycle state machine for cross-DEX arbitrage.
 *
 * Responsibilities:
 * - Enforce valid execution-status transitions.
 * - Preserve immutable execution snapshots.
 * - Record deterministic transition history.
 * - Prevent mutation of terminal executions.
 * - Support idempotent transition requests.
 * - Attach structured metadata and failure context to transitions.
 *
 * This module performs no network, RPC, wallet, filesystem, or clock access.
 */

import {
  ArbitrageExecutionStatus,
  CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES,
  type ArbitrageExecution,
  type ArbitrageExecutionId,
  type CrossDexArbitrageMetadata,
  type RevertAnalysis,
  type UnixTimestampMilliseconds,
  type ValidationIssue,
} from "./cross-dex-arbitrage-contracts";

export enum ExecutionStateMachineErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_EXECUTION = "INVALID_EXECUTION",
  INVALID_TRANSITION_REQUEST = "INVALID_TRANSITION_REQUEST",
  INVALID_TRANSITION = "INVALID_TRANSITION",
  TERMINAL_STATE = "TERMINAL_STATE",
  TIMESTAMP_REGRESSION = "TIMESTAMP_REGRESSION",
  EXECUTION_ID_MISMATCH = "EXECUTION_ID_MISMATCH",
  STATUS_MISMATCH = "STATUS_MISMATCH",
  DUPLICATE_TRANSITION_ID = "DUPLICATE_TRANSITION_ID",
}

export class ExecutionStateMachineError extends Error {
  public readonly code: ExecutionStateMachineErrorCode;
  public readonly executionId?: ArbitrageExecutionId;
  public readonly fromStatus?: ArbitrageExecutionStatus;
  public readonly toStatus?: ArbitrageExecutionStatus;
  public readonly details?: unknown;

  public constructor(
    code: ExecutionStateMachineErrorCode,
    message: string,
    options: Readonly<{
      executionId?: ArbitrageExecutionId;
      fromStatus?: ArbitrageExecutionStatus;
      toStatus?: ArbitrageExecutionStatus;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "ExecutionStateMachineError";
    this.code = code;
    this.executionId = options.executionId;
    this.fromStatus = options.fromStatus;
    this.toStatus = options.toStatus;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ExecutionStateMachineClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface ExecutionTransitionRequest {
  readonly transitionId: string;
  readonly executionId: ArbitrageExecutionId;
  readonly expectedCurrentStatus?: ArbitrageExecutionStatus;
  readonly targetStatus: ArbitrageExecutionStatus;
  readonly occurredAtMilliseconds?: UnixTimestampMilliseconds;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly revertAnalysis?: RevertAnalysis;
  readonly validationIssues?: readonly ValidationIssue[];
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionTransitionRecord {
  readonly sequence: number;
  readonly transitionId: string;
  readonly executionId: ArbitrageExecutionId;
  readonly fromStatus: ArbitrageExecutionStatus;
  readonly toStatus: ArbitrageExecutionStatus;
  readonly occurredAtMilliseconds: UnixTimestampMilliseconds;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly terminal: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionStateSnapshot {
  readonly execution: ArbitrageExecution;
  readonly transitionHistory: readonly ExecutionTransitionRecord[];
  readonly terminal: boolean;
  readonly version: number;
  readonly lastTransitionId?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionStateMachineOptions {
  readonly allowIdempotentTransitions?: boolean;
  readonly rejectTimestampRegression?: boolean;
  readonly preserveExistingFailureTimestamp?: boolean;
}

interface NormalizedOptions {
  readonly allowIdempotentTransitions: boolean;
  readonly rejectTimestampRegression: boolean;
  readonly preserveExistingFailureTimestamp: boolean;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  allowIdempotentTransitions: true,
  rejectTimestampRegression: true,
  preserveExistingFailureTimestamp: true,
});

const ALLOWED_TRANSITIONS: Readonly<
  Record<
    ArbitrageExecutionStatus,
    ReadonlySet<ArbitrageExecutionStatus>
  >
> = Object.freeze({
  [ArbitrageExecutionStatus.CREATED]: new Set([
    ArbitrageExecutionStatus.VALIDATING,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.VALIDATING]: new Set([
    ArbitrageExecutionStatus.SIMULATING,
    ArbitrageExecutionStatus.SIGNING,
    ArbitrageExecutionStatus.PAPER_EXECUTED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.SIMULATING]: new Set([
    ArbitrageExecutionStatus.SIMULATION_SUCCEEDED,
    ArbitrageExecutionStatus.SIMULATION_FAILED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.SIMULATION_SUCCEEDED]: new Set([
    ArbitrageExecutionStatus.SIGNING,
    ArbitrageExecutionStatus.PAPER_EXECUTED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.SIMULATION_FAILED]: new Set([
    ArbitrageExecutionStatus.SIMULATING,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.SIGNING]: new Set([
    ArbitrageExecutionStatus.SUBMITTING,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.SUBMITTING]: new Set([
    ArbitrageExecutionStatus.SUBMITTED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.SUBMITTED]: new Set([
    ArbitrageExecutionStatus.PENDING,
    ArbitrageExecutionStatus.CONFIRMED,
    ArbitrageExecutionStatus.REVERTED,
    ArbitrageExecutionStatus.DROPPED,
    ArbitrageExecutionStatus.REPLACED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.PENDING]: new Set([
    ArbitrageExecutionStatus.CONFIRMED,
    ArbitrageExecutionStatus.REVERTED,
    ArbitrageExecutionStatus.DROPPED,
    ArbitrageExecutionStatus.REPLACED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.REPLACED]: new Set([
    ArbitrageExecutionStatus.SUBMITTING,
    ArbitrageExecutionStatus.SUBMITTED,
    ArbitrageExecutionStatus.PENDING,
    ArbitrageExecutionStatus.CONFIRMED,
    ArbitrageExecutionStatus.REVERTED,
    ArbitrageExecutionStatus.DROPPED,
    ArbitrageExecutionStatus.CANCELLED,
    ArbitrageExecutionStatus.EXPIRED,
    ArbitrageExecutionStatus.FAILED,
  ]),
  [ArbitrageExecutionStatus.CONFIRMED]: new Set<ArbitrageExecutionStatus>(),
  [ArbitrageExecutionStatus.REVERTED]: new Set<ArbitrageExecutionStatus>(),
  [ArbitrageExecutionStatus.DROPPED]: new Set<ArbitrageExecutionStatus>(),
  [ArbitrageExecutionStatus.CANCELLED]: new Set<ArbitrageExecutionStatus>(),
  [ArbitrageExecutionStatus.EXPIRED]: new Set<ArbitrageExecutionStatus>(),
  [ArbitrageExecutionStatus.PAPER_EXECUTED]: new Set<ArbitrageExecutionStatus>(),
  [ArbitrageExecutionStatus.FAILED]: new Set<ArbitrageExecutionStatus>(),
});

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function mergeMetadata(
  ...sources: readonly (
    | CrossDexArbitrageMetadata
    | undefined
  )[]
): CrossDexArbitrageMetadata | undefined {
  const present = sources.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  return present.length === 0
    ? undefined
    : Object.freeze(Object.assign({}, ...present));
}

function cloneValidationIssues(
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  return Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        ...issue,
        metadata: freezeMetadata(issue.metadata),
      }),
    ),
  );
}

function isTerminal(
  status: ArbitrageExecutionStatus,
): boolean {
  return CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES.has(
    status,
  );
}

function assertExecution(
  execution: ArbitrageExecution,
): void {
  if (
    execution === null ||
    typeof execution !== "object" ||
    execution.id === undefined
  ) {
    throw new ExecutionStateMachineError(
      ExecutionStateMachineErrorCode.INVALID_EXECUTION,
      "A valid arbitrage execution is required.",
    );
  }

  if (
    !Object.values(ArbitrageExecutionStatus).includes(
      execution.status,
    )
  ) {
    throw new ExecutionStateMachineError(
      ExecutionStateMachineErrorCode.INVALID_EXECUTION,
      "Execution status is invalid.",
      {
        executionId: execution.id,
        details: execution.status,
      },
    );
  }
}

function cloneExecution(
  execution: ArbitrageExecution,
): ArbitrageExecution {
  return Object.freeze({
    ...execution,
    validationIssues: cloneValidationIssues(
      execution.validationIssues,
    ),
    metadata: freezeMetadata(execution.metadata),
  });
}

export class ExecutionStateMachine {
  private readonly options: NormalizedOptions;
  private snapshot: ExecutionStateSnapshot;
  private readonly seenTransitionIds = new Set<string>();

  public constructor(
    execution: ArbitrageExecution,
    private readonly clock: ExecutionStateMachineClock,
    options: ExecutionStateMachineOptions = {},
  ) {
    assertExecution(execution);

    if (
      clock === null ||
      typeof clock !== "object" ||
      typeof clock.nowMilliseconds !== "function"
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_DEPENDENCIES,
        "A deterministic clock is required.",
        { executionId: execution.id },
      );
    }

    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });

    const initialExecution = cloneExecution(execution);

    this.snapshot = Object.freeze({
      execution: initialExecution,
      transitionHistory: Object.freeze([]),
      terminal: isTerminal(initialExecution.status),
      version: 0,
      metadata: freezeMetadata(initialExecution.metadata),
    });
  }

  public getSnapshot(): ExecutionStateSnapshot {
    return this.snapshot;
  }

  public getExecution(): ArbitrageExecution {
    return this.snapshot.execution;
  }

  public getStatus(): ArbitrageExecutionStatus {
    return this.snapshot.execution.status;
  }

  public isTerminal(): boolean {
    return this.snapshot.terminal;
  }

  public canTransitionTo(
    targetStatus: ArbitrageExecutionStatus,
  ): boolean {
    const currentStatus = this.getStatus();

    if (
      targetStatus === currentStatus &&
      this.options.allowIdempotentTransitions
    ) {
      return true;
    }

    return ALLOWED_TRANSITIONS[currentStatus].has(
      targetStatus,
    );
  }

  public transition(
    request: ExecutionTransitionRequest,
  ): ExecutionStateSnapshot {
    this.validateTransitionRequest(request);

    const current = this.snapshot;
    const currentExecution = current.execution;
    const currentStatus = currentExecution.status;
    const targetStatus = request.targetStatus;

    if (request.executionId !== currentExecution.id) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.EXECUTION_ID_MISMATCH,
        "Transition executionId does not match the managed execution.",
        {
          executionId: currentExecution.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          details: request.executionId,
        },
      );
    }

    if (
      request.expectedCurrentStatus !== undefined &&
      request.expectedCurrentStatus !== currentStatus
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.STATUS_MISMATCH,
        `Expected current status ${request.expectedCurrentStatus}, but found ${currentStatus}.`,
        {
          executionId: currentExecution.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
        },
      );
    }

    if (this.seenTransitionIds.has(request.transitionId)) {
      if (
        this.options.allowIdempotentTransitions &&
        current.lastTransitionId === request.transitionId &&
        currentStatus === targetStatus
      ) {
        return current;
      }

      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.DUPLICATE_TRANSITION_ID,
        `Transition id ${request.transitionId} has already been used.`,
        {
          executionId: currentExecution.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
        },
      );
    }

    if (
      current.terminal &&
      targetStatus !== currentStatus
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.TERMINAL_STATE,
        `Execution is terminal in status ${currentStatus}.`,
        {
          executionId: currentExecution.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
        },
      );
    }

    if (targetStatus === currentStatus) {
      if (!this.options.allowIdempotentTransitions) {
        throw new ExecutionStateMachineError(
          ExecutionStateMachineErrorCode.INVALID_TRANSITION,
          `Idempotent transition to ${targetStatus} is disabled.`,
          {
            executionId: currentExecution.id,
            fromStatus: currentStatus,
            toStatus: targetStatus,
          },
        );
      }

      this.seenTransitionIds.add(request.transitionId);
      return current;
    }

    if (!this.canTransitionTo(targetStatus)) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION,
        `Transition from ${currentStatus} to ${targetStatus} is not allowed.`,
        {
          executionId: currentExecution.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
        },
      );
    }

    const occurredAtMilliseconds =
      request.occurredAtMilliseconds ??
      this.clock.nowMilliseconds();

    if (
      this.options.rejectTimestampRegression &&
      occurredAtMilliseconds <
        currentExecution.updatedAtMilliseconds
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.TIMESTAMP_REGRESSION,
        "Transition timestamp cannot precede the current execution update timestamp.",
        {
          executionId: currentExecution.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          details: Object.freeze({
            occurredAtMilliseconds,
            updatedAtMilliseconds:
              currentExecution.updatedAtMilliseconds,
          }),
        },
      );
    }

    const mergedIssues =
      request.validationIssues === undefined
        ? currentExecution.validationIssues
        : cloneValidationIssues([
            ...currentExecution.validationIssues,
            ...request.validationIssues,
          ]);

    const failedAtMilliseconds =
      targetStatus === ArbitrageExecutionStatus.FAILED ||
      targetStatus === ArbitrageExecutionStatus.REVERTED ||
      targetStatus === ArbitrageExecutionStatus.DROPPED
        ? this.options.preserveExistingFailureTimestamp
          ? currentExecution.failedAtMilliseconds ??
            occurredAtMilliseconds
          : occurredAtMilliseconds
        : currentExecution.failedAtMilliseconds;

    const confirmedAtMilliseconds =
      targetStatus === ArbitrageExecutionStatus.CONFIRMED
        ? currentExecution.confirmedAtMilliseconds ??
          occurredAtMilliseconds
        : currentExecution.confirmedAtMilliseconds;

    const submittedAtMilliseconds =
      targetStatus === ArbitrageExecutionStatus.SUBMITTED ||
      targetStatus === ArbitrageExecutionStatus.PENDING
        ? currentExecution.submittedAtMilliseconds ??
          occurredAtMilliseconds
        : currentExecution.submittedAtMilliseconds;

    const metadata = mergeMetadata(
      currentExecution.metadata,
      request.metadata,
      Object.freeze({
        lastTransitionId: request.transitionId,
        lastTransitionFrom: currentStatus,
        lastTransitionTo: targetStatus,
        ...(request.reason === undefined
          ? {}
          : { lastTransitionReason: request.reason }),
        ...(request.errorCode === undefined
          ? {}
          : { lastErrorCode: request.errorCode }),
        ...(request.errorMessage === undefined
          ? {}
          : { lastErrorMessage: request.errorMessage }),
      }),
    );

    const nextExecution: ArbitrageExecution =
      Object.freeze({
        ...currentExecution,
        status: targetStatus,
        revertAnalysis:
          request.revertAnalysis ??
          currentExecution.revertAnalysis,
        validationIssues: mergedIssues,
        updatedAtMilliseconds: occurredAtMilliseconds,
        submittedAtMilliseconds,
        confirmedAtMilliseconds,
        failedAtMilliseconds,
        metadata,
      });

    const record: ExecutionTransitionRecord =
      Object.freeze({
        sequence: current.version + 1,
        transitionId: request.transitionId,
        executionId: currentExecution.id,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        occurredAtMilliseconds,
        reason: request.reason,
        errorCode: request.errorCode,
        errorMessage: request.errorMessage,
        terminal: isTerminal(targetStatus),
        metadata: freezeMetadata(request.metadata),
      });

    this.seenTransitionIds.add(request.transitionId);

    this.snapshot = Object.freeze({
      execution: nextExecution,
      transitionHistory: Object.freeze([
        ...current.transitionHistory,
        record,
      ]),
      terminal: record.terminal,
      version: current.version + 1,
      lastTransitionId: request.transitionId,
      metadata: mergeMetadata(
        current.metadata,
        request.metadata,
      ),
    });

    return this.snapshot;
  }

  public transitionMany(
    requests: readonly ExecutionTransitionRequest[],
  ): ExecutionStateSnapshot {
    if (!Array.isArray(requests)) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "Transition requests must be an array.",
        { executionId: this.getExecution().id },
      );
    }

    let result = this.snapshot;

    for (const request of requests) {
      result = this.transition(request);
    }

    return result;
  }

  public static getAllowedTransitions(
    status: ArbitrageExecutionStatus,
  ): readonly ArbitrageExecutionStatus[] {
    if (
      !Object.values(ArbitrageExecutionStatus).includes(
        status,
      )
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "Status is invalid.",
        { details: status },
      );
    }

    return Object.freeze([
      ...ALLOWED_TRANSITIONS[status],
    ]);
  }

  private validateTransitionRequest(
    request: ExecutionTransitionRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "A transition request is required.",
        { executionId: this.getExecution().id },
      );
    }

    if (
      typeof request.transitionId !== "string" ||
      request.transitionId.trim().length === 0
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "transitionId must be a non-empty string.",
        { executionId: this.getExecution().id },
      );
    }

    if (
      !Object.values(ArbitrageExecutionStatus).includes(
        request.targetStatus,
      )
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "targetStatus is invalid.",
        {
          executionId: this.getExecution().id,
          details: request.targetStatus,
        },
      );
    }

    if (
      request.expectedCurrentStatus !== undefined &&
      !Object.values(ArbitrageExecutionStatus).includes(
        request.expectedCurrentStatus,
      )
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "expectedCurrentStatus is invalid.",
        {
          executionId: this.getExecution().id,
          details: request.expectedCurrentStatus,
        },
      );
    }

    if (
      request.occurredAtMilliseconds !== undefined &&
      (!Number.isSafeInteger(
        request.occurredAtMilliseconds,
      ) ||
        request.occurredAtMilliseconds < 0)
    ) {
      throw new ExecutionStateMachineError(
        ExecutionStateMachineErrorCode.INVALID_TRANSITION_REQUEST,
        "occurredAtMilliseconds must be a non-negative safe integer.",
        { executionId: this.getExecution().id },
      );
    }
  }
}

export function createExecutionStateMachine(
  execution: ArbitrageExecution,
  clock: ExecutionStateMachineClock,
  options: ExecutionStateMachineOptions = {},
): ExecutionStateMachine {
  return new ExecutionStateMachine(
    execution,
    clock,
    options,
  );
}

export {
  ExecutionStateMachine as CrossDexExecutionStateMachine,
};