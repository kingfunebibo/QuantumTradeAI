/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Deterministic BaseExchangeWebSocketClient tests.
 *
 * Run with:
 * npx tsx src/trading/base-exchange-websocket-client.test.ts
 */

import assert from "node:assert/strict";

import {
  BaseExchangeWebSocketClient,
  ExchangeWebSocketError,
  isBaseExchangeWebSocketClient,
  validateBaseExchangeWebSocketClientConfig,
  validateBaseExchangeWebSocketClientDependencies,
  type BaseExchangeWebSocketAuthenticator,
  type BaseExchangeWebSocketClientConfig,
  type BaseExchangeWebSocketClock,
  type BaseExchangeWebSocketMessageCodec,
  type BaseExchangeWebSocketTransport,
  type BaseExchangeWebSocketTransportCallbacks,
  type BaseExchangeWebSocketTransportCloseRequest,
  type BaseExchangeWebSocketTransportSendRequest,
  type BaseExchangeWebSocketTransportSendResult,
  type BaseExchangeWebSocketTransportState,
  type ExchangeConnectorOperationContext,
  type ExchangeWebSocketConnectRequest,
  type ExchangeWebSocketEndpointConfig,
  type ExchangeWebSocketMessage,
  type ExchangeWebSocketSendRequest,
  type ExchangeWebSocketSubscriptionRequest,
  type ExchangeWebSocketSubscriptionSnapshot,
  type ExchangeWebSocketTransportConfig,
} from "./exchange-connectivity";

const BASE_TIMESTAMP = 1_700_000_000_000;

class ManualWebSocketClock implements BaseExchangeWebSocketClock {
  public constructor(private currentTime: number) {}

  public now(): number {
    return this.currentTime;
  }

  public advance(milliseconds: number): void {
    this.currentTime += milliseconds;
  }

  public set(timestamp: number): void {
    this.currentTime = timestamp;
  }
}

interface TestTransportBehavior {
  readonly connectFailure?: Error;
  readonly sendFailure?: Error;
  readonly closeFailure?: Error;
  readonly destroyFailure?: Error;
  readonly connectDurationMs?: number;
  readonly sendDurationMs?: number;
  readonly closeDurationMs?: number;
  readonly destroyDurationMs?: number;
  readonly accepted?: boolean;
  readonly bufferedAmount?: number;
  readonly emitOpenOnConnect?: boolean;
}

