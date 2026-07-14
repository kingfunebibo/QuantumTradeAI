import {
  MarketDataCandle,
  MarketDataCandleStreamRequest,
  MarketDataHistoricalCandlesRequest,
  MarketDataMarket,
  MarketDataMarketDiscoveryRequest,
  MarketDataOrderBook,
  MarketDataOrderBookRequest,
  MarketDataOrderBookStreamRequest,
  MarketDataProviderCapabilities,
  MarketDataProviderConfiguration,
  MarketDataProviderDescriptor,
  MarketDataProviderHealth,
  MarketDataProviderId,
  MarketDataProviderStatus,
  MarketDataRecentTradesRequest,
  MarketDataResponse,
  MarketDataStreamEvent,
  MarketDataTicker,
  MarketDataTickerStreamRequest,
  MarketDataTickersRequest,
  MarketDataTrade,
  MarketDataTradeStreamRequest,
  MarketDataSymbolRequest,
} from "./market-data-provider.types";

/**
 * QuantumTradeAI Market Data Provider Framework
 *
 * Defines the stable provider contracts used by:
 *
 * - deterministic mock providers
 * - exchange-specific market-data adapters
 * - provider registries
 * - provider factories
 * - retry and rate-limit decorators
 * - cache decorators
 * - health monitors
 * - REST and WebSocket gateways
 */

/**
 * Provider lifecycle operations.
 */
export interface MarketDataProviderLifecycle {
  /**
   * Initializes the provider and any required runtime resources.
   *
   * Implementations must be idempotent.
   */
  initialize(): Promise<void>;

  /**
   * Stops the provider and releases all held resources.
   *
   * Implementations must safely handle repeated calls.
   */
  stop(): Promise<void>;

  /**
   * Returns the current provider lifecycle status.
   */
  getStatus(): MarketDataProviderStatus;
}

/**
 * Provider identity and metadata operations.
 */
export interface MarketDataProviderMetadata {
  /**
   * Returns the immutable provider identifier.
   */
  getId(): MarketDataProviderId;

  /**
   * Returns the immutable provider descriptor.
   */
  getDescriptor(): MarketDataProviderDescriptor;

  /**
   * Returns the immutable provider capabilities.
   */
  getCapabilities(): MarketDataProviderCapabilities;

  /**
   * Returns the immutable provider configuration.
   */
  getConfiguration(): MarketDataProviderConfiguration;
}

/**
 * Provider health operations.
 */
export interface MarketDataProviderHealthCheck {
  /**
   * Performs a live provider health check.
   */
  checkHealth(): Promise<MarketDataProviderHealth>;

  /**
   * Returns the most recently recorded health snapshot.
   *
   * Undefined means that no health check has been completed yet.
   */
  getLastHealth(): MarketDataProviderHealth | undefined;
}

/**
 * Market ticker operations.
 */
export interface MarketDataTickerProvider {
  /**
   * Loads the latest ticker for one symbol.
   */
  getTicker(
    request: MarketDataSymbolRequest,
  ): Promise<
    MarketDataResponse<MarketDataTicker>
  >;

  /**
   * Loads the latest ticker snapshots for multiple or all symbols.
   */
  getTickers(
    request: MarketDataTickersRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataTicker[]
    >
  >;
}

/**
 * Order-book operations.
 */
export interface MarketDataOrderBookProvider {
  /**
   * Loads a current order-book snapshot.
   */
  getOrderBook(
    request: MarketDataOrderBookRequest,
  ): Promise<
    MarketDataResponse<MarketDataOrderBook>
  >;
}

/**
 * Public trade operations.
 */
export interface MarketDataTradeProvider {
  /**
   * Loads recent public market trades.
   */
  getRecentTrades(
    request: MarketDataRecentTradesRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataTrade[]
    >
  >;
}

/**
 * Historical candle operations.
 */
export interface MarketDataHistoricalCandleProvider {
  /**
   * Loads historical candles.
   *
   * Implementations must return records in deterministic ascending open-time
   * order unless the provider descriptor explicitly documents otherwise.
   */
  getHistoricalCandles(
    request: MarketDataHistoricalCandlesRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataCandle[]
    >
  >;
}

/**
 * Market discovery operations.
 */
export interface MarketDataDiscoveryProvider {
  /**
   * Discovers supported exchange markets.
   */
  discoverMarkets(
    request: MarketDataMarketDiscoveryRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataMarket[]
    >
  >;
}

/**
 * Provider server-time operations.
 */
export interface MarketDataServerTimeProvider {
  /**
   * Returns the provider or exchange server time as a Unix timestamp.
   */
  getServerTime(
    request: MarketDataSymbolRequest,
  ): Promise<
    MarketDataResponse<number>
  >;
}

/**
 * Generic stream subscription.
 */
export interface MarketDataStreamSubscription<TData> {
  /**
   * Returns an async sequence of stream events.
   */
  readonly events:
    AsyncIterable<
      MarketDataStreamEvent<TData>
    >;

