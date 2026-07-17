/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 12:
 * Backpressure Controller
 *
 * This module protects the streaming subsystem from consumers that cannot
 * process inbound events at the rate they are produced.
 *
 * Responsibilities:
 * - Track pending events per consumer
 * - Enforce global and per-consumer queue limits
 * - Apply deterministic overflow policies
 * - Pause and resume consumers using watermarks
 * - Track event acknowledgements and processing failures
 * - Detect processing timeouts
 * - Support bounded event draining
 * - Produce immutable metrics and health snapshots
 * - Support deterministic testing through an injected clock
 *
 * The controller does not create background timers. The orchestration layer
 * calls tick() explicitly to process timeout and recovery conditions.
 */

import {
  StreamingConnectionId,
  StreamingExchangeId,
  UnifiedStreamEvent,
  freezeUnifiedStreamEvent,
  validateStreamingConnectionId,
  validateStreamingExchangeId,
  validateUnifiedStreamEvent,
} from "./unified-streaming-interface";

export type BackpressureConsumerId = string;
export type BackpressureQueueEntryId = string;

export type BackpressureConsumerState =
  | "ACTIVE"
  | "PAUSED"
  | "DEGRADED"
  | "FAILED"
  | "DISPOSED";

export type BackpressureAdmissionStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "DROPPED"
  | "CONSUMER_PAUSED"
  | "CONSUMER_FAILED";

export type BackpressureOverflowPolicy =
  | "REJECT_NEWEST"
  | "DROP_NEWEST"
  | "DROP_OLDEST"
  | "PAUSE_CONSUMER"
  | "FAIL_CONSUMER";

export type BackpressureTimeoutAction =
  | "MARK_DEGRADED"
  | "PAUSE_CONSUMER"
  | "FAIL_CONSUMER"
  | "DROP_TIMED_OUT";

export type BackpressureEventType =
  | "CONSUMER_REGISTERED"
  | "CONSUMER_UNREGISTERED"
  | "EVENT_ACCEPTED"
  | "EVENT_REJECTED"
  | "EVENT_DROPPED"
  | "EVENT_DISPATCHED"
  | "EVENT_ACKNOWLEDGED"
  | "EVENT_FAILED"
  | "EVENT_TIMED_OUT"
  | "CONSUMER_PAUSED"
  | "CONSUMER_RESUMED"
  | "CONSUMER_DEGRADED"
  | "CONSUMER_FAILED"
  | "CONSUMER_RESET";

export type BackpressureHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export interface BackpressureControllerClock {
  now(): number;
}

export interface BackpressureControllerOptions {
  /**
   * Maximum number of queued and in-flight events across all consumers.
   */
  readonly maxGlobalPendingEvents?: number;

  /**
   * Maximum number of queued and in-flight events for one consumer.
   */
  readonly defaultMaxPendingEventsPerConsumer?: number;

  /**
   * Percentage of per-consumer capacity that causes automatic pausing.
   *
   * Must be greater than zero and less than or equal to one.
   */
  readonly defaultHighWatermarkRatio?: number;

  /**
   * Percentage of per-consumer capacity below which a paused consumer may
   * automatically resume.
   *
   * Must be greater than or equal to zero and lower than the high watermark.
   */
  readonly defaultLowWatermarkRatio?: number;

  /**
   * Maximum time an event may remain in-flight without acknowledgement.
   *
   * Set to zero to disable acknowledgement timeout detection.
   */
  readonly defaultAcknowledgementTimeoutMs?: number;

  /**
   * Maximum number of events returned by one drain operation.
   */
  readonly defaultDrainBatchSize?: number;

  readonly defaultOverflowPolicy?: BackpressureOverflowPolicy;
  readonly defaultTimeoutAction?: BackpressureTimeoutAction;
}

