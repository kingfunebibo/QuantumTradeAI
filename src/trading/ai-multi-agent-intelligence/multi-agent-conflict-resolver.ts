/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-conflict-resolver.ts
 *
 * Production-grade, deterministic, immutable multi-agent conflict detection
 * and resolution.
 */

import {
  type MultiAgentConfidence,
  type MultiAgentConflict,
  type MultiAgentConflictId,
  type MultiAgentConflictResolution,
  type MultiAgentConflictResolverPort,
  type MultiAgentConflictType,
  type MultiAgentDebateTranscript,
  type MultiAgentEvidence,
  type MultiAgentId,
  type MultiAgentPeerReview,
  type MultiAgentProposal,
  type MultiAgentProposalId,
  type MultiAgentRegistration,
  type MultiAgentResolvedConflict,
  type MultiAgentRiskSeverity,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentConflictResolverErrorCode =
  | "INVALID_CONFLICT_INPUT"
  | "DUPLICATE_CONFLICT_ID"
  | "UNKNOWN_CONFLICT_PROPOSAL"
  | "NO_ARBITER_AVAILABLE"
  | "RESOLUTION_FAILED";

export interface MultiAgentConflictResolverErrorDetails {
  readonly conflictId?: MultiAgentConflictId;
  readonly proposalId?: MultiAgentProposalId;
  readonly agentId?: MultiAgentId;
  readonly cause?: unknown;
}

export class MultiAgentConflictResolverError extends Error {
  public readonly code: MultiAgentConflictResolverErrorCode;
  public readonly details: MultiAgentConflictResolverErrorDetails;

  public constructor(
    code: MultiAgentConflictResolverErrorCode,
    message: string,
    details: MultiAgentConflictResolverErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentConflictResolverError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentConflictResolverClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentConflictResolverOptions {
  readonly clock?: MultiAgentConflictResolverClock;
  readonly conflictIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentConflictId;
  readonly fingerprintFactory?: (value: unknown) => string;
  readonly highSeverityRiskThreshold?: number;
  readonly capitalDifferenceThreshold?: number;
  readonly timingDifferenceThresholdMs?: number;
  readonly automaticallyEscalateCritical?: boolean;
  readonly requireArbiterForEscalation?: boolean;
}

export interface MultiAgentConflictResolverSnapshot {
  readonly detectedConflictCount: number;
  readonly resolvedConflictCount: number;
  readonly unresolvedConflictCount: number;
  readonly escalatedConflictCount: number;
  readonly lastDetectedAtMs?: MultiAgentTimestamp;
  readonly lastResolvedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentConflictResolverClock;
  readonly conflictIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentConflictId;
  readonly fingerprintFactory: (value: unknown) => string;
  readonly highSeverityRiskThreshold: number;
  readonly capitalDifferenceThreshold: number;
  readonly timingDifferenceThresholdMs: number;
  readonly automaticallyEscalateCritical: boolean;
  readonly requireArbiterForEscalation: boolean;
}

interface ConflictCandidate {
  readonly type: MultiAgentConflictType;
  readonly proposalIds: readonly MultiAgentProposalId[];
  readonly agentIds: readonly MultiAgentId[];
  readonly description: string;
  readonly severity: MultiAgentRiskSeverity;
  readonly evidence: readonly MultiAgentEvidence[];
}

interface ResolutionDecision {
  readonly resolution: MultiAgentConflictResolution;
  readonly selectedProposalId?: MultiAgentProposalId;
  readonly mergedProposalId?: MultiAgentProposalId;
  readonly restrictions: readonly string[];
  readonly rationale: string;
  readonly resolvedByAgentId?: MultiAgentId;
  readonly confidence: MultiAgentConfidence;
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

const SEVERITY_ORDER: Readonly<
  Record<MultiAgentRiskSeverity, number>
> = Object.freeze({
  INFORMATIONAL: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
});

export class MultiAgentConflictResolver
  implements MultiAgentConflictResolverPort
{
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentConflictResolverSnapshot;

  public constructor(
    options: MultiAgentConflictResolverOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      detectedConflictCount: 0,
      resolvedConflictCount: 0,
      unresolvedConflictCount: 0,
      escalatedConflictCount: 0,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          detectedConflictCount: 0,
          resolvedConflictCount: 0,
        }),
    });
  }

  public snapshot(): MultiAgentConflictResolverSnapshot {
    return this.lastSnapshotValue;
  }

  public detect(
    proposals: readonly MultiAgentProposal[],
    reviews: readonly MultiAgentPeerReview[],
  ): readonly MultiAgentConflict[] {
    validateDetectionInput(proposals, reviews);

    const detectedAtMs = this.options.clock.now();
    const candidates: ConflictCandidate[] = [];

    candidates.push(
      ...detectActionConflicts(proposals),
      ...detectDirectionConflicts(proposals),
      ...detectRiskConflicts(
        proposals,
        reviews,
        this.options.highSeverityRiskThreshold,
      ),
      ...detectCapitalConflicts(
        proposals,
        this.options.capitalDifferenceThreshold,
      ),
      ...detectStrategyConflicts(proposals),
      ...detectArbitrageConflicts(proposals),
      ...detectExecutionConflicts(proposals),
      ...detectGovernanceConflicts(proposals, reviews),
      ...detectEvidenceConflicts(proposals, reviews),
      ...detectTimingConflicts(
        proposals,
        this.options.timingDifferenceThresholdMs,
      ),
      ...detectAuthorityConflicts(proposals, reviews),
      ...detectPolicyConflicts(proposals),
    );

    const deduplicated = deduplicateCandidates(candidates);
    const conflicts = deduplicated
      .map((candidate) =>
        materializeConflict(
          candidate,
          detectedAtMs,
          this.options,
        ),
      )
      .sort(compareConflicts);

    this.lastSnapshotValue = deepFreeze({
      detectedConflictCount: conflicts.length,
      resolvedConflictCount: 0,
      unresolvedConflictCount: conflicts.length,
      escalatedConflictCount: 0,
      lastDetectedAtMs: detectedAtMs,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          conflictIds: conflicts.map(
            (conflict) => conflict.conflictId,
          ),
          detectedAtMs,
        }),
    });

    return Object.freeze(conflicts);
  }

  public async resolve(
    conflicts: readonly MultiAgentConflict[],
    proposals: readonly MultiAgentProposal[],
    debate: MultiAgentDebateTranscript | undefined,
    agents: readonly MultiAgentRegistration[],
  ): Promise<readonly MultiAgentResolvedConflict[]> {
    validateResolutionInput(conflicts, proposals, agents);

    const resolvedAtMs = this.options.clock.now();
    const proposalById = new Map(
      proposals.map(
        (proposal) =>
          [proposal.proposalId, proposal] as const,
      ),
    );
    const arbiters = selectArbiters(agents);
    const resolved: MultiAgentResolvedConflict[] = [];

    for (const conflict of [...conflicts].sort(compareConflicts)) {
      const involvedProposals = conflict.proposalIds.map(
        (proposalId) => {
          const proposal = proposalById.get(proposalId);

          if (proposal === undefined) {
            throw new MultiAgentConflictResolverError(
              "UNKNOWN_CONFLICT_PROPOSAL",
              `Conflict "${conflict.conflictId}" references unknown proposal "${proposalId}".`,
              {
                conflictId: conflict.conflictId,
                proposalId,
              },
            );
          }

          return proposal;
        },
      );

      const decision = chooseResolution(
        conflict,
        involvedProposals,
        debate,
        arbiters,
        this.options,
      );

      resolved.push(
        deepFreeze({
          ...conflict,
          resolution: decision.resolution,
          selectedProposalId:
            decision.selectedProposalId,
          mergedProposalId: decision.mergedProposalId,
          restrictions: decision.restrictions,
          rationale: decision.rationale,
          resolvedByAgentId:
            decision.resolvedByAgentId,
          resolvedAtMs,
          confidence: decision.confidence,
        }),
      );
    }

    const unresolvedConflictCount = resolved.filter(
      (conflict) =>
        conflict.resolution === "UNRESOLVED" ||
        conflict.resolution === "DEFER",
    ).length;
    const escalatedConflictCount = resolved.filter(
      (conflict) =>
        conflict.resolution === "ESCALATE",
    ).length;

    this.lastSnapshotValue = deepFreeze({
      detectedConflictCount: conflicts.length,
      resolvedConflictCount:
        resolved.length - unresolvedConflictCount,
      unresolvedConflictCount,
      escalatedConflictCount,
      lastDetectedAtMs:
        this.lastSnapshotValue.lastDetectedAtMs,
      lastResolvedAtMs: resolvedAtMs,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          resolutions: resolved.map((conflict) => ({
            conflictId: conflict.conflictId,
            resolution: conflict.resolution,
            selectedProposalId:
              conflict.selectedProposalId,
            restrictions: conflict.restrictions,
            confidence: conflict.confidence,
          })),
          resolvedAtMs,
        }),
    });

    return Object.freeze(resolved);
  }
}

