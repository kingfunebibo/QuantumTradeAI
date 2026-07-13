import assert from "node:assert/strict";

import type {
  ClosedTrade,
} from "./portfolio";

import {
  DeterministicBacktestTradeAnalytics,
} from "./backtesting/analytics";

function createClosedTrade(
  overrides: Partial<ClosedTrade> = {},
): ClosedTrade {
  return {
    id: "TRADE-1",
    positionId: "POSITION-1",
    orderId: "ORDER-1",
    symbol: "BTCUSDT",
    side: "LONG",
    quantity: 1,
    entryPrice: 100,
    exitPrice: 110,
    grossRealizedPnl: 10,
    entryFee: 1,
    exitFee: 1,
    netRealizedPnl: 8,
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_060_000,
    metadata: {},
    ...overrides,
  };
}

function createSampleTrades():
  readonly ClosedTrade[] {
  return [
    createClosedTrade({
      id: "TRADE-1",
      positionId: "POSITION-1",
      orderId: "ORDER-1",
      symbol: "BTCUSDT",
      side: "LONG",
      netRealizedPnl: 100,
      grossRealizedPnl: 110,
      entryFee: 5,
      exitFee: 5,
      openedAt: 1_700_000_000_000,
      closedAt: 1_700_000_060_000,
    }),
    createClosedTrade({
      id: "TRADE-2",
      positionId: "POSITION-2",
      orderId: "ORDER-2",
      symbol: "ETHUSDT",
      side: "SHORT",
      netRealizedPnl: -50,
      grossRealizedPnl: -40,
      entryFee: 5,
      exitFee: 5,
      openedAt: 1_700_000_060_000,
      closedAt: 1_700_000_180_000,
    }),
    createClosedTrade({
      id: "TRADE-3",
      positionId: "POSITION-3",
      orderId: "ORDER-3",
      symbol: "BTCUSDT",
      side: "LONG",
      netRealizedPnl: 0,
      grossRealizedPnl: 10,
      entryFee: 5,
      exitFee: 5,
      openedAt: 1_700_000_180_000,
      closedAt: 1_700_000_240_000,
    }),
    createClosedTrade({
      id: "TRADE-4",
      positionId: "POSITION-4",
      orderId: "ORDER-4",
      symbol: "ETHUSDT",
      side: "SHORT",
      netRealizedPnl: 200,
      grossRealizedPnl: 210,
      entryFee: 5,
      exitFee: 5,
      openedAt: 1_700_000_240_000,
      closedAt: 1_700_000_360_000,
    }),
  ];
}

function testReportGeneration(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const report = analytics.analyze(
    createSampleTrades(),
    1_700_000_420_000,
  );

  assert.equal(
    report.generatedAt,
    1_700_000_420_000,
  );

  assert.equal(
    report.trades.length,
    4,
  );

  assert.equal(
    report.summary.outcomes.totalTrades,
    4,
  );

  assert.equal(
    report.summary.outcomes.winningTrades,
    2,
  );

  assert.equal(
    report.summary.outcomes.losingTrades,
    1,
  );

  assert.equal(
    report.summary.outcomes.breakevenTrades,
    1,
  );

  assert.equal(
    report.summary.outcomes.winRate,
    0.5,
  );

  assert.equal(
    report.summary.outcomes.lossRate,
    0.25,
  );

  assert.equal(
    report.summary.outcomes.breakevenRate,
    0.25,
  );

  assert.equal(
    analytics.getReport(),
    report,
  );

  assert.equal(
    analytics.getSummary(),
    report.summary,
  );

  assert.equal(
    analytics.getTrades().length,
    4,
  );
}

function testProfitStatistics(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const report = analytics.analyze(
    createSampleTrades(),
    1_700_000_420_000,
  );

  const profit =
    report.summary.profit;

  assert.equal(
    profit.grossProfit,
    300,
  );

  assert.equal(
    profit.grossLoss,
    50,
  );

  assert.equal(
    profit.netProfit,
    250,
  );

  assert.equal(
    profit.averageTrade,
    62.5,
  );

  assert.equal(
    profit.averageWin,
    150,
  );

  assert.equal(
    profit.averageLoss,
    50,
  );

  assert.equal(
    profit.largestWin,
    200,
  );

  assert.equal(
    profit.largestLoss,
    50,
  );

  assert.equal(
    profit.profitFactor,
    6,
  );

  assert.equal(
    profit.payoffRatio,
    3,
  );

  assert.equal(
    profit.expectancy,
    62.5,
  );

  assert.equal(
    profit.expectancyRatio,
    1.25,
  );
}

