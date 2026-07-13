import assert from "node:assert/strict";

import {
  DeterministicBacktestRiskPipeline,
  DeterministicBacktestSession,
  DeterministicBacktestSignalPipeline,
  DeterministicBacktestStrategyPipeline,
} from "./backtesting";

import type {
  BacktestRiskEvaluation,
  HistoricalCandle,
} from "./backtesting";

import {
  RiskManager,
} from "./risk";

import type {
  RiskAccount,
} from "./risk";

import {
  DeterministicSignalRuntime,
  SignalEngine,
} from "./signals";

import {
  StrategyRegistry,
} from "./strategies";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
  TradingStrategy,
} from "./strategies";

class AlternatingRiskTestStrategy
  implements TradingStrategy
{
  public readonly definition:
    StrategyDefinition = {
      id: "alternating-risk-test",
      name:
        "Alternating Risk Test Strategy",
      description:
        "Produces HOLD, BUY, SELL, and low-confidence BUY results.",
      minimumCandles: 1,
    };

  public evaluate(
    context: StrategyContext,
  ): StrategyResult {
    const candleCount =
      context.candles.length;

    if (candleCount === 1) {
      return {
        strategyId:
          this.definition.id,
        signal: "HOLD",
        confidence: 0,
        reason:
          "Waiting for an actionable setup.",
        timestamp:
          context.evaluatedAt ??
          Number.NaN,
      };
    }

    if (candleCount === 2) {
      return {
        strategyId:
          this.definition.id,
        signal: "BUY",
        confidence: 0.8,
        reason:
          "Bullish risk test setup.",
        timestamp:
          context.evaluatedAt ??
          Number.NaN,
      };
    }

    if (candleCount === 3) {
      return {
        strategyId:
          this.definition.id,
        signal: "SELL",
        confidence: 0.9,
        reason:
          "Bearish risk test setup.",
        timestamp:
          context.evaluatedAt ??
          Number.NaN,
      };
    }

    return {
      strategyId:
        this.definition.id,
      signal: "BUY",
      confidence: 0.2,
      reason:
        "Low-confidence bullish setup.",
      timestamp:
        context.evaluatedAt ??
        Number.NaN,
    };
  }
}

const configuration = {
  runId: "risk-pipeline-test",
  startingCapital: 10_000,
  baseCurrency: "USD",
};

const account: RiskAccount = {
  balance: 10_000,
  availableEquity: 10_000,
  openRisk: 0,
};

function createCandle(
  openTime: number,
  close: number,
): HistoricalCandle {
  return {
    symbol: "BTCUSDT",
    timeframe: "1m",
    openTime,
    closeTime:
      openTime + 59_999,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  };
}

function createPipelines(): {
  readonly session:
    DeterministicBacktestSession;

  readonly strategyPipeline:
    DeterministicBacktestStrategyPipeline;

  readonly signalPipeline:
    DeterministicBacktestSignalPipeline;

  readonly riskPipeline:
    DeterministicBacktestRiskPipeline;
} {
  const registry =
    new StrategyRegistry();

  registry.register(
    new AlternatingRiskTestStrategy(),
  );

  const strategyPipeline =
    new DeterministicBacktestStrategyPipeline(
      registry,
      {
        strategyId:
          "alternating-risk-test",
      },
    );

  const runtime =
    new DeterministicSignalRuntime({
      initialTimestamp: 0,
      idPrefix:
        "BACKTEST-RISK-SIGNAL",
    });

  const signalEngine =
    new SignalEngine(
      {
        minimumConfidence: 0.5,
        duplicateWindowMs: 60_000,
      },
      runtime,
    );

  const signalPipeline =
    new DeterministicBacktestSignalPipeline(
      signalEngine,
      runtime,
    );

  const riskManager =
    new RiskManager({
      riskPerTrade: 0.01,
      maximumAccountRisk: 0.05,
      maximumLeverage: 3,
      maximumPositionNotional:
        10_000,
      minimumPositionNotional: 5,
      minimumQuantity: 0.001,
      quantityStep: 0.001,
    });

  const riskPipeline =
    new DeterministicBacktestRiskPipeline(
      riskManager,
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      4,
    );

  return {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  };
}

