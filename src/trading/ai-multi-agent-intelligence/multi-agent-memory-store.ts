/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-memory-store.ts
 *
 * Deterministic, immutable, replay-safe in-memory persistence for collaborative
 * multi-agent intelligence records.
 */

import {
  type MultiAgentConfidence,
  type MultiAgentId,
  type MultiAgentJsonValue,
  type MultiAgentMemoryId,
  type MultiAgentMemoryPort,
  type MultiAgentMemoryRecord,
  type MultiAgentRunId,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentMemoryCategory = MultiAgentMemoryRecord["category"];

export type MultiAgentMemoryStoreErrorCode =
  | "INVALID_MEMORY_RECORD"
  | "INVALID_MEMORY_QUERY"
  | "DUPLICATE_MEMORY_ID"
  | "MEMORY_ID_CONFLICT"
  | "STALE_MEMORY_UPDATE"
  | "MEMORY_CAPACITY_EXCEEDED"
  | "MEMORY_WRITE_FAILED";

export interface MultiAgentMemoryStoreErrorDetails {
  readonly memoryId?: MultiAgentMemoryId;
  readonly agentId?: MultiAgentId;
  readonly field?: string;
  readonly index?: number;
  readonly cause?: unknown;
}

export class MultiAgentMemoryStoreError extends Error {
  public readonly code: MultiAgentMemoryStoreErrorCode;
  public readonly details: MultiAgentMemoryStoreErrorDetails;

  public constructor(
    code: MultiAgentMemoryStoreErrorCode,
    message: string,
    details: MultiAgentMemoryStoreErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentMemoryStoreError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentMemoryClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentMemoryStoreOptions {
  readonly clock?: MultiAgentMemoryClock;
  readonly maximumRecords?: number;
  readonly rejectStaleUpdates?: boolean;
  readonly rejectFingerprintConflicts?: boolean;
  readonly automaticallyPruneExpired?: boolean;
  readonly preserveCreatedAtOnUpdate?: boolean;
}

export interface MultiAgentMemoryQuery {
  readonly agentId?: MultiAgentId;
  readonly categories?: readonly MultiAgentMemoryCategory[];
  readonly key?: string;
  readonly keyPrefix?: string;
  readonly minimumConfidence?: MultiAgentConfidence;
  readonly sourceRunId?: MultiAgentRunId;
  readonly includeExpired?: boolean;
  readonly createdAtOrAfterMs?: MultiAgentTimestamp;
  readonly createdAtOrBeforeMs?: MultiAgentTimestamp;
  readonly updatedAtOrAfterMs?: MultiAgentTimestamp;
  readonly updatedAtOrBeforeMs?: MultiAgentTimestamp;
  readonly limit?: number;
}

export interface MultiAgentMemoryWriteResult {
  readonly insertedMemoryIds: readonly MultiAgentMemoryId[];
  readonly updatedMemoryIds: readonly MultiAgentMemoryId[];
  readonly unchangedMemoryIds: readonly MultiAgentMemoryId[];
  readonly prunedMemoryIds: readonly MultiAgentMemoryId[];
  readonly totalRecords: number;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentMemoryDeleteResult {
  readonly deletedMemoryIds: readonly MultiAgentMemoryId[];
  readonly totalRecords: number;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentMemoryStoreSnapshot {
  readonly recordCount: number;
  readonly globalRecordCount: number;
  readonly agentRecordCounts: Readonly<Record<string, number>>;
  readonly categoryCounts: Readonly<Record<MultiAgentMemoryCategory, number>>;
  readonly expiredRecordCount: number;
  readonly oldestCreatedAtMs?: MultiAgentTimestamp;
  readonly newestUpdatedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentMemoryClock;
  readonly maximumRecords: number;
  readonly rejectStaleUpdates: boolean;
  readonly rejectFingerprintConflicts: boolean;
  readonly automaticallyPruneExpired: boolean;
  readonly preserveCreatedAtOnUpdate: boolean;
}

const SYSTEM_CLOCK: MultiAgentMemoryClock = Object.freeze({
  now: (): MultiAgentTimestamp => Date.now() as MultiAgentTimestamp,
});

const MEMORY_CATEGORIES: readonly MultiAgentMemoryCategory[] = Object.freeze([
  "EPISODIC",
  "SEMANTIC",
  "PROCEDURAL",
  "POLICY",
  "OUTCOME",
  "TRUST",
]);

const KNOWN_MEMORY_CATEGORIES = new Set<MultiAgentMemoryCategory>(
  MEMORY_CATEGORIES,
);

const DEFAULT_MAXIMUM_RECORDS = 100_000;

export class MultiAgentMemoryStore implements MultiAgentMemoryPort {
  private readonly options: NormalizedOptions;
  private recordsById: ReadonlyMap<MultiAgentMemoryId, MultiAgentMemoryRecord>;
  private lastWriteResultValue: MultiAgentMemoryWriteResult;

  public constructor(options: MultiAgentMemoryStoreOptions = {}) {
    this.options = normalizeOptions(options);
    this.recordsById = new Map<MultiAgentMemoryId, MultiAgentMemoryRecord>();
    this.lastWriteResultValue = deepFreeze({
      insertedMemoryIds: Object.freeze([]),
      updatedMemoryIds: Object.freeze([]),
      unchangedMemoryIds: Object.freeze([]),
      prunedMemoryIds: Object.freeze([]),
      totalRecords: 0,
      deterministicFingerprint: stableFingerprint({
        operation: "INITIALIZE",
        records: [],
      }),
    });
  }

  public read(agentId?: MultiAgentId): readonly MultiAgentMemoryRecord[] {
    if (agentId !== undefined) {
      assertNonEmptyString(agentId, "agentId");
    }

    return this.query({
      agentId,
      includeExpired: false,
    });
  }

  public write(records: readonly MultiAgentMemoryRecord[]): void {
    this.writeWithResult(records);
  }

  public writeWithResult(
    records: readonly MultiAgentMemoryRecord[],
  ): MultiAgentMemoryWriteResult {
    try {
      assertArray(records, "records");

      const now = this.options.clock.now();
      assertTimestamp(now, "clock.now()");

      const normalizedIncoming = records.map((record, index) =>
        normalizeRecord(record, index),
      );

      assertNoDuplicateIncomingIds(normalizedIncoming);

      const working = new Map(this.recordsById);
      const insertedMemoryIds: MultiAgentMemoryId[] = [];
      const updatedMemoryIds: MultiAgentMemoryId[] = [];
      const unchangedMemoryIds: MultiAgentMemoryId[] = [];
      const prunedMemoryIds: MultiAgentMemoryId[] = [];

      if (this.options.automaticallyPruneExpired) {
        for (const [memoryId, record] of working) {
          if (isExpired(record, now)) {
            working.delete(memoryId);
            prunedMemoryIds.push(memoryId);
          }
        }
      }

      for (const incomingRecord of normalizedIncoming) {
        const existing = working.get(incomingRecord.memoryId);

        if (existing === undefined) {
          working.set(incomingRecord.memoryId, incomingRecord);
          insertedMemoryIds.push(incomingRecord.memoryId);
          continue;
        }

        validateCompatibleIdentity(existing, incomingRecord);

        if (
          this.options.rejectStaleUpdates &&
          incomingRecord.lastUpdatedAtMs < existing.lastUpdatedAtMs
        ) {
          throw new MultiAgentMemoryStoreError(
            "STALE_MEMORY_UPDATE",
            `Memory "${incomingRecord.memoryId}" cannot move backward in time.`,
            {
              memoryId: incomingRecord.memoryId,
              agentId: incomingRecord.agentId,
              field: "lastUpdatedAtMs",
            },
          );
        }

        if (
          incomingRecord.lastUpdatedAtMs === existing.lastUpdatedAtMs &&
          incomingRecord.deterministicFingerprint !==
            existing.deterministicFingerprint &&
          this.options.rejectFingerprintConflicts
        ) {
          throw new MultiAgentMemoryStoreError(
            "MEMORY_ID_CONFLICT",
            `Memory "${incomingRecord.memoryId}" has conflicting content at the same update timestamp.`,
            {
              memoryId: incomingRecord.memoryId,
              agentId: incomingRecord.agentId,
              field: "deterministicFingerprint",
            },
          );
        }

        if (
          incomingRecord.deterministicFingerprint ===
            existing.deterministicFingerprint &&
          recordsEquivalent(existing, incomingRecord)
        ) {
          unchangedMemoryIds.push(incomingRecord.memoryId);
          continue;
        }

        const updatedRecord = this.options.preserveCreatedAtOnUpdate
          ? deepFreeze({
              ...cloneMemoryRecord(incomingRecord),
              createdAtMs: existing.createdAtMs,
            })
          : incomingRecord;

        if (updatedRecord.lastUpdatedAtMs < updatedRecord.createdAtMs) {
          throw new MultiAgentMemoryStoreError(
            "INVALID_MEMORY_RECORD",
            `Memory "${updatedRecord.memoryId}" cannot have lastUpdatedAtMs earlier than createdAtMs.`,
            {
              memoryId: updatedRecord.memoryId,
              agentId: updatedRecord.agentId,
              field: "lastUpdatedAtMs",
            },
          );
        }

        working.set(updatedRecord.memoryId, updatedRecord);
        updatedMemoryIds.push(updatedRecord.memoryId);
      }

      if (working.size > this.options.maximumRecords) {
        throw new MultiAgentMemoryStoreError(
          "MEMORY_CAPACITY_EXCEEDED",
          `Memory store capacity of ${this.options.maximumRecords} records would be exceeded.`,
          { field: "maximumRecords" },
        );
      }

      this.recordsById = new Map(
        [...working.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );

      const result = deepFreeze({
        insertedMemoryIds: uniqueSorted(insertedMemoryIds),
        updatedMemoryIds: uniqueSorted(updatedMemoryIds),
        unchangedMemoryIds: uniqueSorted(unchangedMemoryIds),
        prunedMemoryIds: uniqueSorted(prunedMemoryIds),
        totalRecords: this.recordsById.size,
        deterministicFingerprint: stableFingerprint({
          operation: "WRITE",
          insertedMemoryIds: uniqueSorted(insertedMemoryIds),
          updatedMemoryIds: uniqueSorted(updatedMemoryIds),
          unchangedMemoryIds: uniqueSorted(unchangedMemoryIds),
          prunedMemoryIds: uniqueSorted(prunedMemoryIds),
          records: this.sortedRecords(true),
        }),
      } satisfies MultiAgentMemoryWriteResult);

      this.lastWriteResultValue = result;
      return result;
    } catch (cause) {
      if (cause instanceof MultiAgentMemoryStoreError) {
        throw cause;
      }

      throw new MultiAgentMemoryStoreError(
        "MEMORY_WRITE_FAILED",
        "Failed to write multi-agent memory records.",
        { cause },
      );
    }
  }

  public query(
    query: MultiAgentMemoryQuery = {},
  ): readonly MultiAgentMemoryRecord[] {
    validateQuery(query);

    const now = this.options.clock.now();
    assertTimestamp(now, "clock.now()");

    const categories =
      query.categories === undefined
        ? undefined
        : new Set(query.categories);

    const records = this.sortedRecords(true).filter((record) => {
      if (
        query.agentId !== undefined &&
        record.agentId !== query.agentId
      ) {
        return false;
      }

      if (
        categories !== undefined &&
        !categories.has(record.category)
      ) {
        return false;
      }

      if (query.key !== undefined && record.key !== query.key) {
        return false;
      }

      if (
        query.keyPrefix !== undefined &&
        !record.key.startsWith(query.keyPrefix)
      ) {
        return false;
      }

      if (
        query.minimumConfidence !== undefined &&
        record.confidence < query.minimumConfidence
      ) {
        return false;
      }

      if (
        query.sourceRunId !== undefined &&
        !record.sourceRunIds.includes(query.sourceRunId)
      ) {
        return false;
      }

      if (!query.includeExpired && isExpired(record, now)) {
        return false;
      }

      if (
        query.createdAtOrAfterMs !== undefined &&
        record.createdAtMs < query.createdAtOrAfterMs
      ) {
        return false;
      }

      if (
        query.createdAtOrBeforeMs !== undefined &&
        record.createdAtMs > query.createdAtOrBeforeMs
      ) {
        return false;
      }

      if (
        query.updatedAtOrAfterMs !== undefined &&
        record.lastUpdatedAtMs < query.updatedAtOrAfterMs
      ) {
        return false;
      }

      if (
        query.updatedAtOrBeforeMs !== undefined &&
        record.lastUpdatedAtMs > query.updatedAtOrBeforeMs
      ) {
        return false;
      }

      return true;
    });

    const limited =
      query.limit === undefined ? records : records.slice(0, query.limit);

    return deepFreeze(limited.map(cloneMemoryRecord));
  }

  public get(
    memoryId: MultiAgentMemoryId,
    includeExpired = false,
  ): MultiAgentMemoryRecord | undefined {
    assertNonEmptyString(memoryId, "memoryId");

    const record = this.recordsById.get(memoryId);

    if (record === undefined) {
      return undefined;
    }

    const now = this.options.clock.now();
    assertTimestamp(now, "clock.now()");

    if (!includeExpired && isExpired(record, now)) {
      return undefined;
    }

    return deepFreeze(cloneMemoryRecord(record));
  }

  public has(
    memoryId: MultiAgentMemoryId,
    includeExpired = false,
  ): boolean {
    return this.get(memoryId, includeExpired) !== undefined;
  }

  public delete(
    memoryIds: readonly MultiAgentMemoryId[],
  ): MultiAgentMemoryDeleteResult {
    assertArray(memoryIds, "memoryIds");

    for (const [index, memoryId] of memoryIds.entries()) {
      assertNonEmptyString(memoryId, `memoryIds[${index}]`);
    }

    const working = new Map(this.recordsById);
    const deletedMemoryIds: MultiAgentMemoryId[] = [];

    for (const memoryId of uniqueSorted(memoryIds)) {
      if (working.delete(memoryId)) {
        deletedMemoryIds.push(memoryId);
      }
    }

    this.recordsById = new Map(
      [...working.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );

    return deepFreeze({
      deletedMemoryIds,
      totalRecords: this.recordsById.size,
      deterministicFingerprint: stableFingerprint({
        operation: "DELETE",
        deletedMemoryIds,
        records: this.sortedRecords(true),
      }),
    });
  }

  public deleteByAgent(
    agentId: MultiAgentId,
  ): MultiAgentMemoryDeleteResult {
    assertNonEmptyString(agentId, "agentId");

    return this.delete(
      this.sortedRecords(true)
        .filter((record) => record.agentId === agentId)
        .map((record) => record.memoryId),
    );
  }

  public pruneExpired(
    atMs?: MultiAgentTimestamp,
  ): MultiAgentMemoryDeleteResult {
    const effectiveAtMs = atMs ?? this.options.clock.now();
    assertTimestamp(effectiveAtMs, "atMs");

    return this.delete(
      this.sortedRecords(true)
        .filter((record) => isExpired(record, effectiveAtMs))
        .map((record) => record.memoryId),
    );
  }

  public clear(): MultiAgentMemoryDeleteResult {
    return this.delete([...this.recordsById.keys()]);
  }

  public size(includeExpired = true): number {
    if (includeExpired) {
      return this.recordsById.size;
    }

    return this.query({ includeExpired: false }).length;
  }

  public lastWriteResult(): MultiAgentMemoryWriteResult {
    return this.lastWriteResultValue;
  }

  public snapshot(): MultiAgentMemoryStoreSnapshot {
    const now = this.options.clock.now();
    assertTimestamp(now, "clock.now()");

    const records = this.sortedRecords(true);
    const agentRecordCounts: Record<string, number> = {};
    const categoryCounts = createEmptyCategoryCounts();

    let globalRecordCount = 0;
    let expiredRecordCount = 0;
    let oldestCreatedAtMs: MultiAgentTimestamp | undefined;
    let newestUpdatedAtMs: MultiAgentTimestamp | undefined;

    for (const record of records) {
      if (record.agentId === undefined) {
        globalRecordCount += 1;
      } else {
        agentRecordCounts[record.agentId] =
          (agentRecordCounts[record.agentId] ?? 0) + 1;
      }

      categoryCounts[record.category] += 1;

      if (isExpired(record, now)) {
        expiredRecordCount += 1;
      }

      if (
        oldestCreatedAtMs === undefined ||
        record.createdAtMs < oldestCreatedAtMs
      ) {
        oldestCreatedAtMs = record.createdAtMs;
      }

      if (
        newestUpdatedAtMs === undefined ||
        record.lastUpdatedAtMs > newestUpdatedAtMs
      ) {
        newestUpdatedAtMs = record.lastUpdatedAtMs;
      }
    }

    const orderedAgentCounts = Object.fromEntries(
      Object.entries(agentRecordCounts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );

    const base = {
      recordCount: records.length,
      globalRecordCount,
      agentRecordCounts: orderedAgentCounts,
      categoryCounts,
      expiredRecordCount,
      ...(oldestCreatedAtMs === undefined
        ? {}
        : { oldestCreatedAtMs }),
      ...(newestUpdatedAtMs === undefined
        ? {}
        : { newestUpdatedAtMs }),
    };

    return deepFreeze({
      ...base,
      deterministicFingerprint: stableFingerprint({
        ...base,
        records,
      }),
    });
  }

  private sortedRecords(
    includeExpired: boolean,
  ): readonly MultiAgentMemoryRecord[] {
    const now = this.options.clock.now();

    return [...this.recordsById.values()]
      .filter((record) => includeExpired || !isExpired(record, now))
      .sort(compareMemoryRecords);
  }
}

export function createMultiAgentMemoryStore(
  options: MultiAgentMemoryStoreOptions = {},
): MultiAgentMemoryStore {
  return new MultiAgentMemoryStore(options);
}

function normalizeOptions(
  options: MultiAgentMemoryStoreOptions,
): NormalizedOptions {
  const maximumRecords =
    options.maximumRecords ?? DEFAULT_MAXIMUM_RECORDS;

  assertPositiveInteger(maximumRecords, "options.maximumRecords");

  const normalized: NormalizedOptions = {
    clock: options.clock ?? SYSTEM_CLOCK,
    maximumRecords,
    rejectStaleUpdates: options.rejectStaleUpdates ?? true,
    rejectFingerprintConflicts:
      options.rejectFingerprintConflicts ?? true,
    automaticallyPruneExpired:
      options.automaticallyPruneExpired ?? true,
    preserveCreatedAtOnUpdate:
      options.preserveCreatedAtOnUpdate ?? true,
  };

  return Object.freeze(normalized);
}

function normalizeRecord(
  record: MultiAgentMemoryRecord,
  index: number,
): MultiAgentMemoryRecord {
  validateRecord(record, index);

  return deepFreeze({
    memoryId: record.memoryId,
    ...(record.agentId === undefined
      ? {}
      : { agentId: record.agentId }),
    category: record.category,
    key: record.key.trim(),
    value: cloneJsonValue(record.value),
    confidence: record.confidence,
    createdAtMs: record.createdAtMs,
    lastUpdatedAtMs: record.lastUpdatedAtMs,
    ...(record.expiresAtMs === undefined
      ? {}
      : { expiresAtMs: record.expiresAtMs }),
    sourceRunIds: uniqueSorted(record.sourceRunIds),
    deterministicFingerprint: record.deterministicFingerprint,
  });
}

function validateRecord(
  record: MultiAgentMemoryRecord,
  index: number,
): void {
  if (!isRecord(record)) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `records[${index}] must be an object.`,
      { index },
    );
  }

  assertNonEmptyString(record.memoryId, `records[${index}].memoryId`);

  if (record.agentId !== undefined) {
    assertNonEmptyString(
      record.agentId,
      `records[${index}].agentId`,
    );
  }

  if (!KNOWN_MEMORY_CATEGORIES.has(record.category)) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `records[${index}].category is not supported.`,
      {
        memoryId: record.memoryId,
        agentId: record.agentId,
        field: "category",
        index,
      },
    );
  }

  assertNonEmptyString(record.key, `records[${index}].key`);
  assertJsonValue(record.value, `records[${index}].value`);
  assertUnitInterval(
    record.confidence,
    `records[${index}].confidence`,
  );
  assertTimestamp(
    record.createdAtMs,
    `records[${index}].createdAtMs`,
  );
  assertTimestamp(
    record.lastUpdatedAtMs,
    `records[${index}].lastUpdatedAtMs`,
  );

  if (record.lastUpdatedAtMs < record.createdAtMs) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `records[${index}].lastUpdatedAtMs cannot be earlier than createdAtMs.`,
      {
        memoryId: record.memoryId,
        agentId: record.agentId,
        field: "lastUpdatedAtMs",
        index,
      },
    );
  }

  if (record.expiresAtMs !== undefined) {
    assertTimestamp(
      record.expiresAtMs,
      `records[${index}].expiresAtMs`,
    );

    if (record.expiresAtMs < record.createdAtMs) {
      throw new MultiAgentMemoryStoreError(
        "INVALID_MEMORY_RECORD",
        `records[${index}].expiresAtMs cannot be earlier than createdAtMs.`,
        {
          memoryId: record.memoryId,
          agentId: record.agentId,
          field: "expiresAtMs",
          index,
        },
      );
    }
  }

  assertArray(
    record.sourceRunIds,
    `records[${index}].sourceRunIds`,
  );

  for (const [runIndex, runId] of record.sourceRunIds.entries()) {
    assertNonEmptyString(
      runId,
      `records[${index}].sourceRunIds[${runIndex}]`,
    );
  }

  assertNoDuplicateStrings(
    record.sourceRunIds,
    `records[${index}].sourceRunIds`,
  );

  assertNonEmptyString(
    record.deterministicFingerprint,
    `records[${index}].deterministicFingerprint`,
  );
}

function validateQuery(query: MultiAgentMemoryQuery): void {
  if (query.agentId !== undefined) {
    assertNonEmptyString(query.agentId, "query.agentId");
  }

  if (query.categories !== undefined) {
    assertArray(query.categories, "query.categories");

    for (const [index, category] of query.categories.entries()) {
      if (!KNOWN_MEMORY_CATEGORIES.has(category)) {
        throw new MultiAgentMemoryStoreError(
          "INVALID_MEMORY_QUERY",
          `query.categories[${index}] is not supported.`,
          { field: `categories[${index}]`, index },
        );
      }
    }
  }

  if (query.key !== undefined) {
    assertNonEmptyString(query.key, "query.key");
  }

  if (query.keyPrefix !== undefined) {
    assertNonEmptyString(query.keyPrefix, "query.keyPrefix");
  }

  if (query.minimumConfidence !== undefined) {
    assertUnitInterval(
      query.minimumConfidence,
      "query.minimumConfidence",
    );
  }

  if (query.sourceRunId !== undefined) {
    assertNonEmptyString(query.sourceRunId, "query.sourceRunId");
  }

  if (query.createdAtOrAfterMs !== undefined) {
    assertTimestamp(
      query.createdAtOrAfterMs,
      "query.createdAtOrAfterMs",
    );
  }

  if (query.createdAtOrBeforeMs !== undefined) {
    assertTimestamp(
      query.createdAtOrBeforeMs,
      "query.createdAtOrBeforeMs",
    );
  }

  if (
    query.createdAtOrAfterMs !== undefined &&
    query.createdAtOrBeforeMs !== undefined &&
    query.createdAtOrAfterMs > query.createdAtOrBeforeMs
  ) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_QUERY",
      "query.createdAtOrAfterMs cannot exceed query.createdAtOrBeforeMs.",
      { field: "createdAtRange" },
    );
  }

  if (query.updatedAtOrAfterMs !== undefined) {
    assertTimestamp(
      query.updatedAtOrAfterMs,
      "query.updatedAtOrAfterMs",
    );
  }

  if (query.updatedAtOrBeforeMs !== undefined) {
    assertTimestamp(
      query.updatedAtOrBeforeMs,
      "query.updatedAtOrBeforeMs",
    );
  }

  if (
    query.updatedAtOrAfterMs !== undefined &&
    query.updatedAtOrBeforeMs !== undefined &&
    query.updatedAtOrAfterMs > query.updatedAtOrBeforeMs
  ) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_QUERY",
      "query.updatedAtOrAfterMs cannot exceed query.updatedAtOrBeforeMs.",
      { field: "updatedAtRange" },
    );
  }

  if (query.limit !== undefined) {
    assertPositiveInteger(query.limit, "query.limit");
  }
}

