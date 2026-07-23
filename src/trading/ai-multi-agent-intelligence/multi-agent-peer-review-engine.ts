/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-peer-review-engine.ts
 *
 * Deterministic, replay-safe peer review for multi-agent proposals.
 */

import {
  type MultiAgentConfidence,
  type MultiAgentEvidence,
  type MultiAgentId,
  type MultiAgentKnowledgeId,
  type MultiAgentPeerReview,
  type MultiAgentPeerReviewEnginePort,
  type MultiAgentProposal,
  type MultiAgentProposalId,
  type MultiAgentRegistration,
  type MultiAgentReviewDecision,
  type MultiAgentReviewDimension,
  type MultiAgentReviewId,
  type MultiAgentReviewScore,
  type MultiAgentRiskFinding,
  type MultiAgentScore,
  type MultiAgentSystemContext,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentPeerReviewEngineErrorCode =
  | "INVALID_REVIEW_REQUEST"
  | "NO_ELIGIBLE_REVIEWER"
  | "REVIEWER_BUILDER_ALREADY_REGISTERED"
  | "REVIEWER_BUILDER_NOT_FOUND"
  | "REVIEWER_BUILDER_FAILED"
  | "SELF_REVIEW_PROHIBITED"
  | "INVALID_REVIEW_DRAFT"
  | "INVALID_REVIEW"
  | "DUPLICATE_REVIEW_ID"
  | "DUPLICATE_REVIEW_ASSIGNMENT"
  | "REVIEW_LIMIT_EXCEEDED"
  | "STALE_PROPOSAL";

export interface MultiAgentPeerReviewEngineErrorDetails {
  readonly proposalId?: MultiAgentProposalId;
  readonly reviewerAgentId?: MultiAgentId;
  readonly reviewId?: MultiAgentReviewId;
  readonly cause?: unknown;
}

export class MultiAgentPeerReviewEngineError extends Error {
  public readonly code: MultiAgentPeerReviewEngineErrorCode;
  public readonly details: MultiAgentPeerReviewEngineErrorDetails;

  public constructor(
    code: MultiAgentPeerReviewEngineErrorCode,
    message: string,
    details: MultiAgentPeerReviewEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentPeerReviewEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentPeerReviewClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentPeerReviewDraft {
  readonly decision: MultiAgentReviewDecision;
  readonly scores: readonly MultiAgentReviewScore[];
  readonly supportingEvidence?: readonly MultiAgentEvidence[];
  readonly concerns?: readonly MultiAgentRiskFinding[];
  readonly requestedChanges?: readonly string[];
  readonly confidence?: MultiAgentConfidence;
}

export interface MultiAgentPeerReviewBuildContext {
  readonly proposal: MultiAgentProposal;
  readonly reviewer: MultiAgentRegistration;
  readonly context: MultiAgentSystemContext;
  readonly reviewedAtMs: MultiAgentTimestamp;
  readonly deterministicSeed: string;
}

export interface MultiAgentPeerReviewBuilder {
  readonly agentId: MultiAgentId;
  readonly deterministic: boolean;
  readonly replaySafe: boolean;

  build(
    context: MultiAgentPeerReviewBuildContext,
  ): MultiAgentPeerReviewDraft | Promise<MultiAgentPeerReviewDraft>;
}

export interface MultiAgentPeerReviewEngineOptions {
  readonly builders?: readonly MultiAgentPeerReviewBuilder[];
  readonly clock?: MultiAgentPeerReviewClock;
  readonly maximumReviews?: number;
  readonly maximumReviewersPerProposal?: number;
  readonly minimumReviewersPerProposal?: number;
  readonly prohibitSelfReview?: boolean;
  readonly allowFallbackReviews?: boolean;
  readonly requireDeterministicBuilders?: boolean;
  readonly requireReplaySafeBuilders?: boolean;
  readonly requireReviewCapability?: boolean;
  readonly requireReviewAuthority?: boolean;
  readonly rejectStaleProposals?: boolean;
  readonly includeAllDimensions?: boolean;
  readonly minimumEvidenceQuality?: MultiAgentScore;
  readonly vetoCriticalRiskThreshold?: MultiAgentScore;
  readonly reviewIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentReviewId;
  readonly fingerprintFactory?: (value: unknown) => string;
}

export interface MultiAgentPeerReviewRecord {
  readonly reviewId: MultiAgentReviewId;
  readonly proposalId: MultiAgentProposalId;
  readonly reviewerAgentId: MultiAgentId;
  readonly decision: MultiAgentReviewDecision;
  readonly aggregateScore: MultiAgentScore;
  readonly confidence: MultiAgentConfidence;
  readonly reviewedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentPeerReviewSnapshot {
  readonly records: readonly MultiAgentPeerReviewRecord[];
  readonly reviewCount: number;
  readonly proposalIds: readonly MultiAgentProposalId[];
  readonly reviewerAgentIds: readonly MultiAgentId[];
  readonly generatedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentPeerReviewClock;
  readonly maximumReviews: number;
  readonly maximumReviewersPerProposal: number;
  readonly minimumReviewersPerProposal: number;
  readonly prohibitSelfReview: boolean;
  readonly allowFallbackReviews: boolean;
  readonly requireDeterministicBuilders: boolean;
  readonly requireReplaySafeBuilders: boolean;
  readonly requireReviewCapability: boolean;
  readonly requireReviewAuthority: boolean;
  readonly rejectStaleProposals: boolean;
  readonly includeAllDimensions: boolean;
  readonly minimumEvidenceQuality: MultiAgentScore;
  readonly vetoCriticalRiskThreshold: MultiAgentScore;
  readonly reviewIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentReviewId;
  readonly fingerprintFactory: (value: unknown) => string;
}

const REVIEW_DIMENSIONS: readonly MultiAgentReviewDimension[] =
  Object.freeze([
    "EVIDENCE_QUALITY",
    "MARKET_ALIGNMENT",
    "PORTFOLIO_ALIGNMENT",
    "RISK",
    "STRATEGY_ALIGNMENT",
    "ARBITRAGE_VALIDITY",
    "EXECUTION_FEASIBILITY",
    "GOVERNANCE",
    "LEARNING_ALIGNMENT",
    "EXPLAINABILITY",
  ]);

const roleDimensions = (
  ...dimensions: readonly MultiAgentReviewDimension[]
): readonly MultiAgentReviewDimension[] =>
  Object.freeze([...dimensions]);

const ROLE_DIMENSIONS: Readonly<
  Partial<
    Record<
      MultiAgentRegistration["identity"]["role"],
      readonly MultiAgentReviewDimension[]
    >
  >
> = Object.freeze({
  MARKET_INTELLIGENCE_AGENT: roleDimensions(
    "EVIDENCE_QUALITY",
    "MARKET_ALIGNMENT",
  ),
  REGIME_ANALYSIS_AGENT: roleDimensions(
    "MARKET_ALIGNMENT",
    "STRATEGY_ALIGNMENT",
  ),
  VOLATILITY_AGENT: roleDimensions(
    "MARKET_ALIGNMENT",
    "RISK",
  ),
  LIQUIDITY_AGENT: roleDimensions(
    "MARKET_ALIGNMENT",
    "EXECUTION_FEASIBILITY",
  ),
  ORDER_FLOW_AGENT: roleDimensions(
    "MARKET_ALIGNMENT",
    "EXECUTION_FEASIBILITY",
  ),
  CORRELATION_AGENT: roleDimensions(
    "PORTFOLIO_ALIGNMENT",
    "RISK",
  ),
  ANOMALY_AGENT: roleDimensions(
    "EVIDENCE_QUALITY",
    "RISK",
    "GOVERNANCE",
  ),
  PRICE_PREDICTION_AGENT: roleDimensions(
    "EVIDENCE_QUALITY",
    "MARKET_ALIGNMENT",
  ),
  STRATEGY_SELECTION_AGENT: roleDimensions(
    "STRATEGY_ALIGNMENT",
    "LEARNING_ALIGNMENT",
  ),
  STRATEGY_PORTFOLIO_AGENT: roleDimensions(
    "PORTFOLIO_ALIGNMENT",
    "STRATEGY_ALIGNMENT",
  ),
  PORTFOLIO_CONSTRUCTION_AGENT: roleDimensions(
    "PORTFOLIO_ALIGNMENT",
    "RISK",
  ),
  RISK_AGENT: roleDimensions(
    "RISK",
    "GOVERNANCE",
    "EXECUTION_FEASIBILITY",
  ),
  EXECUTION_AGENT: roleDimensions(
    "EXECUTION_FEASIBILITY",
    "RISK",
  ),
  ARBITRAGE_AGENT: roleDimensions(
    "ARBITRAGE_VALIDITY",
    "EXECUTION_FEASIBILITY",
    "RISK",
  ),
  META_LEARNING_AGENT: roleDimensions(
    "LEARNING_ALIGNMENT",
    "STRATEGY_ALIGNMENT",
  ),
  REINFORCEMENT_AGENT: roleDimensions(
    "LEARNING_ALIGNMENT",
    "STRATEGY_ALIGNMENT",
  ),
  GOVERNANCE_AGENT: roleDimensions(
    "GOVERNANCE",
    "RISK",
    "EXPLAINABILITY",
  ),
  EXPLAINABILITY_AGENT: roleDimensions(
    "EXPLAINABILITY",
    "EVIDENCE_QUALITY",
  ),
  CONFLICT_ARBITER_AGENT: roleDimensions(
    "GOVERNANCE",
    "RISK",
    "EVIDENCE_QUALITY",
  ),
  CONSENSUS_COORDINATOR_AGENT: REVIEW_DIMENSIONS,
  SUPERVISOR_AGENT: REVIEW_DIMENSIONS,
  OPERATOR_PROXY_AGENT: roleDimensions(
    "GOVERNANCE",
    "EXPLAINABILITY",
    "EXECUTION_FEASIBILITY",
  ),
});

export class MultiAgentPeerReviewEngine
  implements MultiAgentPeerReviewEnginePort
{
  private readonly builders = new Map<
    MultiAgentId,
    MultiAgentPeerReviewBuilder
  >();

  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentPeerReviewSnapshot;

  public constructor(options: MultiAgentPeerReviewEngineOptions = {}) {
    this.options = normalizeOptions(options);

    for (const builder of options.builders ?? []) {
      this.registerBuilder(builder);
    }

    this.lastSnapshotValue = deepFreeze({
      records: Object.freeze([]),
      reviewCount: 0,
      proposalIds: Object.freeze([]),
      reviewerAgentIds: Object.freeze([]),
      deterministicFingerprint: this.options.fingerprintFactory({
        records: [],
      }),
    });
  }

  public registerBuilder(
    builder: MultiAgentPeerReviewBuilder,
  ): void {
    validateBuilder(builder, this.options);

    if (this.builders.has(builder.agentId)) {
      throw new MultiAgentPeerReviewEngineError(
        "REVIEWER_BUILDER_ALREADY_REGISTERED",
        `A review builder is already registered for "${builder.agentId}".`,
        { reviewerAgentId: builder.agentId },
      );
    }

    this.builders.set(builder.agentId, builder);
  }

  public replaceBuilder(
    builder: MultiAgentPeerReviewBuilder,
  ): void {
    validateBuilder(builder, this.options);
    this.builders.set(builder.agentId, builder);
  }

  public unregisterBuilder(agentId: MultiAgentId): void {
    this.builders.delete(agentId);
  }

  public getBuilder(
    agentId: MultiAgentId,
  ): MultiAgentPeerReviewBuilder | undefined {
    return this.builders.get(agentId);
  }

  public listBuilders(): readonly MultiAgentPeerReviewBuilder[] {
    return Object.freeze(
      [...this.builders.values()].sort((left, right) =>
        left.agentId.localeCompare(right.agentId),
      ),
    );
  }

  public snapshot(): MultiAgentPeerReviewSnapshot {
    return this.lastSnapshotValue;
  }

  public async review(
    proposals: readonly MultiAgentProposal[],
    agents: readonly MultiAgentRegistration[],
    context: MultiAgentSystemContext,
  ): Promise<readonly MultiAgentPeerReview[]> {
    validateInputs(proposals, agents, context);

    const reviewedAtMs = this.options.clock.now();
    const eligibleReviewers = agents
      .filter((agent) => isEligibleReviewer(agent, this.options))
      .sort(compareAgents);

    if (eligibleReviewers.length === 0) {
      throw new MultiAgentPeerReviewEngineError(
        "NO_ELIGIBLE_REVIEWER",
        "No selected agent is eligible to review proposals.",
      );
    }

    const reviews: MultiAgentPeerReview[] = [];
    const records: MultiAgentPeerReviewRecord[] = [];
    const reviewIds = new Set<MultiAgentReviewId>();
    const assignments = new Set<string>();

    for (const proposal of [...proposals].sort(compareProposals)) {
      if (
        this.options.rejectStaleProposals &&
        proposal.validUntilMs !== undefined &&
        proposal.validUntilMs < reviewedAtMs
      ) {
        throw new MultiAgentPeerReviewEngineError(
          "STALE_PROPOSAL",
          `Proposal "${proposal.proposalId}" is stale.`,
          { proposalId: proposal.proposalId },
        );
      }

      const reviewers = eligibleReviewers
        .filter(
          (reviewer) =>
            !this.options.prohibitSelfReview ||
            reviewer.identity.agentId !==
              proposal.proposedByAgentId,
        )
        .sort((left, right) =>
          compareReviewerSuitability(
            left,
            right,
            proposal,
          ),
        )
        .slice(0, this.options.maximumReviewersPerProposal);

      if (
        reviewers.length <
        this.options.minimumReviewersPerProposal
      ) {
        throw new MultiAgentPeerReviewEngineError(
          "NO_ELIGIBLE_REVIEWER",
          `Proposal "${proposal.proposalId}" does not have the required reviewer quorum.`,
          { proposalId: proposal.proposalId },
        );
      }

      for (const reviewer of reviewers) {
        if (reviews.length >= this.options.maximumReviews) {
          throw new MultiAgentPeerReviewEngineError(
            "REVIEW_LIMIT_EXCEEDED",
            `Review count exceeds maximum ${this.options.maximumReviews}.`,
            { proposalId: proposal.proposalId },
          );
        }

        const assignmentKey =
          `${proposal.proposalId}:${reviewer.identity.agentId}`;

        if (assignments.has(assignmentKey)) {
          throw new MultiAgentPeerReviewEngineError(
            "DUPLICATE_REVIEW_ASSIGNMENT",
            `Duplicate review assignment "${assignmentKey}".`,
            {
              proposalId: proposal.proposalId,
              reviewerAgentId: reviewer.identity.agentId,
            },
          );
        }

        assignments.add(assignmentKey);

        const draft = await this.generateDraft(
          proposal,
          reviewer,
          context,
          reviewedAtMs,
        );
        const peerReview = this.materializeReview(
          proposal,
          reviewer,
          draft,
          reviewedAtMs,
        );

        if (reviewIds.has(peerReview.reviewId)) {
          throw new MultiAgentPeerReviewEngineError(
            "DUPLICATE_REVIEW_ID",
            `Duplicate review id "${peerReview.reviewId}".`,
            {
              reviewId: peerReview.reviewId,
              proposalId: proposal.proposalId,
              reviewerAgentId: reviewer.identity.agentId,
            },
          );
        }

        reviewIds.add(peerReview.reviewId);
        reviews.push(peerReview);
        records.push(
          buildRecord(peerReview, this.options),
        );
      }
    }

    const orderedReviews = reviews.sort(compareReviews);
    const orderedRecords = records.sort((left, right) =>
      left.reviewId.localeCompare(right.reviewId),
    );
    const proposalIds = Object.freeze(
      [...new Set(orderedReviews.map((review) => review.proposalId))]
        .sort(),
    );
    const reviewerAgentIds = Object.freeze(
      [
        ...new Set(
          orderedReviews.map(
            (review) => review.reviewerAgentId,
          ),
        ),
      ].sort(),
    );

    this.lastSnapshotValue = deepFreeze({
      records: Object.freeze(orderedRecords),
      reviewCount: orderedReviews.length,
      proposalIds,
      reviewerAgentIds,
      generatedAtMs: reviewedAtMs,
      deterministicFingerprint: this.options.fingerprintFactory({
        records: orderedRecords,
        proposalIds,
        reviewerAgentIds,
      }),
    });

    return deepFreeze(Object.freeze(orderedReviews));
  }

  private async generateDraft(
    proposal: MultiAgentProposal,
    reviewer: MultiAgentRegistration,
    context: MultiAgentSystemContext,
    reviewedAtMs: MultiAgentTimestamp,
  ): Promise<MultiAgentPeerReviewDraft> {
    const builder = this.builders.get(reviewer.identity.agentId);

    if (builder === undefined) {
      if (!this.options.allowFallbackReviews) {
        throw new MultiAgentPeerReviewEngineError(
          "REVIEWER_BUILDER_NOT_FOUND",
          `No review builder is registered for "${reviewer.identity.agentId}".`,
          {
            proposalId: proposal.proposalId,
            reviewerAgentId: reviewer.identity.agentId,
          },
        );
      }

      return buildFallbackDraft(
        proposal,
        reviewer,
        context,
        this.options,
      );
    }

    try {
      const draft = await builder.build(
        deepFreeze({
          proposal,
          reviewer,
          context,
          reviewedAtMs,
          deterministicSeed: this.options.fingerprintFactory({
            proposalFingerprint:
              proposal.deterministicFingerprint,
            reviewerAgentId: reviewer.identity.agentId,
            contextFingerprint:
              context.deterministicFingerprint,
          }),
        }),
      );

      validateDraft(
        draft,
        proposal.proposalId,
        reviewer.identity.agentId,
        this.options,
      );

      return deepFreeze(draft);
    } catch (error: unknown) {
      if (error instanceof MultiAgentPeerReviewEngineError) {
        throw error;
      }

      throw new MultiAgentPeerReviewEngineError(
        "REVIEWER_BUILDER_FAILED",
        `Review builder "${reviewer.identity.agentId}" failed.`,
        {
          proposalId: proposal.proposalId,
          reviewerAgentId: reviewer.identity.agentId,
          cause: error,
        },
      );
    }
  }

  private materializeReview(
    proposal: MultiAgentProposal,
    reviewer: MultiAgentRegistration,
    draft: MultiAgentPeerReviewDraft,
    reviewedAtMs: MultiAgentTimestamp,
  ): MultiAgentPeerReview {
    validateDraft(
      draft,
      proposal.proposalId,
      reviewer.identity.agentId,
      this.options,
    );

    const scores = Object.freeze(
      normalizeScores(
        draft.scores,
        reviewer,
        this.options,
      ),
    );
    const supportingEvidence = Object.freeze(
      deduplicateEvidence(
        draft.supportingEvidence ??
          proposal.evidence.filter(
            (evidence) =>
              evidence.direction === "SUPPORTING" ||
              evidence.direction === "CONTEXTUAL",
          ),
      ),
    );
    const concerns = Object.freeze(
      deduplicateRisks(
        draft.concerns ?? proposal.risks,
      ),
    );
    const requestedChanges = Object.freeze(
      normalizeText(draft.requestedChanges ?? []),
    );
    const confidence = clamp01(
      draft.confidence ??
        calculateReviewConfidence(
          scores,
          supportingEvidence,
        ),
    ) as MultiAgentConfidence;

    const reviewId = this.options.reviewIdFactory(
      "review",
      this.options.fingerprintFactory({
        proposalId: proposal.proposalId,
        reviewerAgentId: reviewer.identity.agentId,
        decision: draft.decision,
        scores,
        supportingEvidenceIds:
          supportingEvidence.map(
            (evidence) => evidence.evidenceId,
          ),
        concernCodes: concerns.map(
          (concern) => concern.code,
        ),
        requestedChanges,
        reviewedAtMs,
      }),
    );

    const review: MultiAgentPeerReview = deepFreeze({
      reviewId,
      proposalId: proposal.proposalId,
      reviewerAgentId: reviewer.identity.agentId,
      decision: draft.decision,
      scores,
      supportingEvidence,
      concerns,
      requestedChanges,
      confidence,
      reviewedAtMs,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          reviewId,
          proposalId: proposal.proposalId,
          reviewerAgentId: reviewer.identity.agentId,
          decision: draft.decision,
          scores,
          supportingEvidence,
          concerns,
          requestedChanges,
          confidence,
          reviewedAtMs,
          proposalFingerprint:
            proposal.deterministicFingerprint,
        }),
    });

    validateReview(review);

    return review;
  }
}

export function createMultiAgentPeerReviewEngine(
  options: MultiAgentPeerReviewEngineOptions = {},
): MultiAgentPeerReviewEngine {
  return new MultiAgentPeerReviewEngine(options);
}

function buildFallbackDraft(
  proposal: MultiAgentProposal,
  reviewer: MultiAgentRegistration,
  context: MultiAgentSystemContext,
  options: NormalizedOptions,
): MultiAgentPeerReviewDraft {
  const dimensions =
    options.includeAllDimensions
      ? REVIEW_DIMENSIONS
      : ROLE_DIMENSIONS[reviewer.identity.role] ??
        Object.freeze([
          "EVIDENCE_QUALITY",
          "RISK",
          "GOVERNANCE",
        ]);

  const scores = Object.freeze(
    dimensions.map((dimension) =>
      buildDimensionScore(
        dimension,
        proposal,
        context,
        reviewer,
        options,
      ),
    ),
  );

  const aggregateScore = average(
    scores.map((score) => score.score),
  );
  const criticalRisk = proposal.risks.some(
    (risk) =>
      risk.severity === "CRITICAL" &&
      risk.probability *
        risk.confidence *
        risk.impact >=
        options.vetoCriticalRiskThreshold,
  );
  const hardConstraintFailure =
    proposal.constraints.some(
      (constraint) =>
        constraint.hard && !constraint.satisfied,
    );
  const requestedChanges = buildRequestedChanges(
    proposal,
    scores,
    criticalRisk,
    hardConstraintFailure,
  );
  const decision = determineDecision(
    aggregateScore,
    criticalRisk,
    hardConstraintFailure,
    requestedChanges,
    reviewer,
  );

  return deepFreeze({
    decision,
    scores,
    supportingEvidence: Object.freeze(
      proposal.evidence
        .filter(
          (evidence) =>
            evidence.direction === "SUPPORTING" ||
            evidence.direction === "CONTEXTUAL",
        )
        .filter(
          (evidence) =>
            evidence.weight *
              evidence.confidence *
              evidence.reliability >=
            options.minimumEvidenceQuality,
        ),
    ),
    concerns: Object.freeze([...proposal.risks]),
    requestedChanges: Object.freeze(requestedChanges),
    confidence: clamp01(
      aggregateScore * 0.6 +
        average(scores.map((score) => score.confidence)) *
          0.4,
    ) as MultiAgentConfidence,
  });
}

function buildDimensionScore(
  dimension: MultiAgentReviewDimension,
  proposal: MultiAgentProposal,
  context: MultiAgentSystemContext,
  reviewer: MultiAgentRegistration,
  options: NormalizedOptions,
): MultiAgentReviewScore {
  const evidenceQuality =
    proposal.evidence.length === 0
      ? 0
      : average(
          proposal.evidence.map(
            (evidence) =>
              evidence.weight *
              evidence.confidence *
              evidence.reliability,
          ),
        );
  const riskPenalty = calculateRiskPenalty(proposal.risks);
  const constraintScore =
    proposal.constraints.length === 0
      ? 1
      : proposal.constraints.filter(
          (constraint) => constraint.satisfied,
        ).length / proposal.constraints.length;
  const executableActionRatio =
    proposal.actions.length === 0
      ? 1
      : proposal.actions.filter(
          (action) =>
            action.type !== "CUSTOM" &&
            !reviewer.authority.restrictedActions.includes(
              action.type,
            ),
        ).length / proposal.actions.length;
  const marketFreshness =
    context.market.generatedAtMs <= context.builtAtMs
      ? 1
      : 0;
  const explanationQuality =
    proposal.title.trim().length > 0 &&
    proposal.thesis.trim().length >= 20 &&
    proposal.invalidationConditions.length > 0
      ? 1
      : 0.5;
  const learningAlignment =
    proposal.assumptions.length > 0 &&
    proposal.invalidationConditions.length > 0
      ? 0.8
      : 0.5;

  let score: number;
  let rationale: string;

  switch (dimension) {
    case "EVIDENCE_QUALITY":
      score = evidenceQuality;
      rationale =
        `Evidence quality is ${formatPercent(score)} across ` +
        `${proposal.evidence.length} evidence items.`;
      break;
    case "MARKET_ALIGNMENT":
      score = clamp01(
        proposal.confidence * 0.65 +
          marketFreshness * 0.35,
      );
      rationale =
        `Market alignment combines proposal confidence and ` +
        `context freshness at ${formatPercent(score)}.`;
      break;
    case "PORTFOLIO_ALIGNMENT":
      score = clamp01(
        constraintScore * 0.65 +
          proposal.expectedUtility.portfolioUtility * 0.35,
      );
      rationale =
        `Portfolio alignment is ${formatPercent(score)} based on ` +
        `constraints and portfolio utility.`;
      break;
    case "RISK":
      score = clamp01(1 - riskPenalty);
      rationale =
        `Risk acceptability is ${formatPercent(score)} after ` +
        `probability-weighted risk penalties.`;
      break;
    case "STRATEGY_ALIGNMENT":
      score = clamp01(
        proposal.expectedUtility.strategyUtility * 0.7 +
          constraintScore * 0.3,
      );
      rationale =
        `Strategy alignment is ${formatPercent(score)}.`;
      break;
    case "ARBITRAGE_VALIDITY":
      score = proposal.actions.some(
        (action) => action.type === "EXECUTE_ARBITRAGE",
      )
        ? clamp01(
            proposal.expectedUtility.arbitrageUtility *
              (1 - riskPenalty),
          )
        : 1;
      rationale =
        `Arbitrage validity is ${formatPercent(score)}.`;
      break;
    case "EXECUTION_FEASIBILITY":
      score = clamp01(
        executableActionRatio * 0.5 +
          proposal.expectedUtility.executionUtility * 0.3 +
          constraintScore * 0.2,
      );
      rationale =
        `Execution feasibility is ${formatPercent(score)}.`;
      break;
    case "GOVERNANCE":
      score = proposal.constraints.some(
        (constraint) =>
          constraint.hard && !constraint.satisfied,
      )
        ? 0
        : clamp01(constraintScore);
      rationale =
        `Governance compliance is ${formatPercent(score)}.`;
      break;
    case "LEARNING_ALIGNMENT":
      score = clamp01(
        learningAlignment * 0.5 +
          proposal.expectedUtility.learningUtility * 0.5,
      );
      rationale =
        `Learning alignment is ${formatPercent(score)}.`;
      break;
    case "EXPLAINABILITY":
      score = clamp01(explanationQuality);
      rationale =
        `Proposal explainability is ${formatPercent(score)}.`;
      break;
  }

  const proficiency = reviewProficiency(
    reviewer,
    dimension,
  );
  const confidence = clamp01(
    proficiency * 0.6 +
      evidenceQuality * 0.25 +
      proposal.confidence * 0.15,
  ) as MultiAgentConfidence;

  void options;

  return deepFreeze({
    dimension,
    score: clamp01(score) as MultiAgentScore,
    confidence,
    rationale,
  });
}

function determineDecision(
  aggregateScore: number,
  criticalRisk: boolean,
  hardConstraintFailure: boolean,
  requestedChanges: readonly string[],
  reviewer: MultiAgentRegistration,
): MultiAgentReviewDecision {
  if (
    criticalRisk &&
    reviewer.authority.mayVeto
  ) {
    return "VETO";
  }

  if (criticalRisk || hardConstraintFailure) {
    return "STRONGLY_OPPOSE";
  }

  if (aggregateScore >= 0.85) {
    return "STRONGLY_SUPPORT";
  }

  if (aggregateScore >= 0.7) {
    return requestedChanges.length > 0
      ? "SUPPORT_WITH_CHANGES"
      : "SUPPORT";
  }

  if (aggregateScore >= 0.5) {
    return requestedChanges.length > 0
      ? "SUPPORT_WITH_CHANGES"
      : "NEUTRAL";
  }

  if (aggregateScore >= 0.3) {
    return "OPPOSE";
  }

  return "STRONGLY_OPPOSE";
}

function buildRequestedChanges(
  proposal: MultiAgentProposal,
  scores: readonly MultiAgentReviewScore[],
  criticalRisk: boolean,
  hardConstraintFailure: boolean,
): string[] {
  const changes: string[] = [];

  if (criticalRisk) {
    changes.push(
      "Resolve or explicitly mitigate all critical risks before approval.",
    );
  }

  if (hardConstraintFailure) {
    changes.push(
      "Satisfy every failed hard constraint before execution.",
    );
  }

  for (const score of scores) {
    if (score.score >= 0.6) {
      continue;
    }

    changes.push(
      requestedChangeForDimension(score.dimension),
    );
  }

  if (proposal.actions.length === 0) {
    changes.push(
      "Add at least one explicit action or declare NO_ACTION.",
    );
  }

  if (proposal.invalidationConditions.length === 0) {
    changes.push(
      "Define explicit proposal invalidation conditions.",
    );
  }

  return normalizeText(changes);
}

function requestedChangeForDimension(
  dimension: MultiAgentReviewDimension,
): string {
  switch (dimension) {
    case "EVIDENCE_QUALITY":
      return "Add stronger, fresher, and independently corroborated evidence.";
    case "MARKET_ALIGNMENT":
      return "Reconcile the proposal with current market and regime conditions.";
    case "PORTFOLIO_ALIGNMENT":
      return "Improve portfolio fit, exposure control, and allocation rationale.";
    case "RISK":
      return "Reduce risk or add explicit mitigations and limits.";
    case "STRATEGY_ALIGNMENT":
      return "Clarify strategy selection and alignment with active objectives.";
    case "ARBITRAGE_VALIDITY":
      return "Revalidate arbitrage economics, timing, venues, and execution assumptions.";
    case "EXECUTION_FEASIBILITY":
      return "Provide a feasible execution path with operational constraints.";
    case "GOVERNANCE":
      return "Resolve governance restrictions and approval requirements.";
    case "LEARNING_ALIGNMENT":
      return "Clarify learning assumptions, feedback signals, and invalidation logic.";
    case "EXPLAINABILITY":
      return "Improve the thesis, evidence traceability, and decision explanation.";
  }
}

function validateInputs(
  proposals: readonly MultiAgentProposal[],
  agents: readonly MultiAgentRegistration[],
  context: MultiAgentSystemContext,
): void {
  if (!Array.isArray(proposals) || !Array.isArray(agents)) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_REQUEST",
      "proposals and agents must be arrays.",
    );
  }

  if (
    context === null ||
    typeof context !== "object" ||
    typeof context.deterministicFingerprint !== "string" ||
    context.deterministicFingerprint.trim().length === 0
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_REQUEST",
      "context must be a valid MultiAgentSystemContext.",
    );
  }

  const proposalIds = new Set<MultiAgentProposalId>();
  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposalId)) {
      throw new MultiAgentPeerReviewEngineError(
        "INVALID_REVIEW_REQUEST",
        `Duplicate proposal "${proposal.proposalId}".`,
        { proposalId: proposal.proposalId },
      );
    }
    proposalIds.add(proposal.proposalId);
  }

  const agentIds = new Set<MultiAgentId>();
  for (const agent of agents) {
    if (agentIds.has(agent.identity.agentId)) {
      throw new MultiAgentPeerReviewEngineError(
        "INVALID_REVIEW_REQUEST",
        `Duplicate agent "${agent.identity.agentId}".`,
        { reviewerAgentId: agent.identity.agentId },
      );
    }
    agentIds.add(agent.identity.agentId);
  }
}

