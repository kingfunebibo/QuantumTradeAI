/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 9:
 * Sequence Validator
 *
 * This module validates ordered exchange stream sequences before events enter
 * downstream routing and stateful market-data processors.
 *
 * Responsibilities:
 * - Track sequence state per exchange stream
 * - Detect duplicates, stale events and sequence gaps
 * - Support strict and permissive validation policies
 * - Support explicit sequence resets
 * - Handle snapshot and incremental stream semantics
 * - Produce immutable validation results and diagnostics
 * - Maintain deterministic counters and event ordering
 * - Support deterministic tests through an injected clock
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

export type SequenceStreamKey = string;

export type SequenceValidationStatus =
  | "ACCEPTED"
  | "INITIALIZED"
  | "DUPLICATE"
  | "STALE"
  | "GAP"
  | "RESET"
  | "UNSEQUENCED"
  | "REJECTED";

export type SequenceValidationMode =
  | "STRICT"
  | "PERMISSIVE";

export type SequenceGapAction =
  | "REJECT"
  | "ACCEPT_AND_ADVANCE"
  | "ACCEPT_WITHOUT_ADVANCE";

export type SequenceDuplicateAction =
  | "REJECT"
  | "IGNORE";

export type SequenceStaleAction =
  | "REJECT"
  | "IGNORE";

export type SequenceResetReason =
  | "MANUAL"
  | "SNAPSHOT"
  | "RECONNECTION"
  | "STREAM_RESTART"
  | "EXCHANGE_RESET"
  | "UNKNOWN";

export interface SequenceValidatorClock {
  now(): number;
}

export interface SequenceValidatorPolicy {
  /**
   * STRICT mode rejects gaps, stale events and duplicates by default.
   * PERMISSIVE mode may accept gaps according to gapAction.
   */
  readonly mode: SequenceValidationMode;

  /**
   * Expected difference between consecutive sequence numbers.
   *
   * Defaults to 1.
   */
  readonly expectedIncrement: number;

  /**
   * Determines how sequence gaps are handled.
   */
  readonly gapAction: SequenceGapAction;

  /**
   * Determines how exact duplicate sequences are handled.
   */
  readonly duplicateAction: SequenceDuplicateAction;

  /**
   * Determines how sequences older than the current sequence are handled.
   */
  readonly staleAction: SequenceStaleAction;

  /**
   * When true, events without sequence numbers are accepted.
   */
  readonly allowUnsequencedEvents: boolean;

  /**
   * When true, ORDER_BOOK_SNAPSHOT events may reset sequence state.
   */
  readonly snapshotResetsSequence: boolean;

  /**
   * Maximum number of missing sequence values permitted before the stream is
   * considered invalid.
   *
   * Set to zero to allow any gap size subject to gapAction.
   */
  readonly maxAllowedGap: number;
}

export interface SequenceValidationRequest {
  readonly event: UnifiedStreamEvent;

  /**
   * Optional previous sequence supplied by an exchange payload.
   */
  readonly previousSequence?: number;

  /**
   * Optional explicit stream key override.
   */
  readonly streamKey?: SequenceStreamKey;

  /**
   * When true, the event is treated as a sequence reset boundary.
   */
  readonly reset?: boolean;

  readonly resetReason?: SequenceResetReason;
}

export interface SequenceValidationResult {
  readonly validationId: number;
  readonly status: SequenceValidationStatus;
  readonly accepted: boolean;
  readonly streamKey: SequenceStreamKey;
  readonly eventId: string;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly validatedAt: number;
  readonly sequence?: number;
  readonly expectedSequence?: number;
  readonly previousSequence?: number;
  readonly currentSequence?: number;
  readonly missingSequenceCount: number;
  readonly advancedState: boolean;
  readonly resetReason?: SequenceResetReason;
  readonly reason?: string;
}

export interface SequenceStreamSnapshot {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly initializedAt: number;
  readonly lastChangedAt: number;
  readonly currentSequence?: number;
  readonly lastAcceptedSequence?: number;
  readonly lastAcceptedEventId?: string;
  readonly lastAcceptedAt?: number;
  readonly lastRejectedSequence?: number;
  readonly lastRejectedEventId?: string;
  readonly lastRejectedAt?: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly duplicateCount: number;
  readonly staleCount: number;
  readonly gapCount: number;
  readonly resetCount: number;
  readonly unsequencedCount: number;
  readonly missingSequenceCount: number;
  readonly healthy: boolean;
  readonly lastFailureReason?: string;
}

