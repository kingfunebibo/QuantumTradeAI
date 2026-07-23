/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-state-store.ts
 *
 * Deterministic, immutable, in-memory state store for swarm checkpoints,
 * manager snapshots, and completed swarm runs.
 *
 * Architectural guarantees:
 * - immutable values at every public boundary
 * - deterministic ordering and retention
 * - idempotent writes for byte-equivalent state
 * - conflict detection for reused identifiers
 * - monotonic snapshot protection
 * - atomic import and batch checkpoint persistence
 * - replay-safe export and recovery support
 */

import {
  type AiTradingSwarmRunResult,
  type TradingSwarmCheckpoint,
  type TradingSwarmCheckpointId,
  type TradingSwarmCheckpointStorePort,
  type TradingSwarmClock,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmId,
  type TradingSwarmManagerSnapshot,
  type TradingSwarmPersistencePort,
  type TradingSwarmRunId,
  type TradingSwarmTimestamp,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Public contracts
 * ========================================================================== */

export type TradingSwarmStateStoreErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_CHECKPOINT"
  | "INVALID_SNAPSHOT"
  | "INVALID_RUN"
  | "CHECKPOINT_CONFLICT"
  | "SNAPSHOT_CONFLICT"
  | "RUN_CONFLICT"
  | "STALE_SNAPSHOT"
  | "CAPACITY_EXCEEDED"
  | "IMPORT_CONFLICT"
  | "INVARIANT_VIOLATION";

export class TradingSwarmStateStoreError extends Error {
  public readonly code: TradingSwarmStateStoreErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: TradingSwarmStateStoreErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "TradingSwarmStateStoreError";
    this.code = code;
    this.details =
      details === undefined
        ? undefined
        : immutableClone(details);
  }
}

export interface TradingSwarmStateStoreOptions {
  /** Maximum checkpoints retained per swarm. */
  readonly maximumCheckpointsPerSwarm?: number;

  /** Maximum completed runs retained per swarm. */
  readonly maximumRunsPerSwarm?: number;

  /** Maximum total checkpoints retained across all swarms. */
  readonly maximumTotalCheckpoints?: number;

  /** Maximum total completed runs retained across all swarms. */
  readonly maximumTotalRuns?: number;

  /** Reject a duplicate identifier when the stored payload differs. */
  readonly rejectIdentifierConflicts?: boolean;

  /** Reject snapshots older than the currently stored snapshot. */
  readonly requireMonotonicSnapshots?: boolean;

  /** Require every stored aggregate to expose a non-empty fingerprint. */
  readonly requireDeterministicFingerprint?: boolean;

  /** Remove oldest values automatically when a retention limit is reached. */
  readonly evictOldestOnCapacity?: boolean;

  /** Optional deterministic clock used for statistics and exports. */
  readonly clock?: TradingSwarmClock;

  /** Optional canonical fingerprint generator. */
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
}

export interface TradingSwarmCheckpointQuery {
  readonly swarmId?: TradingSwarmId;
  readonly minimumTerm?: number;
  readonly maximumTerm?: number;
  readonly minimumEpoch?: number;
  readonly maximumEpoch?: number;
  readonly createdAtOrAfterMs?: TradingSwarmTimestamp;
  readonly createdAtOrBeforeMs?: TradingSwarmTimestamp;
  readonly limit?: number;
  readonly order?: "ASCENDING" | "DESCENDING";
}

export interface TradingSwarmRunQuery {
  readonly swarmId?: TradingSwarmId;
  readonly missionId?: string;
  readonly requestId?: string;
  readonly completedAtOrAfterMs?: TradingSwarmTimestamp;
  readonly completedAtOrBeforeMs?: TradingSwarmTimestamp;
  readonly limit?: number;
  readonly order?: "ASCENDING" | "DESCENDING";
}

