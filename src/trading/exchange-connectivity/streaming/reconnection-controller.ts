/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 8:
 * Reconnection Controller
 *
 * This module coordinates deterministic WebSocket reconnection attempts.
 *
 * Responsibilities:
 * - Register and unregister reconnectable connections
 * - Apply exponential backoff policies
 * - Support deterministic jitter through an injected provider
 * - Track attempts, failures and recovery
 * - Schedule reconnections without internal timers
 * - Prevent duplicate reconnect operations
 * - Support cancellation and manual reconnect requests
 * - Produce immutable snapshots and events
 *
 * The controller intentionally does not create timers. The orchestration
 * layer calls tick() with a deterministic clock so reconnection behavior is
 * fully testable.
 */

import {
  ManagedWebSocketConnection,
  WebSocketConnectionId,
  WebSocketConnectionState,
  WebSocketExchangeId,
  WebSocketManager,
} from "./websocket-manager";

export type ReconnectionStatus =
  | "IDLE"
  | "SCHEDULED"
  | "RECONNECTING"
  | "CONNECTED"
  | "EXHAUSTED"
  | "CANCELLED"
  | "DISPOSED";

export type ReconnectionEventType =
  | "CONNECTION_REGISTERED"
  | "CONNECTION_UNREGISTERED"
  | "RECONNECT_SCHEDULED"
  | "RECONNECT_STARTED"
  | "RECONNECT_SUCCEEDED"
  | "RECONNECT_FAILED"
  | "RECONNECT_EXHAUSTED"
  | "RECONNECT_CANCELLED"
  | "STATE_RECONCILED";

export type ReconnectionTrigger =
  | "MANUAL"
  | "CONNECTION_FAILURE"
  | "HEARTBEAT_TIMEOUT"
  | "INACTIVITY_TIMEOUT"
  | "CONNECTION_CLOSED"
  | "HEALTH_DEGRADED"
  | "UNKNOWN";

export interface ReconnectionControllerClock {
  now(): number;
}

export interface ReconnectionJitterProvider {
  /**
   * Returns a deterministic value from 0 through 1.
   */
  next(): number;
}

export interface ReconnectionPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;

  /**
   * Jitter ratio from 0 through 1.
   *
   * A value of zero disables jitter. A value of 0.25 allows the computed
   * delay to vary by up to 25 percent.
   */
  readonly jitterRatio: number;

  /**
   * When true, a successful connection resets the attempt counter.
   */
  readonly resetAttemptsOnSuccess: boolean;

  /**
   * When true, an existing connection is disconnected before reconnecting.
   */
  readonly disconnectBeforeReconnect: boolean;
}

export interface ReconnectionRegistration {
  readonly connection: ManagedWebSocketConnection;
  readonly policy?: Partial<ReconnectionPolicy>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ReconnectionScheduleRequest {
  readonly connectionId: WebSocketConnectionId;
  readonly trigger: ReconnectionTrigger;
  readonly reason?: string;

  /**
   * When true, the next reconnect attempt is eligible immediately.
   */
  readonly immediate?: boolean;

  /**
   * Optional explicit timestamp used instead of the controller clock.
   */
  readonly requestedAt?: number;
}

export interface ReconnectionEvent {
  readonly eventId: number;
  readonly type: ReconnectionEventType;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly occurredAt: number;
  readonly status: ReconnectionStatus;
  readonly trigger?: ReconnectionTrigger;
  readonly attempt?: number;
  readonly delayMs?: number;
  readonly nextAttemptAt?: number;
  readonly reason?: string;
  readonly error?: Error;
}

export type ReconnectionEventListener = (
  event: ReconnectionEvent,
) => void;

export interface ReconnectionConnectionSnapshot {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly connectionState: WebSocketConnectionState;
  readonly status: ReconnectionStatus;
  readonly registeredAt: number;
  readonly lastChangedAt: number;
  readonly attemptCount: number;
  readonly consecutiveFailureCount: number;
  readonly successfulReconnectCount: number;
  readonly failedReconnectCount: number;
  readonly lastAttemptAt?: number;
  readonly lastSuccessAt?: number;
  readonly lastFailureAt?: number;
  readonly nextAttemptAt?: number;
  readonly scheduledDelayMs?: number;
  readonly trigger?: ReconnectionTrigger;
  readonly reason?: string;
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitterRatio: number;
  readonly resetAttemptsOnSuccess: boolean;
  readonly disconnectBeforeReconnect: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ReconnectionControllerSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalConnections: number;
  readonly idleConnections: number;
  readonly scheduledConnections: number;
  readonly reconnectingConnections: number;
  readonly connectedConnections: number;
  readonly exhaustedConnections: number;
  readonly cancelledConnections: number;
  readonly connections:
    readonly ReconnectionConnectionSnapshot[];
}

export interface ReconnectionTickFailure {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly error: Error;
}

export interface ReconnectionTickResult {
  readonly processedAt: number;
  readonly attemptedConnectionIds:
    readonly WebSocketConnectionId[];
  readonly reconnectedConnectionIds:
    readonly WebSocketConnectionId[];
  readonly exhaustedConnectionIds:
    readonly WebSocketConnectionId[];
  readonly failures: readonly ReconnectionTickFailure[];
}

interface MutableReconnectionRecord {
  readonly connection: ManagedWebSocketConnection;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly registeredAt: number;
  readonly policy: ReconnectionPolicy;
  readonly metadata: Readonly<Record<string, unknown>>;