function evaluateCurrentCandle(
  session:
    DeterministicBacktestSession,
  strategyPipeline:
    DeterministicBacktestStrategyPipeline,
  signalPipeline:
    DeterministicBacktestSignalPipeline,
  riskPipeline:
    DeterministicBacktestRiskPipeline,
  stopLossPrice: number,
  leverage = 2,
): BacktestRiskEvaluation {
  const strategyEvaluation =
    strategyPipeline.evaluate(
      session,
    );

  const signalEvaluation =
    signalPipeline.evaluate(
      session,
      strategyEvaluation,
    );

  return riskPipeline.evaluate(
    session,
    signalEvaluation,
    {
      account,
      stopLossPrice,
      leverage,
    },
  );
}

function testHoldSignalSkipped(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const evaluation =
    evaluateCurrentCandle(
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
      95,
    );

  assert.equal(
    evaluation.outcome,
    "SKIPPED",
  );

  if (
    evaluation.outcome !==
    "SKIPPED"
  ) {
    throw new Error(
      "Expected a skipped risk evaluation.",
    );
  }

  assert.equal(
    evaluation.skipReason,
    "SIGNAL_HOLD",
  );

  assert.match(
    evaluation.reason,
    /HOLD/,
  );

  assert.equal(
    evaluation.request,
    undefined,
  );

  assert.equal(
    riskPipeline.getEvaluationCount(),
    1,
  );

  assert.equal(
    riskPipeline.getSkippedCount(),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.evaluations",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.skipped",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.skippedHold",
    ),
    1,
  );
}

function testBuySignalApproved(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  evaluateCurrentCandle(
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
    95,
  );

  session.advance(
    createCandle(120_000, 105),
    1,
  );

  const evaluation =
    evaluateCurrentCandle(
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
      100,
      2,
    );

  assert.equal(
    evaluation.outcome,
    "APPROVED",
  );

  if (
    evaluation.outcome !==
    "APPROVED"
  ) {
    throw new Error(
      "Expected an approved BUY risk evaluation.",
    );
  }

  assert.equal(
    evaluation.trade.side,
    "BUY",
  );

  assert.equal(
    evaluation.trade.signalId,
    "BACKTEST-RISK-SIGNAL-1",
  );

  assert.equal(
    evaluation.trade.entryPrice,
    105,
  );

  assert.equal(
    evaluation.trade.stopLossPrice,
    100,
  );

  assert.equal(
    evaluation.trade.quantity,
    20,
  );

  assert.equal(
    evaluation.trade.riskAmount,
    100,
  );

  assert.equal(
    evaluation.trade.positionNotional,
    2_100,
  );

  assert.equal(
    evaluation.trade.marginRequired,
    1_050,
  );

  assert.equal(
    evaluation.trade.approvedAt,
    179_999,
  );

  assert.equal(
    riskPipeline.getApprovedCount(),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.approved",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.buy",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.totalRiskAmount",
    ),
    100,
  );

  assert.equal(
    session.getRuntimeState(
      "risk.lastSide",
    ),
    "BUY",
  );

  assert.equal(
    session.getRuntimeState(
      "risk.lastApprovedAt",
    ),
    179_999,
  );
}

function testSellSignalApproved(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  evaluateCurrentCandle(
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
    95,
  );

  session.advance(
    createCandle(120_000, 105),
    1,
  );

  evaluateCurrentCandle(
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
    100,
  );

  session.advance(
    createCandle(180_000, 95),
    2,
  );

  const evaluation =
    evaluateCurrentCandle(
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
      100,
      2,
    );

  assert.equal(
    evaluation.outcome,
    "APPROVED",
  );

  if (
    evaluation.outcome !==
    "APPROVED"
  ) {
    throw new Error(
      "Expected an approved SELL risk evaluation.",
    );
  }

  assert.equal(
    evaluation.trade.side,
    "SELL",
  );

  assert.equal(
    evaluation.trade.signalId,
    "BACKTEST-RISK-SIGNAL-2",
  );

  assert.equal(
    evaluation.trade.entryPrice,
    95,
  );

  assert.equal(
    evaluation.trade.stopLossPrice,
    100,
  );

  assert.equal(
    evaluation.trade.quantity,
    20,
  );

  assert.equal(
    evaluation.trade.riskAmount,
    100,
  );

  assert.equal(
    evaluation.trade.positionNotional,
    1_900,
  );

  assert.equal(
    evaluation.trade.marginRequired,
    950,
  );

  assert.equal(
    evaluation.trade.approvedAt,
    239_999,
  );

  assert.equal(
    riskPipeline.getApprovedCount(),
    2,
  );

  assert.equal(
    session.getMetric(
      "risk.sell",
    ),
    1,
  );
}

