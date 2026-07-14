import assert from "node:assert/strict";

import { DeterministicMarketDataProvider } from "./deterministic-market-data-provider";
import { DefaultMarketDataManager, MarketDataManagerError } from "./market-data-manager";
import { InMemoryMarketDataProviderRegistry } from "./market-data-provider.registry";
import {
  MarketDataError,
  MarketDataProviderCapability,
  MarketDataProviderDescriptor,
  MarketDataResponse,
  MarketDataStreamEvent,
  MarketDataTicker,
  marketDataNativeSymbol,
  marketDataPrice,
  marketDataProviderId,
  marketDataRequestId,
  marketDataSubscriptionId,
  marketDataSymbol,
  marketDataTimestamp,
  marketDataVolume,
} from "./market-data-provider.types";
import {
  MarketDataProvider,
  MarketDataStreamSubscription,
} from "./market-data-provider";

const BASE_TIME = 1_704_067_200_000;
const BTCUSDT = marketDataSymbol("BTCUSDT");

const PROVIDER_A_ID = marketDataProviderId("provider-a");
const PROVIDER_B_ID = marketDataProviderId("provider-b");
const PROVIDER_C_ID = marketDataProviderId("provider-c");

function createDescriptor(
  id: ReturnType<typeof marketDataProviderId>,
  options: Readonly<{
    status?: "INITIALIZING" | "READY" | "DEGRADED" | "UNAVAILABLE" | "STOPPED";
    capabilities?: readonly MarketDataProviderCapability[];
  }> = {},
): MarketDataProviderDescriptor {
  const capabilities =
    options.capabilities ??
    ([
      "TICKER",
      "TICKERS",
      "ORDER_BOOK",
      "RECENT_TRADES",
      "HISTORICAL_CANDLES",
      "MARKET_DISCOVERY",
      "SERVER_TIME",
      "LIVE_TICKER",
      "HEALTH_CHECK",
    ] as const);

  return Object.freeze({
    id,
    exchange: "MOCK",
    name: String(id),
    version: "1.0.0",
    status: options.status ?? "STOPPED",
    capabilities: Object.freeze({
      providerId: id,
      exchange: "MOCK",
      capabilities: Object.freeze([...capabilities]),
      marketTypes: Object.freeze(["SPOT"] as const),
      timeframes: Object.freeze(["1m", "5m", "1h"] as const),
      supportsPublicAccess: true,
      supportsAuthenticatedAccess: false,
      supportsStreaming: capabilities.some((value) => value.startsWith("LIVE_")),
      supportsHistoricalData: capabilities.includes("HISTORICAL_CANDLES"),
      maximumHistoricalCandlesPerRequest: 1_000,
      maximumOrderBookDepth: 100,
    }),
    configuration: Object.freeze({
      providerId: id,
      exchange: "MOCK",
      enabled: true,
      requestTimeoutMilliseconds: 5_000,
      maximumRetries: 3,
      retryBaseDelayMilliseconds: 100,
      retryMaximumDelayMilliseconds: 2_000,
      cacheEnabled: false,
    }),
  });
}

function createTicker(price: number): MarketDataTicker {
  return Object.freeze({
    symbol: BTCUSDT,
    lastPrice: marketDataPrice(price),
    bidPrice: marketDataPrice(price - 0.1),
    askPrice: marketDataPrice(price + 0.1),
    timestamp: marketDataTimestamp(BASE_TIME),
  });
}

