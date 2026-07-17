import assert from "node:assert/strict";
import {
  createSmartOrderRoutingEngine,
  createSmartOrderRoutingLiquiditySnapshot,
  createSmartOrderRoutingRequest,
  createSmartOrderRoutingVenueQuote,
} from "./smart-order-routing";

function createBuyRequest(
  overrides: Partial<
    Parameters<
      typeof createSmartOrderRoutingRequest
    >[0]
  > = {},
) {
  return createSmartOrderRoutingRequest({
    routingRequestId: "sor-request-1",
    coordinatorRequestId: "coordinator-request-1",

    symbol: "BTC-USDT",
    side: "BUY",
    orderType: "MARKET",
    timeInForce: "IOC",

    quantity: 5,
    limitPrice: null,
    stopPrice: null,

    policy: "BALANCED",

    allowPartialRouting: false,
    maximumVenueCount: null,

    maximumSlippageBps: null,
    maximumFeeBps: null,
    maximumLatencyMilliseconds: null,

    minimumAllocationQuantity: null,

    createdAt: 1_000,
    expiresAt: 2_000,

    metadata: {
      strategyId: "strategy-1",
    },

    ...overrides,
  });
}

function createVenueQuote(
  input: {
    readonly quoteId: string;
    readonly exchangeId: string;
    readonly accountId: string;
    readonly exchangeSymbol: string;
    readonly askPrice: number;
    readonly askQuantity: number;
    readonly feeBps: number;
    readonly latency: number;
    readonly referencePrice?: number;
  },
) {
  return createSmartOrderRoutingVenueQuote({
    quoteId: input.quoteId,

    exchangeId: input.exchangeId,
    accountId: input.accountId,

    symbol: "BTC-USDT",
    exchangeSymbol: input.exchangeSymbol,

    side: "BUY",

    bestBidPrice: input.askPrice - 1,
    bestBidQuantity: input.askQuantity,

    bestAskPrice: input.askPrice,
    bestAskQuantity: input.askQuantity,

    referencePrice:
      input.referencePrice ??
      input.askPrice,

    makerFeeBps: input.feeBps,
    takerFeeBps: input.feeBps,

    estimatedLatencyMilliseconds:
      input.latency,

    receivedAt: 1_000,
    expiresAt: 2_000,

    metadata: {
      exchangeSymbol:
        input.exchangeSymbol,
    },
  });
}

function createAskLiquidity(
  input: {
    readonly exchangeId: string;
    readonly accountId: string;
    readonly exchangeSymbol: string;
    readonly levels: readonly {
      readonly price: number;
      readonly quantity: number;
    }[];
  },
) {
  return createSmartOrderRoutingLiquiditySnapshot({
    exchangeId: input.exchangeId,
    accountId: input.accountId,

    symbol: "BTC-USDT",
    exchangeSymbol: input.exchangeSymbol,

    side: "ASK",

    levels: input.levels.map(
      (level) => ({
        price: level.price,
        quantity: level.quantity,
        cumulativeQuantity: 0,
        cumulativeNotional: 0,
      }),
    ),

    capturedAt: 1_000,
    expiresAt: 2_000,

    metadata: {
      exchangeSymbol:
        input.exchangeSymbol,
    },
  });
}

function testCompleteSingleVenueRouting(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 2,
      policy: "BEST_PRICE",
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 10,
          feeBps: 5,
          latency: 20,
        }),

        liquidity: createAskLiquidity({
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          levels: [
            {
              price: 100,
              quantity: 10,
            },
          ],
        }),
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "COMPLETED",
  );

  assert.equal(
    decision.routedQuantity,
    2,
  );

  assert.equal(
    decision.unroutedQuantity,
    0,
  );

  assert.equal(
    decision.allocations.length,
    1,
  );

  assert.equal(
    decision.allocations[0]
      ?.exchangeId,
    "okx",
  );

  assert.equal(
    decision.allocations[0]
      ?.quantity,
    2,
  );

  assert.equal(
    decision.expectedAveragePrice,
    100,
  );

  assert.equal(
    decision.failure,
    null,
  );
}

function testSplitAllocationAcrossVenues(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 5,
      policy: "HIGHEST_LIQUIDITY",
      allowPartialRouting: false,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 3,
          feeBps: 5,
          latency: 20,
        }),

        liquidity: createAskLiquidity({
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          levels: [
            {
              price: 100,
              quantity: 3,
            },
          ],
        }),
      },

      {
        quote: createVenueQuote({
          quoteId: "quote-binance",
          exchangeId: "binance",
          accountId: "binance-main",
          exchangeSymbol: "BTCUSDT",
          askPrice: 101,
          askQuantity: 2,
          feeBps: 4,
          latency: 10,
        }),

        liquidity: createAskLiquidity({
          exchangeId: "binance",
          accountId: "binance-main",
          exchangeSymbol: "BTCUSDT",
          levels: [
            {
              price: 101,
              quantity: 2,
            },
          ],
        }),
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "COMPLETED",
  );

  assert.equal(
    decision.routedQuantity,
    5,
  );

  assert.equal(
    decision.allocations.length,
    2,
  );

  assert.equal(
    decision.allocations.reduce(
      (total, allocation) =>
        total +
        allocation.quantity,
      0,
    ),
    5,
  );

  assert.equal(
    decision.expectedAveragePrice,
    100.4,
  );
}

