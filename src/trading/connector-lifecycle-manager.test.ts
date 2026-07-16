import assert from "node:assert/strict";

import {
  ConnectorLifecycleManager,
} from "./exchange-connectivity/management/connector-lifecycle-manager";

import {
  ConnectorLifecycleError,
  type ConnectorHealthStatus,
  type ConnectorLifecycleClock,
  type ConnectorLifecycleErrorCode,
  type ManagedConnectorLifecycleAdapter,
} from "./exchange-connectivity/management/connector-lifecycle.types";

import {
  ExchangeRegistry,
} from "./exchange-connectivity/management/exchange-registry";

/**
 * Deterministic clock that returns a strictly controlled timestamp sequence.
 */
class DeterministicLifecycleClock
  implements ConnectorLifecycleClock
{
  private currentTime: number;

  private readonly increment: number;

  public constructor(
    initialTime = 1_000,
    increment = 1,
  ) {
    this.currentTime = initialTime;
    this.increment = increment;
  }

  public now(): number {
    const value = this.currentTime;

    this.currentTime += this.increment;

    return value;
  }
}

/**
 * Deferred promise utility used to test operation locking.
 */
interface DeferredPromise<T> {
  readonly promise: Promise<T>;

  resolve(value: T): void;

  reject(reason?: unknown): void;
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>(
    (resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    },
  );

  return Object.freeze({
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  });
}

/**
 * Deterministic lifecycle connector test double.
 */
class TestManagedConnector
  implements ManagedConnectorLifecycleAdapter
{
  public initializeCount = 0;

  public startCount = 0;

  public stopCount = 0;

  public disposeCount = 0;

  public healthCount = 0;

  public initializeFailure?: unknown;

  public startFailure?: unknown;

  public stopFailure?: unknown;

  public disposeFailure?: unknown;

  public healthFailure?: unknown;

  public initializeBarrier?: Promise<void>;

  public startBarrier?: Promise<void>;

  public stopBarrier?: Promise<void>;

  public disposeBarrier?: Promise<void>;

  public healthStatus: ConnectorHealthStatus =
    "HEALTHY";

  public healthReason?: string;

  public healthDiagnostics?: Readonly<
    Record<string, unknown>
  >;

  public async initialize(): Promise<void> {
    this.initializeCount += 1;

    if (this.initializeBarrier !== undefined) {
      await this.initializeBarrier;
    }

    if (this.initializeFailure !== undefined) {
      throw this.initializeFailure;
    }
  }

  public async start(): Promise<void> {
    this.startCount += 1;

    if (this.startBarrier !== undefined) {
      await this.startBarrier;
    }

    if (this.startFailure !== undefined) {
      throw this.startFailure;
    }
  }

  public async stop(): Promise<void> {
    this.stopCount += 1;

    if (this.stopBarrier !== undefined) {
      await this.stopBarrier;
    }

    if (this.stopFailure !== undefined) {
      throw this.stopFailure;
    }
  }

  public async dispose(): Promise<void> {
    this.disposeCount += 1;

    if (this.disposeBarrier !== undefined) {
      await this.disposeBarrier;
    }

    if (this.disposeFailure !== undefined) {
      throw this.disposeFailure;
    }
  }

  public async getHealth(): Promise<
    Readonly<{
      readonly status: ConnectorHealthStatus;
      readonly reason?: string;
      readonly diagnostics?: Readonly<
        Record<string, unknown>
      >;
    }>
  > {
    this.healthCount += 1;

    if (this.healthFailure !== undefined) {
      throw this.healthFailure;
    }

    return Object.freeze({
      status: this.healthStatus,
      ...(this.healthReason === undefined
        ? {}
        : {
            reason: this.healthReason,
          }),
      ...(this.healthDiagnostics === undefined
        ? {}
        : {
            diagnostics:
              this.healthDiagnostics,
          }),
    });
  }
}

