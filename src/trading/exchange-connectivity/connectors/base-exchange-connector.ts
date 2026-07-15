/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Reusable deterministic base exchange connector.
 *
 * This class provides:
 * - immutable connector metadata;
 * - deterministic lifecycle transitions;
 * - lifecycle revision tracking;
 * - guarded initialize/connect/disconnect/destroy operations;
 * - immutable health snapshots;
 * - idempotent lifecycle behavior;
 * - rollback to FAILED when lifecycle hooks throw;
 * - dependency injection for clocks;
 * - defensive validation.
 *
 * Exchange-specific connectors should extend this class and implement the
 * protected lifecycle hooks without duplicating lifecycle state management.
 */

import type {
  ExchangeConnector,
  ExchangeConnectorConnectOptions,
  ExchangeConnectorDisconnectOptions,
  ExchangeConnectorHealthSnapshot,
  ExchangeConnectorHealthStatus,
  ExchangeConnectorInitializationOptions,
  ExchangeConnectorLifecycleResult,
  ExchangeConnectorLifecycleState,
  ExchangeConnectorMetadata,
  ExchangeConnectorStateSnapshot,
} from "./exchange-connector";

/**
 * Clock used by the base connector.
 *
 * Production implementations may use a system clock adapter. Deterministic
 * tests should provide a fixed or manually advanced clock.
 */
export interface BaseExchangeConnectorClock {
  now(): number;
}

/**
 * Dependencies required by the base connector.
 */
export interface BaseExchangeConnectorDependencies {
  readonly clock: BaseExchangeConnectorClock;
}

/**
 * Immutable configuration for the base connector.
 */
export interface BaseExchangeConnectorConfig {
  readonly metadata: ExchangeConnectorMetadata;

  /**
   * Initial connector lifecycle state.
   *
   * This should normally remain CREATED.
   */
  readonly initialState?: ExchangeConnectorLifecycleState;

  /**
   * Initial connector health status.
   */
  readonly initialHealthStatus?: ExchangeConnectorHealthStatus;
}

/**
 * Context supplied to connector lifecycle hooks.
 */
export interface BaseExchangeConnectorLifecycleHookContext {
  readonly connectorId: string;
  readonly requestedAt: number;
  readonly startedAt: number;
  readonly previousState: ExchangeConnectorLifecycleState;
  readonly targetState: ExchangeConnectorLifecycleState;
}

/**
 * Context supplied to initialization hooks.
 */
export interface BaseExchangeConnectorInitializeHookContext
  extends BaseExchangeConnectorLifecycleHookContext {
  readonly options: Readonly<ExchangeConnectorInitializationOptions>;
}

/**
 * Context supplied to connection hooks.
 */
export interface BaseExchangeConnectorConnectHookContext
  extends BaseExchangeConnectorLifecycleHookContext {
  readonly options: Readonly<ExchangeConnectorConnectOptions>;
}

/**
 * Context supplied to disconnect and destroy hooks.
 */
export interface BaseExchangeConnectorDisconnectHookContext
  extends BaseExchangeConnectorLifecycleHookContext {
  readonly options: Readonly<ExchangeConnectorDisconnectOptions>;
}

/**
 * Structured base connector failure details.
 */
export interface BaseExchangeConnectorErrorDetails {
  readonly code: string;
  readonly message: string;
  readonly connectorId: string;
  readonly operation:
    | "CONSTRUCTION"
    | "INITIALIZE"
    | "CONNECT"
    | "DISCONNECT"
    | "DESTROY"
    | "HEALTH_UPDATE";
  readonly previousState?: ExchangeConnectorLifecycleState;
  readonly currentState?: ExchangeConnectorLifecycleState;
  readonly retryable: boolean;
  readonly occurredAt: number;
  readonly causeName?: string;
  readonly causeMessage?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by the reusable base connector.
 */
export class BaseExchangeConnectorError extends Error {
  public readonly details: BaseExchangeConnectorErrorDetails;

  public constructor(details: BaseExchangeConnectorErrorDetails) {
    super(details.message);

    this.name = "BaseExchangeConnectorError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get code(): string {
    return this.details.code;
  }