function createProvider(
  id: ReturnType<typeof marketDataProviderId>,
  options: Readonly<{
    status?: "INITIALIZING" | "READY" | "DEGRADED" | "UNAVAILABLE" | "STOPPED";
    capabilities?: readonly MarketDataProviderCapability[];
    tickerPrice?: number;
  }> = {},
): DeterministicMarketDataProvider {
  let now = BASE_TIME;
  const ticker = createTicker(options.tickerPrice ?? 100);

  return new DeterministicMarketDataProvider({
    descriptor: createDescriptor(id, options),
    dataset: Object.freeze({
      markets: Object.freeze([
        Object.freeze({
          exchange: "MOCK",
          marketType: "SPOT",
          symbol: BTCUSDT,
          nativeSymbol: marketDataNativeSymbol("BTC-USDT"),
          baseAsset: "BTC",
          quoteAsset: "USDT",
          status: "ACTIVE",
          supportedTimeframes: Object.freeze(["1m", "5m", "1h"] as const),
        }),
      ]),
      tickers: Object.freeze([ticker]),
      candles: Object.freeze({
        [`${BTCUSDT}::1m`]: Object.freeze([
          Object.freeze({
            symbol: BTCUSDT,
            timeframe: "1m",
            openTime: marketDataTimestamp(BASE_TIME),
            closeTime: marketDataTimestamp(BASE_TIME + 59_999),
            open: marketDataPrice(100),
            high: marketDataPrice(110),
            low: marketDataPrice(90),
            close: marketDataPrice(105),
            volume: marketDataVolume(10),
            isClosed: true,
          }),
        ]),
      }),
      orderBooks: Object.freeze({
        BTCUSDT: Object.freeze({
          symbol: BTCUSDT,
          bids: Object.freeze([
            Object.freeze({
              price: marketDataPrice(99),
              quantity: marketDataVolume(1),
            }),
          ]),
          asks: Object.freeze([
            Object.freeze({
              price: marketDataPrice(101),
              quantity: marketDataVolume(1),
            }),
          ]),
          timestamp: marketDataTimestamp(BASE_TIME),
        }),
      }),
      recentTrades: Object.freeze({
        BTCUSDT: Object.freeze([
          Object.freeze({
            id: "trade-1",
            symbol: BTCUSDT,
            side: "BUY",
            price: marketDataPrice(100),
            quantity: marketDataVolume(1),
            timestamp: marketDataTimestamp(BASE_TIME),
          }),
        ]),
      }),
      tickerStreams: Object.freeze({
        BTCUSDT: Object.freeze([ticker]),
      }),
    }),
    now: () => now++,
  });
}

async function initialize(
  ...providers: readonly DeterministicMarketDataProvider[]
): Promise<void> {
  for (const provider of providers) {
    await provider.initialize();
  }
}

function createRegistry(
  ...providers: readonly MarketDataProvider[]
): InMemoryMarketDataProviderRegistry {
  const registry = new InMemoryMarketDataProviderRegistry();

  for (const provider of providers) {
    registry.register(provider);
  }

  return registry;
}

function baseRequest(id: string) {
  return Object.freeze({
    requestId: marketDataRequestId(id),
    requestedAt: marketDataTimestamp(BASE_TIME),
    exchange: "MOCK" as const,
    marketType: "SPOT" as const,
  });
}

async function collectEvents<TData>(
  subscription: MarketDataStreamSubscription<TData>,
): Promise<readonly MarketDataStreamEvent<TData>[]> {
  const events: MarketDataStreamEvent<TData>[] = [];

  for await (const event of subscription.events) {
    events.push(event);
  }

  return Object.freeze(events);
}

async function assertRejectsCode(
  operation: () => Promise<unknown>,
  expectedCode: MarketDataError["code"],
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof MarketDataError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function patchTickerFailure(
  provider: DeterministicMarketDataProvider,
  error: unknown,
): void {
  provider.getTicker = async (): Promise<
    MarketDataResponse<MarketDataTicker>
  > => {
    throw error;
  };
}

function patchTickerSuccess(
  provider: DeterministicMarketDataProvider,
  price: number,
): void {
  const ticker = createTicker(price);

  provider.getTicker = async (request): Promise<
    MarketDataResponse<MarketDataTicker>
  > =>
    Object.freeze({
      data: ticker,
      metadata: Object.freeze({
        providerId: provider.getId(),
        exchange: provider.getDescriptor().exchange,
        requestId: request.requestId,
        requestedAt: request.requestedAt,
        receivedAt: marketDataTimestamp(BASE_TIME),
        durationMilliseconds: 0,
        cached: false,
        retryCount: 0,
      }),
    });
}

async function testDeterministicSelection(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID);
  const b = createProvider(PROVIDER_B_ID);
  await initialize(a, b);

  const manager = new DefaultMarketDataManager(createRegistry(b, a));

  const result = await manager.getTicker({
    ...baseRequest("deterministic"),
    symbol: BTCUSDT,
  });

  assert.equal(result.execution.selectedProviderId, PROVIDER_A_ID);
  assert.deepEqual(result.execution.attemptedProviderIds, [PROVIDER_A_ID]);
  assert.equal(result.execution.failoverOccurred, false);
}

