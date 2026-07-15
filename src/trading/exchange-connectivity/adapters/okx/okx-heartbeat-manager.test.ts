import assert from "node:assert/strict";

import {
  OkxHeartbeatManager,
  OkxHeartbeatManagerError,
  createDeterministicOkxHeartbeatScheduler,
} from "./okx-heartbeat-manager";

import {
  createSequenceOkxClock,
} from "./okx-server-time-synchronizer";

import {
  DeterministicOkxMockWebSocketConnection,
} from "./okx-websocket-transport";

function createOpenConnection():
  DeterministicOkxMockWebSocketConnection {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  connection.open();

  return connection;
}

function testInitialSnapshot(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  assert.deepEqual(manager.getSnapshot(), {
    state: "idle",
    running: false,
    readyState: "open",
    missedPongCount: 0,
  });

  assert.equal(
    Object.isFrozen(manager.getSnapshot()),
    true,
  );
}

function testStart(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();

  assert.equal(manager.isRunning(), true);
  assert.equal(manager.isHealthy(), true);
  assert.equal(
    scheduler.getScheduledCount(),
    1,
  );

  assert.deepEqual(manager.getSnapshot(), {
    state: "healthy",
    running: true,
    readyState: "open",
    lastActivityAtMs: 1_000,
    missedPongCount: 0,
  });
}

function testStartRequiresOpenConnection(): void {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  assert.throws(
    () => manager.start(),
    /connection must be open before starting heartbeats/,
  );
}

function testDuplicateStartRejected(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();

  assert.throws(
    () => manager.start(),
    /heartbeat manager is already running/,
  );
}

function testIdlePingDispatch(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      11_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();
  scheduler.runNext();

  assert.deepEqual(
    connection.getSentMessages(),
    ["ping"],
  );

  assert.deepEqual(manager.getSnapshot(), {
    state: "awaiting-pong",
    running: true,
    readyState: "open",
    lastActivityAtMs: 1_000,
    lastPingAtMs: 11_000,
    missedPongCount: 0,
  });

  assert.equal(manager.isHealthy(), true);
}

function testNoPingBeforeIdleThreshold(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      5_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();
  scheduler.runNext();

  assert.deepEqual(
    connection.getSentMessages(),
    [],
  );

  assert.equal(
    manager.getSnapshot().state,
    "healthy",
  );
}

function testPongAcknowledgement(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      11_000,
      12_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();
  scheduler.runNext();

  manager.recordPong();

  assert.deepEqual(manager.getSnapshot(), {
    state: "healthy",
    running: true,
    readyState: "open",
    lastActivityAtMs: 12_000,
    lastPingAtMs: 11_000,
    lastPongAtMs: 12_000,
    missedPongCount: 0,
  });

  assert.equal(manager.hasTimedOut(), false);
}

function testUnexpectedPongRejected(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  assert.throws(
    () => manager.recordPong("unexpected"),
    /Unexpected OKX pong message/,
  );
}

function testTimeoutDetection(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      11_000,
      16_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();
  scheduler.runNext();
  scheduler.runNext();

  assert.equal(manager.hasTimedOut(), true);
  assert.equal(manager.isHealthy(), false);

  assert.deepEqual(manager.getSnapshot(), {
    state: "timed-out",
    running: true,
    readyState: "open",
    lastActivityAtMs: 1_000,
    lastPingAtMs: 11_000,
    missedPongCount: 1,
  });
}

function testClosedConnectionCausesTimeout(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      2_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();
  connection.close();
  scheduler.runNext();

  assert.equal(manager.hasTimedOut(), true);

  assert.equal(
    manager.getSnapshot().missedPongCount,
    1,
  );
}

function testIncomingPongHandling(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      2_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();

  const handled =
    manager.handleIncomingMessage("pong");

  assert.equal(handled, true);

  assert.equal(
    manager.getSnapshot().lastPongAtMs,
    2_000,
  );
}

function testIncomingActivityHandling(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      2_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();

  const handled =
    manager.handleIncomingMessage(
      '{"arg":{"channel":"tickers"}}',
    );

  assert.equal(handled, false);

  assert.equal(
    manager.getSnapshot().lastActivityAtMs,
    2_000,
  );
}

function testCustomPingAndPongMessages(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
      11_000,
      12_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
      pingMessage: "custom-ping",
      pongMessage: "custom-pong",
    },
  });

  manager.start();
  scheduler.runNext();

  assert.deepEqual(
    connection.getSentMessages(),
    ["custom-ping"],
  );

  assert.equal(
    manager.handleIncomingMessage(
      "custom-pong",
    ),
    true,
  );
}

function testRecordActivityWithExplicitTimestamp(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.recordActivity(5_000);

  assert.equal(
    manager.getSnapshot().lastActivityAtMs,
    5_000,
  );

  assert.equal(
    manager.getSnapshot().state,
    "healthy",
  );
}

function testStop(): void {
  const connection = createOpenConnection();
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  manager.start();
  manager.stop();

  assert.equal(manager.isRunning(), false);
  assert.equal(
    manager.getSnapshot().state,
    "stopped",
  );

  assert.equal(
    scheduler.getScheduledCount(),
    0,
  );

  assert.equal(
    scheduler.getClearedCount(),
    1,
  );
}

function testTickRequiresRunningManager(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  assert.throws(
    () => manager.tick(),
    /heartbeat manager must be running before tick/,
  );
}

function testSchedulerRunAll(): void {
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  let first = 0;
  let second = 0;

  scheduler.setInterval(
    () => {
      first += 1;
    },
    1_000,
  );

  scheduler.setInterval(
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
    2,
  );
}