class TestWebSocketTransport
  implements BaseExchangeWebSocketTransport
{
  private state: BaseExchangeWebSocketTransportState =
    "CREATED";

  private callbacks?: BaseExchangeWebSocketTransportCallbacks;

  public connectCalls = 0;
  public sendCalls = 0;
  public closeCalls = 0;
  public destroyCalls = 0;

  public lastEndpoint?: ExchangeWebSocketEndpointConfig;
  public lastSendRequest?: BaseExchangeWebSocketTransportSendRequest;
  public lastCloseRequest?: BaseExchangeWebSocketTransportCloseRequest;

  public constructor(
    private readonly clock: ManualWebSocketClock,
    private readonly behavior: TestTransportBehavior = {},
  ) {}

  public getState(): BaseExchangeWebSocketTransportState {
    return this.state;
  }

  public async connect(
    endpoint: ExchangeWebSocketEndpointConfig,
    callbacks: BaseExchangeWebSocketTransportCallbacks,
  ): Promise<void> {
    this.connectCalls += 1;
    this.lastEndpoint = endpoint;
    this.callbacks = callbacks;
    this.state = "CONNECTING";

    this.clock.advance(
      this.behavior.connectDurationMs ?? 10,
    );

    if (this.behavior.connectFailure) {
      this.state = "FAILED";
      throw this.behavior.connectFailure;
    }

    this.state = "OPEN";

    if (this.behavior.emitOpenOnConnect !== false) {
      await callbacks.onOpen();
    }
  }

  public async send(
    request: BaseExchangeWebSocketTransportSendRequest,
  ): Promise<BaseExchangeWebSocketTransportSendResult> {
    this.sendCalls += 1;
    this.lastSendRequest = request;

    this.clock.advance(
      this.behavior.sendDurationMs ?? 5,
    );

    if (this.behavior.sendFailure) {
      throw this.behavior.sendFailure;
    }

    return Object.freeze({
      accepted: this.behavior.accepted ?? true,
      bufferedAmount:
        this.behavior.bufferedAmount ?? 0,
    });
  }

  public async close(
    request: BaseExchangeWebSocketTransportCloseRequest,
  ): Promise<void> {
    this.closeCalls += 1;
    this.lastCloseRequest = request;
    this.state = "CLOSING";

    this.clock.advance(
      this.behavior.closeDurationMs ?? 5,
    );

    if (this.behavior.closeFailure) {
      this.state = "FAILED";
      throw this.behavior.closeFailure;
    }

    this.state = "CLOSED";
  }

  public async destroy(): Promise<void> {
    this.destroyCalls += 1;

    this.clock.advance(
      this.behavior.destroyDurationMs ?? 5,
    );

    if (this.behavior.destroyFailure) {
      this.state = "FAILED";
      throw this.behavior.destroyFailure;
    }

    this.state = "CLOSED";
  }

  public getBufferedAmount(): number {
    return this.behavior.bufferedAmount ?? 0;
  }

  public async emitMessage(
    payload: string | Uint8Array,
  ): Promise<void> {
    assert.ok(this.callbacks);
    await this.callbacks.onMessage(payload);
  }

  public async emitError(error: unknown): Promise<void> {
    assert.ok(this.callbacks);
    await this.callbacks.onError(error);
  }

  public async emitClose(
    code?: number,
    reason?: string,
  ): Promise<void> {
    assert.ok(this.callbacks);
    this.state = "CLOSED";
    await this.callbacks.onClose(code, reason);
  }
}

class TestWebSocketCodec
  implements BaseExchangeWebSocketMessageCodec
{
  public encodeCalls = 0;
  public decodeCalls = 0;
  public subscriptionMessageCalls = 0;
  public unsubscriptionMessageCalls = 0;

  public encode(
    request: ExchangeWebSocketSendRequest,
  ): string | Uint8Array {
    this.encodeCalls += 1;

    return JSON.stringify({
      type: request.type,
      channel: request.channel,
      symbol: request.symbol,
      payload: request.payload,
    });
  }

  public decode(
    connectionId: string,
    payload: string | Uint8Array,
    receivedAt: number,
  ): ExchangeWebSocketMessage {
    this.decodeCalls += 1;

    const text =
      typeof payload === "string"
        ? payload
        : Buffer.from(payload).toString("utf8");

    const decoded = JSON.parse(text) as {
      readonly type?: ExchangeWebSocketMessage["type"];
      readonly channel?: string;
      readonly symbol?: string;
      readonly payload?: unknown;
    };

    return Object.freeze({
      messageId: `inbound-${this.decodeCalls}`,
      connectionId,
      direction: "INBOUND",
      type: decoded.type ?? "DATA",
      encoding: "JSON",
      timestamp: receivedAt,
      payload:
        decoded.payload === undefined
          ? Object.freeze({})
          : (decoded.payload as ExchangeWebSocketMessage["payload"]),
      channel: decoded.channel,
      symbol: decoded.symbol,
    });
  }

  public createSubscriptionMessage(
    request: ExchangeWebSocketSubscriptionRequest,
  ): ExchangeWebSocketSendRequest {
    this.subscriptionMessageCalls += 1;

    return Object.freeze({
      messageId: `subscribe-${request.subscriptionId}`,
      type: "SUBSCRIBE",
      encoding: "JSON",
      payload: Object.freeze({
        channel: request.channel,
        symbols: request.symbols ?? [],
      }),
      channel: request.channel,
      context: request.context,
    });
  }

  public createUnsubscriptionMessage(
    subscription: ExchangeWebSocketSubscriptionSnapshot,
    context: ExchangeConnectorOperationContext,
  ): ExchangeWebSocketSendRequest {
    this.unsubscriptionMessageCalls += 1;

    return Object.freeze({
      messageId: `unsubscribe-${subscription.subscriptionId}`,
      type: "UNSUBSCRIBE",
      encoding: "JSON",
      payload: Object.freeze({
        channel: subscription.channel,
        symbols: subscription.symbols,
      }),
      channel: subscription.channel,
      context,
    });
  }
}

