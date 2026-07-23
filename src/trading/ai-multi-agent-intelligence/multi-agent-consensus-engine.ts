/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-consensus-engine.ts
 *
 * Deterministic, immutable, trust-aware collective consensus formation.
 */

import {
  type MultiAgentCollectiveConfidence,
  type MultiAgentConfidence,
  type MultiAgentConsensusEnginePort,
  type MultiAgentConsensusId,
  type MultiAgentConsensusMethod,
  type MultiAgentConsensusPolicy,
  type MultiAgentConsensusResult,
  type MultiAgentConsensusStatus,
  type MultiAgentDissentRecord,
  type MultiAgentId,
  type MultiAgentPeerReview,
  type MultiAgentProposal,
  type MultiAgentProposalId,
  type MultiAgentRegistration,
  type MultiAgentResolvedConflict,
  type MultiAgentRiskFinding,
  type MultiAgentScore,
  type MultiAgentTimestamp,
  type MultiAgentTrustScore,
  type MultiAgentVote,
  type MultiAgentVoteChoice,
  type MultiAgentVoteId,
  type MultiAgentWeight,
} from "./ai-multi-agent-contracts";

export type MultiAgentConsensusEngineErrorCode =
  | "INVALID_CONSENSUS_INPUT"
  | "INVALID_CONSENSUS_POLICY"
  | "DUPLICATE_AGENT"
  | "DUPLICATE_PROPOSAL"
  | "UNKNOWN_REVIEW_AGENT"
  | "UNKNOWN_REVIEW_PROPOSAL"
  | "UNKNOWN_TRUST_AGENT"
  | "DUPLICATE_VOTE"
  | "NO_ELIGIBLE_VOTERS";

export interface MultiAgentConsensusEngineErrorDetails {
  readonly agentId?: MultiAgentId;
  readonly proposalId?: MultiAgentProposalId;
  readonly voteId?: MultiAgentVoteId;
  readonly cause?: unknown;
}

export class MultiAgentConsensusEngineError extends Error {
  public readonly code: MultiAgentConsensusEngineErrorCode;
  public readonly details: MultiAgentConsensusEngineErrorDetails;

