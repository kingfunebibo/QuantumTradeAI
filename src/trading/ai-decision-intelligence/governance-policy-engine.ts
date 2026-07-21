/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 8:
 * src/trading/ai-decision-intelligence/governance-policy-engine.ts
 *
 * Deterministic governance evaluation for autonomous decision plans.
 * The engine evaluates policy, safety, system-health, risk, turnover,
 * confidence, approval, rollback and action-type rules, then returns an
 * immutable governance assessment.
 */

import type {
  DecisionAction,
  DecisionActionType,
  DecisionGovernanceAssessment,
  DecisionGovernanceEnginePort,
  DecisionGovernancePolicy,
  DecisionGovernanceRequest,
  DecisionIntelligenceId,
  DecisionSafetyPolicy,
  GovernanceApprovalRequirement,
  GovernanceDecision,
  GovernanceRuleEvaluation,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;

export interface GovernancePolicyEngineOptions {
  readonly blockWhenPolicyDisabled?: boolean;
  readonly rejectProhibitedActions?: boolean;
  readonly restrictRestrictedActions?: boolean;
  readonly requireRollbackForRiskIncreasingActions?: boolean;
  readonly rejectExpiredPlans?: boolean;
  readonly rejectPlansWithBlockingContext?: boolean;
}

export class GovernancePolicyEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "GOVERNANCE_POLICY_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "GovernancePolicyEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface EvaluationState {
  readonly rules: GovernanceRuleEvaluation[];
  readonly approvedActionIds: Set<string>;
  readonly restrictedActionIds: Set<string>;
  readonly rejectedActionIds: Set<string>;
  readonly requiredApproverRoles: Set<string>;
  readonly restrictions: string[];
  readonly reasons: string[];
  readonly warnings: string[];
  approvalRequirement: GovernanceApprovalRequirement;
  blockingFailure: boolean;
  rejectionFailure: boolean;
  deferredFailure: boolean;
}

export class GovernancePolicyEngine
  implements DecisionGovernanceEnginePort
{
  private readonly blockWhenPolicyDisabled: boolean;
  private readonly rejectProhibitedActions: boolean;
  private readonly restrictRestrictedActions: boolean;
  private readonly requireRollbackForRiskIncreasingActions: boolean;
  private readonly rejectExpiredPlans: boolean;
  private readonly rejectPlansWithBlockingContext: boolean;

  public constructor(options: GovernancePolicyEngineOptions = {}) {
    this.blockWhenPolicyDisabled =
      options.blockWhenPolicyDisabled ?? false;
    this.rejectProhibitedActions =
      options.rejectProhibitedActions ?? true;
    this.restrictRestrictedActions =
      options.restrictRestrictedActions ?? true;
    this.requireRollbackForRiskIncreasingActions =
      options.requireRollbackForRiskIncreasingActions ?? true;
    this.rejectExpiredPlans = options.rejectExpiredPlans ?? true;
    this.rejectPlansWithBlockingContext =
      options.rejectPlansWithBlockingContext ?? true;
  }

  public evaluate(
    input: DecisionGovernanceRequest,
  ): DecisionGovernanceAssessment {
    this.assertRequest(input);

    const policy = input.request.configuration.governancePolicy;
    const safety = input.request.configuration.safetyPolicy;
    const state = this.createState(policy);

    this.evaluatePolicyEnablement(input, policy, state);
    this.evaluatePlanExpiry(input, state);
    this.evaluateContextBlockingConditions(input, state);
    this.evaluateSystemHealth(input, safety, state);
    this.evaluateExecutionMode(input, policy, safety, state);
    this.evaluatePlanDecision(input, state);
    this.evaluatePlanConfidence(input, policy, safety, state);
    this.evaluateDataQuality(input, safety, state);
    this.evaluateRiskIncrease(input, policy, safety, state);
    this.evaluateTurnover(input, policy, safety, state);
    this.evaluateCapitalReallocation(input, safety, state);
    this.evaluateChangedStrategyCount(input, safety, state);
    this.evaluateActiveStrategyPreservation(input, safety, state);
    this.evaluateValidationWarnings(input, safety, state);
    this.evaluateActions(input, policy, safety, state);

    this.finalizeApprovedActions(input, state);

    const decision = this.determineDecision(input, state);
    const assessmentId = deterministicId(
      "governance-assessment",
      [
        input.request.requestId,
        input.plan.planId,
        input.generatedAt,
        decision,
      ].join("|"),
    );

    return Object.freeze({
      assessmentId,
      evaluatedAt: input.generatedAt,
      decision,
      approvalRequirement: state.approvalRequirement,
      approvedActionIds: Object.freeze(
        [...state.approvedActionIds].sort(compareText),
      ),
      restrictedActionIds: Object.freeze(
        [...state.restrictedActionIds].sort(compareText),
      ),
      rejectedActionIds: Object.freeze(
        [...state.rejectedActionIds].sort(compareText),
      ),
      requiredApproverRoles: Object.freeze(
        [...state.requiredApproverRoles].sort(compareText),
      ),
      ruleEvaluations: Object.freeze([...state.rules]),
      restrictions: Object.freeze(uniqueStrings(state.restrictions)),
      reasons: Object.freeze(uniqueStrings(state.reasons)),
      warnings: Object.freeze(uniqueStrings(state.warnings)),
    });
  }

  private createState(
    policy: DecisionGovernancePolicy,
  ): EvaluationState {
    return {
      rules: [],
      approvedActionIds: new Set<string>(),
      restrictedActionIds: new Set<string>(),
      rejectedActionIds: new Set<string>(),
      requiredApproverRoles: new Set<string>(),
      restrictions: [],
      reasons: [],
      warnings: [],
      approvalRequirement: policy.defaultApprovalRequirement,
      blockingFailure: false,
      rejectionFailure: false,
      deferredFailure: false,
    };
  }

  private evaluatePolicyEnablement(
    input: DecisionGovernanceRequest,
    policy: DecisionGovernancePolicy,
    state: EvaluationState,
  ): void {
    if (policy.enabled) {
      this.addRule(state, {
        ruleId: "governance-policy-enabled",
        ruleName: "Governance policy enabled",
        passed: true,
        blocking: false,
        message: "Governance policy evaluation is enabled.",
        evaluatedValue: true,
        expectedValue: true,
      });
      return;
    }

    const passed = !this.blockWhenPolicyDisabled;
    this.addRule(state, {
      ruleId: "governance-policy-enabled",
      ruleName: "Governance policy enabled",
      passed,
      blocking: this.blockWhenPolicyDisabled,
      message: passed
        ? "Governance policy is disabled; the plan is evaluated using safety rules only."
        : "Governance policy is disabled and execution is blocked by engine configuration.",
      evaluatedValue: false,
      expectedValue: true,
    });

    if (passed) {
      state.warnings.push(
        "Governance policy is disabled; only mandatory safety rules were applied.",
      );
    } else {
      state.blockingFailure = true;
      state.deferredFailure = true;
      state.reasons.push(
        "Execution is blocked because governance policy evaluation is disabled.",
      );
    }
  }

  private evaluatePlanExpiry(
    input: DecisionGovernanceRequest,
    state: EvaluationState,
  ): void {
    const validUntil = input.plan.validUntil;
    const expired =
      validUntil !== undefined &&
      Date.parse(validUntil) < Date.parse(input.generatedAt);

    this.addRule(state, {
      ruleId: "plan-not-expired",
      ruleName: "Plan validity window",
      passed: !expired,
      blocking: this.rejectExpiredPlans,
      message: expired
        ? "The execution plan has expired."
        : "The execution plan is within its validity window.",
      ...(validUntil === undefined
        ? {}
        : { evaluatedValue: validUntil }),
      expectedValue: "not expired",
    });

    if (expired) {
      state.reasons.push("The execution plan is expired.");
      if (this.rejectExpiredPlans) {
        state.rejectionFailure = true;
      } else {
        state.deferredFailure = true;
      }
    }
  }

  private evaluateContextBlockingConditions(
    input: DecisionGovernanceRequest,
    state: EvaluationState,
  ): void {
    const count = input.context.blockingConditions.length;
    const passed = count === 0;

    this.addRule(state, {
      ruleId: "context-has-no-blocking-conditions",
      ruleName: "Context blocking conditions",
      passed,
      blocking: this.rejectPlansWithBlockingContext,
      message: passed
        ? "No blocking decision-context conditions were detected."
        : `${count} blocking decision-context condition(s) were detected.`,
      evaluatedValue: count,
      expectedValue: 0,
    });

    if (!passed) {
      state.reasons.push(...input.context.blockingConditions);
      if (this.rejectPlansWithBlockingContext) {
        state.rejectionFailure = true;
      } else {
        state.deferredFailure = true;
      }
    }
  }

  private evaluateSystemHealth(
    input: DecisionGovernanceRequest,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const health = input.request.systemHealth;

    const riskPassed =
      !safety.blockOnUnhealthyRiskEngine || health.riskEngineHealthy;
    this.addRule(state, {
      ruleId: "risk-engine-healthy",
      ruleName: "Risk engine health",
      passed: riskPassed,
      blocking: safety.blockOnUnhealthyRiskEngine,
      message: riskPassed
        ? "Risk engine health satisfies policy."
        : "Risk engine is unhealthy and policy requires blocking.",
      evaluatedValue: health.riskEngineHealthy,
      expectedValue: true,
    });

    if (!riskPassed) {
      state.blockingFailure = true;
      state.deferredFailure = true;
      state.reasons.push(
        "Execution is blocked because the risk engine is unhealthy.",
      );
    }

    const executionPassed =
      !safety.blockOnUnhealthyExecutionEngine ||
      health.executionEngineHealthy;
    this.addRule(state, {
      ruleId: "execution-engine-healthy",
      ruleName: "Execution engine health",
      passed: executionPassed,
      blocking: safety.blockOnUnhealthyExecutionEngine,
      message: executionPassed
        ? "Execution engine health satisfies policy."
        : "Execution engine is unhealthy and policy requires blocking.",
      evaluatedValue: health.executionEngineHealthy,
      expectedValue: true,
    });

    if (!executionPassed) {
      state.blockingFailure = true;
      state.deferredFailure = true;
      state.reasons.push(
        "Execution is blocked because the execution engine is unhealthy.",
      );
    }

    if (!health.persistenceHealthy) {
      state.warnings.push(
        "Persistence subsystem is unhealthy; audit durability may be degraded.",
      );
    }

    if (health.unavailableComponents.length > 0) {
      state.warnings.push(
        `Unavailable components: ${health.unavailableComponents.join(", ")}.`,
      );
    }

    if (health.degradedComponents.length > 0) {
      state.warnings.push(
        `Degraded components: ${health.degradedComponents.join(", ")}.`,
      );
    }
  }

  private evaluateExecutionMode(
    input: DecisionGovernanceRequest,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const mode = input.plan.executionMode;
    const isAutonomous = mode === "LIVE_AUTONOMOUS";
    const autonomousAllowed =
      !isAutonomous || policy.autonomousExecutionAllowed;

    this.addRule(state, {
      ruleId: "autonomous-execution-allowed",
      ruleName: "Autonomous execution permission",
      passed: autonomousAllowed,
      blocking: true,
      message: autonomousAllowed
        ? "Execution mode is permitted by governance policy."
        : "Live autonomous execution is prohibited by governance policy.",
      evaluatedValue: mode,
      expectedValue: policy.autonomousExecutionAllowed,
    });

    if (!autonomousAllowed) {
      state.rejectionFailure = true;
      state.reasons.push(
        "Live autonomous execution is not allowed by governance policy.",
      );
    }

    if (
      isAutonomous &&
      safety.requireHumanApprovalForLiveAutonomousMode
    ) {
      this.escalateApproval(
        state,
        "HUMAN_OPERATOR",
        policy.requiredApproverRoles,
      );
      state.restrictions.push(
        "Live autonomous execution requires human approval.",
      );
    }

    if (
      safety.dryRun &&
      mode !== "DRY_RUN" &&
      input.plan.actions.length > 0
    ) {
      state.restrictions.push(
        "Safety policy is in dry-run mode; actions must not be sent to live execution.",
      );
      for (const action of input.plan.actions) {
        state.restrictedActionIds.add(action.actionId);
      }
    }
  }

  private evaluatePlanDecision(
    input: DecisionGovernanceRequest,
    state: EvaluationState,
  ): void {
    const executable =
      input.plan.decision === "EXECUTE" ||
      input.plan.decision === "EXECUTE_WITH_RESTRICTIONS";
    const noActions = input.plan.actions.length === 0;

    const passed = executable || noActions;
    this.addRule(state, {
      ruleId: "plan-decision-executable",
      ruleName: "Plan execution decision",
      passed,
      blocking: false,
      message: passed
        ? "Plan decision is governance-compatible."
        : `Plan decision ${input.plan.decision} is not executable.`,
      evaluatedValue: input.plan.decision,
      expectedValue: "EXECUTE or EXECUTE_WITH_RESTRICTIONS",
    });

    if (!passed) {
      state.deferredFailure = true;
      state.reasons.push(
        `Plan decision ${input.plan.decision} does not authorize execution.`,
      );
    }
  }

  private evaluatePlanConfidence(
    input: DecisionGovernanceRequest,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const required = Math.max(
      safety.minimumDecisionConfidence,
      input.plan.executionMode === "LIVE_AUTONOMOUS"
        ? policy.minimumAutonomousConfidence
        : 0,
    );
    const actual = input.plan.metrics.confidence;
    const passed = actual + EPSILON >= required;

    this.addRule(state, {
      ruleId: "minimum-plan-confidence",
      ruleName: "Minimum plan confidence",
      passed,
      blocking: true,
      message: passed
        ? "Plan confidence meets the configured minimum."
        : "Plan confidence is below the configured minimum.",
      evaluatedValue: actual,
      expectedValue: required,
    });

    if (!passed) {
      state.deferredFailure = true;
      state.reasons.push(
        `Plan confidence ${format(actual)} is below required confidence ${format(required)}.`,
      );
    }
  }

  private evaluateDataQuality(
    input: DecisionGovernanceRequest,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const actual = input.context.evidenceQualityScore;
    const required = safety.minimumDataQualityScore;
    const passed = actual + EPSILON >= required;

    this.addRule(state, {
      ruleId: "minimum-data-quality",
      ruleName: "Minimum evidence quality",
      passed,
      blocking: true,
      message: passed
        ? "Evidence quality meets the configured minimum."
        : "Evidence quality is below the configured minimum.",
      evaluatedValue: actual,
      expectedValue: required,
    });

    if (!passed) {
      state.deferredFailure = true;
      state.reasons.push(
        `Evidence quality ${format(actual)} is below required quality ${format(required)}.`,
      );
    }
  }

  private evaluateRiskIncrease(
    input: DecisionGovernanceRequest,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const actual = input.plan.metrics.expectedRiskDelta;
    const safetyLimit = safety.maximumAllowedRiskIncrease;
    const autonomousLimit =
      input.plan.executionMode === "LIVE_AUTONOMOUS"
        ? policy.maximumAutonomousRiskIncrease
        : Number.POSITIVE_INFINITY;
    const limit = Math.min(safetyLimit, autonomousLimit);
    const passed = actual <= limit + EPSILON;

    this.addRule(state, {
      ruleId: "maximum-risk-increase",
      ruleName: "Maximum expected risk increase",
      passed,
      blocking: true,
      message: passed
        ? "Expected risk increase is within policy limits."
        : "Expected risk increase exceeds policy limits.",
      evaluatedValue: actual,
      expectedValue: limit,
    });

    if (!passed) {
      state.rejectionFailure = true;
      state.reasons.push(
        `Expected risk increase ${format(actual)} exceeds limit ${format(limit)}.`,
      );
    }

    if (
      actual > EPSILON &&
      safety.requireHumanApprovalForRiskIncrease
    ) {
      this.escalateApproval(
        state,
        "RISK_ENGINE",
        policy.requiredApproverRoles,
      );
      state.restrictions.push(
        "Risk-increasing actions require risk-engine approval.",
      );
    }
  }

  private evaluateTurnover(
    input: DecisionGovernanceRequest,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const actual = input.plan.metrics.expectedTurnover;
    const autonomousLimit =
      input.plan.executionMode === "LIVE_AUTONOMOUS"
        ? policy.maximumAutonomousTurnover
        : Number.POSITIVE_INFINITY;
    const limit = Math.min(
      safety.maximumPortfolioTurnover,
      autonomousLimit,
    );
    const passed = actual <= limit + EPSILON;

    this.addRule(state, {
      ruleId: "maximum-portfolio-turnover",
      ruleName: "Maximum portfolio turnover",
      passed,
      blocking: true,
      message: passed
        ? "Expected turnover is within policy limits."
        : "Expected turnover exceeds policy limits.",
      evaluatedValue: actual,
      expectedValue: limit,
    });

    if (!passed) {
      state.rejectionFailure = true;
      state.reasons.push(
        `Expected turnover ${format(actual)} exceeds limit ${format(limit)}.`,
      );
    }
  }

  private evaluateCapitalReallocation(
    input: DecisionGovernanceRequest,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const actual = input.plan.metrics.expectedCapitalChange;
    const limit = safety.maximumCapitalReallocatedPerRun;
    const passed = actual <= limit + EPSILON;

    this.addRule(state, {
      ruleId: "maximum-capital-reallocation",
      ruleName: "Maximum capital reallocation",
      passed,
      blocking: true,
      message: passed
        ? "Capital reallocation is within policy limits."
        : "Capital reallocation exceeds policy limits.",
      evaluatedValue: actual,
      expectedValue: limit,
    });

    if (!passed) {
      state.rejectionFailure = true;
      state.reasons.push(
        `Expected capital change ${format(actual)} exceeds limit ${format(limit)}.`,
      );
    }
  }

  private evaluateChangedStrategyCount(
    input: DecisionGovernanceRequest,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const strategyIds = new Set(
      input.plan.actions
        .map((action) => action.strategyId)
        .filter((value): value is string => value !== undefined),
    );
    const actual = strategyIds.size;
    const limit = safety.maximumStrategiesChangedPerRun;
    const passed = actual <= limit;

    this.addRule(state, {
      ruleId: "maximum-strategies-changed",
      ruleName: "Maximum strategies changed per run",
      passed,
      blocking: true,
      message: passed
        ? "Strategy-change count is within policy limits."
        : "Too many strategies are changed in one run.",
      evaluatedValue: actual,
      expectedValue: limit,
    });

    if (!passed) {
      state.rejectionFailure = true;
      state.reasons.push(
        `${actual} strategies would change, exceeding the limit of ${limit}.`,
      );
    }
  }

  private evaluateActiveStrategyPreservation(
    input: DecisionGovernanceRequest,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    if (!safety.preserveAtLeastOneActiveStrategy) {
      this.addRule(state, {
        ruleId: "preserve-active-strategy",
        ruleName: "Preserve active strategy",
        passed: true,
        blocking: false,
        message: "Active-strategy preservation is not required.",
        expectedValue: false,
      });
      return;
    }

    const activeModes = new Set<string>([
      "SHADOW",
      "PAPER",
      "LIMITED_LIVE",
      "LIVE",
      "EMERGENCY_ONLY",
    ]);
    const activeCount = Object.values(
      input.plan.targetOperatingModes,
    ).filter((mode) => activeModes.has(mode)).length;
    const passed = activeCount > 0;

    this.addRule(state, {
      ruleId: "preserve-active-strategy",
      ruleName: "Preserve active strategy",
      passed,
      blocking: true,
      message: passed
        ? "At least one strategy remains operational."
        : "The plan would leave no operational strategy.",
      evaluatedValue: activeCount,
      expectedValue: "at least 1",
    });

    if (!passed) {
      state.rejectionFailure = true;
      state.reasons.push(
        "The plan would leave the portfolio without an operational strategy.",
      );
    }
  }

  private evaluateValidationWarnings(
    input: DecisionGovernanceRequest,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const warningCount = input.plan.warnings.length;
    const passed =
      !safety.rejectOnValidationWarning || warningCount === 0;

    this.addRule(state, {
      ruleId: "validation-warning-policy",
      ruleName: "Validation warning policy",
      passed,
      blocking: safety.rejectOnValidationWarning,
      message: passed
        ? "Plan warnings satisfy policy."
        : "Plan warnings are prohibited by safety policy.",
      evaluatedValue: warningCount,
      expectedValue: safety.rejectOnValidationWarning ? 0 : "allowed",
    });

    if (!passed) {
      state.rejectionFailure = true;
      state.reasons.push(
        "Safety policy rejects plans containing validation warnings.",
      );
    }

    state.warnings.push(...input.plan.warnings);
  }

  private evaluateActions(
    input: DecisionGovernanceRequest,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    for (const action of [...input.plan.actions].sort(compareActions)) {
      this.evaluateActionType(action, policy, state);
      this.evaluateActionApproval(action, policy, safety, state);
      this.evaluateActionRollback(action, safety, state);
      this.evaluateActionConfidence(action, policy, safety, state);
      this.evaluateActionExpiry(action, input.generatedAt, state);
    }
  }

  private evaluateActionType(
    action: DecisionAction,
    policy: DecisionGovernancePolicy,
    state: EvaluationState,
  ): void {
    const prohibited = policy.prohibitedActionTypes.includes(action.type);
    this.addRule(state, {
      ruleId: `action-${action.actionId}-not-prohibited`,
      ruleName: `Action ${action.type} is permitted`,
      passed: !prohibited,
      blocking: this.rejectProhibitedActions,
      message: prohibited
        ? `Action type ${action.type} is prohibited.`
        : `Action type ${action.type} is not prohibited.`,
      evaluatedValue: action.type,
      expectedValue: "not prohibited",
    });

    if (prohibited) {
      state.rejectedActionIds.add(action.actionId);
      state.reasons.push(
        `Action ${action.actionId} uses prohibited type ${action.type}.`,
      );
      if (this.rejectProhibitedActions) {
        state.rejectionFailure = true;
      }
      return;
    }

    const restricted = policy.restrictedActionTypes.includes(action.type);
    if (restricted && this.restrictRestrictedActions) {
      state.restrictedActionIds.add(action.actionId);
      state.restrictions.push(
        `Action ${action.actionId} of type ${action.type} is restricted by governance policy.`,
      );
    }
  }

  private evaluateActionApproval(
    action: DecisionAction,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const requiresByType =
      policy.humanApprovalActionTypes.includes(action.type);
    const requiresPromotion =
      action.type === "PROMOTE_STRATEGY" &&
      safety.requireHumanApprovalForPromotion;
    const requiresRetirement =
      action.type === "RETIRE_STRATEGY" &&
      safety.requireHumanApprovalForRetirement;

    const requiresHumanApproval =
      requiresByType || requiresPromotion || requiresRetirement;

    this.addRule(state, {
      ruleId: `action-${action.actionId}-approval`,
      ruleName: `Approval requirement for ${action.type}`,
      passed: !requiresHumanApproval,
      blocking: false,
      message: requiresHumanApproval
        ? `Action ${action.actionId} requires human approval.`
        : `Action ${action.actionId} does not require explicit human approval.`,
      evaluatedValue: requiresHumanApproval,
      expectedValue: false,
    });

    if (requiresHumanApproval) {
      state.restrictedActionIds.add(action.actionId);
      this.escalateApproval(
        state,
        "HUMAN_OPERATOR",
        policy.requiredApproverRoles,
      );
      state.restrictions.push(
        `Action ${action.actionId} requires human approval before execution.`,
      );
    }
  }

  private evaluateActionRollback(
    action: DecisionAction,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const liveAction =
      action.expectedRiskDelta > EPSILON ||
      action.targetCapital !== undefined ||
      action.targetWeight !== undefined;
    const required =
      safety.requireRollbackForLiveActions &&
      (liveAction || this.requireRollbackForRiskIncreasingActions);
    const passed = !required || action.rollback.supported;

    this.addRule(state, {
      ruleId: `action-${action.actionId}-rollback`,
      ruleName: `Rollback support for ${action.type}`,
      passed,
      blocking: required,
      message: passed
        ? `Rollback requirements are satisfied for action ${action.actionId}.`
        : `Action ${action.actionId} lacks required rollback support.`,
      evaluatedValue: action.rollback.supported,
      expectedValue: required,
    });

    if (!passed) {
      state.rejectedActionIds.add(action.actionId);
      state.rejectionFailure = true;
      state.reasons.push(
        `Action ${action.actionId} lacks required rollback support.`,
      );
    }
  }

  private evaluateActionConfidence(
    action: DecisionAction,
    policy: DecisionGovernancePolicy,
    safety: DecisionSafetyPolicy,
    state: EvaluationState,
  ): void {
    const required = Math.max(
      safety.minimumDecisionConfidence,
      policy.minimumAutonomousConfidence,
    );
    const passed = action.confidence + EPSILON >= required;

    this.addRule(state, {
      ruleId: `action-${action.actionId}-confidence`,
      ruleName: `Confidence for ${action.type}`,
      passed,
      blocking: true,
      message: passed
        ? `Action ${action.actionId} confidence meets policy.`
        : `Action ${action.actionId} confidence is below policy minimum.`,
      evaluatedValue: action.confidence,
      expectedValue: required,
    });

    if (!passed) {
      state.restrictedActionIds.add(action.actionId);
      state.restrictions.push(
        `Action ${action.actionId} requires review because confidence is below the autonomous threshold.`,
      );
      this.escalateApproval(
        state,
        "HUMAN_OPERATOR",
        policy.requiredApproverRoles,
      );
    }
  }

  private evaluateActionExpiry(
    action: DecisionAction,
    evaluatedAt: string,
    state: EvaluationState,
  ): void {
    const expired =
      action.expiresAt !== undefined &&
      Date.parse(action.expiresAt) < Date.parse(evaluatedAt);
    const passed = !expired;

    this.addRule(state, {
      ruleId: `action-${action.actionId}-not-expired`,
      ruleName: `Validity for ${action.type}`,
      passed,
      blocking: true,
      message: passed
        ? `Action ${action.actionId} is within its validity window.`
        : `Action ${action.actionId} has expired.`,
      ...(action.expiresAt === undefined
        ? {}
        : { evaluatedValue: action.expiresAt }),
      expectedValue: "not expired",
    });

    if (expired) {
      state.rejectedActionIds.add(action.actionId);
      state.rejectionFailure = true;
      state.reasons.push(
        `Action ${action.actionId} expired before governance evaluation.`,
      );
    }
  }

  private finalizeApprovedActions(
    input: DecisionGovernanceRequest,
    state: EvaluationState,
  ): void {
    for (const action of input.plan.actions) {
      if (
        state.rejectedActionIds.has(action.actionId) ||
        state.restrictedActionIds.has(action.actionId)
      ) {
        continue;
      }
      state.approvedActionIds.add(action.actionId);
    }

    if (
      state.restrictedActionIds.size > 0 &&
      state.approvalRequirement === "NONE"
    ) {
      state.approvalRequirement = "AUTOMATIC_POLICY";
    }
  }

  private determineDecision(
    input: DecisionGovernanceRequest,
    state: EvaluationState,
  ): GovernanceDecision {
    if (state.rejectionFailure || state.rejectedActionIds.size > 0) {
      return "REJECTED";
    }

    if (
      state.deferredFailure ||
      state.blockingFailure ||
      input.plan.decision === "HOLD"
    ) {
      return "DEFERRED";
    }

    if (
      state.approvalRequirement === "HUMAN_OPERATOR" ||
      state.approvalRequirement === "MULTI_PARTY" ||
      state.approvalRequirement === "RISK_ENGINE"
    ) {
      return "PENDING_APPROVAL";
    }

    if (
      state.restrictedActionIds.size > 0 ||
      state.restrictions.length > 0 ||
      input.plan.decision === "EXECUTE_WITH_RESTRICTIONS"
    ) {
      return "APPROVED_WITH_RESTRICTIONS";
    }

    return "APPROVED";
  }

  private escalateApproval(
    state: EvaluationState,
    requirement: GovernanceApprovalRequirement,
    roles: readonly string[],
  ): void {
    state.approvalRequirement = maxApprovalRequirement(
      state.approvalRequirement,
      requirement,
    );
    roles.forEach((role) => {
      if (role.trim().length > 0) {
        state.requiredApproverRoles.add(role);
      }
    });
  }

  private addRule(
    state: EvaluationState,
    rule: GovernanceRuleEvaluation,
  ): void {
    state.rules.push(Object.freeze({ ...rule }));
  }

  private assertRequest(
    input: DecisionGovernanceRequest,
  ): void {
    if (input === null || typeof input !== "object") {
      throw new GovernancePolicyEngineError(
        "Governance request is required.",
        "INVALID_REQUEST",
      );
    }

    nonEmpty(input.request.requestId, "request.requestId");
    nonEmpty(input.plan.planId, "plan.planId");
    nonEmpty(input.plan.portfolioId, "plan.portfolioId");
    validTimestamp(input.generatedAt, "generatedAt");

    if (
      input.request.requestId !== input.plan.requestId
    ) {
      throw new GovernancePolicyEngineError(
        "Plan requestId does not match governance request.",
        "REQUEST_ID_MISMATCH",
      );
    }

    if (
      input.request.portfolioId !== input.plan.portfolioId
    ) {
      throw new GovernancePolicyEngineError(
        "Plan portfolioId does not match governance request.",
        "PORTFOLIO_ID_MISMATCH",
      );
    }

    const actionIds = new Set<string>();
    for (const action of input.plan.actions) {
      nonEmpty(action.actionId, "action.actionId");
      if (actionIds.has(action.actionId)) {
        throw new GovernancePolicyEngineError(
          `Duplicate actionId: ${action.actionId}`,
          "DUPLICATE_ACTION_ID",
        );
      }
      actionIds.add(action.actionId);
      unitInterval(
        action.confidence,
        `action[${action.actionId}].confidence`,
      );
      finite(
        action.expectedRiskDelta,
        `action[${action.actionId}].expectedRiskDelta`,
      );
    }
  }
}

function maxApprovalRequirement(
  left: GovernanceApprovalRequirement,
  right: GovernanceApprovalRequirement,
): GovernanceApprovalRequirement {
  return approvalScore(left) >= approvalScore(right)
    ? left
    : right;
}

function approvalScore(
  requirement: GovernanceApprovalRequirement,
): number {
  switch (requirement) {
    case "NONE":
      return 0;
    case "AUTOMATIC_POLICY":
      return 1;
    case "RISK_ENGINE":
      return 2;
    case "HUMAN_OPERATOR":
      return 3;
    case "MULTI_PARTY":
      return 4;
    default: {
      const exhaustive: never = requirement;
      return exhaustive;
    }
  }
}

function compareActions(
  left: DecisionAction,
  right: DecisionAction,
): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return compareText(left.actionId, right.actionId);
}

