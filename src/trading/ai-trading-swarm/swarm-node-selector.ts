/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-node-selector.ts
 *
 * Deterministic, immutable node eligibility, ranking, and selection.
 */

import {
  type AiTradingSwarmRunRequest,
  type TradingSwarmCapability,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmMissionConstraints,
  type TradingSwarmNodeHealth,
  type TradingSwarmNodeId,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeRole,
  type TradingSwarmNodeState,
  type TradingSwarmPartition,
  type TradingSwarmPartitionId,
  type TradingSwarmScore,
  type TradingSwarmTopologySnapshot,
  hasTradingSwarmCapability,
  isActiveTradingSwarmNodeState,
  isHealthyTradingSwarmNode,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Public contracts
 * ========================================================================== */

export type SwarmNodeSelectionErrorCode =
  | "INVALID_REQUEST"
  | "SWARM_ID_MISMATCH"
  | "INVALID_SELECTION_COUNT"
  | "INSUFFICIENT_ELIGIBLE_NODES"
  | "REQUIRED_ROLE_UNAVAILABLE"
  | "REQUIRED_CAPABILITY_UNAVAILABLE"
  | "REQUIRED_PARTITION_UNAVAILABLE"
  | "PREFERRED_NODE_UNAVAILABLE"
  | "INVARIANT_VIOLATION";

export class SwarmNodeSelectionError extends Error {
  public readonly code: SwarmNodeSelectionErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: SwarmNodeSelectionErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "SwarmNodeSelectionError";
    this.code = code;
    this.details =
      details === undefined
        ? undefined
        : deepFreeze({ ...details });
  }
}

export interface SwarmNodeSelectorWeights {
  readonly readiness: number;
  readonly reliability: number;
  readonly latency: number;
  readonly throughput: number;
  readonly synchronization: number;
  readonly dataFreshness: number;
  readonly consensusParticipation: number;
  readonly capacityHeadroom: number;
  readonly capabilityProficiency: number;
  readonly partitionAffinity: number;
  readonly preferredNodeBonus: number;
  readonly leaderBonus: number;
  readonly workloadPenalty: number;
  readonly failurePenalty: number;
}

export interface SwarmNodeSelectorOptions {
  readonly weights?: Partial<SwarmNodeSelectorWeights>;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly requireHealthyNodes?: boolean;
  readonly requireActiveNodes?: boolean;
  readonly requireDeterministicNodes?: boolean;
  readonly requireReplaySafeNodes?: boolean;
  readonly requireAllCapabilitiesPerNode?: boolean;
  readonly failWhenPreferredNodeUnavailable?: boolean;
  readonly minimumReadinessScore?: number;
  readonly minimumReliabilityScore?: number;
  readonly maximumWorkloadRatio?: number;
}

export interface SwarmNodeSelectionRequest {
  readonly request: AiTradingSwarmRunRequest;
  readonly topology?: TradingSwarmTopologySnapshot;
  readonly selectionCount?: number;
  readonly minimumSelectionCount?: number;
  readonly maximumSelectionCount?: number;
  readonly requiredRoles?: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities?: readonly TradingSwarmCapability[];
  readonly requiredPartitionIds?: readonly TradingSwarmPartitionId[];
  readonly preferredNodeIds?: readonly TradingSwarmNodeId[];
  readonly excludedNodeIds?: readonly TradingSwarmNodeId[];
  readonly requirePreferredNodes?: boolean;
}

export type SwarmNodeRejectionReason =
  | "EXCLUDED"
  | "SWARM_MISMATCH"
  | "INACTIVE"
  | "UNHEALTHY"
  | "NOT_DETERMINISTIC"
  | "NOT_REPLAY_SAFE"
  | "READINESS_BELOW_MINIMUM"
  | "RELIABILITY_BELOW_MINIMUM"
  | "WORKLOAD_EXCEEDED"
  | "ROLE_MISMATCH"
  | "CAPABILITY_MISMATCH"
  | "PARTITION_MISMATCH";

export interface SwarmNodeScoreBreakdown {
  readonly readiness: number;
  readonly reliability: number;
  readonly latency: number;
  readonly throughput: number;
  readonly synchronization: number;
  readonly dataFreshness: number;
  readonly consensusParticipation: number;
  readonly capacityHeadroom: number;
  readonly capabilityProficiency: number;
  readonly partitionAffinity: number;
  readonly preferredNodeBonus: number;
  readonly leaderBonus: number;
  readonly workloadPenalty: number;
  readonly failurePenalty: number;
  readonly total: TradingSwarmScore;
}

