import assert from "node:assert/strict";

import {
  DeterministicMarketDataProvider,
} from "./deterministic-market-data-provider";

import {
  InMemoryMarketDataProviderRegistry,
} from "./market-data-provider.registry";

import {
  MarketDataError,
  MarketDataProviderCapability,
  MarketDataProviderDescriptor,
  marketDataProviderId,
} from "./market-data-provider.types";

const PROVIDER_A_ID =
  marketDataProviderId(
    "provider-a",
  );

const PROVIDER_B_ID =
  marketDataProviderId(
    "provider-b",
  );

const PROVIDER_C_ID =
  marketDataProviderId(
    "provider-c",
  );

const MISSING_PROVIDER_ID =
  marketDataProviderId(
    "provider-missing",
  );

function createDescriptor(
  options: Readonly<{
    id: ReturnType<
      typeof marketDataProviderId
    >;

    name?: string;

    exchange?:
      | "MOCK"
      | "BINANCE"
      | "BYBIT"
      | "OKX";

    status?:
      | "INITIALIZING"
      | "READY"
      | "DEGRADED"
      | "UNAVAILABLE"
      | "STOPPED";

    capabilities?:
      readonly MarketDataProviderCapability[];
  }>,
): MarketDataProviderDescriptor {
  const exchange =
    options.exchange ?? "MOCK";

  const capabilities =
    options.capabilities ??
    Object.freeze([
      "TICKER",
      "HISTORICAL_CANDLES",
      "HEALTH_CHECK",
    ] as const);

  return Object.freeze({
    id: options.id,

    exchange,

    name:
      options.name ??
      String(options.id),

    description:
      `Test provider ${String(
        options.id,
      )}.`,

    version: "1.0.0",

    status:
      options.status ?? "STOPPED",

    capabilities:
      Object.freeze({
        providerId:
          options.id,

        exchange,

        capabilities:
          Object.freeze([
            ...capabilities,
          ]),

        marketTypes:
          Object.freeze([
            "SPOT",
          ] as const),

        timeframes:
          Object.freeze([
            "1m",
            "5m",
            "1h",
          ] as const),

        supportsPublicAccess:
          true,

        supportsAuthenticatedAccess:
          false,

        supportsStreaming:
          false,

        supportsHistoricalData:
          capabilities.includes(
            "HISTORICAL_CANDLES",
          ),

        maximumHistoricalCandlesPerRequest:
          1_000,

        maximumOrderBookDepth:
          100,
      }),

    configuration:
      Object.freeze({
        providerId:
          options.id,

        exchange,

        enabled: true,

        requestTimeoutMilliseconds:
          5_000,

        maximumRetries: 3,

        retryBaseDelayMilliseconds:
          100,

        retryMaximumDelayMilliseconds:
          2_000,

        cacheEnabled: false,
      }),
  });
}

function createProvider(
  options: Readonly<{
    id: ReturnType<
      typeof marketDataProviderId
    >;

    name?: string;

    exchange?:
      | "MOCK"
      | "BINANCE"
      | "BYBIT"
      | "OKX";

    status?:
      | "INITIALIZING"
      | "READY"
      | "DEGRADED"
      | "UNAVAILABLE"
      | "STOPPED";
  }>,
): DeterministicMarketDataProvider {
  let timestamp =
    1_704_067_200_000;

  return new DeterministicMarketDataProvider({
    descriptor:
      createDescriptor(options),

    dataset:
      Object.freeze({}),

    now: () => {
      const current =
        timestamp;

      timestamp += 1;

      return current;
    },
  });
}

function assertMarketDataError(
  operation: () => unknown,
  expectedCode:
    MarketDataError["code"],
): void {
  assert.throws(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof
          MarketDataError,
        "Expected MarketDataError.",
      );

      assert.equal(
        error.code,
        expectedCode,
      );

      return true;
    },
  );
}

function testRegisterProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const provider =
    createProvider({
      id: PROVIDER_A_ID,
    });

  registry.register(
    provider,
  );

  assert.equal(
    registry.count(),
    1,
  );

  assert.equal(
    registry.has({
      providerId:
        PROVIDER_A_ID,
    }),
    true,
  );

  assert.equal(
    registry.get({
      providerId:
        PROVIDER_A_ID,
    }),
    provider,
  );
}

