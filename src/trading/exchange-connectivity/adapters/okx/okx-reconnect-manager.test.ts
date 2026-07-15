import assert from "node:assert/strict";

import {
  OkxReconnectManager,
  OkxReconnectManagerError,
  calculateOkxReconnectDelay,
  createDeterministicOkxReconnectScheduler,
} from "./okx-reconnect-manager";

import {
  createSequenceOkxClock,
} from "./okx-server-time-synchronizer";

function testDelayCalculation(): void {
  const configuration = {
    initialDelayMs: 1_000,
    maximumDelayMs: 10_000,
    multiplier: 2,
  };

  assert.equal(
    calculateOkxReconnectDelay(
      1,
      configuration,
    ),
    1_000,
  );

  assert.equal(
    calculateOkxReconnectDelay(
      2,
      configuration,
    ),
    2_000,
  );

  assert.equal(
    calculateOkxReconnectDelay(
      3,
      configuration,
    ),
    4_000,
  );

  assert.equal(
    calculateOkxReconnectDelay(
      4,
      configuration,
    ),
    8_000,
  );

  assert.equal(
    calculateOkxReconnectDelay(
      5,
      configuration,
    ),
    10_000,
  );

  assert.equal(
    calculateOkxReconnectDelay(
      10,
      configuration,
    ),
    10_000,
  );
}

function testFractionalMultiplierDelay(): void {
  assert.equal(
    calculateOkxReconnectDelay(
      2,
      {
        initialDelayMs: 1_000,
        maximumDelayMs: 10_000,
        multiplier: 1.5,
      },
    ),
    1_500,
  );

  assert.equal(
    calculateOkxReconnectDelay(
      3,
      {
        initialDelayMs: 1_000,
        maximumDelayMs: 10_000,
        multiplier: 1.5,
      },
    ),
    2_250,
  );
}

function testInvalidDelayCalculation(): void {
  assert.throws(
    () =>
      calculateOkxReconnectDelay(
        0,
        {
          initialDelayMs: 1_000,
          maximumDelayMs: 10_000,
          multiplier: 2,
        },
      ),
    /attempt must be a positive integer/,
  );

  assert.throws(
    () =>
      calculateOkxReconnectDelay(
        1,
        {
          initialDelayMs: 0,
          maximumDelayMs: 10_000,
          multiplier: 2,
        },
      ),
    /initialDelayMs must be a positive integer/,
  );

  assert.throws(
    () =>
      calculateOkxReconnectDelay(
        1,
        {
          initialDelayMs: 10_000,
          maximumDelayMs: 1_000,
          multiplier: 2,
        },
      ),
    /maximumDelayMs must be greater than or equal to initialDelayMs/,
  );

  assert.throws(
    () =>
      calculateOkxReconnectDelay(
        1,
        {
          initialDelayMs: 1_000,
          maximumDelayMs: 10_000,
          multiplier: 0.5,
        },
      ),
    /multiplier must be a finite number greater than or equal to 1/,
  );
}

function testInitialSnapshot(): void {
  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxReconnectScheduler(),
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  const snapshot = manager.getSnapshot();

  assert.deepEqual(snapshot, {
    state: "idle",
    attemptCount: 0,
    maximumAttempts: 3,
  });

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(manager.canRetry(), true);
}

function testRetryableCloseCodes(): void {
  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxReconnectScheduler(),
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  assert.equal(
    manager.isRetryableCloseCode(1001),
    true,
  );

  assert.equal(
    manager.isRetryableCloseCode(1006),
    true,
  );

  assert.equal(
    manager.isRetryableCloseCode(1011),
    true,
  );

  assert.equal(
    manager.isRetryableCloseCode(1000),
    false,
  );
}

