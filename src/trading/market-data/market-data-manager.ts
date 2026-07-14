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
  MarketDataProviderCapability,
  MarketDataProviderHealth,
  MarketDataProviderId,
  MarketDataRecentTradesRequest,
  MarketDataResponse,
  MarketDataSymbolRequest,
  MarketDataTicker,
  MarketDataTickerStreamRequest,
  MarketDataTickersRequest,
  MarketDataTrade,
  MarketDataTradeStreamRequest,
} from "./market-data-provider.types";

import {
  MarketDataProvider,
  MarketDataProviderRegistry,
  MarketDataProviderSelectionCriteria,
  MarketDataStreamSubscription,
} from "./market-data-provider";

/**
 * Supported market-data manager operations.
 */
export const MARKET_DATA_MANAGER_OPERATIONS = [
  "GET_TICKER",
  "GET_TICKERS",
  "GET_ORDER_BOOK",
  "GET_RECENT_TRADES",
  "GET_HISTORICAL_CANDLES",
  "DISCOVER_MARKETS",
  "GET_SERVER_TIME",
  "SUBSCRIBE_CANDLES",
  "SUBSCRIBE_TICKER",
  "SUBSCRIBE_ORDER_BOOK",
  "SUBSCRIBE_TRADES",
] as const;

export type MarketDataManagerOperation =
  (typeof MARKET_DATA_MANAGER_OPERATIONS)[number];

/**
 * Provider selection policy.
 */
export interface MarketDataManagerSelectionPolicy {
  /**
   * Preferred provider identifiers in priority order.
   */
  readonly preferredProviderIds?:
    readonly MarketDataProviderId[];

  /**
   * Permit DEGRADED providers.
   *
   * Default: true.
   */
  readonly includeDegraded?: boolean;

  /**
   * Permit providers without a completed health check.
   *
   * Default: true.
   */
  readonly includeUnknownHealth?: boolean;

  /**
   * Attempt a fallback provider when the selected provider fails with a
   * retryable or availability-related error.
   *
   * Default: true.
   */
  readonly enableFailover?: boolean;

  /**
   * Maximum number of providers attempted for one operation.
   *
   * Default: all eligible providers.
   */
  readonly maximumProviderAttempts?: number;
}

/**
 * Base manager request options.
 */
export interface MarketDataManagerRequestOptions {
  /**
   * Explicit provider override.
   *
   * When supplied, only this provider is used and automatic failover is
   * disabled unless allowExplicitProviderFailover is true.
   */
  readonly providerId?:
    MarketDataProviderId;

  /**
   * Permit failover after an explicitly selected provider fails.
   *
   * Default: false.
   */
  readonly allowExplicitProviderFailover?: boolean;

  readonly selectionPolicy?:
    MarketDataManagerSelectionPolicy;
}

/**
 * Manager request execution metadata.
 */
export interface MarketDataManagerExecutionMetadata {
  readonly operation:
    MarketDataManagerOperation;

  readonly selectedProviderId:
    MarketDataProviderId;

  readonly attemptedProviderIds:
    readonly MarketDataProviderId[];

  readonly failoverOccurred:
    boolean;
}

/**
 * Manager response.
 */
export interface MarketDataManagerResponse<TData> {
  readonly response:
    MarketDataResponse<TData>;

  readonly execution:
    MarketDataManagerExecutionMetadata;
}

/**
 * Manager stream response.
 */
export interface MarketDataManagerSubscription<TData> {
  readonly subscription:
    MarketDataStreamSubscription<TData>;

  readonly execution:
    MarketDataManagerExecutionMetadata;
}

/**
 * Provider attempt failure.
 */
export interface MarketDataManagerProviderFailure {
  readonly providerId:
    MarketDataProviderId;

  readonly error:
    unknown;
}

/**
 * Aggregated manager failure.
 */
export class MarketDataManagerError extends MarketDataError {
  public readonly operation:
    MarketDataManagerOperation;

  public readonly failures:
    readonly MarketDataManagerProviderFailure[];

