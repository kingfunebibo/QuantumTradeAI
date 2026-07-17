/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 14:
 * Streaming Orchestrator
 *
 * This module coordinates the complete live market-data streaming pipeline.
 *
 * Processing pipeline:
 *
 * 1. Validate the normalized stream event
 * 2. Record connection activity
 * 3. Validate sequence integrity
 * 4. Buffer and order the event
 * 5. Measure streaming latency
 * 6. Evaluate stream health
 * 7. Apply backpressure controls
 * 8. Route released events
 * 9. Acknowledge successful consumer processing
 *
 * Responsibilities:
 * - Coordinate all streaming infrastructure components
 * - Preserve deterministic processing order
 * - Prevent duplicate concurrent processing
 * - Isolate subsystem failures
 * - Coordinate maintenance ticks
 * - Produce immutable orchestration results and snapshots
 * - Support deterministic testing through an injected clock
 *
 * The orchestrator does not create background timers. The application runtime
 * calls tick() explicitly.
 */

import {
  StreamingConnectionId,
  UnifiedStreamEvent,
  freezeUnifiedStreamEvent,
  validateUnifiedStreamEvent,
} from "./unified-streaming-interface";

import {
  BackpressureAdmissionResult,
  BackpressureConsumerId,
  BackpressureController,
  BackpressureDrainResult,
} from "./backpressure-controller";

import {
  EventOrderingBuffer,
  EventOrderingResult,
  OrderedBufferedEvent,
} from "./event-ordering-buffer";

import {
  HeartbeatMonitor,
  HeartbeatTickResult,
} from "./heartbeat-monitor";

import {
  LatencyMonitor,
  LatencyRecordResult,
} from "./latency-monitor";

import {
  ReconnectionController,
  ReconnectionTickResult,
} from "./reconnection-controller";

import {
  SequenceValidationResult,
  SequenceValidator,
  createSequenceStreamKey,
} from "./sequence-validator";

import {
  StreamHealthMonitor,
  StreamHealthMonitorSnapshot,
  StreamHealthSnapshot,
} from "./stream-health-monitor";

import {
  StreamRouter,
  StreamRoutingResult,
} from "./stream-router";

export type StreamingOrchestratorStatus =
  | "ACCEPTED"
  | "BUFFERED"
  | "ROUTED"
  | "DROPPED"
  | "REJECTED"
  | "FAILED";

export type StreamingPipelineStage =
  | "VALIDATION"
  | "HEARTBEAT"
  | "SEQUENCE"
  | "ORDERING"
  | "LATENCY"
  | "HEALTH"
  | "BACKPRESSURE"
  | "ROUTING"
  | "ACKNOWLEDGEMENT"
  | "MAINTENANCE";

export interface StreamingOrchestratorClock {
  now(): number;
}

export interface StreamingOrchestratorOptions {
  /**
   * Consumer used for events admitted into the backpressure subsystem.
   */
  readonly defaultConsumerId?: BackpressureConsumerId;

  /**
   * When true, rejected sequence events are not passed into ordering.
   *
   * Defaults to true.
   */
  readonly rejectInvalidSequences?: boolean;

  /**
   * When true, event routing errors are returned as failed pipeline results.
   *
   * Defaults to true.
   */
  readonly failOnRoutingError?: boolean;

  /**
   * When true, health is updated when any pipeline stage fails.
   *
   * Defaults to true.
   */
  readonly updateHealthOnFailure?: boolean;

  /**
   * When true, backpressure is bypassed when no consumer is configured.
   *
   * Defaults to true.
   */
  readonly allowRoutingWithoutConsumer?: boolean;

  /**
   * Maximum number of released ordering-buffer events processed during one
   * operation.
   */
  readonly maxReleasedEventsPerOperation?: number;
}

export interface StreamingOrchestratorDependencies {
  readonly sequenceValidator: SequenceValidator;
  readonly orderingBuffer: EventOrderingBuffer;
  readonly latencyMonitor: LatencyMonitor;
  readonly healthMonitor: StreamHealthMonitor;
  readonly backpressureController: BackpressureController;
  readonly streamRouter: StreamRouter;
  readonly heartbeatMonitor?: HeartbeatMonitor;
  readonly reconnectionController?: ReconnectionController;
}

export interface StreamingEventProcessingRequest {
  readonly event: UnifiedStreamEvent;

  /**
   * Optional backpressure consumer override.
   */
  readonly consumerId?: BackpressureConsumerId;

  /**
   * Optional sequence value supplied by the exchange as the predecessor of
   * event.sequence.
   */
  readonly previousSequence?: number;

  /**
   * Explicitly resets sequence state before processing the event.
   */
  readonly resetSequence?: boolean;

