/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Deterministic retry and exponential-backoff contracts.
 *
 * This module defines transport-independent retry decisions, delay
 * calculation, attempt tracking, cancellation, scheduling, and metrics.
 *
 * Implementations must use injected clocks, schedulers, and jitter sources.
 * They must not call Date.now(), setTimeout(), or Math.random() directly.
 */

import type { ExchangeConnectorOperationContext } from "../connectors/exchange-connector";
import type { ExchangeHttpMethod } from "../connectors/exchange-connector-config";

/**
 * Retry policy lifecycle states.
 */
export type ExchangeRetryPolicyState =
  | "CREATED"
  | "READY"
  | "PAUSED"
  | "CLOSED"
  | "FAILED";

/**
 * Retry execution outcomes.
 */
export type ExchangeRetryExecutionStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "DEADLINE_EXCEEDED"
  | "ATTEMPTS_EXHAUSTED";

/**
 * Reasons for retry decisions.
 */
export type ExchangeRetryDecisionReason =
  | "FIRST_ATTEMPT"
  | "RETRYABLE_STATUS_CODE"
  | "RETRYABLE_ERROR_CODE"
  | "RETRYABLE_ERROR_CATEGORY"
  | "EXPLICIT_RETRYABLE_ERROR"
  | "SAFE_HTTP_METHOD"
  | "IDEMPOTENT_HTTP_METHOD"
  | "IDEMPOTENCY_KEY_PRESENT"
  | "MUTATING_RETRY_DISABLED"
  | "NON_RETRYABLE_STATUS_CODE"
  | "NON_RETRYABLE_ERROR_CODE"
  | "NON_RETRYABLE_ERROR_CATEGORY"
  | "MAXIMUM_ATTEMPTS_REACHED"
  | "DEADLINE_EXCEEDED"
  | "POLICY_NOT_READY"
  | "POLICY_PAUSED"
  | "POLICY_CLOSED"
  | "CANCELLED"
  | "INVALID_REQUEST";

/**
 * Error categories understood by the retry policy.
 */
export type ExchangeRetryErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "CONNECTION"
  | "PROTOCOL"
  | "SERIALIZATION"
  | "DESERIALIZATION"
  | "EXCHANGE"
  | "CANCELLED"
  | "UNAVAILABLE"
  | "INTERNAL"
  | "UNKNOWN";

/**
 * Clock abstraction used by retry infrastructure.
 */
export interface ExchangeRetryClock {
  now(): number;
}

/**
 * Deterministic scheduler abstraction.
 */
export interface ExchangeRetryScheduler {
  sleep(
    delayMs: number,
    cancellationToken?: ExchangeRetryCancellationToken,
  ): Promise<void>;
}

/**
 * Deterministic jitter source.
 *
 * Implementations must return a value between -1 and 1.
 */
export interface ExchangeRetryJitterSource {
  next(): number;
}

/**
 * Optional cancellation abstraction.
 */
export interface ExchangeRetryCancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;

  throwIfCancelled(): void;

  onCancelled(listener: (reason?: string) => void): () => void;
}

/**
 * Immutable retry policy configuration.
 */
export interface ExchangeRetryPolicyConfig {
  /**
   * Maximum number of total attempts, including the first attempt.
   */
  readonly maximumAttempts: number;

  /**
   * Delay before the first retry.
   */
  readonly initialDelayMs: number;

  /**
   * Maximum allowed delay between attempts.
   */
  readonly maximumDelayMs: number;

  /**
   * Exponential backoff multiplier.
   */
  readonly backoffMultiplier: number;

  /**
   * Maximum proportional jitter.
   *
   * Example:
   * 0.1 permits a deterministic adjustment of up to ±10%.
   */
  readonly jitterRatio: number;

  /**
   * HTTP response codes considered retryable.
   */
  readonly retryableStatusCodes: readonly number[];

  /**
   * Exchange or transport error codes considered retryable.
   */
  readonly retryableErrorCodes: readonly string[];

  /**
   * Error categories considered retryable.
   */
  readonly retryableErrorCategories: readonly ExchangeRetryErrorCategory[];

  /**
   * Whether state-changing operations may be retried.
   */
  readonly retryMutatingRequests: boolean;

  /**
   * Whether a Retry-After value may override calculated backoff.
   */
  readonly respectRetryAfter: boolean;

