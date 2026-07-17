import assert from "node:assert/strict";

import {
  DeterministicMultiExchangeCoordinatorClock,
  MultiExchangeCoordinatorClockError,
} from "./multi-exchange-coordination/coordinator-clock";
import {
  DeterministicMultiExchangeCoordinatorEventIdGenerator,
  DeterministicMultiExchangeCoordinatorSequenceGenerator,
  MultiExchangeCoordinatorEventFactory,
  MultiExchangeCoordinatorSequenceError,
} from "./multi-exchange-coordination/coordinator-events";
import {
  MultiExchangeCoordinatorLifecycleController,
} from "./multi-exchange-coordination/coordinator-lifecycle";
import {
  MultiExchangeCoordinatorMetricsTracker,
} from "./multi-exchange-coordination/coordinator-metrics";
import {
  MultiExchangeCoordinatorObserverRegistry,
} from "./multi-exchange-coordination/coordinator-observers";
import {
  MultiExchangeCoordinatorStateMachine,
  MultiExchangeCoordinatorStateTransitionError,
  getAllowedCoordinatorStateTransitions,
} from "./multi-exchange-coordination/coordinator-state-machine";
import type {
  CoordinatorExchangeHealth,
  MultiExchangeCoordinatorEvent,
  MultiExchangeCoordinatorHealthSnapshot,
  MultiExchangeCoordinatorMetrics,
} from "./multi-exchange-coordination/coordinator-contracts";

const COORDINATOR_ID = "multi-exchange-coordinator";
const INSTANCE_ID = "multi-exchange-coordinator-instance-001";

function createHealthyExchange(
  exchangeId: string,
  observedAt: number,
  latencyMilliseconds: number,
): CoordinatorExchangeHealth {
  return Object.freeze({
    exchangeId,
    status: "HEALTHY",
    availability: "AVAILABLE",
    observedAt,
    lastSuccessfulRequestAt: observedAt,
    lastFailedRequestAt: null,
    consecutiveFailures: 0,
    latencyMilliseconds,
    errorRate: 0,
    reason: null,
  });
}

async function testDeterministicClock(): Promise<void> {
  const clock =
    new DeterministicMultiExchangeCoordinatorClock(1_000);

  assert.equal(clock.now(), 1_000);

  assert.equal(clock.advanceBy(250), 1_250);
  assert.equal(clock.now(), 1_250);

  assert.equal(clock.advanceTo(2_000), 2_000);
  assert.equal(clock.now(), 2_000);

  const snapshot = clock.snapshot();

  assert.deepEqual(snapshot, {
    timestamp: 2_000,
  });

  assert.equal(Object.isFrozen(snapshot), true);

  assert.equal(clock.reset(500), 500);
  assert.equal(clock.now(), 500);

  assert.throws(
    () => clock.advanceTo(499),
    MultiExchangeCoordinatorClockError,
  );

  assert.throws(
    () => clock.advanceBy(-1),
    MultiExchangeCoordinatorClockError,
  );

  assert.throws(
    () => clock.reset(Number.NaN),
    MultiExchangeCoordinatorClockError,
  );

  const overflowClock =
    new DeterministicMultiExchangeCoordinatorClock(
      Number.MAX_SAFE_INTEGER,
    );

  assert.throws(
    () => overflowClock.advanceBy(1),
    MultiExchangeCoordinatorClockError,
  );
}

