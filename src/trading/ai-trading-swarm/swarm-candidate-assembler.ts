/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-candidate-assembler.ts
 *
 * Deterministic transformation of immutable node contributions into global
 * swarm decision candidates.
 */

import {
  type MultiAgentCollectiveDecision,
  type MultiAgentDecisionAction,
  type MultiAgentProposalAction,
} from "../ai-multi-agent-intelligence/ai-multi-agent-contracts";

import {
  type TradingSwarmCandidateAssemblerPort,
  type TradingSwarmDecision,
  type TradingSwarmDecisionAction,
  type TradingSwarmDecisionCandidate,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmMission,
  type TradingSwarmNodeContribution,
  type TradingSwarmPriority,
  type TradingSwarmRisk,
  type TradingSwarmScore,
  type TradingSwarmTimestamp,
  type TradingSwarmUtility,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and configuration
 * ========================================================================== */

export type SwarmCandidateAssemblerErrorCode =
  | "INVALID_MISSION"
  | "INVALID_CONTRIBUTIONS"
  | "MISSION_MISMATCH"
  | "DUPLICATE_NODE_CONTRIBUTION"
  | "DUPLICATE_SOURCE_DECISION"
  | "DUPLICATE_CANDIDATE"
  | "INVALID_CONTRIBUTION_METRICS"
  | "INVALID_DECISION"
  | "INVALID_ACTION"
  | "NO_CANDIDATES"
  | "ASSEMBLY_FAILED";

export interface SwarmCandidateAssemblerErrorDetails {
  readonly missionId?: string;
  readonly nodeId?: string;
  readonly decisionId?: string;
  readonly candidateId?: string;
  readonly actionId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmCandidateAssemblerError extends Error {
  public readonly code: SwarmCandidateAssemblerErrorCode;
  public readonly details: SwarmCandidateAssemblerErrorDetails;

  public constructor(
    code: SwarmCandidateAssemblerErrorCode,
    message: string,
    details: SwarmCandidateAssemblerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmCandidateAssemblerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmCandidateAssemblerWeights {
  readonly localDecisionConfidence: number;
  readonly contributionConfidence: number;
  readonly reliability: number;
  readonly partitionCoverage: number;
  readonly localDecisionUtility: number;
  readonly contributionUtility: number;
  readonly localDecisionRisk: number;
  readonly contributionRisk: number;
  readonly dissentPenalty: number;
  readonly restrictionPenalty: number;
}

export interface SwarmCandidateAssemblerOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly weights?: Partial<SwarmCandidateAssemblerWeights>;
  readonly createObservationOnlyCandidates?: boolean;
  readonly requireAtLeastOneCandidate?: boolean;
  readonly includeUnapprovedActions?: boolean;
  readonly maximumActionsPerCandidate?: number;
  readonly maximumRestrictionsPerCandidate?: number;
  readonly fallbackDecision?: TradingSwarmDecision;
  readonly fallbackUtility?: TradingSwarmUtility;
  readonly fallbackRisk?: TradingSwarmRisk;
  readonly fallbackConfidence?: TradingSwarmScore;
  readonly createdAtStrategy?:
    | "DECISION_TIME"
    | "CONTRIBUTION_TIME"
    | "MISSION_TIME";
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly weights: SwarmCandidateAssemblerWeights;
  readonly createObservationOnlyCandidates: boolean;
  readonly requireAtLeastOneCandidate: boolean;
  readonly includeUnapprovedActions: boolean;
  readonly maximumActionsPerCandidate: number;
  readonly maximumRestrictionsPerCandidate: number;
  readonly fallbackDecision: TradingSwarmDecision;
  readonly fallbackUtility: TradingSwarmUtility;
  readonly fallbackRisk: TradingSwarmRisk;
  readonly fallbackConfidence: TradingSwarmScore;
  readonly createdAtStrategy:
    | "DECISION_TIME"
    | "CONTRIBUTION_TIME"
    | "MISSION_TIME";
}

export const DEFAULT_SWARM_CANDIDATE_ASSEMBLER_WEIGHTS:
  SwarmCandidateAssemblerWeights = Object.freeze({
    localDecisionConfidence: 0.45,
    contributionConfidence: 0.25,
    reliability: 0.20,
    partitionCoverage: 0.10,
    localDecisionUtility: 0.70,
    contributionUtility: 0.30,
    localDecisionRisk: 0.70,
    contributionRisk: 0.30,
    dissentPenalty: 0.08,
    restrictionPenalty: 0.03,
  });

/* ========================================================================== *
 * Assembler
 * ========================================================================== */

export class SwarmCandidateAssembler
  implements TradingSwarmCandidateAssemblerPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmCandidateAssemblerOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public assemble(
    mission: TradingSwarmMission,
    contributions: readonly TradingSwarmNodeContribution[],
  ): readonly TradingSwarmDecisionCandidate[] {
    try {
      validateMission(mission);
      validateContributions(mission, contributions);

      const candidates: TradingSwarmDecisionCandidate[] = [];
      const candidateIds = new Set<string>();
      const sourceDecisionIds = new Set<string>();

      for (
        const contribution of [...contributions].sort(
          (left, right) =>
            left.nodeId.localeCompare(right.nodeId),
        )
      ) {
        const localDecisions = [...contribution.localDecisions].sort(
          compareLocalDecisions,
        );

        if (localDecisions.length === 0) {
          if (
            this.options.createObservationOnlyCandidates &&
            contribution.observations.length > 0
          ) {
            const fallback = this.buildObservationOnlyCandidate(
              mission,
              contribution,
            );
            assertUniqueCandidate(fallback, candidateIds);
            candidates.push(fallback);
          }

          continue;
        }

        for (const localDecision of localDecisions) {
          if (sourceDecisionIds.has(localDecision.decisionId)) {
            throw new SwarmCandidateAssemblerError(
              "DUPLICATE_SOURCE_DECISION",
              `Duplicate source decision "${localDecision.decisionId}".`,
              {
                missionId: mission.missionId,
                nodeId: contribution.nodeId,
                decisionId: localDecision.decisionId,
              },
            );
          }

          sourceDecisionIds.add(localDecision.decisionId);

          const candidate = this.buildDecisionCandidate(
            mission,
            contribution,
            localDecision,
          );

          assertUniqueCandidate(candidate, candidateIds);
          candidates.push(candidate);
        }
      }

      candidates.sort(compareCandidates);

      if (
        candidates.length === 0 &&
        this.options.requireAtLeastOneCandidate
      ) {
        throw new SwarmCandidateAssemblerError(
          "NO_CANDIDATES",
          `Mission "${mission.missionId}" produced no decision candidates.`,
          { missionId: mission.missionId },
        );
      }

      return Object.freeze(candidates);
    } catch (error) {
      if (error instanceof SwarmCandidateAssemblerError) {
        throw error;
      }

      throw new SwarmCandidateAssemblerError(
        "ASSEMBLY_FAILED",
        "Failed to assemble swarm decision candidates.",
        {
          missionId: mission?.missionId,
          cause: error,
        },
      );
    }
  }

  private buildDecisionCandidate(
    mission: TradingSwarmMission,
    contribution: TradingSwarmNodeContribution,
    localDecision: MultiAgentCollectiveDecision,
  ): TradingSwarmDecisionCandidate {
    const partitionCoverageRatio = calculatePartitionCoverage(
      mission,
      contribution,
    );

    const restrictions = collectRestrictions(
      localDecision,
      this.options.maximumRestrictionsPerCandidate,
    );

    const actions = convertActions(
      mission,
      contribution,
      localDecision.actions,
      restrictions,
      this.options,
    );

    const decision = mapDecision(
      localDecision,
      actions,
      restrictions,
    );

    const confidence = calculateCandidateConfidence(
      contribution,
      localDecision,
      partitionCoverageRatio,
      restrictions.length,
      this.options.weights,
    );

    const expectedUtility = clampUtility(
      weightedAverage(
        [
          localDecision.expectedUtility.totalUtility,
          contribution.utilityContribution,
        ],
        [
          this.options.weights.localDecisionUtility,
          this.options.weights.contributionUtility,
        ],
      ),
    );

    const estimatedRisk = clampScore(
      weightedAverage(
        [
          calculateDecisionRisk(localDecision),
          contribution.riskContribution,
        ],
        [
          this.options.weights.localDecisionRisk,
          this.options.weights.contributionRisk,
        ],
      ),
    );

    const createdAtMs = resolveCreatedAt(
      mission,
      contribution,
      localDecision.decidedAtMs,
      this.options.createdAtStrategy,
    );

    const candidateId = createCandidateId(
      mission,
      contribution,
      localDecision.decisionId,
      decision,
      actions,
    );

    const candidateBase = {
      candidateId,
      missionId: mission.missionId,
      proposedByNodeId: contribution.nodeId,
      sourceDecisionIds: Object.freeze([
        localDecision.decisionId,
      ]),
      decision,
      actions,
      confidence,
      expectedUtility,
      estimatedRisk,
      partitionCoverageRatio,
      restrictions,
      createdAtMs,
    } satisfies Omit<
      TradingSwarmDecisionCandidate,
      "deterministicFingerprint"
    >;

    return deepFreeze<TradingSwarmDecisionCandidate>({
      ...candidateBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          candidateFingerprintInput(
            mission,
            contribution,
            candidateBase,
          ),
        ),
    });
  }

  private buildObservationOnlyCandidate(
    mission: TradingSwarmMission,
    contribution: TradingSwarmNodeContribution,
  ): TradingSwarmDecisionCandidate {
    const partitionCoverageRatio = calculatePartitionCoverage(
      mission,
      contribution,
    );

    const warnings = uniqueSorted(
      contribution.observations.flatMap(
        (observation) => observation.warnings,
      ),
    );

    const errors = uniqueSorted(
      contribution.observations.flatMap(
        (observation) => observation.errors,
      ),
    );

    const restrictions = Object.freeze(
      [...warnings, ...errors].slice(
        0,
        this.options.maximumRestrictionsPerCandidate,
      ),
    );

    const confidence = clampScore(
      weightedAverage(
        [
          contribution.confidence,
          contribution.reliabilityScore,
          partitionCoverageRatio,
          this.options.fallbackConfidence,
        ],
        [
          this.options.weights.contributionConfidence,
          this.options.weights.reliability,
          this.options.weights.partitionCoverage,
          this.options.weights.localDecisionConfidence,
        ],
      ) -
        restrictions.length *
          this.options.weights.restrictionPenalty,
    );

    const action = createNoAction(
      mission,
      contribution,
      restrictions,
    );

    const candidateId = createCandidateId(
      mission,
      contribution,
      "observation-only",
      this.options.fallbackDecision,
      Object.freeze([action]),
    );

    const candidateBase = {
      candidateId,
      missionId: mission.missionId,
      proposedByNodeId: contribution.nodeId,
      sourceDecisionIds: Object.freeze([]),
      decision: this.options.fallbackDecision,
      actions: Object.freeze([action]),
      confidence,
      expectedUtility: clampUtility(
        weightedAverage(
          [
            contribution.utilityContribution,
            this.options.fallbackUtility,
          ],
          [0.7, 0.3],
        ),
      ),
      estimatedRisk: clampScore(
        weightedAverage(
          [
            contribution.riskContribution,
            this.options.fallbackRisk,
          ],
          [0.7, 0.3],
        ),
      ),
      partitionCoverageRatio,
      restrictions,
      createdAtMs: resolveCreatedAt(
        mission,
        contribution,
        contribution.submittedAtMs,
        this.options.createdAtStrategy,
      ),
    } satisfies Omit<
      TradingSwarmDecisionCandidate,
      "deterministicFingerprint"
    >;

    return deepFreeze<TradingSwarmDecisionCandidate>({
      ...candidateBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          candidateFingerprintInput(
            mission,
            contribution,
            candidateBase,
          ),
        ),
    });
  }
}

