import assert from "node:assert/strict";

import {
  DeterministicBacktestSession,
  DeterministicBacktestSignalPipeline,
  DeterministicBacktestStrategyPipeline,
  HistoricalCandle,
} from "./backtesting";

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

class AlternatingTestStrategy
  implements TradingStrategy
{
  public readonly definition:
    StrategyDefinition = {
      id: "alternating-test",
      name: "Alternating Test Strategy",
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
        strategyId: this.definition.id,
        signal: "HOLD",
        confidence: 0,
        reason: "Waiting for an actionable setup.",
        timestamp:
          context.evaluatedAt ??
          Number.NaN,
      };
    }

    if (candleCount === 2) {
      return {
        strategyId: this.definition.id,
        signal: "BUY",
        confidence: 0.8,
        reason: "Bullish test setup.",
        timestamp:
          context.evaluatedAt ??
          Number.NaN,
      };
    }

    if (candleCount === 3) {
      return {
        strategyId: this.definition.id,
        signal: "SELL",
        confidence: 0.9,
        reason: "Bearish test setup.",
        timestamp:
          context.evaluatedAt ??
          Number.NaN,
      };
    }

    return {
      strategyId: this.definition.id,
      signal: "BUY",
      confidence: 0.2,
      reason: "Low-confidence bullish setup.",
      timestamp:
        context.evaluatedAt ??
        Number.NaN,
    };
  }
}

const configuration = {
  runId: "signal-pipeline-test",
  startingCapital: 10_000,
  baseCurrency: "USD",
};

function createCandle(
  openTime: number,
  close: number,
): HistoricalCandle {
  return {
    symbol: "BTCUSDT",
    timeframe: "1m",
    openTime,
    closeTime: openTime + 59_999,
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
  readonly runtime:
    DeterministicSignalRuntime;
} {
  const registry =
    new StrategyRegistry();

  registry.register(
    new AlternatingTestStrategy(),
  );

  const strategyPipeline =
    new DeterministicBacktestStrategyPipeline(
      registry,
      {
        strategyId: "alternating-test",
      },
    );

  const runtime =
    new DeterministicSignalRuntime({
      initialTimestamp: 0,
      idPrefix: "BACKTEST-SIGNAL",
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

  const session =
    new DeterministicBacktestSession(
      configuration,
      4,
    );

  return {
    session,
    strategyPipeline,
    signalPipeline,
    runtime,
  };
}

function testHoldRejection(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const strategyEvaluation =
    strategyPipeline.evaluate(session);

  const signalEvaluation =
    signalPipeline.evaluate(
      session,
      strategyEvaluation,
    );

  assert.equal(
    signalEvaluation.accepted,
    false,
  );

  assert.equal(
    signalEvaluation.strategySignal,
    "HOLD",
  );

  assert.match(
    signalEvaluation.reason,
    /HOLD strategy results/,
  );

  assert.equal(
    signalEvaluation.signal,
    undefined,
  );

  assert.equal(
    session.getMetric(
      "signal.evaluations",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "signal.rejected",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "signal.rejectedHold",
    ),
    1,
  );
}

function testAcceptedBuyAndSellSignals(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  signalPipeline.evaluate(
    session,
    strategyPipeline.evaluate(session),
  );

  session.advance(
    createCandle(120_000, 105),
    1,
  );

  const buyEvaluation =
    signalPipeline.evaluate(
      session,
      strategyPipeline.evaluate(session),
    );

  assert.equal(
    buyEvaluation.accepted,
    true,
  );

  assert.equal(
    buyEvaluation.signal?.id,
    "BACKTEST-SIGNAL-1",
  );

  assert.equal(
    buyEvaluation.signal?.action,
    "BUY",
  );

  assert.equal(
    buyEvaluation.signal?.price,
    105,
  );

  assert.equal(
    buyEvaluation.signal?.candleTimestamp,
    120_000,
  );

  assert.equal(
    buyEvaluation.signal?.generatedAt,
    179_999,
  );

  session.advance(
    createCandle(180_000, 95),
    2,
  );

  const sellEvaluation =
    signalPipeline.evaluate(
      session,
      strategyPipeline.evaluate(session),
    );

  assert.equal(
    sellEvaluation.accepted,
    true,
  );

  assert.equal(
    sellEvaluation.signal?.id,
    "BACKTEST-SIGNAL-2",
  );

  assert.equal(
    sellEvaluation.signal?.action,
    "SELL",
  );

  assert.equal(
    sellEvaluation.signal?.generatedAt,
    239_999,
  );

  assert.equal(
    signalPipeline.getEvaluationCount(),
    3,
  );

  assert.equal(
    signalPipeline.getAcceptedCount(),
    2,
  );

  assert.equal(
    signalPipeline.getRejectedCount(),
    1,
  );

  assert.equal(
    session.getMetric(
      "signal.accepted",
    ),
    2,
  );

  assert.equal(
    session.getMetric(
      "signal.buy",
    ),
    1,
  );

  assert.equal(
    session.getMetric(
      "signal.sell",
    ),
    1,
  );

  assert.equal(
    session.getRuntimeState(
      "signal.lastId",
    ),
    "BACKTEST-SIGNAL-2",
  );

  assert.equal(
    session.getRuntimeState(
      "signal.lastAction",
    ),
    "SELL",
  );
}

function testLowConfidenceRejection(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
  } = createPipelines();

  const closes = [
    100,
    105,
    95,
    101,
  ];

  closes.forEach((close, index) => {
    const openTime =
      60_000 + index * 60_000;

    session.advance(
      createCandle(openTime, close),
      index,
    );

    signalPipeline.evaluate(
      session,
      strategyPipeline.evaluate(session),
    );
  });

  const lastDecision =
    signalPipeline.getLastDecision();

  assert.equal(
    lastDecision?.accepted,
    false,
  );

  assert.match(
    lastDecision?.reason ?? "",
    /below the minimum threshold/,
  );

  assert.equal(
    signalPipeline.getAcceptedCount(),
    2,
  );

  assert.equal(
    signalPipeline.getRejectedCount(),
    2,
  );

  assert.equal(
    session.getMetric(
      "signal.rejectedActionable",
    ),
    1,
  );
}

function testSessionEvents(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  signalPipeline.evaluate(
    session,
    strategyPipeline.evaluate(session),
  );

  session.advance(
    createCandle(120_000, 105),
    1,
  );

  signalPipeline.evaluate(
    session,
    strategyPipeline.evaluate(session),
  );

  const events =
    session.getEvents();

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "STRATEGY_EVALUATED",
      "SIGNAL_REJECTED",
      "STRATEGY_EVALUATED",
      "SIGNAL_ACCEPTED",
    ],
  );

  const acceptedEvent =
    events[3];

  assert.equal(
    acceptedEvent.payload.signalId,
    "BACKTEST-SIGNAL-1",
  );

  assert.equal(
    acceptedEvent.payload.action,
    "BUY",
  );

  assert.equal(
    acceptedEvent.simulationTime,
    179_999,
  );
}

