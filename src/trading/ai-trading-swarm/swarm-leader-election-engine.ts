/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-leader-election-engine.ts
 *
 * Deterministic, immutable leader candidacy, voting, quorum, and election.
 */

import {
  type TradingSwarmClock,
  type TradingSwarmElectionPolicy,
  type TradingSwarmElectionReason,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmIdGenerator,
  type TradingSwarmLeaderCandidate,
  type TradingSwarmLeaderElection,
  type TradingSwarmLeaderElectionPort,
  type TradingSwarmLeaderVote,
  type TradingSwarmNodeHealth,
  type TradingSwarmNodeId,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeRole,
  type TradingSwarmNodeState,
  type TradingSwarmQuorumPolicy,
  type TradingSwarmScore,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
  hasTradingSwarmCapability,
  isActiveTradingSwarmNodeState,
  isHealthyTradingSwarmNode,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmLeaderElectionErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_TOPOLOGY"
  | "INVALID_POLICY"
  | "ELECTION_DISABLED"
  | "NO_ELIGIBLE_CANDIDATES"
  | "INVARIANT_VIOLATION";

export class SwarmLeaderElectionError extends Error {
  public readonly code: SwarmLeaderElectionErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: SwarmLeaderElectionErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "SwarmLeaderElectionError";
    this.code = code;
    this.details =
      details === undefined
        ? undefined
        : deepFreeze({ ...details });
  }
}

export interface SwarmLeaderElectionWeights {
  readonly readiness: number;
  readonly reliability: number;
  readonly synchronization: number;
  readonly latency: number;
  readonly throughput: number;
  readonly consensusParticipation: number;
  readonly dataFreshness: number;
  readonly capacityHeadroom: number;
  readonly roleAuthority: number;
  readonly incumbentContinuity: number;
  readonly failurePenalty: number;
  readonly workloadPenalty: number;
}

export interface SwarmLeaderElectionOptions {
  readonly clock?: TradingSwarmClock;
  readonly idGenerator?: TradingSwarmIdGenerator;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly quorum?: Partial<TradingSwarmQuorumPolicy>;
  readonly weights?: Partial<SwarmLeaderElectionWeights>;
  readonly requireElectionCapability?: boolean;
  readonly requireHealthyVoters?: boolean;
  readonly requireDeterministicNodes?: boolean;
  readonly requireReplaySafeNodes?: boolean;
  readonly minimumSynchronizationScore?: number;
  readonly incumbentContinuityEnabled?: boolean;
}

interface NormalizedOptions {
  readonly clock: TradingSwarmClock;
  readonly idGenerator: TradingSwarmIdGenerator;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly quorum: TradingSwarmQuorumPolicy;
  readonly weights: SwarmLeaderElectionWeights;
  readonly requireElectionCapability: boolean;
  readonly requireHealthyVoters: boolean;
  readonly requireDeterministicNodes: boolean;
  readonly requireReplaySafeNodes: boolean;
  readonly minimumSynchronizationScore: number;
  readonly incumbentContinuityEnabled: boolean;
}

interface CandidateEvaluation {
  readonly candidate: TradingSwarmLeaderCandidate;
  readonly node: TradingSwarmNodeState;
}

interface VoteTally {
  readonly candidateNodeId: TradingSwarmNodeId;
  readonly totalWeight: number;
  readonly voteCount: number;
}

/* ========================================================================== *
 * Defaults
 * ========================================================================== */

export const DEFAULT_SWARM_LEADER_ELECTION_WEIGHTS:
  SwarmLeaderElectionWeights = deepFreeze({
    readiness: 0.18,
    reliability: 0.22,
    synchronization: 0.18,
    latency: 0.06,
    throughput: 0.06,
    consensusParticipation: 0.10,
    dataFreshness: 0.06,
    capacityHeadroom: 0.06,
    roleAuthority: 0.04,
    incumbentContinuity: 0.04,
    failurePenalty: 0.12,
    workloadPenalty: 0.08,
  });

export const DEFAULT_SWARM_LEADER_ELECTION_QUORUM:
  TradingSwarmQuorumPolicy = deepFreeze({
    minimumEligibleNodes: 1,
    minimumParticipatingNodes: 1,
    minimumParticipationRatio: 0.5,
    requiredNodeRoles: Object.freeze([]),
    requiredCapabilities: Object.freeze([]),
    requireLeader: false,
    requireRiskSwarm: false,
    requireGovernanceSwarm: false,
    allowDegradedNodes: false,
  });

