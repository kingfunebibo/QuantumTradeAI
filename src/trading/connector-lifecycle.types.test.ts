import assert from "node:assert/strict";

import {
  CONNECTOR_LIFECYCLE_COMMANDS,
  CONNECTOR_LIFECYCLE_STATES,
  CONNECTOR_LIFECYCLE_TRANSITIONS,
  ConnectorLifecycleError,
  applyConnectorHealthSnapshot,
  applyConnectorLifecycleTransition,
  assertConnectorLifecycleTransition,
  canTransitionConnectorLifecycle,
  clearLifecycleOperationSnapshot,
  createConnectorHealthSnapshot,
  createConnectorLifecycleCommandResult,
  createConnectorLifecycleTransition,
  createInitialConnectorLifecycleSnapshot,
  createLifecycleOperationSnapshot,
  isConnectorHealthStatus,
  isConnectorLifecycleCommand,
  isConnectorLifecycleState,
  normalizeLifecycleExchangeId,
  type ConnectorLifecycleErrorCode,
} from "./exchange-connectivity/management/connector-lifecycle.types";

function assertLifecycleError(
  operation: () => unknown,
  expectedCode: ConnectorLifecycleErrorCode,
): ConnectorLifecycleError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof ConnectorLifecycleError,
    `Expected ConnectorLifecycleError but received ${
      capturedError instanceof Error
        ? capturedError.constructor.name
        : typeof capturedError
    }.`,
  );

  assert.equal(capturedError.code, expectedCode);

  return capturedError;
}

function testCanonicalConstants(): void {
  assert.deepEqual(CONNECTOR_LIFECYCLE_STATES, [
    "UNINITIALIZED",
    "INITIALIZING",
    "STOPPED",
    "STARTING",
    "RUNNING",
    "DEGRADED",
    "STOPPING",
    "RESTARTING",
    "FAILED",
    "DISPOSED",
  ]);

  assert.deepEqual(CONNECTOR_LIFECYCLE_COMMANDS, [
    "INITIALIZE",
    "START",
    "STOP",
    "RESTART",
    "MARK_DEGRADED",
    "MARK_RECOVERED",
    "MARK_FAILED",
    "DISPOSE",
  ]);

  assert.deepEqual(
    CONNECTOR_LIFECYCLE_TRANSITIONS.RUNNING,
    ["DEGRADED", "STOPPING", "RESTARTING", "FAILED"],
  );

  assert.deepEqual(
    CONNECTOR_LIFECYCLE_TRANSITIONS.DISPOSED,
    [],
  );
}

function testTypeGuards(): void {
  assert.equal(
    isConnectorLifecycleState("RUNNING"),
    true,
  );

  assert.equal(
    isConnectorLifecycleState("UNKNOWN_STATE"),
    false,
  );

  assert.equal(
    isConnectorLifecycleState(null),
    false,
  );

  assert.equal(
    isConnectorLifecycleCommand("START"),
    true,
  );

  assert.equal(
    isConnectorLifecycleCommand("CONNECT"),
    false,
  );

  assert.equal(
    isConnectorHealthStatus("HEALTHY"),
    true,
  );

  assert.equal(
    isConnectorHealthStatus("UNHEALTHY"),
    true,
  );

  assert.equal(
    isConnectorHealthStatus("FAILED"),
    false,
  );
}

function testExchangeIdNormalization(): void {
  assert.equal(
    normalizeLifecycleExchangeId(" OKX "),
    "okx",
  );

  assert.equal(
    normalizeLifecycleExchangeId("BYBIT_TESTNET"),
    "bybit-testnet",
  );

  assert.equal(
    normalizeLifecycleExchangeId("binance  futures"),
    "binance-futures",
  );

  assert.equal(
    normalizeLifecycleExchangeId("exchange:v2"),
    "exchange:v2",
  );

  assertLifecycleError(
    () => normalizeLifecycleExchangeId(""),
    "INVALID_EXCHANGE_ID",
  );

  assertLifecycleError(
    () => normalizeLifecycleExchangeId("-okx"),
    "INVALID_EXCHANGE_ID",
  );

  assertLifecycleError(
    () => normalizeLifecycleExchangeId("okx/spot"),
    "INVALID_EXCHANGE_ID",
  );

  assertLifecycleError(
    () =>
      normalizeLifecycleExchangeId(
        123 as unknown as string,
      ),
    "INVALID_EXCHANGE_ID",
  );
}