  status: ReconnectionStatus;
  lastChangedAt: number;
  attemptCount: number;
  consecutiveFailureCount: number;
  successfulReconnectCount: number;
  failedReconnectCount: number;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  nextAttemptAt?: number;
  scheduledDelayMs?: number;
  trigger?: ReconnectionTrigger;
  reason?: string;
}

const DEFAULT_RECONNECTION_POLICY: ReconnectionPolicy =
  Object.freeze({
    maxAttempts: 8,
    initialDelayMs: 1_000,
    maxDelayMs: 60_000,
    backoffMultiplier: 2,
    jitterRatio: 0,
    resetAttemptsOnSuccess: true,
    disconnectBeforeReconnect: true,
  });

const SYSTEM_CLOCK: ReconnectionControllerClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

const ZERO_JITTER_PROVIDER: ReconnectionJitterProvider =
  Object.freeze({
    next: (): number => 0.5,
  });

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

export class ReconnectionControllerError extends Error {
  public readonly code: string;
  public readonly connectionId?: WebSocketConnectionId;
  public readonly exchangeId?: WebSocketExchangeId;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly connectionId?: WebSocketConnectionId;
      readonly exchangeId?: WebSocketExchangeId;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "ReconnectionControllerError";
    this.code = code;
    this.connectionId = context?.connectionId;
    this.exchangeId = context?.exchangeId;
  }
}

/**
 * Deterministic reconnection scheduler and executor.
 */
export class ReconnectionController {
  private readonly records =
    new Map<WebSocketConnectionId, MutableReconnectionRecord>();

  private readonly listeners =
    new Set<ReconnectionEventListener>();

  private readonly activeOperations =
    new Map<WebSocketConnectionId, Promise<void>>();

  private readonly manager: WebSocketManager;
  private readonly clock: ReconnectionControllerClock;
  private readonly jitterProvider: ReconnectionJitterProvider;
  private readonly defaultPolicy: ReconnectionPolicy;

  private nextEventId = 1;
  private disposed = false;

  public constructor(
    manager: WebSocketManager,
    defaultPolicy: Partial<ReconnectionPolicy> = {},
    clock: ReconnectionControllerClock = SYSTEM_CLOCK,
    jitterProvider: ReconnectionJitterProvider =
      ZERO_JITTER_PROVIDER,
  ) {
    this.manager = validateManager(manager);
    this.clock = validateClock(clock);
    this.jitterProvider =
      validateJitterProvider(jitterProvider);

    this.defaultPolicy = normalizePolicy({
      ...DEFAULT_RECONNECTION_POLICY,
      ...defaultPolicy,
    });
  }

  /**
   * Registers a managed connection with the controller.
   */
  public register(
    registration: ReconnectionRegistration,
  ): ReconnectionConnectionSnapshot {
    this.assertActive();
    validateRegistration(registration);

    const connection = registration.connection;
    const descriptor = connection.descriptor;

    const connectionId =
      normalizeConnectionId(descriptor.connectionId);

    const exchangeId =
      normalizeExchangeId(descriptor.exchangeId);

    if (this.records.has(connectionId)) {
      throw new ReconnectionControllerError(
        "DUPLICATE_RECONNECTION_CONNECTION",
        `Connection "${connectionId}" is already registered with the reconnection controller.`,
        {
          connectionId,
          exchangeId,
        },
      );
    }

    const timestamp = this.now();

    const record: MutableReconnectionRecord = {
      connection,
      connectionId,
      exchangeId,
      registeredAt: timestamp,
      policy: normalizePolicy({
        ...this.defaultPolicy,
        ...(registration.policy ?? {}),
      }),
      metadata:
        registration.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({
              ...registration.metadata,
            }),
      status: deriveInitialStatus(connection.getState()),
      lastChangedAt: timestamp,
      attemptCount: 0,
      consecutiveFailureCount: 0,
      successfulReconnectCount: 0,
      failedReconnectCount: 0,
    };

    this.records.set(connectionId, record);

    this.emit({
      type: "CONNECTION_REGISTERED",
      record,
    });

    return createSnapshot(record);
  }

