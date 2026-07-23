/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/trading-swarm-registry.ts
 *
 * Deterministic in-memory registry for swarm membership, node health, leadership,
 * partitions, leases, and immutable topology snapshots.
 */

import {
  type TradingSwarmAvailability,
  type TradingSwarmCapability,
  type TradingSwarmClock,
  type TradingSwarmCoordinationMode,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmNodeHealth,
  type TradingSwarmNodeId,
  type TradingSwarmNodeLifecycleState,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeRole,
  type TradingSwarmNodeState,
  type TradingSwarmPartition,
  type TradingSwarmPartitionLease,
  type TradingSwarmRegistryPort,
  type TradingSwarmTopology,
  type TradingSwarmTopologySnapshot,
  type TradingSwarmTimestamp,
  type TradingSwarmValidatorPort,
  hasTradingSwarmCapability,
  isActiveTradingSwarmNodeState,
  isHealthyTradingSwarmNode,
} from "./ai-trading-swarm-contracts";

import { aiTradingSwarmValidator } from "./ai-trading-swarm-validator";

/* ========================================================================== *
 * Public errors and options
 * ========================================================================== */

export type TradingSwarmRegistryErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_NODE"
  | "NODE_ALREADY_REGISTERED"
  | "NODE_NOT_FOUND"
  | "SWARM_ID_MISMATCH"
  | "INVALID_HEALTH"
  | "INVALID_LEADER"
  | "INVALID_PARTITION"
  | "INVALID_LEASE"
  | "PARTITION_NOT_FOUND"
  | "LEASE_NOT_FOUND"
  | "STALE_UPDATE"
  | "INVARIANT_VIOLATION";

export class TradingSwarmRegistryError extends Error {
  public readonly code: TradingSwarmRegistryErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: TradingSwarmRegistryErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "TradingSwarmRegistryError";
    this.code = code;
    this.details =
      details === undefined
        ? undefined
        : deepFreeze({ ...details });
  }
}

export interface TradingSwarmRegistryOptions {
  readonly swarmId: string;
  readonly topology?: TradingSwarmTopology;
  readonly coordinationMode?: TradingSwarmCoordinationMode;
  readonly initialTerm?: number;
  readonly initialEpoch?: number;
  readonly initialTopologyVersion?: number;
  readonly defaultLifecycleState?: TradingSwarmNodeLifecycleState;
  readonly defaultAvailability?: TradingSwarmAvailability;
  readonly defaultReadinessScore?: number;
  readonly defaultReliabilityScore?: number;
  readonly validator?: TradingSwarmValidatorPort;
  readonly clock?: TradingSwarmClock;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly rejectDuplicateRegistration?: boolean;
  readonly requireMonotonicHealthTimestamps?: boolean;
}

export interface TradingSwarmNodeQuery {
  readonly roles?: readonly TradingSwarmNodeRole[];
  readonly capabilities?: readonly TradingSwarmCapability[];
  readonly lifecycleStates?: readonly TradingSwarmNodeLifecycleState[];
  readonly availability?: readonly TradingSwarmAvailability[];
  readonly healthyOnly?: boolean;
  readonly activeOnly?: boolean;
  readonly minimumReadinessScore?: number;
  readonly minimumReliabilityScore?: number;
  readonly region?: string;
  readonly zone?: string;
}

export interface TradingSwarmRegistryStatistics {
  readonly swarmId: string;
  readonly totalNodes: number;
  readonly healthyNodes: number;
  readonly activeNodes: number;
  readonly availableNodes: number;
  readonly leaderNodeId?: TradingSwarmNodeId;
  readonly partitionCount: number;
  readonly leaseCount: number;
  readonly term: number;
  readonly epoch: number;
  readonly topologyVersion: number;
  readonly capturedAtMs: number;
  readonly deterministicFingerprint: string;
}

interface NormalizedRegistryOptions {
  readonly swarmId: string;
  readonly topology: TradingSwarmTopology;
  readonly coordinationMode: TradingSwarmCoordinationMode;
  readonly initialTerm: number;
  readonly initialEpoch: number;
  readonly initialTopologyVersion: number;
  readonly defaultLifecycleState: TradingSwarmNodeLifecycleState;
  readonly defaultAvailability: TradingSwarmAvailability;
  readonly defaultReadinessScore: number;
  readonly defaultReliabilityScore: number;
  readonly validator: TradingSwarmValidatorPort;
  readonly clock: TradingSwarmClock;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly rejectDuplicateRegistration: boolean;
  readonly requireMonotonicHealthTimestamps: boolean;
}

interface MutableNodeRecord {
  registration: TradingSwarmNodeRegistration;
  health: TradingSwarmNodeHealth;
  ownedPartitionIds: readonly string[];
  activeMissionIds: readonly string[];
  activeTaskIds: readonly string[];
  currentTerm: number;
  currentEpoch: number;
  stateVersion: number;
}

/* ========================================================================== *
 * Registry implementation
 * ========================================================================== */

export class TradingSwarmRegistry implements TradingSwarmRegistryPort {
  private readonly options: NormalizedRegistryOptions;

  private readonly nodes =
    new Map<TradingSwarmNodeId, MutableNodeRecord>();

  private readonly partitions =
    new Map<string, TradingSwarmPartition>();

  private readonly leases =
    new Map<string, TradingSwarmPartitionLease>();

  private leaderNodeId: TradingSwarmNodeId | undefined;
  private term: number;
  private epoch: number;
  private topologyVersion: number;

  public constructor(options: TradingSwarmRegistryOptions) {
    this.options = normalizeOptions(options);
    this.term = this.options.initialTerm;
    this.epoch = this.options.initialEpoch;
    this.topologyVersion =
      this.options.initialTopologyVersion;
  }