function validateCompatibleIdentity(
  existing: MultiAgentMemoryRecord,
  incoming: MultiAgentMemoryRecord,
): void {
  if (
    existing.agentId !== incoming.agentId ||
    existing.category !== incoming.category ||
    existing.key !== incoming.key
  ) {
    throw new MultiAgentMemoryStoreError(
      "MEMORY_ID_CONFLICT",
      `Memory "${incoming.memoryId}" cannot change agent, category, or key identity.`,
      {
        memoryId: incoming.memoryId,
        agentId: incoming.agentId,
      },
    );
  }
}

function assertNoDuplicateIncomingIds(
  records: readonly MultiAgentMemoryRecord[],
): void {
  const seen = new Set<MultiAgentMemoryId>();

  for (const [index, record] of records.entries()) {
    if (seen.has(record.memoryId)) {
      throw new MultiAgentMemoryStoreError(
        "DUPLICATE_MEMORY_ID",
        `Duplicate memoryId "${record.memoryId}" in one write batch.`,
        {
          memoryId: record.memoryId,
          agentId: record.agentId,
          index,
        },
      );
    }

    seen.add(record.memoryId);
  }
}

function assertNoDuplicateStrings(
  values: readonly string[],
  field: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `${field} must not contain duplicates.`,
      { field },
    );
  }
}

