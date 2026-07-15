import assert from "node:assert/strict";

import {
  createOkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createDeterministicOkxWebSocketClock,
} from "./okx-websocket-authentication";

import {
  createSubscriptionKey,
  createDeterministicOkxWebSocketRequestIdGenerator,
  createSequentialOkxWebSocketRequestIdGenerator,
  OkxWebSocketClient,
  OkxWebSocketClientError,
} from "./okx-websocket-client";

import {
  DeterministicOkxMockWebSocketConnection,
  DeterministicOkxMockWebSocketTransport,
} from "./okx-websocket-transport";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

const ENDPOINTS = Object.freeze({
  publicUrl:
    "wss://ws.okx.com:8443/ws/v5/public",
  privateUrl:
    "wss://ws.okx.com:8443/ws/v5/private",
  businessUrl:
    "wss://ws.okx.com:8443/ws/v5/business",
});

function getOnlyConnection(
  transport:
    DeterministicOkxMockWebSocketTransport,
): DeterministicOkxMockWebSocketConnection {
  const [connection] =
    transport.getConnections();

  assert.ok(connection);

  return connection;
}

function createPublicClient(
  transport:
    DeterministicOkxMockWebSocketTransport,
  handlers: ConstructorParameters<
    typeof OkxWebSocketClient
  >[2] = {},
): OkxWebSocketClient {
  return new OkxWebSocketClient(
    "public",
    {
      configuration:
        createOkxConnectorConfiguration(),
      endpoints: ENDPOINTS,
      transport,
      clock:
        createDeterministicOkxWebSocketClock(
          FIXED_TIMESTAMP_MS,
        ),
      requestIdGenerator:
        createDeterministicOkxWebSocketRequestIdGenerator([
          "request-001",
          "request-002",
          "request-003",
        ]),
    },
    handlers,
  );
}

function createPrivateClient(
  transport:
    DeterministicOkxMockWebSocketTransport,
  handlers: ConstructorParameters<
    typeof OkxWebSocketClient
  >[2] = {},
): OkxWebSocketClient {
  return new OkxWebSocketClient(
    "private",
    {
      configuration:
        createOkxConnectorConfiguration({
          credentials: TEST_CREDENTIALS,
        }),
      endpoints: ENDPOINTS,
      transport,
      clock:
        createDeterministicOkxWebSocketClock(
          FIXED_TIMESTAMP_MS,
        ),
      requestIdGenerator:
        createDeterministicOkxWebSocketRequestIdGenerator([
          "request-001",
          "request-002",
          "request-003",
        ]),
    },
    handlers,
  );
}

function testDeterministicRequestIdGenerator(): void {
  const generator =
    createDeterministicOkxWebSocketRequestIdGenerator([
      "request-001",
      "request-002",
    ]);

  assert.equal(Object.isFrozen(generator), true);
  assert.equal(generator.nextId(), "request-001");
  assert.equal(generator.nextId(), "request-002");
  assert.equal(generator.nextId(), "request-002");
}

function testInvalidDeterministicRequestIdGenerator(): void {
  assert.throws(
    () =>
      createDeterministicOkxWebSocketRequestIdGenerator(
        [],
      ),
    /ids must contain at least one request ID/,
  );

  assert.throws(
    () =>
      createDeterministicOkxWebSocketRequestIdGenerator(
        [" "],
      ),
    /ids\[0\] must not be empty/,
  );
}

function testSequentialRequestIdGenerator(): void {
  const generator =
    createSequentialOkxWebSocketRequestIdGenerator(
      "ws-test",
      10,
    );

  assert.equal(Object.isFrozen(generator), true);
  assert.equal(generator.nextId(), "ws-test-10");
  assert.equal(generator.nextId(), "ws-test-11");
}

function testInvalidSequentialRequestIdGenerator(): void {
  assert.throws(
    () =>
      createSequentialOkxWebSocketRequestIdGenerator(
        "",
        0,
      ),
    /prefix must not be empty/,
  );

  assert.throws(
    () =>
      createSequentialOkxWebSocketRequestIdGenerator(
        "ws",
        -1,
      ),
    /startAt must be a non-negative integer/,
  );
}

function testSubscriptionKey(): void {
  assert.equal(
    createSubscriptionKey({
      channel: "tickers",
      instId: "BTC-USDT",
      instType: "SPOT",
    }),
    "channel=tickers&instId=BTC-USDT&instType=SPOT",
  );

  assert.equal(
    createSubscriptionKey({
      channel: "orders",
    }),
    "channel=orders",
  );
}