/* ========================================================================== *
 * Decision and action mapping
 * ========================================================================== */

function mapDecision(
  localDecision: MultiAgentCollectiveDecision,
  actions: readonly TradingSwarmDecisionAction[],
  restrictions: readonly string[],
): TradingSwarmDecision {
  switch (localDecision.decision) {
    case "EXECUTE":
      if (actions.every((action) => action.type === "NO_ACTION")) {
        return "HOLD";
      }

      return restrictions.length > 0
        ? "EXECUTE_WITH_RESTRICTIONS"
        : "EXECUTE";

    case "EXECUTE_WITH_RESTRICTIONS":
      return "EXECUTE_WITH_RESTRICTIONS";

    case "MONITOR":
      return "HOLD";

    case "HOLD":
      return "HOLD";

    case "DEFER":
      return "DEFER";

    case "REJECT":
      return "REJECT";

    case "ESCALATE":
      return "DEFER";
  }
}

function convertActions(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
  actions: readonly MultiAgentDecisionAction[],
  candidateRestrictions: readonly string[],
  options: NormalizedOptions,
): readonly TradingSwarmDecisionAction[] {
  const result: TradingSwarmDecisionAction[] = [];
  const ids = new Set<string>();

  for (
    const action of [...actions].sort(
      (left, right) =>
        left.actionId.localeCompare(right.actionId),
    )
  ) {
    if (!action.approved && !options.includeUnapprovedActions) {
      continue;
    }

    const converted = convertAction(
      mission,
      contribution,
      action,
      candidateRestrictions,
    );

    if (ids.has(converted.actionId)) {
      throw new SwarmCandidateAssemblerError(
        "INVALID_ACTION",
        `Duplicate converted action "${converted.actionId}".`,
        {
          missionId: mission.missionId,
          nodeId: contribution.nodeId,
          actionId: converted.actionId,
        },
      );
    }

    ids.add(converted.actionId);
    result.push(converted);

    if (result.length >= options.maximumActionsPerCandidate) {
      break;
    }
  }

  if (result.length === 0) {
    result.push(
      createNoAction(
        mission,
        contribution,
        candidateRestrictions,
      ),
    );
  }

  return Object.freeze(result);
}

