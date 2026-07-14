import assert from "node:assert/strict";

import {
  DeterministicMarketDataProvider,
  DeterministicMarketDataProviderDataset,
} from "./deterministic-market-data-provider";

import {
  MarketDataCandle,
  MarketDataError,
  MarketDataMarket,
  MarketDataOrderBook,
  MarketDataProviderCapability,
  MarketDataProviderDescriptor,
  MarketDataStreamEvent,
  MarketDataTicker,
  MarketDataTrade,
  marketDataCount,
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
  MarketDataStreamSubscription,
} from "./market-data-provider";

const PROVIDER_ID =
  marketDataProviderId(
    "deterministic-market-data",
  );

const BTCUSDT =
  marketDataSymbol("BTCUSDT");

const ETHUSDT =
  marketDataSymbol("ETHUSDT");

const UNKNOWN_SYMBOL =
  marketDataSymbol("DOGEUSDT");

const BASE_TIME =
  1_704_067_200_000;

function createClock(
  start = BASE_TIME,
): Readonly<{
  now: () => number;
}> {
  let value = start;

  return Object.freeze({
    now: () => {
      const current = value;
      value += 1;
      return current;
    },
  });
}

function createDescriptor(
  options: Readonly<{
    enabled?: boolean;
    status?:
      | "INITIALIZING"
      | "READY"
      | "DEGRADED"
      | "UNAVAILABLE"
      | "STOPPED";
    capabilities?:
      readonly MarketDataProviderCapability[];
    maximumHistoricalCandlesPerRequest?: number;
  }> = {},
): MarketDataProviderDescriptor {
  const capabilities =
    options.capabilities ??
    [
      "TICKER",
      "TICKERS",
      "ORDER_BOOK",
      "RECENT_TRADES",
      "HISTORICAL_CANDLES",
      "LIVE_CANDLES",
      "LIVE_TICKER",
      "LIVE_ORDER_BOOK",
      "LIVE_TRADES",
      "SYMBOL_DISCOVERY",
      "TIMEFRAME_DISCOVERY",
      "MARKET_DISCOVERY",
      "SERVER_TIME",
      "HEALTH_CHECK",
    ];

  return Object.freeze({
    id: PROVIDER_ID,
    exchange: "MOCK",
    name:
      "Deterministic Market Data",
    description:
      "Deterministic provider for testing.",
    version: "1.0.0",
    status:
      options.status ?? "STOPPED",

    capabilities:
      Object.freeze({
        providerId: PROVIDER_ID,
        exchange: "MOCK",

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

        supportsPublicAccess: true,
        supportsAuthenticatedAccess: false,
        supportsStreaming:
          capabilities.some(
            (capability) =>
              capability.startsWith(
                "LIVE_",
              ),
          ),
        supportsHistoricalData:
          capabilities.includes(
            "HISTORICAL_CANDLES",
          ),

        maximumHistoricalCandlesPerRequest:
          options.maximumHistoricalCandlesPerRequest ??
          1_000,

        maximumOrderBookDepth: 100,
      }),

    configuration:
      Object.freeze({
        providerId: PROVIDER_ID,
        exchange: "MOCK",
        enabled:
          options.enabled ?? true,

        baseUrl:
          "https://mock.quantumtrade.ai",

        streamUrl:
          "wss://mock.quantumtrade.ai",

        requestTimeoutMilliseconds:
          5_000,

        maximumRetries: 3,
        retryBaseDelayMilliseconds:
          100,
        retryMaximumDelayMilliseconds:
          2_000,

        requestsPerSecond: 10,
        requestsPerMinute: 600,

        cacheEnabled: true,
        cacheTtlMilliseconds:
          30_000,

        attributes:
          Object.freeze({
            environment: "test",
          }),
      }),
  });
}

