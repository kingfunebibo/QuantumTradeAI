/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 10:
 * Event Ordering Buffer
 *
 * This module buffers normalized stream events and releases them in a
 * deterministic order.
 *
 * Responsibilities:
 * - Maintain isolated ordering buffers per logical stream
 * - Order events by sequence and timestamp
 * - Support bounded out-of-order delivery windows
 * - Detect late, duplicate and stale events
 * - Flush events when gaps close or timeouts expire
 * - Enforce per-stream and global capacity limits
 * - Support deterministic overflow policies
 * - Produce immutable results and diagnostics
 * - Support deterministic testing through an injected clock
 *
 * The buffer does not route events. Released events are returned to the
 * orchestration layer, which may then pass them into StreamRouter.
 */

import {
  StreamingChannel,
  StreamingConnectionId,
  StreamingExchangeId,
  StreamingSymbol,
  UnifiedStreamEvent,
  UnifiedStreamEventType,
  freezeUnifiedStreamEvent,
  normalizeStreamingSymbol,
  validateStreamingChannel,
  validateStreamingConnectionId,
  validateStreamingExchangeId,
  validateUnifiedStreamEvent,
} from "./unified-streaming-interface";

import {
  SequenceStreamKey,
  createSequenceStreamKey,
} from "./sequence-validator";

export type EventOrderingStatus =
  | "BUFFERED"
  | "RELEASED"
  | "DUPLICATE"
  | "STALE"
  | "LATE"
  | "DROPPED"
  | "REJECTED";

export type EventOrderingMode =
  | "SEQUENCE"
  | "TIMESTAMP"
  | "HYBRID";

export type EventOrderingOverflowPolicy =
  | "REJECT_NEWEST"
  | "DROP_OLDEST"
  | "FLUSH_OLDEST";

export type EventOrderingLateEventPolicy =
  | "REJECT"
  | "DROP"
  | "RELEASE";

export type EventOrderingGapPolicy =
  | "WAIT"
  | "FLUSH_ON_TIMEOUT"
  | "FLUSH_IMMEDIATELY";

export interface EventOrderingBufferClock {
  now(): number;
}

export interface EventOrderingBufferPolicy {
  readonly mode: EventOrderingMode;
  readonly maxTotalBufferedEvents: number;
  readonly maxBufferedEventsPerStream: number;
  readonly maxBufferAgeMs: number;
  readonly maxTimestampLatenessMs: number;
  readonly expectedSequenceIncrement: number;
  readonly overflowPolicy: EventOrderingOverflowPolicy;
  readonly lateEventPolicy: EventOrderingLateEventPolicy;
  readonly gapPolicy: EventOrderingGapPolicy;
  readonly rejectDuplicateEventIds: boolean;
  readonly rejectDuplicateSequences: boolean;
}

export interface EventOrderingEnqueueRequest {
  readonly event: UnifiedStreamEvent;
  readonly streamKey?: SequenceStreamKey;
  readonly enqueuedAt?: number;
}

export interface OrderedBufferedEvent {
  readonly streamKey: SequenceStreamKey;
  readonly event: UnifiedStreamEvent;
  readonly enqueuedAt: number;
  readonly releasedAt: number;
  readonly bufferedDurationMs: number;
  readonly releaseReason:
    | "IN_ORDER"
    | "GAP_CLOSED"
    | "TIMEOUT"
    | "OVERFLOW"
    | "MANUAL_FLUSH"
    | "LATE_EVENT";
}

export interface EventOrderingResult {
  readonly operationId: number;
  readonly status: EventOrderingStatus;
  readonly eventId: string;
  readonly streamKey: SequenceStreamKey;
  readonly processedAt: number;
  readonly buffered: boolean;
  readonly releasedEvents: readonly OrderedBufferedEvent[];
  readonly droppedEventIds: readonly string[];
  readonly bufferedEventCount: number;
  readonly reason?: string;
}

export interface EventOrderingFlushRequest {
  readonly streamKey?: SequenceStreamKey;
  readonly exchangeId?: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly channel?: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType?: UnifiedStreamEventType;
  readonly occurredAt?: number;
}

export interface EventOrderingStreamSnapshot {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly createdAt: number;
  readonly lastChangedAt: number;
  readonly bufferedEventCount: number;
  readonly nextExpectedSequence?: number;
  readonly lastReleasedSequence?: number;
  readonly lastReleasedTimestamp?: number;
  readonly lastReleasedEventId?: string;
  readonly bufferedEventIds: readonly string[];
  readonly acceptedEventCount: number;
  readonly releasedEventCount: number;
  readonly duplicateEventCount: number;
  readonly staleEventCount: number;
  readonly lateEventCount: number;
  readonly droppedEventCount: number;
  readonly overflowCount: number;
  readonly timeoutFlushCount: number;
  readonly gapCount: number;
}

export interface EventOrderingBufferSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalStreams: number;
  readonly totalBufferedEvents: number;
  readonly totalAcceptedEvents: number;
  readonly totalReleasedEvents: number;
  readonly totalDuplicateEvents: number;
  readonly totalStaleEvents: number;
  readonly totalLateEvents: number;
  readonly totalDroppedEvents: number;
  readonly totalOverflowEvents: number;
  readonly totalTimeoutFlushes: number;
  readonly streams: readonly EventOrderingStreamSnapshot[];
}

interface MutableBufferedEvent {
  readonly event: UnifiedStreamEvent;
  readonly enqueuedAt: number;
}

interface MutableOrderingStream {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly createdAt: number;