  public registerNode(
    registration: TradingSwarmNodeRegistration,
  ): void {
    this.assertNodeRegistration(registration);

    const nodeId = registration.identity.nodeId;
    const existing = this.nodes.get(nodeId);

    if (
      existing !== undefined &&
      this.options.rejectDuplicateRegistration
    ) {
      throw new TradingSwarmRegistryError(
        "NODE_ALREADY_REGISTERED",
        `Swarm node "${nodeId}" is already registered.`,
        {
          nodeId,
          swarmId: this.options.swarmId,
        },
      );
    }

    const now = this.options.clock.now();
    const registrationCopy = immutableClone(registration);

    if (existing === undefined) {
      this.nodes.set(nodeId, {
        registration: registrationCopy,
        health: this.createInitialHealth(nodeId, now),
        ownedPartitionIds: Object.freeze([]),
        activeMissionIds: Object.freeze([]),
        activeTaskIds: Object.freeze([]),
        currentTerm: this.term,
        currentEpoch: this.epoch,
        stateVersion: 1,
      });
    } else {
      existing.registration = registrationCopy;
      existing.currentTerm = this.term;
      existing.currentEpoch = this.epoch;
      existing.stateVersion += 1;
    }

    this.bumpTopologyVersion();
  }

  public unregisterNode(nodeId: TradingSwarmNodeId): void {
    assertNonEmptyText(nodeId, "nodeId");

    const existing = this.nodes.get(nodeId);
    if (existing === undefined) {
      throw new TradingSwarmRegistryError(
        "NODE_NOT_FOUND",
        `Cannot unregister unknown swarm node "${nodeId}".`,
        { nodeId },
      );
    }

    this.nodes.delete(nodeId);

    if (this.leaderNodeId === nodeId) {
      this.leaderNodeId = undefined;
      this.term += 1;
    }

    for (const [partitionId, partition] of this.partitions) {
      const ownerRemoved = partition.ownerNodeId === nodeId;
      const replicaNodeIds = partition.replicaNodeIds.filter(
        (replicaNodeId) => replicaNodeId !== nodeId,
      );

      if (
        ownerRemoved ||
        replicaNodeIds.length !==
          partition.replicaNodeIds.length
      ) {
        this.partitions.set(
          partitionId,
          deepFreeze({
            ...partition,
            ownerNodeId: ownerRemoved
              ? undefined
              : partition.ownerNodeId,
            replicaNodeIds,
            state: ownerRemoved
              ? "UNASSIGNED"
              : partition.state,
            updatedAtMs: this.options.clock.now(),
            version: partition.version + 1,
            deterministicFingerprint:
              this.options.fingerprintGenerator.fingerprint({
                partitionId: partition.partitionId,
                ownerNodeId: ownerRemoved
                  ? undefined
                  : partition.ownerNodeId,
                replicaNodeIds,
                version: partition.version + 1,
              }),
          }),
        );
      }
    }

    for (const [leaseId, lease] of this.leases) {
      if (lease.ownerNodeId === nodeId) {
        this.leases.delete(leaseId);
      }
    }

    this.rebuildOwnedPartitionIndexes();
    this.bumpTopologyVersion();
  }

  public getNode(
    nodeId: TradingSwarmNodeId,
  ): TradingSwarmNodeRegistration | undefined {
    return this.nodes.get(nodeId)?.registration;
  }

  public listNodes(): readonly TradingSwarmNodeRegistration[] {
    return Object.freeze(
      [...this.nodes.values()]
        .map((record) => record.registration)
        .sort(compareNodeRegistrations),
    );
  }

  public health(
    nodeId: TradingSwarmNodeId,
  ): TradingSwarmNodeHealth | undefined {
    return this.nodes.get(nodeId)?.health;
  }

  public topology(): TradingSwarmTopologySnapshot {
    const capturedAtMs = this.options.clock.now();

    const nodes = Object.freeze(
      [...this.nodes.values()]
        .map((record) => this.toNodeState(record))
        .sort((left, right) =>
          left.registration.identity.nodeId.localeCompare(
            right.registration.identity.nodeId,
          ),
        ),
    );

    const partitions = Object.freeze(
      [...this.partitions.values()].sort((left, right) =>
        left.partitionId.localeCompare(right.partitionId),
      ),
    );

    const leases = Object.freeze(
      [...this.leases.values()].sort((left, right) =>
        left.leaseId.localeCompare(right.leaseId),
      ),
    );

    const leaderNodeId =
      this.leaderNodeId !== undefined &&
      this.nodes.has(this.leaderNodeId)
        ? this.leaderNodeId
        : undefined;

    const fingerprint =
      this.options.fingerprintGenerator.fingerprint({
        swarmId: this.options.swarmId,
        topology: this.options.topology,
        coordinationMode: this.options.coordinationMode,
        leaderNodeId,
        nodes,
        partitions,
        leases,
        term: this.term,
        epoch: this.epoch,
        topologyVersion: this.topologyVersion,
        capturedAtMs,
      });

    return deepFreeze({
      swarmId: this.options.swarmId,
      topology: this.options.topology,
      coordinationMode: this.options.coordinationMode,
      leaderNodeId,
      nodes,
      partitions,
      leases,
      term: this.term,
      epoch: this.epoch,
      topologyVersion: this.topologyVersion,
      capturedAtMs,
      deterministicFingerprint: fingerprint,
    });
  }

  /* ======================================================================== *
   * Extended deterministic registry API
   * ======================================================================== */

  public hasNode(nodeId: TradingSwarmNodeId): boolean {
    return this.nodes.has(nodeId);
  }