function validateBuilder(
  builder: MultiAgentPeerReviewBuilder,
  options: NormalizedOptions,
): void {
  if (
    typeof builder.agentId !== "string" ||
    builder.agentId.trim().length === 0 ||
    typeof builder.build !== "function"
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_REQUEST",
      "Peer review builder is invalid.",
    );
  }

  if (
    options.requireDeterministicBuilders &&
    !builder.deterministic
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_REQUEST",
      `Builder "${builder.agentId}" must be deterministic.`,
      { reviewerAgentId: builder.agentId },
    );
  }

  if (
    options.requireReplaySafeBuilders &&
    !builder.replaySafe
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_REQUEST",
      `Builder "${builder.agentId}" must be replay-safe.`,
      { reviewerAgentId: builder.agentId },
    );
  }
}

function validateDraft(
  draft: MultiAgentPeerReviewDraft,
  proposalId: MultiAgentProposalId,
  reviewerAgentId: MultiAgentId,
  options: NormalizedOptions,
): void {
  if (
    draft === null ||
    typeof draft !== "object" ||
    !isReviewDecision(draft.decision) ||
    !Array.isArray(draft.scores)
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_DRAFT",
      "Peer review draft is invalid.",
      { proposalId, reviewerAgentId },
    );
  }

  if (
    options.includeAllDimensions &&
    new Set(draft.scores.map((score) => score.dimension))
      .size !== REVIEW_DIMENSIONS.length
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW_DRAFT",
      "Peer review draft must include all review dimensions.",
      { proposalId, reviewerAgentId },
    );
  }
}

