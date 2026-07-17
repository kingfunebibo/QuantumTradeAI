/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 13:
 * Stream Health Monitor
 *
 * This module aggregates health signals from the live streaming subsystem.
 *
 * Responsibilities:
 * - Track health by exchange, connection, and logical stream
 * - Aggregate connection, heartbeat, latency, sequence, subscription, and
 *   backpressure signals
 * - Apply deterministic severity rules
 * - Detect stale streams
 * - Emit health-change events
 * - Produce immutable snapshots
 * - Support deterministic tests through an injected clock
 *
 * The monitor contains no internal timers. The orchestration layer calls
 * evaluate() or tick() explicitly.
 */

import {
  StreamingChannel,
  StreamingConnectionId,
  StreamingExchangeId,
  StreamingSubscriptionId,
  StreamingSymbol,
  UnifiedStreamEventType,
  UnifiedSubscriptionState,
  normalizeStreamingSymbol,
  validateStreamingChannel,
  validateStreamingConnectionId,
  validateStreamingExchangeId,
  validateStreamingSubscriptionId,
  validateUnifiedStreamEventType,
  validateUnifiedSubscriptionState,
} from "./unified-streaming-interface";

import {
  SequenceStreamKey,
} from "./sequence-validator";

import {
  WebSocketConnectionState,
} from "./websocket-manager";

export type StreamHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export type StreamHealthSignalType =
  | "CONNECTION"
  | "HEARTBEAT"
  | "LATENCY"
  | "SEQUENCE"
  | "BACKPRESSURE"
  | "SUBSCRIPTION"
  | "ACTIVITY"
  | "MANUAL";

export type StreamHealthSignalStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export type StreamHealthEventType =
  | "STREAM_REGISTERED"
  | "STREAM_UNREGISTERED"
  | "SIGNAL_UPDATED"
  | "HEALTH_CHANGED"
  | "STREAM_STALE"
  | "STREAM_RECOVERED"
  | "MANUAL_OVERRIDE_SET"
  | "MANUAL_OVERRIDE_CLEARED";

export interface StreamHealthMonitorClock {
  now(): number;
}

export interface StreamHealthThresholds {
  /**
   * Maximum time without stream activity before health becomes degraded.
   *
   * Set to zero to disable degraded inactivity detection.
   */
  readonly degradedAfterInactivityMs: number;

  /**
   * Maximum time without stream activity before health becomes unhealthy.
   *
   * Set to zero to disable unhealthy inactivity detection.
   */
  readonly unhealthyAfterInactivityMs: number;

  /**
   * Number of degraded signals required to classify the stream as unhealthy.
   */
  readonly degradedSignalsForUnhealthy: number;

  /**
   * Number of unhealthy signals required to classify the stream as unhealthy.
   */
  readonly unhealthySignalsForUnhealthy: number;

  /**
   * When true, one unhealthy connection or heartbeat signal immediately makes
   * the stream unhealthy.
   */
  readonly failFastOnCriticalSignal: boolean;
}