export interface TradingSwarmStateStoreStatistics {
  readonly checkpointCount: number;
  readonly snapshotCount: number;
  readonly runCount: number;
  readonly swarmCount: number;
  readonly checkpointCountBySwarm: Readonly<Record<string, number>>;
  readonly runCountBySwarm: Readonly<Record<string, number>>;
  readonly latestCheckpointIds: Readonly<Record<string, TradingSwarmCheckpointId>>;
  readonly latestSnapshotTimes: Readonly<Record<string, TradingSwarmTimestamp>>;
  readonly capturedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmStateStoreExport {
  readonly schemaVersion: "1.0.0";
  readonly checkpoints: readonly TradingSwarmCheckpoint[];
  readonly snapshots: readonly TradingSwarmManagerSnapshot[];
  readonly runs: readonly AiTradingSwarmRunResult[];
  readonly exportedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmStateStoreImportResult {
  readonly importedCheckpointCount: number;
  readonly importedSnapshotCount: number;
  readonly importedRunCount: number;
  readonly ignoredCheckpointCount: number;
  readonly ignoredSnapshotCount: number;
  readonly ignoredRunCount: number;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmStateStoreImportOptions {
  readonly mode?: "MERGE" | "REPLACE";
  readonly conflictResolution?: "REJECT" | "KEEP_EXISTING" | "USE_IMPORTED";
}

interface NormalizedStateStoreOptions {
  readonly maximumCheckpointsPerSwarm: number;
  readonly maximumRunsPerSwarm: number;
  readonly maximumTotalCheckpoints: number;
  readonly maximumTotalRuns: number;
  readonly rejectIdentifierConflicts: boolean;
  readonly requireMonotonicSnapshots: boolean;
  readonly requireDeterministicFingerprint: boolean;
  readonly evictOldestOnCapacity: boolean;
  readonly clock: TradingSwarmClock;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
}

interface MutableState {
  readonly checkpoints: Map<TradingSwarmCheckpointId, TradingSwarmCheckpoint>;
  readonly checkpointIdsBySwarm: Map<TradingSwarmId, TradingSwarmCheckpointId[]>;
  readonly latestCheckpointIdBySwarm: Map<TradingSwarmId, TradingSwarmCheckpointId>;
  readonly snapshots: Map<TradingSwarmId, TradingSwarmManagerSnapshot>;
  readonly runs: Map<TradingSwarmRunId, AiTradingSwarmRunResult>;
  readonly runIdsBySwarm: Map<TradingSwarmId, TradingSwarmRunId[]>;
}

/* ========================================================================== *
 * Store implementation
 * ========================================================================== */

export class TradingSwarmStateStore
  implements TradingSwarmCheckpointStorePort, TradingSwarmPersistencePort
{
  private readonly options: NormalizedStateStoreOptions;

  private state: MutableState = createEmptyState();

  public constructor(options: TradingSwarmStateStoreOptions = {}) {
    this.options = normalizeOptions(options);
  }

  /* ------------------------------------------------------------------------ *
   * Checkpoint port
   * ------------------------------------------------------------------------ */

  public save(checkpoint: TradingSwarmCheckpoint): void {
    this.assertCheckpoint(checkpoint);

    const stored = this.state.checkpoints.get(checkpoint.checkpointId);
    if (stored !== undefined) {
      if (equivalent(stored, checkpoint)) {
        return;
      }

      if (this.options.rejectIdentifierConflicts) {
        throw new TradingSwarmStateStoreError(
          "CHECKPOINT_CONFLICT",
          `Checkpoint identifier "${checkpoint.checkpointId}" is already associated with different state.`,
          {
            checkpointId: checkpoint.checkpointId,
            swarmId: checkpoint.swarmId,
          },
        );
      }

      this.removeCheckpointInternal(checkpoint.checkpointId);
    }

    this.ensureCheckpointCapacity(checkpoint.swarmId);

    const value = immutableClone(checkpoint);
    this.state.checkpoints.set(value.checkpointId, value);

    const ids = this.state.checkpointIdsBySwarm.get(value.swarmId) ?? [];
    this.state.checkpointIdsBySwarm.set(
      value.swarmId,
      sortCheckpointIds(
        [...ids, value.checkpointId],
        this.state.checkpoints,
      ),
    );

    this.recalculateLatestCheckpoint(value.swarmId);
    this.assertInternalInvariants();
  }

  public saveMany(checkpoints: readonly TradingSwarmCheckpoint[]): void {
    assertArray(checkpoints, "checkpoints");

    const previous = cloneMutableState(this.state);

    try {
      for (const checkpoint of checkpoints) {
        this.save(checkpoint);
      }
    } catch (error) {
      this.state = previous;
      throw error;
    }
  }

  public load(
    checkpointId: TradingSwarmCheckpointId,
  ): TradingSwarmCheckpoint | undefined {
    assertNonEmptyText(checkpointId, "checkpointId");
    const checkpoint = this.state.checkpoints.get(checkpointId);
    return checkpoint === undefined
      ? undefined
      : immutableClone(checkpoint);
  }

  public latest(swarmId: TradingSwarmId): TradingSwarmCheckpoint | undefined {
    assertNonEmptyText(swarmId, "swarmId");
    const checkpointId = this.state.latestCheckpointIdBySwarm.get(swarmId);
    return checkpointId === undefined
      ? undefined
      : this.load(checkpointId);
  }

  public listCheckpoints(
    query: TradingSwarmCheckpointQuery = {},
  ): readonly TradingSwarmCheckpoint[] {
    validateCheckpointQuery(query);

    let values = [...this.state.checkpoints.values()].filter((checkpoint) => {
      if (query.swarmId !== undefined && checkpoint.swarmId !== query.swarmId) {
        return false;
      }
      if (query.minimumTerm !== undefined && checkpoint.term < query.minimumTerm) {
        return false;
      }
      if (query.maximumTerm !== undefined && checkpoint.term > query.maximumTerm) {
        return false;
      }
      if (query.minimumEpoch !== undefined && checkpoint.epoch < query.minimumEpoch) {
        return false;
      }
      if (query.maximumEpoch !== undefined && checkpoint.epoch > query.maximumEpoch) {
        return false;
      }
      if (
        query.createdAtOrAfterMs !== undefined &&
        checkpoint.createdAtMs < query.createdAtOrAfterMs
      ) {
        return false;
      }
      if (
        query.createdAtOrBeforeMs !== undefined &&
        checkpoint.createdAtMs > query.createdAtOrBeforeMs
      ) {
        return false;
      }
      return true;
    });

    values.sort(compareCheckpoints);
    if ((query.order ?? "ASCENDING") === "DESCENDING") {
      values.reverse();
    }
    if (query.limit !== undefined) {
      values = values.slice(0, query.limit);
    }

    return Object.freeze(values.map(immutableClone));
  }

  public deleteCheckpoint(checkpointId: TradingSwarmCheckpointId): boolean {
    assertNonEmptyText(checkpointId, "checkpointId");
    const removed = this.removeCheckpointInternal(checkpointId);
    if (removed) {
      this.assertInternalInvariants();
    }
    return removed;
  }

  public deleteCheckpointsForSwarm(swarmId: TradingSwarmId): number {
    assertNonEmptyText(swarmId, "swarmId");
    const ids = [...(this.state.checkpointIdsBySwarm.get(swarmId) ?? [])];
    for (const id of ids) {
      this.removeCheckpointInternal(id);
    }
    this.assertInternalInvariants();
    return ids.length;
  }

  /* ------------------------------------------------------------------------ *
   * Persistence port
   * ------------------------------------------------------------------------ */

  public saveRun(result: AiTradingSwarmRunResult): void {
    this.assertRun(result);

    const stored = this.state.runs.get(result.runId);
    if (stored !== undefined) {
      if (equivalent(stored, result)) {
        return;
      }

      if (this.options.rejectIdentifierConflicts) {
        throw new TradingSwarmStateStoreError(
          "RUN_CONFLICT",
          `Run identifier "${result.runId}" is already associated with a different result.`,
          { runId: result.runId, swarmId: result.swarmId },
        );
      }

      this.removeRunInternal(result.runId);
    }

    this.ensureRunCapacity(result.swarmId);

    const value = immutableClone(result);
    this.state.runs.set(value.runId, value);

    const ids = this.state.runIdsBySwarm.get(value.swarmId) ?? [];
    this.state.runIdsBySwarm.set(
      value.swarmId,
      sortRunIds([...ids, value.runId], this.state.runs),
    );

    this.assertInternalInvariants();
  }

  public saveSnapshot(snapshot: TradingSwarmManagerSnapshot): void {
    this.assertSnapshot(snapshot);

    const swarmId = snapshot.swarm.swarmId;
    const stored = this.state.snapshots.get(swarmId);

    if (stored !== undefined) {
      if (equivalent(stored, snapshot)) {
        return;
      }

      if (
        this.options.requireMonotonicSnapshots &&
        compareSnapshots(snapshot, stored) < 0
      ) {
        throw new TradingSwarmStateStoreError(
          "STALE_SNAPSHOT",
          `Snapshot for swarm "${swarmId}" is older than the currently stored snapshot.`,
          {
            swarmId,
            storedCapturedAtMs: stored.capturedAtMs,
            incomingCapturedAtMs: snapshot.capturedAtMs,
            storedTopologyVersion: stored.topology.topologyVersion,
            incomingTopologyVersion: snapshot.topology.topologyVersion,
          },
        );
      }

      if (
        this.options.rejectIdentifierConflicts &&
        compareSnapshots(snapshot, stored) === 0
      ) {
        throw new TradingSwarmStateStoreError(
          "SNAPSHOT_CONFLICT",
          `Snapshot coordinates for swarm "${swarmId}" already identify different state.`,
          {
            swarmId,
            capturedAtMs: snapshot.capturedAtMs,
            topologyVersion: snapshot.topology.topologyVersion,
          },
        );
      }
    }

    this.state.snapshots.set(swarmId, immutableClone(snapshot));
    this.assertInternalInvariants();
  }

  public loadSnapshot(
    swarmId: TradingSwarmId,
  ): TradingSwarmManagerSnapshot | undefined {
    assertNonEmptyText(swarmId, "swarmId");
    const snapshot = this.state.snapshots.get(swarmId);
    return snapshot === undefined
      ? undefined
      : immutableClone(snapshot);
  }

  public loadRun(runId: TradingSwarmRunId): AiTradingSwarmRunResult | undefined {
    assertNonEmptyText(runId, "runId");
    const run = this.state.runs.get(runId);
    return run === undefined ? undefined : immutableClone(run);
  }

  public latestRun(swarmId: TradingSwarmId): AiTradingSwarmRunResult | undefined {
    assertNonEmptyText(swarmId, "swarmId");
    const ids = this.state.runIdsBySwarm.get(swarmId);
    if (ids === undefined || ids.length === 0) {
      return undefined;
    }
    return this.loadRun(ids[ids.length - 1]);
  }

  public listRuns(
    query: TradingSwarmRunQuery = {},
  ): readonly AiTradingSwarmRunResult[] {
    validateRunQuery(query);

    let values = [...this.state.runs.values()].filter((run) => {
      if (query.swarmId !== undefined && run.swarmId !== query.swarmId) {
        return false;
      }
      if (query.missionId !== undefined && run.mission.missionId !== query.missionId) {
        return false;
      }
      if (query.requestId !== undefined && run.requestId !== query.requestId) {
        return false;
      }
      if (
        query.completedAtOrAfterMs !== undefined &&
        run.completedAtMs < query.completedAtOrAfterMs
      ) {
        return false;
      }
      if (
        query.completedAtOrBeforeMs !== undefined &&
        run.completedAtMs > query.completedAtOrBeforeMs
      ) {
        return false;
      }
      return true;
    });

    values.sort(compareRuns);
    if ((query.order ?? "ASCENDING") === "DESCENDING") {
      values.reverse();
    }
    if (query.limit !== undefined) {
      values = values.slice(0, query.limit);
    }

    return Object.freeze(values.map(immutableClone));
  }

  public deleteRun(runId: TradingSwarmRunId): boolean {
    assertNonEmptyText(runId, "runId");
    const removed = this.removeRunInternal(runId);
    if (removed) {
      this.assertInternalInvariants();
    }
    return removed;
  }

  public deleteSnapshot(swarmId: TradingSwarmId): boolean {
    assertNonEmptyText(swarmId, "swarmId");
    return this.state.snapshots.delete(swarmId);
  }

  public deleteRunsForSwarm(swarmId: TradingSwarmId): number {
    assertNonEmptyText(swarmId, "swarmId");
    const ids = [...(this.state.runIdsBySwarm.get(swarmId) ?? [])];
    for (const id of ids) {
      this.removeRunInternal(id);
    }
    this.assertInternalInvariants();
    return ids.length;
  }

  /* ------------------------------------------------------------------------ *
   * State transfer and administration
   * ------------------------------------------------------------------------ */

  public exportState(): TradingSwarmStateStoreExport {
    const exportedAtMs = this.options.clock.now();
    const checkpoints = this.listCheckpoints();
    const snapshots = Object.freeze(
      [...this.state.snapshots.values()]
        .sort((left, right) => compareText(left.swarm.swarmId, right.swarm.swarmId))
        .map(immutableClone),
    );
    const runs = this.listRuns();

    const deterministicFingerprint = this.options.fingerprintGenerator.fingerprint({
      schemaVersion: "1.0.0",
      checkpoints,
      snapshots,
      runs,
      exportedAtMs,
    });

    return deepFreeze({
      schemaVersion: "1.0.0" as const,
      checkpoints,
      snapshots,
      runs,
      exportedAtMs,
      deterministicFingerprint,
    });
  }

  public importState(
    input: TradingSwarmStateStoreExport,
    options: TradingSwarmStateStoreImportOptions = {},
  ): TradingSwarmStateStoreImportResult {
    this.assertExport(input);

    const mode = options.mode ?? "MERGE";
    const conflictResolution = options.conflictResolution ?? "REJECT";
    const previous = cloneMutableState(this.state);

    if (mode === "REPLACE") {
      this.state = createEmptyState();
    }

    let importedCheckpointCount = 0;
    let importedSnapshotCount = 0;
    let importedRunCount = 0;
    let ignoredCheckpointCount = 0;
    let ignoredSnapshotCount = 0;
    let ignoredRunCount = 0;

    try {
      for (const checkpoint of input.checkpoints) {
        const existing = this.state.checkpoints.get(checkpoint.checkpointId);
        if (existing !== undefined && !equivalent(existing, checkpoint)) {
          if (conflictResolution === "KEEP_EXISTING") {
            ignoredCheckpointCount += 1;
            continue;
          }
          if (conflictResolution === "REJECT") {
            throw new TradingSwarmStateStoreError(
              "IMPORT_CONFLICT",
              `Imported checkpoint "${checkpoint.checkpointId}" conflicts with existing state.`,
              { checkpointId: checkpoint.checkpointId },
            );
          }
          this.removeCheckpointInternal(checkpoint.checkpointId);
        } else if (existing !== undefined) {
          ignoredCheckpointCount += 1;
          continue;
        }

        this.save(checkpoint);
        importedCheckpointCount += 1;
      }

      for (const snapshot of input.snapshots) {
        const swarmId = snapshot.swarm.swarmId;
        const existing = this.state.snapshots.get(swarmId);
        if (existing !== undefined && !equivalent(existing, snapshot)) {
          if (conflictResolution === "KEEP_EXISTING") {
            ignoredSnapshotCount += 1;
            continue;
          }
          if (conflictResolution === "REJECT") {
            throw new TradingSwarmStateStoreError(
              "IMPORT_CONFLICT",
              `Imported snapshot for swarm "${swarmId}" conflicts with existing state.`,
              { swarmId },
            );
          }
          this.state.snapshots.delete(swarmId);
        } else if (existing !== undefined) {
          ignoredSnapshotCount += 1;
          continue;
        }

        this.saveSnapshot(snapshot);
        importedSnapshotCount += 1;
      }

      for (const run of input.runs) {
        const existing = this.state.runs.get(run.runId);
        if (existing !== undefined && !equivalent(existing, run)) {
          if (conflictResolution === "KEEP_EXISTING") {
            ignoredRunCount += 1;
            continue;
          }
          if (conflictResolution === "REJECT") {
            throw new TradingSwarmStateStoreError(
              "IMPORT_CONFLICT",
              `Imported run "${run.runId}" conflicts with existing state.`,
              { runId: run.runId },
            );
          }
          this.removeRunInternal(run.runId);
        } else if (existing !== undefined) {
          ignoredRunCount += 1;
          continue;
        }

        this.saveRun(run);
        importedRunCount += 1;
      }

      this.assertInternalInvariants();
    } catch (error) {
      this.state = previous;
      throw error;
    }

    const resultBase = {
      importedCheckpointCount,
      importedSnapshotCount,
      importedRunCount,
      ignoredCheckpointCount,
      ignoredSnapshotCount,
      ignoredRunCount,
    };

    return deepFreeze({
      ...resultBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(resultBase),
    });
  }

  public statistics(): TradingSwarmStateStoreStatistics {
    const capturedAtMs = this.options.clock.now();
    const swarmIds = new Set<string>();

    for (const swarmId of this.state.checkpointIdsBySwarm.keys()) {
      swarmIds.add(swarmId);
    }
    for (const swarmId of this.state.runIdsBySwarm.keys()) {
      swarmIds.add(swarmId);
    }
    for (const swarmId of this.state.snapshots.keys()) {
      swarmIds.add(swarmId);
    }

    const checkpointCountBySwarm: Record<string, number> = {};
    const runCountBySwarm: Record<string, number> = {};
    const latestCheckpointIds: Record<string, TradingSwarmCheckpointId> = {};
    const latestSnapshotTimes: Record<string, TradingSwarmTimestamp> = {};

    for (const swarmId of [...swarmIds].sort(compareText)) {
      checkpointCountBySwarm[swarmId] =
        this.state.checkpointIdsBySwarm.get(swarmId)?.length ?? 0;
      runCountBySwarm[swarmId] =
        this.state.runIdsBySwarm.get(swarmId)?.length ?? 0;

      const latestCheckpointId =
        this.state.latestCheckpointIdBySwarm.get(swarmId);
      if (latestCheckpointId !== undefined) {
        latestCheckpointIds[swarmId] = latestCheckpointId;
      }

      const snapshot = this.state.snapshots.get(swarmId);
      if (snapshot !== undefined) {
        latestSnapshotTimes[swarmId] = snapshot.capturedAtMs;
      }
    }

    const base = {
      checkpointCount: this.state.checkpoints.size,
      snapshotCount: this.state.snapshots.size,
      runCount: this.state.runs.size,
      swarmCount: swarmIds.size,
      checkpointCountBySwarm: deepFreeze(checkpointCountBySwarm),
      runCountBySwarm: deepFreeze(runCountBySwarm),
      latestCheckpointIds: deepFreeze(latestCheckpointIds),
      latestSnapshotTimes: deepFreeze(latestSnapshotTimes),
      capturedAtMs,
    };

    return deepFreeze({
      ...base,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(base),
    });
  }

  public clear(): void {
    this.state = createEmptyState();
  }

  public clearSwarm(swarmId: TradingSwarmId): void {
    assertNonEmptyText(swarmId, "swarmId");
    this.deleteCheckpointsForSwarm(swarmId);
    this.deleteRunsForSwarm(swarmId);
    this.state.snapshots.delete(swarmId);
    this.assertInternalInvariants();
  }

  public hasCheckpoint(checkpointId: TradingSwarmCheckpointId): boolean {
    assertNonEmptyText(checkpointId, "checkpointId");
    return this.state.checkpoints.has(checkpointId);
  }

  public hasRun(runId: TradingSwarmRunId): boolean {
    assertNonEmptyText(runId, "runId");
    return this.state.runs.has(runId);
  }

  public hasSnapshot(swarmId: TradingSwarmId): boolean {
    assertNonEmptyText(swarmId, "swarmId");
    return this.state.snapshots.has(swarmId);
  }

  /* ------------------------------------------------------------------------ *
   * Internal validation and retention
   * ------------------------------------------------------------------------ */

  private assertCheckpoint(checkpoint: TradingSwarmCheckpoint): void {
    if (checkpoint === null || typeof checkpoint !== "object") {
      throw new TradingSwarmStateStoreError(
        "INVALID_CHECKPOINT",
        "checkpoint must be an object.",
      );
    }

    assertNonEmptyText(checkpoint.checkpointId, "checkpoint.checkpointId");
    assertNonEmptyText(checkpoint.swarmId, "checkpoint.swarmId");
    assertNonNegativeInteger(checkpoint.term, "checkpoint.term");
    assertNonNegativeInteger(checkpoint.epoch, "checkpoint.epoch");
    assertNonNegativeInteger(checkpoint.createdAtMs, "checkpoint.createdAtMs");

    if (checkpoint.topology.swarmId !== checkpoint.swarmId) {
      throw new TradingSwarmStateStoreError(
        "INVALID_CHECKPOINT",
        "checkpoint.topology.swarmId must equal checkpoint.swarmId.",
        {
          checkpointSwarmId: checkpoint.swarmId,
          topologySwarmId: checkpoint.topology.swarmId,
        },
      );
    }

    if (checkpoint.topology.term !== checkpoint.term) {
      throw new TradingSwarmStateStoreError(
        "INVALID_CHECKPOINT",
        "checkpoint.topology.term must equal checkpoint.term.",
      );
    }

    if (checkpoint.topology.epoch !== checkpoint.epoch) {
      throw new TradingSwarmStateStoreError(
        "INVALID_CHECKPOINT",
        "checkpoint.topology.epoch must equal checkpoint.epoch.",
      );
    }

    this.assertFingerprint(
      checkpoint.deterministicFingerprint,
      "checkpoint.deterministicFingerprint",
      "INVALID_CHECKPOINT",
    );
  }

  private assertSnapshot(snapshot: TradingSwarmManagerSnapshot): void {
    if (snapshot === null || typeof snapshot !== "object") {
      throw new TradingSwarmStateStoreError(
        "INVALID_SNAPSHOT",
        "snapshot must be an object.",
      );
    }

    assertNonEmptyText(snapshot.swarm.swarmId, "snapshot.swarm.swarmId");
    assertNonNegativeInteger(snapshot.capturedAtMs, "snapshot.capturedAtMs");

    if (snapshot.topology.swarmId !== snapshot.swarm.swarmId) {
      throw new TradingSwarmStateStoreError(
        "INVALID_SNAPSHOT",
        "snapshot.topology.swarmId must equal snapshot.swarm.swarmId.",
      );
    }

    if (
      snapshot.latestCheckpointId !== undefined &&
      snapshot.latestCheckpointId.trim().length === 0
    ) {
      throw new TradingSwarmStateStoreError(
        "INVALID_SNAPSHOT",
        "snapshot.latestCheckpointId must be non-empty when provided.",
      );
    }

    this.assertFingerprint(
      snapshot.deterministicFingerprint,
      "snapshot.deterministicFingerprint",
      "INVALID_SNAPSHOT",
    );
  }

  private assertRun(result: AiTradingSwarmRunResult): void {
    if (result === null || typeof result !== "object") {
      throw new TradingSwarmStateStoreError(
        "INVALID_RUN",
        "result must be an object.",
      );
    }

    assertNonEmptyText(result.runId, "result.runId");
    assertNonEmptyText(result.requestId, "result.requestId");
    assertNonEmptyText(result.swarmId, "result.swarmId");
    assertNonNegativeInteger(result.startedAtMs, "result.startedAtMs");
    assertNonNegativeInteger(result.completedAtMs, "result.completedAtMs");

    if (result.completedAtMs < result.startedAtMs) {
      throw new TradingSwarmStateStoreError(
        "INVALID_RUN",
        "result.completedAtMs must be greater than or equal to result.startedAtMs.",
      );
    }

    if (result.mission.swarmId !== result.swarmId) {
      throw new TradingSwarmStateStoreError(
        "INVALID_RUN",
        "result.mission.swarmId must equal result.swarmId.",
      );
    }

    if (result.mission.runId !== result.runId) {
      throw new TradingSwarmStateStoreError(
        "INVALID_RUN",
        "result.mission.runId must equal result.runId.",
      );
    }

    this.assertFingerprint(
      result.deterministicFingerprint,
      "result.deterministicFingerprint",
      "INVALID_RUN",
    );
  }

  private assertExport(input: TradingSwarmStateStoreExport): void {
    if (input === null || typeof input !== "object") {
      throw new TradingSwarmStateStoreError(
        "INVALID_CONFIGURATION",
        "import input must be an object.",
      );
    }
    if (input.schemaVersion !== "1.0.0") {
      throw new TradingSwarmStateStoreError(
        "INVALID_CONFIGURATION",
        `Unsupported state-store schema version "${String(input.schemaVersion)}".`,
      );
    }
    assertArray(input.checkpoints, "input.checkpoints");
    assertArray(input.snapshots, "input.snapshots");
    assertArray(input.runs, "input.runs");
    assertNonNegativeInteger(input.exportedAtMs, "input.exportedAtMs");
    this.assertFingerprint(
      input.deterministicFingerprint,
      "input.deterministicFingerprint",
      "INVALID_CONFIGURATION",
    );
  }

  private assertFingerprint(
    fingerprint: string,
    name: string,
    code: TradingSwarmStateStoreErrorCode,
  ): void {
    if (
      this.options.requireDeterministicFingerprint &&
      (typeof fingerprint !== "string" || fingerprint.trim().length === 0)
    ) {
      throw new TradingSwarmStateStoreError(
        code,
        `${name} must be a non-empty string.`,
      );
    }
  }

  private ensureCheckpointCapacity(swarmId: TradingSwarmId): void {
    const swarmIds = this.state.checkpointIdsBySwarm.get(swarmId) ?? [];

    if (swarmIds.length >= this.options.maximumCheckpointsPerSwarm) {
      if (!this.options.evictOldestOnCapacity) {
        throw new TradingSwarmStateStoreError(
          "CAPACITY_EXCEEDED",
          `Checkpoint capacity for swarm "${swarmId}" has been reached.`,
        );
      }
      this.removeCheckpointInternal(swarmIds[0]);
    }

    if (this.state.checkpoints.size >= this.options.maximumTotalCheckpoints) {
      if (!this.options.evictOldestOnCapacity) {
        throw new TradingSwarmStateStoreError(
          "CAPACITY_EXCEEDED",
          "Global checkpoint capacity has been reached.",
        );
      }
      const oldest = [...this.state.checkpoints.values()].sort(compareCheckpoints)[0];
      if (oldest !== undefined) {
        this.removeCheckpointInternal(oldest.checkpointId);
      }
    }
  }

  private ensureRunCapacity(swarmId: TradingSwarmId): void {
    const swarmIds = this.state.runIdsBySwarm.get(swarmId) ?? [];

    if (swarmIds.length >= this.options.maximumRunsPerSwarm) {
      if (!this.options.evictOldestOnCapacity) {
        throw new TradingSwarmStateStoreError(
          "CAPACITY_EXCEEDED",
          `Run capacity for swarm "${swarmId}" has been reached.`,
        );
      }
      this.removeRunInternal(swarmIds[0]);
    }

    if (this.state.runs.size >= this.options.maximumTotalRuns) {
      if (!this.options.evictOldestOnCapacity) {
        throw new TradingSwarmStateStoreError(
          "CAPACITY_EXCEEDED",
          "Global run capacity has been reached.",
        );
      }
      const oldest = [...this.state.runs.values()].sort(compareRuns)[0];
      if (oldest !== undefined) {
        this.removeRunInternal(oldest.runId);
      }
    }
  }

  private removeCheckpointInternal(checkpointId: TradingSwarmCheckpointId): boolean {
    const checkpoint = this.state.checkpoints.get(checkpointId);
    if (checkpoint === undefined) {
      return false;
    }

    this.state.checkpoints.delete(checkpointId);
    const ids = (this.state.checkpointIdsBySwarm.get(checkpoint.swarmId) ?? [])
      .filter((id) => id !== checkpointId);

    if (ids.length === 0) {
      this.state.checkpointIdsBySwarm.delete(checkpoint.swarmId);
      this.state.latestCheckpointIdBySwarm.delete(checkpoint.swarmId);
    } else {
      this.state.checkpointIdsBySwarm.set(checkpoint.swarmId, ids);
      this.recalculateLatestCheckpoint(checkpoint.swarmId);
    }

    return true;
  }

  private removeRunInternal(runId: TradingSwarmRunId): boolean {
    const run = this.state.runs.get(runId);
    if (run === undefined) {
      return false;
    }

    this.state.runs.delete(runId);
    const ids = (this.state.runIdsBySwarm.get(run.swarmId) ?? [])
      .filter((id) => id !== runId);

    if (ids.length === 0) {
      this.state.runIdsBySwarm.delete(run.swarmId);
    } else {
      this.state.runIdsBySwarm.set(run.swarmId, ids);
    }

    return true;
  }

  private recalculateLatestCheckpoint(swarmId: TradingSwarmId): void {
    const ids = this.state.checkpointIdsBySwarm.get(swarmId) ?? [];
    if (ids.length === 0) {
      this.state.latestCheckpointIdBySwarm.delete(swarmId);
      return;
    }
    this.state.latestCheckpointIdBySwarm.set(swarmId, ids[ids.length - 1]);
  }

  private assertInternalInvariants(): void {
    for (const [swarmId, ids] of this.state.checkpointIdsBySwarm) {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) {
          this.invariantFailure("Checkpoint index contains a duplicate identifier.", {
            swarmId,
            checkpointId: id,
          });
        }
        seen.add(id);
        const checkpoint = this.state.checkpoints.get(id);
        if (checkpoint === undefined || checkpoint.swarmId !== swarmId) {
          this.invariantFailure("Checkpoint index references inconsistent state.", {
            swarmId,
            checkpointId: id,
          });
        }
      }

      const sorted = sortCheckpointIds(ids, this.state.checkpoints);
      if (!sameTextArray(ids, sorted)) {
        this.invariantFailure("Checkpoint index is not deterministically ordered.", {
          swarmId,
        });
      }

      if (this.state.latestCheckpointIdBySwarm.get(swarmId) !== ids[ids.length - 1]) {
        this.invariantFailure("Latest checkpoint index is inconsistent.", { swarmId });
      }
    }

    for (const [checkpointId, checkpoint] of this.state.checkpoints) {
      if (!(this.state.checkpointIdsBySwarm.get(checkpoint.swarmId) ?? []).includes(checkpointId)) {
        this.invariantFailure("Stored checkpoint is absent from its swarm index.", {
          checkpointId,
          swarmId: checkpoint.swarmId,
        });
      }
    }

    for (const [swarmId, ids] of this.state.runIdsBySwarm) {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) {
          this.invariantFailure("Run index contains a duplicate identifier.", {
            swarmId,
            runId: id,
          });
        }
        seen.add(id);
        const run = this.state.runs.get(id);
        if (run === undefined || run.swarmId !== swarmId) {
          this.invariantFailure("Run index references inconsistent state.", {
            swarmId,
            runId: id,
          });
        }
      }

      const sorted = sortRunIds(ids, this.state.runs);
      if (!sameTextArray(ids, sorted)) {
        this.invariantFailure("Run index is not deterministically ordered.", { swarmId });
      }
    }

