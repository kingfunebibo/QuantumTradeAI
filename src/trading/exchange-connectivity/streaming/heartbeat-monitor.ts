/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 7:
 * Heartbeat Monitor
 *
 * This module supervises WebSocket connection liveness through deterministic
 * heartbeat cycles.
 *
 * Responsibilities:
 * - Register and unregister monitored connections
 * - Track inbound activity
 * - Track heartbeat transmission and acknowledgement
 * - Detect heartbeat and message inactivity timeouts
 * - Classify connection health
 * - Invoke injected heartbeat senders
 * - Emit immutable heartbeat events
 * - Produce deterministic health snapshots
 *
 * The monitor intentionally avoids internal timers. The orchestration layer
 * calls tick() at deterministic intervals, making behavior straightforward
 * to test without relying on wall-clock scheduling.
 */

import {
  ManagedWebSocketConnection,
  WebSocketConnectionId,
  WebSocketConnectionState,
  WebSocketExchangeId,
  WebSocketMessageKind,
  WebSocketOutboundMessage,
} from "./websocket-manager";

export type HeartbeatHealthStatus =
  | "UNKNOWN"
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY";

export type HeartbeatEventType =
  | "CONNECTION_REGISTERED"
  | "CONNECTION_UNREGISTERED"
  | "ACTIVITY_RECORDED"
  | "HEARTBEAT_SENT"
  | "HEARTBEAT_ACKNOWLEDGED"
  | "HEARTBEAT_SEND_FAILED"
  | "HEARTBEAT_TIMEOUT"
  | "INACTIVITY_TIMEOUT"
  | "HEALTH_CHANGED";

export interface HeartbeatMonitorClock {
  now(): number;
}

export interface HeartbeatMonitorConfiguration {
  /**
   * Minimum duration between heartbeat transmissions.
   */
  readonly heartbeatIntervalMs: number;

  /**
   * Maximum time to wait for acknowledgement of a sent heartbeat.
   */
  readonly heartbeatTimeoutMs: number;

  /**
   * Maximum permitted duration without any inbound activity.
   *
   * Set to zero to disable inactivity checks.
   */
  readonly inactivityTimeoutMs: number;

  /**
   * Number of consecutive failures before health becomes UNHEALTHY.
   */
  readonly unhealthyFailureThreshold: number;

  /**
   * When true, any inbound message may acknowledge an outstanding heartbeat.
   *
   * Defaults to false.
   */
  readonly activityAcknowledgesHeartbeat?: boolean;
}

export interface HeartbeatConnectionRegistration {
  readonly connection: ManagedWebSocketConnection;

  /**
   * Optional configuration override for this connection.
   */
  readonly configuration?: Partial<HeartbeatMonitorConfiguration>;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HeartbeatSendContext {
  readonly connection: ManagedWebSocketConnection;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly heartbeatSequence: number;
  readonly sentAt: number;
}

export interface HeartbeatSender {
  createHeartbeatMessage(
    context: HeartbeatSendContext,
  ): WebSocketOutboundMessage;