  /**
   * Removes a connection from reconnection supervision.
   */
  public unregister(
    connectionId: WebSocketConnectionId,
  ): ReconnectionConnectionSnapshot {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    if (
      this.activeOperations.has(
        normalizedConnectionId,
      )
    ) {
      throw new ReconnectionControllerError(
        "RECONNECTION_OPERATION_IN_PROGRESS",
        `Connection "${normalizedConnectionId}" has a reconnection operation in progress.`,
        {
          connectionId: normalizedConnectionId,
        },
      );
    }

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    const snapshot = createSnapshot(record);

    this.records.delete(normalizedConnectionId);

    this.emit({
      type: "CONNECTION_UNREGISTERED",
      record,
    });

    return snapshot;
  }

  /**
   * Schedules a reconnect operation according to the configured policy.
   */
  public schedule(
    request: ReconnectionScheduleRequest,
  ): ReconnectionConnectionSnapshot {
    this.assertActive();
    validateScheduleRequest(request);

    const connectionId =
      normalizeConnectionId(request.connectionId);

    const record = this.getRequiredRecord(connectionId);

    if (record.status === "DISPOSED") {
      throw new ReconnectionControllerError(
        "RECONNECTION_RECORD_DISPOSED",
        `Connection "${connectionId}" has been disposed.`,
        {
          connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    const requestedAt =
      request.requestedAt ?? this.now();

    validateTimestamp(
      requestedAt,
      "request.requestedAt",
    );

    if (requestedAt < record.lastChangedAt) {
      throw new ReconnectionControllerError(
        "NON_MONOTONIC_RECONNECTION_TIMESTAMP",
        `Reconnect request timestamp ${requestedAt} is earlier than the previous change timestamp ${record.lastChangedAt}.`,
        {
          connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    record.trigger = request.trigger;
    record.reason = normalizeOptionalReason(request.reason);

    if (
      record.attemptCount >= record.policy.maxAttempts
    ) {
      this.markExhausted(
        record,
        requestedAt,
        record.reason ??
          "Maximum reconnect attempts reached.",
      );

      return createSnapshot(record);
    }

    const delayMs = request.immediate
      ? 0
      : this.calculateDelay(
          record.attemptCount + 1,
          record.policy,
        );

    record.status = "SCHEDULED";
    record.lastChangedAt = requestedAt;
    record.nextAttemptAt = requestedAt + delayMs;
    record.scheduledDelayMs = delayMs;

    this.emit({
      type: "RECONNECT_SCHEDULED",
      record,
      occurredAt: requestedAt,
      trigger: request.trigger,
      attempt: record.attemptCount + 1,
      delayMs,
      nextAttemptAt: record.nextAttemptAt,
      reason: record.reason,
    });

    return createSnapshot(record);
  }

  /**
   * Cancels a pending reconnect schedule.
   */
  public cancel(
    connectionId: WebSocketConnectionId,
    reason = "Reconnection cancelled.",
  ): ReconnectionConnectionSnapshot {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    if (
      this.activeOperations.has(normalizedConnectionId)
    ) {
      throw new ReconnectionControllerError(
        "RECONNECTION_OPERATION_IN_PROGRESS",
        `Cannot cancel connection "${normalizedConnectionId}" while a reconnect operation is active.`,
        {
          connectionId: normalizedConnectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    const timestamp = this.now();

    record.status = "CANCELLED";
    record.lastChangedAt = timestamp;
    record.nextAttemptAt = undefined;
    record.scheduledDelayMs = undefined;
    record.reason = validateReason(reason);

    this.emit({
      type: "RECONNECT_CANCELLED",
      record,
      occurredAt: timestamp,
      trigger: record.trigger,
      reason: record.reason,
    });

    return createSnapshot(record);
  }

  /**
   * Resets all retry counters and clears scheduling state.
   */
  public reset(
    connectionId: WebSocketConnectionId,
  ): ReconnectionConnectionSnapshot {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    if (
      this.activeOperations.has(normalizedConnectionId)
    ) {
      throw new ReconnectionControllerError(
        "RECONNECTION_OPERATION_IN_PROGRESS",
        `Cannot reset connection "${normalizedConnectionId}" while a reconnect operation is active.`,
        {
          connectionId: normalizedConnectionId,
        },
      );
    }

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    const timestamp = this.now();

    record.attemptCount = 0;
    record.consecutiveFailureCount = 0;
    record.nextAttemptAt = undefined;
    record.scheduledDelayMs = undefined;
    record.trigger = undefined;
    record.reason = undefined;
    record.lastChangedAt = timestamp;
    record.status = deriveInitialStatus(
      record.connection.getState(),
    );

    return createSnapshot(record);
  }

  /**
   * Reconciles controller status with the actual connection state.
   */
  public reconcile(
    connectionId: WebSocketConnectionId,
  ): ReconnectionConnectionSnapshot {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    const connectionState =
      record.connection.getState();

    const previousStatus = record.status;
    const timestamp = this.now();

    if (connectionState === "CONNECTED") {
      record.status = "CONNECTED";
      record.nextAttemptAt = undefined;
      record.scheduledDelayMs = undefined;
      record.consecutiveFailureCount = 0;

      if (record.policy.resetAttemptsOnSuccess) {
        record.attemptCount = 0;
      }
    } else if (
      connectionState === "FAILED" &&
      record.status !== "SCHEDULED" &&
      record.status !== "RECONNECTING" &&
      record.status !== "EXHAUSTED"
    ) {
      record.status = "IDLE";
    } else if (connectionState === "DISPOSED") {
      record.status = "DISPOSED";
      record.nextAttemptAt = undefined;
      record.scheduledDelayMs = undefined;
    }

    if (record.status !== previousStatus) {
      record.lastChangedAt = timestamp;

      this.emit({
        type: "STATE_RECONCILED",
        record,
        occurredAt: timestamp,
        reason: `Connection state is ${connectionState}.`,
      });
    }

    return createSnapshot(record);
  }

  /**
   * Executes all reconnect attempts whose schedules are due.
   */
  public async tick(): Promise<ReconnectionTickResult> {
    this.assertActive();

    const processedAt = this.now();

    const attemptedConnectionIds:
      WebSocketConnectionId[] = [];

    const reconnectedConnectionIds:
      WebSocketConnectionId[] = [];

    const exhaustedConnectionIds:
      WebSocketConnectionId[] = [];

    const failures: ReconnectionTickFailure[] = [];

    const records = this.getOrderedRecords();

    for (const record of records) {
      const isDue =
        record.status === "SCHEDULED" &&
        record.nextAttemptAt !== undefined &&
        record.nextAttemptAt <= processedAt;

      if (!isDue) {
        continue;
      }

      const connectionId = record.connectionId;
      const exchangeId = record.exchangeId;

      attemptedConnectionIds.push(connectionId);

      try {
        await this.reconnect(connectionId);

        /*
         * Re-read the record after the asynchronous operation so TypeScript
         * does not retain the earlier SCHEDULED control-flow narrowing.
         */
        const updatedRecord =
          this.getRequiredRecord(connectionId);

        if (updatedRecord.status === "CONNECTED") {
          reconnectedConnectionIds.push(connectionId);
        } else if (
          updatedRecord.status === "EXHAUSTED"
        ) {
          exhaustedConnectionIds.push(connectionId);
        }
      } catch (error: unknown) {
        failures.push({
          connectionId,
          exchangeId,
          error: normalizeError(error),
        });

        /*
         * reconnect() may transition the record to either SCHEDULED or
         * EXHAUSTED before rejecting.
         */
        const updatedRecord =
          this.getRequiredRecord(connectionId);

        if (updatedRecord.status === "EXHAUSTED") {
          exhaustedConnectionIds.push(connectionId);
        }
      }
    }

    return Object.freeze({
      processedAt,

      attemptedConnectionIds: Object.freeze([
        ...attemptedConnectionIds,
      ]),

      reconnectedConnectionIds: Object.freeze([
        ...reconnectedConnectionIds,
      ]),

      exhaustedConnectionIds: Object.freeze([
        ...exhaustedConnectionIds,
      ]),

      failures: Object.freeze(
        failures.map((failure) =>
          Object.freeze({
            ...failure,
          }),
        ),
      ),
    });
  }

  /**
   * Performs an immediate reconnect operation.
   */
  public reconnect(
    connectionId: WebSocketConnectionId,
  ): Promise<void> {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const existingOperation =
      this.activeOperations.get(
        normalizedConnectionId,
      );

    if (existingOperation !== undefined) {
      return existingOperation;
    }

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    if (record.status === "DISPOSED") {
      return Promise.reject(
        new ReconnectionControllerError(
          "RECONNECTION_RECORD_DISPOSED",
          `Connection "${normalizedConnectionId}" has been disposed.`,
          {
            connectionId: normalizedConnectionId,
            exchangeId: record.exchangeId,
          },
        ),
      );
    }

    if (
      record.attemptCount >= record.policy.maxAttempts
    ) {
      this.markExhausted(
        record,
        this.now(),
        "Maximum reconnect attempts reached.",
      );

      return Promise.reject(
        new ReconnectionControllerError(
          "RECONNECT_ATTEMPTS_EXHAUSTED",
          `Connection "${normalizedConnectionId}" has exhausted all reconnect attempts.`,
          {
            connectionId: normalizedConnectionId,
            exchangeId: record.exchangeId,
          },
        ),
      );
    }

    const operation = this.performReconnect(record).finally(
      () => {
        this.activeOperations.delete(
          normalizedConnectionId,
        );
      },
    );

    this.activeOperations.set(
      normalizedConnectionId,
      operation,
    );

    return operation;
  }

  public subscribe(
    listener: ReconnectionEventListener,
  ): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new ReconnectionControllerError(
        "INVALID_RECONNECTION_LISTENER",
        "Reconnection event listener must be a function.",
      );
    }

    this.listeners.add(listener);

    let subscribed = true;

    return (): void => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  public getConnection(
    connectionId: WebSocketConnectionId,
  ): ReconnectionConnectionSnapshot | undefined {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const record = this.records.get(
      normalizedConnectionId,
    );

    return record === undefined
      ? undefined
      : createSnapshot(record);
  }

  public getConnectionsForExchange(
    exchangeId: WebSocketExchangeId,
  ): readonly ReconnectionConnectionSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.exchangeId === normalizedExchangeId,
        )
        .map((record) => createSnapshot(record)),
    );
  }

  public getScheduledConnections():
    readonly ReconnectionConnectionSnapshot[] {
    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.status === "SCHEDULED",
        )
        .map((record) => createSnapshot(record)),
    );
  }

  public getSnapshot():
    ReconnectionControllerSnapshot {
    const connections = this.getOrderedRecords().map(
      (record) => createSnapshot(record),
    );

    let idleConnections = 0;
    let scheduledConnections = 0;
    let reconnectingConnections = 0;
    let connectedConnections = 0;
    let exhaustedConnections = 0;
    let cancelledConnections = 0;

    for (const connection of connections) {
      switch (connection.status) {
        case "IDLE":
          idleConnections += 1;
          break;

        case "SCHEDULED":
          scheduledConnections += 1;
          break;

        case "RECONNECTING":
          reconnectingConnections += 1;
          break;

        case "CONNECTED":
          connectedConnections += 1;
          break;

        case "EXHAUSTED":
          exhaustedConnections += 1;
          break;

        case "CANCELLED":
          cancelledConnections += 1;
          break;

        case "DISPOSED":
          break;

        default:
          assertNever(connection.status);
      }
    }

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalConnections: connections.length,
      idleConnections,
      scheduledConnections,
      reconnectingConnections,
      connectedConnections,
      exhaustedConnections,
      cancelledConnections,
      connections: Object.freeze(connections),
    });
  }

  public get size(): number {
    return this.records.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    if (this.activeOperations.size > 0) {
      throw new ReconnectionControllerError(
        "RECONNECTION_OPERATIONS_IN_PROGRESS",
        "Cannot dispose the reconnection controller while reconnect operations are active.",
      );
    }

    const timestamp = this.now();

    for (const record of this.records.values()) {
      record.status = "DISPOSED";
      record.lastChangedAt = timestamp;
      record.nextAttemptAt = undefined;
      record.scheduledDelayMs = undefined;
    }

    this.records.clear();
    this.listeners.clear();
    this.disposed = true;
  }

  private async performReconnect(
    record: MutableReconnectionRecord,
  ): Promise<void> {
    const attemptedAt = this.now();
    const attempt = record.attemptCount + 1;

    record.status = "RECONNECTING";
    record.lastChangedAt = attemptedAt;
    record.lastAttemptAt = attemptedAt;
    record.attemptCount = attempt;
    record.nextAttemptAt = undefined;
    record.scheduledDelayMs = undefined;

    this.emit({
      type: "RECONNECT_STARTED",
      record,
      occurredAt: attemptedAt,
      trigger: record.trigger,
      attempt,
      reason: record.reason,
    });

    try {
      const connectionState =
        record.connection.getState();

      if (
        record.policy.disconnectBeforeReconnect &&
        requiresDisconnection(connectionState)
      ) {
        await this.manager.disconnect(
          record.connectionId,
          "Preparing connection for reconnection.",
        );
      }

      await this.manager.connect(record.connectionId);

      const connectedState =
        record.connection.getState();

      if (connectedState !== "CONNECTED") {
        throw new ReconnectionControllerError(
          "RECONNECT_STATE_MISMATCH",
          `Connection "${record.connectionId}" did not enter CONNECTED state after reconnect.`,
          {
            connectionId: record.connectionId,
            exchangeId: record.exchangeId,
          },
        );
      }

      const succeededAt = this.now();

      record.status = "CONNECTED";
      record.lastChangedAt = succeededAt;
      record.lastSuccessAt = succeededAt;
      record.successfulReconnectCount += 1;
      record.consecutiveFailureCount = 0;
      record.nextAttemptAt = undefined;
      record.scheduledDelayMs = undefined;
      record.reason = undefined;

      if (record.policy.resetAttemptsOnSuccess) {
        record.attemptCount = 0;
      }

      this.emit({
        type: "RECONNECT_SUCCEEDED",
        record,
        occurredAt: succeededAt,
        trigger: record.trigger,
        attempt,
      });
    } catch (error: unknown) {
      const normalizedError = normalizeError(error);
      const failedAt = this.now();

      record.lastFailureAt = failedAt;
      record.failedReconnectCount += 1;
      record.consecutiveFailureCount += 1;
      record.lastChangedAt = failedAt;

      this.emit({
        type: "RECONNECT_FAILED",
        record,
        occurredAt: failedAt,
        trigger: record.trigger,
        attempt,
        reason: normalizedError.message,
        error: normalizedError,
      });

      if (
        record.attemptCount >= record.policy.maxAttempts
      ) {
        this.markExhausted(
          record,
          failedAt,
          normalizedError.message,
        );
      } else {
        const delayMs = this.calculateDelay(
          record.attemptCount + 1,
          record.policy,
        );

        record.status = "SCHEDULED";
        record.nextAttemptAt = failedAt + delayMs;
        record.scheduledDelayMs = delayMs;
        record.reason = normalizedError.message;

        this.emit({
          type: "RECONNECT_SCHEDULED",
          record,
          occurredAt: failedAt,
          trigger: record.trigger,
          attempt: record.attemptCount + 1,
          delayMs,
          nextAttemptAt: record.nextAttemptAt,
          reason: normalizedError.message,
        });
      }

      throw new ReconnectionControllerError(
        "RECONNECT_ATTEMPT_FAILED",
        `Reconnect attempt ${attempt} failed for connection "${record.connectionId}".`,
        {
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
          cause: error,
        },
      );
    }
  }

  private markExhausted(
    record: MutableReconnectionRecord,
    occurredAt: number,
    reason: string,
  ): void {
    record.status = "EXHAUSTED";
    record.lastChangedAt = occurredAt;
    record.nextAttemptAt = undefined;
    record.scheduledDelayMs = undefined;
    record.reason = reason;

    this.emit({
      type: "RECONNECT_EXHAUSTED",
      record,
      occurredAt,
      trigger: record.trigger,
      attempt: record.attemptCount,
      reason,
    });
  }

  private calculateDelay(
    attempt: number,
    policy: ReconnectionPolicy,
  ): number {
    const exponentialDelay =
      policy.initialDelayMs *
      Math.pow(policy.backoffMultiplier, attempt - 1);

    const cappedDelay = Math.min(
      exponentialDelay,
      policy.maxDelayMs,
    );

    if (policy.jitterRatio === 0) {
      return Math.round(cappedDelay);
    }

    const jitterValue = this.jitterProvider.next();

    validateJitterValue(jitterValue);

    const normalizedOffset =
      jitterValue * 2 - 1;

    const jitterAmount =
      cappedDelay *
      policy.jitterRatio *
      normalizedOffset;

    const jitteredDelay = Math.max(
      0,
      Math.min(
        policy.maxDelayMs,
        cappedDelay + jitterAmount,
      ),
    );

    return Math.round(jitteredDelay);
  }

  private emit(input: {
    readonly type: ReconnectionEventType;
    readonly record: MutableReconnectionRecord;
    readonly occurredAt?: number;
    readonly trigger?: ReconnectionTrigger;
    readonly attempt?: number;
    readonly delayMs?: number;
    readonly nextAttemptAt?: number;
    readonly reason?: string;
    readonly error?: Error;
  }): void {
    const event: ReconnectionEvent = Object.freeze({
      eventId: this.nextEventId,
      type: input.type,
      connectionId: input.record.connectionId,
      exchangeId: input.record.exchangeId,
      occurredAt: input.occurredAt ?? this.now(),
      status: input.record.status,
      trigger: input.trigger,
      attempt: input.attempt,
      delayMs: input.delayMs,
      nextAttemptAt: input.nextAttemptAt,
      reason: input.reason,
      error: input.error,
    });

    this.nextEventId += 1;

    const listeners = [...this.listeners];

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not interrupt reconnect operations.
      }
    }
  }

  private getRequiredRecord(
    connectionId: WebSocketConnectionId,
  ): MutableReconnectionRecord {
    const record = this.records.get(connectionId);

    if (record === undefined) {
      throw new ReconnectionControllerError(
        "RECONNECTION_CONNECTION_NOT_FOUND",
        `Connection "${connectionId}" is not registered with the reconnection controller.`,
        {
          connectionId,
        },
      );
    }

    return record;
  }

  private getOrderedRecords():
    MutableReconnectionRecord[] {
    return [...this.records.values()].sort(
      (left, right) => {
        if (left.registeredAt !== right.registeredAt) {
          return left.registeredAt - right.registeredAt;
        }

        return left.connectionId.localeCompare(
          right.connectionId,
        );
      },
    );
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new ReconnectionControllerError(
        "RECONNECTION_CONTROLLER_DISPOSED",
        "The reconnection controller has been disposed.",
      );
    }
  }
}

