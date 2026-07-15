/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Transport-independent WebSocket client contracts.
 *
 * This module defines immutable connection, message, subscription, lifecycle,
 * error, and metrics abstractions for live exchange streaming.
 *
 * Concrete implementations may use ws, native WebSocket, Undici, or another
 * transport library, while exchange connectors depend only on these contracts.
 */

import type { ExchangeConnectorOperationContext } from "../connectors/exchange-connector";
import type { ExchangeWebSocketEndpointType } from "../connectors/exchange-connector-config";

/**
 * Supported WebSocket message payloads.
 */
export type ExchangeWebSocketPayload =
  | string
  | Uint8Array
  | Readonly<Record<string, unknown>>
  | readonly unknown[]
  | null;

/**
 * WebSocket message encoding.
 */
export type ExchangeWebSocketMessageEncoding =
  | "JSON"
  | "TEXT"
  | "BINARY";

/**
 * WebSocket message direction.
 */
export type ExchangeWebSocketMessageDirection =
  | "INBOUND"
  | "OUTBOUND";

/**
 * Logical WebSocket message categories.
 */
export type ExchangeWebSocketMessageType =
  | "DATA"
  | "SUBSCRIBE"
  | "UNSUBSCRIBE"
  | "AUTHENTICATE"
  | "PING"
  | "PONG"
  | "ACKNOWLEDGEMENT"
  | "ERROR"
  | "SYSTEM"
  | "UNKNOWN";

/**
 * WebSocket connection lifecycle states.
 */
export type ExchangeWebSocketClientState =
  | "CREATED"
  | "CONNECTING"
  | "CONNECTED"
  | "AUTHENTICATING"
  | "READY"
  | "RECONNECTING"
  | "DISCONNECTING"
  | "DISCONNECTED"
  | "FAILED"
  | "DESTROYED";

/**
 * WebSocket subscription lifecycle states.
 */
export type ExchangeWebSocketSubscriptionState =
  | "PENDING"
  | "ACTIVE"
  | "UNSUBSCRIBING"
  | "INACTIVE"
  | "FAILED";

/**
 * WebSocket disconnect reasons.
 */
export type ExchangeWebSocketDisconnectReason =
  | "REQUESTED"
  | "REMOTE_CLOSE"
  | "NETWORK_FAILURE"
  | "AUTHENTICATION_FAILURE"
  | "HEARTBEAT_TIMEOUT"
  | "PROTOCOL_ERROR"
  | "RECONNECT_EXHAUSTED"
  | "CLIENT_DESTROYED"
  | "UNKNOWN";

/**
 * Immutable connection request.
 */
export interface ExchangeWebSocketConnectRequest {
  /**
   * Unique deterministic connection identifier.
   */
  readonly connectionId: string;

  /**
   * Endpoint category used to select the configured WebSocket URL.
   */
  readonly endpointType: ExchangeWebSocketEndpointType;

  /**
   * Whether authenticated exchange channels are required.
   */
  readonly authenticated: boolean;

  /**
   * Optional timeout override.
   */
  readonly timeoutMs?: number;

  /**
   * Shared operation context.
   */
  readonly context: ExchangeConnectorOperationContext;
}

/**
 * Immutable WebSocket state snapshot.
 */
