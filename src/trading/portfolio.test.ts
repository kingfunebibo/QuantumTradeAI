import {
  ExecutionEngine,
} from "./execution";

import {
  PortfolioManager,
} from "./portfolio";

import type {
  ApprovedTrade,
} from "./risk";

function assertApproximatelyEqual(
  actual: number,
  expected: number,
  label: string,
  tolerance = 1e-8,
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
    quantity: 10,
    leverage: 2,
    positionNotional: 1_000,
    marginRequired: 500,
    riskAmount: 50,
    riskPerUnit: 5,
    accountRiskAfterTrade: 50,
    approvedAt: Date.now(),
    metadata: {},
    ...overrides,
  };
}

const executionEngine =
  new ExecutionEngine({
    slippageRate: 0,
    tradingFeeRate: 0.001,
  });

const portfolio =
  new PortfolioManager({
    initialBalance: 10_000,
  });

const openingExecution =
  executionEngine.executeMarketOrder({
    trade: createApprovedTrade(),
    marketPrice: 100,
  });

const openingUpdate =
  portfolio.processExecution(
    openingExecution,
  );

console.log(
  "Opening position update:",
  openingUpdate,
);

if (
  openingUpdate.action !== "OPENED" ||
  !openingUpdate.position
) {
  throw new Error(
    "Expected a new LONG position to be opened.",
  );
}

if (
  openingUpdate.position.side !==
  "LONG"
) {
  throw new Error(
    "Expected the opened position to be LONG.",
  );
}

assertApproximatelyEqual(
  openingUpdate.position.quantity,
  10,
  "Opening quantity",
);

assertApproximatelyEqual(
  openingUpdate.position.averageEntryPrice,
  100,
  "Opening entry price",
);

assertApproximatelyEqual(
  openingUpdate.position.marginUsed,
  500,
  "Opening margin used",
);

assertApproximatelyEqual(
  openingUpdate.position.entryFees,
  1,
  "Opening entry fees",
);

const markedPosition =
  portfolio.updateMarketPrice(
    "BTCUSDT",
    110,
  );

assertApproximatelyEqual(
  markedPosition.unrealizedPnl,
  100,
  "LONG unrealized PnL",
);

assertApproximatelyEqual(
  markedPosition.marginUsed,
  550,
  "Marked position margin",
);

const markedSnapshot =
  portfolio.getSnapshot();

console.log(
  "Marked portfolio snapshot:",
  markedSnapshot,
);

assertApproximatelyEqual(
  markedSnapshot.unrealizedPnl,
  100,
  "Portfolio unrealized PnL",
);

assertApproximatelyEqual(
  markedSnapshot.cashBalance,
  9_999,
  "Cash balance after opening fee",
);

assertApproximatelyEqual(
  markedSnapshot.equity,
  10_099,
  "Portfolio equity",
);

assertApproximatelyEqual(
  markedSnapshot.marginUsed,
  550,
  "Portfolio margin used",
);

assertApproximatelyEqual(
  markedSnapshot.totalExposure,
  1_100,
  "Portfolio exposure",
);

assertApproximatelyEqual(
  markedSnapshot.availableBalance,
  9_549,
  "Available balance",
);

if (
  markedSnapshot.openPositionCount !==
  1
) {
  throw new Error(
    "Expected one open position after opening.",
  );
}

const increaseExecution =
  executionEngine.executeMarketOrder({
    trade: createApprovedTrade({
      signalId: "signal-2",
      quantity: 10,
      entryPrice: 120,
      positionNotional: 1_200,
      marginRequired: 600,
    }),
    marketPrice: 120,
  });

const increaseUpdate =
  portfolio.processExecution(
    increaseExecution,
  );

console.log(
  "Increase position update:",
  increaseUpdate,
);

if (
  increaseUpdate.action !==
    "INCREASED" ||
  !increaseUpdate.position
) {
  throw new Error(
    "Expected the LONG position to be increased.",
  );
}

assertApproximatelyEqual(
  increaseUpdate.position.quantity,
  20,
  "Increased quantity",
);

assertApproximatelyEqual(
  increaseUpdate.position.averageEntryPrice,
  110,
  "Weighted average entry price",
);

assertApproximatelyEqual(
  increaseUpdate.position.unrealizedPnl,
  200,
  "Increased position unrealized PnL",
);

assertApproximatelyEqual(
  increaseUpdate.position.entryFees,
  2.2,
  "Accumulated entry fees",
);

const partialCloseExecution =
  executionEngine.executeMarketOrder({
    trade: createApprovedTrade({
      signalId: "signal-3",
      side: "SELL",
      quantity: 5,
      entryPrice: 130,
      stopLossPrice: 135,
      positionNotional: 650,
      marginRequired: 325,
    }),
    marketPrice: 130,
  });

const partialCloseUpdate =
  portfolio.processExecution(
    partialCloseExecution,
  );

console.log(
  "Partial-close update:",
  partialCloseUpdate,
);

if (
  partialCloseUpdate.action !==
    "REDUCED" ||
  !partialCloseUpdate.position ||
  !partialCloseUpdate.closedTrade
) {
  throw new Error(
    "Expected the LONG position to be partially reduced.",
  );
}

