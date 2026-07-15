/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Exchange connector lifecycle manager contracts.
 *
 * This module coordinates connector initialization, connection,
 * disconnection, destruction, health-monitor lifecycle, registry refresh,
 * deterministic state transitions, batch operations, and lifecycle metrics.
 */

import type {
  ExchangeConnector,
  ExchangeConnectorHealthStatus,
  ExchangeConnectorId,
  ExchangeConnectorLifecycleResult,
  ExchangeConnectorLifecycleState,
  ExchangeConnectorOperationContext,
} from "../connectors/exchange-connector";
import type {
  ExchangeConnectorHealthCheckCycleResult,
  ExchangeConnectorHealthMonitor,
  ExchangeConnectorHealthMonitorLifecycleResult,
} from "../health/exchange-connector-health-monitor";
import type {
  ExchangeConnectorRegistry,
  ExchangeConnectorRegistryEntry,
} from "../registry/exchange-connector-registry";

/**
 * Lifecycle manager states.
 */
export type ExchangeConnectorLifecycleManagerState =
  | "CREATED"
  | "READY"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "FAILED"
  | "DESTROYED";

/**
 * Supported connector lifecycle operations.
 */
export type ExchangeConnectorManagedOperation =
  | "INITIALIZE"
  | "CONNECT"
  | "DISCONNECT"
  | "DESTROY"
  | "START_HEALTH_MONITOR"
  | "STOP_HEALTH_MONITOR"
  | "RUN_HEALTH_CHECK"
  | "REFRESH_REGISTRY";

/**
 * Managed operation statuses.
 */
export type ExchangeConnectorManagedOperationStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

/**
 * Reasons why an operation may be skipped.
 */
export type ExchangeConnectorManagedOperationSkipReason =
  | "CONNECTOR_NOT_FOUND"
  | "ALREADY_IN_TARGET_STATE"
  | "INVALID_CURRENT_STATE"
  | "HEALTH_MONITOR_NOT_REGISTERED"
  | "HEALTH_MONITOR_ALREADY_RUNNING"
  | "HEALTH_MONITOR_NOT_RUNNING"
  | "MANAGER_NOT_READY"
  | "MANAGER_STOPPING"
  | "MANAGER_STOPPED"
  | "MANAGER_DESTROYED"
  | "DEPENDENCY_UNAVAILABLE";

/**
 * Manager clock abstraction.
 */
export interface ExchangeConnectorLifecycleManagerClock {
  now(): number;
}

/**
 * Optional cancellation abstraction.
 */
export interface ExchangeConnectorLifecycleCancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;

  throwIfCancelled(): void;

  onCancelled(listener: (reason?: string) => void): () => void;
}

/**
 * Immutable lifecycle manager configuration.
 */
export interface ExchangeConnectorLifecycleManagerConfig {
  /**
   * Whether connector health monitors should start automatically after a
   * successful connection.
   */
  readonly startHealthMonitorOnConnect: boolean;

  /**
   * Whether health monitors should stop before connector disconnection.
   */
  readonly stopHealthMonitorOnDisconnect: boolean;

  /**
   * Whether registry entries should refresh after every lifecycle operation.
   */
  readonly refreshRegistryAfterOperation: boolean;

  /**
   * Whether connector destruction should remove the connector from the
   * registry.
   */
  readonly removeConnectorFromRegistryOnDestroy: boolean;

  /**
   * Whether batch operations should stop after the first failure.
   */
  readonly stopBatchOnFailure: boolean;

  /**
   * Maximum number of connectors operated on concurrently.
   */
  readonly maximumConcurrentOperations: number;

  /**
   * Default operation timeout.
   */
  readonly operationTimeoutMs: number;
}

/**
 * Health monitor registration bound to a connector.
 */
export interface ExchangeConnectorManagedHealthMonitor {
  readonly connectorId: ExchangeConnectorId;
  readonly monitor: ExchangeConnectorHealthMonitor;
  readonly registeredAt: number;
}

/**
 * Immutable managed connector snapshot.
 */
export interface ExchangeConnectorManagedSnapshot {
  readonly connectorId: ExchangeConnectorId;
  readonly lifecycleState: ExchangeConnectorLifecycleState;
  readonly healthStatus: ExchangeConnectorHealthStatus;
  readonly healthMonitorRegistered: boolean;
  readonly healthMonitorRunning: boolean;
  readonly registryEntry?: ExchangeConnectorRegistryEntry;
  readonly capturedAt: number;
}

