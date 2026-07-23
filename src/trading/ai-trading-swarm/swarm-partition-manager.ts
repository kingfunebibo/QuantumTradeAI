/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-partition-manager.ts
 *
 * Deterministic, immutable partition planning, ownership assignment,
 * replica placement, workload balancing, and lease generation.
 */

import {
  type AiTradingSwarmRunRequest,
  type TradingSwarmCapability,
  type TradingSwarmClock,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmIdGenerator,
  type TradingSwarmNodeHealth,
  type TradingSwarmNodeId,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeTrustScore,
  type TradingSwarmPartition,
  type TradingSwarmPartitionLease,
  type TradingSwarmPartitionManagerPort,
  type TradingSwarmPartitionPolicy,
  type TradingSwarmPartitionType,
  type TradingSwarmPriority,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
  hasTradingSwarmCapability,
  isActiveTradingSwarmNodeState,
  isHealthyTradingSwarmNode,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmPartitionManagerErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TOPOLOGY"
  | "INVALID_POLICY"
  | "PARTITIONING_DISABLED"
  | "NO_ELIGIBLE_NODES"
  | "CAPABILITY_COVERAGE_UNAVAILABLE"
  | "PARTITION_CAPACITY_EXCEEDED"
  | "REPLICATION_UNAVAILABLE"
  | "INVARIANT_VIOLATION";

export class SwarmPartitionManagerError extends Error {
  public readonly code: SwarmPartitionManagerErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: SwarmPartitionManagerErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "SwarmPartitionManagerError";
    this.code = code;
    this.details =
      details === undefined
        ? undefined
        : deepFreeze({ ...details });
  }
}

export interface SwarmPartitionAssignmentWeights {
  readonly capability: number;
  readonly readiness: number;
  readonly reliability: number;
  readonly throughput: number;
  readonly latency: number;
  readonly synchronization: number;
  readonly trust: number;
  readonly capacityHeadroom: number;
  readonly locality: number;
  readonly continuity: number;
  readonly riskQuality: number;
  readonly workloadPenalty: number;
  readonly failurePenalty: number;
}

export interface SwarmPartitionManagerOptions {
  readonly clock?: TradingSwarmClock;
  readonly idGenerator?: TradingSwarmIdGenerator;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly weights?: Partial<SwarmPartitionAssignmentWeights>;
  readonly currentTerm?: number;
  readonly currentEpoch?: number;
  readonly initialFencingToken?: number;
  readonly requireHealthyNodes?: boolean;
  readonly requireActiveNodes?: boolean;
  readonly requireDeterministicNodes?: boolean;
  readonly requireReplaySafeNodes?: boolean;
  readonly allowPartialReplication?: boolean;
  readonly preserveExistingOwnership?: boolean;
}

interface NormalizedOptions {
  readonly clock: TradingSwarmClock;
  readonly idGenerator: TradingSwarmIdGenerator;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly weights: SwarmPartitionAssignmentWeights;
  readonly currentTerm: number;
  readonly currentEpoch: number;
  readonly initialFencingToken: number;
  readonly requireHealthyNodes: boolean;
  readonly requireActiveNodes: boolean;
  readonly requireDeterministicNodes: boolean;
  readonly requireReplaySafeNodes: boolean;
  readonly allowPartialReplication: boolean;
  readonly preserveExistingOwnership: boolean;
}

interface PartitionBlueprint {
  readonly type: TradingSwarmPartitionType;
  readonly key: string;
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly weight: number;
  readonly priority: TradingSwarmPriority;
}

interface NodeAssignmentState {
  readonly node: TradingSwarmNodeRegistration;
  readonly health: TradingSwarmNodeHealth;
  readonly trust: TradingSwarmNodeTrustScore | undefined;
  readonly assignedPartitionIds: TradingSwarmPartition["partitionId"][];
  readonly assignmentCount: number;
}

interface ScoredNode {
  readonly state: NodeAssignmentState;
  readonly score: number;
}

/* ========================================================================== *
 * Defaults
 * ========================================================================== */

export const DEFAULT_SWARM_PARTITION_ASSIGNMENT_WEIGHTS:
  SwarmPartitionAssignmentWeights = deepFreeze({
    capability: 0.18,
    readiness: 0.10,
    reliability: 0.14,
    throughput: 0.08,
    latency: 0.06,
    synchronization: 0.08,
    trust: 0.12,
    capacityHeadroom: 0.10,
    locality: 0.04,
    continuity: 0.04,
    riskQuality: 0.06,
    workloadPenalty: 0.10,
    failurePenalty: 0.08,
  });

/* ========================================================================== *
 * Manager
 * ========================================================================== */

