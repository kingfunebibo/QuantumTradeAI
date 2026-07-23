/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/ai-multi-agent-validator.ts
 *
 * Deterministic, side-effect-free validation for multi-agent requests,
 * configuration, registrations, proposals, and collective decisions.
 */

import {
  AI_MULTI_AGENT_SCHEMA_VERSION,
  MULTI_AGENT_ROLES,
  isMultiAgentNormalizedNumber,
  isExecutableMultiAgentDecision,
  type MultiAgentAgentSelectionPolicy,
  type MultiAgentCapability,
  type MultiAgentCollectiveDecision,
  type MultiAgentConfiguration,
  type MultiAgentConsensusPolicy,
  type MultiAgentConstraint,
  type MultiAgentDebatePolicy,
  type MultiAgentExecutionPolicy,
  type MultiAgentExplainabilityPolicy,
  type MultiAgentGovernanceRule,
  type MultiAgentProposal,
  type MultiAgentProposalAction,
  type MultiAgentQuorumPolicy,
  type MultiAgentRegistration,
  type MultiAgentRole,
  type MultiAgentRunRequest,
  type MultiAgentSafetyPolicy,
  type MultiAgentTrustPolicy,
  type MultiAgentValidationIssue,
  type MultiAgentValidationResult,
  type MultiAgentValidatorPort,
} from "./ai-multi-agent-contracts";

type UnknownRecord = Readonly<Record<string, unknown>>;

const KNOWN_ROLES = new Set<string>(MULTI_AGENT_ROLES);

const KNOWN_CAPABILITIES = new Set<string>([
  "OBSERVE_MARKET_INTELLIGENCE",
  "ASSESS_MARKET_REGIME",
  "ASSESS_VOLATILITY",
  "ASSESS_LIQUIDITY",
  "ASSESS_ORDER_FLOW",
  "ASSESS_CORRELATION",
  "DETECT_ANOMALIES",
  "PREDICT_PRICE_MOVEMENT",
  "ASSESS_PORTFOLIO",
  "ASSESS_RISK",
  "ASSESS_STRATEGY",
  "SELECT_STRATEGIES",
  "ALLOCATE_STRATEGY_CAPITAL",
  "ASSESS_ARBITRAGE",
  "PROPOSE_DECISION",
  "REVIEW_PROPOSAL",
  "CHALLENGE_PROPOSAL",
  "VOTE",
  "NEGOTIATE",
  "ARBITRATE_CONFLICT",
  "FORM_CONSENSUS",
  "EVALUATE_GOVERNANCE",
  "APPROVE_EXECUTION",
  "PLAN_EXECUTION",
  "EXPLAIN_DECISION",
  "LEARN_FROM_OUTCOME",
  "UPDATE_TRUST",
  "ESCALATE_TO_OPERATOR",
  "PUBLISH_EVENTS",
]);

const KNOWN_ACTION_TYPES = new Set<string>([
  "NO_ACTION",
  "MONITOR",
  "RESEARCH",
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
  "PUBLISH_SIGNAL",
  "PAUSE_TRADING",
  "RESUME_TRADING",
  "ESCALATE_TO_OPERATOR",
  "CUSTOM",
]);

const KNOWN_OBJECTIVES = new Set<string>([
  "MARKET_ASSESSMENT",
  "TRADE_DECISION",
  "STRATEGY_ORCHESTRATION",
  "PORTFOLIO_REBALANCE",
  "RISK_RESPONSE",
  "ARBITRAGE_DECISION",
  "EXECUTION_REVIEW",
  "FULL_COLLABORATIVE_DECISION",
]);

const KNOWN_AUTONOMY_LEVELS = new Set<string>([
  "OBSERVE_ONLY",
  "RECOMMEND_ONLY",
  "PROPOSE_AND_REVIEW",
  "SEMI_AUTONOMOUS",
  "FULLY_AUTONOMOUS",
]);

const KNOWN_MODEL_TYPES = new Set<string>([
  "DETERMINISTIC_RULES",
  "STATISTICAL",
  "MACHINE_LEARNING",
  "LARGE_LANGUAGE_MODEL",
  "ENSEMBLE",
  "HYBRID",
  "EXTERNAL_SERVICE",
  "HUMAN_PROXY",
]);

const KNOWN_REASONING_MODES = new Set<string>([
  "DETERMINISTIC",
  "EVIDENCE_WEIGHTED",
  "PROBABILISTIC",
  "ENSEMBLE",
  "DEBATE",
  "CONSTRAINT_SOLVING",
  "HYBRID",
]);

const KNOWN_AUTHORITY_LEVELS = new Set<string>([
  "ADVISORY",
  "CONTRIBUTOR",
  "REVIEWER",
  "ARBITER",
  "APPROVER",
  "SUPERVISOR",
]);

const KNOWN_CRITICALITIES = new Set<string>([
  "OPTIONAL",
  "STANDARD",
  "IMPORTANT",
  "CRITICAL",
  "MANDATORY",
]);

const KNOWN_CONSENSUS_METHODS = new Set<string>([
  "SIMPLE_MAJORITY",
  "SUPERMAJORITY",
  "UNANIMOUS",
  "WEIGHTED",
  "TRUST_WEIGHTED",
  "CONFIDENCE_WEIGHTED",
  "RISK_ADJUSTED",
  "UTILITY_MAXIMIZING",
  "PARETO",
  "ARBITER_SELECTED",
]);

const KNOWN_EXPLANATION_AUDIENCES = new Set<string>([
  "SYSTEM",
  "OPERATOR",
  "TRADER",
  "RISK_MANAGER",
  "COMPLIANCE",
  "AUDITOR",
  "DEVELOPER",
]);

const KNOWN_GOVERNANCE_PRIORITIES = new Set<string>([
  "CRITICAL",
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFORMATIONAL",
]);

const KNOWN_CONSTRAINT_TYPES = new Set<string>([
  "CAPITAL",
  "EXPOSURE",
  "LEVERAGE",
  "DRAWDOWN",
  "LIQUIDITY",
  "VOLATILITY",
  "CORRELATION",
  "RISK",
  "STRATEGY",
  "ARBITRAGE",
  "GOVERNANCE",
  "COMPLIANCE",
  "TIME",
  "SYSTEM_HEALTH",
  "CUSTOM",
]);

const KNOWN_PROPOSAL_STATUSES = new Set<string>([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHALLENGED",
  "REVISED",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "SUPERSEDED",
]);

class IssueCollector {
  private readonly issuesInternal: MultiAgentValidationIssue[] = [];

  public error(
    code: string,
    path: string,
    message: string,
    expected?: string,
  ): void {
    this.issuesInternal.push(
      Object.freeze({
        code,
        path,
        severity: "ERROR",
        message,
        ...(expected === undefined ? {} : { expected }),
      }),
    );
  }

  public warning(
    code: string,
    path: string,
    message: string,
    expected?: string,
  ): void {
    this.issuesInternal.push(
      Object.freeze({
        code,
        path,
        severity: "WARNING",
        message,
        ...(expected === undefined ? {} : { expected }),
      }),
    );
  }

  public get issues(): readonly MultiAgentValidationIssue[] {
    return Object.freeze([...this.issuesInternal]);
  }

