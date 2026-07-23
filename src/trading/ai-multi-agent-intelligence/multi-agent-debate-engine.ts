/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-debate-engine.ts
 *
 * Deterministic, bounded, replay-safe multi-agent debate orchestration.
 */

import {
  type MultiAgentConfidence,
  type MultiAgentDebateEnginePort,
  type MultiAgentDebatePolicy,
  type MultiAgentDebatePosition,
  type MultiAgentDebateStatement,
  type MultiAgentDebateTranscript,
  type MultiAgentId,
  type MultiAgentKnowledgeId,
  type MultiAgentPeerReview,
  type MultiAgentProposal,
  type MultiAgentProposalId,
  type MultiAgentRegistration,
  type MultiAgentReviewDecision,
  type MultiAgentScore,
  type MultiAgentSessionId,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentDebateEngineErrorCode =
  | "INVALID_DEBATE_INPUT"
  | "INVALID_DEBATE_POLICY"
  | "NO_ELIGIBLE_DEBATERS"
  | "DEBATE_BUILDER_ALREADY_REGISTERED"
  | "DEBATE_BUILDER_NOT_FOUND"
  | "DEBATE_BUILDER_FAILED"
  | "INVALID_DEBATE_STATEMENT"
  | "DUPLICATE_STATEMENT_ID"
  | "STATEMENT_LIMIT_EXCEEDED"
  | "MISSING_EVIDENCE_REFERENCE";

export interface MultiAgentDebateEngineErrorDetails {
  readonly proposalId?: MultiAgentProposalId;
  readonly agentId?: MultiAgentId;
  readonly statementId?: string;
  readonly round?: number;
  readonly cause?: unknown;
}

export class MultiAgentDebateEngineError extends Error {
  public readonly code: MultiAgentDebateEngineErrorCode;
  public readonly details: MultiAgentDebateEngineErrorDetails;

  public constructor(
    code: MultiAgentDebateEngineErrorCode,
    message: string,
    details: MultiAgentDebateEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentDebateEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentDebateClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentDebateStatementDraft {
  readonly position: MultiAgentDebatePosition;
  readonly claim: string;
  readonly evidenceIds?: readonly MultiAgentKnowledgeId[];
  readonly respondsToStatementId?: string;
  readonly confidence?: MultiAgentConfidence;
}

export interface MultiAgentDebateBuildContext {
  readonly proposal: MultiAgentProposal;
  readonly reviews: readonly MultiAgentPeerReview[];
  readonly agent: MultiAgentRegistration;
  readonly round: number;
  readonly previousStatements: readonly MultiAgentDebateStatement[];
  readonly deterministicSeed: string;
  readonly createdAtMs: MultiAgentTimestamp;
}

export interface MultiAgentDebateStatementBuilder {
  readonly agentId: MultiAgentId;
  readonly deterministic: boolean;
  readonly replaySafe: boolean;

  build(
    context: MultiAgentDebateBuildContext,
  ):
    | readonly MultiAgentDebateStatementDraft[]
    | Promise<readonly MultiAgentDebateStatementDraft[]>;
}

export interface MultiAgentDebateEngineOptions {
  readonly builders?: readonly MultiAgentDebateStatementBuilder[];
  readonly clock?: MultiAgentDebateClock;
  readonly allowFallbackStatements?: boolean;
  readonly requireDeterministicBuilders?: boolean;
  readonly requireReplaySafeBuilders?: boolean;
  readonly requireDebateCapability?: boolean;
  readonly requireDebateAuthority?: boolean;
  readonly maximumTotalStatements?: number;
  readonly sessionIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentSessionId;
  readonly statementIdFactory?: (
    prefix: string,
    seed: string,
  ) => string;
  readonly fingerprintFactory?: (value: unknown) => string;
}

export interface MultiAgentDebateSnapshot {
  readonly sessionId?: MultiAgentSessionId;
  readonly proposalIds: readonly MultiAgentProposalId[];
  readonly statementCount: number;
  readonly roundsCompleted: number;
  readonly converged: boolean;
  readonly convergenceScore: MultiAgentScore;
  readonly capturedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentDebateClock;
  readonly allowFallbackStatements: boolean;
  readonly requireDeterministicBuilders: boolean;
  readonly requireReplaySafeBuilders: boolean;
  readonly requireDebateCapability: boolean;
  readonly requireDebateAuthority: boolean;
  readonly maximumTotalStatements: number;
  readonly sessionIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentSessionId;
  readonly statementIdFactory: (
    prefix: string,
    seed: string,
  ) => string;
  readonly fingerprintFactory: (value: unknown) => string;
}

const SUPPORT_DECISIONS: readonly MultiAgentReviewDecision[] =
  Object.freeze([
    "STRONGLY_SUPPORT",
    "SUPPORT",
    "SUPPORT_WITH_CHANGES",
  ]);

const OPPOSE_DECISIONS: readonly MultiAgentReviewDecision[] =
  Object.freeze([
    "OPPOSE",
    "STRONGLY_OPPOSE",
    "VETO",
  ]);

export class MultiAgentDebateEngine
  implements MultiAgentDebateEnginePort
{
  private readonly builders =
    new Map<MultiAgentId, MultiAgentDebateStatementBuilder>();

  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentDebateSnapshot;

  public constructor(options: MultiAgentDebateEngineOptions = {}) {
    this.options = normalizeOptions(options);

    for (const builder of options.builders ?? []) {
      this.registerBuilder(builder);
    }

    this.lastSnapshotValue = deepFreeze({
      proposalIds: Object.freeze([]),
      statementCount: 0,
      roundsCompleted: 0,
      converged: false,
      convergenceScore: 0 as MultiAgentScore,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          proposalIds: [],
          statements: [],
        }),
    });
  }

  public registerBuilder(
    builder: MultiAgentDebateStatementBuilder,
  ): void {
    validateBuilder(builder, this.options);

    if (this.builders.has(builder.agentId)) {
      throw new MultiAgentDebateEngineError(
        "DEBATE_BUILDER_ALREADY_REGISTERED",
        `A debate builder is already registered for "${builder.agentId}".`,
        { agentId: builder.agentId },
      );
    }

    this.builders.set(builder.agentId, builder);
  }

  public replaceBuilder(
    builder: MultiAgentDebateStatementBuilder,
  ): void {
    validateBuilder(builder, this.options);
    this.builders.set(builder.agentId, builder);
  }

  public unregisterBuilder(agentId: MultiAgentId): void {
    this.builders.delete(agentId);
  }

  public getBuilder(
    agentId: MultiAgentId,
  ): MultiAgentDebateStatementBuilder | undefined {
    return this.builders.get(agentId);
  }

  public listBuilders(): readonly MultiAgentDebateStatementBuilder[] {
    return Object.freeze(
      [...this.builders.values()].sort((left, right) =>
        left.agentId.localeCompare(right.agentId),
      ),
    );
  }

  public snapshot(): MultiAgentDebateSnapshot {
    return this.lastSnapshotValue;
  }

  public async debate(
    proposals: readonly MultiAgentProposal[],
    reviews: readonly MultiAgentPeerReview[],
    agents: readonly MultiAgentRegistration[],
    policy: MultiAgentDebatePolicy,
  ): Promise<MultiAgentDebateTranscript> {
    validateInputs(proposals, reviews, agents);
    validatePolicy(policy);

    const orderedProposals = [...proposals].sort(compareProposals);
    const proposalIds = Object.freeze(
      orderedProposals.map((proposal) => proposal.proposalId),
    );
    const startedAtMs = this.options.clock.now();
    const sessionId = this.options.sessionIdFactory(
      "debate",
      this.options.fingerprintFactory({
        proposalIds,
        reviewFingerprints: reviews
          .map((review) => review.deterministicFingerprint)
          .sort(),
        agentIds: agents
          .map((agent) => agent.identity.agentId)
          .sort(),
        policy,
        startedAtMs,
      }),
    );

    if (!policy.enabled || orderedProposals.length === 0) {
      return this.finalizeTranscript(
        sessionId,
        proposalIds,
        Object.freeze([]),
        0,
        true,
        1 as MultiAgentScore,
        Object.freeze([]),
        startedAtMs,
      );
    }

    const materialConflict = detectMaterialConflict(
      orderedProposals,
      reviews,
    );
    const initialAgreement = calculateReviewAgreement(reviews);
    const shouldDebate =
      (policy.triggerOnMaterialConflict && materialConflict) ||
      (policy.triggerOnLowAgreement &&
        initialAgreement < policy.agreementThreshold);

    if (!shouldDebate) {
      return this.finalizeTranscript(
        sessionId,
        proposalIds,
        Object.freeze([]),
        0,
        true,
        initialAgreement as MultiAgentScore,
        Object.freeze([]),
        startedAtMs,
      );
    }

    const eligibleAgents = agents
      .filter((agent) => isEligibleDebater(agent, this.options))
      .sort(compareAgents);

    if (eligibleAgents.length === 0) {
      throw new MultiAgentDebateEngineError(
        "NO_ELIGIBLE_DEBATERS",
        "No selected agent is eligible to participate in debate.",
      );
    }

    const statements: MultiAgentDebateStatement[] = [];
    const statementIds = new Set<string>();
    let roundsCompleted = 0;
    let convergenceScore = initialAgreement;
    let converged =
      convergenceScore >= policy.convergenceThreshold;

    for (
      let round = 1;
      round <= policy.maximumRounds;
      round += 1
    ) {
      if (policy.stopOnConvergence && converged) {
        break;
      }

      for (const proposal of orderedProposals) {
        const proposalReviews = reviews
          .filter(
            (review) =>
              review.proposalId === proposal.proposalId,
          )
          .sort(compareReviews);

        const debaters = rankDebatersForProposal(
          eligibleAgents,
          proposal,
          proposalReviews,
        );

        for (const agent of debaters) {
          const drafts = await this.generateDrafts(
            proposal,
            proposalReviews,
            agent,
            round,
            Object.freeze([...statements]),
            startedAtMs,
          );

          const limitedDrafts = drafts.slice(
            0,
            policy.maximumStatementsPerAgentPerRound,
          );

          for (const draft of limitedDrafts) {
            if (
              statements.length >=
              this.options.maximumTotalStatements
            ) {
              throw new MultiAgentDebateEngineError(
                "STATEMENT_LIMIT_EXCEEDED",
                `Debate exceeded maximum ${this.options.maximumTotalStatements} statements.`,
                {
                  proposalId: proposal.proposalId,
                  agentId: agent.identity.agentId,
                  round,
                },
              );
            }

            const statement = materializeStatement(
              proposal,
              agent,
              draft,
              round,
              statements,
              startedAtMs,
              this.options,
            );

            if (
              policy.requireEvidenceReferences &&
              statement.evidenceIds.length === 0
            ) {
              throw new MultiAgentDebateEngineError(
                "MISSING_EVIDENCE_REFERENCE",
                `Statement "${statement.statementId}" requires at least one evidence reference.`,
                {
                  proposalId: proposal.proposalId,
                  agentId: agent.identity.agentId,
                  statementId: statement.statementId,
                  round,
                },
              );
            }

            if (statementIds.has(statement.statementId)) {
              throw new MultiAgentDebateEngineError(
                "DUPLICATE_STATEMENT_ID",
                `Duplicate statement id "${statement.statementId}".`,
                {
                  proposalId: proposal.proposalId,
                  agentId: agent.identity.agentId,
                  statementId: statement.statementId,
                  round,
                },
              );
            }

            statementIds.add(statement.statementId);
            statements.push(statement);
          }
        }
      }

      roundsCompleted = round;
      convergenceScore = calculateDebateConvergence(
        orderedProposals,
        reviews,
        statements,
      );
      converged =
        convergenceScore >= policy.convergenceThreshold;
    }

    const unresolvedQuestions = Object.freeze(
      buildUnresolvedQuestions(
        orderedProposals,
        reviews,
        statements,
        converged,
      ),
    );

    return this.finalizeTranscript(
      sessionId,
      proposalIds,
      Object.freeze([...statements].sort(compareStatements)),
      roundsCompleted,
      converged,
      convergenceScore as MultiAgentScore,
      unresolvedQuestions,
      startedAtMs,
    );
  }

  private async generateDrafts(
    proposal: MultiAgentProposal,
    reviews: readonly MultiAgentPeerReview[],
    agent: MultiAgentRegistration,
    round: number,
    previousStatements: readonly MultiAgentDebateStatement[],
    createdAtMs: MultiAgentTimestamp,
  ): Promise<readonly MultiAgentDebateStatementDraft[]> {
    const builder = this.builders.get(agent.identity.agentId);

    if (builder === undefined) {
      if (!this.options.allowFallbackStatements) {
        throw new MultiAgentDebateEngineError(
          "DEBATE_BUILDER_NOT_FOUND",
          `No debate builder is registered for "${agent.identity.agentId}".`,
          {
            proposalId: proposal.proposalId,
            agentId: agent.identity.agentId,
            round,
          },
        );
      }

      return buildFallbackDrafts(
        proposal,
        reviews,
        agent,
        round,
        previousStatements,
      );
    }

    try {
      const drafts = await builder.build(
        deepFreeze({
          proposal,
          reviews,
          agent,
          round,
          previousStatements,
          deterministicSeed:
            this.options.fingerprintFactory({
              proposalFingerprint:
                proposal.deterministicFingerprint,
              reviewFingerprints: reviews.map(
                (review) =>
                  review.deterministicFingerprint,
              ),
              agentId: agent.identity.agentId,
              round,
              previousStatementIds:
                previousStatements.map(
                  (statement) =>
                    statement.statementId,
                ),
            }),
          createdAtMs,
        }),
      );

      if (!Array.isArray(drafts)) {
        throw new MultiAgentDebateEngineError(
          "INVALID_DEBATE_STATEMENT",
          `Debate builder "${agent.identity.agentId}" did not return an array.`,
          {
            proposalId: proposal.proposalId,
            agentId: agent.identity.agentId,
            round,
          },
        );
      }

      return deepFreeze([...drafts]);
    } catch (error: unknown) {
      if (error instanceof MultiAgentDebateEngineError) {
        throw error;
      }

      throw new MultiAgentDebateEngineError(
        "DEBATE_BUILDER_FAILED",
        `Debate builder "${agent.identity.agentId}" failed.`,
        {
          proposalId: proposal.proposalId,
          agentId: agent.identity.agentId,
          round,
          cause: error,
        },
      );
    }
  }

  private finalizeTranscript(
    sessionId: MultiAgentSessionId,
    proposalIds: readonly MultiAgentProposalId[],
    statements: readonly MultiAgentDebateStatement[],
    roundsCompleted: number,
    converged: boolean,
    convergenceScore: MultiAgentScore,
    unresolvedQuestions: readonly string[],
    capturedAtMs: MultiAgentTimestamp,
  ): MultiAgentDebateTranscript {
    const transcript: MultiAgentDebateTranscript =
      deepFreeze({
        sessionId,
        proposalIds,
        roundsCompleted,
        statements,
        unresolvedQuestions,
        converged,
        convergenceScore,
        deterministicFingerprint:
          this.options.fingerprintFactory({
            sessionId,
            proposalIds,
            roundsCompleted,
            statements,
            unresolvedQuestions,
            converged,
            convergenceScore,
          }),
      });

    this.lastSnapshotValue = deepFreeze({
      sessionId,
      proposalIds,
      statementCount: statements.length,
      roundsCompleted,
      converged,
      convergenceScore,
      capturedAtMs,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          sessionId,
          proposalIds,
          statementIds: statements.map(
            (statement) => statement.statementId,
          ),
          roundsCompleted,
          converged,
          convergenceScore,
        }),
    });

    return transcript;
  }
}