function testRiskManagerRejection(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  evaluateCurrentCandle(
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
    95,
  );

  session.advance(
    createCandle(120_000, 105),
    1,
  );

  const evaluation =
    evaluateCurrentCandle(
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
      110,
      2,
    );

  assert.equal(
    evaluation.outcome,
    "REJECTED",
  );

  if (
    evaluation.outcome !==
    "REJECTED"
  ) {
    throw new Error(
      "Expected a rejected BUY risk evaluation.",
    );
  }

  assert.equal(
    evaluation.decision.approved,
    false,
  );

  assert.match(
    evaluation.reason,
    /stop-loss/i,
  );

  assert.equal(
    evaluation.trade,
    undefined,
  );

  assert.equal(
    riskPipeline.getRejectedCount(),
    1,
  );

  assert.equal(
    session.getMetric(
      "risk.rejected",
    ),
    1,
  );

  assert.equal(
    session.getRuntimeState(
      "risk.lastOutcome",
    ),
    "REJECTED",
  );
}

function testRejectedSignalSkipped(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  const closes = [
    100,
    105,
    95,
    101,
  ];

  const stops = [
    95,
    100,
    100,
    96,
  ];

  let finalEvaluation:
    BacktestRiskEvaluation | undefined;

  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const close =
      closes[index];

    const stopLossPrice =
      stops[index];

    if (
      close === undefined ||
      stopLossPrice === undefined
    ) {
      throw new Error(
        "Risk test candle data is incomplete.",
      );
    }

    const openTime =
      60_000 +
      index * 60_000;

    session.advance(
      createCandle(
        openTime,
        close,
      ),
      index,
    );

    finalEvaluation =
      evaluateCurrentCandle(
        session,
        strategyPipeline,
        signalPipeline,
        riskPipeline,
        stopLossPrice,
      );
  }

  if (
    finalEvaluation === undefined
  ) {
    throw new Error(
      "Expected a final risk evaluation.",
    );
  }

  assert.equal(
    finalEvaluation.outcome,
    "SKIPPED",
  );

  if (
    finalEvaluation.outcome !==
    "SKIPPED"
  ) {
    throw new Error(
      "Expected the rejected signal to be skipped.",
    );
  }

  assert.equal(
    finalEvaluation.skipReason,
    "SIGNAL_REJECTED",
  );

  assert.equal(
    riskPipeline.getSkippedCount(),
    2,
  );

  assert.equal(
    session.getMetric(
      "risk.skippedRejectedSignal",
    ),
    1,
  );
}

function testRiskMetricsSnapshot(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  const closes = [
    100,
    105,
    95,
  ];

  const stops = [
    95,
    100,
    100,
  ];

  closes.forEach(
    (close, index) => {
      session.advance(
        createCandle(
          60_000 +
            index * 60_000,
          close,
        ),
        index,
      );

      evaluateCurrentCandle(
        session,
        strategyPipeline,
        signalPipeline,
        riskPipeline,
        stops[index],
      );
    },
  );

  assert.deepEqual(
    riskPipeline.getMetrics(),
    {
      evaluations: 3,
      approved: 2,
      rejected: 0,
      skipped: 1,
      skippedRejectedSignal: 0,
      skippedHold: 1,
      approvedBuy: 1,
      approvedSell: 1,
      totalApprovedRiskAmount:
        200,
      totalApprovedMargin:
        2_000,
      totalApprovedNotional:
        4_000,
    },
  );
}

function testSessionEvents(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  evaluateCurrentCandle(
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
    95,
  );

  session.advance(
    createCandle(120_000, 105),
    1,
  );

  evaluateCurrentCandle(
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
    100,
  );

  const riskEvents =
    session
      .getEvents()
      .filter(
        (event) =>
          event.type.startsWith(
            "RISK_",
          ),
      );

  assert.deepEqual(
    riskEvents.map(
      (event) => event.type,
    ),
    [
      "RISK_SKIPPED",
      "RISK_APPROVED",
    ],
  );

  assert.equal(
    riskEvents[0].payload
      .skipReason,
    "SIGNAL_HOLD",
  );

  assert.equal(
    riskEvents[1].payload
      .signalId,
    "BACKTEST-RISK-SIGNAL-1",
  );

  assert.equal(
    riskEvents[1].payload.side,
    "BUY",
  );

  assert.equal(
    riskEvents[1].simulationTime,
    179_999,
  );
}

