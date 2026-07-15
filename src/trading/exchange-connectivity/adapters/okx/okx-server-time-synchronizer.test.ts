import assert from "node:assert/strict";

import {
  OkxServerTimeSynchronizationError,
  OkxServerTimeSynchronizer,
  applyOkxServerTimeOffset,
  assertOkxClockDriftAcceptable,
  calculateOkxClockDriftMs,
  calculateOkxServerTimeState,
  createDeterministicServerTimeProvider,
  createOkxServerTimeSample,
  createSequenceOkxClock,
  createSynchronizedOkxClock,
  isOkxClockDriftAcceptable,
} from "./okx-server-time-synchronizer";

function testServerTimeSampleCreation(): void {
  const sample = createOkxServerTimeSample({
    requestStartedAt: 1_000,
    responseReceivedAt: 1_100,
    serverTime: 1_080,
  });

  assert.deepEqual(sample, {
    requestStartedAt: 1_000,
    responseReceivedAt: 1_100,
    serverTime: 1_080,
  });

  assert.equal(Object.isFrozen(sample), true);
}

function testInvalidServerTimeSample(): void {
  assert.throws(
    () =>
      createOkxServerTimeSample({
        requestStartedAt: -1,
        responseReceivedAt: 1_100,
        serverTime: 1_080,
      }),
    /requestStartedAt must be a non-negative integer timestamp/,
  );

  assert.throws(
    () =>
      createOkxServerTimeSample({
        requestStartedAt: 1_200,
        responseReceivedAt: 1_100,
        serverTime: 1_080,
      }),
    /responseReceivedAt must be greater than or equal to requestStartedAt/,
  );

  assert.throws(
    () =>
      createOkxServerTimeSample({
        requestStartedAt: 1_000,
        responseReceivedAt: 1_100,
        serverTime: 1.5,
      }),
    /serverTime must be a non-negative integer timestamp/,
  );
}

function testServerTimeStateCalculation(): void {
  const state = calculateOkxServerTimeState({
    requestStartedAt: 1_000,
    responseReceivedAt: 1_100,
    serverTime: 1_080,
  });

  assert.deepEqual(state, {
    synchronized: true,
    offsetMs: 30,
    roundTripTimeMs: 100,
    serverTimeMs: 1_080,
    localMidpointMs: 1_050,
    synchronizedAtMs: 1_100,
  });

  assert.equal(Object.isFrozen(state), true);
}

function testNegativeOffsetCalculation(): void {
  const state = calculateOkxServerTimeState({
    requestStartedAt: 2_000,
    responseReceivedAt: 2_100,
    serverTime: 2_020,
  });

  assert.equal(state.localMidpointMs, 2_050);
  assert.equal(state.offsetMs, -30);
  assert.equal(state.roundTripTimeMs, 100);
}

function testZeroRoundTripTime(): void {
  const state = calculateOkxServerTimeState({
    requestStartedAt: 5_000,
    responseReceivedAt: 5_000,
    serverTime: 5_025,
  });

  assert.deepEqual(state, {
    synchronized: true,
    offsetMs: 25,
    roundTripTimeMs: 0,
    serverTimeMs: 5_025,
    localMidpointMs: 5_000,
    synchronizedAtMs: 5_000,
  });
}

function testApplyServerTimeOffset(): void {
  assert.equal(
    applyOkxServerTimeOffset(10_000, 250),
    10_250,
  );

  assert.equal(
    applyOkxServerTimeOffset(10_000, -250),
    9_750,
  );

  assert.equal(
    applyOkxServerTimeOffset(10_000, 0),
    10_000,
  );
}

function testInvalidOffsetApplication(): void {
  assert.throws(
    () => applyOkxServerTimeOffset(-1, 0),
    /localTimestampMs must be a non-negative integer timestamp/,
  );

  assert.throws(
    () =>
      applyOkxServerTimeOffset(
        1_000,
        Number.POSITIVE_INFINITY,
      ),
    /offsetMs must be a finite number/,
  );

  assert.throws(
    () => applyOkxServerTimeOffset(100, -200),
    /correctedTimestampMs must be a non-negative integer timestamp/,
  );

  assert.throws(
    () => applyOkxServerTimeOffset(1_000, 0.5),
    /correctedTimestampMs must be a non-negative integer timestamp/,
  );
}