function convertAction(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
  decisionAction: MultiAgentDecisionAction,
  candidateRestrictions: readonly string[],
): TradingSwarmDecisionAction {
  const proposalAction = decisionAction.action;
  const type = mapActionType(proposalAction);
  const marketId = extractMarketId(proposalAction);
  const restrictions = uniqueSorted([
    ...candidateRestrictions,
    ...decisionAction.restrictions,
    ...(decisionAction.approved
      ? []
      : ["Source multi-agent action was not approved."]),
  ]);

  const actionBase: TradingSwarmDecisionAction = {
    actionId: createActionId(
      mission.missionId,
      contribution.nodeId,
      decisionAction.actionId,
      type,
    ),
    type,
    assignedNodeId: contribution.nodeId,
    ...(contribution.partitionIds[0] === undefined
      ? {}
      : { partitionId: contribution.partitionIds[0] }),
    ...(marketId === undefined ? {} : { marketId }),
    ...(proposalAction.strategyId === undefined
      ? {}
      : { strategyId: proposalAction.strategyId }),
    ...(proposalAction.quantity === undefined
      ? {}
      : { quantity: proposalAction.quantity }),
    ...(proposalAction.notional === undefined
      ? {}
      : { notional: proposalAction.notional }),
    priority: mapPriority(proposalAction.priority),
    dependencies: Object.freeze([
      decisionAction.sourceProposalId,
    ]),
    restrictions,
    metadata: deepFreeze({
      sourceActionId: decisionAction.actionId,
      sourceProposalId: decisionAction.sourceProposalId,
      sourceActionType: proposalAction.type,
      approved: decisionAction.approved,
      confidence: decisionAction.confidence,
      contributingAgentIds:
        [...decisionAction.contributingAgentIds].sort(),
      side: proposalAction.side ?? null,
      targetWeight: proposalAction.targetWeight ?? null,
      executionMode: proposalAction.executionMode ?? null,
      arbitrageDecisionId:
        proposalAction.arbitrageDecisionId ?? null,
      portfolioId: proposalAction.portfolioId ?? null,
      parameters: proposalAction.parameters ?? null,
    }),
  };

  validateDecisionAction(actionBase);

  return deepFreeze(actionBase);
}