export function createMultiAgentDebateEngine(
  options: MultiAgentDebateEngineOptions = {},
): MultiAgentDebateEngine {
  return new MultiAgentDebateEngine(options);
}

function buildFallbackDrafts(
  proposal: MultiAgentProposal,
  reviews: readonly MultiAgentPeerReview[],
  agent: MultiAgentRegistration,
  round: number,
  previousStatements: readonly MultiAgentDebateStatement[],
): readonly MultiAgentDebateStatementDraft[] {
  const ownReview = reviews.find(
    (review) =>
      review.reviewerAgentId === agent.identity.agentId,
  );
  const position = positionFromReview(ownReview?.decision);
  const evidenceIds = chooseEvidenceIds(
    proposal,
    ownReview,
    position,
  );
  const responseTarget = chooseResponseTarget(
    previousStatements,
    position,
    proposal,
  );
  const confidence =
    ownReview?.confidence ??
    proposal.confidence;

  const claim =
    round === 1
      ? buildOpeningClaim(
          proposal,
          ownReview,
          position,
        )
      : buildResponseClaim(
          proposal,
          ownReview,
          position,
          responseTarget,
        );

  return Object.freeze([
    deepFreeze({
      position,
      claim,
      evidenceIds,
      respondsToStatementId:
        responseTarget?.statementId,
      confidence,
    }),
  ]);
}

