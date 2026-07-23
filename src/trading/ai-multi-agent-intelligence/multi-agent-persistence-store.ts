/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-persistence-store.ts
 *
 * Deterministic, immutable in-memory persistence adapter for multi-agent run
 * results and manager snapshots. The adapter implements the persistence port
 * used by the Milestone 38 orchestrator while also providing bounded history,
 * deterministic export/import, and safe read APIs for operational tooling.
 */

import {
  type MultiAgentId,
  type MultiAgentManagerSnapshot,
  type MultiAgentPersistencePort,
  type MultiAgentRunId,
  type MultiAgentRunResult,
  type MultiAgentSessionId,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentPersistenceErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_RUN_RESULT"
  | "INVALID_SNAPSHOT"
  | "DUPLICATE_RUN"
  | "RUN_NOT_FOUND"
  | "SNAPSHOT_NOT_FOUND"
  | "IMPORT_REJECTED"
  | "CAPACITY_EXCEEDED";

export interface MultiAgentPersistenceErrorDetails {
  readonly field?: string;
  readonly runId?: MultiAgentRunId;
  readonly sessionId?: MultiAgentSessionId;
  readonly managerId?: MultiAgentId;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export class MultiAgentPersistenceError extends Error {
  public readonly code: MultiAgentPersistenceErrorCode;
  public readonly details: MultiAgentPersistenceErrorDetails;

  public constructor(
    code: MultiAgentPersistenceErrorCode,
    message: string,
    details: MultiAgentPersistenceErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentPersistenceError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export type MultiAgentDuplicateRunPolicy =
  | "REJECT"
  | "IGNORE_IDENTICAL"
  | "REPLACE";

export interface MultiAgentPersistenceStoreOptions {
  /** Maximum retained run results. Oldest completed runs are evicted first. */
  readonly maximumRunHistory?: number;

  /** Maximum retained manager snapshots. */
  readonly maximumSnapshotHistory?: number;

  /** Behaviour when saveRun receives an existing runId. */
  readonly duplicateRunPolicy?: MultiAgentDuplicateRunPolicy;

  /** Require a non-empty deterministic fingerprint on persisted values. */
  readonly requireDeterministicFingerprint?: boolean;

  /** Deep-freeze all stored and returned values. */
  readonly freezeValues?: boolean;
}

export interface MultiAgentPersistenceStatistics {
  readonly retainedRunCount: number;
  readonly retainedSnapshotCount: number;
  readonly totalRunWrites: number;
  readonly totalSnapshotWrites: number;
  readonly duplicateRunWrites: number;
  readonly evictedRunCount: number;
  readonly evictedSnapshotCount: number;
  readonly latestRunCompletedAtMs?: MultiAgentTimestamp;
  readonly latestSnapshotCapturedAtMs?: MultiAgentTimestamp;
}

export interface MultiAgentPersistenceExport {
  readonly format: "QUANTUM_TRADE_AI_MULTI_AGENT_PERSISTENCE";
  readonly version: 1;
  readonly runs: readonly MultiAgentRunResult[];
  readonly snapshots: readonly MultiAgentManagerSnapshot[];
  readonly statistics: MultiAgentPersistenceStatistics;
}

export interface MultiAgentRunQuery {
  readonly sessionId?: MultiAgentSessionId;
  readonly status?: MultiAgentRunResult["status"];
  readonly completedFromMs?: MultiAgentTimestamp;
  readonly completedToMs?: MultiAgentTimestamp;
  readonly limit?: number;
  readonly newestFirst?: boolean;
}

interface NormalizedOptions {
  readonly maximumRunHistory: number;
  readonly maximumSnapshotHistory: number;
  readonly duplicateRunPolicy: MultiAgentDuplicateRunPolicy;
  readonly requireDeterministicFingerprint: boolean;
  readonly freezeValues: boolean;
}

interface MutableStatistics {
  totalRunWrites: number;
  totalSnapshotWrites: number;
  duplicateRunWrites: number;
  evictedRunCount: number;
  evictedSnapshotCount: number;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  maximumRunHistory: 1_000,
  maximumSnapshotHistory: 100,
  duplicateRunPolicy: "IGNORE_IDENTICAL",
  requireDeterministicFingerprint: true,
  freezeValues: true,
});

/**
 * Deterministic in-memory persistence implementation.
 *
 * The class deliberately exposes only immutable copies. Internal ordering is
 * deterministic and never depends on Map insertion order when values are read.
 */
export class MultiAgentPersistenceStore
  implements MultiAgentPersistencePort
{
  private readonly options: NormalizedOptions;
  private readonly runsById = new Map<
    MultiAgentRunId,
    MultiAgentRunResult
  >();
  private readonly snapshots: MultiAgentManagerSnapshot[] = [];
  private readonly statistics: MutableStatistics = {
    totalRunWrites: 0,
    totalSnapshotWrites: 0,
    duplicateRunWrites: 0,
    evictedRunCount: 0,
    evictedSnapshotCount: 0,
  };

  public constructor(options: MultiAgentPersistenceStoreOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public saveRun(result: MultiAgentRunResult): void {
    validateRunResult(result, this.options);

    const existing = this.runsById.get(result.runId);

    if (existing !== undefined) {
      this.statistics.duplicateRunWrites += 1;
      this.handleDuplicateRun(existing, result);
      return;
    }

    this.runsById.set(result.runId, this.prepareValue(result));
    this.statistics.totalRunWrites += 1;
    this.enforceRunCapacity();
  }

  public saveSnapshot(snapshot: MultiAgentManagerSnapshot): void {
    validateSnapshot(snapshot, this.options);

    const prepared = this.prepareValue(snapshot);
    const existingIndex = this.snapshots.findIndex(
      (candidate) =>
        candidate.managerId === prepared.managerId &&
        candidate.capturedAtMs === prepared.capturedAtMs,
    );

    if (existingIndex >= 0) {
      const existing = this.snapshots[existingIndex];

      if (
        existing !== undefined &&
        existing.deterministicFingerprint ===
          prepared.deterministicFingerprint
      ) {
        return;
      }

      this.snapshots.splice(existingIndex, 1, prepared);
    } else {
      this.snapshots.push(prepared);
    }

    this.statistics.totalSnapshotWrites += 1;
    this.snapshots.sort(compareSnapshotsAscending);
    this.enforceSnapshotCapacity();
  }

  public loadSnapshot(): MultiAgentManagerSnapshot | undefined {
    const latest = this.getLatestSnapshotInternal();
    return latest === undefined ? undefined : this.copyForRead(latest);
  }

  public getRun(runId: MultiAgentRunId): MultiAgentRunResult | undefined {
    assertNonEmptyString(runId, "runId");
    const result = this.runsById.get(runId);
    return result === undefined ? undefined : this.copyForRead(result);
  }

  public requireRun(runId: MultiAgentRunId): MultiAgentRunResult {
    const result = this.getRun(runId);

    if (result === undefined) {
      throw new MultiAgentPersistenceError(
        "RUN_NOT_FOUND",
        `No persisted multi-agent run exists for runId "${runId}".`,
        { runId },
      );
    }

    return result;
  }

  public listRuns(
    query: MultiAgentRunQuery = Object.freeze({}),
  ): readonly MultiAgentRunResult[] {
    validateRunQuery(query);

    const newestFirst = query.newestFirst ?? true;
    const limit = query.limit ?? this.options.maximumRunHistory;

    const matches = [...this.runsById.values()]
      .filter((result) =>
        query.sessionId === undefined
          ? true
          : result.sessionId === query.sessionId,
      )
      .filter((result) =>
        query.status === undefined
          ? true
          : result.status === query.status,
      )
      .filter((result) =>
        query.completedFromMs === undefined
          ? true
          : result.completedAtMs >= query.completedFromMs,
      )
      .filter((result) =>
        query.completedToMs === undefined
          ? true
          : result.completedAtMs <= query.completedToMs,
      )
      .sort(
        newestFirst
          ? compareRunsDescending
          : compareRunsAscending,
      )
      .slice(0, limit)
      .map((result) => this.copyForRead(result));

    return Object.freeze(matches);
  }

  public listSnapshots(
    newestFirst = true,
  ): readonly MultiAgentManagerSnapshot[] {
    const values = [...this.snapshots]
      .sort(
        newestFirst
          ? compareSnapshotsDescending
          : compareSnapshotsAscending,
      )
      .map((snapshot) => this.copyForRead(snapshot));

    return Object.freeze(values);
  }

  public loadSnapshotForManager(
    managerId: MultiAgentId,
  ): MultiAgentManagerSnapshot | undefined {
    assertNonEmptyString(managerId, "managerId");

    const latest = [...this.snapshots]
      .filter((snapshot) => snapshot.managerId === managerId)
      .sort(compareSnapshotsDescending)[0];

    return latest === undefined
      ? undefined
      : this.copyForRead(latest);
  }

  public getStatistics(): MultiAgentPersistenceStatistics {
    const latestRun = [...this.runsById.values()].sort(
      compareRunsDescending,
    )[0];
    const latestSnapshot = this.getLatestSnapshotInternal();

    return Object.freeze({
      retainedRunCount: this.runsById.size,
      retainedSnapshotCount: this.snapshots.length,
      totalRunWrites: this.statistics.totalRunWrites,
      totalSnapshotWrites: this.statistics.totalSnapshotWrites,
      duplicateRunWrites: this.statistics.duplicateRunWrites,
      evictedRunCount: this.statistics.evictedRunCount,
      evictedSnapshotCount: this.statistics.evictedSnapshotCount,
      ...(latestRun === undefined
        ? {}
        : { latestRunCompletedAtMs: latestRun.completedAtMs }),
      ...(latestSnapshot === undefined
        ? {}
        : {
            latestSnapshotCapturedAtMs:
              latestSnapshot.capturedAtMs,
          }),
    });
  }

  public exportState(): MultiAgentPersistenceExport {
    return deepFreeze({
      format: "QUANTUM_TRADE_AI_MULTI_AGENT_PERSISTENCE" as const,
      version: 1 as const,
      runs: Object.freeze(
        [...this.runsById.values()]
          .sort(compareRunsAscending)
          .map((result) => deepClone(result)),
      ),
      snapshots: Object.freeze(
        [...this.snapshots]
          .sort(compareSnapshotsAscending)
          .map((snapshot) => deepClone(snapshot)),
      ),
      statistics: this.getStatistics(),
    });
  }

  public importState(
    state: MultiAgentPersistenceExport,
    replaceExisting = false,
  ): void {
    validateImport(state, this.options);

    const importedRuns = state.runs
      .map((result) => this.prepareValue(result))
      .sort(compareRunsAscending);
    const importedSnapshots = state.snapshots
      .map((snapshot) => this.prepareValue(snapshot))
      .sort(compareSnapshotsAscending);

    const uniqueRunIds = new Set<MultiAgentRunId>();

    for (const result of importedRuns) {
      if (uniqueRunIds.has(result.runId)) {
        throw new MultiAgentPersistenceError(
          "IMPORT_REJECTED",
          `Import contains duplicate runId "${result.runId}".`,
          { runId: result.runId },
        );
      }

      uniqueRunIds.add(result.runId);
    }

    if (replaceExisting) {
      this.runsById.clear();
      this.snapshots.length = 0;
    }

    for (const result of importedRuns) {
      const existing = this.runsById.get(result.runId);

      if (
        existing !== undefined &&
        existing.deterministicFingerprint !==
          result.deterministicFingerprint
      ) {
        throw new MultiAgentPersistenceError(
          "IMPORT_REJECTED",
          `Import would overwrite runId "${result.runId}" with a different fingerprint.`,
          { runId: result.runId },
        );
      }

      this.runsById.set(result.runId, result);
    }

    for (const snapshot of importedSnapshots) {
      const existingIndex = this.snapshots.findIndex(
        (candidate) =>
          candidate.managerId === snapshot.managerId &&
          candidate.capturedAtMs === snapshot.capturedAtMs,
      );

      if (existingIndex >= 0) {
        this.snapshots.splice(existingIndex, 1, snapshot);
      } else {
        this.snapshots.push(snapshot);
      }
    }

    this.snapshots.sort(compareSnapshotsAscending);
    this.enforceRunCapacity();
    this.enforceSnapshotCapacity();
  }

  public deleteRun(runId: MultiAgentRunId): boolean {
    assertNonEmptyString(runId, "runId");
    return this.runsById.delete(runId);
  }

  public clearRuns(): void {
    this.runsById.clear();
  }

  public clearSnapshots(): void {
    this.snapshots.length = 0;
  }

  public clear(): void {
    this.clearRuns();
    this.clearSnapshots();
  }

  private handleDuplicateRun(
    existing: MultiAgentRunResult,
    incoming: MultiAgentRunResult,
  ): void {
    switch (this.options.duplicateRunPolicy) {
      case "REJECT":
        throw new MultiAgentPersistenceError(
          "DUPLICATE_RUN",
          `Run "${incoming.runId}" has already been persisted.`,
          { runId: incoming.runId },
        );

      case "IGNORE_IDENTICAL":
        if (
          existing.deterministicFingerprint !==
          incoming.deterministicFingerprint
        ) {
          throw new MultiAgentPersistenceError(
            "DUPLICATE_RUN",
            `Run "${incoming.runId}" already exists with a different deterministic fingerprint.`,
            {
              runId: incoming.runId,
              expected: existing.deterministicFingerprint,
              actual: incoming.deterministicFingerprint,
            },
          );
        }

        return;

      case "REPLACE":
        this.runsById.set(
          incoming.runId,
          this.prepareValue(incoming),
        );
        this.statistics.totalRunWrites += 1;
        return;

      default:
        return assertNever(this.options.duplicateRunPolicy);
    }
  }

  private enforceRunCapacity(): void {
    const overflow =
      this.runsById.size - this.options.maximumRunHistory;

    if (overflow <= 0) {
      return;
    }

    const oldest = [...this.runsById.values()]
      .sort(compareRunsAscending)
      .slice(0, overflow);

    for (const result of oldest) {
      if (this.runsById.delete(result.runId)) {
        this.statistics.evictedRunCount += 1;
      }
    }
  }

  private enforceSnapshotCapacity(): void {
    const overflow =
      this.snapshots.length - this.options.maximumSnapshotHistory;

    if (overflow <= 0) {
      return;
    }

    this.snapshots.sort(compareSnapshotsAscending);
    this.snapshots.splice(0, overflow);
    this.statistics.evictedSnapshotCount += overflow;
  }

  private getLatestSnapshotInternal():
    | MultiAgentManagerSnapshot
    | undefined {
    return [...this.snapshots].sort(compareSnapshotsDescending)[0];
  }

  private prepareValue<T>(value: T): T {
    const copy = deepClone(value);
    return this.options.freezeValues ? deepFreeze(copy) : copy;
  }

  private copyForRead<T>(value: T): T {
    const copy = deepClone(value);
    return this.options.freezeValues ? deepFreeze(copy) : copy;
  }
}

export function createMultiAgentPersistenceStore(
  options: MultiAgentPersistenceStoreOptions = {},
): MultiAgentPersistenceStore {
  return new MultiAgentPersistenceStore(options);
}

function normalizeOptions(
  options: MultiAgentPersistenceStoreOptions,
): NormalizedOptions {
  const maximumRunHistory =
    options.maximumRunHistory ?? DEFAULT_OPTIONS.maximumRunHistory;
  const maximumSnapshotHistory =
    options.maximumSnapshotHistory ??
    DEFAULT_OPTIONS.maximumSnapshotHistory;
  const duplicateRunPolicy =
    options.duplicateRunPolicy ?? DEFAULT_OPTIONS.duplicateRunPolicy;

  assertPositiveSafeInteger(
    maximumRunHistory,
    "maximumRunHistory",
  );
  assertPositiveSafeInteger(
    maximumSnapshotHistory,
    "maximumSnapshotHistory",
  );

  if (
    duplicateRunPolicy !== "REJECT" &&
    duplicateRunPolicy !== "IGNORE_IDENTICAL" &&
    duplicateRunPolicy !== "REPLACE"
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_CONFIGURATION",
      "duplicateRunPolicy must be REJECT, IGNORE_IDENTICAL, or REPLACE.",
      { field: "duplicateRunPolicy", actual: duplicateRunPolicy },
    );
  }

  return Object.freeze({
    maximumRunHistory,
    maximumSnapshotHistory,
    duplicateRunPolicy,
    requireDeterministicFingerprint:
      options.requireDeterministicFingerprint ??
      DEFAULT_OPTIONS.requireDeterministicFingerprint,
    freezeValues:
      options.freezeValues ?? DEFAULT_OPTIONS.freezeValues,
  });
}

function validateRunResult(
  result: MultiAgentRunResult,
  options: NormalizedOptions,
): void {
  if (result === null || typeof result !== "object") {
    throw new MultiAgentPersistenceError(
      "INVALID_RUN_RESULT",
      "Run result must be an object.",
      { field: "result" },
    );
  }

  assertNonEmptyString(result.runId, "result.runId");
  assertNonEmptyString(result.requestId, "result.requestId");
  assertNonEmptyString(result.sessionId, "result.sessionId");
  assertFiniteNumber(result.startedAtMs, "result.startedAtMs");
  assertFiniteNumber(result.completedAtMs, "result.completedAtMs");

  if (result.completedAtMs < result.startedAtMs) {
    throw new MultiAgentPersistenceError(
      "INVALID_RUN_RESULT",
      "completedAtMs cannot be earlier than startedAtMs.",
      {
        field: "result.completedAtMs",
        expected: `>= ${result.startedAtMs}`,
        actual: result.completedAtMs,
      },
    );
  }

  if (
    options.requireDeterministicFingerprint &&
    result.deterministicFingerprint.trim().length === 0
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_RUN_RESULT",
      "Run result requires a deterministic fingerprint.",
      { field: "result.deterministicFingerprint" },
    );
  }
}

function validateSnapshot(
  snapshot: MultiAgentManagerSnapshot,
  options: NormalizedOptions,
): void {
  if (snapshot === null || typeof snapshot !== "object") {
    throw new MultiAgentPersistenceError(
      "INVALID_SNAPSHOT",
      "Manager snapshot must be an object.",
      { field: "snapshot" },
    );
  }

  assertNonEmptyString(snapshot.managerId, "snapshot.managerId");
  assertFiniteNumber(snapshot.capturedAtMs, "snapshot.capturedAtMs");
  assertNonNegativeSafeInteger(snapshot.totalRuns, "snapshot.totalRuns");
  assertNonNegativeSafeInteger(
    snapshot.completedRuns,
    "snapshot.completedRuns",
  );
  assertNonNegativeSafeInteger(
    snapshot.rejectedRuns,
    "snapshot.rejectedRuns",
  );
  assertNonNegativeSafeInteger(
    snapshot.failedRuns,
    "snapshot.failedRuns",
  );

  if (
    snapshot.completedRuns +
      snapshot.rejectedRuns +
      snapshot.failedRuns >
    snapshot.totalRuns
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_SNAPSHOT",
      "Completed, rejected, and failed run counts cannot exceed totalRuns.",
      { field: "snapshot.totalRuns" },
    );
  }

  if (
    options.requireDeterministicFingerprint &&
    snapshot.deterministicFingerprint.trim().length === 0
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_SNAPSHOT",
      "Manager snapshot requires a deterministic fingerprint.",
      { field: "snapshot.deterministicFingerprint" },
    );
  }
}