function recordsEquivalent(
  left: MultiAgentMemoryRecord,
  right: MultiAgentMemoryRecord,
): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function compareMemoryRecords(
  left: MultiAgentMemoryRecord,
  right: MultiAgentMemoryRecord,
): number {
  const agentDifference = (left.agentId ?? "").localeCompare(
    right.agentId ?? "",
  );

  if (agentDifference !== 0) {
    return agentDifference;
  }

  const categoryDifference = left.category.localeCompare(
    right.category,
  );

  if (categoryDifference !== 0) {
    return categoryDifference;
  }

  const keyDifference = left.key.localeCompare(right.key);

  return keyDifference !== 0
    ? keyDifference
    : left.memoryId.localeCompare(right.memoryId);
}

function isExpired(
  record: MultiAgentMemoryRecord,
  atMs: MultiAgentTimestamp,
): boolean {
  return (
    record.expiresAtMs !== undefined &&
    record.expiresAtMs <= atMs
  );
}

function createEmptyCategoryCounts(): Record<
  MultiAgentMemoryCategory,
  number
> {
  return {
    EPISODIC: 0,
    SEMANTIC: 0,
    PROCEDURAL: 0,
    POLICY: 0,
    OUTCOME: 0,
    TRUST: 0,
  };
}

function cloneMemoryRecord(
  record: MultiAgentMemoryRecord,
): MultiAgentMemoryRecord {
  return {
    memoryId: record.memoryId,
    ...(record.agentId === undefined
      ? {}
      : { agentId: record.agentId }),
    category: record.category,
    key: record.key,
    value: cloneJsonValue(record.value),
    confidence: record.confidence,
    createdAtMs: record.createdAtMs,
    lastUpdatedAtMs: record.lastUpdatedAtMs,
    ...(record.expiresAtMs === undefined
      ? {}
      : { expiresAtMs: record.expiresAtMs }),
    sourceRunIds: [...record.sourceRunIds],
    deterministicFingerprint: record.deterministicFingerprint,
  };
}