function buildOpeningClaim(
  proposal: MultiAgentProposal,
  review: MultiAgentPeerReview | undefined,
  position: MultiAgentDebatePosition,
): string {
  switch (position) {
    case "AFFIRMATIVE":
      return (
        `I support proposal "${proposal.title}" because its ` +
        `expected utility is ${formatScore(
          proposal.expectedUtility.totalUtility,
        )} and the available evidence supports the thesis.`
      );
    case "NEGATIVE":
      return (
        `I oppose proposal "${proposal.title}" because ` +
        `${review?.concerns.length ?? proposal.risks.length} material concern(s) remain unresolved.`
      );
    case "ARBITER":
      return (
        `Proposal "${proposal.title}" requires arbitration across conflicting reviews, constraints, and risk findings.`
      );
    case "NEUTRAL":
      return (
        `I remain neutral on proposal "${proposal.title}" pending stronger evidence and clearer resolution of outstanding questions.`
      );
  }
}

function buildResponseClaim(
  proposal: MultiAgentProposal,
  review: MultiAgentPeerReview | undefined,
  position: MultiAgentDebatePosition,
  target: MultiAgentDebateStatement | undefined,
): string {
  const responsePrefix =
    target === undefined
      ? "No opposing statement requires a direct response."
      : `In response to "${target.claim}",`;

  switch (position) {
    case "AFFIRMATIVE":
      return (
        `${responsePrefix} the proposal remains supportable because ` +
        `its constraints and evidence provide a defensible execution basis.`
      );
    case "NEGATIVE":
      return (
        `${responsePrefix} the proposal should not advance until ` +
        `${review?.requestedChanges.length ?? 0} requested change(s) are resolved.`
      );
    case "ARBITER":
      return (
        `${responsePrefix} the decisive issue is whether the identified ` +
        `risk and governance concerns outweigh expected utility.`
      );
    case "NEUTRAL":
      return (
        `${responsePrefix} the available record remains insufficient to ` +
        `resolve the proposal with high confidence.`
      );
  }
}