export function createMultiAgentConflictResolver(
  options: MultiAgentConflictResolverOptions = {},
): MultiAgentConflictResolver {
  return new MultiAgentConflictResolver(options);
}

function detectActionConflicts(
  proposals: readonly MultiAgentProposal[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    const leftActions = new Set(
      left.actions.map(actionIdentity),
    );
    const rightActions = new Set(
      right.actions.map(actionIdentity),
    );

    if (
      leftActions.size > 0 &&
      rightActions.size > 0 &&
      !setsEqual(leftActions, rightActions)
    ) {
      candidates.push({
        type: "ACTION_CONFLICT",
        proposalIds: sortedProposalIds(left, right),
        agentIds: sortedAgentIds(left, right),
        description:
          `Proposals "${left.title}" and "${right.title}" prescribe incompatible action sets.`,
        severity: "HIGH",
        evidence: mergeEvidence(left, right),
      });
    }
  });

  return candidates;
}

function detectDirectionConflicts(
  proposals: readonly MultiAgentProposal[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    for (const leftAction of left.actions) {
      for (const rightAction of right.actions) {
        if (
          sameActionTarget(leftAction, rightAction) &&
          leftAction.side !== undefined &&
          rightAction.side !== undefined &&
          leftAction.side !== "NEUTRAL" &&
          rightAction.side !== "NEUTRAL" &&
          leftAction.side !== rightAction.side
        ) {
          candidates.push({
            type: "DIRECTION_CONFLICT",
            proposalIds: sortedProposalIds(left, right),
            agentIds: sortedAgentIds(left, right),
            description:
              `Proposals "${left.title}" and "${right.title}" take opposite directions on the same target.`,
            severity: "CRITICAL",
            evidence: mergeEvidence(left, right),
          });
          return;
        }
      }
    }
  });

  return candidates;
}