/**
 * Lifecycle manager state snapshot.
 */
export interface ExchangeConnectorLifecycleManagerStateSnapshot {
  readonly state: ExchangeConnectorLifecycleManagerState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Request for one connector lifecycle operation.
 */
export interface ExchangeConnectorManagedOperationRequest {
  readonly operationId: string;
  readonly connectorId: ExchangeConnectorId;
  readonly operation: ExchangeConnectorManagedOperation;
  readonly context: ExchangeConnectorOperationContext;

  /**
   * Optional timeout override.
   */
  readonly timeoutMs?: number;

  /**
   * Whether idempotent no-op states should return success rather than skip.
   */
  readonly treatNoChangeAsSuccess?: boolean;

  /**
   * Optional reason passed to disconnect, destroy, or stop operations.
   */
  readonly reason?: string;
}

/**
 * Options supplied separately from an operation request.
 */
export interface ExchangeConnectorManagedOperationOptions {
  readonly cancellationToken?: ExchangeConnectorLifecycleCancellationToken;
}

/**
 * Successful connector lifecycle operation.
 */
export interface ExchangeConnectorManagedOperationSuccess {
  readonly status: "SUCCEEDED";
  readonly operationId: string;
  readonly connectorId: ExchangeConnectorId;
  readonly operation: ExchangeConnectorManagedOperation;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly previousConnectorState: ExchangeConnectorLifecycleState;
  readonly currentConnectorState: ExchangeConnectorLifecycleState;
  readonly connectorLifecycleResult?: ExchangeConnectorLifecycleResult;
  readonly healthMonitorLifecycleResult?: ExchangeConnectorHealthMonitorLifecycleResult;
  readonly healthCheckResult?: ExchangeConnectorHealthCheckCycleResult;
  readonly registryEntry?: ExchangeConnectorRegistryEntry;
}

/**
 * Failed connector lifecycle operation.
 */
export interface ExchangeConnectorManagedOperationFailure {
  readonly status: "FAILED";
  readonly operationId: string;
  readonly connectorId: ExchangeConnectorId;
  readonly operation: ExchangeConnectorManagedOperation;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly previousConnectorState?: ExchangeConnectorLifecycleState;
  readonly currentConnectorState?: ExchangeConnectorLifecycleState;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly causeName?: string;
  readonly causeMessage?: string;
}

/**
 * Skipped connector lifecycle operation.
 */
export interface ExchangeConnectorManagedOperationSkipped {
  readonly status: "SKIPPED";
  readonly operationId: string;
  readonly connectorId: ExchangeConnectorId;
  readonly operation: ExchangeConnectorManagedOperation;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly reason: ExchangeConnectorManagedOperationSkipReason;
  readonly message: string;
  readonly connectorState?: ExchangeConnectorLifecycleState;
}

/**
 * Cancelled connector lifecycle operation.
 */
export interface ExchangeConnectorManagedOperationCancelled {
  readonly status: "CANCELLED";
  readonly operationId: string;
  readonly connectorId: ExchangeConnectorId;
  readonly operation: ExchangeConnectorManagedOperation;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly reason?: string;
}

/**
 * Union of managed connector operation outcomes.
 */
export type ExchangeConnectorManagedOperationResult =
  | ExchangeConnectorManagedOperationSuccess
  | ExchangeConnectorManagedOperationFailure
  | ExchangeConnectorManagedOperationSkipped
  | ExchangeConnectorManagedOperationCancelled;

/**
 * Batch lifecycle operation request.
 */
export interface ExchangeConnectorBatchOperationRequest {
  readonly batchId: string;
  readonly connectorIds: readonly ExchangeConnectorId[];
  readonly operation: ExchangeConnectorManagedOperation;
  readonly context: ExchangeConnectorOperationContext;
  readonly timeoutMs?: number;
  readonly reason?: string;
}

/**
 * Batch lifecycle operation result.
 */
export interface ExchangeConnectorBatchOperationResult {
  readonly batchId: string;
  readonly operation: ExchangeConnectorManagedOperation;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly totalConnectors: number;
  readonly succeededConnectors: number;
  readonly failedConnectors: number;
  readonly skippedConnectors: number;
  readonly cancelledConnectors: number;
  readonly results: readonly ExchangeConnectorManagedOperationResult[];
}

/**
 * Lifecycle manager metrics.
 */
export interface ExchangeConnectorLifecycleManagerMetrics {
  readonly capturedAt: number;