function materializeStatement(
  proposal: MultiAgentProposal,
  agent: MultiAgentRegistration,
  draft: MultiAgentDebateStatementDraft,
  round: number,
  previousStatements: readonly MultiAgentDebateStatement[],
  createdAtMs: MultiAgentTimestamp,
  options: NormalizedOptions,
): MultiAgentDebateStatement {
  validateDraft(
    draft,
    proposal.proposalId,
    agent.identity.agentId,
    round,
    previousStatements,
  );

  const evidenceIds = Object.freeze(
    [
      ...new Set(
        (draft.evidenceIds ?? []).filter(
          (evidenceId) =>
            proposal.evidence.some(
              (evidence) =>
                evidence.evidenceId === evidenceId,
            ),
        ),
      ),
    ].sort(),
  );
  const confidence = clamp01(
    draft.confidence ?? proposal.confidence,
  ) as MultiAgentConfidence;
  const statementId = options.statementIdFactory(
    "statement",
    options.fingerprintFactory({
      proposalId: proposal.proposalId,
      agentId: agent.identity.agentId,
      round,
      position: draft.position,
      claim: draft.claim.trim(),
      evidenceIds,
      respondsToStatementId:
        draft.respondsToStatementId,
      confidence,
      createdAtMs,
    }),
  );

  return deepFreeze({
    statementId,
    debateRound: round,
    agentId: agent.identity.agentId,
    position: draft.position,
    claim: draft.claim.trim(),
    evidenceIds,
    respondsToStatementId:
      draft.respondsToStatementId,
    confidence,
    createdAtMs,
  });
}