  public result<TValue>(value: TValue): MultiAgentValidationResult<TValue> {
    const issues = this.issues;
    const errorCount = issues.filter(
      (issue) => issue.severity === "ERROR" || issue.severity === "FATAL",
    ).length;
    const warningCount = issues.filter(
      (issue) => issue.severity === "WARNING",
    ).length;

    return Object.freeze({
      valid: errorCount === 0,
      ...(errorCount === 0 ? { value } : {}),
      issues,
      errorCount,
      warningCount,
    });
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validateText(
  value: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasText(value)) {
    collector.error(
      "MULTI_AGENT_REQUIRED_TEXT",
      path,
      `${path} must be a non-empty string.`,
      "non-empty string",
    );
  }
}

function validateFinite(
  value: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isFiniteNumber(value)) {
    collector.error(
      "MULTI_AGENT_FINITE_NUMBER_REQUIRED",
      path,
      `${path} must be a finite number.`,
      "finite number",
    );
  }
}

function validateNonNegative(
  value: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isFiniteNumber(value) || value < 0) {
    collector.error(
      "MULTI_AGENT_NON_NEGATIVE_REQUIRED",
      path,
      `${path} must be a finite number greater than or equal to zero.`,
      "number >= 0",
    );
  }
}

function validatePositive(
  value: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isFiniteNumber(value) || value <= 0) {
    collector.error(
      "MULTI_AGENT_POSITIVE_REQUIRED",
      path,
      `${path} must be a finite number greater than zero.`,
      "number > 0",
    );
  }
}

function validateNormalized(
  value: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isFiniteNumber(value) || !isMultiAgentNormalizedNumber(value)) {
    collector.error(
      "MULTI_AGENT_NORMALIZED_RANGE",
      path,
      `${path} must be between 0 and 1 inclusive.`,
      "0 <= value <= 1",
    );
  }
}

function validateBoolean(
  value: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (typeof value !== "boolean") {
    collector.error(
      "MULTI_AGENT_BOOLEAN_REQUIRED",
      path,
      `${path} must be boolean.`,
      "boolean",
    );
  }
}

function validateArray(
  value: unknown,
  path: string,
  collector: IssueCollector,
): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    collector.error(
      "MULTI_AGENT_ARRAY_REQUIRED",
      path,
      `${path} must be an array.`,
      "array",
    );
    return false;
  }

  return true;
}

function validateUniqueStrings(
  values: readonly unknown[],
  path: string,
  collector: IssueCollector,
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (!hasText(value)) {
      collector.error(
        "MULTI_AGENT_NON_EMPTY_STRING_ARRAY",
        `${path}[${index}]`,
        `${path}[${index}] must be a non-empty string.`,
        "non-empty string",
      );
      return;
    }

    if (seen.has(value)) {
      collector.error(
        "MULTI_AGENT_DUPLICATE_VALUE",
        `${path}[${index}]`,
        `${path} contains duplicate value "${value}".`,
        "unique values",
      );
      return;
    }

    seen.add(value);
  });
}

function validateRoles(
  roles: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!validateArray(roles, path, collector)) {
    return;
  }

  validateUniqueStrings(roles, path, collector);

  roles.forEach((role, index) => {
    if (typeof role === "string" && !KNOWN_ROLES.has(role)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_ROLE",
        `${path}[${index}]`,
        `Unknown multi-agent role "${role}".`,
        "known MultiAgentRole",
      );
    }
  });
}

function validateCapabilities(
  capabilities: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!validateArray(capabilities, path, collector)) {
    return;
  }

  validateUniqueStrings(capabilities, path, collector);

  capabilities.forEach((capability, index) => {
    if (
      typeof capability === "string" &&
      !KNOWN_CAPABILITIES.has(capability)
    ) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_CAPABILITY",
        `${path}[${index}]`,
        `Unknown multi-agent capability "${capability}".`,
        "known MultiAgentCapability",
      );
    }
  });
}

function validateWeightedTotal(
  values: readonly number[],
  path: string,
  collector: IssueCollector,
): void {
  if (values.some((value) => !isMultiAgentNormalizedNumber(value))) {
    return;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) {
    collector.error(
      "MULTI_AGENT_WEIGHTS_MUST_SUM_TO_ONE",
      path,
      `${path} weights must sum to 1. Current total is ${total}.`,
      "sum = 1",
    );
  }
}

function validateConstraint(
  constraint: MultiAgentConstraint,
  path: string,
  collector: IssueCollector,
): void {
  validateText(constraint.constraintId, `${path}.constraintId`, collector);
  validateText(constraint.name, `${path}.name`, collector);
  validateText(constraint.description, `${path}.description`, collector);

  if (!KNOWN_CONSTRAINT_TYPES.has(constraint.type)) {
    collector.error(
      "MULTI_AGENT_UNKNOWN_CONSTRAINT_TYPE",
      `${path}.type`,
      `Unknown constraint type "${constraint.type}".`,
    );
  }

  validateBoolean(constraint.hard, `${path}.hard`, collector);
  validateBoolean(constraint.satisfied, `${path}.satisfied`, collector);

  if (constraint.minimum !== undefined) {
    validateFinite(constraint.minimum, `${path}.minimum`, collector);
  }
  if (constraint.maximum !== undefined) {
    validateFinite(constraint.maximum, `${path}.maximum`, collector);
  }
  if (constraint.actual !== undefined) {
    validateFinite(constraint.actual, `${path}.actual`, collector);
  }

  if (
    constraint.minimum !== undefined &&
    constraint.maximum !== undefined &&
    constraint.minimum > constraint.maximum
  ) {
    collector.error(
      "MULTI_AGENT_CONSTRAINT_RANGE_INVALID",
      path,
      `${path}.minimum cannot exceed ${path}.maximum.`,
    );
  }

  if (!constraint.satisfied && !hasText(constraint.failureReason)) {
    collector.warning(
      "MULTI_AGENT_CONSTRAINT_FAILURE_REASON_MISSING",
      `${path}.failureReason`,
      "An unsatisfied constraint should include a failure reason.",
    );
  }
}

function validateProposalAction(
  action: MultiAgentProposalAction,
  path: string,
  collector: IssueCollector,
): void {
  validateText(action.actionId, `${path}.actionId`, collector);

  if (!KNOWN_ACTION_TYPES.has(action.type)) {
    collector.error(
      "MULTI_AGENT_UNKNOWN_ACTION_TYPE",
      `${path}.type`,
      `Unknown proposal action type "${action.type}".`,
    );
  }

  if (action.quantity !== undefined) {
    validatePositive(action.quantity, `${path}.quantity`, collector);
  }
  if (action.notional !== undefined) {
    validatePositive(action.notional, `${path}.notional`, collector);
  }
  if (action.targetWeight !== undefined) {
    validateNormalized(action.targetWeight, `${path}.targetWeight`, collector);
  }

  const marketAction =
    action.type === "OPEN_POSITION" ||
    action.type === "INCREASE_POSITION" ||
    action.type === "REDUCE_POSITION" ||
    action.type === "CLOSE_POSITION" ||
    action.type === "PUBLISH_SIGNAL" ||
    action.type === "HEDGE_POSITION";

  if (marketAction && action.market === undefined) {
    collector.warning(
      "MULTI_AGENT_MARKET_ACTION_WITHOUT_MARKET",
      `${path}.market`,
      `${action.type} should identify a target market.`,
    );
  }

  if (
    action.type === "EXECUTE_ARBITRAGE" &&
    !hasText(action.arbitrageDecisionId)
  ) {
    collector.error(
      "MULTI_AGENT_ARBITRAGE_DECISION_REQUIRED",
      `${path}.arbitrageDecisionId`,
      "EXECUTE_ARBITRAGE requires an arbitrageDecisionId.",
    );
  }
}

