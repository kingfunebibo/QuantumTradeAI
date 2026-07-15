import assert from "node:assert/strict";

import {
  OKX_CONNECTOR_METADATA,
  OkxConnectorCompositionError,
  createDeterministicOkxClock,
  createDeterministicOkxHeartbeatScheduler,
  createDeterministicOkxReconnectScheduler,
  createOkxConnectorComposition,
  createOkxRestSuccessResponse,
  normalizeCanonicalSymbol,
  type OkxRestBody,
  type OkxRestResult,
  type OkxRestTransport,
  type OkxRestTransportRequest,
} from "./exchange-connectivity/adapters/okx";

import {
  DeterministicOkxMockWebSocketTransport,
} from "./exchange-connectivity/adapters/okx";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

function createCapturingRestTransport(): {
  readonly transport: OkxRestTransport;
  readonly getRequests: () =>
    readonly OkxRestTransportRequest<OkxRestBody>[];
} {
  const requests:
    OkxRestTransportRequest<OkxRestBody>[] = [];

  const transport: OkxRestTransport = {
    async execute<
      TData,
      TBody extends OkxRestBody = null,
    >(
      request: OkxRestTransportRequest<TBody>,
    ): Promise<OkxRestResult<TData>> {
      requests.push(
        request as OkxRestTransportRequest<OkxRestBody>,
      );

      return createOkxRestSuccessResponse({
        status: 200,
        headers: {},
        envelope: {
          code: "0",
          msg: "",
          data: [],
        },
      }) as OkxRestResult<TData>;
    },
  };

  return {
    transport,

    getRequests():
      readonly OkxRestTransportRequest<OkxRestBody>[] {
      return Object.freeze([...requests]);
    },
  };
}

function testPublicExportSurface(): void {
  assert.equal(
    OKX_CONNECTOR_METADATA.identity.exchangeId,
    "okx",
  );

  assert.equal(
    OKX_CONNECTOR_METADATA.identity.connectorId,
    "okx-v5",
  );

  const normalized =
    normalizeCanonicalSymbol("btc/usdt");

  assert.deepEqual(normalized, {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    okxInstrumentId: "BTC-USDT",
    canonicalSymbol: "BTC/USDT",
  });
}

async function testRestIntegration(): Promise<void> {
  const restCapture =
    createCapturingRestTransport();

  const composition =
    createOkxConnectorComposition({
      configuration: {
        credentials: TEST_CREDENTIALS,
      },

      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),

      restTransport:
        restCapture.transport,

      webSocketTransport:
        new DeterministicOkxMockWebSocketTransport(),
    });

  const tickerResult =
    await composition.rest.publicMarket.getTicker({
      instId: "BTC-USDT",
    });

  const balanceResult =
    await composition.rest.privateAccount.getBalances({
      ccy: "USDT",
    });

  const orderResult =
    await composition.rest.privateTrading.placeOrder({
      instId: "BTC-USDT",
      tdMode: "cash",
      side: "buy",
      ordType: "market",
      sz: "0.01",
      clOrdId: "integration-order-001",
    });

  assert.equal(tickerResult.ok, true);
  assert.equal(balanceResult.ok, true);
  assert.equal(orderResult.ok, true);

  const requests = restCapture.getRequests();

  assert.equal(requests.length, 3);

  assert.equal(
    requests[0]?.request.path,
    "/api/v5/market/ticker",
  );

  assert.equal(
    requests[0]?.request.authentication,
    "public",
  );

  assert.equal(
    requests[1]?.request.path,
    "/api/v5/account/balance",
  );

  assert.equal(
    requests[1]?.request.authentication,
    "private",
  );

  assert.equal(
    requests[2]?.request.path,
    "/api/v5/trade/order",
  );

  assert.equal(
    requests[2]?.request.authentication,
    "private",
  );

  assert.equal(
    typeof requests[1]?.headers["ok-access-sign"],
    "string",
  );

  assert.equal(
    typeof requests[2]?.headers["ok-access-sign"],
    "string",
  );
}

