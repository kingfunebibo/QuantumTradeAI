import {
  ExecutionEngine,
} from "./execution";

import type {
  ApprovedTrade,
} from "./risk";

function assertApproximatelyEqual(
  actual: number,
  expected: number,
  label: string,
  tolerance = 1e-10,
): void {
  if (
    Math.abs(actual - expected) >
    tolerance
  ) {
    throw new Error(
      `${label}: expected ${expected}, received ${actual}.`,
    );
  }
}

function createApprovedTrade(
  overrides: Partial<ApprovedTrade> = {},
): ApprovedTrade {
  return {
    signalId: "signal-1",
    strategyId: "ema-crossover",
    symbol: "BTCUSDT",
    timeframe: "1m",
    side: "BUY",
    entryPrice: 100,
    stopLossPrice: 95,
    quantity: 20,
    leverage: 2,
    positionNotional: 2_000,
    marginRequired: 1_000,
    riskAmount: 100,
    riskPerUnit: 5,
    accountRiskAfterTrade: 100,
    approvedAt: Date.now(),
    metadata: {},
    ...overrides,
  };
}

const engine = new ExecutionEngine({
  slippageRate: 0.001,
  tradingFeeRate: 0.001,
});

const buyReport =
  engine.executeMarketOrder({
    trade: createApprovedTrade(),
    marketPrice: 100,
  });

console.log(
  "BUY execution report:",
  buyReport,
);

if (
  !buyReport.accepted ||
  !buyReport.fill
) {
  throw new Error(
    "Expected BUY market order to be filled.",
  );
}

if (
  buyReport.order.status !== "FILLED"
) {
  throw new Error(
    "BUY order status must be FILLED.",
  );
}

assertApproximatelyEqual(
  buyReport.fill.fillPrice,
  100.1,
  "BUY fill price",
);

if (
  buyReport.fill.quantity !== 20
) {
  throw new Error(
    "BUY fill quantity was not preserved.",
  );
}

assertApproximatelyEqual(
  buyReport.fill.grossNotional,
  2_002,
  "BUY gross notional",
);

assertApproximatelyEqual(
  buyReport.fill.fee,
  2.002,
  "BUY fee",
);

assertApproximatelyEqual(
  buyReport.fill.netNotional,
  2_004.002,
  "BUY net notional",
);

assertApproximatelyEqual(
  buyReport.fill.slippageAmount,
  2,
  "BUY slippage amount",
);

if (
  !engine.hasExecutedSignal(
    "signal-1",
  )
) {
  throw new Error(
    "Executed BUY signal was not recorded.",
  );
}

const duplicateReport =
  engine.executeMarketOrder({
    trade: createApprovedTrade(),
    marketPrice: 100,
  });

console.log(
  "Duplicate execution report:",
  duplicateReport,
);

if (duplicateReport.accepted) {
  throw new Error(
    "Duplicate signal execution must be rejected.",
  );
}

if (
  duplicateReport.order.status !==
  "REJECTED"
) {
  throw new Error(
    "Duplicate execution order must have REJECTED status.",
  );
}

const sellReport =
  engine.executeMarketOrder({
    trade: createApprovedTrade({
      signalId: "signal-2",
      side: "SELL",
      entryPrice: 100,
      stopLossPrice: 105,
    }),
    marketPrice: 100,
  });

console.log(
  "SELL execution report:",
  sellReport,
);

if (
  !sellReport.accepted ||
  !sellReport.fill
) {
  throw new Error(
    "Expected SELL market order to be filled.",
  );
}

if (
  sellReport.order.status !== "FILLED"
) {
  throw new Error(
    "SELL order status must be FILLED.",
  );
}

assertApproximatelyEqual(
  sellReport.fill.fillPrice,
  99.9,
  "SELL fill price",
);

assertApproximatelyEqual(
  sellReport.fill.grossNotional,
  1_998,
  "SELL gross notional",
);

assertApproximatelyEqual(
  sellReport.fill.fee,
  1.998,
  "SELL fee",
);

assertApproximatelyEqual(
  sellReport.fill.netNotional,
  1_996.002,
  "SELL net notional",
);