function mapActionType(
  action: MultiAgentProposalAction,
): TradingSwarmDecisionAction["type"] {
  switch (action.type) {
    case "NO_ACTION":
    case "MONITOR":
    case "RESEARCH":
    case "PUBLISH_SIGNAL":
      return "NO_ACTION";

    case "OPEN_POSITION":
    case "INCREASE_POSITION":
      return "PLACE_ORDER";

    case "REDUCE_POSITION":
      return "REDUCE_EXPOSURE";

    case "CLOSE_POSITION":
      return "CLOSE_POSITION";

    case "HEDGE_POSITION":
      return "HEDGE_RISK";

    case "REBALANCE_PORTFOLIO":
    case "CHANGE_STRATEGY_WEIGHT":
      return "REBALANCE_PORTFOLIO";

    case "ACTIVATE_STRATEGY":
    case "RESUME_TRADING":
      return "RESUME_STRATEGY";

    case "DEACTIVATE_STRATEGY":
    case "PAUSE_TRADING":
      return "PAUSE_STRATEGY";

    case "ROTATE_STRATEGY":
      return "ROTATE_STRATEGY";

    case "EXECUTE_ARBITRAGE":
      return "EXECUTE_ARBITRAGE";

    case "ESCALATE_TO_OPERATOR":
    case "CUSTOM":
      return "NO_ACTION";
  }
}