function validateQuorumPolicy(
  policy: MultiAgentQuorumPolicy,
  path: string,
  collector: IssueCollector,
): void {
  if (!isPositiveInteger(policy.minimumEligibleAgents)) {
    collector.error(
      "MULTI_AGENT_MINIMUM_ELIGIBLE_AGENTS_INVALID",
      `${path}.minimumEligibleAgents`,
      "minimumEligibleAgents must be a positive integer.",
    );
  }

  if (!isPositiveInteger(policy.minimumParticipatingAgents)) {
    collector.error(
      "MULTI_AGENT_MINIMUM_PARTICIPATING_AGENTS_INVALID",
      `${path}.minimumParticipatingAgents`,
      "minimumParticipatingAgents must be a positive integer.",
    );
  }

  if (
    isPositiveInteger(policy.minimumEligibleAgents) &&
    isPositiveInteger(policy.minimumParticipatingAgents) &&
    policy.minimumParticipatingAgents > policy.minimumEligibleAgents
  ) {
    collector.error(
      "MULTI_AGENT_PARTICIPATION_EXCEEDS_ELIGIBILITY",
      `${path}.minimumParticipatingAgents`,
      "minimumParticipatingAgents cannot exceed minimumEligibleAgents.",
    );
  }

  validateNormalized(
    policy.minimumParticipationRatio,
    `${path}.minimumParticipationRatio`,
    collector,
  );
  validateRoles(policy.requiredRoles, `${path}.requiredRoles`, collector);
  validateCapabilities(
    policy.requiredCapabilities,
    `${path}.requiredCapabilities`,
    collector,
  );

  validateBoolean(
    policy.requireRiskAgent,
    `${path}.requireRiskAgent`,
    collector,
  );
  validateBoolean(
    policy.requireGovernanceAgent,
    `${path}.requireGovernanceAgent`,
    collector,
  );
  validateBoolean(
    policy.requireSupervisor,
    `${path}.requireSupervisor`,
    collector,
  );
  validateBoolean(
    policy.allowDegradedAgents,
    `${path}.allowDegradedAgents`,
    collector,
  );

  if (
    policy.requireRiskAgent &&
    !policy.requiredRoles.includes("RISK_AGENT")
  ) {
    collector.error(
      "MULTI_AGENT_RISK_ROLE_REQUIRED",
      `${path}.requiredRoles`,
      "RISK_AGENT must be present when requireRiskAgent is true.",
    );
  }

  if (
    policy.requireGovernanceAgent &&
    !policy.requiredRoles.includes("GOVERNANCE_AGENT")
  ) {
    collector.error(
      "MULTI_AGENT_GOVERNANCE_ROLE_REQUIRED",
      `${path}.requiredRoles`,
      "GOVERNANCE_AGENT must be present when requireGovernanceAgent is true.",
    );
  }

  if (
    policy.requireSupervisor &&
    !policy.requiredRoles.includes("SUPERVISOR_AGENT")
  ) {
    collector.error(
      "MULTI_AGENT_SUPERVISOR_ROLE_REQUIRED",
      `${path}.requiredRoles`,
      "SUPERVISOR_AGENT must be present when requireSupervisor is true.",
    );
  }
}

function validateConsensusPolicy(
  policy: MultiAgentConsensusPolicy,
  path: string,
  collector: IssueCollector,
): void {
  if (!KNOWN_CONSENSUS_METHODS.has(policy.method)) {
    collector.error(
      "MULTI_AGENT_UNKNOWN_CONSENSUS_METHOD",
      `${path}.method`,
      `Unknown consensus method "${policy.method}".`,
    );
  }

  validateNormalized(
    policy.approvalThreshold,
    `${path}.approvalThreshold`,
    collector,
  );
  validateNormalized(
    policy.rejectionThreshold,
    `${path}.rejectionThreshold`,
    collector,
  );
  validateNormalized(
    policy.maximumAbstentionRatio,
    `${path}.maximumAbstentionRatio`,
    collector,
  );
  validateBoolean(policy.vetoEnabled, `${path}.vetoEnabled`, collector);

  if (!isNonNegativeInteger(policy.maximumDebateRounds)) {
    collector.error(
      "MULTI_AGENT_MAXIMUM_DEBATE_ROUNDS_INVALID",
      `${path}.maximumDebateRounds`,
      "maximumDebateRounds must be a non-negative integer.",
    );
  }

  if (policy.approvalThreshold <= 0.5 && policy.method === "SUPERMAJORITY") {
    collector.error(
      "MULTI_AGENT_SUPERMAJORITY_THRESHOLD_INVALID",
      `${path}.approvalThreshold`,
      "SUPERMAJORITY requires approvalThreshold greater than 0.5.",
    );
  }

  validateQuorumPolicy(policy.quorum, `${path}.quorum`, collector);
}

function validateSelectionPolicy(
  policy: MultiAgentAgentSelectionPolicy,
  path: string,
  collector: IssueCollector,
): void {
  validateRoles(policy.enabledRoles, `${path}.enabledRoles`, collector);
  validateRoles(policy.requiredRoles, `${path}.requiredRoles`, collector);

  if (!isPositiveInteger(policy.minimumAgents)) {
    collector.error(
      "MULTI_AGENT_MINIMUM_AGENTS_INVALID",
      `${path}.minimumAgents`,
      "minimumAgents must be a positive integer.",
    );
  }

  if (!isPositiveInteger(policy.maximumAgents)) {
    collector.error(
      "MULTI_AGENT_MAXIMUM_AGENTS_INVALID",
      `${path}.maximumAgents`,
      "maximumAgents must be a positive integer.",
    );
  }

  if (
    isPositiveInteger(policy.minimumAgents) &&
    isPositiveInteger(policy.maximumAgents) &&
    policy.minimumAgents > policy.maximumAgents
  ) {
    collector.error(
      "MULTI_AGENT_AGENT_RANGE_INVALID",
      path,
      "minimumAgents cannot exceed maximumAgents.",
    );
  }

  if (policy.requiredRoles.length > policy.maximumAgents) {
    collector.error(
      "MULTI_AGENT_REQUIRED_ROLES_EXCEED_MAXIMUM",
      `${path}.requiredRoles`,
      "The number of required roles cannot exceed maximumAgents.",
    );
  }

  for (const role of policy.requiredRoles) {
    if (!policy.enabledRoles.includes(role)) {
      collector.error(
        "MULTI_AGENT_REQUIRED_ROLE_DISABLED",
        `${path}.requiredRoles`,
        `Required role "${role}" is not enabled.`,
      );
    }
  }

  validateNormalized(
    policy.minimumReadinessScore,
    `${path}.minimumReadinessScore`,
    collector,
  );
  validateNormalized(
    policy.minimumReliabilityScore,
    `${path}.minimumReliabilityScore`,
    collector,
  );
  validateNormalized(
    policy.diversityWeight,
    `${path}.diversityWeight`,
    collector,
  );
  validateNormalized(
    policy.reliabilityWeight,
    `${path}.reliabilityWeight`,
    collector,
  );
  validateNormalized(
    policy.proficiencyWeight,
    `${path}.proficiencyWeight`,
    collector,
  );
  validateNormalized(policy.latencyWeight, `${path}.latencyWeight`, collector);

  validateWeightedTotal(
    [
      policy.diversityWeight,
      policy.reliabilityWeight,
      policy.proficiencyWeight,
      policy.latencyWeight,
    ],
    path,
    collector,
  );
}

