/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Deterministic BaseExchangeRestClient tests.
 *
 * Run with:
 * npx tsx src/trading/base-exchange-rest-client.test.ts
 */

import assert from "node:assert/strict";

import {
  BaseExchangeRestClient,
  ExchangeRestError,
  isBaseExchangeRestClient,
  validateBaseExchangeRestClientConfig,
  validateBaseExchangeRestClientDependencies,
  type BaseExchangeRestClientClock,
  type BaseExchangeRestClientConfig,
  type BaseExchangeRestClientDependencies,
  type BaseExchangeRestRequestPreparer,
  type BaseExchangeRestTransport,
  type BaseExchangeRestTransportRequest,
  type BaseExchangeRestTransportResponse,
  type ExchangeRestCancellationToken,
  type ExchangeRestRequest,
  type ExchangeRestTransportConfig,
} from "./exchange-connectivity";

const BASE_TIMESTAMP = 1_700_000_000_000;

class ManualRestClock implements BaseExchangeRestClientClock {
  public constructor(private currentTime: number) {}

  public now(): number {
    return this.currentTime;
  }

  public advance(milliseconds: number): void {
    this.currentTime += milliseconds;
  }

  public set(timestamp: number): void {
    this.currentTime = timestamp;
  }
}

interface TestTransportBehavior {
  readonly initializeFailure?: Error;
  readonly executeFailure?: Error;
  readonly closeFailure?: Error;
  readonly response?: BaseExchangeRestTransportResponse;
  readonly initializeDurationMs?: number;
  readonly executeDurationMs?: number;
  readonly closeDurationMs?: number;
}

class TestRestTransport implements BaseExchangeRestTransport {
  public initializeCalls = 0;
  public executeCalls = 0;
  public closeCalls = 0;

  public lastRequest?: BaseExchangeRestTransportRequest;

  public constructor(
    private readonly clock: ManualRestClock,
    private readonly behavior: TestTransportBehavior = {},
  ) {}

  public async initialize(): Promise<void> {
    this.initializeCalls += 1;
    this.clock.advance(this.behavior.initializeDurationMs ?? 10);

    if (this.behavior.initializeFailure) {
      throw this.behavior.initializeFailure;
    }
  }

  public async execute(
    request: BaseExchangeRestTransportRequest,
  ): Promise<BaseExchangeRestTransportResponse> {
    this.executeCalls += 1;
    this.lastRequest = request;
    this.clock.advance(this.behavior.executeDurationMs ?? 25);

    if (this.behavior.executeFailure) {
      throw this.behavior.executeFailure;
    }

    return (
      this.behavior.response ?? {
        statusCode: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
          "x-request-id": "exchange-request-1",
        },
        data: {
          success: true,
        },
        exchangeRequestId: "exchange-request-1",
      }
    );
  }

  public async close(): Promise<void> {
    this.closeCalls += 1;
    this.clock.advance(this.behavior.closeDurationMs ?? 5);

    if (this.behavior.closeFailure) {
      throw this.behavior.closeFailure;
    }
  }
}

class TestCancellationToken implements ExchangeRestCancellationToken {
  private listeners = new Set<(reason?: string) => void>();

  public cancelled = false;
  public reason?: string;

  public cancel(reason?: string): void {
    this.cancelled = true;
    this.reason = reason;

    for (const listener of this.listeners) {
      listener(reason);
    }
  }

  public throwIfCancelled(): void {
    if (this.cancelled) {
      throw new ExchangeRestError({
        category: "CANCELLED",
        code: "REQUEST_CANCELLED",
        message: this.reason ?? "Request cancelled.",
        retryable: false,
        occurredAt: BASE_TIMESTAMP,
      });
    }
  }

  public onCancelled(
    listener: (reason?: string) => void,
  ): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}

class TestRequestPreparer implements BaseExchangeRestRequestPreparer {
  public calls = 0;

