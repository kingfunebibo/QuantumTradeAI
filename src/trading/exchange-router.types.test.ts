import assert from "node:assert/strict";

import {
  DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY,
  DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY,
  EXCHANGE_ROUTER_OPERATIONS,
  EXCHANGE_ROUTING_STRATEGIES,
  UNIFIED_EXCHANGE_ERROR_CODES,
  ExchangeRouterError,
  calculateExchangeRouterRetryDelay,
  isExchangeRouterOperation,
  isExchangeRoutingStrategy,
  normalizeExchangeRouterFailoverPolicy,
  normalizeExchangeRouterRequest,
  normalizeExchangeRouterRetryPolicy,
  type ExchangeRouterErrorCode,
  type ExchangeRouterRequest,
} from "./exchange-connectivity/management/exchange-router.types";

function assertRouterError(
  operation: () => unknown,
  expectedCode: ExchangeRouterErrorCode,
): ExchangeRouterError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof ExchangeRouterError,
    `Expected ExchangeRouterError but received ${
      capturedError instanceof Error
        ? capturedError.constructor.name
        : typeof capturedError
    }.`,
  );

  assert.equal(
    capturedError.code,
    expectedCode,
  );

  return capturedError;
}

function createValidRequest(
  overrides: Partial<ExchangeRouterRequest> = {},
): ExchangeRouterRequest {
  return {
    operation: "PLACE_ORDER",
    strategy: "HEALTH_AWARE",
    capabilities: {
      marketTypes: [
        "SPOT",
      ],
      trading: [
        "PLACE_ORDER",
      ],
      requirePrivateApi: true,
    },
    discovery: {
      preferredExchangeIds: [
        "okx",
        "binance",
      ],
      excludeExchangeIds: [
        "bybit",
      ],
      allowedLifecycleStates: [
        "RUNNING",
        "DEGRADED",
      ],
      allowedHealthStatuses: [
        "HEALTHY",
        "DEGRADED",
      ],
    },
    retryPolicy: {
      maxAttempts: 4,
      retryDelayMs: 50,
      backoffMultiplier: 2,
      maximumRetryDelayMs: 500,
      retryableErrorCodes: [
        "NETWORK_ERROR",
        "TIMEOUT",
      ],
    },
    failoverPolicy: {
      enabled: true,
      maximumExchangeAttempts: 2,
      retryCurrentExchangeFirst: true,
      failoverOnNonRetryableError: false,
    },
    requestId: "route-request-001",
    requestedAt: 1_000,
    metadata: {
      strategyId: "ema-crossover",
    },
    ...overrides,
  };
}

function testCanonicalConstants(): void {
  assert.deepEqual(
    EXCHANGE_ROUTER_OPERATIONS,
    [
      "GET_TICKER",
      "GET_ORDER_BOOK",
      "GET_CANDLES",
      "GET_INSTRUMENTS",
      "GET_BALANCES",
      "GET_POSITIONS",
      "PLACE_ORDER",
      "CANCEL_ORDER",
      "GET_ORDER",
      "CUSTOM",
    ],
  );

  assert.deepEqual(
    EXCHANGE_ROUTING_STRATEGIES,
    [
      "FIRST_MATCH",
      "PRIORITY",
      "PREFERRED",
      "HEALTH_AWARE",
      "ROUND_ROBIN",
    ],
  );

  assert.deepEqual(
    UNIFIED_EXCHANGE_ERROR_CODES,
    [
      "INVALID_EXCHANGE_ID",
      "INVALID_REQUEST",
      "INVALID_SYMBOL",
      "INVALID_QUANTITY",
      "INVALID_PRICE",
      "INVALID_TIMESTAMP",
      "INVALID_RESPONSE",
      "CAPABILITY_NOT_SUPPORTED",
      "AUTHENTICATION_REQUIRED",
      "CONNECTOR_NOT_READY",
      "REQUEST_REJECTED",
      "ORDER_NOT_FOUND",
      "RATE_LIMITED",
      "NETWORK_ERROR",
      "TIMEOUT",
      "EXCHANGE_UNAVAILABLE",
      "UNKNOWN_ERROR",
    ],
  );
}

