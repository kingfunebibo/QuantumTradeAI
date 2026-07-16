export * from "./binance-connector";
export * from "./binance-connector-config";
export * from "./binance-request-signer";
export * from "./binance-rest.types";
export * from "./binance-rest-client";
export * from "./binance-websocket.types";

/*
 * Connector metadata exports are explicit because the metadata module
 * contains BinanceOrderType and BinanceTimeInForce names that differ from
 * the uppercase REST API contract types with the same names.
 */
export {
  BINANCE_CONNECTOR_ID,
  BINANCE_CONNECTOR_NAME,
  BINANCE_CONNECTOR_VERSION,
  BINANCE_CONNECTOR_CAPABILITIES,
  BINANCE_CONNECTOR_METADATA,
  isBinanceConnectorId,
  supportsBinanceOrderType,
  supportsBinanceTimeInForce,
  supportsBinanceRestCapability,
  supportsBinanceWebSocketCapability,
} from "./binance-connector-metadata";

export type {
  BinanceConnectorId,
  BinanceMarketType,
  BinanceOrderType as BinanceMetadataOrderType,
  BinanceTimeInForce as BinanceMetadataTimeInForce,
  BinanceRestCapability,
  BinanceWebSocketCapability,
  BinanceConnectorCapabilities,
  BinanceConnectorMetadata,
} from "./binance-connector-metadata";

/*
 * BinanceWebSocketClock already exists in binance-websocket.types.ts.
 * The client dependency clock is therefore exported under a more specific
 * name to prevent a barrel-export collision.
 */
export {
  BinanceWebSocketClient,
  BinanceWebSocketClientConfigurationError,
} from "./binance-websocket-client";

export type {
  BinanceWebSocketRequestId,
  BinanceWebSocketEventListener,
  BinanceWebSocketStateListener,
  BinanceWebSocketErrorListener,
  BinanceWebSocketCloseListener,
  BinanceWebSocketCommandResponseListener,
  BinanceWebSocketLogger,
  BinanceWebSocketClock as BinanceWebSocketClientClock,
  BinanceWebSocketScheduler,
  BinanceWebSocketTransport,
  BinanceWebSocketTransportFactory,
  BinanceWebSocketClientDependencies,
  BinanceWebSocketConnectOptions,
  BinanceWebSocketSendCommandOptions,
  BinancePendingCommand,
} from "./binance-websocket-client";