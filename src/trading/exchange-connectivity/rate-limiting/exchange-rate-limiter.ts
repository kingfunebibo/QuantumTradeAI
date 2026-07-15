/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Exchange rate-limiting contracts.
 *
 * This module defines deterministic, transport-independent abstractions for
 * weighted request admission, queueing, prioritization, token-bucket state,
 * rejection handling, lifecycle management, and metrics.
 *
 * Concrete implementations must use injected clocks and schedulers rather than
 * Date.now(), setTimeout(), or Math.random() directly.
 */

import type { ExchangeConnectorOperationContext } from "../connectors/exchange-connector";
import type { ExchangeRestRequestPriority } from "../rest/exchange-rest-client";

/**
 * Rate limiter lifecycle states.
 */
export type ExchangeRateLimiterState =
  | "CREATED"
  | "READY"
  | "PAUSED"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

/**
 * Reasons why token acquisition may be rejected.
 */
export type ExchangeRateLimitRejectionReason =
  | "INVALID_REQUEST"
  | "LIMITER_NOT_READY"
  | "LIMITER_PAUSED"
  | "LIMITER_CLOSED"
  | "QUEUE_FULL"
  | "QUEUE_WAIT_EXCEEDED"
  | "REQUEST_DEADLINE_EXCEEDED"
  | "REQUEST_WEIGHT_EXCEEDS_CAPACITY"
  | "CANCELLED"
  | "INTERNAL";

/**
 * Admission result classifications.
 */
export type ExchangeRateLimitAcquisitionStatus =
  | "ACQUIRED"
  | "QUEUED"
  | "REJECTED"
  | "CANCELLED";

/**
 * Rate limiter clock abstraction.
 */
export interface ExchangeRateLimiterClock {
  now(): number;
}

/**
 * Scheduler abstraction used for deterministic waiting and wake-up behavior.
 */
export interface ExchangeRateLimiterScheduler {
  sleep(
    delayMs: number,
    cancellationToken?: ExchangeRateLimitCancellationToken,
  ): Promise<void>;
}

/**
 * Optional cancellation abstraction.
 */
export interface ExchangeRateLimitCancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;

  throwIfCancelled(): void;

  onCancelled(listener: (reason?: string) => void): () => void;
}

/**
 * Immutable rate limiter configuration.
 */
export interface ExchangeRateLimiterConfig {
  /**
   * Maximum number of tokens available at once.
   */
  readonly capacity: number;

  /**
   * Number of tokens restored on each refill.
   */
  readonly refillTokens: number;

  /**
   * Duration between refills.
   */
  readonly refillIntervalMs: number;

  /**
   * Maximum number of requests allowed in the waiting queue.
   */
  readonly maximumQueueSize: number;

  /**
   * Maximum time a queued request may wait.
   */
  readonly maximumQueueWaitMs: number;

  /**
   * Initial token count.
   *
   * Defaults to capacity when omitted.
   */
  readonly initialTokens?: number;

  /**
   * Whether lower-priority requests may be bypassed by higher-priority ones.
   */
  readonly priorityQueueEnabled: boolean;

  /**
   * Whether token refills preserve fractional values.
   */
  readonly allowFractionalTokens: boolean;
}

/**
 * Immutable token-acquisition request.
 */
export interface ExchangeRateLimitAcquireRequest {
  /**
   * Unique deterministic acquisition identifier.
   */
  readonly requestId: string;

  /**
   * Logical exchange operation name.
   */
  readonly operation: string;

  /**
   * Number of tokens required.
   */
  readonly weight: number;

  /**
   * Request priority.
   */
  readonly priority: ExchangeRestRequestPriority;

  /**
   * Optional maximum wait override.
   */
  readonly maximumWaitMs?: number;

  /**
   * Optional absolute deadline.
   */
  readonly deadlineAt?: number;

  /**
   * Shared connector context.
   */
  readonly context: ExchangeConnectorOperationContext;
}