export interface StreamHealthRegistration {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly subscriptionId?: StreamingSubscriptionId;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StreamHealthSignalUpdate {
  readonly streamKey: SequenceStreamKey;
  readonly signalType: StreamHealthSignalType;
  readonly status: StreamHealthSignalStatus;
  readonly occurredAt?: number;
  readonly reason?: string;
  readonly metric?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StreamHealthConnectionUpdate {
  readonly streamKey: SequenceStreamKey;
  readonly state: WebSocketConnectionState;
  readonly occurredAt?: number;
  readonly reason?: string;
}

export interface StreamHealthSubscriptionUpdate {
  readonly streamKey: SequenceStreamKey;
  readonly state: UnifiedSubscriptionState;
  readonly occurredAt?: number;
  readonly reason?: string;
}

export interface StreamHealthActivityUpdate {
  readonly streamKey: SequenceStreamKey;
  readonly occurredAt?: number;
}

export interface StreamHealthManualOverride {
  readonly streamKey: SequenceStreamKey;
  readonly status: StreamHealthStatus;
  readonly reason: string;
  readonly occurredAt?: number;
}

export interface StreamHealthSignalSnapshot {
  readonly signalType: StreamHealthSignalType;
  readonly status: StreamHealthSignalStatus;
  readonly updatedAt: number;
  readonly reason?: string;
  readonly metric?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StreamHealthSnapshot {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly subscriptionId?: StreamingSubscriptionId;
  readonly status: StreamHealthStatus;
  readonly registeredAt: number;
  readonly lastChangedAt: number;
  readonly lastActivityAt: number;
  readonly lastEvaluatedAt: number;
  readonly stale: boolean;
  readonly degradedSignalCount: number;
  readonly unhealthySignalCount: number;
  readonly manualOverrideStatus?: StreamHealthStatus;
  readonly manualOverrideReason?: string;
  readonly reason?: string;
  readonly signals: readonly StreamHealthSignalSnapshot[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeStreamHealthSnapshot {
  readonly exchangeId: StreamingExchangeId;
  readonly status: StreamHealthStatus;
  readonly streamCount: number;
  readonly healthyStreams: number;
  readonly degradedStreams: number;
  readonly unhealthyStreams: number;
  readonly unknownStreams: number;
  readonly lastEvaluatedAt: number;
  readonly streams: readonly StreamHealthSnapshot[];
}

export interface ConnectionStreamHealthSnapshot {
  readonly connectionId: StreamingConnectionId;
  readonly exchangeId: StreamingExchangeId;
  readonly status: StreamHealthStatus;
  readonly streamCount: number;
  readonly healthyStreams: number;
  readonly degradedStreams: number;
  readonly unhealthyStreams: number;
  readonly unknownStreams: number;
  readonly lastEvaluatedAt: number;
  readonly streams: readonly StreamHealthSnapshot[];
}

export interface StreamHealthMonitorSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly overallStatus: StreamHealthStatus;
  readonly totalStreams: number;
  readonly healthyStreams: number;
  readonly degradedStreams: number;
  readonly unhealthyStreams: number;
  readonly unknownStreams: number;
  readonly staleStreams: number;
  readonly exchangeCount: number;
  readonly connectionCount: number;
  readonly exchanges: readonly ExchangeStreamHealthSnapshot[];
  readonly connections: readonly ConnectionStreamHealthSnapshot[];
  readonly streams: readonly StreamHealthSnapshot[];
}

export interface StreamHealthEvent {
  readonly eventId: number;
  readonly type: StreamHealthEventType;
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly occurredAt: number;
  readonly status: StreamHealthStatus;
  readonly previousStatus?: StreamHealthStatus;
  readonly signalType?: StreamHealthSignalType;
  readonly reason?: string;
}

export type StreamHealthEventListener = (
  event: StreamHealthEvent,
) => void;

interface MutableHealthSignal {
  readonly signalType: StreamHealthSignalType;
  status: StreamHealthSignalStatus;
  updatedAt: number;
  reason?: string;
  metric?: number;
  metadata: Readonly<Record<string, unknown>>;
}

interface MutableStreamHealthRecord {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly subscriptionId?: StreamingSubscriptionId;
  readonly registeredAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly signals: Map<
    StreamHealthSignalType,
    MutableHealthSignal
  >;

  status: StreamHealthStatus;
  lastChangedAt: number;
  lastActivityAt: number;
  lastEvaluatedAt: number;
  stale: boolean;
  reason?: string;
  manualOverrideStatus?: StreamHealthStatus;
  manualOverrideReason?: string;
}

const DEFAULT_THRESHOLDS: StreamHealthThresholds =
  Object.freeze({
    degradedAfterInactivityMs: 30_000,
    unhealthyAfterInactivityMs: 90_000,
    degradedSignalsForUnhealthy: 3,
    unhealthySignalsForUnhealthy: 1,
    failFastOnCriticalSignal: true,
  });

const SYSTEM_CLOCK: StreamHealthMonitorClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

const CRITICAL_SIGNAL_TYPES:
  readonly StreamHealthSignalType[] =
  Object.freeze<StreamHealthSignalType[]>([
    "CONNECTION",
    "HEARTBEAT",
  ]);

export class StreamHealthMonitorError extends Error {
  public readonly code: string;
  public readonly streamKey?: SequenceStreamKey;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly streamKey?: SequenceStreamKey;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "StreamHealthMonitorError";
    this.code = code;
    this.streamKey = context?.streamKey;
  }
}

/**
 * Deterministic aggregate health monitor for live streaming infrastructure.
 */
export class StreamHealthMonitor {
  private readonly records =
    new Map<SequenceStreamKey, MutableStreamHealthRecord>();

  private readonly listeners =
    new Set<StreamHealthEventListener>();

  private readonly thresholds: StreamHealthThresholds;
  private readonly clock: StreamHealthMonitorClock;

  private nextEventId = 1;
  private disposed = false;

  public constructor(
    thresholds: Partial<StreamHealthThresholds> = {},
    clock: StreamHealthMonitorClock = SYSTEM_CLOCK,
  ) {
    this.thresholds = normalizeThresholds({
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    });

    this.clock = validateClock(clock);
  }

  /**
   * Registers a logical stream for health supervision.
   */
  public register(
    registration: StreamHealthRegistration,
  ): StreamHealthSnapshot {
    this.assertActive();
    validateRegistration(registration);

    const streamKey =
      normalizeStreamKey(registration.streamKey);

    if (this.records.has(streamKey)) {
      throw new StreamHealthMonitorError(
        "DUPLICATE_HEALTH_STREAM",
        `Health stream "${streamKey}" is already registered.`,
        {
          streamKey,
        },
      );
    }

    const timestamp = this.now();

    const record: MutableStreamHealthRecord = {
      streamKey,
      exchangeId: normalizeExchangeId(
        registration.exchangeId,
      ),
      connectionId: normalizeConnectionId(
        registration.connectionId,
      ),
      channel: normalizeChannel(
        registration.channel,
      ),
      symbol:
        registration.symbol === undefined
          ? undefined
          : normalizeStreamingSymbol(
              registration.symbol,
            ),
      eventType: registration.eventType,
      subscriptionId:
        registration.subscriptionId === undefined
          ? undefined
          : normalizeSubscriptionId(
              registration.subscriptionId,
            ),
      registeredAt: timestamp,
      metadata:
        registration.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({
              ...registration.metadata,
            }),
      signals: new Map<
        StreamHealthSignalType,
        MutableHealthSignal
      >(),
      status: "UNKNOWN",
      lastChangedAt: timestamp,
      lastActivityAt: timestamp,
      lastEvaluatedAt: timestamp,
      stale: false,
    };

    this.records.set(streamKey, record);

    this.emit({
      type: "STREAM_REGISTERED",
      record,
      occurredAt: timestamp,
    });

    return createStreamSnapshot(record);
  }