  public constructor(
    private readonly transform: (
      request: ExchangeRestRequest,
    ) => ExchangeRestRequest,
  ) {}

  public async prepare(
    request: ExchangeRestRequest,
  ): Promise<ExchangeRestRequest> {
    this.calls += 1;
    return this.transform(request);
  }
}

class TestableBaseExchangeRestClient extends BaseExchangeRestClient {
  public exposeRecordRetry(count = 1): void {
    this.recordRetry(count);
  }

  public exposeSetQueuedRequestCount(count: number): void {
    this.setQueuedRequestCount(count);
  }
}

function createTransportConfig(): ExchangeRestTransportConfig {
  return Object.freeze({
    enabled: true,
    endpoints: Object.freeze([
      Object.freeze({
        type: "PUBLIC",
        baseUrl: "https://api.test.exchange",
        apiVersion: "/v1",
        authenticated: false,
        defaultHeaders: Object.freeze({
          "X-DEFAULT": "default",
          "X-OVERRIDE": "default-value",
        }),
      }),
      Object.freeze({
        type: "PRIVATE",
        baseUrl: "https://private.test.exchange/",
        apiVersion: "v2",
        authenticated: true,
      }),
    ]),
    userAgent: "QuantumTradeAI-Test/1.0",
    parseJsonResponses: true,
    maximumResponseSizeBytes: 1_000_000,
  });
}

function createConfig(
  overrides: Partial<BaseExchangeRestClientConfig> = {},
): BaseExchangeRestClientConfig {
  return Object.freeze({
    transport: createTransportConfig(),
    defaultRequestTimeoutMs: 5_000,
    throwOnHttpError: true,
    ...overrides,
  });
}

function createRequest(
  overrides: Partial<ExchangeRestRequest> = {},
): ExchangeRestRequest {
  return Object.freeze({
    requestId: "request-1",
    operation: "market.getTicker",
    endpointType: "PUBLIC",
    method: "GET",
    path: "/ticker",
    query: Object.freeze({
      symbol: "BTCUSDT",
      limit: 10,
    }),
    headers: Object.freeze({
      "X-REQUEST": "request",
      "X-OVERRIDE": "request-value",
    }),
    responseType: "JSON",
    authentication: "NONE",
    retryMode: "SAFE",
    priority: "NORMAL",
    timeoutMs: 2_500,
    context: Object.freeze({
      operationId: "operation-1",
      correlationId: "correlation-1",
      createdAt: BASE_TIMESTAMP,
      deadlineAt: BASE_TIMESTAMP + 60_000,
    }),
    ...overrides,
  });
}

function createClient(
  clock: ManualRestClock,
  transport: BaseExchangeRestTransport,
  requestPreparer?: BaseExchangeRestRequestPreparer,
): TestableBaseExchangeRestClient {
  const dependencies: BaseExchangeRestClientDependencies = {
    clock,
    transport,
    requestPreparer,
  };

  return new TestableBaseExchangeRestClient(
    createConfig(),
    dependencies,
  );
}

function testConstructionAndInitialSnapshots(): void {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  assert.equal(isBaseExchangeRestClient(client), true);

  const state = client.getState();
  const metrics = client.getMetrics();

  assert.equal(state.state, "CREATED");
  assert.equal(state.revision, 1);
  assert.equal(state.changedAt, BASE_TIMESTAMP);
  assert.equal(Object.isFrozen(state), true);

  assert.equal(metrics.totalRequests, 0);
  assert.equal(metrics.successfulRequests, 0);
  assert.equal(metrics.failedRequests, 0);
  assert.equal(metrics.activeRequests, 0);
  assert.equal(metrics.averageResponseTimeMs, undefined);
  assert.equal(Object.isFrozen(metrics), true);
}

