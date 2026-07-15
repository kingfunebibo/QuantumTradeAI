import assert from "node:assert/strict";

import {
  OkxWebSocketContractError,
  createOkxWebSocketChannelArgument,
  createOkxWebSocketConnectionDescriptor,
  createOkxWebSocketEventMessage,
  createOkxWebSocketLoginRequest,
  createOkxWebSocketOperationResponse,
  createOkxWebSocketPushMessage,
  createOkxWebSocketSubscriptionRequest,
  isOkxWebSocketErrorMessage,
  isOkxWebSocketEventMessage,
  isOkxWebSocketNoticeMessage,
  isOkxWebSocketOperationResponse,
  isOkxWebSocketPushMessage,
  isOkxWebSocketScope,
  parseOkxWebSocketMessage,
  serializeOkxWebSocketRequest,
} from "./okx-websocket-contracts";

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

function testChannelArgumentCreation(): void {
  const argument = createOkxWebSocketChannelArgument({
    channel: " tickers ",
    instType: " SPOT ",
    instFamily: " BTC-USDT ",
    instId: " BTC-USDT ",
    uly: " BTC-USDT ",
    ccy: " USDT ",
    extraParams: '{"updateInterval":"0"}',
  });

  assert.deepEqual(argument, {
    channel: "tickers",
    instType: "SPOT",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT",
    uly: "BTC-USDT",
    ccy: "USDT",
    extraParams: '{"updateInterval":"0"}',
  });

  assert.equal(Object.isFrozen(argument), true);
}

function testMinimalChannelArgument(): void {
  const argument = createOkxWebSocketChannelArgument({
    channel: "orders",
  });

  assert.deepEqual(argument, {
    channel: "orders",
  });
}

function testInvalidChannelArguments(): void {
  assert.throws(
    () =>
      createOkxWebSocketChannelArgument({
        channel: " ",
      }),
    /channel must not be empty/,
  );

  assert.throws(
    () =>
      createOkxWebSocketChannelArgument({
        channel: "tickers",
        instId: " ",
      }),
    /instId must not be empty/,
  );
}

function testLoginRequestCreation(): void {
  const request = createOkxWebSocketLoginRequest({
    credentials: TEST_CREDENTIALS,
    timestamp: "1700000000",
    signature: "generated-signature",
  });

  assert.deepEqual(request, {
    op: "login",
    args: [
      {
        apiKey: "test-api-key",
        passphrase: "test-passphrase",
        timestamp: "1700000000",
        sign: "generated-signature",
      },
    ],
  });

  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.args), true);
  assert.equal(Object.isFrozen(request.args[0]), true);
  assert.equal(request.args.length, 1);
}

function testInvalidLoginRequest(): void {
  assert.throws(
    () =>
      createOkxWebSocketLoginRequest({
        credentials: {
          apiKey: "",
          secretKey: "secret",
          passphrase: "passphrase",
        },
        timestamp: "1700000000",
        signature: "signature",
      }),
    /credentials\.apiKey must not be empty/,
  );

  assert.throws(
    () =>
      createOkxWebSocketLoginRequest({
        credentials: TEST_CREDENTIALS,
        timestamp: "2023-11-14T22:13:20.000Z",
        signature: "signature",
      }),
    /timestamp must contain Unix epoch seconds/,
  );

  assert.throws(
    () =>
      createOkxWebSocketLoginRequest({
        credentials: TEST_CREDENTIALS,
        timestamp: "1700000000",
        signature: " ",
      }),
    /signature must not be empty/,
  );
}

function testSubscriptionRequestCreation(): void {
  const request = createOkxWebSocketSubscriptionRequest({
    operation: "subscribe",
    requestId: " subscription-001 ",
    arguments: [
      {
        channel: "tickers",
        instId: "BTC-USDT",
      },
      {
        channel: "books",
        instId: "ETH-USDT",
      },
    ],
  });

  assert.deepEqual(request, {
    id: "subscription-001",
    op: "subscribe",
    args: [
      {
        channel: "tickers",
        instId: "BTC-USDT",
      },
      {
        channel: "books",
        instId: "ETH-USDT",
      },
    ],
  });

  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.args), true);
  assert.equal(Object.isFrozen(request.args[0]), true);
  assert.equal(Object.isFrozen(request.args[1]), true);
}

