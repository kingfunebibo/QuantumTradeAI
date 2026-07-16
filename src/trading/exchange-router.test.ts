import assert from "node:assert/strict";

import {
  ExchangeRouter,
} from "./exchange-connectivity/management/exchange-router";

import {
  ExchangeRouterError,
  type ExchangeRouterClock,
  type ExchangeRouterDelay,
  type ExchangeRouterExecutor,
} from "./exchange-connectivity/management/exchange-router.types";

import {
  UnifiedExchangeError,
  type UnifiedExchange,
  type UnifiedExchangeAccountApi,
  type UnifiedExchangeHealthReport,
  type UnifiedExchangeMarketDataApi,
  type UnifiedExchangeTradingApi,
} from "./exchange-connectivity/management/unified-exchange-interface";

import {
  createExchangeCapabilityProfile,
} from "./exchange-connectivity/management/exchange-capability-registry";

import type {
  ExchangeDiscoveryCandidate,
  ExchangeDiscoveryContract,
  ExchangeDiscoveryResult,
  ExchangeDiscoveryRequest,
  NormalizedExchangeDiscoveryRequest,
} from "./exchange-connectivity/management/exchange-discovery";

import {
  createConnectorHealthSnapshot,
  createInitialConnectorLifecycleSnapshot,
} from "./exchange-connectivity/management/connector-lifecycle.types";

import type {
  ExchangeRegistryEntry,
} from "./exchange-connectivity/management/exchange-registry";

class DeterministicRouterClock
  implements ExchangeRouterClock
{
  private current: number;

  public constructor(initial = 1_000) {
    this.current = initial;
  }

  public now(): number {
    const value = this.current;
    this.current += 1;
    return value;
  }
}

class RecordingDelay
  implements ExchangeRouterDelay
{
  public readonly waits: number[] = [];

  public async wait(
    milliseconds: number,
  ): Promise<void> {
    this.waits.push(milliseconds);
  }
}

class TestUnifiedExchange
  implements UnifiedExchange
{
  public readonly capabilities;

  public readonly marketData:
    UnifiedExchangeMarketDataApi;

  public readonly account?:
    UnifiedExchangeAccountApi;

  public readonly trading?:
    UnifiedExchangeTradingApi;

  public constructor(
    public readonly exchangeId: string,
  ) {
    this.capabilities =
      createExchangeCapabilityProfile({
        exchangeId,
        marketTypes: ["SPOT"],
        trading: ["PLACE_ORDER"],
        marketData: ["TICKER"],
        supportsPrivateApi: true,
      });

    this.marketData = {
      getTicker: async () => {
        throw new Error("Not used.");
      },
      getOrderBook: async () => {
        throw new Error("Not used.");
      },
      getCandles: async () => {
        throw new Error("Not used.");
      },
      getInstruments: async () => {
        throw new Error("Not used.");
      },
    };
  }

  public async initialize(): Promise<void> {}

  public async start(): Promise<void> {}

  public async stop(): Promise<void> {}

  public async dispose(): Promise<void> {}

  public async getHealth(): Promise<{
    readonly status: "HEALTHY";
  }> {
    return {
      status: "HEALTHY",
    };
  }

  public async inspectHealth():
    Promise<UnifiedExchangeHealthReport> {
    return Object.freeze({
      exchangeId: this.exchangeId,
      status: "HEALTHY",
      observedAt: 1,
    });
  }
}

