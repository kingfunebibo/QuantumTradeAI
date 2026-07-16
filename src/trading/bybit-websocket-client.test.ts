import assert from "node:assert/strict";

import {
  BybitWebSocketClient,
  BybitWebSocketError,
  SequentialBybitRequestIdGenerator,
  normalizeTopics,
  resolveWebSocketUrl,
  type BybitWebSocketTransport,
  type BybitWebSocketTransportHandlers,
  type BybitWebSocketReadyState,
} from "./exchange-connectivity/adapters/bybit/bybit-websocket-client";

import {
  FixedBybitClock,
} from "./exchange-connectivity/adapters/bybit/bybit-authentication";

import {
  createBybitConnectorConfiguration,
} from "./exchange-connectivity/adapters/bybit/bybit-connector-config";

const FIXED_TIMESTAMP =
  1_700_000_000_000;

class FakeWebSocketTransport
  implements BybitWebSocketTransport {
  public connectedUrl:
    string | undefined;

  public handlers:
    BybitWebSocketTransportHandlers | undefined;

  public readonly sent:
    string[] = [];

  public closeCode:
    number | undefined;

  public closeReason:
    string | undefined;

  private readyState:
    BybitWebSocketReadyState =
      "CLOSED";

  public connect(
    url: string,
    handlers:
      BybitWebSocketTransportHandlers,
  ): void {
    this.connectedUrl = url;
    this.handlers = handlers;
    this.readyState = "CONNECTING";
  }

  public send(data: string): void {
    if (this.readyState !== "OPEN") {
      throw new Error(
        "Transport is not open.",
      );
    }

    this.sent.push(data);
  }

  public close(
    code?: number,
    reason?: string,
  ): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = "CLOSING";
  }

  public getReadyState():
    BybitWebSocketReadyState {
    return this.readyState;
  }

  public emitOpen(): void {
    this.readyState = "OPEN";
    this.handlers?.onOpen();
  }

  public emitMessage(
    message: unknown,
  ): void {
    this.handlers?.onMessage(
      typeof message === "string"
        ? message
        : JSON.stringify(message),
    );
  }

  public emitClose(
    code: number,
    reason: string,
  ): void {
    this.readyState = "CLOSED";
    this.handlers?.onClose(
      code,
      reason,
    );
  }

  public emitError(
    error: unknown,
  ): void {
    this.handlers?.onError(error);
  }
}

class ThrowingConnectTransport
  extends FakeWebSocketTransport {
  public override connect(): void {
    throw new Error(
      "Simulated connect failure.",
    );
  }
}

class ThrowingCloseTransport
  extends FakeWebSocketTransport {
  public override close(): void {
    throw new Error(
      "Simulated close failure.",
    );
  }
}

function createPublicConfig() {
  return createBybitConnectorConfiguration({
    bybitEnvironment: "TESTNET",
  });
}

function createPrivateConfig() {
  return createBybitConnectorConfiguration({
    bybitEnvironment: "TESTNET",
    credentials: {
      apiKey: "test-api-key",
      secretKey:
        "test-secret-key",
      signatureAlgorithm:
        "HMAC_SHA256",
    },
    enablePrivateWebSocket:
      true,
  });
}

function testUrlResolution(): void {
  const config =
    createPublicConfig();

  assert.equal(
    resolveWebSocketUrl(
      config,
      {
        mode: "PUBLIC",
        category: "SPOT",
      },
    ),
    "wss://stream-testnet.bybit.com/v5/public/spot",
  );

  assert.equal(
    resolveWebSocketUrl(
      config,
      {
        mode: "PUBLIC",
        category: "LINEAR",
      },
    ),
    "wss://stream-testnet.bybit.com/v5/public/linear",
  );

  const privateConfig =
    createPrivateConfig();

  assert.equal(
    resolveWebSocketUrl(
      privateConfig,
      {
        mode: "PRIVATE",
      },
    ),
    "wss://stream-testnet.bybit.com/v5/private",
  );

  assert.equal(
    resolveWebSocketUrl(
      privateConfig,
      {
        mode: "TRADE",
      },
    ),
    "wss://stream-testnet.bybit.com/v5/trade",
  );
}

function testRequestIdGenerator(): void {
  const generator =
    new SequentialBybitRequestIdGenerator(
      "test",
    );

  assert.equal(
    generator.next(),
    "test-000001",
  );

  assert.equal(
    generator.next(),
    "test-000002",
  );
}