function testUnsubscriptionRequestCreation(): void {
  const request = createOkxWebSocketSubscriptionRequest({
    operation: "unsubscribe",
    arguments: [
      {
        channel: "orders",
        instType: "ANY",
      },
    ],
  });

  assert.deepEqual(request, {
    op: "unsubscribe",
    args: [
      {
        channel: "orders",
        instType: "ANY",
      },
    ],
  });
}

function testInvalidSubscriptionRequests(): void {
  assert.throws(
    () =>
      createOkxWebSocketSubscriptionRequest({
        operation: "login" as never,
        arguments: [
          {
            channel: "tickers",
          },
        ],
      }),
    /Unsupported OKX WebSocket operation/,
  );

  assert.throws(
    () =>
      createOkxWebSocketSubscriptionRequest({
        operation: "subscribe",
        arguments: [],
      }),
    /arguments must contain at least one channel argument/,
  );

  assert.throws(
    () =>
      createOkxWebSocketSubscriptionRequest({
        operation: "subscribe",
        requestId: " ",
        arguments: [
          {
            channel: "tickers",
          },
        ],
      }),
    /requestId must not be empty/,
  );
}

function testConnectionDescriptors(): void {
  const publicDescriptor =
    createOkxWebSocketConnectionDescriptor({
      scope: "public",
      url: "wss://ws.okx.com:8443/ws/v5/public",
      authenticated: false,
    });

  assert.deepEqual(publicDescriptor, {
    scope: "public",
    url: "wss://ws.okx.com:8443/ws/v5/public",
    authenticated: false,
  });

  assert.equal(Object.isFrozen(publicDescriptor), true);

  const privateDescriptor =
    createOkxWebSocketConnectionDescriptor({
      scope: "private",
      url: "wss://ws.okx.com:8443/ws/v5/private",
      authenticated: true,
    });

  assert.equal(privateDescriptor.scope, "private");
  assert.equal(privateDescriptor.authenticated, true);
}

function testInvalidConnectionDescriptors(): void {
  assert.throws(
    () =>
      createOkxWebSocketConnectionDescriptor({
        scope: "public",
        url: "wss://ws.okx.com:8443/ws/v5/public",
        authenticated: true,
      }),
    /Public OKX WebSocket connections must not be marked authenticated/,
  );

  assert.throws(
    () =>
      createOkxWebSocketConnectionDescriptor({
        scope: "invalid" as never,
        url: "wss://ws.okx.com:8443/ws/v5/public",
        authenticated: false,
      }),
    /Unsupported OKX WebSocket scope/,
  );

  assert.throws(
    () =>
      createOkxWebSocketConnectionDescriptor({
        scope: "public",
        url: "https://www.okx.com",
        authenticated: false,
      }),
    /url must use the WS or WSS protocol/,
  );

  assert.throws(
    () =>
      createOkxWebSocketConnectionDescriptor({
        scope: "public",
        url: "not-a-url",
        authenticated: false,
      }),
    /url must be a valid absolute URL/,
  );
}

function testMessageParsing(): void {
  const parsed = parseOkxWebSocketMessage(
    '{"event":"login","code":"0","msg":""}',
  );

  assert.deepEqual(parsed, {
    event: "login",
    code: "0",
    msg: "",
  });
}

function testInvalidMessageParsing(): void {
  assert.throws(
    () => parseOkxWebSocketMessage(" "),
    /rawMessage must not be empty/,
  );

  assert.throws(
    () => parseOkxWebSocketMessage("not-json"),
    /OKX WebSocket message must contain valid JSON/,
  );
}

