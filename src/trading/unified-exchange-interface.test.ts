import assert from "node:assert/strict";

import {
  UnifiedExchangeError,
  assertUnifiedPositiveNumber,
  assertUnifiedTimestamp,
  freezeUnifiedMetadata,
  normalizeUnifiedExchangeId,
  normalizeUnifiedExchangeSymbol,
  validateUnifiedPlaceOrderRequest,
  type UnifiedExchangeErrorCode,
  type UnifiedPlaceOrderRequest,
} from "./exchange-connectivity/management/unified-exchange-interface";

function assertUnifiedExchangeError(
  operation: () => unknown,
  expectedCode: UnifiedExchangeErrorCode,
): UnifiedExchangeError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof UnifiedExchangeError,
    `Expected UnifiedExchangeError but received ${
      capturedError instanceof Error
        ? capturedError.constructor.name
        : typeof capturedError
    }.`,
  );

  assert.equal(
    capturedError.code,
    expectedCode,
  );

  return capturedError;
}

function createValidLimitOrder(
  overrides: Partial<UnifiedPlaceOrderRequest> = {},
): UnifiedPlaceOrderRequest {
  return {
    symbol: "BTC-USDT",
    marketType: "SPOT",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 0.5,
    price: 65_000,
    timeInForce: "GTC",
    clientOrderId: "order-001",
    requestId: "request-001",
    requestedAt: 1_000,
    sandbox: false,
    metadata: {
      strategyId: "ema-crossover",
    },
    ...overrides,
  };
}

function testUnifiedExchangeErrorProperties(): void {
  const cause =
    new Error("Underlying adapter failure");

  const error =
    new UnifiedExchangeError(
      "NETWORK_ERROR",
      "Exchange request failed.",
      {
        exchangeId: "okx",
        operation: "getTicker",
        retryable: true,
        cause,
      },
    );

  assert.equal(
    error.name,
    "UnifiedExchangeError",
  );

  assert.equal(
    error.code,
    "NETWORK_ERROR",
  );

  assert.equal(
    error.exchangeId,
    "okx",
  );

  assert.equal(
    error.operation,
    "getTicker",
  );

  assert.equal(
    error.retryable,
    true,
  );

  assert.equal(
    error.cause,
    cause,
  );

  assert.ok(
    error instanceof Error,
  );
}

function testUnifiedExchangeErrorDefaults(): void {
  const error =
    new UnifiedExchangeError(
      "UNKNOWN_ERROR",
      "Unknown failure.",
    );

  assert.equal(
    error.retryable,
    false,
  );

  assert.equal(
    error.exchangeId,
    undefined,
  );

  assert.equal(
    error.operation,
    undefined,
  );

  assert.equal(
    error.cause,
    undefined,
  );
}

function testExchangeIdNormalization(): void {
  assert.equal(
    normalizeUnifiedExchangeId(
      " OKX ",
    ),
    "okx",
  );

  assert.equal(
    normalizeUnifiedExchangeId(
      "BINANCE",
    ),
    "binance",
  );

  assert.equal(
    normalizeUnifiedExchangeId(
      "BYBIT_TESTNET",
    ),
    "bybit-testnet",
  );

  assert.equal(
    normalizeUnifiedExchangeId(
      "exchange:v2",
    ),
    "exchange:v2",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeId(
        "",
      ),
    "INVALID_EXCHANGE_ID",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeId(
        "invalid/exchange",
      ),
    "INVALID_EXCHANGE_ID",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeId(
        123 as unknown as string,
      ),
    "INVALID_EXCHANGE_ID",
  );
}

function testSymbolNormalization(): void {
  assert.equal(
    normalizeUnifiedExchangeSymbol(
      " btc-usdt ",
    ),
    "BTC-USDT",
  );

  assert.equal(
    normalizeUnifiedExchangeSymbol(
      "eth_usdt",
    ),
    "ETH_USDT",
  );

  assert.equal(
    normalizeUnifiedExchangeSymbol(
      "btc/usdt",
    ),
    "BTC/USDT",
  );

  assert.equal(
    normalizeUnifiedExchangeSymbol(
      "BTC:USDT",
    ),
    "BTC:USDT",
  );

  assert.equal(
    normalizeUnifiedExchangeSymbol(
      "BTC.USDT",
    ),
    "BTC.USDT",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeSymbol(
        "",
      ),
    "INVALID_SYMBOL",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeSymbol(
        "   ",
      ),
    "INVALID_SYMBOL",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeSymbol(
        "-BTCUSDT",
      ),
    "INVALID_SYMBOL",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeSymbol(
        "BTC USDT",
      ),
    "INVALID_SYMBOL",
  );

  assertUnifiedExchangeError(
    () =>
      normalizeUnifiedExchangeSymbol(
        null as unknown as string,
      ),
    "INVALID_SYMBOL",
  );
}