function detectRiskConflicts(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
  riskThreshold: number,
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  for (const proposal of proposals) {
    const severeRisks = proposal.risks.filter(
      (risk) =>
        SEVERITY_ORDER[risk.severity] >=
          SEVERITY_ORDER.HIGH ||
        risk.probability * risk.impact >= riskThreshold,
    );
    const supportiveReviews = reviews.filter(
      (review) =>
        review.proposalId === proposal.proposalId &&
        SUPPORTING_REVIEW_DECISIONS.includes(
          review.decision as
            (typeof SUPPORTING_REVIEW_DECISIONS)[number],
        ),
    );

    if (
      severeRisks.length > 0 &&
      supportiveReviews.length > 0
    ) {
      candidates.push({
        type: "RISK_CONFLICT",
        proposalIds: Object.freeze([
          proposal.proposalId,
        ]),
        agentIds: Object.freeze(
          [
            proposal.proposedByAgentId,
            ...supportiveReviews.map(
              (review) => review.reviewerAgentId,
            ),
          ]
            .filter(unique)
            .sort(),
        ),
        description:
          `Proposal "${proposal.title}" is supported despite ${severeRisks.length} high-severity risk finding(s).`,
        severity: maximumSeverity(
          severeRisks.map((risk) => risk.severity),
        ),
        evidence: Object.freeze(
          proposal.evidence.filter((evidence) =>
            severeRisks.some((risk) =>
              risk.evidenceIds.includes(
                evidence.evidenceId,
              ),
            ),
          ),
        ),
      });
    }
  }

  return candidates;
}

function detectCapitalConflicts(
  proposals: readonly MultiAgentProposal[],
  differenceThreshold: number,
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    const leftCapital = totalCapital(left);
    const rightCapital = totalCapital(right);
    const denominator = Math.max(
      Math.abs(leftCapital),
      Math.abs(rightCapital),
      1,
    );
    const difference =
      Math.abs(leftCapital - rightCapital) / denominator;

    if (
      leftCapital > 0 &&
      rightCapital > 0 &&
      difference >= differenceThreshold
    ) {
      candidates.push({
        type: "CAPITAL_CONFLICT",
        proposalIds: sortedProposalIds(left, right),
        agentIds: sortedAgentIds(left, right),
        description:
          `Proposals "${left.title}" and "${right.title}" differ materially in capital allocation.`,
        severity:
          difference >= 0.75 ? "HIGH" : "MODERATE",
        evidence: mergeEvidence(left, right),
      });
    }
  });

  return candidates;
}

function detectStrategyConflicts(
  proposals: readonly MultiAgentProposal[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    const leftStrategies = new Set(
      left.actions
        .map((action) => action.strategyId)
        .filter(isDefined),
    );
    const rightStrategies = new Set(
      right.actions
        .map((action) => action.strategyId)
        .filter(isDefined),
    );

    if (
      leftStrategies.size > 0 &&
      rightStrategies.size > 0 &&
      intersectionSize(
        leftStrategies,
        rightStrategies,
      ) === 0
    ) {
      candidates.push({
        type: "STRATEGY_CONFLICT",
        proposalIds: sortedProposalIds(left, right),
        agentIds: sortedAgentIds(left, right),
        description:
          `Proposals "${left.title}" and "${right.title}" select mutually exclusive strategy sets.`,
        severity: "MODERATE",
        evidence: mergeEvidence(left, right),
      });
    }
  });

  return candidates;
}

function detectArbitrageConflicts(
  proposals: readonly MultiAgentProposal[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    const leftIds = new Set(
      left.actions
        .map(
          (action) => action.arbitrageDecisionId,
        )
        .filter(isDefined),
    );
    const rightIds = new Set(
      right.actions
        .map(
          (action) => action.arbitrageDecisionId,
        )
        .filter(isDefined),
    );

    if (
      leftIds.size > 0 &&
      rightIds.size > 0 &&
      intersectionSize(leftIds, rightIds) === 0
    ) {
      candidates.push({
        type: "ARBITRAGE_CONFLICT",
        proposalIds: sortedProposalIds(left, right),
        agentIds: sortedAgentIds(left, right),
        description:
          `Proposals "${left.title}" and "${right.title}" rely on different arbitrage decisions.`,
        severity: "HIGH",
        evidence: mergeEvidence(left, right),
      });
    }
  });

  return candidates;
}