export interface BackpressureConsumerRegistration {
  readonly consumerId: BackpressureConsumerId;
  readonly exchangeId?: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly maxPendingEvents?: number;
  readonly highWatermarkRatio?: number;
  readonly lowWatermarkRatio?: number;
  readonly acknowledgementTimeoutMs?: number;
  readonly drainBatchSize?: number;
  readonly overflowPolicy?: BackpressureOverflowPolicy;
  readonly timeoutAction?: BackpressureTimeoutAction;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BackpressureAdmissionRequest {
  readonly consumerId: BackpressureConsumerId;
  readonly event: UnifiedStreamEvent;
  readonly admittedAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BackpressureQueueEntry {
  readonly entryId: BackpressureQueueEntryId;
  readonly consumerId: BackpressureConsumerId;
  readonly event: UnifiedStreamEvent;
  readonly admittedAt: number;
  readonly dispatchedAt?: number;
  readonly attempt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface BackpressureAdmissionResult {
  readonly operationId: number;
  readonly status: BackpressureAdmissionStatus;
  readonly consumerId: BackpressureConsumerId;
  readonly eventId: string;
  readonly occurredAt: number;
  readonly entry?: BackpressureQueueEntry;
  readonly droppedEntryIds: readonly BackpressureQueueEntryId[];
  readonly queuedEventCount: number;
  readonly inFlightEventCount: number;
  readonly reason?: string;
}

export interface BackpressureDrainResult {
  readonly operationId: number;
  readonly consumerId: BackpressureConsumerId;
  readonly drainedAt: number;
  readonly entries: readonly BackpressureQueueEntry[];
  readonly remainingQueuedEventCount: number;
  readonly inFlightEventCount: number;
}

export interface BackpressureAcknowledgement {
  readonly consumerId: BackpressureConsumerId;
  readonly entryId: BackpressureQueueEntryId;
  readonly acknowledgedAt?: number;
}

export interface BackpressureFailure {
  readonly consumerId: BackpressureConsumerId;
  readonly entryId: BackpressureQueueEntryId;
  readonly reason: string;
  readonly failedAt?: number;

  /**
   * When true, the failed event is returned to the front of the queue.
   */
  readonly retry?: boolean;
}

export interface BackpressureEvent {
  readonly eventId: number;
  readonly type: BackpressureEventType;
  readonly consumerId: BackpressureConsumerId;
  readonly occurredAt: number;
  readonly state: BackpressureConsumerState;
  readonly queueEntryId?: BackpressureQueueEntryId;
  readonly streamEventId?: string;
  readonly reason?: string;
}

export type BackpressureEventListener = (
  event: BackpressureEvent,
) => void;

export interface BackpressureConsumerSnapshot {
  readonly consumerId: BackpressureConsumerId;
  readonly exchangeId?: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly state: BackpressureConsumerState;
  readonly healthStatus: BackpressureHealthStatus;
  readonly registeredAt: number;
  readonly lastChangedAt: number;
  readonly lastAdmissionAt?: number;
  readonly lastDispatchAt?: number;
  readonly lastAcknowledgementAt?: number;
  readonly lastFailureAt?: number;
  readonly queuedEventCount: number;
  readonly inFlightEventCount: number;
  readonly pendingEventCount: number;
  readonly acceptedEventCount: number;
  readonly rejectedEventCount: number;
  readonly droppedEventCount: number;
  readonly dispatchedEventCount: number;
  readonly acknowledgedEventCount: number;
  readonly failedEventCount: number;
  readonly timedOutEventCount: number;
  readonly pauseCount: number;
  readonly resumeCount: number;
  readonly maximumObservedPendingEvents: number;
  readonly maxPendingEvents: number;
  readonly highWatermarkCount: number;
  readonly lowWatermarkCount: number;
  readonly acknowledgementTimeoutMs: number;
  readonly drainBatchSize: number;
  readonly overflowPolicy: BackpressureOverflowPolicy;
  readonly timeoutAction: BackpressureTimeoutAction;
  readonly queuedEntryIds: readonly BackpressureQueueEntryId[];
  readonly inFlightEntryIds: readonly BackpressureQueueEntryId[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface BackpressureControllerSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalConsumers: number;
  readonly activeConsumers: number;
  readonly pausedConsumers: number;
  readonly degradedConsumers: number;
  readonly failedConsumers: number;
  readonly totalQueuedEvents: number;
  readonly totalInFlightEvents: number;
  readonly totalPendingEvents: number;
  readonly maximumGlobalPendingEvents: number;
  readonly consumers: readonly BackpressureConsumerSnapshot[];
}

export interface BackpressureTickFailure {
  readonly consumerId: BackpressureConsumerId;
  readonly entryId: BackpressureQueueEntryId;
  readonly error: Error;
}

export interface BackpressureTickResult {
  readonly processedAt: number;
  readonly timedOutEntryIds: readonly BackpressureQueueEntryId[];
  readonly resumedConsumerIds: readonly BackpressureConsumerId[];
  readonly failedConsumerIds: readonly BackpressureConsumerId[];
  readonly failures: readonly BackpressureTickFailure[];
}

interface MutableQueueEntry {
  readonly entryId: BackpressureQueueEntryId;
  readonly consumerId: BackpressureConsumerId;
  readonly event: UnifiedStreamEvent;
  readonly admittedAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;

  dispatchedAt?: number;
  attempt: number;
}

interface MutableConsumerRecord {
  readonly consumerId: BackpressureConsumerId;
  readonly exchangeId?: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly registeredAt: number;
  readonly maxPendingEvents: number;
  readonly highWatermarkCount: number;
  readonly lowWatermarkCount: number;
  readonly acknowledgementTimeoutMs: number;
  readonly drainBatchSize: number;
  readonly overflowPolicy: BackpressureOverflowPolicy;
  readonly timeoutAction: BackpressureTimeoutAction;
  readonly metadata: Readonly<Record<string, unknown>>;

  state: BackpressureConsumerState;
  lastChangedAt: number;
  lastAdmissionAt?: number;
  lastDispatchAt?: number;
  lastAcknowledgementAt?: number;
  lastFailureAt?: number;
  readonly queue: MutableQueueEntry[];
  readonly inFlight: Map<BackpressureQueueEntryId, MutableQueueEntry>;
  acceptedEventCount: number;
  rejectedEventCount: number;
  droppedEventCount: number;
  dispatchedEventCount: number;
  acknowledgedEventCount: number;
  failedEventCount: number;
  timedOutEventCount: number;
  pauseCount: number;
  resumeCount: number;
  maximumObservedPendingEvents: number;
}

const DEFAULT_MAX_GLOBAL_PENDING_EVENTS = 100_000;
const DEFAULT_MAX_PENDING_PER_CONSUMER = 10_000;
const DEFAULT_HIGH_WATERMARK_RATIO = 0.8;
const DEFAULT_LOW_WATERMARK_RATIO = 0.5;
const DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_DRAIN_BATCH_SIZE = 100;
const DEFAULT_OVERFLOW_POLICY: BackpressureOverflowPolicy =
  "PAUSE_CONSUMER";
const DEFAULT_TIMEOUT_ACTION: BackpressureTimeoutAction =
  "MARK_DEGRADED";

const SYSTEM_CLOCK: BackpressureControllerClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

export class BackpressureControllerError extends Error {
  public readonly code: string;
  public readonly consumerId?: BackpressureConsumerId;
  public readonly entryId?: BackpressureQueueEntryId;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly consumerId?: BackpressureConsumerId;
      readonly entryId?: BackpressureQueueEntryId;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "BackpressureControllerError";
    this.code = code;
    this.consumerId = context?.consumerId;
    this.entryId = context?.entryId;
  }
}

/**
 * Deterministic bounded backpressure and consumer-flow controller.
 */
export class BackpressureController {
  private readonly consumers =
    new Map<BackpressureConsumerId, MutableConsumerRecord>();

  private readonly listeners =
    new Set<BackpressureEventListener>();

  private readonly clock: BackpressureControllerClock;

  private readonly maxGlobalPendingEvents: number;
  private readonly defaultMaxPendingEventsPerConsumer: number;
  private readonly defaultHighWatermarkRatio: number;
  private readonly defaultLowWatermarkRatio: number;
  private readonly defaultAcknowledgementTimeoutMs: number;
  private readonly defaultDrainBatchSize: number;
  private readonly defaultOverflowPolicy: BackpressureOverflowPolicy;
  private readonly defaultTimeoutAction: BackpressureTimeoutAction;

  private nextEntrySequence = 1;
  private nextOperationId = 1;
  private nextEventId = 1;
  private disposed = false;

  public constructor(
    options: BackpressureControllerOptions = {},
    clock: BackpressureControllerClock = SYSTEM_CLOCK,
  ) {
    this.clock = validateClock(clock);

    this.maxGlobalPendingEvents =
      validatePositiveSafeInteger(
        options.maxGlobalPendingEvents ??
          DEFAULT_MAX_GLOBAL_PENDING_EVENTS,
        "maxGlobalPendingEvents",
      );

    this.defaultMaxPendingEventsPerConsumer =
      validatePositiveSafeInteger(
        options.defaultMaxPendingEventsPerConsumer ??
          DEFAULT_MAX_PENDING_PER_CONSUMER,
        "defaultMaxPendingEventsPerConsumer",
      );

    if (
      this.defaultMaxPendingEventsPerConsumer >
      this.maxGlobalPendingEvents
    ) {
      throw new BackpressureControllerError(
        "INVALID_BACKPRESSURE_CAPACITY",
        "defaultMaxPendingEventsPerConsumer cannot exceed maxGlobalPendingEvents.",
      );
    }

    this.defaultHighWatermarkRatio = validateRatio(
      options.defaultHighWatermarkRatio ??
        DEFAULT_HIGH_WATERMARK_RATIO,
      "defaultHighWatermarkRatio",
      false,
    );

    this.defaultLowWatermarkRatio = validateRatio(
      options.defaultLowWatermarkRatio ??
        DEFAULT_LOW_WATERMARK_RATIO,
      "defaultLowWatermarkRatio",
      true,
    );

    if (
      this.defaultLowWatermarkRatio >=
      this.defaultHighWatermarkRatio
    ) {
      throw new BackpressureControllerError(
        "INVALID_WATERMARK_CONFIGURATION",
        "defaultLowWatermarkRatio must be lower than defaultHighWatermarkRatio.",
      );
    }

    this.defaultAcknowledgementTimeoutMs =
      validateNonNegativeFiniteNumber(
        options.defaultAcknowledgementTimeoutMs ??
          DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS,
        "defaultAcknowledgementTimeoutMs",
      );

    this.defaultDrainBatchSize =
      validatePositiveSafeInteger(
        options.defaultDrainBatchSize ??
          DEFAULT_DRAIN_BATCH_SIZE,
        "defaultDrainBatchSize",
      );

    this.defaultOverflowPolicy =
      options.defaultOverflowPolicy ??
      DEFAULT_OVERFLOW_POLICY;

    validateOverflowPolicy(
      this.defaultOverflowPolicy,
    );

    this.defaultTimeoutAction =
      options.defaultTimeoutAction ??
      DEFAULT_TIMEOUT_ACTION;

    validateTimeoutAction(
      this.defaultTimeoutAction,
    );
  }

  /**
   * Registers a consumer with an isolated bounded queue.
   */
  public register(
    registration: BackpressureConsumerRegistration,
  ): BackpressureConsumerSnapshot {
    this.assertActive();
    validateRegistration(registration);

    const consumerId =
      normalizeConsumerId(registration.consumerId);

    if (this.consumers.has(consumerId)) {
      throw new BackpressureControllerError(
        "DUPLICATE_BACKPRESSURE_CONSUMER",
        `Backpressure consumer "${consumerId}" is already registered.`,
        {
          consumerId,
        },
      );
    }

    const maxPendingEvents =
      validatePositiveSafeInteger(
        registration.maxPendingEvents ??
          this.defaultMaxPendingEventsPerConsumer,
        "registration.maxPendingEvents",
      );

    if (
      maxPendingEvents >
      this.maxGlobalPendingEvents
    ) {
      throw new BackpressureControllerError(
        "CONSUMER_CAPACITY_EXCEEDS_GLOBAL_LIMIT",
        `Consumer capacity ${maxPendingEvents} exceeds global capacity ${this.maxGlobalPendingEvents}.`,
        {
          consumerId,
        },
      );
    }

    const highWatermarkRatio = validateRatio(
      registration.highWatermarkRatio ??
        this.defaultHighWatermarkRatio,
      "registration.highWatermarkRatio",
      false,
    );

    const lowWatermarkRatio = validateRatio(
      registration.lowWatermarkRatio ??
        this.defaultLowWatermarkRatio,
      "registration.lowWatermarkRatio",
      true,
    );

    if (lowWatermarkRatio >= highWatermarkRatio) {
      throw new BackpressureControllerError(
        "INVALID_CONSUMER_WATERMARK_CONFIGURATION",
        "Consumer lowWatermarkRatio must be lower than highWatermarkRatio.",
        {
          consumerId,
        },
      );
    }

    const highWatermarkCount = Math.max(
      1,
      Math.ceil(
        maxPendingEvents * highWatermarkRatio,
      ),
    );

    const lowWatermarkCount = Math.max(
      0,
      Math.floor(
        maxPendingEvents * lowWatermarkRatio,
      ),
    );

    const acknowledgementTimeoutMs =
      validateNonNegativeFiniteNumber(
        registration.acknowledgementTimeoutMs ??
          this.defaultAcknowledgementTimeoutMs,
        "registration.acknowledgementTimeoutMs",
      );

    const drainBatchSize =
      validatePositiveSafeInteger(
        registration.drainBatchSize ??
          this.defaultDrainBatchSize,
        "registration.drainBatchSize",
      );

    const overflowPolicy =
      registration.overflowPolicy ??
      this.defaultOverflowPolicy;

    validateOverflowPolicy(overflowPolicy);

    const timeoutAction =
      registration.timeoutAction ??
      this.defaultTimeoutAction;

    validateTimeoutAction(timeoutAction);

    const timestamp = this.now();

    const record: MutableConsumerRecord = {
      consumerId,
      exchangeId:
        registration.exchangeId === undefined
          ? undefined
          : normalizeExchangeId(
              registration.exchangeId,
            ),
      connectionId:
        registration.connectionId === undefined
          ? undefined
          : normalizeConnectionId(
              registration.connectionId,
            ),
      registeredAt: timestamp,
      maxPendingEvents,
      highWatermarkCount,
      lowWatermarkCount,
      acknowledgementTimeoutMs,
      drainBatchSize,
      overflowPolicy,
      timeoutAction,
      metadata:
        registration.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({
              ...registration.metadata,
            }),
      state: "ACTIVE",
      lastChangedAt: timestamp,
      queue: [],
      inFlight:
        new Map<
          BackpressureQueueEntryId,
          MutableQueueEntry
        >(),
      acceptedEventCount: 0,
      rejectedEventCount: 0,
      droppedEventCount: 0,
      dispatchedEventCount: 0,
      acknowledgedEventCount: 0,
      failedEventCount: 0,
      timedOutEventCount: 0,
      pauseCount: 0,
      resumeCount: 0,
      maximumObservedPendingEvents: 0,
    };

    this.consumers.set(consumerId, record);

    this.emit({
      type: "CONSUMER_REGISTERED",
      record,
    });

    return createConsumerSnapshot(record);
  }

  /**
   * Removes an empty consumer.
   */
  public unregister(
    consumerId: BackpressureConsumerId,
    force = false,
  ): BackpressureConsumerSnapshot {
    this.assertActive();

    const normalizedConsumerId =
      normalizeConsumerId(consumerId);

    const record = this.getRequiredConsumer(
      normalizedConsumerId,
    );

    const pendingCount = getPendingCount(record);

    if (pendingCount > 0 && !force) {
      throw new BackpressureControllerError(
        "CONSUMER_HAS_PENDING_EVENTS",
        `Consumer "${normalizedConsumerId}" has ${pendingCount} pending event(s).`,
        {
          consumerId: normalizedConsumerId,
        },
      );
    }

    if (force && pendingCount > 0) {
      const droppedCount = pendingCount;

      record.queue.length = 0;
      record.inFlight.clear();
      record.droppedEventCount += droppedCount;
    }

    record.state = "DISPOSED";
    record.lastChangedAt = this.now();

    const snapshot = createConsumerSnapshot(record);

    this.consumers.delete(normalizedConsumerId);

    this.emit({
      type: "CONSUMER_UNREGISTERED",
      record,
    });

    return snapshot;
  }

  /**
   * Attempts to admit one event into a consumer queue.
   */
  public admit(
    request: BackpressureAdmissionRequest,
  ): BackpressureAdmissionResult {
    this.assertActive();
    validateAdmissionRequest(request);

    const consumerId =
      normalizeConsumerId(request.consumerId);

    const record =
      this.getRequiredConsumer(consumerId);

    const event =
      freezeUnifiedStreamEvent(request.event);

    const occurredAt =
      request.admittedAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "request.admittedAt",
    );

    if (occurredAt < record.lastChangedAt) {
      throw new BackpressureControllerError(
        "NON_MONOTONIC_ADMISSION_TIMESTAMP",
        `Admission timestamp ${occurredAt} is earlier than consumer timestamp ${record.lastChangedAt}.`,
        {
          consumerId,
        },
      );
    }

    if (record.state === "FAILED") {
      record.rejectedEventCount += 1;

      return this.createAdmissionResult({
        status: "CONSUMER_FAILED",
        record,
        event,
        occurredAt,
        droppedEntryIds: [],
        reason: "Consumer is failed.",
      });
    }

    if (record.state === "DISPOSED") {
      throw new BackpressureControllerError(
        "BACKPRESSURE_CONSUMER_DISPOSED",
        `Consumer "${consumerId}" has been disposed.`,
        {
          consumerId,
        },
      );
    }

    if (record.state === "PAUSED") {
      record.rejectedEventCount += 1;

      return this.createAdmissionResult({
        status: "CONSUMER_PAUSED",
        record,
        event,
        occurredAt,
        droppedEntryIds: [],
        reason: "Consumer is paused.",
      });
    }

    const globalPendingCount =
      this.getGlobalPendingCount();

    const consumerPendingCount =
      getPendingCount(record);

    const globalAtCapacity =
      globalPendingCount >=
      this.maxGlobalPendingEvents;

    const consumerAtCapacity =
      consumerPendingCount >=
      record.maxPendingEvents;

    const droppedEntryIds:
      BackpressureQueueEntryId[] = [];

    if (globalAtCapacity || consumerAtCapacity) {
      const overflowResult =
        this.handleOverflow(
          record,
          event,
          occurredAt,
          globalAtCapacity,
          droppedEntryIds,
        );

      if (overflowResult !== undefined) {
        return overflowResult;
      }
    }

    const entry: MutableQueueEntry = {
      entryId: this.createEntryId(consumerId),
      consumerId,
      event,
      admittedAt: occurredAt,
      attempt: 0,
      metadata:
        request.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({
              ...request.metadata,
            }),
    };

    record.queue.push(entry);
    record.lastAdmissionAt = occurredAt;
    record.lastChangedAt = occurredAt;
    record.acceptedEventCount += 1;

    const pendingAfterAdmission =
      getPendingCount(record);

    record.maximumObservedPendingEvents =
      Math.max(
        record.maximumObservedPendingEvents,
        pendingAfterAdmission,
      );

    this.emit({
      type: "EVENT_ACCEPTED",
      record,
      occurredAt,
      queueEntryId: entry.entryId,
      streamEventId: event.eventId,
    });

    this.reconcileWatermarks(record, occurredAt);

    return this.createAdmissionResult({
      status: "ACCEPTED",
      record,
      event,
      occurredAt,
      entry,
      droppedEntryIds,
    });
  }

  /**
   * Moves queued events into the in-flight collection.
   */
  public drain(
    consumerId: BackpressureConsumerId,
    limit?: number,
  ): BackpressureDrainResult {
    this.assertActive();

    const normalizedConsumerId =
      normalizeConsumerId(consumerId);

    const record = this.getRequiredConsumer(
      normalizedConsumerId,
    );

    if (
      record.state === "FAILED" ||
      record.state === "DISPOSED"
    ) {
      throw new BackpressureControllerError(
        "CONSUMER_NOT_DRAINABLE",
        `Consumer "${normalizedConsumerId}" cannot be drained from state "${record.state}".`,
        {
          consumerId: normalizedConsumerId,
        },
      );
    }

    const batchSize =
      limit === undefined
        ? record.drainBatchSize
        : validatePositiveSafeInteger(
            limit,
            "limit",
          );

    const drainedAt = this.now();

    const entries = record.queue.splice(
      0,
      batchSize,
    );

    const snapshots: BackpressureQueueEntry[] = [];

    for (const entry of entries) {
      entry.dispatchedAt = drainedAt;
      entry.attempt += 1;

      record.inFlight.set(
        entry.entryId,
        entry,
      );

      record.dispatchedEventCount += 1;
      record.lastDispatchAt = drainedAt;

      snapshots.push(createEntrySnapshot(entry));

      this.emit({
        type: "EVENT_DISPATCHED",
        record,
        occurredAt: drainedAt,
        queueEntryId: entry.entryId,
        streamEventId: entry.event.eventId,
      });
    }

    record.lastChangedAt = drainedAt;

    this.reconcileWatermarks(record, drainedAt);

    const result: BackpressureDrainResult =
      Object.freeze({
        operationId: this.nextOperationId,
        consumerId: normalizedConsumerId,
        drainedAt,
        entries: Object.freeze(snapshots),
        remainingQueuedEventCount:
          record.queue.length,
        inFlightEventCount:
          record.inFlight.size,
      });

    this.nextOperationId += 1;

    return result;
  }

  /**
   * Acknowledges successful processing of an in-flight event.
   */
  public acknowledge(
    acknowledgement: BackpressureAcknowledgement,
  ): BackpressureConsumerSnapshot {
    this.assertActive();
    validateAcknowledgement(acknowledgement);

    const consumerId =
      normalizeConsumerId(
        acknowledgement.consumerId,
      );

    const entryId =
      normalizeEntryId(
        acknowledgement.entryId,
      );

    const record =
      this.getRequiredConsumer(consumerId);

    const entry = record.inFlight.get(entryId);

    if (entry === undefined) {
      throw new BackpressureControllerError(
        "IN_FLIGHT_ENTRY_NOT_FOUND",
        `In-flight entry "${entryId}" was not found for consumer "${consumerId}".`,
        {
          consumerId,
          entryId,
        },
      );
    }

    const acknowledgedAt =
      acknowledgement.acknowledgedAt ??
      this.now();

    validateTimestamp(
      acknowledgedAt,
      "acknowledgement.acknowledgedAt",
    );

    if (
      entry.dispatchedAt !== undefined &&
      acknowledgedAt < entry.dispatchedAt
    ) {
      throw new BackpressureControllerError(
        "INVALID_ACKNOWLEDGEMENT_TIMESTAMP",
        `Acknowledgement timestamp ${acknowledgedAt} is earlier than dispatch timestamp ${entry.dispatchedAt}.`,
        {
          consumerId,
          entryId,
        },
      );
    }

    record.inFlight.delete(entryId);
    record.acknowledgedEventCount += 1;
    record.lastAcknowledgementAt =
      acknowledgedAt;
    record.lastChangedAt = acknowledgedAt;

    this.emit({
      type: "EVENT_ACKNOWLEDGED",
      record,
      occurredAt: acknowledgedAt,
      queueEntryId: entryId,
      streamEventId: entry.event.eventId,
    });

    this.reconcileWatermarks(
      record,
      acknowledgedAt,
    );

    return createConsumerSnapshot(record);
  }

  /**
   * Reports failed processing of an in-flight event.
   */
  public fail(
    failure: BackpressureFailure,
  ): BackpressureConsumerSnapshot {
    this.assertActive();
    validateFailure(failure);

    const consumerId =
      normalizeConsumerId(failure.consumerId);

    const entryId =
      normalizeEntryId(failure.entryId);

    const record =
      this.getRequiredConsumer(consumerId);

    const entry = record.inFlight.get(entryId);

    if (entry === undefined) {
      throw new BackpressureControllerError(
        "IN_FLIGHT_ENTRY_NOT_FOUND",
        `In-flight entry "${entryId}" was not found for consumer "${consumerId}".`,
        {
          consumerId,
          entryId,
        },
      );
    }

    const failedAt =
      failure.failedAt ?? this.now();

    validateTimestamp(
      failedAt,
      "failure.failedAt",
    );

    record.inFlight.delete(entryId);
    record.failedEventCount += 1;
    record.lastFailureAt = failedAt;
    record.lastChangedAt = failedAt;

    if (failure.retry ?? false) {
      entry.dispatchedAt = undefined;
      record.queue.unshift(entry);
    }

    this.emit({
      type: "EVENT_FAILED",
      record,
      occurredAt: failedAt,
      queueEntryId: entryId,
      streamEventId: entry.event.eventId,
      reason: failure.reason.trim(),
    });

    if (record.state === "ACTIVE") {
      this.changeState(
        record,
        "DEGRADED",
        failedAt,
        "Consumer event processing failed.",
      );
    }

    this.reconcileWatermarks(record, failedAt);

    return createConsumerSnapshot(record);
  }

  /**
   * Manually pauses a consumer.
   */
  public pause(
    consumerId: BackpressureConsumerId,
    reason = "Consumer paused manually.",
  ): BackpressureConsumerSnapshot {
    this.assertActive();

    const record = this.getRequiredConsumer(
      normalizeConsumerId(consumerId),
    );

    const timestamp = this.now();

    this.changeState(
      record,
      "PAUSED",
      timestamp,
      validateReason(reason),
    );

    return createConsumerSnapshot(record);
  }

  /**
   * Resumes a consumer when it is below its low watermark.
   */
  public resume(
    consumerId: BackpressureConsumerId,
    force = false,
  ): BackpressureConsumerSnapshot {
    this.assertActive();

    const normalizedConsumerId =
      normalizeConsumerId(consumerId);

    const record =
      this.getRequiredConsumer(
        normalizedConsumerId,
      );

    if (record.state === "FAILED") {
      throw new BackpressureControllerError(
        "FAILED_CONSUMER_REQUIRES_RESET",
        `Consumer "${normalizedConsumerId}" must be reset before it can resume.`,
        {
          consumerId: normalizedConsumerId,
        },
      );
    }

    if (
      !force &&
      getPendingCount(record) >
        record.lowWatermarkCount
    ) {
      throw new BackpressureControllerError(
        "CONSUMER_ABOVE_LOW_WATERMARK",
        `Consumer "${normalizedConsumerId}" cannot resume while pending events exceed the low watermark.`,
        {
          consumerId: normalizedConsumerId,
        },
      );
    }

    const timestamp = this.now();

    this.changeState(
      record,
      "ACTIVE",
      timestamp,
      "Consumer resumed.",
    );

    return createConsumerSnapshot(record);
  }

  /**
   * Clears failure state and optionally discards pending events.
   */
  public reset(
    consumerId: BackpressureConsumerId,
    clearPendingEvents = false,
  ): BackpressureConsumerSnapshot {
    this.assertActive();

    const normalizedConsumerId =
      normalizeConsumerId(consumerId);

    const record =
      this.getRequiredConsumer(
        normalizedConsumerId,
      );

    if (clearPendingEvents) {
      const droppedCount =
        getPendingCount(record);

      record.queue.length = 0;
      record.inFlight.clear();
      record.droppedEventCount += droppedCount;
    }

    const timestamp = this.now();

    record.state = "ACTIVE";
    record.lastChangedAt = timestamp;

    this.emit({
      type: "CONSUMER_RESET",
      record,
      occurredAt: timestamp,
      reason: clearPendingEvents
        ? "Consumer reset and pending events cleared."
        : "Consumer reset.",
    });

    return createConsumerSnapshot(record);
  }

  /**
   * Evaluates acknowledgement timeouts and automatic recovery conditions.
   */
  public tick(): BackpressureTickResult {
    this.assertActive();

    const processedAt = this.now();

    const timedOutEntryIds:
      BackpressureQueueEntryId[] = [];

    const resumedConsumerIds:
      BackpressureConsumerId[] = [];

    const failedConsumerIds:
      BackpressureConsumerId[] = [];

    const failures: BackpressureTickFailure[] = [];

    for (const record of this.getOrderedConsumers()) {
      if (record.acknowledgementTimeoutMs > 0) {
        const timedOutEntries = [
          ...record.inFlight.values(),
        ]
          .filter(
            (entry) =>
              entry.dispatchedAt !== undefined &&
              processedAt - entry.dispatchedAt >=
                record.acknowledgementTimeoutMs,
          )
          .sort(compareEntries);

        for (const entry of timedOutEntries) {
          try {
            this.handleTimedOutEntry(
              record,
              entry,
              processedAt,
            );

            timedOutEntryIds.push(entry.entryId);
          } catch (error: unknown) {
            failures.push({
              consumerId: record.consumerId,
              entryId: entry.entryId,
              error: normalizeError(error),
            });
          }
        }
      }

      const previousState = record.state;

      this.reconcileWatermarks(
        record,
        processedAt,
      );

      if (
        previousState === "PAUSED" &&
        record.state === "ACTIVE"
      ) {
        resumedConsumerIds.push(
          record.consumerId,
        );
      }

      if (
        previousState !== "FAILED" &&
        record.state === "FAILED"
      ) {
        failedConsumerIds.push(
          record.consumerId,
        );
      }
    }

    return Object.freeze({
      processedAt,
      timedOutEntryIds: Object.freeze([
        ...timedOutEntryIds,
      ]),
      resumedConsumerIds: Object.freeze([
        ...resumedConsumerIds,
      ]),
      failedConsumerIds: Object.freeze([
        ...failedConsumerIds,
      ]),
      failures: Object.freeze(
        failures.map((failure) =>
          Object.freeze({
            ...failure,
          }),
        ),
      ),
    });
  }

  public subscribe(
    listener: BackpressureEventListener,
  ): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new BackpressureControllerError(
        "INVALID_BACKPRESSURE_LISTENER",
        "Backpressure event listener must be a function.",
      );
    }

    this.listeners.add(listener);

    let subscribed = true;

    return (): void => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  public getConsumer(
    consumerId: BackpressureConsumerId,
  ): BackpressureConsumerSnapshot | undefined {
    const normalizedConsumerId =
      normalizeConsumerId(consumerId);

    const record =
      this.consumers.get(normalizedConsumerId);

    return record === undefined
      ? undefined
      : createConsumerSnapshot(record);
  }

  public getConsumersForExchange(
    exchangeId: StreamingExchangeId,
  ): readonly BackpressureConsumerSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedConsumers()
        .filter(
          (record) =>
            record.exchangeId ===
            normalizedExchangeId,
        )
        .map((record) =>
          createConsumerSnapshot(record),
        ),
    );
  }

  public getConsumersForConnection(
    connectionId: StreamingConnectionId,
  ): readonly BackpressureConsumerSnapshot[] {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    return Object.freeze(
      this.getOrderedConsumers()
        .filter(
          (record) =>
            record.connectionId ===
            normalizedConnectionId,
        )
        .map((record) =>
          createConsumerSnapshot(record),
        ),
    );
  }

  public getSnapshot():
    BackpressureControllerSnapshot {
    const consumers =
      this.getOrderedConsumers().map((record) =>
        createConsumerSnapshot(record),
      );

    let activeConsumers = 0;
    let pausedConsumers = 0;
    let degradedConsumers = 0;
    let failedConsumers = 0;
    let totalQueuedEvents = 0;
    let totalInFlightEvents = 0;

    for (const consumer of consumers) {
      switch (consumer.state) {
        case "ACTIVE":
          activeConsumers += 1;
          break;

        case "PAUSED":
          pausedConsumers += 1;
          break;

        case "DEGRADED":
          degradedConsumers += 1;
          break;

        case "FAILED":
          failedConsumers += 1;
          break;

        case "DISPOSED":
          break;

        default:
          assertNever(consumer.state);
      }

      totalQueuedEvents +=
        consumer.queuedEventCount;

      totalInFlightEvents +=
        consumer.inFlightEventCount;
    }

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalConsumers: consumers.length,
      activeConsumers,
      pausedConsumers,
      degradedConsumers,
      failedConsumers,
      totalQueuedEvents,
      totalInFlightEvents,
      totalPendingEvents:
        totalQueuedEvents +
        totalInFlightEvents,
      maximumGlobalPendingEvents:
        this.maxGlobalPendingEvents,
      consumers: Object.freeze(consumers),
    });
  }

  public get consumerCount(): number {
    return this.consumers.size;
  }

  public get pendingEventCount(): number {
    return this.getGlobalPendingCount();
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    for (const record of this.consumers.values()) {
      record.state = "DISPOSED";
      record.queue.length = 0;
      record.inFlight.clear();
      record.lastChangedAt = this.now();
    }

    this.consumers.clear();
    this.listeners.clear();
    this.disposed = true;
  }

  private handleOverflow(
    record: MutableConsumerRecord,
    event: UnifiedStreamEvent,
    occurredAt: number,
    globalAtCapacity: boolean,
    droppedEntryIds: BackpressureQueueEntryId[],
  ): BackpressureAdmissionResult | undefined {
    switch (record.overflowPolicy) {
      case "REJECT_NEWEST":
        record.rejectedEventCount += 1;
        record.lastChangedAt = occurredAt;

        this.emit({
          type: "EVENT_REJECTED",
          record,
          occurredAt,
          streamEventId: event.eventId,
          reason: "Backpressure capacity exceeded.",
        });

        return this.createAdmissionResult({
          status: "REJECTED",
          record,
          event,
          occurredAt,
          droppedEntryIds,
          reason:
            "Backpressure capacity exceeded.",
        });

      case "DROP_NEWEST":
        record.droppedEventCount += 1;
        record.lastChangedAt = occurredAt;

        this.emit({
          type: "EVENT_DROPPED",
          record,
          occurredAt,
          streamEventId: event.eventId,
          reason:
            "Newest event dropped because capacity was exceeded.",
        });

        return this.createAdmissionResult({
          status: "DROPPED",
          record,
          event,
          occurredAt,
          droppedEntryIds,
          reason:
            "Newest event dropped because capacity was exceeded.",
        });

      case "DROP_OLDEST": {
        const candidate = globalAtCapacity
          ? this.getGlobalOldestQueuedEntry()
          : this.getOldestQueuedEntry(record);

        if (candidate === undefined) {
          record.rejectedEventCount += 1;

          return this.createAdmissionResult({
            status: "REJECTED",
            record,
            event,
            occurredAt,
            droppedEntryIds,
            reason:
              "No queued event was available for eviction.",
          });
        }

        this.dropQueuedEntry(
          candidate.record,
          candidate.entry,
          occurredAt,
          "Oldest queued event dropped because capacity was exceeded.",
        );

        droppedEntryIds.push(
          candidate.entry.entryId,
        );

        return undefined;
      }

      case "PAUSE_CONSUMER":
        this.changeState(
          record,
          "PAUSED",
          occurredAt,
          "Consumer capacity exceeded.",
        );

        record.rejectedEventCount += 1;

        return this.createAdmissionResult({
          status: "CONSUMER_PAUSED",
          record,
          event,
          occurredAt,
          droppedEntryIds,
          reason:
            "Consumer paused because capacity was exceeded.",
        });

      case "FAIL_CONSUMER":
        this.changeState(
          record,
          "FAILED",
          occurredAt,
          "Consumer capacity exceeded.",
        );

        record.rejectedEventCount += 1;

        return this.createAdmissionResult({
          status: "CONSUMER_FAILED",
          record,
          event,
          occurredAt,
          droppedEntryIds,
          reason:
            "Consumer failed because capacity was exceeded.",
        });

      default:
        return assertNever(record.overflowPolicy);
    }
  }

  private handleTimedOutEntry(
    record: MutableConsumerRecord,
    entry: MutableQueueEntry,
    occurredAt: number,
  ): void {
    record.timedOutEventCount += 1;
    record.lastFailureAt = occurredAt;
    record.lastChangedAt = occurredAt;

    this.emit({
      type: "EVENT_TIMED_OUT",
      record,
      occurredAt,
      queueEntryId: entry.entryId,
      streamEventId: entry.event.eventId,
      reason:
        "Event acknowledgement timeout exceeded.",
    });

    switch (record.timeoutAction) {
      case "MARK_DEGRADED":
        this.changeState(
          record,
          "DEGRADED",
          occurredAt,
          "Event acknowledgement timed out.",
        );
        break;

      case "PAUSE_CONSUMER":
        this.changeState(
          record,
          "PAUSED",
          occurredAt,
          "Event acknowledgement timed out.",
        );
        break;

      case "FAIL_CONSUMER":
        this.changeState(
          record,
          "FAILED",
          occurredAt,
          "Event acknowledgement timed out.",
        );
        break;

      case "DROP_TIMED_OUT":
        record.inFlight.delete(entry.entryId);
        record.droppedEventCount += 1;

        this.emit({
          type: "EVENT_DROPPED",
          record,
          occurredAt,
          queueEntryId: entry.entryId,
          streamEventId: entry.event.eventId,
          reason:
            "Timed-out event was dropped.",
        });
        break;

      default:
        assertNever(record.timeoutAction);
    }
  }

  private reconcileWatermarks(
    record: MutableConsumerRecord,
    occurredAt: number,
  ): void {
    if (
      record.state === "FAILED" ||
      record.state === "DISPOSED"
    ) {
      return;
    }

    const pendingCount = getPendingCount(record);

    if (
      pendingCount >=
        record.highWatermarkCount &&
      record.state !== "PAUSED"
    ) {
      this.changeState(
        record,
        "PAUSED",
        occurredAt,
        "Consumer reached high watermark.",
      );

      return;
    }

    if (
      record.state === "PAUSED" &&
      pendingCount <= record.lowWatermarkCount
    ) {
      this.changeState(
        record,
        "ACTIVE",
        occurredAt,
        "Consumer returned below low watermark.",
      );

      return;
    }

    if (
      record.state === "DEGRADED" &&
      pendingCount <= record.lowWatermarkCount
    ) {
      this.changeState(
        record,
        "ACTIVE",
        occurredAt,
        "Consumer recovered below low watermark.",
      );
    }
  }

  private changeState(
    record: MutableConsumerRecord,
    nextState: BackpressureConsumerState,
    occurredAt: number,
    reason: string,
  ): void {
    if (record.state === nextState) {
      return;
    }

    const previousState = record.state;

    record.state = nextState;
    record.lastChangedAt = occurredAt;

    switch (nextState) {
      case "PAUSED":
        record.pauseCount += 1;

        this.emit({
          type: "CONSUMER_PAUSED",
          record,
          occurredAt,
          reason,
        });
        break;

      case "ACTIVE":
        if (
          previousState === "PAUSED" ||
          previousState === "DEGRADED"
        ) {
          record.resumeCount += 1;

          this.emit({
            type: "CONSUMER_RESUMED",
            record,
            occurredAt,
            reason,
          });
        }
        break;

      case "DEGRADED":
        this.emit({
          type: "CONSUMER_DEGRADED",
          record,
          occurredAt,
          reason,
        });
        break;

      case "FAILED":
        this.emit({
          type: "CONSUMER_FAILED",
          record,
          occurredAt,
          reason,
        });
        break;

      case "DISPOSED":
        break;

      default:
        assertNever(nextState);
    }
  }

  private dropQueuedEntry(
    record: MutableConsumerRecord,
    entry: MutableQueueEntry,
    occurredAt: number,
    reason: string,
  ): void {
    const index = record.queue.findIndex(
      (candidate) =>
        candidate.entryId === entry.entryId,
    );

    if (index < 0) {
      throw new BackpressureControllerError(
        "QUEUED_ENTRY_NOT_FOUND",
        `Queued entry "${entry.entryId}" was not found.`,
        {
          consumerId: record.consumerId,
          entryId: entry.entryId,
        },
      );
    }

    record.queue.splice(index, 1);
    record.droppedEventCount += 1;
    record.lastChangedAt = occurredAt;

    this.emit({
      type: "EVENT_DROPPED",
      record,
      occurredAt,
      queueEntryId: entry.entryId,
      streamEventId: entry.event.eventId,
      reason,
    });
  }

  private getOldestQueuedEntry(
    record: MutableConsumerRecord,
  ):
    | {
        readonly record: MutableConsumerRecord;
        readonly entry: MutableQueueEntry;
      }
    | undefined {
    const entry = [...record.queue].sort(
      compareEntries,
    )[0];

    return entry === undefined
      ? undefined
      : {
          record,
          entry,
        };
  }

  private getGlobalOldestQueuedEntry():
    | {
        readonly record: MutableConsumerRecord;
        readonly entry: MutableQueueEntry;
      }
    | undefined {
    const candidates =
      this.getOrderedConsumers()
        .map((record) =>
          this.getOldestQueuedEntry(record),
        )
        .filter(
          (
            candidate,
          ): candidate is {
            readonly record: MutableConsumerRecord;
            readonly entry: MutableQueueEntry;
          } => candidate !== undefined,
        )
        .sort((left, right) => {
          const entryComparison =
            compareEntries(
              left.entry,
              right.entry,
            );

          if (entryComparison !== 0) {
            return entryComparison;
          }

          return left.record.consumerId.localeCompare(
            right.record.consumerId,
          );
        });

    return candidates[0];
  }

  private createAdmissionResult(input: {
    readonly status: BackpressureAdmissionStatus;
    readonly record: MutableConsumerRecord;
    readonly event: UnifiedStreamEvent;
    readonly occurredAt: number;
    readonly entry?: MutableQueueEntry;
    readonly droppedEntryIds:
      readonly BackpressureQueueEntryId[];
    readonly reason?: string;
  }): BackpressureAdmissionResult {
    const result: BackpressureAdmissionResult =
      Object.freeze({
        operationId: this.nextOperationId,
        status: input.status,
        consumerId: input.record.consumerId,
        eventId: input.event.eventId,
        occurredAt: input.occurredAt,
        entry:
          input.entry === undefined
            ? undefined
            : createEntrySnapshot(input.entry),
        droppedEntryIds: Object.freeze([
          ...input.droppedEntryIds,
        ]),
        queuedEventCount:
          input.record.queue.length,
        inFlightEventCount:
          input.record.inFlight.size,
        reason: input.reason,
      });

    this.nextOperationId += 1;

    return result;
  }

  private emit(input: {
    readonly type: BackpressureEventType;
    readonly record: MutableConsumerRecord;
    readonly occurredAt?: number;
    readonly queueEntryId?: BackpressureQueueEntryId;
    readonly streamEventId?: string;
    readonly reason?: string;
  }): void {
    const event: BackpressureEvent =
      Object.freeze({
        eventId: this.nextEventId,
        type: input.type,
        consumerId: input.record.consumerId,
        occurredAt:
          input.occurredAt ?? this.now(),
        state: input.record.state,
        queueEntryId: input.queueEntryId,
        streamEventId: input.streamEventId,
        reason: input.reason,
      });

    this.nextEventId += 1;

    const listeners = [...this.listeners];

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not interrupt backpressure enforcement.
      }
    }
  }

  private createEntryId(
    consumerId: BackpressureConsumerId,
  ): BackpressureQueueEntryId {
    const sequence = this.nextEntrySequence;

    this.nextEntrySequence += 1;

    return [
      "bp",
      consumerId.toLowerCase(),
      sequence.toString().padStart(10, "0"),
    ].join("-");
  }

  private getRequiredConsumer(
    consumerId: BackpressureConsumerId,
  ): MutableConsumerRecord {
    const record = this.consumers.get(consumerId);

    if (record === undefined) {
      throw new BackpressureControllerError(
        "BACKPRESSURE_CONSUMER_NOT_FOUND",
        `Backpressure consumer "${consumerId}" was not found.`,
        {
          consumerId,
        },
      );
    }

    return record;
  }

  private getOrderedConsumers():
    MutableConsumerRecord[] {
    return [...this.consumers.values()].sort(
      (left, right) => {
        if (
          left.registeredAt !==
          right.registeredAt
        ) {
          return (
            left.registeredAt -
            right.registeredAt
          );
        }

        return left.consumerId.localeCompare(
          right.consumerId,
        );
      },
    );
  }

  private getGlobalPendingCount(): number {
    let count = 0;

    for (const record of this.consumers.values()) {
      count += getPendingCount(record);
    }

    return count;
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new BackpressureControllerError(
        "BACKPRESSURE_CONTROLLER_DISPOSED",
        "The backpressure controller has been disposed.",
      );
    }
  }
}