  public requireNode(
    nodeId: TradingSwarmNodeId,
  ): TradingSwarmNodeRegistration {
    const node = this.getNode(nodeId);
    if (node === undefined) {
      throw new TradingSwarmRegistryError(
        "NODE_NOT_FOUND",
        `Swarm node "${nodeId}" is not registered.`,
        { nodeId },
      );
    }
    return node;
  }

  public listHealth(): readonly TradingSwarmNodeHealth[] {
    return Object.freeze(
      [...this.nodes.values()]
        .map((record) => record.health)
        .sort((left, right) =>
          left.nodeId.localeCompare(right.nodeId),
        ),
    );
  }

  public nodeState(
    nodeId: TradingSwarmNodeId,
  ): TradingSwarmNodeState | undefined {
    const record = this.nodes.get(nodeId);
    return record === undefined
      ? undefined
      : this.toNodeState(record);
  }

  public listNodeStates(): readonly TradingSwarmNodeState[] {
    return Object.freeze(
      [...this.nodes.values()]
        .map((record) => this.toNodeState(record))
        .sort((left, right) =>
          left.registration.identity.nodeId.localeCompare(
            right.registration.identity.nodeId,
          ),
        ),
    );
  }

  public queryNodes(
    query: TradingSwarmNodeQuery = {},
  ): readonly TradingSwarmNodeRegistration[] {
    validateOptionalNormalizedScore(
      query.minimumReadinessScore,
      "minimumReadinessScore",
    );
    validateOptionalNormalizedScore(
      query.minimumReliabilityScore,
      "minimumReliabilityScore",
    );

    const roleSet =
      query.roles === undefined
        ? undefined
        : new Set(query.roles);
    const capabilitySet =
      query.capabilities === undefined
        ? undefined
        : new Set(query.capabilities);
    const lifecycleSet =
      query.lifecycleStates === undefined
        ? undefined
        : new Set(query.lifecycleStates);
    const availabilitySet =
      query.availability === undefined
        ? undefined
        : new Set(query.availability);

    const matches = [...this.nodes.values()]
      .filter((record) => {
        const { registration, health } = record;

        if (
          roleSet !== undefined &&
          !roleSet.has(registration.identity.role)
        ) {
          return false;
        }

        if (
          capabilitySet !== undefined &&
          ![...capabilitySet].every((capability) =>
            hasTradingSwarmCapability(
              registration,
              capability,
            ),
          )
        ) {
          return false;
        }

        if (
          lifecycleSet !== undefined &&
          !lifecycleSet.has(health.lifecycleState)
        ) {
          return false;
        }

        if (
          availabilitySet !== undefined &&
          !availabilitySet.has(health.availability)
        ) {
          return false;
        }

        if (
          query.healthyOnly === true &&
          !isHealthyTradingSwarmNode(health)
        ) {
          return false;
        }

        if (
          query.activeOnly === true &&
          !isActiveTradingSwarmNodeState(
            health.lifecycleState,
          )
        ) {
          return false;
        }

        if (
          query.minimumReadinessScore !== undefined &&
          health.readinessScore <
            query.minimumReadinessScore
        ) {
          return false;
        }

        if (
          query.minimumReliabilityScore !== undefined &&
          health.reliabilityScore <
            query.minimumReliabilityScore
        ) {
          return false;
        }

        if (
          query.region !== undefined &&
          registration.identity.region !== query.region
        ) {
          return false;
        }

        if (
          query.zone !== undefined &&
          registration.identity.zone !== query.zone
        ) {
          return false;
        }

        return true;
      })
      .map((record) => record.registration)
      .sort(compareNodeRegistrations);

    return Object.freeze(matches);
  }

  public updateHealth(
    health: TradingSwarmNodeHealth,
  ): TradingSwarmNodeHealth {
    const record = this.nodes.get(health.nodeId);

    if (record === undefined) {
      throw new TradingSwarmRegistryError(
        "NODE_NOT_FOUND",
        `Cannot update health for unknown node "${health.nodeId}".`,
        { nodeId: health.nodeId },
      );
    }

    this.assertHealth(health);

    if (
      this.options.requireMonotonicHealthTimestamps &&
      health.assessedAtMs < record.health.assessedAtMs
    ) {
      throw new TradingSwarmRegistryError(
        "STALE_UPDATE",
        `Health update for node "${health.nodeId}" is stale.`,
        {
          nodeId: health.nodeId,
          currentAssessedAtMs:
            record.health.assessedAtMs,
          suppliedAssessedAtMs: health.assessedAtMs,
        },
      );
    }

    record.health = immutableClone(health);
    record.stateVersion += 1;
    this.bumpTopologyVersion();
    return record.health;
  }

  public patchHealth(
    nodeId: TradingSwarmNodeId,
    patch: Partial<
      Omit<TradingSwarmNodeHealth, "nodeId">
    >,
  ): TradingSwarmNodeHealth {
    const current = this.health(nodeId);

    if (current === undefined) {
      throw new TradingSwarmRegistryError(
        "NODE_NOT_FOUND",
        `Cannot patch health for unknown node "${nodeId}".`,
        { nodeId },
      );
    }

    const next = deepFreeze({
      ...current,
      ...patch,
      nodeId,
      warnings:
        patch.warnings === undefined
          ? current.warnings
          : Object.freeze([...patch.warnings]),
      errors:
        patch.errors === undefined
          ? current.errors
          : Object.freeze([...patch.errors]),
      assessedAtMs:
        patch.assessedAtMs ??
        this.options.clock.now(),
    });

    return this.updateHealth(next);
  }

  public markNodeReady(
    nodeId: TradingSwarmNodeId,
    assessedAtMs: TradingSwarmTimestamp = this.options.clock.now(),
  ): TradingSwarmNodeHealth {
    return this.patchHealth(nodeId, {
      lifecycleState: "READY",
      availability: "AVAILABLE",
      healthy: true,
      assessedAtMs,
    });
  }

