import assert from "node:assert/strict";

import {
  BybitConnector,
  BybitConnectorError,
  createBybitConnector,
  getStaticBybitConnectorMetadata,
} from "./exchange-connectivity/adapters/bybit/bybit-connector";

import {
  FixedBybitClock,
} from "./exchange-connectivity/adapters/bybit/bybit-authentication";

import type {
  BybitHttpTransport,
  BybitHttpTransportRequest,
  BybitHttpTransportResponse,
} from "./exchange-connectivity/adapters/bybit/bybit-rest-client";

import type {
  BybitWebSocketTransport,
  BybitWebSocketTransportHandlers,
  BybitWebSocketReadyState,
} from "./exchange-connectivity/adapters/bybit/bybit-websocket-client";

class NoopRestTransport
  implements BybitHttpTransport {
  public async execute(
    _request: BybitHttpTransportRequest,
  ): Promise<BybitHttpTransportResponse> {
    return Object.freeze({
      status: 200,
      statusText: "OK",
      headers: Object.freeze({
        "content-type":
          "application/json",
      }),
      body: JSON.stringify({
        retCode: 0,
        retMsg: "OK",
        result: {},
        retExtInfo: {},
        time:
          1_700_000_000_000,
      }),
    });
  }
}

class FakeWebSocketTransport
  implements BybitWebSocketTransport {
  public connectedUrl:
    string | undefined;

  public handlers:
    BybitWebSocketTransportHandlers | undefined;

  public readonly sent:
    string[] = [];

  private state:
    BybitWebSocketReadyState =
      "CLOSED";

  public connect(
    url: string,
    handlers:
      BybitWebSocketTransportHandlers,
  ): void {
    this.connectedUrl = url;
    this.handlers = handlers;
    this.state = "CONNECTING";
  }

  public send(data: string): void {
    if (this.state !== "OPEN") {
      throw new Error(
        "Transport is not open.",
      );
    }

    this.sent.push(data);
  }

  public close(): void {
    this.state = "CLOSING";
  }

  public getReadyState():
    BybitWebSocketReadyState {
    return this.state;
  }

  public emitOpen(): void {
    this.state = "OPEN";
    this.handlers?.onOpen();
  }
}

function createPublicConnector():
  BybitConnector {
  return createBybitConnector(
    {
      bybitEnvironment: "TESTNET",
    },
    {
      restTransport:
        new NoopRestTransport(),
      clock:
        new FixedBybitClock(
          1_700_000_000_000,
        ),
    },
  );
}

function createPrivateConnector():
  BybitConnector {
  return createBybitConnector(
    {
      bybitEnvironment: "TESTNET",
      credentials: {
        apiKey: "test-api-key",
        secretKey:
          "test-secret-key",
        signatureAlgorithm:
          "HMAC_SHA256",
      },
      enablePrivateRest: true,
      enablePrivateWebSocket:
        true,
      enableOrderManagement:
        true,
      enableWebSocketOrderEntry:
        true,
    },
    {
      restTransport:
        new NoopRestTransport(),
      clock:
        new FixedBybitClock(
          1_700_000_000_000,
        ),
    },
  );
}

function testInitialState(): void {
  const connector =
    createPublicConnector();

  assert.equal(
    connector.getSnapshot().state,
    "CREATED",
  );

  assert.equal(
    connector.isRunning(),
    false,
  );

  assert.equal(
    connector.isHealthy(),
    true,
  );

  assert.equal(
    connector.getConfiguration()
      .bybitEnvironment,
    "TESTNET",
  );

  assert.equal(
    connector.getMetadata()
      .identity.exchangeId,
    "bybit",
  );

  assert.equal(
    connector.getRestClient()
      .constructor.name,
    "BybitRestClient",
  );
}

function testLifecycle(): void {
  const connector =
    createPublicConnector();

  connector.initialize();

  assert.equal(
    connector.getSnapshot().state,
    "INITIALIZED",
  );

  connector.start();

  assert.equal(
    connector.getSnapshot().state,
    "RUNNING",
  );

  assert.equal(
    connector.isRunning(),
    true,
  );

  connector.stop();

  assert.equal(
    connector.getSnapshot().state,
    "STOPPED",
  );

  assert.equal(
    connector.isRunning(),
    false,
  );

  connector.initialize();
  connector.start();

  assert.equal(
    connector.getSnapshot().state,
    "RUNNING",
  );
}