function createCandle(
  options: Readonly<{
    symbol?: typeof BTCUSDT;
    openTime: number;
    timeframe?: "1m" | "5m" | "1h";
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  }>,
): MarketDataCandle {
  const open =
    options.open ?? 100;

  const high =
    options.high ?? open + 10;

  const low =
    options.low ?? open - 10;

  const close =
    options.close ?? open + 5;

  const timeframe =
    options.timeframe ?? "1m";

  const duration =
    timeframe === "1m"
      ? 60_000
      : timeframe === "5m"
        ? 300_000
        : 3_600_000;

  return Object.freeze({
    symbol:
      options.symbol ?? BTCUSDT,

    timeframe,

    openTime:
      marketDataTimestamp(
        options.openTime,
      ),

    closeTime:
      marketDataTimestamp(
        options.openTime +
          duration -
          1,
      ),

    open:
      marketDataPrice(open),

    high:
      marketDataPrice(high),

    low:
      marketDataPrice(low),

    close:
      marketDataPrice(close),

    volume:
      marketDataVolume(
        options.volume ?? 10,
      ),

    quoteVolume:
      marketDataVolume(
        (options.volume ?? 10) *
          close,
      ),

    tradeCount:
      marketDataCount(100),

    takerBuyBaseVolume:
      marketDataVolume(4),

    takerBuyQuoteVolume:
      marketDataVolume(
        4 * close,
      ),

    isClosed: true,
  });
}

function createCandles(
  count: number,
  options: Readonly<{
    symbol?: typeof BTCUSDT;
    startTime?: number;
    timeframe?: "1m" | "5m" | "1h";
  }> = {},
): readonly MarketDataCandle[] {
  const timeframe =
    options.timeframe ?? "1m";

  const duration =
    timeframe === "1m"
      ? 60_000
      : timeframe === "5m"
        ? 300_000
        : 3_600_000;

  const startTime =
    options.startTime ??
    BASE_TIME;

  return Object.freeze(
    Array.from(
      { length: count },
      (_, index) =>
        createCandle({
          symbol:
            options.symbol,
          timeframe,
          openTime:
            startTime +
            index * duration,
          open:
            100 + index,
          high:
            110 + index,
          low:
            90 + index,
          close:
            105 + index,
          volume:
            10 + index,
        }),
    ),
  );
}

function createTicker(
  symbol:
    | typeof BTCUSDT
    | typeof ETHUSDT,
  timestamp = BASE_TIME,
  lastPrice = 100,
): MarketDataTicker {
  return Object.freeze({
    symbol,
    lastPrice:
      marketDataPrice(lastPrice),
    bidPrice:
      marketDataPrice(
        lastPrice - 0.1,
      ),
    askPrice:
      marketDataPrice(
        lastPrice + 0.1,
      ),
    timestamp:
      marketDataTimestamp(
        timestamp,
      ),
  });
}

function createOrderBook(
  symbol:
    | typeof BTCUSDT
    | typeof ETHUSDT,
  timestamp = BASE_TIME,
): MarketDataOrderBook {
  return Object.freeze({
    symbol,
    bids:
      Object.freeze([
        Object.freeze({
          price:
            marketDataPrice(99),
          quantity:
            marketDataVolume(2),
        }),
        Object.freeze({
          price:
            marketDataPrice(98),
          quantity:
            marketDataVolume(3),
        }),
      ]),
    asks:
      Object.freeze([
        Object.freeze({
          price:
            marketDataPrice(101),
          quantity:
            marketDataVolume(1),
        }),
        Object.freeze({
          price:
            marketDataPrice(102),
          quantity:
            marketDataVolume(4),
        }),
      ]),
    sequence: 42,
    timestamp:
      marketDataTimestamp(
        timestamp,
      ),
  });
}

function createTrades(
  symbol:
    | typeof BTCUSDT
    | typeof ETHUSDT,
  count = 4,
  startTime = BASE_TIME,
): readonly MarketDataTrade[] {
  return Object.freeze(
    Array.from(
      { length: count },
      (_, index) =>
        Object.freeze({
          id:
            `${String(symbol)}-${index}`,
          symbol,
          side:
            index % 2 === 0
              ? "BUY"
              : "SELL",
          price:
            marketDataPrice(
              100 + index,
            ),
          quantity:
            marketDataVolume(
              1 + index,
            ),
          timestamp:
            marketDataTimestamp(
              startTime + index,
            ),
          isBuyerMaker:
            index % 2 !== 0,
        }),
    ),
  );
}

