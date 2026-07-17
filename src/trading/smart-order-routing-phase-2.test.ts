import assert from "node:assert/strict";
import {
  createSmartOrderRoutingAggregatedLiquidityBookBuilder,
  createSmartOrderRoutingBestExecutionComparator,
  createSmartOrderRoutingLinearLatencyCostModel,
  createSmartOrderRoutingLiquiditySnapshot,
  createSmartOrderRoutingOptimizedSplitAllocationEngine,
  createSmartOrderRoutingSquareRootMarketImpactModel,
  createSmartOrderRoutingStandardFeeModel,
  createSmartOrderRoutingVenueCapacityModel,
  type SmartOrderRoutingExecutionCandidate,
} from "./smart-order-routing";

function createAskSnapshot(
  input: {
    readonly exchangeId: string;
    readonly accountId: string;
    readonly exchangeSymbol: string;
    readonly capturedAt?: number;
    readonly expiresAt?: number | null;
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

    capturedAt:
      input.capturedAt ?? 1_000,

    expiresAt:
      input.expiresAt === undefined
        ? 2_000
        : input.expiresAt,

    metadata: {
      source: "phase-2-test",
    },
  });
}

function createBidSnapshot(
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

    side: "BID",

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
      source: "phase-2-test",
    },
  });
}

function createCandidate(
  input: {
    readonly candidateId: string;
    readonly exchangeId: string;
    readonly accountId: string;
    readonly exchangeSymbol: string;
    readonly side?: "BUY" | "SELL";
    readonly quantity: number;
    readonly availableQuantity: number;
    readonly referencePrice: number;
    readonly averageExecutionPrice: number;
    readonly worstExecutionPrice?: number;
    readonly makerFeeBps?: number;
    readonly takerFeeBps?: number;
    readonly makerEligible?: boolean;
    readonly estimatedLatencyMilliseconds?: number;
  },
): SmartOrderRoutingExecutionCandidate {
  return Object.freeze({
    candidateId: input.candidateId,

    exchangeId: input.exchangeId,
    accountId: input.accountId,

    symbol: "BTC-USDT",
    exchangeSymbol: input.exchangeSymbol,

    side: input.side ?? "BUY",

    quantity: input.quantity,
    availableQuantity:
      input.availableQuantity,

    referencePrice:
      input.referencePrice,

    averageExecutionPrice:
      input.averageExecutionPrice,

    worstExecutionPrice:
      input.worstExecutionPrice ??
      input.averageExecutionPrice,

    makerFeeBps:
      input.makerFeeBps ?? 2,

    takerFeeBps:
      input.takerFeeBps ?? 5,

    makerEligible:
      input.makerEligible ?? false,

    estimatedLatencyMilliseconds:
      input.estimatedLatencyMilliseconds ??
      20,

    metadata: Object.freeze({
      testCandidate: true,
    }),
  });
}

function testAggregatedBuyLiquidityBook(): void {
  const builder =
    createSmartOrderRoutingAggregatedLiquidityBookBuilder();

  const book = builder.build({
    symbol: "BTC-USDT",
    side: "BUY",

    snapshots: [
      createAskSnapshot({
        exchangeId: "okx",
        accountId: "okx-main",
        exchangeSymbol: "BTC-USDT",

        levels: [
          {
            price: 100,
            quantity: 2,
          },
          {
            price: 101,
            quantity: 3,
          },
        ],
      }),

      createAskSnapshot({
        exchangeId: "binance",
        accountId: "binance-main",
        exchangeSymbol: "BTCUSDT",

        levels: [
          {
            price: 99,
            quantity: 1,
          },
          {
            price: 100,
            quantity: 4,
          },
        ],
      }),
    ],

    capturedAt: 1_100,
  });

  assert.equal(
    book.side,
    "BUY",
  );

  assert.equal(
    book.venueCount,
    2,
  );

  assert.equal(
    book.sourceCount,
    4,
  );

  assert.equal(
    book.levels.length,
    3,
  );

  assert.equal(
    book.bestPrice,
    99,
  );

  assert.equal(
    book.worstPrice,
    101,
  );

  assert.equal(
    book.totalQuantity,
    10,
  );

  assert.equal(
    book.totalNotional,
    1_002,
  );

  assert.equal(
    book.levels[0]?.price,
    99,
  );

  assert.equal(
    book.levels[1]?.price,
    100,
  );

  assert.equal(
    book.levels[1]?.quantity,
    6,
  );

  assert.equal(
    book.levels[1]?.sources.length,
    2,
  );

  assert.equal(
    book.levels[2]
      ?.cumulativeQuantity,
    10,
  );
}