async function testCoordinatorStateMachine(): Promise<void> {
  const clock =
    new DeterministicMultiExchangeCoordinatorClock(10_000);

  const stateMachine =
    new MultiExchangeCoordinatorStateMachine(clock);

  assert.equal(stateMachine.getState(), "CREATED");

  assert.deepEqual(
    getAllowedCoordinatorStateTransitions("CREATED"),
    ["STARTING", "DISPOSED"],
  );

  clock.advanceBy(10);

  const startingTransition =
    stateMachine.transitionTo("STARTING");

  assert.deepEqual(startingTransition, {
    previousState: "CREATED",
    currentState: "STARTING",
    changedAt: 10_010,
    failureReason: null,
  });

  clock.advanceBy(10);

  stateMachine.transitionTo("RUNNING");

  assert.deepEqual(stateMachine.getSnapshot(), {
    state: "RUNNING",
    previousState: "STARTING",
    stateChangedAt: 10_020,
    startedAt: 10_020,
    pausedAt: null,
    stoppedAt: null,
    failureReason: null,
  });

  clock.advanceBy(10);

  stateMachine.transitionTo(
    "DEGRADED",
    "Only one exchange is healthy.",
  );

  assert.deepEqual(stateMachine.getSnapshot(), {
    state: "DEGRADED",
    previousState: "RUNNING",
    stateChangedAt: 10_030,
    startedAt: 10_020,
    pausedAt: null,
    stoppedAt: null,
    failureReason: "Only one exchange is healthy.",
  });

  clock.advanceBy(10);

  stateMachine.transitionTo("RUNNING");

  assert.equal(
    stateMachine.getSnapshot().failureReason,
    null,
  );

  assert.throws(
    () => stateMachine.transitionTo("DISPOSED"),
    MultiExchangeCoordinatorStateTransitionError,
  );
}

async function testSequenceAndEventFactory(): Promise<void> {
  const clock =
    new DeterministicMultiExchangeCoordinatorClock(20_000);

  const sequenceGenerator =
    new DeterministicMultiExchangeCoordinatorSequenceGenerator();

  const eventIdGenerator =
    new DeterministicMultiExchangeCoordinatorEventIdGenerator(
      "test-event",
    );

  const eventFactory =
    new MultiExchangeCoordinatorEventFactory(
      {
        coordinatorId: COORDINATOR_ID,
        instanceId: INSTANCE_ID,
      },
      clock,
      sequenceGenerator,
      eventIdGenerator,
    );

  const firstEvent = eventFactory.create({
    eventType: "COORDINATOR_CREATED",
    correlationId: "correlation-001",
    payload: Object.freeze({
      state: "CREATED",
    }),
    metadata: Object.freeze({
      environment: "test",
    }),
  });

  assert.deepEqual(firstEvent, {
    eventId: "test-event-000000000001",
    eventType: "COORDINATOR_CREATED",
    coordinatorId: COORDINATOR_ID,
    instanceId: INSTANCE_ID,
    correlationId: "correlation-001",
    causationId: null,
    sequence: 1,
    occurredAt: 20_000,
    payload: {
      state: "CREATED",
    },
    metadata: {
      environment: "test",
    },
  });

  assert.equal(Object.isFrozen(firstEvent), true);
  assert.equal(Object.isFrozen(firstEvent.metadata), true);

  clock.advanceBy(100);

  const secondEvent = eventFactory.create({
    eventType: "COORDINATOR_STARTING",
    causationId: firstEvent.eventId,
    payload: Object.freeze({
      state: "STARTING",
    }),
  });

  assert.equal(
    secondEvent.eventId,
    "test-event-000000000002",
  );
  assert.equal(secondEvent.sequence, 2);
  assert.equal(secondEvent.occurredAt, 20_100);
  assert.equal(secondEvent.causationId, firstEvent.eventId);
  assert.equal(eventFactory.getCurrentSequence(), 2);

  sequenceGenerator.reset(Number.MAX_SAFE_INTEGER);

  assert.throws(
    () => sequenceGenerator.next(),
    MultiExchangeCoordinatorSequenceError,
  );
}