function testDefaultPolicies(): void {
  assert.deepEqual(
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY,
    {
      maxAttempts: 3,
      retryDelayMs: 100,
      backoffMultiplier: 2,
      maximumRetryDelayMs: 5_000,
      retryableErrorCodes: [
        "RATE_LIMITED",
        "NETWORK_ERROR",
        "TIMEOUT",
        "EXCHANGE_UNAVAILABLE",
      ],
    },
  );

  assert.deepEqual(
    DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY,
    {
      enabled: true,
      maximumExchangeAttempts: 3,
      retryCurrentExchangeFirst: false,
      failoverOnNonRetryableError: false,
    },
  );

  assert.ok(
    Object.isFrozen(
      DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY,
    ),
  );

  assert.ok(
    Object.isFrozen(
      DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY
        .retryableErrorCodes,
    ),
  );

  assert.ok(
    Object.isFrozen(
      DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY,
    ),
  );
}

function testRouterErrorProperties(): void {
  const cause =
    new Error("Underlying router failure");

  const error =
    new ExchangeRouterError(
      "ROUTED_OPERATION_FAILED",
      "Routed request failed.",
      {
        operation: "PLACE_ORDER",
        exchangeId: "okx",
        retryable: true,
        cause,
      },
    );

  assert.equal(
    error.name,
    "ExchangeRouterError",
  );

  assert.equal(
    error.code,
    "ROUTED_OPERATION_FAILED",
  );

  assert.equal(
    error.operation,
    "PLACE_ORDER",
  );

  assert.equal(
    error.exchangeId,
    "okx",
  );

  assert.equal(
    error.retryable,
    true,
  );

  assert.equal(
    error.cause,
    cause,
  );

  assert.ok(
    error instanceof Error,
  );
}

function testRouterErrorDefaults(): void {
  const error =
    new ExchangeRouterError(
      "NO_ROUTE_AVAILABLE",
      "No route available.",
    );

  assert.equal(
    error.operation,
    undefined,
  );

  assert.equal(
    error.exchangeId,
    undefined,
  );

  assert.equal(
    error.retryable,
    false,
  );

  assert.equal(
    error.cause,
    undefined,
  );
}

function testTypeGuards(): void {
  assert.equal(
    isExchangeRouterOperation(
      "GET_TICKER",
    ),
    true,
  );

  assert.equal(
    isExchangeRouterOperation(
      "PLACE_ORDER",
    ),
    true,
  );

  assert.equal(
    isExchangeRouterOperation(
      "INVALID",
    ),
    false,
  );

  assert.equal(
    isExchangeRouterOperation(
      null,
    ),
    false,
  );

  assert.equal(
    isExchangeRoutingStrategy(
      "FIRST_MATCH",
    ),
    true,
  );

  assert.equal(
    isExchangeRoutingStrategy(
      "ROUND_ROBIN",
    ),
    true,
  );

  assert.equal(
    isExchangeRoutingStrategy(
      "RANDOM",
    ),
    false,
  );

  assert.equal(
    isExchangeRoutingStrategy(
      123,
    ),
    false,
  );
}

function testRetryPolicyDefaults(): void {
  const policy =
    normalizeExchangeRouterRetryPolicy(
      undefined,
    );

  assert.deepEqual(
    policy,
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY,
  );

  assert.ok(
    Object.isFrozen(policy),
  );

  assert.ok(
    Object.isFrozen(
      policy.retryableErrorCodes,
    ),
  );
}

function testRetryPolicyOverrides(): void {
  const policy =
    normalizeExchangeRouterRetryPolicy({
      maxAttempts: 5,
      retryDelayMs: 25,
      backoffMultiplier: 3,
      maximumRetryDelayMs: 1_000,
      retryableErrorCodes: [
        "TIMEOUT",
        "NETWORK_ERROR",
        "TIMEOUT",
      ],
    });

  assert.deepEqual(
    policy,
    {
      maxAttempts: 5,
      retryDelayMs: 25,
      backoffMultiplier: 3,
      maximumRetryDelayMs: 1_000,
      retryableErrorCodes: [
        "TIMEOUT",
        "NETWORK_ERROR",
      ],
    },
  );

  assert.ok(
    Object.isFrozen(policy),
  );

  assert.ok(
    Object.isFrozen(
      policy.retryableErrorCodes,
    ),
  );
}

