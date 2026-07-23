/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-consensus-engine.ts
 *
 * Deterministic distributed consensus formation for swarm decision candidates.
 */

import {
  type TradingSwarmBallotChoice,
  type TradingSwarmCollectiveConfidence,
  type TradingSwarmConsensusEnginePort,
  type TradingSwarmConsensusMethod,
  type TradingSwarmConsensusPolicy,
  type TradingSwarmConsensusResult,
  type TradingSwarmConsensusStatus,
  type TradingSwarmDecisionBallot,
  type TradingSwarmDecisionCandidate,
  type TradingSwarmDissentRecord,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmMission,
  type TradingSwarmNodeContribution,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeTrustScore,
  type TradingSwarmScore,
  type TradingSwarmTimestamp,
  type TradingSwarmWeight,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmConsensusEngineErrorCode =
  | "INVALID_MISSION"
  | "INVALID_CANDIDATES"
  | "INVALID_CONTRIBUTIONS"
  | "INVALID_NODES"
  | "INVALID_TRUST"
  | "INVALID_POLICY"
  | "MISSION_MISMATCH"
  | "DUPLICATE_CANDIDATE"
  | "DUPLICATE_NODE"
  | "DUPLICATE_CONTRIBUTION"
  | "DUPLICATE_TRUST_SCORE"
  | "CONSENSUS_FORMATION_FAILED";

export interface SwarmConsensusEngineErrorDetails {
  readonly missionId?: string;
  readonly candidateId?: string;
  readonly nodeId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmConsensusEngineError extends Error {
  public readonly code: SwarmConsensusEngineErrorCode;
  public readonly details: SwarmConsensusEngineErrorDetails;

  public constructor(
    code: SwarmConsensusEngineErrorCode,
    message: string,
    details: SwarmConsensusEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmConsensusEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmConsensusEngineWeights {
  readonly candidateConfidence: number;
  readonly expectedUtility: number;
  readonly inverseRisk: number;
  readonly partitionCoverage: number;
  readonly nodeReliability: number;
  readonly nodeTrust: number;
  readonly contributionAlignment: number;
  readonly governanceCompliance: number;
  readonly consensusIntegrity: number;
}

export interface SwarmConsensusEngineOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly weights?: Partial<SwarmConsensusEngineWeights>;
  readonly minimumCandidateScore?: TradingSwarmScore;
  readonly vetoRiskThreshold?: TradingSwarmScore;
  readonly rejectionRiskThreshold?: TradingSwarmScore;
  readonly abstentionBand?: TradingSwarmScore;
  readonly materialDissentWeight?: TradingSwarmWeight;
  readonly formedAtStrategy?:
    | "MISSION_TIME"
    | "LATEST_CONTRIBUTION_TIME"
    | "LATEST_CANDIDATE_TIME";
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly weights: SwarmConsensusEngineWeights;
  readonly minimumCandidateScore: TradingSwarmScore;
  readonly vetoRiskThreshold: TradingSwarmScore;
  readonly rejectionRiskThreshold: TradingSwarmScore;
  readonly abstentionBand: TradingSwarmScore;
  readonly materialDissentWeight: TradingSwarmWeight;
  readonly formedAtStrategy:
    | "MISSION_TIME"
    | "LATEST_CONTRIBUTION_TIME"
    | "LATEST_CANDIDATE_TIME";
}

interface EligibleNode {
  readonly node: TradingSwarmNodeRegistration;
  readonly trust: TradingSwarmNodeTrustScore;
  readonly contribution?: TradingSwarmNodeContribution;
}

interface CandidateTally {
  readonly candidate: TradingSwarmDecisionCandidate;
  readonly ballots: readonly TradingSwarmDecisionBallot[];
  readonly approvalWeight: number;
  readonly rejectionWeight: number;
  readonly abstentionWeight: number;
  readonly vetoCount: number;
  readonly participatingWeight: number;
  readonly normalizedApproval: number;
  readonly normalizedRejection: number;
  readonly normalizedAbstention: number;
  readonly score: number;
}

export const DEFAULT_SWARM_CONSENSUS_ENGINE_WEIGHTS:
  SwarmConsensusEngineWeights = Object.freeze({
    candidateConfidence: 0.22,
    expectedUtility: 0.16,
    inverseRisk: 0.18,
    partitionCoverage: 0.10,
    nodeReliability: 0.10,
    nodeTrust: 0.08,
    contributionAlignment: 0.08,
    governanceCompliance: 0.04,
    consensusIntegrity: 0.04,
  });

/* ========================================================================== *
 * Engine
 * ========================================================================== */

export class SwarmConsensusEngine
  implements TradingSwarmConsensusEnginePort
{
  private readonly options: NormalizedOptions;

  public constructor(options: SwarmConsensusEngineOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public async form(
    mission: TradingSwarmMission,
    candidates: readonly TradingSwarmDecisionCandidate[],
    contributions: readonly TradingSwarmNodeContribution[],
    nodes: readonly TradingSwarmNodeRegistration[],
    trust: readonly TradingSwarmNodeTrustScore[],
    policy: TradingSwarmConsensusPolicy,
  ): Promise<TradingSwarmConsensusResult> {
    try {
      validateInputs(
        mission,
        candidates,
        contributions,
        nodes,
        trust,
        policy,
      );

      const eligibleNodes = buildEligibleNodes(
        nodes,
        contributions,
        trust,
      );

      const quorum = evaluateQuorum(
        eligibleNodes,
        policy,
      );

      const formedAtMs = resolveFormedAt(
        mission,
        candidates,
        contributions,
        this.options.formedAtStrategy,
      );

      if (!quorum.satisfied) {
        return this.buildNoQuorumResult(
          mission,
          policy,
          candidates,
          eligibleNodes,
          quorum,
          formedAtMs,
        );
      }

      const tallies = candidates
        .map((candidate) =>
          this.tallyCandidate(
            mission,
            candidate,
            eligibleNodes,
            policy,
            formedAtMs,
          ),
        )
        .sort(compareTallies);

      if (tallies.length === 0) {
        return this.buildEmptyResult(
          mission,
          policy,
          quorum,
          formedAtMs,
        );
      }

      const selected = tallies[0];
      if (selected === undefined) {
        return this.buildEmptyResult(
          mission,
          policy,
          quorum,
          formedAtMs,
        );
      }

      return this.buildConsensusResult(
        mission,
        policy,
        selected,
        tallies,
        quorum,
        formedAtMs,
      );
    } catch (error) {
      if (error instanceof SwarmConsensusEngineError) {
        throw error;
      }

      throw new SwarmConsensusEngineError(
        "CONSENSUS_FORMATION_FAILED",
        "Failed to form deterministic swarm consensus.",
        {
          missionId: mission?.missionId,
          cause: error,
        },
      );
    }
  }

  private tallyCandidate(
    mission: TradingSwarmMission,
    candidate: TradingSwarmDecisionCandidate,
    eligibleNodes: readonly EligibleNode[],
    policy: TradingSwarmConsensusPolicy,
    formedAtMs: TradingSwarmTimestamp,
  ): CandidateTally {
    const ballots = eligibleNodes.map((eligible) =>
      createBallot(
        mission,
        candidate,
        eligible,
        policy,
        formedAtMs,
        this.options,
      ),
    );

    let approvalWeight = 0;
    let rejectionWeight = 0;
    let abstentionWeight = 0;
    let vetoCount = 0;

    for (const ballot of ballots) {
      switch (ballot.choice) {
        case "APPROVE":
          approvalWeight += ballot.weight;
          break;
        case "REJECT":
          rejectionWeight += ballot.weight;
          break;
        case "ABSTAIN":
          abstentionWeight += ballot.weight;
          break;
        case "VETO":
          rejectionWeight += ballot.weight;
          vetoCount += 1;
          break;
      }
    }

    const participatingWeight =
      approvalWeight + rejectionWeight + abstentionWeight;

    const normalizedApproval =
      participatingWeight === 0
        ? 0
        : approvalWeight / participatingWeight;

    const normalizedRejection =
      participatingWeight === 0
        ? 0
        : rejectionWeight / participatingWeight;

    const normalizedAbstention =
      participatingWeight === 0
        ? 0
        : abstentionWeight / participatingWeight;

    const score =
      normalizedApproval -
      normalizedRejection -
      normalizedAbstention * 0.25 -
      vetoCount * 0.15 +
      candidate.confidence * 0.10 +
      normalizeUtility(candidate.expectedUtility) * 0.08 -
      candidate.estimatedRisk * 0.10;

    return deepFreeze({
      candidate,
      ballots: Object.freeze(ballots),
      approvalWeight,
      rejectionWeight,
      abstentionWeight,
      vetoCount,
      participatingWeight,
      normalizedApproval,
      normalizedRejection,
      normalizedAbstention,
      score,
    });
  }

  private buildConsensusResult(
    mission: TradingSwarmMission,
    policy: TradingSwarmConsensusPolicy,
    selected: CandidateTally,
    tallies: readonly CandidateTally[],
    quorum: QuorumEvaluation,
    formedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmConsensusResult {
    const status = determineStatus(
      selected,
      policy,
      this.options.minimumCandidateScore,
    );

    const selectedCandidateId =
      status === "CONSENSUS_REACHED" ||
      status === "CONSENSUS_WITH_RESTRICTIONS"
        ? selected.candidate.candidateId
        : undefined;

    const dissent = buildDissent(
      selected,
      this.options.materialDissentWeight,
    );

    const unresolvedConflictIds = buildConflictIds(
      selected,
      tallies,
      status,
    );

    const partitionCoverageRatio =
      selected.candidate.partitionCoverageRatio;

    const collectiveConfidence =
      buildCollectiveConfidence(
        selected,
        quorum,
        dissent,
      );

    const rationale = buildRationale(
      selected,
      status,
      policy,
      quorum,
    );

    const base = {
      consensusId: createConsensusId(
        mission,
        policy,
        selected,
        status,
      ),
      missionId: mission.missionId,
      status,
      method: policy.method,
      ...(selectedCandidateId === undefined
        ? {}
        : { selectedCandidateId }),
      ballots: selected.ballots,
      approvalWeight: selected.approvalWeight,
      rejectionWeight: selected.rejectionWeight,
      abstentionWeight: selected.abstentionWeight,
      vetoCount: selected.vetoCount,
      participationRatio: quorum.participationRatio,
      quorumSatisfied: true,
      partitionCoverageRatio,
      collectiveConfidence,
      dissent,
      unresolvedConflictIds,
      rationale,
      formedAtMs,
    } satisfies Omit<
      TradingSwarmConsensusResult,
      "deterministicFingerprint"
    >;

    return deepFreeze({
      ...base,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(base),
    });
  }

  private buildNoQuorumResult(
    mission: TradingSwarmMission,
    policy: TradingSwarmConsensusPolicy,
    candidates: readonly TradingSwarmDecisionCandidate[],
    eligibleNodes: readonly EligibleNode[],
    quorum: QuorumEvaluation,
    formedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmConsensusResult {
    const rationale =
      `Quorum was not satisfied: ${quorum.failures.join("; ")}.`;

    const base = {
      consensusId: createNoQuorumConsensusId(
        mission,
        policy,
        eligibleNodes,
      ),
      missionId: mission.missionId,
      status: "NO_QUORUM" as const,
      method: policy.method,
      ballots: Object.freeze([]),
      approvalWeight: 0,
      rejectionWeight: 0,
      abstentionWeight: 0,
      vetoCount: 0,
      participationRatio: quorum.participationRatio,
      quorumSatisfied: false,
      partitionCoverageRatio:
        calculateGlobalPartitionCoverage(
          mission,
          candidates,
        ),
      collectiveConfidence: deepFreeze({
        rawConfidence: 0,
        nodeReliabilityAdjustment: 0,
        partitionCoverageAdjustment: 0,
        dissentAdjustment: 0,
        systemicRiskAdjustment: 0,
        governanceAdjustment: 0,
        finalConfidence: 0,
      }),
      dissent: Object.freeze([]),
      unresolvedConflictIds: Object.freeze(
        quorum.failures.map(
          (failure) =>
            `quorum-${stableHash(failure)}`,
        ),
      ),
      rationale,
      formedAtMs,
    } satisfies Omit<
      TradingSwarmConsensusResult,
      "deterministicFingerprint"
    >;

    return deepFreeze({
      ...base,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(base),
    });
  }

  private buildEmptyResult(
    mission: TradingSwarmMission,
    policy: TradingSwarmConsensusPolicy,
    quorum: QuorumEvaluation,
    formedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmConsensusResult {
    const base = {
      consensusId: `swarm-consensus-${stableHash(
        stableStringify({
          missionId: mission.missionId,
          state: "no-candidates",
          method: policy.method,
        }),
      )}`,
      missionId: mission.missionId,
      status: "DEFERRED" as const,
      method: policy.method,
      ballots: Object.freeze([]),
      approvalWeight: 0,
      rejectionWeight: 0,
      abstentionWeight: 0,
      vetoCount: 0,
      participationRatio: quorum.participationRatio,
      quorumSatisfied: quorum.satisfied,
      partitionCoverageRatio: 0,
      collectiveConfidence: deepFreeze({
        rawConfidence: 0,
        nodeReliabilityAdjustment: 0,
        partitionCoverageAdjustment: 0,
        dissentAdjustment: 0,
        systemicRiskAdjustment: 0,
        governanceAdjustment: 0,
        finalConfidence: 0,
      }),
      dissent: Object.freeze([]),
      unresolvedConflictIds: Object.freeze([
        "no-decision-candidates",
      ]),
      rationale:
        "No decision candidates were available for consensus.",
      formedAtMs,
    } satisfies Omit<
      TradingSwarmConsensusResult,
      "deterministicFingerprint"
    >;

    return deepFreeze({
      ...base,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(base),
    });
  }
}

/* ========================================================================== *
 * Ballot generation
 * ========================================================================== */

function createBallot(
  mission: TradingSwarmMission,
  candidate: TradingSwarmDecisionCandidate,
  eligible: EligibleNode,
  policy: TradingSwarmConsensusPolicy,
  castAtMs: TradingSwarmTimestamp,
  options: NormalizedOptions,
): TradingSwarmDecisionBallot {
  const contribution = eligible.contribution;
  const trust = eligible.trust;

  const alignment = calculateContributionAlignment(
    candidate,
    contribution,
  );

  const riskAdjustment = clampSigned(
    (1 - candidate.estimatedRisk) -
      candidate.estimatedRisk,
  );

  const reliabilityAdjustment = clampSigned(
    weightedAverage(
      [
        trust.reliabilityScore,
        trust.overallTrust,
        contribution?.reliabilityScore ??
          trust.reliabilityScore,
      ],
      [0.4, 0.3, 0.3],
    ) *
      2 -
      1,
  );

  const candidateScore = calculateNodeCandidateScore(
    candidate,
    eligible,
    alignment,
    options.weights,
  );

  const choice = chooseBallot(
    candidate,
    eligible,
    candidateScore,
    policy,
    options,
  );

  const weight = calculateBallotWeight(
    eligible,
    candidate,
    policy.method,
  );

  const confidence = clampScore(
    weightedAverage(
      [
        candidate.confidence,
        trust.overallTrust,
        trust.reliabilityScore,
        contribution?.confidence ?? 0.5,
      ],
      [0.45, 0.20, 0.20, 0.15],
    ),
  );

  const restrictions = collectBallotRestrictions(
    candidate,
    choice,
    eligible,
  );

  const rationale = createBallotRationale(
    candidate,
    eligible,
    candidateScore,
    choice,
  );

  const base = {
    ballotId: createBallotId(
      mission,
      candidate,
      eligible.node.identity.nodeId,
    ),
    missionId: mission.missionId,
    decisionCandidateId: candidate.candidateId,
    nodeId: eligible.node.identity.nodeId,
    choice,
    weight,
    confidence,
    riskAdjustment,
    reliabilityAdjustment,
    rationale,
    restrictions,
    castAtMs,
  } satisfies Omit<
    TradingSwarmDecisionBallot,
    "deterministicFingerprint"
  >;

  return deepFreeze({
    ...base,
    deterministicFingerprint:
      options.fingerprintGenerator.fingerprint(base),
  });
}

function calculateNodeCandidateScore(
  candidate: TradingSwarmDecisionCandidate,
  eligible: EligibleNode,
  alignment: number,
  weights: SwarmConsensusEngineWeights,
): number {
  const trust = eligible.trust;
  const contribution = eligible.contribution;

  return clampScore(
    weightedAverage(
      [
        candidate.confidence,
        normalizeUtility(candidate.expectedUtility),
        1 - candidate.estimatedRisk,
        candidate.partitionCoverageRatio,
        contribution?.reliabilityScore ??
          trust.reliabilityScore,
        trust.overallTrust,
        alignment,
        trust.governanceComplianceScore,
        trust.consensusIntegrityScore,
      ],
      [
        weights.candidateConfidence,
        weights.expectedUtility,
        weights.inverseRisk,
        weights.partitionCoverage,
        weights.nodeReliability,
        weights.nodeTrust,
        weights.contributionAlignment,
        weights.governanceCompliance,
        weights.consensusIntegrity,
      ],
    ),
  );
}

function chooseBallot(
  candidate: TradingSwarmDecisionCandidate,
  eligible: EligibleNode,
  score: number,
  policy: TradingSwarmConsensusPolicy,
  options: NormalizedOptions,
): TradingSwarmBallotChoice {
  const node = eligible.node;
  const isGovernor =
    node.identity.role === "GOVERNOR" ||
    hasCapability(node, "ENFORCE_GOVERNANCE");

  const isRiskNode = hasCapability(
    node,
    "DISTRIBUTE_RISK_ANALYSIS",
  );

  if (
    policy.vetoEnabled &&
    (isGovernor || isRiskNode) &&
    candidate.estimatedRisk >=
      options.vetoRiskThreshold
  ) {
    return "VETO";
  }

  if (
    candidate.estimatedRisk >=
      options.rejectionRiskThreshold
  ) {
    return "REJECT";
  }

  const approvalBoundary = Math.max(
    options.minimumCandidateScore,
    policy.approvalThreshold,
  );

  if (score >= approvalBoundary) {
    return "APPROVE";
  }

  if (score <= policy.rejectionThreshold) {
    return "REJECT";
  }

  if (
    Math.abs(score - approvalBoundary) <=
    options.abstentionBand
  ) {
    return "ABSTAIN";
  }

  return score >
    (approvalBoundary + policy.rejectionThreshold) / 2
    ? "APPROVE"
    : "REJECT";
}

function calculateBallotWeight(
  eligible: EligibleNode,
  candidate: TradingSwarmDecisionCandidate,
  method: TradingSwarmConsensusMethod,
): TradingSwarmWeight {
  const trust = eligible.trust;
  const contribution = eligible.contribution;

  switch (method) {
    case "UNANIMOUS":
    case "SIMPLE_MAJORITY":
    case "SUPERMAJORITY":
      return 1;

    case "WEIGHTED":
      return clampWeight(
        0.5 +
          trust.overallTrust * 0.5,
      );

    case "RISK_ADJUSTED":
      return clampWeight(
        0.4 +
          trust.overallTrust * 0.3 +
          (1 - candidate.estimatedRisk) * 0.3,
      );

    case "RELIABILITY_WEIGHTED":
      return clampWeight(
        0.3 +
          trust.reliabilityScore * 0.5 +
          (contribution?.reliabilityScore ?? 0.5) *
            0.2,
      );

    case "BYZANTINE_QUORUM":
      return clampWeight(
        0.25 +
          trust.consensusIntegrityScore * 0.35 +
          trust.governanceComplianceScore * 0.20 +
          trust.overallTrust * 0.20,
      );

    case "HYBRID":
      return clampWeight(
        weightedAverage(
          [
            trust.overallTrust,
            trust.reliabilityScore,
            trust.consensusIntegrityScore,
            1 - candidate.estimatedRisk,
            candidate.partitionCoverageRatio,
          ],
          [0.25, 0.20, 0.20, 0.20, 0.15],
        ),
      );
  }
}

/* ========================================================================== *
 * Quorum
 * ========================================================================== */

interface QuorumEvaluation {
  readonly satisfied: boolean;
  readonly eligibleCount: number;
  readonly participatingCount: number;
  readonly participationRatio: TradingSwarmScore;
  readonly failures: readonly string[];
}

function evaluateQuorum(
  eligibleNodes: readonly EligibleNode[],
  policy: TradingSwarmConsensusPolicy,
): QuorumEvaluation {
  const failures: string[] = [];
  const eligibleCount = eligibleNodes.length;
  const participatingCount = eligibleNodes.filter(
    (eligible) => eligible.contribution !== undefined,
  ).length;

  const participationRatio =
    eligibleCount === 0
      ? 0
      : participatingCount / eligibleCount;

  if (
    eligibleCount <
    policy.quorum.minimumEligibleNodes
  ) {
    failures.push(
      `eligible nodes ${eligibleCount} below minimum ${policy.quorum.minimumEligibleNodes}`,
    );
  }

  if (
    participatingCount <
    policy.quorum.minimumParticipatingNodes
  ) {
    failures.push(
      `participating nodes ${participatingCount} below minimum ${policy.quorum.minimumParticipatingNodes}`,
    );
  }

  if (
    participationRatio <
    policy.quorum.minimumParticipationRatio
  ) {
    failures.push(
      `participation ratio ${participationRatio.toFixed(6)} below minimum ${policy.quorum.minimumParticipationRatio.toFixed(6)}`,
    );
  }

  for (const role of policy.quorum.requiredNodeRoles) {
    if (
      !eligibleNodes.some(
        (eligible) =>
          eligible.node.identity.role === role,
      )
    ) {
      failures.push(`required role ${role} missing`);
    }
  }

  for (
    const capability of
      policy.quorum.requiredCapabilities
  ) {
    if (
      !eligibleNodes.some((eligible) =>
        hasCapability(eligible.node, capability),
      )
    ) {
      failures.push(
        `required capability ${capability} missing`,
      );
    }
  }

  if (
    policy.quorum.requireLeader &&
    !eligibleNodes.some(
      (eligible) =>
        eligible.node.identity.role === "LEADER",
    )
  ) {
    failures.push("leader node missing");
  }

  if (
    policy.quorum.requireRiskSwarm &&
    !eligibleNodes.some((eligible) =>
      hasCapability(
        eligible.node,
        "DISTRIBUTE_RISK_ANALYSIS",
      ),
    )
  ) {
    failures.push("risk swarm participation missing");
  }

  if (
    policy.quorum.requireGovernanceSwarm &&
    !eligibleNodes.some(
      (eligible) =>
        eligible.node.identity.role === "GOVERNOR" ||
        hasCapability(
          eligible.node,
          "ENFORCE_GOVERNANCE",
        ),
    )
  ) {
    failures.push(
      "governance swarm participation missing",
    );
  }

  return deepFreeze({
    satisfied: failures.length === 0,
    eligibleCount,
    participatingCount,
    participationRatio: clampScore(
      participationRatio,
    ),
    failures: Object.freeze(failures.sort()),
  });
}

function buildEligibleNodes(
  nodes: readonly TradingSwarmNodeRegistration[],
  contributions: readonly TradingSwarmNodeContribution[],
  trustScores: readonly TradingSwarmNodeTrustScore[],
): readonly EligibleNode[] {
  const contributionByNode = new Map(
    contributions.map(
      (contribution) =>
        [contribution.nodeId, contribution] as const,
    ),
  );

  const trustByNode = new Map(
    trustScores.map(
      (trust) => [trust.nodeId, trust] as const,
    ),
  );

  const eligible: EligibleNode[] = [];

  for (
    const node of [...nodes].sort((left, right) =>
      left.identity.nodeId.localeCompare(
        right.identity.nodeId,
      ),
    )
  ) {
    const trust = trustByNode.get(
      node.identity.nodeId,
    );

    if (trust === undefined || trust.quarantined) {
      continue;
    }

    eligible.push(
      deepFreeze({
        node,
        trust,
        contribution: contributionByNode.get(
          node.identity.nodeId,
        ),
      }),
    );
  }

  return Object.freeze(eligible);
}

/* ========================================================================== *
 * Result classification and confidence
 * ========================================================================== */

function determineStatus(
  tally: CandidateTally,
  policy: TradingSwarmConsensusPolicy,
  minimumCandidateScore: number,
): TradingSwarmConsensusStatus {
  if (policy.vetoEnabled && tally.vetoCount > 0) {
    return "VETOED";
  }

  if (
    tally.normalizedAbstention >
    policy.maximumAbstentionRatio
  ) {
    return "DEFERRED";
  }

  const approvalRequired = approvalRequirement(
    policy.method,
    policy.approvalThreshold,
  );

  if (
    tally.normalizedApproval >= approvalRequired &&
    tally.candidate.confidence >=
      minimumCandidateScore
  ) {
    return tally.candidate.restrictions.length > 0
      ? "CONSENSUS_WITH_RESTRICTIONS"
      : "CONSENSUS_REACHED";
  }

  if (
    tally.normalizedRejection >=
    policy.rejectionThreshold
  ) {
    return "REJECTED";
  }

  if (
    Math.abs(
      tally.normalizedApproval -
        tally.normalizedRejection,
    ) <= 0.05
  ) {
    return resolveDeadlock(policy);
  }

  return "DEFERRED";
}

function approvalRequirement(
  method: TradingSwarmConsensusMethod,
  configured: number,
): number {
  switch (method) {
    case "UNANIMOUS":
      return 1;
    case "SIMPLE_MAJORITY":
      return Math.max(0.5, configured);
    case "SUPERMAJORITY":
      return Math.max(2 / 3, configured);
    case "BYZANTINE_QUORUM":
      return Math.max(2 / 3, configured);
    case "WEIGHTED":
    case "RISK_ADJUSTED":
    case "RELIABILITY_WEIGHTED":
    case "HYBRID":
      return configured;
  }
}

function resolveDeadlock(
  policy: TradingSwarmConsensusPolicy,
): TradingSwarmConsensusStatus {
  switch (policy.deadlockResolution) {
    case "REJECT":
      return "REJECTED";
    case "LEADER":
    case "ARBITER":
    case "SUPERVISOR":
      return "DEADLOCKED";
    case "OPERATOR":
      return "DEFERRED";
  }
}

function buildCollectiveConfidence(
  tally: CandidateTally,
  quorum: QuorumEvaluation,
  dissent: readonly TradingSwarmDissentRecord[],
): TradingSwarmCollectiveConfidence {
  const rawConfidence = clampScore(
    weightedAverage(
      [
        tally.candidate.confidence,
        tally.normalizedApproval,
      ],
      [0.55, 0.45],
    ),
  );

  const averageReliability =
    tally.ballots.length === 0
      ? 0
      : tally.ballots.reduce(
          (sum, ballot) =>
            sum +
            ballot.reliabilityAdjustment,
          0,
        ) / tally.ballots.length;

  const nodeReliabilityAdjustment =
    averageReliability * 0.08;

  const partitionCoverageAdjustment =
    (tally.candidate.partitionCoverageRatio -
      0.5) *
    0.10;

  const materialDissentRatio =
    tally.ballots.length === 0
      ? 0
      : dissent.filter(
          (record) => record.material,
        ).length / tally.ballots.length;

  const dissentAdjustment =
    -materialDissentRatio * 0.12;

  const systemicRiskAdjustment =
    -tally.candidate.estimatedRisk * 0.10;

  const governanceAdjustment =
    tally.vetoCount > 0
      ? -0.20
      : quorum.satisfied
        ? 0.04
        : -0.20;

  const finalConfidence = clampScore(
    rawConfidence +
      nodeReliabilityAdjustment +
      partitionCoverageAdjustment +
      dissentAdjustment +
      systemicRiskAdjustment +
      governanceAdjustment,
  );

  return deepFreeze({
    rawConfidence,
    nodeReliabilityAdjustment,
    partitionCoverageAdjustment,
    dissentAdjustment,
    systemicRiskAdjustment,
    governanceAdjustment,
    finalConfidence,
  });
}

/* ========================================================================== *
 * Dissent and conflicts
 * ========================================================================== */

function buildDissent(
  tally: CandidateTally,
  materialWeight: number,
): readonly TradingSwarmDissentRecord[] {
  return Object.freeze(
    tally.ballots
      .filter(
        (ballot) =>
          ballot.choice !== "APPROVE",
      )
      .map((ballot) =>
        deepFreeze({
          nodeId: ballot.nodeId,
          choice: ballot.choice,
          material:
            ballot.choice === "VETO" ||
            ballot.weight >= materialWeight,
          rationale: ballot.rationale,
          ...(ballot.riskAdjustment < -0.25
            ? {
                riskConcern:
                  `Risk adjustment ${ballot.riskAdjustment.toFixed(6)} was materially negative.`,
              }
            : {}),
          ...(ballot.choice === "REJECT"
            ? {
                proposedAlternative:
                  "Select a lower-risk or higher-confidence candidate.",
              }
            : {}),
        }),
      )
      .sort((left, right) =>
        left.nodeId.localeCompare(right.nodeId),
      ),
  );
}

function buildConflictIds(
  selected: CandidateTally,
  tallies: readonly CandidateTally[],
  status: TradingSwarmConsensusStatus,
): readonly string[] {
  const conflicts: string[] = [];

  for (const ballot of selected.ballots) {
    if (
      ballot.choice === "REJECT" ||
      ballot.choice === "VETO"
    ) {
      conflicts.push(
        `ballot-conflict-${stableHash(
          `${ballot.nodeId}:${selected.candidate.candidateId}:${ballot.choice}`,
        )}`,
      );
    }
  }

  const runnerUp = tallies[1];
  if (
    runnerUp !== undefined &&
    Math.abs(selected.score - runnerUp.score) <= 0.05
  ) {
    conflicts.push(
      `candidate-conflict-${stableHash(
        `${selected.candidate.candidateId}:${runnerUp.candidate.candidateId}`,
      )}`,
    );
  }

  if (
    status === "DEADLOCKED" ||
    status === "DEFERRED"
  ) {
    conflicts.push(
      `status-conflict-${stableHash(status)}`,
    );
  }

  return Object.freeze(
    [...new Set(conflicts)].sort(),
  );
}

/* ========================================================================== *
 * Rationale and helper calculations
 * ========================================================================== */

function createBallotRationale(
  candidate: TradingSwarmDecisionCandidate,
  eligible: EligibleNode,
  score: number,
  choice: TradingSwarmBallotChoice,
): string {
  return [
    `Node ${eligible.node.identity.nodeId}`,
    `cast ${choice}`,
    `for candidate ${candidate.candidateId}`,
    `with deterministic score ${score.toFixed(6)}`,
    `confidence ${candidate.confidence.toFixed(6)}`,
    `utility ${candidate.expectedUtility.toFixed(6)}`,
    `risk ${candidate.estimatedRisk.toFixed(6)}`,
    `and partition coverage ${candidate.partitionCoverageRatio.toFixed(6)}.`,
  ].join(" ");
}

function buildRationale(
  tally: CandidateTally,
  status: TradingSwarmConsensusStatus,
  policy: TradingSwarmConsensusPolicy,
  quorum: QuorumEvaluation,
): string {
  return [
    `Consensus status ${status}.`,
    `Method ${policy.method}.`,
    `Candidate ${tally.candidate.candidateId}.`,
    `Approval weight ${tally.approvalWeight.toFixed(6)}.`,
    `Rejection weight ${tally.rejectionWeight.toFixed(6)}.`,
    `Abstention weight ${tally.abstentionWeight.toFixed(6)}.`,
    `Veto count ${tally.vetoCount}.`,
    `Participation ratio ${quorum.participationRatio.toFixed(6)}.`,
    `Candidate score ${tally.score.toFixed(6)}.`,
  ].join(" ");
}

function calculateContributionAlignment(
  candidate: TradingSwarmDecisionCandidate,
  contribution:
    | TradingSwarmNodeContribution
    | undefined,
): number {
  if (contribution === undefined) {
    return 0.5;
  }

  if (
    contribution.nodeId ===
    candidate.proposedByNodeId
  ) {
    return 1;
  }

  const utilityAlignment =
    1 -
    Math.min(
      1,
      Math.abs(
        normalizeUtility(
          contribution.utilityContribution,
        ) -
          normalizeUtility(
            candidate.expectedUtility,
          ),
      ),
    );

  const riskAlignment =
    1 -
    Math.min(
      1,
      Math.abs(
        contribution.riskContribution -
          candidate.estimatedRisk,
      ),
    );

  return clampScore(
    weightedAverage(
      [
        utilityAlignment,
        riskAlignment,
        contribution.confidence,
        contribution.reliabilityScore,
      ],
      [0.30, 0.30, 0.20, 0.20],
    ),
  );
}

function collectBallotRestrictions(
  candidate: TradingSwarmDecisionCandidate,
  choice: TradingSwarmBallotChoice,
  eligible: EligibleNode,
): readonly string[] {
  const restrictions = [
    ...candidate.restrictions,
  ];

  if (choice === "VETO") {
    restrictions.push(
      "Execution prohibited by deterministic veto.",
    );
  }

  if (choice === "REJECT") {
    restrictions.push(
      "Candidate rejected by this node.",
    );
  }

  if (!eligible.node.authority.mayApproveExecution) {
    restrictions.push(
      "Node lacks execution approval authority.",
    );
  }

  return Object.freeze(
    [...new Set(restrictions)].sort(),
  );
}

function calculateGlobalPartitionCoverage(
  mission: TradingSwarmMission,
  candidates: readonly TradingSwarmDecisionCandidate[],
): number {
  if (candidates.length === 0) {
    return 0;
  }

  return clampScore(
    candidates.reduce(
      (sum, candidate) =>
        sum +
        candidate.partitionCoverageRatio,
      0,
    ) / candidates.length,
  );
}

function hasCapability(
  node: TradingSwarmNodeRegistration,
  capability:
    TradingSwarmNodeRegistration["capabilities"][number]["capability"],
): boolean {
  return node.capabilities.some(
    (declaration) =>
      declaration.capability === capability &&
      declaration.enabled,
  );
}

/* ========================================================================== *
 * Identity and ordering
 * ========================================================================== */

function createBallotId(
  mission: TradingSwarmMission,
  candidate: TradingSwarmDecisionCandidate,
  nodeId: string,
): string {
  return `swarm-ballot-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint:
        mission.deterministicFingerprint,
      candidateId: candidate.candidateId,
      candidateFingerprint:
        candidate.deterministicFingerprint,
      nodeId,
    }),
  )}`;
}

function createConsensusId(
  mission: TradingSwarmMission,
  policy: TradingSwarmConsensusPolicy,
  tally: CandidateTally,
  status: TradingSwarmConsensusStatus,
): string {
  return `swarm-consensus-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint:
        mission.deterministicFingerprint,
      method: policy.method,
      candidateId: tally.candidate.candidateId,
      ballotFingerprints: tally.ballots.map(
        (ballot) =>
          ballot.deterministicFingerprint,
      ),
      status,
    }),
  )}`;
}

function createNoQuorumConsensusId(
  mission: TradingSwarmMission,
  policy: TradingSwarmConsensusPolicy,
  eligibleNodes: readonly EligibleNode[],
): string {
  return `swarm-consensus-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint:
        mission.deterministicFingerprint,
      method: policy.method,
      state: "NO_QUORUM",
      eligibleNodeIds: eligibleNodes.map(
        (eligible) =>
          eligible.node.identity.nodeId,
      ),
    }),
  )}`;
}

function compareTallies(
  left: CandidateTally,
  right: CandidateTally,
): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  const approvalOrder =
    right.normalizedApproval -
    left.normalizedApproval;
  if (approvalOrder !== 0) {
    return approvalOrder;
  }

  const riskOrder =
    left.candidate.estimatedRisk -
    right.candidate.estimatedRisk;
  if (riskOrder !== 0) {
    return riskOrder;
  }

  const confidenceOrder =
    right.candidate.confidence -
    left.candidate.confidence;
  if (confidenceOrder !== 0) {
    return confidenceOrder;
  }

  return left.candidate.candidateId.localeCompare(
    right.candidate.candidateId,
  );
}

function resolveFormedAt(
  mission: TradingSwarmMission,
  candidates: readonly TradingSwarmDecisionCandidate[],
  contributions: readonly TradingSwarmNodeContribution[],
  strategy: NormalizedOptions["formedAtStrategy"],
): TradingSwarmTimestamp {
  switch (strategy) {
    case "MISSION_TIME":
      return mission.createdAtMs;

    case "LATEST_CONTRIBUTION_TIME":
      return (
        contributions.length === 0
          ? mission.createdAtMs
          : Math.max(
              ...contributions.map(
                (contribution) =>
                  contribution.submittedAtMs,
              ),
            )
      ) as TradingSwarmTimestamp;

    case "LATEST_CANDIDATE_TIME":
      return (
        candidates.length === 0
          ? mission.createdAtMs
          : Math.max(
              ...candidates.map(
                (candidate) =>
                  candidate.createdAtMs,
              ),
            )
      ) as TradingSwarmTimestamp;
  }
}

/* ========================================================================== *
 * Validation
 * ========================================================================== */

function validateInputs(
  mission: TradingSwarmMission,
  candidates: readonly TradingSwarmDecisionCandidate[],
  contributions: readonly TradingSwarmNodeContribution[],
  nodes: readonly TradingSwarmNodeRegistration[],
  trust: readonly TradingSwarmNodeTrustScore[],
  policy: TradingSwarmConsensusPolicy,
): void {
  if (
    mission === undefined ||
    mission === null ||
    typeof mission.missionId !== "string" ||
    mission.missionId.trim().length === 0
  ) {
    throw new SwarmConsensusEngineError(
      "INVALID_MISSION",
      "A valid mission is required.",
    );
  }

  validatePolicy(policy);

  validateUnique(
    candidates,
    (candidate) => candidate.candidateId,
    "DUPLICATE_CANDIDATE",
    mission.missionId,
  );

  validateUnique(
    nodes,
    (node) => node.identity.nodeId,
    "DUPLICATE_NODE",
    mission.missionId,
  );

  validateUnique(
    contributions,
    (contribution) => contribution.nodeId,
    "DUPLICATE_CONTRIBUTION",
    mission.missionId,
  );

  validateUnique(
    trust,
    (score) => score.nodeId,
    "DUPLICATE_TRUST_SCORE",
    mission.missionId,
  );

  const nodeIds = new Set(
    nodes.map((node) => node.identity.nodeId),
  );

  for (const candidate of candidates) {
    if (
      candidate.missionId !== mission.missionId
    ) {
      throw new SwarmConsensusEngineError(
        "MISSION_MISMATCH",
        `Candidate "${candidate.candidateId}" belongs to another mission.`,
        {
          missionId: mission.missionId,
          candidateId: candidate.candidateId,
        },
      );
    }

    validateScoreValue(
      candidate.confidence,
      "candidate.confidence",
      mission.missionId,
      candidate.candidateId,
    );
    validateScoreValue(
      candidate.estimatedRisk,
      "candidate.estimatedRisk",
      mission.missionId,
      candidate.candidateId,
    );
    validateScoreValue(
      candidate.partitionCoverageRatio,
      "candidate.partitionCoverageRatio",
      mission.missionId,
      candidate.candidateId,
    );
  }

  for (const contribution of contributions) {
    if (!nodeIds.has(contribution.nodeId)) {
      throw new SwarmConsensusEngineError(
        "INVALID_CONTRIBUTIONS",
        `Contribution references unknown node "${contribution.nodeId}".`,
        {
          missionId: mission.missionId,
          nodeId: contribution.nodeId,
        },
      );
    }
  }

  for (const score of trust) {
    if (!nodeIds.has(score.nodeId)) {
      throw new SwarmConsensusEngineError(
        "INVALID_TRUST",
        `Trust score references unknown node "${score.nodeId}".`,
        {
          missionId: mission.missionId,
          nodeId: score.nodeId,
        },
      );
    }

    validateScoreValue(
      score.overallTrust,
      "trust.overallTrust",
      mission.missionId,
      undefined,
      score.nodeId,
    );
  }
}

function validatePolicy(
  policy: TradingSwarmConsensusPolicy,
): void {
  if (policy === undefined || policy === null) {
    throw new SwarmConsensusEngineError(
      "INVALID_POLICY",
      "A consensus policy is required.",
    );
  }

  validateScoreValue(
    policy.approvalThreshold,
    "policy.approvalThreshold",
  );
  validateScoreValue(
    policy.rejectionThreshold,
    "policy.rejectionThreshold",
  );
  validateScoreValue(
    policy.maximumAbstentionRatio,
    "policy.maximumAbstentionRatio",
  );
  validateScoreValue(
    policy.quorum.minimumParticipationRatio,
    "policy.quorum.minimumParticipationRatio",
  );

  if (
    !Number.isSafeInteger(
      policy.maximumConsensusRounds,
    ) ||
    policy.maximumConsensusRounds <= 0
  ) {
    throw new SwarmConsensusEngineError(
      "INVALID_POLICY",
      "maximumConsensusRounds must be a positive safe integer.",
      { field: "maximumConsensusRounds" },
    );
  }

  for (
    const [field, value] of [
      [
        "minimumEligibleNodes",
        policy.quorum.minimumEligibleNodes,
      ],
      [
        "minimumParticipatingNodes",
        policy.quorum.minimumParticipatingNodes,
      ],
    ] as const
  ) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new SwarmConsensusEngineError(
        "INVALID_POLICY",
        `${field} must be a non-negative safe integer.`,
        { field },
      );
    }
  }
}

function validateUnique<TValue>(
  values: readonly TValue[],
  getId: (value: TValue) => string,
  code:
    | "DUPLICATE_CANDIDATE"
    | "DUPLICATE_NODE"
    | "DUPLICATE_CONTRIBUTION"
    | "DUPLICATE_TRUST_SCORE",
  missionId: string,
): void {
  const ids = new Set<string>();

  for (const value of values) {
    const id = getId(value);

    if (ids.has(id)) {
      throw new SwarmConsensusEngineError(
        code,
        `Duplicate identifier "${id}".`,
        {
          missionId,
          ...(code === "DUPLICATE_CANDIDATE"
            ? { candidateId: id }
            : { nodeId: id }),
        },
      );
    }

    ids.add(id);
  }
}

function validateScoreValue(
  value: number,
  field: string,
  missionId?: string,
  candidateId?: string,
  nodeId?: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new SwarmConsensusEngineError(
      "INVALID_POLICY",
      `${field} must be between 0 and 1.`,
      {
        missionId,
        candidateId,
        nodeId,
        field,
      },
    );
  }
}

/* ========================================================================== *
 * Configuration and factory
 * ========================================================================== */

function normalizeOptions(
  options: SwarmConsensusEngineOptions,
): NormalizedOptions {
  const weights = {
    ...DEFAULT_SWARM_CONSENSUS_ENGINE_WEIGHTS,
    ...(options.weights ?? {}),
  };

  for (const [field, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new SwarmConsensusEngineError(
        "INVALID_POLICY",
        `Weight "${field}" must be non-negative and finite.`,
        { field },
      );
    }
  }

  const minimumCandidateScore =
    options.minimumCandidateScore ?? 0.55;
  const vetoRiskThreshold =
    options.vetoRiskThreshold ?? 0.90;
  const rejectionRiskThreshold =
    options.rejectionRiskThreshold ?? 0.78;
  const abstentionBand =
    options.abstentionBand ?? 0.05;
  const materialDissentWeight =
    options.materialDissentWeight ?? 0.65;

  validateScoreValue(
    minimumCandidateScore,
    "minimumCandidateScore",
  );
  validateScoreValue(
    vetoRiskThreshold,
    "vetoRiskThreshold",
  );
  validateScoreValue(
    rejectionRiskThreshold,
    "rejectionRiskThreshold",
  );
  validateScoreValue(
    abstentionBand,
    "abstentionBand",
  );
  validateScoreValue(
    materialDissentWeight,
    "materialDissentWeight",
  );

  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmConsensusFingerprintGenerator(),
    weights: Object.freeze(weights),
    minimumCandidateScore,
    vetoRiskThreshold,
    rejectionRiskThreshold,
    abstentionBand,
    materialDissentWeight,
    formedAtStrategy:
      options.formedAtStrategy ??
      "LATEST_CANDIDATE_TIME",
  });
}

export function createSwarmConsensusEngine(
  options: SwarmConsensusEngineOptions = {},
): SwarmConsensusEngine {
  return new SwarmConsensusEngine(options);
}

export class StableSwarmConsensusFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-consensus-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Deterministic utilities
 * ========================================================================== */

function weightedAverage(
  values: readonly number[],
  weights: readonly number[],
): number {
  if (values.length !== weights.length) {
    throw new SwarmConsensusEngineError(
      "CONSENSUS_FORMATION_FAILED",
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

function normalizeUtility(value: number): number {
  return clampScore((value + 1) / 2);
}

function clampScore(value: number): TradingSwarmScore {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function clampWeight(
  value: number,
): TradingSwarmWeight {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(-1, value));
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

// End of swarm-consensus-engine.ts