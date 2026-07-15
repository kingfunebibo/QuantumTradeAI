import assert from "node:assert/strict";

import {
  createOkxConnectorComposition,
  createSystemOkxClock,
  OkxConnectorCompositionError,
  resolveOkxWebSocketEndpoints,
} from "./okx-connector-composition";

import {
  createOkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createDeterministicOkxClock,
} from "./okx-authentication";

import {
  createDeterministicOkxHeartbeatScheduler,
} from "./okx-heartbeat-manager";

import {
  createDeterministicOkxReconnectScheduler,
} from "./okx-reconnect-manager";

import {
  createOkxRestSuccessResponse,
  type OkxRestBody,
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  type OkxRestTransport,
  type OkxRestTransportRequest,
} from "./okx-rest-transport";

import {
  DeterministicOkxMockWebSocketTransport,
} from "./okx-websocket-transport";

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
  const requests: OkxRestTransportRequest<OkxRestBody>[] = [];

  const transport: OkxRestTransport = {
    async execute<TData, TBody extends OkxRestBody = null>(
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
    getRequests(): readonly OkxRestTransportRequest<OkxRestBody>[] {
      return requests;
    },
  };
}

function testEndpointResolution(): void {
  const configuration =
    createOkxConnectorConfiguration();

  const endpoints =
    resolveOkxWebSocketEndpoints(
      configuration,
    );

  assert.deepEqual(endpoints, {
    publicUrl:
      configuration.websocket.publicUrl,
    privateUrl:
      configuration.websocket.privateUrl,
    businessUrl:
      configuration.websocket.businessUrl,
  });

  assert.equal(Object.isFrozen(endpoints), true);
}

function testInvalidEndpointResolution(): void {
  const configuration =
    createOkxConnectorConfiguration();

  assert.throws(
    () =>
      resolveOkxWebSocketEndpoints({
        ...configuration,
        websocket: {
          ...configuration.websocket,
          publicUrl: "",
        },
      }),
    /configuration\.websocket\.publicUrl must not be empty/,
  );
}

function testCompositionStructure(): void {
  const restCapture =
    createCapturingRestTransport();

  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

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
        websocketTransport,
    });

  assert.equal(
    Object.isFrozen(composition),
    true,
  );

  assert.equal(
    Object.isFrozen(composition.rest),
    true,
  );

  assert.equal(
    Object.isFrozen(composition.websocket),
    true,
  );

  assert.ok(composition.rest.adapter);
  assert.ok(composition.rest.publicMarket);
  assert.ok(composition.rest.privateAccount);
  assert.ok(composition.rest.privateTrading);
  assert.ok(composition.websocket.public);
  assert.ok(composition.websocket.private);
  assert.ok(composition.websocket.business);
}

async function testPublicRestComposition(): Promise<void> {
  const restCapture =
    createCapturingRestTransport();

  const composition =
    createOkxConnectorComposition({
      restTransport:
        restCapture.transport,
      webSocketTransport:
        new DeterministicOkxMockWebSocketTransport(),
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
    });

  const result =
    await composition.rest.publicMarket.getTicker({
      instId: "BTC-USDT",
    });

  assert.equal(result.ok, true);

  const [request] =
    restCapture.getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/market/ticker",
  );

  assert.equal(
    request.request.authentication,
    "public",
  );
}

async function testPrivateRestComposition(): Promise<void> {
  const restCapture =
    createCapturingRestTransport();

  const composition =
    createOkxConnectorComposition({
      configuration: {
        credentials: TEST_CREDENTIALS,
      },
      restTransport:
        restCapture.transport,
      webSocketTransport:
        new DeterministicOkxMockWebSocketTransport(),
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
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
    });

  assert.equal(balanceResult.ok, true);
  assert.equal(orderResult.ok, true);

  const requests =
    restCapture.getRequests();

  assert.equal(requests.length, 2);

  assert.equal(
    requests[0]?.request.authentication,
    "private",
  );

  assert.equal(
    requests[1]?.request.authentication,
    "private",
  );

  assert.equal(
    typeof requests[0]?.headers[
      "ok-access-sign"
    ],
    "string",
  );

  assert.equal(
    typeof requests[1]?.headers[
      "ok-access-sign"
    ],
    "string",
  );
}

function testPublicWebSocketComposition(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
    });

  composition.websocket.public.connect();

  const [connection] =
    websocketTransport.getConnections();

  assert.ok(connection);

  assert.equal(connection.scope, "public");

  connection.open();

  assert.equal(
    composition.websocket.public.getState(),
    "connected",
  );
}

function testPrivateWebSocketComposition(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const composition =
    createOkxConnectorComposition({
      configuration: {
        credentials: TEST_CREDENTIALS,
      },
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
    });

  composition.websocket.private.connect();

  const [connection] =
    websocketTransport.getConnections();

  assert.ok(connection);

  connection.open();

  assert.equal(
    composition.websocket.private.getState(),
    "authenticating",
  );

  const [loginMessage] =
    connection.getSentMessages();

  assert.ok(loginMessage);
  assert.match(loginMessage, /"op":"login"/);

  connection.emitMessage(
    '{"event":"login","code":"0","msg":""}',
  );

  assert.equal(
    composition.websocket.private.getState(),
    "authenticated",
  );
}

function testHeartbeatFactoryRequiresConnection(): void {
  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport:
        new DeterministicOkxMockWebSocketTransport(),
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      heartbeatScheduler:
        createDeterministicOkxHeartbeatScheduler(),
    });

  assert.throws(
    () =>
      composition.createPublicHeartbeatManager(),
    /must be connected before creating a heartbeat manager/,
  );
}