function createSnapshot(
  record: MutableReconnectionRecord,
): ReconnectionConnectionSnapshot {
  return Object.freeze({
    connectionId: record.connectionId,
    exchangeId: record.exchangeId,
    connectionState: record.connection.getState(),
    status: record.status,
    registeredAt: record.registeredAt,
    lastChangedAt: record.lastChangedAt,
    attemptCount: record.attemptCount,
    consecutiveFailureCount:
      record.consecutiveFailureCount,
    successfulReconnectCount:
      record.successfulReconnectCount,
    failedReconnectCount:
      record.failedReconnectCount,
    lastAttemptAt: record.lastAttemptAt,
    lastSuccessAt: record.lastSuccessAt,
    lastFailureAt: record.lastFailureAt,
    nextAttemptAt: record.nextAttemptAt,
    scheduledDelayMs: record.scheduledDelayMs,
    trigger: record.trigger,
    reason: record.reason,
    maxAttempts: record.policy.maxAttempts,
    initialDelayMs: record.policy.initialDelayMs,
    maxDelayMs: record.policy.maxDelayMs,
    backoffMultiplier:
      record.policy.backoffMultiplier,
    jitterRatio: record.policy.jitterRatio,
    resetAttemptsOnSuccess:
      record.policy.resetAttemptsOnSuccess,
    disconnectBeforeReconnect:
      record.policy.disconnectBeforeReconnect,
    metadata: Object.freeze({
      ...record.metadata,
    }),
  });
}