    for (const [runId, run] of this.state.runs) {
      if (!(this.state.runIdsBySwarm.get(run.swarmId) ?? []).includes(runId)) {
        this.invariantFailure("Stored run is absent from its swarm index.", {
          runId,
          swarmId: run.swarmId,
        });
      }
    }
  }

  private invariantFailure(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): never {
    throw new TradingSwarmStateStoreError(
      "INVARIANT_VIOLATION",
      message,
      details,
    );
  }
}

/* ========================================================================== *
 * Factories
 * ========================================================================== */

export function createTradingSwarmStateStore(
  options: TradingSwarmStateStoreOptions = {},
): TradingSwarmStateStore {
  return new TradingSwarmStateStore(options);
}

export function createTradingSwarmCheckpointStore(
  options: TradingSwarmStateStoreOptions = {},
): TradingSwarmCheckpointStorePort {
  return new TradingSwarmStateStore(options);
}

export function createTradingSwarmPersistenceStore(
  options: TradingSwarmStateStoreOptions = {},
): TradingSwarmPersistencePort {
  return new TradingSwarmStateStore(options);
}

/* ========================================================================== *
 * Normalization and validation helpers
 * ========================================================================== */

function normalizeOptions(
  options: TradingSwarmStateStoreOptions,
): NormalizedStateStoreOptions {
  const maximumCheckpointsPerSwarm = options.maximumCheckpointsPerSwarm ?? 128;
  const maximumRunsPerSwarm = options.maximumRunsPerSwarm ?? 256;
  const maximumTotalCheckpoints = options.maximumTotalCheckpoints ?? 4_096;
  const maximumTotalRuns = options.maximumTotalRuns ?? 8_192;

  assertPositiveInteger(maximumCheckpointsPerSwarm, "maximumCheckpointsPerSwarm");
  assertPositiveInteger(maximumRunsPerSwarm, "maximumRunsPerSwarm");
  assertPositiveInteger(maximumTotalCheckpoints, "maximumTotalCheckpoints");
  assertPositiveInteger(maximumTotalRuns, "maximumTotalRuns");

  if (maximumTotalCheckpoints < maximumCheckpointsPerSwarm) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      "maximumTotalCheckpoints must be greater than or equal to maximumCheckpointsPerSwarm.",
    );
  }

  if (maximumTotalRuns < maximumRunsPerSwarm) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      "maximumTotalRuns must be greater than or equal to maximumRunsPerSwarm.",
    );
  }

  return deepFreeze({
    maximumCheckpointsPerSwarm,
    maximumRunsPerSwarm,
    maximumTotalCheckpoints,
    maximumTotalRuns,
    rejectIdentifierConflicts: options.rejectIdentifierConflicts ?? true,
    requireMonotonicSnapshots: options.requireMonotonicSnapshots ?? true,
    requireDeterministicFingerprint:
      options.requireDeterministicFingerprint ?? true,
    evictOldestOnCapacity: options.evictOldestOnCapacity ?? true,
    clock: options.clock ?? systemClock,
    fingerprintGenerator:
      options.fingerprintGenerator ?? deterministicFingerprintGenerator,
  });
}