export class SwarmPartitionManager
  implements TradingSwarmPartitionManagerPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmPartitionManagerOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public plan(
    request: AiTradingSwarmRunRequest,
    topology: TradingSwarmTopologySnapshot,
    nodes: readonly TradingSwarmNodeRegistration[],
    policy: TradingSwarmPartitionPolicy,
  ): readonly TradingSwarmPartition[] {
    this.validatePlanInputs(
      request,
      topology,
      nodes,
      policy,
    );

    if (!policy.enabled) {
      throw new SwarmPartitionManagerError(
        "PARTITIONING_DISABLED",
        "Partition planning is disabled by policy.",
        { swarmId: request.swarmId },
      );
    }

    const now = request.requestedAtMs;
    const blueprints = this.createBlueprints(request);
    const existingByIdentity = new Map(
      topology.partitions.map((partition) => [
        partitionIdentity(partition.type, partition.key),
        partition,
      ]),
    );

    const partitions = blueprints
      .map((blueprint) => {
        const identity = partitionIdentity(
          blueprint.type,
          blueprint.key,
        );
        const existing = existingByIdentity.get(identity);
        const partitionId =
          existing?.partitionId ??
          this.options.idGenerator.generate(
            "swarm-partition",
            stableStringify({
              swarmId: request.swarmId,
              requestId: request.requestId,
              type: blueprint.type,
              key: blueprint.key,
            }),
          );

        const partitionBase = {
          partitionId,
          swarmId: request.swarmId,
          type: blueprint.type,
          key: blueprint.key,
          state: existing?.state ?? "UNASSIGNED",
          ...(this.options.preserveExistingOwnership &&
          existing?.ownerNodeId !== undefined
            ? { ownerNodeId: existing.ownerNodeId }
            : {}),
          replicaNodeIds:
            this.options.preserveExistingOwnership &&
            existing !== undefined
              ? Object.freeze([
                  ...existing.replicaNodeIds,
                ].sort())
              : Object.freeze([]),
          requiredCapabilities:
            blueprint.requiredCapabilities,
          weight: clamp01(blueprint.weight),
          priority: blueprint.priority,
          createdAtMs:
            existing?.createdAtMs ?? now,
          updatedAtMs: now,
          version: (existing?.version ?? 0) + 1,
          metadata: deepFreeze({
            requestId: request.requestId,
            objective: request.objective,
            strategy: policy.strategy,
          }),
        } satisfies Omit<
          TradingSwarmPartition,
          "deterministicFingerprint"
        >;

        return deepFreeze({
          ...partitionBase,
          deterministicFingerprint:
            this.options.fingerprintGenerator.fingerprint(
              partitionBase,
            ),
        });
      })
      .sort(comparePartitions);

    return Object.freeze(partitions);
  }

  public assign(
    partitions: readonly TradingSwarmPartition[],
    nodes: readonly TradingSwarmNodeRegistration[],
    health: readonly TradingSwarmNodeHealth[],
    trust: readonly TradingSwarmNodeTrustScore[],
    policy: TradingSwarmPartitionPolicy,
  ): readonly TradingSwarmPartitionLease[] {
    this.validateAssignmentInputs(
      partitions,
      nodes,
      health,
      trust,
      policy,
    );

    if (!policy.enabled) {
      throw new SwarmPartitionManagerError(
        "PARTITIONING_DISABLED",
        "Partition assignment is disabled by policy.",
      );
    }

    const healthByNodeId = uniqueMap(
      health,
      (item) => item.nodeId,
      "health",
    );
    const trustByNodeId = uniqueMap(
      trust,
      (item) => item.nodeId,
      "trust",
    );

    const assignmentStates: NodeAssignmentState[] = nodes
      .slice()
      .sort(compareRegistrations)
      .map<NodeAssignmentState | undefined>((node) => {
        const nodeHealth = healthByNodeId.get(
          node.identity.nodeId,
        );

        if (nodeHealth === undefined) {
          return undefined;
        }

        if (
          !this.isEligibleNode(node, nodeHealth)
        ) {
          return undefined;
        }

        const nodeTrust = trustByNodeId.get(
          node.identity.nodeId,
        );

        if (nodeTrust?.quarantined === true) {
          return undefined;
        }

        return {
          node,
          health: nodeHealth,
          trust: nodeTrust,
          assignedPartitionIds: [] as TradingSwarmPartition["partitionId"][],
          assignmentCount: 0,
        } satisfies NodeAssignmentState;
      })
      .filter(
        (
          state,
        ): state is NodeAssignmentState =>
          state !== undefined,
      );

    if (
      assignmentStates.length === 0 &&
      partitions.length > 0
    ) {
      throw new SwarmPartitionManagerError(
        "NO_ELIGIBLE_NODES",
        "No eligible nodes are available for partition assignment.",
      );
    }

    const acquiredAtMs = this.options.clock.now();
    const leases: TradingSwarmPartitionLease[] = [];
    let fencingToken =
      this.options.initialFencingToken;

    for (const partition of partitions
      .slice()
      .sort(comparePartitionsForAssignment)) {
      const capableStates = assignmentStates.filter(
        (state) =>
          partition.requiredCapabilities.every(
            (capability) =>
              hasTradingSwarmCapability(
                state.node,
                capability,
              ),
          ),
      );

      if (capableStates.length === 0) {
        throw new SwarmPartitionManagerError(
          "CAPABILITY_COVERAGE_UNAVAILABLE",
          `No eligible node satisfies partition "${partition.partitionId}" capabilities.`,
          {
            partitionId: partition.partitionId,
            requiredCapabilities:
              partition.requiredCapabilities,
          },
        );
      }

      const owner = this.selectOwner(
        partition,
        capableStates,
        policy,
      );

      if (owner === undefined) {
        throw new SwarmPartitionManagerError(
          "PARTITION_CAPACITY_EXCEEDED",
          `No node has capacity for partition "${partition.partitionId}".`,
          { partitionId: partition.partitionId },
        );
      }

      this.recordAssignment(
        owner.state,
        partition.partitionId,
      );

      fencingToken += 1;
      leases.push(
        this.createLease(
          partition,
          owner.state.node.identity.nodeId,
          acquiredAtMs,
          policy,
          fencingToken,
        ),
      );

      const replicaTargetCount = Math.max(
        0,
        policy.replicationFactor - 1,
      );

      if (replicaTargetCount === 0) {
        continue;
      }

      const replicas = this.selectReplicas(
        partition,
        capableStates,
        owner.state.node.identity.nodeId,
        replicaTargetCount,
        policy,
      );

      if (
        replicas.length < replicaTargetCount &&
        !this.options.allowPartialReplication
      ) {
        throw new SwarmPartitionManagerError(
          "REPLICATION_UNAVAILABLE",
          `Partition "${partition.partitionId}" requires ${replicaTargetCount} replicas but only ${replicas.length} are available.`,
          {
            partitionId: partition.partitionId,
            requiredReplicaCount:
              replicaTargetCount,
            availableReplicaCount:
              replicas.length,
          },
        );
      }

      for (const replica of replicas) {
        this.recordAssignment(
          replica.state,
          partition.partitionId,
        );
      }
    }

    return Object.freeze(
      leases.sort(compareLeases),
    );
  }

  private createBlueprints(
    request: AiTradingSwarmRunRequest,
  ): readonly PartitionBlueprint[] {
    const blueprints: PartitionBlueprint[] = [];
    const requiredCapabilities =
      uniqueSorted([
        ...(request.requiredCapabilities ?? []),
        ...(request.constraints
          ?.requiredCapabilities ?? []),
      ]);

    for (const marketId of uniqueSorted(
      request.marketIds ?? [],
    )) {
      blueprints.push({
        type: "MARKET",
        key: marketId,
        requiredCapabilities:
          mergeCapabilities(
            requiredCapabilities,
            ["DISTRIBUTE_MARKET_ANALYSIS"],
          ),
        weight: 1,
        priority: objectivePriority(
          request.objective,
        ),
      });
    }

    for (const strategyId of uniqueSorted(
      request.strategyIds ?? [],
    )) {
      blueprints.push({
        type: "STRATEGY",
        key: strategyId,
        requiredCapabilities:
          mergeCapabilities(
            requiredCapabilities,
            ["DISTRIBUTE_STRATEGY_ANALYSIS"],
          ),
        weight: 1,
        priority: objectivePriority(
          request.objective,
        ),
      });
    }

    if (request.portfolioId !== undefined) {
      blueprints.push({
        type: "PORTFOLIO",
        key: request.portfolioId,
        requiredCapabilities:
          mergeCapabilities(
            requiredCapabilities,
            ["DISTRIBUTE_PORTFOLIO_ANALYSIS"],
          ),
        weight: 1,
        priority: objectivePriority(
          request.objective,
        ),
      });
    }

    if (
      request.objective ===
        "SYSTEMIC_RISK_RESPONSE" ||
      request.constraints?.maximumRiskScore !==
        undefined
    ) {
      blueprints.push({
        type: "RISK_DOMAIN",
        key: `${request.requestId}:systemic-risk`,
        requiredCapabilities:
          mergeCapabilities(
            requiredCapabilities,
            ["DISTRIBUTE_RISK_ANALYSIS"],
          ),
        weight: 1,
        priority: "CRITICAL",
      });
    }

    if (
      request.objective ===
      "DISTRIBUTED_ARBITRAGE_DISCOVERY"
    ) {
      blueprints.push({
        type: "CUSTOM",
        key: `${request.requestId}:arbitrage`,
        requiredCapabilities:
          mergeCapabilities(
            requiredCapabilities,
            ["DISTRIBUTE_ARBITRAGE_ANALYSIS"],
          ),
        weight: 1,
        priority: "VERY_HIGH",
      });
    }

    if (
      request.objective ===
        "CROSS_EXCHANGE_EXECUTION" ||
      request.objective ===
        "LIQUIDITY_COORDINATION"
    ) {
      blueprints.push({
        type: "EXCHANGE",
        key: `${request.requestId}:execution`,
        requiredCapabilities:
          mergeCapabilities(
            requiredCapabilities,
            request.objective ===
              "CROSS_EXCHANGE_EXECUTION"
              ? [
                  "PLAN_DISTRIBUTED_EXECUTION",
                  "EXECUTE_TRADES",
                ]
              : [
                  "DISTRIBUTE_MARKET_ANALYSIS",
                  "PLAN_DISTRIBUTED_EXECUTION",
                ],
          ),
        weight: 1,
        priority: "VERY_HIGH",
      });
    }

    for (const partitionId of uniqueSorted(
      request.constraints
        ?.requiredPartitionIds ?? [],
    )) {
      blueprints.push({
        type: "CUSTOM",
        key: partitionId,
        requiredCapabilities,
        weight: 1,
        priority: objectivePriority(
          request.objective,
        ),
      });
    }

    if (blueprints.length === 0) {
      blueprints.push({
        type: "MISSION",
        key: request.requestId,
        requiredCapabilities:
          requiredCapabilities.length > 0
            ? requiredCapabilities
            : objectiveCapabilities(
                request.objective,
              ),
        weight: 1,
        priority: objectivePriority(
          request.objective,
        ),
      });
    }

    const deduplicated = new Map<
      string,
      PartitionBlueprint
    >();

    for (const blueprint of blueprints) {
      const identity = partitionIdentity(
        blueprint.type,
        blueprint.key,
      );
      const existing = deduplicated.get(identity);

      if (existing === undefined) {
        deduplicated.set(
          identity,
          deepFreeze({
            ...blueprint,
            requiredCapabilities:
              uniqueSorted(
                blueprint.requiredCapabilities,
              ),
          }),
        );
      } else {
        deduplicated.set(
          identity,
          deepFreeze({
            ...existing,
            requiredCapabilities:
              mergeCapabilities(
                existing.requiredCapabilities,
                blueprint.requiredCapabilities,
              ),
            weight: Math.max(
              existing.weight,
              blueprint.weight,
            ),
            priority: higherPriority(
              existing.priority,
              blueprint.priority,
            ),
          }),
        );
      }
    }

    return Object.freeze(
      [...deduplicated.values()].sort(
        compareBlueprints,
      ),
    );
  }

  private selectOwner(
    partition: TradingSwarmPartition,
    states: readonly NodeAssignmentState[],
    policy: TradingSwarmPartitionPolicy,
  ): ScoredNode | undefined {
    return states
      .filter(
        (state) =>
          state.assignmentCount <
          policy.maximumPartitionsPerNode,
      )
      .map((state) => ({
        state,
        score: this.scoreNode(
          state,
          partition,
          policy,
          true,
        ),
      }))
      .sort(compareScoredNodes)[0];
  }

  private selectReplicas(
    partition: TradingSwarmPartition,
    states: readonly NodeAssignmentState[],
    ownerNodeId: TradingSwarmNodeId,
    count: number,
    policy: TradingSwarmPartitionPolicy,
  ): readonly ScoredNode[] {
    const owner = states.find(
      (state) =>
        state.node.identity.nodeId === ownerNodeId,
    );

    return states
      .filter(
        (state) =>
          state.node.identity.nodeId !==
            ownerNodeId &&
          state.assignmentCount <
            policy.maximumPartitionsPerNode,
      )
      .map((state) => ({
        state,
        score:
          this.scoreNode(
            state,
            partition,
            policy,
            false,
          ) +
          diversityBonus(state, owner),
      }))
      .sort(compareScoredNodes)
      .slice(0, count);
  }

  private scoreNode(
    state: NodeAssignmentState,
    partition: TradingSwarmPartition,
    policy: TradingSwarmPartitionPolicy,
    owner: boolean,
  ): number {
    const weights = this.options.weights;
    const health = state.health;
    const trust = state.trust;
    const capacityHeadroom = clamp01(
      1 -
        state.assignmentCount /
          Math.max(
            1,
            policy.maximumPartitionsPerNode,
          ),
    );
    const capabilityScore =
      capabilityProficiency(
        state.node,
        partition.requiredCapabilities,
      );
    const locality = localityScore(
      state.node,
      partition,
    );
    const continuity =
      partition.ownerNodeId ===
        state.node.identity.nodeId ||
      partition.replicaNodeIds.includes(
        state.node.identity.nodeId,
      )
        ? 1
        : 0;
    const riskQuality =
      trust === undefined
        ? health.reliabilityScore
        : average([
            trust.overallTrust,
            trust.governanceComplianceScore,
            trust.recoveryQualityScore,
          ]);
    const workloadRatio =
      assignmentWorkloadRatio(
        state,
        policy.maximumPartitionsPerNode,
      );

    let strategyAdjustment = 0;
    switch (policy.strategy) {
      case "STATIC":
        strategyAdjustment =
          continuity * 0.2;
        break;
      case "CONSISTENT_HASH":
        strategyAdjustment =
          consistentHashAffinity(
            partition.partitionId,
            state.node.identity.nodeId,
          ) * 0.2;
        break;
      case "CAPABILITY_AWARE":
        strategyAdjustment =
          capabilityScore * 0.2;
        break;
      case "LOAD_AWARE":
        strategyAdjustment =
          capacityHeadroom * 0.2;
        break;
      case "RISK_AWARE":
        strategyAdjustment =
          riskQuality * 0.2;
        break;
      case "HYBRID":
        strategyAdjustment =
          average([
            capabilityScore,
            capacityHeadroom,
            riskQuality,
            locality,
          ]) * 0.2;
        break;
    }

    const positive =
      capabilityScore * weights.capability +
      clamp01(health.readinessScore) *
        weights.readiness +
      clamp01(health.reliabilityScore) *
        weights.reliability +
      clamp01(health.throughputScore) *
        weights.throughput +
      clamp01(health.latencyScore) *
        weights.latency +
      clamp01(health.synchronizationScore) *
        weights.synchronization +
      clamp01(
        trust?.overallTrust ??
          health.reliabilityScore,
      ) * weights.trust +
      capacityHeadroom *
        weights.capacityHeadroom +
      locality * weights.locality +
      continuity * weights.continuity +
      riskQuality * weights.riskQuality +
      strategyAdjustment +
      (owner ? 0.000001 : 0);

    const workloadPenalty =
      workloadRatio * weights.workloadPenalty;
    const failurePenalty =
      clamp01(
        health.consecutiveFailures / 10,
      ) * weights.failurePenalty;

    return clamp01(
      positive -
        workloadPenalty -
        failurePenalty,
    );
  }

  private recordAssignment(
    state: NodeAssignmentState,
    partitionId: TradingSwarmPartition["partitionId"],
  ): void {
    state.assignedPartitionIds.push(partitionId);
    (
      state as {
        assignmentCount: number;
      }
    ).assignmentCount += 1;
  }

  private createLease(
    partition: TradingSwarmPartition,
    ownerNodeId: TradingSwarmNodeId,
    acquiredAtMs: TradingSwarmTimestamp,
    policy: TradingSwarmPartitionPolicy,
    fencingToken: number,
  ): TradingSwarmPartitionLease {
    const expiresAtMs =
      (acquiredAtMs +
        policy.leaseDurationMs) as TradingSwarmTimestamp;
    const leaseId =
      this.options.idGenerator.generate(
        "swarm-partition-lease",
        stableStringify({
          partitionId: partition.partitionId,
          ownerNodeId,
          term: this.options.currentTerm,
          epoch: this.options.currentEpoch,
          acquiredAtMs,
        }),
      );

    const leaseBase = {
      leaseId,
      partitionId: partition.partitionId,
      ownerNodeId,
      term: this.options.currentTerm,
      epoch: this.options.currentEpoch,
      acquiredAtMs,
      expiresAtMs,
      fencingToken:
        policy.requireFencingTokens
          ? fencingToken
          : 0,
    };

    return deepFreeze({
      ...leaseBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          leaseBase,
        ),
    });
  }

  private isEligibleNode(
    node: TradingSwarmNodeRegistration,
    health: TradingSwarmNodeHealth,
  ): boolean {
    if (
      node.identity.nodeId !== health.nodeId
    ) {
      return false;
    }

    if (
      this.options.requireActiveNodes &&
      !isActiveTradingSwarmNodeState(
        health.lifecycleState,
      )
    ) {
      return false;
    }

    if (
      this.options.requireHealthyNodes &&
      !isHealthyTradingSwarmNode(health)
    ) {
      return false;
    }

    if (
      this.options.requireDeterministicNodes &&
      !node.deterministic
    ) {
      return false;
    }

    if (
      this.options.requireReplaySafeNodes &&
      !node.replaySafe
    ) {
      return false;
    }

    return true;
  }

  private validatePlanInputs(
    request: AiTradingSwarmRunRequest,
    topology: TradingSwarmTopologySnapshot,
    nodes: readonly TradingSwarmNodeRegistration[],
    policy: TradingSwarmPartitionPolicy,
  ): void {
    if (
      request === undefined ||
      request === null
    ) {
      throw new SwarmPartitionManagerError(
        "INVALID_REQUEST",
        "A swarm run request is required.",
      );
    }

    if (
      topology === undefined ||
      topology === null
    ) {
      throw new SwarmPartitionManagerError(
        "INVALID_TOPOLOGY",
        "A topology snapshot is required.",
      );
    }

    if (
      request.swarmId !== topology.swarmId
    ) {
      throw new SwarmPartitionManagerError(
        "INVALID_TOPOLOGY",
        "Request and topology swarm identifiers must match.",
      );
    }

    for (const node of nodes) {
      if (
        node.identity.swarmId !==
        request.swarmId
      ) {
        throw new SwarmPartitionManagerError(
          "INVALID_REQUEST",
          `Node "${node.identity.nodeId}" belongs to a different swarm.`,
        );
      }
    }

    validatePolicy(policy);
  }

  private validateAssignmentInputs(
    partitions: readonly TradingSwarmPartition[],
    nodes: readonly TradingSwarmNodeRegistration[],
    health: readonly TradingSwarmNodeHealth[],
    trust: readonly TradingSwarmNodeTrustScore[],
    policy: TradingSwarmPartitionPolicy,
  ): void {
    validatePolicy(policy);

    uniqueMap(
      partitions,
      (item) => item.partitionId,
      "partitions",
    );
    uniqueMap(
      nodes,
      (item) => item.identity.nodeId,
      "nodes",
    );
    uniqueMap(
      health,
      (item) => item.nodeId,
      "health",
    );
    uniqueMap(
      trust,
      (item) => item.nodeId,
      "trust",
    );
  }
}