assertApproximatelyEqual(
  partialCloseUpdate.position.quantity,
  15,
  "Remaining quantity",
);

assertApproximatelyEqual(
  partialCloseUpdate.grossRealizedPnl,
  100,
  "Partial-close gross realized PnL",
);

assertApproximatelyEqual(
  partialCloseUpdate.position.realizedPnl,
  100,
  "Position realized PnL after partial close",
);

assertApproximatelyEqual(
  partialCloseUpdate.closedTrade.entryFee,
  0.55,
  "Allocated partial-close entry fee",
);

assertApproximatelyEqual(
  partialCloseUpdate.closedTrade.exitFee,
  0.65,
  "Partial-close exit fee",
);

assertApproximatelyEqual(
  partialCloseUpdate.closedTrade.netRealizedPnl,
  98.8,
  "Partial-close net realized PnL",
);

const finalCloseExecution =
  executionEngine.executeMarketOrder({
    trade: createApprovedTrade({
      signalId: "signal-4",
      side: "SELL",
      quantity: 15,
      entryPrice: 120,
      stopLossPrice: 125,
      positionNotional: 1_800,
      marginRequired: 900,
    }),
    marketPrice: 120,
  });

const finalCloseUpdate =
  portfolio.processExecution(
    finalCloseExecution,
  );

console.log(
  "Final-close update:",
  finalCloseUpdate,
);

if (
  finalCloseUpdate.action !==
    "CLOSED" ||
  !finalCloseUpdate.closedTrade
) {
  throw new Error(
    "Expected the remaining LONG position to be closed.",
  );
}

if (
  portfolio.getPosition(
    "BTCUSDT",
  )
) {
  throw new Error(
    "BTCUSDT position should no longer be open.",
  );
}

assertApproximatelyEqual(
  finalCloseUpdate.grossRealizedPnl,
  150,
  "Final-close gross realized PnL",
);

assertApproximatelyEqual(
  finalCloseUpdate.closedTrade.entryFee,
  1.65,
  "Allocated final-close entry fee",
);

assertApproximatelyEqual(
  finalCloseUpdate.closedTrade.exitFee,
  1.8,
  "Final-close exit fee",
);

assertApproximatelyEqual(
  finalCloseUpdate.closedTrade.netRealizedPnl,
  146.55,
  "Final-close net realized PnL",
);

const finalSnapshot =
  portfolio.getSnapshot();

console.log(
  "Final portfolio snapshot:",
  finalSnapshot,
);

assertApproximatelyEqual(
  finalSnapshot.realizedPnl,
  250,
  "Portfolio realized PnL",
);

assertApproximatelyEqual(
  finalSnapshot.totalFees,
  4.65,
  "Portfolio total fees",
);

assertApproximatelyEqual(
  finalSnapshot.cashBalance,
  10_245.35,
  "Final cash balance",
);

assertApproximatelyEqual(
  finalSnapshot.equity,
  10_245.35,
  "Final equity",
);

assertApproximatelyEqual(
  finalSnapshot.availableBalance,
  10_245.35,
  "Final available balance",
);

assertApproximatelyEqual(
  finalSnapshot.marginUsed,
  0,
  "Final margin used",
);

assertApproximatelyEqual(
  finalSnapshot.totalExposure,
  0,
  "Final total exposure",
);

assertApproximatelyEqual(
  finalSnapshot.unrealizedPnl,
  0,
  "Final unrealized PnL",
);

assertApproximatelyEqual(
  finalSnapshot.returnPercentage,
  2.4535,
  "Portfolio return percentage",
);

if (
  finalSnapshot.openPositionCount !==
  0
) {
  throw new Error(
    "Expected no open positions.",
  );
}

if (
  finalSnapshot.closedTradeCount !==
  2
) {
  throw new Error(
    `Expected 2 closed trades, received ${finalSnapshot.closedTradeCount}.`,
  );
}

if (
  finalSnapshot.winningTrades !== 2
) {
  throw new Error(
    "Expected both closed trades to be winners.",
  );
}

if (
  finalSnapshot.losingTrades !== 0
) {
  throw new Error(
    "Expected no losing trades.",
  );
}

assertApproximatelyEqual(
  finalSnapshot.winRate,
  1,
  "Portfolio win rate",
);

const closedTrades =
  portfolio.listClosedTrades();

if (closedTrades.length !== 2) {
  throw new Error(
    "Expected exactly two entries in closed trade history.",
  );
}

portfolio.clear();

const clearedSnapshot =
  portfolio.getSnapshot();

assertApproximatelyEqual(
  clearedSnapshot.cashBalance,
  10_000,
  "Cleared cash balance",
);

assertApproximatelyEqual(
  clearedSnapshot.equity,
  10_000,
  "Cleared equity",
);

assertApproximatelyEqual(
  clearedSnapshot.realizedPnl,
  0,
  "Cleared realized PnL",
);

assertApproximatelyEqual(
  clearedSnapshot.totalFees,
  0,
  "Cleared total fees",
);

if (
  clearedSnapshot.openPositionCount !==
    0 ||
  clearedSnapshot.closedTradeCount !==
    0
) {
  throw new Error(
    "Portfolio should return to its initial state after clearing.",
  );
}

console.log(
  "All portfolio tests passed successfully.",
);