function testCustomRetryableCloseCodes(): void {
  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxReconnectScheduler(),
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
      retryableCloseCodes: [
        1000,
        4001,
      ],
    },
    reconnect(): void {
      return;
    },
  });

  assert.equal(
    manager.isRetryableCloseCode(1000),
    true,
  );

  assert.equal(
    manager.isRetryableCloseCode(4001),
    true,
  );

  assert.equal(
    manager.isRetryableCloseCode(1006),
    false,
  );
}

function testScheduleReconnect(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const sourceError = new Error(
    "connection failed",
  );

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      5_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  const attempt = manager.scheduleReconnect(
    1006,
    sourceError,
  );

  assert.deepEqual(attempt, {
    attempt: 1,
    delayMs: 1_000,
    scheduledAtMs: 5_000,
    executeAtMs: 6_000,
  });

  assert.equal(Object.isFrozen(attempt), true);

  assert.deepEqual(
    scheduler.getDelays(),
    [1_000],
  );

  assert.deepEqual(manager.getSnapshot(), {
    state: "scheduled",
    attemptCount: 0,
    maximumAttempts: 3,
    nextAttempt: attempt,
    lastCloseCode: 1006,
    lastError: sourceError,
  });
}

function testExecuteReconnect(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  let reconnectCalls = 0;

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      reconnectCalls += 1;
    },
  });

  manager.scheduleReconnect(1006);
  scheduler.runNext();

  assert.equal(reconnectCalls, 1);

  assert.deepEqual(manager.getSnapshot(), {
    state: "idle",
    attemptCount: 1,
    maximumAttempts: 3,
    lastCloseCode: 1006,
  });
}

function testExponentialAttempts(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
      2_000,
      3_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  const first = manager.scheduleReconnect(
    1006,
  );

  assert.equal(first.delayMs, 1_000);

  scheduler.runNext();

  const second = manager.scheduleReconnect(
    1006,
  );

  assert.equal(second.delayMs, 2_000);

  scheduler.runNext();

  const third = manager.scheduleReconnect(
    1006,
  );

  assert.equal(third.delayMs, 4_000);

  scheduler.runNext();

  assert.deepEqual(manager.getSnapshot(), {
    state: "exhausted",
    attemptCount: 3,
    maximumAttempts: 3,
    lastCloseCode: 1006,
  });

  assert.equal(manager.canRetry(), false);
}

function testMaximumAttemptsRejected(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 1,
    },
    reconnect(): void {
      return;
    },
  });

  manager.scheduleReconnect(1006);
  scheduler.runNext();

  assert.throws(
    () => manager.scheduleReconnect(1006),
    /Maximum OKX reconnect attempts have been exhausted/,
  );

  assert.equal(
    manager.getSnapshot().state,
    "exhausted",
  );
}

function testNonRetryableCloseCodeRejected(): void {
  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxReconnectScheduler(),
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  assert.throws(
    () => manager.scheduleReconnect(1000),
    /close code 1000 is not retryable/,
  );
}

function testDuplicateScheduleRejected(): void {
  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxReconnectScheduler(),
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  manager.scheduleReconnect(1006);

  assert.throws(
    () => manager.scheduleReconnect(1006),
    /reconnect attempt is already scheduled/,
  );
}

function testCancelScheduledReconnect(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  manager.scheduleReconnect(1006);
  manager.cancelScheduledReconnect();

  assert.deepEqual(manager.getSnapshot(), {
    state: "idle",
    attemptCount: 0,
    maximumAttempts: 3,
    lastCloseCode: 1006,
  });

  assert.equal(
    scheduler.getScheduledCount(),
    0,
  );

  assert.equal(
    scheduler.getClearedCount(),
    1,
  );
}

function testMarkConnectedReset(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  manager.scheduleReconnect(
    1006,
    new Error("failure"),
  );

  scheduler.runNext();

  assert.equal(
    manager.getSnapshot().attemptCount,
    1,
  );

  manager.markConnected();

  assert.deepEqual(manager.getSnapshot(), {
    state: "idle",
    attemptCount: 0,
    maximumAttempts: 3,
  });

  assert.equal(manager.canRetry(), true);
}

