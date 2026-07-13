import assert from "node:assert/strict";

import type {
  PortfolioSnapshot,
} from "./portfolio";

import {
  DeterministicBacktestPerformanceAnalytics,
} from "./backtesting/analytics";

import type {
  BacktestEquityPoint,
} from "./backtesting/equity";

function createPortfolioSnapshot(
  equity: number,
): PortfolioSnapshot {
  return {
    initialBalance: 100_000,
    cashBalance: equity,
    equity,
    availableBalance: equity,
    marginUsed: 0,
    totalExposure: 0,
    unrealizedPnl: equity - 100_000,
    realizedPnl: 0,
    totalFees: 0,
    openPositionCount: 0,
    closedTradeCount: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    returnPercentage:
      ((equity - 100_000) / 100_000) * 100,
  };
}

function createEquityPoint(
  sequence: number,
  candleIndex: number,
  timestamp: number,
  equity: number,
): BacktestEquityPoint {
  const snapshot =
    createPortfolioSnapshot(equity);

  const absoluteReturn =
    equity - 100_000;

  const returnRate =
    absoluteReturn / 100_000;

  return {
    sequence,
    candleIndex,
    timestamp,
    reason:
      sequence === 1
        ? "INITIAL"
        : "CANDLE",

    startingCapital: 100_000,
    cashBalance: equity,
    equity,

    realizedPnl: 0,
    unrealizedPnl:
      equity - 100_000,
    totalPnl:
      equity - 100_000,
    totalFees: 0,

    absoluteReturn,
    returnRate,

    peakEquity: equity,
    drawdownAmount: 0,
    drawdownRate: 0,

    openPositionCount: 0,
    closedTradeCount: 0,

    portfolioSnapshot: snapshot,
  };
}

function createSampleCurve():
  readonly BacktestEquityPoint[] {
  return [
    createEquityPoint(
      1,
      -1,
      1_700_000_000_000,
      100_000,
    ),
    createEquityPoint(
      2,
      0,
      1_700_000_060_000,
      110_000,
    ),
    createEquityPoint(
      3,
      1,
      1_700_000_120_000,
      99_000,
    ),
    createEquityPoint(
      4,
      2,
      1_700_000_180_000,
      108_900,
    ),
  ];
}

function testReportGeneration(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics({
      periodsPerYear: 252,
      riskFreeRate: 0,
      minimumAcceptableReturn: 0,
    });

  const report = analytics.analyze(
    createSampleCurve(),
    1_700_000_240_000,
  );

  assert.equal(
    report.generatedAt,
    1_700_000_240_000,
  );

  assert.equal(
    report.configuration.periodsPerYear,
    252,
  );

  assert.equal(
    report.equityPoints.length,
    4,
  );

  assert.equal(
    report.periodReturns.length,
    3,
  );

  assert.equal(
    report.summary.initialEquity,
    100_000,
  );

  assert.equal(
    report.summary.finalEquity,
    108_900,
  );

  assert.equal(
    report.summary.absoluteReturn,
    8_900,
  );

  assert.equal(
    report.summary.totalReturnRate,
    0.089,
  );

  assert.equal(
    report.summary.peakEquity,
    110_000,
  );

  assert.equal(
    report.summary.minimumEquity,
    99_000,
  );

  assert.equal(
    report.summary.profitablePeriods,
    2,
  );

  assert.equal(
    report.summary.losingPeriods,
    1,
  );

  assert.equal(
    report.summary.unchangedPeriods,
    0,
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
    analytics.getPeriodReturns().length,
    3,
  );
}

function testPeriodReturns(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics();

  const report = analytics.analyze(
    createSampleCurve(),
    1_700_000_240_000,
  );

  const returns =
    report.periodReturns;

  assert.equal(returns.length, 3);

  assert.equal(
    returns[0]?.absoluteReturn,
    10_000,
  );

  assert.equal(
    returns[0]?.returnRate,
    0.1,
  );

  assert.equal(
    returns[1]?.absoluteReturn,
    -11_000,
  );

  assert.equal(
    returns[1]?.returnRate,
    -0.1,
  );

  assert.equal(
    returns[2]?.absoluteReturn,
    9_900,
  );

  assert.equal(
    returns[2]?.returnRate,
    0.1,
  );

  assert.equal(
    report.summary.returnStatistics
      .cumulativeReturn,
    0.089,
  );

  assert.equal(
    report.summary.returnStatistics
      .arithmeticMeanReturn,
    0.03333333333333333,
  );

  assert.equal(
    report.summary.returnStatistics
      .minimumReturn,
    -0.1,
  );

  assert.equal(
    report.summary.returnStatistics
      .maximumReturn,
    0.1,
  );
}

