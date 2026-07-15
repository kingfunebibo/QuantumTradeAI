/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Deterministic exchange connector health-monitoring contracts.
 *
 * This module defines readiness, liveness, latency, failure tracking,
 * health-check execution, threshold evaluation, lifecycle management,
 * immutable snapshots, and metrics.
 *
 * Implementations must use injected clocks and schedulers. They must not call
 * Date.now() or setTimeout() directly.
 */

import type {
  ExchangeConnectorHealthSnapshot,
  ExchangeConnectorHealthStatus,
  ExchangeConnectorId,
  ExchangeConnectorOperationContext,
} from "../connectors/exchange-connector";

/**
 * Health monitor lifecycle states.
 */
export type ExchangeConnectorHealthMonitorState =
  | "CREATED"
  | "READY"
  | "RUNNING"
  | "PAUSED"
  | "STOPPING"
  | "STOPPED"
  | "FAILED"
  | "DESTROYED";

/**
 * Types of health checks supported by the framework.
 */
export type ExchangeConnectorHealthCheckType =
  | "LIVENESS"
  | "READINESS"
  | "REST_CONNECTIVITY"
  | "WEBSOCKET_CONNECTIVITY"
  | "AUTHENTICATION"
  | "SERVER_TIME"
  | "MARKET_DATA"
  | "TRADING"
  | "CUSTOM";

/**
 * Individual health-check outcomes.
 */
export type ExchangeConnectorHealthCheckStatus =
  | "PASSED"
  | "DEGRADED"
  | "FAILED"
  | "SKIPPED"
  | "TIMED_OUT"
  | "CANCELLED";

/**
 * Health-check criticality.
 */
export type ExchangeConnectorHealthCheckSeverity =
  | "INFORMATIONAL"
  | "OPTIONAL"
  | "REQUIRED"
  | "CRITICAL";

/**
 * Reasons why a health check may be skipped.
 */
export type ExchangeConnectorHealthCheckSkipReason =
  | "MONITOR_NOT_RUNNING"
  | "DEPENDENCY_UNAVAILABLE"
  | "CONNECTOR_NOT_CONNECTED"
  | "AUTHENTICATION_DISABLED"
  | "CAPABILITY_UNSUPPORTED"
  | "CHECK_DISABLED"
  | "CANCELLED"
  | "OTHER";

/**
 * Clock abstraction used by health monitoring.
 */
export interface ExchangeConnectorHealthClock {
  now(): number;
}

/**
 * Scheduler abstraction used for deterministic monitoring intervals.
 */
export interface ExchangeConnectorHealthScheduler {
  sleep(
    delayMs: number,
    cancellationToken?: ExchangeConnectorHealthCancellationToken,
  ): Promise<void>;
}

/**
 * Optional cancellation abstraction.
 */
export interface ExchangeConnectorHealthCancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;

  throwIfCancelled(): void;

  onCancelled(listener: (reason?: string) => void): () => void;
}

/**
 * Immutable health thresholds.
 */
export interface ExchangeConnectorHealthThresholds {
  /**
   * Latency at or above this value degrades the connector.
   */
  readonly degradedLatencyMs: number;

  /**
   * Latency at or above this value makes the connector unhealthy.
   */
  readonly unhealthyLatencyMs: number;

  /**
   * Consecutive failures required before degrading health.
   */
  readonly degradedConsecutiveFailures: number;

  /**
   * Consecutive failures required before marking health unhealthy.
   */
  readonly unhealthyConsecutiveFailures: number;

  /**
   * Maximum time since the last successful communication before degradation.
   */
  readonly degradedStalenessMs: number;

  /**
   * Maximum time since the last successful communication before becoming
   * unhealthy.
   */
  readonly unhealthyStalenessMs: number;

  /**
   * Minimum number of successful checks required before reporting healthy.
   */
  readonly minimumSuccessfulChecksForHealthy: number;
}

/**
 * Immutable health monitor configuration.
 */
export interface ExchangeConnectorHealthMonitorConfig {
  readonly connectorId: ExchangeConnectorId;

  /**
   * Whether scheduled background monitoring is enabled.
   */
  readonly enabled: boolean;