function testAggregatedSellLiquidityBook(): void {
  const builder =
    createSmartOrderRoutingAggregatedLiquidityBookBuilder();

  const book = builder.build({
    symbol: "BTC-USDT",
    side: "SELL",

    snapshots: [
      createBidSnapshot({
        exchangeId: "okx",
        accountId: "okx-main",
        exchangeSymbol: "BTC-USDT",

        levels: [
          {
            price: 100,
            quantity: 2,
          },
          {
            price: 99,
            quantity: 3,
          },
        ],
      }),

      createBidSnapshot({
        exchangeId: "bybit",
        accountId: "bybit-main",
        exchangeSymbol: "BTCUSDT",

        levels: [
          {
            price: 101,
            quantity: 1,
          },
          {
            price: 100,
            quantity: 4,
          },
        ],
      }),
    ],

    capturedAt: 1_100,
  });

  assert.equal(
    book.bestPrice,
    101,
  );

  assert.equal(
    book.worstPrice,
    99,
  );

  assert.equal(
    book.levels[0]?.price,
    101,
  );

  assert.equal(
    book.levels[1]?.price,
    100,
  );

  assert.equal(
    book.levels[1]?.quantity,
    6,
  );
}

function testExpiredSnapshotsAreExcluded(): void {
  const builder =
    createSmartOrderRoutingAggregatedLiquidityBookBuilder();

  const book = builder.build({
    symbol: "BTC-USDT",
    side: "BUY",

    snapshots: [
      createAskSnapshot({
        exchangeId: "okx",
        accountId: "okx-main",
        exchangeSymbol: "BTC-USDT",
        expiresAt: 1_050,

        levels: [
          {
            price: 99,
            quantity: 10,
          },
        ],
      }),

      createAskSnapshot({
        exchangeId: "binance",
        accountId: "binance-main",
        exchangeSymbol: "BTCUSDT",
        expiresAt: 2_000,

        levels: [
          {
            price: 100,
            quantity: 5,
          },
        ],
      }),
    ],

    capturedAt: 1_100,
  });

  assert.equal(
    book.venueCount,
    1,
  );

  assert.equal(
    book.totalQuantity,
    5,
  );

  assert.equal(
    book.bestPrice,
    100,
  );

  assert.equal(
    book.metadata
      .expiredSnapshotCount,
    1,
  );
}

function testStandardFeeModel(): void {
  const feeModel =
    createSmartOrderRoutingStandardFeeModel();

  const takerEstimate =
    feeModel.estimateFee({
      side: "BUY",
      quantity: 2,
      averageExecutionPrice: 100,

      makerFeeBps: 2,
      takerFeeBps: 5,

      makerEligible: false,
    });

  assert.equal(
    takerEstimate.grossNotional,
    200,
  );

  assert.equal(
    takerEstimate.feeBps,
    5,
  );

  assert.equal(
    takerEstimate.estimatedFee,
    0.1,
  );

  assert.equal(
    takerEstimate.makerApplied,
    false,
  );

  const makerEstimate =
    feeModel.estimateFee({
      side: "BUY",
      quantity: 2,
      averageExecutionPrice: 100,

      makerFeeBps: 2,
      takerFeeBps: 5,

      makerEligible: true,
    });

  assert.equal(
    makerEstimate.feeBps,
    2,
  );

  assert.equal(
    makerEstimate.estimatedFee,
    0.04,
  );
}

function testLinearLatencyCostModel(): void {
  const latencyModel =
    createSmartOrderRoutingLinearLatencyCostModel({
      costBpsPerSecond: 10,
      minimumLatencyMilliseconds: 100,
      maximumCostBps: 5,
    });

  const noCost =
    latencyModel.estimateLatencyCost({
      side: "BUY",
      quantity: 2,
      averageExecutionPrice: 100,
      estimatedLatencyMilliseconds: 100,
      referencePrice: 100,
    });

  assert.equal(
    noCost,
    0,
  );

  const cost =
    latencyModel.estimateLatencyCost({
      side: "BUY",
      quantity: 2,
      averageExecutionPrice: 100,
      estimatedLatencyMilliseconds: 600,
      referencePrice: 100,
    });

  assert.equal(
    cost,
    0.1,
  );
}