function testPositiveNumberValidation(): void {
  assert.doesNotThrow(() =>
    assertUnifiedPositiveNumber(
      1,
      "Order quantity",
    ),
  );

  assert.doesNotThrow(() =>
    assertUnifiedPositiveNumber(
      0.000_001,
      "Order price",
    ),
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedPositiveNumber(
        0,
        "Order quantity",
      ),
    "INVALID_QUANTITY",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedPositiveNumber(
        -1,
        "Order quantity",
      ),
    "INVALID_QUANTITY",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedPositiveNumber(
        Number.NaN,
        "Order quantity",
      ),
    "INVALID_QUANTITY",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedPositiveNumber(
        Number.POSITIVE_INFINITY,
        "Order quantity",
      ),
    "INVALID_QUANTITY",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedPositiveNumber(
        0,
        "Limit price",
      ),
    "INVALID_PRICE",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedPositiveNumber(
        -10,
        "Stop price",
      ),
    "INVALID_PRICE",
  );
}

function testTimestampValidation(): void {
  assert.doesNotThrow(() =>
    assertUnifiedTimestamp(
      0,
    ),
  );

  assert.doesNotThrow(() =>
    assertUnifiedTimestamp(
      1_000,
      "Requested timestamp",
    ),
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedTimestamp(
        -1,
      ),
    "INVALID_TIMESTAMP",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedTimestamp(
        Number.NaN,
      ),
    "INVALID_TIMESTAMP",
  );

  assertUnifiedExchangeError(
    () =>
      assertUnifiedTimestamp(
        Number.POSITIVE_INFINITY,
      ),
    "INVALID_TIMESTAMP",
  );
}

function testMetadataFreezing(): void {
  const metadata =
    freezeUnifiedMetadata({
      strategyId: "ema-crossover",
      attempt: 1,
    });

  assert.deepEqual(
    metadata,
    {
      strategyId: "ema-crossover",
      attempt: 1,
    },
  );

  assert.ok(
    Object.isFrozen(metadata),
  );

  assert.equal(
    freezeUnifiedMetadata(
      undefined,
    ),
    undefined,
  );

  assertUnifiedExchangeError(
    () =>
      freezeUnifiedMetadata(
        null as unknown as Readonly<
          Record<string, unknown>
        >,
      ),
    "INVALID_REQUEST",
  );

  assertUnifiedExchangeError(
    () =>
      freezeUnifiedMetadata(
        [] as unknown as Readonly<
          Record<string, unknown>
        >,
      ),
    "INVALID_REQUEST",
  );
}

function testValidLimitOrderValidation(): void {
  const request =
    createValidLimitOrder();

  const result =
    validateUnifiedPlaceOrderRequest(
      request,
    );

  assert.equal(
    result.symbol,
    "BTC-USDT",
  );

  assert.equal(
    result.marketType,
    "SPOT",
  );

  assert.equal(
    result.side,
    "BUY",
  );

  assert.equal(
    result.orderType,
    "LIMIT",
  );

  assert.equal(
    result.quantity,
    0.5,
  );

  assert.equal(
    result.price,
    65_000,
  );

  assert.equal(
    result.timeInForce,
    "GTC",
  );

  assert.equal(
    result.clientOrderId,
    "order-001",
  );

  assert.equal(
    result.requestId,
    "request-001",
  );

  assert.equal(
    result.requestedAt,
    1_000,
  );

  assert.equal(
    result.sandbox,
    false,
  );

  assert.deepEqual(
    result.metadata,
    {
      strategyId: "ema-crossover",
    },
  );

  assert.ok(
    Object.isFrozen(result),
  );

  assert.ok(
    Object.isFrozen(
      result.metadata,
    ),
  );

  assert.notEqual(
    result,
    request,
  );

  assert.notEqual(
    result.metadata,
    request.metadata,
  );
}