function testTransitionValidation(): void {
  assert.equal(
    canTransitionConnectorLifecycle(
      "UNINITIALIZED",
      "INITIALIZING",
    ),
    true,
  );

  assert.equal(
    canTransitionConnectorLifecycle(
      "RUNNING",
      "DEGRADED",
    ),
    true,
  );

  assert.equal(
    canTransitionConnectorLifecycle(
      "DEGRADED",
      "RUNNING",
    ),
    true,
  );

  assert.equal(
    canTransitionConnectorLifecycle(
      "DISPOSED",
      "RUNNING",
    ),
    false,
  );

  assert.equal(
    canTransitionConnectorLifecycle(
      "STOPPED",
      "RUNNING",
    ),
    false,
  );

  assert.doesNotThrow(() =>
    assertConnectorLifecycleTransition(
      "STARTING",
      "RUNNING",
    ),
  );

  assertLifecycleError(
    () =>
      assertConnectorLifecycleTransition(
        "STOPPED",
        "RUNNING",
      ),
    "INVALID_TRANSITION",
  );

  assertLifecycleError(
    () =>
      assertConnectorLifecycleTransition(
        "INVALID" as never,
        "RUNNING",
      ),
    "INVALID_STATE",
  );

  assertLifecycleError(
    () =>
      assertConnectorLifecycleTransition(
        "RUNNING",
        "INVALID" as never,
      ),
    "INVALID_STATE",
  );
}

function testHealthSnapshotCreation(): void {
  const health = createConnectorHealthSnapshot({
    status: "DEGRADED",
    observedAt: 100,
    reason: "  Increased latency  ",
    diagnostics: {
      latencyMs: 850,
      reconnects: 2,
    },
  });

  assert.deepEqual(health, {
    status: "DEGRADED",
    observedAt: 100,
    reason: "Increased latency",
    diagnostics: {
      latencyMs: 850,
      reconnects: 2,
    },
  });

  assert.ok(Object.isFrozen(health));
  assert.ok(Object.isFrozen(health.diagnostics));

  const healthy = createConnectorHealthSnapshot({
    status: "HEALTHY",
    observedAt: 101,
    reason: "   ",
  });

  assert.equal(healthy.reason, undefined);

  assertLifecycleError(
    () =>
      createConnectorHealthSnapshot({
        status: "INVALID" as never,
        observedAt: 100,
      }),
    "INVALID_HEALTH_STATUS",
  );

  assertLifecycleError(
    () =>
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: -1,
      }),
    "INVALID_TIMESTAMP",
  );

  assertLifecycleError(
    () =>
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: Number.NaN,
      }),
    "INVALID_TIMESTAMP",
  );

  assertLifecycleError(
    () =>
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: 100,
        diagnostics:
          [] as unknown as Readonly<
            Record<string, unknown>
          >,
      }),
    "INVALID_METADATA",
  );
}

function testInitialSnapshotCreation(): void {
  const snapshot =
    createInitialConnectorLifecycleSnapshot(
      " OKX ",
      10,
    );

  assert.deepEqual(snapshot, {
    exchangeId: "okx",
    state: "UNINITIALIZED",
    version: 0,
    transitionSequence: 0,
    health: {
      status: "UNKNOWN",
      observedAt: 10,
    },
    operationInProgress: false,
  });

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.health));
}

function testTransitionCreation(): void {
  const transition =
    createConnectorLifecycleTransition({
      exchangeId: " OKX ",
      from: "UNINITIALIZED",
      to: "INITIALIZING",
      command: "INITIALIZE",
      reason: "COMMAND",
      sequence: 1,
      transitionedAt: 20,
      metadata: {
        source: "lifecycle-manager",
      },
    });

  assert.deepEqual(transition, {
    exchangeId: "okx",
    from: "UNINITIALIZED",
    to: "INITIALIZING",
    command: "INITIALIZE",
    reason: "COMMAND",
    sequence: 1,
    transitionedAt: 20,
    metadata: {
      source: "lifecycle-manager",
    },
  });

  assert.ok(Object.isFrozen(transition));
  assert.ok(Object.isFrozen(transition.metadata));

  assertLifecycleError(
    () =>
      createConnectorLifecycleTransition({
        exchangeId: "okx",
        from: "STOPPED",
        to: "RUNNING",
        reason: "COMMAND",
        sequence: 1,
        transitionedAt: 20,
      }),
    "INVALID_TRANSITION",
  );

  assertLifecycleError(
    () =>
      createConnectorLifecycleTransition({
        exchangeId: "okx",
        from: "STOPPED",
        to: "STARTING",
        reason: "COMMAND",
        sequence: 0,
        transitionedAt: 20,
      }),
    "INVALID_SEQUENCE",
  );

  assertLifecycleError(
    () =>
      createConnectorLifecycleTransition({
        exchangeId: "okx",
        from: "STOPPED",
        to: "STARTING",
        reason: "COMMAND",
        sequence: 1,
        transitionedAt: -1,
      }),
    "INVALID_TIMESTAMP",
  );
}

