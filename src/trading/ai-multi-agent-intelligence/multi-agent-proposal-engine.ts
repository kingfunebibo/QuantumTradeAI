/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-proposal-engine.ts
 *
 * Deterministic proposal generation from collaborative observations.
 */

import {
  type MultiAgentActionType,
  type MultiAgentConfidence,
  type MultiAgentConstraint,
  type MultiAgentEvidence,
  type MultiAgentId,
  type MultiAgentKnowledgeId,
  type MultiAgentMetadata,
  type MultiAgentObservation,
  type MultiAgentPriority,
  type MultiAgentProposal,
  type MultiAgentProposalAction,
  type MultiAgentProposalEnginePort,
  type MultiAgentProposalId,
  type MultiAgentRegistration,
  type MultiAgentRiskFinding,
  type MultiAgentRunRequest,
  type MultiAgentScore,
  type MultiAgentTimestamp,
  type MultiAgentUrgency,
  type MultiAgentUtility,
  type MultiAgentUtilityAssessment,
  type MultiAgentValidationIssue,
  type MultiAgentValidatorPort,
} from "./ai-multi-agent-contracts";
import { aiMultiAgentValidator } from "./ai-multi-agent-validator";

export type MultiAgentProposalEngineErrorCode =
  | "INVALID_REQUEST"
  | "NO_ELIGIBLE_AGENT"
  | "BUILDER_ALREADY_REGISTERED"
  | "BUILDER_NOT_FOUND"
  | "BUILDER_FAILED"
  | "INVALID_DRAFT"
  | "INVALID_PROPOSAL"
  | "DUPLICATE_PROPOSAL_ID"
  | "DUPLICATE_ACTION_ID"
  | "STALE_OBSERVATION"
  | "INSUFFICIENT_EVIDENCE"
  | "PROPOSAL_LIMIT_EXCEEDED";

export interface MultiAgentProposalEngineErrorDetails {
  readonly agentId?: MultiAgentId;
  readonly proposalId?: MultiAgentProposalId;
  readonly observationId?: MultiAgentKnowledgeId;
  readonly issues?: readonly MultiAgentValidationIssue[];
  readonly cause?: unknown;
}

export class MultiAgentProposalEngineError extends Error {
  public readonly code: MultiAgentProposalEngineErrorCode;
  public readonly details: MultiAgentProposalEngineErrorDetails;

