/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic recovery manager for failed, dropped, reverted, expired,
 * and replaced cross-DEX arbitrage executions.
 *
 * Responsibilities:
 * - Classify execution failures.
 * - Decide whether an execution is recoverable.
 * - Build deterministic retry/replacement/reconciliation plans.
 * - Apply recovery lifecycle transitions.
 * - Preserve immutable recovery history.
 * - Enforce retry, replacement, age, and gas-bump policies.
 *
 * This module performs no direct RPC, wallet, scheduler, filesystem,
 * or wall-clock access.
 */

import {
  ArbitrageExecutionStatus,
  CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES,
  type ArbitrageExecution,
  type ArbitrageExecutionId,
  type CrossDexArbitrageMetadata,
  type EvmTransactionReceipt,
  type TransactionHash,
  type UnixTimestampMilliseconds,
  type ValidationIssue,
} from "./cross-dex-arbitrage-contracts";
import {
  ExecutionStateMachine,
  type ExecutionStateSnapshot,
  type ExecutionTransitionRequest,
} from "./execution-state-machine";

export enum ExecutionRecoveryErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_EXECUTION = "INVALID_EXECUTION",
  INVALID_RECOVERY_REQUEST = "INVALID_RECOVERY_REQUEST",
  EXECUTION_NOT_RECOVERABLE = "EXECUTION_NOT_RECOVERABLE",
  RETRY_LIMIT_REACHED = "RETRY_LIMIT_REACHED",
  REPLACEMENT_LIMIT_REACHED = "REPLACEMENT_LIMIT_REACHED",
  EXECUTION_TOO_OLD = "EXECUTION_TOO_OLD",
  MISSING_TRANSACTION_HASH = "MISSING_TRANSACTION_HASH",
  RECOVERY_PLANNING_FAILED = "RECOVERY_PLANNING_FAILED",
  RECOVERY_TRANSITION_FAILED = "RECOVERY_TRANSITION_FAILED",
  RECOVERY_ACTION_FAILED = "RECOVERY_ACTION_FAILED",
  RECOVERY_VERIFICATION_FAILED = "RECOVERY_VERIFICATION_FAILED",
}