function normalizePolicy(
  policy: Partial<ReconnectionPolicy>,
): ReconnectionPolicy {
  const maxAttempts = validatePositiveSafeInteger(
    policy.maxAttempts ??
      DEFAULT_RECONNECTION_POLICY.maxAttempts,
    "maxAttempts",
  );

  const initialDelayMs =
    validateNonNegativeFiniteNumber(
      policy.initialDelayMs ??
        DEFAULT_RECONNECTION_POLICY.initialDelayMs,
      "initialDelayMs",
    );

  const maxDelayMs =
    validateNonNegativeFiniteNumber(
      policy.maxDelayMs ??
        DEFAULT_RECONNECTION_POLICY.maxDelayMs,
      "maxDelayMs",
    );

  if (maxDelayMs < initialDelayMs) {
    throw new ReconnectionControllerError(
      "INVALID_RECONNECTION_DELAY_RANGE",
      "maxDelayMs cannot be smaller than initialDelayMs.",
    );
  }

  const backoffMultiplier =
    validateBackoffMultiplier(
      policy.backoffMultiplier ??
        DEFAULT_RECONNECTION_POLICY
          .backoffMultiplier,
    );

  const jitterRatio = validateJitterRatio(
    policy.jitterRatio ??
      DEFAULT_RECONNECTION_POLICY.jitterRatio,
  );

  const resetAttemptsOnSuccess =
    policy.resetAttemptsOnSuccess ??
    DEFAULT_RECONNECTION_POLICY
      .resetAttemptsOnSuccess;

  const disconnectBeforeReconnect =
    policy.disconnectBeforeReconnect ??
    DEFAULT_RECONNECTION_POLICY
      .disconnectBeforeReconnect;

  if (typeof resetAttemptsOnSuccess !== "boolean") {
    throw new ReconnectionControllerError(
      "INVALID_RESET_ATTEMPTS_OPTION",
      "resetAttemptsOnSuccess must be boolean.",
    );
  }

  if (
    typeof disconnectBeforeReconnect !== "boolean"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_DISCONNECT_BEFORE_RECONNECT",
      "disconnectBeforeReconnect must be boolean.",
    );
  }

  return Object.freeze({
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitterRatio,
    resetAttemptsOnSuccess,
    disconnectBeforeReconnect,
  });
}

