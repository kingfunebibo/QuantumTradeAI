import assert from "node:assert/strict";

import {
  DeterministicExecutionRuntime,
  type ExecutionReport,
  type ExecutionRequest,
} from "./execution";

import {
  DeterministicPositionRuntime,
  type PortfolioSnapshot,
  type PositionUpdate,
} from "./portfolio";

import {
  BacktestExecutionPipeline,
  type BacktestPortfolioProcessor,
  type ExecutionEvaluator,
} from "./backtesting/execution";

import type {
  BacktestRiskEvaluation,
} from "./backtesting/risk";

import {
  DeterministicBacktestSession,
} from "./backtesting/session";

function createApprovedRiskEvaluation(
  candleIndex: number,
  evaluatedAt: number,
  side: "BUY" | "SELL" = "BUY",
): BacktestRiskEvaluation {
  return {
    outcome: "APPROVED",
    candleIndex,
    evaluatedAt,
    strategyId: "ema-crossover",
    strategySignal: {
      id: `SIGNAL-${candleIndex}`,
      strategyId: "ema-crossover",
      symbol: "BTCUSDT",
      timeframe: "1m",
      action: side,
      confidence: 0.9,
      reason: "Deterministic test signal",
      price: 50_000,
      metadata: {},
    },
    trade: {
      signalId: `SIGNAL-${candleIndex}`,
      strategyId: "ema-crossover",
      symbol: "BTCUSDT",
      side,
      quantity: 0.01,
      approvedPrice: 50_000,
      approvedAt: evaluatedAt,
      metadata: {},
    },
    reason: "Trade approved.",
  } as unknown as BacktestRiskEvaluation;
}

function createRejectedRiskEvaluation(
  candleIndex: number,
  evaluatedAt: number,
): BacktestRiskEvaluation {
  return {
    outcome: "REJECTED",
    candleIndex,
    evaluatedAt,
    strategyId: "ema-crossover",
    strategySignal: {
      id: `SIGNAL-${candleIndex}`,
      strategyId: "ema-crossover",
      symbol: "BTCUSDT",
      timeframe: "1m",
      action: "BUY",
      confidence: 0.9,
      reason: "Deterministic test signal",
      price: 50_000,
      metadata: {},
    },
    reason: "Risk limit exceeded.",
  } as unknown as BacktestRiskEvaluation;
}

function createSkippedRiskEvaluation(
  candleIndex: number,
  evaluatedAt: number,
): BacktestRiskEvaluation {
  return {
    outcome: "SKIPPED",
    candleIndex,
    evaluatedAt,
    strategyId: "ema-crossover",
    strategySignal: {
      id: `SIGNAL-${candleIndex}`,
      strategyId: "ema-crossover",
      symbol: "BTCUSDT",
      timeframe: "1m",
      action: "HOLD",
      confidence: 0.4,
      reason: "No actionable opportunity",
      price: 50_000,
      metadata: {},
    },
    reason: "Risk evaluation not required.",
  } as unknown as BacktestRiskEvaluation;
}

class DeterministicExecutionEvaluator
  implements ExecutionEvaluator
{
  public executionCount = 0;
  public clearCount = 0;

  public executeMarketOrder(
    request: ExecutionRequest & {
      readonly marketPrice: number;
    },
  ): ExecutionReport {
    this.executionCount += 1;

    const side =
      request.trade.side as "BUY" | "SELL";

    const quantity =
      request.trade.quantity;

    const fillPrice =
      request.marketPrice;

    const grossNotional =
      quantity * fillPrice;

    const report = {
      accepted: true,
      reason: "Market order filled.",
      order: {
        id: `BACKTEST-ORDER-${this.executionCount}`,
        signalId: request.trade.signalId,
        strategyId: request.trade.strategyId,
        symbol: request.trade.symbol,
        side,
        type: "MARKET",
        quantity,
        requestedPrice: request.marketPrice,
        status: "FILLED",
        createdAt: request.trade.approvedAt,
        metadata: {},
      },
      fill: {
        id: `BACKTEST-FILL-${this.executionCount}`,
        orderId: `BACKTEST-ORDER-${this.executionCount}`,
        signalId: request.trade.signalId,
        strategyId: request.trade.strategyId,
        symbol: request.trade.symbol,
        side,
        quantity,
        marketPrice: request.marketPrice,
        fillPrice,
        grossNotional,
        fee: grossNotional * 0.001,
        slippageRate: 0,
        slippageAmount: 0,
        filledAt: request.trade.approvedAt,
        metadata: {},
      },
    };

    return report as unknown as ExecutionReport;
  }

  public clear(): void {
    this.executionCount = 0;
    this.clearCount += 1;
  }
}