function validateDraft(
  draft: MultiAgentDebateStatementDraft,
  proposalId: MultiAgentProposalId,
  agentId: MultiAgentId,
  round: number,
  previousStatements: readonly MultiAgentDebateStatement[],
): void {
  if (
    draft === null ||
    typeof draft !== "object" ||
    !isDebatePosition(draft.position) ||
    typeof draft.claim !== "string" ||
    draft.claim.trim().length === 0
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_STATEMENT",
      "Debate statement draft is invalid.",
      { proposalId, agentId, round },
    );
  }

  if (
    draft.respondsToStatementId !== undefined &&
    !previousStatements.some(
      (statement) =>
        statement.statementId ===
        draft.respondsToStatementId,
    )
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_STATEMENT",
      `Statement response target "${draft.respondsToStatementId}" does not exist.`,
      {
        proposalId,
        agentId,
        round,
        statementId:
          draft.respondsToStatementId,
      },
    );
  }
}

function validateInputs(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
  agents: readonly MultiAgentRegistration[],
): void {
  if (
    !Array.isArray(proposals) ||
    !Array.isArray(reviews) ||
    !Array.isArray(agents)
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_INPUT",
      "proposals, reviews, and agents must be arrays.",
    );
  }

  const proposalIds =
    new Set<MultiAgentProposalId>();

  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposalId)) {
      throw new MultiAgentDebateEngineError(
        "INVALID_DEBATE_INPUT",
        `Duplicate proposal "${proposal.proposalId}".`,
        { proposalId: proposal.proposalId },
      );
    }

    proposalIds.add(proposal.proposalId);
  }

  const agentIds = new Set<MultiAgentId>();

  for (const agent of agents) {
    if (agentIds.has(agent.identity.agentId)) {
      throw new MultiAgentDebateEngineError(
        "INVALID_DEBATE_INPUT",
        `Duplicate agent "${agent.identity.agentId}".`,
        { agentId: agent.identity.agentId },
      );
    }

    agentIds.add(agent.identity.agentId);
  }

  for (const review of reviews) {
    if (!proposalIds.has(review.proposalId)) {
      throw new MultiAgentDebateEngineError(
        "INVALID_DEBATE_INPUT",
        `Review "${review.reviewId}" references an unknown proposal.`,
        {
          proposalId: review.proposalId,
          agentId: review.reviewerAgentId,
        },
      );
    }
  }
}

function validatePolicy(
  policy: MultiAgentDebatePolicy,
): void {
  if (
    policy === null ||
    typeof policy !== "object" ||
    !Number.isFinite(policy.agreementThreshold) ||
    policy.agreementThreshold < 0 ||
    policy.agreementThreshold > 1 ||
    !Number.isFinite(policy.convergenceThreshold) ||
    policy.convergenceThreshold < 0 ||
    policy.convergenceThreshold > 1 ||
    !Number.isInteger(policy.maximumRounds) ||
    policy.maximumRounds <= 0 ||
    !Number.isInteger(
      policy.maximumStatementsPerAgentPerRound,
    ) ||
    policy.maximumStatementsPerAgentPerRound <= 0
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_POLICY",
      "Debate policy is invalid.",
    );
  }
}