function testInvalidLifecycleTransitions(): void {
  const connector =
    createPublicConnector();

  assert.throws(
    () => connector.start(),
    (error: unknown) =>
      isConnectorError(
        error,
        "BYBIT_CONNECTOR_START_INVALID_STATE",
        "CREATED",
      ),
  );

  assert.throws(
    () => connector.stop(),
    (error: unknown) =>
      isConnectorError(
        error,
        "BYBIT_CONNECTOR_STOP_INVALID_STATE",
        "CREATED",
      ),
  );

  connector.initialize();

  assert.throws(
    () =>
      connector.initialize(),
    (error: unknown) =>
      isConnectorError(
        error,
        "BYBIT_CONNECTOR_INITIALIZE_INVALID_STATE",
        "INITIALIZED",
      ),
  );
}

function testPublicWebSocketFactory(): void {
  const connector =
    createPublicConnector();

  const transport =
    new FakeWebSocketTransport();

  assert.throws(
    () =>
      connector.createPublicWebSocketClient(
        "SPOT",
        {
          transport,
        },
      ),
    (error: unknown) =>
      isConnectorError(
        error,
        "BYBIT_CONNECTOR_NOT_READY",
        "CREATED",
      ),
  );

  connector.initialize();

  const client =
    connector.createPublicWebSocketClient(
      "SPOT",
      {
        transport,
        heartbeatIntervalMs:
          60_000,
      },
    );

  assert.equal(
    client.getUrl(),
    "wss://stream-testnet.bybit.com/v5/public/spot",
  );

  client.connect();

  assert.equal(
    transport.connectedUrl,
    "wss://stream-testnet.bybit.com/v5/public/spot",
  );

  client.disconnect();
}

function testPrivateWebSocketFactory(): void {
  const connector =
    createPrivateConnector();

  const transport =
    new FakeWebSocketTransport();

  connector.initialize();

  const client =
    connector.createPrivateWebSocketClient({
      transport,
      heartbeatIntervalMs:
        60_000,
    });

  assert.equal(
    client.getUrl(),
    "wss://stream-testnet.bybit.com/v5/private",
  );

  client.connect();
  transport.emitOpen();

  assert.equal(
    transport.sent.length,
    1,
  );

  const authMessage =
    JSON.parse(
      transport.sent[0] ?? "",
    ) as {
      readonly op: string;
    };

  assert.equal(
    authMessage.op,
    "auth",
  );

  client.disconnect();
}

function testTradeWebSocketFactory(): void {
  const connector =
    createPrivateConnector();

  const transport =
    new FakeWebSocketTransport();

  connector.initialize();

  const client =
    connector.createTradeWebSocketClient({
      transport,
      heartbeatIntervalMs:
        60_000,
      autoAuthenticate: false,
    });

  assert.equal(
    client.getUrl(),
    "wss://stream-testnet.bybit.com/v5/trade",
  );
}

function testDisabledPrivateFactories(): void {
  const connector =
    createPublicConnector();

  connector.initialize();

  assert.throws(
    () =>
      connector.createPrivateWebSocketClient({
        transport:
          new FakeWebSocketTransport(),
      }),
    (error: unknown) =>
      isConnectorError(
        error,
        "BYBIT_PRIVATE_WEBSOCKET_DISABLED",
        "INITIALIZED",
      ),
  );

  assert.throws(
    () =>
      connector.createTradeWebSocketClient({
        transport:
          new FakeWebSocketTransport(),
      }),
    (error: unknown) =>
      isConnectorError(
        error,
        "BYBIT_TRADE_WEBSOCKET_DISABLED",
        "INITIALIZED",
      ),
  );
}

