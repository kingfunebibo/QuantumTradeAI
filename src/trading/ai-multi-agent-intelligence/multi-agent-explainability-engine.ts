/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-explainability-engine.ts
 *
 * Deterministic, immutable, audience-aware explanation generation for collective
 * multi-agent decisions.
 */

import {
  type MultiAgentAgentContribution,
  type MultiAgentCollectiveDecision,
  type MultiAgentDecisionExplanation,
  type MultiAgentDebateTranscript,
  type MultiAgentEvidence,
  type MultiAgentEvidenceDirection,
  type MultiAgentExplainabilityEnginePort,
  type MultiAgentExplainabilityPolicy,
  type MultiAgentExplanationAudience,
  type MultiAgentExplanationFactor,
  type MultiAgentId,
  type MultiAgentKnowledgeId,
  type MultiAgentObservation,
  type MultiAgentPeerReview,
  type MultiAgentProposal,
  type MultiAgentRegistration,
  type MultiAgentRole,
  type MultiAgentRunRequest,
  type MultiAgentScore,
  type MultiAgentTimestamp,
  type MultiAgentVersion,
} from "./ai-multi-agent-contracts";

export type MultiAgentExplainabilityEngineErrorCode =
  | "INVALID_EXPLAINABILITY_INPUT"
  | "INVALID_EXPLAINABILITY_POLICY"
  | "DECISION_REQUEST_MISMATCH"
  | "SELECTED_PROPOSAL_NOT_FOUND"
  | "EXPLANATION_GENERATION_FAILED";

export interface MultiAgentExplainabilityEngineErrorDetails {
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly proposalId?: string;
  readonly agentId?: MultiAgentId;
  readonly cause?: unknown;
}

export class MultiAgentExplainabilityEngineError extends Error {
  public readonly code: MultiAgentExplainabilityEngineErrorCode;
  public readonly details: MultiAgentExplainabilityEngineErrorDetails;

