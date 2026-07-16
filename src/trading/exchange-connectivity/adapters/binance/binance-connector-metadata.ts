/**
 * Binance connector metadata.
 *
 * Describes the Binance adapter to the exchange connector registry and
 * declares the capabilities supported by the initial Spot implementation.
 */

export const BINANCE_CONNECTOR_ID = "binance" as const;
export const BINANCE_CONNECTOR_NAME = "Binance" as const;
export const BINANCE_CONNECTOR_VERSION = "1.0.0" as const;

export type BinanceConnectorId = typeof BINANCE_CONNECTOR_ID;

export type BinanceMarketType = "spot";

export type BinanceOrderType =
  | "market"
  | "limit"
  | "stop-loss"
  | "stop-loss-limit"
  | "take-profit"
  | "take-profit-limit";

export type BinanceTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK";

export type BinanceRestCapability =
  | "server-time"
  | "exchange-information"
  | "symbols"
  | "ticker"
  | "order-book"
  | "recent-trades"
  | "candles"
  | "account-information"
  | "balances"
  | "open-orders"
  | "order-history"
  | "place-order"
  | "cancel-order"
  | "cancel-all-orders"
  | "query-order";

export type BinanceWebSocketCapability =
  | "trade-stream"
  | "aggregate-trade-stream"
  | "ticker-stream"
  | "mini-ticker-stream"
  | "book-ticker-stream"
  | "depth-stream"
  | "kline-stream"
  | "user-data-stream"
  | "execution-report-stream"
  | "balance-update-stream";

export interface BinanceConnectorCapabilities {
  readonly marketTypes: readonly BinanceMarketType[];
  readonly orderTypes: readonly BinanceOrderType[];
  readonly timeInForce: readonly BinanceTimeInForce[];
  readonly rest: readonly BinanceRestCapability[];
  readonly websocket: readonly BinanceWebSocketCapability[];

  readonly supportsPublicMarketData: boolean;
  readonly supportsPrivateAccountData: boolean;
  readonly supportsTrading: boolean;
  readonly supportsCancelAllOrders: boolean;
  readonly supportsBatchOrders: boolean;
  readonly supportsClientOrderId: boolean;
  readonly supportsOrderBookStreaming: boolean;
  readonly supportsCandleStreaming: boolean;
  readonly supportsUserDataStreaming: boolean;
  readonly supportsTestnet: boolean;
}

export interface BinanceConnectorMetadata {
  readonly id: BinanceConnectorId;
  readonly name: typeof BINANCE_CONNECTOR_NAME;
  readonly version: typeof BINANCE_CONNECTOR_VERSION;
  readonly exchange: "BINANCE";
  readonly description: string;
  readonly documentationUrl: string;
  readonly capabilities: BinanceConnectorCapabilities;
}

const BINANCE_MARKET_TYPES: readonly BinanceMarketType[] = Object.freeze([
  "spot",
]);

const BINANCE_ORDER_TYPES: readonly BinanceOrderType[] = Object.freeze([
  "market",
  "limit",
  "stop-loss",
  "stop-loss-limit",
  "take-profit",
  "take-profit-limit",
]);

const BINANCE_TIME_IN_FORCE: readonly BinanceTimeInForce[] = Object.freeze([
  "GTC",
  "IOC",
  "FOK",
]);

const BINANCE_REST_CAPABILITIES: readonly BinanceRestCapability[] =
  Object.freeze([
    "server-time",
    "exchange-information",
    "symbols",
    "ticker",
    "order-book",
    "recent-trades",
    "candles",
    "account-information",
    "balances",
    "open-orders",
    "order-history",
    "place-order",
    "cancel-order",
    "cancel-all-orders",
    "query-order",
  ]);

const BINANCE_WEBSOCKET_CAPABILITIES: readonly BinanceWebSocketCapability[] =
  Object.freeze([
    "trade-stream",
    "aggregate-trade-stream",
    "ticker-stream",
    "mini-ticker-stream",
    "book-ticker-stream",
    "depth-stream",
    "kline-stream",
    "user-data-stream",
    "execution-report-stream",
    "balance-update-stream",
  ]);

export const BINANCE_CONNECTOR_CAPABILITIES: BinanceConnectorCapabilities =
  Object.freeze({
    marketTypes: BINANCE_MARKET_TYPES,
    orderTypes: BINANCE_ORDER_TYPES,
    timeInForce: BINANCE_TIME_IN_FORCE,
    rest: BINANCE_REST_CAPABILITIES,
    websocket: BINANCE_WEBSOCKET_CAPABILITIES,

    supportsPublicMarketData: true,
    supportsPrivateAccountData: true,
    supportsTrading: true,
    supportsCancelAllOrders: true,
    supportsBatchOrders: false,
    supportsClientOrderId: true,
    supportsOrderBookStreaming: true,
    supportsCandleStreaming: true,
    supportsUserDataStreaming: true,
    supportsTestnet: true,
  });

export const BINANCE_CONNECTOR_METADATA: BinanceConnectorMetadata =
  Object.freeze({
    id: BINANCE_CONNECTOR_ID,
    name: BINANCE_CONNECTOR_NAME,
    version: BINANCE_CONNECTOR_VERSION,
    exchange: "BINANCE",
    description:
      "Production-grade Binance Spot exchange adapter with authenticated REST trading, public market data, private account data, deterministic request signing, rate limiting, retries, health monitoring, and WebSocket streaming.",
    documentationUrl:
      "https://developers.binance.com/docs/binance-spot-api-docs",
    capabilities: BINANCE_CONNECTOR_CAPABILITIES,
  });

export function isBinanceConnectorId(
  value: unknown,
): value is BinanceConnectorId {
  return value === BINANCE_CONNECTOR_ID;
}

export function supportsBinanceOrderType(
  orderType: string,
): orderType is BinanceOrderType {
  return BINANCE_CONNECTOR_CAPABILITIES.orderTypes.some(
    (supportedOrderType) => supportedOrderType === orderType,
  );
}

export function supportsBinanceTimeInForce(
  timeInForce: string,
): timeInForce is BinanceTimeInForce {
  return BINANCE_CONNECTOR_CAPABILITIES.timeInForce.some(
    (supportedTimeInForce) => supportedTimeInForce === timeInForce,
  );
}

export function supportsBinanceRestCapability(
  capability: string,
): capability is BinanceRestCapability {
  return BINANCE_CONNECTOR_CAPABILITIES.rest.some(
    (supportedCapability) => supportedCapability === capability,
  );
}

export function supportsBinanceWebSocketCapability(
  capability: string,
): capability is BinanceWebSocketCapability {
  return BINANCE_CONNECTOR_CAPABILITIES.websocket.some(
    (supportedCapability) => supportedCapability === capability,
  );
}