function testTopicNormalization(): void {
  assert.deepEqual(
    normalizeTopics([
      "tickers.BTCUSDT",
      "orderbook.1.BTCUSDT",
      "tickers.BTCUSDT",
    ]),
    [
      "orderbook.1.BTCUSDT",
      "tickers.BTCUSDT",
    ],
  );

  assert.equal(
    Object.isFrozen(
      normalizeTopics([
        "tickers.BTCUSDT",
      ]),
    ),
    true,
  );
}

function testPublicConnection(): void {
  const transport =
    new FakeWebSocketTransport();

  const states: string[] = [];
  let opened = false;

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
      {
        onOpen: () => {
          opened = true;
        },
        onStateChange:
          (snapshot) => {
            states.push(
              snapshot.state,
            );
          },
      },
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  client.connect();

  assert.equal(
    transport.connectedUrl,
    "wss://stream-testnet.bybit.com/v5/public/spot",
  );

  assert.equal(
    client.getSnapshot().state,
    "CONNECTING",
  );

  transport.emitOpen();

  assert.equal(opened, true);

  assert.equal(
    client.getSnapshot().state,
    "OPEN",
  );

  assert.equal(
    client.getSnapshot().authenticated,
    false,
  );

  assert.deepEqual(
    states,
    [
      "CONNECTING",
      "OPEN",
    ],
  );

  client.disconnect();

  assert.equal(
    transport.closeCode,
    1000,
  );

  assert.equal(
    transport.closeReason,
    "Client disconnect",
  );
}

function testSubscriptionLifecycle(): void {
  const transport =
    new FakeWebSocketTransport();

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
      {},
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
      new SequentialBybitRequestIdGenerator(
        "req",
      ),
    );

  client.connect();
  transport.emitOpen();

  const subscribeId =
    client.subscribe([
      "tickers.BTCUSDT",
      "orderbook.1.BTCUSDT",
    ]);

  assert.equal(
    subscribeId,
    "req-000001",
  );

  assert.deepEqual(
    JSON.parse(
      transport.sent[0] ?? "",
    ),
    {
      req_id: "req-000001",
      op: "subscribe",
      args: [
        "orderbook.1.BTCUSDT",
        "tickers.BTCUSDT",
      ],
    },
  );

  assert.deepEqual(
    client.getSnapshot()
      .subscriptions,
    [
      "orderbook.1.BTCUSDT",
      "tickers.BTCUSDT",
    ],
  );

  const unsubscribeId =
    client.unsubscribe([
      "tickers.BTCUSDT",
    ]);

  assert.equal(
    unsubscribeId,
    "req-000002",
  );

  assert.deepEqual(
    JSON.parse(
      transport.sent[1] ?? "",
    ),
    {
      req_id: "req-000002",
      op: "unsubscribe",
      args: [
        "tickers.BTCUSDT",
      ],
    },
  );

  assert.deepEqual(
    client.getSnapshot()
      .subscriptions,
    [
      "orderbook.1.BTCUSDT",
    ],
  );

  client.disconnect();
}

function testHeartbeatMessage(): void {
  const transport =
    new FakeWebSocketTransport();

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
      {},
      undefined,
      new SequentialBybitRequestIdGenerator(
        "ping",
      ),
    );

  client.connect();
  transport.emitOpen();

  const requestId =
    client.sendHeartbeat();

  assert.equal(
    requestId,
    "ping-000001",
  );

  assert.deepEqual(
    JSON.parse(
      transport.sent[0] ?? "",
    ),
    {
      req_id: "ping-000001",
      op: "ping",
    },
  );

  client.disconnect();
}