export interface ExchangeWebSocketClientStateSnapshot {
  readonly connectionId?: string;
  readonly state: ExchangeWebSocketClientState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Immutable incoming or outgoing WebSocket message.
 */
export interface ExchangeWebSocketMessage<
  TPayload extends ExchangeWebSocketPayload = ExchangeWebSocketPayload,
> {
  /**
   * Unique deterministic message identifier.
   */
  readonly messageId: string;

  /**
   * Active connection identifier.
   */
  readonly connectionId: string;

  readonly direction: ExchangeWebSocketMessageDirection;
  readonly type: ExchangeWebSocketMessageType;
  readonly encoding: ExchangeWebSocketMessageEncoding;

  /**
   * Deterministic message timestamp supplied by an injected clock.
   */
  readonly timestamp: number;

  readonly payload: TPayload;

  /**
   * Optional exchange channel name.
   */
  readonly channel?: string;

  /**
   * Optional market symbol.
   */
  readonly symbol?: string;

  /**
   * Optional exchange-generated request identifier.
   */
  readonly exchangeRequestId?: string;

  /**
   * Optional correlation identifier linking request and acknowledgement
   * messages.
   */
  readonly correlationId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Request to send a WebSocket message.
 */
export interface ExchangeWebSocketSendRequest<
  TPayload extends ExchangeWebSocketPayload = ExchangeWebSocketPayload,
> {
  readonly messageId: string;
  readonly type: ExchangeWebSocketMessageType;
  readonly encoding: ExchangeWebSocketMessageEncoding;
  readonly payload: TPayload;

  readonly channel?: string;
  readonly symbol?: string;
  readonly correlationId?: string;

  readonly timeoutMs?: number;
  readonly context: ExchangeConnectorOperationContext;
}

/**
 * Result returned after a WebSocket message has been accepted for sending.
 */
export interface ExchangeWebSocketSendResult {
  readonly messageId: string;
  readonly connectionId: string;
  readonly accepted: boolean;
  readonly sentAt: number;
  readonly bufferedAmount: number;
}

/**
 * Immutable subscription request.
 */
export interface ExchangeWebSocketSubscriptionRequest {
  /**
   * Unique deterministic subscription identifier.
   */
  readonly subscriptionId: string;

  /**
   * Exchange channel or topic.
   *
   * Examples:
   * - tickers
   * - orderbook
   * - trades
   * - candles
   * - orders
   */
  readonly channel: string;

  /**
   * Optional instrument symbols.
   */
  readonly symbols?: readonly string[];

  /**
   * Optional exchange-specific parameters.
   */
  readonly parameters?: Readonly<Record<string, unknown>>;

  /**
   * Whether this subscription requires authenticated transport access.
   */
  readonly authenticated: boolean;

  readonly context: ExchangeConnectorOperationContext;
}

/**
 * Immutable subscription snapshot.
 */
export interface ExchangeWebSocketSubscriptionSnapshot {
  readonly subscriptionId: string;
  readonly channel: string;
  readonly symbols: readonly string[];
  readonly state: ExchangeWebSocketSubscriptionState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Subscription operation result.
 */
export interface ExchangeWebSocketSubscriptionResult {
  readonly subscriptionId: string;
  readonly previousState: ExchangeWebSocketSubscriptionState;
  readonly currentState: ExchangeWebSocketSubscriptionState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * WebSocket heartbeat snapshot.
 */
export interface ExchangeWebSocketHeartbeatSnapshot {
  readonly enabled: boolean;

  readonly lastPingSentAt?: number;
  readonly lastPongReceivedAt?: number;

  readonly awaitingPong: boolean;
  readonly missedHeartbeatCount: number;

  /**
   * Most recently observed heartbeat round-trip time.
   */
  readonly lastRoundTripTimeMs?: number;
}

/**
 * Reconnection state snapshot.
 */
export interface ExchangeWebSocketReconnectSnapshot {
  readonly enabled: boolean;
  readonly reconnecting: boolean;
  readonly attemptCount: number;
  readonly maximumAttempts: number;

  readonly lastAttemptAt?: number;
  readonly nextAttemptAt?: number;
  readonly lastSuccessfulConnectionAt?: number;

  readonly exhausted: boolean;
}

/**
 * WebSocket metrics snapshot.
 */
export interface ExchangeWebSocketClientMetrics {
  readonly capturedAt: number;

  readonly totalConnections: number;
  readonly successfulConnections: number;
  readonly failedConnections: number;
  readonly reconnectionAttempts: number;

  readonly totalMessagesReceived: number;
  readonly totalMessagesSent: number;
  readonly failedMessages: number;
  readonly droppedMessages: number;

  readonly totalSubscriptions: number;
  readonly activeSubscriptions: number;
  readonly failedSubscriptions: number;

  readonly heartbeatTimeouts: number;
  readonly protocolErrors: number;

  readonly bufferedMessageCount: number;
  readonly bufferedAmount: number;

  readonly connectedAt?: number;
  readonly disconnectedAt?: number;
  readonly lastMessageReceivedAt?: number;
  readonly lastMessageSentAt?: number;
  readonly lastFailureAt?: number;
}

/**
 * WebSocket error categories.
 */
export type ExchangeWebSocketErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "CONNECTION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NETWORK"
  | "TIMEOUT"
  | "HEARTBEAT"
  | "PROTOCOL"
  | "SERIALIZATION"
  | "DESERIALIZATION"
  | "SUBSCRIPTION"
  | "RATE_LIMIT"
  | "EXCHANGE"
  | "CANCELLED"
  | "UNAVAILABLE"
  | "INTERNAL";

/**
 * Immutable WebSocket error details.
 */
export interface ExchangeWebSocketErrorDetails {
  readonly category: ExchangeWebSocketErrorCategory;
  readonly code: string;
  readonly message: string;

  readonly connectionId?: string;
  readonly messageId?: string;
  readonly subscriptionId?: string;

  readonly exchangeCode?: string;
  readonly exchangeMessage?: string;
  readonly exchangeRequestId?: string;

  readonly retryable: boolean;
  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by WebSocket transport infrastructure.
 */
export class ExchangeWebSocketError extends Error {
  public readonly details: ExchangeWebSocketErrorDetails;

  public constructor(details: ExchangeWebSocketErrorDetails) {
    super(details.message);

    this.name = "ExchangeWebSocketError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeWebSocketErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public get connectionId(): string | undefined {
    return this.details.connectionId;
  }

  public get messageId(): string | undefined {
    return this.details.messageId;
  }

  public get subscriptionId(): string | undefined {
    return this.details.subscriptionId;
  }

  public toJSON(): ExchangeWebSocketErrorDetails {
    return this.details;
  }
}

/**
 * Successful connection result.
 */
export interface ExchangeWebSocketConnectResult {
  readonly connectionId: string;
  readonly previousState: ExchangeWebSocketClientState;
  readonly currentState: ExchangeWebSocketClientState;
  readonly changed: boolean;
  readonly connectedAt: number;
  readonly revision: number;
  readonly authenticated: boolean;
}

/**
 * Disconnect options.
 */
export interface ExchangeWebSocketDisconnectOptions {
  readonly graceful?: boolean;
  readonly timeoutMs?: number;
  readonly requestedAt?: number;
  readonly reason?: string;
}

/**
 * Disconnect result.
 */
export interface ExchangeWebSocketDisconnectResult {
  readonly connectionId?: string;
  readonly previousState: ExchangeWebSocketClientState;
  readonly currentState: ExchangeWebSocketClientState;
  readonly changed: boolean;
  readonly disconnectedAt: number;
  readonly revision: number;
  readonly reason: ExchangeWebSocketDisconnectReason;
  readonly droppedMessageCount: number;
}

/**
 * Message listener.
 */
export type ExchangeWebSocketMessageListener = (
  message: ExchangeWebSocketMessage,
) => void | Promise<void>;

/**
 * State listener.
 */
export type ExchangeWebSocketStateListener = (
  snapshot: ExchangeWebSocketClientStateSnapshot,
) => void | Promise<void>;

/**
 * Error listener.
 */
export type ExchangeWebSocketErrorListener = (
  error: ExchangeWebSocketError,
) => void | Promise<void>;

/**
 * Subscription listener.
 */
export type ExchangeWebSocketSubscriptionListener = (
  snapshot: ExchangeWebSocketSubscriptionSnapshot,
) => void | Promise<void>;

/**
 * Function used to unregister an event listener.
 */
export type ExchangeWebSocketUnsubscribeListener = () => void;

/**
 * Optional cancellation abstraction.
 */
export interface ExchangeWebSocketCancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;

  throwIfCancelled(): void;

  onCancelled(listener: (reason?: string) => void): () => void;
}

/**
 * Message execution options.
 */
export interface ExchangeWebSocketSendOptions {
  readonly cancellationToken?: ExchangeWebSocketCancellationToken;
}

/**
 * Core WebSocket client contract.
 */
export interface ExchangeWebSocketClient {
  /**
   * Returns the latest lifecycle state without network I/O.
   */
  getState(): ExchangeWebSocketClientStateSnapshot;

  /**
   * Returns current metrics.
   */
  getMetrics(): ExchangeWebSocketClientMetrics;

  /**
   * Returns current heartbeat state.
   */
  getHeartbeat(): ExchangeWebSocketHeartbeatSnapshot;

  /**
   * Returns current reconnect state.
   */
  getReconnectState(): ExchangeWebSocketReconnectSnapshot;

  /**
   * Returns all known subscription snapshots.
   */
  getSubscriptions(): readonly ExchangeWebSocketSubscriptionSnapshot[];

  /**
   * Opens the configured WebSocket transport.
   */
  connect(
    request: ExchangeWebSocketConnectRequest,
  ): Promise<ExchangeWebSocketConnectResult>;

  /**
   * Sends an immutable WebSocket message.
   */
  send(
    request: ExchangeWebSocketSendRequest,
    options?: ExchangeWebSocketSendOptions,
  ): Promise<ExchangeWebSocketSendResult>;

  /**
   * Registers an exchange channel subscription.
   */
  subscribe(
    request: ExchangeWebSocketSubscriptionRequest,
  ): Promise<ExchangeWebSocketSubscriptionResult>;

  /**
   * Removes an active exchange channel subscription.
   */
  unsubscribe(
    subscriptionId: string,
    context: ExchangeConnectorOperationContext,
  ): Promise<ExchangeWebSocketSubscriptionResult>;

  /**
   * Closes the active WebSocket transport.
   */
  disconnect(
    options?: ExchangeWebSocketDisconnectOptions,
  ): Promise<ExchangeWebSocketDisconnectResult>;

  /**
   * Permanently releases transport resources.
   */
  destroy(
    options?: ExchangeWebSocketDisconnectOptions,
  ): Promise<ExchangeWebSocketDisconnectResult>;

  /**
   * Registers an inbound message listener.
   */
  onMessage(
    listener: ExchangeWebSocketMessageListener,
  ): ExchangeWebSocketUnsubscribeListener;

  /**
   * Registers a lifecycle listener.
   */
  onStateChanged(
    listener: ExchangeWebSocketStateListener,
  ): ExchangeWebSocketUnsubscribeListener;

  /**
   * Registers a transport error listener.
   */
  onError(
    listener: ExchangeWebSocketErrorListener,
  ): ExchangeWebSocketUnsubscribeListener;

  /**
   * Registers a subscription lifecycle listener.
   */
  onSubscriptionChanged(
    listener: ExchangeWebSocketSubscriptionListener,
  ): ExchangeWebSocketUnsubscribeListener;
}

/**
 * Validates a WebSocket connection request.
 */
export function validateExchangeWebSocketConnectRequest(
  request: ExchangeWebSocketConnectRequest,
): void {
  requireNonEmptyString(
    request.connectionId,
    "connectionId",
    request.context?.createdAt,
  );

  validateContext(request.context);

  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw createValidationError(
      "INVALID_CONNECTION_TIMEOUT",
      "Connection timeout must be a finite number greater than zero.",
      request.context.createdAt,
      request.connectionId,
    );
  }
}

/**
 * Validates an outbound WebSocket message.
 */
export function validateExchangeWebSocketSendRequest(
  request: ExchangeWebSocketSendRequest,
): void {
  requireNonEmptyString(
    request.messageId,
    "messageId",
    request.context?.createdAt,
  );

  validateContext(request.context);
  validatePayload(request.payload, request.context.createdAt);

  if (
    request.channel !== undefined &&
    request.channel.trim().length === 0
  ) {
    throw createValidationError(
      "INVALID_CHANNEL",
      "WebSocket channel must not be empty.",
      request.context.createdAt,
      undefined,
      request.messageId,
    );
  }

  if (
    request.symbol !== undefined &&
    request.symbol.trim().length === 0
  ) {
    throw createValidationError(
      "INVALID_SYMBOL",
      "WebSocket symbol must not be empty.",
      request.context.createdAt,
      undefined,
      request.messageId,
    );
  }

  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw createValidationError(
      "INVALID_SEND_TIMEOUT",
      "Send timeout must be a finite number greater than zero.",
      request.context.createdAt,
      undefined,
      request.messageId,
    );
  }
}

/**
 * Validates a WebSocket subscription request.
 */
export function validateExchangeWebSocketSubscriptionRequest(
  request: ExchangeWebSocketSubscriptionRequest,
): void {
  requireNonEmptyString(
    request.subscriptionId,
    "subscriptionId",
    request.context?.createdAt,
  );

  requireNonEmptyString(
    request.channel,
    "channel",
    request.context?.createdAt,
  );

  validateContext(request.context);

  if (request.symbols) {
    const uniqueSymbols = new Set<string>();

    request.symbols.forEach((symbol, index) => {
      if (!symbol.trim()) {
        throw createValidationError(
          "INVALID_SUBSCRIPTION_SYMBOL",
          `Subscription symbol at index ${index} must not be empty.`,
          request.context.createdAt,
          undefined,
          undefined,
          request.subscriptionId,
        );
      }

      if (uniqueSymbols.has(symbol)) {
        throw createValidationError(
          "DUPLICATE_SUBSCRIPTION_SYMBOL",
          `Subscription symbol '${symbol}' appears more than once.`,
          request.context.createdAt,
          undefined,
          undefined,
          request.subscriptionId,
        );
      }

      uniqueSymbols.add(symbol);
    });
  }

  if (
    request.parameters !== undefined &&
    !isPlainRecord(request.parameters)
  ) {
    throw createValidationError(
      "INVALID_SUBSCRIPTION_PARAMETERS",
      "Subscription parameters must be a plain immutable record.",
      request.context.createdAt,
      undefined,
      undefined,
      request.subscriptionId,
    );
  }
}

/**
 * Returns true when the WebSocket client can send and receive messages.
 */
export function isExchangeWebSocketOperational(
  state: ExchangeWebSocketClientState,
): boolean {
  return state === "READY";
}

/**
 * Returns true when the transport has an open network connection.
 */
export function isExchangeWebSocketConnected(
  state: ExchangeWebSocketClientState,
): boolean {
  return (
    state === "CONNECTED" ||
    state === "AUTHENTICATING" ||
    state === "READY"
  );
}

/**
 * Returns true when the client is permanently unavailable.
 */
export function isExchangeWebSocketTerminal(
  state: ExchangeWebSocketClientState,
): boolean {
  return state === "DESTROYED";
}

/**
 * Runtime type guard for WebSocket client states.
 */
export function isExchangeWebSocketClientState(
  value: unknown,
): value is ExchangeWebSocketClientState {
  return (
    value === "CREATED" ||
    value === "CONNECTING" ||
    value === "CONNECTED" ||
    value === "AUTHENTICATING" ||
    value === "READY" ||
    value === "RECONNECTING" ||
    value === "DISCONNECTING" ||
    value === "DISCONNECTED" ||
    value === "FAILED" ||
    value === "DESTROYED"
  );
}

/**
 * Runtime type guard for WebSocket errors.
 */
export function isExchangeWebSocketError(
  value: unknown,
): value is ExchangeWebSocketError {
  return value instanceof ExchangeWebSocketError;
}

/**
 * Runtime type guard for supported WebSocket payloads.
 */
export function isExchangeWebSocketPayload(
  value: unknown,
): value is ExchangeWebSocketPayload {
  return (
    value === null ||
    typeof value === "string" ||
    value instanceof Uint8Array ||
    Array.isArray(value) ||
    isPlainRecord(value)
  );
}

/**
 * Creates a stable subscription key.
 *
 * Symbols are sorted so equivalent requests produce the same deterministic key.
 */
export function createExchangeWebSocketSubscriptionKey(
  channel: string,
  symbols: readonly string[] = [],
): string {
  const normalizedChannel = channel.trim();
  const normalizedSymbols = [...symbols]
    .map((symbol) => symbol.trim())
    .sort();

  return normalizedSymbols.length === 0
    ? normalizedChannel
    : `${normalizedChannel}:${normalizedSymbols.join(",")}`;
}

function validateContext(
  context: ExchangeConnectorOperationContext | undefined,
): asserts context is ExchangeConnectorOperationContext {
  if (!context) {
    throw createValidationError(
      "WEBSOCKET_CONTEXT_REQUIRED",
      "A connector operation context is required.",
      0,
    );
  }

  requireNonEmptyString(
    context.operationId,
    "context.operationId",
    context.createdAt,
  );

  if (!Number.isFinite(context.createdAt) || context.createdAt < 0) {
    throw createValidationError(
      "INVALID_CONTEXT_TIMESTAMP",
      "Context creation timestamp must be finite and non-negative.",
      0,
    );
  }

  if (
    context.deadlineAt !== undefined &&
    (!Number.isFinite(context.deadlineAt) ||
      context.deadlineAt < context.createdAt)
  ) {
    throw createValidationError(
      "INVALID_CONTEXT_DEADLINE",
      "Context deadline must be finite and greater than or equal to its creation time.",
      context.createdAt,
    );
  }
}

function validatePayload(
  payload: ExchangeWebSocketPayload,
  occurredAt: number,
): void {
  if (!isExchangeWebSocketPayload(payload)) {
    throw createValidationError(
      "INVALID_WEBSOCKET_PAYLOAD",
      "WebSocket payload contains an unsupported value.",
      occurredAt,
    );
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
  occurredAt: number | undefined,
): void {
  if (!value.trim()) {
    throw createValidationError(
      "REQUIRED_VALUE_MISSING",
      `${path} must not be empty.`,
      normalizeTimestamp(occurredAt),
    );
  }
}

function createValidationError(
  code: string,
  message: string,
  occurredAt: number,
  connectionId?: string,
  messageId?: string,
  subscriptionId?: string,
): ExchangeWebSocketError {
  return new ExchangeWebSocketError({
    category: "VALIDATION",
    code,
    message,
    connectionId,
    messageId,
    subscriptionId,
    retryable: false,
    occurredAt: normalizeTimestamp(occurredAt),
  });
}

function normalizeTimestamp(value: number | undefined): number {
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

  return prototype === Object.prototype || prototype === null;
}