function testSchedulerValidation(): void {
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  assert.throws(
    () =>
      scheduler.setInterval(
        () => undefined,
        0,
      ),
    /intervalMs must be a positive integer/,
  );

  assert.throws(
    () => scheduler.runNext(),
    /No scheduled heartbeat callback is available/,
  );

  assert.throws(
    () => scheduler.clearInterval("bad"),
    /handle must be an integer/,
  );
}

function testInvalidConfiguration(): void {
  const connection = createOpenConnection();
  const clock = createSequenceOkxClock([
    1_000,
  ]);
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  assert.throws(
    () =>
      new OkxHeartbeatManager({
        connection,
        clock,
        scheduler,
        configuration: {
          heartbeatIntervalMs: 0,
          pongTimeoutMs: 5_000,
        },
      }),
    /heartbeatIntervalMs must be a positive integer/,
  );

  assert.throws(
    () =>
      new OkxHeartbeatManager({
        connection,
        clock,
        scheduler,
        configuration: {
          heartbeatIntervalMs: 5_000,
          pongTimeoutMs: 10_000,
        },
      }),
    /pongTimeoutMs must be less than or equal to heartbeatIntervalMs/,
  );

  assert.throws(
    () =>
      new OkxHeartbeatManager({
        connection,
        clock,
        scheduler,
        configuration: {
          heartbeatIntervalMs: 10_000,
          pongTimeoutMs: 5_000,
          pingMessage: " ",
        },
      }),
    /pingMessage must not be empty/,
  );
}

function testInvalidDependencies(): void {
  const connection = createOpenConnection();
  const clock = createSequenceOkxClock([
    1_000,
  ]);
  const scheduler =
    createDeterministicOkxHeartbeatScheduler();

  assert.throws(
    () =>
      new OkxHeartbeatManager({
        connection: {} as never,
        clock,
        scheduler,
        configuration: {
          heartbeatIntervalMs: 10_000,
          pongTimeoutMs: 5_000,
        },
      }),
    /connection must implement OkxWebSocketConnection/,
  );

  assert.throws(
    () =>
      new OkxHeartbeatManager({
        connection,
        clock: {} as never,
        scheduler,
        configuration: {
          heartbeatIntervalMs: 10_000,
          pongTimeoutMs: 5_000,
        },
      }),
    /clock must implement OkxClock/,
  );

  assert.throws(
    () =>
      new OkxHeartbeatManager({
        connection,
        clock,
        scheduler: {} as never,
        configuration: {
          heartbeatIntervalMs: 10_000,
          pongTimeoutMs: 5_000,
        },
      }),
    /scheduler must implement OkxHeartbeatScheduler/,
  );
}

function testInvalidExplicitTimestamp(): void {
  const connection = createOpenConnection();

  const manager = new OkxHeartbeatManager({
    connection,
    clock: createSequenceOkxClock([
      1_000,
    ]),
    scheduler:
      createDeterministicOkxHeartbeatScheduler(),
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  assert.throws(
    () => manager.recordActivity(-1),
    /timestampMs must be a non-negative integer timestamp/,
  );

  assert.throws(
    () => manager.recordPong("pong", 1.5),
    /timestampMs must be a non-negative integer timestamp/,
  );
}

function testErrorIdentity(): void {
  const error = new OkxHeartbeatManagerError(
    "Heartbeat failed.",
  );

  assert.equal(
    error.name,
    "OkxHeartbeatManagerError",
  );

  assert.equal(
    error.code,
    "OKX_HEARTBEAT_MANAGER_ERROR",
  );

  assert.equal(
    error.message,
    "Heartbeat failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxHeartbeatManagerError);
}

function testDeterministicBehavior(): void {
  const firstConnection = createOpenConnection();
  const secondConnection = createOpenConnection();

  const firstScheduler =
    createDeterministicOkxHeartbeatScheduler();

  const secondScheduler =
    createDeterministicOkxHeartbeatScheduler();

  const first = new OkxHeartbeatManager({
    connection: firstConnection,
    clock: createSequenceOkxClock([
      1_000,
      11_000,
    ]),
    scheduler: firstScheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  const second = new OkxHeartbeatManager({
    connection: secondConnection,
    clock: createSequenceOkxClock([
      1_000,
      11_000,
    ]),
    scheduler: secondScheduler,
    configuration: {
      heartbeatIntervalMs: 10_000,
      pongTimeoutMs: 5_000,
    },
  });

  first.start();
  second.start();

  firstScheduler.runNext();
  secondScheduler.runNext();

  assert.deepEqual(
    firstConnection.getSentMessages(),
    secondConnection.getSentMessages(),
  );

  assert.deepEqual(
    first.getSnapshot(),
    second.getSnapshot(),
  );
}

function runOkxHeartbeatManagerTests(): void {
  testInitialSnapshot();
  testStart();
  testStartRequiresOpenConnection();
  testDuplicateStartRejected();
  testIdlePingDispatch();
  testNoPingBeforeIdleThreshold();
  testPongAcknowledgement();
  testUnexpectedPongRejected();
  testTimeoutDetection();
  testClosedConnectionCausesTimeout();
  testIncomingPongHandling();
  testIncomingActivityHandling();
  testCustomPingAndPongMessages();
  testRecordActivityWithExplicitTimestamp();
  testStop();
  testTickRequiresRunningManager();
  testSchedulerRunAll();
  testSchedulerValidation();
  testInvalidConfiguration();
  testInvalidDependencies();
  testInvalidExplicitTimestamp();
  testErrorIdentity();
  testDeterministicBehavior();

  console.log(
    "All OKX heartbeat manager tests passed successfully.",
  );
}

runOkxHeartbeatManagerTests();