  public constructor(
    code: MultiAgentProposalEngineErrorCode,
    message: string,
    details: MultiAgentProposalEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentProposalEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentProposalClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentProposalDraft {
  readonly title: string;
  readonly thesis: string;
  readonly actions: readonly MultiAgentProposalAction[];
  readonly expectedUtility?: Partial<MultiAgentUtilityAssessment>;
  readonly confidence?: MultiAgentConfidence;
  readonly evidence?: readonly MultiAgentEvidence[];
  readonly risks?: readonly MultiAgentRiskFinding[];
  readonly constraints?: readonly MultiAgentConstraint[];
  readonly assumptions?: readonly string[];
  readonly invalidationConditions?: readonly string[];
  readonly validUntilMs?: MultiAgentTimestamp;
  readonly parentProposalId?: MultiAgentProposalId;
  readonly revision?: number;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentProposalBuildContext {
  readonly request: MultiAgentRunRequest;
  readonly agent: MultiAgentRegistration;
  readonly observations: readonly MultiAgentObservation[];
  readonly allObservations: readonly MultiAgentObservation[];
  readonly createdAtMs: MultiAgentTimestamp;
  readonly validUntilMs: MultiAgentTimestamp;
  readonly deterministicSeed: string;
}

export interface MultiAgentProposalBuilder {
  readonly agentId: MultiAgentId;
  readonly deterministic: boolean;
  readonly replaySafe: boolean;

  build(
    context: MultiAgentProposalBuildContext,
  ):
    | MultiAgentProposalDraft
    | readonly MultiAgentProposalDraft[]
    | Promise<
        MultiAgentProposalDraft | readonly MultiAgentProposalDraft[]
      >;
}

export interface MultiAgentProposalEngineOptions {
  readonly builders?: readonly MultiAgentProposalBuilder[];
  readonly validator?: MultiAgentValidatorPort;
  readonly clock?: MultiAgentProposalClock;
  readonly maximumProposals?: number;
  readonly maximumProposalsPerAgent?: number;
  readonly maximumActionsPerProposal?: number;
  readonly validityDurationMs?: number;
  readonly minimumObservationConfidence?: MultiAgentConfidence;
  readonly minimumObservationQuality?: MultiAgentScore;
  readonly minimumEvidenceCount?: number;
  readonly rejectStaleObservations?: boolean;
  readonly allowFallbackProposals?: boolean;
  readonly requireDeterministicBuilders?: boolean;
  readonly requireReplaySafeBuilders?: boolean;
  readonly includeRequestConstraints?: boolean;
  readonly fingerprintFactory?: (value: unknown) => string;
  readonly proposalIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentProposalId;
}

export interface MultiAgentProposalGenerationRecord {
  readonly proposalId: MultiAgentProposalId;
  readonly agentId: MultiAgentId;
  readonly observationIds: readonly MultiAgentKnowledgeId[];
  readonly actionIds: readonly string[];
  readonly confidence: MultiAgentConfidence;
  readonly totalUtility: MultiAgentUtility;
  readonly generatedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentProposalEngineSnapshot {
  readonly records: readonly MultiAgentProposalGenerationRecord[];
  readonly proposalCount: number;
  readonly participatingAgentIds: readonly MultiAgentId[];
  readonly generatedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly validator: MultiAgentValidatorPort;
  readonly clock: MultiAgentProposalClock;
  readonly maximumProposals: number;
  readonly maximumProposalsPerAgent: number;
  readonly maximumActionsPerProposal: number;
  readonly validityDurationMs: number;
  readonly minimumObservationConfidence: MultiAgentConfidence;
  readonly minimumObservationQuality: MultiAgentScore;
  readonly minimumEvidenceCount: number;
  readonly rejectStaleObservations: boolean;
  readonly allowFallbackProposals: boolean;
  readonly requireDeterministicBuilders: boolean;
  readonly requireReplaySafeBuilders: boolean;
  readonly includeRequestConstraints: boolean;
  readonly fingerprintFactory: (value: unknown) => string;
  readonly proposalIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentProposalId;
}

const ACTION_BY_OBJECTIVE: Readonly<
  Record<MultiAgentRunRequest["objective"], MultiAgentActionType>
> = {
  MARKET_ASSESSMENT: "MONITOR",
  TRADE_DECISION: "PUBLISH_SIGNAL",
  STRATEGY_ORCHESTRATION: "ACTIVATE_STRATEGY",
  PORTFOLIO_REBALANCE: "REBALANCE_PORTFOLIO",
  RISK_RESPONSE: "PAUSE_TRADING",
  ARBITRAGE_DECISION: "EXECUTE_ARBITRAGE",
  EXECUTION_REVIEW: "MONITOR",
  FULL_COLLABORATIVE_DECISION: "PUBLISH_SIGNAL",
};

const PRIORITY_BY_OBJECTIVE: Readonly<
  Record<MultiAgentRunRequest["objective"], MultiAgentPriority>
> = {
  MARKET_ASSESSMENT: "MEDIUM",
  TRADE_DECISION: "HIGH",
  STRATEGY_ORCHESTRATION: "HIGH",
  PORTFOLIO_REBALANCE: "VERY_HIGH",
  RISK_RESPONSE: "CRITICAL",
  ARBITRAGE_DECISION: "VERY_HIGH",
  EXECUTION_REVIEW: "HIGH",
  FULL_COLLABORATIVE_DECISION: "VERY_HIGH",
};

const URGENCY_BY_OBJECTIVE: Readonly<
  Record<MultiAgentRunRequest["objective"], MultiAgentUrgency>
> = {
  MARKET_ASSESSMENT: "NORMAL",
  TRADE_DECISION: "HIGH",
  STRATEGY_ORCHESTRATION: "NORMAL",
  PORTFOLIO_REBALANCE: "HIGH",
  RISK_RESPONSE: "IMMEDIATE",
  ARBITRAGE_DECISION: "HIGH",
  EXECUTION_REVIEW: "HIGH",
  FULL_COLLABORATIVE_DECISION: "HIGH",
};

export class MultiAgentProposalEngine
  implements MultiAgentProposalEnginePort
{
  private readonly builders = new Map<
    MultiAgentId,
    MultiAgentProposalBuilder
  >();

  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentProposalEngineSnapshot;

  public constructor(options: MultiAgentProposalEngineOptions = {}) {
    this.options = normalizeOptions(options);

    for (const builder of options.builders ?? []) {
      this.registerBuilder(builder);
    }

    this.lastSnapshotValue = deepFreeze({
      records: Object.freeze([]),
      proposalCount: 0,
      participatingAgentIds: Object.freeze([]),
      deterministicFingerprint: this.options.fingerprintFactory({
        records: [],
      }),
    });
  }

  public registerBuilder(builder: MultiAgentProposalBuilder): void {
    validateBuilder(builder, this.options);

    if (this.builders.has(builder.agentId)) {
      throw new MultiAgentProposalEngineError(
        "BUILDER_ALREADY_REGISTERED",
        `A proposal builder is already registered for "${builder.agentId}".`,
        { agentId: builder.agentId },
      );
    }

    this.builders.set(builder.agentId, builder);
  }

  public replaceBuilder(builder: MultiAgentProposalBuilder): void {
    validateBuilder(builder, this.options);
    this.builders.set(builder.agentId, builder);
  }

  public unregisterBuilder(agentId: MultiAgentId): void {
    this.builders.delete(agentId);
  }

  public getBuilder(
    agentId: MultiAgentId,
  ): MultiAgentProposalBuilder | undefined {
    return this.builders.get(agentId);
  }

  public listBuilders(): readonly MultiAgentProposalBuilder[] {
    return Object.freeze(
      [...this.builders.values()].sort((left, right) =>
        left.agentId.localeCompare(right.agentId),
      ),
    );
  }

  public snapshot(): MultiAgentProposalEngineSnapshot {
    return this.lastSnapshotValue;
  }

  public async propose(
    request: MultiAgentRunRequest,
    agents: readonly MultiAgentRegistration[],
    observations: readonly MultiAgentObservation[],
  ): Promise<readonly MultiAgentProposal[]> {
    validateInputs(request, agents, observations);

    const createdAtMs = this.options.clock.now();
    const validUntilMs = safeAddTimestamp(
      createdAtMs,
      this.options.validityDurationMs,
    );
    const normalizedObservations = normalizeObservations(
      observations,
      createdAtMs,
      this.options,
    );
    const eligibleAgents = agents
      .filter(isEligibleAgent)
      .sort(compareAgents);

    if (eligibleAgents.length === 0) {
      throw new MultiAgentProposalEngineError(
        "NO_ELIGIBLE_AGENT",
        "No selected agent can generate proposals.",
      );
    }

    const proposals: MultiAgentProposal[] = [];
    const records: MultiAgentProposalGenerationRecord[] = [];
    const proposalIds = new Set<MultiAgentProposalId>();
    const actionIds = new Set<string>();

    for (const agent of eligibleAgents) {
      if (proposals.length >= this.options.maximumProposals) {
        break;
      }

      const scopedObservations = selectObservations(
        agent,
        normalizedObservations,
      );
      const drafts = await this.generateDrafts(
        request,
        agent,
        scopedObservations,
        normalizedObservations,
        createdAtMs,
        validUntilMs,
      );

      for (
        let draftIndex = 0;
        draftIndex <
        Math.min(
          drafts.length,
          this.options.maximumProposalsPerAgent,
        );
        draftIndex += 1
      ) {
        if (proposals.length >= this.options.maximumProposals) {
          break;
        }

        const proposal = this.materialize({
          request,
          agent,
          observations: scopedObservations,
          draft: drafts[draftIndex],
          draftIndex,
          createdAtMs,
          defaultValidUntilMs: validUntilMs,
        });

        if (proposalIds.has(proposal.proposalId)) {
          throw new MultiAgentProposalEngineError(
            "DUPLICATE_PROPOSAL_ID",
            `Duplicate proposal id "${proposal.proposalId}".`,
            {
              proposalId: proposal.proposalId,
              agentId: agent.identity.agentId,
            },
          );
        }

        for (const action of proposal.actions) {
          if (actionIds.has(action.actionId)) {
            throw new MultiAgentProposalEngineError(
              "DUPLICATE_ACTION_ID",
              `Duplicate action id "${action.actionId}".`,
              {
                proposalId: proposal.proposalId,
                agentId: agent.identity.agentId,
              },
            );
          }
          actionIds.add(action.actionId);
        }

        proposalIds.add(proposal.proposalId);
        proposals.push(proposal);
        records.push(
          createRecord(
            proposal,
            scopedObservations,
            this.options,
          ),
        );
      }
    }

    const ordered = proposals.sort(compareProposals);
    const orderedRecords = records.sort((left, right) =>
      left.proposalId.localeCompare(right.proposalId),
    );
    const participatingAgentIds = Object.freeze(
      [...new Set(ordered.map((item) => item.proposedByAgentId))].sort(),
    );

    this.lastSnapshotValue = deepFreeze({
      records: Object.freeze(orderedRecords),
      proposalCount: ordered.length,
      participatingAgentIds,
      generatedAtMs: createdAtMs,
      deterministicFingerprint: this.options.fingerprintFactory({
        requestId: request.requestId,
        orderedRecords,
        participatingAgentIds,
      }),
    });

    return deepFreeze(Object.freeze(ordered));
  }

  private async generateDrafts(
    request: MultiAgentRunRequest,
    agent: MultiAgentRegistration,
    observations: readonly MultiAgentObservation[],
    allObservations: readonly MultiAgentObservation[],
    createdAtMs: MultiAgentTimestamp,
    validUntilMs: MultiAgentTimestamp,
  ): Promise<readonly MultiAgentProposalDraft[]> {
    const builder = this.builders.get(agent.identity.agentId);

    if (builder === undefined) {
      if (!this.options.allowFallbackProposals) {
        throw new MultiAgentProposalEngineError(
          "BUILDER_NOT_FOUND",
          `No proposal builder is registered for "${agent.identity.agentId}".`,
          { agentId: agent.identity.agentId },
        );
      }

      return Object.freeze([
        buildFallbackDraft(
          request,
          agent,
          observations.length > 0
            ? observations
            : allObservations,
        ),
      ]);
    }

    const context: MultiAgentProposalBuildContext = deepFreeze({
      request,
      agent,
      observations,
      allObservations,
      createdAtMs,
      validUntilMs,
      deterministicSeed: this.options.fingerprintFactory({
        requestId: request.requestId,
        agentId: agent.identity.agentId,
        observationFingerprints: observations.map(
          (item) => item.deterministicFingerprint,
        ),
      }),
    });

    try {
      const result = await builder.build(context);
      const drafts: readonly MultiAgentProposalDraft[] =
        Array.isArray(result)
          ? result
          : [result as MultiAgentProposalDraft];

      if (drafts.length === 0) {
        throw new MultiAgentProposalEngineError(
          "INVALID_DRAFT",
          `Builder "${agent.identity.agentId}" returned no proposal drafts.`,
          { agentId: agent.identity.agentId },
        );
      }

      return Object.freeze(drafts.map((draft) => deepFreeze(draft)));
    } catch (error: unknown) {
      if (error instanceof MultiAgentProposalEngineError) {
        throw error;
      }

      throw new MultiAgentProposalEngineError(
        "BUILDER_FAILED",
        `Builder "${agent.identity.agentId}" failed.`,
        {
          agentId: agent.identity.agentId,
          cause: error,
        },
      );
    }
  }

  private materialize(input: {
    readonly request: MultiAgentRunRequest;
    readonly agent: MultiAgentRegistration;
    readonly observations: readonly MultiAgentObservation[];
    readonly draft: MultiAgentProposalDraft;
    readonly draftIndex: number;
    readonly createdAtMs: MultiAgentTimestamp;
    readonly defaultValidUntilMs: MultiAgentTimestamp;
  }): MultiAgentProposal {
    const {
      request,
      agent,
      observations,
      draft,
      draftIndex,
      createdAtMs,
      defaultValidUntilMs,
    } = input;

    validateDraft(draft, agent.identity.agentId, this.options);

    const evidence = Object.freeze(
      deduplicateEvidence(
        draft.evidence ??
          observations.flatMap((item) => item.evidence),
      ),
    );

    if (evidence.length < this.options.minimumEvidenceCount) {
      throw new MultiAgentProposalEngineError(
        "INSUFFICIENT_EVIDENCE",
        `Proposal from "${agent.identity.agentId}" has insufficient evidence.`,
        { agentId: agent.identity.agentId },
      );
    }

    const risks = Object.freeze(
      deduplicateRisks(
        draft.risks ??
          observations.flatMap((item) => item.risks),
      ),
    );
    const constraints = Object.freeze(
      mergeConstraints(
        draft.constraints ?? [],
        this.options.includeRequestConstraints
          ? request.constraints ?? []
          : [],
      ),
    );
    const actions = Object.freeze(
      normalizeActions(
        draft.actions,
        request,
        agent,
        draftIndex,
        this.options,
      ),
    );
    const confidence = clamp01(
      draft.confidence ??
        weightedObservationValue(
          observations,
          (item) => item.confidence,
        ),
    ) as MultiAgentConfidence;
    const expectedUtility = createUtilityAssessment(
      draft.expectedUtility,
      observations,
      risks,
      constraints,
    );
    const validUntilMs =
      draft.validUntilMs ?? defaultValidUntilMs;

    if (validUntilMs <= createdAtMs) {
      throw new MultiAgentProposalEngineError(
        "INVALID_DRAFT",
        "validUntilMs must be greater than createdAtMs.",
        { agentId: agent.identity.agentId },
      );
    }

    const seed = {
      requestId: request.requestId,
      agentId: agent.identity.agentId,
      draftIndex,
      title: draft.title.trim(),
      thesis: draft.thesis.trim(),
      actionIds: actions.map((item) => item.actionId),
      evidenceIds: evidence.map((item) => item.evidenceId),
      createdAtMs,
      revision: draft.revision ?? 0,
    };
    const proposalId = this.options.proposalIdFactory(
      "proposal",
      this.options.fingerprintFactory(seed),
    );
    const proposal: MultiAgentProposal = deepFreeze({
      proposalId,
      runId: request.requestId,
      sessionId: resolveSessionId(request),
      proposedByAgentId: agent.identity.agentId,
      status: "SUBMITTED",
      title: draft.title.trim(),
      thesis: draft.thesis.trim(),
      actions,
      expectedUtility,
      confidence,
      evidence,
      risks,
      constraints,
      assumptions: Object.freeze(
        normalizeText(draft.assumptions ?? []),
      ),
      invalidationConditions: Object.freeze(
        normalizeText(draft.invalidationConditions ?? []),
      ),
      createdAtMs,
      validUntilMs,
      parentProposalId: draft.parentProposalId,
      revision: draft.revision ?? 0,
      deterministicFingerprint: this.options.fingerprintFactory({
        proposalId,
        ...seed,
        expectedUtility,
        confidence,
        risks,
        constraints,
        validUntilMs,
        metadata: draft.metadata,
      }),
      metadata: draft.metadata,
    });

    const validation = this.options.validator.validateProposal(proposal);

    if (!validation.valid) {
      throw new MultiAgentProposalEngineError(
        "INVALID_PROPOSAL",
        `Generated proposal "${proposalId}" failed validation.`,
        {
          proposalId,
          agentId: agent.identity.agentId,
          issues: validation.issues,
        },
      );
    }

    return proposal;
  }
}

export function createMultiAgentProposalEngine(
  options: MultiAgentProposalEngineOptions = {},
): MultiAgentProposalEngine {
  return new MultiAgentProposalEngine(options);
}

function buildFallbackDraft(
  request: MultiAgentRunRequest,
  agent: MultiAgentRegistration,
  observations: readonly MultiAgentObservation[],
): MultiAgentProposalDraft {
  const risks = deduplicateRisks(
    observations.flatMap((item) => item.risks),
  );
  const evidence = deduplicateEvidence(
    observations.flatMap((item) => item.evidence),
  );
  const criticalRisk = risks.some(
    (risk) => risk.severity === "CRITICAL",
  );
  const actionType: MultiAgentActionType = criticalRisk
    ? "ESCALATE_TO_OPERATOR"
    : ACTION_BY_OBJECTIVE[request.objective];
  const actionId = `action-${fnv1a64(
    canonicalStringify({
      requestId: request.requestId,
      agentId: agent.identity.agentId,
      actionType,
    }),
  )}`;

  const action: MultiAgentProposalAction = deepFreeze({
    actionId,
    type: actionType,
    portfolioId: request.portfolioId,
    priority: criticalRisk
      ? "CRITICAL"
      : PRIORITY_BY_OBJECTIVE[request.objective],
    urgency: criticalRisk
      ? "IMMEDIATE"
      : URGENCY_BY_OBJECTIVE[request.objective],
    executionMode: inferExecutionMode(
      request,
      actionType,
      criticalRisk,
    ),
    parameters: deepFreeze({
      source: "DETERMINISTIC_FALLBACK",
      objective: request.objective,
      observationCount: observations.length,
      evidenceCount: evidence.length,
      riskCount: risks.length,
    }),
  });

  const summaries = observations
    .slice()
    .sort(compareObservations)
    .map((item) => item.summary.trim())
    .filter((item) => item.length > 0);

  return deepFreeze({
    title: `${formatText(request.objective)} proposal`,
    thesis:
      `${agent.identity.name} proposes ${formatText(actionType)}. ` +
      (summaries.join(" ") ||
        "No qualifying observation summary was available."),
    actions: Object.freeze([action]),
    confidence: clamp01(
      weightedObservationValue(
        observations,
        (item) => item.confidence,
      ),
    ) as MultiAgentConfidence,
    evidence: Object.freeze(evidence),
    risks: Object.freeze(risks),
    constraints: Object.freeze([...(request.constraints ?? [])]),
    assumptions: Object.freeze([
      "Input observations remain valid during the proposal window.",
      "The deterministic system context has not materially changed.",
    ]),
    invalidationConditions: Object.freeze([
      "Supporting evidence expires or is invalidated.",
      "A hard constraint becomes unsatisfied.",
      "A critical risk invalidates the proposed action.",
    ]),
    revision: 0,
    metadata: deepFreeze({
      generator: "MULTI_AGENT_PROPOSAL_ENGINE",
      fallback: true,
    }),
  });
}

function validateInputs(
  request: MultiAgentRunRequest,
  agents: readonly MultiAgentRegistration[],
  observations: readonly MultiAgentObservation[],
): void {
  if (
    request === null ||
    typeof request !== "object" ||
    typeof request.requestId !== "string" ||
    request.requestId.trim().length === 0
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_REQUEST",
      "request must be a valid MultiAgentRunRequest.",
    );
  }

  if (!Array.isArray(agents) || !Array.isArray(observations)) {
    throw new MultiAgentProposalEngineError(
      "INVALID_REQUEST",
      "agents and observations must be arrays.",
    );
  }

  const agentIds = new Set<MultiAgentId>();
  for (const agent of agents) {
    if (agentIds.has(agent.identity.agentId)) {
      throw new MultiAgentProposalEngineError(
        "INVALID_REQUEST",
        `Duplicate agent "${agent.identity.agentId}".`,
        { agentId: agent.identity.agentId },
      );
    }
    agentIds.add(agent.identity.agentId);
  }

  const observationIds = new Set<MultiAgentKnowledgeId>();
  for (const observation of observations) {
    if (observationIds.has(observation.observationId)) {
      throw new MultiAgentProposalEngineError(
        "INVALID_REQUEST",
        `Duplicate observation "${observation.observationId}".`,
        {
          observationId: observation.observationId,
          agentId: observation.agentId,
        },
      );
    }
    if (!agentIds.has(observation.agentId)) {
      throw new MultiAgentProposalEngineError(
        "INVALID_REQUEST",
        `Observation "${observation.observationId}" references an unknown selected agent.`,
        {
          observationId: observation.observationId,
          agentId: observation.agentId,
        },
      );
    }
    observationIds.add(observation.observationId);
  }
}

function validateBuilder(
  builder: MultiAgentProposalBuilder,
  options: NormalizedOptions,
): void {
  if (
    typeof builder.agentId !== "string" ||
    builder.agentId.trim().length === 0 ||
    typeof builder.build !== "function"
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_REQUEST",
      "Proposal builder is invalid.",
    );
  }

  if (
    options.requireDeterministicBuilders &&
    !builder.deterministic
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_REQUEST",
      `Builder "${builder.agentId}" must be deterministic.`,
      { agentId: builder.agentId },
    );
  }

  if (
    options.requireReplaySafeBuilders &&
    !builder.replaySafe
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_REQUEST",
      `Builder "${builder.agentId}" must be replay-safe.`,
      { agentId: builder.agentId },
    );
  }
}