function mapPriority(
  priority: MultiAgentProposalAction["priority"],
): TradingSwarmPriority {
  switch (priority) {
    case "INFORMATIONAL":
      return "BACKGROUND";
    case "LOW":
      return "LOW";
    case "MEDIUM":
      return "NORMAL";
    case "HIGH":
      return "HIGH";
    case "VERY_HIGH":
      return "VERY_HIGH";
    case "CRITICAL":
      return "CRITICAL";
  }
}

function createNoAction(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
  restrictions: readonly string[],
): TradingSwarmDecisionAction {
  return deepFreeze({
    actionId: createActionId(
      mission.missionId,
      contribution.nodeId,
      "no-action",
      "NO_ACTION",
    ),
    type: "NO_ACTION",
    assignedNodeId: contribution.nodeId,
    ...(contribution.partitionIds[0] === undefined
      ? {}
      : { partitionId: contribution.partitionIds[0] }),
    priority: mission.priority,
    dependencies: Object.freeze([]),
    restrictions: Object.freeze([...restrictions]),
    metadata: deepFreeze({
      generatedFallback: true,
      observationCount: contribution.observations.length,
      localDecisionCount: contribution.localDecisions.length,
    }),
  });
}

/* ========================================================================== *
 * Metrics
 * ========================================================================== */

function calculateCandidateConfidence(
  contribution: TradingSwarmNodeContribution,
  decision: MultiAgentCollectiveDecision,
  partitionCoverageRatio: TradingSwarmScore,
  restrictionCount: number,
  weights: SwarmCandidateAssemblerWeights,
): TradingSwarmScore {
  const dissentRatio =
    decision.dissent.length === 0
      ? 0
      : decision.dissent.filter(
          (record) => record.material,
        ).length / decision.dissent.length;

  const base = weightedAverage(
    [
      decision.collectiveConfidence.finalConfidence,
      contribution.confidence,
      contribution.reliabilityScore,
      partitionCoverageRatio,
    ],
    [
      weights.localDecisionConfidence,
      weights.contributionConfidence,
      weights.reliability,
      weights.partitionCoverage,
    ],
  );

  return clampScore(
    base -
      dissentRatio * weights.dissentPenalty -
      restrictionCount * weights.restrictionPenalty,
  );
}

function calculateDecisionRisk(
  decision: MultiAgentCollectiveDecision,
): TradingSwarmRisk {
  if (decision.risks.length === 0) {
    return 0;
  }

  let weightedRisk = 0;
  let totalWeight = 0;

  for (const risk of decision.risks) {
    const weight = severityWeight(risk.severity);
    weightedRisk +=
      risk.impact *
      risk.probability *
      risk.confidence *
      weight;
    totalWeight += weight;
  }

  return clampScore(
    totalWeight === 0
      ? 0
      : weightedRisk / totalWeight,
  );
}

function severityWeight(
  severity:
    MultiAgentCollectiveDecision["risks"][number]["severity"],
): number {
  switch (severity) {
    case "INFORMATIONAL":
      return 1;
    case "LOW":
      return 2;
    case "MODERATE":
      return 3;
    case "HIGH":
      return 4;
    case "CRITICAL":
      return 5;
  }
}

function calculatePartitionCoverage(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
): TradingSwarmScore {
  const required = uniqueSorted([
    ...mission.partitionIds,
    ...(mission.constraints.requiredPartitionIds ?? []),
  ]);

  if (required.length === 0) {
    return contribution.partitionIds.length > 0 ? 1 : 0;
  }

  const contributed = new Set(contribution.partitionIds);
  const covered = required.filter((partitionId) =>
    contributed.has(partitionId),
  ).length;

  return clampScore(covered / required.length);
}

/* ========================================================================== *
 * Restrictions, identity, and ordering
 * ========================================================================== */

