/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-audit-log.ts
 *
 * Purpose:
 * Deterministic in-memory audit log for enterprise-risk decisions and events.
 * Provides immutable storage, stable chronological retrieval, filtering,
 * bounded retention, and explicit clearing for tests and runtime lifecycle.
 */

import {
  EnterpriseRiskDecision,
  EnterpriseRiskEvent,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export type EnterpriseRiskAuditRecordType =
  | "DECISION"
  | "EVENT";

export interface EnterpriseRiskDecisionAuditRecord {
  readonly recordType: "DECISION";
  readonly recordId: string;
  readonly occurredAt: number;
  readonly portfolioId?: string;
  readonly accountId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly decision: EnterpriseRiskDecision;
}

export interface EnterpriseRiskEventAuditRecord {
  readonly recordType: "EVENT";
  readonly recordId: string;
  readonly occurredAt: number;
  readonly portfolioId?: string;
  readonly accountId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly event: EnterpriseRiskEvent;
}

export type EnterpriseRiskAuditRecord =
  | EnterpriseRiskDecisionAuditRecord
  | EnterpriseRiskEventAuditRecord;

export interface EnterpriseRiskAuditQuery {
  readonly recordType?:
    EnterpriseRiskAuditRecordType;
  readonly portfolioId?: string;
  readonly accountId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly fromTimestamp?: number;
  readonly toTimestamp?: number;
  readonly limit?: number;
}

export interface EnterpriseRiskAuditLogOptions {
  readonly maximumRecords?: number;
}

export interface EnterpriseRiskAuditLog {
  appendDecision(
    decision: EnterpriseRiskDecision,
    scope?: {
      readonly portfolioId?: string;
      readonly accountId?: string;
      readonly strategyId?: string;
      readonly botId?: string;
    },
  ): void;

  appendEvent(
    event: EnterpriseRiskEvent,
  ): void;

  query(
    query?: EnterpriseRiskAuditQuery,
  ): readonly EnterpriseRiskAuditRecord[];

  getById(
    recordId: string,
  ): EnterpriseRiskAuditRecord | undefined;

  count(): number;

  clear(): void;
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-empty string.",
    );
  }
}

function assertFiniteTimestamp(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative finite number.",
    );
  }
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Readonly<Record<string, unknown>> {
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

function deepCloneAndFreeze<T>(
  value: T,
): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) =>
        deepCloneAndFreeze(entry),
      ),
    ) as T;
  }

  const cloned: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    cloned[key] = deepCloneAndFreeze(entry);
  }

  return Object.freeze(cloned) as T;
}

function validateOptionalScopeValue(
  value: unknown,
  field: string,
): void {
  if (value !== undefined) {
    assertNonEmptyString(value, field);
  }
}

function validateQuery(
  query: EnterpriseRiskAuditQuery,
): void {
  assertObject(query, "query");

  validateOptionalScopeValue(
    query.portfolioId,
    "query.portfolioId",
  );
  validateOptionalScopeValue(
    query.accountId,
    "query.accountId",
  );
  validateOptionalScopeValue(
    query.strategyId,
    "query.strategyId",
  );
  validateOptionalScopeValue(
    query.botId,
    "query.botId",
  );

  if (query.fromTimestamp !== undefined) {
    assertFiniteTimestamp(
      query.fromTimestamp,
      "query.fromTimestamp",
    );
  }

  if (query.toTimestamp !== undefined) {
    assertFiniteTimestamp(
      query.toTimestamp,
      "query.toTimestamp",
    );
  }

  if (
    query.fromTimestamp !== undefined &&
    query.toTimestamp !== undefined &&
    query.fromTimestamp > query.toTimestamp
  ) {
    throw new EnterpriseRiskValidationError(
      "query",
      "fromTimestamp cannot exceed toTimestamp.",
    );
  }

  const limit = query.limit;

  if (
    limit !== undefined &&
    (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit <= 0
    )
  ) {
    throw new EnterpriseRiskValidationError(
      "query.limit",
      "must be a positive integer.",
    );
  }
}

function matchesQuery(
  record: EnterpriseRiskAuditRecord,
  query: EnterpriseRiskAuditQuery,
): boolean {
  return (
    (
      query.recordType === undefined ||
      record.recordType === query.recordType
    ) &&
    (
      query.portfolioId === undefined ||
      record.portfolioId === query.portfolioId
    ) &&
    (
      query.accountId === undefined ||
      record.accountId === query.accountId
    ) &&
    (
      query.strategyId === undefined ||
      record.strategyId === query.strategyId
    ) &&
    (
      query.botId === undefined ||
      record.botId === query.botId
    ) &&
    (
      query.fromTimestamp === undefined ||
      record.occurredAt >= query.fromTimestamp
    ) &&
    (
      query.toTimestamp === undefined ||
      record.occurredAt <= query.toTimestamp
    )
  );
}