  lastChangedAt: number;
  nextExpectedSequence?: number;
  lastReleasedSequence?: number;
  lastReleasedTimestamp?: number;
  lastReleasedEventId?: string;
  readonly eventsById: Map<string, MutableBufferedEvent>;
  readonly eventIdBySequence: Map<number, string>;
  acceptedEventCount: number;
  releasedEventCount: number;
  duplicateEventCount: number;
  staleEventCount: number;
  lateEventCount: number;
  droppedEventCount: number;
  overflowCount: number;
  timeoutFlushCount: number;
  gapCount: number;
}

const DEFAULT_POLICY: EventOrderingBufferPolicy =
  Object.freeze({
    mode: "HYBRID",
    maxTotalBufferedEvents: 10_000,
    maxBufferedEventsPerStream: 1_000,
    maxBufferAgeMs: 5_000,
    maxTimestampLatenessMs: 2_000,
    expectedSequenceIncrement: 1,
    overflowPolicy: "REJECT_NEWEST",
    lateEventPolicy: "DROP",
    gapPolicy: "FLUSH_ON_TIMEOUT",
    rejectDuplicateEventIds: true,
    rejectDuplicateSequences: true,
  });

const SYSTEM_CLOCK: EventOrderingBufferClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

export class EventOrderingBufferError extends Error {
  public readonly code: string;
  public readonly streamKey?: SequenceStreamKey;
  public readonly eventId?: string;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly streamKey?: SequenceStreamKey;
      readonly eventId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "EventOrderingBufferError";
    this.code = code;
    this.streamKey = context?.streamKey;
    this.eventId = context?.eventId;
  }
}

export class EventOrderingBuffer {
  private readonly streams =
    new Map<SequenceStreamKey, MutableOrderingStream>();

  private readonly policy: EventOrderingBufferPolicy;
  private readonly clock: EventOrderingBufferClock;

  private nextOperationId = 1;
  private totalBufferedEvents = 0;
  private totalAcceptedEvents = 0;
  private totalReleasedEvents = 0;
  private totalDuplicateEvents = 0;
  private totalStaleEvents = 0;
  private totalLateEvents = 0;
  private totalDroppedEvents = 0;
  private totalOverflowEvents = 0;
  private totalTimeoutFlushes = 0;
  private disposed = false;

  public constructor(
    policy: Partial<EventOrderingBufferPolicy> = {},
    clock: EventOrderingBufferClock = SYSTEM_CLOCK,
  ) {
    this.policy = normalizePolicy({
      ...DEFAULT_POLICY,
      ...policy,
    });

    this.clock = validateClock(clock);
  }

  public enqueue(
    request: EventOrderingEnqueueRequest,
  ): EventOrderingResult {
    this.assertActive();
    validateEnqueueRequest(request);

    const event = freezeUnifiedStreamEvent(request.event);

    const streamKey =
      request.streamKey === undefined
        ? createSequenceStreamKey(event)
        : normalizeStreamKey(request.streamKey);

    const processedAt =
      request.enqueuedAt ?? this.now();

    validateTimestamp(
      processedAt,
      "request.enqueuedAt",
    );

    const stream = this.getOrCreateStream(
      streamKey,
      event,
      processedAt,
    );

    if (processedAt < stream.lastChangedAt) {
      throw new EventOrderingBufferError(
        "NON_MONOTONIC_ENQUEUE_TIMESTAMP",
        `Enqueue timestamp ${processedAt} is earlier than stream timestamp ${stream.lastChangedAt}.`,
        {
          streamKey,
          eventId: event.eventId,
        },
      );
    }

    if (
      this.policy.rejectDuplicateEventIds &&
      (stream.eventsById.has(event.eventId) ||
        stream.lastReleasedEventId === event.eventId)
    ) {
      stream.duplicateEventCount += 1;
      stream.lastChangedAt = processedAt;
      this.totalDuplicateEvents += 1;

      return this.createResult({
        status: "DUPLICATE",
        event,
        stream,
        processedAt,
        buffered: false,
        releasedEvents: [],
        droppedEventIds: [],
        reason: "Duplicate event ID rejected.",
      });
    }

    const sequenceClassification =
      this.classifySequence(stream, event);

    if (sequenceClassification === "DUPLICATE") {
      stream.duplicateEventCount += 1;
      stream.lastChangedAt = processedAt;
      this.totalDuplicateEvents += 1;

      return this.createResult({
        status: "DUPLICATE",
        event,
        stream,
        processedAt,
        buffered: false,
        releasedEvents: [],
        droppedEventIds: [],
        reason: "Duplicate sequence rejected.",
      });
    }

    if (sequenceClassification === "STALE") {
      stream.staleEventCount += 1;
      stream.lastChangedAt = processedAt;
      this.totalStaleEvents += 1;

      return this.createResult({
        status: "STALE",
        event,
        stream,
        processedAt,
        buffered: false,
        releasedEvents: [],
        droppedEventIds: [],
        reason: "Stale event sequence rejected.",
      });
    }

    if (this.isLateTimestamp(stream, event)) {
      return this.handleLateEvent(
        stream,
        event,
        processedAt,
      );
    }

    const overflowResult =
      this.prepareCapacity(stream, event, processedAt);

    if (overflowResult !== undefined) {
      return overflowResult;
    }

    const bufferedEvent: MutableBufferedEvent = {
      event,
      enqueuedAt: processedAt,
    };

    stream.eventsById.set(
      event.eventId,
      bufferedEvent,
    );

    if (event.sequence !== undefined) {
      stream.eventIdBySequence.set(
        event.sequence,
        event.eventId,
      );
    }

    stream.acceptedEventCount += 1;
    stream.lastChangedAt = processedAt;

    this.totalBufferedEvents += 1;
    this.totalAcceptedEvents += 1;

    const releasedEvents =
      this.releaseAvailableEvents(
        stream,
        processedAt,
      );

    return this.createResult({
      status:
        releasedEvents.length > 0
          ? "RELEASED"
          : "BUFFERED",
      event,
      stream,
      processedAt,
      buffered: stream.eventsById.has(event.eventId),
      releasedEvents,
      droppedEventIds: [],
      reason:
        releasedEvents.length > 0
          ? "One or more ordered events were released."
          : "Event buffered while awaiting ordering conditions.",
    });
  }