function collectRestrictions(
  decision: MultiAgentCollectiveDecision,
  maximum: number,
): readonly string[] {
  const materialDissent = decision.dissent
    .filter((record) => record.material)
    .map((record) => `Dissent: ${record.rationale}`);

  const unresolvedRisks = decision.dissent.flatMap(
    (record) =>
      record.unresolvedRisks.map(
        (risk) => `${risk.code}: ${risk.description}`,
      ),
  );

  return Object.freeze(
    uniqueSorted([
      ...decision.restrictions,
      ...decision.governance.restrictions,
      ...decision.governance.rejectionReasons,
      ...materialDissent,
      ...unresolvedRisks,
    ]).slice(0, maximum),
  );
}

function createCandidateId(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
  sourceDecisionId: string,
  decision: TradingSwarmDecision,
  actions: readonly TradingSwarmDecisionAction[],
): string {
  return `swarm-candidate-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint: mission.deterministicFingerprint,
      nodeId: contribution.nodeId,
      contributionFingerprint:
        contribution.deterministicFingerprint,
      sourceDecisionId,
      decision,
      actionIds: actions.map((action) => action.actionId),
    }),
  )}`;
}

function createActionId(
  missionId: string,
  nodeId: string,
  sourceActionId: string,
  type: TradingSwarmDecisionAction["type"],
): string {
  return `swarm-action-${stableHash(
    stableStringify({
      missionId,
      nodeId,
      sourceActionId,
      type,
    }),
  )}`;
}

function extractMarketId(
  action: MultiAgentProposalAction,
): string | undefined {
  if (action.market === undefined) {
    return undefined;
  }

  const market = action.market as unknown as Readonly<
    Record<string, unknown>
  >;

  const candidates = [
    market.marketId,
    market.symbol,
    market.canonicalSymbol,
    market.instrumentId,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim().length > 0
    ) {
      return candidate;
    }
  }

  return undefined;
}

function resolveCreatedAt(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
  decisionTime: number,
  strategy: NormalizedOptions["createdAtStrategy"],
): TradingSwarmTimestamp {
  switch (strategy) {
    case "DECISION_TIME":
      return decisionTime as TradingSwarmTimestamp;
    case "CONTRIBUTION_TIME":
      return contribution.submittedAtMs;
    case "MISSION_TIME":
      return mission.createdAtMs;
  }
}

function compareLocalDecisions(
  left: MultiAgentCollectiveDecision,
  right: MultiAgentCollectiveDecision,
): number {
  const timeOrder = left.decidedAtMs - right.decidedAtMs;

  if (timeOrder !== 0) {
    return timeOrder;
  }

  return left.decisionId.localeCompare(right.decisionId);
}

function compareCandidates(
  left: TradingSwarmDecisionCandidate,
  right: TradingSwarmDecisionCandidate,
): number {
  const nodeOrder =
    left.proposedByNodeId.localeCompare(
      right.proposedByNodeId,
    );

  if (nodeOrder !== 0) {
    return nodeOrder;
  }

  const timeOrder = left.createdAtMs - right.createdAtMs;

  if (timeOrder !== 0) {
    return timeOrder;
  }

  return left.candidateId.localeCompare(right.candidateId);
}

/* ========================================================================== *
 * Validation
 * ========================================================================== */

function validateMission(
  mission: TradingSwarmMission,
): void {
  if (mission === undefined || mission === null) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_MISSION",
      "A swarm mission is required.",
    );
  }

  assertNonEmptyText(
    mission.missionId,
    "mission.missionId",
    "INVALID_MISSION",
  );
  assertNonEmptyText(
    mission.runId,
    "mission.runId",
    "INVALID_MISSION",
  );
}