/**
 * Execution options supplied separately from the immutable request.
 */
export interface ExchangeRateLimitAcquireOptions {
  readonly cancellationToken?: ExchangeRateLimitCancellationToken;
}

/**
 * Immutable queue entry snapshot.
 */
export interface ExchangeRateLimitQueueEntrySnapshot {
  readonly requestId: string;
  readonly operation: string;
  readonly weight: number;
  readonly priority: ExchangeRestRequestPriority;
  readonly enqueuedAt: number;
  readonly deadlineAt?: number;
  readonly position: number;
}

/**
 * Immutable rate limiter state snapshot.
 */
export interface ExchangeRateLimiterStateSnapshot {
  readonly state: ExchangeRateLimiterState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Immutable token-bucket snapshot.
 */
export interface ExchangeRateLimitBucketSnapshot {
  readonly capacity: number;
  readonly availableTokens: number;
  readonly refillTokens: number;
  readonly refillIntervalMs: number;
  readonly lastRefillAt: number;
  readonly nextRefillAt: number;
}

/**
 * Successful token acquisition.
 */
export interface ExchangeRateLimitAcquiredResult {
  readonly status: "ACQUIRED";
  readonly requestId: string;
  readonly operation: string;
  readonly weight: number;
  readonly acquiredAt: number;
  readonly queuedAt?: number;
  readonly waitedMs: number;
  readonly remainingTokens: number;
  readonly queuePosition?: number;
}

/**
 * Queued acquisition acknowledgement.
 */
export interface ExchangeRateLimitQueuedResult {
  readonly status: "QUEUED";
  readonly requestId: string;
  readonly operation: string;
  readonly weight: number;
  readonly queuedAt: number;
  readonly queuePosition: number;
  readonly estimatedAvailableAt?: number;
}

/**
 * Rejected token acquisition.
 */
export interface ExchangeRateLimitRejectedResult {
  readonly status: "REJECTED";
  readonly requestId: string;
  readonly operation: string;
  readonly weight: number;
  readonly rejectedAt: number;
  readonly reason: ExchangeRateLimitRejectionReason;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
}

/**
 * Cancelled token acquisition.
 */
export interface ExchangeRateLimitCancelledResult {
  readonly status: "CANCELLED";
  readonly requestId: string;
  readonly operation: string;
  readonly weight: number;
  readonly cancelledAt: number;
  readonly reason?: string;
}

/**
 * Union of all acquisition outcomes.
 */
export type ExchangeRateLimitAcquireResult =
  | ExchangeRateLimitAcquiredResult
  | ExchangeRateLimitQueuedResult
  | ExchangeRateLimitRejectedResult
  | ExchangeRateLimitCancelledResult;

/**
 * Metrics captured from the rate limiter.
 */
export interface ExchangeRateLimiterMetrics {
  readonly capturedAt: number;

  readonly totalRequests: number;
  readonly acquiredRequests: number;
  readonly queuedRequests: number;
  readonly rejectedRequests: number;
  readonly cancelledRequests: number;
  readonly timedOutRequests: number;

  readonly totalTokensConsumed: number;
  readonly totalRefills: number;
  readonly totalTokensRefilled: number;

  readonly currentQueueSize: number;
  readonly maximumObservedQueueSize: number;

  readonly totalWaitTimeMs: number;
  readonly minimumWaitTimeMs?: number;
  readonly maximumWaitTimeMs?: number;
  readonly averageWaitTimeMs?: number;

  readonly lastAcquiredAt?: number;
  readonly lastRejectedAt?: number;
  readonly lastRefillAt?: number;
}

/**
 * Initialization result.
 */
export interface ExchangeRateLimiterInitializationResult {
  readonly previousState: ExchangeRateLimiterState;
  readonly currentState: ExchangeRateLimiterState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Pause result.
 */
export interface ExchangeRateLimiterPauseResult {
  readonly previousState: ExchangeRateLimiterState;
  readonly currentState: ExchangeRateLimiterState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Resume result.
 */
export interface ExchangeRateLimiterResumeResult {
  readonly previousState: ExchangeRateLimiterState;
  readonly currentState: ExchangeRateLimiterState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Close options.
 */
export interface ExchangeRateLimiterCloseOptions {
  /**
   * Whether queued requests should be allowed to complete.
   */
  readonly graceful?: boolean;

