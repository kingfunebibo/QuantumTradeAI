import assert from "node:assert/strict";

import type {
  PortfolioSnapshot,
} from "./portfolio";

import {
  DeterministicBacktestEquityCurve,
} from "./backtesting/equity";

function createPortfolioSnapshot(
  overrides: Partial<PortfolioSnapshot> = {},
): PortfolioSnapshot {
  return {
    initialBalance: 100_000,
    cashBalance: 100_000,
    equity: 100_000,
    availableBalance: 100_000,
    marginUsed: 0,
    totalExposure: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalFees: 0,
    openPositionCount: 0,
    closedTradeCount: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    returnPercentage: 0,
    ...overrides,
  };
}

function testInitialObservation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  const point = curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  assert.equal(point.sequence, 1);
  assert.equal(point.candleIndex, -1);
  assert.equal(point.reason, "INITIAL");

  assert.equal(
    point.startingCapital,
    100_000,
  );

  assert.equal(point.equity, 100_000);
  assert.equal(point.totalPnl, 0);
  assert.equal(point.absoluteReturn, 0);
  assert.equal(point.returnRate, 0);

  assert.equal(point.peakEquity, 100_000);
  assert.equal(point.drawdownAmount, 0);
  assert.equal(point.drawdownRate, 0);

  assert.equal(point.openPositionCount, 0);
  assert.equal(point.closedTradeCount, 0);

  const metrics = curve.getMetrics();

  assert.deepEqual(metrics, {
    observations: 1,

    initialEquity: 100_000,
    currentEquity: 100_000,
    peakEquity: 100_000,
    minimumEquity: 100_000,

    absoluteReturn: 0,
    returnRate: 0,

    currentDrawdownAmount: 0,
    currentDrawdownRate: 0,

    maximumDrawdownAmount: 0,
    maximumDrawdownRate: 0,

    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    totalFees: 0,

    profitableObservations: 0,
    losingObservations: 0,
    unchangedObservations: 0,
  });
}

function testProfitableObservation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  const point = curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot({
        cashBalance: 99_900,
        equity: 102_000,
        availableBalance: 99_900,
        marginUsed: 100,
        totalExposure: 2_100,
        unrealizedPnl: 1_500,
        realizedPnl: 500,
        totalFees: 100,
        openPositionCount: 1,
        returnPercentage: 2,
      }),
  });

  assert.equal(point.sequence, 2);
  assert.equal(point.equity, 102_000);

  assert.equal(
    point.totalPnl,
    2_000,
  );

  assert.equal(
    point.absoluteReturn,
    2_000,
  );

  assert.equal(
    point.returnRate,
    0.02,
  );

  assert.equal(point.peakEquity, 102_000);
  assert.equal(point.drawdownAmount, 0);
  assert.equal(point.drawdownRate, 0);
  assert.equal(point.openPositionCount, 1);

  const metrics = curve.getMetrics();

  assert.equal(metrics.observations, 2);
  assert.equal(metrics.currentEquity, 102_000);
  assert.equal(metrics.peakEquity, 102_000);
  assert.equal(metrics.minimumEquity, 100_000);
  assert.equal(metrics.absoluteReturn, 2_000);
  assert.equal(metrics.returnRate, 0.02);
  assert.equal(metrics.profitableObservations, 1);
  assert.equal(metrics.losingObservations, 0);
  assert.equal(metrics.unchangedObservations, 0);
}

function testDrawdownMetrics(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot({
        equity: 110_000,
        unrealizedPnl: 10_000,
        returnPercentage: 10,
      }),
  });

  const drawdownPoint = curve.record({
    candleIndex: 1,
    timestamp: 1_700_000_120_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot({
        equity: 99_000,
        unrealizedPnl: -1_000,
        returnPercentage: -1,
      }),
  });

  assert.equal(
    drawdownPoint.peakEquity,
    110_000,
  );

  assert.equal(
    drawdownPoint.drawdownAmount,
    11_000,
  );

  assert.equal(
    drawdownPoint.drawdownRate,
    0.1,
  );

  const metrics = curve.getMetrics();

  assert.equal(metrics.observations, 3);
  assert.equal(metrics.currentEquity, 99_000);
  assert.equal(metrics.peakEquity, 110_000);
  assert.equal(metrics.minimumEquity, 99_000);

  assert.equal(
    metrics.currentDrawdownAmount,
    11_000,
  );

  assert.equal(
    metrics.currentDrawdownRate,
    0.1,
  );

  assert.equal(
    metrics.maximumDrawdownAmount,
    11_000,
  );

  assert.equal(
    metrics.maximumDrawdownRate,
    0.1,
  );

  assert.equal(metrics.profitableObservations, 1);
  assert.equal(metrics.losingObservations, 1);
  assert.equal(metrics.unchangedObservations, 0);
}

function testMultipleObservationsPerCandle(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  const executionPoint = curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "EXECUTION",
    portfolioSnapshot:
      createPortfolioSnapshot({
        cashBalance: 90_000,
        equity: 99_990,
        availableBalance: 90_000,
        marginUsed: 10_000,
        totalExposure: 10_000,
        totalFees: 10,
        openPositionCount: 1,
        returnPercentage: -0.01,
      }),
  });

  const candlePoint = curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot({
        cashBalance: 90_000,
        equity: 100_500,
        availableBalance: 90_000,
        marginUsed: 10_000,
        totalExposure: 10_500,
        unrealizedPnl: 510,
        totalFees: 10,
        openPositionCount: 1,
        returnPercentage: 0.5,
      }),
  });

  assert.equal(executionPoint.candleIndex, 0);
  assert.equal(candlePoint.candleIndex, 0);

  assert.equal(
    executionPoint.timestamp,
    candlePoint.timestamp,
  );

  assert.equal(
    curve.getPoints().length,
    3,
  );

  assert.equal(
    curve.getLatestPoint()?.reason,
    "CANDLE",
  );
}

