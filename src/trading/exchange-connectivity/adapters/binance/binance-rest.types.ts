/**
 * Binance Spot REST API contracts.
 *
 * These types isolate Binance-specific payloads from the generic exchange
 * connector domain. The REST client will use them to validate and normalize
 * Binance responses before exposing connector-level data.
 */

export type BinanceHttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE";

export type BinanceRequestSecurity =
  | "NONE"
  | "API_KEY"
  | "SIGNED";

export type BinanceOrderSide =
  | "BUY"
  | "SELL";

export type BinanceOrderType =
  | "LIMIT"
  | "MARKET"
  | "STOP_LOSS"
  | "STOP_LOSS_LIMIT"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_LIMIT"
  | "LIMIT_MAKER";

export type BinanceTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK";

export type BinanceOrderStatus =
  | "NEW"
  | "PENDING_NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "PENDING_CANCEL"
  | "REJECTED"
  | "EXPIRED"
  | "EXPIRED_IN_MATCH";

export type BinanceExecutionType =
  | "NEW"
  | "CANCELED"
  | "REPLACED"
  | "REJECTED"
  | "TRADE"
  | "EXPIRED"
  | "TRADE_PREVENTION";

export type BinanceSymbolStatus =
  | "PRE_TRADING"
  | "TRADING"
  | "POST_TRADING"
  | "END_OF_DAY"
  | "HALT"
  | "AUCTION_MATCH"
  | "BREAK";

export type BinanceAccountType =
  | "SPOT"
  | "MARGIN"
  | "LEVERAGED";

export type BinancePermission =
  | "SPOT"
  | "MARGIN"
  | "LEVERAGED";

export type BinanceKlineInterval =
  | "1s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export type BinanceResponseType =
  | "ACK"
  | "RESULT"
  | "FULL";

export type BinanceSelfTradePreventionMode =
  | "NONE"
  | "EXPIRE_TAKER"
  | "EXPIRE_MAKER"
  | "EXPIRE_BOTH"
  | "DECREMENT";

export type BinanceOrderListStatus =
  | "RESPONSE"
  | "EXEC_STARTED"
  | "ALL_DONE";

export type BinanceOrderListOrderStatus =
  | "EXECUTING"
  | "ALL_DONE"
  | "REJECT";

export interface BinanceRestRequestOptions<
  TParameters extends Record<string, unknown> =
    Record<string, unknown>,
> {
  readonly method: BinanceHttpMethod;
  readonly path: string;
  readonly security: BinanceRequestSecurity;
  readonly parameters?: Readonly<TParameters>;
  readonly timeoutMs?: number;
}

export interface BinanceRestResponse<
  TData,
> {
  readonly status: number;
  readonly data: TData;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestWeight?: number;
  readonly orderCount10Seconds?: number;
  readonly orderCount1Minute?: number;
}

export interface BinanceServerTimeResponse {
  readonly serverTime: number;
}

export interface BinanceRateLimit {
  readonly rateLimitType: string;
  readonly interval: string;
  readonly intervalNum: number;
  readonly limit: number;
}

export interface BinanceSymbolFilter {
  readonly filterType: string;
  readonly minPrice?: string;
  readonly maxPrice?: string;
  readonly tickSize?: string;
  readonly minQty?: string;
  readonly maxQty?: string;
  readonly stepSize?: string;
  readonly minNotional?: string;
  readonly maxNotional?: string;
  readonly applyToMarket?: boolean;
  readonly applyMinToMarket?: boolean;
  readonly applyMaxToMarket?: boolean;
  readonly avgPriceMins?: number;
  readonly limit?: number;
  readonly maxNumOrders?: number;
  readonly maxNumAlgoOrders?: number;
  readonly multiplierUp?: string;
  readonly multiplierDown?: string;
  readonly multiplierDecimal?: number;
  readonly bidMultiplierUp?: string;
  readonly bidMultiplierDown?: string;
  readonly askMultiplierUp?: string;
  readonly askMultiplierDown?: string;
  readonly marketMinQty?: string;
  readonly marketMaxQty?: string;
  readonly marketStepSize?: string;
  readonly maxPosition?: string;
  readonly notional?: string;
  readonly icebergParts?: number;
  readonly [key: string]:
    | string
    | number
    | boolean
    | undefined;
}

export interface BinanceExchangeFilter {
  readonly filterType: string;
  readonly [key: string]:
    | string
    | number
    | boolean
    | undefined;
}

