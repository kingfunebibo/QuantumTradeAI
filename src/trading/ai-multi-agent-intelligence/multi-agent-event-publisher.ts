/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-event-publisher.ts
 *
 * Deterministic, immutable, replay-safe event publication for the collaborative
 * multi-agent intelligence subsystem.
 */

import {
  type MultiAgentCorrelationId,
  type MultiAgentEvent,
  type MultiAgentEventPublisherPort,
  type MultiAgentJsonValue,
  type MultiAgentPublicationTopic,
  type MultiAgentRunId,
  type MultiAgentSequence,
  type MultiAgentSessionId,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentEventPublisherErrorCode =
  | "INVALID_EVENT"
  | "DUPLICATE_EVENT_ID"
  | "EVENT_ID_CONFLICT"
  | "STALE_EVENT_SEQUENCE"
  | "DUPLICATE_RUN_SEQUENCE"
  | "EVENT_CAPACITY_EXCEEDED"
  | "SUBSCRIBER_FAILED";

export interface MultiAgentEventPublisherErrorDetails {
  readonly eventId?: string;
  readonly runId?: MultiAgentRunId;
  readonly sessionId?: MultiAgentSessionId;
  readonly sequence?: MultiAgentSequence;
  readonly subscriberId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class MultiAgentEventPublisherError extends Error {
  public readonly code: MultiAgentEventPublisherErrorCode;
  public readonly details: MultiAgentEventPublisherErrorDetails;

  public constructor(
    code: MultiAgentEventPublisherErrorCode,
    message: string,
    details: MultiAgentEventPublisherErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentEventPublisherError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentEventSubscriber {
  readonly subscriberId: string;
  readonly topics?: readonly MultiAgentPublicationTopic[];
  readonly runIds?: readonly MultiAgentRunId[];
  readonly sessionIds?: readonly MultiAgentSessionId[];
  handle(event: MultiAgentEvent): void | Promise<void>;
}

export interface MultiAgentEventPublisherOptions {
  readonly maximumEvents?: number;
  readonly rejectDuplicateEventIds?: boolean;
  readonly rejectSequenceRegression?: boolean;
  readonly rejectDuplicateRunSequences?: boolean;
  readonly stopOnSubscriberFailure?: boolean;
}

export interface MultiAgentEventQuery {
  readonly topics?: readonly MultiAgentPublicationTopic[];
  readonly runId?: MultiAgentRunId;
  readonly sessionId?: MultiAgentSessionId;
  readonly correlationId?: MultiAgentCorrelationId;
  readonly occurredAtOrAfterMs?: MultiAgentTimestamp;
  readonly occurredAtOrBeforeMs?: MultiAgentTimestamp;
  readonly sequenceAtOrAfter?: MultiAgentSequence;
  readonly sequenceAtOrBefore?: MultiAgentSequence;
  readonly limit?: number;
}

export interface MultiAgentEventPublicationResult {
  readonly event: MultiAgentEvent;
  readonly deliveredSubscriberIds: readonly string[];
  readonly skippedSubscriberIds: readonly string[];
  readonly failedSubscriberIds: readonly string[];
  readonly duplicate: boolean;
  readonly totalPublishedEvents: number;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentEventReplayResult {
  readonly replayedEventIds: readonly string[];
  readonly deliveredSubscriberIds: readonly string[];
  readonly failedSubscriberIds: readonly string[];
  readonly replayedEventCount: number;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentEventPublisherSnapshot {
  readonly eventCount: number;
  readonly subscriberCount: number;
  readonly topicCounts: Readonly<Record<MultiAgentPublicationTopic, number>>;
  readonly runEventCounts: Readonly<Record<string, number>>;
  readonly latestSequenceByRun: Readonly<Record<string, MultiAgentSequence>>;
  readonly oldestOccurredAtMs?: MultiAgentTimestamp;
  readonly newestOccurredAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly maximumEvents: number;
  readonly rejectDuplicateEventIds: boolean;
  readonly rejectSequenceRegression: boolean;
  readonly rejectDuplicateRunSequences: boolean;
  readonly stopOnSubscriberFailure: boolean;
}

const PUBLICATION_TOPICS: readonly MultiAgentPublicationTopic[] = Object.freeze([
  "RUN_STARTED",
  "AGENTS_SELECTED",
  "OBSERVATIONS_COMPLETED",
  "PROPOSALS_GENERATED",
  "DEBATE_COMPLETED",
  "CONFLICT_DETECTED",
  "CONSENSUS_FORMED",
  "GOVERNANCE_EVALUATED",
  "DECISION_COMPLETED",
  "EXECUTION_HANDOFF",
  "OPERATOR_ESCALATION",
  "RUN_FAILED",
]);

const TOPIC_SET = new Set<MultiAgentPublicationTopic>(PUBLICATION_TOPICS);

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  maximumEvents: 100_000,
  rejectDuplicateEventIds: true,
  rejectSequenceRegression: true,
  rejectDuplicateRunSequences: true,
  stopOnSubscriberFailure: true,
});

export class MultiAgentEventPublisher
  implements MultiAgentEventPublisherPort
{
  private readonly options: NormalizedOptions;
  private eventsById: Map<string, MultiAgentEvent>;
  private eventIdByRunSequence: Map<string, string>;
  private latestSequenceByRun: Map<MultiAgentRunId, MultiAgentSequence>;
  private subscribersById: Map<string, MultiAgentEventSubscriber>;
  private publicationTail: Promise<void>;

  public constructor(options: MultiAgentEventPublisherOptions = {}) {
    this.options = normalizeOptions(options);
    this.eventsById = new Map();
    this.eventIdByRunSequence = new Map();
    this.latestSequenceByRun = new Map();
    this.subscribersById = new Map();
    this.publicationTail = Promise.resolve();
  }

  public publish(event: MultiAgentEvent): Promise<void> {
    return this.publishWithResult(event).then(() => undefined);
  }

  public publishWithResult(
    event: MultiAgentEvent,
  ): Promise<MultiAgentEventPublicationResult> {
    const operation = this.publicationTail.then(() =>
      this.publishImmediately(event),
    );

    this.publicationTail = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  }

  public subscribe(subscriber: MultiAgentEventSubscriber): () => void {
    const normalized = normalizeSubscriber(subscriber);

    if (this.subscribersById.has(normalized.subscriberId)) {
      throw new MultiAgentEventPublisherError(
        "INVALID_EVENT",
        `Subscriber "${normalized.subscriberId}" is already registered.`,
        { subscriberId: normalized.subscriberId },
      );
    }

    const next = new Map(this.subscribersById);
    next.set(normalized.subscriberId, normalized);
    this.subscribersById = sortMap(next);

    return () => {
      this.unsubscribe(normalized.subscriberId);
    };
  }

  public unsubscribe(subscriberId: string): boolean {
    assertNonEmptyString(subscriberId, "subscriberId");

    if (!this.subscribersById.has(subscriberId)) {
      return false;
    }

    const next = new Map(this.subscribersById);
    const deleted = next.delete(subscriberId);
    this.subscribersById = sortMap(next);
    return deleted;
  }

  public hasSubscriber(subscriberId: string): boolean {
    assertNonEmptyString(subscriberId, "subscriberId");
    return this.subscribersById.has(subscriberId);
  }

  public getSubscriberIds(): readonly string[] {
    return Object.freeze([...this.subscribersById.keys()].sort(compareText));
  }

  public getEvent(eventId: string): MultiAgentEvent | undefined {
    assertNonEmptyString(eventId, "eventId");
    const event = this.eventsById.get(eventId);
    return event === undefined ? undefined : cloneEvent(event);
  }

  public query(
    query: MultiAgentEventQuery = {},
  ): readonly MultiAgentEvent[] {
    validateQuery(query);

    const topics =
      query.topics === undefined
        ? undefined
        : new Set<MultiAgentPublicationTopic>(query.topics);

    let events = this.sortedEvents().filter((event) => {
      if (topics !== undefined && !topics.has(event.topic)) {
        return false;
      }

      if (query.runId !== undefined && event.runId !== query.runId) {
        return false;
      }

      if (
        query.sessionId !== undefined &&
        event.sessionId !== query.sessionId
      ) {
        return false;
      }

      if (
        query.correlationId !== undefined &&
        event.correlationId !== query.correlationId
      ) {
        return false;
      }

      if (
        query.occurredAtOrAfterMs !== undefined &&
        event.occurredAtMs < query.occurredAtOrAfterMs
      ) {
        return false;
      }

      if (
        query.occurredAtOrBeforeMs !== undefined &&
        event.occurredAtMs > query.occurredAtOrBeforeMs
      ) {
        return false;
      }

      if (
        query.sequenceAtOrAfter !== undefined &&
        event.sequence < query.sequenceAtOrAfter
      ) {
        return false;
      }

      if (
        query.sequenceAtOrBefore !== undefined &&
        event.sequence > query.sequenceAtOrBefore
      ) {
        return false;
      }

      return true;
    });

    if (query.limit !== undefined) {
      events = events.slice(0, query.limit);
    }

    return Object.freeze(events.map(cloneEvent));
  }

  public async replay(
    query: MultiAgentEventQuery = {},
    subscriberIds?: readonly string[],
  ): Promise<MultiAgentEventReplayResult> {
    validateQuery(query);

    const selectedIds =
      subscriberIds === undefined
        ? this.getSubscriberIds()
        : uniqueSorted(subscriberIds);

    for (const [index, subscriberId] of selectedIds.entries()) {
      assertNonEmptyString(subscriberId, `subscriberIds[${index}]`);
    }

    const replayedEventIds: string[] = [];
    const deliveredSubscriberIds = new Set<string>();
    const failedSubscriberIds = new Set<string>();

    for (const event of this.query(query)) {
      replayedEventIds.push(event.eventId);

      for (const subscriberId of selectedIds) {
        const subscriber = this.subscribersById.get(subscriberId);

        if (
          subscriber === undefined ||
          !matchesSubscriber(subscriber, event)
        ) {
          continue;
        }

        try {
          await subscriber.handle(cloneEvent(event));
          deliveredSubscriberIds.add(subscriberId);
        } catch (cause) {
          failedSubscriberIds.add(subscriberId);

          if (this.options.stopOnSubscriberFailure) {
            throw new MultiAgentEventPublisherError(
              "SUBSCRIBER_FAILED",
              `Subscriber "${subscriberId}" failed during event replay.`,
              {
                eventId: event.eventId,
                runId: event.runId,
                sessionId: event.sessionId,
                sequence: event.sequence,
                subscriberId,
                cause,
              },
            );
          }
        }
      }
    }

    const result: MultiAgentEventReplayResult = {
      replayedEventIds: Object.freeze(replayedEventIds),
      deliveredSubscriberIds: Object.freeze(
        [...deliveredSubscriberIds].sort(compareText),
      ),
      failedSubscriberIds: Object.freeze(
        [...failedSubscriberIds].sort(compareText),
      ),
      replayedEventCount: replayedEventIds.length,
      deterministicFingerprint: stableFingerprint({
        operation: "REPLAY",
        query: cloneJson(query as unknown as MultiAgentJsonValue),
        selectedSubscriberIds: selectedIds,
        replayedEventIds,
        deliveredSubscriberIds: [...deliveredSubscriberIds].sort(compareText),
        failedSubscriberIds: [...failedSubscriberIds].sort(compareText),
      }),
    };

    return deepFreeze(result);
  }

  public clear(): void {
    this.eventsById = new Map();
    this.eventIdByRunSequence = new Map();
    this.latestSequenceByRun = new Map();
  }

  public snapshot(): MultiAgentEventPublisherSnapshot {
    const topicCounts = createTopicCounts();
    const runEventCounts: Record<string, number> = {};
    const events = this.sortedEvents();

    for (const event of events) {
      topicCounts[event.topic] += 1;
      runEventCounts[event.runId] =
        (runEventCounts[event.runId] ?? 0) + 1;
    }

    const latestSequenceByRun: Record<string, MultiAgentSequence> = {};

    for (const [runId, sequence] of [...this.latestSequenceByRun.entries()].sort(
      ([left], [right]) => compareText(left, right),
    )) {
      latestSequenceByRun[runId] = sequence;
    }

    const snapshot: MultiAgentEventPublisherSnapshot = {
      eventCount: events.length,
      subscriberCount: this.subscribersById.size,
      topicCounts: deepFreeze(topicCounts),
      runEventCounts: deepFreeze(sortRecord(runEventCounts)),
      latestSequenceByRun: deepFreeze(latestSequenceByRun),
      oldestOccurredAtMs:
        events.length === 0
          ? undefined
          : events.reduce(
              (oldest, event) =>
                event.occurredAtMs < oldest
                  ? event.occurredAtMs
                  : oldest,
              events[0]!.occurredAtMs,
            ),
      newestOccurredAtMs:
        events.length === 0
          ? undefined
          : events.reduce(
              (newest, event) =>
                event.occurredAtMs > newest
                  ? event.occurredAtMs
                  : newest,
              events[0]!.occurredAtMs,
            ),
      deterministicFingerprint: stableFingerprint(
        toJsonValue({
          events,
          subscriberIds: this.getSubscriberIds(),
          topicCounts,
          runEventCounts: sortRecord(runEventCounts),
          latestSequenceByRun,
        }),
      ),
    };

    return deepFreeze(snapshot);
  }

  private async publishImmediately(
    event: MultiAgentEvent,
  ): Promise<MultiAgentEventPublicationResult> {
    const normalized = normalizeEvent(event);
    const existing = this.eventsById.get(normalized.eventId);

    if (existing !== undefined) {
      if (eventsEquivalent(existing, normalized)) {
        if (this.options.rejectDuplicateEventIds) {
          throw new MultiAgentEventPublisherError(
            "DUPLICATE_EVENT_ID",
            `Event "${normalized.eventId}" has already been published.`,
            eventDetails(normalized),
          );
        }

        return this.createPublicationResult(
          normalized,
          [],
          this.getSubscriberIds(),
          [],
          true,
        );
      }

      throw new MultiAgentEventPublisherError(
        "EVENT_ID_CONFLICT",
        `Event "${normalized.eventId}" conflicts with an existing event.`,
        eventDetails(normalized),
      );
    }

    const runSequenceKey = createRunSequenceKey(
      normalized.runId,
      normalized.sequence,
    );
    const existingSequenceEventId =
      this.eventIdByRunSequence.get(runSequenceKey);

    if (
      existingSequenceEventId !== undefined &&
      this.options.rejectDuplicateRunSequences
    ) {
      throw new MultiAgentEventPublisherError(
        "DUPLICATE_RUN_SEQUENCE",
        `Run "${normalized.runId}" already contains sequence ${normalized.sequence}.`,
        eventDetails(normalized),
      );
    }

    const latestSequence = this.latestSequenceByRun.get(normalized.runId);

    if (
      latestSequence !== undefined &&
      normalized.sequence < latestSequence &&
      this.options.rejectSequenceRegression
    ) {
      throw new MultiAgentEventPublisherError(
        "STALE_EVENT_SEQUENCE",
        `Event sequence ${normalized.sequence} is earlier than the latest sequence ${latestSequence} for run "${normalized.runId}".`,
        eventDetails(normalized),
      );
    }

    if (this.eventsById.size >= this.options.maximumEvents) {
      throw new MultiAgentEventPublisherError(
        "EVENT_CAPACITY_EXCEEDED",
        `Event publisher capacity of ${this.options.maximumEvents} events has been reached.`,
        eventDetails(normalized),
      );
    }

    const deliveredSubscriberIds: string[] = [];
    const skippedSubscriberIds: string[] = [];
    const failedSubscriberIds: string[] = [];

    for (const [subscriberId, subscriber] of this.subscribersById) {
      if (!matchesSubscriber(subscriber, normalized)) {
        skippedSubscriberIds.push(subscriberId);
        continue;
      }

      try {
        await subscriber.handle(cloneEvent(normalized));
        deliveredSubscriberIds.push(subscriberId);
      } catch (cause) {
        failedSubscriberIds.push(subscriberId);

        if (this.options.stopOnSubscriberFailure) {
          throw new MultiAgentEventPublisherError(
            "SUBSCRIBER_FAILED",
            `Subscriber "${subscriberId}" failed while handling event "${normalized.eventId}".`,
            {
              ...eventDetails(normalized),
              subscriberId,
              cause,
            },
          );
        }
      }
    }

    const nextEvents = new Map(this.eventsById);
    nextEvents.set(normalized.eventId, normalized);
    this.eventsById = sortMap(nextEvents);

    const nextRunSequences = new Map(this.eventIdByRunSequence);
    nextRunSequences.set(runSequenceKey, normalized.eventId);
    this.eventIdByRunSequence = sortMap(nextRunSequences);

    const nextLatest = new Map(this.latestSequenceByRun);
    nextLatest.set(
      normalized.runId,
      latestSequence === undefined
        ? normalized.sequence
        : Math.max(latestSequence, normalized.sequence),
    );
    this.latestSequenceByRun = sortMap(nextLatest);

    return this.createPublicationResult(
      normalized,
      deliveredSubscriberIds,
      skippedSubscriberIds,
      failedSubscriberIds,
      false,
    );
  }

  private createPublicationResult(
    event: MultiAgentEvent,
    deliveredSubscriberIds: readonly string[],
    skippedSubscriberIds: readonly string[],
    failedSubscriberIds: readonly string[],
    duplicate: boolean,
  ): MultiAgentEventPublicationResult {
    const result: MultiAgentEventPublicationResult = {
      event: cloneEvent(event),
      deliveredSubscriberIds: Object.freeze(
        uniqueSorted(deliveredSubscriberIds),
      ),
      skippedSubscriberIds: Object.freeze(
        uniqueSorted(skippedSubscriberIds),
      ),
      failedSubscriberIds: Object.freeze(
        uniqueSorted(failedSubscriberIds),
      ),
      duplicate,
      totalPublishedEvents: this.eventsById.size,
      deterministicFingerprint: stableFingerprint(
        toJsonValue({
          operation: "PUBLISH",
          event,
          deliveredSubscriberIds: uniqueSorted(deliveredSubscriberIds),
          skippedSubscriberIds: uniqueSorted(skippedSubscriberIds),
          failedSubscriberIds: uniqueSorted(failedSubscriberIds),
          duplicate,
        }),
      ),
    };

    return deepFreeze(result);
  }

  private sortedEvents(): readonly MultiAgentEvent[] {
    return [...this.eventsById.values()].sort(compareEvents);
  }
}

export function createMultiAgentEventPublisher(
  options: MultiAgentEventPublisherOptions = {},
): MultiAgentEventPublisher {
  return new MultiAgentEventPublisher(options);
}

function normalizeOptions(
  options: MultiAgentEventPublisherOptions,
): NormalizedOptions {
  const maximumEvents = options.maximumEvents ?? DEFAULT_OPTIONS.maximumEvents;
  assertPositiveInteger(maximumEvents, "maximumEvents");

  const normalized: NormalizedOptions = {
    maximumEvents,
    rejectDuplicateEventIds:
      options.rejectDuplicateEventIds ??
      DEFAULT_OPTIONS.rejectDuplicateEventIds,
    rejectSequenceRegression:
      options.rejectSequenceRegression ??
      DEFAULT_OPTIONS.rejectSequenceRegression,
    rejectDuplicateRunSequences:
      options.rejectDuplicateRunSequences ??
      DEFAULT_OPTIONS.rejectDuplicateRunSequences,
    stopOnSubscriberFailure:
      options.stopOnSubscriberFailure ??
      DEFAULT_OPTIONS.stopOnSubscriberFailure,
  };

  return Object.freeze(normalized);
}

function normalizeSubscriber(
  subscriber: MultiAgentEventSubscriber,
): MultiAgentEventSubscriber {
  assertNonEmptyString(subscriber.subscriberId, "subscriberId");

  if (typeof subscriber.handle !== "function") {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      "Subscriber handle must be a function.",
      { subscriberId: subscriber.subscriberId, field: "handle" },
    );
  }

  const topics =
    subscriber.topics === undefined
      ? undefined
      : Object.freeze(uniqueSorted(subscriber.topics));

  if (topics !== undefined) {
    for (const [index, topic] of topics.entries()) {
      if (!TOPIC_SET.has(topic)) {
        throw new MultiAgentEventPublisherError(
          "INVALID_EVENT",
          `Subscriber topic at index ${index} is not supported.`,
          {
            subscriberId: subscriber.subscriberId,
            field: `topics[${index}]`,
          },
        );
      }
    }
  }

  const runIds =
    subscriber.runIds === undefined
      ? undefined
      : Object.freeze(uniqueSorted(subscriber.runIds));

  const sessionIds =
    subscriber.sessionIds === undefined
      ? undefined
      : Object.freeze(uniqueSorted(subscriber.sessionIds));

  return Object.freeze({
    subscriberId: subscriber.subscriberId,
    topics,
    runIds,
    sessionIds,
    handle: subscriber.handle.bind(subscriber),
  });
}

function normalizeEvent(event: MultiAgentEvent): MultiAgentEvent {
  validateEvent(event);

  return deepFreeze({
    eventId: event.eventId,
    topic: event.topic,
    runId: event.runId,
    sessionId: event.sessionId,
    occurredAtMs: event.occurredAtMs,
    sequence: event.sequence,
    payload: cloneJson(event.payload),
    correlationId: event.correlationId,
    causationId: event.causationId,
    deterministicFingerprint: event.deterministicFingerprint,
  });
}

function validateEvent(event: MultiAgentEvent): void {
  assertNonEmptyString(event.eventId, "event.eventId");

  if (!TOPIC_SET.has(event.topic)) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      `Event topic "${String(event.topic)}" is not supported.`,
      { eventId: event.eventId, field: "topic" },
    );
  }

  assertNonEmptyString(event.runId, "event.runId");
  assertNonEmptyString(event.sessionId, "event.sessionId");
  assertNonNegativeInteger(event.occurredAtMs, "event.occurredAtMs");
  assertNonNegativeInteger(event.sequence, "event.sequence");
  assertJsonValue(event.payload, "event.payload");
  assertNonEmptyString(event.correlationId, "event.correlationId");

  if (event.causationId !== undefined) {
    assertNonEmptyString(event.causationId, "event.causationId");
  }

  assertNonEmptyString(
    event.deterministicFingerprint,
    "event.deterministicFingerprint",
  );
}

function validateQuery(query: MultiAgentEventQuery): void {
  if (query.topics !== undefined) {
    for (const [index, topic] of query.topics.entries()) {
      if (!TOPIC_SET.has(topic)) {
        throw new MultiAgentEventPublisherError(
          "INVALID_EVENT",
          `Query topic at index ${index} is not supported.`,
          { field: `query.topics[${index}]` },
        );
      }
    }
  }

  if (query.runId !== undefined) {
    assertNonEmptyString(query.runId, "query.runId");
  }

  if (query.sessionId !== undefined) {
    assertNonEmptyString(query.sessionId, "query.sessionId");
  }

  if (query.correlationId !== undefined) {
    assertNonEmptyString(query.correlationId, "query.correlationId");
  }

  if (query.occurredAtOrAfterMs !== undefined) {
    assertNonNegativeInteger(
      query.occurredAtOrAfterMs,
      "query.occurredAtOrAfterMs",
    );
  }

  if (query.occurredAtOrBeforeMs !== undefined) {
    assertNonNegativeInteger(
      query.occurredAtOrBeforeMs,
      "query.occurredAtOrBeforeMs",
    );
  }

  if (
    query.occurredAtOrAfterMs !== undefined &&
    query.occurredAtOrBeforeMs !== undefined &&
    query.occurredAtOrAfterMs > query.occurredAtOrBeforeMs
  ) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      "occurredAtOrAfterMs cannot exceed occurredAtOrBeforeMs.",
      { field: "query.occurredAtRange" },
    );
  }

  if (query.sequenceAtOrAfter !== undefined) {
    assertNonNegativeInteger(
      query.sequenceAtOrAfter,
      "query.sequenceAtOrAfter",
    );
  }

  if (query.sequenceAtOrBefore !== undefined) {
    assertNonNegativeInteger(
      query.sequenceAtOrBefore,
      "query.sequenceAtOrBefore",
    );
  }

  if (
    query.sequenceAtOrAfter !== undefined &&
    query.sequenceAtOrBefore !== undefined &&
    query.sequenceAtOrAfter > query.sequenceAtOrBefore
  ) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      "sequenceAtOrAfter cannot exceed sequenceAtOrBefore.",
      { field: "query.sequenceRange" },
    );
  }

  if (query.limit !== undefined) {
    assertPositiveInteger(query.limit, "query.limit");
  }
}