  /**
   * Optional processing start timestamp.
   */
  readonly processingStartedAt?: number;
}

export interface StreamingPipelineFailure {
  readonly stage: StreamingPipelineStage;
  readonly eventId?: string;
  readonly occurredAt: number;
  readonly error: Error;
}

export interface StreamingEventProcessingResult {
  readonly operationId: number;
  readonly status: StreamingOrchestratorStatus;
  readonly eventId: string;
  readonly streamKey: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly processingDurationMs: number;
  readonly sequenceResult?: SequenceValidationResult;
  readonly orderingResult?: EventOrderingResult;
  readonly latencyResult?: LatencyRecordResult;
  readonly healthSnapshot?: StreamHealthSnapshot;
  readonly admissionResult?: BackpressureAdmissionResult;
  readonly drainResult?: BackpressureDrainResult;
  readonly routingResults: readonly StreamRoutingResult[];
  readonly releasedEventIds: readonly string[];
  readonly failures: readonly StreamingPipelineFailure[];
  readonly reason?: string;
}

export interface StreamingOrchestratorTickResult {
  readonly operationId: number;
  readonly processedAt: number;
  readonly expiredOrderingEvents:
    readonly OrderedBufferedEvent[];
  readonly expiredRoutingResults:
    readonly StreamRoutingResult[];
  readonly heartbeatResult?: HeartbeatTickResult;
  readonly reconnectionResult?: ReconnectionTickResult;
  readonly healthSnapshot: StreamHealthMonitorSnapshot;
  readonly failures: readonly StreamingPipelineFailure[];
}

export interface StreamingOrchestratorSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly activeOperations: number;
  readonly totalOperations: number;
  readonly acceptedEvents: number;
  readonly bufferedEvents: number;
  readonly routedEvents: number;
  readonly droppedEvents: number;
  readonly rejectedEvents: number;
  readonly failedEvents: number;
  readonly maintenanceCycles: number;
  readonly defaultConsumerId?: BackpressureConsumerId;
  readonly sequence: ReturnType<SequenceValidator["getSnapshot"]>;
  readonly ordering: ReturnType<EventOrderingBuffer["getSnapshot"]>;
  readonly latency: ReturnType<LatencyMonitor["getSnapshot"]>;
  readonly health: ReturnType<StreamHealthMonitor["getSnapshot"]>;
  readonly backpressure: ReturnType<
    BackpressureController["getSnapshot"]
  >;
  readonly router: ReturnType<StreamRouter["getSnapshot"]>;
  readonly heartbeat?: ReturnType<HeartbeatMonitor["getSnapshot"]>;
  readonly reconnection?: ReturnType<
    ReconnectionController["getSnapshot"]
  >;
}

const DEFAULT_MAX_RELEASED_EVENTS_PER_OPERATION = 1_000;

const SYSTEM_CLOCK: StreamingOrchestratorClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

export class StreamingOrchestratorError extends Error {
  public readonly code: string;
  public readonly eventId?: string;
  public readonly stage?: StreamingPipelineStage;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly eventId?: string;
      readonly stage?: StreamingPipelineStage;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "StreamingOrchestratorError";
    this.code = code;
    this.eventId = context?.eventId;
    this.stage = context?.stage;
  }
}

/**
 * Production-grade deterministic streaming subsystem coordinator.
 */
export class StreamingOrchestrator {
  private readonly dependencies:
    StreamingOrchestratorDependencies;

  private readonly clock: StreamingOrchestratorClock;

  private readonly defaultConsumerId?:
    BackpressureConsumerId;

  private readonly rejectInvalidSequences: boolean;
  private readonly failOnRoutingError: boolean;
  private readonly updateHealthOnFailure: boolean;
  private readonly allowRoutingWithoutConsumer: boolean;
  private readonly maxReleasedEventsPerOperation: number;

  private readonly activeEventOperations =
    new Map<string, Promise<StreamingEventProcessingResult>>();

  private nextOperationId = 1;
  private totalOperations = 0;
  private acceptedEvents = 0;
  private bufferedEvents = 0;
  private routedEvents = 0;
  private droppedEvents = 0;
  private rejectedEvents = 0;
  private failedEvents = 0;
  private maintenanceCycles = 0;
  private maintenanceOperation?: Promise<StreamingOrchestratorTickResult>;
  private disposed = false;