async function testPreferenceAndOverride(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID, { tickerPrice: 100 });
  const b = createProvider(PROVIDER_B_ID, { tickerPrice: 200 });
  await initialize(a, b);

  const manager = new DefaultMarketDataManager(
    createRegistry(a, b),
    {
      defaultSelectionPolicy: {
        preferredProviderIds: Object.freeze([PROVIDER_B_ID]),
      },
    },
  );

  const preferred = await manager.getTicker({
    ...baseRequest("preferred"),
    symbol: BTCUSDT,
  });

  assert.equal(preferred.execution.selectedProviderId, PROVIDER_B_ID);

  const overridden = await manager.getTicker(
    {
      ...baseRequest("override"),
      symbol: BTCUSDT,
    },
    {
      selectionPolicy: {
        preferredProviderIds: Object.freeze([PROVIDER_A_ID]),
      },
    },
  );

  assert.equal(overridden.execution.selectedProviderId, PROVIDER_A_ID);
}

async function testExplicitProviderSelection(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID, { tickerPrice: 100 });
  const b = createProvider(PROVIDER_B_ID, { tickerPrice: 200 });
  await initialize(a, b);

  const manager = new DefaultMarketDataManager(createRegistry(a, b));

  const result = await manager.getTicker(
    {
      ...baseRequest("explicit"),
      symbol: BTCUSDT,
    },
    {
      providerId: PROVIDER_B_ID,
    },
  );

  assert.equal(result.execution.selectedProviderId, PROVIDER_B_ID);
  assert.equal(Number(result.response.data.lastPrice), 200);

  await assertRejectsCode(
    async () =>
      manager.getTicker(
        {
          ...baseRequest("missing"),
          symbol: BTCUSDT,
        },
        {
          providerId: PROVIDER_C_ID,
        },
      ),
    "PROVIDER_NOT_FOUND",
  );
}

async function testCapabilityAndHealthFiltering(): Promise<void> {
  const tickerOnly = createProvider(PROVIDER_A_ID, {
    capabilities: Object.freeze(["TICKER", "HEALTH_CHECK"] as const),
  });

  const historical = createProvider(PROVIDER_B_ID, {
    capabilities: Object.freeze([
      "HISTORICAL_CANDLES",
      "HEALTH_CHECK",
    ] as const),
  });

  await initialize(tickerOnly, historical);

  const manager = new DefaultMarketDataManager(
    createRegistry(tickerOnly, historical),
  );

  const eligible = manager.getEligibleProviders({
    capability: "HISTORICAL_CANDLES",
    exchange: "MOCK",
    marketType: "SPOT",
    requireHistoricalData: true,
  });

  assert.deepEqual(
    eligible.map((provider) => provider.getId()),
    [PROVIDER_B_ID],
  );

  const unknownHealthIncluded = manager.getEligibleProviders(
    {
      capability: "TICKER",
      exchange: "MOCK",
      marketType: "SPOT",
    },
    {
      includeUnknownHealth: true,
    },
  );

  assert.equal(unknownHealthIncluded.length, 1);

  const unknownHealthExcluded = manager.getEligibleProviders(
    {
      capability: "TICKER",
      exchange: "MOCK",
      marketType: "SPOT",
    },
    {
      includeUnknownHealth: false,
    },
  );

  assert.equal(unknownHealthExcluded.length, 0);
}

function testDegradedPolicy(): void {
  const degraded = createProvider(PROVIDER_A_ID, {
    status: "DEGRADED",
  });

  const manager = new DefaultMarketDataManager(createRegistry(degraded));

  assert.equal(
    manager.getEligibleProviders(
      {
        capability: "TICKER",
        exchange: "MOCK",
        marketType: "SPOT",
      },
      {
        includeDegraded: true,
      },
    ).length,
    1,
  );

  assert.equal(
    manager.getEligibleProviders(
      {
        capability: "TICKER",
        exchange: "MOCK",
        marketType: "SPOT",
      },
      {
        includeDegraded: false,
      },
    ).length,
    0,
  );
}

