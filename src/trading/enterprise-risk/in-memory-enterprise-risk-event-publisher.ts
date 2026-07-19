/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/
 * in-memory-enterprise-risk-event-publisher.ts
 *
 * Purpose:
 * Deterministic in-memory implementation of the enterprise-risk event
 * publisher contract.
 *
 * Design goals:
 * - Deterministic event ordering
 * - Immutable stored and returned events
 * - Duplicate-event protection
 * - Runtime contract validation
 * - Filtered event retrieval
 * - Suitable for testing, local development, simulation, and orchestration
 */

import {
  EnterpriseRiskEvent,
  EnterpriseRiskEventPublisher,
  EnterpriseRiskMetadata,
  EnterpriseRiskSeverity,
  EnterpriseRiskTimestamp,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export type EnterpriseRiskEventType =
  EnterpriseRiskEvent["eventType"];

export interface InMemoryEnterpriseRiskEventPublisherOptions {
  /**
   * Optional events with which to initialise the publisher.
   */
  readonly initialEvents?: readonly EnterpriseRiskEvent[];

  /**
   * Whether publishing an existing event identifier should replace the
   * existing event.
   *
   * Defaults to false because enterprise-risk event identifiers should
   * normally be immutable and unique.
   */
  readonly replaceDuplicateEventIds?: boolean;

  /**
   * Optional maximum number of retained events.
   *
   * When supplied, the oldest events are removed after the limit is
   * exceeded.
   */
  readonly maximumRetainedEvents?: number;
}

export interface EnterpriseRiskEventQuery {
  readonly eventTypes?: readonly EnterpriseRiskEventType[];
  readonly severities?: readonly EnterpriseRiskSeverity[];
  readonly portfolioId?: string;
  readonly accountId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly exchangeId?: string;
  readonly chainId?: string;
  readonly symbol?: string;
  readonly occurredAtOrAfter?: EnterpriseRiskTimestamp;
  readonly occurredAtOrBefore?: EnterpriseRiskTimestamp;
  readonly limit?: number;
}

interface NormalizedInMemoryEnterpriseRiskEventPublisherOptions {
  readonly replaceDuplicateEventIds: boolean;
  readonly maximumRetainedEvents?: number;
}

const EVENT_TYPES: ReadonlySet<EnterpriseRiskEventType> =
  new Set<EnterpriseRiskEventType>([
    "RISK_EVALUATED",
    "LIMIT_WARNING",
    "LIMIT_BREACHED",
    "CIRCUIT_BREAKER_ARMED",
    "CIRCUIT_BREAKER_TRIGGERED",
    "CIRCUIT_BREAKER_RECOVERING",
    "CIRCUIT_BREAKER_RESET",
    "GLOBAL_KILL_SWITCH_ENABLED",
    "GLOBAL_KILL_SWITCH_DISABLED",
    "TRADING_RESTRICTED",
    "TRADING_RESUMED",
    "POSITION_REDUCTION_REQUESTED",
    "EMERGENCY_EXIT_REQUESTED",
  ]);

const SEVERITIES: ReadonlySet<EnterpriseRiskSeverity> =
  new Set<EnterpriseRiskSeverity>([
    "INFO",
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ]);

function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function validateObject(
  value: unknown,
  field: string,
): void {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a string.",
    );
  }

  if (value.trim().length === 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must not be empty.",
    );
  }
}

function assertOptionalNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }

  assertNonEmptyString(value, field);
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a boolean.",
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative integer.",
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a positive integer.",
    );
  }
}

function validateEventType(
  value: unknown,
  field: string,
): asserts value is EnterpriseRiskEventType {
  if (
    typeof value !== "string" ||
    !EVENT_TYPES.has(value as EnterpriseRiskEventType)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "contains an unsupported enterprise-risk event type.",
    );
  }
}