  public constructor(
    code: MultiAgentExplainabilityEngineErrorCode,
    message: string,
    details: MultiAgentExplainabilityEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentExplainabilityEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentExplainabilityClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentExplainabilityEngineOptions {
  readonly clock?: MultiAgentExplainabilityClock;
  readonly explanationIdFactory?: (
    prefix: string,
    seed: string,
  ) => string;
  readonly fingerprintFactory?: (value: unknown) => string;
  readonly modelVersion?: MultiAgentVersion;
  readonly minimumFactorImportance?: MultiAgentScore;
  readonly includeObservationEvidence?: boolean;
  readonly includeReviewEvidence?: boolean;
  readonly includeRiskFactors?: boolean;
}

export interface MultiAgentExplainabilitySnapshot {
  readonly explanationId?: string;
  readonly decisionId?: string;
  readonly audience?: MultiAgentExplanationAudience;
  readonly primaryFactorCount: number;
  readonly opposingFactorCount: number;
  readonly uncertaintyFactorCount: number;
  readonly agentContributionCount: number;
  readonly alternativeCount: number;
  readonly limitationCount: number;
  readonly generatedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentExplainabilityResult {
  readonly agents: readonly MultiAgentRegistration[];
  readonly observations: readonly MultiAgentObservation[];
  readonly proposals: readonly MultiAgentProposal[];
  readonly reviews: readonly MultiAgentPeerReview[];
  readonly debate?: MultiAgentDebateTranscript;
  readonly consensus: MultiAgentCollectiveDecision["consensus"];
  readonly decision: MultiAgentCollectiveDecision;
}

interface NormalizedOptions {
  readonly clock: MultiAgentExplainabilityClock;
  readonly explanationIdFactory: (
    prefix: string,
    seed: string,
  ) => string;
  readonly fingerprintFactory: (value: unknown) => string;
  readonly modelVersion: MultiAgentVersion;
  readonly minimumFactorImportance: MultiAgentScore;
  readonly includeObservationEvidence: boolean;
  readonly includeReviewEvidence: boolean;
  readonly includeRiskFactors: boolean;
}

interface FactorCandidate {
  readonly key: string;
  readonly name: string;
  readonly direction: MultiAgentEvidenceDirection;
  readonly importance: number;
  readonly contribution: number;
  readonly agentIds: readonly MultiAgentId[];
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
  readonly explanation: string;
}

const DEFAULT_MODEL_VERSION = "multi-agent-explainability-v1";
const EMPTY_FINGERPRINT = stableFingerprint({
  type: "MULTI_AGENT_EXPLAINABILITY_SNAPSHOT",
  state: "EMPTY",
});

const SYSTEM_CLOCK: MultiAgentExplainabilityClock = Object.freeze({
  now: (): MultiAgentTimestamp => Date.now() as MultiAgentTimestamp,
});

export class MultiAgentExplainabilityEngine
  implements MultiAgentExplainabilityEnginePort
{
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentExplainabilitySnapshot;

  public constructor(
    options: MultiAgentExplainabilityEngineOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      primaryFactorCount: 0,
      opposingFactorCount: 0,
      uncertaintyFactorCount: 0,
      agentContributionCount: 0,
      alternativeCount: 0,
      limitationCount: 0,
      deterministicFingerprint: EMPTY_FINGERPRINT,
    });
  }

  public explain(
    request: MultiAgentRunRequest,
    result: MultiAgentExplainabilityResult,
    policy: MultiAgentExplainabilityPolicy,
  ): MultiAgentDecisionExplanation {
    try {
      validateRequest(request);
      validateResult(result);
      validatePolicy(policy);
      validateConsistency(request, result);

      const generatedAtMs = this.options.clock.now();
      const selectedProposal = resolveSelectedProposal(result);

      if (
        result.consensus.selectedProposalId !== undefined &&
        selectedProposal === undefined
      ) {
        throw new MultiAgentExplainabilityEngineError(
          "SELECTED_PROPOSAL_NOT_FOUND",
          "The consensus-selected proposal is not present in the explanation input.",
          {
            requestId: request.requestId,
            decisionId: result.decision.decisionId,
            proposalId: result.consensus.selectedProposalId,
          },
        );
      }

      const candidates = policy.enabled
        ? collectFactorCandidates(
            result,
            selectedProposal,
            this.options,
          )
        : [];

      const primaryFactors = policy.enabled
        ? materializeFactors(
            candidates.filter((candidate) =>
              isPrimaryDirection(candidate.direction),
            ),
            policy.maximumPrimaryFactors,
            this.options.minimumFactorImportance,
          )
        : Object.freeze([]);

      const opposingFactors = policy.enabled
        ? materializeFactors(
            candidates.filter((candidate) =>
              isOpposingDirection(candidate.direction),
            ),
            policy.maximumOpposingFactors,
            this.options.minimumFactorImportance,
          )
        : Object.freeze([]);

      const uncertaintyFactors = policy.enabled
        ? materializeFactors(
            candidates.filter((candidate) =>
              isUncertaintyDirection(candidate.direction),
            ),
            policy.maximumUncertaintyFactors,
            this.options.minimumFactorImportance,
          )
        : Object.freeze([]);

      const agentContributions =
        policy.enabled && policy.includeAgentContributions
          ? buildAgentContributions(result, selectedProposal)
          : Object.freeze([]);

      const alternativesConsidered =
        policy.enabled && policy.includeAlternatives
          ? buildAlternatives(result.proposals, selectedProposal)
          : Object.freeze([]);

      const limitations =
        policy.enabled && policy.includeLimitations
          ? buildLimitations(result, selectedProposal)
          : Object.freeze([]);

      const dissentNarrative =
        policy.enabled &&
        policy.includeDissent &&
        result.consensus.dissent.length > 0
          ? buildDissentNarrative(result)
          : undefined;

      const explanationSeed = stableSerialize({
        requestId: request.requestId,
        decisionId: result.decision.decisionId,
        audience: policy.audience,
        decisionFingerprint:
          result.decision.deterministicFingerprint,
        consensusFingerprint:
          result.consensus.deterministicFingerprint,
        primaryFactors,
        opposingFactors,
        uncertaintyFactors,
        agentContributions,
        alternativesConsidered,
        limitations,
        generatedAtMs,
        modelVersion: this.options.modelVersion,
      });

      const explanationId =
        this.options.explanationIdFactory(
          "mae",
          explanationSeed,
        );

      const explanation: MultiAgentDecisionExplanation =
        deepFreeze({
          explanationId,
          decisionId: result.decision.decisionId,
          audience: policy.audience,
          headline: buildHeadline(
            result.decision,
            selectedProposal,
            policy.audience,
          ),
          summary: buildSummary(
            result,
            selectedProposal,
            policy.audience,
            policy.enabled,
          ),
          primaryFactors,
          opposingFactors,
          uncertaintyFactors,
          agentContributions,
          consensusNarrative: buildConsensusNarrative(
            result,
            policy.audience,
          ),
          governanceNarrative: buildGovernanceNarrative(
            result.decision,
            policy.audience,
          ),
          ...(dissentNarrative === undefined
            ? {}
            : { dissentNarrative }),
          alternativesConsidered,
          limitations,
          generatedAtMs,
          modelVersion: this.options.modelVersion,
        });

      this.lastSnapshotValue = deepFreeze({
        explanationId,
        decisionId: explanation.decisionId,
        audience: explanation.audience,
        primaryFactorCount:
          explanation.primaryFactors.length,
        opposingFactorCount:
          explanation.opposingFactors.length,
        uncertaintyFactorCount:
          explanation.uncertaintyFactors.length,
        agentContributionCount:
          explanation.agentContributions.length,
        alternativeCount:
          explanation.alternativesConsidered.length,
        limitationCount: explanation.limitations.length,
        generatedAtMs,
        deterministicFingerprint:
          this.options.fingerprintFactory({
            explanationId,
            decisionId: explanation.decisionId,
            audience: explanation.audience,
            primaryFactors:
              explanation.primaryFactors,
            opposingFactors:
              explanation.opposingFactors,
            uncertaintyFactors:
              explanation.uncertaintyFactors,
            agentContributions:
              explanation.agentContributions,
            alternativesConsidered:
              explanation.alternativesConsidered,
            limitations: explanation.limitations,
            generatedAtMs,
            modelVersion: explanation.modelVersion,
          }),
      });

      return explanation;
    } catch (cause) {
      if (
        cause instanceof
        MultiAgentExplainabilityEngineError
      ) {
        throw cause;
      }

      throw new MultiAgentExplainabilityEngineError(
        "EXPLANATION_GENERATION_FAILED",
        "Failed to generate the collective multi-agent decision explanation.",
        {
          requestId: request?.requestId,
          decisionId: result?.decision?.decisionId,
          cause,
        },
      );
    }
  }

  public snapshot(): MultiAgentExplainabilitySnapshot {
    return this.lastSnapshotValue;
  }
}

export function createMultiAgentExplainabilityEngine(
  options: MultiAgentExplainabilityEngineOptions = {},
): MultiAgentExplainabilityEngine {
  return new MultiAgentExplainabilityEngine(options);
}

function normalizeOptions(
  options: MultiAgentExplainabilityEngineOptions,
): NormalizedOptions {
  const minimumFactorImportance =
    options.minimumFactorImportance ?? 0;

  assertFiniteRange(
    minimumFactorImportance,
    0,
    1,
    "minimumFactorImportance",
  );

  return Object.freeze({
    clock: options.clock ?? SYSTEM_CLOCK,
    explanationIdFactory:
      options.explanationIdFactory ??
      ((prefix, seed) =>
        `${prefix}_${stableFingerprint(seed)}`),
    fingerprintFactory:
      options.fingerprintFactory ?? stableFingerprint,
    modelVersion:
      options.modelVersion ?? DEFAULT_MODEL_VERSION,
    minimumFactorImportance,
    includeObservationEvidence:
      options.includeObservationEvidence ?? true,
    includeReviewEvidence:
      options.includeReviewEvidence ?? true,
    includeRiskFactors:
      options.includeRiskFactors ?? true,
  });
}

function validateRequest(
  request: MultiAgentRunRequest,
): void {
  if (!isRecord(request)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      "request must be an object.",
    );
  }