  /**
   * Interval between scheduled health-check cycles.
   */
  readonly checkIntervalMs: number;

  /**
   * Maximum duration of one complete health-check cycle.
   */
  readonly cycleTimeoutMs: number;

  /**
   * Maximum duration of an individual health check.
   */
  readonly individualCheckTimeoutMs: number;

  /**
   * Number of recent check results retained in memory.
   */
  readonly maximumHistoryEntries: number;

  /**
   * Whether all checks run concurrently.
   *
   * Deterministic implementations must preserve stable result ordering even
   * when checks execute concurrently.
   */
  readonly runChecksConcurrently: boolean;

  /**
   * Whether monitoring should stop after a critical check failure.
   */
  readonly stopCycleOnCriticalFailure: boolean;

  readonly thresholds: ExchangeConnectorHealthThresholds;
}

/**
 * Immutable definition of a registered health check.
 */
export interface ExchangeConnectorHealthCheckDefinition {
  readonly checkId: string;
  readonly name: string;
  readonly type: ExchangeConnectorHealthCheckType;
  readonly severity: ExchangeConnectorHealthCheckSeverity;
  readonly enabled: boolean;

  /**
   * Optional timeout override.
   */
  readonly timeoutMs?: number;

  /**
   * Stable deterministic execution order.
   */
  readonly order: number;

  /**
   * Optional immutable metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Context supplied to each health-check executor.
 */
export interface ExchangeConnectorHealthCheckContext {
  readonly cycleId: string;
  readonly check: ExchangeConnectorHealthCheckDefinition;
  readonly startedAt: number;
  readonly connectorId: ExchangeConnectorId;
  readonly operationContext: ExchangeConnectorOperationContext;
}

/**
 * Successful health-check value.
 */
export interface ExchangeConnectorHealthCheckValue {
  readonly status: Exclude<
    ExchangeConnectorHealthCheckStatus,
    "SKIPPED" | "TIMED_OUT" | "CANCELLED"
  >;

  readonly code?: string;
  readonly message?: string;

  /**
   * Measured round-trip latency.
   */
  readonly latencyMs?: number;

  /**
   * Timestamp of the last confirmed successful connector communication.
   */
  readonly lastSuccessfulCommunicationAt?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Function responsible for executing one health check.
 */
export type ExchangeConnectorHealthCheckExecutor = (
  context: ExchangeConnectorHealthCheckContext,
  cancellationToken?: ExchangeConnectorHealthCancellationToken,
) => Promise<ExchangeConnectorHealthCheckValue>;

/**
 * Registered health check.
 */
export interface ExchangeConnectorHealthCheckRegistration {
  readonly definition: ExchangeConnectorHealthCheckDefinition;
  readonly execute: ExchangeConnectorHealthCheckExecutor;
}

/**
 * Immutable result of one health check.
 */
export interface ExchangeConnectorHealthCheckResult {
  readonly cycleId: string;
  readonly checkId: string;
  readonly name: string;
  readonly type: ExchangeConnectorHealthCheckType;
  readonly severity: ExchangeConnectorHealthCheckSeverity;

  readonly status: ExchangeConnectorHealthCheckStatus;

  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;

  readonly latencyMs?: number;
  readonly lastSuccessfulCommunicationAt?: number;

  readonly code?: string;
  readonly message?: string;

  readonly skipReason?: ExchangeConnectorHealthCheckSkipReason;

  readonly retryable?: boolean;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable health-check cycle request.
 */
export interface ExchangeConnectorHealthCheckCycleRequest {
  readonly cycleId: string;
  readonly context: ExchangeConnectorOperationContext;

  /**
   * Optional subset of check IDs.
   *
   * When omitted, all enabled checks execute.
   */
  readonly checkIds?: readonly string[];

  /**
   * Optional cycle timeout override.
   */
  readonly timeoutMs?: number;
}

/**
 * Health-check cycle execution options.
 */
export interface ExchangeConnectorHealthCheckCycleOptions {
  readonly cancellationToken?: ExchangeConnectorHealthCancellationToken;
}

/**
 * Immutable cycle result.
 */
export interface ExchangeConnectorHealthCheckCycleResult {
  readonly cycleId: string;
  readonly connectorId: ExchangeConnectorId;

  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;

