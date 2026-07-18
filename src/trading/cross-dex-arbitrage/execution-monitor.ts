/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic execution monitor for submitted cross-DEX arbitrage
 * transactions.
 *
 * Responsibilities:
 * - Poll execution tracking providers.
 * - Convert tracking observations into lifecycle transitions.
 * - Detect confirmations, reverts, drops, replacements, and expiry.
 * - Enforce confirmation-depth and monitoring-time policies.
 * - Preserve immutable monitoring history.
 * - Remain independent from concrete RPC providers and schedulers.
 */

import {
  ArbitrageExecutionStatus,
  CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES,
  type ArbitrageExecution,
  type ArbitrageExecutionId,
  type BlockNumber,
  type CrossDexArbitrageMetadata,
  type EvmTransactionReceipt,
  type ExecutionTracker,
  type ExecutionTrackingSnapshot,
  type TransactionHash,
  type UnixTimestampMilliseconds,
} from "./cross-dex-arbitrage-contracts";
import {
  ExecutionStateMachine,
  type ExecutionStateSnapshot,
  type ExecutionTransitionRequest,
} from "./execution-state-machine";

export enum ExecutionMonitorErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_EXECUTION = "INVALID_EXECUTION",
  EXECUTION_NOT_SUBMITTED = "EXECUTION_NOT_SUBMITTED",
  MISSING_TRANSACTION_HASH = "MISSING_TRANSACTION_HASH",
  TRACKING_FAILED = "TRACKING_FAILED",
  TRACKER_RESPONSE_MISMATCH = "TRACKER_RESPONSE_MISMATCH",
  INVALID_TRACKING_SNAPSHOT = "INVALID_TRACKING_SNAPSHOT",
  MONITORING_EXPIRED = "MONITORING_EXPIRED",
  MAXIMUM_POLLS_REACHED = "MAXIMUM_POLLS_REACHED",
  TRANSITION_FAILED = "TRANSITION_FAILED",
}