function createRegistryWithConnector(
  exchangeId = "okx",
  connector = new TestManagedConnector(),
): Readonly<{
  registry: ExchangeRegistry<TestManagedConnector>;
  connector: TestManagedConnector;
}> {
  const registry =
    new ExchangeRegistry<TestManagedConnector>();

  registry.register({
    exchangeId,
    connector,
  });

  return Object.freeze({
    registry,
    connector,
  });
}

async function assertLifecycleErrorAsync(
  operation: () => Promise<unknown>,
  expectedCode: ConnectorLifecycleErrorCode,
): Promise<ConnectorLifecycleError> {
  let capturedError: unknown;

  try {
    await operation();
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

  assert.equal(
    capturedError.code,
    expectedCode,
  );

  return capturedError;
}

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

  assert.equal(
    capturedError.code,
    expectedCode,
  );

  return capturedError;
}

async function testInitialInspection(): Promise<void> {
  const { registry } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            100,
          ),
      },
    );

  const snapshot = manager.inspect(" OKX ");

  assert.equal(snapshot.exchangeId, "okx");
  assert.equal(
    snapshot.state,
    "UNINITIALIZED",
  );
  assert.equal(snapshot.version, 0);
  assert.equal(
    snapshot.transitionSequence,
    0,
  );
  assert.equal(
    snapshot.health.status,
    "UNKNOWN",
  );
  assert.equal(
    snapshot.health.observedAt,
    100,
  );
  assert.equal(
    snapshot.operationInProgress,
    false,
  );

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.health));

  assert.deepEqual(
    manager.getTransitionHistory("okx"),
    [],
  );

  assert.ok(
    Object.isFrozen(
      manager.getTransitionHistory("okx"),
    ),
  );
}

async function testExplicitInitialization(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            200,
          ),
      },
    );

  const result =
    await manager.initialize("OKX");

  assert.equal(
    result.command,
    "INITIALIZE",
  );
  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(connector.initializeCount, 1);
  assert.equal(connector.startCount, 0);

  assert.equal(
    result.previousSnapshot.state,
    "UNINITIALIZED",
  );

  assert.equal(
    result.currentSnapshot.state,
    "STOPPED",
  );

  assert.equal(
    result.currentSnapshot.version,
    2,
  );

  assert.equal(
    result.currentSnapshot.transitionSequence,
    2,
  );

  assert.equal(
    result.currentSnapshot.health.status,
    "HEALTHY",
  );

  assert.deepEqual(
    result.transitions.map(
      (transition) => [
        transition.from,
        transition.to,
        transition.reason,
      ],
    ),
    [
      [
        "UNINITIALIZED",
        "INITIALIZING",
        "COMMAND",
      ],
      [
        "INITIALIZING",
        "STOPPED",
        "INITIALIZATION_COMPLETED",
      ],
    ],
  );

  assert.deepEqual(
    manager
      .getTransitionHistory("okx")
      .map((transition) => transition.sequence),
    [1, 2],
  );

  const secondResult =
    await manager.initialize("okx");

  assert.equal(
    secondResult.outcome,
    "NO_CHANGE",
  );

  assert.equal(
    secondResult.currentSnapshot.state,
    "STOPPED",
  );

  assert.equal(connector.initializeCount, 1);
}

async function testAutomaticInitializationAndStart(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            300,
          ),
      },
    );

  const result =
    await manager.start("okx");

  assert.equal(connector.initializeCount, 1);
  assert.equal(connector.startCount, 1);

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    result.currentSnapshot.state,
    "RUNNING",
  );

  assert.equal(
    result.currentSnapshot.health.status,
    "HEALTHY",
  );

  assert.equal(
    result.transitions.length,
    4,
  );

  assert.deepEqual(
    result.transitions.map(
      (transition) => transition.to,
    ),
    [
      "INITIALIZING",
      "STOPPED",
      "STARTING",
      "RUNNING",
    ],
  );

  assert.deepEqual(
    result.transitions.map(
      (transition) => transition.sequence,
    ),
    [1, 2, 3, 4],
  );

  const secondResult =
    await manager.start("OKX");

  assert.equal(
    secondResult.outcome,
    "NO_CHANGE",
  );

  assert.equal(connector.startCount, 1);
}