/* ========================================================================== *
 * Factory and deterministic defaults
 * ========================================================================== */

export function createSwarmPartitionManager(
  options: SwarmPartitionManagerOptions = {},
): SwarmPartitionManager {
  return new SwarmPartitionManager(options);
}

export class SystemSwarmPartitionClock
  implements TradingSwarmClock
{
  public now(): TradingSwarmTimestamp {
    return Date.now() as TradingSwarmTimestamp;
  }
}

export class StableSwarmPartitionIdGenerator
  implements TradingSwarmIdGenerator
{
  public generate(
    prefix: string,
    seed: string,
  ): string {
    return `${prefix}-${stableHash(seed)}`;
  }
}

export class StableSwarmPartitionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-partition-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Helpers
 * ========================================================================== */

function normalizeOptions(
  options: SwarmPartitionManagerOptions,
): NormalizedOptions {
  const weights = deepFreeze({
    ...DEFAULT_SWARM_PARTITION_ASSIGNMENT_WEIGHTS,
    ...(options.weights ?? {}),
  });

  for (const [name, value] of Object.entries(weights)) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new SwarmPartitionManagerError(
        "INVALID_REQUEST",
        `Weight "${name}" must be finite and non-negative.`,
      );
    }
  }

  const currentTerm =
    options.currentTerm ?? 0;
  const currentEpoch =
    options.currentEpoch ?? 0;
  const initialFencingToken =
    options.initialFencingToken ?? 0;

  assertNonNegativeInteger(
    currentTerm,
    "currentTerm",
  );
  assertNonNegativeInteger(
    currentEpoch,
    "currentEpoch",
  );
  assertNonNegativeInteger(
    initialFencingToken,
    "initialFencingToken",
  );

  return Object.freeze({
    clock:
      options.clock ??
      new SystemSwarmPartitionClock(),
    idGenerator:
      options.idGenerator ??
      new StableSwarmPartitionIdGenerator(),
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmPartitionFingerprintGenerator(),
    weights,
    currentTerm,
    currentEpoch,
    initialFencingToken,
    requireHealthyNodes:
      options.requireHealthyNodes ?? true,
    requireActiveNodes:
      options.requireActiveNodes ?? true,
    requireDeterministicNodes:
      options.requireDeterministicNodes ?? true,
    requireReplaySafeNodes:
      options.requireReplaySafeNodes ?? true,
    allowPartialReplication:
      options.allowPartialReplication ?? false,
    preserveExistingOwnership:
      options.preserveExistingOwnership ?? true,
  });
}