function testPrivateAuthentication(): void {
  const transport =
    new FakeWebSocketTransport();

  let authenticated = false;

  const client =
    new BybitWebSocketClient(
      createPrivateConfig(),
      transport,
      {
        mode: "PRIVATE",
        heartbeatIntervalMs:
          60_000,
      },
      {
        onAuthenticated:
          () => {
            authenticated = true;
          },
      },
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  client.connect();
  transport.emitOpen();

  const authMessage =
    JSON.parse(
      transport.sent[0] ?? "",
    ) as {
      readonly op: string;
      readonly args:
        readonly [
          string,
          number,
          string,
        ];
    };

  assert.equal(
    authMessage.op,
    "auth",
  );

  assert.equal(
    authMessage.args[0],
    "test-api-key",
  );

  assert.equal(
    authMessage.args[1],
    1_700_000_010_000,
  );

  assert.equal(
    client.getSnapshot().state,
    "AUTHENTICATING",
  );

  transport.emitMessage({
    op: "auth",
    success: true,
  });

  assert.equal(
    authenticated,
    true,
  );

  assert.equal(
    client.getSnapshot()
      .authenticated,
    true,
  );

  assert.equal(
    client.getSnapshot().state,
    "OPEN",
  );

  client.disconnect();
}

function testTradeRequest(): void {
  const transport =
    new FakeWebSocketTransport();

  const client =
    new BybitWebSocketClient(
      createPrivateConfig(),
      transport,
      {
        mode: "TRADE",
        autoAuthenticate: false,
        heartbeatIntervalMs:
          60_000,
      },
      {},
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
      new SequentialBybitRequestIdGenerator(
        "trade",
      ),
    );

  client.connect();
  transport.emitOpen();

  const requestId =
    client.sendTradeRequest(
      "order.create",
      [
        {
          category: "spot",
          symbol: "BTCUSDT",
          side: "Buy",
          orderType: "Market",
          qty: "1",
        },
      ],
    );

  assert.equal(
    requestId,
    "trade-000001",
  );

  const sent =
    JSON.parse(
      transport.sent[0] ?? "",
    ) as {
      readonly reqId: string;
      readonly header:
        Readonly<
          Record<string, string>
        >;
      readonly op: string;
      readonly args:
        readonly unknown[];
    };

  assert.equal(
    sent.reqId,
    "trade-000001",
  );

  assert.equal(
    sent.op,
    "order.create",
  );

  assert.equal(
    sent.header[
      "X-BAPI-API-KEY"
    ],
    "test-api-key",
  );

  assert.equal(
    sent.header[
      "X-BAPI-TIMESTAMP"
    ],
    "1700000000000",
  );

  assert.equal(
    sent.args.length,
    1,
  );

  client.disconnect();
}

function testMessageForwarding(): void {
  const transport =
    new FakeWebSocketTransport();

  const messages:
    unknown[] = [];

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
      {
        onMessage: (event) => {
          messages.push(
            event.message,
          );
        },
      },
    );

  client.connect();
  transport.emitOpen();

  transport.emitMessage({
    topic: "tickers.BTCUSDT",
    type: "snapshot",
    data: {
      lastPrice: "50000",
    },
  });

  assert.equal(
    messages.length,
    1,
  );

  assert.deepEqual(
    messages[0],
    {
      topic:
        "tickers.BTCUSDT",
      type: "snapshot",
      data: {
        lastPrice: "50000",
      },
    },
  );

  client.disconnect();
}

function testProtocolErrors(): void {
  const transport =
    new FakeWebSocketTransport();

  const errors:
    BybitWebSocketError[] = [];

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
      {
        onError: (error) => {
          errors.push(error);
        },
      },
    );

  client.connect();
  transport.emitOpen();

  transport.emitMessage(
    "{not-json}",
  );

  transport.emitMessage(
    [],
  );

  assert.equal(
    errors[0]?.code,
    "BYBIT_WS_MESSAGE_JSON_INVALID",
  );

  assert.equal(
    errors[1]?.code,
    "BYBIT_WS_MESSAGE_INVALID",
  );

  client.disconnect();
}

function testAuthenticationRejected(): void {
  const transport =
    new FakeWebSocketTransport();

  const errors:
    BybitWebSocketError[] = [];

  const client =
    new BybitWebSocketClient(
      createPrivateConfig(),
      transport,
      {
        mode: "PRIVATE",
        heartbeatIntervalMs:
          60_000,
      },
      {
        onError: (error) => {
          errors.push(error);
        },
      },
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  client.connect();
  transport.emitOpen();

  transport.emitMessage({
    op: "auth",
    success: false,
    retMsg:
      "Authentication failed",
  });

  assert.equal(
    client.getSnapshot().state,
    "FAILED",
  );

  assert.equal(
    errors[0]?.code,
    "BYBIT_WS_AUTHENTICATION_REJECTED",
  );

  assert.equal(
    errors[0]?.message,
    "Authentication failed",
  );
}

function testReconnectState(): void {
  const transport =
    new FakeWebSocketTransport();

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
        reconnectEnabled: true,
        maximumReconnectAttempts: 2,
      },
    );

  client.connect();
  transport.emitOpen();

  transport.emitClose(
    1006,
    "Abnormal closure",
  );

  assert.equal(
    client.getSnapshot().state,
    "RECONNECTING",
  );

  assert.equal(
    client.getSnapshot()
      .reconnectAttempts,
    1,
  );

  client.connect();

  assert.equal(
    client.getSnapshot().state,
    "RECONNECTING",
  );
}

function testTransportErrorForwarding(): void {
  const transport =
    new FakeWebSocketTransport();

  const errors:
    BybitWebSocketError[] = [];

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
      {
        onError: (error) => {
          errors.push(error);
        },
      },
    );

  client.connect();

  transport.emitError(
    new Error("socket failure"),
  );

  assert.equal(
    errors[0]?.kind,
    "TRANSPORT",
  );

  assert.equal(
    errors[0]?.code,
    "BYBIT_WS_TRANSPORT_ERROR",
  );
}

