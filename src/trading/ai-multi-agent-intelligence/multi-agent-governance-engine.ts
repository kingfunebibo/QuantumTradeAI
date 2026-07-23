/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-governance-engine.ts
 *
 * Deterministic, immutable governance and safety assessment for collective
 * multi-agent trading decisions.
 */

import {
  type MultiAgentActionType,
  type MultiAgentApprovalRequirement,
  type MultiAgentConfidence,
  type MultiAgentConsensusResult,
  type MultiAgentGovernanceAssessment,
  type MultiAgentGovernanceDecision,
  type MultiAgentGovernanceEnginePort,
  type MultiAgentGovernanceRule,
  type MultiAgentGovernanceRuleEvaluation,
  type MultiAgentId,
  type MultiAgentKnowledgeId,
  type MultiAgentPriority,
  type MultiAgentProposal,
  type MultiAgentRiskFinding,
  type MultiAgentRiskSeverity,
  type MultiAgentRole,
  type MultiAgentRunRequest,
  type MultiAgentSafetyPolicy,
  type MultiAgentScore,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentGovernanceEngineErrorCode =
  | "INVALID_GOVERNANCE_INPUT"
  | "INVALID_SAFETY_POLICY"
  | "DUPLICATE_GOVERNANCE_RULE"
  | "INVALID_RULE_METADATA"
  | "GOVERNANCE_EVALUATION_FAILED";

export interface MultiAgentGovernanceEngineErrorDetails {
  readonly ruleId?: string;
  readonly proposalId?: string;
  readonly cause?: unknown;
}

export class MultiAgentGovernanceEngineError extends Error {
  public readonly code: MultiAgentGovernanceEngineErrorCode;
  public readonly details: MultiAgentGovernanceEngineErrorDetails;

  public constructor(
    code: MultiAgentGovernanceEngineErrorCode,
    message: string,
    details: MultiAgentGovernanceEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentGovernanceEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentGovernanceClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentGovernanceEngineOptions {
  readonly clock?: MultiAgentGovernanceClock;
  readonly defaultApprovalRequirement?: MultiAgentApprovalRequirement;
  readonly restrictionConfidencePenalty?: number;
  readonly softFailureConfidencePenalty?: number;
  readonly hardFailureConfidencePenalty?: number;
  readonly escalationConfidencePenalty?: number;
  readonly staleContextThresholdMs?: number;
  readonly minimumHealthySystemRatio?: MultiAgentScore;
}

export interface MultiAgentGovernanceSnapshot {
  readonly decision: MultiAgentGovernanceDecision;
  readonly approvalRequirement: MultiAgentApprovalRequirement;
  readonly evaluatedRuleCount: number;
  readonly passedRuleCount: number;
  readonly failedRuleCount: number;
  readonly hardFailureCount: number;
  readonly restrictionCount: number;
  readonly rejectionReasonCount: number;
  readonly confidence: MultiAgentConfidence;
  readonly assessedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentGovernanceClock;
  readonly defaultApprovalRequirement: MultiAgentApprovalRequirement;
  readonly restrictionConfidencePenalty: number;
  readonly softFailureConfidencePenalty: number;
  readonly hardFailureConfidencePenalty: number;
  readonly escalationConfidencePenalty: number;
  readonly staleContextThresholdMs: number;
  readonly minimumHealthySystemRatio: MultiAgentScore;
}

interface RuleEvaluationContext {
  readonly request: MultiAgentRunRequest;
  readonly proposal: MultiAgentProposal | undefined;
  readonly consensus: MultiAgentConsensusResult;
  readonly safety: MultiAgentSafetyPolicy;
}

interface RuleEvaluationOutcome {
  readonly passed: boolean;
  readonly severity: MultiAgentRiskSeverity;
  readonly message: string;
  readonly restrictions: readonly string[];
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
}

interface DecisionInputs {
  readonly evaluations: readonly MultiAgentGovernanceRuleEvaluation[];
  readonly selectedProposal: MultiAgentProposal | undefined;
  readonly consensus: MultiAgentConsensusResult;
  readonly safety: MultiAgentSafetyPolicy;
  readonly restrictions: readonly string[];
  readonly rejectionReasons: readonly string[];
  readonly unresolvedMaterialDissent: boolean;
  readonly unresolvedConflict: boolean;
  readonly criticalRisk: boolean;
  readonly staleContext: boolean;
  readonly criticalSystemHealth: boolean;
}

const PRIORITY_WEIGHT: Readonly<Record<MultiAgentPriority, number>> =
  Object.freeze({
    INFORMATIONAL: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    VERY_HIGH: 4,
    CRITICAL: 5,
  });

const SEVERITY_WEIGHT: Readonly<Record<MultiAgentRiskSeverity, number>> =
  Object.freeze({
    INFORMATIONAL: 0,
    LOW: 1,
    MODERATE: 2,
    HIGH: 3,
    CRITICAL: 4,
  });

const EXECUTABLE_ACTIONS: ReadonlySet<MultiAgentActionType> =
  new Set<MultiAgentActionType>([
    "OPEN_POSITION",
    "INCREASE_POSITION",
    "REDUCE_POSITION",
    "CLOSE_POSITION",
    "HEDGE_POSITION",
    "REBALANCE_PORTFOLIO",
    "ACTIVATE_STRATEGY",
    "DEACTIVATE_STRATEGY",
    "ROTATE_STRATEGY",
    "CHANGE_STRATEGY_WEIGHT",
    "EXECUTE_ARBITRAGE",
    "PAUSE_TRADING",
    "RESUME_TRADING",
    "CUSTOM",
  ]);

export class MultiAgentGovernanceEngine
  implements MultiAgentGovernanceEnginePort
{
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentGovernanceSnapshot;

  public constructor(
    options: MultiAgentGovernanceEngineOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      decision: "DEFERRED",
      approvalRequirement:
        this.options.defaultApprovalRequirement,
      evaluatedRuleCount: 0,
      passedRuleCount: 0,
      failedRuleCount: 0,
      hardFailureCount: 0,
      restrictionCount: 0,
      rejectionReasonCount: 0,
      confidence: 0 as MultiAgentConfidence,
      deterministicFingerprint: fingerprint({
        decision: "DEFERRED",
        evaluatedRuleCount: 0,
      }),
    });
  }

  public snapshot(): MultiAgentGovernanceSnapshot {
    return this.lastSnapshotValue;
  }

  public evaluate(
    request: MultiAgentRunRequest,
    selectedProposal: MultiAgentProposal | undefined,
    consensus: MultiAgentConsensusResult,
    rules: readonly MultiAgentGovernanceRule[],
    safety: MultiAgentSafetyPolicy,
  ): MultiAgentGovernanceAssessment {
    validateInputs(
      request,
      selectedProposal,
      consensus,
      rules,
      safety,
    );

    const assessedAtMs = this.options.clock.now();
    const orderedRules = [...rules]
      .filter((rule) => rule.enabled)
      .sort(compareRules);

    const context: RuleEvaluationContext = {
      request,
      proposal: selectedProposal,
      consensus,
      safety,
    };

    const evaluations = Object.freeze(
      orderedRules.map((rule) =>
        evaluateRule(rule, context),
      ),
    );

    const safetyEvaluation = evaluateSafetyPolicy(
      request,
      selectedProposal,
      consensus,
      safety,
      assessedAtMs,
      this.options,
    );

    const allEvaluations = Object.freeze([
      ...evaluations,
      ...safetyEvaluation.evaluations,
    ]);

    const restrictions = Object.freeze(
      uniqueSorted([
        ...allEvaluations.flatMap(
          (evaluation) => evaluation.restrictions,
        ),
        ...selectedProposal?.constraints
          .filter(
            (constraint) =>
              !constraint.satisfied &&
              !constraint.hard,
          )
          .map(
            (constraint) =>
              constraint.failureReason ??
              `Satisfy constraint "${constraint.name}".`,
          ) ?? [],
      ]),
    );

    const rejectionReasons = Object.freeze(
      uniqueSorted([
        ...allEvaluations
          .filter(
            (evaluation) =>
              !evaluation.passed &&
              evaluation.severity === "CRITICAL",
          )
          .map(
            (evaluation) => evaluation.message,
          ),
        ...selectedProposal?.constraints
          .filter(
            (constraint) =>
              constraint.hard &&
              !constraint.satisfied,
          )
          .map(
            (constraint) =>
              constraint.failureReason ??
              `Hard constraint "${constraint.name}" failed.`,
          ) ?? [],
      ]),
    );

    const decisionInputs: DecisionInputs = {
      evaluations: allEvaluations,
      selectedProposal,
      consensus,
      safety,
      restrictions,
      rejectionReasons,
      unresolvedMaterialDissent:
        safetyEvaluation.unresolvedMaterialDissent,
      unresolvedConflict:
        safetyEvaluation.unresolvedConflict,
      criticalRisk: safetyEvaluation.criticalRisk,
      staleContext: safetyEvaluation.staleContext,
      criticalSystemHealth:
        safetyEvaluation.criticalSystemHealth,
    };

    const decision = determineDecision(decisionInputs);
    const approvalRequirement =
      determineApprovalRequirement(
        decision,
        selectedProposal,
        consensus,
        allEvaluations,
        safety,
        this.options.defaultApprovalRequirement,
      );
    const approvingAgentIds = Object.freeze(
      deriveApprovingAgentIds(
        consensus,
        approvalRequirement,
      ),
    );
    const confidence = calculateGovernanceConfidence(
      selectedProposal,
      consensus,
      allEvaluations,
      decision,
      restrictions.length,
      this.options,
    );

    const assessment: MultiAgentGovernanceAssessment =
      deepFreeze({
        decision,
        approvalRequirement,
        ruleEvaluations: allEvaluations,
        restrictions,
        rejectionReasons,
        approvingAgentIds,
        assessedAtMs,
        confidence:
          confidence as MultiAgentConfidence,
      });

    const hardRuleIds = new Set(
      orderedRules
        .filter((rule) => rule.hard)
        .map((rule) => rule.ruleId),
    );
    const failedRuleCount = allEvaluations.filter(
      (evaluation) => !evaluation.passed,
    ).length;
    const hardFailureCount = allEvaluations.filter(
      (evaluation) =>
        !evaluation.passed &&
        (hardRuleIds.has(evaluation.ruleId) ||
          evaluation.severity === "CRITICAL"),
    ).length;

    this.lastSnapshotValue = deepFreeze({
      decision,
      approvalRequirement,
      evaluatedRuleCount: allEvaluations.length,
      passedRuleCount:
        allEvaluations.length - failedRuleCount,
      failedRuleCount,
      hardFailureCount,
      restrictionCount: restrictions.length,
      rejectionReasonCount:
        rejectionReasons.length,
      confidence:
        confidence as MultiAgentConfidence,
      assessedAtMs,
      deterministicFingerprint: fingerprint({
        decision,
        approvalRequirement,
        evaluations: allEvaluations,
        restrictions,
        rejectionReasons,
        approvingAgentIds,
        assessedAtMs,
        confidence,
      }),
    });

    return assessment;
  }
}

export function createMultiAgentGovernanceEngine(
  options: MultiAgentGovernanceEngineOptions = {},
): MultiAgentGovernanceEngine {
  return new MultiAgentGovernanceEngine(options);
}

function evaluateRule(
  rule: MultiAgentGovernanceRule,
  context: RuleEvaluationContext,
): MultiAgentGovernanceRuleEvaluation {
  const applicableActions =
    context.proposal?.actions.filter(
      (action) =>
        rule.applicableActions.length === 0 ||
        rule.applicableActions.includes(action.type),
    ) ?? [];

  if (
    context.proposal !== undefined &&
    rule.applicableActions.length > 0 &&
    applicableActions.length === 0
  ) {
    return deepFreeze({
      ruleId: rule.ruleId,
      passed: true,
      severity: "INFORMATIONAL",
      message:
        `Rule "${rule.name}" is not applicable to the selected proposal actions.`,
      restrictions: Object.freeze([]),
      evidenceIds: Object.freeze([]),
    });
  }

  try {
    const outcomes: RuleEvaluationOutcome[] = [];

    outcomes.push(
      evaluateRequiredRoles(rule, context),
      evaluateRuleMetadata(rule, context),
    );

    const failed = outcomes.filter(
      (outcome) => !outcome.passed,
    );
    const passed = failed.length === 0;
    const severity = passed
      ? "INFORMATIONAL"
      : maximumSeverity(
          failed.map((outcome) => outcome.severity),
        );
    const messages = outcomes
      .filter(
        (outcome) =>
          !outcome.passed ||
          outcome.message.length > 0,
      )
      .map((outcome) => outcome.message)
      .filter((message) => message.length > 0);
    const restrictions = uniqueSorted(
      outcomes.flatMap(
        (outcome) => outcome.restrictions,
      ),
    );
    const evidenceIds = uniqueSorted(
      outcomes.flatMap(
        (outcome) => outcome.evidenceIds,
      ),
    );

    return deepFreeze({
      ruleId: rule.ruleId,
      passed,
      severity,
      message:
        messages.join(" ") ||
        `Rule "${rule.name}" passed.`,
      restrictions: Object.freeze(restrictions),
      evidenceIds: Object.freeze(evidenceIds),
    });
  } catch (cause) {
    throw new MultiAgentGovernanceEngineError(
      "GOVERNANCE_EVALUATION_FAILED",
      `Failed to evaluate governance rule "${rule.ruleId}".`,
      {
        ruleId: rule.ruleId,
        proposalId:
          context.proposal?.proposalId,
        cause,
      },
    );
  }
}

function evaluateRequiredRoles(
  rule: MultiAgentGovernanceRule,
  context: RuleEvaluationContext,
): RuleEvaluationOutcome {
  if (rule.requiredRoles.length === 0) {
    return passedOutcome();
  }

  const participantAgentIds = new Set(
    context.consensus.votes.map(
      (vote) => vote.agentId,
    ),
  );
  const roleMappings =
    readRoleMappings(rule.metadata);
  const missingRoles = rule.requiredRoles.filter(
    (role) => {
      const configuredAgents =
        roleMappings.get(role);

      if (configuredAgents === undefined) {
        return true;
      }

      return !configuredAgents.some((agentId) =>
        participantAgentIds.has(agentId),
      );
    },
  );

  if (missingRoles.length === 0) {
    return {
      passed: true,
      severity: "INFORMATIONAL",
      message:
        `Required roles for rule "${rule.name}" participated.`,
      restrictions: Object.freeze([]),
      evidenceIds: Object.freeze([]),
    };
  }

  return {
    passed: false,
    severity: rule.hard ? "CRITICAL" : "HIGH",
    message:
      `Rule "${rule.name}" is missing required role participation: ${missingRoles.join(", ")}.`,
    restrictions: Object.freeze([
      `Obtain participation from: ${missingRoles.join(", ")}.`,
    ]),
    evidenceIds: Object.freeze([]),
  };
}

function evaluateRuleMetadata(
  rule: MultiAgentGovernanceRule,
  context: RuleEvaluationContext,
): RuleEvaluationOutcome {
  const metadata = asRecord(rule.metadata);

  if (metadata === undefined) {
    return passedOutcome(
      `Rule "${rule.name}" has no metadata constraints.`,
    );
  }

  const failures: string[] = [];
  const restrictions: string[] = [];
  const evidenceIds: MultiAgentKnowledgeId[] = [];

  const minimumConsensusConfidence =
    readOptionalNumber(
      metadata,
      "minimumConsensusConfidence",
      rule.ruleId,
    );

  if (
    minimumConsensusConfidence !== undefined &&
    context.consensus.collectiveConfidence
      .finalConfidence <
      minimumConsensusConfidence
  ) {
    failures.push(
      `Collective confidence ${formatNumber(
        context.consensus.collectiveConfidence
          .finalConfidence,
      )} is below required ${formatNumber(
        minimumConsensusConfidence,
      )}.`,
    );
    restrictions.push(
      "Increase evidence quality or obtain additional qualified votes.",
    );
  }

  const minimumApprovalRatio =
    readOptionalNumber(
      metadata,
      "minimumApprovalRatio",
      rule.ruleId,
    );

  if (minimumApprovalRatio !== undefined) {
    const total =
      context.consensus.approvalWeight +
      context.consensus.rejectionWeight +
      context.consensus.abstentionWeight;
    const ratio =
      total <= 0
        ? 0
        : context.consensus.approvalWeight /
          total;

    if (ratio < minimumApprovalRatio) {
      failures.push(
        `Approval ratio ${formatNumber(ratio)} is below required ${formatNumber(minimumApprovalRatio)}.`,
      );
      restrictions.push(
        "Obtain additional approval weight.",
      );
    }
  }

  const maximumCapitalAtRisk =
    readOptionalNumber(
      metadata,
      "maximumCapitalAtRisk",
      rule.ruleId,
    );

  if (
    maximumCapitalAtRisk !== undefined &&
    proposalCapitalAtRisk(context.proposal) >
      maximumCapitalAtRisk
  ) {
    failures.push(
      `Proposal capital at risk ${proposalCapitalAtRisk(
        context.proposal,
      )} exceeds rule maximum ${maximumCapitalAtRisk}.`,
    );
    restrictions.push(
      `Cap capital at risk at ${maximumCapitalAtRisk}.`,
    );
  }

  const maximumLeverage = readOptionalNumber(
    metadata,
    "maximumLeverage",
    rule.ruleId,
  );

  if (
    maximumLeverage !== undefined &&
    (context.request.context.portfolio
      ?.leverage ?? 0) > maximumLeverage
  ) {
    failures.push(
      `Portfolio leverage ${context.request.context.portfolio?.leverage ?? 0} exceeds rule maximum ${maximumLeverage}.`,
    );
    restrictions.push(
      `Reduce leverage to ${maximumLeverage} or below.`,
    );
  }

  const maximumRiskScore =
    readOptionalNumber(
      metadata,
      "maximumRiskScore",
      rule.ruleId,
    );

  if (
    maximumRiskScore !== undefined &&
    proposalRiskScore(context.proposal) >
      maximumRiskScore
  ) {
    failures.push(
      `Proposal risk score ${formatNumber(
        proposalRiskScore(context.proposal),
      )} exceeds rule maximum ${formatNumber(
        maximumRiskScore,
      )}.`,
    );
    restrictions.push(
      "Reduce or mitigate proposal risk.",
    );
  }

  const requireConsensusStatus =
    readOptionalStringArray(
      metadata,
      "allowedConsensusStatuses",
      rule.ruleId,
    );

  if (
    requireConsensusStatus !== undefined &&
    !requireConsensusStatus.includes(
      context.consensus.status,
    )
  ) {
    failures.push(
      `Consensus status "${context.consensus.status}" is not allowed by rule "${rule.name}".`,
    );
    restrictions.push(
      "Resolve consensus status before execution.",
    );
  }

  const prohibitedActions =
    readOptionalStringArray(
      metadata,
      "prohibitedActions",
      rule.ruleId,
    );

  if (prohibitedActions !== undefined) {
    const matched =
      context.proposal?.actions
        .map((action) => action.type)
        .filter((action) =>
          prohibitedActions.includes(action),
        ) ?? [];

    if (matched.length > 0) {
      failures.push(
        `Prohibited action(s) detected: ${uniqueSorted(matched).join(", ")}.`,
      );
      restrictions.push(
        "Remove prohibited actions from the proposal.",
      );
    }
  }

  const requiredEvidenceIds =
    readOptionalStringArray(
      metadata,
      "requiredEvidenceIds",
      rule.ruleId,
    );

  if (requiredEvidenceIds !== undefined) {
    const availableEvidenceIds = new Set(
      context.proposal?.evidence.map(
        (item) => item.evidenceId,
      ) ?? [],
    );
    const missing = requiredEvidenceIds.filter(
      (evidenceId) =>
        !availableEvidenceIds.has(evidenceId),
    );

    evidenceIds.push(
      ...requiredEvidenceIds.filter((evidenceId) =>
        availableEvidenceIds.has(evidenceId),
      ),
    );

    if (missing.length > 0) {
      failures.push(
        `Required evidence is missing: ${missing.join(", ")}.`,
      );
      restrictions.push(
        "Provide all required evidence before approval.",
      );
    }
  }

  const requireDeterministic =
    readOptionalBoolean(
      metadata,
      "requireDeterministicFingerprint",
      rule.ruleId,
    );

  if (
    requireDeterministic === true &&
    !hasDeterministicFingerprints(
      context.request,
      context.proposal,
      context.consensus,
    )
  ) {
    failures.push(
      "Required deterministic fingerprints are missing.",
    );
    restrictions.push(
      "Regenerate the decision with deterministic fingerprints.",
    );
  }

  if (failures.length === 0) {
    return {
      passed: true,
      severity: "INFORMATIONAL",
      message: `Rule "${rule.name}" passed.`,
      restrictions: Object.freeze([]),
      evidenceIds: Object.freeze(
        uniqueSorted(evidenceIds),
      ),
    };
  }

  return {
    passed: false,
    severity: rule.hard
      ? "CRITICAL"
      : priorityToSeverity(rule.priority),
    message:
      `Rule "${rule.name}" failed: ${failures.join(" ")}`,
    restrictions: Object.freeze(
      uniqueSorted(restrictions),
    ),
    evidenceIds: Object.freeze(
      uniqueSorted(evidenceIds),
    ),
  };
}

function evaluateSafetyPolicy(
  request: MultiAgentRunRequest,
  proposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  safety: MultiAgentSafetyPolicy,
  assessedAtMs: MultiAgentTimestamp,
  options: NormalizedOptions,
): {
  readonly evaluations: readonly MultiAgentGovernanceRuleEvaluation[];
  readonly unresolvedMaterialDissent: boolean;
  readonly unresolvedConflict: boolean;
  readonly criticalRisk: boolean;
  readonly staleContext: boolean;
  readonly criticalSystemHealth: boolean;
} {
  const evaluations: MultiAgentGovernanceRuleEvaluation[] = [];

  const collectiveConfidence =
    consensus.collectiveConfidence.finalConfidence;
  evaluations.push(
    safetyEvaluation(
      "safety-minimum-collective-confidence",
      collectiveConfidence >=
        safety.minimumCollectiveConfidence,
      collectiveConfidence >=
        safety.minimumCollectiveConfidence
        ? "Collective confidence satisfies the safety minimum."
        : `Collective confidence ${formatNumber(collectiveConfidence)} is below safety minimum ${formatNumber(safety.minimumCollectiveConfidence)}.`,
      "HIGH",
      [
        "Obtain additional reliable evidence or qualified approvals.",
      ],
      [],
    ),
  );

  const evidenceQuality =
    proposalEvidenceQuality(proposal);
  evaluations.push(
    safetyEvaluation(
      "safety-minimum-evidence-quality",
      evidenceQuality >=
        safety.minimumEvidenceQuality,
      evidenceQuality >=
        safety.minimumEvidenceQuality
        ? "Proposal evidence quality satisfies the safety minimum."
        : `Evidence quality ${formatNumber(evidenceQuality)} is below safety minimum ${formatNumber(safety.minimumEvidenceQuality)}.`,
      "HIGH",
      [
        "Add independently sourced, reliable evidence.",
      ],
      proposal?.evidence.map(
        (evidence) => evidence.evidenceId,
      ) ?? [],
    ),
  );

  const capitalAtRisk =
    proposalCapitalAtRisk(proposal);
  evaluations.push(
    safetyEvaluation(
      "safety-maximum-capital-at-risk",
      capitalAtRisk <= safety.maximumCapitalAtRisk,
      capitalAtRisk <= safety.maximumCapitalAtRisk
        ? "Capital at risk is within the safety maximum."
        : `Capital at risk ${capitalAtRisk} exceeds safety maximum ${safety.maximumCapitalAtRisk}.`,
      "CRITICAL",
      [
        `Reduce capital at risk to ${safety.maximumCapitalAtRisk} or below.`,
      ],
      [],
    ),
  );

  const leverage =
    request.context.portfolio?.leverage ?? 0;
  evaluations.push(
    safetyEvaluation(
      "safety-maximum-leverage",
      leverage <= safety.maximumLeverage,
      leverage <= safety.maximumLeverage
        ? "Portfolio leverage is within the safety maximum."
        : `Portfolio leverage ${leverage} exceeds safety maximum ${safety.maximumLeverage}.`,
      "CRITICAL",
      [
        `Reduce leverage to ${safety.maximumLeverage} or below.`,
      ],
      [],
    ),
  );

  const drawdown =
    request.context.portfolio?.drawdown ?? 0;
  evaluations.push(
    safetyEvaluation(
      "safety-maximum-drawdown",
      drawdown <= safety.maximumDrawdown,
      drawdown <= safety.maximumDrawdown
        ? "Portfolio drawdown is within the safety maximum."
        : `Portfolio drawdown ${drawdown} exceeds safety maximum ${safety.maximumDrawdown}.`,
      "CRITICAL",
      [
        "Pause risk-increasing execution until drawdown recovers.",
      ],
      [],
    ),
  );

  const riskScore = proposalRiskScore(proposal);
  const criticalRisk =
    riskScore > safety.maximumRiskScore ||
    proposal?.risks.some(
      (risk) => risk.severity === "CRITICAL",
    ) === true;
  evaluations.push(
    safetyEvaluation(
      "safety-maximum-risk-score",
      !criticalRisk,
      !criticalRisk
        ? "Proposal risk satisfies the safety policy."
        : `Proposal risk score ${formatNumber(riskScore)} exceeds the permitted risk envelope or contains a critical risk.`,
      "CRITICAL",
      [
        "Mitigate critical risks or reject the proposal.",
      ],
      proposal?.risks.flatMap(
        (risk) => risk.evidenceIds,
      ) ?? [],
    ),
  );

  const unresolvedMaterialDissent =
    consensus.dissent.some(
      (dissent) => dissent.material,
    );
  evaluations.push(
    safetyEvaluation(
      "safety-material-dissent",
      !(
        safety.rejectOnUnresolvedMaterialDissent &&
        unresolvedMaterialDissent
      ),
      unresolvedMaterialDissent
        ? "Material dissent remains unresolved."
        : "No unresolved material dissent is present.",
      "CRITICAL",
      [
        "Resolve or explicitly escalate material dissent.",
      ],
      consensus.dissent.flatMap(
        (dissent) =>
          dissent.unresolvedRisks.flatMap(
            (risk) => risk.evidenceIds,
          ),
      ),
    ),
  );

  const unresolvedConflict =
    consensus.resolvedConflicts.some(
      (conflict) =>
        conflict.resolution === "UNRESOLVED" ||
        conflict.resolution === "DEFER" ||
        conflict.resolution === "ESCALATE",
    );
  evaluations.push(
    safetyEvaluation(
      "safety-unresolved-conflict",
      !(
        safety.rejectOnUnresolvedConflict &&
        unresolvedConflict
      ),
      unresolvedConflict
        ? "One or more conflicts remain unresolved, deferred, or escalated."
        : "All material conflicts have executable resolutions.",
      "CRITICAL",
      [
        "Resolve all material conflicts before execution.",
      ],
      consensus.resolvedConflicts.flatMap(
        (conflict) =>
          conflict.evidence.map(
            (evidence) => evidence.evidenceId,
          ),
      ),
    ),
  );

  const staleContext =
    assessedAtMs -
      request.context.builtAtMs >
    options.staleContextThresholdMs;
  evaluations.push(
    safetyEvaluation(
      "safety-market-intelligence-freshness",
      !(
        safety.rejectOnStaleMarketIntelligence &&
        staleContext
      ),
      staleContext
        ? "The multi-agent system context is stale."
        : "The multi-agent system context is fresh.",
      "CRITICAL",
      [
        "Refresh market and portfolio intelligence.",
      ],
      [],
    ),
  );

  const health = request.context.systemHealth;
  const healthyCount = health.filter(
    (snapshot) => snapshot.healthy,
  ).length;
  const healthyRatio =
    health.length === 0
      ? 0
      : healthyCount / health.length;
  const criticalSystemHealth =
    health.length > 0 &&
    healthyRatio <
      options.minimumHealthySystemRatio;
  evaluations.push(
    safetyEvaluation(
      "safety-system-health",
      !criticalSystemHealth,
      criticalSystemHealth
        ? `Healthy system ratio ${formatNumber(healthyRatio)} is below required ${formatNumber(options.minimumHealthySystemRatio)}.`
        : "System health satisfies the governance threshold.",
      "CRITICAL",
      [
        "Restore required agent and subsystem health before execution.",
      ],
      [],
    ),
  );

  const deterministic =
    hasDeterministicFingerprints(
      request,
      proposal,
      consensus,
    );
  evaluations.push(
    safetyEvaluation(
      "safety-deterministic-fingerprint",
      !safety.requireDeterministicFingerprint ||
        deterministic,
      deterministic
        ? "Required deterministic fingerprints are present."
        : "One or more required deterministic fingerprints are missing.",
      "CRITICAL",
      [
        "Regenerate the decision using replay-safe deterministic components.",
      ],
      [],
    ),
  );

  return deepFreeze({
    evaluations: Object.freeze(evaluations),
    unresolvedMaterialDissent,
    unresolvedConflict,
    criticalRisk,
    staleContext,
    criticalSystemHealth,
  });
}

function determineDecision(
  input: DecisionInputs,
): MultiAgentGovernanceDecision {
  const hardFailures = input.evaluations.filter(
    (evaluation) =>
      !evaluation.passed &&
      evaluation.severity === "CRITICAL",
  );
  const softFailures = input.evaluations.filter(
    (evaluation) =>
      !evaluation.passed &&
      evaluation.severity !== "CRITICAL",
  );
  const consensusBlocked =
    input.consensus.status === "VETOED" ||
    input.consensus.status ===
      "QUORUM_NOT_MET";

  if (
    input.selectedProposal === undefined ||
    input.consensus.selectedProposalId ===
      undefined
  ) {
    return input.safety.failClosed
      ? "REJECTED"
      : "DEFERRED";
  }

  if (
    input.consensus.selectedProposalId !==
    input.selectedProposal.proposalId
  ) {
    return "REJECTED";
  }

  if (consensusBlocked) {
    return "REJECTED";
  }

  if (
    input.consensus.status === "ESCALATED" ||
    input.unresolvedConflict ||
    input.unresolvedMaterialDissent
  ) {
    return input.safety.allowOperatorOverride
      ? "ESCALATED"
      : input.safety.failClosed
        ? "REJECTED"
        : "DEFERRED";
  }

  if (
    hardFailures.length > 0 ||
    input.rejectionReasons.length > 0 ||
    input.criticalRisk ||
    input.staleContext ||
    input.criticalSystemHealth
  ) {
    return input.safety.allowOperatorOverride &&
      !input.safety.failClosed
      ? "ESCALATED"
      : "REJECTED";
  }

  if (
    softFailures.length > 0 ||
    input.restrictions.length > 0 ||
    input.consensus.status ===
      "CONSENSUS_WITH_DISSENT"
  ) {
    return "APPROVED_WITH_RESTRICTIONS";
  }

  if (
    input.consensus.status ===
    "CONSENSUS_REACHED"
  ) {
    return "APPROVED";
  }

  return input.safety.failClosed
    ? "REJECTED"
    : "DEFERRED";
}

function determineApprovalRequirement(
  decision: MultiAgentGovernanceDecision,
  proposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  evaluations: readonly MultiAgentGovernanceRuleEvaluation[],
  safety: MultiAgentSafetyPolicy,
  fallback: MultiAgentApprovalRequirement,
): MultiAgentApprovalRequirement {
  if (
    decision === "REJECTED" ||
    decision === "DEFERRED"
  ) {
    return "NONE";
  }

  if (decision === "ESCALATED") {
    return "HUMAN_APPROVAL";
  }

  const executable =
    proposal?.actions.some((action) =>
      EXECUTABLE_ACTIONS.has(action.type),
    ) ?? false;
  const criticalEvaluation =
    evaluations.some(
      (evaluation) =>
        !evaluation.passed &&
        evaluation.severity === "CRITICAL",
    );
  const highRisk =
    proposal?.risks.some(
      (risk) =>
        risk.severity === "HIGH" ||
        risk.severity === "CRITICAL",
    ) ?? false;
  const governanceConcern =
    consensus.resolvedConflicts.some(
      (conflict) =>
        conflict.type ===
          "GOVERNANCE_CONFLICT" ||
        conflict.type === "POLICY_CONFLICT" ||
        conflict.type ===
          "AUTHORITY_CONFLICT",
    );

  if (
    criticalEvaluation &&
    safety.allowOperatorOverride
  ) {
    return "HUMAN_APPROVAL";
  }

  if (governanceConcern) {
    return "GOVERNANCE_APPROVAL";
  }

  if (highRisk && executable) {
    return "DUAL_AGENT_APPROVAL";
  }

  if (highRisk) {
    return "RISK_APPROVAL";
  }

  if (executable) {
    return "AGENT_SUPERVISOR";
  }

  return fallback;
}

function deriveApprovingAgentIds(
  consensus: MultiAgentConsensusResult,
  requirement: MultiAgentApprovalRequirement,
): MultiAgentId[] {
  if (
    requirement === "NONE" ||
    requirement === "HUMAN_APPROVAL"
  ) {
    return [];
  }

  const selectedProposalId =
    consensus.selectedProposalId;

  if (selectedProposalId === undefined) {
    return [];
  }

  return uniqueSorted(
    consensus.votes
      .filter(
        (vote) =>
          vote.proposalId ===
            selectedProposalId &&
          (vote.choice === "APPROVE" ||
            vote.choice ===
              "APPROVE_WITH_RESTRICTIONS"),
      )
      .sort(
        (left, right) =>
          right.effectiveWeight -
            left.effectiveWeight ||
          left.agentId.localeCompare(
            right.agentId,
          ),
      )
      .slice(
        0,
        requirement === "DUAL_AGENT_APPROVAL"
          ? 2
          : 1,
      )
      .map((vote) => vote.agentId),
  );
}

function calculateGovernanceConfidence(
  proposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  evaluations: readonly MultiAgentGovernanceRuleEvaluation[],
  decision: MultiAgentGovernanceDecision,
  restrictionCount: number,
  options: NormalizedOptions,
): number {
  const base =
    proposal === undefined
      ? 0
      : clamp01(
          consensus.collectiveConfidence
            .finalConfidence *
            0.7 +
            proposal.confidence * 0.3,
        );
  const softFailures = evaluations.filter(
    (evaluation) =>
      !evaluation.passed &&
      evaluation.severity !== "CRITICAL",
  ).length;
  const hardFailures = evaluations.filter(
    (evaluation) =>
      !evaluation.passed &&
      evaluation.severity === "CRITICAL",
  ).length;
  const decisionPenalty =
    decision === "ESCALATED"
      ? options.escalationConfidencePenalty
      : decision === "REJECTED"
        ? options.hardFailureConfidencePenalty
        : 0;

  return clamp01(
    base -
      restrictionCount *
        options.restrictionConfidencePenalty -
      softFailures *
        options.softFailureConfidencePenalty -
      hardFailures *
        options.hardFailureConfidencePenalty -
      decisionPenalty,
  );
}

function proposalCapitalAtRisk(
  proposal: MultiAgentProposal | undefined,
): number {
  if (proposal === undefined) {
    return 0;
  }

  return proposal.actions.reduce(
    (sum, action) =>
      sum +
      Math.abs(
        action.notional ??
          action.quantity ??
          0,
      ),
    0,
  );
}

function proposalRiskScore(
  proposal: MultiAgentProposal | undefined,
): number {
  if (
    proposal === undefined ||
    proposal.risks.length === 0
  ) {
    return 0;
  }

  return clamp01(
    proposal.risks.reduce(
      (sum, risk) =>
        sum +
        severityScore(risk.severity) *
          risk.probability *
          risk.impact *
          risk.confidence,
      0,
    ) / proposal.risks.length,
  );
}

function proposalEvidenceQuality(
  proposal: MultiAgentProposal | undefined,
): number {
  if (
    proposal === undefined ||
    proposal.evidence.length === 0
  ) {
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

function hasDeterministicFingerprints(
  request: MultiAgentRunRequest,
  proposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
): boolean {
  return (
    request.context.deterministicFingerprint
      .trim().length > 0 &&
    consensus.deterministicFingerprint.trim()
      .length > 0 &&
    (proposal === undefined ||
      proposal.deterministicFingerprint.trim()
        .length > 0) &&
    consensus.votes.every(
      (vote) =>
        vote.deterministicFingerprint.trim()
          .length > 0,
    )
  );
}

function safetyEvaluation(
  ruleId: string,
  passed: boolean,
  message: string,
  failureSeverity: MultiAgentRiskSeverity,
  failureRestrictions: readonly string[],
  evidenceIds: readonly MultiAgentKnowledgeId[],
): MultiAgentGovernanceRuleEvaluation {
  return deepFreeze({
    ruleId,
    passed,
    severity: passed
      ? "INFORMATIONAL"
      : failureSeverity,
    message,
    restrictions: passed
      ? Object.freeze([])
      : Object.freeze(
          uniqueSorted(failureRestrictions),
        ),
    evidenceIds: Object.freeze(
      uniqueSorted(evidenceIds),
    ),
  });
}

function passedOutcome(
  message = "",
): RuleEvaluationOutcome {
  return {
    passed: true,
    severity: "INFORMATIONAL",
    message,
    restrictions: Object.freeze([]),
    evidenceIds: Object.freeze([]),
  };
}

function readRoleMappings(
  metadata: MultiAgentGovernanceRule["metadata"],
): ReadonlyMap<MultiAgentRole, readonly MultiAgentId[]> {
  const record = asRecord(metadata);
  const rawMappings = asRecord(
    record?.["roleAgentIds"],
  );
  const mappings = new Map<
    MultiAgentRole,
    readonly MultiAgentId[]
  >();

  if (rawMappings === undefined) {
    return mappings;
  }

  for (const [role, value] of Object.entries(
    rawMappings,
  )) {
    if (
      Array.isArray(value) &&
      value.every(
        (item) => typeof item === "string",
      )
    ) {
      mappings.set(
        role as MultiAgentRole,
        Object.freeze(
          uniqueSorted(value as string[]),
        ),
      );
    }
  }

  return mappings;
}

function readOptionalNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  ruleId: string,
): number | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new MultiAgentGovernanceEngineError(
      "INVALID_RULE_METADATA",
      `Rule "${ruleId}" metadata "${key}" must be a finite number.`,
      { ruleId },
    );
  }

  return value;
}

function readOptionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  ruleId: string,
): boolean | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new MultiAgentGovernanceEngineError(
      "INVALID_RULE_METADATA",
      `Rule "${ruleId}" metadata "${key}" must be boolean.`,
      { ruleId },
    );
  }

  return value;
}

function readOptionalStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  ruleId: string,
): readonly string[] | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => typeof item === "string",
    )
  ) {
    throw new MultiAgentGovernanceEngineError(
      "INVALID_RULE_METADATA",
      `Rule "${ruleId}" metadata "${key}" must be a string array.`,
      { ruleId },
    );
  }

  return Object.freeze(
    uniqueSorted(value as string[]),
  );
}

function asRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Readonly<
        Record<string, unknown>
      >)
    : undefined;
}

function compareRules(
  left: MultiAgentGovernanceRule,
  right: MultiAgentGovernanceRule,
): number {
  const priorityDifference =
    PRIORITY_WEIGHT[right.priority] -
    PRIORITY_WEIGHT[left.priority];

  return priorityDifference !== 0
    ? priorityDifference
    : left.ruleId.localeCompare(right.ruleId);
}

function priorityToSeverity(
  priority: MultiAgentPriority,
): MultiAgentRiskSeverity {
  switch (priority) {
    case "CRITICAL":
      return "CRITICAL";
    case "VERY_HIGH":
    case "HIGH":
      return "HIGH";
    case "MEDIUM":
      return "MODERATE";
    case "LOW":
      return "LOW";
    case "INFORMATIONAL":
      return "INFORMATIONAL";
  }
}