async function testDisabledAutomaticInitialization(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
        autoInitializeBeforeStart: false,
      },
    );

  const error =
    await assertLifecycleErrorAsync(
      () => manager.start("okx"),
      "COMMAND_NOT_ALLOWED",
    );

  assert.equal(
    error.state,
    "UNINITIALIZED",
  );

  assert.equal(connector.initializeCount, 0);
  assert.equal(connector.startCount, 0);

  assert.equal(
    manager.inspect("okx").state,
    "UNINITIALIZED",
  );

  assert.equal(
    manager.inspect("okx")
      .operationInProgress,
    false,
  );
}

async function testStopFlow(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            400,
          ),
      },
    );

  await manager.start("okx");

  const result =
    await manager.stop("okx");

  assert.equal(connector.stopCount, 1);

  assert.equal(
    result.currentSnapshot.state,
    "STOPPED",
  );

  assert.equal(
    result.currentSnapshot.health.status,
    "UNKNOWN",
  );

  assert.equal(
    result.currentSnapshot.health.reason,
    "Connector is stopped.",
  );

  assert.deepEqual(
    result.transitions.map(
      (transition) => transition.to,
    ),
    [
      "STOPPING",
      "STOPPED",
    ],
  );

  const secondResult =
    await manager.stop("okx");

  assert.equal(
    secondResult.outcome,
    "NO_CHANGE",
  );

  assert.equal(connector.stopCount, 1);
}

async function testRestartFlow(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            500,
          ),
      },
    );

  await manager.start("okx");

  const result =
    await manager.restart("okx");

  assert.equal(connector.stopCount, 1);
  assert.equal(connector.startCount, 2);

  assert.equal(
    result.currentSnapshot.state,
    "RUNNING",
  );

  assert.deepEqual(
    result.transitions.map(
      (transition) => transition.to,
    ),
    [
      "RESTARTING",
      "STOPPED",
      "STARTING",
      "RUNNING",
    ],
  );

  assert.equal(
    result.transitions.at(-1)?.reason,
    "RESTART_COMPLETED",
  );
}

async function testRestartStoppedConnector(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  await manager.initialize("okx");

  const result =
    await manager.restart("okx");

  assert.equal(connector.initializeCount, 1);
  assert.equal(connector.stopCount, 0);
  assert.equal(connector.startCount, 1);

  assert.equal(
    result.currentSnapshot.state,
    "RUNNING",
  );
}

async function testDegradedAndRecoveredFlow(): Promise<void> {
  const { registry } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            600,
          ),
      },
    );

  await manager.start("okx");

  const degraded =
    manager.markDegraded("okx", {
      reason: "  Elevated latency  ",
      diagnostics: {
        latencyMs: 900,
      },
    });

  assert.equal(
    degraded.outcome,
    "COMPLETED",
  );

  assert.equal(
    degraded.currentSnapshot.state,
    "DEGRADED",
  );

  assert.equal(
    degraded.currentSnapshot.health.status,
    "DEGRADED",
  );

  assert.equal(
    degraded.currentSnapshot.health.reason,
    "Elevated latency",
  );

  assert.deepEqual(
    degraded.currentSnapshot.health
      .diagnostics,
    {
      latencyMs: 900,
    },
  );

  const repeatedDegraded =
    manager.markDegraded("okx", {
      reason: "Still degraded",
    });

  assert.equal(
    repeatedDegraded.outcome,
    "NO_CHANGE",
  );

  assert.equal(
    repeatedDegraded.currentSnapshot.state,
    "DEGRADED",
  );

  assert.equal(
    repeatedDegraded.currentSnapshot.health
      .reason,
    "Still degraded",
  );

  const recovered =
    manager.markRecovered("okx");

  assert.equal(
    recovered.outcome,
    "COMPLETED",
  );

  assert.equal(
    recovered.currentSnapshot.state,
    "RUNNING",
  );

  assert.equal(
    recovered.currentSnapshot.health.status,
    "HEALTHY",
  );

  const repeatedRecovery =
    manager.markRecovered("okx");

  assert.equal(
    repeatedRecovery.outcome,
    "NO_CHANGE",
  );
}