function testInvalidUsage(): void {
  assert.throws(
    () =>
      resolveWebSocketUrl(
        createPublicConfig(),
        {
          mode: "PUBLIC",
        },
      ),
    (error: unknown) =>
      isWebSocketError(
        error,
        "VALIDATION",
        "BYBIT_WS_PUBLIC_CATEGORY_REQUIRED",
      ),
  );

  assert.throws(
    () => normalizeTopics([]),
    (error: unknown) =>
      isWebSocketError(
        error,
        "VALIDATION",
        "BYBIT_WS_TOPICS_REQUIRED",
      ),
  );

  const transport =
    new FakeWebSocketTransport();

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
    );

  assert.throws(
    () =>
      client.subscribe([
        "tickers.BTCUSDT",
      ]),
    (error: unknown) =>
      isWebSocketError(
        error,
        "STATE",
        "BYBIT_WS_NOT_OPEN",
      ),
  );

  client.connect();

  assert.throws(
    () => client.connect(),
    (error: unknown) =>
      isWebSocketError(
        error,
        "STATE",
        "BYBIT_WS_ALREADY_ACTIVE",
      ),
  );
}

function testConnectFailure(): void {
  const errors:
    BybitWebSocketError[] = [];

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      new ThrowingConnectTransport(),
      {
        mode: "PUBLIC",
        category: "SPOT",
      },
      {
        onError: (error) => {
          errors.push(error);
        },
      },
    );

  assert.throws(
    () => client.connect(),
    (error: unknown) =>
      isWebSocketError(
        error,
        "TRANSPORT",
        "BYBIT_WS_CONNECT_FAILED",
      ),
  );

  assert.equal(
    client.getSnapshot().state,
    "FAILED",
  );

  assert.equal(
    errors.length,
    1,
  );
}

function testCloseFailure(): void {
  const transport =
    new ThrowingCloseTransport();

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
    );

  client.connect();
  transport.emitOpen();

  assert.throws(
    () => client.disconnect(),
    (error: unknown) =>
      isWebSocketError(
        error,
        "TRANSPORT",
        "BYBIT_WS_CLOSE_FAILED",
      ),
  );

  assert.equal(
    client.getSnapshot().state,
    "FAILED",
  );
}

function testSnapshotImmutability(): void {
  const transport =
    new FakeWebSocketTransport();

  const client =
    new BybitWebSocketClient(
      createPublicConfig(),
      transport,
      {
        mode: "PUBLIC",
        category: "SPOT",
        heartbeatIntervalMs:
          60_000,
      },
    );

  const snapshot =
    client.getSnapshot();

  assert.equal(
    Object.isFrozen(snapshot),
    true,
  );

  assert.equal(
    Object.isFrozen(
      snapshot.subscriptions,
    ),
    true,
  );
}

function testErrorIdentity(): void {
  const cause =
    new Error("cause");

  const error =
    new BybitWebSocketError({
      kind: "PROTOCOL",
      code: "TEST_CODE",
      message: "Test message.",
      path: "test.path",
      cause,
    });

  assert.equal(
    error.name,
    "BybitWebSocketError",
  );

  assert.equal(
    error.kind,
    "PROTOCOL",
  );

  assert.equal(
    error.code,
    "TEST_CODE",
  );

  assert.equal(
    error.path,
    "test.path",
  );

  assert.equal(
    error.message,
    "Test message.",
  );

  assert.equal(
    error.cause,
    cause,
  );

  assert.ok(error instanceof Error);
}

function isWebSocketError(
  error: unknown,
  kind: string,
  code: string,
): boolean {
  return (
    error instanceof
      BybitWebSocketError &&
    error.kind === kind &&
    error.code === code
  );
}

function runBybitWebSocketClientTests(): void {
  testUrlResolution();
  testRequestIdGenerator();
  testTopicNormalization();
  testPublicConnection();
  testSubscriptionLifecycle();
  testHeartbeatMessage();
  testPrivateAuthentication();
  testTradeRequest();
  testMessageForwarding();
  testProtocolErrors();
  testAuthenticationRejected();
  testReconnectState();
  testTransportErrorForwarding();
  testInvalidUsage();
  testConnectFailure();
  testCloseFailure();
  testSnapshotImmutability();
  testErrorIdentity();

  console.log(
    "All Bybit WebSocket client tests passed successfully.",
  );
}

runBybitWebSocketClientTests();