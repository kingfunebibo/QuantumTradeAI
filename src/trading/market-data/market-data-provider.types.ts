/**
 * QuantumTradeAI Market Data Provider Framework
 *
 * Core strongly typed contracts shared by all market-data providers,
 * registries, adapters, caches, retry policies, health monitors, and
 * exchange-specific implementations.
 */

/**
 * Nominal typing utility.
 */
type Brand<TValue, TBrand extends string> =
  TValue & {
    readonly __brand: TBrand;
  };

/**
 * Provider identity.
 */
export type MarketDataProviderId = Brand<
  string,
  "MarketDataProviderId"
>;

/**
 * Canonical market symbol.
 *
 * Examples:
 *
 * - BTCUSDT
 * - ETHUSDT
 * - SOLUSDT
 */
export type MarketDataSymbol = Brand<
  string,
  "MarketDataSymbol"
>;

/**
 * Provider-native symbol.
 *
 * Examples:
 *
 * - BTCUSDT
 * - BTC-USDT
 * - BTC/USDT
 */
export type MarketDataNativeSymbol = Brand<
  string,
  "MarketDataNativeSymbol"
>;

/**
 * Millisecond Unix timestamp.
 */
export type MarketDataTimestamp = Brand<
  number,
  "MarketDataTimestamp"
>;

/**
 * Non-negative market-data count.
 */
export type MarketDataCount = Brand<
  number,
  "MarketDataCount"
>;

/**
 * Positive market price.
 */
export type MarketDataPrice = Brand<
  number,
  "MarketDataPrice"
>;

/**
 * Non-negative market volume.
 */
export type MarketDataVolume = Brand<
  number,
  "MarketDataVolume"
>;

/**
 * Provider request identifier.
 */
export type MarketDataRequestId = Brand<
  string,
  "MarketDataRequestId"
>;

/**
 * Stream subscription identifier.
 */
export type MarketDataSubscriptionId = Brand<
  string,
  "MarketDataSubscriptionId"
>;

/**
 * Market-data exchanges supported by the canonical provider framework.
 *
 * Additional exchanges can be introduced without changing provider
 * consumers by extending this union.
 */
export const MARKET_DATA_EXCHANGES = [
  "BINANCE",
  "BYBIT",
  "OKX",
  "KUCOIN",
  "MEXC",
  "BITGET",
  "GATEIO",
  "COINBASE",
  "KRAKEN",
  "MOCK",
] as const;

export type MarketDataExchange =
  (typeof MARKET_DATA_EXCHANGES)[number];

/**
 * Canonical market types.
 */
export const MARKET_DATA_MARKET_TYPES = [
  "SPOT",
  "MARGIN",
  "PERPETUAL",
  "FUTURES",
  "OPTIONS",
] as const;

export type MarketDataMarketType =
  (typeof MARKET_DATA_MARKET_TYPES)[number];

/**
 * Canonical market-data timeframes.
 */