export interface SequenceValidatorSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalStreams: number;
  readonly healthyStreams: number;
  readonly unhealthyStreams: number;
  readonly totalValidations: number;
  readonly acceptedEvents: number;
  readonly rejectedEvents: number;
  readonly duplicateEvents: number;
  readonly staleEvents: number;
  readonly gapEvents: number;
  readonly resetEvents: number;
  readonly unsequencedEvents: number;
  readonly streams: readonly SequenceStreamSnapshot[];
}

export interface SequenceResetRequest {
  readonly streamKey?: SequenceStreamKey;
  readonly exchangeId?: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly channel?: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType?: UnifiedStreamEventType;
  readonly sequence?: number;
  readonly reason: SequenceResetReason;
  readonly occurredAt?: number;
}

interface MutableSequenceStreamRecord {
  readonly streamKey: SequenceStreamKey;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly eventType: UnifiedStreamEventType;
  readonly initializedAt: number;

  lastChangedAt: number;
  currentSequence?: number;
  lastAcceptedSequence?: number;
  lastAcceptedEventId?: string;
  lastAcceptedAt?: number;
  lastRejectedSequence?: number;
  lastRejectedEventId?: string;
  lastRejectedAt?: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  staleCount: number;
  gapCount: number;
  resetCount: number;
  unsequencedCount: number;
  missingSequenceCount: number;
  healthy: boolean;
  lastFailureReason?: string;
}

const DEFAULT_POLICY: SequenceValidatorPolicy =
  Object.freeze({
    mode: "STRICT",
    expectedIncrement: 1,
    gapAction: "REJECT",
    duplicateAction: "IGNORE",
    staleAction: "REJECT",
    allowUnsequencedEvents: true,
    snapshotResetsSequence: true,
    maxAllowedGap: 0,
  });

const SYSTEM_CLOCK: SequenceValidatorClock = Object.freeze({
  now: (): number => Date.now(),
});

export class SequenceValidatorError extends Error {
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

    this.name = "SequenceValidatorError";
    this.code = code;
    this.streamKey = context?.streamKey;
    this.eventId = context?.eventId;
  }
}

/**
 * Deterministic sequence validator for normalized exchange streams.
 */
export class SequenceValidator {
  private readonly records =
    new Map<SequenceStreamKey, MutableSequenceStreamRecord>();

  private readonly policy: SequenceValidatorPolicy;
  private readonly clock: SequenceValidatorClock;

  private nextValidationId = 1;

  private totalValidations = 0;
  private acceptedEvents = 0;
  private rejectedEvents = 0;
  private duplicateEvents = 0;
  private staleEvents = 0;
  private gapEvents = 0;
  private resetEvents = 0;
  private unsequencedEvents = 0;
  private disposed = false;

  public constructor(
    policy: Partial<SequenceValidatorPolicy> = {},
    clock: SequenceValidatorClock = SYSTEM_CLOCK,
  ) {
    this.policy = normalizePolicy({
      ...DEFAULT_POLICY,
      ...policy,
    });

    this.clock = validateClock(clock);
  }

  /**
   * Validates one normalized stream event.
   */
  public validate(
    request: SequenceValidationRequest,
  ): SequenceValidationResult {
    this.assertActive();
    validateRequest(request);

    const event = request.event;
    const streamKey =
      request.streamKey === undefined
        ? createSequenceStreamKey(event)
        : normalizeStreamKey(request.streamKey);

    const validatedAt = this.now();
    const record = this.getOrCreateRecord(
      streamKey,
      event,
      validatedAt,
    );

    this.totalValidations += 1;

    const resetRequested =
      request.reset === true ||
      (this.policy.snapshotResetsSequence &&
        event.type === "ORDER_BOOK_SNAPSHOT");

    if (resetRequested) {
      return this.applyReset(
        record,
        event,
        request.resetReason ??
          (event.type === "ORDER_BOOK_SNAPSHOT"
            ? "SNAPSHOT"
            : "UNKNOWN"),
        validatedAt,
      );
    }

    if (event.sequence === undefined) {
      return this.handleUnsequenced(
        record,
        event,
        validatedAt,
      );
    }

    const sequence = validateSequence(
      event.sequence,
      "event.sequence",
    );

    if (record.currentSequence === undefined) {
      return this.initializeSequence(
        record,
        event,
        sequence,
        validatedAt,
      );
    }

    const currentSequence = record.currentSequence;
    const expectedSequence =
      currentSequence + this.policy.expectedIncrement;

    if (
      request.previousSequence !== undefined &&
      request.previousSequence !== currentSequence
    ) {
      return this.handleGap(
        record,
        event,
        sequence,
        expectedSequence,
        request.previousSequence,
        validatedAt,
        `Exchange previous sequence ${request.previousSequence} does not match current sequence ${currentSequence}.`,
      );
    }

    if (sequence === currentSequence) {
      return this.handleDuplicate(
        record,
        event,
        sequence,
        expectedSequence,
        validatedAt,
      );
    }

    if (sequence < currentSequence) {
      return this.handleStale(
        record,
        event,
        sequence,
        expectedSequence,
        validatedAt,
      );
    }

    if (sequence !== expectedSequence) {
      return this.handleGap(
        record,
        event,
        sequence,
        expectedSequence,
        request.previousSequence,
        validatedAt,
        `Expected sequence ${expectedSequence} but received ${sequence}.`,
      );
    }

    return this.acceptSequence(
      record,
      event,
      sequence,
      expectedSequence,
      validatedAt,
      "ACCEPTED",
    );
  }