function testConfigurationValidation(): void {
  assert.doesNotThrow(() =>
    validateBaseExchangeRestClientConfig(createConfig()),
  );

  assert.throws(
    () =>
      validateBaseExchangeRestClientConfig({
        ...createConfig(),
        defaultRequestTimeoutMs: 0,
      }),
    ExchangeRestError,
  );

  assert.throws(
    () =>
      validateBaseExchangeRestClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          enabled: false,
        },
      }),
    ExchangeRestError,
  );

  assert.throws(
    () =>
      validateBaseExchangeRestClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          endpoints: [],
        },
      }),
    ExchangeRestError,
  );

  assert.throws(
    () =>
      validateBaseExchangeRestClientConfig({
        ...createConfig(),
        transport: {
          ...createTransportConfig(),
          endpoints: [
            createTransportConfig().endpoints[0],
            createTransportConfig().endpoints[0],
          ],
        },
      }),
    ExchangeRestError,
  );
}

function testDependencyValidation(): void {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);

  assert.doesNotThrow(() =>
    validateBaseExchangeRestClientDependencies({
      clock,
      transport,
    }),
  );

  assert.throws(
    () =>
      validateBaseExchangeRestClientDependencies({
        clock: undefined as unknown as BaseExchangeRestClientClock,
        transport,
      }),
    ExchangeRestError,
  );

  assert.throws(
    () =>
      validateBaseExchangeRestClientDependencies({
        clock,
        transport: undefined as unknown as BaseExchangeRestTransport,
      }),
    ExchangeRestError,
  );
}

async function testInitialization(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    initializeDurationMs: 20,
  });
  const client = createClient(clock, transport);

  const result = await client.initialize();

  assert.equal(result.previousState, "CREATED");
  assert.equal(result.currentState, "READY");
  assert.equal(result.changed, true);
  assert.equal(result.completedAt, BASE_TIMESTAMP + 20);
  assert.equal(result.revision, 3);

  assert.equal(transport.initializeCalls, 1);
  assert.equal(client.getState().state, "READY");
}

async function testIdempotentInitialization(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  await client.initialize();
  const revision = client.getState().revision;

  const result = await client.initialize();

  assert.equal(result.changed, false);
  assert.equal(result.previousState, "READY");
  assert.equal(result.currentState, "READY");
  assert.equal(result.revision, revision);
  assert.equal(transport.initializeCalls, 1);
}

async function testInitializationFailure(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    initializeFailure: new Error("Network initialization failure."),
  });
  const client = createClient(clock, transport);

  await assert.rejects(
    async () => client.initialize(),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_CLIENT_OPERATION_FAILED");
      assert.equal(error.category, "NETWORK");
      assert.equal(error.retryable, true);
      return true;
    },
  );

  assert.equal(client.getState().state, "FAILED");
}

async function testExecuteBeforeInitialization(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  await assert.rejects(
    async () => client.execute(createRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_CLIENT_NOT_READY");
      return true;
    },
  );
}

async function testSuccessfulRequestExecution(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    executeDurationMs: 40,
  });
  const client = createClient(clock, transport);

  await client.initialize();

  const response = await client.execute<{
    readonly success: boolean;
  }>(createRequest());

  assert.equal(response.statusCode, 200);
  assert.equal(response.data.success, true);
  assert.equal(response.attemptCount, 1);
  assert.equal(response.fromCache, false);
  assert.equal(response.exchangeRequestId, "exchange-request-1");
  assert.equal(response.timing.durationMs, 40);
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.headers), true);
  assert.equal(Object.isFrozen(response.timing), true);

  assert.ok(transport.lastRequest);
  assert.equal(
    transport.lastRequest.url,
    "https://api.test.exchange/v1/ticker?limit=10&symbol=BTCUSDT",
  );
  assert.equal(transport.lastRequest.method, "GET");
  assert.equal(transport.lastRequest.timeoutMs, 2_500);
  assert.equal(
    transport.lastRequest.headers["X-DEFAULT"],
    "default",
  );
  assert.equal(
    transport.lastRequest.headers["X-OVERRIDE"],
    "request-value",
  );
  assert.equal(
    transport.lastRequest.headers["X-REQUEST"],
    "request",
  );

  const metrics = client.getMetrics();

  assert.equal(metrics.totalRequests, 1);
  assert.equal(metrics.successfulRequests, 1);
  assert.equal(metrics.failedRequests, 0);
  assert.equal(metrics.activeRequests, 0);
  assert.equal(metrics.totalResponseTimeMs, 40);
  assert.equal(metrics.minimumResponseTimeMs, 40);
  assert.equal(metrics.maximumResponseTimeMs, 40);
  assert.equal(metrics.averageResponseTimeMs, 40);
}

