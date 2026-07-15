import assert from "node:assert/strict";

import {
  OkxRestContractError,
  buildOkxRestRequestPath,
  createOkxPrivateRestRequest,
  createOkxPublicRestRequest,
  createOkxRestApiError,
  createOkxRestFailureResponse,
  createOkxRestHeaders,
  createOkxRestQueryParameters,
  createOkxRestRequest,
  createOkxRestRequestContext,
  createOkxRestResponseEnvelope,
  createOkxRestSuccessResponse,
  isOkxPrivateRestRequest,
  isOkxRestMethod,
  isOkxRestResponseSuccessful,
  normalizeOkxRestPath,
  serializeOkxRestBody,
  serializeOkxRestQuery,
  type OkxRestRequest,
} from "./okx-rest-contracts";

function testPublicGetRequest(): void {
  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/market/ticker",
    query: {
      instId: "BTC-USDT",
      limit: 100,
      active: true,
      ignored: undefined,
      nullable: null,
    },
    headers: {
      Accept: "application/json",
      "X-Request-ID": "request-001",
    },
    requestId: " request-001 ",
  });

  assert.deepEqual(request, {
    method: "GET",
    path: "/api/v5/market/ticker",
    authentication: "public",
    query: {
      active: true,
      instId: "BTC-USDT",
      limit: 100,
    },
    headers: {
      accept: "application/json",
      "x-request-id": "request-001",
    },
    requestId: "request-001",
  });

  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.query), true);
  assert.equal(Object.isFrozen(request.headers), true);
  assert.equal(isOkxPrivateRestRequest(request), false);
}

function testPrivatePostRequest(): void {
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
    requestId: "order-request-001",
  });

  assert.deepEqual(request, {
    method: "POST",
    path: "/api/v5/trade/order",
    authentication: "private",
    body,
    requestId: "order-request-001",
  });

  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.body), true);
  assert.equal(isOkxPrivateRestRequest(request), true);
}

function testDirectRequestCreation(): void {
  const request = createOkxRestRequest({
    method: "DELETE",
    path: "/api/v5/trade/cancel-algos",
    authentication: "private",
    body: [
      {
        algoId: "12345",
        instId: "BTC-USDT",
      },
    ],
  });

  assert.equal(request.method, "DELETE");
  assert.equal(request.authentication, "private");
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.body), true);
}

function testGetRequestRejectsBody(): void {
  assert.throws(
    () =>
      createOkxPublicRestRequest({
        method: "GET",
        path: "/api/v5/market/ticker",
        body: {
          instId: "BTC-USDT",
        },
      }),
    /OKX GET requests must not contain a request body/,
  );
}

function testRequestBodyVariants(): void {
  const stringRequest = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body: '{"instId":"BTC-USDT"}',
  });

  assert.equal(
    stringRequest.body,
    '{"instId":"BTC-USDT"}',
  );

  const nullBodyRequest = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body: null,
  });

  assert.equal(nullBodyRequest.body, null);

  const arrayBodyRequest = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/batch-orders",
    body: [
      {
        instId: "BTC-USDT",
      },
      {
        instId: "ETH-USDT",
      },
    ],
  });

  assert.equal(Object.isFrozen(arrayBodyRequest.body), true);
}

function testResponseEnvelope(): void {
  const envelope = createOkxRestResponseEnvelope({
    code: "0",
    msg: "",
    data: [
      {
        instId: "BTC-USDT",
        last: "65000",
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
        last: "65000",
      },
    ],
    inTime: "1700000000000",
    outTime: "1700000000010",
  });

  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.data), true);
  assert.equal(isOkxRestResponseSuccessful(envelope), true);
}

function testFailureEnvelopeStatus(): void {
  const envelope = createOkxRestResponseEnvelope({
    code: "51000",
    msg: "Parameter error",
    data: [],
  });

  assert.equal(isOkxRestResponseSuccessful(envelope), false);
}