/* ========================================================================== *
 * Engine
 * ========================================================================== */

export class SwarmLeaderElectionEngine
  implements TradingSwarmLeaderElectionPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmLeaderElectionOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public elect(
    topology: TradingSwarmTopologySnapshot,
    reason: TradingSwarmElectionReason,
    policy: TradingSwarmElectionPolicy,
  ): TradingSwarmLeaderElection {
    this.validateTopology(topology);
    this.validatePolicy(policy);

    if (!policy.enabled) {
      throw new SwarmLeaderElectionError(
        "ELECTION_DISABLED",
        "Leader election is disabled by policy.",
        {
          swarmId: topology.swarmId,
          reason,
        },
      );
    }

    const startedAtMs = this.options.clock.now();
    const term = topology.term + 1;
    const electionSeed = stableStringify({
      swarmId: topology.swarmId,
      reason,
      term,
      epoch: topology.epoch,
      topologyVersion: topology.topologyVersion,
      topologyFingerprint:
        topology.deterministicFingerprint,
    });
    const electionId =
      this.options.idGenerator.generate(
        "swarm-election",
        electionSeed,
      );

    const evaluations = topology.nodes
      .slice()
      .sort(compareNodeStates)
      .map((node) =>
        this.evaluateCandidate(
          node,
          topology,
          term,
          policy,
        ),
      );

    const candidates = Object.freeze(
      evaluations.map(
        (evaluation) => evaluation.candidate,
      ),
    );
    const eligibleEvaluations = evaluations
      .filter(
        (evaluation) =>
          evaluation.candidate.eligible,
      )
      .sort(compareCandidateEvaluations);

    if (eligibleEvaluations.length === 0) {
      return this.buildTerminalElection({
        electionId,
        topology,
        reason,
        term,
        candidates,
        votes: Object.freeze([]),
        status: "NO_QUORUM",
        electedNodeId: undefined,
        quorumSatisfied: false,
        participationRatio: 0,
        startedAtMs,
      });
    }

    const voters = topology.nodes
      .filter((node) =>
        this.isEligibleVoter(node),
      )
      .sort(compareNodeStates);

    const votes = Object.freeze(
      voters.map((voter) =>
        this.castVote(
          voter,
          eligibleEvaluations,
          electionId,
          term,
          startedAtMs,
          policy,
        ),
      ),
    );

    const participationRatio =
      topology.nodes.length === 0
        ? 0
        : clamp01(
            votes.filter((vote) => !vote.abstained)
              .length / topology.nodes.length,
          );

    const quorumSatisfied =
      this.isQuorumSatisfied(
        topology,
        eligibleEvaluations,
        votes,
        participationRatio,
      );

    if (!quorumSatisfied) {
      return this.buildTerminalElection({
        electionId,
        topology,
        reason,
        term,
        candidates,
        votes,
        status: "NO_QUORUM",
        electedNodeId: undefined,
        quorumSatisfied: false,
        participationRatio,
        startedAtMs,
      });
    }

    const tallies = tallyVotes(votes);
    const winner = this.resolveWinner(
      tallies,
      eligibleEvaluations,
      policy,
    );

    if (winner === undefined) {
      return this.buildTerminalElection({
        electionId,
        topology,
        reason,
        term,
        candidates,
        votes,
        status: "DEADLOCKED",
        electedNodeId: undefined,
        quorumSatisfied: true,
        participationRatio,
        startedAtMs,
      });
    }

    return this.buildTerminalElection({
      electionId,
      topology,
      reason,
      term,
      candidates,
      votes,
      status: "ELECTED",
      electedNodeId: winner,
      quorumSatisfied: true,
      participationRatio,
      startedAtMs,
    });
  }

  private evaluateCandidate(
    node: TradingSwarmNodeState,
    topology: TradingSwarmTopologySnapshot,
    term: number,
    policy: TradingSwarmElectionPolicy,
  ): CandidateEvaluation {
    const registration = node.registration;
    const health = node.health;
    const disqualifications: string[] = [];

    if (
      registration.identity.swarmId !==
      topology.swarmId
    ) {
      disqualifications.push("SWARM_ID_MISMATCH");
    }

    if (
      !isActiveTradingSwarmNodeState(
        health.lifecycleState,
      )
    ) {
      disqualifications.push("NODE_NOT_ACTIVE");
    }

    if (!isHealthyTradingSwarmNode(health)) {
      disqualifications.push("NODE_NOT_HEALTHY");
    }

    if (
      this.options.requireDeterministicNodes &&
      !registration.deterministic
    ) {
      disqualifications.push(
        "NODE_NOT_DETERMINISTIC",
      );
    }

    if (
      this.options.requireReplaySafeNodes &&
      !registration.replaySafe
    ) {
      disqualifications.push(
        "NODE_NOT_REPLAY_SAFE",
      );
    }

    if (
      this.options.requireElectionCapability &&
      !hasTradingSwarmCapability(
        registration,
        "ELECT_LEADER",
      )
    ) {
      disqualifications.push(
        "ELECTION_CAPABILITY_MISSING",
      );
    }

    if (
      health.readinessScore <
      policy.minimumCandidateReadiness
    ) {
      disqualifications.push(
        "READINESS_BELOW_MINIMUM",
      );
    }

    if (
      health.reliabilityScore <
      policy.minimumCandidateReliability
    ) {
      disqualifications.push(
        "RELIABILITY_BELOW_MINIMUM",
      );
    }

    if (
      policy.requireSynchronizedCandidate &&
      health.synchronizationScore <
        this.options.minimumSynchronizationScore
    ) {
      disqualifications.push(
        "SYNCHRONIZATION_BELOW_MINIMUM",
      );
    }

    const leadershipScore =
      this.calculateLeadershipScore(
        node,
        topology,
      );

    const candidateBase = {
      nodeId: registration.identity.nodeId,
      term,
      readinessScore: clamp01(
        health.readinessScore,
      ),
      reliabilityScore: clamp01(
        health.reliabilityScore,
      ),
      synchronizationScore: clamp01(
        health.synchronizationScore,
      ),
      leadershipScore,
      eligible: disqualifications.length === 0,
      disqualifications: Object.freeze(
        disqualifications.sort(),
      ),
    };

    const candidate = deepFreeze({
      ...candidateBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          candidateBase,
        ),
    });

    return Object.freeze({
      candidate,
      node,
    });
  }

  private calculateLeadershipScore(
    node: TradingSwarmNodeState,
    topology: TradingSwarmTopologySnapshot,
  ): number {
    const health = node.health;
    const weights = this.options.weights;
    const workloadRatio =
      calculateWorkloadRatio(node);
    const capacityHeadroom =
      clamp01(1 - workloadRatio);
    const roleAuthority = roleAuthorityScore(
      node.registration.identity.role,
    );
    const incumbentContinuity =
      this.options.incumbentContinuityEnabled &&
      topology.leaderNodeId ===
        node.registration.identity.nodeId
        ? 1
        : 0;

    const positive =
      clamp01(health.readinessScore) *
        weights.readiness +
      clamp01(health.reliabilityScore) *
        weights.reliability +
      clamp01(health.synchronizationScore) *
        weights.synchronization +
      clamp01(health.latencyScore) *
        weights.latency +
      clamp01(health.throughputScore) *
        weights.throughput +
      clamp01(
        health.consensusParticipationScore,
      ) *
        weights.consensusParticipation +
      clamp01(health.dataFreshnessScore) *
        weights.dataFreshness +
      capacityHeadroom *
        weights.capacityHeadroom +
      roleAuthority * weights.roleAuthority +
      incumbentContinuity *
        weights.incumbentContinuity;

    const failurePenalty =
      clamp01(health.consecutiveFailures / 10) *
      weights.failurePenalty;
    const workloadPenalty =
      workloadRatio * weights.workloadPenalty;

    return clamp01(
      positive -
        failurePenalty -
        workloadPenalty,
    );
  }

  private isEligibleVoter(
    node: TradingSwarmNodeState,
  ): boolean {
    if (
      !isActiveTradingSwarmNodeState(
        node.health.lifecycleState,
      )
    ) {
      return false;
    }

    if (
      this.options.requireHealthyVoters &&
      !isHealthyTradingSwarmNode(node.health)
    ) {
      return false;
    }

    if (
      this.options.requireDeterministicNodes &&
      !node.registration.deterministic
    ) {
      return false;
    }

    if (
      this.options.requireReplaySafeNodes &&
      !node.registration.replaySafe
    ) {
      return false;
    }

    return true;
  }

  private castVote(
    voter: TradingSwarmNodeState,
    candidates: readonly CandidateEvaluation[],
    electionId: string,
    term: number,
    castAtMs: TradingSwarmTimestamp,
    policy: TradingSwarmElectionPolicy,
  ): TradingSwarmLeaderVote {
    const ranked = candidates
      .slice()
      .sort((left, right) =>
        this.compareForVoter(
          left,
          right,
          voter,
          policy,
        ),
      );

    const winner = ranked[0];
    const abstained = winner === undefined;
    const candidateNodeId =
      winner?.candidate.nodeId;
    const weight = clamp01(
      average([
        voter.health.reliabilityScore,
        voter.health.consensusParticipationScore,
        voter.health.synchronizationScore,
      ]),
    );

    const ballotSeed = stableStringify({
      electionId,
      voterNodeId:
        voter.registration.identity.nodeId,
      candidateNodeId,
      term,
    });
    const ballotId =
      this.options.idGenerator.generate(
        "swarm-election-ballot",
        ballotSeed,
      );

    const voteBase = {
      ballotId,
      electionId,
      voterNodeId:
        voter.registration.identity.nodeId,
      ...(candidateNodeId === undefined
        ? {}
        : { candidateNodeId }),
      term,
      weight,
      abstained,
      rationale: abstained
        ? "No eligible leader candidate was available."
        : `Selected candidate "${candidateNodeId}" using deterministic leadership ranking.`,
      castAtMs,
    };

    return deepFreeze({
      ...voteBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          voteBase,
        ),
    });
  }

  private compareForVoter(
    left: CandidateEvaluation,
    right: CandidateEvaluation,
    voter: TradingSwarmNodeState,
    policy: TradingSwarmElectionPolicy,
  ): number {
    const scoreOrder =
      right.candidate.leadershipScore -
      left.candidate.leadershipScore;

    if (scoreOrder !== 0) {
      return scoreOrder;
    }

    const sameZoneLeft =
      left.node.registration.identity.zone !==
        undefined &&
      left.node.registration.identity.zone ===
        voter.registration.identity.zone
        ? 1
        : 0;
    const sameZoneRight =
      right.node.registration.identity.zone !==
        undefined &&
      right.node.registration.identity.zone ===
        voter.registration.identity.zone
        ? 1
        : 0;

    if (sameZoneLeft !== sameZoneRight) {
      return sameZoneRight - sameZoneLeft;
    }

    const sameRegionLeft =
      left.node.registration.identity.region !==
        undefined &&
      left.node.registration.identity.region ===
        voter.registration.identity.region
        ? 1
        : 0;
    const sameRegionRight =
      right.node.registration.identity.region !==
        undefined &&
      right.node.registration.identity.region ===
        voter.registration.identity.region
        ? 1
        : 0;

    if (sameRegionLeft !== sameRegionRight) {
      return sameRegionRight - sameRegionLeft;
    }

    if (!policy.deterministicTieBreaking) {
      return 0;
    }

    return left.candidate.nodeId.localeCompare(
      right.candidate.nodeId,
    );
  }

  private isQuorumSatisfied(
    topology: TradingSwarmTopologySnapshot,
    eligibleCandidates:
      readonly CandidateEvaluation[],
    votes: readonly TradingSwarmLeaderVote[],
    participationRatio: number,
  ): boolean {
    const quorum = this.options.quorum;
    const participatingVotes = votes.filter(
      (vote) => !vote.abstained,
    );

    if (
      eligibleCandidates.length <
      quorum.minimumEligibleNodes
    ) {
      return false;
    }

    if (
      participatingVotes.length <
      quorum.minimumParticipatingNodes
    ) {
      return false;
    }

    if (
      participationRatio <
      quorum.minimumParticipationRatio
    ) {
      return false;
    }

    const participatingNodeIds = new Set(
      participatingVotes.map(
        (vote) => vote.voterNodeId,
      ),
    );

    const participatingNodes =
      topology.nodes.filter((node) =>
        participatingNodeIds.has(
          node.registration.identity.nodeId,
        ),
      );

    for (const role of quorum.requiredNodeRoles) {
      if (
        !participatingNodes.some(
          (node) =>
            node.registration.identity.role ===
            role,
        )
      ) {
        return false;
      }
    }

    for (const capability of quorum.requiredCapabilities) {
      if (
        !participatingNodes.some((node) =>
          hasTradingSwarmCapability(
            node.registration,
            capability,
          ),
        )
      ) {
        return false;
      }
    }

    if (
      quorum.requireLeader &&
      topology.leaderNodeId !== undefined &&
      !participatingNodeIds.has(
        topology.leaderNodeId,
      )
    ) {
      return false;
    }

    if (
      quorum.requireRiskSwarm &&
      !participatingNodes.some(
        (node) =>
          hasTradingSwarmCapability(
            node.registration,
            "DISTRIBUTE_RISK_ANALYSIS",
          ) ||
          node.registration.identity.role ===
            "GOVERNOR",
      )
    ) {
      return false;
    }

    if (
      quorum.requireGovernanceSwarm &&
      !participatingNodes.some(
        (node) =>
          hasTradingSwarmCapability(
            node.registration,
            "ENFORCE_GOVERNANCE",
          ) ||
          node.registration.identity.role ===
            "GOVERNOR",
      )
    ) {
      return false;
    }

    if (
      !quorum.allowDegradedNodes &&
      participatingNodes.some(
        (node) =>
          !isHealthyTradingSwarmNode(
            node.health,
          ),
      )
    ) {
      return false;
    }

    return true;
  }

  private resolveWinner(
    tallies: readonly VoteTally[],
    candidates: readonly CandidateEvaluation[],
    policy: TradingSwarmElectionPolicy,
  ): TradingSwarmNodeId | undefined {
    if (tallies.length === 0) {
      return undefined;
    }

    const candidateById = new Map(
      candidates.map((candidate) => [
        candidate.candidate.nodeId,
        candidate,
      ]),
    );

    const ranked = tallies.slice().sort(
      (left, right) => {
        const weightOrder =
          right.totalWeight - left.totalWeight;

        if (weightOrder !== 0) {
          return weightOrder;
        }

        const voteOrder =
          right.voteCount - left.voteCount;

        if (voteOrder !== 0) {
          return voteOrder;
        }

        const leftCandidate =
          candidateById.get(
            left.candidateNodeId,
          );
        const rightCandidate =
          candidateById.get(
            right.candidateNodeId,
          );

        const scoreOrder =
          (rightCandidate?.candidate
            .leadershipScore ?? 0) -
          (leftCandidate?.candidate
            .leadershipScore ?? 0);

        if (scoreOrder !== 0) {
          return scoreOrder;
        }

        return policy.deterministicTieBreaking
          ? left.candidateNodeId.localeCompare(
              right.candidateNodeId,
            )
          : 0;
      },
    );

    if (
      !policy.deterministicTieBreaking &&
      ranked.length > 1 &&
      ranked[0]?.totalWeight ===
        ranked[1]?.totalWeight &&
      ranked[0]?.voteCount ===
        ranked[1]?.voteCount
    ) {
      return undefined;
    }

    return ranked[0]?.candidateNodeId;
  }

  private buildTerminalElection(input: {
    readonly electionId: string;
    readonly topology: TradingSwarmTopologySnapshot;
    readonly reason: TradingSwarmElectionReason;
    readonly term: number;
    readonly candidates:
      readonly TradingSwarmLeaderCandidate[];
    readonly votes:
      readonly TradingSwarmLeaderVote[];
    readonly status:
      | "ELECTED"
      | "NO_QUORUM"
      | "DEADLOCKED";
    readonly electedNodeId:
      | TradingSwarmNodeId
      | undefined;
    readonly quorumSatisfied: boolean;
    readonly participationRatio: number;
    readonly startedAtMs: TradingSwarmTimestamp;
  }): TradingSwarmLeaderElection {
    const completedAtMs = this.options.clock.now();

    const electionBase = {
      electionId: input.electionId,
      swarmId: input.topology.swarmId,
      reason: input.reason,
      status: input.status,
      term: input.term,
      candidates: input.candidates,
      votes: input.votes,
      ...(input.electedNodeId === undefined
        ? {}
        : {
            electedNodeId:
              input.electedNodeId,
          }),
      quorumSatisfied:
        input.quorumSatisfied,
      participationRatio: clamp01(
        input.participationRatio,
      ),
      startedAtMs: input.startedAtMs,
      completedAtMs,
    };

    return deepFreeze({
      ...electionBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          electionBase,
        ),
    });
  }

  private validateTopology(
    topology: TradingSwarmTopologySnapshot,
  ): void {
    if (
      topology === undefined ||
      topology === null ||
      typeof topology !== "object"
    ) {
      throw new SwarmLeaderElectionError(
        "INVALID_TOPOLOGY",
        "A topology snapshot is required.",
      );
    }

    if (
      topology.swarmId.trim().length === 0
    ) {
      throw new SwarmLeaderElectionError(
        "INVALID_TOPOLOGY",
        "Topology swarmId must be non-empty.",
      );
    }

    if (
      !Number.isInteger(topology.term) ||
      topology.term < 0 ||
      !Number.isInteger(topology.epoch) ||
      topology.epoch < 0
    ) {
      throw new SwarmLeaderElectionError(
        "INVALID_TOPOLOGY",
        "Topology term and epoch must be non-negative integers.",
      );
    }
  }

  private validatePolicy(
    policy: TradingSwarmElectionPolicy,
  ): void {
    if (
      policy === undefined ||
      policy === null ||
      typeof policy !== "object"
    ) {
      throw new SwarmLeaderElectionError(
        "INVALID_POLICY",
        "An election policy is required.",
      );
    }

    assertPositiveFinite(
      policy.electionTimeoutMs,
      "electionTimeoutMs",
    );
    assertPositiveFinite(
      policy.leaderLeaseDurationMs,
      "leaderLeaseDurationMs",
    );
    assertPositiveFinite(
      policy.heartbeatIntervalMs,
      "heartbeatIntervalMs",
    );
    assertNonNegativeInteger(
      policy.maximumMissedHeartbeats,
      "maximumMissedHeartbeats",
    );
    assertUnitScore(
      policy.minimumCandidateReadiness,
      "minimumCandidateReadiness",
    );
    assertUnitScore(
      policy.minimumCandidateReliability,
      "minimumCandidateReliability",
    );
  }
}

