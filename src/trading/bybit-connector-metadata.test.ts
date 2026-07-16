import assert from "node:assert/strict";

import {
  BYBIT_CONNECTOR_ADAPTER_VERSION,
  BYBIT_CONNECTOR_METADATA,
  getBybitConnectorMetadata,
  supportsBybitAccountCapability,
  supportsBybitAssetClass,
  supportsBybitMarketDataCapability,
  supportsBybitOrderType,
  supportsBybitTimeframe,
  supportsBybitTradingCapability,
} from "./exchange-connectivity/adapters/bybit/bybit-connector-metadata";

function testConnectorIdentity(): void {
  const metadata = getBybitConnectorMetadata();

  assert.equal(
    metadata.identity.exchangeId,
    "bybit",
  );

  assert.equal(
    metadata.identity.connectorId,
    "bybit-v5",
  );

  assert.equal(
    metadata.identity.displayName,
    "Bybit",
  );

  assert.equal(
    metadata.identity.apiVersion,
    "v5",
  );

  assert.equal(
    metadata.identity.adapterVersion,
    BYBIT_CONNECTOR_ADAPTER_VERSION,
  );

  assert.equal(
    BYBIT_CONNECTOR_ADAPTER_VERSION,
    "1.0.0",
  );
}

function testAuthenticationMetadata(): void {
  const { authentication } =
    BYBIT_CONNECTOR_METADATA;

  assert.equal(
    authentication.publicApiRequiresAuthentication,
    false,
  );

  assert.equal(
    authentication.privateApiRequiresAuthentication,
    true,
  );

  assert.deepEqual(
    authentication.supportedSigningAlgorithms,
    [
      "HMAC-SHA256",
      "RSA-SHA256",
    ],
  );

  assert.deepEqual(
    authentication.signatureEncoding,
    [
      "hex",
      "base64",
    ],
  );

  assert.deepEqual(
    authentication.credentialFields,
    [
      "apiKey",
      "secretKey",
    ],
  );

  assert.equal(
    authentication.requiresTimestamp,
    true,
  );

  assert.equal(
    authentication.requiresReceiveWindow,
    true,
  );

  assert.equal(
    authentication.supportsDemoTrading,
    true,
  );
}

function testRestMetadata(): void {
  const { rest } =
    BYBIT_CONNECTOR_METADATA;

  assert.equal(rest.enabled, true);

  assert.equal(
    rest.supportsPublicEndpoints,
    true,
  );

  assert.equal(
    rest.supportsPrivateEndpoints,
    true,
  );

  assert.equal(
    rest.supportsRequestSigning,
    true,
  );

  assert.equal(
    rest.supportsServerTimeSynchronization,
    true,
  );

  assert.equal(
    rest.supportsUnifiedV5Api,
    true,
  );
}

function testWebSocketMetadata(): void {
  const { websocket } =
    BYBIT_CONNECTOR_METADATA;

  assert.equal(websocket.enabled, true);

  assert.deepEqual(
    websocket.scopes,
    [
      "public-spot",
      "public-linear",
      "public-inverse",
      "public-option",
      "private",
      "trade",
    ],
  );

  assert.equal(
    websocket.supportsPublicChannels,
    true,
  );

  assert.equal(
    websocket.supportsPrivateChannels,
    true,
  );

  assert.equal(
    websocket.supportsTradeEndpoint,
    true,
  );

  assert.equal(
    websocket.supportsAuthentication,
    true,
  );

  assert.equal(
    websocket.supportsSubscriptions,
    true,
  );

  assert.equal(
    websocket.supportsUnsubscriptions,
    true,
  );

  assert.equal(
    websocket.supportsHeartbeat,
    true,
  );

  assert.equal(
    websocket.supportsReconnect,
    true,
  );
}

function testFeatureMetadata(): void {
  const { features } =
    BYBIT_CONNECTOR_METADATA;

  assert.equal(
    features.supportsSpotTrading,
    true,
  );

  assert.equal(
    features.supportsMarginTrading,
    true,
  );

  assert.equal(
    features.supportsLinearContracts,
    true,
  );

  assert.equal(
    features.supportsInverseContracts,
    true,
  );

  assert.equal(
    features.supportsOptions,
    true,
  );

  assert.equal(
    features.supportsUnifiedTradingAccount,
    true,
  );

  assert.equal(
    features.supportsDemoTrading,
    true,
  );

  assert.equal(
    features.supportsClientOrderIds,
    true,
  );

  assert.equal(
    features.supportsBatchOrders,
    true,
  );

  assert.equal(
    features.supportsOrderAmendment,
    true,
  );

  assert.equal(
    features.supportsPositionModes,
    true,
  );

  assert.equal(
    features.supportsWebSocketOrderEntry,
    true,
  );
}

function testAssetClasses(): void {
  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA.assetClasses,
    [
      "spot",
      "margin",
      "linear",
      "inverse",
      "option",
    ],
  );

  assert.equal(
    supportsBybitAssetClass("spot"),
    true,
  );

  assert.equal(
    supportsBybitAssetClass("linear"),
    true,
  );

  assert.equal(
    supportsBybitAssetClass("futures"),
    false,
  );
}