function testDurationStatistics(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const report = analytics.analyze(
    createSampleTrades(),
    1_700_000_420_000,
  );

  const duration =
    report.summary.duration;

  assert.equal(
    duration.totalDuration,
    360_000,
  );

  assert.equal(
    duration.averageDuration,
    90_000,
  );

  assert.equal(
    duration.minimumDuration,
    60_000,
  );

  assert.equal(
    duration.maximumDuration,
    120_000,
  );

  assert.equal(
    duration.averageWinningDuration,
    90_000,
  );

  assert.equal(
    duration.averageLosingDuration,
    120_000,
  );

  assert.equal(
    duration.averageBreakevenDuration,
    60_000,
  );
}

function testStreakStatistics(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const trades = [
    createClosedTrade({
      id: "TRADE-1",
      netRealizedPnl: 10,
      openedAt: 0,
      closedAt: 1,
    }),
    createClosedTrade({
      id: "TRADE-2",
      netRealizedPnl: 20,
      openedAt: 1,
      closedAt: 2,
    }),
    createClosedTrade({
      id: "TRADE-3",
      netRealizedPnl: -5,
      openedAt: 2,
      closedAt: 3,
    }),
    createClosedTrade({
      id: "TRADE-4",
      netRealizedPnl: -10,
      openedAt: 3,
      closedAt: 4,
    }),
    createClosedTrade({
      id: "TRADE-5",
      netRealizedPnl: 0,
      openedAt: 4,
      closedAt: 5,
    }),
  ];

  const report = analytics.analyze(
    trades,
    6,
  );

  const streaks =
    report.summary.streaks;

  assert.equal(
    streaks.maximumConsecutiveWins,
    2,
  );

  assert.equal(
    streaks.maximumConsecutiveLosses,
    2,
  );

  assert.equal(
    streaks.maximumConsecutiveBreakevenTrades,
    1,
  );

  assert.equal(
    streaks.currentWinningStreak,
    0,
  );

  assert.equal(
    streaks.currentLosingStreak,
    0,
  );

  assert.equal(
    streaks.currentBreakevenStreak,
    1,
  );
}

function testSideStatistics(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const report = analytics.analyze(
    createSampleTrades(),
    1_700_000_420_000,
  );

  const sides =
    report.summary.sides;

  assert.equal(sides.longTrades, 2);
  assert.equal(sides.shortTrades, 2);

  assert.equal(
    sides.longWinningTrades,
    1,
  );

  assert.equal(
    sides.longLosingTrades,
    0,
  );

  assert.equal(
    sides.longBreakevenTrades,
    1,
  );

  assert.equal(
    sides.shortWinningTrades,
    1,
  );

  assert.equal(
    sides.shortLosingTrades,
    1,
  );

  assert.equal(
    sides.shortBreakevenTrades,
    0,
  );

  assert.equal(
    sides.longNetProfit,
    100,
  );

  assert.equal(
    sides.shortNetProfit,
    150,
  );
}

function testSymbolStatistics(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const report = analytics.analyze(
    createSampleTrades(),
    1_700_000_420_000,
  );

  const symbols =
    report.summary.symbols;

  assert.equal(symbols.length, 2);

  assert.equal(
    symbols[0]?.symbol,
    "BTCUSDT",
  );

  assert.equal(
    symbols[1]?.symbol,
    "ETHUSDT",
  );

  assert.equal(
    symbols[0]?.totalTrades,
    2,
  );

  assert.equal(
    symbols[0]?.winningTrades,
    1,
  );

  assert.equal(
    symbols[0]?.breakevenTrades,
    1,
  );

  assert.equal(
    symbols[0]?.netProfit,
    100,
  );

  assert.equal(
    symbols[0]?.profitFactor,
    null,
  );

  assert.equal(
    symbols[1]?.grossProfit,
    200,
  );

  assert.equal(
    symbols[1]?.grossLoss,
    50,
  );

  assert.equal(
    symbols[1]?.netProfit,
    150,
  );

  assert.equal(
    symbols[1]?.profitFactor,
    4,
  );
}