class StubDiscovery
  implements ExchangeDiscoveryContract<TestUnifiedExchange>
{
  public constructor(
    private readonly candidates:
      readonly ExchangeDiscoveryCandidate<TestUnifiedExchange>[],
  ) {}

  public discover(
    request: ExchangeDiscoveryRequest = {},
  ): ExchangeDiscoveryResult<TestUnifiedExchange> {
    const normalizedRequest:
      NormalizedExchangeDiscoveryRequest = {
        capabilities:
          request.capabilities ?? {},

        includeExchangeIds:
          request.includeExchangeIds ??
          ([] as readonly string[]),

        excludeExchangeIds:
          request.excludeExchangeIds ??
          ([] as readonly string[]),

        preferredExchangeIds:
          request.preferredExchangeIds ??
          ([] as readonly string[]),

        priorities:
          request.priorities ??
          ([] as const),

        allowedLifecycleStates:
          request.allowedLifecycleStates ??
          ([
            "RUNNING",
            "DEGRADED",
          ] as const),

        allowedHealthStatuses:
          request.allowedHealthStatuses ??
          ([
            "HEALTHY",
            "DEGRADED",
          ] as const),

        requireLifecycleEligibility:
          request.requireLifecycleEligibility ??
          true,

        requireCapabilityProfile:
          request.requireCapabilityProfile ??
          true,

        excludeOperationInProgress:
          request.excludeOperationInProgress ??
          true,

        ...(request.limit === undefined
          ? {}
          : {
              limit: request.limit,
            }),
      };

    return Object.freeze({
      request:
        Object.freeze(
          normalizedRequest,
        ),

      candidates:
        Object.freeze([
          ...this.candidates,
        ]),

      candidateCount:
        this.candidates.length,

      evaluatedExchangeCount:
        this.candidates.length,

      rejectedExchangeCount: 0,
    });
  }

  public discoverOne(
    _request: ExchangeDiscoveryRequest = {},
  ):
    | ExchangeDiscoveryCandidate<TestUnifiedExchange>
    | undefined {
    return this.candidates[0];
  }

  public requireOne(
    _request: ExchangeDiscoveryRequest = {},
  ): ExchangeDiscoveryCandidate<TestUnifiedExchange> {
    const candidate =
      this.candidates[0];

    if (candidate === undefined) {
      throw new Error(
        "No candidate.",
      );
    }

    return candidate;
  }

  public supports(
    exchangeId: string,
    _request: ExchangeDiscoveryRequest = {},
  ): boolean {
    return this.candidates.some(
      (candidate) =>
        candidate.exchangeId ===
        exchangeId,
    );
  }
}

function createCandidate(
  exchangeId: string,
  registrationSequence: number,
): ExchangeDiscoveryCandidate<TestUnifiedExchange> {
  const connector =
    new TestUnifiedExchange(exchangeId);

  const entry:
    ExchangeRegistryEntry<TestUnifiedExchange> =
    Object.freeze({
      exchangeId,
      connector,
      metadata: Object.freeze({}),
      registrationSequence,
    });

  const lifecycleSnapshot =
    Object.freeze({
      ...createInitialConnectorLifecycleSnapshot(
        exchangeId,
        1,
      ),
      state: "RUNNING" as const,
      health:
        createConnectorHealthSnapshot({
          status: "HEALTHY",
          observedAt: 2,
        }),
    });

  return Object.freeze({
    exchangeId,
    connector,
    registryEntry: entry,
    capabilityProfile:
      connector.capabilities,
    lifecycleSnapshot,
    priority: 0,
    registrationSequence,
    reasons:
      Object.freeze([
        "REGISTERED",
        "CAPABILITIES_MATCHED",
        "LIFECYCLE_ELIGIBLE",
        "HEALTH_ELIGIBLE",
      ] as const),
  });
}

function assertRouterError(
  error: unknown,
  expectedCode:
    ExchangeRouterError["code"],
): asserts error is ExchangeRouterError {
  assert.ok(
    error instanceof ExchangeRouterError,
  );

  assert.equal(
    error.code,
    expectedCode,
  );
}