  public enqueueAll(
    requests: readonly EventOrderingEnqueueRequest[],
  ): readonly EventOrderingResult[] {
    this.assertActive();

    if (!Array.isArray(requests)) {
      throw new EventOrderingBufferError(
        "INVALID_ENQUEUE_COLLECTION",
        "Event ordering enqueue requests must be an array.",
      );
    }

    return Object.freeze(
      requests.map((request) => this.enqueue(request)),
    );
  }

  public flush(
    request: EventOrderingFlushRequest = {},
  ): readonly OrderedBufferedEvent[] {
    this.assertActive();
    validateFlushRequest(request);

    const occurredAt =
      request.occurredAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "request.occurredAt",
    );

    const streams = this.resolveFlushStreams(request);
    const releasedEvents: OrderedBufferedEvent[] = [];

    for (const stream of streams) {
      releasedEvents.push(
        ...this.flushStream(
          stream,
          occurredAt,
          "MANUAL_FLUSH",
        ),
      );
    }

    return Object.freeze(releasedEvents);
  }

  public flushExpired():
    readonly OrderedBufferedEvent[] {
    this.assertActive();

    if (this.policy.maxBufferAgeMs === 0) {
      return Object.freeze([]);
    }

    const occurredAt = this.now();
    const releasedEvents: OrderedBufferedEvent[] = [];

    for (const stream of this.getOrderedStreams()) {
      const oldest = this.getOldestBufferedEvent(stream);

      if (
        oldest === undefined ||
        occurredAt - oldest.enqueuedAt <
          this.policy.maxBufferAgeMs
      ) {
        continue;
      }

      if (
        this.policy.gapPolicy !==
        "FLUSH_ON_TIMEOUT"
      ) {
        continue;
      }

      stream.timeoutFlushCount += 1;
      this.totalTimeoutFlushes += 1;

      releasedEvents.push(
        ...this.flushStream(
          stream,
          occurredAt,
          "TIMEOUT",
        ),
      );
    }

    return Object.freeze(releasedEvents);
  }

  public removeStream(
    streamKey: SequenceStreamKey,
    releaseBufferedEvents = false,
  ): readonly OrderedBufferedEvent[] {
    this.assertActive();

    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const stream = this.streams.get(
      normalizedStreamKey,
    );

    if (stream === undefined) {
      throw new EventOrderingBufferError(
        "ORDERING_STREAM_NOT_FOUND",
        `Ordering stream "${normalizedStreamKey}" was not found.`,
        {
          streamKey: normalizedStreamKey,
        },
      );
    }

    const releasedEvents = releaseBufferedEvents
      ? this.flushStream(
          stream,
          this.now(),
          "MANUAL_FLUSH",
        )
      : [];

    if (!releaseBufferedEvents) {
      const droppedCount = stream.eventsById.size;

      this.totalBufferedEvents -= droppedCount;
      this.totalDroppedEvents += droppedCount;
      stream.droppedEventCount += droppedCount;

      stream.eventsById.clear();
      stream.eventIdBySequence.clear();
    }

    this.streams.delete(normalizedStreamKey);

    return Object.freeze(releasedEvents);
  }

  public getStream(
    streamKey: SequenceStreamKey,
  ): EventOrderingStreamSnapshot | undefined {
    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const stream = this.streams.get(
      normalizedStreamKey,
    );

    return stream === undefined
      ? undefined
      : createStreamSnapshot(stream);
  }

  public getStreamsForExchange(
    exchangeId: StreamingExchangeId,
  ): readonly EventOrderingStreamSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedStreams()
        .filter(
          (stream) =>
            stream.exchangeId === normalizedExchangeId,
        )
        .map((stream) =>
          createStreamSnapshot(stream),
        ),
    );
  }

  public getStreamsForConnection(
    connectionId: StreamingConnectionId,
  ): readonly EventOrderingStreamSnapshot[] {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    return Object.freeze(
      this.getOrderedStreams()
        .filter(
          (stream) =>
            stream.connectionId ===
            normalizedConnectionId,
        )
        .map((stream) =>
          createStreamSnapshot(stream),
        ),
    );
  }

  public getSnapshot(): EventOrderingBufferSnapshot {
    const streams = this.getOrderedStreams().map(
      (stream) => createStreamSnapshot(stream),
    );

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalStreams: streams.length,
      totalBufferedEvents: this.totalBufferedEvents,
      totalAcceptedEvents: this.totalAcceptedEvents,
      totalReleasedEvents: this.totalReleasedEvents,
      totalDuplicateEvents: this.totalDuplicateEvents,
      totalStaleEvents: this.totalStaleEvents,
      totalLateEvents: this.totalLateEvents,
      totalDroppedEvents: this.totalDroppedEvents,
      totalOverflowEvents: this.totalOverflowEvents,
      totalTimeoutFlushes: this.totalTimeoutFlushes,
      streams: Object.freeze(streams),
    });
  }

  public get streamCount(): number {
    return this.streams.size;
  }

  public get bufferedEventCount(): number {
    return this.totalBufferedEvents;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.streams.clear();
    this.totalBufferedEvents = 0;
    this.disposed = true;
  }

  private releaseAvailableEvents(
    stream: MutableOrderingStream,
    releasedAt: number,
  ): OrderedBufferedEvent[] {
    switch (this.policy.mode) {
      case "SEQUENCE":
        return this.releaseBySequence(
          stream,
          releasedAt,
        );

      case "TIMESTAMP":
        return this.releaseByTimestamp(
          stream,
          releasedAt,
        );

      case "HYBRID":
        return this.releaseHybrid(
          stream,
          releasedAt,
        );

      default:
        return assertNever(this.policy.mode);
    }
  }

  private releaseBySequence(
    stream: MutableOrderingStream,
    releasedAt: number,
  ): OrderedBufferedEvent[] {
    const released: OrderedBufferedEvent[] = [];

    if (stream.eventsById.size === 0) {
      return released;
    }

    if (stream.nextExpectedSequence === undefined) {
      const firstSequenced =
        this.getSequencedEvents(stream)[0];

      if (firstSequenced === undefined) {
        return released;
      }

      stream.nextExpectedSequence =
        firstSequenced.event.sequence;
    }

    while (
      stream.nextExpectedSequence !== undefined
    ) {
      const expectedSequence =
        stream.nextExpectedSequence;

      const eventId =
        stream.eventIdBySequence.get(
          expectedSequence,
        );

      if (eventId === undefined) {
        stream.gapCount += 1;

        if (
          this.policy.gapPolicy ===
          "FLUSH_IMMEDIATELY"
        ) {
          const oldest =
            this.getOldestBufferedEvent(stream);

          if (oldest !== undefined) {
            released.push(
              this.releaseEvent(
                stream,
                oldest,
                releasedAt,
                "GAP_CLOSED",
              ),
            );

            continue;
          }
        }

        break;
      }

      const buffered = stream.eventsById.get(eventId);

      if (buffered === undefined) {
        stream.eventIdBySequence.delete(
          expectedSequence,
        );

        continue;
      }

      released.push(
        this.releaseEvent(
          stream,
          buffered,
          releasedAt,
          "IN_ORDER",
        ),
      );
    }

    return released;
  }

  private releaseByTimestamp(
    stream: MutableOrderingStream,
    releasedAt: number,
  ): OrderedBufferedEvent[] {
    const released: OrderedBufferedEvent[] = [];
    const ordered =
      this.getTimestampOrderedEvents(stream);

    if (ordered.length === 0) {
      return released;
    }

    const latestTimestamp = Math.max(
      ...ordered.map((entry) =>
        getOrderingTimestamp(entry.event),
      ),
    );

    const releaseBoundary =
      latestTimestamp -
      this.policy.maxTimestampLatenessMs;

    for (const buffered of ordered) {
      const eventTimestamp =
        getOrderingTimestamp(buffered.event);

      if (
        eventTimestamp > releaseBoundary &&
        this.policy.maxTimestampLatenessMs > 0
      ) {
        continue;
      }

      released.push(
        this.releaseEvent(
          stream,
          buffered,
          releasedAt,
          "IN_ORDER",
        ),
      );
    }

    return released;
  }

  private releaseHybrid(
    stream: MutableOrderingStream,
    releasedAt: number,
  ): OrderedBufferedEvent[] {
    const hasSequencedEvent = [
      ...stream.eventsById.values(),
    ].some(
      (buffered) =>
        buffered.event.sequence !== undefined,
    );

    if (hasSequencedEvent) {
      return this.releaseBySequence(
        stream,
        releasedAt,
      );
    }

    return this.releaseByTimestamp(
      stream,
      releasedAt,
    );
  }

  private flushStream(
    stream: MutableOrderingStream,
    releasedAt: number,
    reason: OrderedBufferedEvent["releaseReason"],
  ): OrderedBufferedEvent[] {
    const ordered =
      this.getDeterministicallyOrderedEvents(stream);

    return ordered.map((buffered) =>
      this.releaseEvent(
        stream,
        buffered,
        releasedAt,
        reason,
      ),
    );
  }

  private releaseEvent(
    stream: MutableOrderingStream,
    buffered: MutableBufferedEvent,
    releasedAt: number,
    reason: OrderedBufferedEvent["releaseReason"],
  ): OrderedBufferedEvent {
    const event = buffered.event;

    stream.eventsById.delete(event.eventId);

    if (event.sequence !== undefined) {
      stream.eventIdBySequence.delete(
        event.sequence,
      );

      stream.lastReleasedSequence =
        event.sequence;

      stream.nextExpectedSequence =
        event.sequence +
        this.policy.expectedSequenceIncrement;
    }

    stream.lastReleasedTimestamp =
      getOrderingTimestamp(event);

    stream.lastReleasedEventId = event.eventId;
    stream.lastChangedAt = releasedAt;
    stream.releasedEventCount += 1;

    this.totalBufferedEvents -= 1;
    this.totalReleasedEvents += 1;

    return Object.freeze({
      streamKey: stream.streamKey,
      event,
      enqueuedAt: buffered.enqueuedAt,
      releasedAt,
      bufferedDurationMs: Math.max(
        0,
        releasedAt - buffered.enqueuedAt,
      ),
      releaseReason: reason,
    });
  }

  private handleLateEvent(
    stream: MutableOrderingStream,
    event: UnifiedStreamEvent,
    processedAt: number,
  ): EventOrderingResult {
    stream.lateEventCount += 1;
    stream.lastChangedAt = processedAt;

    this.totalLateEvents += 1;

    switch (this.policy.lateEventPolicy) {
      case "REJECT":
        return this.createResult({
          status: "REJECTED",
          event,
          stream,
          processedAt,
          buffered: false,
          releasedEvents: [],
          droppedEventIds: [],
          reason: "Late event rejected.",
        });

      case "DROP":
        stream.droppedEventCount += 1;
        this.totalDroppedEvents += 1;

        return this.createResult({
          status: "DROPPED",
          event,
          stream,
          processedAt,
          buffered: false,
          releasedEvents: [],
          droppedEventIds: [event.eventId],
          reason: "Late event dropped.",
        });

      case "RELEASE": {
        const releasedEvent: OrderedBufferedEvent =
          Object.freeze({
            streamKey: stream.streamKey,
            event,
            enqueuedAt: processedAt,
            releasedAt: processedAt,
            bufferedDurationMs: 0,
            releaseReason: "LATE_EVENT",
          });

        stream.acceptedEventCount += 1;
        stream.releasedEventCount += 1;
        stream.lastReleasedEventId = event.eventId;
        stream.lastReleasedTimestamp =
          getOrderingTimestamp(event);

        if (event.sequence !== undefined) {
          stream.lastReleasedSequence =
            event.sequence;

          stream.nextExpectedSequence =
            event.sequence +
            this.policy.expectedSequenceIncrement;
        }

        this.totalAcceptedEvents += 1;
        this.totalReleasedEvents += 1;

        return this.createResult({
          status: "LATE",
          event,
          stream,
          processedAt,
          buffered: false,
          releasedEvents: [releasedEvent],
          droppedEventIds: [],
          reason: "Late event released immediately.",
        });
      }

      default:
        return assertNever(
          this.policy.lateEventPolicy,
        );
    }
  }

  private prepareCapacity(
    stream: MutableOrderingStream,
    event: UnifiedStreamEvent,
    processedAt: number,
  ): EventOrderingResult | undefined {
    const streamAtCapacity =
      stream.eventsById.size >=
      this.policy.maxBufferedEventsPerStream;

    const globalAtCapacity =
      this.totalBufferedEvents >=
      this.policy.maxTotalBufferedEvents;

    if (!streamAtCapacity && !globalAtCapacity) {
      return undefined;
    }

    stream.overflowCount += 1;
    this.totalOverflowEvents += 1;

    switch (this.policy.overflowPolicy) {
      case "REJECT_NEWEST":
        return this.createResult({
          status: "REJECTED",
          event,
          stream,
          processedAt,
          buffered: false,
          releasedEvents: [],
          droppedEventIds: [],
          reason:
            "Ordering buffer capacity exceeded.",
        });

      case "DROP_OLDEST": {
        const candidate = globalAtCapacity
          ? this.getGlobalOldestBufferedEvent()
          : this.createLocalOldestCandidate(stream);

        if (candidate === undefined) {
          return this.createResult({
            status: "REJECTED",
            event,
            stream,
            processedAt,
            buffered: false,
            releasedEvents: [],
            droppedEventIds: [],
            reason:
              "No event was available for overflow eviction.",
          });
        }

        this.dropBufferedEvent(
          candidate.stream,
          candidate.buffered,
          processedAt,
        );

        return undefined;
      }

      case "FLUSH_OLDEST": {
        let candidate:
          | {
              readonly stream: MutableOrderingStream;
              readonly buffered: MutableBufferedEvent;
            }
          | undefined;

        if (globalAtCapacity) {
          candidate =
            this.getGlobalOldestBufferedEvent();
        } else {
          candidate =
            this.createLocalOldestCandidate(stream);
        }

        if (candidate === undefined) {
          return this.createResult({
            status: "REJECTED",
            event,
            stream,
            processedAt,
            buffered: false,
            releasedEvents: [],
            droppedEventIds: [],
            reason:
              "No event was available for overflow flushing.",
          });
        }

        this.releaseEvent(
          candidate.stream,
          candidate.buffered,
          processedAt,
          "OVERFLOW",
        );

        return undefined;
      }

      default:
        return assertNever(
          this.policy.overflowPolicy,
        );
    }
  }

  private createLocalOldestCandidate(
    stream: MutableOrderingStream,
  ):
    | {
        readonly stream: MutableOrderingStream;
        readonly buffered: MutableBufferedEvent;
      }
    | undefined {
    const buffered =
      this.getOldestBufferedEvent(stream);

    if (buffered === undefined) {
      return undefined;
    }

    return {
      stream,
      buffered,
    };
  }

  private dropBufferedEvent(
    stream: MutableOrderingStream,
    buffered: MutableBufferedEvent,
    occurredAt: number,
  ): void {
    stream.eventsById.delete(
      buffered.event.eventId,
    );

    if (buffered.event.sequence !== undefined) {
      stream.eventIdBySequence.delete(
        buffered.event.sequence,
      );
    }

    stream.lastChangedAt = occurredAt;
    stream.droppedEventCount += 1;

    this.totalBufferedEvents -= 1;
    this.totalDroppedEvents += 1;
  }

  private classifySequence(
    stream: MutableOrderingStream,
    event: UnifiedStreamEvent,
  ): "VALID" | "DUPLICATE" | "STALE" {
    if (
      this.policy.mode === "TIMESTAMP" ||
      event.sequence === undefined
    ) {
      return "VALID";
    }

    if (
      this.policy.rejectDuplicateSequences &&
      stream.eventIdBySequence.has(event.sequence)
    ) {
      return "DUPLICATE";
    }

    if (
      stream.lastReleasedSequence !== undefined &&
      event.sequence === stream.lastReleasedSequence
    ) {
      return "DUPLICATE";
    }

    if (
      stream.lastReleasedSequence !== undefined &&
      event.sequence < stream.lastReleasedSequence
    ) {
      return "STALE";
    }

    return "VALID";
  }

  private isLateTimestamp(
    stream: MutableOrderingStream,
    event: UnifiedStreamEvent,
  ): boolean {
    if (
      stream.lastReleasedTimestamp === undefined ||
      this.policy.maxTimestampLatenessMs === 0
    ) {
      return false;
    }

    return (
      getOrderingTimestamp(event) <
      stream.lastReleasedTimestamp -
        this.policy.maxTimestampLatenessMs
    );
  }

  private getOrCreateStream(
    streamKey: SequenceStreamKey,
    event: UnifiedStreamEvent,
    createdAt: number,
  ): MutableOrderingStream {
    const existing = this.streams.get(streamKey);

    if (existing !== undefined) {
      validateEventMatchesStream(existing, event);
      return existing;
    }

    const stream: MutableOrderingStream = {
      streamKey,
      exchangeId: normalizeExchangeId(
        event.exchangeId,
      ),
      connectionId: normalizeConnectionId(
        event.connectionId,
      ),
      channel: normalizeChannel(event.channel),
      symbol:
        event.symbol === undefined
          ? undefined
          : normalizeStreamingSymbol(event.symbol),
      eventType: event.type,
      createdAt,
      lastChangedAt: createdAt,
      nextExpectedSequence: event.sequence,
      eventsById:
        new Map<string, MutableBufferedEvent>(),
      eventIdBySequence: new Map<number, string>(),
      acceptedEventCount: 0,
      releasedEventCount: 0,
      duplicateEventCount: 0,
      staleEventCount: 0,
      lateEventCount: 0,
      droppedEventCount: 0,
      overflowCount: 0,
      timeoutFlushCount: 0,
      gapCount: 0,
    };

    this.streams.set(streamKey, stream);

    return stream;
  }

  private getOldestBufferedEvent(
    stream: MutableOrderingStream,
  ): MutableBufferedEvent | undefined {
    return [...stream.eventsById.values()].sort(
      compareBufferedByAge,
    )[0];
  }

  private getGlobalOldestBufferedEvent():
    | {
        readonly stream: MutableOrderingStream;
        readonly buffered: MutableBufferedEvent;
      }
    | undefined {
    const candidates = this.getOrderedStreams()
      .map((stream) => ({
        stream,
        buffered:
          this.getOldestBufferedEvent(stream),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          readonly stream: MutableOrderingStream;
          readonly buffered: MutableBufferedEvent;
        } => candidate.buffered !== undefined,
      )
      .sort((left, right) => {
        const ageComparison = compareBufferedByAge(
          left.buffered,
          right.buffered,
        );

        if (ageComparison !== 0) {
          return ageComparison;
        }

        return left.stream.streamKey.localeCompare(
          right.stream.streamKey,
        );
      });

    return candidates[0];
  }

  private getSequencedEvents(
    stream: MutableOrderingStream,
  ): MutableBufferedEvent[] {
    return [...stream.eventsById.values()]
      .filter(
        (buffered) =>
          buffered.event.sequence !== undefined,
      )
      .sort((left, right) => {
        const leftSequence =
          left.event.sequence ?? 0;

        const rightSequence =
          right.event.sequence ?? 0;

        if (leftSequence !== rightSequence) {
          return leftSequence - rightSequence;
        }

        return compareBufferedByTimestamp(
          left,
          right,
        );
      });
  }

  private getTimestampOrderedEvents(
    stream: MutableOrderingStream,
  ): MutableBufferedEvent[] {
    return [...stream.eventsById.values()].sort(
      compareBufferedByTimestamp,
    );
  }

  private getDeterministicallyOrderedEvents(
    stream: MutableOrderingStream,
  ): MutableBufferedEvent[] {
    if (this.policy.mode === "TIMESTAMP") {
      return this.getTimestampOrderedEvents(stream);
    }

    const sequenced = this.getSequencedEvents(stream);

    const unsequenced = [
      ...stream.eventsById.values(),
    ]
      .filter(
        (buffered) =>
          buffered.event.sequence === undefined,
      )
      .sort(compareBufferedByTimestamp);

    return [...sequenced, ...unsequenced];
  }

  private resolveFlushStreams(
    request: EventOrderingFlushRequest,
  ): MutableOrderingStream[] {
    if (request.streamKey !== undefined) {
      const stream = this.streams.get(
        normalizeStreamKey(request.streamKey),
      );

      return stream === undefined ? [] : [stream];
    }

    return this.getOrderedStreams().filter(
      (stream) => {
        if (
          request.exchangeId !== undefined &&
          stream.exchangeId !==
            normalizeExchangeId(
              request.exchangeId,
            )
        ) {
          return false;
        }

        if (
          request.connectionId !== undefined &&
          stream.connectionId !==
            normalizeConnectionId(
              request.connectionId,
            )
        ) {
          return false;
        }

        if (
          request.channel !== undefined &&
          stream.channel !==
            normalizeChannel(request.channel)
        ) {
          return false;
        }

        if (
          request.symbol !== undefined &&
          stream.symbol !==
            normalizeStreamingSymbol(
              request.symbol,
            )
        ) {
          return false;
        }

        if (
          request.eventType !== undefined &&
          stream.eventType !== request.eventType
        ) {
          return false;
        }

        return true;
      },
    );
  }

  private getOrderedStreams():
    MutableOrderingStream[] {
    return [...this.streams.values()].sort(
      (left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt - right.createdAt;
        }

        return left.streamKey.localeCompare(
          right.streamKey,
        );
      },
    );
  }

  private createResult(input: {
    readonly status: EventOrderingStatus;
    readonly event: UnifiedStreamEvent;
    readonly stream: MutableOrderingStream;
    readonly processedAt: number;
    readonly buffered: boolean;
    readonly releasedEvents:
      readonly OrderedBufferedEvent[];
    readonly droppedEventIds: readonly string[];
    readonly reason?: string;
  }): EventOrderingResult {
    const result: EventOrderingResult =
      Object.freeze({
        operationId: this.nextOperationId,
        status: input.status,
        eventId: input.event.eventId,
        streamKey: input.stream.streamKey,
        processedAt: input.processedAt,
        buffered: input.buffered,
        releasedEvents: Object.freeze([
          ...input.releasedEvents,
        ]),
        droppedEventIds: Object.freeze([
          ...input.droppedEventIds,
        ]),
        bufferedEventCount:
          input.stream.eventsById.size,
        reason: input.reason,
      });

    this.nextOperationId += 1;

    return result;
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new EventOrderingBufferError(
        "EVENT_ORDERING_BUFFER_DISPOSED",
        "The event ordering buffer has been disposed.",
      );
    }
  }
}

