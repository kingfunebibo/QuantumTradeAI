import assert from "node:assert/strict";

import {
  createDeterministicOkxClock,
} from "./okx-authentication";

import {
  createOkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createOkxRestFailureResponse,
  createOkxRestSuccessResponse,
  type OkxRestBody,
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  DeterministicOkxMockTransport,
  type OkxRestTransport,
  type OkxRestTransportRequest,
} from "./okx-rest-transport";

import {
  OkxRestAdapter,
  OkxRestAdapterError,
  buildAbsoluteOkxUrl,
  createDeterministicOkxRequestIdGenerator,
  createSequentialOkxRequestIdGenerator,
} from "./okx-rest-adapter";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

function testDeterministicRequestIdGenerator(): void {
  const generator =
    createDeterministicOkxRequestIdGenerator([
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
      createDeterministicOkxRequestIdGenerator([]),
    /ids must contain at least one request ID/,
  );

  assert.throws(
    () =>
      createDeterministicOkxRequestIdGenerator([
        " ",
      ]),
    /ids\[0\] must not be empty/,
  );
}

function testSequentialRequestIdGenerator(): void {
  const generator =
    createSequentialOkxRequestIdGenerator(
      "okx-test",
      5,
    );

  assert.equal(Object.isFrozen(generator), true);
  assert.equal(generator.nextId(), "okx-test-5");
  assert.equal(generator.nextId(), "okx-test-6");
  assert.equal(generator.nextId(), "okx-test-7");
}

function testInvalidSequentialRequestIdGenerator(): void {
  assert.throws(
    () =>
      createSequentialOkxRequestIdGenerator(
        "",
        0,
      ),
    /prefix must not be empty/,
  );

  assert.throws(
    () =>
      createSequentialOkxRequestIdGenerator(
        "okx",
        -1,
      ),
    /startAt must be a non-negative integer/,
  );

  assert.throws(
    () =>
      createSequentialOkxRequestIdGenerator(
        "okx",
        1.5,
      ),
    /startAt must be a non-negative integer/,
  );
}

function testAbsoluteUrlBuilding(): void {
  assert.equal(
    buildAbsoluteOkxUrl(
      "https://www.okx.com",
      "/api/v5/public/time",
    ),
    "https://www.okx.com/api/v5/public/time",
  );

  assert.equal(
    buildAbsoluteOkxUrl(
      "https://www.okx.com/",
      "/api/v5/market/ticker?instId=BTC-USDT",
    ),
    "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
  );
}

function testInvalidAbsoluteUrlBuilding(): void {
  assert.throws(
    () =>
      buildAbsoluteOkxUrl(
        "",
        "/api/v5/public/time",
      ),
    /baseUrl must not be empty/,
  );

  assert.throws(
    () =>
      buildAbsoluteOkxUrl(
        "not-a-url",
        "/api/v5/public/time",
      ),
    /baseUrl must be a valid absolute URL/,
  );

  assert.throws(
    () =>
      buildAbsoluteOkxUrl(
        "ftp://example.com",
        "/api/v5/public/time",
      ),
    /baseUrl must use the HTTP or HTTPS protocol/,
  );

  assert.throws(
    () =>
      buildAbsoluteOkxUrl(
        "https://www.okx.com",
        "api/v5/public/time",
      ),
    /requestPath must begin with "\/"/,
  );
}

function createCapturingTransport(): {
  readonly transport: OkxRestTransport;
  readonly getLastRequest: () =>
    | OkxRestTransportRequest<OkxRestBody>
    | undefined;
} {
  let lastRequest:
    | OkxRestTransportRequest<OkxRestBody>
    | undefined;

  const transport: OkxRestTransport = {
    async execute<TData, TBody extends OkxRestBody = null>(
      request: OkxRestTransportRequest<TBody>,
    ): Promise<OkxRestResult<TData>> {
      lastRequest =
        request as OkxRestTransportRequest<OkxRestBody>;

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
    getLastRequest(): OkxRestTransportRequest<OkxRestBody> | undefined {
      return lastRequest;
    },
  };
}

function testPublicRequestPreparation(): void {
  const { transport } = createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "public-request-001",
      ]),
  });

  const prepared = adapter.preparePublicRequest({
    method: "GET",
    path: "/api/v5/market/ticker",
    query: {
      instId: "BTC-USDT",
    },
    headers: {
      Accept: "application/json",
    },
  });

  assert.equal(
    prepared.request.requestId,
    "public-request-001",
  );

  assert.equal(
    prepared.url,
    "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
  );

  assert.deepEqual(prepared.headers, {
    accept: "application/json",
  });

  assert.equal(prepared.serializedBody, "");
  assert.equal(prepared.timeoutMs, 15_000);

  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.headers), true);
}