function createEntrySnapshot(
  entry: MutableQueueEntry,
): BackpressureQueueEntry {
  return Object.freeze({
    entryId: entry.entryId,
    consumerId: entry.consumerId,
    event: entry.event,
    admittedAt: entry.admittedAt,
    dispatchedAt: entry.dispatchedAt,
    attempt: entry.attempt,
    metadata: Object.freeze({
      ...entry.metadata,
    }),
  });
}

function createConsumerSnapshot(
  record: MutableConsumerRecord,
): BackpressureConsumerSnapshot {
  const pendingEventCount =
    getPendingCount(record);

  return Object.freeze({
    consumerId: record.consumerId,
    exchangeId: record.exchangeId,
    connectionId: record.connectionId,
    state: record.state,
    healthStatus:
      deriveHealthStatus(record),
    registeredAt: record.registeredAt,
    lastChangedAt: record.lastChangedAt,
    lastAdmissionAt: record.lastAdmissionAt,
    lastDispatchAt: record.lastDispatchAt,
    lastAcknowledgementAt:
      record.lastAcknowledgementAt,
    lastFailureAt: record.lastFailureAt,
    queuedEventCount: record.queue.length,
    inFlightEventCount:
      record.inFlight.size,
    pendingEventCount,
    acceptedEventCount:
      record.acceptedEventCount,
    rejectedEventCount:
      record.rejectedEventCount,
    droppedEventCount:
      record.droppedEventCount,
    dispatchedEventCount:
      record.dispatchedEventCount,
    acknowledgedEventCount:
      record.acknowledgedEventCount,
    failedEventCount:
      record.failedEventCount,
    timedOutEventCount:
      record.timedOutEventCount,
    pauseCount: record.pauseCount,
    resumeCount: record.resumeCount,
    maximumObservedPendingEvents:
      record.maximumObservedPendingEvents,
    maxPendingEvents: record.maxPendingEvents,
    highWatermarkCount:
      record.highWatermarkCount,
    lowWatermarkCount:
      record.lowWatermarkCount,
    acknowledgementTimeoutMs:
      record.acknowledgementTimeoutMs,
    drainBatchSize: record.drainBatchSize,
    overflowPolicy: record.overflowPolicy,
    timeoutAction: record.timeoutAction,
    queuedEntryIds: Object.freeze(
      record.queue.map(
        (entry) => entry.entryId,
      ),
    ),
    inFlightEntryIds: Object.freeze(
      [...record.inFlight.keys()].sort(),
    ),
    metadata: Object.freeze({
      ...record.metadata,
    }),
  });
}