function validateBuilder(
  builder: MultiAgentDebateStatementBuilder,
  options: NormalizedOptions,
): void {
  if (
    typeof builder.agentId !== "string" ||
    builder.agentId.trim().length === 0 ||
    typeof builder.build !== "function"
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_INPUT",
      "Debate statement builder is invalid.",
    );
  }

  if (
    options.requireDeterministicBuilders &&
    !builder.deterministic
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_INPUT",
      `Builder "${builder.agentId}" must be deterministic.`,
      { agentId: builder.agentId },
    );
  }

  if (
    options.requireReplaySafeBuilders &&
    !builder.replaySafe
  ) {
    throw new MultiAgentDebateEngineError(
      "INVALID_DEBATE_INPUT",
      `Builder "${builder.agentId}" must be replay-safe.`,
      { agentId: builder.agentId },
    );
  }
}

function isEligibleDebater(
  agent: MultiAgentRegistration,
  options: NormalizedOptions,
): boolean {
  const capabilitySatisfied =
    !options.requireDebateCapability ||
    agent.capabilities.some(
      (capability) =>
        capability.enabled &&
        (capability.capability === "NEGOTIATE" ||
          capability.capability === "CHALLENGE_PROPOSAL" ||
          capability.capability === "REVIEW_PROPOSAL"),
    );

  const authoritySatisfied =
    !options.requireDebateAuthority ||
    agent.authority.mayReview ||
    agent.authority.mayVote ||
    agent.authority.mayArbitrate;

  return capabilitySatisfied && authoritySatisfied;
}

function rankDebatersForProposal(
  agents: readonly MultiAgentRegistration[],
  proposal: MultiAgentProposal,
  reviews: readonly MultiAgentPeerReview[],
): readonly MultiAgentRegistration[] {
  return Object.freeze(
    [...agents].sort((left, right) => {
      const leftScore = debaterSuitability(
        left,
        proposal,
        reviews,
      );
      const rightScore = debaterSuitability(
        right,
        proposal,
        reviews,
      );

      return leftScore !== rightScore
        ? rightScore - leftScore
        : left.identity.agentId.localeCompare(
            right.identity.agentId,
          );
    }),
  );
}

function debaterSuitability(
  agent: MultiAgentRegistration,
  proposal: MultiAgentProposal,
  reviews: readonly MultiAgentPeerReview[],
): number {
  const ownReview = reviews.find(
    (review) =>
      review.reviewerAgentId === agent.identity.agentId,
  );
  const debateCapability = agent.capabilities.find(
    (capability) =>
      capability.capability === "NEGOTIATE" &&
      capability.enabled,
  );
  const challengeCapability = agent.capabilities.find(
    (capability) =>
      capability.capability === "CHALLENGE_PROPOSAL" &&
      capability.enabled,
  );
  const reviewCapability = agent.capabilities.find(
    (capability) =>
      capability.capability === "REVIEW_PROPOSAL" &&
      capability.enabled,
  );

  const domainBonus =
    agent.identity.role === "RISK_AGENT" &&
    proposal.risks.length > 0
      ? 0.15
      : agent.identity.role === "EXECUTION_AGENT" &&
          proposal.actions.length > 0
        ? 0.15
        : agent.identity.role === "GOVERNANCE_AGENT" &&
            proposal.constraints.length > 0
          ? 0.15
          : 0;

  return clamp01(
    (debateCapability?.proficiency ?? 0) * 0.4 +
      (challengeCapability?.proficiency ?? 0) * 0.25 +
      (reviewCapability?.proficiency ?? 0) * 0.2 +
      (ownReview?.confidence ?? 0) * 0.15 +
      domainBonus,
  );
}

function detectMaterialConflict(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
): boolean {
  if (proposals.length > 1) {
    const actionSignatures = new Set(
      proposals.map((proposal) =>
        proposal.actions
          .map(
            (action) =>
              `${action.type}:${canonicalStringify(
                action.market ?? null,
              )}`,
          )
          .sort()
          .join("|"),
      ),
    );

    if (actionSignatures.size > 1) {
      return true;
    }
  }

  for (const proposal of proposals) {
    const proposalReviews = reviews.filter(
      (review) =>
        review.proposalId === proposal.proposalId,
    );
    const supports = proposalReviews.some((review) =>
      SUPPORT_DECISIONS.includes(review.decision),
    );
    const opposes = proposalReviews.some((review) =>
      OPPOSE_DECISIONS.includes(review.decision),
    );

    if (supports && opposes) {
      return true;
    }
  }

  return false;
}

