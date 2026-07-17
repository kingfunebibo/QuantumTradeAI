/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * Deterministic Streaming Orchestrator Tests
 *
 * Coverage:
 * - Complete event-processing pipeline
 * - Sequence initialization and validation
 * - Event ordering and release
 * - Latency recording
 * - Stream-health updates
 * - Backpressure admission and acknowledgement
 * - Deterministic stream routing
 * - Duplicate concurrent-operation protection
 * - Invalid-sequence rejection
 * - Maintenance-cycle execution
 * - Immutable snapshots
 */

import assert from "node:assert/strict";

import {
  BackpressureController,
  EventOrderingBuffer,
  LatencyMonitor,
  SequenceValidator,
  StreamHealthMonitor,
  StreamRouter,
  StreamingOrchestrator,
  StreamingSubscriptionRegistry,
  UnifiedStreamEvent,
  UnifiedStreamingSubscription,
  createSequenceStreamKey,
} from "./exchange-connectivity/streaming";

interface DeterministicClock {
  now(): number;
  set(timestamp: number): void;
  advance(milliseconds: number): void;
}

function createClock(
  initialTimestamp = 1_700_000_000_000,
): DeterministicClock {
  let currentTimestamp = initialTimestamp;

  return {
    now(): number {
      return currentTimestamp;
    },

    set(timestamp: number): void {
      assert.ok(
        Number.isFinite(timestamp) &&
          timestamp >= 0,
        "Clock timestamp must be non-negative and finite.",
      );

      currentTimestamp = timestamp;
    },

    advance(milliseconds: number): void {
      assert.ok(
        Number.isFinite(milliseconds) &&
          milliseconds >= 0,
        "Clock advancement must be non-negative and finite.",
      );

      currentTimestamp += milliseconds;
    },
  };
}

function createSubscription(
  overrides: Partial<UnifiedStreamingSubscription> = {},
): UnifiedStreamingSubscription {
  return Object.freeze({
    subscriptionId: "subscription-okx-btc-trades",
    exchangeId: "OKX",
    scope: "PUBLIC",
    channel: "TRADES",
    symbol: "BTC-USDT",
    parameters: Object.freeze({}),
    metadata: Object.freeze({
      source: "streaming-orchestrator-test",
    }),
    ...overrides,
  });
}

function createEvent(
  clock: DeterministicClock,
  overrides: Partial<UnifiedStreamEvent> = {},
): UnifiedStreamEvent {
  const receivedAt: number =
    overrides.receivedAt ?? clock.now();

  const exchangeTimestamp: number =
    overrides.exchangeTimestamp ??
    receivedAt - 20;

  const normalizedAt: number =
    overrides.normalizedAt ?? receivedAt;

  const event: UnifiedStreamEvent = {
    eventId:
      overrides.eventId ??
      "event-okx-btc-000001",

    exchangeId:
      overrides.exchangeId ?? "OKX",

    connectionId:
      overrides.connectionId ??
      "connection-okx-public-001",

    subscriptionId:
      overrides.subscriptionId,

    channel:
      overrides.channel ?? "TRADES",

    symbol:
      overrides.symbol ?? "BTC-USDT",

    type:
      overrides.type ?? "TRADE",

    sequence:
      overrides.sequence ?? 1,

    exchangeTimestamp,
    receivedAt,
    normalizedAt,

    payload:
      overrides.payload ??
      Object.freeze({
        tradeId: "trade-000001",
        price: "65000.00",
        quantity: "0.125",
        side: "BUY",
      }),

    metadata:
      overrides.metadata ??
      Object.freeze({
        test: true,
      }),
  };

  return Object.freeze(event);
}

interface TestRuntime {
  readonly clock: DeterministicClock;
  readonly sequenceValidator: SequenceValidator;
  readonly orderingBuffer: EventOrderingBuffer;
  readonly latencyMonitor: LatencyMonitor;
  readonly healthMonitor: StreamHealthMonitor;
  readonly backpressureController: BackpressureController;
  readonly subscriptionRegistry: StreamingSubscriptionRegistry;
  readonly streamRouter: StreamRouter;
  readonly orchestrator: StreamingOrchestrator;
  readonly deliveredEvents: UnifiedStreamEvent[];
  readonly consumerId: string;
  readonly subscription: UnifiedStreamingSubscription;
  readonly connectionId: string;
}