function testReset(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  manager.scheduleReconnect(
    1006,
    new Error("failure"),
  );

  manager.reset();

  assert.deepEqual(manager.getSnapshot(), {
    state: "idle",
    attemptCount: 0,
    maximumAttempts: 3,
  });

  assert.equal(
    scheduler.getScheduledCount(),
    0,
  );
}

function testStop(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  manager.scheduleReconnect(1006);
  manager.stop();

  assert.equal(
    manager.getSnapshot().state,
    "stopped",
  );

  assert.equal(manager.canRetry(), false);

  assert.throws(
    () => manager.scheduleReconnect(1006),
    /Cannot schedule reconnect after the manager has been stopped/,
  );
}

function testReconnectCallbackFailure(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const reconnectError =
    new Error("reconnect failed");

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      throw reconnectError;
    },
  });

  manager.scheduleReconnect(1006);

  assert.throws(
    () => scheduler.runNext(),
    (error: unknown) =>
      error === reconnectError,
  );

  assert.deepEqual(manager.getSnapshot(), {
    state: "idle",
    attemptCount: 1,
    maximumAttempts: 3,
    lastCloseCode: 1006,
    lastError: reconnectError,
  });
}

function testFinalReconnectCallbackFailure(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const reconnectError =
    new Error("final reconnect failed");

  const manager = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 1,
    },
    reconnect(): void {
      throw reconnectError;
    },
  });

  manager.scheduleReconnect(1006);

  assert.throws(
    () => scheduler.runNext(),
    (error: unknown) =>
      error === reconnectError,
  );

  assert.equal(
    manager.getSnapshot().state,
    "exhausted",
  );

  assert.equal(manager.canRetry(), false);
}

function testSchedulerRunAll(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  let first = 0;
  let second = 0;

  scheduler.setTimeout(
    () => {
      first += 1;
    },
    1_000,
  );

  scheduler.setTimeout(
    () => {
      second += 1;
    },
    2_000,
  );

  scheduler.runAll();

  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(
    scheduler.getScheduledCount(),
    0,
  );
}

function testSchedulerValidation(): void {
  const scheduler =
    createDeterministicOkxReconnectScheduler();

  assert.throws(
    () =>
      scheduler.setTimeout(
        () => undefined,
        0,
      ),
    /delayMs must be a positive integer/,
  );

  assert.throws(
    () => scheduler.runNext(),
    /No scheduled reconnect callback is available/,
  );

  assert.throws(
    () => scheduler.clearTimeout("bad"),
    /handle must be an integer/,
  );
}

function testInvalidConfiguration(): void {
  const clock = createSequenceOkxClock([
    1_000,
  ]);

  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const reconnect = (): void => undefined;

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler,
        configuration: {
          initialDelayMs: 0,
          maximumDelayMs: 10_000,
          multiplier: 2,
          maximumAttempts: 3,
        },
        reconnect,
      }),
    /initialDelayMs must be a positive integer/,
  );

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler,
        configuration: {
          initialDelayMs: 10_000,
          maximumDelayMs: 1_000,
          multiplier: 2,
          maximumAttempts: 3,
        },
        reconnect,
      }),
    /maximumDelayMs must be greater than or equal to initialDelayMs/,
  );

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler,
        configuration: {
          initialDelayMs: 1_000,
          maximumDelayMs: 10_000,
          multiplier: 0.5,
          maximumAttempts: 3,
        },
        reconnect,
      }),
    /multiplier must be a finite number greater than or equal to 1/,
  );

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler,
        configuration: {
          initialDelayMs: 1_000,
          maximumDelayMs: 10_000,
          multiplier: 2,
          maximumAttempts: 0,
        },
        reconnect,
      }),
    /maximumAttempts must be a positive integer/,
  );

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler,
        configuration: {
          initialDelayMs: 1_000,
          maximumDelayMs: 10_000,
          multiplier: 2,
          maximumAttempts: 3,
          retryableCloseCodes: [999],
        },
        reconnect,
      }),
    /WebSocket close code must be an integer between 1000 and 4999/,
  );
}