function calculateReviewAgreement(
  reviews: readonly MultiAgentPeerReview[],
): number {
  if (reviews.length <= 1) {
    return 1;
  }

  const values = reviews.map((review) =>
    reviewDecisionValue(review.decision),
  );
  const mean =
    values.reduce((sum, value) => sum + value, 0) /
    values.length;
  const variance =
    values.reduce(
      (sum, value) =>
        sum + Math.pow(value - mean, 2),
      0,
    ) / values.length;

  return clamp01(1 - Math.sqrt(variance));
}

function calculateDebateConvergence(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
  statements: readonly MultiAgentDebateStatement[],
): number {
  if (statements.length === 0) {
    return calculateReviewAgreement(reviews);
  }

  const positionValues = statements.map((statement) =>
    debatePositionValue(statement.position),
  );
  const weightedMean =
    positionValues.reduce(
      (sum, value, index) =>
        sum +
        value *
          statements[index]!.confidence,
      0,
    ) /
    Math.max(
      Number.EPSILON,
      statements.reduce(
        (sum, statement) =>
          sum + statement.confidence,
        0,
      ),
    );
  const dispersion =
    positionValues.reduce(
      (sum, value) =>
        sum + Math.abs(value - weightedMean),
      0,
    ) / positionValues.length;
  const statementAgreement = clamp01(1 - dispersion);
  const responseCoverage =
    statements.length === 0
      ? 0
      : statements.filter(
          (statement) =>
            statement.respondsToStatementId !== undefined,
        ).length / statements.length;
  const evidenceCoverage =
    statements.length === 0
      ? 0
      : statements.filter(
          (statement) =>
            statement.evidenceIds.length > 0,
        ).length / statements.length;
  const proposalCoverage =
    proposals.length === 0
      ? 1
      : Math.min(
          1,
          new Set(
            statements.flatMap((statement) =>
              proposals
                .filter((proposal) =>
                  statement.evidenceIds.some(
                    (evidenceId) =>
                      proposal.evidence.some(
                        (evidence) =>
                          evidence.evidenceId ===
                          evidenceId,
                      ),
                  ),
                )
                .map(
                  (proposal) => proposal.proposalId,
                ),
            ),
          ).size / proposals.length,
        );

  return clamp01(
    statementAgreement * 0.5 +
      calculateReviewAgreement(reviews) * 0.2 +
      responseCoverage * 0.1 +
      evidenceCoverage * 0.1 +
      proposalCoverage * 0.1,
  );
}

function buildUnresolvedQuestions(
  proposals: readonly MultiAgentProposal[],
  reviews: readonly MultiAgentPeerReview[],
  statements: readonly MultiAgentDebateStatement[],
  converged: boolean,
): string[] {
  const questions: string[] = [];

  if (!converged) {
    questions.push(
      "The debate did not reach the configured convergence threshold.",
    );
  }

  for (const proposal of proposals) {
    const proposalReviews = reviews.filter(
      (review) =>
        review.proposalId === proposal.proposalId,
    );
    const hasSupport = proposalReviews.some((review) =>
      SUPPORT_DECISIONS.includes(review.decision),
    );
    const hasOpposition = proposalReviews.some((review) =>
      OPPOSE_DECISIONS.includes(review.decision),
    );

    if (hasSupport && hasOpposition) {
      questions.push(
        `Should proposal "${proposal.title}" advance despite conflicting peer reviews?`,
      );
    }

    if (
      proposal.risks.some(
        (risk) =>
          risk.severity === "CRITICAL" ||
          risk.severity === "HIGH",
      )
    ) {
      questions.push(
        `Are the high-severity risks for proposal "${proposal.title}" adequately mitigated?`,
      );
    }

    if (
      proposal.constraints.some(
        (constraint) =>
          constraint.hard && !constraint.satisfied,
      )
    ) {
      questions.push(
        `Can proposal "${proposal.title}" satisfy all failed hard constraints?`,
      );
    }

    if (
      !statements.some((statement) =>
        statement.evidenceIds.some((evidenceId) =>
          proposal.evidence.some(
            (evidence) =>
              evidence.evidenceId === evidenceId,
          ),
        ),
      )
    ) {
      questions.push(
        `Which evidence directly supports proposal "${proposal.title}"?`,
      );
    }
  }

  return [
    ...new Set(
      questions
        .map((question) => question.trim())
        .filter((question) => question.length > 0),
    ),
  ].sort();
}