function detectExecutionConflicts(
  proposals: readonly MultiAgentProposal[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    for (const leftAction of left.actions) {
      for (const rightAction of right.actions) {
        if (
          sameActionTarget(leftAction, rightAction) &&
          leftAction.executionMode !== undefined &&
          rightAction.executionMode !== undefined &&
          leftAction.executionMode !==
            rightAction.executionMode
        ) {
          candidates.push({
            type: "EXECUTION_CONFLICT",
            proposalIds: sortedProposalIds(left, right),
            agentIds: sortedAgentIds(left, right),
            description:
              `Proposals "${left.title}" and "${right.title}" require incompatible execution modes.`,
            severity: "HIGH",
            evidence: mergeEvidence(left, right),
          });
          return;
        }
      }
    }
  });

  return candidates;
}

function detectGovernanceConflicts(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  for (const proposal of proposals) {
    const vetoes = reviews.filter(
      (review) =>
        review.proposalId === proposal.proposalId &&
        review.decision === "VETO",
    );

    if (vetoes.length > 0) {
      candidates.push({
        type: "GOVERNANCE_CONFLICT",
        proposalIds: Object.freeze([
          proposal.proposalId,
        ]),
        agentIds: Object.freeze(
          [
            proposal.proposedByAgentId,
            ...vetoes.map(
              (review) => review.reviewerAgentId,
            ),
          ]
            .filter(unique)
            .sort(),
        ),
        description:
          `Proposal "${proposal.title}" has received ${vetoes.length} governance veto(es).`,
        severity: "CRITICAL",
        evidence: Object.freeze(
          vetoes.flatMap(
            (review) => review.supportingEvidence,
          ),
        ),
      });
    }
  }

  return candidates;
}

function detectEvidenceConflicts(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  for (const proposal of proposals) {
    const support = proposal.evidence.filter(
      (evidence) =>
        evidence.direction === "SUPPORTING",
    );
    const opposition = proposal.evidence.filter(
      (evidence) =>
        evidence.direction === "OPPOSING",
    );

    if (support.length > 0 && opposition.length > 0) {
      candidates.push({
        type: "EVIDENCE_CONFLICT",
        proposalIds: Object.freeze([
          proposal.proposalId,
        ]),
        agentIds: Object.freeze(
          [
            proposal.proposedByAgentId,
            ...reviews
              .filter(
                (review) =>
                  review.proposalId ===
                  proposal.proposalId,
              )
              .map(
                (review) =>
                  review.reviewerAgentId,
              ),
          ]
            .filter(unique)
            .sort(),
        ),
        description:
          `Proposal "${proposal.title}" contains both supporting and opposing evidence.`,
        severity: evidenceConflictSeverity(
          support,
          opposition,
        ),
        evidence: Object.freeze([
          ...support,
          ...opposition,
        ]),
      });
    }
  }

  return candidates;
}

function detectTimingConflicts(
  proposals: readonly MultiAgentProposal[],
  thresholdMs: number,
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  forEachProposalPair(proposals, (left, right) => {
    if (
      left.validUntilMs !== undefined &&
      right.validUntilMs !== undefined &&
      Math.abs(
        left.validUntilMs - right.validUntilMs,
      ) >= thresholdMs
    ) {
      candidates.push({
        type: "TIMING_CONFLICT",
        proposalIds: sortedProposalIds(left, right),
        agentIds: sortedAgentIds(left, right),
        description:
          `Proposals "${left.title}" and "${right.title}" have materially different validity windows.`,
        severity: "MODERATE",
        evidence: mergeEvidence(left, right),
      });
    }
  });

  return candidates;
}

function detectAuthorityConflicts(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  for (const proposal of proposals) {
    const reviewerIds = new Set(
      reviews
        .filter(
          (review) =>
            review.proposalId === proposal.proposalId,
        )
        .map(
          (review) => review.reviewerAgentId,
        ),
    );

    if (
      reviewerIds.has(proposal.proposedByAgentId)
    ) {
      candidates.push({
        type: "AUTHORITY_CONFLICT",
        proposalIds: Object.freeze([
          proposal.proposalId,
        ]),
        agentIds: Object.freeze([
          proposal.proposedByAgentId,
        ]),
        description:
          `Proposal "${proposal.title}" includes a self-review authority conflict.`,
        severity: "HIGH",
        evidence: proposal.evidence,
      });
    }
  }

  return candidates;
}

function detectPolicyConflicts(
  proposals: readonly MultiAgentProposal[],
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  for (const proposal of proposals) {
    const failedHardConstraints =
      proposal.constraints.filter(
        (constraint) =>
          constraint.hard && !constraint.satisfied,
      );

    if (failedHardConstraints.length > 0) {
      candidates.push({
        type: "POLICY_CONFLICT",
        proposalIds: Object.freeze([
          proposal.proposalId,
        ]),
        agentIds: Object.freeze([
          proposal.proposedByAgentId,
        ]),
        description:
          `Proposal "${proposal.title}" violates ${failedHardConstraints.length} hard policy constraint(s).`,
        severity: "CRITICAL",
        evidence: proposal.evidence,
      });
    }
  }

  return candidates;
}