function matchesSubscriber(
  subscriber: MultiAgentEventSubscriber,
  event: MultiAgentEvent,
): boolean {
  if (
    subscriber.topics !== undefined &&
    !subscriber.topics.includes(event.topic)
  ) {
    return false;
  }

  if (
    subscriber.runIds !== undefined &&
    !subscriber.runIds.includes(event.runId)
  ) {
    return false;
  }

  if (
    subscriber.sessionIds !== undefined &&
    !subscriber.sessionIds.includes(event.sessionId)
  ) {
    return false;
  }

  return true;
}

function cloneEvent(event: MultiAgentEvent): MultiAgentEvent {
  return deepFreeze({
    eventId: event.eventId,
    topic: event.topic,
    runId: event.runId,
    sessionId: event.sessionId,
    occurredAtMs: event.occurredAtMs,
    sequence: event.sequence,
    payload: cloneJson(event.payload),
    correlationId: event.correlationId,
    causationId: event.causationId,
    deterministicFingerprint: event.deterministicFingerprint,
  });
}

function eventsEquivalent(
  left: MultiAgentEvent,
  right: MultiAgentEvent,
): boolean {
  return canonicalJson(left as unknown as MultiAgentJsonValue) ===
    canonicalJson(right as unknown as MultiAgentJsonValue);
}

