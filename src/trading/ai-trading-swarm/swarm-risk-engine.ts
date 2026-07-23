/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-risk-engine.ts
 *
 * Deterministic, immutable swarm-level risk assessment.
 */

import {
  type TradingSwarmConsensusResult,
  type TradingSwarmDecisionCandidate,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmMission,
  type TradingSwarmNodeId,
  type TradingSwarmPartitionId,
  type TradingSwarmRisk,
  type TradingSwarmRiskAssessment,
  type TradingSwarmRiskCategory,
  type TradingSwarmRiskEnginePort,
  type TradingSwarmRiskFinding,
  type TradingSwarmRiskSeverity,
  type TradingSwarmSafetyPolicy,
  type TradingSwarmScore,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmRiskEngineErrorCode =
  | "INVALID_MISSION"
  | "INVALID_CONSENSUS"
  | "INVALID_CANDIDATES"
  | "INVALID_TOPOLOGY"
  | "INVALID_SAFETY_POLICY"
  | "MISSION_MISMATCH"
  | "SELECTED_CANDIDATE_NOT_FOUND"
  | "DUPLICATE_CANDIDATE"
  | "RISK_ASSESSMENT_FAILED";

export interface SwarmRiskEngineErrorDetails {
  readonly missionId?: string;
  readonly consensusId?: string;
  readonly candidateId?: string;
  readonly nodeId?: string;
  readonly partitionId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmRiskEngineError extends Error {
  public readonly code: SwarmRiskEngineErrorCode;
  public readonly details: SwarmRiskEngineErrorDetails;

  public constructor(
    code: SwarmRiskEngineErrorCode,
    message: string,
    details: SwarmRiskEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmRiskEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmRiskEngineWeights {
  readonly candidateRisk: number;
  readonly previousSystemRisk: number;
  readonly consensusRisk: number;
  readonly topologyRisk: number;
  readonly nodeHealthRisk: number;
  readonly synchronizationRisk: number;
  readonly partitionRisk: number;
  readonly executionExposureRisk: number;
  readonly dissentRisk: number;
}

export interface SwarmRiskEngineOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly weights?: Partial<SwarmRiskEngineWeights>;
  readonly assessedAtStrategy?:
    | "MISSION_TIME"
    | "CONSENSUS_TIME"
    | "TOPOLOGY_TIME";
  readonly warningThreshold?: TradingSwarmRisk;
  readonly highThreshold?: TradingSwarmRisk;
  readonly criticalThreshold?: TradingSwarmRisk;
  readonly staleContextAgeMs?: number;
  readonly staleHeartbeatAgeMs?: number;
  readonly unhealthyNodePenalty?: TradingSwarmRisk;
  readonly failedNodePenalty?: TradingSwarmRisk;
  readonly unsynchronizedNodePenalty?: TradingSwarmRisk;
  readonly degradedPartitionPenalty?: TradingSwarmRisk;
  readonly unownedPartitionPenalty?: TradingSwarmRisk;
  readonly expiredLeasePenalty?: TradingSwarmRisk;
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly weights: SwarmRiskEngineWeights;
  readonly assessedAtStrategy:
    | "MISSION_TIME"
    | "CONSENSUS_TIME"
    | "TOPOLOGY_TIME";
  readonly warningThreshold: TradingSwarmRisk;
  readonly highThreshold: TradingSwarmRisk;
  readonly criticalThreshold: TradingSwarmRisk;
  readonly staleContextAgeMs: number;
  readonly staleHeartbeatAgeMs: number;
  readonly unhealthyNodePenalty: TradingSwarmRisk;
  readonly failedNodePenalty: TradingSwarmRisk;
  readonly unsynchronizedNodePenalty: TradingSwarmRisk;
  readonly degradedPartitionPenalty: TradingSwarmRisk;
  readonly unownedPartitionPenalty: TradingSwarmRisk;
  readonly expiredLeasePenalty: TradingSwarmRisk;
}

interface RiskDimensions {
  readonly systemicRisk: TradingSwarmRisk;
  readonly executionRisk: TradingSwarmRisk;
  readonly coordinationRisk: TradingSwarmRisk;
  readonly partitionRisk: TradingSwarmRisk;
}

export const DEFAULT_SWARM_RISK_ENGINE_WEIGHTS:
  SwarmRiskEngineWeights = Object.freeze({
    candidateRisk: 0.24,
    previousSystemRisk: 0.12,
    consensusRisk: 0.14,
    topologyRisk: 0.10,
    nodeHealthRisk: 0.10,
    synchronizationRisk: 0.08,
    partitionRisk: 0.10,
    executionExposureRisk: 0.07,
    dissentRisk: 0.05,
  });

/* ========================================================================== *
 * Engine
 * ========================================================================== */

export class SwarmRiskEngine
  implements TradingSwarmRiskEnginePort
{
  private readonly options: NormalizedOptions;

  public constructor(options: SwarmRiskEngineOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public assess(
    mission: TradingSwarmMission,
    consensus: TradingSwarmConsensusResult,
    candidates: readonly TradingSwarmDecisionCandidate[],
    topology: TradingSwarmTopologySnapshot,
    safety: TradingSwarmSafetyPolicy,
  ): TradingSwarmRiskAssessment {
    try {
      validateInputs(
        mission,
        consensus,
        candidates,
        topology,
        safety,
      );

      const selectedCandidate = resolveSelectedCandidate(
        consensus,
        candidates,
      );

      const assessedAtMs = resolveAssessedAt(
        mission,
        consensus,
        topology,
        this.options.assessedAtStrategy,
      );

      const findings: TradingSwarmRiskFinding[] = [];

      const dimensions = this.calculateDimensions(
        mission,
        consensus,
        selectedCandidate,
        topology,
        safety,
        assessedAtMs,
        findings,
      );

      const overallRisk = calculateOverallRisk(
        mission,
        consensus,
        selectedCandidate,
        dimensions,
        this.options.weights,
      );

      this.addThresholdFindings(
        mission,
        consensus,
        selectedCandidate,
        topology,
        safety,
        dimensions,
        overallRisk,
        assessedAtMs,
        findings,
      );

      const sortedFindings = Object.freeze(
        findings
          .map((finding) => deepFreeze(finding))
          .sort(compareFindings),
      );

      const blockingFindings = sortedFindings.filter(
        (finding) => finding.blocking,
      );

      const restrictions = Object.freeze(
        uniqueSorted([
          ...consensus.dissent
            .filter((record) => record.material)
            .map(
              (record) =>
                `Material dissent from node ${record.nodeId}: ${record.rationale}`,
            ),
          ...(selectedCandidate?.restrictions ?? []),
          ...blockingFindings.flatMap(
            (finding) => finding.mitigations,
          ),
          ...sortedFindings
            .filter(
              (finding) =>
                finding.severity === "HIGH" ||
                finding.severity === "CRITICAL",
            )
            .map((finding) => finding.title),
        ]),
      );

      const executionAllowed =
        consensus.quorumSatisfied &&
        consensus.selectedCandidateId !== undefined &&
        blockingFindings.length === 0 &&
        overallRisk <= safety.maximumSystemicRisk &&
        dimensions.executionRisk <=
          safety.maximumExecutionRisk &&
        consensus.collectiveConfidence.finalConfidence >=
          safety.minimumCollectiveConfidence;

      const base = {
        assessmentId: createAssessmentId(
          mission,
          consensus,
          selectedCandidate,
          topology,
          safety,
          dimensions,
          overallRisk,
        ),
        overallRisk,
        systemicRisk: dimensions.systemicRisk,
        executionRisk: dimensions.executionRisk,
        coordinationRisk: dimensions.coordinationRisk,
        partitionRisk: dimensions.partitionRisk,
        findings: sortedFindings,
        executionAllowed,
        restrictions,
        assessedAtMs,
      } satisfies Omit<
        TradingSwarmRiskAssessment,
        "deterministicFingerprint"
      >;

      return deepFreeze({
        ...base,
        deterministicFingerprint:
          this.options.fingerprintGenerator.fingerprint(base),
      });
    } catch (error) {
      if (error instanceof SwarmRiskEngineError) {
        throw error;
      }

      throw new SwarmRiskEngineError(
        "RISK_ASSESSMENT_FAILED",
        "Failed to assess deterministic swarm risk.",
        {
          missionId: mission?.missionId,
          consensusId: consensus?.consensusId,
          cause: error,
        },
      );
    }
  }

  private calculateDimensions(
    mission: TradingSwarmMission,
    consensus: TradingSwarmConsensusResult,
    selectedCandidate: TradingSwarmDecisionCandidate | undefined,
    topology: TradingSwarmTopologySnapshot,
    safety: TradingSwarmSafetyPolicy,
    assessedAtMs: TradingSwarmTimestamp,
    findings: TradingSwarmRiskFinding[],
  ): RiskDimensions {
    const nodeMetrics = calculateNodeMetrics(
      topology,
      assessedAtMs,
      this.options,
    );

    const partitionMetrics = calculatePartitionMetrics(
      mission,
      topology,
      assessedAtMs,
      this.options,
    );

    const consensusRisk = clampScore(
      1 -
        weightedAverage(
          [
            consensus.collectiveConfidence.finalConfidence,
            consensus.participationRatio,
            consensus.partitionCoverageRatio,
          ],
          [0.45, 0.30, 0.25],
        ),
    );

    const dissentRisk = calculateDissentRisk(consensus);

    const previousSystemRisk =
      mission.context.systemRisk.overallRisk;

    const candidateRisk =
      selectedCandidate?.estimatedRisk ?? 1;

    const systemicRisk = clampScore(
      weightedAverage(
        [
          candidateRisk,
          previousSystemRisk,
          consensusRisk,
          nodeMetrics.failedRatio,
          partitionMetrics.risk,
          dissentRisk,
        ],
        [0.28, 0.18, 0.18, 0.12, 0.14, 0.10],
      ),
    );

    const executionExposureRisk =
      calculateExecutionExposureRisk(
        mission,
        selectedCandidate,
        safety,
      );

    const executionRisk = clampScore(
      weightedAverage(
        [
          candidateRisk,
          executionExposureRisk,
          selectedCandidate === undefined ? 1 : 0,
          consensus.status === "VETOED" ? 1 : 0,
          consensus.status === "REJECTED" ? 0.85 : 0,
        ],
        [0.38, 0.28, 0.14, 0.12, 0.08],
      ),
    );

    const coordinationRisk = clampScore(
      weightedAverage(
        [
          consensusRisk,
          nodeMetrics.unhealthyRatio,
          nodeMetrics.unsynchronizedRatio,
          nodeMetrics.unavailableRatio,
          dissentRisk,
        ],
        [0.30, 0.20, 0.20, 0.15, 0.15],
      ),
    );

    const partitionRisk = clampScore(
      partitionMetrics.risk,
    );

    appendNodeFindings(
      mission,
      topology,
      safety,
      nodeMetrics,
      assessedAtMs,
      findings,
      this.options,
    );

    appendPartitionFindings(
      mission,
      topology,
      safety,
      partitionMetrics,
      assessedAtMs,
      findings,
      this.options,
    );

    appendConsensusFindings(
      mission,
      consensus,
      assessedAtMs,
      findings,
    );

    appendContextFindings(
      mission,
      assessedAtMs,
      safety,
      findings,
      this.options,
    );

    return deepFreeze({
      systemicRisk,
      executionRisk,
      coordinationRisk,
      partitionRisk,
    });
  }

  private addThresholdFindings(
    mission: TradingSwarmMission,
    consensus: TradingSwarmConsensusResult,
    selectedCandidate: TradingSwarmDecisionCandidate | undefined,
    topology: TradingSwarmTopologySnapshot,
    safety: TradingSwarmSafetyPolicy,
    dimensions: RiskDimensions,
    overallRisk: TradingSwarmRisk,
    assessedAtMs: TradingSwarmTimestamp,
    findings: TradingSwarmRiskFinding[],
  ): void {
    if (overallRisk > safety.maximumSystemicRisk) {
      findings.push(
        createFinding({
          mission,
          category: "SYSTEMIC",
          score: overallRisk,
          title: "Systemic risk exceeds safety limit",
          description:
            `Overall risk ${overallRisk.toFixed(6)} exceeds maximum systemic risk ${safety.maximumSystemicRisk.toFixed(6)}.`,
          nodeIds: topology.nodes.map(
            (state) => state.registration.identity.nodeId,
          ),
          partitionIds: topology.partitions.map(
            (partition) => partition.partitionId,
          ),
          mitigations: [
            "Reduce aggregate exposure.",
            "Reassess mission scope and candidate selection.",
            "Require risk or operator approval before execution.",
          ],
          blocking: true,
          detectedAtMs: assessedAtMs,
          options: this.options,
        }),
      );
    }

    if (
      dimensions.executionRisk >
      safety.maximumExecutionRisk
    ) {
      findings.push(
        createFinding({
          mission,
          category: "EXECUTION",
          score: dimensions.executionRisk,
          title: "Execution risk exceeds safety limit",
          description:
            `Execution risk ${dimensions.executionRisk.toFixed(6)} exceeds maximum execution risk ${safety.maximumExecutionRisk.toFixed(6)}.`,
          nodeIds:
            selectedCandidate === undefined
              ? []
              : [selectedCandidate.proposedByNodeId],
          partitionIds:
            selectedCandidate?.actions
              .map((action) => action.partitionId)
              .filter(
                (value): value is string =>
                  value !== undefined,
              ) ?? [],
          mitigations: [
            "Reduce order size or notional exposure.",
            "Use signal-only or paper execution.",
            "Require operator approval.",
          ],
          blocking: true,
          detectedAtMs: assessedAtMs,
          options: this.options,
        }),
      );
    }

    if (
      consensus.collectiveConfidence.finalConfidence <
      safety.minimumCollectiveConfidence
    ) {
      findings.push(
        createFinding({
          mission,
          category: "CONSENSUS",
          score: clampScore(
            1 -
              consensus.collectiveConfidence.finalConfidence,
          ),
          title: "Collective confidence below safety minimum",
          description:
            `Collective confidence ${consensus.collectiveConfidence.finalConfidence.toFixed(6)} is below minimum ${safety.minimumCollectiveConfidence.toFixed(6)}.`,
          nodeIds: consensus.ballots.map(
            (ballot) => ballot.nodeId,
          ),
          partitionIds: [],
          mitigations: [
            "Collect additional evidence.",
            "Repeat consensus with more eligible nodes.",
            "Defer execution.",
          ],
          blocking: safety.failClosed,
          detectedAtMs: assessedAtMs,
          options: this.options,
        }),
      );
    }

    if (selectedCandidate === undefined) {
      findings.push(
        createFinding({
          mission,
          category: "GOVERNANCE",
          score: 1,
          title: "No executable consensus candidate",
          description:
            `Consensus status ${consensus.status} did not select a candidate.`,
          nodeIds: consensus.ballots.map(
            (ballot) => ballot.nodeId,
          ),
          partitionIds: [],
          mitigations: [
            "Resolve consensus before execution.",
            "Do not authorize trading actions.",
          ],
          blocking: true,
          detectedAtMs: assessedAtMs,
          options: this.options,
        }),
      );
    }
  }
}

/* ========================================================================== *
 * Node metrics and findings
 * ========================================================================== */

interface NodeMetrics {
  readonly total: number;
  readonly failedNodeIds: readonly TradingSwarmNodeId[];
  readonly unhealthyNodeIds: readonly TradingSwarmNodeId[];
  readonly unavailableNodeIds: readonly TradingSwarmNodeId[];
  readonly unsynchronizedNodeIds: readonly TradingSwarmNodeId[];
  readonly staleHeartbeatNodeIds: readonly TradingSwarmNodeId[];
  readonly failedRatio: TradingSwarmScore;
  readonly unhealthyRatio: TradingSwarmScore;
  readonly unavailableRatio: TradingSwarmScore;
  readonly unsynchronizedRatio: TradingSwarmScore;
  readonly averageReliability: TradingSwarmScore;
}

function calculateNodeMetrics(
  topology: TradingSwarmTopologySnapshot,
  assessedAtMs: TradingSwarmTimestamp,
  options: NormalizedOptions,
): NodeMetrics {
  const failedNodeIds: string[] = [];
  const unhealthyNodeIds: string[] = [];
  const unavailableNodeIds: string[] = [];
  const unsynchronizedNodeIds: string[] = [];
  const staleHeartbeatNodeIds: string[] = [];

  let reliabilityTotal = 0;

  for (const state of topology.nodes) {
    const nodeId = state.registration.identity.nodeId;
    const health = state.health;

    reliabilityTotal += health.reliabilityScore;

    if (
      health.lifecycleState === "FAILED" ||
      health.lifecycleState === "REMOVED"
    ) {
      failedNodeIds.push(nodeId);
    }

    if (!health.healthy) {
      unhealthyNodeIds.push(nodeId);
    }

    if (
      health.availability === "UNAVAILABLE" ||
      health.availability === "UNKNOWN"
    ) {
      unavailableNodeIds.push(nodeId);
    }

    if (
      health.synchronizationScore < 0.7 ||
      health.lastSynchronizedAtMs === undefined
    ) {
      unsynchronizedNodeIds.push(nodeId);
    }

    if (
      health.lastHeartbeatAtMs === undefined ||
      assessedAtMs - health.lastHeartbeatAtMs >
        options.staleHeartbeatAgeMs
    ) {
      staleHeartbeatNodeIds.push(nodeId);
    }
  }

  const total = topology.nodes.length;

  return deepFreeze({
    total,
    failedNodeIds: Object.freeze(failedNodeIds.sort()),
    unhealthyNodeIds: Object.freeze(
      unhealthyNodeIds.sort(),
    ),
    unavailableNodeIds: Object.freeze(
      unavailableNodeIds.sort(),
    ),
    unsynchronizedNodeIds: Object.freeze(
      unsynchronizedNodeIds.sort(),
    ),
    staleHeartbeatNodeIds: Object.freeze(
      staleHeartbeatNodeIds.sort(),
    ),
    failedRatio: ratio(failedNodeIds.length, total),
    unhealthyRatio: ratio(
      unhealthyNodeIds.length,
      total,
    ),
    unavailableRatio: ratio(
      unavailableNodeIds.length,
      total,
    ),
    unsynchronizedRatio: ratio(
      unsynchronizedNodeIds.length,
      total,
    ),
    averageReliability:
      total === 0
        ? 0
        : clampScore(reliabilityTotal / total),
  });
}

function appendNodeFindings(
  mission: TradingSwarmMission,
  topology: TradingSwarmTopologySnapshot,
  safety: TradingSwarmSafetyPolicy,
  metrics: NodeMetrics,
  assessedAtMs: TradingSwarmTimestamp,
  findings: TradingSwarmRiskFinding[],
  options: NormalizedOptions,
): void {
  if (
    metrics.failedRatio >
    safety.maximumFailedNodeRatio
  ) {
    findings.push(
      createFinding({
        mission,
        category: "TOPOLOGY",
        score: metrics.failedRatio,
        title: "Failed node ratio exceeds limit",
        description:
          `Failed node ratio ${metrics.failedRatio.toFixed(6)} exceeds maximum ${safety.maximumFailedNodeRatio.toFixed(6)}.`,
        nodeIds: metrics.failedNodeIds,
        partitionIds: [],
        mitigations: [
          "Replace or recover failed nodes.",
          "Rebalance affected partitions.",
          "Defer execution until quorum stability is restored.",
        ],
        blocking: true,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (
    metrics.unsynchronizedRatio >
    safety.maximumUnsynchronizedNodeRatio
  ) {
    findings.push(
      createFinding({
        mission,
        category: "SYNCHRONIZATION",
        score: metrics.unsynchronizedRatio,
        title: "Unsynchronized node ratio exceeds limit",
        description:
          `Unsynchronized node ratio ${metrics.unsynchronizedRatio.toFixed(6)} exceeds maximum ${safety.maximumUnsynchronizedNodeRatio.toFixed(6)}.`,
        nodeIds: metrics.unsynchronizedNodeIds,
        partitionIds: [],
        mitigations: [
          "Resynchronize node state.",
          "Refresh checkpoints and topology state.",
          "Exclude stale nodes from execution authority.",
        ],
        blocking: safety.failClosed,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (
    metrics.averageReliability <
    safety.minimumNodeReliability
  ) {
    findings.push(
      createFinding({
        mission,
        category: "OPERATIONAL",
        score: clampScore(
          1 - metrics.averageReliability,
        ),
        title: "Average node reliability below minimum",
        description:
          `Average reliability ${metrics.averageReliability.toFixed(6)} is below minimum ${safety.minimumNodeReliability.toFixed(6)}.`,
        nodeIds: topology.nodes
          .filter(
            (state) =>
              state.health.reliabilityScore <
              safety.minimumNodeReliability,
          )
          .map(
            (state) =>
              state.registration.identity.nodeId,
          ),
        partitionIds: [],
        mitigations: [
          "Exclude unreliable nodes.",
          "Elect or assign higher-trust nodes.",
          "Require operator approval for degraded execution.",
        ],
        blocking: safety.failClosed,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (
    safety.requireHealthyLeader &&
    (
      topology.leaderNodeId === undefined ||
      !topology.nodes.some(
        (state) =>
          state.registration.identity.nodeId ===
            topology.leaderNodeId &&
          state.health.healthy,
      )
    )
  ) {
    findings.push(
      createFinding({
        mission,
        category: "TOPOLOGY",
        score: 1,
        title: "Healthy leader requirement not satisfied",
        description:
          "The topology does not contain a healthy active leader.",
        nodeIds:
          topology.leaderNodeId === undefined
            ? []
            : [topology.leaderNodeId],
        partitionIds: [],
        mitigations: [
          "Run deterministic leader election.",
          "Restore leader health before execution.",
        ],
        blocking: true,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (metrics.staleHeartbeatNodeIds.length > 0) {
    findings.push(
      createFinding({
        mission,
        category: "DATA_FRESHNESS",
        score: ratio(
          metrics.staleHeartbeatNodeIds.length,
          Math.max(1, metrics.total),
        ),
        title: "Stale node heartbeats detected",
        description:
          `${metrics.staleHeartbeatNodeIds.length} node heartbeat records are stale or missing.`,
        nodeIds: metrics.staleHeartbeatNodeIds,
        partitionIds: [],
        mitigations: [
          "Refresh node heartbeat state.",
          "Exclude stale nodes from execution.",
        ],
        blocking: false,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }
}

/* ========================================================================== *
 * Partition metrics and findings
 * ========================================================================== */

interface PartitionMetrics {
  readonly requiredPartitionIds: readonly TradingSwarmPartitionId[];
  readonly missingPartitionIds: readonly TradingSwarmPartitionId[];
  readonly unownedPartitionIds: readonly TradingSwarmPartitionId[];
  readonly degradedPartitionIds: readonly TradingSwarmPartitionId[];
  readonly conflictingPartitionIds: readonly TradingSwarmPartitionId[];
  readonly expiredLeasePartitionIds: readonly TradingSwarmPartitionId[];
  readonly coverageRatio: TradingSwarmScore;
  readonly risk: TradingSwarmRisk;
}

function calculatePartitionMetrics(
  mission: TradingSwarmMission,
  topology: TradingSwarmTopologySnapshot,
  assessedAtMs: TradingSwarmTimestamp,
  options: NormalizedOptions,
): PartitionMetrics {
  const requiredPartitionIds = uniqueSorted([
    ...mission.partitionIds,
    ...(mission.constraints.requiredPartitionIds ?? []),
  ]);

  const partitionById = new Map(
    topology.partitions.map(
      (partition) =>
        [partition.partitionId, partition] as const,
    ),
  );

  const leasesByPartition = new Map<string, number>();

  for (const lease of topology.leases) {
    leasesByPartition.set(
      lease.partitionId,
      (leasesByPartition.get(lease.partitionId) ?? 0) +
        1,
    );
  }

  const missingPartitionIds: string[] = [];
  const unownedPartitionIds: string[] = [];
  const degradedPartitionIds: string[] = [];
  const conflictingPartitionIds: string[] = [];
  const expiredLeasePartitionIds: string[] = [];

  for (const partitionId of requiredPartitionIds) {
    const partition = partitionById.get(partitionId);

    if (partition === undefined) {
      missingPartitionIds.push(partitionId);
      continue;
    }

    if (partition.ownerNodeId === undefined) {
      unownedPartitionIds.push(partitionId);
    }

    if (
      partition.state === "DEGRADED" ||
      partition.state === "RECOVERING" ||
      partition.state === "QUARANTINED"
    ) {
      degradedPartitionIds.push(partitionId);
    }

    if (
      (leasesByPartition.get(partitionId) ?? 0) > 1
    ) {
      conflictingPartitionIds.push(partitionId);
    }

    const activeLease = topology.leases.find(
      (lease) =>
        lease.partitionId === partitionId &&
        lease.expiresAtMs >= assessedAtMs,
    );

    if (
      partition.ownerNodeId !== undefined &&
      activeLease === undefined
    ) {
      expiredLeasePartitionIds.push(partitionId);
    }
  }

  const covered =
    requiredPartitionIds.length -
    missingPartitionIds.length;

  const coverageRatio =
    requiredPartitionIds.length === 0
      ? 1
      : clampScore(
          covered / requiredPartitionIds.length,
        );

  const risk = clampScore(
    weightedAverage(
      [
        1 - coverageRatio,
        ratio(
          unownedPartitionIds.length,
          Math.max(1, requiredPartitionIds.length),
        ),
        ratio(
          degradedPartitionIds.length,
          Math.max(1, requiredPartitionIds.length),
        ),
        ratio(
          conflictingPartitionIds.length,
          Math.max(1, requiredPartitionIds.length),
        ),
        ratio(
          expiredLeasePartitionIds.length,
          Math.max(1, requiredPartitionIds.length),
        ),
      ],
      [0.30, 0.20, 0.18, 0.20, 0.12],
    ),
  );

  return deepFreeze({
    requiredPartitionIds,
    missingPartitionIds: Object.freeze(
      missingPartitionIds.sort(),
    ),
    unownedPartitionIds: Object.freeze(
      unownedPartitionIds.sort(),
    ),
    degradedPartitionIds: Object.freeze(
      degradedPartitionIds.sort(),
    ),
    conflictingPartitionIds: Object.freeze(
      conflictingPartitionIds.sort(),
    ),
    expiredLeasePartitionIds: Object.freeze(
      expiredLeasePartitionIds.sort(),
    ),
    coverageRatio,
    risk,
  });
}

function appendPartitionFindings(
  mission: TradingSwarmMission,
  topology: TradingSwarmTopologySnapshot,
  safety: TradingSwarmSafetyPolicy,
  metrics: PartitionMetrics,
  assessedAtMs: TradingSwarmTimestamp,
  findings: TradingSwarmRiskFinding[],
  options: NormalizedOptions,
): void {
  if (
    metrics.coverageRatio <
    safety.minimumPartitionCoverage
  ) {
    findings.push(
      createFinding({
        mission,
        category: "PARTITION",
        score: clampScore(
          1 - metrics.coverageRatio,
        ),
        title: "Partition coverage below minimum",
        description:
          `Partition coverage ${metrics.coverageRatio.toFixed(6)} is below minimum ${safety.minimumPartitionCoverage.toFixed(6)}.`,
        nodeIds: [],
        partitionIds: metrics.missingPartitionIds,
        mitigations: [
          "Restore missing partitions.",
          "Reassign partition ownership.",
          "Defer mission execution.",
        ],
        blocking: true,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (metrics.unownedPartitionIds.length > 0) {
    findings.push(
      createFinding({
        mission,
        category: "PARTITION",
        score: clampScore(
          metrics.unownedPartitionIds.length *
            options.unownedPartitionPenalty,
        ),
        title: "Unowned partitions detected",
        description:
          `${metrics.unownedPartitionIds.length} required partitions have no owner.`,
        nodeIds: [],
        partitionIds: metrics.unownedPartitionIds,
        mitigations: [
          "Assign deterministic partition owners.",
          "Acquire valid partition leases.",
        ],
        blocking: safety.failClosed,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (metrics.degradedPartitionIds.length > 0) {
    findings.push(
      createFinding({
        mission,
        category: "PARTITION",
        score: clampScore(
          metrics.degradedPartitionIds.length *
            options.degradedPartitionPenalty,
        ),
        title: "Degraded partitions detected",
        description:
          `${metrics.degradedPartitionIds.length} required partitions are degraded, recovering, or quarantined.`,
        nodeIds: topology.partitions
          .filter((partition) =>
            metrics.degradedPartitionIds.includes(
              partition.partitionId,
            ),
          )
          .flatMap((partition) =>
            partition.ownerNodeId === undefined
              ? []
              : [partition.ownerNodeId],
          ),
        partitionIds: metrics.degradedPartitionIds,
        mitigations: [
          "Recover or replace degraded partitions.",
          "Use healthy replicas where available.",
        ],
        blocking: false,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (
    metrics.conflictingPartitionIds.length > 0
  ) {
    findings.push(
      createFinding({
        mission,
        category: "PARTITION",
        score: 1,
        title: "Partition lease conflict detected",
        description:
          `${metrics.conflictingPartitionIds.length} partitions have conflicting active lease records.`,
        nodeIds: [],
        partitionIds:
          metrics.conflictingPartitionIds,
        mitigations: [
          "Resolve lease ownership conflicts.",
          "Advance fencing tokens.",
          "Reject execution until ownership is singular.",
        ],
        blocking:
          safety.rejectOnPartitionConflict ||
          safety.failClosed,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }

  if (
    metrics.expiredLeasePartitionIds.length > 0
  ) {
    findings.push(
      createFinding({
        mission,
        category: "PARTITION",
        score: clampScore(
          metrics.expiredLeasePartitionIds.length *
            options.expiredLeasePenalty,
        ),
        title: "Expired or missing partition leases",
        description:
          `${metrics.expiredLeasePartitionIds.length} owned partitions lack a current valid lease.`,
        nodeIds: [],
        partitionIds:
          metrics.expiredLeasePartitionIds,
        mitigations: [
          "Renew partition leases.",
          "Validate fencing tokens before execution.",
        ],
        blocking: safety.failClosed,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }
}

/* ========================================================================== *
 * Consensus and context findings
 * ========================================================================== */

function appendConsensusFindings(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  assessedAtMs: TradingSwarmTimestamp,
  findings: TradingSwarmRiskFinding[],
): void {
  if (!consensus.quorumSatisfied) {
    findings.push(
      createFinding({
        mission,
        category: "CONSENSUS",
        score: 1,
        title: "Consensus quorum not satisfied",
        description:
          `Consensus ${consensus.consensusId} did not satisfy quorum.`,
        nodeIds: consensus.ballots.map(
          (ballot) => ballot.nodeId,
        ),
        partitionIds: [],
        mitigations: [
          "Restore required quorum.",
          "Include missing required roles and capabilities.",
          "Do not execute.",
        ],
        blocking: true,
        detectedAtMs: assessedAtMs,
        options: DEFAULT_RUNTIME_OPTIONS,
      }),
    );
  }

  if (consensus.vetoCount > 0) {
    findings.push(
      createFinding({
        mission,
        category: "GOVERNANCE",
        score: 1,
        title: "Consensus veto recorded",
        description:
          `${consensus.vetoCount} veto ballots were recorded.`,
        nodeIds: consensus.ballots
          .filter((ballot) => ballot.choice === "VETO")
          .map((ballot) => ballot.nodeId),
        partitionIds: [],
        mitigations: [
          "Resolve veto rationale.",
          "Require governance or operator approval.",
        ],
        blocking: true,
        detectedAtMs: assessedAtMs,
        options: DEFAULT_RUNTIME_OPTIONS,
      }),
    );
  }

  const materialDissent = consensus.dissent.filter(
    (record) => record.material,
  );

  if (materialDissent.length > 0) {
    findings.push(
      createFinding({
        mission,
        category: "CONSENSUS",
        score: calculateDissentRisk(consensus),
        title: "Material dissent remains unresolved",
        description:
          `${materialDissent.length} material dissent records remain.`,
        nodeIds: materialDissent.map(
          (record) => record.nodeId,
        ),
        partitionIds: [],
        mitigations: [
          "Resolve dissent before execution.",
          "Evaluate lower-risk alternatives.",
        ],
        blocking: false,
        detectedAtMs: assessedAtMs,
        options: DEFAULT_RUNTIME_OPTIONS,
      }),
    );
  }
}

function appendContextFindings(
  mission: TradingSwarmMission,
  assessedAtMs: TradingSwarmTimestamp,
  safety: TradingSwarmSafetyPolicy,
  findings: TradingSwarmRiskFinding[],
  options: NormalizedOptions,
): void {
  const contextAge =
    assessedAtMs - mission.context.builtAtMs;

  if (contextAge > options.staleContextAgeMs) {
    findings.push(
      createFinding({
        mission,
        category: "DATA_FRESHNESS",
        score: clampScore(
          contextAge /
            Math.max(
              1,
              options.staleContextAgeMs * 2,
            ),
        ),
        title: "Swarm context is stale",
        description:
          `Mission context age ${contextAge}ms exceeds allowed age ${options.staleContextAgeMs}ms.`,
        nodeIds: [],
        partitionIds: [],
        mitigations: [
          "Rebuild swarm context.",
          "Refresh market, topology, and execution state.",
        ],
        blocking:
          safety.rejectOnStaleContext ||
          safety.failClosed,
        detectedAtMs: assessedAtMs,
        options,
      }),
    );
  }
}

/* ========================================================================== *
 * Risk calculations
 * ========================================================================== */

function calculateOverallRisk(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  selectedCandidate: TradingSwarmDecisionCandidate | undefined,
  dimensions: RiskDimensions,
  weights: SwarmRiskEngineWeights,
): TradingSwarmRisk {
  const consensusRisk = clampScore(
    1 -
      consensus.collectiveConfidence.finalConfidence,
  );

  const topologyRisk =
    mission.context.topology.nodes.length === 0
      ? 1
      : 0;

  const nodeHealthRisk =
    mission.context.topology.nodes.length === 0
      ? 1
      : clampScore(
          mission.context.topology.nodes.reduce(
            (sum, state) =>
              sum +
              (1 - state.health.reliabilityScore),
            0,
          ) /
            mission.context.topology.nodes.length,
        );

  const synchronizationRisk =
    mission.context.topology.nodes.length === 0
      ? 1
      : clampScore(
          mission.context.topology.nodes.reduce(
            (sum, state) =>
              sum +
              (1 -
                state.health.synchronizationScore),
            0,
          ) /
            mission.context.topology.nodes.length,
        );

  const dissentRisk =
    calculateDissentRisk(consensus);

  return clampScore(
    weightedAverage(
      [
        selectedCandidate?.estimatedRisk ?? 1,
        mission.context.systemRisk.overallRisk,
        consensusRisk,
        topologyRisk,
        nodeHealthRisk,
        synchronizationRisk,
        dimensions.partitionRisk,
        dimensions.executionRisk,
        dissentRisk,
      ],
      [
        weights.candidateRisk,
        weights.previousSystemRisk,
        weights.consensusRisk,
        weights.topologyRisk,
        weights.nodeHealthRisk,
        weights.synchronizationRisk,
        weights.partitionRisk,
        weights.executionExposureRisk,
        weights.dissentRisk,
      ],
    ),
  );
}

function calculateExecutionExposureRisk(
  mission: TradingSwarmMission,
  candidate: TradingSwarmDecisionCandidate | undefined,
  safety: TradingSwarmSafetyPolicy,
): TradingSwarmRisk {
  if (candidate === undefined) {
    return 1;
  }

  const notionals = candidate.actions
    .map((action) => action.notional ?? 0)
    .filter((value) => value > 0);

  const totalNotional = notionals.reduce(
    (sum, value) => sum + value,
    0,
  );

  const capitalLimit =
    Math.min(
      safety.maximumCapitalAtRisk,
      mission.constraints.maximumCapitalAtRisk ??
        safety.maximumCapitalAtRisk,
    );

  const capitalRisk =
    capitalLimit <= 0
      ? totalNotional > 0
        ? 1
        : 0
      : clampScore(totalNotional / capitalLimit);

  const actionCountLimit =
    mission.constraints.maximumExecutionActions;

  const actionCountRisk =
    actionCountLimit === undefined ||
    actionCountLimit <= 0
      ? 0
      : clampScore(
          candidate.actions.length /
            actionCountLimit,
        );

  return clampScore(
    weightedAverage(
      [
        candidate.estimatedRisk,
        capitalRisk,
        actionCountRisk,
      ],
      [0.50, 0.35, 0.15],
    ),
  );
}

function calculateDissentRisk(
  consensus: TradingSwarmConsensusResult,
): TradingSwarmRisk {
  if (consensus.ballots.length === 0) {
    return consensus.dissent.length > 0 ? 1 : 0;
  }

  const materialCount = consensus.dissent.filter(
    (record) => record.material,
  ).length;

  const vetoRatio =
    consensus.vetoCount /
    consensus.ballots.length;

  const rejectionRatio =
    consensus.rejectionWeight /
    Math.max(
      1,
      consensus.approvalWeight +
        consensus.rejectionWeight +
        consensus.abstentionWeight,
    );

  return clampScore(
    weightedAverage(
      [
        materialCount /
          consensus.ballots.length,
        vetoRatio,
        rejectionRatio,
      ],
      [0.45, 0.35, 0.20],
    ),
  );
}

/* ========================================================================== *
 * Finding construction
 * ========================================================================== */

interface FindingInput {
  readonly mission: TradingSwarmMission;
  readonly category: TradingSwarmRiskCategory;
  readonly score: TradingSwarmRisk;
  readonly title: string;
  readonly description: string;
  readonly nodeIds: readonly TradingSwarmNodeId[];
  readonly partitionIds: readonly TradingSwarmPartitionId[];
  readonly mitigations: readonly string[];
  readonly blocking: boolean;
  readonly detectedAtMs: TradingSwarmTimestamp;
  readonly options: NormalizedOptions;
}

function createFinding(
  input: FindingInput,
): TradingSwarmRiskFinding {
  const severity = severityFromScore(
    input.score,
    input.options,
  );

  return deepFreeze({
    findingId: `swarm-risk-finding-${stableHash(
      stableStringify({
        missionId: input.mission.missionId,
        category: input.category,
        title: input.title,
        nodeIds: [...input.nodeIds].sort(),
        partitionIds: [
          ...input.partitionIds,
        ].sort(),
        score: clampScore(input.score),
        detectedAtMs: input.detectedAtMs,
      }),
    )}`,
    category: input.category,
    severity,
    score: clampScore(input.score),
    title: input.title,
    description: input.description,
    affectedNodeIds: Object.freeze(
      uniqueSorted(input.nodeIds),
    ),
    affectedPartitionIds: Object.freeze(
      uniqueSorted(input.partitionIds),
    ),
    mitigations: Object.freeze(
      uniqueSorted(input.mitigations),
    ),
    blocking: input.blocking,
    detectedAtMs: input.detectedAtMs,
  });
}

function severityFromScore(
  score: number,
  options: NormalizedOptions,
): TradingSwarmRiskSeverity {
  if (score >= options.criticalThreshold) {
    return "CRITICAL";
  }

  if (score >= options.highThreshold) {
    return "HIGH";
  }

  if (score >= options.warningThreshold) {
    return "MODERATE";
  }

  if (score > 0) {
    return "LOW";
  }

  return "INFORMATIONAL";
}

function compareFindings(
  left: TradingSwarmRiskFinding,
  right: TradingSwarmRiskFinding,
): number {
  const severityOrder =
    severityRank(right.severity) -
    severityRank(left.severity);

  if (severityOrder !== 0) {
    return severityOrder;
  }

  const scoreOrder = right.score - left.score;

  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  const categoryOrder =
    left.category.localeCompare(right.category);

  if (categoryOrder !== 0) {
    return categoryOrder;
  }

  return left.findingId.localeCompare(
    right.findingId,
  );
}

function severityRank(
  severity: TradingSwarmRiskSeverity,
): number {
  switch (severity) {
    case "INFORMATIONAL":
      return 0;
    case "LOW":
      return 1;
    case "MODERATE":
      return 2;
    case "HIGH":
      return 3;
    case "CRITICAL":
      return 4;
  }
}

/* ========================================================================== *
 * Validation and identity
 * ========================================================================== */

function validateInputs(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  candidates: readonly TradingSwarmDecisionCandidate[],
  topology: TradingSwarmTopologySnapshot,
  safety: TradingSwarmSafetyPolicy,
): void {
  if (
    mission === undefined ||
    mission === null ||
    typeof mission.missionId !== "string" ||
    mission.missionId.trim().length === 0
  ) {
    throw new SwarmRiskEngineError(
      "INVALID_MISSION",
      "A valid swarm mission is required.",
    );
  }

  if (
    consensus === undefined ||
    consensus === null ||
    typeof consensus.consensusId !== "string" ||
    consensus.consensusId.trim().length === 0
  ) {
    throw new SwarmRiskEngineError(
      "INVALID_CONSENSUS",
      "A valid consensus result is required.",
      { missionId: mission.missionId },
    );
  }

  if (consensus.missionId !== mission.missionId) {
    throw new SwarmRiskEngineError(
      "MISSION_MISMATCH",
      "Consensus result belongs to another mission.",
      {
        missionId: mission.missionId,
        consensusId: consensus.consensusId,
      },
    );
  }

  if (!Array.isArray(candidates)) {
    throw new SwarmRiskEngineError(
      "INVALID_CANDIDATES",
      "candidates must be an array.",
      { missionId: mission.missionId },
    );
  }

  const candidateIds = new Set<string>();

  for (const candidate of candidates) {
    if (candidateIds.has(candidate.candidateId)) {
      throw new SwarmRiskEngineError(
        "DUPLICATE_CANDIDATE",
        `Duplicate candidate "${candidate.candidateId}".`,
        {
          missionId: mission.missionId,
          candidateId: candidate.candidateId,
        },
      );
    }

    candidateIds.add(candidate.candidateId);

    if (candidate.missionId !== mission.missionId) {
      throw new SwarmRiskEngineError(
        "MISSION_MISMATCH",
        `Candidate "${candidate.candidateId}" belongs to another mission.`,
        {
          missionId: mission.missionId,
          candidateId: candidate.candidateId,
        },
      );
    }

    validateScore(
      candidate.confidence,
      "candidate.confidence",
    );
    validateScore(
      candidate.estimatedRisk,
      "candidate.estimatedRisk",
    );
    validateScore(
      candidate.partitionCoverageRatio,
      "candidate.partitionCoverageRatio",
    );
  }

  if (
    topology === undefined ||
    topology === null ||
    topology.swarmId !== mission.swarmId
  ) {
    throw new SwarmRiskEngineError(
      "INVALID_TOPOLOGY",
      "Topology snapshot is missing or belongs to another swarm.",
      { missionId: mission.missionId },
    );
  }

  validateSafetyPolicy(safety);
}

function validateSafetyPolicy(
  safety: TradingSwarmSafetyPolicy,
): void {
  if (safety === undefined || safety === null) {
    throw new SwarmRiskEngineError(
      "INVALID_SAFETY_POLICY",
      "A swarm safety policy is required.",
    );
  }

  const scores: readonly [string, number][] = [
    [
      "minimumCollectiveConfidence",
      safety.minimumCollectiveConfidence,
    ],
    [
      "minimumNodeReliability",
      safety.minimumNodeReliability,
    ],
    [
      "minimumPartitionCoverage",
      safety.minimumPartitionCoverage,
    ],
    [
      "maximumSystemicRisk",
      safety.maximumSystemicRisk,
    ],
    [
      "maximumExecutionRisk",
      safety.maximumExecutionRisk,
    ],
    [
      "maximumFailedNodeRatio",
      safety.maximumFailedNodeRatio,
    ],
    [
      "maximumUnsynchronizedNodeRatio",
      safety.maximumUnsynchronizedNodeRatio,
    ],
  ];

  for (const [field, value] of scores) {
    validateScore(value, `safety.${field}`);
  }

  for (
    const [field, value] of [
      ["maximumCapitalAtRisk", safety.maximumCapitalAtRisk],
      ["maximumLeverage", safety.maximumLeverage],
      ["maximumDrawdown", safety.maximumDrawdown],
    ] as const
  ) {
    if (!Number.isFinite(value) || value < 0) {
      throw new SwarmRiskEngineError(
        "INVALID_SAFETY_POLICY",
        `safety.${field} must be non-negative and finite.`,
        { field },
      );
    }
  }
}

function resolveSelectedCandidate(
  consensus: TradingSwarmConsensusResult,
  candidates: readonly TradingSwarmDecisionCandidate[],
): TradingSwarmDecisionCandidate | undefined {
  if (consensus.selectedCandidateId === undefined) {
    return undefined;
  }

  const candidate = candidates.find(
    (item) =>
      item.candidateId ===
      consensus.selectedCandidateId,
  );

  if (candidate === undefined) {
    throw new SwarmRiskEngineError(
      "SELECTED_CANDIDATE_NOT_FOUND",
      `Selected candidate "${consensus.selectedCandidateId}" was not supplied.`,
      {
        missionId: consensus.missionId,
        consensusId: consensus.consensusId,
        candidateId: consensus.selectedCandidateId,
      },
    );
  }

  return candidate;
}

function createAssessmentId(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  candidate: TradingSwarmDecisionCandidate | undefined,
  topology: TradingSwarmTopologySnapshot,
  safety: TradingSwarmSafetyPolicy,
  dimensions: RiskDimensions,
  overallRisk: TradingSwarmRisk,
): string {
  return `swarm-risk-assessment-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint:
        mission.deterministicFingerprint,
      consensusId: consensus.consensusId,
      consensusFingerprint:
        consensus.deterministicFingerprint,
      candidateId: candidate?.candidateId ?? null,
      candidateFingerprint:
        candidate?.deterministicFingerprint ?? null,
      topologyFingerprint:
        topology.deterministicFingerprint,
      safety,
      dimensions,
      overallRisk,
    }),
  )}`;
}

function resolveAssessedAt(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  topology: TradingSwarmTopologySnapshot,
  strategy: NormalizedOptions["assessedAtStrategy"],
): TradingSwarmTimestamp {
  switch (strategy) {
    case "MISSION_TIME":
      return mission.createdAtMs;
    case "CONSENSUS_TIME":
      return consensus.formedAtMs;
    case "TOPOLOGY_TIME":
      return topology.capturedAtMs;
  }
}

/* ========================================================================== *
 * Configuration and factory
 * ========================================================================== */

function normalizeOptions(
  options: SwarmRiskEngineOptions = {},
): NormalizedOptions {
  const weights = {
    ...DEFAULT_SWARM_RISK_ENGINE_WEIGHTS,
    ...(options.weights ?? {}),
  };

  for (const [field, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new SwarmRiskEngineError(
        "INVALID_SAFETY_POLICY",
        `Weight "${field}" must be non-negative and finite.`,
        { field },
      );
    }
  }

  const normalized: NormalizedOptions = {
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmRiskFingerprintGenerator(),
    weights: Object.freeze(weights),
    assessedAtStrategy:
      options.assessedAtStrategy ?? "CONSENSUS_TIME",
    warningThreshold:
      options.warningThreshold ?? 0.35,
    highThreshold: options.highThreshold ?? 0.65,
    criticalThreshold:
      options.criticalThreshold ?? 0.85,
    staleContextAgeMs:
      options.staleContextAgeMs ?? 60_000,
    staleHeartbeatAgeMs:
      options.staleHeartbeatAgeMs ?? 30_000,
    unhealthyNodePenalty:
      options.unhealthyNodePenalty ?? 0.20,
    failedNodePenalty:
      options.failedNodePenalty ?? 0.35,
    unsynchronizedNodePenalty:
      options.unsynchronizedNodePenalty ?? 0.18,
    degradedPartitionPenalty:
      options.degradedPartitionPenalty ?? 0.20,
    unownedPartitionPenalty:
      options.unownedPartitionPenalty ?? 0.30,
    expiredLeasePenalty:
      options.expiredLeasePenalty ?? 0.25,
  };

  validateScore(
    normalized.warningThreshold,
    "warningThreshold",
  );
  validateScore(
    normalized.highThreshold,
    "highThreshold",
  );
  validateScore(
    normalized.criticalThreshold,
    "criticalThreshold",
  );

  if (
    normalized.warningThreshold >
      normalized.highThreshold ||
    normalized.highThreshold >
      normalized.criticalThreshold
  ) {
    throw new SwarmRiskEngineError(
      "INVALID_SAFETY_POLICY",
      "Risk thresholds must be ordered warning <= high <= critical.",
    );
  }

  for (
    const [field, value] of [
      ["staleContextAgeMs", normalized.staleContextAgeMs],
      [
        "staleHeartbeatAgeMs",
        normalized.staleHeartbeatAgeMs,
      ],
    ] as const
  ) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new SwarmRiskEngineError(
        "INVALID_SAFETY_POLICY",
        `${field} must be a positive safe integer.`,
        { field },
      );
    }
  }

  return Object.freeze(normalized);
}

export function createSwarmRiskEngine(
  options: SwarmRiskEngineOptions = {},
): SwarmRiskEngine {
  return new SwarmRiskEngine(options);
}

export class StableSwarmRiskFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-risk-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

const DEFAULT_RUNTIME_OPTIONS: NormalizedOptions =
  normalizeOptions();

/* ========================================================================== *
 * Deterministic utilities
 * ========================================================================== */

function weightedAverage(
  values: readonly number[],
  weights: readonly number[],
): number {
  if (values.length !== weights.length) {
    throw new SwarmRiskEngineError(
      "RISK_ASSESSMENT_FAILED",
      "Weighted-average inputs must have equal lengths.",
    );
  }

  let weighted = 0;
  let totalWeight = 0;

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    weighted +=
      (values[index] ?? 0) *
      (weights[index] ?? 0);
    totalWeight += weights[index] ?? 0;
  }

  return totalWeight === 0
    ? 0
    : weighted / totalWeight;
}

function ratio(
  numerator: number,
  denominator: number,
): TradingSwarmScore {
  if (denominator <= 0) {
    return numerator > 0 ? 1 : 0;
  }

  return clampScore(numerator / denominator);
}

function clampScore(value: number): TradingSwarmScore {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
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
    throw new SwarmRiskEngineError(
      "INVALID_SAFETY_POLICY",
      `${field} must be between 0 and 1.`,
      { field },
    );
  }
}

function uniqueSorted(
  values: readonly string[],
): readonly string[] {
  return Object.freeze(
    [...new Set(
      values.filter(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0,
      ),
    )].sort((left, right) =>
      left.localeCompare(right),
    ),
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
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key);
      deepFreeze(item);
    }
  } else if (value instanceof Set) {
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

  if (value instanceof Set) {
    return [...value]
      .map(normalizeForStableJson)
      .sort(compareNormalized);
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
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      result[key] =
        normalizeForStableJson(item);
    }

    return result;
  }

  return String(value);
}

function compareNormalized(
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
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

// End of swarm-risk-engine.ts