export interface BinanceSymbolInformation {
  readonly symbol: string;
  readonly status: BinanceSymbolStatus;
  readonly baseAsset: string;
  readonly baseAssetPrecision: number;
  readonly quoteAsset: string;
  readonly quotePrecision: number;
  readonly quoteAssetPrecision: number;
  readonly baseCommissionPrecision: number;
  readonly quoteCommissionPrecision: number;
  readonly orderTypes: readonly BinanceOrderType[];
  readonly icebergAllowed: boolean;
  readonly ocoAllowed: boolean;
  readonly otoAllowed?: boolean;
  readonly quoteOrderQtyMarketAllowed: boolean;
  readonly allowTrailingStop: boolean;
  readonly cancelReplaceAllowed: boolean;
  readonly amendAllowed?: boolean;
  readonly isSpotTradingAllowed: boolean;
  readonly isMarginTradingAllowed: boolean;
  readonly filters: readonly BinanceSymbolFilter[];
  readonly permissions: readonly BinancePermission[];
  readonly permissionSets?: readonly (readonly BinancePermission[])[];
  readonly defaultSelfTradePreventionMode:
    BinanceSelfTradePreventionMode;
  readonly allowedSelfTradePreventionModes:
    readonly BinanceSelfTradePreventionMode[];
}

export interface BinanceExchangeInformationResponse {
  readonly timezone: string;
  readonly serverTime: number;
  readonly rateLimits: readonly BinanceRateLimit[];
  readonly exchangeFilters: readonly BinanceExchangeFilter[];
  readonly symbols: readonly BinanceSymbolInformation[];
}

export interface BinanceBookTickerResponse {
  readonly symbol: string;
  readonly bidPrice: string;
  readonly bidQty: string;
  readonly askPrice: string;
  readonly askQty: string;
}

export interface BinancePriceTickerResponse {
  readonly symbol: string;
  readonly price: string;
}

export interface BinanceAveragePriceResponse {
  readonly mins: number;
  readonly price: string;
  readonly closeTime: number;
}

export interface BinanceTwentyFourHourTickerResponse {
  readonly symbol: string;
  readonly priceChange: string;
  readonly priceChangePercent: string;
  readonly weightedAvgPrice: string;
  readonly prevClosePrice: string;
  readonly lastPrice: string;
  readonly lastQty: string;
  readonly bidPrice: string;
  readonly bidQty: string;
  readonly askPrice: string;
  readonly askQty: string;
  readonly openPrice: string;
  readonly highPrice: string;
  readonly lowPrice: string;
  readonly volume: string;
  readonly quoteVolume: string;
  readonly openTime: number;
  readonly closeTime: number;
  readonly firstId: number;
  readonly lastId: number;
  readonly count: number;
}

export interface BinanceOrderBookResponse {
  readonly lastUpdateId: number;
  readonly bids: readonly BinanceOrderBookLevel[];
  readonly asks: readonly BinanceOrderBookLevel[];
}

export type BinanceOrderBookLevel = readonly [
  price: string,
  quantity: string,
];

export interface BinanceRecentTradeResponse {
  readonly id: number;
  readonly price: string;
  readonly qty: string;
  readonly quoteQty: string;
  readonly time: number;
  readonly isBuyerMaker: boolean;
  readonly isBestMatch: boolean;
}

export interface BinanceAggregateTradeResponse {
  readonly a: number;
  readonly p: string;
  readonly q: string;
  readonly f: number;
  readonly l: number;
  readonly T: number;
  readonly m: boolean;
  readonly M: boolean;
}

export type BinanceKlineResponse = readonly [
  openTime: number,
  openPrice: string,
  highPrice: string,
  lowPrice: string,
  closePrice: string,
  volume: string,
  closeTime: number,
  quoteAssetVolume: string,
  numberOfTrades: number,
  takerBuyBaseAssetVolume: string,
  takerBuyQuoteAssetVolume: string,
  unused: string,
];

export interface BinanceAccountCommissionRates {
  readonly maker: string;
  readonly taker: string;
  readonly buyer: string;
  readonly seller: string;
}

export interface BinanceBalance {
  readonly asset: string;
  readonly free: string;
  readonly locked: string;
}