function validateDraft(
  draft: MultiAgentProposalDraft,
  agentId: MultiAgentId,
  options: NormalizedOptions,
): void {
  if (
    draft === null ||
    typeof draft !== "object" ||
    typeof draft.title !== "string" ||
    draft.title.trim().length === 0 ||
    typeof draft.thesis !== "string" ||
    draft.thesis.trim().length === 0 ||
    !Array.isArray(draft.actions)
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_DRAFT",
      `Proposal draft from "${agentId}" is invalid.`,
      { agentId },
    );
  }

  if (draft.actions.length > options.maximumActionsPerProposal) {
    throw new MultiAgentProposalEngineError(
      "PROPOSAL_LIMIT_EXCEEDED",
      `Proposal exceeds ${options.maximumActionsPerProposal} actions.`,
      { agentId },
    );
  }

  if (
    draft.revision !== undefined &&
    (!Number.isInteger(draft.revision) || draft.revision < 0)
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_DRAFT",
      "Proposal revision must be a non-negative integer.",
      { agentId },
    );
  }
}

function normalizeObservations(
  observations: readonly MultiAgentObservation[],
  now: MultiAgentTimestamp,
  options: NormalizedOptions,
): readonly MultiAgentObservation[] {
  const result: MultiAgentObservation[] = [];

  for (const observation of observations) {
    if (
      options.rejectStaleObservations &&
      observation.validUntilMs !== undefined &&
      observation.validUntilMs < now
    ) {
      throw new MultiAgentProposalEngineError(
        "STALE_OBSERVATION",
        `Observation "${observation.observationId}" is stale.`,
        {
          observationId: observation.observationId,
          agentId: observation.agentId,
        },
      );
    }

    if (
      observation.confidence >=
        options.minimumObservationConfidence &&
      observation.qualityScore >=
        options.minimumObservationQuality
    ) {
      result.push(deepFreeze(observation));
    }
  }

  return Object.freeze(result.sort(compareObservations));
}