function compareEvents(
  left: MultiAgentEvent,
  right: MultiAgentEvent,
): number {
  return (
    compareText(left.runId, right.runId) ||
    left.sequence - right.sequence ||
    left.occurredAtMs - right.occurredAtMs ||
    compareText(left.eventId, right.eventId)
  );
}

function eventDetails(
  event: MultiAgentEvent,
): MultiAgentEventPublisherErrorDetails {
  return {
    eventId: event.eventId,
    runId: event.runId,
    sessionId: event.sessionId,
    sequence: event.sequence,
  };
}

function createRunSequenceKey(
  runId: MultiAgentRunId,
  sequence: MultiAgentSequence,
): string {
  return `${runId}\u0000${sequence}`;
}

function createTopicCounts(): Record<MultiAgentPublicationTopic, number> {
  return {
    RUN_STARTED: 0,
    AGENTS_SELECTED: 0,
    OBSERVATIONS_COMPLETED: 0,
    PROPOSALS_GENERATED: 0,
    DEBATE_COMPLETED: 0,
    CONFLICT_DETECTED: 0,
    CONSENSUS_FORMED: 0,
    GOVERNANCE_EVALUATED: 0,
    DECISION_COMPLETED: 0,
    EXECUTION_HANDOFF: 0,
    OPERATOR_ESCALATION: 0,
    RUN_FAILED: 0,
  };
}

