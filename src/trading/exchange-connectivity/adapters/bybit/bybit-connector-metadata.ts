/**
 * QuantumTradeAI
 * Milestone 17 — Bybit Exchange Adapter
 *
 * Immutable Bybit V5 connector metadata.
 *
 * This module describes the adapter identity, authentication model,
 * transport capabilities, supported product classes, market-data features,
 * trading features, account features, order metadata, and supported candle
 * intervals.
 */

export const BYBIT_CONNECTOR_ADAPTER_VERSION =
  "1.0.0";

export type BybitAssetClass =
  | "spot"
  | "margin"
  | "linear"
  | "inverse"
  | "option";

export type BybitMarketDataCapability =
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

export type BybitTradingCapability =
  | "place-order"
  | "amend-order"
  | "cancel-order"
  | "cancel-all-orders"
  | "get-order"
  | "get-open-orders"
  | "get-order-history"
  | "get-trade-history";

export type BybitAccountCapability =
  | "wallet-balance"
  | "balances"
  | "positions"
  | "account-info"
  | "fee-rates"
  | "transaction-log"
  | "coin-greeks";

export type BybitOrderType =
  | "market"
  | "limit";

export type BybitOrderSide =
  | "buy"
  | "sell";

export type BybitPositionSide =
  | "one-way"
  | "buy"
  | "sell";

export type BybitTimeframe =
  | "1"
  | "3"
  | "5"
  | "15"
  | "30"
  | "60"
  | "120"
  | "240"
  | "360"
  | "720"
  | "D"
  | "W"
  | "M";

export type BybitWebSocketScope =
  | "public-spot"
  | "public-linear"
  | "public-inverse"
  | "public-option"
  | "private"
  | "trade";

export interface BybitConnectorIdentityMetadata {
  readonly exchangeId: "bybit";
  readonly connectorId: "bybit-v5";
  readonly displayName: "Bybit";
  readonly adapterVersion: string;
  readonly apiVersion: "v5";
}

export interface BybitAuthenticationMetadata {
  readonly publicApiRequiresAuthentication: false;
  readonly privateApiRequiresAuthentication: true;
  readonly supportedSigningAlgorithms:
    readonly [
      "HMAC-SHA256",
      "RSA-SHA256",
    ];
  readonly signatureEncoding:
    readonly [
      "hex",
      "base64",
    ];
  readonly credentialFields:
    readonly [
      "apiKey",
      "secretKey",
    ];
  readonly requiresTimestamp: true;
  readonly requiresReceiveWindow: true;
  readonly supportsDemoTrading: true;
}

export interface BybitRestMetadata {
  readonly enabled: true;
  readonly supportsPublicEndpoints: true;
  readonly supportsPrivateEndpoints: true;
  readonly supportsRequestSigning: true;
  readonly supportsServerTimeSynchronization: true;
  readonly supportsUnifiedV5Api: true;
}

export interface BybitWebSocketMetadata {
  readonly enabled: true;
  readonly scopes: readonly BybitWebSocketScope[];
  readonly supportsPublicChannels: true;
  readonly supportsPrivateChannels: true;
  readonly supportsTradeEndpoint: true;
  readonly supportsAuthentication: true;
  readonly supportsSubscriptions: true;
  readonly supportsUnsubscriptions: true;
  readonly supportsHeartbeat: true;
  readonly supportsReconnect: true;
}

export interface BybitFeatureMetadata {
  readonly supportsSpotTrading: true;
  readonly supportsMarginTrading: true;
  readonly supportsLinearContracts: true;
  readonly supportsInverseContracts: true;
  readonly supportsOptions: true;
  readonly supportsUnifiedTradingAccount: true;
  readonly supportsDemoTrading: true;
  readonly supportsClientOrderIds: true;
  readonly supportsBatchOrders: true;
  readonly supportsOrderAmendment: true;
  readonly supportsPositionModes: true;
  readonly supportsWebSocketOrderEntry: true;
}

export interface BybitConnectorMetadata {
  readonly identity:
    BybitConnectorIdentityMetadata;

  readonly authentication:
    BybitAuthenticationMetadata;

  readonly rest:
    BybitRestMetadata;

  readonly websocket:
    BybitWebSocketMetadata;

  readonly features:
    BybitFeatureMetadata;

  readonly assetClasses:
    readonly BybitAssetClass[];

  readonly marketDataCapabilities:
    readonly BybitMarketDataCapability[];

  readonly tradingCapabilities:
    readonly BybitTradingCapability[];

  readonly accountCapabilities:
    readonly BybitAccountCapability[];

  readonly orderTypes:
    readonly BybitOrderType[];

  readonly orderSides:
    readonly BybitOrderSide[];

  readonly positionSides:
    readonly BybitPositionSide[];

  readonly timeframes:
    readonly BybitTimeframe[];
}

const BYBIT_ASSET_CLASSES:
  readonly BybitAssetClass[] =
    Object.freeze([
      "spot",
      "margin",
      "linear",
      "inverse",
      "option",
    ]);