function testPartialRetryPolicy(): void {
  const policy =
    normalizeExchangeRouterRetryPolicy({
      maxAttempts: 10,
    });

  assert.equal(
    policy.maxAttempts,
    10,
  );

  assert.equal(
    policy.retryDelayMs,
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY
      .retryDelayMs,
  );

  assert.equal(
    policy.backoffMultiplier,
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY
      .backoffMultiplier,
  );

  assert.equal(
    policy.maximumRetryDelayMs,
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY
      .maximumRetryDelayMs,
  );
}

function testInvalidRetryPolicyShape(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy(
        null as unknown as {},
      ),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy(
        [] as unknown as {},
      ),
    "INVALID_ROUTING_REQUEST",
  );
}

function testInvalidMaximumAttempts(): void {
  for (
    const value of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertRouterError(
      () =>
        normalizeExchangeRouterRetryPolicy({
          maxAttempts: value,
        }),
      "INVALID_ATTEMPT_LIMIT",
    );
  }
}

function testInvalidRetryDelay(): void {
  for (
    const value of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertRouterError(
      () =>
        normalizeExchangeRouterRetryPolicy({
          retryDelayMs: value,
        }),
      "INVALID_RETRY_DELAY",
    );
  }
}

function testInvalidBackoffMultiplier(): void {
  for (
    const value of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertRouterError(
      () =>
        normalizeExchangeRouterRetryPolicy({
          backoffMultiplier: value,
        }),
      "INVALID_RETRY_DELAY",
    );
  }
}

function testInvalidMaximumRetryDelay(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy({
        maximumRetryDelayMs: -1,
      }),
    "INVALID_RETRY_DELAY",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy({
        retryDelayMs: 500,
        maximumRetryDelayMs: 100,
      }),
    "INVALID_RETRY_DELAY",
  );
}

function testInvalidRetryableErrorCodes(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy({
        retryableErrorCodes:
          "TIMEOUT" as unknown as readonly [
            "TIMEOUT",
          ],
      }),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy({
        retryableErrorCodes: [
          "INVALID_CODE" as never,
        ],
      }),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRetryPolicy({
        retryableErrorCodes: [
          123 as never,
        ],
      }),
    "INVALID_ROUTING_REQUEST",
  );
}

function testFailoverPolicyDefaults(): void {
  const policy =
    normalizeExchangeRouterFailoverPolicy(
      undefined,
    );

  assert.deepEqual(
    policy,
    DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY,
  );

  assert.ok(
    Object.isFrozen(policy),
  );
}

function testFailoverPolicyOverrides(): void {
  const policy =
    normalizeExchangeRouterFailoverPolicy({
      enabled: false,
      maximumExchangeAttempts: 1,
      retryCurrentExchangeFirst: true,
      failoverOnNonRetryableError: true,
    });

  assert.deepEqual(
    policy,
    {
      enabled: false,
      maximumExchangeAttempts: 1,
      retryCurrentExchangeFirst: true,
      failoverOnNonRetryableError: true,
    },
  );

  assert.ok(
    Object.isFrozen(policy),
  );
}

function testPartialFailoverPolicy(): void {
  const policy =
    normalizeExchangeRouterFailoverPolicy({
      maximumExchangeAttempts: 5,
    });

  assert.equal(
    policy.maximumExchangeAttempts,
    5,
  );

  assert.equal(
    policy.enabled,
    true,
  );

  assert.equal(
    policy.retryCurrentExchangeFirst,
    false,
  );

  assert.equal(
    policy.failoverOnNonRetryableError,
    false,
  );
}

function testInvalidFailoverPolicyShape(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterFailoverPolicy(
        null as unknown as {},
      ),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterFailoverPolicy(
        [] as unknown as {},
      ),
    "INVALID_ROUTING_REQUEST",
  );
}

function testInvalidMaximumExchangeAttempts(): void {
  for (
    const value of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertRouterError(
      () =>
        normalizeExchangeRouterFailoverPolicy({
          maximumExchangeAttempts:
            value,
        }),
      "INVALID_ATTEMPT_LIMIT",
    );
  }
}