async function testSuccessfulRouting(): Promise<void> {
  const okx =
    createCandidate("okx", 1);

  const router =
    new ExchangeRouter(
      new StubDiscovery([okx]),
      {
        clock:
          new DeterministicRouterClock(),
        delay:
          new RecordingDelay(),
      },
    );

  const executor:
    ExchangeRouterExecutor<
      TestUnifiedExchange,
      string
    > = {
      execute: async (
        exchange,
        context,
      ) => {
        assert.equal(
          exchange.exchangeId,
          "okx",
        );

        assert.equal(
          context.attemptNumber,
          1,
        );

        return "ok";
      },
    };

  const result =
    await router.route(
      {
        operation: "CUSTOM",
      },
      executor,
    );

  assert.equal(
    result.outcome,
    "SUCCEEDED",
  );

  if (
    result.outcome !== "SUCCEEDED"
  ) {
    throw new Error(
      "Expected success result.",
    );
  }

  assert.equal(
    result.exchangeId,
    "okx",
  );

  assert.equal(
    result.result,
    "ok",
  );

  assert.equal(
    result.attempts.length,
    1,
  );

  assert.equal(
    result.attempts[0]?.outcome,
    "SUCCEEDED",
  );

  assert.ok(
    Object.isFrozen(result),
  );

  assert.ok(
    Object.isFrozen(
      result.attempts,
    ),
  );
}

async function testNoRouteFailureResult(): Promise<void> {
  const router =
    new ExchangeRouter(
      new StubDiscovery([]),
      {
        clock:
          new DeterministicRouterClock(),
      },
    );

  const result =
    await router.route(
      {
        operation: "GET_TICKER",
      },
      {
        execute: async () => "never",
      },
    );

  assert.equal(
    result.outcome,
    "FAILED",
  );

  if (result.outcome !== "FAILED") {
    throw new Error(
      "Expected failure result.",
    );
  }

  assert.equal(
    result.error.code,
    "NO_ROUTE_AVAILABLE",
  );

  assert.deepEqual(
    result.attempts,
    [],
  );
}

async function testNoRouteThrowsWhenConfigured(): Promise<void> {
  const router =
    new ExchangeRouter(
      new StubDiscovery([]),
      {
        clock:
          new DeterministicRouterClock(),
        returnFailureResult: false,
      },
    );

  let captured: unknown;

  try {
    await router.route(
      {
        operation: "GET_TICKER",
      },
      {
        execute: async () => "never",
      },
    );
  } catch (error: unknown) {
    captured = error;
  }

  assertRouterError(
    captured,
    "NO_ROUTE_AVAILABLE",
  );
}

async function testRetryCurrentExchange(): Promise<void> {
  const okx =
    createCandidate("okx", 1);

  const delay =
    new RecordingDelay();

  const router =
    new ExchangeRouter(
      new StubDiscovery([okx]),
      {
        clock:
          new DeterministicRouterClock(),
        delay,
      },
    );

  let calls = 0;

  const result =
    await router.route(
      {
        operation: "CUSTOM",
        retryPolicy: {
          maxAttempts: 3,
          retryDelayMs: 10,
          backoffMultiplier: 2,
          maximumRetryDelayMs: 100,
          retryableErrorCodes: [
            "NETWORK_ERROR",
          ],
        },
        failoverPolicy: {
          enabled: true,
          maximumExchangeAttempts: 1,
          retryCurrentExchangeFirst: true,
          failoverOnNonRetryableError: false,
        },
      },
      {
        execute: async () => {
          calls += 1;

          if (calls < 3) {
            throw new UnifiedExchangeError(
              "NETWORK_ERROR",
              "Temporary network failure.",
              {
                exchangeId: "okx",
                retryable: true,
              },
            );
          }

          return "recovered";
        },
      },
    );

  assert.equal(
    result.outcome,
    "SUCCEEDED",
  );

  assert.equal(
    calls,
    3,
  );

  assert.deepEqual(
    delay.waits,
    [
      10,
      20,
    ],
  );

  assert.deepEqual(
    result.attempts.map(
      (attempt) =>
        attempt.outcome,
    ),
    [
      "FAILED",
      "FAILED",
      "SUCCEEDED",
    ],
  );
}