  /**
   * Maximum graceful shutdown duration.
   */
  readonly timeoutMs?: number;

  readonly requestedAt?: number;
  readonly reason?: string;
}

/**
 * Close result.
 */
export interface ExchangeRateLimiterCloseResult {
  readonly previousState: ExchangeRateLimiterState;
  readonly currentState: ExchangeRateLimiterState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
  readonly cancelledQueuedRequestCount: number;
}

/**
 * Error categories produced by rate-limiting infrastructure.
 */
export type ExchangeRateLimiterErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "STATE"
  | "QUEUE"
  | "CANCELLATION"
  | "INTERNAL";

/**
 * Immutable rate limiter error details.
 */
export interface ExchangeRateLimiterErrorDetails {
  readonly category: ExchangeRateLimiterErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly operation?: string;
  readonly retryable: boolean;
  readonly occurredAt: number;
  readonly causeName?: string;
  readonly causeMessage?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by rate-limiting infrastructure.
 */
export class ExchangeRateLimiterError extends Error {
  public readonly details: ExchangeRateLimiterErrorDetails;

  public constructor(details: ExchangeRateLimiterErrorDetails) {
    super(details.message);

    this.name = "ExchangeRateLimiterError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeRateLimiterErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public toJSON(): ExchangeRateLimiterErrorDetails {
    return this.details;
  }
}

/**
 * Core rate limiter contract.
 */
export interface ExchangeRateLimiter {
  /**
   * Returns the latest lifecycle state.
   */
  getState(): ExchangeRateLimiterStateSnapshot;

  /**
   * Returns the latest token-bucket snapshot.
   */
  getBucket(): ExchangeRateLimitBucketSnapshot;

  /**
   * Returns the current waiting queue.
   */
  getQueue(): readonly ExchangeRateLimitQueueEntrySnapshot[];

  /**
   * Returns immutable metrics.
   */
  getMetrics(): ExchangeRateLimiterMetrics;

  /**
   * Initializes the limiter.
   *
   * Initialization should be idempotent.
   */
  initialize(): Promise<ExchangeRateLimiterInitializationResult>;

  /**
   * Attempts to acquire rate-limit capacity.
   *
   * Implementations may resolve immediately, queue the request, reject it, or
   * cancel it through the supplied token.
   */
  acquire(
    request: ExchangeRateLimitAcquireRequest,
    options?: ExchangeRateLimitAcquireOptions,
  ): Promise<ExchangeRateLimitAcquireResult>;

  /**
   * Pauses new acquisitions without destroying limiter state.
   */
  pause(reason?: string): Promise<ExchangeRateLimiterPauseResult>;

  /**
   * Resumes acquisitions after a pause.
   */
  resume(): Promise<ExchangeRateLimiterResumeResult>;