  /**
   * Removes one health stream.
   */
  public unregister(
    streamKey: SequenceStreamKey,
  ): StreamHealthSnapshot {
    this.assertActive();

    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const record =
      this.getRequiredRecord(normalizedStreamKey);

    const snapshot = createStreamSnapshot(record);

    this.records.delete(normalizedStreamKey);

    this.emit({
      type: "STREAM_UNREGISTERED",
      record,
      occurredAt: this.now(),
    });

    return snapshot;
  }

  /**
   * Updates one health signal and reevaluates the stream.
   */
  public updateSignal(
    update: StreamHealthSignalUpdate,
  ): StreamHealthSnapshot {
    this.assertActive();
    validateSignalUpdate(update);

    const streamKey =
      normalizeStreamKey(update.streamKey);

    const record =
      this.getRequiredRecord(streamKey);

    const occurredAt =
      update.occurredAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "update.occurredAt",
    );

    if (occurredAt < record.lastChangedAt) {
      throw new StreamHealthMonitorError(
        "NON_MONOTONIC_HEALTH_SIGNAL_TIMESTAMP",
        `Health signal timestamp ${occurredAt} is earlier than stream timestamp ${record.lastChangedAt}.`,
        {
          streamKey,
        },
      );
    }

    const existingSignal =
      record.signals.get(update.signalType);

    if (existingSignal === undefined) {
      record.signals.set(update.signalType, {
        signalType: update.signalType,
        status: update.status,
        updatedAt: occurredAt,
        reason: normalizeOptionalReason(
          update.reason,
        ),
        metric: update.metric,
        metadata:
          update.metadata === undefined
            ? EMPTY_METADATA
            : Object.freeze({
                ...update.metadata,
              }),
      });
    } else {
      existingSignal.status = update.status;
      existingSignal.updatedAt = occurredAt;
      existingSignal.reason =
        normalizeOptionalReason(update.reason);
      existingSignal.metric = update.metric;
      existingSignal.metadata =
        update.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({
              ...update.metadata,
            });
    }

    record.lastChangedAt = occurredAt;

    this.emit({
      type: "SIGNAL_UPDATED",
      record,
      occurredAt,
      signalType: update.signalType,
      reason: update.reason,
    });

    this.evaluateRecord(record, occurredAt);

    return createStreamSnapshot(record);
  }

  /**
   * Convenience mapping for WebSocket connection state.
   */
  public updateConnection(
    update: StreamHealthConnectionUpdate,
  ): StreamHealthSnapshot {
    validateConnectionUpdate(update);

    return this.updateSignal({
      streamKey: update.streamKey,
      signalType: "CONNECTION",
      status: mapConnectionStateToHealth(
        update.state,
      ),
      occurredAt: update.occurredAt,
      reason:
        update.reason ??
        `Connection state is ${update.state}.`,
    });
  }

  /**
   * Convenience mapping for subscription lifecycle state.
   */
  public updateSubscription(
    update: StreamHealthSubscriptionUpdate,
  ): StreamHealthSnapshot {
    validateSubscriptionUpdate(update);

    return this.updateSignal({
      streamKey: update.streamKey,
      signalType: "SUBSCRIPTION",
      status: mapSubscriptionStateToHealth(
        update.state,
      ),
      occurredAt: update.occurredAt,
      reason:
        update.reason ??
        `Subscription state is ${update.state}.`,
    });
  }

  /**
   * Records successful stream activity.
   */
  public recordActivity(
    update: StreamHealthActivityUpdate,
  ): StreamHealthSnapshot {
    this.assertActive();
    validateActivityUpdate(update);

    const streamKey =
      normalizeStreamKey(update.streamKey);

    const record =
      this.getRequiredRecord(streamKey);

    const occurredAt =
      update.occurredAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "update.occurredAt",
    );

    if (occurredAt < record.lastActivityAt) {
      throw new StreamHealthMonitorError(
        "NON_MONOTONIC_ACTIVITY_TIMESTAMP",
        `Activity timestamp ${occurredAt} is earlier than the previous activity timestamp ${record.lastActivityAt}.`,
        {
          streamKey,
        },
      );
    }

    const wasStale = record.stale;

    record.lastActivityAt = occurredAt;
    record.lastChangedAt = occurredAt;
    record.stale = false;

    this.setSignalInternal(
      record,
      "ACTIVITY",
      "HEALTHY",
      occurredAt,
      "Stream activity recorded.",
    );

    this.evaluateRecord(record, occurredAt);

    if (wasStale && !record.stale) {
      this.emit({
        type: "STREAM_RECOVERED",
        record,
        occurredAt,
        reason: "Stream activity resumed.",
      });
    }

    return createStreamSnapshot(record);
  }