async function testFailoverToSecondExchange(): Promise<void> {
  const okx =
    createCandidate("okx", 1);

  const binance =
    createCandidate("binance", 2);

  const router =
    new ExchangeRouter(
      new StubDiscovery([
        okx,
        binance,
      ]),
      {
        clock:
          new DeterministicRouterClock(),
        delay:
          new RecordingDelay(),
      },
    );

  const visited: string[] = [];

  const result =
    await router.route(
      {
        operation: "CUSTOM",
        retryPolicy: {
          maxAttempts: 2,
          retryDelayMs: 0,
          backoffMultiplier: 2,
          maximumRetryDelayMs: 0,
          retryableErrorCodes: [
            "EXCHANGE_UNAVAILABLE",
          ],
        },
        failoverPolicy: {
          enabled: true,
          maximumExchangeAttempts: 2,
          retryCurrentExchangeFirst: false,
          failoverOnNonRetryableError: false,
        },
      },
      {
        execute: async (exchange) => {
          visited.push(
            exchange.exchangeId,
          );

          if (
            exchange.exchangeId ===
            "okx"
          ) {
            throw new UnifiedExchangeError(
              "EXCHANGE_UNAVAILABLE",
              "OKX unavailable.",
              {
                exchangeId: "okx",
                retryable: true,
              },
            );
          }

          return "binance-ok";
        },
      },
    );

  assert.equal(
    result.outcome,
    "SUCCEEDED",
  );

  assert.deepEqual(
    visited,
    [
      "okx",
      "binance",
    ],
  );

  if (
    result.outcome !== "SUCCEEDED"
  ) {
    throw new Error(
      "Expected success result.",
    );
  }

  assert.equal(
    result.exchangeId,
    "binance",
  );
}

async function testNonRetryableStopsFailover(): Promise<void> {
  const okx =
    createCandidate("okx", 1);

  const binance =
    createCandidate("binance", 2);

  const router =
    new ExchangeRouter(
      new StubDiscovery([
        okx,
        binance,
      ]),
      {
        clock:
          new DeterministicRouterClock(),
      },
    );

  const visited: string[] = [];

  const result =
    await router.route(
      {
        operation: "CUSTOM",
        retryPolicy: {
          maxAttempts: 3,
        },
        failoverPolicy: {
          enabled: true,
          maximumExchangeAttempts: 2,
          retryCurrentExchangeFirst: false,
          failoverOnNonRetryableError: false,
        },
      },
      {
        execute: async (exchange) => {
          visited.push(
            exchange.exchangeId,
          );

          throw new UnifiedExchangeError(
            "AUTHENTICATION_REQUIRED",
            "Credentials missing.",
            {
              exchangeId:
                exchange.exchangeId,
              retryable: false,
            },
          );
        },
      },
    );

  assert.equal(
    result.outcome,
    "FAILED",
  );

  assert.deepEqual(
    visited,
    [
      "okx",
    ],
  );
}

async function testFailoverOnNonRetryable(): Promise<void> {
  const okx =
    createCandidate("okx", 1);

  const binance =
    createCandidate("binance", 2);

  const router =
    new ExchangeRouter(
      new StubDiscovery([
        okx,
        binance,
      ]),
      {
        clock:
          new DeterministicRouterClock(),
      },
    );

  const result =
    await router.route(
      {
        operation: "CUSTOM",
        retryPolicy: {
          maxAttempts: 2,
        },
        failoverPolicy: {
          enabled: true,
          maximumExchangeAttempts: 2,
          retryCurrentExchangeFirst: false,
          failoverOnNonRetryableError: true,
        },
      },
      {
        execute: async (exchange) => {
          if (
            exchange.exchangeId ===
            "okx"
          ) {
            throw new UnifiedExchangeError(
              "REQUEST_REJECTED",
              "Rejected by OKX.",
              {
                exchangeId: "okx",
                retryable: false,
              },
            );
          }

          return "accepted";
        },
      },
    );

  assert.equal(
    result.outcome,
    "SUCCEEDED",
  );

  if (
    result.outcome !== "SUCCEEDED"
  ) {
    throw new Error(
      "Expected success result.",
    );
  }

  assert.equal(
    result.exchangeId,
    "binance",
  );
}