function chooseResolution(
  conflict: MultiAgentConflict,
  proposals: readonly MultiAgentProposal[],
  debate: MultiAgentDebateTranscript | undefined,
  arbiters: readonly MultiAgentRegistration[],
  options: NormalizedOptions,
): ResolutionDecision {
  const arbiter = arbiters[0];
  const debateConverged =
    debate?.converged ?? false;
  const debateConfidence =
    debate?.convergenceScore ?? 0;
  const rankedProposals = [...proposals].sort(
    compareProposalStrength,
  );
  const primary = rankedProposals[0];
  const secondary = rankedProposals[1];

  if (
    conflict.severity === "CRITICAL" &&
    options.automaticallyEscalateCritical
  ) {
    if (
      options.requireArbiterForEscalation &&
      arbiter === undefined
    ) {
      throw new MultiAgentConflictResolverError(
        "NO_ARBITER_AVAILABLE",
        `Critical conflict "${conflict.conflictId}" requires an arbiter.`,
        { conflictId: conflict.conflictId },
      );
    }

    return {
      resolution: "ESCALATE",
      restrictions: Object.freeze([
        "Block execution until operator or authorized arbiter approval.",
      ]),
      rationale:
        "Critical conflict requires explicit escalation before execution.",
      resolvedByAgentId:
        arbiter?.identity.agentId,
      confidence: clamp01(
        Math.max(0.75, debateConfidence),
      ) as MultiAgentConfidence,
    };
  }

  switch (conflict.type) {
    case "DIRECTION_CONFLICT":
    case "ACTION_CONFLICT":
    case "STRATEGY_CONFLICT":
    case "ARBITRAGE_CONFLICT":
      if (
        primary !== undefined &&
        proposalStrength(primary) -
          proposalStrength(secondary) >=
          0.15
      ) {
        return selectPrimary(
          primary,
          arbiter,
          debateConfidence,
          conflict,
        );
      }

      return {
        resolution:
          debateConverged
            ? "APPLY_RESTRICTIONS"
            : "DEFER",
        restrictions: Object.freeze([
          "Do not execute mutually exclusive actions concurrently.",
          "Re-evaluate after additional evidence or consensus.",
        ]),
        rationale:
          debateConverged
            ? "The debate converged but proposal separation was insufficient; execution restrictions are required."
            : "No proposal achieved a decisive deterministic advantage.",
        resolvedByAgentId:
          arbiter?.identity.agentId,
        confidence: clamp01(
          Math.max(0.5, debateConfidence),
        ) as MultiAgentConfidence,
      };

    case "RISK_CONFLICT":
    case "EXECUTION_CONFLICT":
    case "CAPITAL_CONFLICT":
      if (primary === undefined) {
        return unresolvedDecision(
          conflict,
          arbiter,
        );
      }

      return {
        resolution: "REDUCE_SCOPE",
        selectedProposalId:
          primary.proposalId,
        restrictions: Object.freeze(
          buildRiskRestrictions(
            conflict,
            primary,
          ),
        ),
        rationale:
          "The strongest proposal may proceed only with reduced scope and explicit risk controls.",
        resolvedByAgentId:
          arbiter?.identity.agentId,
        confidence: clamp01(
          proposalStrength(primary) * 0.7 +
            debateConfidence * 0.3,
        ) as MultiAgentConfidence,
      };

    case "GOVERNANCE_CONFLICT":
    case "POLICY_CONFLICT":
    case "AUTHORITY_CONFLICT":
      return {
        resolution: "REJECT_ALL",
        restrictions: Object.freeze([
          "Execution is prohibited for the affected proposal set.",
        ]),
        rationale:
          "Governance, policy, or authority violations cannot be resolved through utility ranking alone.",
        resolvedByAgentId:
          arbiter?.identity.agentId,
        confidence: 0.95 as MultiAgentConfidence,
      };

    case "EVIDENCE_CONFLICT":
      return {
        resolution:
          debateConverged &&
          primary !== undefined
            ? "SELECT_PRIMARY"
            : "DEFER",
        selectedProposalId:
          debateConverged
            ? primary?.proposalId
            : undefined,
        restrictions: Object.freeze(
          debateConverged
            ? [
                "Preserve dissenting evidence in the final decision record.",
              ]
            : [
                "Collect additional independent evidence before execution.",
              ],
        ),
        rationale:
          debateConverged
            ? "The debate resolved the evidentiary conflict sufficiently to select the strongest proposal."
            : "Contradictory evidence remains unresolved.",
        resolvedByAgentId:
          arbiter?.identity.agentId,
        confidence: clamp01(
          Math.max(
            0.4,
            debateConfidence,
          ),
        ) as MultiAgentConfidence,
      };

    case "TIMING_CONFLICT":
      return {
        resolution: "APPLY_RESTRICTIONS",
        selectedProposalId:
          primary?.proposalId,
        restrictions: Object.freeze([
          "Use the earliest valid-until timestamp.",
          "Cancel execution when the selected proposal expires.",
        ]),
        rationale:
          "The conflict is resolved by applying the strictest timing window.",
        resolvedByAgentId:
          arbiter?.identity.agentId,
        confidence: 0.85 as MultiAgentConfidence,
      };
  }
}