function testPublicExplicitRequestId(): void {
  const { transport } = createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "generated-request",
      ]),
  });

  const prepared = adapter.preparePublicRequest({
    method: "GET",
    path: "/api/v5/public/time",
    requestId: " explicit-request ",
  });

  assert.equal(
    prepared.request.requestId,
    "explicit-request",
  );
}

function testPrivateRequestPreparation(): void {
  const { transport } = createCapturingTransport();

  const configuration =
    createOkxConnectorConfiguration({
      environment: "demo",
      credentials: TEST_CREDENTIALS,
    });

  const adapter = new OkxRestAdapter({
    configuration,
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "private-request-001",
      ]),
  });

  const body = {
    instId: "BTC-USDT",
    tdMode: "cash",
    side: "buy",
    ordType: "market",
    sz: "0.01",
  } as const;

  const prepared = adapter.preparePrivateRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body,
    headers: {
      Accept: "application/json",
    },
  });

  assert.equal(
    prepared.request.requestId,
    "private-request-001",
  );

  assert.equal(
    prepared.url,
    "https://www.okx.com/api/v5/trade/order",
  );

  assert.equal(
    prepared.serializedBody,
    JSON.stringify(body),
  );

  assert.equal(
    prepared.headers["ok-access-key"],
    TEST_CREDENTIALS.apiKey,
  );

  assert.equal(
    prepared.headers["ok-access-passphrase"],
    TEST_CREDENTIALS.passphrase,
  );

  assert.equal(
    prepared.headers["ok-access-timestamp"],
    "2023-11-14T22:13:20.000Z",
  );

  assert.equal(
    typeof prepared.headers["ok-access-sign"],
    "string",
  );

  assert.equal(
    prepared.headers["x-simulated-trading"],
    "1",
  );

  assert.equal(
    prepared.headers.accept,
    "application/json",
  );
}

async function testPublicExecutionDelegatesToTransport(): Promise<void> {
  const { transport, getLastRequest } =
    createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "public-execution-001",
      ]),
  });

  const result = await adapter.executePublic({
    method: "GET",
    path: "/api/v5/public/time",
  });

  assert.equal(result.ok, true);

  const captured = getLastRequest();

  assert.ok(captured);
  assert.equal(
    captured.url,
    "https://www.okx.com/api/v5/public/time",
  );

  assert.equal(
    captured.request.requestId,
    "public-execution-001",
  );

  assert.equal(captured.timeoutMs, 15_000);
}

async function testPrivateExecutionDelegatesToTransport(): Promise<void> {
  const { transport, getLastRequest } =
    createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration({
        credentials: TEST_CREDENTIALS,
      }),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "private-execution-001",
      ]),
  });

  const result = await adapter.executePrivate({
    method: "GET",
    path: "/api/v5/account/balance",
    query: {
      ccy: "USDT",
    },
  });

  assert.equal(result.ok, true);

  const captured = getLastRequest();

  assert.ok(captured);
  assert.equal(
    captured.url,
    "https://www.okx.com/api/v5/account/balance?ccy=USDT",
  );

  assert.equal(
    captured.request.authentication,
    "private",
  );

  assert.equal(
    captured.headers["ok-access-key"],
    TEST_CREDENTIALS.apiKey,
  );
}

async function testTransportResultPropagation(): Promise<void> {
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
      match: () => true,
      result: failureResult,
    },
  ]);

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport: mock,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "request-001",
      ]),
  });

  const result = await adapter.executePublic({
    method: "GET",
    path: "/api/v5/market/ticker",
  });

  assert.equal(result.ok, false);

  if (result.ok) {
    assert.fail("Expected transport failure.");
  }

  assert.equal(result.error.code, "51000");
  mock.assertAllExpectationsConsumed();
}