export const MARKET_DATA_TIMEFRAMES = [
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;

export type MarketDataTimeframe =
  (typeof MARKET_DATA_TIMEFRAMES)[number];

/**
 * Provider lifecycle status.
 */
export const MARKET_DATA_PROVIDER_STATUSES = [
  "INITIALIZING",
  "READY",
  "DEGRADED",
  "UNAVAILABLE",
  "STOPPED",
] as const;

export type MarketDataProviderStatus =
  (typeof MARKET_DATA_PROVIDER_STATUSES)[number];

/**
 * Provider health levels.
 */
export const MARKET_DATA_HEALTH_STATUSES = [
  "HEALTHY",
  "DEGRADED",
  "UNHEALTHY",
  "UNKNOWN",
] as const;

export type MarketDataHealthStatus =
  (typeof MARKET_DATA_HEALTH_STATUSES)[number];

/**
 * Supported market-data operations.
 */
export const MARKET_DATA_PROVIDER_CAPABILITIES = [
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
] as const;

export type MarketDataProviderCapability =
  (typeof MARKET_DATA_PROVIDER_CAPABILITIES)[number];

/**
 * Stream event types.
 */
export const MARKET_DATA_STREAM_EVENT_TYPES = [
  "CONNECTED",
  "DISCONNECTED",
  "RECONNECTING",
  "SUBSCRIBED",
  "UNSUBSCRIBED",
  "DATA",
  "ERROR",
  "HEARTBEAT",
] as const;

export type MarketDataStreamEventType =
  (typeof MARKET_DATA_STREAM_EVENT_TYPES)[number];

/**
 * Market-data error codes.
 */
export const MARKET_DATA_ERROR_CODES = [
  "INVALID_PROVIDER_ID",
  "INVALID_SYMBOL",
  "INVALID_NATIVE_SYMBOL",
  "INVALID_TIMESTAMP",
  "INVALID_COUNT",
  "INVALID_PRICE",
  "INVALID_VOLUME",
  "INVALID_REQUEST",
  "INVALID_RANGE",
  "INVALID_LIMIT",
  "INVALID_TIMEFRAME",
  "INVALID_MARKET_TYPE",
  "INVALID_EXCHANGE",
  "UNSUPPORTED_CAPABILITY",
  "UNSUPPORTED_SYMBOL",
  "UNSUPPORTED_TIMEFRAME",
  "PROVIDER_NOT_FOUND",
  "PROVIDER_ALREADY_REGISTERED",
  "PROVIDER_NOT_READY",
  "PROVIDER_UNAVAILABLE",
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "RATE_LIMITED",
  "REQUEST_TIMEOUT",
  "CONNECTION_FAILED",
  "STREAM_FAILED",
  "SUBSCRIPTION_FAILED",
  "UPSTREAM_ERROR",
  "INVALID_RESPONSE",
  "RETRY_EXHAUSTED",
  "CACHE_FAILURE",
  "NORMALIZATION_FAILED",
  "HEALTH_CHECK_FAILED",
  "INTERNAL_ERROR",
] as const;

export type MarketDataErrorCode =
  (typeof MARKET_DATA_ERROR_CODES)[number];

/**
 * Typed market-data framework error.
 */
export class MarketDataError extends Error {
  public readonly code: MarketDataErrorCode;
  public readonly providerId?: MarketDataProviderId;
  public readonly exchange?: MarketDataExchange;
  public readonly requestId?: MarketDataRequestId;
  public readonly retryable: boolean;
  public readonly cause?: unknown;

  public constructor(
    code: MarketDataErrorCode,
    message: string,
    options: Readonly<{
      providerId?: MarketDataProviderId;
      exchange?: MarketDataExchange;
      requestId?: MarketDataRequestId;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message);

    this.name = "MarketDataError";
    this.code = code;
    this.providerId = options.providerId;
    this.exchange = options.exchange;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/**
 * Canonical OHLCV candle.
 */
export interface MarketDataCandle {
  readonly symbol: MarketDataSymbol;
  readonly timeframe: MarketDataTimeframe;

  readonly openTime: MarketDataTimestamp;
  readonly closeTime: MarketDataTimestamp;

  readonly open: MarketDataPrice;
  readonly high: MarketDataPrice;
  readonly low: MarketDataPrice;
  readonly close: MarketDataPrice;

  readonly volume: MarketDataVolume;

  readonly quoteVolume?: MarketDataVolume;
  readonly tradeCount?: MarketDataCount;

  readonly takerBuyBaseVolume?: MarketDataVolume;
  readonly takerBuyQuoteVolume?: MarketDataVolume;

  readonly isClosed: boolean;
}

/**
 * Canonical ticker snapshot.
 */
export interface MarketDataTicker {
  readonly symbol: MarketDataSymbol;

  readonly lastPrice: MarketDataPrice;

  readonly bidPrice?: MarketDataPrice;
  readonly askPrice?: MarketDataPrice;

  readonly openPrice24h?: MarketDataPrice;
  readonly highPrice24h?: MarketDataPrice;
  readonly lowPrice24h?: MarketDataPrice;

  readonly baseVolume24h?: MarketDataVolume;
  readonly quoteVolume24h?: MarketDataVolume;

  readonly priceChange24h?: number;
  readonly priceChangePercentage24h?: number;

  readonly timestamp: MarketDataTimestamp;
}

/**
 * One order-book level.
 */
export interface MarketDataOrderBookLevel {
  readonly price: MarketDataPrice;
  readonly quantity: MarketDataVolume;
}

/**
 * Canonical order-book snapshot.
 */
export interface MarketDataOrderBook {
  readonly symbol: MarketDataSymbol;

  readonly bids:
    readonly MarketDataOrderBookLevel[];

  readonly asks:
    readonly MarketDataOrderBookLevel[];

  readonly sequence?: number;
  readonly timestamp: MarketDataTimestamp;
}

/**
 * Canonical public market trade.
 */
export interface MarketDataTrade {
  readonly id: string;
  readonly symbol: MarketDataSymbol;

  readonly side: "BUY" | "SELL";

  readonly price: MarketDataPrice;
  readonly quantity: MarketDataVolume;

  readonly timestamp: MarketDataTimestamp;

  readonly isBuyerMaker?: boolean;
}

/**
 * Canonical exchange market information.
 */
export interface MarketDataMarket {
  readonly exchange: MarketDataExchange;
  readonly marketType: MarketDataMarketType;

  readonly symbol: MarketDataSymbol;
  readonly nativeSymbol: MarketDataNativeSymbol;

  readonly baseAsset: string;
  readonly quoteAsset: string;

  readonly status:
    | "ACTIVE"
    | "SUSPENDED"
    | "DELISTED"
    | "UNKNOWN";

  readonly pricePrecision?: number;
  readonly quantityPrecision?: number;

  readonly minimumQuantity?: number;
  readonly maximumQuantity?: number;

  readonly minimumNotional?: number;

  readonly supportedTimeframes:
    readonly MarketDataTimeframe[];

  readonly attributes?:
    Readonly<Record<string, unknown>>;
}

/**
 * Provider capability declaration.
 */
export interface MarketDataProviderCapabilities {
  readonly providerId: MarketDataProviderId;
  readonly exchange: MarketDataExchange;

  readonly capabilities:
    readonly MarketDataProviderCapability[];

  readonly marketTypes:
    readonly MarketDataMarketType[];

  readonly timeframes:
    readonly MarketDataTimeframe[];

  readonly supportsPublicAccess: boolean;
  readonly supportsAuthenticatedAccess: boolean;

  readonly supportsStreaming: boolean;
  readonly supportsHistoricalData: boolean;

  readonly maximumHistoricalCandlesPerRequest?: number;
  readonly maximumOrderBookDepth?: number;
}

/**
 * Generic provider response metadata.
 */
export interface MarketDataResponseMetadata {
  readonly providerId: MarketDataProviderId;
  readonly exchange: MarketDataExchange;

  readonly requestId: MarketDataRequestId;

  readonly requestedAt: MarketDataTimestamp;
  readonly receivedAt: MarketDataTimestamp;

  readonly durationMilliseconds: number;

  readonly cached: boolean;
  readonly retryCount: number;

  readonly providerTimestamp?: MarketDataTimestamp;
}

/**
 * Generic provider response.
 */
export interface MarketDataResponse<TData> {
  readonly data: TData;
  readonly metadata: MarketDataResponseMetadata;
}

/**
 * Base request shared by all provider operations.
 */
export interface MarketDataBaseRequest {
  readonly requestId: MarketDataRequestId;
  readonly requestedAt: MarketDataTimestamp;

  readonly exchange: MarketDataExchange;
  readonly marketType: MarketDataMarketType;
}

/**
 * Single-symbol request.
 */
export interface MarketDataSymbolRequest
  extends MarketDataBaseRequest {
  readonly symbol: MarketDataSymbol;
}

/**
 * Multi-symbol ticker request.
 */
export interface MarketDataTickersRequest
  extends MarketDataBaseRequest {
  readonly symbols?: readonly MarketDataSymbol[];
}

/**
 * Historical candle request.
 */
export interface MarketDataHistoricalCandlesRequest
  extends MarketDataSymbolRequest {
  readonly timeframe: MarketDataTimeframe;

  readonly startTime?: MarketDataTimestamp;
  readonly endTime?: MarketDataTimestamp;

  readonly limit?: number;
}

/**
 * Order-book request.
 */
export interface MarketDataOrderBookRequest
  extends MarketDataSymbolRequest {
  readonly depth?: number;
}

/**
 * Recent trades request.
 */
export interface MarketDataRecentTradesRequest
  extends MarketDataSymbolRequest {
  readonly limit?: number;
}

/**
 * Market discovery request.
 */
export interface MarketDataMarketDiscoveryRequest
  extends MarketDataBaseRequest {
  readonly symbols?: readonly MarketDataSymbol[];
  readonly activeOnly?: boolean;
}

/**
 * Base stream subscription request.
 */
export interface MarketDataStreamSubscriptionRequest {
  readonly subscriptionId:
    MarketDataSubscriptionId;

  readonly providerId:
    MarketDataProviderId;

  readonly exchange:
    MarketDataExchange;

  readonly marketType:
    MarketDataMarketType;

  readonly symbol:
    MarketDataSymbol;
}

/**
 * Candle stream subscription.
 */
export interface MarketDataCandleStreamRequest
  extends MarketDataStreamSubscriptionRequest {
  readonly timeframe:
    MarketDataTimeframe;
}

/**
 * Ticker stream subscription.
 */
export interface MarketDataTickerStreamRequest
  extends MarketDataStreamSubscriptionRequest {}

/**
 * Order-book stream subscription.
 */
export interface MarketDataOrderBookStreamRequest
  extends MarketDataStreamSubscriptionRequest {
  readonly depth?: number;
}

/**
 * Public-trade stream subscription.
 */
export interface MarketDataTradeStreamRequest
  extends MarketDataStreamSubscriptionRequest {}

/**
 * Stream event envelope.
 */
export interface MarketDataStreamEvent<TData> {
  readonly subscriptionId:
    MarketDataSubscriptionId;

  readonly providerId:
    MarketDataProviderId;

  readonly exchange:
    MarketDataExchange;

  readonly type:
    MarketDataStreamEventType;

  readonly timestamp:
    MarketDataTimestamp;

  readonly data?: TData;

  readonly error?: Readonly<{
    readonly code: MarketDataErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  }>;
}

/**
 * Provider health metrics.
 */
export interface MarketDataProviderHealthMetrics {
  readonly requestsTotal: number;
  readonly requestsSuccessful: number;
  readonly requestsFailed: number;

  readonly consecutiveFailures: number;

  readonly averageLatencyMilliseconds: number;
  readonly lastLatencyMilliseconds?: number;

  readonly activeSubscriptions: number;

  readonly rateLimitRemaining?: number;
  readonly rateLimitResetAt?: MarketDataTimestamp;
}

/**
 * Provider health snapshot.
 */
export interface MarketDataProviderHealth {
  readonly providerId: MarketDataProviderId;
  readonly exchange: MarketDataExchange;

  readonly status: MarketDataHealthStatus;

  readonly checkedAt: MarketDataTimestamp;

  readonly lastSuccessfulRequestAt?: MarketDataTimestamp;
  readonly lastFailedRequestAt?: MarketDataTimestamp;

  readonly message?: string;

  readonly metrics: MarketDataProviderHealthMetrics;
}

/**
 * Symbol normalization result.
 */
export interface MarketDataSymbolNormalization {
  readonly exchange: MarketDataExchange;

  readonly canonicalSymbol: MarketDataSymbol;
  readonly nativeSymbol: MarketDataNativeSymbol;

  readonly baseAsset: string;
  readonly quoteAsset: string;
}

/**
 * Timeframe normalization result.
 */
export interface MarketDataTimeframeNormalization {
  readonly exchange: MarketDataExchange;

  readonly canonicalTimeframe:
    MarketDataTimeframe;

  readonly nativeTimeframe: string;

  readonly durationMilliseconds?: number;
  readonly calendarBased: boolean;
}

/**
 * Provider runtime configuration.
 */
export interface MarketDataProviderConfiguration {
  readonly providerId: MarketDataProviderId;
  readonly exchange: MarketDataExchange;

  readonly enabled: boolean;

  readonly baseUrl?: string;
  readonly streamUrl?: string;

  readonly requestTimeoutMilliseconds: number;

  readonly maximumRetries: number;
  readonly retryBaseDelayMilliseconds: number;
  readonly retryMaximumDelayMilliseconds: number;

  readonly requestsPerSecond?: number;
  readonly requestsPerMinute?: number;

  readonly cacheEnabled: boolean;
  readonly cacheTtlMilliseconds?: number;

  readonly attributes?:
    Readonly<Record<string, unknown>>;
}

/**
 * Provider registration metadata.
 */
export interface MarketDataProviderDescriptor {
  readonly id: MarketDataProviderId;
  readonly exchange: MarketDataExchange;

  readonly name: string;
  readonly description?: string;

  readonly version: string;

  readonly status: MarketDataProviderStatus;

  readonly capabilities:
    MarketDataProviderCapabilities;

  readonly configuration:
    MarketDataProviderConfiguration;
}

/**
 * Creates a validated market-data provider identifier.
 */
export function marketDataProviderId(
  value: string,
): MarketDataProviderId {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 100
  ) {
    throw new MarketDataError(
      "INVALID_PROVIDER_ID",
      "Market data provider ID must contain between 1 and 100 characters.",
    );
  }

  if (
    !/^[a-z0-9][a-z0-9._:-]*$/i.test(
      normalized,
    )
  ) {
    throw new MarketDataError(
      "INVALID_PROVIDER_ID",
      `Invalid market data provider ID: "${value}".`,
    );
  }

  return normalized as MarketDataProviderId;
}

/**
 * Creates a validated canonical symbol.
 */
export function marketDataSymbol(
  value: string,
): MarketDataSymbol {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s/_-]+/g, "");

  if (
    normalized.length < 4 ||
    normalized.length > 30 ||
    !/^[A-Z0-9]+$/.test(normalized)
  ) {
    throw new MarketDataError(
      "INVALID_SYMBOL",
      `Invalid canonical market symbol: "${value}".`,
    );
  }

  return normalized as MarketDataSymbol;
}