  sendHeartbeat?(
    context: HeartbeatSendContext,
    message: WebSocketOutboundMessage,
  ): Promise<void>;
}

export interface HeartbeatAcknowledgement {
  readonly connectionId: WebSocketConnectionId;
  readonly heartbeatSequence?: number;
  readonly acknowledgedAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HeartbeatActivity {
  readonly connectionId: WebSocketConnectionId;
  readonly occurredAt?: number;
  readonly messageKind?: WebSocketMessageKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HeartbeatEvent {
  readonly eventId: number;
  readonly type: HeartbeatEventType;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly occurredAt: number;
  readonly healthStatus: HeartbeatHealthStatus;
  readonly heartbeatSequence?: number;
  readonly previousHealthStatus?: HeartbeatHealthStatus;
  readonly reason?: string;
  readonly error?: Error;
}

export type HeartbeatEventListener = (
  event: HeartbeatEvent,
) => void;

export interface HeartbeatConnectionSnapshot {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly connectionState: WebSocketConnectionState;
  readonly healthStatus: HeartbeatHealthStatus;
  readonly registeredAt: number;
  readonly lastChangedAt: number;
  readonly lastActivityAt: number;
  readonly lastHeartbeatSentAt?: number;
  readonly lastHeartbeatAcknowledgedAt?: number;
  readonly outstandingHeartbeatSequence?: number;
  readonly nextHeartbeatSequence: number;
  readonly sentHeartbeatCount: number;
  readonly acknowledgedHeartbeatCount: number;
  readonly failedHeartbeatCount: number;
  readonly consecutiveFailureCount: number;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly inactivityTimeoutMs: number;
  readonly unhealthyFailureThreshold: number;
  readonly activityAcknowledgesHeartbeat: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface HeartbeatMonitorSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalConnections: number;
  readonly healthyConnections: number;
  readonly degradedConnections: number;
  readonly unhealthyConnections: number;
  readonly unknownConnections: number;
  readonly connections: readonly HeartbeatConnectionSnapshot[];
}

export interface HeartbeatTickFailure {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly error: Error;
}

export interface HeartbeatTickResult {
  readonly processedAt: number;
  readonly heartbeatSentConnectionIds:
    readonly WebSocketConnectionId[];
  readonly timedOutConnectionIds:
    readonly WebSocketConnectionId[];
  readonly inactiveConnectionIds:
    readonly WebSocketConnectionId[];
  readonly failures: readonly HeartbeatTickFailure[];
}

interface MutableHeartbeatRecord {
  readonly connection: ManagedWebSocketConnection;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly registeredAt: number;
  readonly configuration: HeartbeatMonitorConfiguration;
  readonly metadata: Readonly<Record<string, unknown>>;

  healthStatus: HeartbeatHealthStatus;
  lastChangedAt: number;
  lastActivityAt: number;
  lastHeartbeatSentAt?: number;
  lastHeartbeatAcknowledgedAt?: number;
  outstandingHeartbeatSequence?: number;
  nextHeartbeatSequence: number;
  sentHeartbeatCount: number;
  acknowledgedHeartbeatCount: number;
  failedHeartbeatCount: number;
  consecutiveFailureCount: number;
}

const DEFAULT_CONFIGURATION: HeartbeatMonitorConfiguration =
  Object.freeze({
    heartbeatIntervalMs: 15_000,
    heartbeatTimeoutMs: 10_000,
    inactivityTimeoutMs: 45_000,
    unhealthyFailureThreshold: 3,
    activityAcknowledgesHeartbeat: false,
  });

const SYSTEM_CLOCK: HeartbeatMonitorClock = Object.freeze({
  now: (): number => Date.now(),
});

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

const VALID_MESSAGE_KINDS: readonly WebSocketMessageKind[] =
  Object.freeze<WebSocketMessageKind[]>([
    "TEXT",
    "BINARY",
    "JSON",
    "PING",
    "PONG",
    "UNKNOWN",
  ]);

export class HeartbeatMonitorError extends Error {
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

    this.name = "HeartbeatMonitorError";
    this.code = code;
    this.connectionId = context?.connectionId;
    this.exchangeId = context?.exchangeId;
  }
}

/**
 * Deterministic heartbeat and liveness supervisor.
 */
export class HeartbeatMonitor {
  private readonly records =
    new Map<WebSocketConnectionId, MutableHeartbeatRecord>();

  private readonly listeners =
    new Set<HeartbeatEventListener>();

  private readonly activeSends =
    new Map<WebSocketConnectionId, Promise<void>>();

  private readonly sender: HeartbeatSender;
  private readonly clock: HeartbeatMonitorClock;
  private readonly defaultConfiguration:
    HeartbeatMonitorConfiguration;

  private nextEventId = 1;
  private disposed = false;

  public constructor(
    sender: HeartbeatSender,
    configuration: Partial<HeartbeatMonitorConfiguration> = {},
    clock: HeartbeatMonitorClock = SYSTEM_CLOCK,
  ) {
    this.sender = validateSender(sender);
    this.clock = validateClock(clock);

    this.defaultConfiguration =
      normalizeConfiguration({
        ...DEFAULT_CONFIGURATION,
        ...configuration,
      });
  }

  /**
   * Registers a connection for heartbeat supervision.
   */
  public register(
    registration: HeartbeatConnectionRegistration,
  ): HeartbeatConnectionSnapshot {
    this.assertActive();
    validateRegistration(registration);

    const connection = registration.connection;
    const descriptor = connection.descriptor;
    const connectionId = descriptor.connectionId;
    const exchangeId = descriptor.exchangeId;

    if (this.records.has(connectionId)) {
      throw new HeartbeatMonitorError(
        "DUPLICATE_HEARTBEAT_CONNECTION",
        `Connection "${connectionId}" is already registered with the heartbeat monitor.`,
        {
          connectionId,
          exchangeId,
        },
      );
    }

    const configuration =
      normalizeConfiguration({
        ...this.defaultConfiguration,
        ...(registration.configuration ?? {}),
      });

    const timestamp = this.now();

    const record: MutableHeartbeatRecord = {
      connection,
      connectionId,
      exchangeId,
      registeredAt: timestamp,
      configuration,
      metadata:
        registration.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({
              ...registration.metadata,
            }),
      healthStatus: deriveInitialHealth(
        connection.getState(),
      ),
      lastChangedAt: timestamp,
      lastActivityAt: timestamp,
      nextHeartbeatSequence: 1,
      sentHeartbeatCount: 0,
      acknowledgedHeartbeatCount: 0,
      failedHeartbeatCount: 0,
      consecutiveFailureCount: 0,
    };

    this.records.set(connectionId, record);

    this.emit({
      type: "CONNECTION_REGISTERED",
      record,
    });

    return createConnectionSnapshot(record);
  }