function testMissingPrivateCredentials(): void {
  const { transport } = createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "request-001",
      ]),
  });

  assert.throws(
    () =>
      adapter.preparePrivateRequest({
        method: "GET",
        path: "/api/v5/account/balance",
      }),
    /OKX API credentials are required for private exchange operations/,
  );
}

function testInvalidExplicitRequestId(): void {
  const { transport } = createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "request-001",
      ]),
  });

  assert.throws(
    () =>
      adapter.preparePublicRequest({
        method: "GET",
        path: "/api/v5/public/time",
        requestId: " ",
      }),
    /requestId must not be empty/,
  );
}

function testConfigurationAccessor(): void {
  const { transport } = createCapturingTransport();

  const configuration =
    createOkxConnectorConfiguration({
      timeouts: {
        requestTimeoutMs: 20_000,
      },
    });

  const adapter = new OkxRestAdapter({
    configuration,
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "request-001",
      ]),
  });

  assert.equal(
    adapter.getConfiguration(),
    configuration,
  );
}

function testInvalidDependencies(): void {
  const configuration =
    createOkxConnectorConfiguration();

  const clock = createDeterministicOkxClock(
    FIXED_TIMESTAMP_MS,
  );

  const requestIdGenerator =
    createDeterministicOkxRequestIdGenerator([
      "request-001",
    ]);

  assert.throws(
    () =>
      new OkxRestAdapter({
        configuration,
        transport: {} as OkxRestTransport,
        clock,
        requestIdGenerator,
      }),
    /transport must implement OkxRestTransport/,
  );

  assert.throws(
    () =>
      new OkxRestAdapter({
        configuration,
        transport: {
          async execute() {
            return createOkxRestSuccessResponse({
              status: 200,
              headers: {},
              envelope: {
                code: "0",
                msg: "",
                data: [],
              },
            });
          },
        },
        clock: {} as never,
        requestIdGenerator,
      }),
    /clock must implement OkxClock/,
  );

  assert.throws(
    () =>
      new OkxRestAdapter({
        configuration,
        transport: {
          async execute() {
            return createOkxRestSuccessResponse({
              status: 200,
              headers: {},
              envelope: {
                code: "0",
                msg: "",
                data: [],
              },
            });
          },
        },
        clock,
        requestIdGenerator: {} as never,
      }),
    /requestIdGenerator must implement OkxRequestIdGenerator/,
  );
}

function testAdapterErrorIdentity(): void {
  const error = new OkxRestAdapterError(
    "Adapter failure.",
  );

  assert.equal(error.name, "OkxRestAdapterError");
  assert.equal(
    error.code,
    "OKX_REST_ADAPTER_ERROR",
  );

  assert.equal(error.message, "Adapter failure.");
  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxRestAdapterError);
}

function testDeterministicPreparation(): void {
  const { transport } = createCapturingTransport();

  const adapter = new OkxRestAdapter({
    configuration:
      createOkxConnectorConfiguration(),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "request-001",
      ]),
  });

  const first = adapter.preparePublicRequest({
    method: "GET",
    path: "/api/v5/public/time",
    requestId: "fixed-request",
  });

  const second = adapter.preparePublicRequest({
    method: "GET",
    path: "/api/v5/public/time",
    requestId: "fixed-request",
  });

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.headers, second.headers);
}

async function runOkxRestAdapterTests(): Promise<void> {
  testDeterministicRequestIdGenerator();
  testInvalidDeterministicRequestIdGenerator();
  testSequentialRequestIdGenerator();
  testInvalidSequentialRequestIdGenerator();
  testAbsoluteUrlBuilding();
  testInvalidAbsoluteUrlBuilding();
  testPublicRequestPreparation();
  testPublicExplicitRequestId();
  testPrivateRequestPreparation();
  await testPublicExecutionDelegatesToTransport();
  await testPrivateExecutionDelegatesToTransport();
  await testTransportResultPropagation();
  testMissingPrivateCredentials();
  testInvalidExplicitRequestId();
  testConfigurationAccessor();
  testInvalidDependencies();
  testAdapterErrorIdentity();
  testDeterministicPreparation();

  console.log(
    "All OKX REST adapter tests passed successfully.",
  );
}

runOkxRestAdapterTests().catch((error: unknown) => {
  console.error(
    "OKX REST adapter tests failed.",
    error,
  );

  process.exitCode = 1;
});