  readonly registeredConnectorCount: number;
  readonly registeredHealthMonitorCount: number;

  readonly totalOperations: number;
  readonly successfulOperations: number;
  readonly failedOperations: number;
  readonly skippedOperations: number;
  readonly cancelledOperations: number;

  readonly initializeOperations: number;
  readonly connectOperations: number;
  readonly disconnectOperations: number;
  readonly destroyOperations: number;
  readonly healthMonitorStartOperations: number;
  readonly healthMonitorStopOperations: number;
  readonly healthCheckOperations: number;
  readonly registryRefreshOperations: number;

  readonly activeOperations: number;

  readonly totalOperationDurationMs: number;
  readonly minimumOperationDurationMs?: number;
  readonly maximumOperationDurationMs?: number;
  readonly averageOperationDurationMs?: number;

  readonly lastOperationAt?: number;
  readonly lastSuccessAt?: number;
  readonly lastFailureAt?: number;
}

/**
 * Lifecycle manager lifecycle result.
 */
export interface ExchangeConnectorLifecycleManagerLifecycleResult {
  readonly previousState: ExchangeConnectorLifecycleManagerState;
  readonly currentState: ExchangeConnectorLifecycleManagerState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Manager stop options.
 */
export interface ExchangeConnectorLifecycleManagerStopOptions {
  readonly disconnectConnectors?: boolean;
  readonly destroyConnectors?: boolean;
  readonly stopHealthMonitors?: boolean;
  readonly stopOnFailure?: boolean;
  readonly timeoutMs?: number;
  readonly requestedAt?: number;
  readonly reason?: string;
}

/**
 * Manager stop result.
 */
export interface ExchangeConnectorLifecycleManagerStopResult
  extends ExchangeConnectorLifecycleManagerLifecycleResult {
  readonly connectorResults: readonly ExchangeConnectorManagedOperationResult[];
  readonly stoppedHealthMonitorCount: number;
  readonly disconnectedConnectorCount: number;
  readonly destroyedConnectorCount: number;
  readonly failureCount: number;
}

/**
 * Lifecycle manager error categories.
 */
export type ExchangeConnectorLifecycleManagerErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "STATE"
  | "CONNECTOR"
  | "HEALTH_MONITOR"
  | "REGISTRY"
  | "TIMEOUT"
  | "CANCELLATION"
  | "BATCH"
  | "INTERNAL";

/**
 * Immutable lifecycle manager error details.
 */
export interface ExchangeConnectorLifecycleManagerErrorDetails {
  readonly category: ExchangeConnectorLifecycleManagerErrorCategory;
  readonly code: string;
  readonly message: string;

  readonly operationId?: string;
  readonly connectorId?: ExchangeConnectorId;
  readonly operation?: ExchangeConnectorManagedOperation;

  readonly retryable: boolean;
  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by lifecycle-management infrastructure.
 */
export class ExchangeConnectorLifecycleManagerError extends Error {
  public readonly details: ExchangeConnectorLifecycleManagerErrorDetails;

  public constructor(
    details: ExchangeConnectorLifecycleManagerErrorDetails,
  ) {
    super(details.message);

    this.name = "ExchangeConnectorLifecycleManagerError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeConnectorLifecycleManagerErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public toJSON(): ExchangeConnectorLifecycleManagerErrorDetails {
    return this.details;
  }
}

/**
 * Core connector lifecycle manager contract.
 */
export interface ExchangeConnectorLifecycleManager {
  getState(): ExchangeConnectorLifecycleManagerStateSnapshot;

  getMetrics(): ExchangeConnectorLifecycleManagerMetrics;

  getManagedConnectors(): readonly ExchangeConnectorManagedSnapshot[];

  getManagedConnector(
    connectorId: ExchangeConnectorId,
  ): ExchangeConnectorManagedSnapshot | undefined;

  initialize(): Promise<ExchangeConnectorLifecycleManagerLifecycleResult>;

  start(): Promise<ExchangeConnectorLifecycleManagerLifecycleResult>;

  /**
   * Registers a health monitor for a connector already present in the
   * connector registry.
   */
  registerHealthMonitor(
    connectorId: ExchangeConnectorId,
    monitor: ExchangeConnectorHealthMonitor,
  ): ExchangeConnectorManagedHealthMonitor;