export interface RankedSwarmNode {
  readonly rank: number;
  readonly node: TradingSwarmNodeRegistration;
  readonly health: TradingSwarmNodeHealth;
  readonly ownedPartitionIds: readonly TradingSwarmPartitionId[];
  readonly matchedRoles: readonly TradingSwarmNodeRole[];
  readonly matchedCapabilities: readonly TradingSwarmCapability[];
  readonly matchedPartitionIds: readonly TradingSwarmPartitionId[];
  readonly workloadRatio: number;
  readonly score: TradingSwarmScore;
  readonly breakdown: SwarmNodeScoreBreakdown;
  readonly preferred: boolean;
  readonly deterministicFingerprint: string;
}

export interface RejectedSwarmNode {
  readonly nodeId: TradingSwarmNodeId;
  readonly reasons: readonly SwarmNodeRejectionReason[];
  readonly deterministicFingerprint: string;
}

export interface SwarmNodeSelectionResult {
  readonly selected: readonly RankedSwarmNode[];
  readonly eligible: readonly RankedSwarmNode[];
  readonly rejected: readonly RejectedSwarmNode[];
  readonly requiredRoles: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly requiredPartitionIds: readonly TradingSwarmPartitionId[];
  readonly selectedNodeIds: readonly TradingSwarmNodeId[];
  readonly eligibleNodeIds: readonly TradingSwarmNodeId[];
  readonly coverage: SwarmNodeSelectionCoverage;
  readonly deterministicFingerprint: string;
}

export interface SwarmNodeSelectionCoverage {
  readonly roles: Readonly<
    Partial<Record<TradingSwarmNodeRole, number>>
  >;
  readonly capabilities: Readonly<
    Partial<Record<TradingSwarmCapability, number>>
  >;
  readonly partitions: Readonly<Record<string, number>>;
  readonly complete: boolean;
}

interface NormalizedSelectorOptions {
  readonly weights: SwarmNodeSelectorWeights;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly requireHealthyNodes: boolean;
  readonly requireActiveNodes: boolean;
  readonly requireDeterministicNodes: boolean;
  readonly requireReplaySafeNodes: boolean;
  readonly requireAllCapabilitiesPerNode: boolean;
  readonly failWhenPreferredNodeUnavailable: boolean;
  readonly minimumReadinessScore: number;
  readonly minimumReliabilityScore: number;
  readonly maximumWorkloadRatio: number;
}

interface NormalizedSelectionRequest {
  readonly request: AiTradingSwarmRunRequest;
  readonly topology: TradingSwarmTopologySnapshot;
  readonly selectionCount: number;
  readonly minimumSelectionCount: number;
  readonly maximumSelectionCount: number;
  readonly requiredRoles: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly requiredPartitionIds: readonly TradingSwarmPartitionId[];
  readonly preferredNodeIds: readonly TradingSwarmNodeId[];
  readonly excludedNodeIds: readonly TradingSwarmNodeId[];
  readonly requirePreferredNodes: boolean;
}

/* ========================================================================== *
 * Defaults
 * ========================================================================== */

export const DEFAULT_SWARM_NODE_SELECTOR_WEIGHTS:
  SwarmNodeSelectorWeights = deepFreeze({
    readiness: 0.12,
    reliability: 0.16,
    latency: 0.08,
    throughput: 0.08,
    synchronization: 0.10,
    dataFreshness: 0.08,
    consensusParticipation: 0.08,
    capacityHeadroom: 0.10,
    capabilityProficiency: 0.10,
    partitionAffinity: 0.05,
    preferredNodeBonus: 0.03,
    leaderBonus: 0.02,
    workloadPenalty: 0.10,
    failurePenalty: 0.10,
  });

/* ========================================================================== *
 * Selector
 * ========================================================================== */

export class SwarmNodeSelector {
  private readonly options: NormalizedSelectorOptions;