function validateRunQuery(query: MultiAgentRunQuery): void {
  if (query.limit !== undefined) {
    assertPositiveSafeInteger(query.limit, "query.limit");
  }

  if (
    query.completedFromMs !== undefined &&
    query.completedToMs !== undefined &&
    query.completedFromMs > query.completedToMs
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_CONFIGURATION",
      "completedFromMs cannot be greater than completedToMs.",
      { field: "query.completedFromMs" },
    );
  }
}

function validateImport(
  state: MultiAgentPersistenceExport,
  options: NormalizedOptions,
): void {
  if (state === null || typeof state !== "object") {
    throw new MultiAgentPersistenceError(
      "IMPORT_REJECTED",
      "Persistence import must be an object.",
      { field: "state" },
    );
  }

  if (
    state.format !==
    "QUANTUM_TRADE_AI_MULTI_AGENT_PERSISTENCE"
  ) {
    throw new MultiAgentPersistenceError(
      "IMPORT_REJECTED",
      "Unsupported persistence import format.",
      { field: "state.format", actual: state.format },
    );
  }

  if (state.version !== 1) {
    throw new MultiAgentPersistenceError(
      "IMPORT_REJECTED",
      "Unsupported persistence import version.",
      { field: "state.version", actual: state.version },
    );
  }

  if (!Array.isArray(state.runs)) {
    throw new MultiAgentPersistenceError(
      "IMPORT_REJECTED",
      "state.runs must be an array.",
      { field: "state.runs" },
    );
  }

  if (!Array.isArray(state.snapshots)) {
    throw new MultiAgentPersistenceError(
      "IMPORT_REJECTED",
      "state.snapshots must be an array.",
      { field: "state.snapshots" },
    );
  }

  for (const result of state.runs) {
    validateRunResult(result, options);
  }

  for (const snapshot of state.snapshots) {
    validateSnapshot(snapshot, options);
  }
}