function testApplyingTransitions(): void {
  const initial =
    createInitialConnectorLifecycleSnapshot(
      "okx",
      10,
    );

  const initializing =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "UNINITIALIZED",
      to: "INITIALIZING",
      command: "INITIALIZE",
      reason: "COMMAND",
      sequence: 1,
      transitionedAt: 20,
    });

  const afterInitializing =
    applyConnectorLifecycleTransition(
      initial,
      initializing,
    );

  assert.equal(
    afterInitializing.state,
    "INITIALIZING",
  );

  assert.equal(afterInitializing.version, 1);
  assert.equal(
    afterInitializing.transitionSequence,
    1,
  );

  assert.equal(
    afterInitializing.lastTransition,
    initializing,
  );

  assert.equal(
    afterInitializing.lastTransitionAt,
    20,
  );

  assert.equal(
    afterInitializing.operationInProgress,
    false,
  );

  const stopped =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "INITIALIZING",
      to: "STOPPED",
      command: "INITIALIZE",
      reason: "INITIALIZATION_COMPLETED",
      sequence: 2,
      transitionedAt: 21,
    });

  const healthy =
    createConnectorHealthSnapshot({
      status: "HEALTHY",
      observedAt: 21,
    });

  const afterStopped =
    applyConnectorLifecycleTransition(
      afterInitializing,
      stopped,
      healthy,
    );

  assert.equal(afterStopped.state, "STOPPED");
  assert.equal(afterStopped.version, 2);
  assert.equal(
    afterStopped.transitionSequence,
    2,
  );

  assert.equal(
    afterStopped.health.status,
    "HEALTHY",
  );

  assert.ok(Object.isFrozen(afterStopped));

  const wrongExchangeTransition =
    createConnectorLifecycleTransition({
      exchangeId: "binance",
      from: "STOPPED",
      to: "STARTING",
      command: "START",
      reason: "COMMAND",
      sequence: 3,
      transitionedAt: 22,
    });

  assertLifecycleError(
    () =>
      applyConnectorLifecycleTransition(
        afterStopped,
        wrongExchangeTransition,
      ),
    "INVALID_EXCHANGE_ID",
  );

  const wrongStateTransition =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "RUNNING",
      to: "STOPPING",
      command: "STOP",
      reason: "COMMAND",
      sequence: 3,
      transitionedAt: 22,
    });

  assertLifecycleError(
    () =>
      applyConnectorLifecycleTransition(
        afterStopped,
        wrongStateTransition,
      ),
    "INVALID_TRANSITION",
  );

  const wrongSequenceTransition =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "STOPPED",
      to: "STARTING",
      command: "START",
      reason: "COMMAND",
      sequence: 4,
      transitionedAt: 22,
    });

  assertLifecycleError(
    () =>
      applyConnectorLifecycleTransition(
        afterStopped,
        wrongSequenceTransition,
      ),
    "INVALID_SEQUENCE",
  );
}

function testTransitionTimestampMonotonicity(): void {
  const initial =
    createInitialConnectorLifecycleSnapshot(
      "okx",
      1,
    );

  const first =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "UNINITIALIZED",
      to: "INITIALIZING",
      reason: "COMMAND",
      sequence: 1,
      transitionedAt: 100,
    });

  const afterFirst =
    applyConnectorLifecycleTransition(
      initial,
      first,
    );

  const olderTransition =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "INITIALIZING",
      to: "STOPPED",
      reason: "INITIALIZATION_COMPLETED",
      sequence: 2,
      transitionedAt: 99,
    });

  assertLifecycleError(
    () =>
      applyConnectorLifecycleTransition(
        afterFirst,
        olderTransition,
      ),
    "INVALID_TIMESTAMP",
  );
}

function testLifecycleOperationSnapshots(): void {
  const initial =
    createInitialConnectorLifecycleSnapshot(
      "okx",
      10,
    );

  const active =
    createLifecycleOperationSnapshot(
      initial,
      "INITIALIZE",
    );

  assert.equal(
    active.operationInProgress,
    true,
  );

  assert.equal(
    active.activeCommand,
    "INITIALIZE",
  );

  assert.equal(active.version, 0);
  assert.equal(
    active.transitionSequence,
    0,
  );

  assert.ok(Object.isFrozen(active));

  assertLifecycleError(
    () =>
      createLifecycleOperationSnapshot(
        active,
        "START",
      ),
    "LIFECYCLE_OPERATION_IN_PROGRESS",
  );

  const cleared =
    clearLifecycleOperationSnapshot(active);

  assert.equal(
    cleared.operationInProgress,
    false,
  );

  assert.equal(
    cleared.activeCommand,
    undefined,
  );

  assert.equal(cleared.version, 0);
  assert.equal(
    cleared.transitionSequence,
    0,
  );

  assert.ok(Object.isFrozen(cleared));
}