  public constructor(options: SwarmNodeSelectorOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public select(
    input: SwarmNodeSelectionRequest,
  ): SwarmNodeSelectionResult {
    const normalized = this.normalizeRequest(input);
    const excluded = new Set(normalized.excludedNodeIds);
    const preferred = new Set(normalized.preferredNodeIds);

    const eligible: RankedSwarmNode[] = [];
    const rejected: RejectedSwarmNode[] = [];

    for (const state of normalized.topology.nodes) {
      const reasons = this.rejectionReasons(
        state,
        normalized,
        excluded,
      );

      if (reasons.length > 0) {
        const rejectionBase = {
          nodeId: state.registration.identity.nodeId,
          reasons: Object.freeze([...reasons].sort()),
        };

        rejected.push(
          deepFreeze({
            ...rejectionBase,
            deterministicFingerprint:
              this.options.fingerprintGenerator.fingerprint(
                rejectionBase,
              ),
          }),
        );
        continue;
      }

      eligible.push(
        this.rankNode(
          state,
          normalized,
          preferred.has(
            state.registration.identity.nodeId,
          ),
        ),
      );
    }

    eligible.sort(compareRankedNodes);
    const rankedEligible = eligible.map(
      (candidate, index) =>
        deepFreeze({
          ...candidate,
          rank: index + 1,
        }),
    );

    const selected = this.selectForCoverage(
      rankedEligible,
      normalized,
    );

    this.assertPreferredNodes(
      normalized,
      selected,
      rankedEligible,
    );

    const coverage = calculateCoverage(
      selected,
      normalized.requiredRoles,
      normalized.requiredCapabilities,
      normalized.requiredPartitionIds,
    );

    this.assertCoverage(
      normalized,
      selected,
      coverage,
    );

    const resultBase = {
      selected: Object.freeze(selected),
      eligible: Object.freeze(rankedEligible),
      rejected: Object.freeze(
        rejected.sort((left, right) =>
          left.nodeId.localeCompare(right.nodeId),
        ),
      ),
      requiredRoles: normalized.requiredRoles,
      requiredCapabilities:
        normalized.requiredCapabilities,
      requiredPartitionIds:
        normalized.requiredPartitionIds,
      selectedNodeIds: Object.freeze(
        selected.map(
          (candidate) =>
            candidate.node.identity.nodeId,
        ),
      ),
      eligibleNodeIds: Object.freeze(
        rankedEligible.map(
          (candidate) =>
            candidate.node.identity.nodeId,
        ),
      ),
      coverage,
    };

    return deepFreeze({
      ...resultBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          resultBase,
        ),
    });
  }

  public rank(
    input: SwarmNodeSelectionRequest,
  ): readonly RankedSwarmNode[] {
    return this.select({
      ...input,
      minimumSelectionCount: 0,
      selectionCount:
        input.topology?.nodes.length ??
        input.request.context.topology.nodes.length,
      maximumSelectionCount:
        input.topology?.nodes.length ??
        input.request.context.topology.nodes.length,
      requiredRoles: [],
      requiredCapabilities: [],
      requiredPartitionIds: [],
    }).eligible;
  }