class DeterministicPortfolioProcessor
  implements BacktestPortfolioProcessor
{
  public processCount = 0;
  public clearCount = 0;

  private snapshot = {
    startingCapital: 100_000,
    cashBalance: 100_000,
    equity: 100_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalFees: 0,
    positions: [],
    closedTrades: [],
  } as unknown as PortfolioSnapshot;

  public processExecution(
    report: ExecutionReport & {
      readonly accepted: true;
      readonly fill: NonNullable<ExecutionReport["fill"]>;
    },
  ): PositionUpdate {
    this.processCount += 1;

    const fill = report.fill;

    this.snapshot = {
      startingCapital: 100_000,
      cashBalance:
        100_000 -
        fill.grossNotional -
        fill.fee,
      equity: 100_000 - fill.fee,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalFees: fill.fee,
      positions: [
        {
          id: "BACKTEST-POSITION-1",
          symbol: fill.symbol,
          side: fill.side === "BUY" ? "LONG" : "SHORT",
          quantity: fill.quantity,
          averageEntryPrice: fill.fillPrice,
          openedAt: fill.filledAt,
          updatedAt: fill.filledAt,
          metadata: {},
        },
      ],
      closedTrades: [],
    } as unknown as PortfolioSnapshot;

    return {
      action: "OPENED",
      grossRealizedPnl: 0,
      fee: fill.fee,
      position: {
        id: "BACKTEST-POSITION-1",
        symbol: fill.symbol,
        side: fill.side === "BUY" ? "LONG" : "SHORT",
        quantity: fill.quantity,
        averageEntryPrice: fill.fillPrice,
        openedAt: fill.filledAt,
        updatedAt: fill.filledAt,
        metadata: {},
      },
    } as unknown as PositionUpdate;
  }

  public getSnapshot(): PortfolioSnapshot {
    return this.snapshot;
  }

  public clear(): void {
    this.processCount = 0;
    this.clearCount += 1;

    this.snapshot = {
      startingCapital: 100_000,
      cashBalance: 100_000,
      equity: 100_000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalFees: 0,
      positions: [],
      closedTrades: [],
    } as unknown as PortfolioSnapshot;
  }
}

function createTestContext() {
  const executionRuntime =
    new DeterministicExecutionRuntime({
      initialTimestamp: 0,
      orderIdPrefix: "BACKTEST-ORDER",
      fillIdPrefix: "BACKTEST-FILL",
    });

  const positionRuntime =
    new DeterministicPositionRuntime({
      initialTimestamp: 0,
      positionIdPrefix: "BACKTEST-POSITION",
      closedTradeIdPrefix:
        "BACKTEST-CLOSED-TRADE",
    });

  const executionEngine =
    new DeterministicExecutionEvaluator();

  const portfolioManager =
    new DeterministicPortfolioProcessor();

  const session =
    new DeterministicBacktestSession(
      {
        runId: "MILESTONE-7-TEST",
        startingCapital: 100_000,
        baseCurrency: "USDT",
      },
      10,
    );

  const pipeline =
    new BacktestExecutionPipeline(
      executionEngine,
      portfolioManager,
      executionRuntime,
      positionRuntime,
      session,
    );

  return {
    executionRuntime,
    positionRuntime,
    executionEngine,
    portfolioManager,
    session,
    pipeline,
  };
}