function testMarketOrderValidation(): void {
  const result =
    validateUnifiedPlaceOrderRequest({
      symbol: "eth-usdt",
      marketType: "SPOT",
      side: "SELL",
      orderType: "MARKET",
      quantity: 2,
    });

  assert.equal(
    result.symbol,
    "ETH-USDT",
  );

  assert.equal(
    result.price,
    undefined,
  );

  assert.equal(
    result.stopPrice,
    undefined,
  );
}

function testStopOrderValidation(): void {
  const result =
    validateUnifiedPlaceOrderRequest({
      symbol: "BTC-USDT",
      marketType: "SPOT",
      side: "SELL",
      orderType: "STOP",
      quantity: 0.25,
      stopPrice: 60_000,
    });

  assert.equal(
    result.orderType,
    "STOP",
  );

  assert.equal(
    result.stopPrice,
    60_000,
  );

  assert.equal(
    result.price,
    undefined,
  );
}

function testStopLimitOrderValidation(): void {
  const result =
    validateUnifiedPlaceOrderRequest({
      symbol: "BTC-USDT",
      marketType: "SPOT",
      side: "SELL",
      orderType: "STOP_LIMIT",
      quantity: 0.25,
      price: 59_500,
      stopPrice: 60_000,
      timeInForce: "GTC",
    });

  assert.equal(
    result.orderType,
    "STOP_LIMIT",
  );

  assert.equal(
    result.price,
    59_500,
  );

  assert.equal(
    result.stopPrice,
    60_000,
  );
}

function testTakeProfitOrderValidation(): void {
  const result =
    validateUnifiedPlaceOrderRequest({
      symbol: "BTC-USDT",
      marketType: "PERPETUAL",
      side: "SELL",
      orderType: "TAKE_PROFIT",
      quantity: 1,
      stopPrice: 70_000,
      reduceOnly: true,
      positionSide: "LONG",
    });

  assert.equal(
    result.orderType,
    "TAKE_PROFIT",
  );

  assert.equal(
    result.stopPrice,
    70_000,
  );

  assert.equal(
    result.reduceOnly,
    true,
  );

  assert.equal(
    result.positionSide,
    "LONG",
  );
}

function testTakeProfitLimitValidation(): void {
  const result =
    validateUnifiedPlaceOrderRequest({
      symbol: "BTC-USDT",
      marketType: "PERPETUAL",
      side: "SELL",
      orderType: "TAKE_PROFIT_LIMIT",
      quantity: 1,
      stopPrice: 70_000,
      price: 69_900,
      timeInForce: "GTC",
      reduceOnly: true,
    });

  assert.equal(
    result.orderType,
    "TAKE_PROFIT_LIMIT",
  );

  assert.equal(
    result.stopPrice,
    70_000,
  );

  assert.equal(
    result.price,
    69_900,
  );
}

function testTrailingStopValidation(): void {
  const result =
    validateUnifiedPlaceOrderRequest({
      symbol: "BTC-USDT",
      marketType: "PERPETUAL",
      side: "SELL",
      orderType: "TRAILING_STOP",
      quantity: 1,
      positionSide: "LONG",
      reduceOnly: true,
    });

  assert.equal(
    result.orderType,
    "TRAILING_STOP",
  );

  assert.equal(
    result.price,
    undefined,
  );

  assert.equal(
    result.stopPrice,
    undefined,
  );
}

function testInvalidRequestShape(): void {
  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        null as unknown as UnifiedPlaceOrderRequest,
      ),
    "INVALID_REQUEST",
  );

  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        [] as unknown as UnifiedPlaceOrderRequest,
      ),
    "INVALID_REQUEST",
  );
}

function testInvalidOrderQuantity(): void {
  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          quantity: 0,
        }),
      ),
    "INVALID_QUANTITY",
  );

  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          quantity: -1,
        }),
      ),
    "INVALID_QUANTITY",
  );

  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          quantity: Number.NaN,
        }),
      ),
    "INVALID_QUANTITY",
  );
}

