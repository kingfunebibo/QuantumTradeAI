import assert from "node:assert/strict";

import type {
  PortfolioSnapshot,
} from "./portfolio";

import {
  BacktestPortfolioEquityPipeline,
  DeterministicBacktestEquityCurve,
  type BacktestPortfolioValuationSource,
} from "./backtesting/equity";

import {
  DeterministicBacktestSession,
} from "./backtesting/session";

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

class TestPortfolioValuationSource
  implements BacktestPortfolioValuationSource
{
  private snapshot: PortfolioSnapshot =
    createPortfolioSnapshot();

  public readonly marketPriceUpdates: Array<{
    readonly symbol: string;
    readonly marketPrice: number;
  }> = [];

  public setSnapshot(
    snapshot: PortfolioSnapshot,
  ): void {
    this.snapshot = {
      ...snapshot,
    };
  }

  public updateMarketPrice(
    symbol: string,
    marketPrice: number,
  ): void {
    this.marketPriceUpdates.push({
      symbol,
      marketPrice,
    });
  }

  public getSnapshot(): PortfolioSnapshot {
    return {
      ...this.snapshot,
    };
  }
}

function createContext() {
  const portfolio =
    new TestPortfolioValuationSource();

  const equityCurve =
    new DeterministicBacktestEquityCurve();

  const session =
    new DeterministicBacktestSession(
      {
        runId: "MILESTONE-8-PIPELINE-TEST",
        startingCapital: 100_000,
        baseCurrency: "USDT",
      },
      10,
    );

  const pipeline =
    new BacktestPortfolioEquityPipeline(
      portfolio,
      equityCurve,
      session,
    );

  return {
    portfolio,
    equityCurve,
    session,
    pipeline,
  };
}

function testInitialization(): void {
  const context = createContext();

  const timestamp =
    1_700_000_000_000;

  const point =
    context.pipeline.initialize(timestamp);

  assert.equal(
    context.pipeline.isInitialized(),
    true,
  );

  assert.equal(
    context.pipeline.isFinalized(),
    false,
  );

  assert.equal(point.sequence, 1);
  assert.equal(point.candleIndex, -1);
  assert.equal(point.timestamp, timestamp);
  assert.equal(point.reason, "INITIAL");

  assert.equal(point.equity, 100_000);
  assert.equal(point.startingCapital, 100_000);

  assert.equal(
    context.pipeline.getPoints().length,
    1,
  );

  assert.equal(
    context.pipeline.getLatestPoint()?.reason,
    "INITIAL",
  );

  assert.deepEqual(
    context.pipeline.getMetrics(),
    {
      marks: 0,
      executionObservations: 0,
      candleObservations: 0,
      finalObservations: 0,

      currentEquity: 100_000,
      peakEquity: 100_000,
      totalPnl: 0,
      returnRate: 0,

      maximumDrawdownAmount: 0,
      maximumDrawdownRate: 0,
    },
  );

  const events =
    context.session.getEvents();

  assert.equal(events.length, 1);

  assert.equal(
    events[0]?.type,
    "portfolioEquity.initial",
  );

  assert.equal(
    context.session.getMetric(
      "portfolioEquity.currentEquity",
    ),
    100_000,
  );

  assert.equal(
    context.session.getMetric(
      "portfolioEquity.equity.observations",
    ),
    1,
  );
}

function testDuplicateInitializationRejected(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  assert.throws(
    () => {
      context.pipeline.initialize(
        1_700_000_000_001,
      );
    },
    /already initialized/,
  );
}

function testOperationBeforeInitializationRejected(): void {
  const context = createContext();

  assert.throws(
    () => {
      context.pipeline.recordExecution(
        0,
        1_700_000_060_000,
      );
    },
    /must be initialized first/,
  );

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: 0,
        timestamp: 1_700_000_060_000,
        symbol: "BTCUSDT",
        marketPrice: 50_000,
      });
    },
    /must be initialized first/,
  );

  assert.throws(
    () => {
      context.pipeline.finalize(
        0,
        1_700_000_060_000,
      );
    },
    /must be initialized first/,
  );
}

function testExecutionObservation(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      cashBalance: 89_950,
      equity: 99_950,
      availableBalance: 89_950,
      marginUsed: 10_000,
      totalExposure: 10_000,
      totalFees: 50,
      openPositionCount: 1,
      returnPercentage: -0.05,
    }),
  );

  const point =
    context.pipeline.recordExecution(
      0,
      1_700_000_060_000,
    );

  assert.equal(point.reason, "EXECUTION");
  assert.equal(point.candleIndex, 0);
  assert.equal(point.equity, 99_950);
  assert.equal(point.totalFees, 50);
  assert.equal(point.openPositionCount, 1);

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(
    metrics.executionObservations,
    1,
  );

  assert.equal(metrics.marks, 0);
  assert.equal(metrics.candleObservations, 0);
  assert.equal(metrics.currentEquity, 99_950);

  assert.equal(
    metrics.maximumDrawdownAmount,
    50,
  );

  assert.equal(
    metrics.maximumDrawdownRate,
    0.0005,
  );

  assert.equal(
    context.session.getEvents().at(-1)?.type,
    "portfolioEquity.execution",
  );
}