  public markNodeActive(
    nodeId: TradingSwarmNodeId,
    assessedAtMs: TradingSwarmTimestamp = this.options.clock.now(),
  ): TradingSwarmNodeHealth {
    return this.patchHealth(nodeId, {
      lifecycleState: "ACTIVE",
      availability: "AVAILABLE",
      healthy: true,
      assessedAtMs,
    });
  }

  public quarantineNode(
    nodeId: TradingSwarmNodeId,
    reason: string,
    assessedAtMs: TradingSwarmTimestamp = this.options.clock.now(),
  ): TradingSwarmNodeHealth {
    assertNonEmptyText(reason, "reason");

    const current = this.health(nodeId);
    if (current === undefined) {
      throw new TradingSwarmRegistryError(
        "NODE_NOT_FOUND",
        `Cannot quarantine unknown node "${nodeId}".`,
        { nodeId },
      );
    }

    const warningSet = new Set(current.warnings);
    warningSet.add(reason);

    const next = this.patchHealth(nodeId, {
      lifecycleState: "QUARANTINED",
      availability: "UNAVAILABLE",
      healthy: false,
      warnings: Object.freeze(
        [...warningSet].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
      assessedAtMs,
    });

    if (this.leaderNodeId === nodeId) {
      this.clearLeader();
    }

    return next;
  }

  public restoreNode(
    nodeId: TradingSwarmNodeId,
    assessedAtMs: TradingSwarmTimestamp = this.options.clock.now(),
  ): TradingSwarmNodeHealth {
    return this.patchHealth(nodeId, {
      lifecycleState: "READY",
      availability: "AVAILABLE",
      healthy: true,
      consecutiveFailures: 0,
      errors: Object.freeze([]),
      assessedAtMs,
    });
  }

  public setLeader(
    nodeId: TradingSwarmNodeId,
    term: number = this.term + 1,
  ): void {
    const record = this.nodes.get(nodeId);

    if (record === undefined) {
      throw new TradingSwarmRegistryError(
        "INVALID_LEADER",
        `Cannot elect unknown node "${nodeId}" as leader.`,
        { nodeId },
      );
    }

    if (!isHealthyTradingSwarmNode(record.health)) {
      throw new TradingSwarmRegistryError(
        "INVALID_LEADER",
        `Cannot elect unhealthy node "${nodeId}" as leader.`,
        {
          nodeId,
          lifecycleState:
            record.health.lifecycleState,
          availability: record.health.availability,
        },
      );
    }

    if (
      !record.registration.authority.mayElectLeader &&
      record.registration.identity.role !== "LEADER"
    ) {
      throw new TradingSwarmRegistryError(
        "INVALID_LEADER",
        `Node "${nodeId}" lacks leader-election authority.`,
        { nodeId },
      );
    }

    assertNonNegativeInteger(term, "term");
    if (term < this.term) {
      throw new TradingSwarmRegistryError(
        "STALE_UPDATE",
        "Leader term cannot move backwards.",
        {
          currentTerm: this.term,
          suppliedTerm: term,
        },
      );
    }

    this.leaderNodeId = nodeId;
    this.term = term;

    for (const nodeRecord of this.nodes.values()) {
      nodeRecord.currentTerm = term;
      nodeRecord.stateVersion += 1;
    }

    this.bumpTopologyVersion();
  }

  public clearLeader(): void {
    if (this.leaderNodeId === undefined) {
      return;
    }

    this.leaderNodeId = undefined;
    this.term += 1;

    for (const record of this.nodes.values()) {
      record.currentTerm = this.term;
      record.stateVersion += 1;
    }

    this.bumpTopologyVersion();
  }

  public currentLeader():
    | TradingSwarmNodeRegistration
    | undefined {
    return this.leaderNodeId === undefined
      ? undefined
      : this.getNode(this.leaderNodeId);
  }

  public advanceEpoch(
    nextEpoch: number = this.epoch + 1,
  ): number {
    assertNonNegativeInteger(nextEpoch, "nextEpoch");

    if (nextEpoch <= this.epoch) {
      throw new TradingSwarmRegistryError(
        "STALE_UPDATE",
        "Swarm epoch must increase monotonically.",
        {
          currentEpoch: this.epoch,
          suppliedEpoch: nextEpoch,
        },
      );
    }

    this.epoch = nextEpoch;

    for (const record of this.nodes.values()) {
      record.currentEpoch = nextEpoch;
      record.stateVersion += 1;
    }

    this.bumpTopologyVersion();
    return this.epoch;
  }

  public replacePartitions(
    partitions: readonly TradingSwarmPartition[],
  ): void {
    const next = new Map<string, TradingSwarmPartition>();

    for (const partition of partitions) {
      this.assertPartition(partition);

      if (next.has(partition.partitionId)) {
        throw new TradingSwarmRegistryError(
          "INVALID_PARTITION",
          `Duplicate partition "${partition.partitionId}".`,
          { partitionId: partition.partitionId },
        );
      }

      next.set(
        partition.partitionId,
        immutableClone(partition),
      );
    }

    this.partitions.clear();
    for (const [partitionId, partition] of next) {
      this.partitions.set(partitionId, partition);
    }

    for (const [leaseId, lease] of this.leases) {
      if (!this.partitions.has(lease.partitionId)) {
        this.leases.delete(leaseId);
      }
    }

    this.rebuildOwnedPartitionIndexes();
    this.bumpTopologyVersion();
  }

  public upsertPartition(
    partition: TradingSwarmPartition,
  ): void {
    this.assertPartition(partition);

    const existing = this.partitions.get(
      partition.partitionId,
    );

    if (
      existing !== undefined &&
      partition.version < existing.version
    ) {
      throw new TradingSwarmRegistryError(
        "STALE_UPDATE",
        `Partition "${partition.partitionId}" update is stale.`,
        {
          partitionId: partition.partitionId,
          currentVersion: existing.version,
          suppliedVersion: partition.version,
        },
      );
    }

    this.partitions.set(
      partition.partitionId,
      immutableClone(partition),
    );
    this.rebuildOwnedPartitionIndexes();
    this.bumpTopologyVersion();
  }

  public removePartition(partitionId: string): void {
    if (!this.partitions.delete(partitionId)) {
      throw new TradingSwarmRegistryError(
        "PARTITION_NOT_FOUND",
        `Partition "${partitionId}" is not registered.`,
        { partitionId },
      );
    }

    for (const [leaseId, lease] of this.leases) {
      if (lease.partitionId === partitionId) {
        this.leases.delete(leaseId);
      }
    }

    this.rebuildOwnedPartitionIndexes();
    this.bumpTopologyVersion();
  }

  public getPartition(
    partitionId: string,
  ): TradingSwarmPartition | undefined {
    return this.partitions.get(partitionId);
  }

  public listPartitions():
    readonly TradingSwarmPartition[] {
    return Object.freeze(
      [...this.partitions.values()].sort(
        (left, right) =>
          left.partitionId.localeCompare(
            right.partitionId,
          ),
      ),
    );
  }

  public replaceLeases(
    leases: readonly TradingSwarmPartitionLease[],
  ): void {
    const next =
      new Map<string, TradingSwarmPartitionLease>();

    for (const lease of leases) {
      this.assertLease(lease);

      if (next.has(lease.leaseId)) {
        throw new TradingSwarmRegistryError(
          "INVALID_LEASE",
          `Duplicate lease "${lease.leaseId}".`,
          { leaseId: lease.leaseId },
        );
      }

      next.set(lease.leaseId, immutableClone(lease));
    }

    this.leases.clear();
    for (const [leaseId, lease] of next) {
      this.leases.set(leaseId, lease);
    }

    this.bumpTopologyVersion();
  }

  public upsertLease(
    lease: TradingSwarmPartitionLease,
  ): void {
    this.assertLease(lease);

    const existing = this.leases.get(lease.leaseId);

    if (
      existing !== undefined &&
      lease.fencingToken <
        existing.fencingToken
    ) {
      throw new TradingSwarmRegistryError(
        "STALE_UPDATE",
        `Lease "${lease.leaseId}" has a stale fencing token.`,
        {
          leaseId: lease.leaseId,
          currentFencingToken:
            existing.fencingToken,
          suppliedFencingToken:
            lease.fencingToken,
        },
      );
    }

    this.leases.set(
      lease.leaseId,
      immutableClone(lease),
    );
    this.bumpTopologyVersion();
  }

  public removeLease(leaseId: string): void {
    if (!this.leases.delete(leaseId)) {
      throw new TradingSwarmRegistryError(
        "LEASE_NOT_FOUND",
        `Lease "${leaseId}" is not registered.`,
        { leaseId },
      );
    }
    this.bumpTopologyVersion();
  }

  public getLease(
    leaseId: string,
  ): TradingSwarmPartitionLease | undefined {
    return this.leases.get(leaseId);
  }

  public listLeases():
    readonly TradingSwarmPartitionLease[] {
    return Object.freeze(
      [...this.leases.values()].sort(
        (left, right) =>
          left.leaseId.localeCompare(right.leaseId),
      ),
    );
  }

  public setNodeWorkload(
    nodeId: TradingSwarmNodeId,
    workload: {
      readonly activeMissionIds?: readonly string[];
      readonly activeTaskIds?: readonly string[];
      readonly ownedPartitionIds?: readonly string[];
    },
  ): TradingSwarmNodeState {
    const record = this.nodes.get(nodeId);

    if (record === undefined) {
      throw new TradingSwarmRegistryError(
        "NODE_NOT_FOUND",
        `Cannot update workload for unknown node "${nodeId}".`,
        { nodeId },
      );
    }

    if (workload.activeMissionIds !== undefined) {
      record.activeMissionIds =
        sortedUniqueTextValues(
          workload.activeMissionIds,
          "activeMissionIds",
        );
    }

    if (workload.activeTaskIds !== undefined) {
      record.activeTaskIds =
        sortedUniqueTextValues(
          workload.activeTaskIds,
          "activeTaskIds",
        );
    }

    if (workload.ownedPartitionIds !== undefined) {
      for (const partitionId of workload.ownedPartitionIds) {
        if (!this.partitions.has(partitionId)) {
          throw new TradingSwarmRegistryError(
            "PARTITION_NOT_FOUND",
            `Unknown owned partition "${partitionId}".`,
            { nodeId, partitionId },
          );
        }
      }

      record.ownedPartitionIds =
        sortedUniqueTextValues(
          workload.ownedPartitionIds,
          "ownedPartitionIds",
        );
    }

    record.stateVersion += 1;
    this.bumpTopologyVersion();
    return this.toNodeState(record);
  }

  public statistics(): TradingSwarmRegistryStatistics {
    const capturedAtMs = this.options.clock.now();
    const health = this.listHealth();

    const statistics = {
      swarmId: this.options.swarmId,
      totalNodes: health.length,
      healthyNodes: health.filter(
        isHealthyTradingSwarmNode,
      ).length,
      activeNodes: health.filter((item) =>
        isActiveTradingSwarmNodeState(
          item.lifecycleState,
        ),
      ).length,
      availableNodes: health.filter(
        (item) =>
          item.availability === "AVAILABLE",
      ).length,
      leaderNodeId: this.leaderNodeId,
      partitionCount: this.partitions.size,
      leaseCount: this.leases.size,
      term: this.term,
      epoch: this.epoch,
      topologyVersion: this.topologyVersion,
      capturedAtMs,
    };

    return deepFreeze({
      ...statistics,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          statistics,
        ),
    });
  }