function createRuntime(): TestRuntime {
  const clock = createClock();

  const sequenceValidator = new SequenceValidator(
    {
      mode: "STRICT",
      expectedIncrement: 1,
      gapAction: "REJECT",
      duplicateAction: "REJECT",
      staleAction: "REJECT",
      allowUnsequencedEvents: false,
      snapshotResetsSequence: true,
      maxAllowedGap: 0,
    },
    clock,
  );

  const orderingBuffer = new EventOrderingBuffer(
    {
      mode: "SEQUENCE",
      maxTotalBufferedEvents: 1_000,
      maxBufferedEventsPerStream: 100,
      maxBufferAgeMs: 5_000,
      maxTimestampLatenessMs: 2_000,
      expectedSequenceIncrement: 1,
      overflowPolicy: "REJECT_NEWEST",
      lateEventPolicy: "DROP",
      gapPolicy: "WAIT",
      rejectDuplicateEventIds: true,
      rejectDuplicateSequences: true,
    },
    clock,
  );

  const latencyMonitor = new LatencyMonitor(
    {
      maxSamplesPerScope: 100,
      rollingWindowMs: 60_000,
      minimumSamplesForAggregateAlerts: 2,
      thresholds: {
        warningLatencyMs: 250,
        criticalLatencyMs: 1_000,
        warningJitterMs: 100,
        criticalJitterMs: 500,
      },
    },
    clock,
  );

  const healthMonitor = new StreamHealthMonitor(
    {
      degradedAfterInactivityMs: 30_000,
      unhealthyAfterInactivityMs: 90_000,
      degradedSignalsForUnhealthy: 3,
      unhealthySignalsForUnhealthy: 1,
      failFastOnCriticalSignal: true,
    },
    clock,
  );

  const backpressureController =
    new BackpressureController(
      {
        maxGlobalPendingEvents: 1_000,
        defaultMaxPendingEventsPerConsumer: 100,
        defaultHighWatermarkRatio: 0.8,
        defaultLowWatermarkRatio: 0.5,
        defaultAcknowledgementTimeoutMs: 10_000,
        defaultDrainBatchSize: 10,
        defaultOverflowPolicy: "PAUSE_CONSUMER",
        defaultTimeoutAction: "MARK_DEGRADED",
      },
      clock,
    );

  const subscriptionRegistry =
    new StreamingSubscriptionRegistry(clock);

  const streamRouter = new StreamRouter(
    subscriptionRegistry,
    {
      propagateListenerErrors: false,
      requireActiveSubscription: true,
      validateExplicitSubscriptionId: true,
    },
    clock,
  );

  const consumerId = "market-data-consumer";

  const connectionId =
    "connection-okx-public-001";

  const subscription = createSubscription();

  subscriptionRegistry.register({
    subscription,
    connectionId,
    state: "ACTIVE",
  });

  backpressureController.register({
    consumerId,
    exchangeId: "OKX",
    connectionId,
    maxPendingEvents: 100,
    highWatermarkRatio: 0.8,
    lowWatermarkRatio: 0.5,
    acknowledgementTimeoutMs: 10_000,
    drainBatchSize: 10,
    overflowPolicy: "PAUSE_CONSUMER",
    timeoutAction: "MARK_DEGRADED",
  });

  const deliveredEvents: UnifiedStreamEvent[] = [];

  streamRouter.registerRoute({
    routeId: "okx-btc-trade-route",
    priority: 1,
    enabled: true,
    filter: {
      subscriptionIds: [
        subscription.subscriptionId,
      ],
      exchangeIds: ["OKX"],
      connectionIds: [connectionId],
      channels: ["TRADES"],
      symbols: ["BTC-USDT"],
      eventTypes: ["TRADE"],
    },
    listener: (
      event: UnifiedStreamEvent,
    ): void => {
      deliveredEvents.push(event);
    },
  });

  const initialEvent = createEvent(clock);

  const streamKey =
    createSequenceStreamKey(initialEvent);

  healthMonitor.register({
    streamKey,
    exchangeId: "OKX",
    connectionId,
    channel: "TRADES",
    symbol: "BTC-USDT",
    eventType: "TRADE",
    subscriptionId:
      subscription.subscriptionId,
    metadata: {
      test: true,
    },
  });

  healthMonitor.updateConnection({
    streamKey,
    state: "CONNECTED",
    occurredAt: clock.now(),
  });

  healthMonitor.updateSubscription({
    streamKey,
    state: "ACTIVE",
    occurredAt: clock.now(),
  });

  const orchestrator = new StreamingOrchestrator(
    {
      sequenceValidator,
      orderingBuffer,
      latencyMonitor,
      healthMonitor,
      backpressureController,
      streamRouter,
    },
    {
      defaultConsumerId: consumerId,
      rejectInvalidSequences: true,
      failOnRoutingError: true,
      updateHealthOnFailure: true,
      allowRoutingWithoutConsumer: false,
      maxReleasedEventsPerOperation: 100,
    },
    clock,
  );

  return {
    clock,
    sequenceValidator,
    orderingBuffer,
    latencyMonitor,
    healthMonitor,
    backpressureController,
    subscriptionRegistry,
    streamRouter,
    orchestrator,
    deliveredEvents,
    consumerId,
    subscription,
    connectionId,
  };
}