function testInvalidResponseEnvelope(): void {
  assert.throws(
    () =>
      createOkxRestResponseEnvelope({
        code: "",
        msg: "",
        data: [],
      }),
    /response\.code must not be empty/,
  );

  assert.throws(
    () =>
      createOkxRestResponseEnvelope({
        code: "0",
        msg: "",
        data: [],
        inTime: "invalid",
      }),
    /response\.inTime must contain a numeric timestamp/,
  );

  assert.throws(
    () =>
      createOkxRestResponseEnvelope({
        code: "0",
        msg: "",
        data: [],
        outTime: "12.34",
      }),
    /response\.outTime must contain a numeric timestamp/,
  );
}

function testSuccessResponse(): void {
  const response = createOkxRestSuccessResponse({
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-ID": "trace-001",
    },
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

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers, {
    "content-type": "application/json",
    "x-trace-id": "trace-001",
  });
  assert.equal(response.envelope.code, "0");

  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.headers), true);
  assert.equal(Object.isFrozen(response.envelope), true);
}

function testSuccessResponseRejectsFailureCode(): void {
  assert.throws(
    () =>
      createOkxRestSuccessResponse({
        status: 200,
        headers: {},
        envelope: {
          code: "51000",
          msg: "Parameter error",
          data: [],
        },
      }),
    /Cannot create a successful OKX response from code "51000"/,
  );
}

function testApiErrorCreation(): void {
  const cause = new Error("network timeout");

  const error = createOkxRestApiError({
    code: "NETWORK_TIMEOUT",
    message: "Request timed out",
    status: 504,
    requestId: " request-002 ",
    method: "GET",
    path: "/api/v5/market/ticker",
    retryable: true,
    cause,
  });

  assert.deepEqual(error, {
    name: "OkxRestApiError",
    code: "NETWORK_TIMEOUT",
    message: "Request timed out",
    status: 504,
    requestId: "request-002",
    method: "GET",
    path: "/api/v5/market/ticker",
    retryable: true,
    cause,
  });

  assert.equal(Object.isFrozen(error), true);
}

function testApiErrorDefaults(): void {
  const error = createOkxRestApiError({
    code: "51000",
    message: "Parameter error",
  });

  assert.deepEqual(error, {
    name: "OkxRestApiError",
    code: "51000",
    message: "Parameter error",
    retryable: false,
  });
}

function testInvalidApiError(): void {
  assert.throws(
    () =>
      createOkxRestApiError({
        code: "",
        message: "Failure",
      }),
    /error\.code must not be empty/,
  );

  assert.throws(
    () =>
      createOkxRestApiError({
        code: "FAILURE",
        message: "",
      }),
    /error\.message must not be empty/,
  );

  assert.throws(
    () =>
      createOkxRestApiError({
        code: "FAILURE",
        message: "Failure",
        status: 99,
      }),
    /HTTP status must be an integer between 100 and 599/,
  );
}

function testFailureResponse(): void {
  const response = createOkxRestFailureResponse({
    status: 429,
    headers: {
      "Retry-After": "1",
    },
    envelope: {
      code: "50011",
      msg: "Rate limit reached",
      data: [],
    },
    error: {
      name: "OkxRestApiError",
      code: "50011",
      message: "Rate limit reached",
      status: 429,
      method: "GET",
      path: "/api/v5/market/ticker",
      retryable: true,
    },
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 429);
  assert.deepEqual(response.headers, {
    "retry-after": "1",
  });
  assert.equal(response.error.code, "50011");
  assert.equal(response.error.retryable, true);

  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.headers), true);
  assert.equal(Object.isFrozen(response.envelope), true);
  assert.equal(Object.isFrozen(response.error), true);
}

function testQueryParameterNormalization(): void {
  const query = createOkxRestQueryParameters({
    zeta: "last",
    alpha: "first",
    limit: 100,
    enabled: false,
    omitted: undefined,
    nullable: null,
  });

  assert.deepEqual(query, {
    alpha: "first",
    enabled: false,
    limit: 100,
    zeta: "last",
  });

  assert.equal(Object.isFrozen(query), true);
  assert.deepEqual(Object.keys(query), [
    "alpha",
    "enabled",
    "limit",
    "zeta",
  ]);
}