class TestAuthenticator
  implements BaseExchangeWebSocketAuthenticator
{
  public calls = 0;

  public constructor(
    private readonly failure?: Error,
  ) {}

  public async authenticate(
    _connectionId: string,
    _context: ExchangeConnectorOperationContext,
  ): Promise<void> {
    this.calls += 1;

    if (this.failure) {
      throw this.failure;
    }
  }
}

class TestableBaseExchangeWebSocketClient
  extends BaseExchangeWebSocketClient
{
  public exposeRecordPingSent(sentAt: number): void {
    this.recordPingSent(sentAt);
  }

  public exposeRecordPongReceived(
    receivedAt: number,
  ): void {
    this.recordPongReceived(receivedAt);
  }

  public exposeRecordHeartbeatTimeout(
    occurredAt: number,
  ): void {
    this.recordHeartbeatTimeout(occurredAt);
  }

  public exposeRecordReconnectAttempt(
    attemptCount: number,
    attemptedAt: number,
    nextAttemptAt?: number,
  ): void {
    this.recordReconnectAttempt(
      attemptCount,
      attemptedAt,
      nextAttemptAt,
    );
  }
}

function createOperationContext(
  operationId = "operation-1",
): ExchangeConnectorOperationContext {
  return Object.freeze({
    operationId,
    correlationId: "correlation-1",
    createdAt: BASE_TIMESTAMP,
    deadlineAt: BASE_TIMESTAMP + 60_000,
  });
}

function createTransportConfig(): ExchangeWebSocketTransportConfig {
  return Object.freeze({
    enabled: true,
    endpoints: Object.freeze([
      Object.freeze({
        type: "PUBLIC",
        url: "wss://stream.test.exchange/public",
        authenticated: false,
        protocols: Object.freeze(["json"]),
        headers: Object.freeze({
          "X-TEST": "public",
        }),
      }),
      Object.freeze({
        type: "PRIVATE",
        url: "wss://stream.test.exchange/private",
        authenticated: true,
      }),
    ]),
    reconnect: Object.freeze({
      enabled: true,
      maximumAttempts: 3,
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      backoffMultiplier: 2,
      jitterRatio: 0,
      stableConnectionThresholdMs: 60_000,
    }),
    heartbeat: Object.freeze({
      enabled: true,
      intervalMs: 30_000,
      responseTimeoutMs: 5_000,
      pingPayload: "ping",
      expectedPongPayload: "pong",
    }),
    maximumMessageSizeBytes: 1_000_000,
    maximumBufferedMessages: 1_000,
  });
}

function createConfig(
  overrides: Partial<BaseExchangeWebSocketClientConfig> = {},
): BaseExchangeWebSocketClientConfig {
  return Object.freeze({
    transport: createTransportConfig(),
    readyOnOpen: true,
    restoreSubscriptionsOnReconnect: true,
    ...overrides,
  });
}

function createConnectRequest(
  overrides: Partial<ExchangeWebSocketConnectRequest> = {},
): ExchangeWebSocketConnectRequest {
  return Object.freeze({
    connectionId: "connection-1",
    endpointType: "PUBLIC",
    authenticated: false,
    timeoutMs: 10_000,
    context: createOperationContext(),
    ...overrides,
  });
}

function createSendRequest(
  overrides: Partial<ExchangeWebSocketSendRequest> = {},
): ExchangeWebSocketSendRequest {
  return Object.freeze({
    messageId: "message-1",
    type: "DATA",
    encoding: "JSON",
    payload: Object.freeze({
      action: "test",
    }),
    channel: "tickers",
    symbol: "BTCUSDT",
    timeoutMs: 5_000,
    context: createOperationContext(),
    ...overrides,
  });
}