export interface BinanceAccountInformationResponse {
  readonly makerCommission: number;
  readonly takerCommission: number;
  readonly buyerCommission: number;
  readonly sellerCommission: number;
  readonly commissionRates?: BinanceAccountCommissionRates;
  readonly canTrade: boolean;
  readonly canWithdraw: boolean;
  readonly canDeposit: boolean;
  readonly brokered: boolean;
  readonly requireSelfTradePrevention: boolean;
  readonly preventSor?: boolean;
  readonly updateTime: number;
  readonly accountType: BinanceAccountType;
  readonly balances: readonly BinanceBalance[];
  readonly permissions: readonly BinancePermission[];
  readonly uid?: number;
}

export interface BinanceNewOrderRequest {
  readonly symbol: string;
  readonly side: BinanceOrderSide;
  readonly type: BinanceOrderType;
  readonly timeInForce?: BinanceTimeInForce;
  readonly quantity?: string;
  readonly quoteOrderQty?: string;
  readonly price?: string;
  readonly newClientOrderId?: string;
  readonly strategyId?: number;
  readonly strategyType?: number;
  readonly stopPrice?: string;
  readonly trailingDelta?: number;
  readonly icebergQty?: string;
  readonly newOrderRespType?: BinanceResponseType;
  readonly selfTradePreventionMode?:
    BinanceSelfTradePreventionMode;
  readonly recvWindow?: number;
}

export interface BinanceTestOrderRequest
  extends BinanceNewOrderRequest {
  readonly computeCommissionRates?: boolean;
}

export interface BinanceCancelOrderRequest {
  readonly symbol: string;
  readonly orderId?: number;
  readonly origClientOrderId?: string;
  readonly newClientOrderId?: string;
  readonly cancelRestrictions?:
    | "ONLY_NEW"
    | "ONLY_PARTIALLY_FILLED";
  readonly recvWindow?: number;
}

export interface BinanceQueryOrderRequest {
  readonly symbol: string;
  readonly orderId?: number;
  readonly origClientOrderId?: string;
  readonly recvWindow?: number;
}

export interface BinanceOpenOrdersRequest {
  readonly symbol?: string;
  readonly recvWindow?: number;
}

export interface BinanceAllOrdersRequest {
  readonly symbol: string;
  readonly orderId?: number;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly limit?: number;
  readonly recvWindow?: number;
}

export interface BinanceCancelAllOrdersRequest {
  readonly symbol: string;
  readonly recvWindow?: number;
}

export interface BinanceMyTradesRequest {
  readonly symbol: string;
  readonly orderId?: number;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly fromId?: number;
  readonly limit?: number;
  readonly recvWindow?: number;
}

export interface BinanceOrderFill {
  readonly price: string;
  readonly qty: string;
  readonly commission: string;
  readonly commissionAsset: string;
  readonly tradeId: number;
}

export interface BinanceOrderResponse {
  readonly symbol: string;
  readonly orderId: number;
  readonly orderListId: number;
  readonly clientOrderId: string;
  readonly transactTime?: number;
  readonly price: string;
  readonly origQty: string;
  readonly executedQty: string;
  readonly origQuoteOrderQty: string;
  readonly cummulativeQuoteQty: string;
  readonly status: BinanceOrderStatus;
  readonly timeInForce: BinanceTimeInForce;
  readonly type: BinanceOrderType;
  readonly side: BinanceOrderSide;
  readonly workingTime?: number;
  readonly selfTradePreventionMode?:
    BinanceSelfTradePreventionMode;
  readonly fills?: readonly BinanceOrderFill[];
}

export interface BinanceQueryOrderResponse
  extends BinanceOrderResponse {
  readonly stopPrice: string;
  readonly icebergQty: string;
  readonly time: number;
  readonly updateTime: number;
  readonly isWorking: boolean;
  readonly origQuoteOrderQty: string;
}

export interface BinanceCancelOrderResponse
  extends BinanceOrderResponse {
  readonly origClientOrderId: string;
}

export type BinanceOpenOrderResponse =
  BinanceQueryOrderResponse;

export interface BinanceTradeResponse {
  readonly symbol: string;
  readonly id: number;
  readonly orderId: number;
  readonly orderListId: number;
  readonly price: string;
  readonly qty: string;
  readonly quoteQty: string;
  readonly commission: string;
  readonly commissionAsset: string;
  readonly time: number;
  readonly isBuyer: boolean;
  readonly isMaker: boolean;
  readonly isBestMatch: boolean;
}