function testCandleMarkToMarket(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      cashBalance: 90_000,
      equity: 102_000,
      availableBalance: 90_000,
      marginUsed: 10_000,
      totalExposure: 12_000,
      unrealizedPnl: 2_000,
      openPositionCount: 1,
      returnPercentage: 2,
    }),
  );

  const result =
    context.pipeline.markToMarket({
      candleIndex: 0,
      timestamp: 1_700_000_060_000,
      symbol: " btcusdt ",
      marketPrice: 51_000,
    });

  assert.equal(result.candleIndex, 0);
  assert.equal(
    result.timestamp,
    1_700_000_060_000,
  );

  assert.equal(result.symbol, "BTCUSDT");
  assert.equal(result.marketPrice, 51_000);

  assert.equal(
    result.equityPoint.reason,
    "CANDLE",
  );

  assert.equal(
    result.equityPoint.equity,
    102_000,
  );

  assert.equal(
    result.portfolioSnapshot.equity,
    102_000,
  );

  assert.deepEqual(
    context.portfolio.marketPriceUpdates,
    [
      {
        symbol: " btcusdt ",
        marketPrice: 51_000,
      },
    ],
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.marks, 1);
  assert.equal(metrics.candleObservations, 1);
  assert.equal(metrics.executionObservations, 0);
  assert.equal(metrics.currentEquity, 102_000);
  assert.equal(metrics.peakEquity, 102_000);
  assert.equal(metrics.totalPnl, 2_000);
  assert.equal(metrics.returnRate, 0.02);

  assert.equal(
    context.session.getEvents().at(-1)?.type,
    "portfolioEquity.candle",
  );
}

function testExecutionAndCandleOnSameIndex(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 99_900,
      cashBalance: 89_900,
      availableBalance: 89_900,
      marginUsed: 10_000,
      totalExposure: 10_000,
      totalFees: 100,
      openPositionCount: 1,
      returnPercentage: -0.1,
    }),
  );

  context.pipeline.recordExecution(
    0,
    1_700_000_060_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 101_000,
      cashBalance: 89_900,
      availableBalance: 89_900,
      marginUsed: 10_000,
      totalExposure: 11_100,
      unrealizedPnl: 1_100,
      totalFees: 100,
      openPositionCount: 1,
      returnPercentage: 1,
    }),
  );

  context.pipeline.markToMarket({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    symbol: "BTCUSDT",
    marketPrice: 50_500,
  });

  const points =
    context.pipeline.getPoints();

  assert.equal(points.length, 3);

  assert.equal(
    points[1]?.reason,
    "EXECUTION",
  );

  assert.equal(
    points[2]?.reason,
    "CANDLE",
  );

  assert.equal(
    points[1]?.candleIndex,
    points[2]?.candleIndex,
  );

  assert.equal(
    points[1]?.timestamp,
    points[2]?.timestamp,
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(
    metrics.executionObservations,
    1,
  );

  assert.equal(
    metrics.candleObservations,
    1,
  );

  assert.equal(metrics.marks, 1);
}

function testDrawdownPropagation(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 110_000,
      unrealizedPnl: 10_000,
      returnPercentage: 10,
    }),
  );

  context.pipeline.markToMarket({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    symbol: "BTCUSDT",
    marketPrice: 55_000,
  });

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 99_000,
      unrealizedPnl: -1_000,
      returnPercentage: -1,
    }),
  );

  context.pipeline.markToMarket({
    candleIndex: 1,
    timestamp: 1_700_000_120_000,
    symbol: "BTCUSDT",
    marketPrice: 49_500,
  });

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.currentEquity, 99_000);
  assert.equal(metrics.peakEquity, 110_000);

  assert.equal(
    metrics.maximumDrawdownAmount,
    11_000,
  );

  assert.equal(
    metrics.maximumDrawdownRate,
    0.1,
  );

  const equityMetrics =
    context.pipeline.getEquityMetrics();

  assert.equal(
    equityMetrics.currentDrawdownAmount,
    11_000,
  );

  assert.equal(
    equityMetrics.currentDrawdownRate,
    0.1,
  );
}

function testFinalizeWithoutMark(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 103_000,
      realizedPnl: 3_000,
      closedTradeCount: 1,
      winningTrades: 1,
      winRate: 100,
      returnPercentage: 3,
    }),
  );

  const point =
    context.pipeline.finalize(
      0,
      1_700_000_060_000,
    );

  assert.equal(point.reason, "FINAL");
  assert.equal(point.equity, 103_000);

  assert.equal(
    context.pipeline.isFinalized(),
    true,
  );

  assert.equal(
    context.pipeline.getMetrics()
      .finalObservations,
    1,
  );

  assert.equal(
    context.pipeline.getMetrics().marks,
    0,
  );

  assert.equal(
    context.session.getEvents().at(-1)?.type,
    "portfolioEquity.final",
  );

  assert.throws(
    () => {
      context.pipeline.recordExecution(
        1,
        1_700_000_120_000,
      );
    },
    /already finalized/,
  );

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: 1,
        timestamp: 1_700_000_120_000,
        symbol: "BTCUSDT",
        marketPrice: 52_000,
      });
    },
    /already finalized/,
  );
}