function selectPrimary(
  primary: MultiAgentProposal,
  arbiter: MultiAgentRegistration | undefined,
  debateConfidence: number,
  conflict: MultiAgentConflict,
): ResolutionDecision {
  return {
    resolution: "SELECT_PRIMARY",
    selectedProposalId: primary.proposalId,
    restrictions: Object.freeze(
      conflict.severity === "HIGH" ||
        conflict.severity === "CRITICAL"
        ? [
            "Preserve dissent and conflict evidence.",
            "Require pre-execution risk validation.",
          ]
        : [],
    ),
    rationale:
      `Proposal "${primary.title}" has the highest deterministic strength score.`,
    resolvedByAgentId:
      arbiter?.identity.agentId,
    confidence: clamp01(
      proposalStrength(primary) * 0.8 +
        debateConfidence * 0.2,
    ) as MultiAgentConfidence,
  };
}

function unresolvedDecision(
  conflict: MultiAgentConflict,
  arbiter: MultiAgentRegistration | undefined,
): ResolutionDecision {
  return {
    resolution: "UNRESOLVED",
    restrictions: Object.freeze([
      "Block execution pending conflict resolution.",
    ]),
    rationale:
      `Conflict "${conflict.conflictId}" could not be resolved from the available proposals.`,
    resolvedByAgentId:
      arbiter?.identity.agentId,
    confidence: 0 as MultiAgentConfidence,
  };
}

function buildRiskRestrictions(
  conflict: MultiAgentConflict,
  proposal: MultiAgentProposal,
): string[] {
  const restrictions = [
    "Reduce requested notional, quantity, or target weight.",
    "Require a fresh risk validation immediately before execution.",
  ];

  if (
    conflict.type === "CAPITAL_CONFLICT"
  ) {
    restrictions.push(
      "Apply the lower capital allocation across conflicting proposals.",
    );
  }

  if (
    conflict.type === "EXECUTION_CONFLICT"
  ) {
    restrictions.push(
      "Use the least autonomous compatible execution mode.",
    );
  }

  if (
    proposal.risks.some(
      (risk) =>
        risk.severity === "CRITICAL" ||
        risk.severity === "HIGH",
    )
  ) {
    restrictions.push(
      "Require explicit mitigation for every high-severity risk.",
    );
  }

  return [...new Set(restrictions)].sort();
}

function materializeConflict(
  candidate: ConflictCandidate,
  detectedAtMs: MultiAgentTimestamp,
  options: NormalizedOptions,
): MultiAgentConflict {
  const proposalIds = Object.freeze(
    [...candidate.proposalIds].sort(),
  );
  const agentIds = Object.freeze(
    [...candidate.agentIds].sort(),
  );
  const evidence = Object.freeze(
    deduplicateEvidence(candidate.evidence),
  );
  const conflictId = options.conflictIdFactory(
    "conflict",
    options.fingerprintFactory({
      type: candidate.type,
      proposalIds,
      agentIds,
      description: candidate.description,
      severity: candidate.severity,
      evidenceIds: evidence.map(
        (item) => item.evidenceId,
      ),
      detectedAtMs,
    }),
  );

  return deepFreeze({
    conflictId,
    type: candidate.type,
    proposalIds,
    agentIds,
    description: candidate.description,
    severity: candidate.severity,
    evidence,
    detectedAtMs,
  });
}

function validateDetectionInput(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
): void {
  if (
    !Array.isArray(proposals) ||
    !Array.isArray(reviews)
  ) {
    throw new MultiAgentConflictResolverError(
      "INVALID_CONFLICT_INPUT",
      "proposals and reviews must be arrays.",
    );
  }

  const proposalIds = new Set(
    proposals.map(
      (proposal) => proposal.proposalId,
    ),
  );

  for (const review of reviews) {
    if (!proposalIds.has(review.proposalId)) {
      throw new MultiAgentConflictResolverError(
        "UNKNOWN_CONFLICT_PROPOSAL",
        `Review "${review.reviewId}" references unknown proposal "${review.proposalId}".`,
        {
          proposalId: review.proposalId,
          agentId: review.reviewerAgentId,
        },
      );
    }
  }
}

function validateResolutionInput(
  conflicts: readonly MultiAgentConflict[],
  proposals: readonly MultiAgentProposal[],
  agents: readonly MultiAgentRegistration[],
): void {
  if (
    !Array.isArray(conflicts) ||
    !Array.isArray(proposals) ||
    !Array.isArray(agents)
  ) {
    throw new MultiAgentConflictResolverError(
      "INVALID_CONFLICT_INPUT",
      "conflicts, proposals, and agents must be arrays.",
    );
  }

  const conflictIds =
    new Set<MultiAgentConflictId>();

  for (const conflict of conflicts) {
    if (conflictIds.has(conflict.conflictId)) {
      throw new MultiAgentConflictResolverError(
        "DUPLICATE_CONFLICT_ID",
        `Duplicate conflict id "${conflict.conflictId}".`,
        { conflictId: conflict.conflictId },
      );
    }

    conflictIds.add(conflict.conflictId);
  }
}

