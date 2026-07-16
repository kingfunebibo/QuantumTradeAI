import assert from "node:assert/strict";

import {
  BybitRestClient,
  BybitRestError,
  buildRequestUrl,
  normalizePath,
  parseBybitResponseEnvelope,
  type BybitHttpTransport,
  type BybitHttpTransportRequest,
  type BybitHttpTransportResponse,
} from "./exchange-connectivity/adapters/bybit/bybit-rest-client";

import {
  FixedBybitClock,
} from "./exchange-connectivity/adapters/bybit/bybit-authentication";

import {
  createBybitConnectorConfiguration,
} from "./exchange-connectivity/adapters/bybit/bybit-connector-config";

const FIXED_TIMESTAMP =
  1_700_000_000_000;

class RecordingTransport
  implements BybitHttpTransport {
  public readonly requests:
    BybitHttpTransportRequest[] = [];

  public constructor(
    private readonly responses:
      readonly BybitHttpTransportResponse[],
  ) {}

  public async execute(
    request: BybitHttpTransportRequest,
  ): Promise<BybitHttpTransportResponse> {
    this.requests.push(request);

    const response =
      this.responses[
        this.requests.length - 1
      ];

    if (!response) {
      throw new Error(
        "No fake response configured.",
      );
    }

    return response;
  }
}

class ThrowingTransport
  implements BybitHttpTransport {
  public async execute():
    Promise<BybitHttpTransportResponse> {
    throw new Error(
      "Simulated transport failure.",
    );
  }
}

function createResponse(
  input: Partial<
    BybitHttpTransportResponse
  > = {},
): BybitHttpTransportResponse {
  return Object.freeze({
    status: input.status ?? 200,
    statusText:
      input.statusText ?? "OK",
    headers:
      input.headers ??
      Object.freeze({
        "content-type":
          "application/json",
      }),
    body:
      input.body ??
      JSON.stringify({
        retCode: 0,
        retMsg: "OK",
        result: {
          value: "success",
        },
        retExtInfo: {},
        time:
          FIXED_TIMESTAMP,
      }),
  });
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
    enablePrivateRest: true,
  });
}

async function testPublicGet(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse(),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const response =
    await client.publicGet<{
      readonly value: string;
    }>({
      path:
        "/v5/market/tickers",
      query: {
        symbol: "BTCUSDT",
        category: "spot",
      },
    });

  assert.equal(
    response.result.value,
    "success",
  );

  assert.equal(
    response.retCode,
    0,
  );

  assert.equal(
    response.retMsg,
    "OK",
  );

  assert.equal(
    response.serverTimeMs,
    FIXED_TIMESTAMP,
  );

  assert.equal(
    response.status,
    200,
  );

  assert.equal(
    transport.requests.length,
    1,
  );

  const request =
    transport.requests[0];

  assert.equal(
    request?.method,
    "GET",
  );

  assert.equal(
    request?.url,
    "https://api-testnet.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT",
  );

  assert.deepEqual(
    request?.headers,
    {
      Accept:
        "application/json",
    },
  );

  assert.equal(
    request?.timeoutMs,
    15_000,
  );

  assert.equal(
    request?.body,
    undefined,
  );
}

async function testPrivateGet(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse(),
    ]);

  const client =
    new BybitRestClient(
      createPrivateConfig(),
      transport,
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  await client.privateGet({
    path:
      "/v5/account/wallet-balance",
    query: {
      accountType: "UNIFIED",
      coin: "USDT",
    },
  });

  const request =
    transport.requests[0];

  assert.equal(
    request?.method,
    "GET",
  );

  assert.equal(
    request?.url,
    "https://api-testnet.bybit.com/v5/account/wallet-balance?accountType=UNIFIED&coin=USDT",
  );

  assert.equal(
    request?.headers[
      "X-BAPI-API-KEY"
    ],
    "test-api-key",
  );

  assert.equal(
    request?.headers[
      "X-BAPI-TIMESTAMP"
    ],
    "1700000000000",
  );

  assert.equal(
    request?.headers[
      "X-BAPI-RECV-WINDOW"
    ],
    "5000",
  );

  assert.equal(
    request?.headers[
      "X-BAPI-SIGN"
    ],
    "078d1761d3cab32461ecc957f58b6297014a17095b44bb400fee959ff360b0aa",
  );
}