export interface BinanceCommissionRateResponse {
  readonly discount: {
    readonly enabledForAccount: boolean;
    readonly enabledForSymbol: boolean;
    readonly discountAsset: string;
    readonly discount: string;
  };
  readonly standardCommissionForOrder: {
    readonly maker: string;
    readonly taker: string;
    readonly buyer: string;
    readonly seller: string;
  };
  readonly specialCommissionForOrder: {
    readonly maker: string;
    readonly taker: string;
    readonly buyer: string;
    readonly seller: string;
  };
  readonly taxCommissionForOrder: {
    readonly maker: string;
    readonly taker: string;
    readonly buyer: string;
    readonly seller: string;
  };
}

export interface BinanceEmptyResponse {
  readonly [key: string]: never;
}

export interface BinanceApiErrorPayload {
  readonly code: number;
  readonly msg: string;
}

export interface BinanceRestErrorContext {
  readonly method?: BinanceHttpMethod;
  readonly path?: string;
  readonly status?: number;
  readonly code?: number;
  readonly responseBody?: unknown;
  readonly requestParameters?: Readonly<
    Record<string, unknown>
  >;
}

export class BinanceRestApiError extends Error {
  public readonly status?: number;
  public readonly code?: number;
  public readonly method?: BinanceHttpMethod;
  public readonly path?: string;
  public readonly responseBody?: unknown;
  public readonly requestParameters?: Readonly<
    Record<string, unknown>
  >;

  public constructor(
    message: string,
    context: BinanceRestErrorContext = {},
  ) {
    super(message);

    this.name = "BinanceRestApiError";
    this.status = context.status;
    this.code = context.code;
    this.method = context.method;
    this.path = context.path;
    this.responseBody = context.responseBody;
    this.requestParameters =
      context.requestParameters;

    Object.setPrototypeOf(
      this,
      BinanceRestApiError.prototype,
    );
  }
}

export class BinanceRestValidationError extends Error {
  public constructor(message: string) {
    super(message);

    this.name = "BinanceRestValidationError";

    Object.setPrototypeOf(
      this,
      BinanceRestValidationError.prototype,
    );
  }
}

export function isBinanceApiErrorPayload(
  value: unknown,
): value is BinanceApiErrorPayload {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate = value as {
    readonly code?: unknown;
    readonly msg?: unknown;
  };

  return (
    typeof candidate.code === "number" &&
    Number.isFinite(candidate.code) &&
    typeof candidate.msg === "string"
  );
}

export function assertBinanceSymbol(
  symbol: string,
): void {
  if (
    typeof symbol !== "string" ||
    symbol.trim().length === 0
  ) {
    throw new BinanceRestValidationError(
      "Binance symbol must be a non-empty string.",
    );
  }

  if (!/^[A-Z0-9]+$/.test(symbol.trim())) {
    throw new BinanceRestValidationError(
      "Binance symbol must contain only uppercase letters and numbers.",
    );
  }
}

export function normalizeBinanceSymbol(
  symbol: string,
): string {
  if (
    typeof symbol !== "string" ||
    symbol.trim().length === 0
  ) {
    throw new BinanceRestValidationError(
      "Binance symbol must be a non-empty string.",
    );
  }

  const normalizedSymbol = symbol
    .trim()
    .replace(/[-_/:\s]/g, "")
    .toUpperCase();

  assertBinanceSymbol(normalizedSymbol);

  return normalizedSymbol;
}

export function assertBinancePositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new BinanceRestValidationError(
      `${fieldName} must be a positive safe integer.`,
    );
  }
}

export function assertBinanceNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new BinanceRestValidationError(
      `${fieldName} must be a non-negative safe integer.`,
    );
  }
}

export function assertBinanceDecimalString(
  value: string,
  fieldName: string,
  options: {
    readonly allowZero?: boolean;
  } = {},
): void {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  ) {
    throw new BinanceRestValidationError(
      `${fieldName} must be a valid non-negative decimal string.`,
    );
  }

  if (
    options.allowZero !== true &&
    Number(value) <= 0
  ) {
    throw new BinanceRestValidationError(
      `${fieldName} must be greater than zero.`,
    );
  }
}

export function assertBinanceTimeRange(
  startTime: number | undefined,
  endTime: number | undefined,
): void {
  if (startTime !== undefined) {
    assertBinanceNonNegativeInteger(
      startTime,
      "startTime",
    );
  }

  if (endTime !== undefined) {
    assertBinanceNonNegativeInteger(
      endTime,
      "endTime",
    );
  }

  if (
    startTime !== undefined &&
    endTime !== undefined &&
    endTime < startTime
  ) {
    throw new BinanceRestValidationError(
      "endTime must be greater than or equal to startTime.",
    );
  }
}