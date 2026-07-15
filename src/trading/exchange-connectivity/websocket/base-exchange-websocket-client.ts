/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Reusable deterministic base WebSocket client.
 *
 * This implementation provides:
 * - deterministic connection lifecycle;
 * - transport adapter isolation;
 * - immutable state and metrics snapshots;
 * - outbound message validation;
 * - inbound message routing;
 * - subscription registration and removal;
 * - heartbeat state management;
 * - reconnect state tracking;
 * - listener registration;
 * - structured error normalization;
 * - graceful disconnect and destruction.
 */

import type {
  ExchangeWebSocketEndpointConfig,
  ExchangeWebSocketTransportConfig,
} from "../connectors/exchange-connector-config";

import {
  ExchangeWebSocketError,
  validateExchangeWebSocketConnectRequest,
  validateExchangeWebSocketSendRequest,
  validateExchangeWebSocketSubscriptionRequest,
  type ExchangeWebSocketClient,
  type ExchangeWebSocketClientMetrics,
  type ExchangeWebSocketClientState,
  type ExchangeWebSocketClientStateSnapshot,
  type ExchangeWebSocketConnectRequest,
  type ExchangeWebSocketConnectResult,
  type ExchangeWebSocketDisconnectOptions,
  type ExchangeWebSocketDisconnectResult,
  type ExchangeWebSocketErrorListener,
  type ExchangeWebSocketHeartbeatSnapshot,
  type ExchangeWebSocketMessage,
  type ExchangeWebSocketMessageListener,
  type ExchangeWebSocketReconnectSnapshot,
  type ExchangeWebSocketSendOptions,
  type ExchangeWebSocketSendRequest,
  type ExchangeWebSocketSendResult,
  type ExchangeWebSocketStateListener,
  type ExchangeWebSocketSubscriptionListener,
  type ExchangeWebSocketSubscriptionRequest,
  type ExchangeWebSocketSubscriptionResult,
  type ExchangeWebSocketSubscriptionSnapshot,
  type ExchangeWebSocketSubscriptionState,
  type ExchangeWebSocketUnsubscribeListener,
} from "./exchange-websocket-client";

import type {
  ExchangeConnectorOperationContext,
} from "../connectors/exchange-connector";

/**
 * Clock dependency used by the base WebSocket client.
 */
export interface BaseExchangeWebSocketClock {
  now(): number;
}

/**
 * Raw WebSocket transport lifecycle states.
 */
export type BaseExchangeWebSocketTransportState =
  | "CREATED"
  | "CONNECTING"
  | "OPEN"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

/**
 * Raw outbound transport message.
 */
export interface BaseExchangeWebSocketTransportSendRequest {
  readonly connectionId: string;
  readonly messageId: string;
  readonly payload: string | Uint8Array;
}

/**
 * Raw transport send result.
 */
export interface BaseExchangeWebSocketTransportSendResult {
  readonly accepted: boolean;
  readonly bufferedAmount: number;
}

/**
 * Raw transport close request.
 */
export interface BaseExchangeWebSocketTransportCloseRequest {
  readonly graceful: boolean;
  readonly timeoutMs?: number;
  readonly reason?: string;
}

/**
 * Callbacks registered with the transport.
 */
export interface BaseExchangeWebSocketTransportCallbacks {
  readonly onOpen: () => void | Promise<void>;

  readonly onMessage: (
    payload: string | Uint8Array,
  ) => void | Promise<void>;

  readonly onError: (
    error: unknown,
  ) => void | Promise<void>;

  readonly onClose: (
    code?: number,
    reason?: string,
  ) => void | Promise<void>;
}

/**
 * Transport adapter implemented using ws, native WebSocket, Undici, or another
 * WebSocket library.
 */
export interface BaseExchangeWebSocketTransport {
  getState(): BaseExchangeWebSocketTransportState;

  connect(
    endpoint: ExchangeWebSocketEndpointConfig,
    callbacks: BaseExchangeWebSocketTransportCallbacks,
  ): Promise<void>;

  send(
    request: BaseExchangeWebSocketTransportSendRequest,
  ): Promise<BaseExchangeWebSocketTransportSendResult>;

  close(
    request: BaseExchangeWebSocketTransportCloseRequest,
  ): Promise<void>;

  destroy(): Promise<void>;

  getBufferedAmount(): number;
}

/**
 * Optional message codec.
 *
 * Exchange-specific implementations may override JSON envelopes, authentication
 * payloads, subscription payloads, and inbound message interpretation.
 */
export interface BaseExchangeWebSocketMessageCodec {
  encode(
    request: ExchangeWebSocketSendRequest,
  ): string | Uint8Array;

  decode(
    connectionId: string,
    payload: string | Uint8Array,
    receivedAt: number,
  ): ExchangeWebSocketMessage;

  createSubscriptionMessage(
    request: ExchangeWebSocketSubscriptionRequest,
  ): ExchangeWebSocketSendRequest;

  createUnsubscriptionMessage(
    subscription: ExchangeWebSocketSubscriptionSnapshot,
    context: ExchangeConnectorOperationContext,
  ): ExchangeWebSocketSendRequest;

  createPingMessage?(
    connectionId: string,
    context: ExchangeConnectorOperationContext,
  ): ExchangeWebSocketSendRequest;
}

/**
 * Optional authentication adapter.
 */
export interface BaseExchangeWebSocketAuthenticator {
  authenticate(
    connectionId: string,
    context: ExchangeConnectorOperationContext,
  ): Promise<void>;
}