function testRetryDelayCalculation(): void {
  const policy =
    normalizeExchangeRouterRetryPolicy({
      retryDelayMs: 100,
      backoffMultiplier: 2,
      maximumRetryDelayMs: 1_000,
    });

  assert.equal(
    calculateExchangeRouterRetryDelay(
      1,
      policy,
    ),
    100,
  );

  assert.equal(
    calculateExchangeRouterRetryDelay(
      2,
      policy,
    ),
    200,
  );

  assert.equal(
    calculateExchangeRouterRetryDelay(
      3,
      policy,
    ),
    400,
  );

  assert.equal(
    calculateExchangeRouterRetryDelay(
      4,
      policy,
    ),
    800,
  );

  assert.equal(
    calculateExchangeRouterRetryDelay(
      5,
      policy,
    ),
    1_000,
  );

  assert.equal(
    calculateExchangeRouterRetryDelay(
      10,
      policy,
    ),
    1_000,
  );
}

function testInvalidRetryDelayAttempt(): void {
  for (
    const value of [
      0,
      -1,
      1.5,
      Number.NaN,
    ]
  ) {
    assertRouterError(
      () =>
        calculateExchangeRouterRetryDelay(
          value,
          DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY,
        ),
      "INVALID_ATTEMPT_LIMIT",
    );
  }
}

function testRouterRequestDefaults(): void {
  const request =
    normalizeExchangeRouterRequest({
      operation: "GET_TICKER",
    });

  assert.equal(
    request.operation,
    "GET_TICKER",
  );

  assert.equal(
    request.strategy,
    "FIRST_MATCH",
  );

  assert.deepEqual(
    request.discovery,
    {
      capabilities: {},
    },
  );

  assert.deepEqual(
    request.retryPolicy,
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY,
  );

  assert.deepEqual(
    request.failoverPolicy,
    DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY,
  );

  assert.equal(
    request.requestId,
    undefined,
  );

  assert.equal(
    request.requestedAt,
    undefined,
  );

  assert.equal(
    request.metadata,
    undefined,
  );

  assert.ok(
    Object.isFrozen(request),
  );

  assert.ok(
    Object.isFrozen(
      request.discovery,
    ),
  );
}

function testCompleteRouterRequestNormalization(): void {
  const source =
    createValidRequest();

  const request =
    normalizeExchangeRouterRequest(
      source,
    );

  assert.equal(
    request.operation,
    "PLACE_ORDER",
  );

  assert.equal(
    request.strategy,
    "HEALTH_AWARE",
  );

  assert.deepEqual(
    request.discovery,
    {
      preferredExchangeIds: [
        "okx",
        "binance",
      ],
      excludeExchangeIds: [
        "bybit",
      ],
      allowedLifecycleStates: [
        "RUNNING",
        "DEGRADED",
      ],
      allowedHealthStatuses: [
        "HEALTHY",
        "DEGRADED",
      ],
      capabilities: {
        marketTypes: [
          "SPOT",
        ],
        trading: [
          "PLACE_ORDER",
        ],
        requirePrivateApi: true,
      },
    },
  );

  assert.deepEqual(
    request.retryPolicy,
    {
      maxAttempts: 4,
      retryDelayMs: 50,
      backoffMultiplier: 2,
      maximumRetryDelayMs: 500,
      retryableErrorCodes: [
        "NETWORK_ERROR",
        "TIMEOUT",
      ],
    },
  );

  assert.deepEqual(
    request.failoverPolicy,
    {
      enabled: true,
      maximumExchangeAttempts: 2,
      retryCurrentExchangeFirst: true,
      failoverOnNonRetryableError: false,
    },
  );

  assert.equal(
    request.requestId,
    "route-request-001",
  );

  assert.equal(
    request.requestedAt,
    1_000,
  );

  assert.deepEqual(
    request.metadata,
    {
      strategyId: "ema-crossover",
    },
  );

  assert.ok(
    Object.isFrozen(request),
  );

  assert.ok(
    Object.isFrozen(
      request.discovery,
    ),
  );

  assert.ok(
    Object.isFrozen(
      request.retryPolicy,
    ),
  );

  assert.ok(
    Object.isFrozen(
      request.failoverPolicy,
    ),
  );

  assert.ok(
    Object.isFrozen(
      request.metadata,
    ),
  );
}