function chooseEvidenceIds(
  proposal: MultiAgentProposal,
  review: MultiAgentPeerReview | undefined,
  position: MultiAgentDebatePosition,
): readonly MultiAgentKnowledgeId[] {
  const reviewEvidence =
    review?.supportingEvidence.map(
      (evidence) => evidence.evidenceId,
    ) ?? [];

  const proposalEvidence = proposal.evidence
    .filter((evidence) => {
      if (position === "AFFIRMATIVE") {
        return (
          evidence.direction === "SUPPORTING" ||
          evidence.direction === "CONTEXTUAL"
        );
      }

      if (position === "NEGATIVE") {
        return (
          evidence.direction === "OPPOSING" ||
          evidence.direction === "CONTEXTUAL"
        );
      }

      return true;
    })
    .sort(
      (left, right) =>
        right.weight *
          right.confidence *
          right.reliability -
        left.weight *
          left.confidence *
          left.reliability,
    )
    .map((evidence) => evidence.evidenceId);

  return Object.freeze(
    [...new Set([...reviewEvidence, ...proposalEvidence])]
      .sort()
      .slice(0, 8),
  );
}

function chooseResponseTarget(
  statements: readonly MultiAgentDebateStatement[],
  position: MultiAgentDebatePosition,
  proposal: MultiAgentProposal,
): MultiAgentDebateStatement | undefined {
  const proposalEvidenceIds = new Set(
    proposal.evidence.map(
      (evidence) => evidence.evidenceId,
    ),
  );

  return [...statements]
    .filter((statement) =>
      statement.evidenceIds.some((evidenceId) =>
        proposalEvidenceIds.has(evidenceId),
      ),
    )
    .filter(
      (statement) =>
        statement.position !== position &&
        statement.position !== "ARBITER",
    )
    .sort((left, right) => {
      if (left.debateRound !== right.debateRound) {
        return right.debateRound - left.debateRound;
      }

      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }

      return left.statementId.localeCompare(
        right.statementId,
      );
    })[0];
}

function positionFromReview(
  decision: MultiAgentReviewDecision | undefined,
): MultiAgentDebatePosition {
  if (decision === undefined) {
    return "NEUTRAL";
  }

  if (SUPPORT_DECISIONS.includes(decision)) {
    return "AFFIRMATIVE";
  }

  if (OPPOSE_DECISIONS.includes(decision)) {
    return "NEGATIVE";
  }

  return "NEUTRAL";
}

function reviewDecisionValue(
  decision: MultiAgentReviewDecision,
): number {
  switch (decision) {
    case "STRONGLY_SUPPORT":
      return 1;
    case "SUPPORT":
      return 0.85;
    case "SUPPORT_WITH_CHANGES":
      return 0.65;
    case "NEUTRAL":
      return 0.5;
    case "OPPOSE":
      return 0.3;
    case "STRONGLY_OPPOSE":
      return 0.1;
    case "VETO":
      return 0;
  }
}

function debatePositionValue(
  position: MultiAgentDebatePosition,
): number {
  switch (position) {
    case "AFFIRMATIVE":
      return 1;
    case "NEUTRAL":
      return 0.5;
    case "ARBITER":
      return 0.5;
    case "NEGATIVE":
      return 0;
  }
}

function isDebatePosition(
  value: unknown,
): value is MultiAgentDebatePosition {
  return (
    value === "AFFIRMATIVE" ||
    value === "NEGATIVE" ||
    value === "NEUTRAL" ||
    value === "ARBITER"
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
  return left.reviewId.localeCompare(right.reviewId);
}

function compareStatements(
  left: MultiAgentDebateStatement,
  right: MultiAgentDebateStatement,
): number {
  if (left.debateRound !== right.debateRound) {
    return left.debateRound - right.debateRound;
  }

  const agentDifference =
    left.agentId.localeCompare(right.agentId);

  return agentDifference !== 0
    ? agentDifference
    : left.statementId.localeCompare(
        right.statementId,
      );
}

function formatScore(value: number): string {
  return `${(clamp01(value) * 100).toFixed(2)}%`;
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function normalizeOptions(
  options: MultiAgentDebateEngineOptions,
): NormalizedOptions {
  const maximumTotalStatements =
    options.maximumTotalStatements ?? 512;

  if (
    !Number.isInteger(maximumTotalStatements) ||
    maximumTotalStatements <= 0
  ) {
    throw new RangeError(
      "maximumTotalStatements must be a positive integer.",
    );
  }

  return Object.freeze({
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    allowFallbackStatements:
      options.allowFallbackStatements ?? true,
    requireDeterministicBuilders:
      options.requireDeterministicBuilders ?? true,
    requireReplaySafeBuilders:
      options.requireReplaySafeBuilders ?? true,
    requireDebateCapability:
      options.requireDebateCapability ?? true,
    requireDebateAuthority:
      options.requireDebateAuthority ?? true,
    maximumTotalStatements,
    sessionIdFactory:
      options.sessionIdFactory ??
      defaultSessionIdFactory,
    statementIdFactory:
      options.statementIdFactory ??
      defaultStatementIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
  });
}

function defaultSessionIdFactory(
  prefix: string,
  seed: string,
): MultiAgentSessionId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultStatementIdFactory(
  prefix: string,
  seed: string,
): string {
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