function validateRegistration(
  registration: ReconnectionRegistration,
): void {
  if (
    registration === null ||
    typeof registration !== "object"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_RECONNECTION_REGISTRATION",
      "Reconnection registration must be an object.",
    );
  }

  validateManagedConnection(registration.connection);

  if (
    registration.policy !== undefined &&
    (registration.policy === null ||
      typeof registration.policy !== "object" ||
      Array.isArray(registration.policy))
  ) {
    throw new ReconnectionControllerError(
      "INVALID_RECONNECTION_POLICY",
      "Reconnection policy must be an object when provided.",
    );
  }

  validateOptionalRecord(
    registration.metadata,
    "registration.metadata",
  );
}

function validateScheduleRequest(
  request: ReconnectionScheduleRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_RECONNECTION_REQUEST",
      "Reconnection schedule request must be an object.",
    );
  }

  normalizeConnectionId(request.connectionId);
  validateReconnectionTrigger(request.trigger);

  if (request.reason !== undefined) {
    normalizeOptionalReason(request.reason);
  }

  if (
    request.immediate !== undefined &&
    typeof request.immediate !== "boolean"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_IMMEDIATE_OPTION",
      "request.immediate must be boolean when provided.",
    );
  }

  if (request.requestedAt !== undefined) {
    validateTimestamp(
      request.requestedAt,
      "request.requestedAt",
    );
  }
}