  public constructor(
    dependencies: StreamingOrchestratorDependencies,
    options: StreamingOrchestratorOptions = {},
    clock: StreamingOrchestratorClock = SYSTEM_CLOCK,
  ) {
    this.dependencies =
      validateDependencies(dependencies);

    this.clock = validateClock(clock);

    this.defaultConsumerId =
      options.defaultConsumerId === undefined
        ? undefined
        : normalizeConsumerId(
            options.defaultConsumerId,
          );

    this.rejectInvalidSequences =
      options.rejectInvalidSequences ?? true;

    this.failOnRoutingError =
      options.failOnRoutingError ?? true;

    this.updateHealthOnFailure =
      options.updateHealthOnFailure ?? true;

    this.allowRoutingWithoutConsumer =
      options.allowRoutingWithoutConsumer ?? true;

    this.maxReleasedEventsPerOperation =
      validatePositiveSafeInteger(
        options.maxReleasedEventsPerOperation ??
          DEFAULT_MAX_RELEASED_EVENTS_PER_OPERATION,
        "maxReleasedEventsPerOperation",
      );

    validateBoolean(
      this.rejectInvalidSequences,
      "rejectInvalidSequences",
    );

    validateBoolean(
      this.failOnRoutingError,
      "failOnRoutingError",
    );

    validateBoolean(
      this.updateHealthOnFailure,
      "updateHealthOnFailure",
    );

    validateBoolean(
      this.allowRoutingWithoutConsumer,
      "allowRoutingWithoutConsumer",
    );
  }

  /**
   * Processes one normalized exchange event through the complete streaming
   * pipeline.
   *
   * Repeated concurrent calls for the same event ID share the same operation.
   */
  public process(
    request: StreamingEventProcessingRequest,
  ): Promise<StreamingEventProcessingResult> {
    this.assertActive();

    validateProcessingRequest(request);

    const event = freezeUnifiedStreamEvent(
      request.event,
    );

    const existingOperation =
      this.activeEventOperations.get(event.eventId);

    if (existingOperation !== undefined) {
      return existingOperation;
    }

    const operation = this.performProcess({
      ...request,
      event,
    }).finally(() => {
      this.activeEventOperations.delete(
        event.eventId,
      );
    });

    this.activeEventOperations.set(
      event.eventId,
      operation,
    );

    return operation;
  }

  /**
   * Processes events sequentially in the supplied order.
   */
  public async processAll(
    requests: readonly StreamingEventProcessingRequest[],
  ): Promise<readonly StreamingEventProcessingResult[]> {
    this.assertActive();

    if (!Array.isArray(requests)) {
      throw new StreamingOrchestratorError(
        "INVALID_PROCESSING_COLLECTION",
        "Streaming event processing requests must be an array.",
      );
    }

    const results: StreamingEventProcessingResult[] = [];

    for (const request of requests) {
      results.push(await this.process(request));
    }

    return Object.freeze(results);
  }

  /**
   * Executes one deterministic maintenance cycle.
   *
   * Maintenance includes:
   * - Ordering-buffer timeout flushing
   * - Heartbeat evaluation
   * - Reconnection attempts
   * - Backpressure timeout evaluation
   * - Stream-health evaluation
   */
  public tick(): Promise<StreamingOrchestratorTickResult> {
    this.assertActive();

    if (this.maintenanceOperation !== undefined) {
      return this.maintenanceOperation;
    }

    const operation = this.performTick().finally(() => {
      this.maintenanceOperation = undefined;
    });

    this.maintenanceOperation = operation;

    return operation;
  }