export class ExecutionRecoveryError extends Error {
  public readonly code: ExecutionRecoveryErrorCode;
  public readonly executionId?: ArbitrageExecutionId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: ExecutionRecoveryErrorCode,
    message: string,
    options: Readonly<{
      executionId?: ArbitrageExecutionId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "ExecutionRecoveryError";
    this.code = code;
    this.executionId = options.executionId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export enum ExecutionRecoveryClassification {
  NONCE_CONFLICT = "NONCE_CONFLICT",
  UNDERPRICED = "UNDERPRICED",
  RPC_TRANSIENT = "RPC_TRANSIENT",
  PROVIDER_RATE_LIMIT = "PROVIDER_RATE_LIMIT",
  NETWORK_CONGESTION = "NETWORK_CONGESTION",
  TRANSACTION_DROPPED = "TRANSACTION_DROPPED",
  TRANSACTION_REPLACED = "TRANSACTION_REPLACED",
  TRANSACTION_REVERTED = "TRANSACTION_REVERTED",
  SIMULATION_FAILED = "SIMULATION_FAILED",
  EXPIRED = "EXPIRED",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  UNSUPPORTED_CHAIN = "UNSUPPORTED_CHAIN",
  INVALID_ROUTE = "INVALID_ROUTE",
  PROFITABILITY_LOST = "PROFITABILITY_LOST",
  UNKNOWN = "UNKNOWN",
}

export enum ExecutionRecoveryAction {
  NONE = "NONE",
  RETRY_SUBMISSION = "RETRY_SUBMISSION",
  REPLACE_TRANSACTION = "REPLACE_TRANSACTION",
  RESIMULATE = "RESIMULATE",
  REBUILD_ROUTE = "REBUILD_ROUTE",
  RECONCILE = "RECONCILE",
  ABORT = "ABORT",
}

export interface ExecutionRecoveryClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface ExecutionRecoveryNonceProvider {
  getPendingNonce(
    execution: ArbitrageExecution,
  ): Promise<number>;
}

export interface ExecutionRecoveryReceiptProvider {
  getReceipt(
    transactionHash: TransactionHash,
  ): Promise<EvmTransactionReceipt | undefined>;
}

export interface ExecutionRecoveryActionExecutor {
  retrySubmission(
    execution: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
  ): Promise<ExecutionRecoveryActionResult>;

  replaceTransaction(
    execution: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
  ): Promise<ExecutionRecoveryActionResult>;

  resimulate(
    execution: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
  ): Promise<ExecutionRecoveryActionResult>;

  rebuildRoute(
    execution: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
  ): Promise<ExecutionRecoveryActionResult>;

  reconcile(
    execution: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
  ): Promise<ExecutionRecoveryActionResult>;
}

export interface ExecutionRecoveryOptions {
  readonly maximumRetryCount?: number;
  readonly maximumReplacementCount?: number;
  readonly maximumExecutionAgeMilliseconds?: number;
  readonly baseRetryDelayMilliseconds?: number;
  readonly maximumRetryDelayMilliseconds?: number;
  readonly retryBackoffMultiplier?: number;
  readonly replacementGasBumpBasisPoints?: number;
  readonly minimumReplacementGasBumpBasisPoints?: number;
  readonly allowRecoveryFromRevert?: boolean;
  readonly allowRecoveryFromExpiry?: boolean;
  readonly allowRouteRebuild?: boolean;
  readonly allowResimulation?: boolean;
  readonly abortOnLostProfitability?: boolean;
}

interface NormalizedOptions {
  readonly maximumRetryCount: number;
  readonly maximumReplacementCount: number;
  readonly maximumExecutionAgeMilliseconds: number;
  readonly baseRetryDelayMilliseconds: number;
  readonly maximumRetryDelayMilliseconds: number;
  readonly retryBackoffMultiplier: number;
  readonly replacementGasBumpBasisPoints: number;
  readonly minimumReplacementGasBumpBasisPoints: number;
  readonly allowRecoveryFromRevert: boolean;
  readonly allowRecoveryFromExpiry: boolean;
  readonly allowRouteRebuild: boolean;
  readonly allowResimulation: boolean;
  readonly abortOnLostProfitability: boolean;
}

export interface ExecutionRecoveryContext {
  readonly retryCount: number;
  readonly replacementCount: number;
  readonly lastErrorCode?: string;
  readonly lastErrorMessage?: string;
  readonly transactionHash?: TransactionHash;
  readonly receipt?: EvmTransactionReceipt;
  readonly validationIssues?: readonly ValidationIssue[];
  readonly profitabilityStillValid?: boolean;
  readonly routeStillValid?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionRecoveryRequest {
  readonly stateMachine: ExecutionStateMachine;
  readonly context: ExecutionRecoveryContext;
  readonly requestedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionRecoveryPlan {
  readonly executionId: ArbitrageExecutionId;
  readonly classification: ExecutionRecoveryClassification;
  readonly action: ExecutionRecoveryAction;
  readonly recoverable: boolean;
  readonly reason: string;
  readonly retryCount: number;
  readonly replacementCount: number;
  readonly retryAfterMilliseconds: number;
  readonly gasBumpBasisPoints?: number;
  readonly expectedStatus?: ArbitrageExecutionStatus;
  readonly targetStatus?: ArbitrageExecutionStatus;
  readonly transactionHash?: TransactionHash;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionRecoveryActionResult {
  readonly success: boolean;
  readonly action: ExecutionRecoveryAction;
  readonly transactionHash?: TransactionHash;
  readonly replacementTransactionHash?: TransactionHash;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionRecoveryRecord {
  readonly sequence: number;
  readonly executionId: ArbitrageExecutionId;
  readonly occurredAtMilliseconds: UnixTimestampMilliseconds;
  readonly classification: ExecutionRecoveryClassification;
  readonly action: ExecutionRecoveryAction;
  readonly success: boolean;
  readonly statusBefore: ArbitrageExecutionStatus;
  readonly statusAfter: ArbitrageExecutionStatus;
  readonly retryCount: number;
  readonly replacementCount: number;
  readonly reason: string;
  readonly transactionHash?: TransactionHash;
  readonly replacementTransactionHash?: TransactionHash;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionRecoveryResult {
  readonly snapshot: ExecutionStateSnapshot;
  readonly plan: ExecutionRecoveryPlan;
  readonly actionResult?: ExecutionRecoveryActionResult;
  readonly record: ExecutionRecoveryRecord;
  readonly recovered: boolean;
  readonly terminal: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  maximumRetryCount: 3,
  maximumReplacementCount: 2,
  maximumExecutionAgeMilliseconds: 300_000,
  baseRetryDelayMilliseconds: 1_000,
  maximumRetryDelayMilliseconds: 30_000,
  retryBackoffMultiplier: 2,
  replacementGasBumpBasisPoints: 1_250,
  minimumReplacementGasBumpBasisPoints: 1_000,
  allowRecoveryFromRevert: false,
  allowRecoveryFromExpiry: true,
  allowRouteRebuild: true,
  allowResimulation: true,
  abortOnLostProfitability: true,
});

const TRANSIENT_ERROR_TOKENS = Object.freeze([
  "timeout",
  "temporarily unavailable",
  "connection reset",
  "connection refused",
  "network error",
  "gateway",
  "service unavailable",
  "internal error",
  "rpc error",
]);

const RATE_LIMIT_TOKENS = Object.freeze([
  "rate limit",
  "too many requests",
  "429",
  "throttl",
]);

const NONCE_TOKENS = Object.freeze([
  "nonce too low",
  "nonce too high",
  "nonce",
  "already known",
]);

const UNDERPRICED_TOKENS = Object.freeze([
  "underpriced",
  "fee too low",
  "replacement transaction underpriced",
  "max fee per gas less than block base fee",
]);

const INSUFFICIENT_FUNDS_TOKENS = Object.freeze([
  "insufficient funds",
  "insufficient balance",
  "funds for gas",
]);

const SIGNATURE_TOKENS = Object.freeze([
  "invalid signature",
  "signature",
  "sender doesn't match",
]);

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


function createHashMetadata(
  key: "transactionHash" | "replacementTransactionHash",
  value: TransactionHash | undefined,
): CrossDexArbitrageMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Object.freeze({
    [key]: value,
  });
}

function normalizeText(
  value: string | undefined,
): string {
  return value?.trim().toLowerCase() ?? "";
}

function containsAny(
  text: string,
  tokens: readonly string[],
): boolean {
  return tokens.some((token) => text.includes(token));
}

function normalizeOptions(
  options: ExecutionRecoveryOptions,
): NormalizedOptions {
  const normalized = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const nonNegativeIntegers: ReadonlyArray<
    readonly [string, number]
  > = [
    ["maximumRetryCount", normalized.maximumRetryCount],
    [
      "maximumReplacementCount",
      normalized.maximumReplacementCount,
    ],
    [
      "baseRetryDelayMilliseconds",
      normalized.baseRetryDelayMilliseconds,
    ],
    [
      "replacementGasBumpBasisPoints",
      normalized.replacementGasBumpBasisPoints,
    ],
    [
      "minimumReplacementGasBumpBasisPoints",
      normalized.minimumReplacementGasBumpBasisPoints,
    ],
  ];

  for (const [name, value] of nonNegativeIntegers) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_OPTIONS,
        `${name} must be a non-negative safe integer.`,
        { details: value },
      );
    }
  }

  const positiveIntegers: ReadonlyArray<
    readonly [string, number]
  > = [
    [
      "maximumExecutionAgeMilliseconds",
      normalized.maximumExecutionAgeMilliseconds,
    ],
    [
      "maximumRetryDelayMilliseconds",
      normalized.maximumRetryDelayMilliseconds,
    ],
  ];

  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_OPTIONS,
        `${name} must be a positive safe integer.`,
        { details: value },
      );
    }
  }

  if (
    !Number.isFinite(normalized.retryBackoffMultiplier) ||
    normalized.retryBackoffMultiplier < 1
  ) {
    throw new ExecutionRecoveryError(
      ExecutionRecoveryErrorCode.INVALID_OPTIONS,
      "retryBackoffMultiplier must be finite and at least 1.",
      { details: normalized.retryBackoffMultiplier },
    );
  }

  if (
    normalized.replacementGasBumpBasisPoints <
    normalized.minimumReplacementGasBumpBasisPoints
  ) {
    throw new ExecutionRecoveryError(
      ExecutionRecoveryErrorCode.INVALID_OPTIONS,
      "replacementGasBumpBasisPoints cannot be lower than the configured minimum.",
      {
        details: Object.freeze({
          replacementGasBumpBasisPoints:
            normalized.replacementGasBumpBasisPoints,
          minimumReplacementGasBumpBasisPoints:
            normalized.minimumReplacementGasBumpBasisPoints,
        }),
      },
    );
  }

  return Object.freeze(normalized);
}