  /**
   * Removes a connection from heartbeat supervision.
   */
  public unregister(
    connectionId: WebSocketConnectionId,
  ): HeartbeatConnectionSnapshot {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    if (this.activeSends.has(normalizedConnectionId)) {
      throw new HeartbeatMonitorError(
        "HEARTBEAT_SEND_IN_PROGRESS",
        `Connection "${normalizedConnectionId}" has a heartbeat send operation in progress.`,
        {
          connectionId: normalizedConnectionId,
        },
      );
    }

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    const snapshot = createConnectionSnapshot(record);

    this.records.delete(normalizedConnectionId);

    this.emit({
      type: "CONNECTION_UNREGISTERED",
      record,
    });

    return snapshot;
  }

  /**
   * Records inbound WebSocket activity.
   */
  public recordActivity(
    activity: HeartbeatActivity,
  ): HeartbeatConnectionSnapshot {
    this.assertActive();
    validateActivity(activity);

    const connectionId =
      normalizeConnectionId(activity.connectionId);

    const record = this.getRequiredRecord(connectionId);

    const occurredAt =
      activity.occurredAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "activity.occurredAt",
    );

    if (occurredAt < record.lastActivityAt) {
      throw new HeartbeatMonitorError(
        "NON_MONOTONIC_ACTIVITY_TIMESTAMP",
        `Activity timestamp ${occurredAt} is earlier than the previous activity timestamp ${record.lastActivityAt}.`,
        {
          connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    record.lastActivityAt = occurredAt;
    record.lastChangedAt = occurredAt;

    if (
      record.configuration
        .activityAcknowledgesHeartbeat &&
      record.outstandingHeartbeatSequence !== undefined
    ) {
      this.acknowledgeInternal(
        record,
        record.outstandingHeartbeatSequence,
        occurredAt,
      );
    } else if (
      record.healthStatus !== "HEALTHY" &&
      record.connection.getState() === "CONNECTED"
    ) {
      record.consecutiveFailureCount = 0;
      this.changeHealth(
        record,
        "HEALTHY",
        occurredAt,
        "Inbound activity restored connection health.",
      );
    }

    this.emit({
      type: "ACTIVITY_RECORDED",
      record,
      occurredAt,
    });

    return createConnectionSnapshot(record);
  }

  /**
   * Acknowledges a heartbeat response.
   */
  public acknowledge(
    acknowledgement: HeartbeatAcknowledgement,
  ): HeartbeatConnectionSnapshot {
    this.assertActive();
    validateAcknowledgement(acknowledgement);

    const connectionId =
      normalizeConnectionId(
        acknowledgement.connectionId,
      );

    const record = this.getRequiredRecord(connectionId);

    if (record.outstandingHeartbeatSequence === undefined) {
      throw new HeartbeatMonitorError(
        "NO_OUTSTANDING_HEARTBEAT",
        `Connection "${connectionId}" has no outstanding heartbeat.`,
        {
          connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    const sequence =
      acknowledgement.heartbeatSequence ??
      record.outstandingHeartbeatSequence;

    if (
      sequence !==
      record.outstandingHeartbeatSequence
    ) {
      throw new HeartbeatMonitorError(
        "HEARTBEAT_SEQUENCE_MISMATCH",
        `Heartbeat acknowledgement sequence ${sequence} does not match outstanding sequence ${record.outstandingHeartbeatSequence}.`,
        {
          connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    const acknowledgedAt =
      acknowledgement.acknowledgedAt ?? this.now();

    validateTimestamp(
      acknowledgedAt,
      "acknowledgement.acknowledgedAt",
    );

    this.acknowledgeInternal(
      record,
      sequence,
      acknowledgedAt,
    );

    return createConnectionSnapshot(record);
  }

  /**
   * Executes one deterministic heartbeat monitoring cycle.
   */
  public async tick(): Promise<HeartbeatTickResult> {
    this.assertActive();

    const processedAt = this.now();

    const heartbeatSentConnectionIds:
      WebSocketConnectionId[] = [];

    const timedOutConnectionIds:
      WebSocketConnectionId[] = [];

    const inactiveConnectionIds:
      WebSocketConnectionId[] = [];

    const failures: HeartbeatTickFailure[] = [];

    const records = this.getOrderedRecords();

    for (const record of records) {
      const state = record.connection.getState();

      if (state !== "CONNECTED") {
        this.reconcileDisconnectedState(
          record,
          state,
          processedAt,
        );

        continue;
      }

      if (
        this.hasHeartbeatTimedOut(
          record,
          processedAt,
        )
      ) {
        this.handleHeartbeatTimeout(
          record,
          processedAt,
        );

        timedOutConnectionIds.push(
          record.connectionId,
        );

        continue;
      }

      if (
        this.hasInactivityTimedOut(
          record,
          processedAt,
        )
      ) {
        this.handleInactivityTimeout(
          record,
          processedAt,
        );

        inactiveConnectionIds.push(
          record.connectionId,
        );
      }

      if (
        this.shouldSendHeartbeat(
          record,
          processedAt,
        )
      ) {
        try {
          await this.sendHeartbeat(
            record,
            processedAt,
          );

          heartbeatSentConnectionIds.push(
            record.connectionId,
          );
        } catch (error: unknown) {
          failures.push({
            connectionId: record.connectionId,
            exchangeId: record.exchangeId,
            error: normalizeError(error),
          });
        }
      }
    }

    return Object.freeze({
      processedAt,
      heartbeatSentConnectionIds: Object.freeze([
        ...heartbeatSentConnectionIds,
      ]),
      timedOutConnectionIds: Object.freeze([
        ...timedOutConnectionIds,
      ]),
      inactiveConnectionIds: Object.freeze([
        ...inactiveConnectionIds,
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
   * Sends a heartbeat immediately, regardless of interval.
   */
  public sendNow(
    connectionId: WebSocketConnectionId,
  ): Promise<void> {
    this.assertActive();

    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const existingOperation =
      this.activeSends.get(normalizedConnectionId);

    if (existingOperation !== undefined) {
      return existingOperation;
    }

    const record = this.getRequiredRecord(
      normalizedConnectionId,
    );

    if (record.connection.getState() !== "CONNECTED") {
      return Promise.reject(
        new HeartbeatMonitorError(
          "CONNECTION_NOT_CONNECTED",
          `Cannot send heartbeat through connection "${normalizedConnectionId}" because it is not connected.`,
          {
            connectionId: normalizedConnectionId,
            exchangeId: record.exchangeId,
          },
        ),
      );
    }

    return this.sendHeartbeat(record, this.now());
  }

  public subscribe(
    listener: HeartbeatEventListener,
  ): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new HeartbeatMonitorError(
        "INVALID_HEARTBEAT_LISTENER",
        "Heartbeat event listener must be a function.",
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
  ): HeartbeatConnectionSnapshot | undefined {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const record = this.records.get(
      normalizedConnectionId,
    );

    return record === undefined
      ? undefined
      : createConnectionSnapshot(record);
  }

  public getConnectionsForExchange(
    exchangeId: WebSocketExchangeId,
  ): readonly HeartbeatConnectionSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            normalizeExchangeId(record.exchangeId) ===
            normalizedExchangeId,
        )
        .map((record) =>
          createConnectionSnapshot(record),
        ),
    );
  }

  public getUnhealthyConnections():
    readonly HeartbeatConnectionSnapshot[] {
    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.healthStatus === "UNHEALTHY",
        )
        .map((record) =>
          createConnectionSnapshot(record),
        ),
    );
  }

  public getSnapshot(): HeartbeatMonitorSnapshot {
    const connections = this.getOrderedRecords().map(
      (record) => createConnectionSnapshot(record),
    );

    let healthyConnections = 0;
    let degradedConnections = 0;
    let unhealthyConnections = 0;
    let unknownConnections = 0;

    for (const connection of connections) {
      switch (connection.healthStatus) {
        case "HEALTHY":
          healthyConnections += 1;
          break;

        case "DEGRADED":
          degradedConnections += 1;
          break;

        case "UNHEALTHY":
          unhealthyConnections += 1;
          break;

        case "UNKNOWN":
          unknownConnections += 1;
          break;

        default:
          assertNever(connection.healthStatus);
      }
    }

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalConnections: connections.length,
      healthyConnections,
      degradedConnections,
      unhealthyConnections,
      unknownConnections,
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

    if (this.activeSends.size > 0) {
      throw new HeartbeatMonitorError(
        "HEARTBEAT_OPERATIONS_IN_PROGRESS",
        "Cannot dispose heartbeat monitor while heartbeat sends are in progress.",
      );
    }

    this.records.clear();
    this.listeners.clear();
    this.disposed = true;
  }

  private sendHeartbeat(
    record: MutableHeartbeatRecord,
    sentAt: number,
  ): Promise<void> {
    const existingOperation =
      this.activeSends.get(record.connectionId);

    if (existingOperation !== undefined) {
      return existingOperation;
    }

    if (
      record.outstandingHeartbeatSequence !==
      undefined
    ) {
      return Promise.reject(
        new HeartbeatMonitorError(
          "HEARTBEAT_ALREADY_OUTSTANDING",
          `Connection "${record.connectionId}" already has an outstanding heartbeat.`,
          {
            connectionId: record.connectionId,
            exchangeId: record.exchangeId,
          },
        ),
      );
    }

    const sequence = record.nextHeartbeatSequence;

    const context: HeartbeatSendContext =
      Object.freeze({
        connection: record.connection,
        connectionId: record.connectionId,
        exchangeId: record.exchangeId,
        heartbeatSequence: sequence,
        sentAt,
      });

    const operation = this.performHeartbeatSend(
      record,
      context,
    ).finally(() => {
      this.activeSends.delete(record.connectionId);
    });

    this.activeSends.set(
      record.connectionId,
      operation,
    );

    return operation;
  }

  private async performHeartbeatSend(
    record: MutableHeartbeatRecord,
    context: HeartbeatSendContext,
  ): Promise<void> {
    let message: WebSocketOutboundMessage;

    try {
      message =
        this.sender.createHeartbeatMessage(context);

      validateHeartbeatMessage(message);

      if (this.sender.sendHeartbeat !== undefined) {
        await this.sender.sendHeartbeat(
          context,
          message,
        );
      } else {
        await record.connection.send(message);
      }
    } catch (error: unknown) {
      const normalizedError = normalizeError(error);
      const failedAt = this.now();

      record.failedHeartbeatCount += 1;
      record.consecutiveFailureCount += 1;
      record.lastChangedAt = failedAt;

      this.updateHealthAfterFailure(
        record,
        failedAt,
        "Heartbeat transmission failed.",
      );

      this.emit({
        type: "HEARTBEAT_SEND_FAILED",
        record,
        occurredAt: failedAt,
        heartbeatSequence:
          context.heartbeatSequence,
        reason: normalizedError.message,
        error: normalizedError,
      });

      throw new HeartbeatMonitorError(
        "HEARTBEAT_SEND_FAILED",
        `Failed to send heartbeat through connection "${record.connectionId}".`,
        {
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
          cause: error,
        },
      );
    }

    record.nextHeartbeatSequence += 1;
    record.outstandingHeartbeatSequence =
      context.heartbeatSequence;
    record.lastHeartbeatSentAt = context.sentAt;
    record.lastChangedAt = context.sentAt;
    record.sentHeartbeatCount += 1;

    this.emit({
      type: "HEARTBEAT_SENT",
      record,
      occurredAt: context.sentAt,
      heartbeatSequence:
        context.heartbeatSequence,
    });
  }

  private acknowledgeInternal(
    record: MutableHeartbeatRecord,
    sequence: number,
    acknowledgedAt: number,
  ): void {
    if (
      record.lastHeartbeatSentAt !== undefined &&
      acknowledgedAt < record.lastHeartbeatSentAt
    ) {
      throw new HeartbeatMonitorError(
        "INVALID_ACKNOWLEDGEMENT_TIMESTAMP",
        `Heartbeat acknowledgement timestamp ${acknowledgedAt} is earlier than heartbeat send timestamp ${record.lastHeartbeatSentAt}.`,
        {
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    record.outstandingHeartbeatSequence = undefined;
    record.lastHeartbeatAcknowledgedAt =
      acknowledgedAt;
    record.lastActivityAt = Math.max(
      record.lastActivityAt,
      acknowledgedAt,
    );
    record.lastChangedAt = acknowledgedAt;
    record.acknowledgedHeartbeatCount += 1;
    record.consecutiveFailureCount = 0;

    this.changeHealth(
      record,
      "HEALTHY",
      acknowledgedAt,
      "Heartbeat acknowledged.",
    );

    this.emit({
      type: "HEARTBEAT_ACKNOWLEDGED",
      record,
      occurredAt: acknowledgedAt,
      heartbeatSequence: sequence,
    });
  }

  private shouldSendHeartbeat(
    record: MutableHeartbeatRecord,
    timestamp: number,
  ): boolean {
    if (
      record.outstandingHeartbeatSequence !==
      undefined
    ) {
      return false;
    }

    const referenceTimestamp =
      record.lastHeartbeatSentAt ??
      record.registeredAt;

    return (
      timestamp - referenceTimestamp >=
      record.configuration.heartbeatIntervalMs
    );
  }

  private hasHeartbeatTimedOut(
    record: MutableHeartbeatRecord,
    timestamp: number,
  ): boolean {
    return (
      record.outstandingHeartbeatSequence !==
        undefined &&
      record.lastHeartbeatSentAt !== undefined &&
      timestamp - record.lastHeartbeatSentAt >=
        record.configuration.heartbeatTimeoutMs
    );
  }

  private hasInactivityTimedOut(
    record: MutableHeartbeatRecord,
    timestamp: number,
  ): boolean {
    return (
      record.configuration.inactivityTimeoutMs > 0 &&
      timestamp - record.lastActivityAt >=
        record.configuration.inactivityTimeoutMs
    );
  }

  private handleHeartbeatTimeout(
    record: MutableHeartbeatRecord,
    occurredAt: number,
  ): void {
    const sequence =
      record.outstandingHeartbeatSequence;

    record.outstandingHeartbeatSequence = undefined;
    record.failedHeartbeatCount += 1;
    record.consecutiveFailureCount += 1;
    record.lastChangedAt = occurredAt;

    this.updateHealthAfterFailure(
      record,
      occurredAt,
      "Heartbeat acknowledgement timed out.",
    );

    this.emit({
      type: "HEARTBEAT_TIMEOUT",
      record,
      occurredAt,
      heartbeatSequence: sequence,
      reason:
        "Heartbeat acknowledgement timed out.",
    });
  }

  private handleInactivityTimeout(
    record: MutableHeartbeatRecord,
    occurredAt: number,
  ): void {
    record.consecutiveFailureCount += 1;
    record.lastChangedAt = occurredAt;

    this.updateHealthAfterFailure(
      record,
      occurredAt,
      "Connection exceeded inbound inactivity timeout.",
    );

    this.emit({
      type: "INACTIVITY_TIMEOUT",
      record,
      occurredAt,
      reason:
        "Connection exceeded inbound inactivity timeout.",
    });
  }

  private updateHealthAfterFailure(
    record: MutableHeartbeatRecord,
    occurredAt: number,
    reason: string,
  ): void {
    const nextHealth: HeartbeatHealthStatus =
      record.consecutiveFailureCount >=
      record.configuration.unhealthyFailureThreshold
        ? "UNHEALTHY"
        : "DEGRADED";

    this.changeHealth(
      record,
      nextHealth,
      occurredAt,
      reason,
    );
  }

  private reconcileDisconnectedState(
    record: MutableHeartbeatRecord,
    state: WebSocketConnectionState,
    occurredAt: number,
  ): void {
    record.outstandingHeartbeatSequence = undefined;

    const nextHealth =
      state === "FAILED" || state === "DISPOSED"
        ? "UNHEALTHY"
        : "UNKNOWN";

    this.changeHealth(
      record,
      nextHealth,
      occurredAt,
      `Connection state is ${state}.`,
    );
  }

  private changeHealth(
    record: MutableHeartbeatRecord,
    nextHealth: HeartbeatHealthStatus,
    occurredAt: number,
    reason: string,
  ): void {
    const previousHealth = record.healthStatus;

    if (previousHealth === nextHealth) {
      return;
    }

    record.healthStatus = nextHealth;
    record.lastChangedAt = occurredAt;

    this.emit({
      type: "HEALTH_CHANGED",
      record,
      occurredAt,
      previousHealthStatus: previousHealth,
      reason,
    });
  }

  private emit(input: {
    readonly type: HeartbeatEventType;
    readonly record: MutableHeartbeatRecord;
    readonly occurredAt?: number;
    readonly heartbeatSequence?: number;
    readonly previousHealthStatus?: HeartbeatHealthStatus;
    readonly reason?: string;
    readonly error?: Error;
  }): void {
    const event: HeartbeatEvent = Object.freeze({
      eventId: this.nextEventId,
      type: input.type,
      connectionId: input.record.connectionId,
      exchangeId: input.record.exchangeId,
      occurredAt: input.occurredAt ?? this.now(),
      healthStatus: input.record.healthStatus,
      heartbeatSequence:
        input.heartbeatSequence,
      previousHealthStatus:
        input.previousHealthStatus,
      reason: input.reason,
      error: input.error,
    });

    this.nextEventId += 1;

    const listeners = [...this.listeners];

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not interrupt heartbeat supervision.
      }
    }
  }

  private getRequiredRecord(
    connectionId: WebSocketConnectionId,
  ): MutableHeartbeatRecord {
    const record = this.records.get(connectionId);

    if (record === undefined) {
      throw new HeartbeatMonitorError(
        "HEARTBEAT_CONNECTION_NOT_FOUND",
        `Connection "${connectionId}" is not registered with the heartbeat monitor.`,
        {
          connectionId,
        },
      );
    }

    return record;
  }

  private getOrderedRecords():
    MutableHeartbeatRecord[] {
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
      throw new HeartbeatMonitorError(
        "HEARTBEAT_MONITOR_DISPOSED",
        "The heartbeat monitor has been disposed.",
      );
    }
  }
}

function createConnectionSnapshot(
  record: MutableHeartbeatRecord,
): HeartbeatConnectionSnapshot {
  return Object.freeze({
    connectionId: record.connectionId,
    exchangeId: record.exchangeId,
    connectionState: record.connection.getState(),
    healthStatus: record.healthStatus,
    registeredAt: record.registeredAt,
    lastChangedAt: record.lastChangedAt,
    lastActivityAt: record.lastActivityAt,
    lastHeartbeatSentAt:
      record.lastHeartbeatSentAt,
    lastHeartbeatAcknowledgedAt:
      record.lastHeartbeatAcknowledgedAt,
    outstandingHeartbeatSequence:
      record.outstandingHeartbeatSequence,
    nextHeartbeatSequence:
      record.nextHeartbeatSequence,
    sentHeartbeatCount:
      record.sentHeartbeatCount,
    acknowledgedHeartbeatCount:
      record.acknowledgedHeartbeatCount,
    failedHeartbeatCount:
      record.failedHeartbeatCount,
    consecutiveFailureCount:
      record.consecutiveFailureCount,
    heartbeatIntervalMs:
      record.configuration.heartbeatIntervalMs,
    heartbeatTimeoutMs:
      record.configuration.heartbeatTimeoutMs,
    inactivityTimeoutMs:
      record.configuration.inactivityTimeoutMs,
    unhealthyFailureThreshold:
      record.configuration.unhealthyFailureThreshold,
    activityAcknowledgesHeartbeat:
      record.configuration
        .activityAcknowledgesHeartbeat ?? false,
    metadata: Object.freeze({
      ...record.metadata,
    }),
  });
}

function normalizeConfiguration(
  configuration: Partial<HeartbeatMonitorConfiguration>,
): HeartbeatMonitorConfiguration {
  const heartbeatIntervalMs =
    validatePositiveFiniteNumber(
      configuration.heartbeatIntervalMs ??
        DEFAULT_CONFIGURATION.heartbeatIntervalMs,
      "heartbeatIntervalMs",
    );

  const heartbeatTimeoutMs =
    validatePositiveFiniteNumber(
      configuration.heartbeatTimeoutMs ??
        DEFAULT_CONFIGURATION.heartbeatTimeoutMs,
      "heartbeatTimeoutMs",
    );

  const inactivityTimeoutMs =
    validateNonNegativeFiniteNumber(
      configuration.inactivityTimeoutMs ??
        DEFAULT_CONFIGURATION.inactivityTimeoutMs,
      "inactivityTimeoutMs",
    );

  const unhealthyFailureThreshold =
    validatePositiveSafeInteger(
      configuration.unhealthyFailureThreshold ??
        DEFAULT_CONFIGURATION
          .unhealthyFailureThreshold,
      "unhealthyFailureThreshold",
    );

  const activityAcknowledgesHeartbeat =
    configuration.activityAcknowledgesHeartbeat ??
    DEFAULT_CONFIGURATION
      .activityAcknowledgesHeartbeat ??
    false;

  if (
    typeof activityAcknowledgesHeartbeat !== "boolean"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_ACTIVITY_ACKNOWLEDGEMENT",
      "activityAcknowledgesHeartbeat must be boolean.",
    );
  }

  return Object.freeze({
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    inactivityTimeoutMs,
    unhealthyFailureThreshold,
    activityAcknowledgesHeartbeat,
  });
}

function validateRegistration(
  registration: HeartbeatConnectionRegistration,
): void {
  if (
    registration === null ||
    typeof registration !== "object"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_REGISTRATION",
      "Heartbeat connection registration must be an object.",
    );
  }

  validateManagedConnection(registration.connection);

  if (
    registration.configuration !== undefined &&
    (registration.configuration === null ||
      typeof registration.configuration !== "object" ||
      Array.isArray(registration.configuration))
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_CONFIGURATION",
      "Heartbeat configuration must be an object when provided.",
    );
  }

  validateOptionalRecord(
    registration.metadata,
    "registration.metadata",
  );
}

function validateManagedConnection(
  connection: ManagedWebSocketConnection,
): void {
  if (
    connection === null ||
    typeof connection !== "object" ||
    connection.descriptor === undefined ||
    typeof connection.getState !== "function" ||
    typeof connection.send !== "function"
  ) {
    throw new HeartbeatMonitorError(
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

function validateActivity(
  activity: HeartbeatActivity,
): void {
  if (
    activity === null ||
    typeof activity !== "object"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_ACTIVITY",
      "Heartbeat activity must be an object.",
    );
  }

  normalizeConnectionId(activity.connectionId);

  if (activity.occurredAt !== undefined) {
    validateTimestamp(
      activity.occurredAt,
      "activity.occurredAt",
    );
  }

  if (
    activity.messageKind !== undefined &&
    !VALID_MESSAGE_KINDS.includes(
      activity.messageKind,
    )
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_ACTIVITY_MESSAGE_KIND",
      `Unsupported message kind "${String(
        activity.messageKind,
      )}".`,
    );
  }

  validateOptionalRecord(
    activity.metadata,
    "activity.metadata",
  );
}

function validateAcknowledgement(
  acknowledgement: HeartbeatAcknowledgement,
): void {
  if (
    acknowledgement === null ||
    typeof acknowledgement !== "object"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_ACKNOWLEDGEMENT",
      "Heartbeat acknowledgement must be an object.",
    );
  }

  normalizeConnectionId(
    acknowledgement.connectionId,
  );

  if (
    acknowledgement.heartbeatSequence !== undefined &&
    (!Number.isSafeInteger(
      acknowledgement.heartbeatSequence,
    ) ||
      acknowledgement.heartbeatSequence < 1)
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_SEQUENCE",
      "Heartbeat sequence must be a positive safe integer.",
    );
  }

  if (
    acknowledgement.acknowledgedAt !== undefined
  ) {
    validateTimestamp(
      acknowledgement.acknowledgedAt,
      "acknowledgement.acknowledgedAt",
    );
  }

  validateOptionalRecord(
    acknowledgement.metadata,
    "acknowledgement.metadata",
  );
}

function validateHeartbeatMessage(
  message: WebSocketOutboundMessage,
): void {
  if (
    message === null ||
    typeof message !== "object"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_MESSAGE",
      "Heartbeat sender must return a WebSocket outbound message.",
    );
  }

  if (!VALID_MESSAGE_KINDS.includes(message.kind)) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_MESSAGE_KIND",
      `Unsupported heartbeat message kind "${String(
        message.kind,
      )}".`,
    );
  }

  if (
    message.channel !== undefined &&
    (typeof message.channel !== "string" ||
      message.channel.trim().length === 0)
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_CHANNEL",
      "Heartbeat message channel must be a non-empty string when provided.",
    );
  }
}

function validateSender(
  sender: HeartbeatSender,
): HeartbeatSender {
  if (
    sender === null ||
    typeof sender !== "object" ||
    typeof sender.createHeartbeatMessage !== "function"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_SENDER",
      "Heartbeat sender must implement createHeartbeatMessage().",
    );
  }