  unregisterHealthMonitor(
    connectorId: ExchangeConnectorId,
  ): ExchangeConnectorManagedHealthMonitor | undefined;

  getHealthMonitor(
    connectorId: ExchangeConnectorId,
  ): ExchangeConnectorHealthMonitor | undefined;

  /**
   * Executes one managed lifecycle operation.
   */
  execute(
    request: ExchangeConnectorManagedOperationRequest,
    options?: ExchangeConnectorManagedOperationOptions,
  ): Promise<ExchangeConnectorManagedOperationResult>;

  /**
   * Executes one operation across multiple connectors.
   */
  executeBatch(
    request: ExchangeConnectorBatchOperationRequest,
    options?: ExchangeConnectorManagedOperationOptions,
  ): Promise<ExchangeConnectorBatchOperationResult>;

  stop(
    options?: ExchangeConnectorLifecycleManagerStopOptions,
  ): Promise<ExchangeConnectorLifecycleManagerStopResult>;

  destroy(
    options?: ExchangeConnectorLifecycleManagerStopOptions,
  ): Promise<ExchangeConnectorLifecycleManagerStopResult>;
}

/**
 * Dependency container used by concrete lifecycle manager implementations.
 */
export interface ExchangeConnectorLifecycleManagerDependencies {
  readonly registry: ExchangeConnectorRegistry;
  readonly clock: ExchangeConnectorLifecycleManagerClock;
}

/**
 * Validates lifecycle manager configuration.
 */
export function validateExchangeConnectorLifecycleManagerConfig(
  config: ExchangeConnectorLifecycleManagerConfig,
): void {
  if (
    !Number.isInteger(config.maximumConcurrentOperations) ||
    config.maximumConcurrentOperations <= 0
  ) {
    throw createConfigError(
      "INVALID_MAXIMUM_CONCURRENT_OPERATIONS",
      "maximumConcurrentOperations must be an integer greater than zero.",
    );
  }

  if (
    !Number.isFinite(config.operationTimeoutMs) ||
    config.operationTimeoutMs <= 0
  ) {
    throw createConfigError(
      "INVALID_OPERATION_TIMEOUT",
      "operationTimeoutMs must be a finite number greater than zero.",
    );
  }
}

/**
 * Validates one managed operation request.
 */
export function validateExchangeConnectorManagedOperationRequest(
  request: ExchangeConnectorManagedOperationRequest,
): void {
  requireNonEmptyString(
    request.operationId,
    "operationId",
    normalizeTimestamp(request.context?.createdAt),
  );

  requireNonEmptyString(
    request.connectorId,
    "connectorId",
    normalizeTimestamp(request.context?.createdAt),
  );

  validateOperationContext(request.context);

  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) ||
      request.timeoutMs <= 0)
  ) {
    throw createOperationError(
      "INVALID_OPERATION_TIMEOUT",
      "Operation timeout must be a finite number greater than zero.",
      request,
    );
  }

  if (
    request.reason !== undefined &&
    !request.reason.trim()
  ) {
    throw createOperationError(
      "INVALID_OPERATION_REASON",
      "Operation reason must not be empty when provided.",
      request,
    );
  }
}

/**
 * Validates a batch operation request.
 */
export function validateExchangeConnectorBatchOperationRequest(
  request: ExchangeConnectorBatchOperationRequest,
): void {
  requireNonEmptyString(
    request.batchId,
    "batchId",
    normalizeTimestamp(request.context?.createdAt),
  );

  validateOperationContext(request.context);

  if (request.connectorIds.length === 0) {
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "BATCH_CONNECTORS_REQUIRED",
      message:
        "A batch lifecycle operation requires at least one connector ID.",
      operation: request.operation,
      retryable: false,
      occurredAt: request.context.createdAt,
    });
  }

  const normalizedIds = request.connectorIds.map((connectorId) =>
    connectorId.trim(),
  );

  if (normalizedIds.some((connectorId) => connectorId.length === 0)) {
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "EMPTY_BATCH_CONNECTOR_ID",
      message:
        "Batch connector IDs must not contain empty values.",
      operation: request.operation,
      retryable: false,
      occurredAt: request.context.createdAt,
    });
  }

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "DUPLICATE_BATCH_CONNECTOR_ID",
      message:
        "Batch connector IDs must not contain duplicates.",
      operation: request.operation,
      retryable: false,
      occurredAt: request.context.createdAt,
    });
  }

  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) ||
      request.timeoutMs <= 0)
  ) {
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "INVALID_BATCH_TIMEOUT",
      message:
        "Batch timeout must be a finite number greater than zero.",
      operation: request.operation,
      retryable: false,
      occurredAt: request.context.createdAt,
    });
  }
}