function isTerminalStatus(
  status: ArbitrageExecutionStatus,
): boolean {
  return CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES.has(
    status,
  );
}

function getTransactionHash(
  execution: ArbitrageExecution,
  context: ExecutionRecoveryContext,
): TransactionHash | undefined {
  return (
    context.transactionHash ??
    execution.submission?.transactionHash ??
    execution.signedTransaction?.transactionHash
  );
}

function computeRetryDelay(
  retryCount: number,
  options: NormalizedOptions,
): number {
  if (retryCount <= 0) {
    return options.baseRetryDelayMilliseconds;
  }

  const raw =
    options.baseRetryDelayMilliseconds *
    options.retryBackoffMultiplier **
      Math.max(0, retryCount - 1);

  return Math.min(
    Math.round(raw),
    options.maximumRetryDelayMilliseconds,
  );
}

export class ExecutionRecoveryManager {
  private readonly options: NormalizedOptions;
  private readonly history: ExecutionRecoveryRecord[] = [];

  public constructor(
    private readonly clock: ExecutionRecoveryClock,
    private readonly nonceProvider: ExecutionRecoveryNonceProvider,
    private readonly receiptProvider: ExecutionRecoveryReceiptProvider,
    private readonly actionExecutor: ExecutionRecoveryActionExecutor,
    options: ExecutionRecoveryOptions = {},
  ) {
    const dependencies: ReadonlyArray<
      readonly [string, unknown, string]
    > = [
      ["clock", clock, "nowMilliseconds"],
      ["nonceProvider", nonceProvider, "getPendingNonce"],
      ["receiptProvider", receiptProvider, "getReceipt"],
      ["actionExecutor", actionExecutor, "retrySubmission"],
      ["actionExecutor", actionExecutor, "replaceTransaction"],
      ["actionExecutor", actionExecutor, "resimulate"],
      ["actionExecutor", actionExecutor, "rebuildRoute"],
      ["actionExecutor", actionExecutor, "reconcile"],
    ];

    for (const [name, dependency, method] of dependencies) {
      if (
        dependency === null ||
        typeof dependency !== "object" ||
        typeof (dependency as Record<string, unknown>)[method] !==
          "function"
      ) {
        throw new ExecutionRecoveryError(
          ExecutionRecoveryErrorCode.INVALID_DEPENDENCIES,
          `${name} must implement ${method}().`,
        );
      }
    }

    this.options = normalizeOptions(options);
  }