function createMarket(
  symbol:
    | typeof BTCUSDT
    | typeof ETHUSDT,
  status:
    | "ACTIVE"
    | "SUSPENDED"
    | "DELISTED"
    | "UNKNOWN" =
      "ACTIVE",
): MarketDataMarket {
  const baseAsset =
    symbol === BTCUSDT
      ? "BTC"
      : "ETH";

  return Object.freeze({
    exchange: "MOCK",
    marketType: "SPOT",
    symbol,
    nativeSymbol:
      marketDataNativeSymbol(
        `${baseAsset}-USDT`,
      ),
    baseAsset,
    quoteAsset: "USDT",
    status,
    supportedTimeframes:
      Object.freeze([
        "1m",
        "5m",
        "1h",
      ] as const),
  });
}

function createDataset():
  DeterministicMarketDataProviderDataset {
  const btcCandles =
    createCandles(5);

  const btcTrades =
    createTrades(
      BTCUSDT,
      4,
    );

  return Object.freeze({
    markets:
      Object.freeze([
        createMarket(BTCUSDT),
        createMarket(
          ETHUSDT,
          "SUSPENDED",
        ),
      ]),

    tickers:
      Object.freeze([
        createTicker(
          BTCUSDT,
          BASE_TIME,
          100,
        ),
        createTicker(
          ETHUSDT,
          BASE_TIME,
          200,
        ),
      ]),

    candles:
      Object.freeze({
        [`${BTCUSDT}::1m`]:
          btcCandles,
      }),

    orderBooks:
      Object.freeze({
        BTCUSDT:
          createOrderBook(
            BTCUSDT,
          ),
      }),

    recentTrades:
      Object.freeze({
        BTCUSDT:
          btcTrades,
      }),

    candleStreams:
      Object.freeze({
        [`${BTCUSDT}::1m`]:
          btcCandles.slice(0, 3),
      }),

    tickerStreams:
      Object.freeze({
        BTCUSDT:
          Object.freeze([
            createTicker(
              BTCUSDT,
              BASE_TIME,
              100,
            ),
            createTicker(
              BTCUSDT,
              BASE_TIME + 1,
              101,
            ),
          ]),
      }),

    orderBookStreams:
      Object.freeze({
        BTCUSDT:
          Object.freeze([
            createOrderBook(
              BTCUSDT,
              BASE_TIME,
            ),
            createOrderBook(
              BTCUSDT,
              BASE_TIME + 1,
            ),
          ]),
      }),

    tradeStreams:
      Object.freeze({
        BTCUSDT:
          btcTrades,
      }),
  });
}

function createProvider(
  options: Readonly<{
    descriptor?: MarketDataProviderDescriptor;
    dataset?: DeterministicMarketDataProviderDataset;
    clock?: ReturnType<
      typeof createClock
    >;
  }> = {},
): Readonly<{
  provider:
    DeterministicMarketDataProvider;
}> {
  const clock =
    options.clock ??
    createClock();

  const provider =
    new DeterministicMarketDataProvider({
      descriptor:
        options.descriptor ??
        createDescriptor(),
      dataset:
        options.dataset ??
        createDataset(),
      now: clock.now,
    });

  return Object.freeze({
    provider,
  });
}