  /**
   * Forces a stream to a specified health status until the override is
   * cleared.
   */
  public setManualOverride(
    override: StreamHealthManualOverride,
  ): StreamHealthSnapshot {
    this.assertActive();
    validateManualOverride(override);

    const streamKey =
      normalizeStreamKey(override.streamKey);

    const record =
      this.getRequiredRecord(streamKey);

    const occurredAt =
      override.occurredAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "override.occurredAt",
    );

    record.manualOverrideStatus =
      override.status;

    record.manualOverrideReason =
      validateReason(override.reason);

    record.lastChangedAt = occurredAt;

    this.setSignalInternal(
      record,
      "MANUAL",
      override.status,
      occurredAt,
      record.manualOverrideReason,
    );

    this.evaluateRecord(record, occurredAt);

    this.emit({
      type: "MANUAL_OVERRIDE_SET",
      record,
      occurredAt,
      reason: record.manualOverrideReason,
    });

    return createStreamSnapshot(record);
  }

  /**
   * Removes a manual health override.
   */
  public clearManualOverride(
    streamKey: SequenceStreamKey,
  ): StreamHealthSnapshot {
    this.assertActive();

    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const record =
      this.getRequiredRecord(normalizedStreamKey);

    const occurredAt = this.now();

    record.manualOverrideStatus = undefined;
    record.manualOverrideReason = undefined;
    record.signals.delete("MANUAL");
    record.lastChangedAt = occurredAt;

    this.evaluateRecord(record, occurredAt);

    this.emit({
      type: "MANUAL_OVERRIDE_CLEARED",
      record,
      occurredAt,
      reason: "Manual health override cleared.",
    });

    return createStreamSnapshot(record);
  }

  /**
   * Reevaluates all registered streams, including inactivity thresholds.
   */
  public tick(): StreamHealthMonitorSnapshot {
    this.assertActive();

    const occurredAt = this.now();

    for (const record of this.getOrderedRecords()) {
      this.evaluateRecord(record, occurredAt);
    }

    return this.getSnapshot();
  }

  public evaluate(
    streamKey: SequenceStreamKey,
  ): StreamHealthSnapshot {
    this.assertActive();

    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const record =
      this.getRequiredRecord(normalizedStreamKey);

    this.evaluateRecord(record, this.now());

    return createStreamSnapshot(record);
  }