function validateCheckpointQuery(query: TradingSwarmCheckpointQuery): void {
  if (query.swarmId !== undefined) {
    assertNonEmptyText(query.swarmId, "query.swarmId");
  }
  validateOptionalNonNegativeInteger(query.minimumTerm, "query.minimumTerm");
  validateOptionalNonNegativeInteger(query.maximumTerm, "query.maximumTerm");
  validateOptionalNonNegativeInteger(query.minimumEpoch, "query.minimumEpoch");
  validateOptionalNonNegativeInteger(query.maximumEpoch, "query.maximumEpoch");
  validateOptionalNonNegativeInteger(
    query.createdAtOrAfterMs,
    "query.createdAtOrAfterMs",
  );
  validateOptionalNonNegativeInteger(
    query.createdAtOrBeforeMs,
    "query.createdAtOrBeforeMs",
  );
  validateOptionalPositiveInteger(query.limit, "query.limit");

  if (
    query.minimumTerm !== undefined &&
    query.maximumTerm !== undefined &&
    query.minimumTerm > query.maximumTerm
  ) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      "query.minimumTerm must not exceed query.maximumTerm.",
    );
  }

  if (
    query.minimumEpoch !== undefined &&
    query.maximumEpoch !== undefined &&
    query.minimumEpoch > query.maximumEpoch
  ) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      "query.minimumEpoch must not exceed query.maximumEpoch.",
    );
  }
}