  private normalizeRequest(
    input: SwarmNodeSelectionRequest,
  ): NormalizedSelectionRequest {
    if (
      input === undefined ||
      input === null ||
      typeof input !== "object"
    ) {
      throw new SwarmNodeSelectionError(
        "INVALID_REQUEST",
        "A node-selection request is required.",
      );
    }

    const request = input.request;
    if (
      request === undefined ||
      request === null
    ) {
      throw new SwarmNodeSelectionError(
        "INVALID_REQUEST",
        "The AI trading swarm run request is required.",
      );
    }

    const topology =
      input.topology ?? request.context.topology;

    if (topology.swarmId !== request.swarmId) {
      throw new SwarmNodeSelectionError(
        "SWARM_ID_MISMATCH",
        `Topology swarm "${topology.swarmId}" does not match request swarm "${request.swarmId}".`,
      );
    }

    const constraints =
      request.constraints ??
      EMPTY_MISSION_CONSTRAINTS;

    const requiredRoles = uniqueSorted([
      ...request.configuration.formation
        .requiredNodeRoles,
      ...(request.requiredNodeRoles ?? []),
      ...(constraints.requiredNodeRoles ?? []),
      ...(input.requiredRoles ?? []),
    ]);

    const requiredCapabilities = uniqueSorted([
      ...request.configuration.formation
        .requiredCapabilities,
      ...(request.requiredCapabilities ?? []),
      ...(constraints.requiredCapabilities ?? []),
      ...(input.requiredCapabilities ?? []),
    ]);

    const requiredPartitionIds = uniqueSorted([
      ...(constraints.requiredPartitionIds ?? []),
      ...(input.requiredPartitionIds ?? []),
    ]);

    const preferredNodeIds = uniqueSorted([
      ...(request.preferredNodeIds ?? []),
      ...(input.preferredNodeIds ?? []),
    ]);

    const excludedNodeIds = uniqueSorted([
      ...(request.excludedNodeIds ?? []),
      ...(input.excludedNodeIds ?? []),
    ]);

    const defaultMinimum =
      request.configuration.formation.minimumNodes;
    const defaultMaximum =
      request.configuration.formation.maximumNodes;

    const minimumSelectionCount =
      input.minimumSelectionCount ??
      defaultMinimum;
    const maximumSelectionCount =
      input.maximumSelectionCount ??
      defaultMaximum;
    const selectionCount =
      input.selectionCount ??
      Math.min(
        maximumSelectionCount,
        Math.max(
          minimumSelectionCount,
          requiredRoles.length,
          1,
        ),
      );

    assertNonNegativeInteger(
      minimumSelectionCount,
      "minimumSelectionCount",
    );
    assertPositiveInteger(
      maximumSelectionCount,
      "maximumSelectionCount",
    );
    assertNonNegativeInteger(
      selectionCount,
      "selectionCount",
    );

    if (
      minimumSelectionCount >
        maximumSelectionCount ||
      selectionCount < minimumSelectionCount ||
      selectionCount > maximumSelectionCount
    ) {
      throw new SwarmNodeSelectionError(
        "INVALID_SELECTION_COUNT",
        "Selection counts are inconsistent.",
        {
          minimumSelectionCount,
          maximumSelectionCount,
          selectionCount,
        },
      );
    }

    return deepFreeze({
      request,
      topology,
      selectionCount,
      minimumSelectionCount,
      maximumSelectionCount,
      requiredRoles,
      requiredCapabilities,
      requiredPartitionIds,
      preferredNodeIds,
      excludedNodeIds,
      requirePreferredNodes:
        input.requirePreferredNodes ??
        this.options.failWhenPreferredNodeUnavailable,
    });
  }

  private rejectionReasons(
    state: TradingSwarmNodeState,
    request: NormalizedSelectionRequest,
    excluded: ReadonlySet<TradingSwarmNodeId>,
  ): readonly SwarmNodeRejectionReason[] {
    const reasons: SwarmNodeRejectionReason[] = [];
    const registration = state.registration;
    const health = state.health;
    const nodeId = registration.identity.nodeId;

    if (excluded.has(nodeId)) {
      reasons.push("EXCLUDED");
    }

    if (
      registration.identity.swarmId !==
      request.request.swarmId
    ) {
      reasons.push("SWARM_MISMATCH");
    }

    if (
      this.options.requireActiveNodes &&
      !isActiveTradingSwarmNodeState(
        health.lifecycleState,
      )
    ) {
      reasons.push("INACTIVE");
    }

    if (
      this.options.requireHealthyNodes &&
      !isHealthyTradingSwarmNode(health)
    ) {
      reasons.push("UNHEALTHY");
    }

    if (
      this.options.requireDeterministicNodes &&
      !registration.deterministic
    ) {
      reasons.push("NOT_DETERMINISTIC");
    }

    if (
      this.options.requireReplaySafeNodes &&
      !registration.replaySafe
    ) {
      reasons.push("NOT_REPLAY_SAFE");
    }

    if (
      health.readinessScore <
      this.options.minimumReadinessScore
    ) {
      reasons.push("READINESS_BELOW_MINIMUM");
    }

    if (
      health.reliabilityScore <
      this.options.minimumReliabilityScore
    ) {
      reasons.push("RELIABILITY_BELOW_MINIMUM");
    }

    if (
      calculateWorkloadRatio(state) >
      this.options.maximumWorkloadRatio
    ) {
      reasons.push("WORKLOAD_EXCEEDED");
    }

    if (
      request.requiredRoles.length > 0 &&
      !request.requiredRoles.includes(
        registration.identity.role,
      )
    ) {
      reasons.push("ROLE_MISMATCH");
    }

    if (
      request.requiredCapabilities.length > 0
    ) {
      const matched =
        request.requiredCapabilities.filter(
          (capability) =>
            hasTradingSwarmCapability(
              registration,
              capability,
            ),
        );

      const capabilitiesAccepted =
        this.options.requireAllCapabilitiesPerNode
          ? matched.length ===
            request.requiredCapabilities.length
          : matched.length > 0;

      if (!capabilitiesAccepted) {
        reasons.push("CAPABILITY_MISMATCH");
      }
    }

    if (
      request.requiredPartitionIds.length > 0 &&
      !request.requiredPartitionIds.some(
        (partitionId) =>
          state.ownedPartitionIds.includes(
            partitionId,
          ) ||
          nodeReplicatesPartition(
            request.topology.partitions,
            nodeId,
            partitionId,
          ),
      )
    ) {
      reasons.push("PARTITION_MISMATCH");
    }

    return Object.freeze(reasons);
  }