  assertNonEmptyString(
    request.requestId,
    "request.requestId",
  );
  assertFiniteNumber(
    request.requestedAtMs,
    "request.requestedAtMs",
  );
}

function validateResult(
  result: MultiAgentExplainabilityResult,
): void {
  if (!isRecord(result)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      "result must be an object.",
    );
  }

  assertArray(result.agents, "result.agents");
  assertArray(
    result.observations,
    "result.observations",
  );
  assertArray(result.proposals, "result.proposals");
  assertArray(result.reviews, "result.reviews");

  if (!isRecord(result.consensus)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      "result.consensus must be an object.",
    );
  }

  if (!isRecord(result.decision)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      "result.decision must be an object.",
    );
  }

  assertNonEmptyString(
    result.decision.decisionId,
    "result.decision.decisionId",
  );

  assertUnique(
    result.agents.map(
      (agent) => agent.identity.agentId,
    ),
    "agent IDs",
  );
  assertUnique(
    result.proposals.map(
      (proposal) => proposal.proposalId,
    ),
    "proposal IDs",
  );
  assertUnique(
    result.reviews.map((review) => review.reviewId),
    "review IDs",
  );
}

function validatePolicy(
  policy: MultiAgentExplainabilityPolicy,
): void {
  if (!isRecord(policy)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_POLICY",
      "policy must be an object.",
    );
  }

  assertBoolean(policy.enabled, "policy.enabled");
  assertNonNegativeInteger(
    policy.maximumPrimaryFactors,
    "policy.maximumPrimaryFactors",
  );
  assertNonNegativeInteger(
    policy.maximumOpposingFactors,
    "policy.maximumOpposingFactors",
  );
  assertNonNegativeInteger(
    policy.maximumUncertaintyFactors,
    "policy.maximumUncertaintyFactors",
  );
  assertBoolean(
    policy.includeAgentContributions,
    "policy.includeAgentContributions",
  );
  assertBoolean(
    policy.includeDissent,
    "policy.includeDissent",
  );
  assertBoolean(
    policy.includeAlternatives,
    "policy.includeAlternatives",
  );
  assertBoolean(
    policy.includeLimitations,
    "policy.includeLimitations",
  );

  const audiences: readonly MultiAgentExplanationAudience[] =
    Object.freeze([
      "SYSTEM",
      "TRADER",
      "RISK_MANAGER",
      "PORTFOLIO_MANAGER",
      "OPERATOR",
      "AUDITOR",
      "REGULATOR",
    ]);

  if (!audiences.includes(policy.audience)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_POLICY",
      `Unsupported explanation audience: ${String(
        policy.audience,
      )}.`,
    );
  }
}

function validateConsistency(
  request: MultiAgentRunRequest,
  result: MultiAgentExplainabilityResult,
): void {
  if (
    result.decision.consensus.consensusId !==
    result.consensus.consensusId
  ) {
    throw new MultiAgentExplainabilityEngineError(
      "DECISION_REQUEST_MISMATCH",
      "The decision consensus does not match the supplied consensus.",
      {
        requestId: request.requestId,
        decisionId: result.decision.decisionId,
      },
    );
  }

  if (
    result.decision.runId.length === 0 ||
    result.decision.sessionId.length === 0
  ) {
    throw new MultiAgentExplainabilityEngineError(
      "DECISION_REQUEST_MISMATCH",
      "The decision must contain non-empty run and session identifiers.",
      {
        requestId: request.requestId,
        decisionId: result.decision.decisionId,
      },
    );
  }
}