function validateRunQuery(query: TradingSwarmRunQuery): void {
  if (query.swarmId !== undefined) {
    assertNonEmptyText(query.swarmId, "query.swarmId");
  }
  if (query.missionId !== undefined) {
    assertNonEmptyText(query.missionId, "query.missionId");
  }
  if (query.requestId !== undefined) {
    assertNonEmptyText(query.requestId, "query.requestId");
  }
  validateOptionalNonNegativeInteger(
    query.completedAtOrAfterMs,
    "query.completedAtOrAfterMs",
  );
  validateOptionalNonNegativeInteger(
    query.completedAtOrBeforeMs,
    "query.completedAtOrBeforeMs",
  );
  validateOptionalPositiveInteger(query.limit, "query.limit");
}

function createEmptyState(): MutableState {
  return {
    checkpoints: new Map(),
    checkpointIdsBySwarm: new Map(),
    latestCheckpointIdBySwarm: new Map(),
    snapshots: new Map(),
    runs: new Map(),
    runIdsBySwarm: new Map(),
  };
}

function cloneMutableState(source: MutableState): MutableState {
  return {
    checkpoints: new Map(source.checkpoints),
    checkpointIdsBySwarm: new Map(
      [...source.checkpointIdsBySwarm].map(([key, value]) => [key, [...value]]),
    ),
    latestCheckpointIdBySwarm: new Map(source.latestCheckpointIdBySwarm),
    snapshots: new Map(source.snapshots),
    runs: new Map(source.runs),
    runIdsBySwarm: new Map(
      [...source.runIdsBySwarm].map(([key, value]) => [key, [...value]]),
    ),
  };
}