/**
 * Creates a validated provider-native symbol.
 */
export function marketDataNativeSymbol(
  value: string,
): MarketDataNativeSymbol {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 50
  ) {
    throw new MarketDataError(
      "INVALID_NATIVE_SYMBOL",
      `Invalid provider-native symbol: "${value}".`,
    );
  }

  return normalized as MarketDataNativeSymbol;
}

/**
 * Creates a validated market-data timestamp.
 */
export function marketDataTimestamp(
  value: number,
): MarketDataTimestamp {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MarketDataError(
      "INVALID_TIMESTAMP",
      "Market data timestamp must be a non-negative safe integer.",
    );
  }

  return value as MarketDataTimestamp;
}

/**
 * Creates a validated market-data count.
 */
export function marketDataCount(
  value: number,
): MarketDataCount {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MarketDataError(
      "INVALID_COUNT",
      "Market data count must be a non-negative safe integer.",
    );
  }

  return value as MarketDataCount;
}

/**
 * Creates a validated positive market price.
 */
export function marketDataPrice(
  value: number,
): MarketDataPrice {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new MarketDataError(
      "INVALID_PRICE",
      "Market data price must be a finite positive number.",
    );
  }

  return value as MarketDataPrice;
}

/**
 * Creates a validated non-negative market volume.
 */
