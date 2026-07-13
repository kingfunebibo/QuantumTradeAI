import assert from "node:assert/strict";

import {
  DeterministicSignalRuntime,
  SignalEngine,
} from "./signals";

import type {
  SignalInput,
} from "./signals";

import type {
  StrategyResult,
} from "./strategies";

function createStrategyResult(
  overrides: Partial<StrategyResult> = {},
): StrategyResult {
  return {
    strategyId: "ema-crossover",
    signal: "BUY",
    confidence: 0.8,
    reason:
      "Fast EMA crossed above slow EMA.",
    timestamp: 119_999,
    metadata: {
      fastPeriod: 3,
      slowPeriod: 5,
    },
    ...overrides,
  };
}

function createInput(
  overrides: Partial<SignalInput> = {},
): SignalInput {
  return {
    strategyResult:
      createStrategyResult(),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 105,
    candleTimestamp: 60_000,
    ...overrides,
  };
}

function testDeterministicIdentityAndTime(): void {
  const runtime =
    new DeterministicSignalRuntime({
      initialTimestamp: 119_999,
      idPrefix: "TEST-SIGNAL",
    });

  const engine = new SignalEngine(
    {
      minimumConfidence: 0.5,
      duplicateWindowMs: 60_000,
    },
    runtime,
  );

  const first = engine.process(
    createInput(),
  );

  assert.equal(first.accepted, true);

  if (!first.signal) {
    throw new Error(
      "Expected the first signal to be accepted.",
    );
  }

  assert.equal(
    first.signal.id,
    "TEST-SIGNAL-1",
  );

  assert.equal(
    first.signal.generatedAt,
    119_999,
  );

  runtime.advanceTo(179_999);

  const second = engine.process(
    createInput({
      candleTimestamp: 120_000,
      price: 106,
      strategyResult:
        createStrategyResult({
          timestamp: 179_999,
        }),
    }),
  );

  assert.equal(second.accepted, true);

  if (!second.signal) {
    throw new Error(
      "Expected the second signal to be accepted.",
    );
  }

  assert.equal(
    second.signal.id,
    "TEST-SIGNAL-2",
  );

  assert.equal(
    second.signal.generatedAt,
    179_999,
  );
}

function testDuplicateDetectionUsesRuntime(): void {
  const runtime =
    new DeterministicSignalRuntime({
      initialTimestamp: 100_000,
    });

  const engine = new SignalEngine(
    {
      minimumConfidence: 0,
      duplicateWindowMs: 60_000,
    },
    runtime,
  );

  const input = createInput();

  const first =
    engine.process(input);

  assert.equal(first.accepted, true);

  runtime.advanceTo(159_999);

  const duplicateWithinWindow =
    engine.process(input);

  assert.equal(
    duplicateWithinWindow.accepted,
    false,
  );

  assert.match(
    duplicateWithinWindow.reason,
    /Duplicate signal rejected/,
  );

  runtime.advanceTo(160_001);

  const acceptedAfterExpiration =
    engine.process(input);

  assert.equal(
    acceptedAfterExpiration.accepted,
    true,
  );

  if (!acceptedAfterExpiration.signal) {
    throw new Error(
      "Expected signal after duplicate expiration.",
    );
  }

  assert.equal(
    acceptedAfterExpiration.signal.id,
    "BT-SIGNAL-2",
  );
}

function testRuntimeReset(): void {
  const runtime =
    new DeterministicSignalRuntime({
      initialTimestamp: 50_000,
      initialSequence: 5,
      idPrefix: "RESET",
    });

  assert.equal(runtime.now(), 50_000);
  assert.equal(
    runtime.generateId(),
    "RESET-5",
  );

  runtime.advanceTo(75_000);

  assert.equal(
    runtime.generateId(),
    "RESET-6",
  );

  runtime.reset();

  assert.equal(runtime.now(), 50_000);
  assert.equal(
    runtime.generateId(),
    "RESET-5",
  );
}

function testRuntimeCannotMoveBackwards(): void {
  const runtime =
    new DeterministicSignalRuntime({
      initialTimestamp: 10_000,
    });

  runtime.advanceTo(20_000);

  assert.throws(
    () => runtime.advanceTo(19_999),
    /cannot move backwards/,
  );
}

function testIdenticalRunsAreReproducible(): void {
  function runSimulation() {
    const runtime =
      new DeterministicSignalRuntime({
        initialTimestamp: 119_999,
        idPrefix: "REPLAY",
      });

    const engine = new SignalEngine(
      {
        minimumConfidence: 0.5,
        duplicateWindowMs: 60_000,
      },
      runtime,
    );

    const decisions = [];

    decisions.push(
      engine.process(createInput()),
    );

    runtime.advanceTo(179_999);

    decisions.push(
      engine.process(
        createInput({
          candleTimestamp: 120_000,
          price: 106,
          strategyResult:
            createStrategyResult({
              signal: "SELL",
              confidence: 0.9,
              reason:
                "Fast EMA crossed below slow EMA.",
              timestamp: 179_999,
            }),
        }),
      ),
    );

    return decisions;
  }

  const firstRun = runSimulation();
  const secondRun = runSimulation();

  assert.deepEqual(
    firstRun,
    secondRun,
  );
}

function testExistingDefaultRuntime(): void {
  const engine = new SignalEngine({
    minimumConfidence: 0.5,
  });

  const decision = engine.process(
    createInput(),
  );

  assert.equal(decision.accepted, true);

  if (!decision.signal) {
    throw new Error(
      "Expected default runtime signal.",
    );
  }

  assert.equal(
    decision.signal.id.trim().length > 0,
    true,
  );

  assert.equal(
    Number.isSafeInteger(
      decision.signal.generatedAt,
    ),
    true,
  );
}

function run(): void {
  testDeterministicIdentityAndTime();
  testDuplicateDetectionUsesRuntime();
  testRuntimeReset();
  testRuntimeCannotMoveBackwards();
  testIdenticalRunsAreReproducible();
  testExistingDefaultRuntime();

  console.log(
    "All deterministic signal engine tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Deterministic signal engine tests failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}