function createSubscriptionRequest(
  overrides: Partial<ExchangeWebSocketSubscriptionRequest> = {},
): ExchangeWebSocketSubscriptionRequest {
  return Object.freeze({
    subscriptionId: "subscription-1",
    channel: "tickers",
    symbols: Object.freeze(["BTCUSDT", "ETHUSDT"]),
    authenticated: false,
    context: createOperationContext(),
    ...overrides,
  });
}

function createClient(
  clock: ManualWebSocketClock,
  transport: BaseExchangeWebSocketTransport,
  codec: BaseExchangeWebSocketMessageCodec,
  authenticator?: BaseExchangeWebSocketAuthenticator,
): TestableBaseExchangeWebSocketClient {
  return new TestableBaseExchangeWebSocketClient(
    createConfig(),
    {
      clock,
      transport,
      codec,
      authenticator,
    },
  );
}

function testConstructionAndInitialSnapshots(): void {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  assert.equal(
    isBaseExchangeWebSocketClient(client),
    true,
  );

  const state = client.getState();
  const metrics = client.getMetrics();
  const heartbeat = client.getHeartbeat();
  const reconnect = client.getReconnectState();

  assert.equal(state.state, "CREATED");
  assert.equal(state.revision, 1);
  assert.equal(state.changedAt, BASE_TIMESTAMP);

  assert.equal(metrics.totalConnections, 0);
  assert.equal(metrics.totalMessagesSent, 0);
  assert.equal(metrics.totalMessagesReceived, 0);

  assert.equal(heartbeat.enabled, true);
  assert.equal(heartbeat.awaitingPong, false);
  assert.equal(heartbeat.missedHeartbeatCount, 0);

  assert.equal(reconnect.enabled, true);
  assert.equal(reconnect.maximumAttempts, 3);
  assert.equal(reconnect.exhausted, false);

  assert.deepEqual(client.getSubscriptions(), []);
}

function testConfigurationValidation(): void {
  assert.doesNotThrow(() =>
    validateBaseExchangeWebSocketClientConfig(
      createConfig(),
    ),
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          enabled: false,
        },
      }),
    ExchangeWebSocketError,
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          endpoints: [],
        },
      }),
    ExchangeWebSocketError,
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          endpoints: [
            createTransportConfig().endpoints[0],
            createTransportConfig().endpoints[0],
          ],
        },
      }),
    ExchangeWebSocketError,
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          maximumBufferedMessages: 0,
        },
      }),
    ExchangeWebSocketError,
  );
}

function testDependencyValidation(): void {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();

  assert.doesNotThrow(() =>
    validateBaseExchangeWebSocketClientDependencies({
      clock,
      transport,
      codec,
    }),
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientDependencies({
        clock: undefined as unknown as BaseExchangeWebSocketClock,
        transport,
        codec,
      }),
    ExchangeWebSocketError,
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientDependencies({
        clock,
        transport: undefined as unknown as BaseExchangeWebSocketTransport,
        codec,
      }),
    ExchangeWebSocketError,
  );

  assert.throws(
    () =>
      validateBaseExchangeWebSocketClientDependencies({
        clock,
        transport,
        codec: undefined as unknown as BaseExchangeWebSocketMessageCodec,
      }),
    ExchangeWebSocketError,
  );
}

async function testPublicConnection(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock, {
    connectDurationMs: 20,
  });
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  const result = await client.connect(
    createConnectRequest(),
  );

  assert.equal(result.previousState, "CREATED");
  assert.equal(result.currentState, "READY");
  assert.equal(result.changed, true);
  assert.equal(result.authenticated, false);
  assert.equal(
    result.connectedAt,
    BASE_TIMESTAMP + 20,
  );

  assert.equal(transport.connectCalls, 1);
  assert.equal(
    transport.lastEndpoint?.type,
    "PUBLIC",
  );

  const state = client.getState();
  const metrics = client.getMetrics();

  assert.equal(state.state, "READY");
  assert.equal(state.connectionId, "connection-1");
  assert.equal(metrics.totalConnections, 1);
  assert.equal(metrics.successfulConnections, 1);
  assert.equal(metrics.failedConnections, 0);
}

