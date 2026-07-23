/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-task-allocator.ts
 *
 * Deterministic, immutable task allocation across eligible swarm nodes.
 */

import {
  type TradingSwarmCapability,
  type TradingSwarmCapabilityDeclaration,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmNodeHealth,
  type TradingSwarmNodeId,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeTrustScore,
  type TradingSwarmPartitionLease,
  type TradingSwarmScore,
  type TradingSwarmTask,
  type TradingSwarmTaskAllocatorPort,
  type TradingSwarmTaskAssignment,
  type TradingSwarmTimestamp,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmTaskAllocatorErrorCode =
  | "INVALID_TASKS"
  | "INVALID_NODES"
  | "INVALID_HEALTH"
  | "INVALID_TRUST"
  | "INVALID_LEASES"
  | "DUPLICATE_NODE"
  | "DUPLICATE_HEALTH"
  | "DUPLICATE_TRUST"
  | "DUPLICATE_LEASE"
  | "MISSING_NODE_HEALTH"
  | "NO_ELIGIBLE_NODE"
  | "CAPACITY_EXHAUSTED"
  | "LEASE_OWNER_UNAVAILABLE"
  | "ASSIGNMENT_FAILED";

export interface SwarmTaskAllocatorErrorDetails {
  readonly taskId?: string;
  readonly missionId?: string;
  readonly nodeId?: string;
  readonly partitionId?: string;
  readonly field?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly cause?: unknown;
}

export class SwarmTaskAllocatorError extends Error {
  public readonly code: SwarmTaskAllocatorErrorCode;
  public readonly details: SwarmTaskAllocatorErrorDetails;

  public constructor(
    code: SwarmTaskAllocatorErrorCode,
    message: string,
    details: SwarmTaskAllocatorErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmTaskAllocatorError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmTaskAllocatorWeights {
  readonly capability: number;
  readonly readiness: number;
  readonly reliability: number;
  readonly latency: number;
  readonly throughput: number;
  readonly synchronization: number;
  readonly freshness: number;
  readonly consensusParticipation: number;
  readonly trust: number;
  readonly capacity: number;
  readonly leaseAffinity: number;
  readonly deterministicSafety: number;
}

export interface SwarmTaskAllocatorOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly weights?: Partial<SwarmTaskAllocatorWeights>;
  readonly minimumReadinessScore?: TradingSwarmScore;
  readonly minimumReliabilityScore?: TradingSwarmScore;
  readonly minimumSynchronizationScore?: TradingSwarmScore;
  readonly minimumTrustScore?: TradingSwarmScore;
  readonly requireHealthyNode?: boolean;
  readonly requireDeterministicNode?: boolean;
  readonly requireReplaySafeNode?: boolean;
  readonly requirePartitionLease?: boolean;
  readonly allowBusyNodes?: boolean;
  readonly allowDegradedNodes?: boolean;
  readonly allowMissingTrustScore?: boolean;
  readonly allowExpiredLease?: boolean;
  readonly assignmentTimestampStrategy?: "TASK_CREATED_AT" | "LATEST_INPUT_TIMESTAMP";
  readonly failOnUnassignedTask?: boolean;
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly weights: SwarmTaskAllocatorWeights;
  readonly minimumReadinessScore: TradingSwarmScore;
  readonly minimumReliabilityScore: TradingSwarmScore;
  readonly minimumSynchronizationScore: TradingSwarmScore;
  readonly minimumTrustScore: TradingSwarmScore;
  readonly requireHealthyNode: boolean;
  readonly requireDeterministicNode: boolean;
  readonly requireReplaySafeNode: boolean;
  readonly requirePartitionLease: boolean;
  readonly allowBusyNodes: boolean;
  readonly allowDegradedNodes: boolean;
  readonly allowMissingTrustScore: boolean;
  readonly allowExpiredLease: boolean;
  readonly assignmentTimestampStrategy:
    | "TASK_CREATED_AT"
    | "LATEST_INPUT_TIMESTAMP";
  readonly failOnUnassignedTask: boolean;
}

interface NodeAllocationState {
  readonly node: TradingSwarmNodeRegistration;
  readonly health: TradingSwarmNodeHealth;
  readonly trust: TradingSwarmNodeTrustScore | undefined;
  readonly assignedTaskIds: string[];
  readonly assignedMissionIds: Set<string>;
  assignedTaskCount: number;
  assignedAgentRunCount: number;
}

interface AllocationCandidate {
  readonly state: NodeAllocationState;
  readonly lease: TradingSwarmPartitionLease | undefined;
  readonly capabilityScore: number;
  readonly capacityScore: number;
  readonly healthScore: number;
  readonly trustScore: number;
  readonly leaseScore: number;
  readonly deterministicScore: number;
  readonly finalScore: number;
  readonly rationale: string;
}

/* ========================================================================== *
 * Default weights
 * ========================================================================== */

export const DEFAULT_SWARM_TASK_ALLOCATOR_WEIGHTS:
  SwarmTaskAllocatorWeights = Object.freeze({
    capability: 0.24,
    readiness: 0.09,
    reliability: 0.11,
    latency: 0.05,
    throughput: 0.06,
    synchronization: 0.09,
    freshness: 0.05,
    consensusParticipation: 0.04,
    trust: 0.12,
    capacity: 0.09,
    leaseAffinity: 0.04,
    deterministicSafety: 0.02,
  });

/* ========================================================================== *
 * Allocator
 * ========================================================================== */

export class SwarmTaskAllocator
  implements TradingSwarmTaskAllocatorPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmTaskAllocatorOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public assign(
    tasks: readonly TradingSwarmTask[],
    nodes: readonly TradingSwarmNodeRegistration[],
    health: readonly TradingSwarmNodeHealth[],
    leases: readonly TradingSwarmPartitionLease[],
    trust: readonly TradingSwarmNodeTrustScore[],
  ): readonly TradingSwarmTaskAssignment[] {
    try {
      this.validateInputs(
        tasks,
        nodes,
        health,
        leases,
        trust,
      );

      const healthByNodeId = indexUnique(
        health,
        (item) => item.nodeId,
        "DUPLICATE_HEALTH",
        "node health",
      );

      const trustByNodeId = indexUnique(
        trust,
        (item) => item.nodeId,
        "DUPLICATE_TRUST",
        "node trust score",
      );

      const leaseByPartitionId =
        indexUnique(
          leases,
          (item) => item.partitionId,
          "DUPLICATE_LEASE",
          "partition lease",
        );

      const states = nodes
        .map<NodeAllocationState>((node) => {
          const nodeHealth = healthByNodeId.get(
            node.identity.nodeId,
          );

          if (nodeHealth === undefined) {
            throw new SwarmTaskAllocatorError(
              "MISSING_NODE_HEALTH",
              `No health snapshot exists for node "${node.identity.nodeId}".`,
              {
                nodeId: node.identity.nodeId,
              },
            );
          }

          return {
            node,
            health: nodeHealth,
            trust: trustByNodeId.get(
              node.identity.nodeId,
            ),
            assignedTaskIds: [],
            assignedMissionIds: new Set<string>(),
            assignedTaskCount: 0,
            assignedAgentRunCount: 0,
          };
        })
        .sort((left, right) =>
          left.node.identity.nodeId.localeCompare(
            right.node.identity.nodeId,
          ),
        );

      const assignments: TradingSwarmTaskAssignment[] =
        [];

      for (const task of orderTasks(tasks)) {
        const assignmentTime =
          resolveAssignmentTimestamp(
            task,
            health,
            trust,
            leases,
            this.options
              .assignmentTimestampStrategy,
          );

        const lease =
          task.partitionId === undefined
            ? undefined
            : leaseByPartitionId.get(
                task.partitionId,
              );

        const candidates = states
          .map<AllocationCandidate | undefined>(
            (state) =>
              this.evaluateCandidate(
                task,
                state,
                lease,
                assignmentTime,
              ),
          )
          .filter(
            (
              candidate,
            ): candidate is AllocationCandidate =>
              candidate !== undefined,
          )
          .sort(compareCandidates);

        const winner = candidates[0];

        if (winner === undefined) {
          if (
            this.options.failOnUnassignedTask
          ) {
            throw this.createNoCandidateError(
              task,
              lease,
              states,
            );
          }

          continue;
        }

        const assignedTask = deepFreeze({
          ...task,
          status: "ASSIGNED" as const,
          assignedNodeId:
            winner.state.node.identity.nodeId,
          assignedAtMs: assignmentTime,
        });

        const assignmentBase = {
          task: assignedTask,
          node: winner.state.node,
          ...(winner.lease === undefined
            ? {}
            : { lease: winner.lease }),
          assignedAtMs: assignmentTime,
          assignmentScore:
            clampScore(winner.finalScore),
          rationale: winner.rationale,
        } satisfies Omit<
          TradingSwarmTaskAssignment,
          "deterministicFingerprint"
        >;

        const assignment =
          deepFreeze<TradingSwarmTaskAssignment>({
            ...assignmentBase,
            deterministicFingerprint:
              this.options
                .fingerprintGenerator
                .fingerprint(
                  assignmentFingerprintInput(
                    assignmentBase,
                  ),
                ),
          });

        assignments.push(assignment);

        winner.state.assignedTaskCount += 1;
        winner.state.assignedTaskIds.push(
          task.taskId,
        );
        winner.state.assignedMissionIds.add(
          task.missionId,
        );

        if (
          task.type ===
          "RUN_MULTI_AGENT_COLLECTIVE"
        ) {
          winner.state.assignedAgentRunCount += 1;
        }
      }

      return Object.freeze(assignments);
    } catch (error) {
      if (
        error instanceof
        SwarmTaskAllocatorError
      ) {
        throw error;
      }

      throw new SwarmTaskAllocatorError(
        "ASSIGNMENT_FAILED",
        "Failed to allocate swarm tasks deterministically.",
        { cause: error },
      );
    }
  }

  private evaluateCandidate(
    task: TradingSwarmTask,
    state: NodeAllocationState,
    lease: TradingSwarmPartitionLease | undefined,
    assignmentTime: TradingSwarmTimestamp,
  ): AllocationCandidate | undefined {
    if (
      !isLifecycleEligible(
        state.health,
        this.options.allowDegradedNodes,
      )
    ) {
      return undefined;
    }

    if (
      !isAvailabilityEligible(
        state.health,
        this.options.allowBusyNodes,
      )
    ) {
      return undefined;
    }

    if (
      this.options.requireHealthyNode &&
      !state.health.healthy
    ) {
      return undefined;
    }

    if (
      this.options.requireDeterministicNode &&
      !state.node.deterministic
    ) {
      return undefined;
    }

    if (
      this.options.requireReplaySafeNode &&
      !state.node.replaySafe
    ) {
      return undefined;
    }

    if (
      state.health.readinessScore <
        this.options.minimumReadinessScore ||
      state.health.reliabilityScore <
        this.options.minimumReliabilityScore ||
      state.health.synchronizationScore <
        this.options
          .minimumSynchronizationScore
    ) {
      return undefined;
    }

    if (
      state.trust === undefined &&
      !this.options.allowMissingTrustScore
    ) {
      return undefined;
    }

    if (
      state.trust !== undefined &&
      (state.trust.quarantined ||
        state.trust.overallTrust <
          this.options.minimumTrustScore)
    ) {
      return undefined;
    }

    const capabilityScore =
      calculateCapabilityScore(
        task.requiredCapabilities,
        state.node.capabilities,
        task,
      );

    if (capabilityScore === undefined) {
      return undefined;
    }

    if (!hasRemainingCapacity(task, state)) {
      return undefined;
    }

    const matchedLease =
      resolveCandidateLease(
        task,
        state.node.identity.nodeId,
        lease,
        assignmentTime,
        this.options.requirePartitionLease,
        this.options.allowExpiredLease,
      );

    if (
      task.partitionId !== undefined &&
      this.options.requirePartitionLease &&
      matchedLease === undefined
    ) {
      return undefined;
    }

    const capacityScore =
      calculateCapacityScore(task, state);
    const healthScore =
      calculateHealthComposite(
        state.health,
        this.options.weights,
      );
    const trustScore =
      calculateTrustComposite(state.trust);
    const leaseScore =
      calculateLeaseScore(
        task,
        matchedLease,
      );
    const deterministicScore =
      calculateDeterministicScore(
        state.node,
      );

    const finalScore = weightedScore(
      capabilityScore,
      capacityScore,
      healthScore,
      trustScore,
      leaseScore,
      deterministicScore,
      this.options.weights,
    );

    return deepFreeze({
      state,
      lease: matchedLease,
      capabilityScore,
      capacityScore,
      healthScore,
      trustScore,
      leaseScore,
      deterministicScore,
      finalScore,
      rationale: buildRationale(
        task,
        state,
        matchedLease,
        {
          capabilityScore,
          capacityScore,
          healthScore,
          trustScore,
          leaseScore,
          deterministicScore,
          finalScore,
        },
      ),
    });
  }

  private createNoCandidateError(
    task: TradingSwarmTask,
    lease: TradingSwarmPartitionLease | undefined,
    states: readonly NodeAllocationState[],
  ): SwarmTaskAllocatorError {
    if (
      task.partitionId !== undefined &&
      this.options.requirePartitionLease
    ) {
      if (lease === undefined) {
        return new SwarmTaskAllocatorError(
          "LEASE_OWNER_UNAVAILABLE",
          `Task "${task.taskId}" requires partition "${task.partitionId}", but no lease exists.`,
          {
            taskId: task.taskId,
            missionId: task.missionId,
            partitionId: task.partitionId,
          },
        );
      }

      const owner = states.find(
        (state) =>
          state.node.identity.nodeId ===
          lease.ownerNodeId,
      );

      if (owner === undefined) {
        return new SwarmTaskAllocatorError(
          "LEASE_OWNER_UNAVAILABLE",
          `Lease owner "${lease.ownerNodeId}" is not registered.`,
          {
            taskId: task.taskId,
            missionId: task.missionId,
            partitionId: task.partitionId,
            nodeId: lease.ownerNodeId,
          },
        );
      }
    }

    const capacityAvailable = states.some(
      (state) =>
        hasRemainingCapacity(task, state),
    );

    if (!capacityAvailable) {
      return new SwarmTaskAllocatorError(
        "CAPACITY_EXHAUSTED",
        `No node has remaining capacity for task "${task.taskId}".`,
        {
          taskId: task.taskId,
          missionId: task.missionId,
        },
      );
    }

    return new SwarmTaskAllocatorError(
      "NO_ELIGIBLE_NODE",
      `No eligible node can execute task "${task.taskId}".`,
      {
        taskId: task.taskId,
        missionId: task.missionId,
        partitionId: task.partitionId,
        requiredCapabilities:
          task.requiredCapabilities,
      },
    );
  }

  private validateInputs(
    tasks: readonly TradingSwarmTask[],
    nodes: readonly TradingSwarmNodeRegistration[],
    health: readonly TradingSwarmNodeHealth[],
    leases: readonly TradingSwarmPartitionLease[],
    trust: readonly TradingSwarmNodeTrustScore[],
  ): void {
    const taskIds = new Set<string>();

    for (const task of tasks) {
      assertNonEmptyText(
        task.taskId,
        "task.taskId",
      );
      assertNonEmptyText(
        task.missionId,
        "task.missionId",
      );

      if (taskIds.has(task.taskId)) {
        throw new SwarmTaskAllocatorError(
          "INVALID_TASKS",
          `Duplicate task "${task.taskId}".`,
          { taskId: task.taskId },
        );
      }

      taskIds.add(task.taskId);
    }

    const nodeIds = new Set<string>();

    for (const node of nodes) {
      const nodeId = node.identity.nodeId;

      assertNonEmptyText(
        nodeId,
        "node.identity.nodeId",
      );

      if (nodeIds.has(nodeId)) {
        throw new SwarmTaskAllocatorError(
          "DUPLICATE_NODE",
          `Duplicate node "${nodeId}".`,
          { nodeId },
        );
      }

      nodeIds.add(nodeId);
    }

    for (const item of health) {
      validateScore(
        item.readinessScore,
        "health.readinessScore",
      );
      validateScore(
        item.reliabilityScore,
        "health.reliabilityScore",
      );
      validateScore(
        item.latencyScore,
        "health.latencyScore",
      );
      validateScore(
        item.throughputScore,
        "health.throughputScore",
      );
      validateScore(
        item.synchronizationScore,
        "health.synchronizationScore",
      );
      validateScore(
        item.dataFreshnessScore,
        "health.dataFreshnessScore",
      );
      validateScore(
        item.consensusParticipationScore,
        "health.consensusParticipationScore",
      );
    }

    for (const item of trust) {
      validateScore(
        item.overallTrust,
        "trust.overallTrust",
      );
    }

    for (const lease of leases) {
      if (
        lease.expiresAtMs <
        lease.acquiredAtMs
      ) {
        throw new SwarmTaskAllocatorError(
          "INVALID_LEASES",
          `Lease "${lease.leaseId}" expires before it was acquired.`,
          {
            partitionId:
              lease.partitionId,
            nodeId: lease.ownerNodeId,
          },
        );
      }
    }
  }
}

/* ========================================================================== *
 * Factory and deterministic fingerprint generator
 * ========================================================================== */

export function createSwarmTaskAllocator(
  options: SwarmTaskAllocatorOptions = {},
): SwarmTaskAllocator {
  return new SwarmTaskAllocator(options);
}

export class StableSwarmTaskAssignmentFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-assignment-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Eligibility and capability matching
 * ========================================================================== */

function isLifecycleEligible(
  health: TradingSwarmNodeHealth,
  allowDegradedNodes: boolean,
): boolean {
  if (
    health.lifecycleState === "READY" ||
    health.lifecycleState === "ACTIVE"
  ) {
    return true;
  }

  return (
    allowDegradedNodes &&
    health.lifecycleState === "DEGRADED"
  );
}

function isAvailabilityEligible(
  health: TradingSwarmNodeHealth,
  allowBusyNodes: boolean,
): boolean {
  if (
    health.availability === "AVAILABLE"
  ) {
    return true;
  }

  return (
    allowBusyNodes &&
    health.availability === "BUSY"
  );
}

function calculateCapabilityScore(
  required: readonly TradingSwarmCapability[],
  declarations: readonly TradingSwarmCapabilityDeclaration[],
  task: TradingSwarmTask,
): number | undefined {
  if (required.length === 0) {
    return 1;
  }

  const byCapability = new Map<
    TradingSwarmCapability,
    TradingSwarmCapabilityDeclaration
  >();

  for (const declaration of declarations) {
    if (
      declaration.enabled &&
      !byCapability.has(
        declaration.capability,
      )
    ) {
      byCapability.set(
        declaration.capability,
        declaration,
      );
    }
  }

  let total = 0;

  for (const capability of required) {
    const declaration =
      byCapability.get(capability);

    if (declaration === undefined) {
      return undefined;
    }

    if (
      !supportsTaskScope(
        declaration,
        task,
      )
    ) {
      return undefined;
    }

    total += declaration.proficiency;
  }

  return clampScore(
    total / required.length,
  );
}

function supportsTaskScope(
  declaration: TradingSwarmCapabilityDeclaration,
  task: TradingSwarmTask,
): boolean {
  const marketId =
    typeof task.metadata?.marketId === "string"
      ? task.metadata.marketId
      : undefined;

  const strategyId =
    typeof task.metadata?.strategyId === "string"
      ? task.metadata.strategyId
      : undefined;

  if (
    marketId !== undefined &&
    declaration.supportedMarkets !==
      undefined &&
    declaration.supportedMarkets.length > 0 &&
    !declaration.supportedMarkets.includes(
      marketId,
    )
  ) {
    return false;
  }

  if (
    strategyId !== undefined &&
    declaration.supportedStrategies !==
      undefined &&
    declaration.supportedStrategies.length >
      0 &&
    !declaration.supportedStrategies.includes(
      strategyId,
    )
  ) {
    return false;
  }

  return true;
}

/* ========================================================================== *
 * Capacity and lease handling
 * ========================================================================== */

function hasRemainingCapacity(
  task: TradingSwarmTask,
  state: NodeAllocationState,
): boolean {
  const activeTaskCount =
    state.health.activeTaskCount +
    state.assignedTaskCount;

  if (
    activeTaskCount >=
    state.node.capacity
      .maximumConcurrentTasks
  ) {
    return false;
  }

  const missionAlreadyAssigned =
    state.assignedMissionIds.has(
      task.missionId,
    );

  const activeMissionCount =
    state.health.activeMissionCount +
    state.assignedMissionIds.size;

  if (
    !missionAlreadyAssigned &&
    activeMissionCount >=
      state.node.capacity
        .maximumConcurrentMissions
  ) {
    return false;
  }

  if (
    task.type ===
      "RUN_MULTI_AGENT_COLLECTIVE"
  ) {
    const activeRuns =
      state.health
        .activeMultiAgentRunCount +
      state.assignedAgentRunCount;

    if (
      activeRuns >=
      state.node.capacity.maximumAgentRuns
    ) {
      return false;
    }
  }

  return true;
}

function calculateCapacityScore(
  task: TradingSwarmTask,
  state: NodeAllocationState,
): number {
  const taskCapacity =
    state.node.capacity
      .maximumConcurrentTasks;
  const taskLoad =
    state.health.activeTaskCount +
    state.assignedTaskCount;

  const taskHeadroom =
    taskCapacity <= 0
      ? 0
      : 1 - taskLoad / taskCapacity;

  const missionCapacity =
    state.node.capacity
      .maximumConcurrentMissions;
  const missionLoad =
    state.health.activeMissionCount +
    state.assignedMissionIds.size;

  const missionHeadroom =
    missionCapacity <= 0
      ? 0
      : 1 -
        missionLoad / missionCapacity;

  let runHeadroom = 1;

  if (
    task.type ===
      "RUN_MULTI_AGENT_COLLECTIVE"
  ) {
    const runCapacity =
      state.node.capacity.maximumAgentRuns;
    const runLoad =
      state.health
        .activeMultiAgentRunCount +
      state.assignedAgentRunCount;

    runHeadroom =
      runCapacity <= 0
        ? 0
        : 1 - runLoad / runCapacity;
  }

  return clampScore(
    task.type ===
      "RUN_MULTI_AGENT_COLLECTIVE"
      ? (taskHeadroom +
          missionHeadroom +
          runHeadroom) /
          3
      : (taskHeadroom +
          missionHeadroom) /
          2,
  );
}

function resolveCandidateLease(
  task: TradingSwarmTask,
  nodeId: TradingSwarmNodeId,
  lease: TradingSwarmPartitionLease | undefined,
  assignmentTime: TradingSwarmTimestamp,
  requirePartitionLease: boolean,
  allowExpiredLease: boolean,
): TradingSwarmPartitionLease | undefined {
  if (task.partitionId === undefined) {
    return undefined;
  }

  if (lease === undefined) {
    return requirePartitionLease
      ? undefined
      : undefined;
  }

  if (lease.ownerNodeId !== nodeId) {
    return undefined;
  }

  if (
    !allowExpiredLease &&
    lease.expiresAtMs < assignmentTime
  ) {
    return undefined;
  }

  return lease;
}

function calculateLeaseScore(
  task: TradingSwarmTask,
  lease: TradingSwarmPartitionLease | undefined,
): number {
  if (task.partitionId === undefined) {
    return 1;
  }

  return lease === undefined ? 0 : 1;
}

/* ========================================================================== *
 * Scoring
 * ========================================================================== */

function calculateHealthComposite(
  health: TradingSwarmNodeHealth,
  weights: SwarmTaskAllocatorWeights,
): number {
  const healthWeight =
    weights.readiness +
    weights.reliability +
    weights.latency +
    weights.throughput +
    weights.synchronization +
    weights.freshness +
    weights.consensusParticipation;

  if (healthWeight <= 0) {
    return 0;
  }

  return clampScore(
    (health.readinessScore *
      weights.readiness +
      health.reliabilityScore *
        weights.reliability +
      health.latencyScore *
        weights.latency +
      health.throughputScore *
        weights.throughput +
      health.synchronizationScore *
        weights.synchronization +
      health.dataFreshnessScore *
        weights.freshness +
      health.consensusParticipationScore *
        weights.consensusParticipation) /
      healthWeight,
  );
}

function calculateTrustComposite(
  trust: TradingSwarmNodeTrustScore | undefined,
): number {
  if (trust === undefined) {
    return 0.5;
  }

  return clampScore(
    (trust.overallTrust * 2 +
      trust.reliabilityScore +
      trust.consensusIntegrityScore +
      trust.executionQualityScore +
      trust.recoveryQualityScore +
      trust.synchronizationScore +
      trust.collaborationScore +
      trust.governanceComplianceScore) /
      9,
  );
}

function calculateDeterministicScore(
  node: TradingSwarmNodeRegistration,
): number {
  if (
    node.deterministic &&
    node.replaySafe
  ) {
    return 1;
  }

  if (
    node.deterministic ||
    node.replaySafe
  ) {
    return 0.5;
  }

  return 0;
}

function weightedScore(
  capabilityScore: number,
  capacityScore: number,
  healthScore: number,
  trustScore: number,
  leaseScore: number,
  deterministicScore: number,
  weights: SwarmTaskAllocatorWeights,
): number {
  const healthWeight =
    weights.readiness +
    weights.reliability +
    weights.latency +
    weights.throughput +
    weights.synchronization +
    weights.freshness +
    weights.consensusParticipation;

  const totalWeight =
    weights.capability +
    healthWeight +
    weights.trust +
    weights.capacity +
    weights.leaseAffinity +
    weights.deterministicSafety;

  if (totalWeight <= 0) {
    return 0;
  }

  return clampScore(
    (capabilityScore *
      weights.capability +
      healthScore * healthWeight +
      trustScore * weights.trust +
      capacityScore * weights.capacity +
      leaseScore *
        weights.leaseAffinity +
      deterministicScore *
        weights.deterministicSafety) /
      totalWeight,
  );
}

function buildRationale(
  task: TradingSwarmTask,
  state: NodeAllocationState,
  lease: TradingSwarmPartitionLease | undefined,
  scores: Readonly<{
    capabilityScore: number;
    capacityScore: number;
    healthScore: number;
    trustScore: number;
    leaseScore: number;
    deterministicScore: number;
    finalScore: number;
  }>,
): string {
  const leaseText =
    task.partitionId === undefined
      ? "no partition lease required"
      : lease === undefined
        ? "partition lease not required"
        : `owns lease ${lease.leaseId}`;

  return [
    `Selected node ${state.node.identity.nodeId}`,
    `for task ${task.taskId}`,
    `because it satisfies ${task.requiredCapabilities.length} required capabilities`,
    leaseText,
    `capability=${formatScore(scores.capabilityScore)}`,
    `health=${formatScore(scores.healthScore)}`,
    `trust=${formatScore(scores.trustScore)}`,
    `capacity=${formatScore(scores.capacityScore)}`,
    `determinism=${formatScore(scores.deterministicScore)}`,
    `final=${formatScore(scores.finalScore)}`,
  ].join("; ");
}

function compareCandidates(
  left: AllocationCandidate,
  right: AllocationCandidate,
): number {
  const scoreOrder =
    right.finalScore - left.finalScore;

  if (
    Math.abs(scoreOrder) >
    Number.EPSILON
  ) {
    return scoreOrder;
  }

  const capabilityOrder =
    right.capabilityScore -
    left.capabilityScore;

  if (
    Math.abs(capabilityOrder) >
    Number.EPSILON
  ) {
    return capabilityOrder;
  }

  const trustOrder =
    right.trustScore - left.trustScore;

  if (
    Math.abs(trustOrder) >
    Number.EPSILON
  ) {
    return trustOrder;
  }

  const capacityOrder =
    right.capacityScore -
    left.capacityScore;

  if (
    Math.abs(capacityOrder) >
    Number.EPSILON
  ) {
    return capacityOrder;
  }

  return left.state.node.identity.nodeId.localeCompare(
    right.state.node.identity.nodeId,
  );
}

/* ========================================================================== *
 * Ordering and timestamps
 * ========================================================================== */

function orderTasks(
  tasks: readonly TradingSwarmTask[],
): readonly TradingSwarmTask[] {
  return Object.freeze(
    [...tasks].sort((left, right) => {
      const dependencyOrder =
        left.dependencies.length -
        right.dependencies.length;

      if (dependencyOrder !== 0) {
        return dependencyOrder;
      }

      const priorityOrder =
        priorityRank(right.priority) -
        priorityRank(left.priority);

      if (priorityOrder !== 0) {
        return priorityOrder;
      }

      const partitionOrder =
        (left.partitionId ?? "").localeCompare(
          right.partitionId ?? "",
        );

      if (partitionOrder !== 0) {
        return partitionOrder;
      }

      return left.taskId.localeCompare(
        right.taskId,
      );
    }),
  );
}

function priorityRank(
  priority: TradingSwarmTask["priority"],
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

function resolveAssignmentTimestamp(
  task: TradingSwarmTask,
  health: readonly TradingSwarmNodeHealth[],
  trust: readonly TradingSwarmNodeTrustScore[],
  leases: readonly TradingSwarmPartitionLease[],
  strategy:
    | "TASK_CREATED_AT"
    | "LATEST_INPUT_TIMESTAMP",
): TradingSwarmTimestamp {
  if (strategy === "TASK_CREATED_AT") {
    return task.createdAtMs;
  }

  const timestamps: number[] = [
    task.createdAtMs,
  ];

  for (const item of health) {
    if (
      item.lastHeartbeatAtMs !== undefined
    ) {
      timestamps.push(
        item.lastHeartbeatAtMs,
      );
    }

    if (
      item.lastSynchronizedAtMs !==
      undefined
    ) {
      timestamps.push(
        item.lastSynchronizedAtMs,
      );
    }
  }

  for (const item of trust) {
    timestamps.push(item.assessedAtMs);
  }

  for (const lease of leases) {
    timestamps.push(
      lease.renewedAtMs ??
        lease.acquiredAtMs,
    );
  }

  return Math.max(
    ...timestamps,
  ) as TradingSwarmTimestamp;
}

/* ========================================================================== *
 * Options and validation utilities
 * ========================================================================== */

function normalizeOptions(
  options: SwarmTaskAllocatorOptions,
): NormalizedOptions {
  const weights = normalizeWeights(
    options.weights,
  );

  const minimumReadinessScore =
    options.minimumReadinessScore ?? 0.5;
  const minimumReliabilityScore =
    options.minimumReliabilityScore ?? 0.5;
  const minimumSynchronizationScore =
    options.minimumSynchronizationScore ??
    0.5;
  const minimumTrustScore =
    options.minimumTrustScore ?? 0.4;

  validateScore(
    minimumReadinessScore,
    "minimumReadinessScore",
  );
  validateScore(
    minimumReliabilityScore,
    "minimumReliabilityScore",
  );
  validateScore(
    minimumSynchronizationScore,
    "minimumSynchronizationScore",
  );
  validateScore(
    minimumTrustScore,
    "minimumTrustScore",
  );

  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmTaskAssignmentFingerprintGenerator(),
    weights,
    minimumReadinessScore,
    minimumReliabilityScore,
    minimumSynchronizationScore,
    minimumTrustScore,
    requireHealthyNode:
      options.requireHealthyNode ?? true,
    requireDeterministicNode:
      options.requireDeterministicNode ??
      true,
    requireReplaySafeNode:
      options.requireReplaySafeNode ?? true,
    requirePartitionLease:
      options.requirePartitionLease ?? true,
    allowBusyNodes:
      options.allowBusyNodes ?? true,
    allowDegradedNodes:
      options.allowDegradedNodes ?? false,
    allowMissingTrustScore:
      options.allowMissingTrustScore ?? true,
    allowExpiredLease:
      options.allowExpiredLease ?? false,
    assignmentTimestampStrategy:
      options.assignmentTimestampStrategy ??
      "TASK_CREATED_AT",
    failOnUnassignedTask:
      options.failOnUnassignedTask ?? true,
  });
}