  /**
   * Maximum accepted Retry-After delay.
   */
  readonly maximumRetryAfterMs: number;

  /**
   * Whether the initial attempt is included in metrics.
   */
  readonly countInitialAttempt: boolean;
}

/**
 * Immutable operation description supplied to the policy.
 */
export interface ExchangeRetryOperation {
  readonly operationId: string;
  readonly operation: string;

  /**
   * Optional HTTP method for REST operations.
   */
  readonly method?: ExchangeHttpMethod;

  /**
   * Optional idempotency key.
   */
  readonly idempotencyKey?: string;

  /**
   * Whether the caller explicitly guarantees idempotency.
   */
  readonly idempotent?: boolean;

  /**
   * Whether the operation mutates remote exchange state.
   */
  readonly mutating: boolean;

  readonly context: ExchangeConnectorOperationContext;
}

/**
 * Failure details evaluated by the retry policy.
 */
export interface ExchangeRetryFailure {
  readonly errorCategory: ExchangeRetryErrorCategory;
  readonly errorCode?: string;
  readonly message: string;

  readonly statusCode?: number;
  readonly exchangeCode?: string;

  /**
   * Explicit retryability supplied by the failing subsystem.
   */
  readonly retryable?: boolean;

  /**
   * Optional server-provided retry delay.
   */
  readonly retryAfterMs?: number;

  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable retry-attempt context.
 */
export interface ExchangeRetryAttemptContext {
  readonly executionId: string;
  readonly attemptNumber: number;
  readonly maximumAttempts: number;
  readonly startedAt: number;
  readonly previousFailure?: ExchangeRetryFailure;
  readonly operation: ExchangeRetryOperation;
}

/**
 * Decision returned by the retry policy.
 */
export interface ExchangeRetryDecision {
  readonly shouldRetry: boolean;
  readonly reason: ExchangeRetryDecisionReason;

  readonly attemptNumber: number;
  readonly nextAttemptNumber?: number;

  readonly decidedAt: number;

  /**
   * Delay before the next attempt.
   */
  readonly delayMs?: number;

  /**
   * Absolute timestamp of the next attempt.
   */
  readonly nextAttemptAt?: number;

  readonly remainingAttempts: number;
}

/**
 * Result from a successful execution.
 */
export interface ExchangeRetrySuccessResult<TValue> {
  readonly status: "SUCCEEDED";
  readonly executionId: string;
  readonly value: TValue;
  readonly attemptCount: number;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly totalDurationMs: number;
  readonly totalDelayMs: number;
  readonly failures: readonly ExchangeRetryFailure[];
}

/**
 * Result from a failed retry execution.
 */
export interface ExchangeRetryFailureResult {
  readonly status:
    | "FAILED"
    | "DEADLINE_EXCEEDED"
    | "ATTEMPTS_EXHAUSTED";

  readonly executionId: string;
  readonly attemptCount: number;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly totalDurationMs: number;
  readonly totalDelayMs: number;

  readonly finalFailure: ExchangeRetryFailure;
  readonly failures: readonly ExchangeRetryFailure[];
}

/**
 * Result from a cancelled retry execution.
 */
export interface ExchangeRetryCancelledResult {
  readonly status: "CANCELLED";
  readonly executionId: string;
  readonly attemptCount: number;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly totalDurationMs: number;
  readonly totalDelayMs: number;
  readonly reason?: string;
  readonly failures: readonly ExchangeRetryFailure[];
}

/**
 * Union of retry execution outcomes.
 */
export type ExchangeRetryExecutionResult<TValue> =
  | ExchangeRetrySuccessResult<TValue>
  | ExchangeRetryFailureResult
  | ExchangeRetryCancelledResult;

/**
 * Function executed by the retry executor.
 */
export type ExchangeRetryOperationExecutor<TValue> = (
  context: ExchangeRetryAttemptContext,
) => Promise<TValue>;

/**
 * Maps an unknown thrown value into a structured retry failure.
 */
export type ExchangeRetryFailureMapper = (
  error: unknown,
  attempt: ExchangeRetryAttemptContext,
) => ExchangeRetryFailure;

/**
 * Retry execution request.
 */
export interface ExchangeRetryExecutionRequest<TValue> {
  readonly executionId: string;
  readonly operation: ExchangeRetryOperation;
  readonly execute: ExchangeRetryOperationExecutor<TValue>;
  readonly mapFailure: ExchangeRetryFailureMapper;
}

/**
 * Retry execution options.
 */
export interface ExchangeRetryExecutionOptions {
  readonly cancellationToken?: ExchangeRetryCancellationToken;