function sortRecord(
  value: Readonly<Record<string, number>>,
): Record<string, number> {
  const sorted: Record<string, number> = {};

  for (const key of Object.keys(value).sort(compareText)) {
    const item = value[key];

    if (item !== undefined) {
      sorted[key] = item;
    }
  }

  return sorted;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareText);
}

function sortMap<K extends string, V>(
  value: ReadonlyMap<K, V>,
): Map<K, V> {
  return new Map(
    [...value.entries()].sort(([left], [right]) =>
      compareText(left, right),
    ),
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      `${field} must be a positive safe integer.`,
      { field },
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      `${field} must be a non-negative safe integer.`,
      { field },
    );
  }
}

function assertJsonValue(
  value: unknown,
  field: string,
  seen: Set<object> = new Set(),
): asserts value is MultiAgentJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MultiAgentEventPublisherError(
        "INVALID_EVENT",
        `${field} must contain only finite numbers.`,
        { field },
      );
    }
    return;
  }

  if (typeof value !== "object") {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      `${field} is not JSON-compatible.`,
      { field },
    );
  }

  if (seen.has(value)) {
    throw new MultiAgentEventPublisherError(
      "INVALID_EVENT",
      `${field} cannot contain circular references.`,
      { field },
    );
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertJsonValue(item, `${field}[${index}]`, seen);
    }
  } else {
    const record = value as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      assertJsonValue(record[key], `${field}.${key}`, seen);
    }
  }

  seen.delete(value);
}