async function testObserverRegistry(): Promise<void> {
  const registry =
    new MultiExchangeCoordinatorObserverRegistry();

  const eventDeliveryOrder: string[] = [];
  const metricsDeliveryOrder: string[] = [];
  const healthDeliveryOrder: string[] = [];

  const firstEventObserver = {
    onEvent(
      event: MultiExchangeCoordinatorEvent,
    ): void {
      eventDeliveryOrder.push(
        `first:${event.eventType}`,
      );
    },
  };

  const secondEventObserver = {
    async onEvent(
      event: MultiExchangeCoordinatorEvent,
    ): Promise<void> {
      eventDeliveryOrder.push(
        `second:${event.eventType}`,
      );
    },
  };

  const failingEventObserver = {
    onEvent(): void {
      throw new Error("Observer failure");
    },
  };

  const metricsObserver = {
    onMetrics(
      metrics: MultiExchangeCoordinatorMetrics,
    ): void {
      metricsDeliveryOrder.push(metrics.state);
    },
  };

  const healthObserver = {
    onHealthChanged(
      health: MultiExchangeCoordinatorHealthSnapshot,
    ): void {
      healthDeliveryOrder.push(health.status);
    },
  };

  assert.equal(
    registry.addObserver(firstEventObserver),
    true,
  );
  assert.equal(
    registry.addObserver(firstEventObserver),
    false,
  );
  assert.equal(
    registry.addObserver(secondEventObserver),
    true,
  );
  assert.equal(
    registry.addObserver(failingEventObserver),
    true,
  );

  registry.addMetricsObserver(metricsObserver);
  registry.addHealthObserver(healthObserver);

  assert.equal(registry.getObserverCount(), 3);
  assert.equal(registry.getMetricsObserverCount(), 1);
  assert.equal(registry.getHealthObserverCount(), 1);

  const eventResult = await registry.notifyEvent({
    eventId: "event-001",
    eventType: "COORDINATOR_CREATED",
    coordinatorId: COORDINATOR_ID,
    instanceId: INSTANCE_ID,
    correlationId: null,
    causationId: null,
    sequence: 1,
    occurredAt: 30_000,
    payload: Object.freeze({}),
    metadata: Object.freeze({}),
  });

  assert.deepEqual(eventDeliveryOrder, [
    "first:COORDINATOR_CREATED",
    "second:COORDINATOR_CREATED",
  ]);

  assert.equal(eventResult.notifiedObservers, 3);
  assert.equal(eventResult.failedObservers, 1);
  assert.equal(eventResult.errors.length, 1);

  await registry.notifyMetrics({
    coordinatorId: COORDINATOR_ID,
    instanceId: INSTANCE_ID,
    state: "RUNNING",
    healthStatus: "HEALTHY",
    counters: Object.freeze({
      requestsReceived: 0,
      requestsCompleted: 0,
      requestsPartiallyCompleted: 0,
      requestsRejected: 0,
      requestsFailed: 0,
      executionsStarted: 0,
      executionsSucceeded: 0,
      executionsPartiallySucceeded: 0,
      executionsFailed: 0,
      executionAttempts: 0,
      retries: 0,
      failovers: 0,
      quarantines: 0,
      recoveries: 0,
    }),
    quantities: Object.freeze({
      requestedQuantity: 0,
      acceptedQuantity: 0,
      filledQuantity: 0,
      rejectedQuantity: 0,
      unallocatedQuantity: 0,
    }),
    latency: Object.freeze({
      minimumExecutionLatencyMilliseconds: null,
      maximumExecutionLatencyMilliseconds: null,
      averageExecutionLatencyMilliseconds: null,
      totalExecutionLatencyMilliseconds: 0,
      measuredExecutions: 0,
    }),
    exchanges: Object.freeze([]),
    activeRequests: 0,
    activeExecutions: 0,
    collectedAt: 30_000,
  });

  await registry.notifyHealthChanged({
    coordinatorId: COORDINATOR_ID,
    instanceId: INSTANCE_ID,
    coordinatorState: "RUNNING",
    status: "HEALTHY",
    exchanges: Object.freeze([]),
    healthyExchangeCount: 0,
    degradedExchangeCount: 0,
    unhealthyExchangeCount: 0,
    unavailableExchangeCount: 0,
    observedAt: 30_000,
    reason: null,
  });

  assert.deepEqual(metricsDeliveryOrder, ["RUNNING"]);
  assert.deepEqual(healthDeliveryOrder, ["HEALTHY"]);

  assert.equal(
    registry.removeObserver(failingEventObserver),
    true,
  );

  registry.clearAll();

  assert.equal(registry.getObserverCount(), 0);
  assert.equal(registry.getMetricsObserverCount(), 0);
  assert.equal(registry.getHealthObserverCount(), 0);
}