export class InMemoryEnterpriseRiskAuditLog
  implements EnterpriseRiskAuditLog
{
  private readonly maximumRecords: number;

  private readonly records =
    new Map<string, EnterpriseRiskAuditRecord>();

  public constructor(
    options: EnterpriseRiskAuditLogOptions = {},
  ) {
    assertObject(options, "options");

    const maximumRecords =
      options.maximumRecords;

    if (
      maximumRecords !== undefined &&
      (
        typeof maximumRecords !== "number" ||
        !Number.isInteger(
          maximumRecords,
        ) ||
        maximumRecords <= 0
      )
    ) {
      throw new EnterpriseRiskValidationError(
        "options.maximumRecords",
        "must be a positive integer.",
      );
    }

    this.maximumRecords =
      maximumRecords ?? 10_000;
  }

  public appendDecision(
    decision: EnterpriseRiskDecision,
    scope: {
      readonly portfolioId?: string;
      readonly accountId?: string;
      readonly strategyId?: string;
      readonly botId?: string;
    } = {},
  ): void {
    assertObject(decision, "decision");
    assertObject(scope, "scope");

    assertNonEmptyString(
      decision.decisionId,
      "decision.decisionId",
    );

    assertFiniteTimestamp(
      decision.evaluatedAt,
      "decision.evaluatedAt",
    );

    validateOptionalScopeValue(
      scope.portfolioId,
      "scope.portfolioId",
    );
    validateOptionalScopeValue(
      scope.accountId,
      "scope.accountId",
    );
    validateOptionalScopeValue(
      scope.strategyId,
      "scope.strategyId",
    );
    validateOptionalScopeValue(
      scope.botId,
      "scope.botId",
    );

    const record:
      EnterpriseRiskDecisionAuditRecord = {
      recordType: "DECISION",
      recordId: decision.decisionId,
      occurredAt: decision.evaluatedAt,
      ...(scope.portfolioId === undefined
        ? {}
        : { portfolioId: scope.portfolioId }),
      ...(scope.accountId === undefined
        ? {}
        : { accountId: scope.accountId }),
      ...(scope.strategyId === undefined
        ? {}
        : { strategyId: scope.strategyId }),
      ...(scope.botId === undefined
        ? {}
        : { botId: scope.botId }),
      decision: deepCloneAndFreeze(decision),
    };

    this.store(record);
  }

  public appendEvent(
    event: EnterpriseRiskEvent,
  ): void {
    assertObject(event, "event");

    assertNonEmptyString(
      event.eventId,
      "event.eventId",
    );

    assertFiniteTimestamp(
      event.occurredAt,
      "event.occurredAt",
    );

    const record:
      EnterpriseRiskEventAuditRecord = {
      recordType: "EVENT",
      recordId: event.eventId,
      occurredAt: event.occurredAt,
      ...(event.portfolioId === undefined
        ? {}
        : { portfolioId: event.portfolioId }),
      ...(event.accountId === undefined
        ? {}
        : { accountId: event.accountId }),
      ...(event.strategyId === undefined
        ? {}
        : { strategyId: event.strategyId }),
      ...(event.botId === undefined
        ? {}
        : { botId: event.botId }),
      event: deepCloneAndFreeze(event),
    };

    this.store(record);
  }

  public query(
    query: EnterpriseRiskAuditQuery = {},
  ): readonly EnterpriseRiskAuditRecord[] {
    validateQuery(query);

    const matchingRecords =
      [...this.records.values()]
        .filter((record) =>
          matchesQuery(record, query),
        )
        .sort((left, right) => {
          if (
            left.occurredAt !==
            right.occurredAt
          ) {
            return (
              left.occurredAt -
              right.occurredAt
            );
          }

          return left.recordId.localeCompare(
            right.recordId,
          );
        });

    const limitedRecords =
      query.limit === undefined
        ? matchingRecords
        : matchingRecords.slice(
            0,
            query.limit,
          );

    return Object.freeze(
      limitedRecords.map((record) =>
        deepCloneAndFreeze(record),
      ),
    );
  }

  public getById(
    recordId: string,
  ): EnterpriseRiskAuditRecord | undefined {
    assertNonEmptyString(
      recordId,
      "recordId",
    );

    const record = this.records.get(recordId);

    return record === undefined
      ? undefined
      : deepCloneAndFreeze(record);
  }

  public count(): number {
    return this.records.size;
  }

  public clear(): void {
    this.records.clear();
  }

  private store(
    record: EnterpriseRiskAuditRecord,
  ): void {
    this.records.set(
      record.recordId,
      deepCloneAndFreeze(record),
    );

    while (
      this.records.size >
      this.maximumRecords
    ) {
      const oldestRecord =
        [...this.records.values()].sort(
          (left, right) => {
            if (
              left.occurredAt !==
              right.occurredAt
            ) {
              return (
                left.occurredAt -
                right.occurredAt
              );
            }

            return left.recordId.localeCompare(
              right.recordId,
            );
          },
        )[0];

      if (oldestRecord === undefined) {
        break;
      }

      this.records.delete(
        oldestRecord.recordId,
      );
    }
  }
}

export function createEnterpriseRiskAuditLog(
  options: EnterpriseRiskAuditLogOptions = {},
): InMemoryEnterpriseRiskAuditLog {
  return new InMemoryEnterpriseRiskAuditLog(
    options,
  );
}