  public clear(): void {
    this.nodes.clear();
    this.partitions.clear();
    this.leases.clear();
    this.leaderNodeId = undefined;
    this.term = this.options.initialTerm;
    this.epoch = this.options.initialEpoch;
    this.topologyVersion =
      this.options.initialTopologyVersion + 1;
  }

  /* ======================================================================== *
   * Internal validation and snapshot helpers
   * ======================================================================== */

  private assertNodeRegistration(
    registration: TradingSwarmNodeRegistration,
  ): void {
    if (
      registration.identity.swarmId !==
      this.options.swarmId
    ) {
      throw new TradingSwarmRegistryError(
        "SWARM_ID_MISMATCH",
        `Node "${registration.identity.nodeId}" belongs to swarm "${registration.identity.swarmId}", not "${this.options.swarmId}".`,
        {
          nodeId: registration.identity.nodeId,
          expectedSwarmId: this.options.swarmId,
          actualSwarmId:
            registration.identity.swarmId,
        },
      );
    }

    const validation =
      this.options.validator.validateNode(registration);

    if (!validation.valid) {
      throw new TradingSwarmRegistryError(
        "INVALID_NODE",
        `Node "${registration.identity.nodeId}" failed swarm validation.`,
        {
          nodeId: registration.identity.nodeId,
          errorCount: validation.errorCount,
          warningCount: validation.warningCount,
          issues: validation.issues,
        },
      );
    }
  }

