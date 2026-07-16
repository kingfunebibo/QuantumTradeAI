/**
 * Binance Spot WebSocket contracts.
 *
 * These types model public market streams, private user-data streams,
 * subscription commands, connection state, normalized stream descriptors,
 * and structured WebSocket errors.
 */

import {
  type BinanceExecutionType,
  type BinanceKlineInterval,
  type BinanceOrderSide,
  type BinanceOrderStatus,
  type BinanceOrderType,
  type BinanceSelfTradePreventionMode,
  type BinanceTimeInForce,
} from "./binance-rest.types";

export type BinanceWebSocketConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

export type BinanceWebSocketCommandMethod =
  | "SUBSCRIBE"
  | "UNSUBSCRIBE"
  | "LIST_SUBSCRIPTIONS"
  | "SET_PROPERTY"
  | "GET_PROPERTY";

export type BinanceWebSocketProperty =
  | "combined";

export type BinanceWebSocketStreamType =
  | "trade"
  | "aggregate-trade"
  | "ticker"
  | "mini-ticker"
  | "book-ticker"
  | "depth"
  | "kline"
  | "user-data";

export type BinanceDepthUpdateSpeed =
  | "100ms"
  | "1000ms";

export type BinancePartialDepthLevel =
  | 5
  | 10
  | 20;

export type BinanceWebSocketEventType =
  | "trade"
  | "aggTrade"
  | "24hrTicker"
  | "24hrMiniTicker"
  | "bookTicker"
  | "depthUpdate"
  | "kline"
  | "outboundAccountPosition"
  | "balanceUpdate"
  | "executionReport"
  | "listStatus"
  | "eventStreamTerminated"
  | "externalLockUpdate";

export interface BinanceWebSocketClock {
  now(): number;
}

export interface BinanceWebSocketStreamDescriptor {
  readonly type: BinanceWebSocketStreamType;
  readonly symbol?: string;
  readonly interval?: BinanceKlineInterval;
  readonly depthLevel?: BinancePartialDepthLevel;
  readonly updateSpeed?: BinanceDepthUpdateSpeed;
  readonly rawStreamName: string;
}

export interface BinanceWebSocketSubscriptionRequest {
  readonly method: "SUBSCRIBE";
  readonly params: readonly string[];
  readonly id: number | string;
}

export interface BinanceWebSocketUnsubscriptionRequest {
  readonly method: "UNSUBSCRIBE";
  readonly params: readonly string[];
  readonly id: number | string;
}

export interface BinanceWebSocketListSubscriptionsRequest {
  readonly method: "LIST_SUBSCRIPTIONS";
  readonly id: number | string;
}

export interface BinanceWebSocketSetPropertyRequest {
  readonly method: "SET_PROPERTY";
  readonly params: readonly [
    property: BinanceWebSocketProperty,
    value: boolean,
  ];
  readonly id: number | string;
}

export interface BinanceWebSocketGetPropertyRequest {
  readonly method: "GET_PROPERTY";
  readonly params: readonly [
    property: BinanceWebSocketProperty,
  ];
  readonly id: number | string;
}

export type BinanceWebSocketCommand =
  | BinanceWebSocketSubscriptionRequest
  | BinanceWebSocketUnsubscriptionRequest
  | BinanceWebSocketListSubscriptionsRequest
  | BinanceWebSocketSetPropertyRequest
  | BinanceWebSocketGetPropertyRequest;

export interface BinanceWebSocketCommandSuccessResponse {
  readonly result: null;
  readonly id: number | string;
}

export interface BinanceWebSocketListSubscriptionsResponse {
  readonly result: readonly string[];
  readonly id: number | string;
}

export interface BinanceWebSocketPropertyResponse {
  readonly result: boolean;
  readonly id: number | string;
}

export interface BinanceWebSocketCommandErrorResponse {
  readonly code: number;
  readonly msg: string;
  readonly id?: number | string;
}

export type BinanceWebSocketCommandResponse =
  | BinanceWebSocketCommandSuccessResponse
  | BinanceWebSocketListSubscriptionsResponse
  | BinanceWebSocketPropertyResponse
  | BinanceWebSocketCommandErrorResponse;

export interface BinanceCombinedStreamEnvelope<
  TData = unknown,