async function testCompletePipeline(): Promise<void> {
  const runtime = createRuntime();

  const event = createEvent(runtime.clock, {
    subscriptionId:
      runtime.subscription.subscriptionId,
  });

  const result =
    await runtime.orchestrator.process({
      event,
      consumerId: runtime.consumerId,
      processingStartedAt:
        runtime.clock.now(),
    });

  assert.equal(
    result.status,
    "ROUTED",
    "The valid event should complete routing.",
  );

  assert.equal(
    result.sequenceResult?.status,
    "INITIALIZED",
    "The first sequence should initialize sequence state.",
  );

  assert.equal(
    result.sequenceResult?.accepted,
    true,
  );

  assert.equal(
    result.orderingResult?.status,
    "RELEASED",
    "The first sequenced event should be released immediately.",
  );

  assert.deepEqual(
    result.releasedEventIds,
    [event.eventId],
  );

  assert.equal(
    result.routingResults.length,
    1,
  );

  assert.equal(
    result.routingResults[0]?.status,
    "ROUTED",
  );

  assert.equal(
    runtime.deliveredEvents.length,
    1,
  );

  assert.equal(
    runtime.deliveredEvents[0]?.eventId,
    event.eventId,
  );

  assert.equal(
    result.admissionResult?.status,
    "ACCEPTED",
  );

  assert.equal(
    result.drainResult?.entries.length,
    1,
  );

  assert.equal(
    result.failures.length,
    0,
  );

  const backpressureSnapshot =
    runtime.backpressureController.getSnapshot();

  assert.equal(
    backpressureSnapshot.totalQueuedEvents,
    0,
    "Routed events must not remain queued.",
  );

  assert.equal(
    backpressureSnapshot.totalInFlightEvents,
    0,
    "Successfully routed events must be acknowledged.",
  );

  const latencySnapshot =
    runtime.latencyMonitor.getSnapshot();

  assert.equal(
    latencySnapshot.totalSamples,
    1,
  );

  assert.equal(
    latencySnapshot.exchangeCount,
    1,
  );

  assert.equal(
    latencySnapshot.connectionCount,
    1,
  );

  assert.equal(
    latencySnapshot.streamCount,
    1,
  );

  const healthSnapshot =
    runtime.healthMonitor.getStream(
      result.streamKey,
    );

  assert.ok(healthSnapshot);

  assert.notEqual(
    healthSnapshot.status,
    "UNHEALTHY",
  );

  runtime.orchestrator.dispose();
}