async function testCoordinatorMetrics(): Promise<void> {
  const clock =
    new DeterministicMultiExchangeCoordinatorClock(40_000);

  const metrics =
    new MultiExchangeCoordinatorMetricsTracker(
      {
        coordinatorId: COORDINATOR_ID,
        instanceId: INSTANCE_ID,
      },
      clock,
    );

  const binanceHealth = createHealthyExchange(
    "BINANCE",
    clock.now(),
    45,
  );

  const okxHealth = createHealthyExchange(
    "OKX",
    clock.now(),
    60,
  );

  metrics.registerExchange({
    exchangeId: "BINANCE",
    health: binanceHealth,
  });

  metrics.registerExchange({
    exchangeId: "OKX",
    health: okxHealth,
  });

  metrics.setCoordinatorState("RUNNING");
  metrics.setHealthStatus("HEALTHY");

  metrics.recordRequestReceived();
  metrics.recordExecutionStarted();

  clock.advanceBy(80);

  metrics.recordExecutionObservation({
    exchangeId: "BINANCE",
    succeeded: true,
    requestedQuantity: 1,
    acceptedQuantity: 1,
    filledQuantity: 1,
    rejectedQuantity: 0,
    unallocatedQuantity: 0,
    latencyMilliseconds: 80,
  });

  metrics.recordExecutionSucceeded();
  metrics.recordRequestCompleted();

  metrics.recordRequestReceived();
  metrics.recordExecutionStarted();

  clock.advanceBy(120);

  metrics.recordExecutionObservation({
    exchangeId: "OKX",
    succeeded: false,
    requestedQuantity: 2,
    acceptedQuantity: 0,
    filledQuantity: 0,
    rejectedQuantity: 2,
    unallocatedQuantity: 0,
    latencyMilliseconds: 120,
  });

  metrics.recordRetry();
  metrics.recordFailover();
  metrics.recordQuarantine();
  metrics.recordExecutionFailed();
  metrics.recordRequestFailed();

  const snapshot = metrics.getMetrics();

  assert.equal(snapshot.state, "RUNNING");
  assert.equal(snapshot.healthStatus, "HEALTHY");
  assert.equal(snapshot.activeRequests, 0);
  assert.equal(snapshot.activeExecutions, 0);

  assert.deepEqual(snapshot.counters, {
    requestsReceived: 2,
    requestsCompleted: 1,
    requestsPartiallyCompleted: 0,
    requestsRejected: 0,
    requestsFailed: 1,
    executionsStarted: 2,
    executionsSucceeded: 1,
    executionsPartiallySucceeded: 0,
    executionsFailed: 1,
    executionAttempts: 2,
    retries: 1,
    failovers: 1,
    quarantines: 1,
    recoveries: 0,
  });

  assert.deepEqual(snapshot.quantities, {
    requestedQuantity: 3,
    acceptedQuantity: 1,
    filledQuantity: 1,
    rejectedQuantity: 2,
    unallocatedQuantity: 0,
  });

  assert.deepEqual(snapshot.latency, {
    minimumExecutionLatencyMilliseconds: 80,
    maximumExecutionLatencyMilliseconds: 120,
    averageExecutionLatencyMilliseconds: 100,
    totalExecutionLatencyMilliseconds: 200,
    measuredExecutions: 2,
  });

  assert.equal(snapshot.exchanges.length, 2);
  assert.equal(snapshot.exchanges[0]?.exchangeId, "BINANCE");
  assert.equal(snapshot.exchanges[1]?.exchangeId, "OKX");

  assert.equal(
    snapshot.exchanges[0]?.successfulExecutions,
    1,
  );
  assert.equal(
    snapshot.exchanges[1]?.failedExecutions,
    1,
  );

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.counters), true);
  assert.equal(Object.isFrozen(snapshot.quantities), true);
  assert.equal(Object.isFrozen(snapshot.latency), true);
  assert.equal(Object.isFrozen(snapshot.exchanges), true);

  assert.throws(
    () =>
      metrics.recordExecutionObservation({
        exchangeId: "BYBIT",
        succeeded: true,
        requestedQuantity: 1,
        acceptedQuantity: 1,
        filledQuantity: 1,
        rejectedQuantity: 0,
        unallocatedQuantity: 0,
        latencyMilliseconds: 10,
      }),
    /not registered/,
  );
}

