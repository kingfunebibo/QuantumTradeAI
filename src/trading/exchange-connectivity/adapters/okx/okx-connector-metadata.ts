import {
  OKX_EXCHANGE_ID,
  type OkxExchangeId,
} from "./okx-connector-config";

export const OKX_CONNECTOR_ADAPTER_VERSION = "1.0.0" as const;

export type OkxConnectorAdapterVersion =
  typeof OKX_CONNECTOR_ADAPTER_VERSION;

export type OkxAssetClass =
  | "spot"
  | "margin"
  | "swap"
  | "futures"
  | "option";

export type OkxMarketDataCapability =
  | "instruments"
  | "tickers"
  | "ticker"
  | "order-book"
  | "trades"
  | "candles"
  | "mark-price"
  | "index-price"
  | "funding-rate"
  | "open-interest";

export type OkxTradingCapability =
  | "place-order"
  | "amend-order"
  | "cancel-order"
  | "cancel-all-orders"
  | "get-order"
  | "get-open-orders"
  | "get-order-history"
  | "get-fills";

export type OkxAccountCapability =
  | "balances"
  | "positions"
  | "account-configuration"
  | "maximum-order-size"
  | "maximum-available-balance"
  | "fee-rates";

export type OkxOrderType =
  | "market"
  | "limit"
  | "post-only"
  | "fill-or-kill"
  | "immediate-or-cancel"
  | "optimal-limit-ioc";

export type OkxOrderSide = "buy" | "sell";

export type OkxPositionSide = "long" | "short" | "net";

export type OkxTimeframe =
  | "1s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1H"
  | "2H"
  | "4H"
  | "6H"
  | "12H"
  | "1D"
  | "2D"
  | "3D"
  | "1W"
  | "1M"
  | "3M";

export type OkxWebSocketChannelScope =
  | "public"
  | "private"
  | "business";

export interface OkxConnectorIdentityMetadata {
  readonly exchangeId: OkxExchangeId;
  readonly connectorId: string;
  readonly displayName: string;
  readonly adapterVersion: OkxConnectorAdapterVersion;
  readonly apiVersion: string;
}

export interface OkxAuthenticationMetadata {
  readonly publicApiRequiresAuthentication: false;
  readonly privateApiRequiresAuthentication: true;
  readonly signingAlgorithm: "HMAC-SHA256";
  readonly signatureEncoding: "base64";
  readonly credentialFields: readonly [
    "apiKey",
    "secretKey",
    "passphrase",
  ];
  readonly requiresTimestamp: true;
  readonly supportsDemoTradingHeader: true;
}

export interface OkxRestCapabilityMetadata {
  readonly enabled: true;
  readonly supportsPublicEndpoints: true;
  readonly supportsPrivateEndpoints: true;
  readonly supportsRequestSigning: true;
  readonly supportsServerTimeSynchronization: true;
}

export interface OkxWebSocketCapabilityMetadata {
  readonly enabled: true;
  readonly scopes: readonly OkxWebSocketChannelScope[];
  readonly supportsPublicChannels: true;
  readonly supportsPrivateChannels: true;
  readonly supportsBusinessChannels: true;
  readonly supportsLogin: true;
  readonly supportsSubscriptions: true;
  readonly supportsUnsubscriptions: true;
  readonly supportsHeartbeat: true;
  readonly supportsReconnect: true;
}

export interface OkxFeatureMetadata {
  readonly supportsSpotTrading: true;
  readonly supportsMarginTrading: true;
  readonly supportsPerpetualSwaps: true;
  readonly supportsFutures: true;
  readonly supportsOptions: true;
  readonly supportsPortfolioMargin: true;
  readonly supportsDemoTrading: true;
  readonly supportsClientOrderIds: true;
  readonly supportsBatchOrders: true;
  readonly supportsOrderAmendment: true;
  readonly supportsPositionModes: true;
  readonly supportsSubAccounts: true;
}

export interface OkxConnectorMetadata {
  readonly identity: OkxConnectorIdentityMetadata;
  readonly authentication: OkxAuthenticationMetadata;
  readonly rest: OkxRestCapabilityMetadata;
  readonly websocket: OkxWebSocketCapabilityMetadata;
  readonly features: OkxFeatureMetadata;

  readonly assetClasses: readonly OkxAssetClass[];
  readonly marketDataCapabilities:
    readonly OkxMarketDataCapability[];
  readonly tradingCapabilities: readonly OkxTradingCapability[];
  readonly accountCapabilities: readonly OkxAccountCapability[];

  readonly orderTypes: readonly OkxOrderType[];
  readonly orderSides: readonly OkxOrderSide[];
  readonly positionSides: readonly OkxPositionSide[];
  readonly timeframes: readonly OkxTimeframe[];
}

const ASSET_CLASSES: readonly OkxAssetClass[] = Object.freeze([
  "spot",
  "margin",
  "swap",
  "futures",
  "option",
]);

const MARKET_DATA_CAPABILITIES:
  readonly OkxMarketDataCapability[] = Object.freeze([
    "instruments",
    "tickers",
    "ticker",
    "order-book",
    "trades",
    "candles",
    "mark-price",
    "index-price",
    "funding-rate",
    "open-interest",
  ]);

const TRADING_CAPABILITIES:
  readonly OkxTradingCapability[] = Object.freeze([
    "place-order",
    "amend-order",
    "cancel-order",
    "cancel-all-orders",
    "get-order",
    "get-open-orders",
    "get-order-history",
    "get-fills",
  ]);