async function testSequentialEvents(): Promise<void> {
  const runtime = createRuntime();

  const firstEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-sequential-000001",
      sequence: 1,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  const firstResult =
    await runtime.orchestrator.process({
      event: firstEvent,
      consumerId: runtime.consumerId,
    });

  assert.equal(
    firstResult.status,
    "ROUTED",
  );

  runtime.clock.advance(25);

  const secondEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-sequential-000002",
      sequence: 2,
      exchangeTimestamp:
        runtime.clock.now() - 15,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  const secondResult =
    await runtime.orchestrator.process({
      event: secondEvent,
      consumerId: runtime.consumerId,
      previousSequence: 1,
    });

  assert.equal(
    secondResult.status,
    "ROUTED",
  );

  assert.equal(
    secondResult.sequenceResult?.status,
    "ACCEPTED",
  );

  assert.equal(
    runtime.deliveredEvents.length,
    2,
  );

  assert.deepEqual(
    runtime.deliveredEvents.map(
      (event) => event.sequence,
    ),
    [1, 2],
  );

  const sequenceSnapshot =
    runtime.sequenceValidator.getSnapshot();

  assert.equal(
    sequenceSnapshot.acceptedEvents,
    2,
  );

  assert.equal(
    sequenceSnapshot.rejectedEvents,
    0,
  );

  runtime.orchestrator.dispose();
}

async function testSequenceGapRejection():
Promise<void> {
  const runtime = createRuntime();

  const firstEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-gap-000001",
      sequence: 1,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  const firstResult =
    await runtime.orchestrator.process({
      event: firstEvent,
      consumerId: runtime.consumerId,
    });

  assert.equal(
    firstResult.status,
    "ROUTED",
  );

  runtime.clock.advance(25);

  const gapEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-gap-000003",
      sequence: 3,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  const gapResult =
    await runtime.orchestrator.process({
      event: gapEvent,
      consumerId: runtime.consumerId,
      previousSequence: 1,
    });

  assert.equal(
    gapResult.status,
    "REJECTED",
  );

  assert.equal(
    gapResult.sequenceResult?.status,
    "GAP",
  );

  assert.equal(
    gapResult.sequenceResult?.accepted,
    false,
  );

  assert.equal(
    runtime.deliveredEvents.length,
    1,
    "Rejected gap events must not be routed.",
  );

  assert.equal(
    runtime.orderingBuffer.bufferedEventCount,
    0,
    "Rejected sequence events must not enter the ordering buffer.",
  );

  const healthSnapshot =
    runtime.healthMonitor.getStream(
      gapResult.streamKey,
    );

  assert.ok(healthSnapshot);

  const sequenceSignal =
    healthSnapshot.signals.find(
      (signal) =>
        signal.signalType === "SEQUENCE",
    );

  assert.equal(
    sequenceSignal?.status,
    "UNHEALTHY",
  );

  runtime.orchestrator.dispose();
}

async function testConcurrentDuplicateOperation():
Promise<void> {
  const runtime = createRuntime();

  const event = createEvent(runtime.clock, {
    eventId: "event-concurrent-000001",
    sequence: 1,
    subscriptionId:
      runtime.subscription.subscriptionId,
  });

  const firstPromise =
    runtime.orchestrator.process({
      event,
      consumerId: runtime.consumerId,
    });

  const secondPromise =
    runtime.orchestrator.process({
      event,
      consumerId: runtime.consumerId,
    });

  assert.strictEqual(
    firstPromise,
    secondPromise,
    "Concurrent processing calls for the same event must share one promise.",
  );

  const [firstResult, secondResult] =
    await Promise.all([
      firstPromise,
      secondPromise,
    ]);

  assert.strictEqual(
    firstResult,
    secondResult,
    "Concurrent callers must receive the same immutable result.",
  );

  assert.equal(
    runtime.deliveredEvents.length,
    1,
    "The event must only be delivered once.",
  );

  assert.equal(
    runtime.orchestrator.getSnapshot()
      .totalOperations,
    1,
    "Only one underlying operation must execute.",
  );

  runtime.orchestrator.dispose();
}