function deriveHealthStatus(
  record: MutableConsumerRecord,
): BackpressureHealthStatus {
  switch (record.state) {
    case "ACTIVE":
      return getPendingCount(record) >=
        record.highWatermarkCount
        ? "DEGRADED"
        : "HEALTHY";

    case "PAUSED":
    case "DEGRADED":
      return "DEGRADED";

    case "FAILED":
      return "UNHEALTHY";

    case "DISPOSED":
      return "UNKNOWN";

    default:
      return assertNever(record.state);
  }
}

function getPendingCount(
  record: MutableConsumerRecord,
): number {
  return (
    record.queue.length +
    record.inFlight.size
  );
}

function compareEntries(
  left: MutableQueueEntry,
  right: MutableQueueEntry,
): number {
  if (left.admittedAt !== right.admittedAt) {
    return left.admittedAt - right.admittedAt;
  }

  return left.entryId.localeCompare(
    right.entryId,
  );
}

function validateRegistration(
  registration: BackpressureConsumerRegistration,
): void {
  if (
    registration === null ||
    typeof registration !== "object"
  ) {
    throw new BackpressureControllerError(
      "INVALID_CONSUMER_REGISTRATION",
      "Backpressure consumer registration must be an object.",
    );
  }

  normalizeConsumerId(registration.consumerId);

  if (registration.exchangeId !== undefined) {
    normalizeExchangeId(
      registration.exchangeId,
    );
  }

  if (
    registration.connectionId !== undefined
  ) {
    normalizeConnectionId(
      registration.connectionId,
    );
  }

  if (
    registration.maxPendingEvents !== undefined
  ) {
    validatePositiveSafeInteger(
      registration.maxPendingEvents,
      "registration.maxPendingEvents",
    );
  }

  if (
    registration.highWatermarkRatio !==
    undefined
  ) {
    validateRatio(
      registration.highWatermarkRatio,
      "registration.highWatermarkRatio",
      false,
    );
  }

  if (
    registration.lowWatermarkRatio !==
    undefined
  ) {
    validateRatio(
      registration.lowWatermarkRatio,
      "registration.lowWatermarkRatio",
      true,
    );
  }

  if (
    registration
      .acknowledgementTimeoutMs !== undefined
  ) {
    validateNonNegativeFiniteNumber(
      registration.acknowledgementTimeoutMs,
      "registration.acknowledgementTimeoutMs",
    );
  }

  if (
    registration.drainBatchSize !== undefined
  ) {
    validatePositiveSafeInteger(
      registration.drainBatchSize,
      "registration.drainBatchSize",
    );
  }

  if (
    registration.overflowPolicy !== undefined
  ) {
    validateOverflowPolicy(
      registration.overflowPolicy,
    );
  }

  if (
    registration.timeoutAction !== undefined
  ) {
    validateTimeoutAction(
      registration.timeoutAction,
    );
  }

  validateOptionalRecord(
    registration.metadata,
    "registration.metadata",
  );
}