function isEligibleAgent(
  agent: MultiAgentRegistration,
): boolean {
  return (
    agent.authority.mayPropose &&
    agent.capabilities.some(
      (item) =>
        item.capability === "PROPOSE_DECISION" &&
        item.enabled,
    )
  );
}

function selectObservations(
  agent: MultiAgentRegistration,
  observations: readonly MultiAgentObservation[],
): readonly MultiAgentObservation[] {
  const own = observations.filter(
    (item) => item.agentId === agent.identity.agentId,
  );

  return Object.freeze(
    own.length > 0 ? own : [...observations],
  );
}

function normalizeActions(
  actions: readonly MultiAgentProposalAction[],
  request: MultiAgentRunRequest,
  agent: MultiAgentRegistration,
  draftIndex: number,
  options: NormalizedOptions,
): readonly MultiAgentProposalAction[] {
  if (actions.length > options.maximumActionsPerProposal) {
    throw new MultiAgentProposalEngineError(
      "PROPOSAL_LIMIT_EXCEEDED",
      "Too many proposal actions.",
      { agentId: agent.identity.agentId },
    );
  }

  const ids = new Set<string>();

  return actions.map((action, index) => {
    const actionId =
      action.actionId.trim().length > 0
        ? action.actionId
        : `action-${fnv1a64(
            canonicalStringify({
              requestId: request.requestId,
              agentId: agent.identity.agentId,
              draftIndex,
              index,
              type: action.type,
            }),
          )}`;

    if (ids.has(actionId)) {
      throw new MultiAgentProposalEngineError(
        "DUPLICATE_ACTION_ID",
        `Duplicate action "${actionId}".`,
        { agentId: agent.identity.agentId },
      );
    }

    if (agent.authority.restrictedActions.includes(action.type)) {
      throw new MultiAgentProposalEngineError(
        "INVALID_DRAFT",
        `Agent "${agent.identity.agentId}" is restricted from "${action.type}".`,
        { agentId: agent.identity.agentId },
      );
    }

    validateOptionalNonNegative(action.quantity, "quantity");
    validateOptionalNonNegative(action.notional, "notional");

    if (
      action.targetWeight !== undefined &&
      (action.targetWeight < 0 || action.targetWeight > 1)
    ) {
      throw new MultiAgentProposalEngineError(
        "INVALID_DRAFT",
        "targetWeight must be between 0 and 1.",
        { agentId: agent.identity.agentId },
      );
    }

    ids.add(actionId);

    return deepFreeze({
      ...action,
      actionId,
      portfolioId: action.portfolioId ?? request.portfolioId,
    });
  });
}

