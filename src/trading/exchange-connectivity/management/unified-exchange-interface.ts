/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/unified-exchange-interface.ts
 *
 * Purpose:
 * Defines the exchange-neutral contract used by discovery, routing, failover,
 * and higher-level trading services.
 *
 * Exchange-specific adapters may implement this interface directly or through
 * thin wrappers that translate normalized requests and responses into native
 * exchange API structures.
 */

import {
  normalizeExchangeRegistryId,
  type ExchangeRegistryId,
} from "./exchange-registry";

import type {
  ExchangeCapabilityProfile,
  ExchangeMarketType,
  ExchangePositionMode,
  ExchangeSupportedOrderType,
  ExchangeSupportedTimeInForce,
} from "./exchange-capability-registry";

import type {
  ConnectorHealthStatus,
  ManagedConnectorLifecycleAdapter,
} from "./connector-lifecycle.types";

/**
 * Supported normalized order sides.
 */
export type UnifiedExchangeOrderSide =
  | "BUY"
  | "SELL";

/**
 * Supported normalized position sides.
 */
export type UnifiedExchangePositionSide =
  | "LONG"
  | "SHORT"
  | "NET";

/**
 * Supported normalized order statuses.
 */
export type UnifiedExchangeOrderStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "UNKNOWN";

/**
 * Supported normalized execution types.
 */
export type UnifiedExchangeExecutionType =
  | "MAKER"
  | "TAKER"
  | "UNKNOWN";

/**
 * Stable unified-exchange error classifications.
 */
export type UnifiedExchangeErrorCode =
  | "INVALID_EXCHANGE_ID"
  | "INVALID_REQUEST"
  | "INVALID_SYMBOL"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_TIMESTAMP"
  | "INVALID_RESPONSE"
  | "CAPABILITY_NOT_SUPPORTED"
  | "AUTHENTICATION_REQUIRED"
  | "CONNECTOR_NOT_READY"
  | "REQUEST_REJECTED"
  | "ORDER_NOT_FOUND"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "EXCHANGE_UNAVAILABLE"
  | "UNKNOWN_ERROR";

/**
 * Domain error exposed by the unified exchange boundary.
 */
export class UnifiedExchangeError extends Error {
  public readonly code: UnifiedExchangeErrorCode;

  public readonly exchangeId?: ExchangeRegistryId;

  public readonly operation?: string;

  public readonly retryable: boolean;