function testInvalidQueryParameters(): void {
  assert.throws(
    () =>
      createOkxRestQueryParameters({
        limit: Number.POSITIVE_INFINITY,
      }),
    /Query parameter "limit" must be a finite primitive value/,
  );

  assert.throws(
    () =>
      createOkxRestQueryParameters({
        limit: Number.NaN,
      }),
    /Query parameter "limit" must be a finite primitive value/,
  );

  assert.throws(
    () =>
      createOkxRestQueryParameters({
        " ": "value",
      }),
    /query parameter name must not be empty/,
  );
}

function testHeaderNormalization(): void {
  const headers = createOkxRestHeaders({
    "X-Zeta": " zeta ",
    Accept: " application/json ",
    "Content-Type": "application/json",
  });

  assert.deepEqual(headers, {
    accept: "application/json",
    "content-type": "application/json",
    "x-zeta": "zeta",
  });

  assert.equal(Object.isFrozen(headers), true);
  assert.deepEqual(Object.keys(headers), [
    "accept",
    "content-type",
    "x-zeta",
  ]);
}

function testInvalidHeaders(): void {
  assert.throws(
    () =>
      createOkxRestHeaders({
        " ": "value",
      }),
    /header name must not be empty/,
  );

  assert.throws(
    () =>
      createOkxRestHeaders({
        Accept: " ",
      }),
    /header "accept" must not be empty/,
  );
}

function testPathNormalization(): void {
  assert.equal(
    normalizeOkxRestPath("/api/v5/market/ticker"),
    "/api/v5/market/ticker",
  );
}

function testInvalidPaths(): void {
  assert.throws(
    () => normalizeOkxRestPath("api/v5/market/ticker"),
    /OKX REST path must begin with "\/"/,
  );

  assert.throws(
    () => normalizeOkxRestPath("/market/ticker"),
    /OKX REST path must begin with "\/api\/v5\/"/,
  );

  assert.throws(
    () =>
      normalizeOkxRestPath(
        "/api/v5/market/ticker?instId=BTC-USDT",
      ),
    /must not contain query parameters or fragments/,
  );

  assert.throws(
    () =>
      normalizeOkxRestPath(
        "/api/v5/market//ticker",
      ),
    /must not contain duplicate slashes/,
  );
}

function testQuerySerialization(): void {
  assert.equal(
    serializeOkxRestQuery({
      instId: "BTC-USDT",
      limit: 100,
      active: true,
    }),
    "active=true&instId=BTC-USDT&limit=100",
  );

  assert.equal(
    serializeOkxRestQuery({
      instId: "BTC USDT",
    }),
    "instId=BTC+USDT",
  );

  assert.equal(
    serializeOkxRestQuery({
      omitted: undefined,
      nullable: null,
    }),
    "",
  );

  assert.equal(serializeOkxRestQuery(undefined), "");
}

function testRequestPathBuilding(): void {
  assert.equal(
    buildOkxRestRequestPath(
      "/api/v5/market/ticker",
      {
        instId: "BTC-USDT",
      },
    ),
    "/api/v5/market/ticker?instId=BTC-USDT",
  );

  assert.equal(
    buildOkxRestRequestPath(
      "/api/v5/public/time",
    ),
    "/api/v5/public/time",
  );
}

function testBodySerialization(): void {
  assert.equal(serializeOkxRestBody(undefined), "");
  assert.equal(serializeOkxRestBody(null), "");
  assert.equal(
    serializeOkxRestBody('{"raw":true}'),
    '{"raw":true}',
  );

  assert.equal(
    serializeOkxRestBody({
      instId: "BTC-USDT",
      side: "buy",
    }),
    '{"instId":"BTC-USDT","side":"buy"}',
  );

  assert.equal(
    serializeOkxRestBody([
      {
        instId: "BTC-USDT",
      },
    ]),
    '[{"instId":"BTC-USDT"}]',
  );
}