function createUtilityAssessment(
  partial: Partial<MultiAgentUtilityAssessment> | undefined,
  observations: readonly MultiAgentObservation[],
  risks: readonly MultiAgentRiskFinding[],
  constraints: readonly MultiAgentConstraint[],
): MultiAgentUtilityAssessment {
  const opportunity = calculateOpportunityUtility(observations);
  const riskPenalty = calculateRiskPenalty(risks);
  const failedConstraints = constraints.filter(
    (item) => !item.satisfied,
  );
  const constraintPenalty =
    constraints.length === 0
      ? 0
      : failedConstraints.length / constraints.length;
  const base = clamp01(
    opportunity * 0.55 +
      (1 - riskPenalty) * 0.35 +
      (1 - constraintPenalty) * 0.1,
  );

  const expectedReturnUtility = utility(
    partial?.expectedReturnUtility ?? opportunity,
  );
  const riskAdjustedUtility = utility(
    partial?.riskAdjustedUtility ??
      expectedReturnUtility * (1 - riskPenalty),
  );
  const portfolioUtility = utility(
    partial?.portfolioUtility ?? base,
  );
  const strategyUtility = utility(
    partial?.strategyUtility ?? base,
  );
  const arbitrageUtility = utility(
    partial?.arbitrageUtility ?? base,
  );
  const executionUtility = utility(
    partial?.executionUtility ?? 1 - constraintPenalty,
  );
  const learningUtility = utility(
    partial?.learningUtility ??
      averageQuality(observations),
  );
  const operationalUtility = utility(
    partial?.operationalUtility ?? 1 - riskPenalty,
  );
  const totalUtility = utility(
    partial?.totalUtility ??
      expectedReturnUtility * 0.2 +
        riskAdjustedUtility * 0.2 +
        portfolioUtility * 0.12 +
        strategyUtility * 0.12 +
        arbitrageUtility * 0.1 +
        executionUtility * 0.1 +
        learningUtility * 0.06 +
        operationalUtility * 0.1,
  );

  return deepFreeze({
    expectedReturnUtility,
    riskAdjustedUtility,
    portfolioUtility,
    strategyUtility,
    arbitrageUtility,
    executionUtility,
    learningUtility,
    operationalUtility,
    totalUtility,
  });
}