  private assertHealth(
    health: TradingSwarmNodeHealth,
  ): void {
    assertNonEmptyText(health.nodeId, "health.nodeId");
    assertNonNegativeInteger(
      health.assessedAtMs,
      "health.assessedAtMs",
    );

    const scores = [
      ["readinessScore", health.readinessScore],
      ["reliabilityScore", health.reliabilityScore],
      ["latencyScore", health.latencyScore],
      ["throughputScore", health.throughputScore],
      [
        "synchronizationScore",
        health.synchronizationScore,
      ],
      [
        "dataFreshnessScore",
        health.dataFreshnessScore,
      ],
      [
        "consensusParticipationScore",
        health.consensusParticipationScore,
      ],
    ] as const;

    for (const [name, value] of scores) {
      assertNormalizedScore(value, `health.${name}`);
    }

    assertNonNegativeInteger(
      health.activeMissionCount,
      "health.activeMissionCount",
    );
    assertNonNegativeInteger(
      health.activeTaskCount,
      "health.activeTaskCount",
    );
    assertNonNegativeInteger(
      health.activeMultiAgentRunCount,
      "health.activeMultiAgentRunCount",
    );
    assertNonNegativeInteger(
      health.consecutiveFailures,
      "health.consecutiveFailures",
    );

    if (
      health.lifecycleState === "REMOVED" &&
      health.availability !== "UNAVAILABLE"
    ) {
      throw new TradingSwarmRegistryError(
        "INVALID_HEALTH",
        "A removed node must be unavailable.",
        {
          nodeId: health.nodeId,
          lifecycleState: health.lifecycleState,
          availability: health.availability,
        },
      );
    }

    if (
      health.healthy &&
      (health.lifecycleState === "FAILED" ||
        health.lifecycleState === "QUARANTINED" ||
        health.lifecycleState === "REMOVED")
    ) {
      throw new TradingSwarmRegistryError(
        "INVALID_HEALTH",
        `Lifecycle state "${health.lifecycleState}" cannot be marked healthy.`,
        {
          nodeId: health.nodeId,
          lifecycleState: health.lifecycleState,
        },
      );
    }
  }

  private assertPartition(
    partition: TradingSwarmPartition,
  ): void {
    assertNonEmptyText(
      partition.partitionId,
      "partition.partitionId",
    );

    if (partition.swarmId !== this.options.swarmId) {
      throw new TradingSwarmRegistryError(
        "SWARM_ID_MISMATCH",
        `Partition "${partition.partitionId}" belongs to a different swarm.`,
        {
          partitionId: partition.partitionId,
          expectedSwarmId: this.options.swarmId,
          actualSwarmId: partition.swarmId,
        },
      );
    }

    if (
      partition.ownerNodeId !== undefined &&
      !this.nodes.has(partition.ownerNodeId)
    ) {
      throw new TradingSwarmRegistryError(
        "INVALID_PARTITION",
        `Partition "${partition.partitionId}" references unknown owner "${partition.ownerNodeId}".`,
        {
          partitionId: partition.partitionId,
          ownerNodeId: partition.ownerNodeId,
        },
      );
    }

    for (const replicaNodeId of partition.replicaNodeIds) {
      if (!this.nodes.has(replicaNodeId)) {
        throw new TradingSwarmRegistryError(
          "INVALID_PARTITION",
          `Partition "${partition.partitionId}" references unknown replica "${replicaNodeId}".`,
          {
            partitionId: partition.partitionId,
            replicaNodeId,
          },
        );
      }

      if (replicaNodeId === partition.ownerNodeId) {
        throw new TradingSwarmRegistryError(
          "INVALID_PARTITION",
          `Partition "${partition.partitionId}" owner cannot also be a replica.`,
          {
            partitionId: partition.partitionId,
            nodeId: replicaNodeId,
          },
        );
      }
    }

    assertUniqueTextValues(
      partition.replicaNodeIds,
      "partition.replicaNodeIds",
    );
    assertNormalizedScore(
      partition.weight,
      "partition.weight",
    );
    assertNonNegativeInteger(
      partition.createdAtMs,
      "partition.createdAtMs",
    );
    assertNonNegativeInteger(
      partition.updatedAtMs,
      "partition.updatedAtMs",
    );
    assertNonNegativeInteger(
      partition.version,
      "partition.version",
    );

    if (partition.updatedAtMs < partition.createdAtMs) {
      throw new TradingSwarmRegistryError(
        "INVALID_PARTITION",
        `Partition "${partition.partitionId}" update timestamp precedes creation.`,
        {
          createdAtMs: partition.createdAtMs,
          updatedAtMs: partition.updatedAtMs,
        },
      );
    }
  }