function compareRunsAscending(
  left: MultiAgentRunResult,
  right: MultiAgentRunResult,
): number {
  return (
    left.completedAtMs - right.completedAtMs ||
    left.startedAtMs - right.startedAtMs ||
    compareText(left.runId, right.runId)
  );
}

function compareRunsDescending(
  left: MultiAgentRunResult,
  right: MultiAgentRunResult,
): number {
  return (
    right.completedAtMs - left.completedAtMs ||
    right.startedAtMs - left.startedAtMs ||
    compareText(left.runId, right.runId)
  );
}

function compareSnapshotsAscending(
  left: MultiAgentManagerSnapshot,
  right: MultiAgentManagerSnapshot,
): number {
  return (
    left.capturedAtMs - right.capturedAtMs ||
    compareText(left.managerId, right.managerId) ||
    compareText(
      left.deterministicFingerprint,
      right.deterministicFingerprint,
    )
  );
}

function compareSnapshotsDescending(
  left: MultiAgentManagerSnapshot,
  right: MultiAgentManagerSnapshot,
): number {
  return (
    right.capturedAtMs - left.capturedAtMs ||
    compareText(left.managerId, right.managerId) ||
    compareText(
      left.deterministicFingerprint,
      right.deterministicFingerprint,
    )
  );
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MultiAgentPersistenceError(
      "INVALID_CONFIGURATION",
      `${field} must be a non-empty string.`,
      { field, actual: value },
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MultiAgentPersistenceError(
      "INVALID_CONFIGURATION",
      `${field} must be a finite number.`,
      { field, actual: value },
    );
  }
}

function assertPositiveSafeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_CONFIGURATION",
      `${field} must be a positive safe integer.`,
      { field, actual: value },
    );
  }
}

function assertNonNegativeSafeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MultiAgentPersistenceError(
      "INVALID_CONFIGURATION",
      `${field} must be a non-negative safe integer.`,
      { field, actual: value },
    );
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  const source = value as Readonly<Record<string, unknown>>;
  const clone: Record<string, unknown> = {};

  for (const key of Object.keys(source).sort(compareText)) {
    clone[key] = deepClone(source[key]);
  }

  return clone as T;
}

function deepFreeze<T>(
  value: T,
  seen: Set<object> = new Set<object>(),
): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;

  if (seen.has(objectValue)) {
    return value;
  }

  seen.add(objectValue);

  for (const key of Reflect.ownKeys(objectValue)) {
    const child = (value as Record<PropertyKey, unknown>)[key];

    if (
      child !== null &&
      (typeof child === "object" || typeof child === "function")
    ) {
      deepFreeze(child, seen);
    }
  }

  return Object.freeze(value);
}

function assertNever(value: never): never {
  throw new MultiAgentPersistenceError(
    "INVALID_CONFIGURATION",
    `Unsupported persistence policy: ${String(value)}.`,
  );
}