async function assertRejectsMarketDataError(
  operation:
    () => Promise<unknown>,
  expectedCode:
    MarketDataError["code"],
): Promise<void> {
  await assert.rejects(
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

async function collectEvents<TData>(
  subscription:
    MarketDataStreamSubscription<TData>,
): Promise<
  readonly MarketDataStreamEvent<TData>[]
> {
  const events:
    MarketDataStreamEvent<TData>[] =
      [];

  for await (
    const event of
      subscription.events
  ) {
    events.push(event);
  }

  return Object.freeze(events);
}

function createBaseRequest(
  id: string,
) {
  return Object.freeze({
    requestId:
      marketDataRequestId(id),
    requestedAt:
      marketDataTimestamp(
        BASE_TIME,
      ),
    exchange:
      "MOCK" as const,
    marketType:
      "SPOT" as const,
  });
}

async function testLifecycle(): Promise<void> {
  const {
    provider,
  } = createProvider();

  assert.equal(
    provider.getStatus(),
    "STOPPED",
  );

  await provider.initialize();

  assert.equal(
    provider.getStatus(),
    "READY",
  );

  await provider.initialize();
  await provider.stop();
  await provider.stop();

  assert.equal(
    provider.getStatus(),
    "STOPPED",
  );
}

async function testDisabledProvider(): Promise<void> {
  const {
    provider,
  } = createProvider({
    descriptor:
      createDescriptor({
        enabled: false,
      }),
  });

  await assertRejectsMarketDataError(
    async () => {
      await provider.initialize();
    },
    "PROVIDER_UNAVAILABLE",
  );
}

async function testProviderNotReady(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await assertRejectsMarketDataError(
    async () => {
      await provider.getTicker({
        ...createBaseRequest(
          "not-ready",
        ),
        symbol: BTCUSDT,
      });
    },
    "PROVIDER_NOT_READY",
  );
}

async function testDescriptorImmutability(): Promise<void> {
  const {
    provider,
  } = createProvider();

  const descriptor =
    provider.getDescriptor();

  const capabilities =
    provider.getCapabilities();

  assert.equal(
    Object.isFrozen(
      descriptor,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      descriptor.capabilities,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      capabilities.capabilities,
    ),
    true,
  );

  assert.throws(() => {
    (
      capabilities.capabilities as unknown as string[]
    ).push("TICKER");
  }, TypeError);
}

async function testTickerOperations(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const ticker =
    await provider.getTicker({
      ...createBaseRequest(
        "ticker",
      ),
      symbol: BTCUSDT,
    });

  assert.equal(
    Number(
      ticker.data.lastPrice,
    ),
    100,
  );

  assert.equal(
    ticker.metadata.providerId,
    PROVIDER_ID,
  );

  assert.equal(
    Object.isFrozen(
      ticker.data,
    ),
    true,
  );

  const tickers =
    await provider.getTickers({
      ...createBaseRequest(
        "tickers",
      ),
    });

  assert.deepEqual(
    tickers.data.map(
      (value) =>
        String(value.symbol),
    ),
    [
      "BTCUSDT",
      "ETHUSDT",
    ],
  );

  await assertRejectsMarketDataError(
    async () => {
      await provider.getTicker({
        ...createBaseRequest(
          "ticker-missing",
        ),
        symbol:
          UNKNOWN_SYMBOL,
      });
    },
    "UNSUPPORTED_SYMBOL",
  );
}

async function testExchangeValidation(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  await assertRejectsMarketDataError(
    async () => {
      await provider.getTicker({
        requestId:
          marketDataRequestId(
            "wrong-exchange",
          ),
        requestedAt:
          marketDataTimestamp(
            BASE_TIME,
          ),
        exchange: "OKX",
        marketType: "SPOT",
        symbol: BTCUSDT,
      });
    },
    "INVALID_EXCHANGE",
  );
}

async function testOrderBook(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const response =
    await provider.getOrderBook({
      ...createBaseRequest(
        "order-book",
      ),
      symbol: BTCUSDT,
      depth: 1,
    });

  assert.equal(
    response.data.bids.length,
    1,
  );

  assert.equal(
    response.data.asks.length,
    1,
  );

  await assertRejectsMarketDataError(
    async () => {
      await provider.getOrderBook({
        ...createBaseRequest(
          "order-book-invalid",
        ),
        symbol: BTCUSDT,
        depth: 0,
      });
    },
    "INVALID_LIMIT",
  );
}

async function testRecentTrades(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const response =
    await provider.getRecentTrades({
      ...createBaseRequest(
        "trades",
      ),
      symbol: BTCUSDT,
      limit: 2,
    });

  assert.deepEqual(
    response.data.map(
      (trade) => trade.id,
    ),
    [
      "BTCUSDT-2",
      "BTCUSDT-3",
    ],
  );

  await assertRejectsMarketDataError(
    async () => {
      await provider.getRecentTrades({
        ...createBaseRequest(
          "trades-invalid",
        ),
        symbol: BTCUSDT,
        limit: 0,
      });
    },
    "INVALID_LIMIT",
  );
}

async function testHistoricalCandles(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const response =
    await provider.getHistoricalCandles({
      ...createBaseRequest(
        "candles",
      ),
      symbol: BTCUSDT,
      timeframe: "1m",
      startTime:
        marketDataTimestamp(
          BASE_TIME + 60_000,
        ),
      endTime:
        marketDataTimestamp(
          BASE_TIME + 180_000,
        ),
      limit: 2,
    });

  assert.deepEqual(
    response.data.map(
      (candle) =>
        Number(
          candle.openTime,
        ),
    ),
    [
      BASE_TIME + 60_000,
      BASE_TIME + 120_000,
    ],
  );

  assert.equal(
    Object.isFrozen(
      response.data,
    ),
    true,
  );

  await assertRejectsMarketDataError(
    async () => {
      await provider.getHistoricalCandles({
        ...createBaseRequest(
          "candles-range",
        ),
        symbol: BTCUSDT,
        timeframe: "1m",
        startTime:
          marketDataTimestamp(
            BASE_TIME + 1,
          ),
        endTime:
          marketDataTimestamp(
            BASE_TIME,
          ),
      });
    },
    "INVALID_RANGE",
  );

  await assertRejectsMarketDataError(
    async () => {
      await provider.getHistoricalCandles({
        ...createBaseRequest(
          "candles-timeframe",
        ),
        symbol: BTCUSDT,
        timeframe: "1d",
      });
    },
    "UNSUPPORTED_TIMEFRAME",
  );
}

async function testMarketDiscovery(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const all =
    await provider.discoverMarkets({
      ...createBaseRequest(
        "markets",
      ),
    });

  assert.equal(
    all.data.length,
    2,
  );

  const active =
    await provider.discoverMarkets({
      ...createBaseRequest(
        "markets-active",
      ),
      activeOnly: true,
    });

  assert.deepEqual(
    active.data.map(
      (market) =>
        String(market.symbol),
    ),
    [
      "BTCUSDT",
    ],
  );
}

async function testServerTime(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const response =
    await provider.getServerTime({
      ...createBaseRequest(
        "server-time",
      ),
      symbol: BTCUSDT,
    });

  assert.ok(
    response.data >=
      BASE_TIME,
  );
}

async function testCapabilityEnforcement(): Promise<void> {
  const {
    provider,
  } = createProvider({
    descriptor:
      createDescriptor({
        capabilities:
          Object.freeze([
            "TICKER",
            "HEALTH_CHECK",
          ]),
      }),
  });

  await provider.initialize();

  await provider.getTicker({
    ...createBaseRequest(
      "ticker-supported",
    ),
    symbol: BTCUSDT,
  });

  await assertRejectsMarketDataError(
    async () => {
      await provider.getOrderBook({
        ...createBaseRequest(
          "order-book-unsupported",
        ),
        symbol: BTCUSDT,
      });
    },
    "UNSUPPORTED_CAPABILITY",
  );
}

async function testHealthMetrics(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  await provider.getTicker({
    ...createBaseRequest(
      "health-success",
    ),
    symbol: BTCUSDT,
  });

  await assertRejectsMarketDataError(
    async () => {
      await provider.getTicker({
        ...createBaseRequest(
          "health-failure",
        ),
        symbol:
          UNKNOWN_SYMBOL,
      });
    },
    "UNSUPPORTED_SYMBOL",
  );

  const health =
    await provider.checkHealth();

  assert.equal(
    health.status,
    "DEGRADED",
  );

  assert.equal(
    health.metrics.requestsTotal,
    2,
  );

  assert.equal(
    health.metrics.requestsSuccessful,
    1,
  );

  assert.equal(
    health.metrics.requestsFailed,
    1,
  );

  assert.equal(
    health.metrics.consecutiveFailures,
    1,
  );

  assert.equal(
    Object.isFrozen(
      health.metrics,
    ),
    true,
  );

  const last =
    provider.getLastHealth();

  assert.deepEqual(
    last,
    health,
  );

  assert.notEqual(
    last,
    health,
  );
}

async function testStreams(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const candleSubscription =
    await provider.subscribeCandles({
      subscriptionId:
        marketDataSubscriptionId(
          "candles-stream",
        ),
      providerId:
        PROVIDER_ID,
      exchange: "MOCK",
      marketType: "SPOT",
      symbol: BTCUSDT,
      timeframe: "1m",
    });

  const candleEvents =
    await collectEvents(
      candleSubscription,
    );

  assert.deepEqual(
    candleEvents.map(
      (event) => event.type,
    ),
    [
      "CONNECTED",
      "SUBSCRIBED",
      "DATA",
      "DATA",
      "DATA",
      "HEARTBEAT",
    ],
  );

  assert.equal(
    candleSubscription.isActive(),
    false,
  );

  const tickerEvents =
    await collectEvents(
      await provider.subscribeTicker({
        subscriptionId:
          marketDataSubscriptionId(
            "ticker-stream",
          ),
        providerId:
          PROVIDER_ID,
        exchange: "MOCK",
        marketType: "SPOT",
        symbol: BTCUSDT,
      }),
    );

  assert.equal(
    tickerEvents.filter(
      (event) =>
        event.type === "DATA",
    ).length,
    2,
  );

  const orderBookEvents =
    await collectEvents(
      await provider.subscribeOrderBook({
        subscriptionId:
          marketDataSubscriptionId(
            "order-book-stream",
          ),
        providerId:
          PROVIDER_ID,
        exchange: "MOCK",
        marketType: "SPOT",
        symbol: BTCUSDT,
      }),
    );

  assert.equal(
    orderBookEvents.filter(
      (event) =>
        event.type === "DATA",
    ).length,
    2,
  );

  const tradeEvents =
    await collectEvents(
      await provider.subscribeTrades({
        subscriptionId:
          marketDataSubscriptionId(
            "trades-stream",
          ),
        providerId:
          PROVIDER_ID,
        exchange: "MOCK",
        marketType: "SPOT",
        symbol: BTCUSDT,
      }),
    );

  assert.equal(
    tradeEvents.filter(
      (event) =>
        event.type === "DATA",
    ).length,
    4,
  );
}

async function testSubscriptionMetrics(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const subscription =
    await provider.subscribeTicker({
      subscriptionId:
        marketDataSubscriptionId(
          "metrics-stream",
        ),
      providerId:
        PROVIDER_ID,
      exchange: "MOCK",
      marketType: "SPOT",
      symbol: BTCUSDT,
    });

  const active =
    await provider.checkHealth();

  assert.equal(
    active.metrics.activeSubscriptions,
    1,
  );

  await collectEvents(
    subscription,
  );

  const closed =
    await provider.checkHealth();

  assert.equal(
    closed.metrics.activeSubscriptions,
    0,
  );
}

async function testEarlyUnsubscribe(): Promise<void> {
  const {
    provider,
  } = createProvider();

  await provider.initialize();

  const subscription =
    await provider.subscribeCandles({
      subscriptionId:
        marketDataSubscriptionId(
          "early-unsubscribe",
        ),
      providerId:
        PROVIDER_ID,
      exchange: "MOCK",
      marketType: "SPOT",
      symbol: BTCUSDT,
      timeframe: "1m",
    });

  const iterator =
    subscription.events[
      Symbol.asyncIterator
    ]();

  const first =
    await iterator.next();

  assert.equal(
    first.value?.type,
    "CONNECTED",
  );

  await subscription.unsubscribe();

  const next =
    await iterator.next();

  assert.equal(
    next.done,
    true,
  );

  assert.equal(
    subscription.isActive(),
    false,
  );
}

async function runDeterministicMarketDataProviderTests(): Promise<void> {
  console.log(
    "Running deterministic market-data provider tests...",
  );

  await testLifecycle();
  await testDisabledProvider();
  await testProviderNotReady();
  await testDescriptorImmutability();

  await testTickerOperations();
  await testExchangeValidation();
  await testOrderBook();
  await testRecentTrades();
  await testHistoricalCandles();
  await testMarketDiscovery();
  await testServerTime();

  await testCapabilityEnforcement();
  await testHealthMetrics();

  await testStreams();
  await testSubscriptionMetrics();
  await testEarlyUnsubscribe();

  console.log(
    "All deterministic market-data provider tests passed successfully.",
  );
}

void runDeterministicMarketDataProviderTests();