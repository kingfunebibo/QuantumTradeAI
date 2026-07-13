import assert from "node:assert/strict";
import {
  BacktestCandleContext,
  BacktestOrchestrator,
  BacktestRunConfiguration,
  HistoricalCandle,
  MutableBacktestCancellationToken,
} from "./backtesting";

const configuration: BacktestRunConfiguration = {
  runId: "milestone-2-test",
  startingCapital: 10_000,
  baseCurrency: "usd",
  metadata: {
    strategy: "test-strategy",
    deterministic: true,
  },
};

function createCandle(
  openTime: number,
  close: number = 100,
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

function createCandles(): readonly HistoricalCandle[] {
  return [
    createCandle(180_000, 103),
    createCandle(60_000, 101),
    createCandle(120_000, 102),
  ];
}

async function testCompletedLifecycle(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();
  const lifecycleEvents: string[] = [];
  const processedTimes: number[] = [];

  const result = await orchestrator.run({
    configuration,
    candles: createCandles(),
    hooks: {
      onStart(context) {
        lifecycleEvents.push("START");

        assert.equal(context.totalCandles, 3);
        assert.equal(
          context.configuration.baseCurrency,
          "USD",
        );

        assert.deepEqual(
          context.candles.map(
            (candle) => candle.openTime,
          ),
          [60_000, 120_000, 180_000],
        );
      },

      async onCandle(context) {
        await Promise.resolve();

        lifecycleEvents.push(
          `CANDLE:${context.index}`,
        );

        processedTimes.push(
          context.candle.openTime,
        );

        assert.equal(
          context.simulationTime,
          context.candle.closeTime,
        );
      },

      onComplete(summary) {
        lifecycleEvents.push("COMPLETE");

        assert.equal(summary.status, "COMPLETED");
        assert.equal(summary.processedCandles, 3);
      },
    },
  });

  assert.deepEqual(lifecycleEvents, [
    "START",
    "CANDLE:0",
    "CANDLE:1",
    "CANDLE:2",
    "COMPLETE",
  ]);

  assert.deepEqual(processedTimes, [
    60_000,
    120_000,
    180_000,
  ]);

  assert.deepEqual(result, {
    status: "COMPLETED",
    runId: "milestone-2-test",
    startingCapital: 10_000,
    baseCurrency: "USD",
    totalCandles: 3,
    processedCandles: 3,
    firstOpenTime: 60_000,
    lastCloseTime: 239_999,
    finalSimulationTime: 239_999,
  });
}

async function testCancellationBetweenCandles(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();
  const cancellationToken =
    new MutableBacktestCancellationToken();

  const processedIndexes: number[] = [];
  let cancellationHookCalled = false;

  const result = await orchestrator.run({
    configuration: {
      ...configuration,
      runId: "cancelled-run",
    },
    candles: createCandles(),
    cancellationToken,
    hooks: {
      onCandle(context) {
        processedIndexes.push(context.index);

        if (context.index === 1) {
          cancellationToken.cancel(
            "Maximum test candles reached.",
          );
        }
      },

      onCancelled(summary) {
        cancellationHookCalled = true;

        assert.equal(
          summary.cancellationReason,
          "Maximum test candles reached.",
        );
      },
    },
  });

  assert.equal(result.status, "CANCELLED");

  if (result.status !== "CANCELLED") {
    throw new Error(
      "Expected a cancelled backtest result.",
    );
  }

  assert.deepEqual(processedIndexes, [0, 1]);
  assert.equal(result.processedCandles, 2);
  assert.equal(result.lastCloseTime, 179_999);
  assert.equal(
    result.finalSimulationTime,
    179_999,
  );
  assert.equal(
    result.cancellationReason,
    "Maximum test candles reached.",
  );
  assert.equal(cancellationHookCalled, true);
}

async function testCancellationBeforeReplay(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();
  const cancellationToken =
    new MutableBacktestCancellationToken();

  cancellationToken.cancel("Cancelled before start.");

  let candleHookCalls = 0;

  const result = await orchestrator.run({
    configuration: {
      ...configuration,
      runId: "pre-cancelled-run",
    },
    candles: createCandles(),
    cancellationToken,
    hooks: {
      onCandle() {
        candleHookCalls += 1;
      },
    },
  });

  assert.equal(result.status, "CANCELLED");

  if (result.status !== "CANCELLED") {
    throw new Error(
      "Expected a cancelled backtest result.",
    );
  }

  assert.equal(candleHookCalls, 0);
  assert.equal(result.processedCandles, 0);
  assert.equal(result.firstOpenTime, 60_000);
  assert.equal(result.lastCloseTime, null);
  assert.equal(result.finalSimulationTime, null);
}

async function testFailureCapture(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();

  let failedHookCalled = false;

  const result = await orchestrator.run({
    configuration: {
      ...configuration,
      runId: "failed-run",
    },
    candles: createCandles(),
    hooks: {
      onCandle(context: BacktestCandleContext) {
        if (context.index === 1) {
          throw new Error(
            "Deterministic strategy failure.",
          );
        }
      },

      onFailed(summary) {
        failedHookCalled = true;

        assert.equal(summary.status, "FAILED");
        assert.equal(
          summary.failure.message,
          "Deterministic strategy failure.",
        );
      },
    },
  });

  assert.equal(result.status, "FAILED");

  if (result.status !== "FAILED") {
    throw new Error(
      "Expected a failed backtest result.",
    );
  }

  assert.equal(result.processedCandles, 1);
  assert.equal(result.lastCloseTime, 119_999);
  assert.equal(
    result.finalSimulationTime,
    119_999,
  );
  assert.equal(
    result.failure.name,
    "Error",
  );
  assert.equal(
    result.failure.message,
    "Deterministic strategy failure.",
  );
  assert.equal(failedHookCalled, true);
}

async function testEmptyBacktest(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();

  const lifecycle: string[] = [];

  const result = await orchestrator.run({
    configuration: {
      ...configuration,
      runId: "empty-run",
    },
    candles: [],
    hooks: {
      onStart() {
        lifecycle.push("START");
      },

      onCandle() {
        lifecycle.push("CANDLE");
      },

      onComplete() {
        lifecycle.push("COMPLETE");
      },
    },
  });

  assert.deepEqual(lifecycle, [
    "START",
    "COMPLETE",
  ]);

  assert.deepEqual(result, {
    status: "COMPLETED",
    runId: "empty-run",
    startingCapital: 10_000,
    baseCurrency: "USD",
    totalCandles: 0,
    processedCandles: 0,
    firstOpenTime: null,
    lastCloseTime: null,
    finalSimulationTime: null,
  });
}

async function testConfigurationValidation(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();

  await assert.rejects(
    orchestrator.run({
      configuration: {
        ...configuration,
        runId: " ",
      },
      candles: [],
    }),
    /runId must be a non-empty string/,
  );

  await assert.rejects(
    orchestrator.run({
      configuration: {
        ...configuration,
        startingCapital: 0,
      },
      candles: [],
    }),
    /startingCapital must be a positive finite number/,
  );

  await assert.rejects(
    orchestrator.run({
      configuration: {
        ...configuration,
        baseCurrency: "",
      },
      candles: [],
    }),
    /baseCurrency must be a non-empty string/,
  );
}

async function testInputImmutability(): Promise<void> {
  const orchestrator = new BacktestOrchestrator();
  const candles = createCandles();
  const originalOrder = candles.map(
    (candle) => candle.openTime,
  );

  await orchestrator.run({
    configuration,
    candles,
  });

  assert.deepEqual(
    candles.map((candle) => candle.openTime),
    originalOrder,
  );
}

async function run(): Promise<void> {
  await testCompletedLifecycle();
  await testCancellationBetweenCandles();
  await testCancellationBeforeReplay();
  await testFailureCapture();
  await testEmptyBacktest();
  await testConfigurationValidation();
  await testInputImmutability();

  console.log(
    "All backtest orchestrator tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(
    "Backtest orchestrator tests failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});