async function testIdempotentConnection(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  const revision = client.getState().revision;
  const result = await client.connect(
    createConnectRequest(),
  );

  assert.equal(result.changed, false);
  assert.equal(result.currentState, "READY");
  assert.equal(result.revision, revision);
  assert.equal(transport.connectCalls, 1);
}

async function testDifferentConnectionIdRejected(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  await assert.rejects(
    async () =>
      client.connect(
        createConnectRequest({
          connectionId: "connection-2",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(
        error.code,
        "WEBSOCKET_ALREADY_CONNECTED",
      );
      return true;
    },
  );
}

async function testAuthenticatedConnection(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const authenticator = new TestAuthenticator();

  const client = createClient(
    clock,
    transport,
    codec,
    authenticator,
  );

  const result = await client.connect(
    createConnectRequest({
      endpointType: "PRIVATE",
      authenticated: true,
    }),
  );

  assert.equal(result.currentState, "READY");
  assert.equal(result.authenticated, true);
  assert.equal(authenticator.calls, 1);
}

async function testMissingAuthenticator(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await assert.rejects(
    async () =>
      client.connect(
        createConnectRequest({
          endpointType: "PRIVATE",
          authenticated: true,
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(
        error.code,
        "WEBSOCKET_AUTHENTICATOR_REQUIRED",
      );
      return true;
    },
  );

  assert.equal(client.getState().state, "FAILED");
}

async function testConnectionFailure(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock, {
    connectFailure: new Error(
      "Network connection failure.",
    ),
  });
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await assert.rejects(
    async () => client.connect(createConnectRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(error.category, "NETWORK");
      assert.equal(error.retryable, true);
      return true;
    },
  );

  assert.equal(client.getState().state, "FAILED");
  assert.equal(
    client.getMetrics().failedConnections,
    1,
  );
}

async function testSuccessfulSend(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock, {
    sendDurationMs: 7,
    bufferedAmount: 12,
  });
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  const result = await client.send(
    createSendRequest(),
  );

  assert.equal(result.accepted, true);
  assert.equal(result.connectionId, "connection-1");
  assert.equal(result.messageId, "message-1");
  assert.equal(result.bufferedAmount, 12);

  assert.equal(codec.encodeCalls, 1);
  assert.equal(transport.sendCalls, 1);
  assert.equal(
    transport.lastSendRequest?.messageId,
    "message-1",
  );

  const metrics = client.getMetrics();

  assert.equal(metrics.totalMessagesSent, 1);
  assert.equal(metrics.failedMessages, 0);
}

async function testRejectedSendResult(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock, {
    accepted: false,
  });
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  const result = await client.send(
    createSendRequest(),
  );

  assert.equal(result.accepted, false);
  assert.equal(
    client.getMetrics().failedMessages,
    1,
  );
}

async function testSendBeforeConnection(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await assert.rejects(
    async () => client.send(createSendRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(
        error.code,
        "WEBSOCKET_CLIENT_NOT_READY",
      );
      return true;
    },
  );
}

async function testSendFailure(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock, {
    sendFailure: new Error("Network send failure."),
  });
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  await assert.rejects(
    async () => client.send(createSendRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(error.category, "NETWORK");
      assert.equal(error.retryable, true);
      return true;
    },
  );

  assert.equal(
    client.getMetrics().failedMessages,
    1,
  );
}

async function testSubscriptionLifecycle(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  const observedStates: string[] = [];

  client.onSubscriptionChanged((snapshot) => {
    observedStates.push(snapshot.state);
  });

  await client.connect(createConnectRequest());

  const result = await client.subscribe(
    createSubscriptionRequest(),
  );

  assert.equal(result.previousState, "INACTIVE");
  assert.equal(result.currentState, "ACTIVE");
  assert.equal(result.changed, true);

  assert.deepEqual(observedStates, [
    "PENDING",
    "ACTIVE",
  ]);

  const subscriptions = client.getSubscriptions();

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].state, "ACTIVE");
  assert.equal(codec.subscriptionMessageCalls, 1);
  assert.equal(
    client.getMetrics().activeSubscriptions,
    1,
  );

  const duplicateResult = await client.subscribe(
    createSubscriptionRequest(),
  );

  assert.equal(duplicateResult.changed, false);
  assert.equal(
    codec.subscriptionMessageCalls,
    1,
  );
}