  /**
   * Closes the limiter and releases queued operations.
   */
  close(
    options?: ExchangeRateLimiterCloseOptions,
  ): Promise<ExchangeRateLimiterCloseResult>;
}

/**
 * Validates rate limiter configuration.
 */
export function validateExchangeRateLimiterConfig(
  config: ExchangeRateLimiterConfig,
): void {
  requirePositiveNumber(config.capacity, "capacity");
  requirePositiveNumber(config.refillTokens, "refillTokens");
  requirePositiveNumber(config.refillIntervalMs, "refillIntervalMs");
  requireNonNegativeInteger(config.maximumQueueSize, "maximumQueueSize");
  requireNonNegativeNumber(config.maximumQueueWaitMs, "maximumQueueWaitMs");

  if (
    !config.allowFractionalTokens &&
    (!Number.isInteger(config.capacity) ||
      !Number.isInteger(config.refillTokens))
  ) {
    throw createConfigError(
      "FRACTIONAL_TOKENS_DISABLED",
      "Capacity and refill token values must be integers when fractional tokens are disabled.",
    );
  }

  if (config.initialTokens !== undefined) {
    requireNonNegativeNumber(config.initialTokens, "initialTokens");

    if (config.initialTokens > config.capacity) {
      throw createConfigError(
        "INITIAL_TOKENS_EXCEED_CAPACITY",
        "Initial tokens must not exceed limiter capacity.",
      );
    }

    if (
      !config.allowFractionalTokens &&
      !Number.isInteger(config.initialTokens)
    ) {
      throw createConfigError(
        "FRACTIONAL_INITIAL_TOKENS_DISABLED",
        "Initial tokens must be an integer when fractional tokens are disabled.",
      );
    }
  }
}

/**
 * Validates a token-acquisition request.
 */
export function validateExchangeRateLimitAcquireRequest(
  request: ExchangeRateLimitAcquireRequest,
): void {
  requireNonEmptyString(
    request.requestId,
    "requestId",
    normalizeTimestamp(request.context?.createdAt),
  );

  requireNonEmptyString(
    request.operation,
    "operation",
    normalizeTimestamp(request.context?.createdAt),
  );

  validateContext(request.context);

  if (!Number.isFinite(request.weight) || request.weight <= 0) {
    throw createRequestError(
      "INVALID_REQUEST_WEIGHT",
      "Rate-limit request weight must be a finite number greater than zero.",
      request,
    );
  }

  if (
    request.maximumWaitMs !== undefined &&
    (!Number.isFinite(request.maximumWaitMs) ||
      request.maximumWaitMs < 0)
  ) {
    throw createRequestError(
      "INVALID_MAXIMUM_WAIT",
      "Maximum wait must be finite and non-negative.",
      request,
    );
  }

  if (
    request.deadlineAt !== undefined &&
    (!Number.isFinite(request.deadlineAt) ||
      request.deadlineAt < request.context.createdAt)
  ) {
    throw createRequestError(
      "INVALID_REQUEST_DEADLINE",
      "Request deadline must be finite and greater than or equal to context creation time.",
      request,
    );
  }

  if (
    request.context.deadlineAt !== undefined &&
    request.deadlineAt !== undefined &&
    request.deadlineAt > request.context.deadlineAt
  ) {
    throw createRequestError(
      "REQUEST_DEADLINE_EXCEEDS_CONTEXT",
      "Rate-limit request deadline must not exceed the operation context deadline.",
      request,
    );
  }
}

/**
 * Calculates the effective request deadline.
 */
export function resolveExchangeRateLimitDeadline(
  request: ExchangeRateLimitAcquireRequest,
  config: ExchangeRateLimiterConfig,
): number {
  const maximumWaitMs =
    request.maximumWaitMs ?? config.maximumQueueWaitMs;

  const waitDeadline =
    request.context.createdAt + maximumWaitMs;

  const deadlines = [
    waitDeadline,
    request.deadlineAt,
    request.context.deadlineAt,
  ].filter(
    (value): value is number => value !== undefined,
  );

  return Math.min(...deadlines);
}

/**
 * Calculates the number of refill intervals elapsed.
 */
export function calculateExchangeRateLimitRefillIntervals(
  lastRefillAt: number,
  currentTime: number,
  refillIntervalMs: number,
): number {
  if (
    !Number.isFinite(lastRefillAt) ||
    !Number.isFinite(currentTime) ||
    !Number.isFinite(refillIntervalMs) ||
    refillIntervalMs <= 0 ||
    currentTime <= lastRefillAt
  ) {
    return 0;
  }

  return Math.floor(
    (currentTime - lastRefillAt) / refillIntervalMs,
  );
}

/**
 * Calculates the available token count after deterministic refill.
 */
export function calculateExchangeRateLimitRefill(
  availableTokens: number,
  lastRefillAt: number,
  currentTime: number,
  config: ExchangeRateLimiterConfig,
): {
  readonly availableTokens: number;
  readonly refillIntervals: number;
  readonly tokensAdded: number;
  readonly lastRefillAt: number;
  readonly nextRefillAt: number;
} {
  const refillIntervals =
    calculateExchangeRateLimitRefillIntervals(
      lastRefillAt,
      currentTime,
      config.refillIntervalMs,
    );

  if (refillIntervals === 0) {
    return Object.freeze({
      availableTokens,
      refillIntervals: 0,
      tokensAdded: 0,
      lastRefillAt,
      nextRefillAt: lastRefillAt + config.refillIntervalMs,
    });
  }

  const potentialTokens =
    refillIntervals * config.refillTokens;

  const nextAvailableTokens = Math.min(
    config.capacity,
    availableTokens + potentialTokens,
  );

  const normalizedAvailableTokens =
    config.allowFractionalTokens
      ? nextAvailableTokens
      : Math.floor(nextAvailableTokens);

  const tokensAdded =
    normalizedAvailableTokens - availableTokens;

  const nextLastRefillAt =
    lastRefillAt +
    refillIntervals * config.refillIntervalMs;

  return Object.freeze({
    availableTokens: normalizedAvailableTokens,
    refillIntervals,
    tokensAdded,
    lastRefillAt: nextLastRefillAt,
    nextRefillAt:
      nextLastRefillAt + config.refillIntervalMs,
  });
}

/**
 * Estimates when sufficient capacity may become available.
 */
export function estimateExchangeRateLimitAvailability(
  requestedWeight: number,
  availableTokens: number,
  currentTime: number,
  nextRefillAt: number,
  config: ExchangeRateLimiterConfig,
): number | undefined {
  if (requestedWeight <= availableTokens) {
    return currentTime;
  }

  if (requestedWeight > config.capacity) {
    return undefined;
  }

  const missingTokens =
    requestedWeight - availableTokens;

  const intervalsRequired = Math.ceil(
    missingTokens / config.refillTokens,
  );

  return (
    nextRefillAt +
    Math.max(0, intervalsRequired - 1) *
      config.refillIntervalMs
  );
}

/**
 * Compares two queue entries using deterministic priority ordering.
 *
 * Higher priority is processed first. Equal priorities preserve FIFO order.
 */
export function compareExchangeRateLimitQueueEntries(
  left: ExchangeRateLimitQueueEntrySnapshot,
  right: ExchangeRateLimitQueueEntrySnapshot,
): number {
  const priorityDifference =
    getPriorityRank(right.priority) -
    getPriorityRank(left.priority);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  if (left.enqueuedAt !== right.enqueuedAt) {
    return left.enqueuedAt - right.enqueuedAt;
  }

  return left.requestId.localeCompare(right.requestId);
}

/**
 * Sorts queue entries deterministically.
 */
export function sortExchangeRateLimitQueue(
  entries: readonly ExchangeRateLimitQueueEntrySnapshot[],
  priorityQueueEnabled: boolean,
): readonly ExchangeRateLimitQueueEntrySnapshot[] {
  const sorted = [...entries];

  if (priorityQueueEnabled) {
    sorted.sort(compareExchangeRateLimitQueueEntries);
  } else {
    sorted.sort((left, right) => {
      if (left.enqueuedAt !== right.enqueuedAt) {
        return left.enqueuedAt - right.enqueuedAt;
      }

      return left.requestId.localeCompare(right.requestId);
    });
  }

  return Object.freeze(
    sorted.map((entry, index) =>
      Object.freeze({
        ...entry,
        position: index + 1,
      }),
    ),
  );
}

/**
 * Creates a rejected acquisition result.
 */
export function createExchangeRateLimitRejectedResult(
  request: ExchangeRateLimitAcquireRequest,
  reason: ExchangeRateLimitRejectionReason,
  message: string,
  rejectedAt: number,
  retryable: boolean,
  retryAfterMs?: number,
): ExchangeRateLimitRejectedResult {
  return Object.freeze({
    status: "REJECTED",
    requestId: request.requestId,
    operation: request.operation,
    weight: request.weight,
    rejectedAt,
    reason,
    message,
    retryable,
    retryAfterMs,
  });
}

/**
 * Returns true when a limiter state allows acquisition.
 */
export function isExchangeRateLimiterOperational(
  state: ExchangeRateLimiterState,
): boolean {
  return state === "READY";
}

/**
 * Returns true when a limiter state is terminal.
 */
export function isExchangeRateLimiterTerminal(
  state: ExchangeRateLimiterState,
): boolean {
  return state === "CLOSED";
}

/**
 * Runtime type guard for limiter states.
 */
export function isExchangeRateLimiterState(
  value: unknown,
): value is ExchangeRateLimiterState {
  return (
    value === "CREATED" ||
    value === "READY" ||
    value === "PAUSED" ||
    value === "CLOSING" ||
    value === "CLOSED" ||
    value === "FAILED"
  );
}

/**
 * Runtime type guard for acquisition results.
 */
export function isExchangeRateLimitAcquireResult(
  value: unknown,
): value is ExchangeRateLimitAcquireResult {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    value.status === "ACQUIRED" ||
    value.status === "QUEUED" ||
    value.status === "REJECTED" ||
    value.status === "CANCELLED"
  );
}

/**
 * Runtime type guard for rate limiter errors.
 */
export function isExchangeRateLimiterError(
  value: unknown,
): value is ExchangeRateLimiterError {
  return value instanceof ExchangeRateLimiterError;
}

function validateContext(
  context: ExchangeConnectorOperationContext | undefined,
): asserts context is ExchangeConnectorOperationContext {
  if (!context) {
    throw new ExchangeRateLimiterError({
      category: "VALIDATION",
      code: "RATE_LIMIT_CONTEXT_REQUIRED",
      message:
        "A connector operation context is required for rate-limit acquisition.",
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
    throw new ExchangeRateLimiterError({
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
    throw new ExchangeRateLimiterError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_DEADLINE",
      message:
        "Context deadline must be finite and greater than or equal to its creation time.",
      retryable: false,
      occurredAt: context.createdAt,
    });
  }
}

function requirePositiveNumber(
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw createConfigError(
      "POSITIVE_NUMBER_REQUIRED",
      `${path} must be a finite number greater than zero.`,
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

function requireNonNegativeInteger(
  value: number,
  path: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw createConfigError(
      "NON_NEGATIVE_INTEGER_REQUIRED",
      `${path} must be an integer greater than or equal to zero.`,
    );
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
  occurredAt: number,
): void {
  if (!value.trim()) {
    throw new ExchangeRateLimiterError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt,
    });
  }
}

function createConfigError(
  code: string,
  message: string,
): ExchangeRateLimiterError {
  return new ExchangeRateLimiterError({
    category: "CONFIGURATION",
    code,
    message,
    retryable: false,
    occurredAt: 0,
  });
}

function createRequestError(
  code: string,
  message: string,
  request: ExchangeRateLimitAcquireRequest,
): ExchangeRateLimiterError {
  return new ExchangeRateLimiterError({
    category: "VALIDATION",
    code,
    message,
    requestId: request.requestId || undefined,
    operation: request.operation || undefined,
    retryable: false,
    occurredAt: normalizeTimestamp(
      request.context?.createdAt,
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

function getPriorityRank(
  priority: ExchangeRestRequestPriority,
): number {
  switch (priority) {
    case "LOW":
      return 0;

    case "NORMAL":
      return 1;

    case "HIGH":
      return 2;

    case "CRITICAL":
      return 3;
  }
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