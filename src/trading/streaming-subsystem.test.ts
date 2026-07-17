/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * Streaming Subsystem Deterministic Tests
 *
 * Coverage:
 * - Sequence validation
 * - Duplicate and gap detection
 * - Event ordering
 * - Latency statistics
 * - Backpressure admission and acknowledgement
 * - Consumer pause and resume
 * - Stream-health aggregation
 * - Inactivity degradation
 * - Immutable subsystem snapshots
 */

import assert from "node:assert/strict";

import {
  BackpressureController,
  EventOrderingBuffer,
  LatencyMonitor,
  SequenceValidator,
  StreamHealthMonitor,
  UnifiedStreamEvent,
  createSequenceStreamKey,
} from "./exchange-connectivity/streaming";

interface DeterministicClock {
  now(): number;
  advance(milliseconds: number): void;
}

function createClock(
  initialTimestamp = 1_700_000_000_000,
): DeterministicClock {
  let timestamp = initialTimestamp;

  return {
    now(): number {
      return timestamp;
    },

    advance(milliseconds: number): void {
      assert.ok(
        Number.isFinite(milliseconds),
        "Clock advancement must be finite.",
      );

      assert.ok(
        milliseconds >= 0,
        "Clock advancement must be non-negative.",
      );

      timestamp += milliseconds;
    },
  };
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
    overrides.normalizedAt ??
    receivedAt;

  const event: UnifiedStreamEvent = {
    eventId:
      overrides.eventId ??
      "stream-event-000001",

    exchangeId:
      overrides.exchangeId ??
      "OKX",

    connectionId:
      overrides.connectionId ??
      "connection-okx-public-001",

    subscriptionId:
      overrides.subscriptionId,

    channel:
      overrides.channel ??
      "TRADES",

    symbol:
      overrides.symbol ??
      "BTC-USDT",

    type:
      overrides.type ??
      "TRADE",

    sequence:
      overrides.sequence ??
      1,

    exchangeTimestamp,
    receivedAt,
    normalizedAt,

    payload:
      overrides.payload ??
      Object.freeze({
        tradeId: "trade-000001",
        price: "65000.00",
        quantity: "0.100",
        side: "BUY",
      }),

    metadata:
      overrides.metadata ??
      Object.freeze({
        source:
          "streaming-subsystem-test",
      }),
  };

  return Object.freeze(event);
}