function calculateOpportunityUtility(
  observations: readonly MultiAgentObservation[],
): number {
  let sum = 0;
  let weightSum = 0;

  for (const observation of observations) {
    for (const opportunity of observation.opportunities) {
      const weight =
        clamp01(opportunity.probability) *
        clamp01(opportunity.confidence);
      sum += clamp01(opportunity.expectedUtility) * weight;
      weightSum += weight;
    }
  }

  return weightSum > 0
    ? sum / weightSum
    : averageQuality(observations);
}

function calculateRiskPenalty(
  risks: readonly MultiAgentRiskFinding[],
): number {
  let sum = 0;
  let weightSum = 0;

  for (const risk of risks) {
    const weight =
      clamp01(risk.probability) *
      clamp01(risk.confidence);
    sum += clamp01(risk.impact) * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? sum / weightSum : 0;
}

function deduplicateEvidence(
  items: readonly MultiAgentEvidence[],
): MultiAgentEvidence[] {
  const byId = new Map<MultiAgentKnowledgeId, MultiAgentEvidence>();

  for (const item of items) {
    const current = byId.get(item.evidenceId);
    const score =
      item.weight * item.confidence * item.reliability;
    const currentScore =
      current === undefined
        ? -1
        : current.weight *
          current.confidence *
          current.reliability;

    if (score > currentScore) {
      byId.set(item.evidenceId, deepFreeze(item));
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  );
}

function deduplicateRisks(
  items: readonly MultiAgentRiskFinding[],
): MultiAgentRiskFinding[] {
  const byCode = new Map<string, MultiAgentRiskFinding>();

  for (const item of items) {
    const key = `${item.code}:${item.name}`;
    const current = byCode.get(key);

    if (
      current === undefined ||
      riskRank(item) > riskRank(current)
    ) {
      byCode.set(key, deepFreeze(item));
    }
  }

  return [...byCode.values()].sort((left, right) => {
    const severity =
      severityRank(right.severity) -
      severityRank(left.severity);

    return severity !== 0
      ? severity
      : left.code.localeCompare(right.code);
  });
}

function mergeConstraints(
  primary: readonly MultiAgentConstraint[],
  secondary: readonly MultiAgentConstraint[],
): MultiAgentConstraint[] {
  const byId = new Map<string, MultiAgentConstraint>();

  for (const item of [...secondary, ...primary]) {
    byId.set(item.constraintId, deepFreeze(item));
  }

  return [...byId.values()].sort((left, right) =>
    left.constraintId.localeCompare(right.constraintId),
  );
}

function createRecord(
  proposal: MultiAgentProposal,
  observations: readonly MultiAgentObservation[],
  options: NormalizedOptions,
): MultiAgentProposalGenerationRecord {
  const observationIds = Object.freeze(
    observations.map((item) => item.observationId).sort(),
  );
  const actionIds = Object.freeze(
    proposal.actions.map((item) => item.actionId).sort(),
  );

  return deepFreeze({
    proposalId: proposal.proposalId,
    agentId: proposal.proposedByAgentId,
    observationIds,
    actionIds,
    confidence: proposal.confidence,
    totalUtility: proposal.expectedUtility.totalUtility,
    generatedAtMs: proposal.createdAtMs,
    deterministicFingerprint: options.fingerprintFactory({
      proposalId: proposal.proposalId,
      observationIds,
      actionIds,
      confidence: proposal.confidence,
      totalUtility: proposal.expectedUtility.totalUtility,
    }),
  });
}

function inferExecutionMode(
  request: MultiAgentRunRequest,
  actionType: MultiAgentActionType,
  criticalRisk: boolean,
): MultiAgentProposalAction["executionMode"] {
  if (
    criticalRisk ||
    actionType === "NO_ACTION" ||
    actionType === "MONITOR" ||
    actionType === "RESEARCH" ||
    actionType === "PUBLISH_SIGNAL" ||
    actionType === "ESCALATE_TO_OPERATOR"
  ) {
    return "SIGNAL_ONLY";
  }

  const policy = request.configuration.execution;

  if (policy.allowFullyAutomatedExecution) {
    return "FULLY_AUTOMATED";
  }

  if (policy.allowSemiAutomatedExecution) {
    return "SEMI_AUTOMATED";
  }

  if (policy.allowPaperExecution) {
    return "PAPER";
  }

  return "SIGNAL_ONLY";
}

function resolveSessionId(
  request: MultiAgentRunRequest,
): string {
  const value = request.metadata?.["sessionId"];

  return typeof value === "string" && value.trim().length > 0
    ? value
    : `session-${fnv1a64(request.requestId)}`;
}

function weightedObservationValue(
  observations: readonly MultiAgentObservation[],
  selector: (observation: MultiAgentObservation) => number,
): number {
  if (observations.length === 0) {
    return 0;
  }

  let sum = 0;
  let weightSum = 0;

  for (const observation of observations) {
    const weight = Math.max(
      0.000001,
      observation.qualityScore,
    );
    sum += selector(observation) * weight;
    weightSum += weight;
  }

  return sum / weightSum;
}

function averageQuality(
  observations: readonly MultiAgentObservation[],
): number {
  return observations.length === 0
    ? 0
    : observations.reduce(
        (sum, item) => sum + item.qualityScore,
        0,
      ) / observations.length;
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

function formatText(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function compareAgents(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
): number {
  return left.identity.agentId.localeCompare(
    right.identity.agentId,
  );
}

function compareObservations(
  left: MultiAgentObservation,
  right: MultiAgentObservation,
): number {
  if (left.observedAtMs !== right.observedAtMs) {
    return left.observedAtMs - right.observedAtMs;
  }

  const agent = left.agentId.localeCompare(right.agentId);

  return agent !== 0
    ? agent
    : left.observationId.localeCompare(
        right.observationId,
      );
}

function compareProposals(
  left: MultiAgentProposal,
  right: MultiAgentProposal,
): number {
  const utilityDifference =
    right.expectedUtility.totalUtility -
    left.expectedUtility.totalUtility;

  if (utilityDifference !== 0) {
    return utilityDifference;
  }

  const confidenceDifference =
    right.confidence - left.confidence;

  return confidenceDifference !== 0
    ? confidenceDifference
    : left.proposalId.localeCompare(right.proposalId);
}

function severityRank(
  value: MultiAgentRiskFinding["severity"],
): number {
  switch (value) {
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

function riskRank(value: MultiAgentRiskFinding): number {
  return (
    severityRank(value.severity) *
    value.probability *
    value.confidence *
    value.impact
  );
}

function utility(value: number): MultiAgentUtility {
  return clamp01(value) as MultiAgentUtility;
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

function validateOptionalNonNegative(
  value: number | undefined,
  name: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0)
  ) {
    throw new MultiAgentProposalEngineError(
      "INVALID_DRAFT",
      `${name} must be a finite non-negative number.`,
    );
  }
}

function safeAddTimestamp(
  timestamp: MultiAgentTimestamp,
  durationMs: number,
): MultiAgentTimestamp {
  const result = timestamp + durationMs;

  if (!Number.isSafeInteger(result)) {
    throw new RangeError(
      "Proposal validity timestamp exceeds safe integer range.",
    );
  }

  return result as MultiAgentTimestamp;
}

function normalizeOptions(
  options: MultiAgentProposalEngineOptions,
): NormalizedOptions {
  const maximumProposals = options.maximumProposals ?? 32;
  const maximumProposalsPerAgent =
    options.maximumProposalsPerAgent ?? 3;
  const maximumActionsPerProposal =
    options.maximumActionsPerProposal ?? 16;
  const validityDurationMs =
    options.validityDurationMs ?? 300_000;
  const minimumEvidenceCount =
    options.minimumEvidenceCount ?? 0;

  assertPositiveInteger(maximumProposals, "maximumProposals");
  assertPositiveInteger(
    maximumProposalsPerAgent,
    "maximumProposalsPerAgent",
  );
  assertPositiveInteger(
    maximumActionsPerProposal,
    "maximumActionsPerProposal",
  );
  assertPositiveInteger(
    validityDurationMs,
    "validityDurationMs",
  );

  if (
    !Number.isInteger(minimumEvidenceCount) ||
    minimumEvidenceCount < 0
  ) {
    throw new RangeError(
      "minimumEvidenceCount must be a non-negative integer.",
    );
  }

  return Object.freeze({
    validator: options.validator ?? aiMultiAgentValidator,
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    maximumProposals,
    maximumProposalsPerAgent,
    maximumActionsPerProposal,
    validityDurationMs,
    minimumObservationConfidence: clamp01(
      options.minimumObservationConfidence ?? 0,
    ) as MultiAgentConfidence,
    minimumObservationQuality: clamp01(
      options.minimumObservationQuality ?? 0,
    ) as MultiAgentScore,
    minimumEvidenceCount,
    rejectStaleObservations:
      options.rejectStaleObservations ?? true,
    allowFallbackProposals:
      options.allowFallbackProposals ?? true,
    requireDeterministicBuilders:
      options.requireDeterministicBuilders ?? true,
    requireReplaySafeBuilders:
      options.requireReplaySafeBuilders ?? true,
    includeRequestConstraints:
      options.includeRequestConstraints ?? true,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
    proposalIdFactory:
      options.proposalIdFactory ??
      defaultProposalIdFactory,
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

function defaultProposalIdFactory(
  prefix: string,
  seed: string,
): MultiAgentProposalId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultFingerprintFactory(value: unknown): string {
  return `fnv1a64:${fnv1a64(canonicalStringify(value))}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
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