function sortCheckpointIds(
  ids: readonly TradingSwarmCheckpointId[],
  checkpoints: ReadonlyMap<TradingSwarmCheckpointId, TradingSwarmCheckpoint>,
): TradingSwarmCheckpointId[] {
  return [...ids].sort((leftId, rightId) => {
    const left = checkpoints.get(leftId);
    const right = checkpoints.get(rightId);
    if (left === undefined || right === undefined) {
      return compareText(leftId, rightId);
    }
    return compareCheckpoints(left, right);
  });
}

function sortRunIds(
  ids: readonly TradingSwarmRunId[],
  runs: ReadonlyMap<TradingSwarmRunId, AiTradingSwarmRunResult>,
): TradingSwarmRunId[] {
  return [...ids].sort((leftId, rightId) => {
    const left = runs.get(leftId);
    const right = runs.get(rightId);
    if (left === undefined || right === undefined) {
      return compareText(leftId, rightId);
    }
    return compareRuns(left, right);
  });
}

function compareCheckpoints(
  left: TradingSwarmCheckpoint,
  right: TradingSwarmCheckpoint,
): number {
  return (
    compareText(left.swarmId, right.swarmId) ||
    left.term - right.term ||
    left.epoch - right.epoch ||
    left.createdAtMs - right.createdAtMs ||
    compareText(left.checkpointId, right.checkpointId)
  );
}

