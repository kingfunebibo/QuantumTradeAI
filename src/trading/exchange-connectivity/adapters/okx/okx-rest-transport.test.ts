import assert from "node:assert/strict";

import {
  DefaultOkxRestTransport,
  DeterministicOkxMockTransport,
  OkxRestTransportError,
  createDefaultOkxRestTransportErrorMapper,
  createOkxRawHttpResponse,
  createOkxRestTransportRequest,
  createOkxRestTransportResult,
  createStaticOkxRestTransportExecutor,
  createThrowingOkxRestTransportExecutor,
  isRetryableHttpStatus,
  parseOkxRestResponseEnvelope,
} from "./okx-rest-transport";

import {
  createOkxPrivateRestRequest,
  createOkxPublicRestRequest,
  createOkxRestFailureResponse,
  createOkxRestSuccessResponse,
  type OkxRestBody,
  type OkxRestResult,
} from "./okx-rest-contracts";

function testTransportRequestCreation(): void {
  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/market/ticker",
    query: {
      instId: "BTC-USDT",
    },
    requestId: "request-001",
  });

  const transportRequest = createOkxRestTransportRequest({
    url:
      "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    request,
    headers: {
      Accept: "application/json",
    },
    serializedBody: "",
    timeoutMs: 15_000,
  });

  assert.deepEqual(transportRequest, {
    url:
      "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    request,
    headers: {
      accept: "application/json",
    },
    serializedBody: "",
    timeoutMs: 15_000,
  });

  assert.equal(
    Object.isFrozen(transportRequest),
    true,
  );

  assert.equal(
    Object.isFrozen(transportRequest.headers),
    true,
  );
}

function testTransportRequestWithPostBody(): void {
  const body = {
    instId: "BTC-USDT",
    tdMode: "cash",
    side: "buy",
    ordType: "market",
    sz: "0.01",
  } as const;

  const request = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body,
  });

  const serializedBody = JSON.stringify(body);

  const transportRequest = createOkxRestTransportRequest({
    url: "https://www.okx.com/api/v5/trade/order",
    request,
    headers: {
      "Content-Type": "application/json",
    },
    serializedBody,
    timeoutMs: 20_000,
  });

  assert.equal(
    transportRequest.serializedBody,
    serializedBody,
  );

  assert.equal(
    transportRequest.headers["content-type"],
    "application/json",
  );
}

function testInvalidTransportRequest(): void {
  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  assert.throws(
    () =>
      createOkxRestTransportRequest({
        url: "",
        request,
        headers: {},
        serializedBody: "",
        timeoutMs: 1_000,
      }),
    /url must not be empty/,
  );

  assert.throws(
    () =>
      createOkxRestTransportRequest({
        url: "not-a-url",
        request,
        headers: {},
        serializedBody: "",
        timeoutMs: 1_000,
      }),
    /url must be a valid absolute URL/,
  );

  assert.throws(
    () =>
      createOkxRestTransportRequest({
        url: "ftp://example.com/resource",
        request,
        headers: {},
        serializedBody: "",
        timeoutMs: 1_000,
      }),
    /url must use the HTTP or HTTPS protocol/,
  );

  assert.throws(
    () =>
      createOkxRestTransportRequest({
        url: "https://www.okx.com/api/v5/public/time",
        request,
        headers: {},
        serializedBody: "",
        timeoutMs: 0,
      }),
    /timeoutMs must be a positive integer/,
  );
}

function testRawHttpResponseCreation(): void {
  const response = createOkxRawHttpResponse({
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      code: "0",
      msg: "",
      data: [],
    },
  });

  assert.deepEqual(response, {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    body: {
      code: "0",
      msg: "",
      data: [],
    },
  });

  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.headers), true);
}

