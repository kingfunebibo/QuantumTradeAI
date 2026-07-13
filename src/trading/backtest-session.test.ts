import assert from "node:assert/strict";
import {
  BacktestRunConfiguration,
  DeterministicBacktestSession,
  HistoricalCandle,
} from "./backtesting";

const configuration: BacktestRunConfiguration = {
  runId: "session-test",
  startingCapital: 10_000,
  baseCurrency: "usd",
  metadata: {
    strategy: "deterministic-test",
  },
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
    open: 100,
    high: Math.max(105, close),
    low: Math.min(95, close),
    close,
    volume: 1_000,
  };
}

function testInitialState(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      3,
    );

  assert.equal(session.getCurrentCandle(), null);
  assert.equal(session.getPreviousCandle(), null);
  assert.equal(session.getSimulationTime(), null);

  assert.deepEqual(session.getProgress(), {
    currentIndex: null,
    processedCandles: 0,
    totalCandles: 3,
    remainingCandles: 3,
    completionRatio: 0,
  });

  assert.equal(
    session.getConfiguration().baseCurrency,
    "USD",
  );
}

function testSequentialAdvance(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      3,
    );

  const first = createCandle(60_000, 101);
  const second = createCandle(120_000, 102);
  const third = createCandle(180_000, 103);

  session.advance(first, 0);

  assert.equal(
    session.getCurrentCandle()?.openTime,
    60_000,
  );
  assert.equal(session.getPreviousCandle(), null);
  assert.equal(
    session.getSimulationTime(),
    119_999,
  );

  session.advance(second, 1);

  assert.equal(
    session.getPreviousCandle()?.openTime,
    60_000,
  );

  assert.equal(
    session.getCurrentCandle()?.openTime,
    120_000,
  );

  session.advance(third, 2);

  assert.deepEqual(session.getProgress(), {
    currentIndex: 2,
    processedCandles: 3,
    totalCandles: 3,
    remainingCandles: 0,
    completionRatio: 1,
  });
}

function testInvalidAdvanceOrder(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      3,
    );

  assert.throws(
    () =>
      session.advance(
        createCandle(120_000, 102),
        1,
      ),
    /advance sequentially/,
  );

  session.advance(
    createCandle(60_000, 101),
    0,
  );

  assert.throws(
    () =>
      session.advance(
        createCandle(120_000, 102),
        2,
      ),
    /advance sequentially/,
  );

  assert.throws(
    () =>
      session.advance(
        createCandle(60_000, 101),
        1,
      ),
    /strictly increasing open-time order/,
  );
}

function testStateStorage(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      1,
    );

  session.setStrategyState(
    "movingAverage",
    101.5,
  );

  session.setStrategyState(
    "history",
    [100, 101, 102],
  );

  session.setStrategyState(
    "flags",
    {
      initialized: true,
      mode: "LONG",
    },
  );

  assert.equal(
    session.getStrategyState("movingAverage"),
    101.5,
  );

  assert.deepEqual(
    session.getStrategyState("history"),
    [100, 101, 102],
  );

  assert.equal(
    session.hasStrategyState("flags"),
    true,
  );

  assert.equal(
    session.deleteStrategyState("flags"),
    true,
  );

  assert.equal(
    session.hasStrategyState("flags"),
    false,
  );

  session.setRuntimeState(
    "activeSymbol",
    "BTCUSDT",
  );

  assert.equal(
    session.getRuntimeState("activeSymbol"),
    "BTCUSDT",
  );
}

function testMetrics(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      1,
    );

  session.setMetric("signals", 2);

  assert.equal(
    session.incrementMetric("signals"),
    3,
  );

  assert.equal(
    session.incrementMetric("orders", 2),
    2,
  );

  assert.equal(
    session.incrementMetric("pnl", -5.5),
    -5.5,
  );

  assert.equal(session.getMetric("signals"), 3);

  assert.throws(
    () => session.setMetric("invalid", Number.NaN),
    /finite number/,
  );
}