  private rankNode(
    state: TradingSwarmNodeState,
    request: NormalizedSelectionRequest,
    preferred: boolean,
  ): RankedSwarmNode {
    const registration = state.registration;
    const health = state.health;
    const nodeId = registration.identity.nodeId;

    const matchedRoles =
      request.requiredRoles.includes(
        registration.identity.role,
      )
        ? Object.freeze([
            registration.identity.role,
          ])
        : Object.freeze([]);

    const matchedCapabilities = Object.freeze(
      request.requiredCapabilities
        .filter((capability) =>
          hasTradingSwarmCapability(
            registration,
            capability,
          ),
        )
        .sort(),
    );

    const matchedPartitionIds = Object.freeze(
      request.requiredPartitionIds
        .filter(
          (partitionId) =>
            state.ownedPartitionIds.includes(
              partitionId,
            ) ||
            nodeReplicatesPartition(
              request.topology.partitions,
              nodeId,
              partitionId,
            ),
        )
        .sort(),
    );

    const workloadRatio =
      calculateWorkloadRatio(state);
    const capacityHeadroom =
      clamp01(1 - workloadRatio);
    const proficiency =
      calculateCapabilityProficiency(
        registration,
        request.requiredCapabilities,
      );
    const partitionAffinity =
      request.requiredPartitionIds.length === 0
        ? 1
        : matchedPartitionIds.length /
          request.requiredPartitionIds.length;

    const weights = this.options.weights;
    const positive =
      clamp01(health.readinessScore) *
        weights.readiness +
      clamp01(health.reliabilityScore) *
        weights.reliability +
      clamp01(health.latencyScore) *
        weights.latency +
      clamp01(health.throughputScore) *
        weights.throughput +
      clamp01(health.synchronizationScore) *
        weights.synchronization +
      clamp01(health.dataFreshnessScore) *
        weights.dataFreshness +
      clamp01(
        health.consensusParticipationScore,
      ) *
        weights.consensusParticipation +
      capacityHeadroom *
        weights.capacityHeadroom +
      proficiency *
        weights.capabilityProficiency +
      partitionAffinity *
        weights.partitionAffinity +
      (preferred
        ? weights.preferredNodeBonus
        : 0) +
      (request.topology.leaderNodeId === nodeId
        ? weights.leaderBonus
        : 0);

    const workloadPenalty =
      workloadRatio * weights.workloadPenalty;
    const failurePenalty =
      clamp01(
        health.consecutiveFailures / 10,
      ) * weights.failurePenalty;

    const total = clamp01(
      positive -
        workloadPenalty -
        failurePenalty,
    );

    const breakdown = deepFreeze({
      readiness:
        clamp01(health.readinessScore) *
        weights.readiness,
      reliability:
        clamp01(health.reliabilityScore) *
        weights.reliability,
      latency:
        clamp01(health.latencyScore) *
        weights.latency,
      throughput:
        clamp01(health.throughputScore) *
        weights.throughput,
      synchronization:
        clamp01(health.synchronizationScore) *
        weights.synchronization,
      dataFreshness:
        clamp01(health.dataFreshnessScore) *
        weights.dataFreshness,
      consensusParticipation:
        clamp01(
          health.consensusParticipationScore,
        ) * weights.consensusParticipation,
      capacityHeadroom:
        capacityHeadroom *
        weights.capacityHeadroom,
      capabilityProficiency:
        proficiency *
        weights.capabilityProficiency,
      partitionAffinity:
        partitionAffinity *
        weights.partitionAffinity,
      preferredNodeBonus: preferred
        ? weights.preferredNodeBonus
        : 0,
      leaderBonus:
        request.topology.leaderNodeId === nodeId
          ? weights.leaderBonus
          : 0,
      workloadPenalty,
      failurePenalty,
      total,
    });

    const candidateBase = {
      rank: 0,
      node: registration,
      health,
      ownedPartitionIds: Object.freeze([
        ...state.ownedPartitionIds,
      ].sort()),
      matchedRoles,
      matchedCapabilities,
      matchedPartitionIds,
      workloadRatio,
      score: total,
      breakdown,
      preferred,
    };

    return deepFreeze({
      ...candidateBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          candidateBase,
        ),
    });
  }

  private selectForCoverage(
    eligible: readonly RankedSwarmNode[],
    request: NormalizedSelectionRequest,
  ): readonly RankedSwarmNode[] {
    if (eligible.length < request.minimumSelectionCount) {
      throw new SwarmNodeSelectionError(
        "INSUFFICIENT_ELIGIBLE_NODES",
        `Only ${eligible.length} eligible nodes are available; ${request.minimumSelectionCount} are required.`,
        {
          eligibleNodeIds: eligible.map(
            (candidate) =>
              candidate.node.identity.nodeId,
          ),
        },
      );
    }

    const selected: RankedSwarmNode[] = [];
    const selectedIds = new Set<TradingSwarmNodeId>();

    const add = (
      candidate: RankedSwarmNode | undefined,
    ): void => {
      if (
        candidate !== undefined &&
        selected.length < request.selectionCount &&
        !selectedIds.has(
          candidate.node.identity.nodeId,
        )
      ) {
        selected.push(candidate);
        selectedIds.add(
          candidate.node.identity.nodeId,
        );
      }
    };

    for (const role of request.requiredRoles) {
      add(
        eligible.find(
          (candidate) =>
            candidate.node.identity.role === role,
        ),
      );
    }

    for (const capability of request.requiredCapabilities) {
      add(
        eligible.find((candidate) =>
          candidate.matchedCapabilities.includes(
            capability,
          ),
        ),
      );
    }

    for (const partitionId of request.requiredPartitionIds) {
      add(
        eligible.find((candidate) =>
          candidate.matchedPartitionIds.includes(
            partitionId,
          ),
        ),
      );
    }

    for (const preferredId of request.preferredNodeIds) {
      add(
        eligible.find(
          (candidate) =>
            candidate.node.identity.nodeId ===
            preferredId,
        ),
      );
    }

    for (const candidate of eligible) {
      add(candidate);
    }

    return Object.freeze(
      selected
        .sort(compareRankedNodes)
        .map((candidate, index) =>
          deepFreeze({
            ...candidate,
            rank: index + 1,
          }),
        ),
    );
  }

  private assertPreferredNodes(
    request: NormalizedSelectionRequest,
    selected: readonly RankedSwarmNode[],
    eligible: readonly RankedSwarmNode[],
  ): void {
    if (!request.requirePreferredNodes) {
      return;
    }

    const selectedIds = new Set(
      selected.map(
        (candidate) =>
          candidate.node.identity.nodeId,
      ),
    );
    const eligibleIds = new Set(
      eligible.map(
        (candidate) =>
          candidate.node.identity.nodeId,
      ),
    );

    const unavailable =
      request.preferredNodeIds.filter(
        (nodeId) =>
          !eligibleIds.has(nodeId) ||
          !selectedIds.has(nodeId),
      );

    if (unavailable.length > 0) {
      throw new SwarmNodeSelectionError(
        "PREFERRED_NODE_UNAVAILABLE",
        "One or more required preferred nodes could not be selected.",
        {
          unavailableNodeIds: unavailable,
        },
      );
    }
  }

  private assertCoverage(
    request: NormalizedSelectionRequest,
    selected: readonly RankedSwarmNode[],
    coverage: SwarmNodeSelectionCoverage,
  ): void {
    if (selected.length < request.minimumSelectionCount) {
      throw new SwarmNodeSelectionError(
        "INSUFFICIENT_ELIGIBLE_NODES",
        `Selected ${selected.length} nodes; ${request.minimumSelectionCount} are required.`,
      );
    }

    for (const role of request.requiredRoles) {
      if ((coverage.roles[role] ?? 0) === 0) {
        throw new SwarmNodeSelectionError(
          "REQUIRED_ROLE_UNAVAILABLE",
          `Required role "${role}" is not covered by the selected nodes.`,
          { role },
        );
      }
    }

    for (const capability of request.requiredCapabilities) {
      if (
        (coverage.capabilities[capability] ??
          0) === 0
      ) {
        throw new SwarmNodeSelectionError(
          "REQUIRED_CAPABILITY_UNAVAILABLE",
          `Required capability "${capability}" is not covered by the selected nodes.`,
          { capability },
        );
      }
    }

    for (const partitionId of request.requiredPartitionIds) {
      if (
        (coverage.partitions[partitionId] ??
          0) === 0
      ) {
        throw new SwarmNodeSelectionError(
          "REQUIRED_PARTITION_UNAVAILABLE",
          `Required partition "${partitionId}" is not covered by the selected nodes.`,
          { partitionId },
        );
      }
    }
  }
}