assertApproximatelyEqual(
  sellReport.fill.slippageAmount,
  2,
  "SELL slippage amount",
);

const storedBuyOrder =
  engine.getOrder(
    buyReport.order.id,
  );

if (
  storedBuyOrder.id !==
  buyReport.order.id
) {
  throw new Error(
    "Stored order lookup returned an unexpected order.",
  );
}

const storedBuyFill =
  engine.getFill(
    buyReport.order.id,
  );

if (!storedBuyFill) {
  throw new Error(
    "Expected the BUY order fill to be stored.",
  );
}

if (
  storedBuyFill.id !==
  buyReport.fill.id
) {
  throw new Error(
    "Stored BUY fill does not match the execution report.",
  );
}

const cancelFilledOrder =
  engine.cancelOrder(
    buyReport.order.id,
  );

console.log(
  "Cancel filled order result:",
  cancelFilledOrder,
);

if (cancelFilledOrder.accepted) {
  throw new Error(
    "Filled orders must not be cancellable.",
  );
}

if (
  cancelFilledOrder.order.status !==
  "FILLED"
) {
  throw new Error(
    "Cancelling a filled order must not change its status.",
  );
}

const summary =
  engine.getSummary();

console.log(
  "Execution summary:",
  summary,
);

if (
  summary.totalOrders !== 3
) {
  throw new Error(
    `Expected 3 total orders, received ${summary.totalOrders}.`,
  );
}

if (
  summary.pendingOrders !== 0
) {
  throw new Error(
    `Expected 0 pending orders, received ${summary.pendingOrders}.`,
  );
}

if (
  summary.filledOrders !== 2
) {
  throw new Error(
    `Expected 2 filled orders, received ${summary.filledOrders}.`,
  );
}

if (
  summary.cancelledOrders !== 0
) {
  throw new Error(
    `Expected 0 cancelled orders, received ${summary.cancelledOrders}.`,
  );
}

if (
  summary.rejectedOrders !== 1
) {
  throw new Error(
    `Expected 1 rejected order, received ${summary.rejectedOrders}.`,
  );
}

if (
  engine.listOrders().length !== 3
) {
  throw new Error(
    "Expected exactly three stored orders.",
  );
}

if (
  engine.listFills().length !== 2
) {
  throw new Error(
    "Expected exactly two stored fills.",
  );
}

let invalidQuantityRejected = false;

try {
  engine.executeMarketOrder({
    trade: createApprovedTrade({
      signalId: "signal-3",
      quantity: 0,
    }),
  });
} catch {
  invalidQuantityRejected = true;
}

if (!invalidQuantityRejected) {
  throw new Error(
    "Invalid execution quantities must be rejected.",
  );
}

let invalidMarketPriceRejected =
  false;

try {
  engine.executeMarketOrder({
    trade: createApprovedTrade({
      signalId: "signal-4",
    }),
    marketPrice: 0,
  });
} catch {
  invalidMarketPriceRejected = true;
}

if (!invalidMarketPriceRejected) {
  throw new Error(
    "Invalid market prices must be rejected.",
  );
}

let unknownOrderRejected = false;

try {
  engine.getOrder(
    "unknown-order",
  );
} catch {
  unknownOrderRejected = true;
}

if (!unknownOrderRejected) {
  throw new Error(
    "Unknown order lookups must be rejected.",
  );
}

engine.clear();

const clearedSummary =
  engine.getSummary();

if (
  clearedSummary.totalOrders !== 0 ||
  clearedSummary.pendingOrders !== 0 ||
  clearedSummary.filledOrders !== 0 ||
  clearedSummary.cancelledOrders !== 0 ||
  clearedSummary.rejectedOrders !== 0
) {
  throw new Error(
    "Execution summary should be empty after clearing.",
  );
}

if (
  engine.listOrders().length !== 0 ||
  engine.listFills().length !== 0
) {
  throw new Error(
    "Execution history should be empty after clearing.",
  );
}

if (
  engine.hasExecutedSignal(
    "signal-1",
  )
) {
  throw new Error(
    "Executed signal history should be empty after clearing.",
  );
}

console.log(
  "All execution tests passed successfully.",
);