  /**
   * Unsubscribes from the stream.
   *
   * Implementations must be idempotent.
   */
  unsubscribe(): Promise<void>;

  /**
   * Returns whether the subscription is currently active.
   */
  isActive(): boolean;
}

/**
 * Live candle stream operations.
 */
export interface MarketDataCandleStreamProvider {
  subscribeCandles(
    request: MarketDataCandleStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataCandle
    >
  >;
}

/**
 * Live ticker stream operations.
 */
export interface MarketDataTickerStreamProvider {
  subscribeTicker(
    request: MarketDataTickerStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataTicker
    >
  >;
}

/**
 * Live order-book stream operations.
 */
export interface MarketDataOrderBookStreamProvider {
  subscribeOrderBook(
    request: MarketDataOrderBookStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataOrderBook
    >
  >;
}

/**
 * Live public-trade stream operations.
 */
export interface MarketDataTradeStreamProvider {
  subscribeTrades(
    request: MarketDataTradeStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataTrade
    >
  >;
}

/**
 * Combined streaming provider contract.
 */
export interface MarketDataStreamingProvider
  extends MarketDataCandleStreamProvider,
    MarketDataTickerStreamProvider,
    MarketDataOrderBookStreamProvider,
    MarketDataTradeStreamProvider {}

/**
 * Complete market-data provider contract.
 *
 * Exchange adapters may implement only the interfaces they support internally,
 * but providers registered in the QuantumTradeAI runtime must expose this
 * complete contract and report unsupported operations through typed
 * MarketDataError instances.
 */
export interface MarketDataProvider
  extends MarketDataProviderLifecycle,
    MarketDataProviderMetadata,
    MarketDataProviderHealthCheck,
    MarketDataTickerProvider,
    MarketDataOrderBookProvider,
    MarketDataTradeProvider,
    MarketDataHistoricalCandleProvider,
    MarketDataDiscoveryProvider,
    MarketDataServerTimeProvider,
    MarketDataStreamingProvider {}

/**
 * Provider constructor dependencies.
 */
export interface MarketDataProviderDependencies {
  readonly descriptor:
    MarketDataProviderDescriptor;

  /**
   * Deterministic clock dependency.
   *
   * Returning the current time through an injectable dependency keeps mock
   * providers and tests deterministic.
   */
  readonly now: () => number;
}

/**
 * Factory contract for constructing provider instances.
 */
export interface MarketDataProviderFactory {
  create(
    dependencies:
      MarketDataProviderDependencies,
  ): MarketDataProvider;
}

/**
 * Provider registry lookup input.
 */
export interface MarketDataProviderLookup {
  readonly providerId:
    MarketDataProviderId;
}

/**
 * Provider registry contract.
 */
export interface MarketDataProviderRegistry {
  /**
   * Registers one provider.
   */
  register(
    provider: MarketDataProvider,
  ): void;

  /**
   * Replaces an existing provider with the same identifier.
   */
  replace(
    provider: MarketDataProvider,
  ): void;

  /**
   * Removes one provider.
   *
   * Returns true when a provider was removed.
   */
  remove(
    lookup: MarketDataProviderLookup,
  ): boolean;

  /**
   * Returns one provider by identifier.
   */
  get(
    lookup: MarketDataProviderLookup,
  ): MarketDataProvider | undefined;

  /**
   * Returns one provider or throws a typed error when unavailable.
   */
  require(
    lookup: MarketDataProviderLookup,
  ): MarketDataProvider;

  /**
   * Returns whether a provider is registered.
   */
  has(
    lookup: MarketDataProviderLookup,
  ): boolean;