async function testProcessAllDeterministicOrder():
Promise<void> {
  const runtime = createRuntime();

  const firstEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-batch-000001",
      sequence: 1,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  runtime.clock.advance(10);

  const secondEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-batch-000002",
      sequence: 2,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  runtime.clock.advance(10);

  const thirdEvent = createEvent(
    runtime.clock,
    {
      eventId: "event-batch-000003",
      sequence: 3,
      subscriptionId:
        runtime.subscription.subscriptionId,
    },
  );

  const results =
    await runtime.orchestrator.processAll([
      {
        event: firstEvent,
        consumerId: runtime.consumerId,
      },
      {
        event: secondEvent,
        consumerId: runtime.consumerId,
        previousSequence: 1,
      },
      {
        event: thirdEvent,
        consumerId: runtime.consumerId,
        previousSequence: 2,
      },
    ]);

  assert.equal(
    results.length,
    3,
  );

  assert.deepEqual(
    results.map(
      (result) => result.status,
    ),
    [
      "ROUTED",
      "ROUTED",
      "ROUTED",
    ],
  );

  assert.deepEqual(
    runtime.deliveredEvents.map(
      (event) => event.eventId,
    ),
    [
      firstEvent.eventId,
      secondEvent.eventId,
      thirdEvent.eventId,
    ],
  );

  runtime.orchestrator.dispose();
}

async function testMaintenanceCycle():
Promise<void> {
  const runtime = createRuntime();

  const tickResult =
    await runtime.orchestrator.tick();

  assert.ok(
    Number.isFinite(
      tickResult.processedAt,
    ),
  );

  assert.equal(
    tickResult.failures.length,
    0,
  );

  assert.equal(
    tickResult.expiredOrderingEvents.length,
    0,
  );

  assert.equal(
    tickResult.expiredRoutingResults.length,
    0,
  );

  assert.equal(
    tickResult.healthSnapshot.totalStreams,
    1,
  );

  const snapshot =
    runtime.orchestrator.getSnapshot();

  assert.equal(
    snapshot.maintenanceCycles,
    1,
  );

  assert.equal(
    snapshot.totalOperations,
    1,
  );

  runtime.orchestrator.dispose();
}

async function testImmutableSnapshots():
Promise<void> {
  const runtime = createRuntime();

  const event = createEvent(runtime.clock, {
    eventId: "event-immutable-000001",
    sequence: 1,
    subscriptionId:
      runtime.subscription.subscriptionId,
  });

  const result =
    await runtime.orchestrator.process({
      event,
      consumerId: runtime.consumerId,
    });

  assert.ok(
    Object.isFrozen(result),
  );

  assert.ok(
    Object.isFrozen(
      result.routingResults,
    ),
  );

  assert.ok(
    Object.isFrozen(result.failures),
  );

  assert.ok(
    Object.isFrozen(
      result.releasedEventIds,
    ),
  );

  const snapshot =
    runtime.orchestrator.getSnapshot();

  assert.ok(
    Object.isFrozen(snapshot),
  );

  assert.ok(
    Object.isFrozen(snapshot.sequence),
  );

  assert.ok(
    Object.isFrozen(snapshot.ordering),
  );

  assert.ok(
    Object.isFrozen(snapshot.latency),
  );

  assert.ok(
    Object.isFrozen(snapshot.health),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.backpressure,
    ),
  );

  assert.ok(
    Object.isFrozen(snapshot.router),
  );

  runtime.orchestrator.dispose();
}

async function testDisposeGuards():
Promise<void> {
  const runtime = createRuntime();

  runtime.orchestrator.dispose();

  assert.equal(
    runtime.orchestrator.isDisposed,
    true,
  );

  await assert.rejects(
    async () =>
      runtime.orchestrator.process({
        event: createEvent(
          runtime.clock,
        ),
      }),
    (error: unknown) => {
      assert.ok(
        error instanceof Error,
      );

      return (
        error.name ===
        "StreamingOrchestratorError"
      );
    },
  );
}

async function run(): Promise<void> {
  await testCompletePipeline();
  await testSequentialEvents();
  await testSequenceGapRejection();
  await testConcurrentDuplicateOperation();
  await testProcessAllDeterministicOrder();
  await testMaintenanceCycle();
  await testImmutableSnapshots();
  await testDisposeGuards();

  console.log(
    "All deterministic streaming orchestrator tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(
    "Streaming orchestrator tests failed.",
  );

  console.error(error);

  process.exitCode = 1;
});