async function testInvalidDegradeAndRecoveryCommands(): Promise<void> {
  const { registry } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  assertLifecycleError(
    () =>
      manager.markDegraded("okx", {
        reason: "Unavailable",
      }),
    "COMMAND_NOT_ALLOWED",
  );

  assertLifecycleError(
    () => manager.markRecovered("okx"),
    "COMMAND_NOT_ALLOWED",
  );
}

async function testManualFailureFlow(): Promise<void> {
  const { registry } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            700,
          ),
      },
    );

  await manager.start("okx");

  const failed =
    manager.markFailed("okx", {
      reason: "WebSocket disconnected",
      diagnostics: {
        reconnectAttempts: 5,
      },
    });

  assert.equal(
    failed.currentSnapshot.state,
    "FAILED",
  );

  assert.equal(
    failed.currentSnapshot.health.status,
    "UNHEALTHY",
  );

  assert.equal(
    failed.currentSnapshot.health.reason,
    "WebSocket disconnected",
  );

  const repeatedFailure =
    manager.markFailed("okx", {
      reason: "Still unavailable",
    });

  assert.equal(
    repeatedFailure.outcome,
    "NO_CHANGE",
  );

  assert.equal(
    repeatedFailure.currentSnapshot.health
      .reason,
    "Still unavailable",
  );
}

async function testInitializationFailure(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const cause =
    new Error("Authentication unavailable");

  connector.initializeFailure = cause;

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            800,
          ),
      },
    );

  const error =
    await assertLifecycleErrorAsync(
      () => manager.initialize("okx"),
      "INITIALIZATION_FAILED",
    );

  assert.equal(error.cause, cause);

  const snapshot =
    manager.inspect("okx");

  assert.equal(snapshot.state, "FAILED");
  assert.equal(
    snapshot.health.status,
    "UNHEALTHY",
  );

  assert.equal(
    snapshot.operationInProgress,
    false,
  );

  assert.deepEqual(
    manager
      .getTransitionHistory("okx")
      .map((transition) => transition.to),
    [
      "INITIALIZING",
      "FAILED",
    ],
  );
}

async function testStartFailure(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  connector.startFailure =
    new Error("REST session unavailable");

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  const error =
    await assertLifecycleErrorAsync(
      () => manager.start("okx"),
      "START_FAILED",
    );

  assert.equal(
    error.state,
    "FAILED",
  );

  assert.equal(
    manager.inspect("okx").state,
    "FAILED",
  );

  assert.equal(
    manager.inspect("okx")
      .operationInProgress,
    false,
  );
}

async function testStopFailure(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  await manager.start("okx");

  connector.stopFailure =
    new Error("Shutdown timeout");

  await assertLifecycleErrorAsync(
    () => manager.stop("okx"),
    "STOP_FAILED",
  );

  assert.equal(
    manager.inspect("okx").state,
    "FAILED",
  );

  assert.equal(
    manager.inspect("okx")
      .operationInProgress,
    false,
  );
}

async function testRestartFailure(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  await manager.start("okx");

  connector.startFailure =
    new Error("Restart startup failed");

  await assertLifecycleErrorAsync(
    () => manager.restart("okx"),
    "RESTART_FAILED",
  );

  assert.equal(
    manager.inspect("okx").state,
    "FAILED",
  );

  assert.equal(connector.stopCount, 1);
  assert.equal(connector.startCount, 2);
}

async function testHealthRefresh(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  connector.healthStatus = "DEGRADED";
  connector.healthReason =
    "Rate-limit pressure";
  connector.healthDiagnostics = {
    remainingRequests: 2,
  };

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(
            900,
          ),
      },
    );

  const snapshot =
    await manager.refreshHealth("okx");

  assert.equal(connector.healthCount, 1);

  assert.equal(
    snapshot.state,
    "UNINITIALIZED",
  );

  assert.equal(
    snapshot.health.status,
    "DEGRADED",
  );

  assert.equal(
    snapshot.health.reason,
    "Rate-limit pressure",
  );

  assert.deepEqual(
    snapshot.health.diagnostics,
    {
      remainingRequests: 2,
    },
  );
}