function validateSeverity(
  value: unknown,
  field: string,
): asserts value is EnterpriseRiskSeverity {
  if (
    typeof value !== "string" ||
    !SEVERITIES.has(value as EnterpriseRiskSeverity)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "contains an unsupported enterprise-risk severity.",
    );
  }
}

function cloneMetadata(
  metadata: EnterpriseRiskMetadata | undefined,
): EnterpriseRiskMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...metadata,
  });
}

function cloneEvent(
  event: EnterpriseRiskEvent,
): EnterpriseRiskEvent {
  return Object.freeze({
    ...event,
    metadata: cloneMetadata(event.metadata),
  });
}

function validateEvent(
  event: EnterpriseRiskEvent,
  field = "event",
): void {
  assertRecord(event, field);

  assertNonEmptyString(
    event.eventId,
    `${field}.eventId`,
  );

  validateEventType(
    event.eventType,
    `${field}.eventType`,
  );

  validateSeverity(
    event.severity,
    `${field}.severity`,
  );

  assertOptionalNonEmptyString(
    event.portfolioId,
    `${field}.portfolioId`,
  );

  assertOptionalNonEmptyString(
    event.accountId,
    `${field}.accountId`,
  );

  assertOptionalNonEmptyString(
    event.strategyId,
    `${field}.strategyId`,
  );

  assertOptionalNonEmptyString(
    event.botId,
    `${field}.botId`,
  );

  assertOptionalNonEmptyString(
    event.exchangeId,
    `${field}.exchangeId`,
  );

  assertOptionalNonEmptyString(
    event.chainId,
    `${field}.chainId`,
  );

  assertOptionalNonEmptyString(
    event.symbol,
    `${field}.symbol`,
  );

  assertNonEmptyString(
    event.message,
    `${field}.message`,
  );

  assertNonNegativeInteger(
    event.occurredAt,
    `${field}.occurredAt`,
  );

  if (
    event.metadata !== undefined &&
    (typeof event.metadata !== "object" ||
      event.metadata === null ||
      Array.isArray(event.metadata))
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.metadata`,
      "must be a non-null object.",
    );
  }
}

function normalizeOptions(
  options?: InMemoryEnterpriseRiskEventPublisherOptions,
): NormalizedInMemoryEnterpriseRiskEventPublisherOptions {
  if (
    options !== undefined &&
    (typeof options !== "object" ||
      options === null ||
      Array.isArray(options))
  ) {
    throw new EnterpriseRiskValidationError(
      "options",
      "must be a non-null object.",
    );
  }

  const replaceDuplicateEventIds =
    options?.replaceDuplicateEventIds ?? false;

  const maximumRetainedEvents =
    options?.maximumRetainedEvents;

  assertBoolean(
    replaceDuplicateEventIds,
    "options.replaceDuplicateEventIds",
  );

  if (maximumRetainedEvents !== undefined) {
    assertPositiveInteger(
      maximumRetainedEvents,
      "options.maximumRetainedEvents",
    );
  }

  return Object.freeze({
    replaceDuplicateEventIds,
    maximumRetainedEvents,
  });
}

function normalizeOptionalFilterString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  assertNonEmptyString(value, field);

  return value.trim();
}

function validateQuery(
  query: EnterpriseRiskEventQuery,
): EnterpriseRiskEventQuery {
  validateObject(query, "query");

  if (query.eventTypes !== undefined) {
    if (!Array.isArray(query.eventTypes)) {
      throw new EnterpriseRiskValidationError(
        "query.eventTypes",
        "must be an array.",
      );
    }

    query.eventTypes.forEach((eventType, index) => {
      validateEventType(
        eventType,
        `query.eventTypes[${index}]`,
      );
    });
  }

  if (query.severities !== undefined) {
    if (!Array.isArray(query.severities)) {
      throw new EnterpriseRiskValidationError(
        "query.severities",
        "must be an array.",
      );
    }

    query.severities.forEach((severity, index) => {
      validateSeverity(
        severity,
        `query.severities[${index}]`,
      );
    });
  }

  const portfolioId = normalizeOptionalFilterString(
    query.portfolioId,
    "query.portfolioId",
  );

  const accountId = normalizeOptionalFilterString(
    query.accountId,
    "query.accountId",
  );

  const strategyId = normalizeOptionalFilterString(
    query.strategyId,
    "query.strategyId",
  );

  const botId = normalizeOptionalFilterString(
    query.botId,
    "query.botId",
  );

  const exchangeId = normalizeOptionalFilterString(
    query.exchangeId,
    "query.exchangeId",
  );

  const chainId = normalizeOptionalFilterString(
    query.chainId,
    "query.chainId",
  );

  const symbol = normalizeOptionalFilterString(
    query.symbol,
    "query.symbol",
  );

  if (query.occurredAtOrAfter !== undefined) {
    assertNonNegativeInteger(
      query.occurredAtOrAfter,
      "query.occurredAtOrAfter",
    );
  }

  if (query.occurredAtOrBefore !== undefined) {
    assertNonNegativeInteger(
      query.occurredAtOrBefore,
      "query.occurredAtOrBefore",
    );
  }

  if (
    query.occurredAtOrAfter !== undefined &&
    query.occurredAtOrBefore !== undefined &&
    query.occurredAtOrBefore <
      query.occurredAtOrAfter
  ) {
    throw new EnterpriseRiskValidationError(
      "query.occurredAtOrBefore",
      "must not be earlier than occurredAtOrAfter.",
    );
  }

  if (query.limit !== undefined) {
    assertPositiveInteger(
      query.limit,
      "query.limit",
    );
  }

  return Object.freeze({
    eventTypes:
      query.eventTypes === undefined
        ? undefined
        : Object.freeze([...query.eventTypes]),
    severities:
      query.severities === undefined
        ? undefined
        : Object.freeze([...query.severities]),
    portfolioId,
    accountId,
    strategyId,
    botId,
    exchangeId,
    chainId,
    symbol,
    occurredAtOrAfter: query.occurredAtOrAfter,
    occurredAtOrBefore: query.occurredAtOrBefore,
    limit: query.limit,
  });
}

function compareEvents(
  left: EnterpriseRiskEvent,
  right: EnterpriseRiskEvent,
): number {
  const timestampComparison =
    left.occurredAt - right.occurredAt;

  if (timestampComparison !== 0) {
    return timestampComparison;
  }

  return left.eventId.localeCompare(right.eventId);
}

function eventMatchesQuery(
  event: EnterpriseRiskEvent,
  query: EnterpriseRiskEventQuery,
): boolean {
  if (
    query.eventTypes !== undefined &&
    !query.eventTypes.includes(event.eventType)
  ) {
    return false;
  }

  if (
    query.severities !== undefined &&
    !query.severities.includes(event.severity)
  ) {
    return false;
  }

  if (
    query.portfolioId !== undefined &&
    event.portfolioId !== query.portfolioId
  ) {
    return false;
  }

  if (
    query.accountId !== undefined &&
    event.accountId !== query.accountId
  ) {
    return false;
  }

  if (
    query.strategyId !== undefined &&
    event.strategyId !== query.strategyId
  ) {
    return false;
  }

  if (
    query.botId !== undefined &&
    event.botId !== query.botId
  ) {
    return false;
  }

  if (
    query.exchangeId !== undefined &&
    event.exchangeId !== query.exchangeId
  ) {
    return false;
  }

  if (
    query.chainId !== undefined &&
    event.chainId !== query.chainId
  ) {
    return false;
  }

  if (
    query.symbol !== undefined &&
    event.symbol !== query.symbol
  ) {
    return false;
  }

  if (
    query.occurredAtOrAfter !== undefined &&
    event.occurredAt < query.occurredAtOrAfter
  ) {
    return false;
  }

  if (
    query.occurredAtOrBefore !== undefined &&
    event.occurredAt > query.occurredAtOrBefore
  ) {
    return false;
  }

  return true;
}

export class InMemoryEnterpriseRiskEventPublisher
  implements EnterpriseRiskEventPublisher
{
  private readonly eventsById =
    new Map<string, EnterpriseRiskEvent>();

  private readonly options:
    NormalizedInMemoryEnterpriseRiskEventPublisherOptions;

  public constructor(
    options?: InMemoryEnterpriseRiskEventPublisherOptions,
  ) {
    this.options = normalizeOptions(options);

    const initialEvents =
      options?.initialEvents ?? [];

    if (!Array.isArray(initialEvents)) {
      throw new EnterpriseRiskValidationError(
        "options.initialEvents",
        "must be an array.",
      );
    }

    initialEvents.forEach((event, index) => {
      validateEvent(
        event,
        `options.initialEvents[${index}]`,
      );

      if (this.eventsById.has(event.eventId)) {
        throw new EnterpriseRiskValidationError(
          `options.initialEvents[${index}].eventId`,
          `contains duplicate identifier ${event.eventId}.`,
        );
      }

      this.eventsById.set(
        event.eventId,
        cloneEvent(event),
      );
    });

    this.enforceRetentionLimit();
  }

  public publish(event: EnterpriseRiskEvent): void {
    validateEvent(event);

    const eventExists =
      this.eventsById.has(event.eventId);

    if (
      eventExists &&
      !this.options.replaceDuplicateEventIds
    ) {
      throw new EnterpriseRiskValidationError(
        "event.eventId",
        `event ${event.eventId} has already been published.`,
      );
    }

    this.eventsById.set(
      event.eventId,
      cloneEvent(event),
    );

    this.enforceRetentionLimit();
  }

  public getById(
    eventId: string,
  ): EnterpriseRiskEvent | undefined {
    assertNonEmptyString(eventId, "eventId");

    const event = this.eventsById.get(eventId);

    return event === undefined
      ? undefined
      : cloneEvent(event);
  }

  public getAll(): readonly EnterpriseRiskEvent[] {
    return Object.freeze(
      [...this.eventsById.values()]
        .sort(compareEvents)
        .map(cloneEvent),
    );
  }

  public query(
    query: EnterpriseRiskEventQuery = {},
  ): readonly EnterpriseRiskEvent[] {
    const normalizedQuery = validateQuery(query);

    let events = [...this.eventsById.values()]
      .filter((event) =>
        eventMatchesQuery(event, normalizedQuery),
      )
      .sort(compareEvents);

    if (normalizedQuery.limit !== undefined) {
      events = events.slice(
        Math.max(
          0,
          events.length - normalizedQuery.limit,
        ),
      );
    }

    return Object.freeze(
      events.map(cloneEvent),
    );
  }

  public getLatest(
    limit = 1,
  ): readonly EnterpriseRiskEvent[] {
    assertPositiveInteger(limit, "limit");

    const sortedEvents = [
      ...this.eventsById.values(),
    ].sort(compareEvents);

    return Object.freeze(
      sortedEvents
        .slice(
          Math.max(0, sortedEvents.length - limit),
        )
        .map(cloneEvent),
    );
  }

  public remove(eventId: string): boolean {
    assertNonEmptyString(eventId, "eventId");

    return this.eventsById.delete(eventId);
  }

  public clear(): void {
    this.eventsById.clear();
  }

  public size(): number {
    return this.eventsById.size;
  }

  private enforceRetentionLimit(): void {
    const maximumRetainedEvents =
      this.options.maximumRetainedEvents;

    if (
      maximumRetainedEvents === undefined ||
      this.eventsById.size <= maximumRetainedEvents
    ) {
      return;
    }

    const sortedEvents = [
      ...this.eventsById.values(),
    ].sort(compareEvents);

    const removalCount =
      sortedEvents.length - maximumRetainedEvents;

    for (
      let index = 0;
      index < removalCount;
      index += 1
    ) {
      const event = sortedEvents[index];

      if (event !== undefined) {
        this.eventsById.delete(event.eventId);
      }
    }
  }
}