function validateReview(
  review: MultiAgentPeerReview,
): void {
  if (
    review.reviewId.trim().length === 0 ||
    review.proposalId.trim().length === 0 ||
    review.reviewerAgentId.trim().length === 0 ||
    !isReviewDecision(review.decision) ||
    review.scores.length === 0 ||
    review.confidence < 0 ||
    review.confidence > 1 ||
    !Number.isSafeInteger(review.reviewedAtMs) ||
    review.reviewedAtMs < 0 ||
    review.deterministicFingerprint.trim().length === 0
  ) {
    throw new MultiAgentPeerReviewEngineError(
      "INVALID_REVIEW",
      `Review "${review.reviewId}" is invalid.`,
      {
        reviewId: review.reviewId,
        proposalId: review.proposalId,
        reviewerAgentId: review.reviewerAgentId,
      },
    );
  }

  const dimensions =
    new Set<MultiAgentReviewDimension>();

  for (const score of review.scores) {
    if (
      dimensions.has(score.dimension) ||
      score.score < 0 ||
      score.score > 1 ||
      score.confidence < 0 ||
      score.confidence > 1 ||
      score.rationale.trim().length === 0
    ) {
      throw new MultiAgentPeerReviewEngineError(
        "INVALID_REVIEW",
        `Review "${review.reviewId}" has an invalid score.`,
        {
          reviewId: review.reviewId,
          proposalId: review.proposalId,
          reviewerAgentId: review.reviewerAgentId,
        },
      );
    }
    dimensions.add(score.dimension);
  }
}

