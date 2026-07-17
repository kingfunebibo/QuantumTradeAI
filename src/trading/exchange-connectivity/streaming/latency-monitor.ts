/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 11:
 * Latency Monitor
 *
 * Responsibilities:
 * - Record normalized streaming latency samples
 * - Measure network, processing, and end-to-end latency
 * - Maintain deterministic rolling windows
 * - Calculate min, max, mean, median, percentiles, deviation, and jitter
 * - Track statistics by exchange, connection, and stream
 * - Generate threshold-based latency alerts
 * - Produce immutable snapshots
 * - Support deterministic testing through an injected clock
 */

import {
  StreamingChannel,
  StreamingConnectionId,
  StreamingExchangeId,
  StreamingSymbol,
  UnifiedStreamEvent,
  UnifiedStreamEventType,
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

export type LatencyMetricType =
  | "NETWORK"
  | "PROCESSING"
  | "END_TO_END";

export type LatencyHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export type LatencyAlertSeverity =
  | "WARNING"
  | "CRITICAL";

export type LatencyAlertType =
  | "SAMPLE_THRESHOLD_EXCEEDED"
  | "AVERAGE_THRESHOLD_EXCEEDED"
  | "P95_THRESHOLD_EXCEEDED"
  | "P99_THRESHOLD_EXCEEDED"
  | "JITTER_THRESHOLD_EXCEEDED";

export interface LatencyMonitorClock {
  now(): number;
}

export interface LatencyThresholds {
  readonly warningLatencyMs: number;
  readonly criticalLatencyMs: number;
  readonly warningJitterMs: number;
  readonly criticalJitterMs: number;
}

export interface LatencyMonitorOptions {
  /**
   * Maximum number of samples retained for one metric scope.
   */
  readonly maxSamplesPerScope?: number;

  /**
   * Maximum age of retained samples.
   *
   * Set to zero to disable age-based eviction.
   */
  readonly rollingWindowMs?: number;

  /**
   * Number of samples required before aggregate threshold alerts are emitted.
   */
  readonly minimumSamplesForAggregateAlerts?: number;

  readonly thresholds?: Partial<LatencyThresholds>;
}

export interface LatencySampleInput {
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly streamKey?: SequenceStreamKey;
  readonly eventId?: string;

  readonly exchangeTimestamp?: number;
  readonly receivedAt: number;
  readonly processingStartedAt?: number;
  readonly processingCompletedAt?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LatencySample {
  readonly sampleId: number;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly streamKey: SequenceStreamKey;
  readonly eventId?: string;
  readonly recordedAt: number;
  readonly exchangeTimestamp?: number;
  readonly receivedAt: number;
  readonly processingStartedAt?: number;
  readonly processingCompletedAt?: number;
  readonly networkLatencyMs?: number;
  readonly processingLatencyMs?: number;
  readonly endToEndLatencyMs?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LatencyStatistics {
  readonly sampleCount: number;
  readonly minimumMs?: number;
  readonly maximumMs?: number;
  readonly meanMs?: number;
  readonly medianMs?: number;
  readonly p90Ms?: number;
  readonly p95Ms?: number;
  readonly p99Ms?: number;
  readonly variance?: number;
  readonly standardDeviationMs?: number;
  readonly jitterMs?: number;
  readonly latestMs?: number;
}

export interface LatencyMetricSnapshot {
  readonly metricType: LatencyMetricType;
  readonly healthStatus: LatencyHealthStatus;
  readonly statistics: LatencyStatistics;
}

export interface LatencyScopeSnapshot {
  readonly scopeId: string;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly streamKey?: SequenceStreamKey;
  readonly channel?: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType?: UnifiedStreamEventType;
  readonly createdAt: number;
  readonly lastSampleAt?: number;
  readonly sampleCount: number;
  readonly network: LatencyMetricSnapshot;
  readonly processing: LatencyMetricSnapshot;
  readonly endToEnd: LatencyMetricSnapshot;
}

export interface LatencyAlert {
  readonly alertId: number;
  readonly type: LatencyAlertType;
  readonly severity: LatencyAlertSeverity;
  readonly metricType: LatencyMetricType;
  readonly scopeId: string;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly streamKey?: SequenceStreamKey;
  readonly occurredAt: number;
  readonly observedValueMs: number;
  readonly thresholdMs: number;
  readonly message: string;
}

export type LatencyAlertListener = (
  alert: LatencyAlert,
) => void;

export interface LatencyRecordResult {
  readonly sample: LatencySample;
  readonly generatedAlerts: readonly LatencyAlert[];
}

export interface LatencyMonitorSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalSamples: number;
  readonly totalAlerts: number;
  readonly exchangeCount: number;
  readonly connectionCount: number;
  readonly streamCount: number;
  readonly exchanges: readonly LatencyScopeSnapshot[];
  readonly connections: readonly LatencyScopeSnapshot[];
  readonly streams: readonly LatencyScopeSnapshot[];
  readonly recentAlerts: readonly LatencyAlert[];
}

interface MutableMetricSeries {
  readonly samples: Array<{
    readonly value: number;
    readonly recordedAt: number;
  }>;
}

interface MutableLatencyScope {
  readonly scopeId: string;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly streamKey?: SequenceStreamKey;
  readonly channel?: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType?: UnifiedStreamEventType;
  readonly createdAt: number;

  lastSampleAt?: number;
  sampleCount: number;
  readonly network: MutableMetricSeries;
  readonly processing: MutableMetricSeries;
  readonly endToEnd: MutableMetricSeries;
}

const DEFAULT_MAX_SAMPLES_PER_SCOPE = 1_000;
const DEFAULT_ROLLING_WINDOW_MS = 300_000;
const DEFAULT_MINIMUM_AGGREGATE_SAMPLES = 5;
const MAX_RECENT_ALERTS = 500;

const DEFAULT_THRESHOLDS: LatencyThresholds =
  Object.freeze({
    warningLatencyMs: 500,
    criticalLatencyMs: 1_500,
    warningJitterMs: 150,
    criticalJitterMs: 500,
  });

const SYSTEM_CLOCK: LatencyMonitorClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

export class LatencyMonitorError extends Error {
  public readonly code: string;
  public readonly scopeId?: string;
  public readonly eventId?: string;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly scopeId?: string;
      readonly eventId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "LatencyMonitorError";
    this.code = code;
    this.scopeId = context?.scopeId;
    this.eventId = context?.eventId;
  }
}

/**
 * Deterministic rolling latency monitor.
 */
export class LatencyMonitor {
  private readonly exchangeScopes =
    new Map<StreamingExchangeId, MutableLatencyScope>();

  private readonly connectionScopes =
    new Map<StreamingConnectionId, MutableLatencyScope>();

  private readonly streamScopes =
    new Map<SequenceStreamKey, MutableLatencyScope>();

  private readonly listeners =
    new Set<LatencyAlertListener>();

  private readonly recentAlerts: LatencyAlert[] = [];

  private readonly clock: LatencyMonitorClock;
  private readonly maxSamplesPerScope: number;
  private readonly rollingWindowMs: number;
  private readonly minimumSamplesForAggregateAlerts: number;
  private readonly thresholds: LatencyThresholds;

  private nextSampleId = 1;
  private nextAlertId = 1;
  private totalSamples = 0;
  private totalAlerts = 0;
  private disposed = false;

  public constructor(
    options: LatencyMonitorOptions = {},
    clock: LatencyMonitorClock = SYSTEM_CLOCK,
  ) {
    this.clock = validateClock(clock);

    this.maxSamplesPerScope = validatePositiveSafeInteger(
      options.maxSamplesPerScope ??
        DEFAULT_MAX_SAMPLES_PER_SCOPE,
      "maxSamplesPerScope",
    );

    this.rollingWindowMs =
      validateNonNegativeFiniteNumber(
        options.rollingWindowMs ??
          DEFAULT_ROLLING_WINDOW_MS,
        "rollingWindowMs",
      );

    this.minimumSamplesForAggregateAlerts =
      validatePositiveSafeInteger(
        options.minimumSamplesForAggregateAlerts ??
          DEFAULT_MINIMUM_AGGREGATE_SAMPLES,
        "minimumSamplesForAggregateAlerts",
      );

    this.thresholds = normalizeThresholds(
      options.thresholds,
    );
  }

  /**
   * Records latency directly from a normalized stream event.
   */
  public recordEvent(
    event: UnifiedStreamEvent,
    processingStartedAt?: number,
    processingCompletedAt?: number,
  ): LatencyRecordResult {
    this.assertActive();
    validateUnifiedStreamEvent(event);

    return this.record({
      exchangeId: event.exchangeId,
      connectionId: event.connectionId,
      channel: event.channel,
      symbol: event.symbol,
      eventType: event.type,
      streamKey: createSequenceStreamKey(event),
      eventId: event.eventId,
      exchangeTimestamp: event.exchangeTimestamp,
      receivedAt: event.receivedAt,
      processingStartedAt,
      processingCompletedAt,
      metadata: event.metadata,
    });
  }

  /**
   * Records one latency sample.
   */
  public record(
    input: LatencySampleInput,
  ): LatencyRecordResult {
    this.assertActive();

    const normalizedInput =
      normalizeSampleInput(input);

    const recordedAt = this.now();

    const sample = createLatencySample(
      this.nextSampleId,
      normalizedInput,
      recordedAt,
    );

    this.nextSampleId += 1;
    this.totalSamples += 1;

    const exchangeScope =
      this.getOrCreateExchangeScope(
        normalizedInput.exchangeId,
        recordedAt,
      );

    const connectionScope =
      this.getOrCreateConnectionScope(
        normalizedInput,
        recordedAt,
      );

    const streamScope =
      this.getOrCreateStreamScope(
        normalizedInput,
        recordedAt,
      );

    const generatedAlerts: LatencyAlert[] = [];

    for (const scope of [
      exchangeScope,
      connectionScope,
      streamScope,
    ]) {
      this.addSampleToScope(scope, sample);

      generatedAlerts.push(
        ...this.evaluateThresholds(scope, sample),
      );
    }

    return Object.freeze({
      sample,
      generatedAlerts:
        Object.freeze(generatedAlerts),
    });
  }

  public subscribe(
    listener: LatencyAlertListener,
  ): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new LatencyMonitorError(
        "INVALID_ALERT_LISTENER",
        "Latency alert listener must be a function.",
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

  /**
   * Removes expired samples from all rolling windows.
   */
  public cleanup(): void {
    this.assertActive();

    const timestamp = this.now();

    for (const scope of this.getAllScopes()) {
      this.evictExpiredSamples(scope, timestamp);
    }
  }

  public getExchange(
    exchangeId: StreamingExchangeId,
  ): LatencyScopeSnapshot | undefined {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    const scope =
      this.exchangeScopes.get(normalizedExchangeId);

    return scope === undefined
      ? undefined
      : createScopeSnapshot(
          scope,
          this.thresholds,
        );
  }

  public getConnection(
    connectionId: StreamingConnectionId,
  ): LatencyScopeSnapshot | undefined {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    const scope =
      this.connectionScopes.get(
        normalizedConnectionId,
      );

    return scope === undefined
      ? undefined
      : createScopeSnapshot(
          scope,
          this.thresholds,
        );
  }

  public getStream(
    streamKey: SequenceStreamKey,
  ): LatencyScopeSnapshot | undefined {
    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const scope =
      this.streamScopes.get(normalizedStreamKey);

    return scope === undefined
      ? undefined
      : createScopeSnapshot(
          scope,
          this.thresholds,
        );
  }

  public getRecentAlerts(
    limit = 100,
  ): readonly LatencyAlert[] {
    const normalizedLimit =
      validatePositiveSafeInteger(limit, "limit");

    return Object.freeze(
      this.recentAlerts.slice(
        Math.max(
          0,
          this.recentAlerts.length -
            normalizedLimit,
        ),
      ),
    );
  }

  public getSnapshot(): LatencyMonitorSnapshot {
    const exchanges = [...this.exchangeScopes.values()]
      .sort(compareScopes)
      .map((scope) =>
        createScopeSnapshot(
          scope,
          this.thresholds,
        ),
      );

    const connections = [
      ...this.connectionScopes.values(),
    ]
      .sort(compareScopes)
      .map((scope) =>
        createScopeSnapshot(
          scope,
          this.thresholds,
        ),
      );

    const streams = [...this.streamScopes.values()]
      .sort(compareScopes)
      .map((scope) =>
        createScopeSnapshot(
          scope,
          this.thresholds,
        ),
      );

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalSamples: this.totalSamples,
      totalAlerts: this.totalAlerts,
      exchangeCount: exchanges.length,
      connectionCount: connections.length,
      streamCount: streams.length,
      exchanges: Object.freeze(exchanges),
      connections: Object.freeze(connections),
      streams: Object.freeze(streams),
      recentAlerts: Object.freeze([
        ...this.recentAlerts,
      ]),
    });
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.exchangeScopes.clear();
    this.connectionScopes.clear();
    this.streamScopes.clear();
    this.listeners.clear();
    this.recentAlerts.length = 0;
    this.disposed = true;
  }

  private addSampleToScope(
    scope: MutableLatencyScope,
    sample: LatencySample,
  ): void {
    scope.sampleCount += 1;
    scope.lastSampleAt = sample.recordedAt;

    this.evictExpiredSamples(
      scope,
      sample.recordedAt,
    );

    if (sample.networkLatencyMs !== undefined) {
      addMetricSample(
        scope.network,
        sample.networkLatencyMs,
        sample.recordedAt,
        this.maxSamplesPerScope,
      );
    }

    if (
      sample.processingLatencyMs !== undefined
    ) {
      addMetricSample(
        scope.processing,
        sample.processingLatencyMs,
        sample.recordedAt,
        this.maxSamplesPerScope,
      );
    }

    if (
      sample.endToEndLatencyMs !== undefined
    ) {
      addMetricSample(
        scope.endToEnd,
        sample.endToEndLatencyMs,
        sample.recordedAt,
        this.maxSamplesPerScope,
      );
    }
  }

  private evictExpiredSamples(
    scope: MutableLatencyScope,
    timestamp: number,
  ): void {
    if (this.rollingWindowMs === 0) {
      return;
    }

    const minimumTimestamp =
      timestamp - this.rollingWindowMs;

    evictMetricSamples(
      scope.network,
      minimumTimestamp,
    );

    evictMetricSamples(
      scope.processing,
      minimumTimestamp,
    );

    evictMetricSamples(
      scope.endToEnd,
      minimumTimestamp,
    );
  }

  private evaluateThresholds(
    scope: MutableLatencyScope,
    sample: LatencySample,
  ): LatencyAlert[] {
    const alerts: LatencyAlert[] = [];

    const sampleMetrics: readonly [
      LatencyMetricType,
      number | undefined,
    ][] = [
      ["NETWORK", sample.networkLatencyMs],
      ["PROCESSING", sample.processingLatencyMs],
      ["END_TO_END", sample.endToEndLatencyMs],
    ];

    for (const [metricType, value] of sampleMetrics) {
      if (value === undefined) {
        continue;
      }

      const sampleAlert =
        this.createLatencyThresholdAlert(
          scope,
          metricType,
          "SAMPLE_THRESHOLD_EXCEEDED",
          value,
        );

      if (sampleAlert !== undefined) {
        alerts.push(sampleAlert);
      }

      const series = getMetricSeries(
        scope,
        metricType,
      );

      if (
        series.samples.length <
        this.minimumSamplesForAggregateAlerts
      ) {
        continue;
      }

      const statistics =
        calculateStatistics(series.samples);

      if (statistics.meanMs !== undefined) {
        const alert =
          this.createLatencyThresholdAlert(
            scope,
            metricType,
            "AVERAGE_THRESHOLD_EXCEEDED",
            statistics.meanMs,
          );

        if (alert !== undefined) {
          alerts.push(alert);
        }
      }

      if (statistics.p95Ms !== undefined) {
        const alert =
          this.createLatencyThresholdAlert(
            scope,
            metricType,
            "P95_THRESHOLD_EXCEEDED",
            statistics.p95Ms,
          );

        if (alert !== undefined) {
          alerts.push(alert);
        }
      }

      if (statistics.p99Ms !== undefined) {
        const alert =
          this.createLatencyThresholdAlert(
            scope,
            metricType,
            "P99_THRESHOLD_EXCEEDED",
            statistics.p99Ms,
          );

        if (alert !== undefined) {
          alerts.push(alert);
        }
      }

      if (statistics.jitterMs !== undefined) {
        const alert =
          this.createJitterThresholdAlert(
            scope,
            metricType,
            statistics.jitterMs,
          );

        if (alert !== undefined) {
          alerts.push(alert);
        }
      }
    }

    return alerts;
  }

  private createLatencyThresholdAlert(
    scope: MutableLatencyScope,
    metricType: LatencyMetricType,
    type: LatencyAlertType,
    observedValueMs: number,
  ): LatencyAlert | undefined {
    let severity: LatencyAlertSeverity;
    let thresholdMs: number;

    if (
      observedValueMs >=
      this.thresholds.criticalLatencyMs
    ) {
      severity = "CRITICAL";
      thresholdMs =
        this.thresholds.criticalLatencyMs;
    } else if (
      observedValueMs >=
      this.thresholds.warningLatencyMs
    ) {
      severity = "WARNING";
      thresholdMs =
        this.thresholds.warningLatencyMs;
    } else {
      return undefined;
    }

    return this.publishAlert({
      type,
      severity,
      metricType,
      scope,
      observedValueMs,
      thresholdMs,
      message:
        `${metricType} latency ${observedValueMs.toFixed(3)} ms ` +
        `exceeded ${severity.toLowerCase()} threshold ` +
        `${thresholdMs.toFixed(3)} ms.`,
    });
  }

  private createJitterThresholdAlert(
    scope: MutableLatencyScope,
    metricType: LatencyMetricType,
    observedValueMs: number,
  ): LatencyAlert | undefined {
    let severity: LatencyAlertSeverity;
    let thresholdMs: number;

    if (
      observedValueMs >=
      this.thresholds.criticalJitterMs
    ) {
      severity = "CRITICAL";
      thresholdMs =
        this.thresholds.criticalJitterMs;
    } else if (
      observedValueMs >=
      this.thresholds.warningJitterMs
    ) {
      severity = "WARNING";
      thresholdMs =
        this.thresholds.warningJitterMs;
    } else {
      return undefined;
    }

    return this.publishAlert({
      type: "JITTER_THRESHOLD_EXCEEDED",
      severity,
      metricType,
      scope,
      observedValueMs,
      thresholdMs,
      message:
        `${metricType} jitter ${observedValueMs.toFixed(3)} ms ` +
        `exceeded ${severity.toLowerCase()} threshold ` +
        `${thresholdMs.toFixed(3)} ms.`,
    });
  }

  private publishAlert(input: {
    readonly type: LatencyAlertType;
    readonly severity: LatencyAlertSeverity;
    readonly metricType: LatencyMetricType;
    readonly scope: MutableLatencyScope;
    readonly observedValueMs: number;
    readonly thresholdMs: number;
    readonly message: string;
  }): LatencyAlert {
    const alert: LatencyAlert = Object.freeze({
      alertId: this.nextAlertId,
      type: input.type,
      severity: input.severity,
      metricType: input.metricType,
      scopeId: input.scope.scopeId,
      exchangeId: input.scope.exchangeId,
      connectionId: input.scope.connectionId,
      streamKey: input.scope.streamKey,
      occurredAt: this.now(),
      observedValueMs:
        input.observedValueMs,
      thresholdMs: input.thresholdMs,
      message: input.message,
    });

    this.nextAlertId += 1;
    this.totalAlerts += 1;

    this.recentAlerts.push(alert);

    if (
      this.recentAlerts.length >
      MAX_RECENT_ALERTS
    ) {
      this.recentAlerts.splice(
        0,
        this.recentAlerts.length -
          MAX_RECENT_ALERTS,
      );
    }

    const listeners = [...this.listeners];

    for (const listener of listeners) {
      try {
        listener(alert);
      } catch {
        // Alert listener failures must not interrupt latency tracking.
      }
    }

    return alert;
  }

  private getOrCreateExchangeScope(
    exchangeId: StreamingExchangeId,
    createdAt: number,
  ): MutableLatencyScope {
    const existing =
      this.exchangeScopes.get(exchangeId);

    if (existing !== undefined) {
      return existing;
    }

    const scope = createMutableScope({
      scopeId: `exchange:${exchangeId}`,
      exchangeId,
      createdAt,
    });

    this.exchangeScopes.set(exchangeId, scope);

    return scope;
  }

  private getOrCreateConnectionScope(
    input: NormalizedLatencySampleInput,
    createdAt: number,
  ): MutableLatencyScope {
    const existing =
      this.connectionScopes.get(
        input.connectionId,
      );

    if (existing !== undefined) {
      if (existing.exchangeId !== input.exchangeId) {
        throw new LatencyMonitorError(
          "CONNECTION_EXCHANGE_MISMATCH",
          `Connection "${input.connectionId}" is already associated with exchange "${existing.exchangeId}".`,
          {
            scopeId: existing.scopeId,
            eventId: input.eventId,
          },
        );
      }

      return existing;
    }

    const scope = createMutableScope({
      scopeId:
        `connection:${input.exchangeId}:${input.connectionId}`,
      exchangeId: input.exchangeId,
      connectionId: input.connectionId,
      createdAt,
    });

    this.connectionScopes.set(
      input.connectionId,
      scope,
    );

    return scope;
  }

  private getOrCreateStreamScope(
    input: NormalizedLatencySampleInput,
    createdAt: number,
  ): MutableLatencyScope {
    const existing =
      this.streamScopes.get(input.streamKey);

    if (existing !== undefined) {
      return existing;
    }

    const scope = createMutableScope({
      scopeId: `stream:${input.streamKey}`,
      exchangeId: input.exchangeId,
      connectionId: input.connectionId,
      streamKey: input.streamKey,
      channel: input.channel,
      symbol: input.symbol,
      eventType: input.eventType,
      createdAt,
    });

    this.streamScopes.set(
      input.streamKey,
      scope,
    );

    return scope;
  }

  private getAllScopes(): MutableLatencyScope[] {
    return [
      ...this.exchangeScopes.values(),
      ...this.connectionScopes.values(),
      ...this.streamScopes.values(),
    ];
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new LatencyMonitorError(
        "LATENCY_MONITOR_DISPOSED",
        "The latency monitor has been disposed.",
      );
    }
  }
}