async function testRequestPreparer(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const preparer = new TestRequestPreparer((request) =>
    Object.freeze({
      ...request,
      headers: Object.freeze({
        ...(request.headers ?? {}),
        Authorization: "Signed test credential",
      }),
    }),
  );
  const client = createClient(clock, transport, preparer);

  await client.initialize();
  await client.execute(createRequest());

  assert.equal(preparer.calls, 1);
  assert.equal(
    transport.lastRequest?.headers.Authorization,
    "Signed test credential",
  );
}

async function testRequestPreparerCannotChangeRequestId(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const preparer = new TestRequestPreparer((request) => ({
    ...request,
    requestId: "changed-request-id",
  }));
  const client = createClient(clock, transport, preparer);

  await client.initialize();

  await assert.rejects(
    async () => client.execute(createRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(
        error.code,
        "REQUEST_PREPARER_CHANGED_REQUEST_ID",
      );
      return true;
    },
  );

  assert.equal(transport.executeCalls, 0);
}

async function testMissingEndpoint(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  await client.initialize();

  await assert.rejects(
    async () =>
      client.execute(
        createRequest({
          endpointType: "ACCOUNT",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_ENDPOINT_NOT_CONFIGURED");
      return true;
    },
  );
}

async function testAuthenticationEndpointValidation(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  await client.initialize();

  await assert.rejects(
    async () =>
      client.execute(
        createRequest({
          endpointType: "PUBLIC",
          authentication: "REQUIRED",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(
        error.code,
        "AUTHENTICATED_ENDPOINT_REQUIRED",
      );
      return true;
    },
  );
}

async function testHttpErrorNormalization(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    response: {
      statusCode: 429,
      statusText: "Too Many Requests",
      headers: {
        "retry-after": "1",
      },
      data: {
        message: "Rate limit exceeded.",
      },
    },
  });
  const client = createClient(clock, transport);

  await client.initialize();

  await assert.rejects(
    async () => client.execute(createRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "HTTP_REQUEST_FAILED");
      assert.equal(error.category, "RATE_LIMIT");
      assert.equal(error.retryable, true);
      assert.equal(error.statusCode, 429);
      return true;
    },
  );

  const metrics = client.getMetrics();

  assert.equal(metrics.totalRequests, 1);
  assert.equal(metrics.failedRequests, 1);
  assert.equal(metrics.successfulRequests, 0);
}

async function testTransportTimeoutFailure(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    executeFailure: new Error("Request timeout."),
  });
  const client = createClient(clock, transport);

  await client.initialize();

  await assert.rejects(
    async () => client.execute(createRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_TRANSPORT_FAILURE");
      assert.equal(error.category, "TIMEOUT");
      assert.equal(error.retryable, true);
      return true;
    },
  );

  const metrics = client.getMetrics();

  assert.equal(metrics.failedRequests, 1);
  assert.equal(metrics.timedOutRequests, 1);
}

async function testTransportNetworkFailure(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    executeFailure: new Error("Network connection reset."),
  });
  const client = createClient(clock, transport);

  await client.initialize();

  await assert.rejects(
    async () => client.execute(createRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.category, "NETWORK");
      assert.equal(error.retryable, true);
      return true;
    },
  );
}