function validateContributions(
  mission: TradingSwarmMission,
  contributions: readonly TradingSwarmNodeContribution[],
): void {
  if (!Array.isArray(contributions)) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_CONTRIBUTIONS",
      "contributions must be an array.",
      { missionId: mission.missionId },
    );
  }

  const nodeIds = new Set<string>();

  for (const contribution of contributions) {
    assertNonEmptyText(
      contribution.nodeId,
      "contribution.nodeId",
      "INVALID_CONTRIBUTIONS",
    );

    if (nodeIds.has(contribution.nodeId)) {
      throw new SwarmCandidateAssemblerError(
        "DUPLICATE_NODE_CONTRIBUTION",
        `Duplicate contribution for node "${contribution.nodeId}".`,
        {
          missionId: mission.missionId,
          nodeId: contribution.nodeId,
        },
      );
    }

    nodeIds.add(contribution.nodeId);

    validateScore(
      contribution.confidence,
      "contribution.confidence",
      mission.missionId,
      contribution.nodeId,
    );
    validateScore(
      contribution.riskContribution,
      "contribution.riskContribution",
      mission.missionId,
      contribution.nodeId,
    );
    validateScore(
      contribution.reliabilityScore,
      "contribution.reliabilityScore",
      mission.missionId,
      contribution.nodeId,
    );
    validateUtility(
      contribution.utilityContribution,
      "contribution.utilityContribution",
      mission.missionId,
      contribution.nodeId,
    );

    for (const observation of contribution.observations) {
      if (observation.missionId !== mission.missionId) {
        throw new SwarmCandidateAssemblerError(
          "MISSION_MISMATCH",
          `Observation "${observation.observationId}" belongs to another mission.`,
          {
            missionId: mission.missionId,
            nodeId: contribution.nodeId,
          },
        );
      }

      if (observation.nodeId !== contribution.nodeId) {
        throw new SwarmCandidateAssemblerError(
          "INVALID_CONTRIBUTIONS",
          `Observation "${observation.observationId}" belongs to another node.`,
          {
            missionId: mission.missionId,
            nodeId: contribution.nodeId,
          },
        );
      }
    }
  }
}

function validateDecisionAction(
  action: TradingSwarmDecisionAction,
): void {
  assertNonEmptyText(
    action.actionId,
    "action.actionId",
    "INVALID_ACTION",
  );

  if (
    action.quantity !== undefined &&
    (!Number.isFinite(action.quantity) ||
      action.quantity < 0)
  ) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_ACTION",
      "Action quantity must be non-negative and finite.",
      {
        actionId: action.actionId,
        field: "quantity",
      },
    );
  }

  if (
    action.notional !== undefined &&
    (!Number.isFinite(action.notional) ||
      action.notional < 0)
  ) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_ACTION",
      "Action notional must be non-negative and finite.",
      {
        actionId: action.actionId,
        field: "notional",
      },
    );
  }
}

function assertUniqueCandidate(
  candidate: TradingSwarmDecisionCandidate,
  ids: Set<string>,
): void {
  if (ids.has(candidate.candidateId)) {
    throw new SwarmCandidateAssemblerError(
      "DUPLICATE_CANDIDATE",
      `Duplicate candidate "${candidate.candidateId}".`,
      {
        missionId: candidate.missionId,
        nodeId: candidate.proposedByNodeId,
        candidateId: candidate.candidateId,
      },
    );
  }

  ids.add(candidate.candidateId);
}

/* ========================================================================== *
 * Fingerprints and configuration
 * ========================================================================== */

function candidateFingerprintInput(
  mission: TradingSwarmMission,
  contribution: TradingSwarmNodeContribution,
  candidate: Omit<
    TradingSwarmDecisionCandidate,
    "deterministicFingerprint"
  >,
): unknown {
  return {
    missionId: mission.missionId,
    missionFingerprint: mission.deterministicFingerprint,
    contributionFingerprint:
      contribution.deterministicFingerprint,
    candidateId: candidate.candidateId,
    proposedByNodeId: candidate.proposedByNodeId,
    sourceDecisionIds: candidate.sourceDecisionIds,
    decision: candidate.decision,
    actions: candidate.actions.map((action) => ({
      actionId: action.actionId,
      type: action.type,
      assignedNodeId: action.assignedNodeId ?? null,
      partitionId: action.partitionId ?? null,
      marketId: action.marketId ?? null,
      strategyId: action.strategyId ?? null,
      quantity: action.quantity ?? null,
      notional: action.notional ?? null,
      priority: action.priority,
      dependencies: action.dependencies,
      restrictions: action.restrictions,
    })),
    confidence: candidate.confidence,
    expectedUtility: candidate.expectedUtility,
    estimatedRisk: candidate.estimatedRisk,
    partitionCoverageRatio:
      candidate.partitionCoverageRatio,
    restrictions: candidate.restrictions,
    createdAtMs: candidate.createdAtMs,
  };
}