function validateManagedConnection(
  connection: ManagedWebSocketConnection,
): void {
  if (
    connection === null ||
    typeof connection !== "object" ||
    connection.descriptor === undefined ||
    typeof connection.getState !== "function"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_MANAGED_CONNECTION",
      "A valid ManagedWebSocketConnection is required.",
    );
  }

  normalizeConnectionId(
    connection.descriptor.connectionId,
  );

  normalizeExchangeId(
    connection.descriptor.exchangeId,
  );
}

function validateManager(
  manager: WebSocketManager,
): WebSocketManager {
  if (
    manager === null ||
    typeof manager !== "object" ||
    typeof manager.connect !== "function" ||
    typeof manager.disconnect !== "function"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_WEBSOCKET_MANAGER",
      "A valid WebSocketManager instance is required.",
    );
  }

  return manager;
}

function validateClock(
  clock: ReconnectionControllerClock,
): ReconnectionControllerClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_CLOCK",
      "Reconnection controller clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function validateJitterProvider(
  jitterProvider: ReconnectionJitterProvider,
): ReconnectionJitterProvider {
  if (
    jitterProvider === null ||
    typeof jitterProvider !== "object" ||
    typeof jitterProvider.next !== "function"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_JITTER_PROVIDER",
      "Reconnection jitter provider must implement next().",
    );
  }

  validateJitterValue(jitterProvider.next());

  return jitterProvider;
}