/**
 * Immutable base WebSocket client configuration.
 */
export interface BaseExchangeWebSocketClientConfig {
  readonly transport: ExchangeWebSocketTransportConfig;

  /**
   * Whether connections should become READY immediately after opening when
   * authentication is not required.
   */
  readonly readyOnOpen: boolean;

  /**
   * Whether subscriptions should be restored after reconnect.
   */
  readonly restoreSubscriptionsOnReconnect: boolean;
}

/**
 * Dependencies required by the base WebSocket client.
 */
export interface BaseExchangeWebSocketClientDependencies {
  readonly clock: BaseExchangeWebSocketClock;
  readonly transport: BaseExchangeWebSocketTransport;
  readonly codec: BaseExchangeWebSocketMessageCodec;
  readonly authenticator?: BaseExchangeWebSocketAuthenticator;
}

/**
 * Reusable base WebSocket client.
 */
export class BaseExchangeWebSocketClient
  implements ExchangeWebSocketClient
{
  private readonly config: BaseExchangeWebSocketClientConfig;
  private readonly clock: BaseExchangeWebSocketClock;
  private readonly transport: BaseExchangeWebSocketTransport;
  private readonly codec: BaseExchangeWebSocketMessageCodec;
  private readonly authenticator?: BaseExchangeWebSocketAuthenticator;

  private state: ExchangeWebSocketClientState = "CREATED";
  private stateRevision = 1;
  private stateChangedAt: number;
  private stateReason?: string;

  private connectionId?: string;
  private authenticated = false;

  private readonly subscriptions = new Map<
    string,
    ExchangeWebSocketSubscriptionSnapshot
  >();

  private heartbeat: ExchangeWebSocketHeartbeatSnapshot;
  private reconnect: ExchangeWebSocketReconnectSnapshot;

  private readonly messageListeners =
    new Set<ExchangeWebSocketMessageListener>();

  private readonly stateListeners =
    new Set<ExchangeWebSocketStateListener>();

  private readonly errorListeners =
    new Set<ExchangeWebSocketErrorListener>();

  private readonly subscriptionListeners =
    new Set<ExchangeWebSocketSubscriptionListener>();

  private totalConnections = 0;
  private successfulConnections = 0;
  private failedConnections = 0;
  private reconnectionAttempts = 0;

  private totalMessagesReceived = 0;
  private totalMessagesSent = 0;
  private failedMessages = 0;
  private droppedMessages = 0;

  private totalSubscriptions = 0;
  private failedSubscriptions = 0;

  private heartbeatTimeouts = 0;
  private protocolErrors = 0;

  private connectedAt?: number;
  private disconnectedAt?: number;
  private lastMessageReceivedAt?: number;
  private lastMessageSentAt?: number;
  private lastFailureAt?: number;

  public constructor(
    config: BaseExchangeWebSocketClientConfig,
    dependencies: BaseExchangeWebSocketClientDependencies,
  ) {
    validateBaseExchangeWebSocketClientConfig(config);
    validateBaseExchangeWebSocketClientDependencies(dependencies);

    const createdAt = dependencies.clock.now();

    validateTimestamp(
      createdAt,
      "WebSocket client construction timestamp",
    );

    this.config = freezeConfig(config);
    this.clock = dependencies.clock;
    this.transport = dependencies.transport;
    this.codec = dependencies.codec;
    this.authenticator = dependencies.authenticator;
    this.stateChangedAt = createdAt;

    this.heartbeat = Object.freeze({
      enabled: this.config.transport.heartbeat.enabled,
      awaitingPong: false,
      missedHeartbeatCount: 0,
    });

    this.reconnect = Object.freeze({
      enabled: this.config.transport.reconnect.enabled,
      reconnecting: false,
      attemptCount: 0,
      maximumAttempts:
        this.config.transport.reconnect.maximumAttempts,
      exhausted: false,
    });
  }

  public getState(): ExchangeWebSocketClientStateSnapshot {
    return Object.freeze({
      connectionId: this.connectionId,
      state: this.state,
      revision: this.stateRevision,
      changedAt: this.stateChangedAt,
      reason: this.stateReason,
    });
  }

  public getMetrics(): ExchangeWebSocketClientMetrics {
    return Object.freeze({
      capturedAt: this.clock.now(),

      totalConnections: this.totalConnections,
      successfulConnections: this.successfulConnections,
      failedConnections: this.failedConnections,
      reconnectionAttempts: this.reconnectionAttempts,

      totalMessagesReceived: this.totalMessagesReceived,
      totalMessagesSent: this.totalMessagesSent,
      failedMessages: this.failedMessages,
      droppedMessages: this.droppedMessages,

      totalSubscriptions: this.totalSubscriptions,
      activeSubscriptions: this.countActiveSubscriptions(),
      failedSubscriptions: this.failedSubscriptions,

      heartbeatTimeouts: this.heartbeatTimeouts,
      protocolErrors: this.protocolErrors,

      bufferedMessageCount: 0,
      bufferedAmount: this.transport.getBufferedAmount(),

      connectedAt: this.connectedAt,
      disconnectedAt: this.disconnectedAt,
      lastMessageReceivedAt: this.lastMessageReceivedAt,
      lastMessageSentAt: this.lastMessageSentAt,
      lastFailureAt: this.lastFailureAt,
    });
  }

  public getHeartbeat(): ExchangeWebSocketHeartbeatSnapshot {
    return this.heartbeat;
  }

  public getReconnectState(): ExchangeWebSocketReconnectSnapshot {
    return this.reconnect;
  }

  public getSubscriptions():
    readonly ExchangeWebSocketSubscriptionSnapshot[] {
    return Object.freeze(
      [...this.subscriptions.values()]
        .sort((left, right) =>
          left.subscriptionId.localeCompare(
            right.subscriptionId,
          ),
        ),
    );
  }

  public async connect(
    request: ExchangeWebSocketConnectRequest,
  ): Promise<ExchangeWebSocketConnectResult> {
    validateExchangeWebSocketConnectRequest(request);

    if (
      this.state === "READY" ||
      this.state === "CONNECTED" ||
      this.state === "AUTHENTICATING"
    ) {
      if (this.connectionId === request.connectionId) {
        return Object.freeze({
          connectionId: request.connectionId,
          previousState: this.state,
          currentState: this.state,
          changed: false,
          connectedAt:
            this.connectedAt ?? this.clock.now(),
          revision: this.stateRevision,
          authenticated: this.authenticated,
        });
      }

      throw this.createError({
        category: "CONNECTION",
        code: "WEBSOCKET_ALREADY_CONNECTED",
        message:
          "WebSocket client is already connected using another connection ID.",
        connectionId: this.connectionId,
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    if (this.state === "DESTROYED") {
      throw this.createError({
        category: "UNAVAILABLE",
        code: "WEBSOCKET_CLIENT_DESTROYED",
        message:
          "A destroyed WebSocket client cannot reconnect.",
        connectionId: request.connectionId,
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    if (
      this.state === "CONNECTING" ||
      this.state === "RECONNECTING"
    ) {
      throw this.createError({
        category: "CONNECTION",
        code: "WEBSOCKET_CONNECTION_ALREADY_ACTIVE",
        message:
          "A WebSocket connection attempt is already active.",
        connectionId: request.connectionId,
        retryable: true,
        occurredAt: this.clock.now(),
      });
    }

    const endpoint = this.resolveEndpoint(request);
    const previousState = this.state;
    const startedAt = this.clock.now();

    this.connectionId = request.connectionId;
    this.authenticated = false;
    this.totalConnections += 1;

    this.transitionState(
      "CONNECTING",
      startedAt,
    );

    try {
      await this.transport.connect(
        endpoint,
        this.createTransportCallbacks(
          request.connectionId,
        ),
      );

      const openedAt = this.clock.now();

      validateChronology(startedAt, openedAt);

      const stateAfterTransportConnect =
        this.getState().state;

      if (stateAfterTransportConnect === "CONNECTING") {
        this.transitionState(
          "CONNECTED",
          openedAt,
        );
      }

      if (request.authenticated) {
        if (!this.authenticator) {
          throw this.createError({
            category: "CONFIGURATION",
            code: "WEBSOCKET_AUTHENTICATOR_REQUIRED",
            message:
              "Authenticated WebSocket connection requires an authenticator.",
            connectionId: request.connectionId,
            retryable: false,
            occurredAt: openedAt,
          });
        }

        this.transitionState(
          "AUTHENTICATING",
          openedAt,
        );

        await this.authenticator.authenticate(
          request.connectionId,
          request.context,
        );

        this.authenticated = true;
      }

      const readyAt = this.clock.now();

      if (
        request.authenticated ||
        this.config.readyOnOpen
      ) {
        this.transitionState(
          "READY",
          readyAt,
        );
      }

      this.successfulConnections += 1;
      this.connectedAt = readyAt;

      this.reconnect = Object.freeze({
        ...this.reconnect,
        reconnecting: false,
        attemptCount: 0,
        lastSuccessfulConnectionAt: readyAt,
        nextAttemptAt: undefined,
        exhausted: false,
      });

      return Object.freeze({
        connectionId: request.connectionId,
        previousState,
        currentState: this.state,
        changed: previousState !== this.state,
        connectedAt: readyAt,
        revision: this.stateRevision,
        authenticated: this.authenticated,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      this.failedConnections += 1;
      this.lastFailureAt = failedAt;

      this.transitionState(
        "FAILED",
        failedAt,
        getErrorMessage(error),
      );

      const normalized = this.normalizeError(
        error,
        failedAt,
        request.connectionId,
      );

      await this.emitError(normalized);

      throw normalized;
    }
  }

  public async send(
    request: ExchangeWebSocketSendRequest,
    options: ExchangeWebSocketSendOptions = {},
  ): Promise<ExchangeWebSocketSendResult> {
    validateExchangeWebSocketSendRequest(request);

    if (this.state !== "READY") {
      throw this.createError({
        category: "UNAVAILABLE",
        code: "WEBSOCKET_CLIENT_NOT_READY",
        message:
          `WebSocket client cannot send messages while in ${this.state} state.`,
        connectionId: this.connectionId,
        messageId: request.messageId,
        retryable:
          this.state === "CONNECTED" ||
          this.state === "AUTHENTICATING" ||
          this.state === "RECONNECTING",
        occurredAt: this.clock.now(),
      });
    }

    if (!this.connectionId) {
      throw this.createError({
        category: "CONNECTION",
        code: "WEBSOCKET_CONNECTION_ID_MISSING",
        message:
          "An active connection ID is required to send WebSocket messages.",
        messageId: request.messageId,
        retryable: true,
        occurredAt: this.clock.now(),
      });
    }

    options.cancellationToken?.throwIfCancelled();

    try {
      const payload = this.codec.encode(request);

      const result = await this.transport.send({
        connectionId: this.connectionId,
        messageId: request.messageId,
        payload,
      });

      const sentAt = this.clock.now();

      if (result.accepted) {
        this.totalMessagesSent += 1;
        this.lastMessageSentAt = sentAt;
      } else {
        this.failedMessages += 1;
      }

      return Object.freeze({
        messageId: request.messageId,
        connectionId: this.connectionId,
        accepted: result.accepted,
        sentAt,
        bufferedAmount: result.bufferedAmount,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      this.failedMessages += 1;
      this.lastFailureAt = failedAt;

      const normalized = this.normalizeError(
        error,
        failedAt,
        this.connectionId,
        request.messageId,
      );

      await this.emitError(normalized);

      throw normalized;
    }
  }

  public async subscribe(
    request: ExchangeWebSocketSubscriptionRequest,
  ): Promise<ExchangeWebSocketSubscriptionResult> {
    validateExchangeWebSocketSubscriptionRequest(request);

    if (this.state !== "READY") {
      throw this.createError({
        category: "SUBSCRIPTION",
        code: "WEBSOCKET_NOT_READY_FOR_SUBSCRIPTION",
        message:
          "WebSocket client must be ready before subscriptions can be added.",
        connectionId: this.connectionId,
        subscriptionId: request.subscriptionId,
        retryable: true,
        occurredAt: this.clock.now(),
      });
    }

    if (
      request.authenticated &&
      !this.authenticated
    ) {
      throw this.createError({
        category: "AUTHENTICATION",
        code: "AUTHENTICATED_SUBSCRIPTION_REQUIRES_LOGIN",
        message:
          "Authenticated subscription requires an authenticated connection.",
        connectionId: this.connectionId,
        subscriptionId: request.subscriptionId,
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    const existing = this.subscriptions.get(
      request.subscriptionId,
    );

    if (existing?.state === "ACTIVE") {
      return Object.freeze({
        subscriptionId: request.subscriptionId,
        previousState: "ACTIVE",
        currentState: "ACTIVE",
        changed: false,
        completedAt: this.clock.now(),
        revision: existing.revision,
      });
    }

    const startedAt = this.clock.now();

    const pending = Object.freeze({
      subscriptionId: request.subscriptionId,
      channel: request.channel,
      symbols: Object.freeze([
        ...(request.symbols ?? []),
      ]),
      state: "PENDING" as const,
      revision: existing
        ? existing.revision + 1
        : 1,
      changedAt: startedAt,
    });

    this.subscriptions.set(
      request.subscriptionId,
      pending,
    );

    await this.emitSubscription(pending);

    try {
      const sendRequest =
        this.codec.createSubscriptionMessage(request);

      await this.send(sendRequest);

      const completedAt = this.clock.now();

      const active =
        this.transitionSubscription(
          pending,
          "ACTIVE",
          completedAt,
        );

      this.totalSubscriptions += 1;

      await this.emitSubscription(active);

      return Object.freeze({
        subscriptionId: request.subscriptionId,
        previousState:
          existing?.state ?? "INACTIVE",
        currentState: "ACTIVE",
        changed: true,
        completedAt,
        revision: active.revision,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      const failed =
        this.transitionSubscription(
          pending,
          "FAILED",
          failedAt,
          getErrorMessage(error),
        );

      this.failedSubscriptions += 1;

      await this.emitSubscription(failed);

      throw this.normalizeError(
        error,
        failedAt,
        this.connectionId,
        undefined,
        request.subscriptionId,
      );
    }
  }

  public async unsubscribe(
    subscriptionId: string,
    context: ExchangeConnectorOperationContext,
  ): Promise<ExchangeWebSocketSubscriptionResult> {
    requireNonEmptyString(
      subscriptionId,
      "subscriptionId",
    );

    validateOperationContext(context);

    const existing =
      this.subscriptions.get(subscriptionId);

    if (!existing) {
      return Object.freeze({
        subscriptionId,
        previousState: "INACTIVE",
        currentState: "INACTIVE",
        changed: false,
        completedAt: this.clock.now(),
        revision: 0,
      });
    }

    if (existing.state === "INACTIVE") {
      return Object.freeze({
        subscriptionId,
        previousState: "INACTIVE",
        currentState: "INACTIVE",
        changed: false,
        completedAt: this.clock.now(),
        revision: existing.revision,
      });
    }

    const startedAt = this.clock.now();

    const unsubscribing =
      this.transitionSubscription(
        existing,
        "UNSUBSCRIBING",
        startedAt,
      );

    await this.emitSubscription(unsubscribing);

    try {
      const sendRequest =
        this.codec.createUnsubscriptionMessage(
          unsubscribing,
          context,
        );

      await this.send(sendRequest);

      const completedAt = this.clock.now();

      const inactive =
        this.transitionSubscription(
          unsubscribing,
          "INACTIVE",
          completedAt,
        );

      await this.emitSubscription(inactive);

      return Object.freeze({
        subscriptionId,
        previousState: existing.state,
        currentState: "INACTIVE",
        changed: true,
        completedAt,
        revision: inactive.revision,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      const failed =
        this.transitionSubscription(
          unsubscribing,
          "FAILED",
          failedAt,
          getErrorMessage(error),
        );

      this.failedSubscriptions += 1;

      await this.emitSubscription(failed);

      throw this.normalizeError(
        error,
        failedAt,
        this.connectionId,
        undefined,
        subscriptionId,
      );
    }
  }

  public async disconnect(
    options: ExchangeWebSocketDisconnectOptions = {},
  ): Promise<ExchangeWebSocketDisconnectResult> {
    validateDisconnectOptions(options);

    if (this.state === "DISCONNECTED") {
      return Object.freeze({
        connectionId: this.connectionId,
        previousState: "DISCONNECTED",
        currentState: "DISCONNECTED",
        changed: false,
        disconnectedAt: this.clock.now(),
        revision: this.stateRevision,
        reason: "REQUESTED",
        droppedMessageCount: 0,
      });
    }

    if (this.state === "CREATED") {
      const disconnectedAt = this.clock.now();

      this.transitionState(
        "DISCONNECTED",
        disconnectedAt,
        options.reason,
      );

      this.disconnectedAt = disconnectedAt;

      return Object.freeze({
        connectionId: this.connectionId,
        previousState: "CREATED",
        currentState: "DISCONNECTED",
        changed: true,
        disconnectedAt,
        revision: this.stateRevision,
        reason: "REQUESTED",
        droppedMessageCount: 0,
      });
    }

    if (this.state === "DESTROYED") {
      return Object.freeze({
        connectionId: this.connectionId,
        previousState: "DESTROYED",
        currentState: "DESTROYED",
        changed: false,
        disconnectedAt: this.clock.now(),
        revision: this.stateRevision,
        reason: "CLIENT_DESTROYED",
        droppedMessageCount: 0,
      });
    }

    const previousState = this.state;
    const startedAt = this.clock.now();

    this.transitionState(
      "DISCONNECTING",
      startedAt,
      options.reason,
    );

    try {
      await this.transport.close({
        graceful: options.graceful === true,
        timeoutMs: options.timeoutMs,
        reason: options.reason,
      });

      const completedAt = this.clock.now();

      validateChronology(startedAt, completedAt);

      this.transitionState(
        "DISCONNECTED",
        completedAt,
        options.reason,
      );

      this.authenticated = false;
      this.disconnectedAt = completedAt;

      this.markSubscriptionsInactive(
        completedAt,
        "WebSocket connection disconnected.",
      );

      return Object.freeze({
        connectionId: this.connectionId,
        previousState,
        currentState: "DISCONNECTED",
        changed: true,
        disconnectedAt: completedAt,
        revision: this.stateRevision,
        reason: "REQUESTED",
        droppedMessageCount: 0,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      this.lastFailureAt = failedAt;

      this.transitionState(
        "FAILED",
        failedAt,
        getErrorMessage(error),
      );

      const normalized = this.normalizeError(
        error,
        failedAt,
        this.connectionId,
      );

      await this.emitError(normalized);

      throw normalized;
    }
  }

  public async destroy(
    options: ExchangeWebSocketDisconnectOptions = {},
  ): Promise<ExchangeWebSocketDisconnectResult> {
    if (this.state === "DESTROYED") {
      return Object.freeze({
        connectionId: this.connectionId,
        previousState: "DESTROYED",
        currentState: "DESTROYED",
        changed: false,
        disconnectedAt: this.clock.now(),
        revision: this.stateRevision,
        reason: "CLIENT_DESTROYED",
        droppedMessageCount: 0,
      });
    }

    if (
      this.state !== "CREATED" &&
      this.state !== "DISCONNECTED"
    ) {
      await this.disconnect({
        ...options,
        reason:
          options.reason ??
          "WebSocket client destruction requested.",
      });
    }

    const previousState = this.state;
    const destroyedAt = this.clock.now();

    try {
      await this.transport.destroy();

      this.transitionState(
        "DESTROYED",
        destroyedAt,
        options.reason,
      );

      this.authenticated = false;

      this.markSubscriptionsInactive(
        destroyedAt,
        "WebSocket client destroyed.",
      );

      this.messageListeners.clear();
      this.stateListeners.clear();
      this.errorListeners.clear();
      this.subscriptionListeners.clear();

      return Object.freeze({
        connectionId: this.connectionId,
        previousState,
        currentState: "DESTROYED",
        changed: true,
        disconnectedAt: destroyedAt,
        revision: this.stateRevision,
        reason: "CLIENT_DESTROYED",
        droppedMessageCount: 0,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      this.lastFailureAt = failedAt;

      this.transitionState(
        "FAILED",
        failedAt,
        getErrorMessage(error),
      );

      throw this.normalizeError(
        error,
        failedAt,
        this.connectionId,
      );
    }
  }

  public onMessage(
    listener: ExchangeWebSocketMessageListener,
  ): ExchangeWebSocketUnsubscribeListener {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  public onStateChanged(
    listener: ExchangeWebSocketStateListener,
  ): ExchangeWebSocketUnsubscribeListener {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onError(
    listener: ExchangeWebSocketErrorListener,
  ): ExchangeWebSocketUnsubscribeListener {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onSubscriptionChanged(
    listener: ExchangeWebSocketSubscriptionListener,
  ): ExchangeWebSocketUnsubscribeListener {
    this.subscriptionListeners.add(listener);

    return () => {
      this.subscriptionListeners.delete(listener);
    };
  }

  /**
   * Records a ping sent by an external heartbeat scheduler.
   */
  protected recordPingSent(
    sentAt: number = this.clock.now(),
  ): void {
    validateTimestamp(sentAt, "Ping timestamp");

    this.heartbeat = Object.freeze({
      ...this.heartbeat,
      lastPingSentAt: sentAt,
      awaitingPong: true,
    });
  }

  /**
   * Records a pong received by an external heartbeat scheduler.
   */
  protected recordPongReceived(
    receivedAt: number = this.clock.now(),
  ): void {
    validateTimestamp(receivedAt, "Pong timestamp");

    const roundTripTime =
      this.heartbeat.lastPingSentAt !== undefined
        ? Math.max(
            0,
            receivedAt -
              this.heartbeat.lastPingSentAt,
          )
        : undefined;

    this.heartbeat = Object.freeze({
      ...this.heartbeat,
      lastPongReceivedAt: receivedAt,
      awaitingPong: false,
      missedHeartbeatCount: 0,
      lastRoundTripTimeMs: roundTripTime,
    });
  }

  /**
   * Records a heartbeat timeout.
   */
  protected recordHeartbeatTimeout(
    occurredAt: number = this.clock.now(),
  ): void {
    validateTimestamp(
      occurredAt,
      "Heartbeat timeout timestamp",
    );

    this.heartbeatTimeouts += 1;

    this.heartbeat = Object.freeze({
      ...this.heartbeat,
      awaitingPong: false,
      missedHeartbeatCount:
        this.heartbeat.missedHeartbeatCount + 1,
    });
  }

  /**
   * Updates reconnect state for an external reconnect coordinator.
   */
  protected recordReconnectAttempt(
    attemptCount: number,
    attemptedAt: number,
    nextAttemptAt?: number,
  ): void {
    if (
      !Number.isInteger(attemptCount) ||
      attemptCount <= 0
    ) {
      throw this.createError({
        category: "VALIDATION",
        code: "INVALID_RECONNECT_ATTEMPT",
        message:
          "Reconnect attempt count must be an integer greater than zero.",
        retryable: false,
        occurredAt: attemptedAt,
      });
    }

    validateTimestamp(
      attemptedAt,
      "Reconnect attempt timestamp",
    );

    this.reconnectionAttempts += 1;

    this.reconnect = Object.freeze({
      ...this.reconnect,
      reconnecting: true,
      attemptCount,
      lastAttemptAt: attemptedAt,
      nextAttemptAt,
      exhausted:
        attemptCount >=
        this.reconnect.maximumAttempts,
    });

    this.transitionState(
      "RECONNECTING",
      attemptedAt,
    );
  }

  private resolveEndpoint(
    request: ExchangeWebSocketConnectRequest,
  ): ExchangeWebSocketEndpointConfig {
    const endpoint =
      this.config.transport.endpoints.find(
        (candidate) =>
          candidate.type === request.endpointType,
      );

    if (!endpoint) {
      throw this.createError({
        category: "CONFIGURATION",
        code: "WEBSOCKET_ENDPOINT_NOT_CONFIGURED",
        message:
          `No WebSocket endpoint is configured for type ` +
          `'${request.endpointType}'.`,
        connectionId: request.connectionId,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    if (
      request.authenticated &&
      endpoint.authenticated === false
    ) {
      throw this.createError({
        category: "CONFIGURATION",
        code: "AUTHENTICATED_WEBSOCKET_ENDPOINT_REQUIRED",
        message:
          "The selected WebSocket endpoint does not support authentication.",
        connectionId: request.connectionId,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    return endpoint;
  }

  private createTransportCallbacks(
    connectionId: string,
  ): BaseExchangeWebSocketTransportCallbacks {
    return Object.freeze({
      onOpen: async () => {
        const openedAt = this.clock.now();

        if (this.state === "CONNECTING") {
          this.transitionState(
            "CONNECTED",
            openedAt,
          );
        }
      },

      onMessage: async (
        payload: string | Uint8Array,
      ) => {
        await this.handleInboundMessage(
          connectionId,
          payload,
        );
      },

      onError: async (error: unknown) => {
        const occurredAt = this.clock.now();

        this.lastFailureAt = occurredAt;

        const normalized = this.normalizeError(
          error,
          occurredAt,
          connectionId,
        );

        await this.emitError(normalized);
      },

      onClose: async (
        _code?: number,
        reason?: string,
      ) => {
        const closedAt = this.clock.now();

        if (
          this.state !== "DISCONNECTING" &&
          this.state !== "DESTROYED"
        ) {
          this.transitionState(
            "DISCONNECTED",
            closedAt,
            reason,
          );
        }

        this.authenticated = false;
        this.disconnectedAt = closedAt;

        this.markSubscriptionsInactive(
          closedAt,
          reason ??
            "Remote WebSocket connection closed.",
        );
      },
    });
  }

  private async handleInboundMessage(
    connectionId: string,
    payload: string | Uint8Array,
  ): Promise<void> {
    const receivedAt = this.clock.now();

    try {
      const message = this.codec.decode(
        connectionId,
        payload,
        receivedAt,
      );

      this.totalMessagesReceived += 1;
      this.lastMessageReceivedAt = receivedAt;

      if (message.type === "PONG") {
        this.recordPongReceived(receivedAt);
      }

      await this.emitMessage(message);
    } catch (error: unknown) {
      this.protocolErrors += 1;
      this.failedMessages += 1;
      this.lastFailureAt = receivedAt;

      const normalized = this.normalizeError(
        error,
        receivedAt,
        connectionId,
      );

      await this.emitError(normalized);
    }
  }

  private transitionState(
    nextState: ExchangeWebSocketClientState,
    changedAt: number,
    reason?: string,
  ): void {
    validateTimestamp(
      changedAt,
      "WebSocket state timestamp",
    );

    if (changedAt < this.stateChangedAt) {
      throw this.createError({
        category: "INTERNAL",
        code: "NON_MONOTONIC_WEBSOCKET_STATE_TIMESTAMP",
        message:
          "WebSocket state timestamps must be monotonically increasing.",
        connectionId: this.connectionId,
        retryable: false,
        occurredAt: changedAt,
      });
    }

    const changed =
      nextState !== this.state ||
      reason !== this.stateReason;

    if (!changed) {
      return;
    }

    this.state = nextState;
    this.stateRevision += 1;
    this.stateChangedAt = changedAt;
    this.stateReason = reason;

    void this.emitState(this.getState());
  }

  private transitionSubscription(
    previous:
      ExchangeWebSocketSubscriptionSnapshot,
    nextState: ExchangeWebSocketSubscriptionState,
    changedAt: number,
    reason?: string,
  ): ExchangeWebSocketSubscriptionSnapshot {
    const snapshot = Object.freeze({
      subscriptionId: previous.subscriptionId,
      channel: previous.channel,
      symbols: Object.freeze([
        ...previous.symbols,
      ]),
      state: nextState,
      revision: previous.revision + 1,
      changedAt,
      reason,
    });

    this.subscriptions.set(
      previous.subscriptionId,
      snapshot,
    );

    return snapshot;
  }

  private markSubscriptionsInactive(
    changedAt: number,
    reason: string,
  ): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.state === "INACTIVE") {
        continue;
      }

      const inactive =
        this.transitionSubscription(
          subscription,
          "INACTIVE",
          changedAt,
          reason,
        );

      void this.emitSubscription(inactive);
    }
  }

  private countActiveSubscriptions(): number {
    return [...this.subscriptions.values()].filter(
      (subscription) =>
        subscription.state === "ACTIVE",
    ).length;
  }

  private async emitMessage(
    message: ExchangeWebSocketMessage,
  ): Promise<void> {
    for (const listener of this.messageListeners) {
      try {
        await listener(message);
      } catch {
        this.droppedMessages += 1;
      }
    }
  }

  private async emitState(
    snapshot: ExchangeWebSocketClientStateSnapshot,
  ): Promise<void> {
    for (const listener of this.stateListeners) {
      try {
        await listener(snapshot);
      } catch {
        // Listener failures must not break lifecycle transitions.
      }
    }
  }

  private async emitError(
    error: ExchangeWebSocketError,
  ): Promise<void> {
    for (const listener of this.errorListeners) {
      try {
        await listener(error);
      } catch {
        // Error listener failures are intentionally isolated.
      }
    }
  }

  private async emitSubscription(
    snapshot: ExchangeWebSocketSubscriptionSnapshot,
  ): Promise<void> {
    for (const listener of this.subscriptionListeners) {
      try {
        await listener(snapshot);
      } catch {
        // Subscription listener failures are intentionally isolated.
      }
    }
  }

  private normalizeError(
    error: unknown,
    occurredAt: number,
    connectionId?: string,
    messageId?: string,
    subscriptionId?: string,
  ): ExchangeWebSocketError {
    if (error instanceof ExchangeWebSocketError) {
      return error;
    }

    const message = getErrorMessage(error);
    const normalized = message.toLowerCase();

    const category =
      normalized.includes("cancel")
        ? "CANCELLED"
        : normalized.includes("timeout")
          ? "TIMEOUT"
          : normalized.includes("auth")
            ? "AUTHENTICATION"
            : normalized.includes("protocol") ||
                normalized.includes("decode") ||
                normalized.includes("parse")
              ? "PROTOCOL"
              : normalized.includes("network") ||
                  normalized.includes("socket") ||
                  normalized.includes("connection")
                ? "NETWORK"
                : "INTERNAL";

    return this.createError({
      category,
      code: "WEBSOCKET_OPERATION_FAILED",
      message: "WebSocket operation failed.",
      connectionId,
      messageId,
      subscriptionId,
      retryable:
        category === "TIMEOUT" ||
        category === "NETWORK",
      occurredAt,
      causeName: getErrorName(error),
      causeMessage: message,
    });
  }

  private createError(
    details: ConstructorParameters<
      typeof ExchangeWebSocketError
    >[0],
  ): ExchangeWebSocketError {
    return new ExchangeWebSocketError(details);
  }
}

/**
 * Validates base WebSocket configuration.
 */
export function validateBaseExchangeWebSocketClientConfig(
  config: BaseExchangeWebSocketClientConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw createConfigurationError(
      "BASE_WEBSOCKET_CONFIG_REQUIRED",
      "Base WebSocket client configuration is required.",
    );
  }

  if (!config.transport.enabled) {
    throw createConfigurationError(
      "WEBSOCKET_TRANSPORT_DISABLED",
      "Base WebSocket client requires transport to be enabled.",
    );
  }

  if (config.transport.endpoints.length === 0) {
    throw createConfigurationError(
      "WEBSOCKET_ENDPOINTS_REQUIRED",
      "Base WebSocket client requires at least one endpoint.",
    );
  }

  const endpointTypes =
    config.transport.endpoints.map(
      (endpoint) => endpoint.type,
    );

  if (
    new Set(endpointTypes).size !==
    endpointTypes.length
  ) {
    throw createConfigurationError(
      "DUPLICATE_WEBSOCKET_ENDPOINT_TYPES",
      "WebSocket endpoint types must not contain duplicates.",
    );
  }

  if (
    !Number.isInteger(
      config.transport.maximumBufferedMessages,
    ) ||
    config.transport.maximumBufferedMessages <= 0
  ) {
    throw createConfigurationError(
      "INVALID_MAXIMUM_BUFFERED_MESSAGES",
      "Maximum buffered messages must be an integer greater than zero.",
    );
  }

  if (
    !Number.isFinite(
      config.transport.maximumMessageSizeBytes,
    ) ||
    config.transport.maximumMessageSizeBytes <= 0
  ) {
    throw createConfigurationError(
      "INVALID_MAXIMUM_MESSAGE_SIZE",
      "Maximum message size must be a finite number greater than zero.",
    );
  }
}

/**
 * Validates base WebSocket dependencies.
 */
export function validateBaseExchangeWebSocketClientDependencies(
  dependencies: BaseExchangeWebSocketClientDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null
  ) {
    throw createConfigurationError(
      "BASE_WEBSOCKET_DEPENDENCIES_REQUIRED",
      "Base WebSocket client dependencies are required.",
    );
  }

  if (
    typeof dependencies.clock?.now !== "function"
  ) {
    throw createConfigurationError(
      "BASE_WEBSOCKET_CLOCK_REQUIRED",
      "Base WebSocket client requires a valid clock.",
    );
  }

  if (
    typeof dependencies.transport?.getState !== "function" ||
    typeof dependencies.transport?.connect !== "function" ||
    typeof dependencies.transport?.send !== "function" ||
    typeof dependencies.transport?.close !== "function" ||
    typeof dependencies.transport?.destroy !== "function" ||
    typeof dependencies.transport?.getBufferedAmount !==
      "function"
  ) {
    throw createConfigurationError(
      "BASE_WEBSOCKET_TRANSPORT_REQUIRED",
      "Base WebSocket client requires a valid transport adapter.",
    );
  }

  if (
    typeof dependencies.codec?.encode !== "function" ||
    typeof dependencies.codec?.decode !== "function" ||
    typeof dependencies.codec
      ?.createSubscriptionMessage !== "function" ||
    typeof dependencies.codec
      ?.createUnsubscriptionMessage !== "function"
  ) {
    throw createConfigurationError(
      "BASE_WEBSOCKET_CODEC_REQUIRED",
      "Base WebSocket client requires a valid message codec.",
    );
  }
}

/**
 * Runtime type guard.
 */
export function isBaseExchangeWebSocketClient(
  value: unknown,
): value is BaseExchangeWebSocketClient {
  return value instanceof BaseExchangeWebSocketClient;
}

function validateDisconnectOptions(
  options: ExchangeWebSocketDisconnectOptions,
): void {
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) ||
      options.timeoutMs <= 0)
  ) {
    throw new ExchangeWebSocketError({
      category: "VALIDATION",
      code: "INVALID_WEBSOCKET_DISCONNECT_TIMEOUT",
      message:
        "Disconnect timeout must be a finite number greater than zero.",
      retryable: false,
      occurredAt: normalizeTimestamp(
        options.requestedAt,
      ),
    });
  }

  if (
    options.reason !== undefined &&
    !options.reason.trim()
  ) {
    throw new ExchangeWebSocketError({
      category: "VALIDATION",
      code: "INVALID_WEBSOCKET_DISCONNECT_REASON",
      message:
        "Disconnect reason must not be empty when provided.",
      retryable: false,
      occurredAt: normalizeTimestamp(
        options.requestedAt,
      ),
    });
  }
}

function validateOperationContext(
  context: ExchangeConnectorOperationContext,
): void {
  requireNonEmptyString(
    context.operationId,
    "context.operationId",
  );

  validateTimestamp(
    context.createdAt,
    "Operation context creation timestamp",
  );

  if (
    context.deadlineAt !== undefined &&
    context.deadlineAt < context.createdAt
  ) {
    throw new ExchangeWebSocketError({
      category: "VALIDATION",
      code: "INVALID_WEBSOCKET_CONTEXT_DEADLINE",
      message:
        "Operation context deadline must not precede creation time.",
      retryable: false,
      occurredAt: context.createdAt,
    });
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
): void {
  if (!value.trim()) {
    throw new ExchangeWebSocketError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateTimestamp(
  value: number,
  description: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ExchangeWebSocketError({
      category: "VALIDATION",
      code: "INVALID_WEBSOCKET_TIMESTAMP",
      message:
        `${description} must be finite and non-negative.`,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateChronology(
  startedAt: number,
  completedAt: number,
): void {
  if (completedAt < startedAt) {
    throw new ExchangeWebSocketError({
      category: "INTERNAL",
      code: "WEBSOCKET_COMPLETION_BEFORE_START",
      message:
        "WebSocket operation completion timestamp must not precede its start timestamp.",
      retryable: false,
      occurredAt: completedAt,
    });
  }
}

function freezeConfig(
  config: BaseExchangeWebSocketClientConfig,
): BaseExchangeWebSocketClientConfig {
  return Object.freeze({
    ...config,
    transport: Object.freeze({
      ...config.transport,
      endpoints: Object.freeze(
        config.transport.endpoints.map(
          (endpoint) =>
            Object.freeze({
              ...endpoint,
              protocols: endpoint.protocols
                ? Object.freeze([
                    ...endpoint.protocols,
                  ])
                : undefined,
              headers: endpoint.headers
                ? Object.freeze({
                    ...endpoint.headers,
                  })
                : undefined,
            }),
        ),
      ),
      reconnect: Object.freeze({
        ...config.transport.reconnect,
      }),
      heartbeat: Object.freeze({
        ...config.transport.heartbeat,
      }),
    }),
  });
}

function createConfigurationError(
  code: string,
  message: string,
): ExchangeWebSocketError {
  return new ExchangeWebSocketError({
    category: "CONFIGURATION",
    code,
    message,
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

  return "Unknown WebSocket failure.";
}