> {
  readonly stream: string;
  readonly data: TData;
}

export interface BinanceTradeStreamEvent {
  readonly e: "trade";
  readonly E: number;
  readonly s: string;
  readonly t: number;
  readonly p: string;
  readonly q: string;
  readonly T: number;
  readonly m: boolean;
  readonly M: boolean;
}

export interface BinanceAggregateTradeStreamEvent {
  readonly e: "aggTrade";
  readonly E: number;
  readonly s: string;
  readonly a: number;
  readonly p: string;
  readonly q: string;
  readonly f: number;
  readonly l: number;
  readonly T: number;
  readonly m: boolean;
  readonly M: boolean;
}

export interface BinanceKlinePayload {
  readonly t: number;
  readonly T: number;
  readonly s: string;
  readonly i: BinanceKlineInterval;
  readonly f: number;
  readonly L: number;
  readonly o: string;
  readonly c: string;
  readonly h: string;
  readonly l: string;
  readonly v: string;
  readonly n: number;
  readonly x: boolean;
  readonly q: string;
  readonly V: string;
  readonly Q: string;
  readonly B: string;
}

export interface BinanceKlineStreamEvent {
  readonly e: "kline";
  readonly E: number;
  readonly s: string;
  readonly k: BinanceKlinePayload;
}

export interface BinanceMiniTickerStreamEvent {
  readonly e: "24hrMiniTicker";
  readonly E: number;
  readonly s: string;
  readonly c: string;
  readonly o: string;
  readonly h: string;
  readonly l: string;
  readonly v: string;
  readonly q: string;
}

export interface BinanceTickerStreamEvent {
  readonly e: "24hrTicker";
  readonly E: number;
  readonly s: string;
  readonly p: string;
  readonly P: string;
  readonly w: string;
  readonly x: string;
  readonly c: string;
  readonly Q: string;
  readonly b: string;
  readonly B: string;
  readonly a: string;
  readonly A: string;
  readonly o: string;
  readonly h: string;
  readonly l: string;
  readonly v: string;
  readonly q: string;
  readonly O: number;
  readonly C: number;
  readonly F: number;
  readonly L: number;
  readonly n: number;
}

export interface BinanceBookTickerStreamEvent {
  readonly u: number;
  readonly s: string;
  readonly b: string;
  readonly B: string;
  readonly a: string;
  readonly A: string;
}

export type BinanceDepthLevelUpdate = readonly [
  price: string,
  quantity: string,
];

export interface BinanceDepthUpdateStreamEvent {
  readonly e: "depthUpdate";
  readonly E: number;
  readonly s: string;
  readonly U: number;
  readonly u: number;
  readonly b: readonly BinanceDepthLevelUpdate[];
  readonly a: readonly BinanceDepthLevelUpdate[];
}

export interface BinancePartialDepthStreamEvent {
  readonly lastUpdateId: number;
  readonly bids: readonly BinanceDepthLevelUpdate[];
  readonly asks: readonly BinanceDepthLevelUpdate[];
}

export interface BinanceAccountBalanceUpdate {
  readonly a: string;
  readonly f: string;
  readonly l: string;
}

export interface BinanceOutboundAccountPositionEvent {
  readonly e: "outboundAccountPosition";
  readonly E: number;
  readonly u: number;
  readonly B: readonly BinanceAccountBalanceUpdate[];
}

export interface BinanceBalanceUpdateEvent {
  readonly e: "balanceUpdate";
  readonly E: number;
  readonly a: string;
  readonly d: string;
  readonly T: number;
}

export interface BinanceExecutionReportEvent {
  readonly e: "executionReport";
  readonly E: number;
  readonly s: string;
  readonly c: string;
  readonly S: BinanceOrderSide;
  readonly o: BinanceOrderType;
  readonly f: BinanceTimeInForce;
  readonly q: string;
  readonly p: string;
  readonly P: string;
  readonly F: string;
  readonly g: number;
  readonly C: string;
  readonly x: BinanceExecutionType;
  readonly X: BinanceOrderStatus;
  readonly r: string;
  readonly i: number;
  readonly l: string;
  readonly z: string;
  readonly L: string;
  readonly n: string;
  readonly N: string | null;
  readonly T: number;
  readonly t: number;
  readonly I: number;
  readonly w: boolean;
  readonly m: boolean;
  readonly M: boolean;
  readonly O: number;
  readonly Z: string;
  readonly Y: string;
  readonly Q: string;
  readonly V: BinanceSelfTradePreventionMode;