function testDuplicateRegistration(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const first =
    createProvider({
      id: PROVIDER_A_ID,
      name: "First Provider",
    });

  const duplicate =
    createProvider({
      id: PROVIDER_A_ID,
      name:
        "Duplicate Provider",
    });

  registry.register(
    first,
  );

  assertMarketDataError(
    () => {
      registry.register(
        duplicate,
      );
    },
    "PROVIDER_ALREADY_REGISTERED",
  );

  assert.equal(
    registry.count(),
    1,
  );

  assert.equal(
    registry.get({
      providerId:
        PROVIDER_A_ID,
    }),
    first,
  );
}

function testReplaceExistingProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const original =
    createProvider({
      id: PROVIDER_A_ID,
      name:
        "Original Provider",
    });

  const replacement =
    createProvider({
      id: PROVIDER_A_ID,
      name:
        "Replacement Provider",
    });

  registry.register(
    original,
  );

  registry.replace(
    replacement,
  );

  assert.equal(
    registry.count(),
    1,
  );

  assert.equal(
    registry.get({
      providerId:
        PROVIDER_A_ID,
    }),
    replacement,
  );

  assert.notEqual(
    registry.get({
      providerId:
        PROVIDER_A_ID,
    }),
    original,
  );
}

function testReplaceMissingProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const provider =
    createProvider({
      id: PROVIDER_A_ID,
    });

  registry.replace(
    provider,
  );

  assert.equal(
    registry.count(),
    1,
  );

  assert.equal(
    registry.require({
      providerId:
        PROVIDER_A_ID,
    }),
    provider,
  );
}

function testGetMissingProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  assert.equal(
    registry.get({
      providerId:
        MISSING_PROVIDER_ID,
    }),
    undefined,
  );

  assert.equal(
    registry.has({
      providerId:
        MISSING_PROVIDER_ID,
    }),
    false,
  );
}

function testRequireProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const provider =
    createProvider({
      id: PROVIDER_A_ID,
    });

  registry.register(
    provider,
  );

  const required =
    registry.require({
      providerId:
        PROVIDER_A_ID,
    });

  assert.equal(
    required,
    provider,
  );
}

function testRequireMissingProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  assertMarketDataError(
    () => {
      registry.require({
        providerId:
          MISSING_PROVIDER_ID,
      });
    },
    "PROVIDER_NOT_FOUND",
  );
}

function testRemoveProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const provider =
    createProvider({
      id: PROVIDER_A_ID,
    });

  registry.register(
    provider,
  );

  assert.equal(
    registry.remove({
      providerId:
        PROVIDER_A_ID,
    }),
    true,
  );

  assert.equal(
    registry.count(),
    0,
  );

  assert.equal(
    registry.has({
      providerId:
        PROVIDER_A_ID,
    }),
    false,
  );

  assert.equal(
    registry.get({
      providerId:
        PROVIDER_A_ID,
    }),
    undefined,
  );
}

function testRemoveMissingProvider(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  assert.equal(
    registry.remove({
      providerId:
        MISSING_PROVIDER_ID,
    }),
    false,
  );

  assert.equal(
    registry.count(),
    0,
  );
}

function testDeterministicOrdering(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const providerC =
    createProvider({
      id: PROVIDER_C_ID,
    });

  const providerA =
    createProvider({
      id: PROVIDER_A_ID,
    });

  const providerB =
    createProvider({
      id: PROVIDER_B_ID,
    });

  registry.register(
    providerC,
  );

  registry.register(
    providerA,
  );

  registry.register(
    providerB,
  );

  const providers =
    registry.list();

  assert.deepEqual(
    providers.map(
      (provider) =>
        String(
          provider.getId(),
        ),
    ),
    [
      "provider-a",
      "provider-b",
      "provider-c",
    ],
  );

  assert.equal(
    providers[0],
    providerA,
  );

  assert.equal(
    providers[1],
    providerB,
  );

  assert.equal(
    providers[2],
    providerC,
  );
}