  private assertLease(
    lease: TradingSwarmPartitionLease,
  ): void {
    assertNonEmptyText(lease.leaseId, "lease.leaseId");

    if (!this.partitions.has(lease.partitionId)) {
      throw new TradingSwarmRegistryError(
        "PARTITION_NOT_FOUND",
        `Lease "${lease.leaseId}" references unknown partition "${lease.partitionId}".`,
        {
          leaseId: lease.leaseId,
          partitionId: lease.partitionId,
        },
      );
    }

    if (!this.nodes.has(lease.ownerNodeId)) {
      throw new TradingSwarmRegistryError(
        "INVALID_LEASE",
        `Lease "${lease.leaseId}" references unknown owner "${lease.ownerNodeId}".`,
        {
          leaseId: lease.leaseId,
          ownerNodeId: lease.ownerNodeId,
        },
      );
    }

    assertNonNegativeInteger(lease.term, "lease.term");
    assertNonNegativeInteger(lease.epoch, "lease.epoch");
    assertNonNegativeInteger(
      lease.acquiredAtMs,
      "lease.acquiredAtMs",
    );
    assertNonNegativeInteger(
      lease.expiresAtMs,
      "lease.expiresAtMs",
    );
    assertNonNegativeInteger(
      lease.fencingToken,
      "lease.fencingToken",
    );

    if (lease.expiresAtMs <= lease.acquiredAtMs) {
      throw new TradingSwarmRegistryError(
        "INVALID_LEASE",
        `Lease "${lease.leaseId}" must expire after acquisition.`,
        {
          acquiredAtMs: lease.acquiredAtMs,
          expiresAtMs: lease.expiresAtMs,
        },
      );
    }

    if (lease.term < this.term || lease.epoch < this.epoch) {
      throw new TradingSwarmRegistryError(
        "STALE_UPDATE",
        `Lease "${lease.leaseId}" is stale for the current topology.`,
        {
          leaseTerm: lease.term,
          currentTerm: this.term,
          leaseEpoch: lease.epoch,
          currentEpoch: this.epoch,
        },
      );
    }
  }

  private createInitialHealth(
    nodeId: TradingSwarmNodeId,
    assessedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmNodeHealth {
    const lifecycleState =
      this.options.defaultLifecycleState;
    const availability =
      this.options.defaultAvailability;

    const healthy =
      lifecycleState !== "FAILED" &&
      lifecycleState !== "QUARANTINED" &&
      lifecycleState !== "REMOVED" &&
      availability !== "UNAVAILABLE";

    return deepFreeze({
      nodeId,
      lifecycleState,
      availability,
      healthy,
      readinessScore:
        this.options.defaultReadinessScore,
      reliabilityScore:
        this.options.defaultReliabilityScore,
      latencyScore: 1,
      throughputScore: 1,
      synchronizationScore:
        lifecycleState === "SYNCHRONIZING" ? 0 : 1,
      dataFreshnessScore: 1,
      consensusParticipationScore: 1,
      activeMissionCount: 0,
      activeTaskCount: 0,
      activeMultiAgentRunCount: 0,
      consecutiveFailures: 0,
      lastHeartbeatAtMs: assessedAtMs,
      lastSynchronizedAtMs:
        lifecycleState === "SYNCHRONIZING"
          ? undefined
          : assessedAtMs,
      warnings: Object.freeze([]),
      errors: Object.freeze([]),
      assessedAtMs,
    });
  }

  private toNodeState(
    record: MutableNodeRecord,
  ): TradingSwarmNodeState {
    const fingerprint =
      this.options.fingerprintGenerator.fingerprint({
        nodeId: record.registration.identity.nodeId,
        registration: record.registration,
        health: record.health,
        ownedPartitionIds: record.ownedPartitionIds,
        activeMissionIds: record.activeMissionIds,
        activeTaskIds: record.activeTaskIds,
        currentTerm: record.currentTerm,
        currentEpoch: record.currentEpoch,
        stateVersion: record.stateVersion,
      });

    return deepFreeze({
      registration: record.registration,
      health: record.health,
      ownedPartitionIds:
        record.ownedPartitionIds,
      activeMissionIds: record.activeMissionIds,
      activeTaskIds: record.activeTaskIds,
      currentTerm: record.currentTerm,
      currentEpoch: record.currentEpoch,
      stateVersion: record.stateVersion,
      deterministicFingerprint: fingerprint,
    });
  }

  private rebuildOwnedPartitionIndexes(): void {
    const ownedByNode =
      new Map<TradingSwarmNodeId, string[]>();

    for (const partition of this.partitions.values()) {
      if (partition.ownerNodeId === undefined) {
        continue;
      }

      const current =
        ownedByNode.get(partition.ownerNodeId) ?? [];
      current.push(partition.partitionId);
      ownedByNode.set(partition.ownerNodeId, current);
    }

    for (const record of this.nodes.values()) {
      const nodeId =
        record.registration.identity.nodeId;
      record.ownedPartitionIds = Object.freeze(
        [...(ownedByNode.get(nodeId) ?? [])].sort(
          (left, right) =>
            left.localeCompare(right),
        ),
      );
      record.stateVersion += 1;
    }
  }

  private bumpTopologyVersion(): void {
    this.topologyVersion += 1;
  }
}

/* ========================================================================== *
 * Factories and deterministic defaults
 * ========================================================================== */

export function createTradingSwarmRegistry(
  options: TradingSwarmRegistryOptions,
): TradingSwarmRegistry {
  return new TradingSwarmRegistry(options);
}

export class SystemTradingSwarmClock
  implements TradingSwarmClock
{
  public now(): TradingSwarmTimestamp {
    return Date.now() as TradingSwarmTimestamp;
  }
}

export class StableTradingSwarmFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    const serialized = stableStringify(value);
    let hash = 0x811c9dc5;