  if (
    sender.sendHeartbeat !== undefined &&
    typeof sender.sendHeartbeat !== "function"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_HEARTBEAT_SEND_METHOD",
      "sendHeartbeat must be a function when provided.",
    );
  }

  return sender;
}

function validateClock(
  clock: HeartbeatMonitorClock,
): HeartbeatMonitorClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_CLOCK",
      "Heartbeat monitor clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function deriveInitialHealth(
  state: WebSocketConnectionState,
): HeartbeatHealthStatus {
  switch (state) {
    case "CONNECTED":
      return "HEALTHY";

    case "FAILED":
    case "DISPOSED":
      return "UNHEALTHY";

    case "REGISTERED":
    case "CONNECTING":
    case "DISCONNECTING":
    case "DISCONNECTED":
    case "RECONNECTING":
      return "UNKNOWN";

    default:
      return assertNever(state);
  }
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
    throw new HeartbeatMonitorError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function validatePositiveFiniteNumber(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_POSITIVE_NUMBER",
      `${field} must be a positive finite number.`,
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
    throw new HeartbeatMonitorError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
}

function validatePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new HeartbeatMonitorError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
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
    throw new HeartbeatMonitorError(
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
      "Unknown heartbeat monitor error.",
    );
  }
}

function assertNever(value: never): never {
  throw new HeartbeatMonitorError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}