function testApprovedExecution(): void {
  const context = createTestContext();

  const evaluatedAt = 1_700_000_000_000;

  const result = context.pipeline.evaluate(
    createApprovedRiskEvaluation(
      0,
      evaluatedAt,
    ),
    {
      marketPrice: 50_100,
    },
  );

  assert.equal(result.outcome, "EXECUTED");

  if (result.outcome !== "EXECUTED") {
    throw new Error(
      "Expected an executed evaluation.",
    );
  }

  assert.equal(
    context.executionEngine.executionCount,
    1,
  );

  assert.equal(
    context.portfolioManager.processCount,
    1,
  );

  assert.equal(
    context.executionRuntime.now(),
    evaluatedAt,
  );

  assert.equal(
    context.positionRuntime.now(),
    evaluatedAt,
  );

  assert.equal(
    result.report.fill.symbol,
    "BTCUSDT",
  );

  assert.equal(
    result.report.fill.side,
    "BUY",
  );

  assert.equal(
    result.report.fill.fillPrice,
    50_100,
  );

  assert.equal(
    result.positionUpdate.action,
    "OPENED",
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.evaluations, 1);
  assert.equal(metrics.executed, 1);
  assert.equal(metrics.rejected, 0);
  assert.equal(metrics.skipped, 0);
  assert.equal(metrics.buyExecutions, 1);
  assert.equal(metrics.sellExecutions, 0);
  assert.equal(metrics.openedPositions, 1);
  assert.equal(metrics.totalFilledQuantity, 0.01);
  assert.equal(metrics.totalGrossNotional, 501);
  assert.equal(metrics.totalFees, 0.501);

  const events =
    context.session.getEvents();

  assert.equal(events.length, 1);
  assert.equal(
    events[0]?.type,
    "execution.executed",
  );

  assert.equal(
    context.session.getMetric(
      "execution.executed",
    ),
    1,
  );
}

function testRejectedRiskIsSkipped(): void {
  const context = createTestContext();

  const evaluatedAt = 1_700_000_060_000;

  const result = context.pipeline.evaluate(
    createRejectedRiskEvaluation(
      0,
      evaluatedAt,
    ),
    {
      marketPrice: 50_000,
    },
  );

  assert.equal(result.outcome, "SKIPPED");

  if (result.outcome !== "SKIPPED") {
    throw new Error(
      "Expected a skipped evaluation.",
    );
  }

  assert.equal(
    result.skipReason,
    "RISK_REJECTED",
  );

  assert.equal(
    context.executionEngine.executionCount,
    0,
  );

  assert.equal(
    context.portfolioManager.processCount,
    0,
  );

  assert.equal(
    context.executionRuntime.now(),
    evaluatedAt,
  );

  assert.equal(
    context.positionRuntime.now(),
    evaluatedAt,
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.evaluations, 1);
  assert.equal(metrics.executed, 0);
  assert.equal(metrics.skipped, 1);
  assert.equal(
    metrics.skippedRiskRejected,
    1,
  );

  const events =
    context.session.getEvents();

  assert.equal(events.length, 1);
  assert.equal(
    events[0]?.type,
    "execution.skipped",
  );
}

function testSkippedRiskIsSkipped(): void {
  const context = createTestContext();

  const result = context.pipeline.evaluate(
    createSkippedRiskEvaluation(
      0,
      1_700_000_120_000,
    ),
    {
      marketPrice: 50_000,
    },
  );

  assert.equal(result.outcome, "SKIPPED");

  if (result.outcome !== "SKIPPED") {
    throw new Error(
      "Expected a skipped evaluation.",
    );
  }

  assert.equal(
    result.skipReason,
    "RISK_SKIPPED",
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.evaluations, 1);
  assert.equal(metrics.skipped, 1);
  assert.equal(
    metrics.skippedRiskSkipped,
    1,
  );

  assert.equal(
    context.executionEngine.executionCount,
    0,
  );

  assert.equal(
    context.portfolioManager.processCount,
    0,
  );
}

function testStrictCandleOrdering(): void {
  const context = createTestContext();

  context.pipeline.evaluate(
    createApprovedRiskEvaluation(
      0,
      1_700_000_000_000,
    ),
    {
      marketPrice: 50_000,
    },
  );

  assert.throws(
    () => {
      context.pipeline.evaluate(
        createApprovedRiskEvaluation(
          0,
          1_700_000_060_000,
        ),
        {
          marketPrice: 50_100,
        },
      );
    },
    /strictly increasing candle order/,
  );
}

function testTimeCannotMoveBackwards(): void {
  const context = createTestContext();

  context.pipeline.evaluate(
    createApprovedRiskEvaluation(
      0,
      1_700_000_060_000,
    ),
    {
      marketPrice: 50_000,
    },
  );

  assert.throws(
    () => {
      context.pipeline.evaluate(
        createApprovedRiskEvaluation(
          1,
          1_700_000_000_000,
        ),
        {
          marketPrice: 50_100,
        },
      );
    },
    /cannot move backwards/,
  );
}