  public subscribe(
    listener: StreamHealthEventListener,
  ): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new StreamHealthMonitorError(
        "INVALID_HEALTH_LISTENER",
        "Stream health event listener must be a function.",
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

  public getStream(
    streamKey: SequenceStreamKey,
  ): StreamHealthSnapshot | undefined {
    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const record =
      this.records.get(normalizedStreamKey);

    return record === undefined
      ? undefined
      : createStreamSnapshot(record);
  }

  public getStreamsForExchange(
    exchangeId: StreamingExchangeId,
  ): readonly StreamHealthSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.exchangeId ===
            normalizedExchangeId,
        )
        .map((record) =>
          createStreamSnapshot(record),
        ),
    );
  }

  public getStreamsForConnection(
    connectionId: StreamingConnectionId,
  ): readonly StreamHealthSnapshot[] {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.connectionId ===
            normalizedConnectionId,
        )
        .map((record) =>
          createStreamSnapshot(record),
        ),
    );
  }

  public getUnhealthyStreams():
    readonly StreamHealthSnapshot[] {
    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.status === "UNHEALTHY",
        )
        .map((record) =>
          createStreamSnapshot(record),
        ),
    );
  }

  public getSnapshot():
    StreamHealthMonitorSnapshot {
    const streams =
      this.getOrderedRecords().map((record) =>
        createStreamSnapshot(record),
      );

    let healthyStreams = 0;
    let degradedStreams = 0;
    let unhealthyStreams = 0;
    let unknownStreams = 0;
    let staleStreams = 0;

    for (const stream of streams) {
      switch (stream.status) {
        case "HEALTHY":
          healthyStreams += 1;
          break;

        case "DEGRADED":
          degradedStreams += 1;
          break;

        case "UNHEALTHY":
          unhealthyStreams += 1;
          break;

        case "UNKNOWN":
          unknownStreams += 1;
          break;

        default:
          assertNever(stream.status);
      }

      if (stream.stale) {
        staleStreams += 1;
      }
    }

    const exchanges =
      createExchangeSnapshots(streams);

    const connections =
      createConnectionSnapshots(streams);

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      overallStatus: deriveAggregateStatus(
        streams,
      ),
      totalStreams: streams.length,
      healthyStreams,
      degradedStreams,
      unhealthyStreams,
      unknownStreams,
      staleStreams,
      exchangeCount: exchanges.length,
      connectionCount: connections.length,
      exchanges,
      connections,
      streams: Object.freeze(streams),
    });
  }

  public get streamCount(): number {
    return this.records.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.records.clear();
    this.listeners.clear();
    this.disposed = true;
  }

  private evaluateRecord(
    record: MutableStreamHealthRecord,
    occurredAt: number,
  ): void {
    validateTimestamp(
      occurredAt,
      "occurredAt",
    );

    const inactivityMs =
      occurredAt - record.lastActivityAt;

    let staleStatus: StreamHealthSignalStatus =
      "HEALTHY";

    let staleReason =
      "Stream activity is current.";

    if (
      this.thresholds
        .unhealthyAfterInactivityMs > 0 &&
      inactivityMs >=
        this.thresholds
          .unhealthyAfterInactivityMs
    ) {
      staleStatus = "UNHEALTHY";
      staleReason =
        `No stream activity for ${inactivityMs} ms.`;
    } else if (
      this.thresholds
        .degradedAfterInactivityMs > 0 &&
      inactivityMs >=
        this.thresholds
          .degradedAfterInactivityMs
    ) {
      staleStatus = "DEGRADED";
      staleReason =
        `Stream activity delayed for ${inactivityMs} ms.`;
    }

    const previouslyStale = record.stale;

    record.stale =
      staleStatus === "DEGRADED" ||
      staleStatus === "UNHEALTHY";

    this.setSignalInternal(
      record,
      "ACTIVITY",
      staleStatus,
      occurredAt,
      staleReason,
    );

    const previousStatus = record.status;

    const evaluation =
      evaluateSignals(
        record,
        this.thresholds,
      );

    record.status = evaluation.status;
    record.reason = evaluation.reason;
    record.lastEvaluatedAt = occurredAt;

    if (record.status !== previousStatus) {
      record.lastChangedAt = occurredAt;

      this.emit({
        type: "HEALTH_CHANGED",
        record,
        occurredAt,
        previousStatus,
        reason: record.reason,
      });
    }

    if (!previouslyStale && record.stale) {
      this.emit({
        type: "STREAM_STALE",
        record,
        occurredAt,
        reason: staleReason,
      });
    }

    if (previouslyStale && !record.stale) {
      this.emit({
        type: "STREAM_RECOVERED",
        record,
        occurredAt,
        reason: "Stream activity recovered.",
      });
    }
  }

  private setSignalInternal(
    record: MutableStreamHealthRecord,
    signalType: StreamHealthSignalType,
    status: StreamHealthSignalStatus,
    occurredAt: number,
    reason?: string,
    metric?: number,
  ): void {
    const existing =
      record.signals.get(signalType);

    if (existing === undefined) {
      record.signals.set(signalType, {
        signalType,
        status,
        updatedAt: occurredAt,
        reason,
        metric,
        metadata: EMPTY_METADATA,
      });

      return;
    }

    existing.status = status;
    existing.updatedAt = occurredAt;
    existing.reason = reason;
    existing.metric = metric;
  }

  private emit(input: {
    readonly type: StreamHealthEventType;
    readonly record: MutableStreamHealthRecord;
    readonly occurredAt?: number;
    readonly previousStatus?: StreamHealthStatus;
    readonly signalType?: StreamHealthSignalType;
    readonly reason?: string;
  }): void {
    const event: StreamHealthEvent =
      Object.freeze({
        eventId: this.nextEventId,
        type: input.type,
        streamKey: input.record.streamKey,
        exchangeId: input.record.exchangeId,
        connectionId:
          input.record.connectionId,
        occurredAt:
          input.occurredAt ?? this.now(),
        status: input.record.status,
        previousStatus:
          input.previousStatus,
        signalType: input.signalType,
        reason: input.reason,
      });

    this.nextEventId += 1;

    const listeners = [...this.listeners];

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not interrupt health evaluation.
      }
    }
  }

  private getRequiredRecord(
    streamKey: SequenceStreamKey,
  ): MutableStreamHealthRecord {
    const record = this.records.get(streamKey);

    if (record === undefined) {
      throw new StreamHealthMonitorError(
        "HEALTH_STREAM_NOT_FOUND",
        `Health stream "${streamKey}" was not found.`,
        {
          streamKey,
        },
      );
    }

    return record;
  }

  private getOrderedRecords():
    MutableStreamHealthRecord[] {
    return [...this.records.values()].sort(
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

        return left.streamKey.localeCompare(
          right.streamKey,
        );
      },
    );
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new StreamHealthMonitorError(
        "STREAM_HEALTH_MONITOR_DISPOSED",
        "The stream health monitor has been disposed.",
      );
    }
  }
}

