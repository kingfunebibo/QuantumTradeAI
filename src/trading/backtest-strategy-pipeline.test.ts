import assert from "node:assert/strict";

import {
  DeterministicBacktestSession,
  DeterministicBacktestStrategyPipeline,
  HistoricalCandle,
} from "./backtesting";

import {
  EmaCrossoverStrategy,
  StrategyRegistry,
  TradingStrategy,
} from "./strategies";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
} from "./strategies";

class DeterministicTestStrategy
  implements TradingStrategy
{
  public readonly definition:
    StrategyDefinition = {
      id: "deterministic-test",
      name: "Deterministic Test Strategy",
      description:
        "Returns BUY after two candles.",
      minimumCandles: 2,
    };

  public evaluate(
    context: StrategyContext,
  ): StrategyResult {
    const signal =
      context.candles.length >= 2
        ? "BUY"
        : "HOLD";

    return {
      strategyId: this.definition.id,
      signal,
      confidence:
        signal === "BUY" ? 0.75 : 0,
      reason:
        signal === "BUY"
          ? "Two candles are available."
          : "Waiting for more candles.",
      timestamp:
        context.evaluatedAt ??
        Number.NaN,
      metadata: {
        historyLength:
          context.candles.length,
      },
    };
  }
}

const configuration = {
  runId: "strategy-pipeline-test",
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

function createRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();

  registry.register(
    new DeterministicTestStrategy(),
  );

  return registry;
}

function testDeterministicEvaluation(): void {
  const registry = createRegistry();

  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      registry,
      {
        strategyId: "deterministic-test",
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      3,
    );

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const first =
    pipeline.evaluate(session);

  assert.equal(first.candleIndex, 0);
  assert.equal(first.evaluatedAt, 119_999);
  assert.equal(first.historyLength, 1);
  assert.equal(first.result.signal, "HOLD");
  assert.equal(
    first.result.timestamp,
    119_999,
  );

  session.advance(
    createCandle(120_000, 101),
    1,
  );

  const second =
    pipeline.evaluate(session);

  assert.equal(second.candleIndex, 1);
  assert.equal(second.evaluatedAt, 179_999);
  assert.equal(second.historyLength, 2);
  assert.equal(second.result.signal, "BUY");
  assert.equal(
    second.result.confidence,
    0.75,
  );

  assert.equal(
    pipeline.getEvaluationCount(),
    2,
  );

  assert.deepEqual(
    pipeline
      .getHistory()
      .map((candle) => candle.timestamp),
    [60_000, 120_000],
  );
}

function testSessionUpdates(): void {
  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      createRegistry(),
      {
        strategyId: "deterministic-test",
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      2,
    );

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  pipeline.evaluate(session);

  session.advance(
    createCandle(120_000, 101),
    1,
  );

  pipeline.evaluate(session);

  assert.equal(
    session.getRuntimeState(
      "strategy.lastStrategyId",
    ),
    "deterministic-test",
  );

  assert.equal(
    session.getRuntimeState(
      "strategy.lastSignal",
    ),
    "BUY",
  );

  assert.equal(
    session.getRuntimeState(
      "strategy.lastConfidence",
    ),
    0.75,
  );

  assert.equal(
    session.getMetric(
      "strategy.evaluations",
    ),
    2,
  );

  assert.equal(
    session.getMetric(
      "strategy.actionableResults",
    ),
    1,
  );

  const events = session.getEvents();

  assert.equal(events.length, 2);
  assert.equal(
    events[0].type,
    "STRATEGY_EVALUATED",
  );
  assert.equal(
    events[0].simulationTime,
    119_999,
  );
  assert.equal(
    events[1].payload.signal,
    "BUY",
  );
}

function testEvaluationRequiresCurrentCandle(): void {
  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      createRegistry(),
      {
        strategyId: "deterministic-test",
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      1,
    );

  assert.throws(
    () => pipeline.evaluate(session),
    /current candle/,
  );
}

function testDuplicateEvaluationRejected(): void {
  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      createRegistry(),
      {
        strategyId: "deterministic-test",
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      1,
    );

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  pipeline.evaluate(session);

  assert.throws(
    () => pipeline.evaluate(session),
    /evaluations must be sequential/,
  );
}

function testRollingHistory(): void {
  const registry = new StrategyRegistry();

  registry.register(
    new DeterministicTestStrategy(),
  );

  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      registry,
      {
        strategyId: "deterministic-test",
        maximumHistory: 2,
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      3,
    );

  session.advance(
    createCandle(60_000, 100),
    0,
  );
  pipeline.evaluate(session);

  session.advance(
    createCandle(120_000, 101),
    1,
  );
  pipeline.evaluate(session);

  session.advance(
    createCandle(180_000, 102),
    2,
  );
  pipeline.evaluate(session);

  assert.deepEqual(
    pipeline
      .getHistory()
      .map((candle) => candle.timestamp),
    [120_000, 180_000],
  );
}

function testMaximumHistoryValidation(): void {
  assert.throws(
    () =>
      new DeterministicBacktestStrategyPipeline(
        createRegistry(),
        {
          strategyId: "deterministic-test",
          maximumHistory: 1,
        },
      ),
    /maximumHistory must be at least 2/,
  );
}

function testReset(): void {
  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      createRegistry(),
      {
        strategyId: "deterministic-test",
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      1,
    );

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  pipeline.evaluate(session);

  pipeline.reset();

  assert.equal(
    pipeline.getEvaluationCount(),
    0,
  );

  assert.deepEqual(
    pipeline.getHistory(),
    [],
  );

  session.reset();

  session.advance(
    createCandle(60_000, 100),
    0,
  );

  const result =
    pipeline.evaluate(session);

  assert.equal(result.candleIndex, 0);
}

function testRealEmaStrategyIntegration(): void {
  const registry = new StrategyRegistry();

  registry.register(
    new EmaCrossoverStrategy({
      fastPeriod: 2,
      slowPeriod: 3,
    }),
  );

  const pipeline =
    new DeterministicBacktestStrategyPipeline(
      registry,
      {
        strategyId: "ema-crossover",
      },
    );

  const session =
    new DeterministicBacktestSession(
      configuration,
      5,
    );

  const closes = [
    100,
    99,
    98,
    99,
    105,
  ];

  let finalTimestamp = 0;

  closes.forEach((close, index) => {
    const openTime =
      60_000 + index * 60_000;

    session.advance(
      createCandle(openTime, close),
      index,
    );

    const evaluation =
      pipeline.evaluate(session);

    finalTimestamp =
      evaluation.result.timestamp;
  });

  assert.equal(
    finalTimestamp,
    359_999,
  );

  assert.equal(
    Number.isFinite(finalTimestamp),
    true,
  );

  assert.equal(
    pipeline.getEvaluationCount(),
    5,
  );
}

function run(): void {
  testDeterministicEvaluation();
  testSessionUpdates();
  testEvaluationRequiresCurrentCandle();
  testDuplicateEvaluationRejected();
  testRollingHistory();
  testMaximumHistoryValidation();
  testReset();
  testRealEmaStrategyIntegration();

  console.log(
    "All backtest strategy pipeline tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Backtest strategy pipeline tests failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}