function testPublicConnectionFlow(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  assert.equal(client.getState(), "idle");

  client.connect();

  assert.equal(client.getState(), "connecting");

  const connection =
    getOnlyConnection(transport);

  assert.equal(connection.scope, "public");
  assert.equal(
    connection.url,
    ENDPOINTS.publicUrl,
  );

  connection.open();

  assert.equal(client.getState(), "connected");
  assert.equal(client.isAuthenticated(), false);
  assert.deepEqual(
    connection.getSentMessages(),
    [],
  );
}

function testPrivateConnectionAutomaticLogin(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPrivateClient(transport);

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  assert.equal(
    client.getState(),
    "authenticating",
  );

  const [loginMessage] =
    connection.getSentMessages();

  assert.ok(loginMessage);

  const parsed = JSON.parse(
    loginMessage,
  ) as {
    readonly op: string;
    readonly args: readonly {
      readonly apiKey: string;
      readonly passphrase: string;
      readonly timestamp: string;
      readonly sign: string;
    }[];
  };

  assert.equal(parsed.op, "login");
  assert.equal(
    parsed.args[0]?.apiKey,
    TEST_CREDENTIALS.apiKey,
  );
  assert.equal(
    parsed.args[0]?.passphrase,
    TEST_CREDENTIALS.passphrase,
  );
  assert.equal(
    parsed.args[0]?.timestamp,
    "1700000000",
  );
  assert.equal(
    typeof parsed.args[0]?.sign,
    "string",
  );
}