  public constructor(
    code: MultiAgentConsensusEngineErrorCode,
    message: string,
    details: MultiAgentConsensusEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentConsensusEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentConsensusClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentConsensusEngineOptions {
  readonly clock?: MultiAgentConsensusClock;
  readonly consensusIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentConsensusId;
  readonly voteIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentVoteId;
  readonly fingerprintFactory?: (value: unknown) => string;
  readonly minimumTrustForVoting?: MultiAgentScore;
  readonly selfProposalWeightPenalty?: MultiAgentScore;
  readonly materialDissentThreshold?: MultiAgentScore;
  readonly evidenceAdjustmentLimit?: number;
  readonly reliabilityAdjustmentLimit?: number;
  readonly agreementAdjustmentLimit?: number;
  readonly diversityAdjustmentLimit?: number;
  readonly dissentAdjustmentLimit?: number;
  readonly governanceAdjustmentLimit?: number;
}

export interface MultiAgentConsensusSnapshot {
  readonly consensusId?: MultiAgentConsensusId;
  readonly status: MultiAgentConsensusStatus;
  readonly selectedProposalId?: MultiAgentProposalId;
  readonly voteCount: number;
  readonly participationRatio: MultiAgentScore;
  readonly quorumSatisfied: boolean;
  readonly finalConfidence: MultiAgentConfidence;
  readonly formedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentConsensusClock;
  readonly consensusIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentConsensusId;
  readonly voteIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentVoteId;
  readonly fingerprintFactory: (value: unknown) => string;
  readonly minimumTrustForVoting: MultiAgentScore;
  readonly selfProposalWeightPenalty: MultiAgentScore;
  readonly materialDissentThreshold: MultiAgentScore;
  readonly evidenceAdjustmentLimit: number;
  readonly reliabilityAdjustmentLimit: number;
  readonly agreementAdjustmentLimit: number;
  readonly diversityAdjustmentLimit: number;
  readonly dissentAdjustmentLimit: number;
  readonly governanceAdjustmentLimit: number;
}

interface WeightedVoteSummary {
  readonly approvalWeight: number;
  readonly rejectionWeight: number;
  readonly abstentionWeight: number;
  readonly vetoCount: number;
  readonly totalWeight: number;
  readonly approvalRatio: number;
  readonly rejectionRatio: number;
  readonly abstentionRatio: number;
}

interface QuorumAssessment {
  readonly satisfied: boolean;
  readonly participationRatio: number;
  readonly reasons: readonly string[];
}

interface ProposalVoteAggregate {
  readonly proposal: MultiAgentProposal;
  readonly votes: readonly MultiAgentVote[];
  readonly summary: WeightedVoteSummary;
  readonly score: number;
}

const SUPPORTING_REVIEW_DECISIONS = Object.freeze([
  "STRONGLY_SUPPORT",
  "SUPPORT",
  "SUPPORT_WITH_CHANGES",
] as const);

const OPPOSING_REVIEW_DECISIONS = Object.freeze([
  "OPPOSE",
  "STRONGLY_OPPOSE",
  "VETO",
] as const);

const AUTHORITY_WEIGHT: Readonly<Record<string, number>> =
  Object.freeze({
    ADVISORY: 0.6,
    CONTRIBUTOR: 0.75,
    REVIEWER: 0.9,
    ARBITER: 1,
    APPROVER: 1.1,
    SUPERVISOR: 1.2,
  });

export class MultiAgentConsensusEngine
  implements MultiAgentConsensusEnginePort
{
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentConsensusSnapshot;

  public constructor(
    options: MultiAgentConsensusEngineOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      status: "NOT_STARTED",
      voteCount: 0,
      participationRatio: 0 as MultiAgentScore,
      quorumSatisfied: false,
      finalConfidence: 0 as MultiAgentConfidence,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          status: "NOT_STARTED",
          voteCount: 0,
        }),
    });
  }

  public snapshot(): MultiAgentConsensusSnapshot {
    return this.lastSnapshotValue;
  }

  public async form(
    proposals: readonly MultiAgentProposal[],
    reviews: readonly MultiAgentPeerReview[],
    resolvedConflicts: readonly MultiAgentResolvedConflict[],
    agents: readonly MultiAgentRegistration[],
    trust: readonly MultiAgentTrustScore[],
    policy: MultiAgentConsensusPolicy,
  ): Promise<MultiAgentConsensusResult> {
    validateInputs(
      proposals,
      reviews,
      resolvedConflicts,
      agents,
      trust,
    );
    validatePolicy(policy);

    const formedAtMs = this.options.clock.now();
    const orderedProposals = [...proposals].sort(
      (left, right) =>
        left.proposalId.localeCompare(right.proposalId),
    );
    const eligibleAgents = selectEligibleAgents(
      agents,
      trust,
      this.options.minimumTrustForVoting,
    );
    const quorum = assessQuorum(
      eligibleAgents,
      agents,
      policy,
    );
    const consensusId = this.options.consensusIdFactory(
      "consensus",
      this.options.fingerprintFactory({
        proposalIds: orderedProposals.map(
          (proposal) => proposal.proposalId,
        ),
        reviewFingerprints: reviews
          .map((review) => review.deterministicFingerprint)
          .sort(),
        resolvedConflictIds: resolvedConflicts
          .map((conflict) => conflict.conflictId)
          .sort(),
        eligibleAgentIds: eligibleAgents.map(
          (agent) => agent.identity.agentId,
        ),
        trust: [...trust]
          .sort((left, right) =>
            left.agentId.localeCompare(right.agentId),
          )
          .map((item) => ({
            agentId: item.agentId,
            overallTrust: item.overallTrust,
          })),
        policy,
        formedAtMs,
      }),
    );

    if (eligibleAgents.length === 0) {
      throw new MultiAgentConsensusEngineError(
        "NO_ELIGIBLE_VOTERS",
        "No eligible agents are available to vote.",
      );
    }

    const votes = Object.freeze(
      generateVotes(
        orderedProposals,
        reviews,
        resolvedConflicts,
        eligibleAgents,
        trust,
        policy.method,
        formedAtMs,
        this.options,
      ).sort(compareVotes),
    );

    validateVotes(votes);

    const participationRatio =
      eligibleAgents.length === 0
        ? 0
        : new Set(votes.map((vote) => vote.agentId))
            .size / eligibleAgents.length;

    if (!quorum.satisfied) {
      return this.finalizeResult({
        consensusId,
        status: "QUORUM_NOT_MET",
        method: policy.method,
        votes,
        approvalWeight: 0,
        rejectionWeight: 0,
        abstentionWeight: votes.reduce(
          (sum, vote) => sum + vote.effectiveWeight,
          0,
        ),
        vetoCount: votes.filter(
          (vote) => vote.choice === "VETO",
        ).length,
        participationRatio:
          participationRatio as MultiAgentScore,
        quorumSatisfied: false,
        collectiveConfidence:
          emptyCollectiveConfidence(),
        dissent: Object.freeze([]),
        resolvedConflicts,
        rationale:
          `Consensus quorum was not satisfied: ${quorum.reasons.join(" ")}`,
        formedAtMs,
      });
    }

    const aggregates = orderedProposals.map(
      (proposal) => {
        const proposalVotes = votes.filter(
          (vote) =>
            vote.proposalId === proposal.proposalId,
        );
        const summary =
          summarizeVotes(proposalVotes);
        const score = proposalConsensusScore(
          proposal,
          summary,
          resolvedConflicts,
          policy.method,
        );

        return deepFreeze({
          proposal,
          votes: Object.freeze(proposalVotes),
          summary,
          score,
        });
      },
    );

    const ranked = [...aggregates].sort(
      compareAggregates,
    );
    const winner = ranked[0];
    const allSummary = summarizeVotes(votes);
    const vetoed =
      policy.vetoEnabled &&
      allSummary.vetoCount > 0;
    const abstentionExceeded =
      allSummary.abstentionRatio >
      policy.maximumAbstentionRatio;
    const selected =
      !vetoed &&
      !abstentionExceeded &&
      winner !== undefined &&
      winner.summary.approvalRatio >=
        policy.approvalThreshold
        ? winner
        : undefined;

    const status = determineStatus(
      selected,
      winner,
      allSummary,
      policy,
      vetoed,
      abstentionExceeded,
    );
    const dissent = buildDissent(
      votes,
      selected?.proposal.proposalId,
      reviews,
      this.options.materialDissentThreshold,
    );
    const collectiveConfidence =
      calculateCollectiveConfidence(
        selected?.proposal,
        votes,
        eligibleAgents,
        trust,
        dissent,
        resolvedConflicts,
        this.options,
      );

    const rationale = buildRationale(
      status,
      selected,
      winner,
      allSummary,
      policy,
      dissent,
      resolvedConflicts,
    );

    return this.finalizeResult({
      consensusId,
      status,
      method: policy.method,
      selectedProposalId:
        selected?.proposal.proposalId,
      votes,
      approvalWeight:
        allSummary.approvalWeight as MultiAgentWeight,
      rejectionWeight:
        allSummary.rejectionWeight as MultiAgentWeight,
      abstentionWeight:
        allSummary.abstentionWeight as MultiAgentWeight,
      vetoCount: allSummary.vetoCount,
      participationRatio:
        participationRatio as MultiAgentScore,
      quorumSatisfied: true,
      collectiveConfidence,
      dissent,
      resolvedConflicts,
      rationale,
      formedAtMs,
    });
  }

  private finalizeResult(
    input: Omit<
      MultiAgentConsensusResult,
      "deterministicFingerprint"
    >,
  ): MultiAgentConsensusResult {
    const result: MultiAgentConsensusResult =
      deepFreeze({
        ...input,
        deterministicFingerprint:
          this.options.fingerprintFactory(input),
      });

    this.lastSnapshotValue = deepFreeze({
      consensusId: result.consensusId,
      status: result.status,
      selectedProposalId:
        result.selectedProposalId,
      voteCount: result.votes.length,
      participationRatio:
        result.participationRatio,
      quorumSatisfied: result.quorumSatisfied,
      finalConfidence:
        result.collectiveConfidence.finalConfidence,
      formedAtMs: result.formedAtMs,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          consensusId: result.consensusId,
          status: result.status,
          selectedProposalId:
            result.selectedProposalId,
          voteIds: result.votes.map(
            (vote) => vote.voteId,
          ),
          participationRatio:
            result.participationRatio,
          finalConfidence:
            result.collectiveConfidence.finalConfidence,
          formedAtMs: result.formedAtMs,
        }),
    });

    return result;
  }
}