export function marketDataVolume(
  value: number,
): MarketDataVolume {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new MarketDataError(
      "INVALID_VOLUME",
      "Market data volume must be a finite non-negative number.",
    );
  }

  return value as MarketDataVolume;
}

/**
 * Creates a validated request identifier.
 */
export function marketDataRequestId(
  value: string,
): MarketDataRequestId {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 150
  ) {
    throw new MarketDataError(
      "INVALID_REQUEST",
      "Market data request ID must contain between 1 and 150 characters.",
    );
  }

  return normalized as MarketDataRequestId;
}

/**
 * Creates a validated subscription identifier.
 */
export function marketDataSubscriptionId(
  value: string,
): MarketDataSubscriptionId {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 150
  ) {
    throw new MarketDataError(
      "INVALID_REQUEST",
      "Market data subscription ID must contain between 1 and 150 characters.",
    );
  }

  return normalized as MarketDataSubscriptionId;
}

/**
 * Determines whether a timeframe is supported by the canonical framework.
 */
export function isMarketDataTimeframe(
  value: string,
): value is MarketDataTimeframe {
  return (
    MARKET_DATA_TIMEFRAMES as
      readonly string[]
  ).includes(value);
}

/**
 * Returns the fixed duration of a canonical timeframe.
 *
 * Calendar-based monthly timeframes return undefined.
 */