async function testPrivatePost(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse(),
    ]);

  const client =
    new BybitRestClient(
      createPrivateConfig(),
      transport,
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  await client.privatePost({
    path: "/v5/order/create",
    body: {
      symbol: "BTCUSDT",
      qty: "1",
      category: "spot",
      side: "Buy",
      orderType: "Market",
    },
  });

  const request =
    transport.requests[0];

  assert.equal(
    request?.method,
    "POST",
  );

  assert.equal(
    request?.url,
    "https://api-testnet.bybit.com/v5/order/create",
  );

  assert.equal(
    request?.body,
    '{"category":"spot","orderType":"Market","qty":"1","side":"Buy","symbol":"BTCUSDT"}',
  );

  assert.equal(
    request?.headers[
      "Content-Type"
    ],
    "application/json",
  );

  assert.equal(
    request?.headers[
      "X-BAPI-API-KEY"
    ],
    "test-api-key",
  );

  assert.equal(
    request?.headers[
      "X-BAPI-TIMESTAMP"
    ],
    "1700000000000",
  );
}

async function testHeaderOverrides(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse(),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  await client.publicGet({
    path: "/v5/market/time",
    headers: {
      Accept: "custom/type",
      "X-Test": "true",
    },
  });

  assert.deepEqual(
    transport.requests[0]
      ?.headers,
    {
      Accept: "custom/type",
      "X-Test": "true",
    },
  );
}

async function testCustomTimeout(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse(),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  await client.publicGet({
    path: "/v5/market/time",
    timeoutMs: 2_500,
  });

  assert.equal(
    transport.requests[0]
      ?.timeoutMs,
    2_500,
  );
}

async function testServerTime(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse({
        body: JSON.stringify({
          retCode: 0,
          retMsg: "OK",
          result: {
            timeSecond:
              "1700000000",
            timeNano:
              "1700000000123456789",
          },
          retExtInfo: {},
          time:
            FIXED_TIMESTAMP,
        }),
      }),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  const result =
    await client.getServerTime();

  assert.equal(
    result.timeSecond,
    "1700000000",
  );

  assert.equal(
    result.timeNano,
    "1700000000123456789",
  );

  assert.equal(
    result.serverTimeMs,
    1_700_000_000_123,
  );

  assert.equal(
    Object.isFrozen(result),
    true,
  );
}

function testEnvelopeParsing(): void {
  const parsed =
    parseBybitResponseEnvelope<{
      readonly orderId: string;
    }>(
      JSON.stringify({
        retCode: 0,
        retMsg: "OK",
        result: {
          orderId: "123",
        },
        retExtInfo: {
          traceId: "abc",
        },
        time:
          FIXED_TIMESTAMP,
      }),
    );

  assert.equal(
    parsed.retCode,
    0,
  );

  assert.equal(
    parsed.retMsg,
    "OK",
  );

  assert.equal(
    parsed.result.orderId,
    "123",
  );

  assert.equal(
    parsed.time,
    FIXED_TIMESTAMP,
  );

  assert.equal(
    Object.isFrozen(parsed),
    true,
  );
}

function testUrlConstruction(): void {
  assert.equal(
    normalizePath(
      "v5/market/time",
    ),
    "/v5/market/time",
  );

  assert.equal(
    normalizePath(
      "/v5/market/time",
    ),
    "/v5/market/time",
  );

  assert.equal(
    buildRequestUrl(
      "https://api.bybit.com/",
      "v5/market/time",
      "",
    ),
    "https://api.bybit.com/v5/market/time",
  );

  assert.equal(
    buildRequestUrl(
      "https://api.bybit.com///",
      "/v5/market/tickers",
      "category=spot",
    ),
    "https://api.bybit.com/v5/market/tickers?category=spot",
  );
}