export function createMultiAgentConsensusEngine(
  options: MultiAgentConsensusEngineOptions = {},
): MultiAgentConsensusEngine {
  return new MultiAgentConsensusEngine(options);
}

function generateVotes(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
  resolvedConflicts: readonly MultiAgentResolvedConflict[],
  agents: readonly MultiAgentRegistration[],
  trustScores: readonly MultiAgentTrustScore[],
  method: MultiAgentConsensusMethod,
  castAtMs: MultiAgentTimestamp,
  options: NormalizedOptions,
): MultiAgentVote[] {
  const trustByAgent = new Map(
    trustScores.map(
      (score) => [score.agentId, score] as const,
    ),
  );
  const votes: MultiAgentVote[] = [];

  for (const agent of agents) {
    for (const proposal of proposals) {
      const review = reviews.find(
        (item) =>
          item.proposalId === proposal.proposalId &&
          item.reviewerAgentId ===
            agent.identity.agentId,
      );
      const choice = deriveVoteChoice(
        proposal,
        review,
        resolvedConflicts,
        agent,
      );
      const confidence = clamp01(
        review?.confidence ??
          proposal.confidence,
      ) as MultiAgentConfidence;
      const baseWeight = calculateBaseWeight(
        agent,
        proposal,
        method,
        options.selfProposalWeightPenalty,
      );
      const trustAdjustedWeight =
        calculateTrustAdjustedWeight(
          baseWeight,
          trustByAgent.get(agent.identity.agentId),
          method,
        );
      const confidenceAdjustedWeight =
        calculateConfidenceAdjustedWeight(
          baseWeight,
          confidence,
          method,
        );
      const effectiveWeight =
        calculateEffectiveWeight(
          baseWeight,
          trustAdjustedWeight,
          confidenceAdjustedWeight,
          agent,
          proposal,
          method,
        );
      const restrictions =
        deriveVoteRestrictions(
          proposal,
          review,
          resolvedConflicts,
          choice,
        );
      const rationale = deriveVoteRationale(
        proposal,
        review,
        choice,
        restrictions,
      );
      const voteId = options.voteIdFactory(
        "vote",
        options.fingerprintFactory({
          proposalId: proposal.proposalId,
          agentId: agent.identity.agentId,
          choice,
          baseWeight,
          trustAdjustedWeight,
          confidenceAdjustedWeight,
          effectiveWeight,
          confidence,
          rationale,
          restrictions,
          castAtMs,
        }),
      );

      votes.push(
        deepFreeze({
          voteId,
          proposalId: proposal.proposalId,
          agentId: agent.identity.agentId,
          choice,
          baseWeight:
            baseWeight as MultiAgentWeight,
          trustAdjustedWeight:
            trustAdjustedWeight as MultiAgentWeight,
          confidenceAdjustedWeight:
            confidenceAdjustedWeight as MultiAgentWeight,
          effectiveWeight:
            effectiveWeight as MultiAgentWeight,
          confidence,
          rationale,
          restrictions,
          castAtMs,
          deterministicFingerprint:
            options.fingerprintFactory({
              voteId,
              proposalId: proposal.proposalId,
              agentId: agent.identity.agentId,
              choice,
              baseWeight,
              trustAdjustedWeight,
              confidenceAdjustedWeight,
              effectiveWeight,
              confidence,
              rationale,
              restrictions,
              castAtMs,
            }),
        }),
      );
    }
  }

  return votes;
}

function deriveVoteChoice(
  proposal: MultiAgentProposal,
  review: MultiAgentPeerReview | undefined,
  resolvedConflicts: readonly MultiAgentResolvedConflict[],
  agent: MultiAgentRegistration,
): MultiAgentVoteChoice {
  const proposalConflicts = resolvedConflicts.filter(
    (conflict) =>
      conflict.proposalIds.includes(
        proposal.proposalId,
      ),
  );
  const rejected = proposalConflicts.some(
    (conflict) =>
      conflict.resolution === "REJECT_ALL",
  );
  const escalated = proposalConflicts.some(
    (conflict) =>
      conflict.resolution === "ESCALATE" ||
      conflict.resolution === "UNRESOLVED",
  );
  const deferred = proposalConflicts.some(
    (conflict) =>
      conflict.resolution === "DEFER",
  );
  const selectedElsewhere =
    proposalConflicts.some(
      (conflict) =>
        conflict.resolution === "SELECT_PRIMARY" &&
        conflict.selectedProposalId !== undefined &&
        conflict.selectedProposalId !==
          proposal.proposalId,
    );
  const restrictions = proposalConflicts.some(
    (conflict) =>
      conflict.restrictions.length > 0 ||
      conflict.resolution ===
        "APPLY_RESTRICTIONS" ||
      conflict.resolution === "REDUCE_SCOPE",
  );
  const failedHardConstraint =
    proposal.constraints.some(
      (constraint) =>
        constraint.hard &&
        !constraint.satisfied,
    );

  if (
    agent.authority.mayVeto &&
    (review?.decision === "VETO" ||
      failedHardConstraint)
  ) {
    return "VETO";
  }

  if (rejected || selectedElsewhere) {
    return "REJECT";
  }

  if (escalated || deferred) {
    return "DEFER";
  }

  if (review === undefined) {
    return agent.identity.agentId ===
      proposal.proposedByAgentId
      ? restrictions
        ? "APPROVE_WITH_RESTRICTIONS"
        : "APPROVE"
      : "ABSTAIN";
  }

  switch (review.decision) {
    case "STRONGLY_SUPPORT":
    case "SUPPORT":
      return restrictions
        ? "APPROVE_WITH_RESTRICTIONS"
        : "APPROVE";
    case "SUPPORT_WITH_CHANGES":
      return "APPROVE_WITH_RESTRICTIONS";
    case "NEUTRAL":
      return "ABSTAIN";
    case "OPPOSE":
    case "STRONGLY_OPPOSE":
      return "REJECT";
    case "VETO":
      return agent.authority.mayVeto
        ? "VETO"
        : "REJECT";
  }
}