interface NormalizedLatencySampleInput {
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly streamKey: SequenceStreamKey;
  readonly eventId?: string;
  readonly exchangeTimestamp?: number;
  readonly receivedAt: number;
  readonly processingStartedAt?: number;
  readonly processingCompletedAt?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

function normalizeSampleInput(
  input: LatencySampleInput,
): NormalizedLatencySampleInput {
  if (input === null || typeof input !== "object") {
    throw new LatencyMonitorError(
      "INVALID_LATENCY_SAMPLE",
      "Latency sample input must be an object.",
    );
  }

  const exchangeId =
    normalizeExchangeId(input.exchangeId);

  const connectionId =
    normalizeConnectionId(input.connectionId);

  const channel =
    normalizeChannel(input.channel);

  const symbol =
    input.symbol === undefined
      ? undefined
      : normalizeStreamingSymbol(input.symbol);

  validateTimestamp(
    input.receivedAt,
    "input.receivedAt",
  );

  if (input.exchangeTimestamp !== undefined) {
    validateTimestamp(
      input.exchangeTimestamp,
      "input.exchangeTimestamp",
    );
  }

  if (input.processingStartedAt !== undefined) {
    validateTimestamp(
      input.processingStartedAt,
      "input.processingStartedAt",
    );

    if (
      input.processingStartedAt <
      input.receivedAt
    ) {
      throw new LatencyMonitorError(
        "INVALID_PROCESSING_START",
        "processingStartedAt cannot be earlier than receivedAt.",
        {
          eventId: input.eventId,
        },
      );
    }
  }

  if (
    input.processingCompletedAt !== undefined
  ) {
    validateTimestamp(
      input.processingCompletedAt,
      "input.processingCompletedAt",
    );

    const start =
      input.processingStartedAt ??
      input.receivedAt;

    if (input.processingCompletedAt < start) {
      throw new LatencyMonitorError(
        "INVALID_PROCESSING_COMPLETION",
        "processingCompletedAt cannot be earlier than processing start.",
        {
          eventId: input.eventId,
        },
      );
    }
  }

  if (
    input.eventId !== undefined &&
    (typeof input.eventId !== "string" ||
      input.eventId.trim().length === 0)
  ) {
    throw new LatencyMonitorError(
      "INVALID_EVENT_ID",
      "eventId must be a non-empty string when provided.",
    );
  }

  validateOptionalRecord(
    input.metadata,
    "input.metadata",
  );

  const streamKey =
    input.streamKey === undefined
      ? createSequenceStreamKey({
          exchangeId,
          connectionId,
          channel,
          symbol,
          type: input.eventType,
        })
      : normalizeStreamKey(input.streamKey);

  return Object.freeze({
    exchangeId,
    connectionId,
    channel,
    symbol,
    eventType: input.eventType,
    streamKey,
    eventId: input.eventId?.trim(),
    exchangeTimestamp:
      input.exchangeTimestamp,
    receivedAt: input.receivedAt,
    processingStartedAt:
      input.processingStartedAt,
    processingCompletedAt:
      input.processingCompletedAt,
    metadata:
      input.metadata === undefined
        ? EMPTY_METADATA
        : Object.freeze({
            ...input.metadata,
          }),
  });
}

function createLatencySample(
  sampleId: number,
  input: NormalizedLatencySampleInput,
  recordedAt: number,
): LatencySample {
  const networkLatencyMs =
    input.exchangeTimestamp === undefined
      ? undefined
      : Math.max(
          0,
          input.receivedAt -
            input.exchangeTimestamp,
        );

  const processingStart =
    input.processingStartedAt ??
    input.receivedAt;

  const processingLatencyMs =
    input.processingCompletedAt === undefined
      ? undefined
      : Math.max(
          0,
          input.processingCompletedAt -
            processingStart,
        );

  const endToEndLatencyMs =
    input.exchangeTimestamp === undefined
      ? undefined
      : Math.max(
          0,
          (input.processingCompletedAt ??
            input.receivedAt) -
            input.exchangeTimestamp,
        );

  return Object.freeze({
    sampleId,
    exchangeId: input.exchangeId,
    connectionId: input.connectionId,
    channel: input.channel,
    symbol: input.symbol,
    eventType: input.eventType,
    streamKey: input.streamKey,
    eventId: input.eventId,
    recordedAt,
    exchangeTimestamp:
      input.exchangeTimestamp,
    receivedAt: input.receivedAt,
    processingStartedAt:
      input.processingStartedAt,
    processingCompletedAt:
      input.processingCompletedAt,
    networkLatencyMs,
    processingLatencyMs,
    endToEndLatencyMs,
    metadata: input.metadata,
  });
}

function createMutableScope(input: {
  readonly scopeId: string;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly streamKey?: SequenceStreamKey;
  readonly channel?: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType?: UnifiedStreamEventType;
  readonly createdAt: number;
}): MutableLatencyScope {
  return {
    ...input,
    sampleCount: 0,
    network: { samples: [] },
    processing: { samples: [] },
    endToEnd: { samples: [] },
  };
}

function createScopeSnapshot(
  scope: MutableLatencyScope,
  thresholds: LatencyThresholds,
): LatencyScopeSnapshot {
  return Object.freeze({
    scopeId: scope.scopeId,
    exchangeId: scope.exchangeId,
    connectionId: scope.connectionId,
    streamKey: scope.streamKey,
    channel: scope.channel,
    symbol: scope.symbol,
    eventType: scope.eventType,
    createdAt: scope.createdAt,
    lastSampleAt: scope.lastSampleAt,
    sampleCount: scope.sampleCount,
    network: createMetricSnapshot(
      "NETWORK",
      scope.network,
      thresholds,
    ),
    processing: createMetricSnapshot(
      "PROCESSING",
      scope.processing,
      thresholds,
    ),
    endToEnd: createMetricSnapshot(
      "END_TO_END",
      scope.endToEnd,
      thresholds,
    ),
  });
}

function createMetricSnapshot(
  metricType: LatencyMetricType,
  series: MutableMetricSeries,
  thresholds: LatencyThresholds,
): LatencyMetricSnapshot {
  const statistics =
    calculateStatistics(series.samples);

  return Object.freeze({
    metricType,
    healthStatus: deriveHealthStatus(
      statistics,
      thresholds,
    ),
    statistics,
  });
}

function calculateStatistics(
  samples: readonly {
    readonly value: number;
    readonly recordedAt: number;
  }[],
): LatencyStatistics {
  if (samples.length === 0) {
    return Object.freeze({
      sampleCount: 0,
    });
  }

  const values = samples
    .map((sample) => sample.value)
    .sort((left, right) => left - right);

  const total = values.reduce(
    (sum, value) => sum + value,
    0,
  );

  const mean = total / values.length;

  const variance =
    values.reduce(
      (sum, value) =>
        sum + Math.pow(value - mean, 2),
      0,
    ) / values.length;

  const differences: number[] = [];

  for (
    let index = 1;
    index < samples.length;
    index += 1
  ) {
    differences.push(
      Math.abs(
        samples[index].value -
          samples[index - 1].value,
      ),
    );
  }

  const jitter =
    differences.length === 0
      ? 0
      : differences.reduce(
          (sum, value) => sum + value,
          0,
        ) / differences.length;

  return Object.freeze({
    sampleCount: values.length,
    minimumMs: values[0],
    maximumMs: values[values.length - 1],
    meanMs: mean,
    medianMs: percentile(values, 50),
    p90Ms: percentile(values, 90),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
    variance,
    standardDeviationMs:
      Math.sqrt(variance),
    jitterMs: jitter,
    latestMs:
      samples[samples.length - 1].value,
  });
}

function percentile(
  sortedValues: readonly number[],
  percentileValue: number,
): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position =
    (percentileValue / 100) *
    (sortedValues.length - 1);

  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const fraction = position - lowerIndex;