  /**
   * Optional maximum-attempt override.
   */
  readonly maximumAttempts?: number;

  /**
   * Optional absolute deadline override.
   */
  readonly deadlineAt?: number;
}

/**
 * Retry policy state snapshot.
 */
export interface ExchangeRetryPolicyStateSnapshot {
  readonly state: ExchangeRetryPolicyState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Retry metrics snapshot.
 */
export interface ExchangeRetryPolicyMetrics {
  readonly capturedAt: number;

  readonly totalExecutions: number;
  readonly successfulExecutions: number;
  readonly failedExecutions: number;
  readonly cancelledExecutions: number;
  readonly exhaustedExecutions: number;
  readonly deadlineExceededExecutions: number;

  readonly totalAttempts: number;
  readonly totalRetries: number;
  readonly totalDelayMs: number;

  readonly retryableFailures: number;
  readonly nonRetryableFailures: number;

  readonly activeExecutions: number;

  readonly minimumAttemptsPerExecution?: number;
  readonly maximumAttemptsPerExecution?: number;
  readonly averageAttemptsPerExecution?: number;

  readonly minimumDelayMs?: number;
  readonly maximumDelayMs?: number;
  readonly averageDelayMs?: number;

  readonly lastExecutionAt?: number;
  readonly lastSuccessAt?: number;
  readonly lastFailureAt?: number;
}

/**
 * Retry policy error categories.
 */
export type ExchangeRetryPolicyErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "STATE"
  | "SCHEDULER"
  | "CANCELLATION"
  | "FAILURE_MAPPING"
  | "INTERNAL";

/**
 * Structured retry policy error details.
 */
export interface ExchangeRetryPolicyErrorDetails {
  readonly category: ExchangeRetryPolicyErrorCategory;
  readonly code: string;
  readonly message: string;

  readonly executionId?: string;
  readonly operationId?: string;
  readonly operation?: string;
  readonly attemptNumber?: number;

  readonly retryable: boolean;
  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by retry infrastructure.
 */
export class ExchangeRetryPolicyError extends Error {
  public readonly details: ExchangeRetryPolicyErrorDetails;

  public constructor(details: ExchangeRetryPolicyErrorDetails) {
    super(details.message);

    this.name = "ExchangeRetryPolicyError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeRetryPolicyErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public toJSON(): ExchangeRetryPolicyErrorDetails {
    return this.details;
  }
}

/**
 * Retry policy lifecycle result.
 */
export interface ExchangeRetryPolicyLifecycleResult {
  readonly previousState: ExchangeRetryPolicyState;
  readonly currentState: ExchangeRetryPolicyState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Core retry policy contract.
 */
export interface ExchangeRetryPolicy {
  getState(): ExchangeRetryPolicyStateSnapshot;

  getMetrics(): ExchangeRetryPolicyMetrics;

  initialize(): Promise<ExchangeRetryPolicyLifecycleResult>;

  pause(reason?: string): Promise<ExchangeRetryPolicyLifecycleResult>;

  resume(): Promise<ExchangeRetryPolicyLifecycleResult>;

  /**
   * Evaluates whether a failed operation should be attempted again.
   */
  evaluate(
    operation: ExchangeRetryOperation,
    failure: ExchangeRetryFailure,
    attemptNumber: number,
    maximumAttempts?: number,
    deadlineAt?: number,
  ): ExchangeRetryDecision;

  /**
   * Executes an operation using the configured retry policy.
   */
  execute<TValue>(
    request: ExchangeRetryExecutionRequest<TValue>,
    options?: ExchangeRetryExecutionOptions,
  ): Promise<ExchangeRetryExecutionResult<TValue>>;