async function testCoordinatorLifecycle(): Promise<void> {
  const clock =
    new DeterministicMultiExchangeCoordinatorClock(50_000);

  const stateMachine =
    new MultiExchangeCoordinatorStateMachine(clock);

  const observerRegistry =
    new MultiExchangeCoordinatorObserverRegistry();

  const events: MultiExchangeCoordinatorEvent[] = [];

  observerRegistry.addObserver({
    onEvent(
      event: MultiExchangeCoordinatorEvent,
    ): void {
      events.push(event);
    },
  });

  const eventFactory =
    new MultiExchangeCoordinatorEventFactory(
      {
        coordinatorId: COORDINATOR_ID,
        instanceId: INSTANCE_ID,
      },
      clock,
      new DeterministicMultiExchangeCoordinatorSequenceGenerator(),
      new DeterministicMultiExchangeCoordinatorEventIdGenerator(
        "lifecycle-event",
      ),
    );

  const lifecycle =
    new MultiExchangeCoordinatorLifecycleController(
      stateMachine,
      eventFactory,
      observerRegistry,
    );

  clock.advanceBy(10);

  const runningSnapshot = await lifecycle.start();

  assert.equal(runningSnapshot.state, "RUNNING");
  assert.equal(events.length, 2);
  assert.equal(
    events[0]?.eventType,
    "COORDINATOR_STARTING",
  );
  assert.equal(
    events[1]?.eventType,
    "COORDINATOR_STARTED",
  );

  clock.advanceBy(10);

  const degradedSnapshot =
    await lifecycle.markDegraded(
      "Reduced healthy exchange capacity.",
    );

  assert.equal(degradedSnapshot.state, "DEGRADED");
  assert.equal(
    degradedSnapshot.failureReason,
    "Reduced healthy exchange capacity.",
  );

  clock.advanceBy(10);

  const recoveredSnapshot =
    await lifecycle.markRecovered();

  assert.equal(recoveredSnapshot.state, "RUNNING");
  assert.equal(recoveredSnapshot.failureReason, null);

  clock.advanceBy(10);

  const pausedSnapshot = await lifecycle.pause();

  assert.equal(pausedSnapshot.state, "PAUSED");

  clock.advanceBy(10);

  const resumedSnapshot = await lifecycle.resume();

  assert.equal(resumedSnapshot.state, "RUNNING");

  clock.advanceBy(10);

  const stoppedSnapshot = await lifecycle.stop();

  assert.equal(stoppedSnapshot.state, "STOPPED");

  clock.advanceBy(10);

  const restartedSnapshot = await lifecycle.start();

  assert.equal(restartedSnapshot.state, "RUNNING");

  clock.advanceBy(10);

  const disposedSnapshot = await lifecycle.dispose();

  assert.equal(disposedSnapshot.state, "DISPOSED");
  assert.equal(observerRegistry.getObserverCount(), 0);

  assert.deepEqual(
    events.map((event) => event.eventType),
    [
      "COORDINATOR_STARTING",
      "COORDINATOR_STARTED",
      "COORDINATOR_DEGRADED",
      "COORDINATOR_STARTED",
      "COORDINATOR_PAUSING",
      "COORDINATOR_PAUSED",
      "COORDINATOR_STARTING",
      "COORDINATOR_RESUMED",
      "COORDINATOR_STOPPING",
      "COORDINATOR_STOPPED",
      "COORDINATOR_STARTING",
      "COORDINATOR_STARTED",
      "COORDINATOR_STOPPING",
      "COORDINATOR_STOPPED",
      "COORDINATOR_DISPOSED",
    ],
  );

  assert.deepEqual(
    events.map((event) => event.sequence),
    [
      1, 2, 3, 4, 5,
      6, 7, 8, 9, 10,
      11, 12, 13, 14, 15,
    ],
  );
}

async function run(): Promise<void> {
  await testDeterministicClock();
  await testCoordinatorStateMachine();
  await testSequenceAndEventFactory();
  await testObserverRegistry();
  await testCoordinatorMetrics();
  await testCoordinatorLifecycle();

  console.log(
    "All Multi-Exchange Coordinator Phase 1 deterministic tests passed successfully.",
  );
}

void run().catch((error: unknown) => {
  console.error(
    "Multi-Exchange Coordinator Phase 1 deterministic tests failed.",
  );
  console.error(error);

  process.exitCode = 1;
});