function resolveSelectedProposal(
  result: MultiAgentExplainabilityResult,
): MultiAgentProposal | undefined {
  if (result.decision.selectedProposal !== undefined) {
    return result.decision.selectedProposal;
  }

  const selectedProposalId =
    result.consensus.selectedProposalId;

  if (selectedProposalId === undefined) {
    return undefined;
  }

  return result.proposals.find(
    (proposal) =>
      proposal.proposalId === selectedProposalId,
  );
}

function collectFactorCandidates(
  result: MultiAgentExplainabilityResult,
  selectedProposal: MultiAgentProposal | undefined,
  options: NormalizedOptions,
): readonly FactorCandidate[] {
  const candidates: FactorCandidate[] = [];
  const selectedProposalId =
    selectedProposal?.proposalId;

  if (selectedProposal !== undefined) {
    for (const evidence of selectedProposal.evidence) {
      candidates.push(
        factorFromEvidence(
          evidence,
          selectedProposal.proposedByAgentId,
          "Selected proposal evidence",
        ),
      );
    }

    if (options.includeRiskFactors) {
      for (const risk of selectedProposal.risks) {
        candidates.push({
          key: `proposal-risk:${risk.code}`,
          name: risk.name,
          direction: "OPPOSING",
          importance: clamp01(
            average([
              risk.probability,
              risk.confidence,
              risk.impact,
            ]),
          ),
          contribution: -clamp01(
            risk.probability * risk.impact,
          ),
          agentIds: Object.freeze([
            selectedProposal.proposedByAgentId,
          ]),
          evidenceIds: Object.freeze([
            ...risk.evidenceIds,
          ]),
          explanation: `${risk.description}${
            risk.mitigation === undefined
              ? ""
              : ` Mitigation: ${risk.mitigation}`
          }`,
        });
      }
    }

    candidates.push({
      key: `proposal-confidence:${selectedProposal.proposalId}`,
      name: "Selected proposal confidence",
      direction: "SUPPORTING",
      importance: clamp01(selectedProposal.confidence),
      contribution: clamp01(
        selectedProposal.confidence,
      ),
      agentIds: Object.freeze([
        selectedProposal.proposedByAgentId,
      ]),
      evidenceIds: Object.freeze(
        selectedProposal.evidence.map(
          (evidence) => evidence.evidenceId,
        ),
      ),
      explanation: `The selected proposal carried confidence ${formatPercent(
        selectedProposal.confidence,
      )}.`,
    });
  }

  if (options.includeObservationEvidence) {
    for (const observation of result.observations) {
      for (const evidence of observation.evidence) {
        candidates.push(
          factorFromEvidence(
            evidence,
            observation.agentId,
            `${humanize(observation.type)} observation`,
          ),
        );
      }

      if (options.includeRiskFactors) {
        for (const risk of observation.risks) {
          candidates.push({
            key: `observation-risk:${observation.observationId}:${risk.code}`,
            name: risk.name,
            direction: "OPPOSING",
            importance: clamp01(
              average([
                risk.probability,
                risk.confidence,
                risk.impact,
                observation.qualityScore,
              ]),
            ),
            contribution: -clamp01(
              risk.probability * risk.impact,
            ),
            agentIds: Object.freeze([
              observation.agentId,
            ]),
            evidenceIds: Object.freeze([
              ...risk.evidenceIds,
            ]),
            explanation: `${risk.description} Reported by the ${humanize(
              observation.type,
            ).toLowerCase()} observation.`,
          });
        }
      }
    }
  }

  if (options.includeReviewEvidence) {
    for (const review of result.reviews) {
      if (
        selectedProposalId !== undefined &&
        review.proposalId !== selectedProposalId
      ) {
        continue;
      }

      for (const evidence of review.supportingEvidence) {
        candidates.push(
          factorFromEvidence(
            evidence,
            review.reviewerAgentId,
            "Peer-review evidence",
          ),
        );
      }

      for (const concern of review.concerns) {
        candidates.push({
          key: `review-concern:${review.reviewId}:${concern.code}`,
          name: concern.name,
          direction: "OPPOSING",
          importance: clamp01(
            average([
              concern.probability,
              concern.confidence,
              concern.impact,
              review.confidence,
            ]),
          ),
          contribution: -clamp01(
            concern.probability * concern.impact,
          ),
          agentIds: Object.freeze([
            review.reviewerAgentId,
          ]),
          evidenceIds: Object.freeze([
            ...concern.evidenceIds,
          ]),
          explanation: concern.description,
        });
      }
    }
  }

  const confidence = result.consensus.collectiveConfidence;
  candidates.push({
    key: `collective-confidence:${result.consensus.consensusId}`,
    name: "Collective confidence",
    direction:
      confidence.finalConfidence >= 0.5
        ? "SUPPORTING"
        : "CONTEXTUAL",
    importance: clamp01(
      Math.abs(confidence.finalConfidence - 0.5) * 2,
    ),
    contribution:
      confidence.finalConfidence - 0.5,
    agentIds: Object.freeze(
      uniqueSorted(
        result.consensus.votes.map(
          (vote) => vote.agentId,
        ),
      ),
    ),
    evidenceIds: Object.freeze([]),
    explanation: `The final collective confidence was ${formatPercent(
      confidence.finalConfidence,
    )}, after agreement, diversity, dissent, reliability, evidence-quality, and governance adjustments.`,
  });

  if (!result.consensus.quorumSatisfied) {
    candidates.push({
      key: `quorum:${result.consensus.consensusId}`,
      name: "Consensus quorum",
      direction: "INVALIDATING",
      importance: 1,
      contribution: -1,
      agentIds: Object.freeze(
        uniqueSorted(
          result.consensus.votes.map(
            (vote) => vote.agentId,
          ),
        ),
      ),
      evidenceIds: Object.freeze([]),
      explanation:
        "The configured consensus quorum was not satisfied.",
    });
  }

  if (result.consensus.dissent.length > 0) {
    const materialDissent =
      result.consensus.dissent.filter(
        (record) => record.material,
      ).length;

    candidates.push({
      key: `dissent:${result.consensus.consensusId}`,
      name: "Agent dissent",
      direction:
        materialDissent > 0 ? "OPPOSING" : "CONTEXTUAL",
      importance: clamp01(
        result.consensus.dissent.length /
          Math.max(1, result.agents.length),
      ),
      contribution: -clamp01(
        result.consensus.dissent.length /
          Math.max(1, result.agents.length),
      ),
      agentIds: Object.freeze(
        uniqueSorted(
          result.consensus.dissent.map(
            (record) => record.agentId,
          ),
        ),
      ),
      evidenceIds: Object.freeze(
        uniqueSorted(
          result.consensus.dissent.flatMap(
            (record) =>
              record.unresolvedRisks.flatMap(
                (risk) => risk.evidenceIds,
              ),
          ),
        ),
      ),
      explanation: `${result.consensus.dissent.length} dissent record(s) remained, including ${materialDissent} material dissent record(s).`,
    });
  }

  if (result.debate !== undefined) {
    candidates.push({
      key: `debate:${result.debate.sessionId}`,
      name: "Debate convergence",
      direction: result.debate.converged
        ? "SUPPORTING"
        : "CONTEXTUAL",
      importance: clamp01(
        result.debate.converged
          ? result.debate.convergenceScore
          : 1 - result.debate.convergenceScore,
      ),
      contribution: result.debate.converged
        ? clamp01(result.debate.convergenceScore)
        : -clamp01(
            1 - result.debate.convergenceScore,
          ),
      agentIds: Object.freeze(
        uniqueSorted(
          result.debate.statements.map(
            (statement) => statement.agentId,
          ),
        ),
      ),
      evidenceIds: Object.freeze(
        uniqueSorted(
          result.debate.statements.flatMap(
            (statement) => statement.evidenceIds,
          ),
        ),
      ),
      explanation: result.debate.converged
        ? `The debate converged after ${result.debate.roundsCompleted} round(s), with convergence score ${formatPercent(
            result.debate.convergenceScore,
          )}.`
        : `The debate did not fully converge after ${result.debate.roundsCompleted} round(s); ${result.debate.unresolvedQuestions.length} question(s) remained unresolved.`,
    });
  }

  return Object.freeze(candidates);
}