  close(reason?: string): Promise<ExchangeRetryPolicyLifecycleResult>;
}

/**
 * Validates retry policy configuration.
 */
export function validateExchangeRetryPolicyConfig(
  config: ExchangeRetryPolicyConfig,
): void {
  requirePositiveInteger(config.maximumAttempts, "maximumAttempts");
  requireNonNegativeNumber(config.initialDelayMs, "initialDelayMs");
  requireNonNegativeNumber(config.maximumDelayMs, "maximumDelayMs");
  requireMinimumNumber(
    config.backoffMultiplier,
    1,
    "backoffMultiplier",
  );
  requireRatio(config.jitterRatio, "jitterRatio");
  requireNonNegativeNumber(
    config.maximumRetryAfterMs,
    "maximumRetryAfterMs",
  );

  if (config.maximumDelayMs < config.initialDelayMs) {
    throw createConfigError(
      "MAXIMUM_DELAY_TOO_SMALL",
      "Maximum delay must be greater than or equal to initial delay.",
    );
  }

  config.retryableStatusCodes.forEach((statusCode, index) => {
    if (
      !Number.isInteger(statusCode) ||
      statusCode < 100 ||
      statusCode > 599
    ) {
      throw createConfigError(
        "INVALID_RETRYABLE_STATUS_CODE",
        `retryableStatusCodes[${index}] must be between 100 and 599.`,
      );
    }
  });

  requireUniqueValues(
    config.retryableStatusCodes,
    "retryableStatusCodes",
  );

  requireUniqueValues(
    config.retryableErrorCodes,
    "retryableErrorCodes",
  );

  requireUniqueValues(
    config.retryableErrorCategories,
    "retryableErrorCategories",
  );

  config.retryableErrorCodes.forEach((code, index) => {
    if (!code.trim()) {
      throw createConfigError(
        "EMPTY_RETRYABLE_ERROR_CODE",
        `retryableErrorCodes[${index}] must not be empty.`,
      );
    }
  });
}

/**
 * Validates a retry operation.
 */
export function validateExchangeRetryOperation(
  operation: ExchangeRetryOperation,
): void {
  requireNonEmptyString(
    operation.operationId,
    "operationId",
    normalizeTimestamp(operation.context?.createdAt),
  );

  requireNonEmptyString(
    operation.operation,
    "operation",
    normalizeTimestamp(operation.context?.createdAt),
  );

  validateContext(operation.context);

  if (
    operation.idempotencyKey !== undefined &&
    !operation.idempotencyKey.trim()
  ) {
    throw createOperationError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key must not be empty.",
      operation,
    );
  }
}

/**
 * Validates a structured retry failure.
 */
export function validateExchangeRetryFailure(
  failure: ExchangeRetryFailure,
): void {
  if (!failure.message.trim()) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "FAILURE_MESSAGE_REQUIRED",
      message: "Retry failure message must not be empty.",
      retryable: false,
      occurredAt: normalizeTimestamp(failure.occurredAt),
    });
  }

  if (
    !Number.isFinite(failure.occurredAt) ||
    failure.occurredAt < 0
  ) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "INVALID_FAILURE_TIMESTAMP",
      message:
        "Retry failure timestamp must be finite and non-negative.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    failure.statusCode !== undefined &&
    (!Number.isInteger(failure.statusCode) ||
      failure.statusCode < 100 ||
      failure.statusCode > 599)
  ) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "INVALID_FAILURE_STATUS_CODE",
      message:
        "Retry failure HTTP status code must be between 100 and 599.",
      retryable: false,
      occurredAt: failure.occurredAt,
    });
  }

  if (
    failure.retryAfterMs !== undefined &&
    (!Number.isFinite(failure.retryAfterMs) ||
      failure.retryAfterMs < 0)
  ) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "INVALID_RETRY_AFTER",
      message:
        "Retry-After duration must be finite and non-negative.",
      retryable: false,
      occurredAt: failure.occurredAt,
    });
  }
}

/**
 * Calculates deterministic exponential backoff before jitter.
 *
 * attemptNumber is the failed attempt number. For example:
 * - attempt 1 failure -> initial delay
 * - attempt 2 failure -> initial delay × multiplier
 */
export function calculateExchangeRetryBaseDelay(
  attemptNumber: number,
  config: ExchangeRetryPolicyConfig,
): number {
  requirePositiveInteger(attemptNumber, "attemptNumber");

  const exponent = Math.max(0, attemptNumber - 1);

  const calculated =
    config.initialDelayMs *
    Math.pow(config.backoffMultiplier, exponent);

  return Math.min(config.maximumDelayMs, calculated);
}

/**
 * Applies deterministic proportional jitter.
 */