function validateDebatePolicy(
  policy: MultiAgentDebatePolicy,
  path: string,
  collector: IssueCollector,
): void {
  validateBoolean(policy.enabled, `${path}.enabled`, collector);
  validateBoolean(
    policy.triggerOnMaterialConflict,
    `${path}.triggerOnMaterialConflict`,
    collector,
  );
  validateBoolean(
    policy.triggerOnLowAgreement,
    `${path}.triggerOnLowAgreement`,
    collector,
  );
  validateNormalized(
    policy.agreementThreshold,
    `${path}.agreementThreshold`,
    collector,
  );
  validateNormalized(
    policy.convergenceThreshold,
    `${path}.convergenceThreshold`,
    collector,
  );

  if (!isNonNegativeInteger(policy.maximumRounds)) {
    collector.error(
      "MULTI_AGENT_MAXIMUM_ROUNDS_INVALID",
      `${path}.maximumRounds`,
      "maximumRounds must be a non-negative integer.",
    );
  }

  if (!isPositiveInteger(policy.maximumStatementsPerAgentPerRound)) {
    collector.error(
      "MULTI_AGENT_MAXIMUM_STATEMENTS_INVALID",
      `${path}.maximumStatementsPerAgentPerRound`,
      "maximumStatementsPerAgentPerRound must be a positive integer.",
    );
  }

  if (policy.enabled && policy.maximumRounds === 0) {
    collector.error(
      "MULTI_AGENT_ENABLED_DEBATE_WITH_ZERO_ROUNDS",
      `${path}.maximumRounds`,
      "Enabled debate requires at least one round.",
    );
  }

  if (
    policy.stopOnConvergence &&
    policy.convergenceThreshold < policy.agreementThreshold
  ) {
    collector.warning(
      "MULTI_AGENT_CONVERGENCE_BELOW_AGREEMENT",
      `${path}.convergenceThreshold`,
      "convergenceThreshold is lower than agreementThreshold.",
    );
  }
}

function validateTrustPolicy(
  policy: MultiAgentTrustPolicy,
  path: string,
  collector: IssueCollector,
): void {
  validateBoolean(policy.enabled, `${path}.enabled`, collector);
  validateNormalized(policy.initialTrust, `${path}.initialTrust`, collector);
  validateNormalized(
    policy.minimumVotingTrust,
    `${path}.minimumVotingTrust`,
    collector,
  );
  validateNormalized(
    policy.accuracyWeight,
    `${path}.accuracyWeight`,
    collector,
  );
  validateNormalized(
    policy.calibrationWeight,
    `${path}.calibrationWeight`,
    collector,
  );
  validateNormalized(
    policy.reliabilityWeight,
    `${path}.reliabilityWeight`,
    collector,
  );
  validateNormalized(
    policy.evidenceQualityWeight,
    `${path}.evidenceQualityWeight`,
    collector,
  );
  validateNormalized(
    policy.governanceComplianceWeight,
    `${path}.governanceComplianceWeight`,
    collector,
  );
  validateNormalized(
    policy.collaborationWeight,
    `${path}.collaborationWeight`,
    collector,
  );
  validateNormalized(
    policy.outcomeContributionWeight,
    `${path}.outcomeContributionWeight`,
    collector,
  );
  validateNormalized(
    policy.quarantineThreshold,
    `${path}.quarantineThreshold`,
    collector,
  );

  validatePositive(policy.learningRate, `${path}.learningRate`, collector);
  validateNonNegative(policy.decayRate, `${path}.decayRate`, collector);

  validateWeightedTotal(
    [
      policy.accuracyWeight,
      policy.calibrationWeight,
      policy.reliabilityWeight,
      policy.evidenceQualityWeight,
      policy.governanceComplianceWeight,
      policy.collaborationWeight,
      policy.outcomeContributionWeight,
    ],
    path,
    collector,
  );

  if (policy.quarantineThreshold >= policy.minimumVotingTrust) {
    collector.warning(
      "MULTI_AGENT_QUARANTINE_NOT_BELOW_VOTING_TRUST",
      `${path}.quarantineThreshold`,
      "quarantineThreshold should normally be lower than minimumVotingTrust.",
    );
  }
}

function validateSafetyPolicy(
  policy: MultiAgentSafetyPolicy,
  path: string,
  collector: IssueCollector,
): void {
  validateBoolean(policy.failClosed, `${path}.failClosed`, collector);
  validateNormalized(
    policy.minimumCollectiveConfidence,
    `${path}.minimumCollectiveConfidence`,
    collector,
  );
  validateNormalized(
    policy.minimumAgentReliability,
    `${path}.minimumAgentReliability`,
    collector,
  );
  validateNormalized(
    policy.minimumEvidenceQuality,
    `${path}.minimumEvidenceQuality`,
    collector,
  );
  validateNormalized(
    policy.maximumRiskScore,
    `${path}.maximumRiskScore`,
    collector,
  );
  validateNonNegative(
    policy.maximumCapitalAtRisk,
    `${path}.maximumCapitalAtRisk`,
    collector,
  );
  validateNonNegative(
    policy.maximumLeverage,
    `${path}.maximumLeverage`,
    collector,
  );
  validateNormalized(
    policy.maximumDrawdown,
    `${path}.maximumDrawdown`,
    collector,
  );
}

function validateExecutionPolicy(
  policy: MultiAgentExecutionPolicy,
  path: string,
  collector: IssueCollector,
): void {
  validateBoolean(policy.enabled, `${path}.enabled`, collector);

  if (!isPositiveInteger(policy.maximumActionsPerDecision)) {
    collector.error(
      "MULTI_AGENT_MAXIMUM_ACTIONS_INVALID",
      `${path}.maximumActionsPerDecision`,
      "maximumActionsPerDecision must be a positive integer.",
    );
  }

  if (
    policy.allowFullyAutomatedExecution &&
    !policy.allowSemiAutomatedExecution
  ) {
    collector.warning(
      "MULTI_AGENT_FULL_AUTOMATION_WITHOUT_SEMI_AUTOMATION",
      `${path}.allowFullyAutomatedExecution`,
      "Fully automated execution is enabled while semi-automated execution is disabled.",
    );
  }

  if (
    !policy.allowSignalOnly &&
    !policy.allowPaperExecution &&
    !policy.allowSemiAutomatedExecution &&
    !policy.allowFullyAutomatedExecution
  ) {
    collector.error(
      "MULTI_AGENT_NO_EXECUTION_MODE_ENABLED",
      path,
      "At least one execution mode must be enabled.",
    );
  }
}

function validateExplainabilityPolicy(
  policy: MultiAgentExplainabilityPolicy,
  path: string,
  collector: IssueCollector,
): void {
  validateBoolean(policy.enabled, `${path}.enabled`, collector);

  if (!KNOWN_EXPLANATION_AUDIENCES.has(policy.audience)) {
    collector.error(
      "MULTI_AGENT_UNKNOWN_EXPLANATION_AUDIENCE",
      `${path}.audience`,
      `Unknown explanation audience "${policy.audience}".`,
    );
  }

  const limits = [
    ["maximumPrimaryFactors", policy.maximumPrimaryFactors],
    ["maximumOpposingFactors", policy.maximumOpposingFactors],
    ["maximumUncertaintyFactors", policy.maximumUncertaintyFactors],
  ] as const;

  for (const [name, value] of limits) {
    if (!isNonNegativeInteger(value)) {
      collector.error(
        "MULTI_AGENT_EXPLANATION_LIMIT_INVALID",
        `${path}.${name}`,
        `${name} must be a non-negative integer.`,
      );
    }
  }
}