function testClockDriftCalculation(): void {
  assert.equal(
    calculateOkxClockDriftMs(1_000, 1_250),
    250,
  );

  assert.equal(
    calculateOkxClockDriftMs(1_250, 1_000),
    -250,
  );

  assert.equal(
    calculateOkxClockDriftMs(1_000, 1_000),
    0,
  );
}

function testClockDriftAcceptance(): void {
  assert.equal(
    isOkxClockDriftAcceptable(250, 500),
    true,
  );

  assert.equal(
    isOkxClockDriftAcceptable(-250, 500),
    true,
  );

  assert.equal(
    isOkxClockDriftAcceptable(500, 500),
    true,
  );

  assert.equal(
    isOkxClockDriftAcceptable(-500, 500),
    true,
  );

  assert.equal(
    isOkxClockDriftAcceptable(501, 500),
    false,
  );

  assert.equal(
    isOkxClockDriftAcceptable(-501, 500),
    false,
  );
}

function testClockDriftAssertion(): void {
  assert.doesNotThrow(() =>
    assertOkxClockDriftAcceptable(500, 500),
  );

  assert.throws(
    () =>
      assertOkxClockDriftAcceptable(501, 500),
    /OKX clock drift of 501ms exceeds the maximum accepted drift of 500ms/,
  );

  assert.throws(
    () =>
      assertOkxClockDriftAcceptable(-750, 500),
    /OKX clock drift of -750ms exceeds the maximum accepted drift of 500ms/,
  );
}

function testInvalidClockDriftInputs(): void {
  assert.throws(
    () =>
      isOkxClockDriftAcceptable(
        Number.NaN,
        500,
      ),
    /driftMs must be a finite number/,
  );

  assert.throws(
    () => isOkxClockDriftAcceptable(0, -1),
    /maximumAcceptedClockDriftMs must be a non-negative integer/,
  );

  assert.throws(
    () => isOkxClockDriftAcceptable(0, 1.5),
    /maximumAcceptedClockDriftMs must be a non-negative integer/,
  );
}

async function testSynchronizerInitialState(): Promise<void> {
  const synchronizer = new OkxServerTimeSynchronizer(
    createSequenceOkxClock([1_000]),
    createDeterministicServerTimeProvider([1_000]),
    {
      maximumAcceptedClockDriftMs: 500,
    },
  );

  assert.equal(synchronizer.isSynchronized(), false);

  assert.deepEqual(synchronizer.getState(), {
    synchronized: false,
    offsetMs: 0,
    roundTripTimeMs: 0,
    serverTimeMs: 0,
    localMidpointMs: 0,
    synchronizedAtMs: 0,
  });

  assert.equal(
    Object.isFrozen(synchronizer.getState()),
    true,
  );

  const snapshot = synchronizer.getSnapshot();

  assert.deepEqual(snapshot, {
    state: synchronizer.getState(),
    maximumAcceptedClockDriftMs: 500,
  });

  assert.equal(Object.isFrozen(snapshot), true);
}

async function testSynchronizerSynchronization(): Promise<void> {
  const localClock = createSequenceOkxClock([
    1_000,
    1_100,
    1_200,
  ]);

  const provider =
    createDeterministicServerTimeProvider([
      1_080,
    ]);

  const synchronizer = new OkxServerTimeSynchronizer(
    localClock,
    provider,
    {
      maximumAcceptedClockDriftMs: 100,
    },
  );

  const state = await synchronizer.synchronize();

  assert.deepEqual(state, {
    synchronized: true,
    offsetMs: 30,
    roundTripTimeMs: 100,
    serverTimeMs: 1_080,
    localMidpointMs: 1_050,
    synchronizedAtMs: 1_100,
  });

  assert.equal(synchronizer.isSynchronized(), true);
  assert.equal(synchronizer.getState(), state);
  assert.equal(synchronizer.now(), 1_230);
}