function testMarketDataCapabilities(): void {
  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA
      .marketDataCapabilities,
    [
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
    ],
  );

  assert.equal(
    supportsBybitMarketDataCapability(
      "ticker",
    ),
    true,
  );

  assert.equal(
    supportsBybitMarketDataCapability(
      "open-interest",
    ),
    true,
  );

  assert.equal(
    supportsBybitMarketDataCapability(
      "liquidations",
    ),
    false,
  );
}

function testTradingCapabilities(): void {
  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA
      .tradingCapabilities,
    [
      "place-order",
      "amend-order",
      "cancel-order",
      "cancel-all-orders",
      "get-order",
      "get-open-orders",
      "get-order-history",
      "get-trade-history",
    ],
  );

  assert.equal(
    supportsBybitTradingCapability(
      "place-order",
    ),
    true,
  );

  assert.equal(
    supportsBybitTradingCapability(
      "amend-order",
    ),
    true,
  );

  assert.equal(
    supportsBybitTradingCapability(
      "replace-order",
    ),
    false,
  );
}

function testAccountCapabilities(): void {
  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA
      .accountCapabilities,
    [
      "wallet-balance",
      "balances",
      "positions",
      "account-info",
      "fee-rates",
      "transaction-log",
      "coin-greeks",
    ],
  );

  assert.equal(
    supportsBybitAccountCapability(
      "wallet-balance",
    ),
    true,
  );

  assert.equal(
    supportsBybitAccountCapability(
      "coin-greeks",
    ),
    true,
  );

  assert.equal(
    supportsBybitAccountCapability(
      "subaccounts",
    ),
    false,
  );
}

function testOrderMetadata(): void {
  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA.orderTypes,
    [
      "market",
      "limit",
    ],
  );

  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA.orderSides,
    [
      "buy",
      "sell",
    ],
  );

  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA.positionSides,
    [
      "one-way",
      "buy",
      "sell",
    ],
  );

  assert.equal(
    supportsBybitOrderType("market"),
    true,
  );

  assert.equal(
    supportsBybitOrderType("limit"),
    true,
  );

  assert.equal(
    supportsBybitOrderType("stop"),
    false,
  );
}

function testTimeframes(): void {
  assert.deepEqual(
    BYBIT_CONNECTOR_METADATA.timeframes,
    [
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
    ],
  );

  assert.equal(
    supportsBybitTimeframe("1"),
    true,
  );

  assert.equal(
    supportsBybitTimeframe("720"),
    true,
  );

  assert.equal(
    supportsBybitTimeframe("D"),
    true,
  );

  assert.equal(
    supportsBybitTimeframe("2"),
    false,
  );

  assert.equal(
    supportsBybitTimeframe("1m"),
    false,
  );
}

function testMetadataSingleton(): void {
  const first =
    getBybitConnectorMetadata();

  const second =
    getBybitConnectorMetadata();

  assert.equal(
    first,
    BYBIT_CONNECTOR_METADATA,
  );

  assert.equal(first, second);
}

function testDeepImmutability(): void {
  const metadata =
    BYBIT_CONNECTOR_METADATA;

  assert.equal(
    Object.isFrozen(metadata),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.identity),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.authentication),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.authentication
        .supportedSigningAlgorithms,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.authentication
        .signatureEncoding,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.authentication
        .credentialFields,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.rest),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.websocket),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.websocket.scopes,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.features),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.assetClasses,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.marketDataCapabilities,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.tradingCapabilities,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.accountCapabilities,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.orderTypes),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.orderSides),
    true,
  );

  assert.equal(
    Object.isFrozen(
      metadata.positionSides,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(metadata.timeframes),
    true,
  );
}

function testTypeGuardsAreDeterministic(): void {
  const values = [
    supportsBybitAssetClass("spot"),
    supportsBybitMarketDataCapability(
      "ticker",
    ),
    supportsBybitTradingCapability(
      "place-order",
    ),
    supportsBybitAccountCapability(
      "positions",
    ),
    supportsBybitOrderType("limit"),
    supportsBybitTimeframe("D"),
  ];

  assert.deepEqual(
    values,
    [
      true,
      true,
      true,
      true,
      true,
      true,
    ],
  );

  assert.deepEqual(
    values,
    [
      supportsBybitAssetClass("spot"),
      supportsBybitMarketDataCapability(
        "ticker",
      ),
      supportsBybitTradingCapability(
        "place-order",
      ),
      supportsBybitAccountCapability(
        "positions",
      ),
      supportsBybitOrderType("limit"),
      supportsBybitTimeframe("D"),
    ],
  );
}

function runBybitConnectorMetadataTests(): void {
  testConnectorIdentity();
  testAuthenticationMetadata();
  testRestMetadata();
  testWebSocketMetadata();
  testFeatureMetadata();
  testAssetClasses();
  testMarketDataCapabilities();
  testTradingCapabilities();
  testAccountCapabilities();
  testOrderMetadata();
  testTimeframes();
  testMetadataSingleton();
  testDeepImmutability();
  testTypeGuardsAreDeterministic();

  console.log(
    "All Bybit connector metadata tests passed successfully.",
  );
}

runBybitConnectorMetadataTests();