function normalizeOptions(
  options: SwarmCandidateAssemblerOptions,
): NormalizedOptions {
  const weights = normalizeWeights(options.weights);
  const maximumActionsPerCandidate =
    options.maximumActionsPerCandidate ?? 64;
  const maximumRestrictionsPerCandidate =
    options.maximumRestrictionsPerCandidate ?? 128;

  assertPositiveSafeInteger(
    maximumActionsPerCandidate,
    "maximumActionsPerCandidate",
  );
  assertPositiveSafeInteger(
    maximumRestrictionsPerCandidate,
    "maximumRestrictionsPerCandidate",
  );

  const fallbackUtility = options.fallbackUtility ?? 0;
  const fallbackRisk = options.fallbackRisk ?? 0.5;
  const fallbackConfidence =
    options.fallbackConfidence ?? 0.25;

  validateUtility(
    fallbackUtility,
    "fallbackUtility",
  );
  validateScore(
    fallbackRisk,
    "fallbackRisk",
  );
  validateScore(
    fallbackConfidence,
    "fallbackConfidence",
  );

  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmCandidateFingerprintGenerator(),
    weights,
    createObservationOnlyCandidates:
      options.createObservationOnlyCandidates ?? true,
    requireAtLeastOneCandidate:
      options.requireAtLeastOneCandidate ?? true,
    includeUnapprovedActions:
      options.includeUnapprovedActions ?? false,
    maximumActionsPerCandidate,
    maximumRestrictionsPerCandidate,
    fallbackDecision: options.fallbackDecision ?? "HOLD",
    fallbackUtility,
    fallbackRisk,
    fallbackConfidence,
    createdAtStrategy:
      options.createdAtStrategy ?? "DECISION_TIME",
  });
}

function normalizeWeights(
  supplied:
    | Partial<SwarmCandidateAssemblerWeights>
    | undefined,
): SwarmCandidateAssemblerWeights {
  const weights = {
    ...DEFAULT_SWARM_CANDIDATE_ASSEMBLER_WEIGHTS,
    ...(supplied ?? {}),
  };

  for (const [field, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new SwarmCandidateAssemblerError(
        "INVALID_CONTRIBUTION_METRICS",
        `Weight "${field}" must be non-negative and finite.`,
        { field },
      );
    }
  }

  return Object.freeze(weights);
}

export function createSwarmCandidateAssembler(
  options: SwarmCandidateAssemblerOptions = {},
): SwarmCandidateAssembler {
  return new SwarmCandidateAssembler(options);
}

export class StableSwarmCandidateFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-candidate-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Generic deterministic utilities
 * ========================================================================== */

function weightedAverage(
  values: readonly number[],
  weights: readonly number[],
): number {
  if (values.length !== weights.length) {
    throw new SwarmCandidateAssemblerError(
      "ASSEMBLY_FAILED",
      "Weighted-average inputs must have equal lengths.",
    );
  }

  let weighted = 0;
  let totalWeight = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    const weight = weights[index] ?? 0;
    weighted += value * weight;
    totalWeight += weight;
  }

  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

function clampScore(value: number): TradingSwarmScore {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function clampUtility(value: number): TradingSwarmUtility {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(-1, value));
}

function validateScore(
  value: number,
  field: string,
  missionId?: string,
  nodeId?: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_CONTRIBUTION_METRICS",
      `${field} must be between 0 and 1.`,
      { missionId, nodeId, field },
    );
  }
}

function validateUtility(
  value: number,
  field: string,
  missionId?: string,
  nodeId?: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < -1 ||
    value > 1
  ) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_CONTRIBUTION_METRICS",
      `${field} must be between -1 and 1.`,
      { missionId, nodeId, field },
    );
  }
}

function assertPositiveSafeInteger(
  value: number,
  field: string,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SwarmCandidateAssemblerError(
      "INVALID_CONTRIBUTION_METRICS",
      `${field} must be a positive safe integer.`,
      { field },
    );
  }
}

function assertNonEmptyText(
  value: string,
  field: string,
  code:
    | "INVALID_MISSION"
    | "INVALID_CONTRIBUTIONS"
    | "INVALID_ACTION",
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new SwarmCandidateAssemblerError(
      code,
      `${field} must be a non-empty string.`,
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
        (value) => value.trim().length > 0,
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
  return JSON.stringify(normalizeForStableJson(value));
}

function normalizeForStableJson(value: unknown): unknown {
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
      .sort(compareNormalizedValues);
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(String(right)),
      )
      .map(([key, item]) => [
        normalizeForStableJson(key),
        normalizeForStableJson(item),
      ]);
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

      output[key] = normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}

function compareNormalizedValues(
  left: unknown,
  right: unknown,
): number {
  return JSON.stringify(left).localeCompare(
    JSON.stringify(right),
  );
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

// End of swarm-candidate-assembler.ts