    for (let index = 0; index < serialized.length; index += 1) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }

    return `swarm-fp-${(hash >>> 0)
      .toString(16)
      .padStart(8, "0")}`;
  }
}

/* ========================================================================== *
 * Pure helpers
 * ========================================================================== */

function normalizeOptions(
  options: TradingSwarmRegistryOptions,
): NormalizedRegistryOptions {
  if (
    options === undefined ||
    options === null ||
    typeof options !== "object"
  ) {
    throw new TradingSwarmRegistryError(
      "INVALID_CONFIGURATION",
      "TradingSwarmRegistry options are required.",
    );
  }

  assertNonEmptyText(options.swarmId, "swarmId");

  const initialTerm = options.initialTerm ?? 0;
  const initialEpoch = options.initialEpoch ?? 0;
  const initialTopologyVersion =
    options.initialTopologyVersion ?? 0;
  const defaultReadinessScore =
    options.defaultReadinessScore ?? 1;
  const defaultReliabilityScore =
    options.defaultReliabilityScore ?? 1;

  assertNonNegativeInteger(initialTerm, "initialTerm");
  assertNonNegativeInteger(initialEpoch, "initialEpoch");
  assertNonNegativeInteger(
    initialTopologyVersion,
    "initialTopologyVersion",
  );
  assertNormalizedScore(
    defaultReadinessScore,
    "defaultReadinessScore",
  );
  assertNormalizedScore(
    defaultReliabilityScore,
    "defaultReliabilityScore",
  );

  return Object.freeze({
    swarmId: options.swarmId.trim(),
    topology: options.topology ?? "LEADER_FOLLOWER",
    coordinationMode:
      options.coordinationMode ?? "EVENT_DRIVEN",
    initialTerm,
    initialEpoch,
    initialTopologyVersion,
    defaultLifecycleState:
      options.defaultLifecycleState ?? "REGISTERED",
    defaultAvailability:
      options.defaultAvailability ?? "AVAILABLE",
    defaultReadinessScore,
    defaultReliabilityScore,
    validator:
      options.validator ?? aiTradingSwarmValidator,
    clock: options.clock ?? new SystemTradingSwarmClock(),
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableTradingSwarmFingerprintGenerator(),
    rejectDuplicateRegistration:
      options.rejectDuplicateRegistration ?? true,
    requireMonotonicHealthTimestamps:
      options.requireMonotonicHealthTimestamps ?? true,
  });
}

function compareNodeRegistrations(
  left: TradingSwarmNodeRegistration,
  right: TradingSwarmNodeRegistration,
): number {
  const roleComparison =
    nodeRoleRank(left.identity.role) -
    nodeRoleRank(right.identity.role);

  if (roleComparison !== 0) {
    return roleComparison;
  }

  return left.identity.nodeId.localeCompare(
    right.identity.nodeId,
  );
}

function nodeRoleRank(role: TradingSwarmNodeRole): number {
  switch (role) {
    case "LEADER":
      return 0;
    case "SUPERVISOR":
      return 1;
    case "GOVERNOR":
      return 2;
    case "COORDINATOR":
      return 3;
    case "ARBITER":
      return 4;
    case "EXECUTOR":
      return 5;
    case "WORKER":
      return 6;
    case "REPLICA":
      return 7;
    case "OBSERVER":
      return 8;
  }
}

function sortedUniqueTextValues(
  values: readonly string[],
  name: string,
): readonly string[] {
  assertUniqueTextValues(values, name);
  return Object.freeze(
    [...values].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function assertUniqueTextValues(
  values: readonly string[],
  name: string,
): void {
  const seen = new Set<string>();

  for (const value of values) {
    assertNonEmptyText(value, name);

    if (seen.has(value)) {
      throw new TradingSwarmRegistryError(
        "INVARIANT_VIOLATION",
        `${name} must not contain duplicate value "${value}".`,
        { name, duplicateValue: value },
      );
    }

    seen.add(value);
  }
}

function validateOptionalNormalizedScore(
  value: number | undefined,
  name: string,
): void {
  if (value !== undefined) {
    assertNormalizedScore(value, name);
  }
}

function assertNormalizedScore(
  value: unknown,
  name: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new TradingSwarmRegistryError(
      "INVALID_CONFIGURATION",
      `${name} must be a finite number between 0 and 1.`,
      { name, value },
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  name: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new TradingSwarmRegistryError(
      "INVALID_CONFIGURATION",
      `${name} must be a non-negative integer.`,
      { name, value },
    );
  }
}

function assertNonEmptyText(
  value: unknown,
  name: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TradingSwarmRegistryError(
      "INVALID_CONFIGURATION",
      `${name} must be a non-empty string.`,
      { name, value },
    );
  }
}

function immutableClone<TValue>(value: TValue): TValue {
  return deepFreeze(cloneValue(value));
}

function cloneValue<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      cloneValue(item),
    ) as TValue;
  }

  const output: Record<string, unknown> = {};

  for (const key of Object.keys(value as object)) {
    output[key] = cloneValue(
      (value as Record<string, unknown>)[key],
    );
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
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
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

    for (const key of Object.keys(value).sort()) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      output[key] = normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}