  public getHistory(): readonly ExecutionRecoveryRecord[] {
    return Object.freeze([...this.history]);
  }

  public classify(
    execution: ArbitrageExecution,
    context: ExecutionRecoveryContext,
  ): ExecutionRecoveryClassification {
    this.validateExecution(execution);
    this.validateContext(context, execution.id);

    if (context.profitabilityStillValid === false) {
      return ExecutionRecoveryClassification.PROFITABILITY_LOST;
    }

    if (context.routeStillValid === false) {
      return ExecutionRecoveryClassification.INVALID_ROUTE;
    }

    switch (execution.status) {
      case ArbitrageExecutionStatus.DROPPED:
        return ExecutionRecoveryClassification.TRANSACTION_DROPPED;
      case ArbitrageExecutionStatus.REPLACED:
        return ExecutionRecoveryClassification.TRANSACTION_REPLACED;
      case ArbitrageExecutionStatus.REVERTED:
        return ExecutionRecoveryClassification.TRANSACTION_REVERTED;
      case ArbitrageExecutionStatus.SIMULATION_FAILED:
        return ExecutionRecoveryClassification.SIMULATION_FAILED;
      case ArbitrageExecutionStatus.EXPIRED:
        return ExecutionRecoveryClassification.EXPIRED;
      default:
        break;
    }

    const text = [
      context.lastErrorCode,
      context.lastErrorMessage,
      execution.revertAnalysis?.reason,
      ...(context.validationIssues ?? []).map(
        (issue) => issue.message,
      ),
    ]
      .map(normalizeText)
      .filter((value) => value.length > 0)
      .join(" ");

    if (containsAny(text, NONCE_TOKENS)) {
      return ExecutionRecoveryClassification.NONCE_CONFLICT;
    }

    if (containsAny(text, UNDERPRICED_TOKENS)) {
      return ExecutionRecoveryClassification.UNDERPRICED;
    }

    if (containsAny(text, RATE_LIMIT_TOKENS)) {
      return ExecutionRecoveryClassification.PROVIDER_RATE_LIMIT;
    }

    if (containsAny(text, INSUFFICIENT_FUNDS_TOKENS)) {
      return ExecutionRecoveryClassification.INSUFFICIENT_FUNDS;
    }

    if (containsAny(text, SIGNATURE_TOKENS)) {
      return ExecutionRecoveryClassification.INVALID_SIGNATURE;
    }

    if (containsAny(text, TRANSIENT_ERROR_TOKENS)) {
      return ExecutionRecoveryClassification.RPC_TRANSIENT;
    }

    if (
      execution.status === ArbitrageExecutionStatus.PENDING ||
      execution.status === ArbitrageExecutionStatus.SUBMITTED
    ) {
      return ExecutionRecoveryClassification.NETWORK_CONGESTION;
    }

    return ExecutionRecoveryClassification.UNKNOWN;
  }

  public plan(
    execution: ArbitrageExecution,
    context: ExecutionRecoveryContext,
    requestedAtMilliseconds: UnixTimestampMilliseconds =
      this.clock.nowMilliseconds(),
    metadata?: CrossDexArbitrageMetadata,
  ): ExecutionRecoveryPlan {
    this.validateExecution(execution);
    this.validateContext(context, execution.id);

    const classification = this.classify(
      execution,
      context,
    );

    const age =
      Number(requestedAtMilliseconds) -
      Number(execution.createdAtMilliseconds);

    if (
      age > this.options.maximumExecutionAgeMilliseconds
    ) {
      return Object.freeze({
        executionId: execution.id,
        classification,
        action: ExecutionRecoveryAction.ABORT,
        recoverable: false,
        reason:
          "Execution exceeded the maximum recoverable age.",
        retryCount: context.retryCount,
        replacementCount: context.replacementCount,
        retryAfterMilliseconds: 0,
        transactionHash: getTransactionHash(
          execution,
          context,
        ),
        metadata: mergeMetadata(
          metadata,
          context.metadata,
          Object.freeze({
            executionAgeMilliseconds: age,
          }),
        ),
      });
    }

    if (
      context.profitabilityStillValid === false &&
      this.options.abortOnLostProfitability
    ) {
      return this.createAbortPlan(
        execution,
        context,
        classification,
        "Execution is no longer profitable.",
        metadata,
      );
    }

    const retryLimitReached =
      context.retryCount >= this.options.maximumRetryCount;
    const replacementLimitReached =
      context.replacementCount >=
      this.options.maximumReplacementCount;

    const base = {
      executionId: execution.id,
      classification,
      retryCount: context.retryCount,
      replacementCount: context.replacementCount,
      transactionHash: getTransactionHash(
        execution,
        context,
      ),
      metadata: mergeMetadata(metadata, context.metadata),
    };

    switch (classification) {
      case ExecutionRecoveryClassification.NONCE_CONFLICT:
        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.RECONCILE,
          recoverable: true,
          reason:
            "Nonce conflict requires on-chain reconciliation before resubmission.",
          retryAfterMilliseconds: 0,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.REPLACED,
        });