function testDuplicateEvaluationRejected(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const strategyEvaluation =
    strategyPipeline.evaluate(
      session,
    );

  const signalEvaluation =
    signalPipeline.evaluate(
      session,
      strategyEvaluation,
    );

  riskPipeline.evaluate(
    session,
    signalEvaluation,
    {
      account,
      stopLossPrice: 95,
      leverage: 2,
    },
  );

  assert.throws(
    () =>
      riskPipeline.evaluate(
        session,
        signalEvaluation,
        {
          account,
          stopLossPrice: 95,
          leverage: 2,
        },
      ),
    /evaluations must be sequential/,
  );
}

function testMismatchedEvaluationRejected(): void {
  const {
    session,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  assert.throws(
    () =>
      riskPipeline.evaluate(
        session,
        {
          candleIndex: 1,
          evaluatedAt: 119_999,
          strategyId:
            "alternating-risk-test",
          strategySignal: "HOLD",
          accepted: false,
          reason:
            "Rejected HOLD signal.",
        },
        {
          account,
          stopLossPrice: 95,
          leverage: 2,
        },
      ),
    /index must match/,
  );
}

function testInvalidParametersRejected(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const strategyEvaluation =
    strategyPipeline.evaluate(
      session,
    );

  const signalEvaluation =
    signalPipeline.evaluate(
      session,
      strategyEvaluation,
    );

  assert.throws(
    () =>
      riskPipeline.evaluate(
        session,
        signalEvaluation,
        {
          account,
          stopLossPrice:
            Number.NaN,
          leverage: 2,
        },
      ),
    /stop-loss price must be a positive finite number/,
  );
}

function testResetReproducibility(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
    riskPipeline,
  } = createPipelines();

  function runTwoCandles():
    BacktestRiskEvaluation {
    session.advance(
      createCandle(60_000, 100),
      0,
    );

    evaluateCurrentCandle(
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
      95,
    );

    session.advance(
      createCandle(120_000, 105),
      1,
    );

    return evaluateCurrentCandle(
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
      100,
    );
  }

  const firstEvaluation =
    runTwoCandles();

  assert.equal(
    firstEvaluation.outcome,
    "APPROVED",
  );

  session.reset();
  strategyPipeline.reset();
  signalPipeline.reset();
  riskPipeline.reset();

  const secondEvaluation =
    runTwoCandles();

  assert.deepEqual(
    secondEvaluation,
    firstEvaluation,
  );

  assert.equal(
    riskPipeline.getEvaluationCount(),
    2,
  );

  assert.equal(
    riskPipeline.getApprovedCount(),
    1,
  );

  assert.equal(
    riskPipeline.getSkippedCount(),
    1,
  );
}

function testIdenticalRunsProduceIdenticalResults(): void {
  function runSimulation():
    readonly BacktestRiskEvaluation[] {
    const {
      session,
      strategyPipeline,
      signalPipeline,
      riskPipeline,
    } = createPipelines();

    const closes = [
      100,
      105,
      95,
      101,
    ];

    const stops = [
      95,
      100,
      100,
      96,
    ];

    return closes.map(
      (close, index) => {
        session.advance(
          createCandle(
            60_000 +
              index * 60_000,
            close,
          ),
          index,
        );

        return evaluateCurrentCandle(
          session,
          strategyPipeline,
          signalPipeline,
          riskPipeline,
          stops[index],
        );
      },
    );
  }

  assert.deepEqual(
    runSimulation(),
    runSimulation(),
  );
}

function run(): void {
  testHoldSignalSkipped();
  testBuySignalApproved();
  testSellSignalApproved();
  testRiskManagerRejection();
  testRejectedSignalSkipped();
  testRiskMetricsSnapshot();
  testSessionEvents();
  testDuplicateEvaluationRejected();
  testMismatchedEvaluationRejected();
  testInvalidParametersRejected();
  testResetReproducibility();
  testIdenticalRunsProduceIdenticalResults();

  console.log(
    "All backtest risk pipeline tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Backtest risk pipeline tests failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}