function createStreamSnapshot(
  stream: MutableOrderingStream,
): EventOrderingStreamSnapshot {
  return Object.freeze({
    streamKey: stream.streamKey,
    exchangeId: stream.exchangeId,
    connectionId: stream.connectionId,
    channel: stream.channel,
    symbol: stream.symbol,
    eventType: stream.eventType,
    createdAt: stream.createdAt,
    lastChangedAt: stream.lastChangedAt,
    bufferedEventCount: stream.eventsById.size,
    nextExpectedSequence:
      stream.nextExpectedSequence,
    lastReleasedSequence:
      stream.lastReleasedSequence,
    lastReleasedTimestamp:
      stream.lastReleasedTimestamp,
    lastReleasedEventId:
      stream.lastReleasedEventId,
    bufferedEventIds: Object.freeze(
      [...stream.eventsById.keys()].sort(),
    ),
    acceptedEventCount:
      stream.acceptedEventCount,
    releasedEventCount:
      stream.releasedEventCount,
    duplicateEventCount:
      stream.duplicateEventCount,
    staleEventCount:
      stream.staleEventCount,
    lateEventCount: stream.lateEventCount,
    droppedEventCount:
      stream.droppedEventCount,
    overflowCount: stream.overflowCount,
    timeoutFlushCount:
      stream.timeoutFlushCount,
    gapCount: stream.gapCount,
  });
}