function calculateBaseWeight(
  agent: MultiAgentRegistration,
  proposal: MultiAgentProposal,
  method: MultiAgentConsensusMethod,
  selfProposalPenalty: number,
): number {
  const voteCapability = agent.capabilities.find(
    (capability) =>
      capability.enabled &&
      capability.capability === "VOTE",
  );
  const authorityWeight =
    AUTHORITY_WEIGHT[agent.authority.level] ?? 1;
  const selfPenalty =
    agent.identity.agentId ===
    proposal.proposedByAgentId
      ? selfProposalPenalty
      : 1;

  switch (method) {
    case "UNANIMOUS":
    case "SUPERMAJORITY":
    case "SIMPLE_MAJORITY":
      return selfPenalty;
    case "WEIGHTED_MAJORITY":
      return clampWeight(
        (voteCapability?.proficiency ?? 0.5) *
          authorityWeight *
          selfPenalty,
      );
    case "CONFIDENCE_WEIGHTED":
      return selfPenalty;
    case "AUTHORITY_WEIGHTED":
      return clampWeight(
        authorityWeight * selfPenalty,
      );
    case "RISK_ADJUSTED":
      return clampWeight(
        (agent.identity.role === "RISK_AGENT"
          ? 1.2
          : 1) * selfPenalty,
      );
    case "SUPERVISOR_DECISION":
      return agent.identity.role ===
        "SUPERVISOR_AGENT"
        ? 1
        : 0;
    case "HYBRID":
      return clampWeight(
        ((voteCapability?.proficiency ?? 0.5) *
          0.5 +
          authorityWeight * 0.5) *
          selfPenalty,
      );
  }
}

function calculateTrustAdjustedWeight(
  baseWeight: number,
  trust: MultiAgentTrustScore | undefined,
  method: MultiAgentConsensusMethod,
): number {
  if (
    method === "UNANIMOUS" ||
    method === "SIMPLE_MAJORITY" ||
    method === "SUPERMAJORITY"
  ) {
    return baseWeight;
  }

  return clampWeight(
    baseWeight *
      (trust?.overallTrust ?? 0.5),
  );
}

function calculateConfidenceAdjustedWeight(
  baseWeight: number,
  confidence: number,
  method: MultiAgentConsensusMethod,
): number {
  if (
    method === "CONFIDENCE_WEIGHTED" ||
    method === "HYBRID" ||
    method === "RISK_ADJUSTED"
  ) {
    return clampWeight(
      baseWeight * confidence,
    );
  }

  return baseWeight;
}

function calculateEffectiveWeight(
  baseWeight: number,
  trustAdjustedWeight: number,
  confidenceAdjustedWeight: number,
  agent: MultiAgentRegistration,
  proposal: MultiAgentProposal,
  method: MultiAgentConsensusMethod,
): number {
  if (
    method === "UNANIMOUS" ||
    method === "SUPERMAJORITY" ||
    method === "SIMPLE_MAJORITY"
  ) {
    return baseWeight;
  }

  if (method === "SUPERVISOR_DECISION") {
    return agent.identity.role ===
      "SUPERVISOR_AGENT"
      ? 1
      : 0;
  }

  const riskAdjustment =
    method === "RISK_ADJUSTED"
      ? 1 -
        clamp01(
          averageRiskBurden(
            proposal.risks,
          ) * 0.5,
        )
      : 1;

  return clampWeight(
    ((baseWeight +
      trustAdjustedWeight +
      confidenceAdjustedWeight) /
      3) *
      riskAdjustment,
  );
}

function deriveVoteRestrictions(
  proposal: MultiAgentProposal,
  review: MultiAgentPeerReview | undefined,
  conflicts: readonly MultiAgentResolvedConflict[],
  choice: MultiAgentVoteChoice,
): readonly string[] {
  if (
    choice !== "APPROVE_WITH_RESTRICTIONS"
  ) {
    return Object.freeze([]);
  }

  const restrictions = [
    ...(review?.requestedChanges ?? []),
    ...conflicts
      .filter((conflict) =>
        conflict.proposalIds.includes(
          proposal.proposalId,
        ),
      )
      .flatMap(
        (conflict) => conflict.restrictions,
      ),
    ...proposal.risks
      .filter(
        (risk) =>
          risk.severity === "HIGH" ||
          risk.severity === "CRITICAL",
      )
      .map(
        (risk) =>
          risk.mitigation ??
          `Mitigate risk "${risk.name}".`,
      ),
  ];

  return Object.freeze(
    [...new Set(restrictions)]
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .sort(),
  );
}

function deriveVoteRationale(
  proposal: MultiAgentProposal,
  review: MultiAgentPeerReview | undefined,
  choice: MultiAgentVoteChoice,
  restrictions: readonly string[],
): string {
  if (review !== undefined) {
    const score =
      review.scores.length === 0
        ? 0
        : review.scores.reduce(
            (sum, item) =>
              sum + item.score,
            0,
          ) / review.scores.length;

    return (
      `Vote ${choice} for "${proposal.title}" based on peer review ` +
      `"${review.reviewId}" with average score ${(score * 100).toFixed(2)}%` +
      (restrictions.length > 0
        ? ` and ${restrictions.length} restriction(s).`
        : ".")
    );
  }

  return (
    `Vote ${choice} for "${proposal.title}" based on proposal utility, ` +
    `confidence, conflicts, authority, and available evidence.`
  );
}

function summarizeVotes(
  votes: readonly MultiAgentVote[],
): WeightedVoteSummary {
  let approvalWeight = 0;
  let rejectionWeight = 0;
  let abstentionWeight = 0;
  let vetoCount = 0;

  for (const vote of votes) {
    switch (vote.choice) {
      case "APPROVE":
      case "APPROVE_WITH_RESTRICTIONS":
        approvalWeight += vote.effectiveWeight;
        break;
      case "REJECT":
        rejectionWeight += vote.effectiveWeight;
        break;
      case "VETO":
        rejectionWeight += vote.effectiveWeight;
        vetoCount += 1;
        break;
      case "ABSTAIN":
      case "DEFER":
        abstentionWeight += vote.effectiveWeight;
        break;
    }
  }

  const totalWeight =
    approvalWeight +
    rejectionWeight +
    abstentionWeight;

  return deepFreeze({
    approvalWeight,
    rejectionWeight,
    abstentionWeight,
    vetoCount,
    totalWeight,
    approvalRatio:
      totalWeight === 0
        ? 0
        : approvalWeight / totalWeight,
    rejectionRatio:
      totalWeight === 0
        ? 0
        : rejectionWeight / totalWeight,
    abstentionRatio:
      totalWeight === 0
        ? 1
        : abstentionWeight / totalWeight,
  });
}