  /**
   * Validates events sequentially in their supplied order.
   */
  public validateAll(
    requests: readonly SequenceValidationRequest[],
  ): readonly SequenceValidationResult[] {
    this.assertActive();

    if (!Array.isArray(requests)) {
      throw new SequenceValidatorError(
        "INVALID_VALIDATION_COLLECTION",
        "Sequence validation requests must be an array.",
      );
    }

    return Object.freeze(
      requests.map((request) => this.validate(request)),
    );
  }

  /**
   * Explicitly resets one stream or creates a new initialized stream.
   */
  public reset(
    request: SequenceResetRequest,
  ): SequenceStreamSnapshot {
    this.assertActive();
    validateResetRequest(request);

    const streamKey =
      request.streamKey === undefined
        ? createKeyFromResetRequest(request)
        : normalizeStreamKey(request.streamKey);

    const occurredAt = request.occurredAt ?? this.now();

    validateTimestamp(occurredAt, "request.occurredAt");

    let record = this.records.get(streamKey);

    if (record === undefined) {
      record = {
        streamKey,
        exchangeId: normalizeExchangeId(
          requireValue(
            request.exchangeId,
            "exchangeId is required when resetting an unknown stream.",
          ),
        ),
        connectionId: normalizeConnectionId(
          requireValue(
            request.connectionId,
            "connectionId is required when resetting an unknown stream.",
          ),
        ),
        channel: normalizeChannel(
          requireValue(
            request.channel,
            "channel is required when resetting an unknown stream.",
          ),
        ),
        symbol:
          request.symbol === undefined
            ? undefined
            : normalizeStreamingSymbol(request.symbol),
        eventType: requireValue(
          request.eventType,
          "eventType is required when resetting an unknown stream.",
        ),
        initializedAt: occurredAt,
        lastChangedAt: occurredAt,
        acceptedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        staleCount: 0,
        gapCount: 0,
        resetCount: 0,
        unsequencedCount: 0,
        missingSequenceCount: 0,
        healthy: true,
      };

      this.records.set(streamKey, record);
    }

    if (occurredAt < record.lastChangedAt) {
      throw new SequenceValidatorError(
        "NON_MONOTONIC_RESET_TIMESTAMP",
        `Reset timestamp ${occurredAt} is earlier than the previous change timestamp ${record.lastChangedAt}.`,
        {
          streamKey,
        },
      );
    }

    record.currentSequence =
      request.sequence === undefined
        ? undefined
        : validateSequence(
            request.sequence,
            "request.sequence",
          );

    record.lastAcceptedSequence =
      record.currentSequence;

    record.lastAcceptedEventId = undefined;
    record.lastAcceptedAt = occurredAt;
    record.lastRejectedSequence = undefined;
    record.lastRejectedEventId = undefined;
    record.lastRejectedAt = undefined;
    record.lastChangedAt = occurredAt;
    record.resetCount += 1;
    record.missingSequenceCount = 0;
    record.healthy = true;
    record.lastFailureReason = undefined;

    this.resetEvents += 1;

    return createStreamSnapshot(record);
  }

  public remove(
    streamKey: SequenceStreamKey,
  ): SequenceStreamSnapshot {
    this.assertActive();

    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const record = this.records.get(normalizedStreamKey);

    if (record === undefined) {
      throw new SequenceValidatorError(
        "SEQUENCE_STREAM_NOT_FOUND",
        `Sequence stream "${normalizedStreamKey}" was not found.`,
        {
          streamKey: normalizedStreamKey,
        },
      );
    }

    this.records.delete(normalizedStreamKey);

    return createStreamSnapshot(record);
  }