function testWebSocketIntegration(): void {
  const webSocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const heartbeatScheduler =
    createDeterministicOkxHeartbeatScheduler();

  const reconnectScheduler =
    createDeterministicOkxReconnectScheduler();

  const composition =
    createOkxConnectorComposition({
      configuration: {
        credentials: TEST_CREDENTIALS,
      },

      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),

      restTransport:
        createCapturingRestTransport().transport,

      webSocketTransport,

      heartbeatScheduler,

      reconnectScheduler,

      heartbeatConfiguration: {
        heartbeatIntervalMs: 10_000,
        pongTimeoutMs: 5_000,
      },

      reconnectConfiguration: {
        initialDelayMs: 1_000,
        maximumDelayMs: 10_000,
        multiplier: 2,
        maximumAttempts: 3,
      },
    });

  composition.websocket.private.connect();

  const [connection] =
    webSocketTransport.getConnections();

  assert.ok(connection);

  connection.open();

  assert.equal(
    composition.websocket.private.getState(),
    "authenticating",
  );

  const [loginRequest] =
    connection.getSentMessages();

  assert.ok(loginRequest);
  assert.match(loginRequest, /"op":"login"/);

  connection.emitMessage(
    '{"event":"login","code":"0","msg":""}',
  );

  assert.equal(
    composition.websocket.private.getState(),
    "authenticated",
  );

  composition.websocket.private.subscribe([
    {
      channel: "orders",
      instType: "ANY",
    },
  ]);

  assert.equal(
    composition.websocket.private
      .getSubscriptions().length,
    1,
  );

  const heartbeat =
    composition.createPrivateHeartbeatManager();

  heartbeat.start();

  assert.equal(heartbeat.isRunning(), true);
  assert.equal(
    heartbeatScheduler.getScheduledCount(),
    1,
  );

  heartbeat.stop();

  connection.emitClose({
    code: 1006,
    reason: "Abnormal closure",
    wasClean: false,
  });

  const reconnect =
    composition.createPrivateReconnectManager();

  const attempt =
    reconnect.scheduleReconnect(1006);

  assert.deepEqual(attempt, {
    attempt: 1,
    delayMs: 1_000,
    scheduledAtMs: FIXED_TIMESTAMP_MS,
    executeAtMs:
      FIXED_TIMESTAMP_MS + 1_000,
  });

  reconnectScheduler.runNext();

  assert.equal(
    webSocketTransport.getConnections().length,
    2,
  );
}

function testHeartbeatRequiresConnectedClient(): void {
  const composition =
    createOkxConnectorComposition({
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),

      restTransport:
        createCapturingRestTransport().transport,

      webSocketTransport:
        new DeterministicOkxMockWebSocketTransport(),

      heartbeatScheduler:
        createDeterministicOkxHeartbeatScheduler(),
    });

  assert.throws(
    () =>
      composition.createPublicHeartbeatManager(),
    (error: unknown) => {
      if (
        !(
          error instanceof
          OkxConnectorCompositionError
        )
      ) {
        return false;
      }

      assert.match(
        error.message,
        /must be connected before creating a heartbeat manager/,
      );

      return true;
    },
  );
}

async function testDeterministicComposition(): Promise<void> {
  const firstRest =
    createCapturingRestTransport();

  const secondRest =
    createCapturingRestTransport();

  const firstWebSocket =
    new DeterministicOkxMockWebSocketTransport();

  const secondWebSocket =
    new DeterministicOkxMockWebSocketTransport();

  const first =
    createOkxConnectorComposition({
      configuration: {
        credentials: TEST_CREDENTIALS,
      },

      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),

      restTransport: firstRest.transport,
      webSocketTransport: firstWebSocket,
    });

  const second =
    createOkxConnectorComposition({
      configuration: {
        credentials: TEST_CREDENTIALS,
      },

      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),

      restTransport: secondRest.transport,
      webSocketTransport: secondWebSocket,
    });

  await first.rest.publicMarket.getCandles({
    instId: "BTC-USDT",
    bar: "1H",
    limit: 100,
  });

  await second.rest.publicMarket.getCandles({
    instId: "BTC-USDT",
    bar: "1H",
    limit: 100,
  });

  first.websocket.public.connect();
  second.websocket.public.connect();

  const [firstConnection] =
    firstWebSocket.getConnections();

  const [secondConnection] =
    secondWebSocket.getConnections();

  assert.ok(firstConnection);
  assert.ok(secondConnection);

  firstConnection.open();
  secondConnection.open();

  first.websocket.public.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  ]);

  second.websocket.public.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  ]);

  assert.deepEqual(
    firstRest.getRequests(),
    secondRest.getRequests(),
  );

  assert.deepEqual(
    firstConnection.getSentMessages(),
    secondConnection.getSentMessages(),
  );

  assert.deepEqual(
    first.websocket.public.getSnapshot(),
    second.websocket.public.getSnapshot(),
  );
}

async function runOkxExchangeAdapterIntegrationTests():
  Promise<void> {
  testPublicExportSurface();
  await testRestIntegration();
  testWebSocketIntegration();
  testHeartbeatRequiresConnectedClient();
  await testDeterministicComposition();

  console.log(
    "All OKX exchange adapter integration tests passed successfully.",
  );
}

runOkxExchangeAdapterIntegrationTests().catch(
  (error: unknown) => {
    console.error(
      "OKX exchange adapter integration tests failed.",
      error,
    );

    process.exitCode = 1;
  },
);