function cloneJsonValue(value: MultiAgentJsonValue): MultiAgentJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  const objectValue =
    value as Readonly<Record<string, MultiAgentJsonValue>>;
  const result: Record<string, MultiAgentJsonValue> = {};

  for (const key of Object.keys(objectValue).sort()) {
    const item = objectValue[key];

    if (item !== undefined) {
      result[key] = cloneJsonValue(item);
    }
  }

  return result;
}

function assertJsonValue(
  value: unknown,
  field: string,
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
      throw new MultiAgentMemoryStoreError(
        "INVALID_MEMORY_RECORD",
        `${field} cannot contain a non-finite number.`,
        { field },
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${field}[${index}]`),
    );
    return;
  }

  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      assertJsonValue(value[key], `${field}.${key}`);
    }
    return;
  }

  throw new MultiAgentMemoryStoreError(
    "INVALID_MEMORY_RECORD",
    `${field} must be a valid JSON value.`,
    { field },
  );
}

function assertArray(
  value: unknown,
  field: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `${field} must be an array.`,
      { field },
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertUnitInterval(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `${field} must be a finite number between 0 and 1.`,
      { field },
    );
  }
}

function assertTimestamp(
  value: unknown,
  field: string,
): asserts value is MultiAgentTimestamp {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_RECORD",
      `${field} must be a non-negative finite timestamp.`,
      { field },
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new MultiAgentMemoryStoreError(
      "INVALID_MEMORY_QUERY",
      `${field} must be a positive integer.`,
      { field },
    );
  }
}

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): readonly TValue[] {
  return [...new Set(values)].sort();
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function stableFingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < serialized.length; index += 1) {
    const codePoint = serialized.codePointAt(index);

    if (codePoint === undefined) {
      continue;
    }

    hash ^= BigInt(codePoint);
    hash = (hash * prime) & mask;

    if (codePoint > 0xffff) {
      index += 1;
    }
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Cannot canonicalize a non-finite number.",
      );
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .map(
        ([key, item]) =>
          [String(key), canonicalize(item)] as const,
      )
      .sort(([left], [right]) => left.localeCompare(right));
  }

  if (value instanceof Set) {
    return [...value.values()]
      .map((item) => canonicalize(item))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(
          JSON.stringify(right),
        ),
      );
  }

  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      const item = record[key];

      if (item !== undefined) {
        result[key] = canonicalize(item);
      }
    }

    return result;
  }

  if (value === undefined) {
    return null;
  }

  throw new TypeError(
    `Unsupported canonical value type: ${typeof value}.`,
  );
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as object)) {
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}