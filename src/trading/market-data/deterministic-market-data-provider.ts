import {
  MarketDataCandle,
  MarketDataCandleStreamRequest,
  MarketDataError,
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
  MarketDataProviderHealthMetrics,
  MarketDataProviderId,
  MarketDataProviderStatus,
  MarketDataRecentTradesRequest,
  MarketDataResponse,
  MarketDataResponseMetadata,
  MarketDataStreamEvent,
  MarketDataSubscriptionId,
  MarketDataSymbol,
  MarketDataSymbolRequest,
  MarketDataTicker,
  MarketDataTickerStreamRequest,
  MarketDataTickersRequest,
  MarketDataTimestamp,
  MarketDataTrade,
  MarketDataTradeStreamRequest,
  freezeMarketDataCandle,
  hasMarketDataProviderCapability,
  marketDataTimestamp,
} from "./market-data-provider.types";

import {
  MarketDataProvider,
  MarketDataProviderDependencies,
  MarketDataStreamSubscription,
} from "./market-data-provider";

/**
 * Dataset used to initialize the deterministic provider.
 */
export interface DeterministicMarketDataProviderDataset {
  readonly markets?: readonly MarketDataMarket[];
  readonly tickers?: readonly MarketDataTicker[];

  readonly candles?: Readonly<
    Record<
      string,
      readonly MarketDataCandle[]
    >
  >;

  readonly orderBooks?: Readonly<
    Record<
      string,
      MarketDataOrderBook
    >
  >;

  readonly recentTrades?: Readonly<
    Record<
      string,
      readonly MarketDataTrade[]
    >
  >;

  readonly candleStreams?: Readonly<
    Record<
      string,
      readonly MarketDataCandle[]
    >
  >;

  readonly tickerStreams?: Readonly<
    Record<
      string,
      readonly MarketDataTicker[]
    >
  >;

  readonly orderBookStreams?: Readonly<
    Record<
      string,
      readonly MarketDataOrderBook[]
    >
  >;

  readonly tradeStreams?: Readonly<
    Record<
      string,
      readonly MarketDataTrade[]
    >
  >;
}

/**
 * Deterministic provider construction dependencies.
 */
export interface DeterministicMarketDataProviderDependencies
  extends MarketDataProviderDependencies {
  readonly dataset?:
    DeterministicMarketDataProviderDataset;
}

/**
 * Internal health state.
 */
interface MutableHealthState {
  requestsTotal: number;
  requestsSuccessful: number;
  requestsFailed: number;

  consecutiveFailures: number;

  totalLatencyMilliseconds: number;
  lastLatencyMilliseconds?: number;

  activeSubscriptions: number;

  lastSuccessfulRequestAt?: MarketDataTimestamp;
  lastFailedRequestAt?: MarketDataTimestamp;
}

/**
 * In-memory deterministic market-data provider.
 *
 * This provider is intended for:
 *
 * - unit tests
 * - deterministic integration tests
 * - local development
 * - backtesting infrastructure
 * - provider contract validation
 *
 * It performs no network requests and returns immutable defensive copies.
 */