function evaluateSignals(
  record: MutableStreamHealthRecord,
  thresholds: StreamHealthThresholds,
): {
  readonly status: StreamHealthStatus;
  readonly reason?: string;
} {
  if (record.manualOverrideStatus !== undefined) {
    return {
      status: record.manualOverrideStatus,
      reason:
        record.manualOverrideReason ??
        "Manual health override applied.",
    };
  }

  const signals = [...record.signals.values()];

  if (signals.length === 0) {
    return {
      status: "UNKNOWN",
      reason: "No health signals are available.",
    };
  }

  let degradedCount = 0;
  let unhealthyCount = 0;
  let healthyCount = 0;

  for (const signal of signals) {
    switch (signal.status) {
      case "HEALTHY":
        healthyCount += 1;
        break;

      case "DEGRADED":
        degradedCount += 1;
        break;

      case "UNHEALTHY":
        unhealthyCount += 1;
        break;

      case "UNKNOWN":
        break;

      default:
        assertNever(signal.status);
    }

    if (
      thresholds.failFastOnCriticalSignal &&
      signal.status === "UNHEALTHY" &&
      CRITICAL_SIGNAL_TYPES.includes(
        signal.signalType,
      )
    ) {
      return {
        status: "UNHEALTHY",
        reason:
          signal.reason ??
          `Critical ${signal.signalType} signal is unhealthy.`,
      };
    }
  }

  if (
    unhealthyCount >=
    thresholds.unhealthySignalsForUnhealthy
  ) {
    const signal = signals.find(
      (candidate) =>
        candidate.status === "UNHEALTHY",
    );

    return {
      status: "UNHEALTHY",
      reason:
        signal?.reason ??
        `${unhealthyCount} unhealthy health signal(s).`,
    };
  }

  if (
    degradedCount >=
    thresholds.degradedSignalsForUnhealthy
  ) {
    return {
      status: "UNHEALTHY",
      reason:
        `${degradedCount} degraded health signals exceeded the configured limit.`,
    };
  }

  if (
    degradedCount > 0 ||
    unhealthyCount > 0
  ) {
    const signal = signals.find(
      (candidate) =>
        candidate.status === "DEGRADED" ||
        candidate.status === "UNHEALTHY",
    );

    return {
      status: "DEGRADED",
      reason:
        signal?.reason ??
        "One or more health signals are degraded.",
    };
  }

  if (healthyCount > 0) {
    return {
      status: "HEALTHY",
      reason: "All available health signals are healthy.",
    };
  }

  return {
    status: "UNKNOWN",
    reason: "Health signals are unknown.",
  };
}

function createStreamSnapshot(
  record: MutableStreamHealthRecord,
): StreamHealthSnapshot {
  const signals = [...record.signals.values()]
    .sort((left, right) =>
      left.signalType.localeCompare(
        right.signalType,
      ),
    )
    .map((signal) =>
      Object.freeze({
        signalType: signal.signalType,
        status: signal.status,
        updatedAt: signal.updatedAt,
        reason: signal.reason,
        metric: signal.metric,
        metadata: Object.freeze({
          ...signal.metadata,
        }),
      }),
    );

  let degradedSignalCount = 0;
  let unhealthySignalCount = 0;

  for (const signal of signals) {
    if (signal.status === "DEGRADED") {
      degradedSignalCount += 1;
    }

    if (signal.status === "UNHEALTHY") {
      unhealthySignalCount += 1;
    }
  }

  return Object.freeze({
    streamKey: record.streamKey,
    exchangeId: record.exchangeId,
    connectionId: record.connectionId,
    channel: record.channel,
    symbol: record.symbol,
    eventType: record.eventType,
    subscriptionId: record.subscriptionId,
    status: record.status,
    registeredAt: record.registeredAt,
    lastChangedAt: record.lastChangedAt,
    lastActivityAt: record.lastActivityAt,
    lastEvaluatedAt: record.lastEvaluatedAt,
    stale: record.stale,
    degradedSignalCount,
    unhealthySignalCount,
    manualOverrideStatus:
      record.manualOverrideStatus,
    manualOverrideReason:
      record.manualOverrideReason,
    reason: record.reason,
    signals: Object.freeze(signals),
    metadata: Object.freeze({
      ...record.metadata,
    }),
  });
}

function createExchangeSnapshots(
  streams: readonly StreamHealthSnapshot[],
): readonly ExchangeStreamHealthSnapshot[] {
  const grouped =
    new Map<
      StreamingExchangeId,
      StreamHealthSnapshot[]
    >();

  for (const stream of streams) {
    const collection =
      grouped.get(stream.exchangeId) ?? [];

    collection.push(stream);

    grouped.set(
      stream.exchangeId,
      collection,
    );
  }

  return Object.freeze(
    [...grouped.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right),
      )
      .map(([exchangeId, collection]) => {
        const counts =
          countStatuses(collection);

        return Object.freeze({
          exchangeId,
          status:
            deriveAggregateStatus(collection),
          streamCount: collection.length,
          ...counts,
          lastEvaluatedAt: Math.max(
            ...collection.map(
              (stream) =>
                stream.lastEvaluatedAt,
            ),
          ),
          streams: Object.freeze([
            ...collection,
          ]),
        });
      }),
  );
}

function createConnectionSnapshots(
  streams: readonly StreamHealthSnapshot[],
): readonly ConnectionStreamHealthSnapshot[] {
  const grouped =
    new Map<
      StreamingConnectionId,
      StreamHealthSnapshot[]
    >();

  for (const stream of streams) {
    const collection =
      grouped.get(stream.connectionId) ?? [];

    collection.push(stream);

    grouped.set(
      stream.connectionId,
      collection,
    );
  }

  return Object.freeze(
    [...grouped.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right),
      )
      .map(([connectionId, collection]) => {
        const counts =
          countStatuses(collection);

        return Object.freeze({
          connectionId,
          exchangeId:
            collection[0]?.exchangeId ??
            "UNKNOWN",
          status:
            deriveAggregateStatus(collection),
          streamCount: collection.length,
          ...counts,
          lastEvaluatedAt: Math.max(
            ...collection.map(
              (stream) =>
                stream.lastEvaluatedAt,
            ),
          ),
          streams: Object.freeze([
            ...collection,
          ]),
        });
      }),
  );
}