function validateGovernanceRule(
  rule: MultiAgentGovernanceRule,
  path: string,
  collector: IssueCollector,
): void {
  validateText(rule.ruleId, `${path}.ruleId`, collector);
  validateText(rule.name, `${path}.name`, collector);
  validateText(rule.description, `${path}.description`, collector);
  validateBoolean(rule.enabled, `${path}.enabled`, collector);
  validateBoolean(rule.hard, `${path}.hard`, collector);

  if (!KNOWN_GOVERNANCE_PRIORITIES.has(rule.priority)) {
    collector.error(
      "MULTI_AGENT_UNKNOWN_GOVERNANCE_PRIORITY",
      `${path}.priority`,
      `Unknown governance priority "${rule.priority}".`,
    );
  }

  if (validateArray(rule.applicableActions, `${path}.applicableActions`, collector)) {
    validateUniqueStrings(
      rule.applicableActions,
      `${path}.applicableActions`,
      collector,
    );
    rule.applicableActions.forEach((action, index) => {
      if (!KNOWN_ACTION_TYPES.has(action)) {
        collector.error(
          "MULTI_AGENT_UNKNOWN_GOVERNANCE_ACTION",
          `${path}.applicableActions[${index}]`,
          `Unknown action type "${action}".`,
        );
      }
    });
  }

  validateRoles(rule.requiredRoles, `${path}.requiredRoles`, collector);
}

function validateRequestContext(
  request: MultiAgentRunRequest,
  collector: IssueCollector,
): void {
  const context = request.context;

  validateText(
    context.deterministicFingerprint,
    "request.context.deterministicFingerprint",
    collector,
  );
  validateNonNegative(context.builtAtMs, "request.context.builtAtMs", collector);
  validateNonNegative(
    context.market.generatedAtMs,
    "request.context.market.generatedAtMs",
    collector,
  );

  if (context.builtAtMs > request.requestedAtMs) {
    collector.error(
      "MULTI_AGENT_CONTEXT_BUILT_AFTER_REQUEST",
      "request.context.builtAtMs",
      "Context cannot be built after requestedAtMs.",
    );
  }

  const age = request.requestedAtMs - context.builtAtMs;
  if (
    isFiniteNumber(age) &&
    age > request.configuration.maximumContextAgeMs
  ) {
    collector.error(
      "MULTI_AGENT_CONTEXT_STALE",
      "request.context.builtAtMs",
      `Context age ${age}ms exceeds maximumContextAgeMs.`,
    );
  }

  if (
    request.configuration.requireDeterministicFingerprint &&
    !hasText(context.deterministicFingerprint)
  ) {
    collector.error(
      "MULTI_AGENT_CONTEXT_FINGERPRINT_REQUIRED",
      "request.context.deterministicFingerprint",
      "A deterministic context fingerprint is required.",
    );
  }

  if (context.market.reports.length === 0) {
    collector.warning(
      "MULTI_AGENT_NO_MARKET_REPORTS",
      "request.context.market.reports",
      "No market intelligence reports were supplied.",
    );
  }

  if (context.market.markets.length === 0) {
    collector.warning(
      "MULTI_AGENT_NO_MARKETS",
      "request.context.market.markets",
      "No market identities were supplied.",
    );
  }

  if (context.portfolio !== undefined) {
    validateText(
      context.portfolio.portfolioId,
      "request.context.portfolio.portfolioId",
      collector,
    );
    validateNonNegative(
      context.portfolio.netAssetValue,
      "request.context.portfolio.netAssetValue",
      collector,
    );
    validateNonNegative(
      context.portfolio.availableCapital,
      "request.context.portfolio.availableCapital",
      collector,
    );
    validateNonNegative(
      context.portfolio.committedCapital,
      "request.context.portfolio.committedCapital",
      collector,
    );
    validateNonNegative(
      context.portfolio.grossExposure,
      "request.context.portfolio.grossExposure",
      collector,
    );
    validateNonNegative(
      context.portfolio.leverage,
      "request.context.portfolio.leverage",
      collector,
    );
    validateNormalized(
      context.portfolio.drawdown,
      "request.context.portfolio.drawdown",
      collector,
    );
    validateNormalized(
      context.portfolio.riskUtilization,
      "request.context.portfolio.riskUtilization",
      collector,
    );

    if (
      request.portfolioId !== undefined &&
      request.portfolioId !== context.portfolio.portfolioId
    ) {
      collector.error(
        "MULTI_AGENT_PORTFOLIO_ID_MISMATCH",
        "request.portfolioId",
        "request.portfolioId does not match context.portfolio.portfolioId.",
      );
    }
  }
}

export class AiMultiAgentValidator implements MultiAgentValidatorPort {
  public validateRequest(
    request: MultiAgentRunRequest,
  ): MultiAgentValidationResult<MultiAgentRunRequest> {
    const collector = new IssueCollector();

    if (!isRecord(request)) {
      collector.error(
        "MULTI_AGENT_REQUEST_REQUIRED",
        "request",
        "Request must be an object.",
      );
      return collector.result(request);
    }

    validateText(request.requestId, "request.requestId", collector);
    validateNonNegative(
      request.requestedAtMs,
      "request.requestedAtMs",
      collector,
    );

    if (!KNOWN_OBJECTIVES.has(request.objective)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_OBJECTIVE",
        "request.objective",
        `Unknown objective "${request.objective}".`,
      );
    }

    const configurationResult = this.validateConfiguration(
      request.configuration,
    );
    for (const issue of configurationResult.issues) {
      if (issue.severity === "WARNING") {
        collector.warning(
          issue.code,
          `request.configuration.${issue.path.replace(/^configuration\./, "")}`,
          issue.message,
          issue.expected,
        );
      } else {
        collector.error(
          issue.code,
          `request.configuration.${issue.path.replace(/^configuration\./, "")}`,
          issue.message,
          issue.expected,
        );
      }
    }

    validateRequestContext(request, collector);

    if (request.preferredAgentIds !== undefined) {
      validateUniqueStrings(
        request.preferredAgentIds,
        "request.preferredAgentIds",
        collector,
      );
    }

    if (request.excludedAgentIds !== undefined) {
      validateUniqueStrings(
        request.excludedAgentIds,
        "request.excludedAgentIds",
        collector,
      );
    }

    const preferred = new Set(request.preferredAgentIds ?? []);
    for (const excludedId of request.excludedAgentIds ?? []) {
      if (preferred.has(excludedId)) {
        collector.error(
          "MULTI_AGENT_AGENT_BOTH_PREFERRED_AND_EXCLUDED",
          "request.excludedAgentIds",
          `Agent "${excludedId}" cannot be both preferred and excluded.`,
        );
      }
    }

    if (request.requiredRoles !== undefined) {
      validateRoles(request.requiredRoles, "request.requiredRoles", collector);

      for (const role of request.requiredRoles) {
        if (!request.configuration.agentSelection.enabledRoles.includes(role)) {
          collector.error(
            "MULTI_AGENT_REQUEST_REQUIRES_DISABLED_ROLE",
            "request.requiredRoles",
            `Required role "${role}" is disabled by configuration.`,
          );
        }
      }
    }

    request.constraints?.forEach((constraint, index) => {
      validateConstraint(
        constraint,
        `request.constraints[${index}]`,
        collector,
      );
    });