const BYBIT_MARKET_DATA_CAPABILITIES:
  readonly BybitMarketDataCapability[] =
    Object.freeze([
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

const BYBIT_TRADING_CAPABILITIES:
  readonly BybitTradingCapability[] =
    Object.freeze([
      "place-order",
      "amend-order",
      "cancel-order",
      "cancel-all-orders",
      "get-order",
      "get-open-orders",
      "get-order-history",
      "get-trade-history",
    ]);

const BYBIT_ACCOUNT_CAPABILITIES:
  readonly BybitAccountCapability[] =
    Object.freeze([
      "wallet-balance",
      "balances",
      "positions",
      "account-info",
      "fee-rates",
      "transaction-log",
      "coin-greeks",
    ]);

const BYBIT_ORDER_TYPES:
  readonly BybitOrderType[] =
    Object.freeze([
      "market",
      "limit",
    ]);

const BYBIT_ORDER_SIDES:
  readonly BybitOrderSide[] =
    Object.freeze([
      "buy",
      "sell",
    ]);

const BYBIT_POSITION_SIDES:
  readonly BybitPositionSide[] =
    Object.freeze([
      "one-way",
      "buy",
      "sell",
    ]);

const BYBIT_TIMEFRAMES:
  readonly BybitTimeframe[] =
    Object.freeze([
      "1",
      "3",
      "5",
      "15",
      "30",
      "60",
      "120",
      "240",
      "360",
      "720",
      "D",
      "W",
      "M",
    ]);

const BYBIT_WEBSOCKET_SCOPES:
  readonly BybitWebSocketScope[] =
    Object.freeze([
      "public-spot",
      "public-linear",
      "public-inverse",
      "public-option",
      "private",
      "trade",
    ]);

export const BYBIT_CONNECTOR_METADATA:
  BybitConnectorMetadata =
    Object.freeze({
      identity: Object.freeze({
        exchangeId: "bybit",
        connectorId: "bybit-v5",
        displayName: "Bybit",
        adapterVersion:
          BYBIT_CONNECTOR_ADAPTER_VERSION,
        apiVersion: "v5",
      }),

      authentication: Object.freeze({
        publicApiRequiresAuthentication:
          false,
        privateApiRequiresAuthentication:
          true,
        supportedSigningAlgorithms:
          Object.freeze(
            [
              "HMAC-SHA256",
              "RSA-SHA256",
            ] as const,
          ),
        signatureEncoding:
          Object.freeze(
            [
              "hex",
              "base64",
            ] as const,
          ),
        credentialFields:
          Object.freeze(
            [
              "apiKey",
              "secretKey",
            ] as const,
          ),
        requiresTimestamp: true,
        requiresReceiveWindow: true,
        supportsDemoTrading: true,
      }),

      rest: Object.freeze({
        enabled: true,
        supportsPublicEndpoints: true,
        supportsPrivateEndpoints: true,
        supportsRequestSigning: true,
        supportsServerTimeSynchronization:
          true,
        supportsUnifiedV5Api: true,
      }),

      websocket: Object.freeze({
        enabled: true,
        scopes: BYBIT_WEBSOCKET_SCOPES,
        supportsPublicChannels: true,
        supportsPrivateChannels: true,
        supportsTradeEndpoint: true,
        supportsAuthentication: true,
        supportsSubscriptions: true,
        supportsUnsubscriptions: true,
        supportsHeartbeat: true,
        supportsReconnect: true,
      }),

      features: Object.freeze({
        supportsSpotTrading: true,
        supportsMarginTrading: true,
        supportsLinearContracts: true,
        supportsInverseContracts: true,
        supportsOptions: true,
        supportsUnifiedTradingAccount:
          true,
        supportsDemoTrading: true,
        supportsClientOrderIds: true,
        supportsBatchOrders: true,
        supportsOrderAmendment: true,
        supportsPositionModes: true,
        supportsWebSocketOrderEntry: true,
      }),

      assetClasses:
        BYBIT_ASSET_CLASSES,

      marketDataCapabilities:
        BYBIT_MARKET_DATA_CAPABILITIES,

      tradingCapabilities:
        BYBIT_TRADING_CAPABILITIES,

      accountCapabilities:
        BYBIT_ACCOUNT_CAPABILITIES,

      orderTypes:
        BYBIT_ORDER_TYPES,

      orderSides:
        BYBIT_ORDER_SIDES,

      positionSides:
        BYBIT_POSITION_SIDES,

      timeframes:
        BYBIT_TIMEFRAMES,
    });

export function getBybitConnectorMetadata():
  BybitConnectorMetadata {
  return BYBIT_CONNECTOR_METADATA;
}

export function supportsBybitAssetClass(
  value: string,
): value is BybitAssetClass {
  return includesString(
    BYBIT_ASSET_CLASSES,
    value,
  );
}

export function supportsBybitMarketDataCapability(
  value: string,
): value is BybitMarketDataCapability {
  return includesString(
    BYBIT_MARKET_DATA_CAPABILITIES,
    value,
  );
}

export function supportsBybitTradingCapability(
  value: string,
): value is BybitTradingCapability {
  return includesString(
    BYBIT_TRADING_CAPABILITIES,
    value,
  );
}

export function supportsBybitAccountCapability(
  value: string,
): value is BybitAccountCapability {
  return includesString(
    BYBIT_ACCOUNT_CAPABILITIES,
    value,
  );
}

export function supportsBybitOrderType(
  value: string,
): value is BybitOrderType {
  return includesString(
    BYBIT_ORDER_TYPES,
    value,
  );
}

export function supportsBybitTimeframe(
  value: string,
): value is BybitTimeframe {
  return includesString(
    BYBIT_TIMEFRAMES,
    value,
  );
}

function includesString<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}