function proposalConsensusScore(
  proposal: MultiAgentProposal,
  summary: WeightedVoteSummary,
  conflicts: readonly MultiAgentResolvedConflict[],
  method: MultiAgentConsensusMethod,
): number {
  const conflictPenalty =
    conflicts
      .filter((conflict) =>
        conflict.proposalIds.includes(
          proposal.proposalId,
        ),
      )
      .reduce(
        (sum, conflict) =>
          sum +
          (conflict.resolution === "REJECT_ALL"
            ? 1
            : conflict.resolution === "ESCALATE"
              ? 0.75
              : conflict.resolution === "DEFER" ||
                  conflict.resolution ===
                    "UNRESOLVED"
                ? 0.5
                : 0.1),
        0,
      ) /
    Math.max(
      1,
      conflicts.filter((conflict) =>
        conflict.proposalIds.includes(
          proposal.proposalId,
        ),
      ).length,
    );
  const methodBonus =
    method === "RISK_ADJUSTED"
      ? 1 - averageRiskBurden(proposal.risks)
      : 1;

  return clamp01(
    summary.approvalRatio * 0.55 +
      proposal.expectedUtility.totalUtility *
        0.2 +
      proposal.confidence * 0.15 +
      averageEvidenceQuality(proposal) * 0.1 -
      summary.rejectionRatio * 0.4 -
      conflictPenalty * 0.25,
  ) * methodBonus;
}

function determineStatus(
  selected: ProposalVoteAggregate | undefined,
  winner: ProposalVoteAggregate | undefined,
  overall: WeightedVoteSummary,
  policy: MultiAgentConsensusPolicy,
  vetoed: boolean,
  abstentionExceeded: boolean,
): MultiAgentConsensusStatus {
  if (vetoed) {
    return "VETOED";
  }

  if (selected !== undefined) {
    const hasDissent =
      selected.summary.rejectionWeight > 0 ||
      selected.summary.abstentionWeight > 0;

    return hasDissent
      ? "CONSENSUS_WITH_DISSENT"
      : "CONSENSUS_REACHED";
  }

  if (
    winner !== undefined &&
    winner.summary.rejectionRatio >=
      policy.rejectionThreshold
  ) {
    return resolveDeadlockStatus(
      policy.deadlockResolution,
    );
  }

  if (abstentionExceeded) {
    return "DEADLOCKED";
  }

  if (
    overall.approvalWeight === 0 &&
    overall.rejectionWeight === 0
  ) {
    return "DEADLOCKED";
  }

  return resolveDeadlockStatus(
    policy.deadlockResolution,
  );
}

function resolveDeadlockStatus(
  resolution: MultiAgentConsensusPolicy["deadlockResolution"],
): MultiAgentConsensusStatus {
  switch (resolution) {
    case "SUPERVISOR":
    case "ARBITER":
    case "OPERATOR":
      return "ESCALATED";
    case "DEFER":
    case "REJECT":
      return "DEADLOCKED";
  }
}