async function testPreCancelledRequest(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);
  const cancellationToken = new TestCancellationToken();

  await client.initialize();
  cancellationToken.cancel("Cancelled before execution.");

  await assert.rejects(
    async () =>
      client.execute(createRequest(), {
        cancellationToken,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.category, "CANCELLED");
      assert.equal(error.code, "REQUEST_CANCELLED");
      return true;
    },
  );

  assert.equal(transport.executeCalls, 0);
}

function testRetryAndQueueMetricHooks(): void {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  client.exposeRecordRetry(2);
  client.exposeSetQueuedRequestCount(3);

  const metrics = client.getMetrics();

  assert.equal(metrics.retriedRequests, 2);
  assert.equal(metrics.queuedRequests, 3);

  assert.throws(
    () => client.exposeRecordRetry(0),
    ExchangeRestError,
  );

  assert.throws(
    () => client.exposeSetQueuedRequestCount(-1),
    ExchangeRestError,
  );
}

async function testClose(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    closeDurationMs: 15,
  });
  const client = createClient(clock, transport);

  await client.initialize();

  const result = await client.close({
    graceful: true,
    timeoutMs: 5_000,
    reason: "Deterministic shutdown.",
  });

  assert.equal(result.previousState, "READY");
  assert.equal(result.currentState, "CLOSED");
  assert.equal(result.changed, true);
  assert.equal(result.cancelledRequestCount, 0);
  assert.equal(transport.closeCalls, 1);

  const state = client.getState();

  assert.equal(state.state, "CLOSED");
  assert.equal(state.reason, "Deterministic shutdown.");
}

async function testIdempotentClose(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  await client.initialize();
  await client.close();

  const revision = client.getState().revision;
  const result = await client.close();

  assert.equal(result.changed, false);
  assert.equal(result.currentState, "CLOSED");
  assert.equal(result.revision, revision);
  assert.equal(transport.closeCalls, 1);
}

async function testClosedClientCannotInitializeOrExecute(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock);
  const client = createClient(clock, transport);

  await client.initialize();
  await client.close();

  await assert.rejects(
    async () => client.initialize(),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_CLIENT_CLOSED");
      return true;
    },
  );

  await assert.rejects(
    async () => client.execute(createRequest()),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_CLIENT_NOT_READY");
      return true;
    },
  );
}

async function testCloseFailure(): Promise<void> {
  const clock = new ManualRestClock(BASE_TIMESTAMP);
  const transport = new TestRestTransport(clock, {
    closeFailure: new Error("Network close failure."),
  });
  const client = createClient(clock, transport);

  await client.initialize();

  await assert.rejects(
    async () => client.close(),
    (error: unknown) => {
      assert.ok(error instanceof ExchangeRestError);
      assert.equal(error.code, "REST_CLIENT_OPERATION_FAILED");
      assert.equal(error.category, "NETWORK");
      return true;
    },
  );

  assert.equal(client.getState().state, "FAILED");
}

async function runTests(): Promise<void> {
  testConstructionAndInitialSnapshots();
  testConfigurationValidation();
  testDependencyValidation();
  testRetryAndQueueMetricHooks();

  await testInitialization();
  await testIdempotentInitialization();
  await testInitializationFailure();
  await testExecuteBeforeInitialization();
  await testSuccessfulRequestExecution();
  await testRequestPreparer();
  await testRequestPreparerCannotChangeRequestId();
  await testMissingEndpoint();
  await testAuthenticationEndpointValidation();
  await testHttpErrorNormalization();
  await testTransportTimeoutFailure();
  await testTransportNetworkFailure();
  await testPreCancelledRequest();
  await testClose();
  await testIdempotentClose();
  await testClosedClientCannotInitializeOrExecute();
  await testCloseFailure();

  console.log(
    "All base exchange REST client tests passed successfully.",
  );
}

runTests().catch((error: unknown) => {
  console.error(
    "Base exchange REST client tests failed.",
    error,
  );

  process.exitCode = 1;
});