  readonly status: ExchangeConnectorHealthStatus;

  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly degradedChecks: number;
  readonly failedChecks: number;
  readonly skippedChecks: number;
  readonly timedOutChecks: number;
  readonly cancelledChecks: number;

  readonly results: readonly ExchangeConnectorHealthCheckResult[];

  readonly snapshot: ExchangeConnectorHealthSnapshot;
}

/**
 * Health monitor lifecycle snapshot.
 */
export interface ExchangeConnectorHealthMonitorStateSnapshot {
  readonly connectorId: ExchangeConnectorId;
  readonly state: ExchangeConnectorHealthMonitorState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Aggregated health history entry.
 */
export interface ExchangeConnectorHealthHistoryEntry {
  readonly cycleId: string;
  readonly status: ExchangeConnectorHealthStatus;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly passedChecks: number;
  readonly degradedChecks: number;
  readonly failedChecks: number;
}

/**
 * Health monitor metrics.
 */
export interface ExchangeConnectorHealthMonitorMetrics {
  readonly connectorId: ExchangeConnectorId;
  readonly capturedAt: number;

  readonly totalCycles: number;
  readonly completedCycles: number;
  readonly failedCycles: number;
  readonly cancelledCycles: number;

  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly degradedChecks: number;
  readonly failedChecks: number;
  readonly skippedChecks: number;
  readonly timedOutChecks: number;
  readonly cancelledChecks: number;

  readonly consecutiveSuccessfulCycles: number;
  readonly consecutiveFailedCycles: number;

  readonly currentHealthStatus: ExchangeConnectorHealthStatus;

  readonly averageCycleDurationMs?: number;
  readonly minimumCycleDurationMs?: number;
  readonly maximumCycleDurationMs?: number;

  readonly averageLatencyMs?: number;
  readonly minimumLatencyMs?: number;
  readonly maximumLatencyMs?: number;

  readonly lastCycleStartedAt?: number;
  readonly lastCycleCompletedAt?: number;
  readonly lastSuccessfulCycleAt?: number;
  readonly lastFailedCycleAt?: number;
  readonly lastSuccessfulCommunicationAt?: number;
}

/**
 * Health monitor lifecycle result.
 */
export interface ExchangeConnectorHealthMonitorLifecycleResult {
  readonly connectorId: ExchangeConnectorId;
  readonly previousState: ExchangeConnectorHealthMonitorState;
  readonly currentState: ExchangeConnectorHealthMonitorState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Health monitor stop options.
 */
export interface ExchangeConnectorHealthMonitorStopOptions {
  readonly graceful?: boolean;
  readonly timeoutMs?: number;
  readonly requestedAt?: number;
  readonly reason?: string;
}

/**
 * Health monitor errors.
 */
export type ExchangeConnectorHealthMonitorErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "STATE"
  | "CHECK_EXECUTION"
  | "TIMEOUT"
  | "CANCELLATION"
  | "SCHEDULER"
  | "INTERNAL";

/**
 * Immutable health monitor error details.
 */
export interface ExchangeConnectorHealthMonitorErrorDetails {
  readonly category: ExchangeConnectorHealthMonitorErrorCategory;
  readonly code: string;
  readonly message: string;

  readonly connectorId?: ExchangeConnectorId;
  readonly cycleId?: string;
  readonly checkId?: string;

  readonly retryable: boolean;
  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by connector health-monitoring infrastructure.
 */
export class ExchangeConnectorHealthMonitorError extends Error {
  public readonly details: ExchangeConnectorHealthMonitorErrorDetails;

  public constructor(
    details: ExchangeConnectorHealthMonitorErrorDetails,
  ) {
    super(details.message);

    this.name = "ExchangeConnectorHealthMonitorError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeConnectorHealthMonitorErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public toJSON(): ExchangeConnectorHealthMonitorErrorDetails {
    return this.details;
  }
}

/**
 * Core connector health-monitor contract.
 */
export interface ExchangeConnectorHealthMonitor {
  getState(): ExchangeConnectorHealthMonitorStateSnapshot;

  getHealth(): ExchangeConnectorHealthSnapshot;