function validatePolicy(
  policy: TradingSwarmPartitionPolicy,
): void {
  if (
    policy === undefined ||
    policy === null
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_POLICY",
      "A partition policy is required.",
    );
  }

  assertPositiveInteger(
    policy.replicationFactor,
    "replicationFactor",
  );
  assertPositiveInteger(
    policy.maximumPartitionsPerNode,
    "maximumPartitionsPerNode",
  );
  assertUnitScore(
    policy.rebalanceThreshold,
    "rebalanceThreshold",
  );
  assertPositiveFinite(
    policy.leaseDurationMs,
    "leaseDurationMs",
  );
  assertNonNegativeFinite(
    policy.leaseRenewalWindowMs,
    "leaseRenewalWindowMs",
  );

  if (
    policy.leaseRenewalWindowMs >
    policy.leaseDurationMs
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_POLICY",
      "leaseRenewalWindowMs cannot exceed leaseDurationMs.",
    );
  }
}

function objectiveCapabilities(
  objective: AiTradingSwarmRunRequest["objective"],
): readonly TradingSwarmCapability[] {
  switch (objective) {
    case "GLOBAL_MARKET_ASSESSMENT":
    case "REGIME_TRANSITION_RESPONSE":
      return Object.freeze([
        "DISTRIBUTE_MARKET_ANALYSIS",
      ]);
    case "DISTRIBUTED_TRADE_DECISION":
    case "FULL_SWARM_DECISION":
      return Object.freeze([
        "COORDINATE_MULTI_AGENT_RUNS",
        "FORM_DISTRIBUTED_CONSENSUS",
      ]);
    case "CROSS_MARKET_STRATEGY_SELECTION":
      return Object.freeze([
        "DISTRIBUTE_STRATEGY_ANALYSIS",
      ]);
    case "DISTRIBUTED_PORTFOLIO_REBALANCE":
      return Object.freeze([
        "DISTRIBUTE_PORTFOLIO_ANALYSIS",
      ]);
    case "SYSTEMIC_RISK_RESPONSE":
      return Object.freeze([
        "DISTRIBUTE_RISK_ANALYSIS",
      ]);
    case "DISTRIBUTED_ARBITRAGE_DISCOVERY":
      return Object.freeze([
        "DISTRIBUTE_ARBITRAGE_ANALYSIS",
      ]);
    case "CROSS_EXCHANGE_EXECUTION":
      return Object.freeze([
        "PLAN_DISTRIBUTED_EXECUTION",
        "EXECUTE_TRADES",
      ]);
    case "LIQUIDITY_COORDINATION":
      return Object.freeze([
        "DISTRIBUTE_MARKET_ANALYSIS",
        "PLAN_DISTRIBUTED_EXECUTION",
      ]);
    case "AUTONOMOUS_SWARM_OPTIMIZATION":
      return Object.freeze([
        "BALANCE_WORKLOAD",
        "LEARN_FROM_OUTCOMES",
      ]);
    case "DISASTER_RECOVERY":
      return Object.freeze([
        "RECOVER_FAILED_NODES",
        "REPLICATE_STATE",
      ]);
  }
}