function testInvalidRawHttpResponse(): void {
  assert.throws(
    () =>
      createOkxRawHttpResponse({
        status: 99,
        headers: {},
        body: {},
      }),
    /HTTP status must be an integer between 100 and 599/,
  );

  assert.throws(
    () =>
      createOkxRawHttpResponse({
        status: 600,
        headers: {},
        body: {},
      }),
    /HTTP status must be an integer between 100 and 599/,
  );
}

function testResponseEnvelopeParsing(): void {
  const envelope = parseOkxRestResponseEnvelope<{
    instId: string;
  }>({
    code: "0",
    msg: "",
    data: [
      {
        instId: "BTC-USDT",
      },
    ],
    inTime: "1700000000000",
    outTime: "1700000000010",
  });

  assert.deepEqual(envelope, {
    code: "0",
    msg: "",
    data: [
      {
        instId: "BTC-USDT",
      },
    ],
    inTime: "1700000000000",
    outTime: "1700000000010",
  });

  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.data), true);
}

function testInvalidResponseEnvelopeParsing(): void {
  assert.throws(
    () => parseOkxRestResponseEnvelope(null),
    /OKX REST response payload must be an object/,
  );

  assert.throws(
    () => parseOkxRestResponseEnvelope([]),
    /OKX REST response payload must be an object/,
  );

  assert.throws(
    () =>
      parseOkxRestResponseEnvelope({
        code: 0,
        msg: "",
        data: [],
      }),
    /payload code must be a string/,
  );

  assert.throws(
    () =>
      parseOkxRestResponseEnvelope({
        code: "0",
        msg: 1,
        data: [],
      }),
    /payload msg must be a string/,
  );

  assert.throws(
    () =>
      parseOkxRestResponseEnvelope({
        code: "0",
        msg: "",
        data: {},
      }),
    /payload data must be an array/,
  );
}

function testSuccessfulTransportResult(): void {
  const result = createOkxRestTransportResult<{
    instId: string;
  }>({
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    payload: {
      code: "0",
      msg: "",
      data: [
        {
          instId: "BTC-USDT",
        },
      ],
    },
    requestId: "request-001",
  });

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("Expected successful transport result.");
  }

  assert.equal(result.status, 200);
  assert.equal(result.envelope.code, "0");

  assert.deepEqual(result.envelope.data, [
    {
      instId: "BTC-USDT",
    },
  ]);
}

function testApiFailureTransportResult(): void {
  const result = createOkxRestTransportResult({
    status: 200,
    headers: {},
    payload: {
      code: "51000",
      msg: "Parameter error",
      data: [],
    },
    requestId: "request-002",
  });

  assert.equal(result.ok, false);

  if (result.ok) {
    assert.fail("Expected failure transport result.");
  }

  assert.equal(result.status, 200);
  assert.equal(result.error.code, "51000");
  assert.equal(result.error.message, "Parameter error");
  assert.equal(result.error.requestId, "request-002");
  assert.equal(result.error.retryable, false);
}

function testHttpFailureTransportResult(): void {
  const result = createOkxRestTransportResult({
    status: 429,
    headers: {
      "Retry-After": "1",
    },
    payload: {
      code: "50011",
      msg: "Rate limit reached",
      data: [],
    },
  });

  assert.equal(result.ok, false);

  if (result.ok) {
    assert.fail("Expected failure transport result.");
  }

  assert.equal(result.status, 429);
  assert.equal(result.error.retryable, true);
  assert.equal(result.headers["retry-after"], "1");
}

function testRetryableStatuses(): void {
  assert.equal(isRetryableHttpStatus(408), true);
  assert.equal(isRetryableHttpStatus(425), true);
  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(500), true);
  assert.equal(isRetryableHttpStatus(503), true);
  assert.equal(isRetryableHttpStatus(599), true);

  assert.equal(isRetryableHttpStatus(200), false);
  assert.equal(isRetryableHttpStatus(400), false);
  assert.equal(isRetryableHttpStatus(401), false);
  assert.equal(isRetryableHttpStatus(404), false);
}