  return (
    sortedValues[lowerIndex] +
    (sortedValues[upperIndex] -
      sortedValues[lowerIndex]) *
      fraction
  );
}

function deriveHealthStatus(
  statistics: LatencyStatistics,
  thresholds: LatencyThresholds,
): LatencyHealthStatus {
  if (
    statistics.sampleCount === 0 ||
    statistics.meanMs === undefined
  ) {
    return "UNKNOWN";
  }

  if (
    statistics.meanMs >=
      thresholds.criticalLatencyMs ||
    (statistics.jitterMs ?? 0) >=
      thresholds.criticalJitterMs
  ) {
    return "UNHEALTHY";
  }

  if (
    statistics.meanMs >=
      thresholds.warningLatencyMs ||
    (statistics.jitterMs ?? 0) >=
      thresholds.warningJitterMs
  ) {
    return "DEGRADED";
  }

  return "HEALTHY";
}

function addMetricSample(
  series: MutableMetricSeries,
  value: number,
  recordedAt: number,
  maximumSamples: number,
): void {
  series.samples.push({
    value,
    recordedAt,
  });

  if (series.samples.length > maximumSamples) {
    series.samples.splice(
      0,
      series.samples.length - maximumSamples,
    );
  }
}

function evictMetricSamples(
  series: MutableMetricSeries,
  minimumTimestamp: number,
): void {
  let removalCount = 0;

  while (
    removalCount < series.samples.length &&
    series.samples[removalCount]
      .recordedAt < minimumTimestamp
  ) {
    removalCount += 1;
  }

  if (removalCount > 0) {
    series.samples.splice(0, removalCount);
  }
}