function compareRuns(
  left: AiTradingSwarmRunResult,
  right: AiTradingSwarmRunResult,
): number {
  return (
    compareText(left.swarmId, right.swarmId) ||
    left.completedAtMs - right.completedAtMs ||
    left.startedAtMs - right.startedAtMs ||
    compareText(left.runId, right.runId)
  );
}

function compareSnapshots(
  left: TradingSwarmManagerSnapshot,
  right: TradingSwarmManagerSnapshot,
): number {
  return (
    left.capturedAtMs - right.capturedAtMs ||
    left.topology.term - right.topology.term ||
    left.topology.epoch - right.topology.epoch ||
    left.topology.topologyVersion - right.topology.topologyVersion
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameTextArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function equivalent(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function assertArray(
  value: unknown,
  name: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      `${name} must be an array.`,
      { name },
    );
  }
}

function assertNonEmptyText(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      `${name} must be a non-empty string.`,
      { name, value },
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  name: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      `${name} must be a positive integer.`,
      { name, value },
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  name: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TradingSwarmStateStoreError(
      "INVALID_CONFIGURATION",
      `${name} must be a non-negative integer.`,
      { name, value },
    );
  }
}

function validateOptionalPositiveInteger(
  value: number | undefined,
  name: string,
): void {
  if (value !== undefined) {
    assertPositiveInteger(value, name);
  }
}