/* ========================================================================== *
 * Factory and deterministic defaults
 * ========================================================================== */

export function createSwarmLeaderElectionEngine(
  options: SwarmLeaderElectionOptions = {},
): SwarmLeaderElectionEngine {
  return new SwarmLeaderElectionEngine(options);
}

export class SystemSwarmLeaderElectionClock
  implements TradingSwarmClock
{
  public now(): TradingSwarmTimestamp {
    return Date.now() as TradingSwarmTimestamp;
  }
}

export class StableSwarmLeaderElectionIdGenerator
  implements TradingSwarmIdGenerator
{
  public generate(
    prefix: string,
    seed: string,
  ): string {
    return `${prefix}-${stableHash(seed)}`;
  }
}

export class StableSwarmLeaderElectionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-election-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Pure helpers
 * ========================================================================== */

function normalizeOptions(
  options: SwarmLeaderElectionOptions,
): NormalizedOptions {
  const weights = deepFreeze({
    ...DEFAULT_SWARM_LEADER_ELECTION_WEIGHTS,
    ...(options.weights ?? {}),
  });

  for (const [name, value] of Object.entries(weights)) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new SwarmLeaderElectionError(
        "INVALID_CONFIGURATION",
        `Election weight "${name}" must be a finite non-negative number.`,
        { name, value },
      );
    }
  }

  const quorum = deepFreeze({
    ...DEFAULT_SWARM_LEADER_ELECTION_QUORUM,
    ...(options.quorum ?? {}),
    requiredNodeRoles: Object.freeze([
      ...(
        options.quorum?.requiredNodeRoles ??
        DEFAULT_SWARM_LEADER_ELECTION_QUORUM
          .requiredNodeRoles
      ),
    ].sort()),
    requiredCapabilities: Object.freeze([
      ...(
        options.quorum
          ?.requiredCapabilities ??
        DEFAULT_SWARM_LEADER_ELECTION_QUORUM
          .requiredCapabilities
      ),
    ].sort()),
  });

  assertNonNegativeInteger(
    quorum.minimumEligibleNodes,
    "quorum.minimumEligibleNodes",
  );
  assertNonNegativeInteger(
    quorum.minimumParticipatingNodes,
    "quorum.minimumParticipatingNodes",
  );
  assertUnitScore(
    quorum.minimumParticipationRatio,
    "quorum.minimumParticipationRatio",
  );

  return Object.freeze({
    clock:
      options.clock ??
      new SystemSwarmLeaderElectionClock(),
    idGenerator:
      options.idGenerator ??
      new StableSwarmLeaderElectionIdGenerator(),
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmLeaderElectionFingerprintGenerator(),
    quorum,
    weights,
    requireElectionCapability:
      options.requireElectionCapability ?? true,
    requireHealthyVoters:
      options.requireHealthyVoters ?? true,
    requireDeterministicNodes:
      options.requireDeterministicNodes ?? true,
    requireReplaySafeNodes:
      options.requireReplaySafeNodes ?? true,
    minimumSynchronizationScore:
      normalizeUnitScore(
        options.minimumSynchronizationScore ??
          0.7,
        "minimumSynchronizationScore",
      ),
    incumbentContinuityEnabled:
      options.incumbentContinuityEnabled ??
      true,
  });
}