export function applyExchangeRetryJitter(
  baseDelayMs: number,
  jitterRatio: number,
  jitterValue: number,
): number {
  requireNonNegativeNumber(baseDelayMs, "baseDelayMs");
  requireRatio(jitterRatio, "jitterRatio");

  if (
    !Number.isFinite(jitterValue) ||
    jitterValue < -1 ||
    jitterValue > 1
  ) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "INVALID_JITTER_VALUE",
      message: "Jitter value must be between -1 and 1.",
      retryable: false,
      occurredAt: 0,
    });
  }

  const adjustment =
    baseDelayMs * jitterRatio * jitterValue;

  return Math.max(0, Math.round(baseDelayMs + adjustment));
}

/**
 * Resolves retry delay using backoff, jitter, and optional Retry-After.
 */
export function calculateExchangeRetryDelay(
  attemptNumber: number,
  failure: ExchangeRetryFailure,
  config: ExchangeRetryPolicyConfig,
  jitterValue: number,
): number {
  const baseDelay = calculateExchangeRetryBaseDelay(
    attemptNumber,
    config,
  );

  const jitteredDelay = applyExchangeRetryJitter(
    baseDelay,
    config.jitterRatio,
    jitterValue,
  );

  if (
    !config.respectRetryAfter ||
    failure.retryAfterMs === undefined
  ) {
    return jitteredDelay;
  }

  const boundedRetryAfter = Math.min(
    config.maximumRetryAfterMs,
    failure.retryAfterMs,
  );

  return Math.max(jitteredDelay, boundedRetryAfter);
}

/**
 * Determines whether an HTTP method is safe.
 */
export function isExchangeRetrySafeMethod(
  method: ExchangeHttpMethod | undefined,
): boolean {
  return method === "GET";
}

/**
 * Determines whether an HTTP method is idempotent.
 */
export function isExchangeRetryIdempotentMethod(
  method: ExchangeHttpMethod | undefined,
): boolean {
  return (
    method === "GET" ||
    method === "PUT" ||
    method === "DELETE"
  );
}

/**
 * Determines whether an operation can safely be retried.
 */
export function isExchangeRetryOperationEligible(
  operation: ExchangeRetryOperation,
  config: ExchangeRetryPolicyConfig,
): boolean {
  if (!operation.mutating) {
    return true;
  }

  if (operation.idempotent === true) {
    return true;
  }

  if (operation.idempotencyKey?.trim()) {
    return true;
  }

  if (isExchangeRetryIdempotentMethod(operation.method)) {
    return true;
  }

  return config.retryMutatingRequests;
}

/**
 * Determines whether a failure matches configured retry criteria.
 */
export function isExchangeRetryableFailure(
  failure: ExchangeRetryFailure,
  config: ExchangeRetryPolicyConfig,
): boolean {
  if (failure.retryable !== undefined) {
    return failure.retryable;
  }

  if (
    failure.statusCode !== undefined &&
    config.retryableStatusCodes.includes(failure.statusCode)
  ) {
    return true;
  }

  if (
    failure.errorCode !== undefined &&
    config.retryableErrorCodes.includes(failure.errorCode)
  ) {
    return true;
  }

  if (
    failure.exchangeCode !== undefined &&
    config.retryableErrorCodes.includes(failure.exchangeCode)
  ) {
    return true;
  }

  return config.retryableErrorCategories.includes(
    failure.errorCategory,
  );
}

/**
 * Resolves the effective retry deadline.
 */
export function resolveExchangeRetryDeadline(
  operation: ExchangeRetryOperation,
  overrideDeadlineAt?: number,
): number | undefined {
  const deadlines = [
    operation.context.deadlineAt,
    overrideDeadlineAt,
  ].filter(
    (value): value is number => value !== undefined,
  );

  if (deadlines.length === 0) {
    return undefined;
  }

  return Math.min(...deadlines);
}

/**
 * Returns true when another attempt would violate the deadline.
 */
export function wouldExchangeRetryExceedDeadline(
  currentTime: number,
  delayMs: number,
  deadlineAt: number | undefined,
): boolean {
  if (deadlineAt === undefined) {
    return false;
  }

  return currentTime + delayMs > deadlineAt;
}

/**
 * Creates an immutable retry decision.
 */