export class ExecutionMonitorError extends Error {
  public readonly code: ExecutionMonitorErrorCode;
  public readonly executionId?: ArbitrageExecutionId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: ExecutionMonitorErrorCode,
    message: string,
    options: Readonly<{
      executionId?: ArbitrageExecutionId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "ExecutionMonitorError";
    this.code = code;
    this.executionId = options.executionId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ExecutionMonitorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface ExecutionReceiptProvider {
  getReceipt(
    transactionHash: TransactionHash,
  ): Promise<EvmTransactionReceipt | undefined>;
}

export interface ExecutionMonitorOptions {
  readonly requiredConfirmationCount?: number;
  readonly maximumMonitoringDurationMilliseconds?: number;
  readonly maximumPollCount?: number;
  readonly treatDroppedAsTerminal?: boolean;
  readonly treatExpiredAsTerminal?: boolean;
  readonly transitionSubmittedToPending?: boolean;
  readonly requireReceiptForConfirmation?: boolean;
}

interface NormalizedOptions {
  readonly requiredConfirmationCount: number;
  readonly maximumMonitoringDurationMilliseconds: number;
  readonly maximumPollCount: number;
  readonly treatDroppedAsTerminal: boolean;
  readonly treatExpiredAsTerminal: boolean;
  readonly transitionSubmittedToPending: boolean;
  readonly requireReceiptForConfirmation: boolean;
}

export interface ExecutionMonitoringObservation {
  readonly pollNumber: number;
  readonly executionId: ArbitrageExecutionId;
  readonly observedAtMilliseconds: UnixTimestampMilliseconds;
  readonly tracking: ExecutionTrackingSnapshot;
  readonly receipt?: EvmTransactionReceipt;
  readonly resultingStatus: ArbitrageExecutionStatus;
  readonly terminal: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionMonitoringResult {
  readonly snapshot: ExecutionStateSnapshot;
  readonly observations: readonly ExecutionMonitoringObservation[];
  readonly pollCount: number;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly terminal: boolean;
  readonly expired: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionMonitorPollRequest {
  readonly stateMachine: ExecutionStateMachine;
  readonly startedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly pollNumber?: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  requiredConfirmationCount: 1,
  maximumMonitoringDurationMilliseconds: 120_000,
  maximumPollCount: 120,
  treatDroppedAsTerminal: true,
  treatExpiredAsTerminal: true,
  transitionSubmittedToPending: true,
  requireReceiptForConfirmation: true,
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

function normalizeOptions(
  options: ExecutionMonitorOptions,
): NormalizedOptions {
  const normalized = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const positiveIntegers: ReadonlyArray<
    readonly [string, number]
  > = [
    [
      "requiredConfirmationCount",
      normalized.requiredConfirmationCount,
    ],
    [
      "maximumMonitoringDurationMilliseconds",
      normalized.maximumMonitoringDurationMilliseconds,
    ],
    ["maximumPollCount", normalized.maximumPollCount],
  ];

  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.INVALID_OPTIONS,
        `${name} must be a positive safe integer.`,
        { details: value },
      );
    }
  }

  return Object.freeze(normalized);
}

function isMonitorableStatus(
  status: ArbitrageExecutionStatus,
): boolean {
  return (
    status === ArbitrageExecutionStatus.SUBMITTED ||
    status === ArbitrageExecutionStatus.PENDING ||
    status === ArbitrageExecutionStatus.REPLACED
  );
}

function isTerminalStatus(
  status: ArbitrageExecutionStatus,
): boolean {
  return CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES.has(
    status,
  );
}

function resolveTransactionHash(
  execution: ArbitrageExecution,
): TransactionHash | undefined {
  return (
    execution.submission?.transactionHash ??
    execution.signedTransaction?.transactionHash
  );
}

function validateTrackingSnapshot(
  snapshot: ExecutionTrackingSnapshot,
  executionId: ArbitrageExecutionId,
): void {
  if (
    snapshot === null ||
    typeof snapshot !== "object"
  ) {
    throw new ExecutionMonitorError(
      ExecutionMonitorErrorCode.INVALID_TRACKING_SNAPSHOT,
      "Execution tracker returned an invalid snapshot.",
      { executionId },
    );
  }

  if (snapshot.executionId !== executionId) {
    throw new ExecutionMonitorError(
      ExecutionMonitorErrorCode.TRACKER_RESPONSE_MISMATCH,
      "Execution tracker returned a mismatched executionId.",
      {
        executionId,
        details: snapshot.executionId,
      },
    );
  }

  if (
    !Object.values(ArbitrageExecutionStatus).includes(
      snapshot.status,
    )
  ) {
    throw new ExecutionMonitorError(
      ExecutionMonitorErrorCode.INVALID_TRACKING_SNAPSHOT,
      "Execution tracker returned an invalid status.",
      {
        executionId,
        details: snapshot.status,
      },
    );
  }

  if (
    !Number.isSafeInteger(snapshot.confirmationCount) ||
    snapshot.confirmationCount < 0 ||
    !Number.isSafeInteger(snapshot.replacementCount) ||
    snapshot.replacementCount < 0
  ) {
    throw new ExecutionMonitorError(
      ExecutionMonitorErrorCode.INVALID_TRACKING_SNAPSHOT,
      "Tracking counters must be non-negative safe integers.",
      {
        executionId,
        details: snapshot,
      },
    );
  }
}

export class ExecutionMonitor {
  private readonly options: NormalizedOptions;

  public constructor(
    private readonly tracker: ExecutionTracker,
    private readonly receiptProvider: ExecutionReceiptProvider,
    private readonly clock: ExecutionMonitorClock,
    options: ExecutionMonitorOptions = {},
  ) {
    const dependencies: ReadonlyArray<
      readonly [string, unknown, string]
    > = [
      ["tracker", tracker, "track"],
      ["receiptProvider", receiptProvider, "getReceipt"],
      ["clock", clock, "nowMilliseconds"],
    ];

    for (const [name, dependency, method] of dependencies) {
      if (
        dependency === null ||
        typeof dependency !== "object" ||
        typeof (dependency as Record<string, unknown>)[method] !==
          "function"
      ) {
        throw new ExecutionMonitorError(
          ExecutionMonitorErrorCode.INVALID_DEPENDENCIES,
          `${name} must implement ${method}().`,
        );
      }
    }

    this.options = normalizeOptions(options);
  }

  public async poll(
    request: ExecutionMonitorPollRequest,
  ): Promise<ExecutionMonitoringObservation> {
    this.validatePollRequest(request);

    const stateMachine = request.stateMachine;
    const execution = stateMachine.getExecution();
    const transactionHash = resolveTransactionHash(execution);

    if (transactionHash === undefined) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.MISSING_TRANSACTION_HASH,
        "A submitted execution must have a transaction hash.",
        { executionId: execution.id },
      );
    }

    let tracking: ExecutionTrackingSnapshot;

    try {
      tracking = await this.tracker.track(execution);
    } catch (cause) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.TRACKING_FAILED,
        "Execution tracking failed.",
        {
          executionId: execution.id,
          cause,
        },
      );
    }

    validateTrackingSnapshot(tracking, execution.id);

    let receipt: EvmTransactionReceipt | undefined;

    if (
      tracking.status === ArbitrageExecutionStatus.CONFIRMED ||
      tracking.status === ArbitrageExecutionStatus.REVERTED ||
      tracking.confirmationCount >=
        this.options.requiredConfirmationCount
    ) {
      try {
        receipt = await this.receiptProvider.getReceipt(
          transactionHash,
        );
      } catch (cause) {
        throw new ExecutionMonitorError(
          ExecutionMonitorErrorCode.TRACKING_FAILED,
          "Transaction receipt retrieval failed.",
          {
            executionId: execution.id,
            cause,
          },
        );
      }
    }

    const observedAtMilliseconds =
      this.clock.nowMilliseconds();
    const targetStatus = this.resolveTargetStatus(
      execution.status,
      tracking,
      receipt,
    );

    if (targetStatus !== execution.status) {
      const transition: ExecutionTransitionRequest =
        Object.freeze({
          transitionId: [
            "monitor",
            String(execution.id),
            String(request.pollNumber ?? 1),
            targetStatus,
          ].join(":"),
          executionId: execution.id,
          expectedCurrentStatus: execution.status,
          targetStatus,
          occurredAtMilliseconds: observedAtMilliseconds,
          reason: this.describeTransition(
            targetStatus,
            tracking,
            receipt,
          ),
          errorCode: tracking.errorCode,
          errorMessage: tracking.errorMessage,
          revertAnalysis: receipt?.revertAnalysis,
          metadata: mergeMetadata(
            request.metadata,
            tracking.metadata,
            receipt?.metadata,
            Object.freeze({
              confirmationCount:
                tracking.confirmationCount,
              replacementCount:
                tracking.replacementCount,
              transactionHash:
                tracking.transactionHash ??
                transactionHash,
            }),
          ),
        });

      try {
        stateMachine.transition(transition);
      } catch (cause) {
        throw new ExecutionMonitorError(
          ExecutionMonitorErrorCode.TRANSITION_FAILED,
          `Failed to transition execution to ${targetStatus}.`,
          {
            executionId: execution.id,
            details: transition,
            cause,
          },
        );
      }
    }

    const resultingStatus =
      stateMachine.getExecution().status;

    return Object.freeze({
      pollNumber: request.pollNumber ?? 1,
      executionId: execution.id,
      observedAtMilliseconds,
      tracking,
      receipt,
      resultingStatus,
      terminal: isTerminalStatus(resultingStatus),
      metadata: mergeMetadata(
        request.metadata,
        tracking.metadata,
        receipt?.metadata,
      ),
    });
  }

  public async monitor(
    stateMachine: ExecutionStateMachine,
    metadata?: CrossDexArbitrageMetadata,
  ): Promise<ExecutionMonitoringResult> {
    if (
      stateMachine === null ||
      typeof stateMachine !== "object"
    ) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.INVALID_EXECUTION,
        "An execution state machine is required.",
      );
    }

    const execution = stateMachine.getExecution();

    if (stateMachine.isTerminal()) {
      const now = this.clock.nowMilliseconds();

      return Object.freeze({
        snapshot: stateMachine.getSnapshot(),
        observations: Object.freeze([]),
        pollCount: 0,
        startedAtMilliseconds: now,
        completedAtMilliseconds: now,
        terminal: true,
        expired: false,
        metadata: freezeMetadata(metadata),
      });
    }

    if (!isMonitorableStatus(execution.status)) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.EXECUTION_NOT_SUBMITTED,
        `Execution status ${execution.status} cannot be monitored.`,
        { executionId: execution.id },
      );
    }

    const startedAtMilliseconds =
      this.clock.nowMilliseconds();
    const observations: ExecutionMonitoringObservation[] = [];

    for (
      let pollNumber = 1;
      pollNumber <= this.options.maximumPollCount;
      pollNumber += 1
    ) {
      const now = this.clock.nowMilliseconds();
      const elapsed =
        Number(now) - Number(startedAtMilliseconds);

      if (
        elapsed >=
        this.options.maximumMonitoringDurationMilliseconds
      ) {
        this.transitionToExpired(
          stateMachine,
          pollNumber,
          now,
          "Maximum monitoring duration elapsed.",
          metadata,
        );

        return Object.freeze({
          snapshot: stateMachine.getSnapshot(),
          observations: Object.freeze([
            ...observations,
          ]),
          pollCount: observations.length,
          startedAtMilliseconds,
          completedAtMilliseconds: now,
          terminal: stateMachine.isTerminal(),
          expired: true,
          metadata: freezeMetadata(metadata),
        });
      }

      const observation = await this.poll({
        stateMachine,
        startedAtMilliseconds,
        pollNumber,
        metadata,
      });

      observations.push(observation);

      if (observation.terminal) {
        return Object.freeze({
          snapshot: stateMachine.getSnapshot(),
          observations: Object.freeze([
            ...observations,
          ]),
          pollCount: observations.length,
          startedAtMilliseconds,
          completedAtMilliseconds:
            observation.observedAtMilliseconds,
          terminal: true,
          expired:
            observation.resultingStatus ===
            ArbitrageExecutionStatus.EXPIRED,
          metadata: freezeMetadata(metadata),
        });
      }
    }

    const completedAtMilliseconds =
      this.clock.nowMilliseconds();

    if (this.options.treatExpiredAsTerminal) {
      this.transitionToExpired(
        stateMachine,
        this.options.maximumPollCount + 1,
        completedAtMilliseconds,
        "Maximum poll count reached.",
        metadata,
      );
    }

    return Object.freeze({
      snapshot: stateMachine.getSnapshot(),
      observations: Object.freeze([...observations]),
      pollCount: observations.length,
      startedAtMilliseconds,
      completedAtMilliseconds,
      terminal: stateMachine.isTerminal(),
      expired:
        stateMachine.getStatus() ===
        ArbitrageExecutionStatus.EXPIRED,
      metadata: freezeMetadata(metadata),
    });
  }

  private resolveTargetStatus(
    currentStatus: ArbitrageExecutionStatus,
    tracking: ExecutionTrackingSnapshot,
    receipt: EvmTransactionReceipt | undefined,
  ): ArbitrageExecutionStatus {
    if (
      receipt !== undefined &&
      receipt.status === false
    ) {
      return ArbitrageExecutionStatus.REVERTED;
    }

    if (
      receipt !== undefined &&
      receipt.status === true &&
      tracking.confirmationCount >=
        this.options.requiredConfirmationCount
    ) {
      return ArbitrageExecutionStatus.CONFIRMED;
    }

    if (
      tracking.status ===
      ArbitrageExecutionStatus.CONFIRMED
    ) {
      if (
        this.options.requireReceiptForConfirmation &&
        receipt === undefined
      ) {
        return ArbitrageExecutionStatus.PENDING;
      }

      return tracking.confirmationCount >=
        this.options.requiredConfirmationCount
        ? ArbitrageExecutionStatus.CONFIRMED
        : ArbitrageExecutionStatus.PENDING;
    }

    if (
      tracking.status ===
      ArbitrageExecutionStatus.REVERTED
    ) {
      return ArbitrageExecutionStatus.REVERTED;
    }

    if (
      tracking.status ===
      ArbitrageExecutionStatus.DROPPED
    ) {
      return this.options.treatDroppedAsTerminal
        ? ArbitrageExecutionStatus.DROPPED
        : currentStatus;
    }

    if (
      tracking.status ===
      ArbitrageExecutionStatus.REPLACED ||
      tracking.replacementCount > 0
    ) {
      return ArbitrageExecutionStatus.REPLACED;
    }

    if (
      tracking.status ===
        ArbitrageExecutionStatus.PENDING ||
      (currentStatus ===
        ArbitrageExecutionStatus.SUBMITTED &&
        this.options.transitionSubmittedToPending)
    ) {
      return ArbitrageExecutionStatus.PENDING;
    }

    return currentStatus;
  }

  private transitionToExpired(
    stateMachine: ExecutionStateMachine,
    sequence: number,
    occurredAtMilliseconds: UnixTimestampMilliseconds,
    reason: string,
    metadata?: CrossDexArbitrageMetadata,
  ): void {
    if (
      stateMachine.isTerminal() ||
      !this.options.treatExpiredAsTerminal
    ) {
      return;
    }

    stateMachine.transition({
      transitionId: [
        "monitor",
        String(stateMachine.getExecution().id),
        String(sequence),
        "EXPIRED",
      ].join(":"),
      executionId: stateMachine.getExecution().id,
      expectedCurrentStatus: stateMachine.getStatus(),
      targetStatus: ArbitrageExecutionStatus.EXPIRED,
      occurredAtMilliseconds,
      reason,
      errorCode:
        ExecutionMonitorErrorCode.MONITORING_EXPIRED,
      errorMessage: reason,
      metadata: mergeMetadata(
        metadata,
        Object.freeze({ monitoringExpired: true }),
      ),
    });
  }

  private describeTransition(
    status: ArbitrageExecutionStatus,
    tracking: ExecutionTrackingSnapshot,
    receipt: EvmTransactionReceipt | undefined,
  ): string {
    switch (status) {
      case ArbitrageExecutionStatus.CONFIRMED:
        return `Transaction confirmed with ${tracking.confirmationCount} confirmation(s).`;
      case ArbitrageExecutionStatus.REVERTED:
        return (
          receipt?.revertAnalysis?.reason ??
          tracking.errorMessage ??
          "Transaction reverted."
        );
      case ArbitrageExecutionStatus.DROPPED:
        return (
          tracking.errorMessage ??
          "Transaction was dropped."
        );
      case ArbitrageExecutionStatus.REPLACED:
        return `Transaction replacement detected; replacement count is ${tracking.replacementCount}.`;
      case ArbitrageExecutionStatus.PENDING:
        return `Transaction is pending with ${tracking.confirmationCount} confirmation(s).`;
      default:
        return `Execution status observed as ${status}.`;
    }
  }

  private validatePollRequest(
    request: ExecutionMonitorPollRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object" ||
      request.stateMachine === undefined
    ) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.INVALID_EXECUTION,
        "A monitoring poll request is required.",
      );
    }

    const execution =
      request.stateMachine.getExecution();

    if (
      request.pollNumber !== undefined &&
      (!Number.isSafeInteger(request.pollNumber) ||
        request.pollNumber <= 0)
    ) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.INVALID_OPTIONS,
        "pollNumber must be a positive safe integer.",
        { executionId: execution.id },
      );
    }

    if (
      !request.stateMachine.isTerminal() &&
      !isMonitorableStatus(execution.status)
    ) {
      throw new ExecutionMonitorError(
        ExecutionMonitorErrorCode.EXECUTION_NOT_SUBMITTED,
        `Execution status ${execution.status} cannot be monitored.`,
        { executionId: execution.id },
      );
    }
  }
}

export function createExecutionMonitor(
  tracker: ExecutionTracker,
  receiptProvider: ExecutionReceiptProvider,
  clock: ExecutionMonitorClock,
  options: ExecutionMonitorOptions = {},
): ExecutionMonitor {
  return new ExecutionMonitor(
    tracker,
    receiptProvider,
    clock,
    options,
  );
}

export {
  ExecutionMonitor as CrossDexExecutionMonitor,
};