function factorFromEvidence(
  evidence: MultiAgentEvidence,
  fallbackAgentId: MultiAgentId,
  contextLabel: string,
): FactorCandidate {
  const agentIds = uniqueSorted([
    fallbackAgentId,
    ...evidence.supportingAgentIds,
    ...evidence.opposingAgentIds,
  ]);

  const importance = clamp01(
    evidence.weight *
      average([
        evidence.confidence,
        evidence.reliability,
        evidence.normalizedValue ?? 0.5,
      ]),
  );

  return {
    key: `evidence:${evidence.evidenceId}`,
    name: contextLabel,
    direction: evidence.direction,
    importance,
    contribution:
      contributionSign(evidence.direction) *
      importance,
    agentIds: Object.freeze(agentIds),
    evidenceIds: Object.freeze([
      evidence.evidenceId,
    ]),
    explanation: evidence.statement,
  };
}

function materializeFactors(
  candidates: readonly FactorCandidate[],
  maximum: number,
  minimumImportance: number,
): readonly MultiAgentExplanationFactor[] {
  if (maximum === 0) {
    return Object.freeze([]);
  }

  const merged = mergeCandidates(candidates)
    .filter(
      (candidate) =>
        candidate.importance >= minimumImportance,
    )
    .sort(compareFactorCandidates)
    .slice(0, maximum);

  return Object.freeze(
    merged.map((candidate, index) =>
      deepFreeze({
        rank: index + 1,
        name: candidate.name,
        direction: candidate.direction,
        importance: clamp01(candidate.importance),
        contribution: clampSigned(
          candidate.contribution,
        ),
        agentIds: Object.freeze([
          ...candidate.agentIds,
        ]),
        evidenceIds: Object.freeze([
          ...candidate.evidenceIds,
        ]),
        explanation: candidate.explanation,
      }),
    ),
  );
}