  public get(
    streamKey: SequenceStreamKey,
  ): SequenceStreamSnapshot | undefined {
    const normalizedStreamKey =
      normalizeStreamKey(streamKey);

    const record = this.records.get(normalizedStreamKey);

    return record === undefined
      ? undefined
      : createStreamSnapshot(record);
  }

  public getForExchange(
    exchangeId: StreamingExchangeId,
  ): readonly SequenceStreamSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.exchangeId === normalizedExchangeId,
        )
        .map((record) => createStreamSnapshot(record)),
    );
  }

  public getForConnection(
    connectionId: StreamingConnectionId,
  ): readonly SequenceStreamSnapshot[] {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    return Object.freeze(
      this.getOrderedRecords()
        .filter(
          (record) =>
            record.connectionId ===
            normalizedConnectionId,
        )
        .map((record) => createStreamSnapshot(record)),
    );
  }

  public getUnhealthyStreams():
    readonly SequenceStreamSnapshot[] {
    return Object.freeze(
      this.getOrderedRecords()
        .filter((record) => !record.healthy)
        .map((record) => createStreamSnapshot(record)),
    );
  }

  public getSnapshot(): SequenceValidatorSnapshot {
    const streams = this.getOrderedRecords().map(
      (record) => createStreamSnapshot(record),
    );

    let healthyStreams = 0;

    for (const stream of streams) {
      if (stream.healthy) {
        healthyStreams += 1;
      }
    }

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalStreams: streams.length,
      healthyStreams,
      unhealthyStreams: streams.length - healthyStreams,
      totalValidations: this.totalValidations,
      acceptedEvents: this.acceptedEvents,
      rejectedEvents: this.rejectedEvents,
      duplicateEvents: this.duplicateEvents,
      staleEvents: this.staleEvents,
      gapEvents: this.gapEvents,
      resetEvents: this.resetEvents,
      unsequencedEvents: this.unsequencedEvents,
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
    this.disposed = true;
  }

  private initializeSequence(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    sequence: number,
    validatedAt: number,
  ): SequenceValidationResult {
    record.currentSequence = sequence;
    record.lastAcceptedSequence = sequence;
    record.lastAcceptedEventId = event.eventId;
    record.lastAcceptedAt = validatedAt;
    record.lastChangedAt = validatedAt;
    record.acceptedCount += 1;
    record.healthy = true;
    record.lastFailureReason = undefined;

    this.acceptedEvents += 1;

    return this.createResult({
      status: "INITIALIZED",
      accepted: true,
      record,
      event,
      validatedAt,
      sequence,
      currentSequence: sequence,
      missingSequenceCount: 0,
      advancedState: true,
      reason: "Sequence state initialized.",
    });
  }

  private acceptSequence(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    sequence: number,
    expectedSequence: number,
    validatedAt: number,
    status: SequenceValidationStatus,
  ): SequenceValidationResult {
    record.currentSequence = sequence;
    record.lastAcceptedSequence = sequence;
    record.lastAcceptedEventId = event.eventId;
    record.lastAcceptedAt = validatedAt;
    record.lastChangedAt = validatedAt;
    record.acceptedCount += 1;
    record.healthy = true;
    record.lastFailureReason = undefined;

    this.acceptedEvents += 1;

    return this.createResult({
      status,
      accepted: true,
      record,
      event,
      validatedAt,
      sequence,
      expectedSequence,
      previousSequence:
        sequence - this.policy.expectedIncrement,
      currentSequence: sequence,
      missingSequenceCount: 0,
      advancedState: true,
    });
  }

  private handleUnsequenced(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    validatedAt: number,
  ): SequenceValidationResult {
    record.unsequencedCount += 1;
    record.lastChangedAt = validatedAt;

    this.unsequencedEvents += 1;

    if (!this.policy.allowUnsequencedEvents) {
      return this.reject(
        record,
        event,
        validatedAt,
        "UNSEQUENCED",
        undefined,
        undefined,
        0,
        "Event does not contain a sequence number.",
      );
    }

    record.acceptedCount += 1;
    record.lastAcceptedEventId = event.eventId;
    record.lastAcceptedAt = validatedAt;

    this.acceptedEvents += 1;

    return this.createResult({
      status: "UNSEQUENCED",
      accepted: true,
      record,
      event,
      validatedAt,
      currentSequence: record.currentSequence,
      missingSequenceCount: 0,
      advancedState: false,
      reason:
        "Event accepted without sequence validation.",
    });
  }

  private handleDuplicate(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    sequence: number,
    expectedSequence: number,
    validatedAt: number,
  ): SequenceValidationResult {
    record.duplicateCount += 1;
    record.lastChangedAt = validatedAt;

    this.duplicateEvents += 1;

    const accepted =
      this.policy.duplicateAction === "IGNORE";

    if (accepted) {
      record.acceptedCount += 1;
      record.lastAcceptedEventId = event.eventId;
      record.lastAcceptedAt = validatedAt;

      this.acceptedEvents += 1;

      return this.createResult({
        status: "DUPLICATE",
        accepted: true,
        record,
        event,
        validatedAt,
        sequence,
        expectedSequence,
        previousSequence: record.currentSequence,
        currentSequence: record.currentSequence,
        missingSequenceCount: 0,
        advancedState: false,
        reason: "Duplicate sequence ignored.",
      });
    }

    return this.reject(
      record,
      event,
      validatedAt,
      "DUPLICATE",
      sequence,
      expectedSequence,
      0,
      "Duplicate sequence rejected.",
    );
  }

  private handleStale(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    sequence: number,
    expectedSequence: number,
    validatedAt: number,
  ): SequenceValidationResult {
    record.staleCount += 1;
    record.lastChangedAt = validatedAt;

    this.staleEvents += 1;

    if (this.policy.staleAction === "IGNORE") {
      record.acceptedCount += 1;
      record.lastAcceptedEventId = event.eventId;
      record.lastAcceptedAt = validatedAt;

      this.acceptedEvents += 1;

      return this.createResult({
        status: "STALE",
        accepted: true,
        record,
        event,
        validatedAt,
        sequence,
        expectedSequence,
        previousSequence: record.currentSequence,
        currentSequence: record.currentSequence,
        missingSequenceCount: 0,
        advancedState: false,
        reason: "Stale sequence ignored.",
      });
    }

    return this.reject(
      record,
      event,
      validatedAt,
      "STALE",
      sequence,
      expectedSequence,
      0,
      `Sequence ${sequence} is older than current sequence ${record.currentSequence}.`,
    );
  }

  private handleGap(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    sequence: number,
    expectedSequence: number,
    previousSequence: number | undefined,
    validatedAt: number,
    reason: string,
  ): SequenceValidationResult {
    const missingSequenceCount = Math.max(
      0,
      sequence - expectedSequence,
    );

    record.gapCount += 1;
    record.missingSequenceCount += missingSequenceCount;
    record.lastChangedAt = validatedAt;
    record.healthy = false;
    record.lastFailureReason = reason;

    this.gapEvents += 1;

    const gapExceedsLimit =
      this.policy.maxAllowedGap > 0 &&
      missingSequenceCount >
        this.policy.maxAllowedGap;

    const mustReject =
      this.policy.mode === "STRICT" ||
      this.policy.gapAction === "REJECT" ||
      gapExceedsLimit;

    if (mustReject) {
      return this.reject(
        record,
        event,
        validatedAt,
        "GAP",
        sequence,
        expectedSequence,
        missingSequenceCount,
        gapExceedsLimit
          ? `Sequence gap of ${missingSequenceCount} exceeds maximum allowed gap of ${this.policy.maxAllowedGap}.`
          : reason,
        previousSequence,
      );
    }

    if (
      this.policy.gapAction ===
      "ACCEPT_AND_ADVANCE"
    ) {
      record.currentSequence = sequence;
      record.lastAcceptedSequence = sequence;
    }

    record.lastAcceptedEventId = event.eventId;
    record.lastAcceptedAt = validatedAt;
    record.acceptedCount += 1;

    this.acceptedEvents += 1;

    return this.createResult({
      status: "GAP",
      accepted: true,
      record,
      event,
      validatedAt,
      sequence,
      expectedSequence,
      previousSequence,
      currentSequence: record.currentSequence,
      missingSequenceCount,
      advancedState:
        this.policy.gapAction ===
        "ACCEPT_AND_ADVANCE",
      reason,
    });
  }

  private reject(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    validatedAt: number,
    status: SequenceValidationStatus,
    sequence: number | undefined,
    expectedSequence: number | undefined,
    missingSequenceCount: number,
    reason: string,
    previousSequence?: number,
  ): SequenceValidationResult {
    record.lastRejectedSequence = sequence;
    record.lastRejectedEventId = event.eventId;
    record.lastRejectedAt = validatedAt;
    record.lastChangedAt = validatedAt;
    record.rejectedCount += 1;
    record.healthy = false;
    record.lastFailureReason = reason;

    this.rejectedEvents += 1;

    return this.createResult({
      status,
      accepted: false,
      record,
      event,
      validatedAt,
      sequence,
      expectedSequence,
      previousSequence,
      currentSequence: record.currentSequence,
      missingSequenceCount,
      advancedState: false,
      reason,
    });
  }

  private applyReset(
    record: MutableSequenceStreamRecord,
    event: UnifiedStreamEvent,
    resetReason: SequenceResetReason,
    validatedAt: number,
  ): SequenceValidationResult {
    validateResetReason(resetReason);

    const sequence =
      event.sequence === undefined
        ? undefined
        : validateSequence(
            event.sequence,
            "event.sequence",
          );

    record.currentSequence = sequence;
    record.lastAcceptedSequence = sequence;
    record.lastAcceptedEventId = event.eventId;
    record.lastAcceptedAt = validatedAt;
    record.lastRejectedSequence = undefined;
    record.lastRejectedEventId = undefined;
    record.lastRejectedAt = undefined;
    record.lastChangedAt = validatedAt;
    record.acceptedCount += 1;
    record.resetCount += 1;
    record.missingSequenceCount = 0;
    record.healthy = true;
    record.lastFailureReason = undefined;

    this.acceptedEvents += 1;
    this.resetEvents += 1;

    return this.createResult({
      status: "RESET",
      accepted: true,
      record,
      event,
      validatedAt,
      sequence,
      currentSequence: sequence,
      missingSequenceCount: 0,
      advancedState: true,
      resetReason,
      reason: `Sequence state reset: ${resetReason}.`,
    });
  }

  private createResult(input: {
    readonly status: SequenceValidationStatus;
    readonly accepted: boolean;
    readonly record: MutableSequenceStreamRecord;
    readonly event: UnifiedStreamEvent;
    readonly validatedAt: number;
    readonly sequence?: number;
    readonly expectedSequence?: number;
    readonly previousSequence?: number;
    readonly currentSequence?: number;
    readonly missingSequenceCount: number;
    readonly advancedState: boolean;
    readonly resetReason?: SequenceResetReason;
    readonly reason?: string;
  }): SequenceValidationResult {
    const result: SequenceValidationResult =
      Object.freeze({
        validationId: this.nextValidationId,
        status: input.status,
        accepted: input.accepted,
        streamKey: input.record.streamKey,
        eventId: input.event.eventId,
        exchangeId: input.record.exchangeId,
        connectionId: input.record.connectionId,
        channel: input.record.channel,
        symbol: input.record.symbol,
        eventType: input.record.eventType,
        validatedAt: input.validatedAt,
        sequence: input.sequence,
        expectedSequence: input.expectedSequence,
        previousSequence: input.previousSequence,
        currentSequence: input.currentSequence,
        missingSequenceCount:
          input.missingSequenceCount,
        advancedState: input.advancedState,
        resetReason: input.resetReason,
        reason: input.reason,
      });

    this.nextValidationId += 1;

    return result;
  }

  private getOrCreateRecord(
    streamKey: SequenceStreamKey,
    event: UnifiedStreamEvent,
    timestamp: number,
  ): MutableSequenceStreamRecord {
    const existing = this.records.get(streamKey);

    if (existing !== undefined) {
      validateEventMatchesRecord(existing, event);
      return existing;
    }

    const record: MutableSequenceStreamRecord = {
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
      initializedAt: timestamp,
      lastChangedAt: timestamp,
      acceptedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      staleCount: 0,
      gapCount: 0,
      resetCount: 0,
      unsequencedCount: 0,
      missingSequenceCount: 0,
      healthy: true,
    };

    this.records.set(streamKey, record);

    return record;
  }

  private getOrderedRecords():
    MutableSequenceStreamRecord[] {
    return [...this.records.values()].sort(
      (left, right) => {
        if (left.initializedAt !== right.initializedAt) {
          return left.initializedAt - right.initializedAt;
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
      throw new SequenceValidatorError(
        "SEQUENCE_VALIDATOR_DISPOSED",
        "The sequence validator has been disposed.",
      );
    }
  }
}

export function createSequenceStreamKey(
  event: Pick<
    UnifiedStreamEvent,
    | "exchangeId"
    | "connectionId"
    | "channel"
    | "symbol"
    | "type"
  >,
): SequenceStreamKey {
  const exchangeId = normalizeExchangeId(
    event.exchangeId,
  );

  const connectionId = normalizeConnectionId(
    event.connectionId,
  );

  const channel = normalizeChannel(event.channel);

  const symbol =
    event.symbol === undefined
      ? "*"
      : normalizeStreamingSymbol(event.symbol);

  return [
    exchangeId,
    connectionId,
    channel,
    symbol,
    event.type,
  ].join(":");
}

function createStreamSnapshot(
  record: MutableSequenceStreamRecord,
): SequenceStreamSnapshot {
  return Object.freeze({
    streamKey: record.streamKey,
    exchangeId: record.exchangeId,
    connectionId: record.connectionId,
    channel: record.channel,
    symbol: record.symbol,
    eventType: record.eventType,
    initializedAt: record.initializedAt,
    lastChangedAt: record.lastChangedAt,
    currentSequence: record.currentSequence,
    lastAcceptedSequence:
      record.lastAcceptedSequence,
    lastAcceptedEventId:
      record.lastAcceptedEventId,
    lastAcceptedAt: record.lastAcceptedAt,
    lastRejectedSequence:
      record.lastRejectedSequence,
    lastRejectedEventId:
      record.lastRejectedEventId,
    lastRejectedAt: record.lastRejectedAt,
    acceptedCount: record.acceptedCount,
    rejectedCount: record.rejectedCount,
    duplicateCount: record.duplicateCount,
    staleCount: record.staleCount,
    gapCount: record.gapCount,
    resetCount: record.resetCount,
    unsequencedCount: record.unsequencedCount,
    missingSequenceCount:
      record.missingSequenceCount,
    healthy: record.healthy,
    lastFailureReason: record.lastFailureReason,
  });
}

function normalizePolicy(
  policy: Partial<SequenceValidatorPolicy>,
): SequenceValidatorPolicy {
  const mode = policy.mode ?? DEFAULT_POLICY.mode;

  if (mode !== "STRICT" && mode !== "PERMISSIVE") {
    throw new SequenceValidatorError(
      "INVALID_SEQUENCE_MODE",
      `Unsupported sequence validation mode "${String(
        mode,
      )}".`,
    );
  }

  const expectedIncrement =
    validatePositiveSafeInteger(
      policy.expectedIncrement ??
        DEFAULT_POLICY.expectedIncrement,
      "expectedIncrement",
    );

  const gapAction =
    policy.gapAction ?? DEFAULT_POLICY.gapAction;

  if (
    gapAction !== "REJECT" &&
    gapAction !== "ACCEPT_AND_ADVANCE" &&
    gapAction !== "ACCEPT_WITHOUT_ADVANCE"
  ) {
    throw new SequenceValidatorError(
      "INVALID_GAP_ACTION",
      `Unsupported sequence gap action "${String(
        gapAction,
      )}".`,
    );
  }

  const duplicateAction =
    policy.duplicateAction ??
    DEFAULT_POLICY.duplicateAction;

  if (
    duplicateAction !== "REJECT" &&
    duplicateAction !== "IGNORE"
  ) {
    throw new SequenceValidatorError(
      "INVALID_DUPLICATE_ACTION",
      `Unsupported duplicate action "${String(
        duplicateAction,
      )}".`,
    );
  }

  const staleAction =
    policy.staleAction ??
    DEFAULT_POLICY.staleAction;

  if (
    staleAction !== "REJECT" &&
    staleAction !== "IGNORE"
  ) {
    throw new SequenceValidatorError(
      "INVALID_STALE_ACTION",
      `Unsupported stale action "${String(
        staleAction,
      )}".`,
    );
  }

  const allowUnsequencedEvents =
    policy.allowUnsequencedEvents ??
    DEFAULT_POLICY.allowUnsequencedEvents;

  const snapshotResetsSequence =
    policy.snapshotResetsSequence ??
    DEFAULT_POLICY.snapshotResetsSequence;

  if (typeof allowUnsequencedEvents !== "boolean") {
    throw new SequenceValidatorError(
      "INVALID_ALLOW_UNSEQUENCED",
      "allowUnsequencedEvents must be boolean.",
    );
  }

  if (typeof snapshotResetsSequence !== "boolean") {
    throw new SequenceValidatorError(
      "INVALID_SNAPSHOT_RESET",
      "snapshotResetsSequence must be boolean.",
    );
  }

  const maxAllowedGap =
    validateNonNegativeSafeInteger(
      policy.maxAllowedGap ??
        DEFAULT_POLICY.maxAllowedGap,
      "maxAllowedGap",
    );

  return Object.freeze({
    mode,
    expectedIncrement,
    gapAction,
    duplicateAction,
    staleAction,
    allowUnsequencedEvents,
    snapshotResetsSequence,
    maxAllowedGap,
  });
}

function validateRequest(
  request: SequenceValidationRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new SequenceValidatorError(
      "INVALID_SEQUENCE_REQUEST",
      "Sequence validation request must be an object.",
    );
  }

  validateUnifiedStreamEvent(request.event);

  if (request.previousSequence !== undefined) {
    validateSequence(
      request.previousSequence,
      "request.previousSequence",
    );
  }

  if (request.streamKey !== undefined) {
    normalizeStreamKey(request.streamKey);
  }

  if (
    request.reset !== undefined &&
    typeof request.reset !== "boolean"
  ) {
    throw new SequenceValidatorError(
      "INVALID_RESET_FLAG",
      "request.reset must be boolean when provided.",
    );
  }

  if (request.resetReason !== undefined) {
    validateResetReason(request.resetReason);
  }
}