async function testDefaultTransportSuccess(): Promise<void> {
  const executor = createStaticOkxRestTransportExecutor([
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        code: "0",
        msg: "",
        data: [
          {
            instId: "BTC-USDT",
          },
        ],
      },
    },
  ]);

  const transport = new DefaultOkxRestTransport(
    executor,
    createDefaultOkxRestTransportErrorMapper(),
  );

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/market/ticker",
    query: {
      instId: "BTC-USDT",
    },
    requestId: "request-003",
  });

  const result = await transport.execute<{
    instId: string;
  }>({
    url:
      "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    request,
    headers: {},
    serializedBody: "",
    timeoutMs: 15_000,
  });

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("Expected successful result.");
  }

  assert.deepEqual(result.envelope.data, [
    {
      instId: "BTC-USDT",
    },
  ]);
}

async function testDefaultTransportFailureMapping(): Promise<void> {
  const thrownError = new Error("socket timeout");

  const transport = new DefaultOkxRestTransport(
    createThrowingOkxRestTransportExecutor([
      thrownError,
    ]),
    createDefaultOkxRestTransportErrorMapper(),
  );

  const request = createOkxPrivateRestRequest({
    method: "GET",
    path: "/api/v5/account/balance",
    requestId: "request-004",
  });

  const result = await transport.execute({
    url:
      "https://www.okx.com/api/v5/account/balance",
    request,
    headers: {},
    serializedBody: "",
    timeoutMs: 15_000,
  });

  assert.equal(result.ok, false);

  if (result.ok) {
    assert.fail("Expected transport failure.");
  }

  assert.equal(result.status, 503);
  assert.equal(
    result.error.code,
    "OKX_TRANSPORT_FAILURE",
  );
  assert.equal(result.error.message, "socket timeout");
  assert.equal(result.error.retryable, true);
  assert.equal(result.error.requestId, "request-004");
  assert.equal(result.error.method, "GET");
  assert.equal(
    result.error.path,
    "/api/v5/account/balance",
  );
  assert.equal(result.error.cause, thrownError);
}

async function testStaticExecutorSequence(): Promise<void> {
  const executor = createStaticOkxRestTransportExecutor([
    {
      status: 200,
      headers: {},
      body: {
        code: "0",
        msg: "",
        data: [
          {
            sequence: 1,
          },
        ],
      },
    },
    {
      status: 200,
      headers: {},
      body: {
        code: "0",
        msg: "",
        data: [
          {
            sequence: 2,
          },
        ],
      },
    },
  ]);

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  const transportRequest =
    createOkxRestTransportRequest({
      url:
        "https://www.okx.com/api/v5/public/time",
      request,
      headers: {},
      serializedBody: "",
      timeoutMs: 5_000,
    });

  const first = await executor.execute(
    transportRequest as never,
  );

  const second = await executor.execute(
    transportRequest as never,
  );

  const third = await executor.execute(
    transportRequest as never,
  );

  assert.deepEqual(first.body, {
    code: "0",
    msg: "",
    data: [
      {
        sequence: 1,
      },
    ],
  });

  assert.deepEqual(second.body, {
    code: "0",
    msg: "",
    data: [
      {
        sequence: 2,
      },
    ],
  });

  assert.equal(third, second);
}