function testInvalidMarketPrice(): void {
  const context = createTestContext();

  assert.throws(
    () => {
      context.pipeline.evaluate(
        createApprovedRiskEvaluation(
          0,
          1_700_000_000_000,
        ),
        {
          marketPrice: 0,
        },
      );
    },
    /market price must be a positive finite number/,
  );

  assert.throws(
    () => {
      context.pipeline.evaluate(
        createApprovedRiskEvaluation(
          0,
          1_700_000_000_000,
        ),
        {
          marketPrice: Number.NaN,
        },
      );
    },
    /market price must be a positive finite number/,
  );
}

function testEvaluationHistory(): void {
  const context = createTestContext();

  context.pipeline.evaluate(
    createApprovedRiskEvaluation(
      0,
      1_700_000_000_000,
    ),
    {
      marketPrice: 50_000,
    },
  );

  context.pipeline.evaluate(
    createRejectedRiskEvaluation(
      1,
      1_700_000_060_000,
    ),
    {
      marketPrice: 50_100,
    },
  );

  context.pipeline.evaluate(
    createSkippedRiskEvaluation(
      2,
      1_700_000_120_000,
    ),
    {
      marketPrice: 50_200,
    },
  );

  const evaluations =
    context.pipeline.getEvaluations();

  assert.equal(evaluations.length, 3);

  assert.equal(
    evaluations[0]?.outcome,
    "EXECUTED",
  );

  assert.equal(
    evaluations[1]?.outcome,
    "SKIPPED",
  );

  assert.equal(
    evaluations[2]?.outcome,
    "SKIPPED",
  );

  assert.equal(
    context.pipeline.getLatestEvaluation()
      ?.candleIndex,
    2,
  );

  const metrics =
    context.pipeline.getMetrics();

  assert.equal(metrics.evaluations, 3);
  assert.equal(metrics.executed, 1);
  assert.equal(metrics.skipped, 2);
  assert.equal(
    metrics.skippedRiskRejected,
    1,
  );
  assert.equal(
    metrics.skippedRiskSkipped,
    1,
  );
}

function testReset(): void {
  const context = createTestContext();

  context.pipeline.evaluate(
    createApprovedRiskEvaluation(
      0,
      1_700_000_000_000,
    ),
    {
      marketPrice: 50_000,
    },
  );

  context.pipeline.reset();

  assert.equal(
    context.pipeline.getEvaluations().length,
    0,
  );

  assert.equal(
    context.pipeline.getLatestEvaluation(),
    undefined,
  );

  assert.deepEqual(
    context.pipeline.getMetrics(),
    {
      evaluations: 0,
      executed: 0,
      rejected: 0,
      skipped: 0,
      skippedRiskRejected: 0,
      skippedRiskSkipped: 0,
      buyExecutions: 0,
      sellExecutions: 0,
      openedPositions: 0,
      increasedPositions: 0,
      reducedPositions: 0,
      closedPositions: 0,
      reversedPositions: 0,
      totalFilledQuantity: 0,
      totalGrossNotional: 0,
      totalFees: 0,
      totalSlippageAmount: 0,
      totalGrossRealizedPnl: 0,
    },
  );

  assert.equal(
    context.executionRuntime.now(),
    0,
  );

  assert.equal(
    context.positionRuntime.now(),
    0,
  );

  assert.equal(
    context.executionEngine.executionCount,
    0,
  );

  assert.equal(
    context.portfolioManager.processCount,
    0,
  );

  context.pipeline.evaluate(
    createApprovedRiskEvaluation(
      0,
      1_700_000_000_000,
    ),
    {
      marketPrice: 50_000,
    },
  );

  assert.equal(
    context.pipeline.getMetrics().executed,
    1,
  );
}

function runTests(): void {
  testApprovedExecution();
  testRejectedRiskIsSkipped();
  testSkippedRiskIsSkipped();
  testStrictCandleOrdering();
  testTimeCannotMoveBackwards();
  testInvalidMarketPrice();
  testEvaluationHistory();
  testReset();

  console.log(
    "All deterministic backtest execution pipeline tests passed successfully.",
  );
}

runTests();