async function testAuthenticatedSubscriptionRejected(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  await assert.rejects(
    async () =>
      client.subscribe(
        createSubscriptionRequest({
          authenticated: true,
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(
        error.code,
        "AUTHENTICATED_SUBSCRIPTION_REQUIRES_LOGIN",
      );
      return true;
    },
  );
}

async function testUnsubscribeLifecycle(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());
  await client.subscribe(
    createSubscriptionRequest(),
  );

  const result = await client.unsubscribe(
    "subscription-1",
    createOperationContext("unsubscribe-operation"),
  );

  assert.equal(result.previousState, "ACTIVE");
  assert.equal(result.currentState, "INACTIVE");
  assert.equal(result.changed, true);
  assert.equal(
    codec.unsubscriptionMessageCalls,
    1,
  );
  assert.equal(
    client.getSubscriptions()[0].state,
    "INACTIVE",
  );

  const missingResult = await client.unsubscribe(
    "missing-subscription",
    createOperationContext("missing-unsubscribe"),
  );

  assert.equal(missingResult.changed, false);
  assert.equal(
    missingResult.currentState,
    "INACTIVE",
  );
}

async function testInboundMessageAndListeners(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  const messages: ExchangeWebSocketMessage[] = [];

  const removeListener = client.onMessage((message) => {
    messages.push(message);
  });

  await client.connect(createConnectRequest());

  clock.advance(25);

  await transport.emitMessage(
    JSON.stringify({
      type: "DATA",
      channel: "tickers",
      symbol: "BTCUSDT",
      payload: {
        price: 50_000,
      },
    }),
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].channel, "tickers");
  assert.equal(messages[0].symbol, "BTCUSDT");

  const metrics = client.getMetrics();

  assert.equal(metrics.totalMessagesReceived, 1);
  assert.equal(
    metrics.lastMessageReceivedAt,
    BASE_TIMESTAMP + 35,
  );

  removeListener();

  await transport.emitMessage(
    JSON.stringify({
      type: "DATA",
      payload: {},
    }),
  );

  assert.equal(messages.length, 1);
}

async function testPongHeartbeatHandling(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  client.exposeRecordPingSent(
    BASE_TIMESTAMP + 20,
  );

  assert.equal(
    client.getHeartbeat().awaitingPong,
    true,
  );

  clock.set(BASE_TIMESTAMP + 50);

  await transport.emitMessage(
    JSON.stringify({
      type: "PONG",
      payload: "pong",
    }),
  );

  const heartbeat = client.getHeartbeat();

  assert.equal(heartbeat.awaitingPong, false);
  assert.equal(
    heartbeat.lastPongReceivedAt,
    BASE_TIMESTAMP + 50,
  );
  assert.equal(heartbeat.lastRoundTripTimeMs, 30);

  client.exposeRecordHeartbeatTimeout(
    BASE_TIMESTAMP + 60,
  );

  assert.equal(
    client.getHeartbeat().missedHeartbeatCount,
    1,
  );
  assert.equal(
    client.getMetrics().heartbeatTimeouts,
    1,
  );
}

function testReconnectTracking(): void {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  client.exposeRecordReconnectAttempt(
    1,
    BASE_TIMESTAMP + 100,
    BASE_TIMESTAMP + 1_100,
  );

  let reconnect = client.getReconnectState();

  assert.equal(reconnect.reconnecting, true);
  assert.equal(reconnect.attemptCount, 1);
  assert.equal(reconnect.exhausted, false);
  assert.equal(
    client.getState().state,
    "RECONNECTING",
  );

  client.exposeRecordReconnectAttempt(
    3,
    BASE_TIMESTAMP + 200,
  );

  reconnect = client.getReconnectState();

  assert.equal(reconnect.exhausted, true);
  assert.equal(
    client.getMetrics().reconnectionAttempts,
    2,
  );

  assert.throws(
    () =>
      client.exposeRecordReconnectAttempt(
        0,
        BASE_TIMESTAMP + 300,
      ),
    ExchangeWebSocketError,
  );
}