async function testDeterministicMockTransport(): Promise<void> {
  const successResult = createOkxRestSuccessResponse({
    status: 200,
    headers: {},
    envelope: {
      code: "0",
      msg: "",
      data: [
        {
          instId: "BTC-USDT",
        },
      ],
    },
  });

  const failureResult = createOkxRestFailureResponse({
    status: 400,
    headers: {},
    envelope: {
      code: "51000",
      msg: "Parameter error",
      data: [],
    },
    error: {
      name: "OkxRestApiError",
      code: "51000",
      message: "Parameter error",
      status: 400,
      retryable: false,
    },
  });

  const mock = new DeterministicOkxMockTransport([
    {
      match: (request) =>
        request.request.path ===
        "/api/v5/market/ticker",
      result: successResult,
    },
    {
      match: (request) =>
        request.request.path ===
        "/api/v5/trade/order",
      result: failureResult,
    },
  ]);

  const marketRequest = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/market/ticker",
  });

  const marketResult = await mock.execute({
    url:
      "https://www.okx.com/api/v5/market/ticker",
    request: marketRequest,
    headers: {},
    serializedBody: "",
    timeoutMs: 5_000,
  });

  assert.equal(marketResult.ok, true);
  assert.equal(mock.getExecutionCount(), 1);
  assert.equal(
    mock.getRemainingExpectationCount(),
    1,
  );

  const orderRequest = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body: {
      instId: "BTC-USDT",
    },
  });

  const orderResult = await mock.execute({
    url:
      "https://www.okx.com/api/v5/trade/order",
    request: orderRequest,
    headers: {},
    serializedBody:
      '{"instId":"BTC-USDT"}',
    timeoutMs: 5_000,
  });

  assert.equal(orderResult.ok, false);
  assert.equal(mock.getExecutionCount(), 2);
  assert.equal(
    mock.getRemainingExpectationCount(),
    0,
  );

  assert.doesNotThrow(() =>
    mock.assertAllExpectationsConsumed(),
  );
}

async function testMockTransportMismatch(): Promise<void> {
  const result = createOkxRestSuccessResponse({
    status: 200,
    headers: {},
    envelope: {
      code: "0",
      msg: "",
      data: [],
    },
  });

  const mock = new DeterministicOkxMockTransport([
    {
      match: (request) =>
        request.request.path ===
        "/api/v5/public/time",
      result,
    },
  ]);

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/market/ticker",
  });

  await assert.rejects(
    () =>
      mock.execute({
        url:
          "https://www.okx.com/api/v5/market/ticker",
        request,
        headers: {},
        serializedBody: "",
        timeoutMs: 5_000,
      }),
    /did not match the request/,
  );
}

function testMockTransportUnconsumedExpectation(): void {
  const result = createOkxRestSuccessResponse({
    status: 200,
    headers: {},
    envelope: {
      code: "0",
      msg: "",
      data: [],
    },
  });

  const mock = new DeterministicOkxMockTransport([
    {
      match: () => true,
      result,
    },
  ]);

  assert.throws(
    () => mock.assertAllExpectationsConsumed(),
    /1 deterministic OKX mock expectation\(s\) were not consumed/,
  );
}

function testTransportErrorIdentity(): void {
  const error = new OkxRestTransportError(
    "Transport failed.",
  );

  assert.equal(error.name, "OkxRestTransportError");
  assert.equal(
    error.code,
    "OKX_REST_TRANSPORT_ERROR",
  );
  assert.equal(error.message, "Transport failed.");
  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxRestTransportError);
}

function testDeterministicResultCreation(): void {
  const input = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    payload: {
      code: "0",
      msg: "",
      data: [
        {
          instId: "BTC-USDT",
        },
      ],
    },
  };

  const first = createOkxRestTransportResult(input);
  const second = createOkxRestTransportResult(input);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
}

async function runOkxRestTransportTests(): Promise<void> {
  testTransportRequestCreation();
  testTransportRequestWithPostBody();
  testInvalidTransportRequest();
  testRawHttpResponseCreation();
  testInvalidRawHttpResponse();
  testResponseEnvelopeParsing();
  testInvalidResponseEnvelopeParsing();
  testSuccessfulTransportResult();
  testApiFailureTransportResult();
  testHttpFailureTransportResult();
  testRetryableStatuses();
  await testDefaultTransportSuccess();
  await testDefaultTransportFailureMapping();
  await testStaticExecutorSequence();
  await testDeterministicMockTransport();
  await testMockTransportMismatch();
  testMockTransportUnconsumedExpectation();
  testTransportErrorIdentity();
  testDeterministicResultCreation();

  console.log(
    "All OKX REST transport tests passed successfully.",
  );
}

void runOkxRestTransportTests();