function validateResetRequest(
  request: SequenceResetRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new SequenceValidatorError(
      "INVALID_RESET_REQUEST",
      "Sequence reset request must be an object.",
    );
  }

  validateResetReason(request.reason);

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

  if (request.sequence !== undefined) {
    validateSequence(
      request.sequence,
      "request.sequence",
    );
  }

  if (request.occurredAt !== undefined) {
    validateTimestamp(
      request.occurredAt,
      "request.occurredAt",
    );
  }
}

function createKeyFromResetRequest(
  request: SequenceResetRequest,
): SequenceStreamKey {
  return [
    normalizeExchangeId(
      requireValue(
        request.exchangeId,
        "exchangeId is required to create a stream key.",
      ),
    ),
    normalizeConnectionId(
      requireValue(
        request.connectionId,
        "connectionId is required to create a stream key.",
      ),
    ),
    normalizeChannel(
      requireValue(
        request.channel,
        "channel is required to create a stream key.",
      ),
    ),
    request.symbol === undefined
      ? "*"
      : normalizeStreamingSymbol(request.symbol),
    requireValue(
      request.eventType,
      "eventType is required to create a stream key.",
    ),
  ].join(":");
}

function validateEventMatchesRecord(
  record: MutableSequenceStreamRecord,
  event: UnifiedStreamEvent,
): void {
  if (
    record.exchangeId !==
      normalizeExchangeId(event.exchangeId) ||
    record.connectionId !==
      normalizeConnectionId(event.connectionId) ||
    record.channel !== normalizeChannel(event.channel) ||
    record.eventType !== event.type ||
    record.symbol !==
      (event.symbol === undefined
        ? undefined
        : normalizeStreamingSymbol(event.symbol))
  ) {
    throw new SequenceValidatorError(
      "STREAM_KEY_EVENT_MISMATCH",
      `Event "${event.eventId}" does not match the stream identified by "${record.streamKey}".`,
      {
        streamKey: record.streamKey,
        eventId: event.eventId,
      },
    );
  }
}