  public constructor(
    code: UnifiedExchangeErrorCode,
    message: string,
    options: Readonly<{
      exchangeId?: ExchangeRegistryId;
      operation?: string;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "UnifiedExchangeError";
    this.code = code;
    this.exchangeId = options.exchangeId;
    this.operation = options.operation;
    this.retryable = options.retryable ?? false;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/**
 * Shared metadata accepted by unified exchange requests.
 */
export interface UnifiedExchangeRequestContext {
  /**
   * Caller-generated deterministic correlation identifier.
   */
  readonly requestId?: string;

  /**
   * Deterministic request timestamp.
   */
  readonly requestedAt?: number;

  /**
   * Whether the request may use sandbox or testnet infrastructure.
   */
  readonly sandbox?: boolean;

  /**
   * Optional immutable request metadata.
   */
  readonly metadata?: Readonly<
    Record<string, unknown>
  >;
}

/**
 * Normalized exchange instrument.
 */
export interface UnifiedExchangeInstrument {
  readonly symbol: string;

  readonly baseAsset: string;

  readonly quoteAsset: string;

  readonly marketType: ExchangeMarketType;

  readonly active: boolean;

  readonly pricePrecision?: number;

  readonly quantityPrecision?: number;

  readonly minimumQuantity?: number;

  readonly maximumQuantity?: number;

  readonly minimumNotional?: number;

  readonly contractSize?: number;

  readonly settlementAsset?: string;

  readonly metadata?: Readonly<
    Record<string, unknown>
  >;
}

/**
 * Normalized ticker.
 */
export interface UnifiedExchangeTicker {
  readonly exchangeId: ExchangeRegistryId;

  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly lastPrice: number;

  readonly bidPrice?: number;

  readonly askPrice?: number;

  readonly highPrice24h?: number;

  readonly lowPrice24h?: number;

  readonly baseVolume24h?: number;

  readonly quoteVolume24h?: number;

  readonly priceChange24h?: number;

  readonly priceChangePercent24h?: number;

  readonly observedAt: number;
}

/**
 * Normalized order-book price level.
 */
export interface UnifiedExchangeOrderBookLevel {
  readonly price: number;

  readonly quantity: number;
}

/**
 * Normalized order-book snapshot.
 */
export interface UnifiedExchangeOrderBook {
  readonly exchangeId: ExchangeRegistryId;

  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly bids: readonly UnifiedExchangeOrderBookLevel[];

  readonly asks: readonly UnifiedExchangeOrderBookLevel[];

  readonly sequence?: string;

  readonly observedAt: number;
}

/**
 * Normalized candle.
 */
export interface UnifiedExchangeCandle {
  readonly openTime: number;

  readonly closeTime: number;

  readonly open: number;

  readonly high: number;

  readonly low: number;

  readonly close: number;

  readonly volume: number;

  readonly quoteVolume?: number;

  readonly tradeCount?: number;

  readonly closed: boolean;
}

/**
 * Normalized account balance.
 */
export interface UnifiedExchangeBalance {
  readonly asset: string;

  readonly total: number;

  readonly available: number;

  readonly locked: number;

  readonly borrowed?: number;

  readonly interest?: number;

  readonly unrealizedPnl?: number;
}

/**
 * Normalized derivatives position.
 */
export interface UnifiedExchangePosition {
  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly side: UnifiedExchangePositionSide;

  readonly quantity: number;

  readonly entryPrice?: number;

  readonly markPrice?: number;

  readonly liquidationPrice?: number;

  readonly leverage?: number;

  readonly unrealizedPnl?: number;

  readonly realizedPnl?: number;

  readonly marginMode?: "CROSS" | "ISOLATED";

  readonly positionMode?: ExchangePositionMode;
}

/**
 * Request for one ticker.
 */
export interface UnifiedGetTickerRequest
  extends UnifiedExchangeRequestContext
{
  readonly symbol: string;

  readonly marketType: ExchangeMarketType;
}

/**
 * Request for an order-book snapshot.
 */
export interface UnifiedGetOrderBookRequest
  extends UnifiedGetTickerRequest
{
  readonly depth?: number;
}

/**
 * Request for historical candles.
 */
export interface UnifiedGetCandlesRequest
  extends UnifiedGetTickerRequest
{
  readonly interval: string;

  readonly startTime?: number;

  readonly endTime?: number;

  readonly limit?: number;
}

/**
 * Request for account balances.
 */
export interface UnifiedGetBalancesRequest
  extends UnifiedExchangeRequestContext
{
  readonly assets?: readonly string[];
}

/**
 * Request for open positions.
 */
export interface UnifiedGetPositionsRequest
  extends UnifiedExchangeRequestContext
{
  readonly symbols?: readonly string[];

  readonly marketTypes?: readonly ExchangeMarketType[];
}

/**
 * Normalized order-placement request.
 */
export interface UnifiedPlaceOrderRequest
  extends UnifiedExchangeRequestContext
{
  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly side: UnifiedExchangeOrderSide;

  readonly orderType: ExchangeSupportedOrderType;

  readonly quantity: number;

  readonly price?: number;

  readonly stopPrice?: number;

  readonly timeInForce?: ExchangeSupportedTimeInForce;

  readonly positionSide?: UnifiedExchangePositionSide;

  readonly reduceOnly?: boolean;

  readonly postOnly?: boolean;

  readonly clientOrderId?: string;
}

/**
 * Normalized order-cancellation request.
 */
export interface UnifiedCancelOrderRequest
  extends UnifiedExchangeRequestContext
{
  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly orderId?: string;

  readonly clientOrderId?: string;
}

/**
 * Normalized order-query request.
 */
export interface UnifiedGetOrderRequest
  extends UnifiedCancelOrderRequest {}

/**
 * Normalized order representation.
 */
export interface UnifiedExchangeOrder {
  readonly exchangeId: ExchangeRegistryId;

  readonly orderId: string;

  readonly clientOrderId?: string;

  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly side: UnifiedExchangeOrderSide;

  readonly positionSide?: UnifiedExchangePositionSide;

  readonly orderType: ExchangeSupportedOrderType;

  readonly status: UnifiedExchangeOrderStatus;

  readonly quantity: number;

  readonly filledQuantity: number;

  readonly remainingQuantity: number;

  readonly price?: number;

  readonly averageFillPrice?: number;

  readonly stopPrice?: number;

  readonly timeInForce?: ExchangeSupportedTimeInForce;

  readonly reduceOnly?: boolean;

  readonly postOnly?: boolean;

  readonly createdAt: number;

  readonly updatedAt: number;

  readonly metadata?: Readonly<
    Record<string, unknown>
  >;
}

/**
 * Normalized trade execution.
 */
export interface UnifiedExchangeExecution {
  readonly exchangeId: ExchangeRegistryId;

  readonly executionId: string;

  readonly orderId: string;

  readonly symbol: string;

  readonly marketType: ExchangeMarketType;

  readonly side: UnifiedExchangeOrderSide;

  readonly executionType: UnifiedExchangeExecutionType;

  readonly price: number;

  readonly quantity: number;

  readonly quoteQuantity: number;

  readonly fee?: number;

  readonly feeAsset?: string;

  readonly executedAt: number;
}

/**
 * Normalized result from an order-placement operation.
 */
export interface UnifiedPlaceOrderResult {
  readonly order: UnifiedExchangeOrder;

  readonly executions: readonly UnifiedExchangeExecution[];

  readonly acceptedAt: number;
}

/**
 * Normalized result from an order-cancellation operation.
 */
export interface UnifiedCancelOrderResult {
  readonly exchangeId: ExchangeRegistryId;

  readonly symbol: string;

  readonly orderId: string;

  readonly cancelled: boolean;

  readonly order?: UnifiedExchangeOrder;

  readonly cancelledAt: number;
}

/**
 * Unified public market-data contract.
 */
export interface UnifiedExchangeMarketDataApi {
  getTicker(
    request: UnifiedGetTickerRequest,
  ): Promise<UnifiedExchangeTicker>;

  getOrderBook(
    request: UnifiedGetOrderBookRequest,
  ): Promise<UnifiedExchangeOrderBook>;

  getCandles(
    request: UnifiedGetCandlesRequest,
  ): Promise<readonly UnifiedExchangeCandle[]>;

  getInstruments(
    marketTypes?: readonly ExchangeMarketType[],
  ): Promise<readonly UnifiedExchangeInstrument[]>;
}

/**
 * Unified private account contract.
 */
export interface UnifiedExchangeAccountApi {
  getBalances(
    request?: UnifiedGetBalancesRequest,
  ): Promise<readonly UnifiedExchangeBalance[]>;

  getPositions(
    request?: UnifiedGetPositionsRequest,
  ): Promise<readonly UnifiedExchangePosition[]>;
}

/**
 * Unified private trading contract.
 */
export interface UnifiedExchangeTradingApi {
  placeOrder(
    request: UnifiedPlaceOrderRequest,
  ): Promise<UnifiedPlaceOrderResult>;

  cancelOrder(
    request: UnifiedCancelOrderRequest,
  ): Promise<UnifiedCancelOrderResult>;

  getOrder(
    request: UnifiedGetOrderRequest,
  ): Promise<UnifiedExchangeOrder>;
}

/**
 * Normalized health report returned by a unified exchange.
 */
export interface UnifiedExchangeHealthReport {
  readonly exchangeId: ExchangeRegistryId;

  readonly status: ConnectorHealthStatus;

  readonly observedAt: number;

  readonly reason?: string;

  readonly diagnostics?: Readonly<
    Record<string, unknown>
  >;
}

/**
 * Primary contract consumed by the exchange router.
 *
 * Implementations must return normalized immutable values and must not expose
 * exchange-native request or response objects through this boundary.
 */
export interface UnifiedExchange
  extends ManagedConnectorLifecycleAdapter
{
  /**
   * Canonical normalized exchange identifier.
   */
  readonly exchangeId: ExchangeRegistryId;

  /**
   * Immutable capability profile for this exchange implementation.
   */
  readonly capabilities: ExchangeCapabilityProfile;

  /**
   * Public market-data operations.
   */
  readonly marketData: UnifiedExchangeMarketDataApi;

  /**
   * Optional private account operations.
   */
  readonly account?: UnifiedExchangeAccountApi;

  /**
   * Optional private trading operations.
   */
  readonly trading?: UnifiedExchangeTradingApi;

  /**
   * Returns a normalized health report.
   */
  inspectHealth(): Promise<UnifiedExchangeHealthReport>;
}

/**
 * Creates and validates a normalized exchange identifier.
 */
export function normalizeUnifiedExchangeId(
  exchangeId: string,
): ExchangeRegistryId {
  try {
    return normalizeExchangeRegistryId(
      exchangeId,
    );
  } catch (cause: unknown) {
    throw new UnifiedExchangeError(
      "INVALID_EXCHANGE_ID",
      `Invalid unified exchange identifier "${String(
        exchangeId,
      )}".`,
      {
        cause,
      },
    );
  }
}

/**
 * Validates a symbol used by unified requests.
 */
export function normalizeUnifiedExchangeSymbol(
  symbol: string,
): string {
  if (typeof symbol !== "string") {
    throw new UnifiedExchangeError(
      "INVALID_SYMBOL",
      "Unified exchange symbol must be a string.",
    );
  }

  const normalizedSymbol =
    symbol
      .trim()
      .toUpperCase();

  if (
    normalizedSymbol.length === 0 ||
    !/^[A-Z0-9][A-Z0-9._:/-]*$/u.test(
      normalizedSymbol,
    )
  ) {
    throw new UnifiedExchangeError(
      "INVALID_SYMBOL",
      `Invalid unified exchange symbol "${symbol}".`,
    );
  }

  return normalizedSymbol;
}

/**
 * Validates a finite positive numeric value.
 */
export function assertUnifiedPositiveNumber(
  value: number,
  label: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new UnifiedExchangeError(
      label.toLowerCase().includes(
        "price",
      )
        ? "INVALID_PRICE"
        : "INVALID_QUANTITY",
      `${label} must be a finite positive number.`,
    );
  }
}

/**
 * Validates a deterministic timestamp.
 */
export function assertUnifiedTimestamp(
  value: number,
  label = "Timestamp",
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new UnifiedExchangeError(
      "INVALID_TIMESTAMP",
      `${label} must be a finite, non-negative number.`,
    );
  }
}

/**
 * Produces an immutable shallow metadata copy.
 */
export function freezeUnifiedMetadata(
  metadata:
    | Readonly<Record<string, unknown>>
    | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new UnifiedExchangeError(
      "INVALID_REQUEST",
      "Unified exchange metadata must be a record object.",
    );
  }