function normalizePolicy(
  policy: Partial<EventOrderingBufferPolicy>,
): EventOrderingBufferPolicy {
  const mode = policy.mode ?? DEFAULT_POLICY.mode;

  if (
    mode !== "SEQUENCE" &&
    mode !== "TIMESTAMP" &&
    mode !== "HYBRID"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_ORDERING_MODE",
      `Unsupported event ordering mode "${String(
        mode,
      )}".`,
    );
  }

  const maxTotalBufferedEvents =
    validatePositiveSafeInteger(
      policy.maxTotalBufferedEvents ??
        DEFAULT_POLICY.maxTotalBufferedEvents,
      "maxTotalBufferedEvents",
    );

  const maxBufferedEventsPerStream =
    validatePositiveSafeInteger(
      policy.maxBufferedEventsPerStream ??
        DEFAULT_POLICY
          .maxBufferedEventsPerStream,
      "maxBufferedEventsPerStream",
    );

  if (
    maxBufferedEventsPerStream >
    maxTotalBufferedEvents
  ) {
    throw new EventOrderingBufferError(
      "INVALID_BUFFER_CAPACITY",
      "maxBufferedEventsPerStream cannot exceed maxTotalBufferedEvents.",
    );
  }

  const maxBufferAgeMs =
    validateNonNegativeFiniteNumber(
      policy.maxBufferAgeMs ??
        DEFAULT_POLICY.maxBufferAgeMs,
      "maxBufferAgeMs",
    );

  const maxTimestampLatenessMs =
    validateNonNegativeFiniteNumber(
      policy.maxTimestampLatenessMs ??
        DEFAULT_POLICY
          .maxTimestampLatenessMs,
      "maxTimestampLatenessMs",
    );

  const expectedSequenceIncrement =
    validatePositiveSafeInteger(
      policy.expectedSequenceIncrement ??
        DEFAULT_POLICY
          .expectedSequenceIncrement,
      "expectedSequenceIncrement",
    );

  const overflowPolicy =
    policy.overflowPolicy ??
    DEFAULT_POLICY.overflowPolicy;

  if (
    overflowPolicy !== "REJECT_NEWEST" &&
    overflowPolicy !== "DROP_OLDEST" &&
    overflowPolicy !== "FLUSH_OLDEST"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_OVERFLOW_POLICY",
      `Unsupported overflow policy "${String(
        overflowPolicy,
      )}".`,
    );
  }

  const lateEventPolicy =
    policy.lateEventPolicy ??
    DEFAULT_POLICY.lateEventPolicy;

  if (
    lateEventPolicy !== "REJECT" &&
    lateEventPolicy !== "DROP" &&
    lateEventPolicy !== "RELEASE"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_LATE_EVENT_POLICY",
      `Unsupported late event policy "${String(
        lateEventPolicy,
      )}".`,
    );
  }

  const gapPolicy =
    policy.gapPolicy ??
    DEFAULT_POLICY.gapPolicy;

  if (
    gapPolicy !== "WAIT" &&
    gapPolicy !== "FLUSH_ON_TIMEOUT" &&
    gapPolicy !== "FLUSH_IMMEDIATELY"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_GAP_POLICY",
      `Unsupported gap policy "${String(
        gapPolicy,
      )}".`,
    );
  }

  const rejectDuplicateEventIds =
    policy.rejectDuplicateEventIds ??
    DEFAULT_POLICY.rejectDuplicateEventIds;

  const rejectDuplicateSequences =
    policy.rejectDuplicateSequences ??
    DEFAULT_POLICY.rejectDuplicateSequences;

  if (
    typeof rejectDuplicateEventIds !==
    "boolean"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_DUPLICATE_EVENT_ID_OPTION",
      "rejectDuplicateEventIds must be boolean.",
    );
  }

  if (
    typeof rejectDuplicateSequences !==
    "boolean"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_DUPLICATE_SEQUENCE_OPTION",
      "rejectDuplicateSequences must be boolean.",
    );
  }

  return Object.freeze({
    mode,
    maxTotalBufferedEvents,
    maxBufferedEventsPerStream,
    maxBufferAgeMs,
    maxTimestampLatenessMs,
    expectedSequenceIncrement,
    overflowPolicy,
    lateEventPolicy,
    gapPolicy,
    rejectDuplicateEventIds,
    rejectDuplicateSequences,
  });
}