function compareNodeStates(
  left: TradingSwarmNodeState,
  right: TradingSwarmNodeState,
): number {
  return left.registration.identity.nodeId.localeCompare(
    right.registration.identity.nodeId,
  );
}

function compareCandidateEvaluations(
  left: CandidateEvaluation,
  right: CandidateEvaluation,
): number {
  const scoreOrder =
    right.candidate.leadershipScore -
    left.candidate.leadershipScore;

  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  const reliabilityOrder =
    right.candidate.reliabilityScore -
    left.candidate.reliabilityScore;

  if (reliabilityOrder !== 0) {
    return reliabilityOrder;
  }

  const synchronizationOrder =
    right.candidate.synchronizationScore -
    left.candidate.synchronizationScore;

  if (synchronizationOrder !== 0) {
    return synchronizationOrder;
  }

  return left.candidate.nodeId.localeCompare(
    right.candidate.nodeId,
  );
}

function tallyVotes(
  votes: readonly TradingSwarmLeaderVote[],
): readonly VoteTally[] {
  const totals = new Map<
    TradingSwarmNodeId,
    {
      totalWeight: number;
      voteCount: number;
    }
  >();

  for (const vote of votes) {
    if (
      vote.abstained ||
      vote.candidateNodeId === undefined
    ) {
      continue;
    }

    const current = totals.get(
      vote.candidateNodeId,
    ) ?? {
      totalWeight: 0,
      voteCount: 0,
    };

    totals.set(vote.candidateNodeId, {
      totalWeight:
        current.totalWeight + vote.weight,
      voteCount: current.voteCount + 1,
    });
  }

  return Object.freeze(
    [...totals.entries()]
      .map(
        ([candidateNodeId, value]) =>
          Object.freeze({
            candidateNodeId,
            totalWeight: value.totalWeight,
            voteCount: value.voteCount,
          }),
      )
      .sort((left, right) =>
        left.candidateNodeId.localeCompare(
          right.candidateNodeId,
        ),
      ),
  );
}