  public get connectorId(): string {
    return this.details.connectorId;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public toJSON(): BaseExchangeConnectorErrorDetails {
    return this.details;
  }
}

/**
 * Reusable abstract implementation of ExchangeConnector.
 *
 * Subclasses implement exchange-specific resource handling through protected
 * hooks while this class owns lifecycle correctness.
 */
export abstract class BaseExchangeConnector
  implements ExchangeConnector
{
  private readonly metadata: ExchangeConnectorMetadata;
  private readonly clock: BaseExchangeConnectorClock;

  private lifecycleState: ExchangeConnectorLifecycleState;
  private lifecycleRevision: number;
  private lifecycleChangedAt: number;
  private lifecycleReason?: string;

  private healthStatus: ExchangeConnectorHealthStatus;
  private healthCheckedAt: number;
  private healthLatencyMs?: number;
  private healthLastSuccessfulCommunicationAt?: number;
  private healthLastFailureAt?: number;
  private healthCode?: string;
  private healthMessage?: string;
  private healthDetails?: Readonly<Record<string, unknown>>;

  private lifecycleOperationActive = false;

  protected constructor(
    config: BaseExchangeConnectorConfig,
    dependencies: BaseExchangeConnectorDependencies,
  ) {
    validateBaseExchangeConnectorConfig(config);
    validateBaseExchangeConnectorDependencies(dependencies);

    const constructedAt = dependencies.clock.now();

    validateTimestamp(
      constructedAt,
      config.metadata.id,
      "CONSTRUCTION",
    );

    this.metadata = freezeMetadata(config.metadata);
    this.clock = dependencies.clock;

    this.lifecycleState = config.initialState ?? "CREATED";
    this.lifecycleRevision = 1;
    this.lifecycleChangedAt = constructedAt;

    this.healthStatus =
      config.initialHealthStatus ?? "UNKNOWN";
    this.healthCheckedAt = constructedAt;
  }

  public getMetadata(): ExchangeConnectorMetadata {
    return this.metadata;
  }

  public getState(): ExchangeConnectorStateSnapshot {
    return Object.freeze({
      connectorId: this.metadata.id,
      state: this.lifecycleState,
      revision: this.lifecycleRevision,
      changedAt: this.lifecycleChangedAt,
      reason: this.lifecycleReason,
    });
  }

  public getHealth(): ExchangeConnectorHealthSnapshot {
    return Object.freeze({
      connectorId: this.metadata.id,
      status: this.healthStatus,
      checkedAt: this.healthCheckedAt,
      latencyMs: this.healthLatencyMs,
      lastSuccessfulCommunicationAt:
        this.healthLastSuccessfulCommunicationAt,
      lastFailureAt: this.healthLastFailureAt,
      code: this.healthCode,
      message: this.healthMessage,
      details: this.healthDetails,
    });
  }

  public async initialize(
    options: ExchangeConnectorInitializationOptions = {},
  ): Promise<ExchangeConnectorLifecycleResult> {
    const immutableOptions = Object.freeze({ ...options });

    return this.executeLifecycleOperation({
      operation: "INITIALIZE",
      transitionalState: "INITIALIZING",
      targetState: "INITIALIZED",
      allowedStates: Object.freeze([
  "CREATED",
  "INITIALIZED",
  "DISCONNECTED",
  "FAILED",
]),
      requestedAt: immutableOptions.requestedAt,
      force: immutableOptions.force === true,
      hook: async (context) => {
        await this.onInitialize({
          ...context,
          options: immutableOptions,
        });
      },
    });
  }

  public async connect(
    options: ExchangeConnectorConnectOptions = {},
  ): Promise<ExchangeConnectorLifecycleResult> {
    const immutableOptions = Object.freeze({ ...options });

    validateOptionalPositiveNumber(
      immutableOptions.timeoutMs,
      this.metadata.id,
      "CONNECT",
      "timeoutMs",
    );

    return this.executeLifecycleOperation({
      operation: "CONNECT",
      transitionalState: "CONNECTING",
      targetState: "CONNECTED",
      allowedStates: Object.freeze([
        "INITIALIZED",
        "DISCONNECTED",
      ]),
      requestedAt: immutableOptions.requestedAt,
      force: false,
      hook: async (context) => {
        await this.onConnect({
          ...context,
          options: immutableOptions,
        });
      },
    });
  }

  public async disconnect(
    options: ExchangeConnectorDisconnectOptions = {},
  ): Promise<ExchangeConnectorLifecycleResult> {
    const immutableOptions = Object.freeze({ ...options });

    validateDisconnectOptions(
      immutableOptions,
      this.metadata.id,
      "DISCONNECT",
    );

    return this.executeLifecycleOperation({
      operation: "DISCONNECT",
      transitionalState: "DISCONNECTING",
      targetState: "DISCONNECTED",
      allowedStates: Object.freeze([
        "CONNECTED",
        "CONNECTING",
        "FAILED",
        "INITIALIZED",
      ]),
      requestedAt: immutableOptions.requestedAt,
      force: false,
      hook: async (context) => {
        await this.onDisconnect({
          ...context,
          options: immutableOptions,
        });
      },
      successReason: immutableOptions.reason,
    });
  }

  public async destroy(
    options: ExchangeConnectorDisconnectOptions = {},
  ): Promise<ExchangeConnectorLifecycleResult> {
    const immutableOptions = Object.freeze({ ...options });

    validateDisconnectOptions(
      immutableOptions,
      this.metadata.id,
      "DESTROY",
    );

    if (this.lifecycleState === "DESTROYED") {
      return this.createNoChangeResult("DESTROYED");
    }

    const previousState = this.lifecycleState;

    if (
      previousState === "CONNECTED" ||
      previousState === "CONNECTING" ||
      previousState === "INITIALIZED" ||
      previousState === "FAILED"
    ) {
      await this.disconnect({
        ...immutableOptions,
        reason:
          immutableOptions.reason ??
          "Connector destruction requested.",
      });
    }

    return this.executeLifecycleOperation({
      operation: "DESTROY",
      transitionalState: undefined,
      targetState: "DESTROYED",
      allowedStates: Object.freeze([
        "CREATED",
        "DISCONNECTED",
        "FAILED",
      ]),
      requestedAt: immutableOptions.requestedAt,
      force: false,
      hook: async (context) => {
        await this.onDestroy({
          ...context,
          options: immutableOptions,
        });
      },
      successReason: immutableOptions.reason,
    });
  }

  /**
   * Updates connector health using deterministic values supplied by a health
   * monitor or exchange-specific implementation.
   */
  protected updateHealth(
    snapshot: Omit<
      ExchangeConnectorHealthSnapshot,
      "connectorId"
    >,
  ): ExchangeConnectorHealthSnapshot {
    validateHealthSnapshot(
      snapshot,
      this.metadata.id,
      this.lifecycleState,
    );

    this.healthStatus = snapshot.status;
    this.healthCheckedAt = snapshot.checkedAt;
    this.healthLatencyMs = snapshot.latencyMs;
    this.healthLastSuccessfulCommunicationAt =
      snapshot.lastSuccessfulCommunicationAt;
    this.healthLastFailureAt = snapshot.lastFailureAt;
    this.healthCode = snapshot.code;
    this.healthMessage = snapshot.message;
    this.healthDetails = snapshot.details
      ? Object.freeze({ ...snapshot.details })
      : undefined;

    return this.getHealth();
  }

  /**
   * Convenience helper for marking a successful communication.
   */
  protected markHealthy(
    checkedAt: number = this.clock.now(),
    latencyMs?: number,
    details?: Readonly<Record<string, unknown>>,
  ): ExchangeConnectorHealthSnapshot {
    return this.updateHealth({
      status: "HEALTHY",
      checkedAt,
      latencyMs,
      lastSuccessfulCommunicationAt: checkedAt,
      lastFailureAt: this.healthLastFailureAt,
      details,
    });
  }

  /**
   * Convenience helper for marking connector degradation.
   */
  protected markDegraded(
    code: string,
    message: string,
    checkedAt: number = this.clock.now(),
    details?: Readonly<Record<string, unknown>>,
  ): ExchangeConnectorHealthSnapshot {
    requireNonEmptyString(
      code,
      "code",
      this.metadata.id,
      "HEALTH_UPDATE",
    );

    requireNonEmptyString(
      message,
      "message",
      this.metadata.id,
      "HEALTH_UPDATE",
    );

    return this.updateHealth({
      status: "DEGRADED",
      checkedAt,
      lastSuccessfulCommunicationAt:
        this.healthLastSuccessfulCommunicationAt,
      lastFailureAt: checkedAt,
      code,
      message,
      details,
    });
  }

  /**
   * Convenience helper for marking connector failure.
   */
  protected markUnhealthy(
    code: string,
    message: string,
    checkedAt: number = this.clock.now(),
    details?: Readonly<Record<string, unknown>>,
  ): ExchangeConnectorHealthSnapshot {
    requireNonEmptyString(
      code,
      "code",
      this.metadata.id,
      "HEALTH_UPDATE",
    );

    requireNonEmptyString(
      message,
      "message",
      this.metadata.id,
      "HEALTH_UPDATE",
    );

    return this.updateHealth({
      status: "UNHEALTHY",
      checkedAt,
      lastSuccessfulCommunicationAt:
        this.healthLastSuccessfulCommunicationAt,
      lastFailureAt: checkedAt,
      code,
      message,
      details,
    });
  }

  /**
   * Exchange-specific initialization hook.
   */
  protected abstract onInitialize(
    context: BaseExchangeConnectorInitializeHookContext,
  ): Promise<void>;

  /**
   * Exchange-specific connection hook.
   */
  protected abstract onConnect(
    context: BaseExchangeConnectorConnectHookContext,
  ): Promise<void>;

  /**
   * Exchange-specific disconnection hook.
   */
  protected abstract onDisconnect(
    context: BaseExchangeConnectorDisconnectHookContext,
  ): Promise<void>;

  /**
   * Exchange-specific resource destruction hook.
   */
  protected abstract onDestroy(
    context: BaseExchangeConnectorDisconnectHookContext,
  ): Promise<void>;

  private async executeLifecycleOperation(input: {
    readonly operation:
      | "INITIALIZE"
      | "CONNECT"
      | "DISCONNECT"
      | "DESTROY";
    readonly transitionalState?:
      | "INITIALIZING"
      | "CONNECTING"
      | "DISCONNECTING";
    readonly targetState: ExchangeConnectorLifecycleState;
    readonly allowedStates: readonly ExchangeConnectorLifecycleState[];
    readonly requestedAt?: number;
    readonly force: boolean;
    readonly successReason?: string;
    readonly hook: (
      context: BaseExchangeConnectorLifecycleHookContext,
    ) => Promise<void>;
  }): Promise<ExchangeConnectorLifecycleResult> {
    if (this.lifecycleOperationActive) {
      throw this.createError({
        code: "LIFECYCLE_OPERATION_ALREADY_ACTIVE",
        message:
          "Another connector lifecycle operation is already active.",
        operation: input.operation,
        previousState: this.lifecycleState,
        currentState: this.lifecycleState,
        retryable: true,
        occurredAt: this.clock.now(),
      });
    }

    if (
      this.lifecycleState === input.targetState &&
      !input.force
    ) {
      return this.createNoChangeResult(input.targetState);
    }

    if (
      this.lifecycleState === "DESTROYED" &&
      input.targetState !== "DESTROYED"
    ) {
      throw this.createError({
        code: "CONNECTOR_DESTROYED",
        message:
          "A destroyed connector cannot perform further lifecycle operations.",
        operation: input.operation,
        previousState: this.lifecycleState,
        currentState: this.lifecycleState,
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    if (!input.allowedStates.includes(this.lifecycleState)) {
      throw this.createError({
        code: "INVALID_LIFECYCLE_TRANSITION",
        message:
          `Cannot execute ${input.operation} while connector is in ` +
          `${this.lifecycleState} state.`,
        operation: input.operation,
        previousState: this.lifecycleState,
        currentState: this.lifecycleState,
        retryable: false,
        occurredAt: this.clock.now(),
        metadata: Object.freeze({
          allowedStates: input.allowedStates,
          targetState: input.targetState,
        }),
      });
    }

    const requestedAt =
      input.requestedAt ?? this.clock.now();

    validateTimestamp(
      requestedAt,
      this.metadata.id,
      input.operation,
    );

    const previousState = this.lifecycleState;
    const startedAt = this.clock.now();

    validateTimestamp(
      startedAt,
      this.metadata.id,
      input.operation,
    );

    this.lifecycleOperationActive = true;

    try {
      if (input.transitionalState) {
        this.transitionState(
          input.transitionalState,
          startedAt,
        );
      }

      await input.hook({
        connectorId: this.metadata.id,
        requestedAt,
        startedAt,
        previousState,
        targetState: input.targetState,
      });

      const completedAt = this.clock.now();

      validateChronology(
        startedAt,
        completedAt,
        this.metadata.id,
        input.operation,
      );

      this.transitionState(
        input.targetState,
        completedAt,
        input.successReason,
      );

      if (input.targetState === "CONNECTED") {
        this.markHealthy(completedAt);
      }

      if (
        input.targetState === "DISCONNECTED" ||
        input.targetState === "DESTROYED"
      ) {
        this.updateHealth({
          status: "UNKNOWN",
          checkedAt: completedAt,
          lastSuccessfulCommunicationAt:
            this.healthLastSuccessfulCommunicationAt,
          lastFailureAt: this.healthLastFailureAt,
          code: undefined,
          message: undefined,
          details: undefined,
        });
      }

      return Object.freeze({
        connectorId: this.metadata.id,
        previousState,
        currentState: input.targetState,
        changed: previousState !== input.targetState,
        completedAt,
        revision: this.lifecycleRevision,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      validateTimestamp(
        failedAt,
        this.metadata.id,
        input.operation,
      );

      this.transitionState(
        "FAILED",
        failedAt,
        getErrorMessage(error),
      );

      this.markUnhealthy(
        "CONNECTOR_LIFECYCLE_FAILURE",
        getErrorMessage(error),
        failedAt,
        Object.freeze({
          operation: input.operation,
          causeName: getErrorName(error),
        }),
      );

      if (error instanceof BaseExchangeConnectorError) {
        throw error;
      }

      throw this.createError({
        code: "LIFECYCLE_HOOK_FAILED",
        message:
          `Connector ${input.operation.toLowerCase()} operation failed.`,
        operation: input.operation,
        previousState,
        currentState: "FAILED",
        retryable: isPotentiallyRetryableOperation(
          input.operation,
        ),
        occurredAt: failedAt,
        causeName: getErrorName(error),
        causeMessage: getErrorMessage(error),
      });
    } finally {
      this.lifecycleOperationActive = false;
    }
  }

  private transitionState(
    state: ExchangeConnectorLifecycleState,
    changedAt: number,
    reason?: string,
  ): void {
    validateTimestamp(
      changedAt,
      this.metadata.id,
      "CONSTRUCTION",
    );

    if (changedAt < this.lifecycleChangedAt) {
      throw this.createError({
        code: "NON_MONOTONIC_LIFECYCLE_TIMESTAMP",
        message:
          "Lifecycle state timestamps must be monotonically increasing.",
        operation: "CONSTRUCTION",
        previousState: this.lifecycleState,
        currentState: state,
        retryable: false,
        occurredAt: changedAt,
      });
    }

    const stateChanged = state !== this.lifecycleState;
    const reasonChanged = reason !== this.lifecycleReason;

    if (!stateChanged && !reasonChanged) {
      return;
    }

    this.lifecycleState = state;
    this.lifecycleRevision += 1;
    this.lifecycleChangedAt = changedAt;
    this.lifecycleReason = reason;
  }

  private createNoChangeResult(
    targetState: ExchangeConnectorLifecycleState,
  ): ExchangeConnectorLifecycleResult {
    return Object.freeze({
      connectorId: this.metadata.id,
      previousState: this.lifecycleState,
      currentState: targetState,
      changed: false,
      completedAt: this.clock.now(),
      revision: this.lifecycleRevision,
    });
  }

  private createError(
    details: Omit<
      BaseExchangeConnectorErrorDetails,
      "connectorId"
    >,
  ): BaseExchangeConnectorError {
    return new BaseExchangeConnectorError({
      ...details,
      connectorId: this.metadata.id,
    });
  }
}

/**
 * Validates base connector configuration.
 */
export function validateBaseExchangeConnectorConfig(
  config: BaseExchangeConnectorConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw new BaseExchangeConnectorError({
      code: "BASE_CONNECTOR_CONFIG_REQUIRED",
      message:
        "Base exchange connector configuration is required.",
      connectorId: "unknown",
      operation: "CONSTRUCTION",
      retryable: false,
      occurredAt: 0,
    });
  }

  validateMetadata(config.metadata);

  if (
    config.initialState !== undefined &&
    !isPermittedInitialState(config.initialState)
  ) {
    throw new BaseExchangeConnectorError({
      code: "INVALID_INITIAL_CONNECTOR_STATE",
      message:
        "Base connector initial state must be CREATED, INITIALIZED, DISCONNECTED, or FAILED.",
      connectorId: config.metadata.id,
      operation: "CONSTRUCTION",
      currentState: config.initialState,
      retryable: false,
      occurredAt: 0,
    });
  }
}

/**
 * Validates base connector dependencies.
 */
export function validateBaseExchangeConnectorDependencies(
  dependencies: BaseExchangeConnectorDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null ||
    typeof dependencies.clock?.now !== "function"
  ) {
    throw new BaseExchangeConnectorError({
      code: "BASE_CONNECTOR_CLOCK_REQUIRED",
      message:
        "Base exchange connector requires a valid clock dependency.",
      connectorId: "unknown",
      operation: "CONSTRUCTION",
      retryable: false,
      occurredAt: 0,
    });
  }
}

/**
 * Runtime type guard for base connector errors.
 */
export function isBaseExchangeConnectorError(
  value: unknown,
): value is BaseExchangeConnectorError {
  return value instanceof BaseExchangeConnectorError;
}

function validateMetadata(
  metadata: ExchangeConnectorMetadata,
): void {
  if (
    typeof metadata !== "object" ||
    metadata === null
  ) {
    throw new BaseExchangeConnectorError({
      code: "CONNECTOR_METADATA_REQUIRED",
      message: "Connector metadata is required.",
      connectorId: "unknown",
      operation: "CONSTRUCTION",
      retryable: false,
      occurredAt: 0,
    });
  }

  requireNonEmptyString(
    metadata.id,
    "metadata.id",
    metadata.id || "unknown",
    "CONSTRUCTION",
  );

  requireNonEmptyString(
    metadata.exchangeName,
    "metadata.exchangeName",
    metadata.id,
    "CONSTRUCTION",
  );

  requireNonEmptyString(
    metadata.displayName,
    "metadata.displayName",
    metadata.id,
    "CONSTRUCTION",
  );

  requireNonEmptyString(
    metadata.implementationVersion,
    "metadata.implementationVersion",
    metadata.id,
    "CONSTRUCTION",
  );

  if (metadata.capabilities.marketTypes.length === 0) {
    throw new BaseExchangeConnectorError({
      code: "CONNECTOR_MARKET_TYPES_REQUIRED",
      message:
        "Connector metadata must include at least one supported market type.",
      connectorId: metadata.id,
      operation: "CONSTRUCTION",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    new Set(metadata.capabilities.marketTypes).size !==
    metadata.capabilities.marketTypes.length
  ) {
    throw new BaseExchangeConnectorError({
      code: "DUPLICATE_CONNECTOR_MARKET_TYPES",
      message:
        "Connector metadata must not contain duplicate market types.",
      connectorId: metadata.id,
      operation: "CONSTRUCTION",
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateDisconnectOptions(
  options: ExchangeConnectorDisconnectOptions,
  connectorId: string,
  operation: "DISCONNECT" | "DESTROY",
): void {
  validateOptionalPositiveNumber(
    options.timeoutMs,
    connectorId,
    operation,
    "timeoutMs",
  );

  if (
    options.reason !== undefined &&
    !options.reason.trim()
  ) {
    throw new BaseExchangeConnectorError({
      code: "INVALID_LIFECYCLE_REASON",
      message:
        "Lifecycle reason must not be empty when provided.",
      connectorId,
      operation,
      retryable: false,
      occurredAt: normalizeTimestamp(options.requestedAt),
    });
  }
}

function validateHealthSnapshot(
  snapshot: Omit<
    ExchangeConnectorHealthSnapshot,
    "connectorId"
  >,
  connectorId: string,
  lifecycleState: ExchangeConnectorLifecycleState,
): void {
  validateTimestamp(
    snapshot.checkedAt,
    connectorId,
    "HEALTH_UPDATE",
  );

  validateOptionalNonNegativeNumber(
    snapshot.latencyMs,
    connectorId,
    "HEALTH_UPDATE",
    "latencyMs",
  );

  validateOptionalTimestamp(
    snapshot.lastSuccessfulCommunicationAt,
    connectorId,
    "HEALTH_UPDATE",
    "lastSuccessfulCommunicationAt",
  );

  validateOptionalTimestamp(
    snapshot.lastFailureAt,
    connectorId,
    "HEALTH_UPDATE",
    "lastFailureAt",
  );

  if (
    snapshot.status === "HEALTHY" &&
    lifecycleState !== "CONNECTED"
  ) {
    throw new BaseExchangeConnectorError({
      code: "HEALTHY_CONNECTOR_NOT_CONNECTED",
      message:
        "A connector may only be marked healthy while connected.",
      connectorId,
      operation: "HEALTH_UPDATE",
      currentState: lifecycleState,
      retryable: false,
      occurredAt: snapshot.checkedAt,
    });
  }
}

function validateOptionalPositiveNumber(
  value: number | undefined,
  connectorId: string,
  operation:
    | "INITIALIZE"
    | "CONNECT"
    | "DISCONNECT"
    | "DESTROY",
  path: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value <= 0)
  ) {
    throw new BaseExchangeConnectorError({
      code: "POSITIVE_NUMBER_REQUIRED",
      message:
        `${path} must be a finite number greater than zero.`,
      connectorId,
      operation,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateOptionalNonNegativeNumber(
  value: number | undefined,
  connectorId: string,
  operation: "HEALTH_UPDATE",
  path: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0)
  ) {
    throw new BaseExchangeConnectorError({
      code: "NON_NEGATIVE_NUMBER_REQUIRED",
      message:
        `${path} must be a finite number greater than or equal to zero.`,
      connectorId,
      operation,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateOptionalTimestamp(
  value: number | undefined,
  connectorId: string,
  operation: "HEALTH_UPDATE",
  path: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new BaseExchangeConnectorError({
      code: "INVALID_TIMESTAMP",
      message:
        `${path} must be a finite non-negative timestamp.`,
      connectorId,
      operation,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateTimestamp(
  value: number,
  connectorId: string,
  operation: BaseExchangeConnectorErrorDetails["operation"],
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new BaseExchangeConnectorError({
      code: "INVALID_TIMESTAMP",
      message:
        "Connector timestamp must be finite and non-negative.",
      connectorId,
      operation,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateChronology(
  startedAt: number,
  completedAt: number,
  connectorId: string,
  operation:
    | "INITIALIZE"
    | "CONNECT"
    | "DISCONNECT"
    | "DESTROY",
): void {
  if (completedAt < startedAt) {
    throw new BaseExchangeConnectorError({
      code: "LIFECYCLE_COMPLETION_BEFORE_START",
      message:
        "Lifecycle completion timestamp must not be earlier than its start timestamp.",
      connectorId,
      operation,
      retryable: false,
      occurredAt: completedAt,
    });
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
  connectorId: string,
  operation: BaseExchangeConnectorErrorDetails["operation"],
): void {
  if (!value.trim()) {
    throw new BaseExchangeConnectorError({
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      connectorId,
      operation,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function isPermittedInitialState(
  state: ExchangeConnectorLifecycleState,
): boolean {
  return (
    state === "CREATED" ||
    state === "INITIALIZED" ||
    state === "DISCONNECTED" ||
    state === "FAILED"
  );
}

function freezeMetadata(
  metadata: ExchangeConnectorMetadata,
): ExchangeConnectorMetadata {
  return Object.freeze({
    ...metadata,
    capabilities: Object.freeze({
      ...metadata.capabilities,
      marketTypes: Object.freeze([
        ...metadata.capabilities.marketTypes,
      ]),
    }),
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

function getErrorName(error: unknown): string {
  return error instanceof Error
    ? error.name
    : "UnknownError";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown connector lifecycle failure.";
}

function isPotentiallyRetryableOperation(
  operation:
    | "INITIALIZE"
    | "CONNECT"
    | "DISCONNECT"
    | "DESTROY",
): boolean {
  return (
    operation === "INITIALIZE" ||
    operation === "CONNECT" ||
    operation === "DISCONNECT"
  );
}