function testUnchangedObservation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  assert.equal(
    curve.getMetrics().unchangedObservations,
    1,
  );
}

function testFinalObservationLocksCurve(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "FINAL",
    portfolioSnapshot:
      createPortfolioSnapshot({
        equity: 101_000,
        realizedPnl: 1_000,
        returnPercentage: 1,
      }),
  });

  assert.throws(
    () => {
      curve.record({
        candleIndex: 1,
        timestamp: 1_700_000_120_000,
        reason: "CANDLE",
        portfolioSnapshot:
          createPortfolioSnapshot(),
      });
    },
    /after the final observation/,
  );
}

function testOrderingValidation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  curve.record({
    candleIndex: 1,
    timestamp: 1_700_000_120_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  assert.throws(
    () => {
      curve.record({
        candleIndex: 0,
        timestamp: 1_700_000_180_000,
        reason: "CANDLE",
        portfolioSnapshot:
          createPortfolioSnapshot(),
      });
    },
    /candle order cannot move backwards/,
  );
}

function testTimestampValidation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_060_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  assert.throws(
    () => {
      curve.record({
        candleIndex: 0,
        timestamp: 1_700_000_000_000,
        reason: "CANDLE",
        portfolioSnapshot:
          createPortfolioSnapshot(),
      });
    },
    /timestamps cannot move backwards/,
  );
}

function testInitialObservationValidation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  assert.throws(
    () => {
      curve.record({
        candleIndex: 0,
        timestamp: 1_700_000_000_000,
        reason: "CANDLE",
        portfolioSnapshot:
          createPortfolioSnapshot(),
      });
    },
    /first equity observation must be INITIAL/,
  );

  assert.throws(
    () => {
      curve.record({
        candleIndex: 0,
        timestamp: 1_700_000_000_000,
        reason: "INITIAL",
        portfolioSnapshot:
          createPortfolioSnapshot(),
      });
    },
    /initial equity observation must use candle index -1/,
  );
}

function testSnapshotValidation(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  assert.throws(
    () => {
      curve.record({
        candleIndex: -1,
        timestamp: 1_700_000_000_000,
        reason: "INITIAL",
        portfolioSnapshot:
          createPortfolioSnapshot({
            equity: Number.NaN,
          }),
      });
    },
    /Portfolio equity must be a finite number/,
  );

  assert.throws(
    () => {
      curve.record({
        candleIndex: -1,
        timestamp: 1_700_000_000_000,
        reason: "INITIAL",
        portfolioSnapshot:
          createPortfolioSnapshot({
            openPositionCount: -1,
          }),
      });
    },
    /open position count must be a non-negative safe integer/,
  );

  assert.throws(
    () => {
      curve.record({
        candleIndex: -1,
        timestamp: 1_700_000_000_000,
        reason: "INITIAL",
        portfolioSnapshot:
          createPortfolioSnapshot({
            closedTradeCount: 1,
            winningTrades: 2,
          }),
      });
    },
    /winning trades cannot exceed closed trades/,
  );
}

function testReturnedCollectionsAreDefensive(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  const originalSnapshot =
    createPortfolioSnapshot();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      originalSnapshot,
  });

  originalSnapshot.equity = 50_000;

  assert.equal(
    curve.getLatestPoint()?.equity,
    100_000,
  );

  const points = curve.getPoints();

  assert.equal(
    Object.isFrozen(points),
    true,
  );

  assert.equal(
    Object.isFrozen(
      points[0]?.portfolioSnapshot,
    ),
    true,
  );
}

function testReset(): void {
  const curve =
    new DeterministicBacktestEquityCurve();

  curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  curve.record({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    reason: "CANDLE",
    portfolioSnapshot:
      createPortfolioSnapshot({
        equity: 101_000,
        unrealizedPnl: 1_000,
        returnPercentage: 1,
      }),
  });

  curve.reset();

  assert.equal(curve.getPoints().length, 0);

  assert.equal(
    curve.getLatestPoint(),
    undefined,
  );

  assert.deepEqual(
    curve.getMetrics(),
    {
      observations: 0,

      initialEquity: 0,
      currentEquity: 0,
      peakEquity: 0,
      minimumEquity: 0,

      absoluteReturn: 0,
      returnRate: 0,

      currentDrawdownAmount: 0,
      currentDrawdownRate: 0,

      maximumDrawdownAmount: 0,
      maximumDrawdownRate: 0,

      realizedPnl: 0,
      unrealizedPnl: 0,
      totalPnl: 0,
      totalFees: 0,

      profitableObservations: 0,
      losingObservations: 0,
      unchangedObservations: 0,
    },
  );

  const newInitialPoint = curve.record({
    candleIndex: -1,
    timestamp: 1_700_000_000_000,
    reason: "INITIAL",
    portfolioSnapshot:
      createPortfolioSnapshot(),
  });

  assert.equal(newInitialPoint.sequence, 1);
}

function runTests(): void {
  testInitialObservation();
  testProfitableObservation();
  testDrawdownMetrics();
  testMultipleObservationsPerCandle();
  testUnchangedObservation();
  testFinalObservationLocksCurve();
  testOrderingValidation();
  testTimestampValidation();
  testInitialObservationValidation();
  testSnapshotValidation();
  testReturnedCollectionsAreDefensive();
  testReset();

  console.log(
    "All deterministic backtest equity curve tests passed successfully.",
  );
}

runTests();