    return collector.result(request);
  }

  public validateConfiguration(
    configuration: MultiAgentConfiguration,
  ): MultiAgentValidationResult<MultiAgentConfiguration> {
    const collector = new IssueCollector();

    if (!isRecord(configuration)) {
      collector.error(
        "MULTI_AGENT_CONFIGURATION_REQUIRED",
        "configuration",
        "Configuration must be an object.",
      );
      return collector.result(configuration);
    }

    if (configuration.schemaVersion !== AI_MULTI_AGENT_SCHEMA_VERSION) {
      collector.error(
        "MULTI_AGENT_SCHEMA_VERSION_UNSUPPORTED",
        "configuration.schemaVersion",
        `Unsupported schema version "${configuration.schemaVersion}".`,
        AI_MULTI_AGENT_SCHEMA_VERSION,
      );
    }

    if (!KNOWN_AUTONOMY_LEVELS.has(configuration.operatingMode)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_OPERATING_MODE",
        "configuration.operatingMode",
        `Unknown operating mode "${configuration.operatingMode}".`,
      );
    }

    validateSelectionPolicy(
      configuration.agentSelection,
      "configuration.agentSelection",
      collector,
    );
    validateConsensusPolicy(
      configuration.consensus,
      "configuration.consensus",
      collector,
    );
    validateDebatePolicy(
      configuration.debate,
      "configuration.debate",
      collector,
    );
    validateTrustPolicy(
      configuration.trust,
      "configuration.trust",
      collector,
    );
    validateSafetyPolicy(
      configuration.safety,
      "configuration.safety",
      collector,
    );
    validateExecutionPolicy(
      configuration.execution,
      "configuration.execution",
      collector,
    );
    validateExplainabilityPolicy(
      configuration.explainability,
      "configuration.explainability",
      collector,
    );

    configuration.governanceRules.forEach((rule, index) => {
      validateGovernanceRule(
        rule,
        `configuration.governanceRules[${index}]`,
        collector,
      );
    });

    const ruleIds = configuration.governanceRules.map((rule) => rule.ruleId);
    validateUniqueStrings(
      ruleIds,
      "configuration.governanceRules.ruleId",
      collector,
    );

    validatePositive(
      configuration.maximumContextAgeMs,
      "configuration.maximumContextAgeMs",
      collector,
    );
    validatePositive(
      configuration.maximumAgentTaskDurationMs,
      "configuration.maximumAgentTaskDurationMs",
      collector,
    );
    validatePositive(
      configuration.maximumRunDurationMs,
      "configuration.maximumRunDurationMs",
      collector,
    );

    if (
      configuration.maximumAgentTaskDurationMs >
      configuration.maximumRunDurationMs
    ) {
      collector.error(
        "MULTI_AGENT_TASK_TIMEOUT_EXCEEDS_RUN_TIMEOUT",
        "configuration.maximumAgentTaskDurationMs",
        "maximumAgentTaskDurationMs cannot exceed maximumRunDurationMs.",
      );
    }

    if (
      configuration.consensus.maximumDebateRounds >
      configuration.debate.maximumRounds
    ) {
      collector.warning(
        "MULTI_AGENT_CONSENSUS_DEBATE_LIMIT_EXCEEDS_POLICY",
        "configuration.consensus.maximumDebateRounds",
        "Consensus maximumDebateRounds exceeds debate.maximumRounds.",
      );
    }

    if (
      configuration.operatingMode === "FULLY_AUTONOMOUS" &&
      !configuration.execution.allowFullyAutomatedExecution
    ) {
      collector.warning(
        "MULTI_AGENT_AUTONOMY_EXECUTION_MISMATCH",
        "configuration.execution.allowFullyAutomatedExecution",
        "Operating mode is FULLY_AUTONOMOUS but fully automated execution is disabled.",
      );
    }

    if (
      configuration.execution.allowFullyAutomatedExecution &&
      configuration.safety.allowOperatorOverride
    ) {
      collector.warning(
        "MULTI_AGENT_AUTOMATION_WITH_OPERATOR_OVERRIDE",
        "configuration.safety.allowOperatorOverride",
        "Operator override is enabled for fully automated execution.",
      );
    }

    return collector.result(configuration);
  }

  public validateRegistration(
    registration: MultiAgentRegistration,
  ): MultiAgentValidationResult<MultiAgentRegistration> {
    const collector = new IssueCollector();

    if (!isRecord(registration)) {
      collector.error(
        "MULTI_AGENT_REGISTRATION_REQUIRED",
        "registration",
        "Registration must be an object.",
      );
      return collector.result(registration);
    }

    const { identity, authority } = registration;

    validateText(identity.agentId, "registration.identity.agentId", collector);
    validateText(identity.name, "registration.identity.name", collector);
    validateText(identity.version, "registration.identity.version", collector);
    validateText(
      identity.description,
      "registration.identity.description",
      collector,
    );

    if (!KNOWN_ROLES.has(identity.role)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_ROLE",
        "registration.identity.role",
        `Unknown role "${identity.role}".`,
      );
    }

    if (!KNOWN_MODEL_TYPES.has(identity.modelType)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_MODEL_TYPE",
        "registration.identity.modelType",
        `Unknown model type "${identity.modelType}".`,
      );
    }

    if (!KNOWN_AUTHORITY_LEVELS.has(authority.level)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_AUTHORITY_LEVEL",
        "registration.authority.level",
        `Unknown authority level "${authority.level}".`,
      );
    }

    if (!KNOWN_AUTONOMY_LEVELS.has(authority.autonomy)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_AUTONOMY_LEVEL",
        "registration.authority.autonomy",
        `Unknown autonomy level "${authority.autonomy}".`,
      );
    }

    if (!KNOWN_REASONING_MODES.has(registration.reasoningMode)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_REASONING_MODE",
        "registration.reasoningMode",
        `Unknown reasoning mode "${registration.reasoningMode}".`,
      );
    }

    validateBoolean(
      registration.deterministic,
      "registration.deterministic",
      collector,
    );
    validateBoolean(
      registration.replaySafe,
      "registration.replaySafe",
      collector,
    );
    validateNonNegative(
      registration.registeredAtMs,
      "registration.registeredAtMs",
      collector,
    );
    validateText(
      registration.configurationVersion,
      "registration.configurationVersion",
      collector,
    );

    if (registration.replaySafe && !registration.deterministic) {
      collector.error(
        "MULTI_AGENT_REPLAY_SAFE_REQUIRES_DETERMINISM",
        "registration.replaySafe",
        "A replay-safe agent must be deterministic.",
      );
    }

    if (registration.capabilities.length === 0) {
      collector.error(
        "MULTI_AGENT_CAPABILITIES_REQUIRED",
        "registration.capabilities",
        "An agent registration must declare at least one capability.",
      );
    }

    const capabilityNames: MultiAgentCapability[] =
      registration.capabilities.map((entry) => entry.capability);
    validateCapabilities(
      capabilityNames,
      "registration.capabilities.capability",
      collector,
    );

    registration.capabilities.forEach((declaration, index) => {
      const path = `registration.capabilities[${index}]`;
      validateBoolean(declaration.enabled, `${path}.enabled`, collector);
      validateNormalized(
        declaration.proficiency,
        `${path}.proficiency`,
        collector,
      );
      validateNormalized(
        declaration.confidenceFloor,
        `${path}.confidenceFloor`,
        collector,
      );

      if (!KNOWN_CRITICALITIES.has(declaration.criticality)) {
        collector.error(
          "MULTI_AGENT_UNKNOWN_CRITICALITY",
          `${path}.criticality`,
          `Unknown criticality "${declaration.criticality}".`,
        );
      }
    });

    validateUniqueStrings(
      authority.restrictedActions,
      "registration.authority.restrictedActions",
      collector,
    );

    authority.restrictedActions.forEach((action, index) => {
      if (!KNOWN_ACTION_TYPES.has(action)) {
        collector.error(
          "MULTI_AGENT_UNKNOWN_RESTRICTED_ACTION",
          `registration.authority.restrictedActions[${index}]`,
          `Unknown action type "${action}".`,
        );
      }
    });

    if (
      authority.mayVeto &&
      authority.level !== "APPROVER" &&
      authority.level !== "SUPERVISOR"
    ) {
      collector.error(
        "MULTI_AGENT_VETO_AUTHORITY_INVALID",
        "registration.authority.mayVeto",
        "Veto authority requires APPROVER or SUPERVISOR level.",
      );
    }

    if (authority.mayArbitrate && authority.level !== "ARBITER" &&
        authority.level !== "SUPERVISOR") {
      collector.error(
        "MULTI_AGENT_ARBITRATION_AUTHORITY_INVALID",
        "registration.authority.mayArbitrate",
        "Arbitration authority requires ARBITER or SUPERVISOR level.",
      );
    }

    if (
      authority.mayApproveExecution &&
      authority.level !== "APPROVER" &&
      authority.level !== "SUPERVISOR"
    ) {
      collector.error(
        "MULTI_AGENT_EXECUTION_APPROVAL_AUTHORITY_INVALID",
        "registration.authority.mayApproveExecution",
        "Execution approval requires APPROVER or SUPERVISOR level.",
      );
    }

    if (authority.maximumCapitalAuthority !== undefined) {
      validateNonNegative(
        authority.maximumCapitalAuthority,
        "registration.authority.maximumCapitalAuthority",
        collector,
      );
    }
    if (authority.maximumRiskAuthority !== undefined) {
      validateNormalized(
        authority.maximumRiskAuthority,
        "registration.authority.maximumRiskAuthority",
        collector,
      );
    }

    const enabledCapabilities = new Set(
      registration.capabilities
        .filter((entry) => entry.enabled)
        .map((entry) => entry.capability),
    );

    if (authority.mayPropose && !enabledCapabilities.has("PROPOSE_DECISION")) {
      collector.warning(
        "MULTI_AGENT_PROPOSE_AUTHORITY_WITHOUT_CAPABILITY",
        "registration.authority.mayPropose",
        "Agent may propose but does not enable PROPOSE_DECISION.",
      );
    }

    if (authority.mayReview && !enabledCapabilities.has("REVIEW_PROPOSAL")) {
      collector.warning(
        "MULTI_AGENT_REVIEW_AUTHORITY_WITHOUT_CAPABILITY",
        "registration.authority.mayReview",
        "Agent may review but does not enable REVIEW_PROPOSAL.",
      );
    }

    if (authority.mayVote && !enabledCapabilities.has("VOTE")) {
      collector.warning(
        "MULTI_AGENT_VOTE_AUTHORITY_WITHOUT_CAPABILITY",
        "registration.authority.mayVote",
        "Agent may vote but does not enable VOTE.",
      );
    }

    return collector.result(registration);
  }

  public validateProposal(
    proposal: MultiAgentProposal,
  ): MultiAgentValidationResult<MultiAgentProposal> {
    const collector = new IssueCollector();

    if (!isRecord(proposal)) {
      collector.error(
        "MULTI_AGENT_PROPOSAL_REQUIRED",
        "proposal",
        "Proposal must be an object.",
      );
      return collector.result(proposal);
    }

    validateText(proposal.proposalId, "proposal.proposalId", collector);
    validateText(proposal.runId, "proposal.runId", collector);
    validateText(proposal.sessionId, "proposal.sessionId", collector);
    validateText(
      proposal.proposedByAgentId,
      "proposal.proposedByAgentId",
      collector,
    );
    validateText(proposal.title, "proposal.title", collector);
    validateText(proposal.thesis, "proposal.thesis", collector);
    validateText(
      proposal.deterministicFingerprint,
      "proposal.deterministicFingerprint",
      collector,
    );

    if (!KNOWN_PROPOSAL_STATUSES.has(proposal.status)) {
      collector.error(
        "MULTI_AGENT_UNKNOWN_PROPOSAL_STATUS",
        "proposal.status",
        `Unknown proposal status "${proposal.status}".`,
      );
    }

    validateNormalized(proposal.confidence, "proposal.confidence", collector);
    validateNonNegative(proposal.createdAtMs, "proposal.createdAtMs", collector);

    if (!isNonNegativeInteger(proposal.revision)) {
      collector.error(
        "MULTI_AGENT_PROPOSAL_REVISION_INVALID",
        "proposal.revision",
        "Proposal revision must be a non-negative integer.",
      );
    }

    if (
      proposal.validUntilMs !== undefined &&
      proposal.validUntilMs <= proposal.createdAtMs
    ) {
      collector.error(
        "MULTI_AGENT_PROPOSAL_VALIDITY_INVALID",
        "proposal.validUntilMs",
        "validUntilMs must be greater than createdAtMs.",
      );
    }

    if (
      proposal.parentProposalId !== undefined &&
      proposal.parentProposalId === proposal.proposalId
    ) {
      collector.error(
        "MULTI_AGENT_PROPOSAL_SELF_PARENT",
        "proposal.parentProposalId",
        "A proposal cannot reference itself as its parent.",
      );
    }

    if (proposal.actions.length === 0) {
      collector.warning(
        "MULTI_AGENT_PROPOSAL_HAS_NO_ACTIONS",
        "proposal.actions",
        "Proposal contains no actions.",
      );
    }

    proposal.actions.forEach((action, index) => {
      validateProposalAction(action, `proposal.actions[${index}]`, collector);
    });

    validateUniqueStrings(
      proposal.actions.map((action) => action.actionId),
      "proposal.actions.actionId",
      collector,
    );

    proposal.constraints.forEach((constraint, index) => {
      validateConstraint(
        constraint,
        `proposal.constraints[${index}]`,
        collector,
      );
    });

    const hardFailures = proposal.constraints.filter(
      (constraint) => constraint.hard && !constraint.satisfied,
    );
    if (
      hardFailures.length > 0 &&
      proposal.status === "ACCEPTED"
    ) {
      collector.error(
        "MULTI_AGENT_APPROVED_PROPOSAL_VIOLATES_HARD_CONSTRAINT",
        "proposal.status",
        "An approved proposal cannot contain unsatisfied hard constraints.",
      );
    }

    const utility = proposal.expectedUtility;
    const utilityValues = [
      utility.expectedReturnUtility,
      utility.riskAdjustedUtility,
      utility.portfolioUtility,
      utility.strategyUtility,
      utility.arbitrageUtility,
      utility.executionUtility,
      utility.learningUtility,
      utility.operationalUtility,
      utility.totalUtility,
    ];

    utilityValues.forEach((value, index) => {
      validateFinite(
        value,
        `proposal.expectedUtility[${index}]`,
        collector,
      );
    });

    proposal.risks.forEach((risk, index) => {
      const path = `proposal.risks[${index}]`;
      validateText(risk.code, `${path}.code`, collector);
      validateText(risk.name, `${path}.name`, collector);
      validateText(risk.description, `${path}.description`, collector);
      validateNormalized(risk.probability, `${path}.probability`, collector);
      validateNormalized(risk.confidence, `${path}.confidence`, collector);
      validateNormalized(risk.impact, `${path}.impact`, collector);
    });

    return collector.result(proposal);
  }

  public validateDecision(
    decision: MultiAgentCollectiveDecision,
  ): MultiAgentValidationResult<MultiAgentCollectiveDecision> {
    const collector = new IssueCollector();

    if (!isRecord(decision)) {
      collector.error(
        "MULTI_AGENT_DECISION_REQUIRED",
        "decision",
        "Decision must be an object.",
      );
      return collector.result(decision);
    }

    validateText(decision.decisionId, "decision.decisionId", collector);
    validateText(decision.runId, "decision.runId", collector);
    validateText(decision.sessionId, "decision.sessionId", collector);
    validateText(
      decision.deterministicFingerprint,
      "decision.deterministicFingerprint",
      collector,
    );
    validateNonNegative(decision.decidedAtMs, "decision.decidedAtMs", collector);

    if (
      decision.validUntilMs !== undefined &&
      decision.validUntilMs <= decision.decidedAtMs
    ) {
      collector.error(
        "MULTI_AGENT_DECISION_VALIDITY_INVALID",
        "decision.validUntilMs",
        "validUntilMs must be greater than decidedAtMs.",
      );
    }

    validateNormalized(
      decision.collectiveConfidence.rawConfidence,
      "decision.collectiveConfidence.rawConfidence",
      collector,
    );
    validateNormalized(
      decision.collectiveConfidence.finalConfidence,
      "decision.collectiveConfidence.finalConfidence",
      collector,
    );

    const consensus = decision.consensus;
    validateText(consensus.consensusId, "decision.consensus.consensusId", collector);
    validateNormalized(
      consensus.participationRatio,
      "decision.consensus.participationRatio",
      collector,
    );
    validateNormalized(
      consensus.collectiveConfidence.finalConfidence,
      "decision.consensus.collectiveConfidence.finalConfidence",
      collector,
    );

    if (
      decision.selectedProposal !== undefined &&
      consensus.selectedProposalId !== decision.selectedProposal.proposalId
    ) {
      collector.error(
        "MULTI_AGENT_SELECTED_PROPOSAL_MISMATCH",
        "decision.selectedProposal.proposalId",
        "Selected proposal does not match consensus.selectedProposalId.",
      );
    }

    if (
      decision.selectedProposal !== undefined &&
      decision.selectedProposal.runId !== decision.runId
    ) {
      collector.error(
        "MULTI_AGENT_DECISION_PROPOSAL_RUN_MISMATCH",
        "decision.selectedProposal.runId",
        "Selected proposal runId does not match decision runId.",
      );
    }

    decision.actions.forEach((entry, index) => {
      const path = `decision.actions[${index}]`;
      validateText(entry.actionId, `${path}.actionId`, collector);
      validateText(
        entry.sourceProposalId,
        `${path}.sourceProposalId`,
        collector,
      );
      validateNormalized(entry.confidence, `${path}.confidence`, collector);
      validateProposalAction(entry.action, `${path}.action`, collector);

      if (entry.actionId !== entry.action.actionId) {
        collector.error(
          "MULTI_AGENT_DECISION_ACTION_ID_MISMATCH",
          `${path}.actionId`,
          "Decision actionId must match nested proposal actionId.",
        );
      }
    });

    validateUniqueStrings(
      decision.actions.map((entry) => entry.actionId),
      "decision.actions.actionId",
      collector,
    );

    decision.constraints.forEach((constraint, index) => {
      validateConstraint(
        constraint,
        `decision.constraints[${index}]`,
        collector,
      );
    });

    const unsatisfiedHardConstraints = decision.constraints.filter(
      (constraint) => constraint.hard && !constraint.satisfied,
    );

    if (
      isExecutableMultiAgentDecision(decision.decision) &&
      unsatisfiedHardConstraints.length > 0
    ) {
      collector.error(
        "MULTI_AGENT_EXECUTABLE_DECISION_VIOLATES_HARD_CONSTRAINT",
        "decision.constraints",
        "Executable decisions cannot contain unsatisfied hard constraints.",
      );
    }

    if (
      isExecutableMultiAgentDecision(decision.decision) &&
      decision.actions.filter((entry) => entry.approved).length === 0
    ) {
      collector.error(
        "MULTI_AGENT_EXECUTABLE_DECISION_WITHOUT_APPROVED_ACTIONS",
        "decision.actions",
        "Executable decisions require at least one approved action.",
      );
    }

    if (
      isExecutableMultiAgentDecision(decision.decision) &&
      decision.executionHandoff === undefined
    ) {
      collector.error(
        "MULTI_AGENT_EXECUTION_HANDOFF_REQUIRED",
        "decision.executionHandoff",
        "Executable decisions require an execution handoff.",
      );
    }

    if (decision.executionHandoff !== undefined) {
      const handoff = decision.executionHandoff;
      validateText(handoff.planId, "decision.executionHandoff.planId", collector);
      validateText(
        handoff.deterministicFingerprint,
        "decision.executionHandoff.deterministicFingerprint",
        collector,
      );
      validateNonNegative(
        handoff.generatedAtMs,
        "decision.executionHandoff.generatedAtMs",
        collector,
      );

      if (
        handoff.executionAuthorized &&
        !isExecutableMultiAgentDecision(decision.decision)
      ) {
        collector.error(
          "MULTI_AGENT_NON_EXECUTABLE_DECISION_AUTHORIZED",
          "decision.executionHandoff.executionAuthorized",
          "Execution cannot be authorized for a non-executable decision.",
        );
      }

      if (
        handoff.executionAuthorized &&
        decision.governance.decision !== "APPROVED" &&
        decision.governance.decision !== "APPROVED_WITH_RESTRICTIONS"
      ) {
        collector.error(
          "MULTI_AGENT_EXECUTION_WITHOUT_GOVERNANCE_APPROVAL",
          "decision.governance.decision",
          "Execution authorization requires governance approval.",
        );
      }
    }

    if (
      decision.governance.decision === "REJECTED" &&
      isExecutableMultiAgentDecision(decision.decision)
    ) {
      collector.error(
        "MULTI_AGENT_EXECUTABLE_GOVERNANCE_REJECTED_DECISION",
        "decision.decision",
        "A governance-rejected decision cannot be executable.",
      );
    }

    decision.risks.forEach((risk, index) => {
      const path = `decision.risks[${index}]`;
      validateText(risk.code, `${path}.code`, collector);
      validateText(risk.name, `${path}.name`, collector);
      validateNormalized(risk.probability, `${path}.probability`, collector);
      validateNormalized(risk.confidence, `${path}.confidence`, collector);
      validateNormalized(risk.impact, `${path}.impact`, collector);
    });

    return collector.result(decision);
  }
}