const ACCOUNT_CAPABILITIES:
  readonly OkxAccountCapability[] = Object.freeze([
    "balances",
    "positions",
    "account-configuration",
    "maximum-order-size",
    "maximum-available-balance",
    "fee-rates",
  ]);

const ORDER_TYPES: readonly OkxOrderType[] = Object.freeze([
  "market",
  "limit",
  "post-only",
  "fill-or-kill",
  "immediate-or-cancel",
  "optimal-limit-ioc",
]);

const ORDER_SIDES: readonly OkxOrderSide[] = Object.freeze([
  "buy",
  "sell",
]);

const POSITION_SIDES: readonly OkxPositionSide[] = Object.freeze([
  "long",
  "short",
  "net",
]);

const TIMEFRAMES: readonly OkxTimeframe[] = Object.freeze([
  "1s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "2H",
  "4H",
  "6H",
  "12H",
  "1D",
  "2D",
  "3D",
  "1W",
  "1M",
  "3M",
]);

const WEBSOCKET_SCOPES:
  readonly OkxWebSocketChannelScope[] = Object.freeze([
    "public",
    "private",
    "business",
  ]);

const OKX_CREDENTIAL_FIELDS: readonly [
  "apiKey",
  "secretKey",
  "passphrase",
] = Object.freeze([
  "apiKey",
  "secretKey",
  "passphrase",
]);

const IDENTITY_METADATA: OkxConnectorIdentityMetadata =
  Object.freeze({
    exchangeId: OKX_EXCHANGE_ID,
    connectorId: "okx-v5",
    displayName: "OKX",
    adapterVersion: OKX_CONNECTOR_ADAPTER_VERSION,
    apiVersion: "v5",
  });

const AUTHENTICATION_METADATA: OkxAuthenticationMetadata =
  Object.freeze({
    publicApiRequiresAuthentication: false,
    privateApiRequiresAuthentication: true,
    signingAlgorithm: "HMAC-SHA256",
    signatureEncoding: "base64",
    credentialFields: OKX_CREDENTIAL_FIELDS,
    requiresTimestamp: true,
    supportsDemoTradingHeader: true,
  });

const REST_METADATA: OkxRestCapabilityMetadata = Object.freeze({
  enabled: true,
  supportsPublicEndpoints: true,
  supportsPrivateEndpoints: true,
  supportsRequestSigning: true,
  supportsServerTimeSynchronization: true,
});

const WEBSOCKET_METADATA: OkxWebSocketCapabilityMetadata =
  Object.freeze({
    enabled: true,
    scopes: WEBSOCKET_SCOPES,
    supportsPublicChannels: true,
    supportsPrivateChannels: true,
    supportsBusinessChannels: true,
    supportsLogin: true,
    supportsSubscriptions: true,
    supportsUnsubscriptions: true,
    supportsHeartbeat: true,
    supportsReconnect: true,
  });

const FEATURE_METADATA: OkxFeatureMetadata = Object.freeze({
  supportsSpotTrading: true,
  supportsMarginTrading: true,
  supportsPerpetualSwaps: true,
  supportsFutures: true,
  supportsOptions: true,
  supportsPortfolioMargin: true,
  supportsDemoTrading: true,
  supportsClientOrderIds: true,
  supportsBatchOrders: true,
  supportsOrderAmendment: true,
  supportsPositionModes: true,
  supportsSubAccounts: true,
});

export const OKX_CONNECTOR_METADATA: OkxConnectorMetadata =
  Object.freeze({
    identity: IDENTITY_METADATA,
    authentication: AUTHENTICATION_METADATA,
    rest: REST_METADATA,
    websocket: WEBSOCKET_METADATA,
    features: FEATURE_METADATA,
    assetClasses: ASSET_CLASSES,
    marketDataCapabilities: MARKET_DATA_CAPABILITIES,
    tradingCapabilities: TRADING_CAPABILITIES,
    accountCapabilities: ACCOUNT_CAPABILITIES,
    orderTypes: ORDER_TYPES,
    orderSides: ORDER_SIDES,
    positionSides: POSITION_SIDES,
    timeframes: TIMEFRAMES,
  });

export function getOkxConnectorMetadata(): OkxConnectorMetadata {
  return OKX_CONNECTOR_METADATA;
}

export function supportsOkxAssetClass(
  assetClass: string,
): assetClass is OkxAssetClass {
  return includesString(ASSET_CLASSES, assetClass);
}

export function supportsOkxMarketDataCapability(
  capability: string,
): capability is OkxMarketDataCapability {
  return includesString(MARKET_DATA_CAPABILITIES, capability);
}

export function supportsOkxTradingCapability(
  capability: string,
): capability is OkxTradingCapability {
  return includesString(TRADING_CAPABILITIES, capability);
}

export function supportsOkxAccountCapability(
  capability: string,
): capability is OkxAccountCapability {
  return includesString(ACCOUNT_CAPABILITIES, capability);
}

export function supportsOkxOrderType(
  orderType: string,
): orderType is OkxOrderType {
  return includesString(ORDER_TYPES, orderType);
}

export function supportsOkxTimeframe(
  timeframe: string,
): timeframe is OkxTimeframe {
  return includesString(TIMEFRAMES, timeframe);
}

function includesString<TValue extends string>(
  values: readonly TValue[],
  value: string,
): value is TValue {
  return values.some((candidate) => candidate === value);
}