function countStatuses(
  streams: readonly StreamHealthSnapshot[],
): {
  readonly healthyStreams: number;
  readonly degradedStreams: number;
  readonly unhealthyStreams: number;
  readonly unknownStreams: number;
} {
  let healthyStreams = 0;
  let degradedStreams = 0;
  let unhealthyStreams = 0;
  let unknownStreams = 0;

  for (const stream of streams) {
    switch (stream.status) {
      case "HEALTHY":
        healthyStreams += 1;
        break;

      case "DEGRADED":
        degradedStreams += 1;
        break;

      case "UNHEALTHY":
        unhealthyStreams += 1;
        break;

      case "UNKNOWN":
        unknownStreams += 1;
        break;

      default:
        assertNever(stream.status);
    }
  }

  return {
    healthyStreams,
    degradedStreams,
    unhealthyStreams,
    unknownStreams,
  };
}

function deriveAggregateStatus(
  streams: readonly StreamHealthSnapshot[],
): StreamHealthStatus {
  if (streams.length === 0) {
    return "UNKNOWN";
  }

  if (
    streams.some(
      (stream) =>
        stream.status === "UNHEALTHY",
    )
  ) {
    return "UNHEALTHY";
  }

  if (
    streams.some(
      (stream) =>
        stream.status === "DEGRADED",
    )
  ) {
    return "DEGRADED";
  }

  if (
    streams.every(
      (stream) =>
        stream.status === "HEALTHY",
    )
  ) {
    return "HEALTHY";
  }

  return "UNKNOWN";
}

function mapConnectionStateToHealth(
  state: WebSocketConnectionState,
): StreamHealthSignalStatus {
  switch (state) {
    case "CONNECTED":
      return "HEALTHY";

    case "CONNECTING":
    case "DISCONNECTING":
    case "RECONNECTING":
      return "DEGRADED";

    case "FAILED":
    case "DISPOSED":
      return "UNHEALTHY";

    case "REGISTERED":
    case "DISCONNECTED":
      return "UNKNOWN";

    default:
      return assertNever(state);
  }
}

function mapSubscriptionStateToHealth(
  state: UnifiedSubscriptionState,
): StreamHealthSignalStatus {
  switch (state) {
    case "ACTIVE":
      return "HEALTHY";

    case "PENDING":
    case "SUBSCRIBING":
    case "UNSUBSCRIBING":
      return "DEGRADED";

    case "FAILED":
      return "UNHEALTHY";

    case "INACTIVE":
      return "UNKNOWN";

    default:
      return assertNever(state);
  }
}

function normalizeThresholds(
  thresholds: Partial<StreamHealthThresholds>,
): StreamHealthThresholds {
  const degradedAfterInactivityMs =
    validateNonNegativeFiniteNumber(
      thresholds.degradedAfterInactivityMs ??
        DEFAULT_THRESHOLDS
          .degradedAfterInactivityMs,
      "degradedAfterInactivityMs",
    );

  const unhealthyAfterInactivityMs =
    validateNonNegativeFiniteNumber(
      thresholds.unhealthyAfterInactivityMs ??
        DEFAULT_THRESHOLDS
          .unhealthyAfterInactivityMs,
      "unhealthyAfterInactivityMs",
    );

  if (
    degradedAfterInactivityMs > 0 &&
    unhealthyAfterInactivityMs > 0 &&
    unhealthyAfterInactivityMs <=
      degradedAfterInactivityMs
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_INACTIVITY_THRESHOLDS",
      "unhealthyAfterInactivityMs must be greater than degradedAfterInactivityMs.",
    );
  }

  const degradedSignalsForUnhealthy =
    validatePositiveSafeInteger(
      thresholds.degradedSignalsForUnhealthy ??
        DEFAULT_THRESHOLDS
          .degradedSignalsForUnhealthy,
      "degradedSignalsForUnhealthy",
    );

  const unhealthySignalsForUnhealthy =
    validatePositiveSafeInteger(
      thresholds.unhealthySignalsForUnhealthy ??
        DEFAULT_THRESHOLDS
          .unhealthySignalsForUnhealthy,
      "unhealthySignalsForUnhealthy",
    );

  const failFastOnCriticalSignal =
    thresholds.failFastOnCriticalSignal ??
    DEFAULT_THRESHOLDS
      .failFastOnCriticalSignal;

  if (
    typeof failFastOnCriticalSignal !==
    "boolean"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_FAIL_FAST_OPTION",
      "failFastOnCriticalSignal must be boolean.",
    );
  }

  return Object.freeze({
    degradedAfterInactivityMs,
    unhealthyAfterInactivityMs,
    degradedSignalsForUnhealthy,
    unhealthySignalsForUnhealthy,
    failFastOnCriticalSignal,
  });
}

function validateRegistration(
  registration: StreamHealthRegistration,
): void {
  if (
    registration === null ||
    typeof registration !== "object"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_HEALTH_REGISTRATION",
      "Stream health registration must be an object.",
    );
  }

  normalizeStreamKey(registration.streamKey);
  normalizeExchangeId(registration.exchangeId);
  normalizeConnectionId(
    registration.connectionId,
  );
  normalizeChannel(registration.channel);

  if (registration.symbol !== undefined) {
    normalizeStreamingSymbol(
      registration.symbol,
    );
  }

  validateUnifiedStreamEventType(
    registration.eventType,
  );

  if (
    registration.subscriptionId !==
    undefined
  ) {
    normalizeSubscriptionId(
      registration.subscriptionId,
    );
  }

  validateOptionalRecord(
    registration.metadata,
    "registration.metadata",
  );
}