async function testSynchronizerNegativeOffset(): Promise<void> {
  const synchronizer = new OkxServerTimeSynchronizer(
    createSequenceOkxClock([
      2_000,
      2_100,
      2_200,
    ]),
    createDeterministicServerTimeProvider([
      2_020,
    ]),
    {
      maximumAcceptedClockDriftMs: 100,
    },
  );

  const state = await synchronizer.synchronize();

  assert.equal(state.offsetMs, -30);
  assert.equal(synchronizer.now(), 2_170);
}

async function testSynchronizerRejectsExcessiveDrift(): Promise<void> {
  const synchronizer = new OkxServerTimeSynchronizer(
    createSequenceOkxClock([
      1_000,
      1_100,
    ]),
    createDeterministicServerTimeProvider([
      2_000,
    ]),
    {
      maximumAcceptedClockDriftMs: 500,
    },
  );

  await assert.rejects(
    () => synchronizer.synchronize(),
    /OKX clock drift of 950ms exceeds the maximum accepted drift of 500ms/,
  );

  assert.equal(synchronizer.isSynchronized(), false);
  assert.deepEqual(synchronizer.getState(), {
    synchronized: false,
    offsetMs: 0,
    roundTripTimeMs: 0,
    serverTimeMs: 0,
    localMidpointMs: 0,
    synchronizedAtMs: 0,
  });
}

async function testSynchronizerReset(): Promise<void> {
  const synchronizer = new OkxServerTimeSynchronizer(
    createSequenceOkxClock([
      1_000,
      1_100,
      1_200,
      1_300,
    ]),
    createDeterministicServerTimeProvider([
      1_080,
    ]),
    {
      maximumAcceptedClockDriftMs: 100,
    },
  );

  await synchronizer.synchronize();

  assert.equal(synchronizer.isSynchronized(), true);
  assert.equal(synchronizer.now(), 1_230);

  synchronizer.reset();

  assert.equal(synchronizer.isSynchronized(), false);
  assert.deepEqual(synchronizer.getState(), {
    synchronized: false,
    offsetMs: 0,
    roundTripTimeMs: 0,
    serverTimeMs: 0,
    localMidpointMs: 0,
    synchronizedAtMs: 0,
  });

  assert.equal(synchronizer.now(), 1_300);
}

async function testRepeatedSynchronization(): Promise<void> {
  const synchronizer = new OkxServerTimeSynchronizer(
    createSequenceOkxClock([
      1_000,
      1_100,
      2_000,
      2_100,
      2_200,
    ]),
    createDeterministicServerTimeProvider([
      1_080,
      2_150,
    ]),
    {
      maximumAcceptedClockDriftMs: 100,
    },
  );

  const first = await synchronizer.synchronize();

  assert.equal(first.offsetMs, 30);

  const second = await synchronizer.synchronize();

  assert.equal(second.offsetMs, 100);
  assert.equal(second.roundTripTimeMs, 100);
  assert.equal(synchronizer.getState(), second);
  assert.equal(synchronizer.now(), 2_300);
}

async function testDeterministicServerTimeProviderValues(): Promise<void> {
  const provider =
    createDeterministicServerTimeProvider([
      10,
      20,
    ]);

  assert.equal(await provider.getServerTime(), 10);
  assert.equal(await provider.getServerTime(), 20);
  assert.equal(await provider.getServerTime(), 20);
}

function testInvalidServerTimeProviderFactory(): void {
  assert.throws(
    () =>
      createDeterministicServerTimeProvider([]),
    /serverTimes must contain at least one timestamp/,
  );

  assert.throws(
    () =>
      createDeterministicServerTimeProvider([
        -1,
      ]),
    /serverTimes\[0\] must be a non-negative integer timestamp/,
  );
}