function objectivePriority(
  objective: AiTradingSwarmRunRequest["objective"],
): TradingSwarmPriority {
  switch (objective) {
    case "DISASTER_RECOVERY":
      return "EMERGENCY";
    case "SYSTEMIC_RISK_RESPONSE":
      return "CRITICAL";
    case "CROSS_EXCHANGE_EXECUTION":
    case "FULL_SWARM_DECISION":
      return "VERY_HIGH";
    case "DISTRIBUTED_TRADE_DECISION":
    case "DISTRIBUTED_PORTFOLIO_REBALANCE":
    case "REGIME_TRANSITION_RESPONSE":
      return "HIGH";
    case "GLOBAL_MARKET_ASSESSMENT":
    case "CROSS_MARKET_STRATEGY_SELECTION":
    case "DISTRIBUTED_ARBITRAGE_DISCOVERY":
    case "LIQUIDITY_COORDINATION":
      return "NORMAL";
    case "AUTONOMOUS_SWARM_OPTIMIZATION":
      return "LOW";
  }
}

function higherPriority(
  left: TradingSwarmPriority,
  right: TradingSwarmPriority,
): TradingSwarmPriority {
  return priorityRank(right) > priorityRank(left)
    ? right
    : left;
}

function priorityRank(
  priority: TradingSwarmPriority,
): number {
  switch (priority) {
    case "BACKGROUND":
      return 0;
    case "LOW":
      return 1;
    case "NORMAL":
      return 2;
    case "HIGH":
      return 3;
    case "VERY_HIGH":
      return 4;
    case "CRITICAL":
      return 5;
    case "EMERGENCY":
      return 6;
  }
}