  public getSnapshot(): StreamingOrchestratorSnapshot {
    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      activeOperations:
        this.activeEventOperations.size +
        (this.maintenanceOperation === undefined
          ? 0
          : 1),
      totalOperations: this.totalOperations,
      acceptedEvents: this.acceptedEvents,
      bufferedEvents: this.bufferedEvents,
      routedEvents: this.routedEvents,
      droppedEvents: this.droppedEvents,
      rejectedEvents: this.rejectedEvents,
      failedEvents: this.failedEvents,
      maintenanceCycles: this.maintenanceCycles,
      defaultConsumerId: this.defaultConsumerId,
      sequence:
        this.dependencies.sequenceValidator.getSnapshot(),
      ordering:
        this.dependencies.orderingBuffer.getSnapshot(),
      latency:
        this.dependencies.latencyMonitor.getSnapshot(),
      health:
        this.dependencies.healthMonitor.getSnapshot(),
      backpressure:
        this.dependencies.backpressureController.getSnapshot(),
      router:
        this.dependencies.streamRouter.getSnapshot(),
      heartbeat:
        this.dependencies.heartbeatMonitor?.getSnapshot(),
      reconnection:
        this.dependencies.reconnectionController?.getSnapshot(),
    });
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Disposes the orchestration layer.
   *
   * Individual subsystem ownership remains external. The orchestrator does not
   * dispose injected dependencies.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    if (
      this.activeEventOperations.size > 0 ||
      this.maintenanceOperation !== undefined
    ) {
      throw new StreamingOrchestratorError(
        "STREAMING_OPERATIONS_IN_PROGRESS",
        "Cannot dispose the streaming orchestrator while operations are active.",
      );
    }

    this.disposed = true;
  }

  private async performProcess(
    request: StreamingEventProcessingRequest,
  ): Promise<StreamingEventProcessingResult> {
    const operationId = this.nextOperationId;

    this.nextOperationId += 1;
    this.totalOperations += 1;

    const startedAt =
      request.processingStartedAt ?? this.now();

    validateTimestamp(
      startedAt,
      "request.processingStartedAt",
    );

    const event = request.event;

    const streamKey =
      createSequenceStreamKey(event);

    const failures: StreamingPipelineFailure[] = [];
    const routingResults: StreamRoutingResult[] = [];
    const releasedEventIds: string[] = [];

    let sequenceResult:
      | SequenceValidationResult
      | undefined;

    let orderingResult:
      | EventOrderingResult
      | undefined;

    let latencyResult:
      | LatencyRecordResult
      | undefined;

    let healthSnapshot:
      | StreamHealthSnapshot
      | undefined;

    let admissionResult:
      | BackpressureAdmissionResult
      | undefined;

    let drainResult:
      | BackpressureDrainResult
      | undefined;

    try {
      validateUnifiedStreamEvent(event);
    } catch (error: unknown) {
      const failure = this.createFailure(
        "VALIDATION",
        error,
        event.eventId,
      );

      failures.push(failure);
      this.failedEvents += 1;

      return this.finishResult({
        operationId,
        status: "FAILED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason: failure.error.message,
      });
    }

    this.recordHeartbeatActivity(
      event.connectionId,
      event.receivedAt,
      event.eventId,
      failures,
    );

    try {
      sequenceResult =
        this.dependencies.sequenceValidator.validate({
          event,
          previousSequence:
            request.previousSequence,
          reset: request.resetSequence,
        });
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "SEQUENCE",
          error,
          event.eventId,
        ),
      );

      await this.markStreamFailure(
        streamKey,
        "SEQUENCE",
        error,
        event.receivedAt,
        failures,
      );

      this.failedEvents += 1;

      return this.finishResult({
        operationId,
        status: "FAILED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason:
          "Sequence validation failed.",
      });
    }

    if (
      !sequenceResult.accepted &&
      this.rejectInvalidSequences
    ) {
      this.rejectedEvents += 1;

      await this.updateHealthSignal(
        streamKey,
        "SEQUENCE",
        "UNHEALTHY",
        sequenceResult.reason ??
          "Sequence validation rejected the event.",
        sequenceResult.validatedAt,
        failures,
      );

      return this.finishResult({
        operationId,
        status: "REJECTED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason:
          sequenceResult.reason ??
          "Sequence validation rejected the event.",
      });
    }

    await this.updateHealthSignal(
      streamKey,
      "SEQUENCE",
      sequenceResult.status === "GAP"
        ? "DEGRADED"
        : "HEALTHY",
      sequenceResult.reason ??
        "Sequence validation completed.",
      sequenceResult.validatedAt,
      failures,
    );

    try {
      orderingResult =
        this.dependencies.orderingBuffer.enqueue({
          event,
          streamKey,
          enqueuedAt: event.receivedAt,
        });
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "ORDERING",
          error,
          event.eventId,
        ),
      );

      await this.markStreamFailure(
        streamKey,
        "SEQUENCE",
        error,
        event.receivedAt,
        failures,
      );

      this.failedEvents += 1;

      return this.finishResult({
        operationId,
        status: "FAILED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason: "Event ordering failed.",
      });
    }

    if (
      orderingResult.status === "DROPPED" ||
      orderingResult.status === "STALE" ||
      orderingResult.status === "DUPLICATE"
    ) {
      this.droppedEvents += 1;

      return this.finishResult({
        operationId,
        status: "DROPPED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason: orderingResult.reason,
      });
    }

    if (orderingResult.status === "REJECTED") {
      this.rejectedEvents += 1;

      return this.finishResult({
        operationId,
        status: "REJECTED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason: orderingResult.reason,
      });
    }

    if (orderingResult.releasedEvents.length === 0) {
      this.bufferedEvents += 1;

      healthSnapshot =
        await this.recordHealthActivity(
          streamKey,
          event.receivedAt,
          failures,
        );

      return this.finishResult({
        operationId,
        status: "BUFFERED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason:
          orderingResult.reason ??
          "Event remains in the ordering buffer.",
      });
    }

    const releasedEvents =
      orderingResult.releasedEvents.slice(
        0,
        this.maxReleasedEventsPerOperation,
      );

    for (const released of releasedEvents) {
      releasedEventIds.push(
        released.event.eventId,
      );

      const processingCompletedAt = this.now();

      try {
        latencyResult =
          this.dependencies.latencyMonitor.recordEvent(
            released.event,
            startedAt,
            processingCompletedAt,
          );

        const latencyHealth =
          deriveLatencyHealth(
            latencyResult,
          );

        await this.updateHealthSignal(
          released.streamKey,
          "LATENCY",
          latencyHealth.status,
          latencyHealth.reason,
          processingCompletedAt,
          failures,
        );
      } catch (error: unknown) {
        failures.push(
          this.createFailure(
            "LATENCY",
            error,
            released.event.eventId,
          ),
        );
      }

      const consumerId =
        request.consumerId ??
        this.defaultConsumerId;

      if (consumerId !== undefined) {
        try {
          admissionResult =
            this.dependencies.backpressureController.admit({
              consumerId,
              event: released.event,
              admittedAt: processingCompletedAt,
            });
        } catch (error: unknown) {
          failures.push(
            this.createFailure(
              "BACKPRESSURE",
              error,
              released.event.eventId,
            ),
          );

          await this.markStreamFailure(
            released.streamKey,
            "BACKPRESSURE",
            error,
            processingCompletedAt,
            failures,
          );

          continue;
        }

        if (admissionResult.status !== "ACCEPTED") {
          await this.updateHealthSignal(
            released.streamKey,
            "BACKPRESSURE",
            admissionResult.status ===
              "CONSUMER_FAILED"
              ? "UNHEALTHY"
              : "DEGRADED",
            admissionResult.reason ??
              "Backpressure admission was not accepted.",
            admissionResult.occurredAt,
            failures,
          );

          continue;
        }

        try {
          drainResult =
            this.dependencies.backpressureController.drain(
              consumerId,
              1,
            );
        } catch (error: unknown) {
          failures.push(
            this.createFailure(
              "BACKPRESSURE",
              error,
              released.event.eventId,
            ),
          );

          continue;
        }

        const entry = drainResult.entries[0];

        if (entry === undefined) {
          continue;
        }

        try {
          const routingResult =
            await this.dependencies.streamRouter.route(
              entry.event,
            );

          routingResults.push(routingResult);

          if (
            routingResult.status === "FAILED" &&
            this.failOnRoutingError
          ) {
            throw new StreamingOrchestratorError(
              "STREAM_ROUTING_FAILED",
              routingResult.reason ??
                `Routing failed for event "${entry.event.eventId}".`,
              {
                eventId: entry.event.eventId,
                stage: "ROUTING",
              },
            );
          }

          this.dependencies.backpressureController.acknowledge({
            consumerId,
            entryId: entry.entryId,
            acknowledgedAt: this.now(),
          });

          await this.updateHealthSignal(
            released.streamKey,
            "BACKPRESSURE",
            "HEALTHY",
            "Event was processed and acknowledged.",
            this.now(),
            failures,
          );
        } catch (error: unknown) {
          failures.push(
            this.createFailure(
              "ROUTING",
              error,
              entry.event.eventId,
            ),
          );

          try {
            this.dependencies.backpressureController.fail({
              consumerId,
              entryId: entry.entryId,
              reason: normalizeError(error).message,
              failedAt: this.now(),
              retry: false,
            });
          } catch (acknowledgementError: unknown) {
            failures.push(
              this.createFailure(
                "ACKNOWLEDGEMENT",
                acknowledgementError,
                entry.event.eventId,
              ),
            );
          }

          await this.markStreamFailure(
            released.streamKey,
            "BACKPRESSURE",
            error,
            this.now(),
            failures,
          );
        }
      } else if (this.allowRoutingWithoutConsumer) {
        try {
          const routingResult =
            await this.dependencies.streamRouter.route(
              released.event,
            );

          routingResults.push(routingResult);
        } catch (error: unknown) {
          failures.push(
            this.createFailure(
              "ROUTING",
              error,
              released.event.eventId,
            ),
          );
        }
      } else {
        failures.push(
          this.createFailure(
            "BACKPRESSURE",
            new StreamingOrchestratorError(
              "NO_BACKPRESSURE_CONSUMER",
              "No backpressure consumer was configured.",
              {
                eventId: released.event.eventId,
                stage: "BACKPRESSURE",
              },
            ),
            released.event.eventId,
          ),
        );
      }

      healthSnapshot =
        await this.recordHealthActivity(
          released.streamKey,
          this.now(),
          failures,
        );
    }

    const successfulRouting =
      routingResults.some(
        (result) =>
          result.status === "ROUTED",
      );

    const failedRouting =
      routingResults.some(
        (result) =>
          result.status === "FAILED",
      );

    if (successfulRouting) {
      this.routedEvents += 1;
      this.acceptedEvents += 1;

      return this.finishResult({
        operationId,
        status: "ROUTED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
      });
    }

    if (
      failedRouting ||
      failures.some(
        (failure) =>
          failure.stage === "ROUTING",
      )
    ) {
      this.failedEvents += 1;

      return this.finishResult({
        operationId,
        status: "FAILED",
        eventId: event.eventId,
        streamKey,
        startedAt,
        sequenceResult,
        orderingResult,
        latencyResult,
        healthSnapshot,
        admissionResult,
        drainResult,
        routingResults,
        releasedEventIds,
        failures,
        reason:
          "One or more released events failed during routing.",
      });
    }

    this.acceptedEvents += 1;

    return this.finishResult({
      operationId,
      status: "ACCEPTED",
      eventId: event.eventId,
      streamKey,
      startedAt,
      sequenceResult,
      orderingResult,
      latencyResult,
      healthSnapshot,
      admissionResult,
      drainResult,
      routingResults,
      releasedEventIds,
      failures,
      reason:
        "Event was accepted but no route delivered it.",
    });
  }

  private async performTick():
    Promise<StreamingOrchestratorTickResult> {
    const operationId = this.nextOperationId;

    this.nextOperationId += 1;
    this.totalOperations += 1;
    this.maintenanceCycles += 1;

    const processedAt = this.now();
    const failures: StreamingPipelineFailure[] = [];
    const expiredRoutingResults: StreamRoutingResult[] = [];

    let expiredOrderingEvents:
      readonly OrderedBufferedEvent[] = [];

    let heartbeatResult:
      | HeartbeatTickResult
      | undefined;

    let reconnectionResult:
      | ReconnectionTickResult
      | undefined;

    try {
      expiredOrderingEvents =
        this.dependencies.orderingBuffer.flushExpired();
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "MAINTENANCE",
          error,
        ),
      );
    }

    for (const released of expiredOrderingEvents) {
      try {
        const result =
          await this.dependencies.streamRouter.route(
            released.event,
          );

        expiredRoutingResults.push(result);
      } catch (error: unknown) {
        failures.push(
          this.createFailure(
            "ROUTING",
            error,
            released.event.eventId,
          ),
        );
      }
    }

    try {
      this.dependencies.backpressureController.tick();
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "BACKPRESSURE",
          error,
        ),
      );
    }

    if (
      this.dependencies.heartbeatMonitor !==
      undefined
    ) {
      try {
        heartbeatResult =
          await this.dependencies.heartbeatMonitor.tick();
      } catch (error: unknown) {
        failures.push(
          this.createFailure(
            "HEARTBEAT",
            error,
          ),
        );
      }
    }

    if (
      this.dependencies.reconnectionController !==
      undefined
    ) {
      try {
        reconnectionResult =
          await this.dependencies.reconnectionController.tick();
      } catch (error: unknown) {
        failures.push(
          this.createFailure(
            "MAINTENANCE",
            error,
          ),
        );
      }
    }

    let healthSnapshot: StreamHealthMonitorSnapshot;

    try {
      healthSnapshot =
        this.dependencies.healthMonitor.tick();
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "HEALTH",
          error,
        ),
      );

      healthSnapshot =
        this.dependencies.healthMonitor.getSnapshot();
    }

    try {
      this.dependencies.latencyMonitor.cleanup();
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "LATENCY",
          error,
        ),
      );
    }

    return Object.freeze({
      operationId,
      processedAt,
      expiredOrderingEvents: Object.freeze([
        ...expiredOrderingEvents,
      ]),
      expiredRoutingResults: Object.freeze([
        ...expiredRoutingResults,
      ]),
      heartbeatResult,
      reconnectionResult,
      healthSnapshot,
      failures: freezeFailures(failures),
    });
  }

  private recordHeartbeatActivity(
    connectionId: StreamingConnectionId,
    occurredAt: number,
    eventId: string,
    failures: StreamingPipelineFailure[],
  ): void {
    const monitor =
      this.dependencies.heartbeatMonitor;

    if (monitor === undefined) {
      return;
    }

    try {
      const connection =
        monitor.getConnection(connectionId);

      if (connection === undefined) {
        return;
      }

      monitor.recordActivity({
        connectionId,
        occurredAt,
      });
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "HEARTBEAT",
          error,
          eventId,
        ),
      );
    }
  }

  private async recordHealthActivity(
    streamKey: string,
    occurredAt: number,
    failures: StreamingPipelineFailure[],
  ): Promise<StreamHealthSnapshot | undefined> {
    try {
      const stream =
        this.dependencies.healthMonitor.getStream(
          streamKey,
        );

      if (stream === undefined) {
        return undefined;
      }

      return this.dependencies.healthMonitor.recordActivity({
        streamKey,
        occurredAt,
      });
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "HEALTH",
          error,
        ),
      );

      return undefined;
    }
  }

  private async updateHealthSignal(
    streamKey: string,
    signalType:
      | "SEQUENCE"
      | "LATENCY"
      | "BACKPRESSURE",
    status:
      | "HEALTHY"
      | "DEGRADED"
      | "UNHEALTHY"
      | "UNKNOWN",
    reason: string,
    occurredAt: number,
    failures: StreamingPipelineFailure[],
  ): Promise<void> {
    try {
      const stream =
        this.dependencies.healthMonitor.getStream(
          streamKey,
        );

      if (stream === undefined) {
        return;
      }

      this.dependencies.healthMonitor.updateSignal({
        streamKey,
        signalType,
        status,
        reason,
        occurredAt,
      });
    } catch (error: unknown) {
      failures.push(
        this.createFailure(
          "HEALTH",
          error,
        ),
      );
    }
  }

  private async markStreamFailure(
    streamKey: string,
    signalType:
      | "SEQUENCE"
      | "LATENCY"
      | "BACKPRESSURE",
    error: unknown,
    occurredAt: number,
    failures: StreamingPipelineFailure[],
  ): Promise<void> {
    if (!this.updateHealthOnFailure) {
      return;
    }

    await this.updateHealthSignal(
      streamKey,
      signalType,
      "UNHEALTHY",
      normalizeError(error).message,
      occurredAt,
      failures,
    );
  }

  private finishResult(input: {
    readonly operationId: number;
    readonly status: StreamingOrchestratorStatus;
    readonly eventId: string;
    readonly streamKey: string;
    readonly startedAt: number;
    readonly sequenceResult?: SequenceValidationResult;
    readonly orderingResult?: EventOrderingResult;
    readonly latencyResult?: LatencyRecordResult;
    readonly healthSnapshot?: StreamHealthSnapshot;
    readonly admissionResult?: BackpressureAdmissionResult;
    readonly drainResult?: BackpressureDrainResult;
    readonly routingResults: readonly StreamRoutingResult[];
    readonly releasedEventIds: readonly string[];
    readonly failures: readonly StreamingPipelineFailure[];
    readonly reason?: string;
  }): StreamingEventProcessingResult {
    const completedAt = this.now();

    return Object.freeze({
      operationId: input.operationId,
      status: input.status,
      eventId: input.eventId,
      streamKey: input.streamKey,
      startedAt: input.startedAt,
      completedAt,
      processingDurationMs: Math.max(
        0,
        completedAt - input.startedAt,
      ),
      sequenceResult: input.sequenceResult,
      orderingResult: input.orderingResult,
      latencyResult: input.latencyResult,
      healthSnapshot: input.healthSnapshot,
      admissionResult: input.admissionResult,
      drainResult: input.drainResult,
      routingResults: Object.freeze([
        ...input.routingResults,
      ]),
      releasedEventIds: Object.freeze([
        ...input.releasedEventIds,
      ]),
      failures: freezeFailures(input.failures),
      reason: input.reason,
    });
  }

  private createFailure(
    stage: StreamingPipelineStage,
    error: unknown,
    eventId?: string,
  ): StreamingPipelineFailure {
    return Object.freeze({
      stage,
      eventId,
      occurredAt: this.now(),
      error: normalizeError(error),
    });
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new StreamingOrchestratorError(
        "STREAMING_ORCHESTRATOR_DISPOSED",
        "The streaming orchestrator has been disposed.",
      );
    }
  }
}