function testHealthSnapshot(): void {
  const connector =
    createPrivateConnector();

  const created =
    connector.getHealthSnapshot();

  assert.equal(
    created.connectorId,
    "bybit",
  );

  assert.equal(
    created.exchangeId,
    "bybit",
  );

  assert.equal(
    created.state,
    "CREATED",
  );

  assert.equal(
    created.healthy,
    true,
  );

  assert.equal(
    created.initialized,
    false,
  );

  assert.equal(
    created.running,
    false,
  );

  assert.equal(
    created.privateFeaturesConfigured,
    true,
  );

  assert.equal(
    created.restAvailable,
    true,
  );

  assert.equal(
    created.publicWebSocketAvailable,
    true,
  );

  assert.equal(
    created.privateWebSocketAvailable,
    true,
  );

  assert.equal(
    created.tradeWebSocketAvailable,
    true,
  );

  connector.initialize();
  connector.start();

  const running =
    connector.getHealthSnapshot();

  assert.equal(
    running.state,
    "RUNNING",
  );

  assert.equal(
    running.initialized,
    true,
  );

  assert.equal(
    running.running,
    true,
  );

  assert.equal(
    Object.isFrozen(running),
    true,
  );
}

function testFailureHandling(): void {
  const connector =
    createPublicConnector();

  const cause =
    new Error("root cause");

  assert.throws(
    () =>
      connector.fail(
        "Simulated connector failure",
        cause,
      ),
    (error: unknown) =>
      error instanceof
        BybitConnectorError &&
      error.code ===
        "BYBIT_CONNECTOR_FAILED" &&
      error.state === "FAILED" &&
      error.message ===
        "Simulated connector failure" &&
      error.cause === cause,
  );

  assert.equal(
    connector.isHealthy(),
    false,
  );

  const health =
    connector.getHealthSnapshot();

  assert.equal(
    health.state,
    "FAILED",
  );

  assert.equal(
    health.healthy,
    false,
  );

  assert.equal(
    health.failureReason,
    "Simulated connector failure",
  );

  connector.stop();

  assert.equal(
    connector.getSnapshot().state,
    "STOPPED",
  );
}

function testStaticMetadata(): void {
  const metadata =
    getStaticBybitConnectorMetadata();

  assert.equal(
    metadata.identity.exchangeId,
    "bybit",
  );

  assert.equal(
    metadata.identity.apiVersion,
    "v5",
  );

  assert.equal(
    Object.isFrozen(metadata),
    true,
  );
}

function testSnapshotImmutability(): void {
  const connector =
    createPrivateConnector();

  const snapshot =
    connector.getSnapshot();

  assert.equal(
    Object.isFrozen(snapshot),
    true,
  );

  assert.equal(
    Object.isFrozen(
      snapshot.configuration,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      snapshot.metadata,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      snapshot.health,
    ),
    true,
  );
}

function testFactoryDeterminism(): void {
  const first =
    createPrivateConnector();

  const second =
    createPrivateConnector();

  assert.deepEqual(
    first.getConfiguration(),
    second.getConfiguration(),
  );

  assert.equal(
    first.getMetadata(),
    second.getMetadata(),
  );

  assert.notEqual(first, second);
}

function testErrorIdentity(): void {
  const cause =
    new Error("cause");

  const error =
    new BybitConnectorError({
      code: "TEST_CODE",
      message: "Test message.",
      state: "FAILED",
      cause,
    });

  assert.equal(
    error.name,
    "BybitConnectorError",
  );

  assert.equal(
    error.code,
    "TEST_CODE",
  );

  assert.equal(
    error.state,
    "FAILED",
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

function isConnectorError(
  error: unknown,
  code: string,
  state: string,
): boolean {
  return (
    error instanceof
      BybitConnectorError &&
    error.code === code &&
    error.state === state
  );
}

function runBybitConnectorTests(): void {
  testInitialState();
  testLifecycle();
  testInvalidLifecycleTransitions();
  testPublicWebSocketFactory();
  testPrivateWebSocketFactory();
  testTradeWebSocketFactory();
  testDisabledPrivateFactories();
  testHealthSnapshot();
  testFailureHandling();
  testStaticMetadata();
  testSnapshotImmutability();
  testFactoryDeterminism();
  testErrorIdentity();

  console.log(
    "All unified Bybit connector tests passed successfully.",
  );
}

runBybitConnectorTests();