/* ========================================================================== *
 * Factory and fingerprint implementation
 * ========================================================================== */

export function createSwarmNodeSelector(
  options: SwarmNodeSelectorOptions = {},
): SwarmNodeSelector {
  return new SwarmNodeSelector(options);
}

export class StableSwarmNodeSelectionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    const serialized = stableStringify(value);
    let hash = 0x811c9dc5;

    for (
      let index = 0;
      index < serialized.length;
      index += 1
    ) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }

    return `swarm-node-selection-${(hash >>> 0)
      .toString(16)
      .padStart(8, "0")}`;
  }
}

/* ========================================================================== *
 * Pure helpers
 * ========================================================================== */

const EMPTY_MISSION_CONSTRAINTS:
  TradingSwarmMissionConstraints = deepFreeze({});

function normalizeOptions(
  options: SwarmNodeSelectorOptions,
): NormalizedSelectorOptions {
  const weights = deepFreeze({
    ...DEFAULT_SWARM_NODE_SELECTOR_WEIGHTS,
    ...(options.weights ?? {}),
  });

  for (const [name, value] of Object.entries(weights)) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new SwarmNodeSelectionError(
        "INVALID_REQUEST",
        `Selector weight "${name}" must be a finite non-negative number.`,
        { name, value },
      );
    }
  }

  return Object.freeze({
    weights,
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmNodeSelectionFingerprintGenerator(),
    requireHealthyNodes:
      options.requireHealthyNodes ?? true,
    requireActiveNodes:
      options.requireActiveNodes ?? true,
    requireDeterministicNodes:
      options.requireDeterministicNodes ?? true,
    requireReplaySafeNodes:
      options.requireReplaySafeNodes ?? true,
    requireAllCapabilitiesPerNode:
      options.requireAllCapabilitiesPerNode ??
      false,
    failWhenPreferredNodeUnavailable:
      options.failWhenPreferredNodeUnavailable ??
      false,
    minimumReadinessScore: normalizeUnitScore(
      options.minimumReadinessScore ?? 0.7,
      "minimumReadinessScore",
    ),
    minimumReliabilityScore: normalizeUnitScore(
      options.minimumReliabilityScore ?? 0.7,
      "minimumReliabilityScore",
    ),
    maximumWorkloadRatio: normalizeUnitScore(
      options.maximumWorkloadRatio ?? 1,
      "maximumWorkloadRatio",
    ),
  });
}