function capabilityProficiency(
  node: TradingSwarmNodeRegistration,
  capabilities: readonly TradingSwarmCapability[],
): number {
  if (capabilities.length === 0) {
    return 1;
  }

  const declarations = capabilities
    .map((capability) =>
      node.capabilities.find(
        (item) =>
          item.capability === capability &&
          item.enabled,
      ),
    )
    .filter(
      (
        item,
      ): item is TradingSwarmNodeRegistration["capabilities"][number] =>
        item !== undefined,
    );

  if (
    declarations.length !==
    capabilities.length
  ) {
    return 0;
  }

  return clamp01(
    average(
      declarations.map(
        (item) => item.proficiency,
      ),
    ),
  );
}

function localityScore(
  node: TradingSwarmNodeRegistration,
  partition: TradingSwarmPartition,
): number {
  const metadata = partition.metadata;
  const region =
    typeof metadata?.region === "string"
      ? metadata.region
      : undefined;
  const zone =
    typeof metadata?.zone === "string"
      ? metadata.zone
      : undefined;

  if (
    zone !== undefined &&
    node.identity.zone === zone
  ) {
    return 1;
  }

  if (
    region !== undefined &&
    node.identity.region === region
  ) {
    return 0.75;
  }

  return 0.5;
}

function diversityBonus(
  candidate: NodeAssignmentState,
  owner: NodeAssignmentState | undefined,
): number {
  if (owner === undefined) {
    return 0;
  }

  if (
    candidate.node.identity.region !==
    owner.node.identity.region
  ) {
    return 0.05;
  }

  if (
    candidate.node.identity.zone !==
    owner.node.identity.zone
  ) {
    return 0.025;
  }

  return 0;
}