function testEventMessageGuard(): void {
  assert.equal(
    isOkxWebSocketEventMessage({
      event: "login",
      code: "0",
      msg: "",
    }),
    true,
  );

  assert.equal(
    isOkxWebSocketEventMessage({
      event: "unknown",
    }),
    false,
  );

  assert.equal(
    isOkxWebSocketEventMessage(null),
    false,
  );
}

function testPushMessageGuard(): void {
  assert.equal(
    isOkxWebSocketPushMessage({
      arg: {
        channel: "tickers",
        instId: "BTC-USDT",
      },
      data: [
        {
          last: "65000",
        },
      ],
    }),
    true,
  );

  assert.equal(
    isOkxWebSocketPushMessage({
      arg: {
        channel: "books",
      },
      action: "snapshot",
      data: [],
    }),
    true,
  );

  assert.equal(
    isOkxWebSocketPushMessage({
      arg: {
        channel: "",
      },
      data: [],
    }),
    false,
  );

  assert.equal(
    isOkxWebSocketPushMessage({
      arg: {
        channel: "books",
      },
      action: "replace",
      data: [],
    }),
    false,
  );
}

function testOperationResponseGuard(): void {
  assert.equal(
    isOkxWebSocketOperationResponse({
      id: "request-001",
      op: "order",
      code: "0",
      msg: "",
      data: [],
    }),
    true,
  );

  assert.equal(
    isOkxWebSocketOperationResponse({
      id: "request-001",
      op: "order",
      code: 0,
      msg: "",
    }),
    false,
  );

  assert.equal(
    isOkxWebSocketOperationResponse({
      id: "request-001",
      op: "order",
      code: "0",
      msg: "",
      data: {},
    }),
    false,
  );
}

function testErrorAndNoticeGuards(): void {
  assert.equal(
    isOkxWebSocketErrorMessage({
      event: "error",
      code: "60012",
      msg: "Invalid request",
    }),
    true,
  );

  assert.equal(
    isOkxWebSocketErrorMessage({
      event: "error",
      code: 60012,
      msg: "Invalid request",
    }),
    false,
  );

  assert.equal(
    isOkxWebSocketNoticeMessage({
      event: "notice",
      code: "64008",
      msg: "Service upgrade",
    }),
    true,
  );

  assert.equal(
    isOkxWebSocketNoticeMessage({
      event: "login",
      code: "0",
      msg: "",
    }),
    false,
  );
}

function testRequestSerialization(): void {
  const request = createOkxWebSocketSubscriptionRequest({
    operation: "subscribe",
    requestId: "request-001",
    arguments: [
      {
        channel: "tickers",
        instId: "BTC-USDT",
      },
    ],
  });

  assert.equal(
    serializeOkxWebSocketRequest(request),
    '{"id":"request-001","op":"subscribe","args":[{"channel":"tickers","instId":"BTC-USDT"}]}',
  );
}

function testEventMessageCreation(): void {
  const message = createOkxWebSocketEventMessage({
    event: "subscribe",
    code: "0",
    msg: "",
    connId: " connection-001 ",
    id: " request-001 ",
    arg: {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  });

  assert.deepEqual(message, {
    event: "subscribe",
    code: "0",
    msg: "",
    connId: "connection-001",
    id: "request-001",
    arg: {
      channel: "tickers",
      instId: "BTC-USDT",
    },
  });

  assert.equal(Object.isFrozen(message), true);
  assert.equal(Object.isFrozen(message.arg), true);
}

function testInvalidEventMessageCreation(): void {
  assert.throws(
    () =>
      createOkxWebSocketEventMessage({
        event: "unknown" as never,
      }),
    /Unsupported OKX WebSocket event/,
  );

  assert.throws(
    () =>
      createOkxWebSocketEventMessage({
        event: "login",
        code: " ",
      }),
    /code must not be empty/,
  );
}

function testPushMessageCreation(): void {
  const message = createOkxWebSocketPushMessage({
    arg: {
      channel: "books",
      instId: "BTC-USDT",
    },
    action: "snapshot",
    data: [
      {
        bids: [],
        asks: [],
      },
    ],
  });

  assert.deepEqual(message, {
    arg: {
      channel: "books",
      instId: "BTC-USDT",
    },
    action: "snapshot",
    data: [
      {
        bids: [],
        asks: [],
      },
    ],
  });

  assert.equal(Object.isFrozen(message), true);
  assert.equal(Object.isFrozen(message.arg), true);
  assert.equal(Object.isFrozen(message.data), true);
}

function testInvalidPushMessageCreation(): void {
  assert.throws(
    () =>
      createOkxWebSocketPushMessage({
        arg: {
          channel: "books",
        },
        action: "replace" as never,
        data: [],
      }),
    /Unsupported OKX WebSocket action/,
  );
}

function testOperationResponseCreation(): void {
  const response = createOkxWebSocketOperationResponse({
    id: " operation-001 ",
    op: "order",
    code: "0",
    msg: "",
    data: [
      {
        ordId: "12345",
      },
    ],
    inTime: "1700000000000",
    outTime: "1700000000010",
  });

  assert.deepEqual(response, {
    id: "operation-001",
    op: "order",
    code: "0",
    msg: "",
    data: [
      {
        ordId: "12345",
      },
    ],
    inTime: "1700000000000",
    outTime: "1700000000010",
  });

  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.data), true);
}