function validateEnqueueRequest(
  request: EventOrderingEnqueueRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_ENQUEUE_REQUEST",
      "Event ordering enqueue request must be an object.",
    );
  }

  validateUnifiedStreamEvent(request.event);

  if (request.streamKey !== undefined) {
    normalizeStreamKey(request.streamKey);
  }

  if (request.enqueuedAt !== undefined) {
    validateTimestamp(
      request.enqueuedAt,
      "request.enqueuedAt",
    );
  }
}

function validateFlushRequest(
  request: EventOrderingFlushRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_FLUSH_REQUEST",
      "Event ordering flush request must be an object.",
    );
  }

  if (request.streamKey !== undefined) {
    normalizeStreamKey(request.streamKey);
  }

  if (request.exchangeId !== undefined) {
    normalizeExchangeId(request.exchangeId);
  }

  if (request.connectionId !== undefined) {
    normalizeConnectionId(request.connectionId);
  }

  if (request.channel !== undefined) {
    normalizeChannel(request.channel);
  }

  if (request.symbol !== undefined) {
    normalizeStreamingSymbol(request.symbol);
  }

  if (request.occurredAt !== undefined) {
    validateTimestamp(
      request.occurredAt,
      "request.occurredAt",
    );
  }
}

function validateEventMatchesStream(
  stream: MutableOrderingStream,
  event: UnifiedStreamEvent,
): void {
  const symbol =
    event.symbol === undefined
      ? undefined
      : normalizeStreamingSymbol(event.symbol);

  if (
    stream.exchangeId !==
      normalizeExchangeId(event.exchangeId) ||
    stream.connectionId !==
      normalizeConnectionId(event.connectionId) ||
    stream.channel !==
      normalizeChannel(event.channel) ||
    stream.symbol !== symbol ||
    stream.eventType !== event.type
  ) {
    throw new EventOrderingBufferError(
      "STREAM_KEY_EVENT_MISMATCH",
      `Event "${event.eventId}" does not match ordering stream "${stream.streamKey}".`,
      {
        streamKey: stream.streamKey,
        eventId: event.eventId,
      },
    );
  }
}