async function testApiError(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse({
        body: JSON.stringify({
          retCode: 10001,
          retMsg:
            "Request parameter error",
          result: {},
          retExtInfo: {},
          time:
            FIXED_TIMESTAMP,
        }),
      }),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  await assert.rejects(
    () =>
      client.publicGet({
        path:
          "/v5/market/tickers",
      }),
    (error: unknown) =>
      isRestError(
        error,
        "API",
        "BYBIT_API_ERROR",
        {
          retCode: 10001,
          status: 200,
        },
      ),
  );
}

async function testHttpError(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse({
        status: 429,
        statusText:
          "Too Many Requests",
        body:
          '{"error":"rate limited"}',
      }),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  await assert.rejects(
    () =>
      client.publicGet({
        path:
          "/v5/market/time",
      }),
    (error: unknown) =>
      isRestError(
        error,
        "HTTP",
        "BYBIT_HTTP_STATUS_ERROR",
        {
          status: 429,
        },
      ),
  );
}

async function testTransportError(): Promise<void> {
  const client =
    new BybitRestClient(
      createPublicConfig(),
      new ThrowingTransport(),
    );

  await assert.rejects(
    () =>
      client.publicGet({
        path:
          "/v5/market/time",
      }),
    (error: unknown) =>
      isRestError(
        error,
        "TRANSPORT",
        "BYBIT_HTTP_TRANSPORT_ERROR",
      ),
  );
}

async function testInvalidJson(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse({
        body: "{not-json}",
      }),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  await assert.rejects(
    () =>
      client.publicGet({
        path:
          "/v5/market/time",
      }),
    (error: unknown) =>
      isRestError(
        error,
        "PROTOCOL",
        "BYBIT_RESPONSE_JSON_INVALID",
      ),
  );
}

async function testInvalidEnvelope(): Promise<void> {
  const transport =
    new RecordingTransport([
      createResponse({
        body: JSON.stringify({
          retCode: "0",
          retMsg: "OK",
          result: {},
        }),
      }),
    ]);

  const client =
    new BybitRestClient(
      createPublicConfig(),
      transport,
    );

  await assert.rejects(
    () =>
      client.publicGet({
        path:
          "/v5/market/time",
      }),
    (error: unknown) =>
      isRestError(
        error,
        "PROTOCOL",
        "BYBIT_RESPONSE_RETCODE_INVALID",
      ),
  );
}

async function testMissingCredentials(): Promise<void> {
  const client =
    new BybitRestClient(
      createPublicConfig(),
      new RecordingTransport([
        createResponse(),
      ]),
    );

  await assert.rejects(
    () =>
      client.privateGet({
        path:
          "/v5/account/wallet-balance",
      }),
    (error: unknown) =>
      isRestError(
        error,
        "VALIDATION",
        "BYBIT_PRIVATE_CREDENTIALS_REQUIRED",
      ),
  );
}

function testInvalidPath(): void {
  assert.throws(
    () => normalizePath(" "),
    (error: unknown) =>
      isRestError(
        error,
        "VALIDATION",
        "BYBIT_REQUEST_PATH_REQUIRED",
      ),
  );

  assert.throws(
    () =>
      normalizePath(
        "/v5/market/time?x=1",
      ),
    (error: unknown) =>
      isRestError(
        error,
        "VALIDATION",
        "BYBIT_REQUEST_PATH_INVALID",
      ),
  );
}