function buildDissent(
  votes: readonly MultiAgentVote[],
  selectedProposalId: MultiAgentProposalId | undefined,
  reviews: readonly MultiAgentPeerReview[],
  materialThreshold: number,
): readonly MultiAgentDissentRecord[] {
  if (selectedProposalId === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(
    votes
      .filter(
        (vote) =>
          vote.proposalId ===
            selectedProposalId &&
          (vote.choice === "REJECT" ||
            vote.choice === "VETO" ||
            vote.choice === "DEFER"),
      )
      .map((vote) => {
        const review = reviews.find(
          (item) =>
            item.proposalId === vote.proposalId &&
            item.reviewerAgentId ===
              vote.agentId,
        );
        const unresolvedRisks =
          review?.concerns ?? [];
        const material =
          vote.choice === "VETO" ||
          vote.effectiveWeight >=
            materialThreshold ||
          unresolvedRisks.some(
            (risk) =>
              risk.severity === "HIGH" ||
              risk.severity === "CRITICAL",
          );

        return deepFreeze({
          agentId: vote.agentId,
          proposalId: vote.proposalId,
          vote: vote.choice,
          rationale: vote.rationale,
          material,
          unresolvedRisks:
            Object.freeze([...unresolvedRisks]),
        });
      })
      .sort((left, right) => {
        if (left.material !== right.material) {
          return left.material ? -1 : 1;
        }

        return left.agentId.localeCompare(
          right.agentId,
        );
      }),
  );
}

function calculateCollectiveConfidence(
  proposal: MultiAgentProposal | undefined,
  votes: readonly MultiAgentVote[],
  agents: readonly MultiAgentRegistration[],
  trust: readonly MultiAgentTrustScore[],
  dissent: readonly MultiAgentDissentRecord[],
  conflicts: readonly MultiAgentResolvedConflict[],
  options: NormalizedOptions,
): MultiAgentCollectiveConfidence {
  if (
    proposal === undefined ||
    votes.length === 0
  ) {
    return emptyCollectiveConfidence();
  }

  const proposalVotes = votes.filter(
    (vote) =>
      vote.proposalId === proposal.proposalId,
  );
  const rawConfidence =
    weightedAverage(
      proposalVotes.map((vote) => ({
        value: vote.confidence,
        weight: vote.effectiveWeight,
      })),
    );
  const evidenceQuality =
    averageEvidenceQuality(proposal);
  const reliability =
    averageTrust(
      proposalVotes.map((vote) => vote.agentId),
      trust,
    );
  const summary =
    summarizeVotes(proposalVotes);
  const agreement =
    Math.max(
      summary.approvalRatio,
      summary.rejectionRatio,
    );
  const diversity =
    calculateAgentDiversity(
      proposalVotes.map((vote) => vote.agentId),
      agents,
    );
  const materialDissentRatio =
    dissent.length === 0
      ? 0
      : dissent.filter((item) => item.material)
          .length / dissent.length;
  const governancePenalty =
    conflicts.some(
      (conflict) =>
        conflict.proposalIds.includes(
          proposal.proposalId,
        ) &&
        (conflict.type ===
          "GOVERNANCE_CONFLICT" ||
          conflict.type === "POLICY_CONFLICT" ||
          conflict.type ===
            "AUTHORITY_CONFLICT"),
    )
      ? 1
      : 0;

  const evidenceQualityAdjustment =
    centeredAdjustment(
      evidenceQuality,
      options.evidenceAdjustmentLimit,
    );
  const agentReliabilityAdjustment =
    centeredAdjustment(
      reliability,
      options.reliabilityAdjustmentLimit,
    );
  const agreementAdjustment =
    centeredAdjustment(
      agreement,
      options.agreementAdjustmentLimit,
    );
  const diversityAdjustment =
    centeredAdjustment(
      diversity,
      options.diversityAdjustmentLimit,
    );
  const dissentAdjustment =
    -materialDissentRatio *
    options.dissentAdjustmentLimit;
  const governanceAdjustment =
    -governancePenalty *
    options.governanceAdjustmentLimit;
  const finalConfidence = clamp01(
    rawConfidence +
      evidenceQualityAdjustment +
      agentReliabilityAdjustment +
      agreementAdjustment +
      diversityAdjustment +
      dissentAdjustment +
      governanceAdjustment,
  );

  return deepFreeze({
    rawConfidence:
      rawConfidence as MultiAgentConfidence,
    evidenceQualityAdjustment,
    agentReliabilityAdjustment,
    agreementAdjustment,
    diversityAdjustment,
    dissentAdjustment,
    governanceAdjustment,
    finalConfidence:
      finalConfidence as MultiAgentConfidence,
  });
}

function assessQuorum(
  eligibleAgents: readonly MultiAgentRegistration[],
  allAgents: readonly MultiAgentRegistration[],
  policy: MultiAgentConsensusPolicy,
): QuorumAssessment {
  const reasons: string[] = [];
  const eligibleCount = eligibleAgents.length;
  const participationRatio =
    allAgents.length === 0
      ? 0
      : eligibleCount / allAgents.length;

  if (
    eligibleCount <
    policy.quorum.minimumEligibleAgents
  ) {
    reasons.push(
      `Eligible agents ${eligibleCount} are below minimum ${policy.quorum.minimumEligibleAgents}.`,
    );
  }

  if (
    eligibleCount <
    policy.quorum.minimumParticipatingAgents
  ) {
    reasons.push(
      `Participating agents ${eligibleCount} are below minimum ${policy.quorum.minimumParticipatingAgents}.`,
    );
  }

  if (
    participationRatio <
    policy.quorum.minimumParticipationRatio
  ) {
    reasons.push(
      `Participation ratio ${participationRatio.toFixed(4)} is below minimum ${policy.quorum.minimumParticipationRatio.toFixed(4)}.`,
    );
  }

  for (const role of policy.quorum.requiredRoles) {
    if (
      !eligibleAgents.some(
        (agent) =>
          agent.identity.role === role,
      )
    ) {
      reasons.push(
        `Required role "${role}" is absent.`,
      );
    }
  }

  for (const capability of policy.quorum
    .requiredCapabilities) {
    if (
      !eligibleAgents.some((agent) =>
        agent.capabilities.some(
          (item) =>
            item.enabled &&
            item.capability === capability,
        ),
      )
    ) {
      reasons.push(
        `Required capability "${capability}" is absent.`,
      );
    }
  }

  if (
    policy.quorum.requireRiskAgent &&
    !eligibleAgents.some(
      (agent) =>
        agent.identity.role === "RISK_AGENT",
    )
  ) {
    reasons.push("A risk agent is required.");
  }

  if (
    policy.quorum.requireGovernanceAgent &&
    !eligibleAgents.some(
      (agent) =>
        agent.identity.role ===
        "GOVERNANCE_AGENT",
    )
  ) {
    reasons.push(
      "A governance agent is required.",
    );
  }

  if (
    policy.quorum.requireSupervisor &&
    !eligibleAgents.some(
      (agent) =>
        agent.identity.role ===
        "SUPERVISOR_AGENT",
    )
  ) {
    reasons.push(
      "A supervisor agent is required.",
    );
  }

  return deepFreeze({
    satisfied: reasons.length === 0,
    participationRatio,
    reasons: Object.freeze(reasons),
  });
}

function selectEligibleAgents(
  agents: readonly MultiAgentRegistration[],
  trust: readonly MultiAgentTrustScore[],
  minimumTrust: number,
): readonly MultiAgentRegistration[] {
  const trustByAgent = new Map(
    trust.map(
      (item) => [item.agentId, item] as const,
    ),
  );

  return Object.freeze(
    agents
      .filter(
        (agent) =>
          agent.authority.mayVote &&
          agent.capabilities.some(
            (capability) =>
              capability.enabled &&
              capability.capability === "VOTE",
          ) &&
          (trustByAgent.get(
            agent.identity.agentId,
          )?.overallTrust ??
            0.5) >= minimumTrust,
      )
      .sort((left, right) =>
        left.identity.agentId.localeCompare(
          right.identity.agentId,
        ),
      ),
  );
}

function buildRationale(
  status: MultiAgentConsensusStatus,
  selected: ProposalVoteAggregate | undefined,
  winner: ProposalVoteAggregate | undefined,
  overall: WeightedVoteSummary,
  policy: MultiAgentConsensusPolicy,
  dissent: readonly MultiAgentDissentRecord[],
  conflicts: readonly MultiAgentResolvedConflict[],
): string {
  if (status === "VETOED") {
    return (
      `Consensus was vetoed by ${overall.vetoCount} authorized vote(s).`
    );
  }

  if (
    status === "CONSENSUS_REACHED" ||
    status === "CONSENSUS_WITH_DISSENT"
  ) {
    return (
      `Selected proposal "${selected?.proposal.title ?? "unknown"}" using ` +
      `${policy.method}; approval ratio ${(selected?.summary.approvalRatio ?? 0).toFixed(4)}, ` +
      `${dissent.length} dissent record(s), and ${conflicts.length} resolved conflict(s).`
    );
  }

  if (status === "QUORUM_NOT_MET") {
    return "Consensus could not proceed because quorum was not satisfied.";
  }

  if (status === "ESCALATED") {
    return (
      `Consensus deadlock was escalated using policy "${policy.deadlockResolution}".`
    );
  }

  return (
    `Consensus was not reached. Best proposal "${winner?.proposal.title ?? "none"}" ` +
    `did not satisfy approval threshold ${policy.approvalThreshold.toFixed(4)}.`
  );
}

function averageRiskBurden(
  risks: readonly MultiAgentRiskFinding[],
): number {
  if (risks.length === 0) {
    return 0;
  }

  return clamp01(
    risks.reduce(
      (sum, risk) =>
        sum +
        severityValue(risk.severity) *
          risk.probability *
          risk.impact *
          risk.confidence,
      0,
    ) / risks.length,
  );
}

function severityValue(
  severity: MultiAgentRiskFinding["severity"],
): number {
  switch (severity) {
    case "INFORMATIONAL":
      return 0.1;
    case "LOW":
      return 0.25;
    case "MODERATE":
      return 0.5;
    case "HIGH":
      return 0.75;
    case "CRITICAL":
      return 1;
  }
}

function averageEvidenceQuality(
  proposal: MultiAgentProposal,
): number {
  if (proposal.evidence.length === 0) {
    return 0;
  }

  return clamp01(
    proposal.evidence.reduce(
      (sum, evidence) =>
        sum +
        evidence.weight *
          evidence.confidence *
          evidence.reliability,
      0,
    ) / proposal.evidence.length,
  );
}

function averageTrust(
  agentIds: readonly MultiAgentId[],
  trust: readonly MultiAgentTrustScore[],
): number {
  if (agentIds.length === 0) {
    return 0;
  }

  const trustByAgent = new Map(
    trust.map(
      (item) => [item.agentId, item] as const,
    ),
  );

  return clamp01(
    agentIds.reduce(
      (sum, agentId) =>
        sum +
        (trustByAgent.get(agentId)
          ?.overallTrust ?? 0.5),
      0,
    ) / agentIds.length,
  );
}

function calculateAgentDiversity(
  agentIds: readonly MultiAgentId[],
  agents: readonly MultiAgentRegistration[],
): number {
  if (agentIds.length <= 1) {
    return 0;
  }

  const agentById = new Map(
    agents.map(
      (agent) =>
        [agent.identity.agentId, agent] as const,
    ),
  );
  const roles = new Set(
    agentIds
      .map(
        (agentId) =>
          agentById.get(agentId)?.identity.role,
      )
      .filter(isDefined),
  );
  const models = new Set(
    agentIds
      .map(
        (agentId) =>
          agentById.get(agentId)?.identity
            .modelType,
      )
      .filter(isDefined),
  );
  const modes = new Set(
    agentIds
      .map(
        (agentId) =>
          agentById.get(agentId)?.reasoningMode,
      )
      .filter(isDefined),
  );

  return clamp01(
    roles.size / agentIds.length * 0.5 +
      models.size / agentIds.length * 0.3 +
      modes.size / agentIds.length * 0.2,
  );
}

function centeredAdjustment(
  score: number,
  limit: number,
): number {
  return (clamp01(score) - 0.5) * 2 * limit;
}

function weightedAverage(
  items: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
): number {
  const totalWeight = items.reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  if (totalWeight <= 0) {
    return items.length === 0
      ? 0
      : items.reduce(
          (sum, item) => sum + item.value,
          0,
        ) / items.length;
  }

  return clamp01(
    items.reduce(
      (sum, item) =>
        sum + item.value * item.weight,
      0,
    ) / totalWeight,
  );
}

function emptyCollectiveConfidence(): MultiAgentCollectiveConfidence {
  return deepFreeze({
    rawConfidence: 0 as MultiAgentConfidence,
    evidenceQualityAdjustment: 0,
    agentReliabilityAdjustment: 0,
    agreementAdjustment: 0,
    diversityAdjustment: 0,
    dissentAdjustment: 0,
    governanceAdjustment: 0,
    finalConfidence: 0 as MultiAgentConfidence,
  });
}

function compareVotes(
  left: MultiAgentVote,
  right: MultiAgentVote,
): number {
  const proposalDifference =
    left.proposalId.localeCompare(
      right.proposalId,
    );

  return proposalDifference !== 0
    ? proposalDifference
    : left.agentId.localeCompare(
        right.agentId,
      );
}

function compareAggregates(
  left: ProposalVoteAggregate,
  right: ProposalVoteAggregate,
): number {
  return left.score !== right.score
    ? right.score - left.score
    : left.proposal.proposalId.localeCompare(
        right.proposal.proposalId,
      );
}

function validateVotes(
  votes: readonly MultiAgentVote[],
): void {
  const pairs = new Set<string>();
  const voteIds = new Set<MultiAgentVoteId>();

  for (const vote of votes) {
    const pair = `${vote.proposalId}|${vote.agentId}`;

    if (
      pairs.has(pair) ||
      voteIds.has(vote.voteId)
    ) {
      throw new MultiAgentConsensusEngineError(
        "DUPLICATE_VOTE",
        `Duplicate vote detected for "${pair}".`,
        {
          agentId: vote.agentId,
          proposalId: vote.proposalId,
          voteId: vote.voteId,
        },
      );
    }

    pairs.add(pair);
    voteIds.add(vote.voteId);
  }
}

function validateInputs(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
  conflicts: readonly MultiAgentResolvedConflict[],
  agents: readonly MultiAgentRegistration[],
  trust: readonly MultiAgentTrustScore[],
): void {
  if (
    !Array.isArray(proposals) ||
    !Array.isArray(reviews) ||
    !Array.isArray(conflicts) ||
    !Array.isArray(agents) ||
    !Array.isArray(trust)
  ) {
    throw new MultiAgentConsensusEngineError(
      "INVALID_CONSENSUS_INPUT",
      "All consensus inputs must be arrays.",
    );
  }

  const proposalIds =
    new Set<MultiAgentProposalId>();

  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposalId)) {
      throw new MultiAgentConsensusEngineError(
        "DUPLICATE_PROPOSAL",
        `Duplicate proposal "${proposal.proposalId}".`,
        { proposalId: proposal.proposalId },
      );
    }

    proposalIds.add(proposal.proposalId);
  }

  const agentIds = new Set<MultiAgentId>();

  for (const agent of agents) {
    if (agentIds.has(agent.identity.agentId)) {
      throw new MultiAgentConsensusEngineError(
        "DUPLICATE_AGENT",
        `Duplicate agent "${agent.identity.agentId}".`,
        { agentId: agent.identity.agentId },
      );
    }

    agentIds.add(agent.identity.agentId);
  }

  for (const review of reviews) {
    if (!proposalIds.has(review.proposalId)) {
      throw new MultiAgentConsensusEngineError(
        "UNKNOWN_REVIEW_PROPOSAL",
        `Review "${review.reviewId}" references unknown proposal "${review.proposalId}".`,
        { proposalId: review.proposalId },
      );
    }

    if (!agentIds.has(review.reviewerAgentId)) {
      throw new MultiAgentConsensusEngineError(
        "UNKNOWN_REVIEW_AGENT",
        `Review "${review.reviewId}" references unknown agent "${review.reviewerAgentId}".`,
        { agentId: review.reviewerAgentId },
      );
    }
  }

  for (const score of trust) {
    if (!agentIds.has(score.agentId)) {
      throw new MultiAgentConsensusEngineError(
        "UNKNOWN_TRUST_AGENT",
        `Trust score references unknown agent "${score.agentId}".`,
        { agentId: score.agentId },
      );
    }
  }

  for (const conflict of conflicts) {
    for (const proposalId of conflict.proposalIds) {
      if (!proposalIds.has(proposalId)) {
        throw new MultiAgentConsensusEngineError(
          "INVALID_CONSENSUS_INPUT",
          `Conflict "${conflict.conflictId}" references unknown proposal "${proposalId}".`,
          { proposalId },
        );
      }
    }
  }
}