export const aiMultiAgentValidator: MultiAgentValidatorPort =
  Object.freeze(new AiMultiAgentValidator());

export function validateMultiAgentRunRequest(
  request: MultiAgentRunRequest,
): MultiAgentValidationResult<MultiAgentRunRequest> {
  return aiMultiAgentValidator.validateRequest(request);
}

export function validateMultiAgentConfiguration(
  configuration: MultiAgentConfiguration,
): MultiAgentValidationResult<MultiAgentConfiguration> {
  return aiMultiAgentValidator.validateConfiguration(configuration);
}

export function validateMultiAgentRegistration(
  registration: MultiAgentRegistration,
): MultiAgentValidationResult<MultiAgentRegistration> {
  return aiMultiAgentValidator.validateRegistration(registration);
}

export function validateMultiAgentProposal(
  proposal: MultiAgentProposal,
): MultiAgentValidationResult<MultiAgentProposal> {
  return aiMultiAgentValidator.validateProposal(proposal);
}

export function validateMultiAgentCollectiveDecision(
  decision: MultiAgentCollectiveDecision,
): MultiAgentValidationResult<MultiAgentCollectiveDecision> {
  return aiMultiAgentValidator.validateDecision(decision);
}

export function isKnownMultiAgentRole(value: string): value is MultiAgentRole {
  return KNOWN_ROLES.has(value);
}

export function isKnownMultiAgentCapability(
  value: string,
): value is MultiAgentCapability {
  return KNOWN_CAPABILITIES.has(value);
}