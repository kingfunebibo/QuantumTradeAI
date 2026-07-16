import assert from "node:assert/strict";

import {
  ExchangeDiscovery,
  ExchangeDiscoveryError,
  normalizeExchangeDiscoveryRequest,
  type ExchangeDiscoveryErrorCode,
  type ExchangeDiscoveryLifecycleContract,
} from "./exchange-connectivity/management/exchange-discovery";

import {
  ExchangeCapabilityRegistry,
} from "./exchange-connectivity/management/exchange-capability-registry";

import {
  ExchangeRegistry,
} from "./exchange-connectivity/management/exchange-registry";

import {
  createConnectorHealthSnapshot,
  createInitialConnectorLifecycleSnapshot,
  type ConnectorHealthStatus,
  type ConnectorLifecycleSnapshot,
  type ConnectorLifecycleState,
} from "./exchange-connectivity/management/connector-lifecycle.types";

interface TestConnector {
  readonly name: string;
}

function createConnector(
  name: string,
): TestConnector {
  return Object.freeze({
    name,
  });
}

function assertDiscoveryError(
  operation: () => unknown,
  expectedCode: ExchangeDiscoveryErrorCode,
): ExchangeDiscoveryError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof ExchangeDiscoveryError,
    `Expected ExchangeDiscoveryError but received ${
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

function createLifecycleSnapshot(
  exchangeId: string,
  state: ConnectorLifecycleState,
  healthStatus: ConnectorHealthStatus,
  operationInProgress = false,
): ConnectorLifecycleSnapshot {
  const initial =
    createInitialConnectorLifecycleSnapshot(
      exchangeId,
      1,
    );

  return Object.freeze({
    ...initial,
    state,
    health: createConnectorHealthSnapshot({
      status: healthStatus,
      observedAt: 2,
    }),
    operationInProgress,
    ...(operationInProgress
      ? {
          activeCommand: "START" as const,
        }
      : {}),
  });
}

class TestLifecycleInspector
  implements ExchangeDiscoveryLifecycleContract
{
  private readonly snapshots =
    new Map<
      string,
      ConnectorLifecycleSnapshot
    >();

  public set(
    snapshot: ConnectorLifecycleSnapshot,
  ): void {
    this.snapshots.set(
      snapshot.exchangeId,
      snapshot,
    );
  }

  public remove(exchangeId: string): void {
    this.snapshots.delete(exchangeId);
  }

  public inspect(
    exchangeId: string,
  ): ConnectorLifecycleSnapshot {
    const snapshot =
      this.snapshots.get(exchangeId);

    if (snapshot === undefined) {
      throw new Error(
        `Missing lifecycle snapshot for ${exchangeId}.`,
      );
    }

    return snapshot;
  }

  public inspectAll():
    readonly ConnectorLifecycleSnapshot[] {
    return Object.freeze(
      Array.from(
        this.snapshots.values(),
      ),
    );
  }
}

function createDiscoveryFixture(): Readonly<{
  registry: ExchangeRegistry<TestConnector>;
  capabilityRegistry: ExchangeCapabilityRegistry;
  lifecycle: TestLifecycleInspector;
  discovery: ExchangeDiscovery<TestConnector>;
  okx: TestConnector;
  binance: TestConnector;
  bybit: TestConnector;
}> {
  const registry =
    new ExchangeRegistry<TestConnector>();

  const capabilityRegistry =
    new ExchangeCapabilityRegistry();

  const lifecycle =
    new TestLifecycleInspector();

  const okx =
    createConnector("OKX");

  const binance =
    createConnector("Binance");

  const bybit =
    createConnector("Bybit");

  registry.register({
    exchangeId: "okx",
    connector: okx,
  });

  registry.register({
    exchangeId: "binance",
    connector: binance,
  });

  registry.register({
    exchangeId: "bybit",
    connector: bybit,
  });

  capabilityRegistry.register({
    exchangeId: "okx",
    marketTypes: [
      "SPOT",
      "PERPETUAL",
    ],
    trading: [
      "PLACE_ORDER",
      "CANCEL_ORDER",
      "AMEND_ORDER",
    ],
    marketData: [
      "TICKER",
      "ORDER_BOOK",
      "CANDLES",
      "SERVER_TIME",
    ],
    account: [
      "BALANCES",
      "POSITIONS",
    ],
    realtime: [
      "PUBLIC_WEBSOCKET",
      "PRIVATE_WEBSOCKET",
      "ORDER_BOOK_STREAM",
      "ORDER_STREAM",
    ],
    authentication: [
      "API_KEY",
      "API_SECRET",
      "PASSPHRASE",
      "HMAC_SIGNATURE",
    ],
    orderTypes: [
      "MARKET",
      "LIMIT",
      "STOP_LIMIT",
    ],
    timeInForce: [
      "GTC",
      "IOC",
      "POST_ONLY",
    ],
    positionModes: [
      "ONE_WAY",
      "HEDGE",
    ],
    supportsSandbox: true,
    supportsPrivateApi: true,
  });

  capabilityRegistry.register({
    exchangeId: "binance",
    marketTypes: [
      "SPOT",
      "FUTURES",
    ],
    trading: [
      "PLACE_ORDER",
      "CANCEL_ORDER",
    ],
    marketData: [
      "TICKER",
      "ORDER_BOOK",
      "CANDLES",
    ],
    account: [
      "BALANCES",
      "POSITIONS",
    ],
    realtime: [
      "PUBLIC_WEBSOCKET",
      "ORDER_BOOK_STREAM",
    ],
    authentication: [
      "API_KEY",
      "API_SECRET",
      "HMAC_SIGNATURE",
    ],
    orderTypes: [
      "MARKET",
      "LIMIT",
    ],
    timeInForce: [
      "GTC",
      "IOC",
    ],
    positionModes: [
      "ONE_WAY",
    ],
    supportsSandbox: true,
    supportsPrivateApi: true,
  });

  capabilityRegistry.register({
    exchangeId: "bybit",
    marketTypes: [
      "SPOT",
      "PERPETUAL",
    ],
    trading: [
      "PLACE_ORDER",
    ],
    marketData: [
      "TICKER",
      "ORDER_BOOK",
    ],
    account: [
      "BALANCES",
      "POSITIONS",
    ],
    realtime: [
      "PUBLIC_WEBSOCKET",
      "PRIVATE_WEBSOCKET",
    ],
    authentication: [
      "API_KEY",
      "API_SECRET",
      "HMAC_SIGNATURE",
    ],
    orderTypes: [
      "MARKET",
      "LIMIT",
    ],
    timeInForce: [
      "GTC",
    ],
    positionModes: [
      "ONE_WAY",
      "HEDGE",
    ],
    supportsSandbox: false,
    supportsPrivateApi: true,
  });

  lifecycle.set(
    createLifecycleSnapshot(
      "okx",
      "RUNNING",
      "HEALTHY",
    ),
  );

  lifecycle.set(
    createLifecycleSnapshot(
      "binance",
      "RUNNING",
      "HEALTHY",
    ),
  );

  lifecycle.set(
    createLifecycleSnapshot(
      "bybit",
      "DEGRADED",
      "DEGRADED",
    ),
  );

  const discovery =
    new ExchangeDiscovery(
      registry,
      capabilityRegistry,
      lifecycle,
    );

  return Object.freeze({
    registry,
    capabilityRegistry,
    lifecycle,
    discovery,
    okx,
    binance,
    bybit,
  });
}

function testDefaultDiscovery(): void {
  const {
    discovery,
    okx,
    binance,
    bybit,
  } = createDiscoveryFixture();

  const result =
    discovery.discover();

  assert.equal(
    result.candidateCount,
    3,
  );

  assert.equal(
    result.evaluatedExchangeCount,
    3,
  );

  assert.equal(
    result.rejectedExchangeCount,
    0,
  );

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  assert.equal(
    result.candidates[0]?.connector,
    okx,
  );

  assert.equal(
    result.candidates[1]?.connector,
    binance,
  );

  assert.equal(
    result.candidates[2]?.connector,
    bybit,
  );

  assert.ok(
    Object.isFrozen(result),
  );

  assert.ok(
    Object.isFrozen(
      result.candidates,
    ),
  );

  assert.ok(
    Object.isFrozen(
      result.request,
    ),
  );

  assert.ok(
    result.candidates.every(
      (candidate) =>
        Object.isFrozen(candidate),
    ),
  );

  assert.ok(
    result.candidates.every(
      (candidate) =>
        Object.isFrozen(
          candidate.reasons,
        ),
    ),
  );
}

function testCapabilityFiltering(): void {
  const { discovery } =
    createDiscoveryFixture();

  const result =
    discovery.discover({
      capabilities: {
        marketTypes: [
          "PERPETUAL",
        ],
        trading: [
          "PLACE_ORDER",
        ],
        realtime: [
          "PRIVATE_WEBSOCKET",
        ],
        positionModes: [
          "HEDGE",
        ],
        requirePrivateApi: true,
      },
    });

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "bybit",
    ],
  );

  assert.equal(
    result.rejectedExchangeCount,
    1,
  );

  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.reasons.includes(
          "CAPABILITIES_MATCHED",
        ),
    ),
  );
}

function testSandboxFiltering(): void {
  const { discovery } =
    createDiscoveryFixture();

  const result =
    discovery.discover({
      capabilities: {
        marketTypes: [
          "SPOT",
        ],
        requireSandbox: true,
      },
    });

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
    ],
  );
}

function testIncludeAndExcludeFilters(): void {
  const { discovery } =
    createDiscoveryFixture();

  const included =
    discovery.discover({
      includeExchangeIds: [
        "BYBIT",
        " OKX ",
        "bybit",
      ],
    });

  assert.deepEqual(
    included.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "bybit",
    ],
  );

  const excluded =
    discovery.discover({
      excludeExchangeIds: [
        "BINANCE",
        "bybit",
      ],
    });

  assert.deepEqual(
    excluded.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
    ],
  );

  assertDiscoveryError(
    () =>
      discovery.discover({
        includeExchangeIds: [
          "okx",
        ],
        excludeExchangeIds: [
          " OKX ",
        ],
      }),
    "INVALID_DISCOVERY_REQUEST",
  );
}

function testPreferredExchangeRanking(): void {
  const { discovery } =
    createDiscoveryFixture();

  const result =
    discovery.discover({
      preferredExchangeIds: [
        "bybit",
        "binance",
      ],
    });

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "bybit",
      "binance",
      "okx",
    ],
  );

  assert.equal(
    result.candidates[0]
      ?.preferenceIndex,
    0,
  );

  assert.equal(
    result.candidates[1]
      ?.preferenceIndex,
    1,
  );

  assert.equal(
    result.candidates[2]
      ?.preferenceIndex,
    undefined,
  );

  assert.ok(
    result.candidates[0]
      ?.reasons.includes(
        "PREFERRED",
      ),
  );
}

function testPriorityOverridesPreference(): void {
  const { discovery } =
    createDiscoveryFixture();

  const result =
    discovery.discover({
      preferredExchangeIds: [
        "bybit",
      ],
      priorities: [
        {
          exchangeId: "binance",
          priority: 100,
        },
        {
          exchangeId: "okx",
          priority: 50,
        },
      ],
    });

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "okx",
      "bybit",
    ],
  );

  assert.equal(
    result.candidates[0]
      ?.priority,
    100,
  );

  assert.equal(
    result.candidates[1]
      ?.priority,
    50,
  );

  assert.equal(
    result.candidates[2]
      ?.priority,
    0,
  );
}

function testDuplicatePriorityNormalization(): void {
  const request =
    normalizeExchangeDiscoveryRequest({
      priorities: [
        {
          exchangeId: "okx",
          priority: 10,
        },
        {
          exchangeId: " OKX ",
          priority: 25,
        },
        {
          exchangeId: "binance",
          priority: 5,
        },
      ],
    });

  assert.deepEqual(
    request.priorities,
    [
      {
        exchangeId: "binance",
        priority: 5,
      },
      {
        exchangeId: "okx",
        priority: 25,
      },
    ],
  );

  assert.ok(
    Object.isFrozen(
      request.priorities,
    ),
  );

  assert.ok(
    request.priorities.every(
      (priority) =>
        Object.isFrozen(priority),
    ),
  );
}

function testLifecycleStateFiltering(): void {
  const {
    discovery,
    lifecycle,
  } = createDiscoveryFixture();

  lifecycle.set(
    createLifecycleSnapshot(
      "binance",
      "STOPPED",
      "HEALTHY",
    ),
  );

  const defaultResult =
    discovery.discover();

  assert.deepEqual(
    defaultResult.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "bybit",
    ],
  );

  const stoppedAllowed =
    discovery.discover({
      allowedLifecycleStates: [
        "RUNNING",
        "DEGRADED",
        "STOPPED",
      ],
    });

  assert.deepEqual(
    stoppedAllowed.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );
}

function testHealthFiltering(): void {
  const {
    discovery,
    lifecycle,
  } = createDiscoveryFixture();

  lifecycle.set(
    createLifecycleSnapshot(
      "binance",
      "RUNNING",
      "UNHEALTHY",
    ),
  );

  const defaultResult =
    discovery.discover();

  assert.deepEqual(
    defaultResult.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "bybit",
    ],
  );

  const unhealthyAllowed =
    discovery.discover({
      allowedHealthStatuses: [
        "HEALTHY",
        "DEGRADED",
        "UNHEALTHY",
      ],
    });

  assert.deepEqual(
    unhealthyAllowed.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "bybit",
      "binance",
    ],
  );
}

function testOperationInProgressFiltering(): void {
  const {
    discovery,
    lifecycle,
  } = createDiscoveryFixture();

  lifecycle.set(
    createLifecycleSnapshot(
      "okx",
      "RUNNING",
      "HEALTHY",
      true,
    ),
  );

  const excluded =
    discovery.discover();

  assert.deepEqual(
    excluded.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "bybit",
    ],
  );

  const allowed =
    discovery.discover({
      excludeOperationInProgress: false,
    });

  assert.deepEqual(
    allowed.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );
}

function testLifecycleEligibilityDisabled(): void {
  const {
    registry,
    capabilityRegistry,
  } = createDiscoveryFixture();

  const discovery =
    new ExchangeDiscovery(
      registry,
      capabilityRegistry,
      undefined,
      {
        requireLifecycleEligibilityByDefault:
          false,
      },
    );

  const result =
    discovery.discover();

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.lifecycleSnapshot ===
        undefined,
    ),
  );

  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.reasons.includes(
          "LIFECYCLE_NOT_REQUIRED",
        ),
    ),
  );

  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.reasons.includes(
          "HEALTH_NOT_REQUIRED",
        ),
    ),
  );
}

function testMissingLifecycleInspectorErrors(): void {
  const {
    registry,
    capabilityRegistry,
  } = createDiscoveryFixture();

  assertDiscoveryError(
    () =>
      new ExchangeDiscovery(
        registry,
        capabilityRegistry,
      ),
    "INVALID_DISCOVERY_REQUEST",
  );

  const discovery =
    new ExchangeDiscovery(
      registry,
      capabilityRegistry,
      undefined,
      {
        requireLifecycleEligibilityByDefault:
          false,
      },
    );

  assertDiscoveryError(
    () =>
      discovery.discover({
        requireLifecycleEligibility: true,
      }),
    "INVALID_DISCOVERY_REQUEST",
  );
}

function testCapabilityProfileNotRequired(): void {
  const {
    registry,
    capabilityRegistry,
    lifecycle,
  } = createDiscoveryFixture();

  capabilityRegistry.unregister(
    "bybit",
  );

  const requiredDiscovery =
    new ExchangeDiscovery(
      registry,
      capabilityRegistry,
      lifecycle,
    );

  const requiredResult =
    requiredDiscovery.discover();

  assert.deepEqual(
    requiredResult.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
    ],
  );

  const optionalResult =
    requiredDiscovery.discover({
      requireCapabilityProfile: false,
    });

  assert.deepEqual(
    optionalResult.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  const bybitCandidate =
    optionalResult.candidates.find(
      (candidate) =>
        candidate.exchangeId ===
        "bybit",
    );

  assert.equal(
    bybitCandidate?.capabilityProfile,
    undefined,
  );

  assert.ok(
    bybitCandidate?.reasons.includes(
      "CAPABILITY_PROFILE_NOT_REQUIRED",
    ),
  );
}

function testDiscoverOneAndRequireOne(): void {
  const { discovery } =
    createDiscoveryFixture();

  const discovered =
    discovery.discoverOne({
      preferredExchangeIds: [
        "bybit",
      ],
    });

  assert.equal(
    discovered?.exchangeId,
    "bybit",
  );

  const required =
    discovery.requireOne({
      priorities: [
        {
          exchangeId: "binance",
          priority: 100,
        },
      ],
    });

  assert.equal(
    required.exchangeId,
    "binance",
  );

  const missing =
    discovery.discoverOne({
      capabilities: {
        marketTypes: [
          "OPTIONS",
        ],
      },
    });

  assert.equal(
    missing,
    undefined,
  );

  assertDiscoveryError(
    () =>
      discovery.requireOne({
        capabilities: {
          marketTypes: [
            "OPTIONS",
          ],
        },
      }),
    "NO_EXCHANGE_CANDIDATES",
  );
}

function testSupports(): void {
  const { discovery } =
    createDiscoveryFixture();

  assert.equal(
    discovery.supports(
      "OKX",
      {
        capabilities: {
          marketTypes: [
            "PERPETUAL",
          ],
          trading: [
            "AMEND_ORDER",
          ],
        },
      },
    ),
    true,
  );

  assert.equal(
    discovery.supports(
      "binance",
      {
        capabilities: {
          marketTypes: [
            "PERPETUAL",
          ],
        },
      },
    ),
    false,
  );

  assert.equal(
    discovery.supports(
      "kraken",
    ),
    false,
  );
}

function testLimit(): void {
  const { discovery } =
    createDiscoveryFixture();

  const result =
    discovery.discover({
      limit: 2,
    });

  assert.equal(
    result.candidateCount,
    2,
  );

  assert.equal(
    result.evaluatedExchangeCount,
    3,
  );

  assert.equal(
    result.rejectedExchangeCount,
    0,
  );

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
    ],
  );
}

function testRegistrationOrderTieBreaker(): void {
  const {
    discovery,
  } = createDiscoveryFixture();

  const result =
    discovery.discover({
      requireLifecycleEligibility: false,
      priorities: [
        {
          exchangeId: "okx",
          priority: 10,
        },
        {
          exchangeId: "binance",
          priority: 10,
        },
        {
          exchangeId: "bybit",
          priority: 10,
        },
      ],
    });

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );
}

function testHealthRanking(): void {
  const {
    discovery,
    lifecycle,
  } = createDiscoveryFixture();

  lifecycle.set(
    createLifecycleSnapshot(
      "okx",
      "RUNNING",
      "DEGRADED",
    ),
  );

  lifecycle.set(
    createLifecycleSnapshot(
      "binance",
      "RUNNING",
      "HEALTHY",
    ),
  );

  lifecycle.set(
    createLifecycleSnapshot(
      "bybit",
      "RUNNING",
      "DEGRADED",
    ),
  );

  const result =
    discovery.discover();

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "okx",
      "bybit",
    ],
  );
}

function testLifecycleRanking(): void {
  const {
    discovery,
    lifecycle,
  } = createDiscoveryFixture();

  lifecycle.set(
    createLifecycleSnapshot(
      "okx",
      "DEGRADED",
      "HEALTHY",
    ),
  );

  lifecycle.set(
    createLifecycleSnapshot(
      "binance",
      "RUNNING",
      "HEALTHY",
    ),
  );

  lifecycle.set(
    createLifecycleSnapshot(
      "bybit",
      "DEGRADED",
      "HEALTHY",
    ),
  );

  const result =
    discovery.discover();

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "okx",
      "bybit",
    ],
  );
}

function testInconsistentLifecycleState(): void {
  const {
    discovery,
    lifecycle,
  } = createDiscoveryFixture();

  lifecycle.remove("binance");

  const error =
    assertDiscoveryError(
      () =>
        discovery.discover(),
      "INCONSISTENT_REGISTRY_STATE",
    );

  assert.equal(
    error.exchangeId,
    "binance",
  );
}

function testNormalizedRequestDefaults(): void {
  const request =
    normalizeExchangeDiscoveryRequest(
      {},
    );

  assert.deepEqual(
    request.capabilities.marketTypes,
    [],
  );

  assert.deepEqual(
    request.includeExchangeIds,
    [],
  );

  assert.deepEqual(
    request.excludeExchangeIds,
    [],
  );

  assert.deepEqual(
    request.preferredExchangeIds,
    [],
  );

  assert.deepEqual(
    request.priorities,
    [],
  );

  assert.deepEqual(
    request.allowedLifecycleStates,
    [
      "RUNNING",
      "DEGRADED",
    ],
  );

  assert.deepEqual(
    request.allowedHealthStatuses,
    [
      "HEALTHY",
      "DEGRADED",
    ],
  );

  assert.equal(
    request.requireLifecycleEligibility,
    true,
  );

  assert.equal(
    request.requireCapabilityProfile,
    true,
  );

  assert.equal(
    request.excludeOperationInProgress,
    true,
  );

  assert.equal(
    request.limit,
    undefined,
  );

  assert.ok(
    Object.isFrozen(request),
  );
}

function testRequestNormalization(): void {
  const request =
    normalizeExchangeDiscoveryRequest({
      includeExchangeIds: [
        " OKX ",
        "okx",
        "BINANCE",
      ],
      excludeExchangeIds: [
        "bybit",
        "BYBIT",
      ],
      preferredExchangeIds: [
        "binance",
        "OKX",
        "binance",
      ],
      allowedLifecycleStates: [
        "DEGRADED",
        "RUNNING",
        "RUNNING",
      ],
      allowedHealthStatuses: [
        "DEGRADED",
        "HEALTHY",
        "HEALTHY",
      ],
      limit: 2,
    });

  assert.deepEqual(
    request.includeExchangeIds,
    [
      "okx",
      "binance",
    ],
  );

  assert.deepEqual(
    request.excludeExchangeIds,
    [
      "bybit",
    ],
  );

  assert.deepEqual(
    request.preferredExchangeIds,
    [
      "binance",
      "okx",
    ],
  );

  assert.deepEqual(
    request.allowedLifecycleStates,
    [
      "RUNNING",
      "DEGRADED",
    ],
  );

  assert.deepEqual(
    request.allowedHealthStatuses,
    [
      "HEALTHY",
      "DEGRADED",
    ],
  );

  assert.equal(
    request.limit,
    2,
  );
}

function testInvalidRequests(): void {
  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest(
        null as unknown as {},
      ),
    "INVALID_DISCOVERY_REQUEST",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        includeExchangeIds:
          "okx" as unknown as readonly string[],
      }),
    "INVALID_DISCOVERY_REQUEST",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        includeExchangeIds: [
          "invalid/exchange",
        ],
      }),
    "INVALID_EXCHANGE_ID",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        priorities:
          "okx" as unknown as readonly never[],
      }),
    "INVALID_DISCOVERY_REQUEST",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        priorities: [
          null as never,
        ],
      }),
    "INVALID_PRIORITY",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        priorities: [
          {
            exchangeId: "okx",
            priority: Number.NaN,
          },
        ],
      }),
    "INVALID_PRIORITY",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        allowedLifecycleStates:
          "RUNNING" as unknown as readonly ConnectorLifecycleState[],
      }),
    "INVALID_DISCOVERY_REQUEST",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        allowedLifecycleStates: [
          "INVALID" as never,
        ],
      }),
    "INVALID_ALLOWED_STATE",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        allowedHealthStatuses:
          "HEALTHY" as unknown as readonly ConnectorHealthStatus[],
      }),
    "INVALID_DISCOVERY_REQUEST",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        allowedHealthStatuses: [
          "INVALID" as never,
        ],
      }),
    "INVALID_ALLOWED_HEALTH",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        limit: 0,
      }),
    "INVALID_DISCOVERY_REQUEST",
  );

  assertDiscoveryError(
    () =>
      normalizeExchangeDiscoveryRequest({
        limit: 1.5,
      }),
    "INVALID_DISCOVERY_REQUEST",
  );
}

function runExchangeDiscoveryTests(): void {
  testDefaultDiscovery();
  testCapabilityFiltering();
  testSandboxFiltering();
  testIncludeAndExcludeFilters();
  testPreferredExchangeRanking();
  testPriorityOverridesPreference();
  testDuplicatePriorityNormalization();
  testLifecycleStateFiltering();
  testHealthFiltering();
  testOperationInProgressFiltering();
  testLifecycleEligibilityDisabled();
  testMissingLifecycleInspectorErrors();
  testCapabilityProfileNotRequired();
  testDiscoverOneAndRequireOne();
  testSupports();
  testLimit();
  testRegistrationOrderTieBreaker();
  testHealthRanking();
  testLifecycleRanking();
  testInconsistentLifecycleState();
  testNormalizedRequestDefaults();
  testRequestNormalization();
  testInvalidRequests();

  console.log(
    "All deterministic exchange discovery tests passed successfully.",
  );
}

runExchangeDiscoveryTests();