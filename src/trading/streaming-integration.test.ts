/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * Multi-Exchange Streaming Integration Tests
 *
 * Coverage:
 * - OKX, Binance, and Bybit streaming
 * - Shared unified streaming pipeline
 * - Exchange-specific subscriptions and routes
 * - Deterministic cross-exchange event processing
 * - Independent sequence tracking per exchange stream
 * - Out-of-order event buffering and release
 * - Sequence-gap isolation
 * - Backpressure admission and acknowledgement
 * - Latency measurement
 * - Stream-health aggregation
 * - Maintenance-cycle execution
 * - Immutable integration snapshots
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
  advance(milliseconds: number): void;
}

interface ExchangeFixture {
  readonly exchangeId: string;
  readonly connectionId: string;
  readonly subscriptionId: string;
  readonly consumerId: string;
  readonly symbol: string;
  readonly routeId: string;
}

interface IntegrationRuntime {
  readonly clock: DeterministicClock;
  readonly sequenceValidator: SequenceValidator;
  readonly orderingBuffer: EventOrderingBuffer;
  readonly latencyMonitor: LatencyMonitor;
  readonly healthMonitor: StreamHealthMonitor;
  readonly backpressureController: BackpressureController;
  readonly subscriptionRegistry: StreamingSubscriptionRegistry;
  readonly streamRouter: StreamRouter;
  readonly orchestrator: StreamingOrchestrator;
  readonly fixtures: readonly ExchangeFixture[];
  readonly deliveredEvents:
    ReadonlyMap<string, UnifiedStreamEvent[]>;
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

function createFixtures():
readonly ExchangeFixture[] {
  return Object.freeze([
    Object.freeze({
      exchangeId: "OKX",
      connectionId:
        "connection-okx-public-001",
      subscriptionId:
        "subscription-okx-btc-trades",
      consumerId:
        "consumer-okx-market-data",
      symbol: "BTC-USDT",
      routeId: "route-okx-btc-trades",
    }),

    Object.freeze({
      exchangeId: "BINANCE",
      connectionId:
        "connection-binance-public-001",
      subscriptionId:
        "subscription-binance-btc-trades",
      consumerId:
        "consumer-binance-market-data",
      symbol: "BTCUSDT",
      routeId:
        "route-binance-btc-trades",
    }),

    Object.freeze({
      exchangeId: "BYBIT",
      connectionId:
        "connection-bybit-public-001",
      subscriptionId:
        "subscription-bybit-btc-trades",
      consumerId:
        "consumer-bybit-market-data",
      symbol: "BTCUSDT",
      routeId:
        "route-bybit-btc-trades",
    }),
  ]);
}

function createSubscription(
  fixture: ExchangeFixture,
): UnifiedStreamingSubscription {
  const subscription:
    UnifiedStreamingSubscription = {
      subscriptionId:
        fixture.subscriptionId,

      exchangeId:
        fixture.exchangeId,

      scope: "PUBLIC",

      channel: "TRADES",

      symbol: fixture.symbol,

      parameters: Object.freeze({}),

      metadata: Object.freeze({
        integrationTest: true,
      }),
    };

  return Object.freeze(subscription);
}

function createEvent(
  clock: DeterministicClock,
  fixture: ExchangeFixture,
  sequence: number,
  overrides:
    Partial<UnifiedStreamEvent> = {},
): UnifiedStreamEvent {
  const receivedAt: number =
    overrides.receivedAt ??
    clock.now();

  const exchangeTimestamp: number =
    overrides.exchangeTimestamp ??
    receivedAt - 15;

  const normalizedAt: number =
    overrides.normalizedAt ??
    receivedAt;

  const event: UnifiedStreamEvent = {
    eventId:
      overrides.eventId ??
      [
        "event",
        fixture.exchangeId.toLowerCase(),
        sequence
          .toString()
          .padStart(6, "0"),
      ].join("-"),

    exchangeId:
      overrides.exchangeId ??
      fixture.exchangeId,

    connectionId:
      overrides.connectionId ??
      fixture.connectionId,

    subscriptionId:
      overrides.subscriptionId ??
      fixture.subscriptionId,

    channel:
      overrides.channel ??
      "TRADES",

    symbol:
      overrides.symbol ??
      fixture.symbol,

    type:
      overrides.type ??
      "TRADE",

    sequence:
      overrides.sequence ??
      sequence,

    exchangeTimestamp,
    receivedAt,
    normalizedAt,

    payload:
      overrides.payload ??
      Object.freeze({
        tradeId:
          `${fixture.exchangeId.toLowerCase()}-${sequence}`,

        price:
          (
            65_000 +
            sequence
          ).toFixed(2),

        quantity:
          "0.100",

        side:
          sequence % 2 === 0
            ? "SELL"
            : "BUY",
      }),

    metadata:
      overrides.metadata ??
      Object.freeze({
        integrationTest: true,
        exchange:
          fixture.exchangeId,
      }),
  };

  return Object.freeze(event);
}

function createRuntime(): IntegrationRuntime {
  const clock = createClock();
  const fixtures = createFixtures();

  const sequenceValidator =
    new SequenceValidator(
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

  const orderingBuffer =
    new EventOrderingBuffer(
      {
        mode: "SEQUENCE",
        maxTotalBufferedEvents: 5_000,
        maxBufferedEventsPerStream: 500,
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

  const latencyMonitor =
    new LatencyMonitor(
      {
        maxSamplesPerScope: 1_000,
        rollingWindowMs: 300_000,
        minimumSamplesForAggregateAlerts: 3,
        thresholds: {
          warningLatencyMs: 250,
          criticalLatencyMs: 1_000,
          warningJitterMs: 100,
          criticalJitterMs: 500,
        },
      },
      clock,
    );

  const healthMonitor =
    new StreamHealthMonitor(
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
        maxGlobalPendingEvents: 10_000,
        defaultMaxPendingEventsPerConsumer:
          1_000,
        defaultHighWatermarkRatio: 0.8,
        defaultLowWatermarkRatio: 0.5,
        defaultAcknowledgementTimeoutMs:
          10_000,
        defaultDrainBatchSize: 100,
        defaultOverflowPolicy:
          "PAUSE_CONSUMER",
        defaultTimeoutAction:
          "MARK_DEGRADED",
      },
      clock,
    );

  const subscriptionRegistry =
    new StreamingSubscriptionRegistry(clock);

  const streamRouter =
    new StreamRouter(
      subscriptionRegistry,
      {
        propagateListenerErrors: false,
        requireActiveSubscription: true,
        validateExplicitSubscriptionId:
          true,
      },
      clock,
    );

  const deliveredEvents =
    new Map<
      string,
      UnifiedStreamEvent[]
    >();

  for (const fixture of fixtures) {
    const subscription =
      createSubscription(fixture);

    subscriptionRegistry.register({
      subscription,
      connectionId:
        fixture.connectionId,
      state: "ACTIVE",
    });

    backpressureController.register({
      consumerId:
        fixture.consumerId,
      exchangeId:
        fixture.exchangeId,
      connectionId:
        fixture.connectionId,
      maxPendingEvents: 1_000,
      highWatermarkRatio: 0.8,
      lowWatermarkRatio: 0.5,
      acknowledgementTimeoutMs:
        10_000,
      drainBatchSize: 100,
      overflowPolicy:
        "PAUSE_CONSUMER",
      timeoutAction:
        "MARK_DEGRADED",
    });

    deliveredEvents.set(
      fixture.exchangeId,
      [],
    );

    streamRouter.registerRoute({
      routeId: fixture.routeId,
      priority: 1,
      enabled: true,

      filter: {
        subscriptionIds: [
          fixture.subscriptionId,
        ],

        exchangeIds: [
          fixture.exchangeId,
        ],

        connectionIds: [
          fixture.connectionId,
        ],

        channels: [
          "TRADES",
        ],

        symbols: [
          fixture.symbol,
        ],

        eventTypes: [
          "TRADE",
        ],
      },

      listener: (
        event: UnifiedStreamEvent,
      ): void => {
        const collection =
          deliveredEvents.get(
            fixture.exchangeId,
          );

        assert.ok(
          collection,
          `Delivery collection missing for ${fixture.exchangeId}.`,
        );

        collection.push(event);
      },
    });

    const representativeEvent =
      createEvent(
        clock,
        fixture,
        1,
      );

    const streamKey =
      createSequenceStreamKey(
        representativeEvent,
      );

    healthMonitor.register({
      streamKey,
      exchangeId:
        fixture.exchangeId,
      connectionId:
        fixture.connectionId,
      channel: "TRADES",
      symbol: fixture.symbol,
      eventType: "TRADE",
      subscriptionId:
        fixture.subscriptionId,
      metadata: {
        integrationTest: true,
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

    healthMonitor.updateSignal({
      streamKey,
      signalType: "HEARTBEAT",
      status: "HEALTHY",
      occurredAt: clock.now(),
      reason:
        "Integration fixture heartbeat healthy.",
    });
  }

  const orchestrator =
    new StreamingOrchestrator(
      {
        sequenceValidator,
        orderingBuffer,
        latencyMonitor,
        healthMonitor,
        backpressureController,
        streamRouter,
      },
      {
        rejectInvalidSequences: true,
        failOnRoutingError: true,
        updateHealthOnFailure: true,
        allowRoutingWithoutConsumer: false,
        maxReleasedEventsPerOperation:
          1_000,
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
    fixtures,
    deliveredEvents,
  };
}

function getDeliveredEvents(
  runtime: IntegrationRuntime,
  exchangeId: string,
): UnifiedStreamEvent[] {
  const events =
    runtime.deliveredEvents.get(
      exchangeId,
    );

  assert.ok(
    events,
    `No delivered-event collection exists for ${exchangeId}.`,
  );

  return events;
}

async function processExchangeEvent(
  runtime: IntegrationRuntime,
  fixture: ExchangeFixture,
  event: UnifiedStreamEvent,
  previousSequence?: number,
) {
  return runtime.orchestrator.process({
    event,
    consumerId:
      fixture.consumerId,
    previousSequence,
    processingStartedAt:
      runtime.clock.now(),
  });
}

async function testInitialMultiExchangeRouting():
Promise<void> {
  const runtime = createRuntime();

  for (const fixture of runtime.fixtures) {
    const event = createEvent(
      runtime.clock,
      fixture,
      1,
    );

    const result =
      await processExchangeEvent(
        runtime,
        fixture,
        event,
      );

    assert.equal(
      result.status,
      "ROUTED",
      `${fixture.exchangeId} event should route successfully.`,
    );

    assert.equal(
      result.sequenceResult?.status,
      "INITIALIZED",
    );

    assert.equal(
      result.orderingResult?.status,
      "RELEASED",
    );

    assert.equal(
      result.routingResults.length,
      1,
    );

    assert.equal(
      result.failures.length,
      0,
    );

    assert.equal(
      getDeliveredEvents(
        runtime,
        fixture.exchangeId,
      ).length,
      1,
    );

    runtime.clock.advance(10);
  }

  const snapshot =
    runtime.orchestrator.getSnapshot();

  assert.equal(
    snapshot.totalOperations,
    3,
  );

  assert.equal(
    snapshot.routedEvents,
    3,
  );

  assert.equal(
    snapshot.failedEvents,
    0,
  );

  assert.equal(
    snapshot.rejectedEvents,
    0,
  );

  assert.equal(
    snapshot.sequence.totalStreams,
    3,
  );

  assert.equal(
    snapshot.latency.exchangeCount,
    3,
  );

  assert.equal(
    snapshot.latency.connectionCount,
    3,
  );

  assert.equal(
    snapshot.latency.streamCount,
    3,
  );

  assert.equal(
    snapshot.health.exchangeCount,
    3,
  );

  assert.equal(
    snapshot.health.connectionCount,
    3,
  );

  runtime.orchestrator.dispose();
}

async function testIndependentSequenceTracking():
Promise<void> {
  const runtime = createRuntime();

  for (const fixture of runtime.fixtures) {
    const firstResult =
      await processExchangeEvent(
        runtime,
        fixture,
        createEvent(
          runtime.clock,
          fixture,
          1,
        ),
      );

    assert.equal(
      firstResult.status,
      "ROUTED",
    );

    runtime.clock.advance(5);
  }

  const okxFixture =
    runtime.fixtures[0];

  const binanceFixture =
    runtime.fixtures[1];

  const bybitFixture =
    runtime.fixtures[2];

  assert.ok(okxFixture);
  assert.ok(binanceFixture);
  assert.ok(bybitFixture);

  const okxSecond =
    await processExchangeEvent(
      runtime,
      okxFixture,
      createEvent(
        runtime.clock,
        okxFixture,
        2,
      ),
      1,
    );

  assert.equal(
    okxSecond.status,
    "ROUTED",
  );

  runtime.clock.advance(5);

  const binanceSecond =
    await processExchangeEvent(
      runtime,
      binanceFixture,
      createEvent(
        runtime.clock,
        binanceFixture,
        2,
      ),
      1,
    );

  assert.equal(
    binanceSecond.status,
    "ROUTED",
  );

  runtime.clock.advance(5);

  const bybitSecond =
    await processExchangeEvent(
      runtime,
      bybitFixture,
      createEvent(
        runtime.clock,
        bybitFixture,
        2,
      ),
      1,
    );

  assert.equal(
    bybitSecond.status,
    "ROUTED",
  );

  const sequenceSnapshot =
    runtime.sequenceValidator.getSnapshot();

  assert.equal(
    sequenceSnapshot.totalStreams,
    3,
  );

  assert.equal(
    sequenceSnapshot.acceptedEvents,
    6,
  );

  assert.equal(
    sequenceSnapshot.rejectedEvents,
    0,
  );

  for (const stream of sequenceSnapshot.streams) {
    assert.equal(
      stream.currentSequence,
      2,
    );

    assert.equal(
      stream.healthy,
      true,
    );
  }

  runtime.orchestrator.dispose();
}

async function testSequenceGapIsolation():
Promise<void> {
  const runtime = createRuntime();

  for (const fixture of runtime.fixtures) {
    const result =
      await processExchangeEvent(
        runtime,
        fixture,
        createEvent(
          runtime.clock,
          fixture,
          1,
        ),
      );

    assert.equal(
      result.status,
      "ROUTED",
    );

    runtime.clock.advance(5);
  }

  const okxFixture =
    runtime.fixtures[0];

  const binanceFixture =
    runtime.fixtures[1];

  const bybitFixture =
    runtime.fixtures[2];

  assert.ok(okxFixture);
  assert.ok(binanceFixture);
  assert.ok(bybitFixture);

  const invalidOkxEvent =
    createEvent(
      runtime.clock,
      okxFixture,
      3,
    );

  const invalidResult =
    await processExchangeEvent(
      runtime,
      okxFixture,
      invalidOkxEvent,
      1,
    );

  assert.equal(
    invalidResult.status,
    "REJECTED",
  );

  assert.equal(
    invalidResult.sequenceResult?.status,
    "GAP",
  );

  assert.equal(
    invalidResult.sequenceResult?.accepted,
    false,
  );

  runtime.clock.advance(5);

  const validBinanceResult =
    await processExchangeEvent(
      runtime,
      binanceFixture,
      createEvent(
        runtime.clock,
        binanceFixture,
        2,
      ),
      1,
    );

  assert.equal(
    validBinanceResult.status,
    "ROUTED",
  );

  runtime.clock.advance(5);

  const validBybitResult =
    await processExchangeEvent(
      runtime,
      bybitFixture,
      createEvent(
        runtime.clock,
        bybitFixture,
        2,
      ),
      1,
    );

  assert.equal(
    validBybitResult.status,
    "ROUTED",
  );

  assert.equal(
    getDeliveredEvents(
      runtime,
      "OKX",
    ).length,
    1,
    "Rejected OKX gap event must not be delivered.",
  );

  assert.equal(
    getDeliveredEvents(
      runtime,
      "BINANCE",
    ).length,
    2,
  );

  assert.equal(
    getDeliveredEvents(
      runtime,
      "BYBIT",
    ).length,
    2,
  );

  const okxStreamKey =
    createSequenceStreamKey(
      invalidOkxEvent,
    );

  const okxHealth =
    runtime.healthMonitor.getStream(
      okxStreamKey,
    );

  assert.ok(okxHealth);

  const sequenceSignal =
    okxHealth.signals.find(
      (signal) =>
        signal.signalType ===
        "SEQUENCE",
    );

  assert.equal(
    sequenceSignal?.status,
    "UNHEALTHY",
  );

  const binanceHealth =
    runtime.healthMonitor.getStream(
      createSequenceStreamKey(
        createEvent(
          runtime.clock,
          binanceFixture,
          2,
        ),
      ),
    );

  assert.ok(binanceHealth);

  assert.notEqual(
    binanceHealth.status,
    "UNHEALTHY",
  );

  runtime.orchestrator.dispose();
}

async function testDirectOutOfOrderBuffering():
Promise<void> {
  const runtime = createRuntime();

  const fixture =
    runtime.fixtures[0];

  assert.ok(fixture);

  const firstEvent =
    createEvent(
      runtime.clock,
      fixture,
      1,
    );

  const firstSequence =
    runtime.sequenceValidator.validate({
      event: firstEvent,
    });

  assert.equal(
    firstSequence.accepted,
    true,
  );

  const firstOrdering =
    runtime.orderingBuffer.enqueue({
      event: firstEvent,
    });

  assert.equal(
    firstOrdering.status,
    "RELEASED",
  );

  runtime.clock.advance(10);

  const thirdEvent =
    createEvent(
      runtime.clock,
      fixture,
      3,
    );

  const thirdOrdering =
    runtime.orderingBuffer.enqueue({
      event: thirdEvent,
    });

  assert.equal(
    thirdOrdering.status,
    "BUFFERED",
  );

  assert.equal(
    thirdOrdering.buffered,
    true,
  );

  runtime.clock.advance(10);

  const secondEvent =
    createEvent(
      runtime.clock,
      fixture,
      2,
    );

  const secondOrdering =
    runtime.orderingBuffer.enqueue({
      event: secondEvent,
    });

  assert.equal(
    secondOrdering.status,
    "RELEASED",
  );

  assert.deepEqual(
    secondOrdering.releasedEvents.map(
      (released) =>
        released.event.sequence,
    ),
    [2, 3],
  );

  assert.equal(
    runtime.orderingBuffer
      .bufferedEventCount,
    0,
  );

  runtime.orchestrator.dispose();
}

async function testBackpressureIsolation():
Promise<void> {
  const runtime = createRuntime();

  const okxFixture =
    runtime.fixtures[0];

  const binanceFixture =
    runtime.fixtures[1];

  assert.ok(okxFixture);
  assert.ok(binanceFixture);

  const okxAdmission =
    runtime.backpressureController.admit({
      consumerId:
        okxFixture.consumerId,
      event: createEvent(
        runtime.clock,
        okxFixture,
        1,
      ),
    });

  assert.equal(
    okxAdmission.status,
    "ACCEPTED",
  );

  const binanceAdmission =
    runtime.backpressureController.admit({
      consumerId:
        binanceFixture.consumerId,
      event: createEvent(
        runtime.clock,
        binanceFixture,
        1,
      ),
    });

  assert.equal(
    binanceAdmission.status,
    "ACCEPTED",
  );

  const okxDrain =
    runtime.backpressureController.drain(
      okxFixture.consumerId,
      1,
    );

  assert.equal(
    okxDrain.entries.length,
    1,
  );

  const okxEntry =
    okxDrain.entries[0];

  assert.ok(okxEntry);

  runtime.backpressureController.acknowledge({
    consumerId:
      okxFixture.consumerId,
    entryId: okxEntry.entryId,
    acknowledgedAt:
      runtime.clock.now(),
  });

  const okxConsumer =
    runtime.backpressureController.getConsumer(
      okxFixture.consumerId,
    );

  const binanceConsumer =
    runtime.backpressureController.getConsumer(
      binanceFixture.consumerId,
    );

  assert.ok(okxConsumer);
  assert.ok(binanceConsumer);

  assert.equal(
    okxConsumer.pendingEventCount,
    0,
  );

  assert.equal(
    binanceConsumer.pendingEventCount,
    1,
    "Acknowledging OKX must not alter Binance backpressure state.",
  );

  assert.equal(
    binanceConsumer.queuedEventCount,
    1,
  );

  runtime.orchestrator.dispose();
}

async function testLatencyAndHealthAggregation():
Promise<void> {
  const runtime = createRuntime();

  for (const fixture of runtime.fixtures) {
    for (
      let sequence = 1;
      sequence <= 3;
      sequence += 1
    ) {
      const event =
        createEvent(
          runtime.clock,
          fixture,
          sequence,
          {
            exchangeTimestamp:
              runtime.clock.now() -
              (
                10 +
                sequence * 5
              ),
          },
        );

      const result =
        await processExchangeEvent(
          runtime,
          fixture,
          event,
          sequence === 1
            ? undefined
            : sequence - 1,
        );

      assert.equal(
        result.status,
        "ROUTED",
      );

      runtime.clock.advance(10);
    }
  }

  const latencySnapshot =
    runtime.latencyMonitor.getSnapshot();

  assert.equal(
    latencySnapshot.totalSamples,
    9,
  );

  assert.equal(
    latencySnapshot.exchangeCount,
    3,
  );

  assert.equal(
    latencySnapshot.connectionCount,
    3,
  );

  assert.equal(
    latencySnapshot.streamCount,
    3,
  );

  for (
    const exchange of
      latencySnapshot.exchanges
  ) {
    assert.equal(
      exchange.sampleCount,
      3,
    );

    assert.equal(
      exchange.network.statistics
        .sampleCount,
      3,
    );

    assert.equal(
      exchange.network.healthStatus,
      "HEALTHY",
    );
  }

  const healthSnapshot =
    runtime.healthMonitor.getSnapshot();

  assert.equal(
    healthSnapshot.totalStreams,
    3,
  );

  assert.equal(
    healthSnapshot.exchangeCount,
    3,
  );

  assert.equal(
    healthSnapshot.connectionCount,
    3,
  );

  assert.equal(
    healthSnapshot.unhealthyStreams,
    0,
  );

  runtime.orchestrator.dispose();
}

async function testMaintenanceAndInactivity():
Promise<void> {
  const runtime = createRuntime();

  for (const fixture of runtime.fixtures) {
    const result =
      await processExchangeEvent(
        runtime,
        fixture,
        createEvent(
          runtime.clock,
          fixture,
          1,
        ),
      );

    assert.equal(
      result.status,
      "ROUTED",
    );

    runtime.clock.advance(5);
  }

  const firstTick =
    await runtime.orchestrator.tick();

  assert.equal(
    firstTick.failures.length,
    0,
  );

  assert.equal(
    firstTick.healthSnapshot
      .totalStreams,
    3,
  );

  runtime.clock.advance(31_000);

  const degradedTick =
    await runtime.orchestrator.tick();

  assert.equal(
    degradedTick.healthSnapshot
      .degradedStreams,
    3,
  );

  assert.equal(
    degradedTick.healthSnapshot
      .staleStreams,
    3,
  );

  runtime.clock.advance(60_000);

  const unhealthyTick =
    await runtime.orchestrator.tick();

  assert.equal(
    unhealthyTick.healthSnapshot
      .unhealthyStreams,
    3,
  );

  assert.equal(
    unhealthyTick.healthSnapshot
      .overallStatus,
    "UNHEALTHY",
  );

  runtime.orchestrator.dispose();
}

async function testImmutableIntegrationSnapshot():
Promise<void> {
  const runtime = createRuntime();

  for (const fixture of runtime.fixtures) {
    const result =
      await processExchangeEvent(
        runtime,
        fixture,
        createEvent(
          runtime.clock,
          fixture,
          1,
        ),
      );

    assert.equal(
      result.status,
      "ROUTED",
    );

    runtime.clock.advance(5);
  }

  const snapshot =
    runtime.orchestrator.getSnapshot();

  assert.ok(
    Object.isFrozen(snapshot),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.sequence,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.ordering,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.latency,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.health,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.backpressure,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.router,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.health.streams,
    ),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.latency.exchanges,
    ),
  );

  runtime.orchestrator.dispose();
}

function disposeRuntime(
  runtime: IntegrationRuntime,
): void {
  if (!runtime.orchestrator.isDisposed) {
    runtime.orchestrator.dispose();
  }

  runtime.sequenceValidator.dispose();
  runtime.orderingBuffer.dispose();
  runtime.latencyMonitor.dispose();
  runtime.healthMonitor.dispose();
  runtime.backpressureController.dispose();
}

async function run(): Promise<void> {
  const tests: readonly {
    readonly name: string;
    readonly execute:
      () => Promise<void>;
  }[] = [
    {
      name:
        "initial multi-exchange routing",
      execute:
        testInitialMultiExchangeRouting,
    },
    {
      name:
        "independent sequence tracking",
      execute:
        testIndependentSequenceTracking,
    },
    {
      name:
        "sequence-gap isolation",
      execute:
        testSequenceGapIsolation,
    },
    {
      name:
        "direct out-of-order buffering",
      execute:
        testDirectOutOfOrderBuffering,
    },
    {
      name:
        "backpressure isolation",
      execute:
        testBackpressureIsolation,
    },
    {
      name:
        "latency and health aggregation",
      execute:
        testLatencyAndHealthAggregation,
    },
    {
      name:
        "maintenance and inactivity",
      execute:
        testMaintenanceAndInactivity,
    },
    {
      name:
        "immutable integration snapshot",
      execute:
        testImmutableIntegrationSnapshot,
    },
  ];

  for (const test of tests) {
    try {
      await test.execute();
    } catch (error: unknown) {
      console.error(
        `Streaming integration test failed: ${test.name}`,
      );

      throw error;
    }
  }

  console.log(
    "All deterministic multi-exchange streaming integration tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(
    "Multi-exchange streaming integration tests failed.",
  );

  console.error(error);

  process.exitCode = 1;
});