function deriveLatencyHealth(
  result: LatencyRecordResult,
): {
  readonly status:
    | "HEALTHY"
    | "DEGRADED"
    | "UNHEALTHY"
    | "UNKNOWN";
  readonly reason: string;
} {
  const alerts = result.generatedAlerts;

  if (
    alerts.some(
      (alert) =>
        alert.severity === "CRITICAL",
    )
  ) {
    return {
      status: "UNHEALTHY",
      reason:
        "Critical streaming latency threshold exceeded.",
    };
  }

  if (
    alerts.some(
      (alert) =>
        alert.severity === "WARNING",
    )
  ) {
    return {
      status: "DEGRADED",
      reason:
        "Streaming latency warning threshold exceeded.",
    };
  }

  const sample = result.sample;

  if (
    sample.networkLatencyMs === undefined &&
    sample.processingLatencyMs === undefined &&
    sample.endToEndLatencyMs === undefined
  ) {
    return {
      status: "UNKNOWN",
      reason:
        "No latency metrics were available.",
    };
  }

  return {
    status: "HEALTHY",
    reason:
      "Streaming latency is within configured thresholds.",
  };
}

function validateDependencies(
  dependencies: StreamingOrchestratorDependencies,
): StreamingOrchestratorDependencies {
  if (
    dependencies === null ||
    typeof dependencies !== "object"
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_ORCHESTRATOR_DEPENDENCIES",
      "Streaming orchestrator dependencies must be an object.",
    );
  }

  validateObjectMethod(
    dependencies.sequenceValidator,
    "sequenceValidator",
    ["validate", "getSnapshot"],
  );

  validateObjectMethod(
    dependencies.orderingBuffer,
    "orderingBuffer",
    ["enqueue", "flushExpired", "getSnapshot"],
  );

  validateObjectMethod(
    dependencies.latencyMonitor,
    "latencyMonitor",
    ["recordEvent", "cleanup", "getSnapshot"],
  );

  validateObjectMethod(
    dependencies.healthMonitor,
    "healthMonitor",
    [
      "getStream",
      "updateSignal",
      "recordActivity",
      "tick",
      "getSnapshot",
    ],
  );

  validateObjectMethod(
    dependencies.backpressureController,
    "backpressureController",
    [
      "admit",
      "drain",
      "acknowledge",
      "fail",
      "tick",
      "getSnapshot",
    ],
  );

  validateObjectMethod(
    dependencies.streamRouter,
    "streamRouter",
    ["route", "getSnapshot"],
  );

  if (
    dependencies.heartbeatMonitor !== undefined
  ) {
    validateObjectMethod(
      dependencies.heartbeatMonitor,
      "heartbeatMonitor",
      [
        "getConnection",
        "recordActivity",
        "tick",
        "getSnapshot",
      ],
    );
  }

  if (
    dependencies.reconnectionController !==
    undefined
  ) {
    validateObjectMethod(
      dependencies.reconnectionController,
      "reconnectionController",
      ["tick", "getSnapshot"],
    );
  }

  return dependencies;
}