function isEligibleReviewer(
  agent: MultiAgentRegistration,
  options: NormalizedOptions,
): boolean {
  const capabilitySatisfied =
    !options.requireReviewCapability ||
    agent.capabilities.some(
      (capability) =>
        capability.enabled &&
        (capability.capability === "REVIEW_PROPOSAL" ||
          capability.capability === "CHALLENGE_PROPOSAL"),
    );
  const authoritySatisfied =
    !options.requireReviewAuthority ||
    agent.authority.mayReview;

  return capabilitySatisfied && authoritySatisfied;
}

function normalizeScores(
  scores: readonly MultiAgentReviewScore[],
  reviewer: MultiAgentRegistration,
  options: NormalizedOptions,
): MultiAgentReviewScore[] {
  const byDimension =
    new Map<MultiAgentReviewDimension, MultiAgentReviewScore>();

  for (const score of scores) {
    if (
      !REVIEW_DIMENSIONS.includes(score.dimension) ||
      !Number.isFinite(score.score) ||
      !Number.isFinite(score.confidence) ||
      score.rationale.trim().length === 0
    ) {
      throw new MultiAgentPeerReviewEngineError(
        "INVALID_REVIEW_DRAFT",
        `Reviewer "${reviewer.identity.agentId}" returned an invalid score.`,
        { reviewerAgentId: reviewer.identity.agentId },
      );
    }

    if (byDimension.has(score.dimension)) {
      throw new MultiAgentPeerReviewEngineError(
        "INVALID_REVIEW_DRAFT",
        `Reviewer "${reviewer.identity.agentId}" returned duplicate dimension "${score.dimension}".`,
        { reviewerAgentId: reviewer.identity.agentId },
      );
    }

    byDimension.set(
      score.dimension,
      deepFreeze({
        dimension: score.dimension,
        score: clamp01(score.score) as MultiAgentScore,
        confidence: clamp01(
          score.confidence,
        ) as MultiAgentConfidence,
        rationale: score.rationale.trim(),
      }),
    );
  }

  if (options.includeAllDimensions) {
    for (const dimension of REVIEW_DIMENSIONS) {
      if (!byDimension.has(dimension)) {
        throw new MultiAgentPeerReviewEngineError(
          "INVALID_REVIEW_DRAFT",
          `Reviewer "${reviewer.identity.agentId}" omitted dimension "${dimension}".`,
          { reviewerAgentId: reviewer.identity.agentId },
        );
      }
    }
  }

  return [...byDimension.values()].sort((left, right) =>
    left.dimension.localeCompare(right.dimension),
  );
}

