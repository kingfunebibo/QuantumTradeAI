import assert from "node:assert/strict";

import { DeterministicMarketDataProvider } from "./deterministic-market-data-provider";
import {
  DefaultHistoricalMarketDataAdapter,
  convertMarketDataCandle,
} from "./market-data-historical.adapter";
import { DefaultMarketDataManager } from "./market-data-manager";
import { InMemoryMarketDataProviderRegistry } from "./market-data-provider.registry";
import {
  MarketDataCandle,
  MarketDataProviderDescriptor,
  marketDataCount,
  marketDataNativeSymbol,
  marketDataPrice,
  marketDataProviderId,
  marketDataRequestId,
  marketDataSymbol,
  marketDataTimestamp,
  marketDataVolume,
} from "./market-data-provider.types";

const BASE_TIME = 1_704_067_200_000;
const PROVIDER_ID = marketDataProviderId("historical-adapter-provider");
const BTCUSDT = marketDataSymbol("BTCUSDT");

function createDescriptor(): MarketDataProviderDescriptor {
  return Object.freeze({
    id: PROVIDER_ID,
    exchange: "MOCK",
    name: "Historical Adapter Provider",
    description: "Deterministic provider used by historical adapter tests.",
    version: "1.0.0",
    status: "STOPPED",
    capabilities: Object.freeze({
      providerId: PROVIDER_ID,
      exchange: "MOCK",
      capabilities: Object.freeze([
        "HISTORICAL_CANDLES",
        "MARKET_DISCOVERY",
        "HEALTH_CHECK",
      ] as const),
      marketTypes: Object.freeze(["SPOT"] as const),
      timeframes: Object.freeze(["1m", "5m", "1h"] as const),
      supportsPublicAccess: true,
      supportsAuthenticatedAccess: false,
      supportsStreaming: false,
      supportsHistoricalData: true,
      maximumHistoricalCandlesPerRequest: 1_000,
      maximumOrderBookDepth: 100,
    }),
    configuration: Object.freeze({
      providerId: PROVIDER_ID,
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

function createCandle(options: Readonly<{
  openTime: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  quoteVolume?: number;
  tradeCount?: number;
  takerBuyBaseVolume?: number;
  takerBuyQuoteVolume?: number;
  isClosed?: boolean;
}>): MarketDataCandle {
  const open = options.open ?? 100;
  const high = options.high ?? 110;
  const low = options.low ?? 90;
  const close = options.close ?? 105;

  return Object.freeze({
    symbol: BTCUSDT,
    timeframe: "1m",
    openTime: marketDataTimestamp(options.openTime),
    closeTime: marketDataTimestamp(options.openTime + 59_999),
    open: marketDataPrice(open),
    high: marketDataPrice(high),
    low: marketDataPrice(low),
    close: marketDataPrice(close),
    volume: marketDataVolume(options.volume ?? 10),
    ...(options.quoteVolume === undefined
      ? {}
      : { quoteVolume: marketDataVolume(options.quoteVolume) }),
    ...(options.tradeCount === undefined
      ? {}
      : { tradeCount: marketDataCount(options.tradeCount) }),
    ...(options.takerBuyBaseVolume === undefined
      ? {}
      : { takerBuyBaseVolume: marketDataVolume(options.takerBuyBaseVolume) }),
    ...(options.takerBuyQuoteVolume === undefined
      ? {}
      : { takerBuyQuoteVolume: marketDataVolume(options.takerBuyQuoteVolume) }),
    isClosed: options.isClosed ?? true,
  });
}

function createCandles(): readonly MarketDataCandle[] {
  return Object.freeze([
    createCandle({
      openTime: BASE_TIME,
      quoteVolume: 1_050,
      tradeCount: 100,
      takerBuyBaseVolume: 4,
      takerBuyQuoteVolume: 420,
    }),
    createCandle({
      openTime: BASE_TIME + 60_000,
      open: 105,
      high: 115,
      low: 95,
      close: 110,
      volume: 11,
    }),
    createCandle({
      openTime: BASE_TIME + 120_000,
      open: 110,
      high: 120,
      low: 100,
      close: 115,
      volume: 12,
    }),
  ]);
}

async function createInfrastructure(): Promise<Readonly<{
  adapter: DefaultHistoricalMarketDataAdapter;
  candles: readonly MarketDataCandle[];
}>> {
  const candles = createCandles();
  let now = BASE_TIME;

  const provider = new DeterministicMarketDataProvider({
    descriptor: createDescriptor(),
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
      candles: Object.freeze({
        [`${BTCUSDT}::1m`]: candles,
      }),
    }),
    now: () => now++,
  });

  await provider.initialize();

  const registry = new InMemoryMarketDataProviderRegistry();
  registry.register(provider);

  const manager = new DefaultMarketDataManager(registry);

  return Object.freeze({
    adapter: new DefaultHistoricalMarketDataAdapter(manager),
    candles,
  });
}

function createRequest(id: string) {
  return Object.freeze({
    requestId: marketDataRequestId(id),
    requestedAt: marketDataTimestamp(BASE_TIME),
    exchange: "MOCK" as const,
    marketType: "SPOT" as const,
    symbol: BTCUSDT,
    timeframe: "1m" as const,
  });
}

async function testManagerBasedLoad(): Promise<void> {
  const { adapter } = await createInfrastructure();
  const result = await adapter.load({ request: createRequest("adapter-load") });

  assert.equal(result.candles.length, 3);
  assert.deepEqual(
    result.candles.map((candle) => Number(candle.sequence)),
    [0, 1, 2],
  );
  assert.equal(result.source.execution.selectedProviderId, PROVIDER_ID);
  assert.equal(result.source.execution.failoverOccurred, false);
}

async function testCustomStartingSequence(): Promise<void> {
  const { adapter } = await createInfrastructure();
  const result = await adapter.load({
    request: createRequest("custom-sequence"),
    startingSequence: 100,
  });

  assert.deepEqual(
    result.candles.map((candle) => Number(candle.sequence)),
    [100, 101, 102],
  );
}

async function testOptionalFieldConversion(): Promise<void> {
  const { adapter } = await createInfrastructure();
  const result = await adapter.load({ request: createRequest("optional-fields") });
  const first = result.candles[0];
  const second = result.candles[1];

  assert.ok(first);
  assert.ok(second);
  assert.equal(Number(first.quoteVolume), 1_050);
  assert.equal(Number(first.tradeCount), 100);
  assert.equal(Number(first.takerBuyBaseVolume), 4);
  assert.equal(Number(first.takerBuyQuoteVolume), 420);
  assert.equal(second.quoteVolume, undefined);
  assert.equal(second.tradeCount, undefined);
}

async function testConversionValues(): Promise<void> {
  const { adapter, candles } = await createInfrastructure();
  const converted = adapter.convert(candles, 7);
  const source = candles[0];
  const target = converted[0];

  assert.ok(source);
  assert.ok(target);
  assert.equal(Number(target.sequence), 7);
  assert.equal(Number(target.openTime), Number(source.openTime));
  assert.equal(Number(target.closeTime), Number(source.closeTime));
  assert.equal(Number(target.open), Number(source.open));
  assert.equal(Number(target.high), Number(source.high));
  assert.equal(Number(target.low), Number(source.low));
  assert.equal(Number(target.close), Number(source.close));
  assert.equal(Number(target.volume), Number(source.volume));
  assert.equal(target.isClosed, source.isClosed);
}

function testSingleCandleConversion(): void {
  const converted = convertMarketDataCandle({
    candle: createCandle({ openTime: BASE_TIME }),
    sequence: 25,
  });

  assert.equal(Number(converted.sequence), 25);
  assert.equal(Number(converted.openTime), BASE_TIME);
  assert.equal(Object.isFrozen(converted), true);
}

async function testResultImmutability(): Promise<void> {
  const { adapter } = await createInfrastructure();
  const result = await adapter.load({ request: createRequest("immutability") });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candles), true);
  assert.equal(Object.isFrozen(result.candles[0]), true);

  assert.throws(() => {
    (result.candles as unknown as typeof result.candles[number][]).push(
      result.candles[0]!,
    );
  }, TypeError);
}

async function testOrderingValidation(): Promise<void> {
  const { adapter } = await createInfrastructure();

  const unordered = Object.freeze([
    createCandle({ openTime: BASE_TIME + 60_000 }),
    createCandle({ openTime: BASE_TIME }),
  ]);

  assert.throws(() => adapter.convert(unordered), /strictly increasing open time/);

  const duplicate = Object.freeze([
    createCandle({ openTime: BASE_TIME }),
    createCandle({ openTime: BASE_TIME }),
  ]);

  assert.throws(() => adapter.convert(duplicate), /strictly increasing open time/);
}

async function testInvalidStartingSequence(): Promise<void> {
  const { adapter, candles } = await createInfrastructure();

  for (const value of [-1, 1.5, Number.NaN]) {
    assert.throws(
      () => adapter.convert(candles, value),
      /starting sequence/,
    );
  }

  await assert.rejects(
    async () =>
      adapter.load({
        request: createRequest("invalid-sequence"),
        startingSequence: -1,
      }),
    /starting sequence/,
  );
}

async function testInvalidCandleRange(): Promise<void> {
  const { adapter } = await createInfrastructure();

  const invalid = Object.freeze({
    ...createCandle({ openTime: BASE_TIME }),
    high: marketDataPrice(95),
    low: marketDataPrice(90),
    open: marketDataPrice(100),
    close: marketDataPrice(94),
  }) satisfies MarketDataCandle;

  assert.throws(
    () => adapter.convert([invalid]),
    /invalid OHLC range/,
  );
}

async function testManagerMetadataPreserved(): Promise<void> {
  const { adapter } = await createInfrastructure();
  const result = await adapter.load({ request: createRequest("metadata") });

  assert.equal(result.source.execution.operation, "GET_HISTORICAL_CANDLES");
  assert.deepEqual(result.source.execution.attemptedProviderIds, [PROVIDER_ID]);
  assert.equal(result.source.response.metadata.providerId, PROVIDER_ID);
  assert.equal(Object.isFrozen(result.source.execution), true);
}

async function testEmptyConversion(): Promise<void> {
  const { adapter } = await createInfrastructure();
  const converted = adapter.convert(Object.freeze([]));

  assert.deepEqual(converted, []);
  assert.equal(Object.isFrozen(converted), true);
}

async function runHistoricalMarketDataAdapterTests(): Promise<void> {
  console.log("Running historical market-data adapter tests...");

  await testManagerBasedLoad();
  await testCustomStartingSequence();
  await testOptionalFieldConversion();
  await testConversionValues();
  testSingleCandleConversion();
  await testResultImmutability();
  await testOrderingValidation();
  await testInvalidStartingSequence();
  await testInvalidCandleRange();
  await testManagerMetadataPreserved();
  await testEmptyConversion();

  console.log(
    "All historical market-data adapter tests passed successfully.",
  );
}

void runHistoricalMarketDataAdapterTests();