export function getMarketDataTimeframeMilliseconds(
  timeframe: MarketDataTimeframe,
): number | undefined {
  const fixedDurations:
    Readonly<
      Partial<
        Record<
          MarketDataTimeframe,
          number
        >
      >
    > = Object.freeze({
      "1s": 1_000,
      "5s": 5_000,
      "15s": 15_000,
      "30s": 30_000,

      "1m": 60_000,
      "3m": 180_000,
      "5m": 300_000,
      "15m": 900_000,
      "30m": 1_800_000,

      "1h": 3_600_000,
      "2h": 7_200_000,
      "4h": 14_400_000,
      "6h": 21_600_000,
      "8h": 28_800_000,
      "12h": 43_200_000,

      "1d": 86_400_000,
      "3d": 259_200_000,
      "1w": 604_800_000,
    });

  return fixedDurations[timeframe];
}

/**
 * Returns true when a provider declares a capability.
 */
export function hasMarketDataProviderCapability(
  capabilities: MarketDataProviderCapabilities,
  capability: MarketDataProviderCapability,
): boolean {
  return capabilities.capabilities.includes(
    capability,
  );
}

/**
 * Creates an immutable defensive candle copy.
 */
export function freezeMarketDataCandle(
  candle: MarketDataCandle,
): MarketDataCandle {
  validateMarketDataCandle(candle);

  return Object.freeze({
    symbol: candle.symbol,
    timeframe: candle.timeframe,

    openTime: candle.openTime,
    closeTime: candle.closeTime,

    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,

    volume: candle.volume,

    ...(candle.quoteVolume === undefined
      ? {}
      : {
          quoteVolume:
            candle.quoteVolume,
        }),

    ...(candle.tradeCount === undefined
      ? {}
      : {
          tradeCount:
            candle.tradeCount,
        }),

    ...(candle.takerBuyBaseVolume ===
    undefined
      ? {}
      : {
          takerBuyBaseVolume:
            candle.takerBuyBaseVolume,
        }),

    ...(candle.takerBuyQuoteVolume ===
    undefined
      ? {}
      : {
          takerBuyQuoteVolume:
            candle.takerBuyQuoteVolume,
        }),

    isClosed: candle.isClosed,
  });
}

/**
 * Validates one canonical candle.
 */
export function validateMarketDataCandle(
  candle: MarketDataCandle,
): void {
  if (
    Number(candle.closeTime) <
    Number(candle.openTime)
  ) {
    throw new MarketDataError(
      "INVALID_RESPONSE",
      "Market-data candle close time must not be earlier than open time.",
    );
  }

  if (
    Number(candle.high) <
      Number(candle.low) ||
    Number(candle.open) <
      Number(candle.low) ||
    Number(candle.open) >
      Number(candle.high) ||
    Number(candle.close) <
      Number(candle.low) ||
    Number(candle.close) >
      Number(candle.high)
  ) {
    throw new MarketDataError(
      "INVALID_RESPONSE",
      "Market-data candle contains an invalid OHLC range.",
    );
  }

  if (
    typeof candle.isClosed !==
    "boolean"
  ) {
    throw new MarketDataError(
      "INVALID_RESPONSE",
      "Market-data candle isClosed must be boolean.",
    );
  }
}