function testPrivateLoginAcknowledgement(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const events: unknown[] = [];

  const client = createPrivateClient(
    transport,
    {
      onEvent(message): void {
        events.push(message);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  connection.emitMessage(
    '{"event":"login","code":"0","msg":"","connId":"connection-001"}',
  );

  assert.equal(
    client.getState(),
    "authenticated",
  );

  assert.equal(
    client.isAuthenticated(),
    true,
  );

  assert.equal(events.length, 1);
}

function testPrivateLoginFailure(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const errors: unknown[] = [];

  const client = createPrivateClient(
    transport,
    {
      onError(error): void {
        errors.push(error);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  connection.emitMessage(
    '{"event":"login","code":"60009","msg":"Login failed"}',
  );

  assert.equal(client.getState(), "failed");
  assert.equal(client.isAuthenticated(), false);
  assert.equal(errors.length, 1);

  const [error] = errors;

  assert.ok(
    error instanceof OkxWebSocketClientError,
  );
}

function testPublicSubscriptionFlow(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  const requestId = client.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
    {
      channel: "books",
      instId: "ETH-USDT",
    },
  ]);

  assert.equal(requestId, "request-001");

  const [message] =
    connection.getSentMessages();

  assert.equal(
    message,
    '{"id":"request-001","op":"subscribe","args":[{"channel":"tickers","instId":"BTC-USDT"},{"channel":"books","instId":"ETH-USDT"}]}',
  );

  assert.equal(
    client.getSubscriptions().length,
    2,
  );

  assert.equal(
    Object.isFrozen(
      client.getSubscriptions(),
    ),
    true,
  );
}

function testUnsubscriptionFlow(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  client.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  ]);

  const requestId = client.unsubscribe(
    [
      {
        channel: "tickers",
        instId: "BTC-USDT",
      },
    ],
    "unsubscribe-001",
  );

  assert.equal(
    requestId,
    "unsubscribe-001",
  );

  assert.equal(
    client.getSubscriptions().length,
    0,
  );

  assert.deepEqual(
    connection.getSentMessages(),
    [
      '{"id":"request-001","op":"subscribe","args":[{"channel":"tickers","instId":"BTC-USDT"}]}',
      '{"id":"unsubscribe-001","op":"unsubscribe","args":[{"channel":"tickers","instId":"BTC-USDT"}]}',
    ],
  );
}

function testPrivateSubscriptionRequiresAuthentication(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPrivateClient(transport);

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  assert.throws(
    () =>
      client.subscribe([
        {
          channel: "orders",
          instType: "ANY",
        },
      ]),
    /must authenticate before subscribing/,
  );

  connection.emitMessage(
    '{"event":"login","code":"0","msg":""}',
  );

  assert.doesNotThrow(() =>
    client.subscribe([
      {
        channel: "orders",
        instType: "ANY",
      },
    ]),
  );
}

function testSubscribeRequiresOpenConnection(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  assert.throws(
    () =>
      client.subscribe([
        {
          channel: "tickers",
        },
      ]),
    /connection must be open before subscribing/,
  );
}

function testMessageRouting(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const events: unknown[] = [];
  const pushes: unknown[] = [];
  const operations: unknown[] = [];
  const rawMessages: string[] = [];

  const client = createPublicClient(
    transport,
    {
      onEvent(message): void {
        events.push(message);
      },

      onPush(message): void {
        pushes.push(message);
      },

      onOperationResponse(message): void {
        operations.push(message);
      },

      onRawMessage(rawMessage): void {
        rawMessages.push(rawMessage);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  connection.emitMessage(
    '{"event":"subscribe","code":"0","msg":"","arg":{"channel":"tickers","instId":"BTC-USDT"}}',
  );

  connection.emitMessage(
    '{"arg":{"channel":"tickers","instId":"BTC-USDT"},"data":[{"last":"65000"}]}',
  );

  connection.emitMessage(
    '{"id":"operation-001","op":"order","code":"0","msg":"","data":[]}',
  );

  assert.equal(events.length, 1);
  assert.equal(pushes.length, 1);
  assert.equal(operations.length, 1);
  assert.equal(rawMessages.length, 3);
}

function testNoticeRouting(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const events: unknown[] = [];

  const client = createPublicClient(
    transport,
    {
      onEvent(message): void {
        events.push(message);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  connection.emitMessage(
    '{"event":"notice","code":"64008","msg":"Service upgrade"}',
  );

  assert.equal(events.length, 1);
  assert.equal(client.getState(), "connected");
}

function testProtocolErrorRouting(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const errors: unknown[] = [];
  const events: unknown[] = [];

  const client = createPublicClient(
    transport,
    {
      onError(error): void {
        errors.push(error);
      },

      onEvent(message): void {
        events.push(message);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  connection.emitMessage(
    '{"event":"error","code":"60012","msg":"Invalid request"}',
  );

  assert.equal(client.getState(), "failed");
  assert.equal(errors.length, 1);
  assert.equal(events.length, 1);
}

function testInvalidJsonFailure(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const errors: unknown[] = [];

  const client = createPublicClient(
    transport,
    {
      onError(error): void {
        errors.push(error);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();
  connection.emitMessage("not-json");

  assert.equal(client.getState(), "failed");
  assert.equal(errors.length, 1);
}

function testUnsupportedMessageFailure(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const errors: unknown[] = [];

  const client = createPublicClient(
    transport,
    {
      onError(error): void {
        errors.push(error);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();
  connection.emitMessage('{"unknown":true}');

  assert.equal(client.getState(), "failed");
  assert.equal(errors.length, 1);
}

function testTransportErrorHandling(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const sourceError =
    new Error("socket failure");

  const errors: unknown[] = [];

  const client = createPublicClient(
    transport,
    {
      onError(error): void {
        errors.push(error);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();
  connection.emitError(sourceError);

  assert.equal(client.getState(), "failed");
  assert.equal(errors[0], sourceError);
}

function testCloseHandling(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const closes: unknown[] = [];

  const client = createPublicClient(
    transport,
    {
      onClose(event): void {
        closes.push(event);
      },
    },
  );

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  connection.emitClose({
    code: 1001,
    reason: "Going away",
    wasClean: false,
  });

  assert.equal(client.getState(), "closed");
  assert.equal(client.isAuthenticated(), false);
  assert.equal(closes.length, 1);

  assert.deepEqual(client.getSnapshot(), {
    scope: "public",
    state: "closed",
    readyState: "closed",
    authenticated: false,
    subscriptionCount: 0,
    lastClose: {
      type: "close",
      code: 1001,
      reason: "Going away",
      wasClean: false,
    },
  });
}

function testFailedClosePreservesFailedState(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();
  connection.emitMessage("invalid-json");

  connection.emitClose({
    code: 1006,
    reason: "Abnormal closure",
    wasClean: false,
  });

  assert.equal(client.getState(), "failed");
}

function testDisconnect(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  client.disconnect(
    1000,
    "Client shutdown",
  );

  assert.equal(client.getState(), "closed");
  assert.equal(
    connection.getReadyState(),
    "closed",
  );
}

function testDisconnectWithoutConnection(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  assert.throws(
    () => client.disconnect(),
    /connection has not been created/,
  );
}

function testDuplicateConnectPrevention(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  client.connect();

  assert.throws(
    () => client.connect(),
    /Cannot connect OKX WebSocket client from state "connecting"/,
  );
}

function testReconnectAfterClose(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  client.connect();

  const firstConnection =
    getOnlyConnection(transport);

  firstConnection.open();

  firstConnection.emitClose({
    code: 1000,
    reason: "Normal closure",
    wasClean: true,
  });

  assert.equal(client.getState(), "closed");

  client.connect();

  assert.equal(
    transport.getConnections().length,
    2,
  );

  assert.equal(client.getState(), "connecting");
}

function testSnapshotDuringPublicConnection(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const client = createPublicClient(transport);

  assert.deepEqual(client.getSnapshot(), {
    scope: "public",
    state: "idle",
    readyState: "idle",
    authenticated: false,
    subscriptionCount: 0,
  });

  client.connect();

  const connection =
    getOnlyConnection(transport);

  connection.open();

  client.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  ]);

  const snapshot = client.getSnapshot();

  assert.deepEqual(snapshot, {
    scope: "public",
    state: "connected",
    readyState: "open",
    authenticated: false,
    subscriptionCount: 1,
  });

  assert.equal(Object.isFrozen(snapshot), true);
}

function testInvalidDependencies(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const configuration =
    createOkxConnectorConfiguration();

  const clock =
    createDeterministicOkxWebSocketClock(
      FIXED_TIMESTAMP_MS,
    );

  const requestIdGenerator =
    createDeterministicOkxWebSocketRequestIdGenerator([
      "request-001",
    ]);

  assert.throws(
    () =>
      new OkxWebSocketClient(
        "invalid" as never,
        {
          configuration,
          endpoints: ENDPOINTS,
          transport,
          clock,
          requestIdGenerator,
        },
      ),
    /Unsupported OKX WebSocket scope/,
  );

  assert.throws(
    () =>
      new OkxWebSocketClient(
        "public",
        {
          configuration,
          endpoints: {
            ...ENDPOINTS,
            publicUrl: "",
          },
          transport,
          clock,
          requestIdGenerator,
        },
      ),
    /endpoints\.publicUrl must not be empty/,
  );

  assert.throws(
    () =>
      new OkxWebSocketClient(
        "public",
        {
          configuration,
          endpoints: ENDPOINTS,
          transport: {} as never,
          clock,
          requestIdGenerator,
        },
      ),
    /transport must implement OkxWebSocketTransport/,
  );

  assert.throws(
    () =>
      new OkxWebSocketClient(
        "public",
        {
          configuration,
          endpoints: ENDPOINTS,
          transport,
          clock: {} as never,
          requestIdGenerator,
        },
      ),
    /clock must implement OkxClock/,
  );
}

function testClientErrorIdentity(): void {
  const error =
    new OkxWebSocketClientError(
      "Client failed.",
    );

  assert.equal(
    error.name,
    "OkxWebSocketClientError",
  );

  assert.equal(
    error.code,
    "OKX_WEBSOCKET_CLIENT_ERROR",
  );

  assert.equal(
    error.message,
    "Client failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxWebSocketClientError);
}

function testDeterministicPublicFlow(): void {
  const firstTransport =
    new DeterministicOkxMockWebSocketTransport();

  const secondTransport =
    new DeterministicOkxMockWebSocketTransport();

  const first = createPublicClient(
    firstTransport,
  );

  const second = createPublicClient(
    secondTransport,
  );

  first.connect();
  second.connect();

  const firstConnection =
    getOnlyConnection(firstTransport);

  const secondConnection =
    getOnlyConnection(secondTransport);

  firstConnection.open();
  secondConnection.open();

  first.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  ]);

  second.subscribe([
    {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  ]);

  assert.deepEqual(
    firstConnection.getSentMessages(),
    secondConnection.getSentMessages(),
  );

  assert.deepEqual(
    first.getSnapshot(),
    second.getSnapshot(),
  );
}

function runOkxWebSocketClientTests(): void {
  testDeterministicRequestIdGenerator();
  testInvalidDeterministicRequestIdGenerator();
  testSequentialRequestIdGenerator();
  testInvalidSequentialRequestIdGenerator();
  testSubscriptionKey();
  testPublicConnectionFlow();
  testPrivateConnectionAutomaticLogin();
  testPrivateLoginAcknowledgement();
  testPrivateLoginFailure();
  testPublicSubscriptionFlow();
  testUnsubscriptionFlow();
  testPrivateSubscriptionRequiresAuthentication();
  testSubscribeRequiresOpenConnection();
  testMessageRouting();
  testNoticeRouting();
  testProtocolErrorRouting();
  testInvalidJsonFailure();
  testUnsupportedMessageFailure();
  testTransportErrorHandling();
  testCloseHandling();
  testFailedClosePreservesFailedState();
  testDisconnect();
  testDisconnectWithoutConnection();
  testDuplicateConnectPrevention();
  testReconnectAfterClose();
  testSnapshotDuringPublicConnection();
  testInvalidDependencies();
  testClientErrorIdentity();
  testDeterministicPublicFlow();

  console.log(
    "All OKX WebSocket client tests passed successfully.",
  );
}

runOkxWebSocketClientTests();