function validateOptionalNonNegativeInteger(
  value: number | undefined,
  name: string,
): void {
  if (value !== undefined) {
    assertNonNegativeInteger(value, name);
  }
}

/* ========================================================================== *
 * Immutability and deterministic serialization
 * ========================================================================== */

function immutableClone<TValue>(value: TValue): TValue {
  return deepFreeze(cloneValue(value));
}

function cloneValue<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as TValue;
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as object)) {
    output[key] = cloneValue((value as Record<string, unknown>)[key]);
  }
  return output as TValue;
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
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return Object.freeze(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value));
}

function normalizeForStableJson(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForStableJson);
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareText)) {
      const item = (value as Record<string, unknown>)[key];
      if (typeof item === "function" || typeof item === "symbol") {
        continue;
      }
      output[key] = normalizeForStableJson(item);
    }
    return output;
  }

  return String(value);
}

const systemClock: TradingSwarmClock = Object.freeze({
  now(): TradingSwarmTimestamp {
    return Date.now() as TradingSwarmTimestamp;
  },
});

const deterministicFingerprintGenerator: TradingSwarmFingerprintGenerator =
  Object.freeze({
    fingerprint(value: unknown): string {
      const input = stableStringify(value);
      let hash = 2_166_136_261;

      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
      }

      return `swarm-state-${(hash >>> 0).toString(16).padStart(8, "0")}`;
    },
  });