function testCapabilitiesOverrideDiscoveryCapabilities(): void {
  const request =
    normalizeExchangeRouterRequest({
      operation: "GET_TICKER",
      capabilities: {
        marketTypes: [
          "SPOT",
        ],
      },
      discovery: {
        preferredExchangeIds: [
          "okx",
        ],
        capabilities: {
          marketTypes: [
            "FUTURES",
          ],
        },
      } as never,
    });

  assert.deepEqual(
    request.discovery.capabilities,
    {
      marketTypes: [
        "SPOT",
      ],
    },
  );
}

function testRequestInputIsolation(): void {
  const metadata = {
    strategyId: "breakout",
  };

  const source =
    createValidRequest({
      metadata,
    });

  const request =
    normalizeExchangeRouterRequest(
      source,
    );

  assert.notEqual(
    request.metadata,
    metadata,
  );

  assert.deepEqual(
    source.metadata,
    {
      strategyId: "breakout",
    },
  );
}

function testInvalidRouterRequestShape(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterRequest(
        null as unknown as ExchangeRouterRequest,
      ),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRequest(
        [] as unknown as ExchangeRouterRequest,
      ),
    "INVALID_ROUTING_REQUEST",
  );
}

function testInvalidOperation(): void {
  const error =
    assertRouterError(
      () =>
        normalizeExchangeRouterRequest({
          operation:
            "INVALID" as never,
        }),
      "INVALID_OPERATION",
    );

  assert.equal(
    error.operation,
    undefined,
  );
}

function testInvalidStrategy(): void {
  const error =
    assertRouterError(
      () =>
        normalizeExchangeRouterRequest({
          operation: "GET_TICKER",
          strategy:
            "RANDOM" as never,
        }),
      "INVALID_STRATEGY",
    );

  assert.equal(
    error.operation,
    "GET_TICKER",
  );
}

function testInvalidRequestedAt(): void {
  for (
    const value of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertRouterError(
      () =>
        normalizeExchangeRouterRequest({
          operation: "GET_TICKER",
          requestedAt: value,
        }),
      "INVALID_ROUTING_REQUEST",
    );
  }
}

function testInvalidDiscoveryShape(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterRequest({
        operation: "GET_TICKER",
        discovery:
          null as never,
      }),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRequest({
        operation: "GET_TICKER",
        discovery:
          [] as never,
      }),
    "INVALID_ROUTING_REQUEST",
  );
}

function testInvalidMetadata(): void {
  assertRouterError(
    () =>
      normalizeExchangeRouterRequest({
        operation: "GET_TICKER",
        metadata:
          null as unknown as Readonly<
            Record<string, unknown>
          >,
      }),
    "INVALID_ROUTING_REQUEST",
  );

  assertRouterError(
    () =>
      normalizeExchangeRouterRequest({
        operation: "GET_TICKER",
        metadata:
          [] as unknown as Readonly<
            Record<string, unknown>
          >,
      }),
    "INVALID_ROUTING_REQUEST",
  );
}

function runExchangeRouterTypeTests(): void {
  testCanonicalConstants();
  testDefaultPolicies();
  testRouterErrorProperties();
  testRouterErrorDefaults();
  testTypeGuards();
  testRetryPolicyDefaults();
  testRetryPolicyOverrides();
  testPartialRetryPolicy();
  testInvalidRetryPolicyShape();
  testInvalidMaximumAttempts();
  testInvalidRetryDelay();
  testInvalidBackoffMultiplier();
  testInvalidMaximumRetryDelay();
  testInvalidRetryableErrorCodes();
  testFailoverPolicyDefaults();
  testFailoverPolicyOverrides();
  testPartialFailoverPolicy();
  testInvalidFailoverPolicyShape();
  testInvalidMaximumExchangeAttempts();
  testRetryDelayCalculation();
  testInvalidRetryDelayAttempt();
  testRouterRequestDefaults();
  testCompleteRouterRequestNormalization();
  testCapabilitiesOverrideDiscoveryCapabilities();
  testRequestInputIsolation();
  testInvalidRouterRequestShape();
  testInvalidOperation();
  testInvalidStrategy();
  testInvalidRequestedAt();
  testInvalidDiscoveryShape();
  testInvalidMetadata();

  console.log(
    "All deterministic exchange router contract tests passed successfully.",
  );
}

runExchangeRouterTypeTests();