function calculateWorkloadRatio(
  state: TradingSwarmNodeState,
): number {
  const capacity = state.registration.capacity;
  const health = state.health;

  const missionRatio = safeRatio(
    health.activeMissionCount,
    capacity.maximumConcurrentMissions,
  );
  const taskRatio = safeRatio(
    health.activeTaskCount,
    capacity.maximumConcurrentTasks,
  );
  const runRatio = safeRatio(
    health.activeMultiAgentRunCount,
    capacity.maximumAgentRuns,
  );

  return clamp01(
    Math.max(
      missionRatio,
      taskRatio,
      runRatio,
    ),
  );
}

function calculateCapabilityProficiency(
  node: TradingSwarmNodeRegistration,
  required: readonly TradingSwarmCapability[],
): number {
  const relevant =
    required.length === 0
      ? node.capabilities.filter(
          (declaration) =>
            declaration.enabled,
        )
      : required
          .map((capability) =>
            node.capabilities.find(
              (declaration) =>
                declaration.capability === capability &&
                declaration.enabled,
            ),
          )
          .filter(
            (
              declaration,
            ): declaration is TradingSwarmNodeRegistration["capabilities"][number] =>
              declaration !== undefined,
          );

  if (relevant.length === 0) {
    return required.length === 0 ? 1 : 0;
  }

  return clamp01(
    relevant.reduce(
      (sum, declaration) =>
        sum +
        clamp01(declaration.proficiency),
      0,
    ) / relevant.length,
  );
}

