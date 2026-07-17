/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 1:
 * Multi-Exchange WebSocket Manager
 *
 * This module provides the top-level orchestration layer for exchange
 * WebSocket connections. It intentionally depends on abstract WebSocket
 * connection contracts rather than exchange-specific implementations.
 *
 * Responsibilities:
 * - Register and unregister exchange WebSocket connections
 * - Coordinate connection lifecycle operations
 * - Maintain deterministic connection state
 * - Prevent duplicate lifecycle operations
 * - Route normalized connection events to listeners
 * - Produce immutable health and state snapshots
 * - Isolate failures between exchanges
 * - Support deterministic testing through injected clocks
 */

export type WebSocketExchangeId = string;
export type WebSocketConnectionId = string;

export type WebSocketConnectionState =
  | "REGISTERED"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTING"
  | "DISCONNECTED"
  | "RECONNECTING"
  | "FAILED"
  | "DISPOSED";

export type WebSocketManagerEventType =
  | "CONNECTION_REGISTERED"
  | "CONNECTION_UNREGISTERED"
  | "CONNECTION_CONNECTING"
  | "CONNECTION_CONNECTED"
  | "CONNECTION_DISCONNECTING"
  | "CONNECTION_DISCONNECTED"
  | "CONNECTION_RECONNECTING"
  | "CONNECTION_FAILED"
  | "CONNECTION_DISPOSED"
  | "MESSAGE_RECEIVED"
  | "ERROR_RECEIVED";

export type WebSocketMessageKind =
  | "TEXT"
  | "BINARY"
  | "JSON"
  | "PING"
  | "PONG"
  | "UNKNOWN";

export interface WebSocketManagerClock {
  now(): number;
}