function testDuplicateEvaluationRejected(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const strategyEvaluation =
    strategyPipeline.evaluate(session);

  signalPipeline.evaluate(
    session,
    strategyEvaluation,
  );

  assert.throws(
    () =>
      signalPipeline.evaluate(
        session,
        strategyEvaluation,
      ),
    /evaluations must be sequential/,
  );
}

function testMismatchedEvaluationRejected(): void {
  const {
    session,
    signalPipeline,
  } = createPipelines();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  assert.throws(
    () =>
      signalPipeline.evaluate(
        session,
        {
          strategyId:
            "alternating-test",
          candleIndex: 1,
          evaluatedAt: 119_999,
          historyLength: 1,
          result: {
            strategyId:
              "alternating-test",
            signal: "HOLD",
            confidence: 0,
            reason: "Test.",
            timestamp: 119_999,
          },
        },
      ),
    /index must match/,
  );
}

function testResetReproducibility(): void {
  const {
    session,
    strategyPipeline,
    signalPipeline,
  } = createPipelines();

  function runTwoCandles(): string {
    session.advance(
      createCandle(60_000, 100),
      0,
    );

    signalPipeline.evaluate(
      session,
      strategyPipeline.evaluate(session),
    );

    session.advance(
      createCandle(120_000, 105),
      1,
    );

    const evaluation =
      signalPipeline.evaluate(
        session,
        strategyPipeline.evaluate(session),
      );

    const signalId =
      evaluation.signal?.id;

    if (signalId === undefined) {
      throw new Error(
        "Expected an accepted BUY signal.",
      );
    }

    return signalId;
  }

  const firstSignalId =
    runTwoCandles();

  assert.equal(
    firstSignalId,
    "BACKTEST-SIGNAL-1",
  );

  session.reset();
  strategyPipeline.reset();
  signalPipeline.reset();

  const secondSignalId =
    runTwoCandles();

  assert.equal(
    secondSignalId,
    "BACKTEST-SIGNAL-1",
  );
}

function testIdenticalRunsProduceIdenticalResults(): void {
  function runSimulation() {
    const {
      session,
      strategyPipeline,
      signalPipeline,
    } = createPipelines();

    const closes = [
      100,
      105,
      95,
      101,
    ];

    return closes.map((close, index) => {
      const openTime =
        60_000 + index * 60_000;

      session.advance(
        createCandle(
          openTime,
          close,
        ),
        index,
      );

      return signalPipeline.evaluate(
        session,
        strategyPipeline.evaluate(session),
      );
    });
  }

  assert.deepEqual(
    runSimulation(),
    runSimulation(),
  );
}

function run(): void {
  testHoldRejection();
  testAcceptedBuyAndSellSignals();
  testLowConfidenceRejection();
  testSessionEvents();
  testDuplicateEvaluationRejected();
  testMismatchedEvaluationRejected();
  testResetReproducibility();
  testIdenticalRunsProduceIdenticalResults();

  console.log(
    "All backtest signal pipeline tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Backtest signal pipeline tests failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}