function nodeReplicatesPartition(
  partitions: readonly TradingSwarmPartition[],
  nodeId: TradingSwarmNodeId,
  partitionId: TradingSwarmPartitionId,
): boolean {
  const partition = partitions.find(
    (candidate) =>
      candidate.partitionId === partitionId,
  );

  return (
    partition !== undefined &&
    partition.replicaNodeIds.includes(nodeId)
  );
}

function calculateCoverage(
  selected: readonly RankedSwarmNode[],
  requiredRoles: readonly TradingSwarmNodeRole[],
  requiredCapabilities:
    readonly TradingSwarmCapability[],
  requiredPartitionIds:
    readonly TradingSwarmPartitionId[],
): SwarmNodeSelectionCoverage {
  const roles: Partial<
    Record<TradingSwarmNodeRole, number>
  > = {};
  const capabilities: Partial<
    Record<TradingSwarmCapability, number>
  > = {};
  const partitions: Record<string, number> = {};

  for (const candidate of selected) {
    const role = candidate.node.identity.role;
    roles[role] = (roles[role] ?? 0) + 1;

    for (const capability of candidate.matchedCapabilities) {
      capabilities[capability] =
        (capabilities[capability] ?? 0) + 1;
    }

    for (const partitionId of candidate.matchedPartitionIds) {
      partitions[partitionId] =
        (partitions[partitionId] ?? 0) + 1;
    }
  }

  const complete =
    requiredRoles.every(
      (role) => (roles[role] ?? 0) > 0,
    ) &&
    requiredCapabilities.every(
      (capability) =>
        (capabilities[capability] ?? 0) > 0,
    ) &&
    requiredPartitionIds.every(
      (partitionId) =>
        (partitions[partitionId] ?? 0) > 0,
    );

  return deepFreeze({
    roles: sortedRecord(roles),
    capabilities: sortedRecord(capabilities),
    partitions: sortedRecord(partitions),
    complete,
  });
}

function compareRankedNodes(
  left: RankedSwarmNode,
  right: RankedSwarmNode,
): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  const reliabilityOrder =
    right.health.reliabilityScore -
    left.health.reliabilityScore;
  if (reliabilityOrder !== 0) {
    return reliabilityOrder;
  }

  const readinessOrder =
    right.health.readinessScore -
    left.health.readinessScore;
  if (readinessOrder !== 0) {
    return readinessOrder;
  }

  const workloadOrder =
    left.workloadRatio - right.workloadRatio;
  if (workloadOrder !== 0) {
    return workloadOrder;
  }

  return left.node.identity.nodeId.localeCompare(
    right.node.identity.nodeId,
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

function sortedRecord<TValue>(
  value: Readonly<Record<string, TValue>>,
): Readonly<Record<string, TValue>> {
  return deepFreeze(
    Object.fromEntries(
      Object.entries(value).sort(
        ([left], [right]) =>
          left.localeCompare(right),
      ),
    ),
  );
}

function safeRatio(
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return 1;
  }

  return Math.max(0, numerator / denominator);
}

function normalizeUnitScore(
  value: number,
  name: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new SwarmNodeSelectionError(
      "INVALID_REQUEST",
      `${name} must be between 0 and 1.`,
      { name, value },
    );
  }

  return value;
}

function assertPositiveInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new SwarmNodeSelectionError(
      "INVALID_SELECTION_COUNT",
      `${name} must be a positive integer.`,
      { name, value },
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
    throw new SwarmNodeSelectionError(
      "INVALID_SELECTION_COUNT",
      `${name} must be a non-negative integer.`,
      { name, value },
    );
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
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