async function testHealthRefreshFailure(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  connector.healthFailure =
    new Error("Health endpoint unavailable");

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  const snapshot =
    await manager.refreshHealth("okx");

  assert.equal(
    snapshot.health.status,
    "UNHEALTHY",
  );

  assert.equal(
    snapshot.health.reason,
    "Connector health inspection failed.",
  );

  assert.deepEqual(
    snapshot.health.diagnostics,
    {
      error: "Health endpoint unavailable",
    },
  );
}

async function testConnectorWithoutHealthProvider(): Promise<void> {
  class ConnectorWithoutHealth
    implements ManagedConnectorLifecycleAdapter
  {
    public async initialize(): Promise<void> {
      return Promise.resolve();
    }

    public async start(): Promise<void> {
      return Promise.resolve();
    }

    public async stop(): Promise<void> {
      return Promise.resolve();
    }

    public async dispose(): Promise<void> {
      return Promise.resolve();
    }
  }

  const registry =
    new ExchangeRegistry<ConnectorWithoutHealth>();

  registry.register({
    exchangeId: "okx",
    connector:
      new ConnectorWithoutHealth(),
  });

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  const snapshot =
    await manager.refreshHealth("okx");

  assert.equal(
    snapshot.health.status,
    "UNKNOWN",
  );

  assert.equal(
    snapshot.health.reason,
    "Connector does not provide runtime health information.",
  );
}

async function testDisposeUninitializedConnector(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  const result =
    await manager.dispose("okx");

  assert.equal(connector.stopCount, 0);
  assert.equal(connector.disposeCount, 1);

  assert.equal(
    result.currentSnapshot.state,
    "DISPOSED",
  );

  assert.equal(
    result.currentSnapshot.health.status,
    "UNKNOWN",
  );

  assert.equal(
    result.currentSnapshot.health.reason,
    "Connector is disposed.",
  );

  const secondResult =
    await manager.dispose("okx");

  assert.equal(
    secondResult.outcome,
    "NO_CHANGE",
  );

  assert.equal(connector.disposeCount, 1);

  await assertLifecycleErrorAsync(
    () => manager.start("okx"),
    "CONNECTOR_ALREADY_DISPOSED",
  );

  assertLifecycleError(
    () =>
      manager.markFailed("okx", {
        reason: "Invalid after disposal",
      }),
    "CONNECTOR_ALREADY_DISPOSED",
  );

  await assertLifecycleErrorAsync(
    () => manager.refreshHealth("okx"),
    "CONNECTOR_ALREADY_DISPOSED",
  );
}

async function testDisposeRunningConnector(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  await manager.start("okx");

  const result =
    await manager.dispose("okx");

  assert.equal(connector.stopCount, 1);
  assert.equal(connector.disposeCount, 1);

  assert.equal(
    result.currentSnapshot.state,
    "DISPOSED",
  );

  assert.deepEqual(
    result.transitions.map(
      (transition) => transition.to,
    ),
    [
      "STOPPING",
      "STOPPED",
      "DISPOSED",
    ],
  );
}

async function testDisposalFailure(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  connector.disposeFailure =
    new Error("Resource release failed");

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  await assertLifecycleErrorAsync(
    () => manager.dispose("okx"),
    "DISPOSAL_FAILED",
  );

  assert.equal(
    manager.inspect("okx").state,
    "FAILED",
  );

  assert.equal(
    manager.inspect("okx")
      .operationInProgress,
    false,
  );
}