function deduplicateEvidence(
  evidence: readonly MultiAgentEvidence[],
): MultiAgentEvidence[] {
  const byId =
    new Map<MultiAgentKnowledgeId, MultiAgentEvidence>();

  for (const item of evidence) {
    const current = byId.get(item.evidenceId);

    if (
      current === undefined ||
      evidenceQuality(item) > evidenceQuality(current)
    ) {
      byId.set(item.evidenceId, deepFreeze(item));
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  );
}

function deduplicateRisks(
  risks: readonly MultiAgentRiskFinding[],
): MultiAgentRiskFinding[] {
  const byKey = new Map<string, MultiAgentRiskFinding>();

  for (const risk of risks) {
    const key = `${risk.code}:${risk.name}`;
    const current = byKey.get(key);

    if (
      current === undefined ||
      riskMagnitude(risk) > riskMagnitude(current)
    ) {
      byKey.set(key, deepFreeze(risk));
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const difference =
      riskSeverityRank(right.severity) -
      riskSeverityRank(left.severity);

    return difference !== 0
      ? difference
      : left.code.localeCompare(right.code);
  });
}

function buildRecord(
  review: MultiAgentPeerReview,
  options: NormalizedOptions,
): MultiAgentPeerReviewRecord {
  const aggregateScore = average(
    review.scores.map((score) => score.score),
  ) as MultiAgentScore;

  return deepFreeze({
    reviewId: review.reviewId,
    proposalId: review.proposalId,
    reviewerAgentId: review.reviewerAgentId,
    decision: review.decision,
    aggregateScore,
    confidence: review.confidence,
    reviewedAtMs: review.reviewedAtMs,
    deterministicFingerprint:
      options.fingerprintFactory({
        reviewId: review.reviewId,
        proposalId: review.proposalId,
        reviewerAgentId: review.reviewerAgentId,
        decision: review.decision,
        aggregateScore,
        confidence: review.confidence,
        reviewedAtMs: review.reviewedAtMs,
        reviewFingerprint:
          review.deterministicFingerprint,
      }),
  });
}

function calculateReviewConfidence(
  scores: readonly MultiAgentReviewScore[],
  evidence: readonly MultiAgentEvidence[],
): number {
  const scoreConfidence =
    scores.length === 0
      ? 0
      : average(
          scores.map((score) => score.confidence),
        );
  const evidenceConfidence =
    evidence.length === 0
      ? 0
      : average(
          evidence.map(
            (item) =>
              item.confidence * item.reliability,
          ),
        );

  return clamp01(
    scoreConfidence * 0.65 +
      evidenceConfidence * 0.35,
  );
}

function calculateRiskPenalty(
  risks: readonly MultiAgentRiskFinding[],
): number {
  if (risks.length === 0) {
    return 0;
  }

  const weighted = risks.map(
    (risk) =>
      risk.impact *
      risk.probability *
      risk.confidence *
      (riskSeverityRank(risk.severity) / 5),
  );

  return clamp01(average(weighted));
}

function reviewProficiency(
  reviewer: MultiAgentRegistration,
  dimension: MultiAgentReviewDimension,
): number {
  const preferredCapabilities =
    capabilitiesForDimension(dimension);
  const scores = reviewer.capabilities
    .filter(
      (capability) =>
        capability.enabled &&
        preferredCapabilities.includes(
          capability.capability,
        ),
    )
    .map((capability) => capability.proficiency);

  return scores.length > 0
    ? clamp01(Math.max(...scores))
    : 0.5;
}

function capabilitiesForDimension(
  dimension: MultiAgentReviewDimension,
): readonly MultiAgentRegistration["capabilities"][number]["capability"][] {
  switch (dimension) {
    case "EVIDENCE_QUALITY":
      return Object.freeze([
        "REVIEW_PROPOSAL",
        "CHALLENGE_PROPOSAL",
      ]);
    case "MARKET_ALIGNMENT":
      return Object.freeze([
        "OBSERVE_MARKET_INTELLIGENCE",
        "ASSESS_MARKET_REGIME",
      ]);
    case "PORTFOLIO_ALIGNMENT":
      return Object.freeze([
        "ASSESS_PORTFOLIO",
        "ALLOCATE_STRATEGY_CAPITAL",
      ]);
    case "RISK":
      return Object.freeze([
        "ASSESS_RISK",
        "CHALLENGE_PROPOSAL",
      ]);
    case "STRATEGY_ALIGNMENT":
      return Object.freeze([
        "ASSESS_STRATEGY",
        "SELECT_STRATEGIES",
      ]);
    case "ARBITRAGE_VALIDITY":
      return Object.freeze(["ASSESS_ARBITRAGE"]);
    case "EXECUTION_FEASIBILITY":
      return Object.freeze([
        "PLAN_EXECUTION",
        "APPROVE_EXECUTION",
      ]);
    case "GOVERNANCE":
      return Object.freeze([
        "EVALUATE_GOVERNANCE",
        "REVIEW_PROPOSAL",
      ]);
    case "LEARNING_ALIGNMENT":
      return Object.freeze(["LEARN_FROM_OUTCOME"]);
    case "EXPLAINABILITY":
      return Object.freeze(["EXPLAIN_DECISION"]);
  }
}

function compareReviewerSuitability(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
  proposal: MultiAgentProposal,
): number {
  const leftScore = reviewerSuitability(left, proposal);
  const rightScore = reviewerSuitability(right, proposal);

  return leftScore !== rightScore
    ? rightScore - leftScore
    : left.identity.agentId.localeCompare(
        right.identity.agentId,
      );
}

function reviewerSuitability(
  reviewer: MultiAgentRegistration,
  proposal: MultiAgentProposal,
): number {
  const reviewCapability = reviewer.capabilities.find(
    (capability) =>
      capability.capability === "REVIEW_PROPOSAL" &&
      capability.enabled,
  );
  const challengeCapability = reviewer.capabilities.find(
    (capability) =>
      capability.capability === "CHALLENGE_PROPOSAL" &&
      capability.enabled,
  );
  const roleBonus =
    reviewer.identity.role === "RISK_AGENT" &&
    proposal.risks.length > 0
      ? 0.15
      : reviewer.identity.role === "GOVERNANCE_AGENT" &&
          proposal.constraints.length > 0
        ? 0.15
        : reviewer.identity.role === "EXECUTION_AGENT" &&
            proposal.actions.length > 0
          ? 0.15
          : 0;

  return clamp01(
    (reviewCapability?.proficiency ?? 0) * 0.55 +
      (challengeCapability?.proficiency ?? 0) * 0.3 +
      roleBonus,
  );
}

function compareAgents(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
): number {
  return left.identity.agentId.localeCompare(
    right.identity.agentId,
  );
}

function compareProposals(
  left: MultiAgentProposal,
  right: MultiAgentProposal,
): number {
  if (
    left.expectedUtility.totalUtility !==
    right.expectedUtility.totalUtility
  ) {
    return (
      right.expectedUtility.totalUtility -
      left.expectedUtility.totalUtility
    );
  }

  return left.proposalId.localeCompare(right.proposalId);
}

function compareReviews(
  left: MultiAgentPeerReview,
  right: MultiAgentPeerReview,
): number {
  const proposalDifference =
    left.proposalId.localeCompare(right.proposalId);

  return proposalDifference !== 0
    ? proposalDifference
    : left.reviewerAgentId.localeCompare(
        right.reviewerAgentId,
      );
}

function isReviewDecision(
  value: unknown,
): value is MultiAgentReviewDecision {
  return (
    value === "STRONGLY_SUPPORT" ||
    value === "SUPPORT" ||
    value === "SUPPORT_WITH_CHANGES" ||
    value === "NEUTRAL" ||
    value === "OPPOSE" ||
    value === "STRONGLY_OPPOSE" ||
    value === "VETO"
  );
}

function evidenceQuality(
  evidence: MultiAgentEvidence,
): number {
  return (
    evidence.weight *
    evidence.confidence *
    evidence.reliability
  );
}

function riskMagnitude(
  risk: MultiAgentRiskFinding,
): number {
  return (
    riskSeverityRank(risk.severity) *
    risk.probability *
    risk.confidence *
    risk.impact
  );
}

function riskSeverityRank(
  severity: MultiAgentRiskFinding["severity"],
): number {
  switch (severity) {
    case "CRITICAL":
      return 5;
    case "HIGH":
      return 4;
    case "MODERATE":
      return 3;
    case "LOW":
      return 2;
    case "INFORMATIONAL":
      return 1;
  }
}

function normalizeText(values: readonly string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ].sort();
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function formatPercent(value: number): string {
  return `${(clamp01(value) * 100).toFixed(2)}%`;
}

function normalizeOptions(
  options: MultiAgentPeerReviewEngineOptions,
): NormalizedOptions {
  const maximumReviews = options.maximumReviews ?? 128;
  const maximumReviewersPerProposal =
    options.maximumReviewersPerProposal ?? 3;
  const minimumReviewersPerProposal =
    options.minimumReviewersPerProposal ?? 1;

  assertPositiveInteger(
    maximumReviews,
    "maximumReviews",
  );
  assertPositiveInteger(
    maximumReviewersPerProposal,
    "maximumReviewersPerProposal",
  );
  assertPositiveInteger(
    minimumReviewersPerProposal,
    "minimumReviewersPerProposal",
  );

  if (
    minimumReviewersPerProposal >
    maximumReviewersPerProposal
  ) {
    throw new RangeError(
      "minimumReviewersPerProposal cannot exceed maximumReviewersPerProposal.",
    );
  }

  return Object.freeze({
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    maximumReviews,
    maximumReviewersPerProposal,
    minimumReviewersPerProposal,
    prohibitSelfReview:
      options.prohibitSelfReview ?? true,
    allowFallbackReviews:
      options.allowFallbackReviews ?? true,
    requireDeterministicBuilders:
      options.requireDeterministicBuilders ?? true,
    requireReplaySafeBuilders:
      options.requireReplaySafeBuilders ?? true,
    requireReviewCapability:
      options.requireReviewCapability ?? true,
    requireReviewAuthority:
      options.requireReviewAuthority ?? true,
    rejectStaleProposals:
      options.rejectStaleProposals ?? true,
    includeAllDimensions:
      options.includeAllDimensions ?? false,
    minimumEvidenceQuality: clamp01(
      options.minimumEvidenceQuality ?? 0,
    ) as MultiAgentScore,
    vetoCriticalRiskThreshold: clamp01(
      options.vetoCriticalRiskThreshold ?? 0.65,
    ) as MultiAgentScore,
    reviewIdFactory:
      options.reviewIdFactory ??
      defaultReviewIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
  });
}

function assertPositiveInteger(
  value: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(
      `${name} must be a positive integer.`,
    );
  }
}

function defaultReviewIdFactory(
  prefix: string,
  seed: string,
): MultiAgentReviewId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultFingerprintFactory(value: unknown): string {
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