function validatePolicy(
  policy: MultiAgentConsensusPolicy,
): void {
  validateUnitInterval(
    policy.approvalThreshold,
    "approvalThreshold",
  );
  validateUnitInterval(
    policy.rejectionThreshold,
    "rejectionThreshold",
  );
  validateUnitInterval(
    policy.maximumAbstentionRatio,
    "maximumAbstentionRatio",
  );
  validateUnitInterval(
    policy.quorum.minimumParticipationRatio,
    "minimumParticipationRatio",
  );

  if (
    !Number.isInteger(
      policy.quorum.minimumEligibleAgents,
    ) ||
    policy.quorum.minimumEligibleAgents < 0 ||
    !Number.isInteger(
      policy.quorum.minimumParticipatingAgents,
    ) ||
    policy.quorum.minimumParticipatingAgents < 0 ||
    !Number.isInteger(
      policy.maximumDebateRounds,
    ) ||
    policy.maximumDebateRounds < 0
  ) {
    throw new MultiAgentConsensusEngineError(
      "INVALID_CONSENSUS_POLICY",
      "Consensus policy contains invalid integer limits.",
    );
  }
}

function normalizeOptions(
  options: MultiAgentConsensusEngineOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    consensusIdFactory:
      options.consensusIdFactory ??
      defaultConsensusIdFactory,
    voteIdFactory:
      options.voteIdFactory ??
      defaultVoteIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
    minimumTrustForVoting:
      options.minimumTrustForVoting ??
      (0 as MultiAgentScore),
    selfProposalWeightPenalty:
      options.selfProposalWeightPenalty ??
      (0.85 as MultiAgentScore),
    materialDissentThreshold:
      options.materialDissentThreshold ??
      (0.5 as MultiAgentScore),
    evidenceAdjustmentLimit:
      options.evidenceAdjustmentLimit ?? 0.1,
    reliabilityAdjustmentLimit:
      options.reliabilityAdjustmentLimit ?? 0.1,
    agreementAdjustmentLimit:
      options.agreementAdjustmentLimit ?? 0.15,
    diversityAdjustmentLimit:
      options.diversityAdjustmentLimit ?? 0.05,
    dissentAdjustmentLimit:
      options.dissentAdjustmentLimit ?? 0.15,
    governanceAdjustmentLimit:
      options.governanceAdjustmentLimit ?? 0.2,
  };

  validateUnitInterval(
    normalized.minimumTrustForVoting,
    "minimumTrustForVoting",
  );
  validateUnitInterval(
    normalized.selfProposalWeightPenalty,
    "selfProposalWeightPenalty",
  );
  validateUnitInterval(
    normalized.materialDissentThreshold,
    "materialDissentThreshold",
  );

  for (const [name, value] of Object.entries({
    evidenceAdjustmentLimit:
      normalized.evidenceAdjustmentLimit,
    reliabilityAdjustmentLimit:
      normalized.reliabilityAdjustmentLimit,
    agreementAdjustmentLimit:
      normalized.agreementAdjustmentLimit,
    diversityAdjustmentLimit:
      normalized.diversityAdjustmentLimit,
    dissentAdjustmentLimit:
      normalized.dissentAdjustmentLimit,
    governanceAdjustmentLimit:
      normalized.governanceAdjustmentLimit,
  })) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new RangeError(
        `${name} must be between 0 and 1.`,
      );
    }
  }

  return Object.freeze(normalized);
}

function validateUnitInterval(
  value: number,
  name: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new MultiAgentConsensusEngineError(
      "INVALID_CONSENSUS_POLICY",
      `${name} must be between 0 and 1.`,
    );
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function clampWeight(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function isDefined<TValue>(
  value: TValue | undefined,
): value is TValue {
  return value !== undefined;
}

function defaultConsensusIdFactory(
  prefix: string,
  seed: string,
): MultiAgentConsensusId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultVoteIdFactory(
  prefix: string,
  seed: string,
): MultiAgentVoteId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultFingerprintFactory(
  value: unknown,
): string {
  return `fnv1a64:${fnv1a64(
    canonicalStringify(value),
  )}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      continue;
    }

    hash ^= BigInt(codePoint);
    hash = (hash * prime) & mask;

    if (codePoint > 0xffff) {
      index += 1;
    }
  }

  return hash.toString(16).padStart(16, "0");
}

function canonicalStringify(value: unknown): string {
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
        "Cannot fingerprint a non-finite number.",
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
      .sort(([left], [right]) =>
        left.localeCompare(right),
      );
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
    const record =
      value as Readonly<Record<string, unknown>>;
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
    `Unsupported fingerprint value type: ${typeof value}.`,
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