async function testConcurrentOperationProtection(): Promise<void> {
  const { registry, connector } =
    createRegistryWithConnector();

  const barrier =
    createDeferredPromise<void>();

  connector.initializeBarrier =
    barrier.promise;

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  const initialization =
    manager.initialize("okx");

  await Promise.resolve();

  const activeSnapshot =
    manager.inspect("okx");

  assert.equal(
    activeSnapshot.operationInProgress,
    true,
  );

  assert.equal(
    activeSnapshot.activeCommand,
    "INITIALIZE",
  );

  await assertLifecycleErrorAsync(
    () => manager.start("okx"),
    "LIFECYCLE_OPERATION_IN_PROGRESS",
  );

  assertLifecycleError(
    () =>
      manager.markFailed("okx", {
        reason: "Concurrent failure mark",
      }),
    "LIFECYCLE_OPERATION_IN_PROGRESS",
  );

  barrier.resolve();

  await initialization;

  assert.equal(
    manager.inspect("okx")
      .operationInProgress,
    false,
  );
}

async function testInspectAllRegistryOrder(): Promise<void> {
  const registry =
    new ExchangeRegistry<TestManagedConnector>();

  registry.register({
    exchangeId: "okx",
    connector:
      new TestManagedConnector(),
  });

  registry.register({
    exchangeId: "binance",
    connector:
      new TestManagedConnector(),
  });

  registry.register({
    exchangeId: "bybit",
    connector:
      new TestManagedConnector(),
  });

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  await manager.start("binance");
  await manager.initialize("bybit");

  const snapshots =
    manager.inspectAll();

  assert.ok(Object.isFrozen(snapshots));

  assert.deepEqual(
    snapshots.map(
      (snapshot) => snapshot.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  assert.deepEqual(
    snapshots.map(
      (snapshot) => snapshot.state,
    ),
    [
      "UNINITIALIZED",
      "RUNNING",
      "STOPPED",
    ],
  );
}

async function testUnregisteredConnectorErrors(): Promise<void> {
  const registry =
    new ExchangeRegistry<TestManagedConnector>();

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock:
          new DeterministicLifecycleClock(),
      },
    );

  const error =
    await assertLifecycleErrorAsync(
      () => manager.start("kraken"),
      "CONNECTOR_NOT_REGISTERED",
    );

  assert.equal(
    error.exchangeId,
    "kraken",
  );

  assertLifecycleError(
    () => manager.inspect("kraken"),
    "CONNECTOR_NOT_REGISTERED",
  );

  await assertLifecycleErrorAsync(
    () =>
      manager.start(
        "invalid/exchange",
      ),
    "INVALID_EXCHANGE_ID",
  );
}

async function testInvalidClock(): Promise<void> {
  const { registry } =
    createRegistryWithConnector();

  const invalidClock: ConnectorLifecycleClock = {
    now(): number {
      return Number.NaN;
    },
  };

  const manager =
    new ConnectorLifecycleManager(
      registry,
      {
        clock: invalidClock,
      },
    );

  assertLifecycleError(
    () => manager.inspect("okx"),
    "INVALID_TIMESTAMP",
  );
}

async function runConnectorLifecycleManagerTests(): Promise<void> {
  await testInitialInspection();
  await testExplicitInitialization();
  await testAutomaticInitializationAndStart();
  await testDisabledAutomaticInitialization();
  await testStopFlow();
  await testRestartFlow();
  await testRestartStoppedConnector();
  await testDegradedAndRecoveredFlow();
  await testInvalidDegradeAndRecoveryCommands();
  await testManualFailureFlow();
  await testInitializationFailure();
  await testStartFailure();
  await testStopFailure();
  await testRestartFailure();
  await testHealthRefresh();
  await testHealthRefreshFailure();
  await testConnectorWithoutHealthProvider();
  await testDisposeUninitializedConnector();
  await testDisposeRunningConnector();
  await testDisposalFailure();
  await testConcurrentOperationProtection();
  await testInspectAllRegistryOrder();
  await testUnregisteredConnectorErrors();
  await testInvalidClock();

  console.log(
    "All deterministic connector lifecycle manager tests passed successfully.",
  );
}

void runConnectorLifecycleManagerTests();