function selectArbiters(
  agents: readonly MultiAgentRegistration[],
): readonly MultiAgentRegistration[] {
  return Object.freeze(
    agents
      .filter(
        (agent) =>
          agent.authority.mayArbitrate &&
          agent.capabilities.some(
            (capability) =>
              capability.enabled &&
              capability.capability ===
                "ARBITRATE_CONFLICT",
          ),
      )
      .sort((left, right) => {
        const leftScore = arbitrationScore(left);
        const rightScore = arbitrationScore(right);

        return leftScore !== rightScore
          ? rightScore - leftScore
          : left.identity.agentId.localeCompare(
              right.identity.agentId,
            );
      }),
  );
}

function arbitrationScore(
  agent: MultiAgentRegistration,
): number {
  const capability = agent.capabilities.find(
    (item) =>
      item.enabled &&
      item.capability === "ARBITRATE_CONFLICT",
  );

  return clamp01(
    (capability?.proficiency ?? 0) * 0.8 +
      (agent.identity.role ===
      "CONFLICT_ARBITER_AGENT"
        ? 0.2
        : 0),
  );
}

function proposalStrength(
  proposal: MultiAgentProposal | undefined,
): number {
  if (proposal === undefined) {
    return 0;
  }

  const failedHardConstraints =
    proposal.constraints.filter(
      (constraint) =>
        constraint.hard &&
        !constraint.satisfied,
    ).length;
  const severeRiskPenalty =
    proposal.risks.reduce(
      (sum, risk) =>
        sum +
        severityWeight(risk.severity) *
          risk.probability *
          risk.impact,
      0,
    ) /
    Math.max(1, proposal.risks.length);

  return clamp01(
    proposal.expectedUtility.totalUtility * 0.45 +
      proposal.confidence * 0.3 +
      averageEvidenceQuality(
        proposal.evidence,
      ) *
        0.25 -
      failedHardConstraints * 0.25 -
      severeRiskPenalty * 0.2,
  );
}

function compareProposalStrength(
  left: MultiAgentProposal,
  right: MultiAgentProposal,
): number {
  const difference =
    proposalStrength(right) -
    proposalStrength(left);

  return difference !== 0
    ? difference
    : left.proposalId.localeCompare(
        right.proposalId,
      );
}

function averageEvidenceQuality(
  evidence: readonly MultiAgentEvidence[],
): number {
  if (evidence.length === 0) {
    return 0;
  }

  return clamp01(
    evidence.reduce(
      (sum, item) =>
        sum +
        item.weight *
          item.confidence *
          item.reliability,
      0,
    ) / evidence.length,
  );
}

function evidenceConflictSeverity(
  supporting: readonly MultiAgentEvidence[],
  opposing: readonly MultiAgentEvidence[],
): MultiAgentRiskSeverity {
  const supportStrength =
    averageEvidenceQuality(supporting);
  const oppositionStrength =
    averageEvidenceQuality(opposing);
  const closeness =
    1 -
    Math.abs(
      supportStrength - oppositionStrength,
    );

  return closeness >= 0.8
    ? "HIGH"
    : closeness >= 0.5
      ? "MODERATE"
      : "LOW";
}

function totalCapital(
  proposal: MultiAgentProposal,
): number {
  return proposal.actions.reduce(
    (sum, action) =>
      sum +
      Math.abs(
        action.notional ??
          action.quantity ??
          action.targetWeight ??
          0,
      ),
    0,
  );
}

function actionIdentity(
  action: MultiAgentProposal["actions"][number],
): string {
  return canonicalStringify({
    type: action.type,
    market: action.market ?? null,
    strategyId: action.strategyId ?? null,
    portfolioId: action.portfolioId ?? null,
    arbitrageDecisionId:
      action.arbitrageDecisionId ?? null,
    side: action.side ?? null,
  });
}

function sameActionTarget(
  left: MultiAgentProposal["actions"][number],
  right: MultiAgentProposal["actions"][number],
): boolean {
  return (
    canonicalStringify(left.market ?? null) ===
      canonicalStringify(right.market ?? null) &&
    (left.strategyId ?? null) ===
      (right.strategyId ?? null) &&
    (left.portfolioId ?? null) ===
      (right.portfolioId ?? null) &&
    (left.arbitrageDecisionId ?? null) ===
      (right.arbitrageDecisionId ?? null)
  );
}

function mergeEvidence(
  ...proposals: readonly MultiAgentProposal[]
): readonly MultiAgentEvidence[] {
  return Object.freeze(
    deduplicateEvidence(
      proposals.flatMap(
        (proposal) => proposal.evidence,
      ),
    ),
  );
}

function deduplicateEvidence(
  evidence: readonly MultiAgentEvidence[],
): MultiAgentEvidence[] {
  const byId = new Map(
    evidence.map(
      (item) =>
        [item.evidenceId, item] as const,
    ),
  );

  return [...byId.values()].sort((left, right) =>
    left.evidenceId.localeCompare(
      right.evidenceId,
    ),
  );
}