function validateProcessingRequest(
  request: StreamingEventProcessingRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_PROCESSING_REQUEST",
      "Streaming event processing request must be an object.",
    );
  }

  validateUnifiedStreamEvent(request.event);

  if (request.consumerId !== undefined) {
    normalizeConsumerId(request.consumerId);
  }

  if (request.previousSequence !== undefined) {
    if (
      !Number.isSafeInteger(
        request.previousSequence,
      ) ||
      request.previousSequence < 0
    ) {
      throw new StreamingOrchestratorError(
        "INVALID_PREVIOUS_SEQUENCE",
        "previousSequence must be a non-negative safe integer.",
        {
          eventId: request.event.eventId,
          stage: "VALIDATION",
        },
      );
    }
  }

  if (
    request.resetSequence !== undefined &&
    typeof request.resetSequence !== "boolean"
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_RESET_SEQUENCE",
      "resetSequence must be boolean when provided.",
      {
        eventId: request.event.eventId,
        stage: "VALIDATION",
      },
    );
  }

  if (
    request.processingStartedAt !== undefined
  ) {
    validateTimestamp(
      request.processingStartedAt,
      "request.processingStartedAt",
    );
  }
}

function validateObjectMethod(
  value: unknown,
  field: string,
  methods: readonly string[],
): void {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_ORCHESTRATOR_DEPENDENCY",
      `${field} must be an object.`,
    );
  }

  const candidate =
    value as Readonly<Record<string, unknown>>;

  for (const method of methods) {
    if (typeof candidate[method] !== "function") {
      throw new StreamingOrchestratorError(
        "INVALID_ORCHESTRATOR_DEPENDENCY",
        `${field} must implement ${method}().`,
      );
    }
  }
}

function normalizeConsumerId(
  consumerId: BackpressureConsumerId,
): BackpressureConsumerId {
  if (
    typeof consumerId !== "string" ||
    consumerId.trim().length === 0
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_CONSUMER_ID",
      "consumerId must be a non-empty string.",
    );
  }

  return consumerId.trim();
}

function validateBoolean(
  value: boolean,
  field: string,
): void {
  if (typeof value !== "boolean") {
    throw new StreamingOrchestratorError(
      "INVALID_BOOLEAN",
      `${field} must be boolean.`,
    );
  }
}

function validatePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function validateClock(
  clock: StreamingOrchestratorClock,
): StreamingOrchestratorClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new StreamingOrchestratorError(
      "INVALID_CLOCK",
      "Streaming orchestrator clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function freezeFailures(
  failures: readonly StreamingPipelineFailure[],
): readonly StreamingPipelineFailure[] {
  return Object.freeze(
    failures.map((failure) =>
      Object.freeze({
        ...failure,
      }),
    ),
  );
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(
      "Unknown streaming orchestration error.",
    );
  }
}