function testDeterministicEvents(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      2,
    );

  const initialEvent = session.recordEvent(
    "SESSION_STARTED",
    {
      capital: 10_000,
    },
  );

  assert.deepEqual(initialEvent, {
    sequence: 1,
    type: "SESSION_STARTED",
    simulationTime: null,
    candleIndex: null,
    payload: {
      capital: 10_000,
    },
  });

  session.advance(
    createCandle(60_000, 101),
    0,
  );

  const candleEvent = session.recordEvent(
    "CANDLE_PROCESSED",
    {
      close: 101,
      symbol: "BTCUSDT",
    },
  );

  assert.deepEqual(candleEvent, {
    sequence: 2,
    type: "CANDLE_PROCESSED",
    simulationTime: 119_999,
    candleIndex: 0,
    payload: {
      close: 101,
      symbol: "BTCUSDT",
    },
  });

  assert.equal(session.getEvents().length, 2);
}

function testSnapshot(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      2,
    );

  session.advance(
    createCandle(60_000, 101),
    0,
  );

  session.setStrategyState(
    "trend",
    "BULLISH",
  );

  session.setRuntimeState(
    "lastSignal",
    "BUY",
  );

  session.setMetric("signals", 1);

  session.recordEvent("SIGNAL_CREATED", {
    side: "BUY",
  });

  const snapshot = session.createSnapshot();

  assert.equal(
    snapshot.currentCandle?.close,
    101,
  );

  assert.equal(
    snapshot.strategyState.trend,
    "BULLISH",
  );

  assert.equal(
    snapshot.runtimeState.lastSignal,
    "BUY",
  );

  assert.equal(snapshot.metrics.signals, 1);
  assert.equal(snapshot.events.length, 1);

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(
    Object.isFrozen(snapshot.strategyState),
    true,
  );
  assert.equal(
    Object.isFrozen(snapshot.runtimeState),
    true,
  );
  assert.equal(
    Object.isFrozen(snapshot.metrics),
    true,
  );
}

function testReset(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      2,
    );

  session.advance(
    createCandle(60_000, 101),
    0,
  );

  session.setStrategyState("trend", "BULLISH");
  session.setRuntimeState("active", true);
  session.setMetric("signals", 1);
  session.recordEvent("TEST_EVENT");

  session.reset();

  assert.equal(session.getCurrentCandle(), null);
  assert.equal(session.getPreviousCandle(), null);
  assert.equal(session.getSimulationTime(), null);
  assert.equal(
    session.getStrategyState("trend"),
    undefined,
  );
  assert.equal(
    session.getRuntimeState("active"),
    undefined,
  );
  assert.equal(
    session.getMetric("signals"),
    undefined,
  );
  assert.deepEqual(session.getEvents(), []);

  assert.deepEqual(session.getProgress(), {
    currentIndex: null,
    processedCandles: 0,
    totalCandles: 2,
    remainingCandles: 2,
    completionRatio: 0,
  });

  const event = session.recordEvent(
    "AFTER_RESET",
  );

  assert.equal(event.sequence, 1);
}

function testEmptySessionProgress(): void {
  const session =
    new DeterministicBacktestSession(
      configuration,
      0,
    );

  assert.deepEqual(session.getProgress(), {
    currentIndex: null,
    processedCandles: 0,
    totalCandles: 0,
    remainingCandles: 0,
    completionRatio: 1,
  });
}

function testInputImmutability(): void {
  const mutableConfiguration = {
    ...configuration,
    metadata: {
      strategy: "original",
    },
  };

  const session =
    new DeterministicBacktestSession(
      mutableConfiguration,
      1,
    );

  mutableConfiguration.metadata.strategy =
    "changed";

  assert.equal(
    session.getConfiguration()
      .metadata?.strategy,
    "original",
  );

  const candle = createCandle(60_000, 101);

  session.advance(candle, 0);

  const mutableCandle =
    candle as {
      close: number;
    };

  mutableCandle.close = 999;

  assert.equal(
    session.getCurrentCandle()?.close,
    101,
  );
}

function run(): void {
  testInitialState();
  testSequentialAdvance();
  testInvalidAdvanceOrder();
  testStateStorage();
  testMetrics();
  testDeterministicEvents();
  testSnapshot();
  testReset();
  testEmptySessionProgress();
  testInputImmutability();

  console.log(
    "All backtest session tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Backtest session tests failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}