export interface WebSocketConnectionDescriptor {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly endpoint: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WebSocketInboundMessage {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly kind: WebSocketMessageKind;
  readonly payload: unknown;
  readonly receivedAt: number;
  readonly sequence?: number;
  readonly channel?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WebSocketOutboundMessage {
  readonly kind: WebSocketMessageKind;
  readonly payload: unknown;
  readonly channel?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WebSocketConnectionError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: number;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WebSocketConnectionEventHandlers {
  readonly onOpen?: () => void;
  readonly onClose?: (reason?: string) => void;
  readonly onMessage?: (message: WebSocketInboundMessage) => void;
  readonly onError?: (error: WebSocketConnectionError) => void;
  readonly onReconnecting?: (attempt: number) => void;
}

export interface ManagedWebSocketConnection {
  readonly descriptor: WebSocketConnectionDescriptor;

  getState(): WebSocketConnectionState;

  setEventHandlers(handlers: WebSocketConnectionEventHandlers): void;

  connect(): Promise<void>;

  disconnect(reason?: string): Promise<void>;

  send(message: WebSocketOutboundMessage): Promise<void>;

  dispose(): Promise<void>;
}

export interface WebSocketManagerEvent {
  readonly eventId: number;
  readonly type: WebSocketManagerEventType;
  readonly occurredAt: number;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly state: WebSocketConnectionState;
  readonly message?: WebSocketInboundMessage;
  readonly error?: WebSocketConnectionError;
  readonly reason?: string;
  readonly reconnectAttempt?: number;
}

export type WebSocketManagerEventListener = (
  event: WebSocketManagerEvent,
) => void;

export interface WebSocketConnectionSnapshot {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly endpoint: string;
  readonly label?: string;
  readonly state: WebSocketConnectionState;
  readonly registeredAt: number;
  readonly lastStateChangedAt: number;
  readonly connectedAt?: number;
  readonly disconnectedAt?: number;
  readonly lastMessageAt?: number;
  readonly lastErrorAt?: number;
  readonly reconnectAttempts: number;
  readonly receivedMessageCount: number;
  readonly sentMessageCount: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WebSocketManagerSnapshot {
  readonly generatedAt: number;
  readonly totalConnections: number;
  readonly connectedConnections: number;
  readonly connectingConnections: number;
  readonly disconnectedConnections: number;
  readonly failedConnections: number;
  readonly reconnectingConnections: number;
  readonly connections: readonly WebSocketConnectionSnapshot[];
}

export interface WebSocketBulkOperationFailure {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly error: Error;
}

export interface WebSocketBulkOperationResult {
  readonly successfulConnectionIds: readonly WebSocketConnectionId[];
  readonly failures: readonly WebSocketBulkOperationFailure[];
}

export interface WebSocketManagerOptions {
  /**
   * When enabled, registering a second connection with the same exchange ID
   * is rejected.
   *
   * Defaults to false because connection pooling may require multiple
   * physical connections for the same exchange.
   */
  readonly enforceSingleConnectionPerExchange?: boolean;

  /**
   * Determines whether listener exceptions should be rethrown.
   *
   * Defaults to false so one event consumer cannot interrupt the streaming
   * subsystem or prevent other listeners from receiving events.
   */
  readonly propagateListenerErrors?: boolean;
}

interface MutableConnectionRecord {
  readonly connection: ManagedWebSocketConnection;
  readonly registeredAt: number;

  state: WebSocketConnectionState;
  lastStateChangedAt: number;
  connectedAt?: number;
  disconnectedAt?: number;
  lastMessageAt?: number;
  lastErrorAt?: number;
  reconnectAttempts: number;
  receivedMessageCount: number;
  sentMessageCount: number;
}

const SYSTEM_CLOCK: WebSocketManagerClock = Object.freeze({
  now: (): number => Date.now(),
});

const EMPTY_METADATA: Readonly<Record<string, unknown>> = Object.freeze({});

const VALID_MESSAGE_KINDS: readonly WebSocketMessageKind[] = Object.freeze<
  WebSocketMessageKind[]
>(["TEXT", "BINARY", "JSON", "PING", "PONG", "UNKNOWN"]);

const ALLOWED_STATE_TRANSITIONS: Readonly<
  Record<
    WebSocketConnectionState,
    readonly WebSocketConnectionState[]
  >
> = Object.freeze({
  REGISTERED: Object.freeze<WebSocketConnectionState[]>([
    "CONNECTING",
    "DISCONNECTED",
    "DISPOSED",
  ]),

  CONNECTING: Object.freeze<WebSocketConnectionState[]>([
    "CONNECTED",
    "DISCONNECTING",
    "DISCONNECTED",
    "RECONNECTING",
    "FAILED",
    "DISPOSED",
  ]),

  CONNECTED: Object.freeze<WebSocketConnectionState[]>([
    "DISCONNECTING",
    "DISCONNECTED",
    "RECONNECTING",
    "FAILED",
    "DISPOSED",
  ]),

  DISCONNECTING: Object.freeze<WebSocketConnectionState[]>([
    "DISCONNECTED",
    "FAILED",
    "DISPOSED",
  ]),

  DISCONNECTED: Object.freeze<WebSocketConnectionState[]>([
    "CONNECTING",
    "RECONNECTING",
    "DISPOSED",
  ]),

  RECONNECTING: Object.freeze<WebSocketConnectionState[]>([
    "CONNECTING",
    "CONNECTED",
    "DISCONNECTING",
    "DISCONNECTED",
    "FAILED",
    "DISPOSED",
  ]),

  FAILED: Object.freeze<WebSocketConnectionState[]>([
    "CONNECTING",
    "DISCONNECTING",
    "DISCONNECTED",
    "RECONNECTING",
    "DISPOSED",
  ]),

  DISPOSED: Object.freeze<WebSocketConnectionState[]>([]),
});

/**
 * Error thrown when an invalid WebSocket manager operation is attempted.
 */
export class WebSocketManagerError extends Error {
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

    this.name = "WebSocketManagerError";
    this.code = code;
    this.connectionId = context?.connectionId;
    this.exchangeId = context?.exchangeId;
  }
}

/**
 * Coordinates all exchange WebSocket connections known to the streaming
 * subsystem.
 *
 * The manager behaves deterministically when supplied with a deterministic
 * clock. Event identifiers are generated by a local monotonic sequence
 * instead of random values or timestamps.
 */
export class WebSocketManager {
  private readonly connections =
    new Map<WebSocketConnectionId, MutableConnectionRecord>();

  private readonly listeners = new Set<WebSocketManagerEventListener>();

  private readonly activeOperations =
    new Map<WebSocketConnectionId, Promise<void>>();

  private readonly clock: WebSocketManagerClock;

  private readonly enforceSingleConnectionPerExchange: boolean;

  private readonly propagateListenerErrors: boolean;

  private nextEventId = 1;

  private disposed = false;

  public constructor(
    options: WebSocketManagerOptions = {},
    clock: WebSocketManagerClock = SYSTEM_CLOCK,
  ) {
    this.clock = validateClock(clock);

    this.enforceSingleConnectionPerExchange =
      options.enforceSingleConnectionPerExchange ?? false;

    this.propagateListenerErrors =
      options.propagateListenerErrors ?? false;
  }

  /**
   * Registers a WebSocket connection without opening it.
   */
  public register(connection: ManagedWebSocketConnection): void {
    this.assertManagerActive();

    validateManagedConnection(connection);

    const descriptor = connection.descriptor;
    const connectionId = descriptor.connectionId;
    const exchangeId = descriptor.exchangeId;

    if (this.connections.has(connectionId)) {
      throw new WebSocketManagerError(
        "DUPLICATE_CONNECTION_ID",
        `WebSocket connection "${connectionId}" is already registered.`,
        {
          connectionId,
          exchangeId,
        },
      );
    }

    if (
      this.enforceSingleConnectionPerExchange &&
      this.hasExchange(exchangeId)
    ) {
      throw new WebSocketManagerError(
        "DUPLICATE_EXCHANGE_CONNECTION",
        `Exchange "${exchangeId}" already has a registered WebSocket connection.`,
        {
          connectionId,
          exchangeId,
        },
      );
    }

    const timestamp = this.getCurrentTimestamp();

    const record: MutableConnectionRecord = {
      connection,
      registeredAt: timestamp,
      state: "REGISTERED",
      lastStateChangedAt: timestamp,
      reconnectAttempts: 0,
      receivedMessageCount: 0,
      sentMessageCount: 0,
    };

    connection.setEventHandlers(
      this.createConnectionEventHandlers(connectionId),
    );

    this.connections.set(connectionId, record);

    this.emit({
      type: "CONNECTION_REGISTERED",
      record,
    });
  }

  /**
   * Removes a connection from the manager.
   *
   * Active connections must be disconnected first unless force is enabled.
   */
  public async unregister(
    connectionId: WebSocketConnectionId,
    options: {
      readonly force?: boolean;
      readonly dispose?: boolean;
      readonly reason?: string;
    } = {},
  ): Promise<void> {
    this.assertManagerActive();

    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    const record = this.getRequiredRecord(normalizedConnectionId);

    const force = options.force ?? false;
    const shouldDispose = options.dispose ?? false;

    if (
      this.activeOperations.has(normalizedConnectionId) &&
      !force
    ) {
      throw new WebSocketManagerError(
        "CONNECTION_OPERATION_IN_PROGRESS",
        `Connection "${normalizedConnectionId}" has an active lifecycle operation.`,
        {
          connectionId: normalizedConnectionId,
          exchangeId: record.connection.descriptor.exchangeId,
        },
      );
    }

    if (requiresDisconnection(record.state)) {
      if (!force) {
        throw new WebSocketManagerError(
          "CONNECTION_STILL_ACTIVE",
          `Connection "${normalizedConnectionId}" must be disconnected before it can be unregistered.`,
          {
            connectionId: normalizedConnectionId,
            exchangeId: record.connection.descriptor.exchangeId,
          },
        );
      }

      await this.disconnect(
        normalizedConnectionId,
        options.reason ?? "Forced connection unregistration.",
      );
    }

    if (shouldDispose && record.state !== "DISPOSED") {
      await record.connection.dispose();

      this.transitionState(record, "DISPOSED");

      this.emit({
        type: "CONNECTION_DISPOSED",
        record,
        reason: options.reason,
      });
    }

    record.connection.setEventHandlers({});

    this.connections.delete(normalizedConnectionId);
    this.activeOperations.delete(normalizedConnectionId);

    this.emit({
      type: "CONNECTION_UNREGISTERED",
      record,
      reason: options.reason,
    });
  }

  /**
   * Connects a registered WebSocket connection.
   *
   * Concurrent connect requests for the same connection share the active
   * lifecycle operation.
   */
  public connect(
    connectionId: WebSocketConnectionId,
  ): Promise<void> {
    this.assertManagerActive();

    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    const existingOperation =
      this.activeOperations.get(normalizedConnectionId);

    if (existingOperation !== undefined) {
      return existingOperation;
    }

    const record = this.getRequiredRecord(normalizedConnectionId);

    if (record.state === "CONNECTED") {
      return Promise.resolve();
    }

    if (record.state === "DISPOSED") {
      return Promise.reject(
        new WebSocketManagerError(
          "CONNECTION_DISPOSED",
          `Connection "${normalizedConnectionId}" has been disposed.`,
          {
            connectionId: normalizedConnectionId,
            exchangeId: record.connection.descriptor.exchangeId,
          },
        ),
      );
    }

    if (record.state === "DISCONNECTING") {
      return Promise.reject(
        new WebSocketManagerError(
          "CONNECTION_DISCONNECTING",
          `Connection "${normalizedConnectionId}" is currently disconnecting.`,
          {
            connectionId: normalizedConnectionId,
            exchangeId: record.connection.descriptor.exchangeId,
          },
        ),
      );
    }

    const operation = this.performConnect(record).finally(() => {
      this.activeOperations.delete(normalizedConnectionId);
    });

    this.activeOperations.set(normalizedConnectionId, operation);

    return operation;
  }

  /**
   * Disconnects a registered WebSocket connection.
   */
  public disconnect(
    connectionId: WebSocketConnectionId,
    reason = "WebSocket manager disconnect request.",
  ): Promise<void> {
    this.assertManagerActive();

    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    const normalizedReason = validateReason(reason);

    const existingOperation =
      this.activeOperations.get(normalizedConnectionId);

    if (existingOperation !== undefined) {
      return existingOperation.then(() =>
        this.disconnect(normalizedConnectionId, normalizedReason),
      );
    }

    const record = this.getRequiredRecord(normalizedConnectionId);

    if (
      record.state === "DISCONNECTED" ||
      record.state === "REGISTERED"
    ) {
      if (record.state === "REGISTERED") {
        this.transitionState(record, "DISCONNECTED");
      }

      return Promise.resolve();
    }

    if (record.state === "DISPOSED") {
      return Promise.resolve();
    }

    const operation = this.performDisconnect(
      record,
      normalizedReason,
    ).finally(() => {
      this.activeOperations.delete(normalizedConnectionId);
    });

    this.activeOperations.set(normalizedConnectionId, operation);

    return operation;
  }

  /**
   * Connects all registered connections in deterministic registration order.
   *
   * Failure on one exchange does not prevent the remaining exchanges from
   * being attempted.
   */
  public async connectAll(): Promise<WebSocketBulkOperationResult> {
    this.assertManagerActive();

    const successfulConnectionIds: WebSocketConnectionId[] = [];
    const failures: WebSocketBulkOperationFailure[] = [];

    for (const record of this.getOrderedRecords()) {
      const descriptor = record.connection.descriptor;

      try {
        await this.connect(descriptor.connectionId);

        successfulConnectionIds.push(descriptor.connectionId);
      } catch (error: unknown) {
        failures.push({
          connectionId: descriptor.connectionId,
          exchangeId: descriptor.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    return freezeBulkResult(successfulConnectionIds, failures);
  }

  /**
   * Disconnects all registered connections in deterministic reverse
   * registration order.
   */
  public async disconnectAll(
    reason = "WebSocket manager bulk disconnect request.",
  ): Promise<WebSocketBulkOperationResult> {
    this.assertManagerActive();

    const normalizedReason = validateReason(reason);
    const successfulConnectionIds: WebSocketConnectionId[] = [];
    const failures: WebSocketBulkOperationFailure[] = [];

    const records = this.getOrderedRecords().reverse();

    for (const record of records) {
      const descriptor = record.connection.descriptor;

      try {
        await this.disconnect(
          descriptor.connectionId,
          normalizedReason,
        );

        successfulConnectionIds.push(descriptor.connectionId);
      } catch (error: unknown) {
        failures.push({
          connectionId: descriptor.connectionId,
          exchangeId: descriptor.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    return freezeBulkResult(successfulConnectionIds, failures);
  }

  /**
   * Sends a message through a managed connection.
   */
  public async send(
    connectionId: WebSocketConnectionId,
    message: WebSocketOutboundMessage,
  ): Promise<void> {
    this.assertManagerActive();

    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    validateOutboundMessage(message);

    const record = this.getRequiredRecord(normalizedConnectionId);

    if (record.state !== "CONNECTED") {
      throw new WebSocketManagerError(
        "CONNECTION_NOT_CONNECTED",
        `Cannot send through connection "${normalizedConnectionId}" because its state is "${record.state}".`,
        {
          connectionId: normalizedConnectionId,
          exchangeId: record.connection.descriptor.exchangeId,
        },
      );
    }

    try {
      await record.connection.send(message);

      record.sentMessageCount += 1;
    } catch (error: unknown) {
      const normalizedError = this.createConnectionError(
        "WEBSOCKET_SEND_FAILED",
        `Failed to send a WebSocket message through connection "${normalizedConnectionId}".`,
        true,
        error,
      );

      this.handleConnectionError(record, normalizedError);

      throw new WebSocketManagerError(
        normalizedError.code,
        normalizedError.message,
        {
          connectionId: normalizedConnectionId,
          exchangeId: record.connection.descriptor.exchangeId,
          cause: error,
        },
      );
    }
  }

  /**
   * Registers a manager event listener.
   *
   * Returns an idempotent unsubscribe function.
   */
  public subscribe(
    listener: WebSocketManagerEventListener,
  ): () => void {
    this.assertManagerActive();

    if (typeof listener !== "function") {
      throw new WebSocketManagerError(
        "INVALID_EVENT_LISTENER",
        "WebSocket manager event listener must be a function.",
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

  public has(connectionId: WebSocketConnectionId): boolean {
    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    return this.connections.has(normalizedConnectionId);
  }

  public hasExchange(exchangeId: WebSocketExchangeId): boolean {
    const normalizedExchangeId = validateRequiredIdentifier(
      exchangeId,
      "exchangeId",
    );

    for (const record of this.connections.values()) {
      if (
        record.connection.descriptor.exchangeId ===
        normalizedExchangeId
      ) {
        return true;
      }
    }

    return false;
  }

  public getConnection(
    connectionId: WebSocketConnectionId,
  ): ManagedWebSocketConnection | undefined {
    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    return this.connections.get(normalizedConnectionId)?.connection;
  }

  public getConnectionsForExchange(
    exchangeId: WebSocketExchangeId,
  ): readonly ManagedWebSocketConnection[] {
    const normalizedExchangeId = validateRequiredIdentifier(
      exchangeId,
      "exchangeId",
    );

    const matchingConnections = this.getOrderedRecords()
      .filter(
        (record) =>
          record.connection.descriptor.exchangeId ===
          normalizedExchangeId,
      )
      .map((record) => record.connection);

    return Object.freeze(matchingConnections);
  }

  public getConnectionSnapshot(
    connectionId: WebSocketConnectionId,
  ): WebSocketConnectionSnapshot {
    const normalizedConnectionId = validateRequiredIdentifier(
      connectionId,
      "connectionId",
    );

    return createConnectionSnapshot(
      this.getRequiredRecord(normalizedConnectionId),
    );
  }

  public getSnapshot(): WebSocketManagerSnapshot {
    const connections = this.getOrderedRecords().map((record) =>
      createConnectionSnapshot(record),
    );

    let connectedConnections = 0;
    let connectingConnections = 0;
    let disconnectedConnections = 0;
    let failedConnections = 0;
    let reconnectingConnections = 0;

    for (const connection of connections) {
      switch (connection.state) {
        case "CONNECTED":
          connectedConnections += 1;
          break;

        case "CONNECTING":
          connectingConnections += 1;
          break;

        case "DISCONNECTED":
        case "REGISTERED":
        case "DISPOSED":
          disconnectedConnections += 1;
          break;

        case "FAILED":
          failedConnections += 1;
          break;

        case "RECONNECTING":
          reconnectingConnections += 1;
          break;

        case "DISCONNECTING":
          break;

        default:
          assertNever(connection.state);
      }
    }

    return Object.freeze({
      generatedAt: this.getCurrentTimestamp(),
      totalConnections: connections.length,
      connectedConnections,
      connectingConnections,
      disconnectedConnections,
      failedConnections,
      reconnectingConnections,
      connections: Object.freeze(connections),
    });
  }

  public get size(): number {
    return this.connections.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Permanently shuts down the manager.
   *
   * All connections are disconnected and disposed. The manager cannot be
   * reused after this operation.
   */
  public async dispose(
    reason = "WebSocket manager disposed.",
  ): Promise<WebSocketBulkOperationResult> {
    if (this.disposed) {
      return freezeBulkResult([], []);
    }

    const normalizedReason = validateReason(reason);

    const successfulConnectionIds: WebSocketConnectionId[] = [];
    const failures: WebSocketBulkOperationFailure[] = [];

    const records = this.getOrderedRecords().reverse();

    for (const record of records) {
      const descriptor = record.connection.descriptor;

      try {
        if (requiresDisconnection(record.state)) {
          await this.disconnect(
            descriptor.connectionId,
            normalizedReason,
          );
        }

        if (record.state !== "DISPOSED") {
          await record.connection.dispose();

          this.transitionState(record, "DISPOSED");

          this.emit({
            type: "CONNECTION_DISPOSED",
            record,
            reason: normalizedReason,
          });
        }

        record.connection.setEventHandlers({});

        successfulConnectionIds.push(descriptor.connectionId);
      } catch (error: unknown) {
        failures.push({
          connectionId: descriptor.connectionId,
          exchangeId: descriptor.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    this.connections.clear();
    this.activeOperations.clear();
    this.listeners.clear();

    this.disposed = true;

    return freezeBulkResult(successfulConnectionIds, failures);
  }

  private async performConnect(
    record: MutableConnectionRecord,
  ): Promise<void> {
    const descriptor = record.connection.descriptor;

    this.transitionState(record, "CONNECTING");

    this.emit({
      type: "CONNECTION_CONNECTING",
      record,
    });

    try {
      await record.connection.connect();

      /*
       * Some adapters synchronously emit onOpen during connect().
       * Avoid publishing duplicate connection events.
       */
      if (record.state !== "CONNECTED") {
        this.transitionState(record, "CONNECTED");

        this.emit({
          type: "CONNECTION_CONNECTED",
          record,
        });
      }
    } catch (error: unknown) {
      const normalizedError = this.createConnectionError(
        "WEBSOCKET_CONNECT_FAILED",
        `Failed to connect WebSocket connection "${descriptor.connectionId}".`,
        true,
        error,
      );

      this.handleConnectionError(record, normalizedError);

      throw new WebSocketManagerError(
        normalizedError.code,
        normalizedError.message,
        {
          connectionId: descriptor.connectionId,
          exchangeId: descriptor.exchangeId,
          cause: error,
        },
      );
    }
  }

  private async performDisconnect(
    record: MutableConnectionRecord,
    reason: string,
  ): Promise<void> {
    const descriptor = record.connection.descriptor;

    this.transitionState(record, "DISCONNECTING");

    this.emit({
      type: "CONNECTION_DISCONNECTING",
      record,
      reason,
    });

    try {
      await record.connection.disconnect(reason);

      /*
       * Some adapters synchronously emit onClose during disconnect().
       * Avoid publishing duplicate disconnection events.
       */
      if (record.state !== "DISCONNECTED") {
        this.transitionState(record, "DISCONNECTED");

        this.emit({
          type: "CONNECTION_DISCONNECTED",
          record,
          reason,
        });
      }
    } catch (error: unknown) {
      const normalizedError = this.createConnectionError(
        "WEBSOCKET_DISCONNECT_FAILED",
        `Failed to disconnect WebSocket connection "${descriptor.connectionId}".`,
        true,
        error,
      );

      this.handleConnectionError(record, normalizedError);

      throw new WebSocketManagerError(
        normalizedError.code,
        normalizedError.message,
        {
          connectionId: descriptor.connectionId,
          exchangeId: descriptor.exchangeId,
          cause: error,
        },
      );
    }
  }

  private createConnectionEventHandlers(
    connectionId: WebSocketConnectionId,
  ): WebSocketConnectionEventHandlers {
    return Object.freeze({
      onOpen: (): void => {
        const record = this.connections.get(connectionId);

        if (record === undefined || this.disposed) {
          return;
        }

        if (record.state === "CONNECTED") {
          return;
        }

        this.transitionState(record, "CONNECTED");

        this.emit({
          type: "CONNECTION_CONNECTED",
          record,
        });
      },

      onClose: (reason?: string): void => {
        const record = this.connections.get(connectionId);

        if (record === undefined || this.disposed) {
          return;
        }

        if (record.state === "DISCONNECTED") {
          return;
        }

        this.transitionState(record, "DISCONNECTED");

        this.emit({
          type: "CONNECTION_DISCONNECTED",
          record,
          reason,
        });
      },

      onMessage: (message: WebSocketInboundMessage): void => {
        const record = this.connections.get(connectionId);

        if (record === undefined || this.disposed) {
          return;
        }

        validateInboundMessage(
          message,
          record.connection.descriptor,
        );

        record.receivedMessageCount += 1;
        record.lastMessageAt = message.receivedAt;

        this.emit({
          type: "MESSAGE_RECEIVED",
          record,
          message: freezeInboundMessage(message),
        });
      },

      onError: (error: WebSocketConnectionError): void => {
        const record = this.connections.get(connectionId);

        if (record === undefined || this.disposed) {
          return;
        }

        validateConnectionError(error);

        this.handleConnectionError(record, error);
      },

      onReconnecting: (attempt: number): void => {
        const record = this.connections.get(connectionId);

        if (record === undefined || this.disposed) {
          return;
        }

        validateReconnectAttempt(attempt);

        record.reconnectAttempts = attempt;

        this.transitionState(record, "RECONNECTING");

        this.emit({
          type: "CONNECTION_RECONNECTING",
          record,
          reconnectAttempt: attempt,
        });
      },
    });
  }

  private handleConnectionError(
    record: MutableConnectionRecord,
    error: WebSocketConnectionError,
  ): void {
    record.lastErrorAt = error.occurredAt;

    if (
      record.state !== "DISCONNECTING" &&
      record.state !== "DISCONNECTED" &&
      record.state !== "DISPOSED"
    ) {
      this.transitionState(record, "FAILED");
    }

    const immutableError = freezeConnectionError(error);

    this.emit({
      type: "ERROR_RECEIVED",
      record,
      error: immutableError,
    });

    this.emit({
      type: "CONNECTION_FAILED",
      record,
      error: immutableError,
    });
  }

  private transitionState(
    record: MutableConnectionRecord,
    nextState: WebSocketConnectionState,
  ): void {
    assertValidStateTransition(record.state, nextState);

    if (record.state === nextState) {
      return;
    }

    const timestamp = this.getCurrentTimestamp();

    record.state = nextState;
    record.lastStateChangedAt = timestamp;

    if (nextState === "CONNECTED") {
      record.connectedAt = timestamp;
      record.disconnectedAt = undefined;
    }

    if (
      nextState === "DISCONNECTED" ||
      nextState === "DISPOSED"
    ) {
      record.disconnectedAt = timestamp;
    }
  }

  private emit(input: {
    readonly type: WebSocketManagerEventType;
    readonly record: MutableConnectionRecord;
    readonly message?: WebSocketInboundMessage;
    readonly error?: WebSocketConnectionError;
    readonly reason?: string;
    readonly reconnectAttempt?: number;
  }): void {
    const descriptor = input.record.connection.descriptor;

    const event: WebSocketManagerEvent = Object.freeze({
      eventId: this.nextEventId,
      type: input.type,
      occurredAt: this.getCurrentTimestamp(),
      connectionId: descriptor.connectionId,
      exchangeId: descriptor.exchangeId,
      state: input.record.state,
      message: input.message,
      error: input.error,
      reason: input.reason,
      reconnectAttempt: input.reconnectAttempt,
    });

    this.nextEventId += 1;

    /*
     * Snapshotting listeners prevents subscription changes during dispatch
     * from altering the current event delivery cycle.
     */
    const listenerSnapshot = [...this.listeners];

    for (const listener of listenerSnapshot) {
      try {
        listener(event);
      } catch (error: unknown) {
        if (this.propagateListenerErrors) {
          throw normalizeError(error);
        }
      }
    }
  }

  private createConnectionError(
    code: string,
    message: string,
    retryable: boolean,
    cause?: unknown,
  ): WebSocketConnectionError {
    return Object.freeze({
      code,
      message,
      occurredAt: this.getCurrentTimestamp(),
      retryable,
      cause,
    });
  }

  private getRequiredRecord(
    connectionId: WebSocketConnectionId,
  ): MutableConnectionRecord {
    const record = this.connections.get(connectionId);

    if (record === undefined) {
      throw new WebSocketManagerError(
        "CONNECTION_NOT_REGISTERED",
        `WebSocket connection "${connectionId}" is not registered.`,
        {
          connectionId,
        },
      );
    }

    return record;
  }

  private getOrderedRecords(): MutableConnectionRecord[] {
    return [...this.connections.values()].sort((left, right) => {
      if (left.registeredAt !== right.registeredAt) {
        return left.registeredAt - right.registeredAt;
      }

      return left.connection.descriptor.connectionId.localeCompare(
        right.connection.descriptor.connectionId,
      );
    });
  }

  private assertManagerActive(): void {
    if (this.disposed) {
      throw new WebSocketManagerError(
        "MANAGER_DISPOSED",
        "The WebSocket manager has been disposed and cannot be reused.",
      );
    }
  }

  private getCurrentTimestamp(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }
}

function validateClock(
  clock: WebSocketManagerClock,
): WebSocketManagerClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new WebSocketManagerError(
      "INVALID_CLOCK",
      "WebSocket manager clock must provide a now() function.",
    );
  }

  const initialValue = clock.now();

  validateTimestamp(initialValue, "clock.now()");

  return clock;
}

function validateManagedConnection(
  connection: ManagedWebSocketConnection,
): void {
  if (connection === null || typeof connection !== "object") {
    throw new WebSocketManagerError(
      "INVALID_CONNECTION",
      "Managed WebSocket connection must be an object.",
    );
  }

  validateDescriptor(connection.descriptor);

  const requiredMethods: readonly string[] = Object.freeze([
    "getState",
    "setEventHandlers",
    "connect",
    "disconnect",
    "send",
    "dispose",
  ]);

  const connectionRecord = connection as unknown as Record<
    string,
    unknown
  >;

  for (const methodName of requiredMethods) {
    if (typeof connectionRecord[methodName] !== "function") {
      throw new WebSocketManagerError(
        "INVALID_CONNECTION_CONTRACT",
        `Managed WebSocket connection must implement ${methodName}().`,
        {
          connectionId: connection.descriptor.connectionId,
          exchangeId: connection.descriptor.exchangeId,
        },
      );
    }
  }

  const initialState = connection.getState();

  if (!isWebSocketConnectionState(initialState)) {
    throw new WebSocketManagerError(
      "INVALID_INITIAL_CONNECTION_STATE",
      `Managed WebSocket connection returned unsupported state "${String(
        initialState,
      )}".`,
      {
        connectionId: connection.descriptor.connectionId,
        exchangeId: connection.descriptor.exchangeId,
      },
    );
  }

  if (initialState === "DISPOSED") {
    throw new WebSocketManagerError(
      "CONNECTION_ALREADY_DISPOSED",
      "A disposed WebSocket connection cannot be registered.",
      {
        connectionId: connection.descriptor.connectionId,
        exchangeId: connection.descriptor.exchangeId,
      },
    );
  }
}

function validateDescriptor(
  descriptor: WebSocketConnectionDescriptor,
): void {
  if (descriptor === null || typeof descriptor !== "object") {
    throw new WebSocketManagerError(
      "INVALID_CONNECTION_DESCRIPTOR",
      "WebSocket connection descriptor must be an object.",
    );
  }

  validateRequiredIdentifier(
    descriptor.connectionId,
    "descriptor.connectionId",
  );

  validateRequiredIdentifier(
    descriptor.exchangeId,
    "descriptor.exchangeId",
  );

  validateRequiredIdentifier(
    descriptor.endpoint,
    "descriptor.endpoint",
  );

  if (
    descriptor.label !== undefined &&
    (typeof descriptor.label !== "string" ||
      descriptor.label.trim().length === 0)
  ) {
    throw new WebSocketManagerError(
      "INVALID_CONNECTION_LABEL",
      "WebSocket connection label must be a non-empty string when provided.",
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }

  if (
    descriptor.metadata !== undefined &&
    (descriptor.metadata === null ||
      typeof descriptor.metadata !== "object" ||
      Array.isArray(descriptor.metadata))
  ) {
    throw new WebSocketManagerError(
      "INVALID_CONNECTION_METADATA",
      "WebSocket connection metadata must be an object when provided.",
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }
}

function validateOutboundMessage(
  message: WebSocketOutboundMessage,
): void {
  if (message === null || typeof message !== "object") {
    throw new WebSocketManagerError(
      "INVALID_OUTBOUND_MESSAGE",
      "Outbound WebSocket message must be an object.",
    );
  }

  validateMessageKind(message.kind);

  if (
    message.channel !== undefined &&
    (typeof message.channel !== "string" ||
      message.channel.trim().length === 0)
  ) {
    throw new WebSocketManagerError(
      "INVALID_OUTBOUND_CHANNEL",
      "Outbound WebSocket channel must be a non-empty string when provided.",
    );
  }

  validateOptionalMetadata(
    message.metadata,
    "Outbound WebSocket message metadata",
  );
}

function validateInboundMessage(
  message: WebSocketInboundMessage,
  descriptor: WebSocketConnectionDescriptor,
): void {
  if (message === null || typeof message !== "object") {
    throw new WebSocketManagerError(
      "INVALID_INBOUND_MESSAGE",
      "Inbound WebSocket message must be an object.",
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }

  if (message.connectionId !== descriptor.connectionId) {
    throw new WebSocketManagerError(
      "INBOUND_CONNECTION_ID_MISMATCH",
      `Inbound message connection ID "${message.connectionId}" does not match managed connection "${descriptor.connectionId}".`,
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }

  if (message.exchangeId !== descriptor.exchangeId) {
    throw new WebSocketManagerError(
      "INBOUND_EXCHANGE_ID_MISMATCH",
      `Inbound message exchange ID "${message.exchangeId}" does not match managed exchange "${descriptor.exchangeId}".`,
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }

  validateMessageKind(message.kind);
  validateTimestamp(message.receivedAt, "message.receivedAt");

  if (
    message.sequence !== undefined &&
    (!Number.isSafeInteger(message.sequence) || message.sequence < 0)
  ) {
    throw new WebSocketManagerError(
      "INVALID_MESSAGE_SEQUENCE",
      "Inbound WebSocket message sequence must be a non-negative safe integer.",
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }

  if (
    message.channel !== undefined &&
    (typeof message.channel !== "string" ||
      message.channel.trim().length === 0)
  ) {
    throw new WebSocketManagerError(
      "INVALID_INBOUND_CHANNEL",
      "Inbound WebSocket channel must be a non-empty string when provided.",
      {
        connectionId: descriptor.connectionId,
        exchangeId: descriptor.exchangeId,
      },
    );
  }

  validateOptionalMetadata(
    message.metadata,
    "Inbound WebSocket message metadata",
  );
}

function validateConnectionError(
  error: WebSocketConnectionError,
): void {
  if (error === null || typeof error !== "object") {
    throw new WebSocketManagerError(
      "INVALID_CONNECTION_ERROR",
      "WebSocket connection error must be an object.",
    );
  }

  validateRequiredIdentifier(error.code, "error.code");
  validateRequiredIdentifier(error.message, "error.message");
  validateTimestamp(error.occurredAt, "error.occurredAt");

  if (typeof error.retryable !== "boolean") {
    throw new WebSocketManagerError(
      "INVALID_CONNECTION_ERROR_RETRYABLE",
      "WebSocket connection error retryable property must be boolean.",
    );
  }

  validateOptionalMetadata(
    error.metadata,
    "WebSocket connection error metadata",
  );
}

function validateOptionalMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  fieldName: string,
): void {
  if (
    metadata !== undefined &&
    (metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata))
  ) {
    throw new WebSocketManagerError(
      "INVALID_METADATA",
      `${fieldName} must be an object when provided.`,
    );
  }
}

function validateMessageKind(kind: WebSocketMessageKind): void {
  if (!VALID_MESSAGE_KINDS.includes(kind)) {
    throw new WebSocketManagerError(
      "INVALID_MESSAGE_KIND",
      `Unsupported WebSocket message kind "${String(kind)}".`,
    );
  }
}

function validateReconnectAttempt(attempt: number): void {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new WebSocketManagerError(
      "INVALID_RECONNECT_ATTEMPT",
      "WebSocket reconnect attempt must be a positive safe integer.",
    );
  }
}

function validateTimestamp(
  timestamp: number,
  fieldName: string,
): void {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new WebSocketManagerError(
      "INVALID_TIMESTAMP",
      `${fieldName} must be a finite non-negative number.`,
    );
  }
}

function validateRequiredIdentifier(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WebSocketManagerError(
      "INVALID_IDENTIFIER",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function validateReason(reason: string): string {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new WebSocketManagerError(
      "INVALID_DISCONNECT_REASON",
      "WebSocket disconnect reason must be a non-empty string.",
    );
  }

  return reason.trim();
}

function createConnectionSnapshot(
  record: MutableConnectionRecord,
): WebSocketConnectionSnapshot {
  const descriptor = record.connection.descriptor;

  const metadata =
    descriptor.metadata === undefined
      ? EMPTY_METADATA
      : Object.freeze({ ...descriptor.metadata });

  return Object.freeze({
    connectionId: descriptor.connectionId,
    exchangeId: descriptor.exchangeId,
    endpoint: descriptor.endpoint,
    label: descriptor.label,
    state: record.state,
    registeredAt: record.registeredAt,
    lastStateChangedAt: record.lastStateChangedAt,
    connectedAt: record.connectedAt,
    disconnectedAt: record.disconnectedAt,
    lastMessageAt: record.lastMessageAt,
    lastErrorAt: record.lastErrorAt,
    reconnectAttempts: record.reconnectAttempts,
    receivedMessageCount: record.receivedMessageCount,
    sentMessageCount: record.sentMessageCount,
    metadata,
  });
}

function freezeInboundMessage(
  message: WebSocketInboundMessage,
): WebSocketInboundMessage {
  return Object.freeze({
    ...message,
    metadata:
      message.metadata === undefined
        ? undefined
        : Object.freeze({ ...message.metadata }),
  });
}

function freezeConnectionError(
  error: WebSocketConnectionError,
): WebSocketConnectionError {
  return Object.freeze({
    ...error,
    metadata:
      error.metadata === undefined
        ? undefined
        : Object.freeze({ ...error.metadata }),
  });
}

function freezeBulkResult(
  successfulConnectionIds: WebSocketConnectionId[],
  failures: WebSocketBulkOperationFailure[],
): WebSocketBulkOperationResult {
  return Object.freeze({
    successfulConnectionIds: Object.freeze([
      ...successfulConnectionIds,
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

function assertValidStateTransition(
  currentState: WebSocketConnectionState,
  nextState: WebSocketConnectionState,
): void {
  if (currentState === nextState) {
    return;
  }

  const permittedStates = ALLOWED_STATE_TRANSITIONS[currentState];

  if (!permittedStates.includes(nextState)) {
    throw new WebSocketManagerError(
      "INVALID_STATE_TRANSITION",
      `Invalid WebSocket connection state transition from "${currentState}" to "${nextState}".`,
    );
  }
}

function isWebSocketConnectionState(
  value: unknown,
): value is WebSocketConnectionState {
  return (
    value === "REGISTERED" ||
    value === "CONNECTING" ||
    value === "CONNECTED" ||
    value === "DISCONNECTING" ||
    value === "DISCONNECTED" ||
    value === "RECONNECTING" ||
    value === "FAILED" ||
    value === "DISPOSED"
  );
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
    return new Error("Unknown WebSocket manager error.");
  }
}

function assertNever(value: never): never {
  throw new WebSocketManagerError(
    "UNSUPPORTED_CONNECTION_STATE",
    `Unsupported WebSocket connection state "${String(value)}".`,
  );
}