/**
 * Determines whether a connector lifecycle operation is valid for a state.
 */
export function canExecuteExchangeConnectorManagedOperation(
  operation: ExchangeConnectorManagedOperation,
  state: ExchangeConnectorLifecycleState,
): boolean {
  switch (operation) {
    case "INITIALIZE":
      return (
        state === "CREATED" ||
        state === "DISCONNECTED" ||
        state === "FAILED"
      );

    case "CONNECT":
      return (
        state === "INITIALIZED" ||
        state === "DISCONNECTED"
      );

    case "DISCONNECT":
      return (
        state === "CONNECTED" ||
        state === "CONNECTING" ||
        state === "FAILED"
      );

    case "DESTROY":
      return state !== "DESTROYED";

    case "START_HEALTH_MONITOR":
    case "RUN_HEALTH_CHECK":
      return state === "CONNECTED";

    case "STOP_HEALTH_MONITOR":
    case "REFRESH_REGISTRY":
      return state !== "DESTROYED";
  }
}

/**
 * Returns the target connector state for direct lifecycle operations.
 */
export function getExchangeConnectorManagedTargetState(
  operation: ExchangeConnectorManagedOperation,
): ExchangeConnectorLifecycleState | undefined {
  switch (operation) {
    case "INITIALIZE":
      return "INITIALIZED";

    case "CONNECT":
      return "CONNECTED";

    case "DISCONNECT":
      return "DISCONNECTED";

    case "DESTROY":
      return "DESTROYED";

    case "START_HEALTH_MONITOR":
    case "STOP_HEALTH_MONITOR":
    case "RUN_HEALTH_CHECK":
    case "REFRESH_REGISTRY":
      return undefined;
  }
}

/**
 * Returns true when an operation is already satisfied by the current state.
 */
export function isExchangeConnectorManagedOperationSatisfied(
  operation: ExchangeConnectorManagedOperation,
  state: ExchangeConnectorLifecycleState,
): boolean {
  const targetState =
    getExchangeConnectorManagedTargetState(operation);

  return targetState !== undefined && targetState === state;
}

/**
 * Creates an immutable managed connector snapshot.
 */
export function createExchangeConnectorManagedSnapshot(
  connector: ExchangeConnector,
  capturedAt: number,
  healthMonitor?: ExchangeConnectorHealthMonitor,
  registryEntry?: ExchangeConnectorRegistryEntry,
): ExchangeConnectorManagedSnapshot {
  const state = connector.getState();
  const health = connector.getHealth();
  const monitorState = healthMonitor?.getState();

  return Object.freeze({
    connectorId: connector.getMetadata().id,
    lifecycleState: state.state,
    healthStatus: health.status,
    healthMonitorRegistered: healthMonitor !== undefined,
    healthMonitorRunning:
      monitorState?.state === "RUNNING",
    registryEntry,
    capturedAt,
  });
}

/**
 * Sorts managed connector snapshots deterministically.
 */
export function sortExchangeConnectorManagedSnapshots(
  snapshots: readonly ExchangeConnectorManagedSnapshot[],
): readonly ExchangeConnectorManagedSnapshot[] {
  return Object.freeze(
    [...snapshots].sort((left, right) =>
      left.connectorId.localeCompare(right.connectorId),
    ),
  );
}

/**
 * Sorts batch results deterministically according to the original connector
 * order.
 */
export function sortExchangeConnectorBatchResults(
  connectorIds: readonly ExchangeConnectorId[],
  results: readonly ExchangeConnectorManagedOperationResult[],
): readonly ExchangeConnectorManagedOperationResult[] {
  const order = new Map<string, number>();

  connectorIds.forEach((connectorId, index) => {
    order.set(connectorId, index);
  });

  return Object.freeze(
    [...results].sort((left, right) => {
      const leftIndex =
        order.get(left.connectorId) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex =
        order.get(right.connectorId) ?? Number.MAX_SAFE_INTEGER;

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.connectorId.localeCompare(right.connectorId);
    }),
  );
}

/**
 * Creates a skipped operation result.
 */