function testSquareRootMarketImpactModel(): void {
  const impactModel =
    createSmartOrderRoutingSquareRootMarketImpactModel({
      impactCoefficientBps: 20,
    });

  const estimate =
    impactModel.estimateMarketImpact({
      side: "BUY",

      quantity: 25,
      availableQuantity: 100,

      referencePrice: 100,
      averageExecutionPrice: 100.1,
    });

  assert.equal(
    estimate.participationRate,
    0.25,
  );

  assert.ok(
    Math.abs(
      estimate.naturalSlippageBps -
      10,
    ) < 1e-9,
  );

  assert.equal(
    estimate.modeledImpactBps,
    10,
  );

  assert.ok(
    Math.abs(
      estimate.totalImpactBps -
      20,
    ) < 1e-9,
  );

  assert.ok(
    estimate.totalImpactCost > 0,
  );
}

function testBestExecutionComparison(): void {
  const comparator =
    createSmartOrderRoutingBestExecutionComparator({
      marketImpactModel:
        createSmartOrderRoutingSquareRootMarketImpactModel({
          impactCoefficientBps: 0,
        }),

      latencyCostModel:
        createSmartOrderRoutingLinearLatencyCostModel({
          costBpsPerSecond: 0,
        }),
    });

  const comparison =
    comparator.compare([
      createCandidate({
        candidateId: "okx-candidate",
        exchangeId: "okx",
        accountId: "okx-main",
        exchangeSymbol: "BTC-USDT",

        quantity: 1,
        availableQuantity: 10,

        referencePrice: 100,
        averageExecutionPrice: 100,

        takerFeeBps: 10,
      }),

      createCandidate({
        candidateId: "binance-candidate",
        exchangeId: "binance",
        accountId: "binance-main",
        exchangeSymbol: "BTCUSDT",

        quantity: 1,
        availableQuantity: 10,

        referencePrice: 100,
        averageExecutionPrice: 100.02,

        takerFeeBps: 1,
      }),
    ]);

  assert.equal(
    comparison.candidateCount,
    2,
  );

  assert.equal(
    comparison.bestCandidate
      ?.candidateId,
    "binance-candidate",
  );

  assert.equal(
    comparison.worstCandidate
      ?.candidateId,
    "okx-candidate",
  );

  assert.ok(
    (
      comparison.bestCandidate
        ?.effectiveUnitPrice ??
      Number.POSITIVE_INFINITY
    ) <
      (
        comparison.worstCandidate
          ?.effectiveUnitPrice ??
        Number.POSITIVE_INFINITY
      ),
  );
}

function testVenueCapacityParticipationLimit(): void {
  const model =
    createSmartOrderRoutingVenueCapacityModel();

  const capacity =
    model.calculateCapacity({
      exchangeId: "okx",
      accountId: "okx-main",

      symbol: "BTC-USDT",
      exchangeSymbol: "BTC-USDT",

      side: "BUY",

      requestedQuantity: 10,
      availableQuantity: 20,

      maximumParticipationRate: 0.25,
    });

  assert.equal(
    capacity.status,
    "LIMITED",
  );

  assert.equal(
    capacity.participationLimitedQuantity,
    5,
  );

  assert.equal(
    capacity.routableQuantity,
    5,
  );

  assert.equal(
    capacity.limitingConstraint,
    "PARTICIPATION_LIMIT",
  );

  assert.equal(
    capacity.effectiveParticipationRate,
    0.25,
  );
}

function testVenueCapacityQuantityLimit(): void {
  const model =
    createSmartOrderRoutingVenueCapacityModel();

  const capacity =
    model.calculateCapacity({
      exchangeId: "binance",
      accountId: "binance-main",

      symbol: "BTC-USDT",
      exchangeSymbol: "BTCUSDT",

      side: "BUY",

      requestedQuantity: 10,
      availableQuantity: 20,

      maximumParticipationRate: 1,
      maximumVenueQuantity: 3,
    });

  assert.equal(
    capacity.routableQuantity,
    3,
  );

  assert.equal(
    capacity.limitingConstraint,
    "VENUE_QUANTITY_LIMIT",
  );
}