function testDrawdownAnalysis(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics();

  const report = analytics.analyze(
    createSampleCurve(),
    1_700_000_240_000,
  );

  assert.equal(
    report.drawdownPeriods.length,
    1,
  );

  const drawdown =
    report.drawdownPeriods[0];

  assert.equal(
    drawdown?.peakEquity,
    110_000,
  );

  assert.equal(
    drawdown?.troughEquity,
    99_000,
  );

  assert.equal(
    drawdown?.drawdownAmount,
    11_000,
  );

  assert.equal(
    drawdown?.drawdownRate,
    0.1,
  );

  assert.equal(
    drawdown?.recovered,
    false,
  );

  assert.equal(
    report.summary.drawdownStatistics
      .maximumDrawdownAmount,
    11_000,
  );

  assert.equal(
    report.summary.drawdownStatistics
      .maximumDrawdownRate,
    0.1,
  );

  assert.equal(
    report.summary.drawdownStatistics
      .currentDrawdownAmount,
    1_100,
  );

  assert.equal(
    report.summary.drawdownStatistics
      .currentDrawdownRate,
    0.01,
  );
}

function testSinglePointCurve(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics();

  const report = analytics.analyze(
    [
      createEquityPoint(
        1,
        -1,
        1_700_000_000_000,
        100_000,
      ),
    ],
    1_700_000_060_000,
  );

  assert.equal(
    report.periodReturns.length,
    0,
  );

  assert.equal(
    report.drawdownPeriods.length,
    0,
  );

  assert.equal(
    report.summary.absoluteReturn,
    0,
  );

  assert.equal(
    report.summary.ratios.sharpeRatio,
    null,
  );

  assert.equal(
    report.summary.ratios.sortinoRatio,
    null,
  );

  assert.equal(
    report.summary.ratios.calmarRatio,
    null,
  );

  assert.equal(
    report.summary.ratios.recoveryFactor,
    null,
  );
}

function testDefensiveCopies(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics();

  const source =
    createSampleCurve().map(
      (point) => ({
        ...point,
        portfolioSnapshot: {
          ...point.portfolioSnapshot,
        },
      }),
    );

  const report = analytics.analyze(
    source,
    1_700_000_240_000,
  );

  source[0]!.portfolioSnapshot.equity =
    1;

  source[0]!.equity = 1;

  assert.equal(
    report.equityPoints[0]?.equity,
    100_000,
  );

  assert.equal(
    report.equityPoints[0]
      ?.portfolioSnapshot.equity,
    100_000,
  );

  assert.equal(
    Object.isFrozen(
      report.equityPoints,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      report.periodReturns,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      report.drawdownPeriods,
    ),
    true,
  );
}

function testValidation(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics();

  assert.throws(
    () => {
      analytics.analyze(
        [],
        1_700_000_000_000,
      );
    },
    /requires at least one equity point/,
  );

  assert.throws(
    () => {
      analytics.analyze(
        createSampleCurve(),
        -1,
      );
    },
    /generatedAt must be a non-negative safe integer/,
  );

  const invalidSequence =
    createSampleCurve().map(
      (point) => ({
        ...point,
      }),
    );

  invalidSequence[1] = {
    ...invalidSequence[1]!,
    sequence: 3,
  };

  assert.throws(
    () => {
      analytics.analyze(
        invalidSequence,
        1_700_000_240_000,
      );
    },
    /sequence must be contiguous/,
  );

  const invalidTimestamp =
    createSampleCurve().map(
      (point) => ({
        ...point,
      }),
    );

  invalidTimestamp[2] = {
    ...invalidTimestamp[2]!,
    timestamp:
      1_699_999_000_000,
  };

  assert.throws(
    () => {
      analytics.analyze(
        invalidTimestamp,
        1_700_000_240_000,
      );
    },
    /timestamps cannot move backwards/,
  );

  const invalidEquity =
    createSampleCurve().map(
      (point) => ({
        ...point,
      }),
    );

  invalidEquity[2] = {
    ...invalidEquity[2]!,
    equity: Number.NaN,
  };

  assert.throws(
    () => {
      analytics.analyze(
        invalidEquity,
        1_700_000_240_000,
      );
    },
    /Backtest equity must be a finite number/,
  );
}

function testOptionsValidation(): void {
  assert.throws(
    () => {
      new DeterministicBacktestPerformanceAnalytics({
        periodsPerYear: 0,
      });
    },
    /periods per year must be a positive safe integer/,
  );

  assert.throws(
    () => {
      new DeterministicBacktestPerformanceAnalytics({
        riskFreeRate: Number.NaN,
      });
    },
    /risk-free rate must be a finite number/,
  );

  assert.throws(
    () => {
      new DeterministicBacktestPerformanceAnalytics({
        minimumAcceptableReturn:
          Number.POSITIVE_INFINITY,
      });
    },
    /minimum acceptable return must be a finite number/,
  );
}

function testReset(): void {
  const analytics =
    new DeterministicBacktestPerformanceAnalytics();

  analytics.analyze(
    createSampleCurve(),
    1_700_000_240_000,
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
    analytics.getPeriodReturns(),
    [],
  );

  assert.deepEqual(
    analytics.getDrawdownPeriods(),
    [],
  );
}

function runTests(): void {
  testReportGeneration();
  testPeriodReturns();
  testDrawdownAnalysis();
  testSinglePointCurve();
  testDefensiveCopies();
  testValidation();
  testOptionsValidation();
  testReset();

  console.log(
    "All deterministic backtest performance analytics tests passed successfully.",
  );
}

runTests();