function deterministicId(
  prefix: string,
  seed: string,
): DecisionIntelligenceId {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0)
    .toString(36)
    .padStart(7, "0")}`;
}

function uniqueStrings(
  values: readonly string[],
): readonly string[] {
  return [...new Set(values)]
    .filter((value) => value.trim().length > 0)
    .sort(compareText);
}

function compareText(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function format(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function nonEmpty(
  value: string,
  name: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new GovernancePolicyEngineError(
      `${name} must be a non-empty string.`,
      "INVALID_STRING",
    );
  }
  return value;
}

function finite(
  value: number,
  name: string,
): number {
  if (!Number.isFinite(value)) {
    throw new GovernancePolicyEngineError(
      `${name} must be finite.`,
      "INVALID_NUMBER",
    );
  }
  return value;
}

function unitInterval(
  value: number,
  name: string,
): number {
  finite(value, name);
  if (value < 0 || value > 1) {
    throw new GovernancePolicyEngineError(
      `${name} must be between 0 and 1.`,
      "INVALID_RANGE",
    );
  }
  return value;
}

function validTimestamp(
  value: string,
  name: string,
): string {
  nonEmpty(value, name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new GovernancePolicyEngineError(
      `${name} must be a valid timestamp.`,
      "INVALID_TIMESTAMP",
    );
  }
  return value;
}