async function testInvalidServerTime(): Promise<void> {
  const invalidSecond =
    new BybitRestClient(
      createPublicConfig(),
      new RecordingTransport([
        createResponse({
          body: JSON.stringify({
            retCode: 0,
            retMsg: "OK",
            result: {
              timeSecond:
                "not-a-number",
              timeNano:
                "1700000000000000000",
            },
          }),
        }),
      ]),
    );

  await assert.rejects(
    () =>
      invalidSecond.getServerTime(),
    (error: unknown) =>
      isRestError(
        error,
        "PROTOCOL",
        "BYBIT_SERVER_TIME_SECONDS_INVALID",
      ),
  );

  const invalidNano =
    new BybitRestClient(
      createPublicConfig(),
      new RecordingTransport([
        createResponse({
          body: JSON.stringify({
            retCode: 0,
            retMsg: "OK",
            result: {
              timeSecond:
                "1700000000",
              timeNano:
                "invalid",
            },
          }),
        }),
      ]),
    );

  await assert.rejects(
    () =>
      invalidNano.getServerTime(),
    (error: unknown) =>
      isRestError(
        error,
        "PROTOCOL",
        "BYBIT_SERVER_TIME_NANO_INVALID",
      ),
  );
}

async function testDeterministicRequests(): Promise<void> {
  const firstTransport =
    new RecordingTransport([
      createResponse(),
    ]);

  const secondTransport =
    new RecordingTransport([
      createResponse(),
    ]);

  const firstClient =
    new BybitRestClient(
      createPrivateConfig(),
      firstTransport,
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const secondClient =
    new BybitRestClient(
      createPrivateConfig(),
      secondTransport,
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  await firstClient.privateGet({
    path:
      "/v5/account/wallet-balance",
    query: {
      coin: "USDT",
      accountType: "UNIFIED",
    },
  });

  await secondClient.privateGet({
    path:
      "/v5/account/wallet-balance",
    query: {
      accountType: "UNIFIED",
      coin: "USDT",
    },
  });

  assert.deepEqual(
    firstTransport.requests[0],
    secondTransport.requests[0],
  );
}

function testRestErrorIdentity(): void {
  const cause =
    new Error("cause");

  const error =
    new BybitRestError({
      kind: "API",
      code: "TEST_CODE",
      message: "Test message.",
      path: "test.path",
      status: 400,
      retCode: 1,
      retMsg: "Rejected",
      responseBody: "{}",
      cause,
    });

  assert.equal(
    error.name,
    "BybitRestError",
  );

  assert.equal(
    error.kind,
    "API",
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
    error.status,
    400,
  );

  assert.equal(
    error.retCode,
    1,
  );

  assert.equal(
    error.retMsg,
    "Rejected",
  );

  assert.equal(
    error.responseBody,
    "{}",
  );

  assert.equal(
    error.cause,
    cause,
  );

  assert.ok(error instanceof Error);
}

function isRestError(
  error: unknown,
  kind: string,
  code: string,
  expected:
    Readonly<{
      readonly status?: number;
      readonly retCode?: number;
    }> = {},
): boolean {
  return (
    error instanceof
      BybitRestError &&
    error.kind === kind &&
    error.code === code &&
    (
      expected.status ===
        undefined ||
      error.status ===
        expected.status
    ) &&
    (
      expected.retCode ===
        undefined ||
      error.retCode ===
        expected.retCode
    )
  );
}

async function runBybitRestClientTests():
  Promise<void> {
  await testPublicGet();
  await testPrivateGet();
  await testPrivatePost();
  await testHeaderOverrides();
  await testCustomTimeout();
  await testServerTime();
  testEnvelopeParsing();
  testUrlConstruction();
  await testApiError();
  await testHttpError();
  await testTransportError();
  await testInvalidJson();
  await testInvalidEnvelope();
  await testMissingCredentials();
  testInvalidPath();
  await testInvalidServerTime();
  await testDeterministicRequests();
  testRestErrorIdentity();

  console.log(
    "All Bybit REST client tests passed successfully.",
  );
}

void runBybitRestClientTests();