function testInvalidOperationResponseCreation(): void {
  assert.throws(
    () =>
      createOkxWebSocketOperationResponse({
        id: " ",
        op: "order",
        code: "0",
        msg: "",
      }),
    /id must not be empty/,
  );

  assert.throws(
    () =>
      createOkxWebSocketOperationResponse({
        id: "1",
        op: "order",
        code: "0",
        msg: "",
        inTime: "invalid",
      }),
    /inTime must contain a numeric timestamp/,
  );
}

function testScopeGuard(): void {
  assert.equal(isOkxWebSocketScope("public"), true);
  assert.equal(isOkxWebSocketScope("private"), true);
  assert.equal(isOkxWebSocketScope("business"), true);

  assert.equal(isOkxWebSocketScope("PUBLIC"), false);
  assert.equal(isOkxWebSocketScope("unknown"), false);
  assert.equal(isOkxWebSocketScope(""), false);
}

function testContractErrorIdentity(): void {
  const error = new OkxWebSocketContractError(
    "WebSocket contract failed.",
  );

  assert.equal(
    error.name,
    "OkxWebSocketContractError",
  );

  assert.equal(
    error.code,
    "OKX_WEBSOCKET_CONTRACT_ERROR",
  );

  assert.equal(
    error.message,
    "WebSocket contract failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxWebSocketContractError);
}

function testDeterministicRequestCreation(): void {
  const input = {
    operation: "subscribe" as const,
    requestId: "request-001",
    arguments: [
      {
        channel: "tickers",
        instId: "BTC-USDT",
      },
    ],
  };

  const first =
    createOkxWebSocketSubscriptionRequest(input);

  const second =
    createOkxWebSocketSubscriptionRequest(input);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.args, second.args);
}

function runOkxWebSocketContractTests(): void {
  testChannelArgumentCreation();
  testMinimalChannelArgument();
  testInvalidChannelArguments();
  testLoginRequestCreation();
  testInvalidLoginRequest();
  testSubscriptionRequestCreation();
  testUnsubscriptionRequestCreation();
  testInvalidSubscriptionRequests();
  testConnectionDescriptors();
  testInvalidConnectionDescriptors();
  testMessageParsing();
  testInvalidMessageParsing();
  testEventMessageGuard();
  testPushMessageGuard();
  testOperationResponseGuard();
  testErrorAndNoticeGuards();
  testRequestSerialization();
  testEventMessageCreation();
  testInvalidEventMessageCreation();
  testPushMessageCreation();
  testInvalidPushMessageCreation();
  testOperationResponseCreation();
  testInvalidOperationResponseCreation();
  testScopeGuard();
  testContractErrorIdentity();
  testDeterministicRequestCreation();

  console.log(
    "All OKX WebSocket contract tests passed successfully.",
  );
}

runOkxWebSocketContractTests();