  return Object.freeze({
    ...metadata,
  });
}

/**
 * Validates the common fields of an order-placement request.
 */
export function validateUnifiedPlaceOrderRequest(
  request: UnifiedPlaceOrderRequest,
): UnifiedPlaceOrderRequest {
  if (
    request === null ||
    typeof request !== "object" ||
    Array.isArray(request)
  ) {
    throw new UnifiedExchangeError(
      "INVALID_REQUEST",
      "Unified place-order request must be a record object.",
    );
  }

  const symbol =
    normalizeUnifiedExchangeSymbol(
      request.symbol,
    );

  assertUnifiedPositiveNumber(
    request.quantity,
    "Order quantity",
  );

  if (
    request.price !== undefined
  ) {
    assertUnifiedPositiveNumber(
      request.price,
      "Order price",
    );
  }

  if (
    request.stopPrice !== undefined
  ) {
    assertUnifiedPositiveNumber(
      request.stopPrice,
      "Order stop price",
    );
  }

  if (
    request.orderType === "LIMIT" &&
    request.price === undefined
  ) {
    throw new UnifiedExchangeError(
      "INVALID_PRICE",
      "Limit orders require a price.",
    );
  }

  if (
    (
      request.orderType === "STOP" ||
      request.orderType === "STOP_LIMIT" ||
      request.orderType === "TAKE_PROFIT" ||
      request.orderType === "TAKE_PROFIT_LIMIT"
    ) &&
    request.stopPrice === undefined
  ) {
    throw new UnifiedExchangeError(
      "INVALID_PRICE",
      `${request.orderType} orders require a stop price.`,
    );
  }

  if (
    (
      request.orderType === "STOP_LIMIT" ||
      request.orderType ===
        "TAKE_PROFIT_LIMIT"
    ) &&
    request.price === undefined
  ) {
    throw new UnifiedExchangeError(
      "INVALID_PRICE",
      `${request.orderType} orders require a limit price.`,
    );
  }

  if (
    request.requestedAt !== undefined
  ) {
    assertUnifiedTimestamp(
      request.requestedAt,
      "Requested timestamp",
    );
  }

  const metadata =
    freezeUnifiedMetadata(
      request.metadata,
    );

  return Object.freeze({
    ...request,
    symbol,
    ...(metadata === undefined
      ? {}
      : {
          metadata,
        }),
  });
}