function testHeartbeatFactory(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const heartbeatScheduler =
    createDeterministicOkxHeartbeatScheduler();

  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      heartbeatScheduler,
      heartbeatConfiguration: {
        heartbeatIntervalMs: 10_000,
        pongTimeoutMs: 5_000,
      },
    });

  composition.websocket.public.connect();

  const [connection] =
    websocketTransport.getConnections();

  assert.ok(connection);

  connection.open();

  const manager =
    composition.createPublicHeartbeatManager();

  manager.start();

  assert.equal(manager.isRunning(), true);
  assert.equal(
    heartbeatScheduler.getScheduledCount(),
    1,
  );
}

function testReconnectFactory(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const reconnectScheduler =
    createDeterministicOkxReconnectScheduler();

  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      reconnectScheduler,
      reconnectConfiguration: {
        initialDelayMs: 1_000,
        maximumDelayMs: 10_000,
        multiplier: 2,
        maximumAttempts: 3,
      },
    });

  composition.websocket.public.connect();

  const [connection] =
    websocketTransport.getConnections();

  assert.ok(connection);

  connection.open();

  connection.emitClose({
    code: 1006,
    reason: "Abnormal closure",
    wasClean: false,
  });

  const manager =
    composition.createPublicReconnectManager();

  manager.scheduleReconnect(1006);

  assert.equal(
    reconnectScheduler.getScheduledCount(),
    1,
  );

  reconnectScheduler.runNext();

  assert.equal(
    websocketTransport.getConnections().length,
    2,
  );
}

function testReconnectFactoryRejectsInvalidClientState(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const reconnectScheduler =
    createDeterministicOkxReconnectScheduler();

  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      reconnectScheduler,
      reconnectConfiguration: {
        initialDelayMs: 1_000,
        maximumDelayMs: 10_000,
        multiplier: 2,
        maximumAttempts: 3,
      },
    });

  composition.websocket.public.connect();

  const manager =
    composition.createPublicReconnectManager();

  manager.scheduleReconnect(1006);

  assert.throws(
    () => reconnectScheduler.runNext(),
    /Cannot reconnect OKX WebSocket client from state "connecting"/,
  );
}

function testCustomWebSocketEndpoints(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const customEndpoints = Object.freeze({
    publicUrl: "wss://example.com/public",
    privateUrl: "wss://example.com/private",
    businessUrl: "wss://example.com/business",
  });

  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      webSocketEndpoints:
        customEndpoints,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
    });

  composition.websocket.business.connect();

  const [connection] =
    websocketTransport.getConnections();

  assert.ok(connection);

  assert.equal(
    connection.url,
    customEndpoints.businessUrl,
  );
}

function testInjectedHandlers(): void {
  const websocketTransport =
    new DeterministicOkxMockWebSocketTransport();

  const pushes: unknown[] = [];

  const composition =
    createOkxConnectorComposition({
      restTransport:
        createCapturingRestTransport()
          .transport,
      webSocketTransport: websocketTransport,
      clock:
        createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      publicWebSocketHandlers: {
        onPush(message): void {
          pushes.push(message);
        },
      },
    });

  composition.websocket.public.connect();

  const [connection] =
    websocketTransport.getConnections();

  assert.ok(connection);

  connection.open();

  connection.emitMessage(
    '{"arg":{"channel":"tickers","instId":"BTC-USDT"},"data":[{"last":"65000"}]}',
  );

  assert.equal(pushes.length, 1);
}

function testSystemClock(): void {
  const clock = createSystemOkxClock();

  const before = Date.now();
  const value = clock.now();
  const after = Date.now();

  assert.ok(value >= before);
  assert.ok(value <= after);
  assert.equal(Object.isFrozen(clock), true);
}

function testCompositionErrorIdentity(): void {
  const error =
    new OkxConnectorCompositionError(
      "Composition failed.",
    );

  assert.equal(
    error.name,
    "OkxConnectorCompositionError",
  );

  assert.equal(
    error.code,
    "OKX_CONNECTOR_COMPOSITION_ERROR",
  );

  assert.equal(
    error.message,
    "Composition failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(
    error instanceof
      OkxConnectorCompositionError,
  );
}

async function testDeterministicComposition(): Promise<void> {
  const firstRest =
    createCapturingRestTransport();

  const secondRest =
    createCapturingRestTransport();

  const firstWs =
    new DeterministicOkxMockWebSocketTransport();

  const secondWs =
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
      restTransport:
        firstRest.transport,
      webSocketTransport:
        firstWs,
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
      restTransport:
        secondRest.transport,
      webSocketTransport:
        secondWs,
    });

  await first.rest.publicMarket.getTicker({
    instId: "BTC-USDT",
  });

  await second.rest.publicMarket.getTicker({
    instId: "BTC-USDT",
  });

  first.websocket.public.connect();
  second.websocket.public.connect();

  const [firstConnection] =
    firstWs.getConnections();

  const [secondConnection] =
    secondWs.getConnections();

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
}

async function runOkxConnectorCompositionTests(): Promise<void> {
  testEndpointResolution();
  testInvalidEndpointResolution();
  testCompositionStructure();
  await testPublicRestComposition();
  await testPrivateRestComposition();
  testPublicWebSocketComposition();
  testPrivateWebSocketComposition();
  testHeartbeatFactoryRequiresConnection();
  testHeartbeatFactory();
  testReconnectFactory();
  testReconnectFactoryRejectsInvalidClientState();
  testCustomWebSocketEndpoints();
  testInjectedHandlers();
  testSystemClock();
  testCompositionErrorIdentity();
  await testDeterministicComposition();

  console.log(
    "All OKX connector composition tests passed successfully.",
  );
}

runOkxConnectorCompositionTests().catch(
  (error: unknown) => {
    console.error(
      "OKX connector composition tests failed.",
      error,
    );

    process.exitCode = 1;
  },
);