function testMethodGuard(): void {
  assert.equal(isOkxRestMethod("GET"), true);
  assert.equal(isOkxRestMethod("POST"), true);
  assert.equal(isOkxRestMethod("PUT"), true);
  assert.equal(isOkxRestMethod("DELETE"), true);

  assert.equal(isOkxRestMethod("get"), false);
  assert.equal(isOkxRestMethod("PATCH"), false);
  assert.equal(isOkxRestMethod(""), false);
}

function testRequestContext(): void {
  const context = createOkxRestRequestContext({
    requestId: " context-001 ",
    method: "POST",
    path: "/api/v5/trade/order",
    authentication: "private",
    createdAt: 1_700_000_000_000,
  });

  assert.deepEqual(context, {
    requestId: "context-001",
    method: "POST",
    path: "/api/v5/trade/order",
    authentication: "private",
    createdAt: 1_700_000_000_000,
  });

  assert.equal(Object.isFrozen(context), true);
}

function testInvalidRequestContext(): void {
  assert.throws(
    () =>
      createOkxRestRequestContext({
        requestId: "",
        method: "GET",
        path: "/api/v5/public/time",
        authentication: "public",
        createdAt: 0,
      }),
    /requestContext\.requestId must not be empty/,
  );

  assert.throws(
    () =>
      createOkxRestRequestContext({
        requestId: "context-001",
        method: "GET",
        path: "/api/v5/public/time",
        authentication: "public",
        createdAt: -1,
      }),
    /requestContext\.createdAt must be a non-negative integer timestamp/,
  );

  assert.throws(
    () =>
      createOkxRestRequestContext({
        requestId: "context-001",
        method: "GET",
        path: "/api/v5/public/time",
        authentication: "public",
        createdAt: 1.5,
      }),
    /requestContext\.createdAt must be a non-negative integer timestamp/,
  );
}

function testContractErrorIdentity(): void {
  const error = new OkxRestContractError(
    "Contract validation failed.",
  );

  assert.equal(error.name, "OkxRestContractError");
  assert.equal(error.code, "OKX_REST_CONTRACT_ERROR");
  assert.equal(
    error.message,
    "Contract validation failed.",
  );
  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxRestContractError);
}

function testDeterministicQuerySerialization(): void {
  const query = {
    limit: 100,
    instId: "BTC-USDT",
    active: true,
  };

  const first = serializeOkxRestQuery(query);
  const second = serializeOkxRestQuery(query);

  assert.equal(first, second);
  assert.equal(
    first,
    "active=true&instId=BTC-USDT&limit=100",
  );
}

function testIndependentImmutableRequests(): void {
  const input: OkxRestRequest = {
    method: "GET",
    path: "/api/v5/market/ticker",
    authentication: "public",
    query: {
      instId: "BTC-USDT",
    },
  };

  const first = createOkxRestRequest(input);
  const second = createOkxRestRequest(input);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.query, second.query);

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(second), true);
}

function runOkxRestContractTests(): void {
  testPublicGetRequest();
  testPrivatePostRequest();
  testDirectRequestCreation();
  testGetRequestRejectsBody();
  testRequestBodyVariants();
  testResponseEnvelope();
  testFailureEnvelopeStatus();
  testInvalidResponseEnvelope();
  testSuccessResponse();
  testSuccessResponseRejectsFailureCode();
  testApiErrorCreation();
  testApiErrorDefaults();
  testInvalidApiError();
  testFailureResponse();
  testQueryParameterNormalization();
  testInvalidQueryParameters();
  testHeaderNormalization();
  testInvalidHeaders();
  testPathNormalization();
  testInvalidPaths();
  testQuerySerialization();
  testRequestPathBuilding();
  testBodySerialization();
  testMethodGuard();
  testRequestContext();
  testInvalidRequestContext();
  testContractErrorIdentity();
  testDeterministicQuerySerialization();
  testIndependentImmutableRequests();

  console.log(
    "All OKX REST contract tests passed successfully.",
  );
}

runOkxRestContractTests();