function validateJitterValue(value: number): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new ReconnectionControllerError(
      "INVALID_JITTER_VALUE",
      "Jitter provider must return a finite number from 0 through 1.",
    );
  }
}

function validateReconnectionTrigger(
  trigger: ReconnectionTrigger,
): void {
  if (
    trigger !== "MANUAL" &&
    trigger !== "CONNECTION_FAILURE" &&
    trigger !== "HEARTBEAT_TIMEOUT" &&
    trigger !== "INACTIVITY_TIMEOUT" &&
    trigger !== "CONNECTION_CLOSED" &&
    trigger !== "HEALTH_DEGRADED" &&
    trigger !== "UNKNOWN"
  ) {
    throw new ReconnectionControllerError(
      "INVALID_RECONNECTION_TRIGGER",
      `Unsupported reconnection trigger "${String(
        trigger,
      )}".`,
    );
  }
}

function deriveInitialStatus(
  state: WebSocketConnectionState,
): ReconnectionStatus {
  switch (state) {
    case "CONNECTED":
      return "CONNECTED";

    case "DISPOSED":
      return "DISPOSED";

    case "REGISTERED":
    case "CONNECTING":
    case "DISCONNECTING":
    case "DISCONNECTED":
    case "RECONNECTING":
    case "FAILED":
      return "IDLE";

    default:
      return assertNever(state);
  }
}

function requiresDisconnection(
  state: WebSocketConnectionState,
): boolean {
  return (
    state === "CONNECTING" ||
    state === "CONNECTED" ||
    state === "DISCONNECTING" ||
    state === "RECONNECTING" ||
    state === "FAILED"
  );
}

function normalizeConnectionId(
  connectionId: WebSocketConnectionId,
): WebSocketConnectionId {
  return validateIdentifier(
    connectionId,
    "connectionId",
  );
}

function normalizeExchangeId(
  exchangeId: WebSocketExchangeId,
): WebSocketExchangeId {
  return validateIdentifier(
    exchangeId,
    "exchangeId",
  ).toUpperCase();
}

function validateIdentifier(
  value: string,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new ReconnectionControllerError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function validateReason(reason: string): string {
  if (
    typeof reason !== "string" ||
    reason.trim().length === 0
  ) {
    throw new ReconnectionControllerError(
      "INVALID_REASON",
      "Reconnection reason must be a non-empty string.",
    );
  }

  return reason.trim();
}

function normalizeOptionalReason(
  reason: string | undefined,
): string | undefined {
  return reason === undefined
    ? undefined
    : validateReason(reason);
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new ReconnectionControllerError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function validatePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new ReconnectionControllerError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateNonNegativeFiniteNumber(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new ReconnectionControllerError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
}

function validateBackoffMultiplier(
  value: number,
): number {
  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new ReconnectionControllerError(
      "INVALID_BACKOFF_MULTIPLIER",
      "backoffMultiplier must be a finite number greater than or equal to 1.",
    );
  }

  return value;
}

function validateJitterRatio(
  value: number,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new ReconnectionControllerError(
      "INVALID_JITTER_RATIO",
      "jitterRatio must be a finite number from 0 through 1.",
    );
  }

  return value;
}

function validateOptionalRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (value === null ||
      typeof value !== "object" ||
      Array.isArray(value))
  ) {
    throw new ReconnectionControllerError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(
      "Unknown reconnection controller error.",
    );
  }
}

function assertNever(value: never): never {
  throw new ReconnectionControllerError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}