export function createExchangeRetryDecision(
  shouldRetry: boolean,
  reason: ExchangeRetryDecisionReason,
  attemptNumber: number,
  maximumAttempts: number,
  decidedAt: number,
  delayMs?: number,
): ExchangeRetryDecision {
  const nextAttemptNumber = shouldRetry
    ? attemptNumber + 1
    : undefined;

  return Object.freeze({
    shouldRetry,
    reason,
    attemptNumber,
    nextAttemptNumber,
    decidedAt,
    delayMs,
    nextAttemptAt:
      shouldRetry && delayMs !== undefined
        ? decidedAt + delayMs
        : undefined,
    remainingAttempts: Math.max(
      0,
      maximumAttempts - attemptNumber,
    ),
  });
}

/**
 * Runtime type guard for retry policy states.
 */
export function isExchangeRetryPolicyState(
  value: unknown,
): value is ExchangeRetryPolicyState {
  return (
    value === "CREATED" ||
    value === "READY" ||
    value === "PAUSED" ||
    value === "CLOSED" ||
    value === "FAILED"
  );
}

/**
 * Runtime type guard for retry execution results.
 */
export function isExchangeRetryExecutionResult(
  value: unknown,
): value is ExchangeRetryExecutionResult<unknown> {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    value.status === "SUCCEEDED" ||
    value.status === "FAILED" ||
    value.status === "CANCELLED" ||
    value.status === "DEADLINE_EXCEEDED" ||
    value.status === "ATTEMPTS_EXHAUSTED"
  );
}

/**
 * Runtime type guard for retry policy errors.
 */
export function isExchangeRetryPolicyError(
  value: unknown,
): value is ExchangeRetryPolicyError {
  return value instanceof ExchangeRetryPolicyError;
}

function validateContext(
  context: ExchangeConnectorOperationContext | undefined,
): asserts context is ExchangeConnectorOperationContext {
  if (!context) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "RETRY_CONTEXT_REQUIRED",
      message:
        "A connector operation context is required for retry operations.",
      retryable: false,
      occurredAt: 0,
    });
  }

  requireNonEmptyString(
    context.operationId,
    "context.operationId",
    normalizeTimestamp(context.createdAt),
  );

  if (
    !Number.isFinite(context.createdAt) ||
    context.createdAt < 0
  ) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_TIMESTAMP",
      message:
        "Context creation timestamp must be finite and non-negative.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    context.deadlineAt !== undefined &&
    (!Number.isFinite(context.deadlineAt) ||
      context.deadlineAt < context.createdAt)
  ) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_DEADLINE",
      message:
        "Context deadline must be finite and greater than or equal to its creation time.",
      retryable: false,
      occurredAt: context.createdAt,
    });
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
  occurredAt: number,
): void {
  if (!value.trim()) {
    throw new ExchangeRetryPolicyError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt,
    });
  }
}

function requirePositiveInteger(
  value: number,
  path: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw createConfigError(
      "POSITIVE_INTEGER_REQUIRED",
      `${path} must be an integer greater than zero.`,
    );
  }
}

function requireNonNegativeNumber(
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw createConfigError(
      "NON_NEGATIVE_NUMBER_REQUIRED",
      `${path} must be a finite number greater than or equal to zero.`,
    );
  }
}

function requireMinimumNumber(
  value: number,
  minimum: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw createConfigError(
      "MINIMUM_NUMBER_REQUIRED",
      `${path} must be a finite number greater than or equal to ${minimum}.`,
    );
  }
}

function requireRatio(
  value: number,
  path: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw createConfigError(
      "INVALID_RATIO",
      `${path} must be between zero and one.`,
    );
  }
}

function requireUniqueValues<T>(
  values: readonly T[],
  path: string,
): void {
  if (new Set(values).size !== values.length) {
    throw createConfigError(
      "DUPLICATE_VALUES",
      `${path} must not contain duplicate values.`,
    );
  }
}

function createConfigError(
  code: string,
  message: string,
): ExchangeRetryPolicyError {
  return new ExchangeRetryPolicyError({
    category: "CONFIGURATION",
    code,
    message,
    retryable: false,
    occurredAt: 0,
  });
}

function createOperationError(
  code: string,
  message: string,
  operation: ExchangeRetryOperation,
): ExchangeRetryPolicyError {
  return new ExchangeRetryPolicyError({
    category: "VALIDATION",
    code,
    message,
    operationId: operation.operationId || undefined,
    operation: operation.operation || undefined,
    retryable: false,
    occurredAt: normalizeTimestamp(
      operation.context?.createdAt,
    ),
  });
}

function normalizeTimestamp(
  value: number | undefined,
): number {
  return value !== undefined &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : 0;
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}