function testSequenceClock(): void {
  const clock = createSequenceOkxClock([
    100,
    200,
  ]);

  assert.equal(Object.isFrozen(clock), true);
  assert.equal(clock.now(), 100);
  assert.equal(clock.now(), 200);
  assert.equal(clock.now(), 200);
}

function testInvalidSequenceClock(): void {
  assert.throws(
    () => createSequenceOkxClock([]),
    /timestamps must contain at least one timestamp/,
  );

  assert.throws(
    () => createSequenceOkxClock([-1]),
    /timestamps\[0\] must be a non-negative integer timestamp/,
  );

  assert.throws(
    () => createSequenceOkxClock([1.5]),
    /timestamps\[0\] must be a non-negative integer timestamp/,
  );
}

function testSynchronizedClock(): void {
  const localClock = createSequenceOkxClock([
    1_000,
    2_000,
  ]);

  const synchronizedClock =
    createSynchronizedOkxClock(
      localClock,
      250,
    );

  assert.equal(
    Object.isFrozen(synchronizedClock),
    true,
  );

  assert.equal(synchronizedClock.now(), 1_250);
  assert.equal(synchronizedClock.now(), 2_250);
}

function testNegativeSynchronizedClockOffset(): void {
  const localClock = createSequenceOkxClock([
    1_000,
  ]);

  const synchronizedClock =
    createSynchronizedOkxClock(
      localClock,
      -250,
    );

  assert.equal(synchronizedClock.now(), 750);
}

function testInvalidSynchronizerConfiguration(): void {
  assert.throws(
    () =>
      new OkxServerTimeSynchronizer(
        createSequenceOkxClock([1_000]),
        createDeterministicServerTimeProvider([
          1_000,
        ]),
        {
          maximumAcceptedClockDriftMs: -1,
        },
      ),
    /maximumAcceptedClockDriftMs must be a non-negative integer/,
  );
}

function testSynchronizationErrorIdentity(): void {
  const error =
    new OkxServerTimeSynchronizationError(
      "Synchronization failed.",
    );

  assert.equal(
    error.name,
    "OkxServerTimeSynchronizationError",
  );

  assert.equal(
    error.code,
    "OKX_SERVER_TIME_SYNCHRONIZATION_ERROR",
  );

  assert.equal(
    error.message,
    "Synchronization failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(
    error instanceof
      OkxServerTimeSynchronizationError,
  );
}

function testDeterministicStateCalculation(): void {
  const sample = {
    requestStartedAt: 10_000,
    responseReceivedAt: 10_100,
    serverTime: 10_080,
  };

  const first =
    calculateOkxServerTimeState(sample);

  const second =
    calculateOkxServerTimeState(sample);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
}

async function runOkxServerTimeSynchronizerTests(): Promise<void> {
  testServerTimeSampleCreation();
  testInvalidServerTimeSample();
  testServerTimeStateCalculation();
  testNegativeOffsetCalculation();
  testZeroRoundTripTime();
  testApplyServerTimeOffset();
  testInvalidOffsetApplication();
  testClockDriftCalculation();
  testClockDriftAcceptance();
  testClockDriftAssertion();
  testInvalidClockDriftInputs();
  await testSynchronizerInitialState();
  await testSynchronizerSynchronization();
  await testSynchronizerNegativeOffset();
  await testSynchronizerRejectsExcessiveDrift();
  await testSynchronizerReset();
  await testRepeatedSynchronization();
  await testDeterministicServerTimeProviderValues();
  testInvalidServerTimeProviderFactory();
  testSequenceClock();
  testInvalidSequenceClock();
  testSynchronizedClock();
  testNegativeSynchronizedClockOffset();
  testInvalidSynchronizerConfiguration();
  testSynchronizationErrorIdentity();
  testDeterministicStateCalculation();

  console.log(
    "All OKX server time synchronizer tests passed successfully.",
  );
}

void runOkxServerTimeSynchronizerTests();