function testEmptyTrades(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const report = analytics.analyze(
    [],
    1_700_000_000_000,
  );

  assert.equal(
    report.trades.length,
    0,
  );

  assert.equal(
    report.summary.outcomes.totalTrades,
    0,
  );

  assert.equal(
    report.summary.profit.netProfit,
    0,
  );

  assert.equal(
    report.summary.profit.profitFactor,
    null,
  );

  assert.equal(
    report.summary.duration.averageDuration,
    0,
  );

  assert.equal(
    report.summary.symbols.length,
    0,
  );
}

function testDefensiveCopies(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  const source =
    createSampleTrades().map(
      (trade) => ({
        ...trade,
        metadata: {
          ...trade.metadata,
        },
      }),
    );

  const report = analytics.analyze(
    source,
    1_700_000_420_000,
  );

  source[0]!.netRealizedPnl = 999_999;
  source[0]!.metadata.changed = true;

  assert.equal(
    report.trades[0]?.netRealizedPnl,
    100,
  );

  assert.equal(
    report.trades[0]
      ?.sourceTrade.netRealizedPnl,
    100,
  );

  assert.equal(
    Object.isFrozen(report.trades),
    true,
  );

  assert.equal(
    Object.isFrozen(
      report.trades[0]?.sourceTrade,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      report.trades[0]
        ?.sourceTrade.metadata,
    ),
    true,
  );
}

function testValidation(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  assert.throws(
    () => {
      analytics.analyze(
        [
          createClosedTrade({
            id: "",
          }),
        ],
        1,
      );
    },
    /Trade ID must be non-empty/,
  );

  assert.throws(
    () => {
      analytics.analyze(
        [
          createClosedTrade({
            quantity: 0,
          }),
        ],
        1,
      );
    },
    /Trade quantity must be a positive finite number/,
  );

  assert.throws(
    () => {
      analytics.analyze(
        [
          createClosedTrade({
            openedAt: 10,
            closedAt: 5,
          }),
        ],
        11,
      );
    },
    /closedAt cannot be earlier than openedAt/,
  );

  assert.throws(
    () => {
      analytics.analyze(
        [
          createClosedTrade({
            id: "TRADE-1",
            openedAt: 0,
            closedAt: 10,
          }),
          createClosedTrade({
            id: "TRADE-2",
            openedAt: 0,
            closedAt: 5,
          }),
        ],
        11,
      );
    },
    /ordered by non-decreasing close time/,
  );

  assert.throws(
    () => {
      analytics.analyze(
        [
          createClosedTrade({
            id: "TRADE-1",
          }),
          createClosedTrade({
            id: "TRADE-1",
          }),
        ],
        1_700_000_420_000,
      );
    },
    /duplicate trade ID/,
  );

  assert.throws(
    () => {
      analytics.analyze(
        createSampleTrades(),
        -1,
      );
    },
    /generatedAt must be a non-negative safe integer/,
  );
}

function testReset(): void {
  const analytics =
    new DeterministicBacktestTradeAnalytics();

  analytics.analyze(
    createSampleTrades(),
    1_700_000_420_000,
  );

  analytics.reset();

  assert.equal(
    analytics.getReport(),
    undefined,
  );

  assert.equal(
    analytics.getSummary(),
    undefined,
  );

  assert.deepEqual(
    analytics.getTrades(),
    [],
  );
}

function runTests(): void {
  testReportGeneration();
  testProfitStatistics();
  testDurationStatistics();
  testStreakStatistics();
  testSideStatistics();
  testSymbolStatistics();
  testEmptyTrades();
  testDefensiveCopies();
  testValidation();
  testReset();

  console.log(
    "All deterministic backtest trade analytics tests passed successfully.",
  );
}

runTests();