import assert from "node:assert/strict";
import {
  CandleReplayContext,
  DeterministicBacktestClock,
  HistoricalCandle,
  HistoricalCandleReplay,
} from "./backtesting";

function createCandle(
  overrides: Partial<HistoricalCandle> = {},
): HistoricalCandle {
  return {
    symbol: "BTCUSDT",
    timeframe: "1m",
    openTime: 60_000,
    closeTime: 119_999,
    open: 100,
    high: 105,
    low: 98,
    close: 103,
    volume: 1_000,
    ...overrides,
  };
}

async function testDeterministicOrderingAndReplay(): Promise<void> {
  const clock = new DeterministicBacktestClock();
  const replay = new HistoricalCandleReplay(clock);

  const candles: HistoricalCandle[] = [
    createCandle({
      openTime: 180_000,
      closeTime: 239_999,
      open: 103,
      high: 110,
      low: 102,
      close: 108,
    }),
    createCandle({
      openTime: 60_000,
      closeTime: 119_999,
    }),
    createCandle({
      openTime: 120_000,
      closeTime: 179_999,
      open: 103,
      high: 107,
      low: 101,
      close: 104,
    }),
  ];

  const originalOrder = candles.map((candle) => candle.openTime);
  const contexts: CandleReplayContext[] = [];

  const result = await replay.replay(candles, (context) => {
    contexts.push(context);
    assert.equal(clock.now(), context.candle.closeTime);
    assert.equal(
      context.simulationTime,
      context.candle.closeTime,
    );
  });

  assert.deepEqual(
    candles.map((candle) => candle.openTime),
    originalOrder,
    "Replay must not mutate the caller's candle array.",
  );

  assert.deepEqual(
    contexts.map((context) => context.candle.openTime),
    [60_000, 120_000, 180_000],
  );

  assert.equal(contexts[0].index, 0);
  assert.equal(contexts[0].isFirst, true);
  assert.equal(contexts[0].isLast, false);
  assert.equal(contexts[0].previousCandle, undefined);

  assert.equal(contexts[1].previousCandle?.openTime, 60_000);

  assert.equal(contexts[2].index, 2);
  assert.equal(contexts[2].isFirst, false);
  assert.equal(contexts[2].isLast, true);
  assert.equal(contexts[2].totalCandles, 3);

  assert.deepEqual(result, {
    processedCandles: 3,
    firstOpenTime: 60_000,
    lastCloseTime: 239_999,
    finalSimulationTime: 239_999,
  });
}

async function testAsyncSequentialProcessing(): Promise<void> {
  const replay = new HistoricalCandleReplay();
  const processedIndexes: number[] = [];

  await replay.replay(
    [
      createCandle(),
      createCandle({
        openTime: 120_000,
        closeTime: 179_999,
      }),
      createCandle({
        openTime: 180_000,
        closeTime: 239_999,
      }),
    ],
    async ({ index }) => {
      await Promise.resolve();
      processedIndexes.push(index);
    },
  );

  assert.deepEqual(processedIndexes, [0, 1, 2]);
}

async function testEmptyReplay(): Promise<void> {
  const replay = new HistoricalCandleReplay();

  const result = await replay.replay([], () => {
    throw new Error("Handler must not run for an empty replay.");
  });

  assert.deepEqual(result, {
    processedCandles: 0,
    firstOpenTime: null,
    lastCloseTime: null,
    finalSimulationTime: null,
  });
}

async function testDuplicateRejection(): Promise<void> {
  const replay = new HistoricalCandleReplay();
  const duplicate = createCandle();

  await assert.rejects(
    replay.replay(
      [
        duplicate,
        {
          ...duplicate,
          close: 104,
        },
      ],
      () => undefined,
    ),
    /Duplicate historical candle detected/,
  );
}

async function testInvalidOhlcRejection(): Promise<void> {
  const replay = new HistoricalCandleReplay();

  await assert.rejects(
    replay.replay(
      [
        createCandle({
          high: 102,
          close: 103,
        }),
      ],
      () => undefined,
    ),
    /high below its open or close price/,
  );

  await assert.rejects(
    replay.replay(
      [
        createCandle({
          low: 101,
          open: 100,
        }),
      ],
      () => undefined,
    ),
    /low above its open or close price/,
  );

  await assert.rejects(
    replay.replay(
      [
        createCandle({
          volume: -1,
        }),
      ],
      () => undefined,
    ),
    /volume.*non-negative finite number/,
  );
}

async function testMultipleMarketRejection(): Promise<void> {
  const replay = new HistoricalCandleReplay();

  await assert.rejects(
    replay.replay(
      [
        createCandle(),
        createCandle({
          symbol: "ETHUSDT",
          openTime: 120_000,
          closeTime: 179_999,
        }),
      ],
      () => undefined,
    ),
    /multiple markets/,
  );
}

function testClockCannotMoveBackwards(): void {
  const clock = new DeterministicBacktestClock();

  clock.advanceTo(2_000);

  assert.throws(
    () => clock.advanceTo(1_000),
    /cannot move backwards/,
  );

  clock.reset();

  assert.equal(clock.now(), null);

  clock.advanceTo(1_000);

  assert.equal(clock.now(), 1_000);
}

async function run(): Promise<void> {
  await testDeterministicOrderingAndReplay();
  await testAsyncSequentialProcessing();
  await testEmptyReplay();
  await testDuplicateRejection();
  await testInvalidOhlcRejection();
  await testMultipleMarketRejection();
  testClockCannotMoveBackwards();

  console.log(
    "All backtesting replay tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error("Backtesting replay tests failed.");

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});