function validateResetReason(
  reason: SequenceResetReason,
): void {
  if (
    reason !== "MANUAL" &&
    reason !== "SNAPSHOT" &&
    reason !== "RECONNECTION" &&
    reason !== "STREAM_RESTART" &&
    reason !== "EXCHANGE_RESET" &&
    reason !== "UNKNOWN"
  ) {
    throw new SequenceValidatorError(
      "INVALID_RESET_REASON",
      `Unsupported sequence reset reason "${String(
        reason,
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
    throw new SequenceValidatorError(
      "INVALID_STREAM_KEY",
      "Sequence stream key must be a non-empty string.",
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

function validateSequence(
  sequence: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0
  ) {
    throw new SequenceValidatorError(
      "INVALID_SEQUENCE",
      `${field} must be a non-negative safe integer.`,
    );
  }

  return sequence;
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new SequenceValidatorError(
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
    throw new SequenceValidatorError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateNonNegativeSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new SequenceValidatorError(
      "INVALID_NON_NEGATIVE_INTEGER",
      `${field} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function validateClock(
  clock: SequenceValidatorClock,
): SequenceValidatorClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new SequenceValidatorError(
      "INVALID_CLOCK",
      "Sequence validator clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function requireValue<T>(
  value: T | undefined,
  message: string,
): T {
  if (value === undefined) {
    throw new SequenceValidatorError(
      "MISSING_REQUIRED_VALUE",
      message,
    );
  }

  return value;
}