function assignmentWorkloadRatio(
  state: NodeAssignmentState,
  maximumPartitionsPerNode: number,
): number {
  return clamp01(
    state.assignmentCount /
      Math.max(1, maximumPartitionsPerNode),
  );
}

function consistentHashAffinity(
  partitionId: string,
  nodeId: string,
): number {
  const hash = Number.parseInt(
    stableHash(`${partitionId}:${nodeId}`),
    16,
  );

  return clamp01(hash / 0xffffffff);
}

function mergeCapabilities(
  left: readonly TradingSwarmCapability[],
  right: readonly TradingSwarmCapability[],
): readonly TradingSwarmCapability[] {
  return uniqueSorted([...left, ...right]);
}

function partitionIdentity(
  type: TradingSwarmPartitionType,
  key: string,
): string {
  return `${type}:${key}`;
}

function uniqueMap<TValue>(
  values: readonly TValue[],
  keySelector: (value: TValue) => string,
  name: string,
): ReadonlyMap<string, TValue> {
  const result = new Map<string, TValue>();

  for (const value of values) {
    const key = keySelector(value);

    if (result.has(key)) {
      throw new SwarmPartitionManagerError(
        "INVALID_REQUEST",
        `${name} contains duplicate key "${key}".`,
      );
    }

    result.set(key, value);
  }

  return result;
}