function testPolicyRanking(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 1,
      policy: "LOWEST_FEES",
      maximumVenueCount: 1,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 5,
          feeBps: 10,
          latency: 5,
        }),

        liquidity: null,
      },

      {
        quote: createVenueQuote({
          quoteId: "quote-binance",
          exchangeId: "binance",
          accountId: "binance-main",
          exchangeSymbol: "BTCUSDT",
          askPrice: 101,
          askQuantity: 5,
          feeBps: 2,
          latency: 15,
        }),

        liquidity: null,
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "COMPLETED",
  );

  assert.equal(
    decision.allocations.length,
    1,
  );

  assert.equal(
    decision.allocations[0]
      ?.exchangeId,
    "binance",
  );

  assert.equal(
    decision.venueScores[0]
      ?.exchangeId,
    "binance",
  );
}

function testConstraintRejection(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 1,
      maximumFeeBps: 1,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 5,
          feeBps: 5,
          latency: 10,
        }),

        liquidity: null,
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "UNROUTABLE",
  );

  assert.equal(
    decision.routedQuantity,
    0,
  );

  assert.equal(
    decision.failure?.code,
    "FEE_LIMIT_EXCEEDED",
  );

  assert.deepEqual(
    decision.venueScores[0]
      ?.rejectionReasons,
    [
      "MAXIMUM_FEE_EXCEEDED",
    ],
  );
}

function testPartialRoutingEnabled(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 5,
      allowPartialRouting: true,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 2,
          feeBps: 5,
          latency: 10,
        }),

        liquidity: null,
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "PARTIALLY_ROUTABLE",
  );

  assert.equal(
    decision.routedQuantity,
    2,
  );

  assert.equal(
    decision.unroutedQuantity,
    3,
  );

  assert.equal(
    decision.allocations.length,
    1,
  );

  assert.equal(
    decision.failure,
    null,
  );
}

function testPartialRoutingDisabled(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 5,
      allowPartialRouting: false,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 2,
          feeBps: 5,
          latency: 10,
        }),

        liquidity: null,
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "UNROUTABLE",
  );

  assert.equal(
    decision.routedQuantity,
    0,
  );

  assert.equal(
    decision.allocations.length,
    0,
  );

  assert.equal(
    decision.failure?.code,
    "INSUFFICIENT_LIQUIDITY",
  );
}

function testExpiredRequest(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      expiresAt: 1_050,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 10,
          feeBps: 5,
          latency: 10,
        }),

        liquidity: null,
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "FAILED",
  );

  assert.equal(
    decision.failure?.code,
    "INVALID_REQUEST",
  );

  assert.equal(
    decision.routedQuantity,
    0,
  );
}

function testNoVenuesAvailable(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest();

  const decision = engine.route({
    request,
    venues: [],
    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "UNROUTABLE",
  );

  assert.equal(
    decision.failure?.code,
    "NO_VENUES_AVAILABLE",
  );

  assert.equal(
    decision.allocations.length,
    0,
  );
}

function testLimitPriceEnforcement(): void {
  const engine =
    createSmartOrderRoutingEngine();

  const request =
    createBuyRequest({
      quantity: 2,
      orderType: "LIMIT",
      limitPrice: 100,
      allowPartialRouting: false,
    });

  const decision = engine.route({
    request,

    venues: [
      {
        quote: createVenueQuote({
          quoteId: "quote-okx",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          askPrice: 100,
          askQuantity: 2,
          feeBps: 5,
          latency: 10,
        }),

        liquidity: createAskLiquidity({
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",
          levels: [
            {
              price: 100,
              quantity: 1,
            },
            {
              price: 101,
              quantity: 1,
            },
          ],
        }),
      },
    ],

    completedAt: 1_100,
  });

  assert.equal(
    decision.status,
    "UNROUTABLE",
  );

  assert.equal(
    decision.routedQuantity,
    0,
  );

  assert.equal(
    decision.failure?.code,
    "INSUFFICIENT_LIQUIDITY",
  );
}

function run(): void {
  testCompleteSingleVenueRouting();
  testSplitAllocationAcrossVenues();
  testPolicyRanking();
  testConstraintRejection();
  testPartialRoutingEnabled();
  testPartialRoutingDisabled();
  testExpiredRequest();
  testNoVenuesAvailable();
  testLimitPriceEnforcement();

  console.log(
    "All Smart Order Routing Phase 1 deterministic tests passed successfully.",
  );
}

run();