function deduplicateCandidates(
  candidates: readonly ConflictCandidate[],
): ConflictCandidate[] {
  const byKey = new Map<string, ConflictCandidate>();

  for (const candidate of candidates) {
    const key = canonicalStringify({
      type: candidate.type,
      proposalIds: [...candidate.proposalIds].sort(),
      agentIds: [...candidate.agentIds].sort(),
      description: candidate.description,
    });
    const existing = byKey.get(key);

    if (
      existing === undefined ||
      severityWeight(candidate.severity) >
        severityWeight(existing.severity)
    ) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].sort(
    compareCandidates,
  );
}

function compareCandidates(
  left: ConflictCandidate,
  right: ConflictCandidate,
): number {
  const typeDifference =
    left.type.localeCompare(right.type);

  if (typeDifference !== 0) {
    return typeDifference;
  }

  return left.proposalIds
    .join("|")
    .localeCompare(
      right.proposalIds.join("|"),
    );
}

function compareConflicts(
  left: MultiAgentConflict,
  right: MultiAgentConflict,
): number {
  const severityDifference =
    severityWeight(right.severity) -
    severityWeight(left.severity);

  return severityDifference !== 0
    ? severityDifference
    : left.conflictId.localeCompare(
        right.conflictId,
      );
}

function forEachProposalPair(
  proposals: readonly MultiAgentProposal[],
  callback: (
    left: MultiAgentProposal,
    right: MultiAgentProposal,
  ) => void,
): void {
  const ordered = [...proposals].sort(
    (left, right) =>
      left.proposalId.localeCompare(
        right.proposalId,
      ),
  );

  for (
    let leftIndex = 0;
    leftIndex < ordered.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < ordered.length;
      rightIndex += 1
    ) {
      callback(
        ordered[leftIndex]!,
        ordered[rightIndex]!,
      );
    }
  }
}

function sortedProposalIds(
  left: MultiAgentProposal,
  right: MultiAgentProposal,
): readonly MultiAgentProposalId[] {
  return Object.freeze(
    [left.proposalId, right.proposalId].sort(),
  );
}

function sortedAgentIds(
  left: MultiAgentProposal,
  right: MultiAgentProposal,
): readonly MultiAgentId[] {
  return Object.freeze(
    [
      left.proposedByAgentId,
      right.proposedByAgentId,
    ]
      .filter(unique)
      .sort(),
  );
}

function maximumSeverity(
  severities: readonly MultiAgentRiskSeverity[],
): MultiAgentRiskSeverity {
  return (
    [...severities].sort(
      (left, right) =>
        severityWeight(right) -
        severityWeight(left),
    )[0] ?? "INFORMATIONAL"
  );
}

function severityWeight(
  severity: MultiAgentRiskSeverity,
): number {
  return SEVERITY_ORDER[severity] / 4;
}

function setsEqual<TValue>(
  left: ReadonlySet<TValue>,
  right: ReadonlySet<TValue>,
): boolean {
  return (
    left.size === right.size &&
    [...left].every((item) => right.has(item))
  );
}

function intersectionSize<TValue>(
  left: ReadonlySet<TValue>,
  right: ReadonlySet<TValue>,
): number {
  let count = 0;

  for (const item of left) {
    if (right.has(item)) {
      count += 1;
    }
  }

  return count;
}

function unique<TValue>(
  value: TValue,
  index: number,
  values: readonly TValue[],
): boolean {
  return values.indexOf(value) === index;
}

function isDefined<TValue>(
  value: TValue | undefined,
): value is TValue {
  return value !== undefined;
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function normalizeOptions(
  options: MultiAgentConflictResolverOptions,
): NormalizedOptions {
  const highSeverityRiskThreshold =
    options.highSeverityRiskThreshold ?? 0.6;
  const capitalDifferenceThreshold =
    options.capitalDifferenceThreshold ?? 0.25;
  const timingDifferenceThresholdMs =
    options.timingDifferenceThresholdMs ??
    60_000;

  validateUnitInterval(
    highSeverityRiskThreshold,
    "highSeverityRiskThreshold",
  );
  validateUnitInterval(
    capitalDifferenceThreshold,
    "capitalDifferenceThreshold",
  );

  if (
    !Number.isFinite(
      timingDifferenceThresholdMs,
    ) ||
    timingDifferenceThresholdMs < 0
  ) {
    throw new RangeError(
      "timingDifferenceThresholdMs must be a non-negative finite number.",
    );
  }

  return Object.freeze({
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    conflictIdFactory:
      options.conflictIdFactory ??
      defaultConflictIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
    highSeverityRiskThreshold,
    capitalDifferenceThreshold,
    timingDifferenceThresholdMs,
    automaticallyEscalateCritical:
      options.automaticallyEscalateCritical ??
      true,
    requireArbiterForEscalation:
      options.requireArbiterForEscalation ??
      false,
  });
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
    throw new RangeError(
      `${name} must be between 0 and 1.`,
    );
  }
}

function defaultConflictIdFactory(
  prefix: string,
  seed: string,
): MultiAgentConflictId {
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

  return hash
    .toString(16)
    .padStart(16, "0");
}

function canonicalStringify(
  value: unknown,
): string {
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
        "Cannot canonicalize a non-finite number.",
      );
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      canonicalize(item),
    );
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
    `Unsupported canonical value type: ${typeof value}.`,
  );
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