function testVenueCapacityMinimumAllocation(): void {
  const model =
    createSmartOrderRoutingVenueCapacityModel();

  const capacity =
    model.calculateCapacity({
      exchangeId: "bybit",
      accountId: "bybit-main",

      symbol: "BTC-USDT",
      exchangeSymbol: "BTCUSDT",

      side: "BUY",

      requestedQuantity: 10,
      availableQuantity: 1,

      minimumAllocationQuantity: 2,
    });

  assert.equal(
    capacity.status,
    "UNAVAILABLE",
  );

  assert.equal(
    capacity.routableQuantity,
    0,
  );

  assert.equal(
    capacity.limitingConstraint,
    "MINIMUM_ALLOCATION",
  );
}

function testOptimizedCompleteSplitAllocation(): void {
  const engine =
    createSmartOrderRoutingOptimizedSplitAllocationEngine({
      comparatorOptions: {
        marketImpactModel:
          createSmartOrderRoutingSquareRootMarketImpactModel({
            impactCoefficientBps: 0,
          }),

        latencyCostModel:
          createSmartOrderRoutingLinearLatencyCostModel({
            costBpsPerSecond: 0,
          }),
      },
    });

  const result = engine.allocate({
    allocationRequestId:
      "allocation-request-1",

    symbol: "BTC-USDT",
    side: "BUY",

    requestedQuantity: 5,
    allowPartialAllocation: false,

    venues: [
      {
        candidate: createCandidate({
          candidateId: "okx-candidate",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",

          quantity: 3,
          availableQuantity: 3,

          referencePrice: 100,
          averageExecutionPrice: 100,

          takerFeeBps: 1,
        }),

        maximumVenueQuantity: 3,
      },

      {
        candidate: createCandidate({
          candidateId: "binance-candidate",
          exchangeId: "binance",
          accountId: "binance-main",
          exchangeSymbol: "BTCUSDT",

          quantity: 5,
          availableQuantity: 5,

          referencePrice: 100,
          averageExecutionPrice: 100.1,

          takerFeeBps: 1,
        }),
      },
    ],
  });

  assert.equal(
    result.status,
    "COMPLETED",
  );

  assert.equal(
    result.allocatedQuantity,
    5,
  );

  assert.equal(
    result.unallocatedQuantity,
    0,
  );

  assert.equal(
    result.allocations.length,
    2,
  );

  assert.equal(
    result.allocations[0]
      ?.exchangeId,
    "okx",
  );

  assert.equal(
    result.allocations[0]
      ?.quantity,
    3,
  );

  assert.equal(
    result.allocations[1]
      ?.exchangeId,
    "binance",
  );

  assert.equal(
    result.allocations[1]
      ?.quantity,
    2,
  );

  assert.ok(
    result.expectedAveragePrice !==
      null,
  );

  assert.ok(
    result.expectedEffectiveUnitPrice !==
      null,
  );
}

function testOptimizedPartialAllocation(): void {
  const engine =
    createSmartOrderRoutingOptimizedSplitAllocationEngine();

  const result = engine.allocate({
    allocationRequestId:
      "allocation-request-2",

    symbol: "BTC-USDT",
    side: "BUY",

    requestedQuantity: 10,
    allowPartialAllocation: true,

    venues: [
      {
        candidate: createCandidate({
          candidateId: "okx-candidate",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",

          quantity: 2,
          availableQuantity: 2,

          referencePrice: 100,
          averageExecutionPrice: 100,
        }),
      },

      {
        candidate: createCandidate({
          candidateId: "bybit-candidate",
          exchangeId: "bybit",
          accountId: "bybit-main",
          exchangeSymbol: "BTCUSDT",

          quantity: 3,
          availableQuantity: 3,

          referencePrice: 100,
          averageExecutionPrice: 101,
        }),
      },
    ],
  });

  assert.equal(
    result.status,
    "PARTIALLY_ALLOCATED",
  );

  assert.equal(
    result.allocatedQuantity,
    5,
  );

  assert.equal(
    result.unallocatedQuantity,
    5,
  );

  assert.equal(
    result.allocations.length,
    2,
  );
}