  readonly d?: number;
  readonly D?: number;
  readonly j?: number;
  readonly J?: number;
  readonly v?: number;
  readonly A?: string;
  readonly B?: string;
  readonly u?: number;
  readonly U?: number;
  readonly Cs?: string;
  readonly pl?: string;
  readonly pL?: string;
  readonly pY?: string;
  readonly W?: number;
}

export interface BinanceListStatusOrder {
  readonly s: string;
  readonly i: number;
  readonly c: string;
}

export interface BinanceListStatusEvent {
  readonly e: "listStatus";
  readonly E: number;
  readonly s: string;
  readonly g: number;
  readonly c: string;
  readonly l: string;
  readonly L: string;
  readonly r: string;
  readonly C: number;
  readonly T: number;
  readonly O: readonly BinanceListStatusOrder[];
}

export interface BinanceEventStreamTerminatedEvent {
  readonly e: "eventStreamTerminated";
  readonly E: number;
}

export interface BinanceExternalLockUpdateEvent {
  readonly e: "externalLockUpdate";
  readonly E: number;
  readonly a: string;
  readonly d: string;
  readonly T: number;
}

export type BinancePublicMarketStreamEvent =
  | BinanceTradeStreamEvent
  | BinanceAggregateTradeStreamEvent
  | BinanceKlineStreamEvent
  | BinanceMiniTickerStreamEvent
  | BinanceTickerStreamEvent
  | BinanceBookTickerStreamEvent
  | BinanceDepthUpdateStreamEvent
  | BinancePartialDepthStreamEvent;

export type BinanceUserDataStreamEvent =
  | BinanceOutboundAccountPositionEvent
  | BinanceBalanceUpdateEvent
  | BinanceExecutionReportEvent
  | BinanceListStatusEvent
  | BinanceEventStreamTerminatedEvent
  | BinanceExternalLockUpdateEvent;

export type BinanceWebSocketEvent =
  | BinancePublicMarketStreamEvent
  | BinanceUserDataStreamEvent;

export interface BinanceNormalizedTradeEvent {
  readonly type: "trade";
  readonly symbol: string;
  readonly tradeId: number;
  readonly price: string;
  readonly quantity: string;
  readonly tradeTime: number;
  readonly eventTime: number;
  readonly buyerIsMarketMaker: boolean;
}

export interface BinanceNormalizedAggregateTradeEvent {
  readonly type: "aggregate-trade";
  readonly symbol: string;
  readonly aggregateTradeId: number;
  readonly firstTradeId: number;
  readonly lastTradeId: number;
  readonly price: string;
  readonly quantity: string;
  readonly tradeTime: number;
  readonly eventTime: number;
  readonly buyerIsMarketMaker: boolean;
}

export interface BinanceNormalizedKlineEvent {
  readonly type: "kline";
  readonly symbol: string;
  readonly interval: BinanceKlineInterval;
  readonly openTime: number;
  readonly closeTime: number;
  readonly openPrice: string;
  readonly highPrice: string;
  readonly lowPrice: string;
  readonly closePrice: string;
  readonly volume: string;
  readonly quoteAssetVolume: string;
  readonly tradeCount: number;
  readonly takerBuyBaseAssetVolume: string;
  readonly takerBuyQuoteAssetVolume: string;
  readonly closed: boolean;
  readonly eventTime: number;
}

export interface BinanceNormalizedTickerEvent {
  readonly type: "ticker";
  readonly symbol: string;
  readonly priceChange: string;
  readonly priceChangePercent: string;
  readonly weightedAveragePrice: string;
  readonly previousClosePrice: string;
  readonly lastPrice: string;
  readonly lastQuantity: string;
  readonly bestBidPrice: string;
  readonly bestBidQuantity: string;
  readonly bestAskPrice: string;
  readonly bestAskQuantity: string;
  readonly openPrice: string;
  readonly highPrice: string;
  readonly lowPrice: string;
  readonly volume: string;
  readonly quoteVolume: string;
  readonly openTime: number;
  readonly closeTime: number;
  readonly firstTradeId: number;
  readonly lastTradeId: number;
  readonly tradeCount: number;
  readonly eventTime: number;
}