  /**
   * Lists all registered providers in deterministic identifier order.
   */
  list(): readonly MarketDataProvider[];

  /**
   * Returns the number of registered providers.
   */
  count(): number;

  /**
   * Removes every registered provider.
   */
  clear(): void;
}

/**
 * Provider selection criteria.
 */
export interface MarketDataProviderSelectionCriteria {
  readonly capability?:
    MarketDataProviderCapabilities["capabilities"][number];

  readonly exchange?:
    MarketDataProviderDescriptor["exchange"];

  readonly marketType?:
    MarketDataProviderCapabilities["marketTypes"][number];

  readonly requireStreaming?: boolean;
  readonly requireHistoricalData?: boolean;
  readonly requirePublicAccess?: boolean;
  readonly requireAuthenticatedAccess?: boolean;

  readonly includeDegraded?: boolean;
}

/**
 * Provider selector contract.
 */
export interface MarketDataProviderSelector {
  /**
   * Selects one provider matching the supplied criteria.
   *
   * Implementations must use deterministic ordering when multiple providers
   * are eligible.
   */
  select(
    criteria:
      MarketDataProviderSelectionCriteria,
  ): MarketDataProvider;

  /**
   * Returns every matching provider in deterministic order.
   */
  selectAll(
    criteria:
      MarketDataProviderSelectionCriteria,
  ): readonly MarketDataProvider[];
}

/**
 * Retry decision input.
 */
export interface MarketDataRetryDecisionInput {
  readonly attempt: number;
  readonly maximumAttempts: number;

  readonly error: unknown;

  readonly providerId:
    MarketDataProviderId;
}

/**
 * Retry decision result.
 */
export interface MarketDataRetryDecision {
  readonly retry: boolean;
  readonly delayMilliseconds: number;
}

/**
 * Retry policy contract.
 */
export interface MarketDataRetryPolicy {
  decide(
    input:
      MarketDataRetryDecisionInput,
  ): MarketDataRetryDecision;
}

/**
 * Rate-limit acquisition input.
 */
export interface MarketDataRateLimitRequest {
  readonly providerId:
    MarketDataProviderId;

  readonly operation: string;

  readonly requestedAt: number;
}

/**
 * Rate-limit lease.
 */
export interface MarketDataRateLimitLease {
  readonly acquired: boolean;

  readonly retryAfterMilliseconds?: number;

  readonly remaining?: number;
}

/**
 * Provider rate-limiter contract.
 */
export interface MarketDataRateLimiter {
  acquire(
    request:
      MarketDataRateLimitRequest,
  ): Promise<
    MarketDataRateLimitLease
  >;
}

/**
 * Cache lookup input.
 */
export interface MarketDataCacheLookup {
  readonly key: string;
}

/**
 * Cache write input.
 */
export interface MarketDataCacheWrite<TValue> {
  readonly key: string;
  readonly value: TValue;

  readonly expiresAt?: number;
}

/**
 * Market-data cache contract.
 */
export interface MarketDataCache {
  get<TValue>(
    lookup:
      MarketDataCacheLookup,
  ): Promise<
    TValue | undefined
  >;

  set<TValue>(
    input:
      MarketDataCacheWrite<TValue>,
  ): Promise<void>;

  delete(
    lookup:
      MarketDataCacheLookup,
  ): Promise<boolean>;

  clear(): Promise<void>;
}

/**
 * Provider request execution input.
 */
export interface MarketDataProviderExecutionInput<
  TResult,
> {
  readonly provider:
    MarketDataProvider;

  readonly operation: string;

  readonly execute:
    () => Promise<TResult>;
}

/**
 * Provider request executor contract.
 *
 * Implementations may compose rate limiting, retries, caching, metrics, and
 * health reporting around provider operations.
 */
export interface MarketDataProviderExecutor {
  execute<TResult>(
    input:
      MarketDataProviderExecutionInput<TResult>,
  ): Promise<TResult>;
}

/**
 * Health-monitor contract.
 */
export interface MarketDataProviderHealthMonitor {
  /**
   * Checks one provider.
   */
  check(
    provider:
      MarketDataProvider,
  ): Promise<
    MarketDataProviderHealth
  >;

  /**
   * Checks all registered providers.
   */
  checkAll(
    providers:
      readonly MarketDataProvider[],
  ): Promise<
    readonly MarketDataProviderHealth[]
  >;
}