function validateAdmissionRequest(
  request: BackpressureAdmissionRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new BackpressureControllerError(
      "INVALID_ADMISSION_REQUEST",
      "Backpressure admission request must be an object.",
    );
  }

  normalizeConsumerId(request.consumerId);
  validateUnifiedStreamEvent(request.event);

  if (request.admittedAt !== undefined) {
    validateTimestamp(
      request.admittedAt,
      "request.admittedAt",
    );
  }

  validateOptionalRecord(
    request.metadata,
    "request.metadata",
  );
}

function validateAcknowledgement(
  acknowledgement: BackpressureAcknowledgement,
): void {
  if (
    acknowledgement === null ||
    typeof acknowledgement !== "object"
  ) {
    throw new BackpressureControllerError(
      "INVALID_ACKNOWLEDGEMENT",
      "Backpressure acknowledgement must be an object.",
    );
  }

  normalizeConsumerId(
    acknowledgement.consumerId,
  );

  normalizeEntryId(
    acknowledgement.entryId,
  );

  if (
    acknowledgement.acknowledgedAt !==
    undefined
  ) {
    validateTimestamp(
      acknowledgement.acknowledgedAt,
      "acknowledgement.acknowledgedAt",
    );
  }
}

function validateFailure(
  failure: BackpressureFailure,
): void {
  if (
    failure === null ||
    typeof failure !== "object"
  ) {
    throw new BackpressureControllerError(
      "INVALID_BACKPRESSURE_FAILURE",
      "Backpressure failure must be an object.",
    );
  }

  normalizeConsumerId(failure.consumerId);
  normalizeEntryId(failure.entryId);
  validateReason(failure.reason);

  if (failure.failedAt !== undefined) {
    validateTimestamp(
      failure.failedAt,
      "failure.failedAt",
    );
  }

  if (
    failure.retry !== undefined &&
    typeof failure.retry !== "boolean"
  ) {
    throw new BackpressureControllerError(
      "INVALID_RETRY_FLAG",
      "failure.retry must be boolean when provided.",
    );
  }
}