function validateSignalUpdate(
  update: StreamHealthSignalUpdate,
): void {
  if (
    update === null ||
    typeof update !== "object"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_SIGNAL_UPDATE",
      "Stream health signal update must be an object.",
    );
  }

  normalizeStreamKey(update.streamKey);
  validateSignalType(update.signalType);
  validateSignalStatus(update.status);

  if (update.occurredAt !== undefined) {
    validateTimestamp(
      update.occurredAt,
      "update.occurredAt",
    );
  }

  if (update.reason !== undefined) {
    normalizeOptionalReason(update.reason);
  }

  if (
    update.metric !== undefined &&
    !Number.isFinite(update.metric)
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_HEALTH_METRIC",
      "Health signal metric must be finite when provided.",
      {
        streamKey: update.streamKey,
      },
    );
  }

  validateOptionalRecord(
    update.metadata,
    "update.metadata",
  );
}

function validateConnectionUpdate(
  update: StreamHealthConnectionUpdate,
): void {
  if (
    update === null ||
    typeof update !== "object"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_CONNECTION_UPDATE",
      "Stream health connection update must be an object.",
    );
  }

  normalizeStreamKey(update.streamKey);

  if (update.occurredAt !== undefined) {
    validateTimestamp(
      update.occurredAt,
      "update.occurredAt",
    );
  }
}

function validateSubscriptionUpdate(
  update: StreamHealthSubscriptionUpdate,
): void {
  if (
    update === null ||
    typeof update !== "object"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_SUBSCRIPTION_UPDATE",
      "Stream health subscription update must be an object.",
    );
  }

  normalizeStreamKey(update.streamKey);
  validateUnifiedSubscriptionState(
    update.state,
  );

  if (update.occurredAt !== undefined) {
    validateTimestamp(
      update.occurredAt,
      "update.occurredAt",
    );
  }
}

function validateActivityUpdate(
  update: StreamHealthActivityUpdate,
): void {
  if (
    update === null ||
    typeof update !== "object"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_ACTIVITY_UPDATE",
      "Stream health activity update must be an object.",
    );
  }

  normalizeStreamKey(update.streamKey);

  if (update.occurredAt !== undefined) {
    validateTimestamp(
      update.occurredAt,
      "update.occurredAt",
    );
  }
}

function validateManualOverride(
  override: StreamHealthManualOverride,
): void {
  if (
    override === null ||
    typeof override !== "object"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_MANUAL_OVERRIDE",
      "Stream health manual override must be an object.",
    );
  }

  normalizeStreamKey(override.streamKey);
  validateHealthStatus(override.status);
  validateReason(override.reason);

  if (override.occurredAt !== undefined) {
    validateTimestamp(
      override.occurredAt,
      "override.occurredAt",
    );
  }
}

function validateSignalType(
  signalType: StreamHealthSignalType,
): void {
  if (
    signalType !== "CONNECTION" &&
    signalType !== "HEARTBEAT" &&
    signalType !== "LATENCY" &&
    signalType !== "SEQUENCE" &&
    signalType !== "BACKPRESSURE" &&
    signalType !== "SUBSCRIPTION" &&
    signalType !== "ACTIVITY" &&
    signalType !== "MANUAL"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_SIGNAL_TYPE",
      `Unsupported stream health signal type "${String(
        signalType,
      )}".`,
    );
  }
}

function validateSignalStatus(
  status: StreamHealthSignalStatus,
): void {
  validateHealthStatus(status);
}

function validateHealthStatus(
  status: StreamHealthStatus,
): void {
  if (
    status !== "HEALTHY" &&
    status !== "DEGRADED" &&
    status !== "UNHEALTHY" &&
    status !== "UNKNOWN"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_HEALTH_STATUS",
      `Unsupported stream health status "${String(
        status,
      )}".`,
    );
  }
}

function normalizeStreamKey(
  streamKey: SequenceStreamKey,
): SequenceStreamKey {
  if (
    typeof streamKey !== "string" ||
    streamKey.trim().length === 0
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_STREAM_KEY",
      "streamKey must be a non-empty string.",
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

function normalizeSubscriptionId(
  subscriptionId: StreamingSubscriptionId,
): StreamingSubscriptionId {
  validateStreamingSubscriptionId(
    subscriptionId,
  );

  return subscriptionId.trim();
}

function validateReason(reason: string): string {
  if (
    typeof reason !== "string" ||
    reason.trim().length === 0
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_HEALTH_REASON",
      "Health reason must be a non-empty string.",
    );
  }

  return reason.trim();
}

function normalizeOptionalReason(
  reason: string | undefined,
): string | undefined {
  return reason === undefined
    ? undefined
    : validateReason(reason);
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new StreamHealthMonitorError(
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
    throw new StreamHealthMonitorError(
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
    throw new StreamHealthMonitorError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
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
    throw new StreamHealthMonitorError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function validateClock(
  clock: StreamHealthMonitorClock,
): StreamHealthMonitorClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new StreamHealthMonitorError(
      "INVALID_CLOCK",
      "Stream health monitor clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function assertNever(value: never): never {
  throw new StreamHealthMonitorError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}