function testInvalidOrderPrices(): void {
  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          price: 0,
        }),
      ),
    "INVALID_PRICE",
  );

  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          price: -1,
        }),
      ),
    "INVALID_PRICE",
  );

  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest({
        symbol: "BTC-USDT",
        marketType: "SPOT",
        side: "SELL",
        orderType: "STOP",
        quantity: 1,
        stopPrice: 0,
      }),
    "INVALID_PRICE",
  );
}

function testMissingLimitPrice(): void {
  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest({
        symbol: "BTC-USDT",
        marketType: "SPOT",
        side: "BUY",
        orderType: "LIMIT",
        quantity: 1,
      }),
    "INVALID_PRICE",
  );
}

function testMissingStopPrice(): void {
  const stopOrderTypes =
    [
      "STOP",
      "STOP_LIMIT",
      "TAKE_PROFIT",
      "TAKE_PROFIT_LIMIT",
    ] as const;

  for (
    const orderType of stopOrderTypes
  ) {
    assertUnifiedExchangeError(
      () =>
        validateUnifiedPlaceOrderRequest({
          symbol: "BTC-USDT",
          marketType: "SPOT",
          side: "SELL",
          orderType,
          quantity: 1,
          ...(orderType === "STOP_LIMIT" ||
          orderType ===
            "TAKE_PROFIT_LIMIT"
            ? {
                price: 60_000,
              }
            : {}),
        }),
      "INVALID_PRICE",
    );
  }
}

function testMissingConditionalLimitPrice(): void {
  const orderTypes =
    [
      "STOP_LIMIT",
      "TAKE_PROFIT_LIMIT",
    ] as const;

  for (const orderType of orderTypes) {
    assertUnifiedExchangeError(
      () =>
        validateUnifiedPlaceOrderRequest({
          symbol: "BTC-USDT",
          marketType: "SPOT",
          side: "SELL",
          orderType,
          quantity: 1,
          stopPrice: 60_000,
        }),
      "INVALID_PRICE",
    );
  }
}

function testInvalidRequestedTimestamp(): void {
  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          requestedAt: -1,
        }),
      ),
    "INVALID_TIMESTAMP",
  );

  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          requestedAt: Number.NaN,
        }),
      ),
    "INVALID_TIMESTAMP",
  );
}

function testInvalidRequestMetadata(): void {
  assertUnifiedExchangeError(
    () =>
      validateUnifiedPlaceOrderRequest(
        createValidLimitOrder({
          metadata:
            [] as unknown as Readonly<
              Record<string, unknown>
            >,
        }),
      ),
    "INVALID_REQUEST",
  );
}

function testInputIsolation(): void {
  const metadata = {
    strategyId: "breakout",
  };

  const request =
    createValidLimitOrder({
      symbol: " eth-usdt ",
      metadata,
    });

  const result =
    validateUnifiedPlaceOrderRequest(
      request,
    );

  assert.equal(
    result.symbol,
    "ETH-USDT",
  );

  assert.deepEqual(
    request.metadata,
    {
      strategyId: "breakout",
    },
  );

  assert.equal(
    request.symbol,
    " eth-usdt ",
  );

  assert.notEqual(
    result.metadata,
    metadata,
  );
}

function runUnifiedExchangeInterfaceTests(): void {
  testUnifiedExchangeErrorProperties();
  testUnifiedExchangeErrorDefaults();
  testExchangeIdNormalization();
  testSymbolNormalization();
  testPositiveNumberValidation();
  testTimestampValidation();
  testMetadataFreezing();
  testValidLimitOrderValidation();
  testMarketOrderValidation();
  testStopOrderValidation();
  testStopLimitOrderValidation();
  testTakeProfitOrderValidation();
  testTakeProfitLimitValidation();
  testTrailingStopValidation();
  testInvalidRequestShape();
  testInvalidOrderQuantity();
  testInvalidOrderPrices();
  testMissingLimitPrice();
  testMissingStopPrice();
  testMissingConditionalLimitPrice();
  testInvalidRequestedTimestamp();
  testInvalidRequestMetadata();
  testInputIsolation();

  console.log(
    "All deterministic unified exchange interface tests passed successfully.",
  );
}

runUnifiedExchangeInterfaceTests();