  getMetrics(): ExchangeConnectorHealthMonitorMetrics;

  getHistory(): readonly ExchangeConnectorHealthHistoryEntry[];

  getChecks(): readonly ExchangeConnectorHealthCheckDefinition[];

  registerCheck(
    registration: ExchangeConnectorHealthCheckRegistration,
  ): void;

  unregisterCheck(checkId: string): boolean;

  initialize(): Promise<ExchangeConnectorHealthMonitorLifecycleResult>;

  start(): Promise<ExchangeConnectorHealthMonitorLifecycleResult>;

  pause(reason?: string): Promise<ExchangeConnectorHealthMonitorLifecycleResult>;

  resume(): Promise<ExchangeConnectorHealthMonitorLifecycleResult>;

  runCycle(
    request: ExchangeConnectorHealthCheckCycleRequest,
    options?: ExchangeConnectorHealthCheckCycleOptions,
  ): Promise<ExchangeConnectorHealthCheckCycleResult>;

  stop(
    options?: ExchangeConnectorHealthMonitorStopOptions,
  ): Promise<ExchangeConnectorHealthMonitorLifecycleResult>;

  destroy(
    options?: ExchangeConnectorHealthMonitorStopOptions,
  ): Promise<ExchangeConnectorHealthMonitorLifecycleResult>;
}

/**
 * Validates health monitor configuration.
 */
export function validateExchangeConnectorHealthMonitorConfig(
  config: ExchangeConnectorHealthMonitorConfig,
): void {
  requireNonEmptyString(config.connectorId, "connectorId", 0);

  requirePositiveNumber(config.checkIntervalMs, "checkIntervalMs");
  requirePositiveNumber(config.cycleTimeoutMs, "cycleTimeoutMs");
  requirePositiveNumber(
    config.individualCheckTimeoutMs,
    "individualCheckTimeoutMs",
  );
  requirePositiveInteger(
    config.maximumHistoryEntries,
    "maximumHistoryEntries",
  );

  if (config.individualCheckTimeoutMs > config.cycleTimeoutMs) {
    throw createConfigError(
      "CHECK_TIMEOUT_EXCEEDS_CYCLE_TIMEOUT",
      "Individual check timeout must not exceed the cycle timeout.",
      config.connectorId,
    );
  }

  validateThresholds(config.thresholds, config.connectorId);
}

/**
 * Validates a health-check definition.
 */
export function validateExchangeConnectorHealthCheckDefinition(
  definition: ExchangeConnectorHealthCheckDefinition,
): void {
  requireNonEmptyString(definition.checkId, "checkId", 0);
  requireNonEmptyString(definition.name, "name", 0);

  if (!Number.isInteger(definition.order) || definition.order < 0) {
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "INVALID_CHECK_ORDER",
      message:
        "Health-check order must be an integer greater than or equal to zero.",
      checkId: definition.checkId || undefined,
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    definition.timeoutMs !== undefined &&
    (!Number.isFinite(definition.timeoutMs) ||
      definition.timeoutMs <= 0)
  ) {
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "INVALID_CHECK_TIMEOUT",
      message:
        "Health-check timeout must be a finite number greater than zero.",
      checkId: definition.checkId || undefined,
      retryable: false,
      occurredAt: 0,
    });
  }
}

/**
 * Validates a health-check cycle request.
 */
export function validateExchangeConnectorHealthCheckCycleRequest(
  request: ExchangeConnectorHealthCheckCycleRequest,
): void {
  requireNonEmptyString(
    request.cycleId,
    "cycleId",
    normalizeTimestamp(request.context?.createdAt),
  );

  validateOperationContext(request.context);

  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) ||
      request.timeoutMs <= 0)
  ) {
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "INVALID_CYCLE_TIMEOUT",
      message:
        "Health-check cycle timeout must be a finite number greater than zero.",
      cycleId: request.cycleId || undefined,
      retryable: false,
      occurredAt: request.context.createdAt,
    });
  }

  if (request.checkIds) {
    const normalizedIds = request.checkIds.map((checkId) =>
      checkId.trim(),
    );

    if (normalizedIds.some((checkId) => checkId.length === 0)) {
      throw new ExchangeConnectorHealthMonitorError({
        category: "VALIDATION",
        code: "EMPTY_CHECK_ID",
        message:
          "Health-check cycle check IDs must not contain empty values.",
        cycleId: request.cycleId || undefined,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    if (new Set(normalizedIds).size !== normalizedIds.length) {
      throw new ExchangeConnectorHealthMonitorError({
        category: "VALIDATION",
        code: "DUPLICATE_CHECK_IDS",
        message:
          "Health-check cycle check IDs must not contain duplicates.",
        cycleId: request.cycleId || undefined,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }
  }
}

/**
 * Sorts health checks deterministically.
 */
export function sortExchangeConnectorHealthChecks(
  checks: readonly ExchangeConnectorHealthCheckDefinition[],
): readonly ExchangeConnectorHealthCheckDefinition[] {
  return Object.freeze(
    [...checks].sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.checkId.localeCompare(right.checkId);
    }),
  );
}

/**
 * Evaluates overall connector health from check results and thresholds.
 */
export function evaluateExchangeConnectorHealthStatus(
  results: readonly ExchangeConnectorHealthCheckResult[],
  thresholds: ExchangeConnectorHealthThresholds,
  consecutiveFailures: number,
  successfulChecks: number,
  currentTime: number,
  lastSuccessfulCommunicationAt?: number,
): ExchangeConnectorHealthStatus {
  const criticalFailure = results.some(
    (result) =>
      result.severity === "CRITICAL" &&
      (result.status === "FAILED" ||
        result.status === "TIMED_OUT"),
  );

  if (criticalFailure) {
    return "UNHEALTHY";
  }

  if (
    consecutiveFailures >=
    thresholds.unhealthyConsecutiveFailures
  ) {
    return "UNHEALTHY";
  }

  const maximumLatency = getMaximumLatency(results);

  if (
    maximumLatency !== undefined &&
    maximumLatency >= thresholds.unhealthyLatencyMs
  ) {
    return "UNHEALTHY";
  }

  if (
    lastSuccessfulCommunicationAt !== undefined &&
    currentTime - lastSuccessfulCommunicationAt >=
      thresholds.unhealthyStalenessMs
  ) {
    return "UNHEALTHY";
  }

  const requiredFailure = results.some(
    (result) =>
      (result.severity === "REQUIRED" ||
        result.severity === "CRITICAL") &&
      result.status === "FAILED",
  );

  if (requiredFailure) {
    return "DEGRADED";
  }

  if (
    consecutiveFailures >=
    thresholds.degradedConsecutiveFailures
  ) {
    return "DEGRADED";
  }

  if (
    maximumLatency !== undefined &&
    maximumLatency >= thresholds.degradedLatencyMs
  ) {
    return "DEGRADED";
  }

  if (
    lastSuccessfulCommunicationAt !== undefined &&
    currentTime - lastSuccessfulCommunicationAt >=
      thresholds.degradedStalenessMs
  ) {
    return "DEGRADED";
  }

  const degradedResult = results.some(
    (result) =>
      result.status === "DEGRADED" ||
      result.status === "TIMED_OUT",
  );

  if (degradedResult) {
    return "DEGRADED";
  }

  if (
    successfulChecks <
    thresholds.minimumSuccessfulChecksForHealthy
  ) {
    return "UNKNOWN";
  }

  return "HEALTHY";
}

/**
 * Builds an immutable connector health snapshot.
 */
export function createExchangeConnectorHealthSnapshot(
  connectorId: ExchangeConnectorId,
  status: ExchangeConnectorHealthStatus,
  checkedAt: number,
  results: readonly ExchangeConnectorHealthCheckResult[],
): ExchangeConnectorHealthSnapshot {
  const latencyValues = results
    .map((result) => result.latencyMs)
    .filter((value): value is number => value !== undefined);

  const lastSuccessfulCommunicationValues = results
    .map((result) => result.lastSuccessfulCommunicationAt)
    .filter((value): value is number => value !== undefined);

  const failedResults = results.filter(
    (result) =>
      result.status === "FAILED" ||
      result.status === "TIMED_OUT",
  );

  const mostRecentFailure = [...failedResults].sort(
    (left, right) => right.completedAt - left.completedAt,
  )[0];

  return Object.freeze({
    connectorId,
    status,
    checkedAt,
    latencyMs:
      latencyValues.length > 0
        ? Math.max(...latencyValues)
        : undefined,
    lastSuccessfulCommunicationAt:
      lastSuccessfulCommunicationValues.length > 0
        ? Math.max(...lastSuccessfulCommunicationValues)
        : undefined,
    lastFailureAt: mostRecentFailure?.completedAt,
    code: mostRecentFailure?.code,
    message: mostRecentFailure?.message,
    details: Object.freeze({
      totalChecks: results.length,
      passedChecks: countStatus(results, "PASSED"),
      degradedChecks: countStatus(results, "DEGRADED"),
      failedChecks: countStatus(results, "FAILED"),
      skippedChecks: countStatus(results, "SKIPPED"),
      timedOutChecks: countStatus(results, "TIMED_OUT"),
      cancelledChecks: countStatus(results, "CANCELLED"),
    }),
  });
}

/**
 * Creates an immutable health-check result.
 */
export function createExchangeConnectorHealthCheckResult(
  input: {
    readonly cycleId: string;
    readonly definition: ExchangeConnectorHealthCheckDefinition;
    readonly status: ExchangeConnectorHealthCheckStatus;
    readonly startedAt: number;
    readonly completedAt: number;
    readonly latencyMs?: number;
    readonly lastSuccessfulCommunicationAt?: number;
    readonly code?: string;
    readonly message?: string;
    readonly skipReason?: ExchangeConnectorHealthCheckSkipReason;
    readonly retryable?: boolean;
    readonly causeName?: string;
    readonly causeMessage?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): ExchangeConnectorHealthCheckResult {
  if (input.completedAt < input.startedAt) {
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "CHECK_COMPLETION_BEFORE_START",
      message:
        "Health-check completion timestamp must not be earlier than its start timestamp.",
      cycleId: input.cycleId,
      checkId: input.definition.checkId,
      retryable: false,
      occurredAt: normalizeTimestamp(input.startedAt),
    });
  }

  return Object.freeze({
    cycleId: input.cycleId,
    checkId: input.definition.checkId,
    name: input.definition.name,
    type: input.definition.type,
    severity: input.definition.severity,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.completedAt - input.startedAt,
    latencyMs: input.latencyMs,
    lastSuccessfulCommunicationAt:
      input.lastSuccessfulCommunicationAt,
    code: input.code,
    message: input.message,
    skipReason: input.skipReason,
    retryable: input.retryable,
    causeName: input.causeName,
    causeMessage: input.causeMessage,
    metadata: input.metadata
      ? Object.freeze({ ...input.metadata })
      : undefined,
  });
}

/**
 * Returns true when the monitor can execute checks.
 */
export function isExchangeConnectorHealthMonitorOperational(
  state: ExchangeConnectorHealthMonitorState,
): boolean {
  return state === "READY" || state === "RUNNING";
}

/**
 * Returns true when background monitoring is active.
 */
export function isExchangeConnectorHealthMonitorRunning(
  state: ExchangeConnectorHealthMonitorState,
): boolean {
  return state === "RUNNING";
}

/**
 * Returns true when the monitor is permanently unavailable.
 */
export function isExchangeConnectorHealthMonitorTerminal(
  state: ExchangeConnectorHealthMonitorState,
): boolean {
  return state === "DESTROYED";
}

/**
 * Runtime type guard for health monitor states.
 */
export function isExchangeConnectorHealthMonitorState(
  value: unknown,
): value is ExchangeConnectorHealthMonitorState {
  return (
    value === "CREATED" ||
    value === "READY" ||
    value === "RUNNING" ||
    value === "PAUSED" ||
    value === "STOPPING" ||
    value === "STOPPED" ||
    value === "FAILED" ||
    value === "DESTROYED"
  );
}

/**
 * Runtime type guard for health-check statuses.
 */
export function isExchangeConnectorHealthCheckStatus(
  value: unknown,
): value is ExchangeConnectorHealthCheckStatus {
  return (
    value === "PASSED" ||
    value === "DEGRADED" ||
    value === "FAILED" ||
    value === "SKIPPED" ||
    value === "TIMED_OUT" ||
    value === "CANCELLED"
  );
}

/**
 * Runtime type guard for health-monitor errors.
 */
export function isExchangeConnectorHealthMonitorError(
  value: unknown,
): value is ExchangeConnectorHealthMonitorError {
  return value instanceof ExchangeConnectorHealthMonitorError;
}

function validateThresholds(
  thresholds: ExchangeConnectorHealthThresholds,
  connectorId: ExchangeConnectorId,
): void {
  requireNonNegativeNumber(
    thresholds.degradedLatencyMs,
    "thresholds.degradedLatencyMs",
  );

  requireNonNegativeNumber(
    thresholds.unhealthyLatencyMs,
    "thresholds.unhealthyLatencyMs",
  );

  requirePositiveInteger(
    thresholds.degradedConsecutiveFailures,
    "thresholds.degradedConsecutiveFailures",
  );

  requirePositiveInteger(
    thresholds.unhealthyConsecutiveFailures,
    "thresholds.unhealthyConsecutiveFailures",
  );

  requireNonNegativeNumber(
    thresholds.degradedStalenessMs,
    "thresholds.degradedStalenessMs",
  );

  requireNonNegativeNumber(
    thresholds.unhealthyStalenessMs,
    "thresholds.unhealthyStalenessMs",
  );

  requirePositiveInteger(
    thresholds.minimumSuccessfulChecksForHealthy,
    "thresholds.minimumSuccessfulChecksForHealthy",
  );

  if (
    thresholds.unhealthyLatencyMs <
    thresholds.degradedLatencyMs
  ) {
    throw createConfigError(
      "UNHEALTHY_LATENCY_TOO_SMALL",
      "Unhealthy latency threshold must be greater than or equal to degraded latency threshold.",
      connectorId,
    );
  }

  if (
    thresholds.unhealthyConsecutiveFailures <
    thresholds.degradedConsecutiveFailures
  ) {
    throw createConfigError(
      "UNHEALTHY_FAILURE_THRESHOLD_TOO_SMALL",
      "Unhealthy failure threshold must be greater than or equal to degraded failure threshold.",
      connectorId,
    );
  }

  if (
    thresholds.unhealthyStalenessMs <
    thresholds.degradedStalenessMs
  ) {
    throw createConfigError(
      "UNHEALTHY_STALENESS_TOO_SMALL",
      "Unhealthy staleness threshold must be greater than or equal to degraded staleness threshold.",
      connectorId,
    );
  }
}

function validateOperationContext(
  context: ExchangeConnectorOperationContext | undefined,
): asserts context is ExchangeConnectorOperationContext {
  if (!context) {
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "HEALTH_CONTEXT_REQUIRED",
      message:
        "A connector operation context is required for health-check cycles.",
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
    throw new ExchangeConnectorHealthMonitorError({
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
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_DEADLINE",
      message:
        "Context deadline must be finite and greater than or equal to its creation time.",
      retryable: false,
      occurredAt: context.createdAt,
    });
  }
}

function getMaximumLatency(
  results: readonly ExchangeConnectorHealthCheckResult[],
): number | undefined {
  const latencies = results
    .map((result) => result.latencyMs)
    .filter((value): value is number => value !== undefined);

  return latencies.length > 0
    ? Math.max(...latencies)
    : undefined;
}

function countStatus(
  results: readonly ExchangeConnectorHealthCheckResult[],
  status: ExchangeConnectorHealthCheckStatus,
): number {
  return results.filter(
    (result) => result.status === status,
  ).length;
}

function requireNonEmptyString(
  value: string,
  path: string,
  occurredAt: number,
): void {
  if (!value.trim()) {
    throw new ExchangeConnectorHealthMonitorError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt,
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

function createConfigError(
  code: string,
  message: string,
  connectorId?: ExchangeConnectorId,
): ExchangeConnectorHealthMonitorError {
  return new ExchangeConnectorHealthMonitorError({
    category: "CONFIGURATION",
    code,
    message,
    connectorId,
    retryable: false,
    occurredAt: 0,
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