export interface BinanceNormalizedMiniTickerEvent {
  readonly type: "mini-ticker";
  readonly symbol: string;
  readonly closePrice: string;
  readonly openPrice: string;
  readonly highPrice: string;
  readonly lowPrice: string;
  readonly volume: string;
  readonly quoteVolume: string;
  readonly eventTime: number;
}

export interface BinanceNormalizedBookTickerEvent {
  readonly type: "book-ticker";
  readonly symbol: string;
  readonly updateId: number;
  readonly bestBidPrice: string;
  readonly bestBidQuantity: string;
  readonly bestAskPrice: string;
  readonly bestAskQuantity: string;
}

export interface BinanceNormalizedDepthEvent {
  readonly type: "depth";
  readonly symbol: string;
  readonly firstUpdateId?: number;
  readonly finalUpdateId: number;
  readonly bids: readonly BinanceDepthLevelUpdate[];
  readonly asks: readonly BinanceDepthLevelUpdate[];
  readonly eventTime?: number;
}

export interface BinanceNormalizedBalance {
  readonly asset: string;
  readonly free: string;
  readonly locked: string;
}

export interface BinanceNormalizedAccountPositionEvent {
  readonly type: "account-position";
  readonly eventTime: number;
  readonly lastAccountUpdateTime: number;
  readonly balances: readonly BinanceNormalizedBalance[];
}

export interface BinanceNormalizedBalanceUpdateEvent {
  readonly type: "balance-update";
  readonly eventTime: number;
  readonly asset: string;
  readonly delta: string;
  readonly clearTime: number;
}

export interface BinanceNormalizedExecutionReportEvent {
  readonly type: "execution-report";
  readonly eventTime: number;
  readonly symbol: string;
  readonly clientOrderId: string;
  readonly side: BinanceOrderSide;
  readonly orderType: BinanceOrderType;
  readonly timeInForce: BinanceTimeInForce;
  readonly originalQuantity: string;
  readonly orderPrice: string;
  readonly stopPrice: string;
  readonly icebergQuantity: string;
  readonly orderListId: number;
  readonly originalClientOrderId: string;
  readonly executionType: BinanceExecutionType;
  readonly orderStatus: BinanceOrderStatus;
  readonly rejectionReason: string;
  readonly orderId: number;
  readonly lastExecutedQuantity: string;
  readonly cumulativeFilledQuantity: string;
  readonly lastExecutedPrice: string;
  readonly commissionAmount: string;
  readonly commissionAsset: string | null;
  readonly transactionTime: number;
  readonly tradeId: number;
  readonly working: boolean;
  readonly maker: boolean;
  readonly orderCreationTime: number;
  readonly cumulativeQuoteQuantity: string;
  readonly lastQuoteQuantity: string;
  readonly quoteOrderQuantity: string;
  readonly selfTradePreventionMode:
    BinanceSelfTradePreventionMode;
}

export type BinanceNormalizedWebSocketEvent =
  | BinanceNormalizedTradeEvent
  | BinanceNormalizedAggregateTradeEvent
  | BinanceNormalizedKlineEvent
  | BinanceNormalizedTickerEvent
  | BinanceNormalizedMiniTickerEvent
  | BinanceNormalizedBookTickerEvent
  | BinanceNormalizedDepthEvent
  | BinanceNormalizedAccountPositionEvent
  | BinanceNormalizedBalanceUpdateEvent
  | BinanceNormalizedExecutionReportEvent;

export interface BinanceWebSocketMessageContext {
  readonly streamName?: string;
  readonly receivedAt: number;
  readonly rawMessage: string;
}

export interface BinanceWebSocketMessage<
  TEvent = BinanceWebSocketEvent,
> {
  readonly event: TEvent;
  readonly context: BinanceWebSocketMessageContext;
}

export interface BinanceWebSocketHealthSnapshot {
  readonly state: BinanceWebSocketConnectionState;
  readonly connectedAt?: number;
  readonly disconnectedAt?: number;
  readonly lastMessageAt?: number;
  readonly lastPongAt?: number;
  readonly reconnectAttempts: number;
  readonly activeSubscriptions: readonly string[];
  readonly connectionUrl?: string;
  readonly healthy: boolean;
}