function validateOverflowPolicy(
  policy: BackpressureOverflowPolicy,
): void {
  if (
    policy !== "REJECT_NEWEST" &&
    policy !== "DROP_NEWEST" &&
    policy !== "DROP_OLDEST" &&
    policy !== "PAUSE_CONSUMER" &&
    policy !== "FAIL_CONSUMER"
  ) {
    throw new BackpressureControllerError(
      "INVALID_OVERFLOW_POLICY",
      `Unsupported backpressure overflow policy "${String(
        policy,
      )}".`,
    );
  }
}

function validateTimeoutAction(
  action: BackpressureTimeoutAction,
): void {
  if (
    action !== "MARK_DEGRADED" &&
    action !== "PAUSE_CONSUMER" &&
    action !== "FAIL_CONSUMER" &&
    action !== "DROP_TIMED_OUT"
  ) {
    throw new BackpressureControllerError(
      "INVALID_TIMEOUT_ACTION",
      `Unsupported backpressure timeout action "${String(
        action,
      )}".`,
    );
  }
}

function normalizeConsumerId(
  consumerId: BackpressureConsumerId,
): BackpressureConsumerId {
  if (
    typeof consumerId !== "string" ||
    consumerId.trim().length === 0
  ) {
    throw new BackpressureControllerError(
      "INVALID_CONSUMER_ID",
      "consumerId must be a non-empty string.",
    );
  }

  return consumerId.trim();
}