function testFinalizeWithFinalMark(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 104_000,
      unrealizedPnl: 4_000,
      openPositionCount: 1,
      returnPercentage: 4,
    }),
  );

  const result =
    context.pipeline.markToMarket({
      candleIndex: 0,
      timestamp: 1_700_000_060_000,
      symbol: "ETHUSDT",
      marketPrice: 3_500,
      reason: "FINAL",
    });

  assert.equal(
    result.equityPoint.reason,
    "FINAL",
  );

  assert.equal(
    context.pipeline.isFinalized(),
    true,
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.marks, 1);
  assert.equal(metrics.finalObservations, 1);
  assert.equal(metrics.candleObservations, 0);
  assert.equal(metrics.currentEquity, 104_000);

  assert.deepEqual(
    context.portfolio.marketPriceUpdates,
    [
      {
        symbol: "ETHUSDT",
        marketPrice: 3_500,
      },
    ],
  );
}

function testOrderingValidation(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.pipeline.markToMarket({
    candleIndex: 1,
    timestamp: 1_700_000_120_000,
    symbol: "BTCUSDT",
    marketPrice: 50_000,
  });

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: 0,
        timestamp: 1_700_000_180_000,
        symbol: "BTCUSDT",
        marketPrice: 50_100,
      });
    },
    /candle order cannot move backwards/,
  );
}

function testTimestampValidation(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_060_000,
  );

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: 0,
        timestamp: 1_700_000_000_000,
        symbol: "BTCUSDT",
        marketPrice: 50_000,
      });
    },
    /time cannot move backwards/,
  );
}

function testMarkRequestValidation(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: 0,
        timestamp: 1_700_000_060_000,
        symbol: "   ",
        marketPrice: 50_000,
      });
    },
    /symbol must be non-empty/,
  );

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: 0,
        timestamp: 1_700_000_060_000,
        symbol: "BTCUSDT",
        marketPrice: 0,
      });
    },
    /price must be a positive finite number/,
  );

  assert.throws(
    () => {
      context.pipeline.markToMarket({
        candleIndex: -1,
        timestamp: 1_700_000_060_000,
        symbol: "BTCUSDT",
        marketPrice: 50_000,
      });
    },
    /candle index must be a non-negative safe integer/,
  );
}

function testInvalidSnapshotRejected(): void {
  const context = createContext();

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: Number.NaN,
    }),
  );

  assert.throws(
    () => {
      context.pipeline.initialize(
        1_700_000_000_000,
      );
    },
    /field "equity" must be finite/,
  );
}

function testReset(): void {
  const context = createContext();

  context.pipeline.initialize(
    1_700_000_000_000,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot({
      equity: 101_000,
      unrealizedPnl: 1_000,
      returnPercentage: 1,
    }),
  );

  context.pipeline.markToMarket({
    candleIndex: 0,
    timestamp: 1_700_000_060_000,
    symbol: "BTCUSDT",
    marketPrice: 50_500,
  });

  context.pipeline.reset();

  assert.equal(
    context.pipeline.isInitialized(),
    false,
  );

  assert.equal(
    context.pipeline.isFinalized(),
    false,
  );

  assert.equal(
    context.pipeline.getPoints().length,
    0,
  );

  assert.equal(
    context.pipeline.getLatestPoint(),
    undefined,
  );

  assert.deepEqual(
    context.pipeline.getMetrics(),
    {
      marks: 0,
      executionObservations: 0,
      candleObservations: 0,
      finalObservations: 0,

      currentEquity: 0,
      peakEquity: 0,
      totalPnl: 0,
      returnRate: 0,

      maximumDrawdownAmount: 0,
      maximumDrawdownRate: 0,
    },
  );

  assert.equal(
    context.session.getMetric(
      "portfolioEquity.marks",
    ),
    0,
  );

  context.portfolio.setSnapshot(
    createPortfolioSnapshot(),
  );

  const newInitialPoint =
    context.pipeline.initialize(
      1_700_000_000_000,
    );

  assert.equal(newInitialPoint.sequence, 1);
}

function runTests(): void {
  testInitialization();
  testDuplicateInitializationRejected();
  testOperationBeforeInitializationRejected();
  testExecutionObservation();
  testCandleMarkToMarket();
  testExecutionAndCandleOnSameIndex();
  testDrawdownPropagation();
  testFinalizeWithoutMark();
  testFinalizeWithFinalMark();
  testOrderingValidation();
  testTimestampValidation();
  testMarkRequestValidation();
  testInvalidSnapshotRejected();
  testReset();

  console.log(
    "All deterministic backtest portfolio equity pipeline tests passed successfully.",
  );
}

runTests();