function calculateWorkloadRatio(
  node: TradingSwarmNodeState,
): number {
  const capacity = node.registration.capacity;
  const health = node.health;

  return clamp01(
    Math.max(
      safeRatio(
        health.activeMissionCount,
        capacity.maximumConcurrentMissions,
      ),
      safeRatio(
        health.activeTaskCount,
        capacity.maximumConcurrentTasks,
      ),
      safeRatio(
        health.activeMultiAgentRunCount,
        capacity.maximumAgentRuns,
      ),
    ),
  );
}

function roleAuthorityScore(
  role: TradingSwarmNodeRole,
): number {
  switch (role) {
    case "LEADER":
      return 1;
    case "SUPERVISOR":
      return 0.95;
    case "GOVERNOR":
      return 0.9;
    case "COORDINATOR":
      return 0.85;
    case "ARBITER":
      return 0.8;
    case "EXECUTOR":
      return 0.65;
    case "WORKER":
      return 0.55;
    case "REPLICA":
      return 0.5;
    case "OBSERVER":
      return 0.3;
  }
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

function normalizeUnitScore(
  value: number,
  name: string,
): number {
  assertUnitScore(value, name);
  return value;
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
    throw new SwarmLeaderElectionError(
      "INVALID_CONFIGURATION",
      `${name} must be between 0 and 1.`,
      { name, value },
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
    throw new SwarmLeaderElectionError(
      "INVALID_POLICY",
      `${name} must be a positive finite number.`,
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
    throw new SwarmLeaderElectionError(
      "INVALID_CONFIGURATION",
      `${name} must be a non-negative integer.`,
      { name, value },
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