function normalizeEntryId(
  entryId: BackpressureQueueEntryId,
): BackpressureQueueEntryId {
  if (
    typeof entryId !== "string" ||
    entryId.trim().length === 0
  ) {
    throw new BackpressureControllerError(
      "INVALID_ENTRY_ID",
      "entryId must be a non-empty string.",
    );
  }

  return entryId.trim();
}

function normalizeExchangeId(
  exchangeId: StreamingExchangeId,
): StreamingExchangeId {
  validateStreamingExchangeId(exchangeId);

  return exchangeId.trim().toUpperCase();
}

function normalizeConnectionId(
  connectionId: StreamingConnectionId,
): StreamingConnectionId {
  validateStreamingConnectionId(connectionId);

  return connectionId.trim();
}

function validateReason(reason: string): string {
  if (
    typeof reason !== "string" ||
    reason.trim().length === 0
  ) {
    throw new BackpressureControllerError(
      "INVALID_REASON",
      "reason must be a non-empty string.",
    );
  }

  return reason.trim();
}

function validateRatio(
  value: number,
  field: string,
  allowZero: boolean,
): number {
  const minimum = allowZero ? 0 : 0;

  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > 1 ||
    (!allowZero && value === 0)
  ) {
    throw new BackpressureControllerError(
      "INVALID_RATIO",
      `${field} must be ${
        allowZero
          ? "between 0 and 1"
          : "greater than 0 and at most 1"
      }.`,
    );
  }

  return value;
}

function validatePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new BackpressureControllerError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateNonNegativeFiniteNumber(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new BackpressureControllerError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
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
    throw new BackpressureControllerError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function validateOptionalRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (value === null ||
      typeof value !== "object" ||
      Array.isArray(value))
  ) {
    throw new BackpressureControllerError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function validateClock(
  clock: BackpressureControllerClock,
): BackpressureControllerClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new BackpressureControllerError(
      "INVALID_CLOCK",
      "Backpressure controller clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
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
      "Unknown backpressure controller error.",
    );
  }
}

function assertNever(value: never): never {
  throw new BackpressureControllerError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}