function getMetricSeries(
  scope: MutableLatencyScope,
  metricType: LatencyMetricType,
): MutableMetricSeries {
  switch (metricType) {
    case "NETWORK":
      return scope.network;

    case "PROCESSING":
      return scope.processing;

    case "END_TO_END":
      return scope.endToEnd;

    default:
      return assertNever(metricType);
  }
}

function normalizeThresholds(
  thresholds:
    | Partial<LatencyThresholds>
    | undefined,
): LatencyThresholds {
  const warningLatencyMs =
    validateNonNegativeFiniteNumber(
      thresholds?.warningLatencyMs ??
        DEFAULT_THRESHOLDS.warningLatencyMs,
      "warningLatencyMs",
    );

  const criticalLatencyMs =
    validateNonNegativeFiniteNumber(
      thresholds?.criticalLatencyMs ??
        DEFAULT_THRESHOLDS.criticalLatencyMs,
      "criticalLatencyMs",
    );

  const warningJitterMs =
    validateNonNegativeFiniteNumber(
      thresholds?.warningJitterMs ??
        DEFAULT_THRESHOLDS.warningJitterMs,
      "warningJitterMs",
    );

  const criticalJitterMs =
    validateNonNegativeFiniteNumber(
      thresholds?.criticalJitterMs ??
        DEFAULT_THRESHOLDS.criticalJitterMs,
      "criticalJitterMs",
    );

  if (criticalLatencyMs < warningLatencyMs) {
    throw new LatencyMonitorError(
      "INVALID_LATENCY_THRESHOLDS",
      "criticalLatencyMs cannot be smaller than warningLatencyMs.",
    );
  }

  if (criticalJitterMs < warningJitterMs) {
    throw new LatencyMonitorError(
      "INVALID_JITTER_THRESHOLDS",
      "criticalJitterMs cannot be smaller than warningJitterMs.",
    );
  }

  return Object.freeze({
    warningLatencyMs,
    criticalLatencyMs,
    warningJitterMs,
    criticalJitterMs,
  });
}

function compareScopes(
  left: MutableLatencyScope,
  right: MutableLatencyScope,
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.scopeId.localeCompare(
    right.scopeId,
  );
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

function normalizeStreamKey(
  streamKey: SequenceStreamKey,
): SequenceStreamKey {
  if (
    typeof streamKey !== "string" ||
    streamKey.trim().length === 0
  ) {
    throw new LatencyMonitorError(
      "INVALID_STREAM_KEY",
      "streamKey must be a non-empty string.",
    );
  }

  return streamKey.trim();
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new LatencyMonitorError(
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
    throw new LatencyMonitorError(
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
    throw new LatencyMonitorError(
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
    throw new LatencyMonitorError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function validateClock(
  clock: LatencyMonitorClock,
): LatencyMonitorClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new LatencyMonitorError(
      "INVALID_CLOCK",
      "Latency monitor clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function assertNever(value: never): never {
  throw new LatencyMonitorError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}