function testHealthApplication(): void {
  const initial =
    createInitialConnectorLifecycleSnapshot(
      "okx",
      10,
    );

  const health =
    createConnectorHealthSnapshot({
      status: "HEALTHY",
      observedAt: 20,
      diagnostics: {
        latencyMs: 25,
      },
    });

  const updated =
    applyConnectorHealthSnapshot(
      initial,
      health,
    );

  assert.equal(
    updated.health,
    health,
  );

  assert.equal(updated.state, initial.state);
  assert.equal(
    updated.version,
    initial.version,
  );

  assert.equal(
    updated.transitionSequence,
    initial.transitionSequence,
  );

  assert.ok(Object.isFrozen(updated));

  const olderHealth =
    createConnectorHealthSnapshot({
      status: "DEGRADED",
      observedAt: 9,
    });

  assertLifecycleError(
    () =>
      applyConnectorHealthSnapshot(
        initial,
        olderHealth,
      ),
    "INVALID_TIMESTAMP",
  );
}

function testCommandResultCreation(): void {
  const initial =
    createInitialConnectorLifecycleSnapshot(
      "okx",
      10,
    );

  const transition =
    createConnectorLifecycleTransition({
      exchangeId: "okx",
      from: "UNINITIALIZED",
      to: "INITIALIZING",
      command: "INITIALIZE",
      reason: "COMMAND",
      sequence: 1,
      transitionedAt: 20,
    });

  const current =
    applyConnectorLifecycleTransition(
      initial,
      transition,
    );

  const result =
    createConnectorLifecycleCommandResult({
      command: "INITIALIZE",
      outcome: "COMPLETED",
      previousSnapshot: initial,
      currentSnapshot: current,
      transitions: [transition],
    });

  assert.equal(
    result.command,
    "INITIALIZE",
  );

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    result.previousSnapshot,
    initial,
  );

  assert.equal(
    result.currentSnapshot,
    current,
  );

  assert.deepEqual(
    result.transitions,
    [transition],
  );

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.transitions));

  const noChange =
    createConnectorLifecycleCommandResult({
      command: "STOP",
      outcome: "NO_CHANGE",
      previousSnapshot: current,
      currentSnapshot: current,
    });

  assert.deepEqual(
    noChange.transitions,
    [],
  );

  assertLifecycleError(
    () =>
      createConnectorLifecycleCommandResult({
        command: "STOP",
        outcome: "NO_CHANGE",
        previousSnapshot: initial,
        currentSnapshot: current,
        transitions: [transition],
      }),
    "INVALID_TRANSITION",
  );

  const binance =
    createInitialConnectorLifecycleSnapshot(
      "binance",
      10,
    );

  assertLifecycleError(
    () =>
      createConnectorLifecycleCommandResult({
        command: "START",
        outcome: "COMPLETED",
        previousSnapshot: initial,
        currentSnapshot: binance,
      }),
    "INVALID_EXCHANGE_ID",
  );
}

function testLifecycleErrorProperties(): void {
  const cause = new Error("Underlying failure");

  const error = new ConnectorLifecycleError(
    "START_FAILED",
    "Connector start failed.",
    {
      exchangeId: "okx",
      state: "STARTING",
      cause,
    },
  );

  assert.equal(
    error.name,
    "ConnectorLifecycleError",
  );

  assert.equal(error.code, "START_FAILED");
  assert.equal(error.exchangeId, "okx");
  assert.equal(error.state, "STARTING");
  assert.equal(error.cause, cause);
  assert.ok(error instanceof Error);
}

function runConnectorLifecycleTypeTests(): void {
  testCanonicalConstants();
  testTypeGuards();
  testExchangeIdNormalization();
  testTransitionValidation();
  testHealthSnapshotCreation();
  testInitialSnapshotCreation();
  testTransitionCreation();
  testApplyingTransitions();
  testTransitionTimestampMonotonicity();
  testLifecycleOperationSnapshots();
  testHealthApplication();
  testCommandResultCreation();
  testLifecycleErrorProperties();

  console.log(
    "All deterministic connector lifecycle contract tests passed successfully.",
  );
}

runConnectorLifecycleTypeTests();