function compareBlueprints(
  left: PartitionBlueprint,
  right: PartitionBlueprint,
): number {
  const typeOrder =
    left.type.localeCompare(right.type);

  return typeOrder !== 0
    ? typeOrder
    : left.key.localeCompare(right.key);
}

function comparePartitions(
  left: TradingSwarmPartition,
  right: TradingSwarmPartition,
): number {
  const typeOrder =
    left.type.localeCompare(right.type);

  if (typeOrder !== 0) {
    return typeOrder;
  }

  const keyOrder =
    left.key.localeCompare(right.key);

  return keyOrder !== 0
    ? keyOrder
    : left.partitionId.localeCompare(
        right.partitionId,
      );
}

function comparePartitionsForAssignment(
  left: TradingSwarmPartition,
  right: TradingSwarmPartition,
): number {
  const priorityOrder =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const weightOrder =
    right.weight - left.weight;

  return weightOrder !== 0
    ? weightOrder
    : comparePartitions(left, right);
}

function compareRegistrations(
  left: TradingSwarmNodeRegistration,
  right: TradingSwarmNodeRegistration,
): number {
  return left.identity.nodeId.localeCompare(
    right.identity.nodeId,
  );
}

function compareScoredNodes(
  left: ScoredNode,
  right: ScoredNode,
): number {
  const scoreOrder =
    right.score - left.score;

  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  const assignmentOrder =
    left.state.assignmentCount -
    right.state.assignmentCount;

  if (assignmentOrder !== 0) {
    return assignmentOrder;
  }

  const reliabilityOrder =
    right.state.health.reliabilityScore -
    left.state.health.reliabilityScore;

  if (reliabilityOrder !== 0) {
    return reliabilityOrder;
  }

  return left.state.node.identity.nodeId.localeCompare(
    right.state.node.identity.nodeId,
  );
}

function compareLeases(
  left: TradingSwarmPartitionLease,
  right: TradingSwarmPartitionLease,
): number {
  const partitionOrder =
    left.partitionId.localeCompare(
      right.partitionId,
    );

  return partitionOrder !== 0
    ? partitionOrder
    : left.ownerNodeId.localeCompare(
        right.ownerNodeId,
      );
}

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): readonly TValue[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function assertPositiveInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_POLICY",
      `${name} must be a positive integer.`,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_REQUEST",
      `${name} must be a non-negative integer.`,
    );
  }
}

function assertUnitScore(
  value: number,
  name: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_POLICY",
      `${name} must be between 0 and 1.`,
    );
  }
}

function assertPositiveFinite(
  value: number,
  name: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_POLICY",
      `${name} must be positive and finite.`,
    );
  }
}

function assertNonNegativeFinite(
  value: number,
  name: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new SwarmPartitionManagerError(
      "INVALID_POLICY",
      `${name} must be non-negative and finite.`,
    );
  }
}

function deepFreeze<TValue>(
  value: TValue,
): TValue {
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
  return JSON.stringify(
    normalizeForStableJson(value),
  );
}

function normalizeForStableJson(
  value: unknown,
): unknown {
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

      output[key] =
        normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}