async function testSequenceValidation():
Promise<void> {
  const clock = createClock();

  const validator = new SequenceValidator(
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

  const firstEvent = createEvent(clock, {
    eventId: "sequence-event-000001",
    sequence: 1,
  });

  const firstResult = validator.validate({
    event: firstEvent,
  });

  assert.equal(
    firstResult.status,
    "INITIALIZED",
  );

  assert.equal(
    firstResult.accepted,
    true,
  );

  clock.advance(10);

  const secondEvent = createEvent(clock, {
    eventId: "sequence-event-000002",
    sequence: 2,
  });

  const secondResult = validator.validate({
    event: secondEvent,
    previousSequence: 1,
  });

  assert.equal(
    secondResult.status,
    "ACCEPTED",
  );

  assert.equal(
    secondResult.currentSequence,
    2,
  );

  clock.advance(10);

  const duplicateEvent = createEvent(clock, {
    eventId: "sequence-event-duplicate",
    sequence: 2,
  });

  const duplicateResult = validator.validate({
    event: duplicateEvent,
  });

  assert.equal(
    duplicateResult.status,
    "DUPLICATE",
  );

  assert.equal(
    duplicateResult.accepted,
    false,
  );

  clock.advance(10);

  const gapEvent = createEvent(clock, {
    eventId: "sequence-event-gap",
    sequence: 4,
  });

  const gapResult = validator.validate({
    event: gapEvent,
    previousSequence: 2,
  });

  assert.equal(
    gapResult.status,
    "GAP",
  );

  assert.equal(
    gapResult.accepted,
    false,
  );

  assert.equal(
    gapResult.expectedSequence,
    3,
  );

  assert.equal(
    gapResult.missingSequenceCount,
    1,
  );

  const snapshot = validator.getSnapshot();

  assert.equal(
    snapshot.totalValidations,
    4,
  );

  assert.equal(
    snapshot.acceptedEvents,
    2,
  );

  assert.equal(
    snapshot.rejectedEvents,
    2,
  );

  assert.equal(
    snapshot.duplicateEvents,
    1,
  );

  assert.equal(
    snapshot.gapEvents,
    1,
  );

  assert.ok(
    Object.isFrozen(snapshot),
  );

  validator.dispose();
}

async function testEventOrdering():
Promise<void> {
  const clock = createClock();

  const buffer = new EventOrderingBuffer(
    {
      mode: "SEQUENCE",
      maxTotalBufferedEvents: 100,
      maxBufferedEventsPerStream: 20,
      maxBufferAgeMs: 5_000,
      maxTimestampLatenessMs: 1_000,
      expectedSequenceIncrement: 1,
      overflowPolicy: "REJECT_NEWEST",
      lateEventPolicy: "DROP",
      gapPolicy: "WAIT",
      rejectDuplicateEventIds: true,
      rejectDuplicateSequences: true,
    },
    clock,
  );

  const firstEvent = createEvent(clock, {
    eventId: "ordering-event-000001",
    sequence: 1,
  });

  const firstResult = buffer.enqueue({
    event: firstEvent,
  });

  assert.equal(
    firstResult.status,
    "RELEASED",
  );

  assert.deepEqual(
    firstResult.releasedEvents.map(
      (released) =>
        released.event.sequence,
    ),
    [1],
  );

  clock.advance(10);

  const thirdEvent = createEvent(clock, {
    eventId: "ordering-event-000003",
    sequence: 3,
  });

  const thirdResult = buffer.enqueue({
    event: thirdEvent,
  });

  assert.equal(
    thirdResult.status,
    "BUFFERED",
  );

  assert.equal(
    thirdResult.buffered,
    true,
  );

  clock.advance(10);

  const secondEvent = createEvent(clock, {
    eventId: "ordering-event-000002",
    sequence: 2,
  });

  const secondResult = buffer.enqueue({
    event: secondEvent,
  });

  assert.equal(
    secondResult.status,
    "RELEASED",
  );

  assert.deepEqual(
    secondResult.releasedEvents.map(
      (released) =>
        released.event.sequence,
    ),
    [2, 3],
  );

  assert.equal(
    buffer.bufferedEventCount,
    0,
  );

  const duplicateResult = buffer.enqueue({
    event: secondEvent,
  });

  assert.equal(
    duplicateResult.status,
    "STALE",
  );

  const snapshot = buffer.getSnapshot();

  assert.equal(
    snapshot.totalReleasedEvents,
    3,
  );

  assert.equal(
    snapshot.totalDuplicateEvents,
    0,
  );

  assert.equal(
    snapshot.totalStaleEvents,
    1,
  );

  assert.equal(
    snapshot.totalBufferedEvents,
    0,
  );

  assert.ok(
    Object.isFrozen(snapshot.streams),
  );

  buffer.dispose();
}

async function testLatencyMonitoring():
Promise<void> {
  const clock = createClock();

  const monitor = new LatencyMonitor(
    {
      maxSamplesPerScope: 20,
      rollingWindowMs: 60_000,
      minimumSamplesForAggregateAlerts: 2,
      thresholds: {
        warningLatencyMs: 100,
        criticalLatencyMs: 300,
        warningJitterMs: 50,
        criticalJitterMs: 150,
      },
    },
    clock,
  );

  const firstEvent = createEvent(clock, {
    eventId: "latency-event-000001",
    exchangeTimestamp:
      clock.now() - 20,
  });

  const firstResult = monitor.recordEvent(
    firstEvent,
    clock.now(),
    clock.now() + 5,
  );

  assert.equal(
    firstResult.sample.networkLatencyMs,
    20,
  );

  assert.equal(
    firstResult.sample.processingLatencyMs,
    5,
  );

  assert.equal(
    firstResult.sample.endToEndLatencyMs,
    25,
  );

  assert.equal(
    firstResult.generatedAlerts.length,
    0,
  );

  clock.advance(20);

  const secondEvent = createEvent(clock, {
    eventId: "latency-event-000002",
    sequence: 2,
    exchangeTimestamp:
      clock.now() - 150,
  });

  const secondResult = monitor.recordEvent(
    secondEvent,
    clock.now(),
    clock.now() + 10,
  );

  assert.equal(
    secondResult.sample.networkLatencyMs,
    150,
  );

  assert.ok(
    secondResult.generatedAlerts.some(
      (alert) =>
        alert.severity === "WARNING",
    ),
  );

  const streamKey =
    createSequenceStreamKey(firstEvent);

  const streamSnapshot =
    monitor.getStream(streamKey);

  assert.ok(streamSnapshot);

  assert.equal(
    streamSnapshot.sampleCount,
    2,
  );

  assert.equal(
    streamSnapshot.network.statistics.sampleCount,
    2,
  );

  assert.equal(
    streamSnapshot.network.statistics.minimumMs,
    20,
  );

  assert.equal(
    streamSnapshot.network.statistics.maximumMs,
    150,
  );

  assert.equal(
    streamSnapshot.network.statistics.meanMs,
    85,
  );

  const snapshot = monitor.getSnapshot();

  assert.equal(
    snapshot.totalSamples,
    2,
  );

  assert.equal(
    snapshot.exchangeCount,
    1,
  );

  assert.equal(
    snapshot.connectionCount,
    1,
  );

  assert.equal(
    snapshot.streamCount,
    1,
  );

  assert.ok(
    Object.isFrozen(snapshot),
  );

  monitor.dispose();
}

async function testBackpressureFlow():
Promise<void> {
  const clock = createClock();

  const controller =
    new BackpressureController(
      {
        maxGlobalPendingEvents: 10,
        defaultMaxPendingEventsPerConsumer: 4,
        defaultHighWatermarkRatio: 0.75,
        defaultLowWatermarkRatio: 0.25,
        defaultAcknowledgementTimeoutMs: 1_000,
        defaultDrainBatchSize: 2,
        defaultOverflowPolicy:
          "PAUSE_CONSUMER",
        defaultTimeoutAction:
          "MARK_DEGRADED",
      },
      clock,
    );

  const consumerId =
    "streaming-subsystem-consumer";

  controller.register({
    consumerId,
    exchangeId: "OKX",
    connectionId:
      "connection-okx-public-001",
    maxPendingEvents: 4,
    highWatermarkRatio: 0.75,
    lowWatermarkRatio: 0.25,
    acknowledgementTimeoutMs: 1_000,
    drainBatchSize: 2,
    overflowPolicy: "PAUSE_CONSUMER",
    timeoutAction: "MARK_DEGRADED",
  });

  const firstAdmission = controller.admit({
    consumerId,
    event: createEvent(clock, {
      eventId: "bp-event-000001",
      sequence: 1,
    }),
  });

  assert.equal(
    firstAdmission.status,
    "ACCEPTED",
  );

  const secondAdmission = controller.admit({
    consumerId,
    event: createEvent(clock, {
      eventId: "bp-event-000002",
      sequence: 2,
    }),
  });

  assert.equal(
    secondAdmission.status,
    "ACCEPTED",
  );

  const drainResult = controller.drain(
    consumerId,
    2,
  );

  assert.equal(
    drainResult.entries.length,
    2,
  );

  assert.equal(
    drainResult.inFlightEventCount,
    2,
  );

  const firstEntry =
    drainResult.entries[0];

  const secondEntry =
    drainResult.entries[1];

  assert.ok(firstEntry);
  assert.ok(secondEntry);

  controller.acknowledge({
    consumerId,
    entryId: firstEntry.entryId,
    acknowledgedAt: clock.now(),
  });

  controller.acknowledge({
    consumerId,
    entryId: secondEntry.entryId,
    acknowledgedAt: clock.now(),
  });

  const consumerSnapshot =
    controller.getConsumer(consumerId);

  assert.ok(consumerSnapshot);

  assert.equal(
    consumerSnapshot.pendingEventCount,
    0,
  );

  assert.equal(
    consumerSnapshot.acknowledgedEventCount,
    2,
  );

  assert.equal(
    consumerSnapshot.state,
    "ACTIVE",
  );

  const controllerSnapshot =
    controller.getSnapshot();

  assert.equal(
    controllerSnapshot.totalQueuedEvents,
    0,
  );

  assert.equal(
    controllerSnapshot.totalInFlightEvents,
    0,
  );

  assert.ok(
    Object.isFrozen(controllerSnapshot),
  );

  controller.dispose();
}

async function testBackpressurePauseResume():
Promise<void> {
  const clock = createClock();

  const controller =
    new BackpressureController(
      {
        maxGlobalPendingEvents: 10,
        defaultMaxPendingEventsPerConsumer: 4,
        defaultHighWatermarkRatio: 0.75,
        defaultLowWatermarkRatio: 0.25,
        defaultAcknowledgementTimeoutMs: 1_000,
        defaultDrainBatchSize: 4,
        defaultOverflowPolicy:
          "PAUSE_CONSUMER",
        defaultTimeoutAction:
          "MARK_DEGRADED",
      },
      clock,
    );

  const consumerId =
    "pause-resume-consumer";

  controller.register({
    consumerId,
    maxPendingEvents: 4,
    highWatermarkRatio: 0.75,
    lowWatermarkRatio: 0.25,
    drainBatchSize: 4,
    overflowPolicy: "PAUSE_CONSUMER",
  });

  for (
    let sequence = 1;
    sequence <= 3;
    sequence += 1
  ) {
    controller.admit({
      consumerId,
      event: createEvent(clock, {
        eventId:
          `pause-event-${sequence}`,
        sequence,
      }),
    });
  }

  const pausedSnapshot =
    controller.getConsumer(consumerId);

  assert.ok(pausedSnapshot);

  assert.equal(
    pausedSnapshot.state,
    "PAUSED",
  );

  const rejectedAdmission =
    controller.admit({
      consumerId,
      event: createEvent(clock, {
        eventId: "pause-event-rejected",
        sequence: 4,
      }),
    });

  assert.equal(
    rejectedAdmission.status,
    "CONSUMER_PAUSED",
  );

  const drained = controller.drain(
    consumerId,
    3,
  );

  for (const entry of drained.entries) {
    controller.acknowledge({
      consumerId,
      entryId: entry.entryId,
      acknowledgedAt: clock.now(),
    });
  }

  const resumedSnapshot =
    controller.getConsumer(consumerId);

  assert.ok(resumedSnapshot);

  assert.equal(
    resumedSnapshot.state,
    "ACTIVE",
  );

  assert.equal(
    resumedSnapshot.pauseCount,
    1,
  );

  assert.equal(
    resumedSnapshot.resumeCount,
    1,
  );

  controller.dispose();
}

async function testStreamHealthAggregation():
Promise<void> {
  const clock = createClock();

  const monitor = new StreamHealthMonitor(
    {
      degradedAfterInactivityMs: 1_000,
      unhealthyAfterInactivityMs: 3_000,
      degradedSignalsForUnhealthy: 3,
      unhealthySignalsForUnhealthy: 1,
      failFastOnCriticalSignal: true,
    },
    clock,
  );

  const event = createEvent(clock);

  const streamKey =
    createSequenceStreamKey(event);

  monitor.register({
    streamKey,
    exchangeId: event.exchangeId,
    connectionId: event.connectionId,
    channel: event.channel,
    symbol: event.symbol,
    eventType: event.type,
  });

  monitor.updateConnection({
    streamKey,
    state: "CONNECTED",
    occurredAt: clock.now(),
  });

  monitor.updateSignal({
    streamKey,
    signalType: "HEARTBEAT",
    status: "HEALTHY",
    occurredAt: clock.now(),
    reason: "Heartbeat acknowledged.",
  });

  monitor.updateSignal({
    streamKey,
    signalType: "SEQUENCE",
    status: "HEALTHY",
    occurredAt: clock.now(),
    reason: "Sequence is continuous.",
  });

  monitor.recordActivity({
    streamKey,
    occurredAt: clock.now(),
  });

  const healthySnapshot =
    monitor.evaluate(streamKey);

  assert.equal(
    healthySnapshot.status,
    "HEALTHY",
  );

  clock.advance(1_500);

  const degradedMonitorSnapshot =
    monitor.tick();

  const degradedStream =
    degradedMonitorSnapshot.streams[0];

  assert.ok(degradedStream);

  assert.equal(
    degradedStream.stale,
    true,
  );

  assert.equal(
    degradedStream.status,
    "DEGRADED",
  );

  clock.advance(2_000);

  const unhealthyMonitorSnapshot =
    monitor.tick();

  const unhealthyStream =
    unhealthyMonitorSnapshot.streams[0];

  assert.ok(unhealthyStream);

  assert.equal(
    unhealthyStream.status,
    "UNHEALTHY",
  );

  monitor.recordActivity({
    streamKey,
    occurredAt: clock.now(),
  });

  const recoveredSnapshot =
    monitor.evaluate(streamKey);

  assert.equal(
    recoveredSnapshot.stale,
    false,
  );

  assert.equal(
    recoveredSnapshot.status,
    "HEALTHY",
  );

  assert.ok(
    Object.isFrozen(
      monitor.getSnapshot(),
    ),
  );

  monitor.dispose();
}

async function testCombinedSubsystemSnapshots():
Promise<void> {
  const clock = createClock();

  const sequenceValidator =
    new SequenceValidator({}, clock);

  const orderingBuffer =
    new EventOrderingBuffer({}, clock);

  const latencyMonitor =
    new LatencyMonitor({}, clock);

  const healthMonitor =
    new StreamHealthMonitor({}, clock);

  const backpressureController =
    new BackpressureController({}, clock);

  const event = createEvent(clock);

  const streamKey =
    createSequenceStreamKey(event);

  healthMonitor.register({
    streamKey,
    exchangeId: event.exchangeId,
    connectionId: event.connectionId,
    channel: event.channel,
    symbol: event.symbol,
    eventType: event.type,
  });

  backpressureController.register({
    consumerId: "combined-consumer",
  });

  const sequenceResult =
    sequenceValidator.validate({
      event,
    });

  assert.equal(
    sequenceResult.accepted,
    true,
  );

  const orderingResult =
    orderingBuffer.enqueue({
      event,
    });

  assert.equal(
    orderingResult.status,
    "RELEASED",
  );

  latencyMonitor.recordEvent(
    event,
    clock.now(),
    clock.now() + 5,
  );

  healthMonitor.recordActivity({
    streamKey,
    occurredAt: clock.now(),
  });

  const admissionResult =
    backpressureController.admit({
      consumerId: "combined-consumer",
      event,
    });

  assert.equal(
    admissionResult.status,
    "ACCEPTED",
  );

  assert.equal(
    sequenceValidator.getSnapshot()
      .totalValidations,
    1,
  );

  assert.equal(
    orderingBuffer.getSnapshot()
      .totalReleasedEvents,
    1,
  );

  assert.equal(
    latencyMonitor.getSnapshot()
      .totalSamples,
    1,
  );

  assert.equal(
    healthMonitor.getSnapshot()
      .totalStreams,
    1,
  );

  assert.equal(
    backpressureController.getSnapshot()
      .totalPendingEvents,
    1,
  );

  sequenceValidator.dispose();
  orderingBuffer.dispose();
  latencyMonitor.dispose();
  healthMonitor.dispose();
  backpressureController.dispose();
}

async function run(): Promise<void> {
  await testSequenceValidation();
  await testEventOrdering();
  await testLatencyMonitoring();
  await testBackpressureFlow();
  await testBackpressurePauseResume();
  await testStreamHealthAggregation();
  await testCombinedSubsystemSnapshots();

  console.log(
    "All deterministic streaming subsystem tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(
    "Streaming subsystem tests failed.",
  );

  console.error(error);

  process.exitCode = 1;
});