async function testAutomaticFailover(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID);
  const b = createProvider(PROVIDER_B_ID);
  await initialize(a, b);

  patchTickerFailure(
    a,
    new MarketDataError("REQUEST_TIMEOUT", "Timed out.", {
      retryable: true,
    }),
  );
  patchTickerSuccess(b, 250);

  const manager = new DefaultMarketDataManager(createRegistry(a, b));

  const result = await manager.getTicker({
    ...baseRequest("failover"),
    symbol: BTCUSDT,
  });

  assert.equal(result.execution.selectedProviderId, PROVIDER_B_ID);
  assert.deepEqual(
    result.execution.attemptedProviderIds,
    [PROVIDER_A_ID, PROVIDER_B_ID],
  );
  assert.equal(result.execution.failoverOccurred, true);
  assert.equal(Number(result.response.data.lastPrice), 250);
}

async function testFailoverControls(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID);
  const b = createProvider(PROVIDER_B_ID);
  await initialize(a, b);

  patchTickerFailure(
    a,
    new MarketDataError("REQUEST_TIMEOUT", "Timed out.", {
      retryable: true,
    }),
  );
  patchTickerSuccess(b, 300);

  const manager = new DefaultMarketDataManager(createRegistry(a, b));

  await assertRejectsCode(
    async () =>
      manager.getTicker(
        {
          ...baseRequest("disabled"),
          symbol: BTCUSDT,
        },
        {
          selectionPolicy: {
            enableFailover: false,
          },
        },
      ),
    "REQUEST_TIMEOUT",
  );

  await assertRejectsCode(
    async () =>
      manager.getTicker(
        {
          ...baseRequest("explicit-disabled"),
          symbol: BTCUSDT,
        },
        {
          providerId: PROVIDER_A_ID,
        },
      ),
    "REQUEST_TIMEOUT",
  );

  const explicitFailover = await manager.getTicker(
    {
      ...baseRequest("explicit-enabled"),
      symbol: BTCUSDT,
    },
    {
      providerId: PROVIDER_A_ID,
      allowExplicitProviderFailover: true,
    },
  );

  assert.equal(
    explicitFailover.execution.selectedProviderId,
    PROVIDER_B_ID,
  );
}

async function testNonRetryableStopsFailover(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID);
  const b = createProvider(PROVIDER_B_ID);
  await initialize(a, b);

  patchTickerFailure(
    a,
    new MarketDataError("INVALID_REQUEST", "Invalid.", {
      retryable: false,
    }),
  );
  patchTickerSuccess(b, 300);

  const manager = new DefaultMarketDataManager(createRegistry(a, b));

  await assertRejectsCode(
    async () =>
      manager.getTicker({
        ...baseRequest("non-retryable"),
        symbol: BTCUSDT,
      }),
    "INVALID_REQUEST",
  );
}