function maximumSeverity(
  severities: readonly MultiAgentRiskSeverity[],
): MultiAgentRiskSeverity {
  return (
    [...severities].sort(
      (left, right) =>
        SEVERITY_WEIGHT[right] -
        SEVERITY_WEIGHT[left],
    )[0] ?? "INFORMATIONAL"
  );
}

function severityScore(
  severity: MultiAgentRiskSeverity,
): number {
  return SEVERITY_WEIGHT[severity] / 4;
}

function normalizeOptions(
  options: MultiAgentGovernanceEngineOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    defaultApprovalRequirement:
      options.defaultApprovalRequirement ??
      "NONE",
    restrictionConfidencePenalty:
      options.restrictionConfidencePenalty ??
      0.01,
    softFailureConfidencePenalty:
      options.softFailureConfidencePenalty ??
      0.05,
    hardFailureConfidencePenalty:
      options.hardFailureConfidencePenalty ??
      0.2,
    escalationConfidencePenalty:
      options.escalationConfidencePenalty ??
      0.15,
    staleContextThresholdMs:
      options.staleContextThresholdMs ??
      60_000,
    minimumHealthySystemRatio:
      options.minimumHealthySystemRatio ??
      (0.8 as MultiAgentScore),
  };

  for (const [name, value] of Object.entries({
    restrictionConfidencePenalty:
      normalized.restrictionConfidencePenalty,
    softFailureConfidencePenalty:
      normalized.softFailureConfidencePenalty,
    hardFailureConfidencePenalty:
      normalized.hardFailureConfidencePenalty,
    escalationConfidencePenalty:
      normalized.escalationConfidencePenalty,
    minimumHealthySystemRatio:
      normalized.minimumHealthySystemRatio,
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

  if (
    !Number.isFinite(
      normalized.staleContextThresholdMs,
    ) ||
    normalized.staleContextThresholdMs < 0
  ) {
    throw new RangeError(
      "staleContextThresholdMs must be a non-negative finite number.",
    );
  }

  return Object.freeze(normalized);
}

function validateInputs(
  request: MultiAgentRunRequest,
  selectedProposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  rules: readonly MultiAgentGovernanceRule[],
  safety: MultiAgentSafetyPolicy,
): void {
  if (
    request === null ||
    typeof request !== "object" ||
    consensus === null ||
    typeof consensus !== "object" ||
    !Array.isArray(rules)
  ) {
    throw new MultiAgentGovernanceEngineError(
      "INVALID_GOVERNANCE_INPUT",
      "Governance request, consensus, and rules are required.",
    );
  }

  const ruleIds = new Set<string>();

  for (const rule of rules) {
    if (ruleIds.has(rule.ruleId)) {
      throw new MultiAgentGovernanceEngineError(
        "DUPLICATE_GOVERNANCE_RULE",
        `Duplicate governance rule "${rule.ruleId}".`,
        { ruleId: rule.ruleId },
      );
    }

    ruleIds.add(rule.ruleId);
  }

  if (
    selectedProposal !== undefined &&
    consensus.selectedProposalId !== undefined &&
    selectedProposal.proposalId !==
      consensus.selectedProposalId
  ) {
    throw new MultiAgentGovernanceEngineError(
      "INVALID_GOVERNANCE_INPUT",
      "selectedProposal does not match the consensus selected proposal.",
      {
        proposalId:
          selectedProposal.proposalId,
      },
    );
  }

  validateSafetyPolicy(safety);
}

function validateSafetyPolicy(
  safety: MultiAgentSafetyPolicy,
): void {
  for (const [name, value] of Object.entries({
    minimumCollectiveConfidence:
      safety.minimumCollectiveConfidence,
    minimumAgentReliability:
      safety.minimumAgentReliability,
    minimumEvidenceQuality:
      safety.minimumEvidenceQuality,
    maximumRiskScore:
      safety.maximumRiskScore,
  })) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new MultiAgentGovernanceEngineError(
        "INVALID_SAFETY_POLICY",
        `${name} must be between 0 and 1.`,
      );
    }
  }

  for (const [name, value] of Object.entries({
    maximumCapitalAtRisk:
      safety.maximumCapitalAtRisk,
    maximumLeverage: safety.maximumLeverage,
    maximumDrawdown: safety.maximumDrawdown,
  })) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new MultiAgentGovernanceEngineError(
        "INVALID_SAFETY_POLICY",
        `${name} must be a non-negative finite number.`,
      );
    }
  }
}

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): TValue[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(4);
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function fingerprint(value: unknown): string {
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