export interface BinanceWebSocketCloseContext {
  readonly code?: number;
  readonly reason?: string;
  readonly wasClean?: boolean;
  readonly closedAt: number;
}

export interface BinanceWebSocketErrorContext {
  readonly cause?: unknown;
  readonly code?: number;
  readonly streamName?: string;
  readonly rawMessage?: string;
  readonly state?: BinanceWebSocketConnectionState;
}

export class BinanceWebSocketError extends Error {
  public readonly cause?: unknown;
  public readonly code?: number;
  public readonly streamName?: string;
  public readonly rawMessage?: string;
  public readonly state?: BinanceWebSocketConnectionState;

  public constructor(
    message: string,
    context: BinanceWebSocketErrorContext = {},
  ) {
    super(message);

    this.name = "BinanceWebSocketError";
    this.cause = context.cause;
    this.code = context.code;
    this.streamName = context.streamName;
    this.rawMessage = context.rawMessage;
    this.state = context.state;

    Object.setPrototypeOf(
      this,
      BinanceWebSocketError.prototype,
    );
  }
}

export class BinanceWebSocketValidationError extends Error {
  public constructor(message: string) {
    super(message);

    this.name = "BinanceWebSocketValidationError";

    Object.setPrototypeOf(
      this,
      BinanceWebSocketValidationError.prototype,
    );
  }
}

export function isBinanceCombinedStreamEnvelope(
  value: unknown,
): value is BinanceCombinedStreamEnvelope {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate = value as {
    readonly stream?: unknown;
    readonly data?: unknown;
  };

  return (
    typeof candidate.stream === "string" &&
    candidate.stream.length > 0 &&
    "data" in candidate
  );
}

export function isBinanceWebSocketCommandErrorResponse(
  value: unknown,
): value is BinanceWebSocketCommandErrorResponse {
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

export function isBinanceWebSocketCommandResponse(
  value: unknown,
): value is BinanceWebSocketCommandResponse {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate = value as {
    readonly id?: unknown;
    readonly result?: unknown;
    readonly code?: unknown;
    readonly msg?: unknown;
  };

  if (
    typeof candidate.code === "number" &&
    typeof candidate.msg === "string"
  ) {
    return true;
  }

  return (
    (
      typeof candidate.id === "number" ||
      typeof candidate.id === "string"
    ) &&
    "result" in candidate
  );
}

export function isBinanceTradeStreamEvent(
  value: unknown,
): value is BinanceTradeStreamEvent {
  return hasBinanceEventType(
    value,
    "trade",
  );
}

export function isBinanceAggregateTradeStreamEvent(
  value: unknown,
): value is BinanceAggregateTradeStreamEvent {
  return hasBinanceEventType(
    value,
    "aggTrade",
  );
}

export function isBinanceKlineStreamEvent(
  value: unknown,
): value is BinanceKlineStreamEvent {
  return hasBinanceEventType(
    value,
    "kline",
  );
}

export function isBinanceTickerStreamEvent(
  value: unknown,
): value is BinanceTickerStreamEvent {
  return hasBinanceEventType(
    value,
    "24hrTicker",
  );
}

export function isBinanceMiniTickerStreamEvent(
  value: unknown,
): value is BinanceMiniTickerStreamEvent {
  return hasBinanceEventType(
    value,
    "24hrMiniTicker",
  );
}

export function isBinanceDepthUpdateStreamEvent(
  value: unknown,
): value is BinanceDepthUpdateStreamEvent {
  return hasBinanceEventType(
    value,
    "depthUpdate",
  );
}

export function isBinanceOutboundAccountPositionEvent(
  value: unknown,
): value is BinanceOutboundAccountPositionEvent {
  return hasBinanceEventType(
    value,
    "outboundAccountPosition",
  );
}

export function isBinanceBalanceUpdateEvent(
  value: unknown,
): value is BinanceBalanceUpdateEvent {
  return hasBinanceEventType(
    value,
    "balanceUpdate",
  );
}

export function isBinanceExecutionReportEvent(
  value: unknown,
): value is BinanceExecutionReportEvent {
  return hasBinanceEventType(
    value,
    "executionReport",
  );
}

export function hasBinanceEventType<
  TEventType extends string,
>(
  value: unknown,
  eventType: TEventType,
): value is {
  readonly e: TEventType;
} {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return false;
  }

  return (
    (value as { readonly e?: unknown }).e ===
    eventType
  );
}