function mergeCandidates(
  candidates: readonly FactorCandidate[],
): readonly FactorCandidate[] {
  const byKey = new Map<string, FactorCandidate>();

  for (const candidate of candidates) {
    const existing = byKey.get(candidate.key);

    if (existing === undefined) {
      byKey.set(candidate.key, candidate);
      continue;
    }

    byKey.set(candidate.key, {
      ...existing,
      importance: Math.max(
        existing.importance,
        candidate.importance,
      ),
      contribution: clampSigned(
        existing.contribution +
          candidate.contribution,
      ),
      agentIds: Object.freeze(
        uniqueSorted([
          ...existing.agentIds,
          ...candidate.agentIds,
        ]),
      ),
      evidenceIds: Object.freeze(
        uniqueSorted([
          ...existing.evidenceIds,
          ...candidate.evidenceIds,
        ]),
      ),
      explanation:
        existing.explanation === candidate.explanation
          ? existing.explanation
          : `${existing.explanation} ${candidate.explanation}`,
    });
  }

  return Object.freeze([...byKey.values()]);
}

function compareFactorCandidates(
  left: FactorCandidate,
  right: FactorCandidate,
): number {
  return (
    right.importance - left.importance ||
    Math.abs(right.contribution) -
      Math.abs(left.contribution) ||
    left.name.localeCompare(right.name) ||
    left.key.localeCompare(right.key)
  );
}

function buildAgentContributions(
  result: MultiAgentExplainabilityResult,
  selectedProposal: MultiAgentProposal | undefined,
): readonly MultiAgentAgentContribution[] {
  const contributions = result.agents.map((agent) => {
    const agentId = agent.identity.agentId;
    const authoredProposals =
      result.proposals.filter(
        (proposal) =>
          proposal.proposedByAgentId === agentId,
      );
    const observations =
      result.observations.filter(
        (observation) =>
          observation.agentId === agentId,
      );
    const reviews = result.reviews.filter(
      (review) =>
        review.reviewerAgentId === agentId,
    );
    const votes = result.consensus.votes.filter(
      (vote) => vote.agentId === agentId,
    );

    const proposalContribution =
      authoredProposals.length === 0
        ? 0
        : clamp01(
            average(
              authoredProposals.map(
                (proposal) => proposal.confidence,
              ),
            ),
          );

    const evidenceContribution =
      observations.length === 0
        ? 0
        : clamp01(
            average(
              observations.map((observation) =>
                average([
                  observation.confidence,
                  observation.qualityScore,
                ]),
              ),
            ),
          );

    const reviewContribution =
      reviews.length === 0
        ? 0
        : clamp01(
            average(
              reviews.map(
                (review) => review.confidence,
              ),
            ),
          );

    const consensusContribution =
      votes.length === 0
        ? 0
        : clamp01(
            average(
              votes.map((vote) => vote.confidence),
            ),
          );

    const selectedBonus =
      selectedProposal?.proposedByAgentId === agentId
        ? 0.15
        : 0;

    const finalContribution = clamp01(
      weightedAverage([
        [proposalContribution, 0.3],
        [evidenceContribution, 0.25],
        [reviewContribution, 0.2],
        [consensusContribution, 0.25],
      ]) + selectedBonus,
    );

    return deepFreeze({
      agentId,
      role: agent.identity.role,
      proposalContribution,
      evidenceContribution,
      reviewContribution,
      consensusContribution,
      finalContribution,
      summary: buildAgentContributionSummary(
        agent.identity.name,
        agent.identity.role,
        authoredProposals.length,
        observations.length,
        reviews.length,
        votes.length,
        selectedProposal?.proposedByAgentId ===
          agentId,
      ),
    });
  });

  return Object.freeze(
    contributions.sort(
      (left, right) =>
        right.finalContribution -
          left.finalContribution ||
        left.agentId.localeCompare(right.agentId),
    ),
  );
}

function buildAgentContributionSummary(
  name: string,
  role: MultiAgentRole,
  proposalCount: number,
  observationCount: number,
  reviewCount: number,
  voteCount: number,
  selectedAuthor: boolean,
): string {
  const selectedText = selectedAuthor
    ? " Its proposal was selected."
    : "";

  return `${name} (${humanize(
    role,
  )}) contributed ${proposalCount} proposal(s), ${observationCount} observation(s), ${reviewCount} review(s), and ${voteCount} consensus vote(s).${selectedText}`;
}

function buildAlternatives(
  proposals: readonly MultiAgentProposal[],
  selectedProposal: MultiAgentProposal | undefined,
): readonly string[] {
  return Object.freeze(
    proposals
      .filter(
        (proposal) =>
          proposal.proposalId !==
          selectedProposal?.proposalId,
      )
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          left.proposalId.localeCompare(
            right.proposalId,
          ),
      )
      .map(
        (proposal) =>
          `${proposal.title}: ${proposal.thesis} Confidence ${formatPercent(
            proposal.confidence,
          )}; status ${humanize(
            proposal.status,
          ).toLowerCase()}.`,
      ),
  );
}