async function testDisconnectFromCreatedState(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  const result = await client.disconnect({
    reason: "No connection required.",
  });

  assert.equal(result.previousState, "CREATED");
  assert.equal(result.currentState, "DISCONNECTED");
  assert.equal(result.changed, true);
  assert.equal(
    client.getState().state,
    "DISCONNECTED",
  );
  assert.equal(transport.closeCalls, 0);
}

async function testDisconnectActiveConnection(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock, {
    closeDurationMs: 15,
  });
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());
  await client.subscribe(
    createSubscriptionRequest(),
  );

  const result = await client.disconnect({
    graceful: true,
    timeoutMs: 5_000,
    reason: "Deterministic shutdown.",
  });

  assert.equal(result.previousState, "READY");
  assert.equal(result.currentState, "DISCONNECTED");
  assert.equal(result.changed, true);

  assert.equal(transport.closeCalls, 1);
  assert.equal(
    transport.lastCloseRequest?.graceful,
    true,
  );

  assert.equal(
    client.getSubscriptions()[0].state,
    "INACTIVE",
  );
}

async function testRemoteClose(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  clock.advance(20);

  await transport.emitClose(
    1000,
    "Remote close.",
  );

  assert.equal(
    client.getState().state,
    "DISCONNECTED",
  );
  assert.equal(
    client.getState().reason,
    "Remote close.",
  );
}

async function testDestroy(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  await client.connect(createConnectRequest());

  const result = await client.destroy({
    reason: "Client no longer required.",
  });

  assert.equal(result.currentState, "DESTROYED");
  assert.equal(result.changed, true);
  assert.equal(transport.closeCalls, 1);
  assert.equal(transport.destroyCalls, 1);

  const idempotent = await client.destroy();

  assert.equal(idempotent.changed, false);
  assert.equal(
    idempotent.currentState,
    "DESTROYED",
  );

  await assert.rejects(
    async () => client.connect(createConnectRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeWebSocketError);
      assert.equal(
        error.code,
        "WEBSOCKET_CLIENT_DESTROYED",
      );
      return true;
    },
  );
}

async function testErrorListener(): Promise<void> {
  const clock = new ManualWebSocketClock(
    BASE_TIMESTAMP,
  );
  const transport = new TestWebSocketTransport(clock);
  const codec = new TestWebSocketCodec();
  const client = createClient(clock, transport, codec);

  const errors: ExchangeWebSocketError[] = [];

  client.onError((error) => {
    errors.push(error);
  });

  await client.connect(createConnectRequest());

  await transport.emitError(
    new Error("Network socket failure."),
  );

  assert.equal(errors.length, 1);
  assert.equal(errors[0].category, "NETWORK");
}

async function runTests(): Promise<void> {
  testConstructionAndInitialSnapshots();
  testConfigurationValidation();
  testDependencyValidation();
  testReconnectTracking();

  await testPublicConnection();
  await testIdempotentConnection();
  await testDifferentConnectionIdRejected();
  await testAuthenticatedConnection();
  await testMissingAuthenticator();
  await testConnectionFailure();
  await testSuccessfulSend();
  await testRejectedSendResult();
  await testSendBeforeConnection();
  await testSendFailure();
  await testSubscriptionLifecycle();
  await testAuthenticatedSubscriptionRejected();
  await testUnsubscribeLifecycle();
  await testInboundMessageAndListeners();
  await testPongHeartbeatHandling();
  await testDisconnectFromCreatedState();
  await testDisconnectActiveConnection();
  await testRemoteClose();
  await testDestroy();
  await testErrorListener();

  console.log(
    "All base exchange WebSocket client tests passed successfully.",
  );
}

runTests().catch((error: unknown) => {
  console.error(
    "Base exchange WebSocket client tests failed.",
    error,
  );

  process.exitCode = 1;
});