function normalizeWeights(
  supplied:
    | Partial<SwarmTaskAllocatorWeights>
    | undefined,
): SwarmTaskAllocatorWeights {
  const weights = {
    ...DEFAULT_SWARM_TASK_ALLOCATOR_WEIGHTS,
    ...(supplied ?? {}),
  };

  for (const [field, value] of Object.entries(
    weights,
  )) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new SwarmTaskAllocatorError(
        "INVALID_NODES",
        `Allocator weight "${field}" must be non-negative and finite.`,
        { field },
      );
    }
  }

  const total = Object.values(weights).reduce(
    (sum, value) => sum + value,
    0,
  );

  if (total <= 0) {
    throw new SwarmTaskAllocatorError(
      "INVALID_NODES",
      "At least one allocator weight must be positive.",
    );
  }

  return Object.freeze(weights);
}

function indexUnique<TValue>(
  values: readonly TValue[],
  keySelector: (value: TValue) => string,
  duplicateCode:
    | "DUPLICATE_HEALTH"
    | "DUPLICATE_TRUST"
    | "DUPLICATE_LEASE",
  label: string,
): ReadonlyMap<string, TValue> {
  const result = new Map<string, TValue>();

  for (const value of values) {
    const key = keySelector(value);

    if (result.has(key)) {
      throw new SwarmTaskAllocatorError(
        duplicateCode,
        `Duplicate ${label} for "${key}".`,
      );
    }

    result.set(key, value);
  }

  return result;
}