export function normalizeBinanceWebSocketSymbol(
  symbol: string,
): string {
  if (
    typeof symbol !== "string" ||
    symbol.trim().length === 0
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance WebSocket symbol must be a non-empty string.",
    );
  }

  const normalizedSymbol = symbol
    .trim()
    .replace(/[-_/:\s]/g, "")
    .toLowerCase();

  if (!/^[a-z0-9]+$/.test(normalizedSymbol)) {
    throw new BinanceWebSocketValidationError(
      "Binance WebSocket symbol must contain only letters and numbers.",
    );
  }

  return normalizedSymbol;
}

export function assertBinanceWebSocketRequestId(
  id: number | string,
): void {
  if (typeof id === "number") {
    if (
      !Number.isSafeInteger(id) ||
      id < 0
    ) {
      throw new BinanceWebSocketValidationError(
        "Binance WebSocket numeric request ID must be a non-negative safe integer.",
      );
    }

    return;
  }

  if (
    typeof id !== "string" ||
    id.trim().length === 0
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance WebSocket request ID must be a non-empty string or non-negative integer.",
    );
  }
}

export function assertBinanceWebSocketStreamName(
  streamName: string,
): void {
  if (
    typeof streamName !== "string" ||
    streamName.trim().length === 0
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance WebSocket stream name must be a non-empty string.",
    );
  }

  if (
    streamName !== streamName.toLowerCase()
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance WebSocket stream names must be lowercase.",
    );
  }

  if (
    !/^[a-z0-9@_!]+$/.test(streamName)
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance WebSocket stream name contains unsupported characters.",
    );
  }
}

export function createBinanceTradeStreamName(
  symbol: string,
): string {
  return `${normalizeBinanceWebSocketSymbol(
    symbol,
  )}@trade`;
}

export function createBinanceAggregateTradeStreamName(
  symbol: string,
): string {
  return `${normalizeBinanceWebSocketSymbol(
    symbol,
  )}@aggTrade`.toLowerCase();
}

export function createBinanceTickerStreamName(
  symbol: string,
): string {
  return `${normalizeBinanceWebSocketSymbol(
    symbol,
  )}@ticker`;
}

export function createBinanceMiniTickerStreamName(
  symbol: string,
): string {
  return `${normalizeBinanceWebSocketSymbol(
    symbol,
  )}@miniTicker`.toLowerCase();
}

export function createBinanceBookTickerStreamName(
  symbol: string,
): string {
  return `${normalizeBinanceWebSocketSymbol(
    symbol,
  )}@bookTicker`.toLowerCase();
}

export function createBinanceKlineStreamName(
  symbol: string,
  interval: BinanceKlineInterval,
): string {
  if (
    typeof interval !== "string" ||
    interval.length === 0
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance kline interval must be provided.",
    );
  }

  return `${normalizeBinanceWebSocketSymbol(
    symbol,
  )}@kline_${interval}`;
}

export function createBinanceDepthStreamName(
  symbol: string,
  updateSpeed?: BinanceDepthUpdateSpeed,
): string {
  const baseStreamName =
    `${normalizeBinanceWebSocketSymbol(
      symbol,
    )}@depth`;

  return updateSpeed === undefined
    ? baseStreamName
    : `${baseStreamName}@${updateSpeed}`;
}

export function createBinancePartialDepthStreamName(
  symbol: string,
  level: BinancePartialDepthLevel,
  updateSpeed?: BinanceDepthUpdateSpeed,
): string {
  if (
    level !== 5 &&
    level !== 10 &&
    level !== 20
  ) {
    throw new BinanceWebSocketValidationError(
      "Binance partial-depth level must be 5, 10, or 20.",
    );
  }

  const baseStreamName =
    `${normalizeBinanceWebSocketSymbol(
      symbol,
    )}@depth${level}`;

  return updateSpeed === undefined
    ? baseStreamName
    : `${baseStreamName}@${updateSpeed}`;
}