function testListImmutability(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  registry.register(
    createProvider({
      id: PROVIDER_A_ID,
    }),
  );

  registry.register(
    createProvider({
      id: PROVIDER_B_ID,
    }),
  );

  const providers =
    registry.list();

  assert.equal(
    Object.isFrozen(
      providers,
    ),
    true,
  );

  assert.throws(() => {
    (
      providers as
        DeterministicMarketDataProvider[]
    ).push(
      createProvider({
        id: PROVIDER_C_ID,
      }),
    );
  }, TypeError);

  assert.equal(
    registry.count(),
    2,
  );
}

function testListDefensiveArray(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  registry.register(
    createProvider({
      id: PROVIDER_A_ID,
    }),
  );

  const first =
    registry.list();

  const second =
    registry.list();

  assert.deepEqual(
    first,
    second,
  );

  assert.notEqual(
    first,
    second,
  );
}

function testCount(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  assert.equal(
    registry.count(),
    0,
  );

  registry.register(
    createProvider({
      id: PROVIDER_A_ID,
    }),
  );

  assert.equal(
    registry.count(),
    1,
  );

  registry.register(
    createProvider({
      id: PROVIDER_B_ID,
    }),
  );

  assert.equal(
    registry.count(),
    2,
  );

  registry.remove({
    providerId:
      PROVIDER_A_ID,
  });

  assert.equal(
    registry.count(),
    1,
  );
}

function testClear(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  registry.register(
    createProvider({
      id: PROVIDER_A_ID,
    }),
  );

  registry.register(
    createProvider({
      id: PROVIDER_B_ID,
    }),
  );

  registry.register(
    createProvider({
      id: PROVIDER_C_ID,
    }),
  );

  assert.equal(
    registry.count(),
    3,
  );

  registry.clear();

  assert.equal(
    registry.count(),
    0,
  );

  assert.deepEqual(
    registry.list(),
    [],
  );

  assert.equal(
    registry.has({
      providerId:
        PROVIDER_A_ID,
    }),
    false,
  );

  registry.clear();

  assert.equal(
    registry.count(),
    0,
  );
}

function testIndependentRegistries(): void {
  const firstRegistry =
    new InMemoryMarketDataProviderRegistry();

  const secondRegistry =
    new InMemoryMarketDataProviderRegistry();

  const firstProvider =
    createProvider({
      id: PROVIDER_A_ID,
    });

  const secondProvider =
    createProvider({
      id: PROVIDER_B_ID,
    });

  firstRegistry.register(
    firstProvider,
  );

  secondRegistry.register(
    secondProvider,
  );

  assert.equal(
    firstRegistry.count(),
    1,
  );

  assert.equal(
    secondRegistry.count(),
    1,
  );

  assert.equal(
    firstRegistry.has({
      providerId:
        PROVIDER_A_ID,
    }),
    true,
  );

  assert.equal(
    firstRegistry.has({
      providerId:
        PROVIDER_B_ID,
    }),
    false,
  );

  assert.equal(
    secondRegistry.has({
      providerId:
        PROVIDER_B_ID,
    }),
    true,
  );

  assert.equal(
    secondRegistry.has({
      providerId:
        PROVIDER_A_ID,
    }),
    false,
  );
}

function testProviderIdentityIsPreserved(): void {
  const registry =
    new InMemoryMarketDataProviderRegistry();

  const provider =
    createProvider({
      id: PROVIDER_A_ID,
      exchange: "BYBIT",
    });

  registry.register(
    provider,
  );

  const stored =
    registry.require({
      providerId:
        PROVIDER_A_ID,
    });

  assert.equal(
    stored,
    provider,
  );

  assert.equal(
    stored
      .getDescriptor()
      .exchange,
    "BYBIT",
  );
}

function runMarketDataProviderRegistryTests(): void {
  console.log(
    "Running market-data provider registry tests...",
  );

  testRegisterProvider();
  testDuplicateRegistration();

  testReplaceExistingProvider();
  testReplaceMissingProvider();

  testGetMissingProvider();

  testRequireProvider();
  testRequireMissingProvider();

  testRemoveProvider();
  testRemoveMissingProvider();

  testDeterministicOrdering();

  testListImmutability();
  testListDefensiveArray();

  testCount();
  testClear();

  testIndependentRegistries();
  testProviderIdentityIsPreserved();

  console.log(
    "All market-data provider registry tests passed successfully.",
  );
}

runMarketDataProviderRegistryTests();