      case ExecutionRecoveryClassification.UNDERPRICED:
      case ExecutionRecoveryClassification.NETWORK_CONGESTION:
      case ExecutionRecoveryClassification.TRANSACTION_DROPPED:
        if (replacementLimitReached) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Maximum replacement count reached.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.REPLACE_TRANSACTION,
          recoverable: true,
          reason:
            "Transaction should be replaced with a higher gas price.",
          retryAfterMilliseconds: 0,
          gasBumpBasisPoints:
            this.options.replacementGasBumpBasisPoints,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.REPLACED,
        });

      case ExecutionRecoveryClassification.RPC_TRANSIENT:
      case ExecutionRecoveryClassification.PROVIDER_RATE_LIMIT:
        if (retryLimitReached) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Maximum retry count reached.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.RETRY_SUBMISSION,
          recoverable: true,
          reason:
            "Transient provider failure permits deterministic retry.",
          retryAfterMilliseconds: computeRetryDelay(
            context.retryCount + 1,
            this.options,
          ),
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.SUBMITTING,
        });

      case ExecutionRecoveryClassification.SIMULATION_FAILED:
        if (!this.options.allowResimulation) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Resimulation is disabled.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.RESIMULATE,
          recoverable: true,
          reason:
            "Execution requires a fresh transaction simulation.",
          retryAfterMilliseconds: 0,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.SIMULATING,
        });

      case ExecutionRecoveryClassification.INVALID_ROUTE:
        if (!this.options.allowRouteRebuild) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Route rebuilding is disabled.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.REBUILD_ROUTE,
          recoverable: true,
          reason:
            "The execution route is stale or invalid and must be rebuilt.",
          retryAfterMilliseconds: 0,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.VALIDATING,
        });

      case ExecutionRecoveryClassification.TRANSACTION_REPLACED:
        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.RECONCILE,
          recoverable: true,
          reason:
            "Replacement transaction requires reconciliation.",
          retryAfterMilliseconds: 0,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.PENDING,
        });

      case ExecutionRecoveryClassification.TRANSACTION_REVERTED:
        if (!this.options.allowRecoveryFromRevert) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Recovery from reverted transactions is disabled.",
            metadata,
          );
        }

        if (!this.options.allowResimulation) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Resimulation is required but disabled.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.RESIMULATE,
          recoverable: true,
          reason:
            "Reverted execution must be re-simulated before retry.",
          retryAfterMilliseconds: 0,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.SIMULATING,
        });

      case ExecutionRecoveryClassification.EXPIRED:
        if (!this.options.allowRecoveryFromExpiry) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Recovery from expired executions is disabled.",
            metadata,
          );
        }

        if (!this.options.allowRouteRebuild) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Expired execution requires route rebuilding, which is disabled.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.REBUILD_ROUTE,
          recoverable: true,
          reason:
            "Expired execution requires route and profitability refresh.",
          retryAfterMilliseconds: 0,
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.VALIDATING,
        });

      case ExecutionRecoveryClassification.INSUFFICIENT_FUNDS:
      case ExecutionRecoveryClassification.INVALID_SIGNATURE:
      case ExecutionRecoveryClassification.UNSUPPORTED_CHAIN:
      case ExecutionRecoveryClassification.PROFITABILITY_LOST:
        return this.createAbortPlan(
          execution,
          context,
          classification,
          "Execution failure is not automatically recoverable.",
          metadata,
        );

      case ExecutionRecoveryClassification.UNKNOWN:
      default:
        if (retryLimitReached) {
          return this.createAbortPlan(
            execution,
            context,
            classification,
            "Unknown failure and maximum retry count reached.",
            metadata,
          );
        }

        return Object.freeze({
          ...base,
          action: ExecutionRecoveryAction.RETRY_SUBMISSION,
          recoverable: true,
          reason:
            "Unknown failure is eligible for one bounded retry path.",
          retryAfterMilliseconds: computeRetryDelay(
            context.retryCount + 1,
            this.options,
          ),
          expectedStatus: execution.status,
          targetStatus: ArbitrageExecutionStatus.SUBMITTING,
        });
    }
  }

  public async recover(
    request: ExecutionRecoveryRequest,
  ): Promise<ExecutionRecoveryResult> {
    this.validateRecoveryRequest(request);

    const stateMachine = request.stateMachine;
    const executionBefore = stateMachine.getExecution();
    const requestedAtMilliseconds =
      request.requestedAtMilliseconds ??
      this.clock.nowMilliseconds();

    const plan = this.plan(
      executionBefore,
      request.context,
      requestedAtMilliseconds,
      request.metadata,
    );

    if (
      !plan.recoverable ||
      plan.action === ExecutionRecoveryAction.ABORT ||
      plan.action === ExecutionRecoveryAction.NONE
    ) {
      const record = this.record(
        executionBefore,
        stateMachine.getExecution(),
        plan,
        undefined,
        requestedAtMilliseconds,
        false,
        request.metadata,
      );

      return Object.freeze({
        snapshot: stateMachine.getSnapshot(),
        plan,
        record,
        recovered: false,
        terminal: stateMachine.isTerminal(),
        metadata: mergeMetadata(
          request.metadata,
          request.context.metadata,
        ),
      });
    }

    await this.prepareStateMachineForRecovery(
      stateMachine,
      plan,
      requestedAtMilliseconds,
      request.metadata,
    );

    let actionResult: ExecutionRecoveryActionResult;

    try {
      actionResult = await this.executeAction(
        stateMachine.getExecution(),
        plan,
      );
    } catch (cause) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.RECOVERY_ACTION_FAILED,
        `Recovery action ${plan.action} failed.`,
        {
          executionId: executionBefore.id,
          details: plan,
          cause,
        },
      );
    }

    const completedAtMilliseconds =
      this.clock.nowMilliseconds();

    this.applyActionResult(
      stateMachine,
      plan,
      actionResult,
      completedAtMilliseconds,
      request.metadata,
    );

    const record = this.record(
      executionBefore,
      stateMachine.getExecution(),
      plan,
      actionResult,
      completedAtMilliseconds,
      actionResult.success,
      request.metadata,
    );

    return Object.freeze({
      snapshot: stateMachine.getSnapshot(),
      plan,
      actionResult,
      record,
      recovered: actionResult.success,
      terminal: stateMachine.isTerminal(),
      metadata: mergeMetadata(
        request.metadata,
        request.context.metadata,
        actionResult.metadata,
      ),
    });
  }

  private async prepareStateMachineForRecovery(
    stateMachine: ExecutionStateMachine,
    plan: ExecutionRecoveryPlan,
    occurredAtMilliseconds: UnixTimestampMilliseconds,
    metadata?: CrossDexArbitrageMetadata,
  ): Promise<void> {
    if (plan.action === ExecutionRecoveryAction.RECONCILE) {
      const transactionHash = plan.transactionHash;

      if (transactionHash !== undefined) {
        const receipt =
          await this.receiptProvider.getReceipt(
            transactionHash,
          );

        if (receipt?.status === true) {
          this.transition(
            stateMachine,
            ArbitrageExecutionStatus.CONFIRMED,
            occurredAtMilliseconds,
            "Recovery reconciliation found a confirmed transaction.",
            undefined,
            undefined,
            metadata,
          );

          return;
        }

        if (receipt?.status === false) {
          this.transition(
            stateMachine,
            ArbitrageExecutionStatus.REVERTED,
            occurredAtMilliseconds,
            receipt.revertAnalysis?.reason ??
              "Recovery reconciliation found a reverted transaction.",
            "TRANSACTION_REVERTED",
            receipt.revertAnalysis?.reason,
            mergeMetadata(metadata, receipt.metadata),
          );

          return;
        }
      }

      await this.nonceProvider.getPendingNonce(
        stateMachine.getExecution(),
      );
    }

    if (
      plan.targetStatus !== undefined &&
      stateMachine.getStatus() !== plan.targetStatus &&
      !stateMachine.isTerminal()
    ) {
      this.transition(
        stateMachine,
        plan.targetStatus,
        occurredAtMilliseconds,
        plan.reason,
        undefined,
        undefined,
        metadata,
      );
    }
  }

  private async executeAction(
    execution: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
  ): Promise<ExecutionRecoveryActionResult> {
    switch (plan.action) {
      case ExecutionRecoveryAction.RETRY_SUBMISSION:
        return this.actionExecutor.retrySubmission(
          execution,
          plan,
        );

      case ExecutionRecoveryAction.REPLACE_TRANSACTION:
        return this.actionExecutor.replaceTransaction(
          execution,
          plan,
        );

      case ExecutionRecoveryAction.RESIMULATE:
        return this.actionExecutor.resimulate(
          execution,
          plan,
        );

      case ExecutionRecoveryAction.REBUILD_ROUTE:
        return this.actionExecutor.rebuildRoute(
          execution,
          plan,
        );

      case ExecutionRecoveryAction.RECONCILE:
        return this.actionExecutor.reconcile(
          execution,
          plan,
        );

      case ExecutionRecoveryAction.NONE:
      case ExecutionRecoveryAction.ABORT:
      default:
        return Object.freeze({
          success: false,
          action: plan.action,
          errorCode:
            ExecutionRecoveryErrorCode.EXECUTION_NOT_RECOVERABLE,
          errorMessage: plan.reason,
        });
    }
  }

  private applyActionResult(
    stateMachine: ExecutionStateMachine,
    plan: ExecutionRecoveryPlan,
    result: ExecutionRecoveryActionResult,
    occurredAtMilliseconds: UnixTimestampMilliseconds,
    metadata?: CrossDexArbitrageMetadata,
  ): void {
    if (!result.success) {
      if (!stateMachine.isTerminal()) {
        this.transition(
          stateMachine,
          ArbitrageExecutionStatus.FAILED,
          occurredAtMilliseconds,
          result.errorMessage ??
            `Recovery action ${plan.action} failed.`,
          result.errorCode ??
            ExecutionRecoveryErrorCode.RECOVERY_ACTION_FAILED,
          result.errorMessage,
          mergeMetadata(metadata, result.metadata),
        );
      }

      return;
    }

    switch (plan.action) {
      case ExecutionRecoveryAction.RETRY_SUBMISSION:
        this.transitionIfAllowed(
          stateMachine,
          ArbitrageExecutionStatus.SUBMITTED,
          occurredAtMilliseconds,
          "Recovery retry submitted successfully.",
          mergeMetadata(
            metadata,
            result.metadata,
            createHashMetadata(
              "transactionHash",
              result.transactionHash,
            ),
          ),
        );
        break;

      case ExecutionRecoveryAction.REPLACE_TRANSACTION:
        this.transitionIfAllowed(
          stateMachine,
          ArbitrageExecutionStatus.REPLACED,
          occurredAtMilliseconds,
          "Replacement transaction submitted successfully.",
          mergeMetadata(
            metadata,
            result.metadata,
            createHashMetadata(
              "replacementTransactionHash",
              result.replacementTransactionHash ??
                result.transactionHash,
            ),
          ),
        );
        break;

      case ExecutionRecoveryAction.RESIMULATE:
        this.transitionIfAllowed(
          stateMachine,
          ArbitrageExecutionStatus.SIMULATION_SUCCEEDED,
          occurredAtMilliseconds,
          "Recovery simulation succeeded.",
          mergeMetadata(metadata, result.metadata),
        );
        break;

      case ExecutionRecoveryAction.REBUILD_ROUTE:
        this.transitionIfAllowed(
          stateMachine,
          ArbitrageExecutionStatus.VALIDATING,
          occurredAtMilliseconds,
          "Recovery route rebuild completed.",
          mergeMetadata(metadata, result.metadata),
        );
        break;

      case ExecutionRecoveryAction.RECONCILE:
        if (!stateMachine.isTerminal()) {
          this.transitionIfAllowed(
            stateMachine,
            ArbitrageExecutionStatus.PENDING,
            occurredAtMilliseconds,
            "Recovery reconciliation completed.",
            mergeMetadata(metadata, result.metadata),
          );
        }
        break;

      case ExecutionRecoveryAction.NONE:
      case ExecutionRecoveryAction.ABORT:
      default:
        break;
    }
  }

  private transitionIfAllowed(
    stateMachine: ExecutionStateMachine,
    targetStatus: ArbitrageExecutionStatus,
    occurredAtMilliseconds: UnixTimestampMilliseconds,
    reason: string,
    metadata?: CrossDexArbitrageMetadata,
  ): void {
    if (
      stateMachine.getStatus() === targetStatus ||
      stateMachine.isTerminal()
    ) {
      return;
    }

    if (!stateMachine.canTransitionTo(targetStatus)) {
      return;
    }

    this.transition(
      stateMachine,
      targetStatus,
      occurredAtMilliseconds,
      reason,
      undefined,
      undefined,
      metadata,
    );
  }

  private transition(
    stateMachine: ExecutionStateMachine,
    targetStatus: ArbitrageExecutionStatus,
    occurredAtMilliseconds: UnixTimestampMilliseconds,
    reason: string,
    errorCode?: string,
    errorMessage?: string,
    metadata?: CrossDexArbitrageMetadata,
  ): void {
    const execution = stateMachine.getExecution();

    const request: ExecutionTransitionRequest =
      Object.freeze({
        transitionId: [
          "recovery",
          String(execution.id),
          String(this.history.length + 1),
          targetStatus,
          String(occurredAtMilliseconds),
        ].join(":"),
        executionId: execution.id,
        expectedCurrentStatus: execution.status,
        targetStatus,
        occurredAtMilliseconds,
        reason,
        errorCode,
        errorMessage,
        metadata,
      });

    try {
      stateMachine.transition(request);
    } catch (cause) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.RECOVERY_TRANSITION_FAILED,
        `Failed to transition execution from ${execution.status} to ${targetStatus}.`,
        {
          executionId: execution.id,
          details: request,
          cause,
        },
      );
    }
  }

  private record(
    before: ArbitrageExecution,
    after: ArbitrageExecution,
    plan: ExecutionRecoveryPlan,
    result: ExecutionRecoveryActionResult | undefined,
    occurredAtMilliseconds: UnixTimestampMilliseconds,
    success: boolean,
    metadata?: CrossDexArbitrageMetadata,
  ): ExecutionRecoveryRecord {
    const record: ExecutionRecoveryRecord =
      Object.freeze({
        sequence: this.history.length + 1,
        executionId: before.id,
        occurredAtMilliseconds,
        classification: plan.classification,
        action: plan.action,
        success,
        statusBefore: before.status,
        statusAfter: after.status,
        retryCount: plan.retryCount,
        replacementCount: plan.replacementCount,
        reason: plan.reason,
        transactionHash:
          result?.transactionHash ??
          plan.transactionHash,
        replacementTransactionHash:
          result?.replacementTransactionHash,
        errorCode: result?.errorCode,
        errorMessage: result?.errorMessage,
        metadata: mergeMetadata(
          metadata,
          plan.metadata,
          result?.metadata,
        ),
      });

    this.history.push(record);

    return record;
  }

  private createAbortPlan(
    execution: ArbitrageExecution,
    context: ExecutionRecoveryContext,
    classification: ExecutionRecoveryClassification,
    reason: string,
    metadata?: CrossDexArbitrageMetadata,
  ): ExecutionRecoveryPlan {
    return Object.freeze({
      executionId: execution.id,
      classification,
      action: ExecutionRecoveryAction.ABORT,
      recoverable: false,
      reason,
      retryCount: context.retryCount,
      replacementCount: context.replacementCount,
      retryAfterMilliseconds: 0,
      transactionHash: getTransactionHash(
        execution,
        context,
      ),
      metadata: mergeMetadata(metadata, context.metadata),
    });
  }

  private validateExecution(
    execution: ArbitrageExecution,
  ): void {
    if (
      execution === null ||
      typeof execution !== "object" ||
      execution.id === undefined
    ) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_EXECUTION,
        "A valid arbitrage execution is required.",
      );
    }

    if (
      !Object.values(ArbitrageExecutionStatus).includes(
        execution.status,
      )
    ) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_EXECUTION,
        "Execution status is invalid.",
        {
          executionId: execution.id,
          details: execution.status,
        },
      );
    }
  }

  private validateContext(
    context: ExecutionRecoveryContext,
    executionId: ArbitrageExecutionId,
  ): void {
    if (
      context === null ||
      typeof context !== "object"
    ) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_RECOVERY_REQUEST,
        "Recovery context is required.",
        { executionId },
      );
    }

    const counters: ReadonlyArray<
      readonly [string, number]
    > = [
      ["retryCount", context.retryCount],
      ["replacementCount", context.replacementCount],
    ];

    for (const [name, value] of counters) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new ExecutionRecoveryError(
          ExecutionRecoveryErrorCode.INVALID_RECOVERY_REQUEST,
          `${name} must be a non-negative safe integer.`,
          { executionId, details: value },
        );
      }
    }
  }

  private validateRecoveryRequest(
    request: ExecutionRecoveryRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object" ||
      request.stateMachine === undefined
    ) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_RECOVERY_REQUEST,
        "A recovery request with a state machine is required.",
      );
    }

    const execution =
      request.stateMachine.getExecution();

    this.validateExecution(execution);
    this.validateContext(request.context, execution.id);

    if (
      request.requestedAtMilliseconds !== undefined &&
      (!Number.isSafeInteger(
        request.requestedAtMilliseconds,
      ) ||
        request.requestedAtMilliseconds < 0)
    ) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.INVALID_RECOVERY_REQUEST,
        "requestedAtMilliseconds must be a non-negative safe integer.",
        { executionId: execution.id },
      );
    }

    if (
      isTerminalStatus(execution.status) &&
      execution.status === ArbitrageExecutionStatus.CONFIRMED
    ) {
      throw new ExecutionRecoveryError(
        ExecutionRecoveryErrorCode.EXECUTION_NOT_RECOVERABLE,
        "Confirmed executions cannot be recovered.",
        { executionId: execution.id },
      );
    }
  }
}

export function createExecutionRecoveryManager(
  clock: ExecutionRecoveryClock,
  nonceProvider: ExecutionRecoveryNonceProvider,
  receiptProvider: ExecutionRecoveryReceiptProvider,
  actionExecutor: ExecutionRecoveryActionExecutor,
  options: ExecutionRecoveryOptions = {},
): ExecutionRecoveryManager {
  return new ExecutionRecoveryManager(
    clock,
    nonceProvider,
    receiptProvider,
    actionExecutor,
    options,
  );
}

export {
  ExecutionRecoveryManager as CrossDexExecutionRecoveryManager,
};