function compareBufferedByAge(
  left: MutableBufferedEvent,
  right: MutableBufferedEvent,
): number {
  if (left.enqueuedAt !== right.enqueuedAt) {
    return left.enqueuedAt - right.enqueuedAt;
  }

  return left.event.eventId.localeCompare(
    right.event.eventId,
  );
}

function compareBufferedByTimestamp(
  left: MutableBufferedEvent,
  right: MutableBufferedEvent,
): number {
  const leftTimestamp =
    getOrderingTimestamp(left.event);

  const rightTimestamp =
    getOrderingTimestamp(right.event);

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  if (
    left.event.sequence !== undefined &&
    right.event.sequence !== undefined &&
    left.event.sequence !== right.event.sequence
  ) {
    return (
      left.event.sequence -
      right.event.sequence
    );
  }

  if (left.enqueuedAt !== right.enqueuedAt) {
    return left.enqueuedAt - right.enqueuedAt;
  }

  return left.event.eventId.localeCompare(
    right.event.eventId,
  );
}

function getOrderingTimestamp(
  event: UnifiedStreamEvent,
): number {
  return (
    event.exchangeTimestamp ??
    event.receivedAt
  );
}

function normalizeStreamKey(
  streamKey: SequenceStreamKey,
): SequenceStreamKey {
  if (
    typeof streamKey !== "string" ||
    streamKey.trim().length === 0
  ) {
    throw new EventOrderingBufferError(
      "INVALID_STREAM_KEY",
      "Event ordering stream key must be a non-empty string.",
    );
  }

  return streamKey.trim();
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

function normalizeChannel(
  channel: StreamingChannel,
): StreamingChannel {
  validateStreamingChannel(channel);

  return channel.trim().toUpperCase();
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new EventOrderingBufferError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
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
    throw new EventOrderingBufferError(
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
    throw new EventOrderingBufferError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
}

function validateClock(
  clock: EventOrderingBufferClock,
): EventOrderingBufferClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new EventOrderingBufferError(
      "INVALID_CLOCK",
      "Event ordering buffer clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function assertNever(value: never): never {
  throw new EventOrderingBufferError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}