function buildLimitations(
  result: MultiAgentExplainabilityResult,
  selectedProposal: MultiAgentProposal | undefined,
): readonly string[] {
  const limitations: string[] = [];

  if (selectedProposal === undefined) {
    limitations.push(
      "No proposal was selected, so proposal-specific causal attribution is unavailable.",
    );
  }

  if (result.observations.length === 0) {
    limitations.push(
      "No agent observations were supplied to the explanation engine.",
    );
  }

  if (result.reviews.length === 0) {
    limitations.push(
      "No peer reviews were supplied for independent proposal challenge.",
    );
  }

  if (result.debate === undefined) {
    limitations.push(
      "No debate transcript was supplied, so debate convergence cannot be assessed.",
    );
  } else if (!result.debate.converged) {
    limitations.push(
      `${result.debate.unresolvedQuestions.length} debate question(s) remained unresolved.`,
    );
  }

  if (!result.consensus.quorumSatisfied) {
    limitations.push(
      "Consensus quorum was not satisfied.",
    );
  }

  if (result.consensus.participationRatio < 1) {
    limitations.push(
      `Consensus participation was ${formatPercent(
        result.consensus.participationRatio,
      )}, so not every eligible contribution may be represented.`,
    );
  }

  if (result.consensus.dissent.some(
    (record) => record.material,
  )) {
    limitations.push(
      "Material dissent remains in the final collective decision.",
    );
  }

  if (
    result.decision.validUntilMs !== undefined &&
    result.decision.validUntilMs <=
      result.decision.decidedAtMs
  ) {
    limitations.push(
      "The decision validity window is non-positive.",
    );
  }

  if (result.decision.restrictions.length > 0) {
    limitations.push(
      `Execution is subject to ${result.decision.restrictions.length} restriction(s).`,
    );
  }

  return Object.freeze(uniqueSorted(limitations));
}

function buildHeadline(
  decision: MultiAgentCollectiveDecision,
  selectedProposal: MultiAgentProposal | undefined,
  audience: MultiAgentExplanationAudience,
): string {
  const decisionLabel = humanize(
    decision.decision,
  );

  if (selectedProposal === undefined) {
    return `${decisionLabel}: collective multi-agent outcome`;
  }

  switch (audience) {
    case "TRADER":
      return `${decisionLabel}: ${selectedProposal.title}`;
    case "RISK_MANAGER":
      return `${decisionLabel} after governed risk assessment`;
    case "PORTFOLIO_MANAGER":
      return `${decisionLabel} for portfolio coordination`;
    case "OPERATOR":
      return `${decisionLabel}: operational decision ready for governed handling`;
    case "AUDITOR":
    case "REGULATOR":
      return `${decisionLabel}: auditable collective decision`;
    case "SYSTEM":
      return `${decisionLabel}: deterministic multi-agent result`;
  }
}

function buildSummary(
  result: MultiAgentExplainabilityResult,
  selectedProposal: MultiAgentProposal | undefined,
  audience: MultiAgentExplanationAudience,
  enabled: boolean,
): string {
  if (!enabled) {
    return "Detailed explainability was disabled by policy; only the final governed decision is reported.";
  }

  const proposalText =
    selectedProposal === undefined
      ? "No proposal was selected"
      : `The proposal "${selectedProposal.title}" was selected`;

  const confidenceText = formatPercent(
    result.decision.collectiveConfidence
      .finalConfidence,
  );

  const common = `${proposalText}. The collective decision was ${humanize(
    result.decision.decision,
  ).toLowerCase()} with ${confidenceText} final confidence, ${result.decision.risks.length} recorded risk(s), ${result.decision.constraints.length} constraint(s), and ${result.decision.restrictions.length} restriction(s).`;

  switch (audience) {
    case "TRADER":
      return `${common} Review the approved actions and validity window before execution.`;
    case "RISK_MANAGER":
      return `${common} Governance concluded ${humanize(
        result.decision.governance.decision,
      ).toLowerCase()} under ${humanize(
        result.decision.governance
          .approvalRequirement,
      ).toLowerCase()} approval requirements.`;
    case "PORTFOLIO_MANAGER":
      return `${common} The explanation reflects proposal utility, consensus quality, and portfolio-relevant constraints.`;
    case "OPERATOR":
      return `${common} Operator escalation is ${
        result.decision.operatorEscalation?.required
          ? "required"
          : "not required"
      }.`;
    case "AUDITOR":
    case "REGULATOR":
      return `${common} The result was derived from ${result.agents.length} registered agent(s), ${result.observations.length} observation(s), ${result.proposals.length} proposal(s), and ${result.reviews.length} peer review(s).`;
    case "SYSTEM":
      return `${common} Deterministic fingerprints are available on the source decision, consensus, proposals, observations, and reviews.`;
  }
}

function buildConsensusNarrative(
  result: MultiAgentExplainabilityResult,
  audience: MultiAgentExplanationAudience,
): string {
  const consensus = result.consensus;
  const base = `Consensus status was ${humanize(
    consensus.status,
  ).toLowerCase()} using ${humanize(
    consensus.method,
  ).toLowerCase()}. Participation was ${formatPercent(
    consensus.participationRatio,
  )}; approval weight ${formatNumber(
    consensus.approvalWeight,
  )}, rejection weight ${formatNumber(
    consensus.rejectionWeight,
  )}, abstention weight ${formatNumber(
    consensus.abstentionWeight,
  )}, and veto count ${consensus.vetoCount}. Quorum was ${
    consensus.quorumSatisfied
      ? "satisfied"
      : "not satisfied"
  }.`;

  if (
    audience === "AUDITOR" ||
    audience === "REGULATOR" ||
    audience === "SYSTEM"
  ) {
    return `${base} Consensus rationale: ${consensus.rationale}`;
  }

  return base;
}