export function createExchangeConnectorManagedSkippedResult(
  request: ExchangeConnectorManagedOperationRequest,
  reason: ExchangeConnectorManagedOperationSkipReason,
  message: string,
  startedAt: number,
  completedAt: number,
  connectorState?: ExchangeConnectorLifecycleState,
): ExchangeConnectorManagedOperationSkipped {
  validateChronology(startedAt, completedAt, request);

  return Object.freeze({
    status: "SKIPPED",
    operationId: request.operationId,
    connectorId: request.connectorId,
    operation: request.operation,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    reason,
    message,
    connectorState,
  });
}

/**
 * Creates a cancelled operation result.
 */
export function createExchangeConnectorManagedCancelledResult(
  request: ExchangeConnectorManagedOperationRequest,
  startedAt: number,
  completedAt: number,
  reason?: string,
): ExchangeConnectorManagedOperationCancelled {
  validateChronology(startedAt, completedAt, request);

  return Object.freeze({
    status: "CANCELLED",
    operationId: request.operationId,
    connectorId: request.connectorId,
    operation: request.operation,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    reason,
  });
}

/**
 * Returns true when the lifecycle manager can execute operations.
 */
export function isExchangeConnectorLifecycleManagerOperational(
  state: ExchangeConnectorLifecycleManagerState,
): boolean {
  return state === "READY" || state === "RUNNING";
}

/**
 * Returns true when the lifecycle manager is terminal.
 */
export function isExchangeConnectorLifecycleManagerTerminal(
  state: ExchangeConnectorLifecycleManagerState,
): boolean {
  return state === "DESTROYED";
}

/**
 * Runtime type guard for lifecycle manager states.
 */
export function isExchangeConnectorLifecycleManagerState(
  value: unknown,
): value is ExchangeConnectorLifecycleManagerState {
  return (
    value === "CREATED" ||
    value === "READY" ||
    value === "RUNNING" ||
    value === "STOPPING" ||
    value === "STOPPED" ||
    value === "FAILED" ||
    value === "DESTROYED"
  );
}

/**
 * Runtime type guard for managed operation results.
 */
export function isExchangeConnectorManagedOperationResult(
  value: unknown,
): value is ExchangeConnectorManagedOperationResult {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    value.status === "SUCCEEDED" ||
    value.status === "FAILED" ||
    value.status === "SKIPPED" ||
    value.status === "CANCELLED"
  );
}

/**
 * Runtime type guard for lifecycle manager errors.
 */
export function isExchangeConnectorLifecycleManagerError(
  value: unknown,
): value is ExchangeConnectorLifecycleManagerError {
  return value instanceof ExchangeConnectorLifecycleManagerError;
}

function validateOperationContext(
  context: ExchangeConnectorOperationContext | undefined,
): asserts context is ExchangeConnectorOperationContext {
  if (!context) {
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "LIFECYCLE_CONTEXT_REQUIRED",
      message:
        "A connector operation context is required for lifecycle operations.",
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
    throw new ExchangeConnectorLifecycleManagerError({
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
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_DEADLINE",
      message:
        "Context deadline must be finite and greater than or equal to its creation time.",
      retryable: false,
      occurredAt: context.createdAt,
    });
  }
}

function validateChronology(
  startedAt: number,
  completedAt: number,
  request: ExchangeConnectorManagedOperationRequest,
): void {
  if (
    !Number.isFinite(startedAt) ||
    startedAt < 0 ||
    !Number.isFinite(completedAt) ||
    completedAt < startedAt
  ) {
    throw new ExchangeConnectorLifecycleManagerError({
      category: "VALIDATION",
      code: "INVALID_OPERATION_TIMESTAMPS",
      message:
        "Operation timestamps must be finite, non-negative, and chronologically valid.",
      operationId: request.operationId,
      connectorId: request.connectorId,
      operation: request.operation,
      retryable: false,
      occurredAt: normalizeTimestamp(startedAt),
    });
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
  occurredAt: number,
): void {
  if (!value.trim()) {
    throw new ExchangeConnectorLifecycleManagerError({
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
): ExchangeConnectorLifecycleManagerError {
  return new ExchangeConnectorLifecycleManagerError({
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
  request: ExchangeConnectorManagedOperationRequest,
): ExchangeConnectorLifecycleManagerError {
  return new ExchangeConnectorLifecycleManagerError({
    category: "VALIDATION",
    code,
    message,
    operationId: request.operationId || undefined,
    connectorId: request.connectorId || undefined,
    operation: request.operation,
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