  public constructor(
    operation:
      MarketDataManagerOperation,
    message: string,
    failures:
      readonly MarketDataManagerProviderFailure[],
    options: Readonly<{
      providerId?:
        MarketDataProviderId;

      retryable?:
        boolean;

      cause?:
        unknown;
    }> = {},
  ) {
    super(
      "PROVIDER_UNAVAILABLE",
      message,
      {
        providerId:
          options.providerId,

        retryable:
          options.retryable ?? true,

        cause:
          options.cause,
      },
    );

    this.name =
      "MarketDataManagerError";

    this.operation =
      operation;

    this.failures =
      Object.freeze(
        failures.map(
          freezeProviderFailure,
        ),
      );

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/**
 * Market-data manager configuration.
 */
export interface MarketDataManagerConfiguration {
  readonly defaultSelectionPolicy?:
    MarketDataManagerSelectionPolicy;
}

/**
 * Unified market-data orchestration contract.
 */
export interface MarketDataManager {
  getTicker(
    request:
      MarketDataSymbolRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      MarketDataTicker
    >
  >;

  getTickers(
    request:
      MarketDataTickersRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataTicker[]
    >
  >;

  getOrderBook(
    request:
      MarketDataOrderBookRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      MarketDataOrderBook
    >
  >;

  getRecentTrades(
    request:
      MarketDataRecentTradesRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataTrade[]
    >
  >;

  getHistoricalCandles(
    request:
      MarketDataHistoricalCandlesRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataCandle[]
    >
  >;

  discoverMarkets(
    request:
      MarketDataMarketDiscoveryRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataMarket[]
    >
  >;

  getServerTime(
    request:
      MarketDataSymbolRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerResponse<
      number
    >
  >;

  subscribeCandles(
    request:
      MarketDataCandleStreamRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataCandle
    >
  >;

  subscribeTicker(
    request:
      MarketDataTickerStreamRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataTicker
    >
  >;

  subscribeOrderBook(
    request:
      MarketDataOrderBookStreamRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataOrderBook
    >
  >;

  subscribeTrades(
    request:
      MarketDataTradeStreamRequest,
    options?:
      MarketDataManagerRequestOptions,
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataTrade
    >
  >;

  getEligibleProviders(
    criteria:
      MarketDataProviderSelectionCriteria,
    policy?:
      MarketDataManagerSelectionPolicy,
  ): readonly MarketDataProvider[];
}

/**
 * Default unified market-data manager.
 */
export class DefaultMarketDataManager
  implements MarketDataManager
{
  private readonly registry:
    MarketDataProviderRegistry;

  private readonly defaultSelectionPolicy:
    Required<
      Pick<
        MarketDataManagerSelectionPolicy,
        | "includeDegraded"
        | "includeUnknownHealth"
        | "enableFailover"
      >
    > &
      Readonly<{
        preferredProviderIds:
          readonly MarketDataProviderId[];

        maximumProviderAttempts?:
          number;
      }>;

  public constructor(
    registry:
      MarketDataProviderRegistry,
    configuration:
      MarketDataManagerConfiguration = {},
  ) {
    this.registry =
      registry;

    this.defaultSelectionPolicy =
      normalizeSelectionPolicy(
        configuration
          .defaultSelectionPolicy,
      );
  }

  public async getTicker(
    request:
      MarketDataSymbolRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      MarketDataTicker
    >
  > {
    return this.executeRequest(
      "GET_TICKER",
      "TICKER",
      request,
      options,
      (provider) =>
        provider.getTicker(
          request,
        ),
    );
  }

  public async getTickers(
    request:
      MarketDataTickersRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataTicker[]
    >
  > {
    return this.executeRequest(
      "GET_TICKERS",
      "TICKERS",
      request,
      options,
      (provider) =>
        provider.getTickers(
          request,
        ),
    );
  }

  public async getOrderBook(
    request:
      MarketDataOrderBookRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      MarketDataOrderBook
    >
  > {
    return this.executeRequest(
      "GET_ORDER_BOOK",
      "ORDER_BOOK",
      request,
      options,
      (provider) =>
        provider.getOrderBook(
          request,
        ),
    );
  }

  public async getRecentTrades(
    request:
      MarketDataRecentTradesRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataTrade[]
    >
  > {
    return this.executeRequest(
      "GET_RECENT_TRADES",
      "RECENT_TRADES",
      request,
      options,
      (provider) =>
        provider.getRecentTrades(
          request,
        ),
    );
  }

  public async getHistoricalCandles(
    request:
      MarketDataHistoricalCandlesRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataCandle[]
    >
  > {
    return this.executeRequest(
      "GET_HISTORICAL_CANDLES",
      "HISTORICAL_CANDLES",
      request,
      options,
      (provider) =>
        provider
          .getHistoricalCandles(
            request,
          ),
    );
  }

  public async discoverMarkets(
    request:
      MarketDataMarketDiscoveryRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      readonly MarketDataMarket[]
    >
  > {
    return this.executeRequest(
      "DISCOVER_MARKETS",
      "MARKET_DISCOVERY",
      request,
      options,
      (provider) =>
        provider.discoverMarkets(
          request,
        ),
    );
  }

  public async getServerTime(
    request:
      MarketDataSymbolRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerResponse<
      number
    >
  > {
    return this.executeRequest(
      "GET_SERVER_TIME",
      "SERVER_TIME",
      request,
      options,
      (provider) =>
        provider.getServerTime(
          request,
        ),
    );
  }

  public async subscribeCandles(
    request:
      MarketDataCandleStreamRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataCandle
    >
  > {
    return this.executeSubscription(
      "SUBSCRIBE_CANDLES",
      "LIVE_CANDLES",
      request,
      options,
      (provider) =>
        provider.subscribeCandles(
          request,
        ),
    );
  }

  public async subscribeTicker(
    request:
      MarketDataTickerStreamRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataTicker
    >
  > {
    return this.executeSubscription(
      "SUBSCRIBE_TICKER",
      "LIVE_TICKER",
      request,
      options,
      (provider) =>
        provider.subscribeTicker(
          request,
        ),
    );
  }

  public async subscribeOrderBook(
    request:
      MarketDataOrderBookStreamRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataOrderBook
    >
  > {
    return this.executeSubscription(
      "SUBSCRIBE_ORDER_BOOK",
      "LIVE_ORDER_BOOK",
      request,
      options,
      (provider) =>
        provider
          .subscribeOrderBook(
            request,
          ),
    );
  }

  public async subscribeTrades(
    request:
      MarketDataTradeStreamRequest,
    options:
      MarketDataManagerRequestOptions = {},
  ): Promise<
    MarketDataManagerSubscription<
      MarketDataTrade
    >
  > {
    return this.executeSubscription(
      "SUBSCRIBE_TRADES",
      "LIVE_TRADES",
      request,
      options,
      (provider) =>
        provider.subscribeTrades(
          request,
        ),
    );
  }

  public getEligibleProviders(
    criteria:
      MarketDataProviderSelectionCriteria,
    policy:
      MarketDataManagerSelectionPolicy = {},
  ): readonly MarketDataProvider[] {
    const normalizedPolicy =
      mergeSelectionPolicies(
        this.defaultSelectionPolicy,
        policy,
      );

    const providers =
      this.registry
        .list()
        .filter(
          (provider) =>
            matchesSelectionCriteria(
              provider,
              criteria,
              normalizedPolicy,
            ),
        )
        .sort(
          createProviderComparator(
            normalizedPolicy
              .preferredProviderIds,
          ),
        );

    return Object.freeze(
      providers,
    );
  }

  private async executeRequest<
    TRequest extends {
      readonly exchange:
        Parameters<
          MarketDataProvider[
            "getTicker"
          ]
        >[0]["exchange"];

      readonly marketType:
        Parameters<
          MarketDataProvider[
            "getTicker"
          ]
        >[0]["marketType"];
    },
    TResult,
  >(
    operation:
      MarketDataManagerOperation,
    capability:
      MarketDataProviderCapability,
    request:
      TRequest,
    options:
      MarketDataManagerRequestOptions,
    execute:
      (
        provider:
          MarketDataProvider,
      ) => Promise<
        MarketDataResponse<TResult>
      >,
  ): Promise<
    MarketDataManagerResponse<TResult>
  > {
    const candidates =
      this.resolveCandidates(
        capability,
        request,
        options,
      );

    const failures:
      MarketDataManagerProviderFailure[] =
        [];

    const attemptedProviderIds:
      MarketDataProviderId[] =
        [];

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      const provider =
        candidates[index];

      if (provider === undefined) {
        continue;
      }

      attemptedProviderIds.push(
        provider.getId(),
      );

      try {
        const response =
          await execute(
            provider,
          );

        return Object.freeze({
          response,

          execution:
            createExecutionMetadata({
              operation,

              selectedProviderId:
                provider.getId(),

              attemptedProviderIds,

              failoverOccurred:
                index > 0,
            }),
        });
      } catch (error: unknown) {
        failures.push(
          Object.freeze({
            providerId:
              provider.getId(),

            error,
          }),
        );

        if (
          !this.shouldContinueFailover(
            error,
            index,
            candidates.length,
            options,
          )
        ) {
          throw normalizeManagerFailure(
            operation,
            failures,
            error,
          );
        }
      }
    }

    throw createNoProviderError(
      operation,
      capability,
      failures,
      options.providerId,
    );
  }

  private async executeSubscription<
    TRequest extends {
      readonly exchange:
        Parameters<
          MarketDataProvider[
            "getTicker"
          ]
        >[0]["exchange"];

      readonly marketType:
        Parameters<
          MarketDataProvider[
            "getTicker"
          ]
        >[0]["marketType"];
    },
    TResult,
  >(
    operation:
      MarketDataManagerOperation,
    capability:
      MarketDataProviderCapability,
    request:
      TRequest,
    options:
      MarketDataManagerRequestOptions,
    execute:
      (
        provider:
          MarketDataProvider,
      ) => Promise<
        MarketDataStreamSubscription<TResult>
      >,
  ): Promise<
    MarketDataManagerSubscription<TResult>
  > {
    const candidates =
      this.resolveCandidates(
        capability,
        request,
        options,
      );

    const failures:
      MarketDataManagerProviderFailure[] =
        [];

    const attemptedProviderIds:
      MarketDataProviderId[] =
        [];

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      const provider =
        candidates[index];

      if (provider === undefined) {
        continue;
      }

      attemptedProviderIds.push(
        provider.getId(),
      );

      try {
        const subscription =
          await execute(
            provider,
          );

        return Object.freeze({
          subscription,

          execution:
            createExecutionMetadata({
              operation,

              selectedProviderId:
                provider.getId(),

              attemptedProviderIds,

              failoverOccurred:
                index > 0,
            }),
        });
      } catch (error: unknown) {
        failures.push(
          Object.freeze({
            providerId:
              provider.getId(),

            error,
          }),
        );

        if (
          !this.shouldContinueFailover(
            error,
            index,
            candidates.length,
            options,
          )
        ) {
          throw normalizeManagerFailure(
            operation,
            failures,
            error,
          );
        }
      }
    }

    throw createNoProviderError(
      operation,
      capability,
      failures,
      options.providerId,
    );
  }

  private resolveCandidates(
    capability:
      MarketDataProviderCapability,
    request: Readonly<{
      readonly exchange:
        Parameters<
          MarketDataProvider[
            "getTicker"
          ]
        >[0]["exchange"];

      readonly marketType:
        Parameters<
          MarketDataProvider[
            "getTicker"
          ]
        >[0]["marketType"];
    }>,
    options:
      MarketDataManagerRequestOptions,
  ): readonly MarketDataProvider[] {
    const normalizedPolicy =
      mergeSelectionPolicies(
        this.defaultSelectionPolicy,
        options.selectionPolicy,
      );

    let candidates =
      this.getEligibleProviders(
        {
          capability,

          exchange:
            request.exchange,

          marketType:
            request.marketType,

          requireStreaming:
            capability.startsWith(
              "LIVE_",
            ),

          requireHistoricalData:
            capability ===
            "HISTORICAL_CANDLES",

          includeDegraded:
            normalizedPolicy
              .includeDegraded,
        },
        normalizedPolicy,
      );

    if (
      options.providerId !==
      undefined
    ) {
      const explicitProvider =
        this.registry.require({
          providerId:
            options.providerId,
        });

      if (
        !candidates.includes(
          explicitProvider,
        )
      ) {
        throw new MarketDataError(
          "UNSUPPORTED_CAPABILITY",
          [
            `Explicit provider "${options.providerId}"`,
            `is not eligible for capability "${capability}".`,
          ].join(" "),
          {
            providerId:
              options.providerId,

            exchange:
              explicitProvider
                .getDescriptor()
                .exchange,
          },
        );
      }

      if (
        options
          .allowExplicitProviderFailover ===
        true
      ) {
        candidates =
          Object.freeze([
            explicitProvider,

            ...candidates.filter(
              (provider) =>
                provider !==
                explicitProvider,
            ),
          ]);
      } else {
        candidates =
          Object.freeze([
            explicitProvider,
          ]);
      }
    }

    const maximumAttempts =
      normalizedPolicy
        .maximumProviderAttempts;

    if (
      maximumAttempts !== undefined
    ) {
      candidates =
        Object.freeze(
          candidates.slice(
            0,
            maximumAttempts,
          ),
        );
    }

    if (
      candidates.length === 0
    ) {
      throw createNoProviderError(
        operationForCapability(
          capability,
        ),
        capability,
        [],
        options.providerId,
      );
    }

    return candidates;
  }

  private shouldContinueFailover(
    error: unknown,
    currentIndex: number,
    candidateCount: number,
    options:
      MarketDataManagerRequestOptions,
  ): boolean {
    if (
      currentIndex >=
      candidateCount - 1
    ) {
      return false;
    }

    const policy =
      mergeSelectionPolicies(
        this.defaultSelectionPolicy,
        options.selectionPolicy,
      );

    if (
      options.providerId !==
        undefined &&
      options
        .allowExplicitProviderFailover !==
        true
    ) {
      return false;
    }

    if (!policy.enableFailover) {
      return false;
    }

    return isFailoverEligibleError(
      error,
    );
  }
}

/**
 * Determines whether a provider matches selection criteria.
 */
function matchesSelectionCriteria(
  provider:
    MarketDataProvider,
  criteria:
    MarketDataProviderSelectionCriteria,
  policy:
    ReturnType<
      typeof normalizeSelectionPolicy
    >,
): boolean {
  const descriptor =
    provider.getDescriptor();

  const capabilities =
    provider.getCapabilities();

  const status =
    provider.getStatus();

  if (
    status !== "READY" &&
    !(
      policy.includeDegraded &&
      status === "DEGRADED"
    )
  ) {
    return false;
  }

  if (
    criteria.exchange !==
      undefined &&
    descriptor.exchange !==
      criteria.exchange
  ) {
    return false;
  }

  if (
    criteria.capability !==
      undefined &&
    !capabilities.capabilities.includes(
      criteria.capability,
    )
  ) {
    return false;
  }

  if (
    criteria.marketType !==
      undefined &&
    !capabilities.marketTypes.includes(
      criteria.marketType,
    )
  ) {
    return false;
  }

  if (
    criteria.requireStreaming ===
      true &&
    !capabilities.supportsStreaming
  ) {
    return false;
  }

  if (
    criteria
      .requireHistoricalData ===
      true &&
    !capabilities
      .supportsHistoricalData
  ) {
    return false;
  }

  if (
    criteria
      .requirePublicAccess ===
      true &&
    !capabilities
      .supportsPublicAccess
  ) {
    return false;
  }

  if (
    criteria
      .requireAuthenticatedAccess ===
      true &&
    !capabilities
      .supportsAuthenticatedAccess
  ) {
    return false;
  }

  const health =
    provider.getLastHealth();

  if (
    health === undefined
  ) {
    return policy
      .includeUnknownHealth;
  }

  if (
    health.status ===
      "UNHEALTHY"
  ) {
    return false;
  }

  if (
    health.status ===
      "DEGRADED" &&
    !policy.includeDegraded
  ) {
    return false;
  }

  return true;
}

/**
 * Creates deterministic provider ordering.
 */
function createProviderComparator(
  preferredProviderIds:
    readonly MarketDataProviderId[],
): (
  left:
    MarketDataProvider,
  right:
    MarketDataProvider,
) => number {
  const priority =
    new Map<
      MarketDataProviderId,
      number
    >();

  preferredProviderIds.forEach(
    (
      providerId,
      index,
    ) => {
      if (
        !priority.has(
          providerId,
        )
      ) {
        priority.set(
          providerId,
          index,
        );
      }
    },
  );

  return (
    left:
      MarketDataProvider,
    right:
      MarketDataProvider,
  ): number => {
    const leftPriority =
      priority.get(
        left.getId(),
      );

    const rightPriority =
      priority.get(
        right.getId(),
      );

    if (
      leftPriority !==
        undefined ||
      rightPriority !==
        undefined
    ) {
      if (
        leftPriority ===
        undefined
      ) {
        return 1;
      }

      if (
        rightPriority ===
        undefined
      ) {
        return -1;
      }

      if (
        leftPriority !==
        rightPriority
      ) {
        return (
          leftPriority -
          rightPriority
        );
      }
    }

    return String(
      left.getId(),
    ).localeCompare(
      String(
        right.getId(),
      ),
    );
  };
}

/**
 * Normalizes selection policy defaults.
 */
function normalizeSelectionPolicy(
  policy:
    MarketDataManagerSelectionPolicy =
      {},
): Required<
  Pick<
    MarketDataManagerSelectionPolicy,
    | "includeDegraded"
    | "includeUnknownHealth"
    | "enableFailover"
  >
> &
  Readonly<{
    preferredProviderIds:
      readonly MarketDataProviderId[];

    maximumProviderAttempts?:
      number;
  }> {
  validateMaximumProviderAttempts(
    policy.maximumProviderAttempts,
  );

  return Object.freeze({
    preferredProviderIds:
      Object.freeze([
        ...(
          policy
            .preferredProviderIds ??
          []
        ),
      ]),

    includeDegraded:
      policy.includeDegraded ??
      true,

    includeUnknownHealth:
      policy
        .includeUnknownHealth ??
      true,

    enableFailover:
      policy.enableFailover ??
      true,

    ...(policy
      .maximumProviderAttempts ===
    undefined
      ? {}
      : {
          maximumProviderAttempts:
            policy
              .maximumProviderAttempts,
        }),
  });
}

/**
 * Merges default and request policies.
 */
function mergeSelectionPolicies(
  defaults:
    ReturnType<
      typeof normalizeSelectionPolicy
    >,
  override:
    MarketDataManagerSelectionPolicy =
      {},
): ReturnType<
  typeof normalizeSelectionPolicy
> {
  return normalizeSelectionPolicy({
    preferredProviderIds:
      override
        .preferredProviderIds ??
      defaults
        .preferredProviderIds,

    includeDegraded:
      override.includeDegraded ??
      defaults.includeDegraded,

    includeUnknownHealth:
      override
        .includeUnknownHealth ??
      defaults
        .includeUnknownHealth,

    enableFailover:
      override.enableFailover ??
      defaults.enableFailover,

    maximumProviderAttempts:
      override
        .maximumProviderAttempts ??
      defaults
        .maximumProviderAttempts,
  });
}

/**
 * Validates provider-attempt limit.
 */
function validateMaximumProviderAttempts(
  value:
    number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new MarketDataError(
      "INVALID_LIMIT",
      "Maximum provider attempts must be a positive safe integer.",
    );
  }
}

/**
 * Determines whether an error permits provider failover.
 */
function isFailoverEligibleError(
  error: unknown,
): boolean {
  if (
    error instanceof
    MarketDataError
  ) {
    if (error.retryable) {
      return true;
    }

    return [
      "PROVIDER_NOT_READY",
      "PROVIDER_UNAVAILABLE",
      "REQUEST_TIMEOUT",
      "CONNECTION_FAILED",
      "UPSTREAM_ERROR",
      "RATE_LIMITED",
      "STREAM_FAILED",
      "SUBSCRIPTION_FAILED",
      "HEALTH_CHECK_FAILED",
      "RETRY_EXHAUSTED",
    ].includes(
      error.code,
    );
  }

  return true;
}

/**
 * Converts provider failures into a manager failure.
 */
function normalizeManagerFailure(
  operation:
    MarketDataManagerOperation,
  failures:
    readonly MarketDataManagerProviderFailure[],
  finalError:
    unknown,
): Error {
  if (
    failures.length === 1 &&
    finalError instanceof
      MarketDataError
  ) {
    return finalError;
  }

  const lastFailure =
    failures[
      failures.length - 1
    ];

  return new MarketDataManagerError(
    operation,
    [
      `Market-data operation "${operation}" failed`,
      `after ${failures.length} provider attempt(s).`,
    ].join(" "),
    failures,
    {
      providerId:
        lastFailure
          ?.providerId,

      retryable:
        failures.some(
          (failure) =>
            isFailoverEligibleError(
              failure.error,
            ),
        ),

      cause:
        finalError,
    },
  );
}

/**
 * Creates an error when no provider is eligible.
 */
function createNoProviderError(
  operation:
    MarketDataManagerOperation,
  capability:
    MarketDataProviderCapability,
  failures:
    readonly MarketDataManagerProviderFailure[],
  explicitProviderId?:
    MarketDataProviderId,
): MarketDataManagerError {
  return new MarketDataManagerError(
    operation,
    explicitProviderId ===
    undefined
      ? [
          "No eligible market-data provider",
          `was found for capability "${capability}".`,
        ].join(" ")
      : [
          `Explicit market-data provider "${explicitProviderId}"`,
          `could not complete capability "${capability}".`,
        ].join(" "),
    failures,
    {
      providerId:
        explicitProviderId,

      retryable:
        true,

      cause:
        failures[
          failures.length - 1
        ]?.error,
    },
  );
}

/**
 * Creates immutable execution metadata.
 */
function createExecutionMetadata(
  input: Readonly<{
    operation:
      MarketDataManagerOperation;

    selectedProviderId:
      MarketDataProviderId;

    attemptedProviderIds:
      readonly MarketDataProviderId[];

    failoverOccurred:
      boolean;
  }>,
): MarketDataManagerExecutionMetadata {
  return Object.freeze({
    operation:
      input.operation,

    selectedProviderId:
      input.selectedProviderId,

    attemptedProviderIds:
      Object.freeze([
        ...input
          .attemptedProviderIds,
      ]),

    failoverOccurred:
      input.failoverOccurred,
  });
}

/**
 * Creates an immutable provider failure.
 */
function freezeProviderFailure(
  failure:
    MarketDataManagerProviderFailure,
): MarketDataManagerProviderFailure {
  return Object.freeze({
    providerId:
      failure.providerId,

    error:
      failure.error,
  });
}

/**
 * Provides a stable operation label for capability-only failures.
 */
function operationForCapability(
  capability:
    MarketDataProviderCapability,
): MarketDataManagerOperation {
  switch (capability) {
    case "TICKER":
      return "GET_TICKER";

    case "TICKERS":
      return "GET_TICKERS";

    case "ORDER_BOOK":
      return "GET_ORDER_BOOK";

    case "RECENT_TRADES":
      return "GET_RECENT_TRADES";

    case "HISTORICAL_CANDLES":
      return "GET_HISTORICAL_CANDLES";

    case "MARKET_DISCOVERY":
      return "DISCOVER_MARKETS";

    case "SERVER_TIME":
      return "GET_SERVER_TIME";

    case "LIVE_CANDLES":
      return "SUBSCRIBE_CANDLES";

    case "LIVE_TICKER":
      return "SUBSCRIBE_TICKER";

    case "LIVE_ORDER_BOOK":
      return "SUBSCRIBE_ORDER_BOOK";

    case "LIVE_TRADES":
      return "SUBSCRIBE_TRADES";

    default:
      return "GET_TICKER";
  }
}