function buildGovernanceNarrative(
  decision: MultiAgentCollectiveDecision,
  audience: MultiAgentExplanationAudience,
): string {
  const governance = decision.governance;
  const base = `Governance decision: ${humanize(
    governance.decision,
  ).toLowerCase()}. Required approval: ${humanize(
    governance.approvalRequirement,
  ).toLowerCase()}. ${governance.ruleEvaluations.length} rule(s) were evaluated, producing ${governance.restrictions.length} governance restriction(s) and ${governance.rejectionReasons.length} rejection reason(s). Governance confidence was ${formatPercent(
    governance.confidence,
  )}.`;

  if (
    audience === "RISK_MANAGER" ||
    audience === "AUDITOR" ||
    audience === "REGULATOR" ||
    audience === "SYSTEM"
  ) {
    return `${base} ${governance.approvingAgentIds.length} agent approval(s) were recorded.`;
  }

  return base;
}

function buildDissentNarrative(
  result: MultiAgentExplainabilityResult,
): string {
  const material = result.consensus.dissent.filter(
    (record) => record.material,
  );
  const unresolvedRiskCount =
    result.consensus.dissent.reduce(
      (total, record) =>
        total + record.unresolvedRisks.length,
      0,
    );

  const rationales = uniqueSorted(
    result.consensus.dissent
      .map((record) => record.rationale.trim())
      .filter((value) => value.length > 0),
  );

  return `${result.consensus.dissent.length} dissent record(s) remained, including ${material.length} material record(s) and ${unresolvedRiskCount} unresolved risk reference(s).${
    rationales.length === 0
      ? ""
      : ` Main dissent rationale(s): ${rationales.join(
          " | ",
        )}`
  }`;
}

function isPrimaryDirection(
  direction: MultiAgentEvidenceDirection,
): boolean {
  return direction === "SUPPORTING";
}

function isOpposingDirection(
  direction: MultiAgentEvidenceDirection,
): boolean {
  return (
    direction === "OPPOSING" ||
    direction === "INVALIDATING"
  );
}

function isUncertaintyDirection(
  direction: MultiAgentEvidenceDirection,
): boolean {
  return (
    direction === "NEUTRAL" ||
    direction === "CONTEXTUAL"
  );
}

function contributionSign(
  direction: MultiAgentEvidenceDirection,
): number {
  switch (direction) {
    case "SUPPORTING":
      return 1;
    case "OPPOSING":
    case "INVALIDATING":
      return -1;
    case "NEUTRAL":
    case "CONTEXTUAL":
      return 0;
  }
}

function weightedAverage(
  values: readonly (readonly [number, number])[],
): number {
  const weight = values.reduce(
    (total, entry) => total + entry[1],
    0,
  );

  if (weight <= 0) {
    return 0;
  }

  return (
    values.reduce(
      (total, entry) =>
        total + entry[0] * entry[1],
      0,
    ) / weight
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
      (total, value) => total + value,
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

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(-1, value));
}

function formatPercent(value: number): string {
  return `${(clamp01(value) * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3);
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter((part) => part.length > 0)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function uniqueSorted<T extends string>(
  values: readonly T[],
): T[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function assertUnique(
  values: readonly string[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      `${label} must be unique.`,
    );
  }
}

function assertArray(
  value: unknown,
  label: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      `${label} must be an array.`,
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      `${label} must be a non-empty string.`,
    );
  }
}

function assertBoolean(
  value: unknown,
  label: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_POLICY",
      `${label} must be a boolean.`,
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_POLICY",
      `${label} must be a non-negative integer.`,
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_INPUT",
      `${label} must be a finite number.`,
    );
  }
}

function assertFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new MultiAgentExplainabilityEngineError(
      "INVALID_EXPLAINABILITY_POLICY",
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
}

function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function stableFingerprint(
  value: unknown,
): string {
  const input = stableSerialize(value);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

function stableSerialize(
  value: unknown,
): string {
  return JSON.stringify(
    normalizeForSerialization(value),
  );
}

function normalizeForSerialization(
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
    if (Number.isNaN(value)) {
      return "NaN";
    }

    if (value === Number.POSITIVE_INFINITY) {
      return "Infinity";
    }

    if (value === Number.NEGATIVE_INFINITY) {
      return "-Infinity";
    }

    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForSerialization);
  }

  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const item = value[key];

      if (
        item !== undefined &&
        typeof item !== "function" &&
        typeof item !== "symbol"
      ) {
        normalized[key] =
          normalizeForSerialization(item);
      }
    }

    return normalized;
  }

  return String(value);
}

function deepFreeze<TValue>(
  value: TValue,
  visited: WeakSet<object> = new WeakSet<object>(),
): TValue {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  const objectValue = value as object;

  if (visited.has(objectValue)) {
    return value;
  }

  visited.add(objectValue);

  for (const propertyValue of Object.values(
    objectValue,
  )) {
    deepFreeze(propertyValue, visited);
  }

  return Object.freeze(value);
}