function testInvalidDependencies(): void {
  const clock = createSequenceOkxClock([
    1_000,
  ]);

  const scheduler =
    createDeterministicOkxReconnectScheduler();

  const configuration = {
    initialDelayMs: 1_000,
    maximumDelayMs: 10_000,
    multiplier: 2,
    maximumAttempts: 3,
  };

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock: {} as never,
        scheduler,
        configuration,
        reconnect(): void {
          return;
        },
      }),
    /clock must implement OkxClock/,
  );

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler: {} as never,
        configuration,
        reconnect(): void {
          return;
        },
      }),
    /scheduler must implement OkxReconnectScheduler/,
  );

  assert.throws(
    () =>
      new OkxReconnectManager({
        clock,
        scheduler,
        configuration,
        reconnect: undefined as never,
      }),
    /reconnect must be a function/,
  );
}

function testInvalidClockValue(): void {
  const manager = new OkxReconnectManager({
    clock: {
      now(): number {
        return -1;
      },
    },
    scheduler:
      createDeterministicOkxReconnectScheduler(),
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      return;
    },
  });

  assert.throws(
    () => manager.scheduleReconnect(1006),
    /clock\.now\(\) must be a non-negative integer timestamp/,
  );
}

function testErrorIdentity(): void {
  const error = new OkxReconnectManagerError(
    "Reconnect failed.",
  );

  assert.equal(
    error.name,
    "OkxReconnectManagerError",
  );

  assert.equal(
    error.code,
    "OKX_RECONNECT_MANAGER_ERROR",
  );

  assert.equal(
    error.message,
    "Reconnect failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxReconnectManagerError);
}

function testDeterministicBehavior(): void {
  const firstScheduler =
    createDeterministicOkxReconnectScheduler();

  const secondScheduler =
    createDeterministicOkxReconnectScheduler();

  let firstCalls = 0;
  let secondCalls = 0;

  const first = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler: firstScheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      firstCalls += 1;
    },
  });

  const second = new OkxReconnectManager({
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler: secondScheduler,
    configuration: {
      initialDelayMs: 1_000,
      maximumDelayMs: 10_000,
      multiplier: 2,
      maximumAttempts: 3,
    },
    reconnect(): void {
      secondCalls += 1;
    },
  });

  const firstAttempt =
    first.scheduleReconnect(1006);

  const secondAttempt =
    second.scheduleReconnect(1006);

  assert.deepEqual(
    firstAttempt,
    secondAttempt,
  );

  assert.deepEqual(
    first.getSnapshot(),
    second.getSnapshot(),
  );

  firstScheduler.runNext();
  secondScheduler.runNext();

  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);

  assert.deepEqual(
    first.getSnapshot(),
    second.getSnapshot(),
  );
}

function runOkxReconnectManagerTests(): void {
  testDelayCalculation();
  testFractionalMultiplierDelay();
  testInvalidDelayCalculation();
  testInitialSnapshot();
  testRetryableCloseCodes();
  testCustomRetryableCloseCodes();
  testScheduleReconnect();
  testExecuteReconnect();
  testExponentialAttempts();
  testMaximumAttemptsRejected();
  testNonRetryableCloseCodeRejected();
  testDuplicateScheduleRejected();
  testCancelScheduledReconnect();
  testMarkConnectedReset();
  testReset();
  testStop();
  testReconnectCallbackFailure();
  testFinalReconnectCallbackFailure();
  testSchedulerRunAll();
  testSchedulerValidation();
  testInvalidConfiguration();
  testInvalidDependencies();
  testInvalidClockValue();
  testErrorIdentity();
  testDeterministicBehavior();

  console.log(
    "All OKX reconnect manager tests passed successfully.",
  );
}

runOkxReconnectManagerTests();