async function testRoundRobinSelection(): Promise<void> {
  const candidates = [
    createCandidate("okx", 1),
    createCandidate("binance", 2),
    createCandidate("bybit", 3),
  ];

  const router =
    new ExchangeRouter(
      new StubDiscovery(
        candidates,
      ),
      {
        clock:
          new DeterministicRouterClock(),
      },
    );

  const first =
    router.select({
      operation: "GET_TICKER",
      strategy: "ROUND_ROBIN",
    });

  const second =
    router.select({
      operation: "GET_TICKER",
      strategy: "ROUND_ROBIN",
    });

  const third =
    router.select({
      operation: "GET_TICKER",
      strategy: "ROUND_ROBIN",
    });

  const fourth =
    router.select({
      operation: "GET_TICKER",
      strategy: "ROUND_ROBIN",
    });

  assert.equal(
    first.selectedExchangeId,
    "okx",
  );

  assert.equal(
    second.selectedExchangeId,
    "binance",
  );

  assert.equal(
    third.selectedExchangeId,
    "bybit",
  );

  assert.equal(
    fourth.selectedExchangeId,
    "okx",
  );
}

async function testUndefinedExecutorResult(): Promise<void> {
  const router =
    new ExchangeRouter(
      new StubDiscovery([
        createCandidate(
          "okx",
          1,
        ),
      ]),
      {
        clock:
          new DeterministicRouterClock(),
      },
    );

  const result =
    await router.route(
      {
        operation: "CUSTOM",
      },
      {
        execute: async () =>
          undefined as never,
      },
    );

  assert.equal(
    result.outcome,
    "FAILED",
  );

  if (result.outcome !== "FAILED") {
    throw new Error(
      "Expected failure result.",
    );
  }

  assert.equal(
    result.attempts[0]
      ?.errorCode,
    "INVALID_EXECUTOR_RESULT",
  );
}

async function testInvalidExecutor(): Promise<void> {
  const router =
    new ExchangeRouter(
      new StubDiscovery([
        createCandidate(
          "okx",
          1,
        ),
      ]),
    );

  let captured: unknown;

  try {
    await router.route(
      {
        operation: "CUSTOM",
      },
      null as unknown as ExchangeRouterExecutor<
        TestUnifiedExchange,
        string
      >,
    );
  } catch (error: unknown) {
    captured = error;
  }

  assertRouterError(
    captured,
    "ROUTER_NOT_CONFIGURED",
  );
}

async function testInvalidClock(): Promise<void> {
  const router =
    new ExchangeRouter(
      new StubDiscovery([
        createCandidate(
          "okx",
          1,
        ),
      ]),
      {
        clock: {
          now(): number {
            return Number.NaN;
          },
        },
      },
    );

  assert.throws(
    () =>
      router.select({
        operation: "CUSTOM",
      }),
    (error: unknown) => {
      assertRouterError(
        error,
        "INVALID_ROUTING_REQUEST",
      );

      return true;
    },
  );
}

async function runExchangeRouterTests(): Promise<void> {
  await testSuccessfulRouting();
  await testNoRouteFailureResult();
  await testNoRouteThrowsWhenConfigured();
  await testRetryCurrentExchange();
  await testFailoverToSecondExchange();
  await testNonRetryableStopsFailover();
  await testFailoverOnNonRetryable();
  await testRoundRobinSelection();
  await testUndefinedExecutorResult();
  await testInvalidExecutor();
  await testInvalidClock();

  console.log(
    "All deterministic exchange router tests passed successfully.",
  );
}

void runExchangeRouterTests();