function validateScore(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new SwarmTaskAllocatorError(
      "INVALID_HEALTH",
      `${field} must be between 0 and 1.`,
      { field },
    );
  }
}

function assertNonEmptyText(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new SwarmTaskAllocatorError(
      "INVALID_TASKS",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

/* ========================================================================== *
 * Fingerprint and immutable utilities
 * ========================================================================== */

function assignmentFingerprintInput(
  assignment: Omit<
    TradingSwarmTaskAssignment,
    "deterministicFingerprint"
  >,
): unknown {
  return {
    taskId: assignment.task.taskId,
    missionId:
      assignment.task.missionId,
    runId: assignment.task.runId,
    taskInputFingerprint:
      assignment.task.inputFingerprint,
    nodeId:
      assignment.node.identity.nodeId,
    nodeConfigurationVersion:
      assignment.node
        .configurationVersion,
    leaseFingerprint:
      assignment.lease
        ?.deterministicFingerprint ?? null,
    assignedAtMs:
      assignment.assignedAtMs,
    assignmentScore:
      assignment.assignmentScore,
    rationale: assignment.rationale,
  };
}

function clampScore(
  value: number,
): TradingSwarmScore {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, value),
  ) as TradingSwarmScore;
}

function formatScore(value: number): string {
  return clampScore(value).toFixed(6);
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
  } else if (value instanceof Set) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key);
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
    return value.map(
      normalizeForStableJson,
    );
  }

  if (value instanceof Set) {
    return [...value]
      .map(normalizeForStableJson)
      .sort(compareNormalizedValues);
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(
          String(right),
        ),
      )
      .map(([key, item]) => [
        normalizeForStableJson(key),
        normalizeForStableJson(item),
      ]);
  }

  if (typeof value === "object") {
    const output: Record<
      string,
      unknown
    > = {};

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

function compareNormalizedValues(
  left: unknown,
  right: unknown,
): number {
  return JSON.stringify(left).localeCompare(
    JSON.stringify(right),
  );
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(
      hash,
      0x01000193,
    );
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

// End of swarm-task-allocator.ts