function cloneJson(value: MultiAgentJsonValue): MultiAgentJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return deepFreeze(value.map((item) => cloneJson(item)));
  }

  const record = value as Readonly<Record<string, MultiAgentJsonValue>>;
  const clone: Record<string, MultiAgentJsonValue> = {};

  for (const key of Object.keys(record).sort(compareText)) {
    const item = record[key];

    if (item !== undefined) {
      clone[key] = cloneJson(item);
    }
  }

  return deepFreeze(clone);
}

function toJsonValue(value: unknown): MultiAgentJsonValue {
  assertJsonValue(value, "value");
  return cloneJson(value);
}

function stableFingerprint(value: MultiAgentJsonValue): string {
  return `mae-${fnv1a64(canonicalJson(value))}`;
}

function canonicalJson(value: MultiAgentJsonValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const record = value as Readonly<Record<string, MultiAgentJsonValue>>;
  const entries: string[] = [];

  for (const key of Object.keys(record).sort(compareText)) {
    const item = record[key];

    if (item !== undefined) {
      entries.push(`${JSON.stringify(key)}:${canonicalJson(item)}`);
    }
  }

  return `{${entries.join(",")}}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function deepFreeze<T>(value: T, seen: Set<object> = new Set()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return value;
  }

  seen.add(value as object);

  for (const key of Reflect.ownKeys(value as object)) {
    const propertyValue = (value as Record<PropertyKey, unknown>)[key];

    if (
      propertyValue !== null &&
      (typeof propertyValue === "object" ||
        typeof propertyValue === "function")
    ) {
      deepFreeze(propertyValue, seen);
    }
  }

  return Object.freeze(value);
}