function testOptimizedPartialAllocationDisabled(): void {
  const engine =
    createSmartOrderRoutingOptimizedSplitAllocationEngine();

  const result = engine.allocate({
    allocationRequestId:
      "allocation-request-3",

    symbol: "BTC-USDT",
    side: "BUY",

    requestedQuantity: 10,
    allowPartialAllocation: false,

    venues: [
      {
        candidate: createCandidate({
          candidateId: "okx-candidate",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",

          quantity: 2,
          availableQuantity: 2,

          referencePrice: 100,
          averageExecutionPrice: 100,
        }),
      },
    ],
  });

  assert.equal(
    result.status,
    "UNALLOCATABLE",
  );

  assert.equal(
    result.allocatedQuantity,
    0,
  );

  assert.equal(
    result.unallocatedQuantity,
    10,
  );

  assert.equal(
    result.allocations.length,
    0,
  );

  assert.equal(
    result.rankedCandidateCosts.length,
    1,
  );

  assert.equal(
    result.venueCapacities.length,
    1,
  );
}

function testMaximumVenueCount(): void {
  const engine =
    createSmartOrderRoutingOptimizedSplitAllocationEngine();

  const result = engine.allocate({
    allocationRequestId:
      "allocation-request-4",

    symbol: "BTC-USDT",
    side: "BUY",

    requestedQuantity: 5,
    allowPartialAllocation: true,

    maximumVenueCount: 1,

    venues: [
      {
        candidate: createCandidate({
          candidateId: "okx-candidate",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",

          quantity: 2,
          availableQuantity: 2,

          referencePrice: 100,
          averageExecutionPrice: 100,
        }),
      },

      {
        candidate: createCandidate({
          candidateId: "binance-candidate",
          exchangeId: "binance",
          accountId: "binance-main",
          exchangeSymbol: "BTCUSDT",

          quantity: 5,
          availableQuantity: 5,

          referencePrice: 100,
          averageExecutionPrice: 101,
        }),
      },
    ],
  });

  assert.equal(
    result.status,
    "PARTIALLY_ALLOCATED",
  );

  assert.equal(
    result.allocations.length,
    1,
  );

  assert.equal(
    result.allocations[0]
      ?.exchangeId,
    "okx",
  );

  assert.equal(
    result.allocatedQuantity,
    2,
  );
}

function testDeterministicAllocationResult(): void {
  const engine =
    createSmartOrderRoutingOptimizedSplitAllocationEngine({
      comparatorOptions: {
        marketImpactModel:
          createSmartOrderRoutingSquareRootMarketImpactModel({
            impactCoefficientBps: 0,
          }),

        latencyCostModel:
          createSmartOrderRoutingLinearLatencyCostModel({
            costBpsPerSecond: 0,
          }),
      },
    });

  const request = {
    allocationRequestId:
      "deterministic-allocation",

    symbol: "BTC-USDT",
    side: "BUY" as const,

    requestedQuantity: 4,
    allowPartialAllocation: false,

    venues: [
      {
        candidate: createCandidate({
          candidateId: "okx-candidate",
          exchangeId: "okx",
          accountId: "okx-main",
          exchangeSymbol: "BTC-USDT",

          quantity: 2,
          availableQuantity: 2,

          referencePrice: 100,
          averageExecutionPrice: 100,
        }),
      },

      {
        candidate: createCandidate({
          candidateId: "binance-candidate",
          exchangeId: "binance",
          accountId: "binance-main",
          exchangeSymbol: "BTCUSDT",

          quantity: 2,
          availableQuantity: 2,

          referencePrice: 100,
          averageExecutionPrice: 100.5,
        }),
      },
    ],
  };

  const first =
    engine.allocate(request);

  const second =
    engine.allocate(request);

  assert.deepEqual(
    first,
    second,
  );

  assert.deepEqual(
    first.allocations.map(
      (allocation) =>
        allocation.allocationId,
    ),
    [
      "deterministic-allocation:1:okx-candidate",
      "deterministic-allocation:2:binance-candidate",
    ],
  );
}

function run(): void {
  testAggregatedBuyLiquidityBook();
  testAggregatedSellLiquidityBook();
  testExpiredSnapshotsAreExcluded();

  testStandardFeeModel();
  testLinearLatencyCostModel();
  testSquareRootMarketImpactModel();

  testBestExecutionComparison();

  testVenueCapacityParticipationLimit();
  testVenueCapacityQuantityLimit();
  testVenueCapacityMinimumAllocation();

  testOptimizedCompleteSplitAllocation();
  testOptimizedPartialAllocation();
  testOptimizedPartialAllocationDisabled();
  testMaximumVenueCount();
  testDeterministicAllocationResult();

  console.log(
    "All Smart Order Routing Phase 2 deterministic tests passed successfully.",
  );
}

run();