async function testAttemptLimitAndValidation(): Promise<void> {
  const a = createProvider(PROVIDER_A_ID);
  const b = createProvider(PROVIDER_B_ID);
  await initialize(a, b);

  patchTickerFailure(
    a,
    new MarketDataError("REQUEST_TIMEOUT", "Timed out.", {
      retryable: true,
    }),
  );
  patchTickerSuccess(b, 500);

  const manager = new DefaultMarketDataManager(createRegistry(a, b));

  await assertRejectsCode(
    async () =>
      manager.getTicker(
        {
          ...baseRequest("attempt-limit"),
          symbol: BTCUSDT,
        },
        {
          selectionPolicy: {
            maximumProviderAttempts: 1,
          },
        },
      ),
    "REQUEST_TIMEOUT",
  );

  assert.throws(
    () =>
      new DefaultMarketDataManager(createRegistry(), {
        defaultSelectionPolicy: {
          maximumProviderAttempts: 0,
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof MarketDataError);
      assert.equal(error.code, "INVALID_LIMIT");
      return true;
    },
  );
}

async function testNoEligibleProviderAndAggregation(): Promise<void> {
  const tickerOnly = createProvider(PROVIDER_A_ID, {
    capabilities: Object.freeze(["TICKER"] as const),
  });
  await tickerOnly.initialize();

  const manager = new DefaultMarketDataManager(
    createRegistry(tickerOnly),
  );

  await assert.rejects(
    async () =>
      manager.getHistoricalCandles({
        ...baseRequest("no-provider"),
        symbol: BTCUSDT,
        timeframe: "1m",
      }),
    (error: unknown) => {
      assert.ok(error instanceof MarketDataManagerError);
      assert.equal(error.operation, "GET_HISTORICAL_CANDLES");
      assert.equal(error.code, "PROVIDER_UNAVAILABLE");
      return true;
    },
  );

  const a = createProvider(PROVIDER_A_ID);
  const b = createProvider(PROVIDER_B_ID);
  await initialize(a, b);

  patchTickerFailure(
    a,
    new MarketDataError("REQUEST_TIMEOUT", "A failed.", {
      retryable: true,
    }),
  );
  patchTickerFailure(
    b,
    new MarketDataError("CONNECTION_FAILED", "B failed.", {
      retryable: true,
    }),
  );

  const aggregatingManager = new DefaultMarketDataManager(
    createRegistry(a, b),
  );

  await assert.rejects(
    async () =>
      aggregatingManager.getTicker({
        ...baseRequest("aggregate"),
        symbol: BTCUSDT,
      }),
    (error: unknown) => {
      assert.ok(error instanceof MarketDataManagerError);
      assert.equal(error.failures.length, 2);
      assert.equal(Object.isFrozen(error.failures), true);
      return true;
    },
  );
}

async function testRoutingAndStreaming(): Promise<void> {
  const provider = createProvider(PROVIDER_A_ID);
  await provider.initialize();

  const manager = new DefaultMarketDataManager(
    createRegistry(provider),
  );

  assert.equal(
    (await manager.getTickers(baseRequest("tickers"))).response.data.length,
    1,
  );

  assert.equal(
    (
      await manager.getOrderBook({
        ...baseRequest("order-book"),
        symbol: BTCUSDT,
      })
    ).response.data.symbol,
    BTCUSDT,
  );

  assert.equal(
    (
      await manager.getRecentTrades({
        ...baseRequest("trades"),
        symbol: BTCUSDT,
      })
    ).response.data.length,
    1,
  );

  assert.equal(
    (
      await manager.getHistoricalCandles({
        ...baseRequest("candles"),
        symbol: BTCUSDT,
        timeframe: "1m",
      })
    ).response.data.length,
    1,
  );

  assert.equal(
    (await manager.discoverMarkets(baseRequest("markets"))).response.data.length,
    1,
  );

  assert.ok(
    (
      await manager.getServerTime({
        ...baseRequest("server-time"),
        symbol: BTCUSDT,
      })
    ).response.data >= BASE_TIME,
  );

  const managedSubscription = await manager.subscribeTicker({
    subscriptionId: marketDataSubscriptionId("ticker-subscription"),
    providerId: PROVIDER_A_ID,
    exchange: "MOCK",
    marketType: "SPOT",
    symbol: BTCUSDT,
  });

  const events = await collectEvents(managedSubscription.subscription);

  assert.equal(
    events.some((event) => event.type === "DATA"),
    true,
  );
  assert.equal(
    managedSubscription.execution.selectedProviderId,
    PROVIDER_A_ID,
  );
}

async function testImmutability(): Promise<void> {
  const provider = createProvider(PROVIDER_A_ID);
  await provider.initialize();

  const manager = new DefaultMarketDataManager(
    createRegistry(provider),
  );

  const eligible = manager.getEligibleProviders({
    capability: "TICKER",
    exchange: "MOCK",
    marketType: "SPOT",
  });

  assert.equal(Object.isFrozen(eligible), true);

  assert.throws(() => {
    (eligible as MarketDataProvider[]).push(provider);
  }, TypeError);

  const result = await manager.getTicker({
    ...baseRequest("immutability"),
    symbol: BTCUSDT,
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.execution), true);
  assert.equal(
    Object.isFrozen(result.execution.attemptedProviderIds),
    true,
  );
}

async function runMarketDataManagerTests(): Promise<void> {
  console.log("Running market-data manager tests...");

  await testDeterministicSelection();
  await testPreferenceAndOverride();
  await testExplicitProviderSelection();

  await testCapabilityAndHealthFiltering();
  testDegradedPolicy();

  await testAutomaticFailover();
  await testFailoverControls();
  await testNonRetryableStopsFailover();

  await testAttemptLimitAndValidation();
  await testNoEligibleProviderAndAggregation();

  await testRoutingAndStreaming();
  await testImmutability();

  console.log(
    "All market-data manager tests passed successfully.",
  );
}

void runMarketDataManagerTests();