export class DeterministicMarketDataProvider
  implements MarketDataProvider
{
  private readonly descriptor:
    MarketDataProviderDescriptor;

  private readonly configuration:
    MarketDataProviderConfiguration;

  private readonly capabilities:
    MarketDataProviderCapabilities;

  private readonly now:
    () => number;

  private readonly markets:
    readonly MarketDataMarket[];

  private readonly tickersBySymbol:
    ReadonlyMap<
      MarketDataSymbol,
      MarketDataTicker
    >;

  private readonly candlesByKey:
    ReadonlyMap<
      string,
      readonly MarketDataCandle[]
    >;

  private readonly orderBooksBySymbol:
    ReadonlyMap<
      MarketDataSymbol,
      MarketDataOrderBook
    >;

  private readonly recentTradesBySymbol:
    ReadonlyMap<
      MarketDataSymbol,
      readonly MarketDataTrade[]
    >;

  private readonly candleStreamsByKey:
    ReadonlyMap<
      string,
      readonly MarketDataCandle[]
    >;

  private readonly tickerStreamsBySymbol:
    ReadonlyMap<
      MarketDataSymbol,
      readonly MarketDataTicker[]
    >;

  private readonly orderBookStreamsBySymbol:
    ReadonlyMap<
      MarketDataSymbol,
      readonly MarketDataOrderBook[]
    >;

  private readonly tradeStreamsBySymbol:
    ReadonlyMap<
      MarketDataSymbol,
      readonly MarketDataTrade[]
    >;

  private status:
    MarketDataProviderStatus;

  private lastHealth:
    MarketDataProviderHealth | undefined;

  private readonly healthState:
    MutableHealthState;

  public constructor(
    dependencies:
      DeterministicMarketDataProviderDependencies,
  ) {
    this.descriptor =
      freezeDescriptor(
        dependencies.descriptor,
      );

    this.configuration =
      this.descriptor.configuration;

    this.capabilities =
      this.descriptor.capabilities;

    this.now = dependencies.now;

    this.status =
      this.descriptor.status;

    const dataset =
      dependencies.dataset ?? {};

    this.markets =
      Object.freeze(
        (dataset.markets ?? []).map(
          freezeMarket,
        ),
      );

    this.tickersBySymbol =
      createTickerMap(
        dataset.tickers ?? [],
      );

    this.candlesByKey =
      createCandleMap(
        dataset.candles ?? {},
      );

    this.orderBooksBySymbol =
      createOrderBookMap(
        dataset.orderBooks ?? {},
      );

    this.recentTradesBySymbol =
      createTradeMap(
        dataset.recentTrades ?? {},
      );

    this.candleStreamsByKey =
      createCandleMap(
        dataset.candleStreams ?? {},
      );

    this.tickerStreamsBySymbol =
      createTickerStreamMap(
        dataset.tickerStreams ?? {},
      );

    this.orderBookStreamsBySymbol =
      createOrderBookStreamMap(
        dataset.orderBookStreams ?? {},
      );

    this.tradeStreamsBySymbol =
      createTradeStreamMap(
        dataset.tradeStreams ?? {},
      );

    this.healthState = {
      requestsTotal: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,

      consecutiveFailures: 0,

      totalLatencyMilliseconds: 0,

      activeSubscriptions: 0,
    };
  }

  public async initialize(): Promise<void> {
    if (
      this.status === "READY" ||
      this.status === "DEGRADED"
    ) {
      return;
    }

    if (!this.configuration.enabled) {
      this.status = "STOPPED";

      throw new MarketDataError(
        "PROVIDER_UNAVAILABLE",
        `Market-data provider "${this.getId()}" is disabled.`,
        {
          providerId:
            this.getId(),

          exchange:
            this.descriptor.exchange,
        },
      );
    }

    this.status = "INITIALIZING";
    this.status = "READY";
  }

  public async stop(): Promise<void> {
    this.status = "STOPPED";
  }

  public getStatus(): MarketDataProviderStatus {
    return this.status;
  }

  public getId(): MarketDataProviderId {
    return this.descriptor.id;
  }

  public getDescriptor(): MarketDataProviderDescriptor {
    return freezeDescriptor(
      this.descriptor,
      this.status,
    );
  }

  public getCapabilities(): MarketDataProviderCapabilities {
    return freezeCapabilities(
      this.capabilities,
    );
  }

  public getConfiguration(): MarketDataProviderConfiguration {
    return freezeConfiguration(
      this.configuration,
    );
  }

  public async checkHealth(): Promise<MarketDataProviderHealth> {
    const checkedAt =
      this.getCurrentTimestamp();

    const status =
      deriveHealthStatus(
        this.status,
        this.healthState,
      );

    const metrics =
      createHealthMetrics(
        this.healthState,
      );

    const health =
      Object.freeze({
        providerId:
          this.getId(),

        exchange:
          this.descriptor.exchange,

        status,

        checkedAt,

        ...(this.healthState
          .lastSuccessfulRequestAt ===
        undefined
          ? {}
          : {
              lastSuccessfulRequestAt:
                this.healthState
                  .lastSuccessfulRequestAt,
            }),

        ...(this.healthState
          .lastFailedRequestAt ===
        undefined
          ? {}
          : {
              lastFailedRequestAt:
                this.healthState
                  .lastFailedRequestAt,
            }),

        message:
          createHealthMessage(
            this.status,
            status,
          ),

        metrics,
      }) satisfies MarketDataProviderHealth;

    this.lastHealth = health;

    return health;
  }

  public getLastHealth():
    | MarketDataProviderHealth
    | undefined {
    return this.lastHealth === undefined
      ? undefined
      : freezeHealth(
          this.lastHealth,
        );
  }

  public async getTicker(
    request: MarketDataSymbolRequest,
  ): Promise<
    MarketDataResponse<MarketDataTicker>
  > {
    return this.executeRequest(
      request,
      "TICKER",
      () => {
        const ticker =
          this.tickersBySymbol.get(
            request.symbol,
          );

        if (ticker === undefined) {
          throw unsupportedSymbol(
            this,
            request.symbol,
            request.requestId,
          );
        }

        return freezeTicker(ticker);
      },
    );
  }

  public async getTickers(
    request: MarketDataTickersRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataTicker[]
    >
  > {
    return this.executeRequest(
      request,
      "TICKERS",
      () => {
        if (
          request.symbols === undefined
        ) {
          return Object.freeze(
            [...this.tickersBySymbol.values()]
              .map(freezeTicker)
              .sort(compareTickers),
          );
        }

        return Object.freeze(
          request.symbols.map(
            (symbol) => {
              const ticker =
                this.tickersBySymbol.get(
                  symbol,
                );

              if (ticker === undefined) {
                throw unsupportedSymbol(
                  this,
                  symbol,
                  request.requestId,
                );
              }

              return freezeTicker(
                ticker,
              );
            },
          ),
        );
      },
    );
  }

  public async getOrderBook(
    request: MarketDataOrderBookRequest,
  ): Promise<
    MarketDataResponse<MarketDataOrderBook>
  > {
    return this.executeRequest(
      request,
      "ORDER_BOOK",
      () => {
        const orderBook =
          this.orderBooksBySymbol.get(
            request.symbol,
          );

        if (orderBook === undefined) {
          throw unsupportedSymbol(
            this,
            request.symbol,
            request.requestId,
          );
        }

        const depth =
          request.depth;

        if (
          depth !== undefined &&
          (
            !Number.isSafeInteger(
              depth,
            ) ||
            depth <= 0
          )
        ) {
          throw new MarketDataError(
            "INVALID_LIMIT",
            "Order-book depth must be a positive safe integer.",
            {
              providerId:
                this.getId(),

              exchange:
                this.descriptor.exchange,

              requestId:
                request.requestId,
            },
          );
        }

        return freezeOrderBook(
          depth === undefined
            ? orderBook
            : {
                ...orderBook,

                bids:
                  orderBook.bids.slice(
                    0,
                    depth,
                  ),

                asks:
                  orderBook.asks.slice(
                    0,
                    depth,
                  ),
              },
        );
      },
    );
  }

  public async getRecentTrades(
    request: MarketDataRecentTradesRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataTrade[]
    >
  > {
    return this.executeRequest(
      request,
      "RECENT_TRADES",
      () => {
        const trades =
          this.recentTradesBySymbol.get(
            request.symbol,
          );

        if (trades === undefined) {
          throw unsupportedSymbol(
            this,
            request.symbol,
            request.requestId,
          );
        }

        const limit =
          request.limit;

        if (
          limit !== undefined &&
          (
            !Number.isSafeInteger(
              limit,
            ) ||
            limit <= 0
          )
        ) {
          throw new MarketDataError(
            "INVALID_LIMIT",
            "Recent-trade limit must be a positive safe integer.",
            {
              providerId:
                this.getId(),

              exchange:
                this.descriptor.exchange,

              requestId:
                request.requestId,
            },
          );
        }

        const selected =
          limit === undefined
            ? trades
            : trades.slice(
                Math.max(
                  0,
                  trades.length - limit,
                ),
              );

        return Object.freeze(
          selected.map(
            freezeTrade,
          ),
        );
      },
    );
  }

  public async getHistoricalCandles(
    request:
      MarketDataHistoricalCandlesRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataCandle[]
    >
  > {
    return this.executeRequest(
      request,
      "HISTORICAL_CANDLES",
      () => {
        validateHistoricalRequest(
          request,
          this,
        );

        const key =
          createCandleKey(
            request.symbol,
            request.timeframe,
          );

        const candles =
          this.candlesByKey.get(key);

        if (candles === undefined) {
          throw unsupportedSymbol(
            this,
            request.symbol,
            request.requestId,
          );
        }

        let selected =
          candles.filter(
            (candle) => {
              if (
                request.startTime !==
                  undefined &&
                Number(
                  candle.openTime,
                ) <
                  Number(
                    request.startTime,
                  )
              ) {
                return false;
              }

              if (
                request.endTime !==
                  undefined &&
                Number(
                  candle.openTime,
                ) >
                  Number(
                    request.endTime,
                  )
              ) {
                return false;
              }

              return true;
            },
          );

        if (
          request.limit !== undefined
        ) {
          selected = selected.slice(
            0,
            request.limit,
          );
        }

        return Object.freeze(
          selected.map(
            freezeMarketDataCandle,
          ),
        );
      },
    );
  }

  public async discoverMarkets(
    request:
      MarketDataMarketDiscoveryRequest,
  ): Promise<
    MarketDataResponse<
      readonly MarketDataMarket[]
    >
  > {
    return this.executeRequest(
      request,
      "MARKET_DISCOVERY",
      () => {
        let selected =
          this.markets.filter(
            (market) =>
              market.marketType ===
                request.marketType &&
              market.exchange ===
                request.exchange,
          );

        if (
          request.activeOnly === true
        ) {
          selected = selected.filter(
            (market) =>
              market.status ===
              "ACTIVE",
          );
        }

        if (
          request.symbols !== undefined
        ) {
          const symbols =
            new Set(
              request.symbols,
            );

          selected = selected.filter(
            (market) =>
              symbols.has(
                market.symbol,
              ),
          );
        }

        return Object.freeze(
          selected
            .map(freezeMarket)
            .sort(compareMarkets),
        );
      },
    );
  }

  public async getServerTime(
    request: MarketDataSymbolRequest,
  ): Promise<
    MarketDataResponse<number>
  > {
    return this.executeRequest(
      request,
      "SERVER_TIME",
      () =>
        Number(
          this.getCurrentTimestamp(),
        ),
    );
  }

  public async subscribeCandles(
    request:
      MarketDataCandleStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataCandle
    >
  > {
    this.assertReady();
    this.assertCapability(
      "LIVE_CANDLES",
    );

    const key =
      createCandleKey(
        request.symbol,
        request.timeframe,
      );

    const values =
      this.candleStreamsByKey.get(
        key,
      ) ??
      this.candlesByKey.get(key);

    if (values === undefined) {
      throw unsupportedSymbol(
        this,
        request.symbol,
      );
    }

    return this.createSubscription(
      request.subscriptionId,
      values.map(
        freezeMarketDataCandle,
      ),
    );
  }

  public async subscribeTicker(
    request:
      MarketDataTickerStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataTicker
    >
  > {
    this.assertReady();
    this.assertCapability(
      "LIVE_TICKER",
    );

    const values =
      this.tickerStreamsBySymbol.get(
        request.symbol,
      ) ??
      (
        this.tickersBySymbol.has(
          request.symbol,
        )
          ? [
              this.tickersBySymbol.get(
                request.symbol,
              )!,
            ]
          : undefined
      );

    if (values === undefined) {
      throw unsupportedSymbol(
        this,
        request.symbol,
      );
    }

    return this.createSubscription(
      request.subscriptionId,
      values.map(freezeTicker),
    );
  }

  public async subscribeOrderBook(
    request:
      MarketDataOrderBookStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataOrderBook
    >
  > {
    this.assertReady();
    this.assertCapability(
      "LIVE_ORDER_BOOK",
    );

    const values =
      this.orderBookStreamsBySymbol.get(
        request.symbol,
      ) ??
      (
        this.orderBooksBySymbol.has(
          request.symbol,
        )
          ? [
              this.orderBooksBySymbol.get(
                request.symbol,
              )!,
            ]
          : undefined
      );

    if (values === undefined) {
      throw unsupportedSymbol(
        this,
        request.symbol,
      );
    }

    return this.createSubscription(
      request.subscriptionId,
      values.map(freezeOrderBook),
    );
  }

  public async subscribeTrades(
    request:
      MarketDataTradeStreamRequest,
  ): Promise<
    MarketDataStreamSubscription<
      MarketDataTrade
    >
  > {
    this.assertReady();
    this.assertCapability(
      "LIVE_TRADES",
    );

    const values =
      this.tradeStreamsBySymbol.get(
        request.symbol,
      ) ??
      this.recentTradesBySymbol.get(
        request.symbol,
      );

    if (values === undefined) {
      throw unsupportedSymbol(
        this,
        request.symbol,
      );
    }

    return this.createSubscription(
      request.subscriptionId,
      values.map(freezeTrade),
    );
  }

  private async executeRequest<
    TRequest extends {
      readonly requestId:
        MarketDataResponseMetadata["requestId"];

      readonly requestedAt:
        MarketDataTimestamp;

      readonly exchange:
        MarketDataResponseMetadata["exchange"];
    },
    TResult,
  >(
    request: TRequest,
    capability:
      MarketDataProviderCapabilities["capabilities"][number],
    operation: () => TResult,
  ): Promise<
    MarketDataResponse<TResult>
  > {
    this.assertReady();
    this.assertExchange(
      request.exchange,
    );
    this.assertCapability(
      capability,
    );

    const startedAt =
      this.getCurrentTimestamp();

    this.healthState.requestsTotal +=
      1;

    try {
      const data = operation();

      const completedAt =
        this.getCurrentTimestamp();

      const durationMilliseconds =
        Math.max(
          0,
          Number(completedAt) -
            Number(startedAt),
        );

      this.healthState
        .requestsSuccessful += 1;

      this.healthState
        .consecutiveFailures = 0;

      this.healthState
        .totalLatencyMilliseconds +=
        durationMilliseconds;

      this.healthState
        .lastLatencyMilliseconds =
        durationMilliseconds;

      this.healthState
        .lastSuccessfulRequestAt =
        completedAt;

      return Object.freeze({
        data,

        metadata:
          createResponseMetadata({
            providerId:
              this.getId(),

            exchange:
              this.descriptor.exchange,

            requestId:
              request.requestId,

            requestedAt:
              request.requestedAt,

            receivedAt:
              completedAt,

            durationMilliseconds,

            providerTimestamp:
              completedAt,
          }),
      });
    } catch (error: unknown) {
      const failedAt =
        this.getCurrentTimestamp();

      this.healthState
        .requestsFailed += 1;

      this.healthState
        .consecutiveFailures += 1;

      this.healthState
        .lastFailedRequestAt =
        failedAt;

      if (
        error instanceof
        MarketDataError
      ) {
        throw error;
      }

      throw new MarketDataError(
        "INTERNAL_ERROR",
        error instanceof Error
          ? error.message
          : `Unknown deterministic market-data provider failure: ${String(
              error,
            )}.`,
        {
          providerId:
            this.getId(),

          exchange:
            this.descriptor.exchange,

          requestId:
            request.requestId,

          cause: error,
        },
      );
    }
  }

  private createSubscription<TData>(
    subscriptionId:
      MarketDataSubscriptionId,
    values: readonly TData[],
  ): MarketDataStreamSubscription<TData> {
    this.healthState
      .activeSubscriptions += 1;

    return new DeterministicStreamSubscription({
      subscriptionId,

      providerId:
        this.getId(),

      exchange:
        this.descriptor.exchange,

      values,

      now:
        this.now,

      onClosed: () => {
        this.healthState
          .activeSubscriptions =
          Math.max(
            0,
            this.healthState
              .activeSubscriptions - 1,
          );
      },
    });
  }

  private assertReady(): void {
    if (
      this.status !== "READY" &&
      this.status !== "DEGRADED"
    ) {
      throw new MarketDataError(
        this.status ===
        "UNAVAILABLE"
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_NOT_READY",

        [
          `Market-data provider "${this.getId()}"`,
          `is not ready. Current status: ${this.status}.`,
        ].join(" "),

        {
          providerId:
            this.getId(),

          exchange:
            this.descriptor.exchange,

          retryable:
            this.status ===
              "INITIALIZING" ||
            this.status ===
              "UNAVAILABLE",
        },
      );
    }
  }

  private assertCapability(
    capability:
      MarketDataProviderCapabilities["capabilities"][number],
  ): void {
    if (
      !hasMarketDataProviderCapability(
        this.capabilities,
        capability,
      )
    ) {
      throw new MarketDataError(
        "UNSUPPORTED_CAPABILITY",
        [
          `Market-data provider "${this.getId()}"`,
          `does not support capability "${capability}".`,
        ].join(" "),
        {
          providerId:
            this.getId(),

          exchange:
            this.descriptor.exchange,
        },
      );
    }
  }

  private assertExchange(
    exchange:
      MarketDataResponseMetadata["exchange"],
  ): void {
    if (
      exchange !==
      this.descriptor.exchange
    ) {
      throw new MarketDataError(
        "INVALID_EXCHANGE",
        [
          `Request exchange "${exchange}" does not match`,
          `provider exchange "${this.descriptor.exchange}".`,
        ].join(" "),
        {
          providerId:
            this.getId(),

          exchange:
            this.descriptor.exchange,
        },
      );
    }
  }

  private getCurrentTimestamp(): MarketDataTimestamp {
    return marketDataTimestamp(
      this.now(),
    );
  }
}

/**
 * Deterministic stream subscription.
 */
class DeterministicStreamSubscription<TData>
  implements MarketDataStreamSubscription<TData>
{
  public readonly events:
    AsyncIterable<
      MarketDataStreamEvent<TData>
    >;

  private active = true;
  private closed = false;

  private readonly onClosed:
    () => void;

  public constructor(
    options: Readonly<{
      subscriptionId:
        MarketDataSubscriptionId;

      providerId:
        MarketDataProviderId;

      exchange:
        MarketDataStreamEvent<TData>["exchange"];

      values:
        readonly TData[];

      now:
        () => number;

      onClosed:
        () => void;
    }>,
  ) {
    this.onClosed =
      options.onClosed;

    this.events =
      this.createEvents(options);
  }

  public async unsubscribe(): Promise<void> {
    this.close();
  }

  public isActive(): boolean {
    return this.active;
  }

  private async *createEvents(
    options: Readonly<{
      subscriptionId:
        MarketDataSubscriptionId;

      providerId:
        MarketDataProviderId;

      exchange:
        MarketDataStreamEvent<TData>["exchange"];

      values:
        readonly TData[];

      now:
        () => number;
    }>,
  ): AsyncIterable<
    MarketDataStreamEvent<TData>
  > {
    try {
      if (!this.active) {
        return;
      }

      yield createStreamEvent({
        subscriptionId:
          options.subscriptionId,

        providerId:
          options.providerId,

        exchange:
          options.exchange,

        type: "CONNECTED",

        timestamp:
          marketDataTimestamp(
            options.now(),
          ),
      });

      if (!this.active) {
        return;
      }

      yield createStreamEvent({
        subscriptionId:
          options.subscriptionId,

        providerId:
          options.providerId,

        exchange:
          options.exchange,

        type: "SUBSCRIBED",

        timestamp:
          marketDataTimestamp(
            options.now(),
          ),
      });

      if (!this.active) {
        return;
      }

      for (const value of options.values) {
        if (!this.active) {
          return;
        }

        yield createStreamEvent({
          subscriptionId:
            options.subscriptionId,

          providerId:
            options.providerId,

          exchange:
            options.exchange,

          type: "DATA",

          timestamp:
            marketDataTimestamp(
              options.now(),
            ),

          data: value,
        });

        if (!this.active) {
          return;
        }
      }

      if (!this.active) {
        return;
      }

      yield createStreamEvent({
        subscriptionId:
          options.subscriptionId,

        providerId:
          options.providerId,

        exchange:
          options.exchange,

        type: "HEARTBEAT",

        timestamp:
          marketDataTimestamp(
            options.now(),
          ),
      });
    } finally {
      this.close();
    }
  }

  private close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.active = false;
    this.onClosed();
  }
}

function validateHistoricalRequest(
  request:
    MarketDataHistoricalCandlesRequest,
  provider:
    DeterministicMarketDataProvider,
): void {
  if (
    request.startTime !== undefined &&
    request.endTime !== undefined &&
    Number(request.startTime) >
      Number(request.endTime)
  ) {
    throw new MarketDataError(
      "INVALID_RANGE",
      "Historical candle start time must not be after end time.",
      {
        providerId:
          provider.getId(),

        exchange:
          provider
            .getDescriptor()
            .exchange,

        requestId:
          request.requestId,
      },
    );
  }

  if (
    request.limit !== undefined &&
    (
      !Number.isSafeInteger(
        request.limit,
      ) ||
      request.limit <= 0
    )
  ) {
    throw new MarketDataError(
      "INVALID_LIMIT",
      "Historical candle limit must be a positive safe integer.",
      {
        providerId:
          provider.getId(),

        exchange:
          provider
            .getDescriptor()
            .exchange,

        requestId:
          request.requestId,
      },
    );
  }

  const maximum =
    provider
      .getCapabilities()
      .maximumHistoricalCandlesPerRequest;

  if (
    request.limit !== undefined &&
    maximum !== undefined &&
    request.limit > maximum
  ) {
    throw new MarketDataError(
      "INVALID_LIMIT",
      [
        `Historical candle limit ${request.limit} exceeds`,
        `provider maximum ${maximum}.`,
      ].join(" "),
      {
        providerId:
          provider.getId(),

        exchange:
          provider
            .getDescriptor()
            .exchange,

        requestId:
          request.requestId,
      },
    );
  }

  if (
    !provider
      .getCapabilities()
      .timeframes.includes(
        request.timeframe,
      )
  ) {
    throw new MarketDataError(
      "UNSUPPORTED_TIMEFRAME",
      [
        `Provider "${provider.getId()}" does not support`,
        `timeframe "${request.timeframe}".`,
      ].join(" "),
      {
        providerId:
          provider.getId(),

        exchange:
          provider
            .getDescriptor()
            .exchange,

        requestId:
          request.requestId,
      },
    );
  }
}

function unsupportedSymbol(
  provider:
    DeterministicMarketDataProvider,
  symbol: MarketDataSymbol,
  requestId?:
    MarketDataResponseMetadata["requestId"],
): MarketDataError {
  return new MarketDataError(
    "UNSUPPORTED_SYMBOL",
    [
      `Provider "${provider.getId()}" has no data`,
      `for symbol "${symbol}".`,
    ].join(" "),
    {
      providerId:
        provider.getId(),

      exchange:
        provider
          .getDescriptor()
          .exchange,

      ...(requestId === undefined
        ? {}
        : {
            requestId,
          }),
    },
  );
}

function createCandleKey(
  symbol: MarketDataSymbol,
  timeframe:
    MarketDataCandle["timeframe"],
): string {
  return `${symbol}::${timeframe}`;
}

function createResponseMetadata(
  input: Readonly<{
    providerId:
      MarketDataProviderId;

    exchange:
      MarketDataResponseMetadata["exchange"];

    requestId:
      MarketDataResponseMetadata["requestId"];

    requestedAt:
      MarketDataTimestamp;

    receivedAt:
      MarketDataTimestamp;

    durationMilliseconds:
      number;

    providerTimestamp?:
      MarketDataTimestamp;
  }>,
): MarketDataResponseMetadata {
  return Object.freeze({
    providerId:
      input.providerId,

    exchange:
      input.exchange,

    requestId:
      input.requestId,

    requestedAt:
      input.requestedAt,

    receivedAt:
      input.receivedAt,

    durationMilliseconds:
      input.durationMilliseconds,

    cached: false,
    retryCount: 0,

    ...(input.providerTimestamp ===
    undefined
      ? {}
      : {
          providerTimestamp:
            input.providerTimestamp,
        }),
  });
}

function createHealthMetrics(
  state:
    MutableHealthState,
): MarketDataProviderHealthMetrics {
  return Object.freeze({
    requestsTotal:
      state.requestsTotal,

    requestsSuccessful:
      state.requestsSuccessful,

    requestsFailed:
      state.requestsFailed,

    consecutiveFailures:
      state.consecutiveFailures,

    averageLatencyMilliseconds:
      state.requestsSuccessful === 0
        ? 0
        : state
            .totalLatencyMilliseconds /
          state.requestsSuccessful,

    ...(state
      .lastLatencyMilliseconds ===
    undefined
      ? {}
      : {
          lastLatencyMilliseconds:
            state
              .lastLatencyMilliseconds,
        }),

    activeSubscriptions:
      state.activeSubscriptions,
  });
}

function deriveHealthStatus(
  providerStatus:
    MarketDataProviderStatus,
  state:
    MutableHealthState,
): MarketDataProviderHealth["status"] {
  if (
    providerStatus ===
      "UNAVAILABLE" ||
    providerStatus ===
      "STOPPED"
  ) {
    return "UNHEALTHY";
  }

  if (
    providerStatus ===
      "INITIALIZING"
  ) {
    return "UNKNOWN";
  }

  if (
    providerStatus ===
      "DEGRADED" ||
    state.consecutiveFailures > 0
  ) {
    return "DEGRADED";
  }

  return "HEALTHY";
}

function createHealthMessage(
  providerStatus:
    MarketDataProviderStatus,
  healthStatus:
    MarketDataProviderHealth["status"],
): string {
  return [
    `Provider status: ${providerStatus}.`,
    `Health status: ${healthStatus}.`,
  ].join(" ");
}

function freezeDescriptor(
  descriptor:
    MarketDataProviderDescriptor,
  status:
    MarketDataProviderStatus =
      descriptor.status,
): MarketDataProviderDescriptor {
  return Object.freeze({
    id: descriptor.id,

    exchange:
      descriptor.exchange,

    name:
      descriptor.name,

    ...(descriptor.description ===
    undefined
      ? {}
      : {
          description:
            descriptor.description,
        }),

    version:
      descriptor.version,

    status,

    capabilities:
      freezeCapabilities(
        descriptor.capabilities,
      ),

    configuration:
      freezeConfiguration(
        descriptor.configuration,
      ),
  });
}

function freezeCapabilities(
  capabilities:
    MarketDataProviderCapabilities,
): MarketDataProviderCapabilities {
  return Object.freeze({
    providerId:
      capabilities.providerId,

    exchange:
      capabilities.exchange,

    capabilities:
      Object.freeze([
        ...capabilities.capabilities,
      ]),

    marketTypes:
      Object.freeze([
        ...capabilities.marketTypes,
      ]),

    timeframes:
      Object.freeze([
        ...capabilities.timeframes,
      ]),

    supportsPublicAccess:
      capabilities.supportsPublicAccess,

    supportsAuthenticatedAccess:
      capabilities
        .supportsAuthenticatedAccess,

    supportsStreaming:
      capabilities.supportsStreaming,

    supportsHistoricalData:
      capabilities
        .supportsHistoricalData,

    ...(capabilities
      .maximumHistoricalCandlesPerRequest ===
    undefined
      ? {}
      : {
          maximumHistoricalCandlesPerRequest:
            capabilities
              .maximumHistoricalCandlesPerRequest,
        }),

    ...(capabilities
      .maximumOrderBookDepth ===
    undefined
      ? {}
      : {
          maximumOrderBookDepth:
            capabilities
              .maximumOrderBookDepth,
        }),
  });
}

function freezeConfiguration(
  configuration:
    MarketDataProviderConfiguration,
): MarketDataProviderConfiguration {
  return Object.freeze({
    providerId:
      configuration.providerId,

    exchange:
      configuration.exchange,

    enabled:
      configuration.enabled,

    ...(configuration.baseUrl ===
    undefined
      ? {}
      : {
          baseUrl:
            configuration.baseUrl,
        }),

    ...(configuration.streamUrl ===
    undefined
      ? {}
      : {
          streamUrl:
            configuration.streamUrl,
        }),

    requestTimeoutMilliseconds:
      configuration
        .requestTimeoutMilliseconds,

    maximumRetries:
      configuration.maximumRetries,

    retryBaseDelayMilliseconds:
      configuration
        .retryBaseDelayMilliseconds,

    retryMaximumDelayMilliseconds:
      configuration
        .retryMaximumDelayMilliseconds,

    ...(configuration
      .requestsPerSecond ===
    undefined
      ? {}
      : {
          requestsPerSecond:
            configuration
              .requestsPerSecond,
        }),

    ...(configuration
      .requestsPerMinute ===
    undefined
      ? {}
      : {
          requestsPerMinute:
            configuration
              .requestsPerMinute,
        }),

    cacheEnabled:
      configuration.cacheEnabled,

    ...(configuration
      .cacheTtlMilliseconds ===
    undefined
      ? {}
      : {
          cacheTtlMilliseconds:
            configuration
              .cacheTtlMilliseconds,
        }),

    ...(configuration.attributes ===
    undefined
      ? {}
      : {
          attributes:
            Object.freeze({
              ...configuration.attributes,
            }),
        }),
  });
}

function freezeHealth(
  health:
    MarketDataProviderHealth,
): MarketDataProviderHealth {
  return Object.freeze({
    providerId:
      health.providerId,

    exchange:
      health.exchange,

    status:
      health.status,

    checkedAt:
      health.checkedAt,

    ...(health
      .lastSuccessfulRequestAt ===
    undefined
      ? {}
      : {
          lastSuccessfulRequestAt:
            health
              .lastSuccessfulRequestAt,
        }),

    ...(health.lastFailedRequestAt ===
    undefined
      ? {}
      : {
          lastFailedRequestAt:
            health
              .lastFailedRequestAt,
        }),

    ...(health.message === undefined
      ? {}
      : {
          message:
            health.message,
        }),

    metrics:
      Object.freeze({
        ...health.metrics,
      }),
  });
}

function freezeTicker(
  ticker:
    MarketDataTicker,
): MarketDataTicker {
  return Object.freeze({
    symbol:
      ticker.symbol,

    lastPrice:
      ticker.lastPrice,

    ...(ticker.bidPrice === undefined
      ? {}
      : {
          bidPrice:
            ticker.bidPrice,
        }),

    ...(ticker.askPrice === undefined
      ? {}
      : {
          askPrice:
            ticker.askPrice,
        }),

    ...(ticker.openPrice24h ===
    undefined
      ? {}
      : {
          openPrice24h:
            ticker.openPrice24h,
        }),

    ...(ticker.highPrice24h ===
    undefined
      ? {}
      : {
          highPrice24h:
            ticker.highPrice24h,
        }),

    ...(ticker.lowPrice24h ===
    undefined
      ? {}
      : {
          lowPrice24h:
            ticker.lowPrice24h,
        }),

    ...(ticker.baseVolume24h ===
    undefined
      ? {}
      : {
          baseVolume24h:
            ticker.baseVolume24h,
        }),

    ...(ticker.quoteVolume24h ===
    undefined
      ? {}
      : {
          quoteVolume24h:
            ticker.quoteVolume24h,
        }),

    ...(ticker.priceChange24h ===
    undefined
      ? {}
      : {
          priceChange24h:
            ticker.priceChange24h,
        }),

    ...(ticker
      .priceChangePercentage24h ===
    undefined
      ? {}
      : {
          priceChangePercentage24h:
            ticker
              .priceChangePercentage24h,
        }),

    timestamp:
      ticker.timestamp,
  });
}

function freezeOrderBook(
  orderBook:
    MarketDataOrderBook,
): MarketDataOrderBook {
  return Object.freeze({
    symbol:
      orderBook.symbol,

    bids:
      Object.freeze(
        orderBook.bids.map(
          (level) =>
            Object.freeze({
              price:
                level.price,

              quantity:
                level.quantity,
            }),
        ),
      ),

    asks:
      Object.freeze(
        orderBook.asks.map(
          (level) =>
            Object.freeze({
              price:
                level.price,

              quantity:
                level.quantity,
            }),
        ),
      ),

    ...(orderBook.sequence ===
    undefined
      ? {}
      : {
          sequence:
            orderBook.sequence,
        }),

    timestamp:
      orderBook.timestamp,
  });
}

function freezeTrade(
  trade:
    MarketDataTrade,
): MarketDataTrade {
  return Object.freeze({
    id:
      trade.id,

    symbol:
      trade.symbol,

    side:
      trade.side,

    price:
      trade.price,

    quantity:
      trade.quantity,

    timestamp:
      trade.timestamp,

    ...(trade.isBuyerMaker ===
    undefined
      ? {}
      : {
          isBuyerMaker:
            trade.isBuyerMaker,
        }),
  });
}

function freezeMarket(
  market:
    MarketDataMarket,
): MarketDataMarket {
  return Object.freeze({
    exchange:
      market.exchange,

    marketType:
      market.marketType,

    symbol:
      market.symbol,

    nativeSymbol:
      market.nativeSymbol,

    baseAsset:
      market.baseAsset,

    quoteAsset:
      market.quoteAsset,

    status:
      market.status,

    ...(market.pricePrecision ===
    undefined
      ? {}
      : {
          pricePrecision:
            market.pricePrecision,
        }),

    ...(market.quantityPrecision ===
    undefined
      ? {}
      : {
          quantityPrecision:
            market.quantityPrecision,
        }),

    ...(market.minimumQuantity ===
    undefined
      ? {}
      : {
          minimumQuantity:
            market.minimumQuantity,
        }),

    ...(market.maximumQuantity ===
    undefined
      ? {}
      : {
          maximumQuantity:
            market.maximumQuantity,
        }),

    ...(market.minimumNotional ===
    undefined
      ? {}
      : {
          minimumNotional:
            market.minimumNotional,
        }),

    supportedTimeframes:
      Object.freeze([
        ...market.supportedTimeframes,
      ]),

    ...(market.attributes ===
    undefined
      ? {}
      : {
          attributes:
            Object.freeze({
              ...market.attributes,
            }),
        }),
  });
}

function createStreamEvent<TData>(
  event:
    MarketDataStreamEvent<TData>,
): MarketDataStreamEvent<TData> {
  return Object.freeze({
    subscriptionId:
      event.subscriptionId,

    providerId:
      event.providerId,

    exchange:
      event.exchange,

    type:
      event.type,

    timestamp:
      event.timestamp,

    ...(event.data === undefined
      ? {}
      : {
          data:
            event.data,
        }),

    ...(event.error === undefined
      ? {}
      : {
          error:
            Object.freeze({
              ...event.error,
            }),
        }),
  });
}

function createTickerMap(
  tickers:
    readonly MarketDataTicker[],
): ReadonlyMap<
  MarketDataSymbol,
  MarketDataTicker
> {
  const map =
    new Map<
      MarketDataSymbol,
      MarketDataTicker
    >();

  for (const ticker of tickers) {
    map.set(
      ticker.symbol,
      freezeTicker(ticker),
    );
  }

  return map;
}

function createCandleMap(
  source:
    Readonly<
      Record<
        string,
        readonly MarketDataCandle[]
      >
    >,
): ReadonlyMap<
  string,
  readonly MarketDataCandle[]
> {
  const map =
    new Map<
      string,
      readonly MarketDataCandle[]
    >();

  for (
    const [key, candles] of
      Object.entries(source)
  ) {
    const normalized =
      Object.freeze(
        candles
          .map(
            freezeMarketDataCandle,
          )
          .sort(compareCandles),
      );

    map.set(
      key,
      normalized,
    );
  }

  return map;
}

function createOrderBookMap(
  source:
    Readonly<
      Record<
        string,
        MarketDataOrderBook
      >
    >,
): ReadonlyMap<
  MarketDataSymbol,
  MarketDataOrderBook
> {
  const map =
    new Map<
      MarketDataSymbol,
      MarketDataOrderBook
    >();

  for (
    const orderBook of
      Object.values(source)
  ) {
    map.set(
      orderBook.symbol,
      freezeOrderBook(
        orderBook,
      ),
    );
  }

  return map;
}

function createTradeMap(
  source:
    Readonly<
      Record<
        string,
        readonly MarketDataTrade[]
      >
    >,
): ReadonlyMap<
  MarketDataSymbol,
  readonly MarketDataTrade[]
> {
  const map =
    new Map<
      MarketDataSymbol,
      readonly MarketDataTrade[]
    >();

  for (
    const trades of
      Object.values(source)
  ) {
    const symbol =
      trades[0]?.symbol;

    if (symbol === undefined) {
      continue;
    }

    map.set(
      symbol,
      Object.freeze(
        trades
          .map(freezeTrade)
          .sort(compareTrades),
      ),
    );
  }

  return map;
}

function createTickerStreamMap(
  source:
    Readonly<
      Record<
        string,
        readonly MarketDataTicker[]
      >
    >,
): ReadonlyMap<
  MarketDataSymbol,
  readonly MarketDataTicker[]
> {
  const map =
    new Map<
      MarketDataSymbol,
      readonly MarketDataTicker[]
    >();

  for (
    const tickers of
      Object.values(source)
  ) {
    const symbol =
      tickers[0]?.symbol;

    if (symbol === undefined) {
      continue;
    }

    map.set(
      symbol,
      Object.freeze(
        tickers
          .map(freezeTicker)
          .sort(compareTickersByTime),
      ),
    );
  }

  return map;
}

function createOrderBookStreamMap(
  source:
    Readonly<
      Record<
        string,
        readonly MarketDataOrderBook[]
      >
    >,
): ReadonlyMap<
  MarketDataSymbol,
  readonly MarketDataOrderBook[]
> {
  const map =
    new Map<
      MarketDataSymbol,
      readonly MarketDataOrderBook[]
    >();

  for (
    const orderBooks of
      Object.values(source)
  ) {
    const symbol =
      orderBooks[0]?.symbol;

    if (symbol === undefined) {
      continue;
    }

    map.set(
      symbol,
      Object.freeze(
        orderBooks
          .map(freezeOrderBook)
          .sort(compareOrderBooks),
      ),
    );
  }

  return map;
}

function createTradeStreamMap(
  source:
    Readonly<
      Record<
        string,
        readonly MarketDataTrade[]
      >
    >,
): ReadonlyMap<
  MarketDataSymbol,
  readonly MarketDataTrade[]
> {
  return createTradeMap(source);
}

function compareCandles(
  left:
    MarketDataCandle,
  right:
    MarketDataCandle,
): number {
  return (
    Number(left.openTime) -
    Number(right.openTime)
  );
}

function compareTickers(
  left:
    MarketDataTicker,
  right:
    MarketDataTicker,
): number {
  return String(
    left.symbol,
  ).localeCompare(
    String(right.symbol),
  );
}

function compareTickersByTime(
  left:
    MarketDataTicker,
  right:
    MarketDataTicker,
): number {
  return (
    Number(left.timestamp) -
    Number(right.timestamp)
  );
}

function compareTrades(
  left:
    MarketDataTrade,
  right:
    MarketDataTrade,
): number {
  return (
    Number(left.timestamp) -
    Number(right.timestamp)
  );
}

function compareOrderBooks(
  left:
    MarketDataOrderBook,
  right:
    MarketDataOrderBook,
): number {
  return (
    Number(left.timestamp) -
    Number(right.timestamp)
  );
}

function compareMarkets(
  left:
    MarketDataMarket,
  right:
    MarketDataMarket,
): number {
  return String(
    left.symbol,
  ).localeCompare(
    String(right.symbol),
  );
}