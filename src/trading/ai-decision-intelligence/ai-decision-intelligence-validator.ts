/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 2:
 * src/trading/ai-decision-intelligence/ai-decision-intelligence-validator.ts
 *
 * Deterministic, side-effect-free validation for decision-intelligence
 * requests, execution plans, and completed run results.
 */

import {
  DECISION_CANDIDATE_TYPES,
  DECISION_INTELLIGENCE_RUN_STATUSES,
  STRATEGY_OPERATING_MODES,
  type DecisionAction,
  type DecisionCandidateScoringWeights,
  type DecisionConstraint,
  type DecisionExecutionPlan,
  type DecisionGovernancePolicy,
  type DecisionIntelligenceConfiguration,
  type DecisionIntelligenceRunRequest,
  type DecisionIntelligenceRunResult,
  type DecisionIntelligenceValidatorPort,
  type DecisionMarketContext,
  type DecisionOptimizationConstraints,
  type DecisionPortfolioSnapshot,
  type DecisionSafetyPolicy,
  type DecisionValidationIssue,
  type DecisionValidationResult,
  type StrategyDecisionState,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;

const EXECUTION_MODES = new Set([
  "DRY_RUN",
  "SIMULATED",
  "SHADOW",
  "LIVE_GUARDED",
  "LIVE_AUTONOMOUS",
] as const);

const EXPLAINABILITY_LEVELS = new Set([
  "SUMMARY",
  "STANDARD",
  "DETAILED",
  "AUDIT",
] as const);

const FAILURE_POLICIES = new Set([
  "STOP_PLAN",
  "CONTINUE_INDEPENDENT_ACTIONS",
  "ROLLBACK_PLAN",
  "ROLLBACK_ACTION",
  "ESCALATE",
] as const);

const DECISIONS = new Set([
  "EXECUTE",
  "EXECUTE_WITH_RESTRICTIONS",
  "HOLD",
  "DEFER",
  "REJECT",
] as const);

const PLAN_STATUSES = new Set([
  "NOT_STARTED",
  "QUEUED",
  "IN_PROGRESS",
  "PARTIALLY_COMPLETED",
  "COMPLETED",
  "CANCELLED",
  "ROLLED_BACK",
  "FAILED",
] as const);

const GOVERNANCE_REQUIREMENTS = new Set([
  "NONE",
  "AUTOMATIC_POLICY",
  "RISK_ENGINE",
  "HUMAN_OPERATOR",
  "MULTI_PARTY",
] as const);

export interface AiDecisionIntelligenceValidatorOptions {
  readonly rejectWarnings?: boolean;
  readonly timestampSkewToleranceMs?: number;
  readonly weightTolerance?: number;
}

export class AiDecisionIntelligenceValidationError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "AI_DECISION_INTELLIGENCE_VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "AiDecisionIntelligenceValidationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AiDecisionIntelligenceValidator
  implements DecisionIntelligenceValidatorPort
{
  private readonly rejectWarnings: boolean;
  private readonly timestampSkewToleranceMs: number;
  private readonly weightTolerance: number;

  public constructor(
    options: AiDecisionIntelligenceValidatorOptions = {},
  ) {
    this.rejectWarnings = options.rejectWarnings ?? false;
    this.timestampSkewToleranceMs = nonNegative(
      options.timestampSkewToleranceMs ?? 0,
    );
    this.weightTolerance = nonNegative(
      options.weightTolerance ?? 1e-8,
    );
  }

  public validateRequest(
    request: DecisionIntelligenceRunRequest,
  ): DecisionValidationResult {
    const issues: DecisionValidationIssue[] = [];

    if (!isObject(request)) {
      return invalidResult([
        issue(
          "INVALID_REQUEST",
          "",
          "Decision-intelligence request must be an object.",
          "ERROR",
          request,
        ),
      ]);
    }

    validateNonEmptyString(request.requestId, "requestId", issues);
    validateNonEmptyString(request.portfolioId, "portfolioId", issues);
    validateTimestamp(request.requestedAt, "requestedAt", issues);

    if (request.correlationId !== undefined) {
      validateNonEmptyString(
        request.correlationId,
        "correlationId",
        issues,
      );
    }

    this.validatePortfolio(request.portfolio, "portfolio", issues);
    this.validateMarketContexts(
      request.marketContexts,
      "marketContexts",
      issues,
    );
    this.validateStrategyStates(
      request.strategyStates,
      "strategyStates",
      issues,
    );
    this.validateRiskObservations(
      request.riskObservations,
      "riskObservations",
      issues,
    );
    this.validateSystemHealth(request.systemHealth, issues);
    this.validateConstraints(request.constraints, issues);
    this.validateConfiguration(request.configuration, issues);

    if (!Array.isArray(request.operatorDirectives)) {
      issues.push(
        issue(
          "INVALID_OPERATOR_DIRECTIVES",
          "operatorDirectives",
          "operatorDirectives must be an array.",
          "ERROR",
          request.operatorDirectives,
        ),
      );
    } else {
      request.operatorDirectives.forEach((directive, index) =>
        validateNonEmptyString(
          directive,
          `operatorDirectives[${index}]`,
          issues,
        ),
      );
    }

    if (!isRecord(request.metadata)) {
      issues.push(
        issue(
          "INVALID_METADATA",
          "metadata",
          "metadata must be a record.",
          "ERROR",
          request.metadata,
        ),
      );
    }

    this.validateCrossRequestInvariants(request, issues);

    return buildResult(issues, this.rejectWarnings);
  }

  public validatePlan(
    plan: DecisionExecutionPlan,
  ): DecisionValidationResult {
    const issues: DecisionValidationIssue[] = [];

    if (!isObject(plan)) {
      return invalidResult([
        issue(
          "INVALID_PLAN",
          "",
          "Decision execution plan must be an object.",
          "ERROR",
          plan,
        ),
      ]);
    }

    validateNonEmptyString(plan.planId, "planId", issues);
    validateNonEmptyString(plan.runId, "runId", issues);
    validateNonEmptyString(plan.portfolioId, "portfolioId", issues);
    validateTimestamp(plan.createdAt, "createdAt", issues);

    if (!DECISIONS.has(plan.decision)) {
      issues.push(
        issue(
          "INVALID_PLAN_DECISION",
          "decision",
          "decision contains an unsupported value.",
          "ERROR",
          plan.decision,
        ),
      );
    }

    if (!EXECUTION_MODES.has(plan.executionMode)) {
      issues.push(
        issue(
          "INVALID_PLAN_EXECUTION_MODE",
          "executionMode",
          "executionMode contains an unsupported value.",
          "ERROR",
          plan.executionMode,
        ),
      );
    }

    if (!FAILURE_POLICIES.has(plan.actions[0]?.failurePolicy ?? "STOP_PLAN" as never)) {
      issues.push(
        issue(
          "INVALID_FAILURE_POLICY",
          "failurePolicy",
          "failurePolicy contains an unsupported value.",
          "ERROR",
          plan.actions[0]?.failurePolicy ?? "STOP_PLAN",
        ),
      );
    }

    if (!Array.isArray(plan.actions)) {
      issues.push(
        issue(
          "INVALID_PLAN_ACTIONS",
          "actions",
          "actions must be an array.",
          "ERROR",
          plan.actions,
        ),
      );
    } else {
      const actionIds = new Set<string>();
      for (let index = 0; index < plan.actions.length; index += 1) {
        const action = plan.actions[index];
        this.validateAction(action, `actions[${index}]`, issues);

        if (isObject(action) && typeof action.actionId === "string") {
          if (actionIds.has(action.actionId)) {
            issues.push(
              issue(
                "DUPLICATE_ACTION_ID",
                `actions[${index}].actionId`,
                `Duplicate actionId '${action.actionId}'.`,
                "ERROR",
                action.actionId,
              ),
            );
          }
          actionIds.add(action.actionId);
        }
      }

      this.validateActionGraph(plan.actions, actionIds, issues);
    }

    if (!Array.isArray(plan.actions.map((action) => action.candidateId))) {
      issues.push(
        issue(
          "INVALID_SELECTED_CANDIDATES",
          "selectedCandidateIds",
          "selectedCandidateIds must be an array.",
          "ERROR",
          plan.actions.map((action) => action.candidateId),
        ),
      );
    } else {
      validateUniqueStrings(
        plan.actions.map((action) => action.candidateId),
        "selectedCandidateIds",
        issues,
      );
    }

    validateUnitInterval(plan.confidence, "confidence", issues);
    this.validatePlanMetrics(plan.metrics, issues);

    if (!Array.isArray(plan.safeguards)) {
      issues.push(
        issue(
          "INVALID_PRECONDITIONS",
          "preconditions",
          "preconditions must be an array.",
          "ERROR",
          plan.safeguards,
        ),
      );
    }

    if (!Array.isArray(plan.safeguards)) {
      issues.push(
        issue(
          "INVALID_POSTCONDITIONS",
          "postconditions",
          "postconditions must be an array.",
          "ERROR",
          plan.safeguards,
        ),
      );
    }

    if (!Array.isArray(plan.warnings)) {
      issues.push(
        issue(
          "INVALID_PLAN_WARNINGS",
          "warnings",
          "warnings must be an array.",
          "ERROR",
          plan.warnings,
        ),
      );
    }

    if (!isRecord(plan.metadata)) {
      issues.push(
        issue(
          "INVALID_PLAN_METADATA",
          "metadata",
          "metadata must be a record.",
          "ERROR",
          plan.metadata,
        ),
      );
    }

    if (
      (plan.decision === "HOLD" ||
        plan.decision === "DEFER" ||
        plan.decision === "REJECT") &&
      Array.isArray(plan.actions) &&
      plan.actions.length > 0
    ) {
      issues.push(
        issue(
          "NON_EXECUTABLE_DECISION_HAS_ACTIONS",
          "actions",
          `${plan.decision} plans must not contain executable actions.`,
          "ERROR",
          plan.actions.length,
        ),
      );
    }

    return buildResult(issues, this.rejectWarnings);
  }

  public validateResult(
    result: DecisionIntelligenceRunResult,
  ): DecisionValidationResult {
    const issues: DecisionValidationIssue[] = [];

    if (!isObject(result)) {
      return invalidResult([
        issue(
          "INVALID_RESULT",
          "",
          "Decision-intelligence result must be an object.",
          "ERROR",
          result,
        ),
      ]);
    }

    validateNonEmptyString(result.runId, "runId", issues);
    validateNonEmptyString(result.requestId, "requestId", issues);
    validateNonEmptyString(result.portfolioId, "portfolioId", issues);
    validateTimestamp(result.requestedAt, "requestedAt", issues);
    validateTimestamp(result.startedAt, "startedAt", issues);
    validateTimestamp(result.completedAt, "completedAt", issues);

    if (!DECISIONS.has(result.decision)) {
      issues.push(
        issue(
          "INVALID_RESULT_DECISION",
          "decision",
          "decision contains an unsupported value.",
          "ERROR",
          result.decision,
        ),
      );
    }

    if (result.status !== "COMPLETED" && result.status !== "DEFERRED") {
      issues.push(
        issue(
          "INVALID_RESULT_STATUS",
          "status",
          "Result status must be COMPLETED or DEFERRED.",
          "ERROR",
          result.status,
        ),
      );
    }

    this.validateTemporalOrder(
      result.requestedAt,
      result.startedAt,
      result.completedAt,
      issues,
    );

    const planValidation = this.validatePlan(result.executionPlan);
    issues.push(
      ...planValidation.issues.map((value) =>
        Object.freeze({
          ...value,
          path: value.path
            ? `executionPlan.${value.path}`
            : "executionPlan",
        }),
      ),
    );

    if (result.executionPlan.runId !== result.runId) {
      issues.push(
        issue(
          "RESULT_PLAN_RUN_MISMATCH",
          "executionPlan.runId",
          "executionPlan.runId must match result.runId.",
          "ERROR",
          result.executionPlan.runId,
        ),
      );
    }

    if (result.executionPlan.portfolioId !== result.portfolioId) {
      issues.push(
        issue(
          "RESULT_PLAN_PORTFOLIO_MISMATCH",
          "executionPlan.portfolioId",
          "executionPlan.portfolioId must match result.portfolioId.",
          "ERROR",
          result.executionPlan.portfolioId,
        ),
      );
    }

    if (result.executionPlan.decision !== result.decision) {
      issues.push(
        issue(
          "RESULT_PLAN_DECISION_MISMATCH",
          "executionPlan.decision",
          "executionPlan.decision must match result.decision.",
          "ERROR",
          result.executionPlan.decision,
        ),
      );
    }

    validateUnitInterval(
      result.confidence.score,
      "confidence.overall",
      issues,
    );

    if (!Array.isArray(result.candidates)) {
      issues.push(
        issue(
          "INVALID_RESULT_CANDIDATES",
          "candidates",
          "candidates must be an array.",
          "ERROR",
          result.candidates,
        ),
      );
    } else {
      const candidateIds = result.candidates.map(
        (candidate) => candidate.candidateId,
      );
      validateUniqueStrings(candidateIds, "candidates", issues);

      for (let index = 0; index < result.candidates.length; index += 1) {
        const candidate = result.candidates[index];
        if (!DECISION_CANDIDATE_TYPES.includes(candidate.type)) {
          issues.push(
            issue(
              "INVALID_CANDIDATE_TYPE",
              `candidates[${index}].type`,
              "Candidate type is unsupported.",
              "ERROR",
              candidate.type,
            ),
          );
        }
        validateUnitInterval(
          candidate.score,
          `candidates[${index}].score`,
          issues,
        );
      }
    }

    if (!Array.isArray(result.selectedCandidateIds)) {
      issues.push(
        issue(
          "INVALID_SELECTED_CANDIDATE_IDS",
          "selectedCandidateIds",
          "selectedCandidateIds must be an array.",
          "ERROR",
          result.selectedCandidateIds,
        ),
      );
    } else {
      validateUniqueStrings(
        result.selectedCandidateIds,
        "selectedCandidateIds",
        issues,
      );

      const available = new Set(
        Array.isArray(result.candidates)
          ? result.candidates.map((candidate) => candidate.candidateId)
          : [],
      );

      result.selectedCandidateIds.forEach((candidateId, index) => {
        if (!available.has(candidateId)) {
          issues.push(
            issue(
              "UNKNOWN_SELECTED_CANDIDATE",
              `selectedCandidateIds[${index}]`,
              `Selected candidate '${candidateId}' is not present in candidates.`,
              "ERROR",
              candidateId,
            ),
          );
        }
      });
    }

    if (!Array.isArray(result.warnings)) {
      issues.push(
        issue(
          "INVALID_RESULT_WARNINGS",
          "warnings",
          "warnings must be an array.",
          "ERROR",
          result.warnings,
        ),
      );
    }

    if (!isRecord(result.metadata)) {
      issues.push(
        issue(
          "INVALID_RESULT_METADATA",
          "metadata",
          "metadata must be a record.",
          "ERROR",
          result.metadata,
        ),
      );
    }

    return buildResult(issues, this.rejectWarnings);
  }

  private validatePortfolio(
    portfolio: DecisionPortfolioSnapshot,
    path: string,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(portfolio)) {
      issues.push(
        issue(
          "INVALID_PORTFOLIO",
          path,
          "portfolio must be an object.",
          "ERROR",
          portfolio,
        ),
      );
      return;
    }

    validateNonEmptyString(
      portfolio.portfolioId,
      `${path}.portfolioId`,
      issues,
    );
    validateTimestamp(portfolio.capturedAt, `${path}.timestamp`, issues);
    validateFinite(portfolio.totalEquity, `${path}.equity`, issues);
    validateFinite(portfolio.reservedCapital, `${path}.cash`, issues);
    validateFinite(
      portfolio.availableCapital,
      `${path}.availableCapital`,
      issues,
    );
    validateFinite(
      portfolio.grossExposure,
      `${path}.grossExposure`,
      issues,
    );
    validateFinite(
      portfolio.netExposure,
      `${path}.netExposure`,
      issues,
    );
    validateNonNegative(portfolio.leverage, `${path}.leverage`, issues);
    validateUnitInterval(
      portfolio.portfolioRiskScore,
      `${path}.currentRiskScore`,
      issues,
    );
    validateUnitInterval(
      portfolio.remainingRiskBudget,
      `${path}.remainingRiskBudget`,
      issues,
    );

    if (!Array.isArray(portfolio.positions)) {
      issues.push(
        issue(
          "INVALID_PORTFOLIO_POSITIONS",
          `${path}.positions`,
          "positions must be an array.",
          "ERROR",
          portfolio.positions,
        ),
      );
    }

    if (!isRecord(portfolio.strategyWeights)) {
      issues.push(
        issue(
          "INVALID_STRATEGY_WEIGHTS",
          `${path}.strategyWeights`,
          "strategyWeights must be a record.",
          "ERROR",
          portfolio.strategyWeights,
        ),
      );
    } else {
      let total = 0;
      for (const [strategyId, weight] of Object.entries(
        portfolio.strategyWeights,
      )) {
        validateNonEmptyString(
          strategyId,
          `${path}.strategyWeights`,
          issues,
        );
        validateUnitInterval(
          weight,
          `${path}.strategyWeights.${strategyId}`,
          issues,
        );
        if (Number.isFinite(weight)) total += weight;
      }

      if (total > 1 + this.weightTolerance) {
        issues.push(
          issue(
            "STRATEGY_WEIGHT_TOTAL_EXCEEDS_ONE",
            `${path}.strategyWeights`,
            "Strategy weights must not total more than 1.",
            "ERROR",
            total,
          ),
        );
      }
    }

    validateUnitInterval(
      safeDivide(portfolio.reservedCapital, portfolio.totalEquity),
      `${path}.reserveWeight`,
      issues,
    );
  }

  private validateMarketContexts(
    contexts: readonly DecisionMarketContext[],
    path: string,
    issues: DecisionValidationIssue[],
  ): void {
    if (!Array.isArray(contexts)) {
      issues.push(
        issue(
          "INVALID_MARKET_CONTEXTS",
          path,
          "marketContexts must be an array.",
          "ERROR",
          contexts,
        ),
      );
      return;
    }

    const keys = new Set<string>();

    contexts.forEach((context, index) => {
      const itemPath = `${path}[${index}]`;
      if (!isObject(context)) {
        issues.push(
          issue(
            "INVALID_MARKET_CONTEXT",
            itemPath,
            "Market context must be an object.",
            "ERROR",
            context,
          ),
        );
        return;
      }

      validateNonEmptyString(context.contextId, `${itemPath}.contextId`, issues);
      validateTimestamp(context.capturedAt, `${itemPath}.timestamp`, issues);
      validateNonEmptyString(context.symbol ?? "GLOBAL", `${itemPath}.symbol`, issues);
      validateNonEmptyString(
        context.timeframe ?? "GLOBAL",
        `${itemPath}.timeframe`,
        issues,
      );
      validateUnitInterval(
        context.regimeConfidence,
        `${itemPath}.regimeConfidence`,
        issues,
      );
      validateUnitInterval(
        context.dataQualityScore,
        `${itemPath}.dataQualityScore`,
        issues,
      );
      validateUnitInterval(
        context.liquidityScore,
        `${itemPath}.liquidityScore`,
        issues,
      );
      validateNonNegative(
        context.volatilityScore,
        `${itemPath}.realizedVolatility`,
        issues,
      );

      const key = `${context.symbol}::${context.timeframe}`;
      if (keys.has(key)) {
        issues.push(
          issue(
            "DUPLICATE_MARKET_CONTEXT",
            itemPath,
            `Duplicate market context for '${key}'.`,
            "ERROR",
            key,
          ),
        );
      }
      keys.add(key);
    });
  }

  private validateStrategyStates(
    states: readonly StrategyDecisionState[],
    path: string,
    issues: DecisionValidationIssue[],
  ): void {
    if (!Array.isArray(states)) {
      issues.push(
        issue(
          "INVALID_STRATEGY_STATES",
          path,
          "strategyStates must be an array.",
          "ERROR",
          states,
        ),
      );
      return;
    }

    const ids = new Set<string>();

    states.forEach((state, index) => {
      const itemPath = `${path}[${index}]`;
      if (!isObject(state)) {
        issues.push(
          issue(
            "INVALID_STRATEGY_STATE",
            itemPath,
            "Strategy state must be an object.",
            "ERROR",
            state,
          ),
        );
        return;
      }

      const typedState = state as unknown as StrategyDecisionState;

      validateNonEmptyString(
        typedState.strategy.strategyId,
        `${itemPath}.strategy.strategyId`,
        issues,
      );
      if (typedState.lastTransitionAt !== undefined) {
        validateTimestamp(typedState.lastTransitionAt, `${itemPath}.lastTransitionAt`, issues);
      }

      if (!STRATEGY_OPERATING_MODES.includes(typedState.operatingMode as never)) {
        issues.push(
          issue(
            "INVALID_STRATEGY_OPERATING_MODE",
            `${itemPath}.operatingMode`,
            "operatingMode contains an unsupported value.",
            "ERROR",
            typedState.operatingMode,
          ),
        );
      }

      validateUnitInterval(
        typedState.currentWeight,
        `${itemPath}.currentWeight`,
        issues,
      );
      validateUnitInterval(
        typedState.healthScore,
        `${itemPath}.healthScore`,
        issues,
      );
      validateUnitInterval(
        typedState.confidence,
        `${itemPath}.confidence`,
        issues,
      );

      if (ids.has(typedState.strategy.strategyId)) {
        issues.push(
          issue(
            "DUPLICATE_STRATEGY_STATE",
            `${itemPath}.strategyId`,
            `Duplicate strategy state '${typedState.strategy.strategyId}'.`,
            "ERROR",
            typedState.strategy.strategyId,
          ),
        );
      }
      ids.add(typedState.strategy.strategyId);
    });
  }

  private validateRiskObservations(
    observations: DecisionIntelligenceRunRequest["riskObservations"],
    path: string,
    issues: DecisionValidationIssue[],
  ): void {
    if (!Array.isArray(observations)) {
      issues.push(
        issue(
          "INVALID_RISK_OBSERVATIONS",
          path,
          "riskObservations must be an array.",
          "ERROR",
          observations,
        ),
      );
      return;
    }

    observations.forEach((observation, index) => {
      const itemPath = `${path}[${index}]`;
      validateNonEmptyString(
        observation.strategyId,
        `${itemPath}.strategyId`,
        issues,
      );
      validateTimestamp(
        observation.timestamp,
        `${itemPath}.timestamp`,
        issues,
      );
      validateUnitInterval(
        observation.riskScore,
        `${itemPath}.riskScore`,
        issues,
      );
      validateUnitInterval(
        observation.remainingRiskBudget,
        `${itemPath}.remainingRiskBudget`,
        issues,
      );
    });
  }

  private validateSystemHealth(
    health: DecisionIntelligenceRunRequest["systemHealth"],
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(health)) {
      issues.push(
        issue(
          "INVALID_SYSTEM_HEALTH",
          "systemHealth",
          "systemHealth must be an object.",
          "ERROR",
          health,
        ),
      );
      return;
    }

    validateNonEmptyString("system-health", "systemHealth.snapshotId", issues);
    validateTimestamp(health.capturedAt, "systemHealth.capturedAt", issues);
    validateUnitInterval(
      health.overallHealthScore,
      "systemHealth.overallHealthScore",
      issues,
    );
    validateUnitInterval(
      health.marketDataHealthy ? 1 : 0,
      "systemHealth.marketDataHealth",
      issues,
    );
    validateUnitInterval(
      health.riskEngineHealthy ? 1 : 0,
      "systemHealth.riskEngineHealth",
      issues,
    );
    validateUnitInterval(
      health.executionEngineHealthy ? 1 : 0,
      "systemHealth.executionEngineHealth",
      issues,
    );
    validateUnitInterval(
      health.metaLearningHealthy ? 1 : 0,
      "systemHealth.metaLearningHealth",
      issues,
    );
  }

  private validateConstraints(
    constraints: readonly DecisionConstraint[],
    issues: DecisionValidationIssue[],
  ): void {
    if (!Array.isArray(constraints)) {
      issues.push(
        issue(
          "INVALID_CONSTRAINTS",
          "constraints",
          "constraints must be an array.",
          "ERROR",
          constraints,
        ),
      );
      return;
    }

    const ids = new Set<string>();

    constraints.forEach((constraint, index) => {
      const path = `constraints[${index}]`;
      if (!isObject(constraint)) {
        issues.push(
          issue(
            "INVALID_CONSTRAINT",
            path,
            "Constraint must be an object.",
            "ERROR",
            constraint,
          ),
        );
        return;
      }

      const typedConstraint = constraint as unknown as DecisionConstraint;

      validateNonEmptyString(
        typedConstraint.constraintId,
        `${path}.constraintId`,
        issues,
      );
      validateNonEmptyString(
        typedConstraint.name,
        `${path}.name`,
        issues,
      );

      if (ids.has(typedConstraint.constraintId)) {
        issues.push(
          issue(
            "DUPLICATE_CONSTRAINT_ID",
            `${path}.constraintId`,
            `Duplicate constraintId '${typedConstraint.constraintId}'.`,
            "ERROR",
            typedConstraint.constraintId,
          ),
        );
      }
      ids.add(typedConstraint.constraintId);
    });
  }

  private validateConfiguration(
    configuration: DecisionIntelligenceConfiguration,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(configuration)) {
      issues.push(
        issue(
          "INVALID_CONFIGURATION",
          "configuration",
          "configuration must be an object.",
          "ERROR",
          configuration,
        ),
      );
      return;
    }

    if (!EXECUTION_MODES.has(configuration.executionMode)) {
      issues.push(
        issue(
          "INVALID_EXECUTION_MODE",
          "configuration.executionMode",
          "executionMode contains an unsupported value.",
          "ERROR",
          configuration.executionMode,
        ),
      );
    }

    if (!EXPLAINABILITY_LEVELS.has(configuration.explainabilityLevel)) {
      issues.push(
        issue(
          "INVALID_EXPLAINABILITY_LEVEL",
          "configuration.explainabilityLevel",
          "explainabilityLevel contains an unsupported value.",
          "ERROR",
          configuration.explainabilityLevel,
        ),
      );
    }

    this.validateScoringWeights(configuration.scoringWeights, issues);
    this.validateOptimizationConstraints(
      configuration.optimizationConstraints,
      issues,
    );
    this.validateSafetyPolicy(configuration.safetyPolicy, issues);
    this.validateGovernancePolicy(configuration.governancePolicy, issues);

    validateUnitInterval(
      configuration.minimumCandidateScore,
      "configuration.minimumCandidateScore",
      issues,
    );
    validateUnitInterval(
      configuration.conflictResolutionTolerance,
      "configuration.conflictResolutionTolerance",
      issues,
    );
    validatePositive(
      configuration.evidenceFreshnessHalfLifeMs,
      "configuration.evidenceFreshnessHalfLifeMs",
      issues,
    );
  }

  private validateScoringWeights(
    weights: DecisionCandidateScoringWeights,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(weights)) {
      issues.push(
        issue(
          "INVALID_SCORING_WEIGHTS",
          "configuration.scoringWeights",
          "scoringWeights must be an object.",
          "ERROR",
          weights,
        ),
      );
      return;
    }

    for (const [key, value] of Object.entries(weights) as [string, number][]) {
      validateNonNegative(
        value,
        `configuration.scoringWeights.${key}`,
        issues,
      );
    }

    const total = (Object.values(weights) as number[]).reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    );

    if (total <= EPSILON) {
      issues.push(
        issue(
          "ZERO_SCORING_WEIGHT_TOTAL",
          "configuration.scoringWeights",
          "At least one scoring weight must be greater than zero.",
          "ERROR",
          total,
        ),
      );
    }
  }

  private validateOptimizationConstraints(
    constraints: DecisionOptimizationConstraints,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(constraints)) {
      issues.push(
        issue(
          "INVALID_OPTIMIZATION_CONSTRAINTS",
          "configuration.optimizationConstraints",
          "optimizationConstraints must be an object.",
          "ERROR",
          constraints,
        ),
      );
      return;
    }

    validateUnitInterval(
      constraints.minimumStrategyWeight,
      "configuration.optimizationConstraints.minimumStrategyWeight",
      issues,
    );
    validateUnitInterval(
      constraints.maximumStrategyWeight,
      "configuration.optimizationConstraints.maximumStrategyWeight",
      issues,
    );
    validateUnitInterval(
      constraints.minimumReserveWeight,
      "configuration.optimizationConstraints.minimumReserveWeight",
      issues,
    );
    validateUnitInterval(
      constraints.maximumPortfolioTurnover,
      "configuration.optimizationConstraints.maximumPortfolioTurnover",
      issues,
    );
    validateUnitInterval(
      constraints.maximumWeightChangePerStrategy,
      "configuration.optimizationConstraints.maximumWeightChangePerStrategy",
      issues,
    );
    validatePositiveInteger(
      constraints.maximumSelectedCandidates,
      "configuration.optimizationConstraints.maximumSelectedCandidates",
      issues,
    );
    validatePositiveInteger(
      constraints.maximumConcurrentActions,
      "configuration.optimizationConstraints.maximumConcurrentActions",
      issues,
    );
    validateNonNegative(
      constraints.maximumGrossExposure,
      "configuration.optimizationConstraints.maximumGrossExposure",
      issues,
    );
    validateNonNegative(
      constraints.maximumNetExposure,
      "configuration.optimizationConstraints.maximumNetExposure",
      issues,
    );
    validateNonNegative(
      constraints.maximumLeverage,
      "configuration.optimizationConstraints.maximumLeverage",
      issues,
    );
    validateUnitInterval(
      constraints.maximumRiskScore,
      "configuration.optimizationConstraints.maximumRiskScore",
      issues,
    );

    if (
      constraints.minimumStrategyWeight >
      constraints.maximumStrategyWeight
    ) {
      issues.push(
        issue(
          "INVALID_STRATEGY_WEIGHT_RANGE",
          "configuration.optimizationConstraints",
          "minimumStrategyWeight cannot exceed maximumStrategyWeight.",
          "ERROR",
          constraints,
        ),
      );
    }
  }

  private validateSafetyPolicy(
    policy: DecisionSafetyPolicy,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(policy)) {
      issues.push(
        issue(
          "INVALID_SAFETY_POLICY",
          "configuration.safetyPolicy",
          "safetyPolicy must be an object.",
          "ERROR",
          policy,
        ),
      );
      return;
    }

    validateUnitInterval(
      policy.minimumDecisionConfidence,
      "configuration.safetyPolicy.minimumDecisionConfidence",
      issues,
    );
    validateUnitInterval(
      policy.minimumDataQualityScore,
      "configuration.safetyPolicy.minimumDataQualityScore",
      issues,
    );
    validateUnitInterval(
      policy.maximumAllowedRiskIncrease,
      "configuration.safetyPolicy.maximumAllowedRiskIncrease",
      issues,
    );
    validateUnitInterval(
      policy.maximumPortfolioTurnover,
      "configuration.safetyPolicy.maximumPortfolioTurnover",
      issues,
    );
    validatePositiveInteger(
      policy.maximumStrategiesChangedPerRun,
      "configuration.safetyPolicy.maximumStrategiesChangedPerRun",
      issues,
    );
    validateUnitInterval(
      policy.maximumCapitalReallocatedPerRun,
      "configuration.safetyPolicy.maximumCapitalReallocatedPerRun",
      issues,
    );
    validatePositive(
      policy.maximumMarketContextAgeMs,
      "configuration.safetyPolicy.maximumMarketContextAgeMs",
      issues,
    );
  }

  private validateGovernancePolicy(
    policy: DecisionGovernancePolicy,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(policy)) {
      issues.push(
        issue(
          "INVALID_GOVERNANCE_POLICY",
          "configuration.governancePolicy",
          "governancePolicy must be an object.",
          "ERROR",
          policy,
        ),
      );
      return;
    }

    if (!GOVERNANCE_REQUIREMENTS.has(policy.defaultApprovalRequirement)) {
      issues.push(
        issue(
          "INVALID_APPROVAL_REQUIREMENT",
          "configuration.governancePolicy.defaultApprovalRequirement",
          "defaultApprovalRequirement contains an unsupported value.",
          "ERROR",
          policy.defaultApprovalRequirement,
        ),
      );
    }

    validateUnitInterval(
      policy.minimumAutonomousConfidence,
      "configuration.governancePolicy.minimumAutonomousConfidence",
      issues,
    );
    validateUnitInterval(
      policy.maximumAutonomousRiskIncrease,
      "configuration.governancePolicy.maximumAutonomousRiskIncrease",
      issues,
    );
    validateUnitInterval(
      policy.maximumAutonomousTurnover,
      "configuration.governancePolicy.maximumAutonomousTurnover",
      issues,
    );
    validatePositive(
      policy.approvalTimeoutMs,
      "configuration.governancePolicy.approvalTimeoutMs",
      issues,
    );

    validateActionTypeList(
      policy.restrictedActionTypes,
      "configuration.governancePolicy.restrictedActionTypes",
      issues,
    );
    validateActionTypeList(
      policy.prohibitedActionTypes,
      "configuration.governancePolicy.prohibitedActionTypes",
      issues,
    );
    validateActionTypeList(
      policy.humanApprovalActionTypes,
      "configuration.governancePolicy.humanApprovalActionTypes",
      issues,
    );
  }

  private validateCrossRequestInvariants(
    request: DecisionIntelligenceRunRequest,
    issues: DecisionValidationIssue[],
  ): void {
    if (
      isObject(request.portfolio) &&
      request.portfolio.portfolioId !== request.portfolioId
    ) {
      issues.push(
        issue(
          "PORTFOLIO_ID_MISMATCH",
          "portfolio.portfolioId",
          "portfolio.portfolioId must match request.portfolioId.",
          "ERROR",
          request.portfolio.portfolioId,
        ),
      );
    }

    const requestTime = parseTimestamp(request.requestedAt);
    const portfolioTime = parseTimestamp(request.portfolio?.capturedAt);

    if (
      requestTime !== undefined &&
      portfolioTime !== undefined &&
      portfolioTime > requestTime + this.timestampSkewToleranceMs
    ) {
      issues.push(
        issue(
          "PORTFOLIO_FROM_FUTURE",
          "portfolio.capturedAt",
          "Portfolio timestamp cannot be later than requestedAt.",
          "ERROR",
          request.portfolio.capturedAt,
        ),
      );
    }

    const stateIds = new Set(
      Array.isArray(request.strategyStates)
        ? request.strategyStates.map((state) => state.strategy.strategyId)
        : [],
    );

    if (isRecord(request.portfolio?.strategyWeights)) {
      for (const strategyId of Object.keys(
        request.portfolio.strategyWeights,
      )) {
        if (!stateIds.has(strategyId)) {
          issues.push(
            issue(
              "MISSING_STRATEGY_STATE",
              `portfolio.strategyWeights.${strategyId}`,
              `No strategy state exists for weighted strategy '${strategyId}'.`,
              "WARNING",
              strategyId,
            ),
          );
        }
      }
    }
  }

  private validateAction(
    action: DecisionAction,
    path: string,
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(action)) {
      issues.push(
        issue(
          "INVALID_ACTION",
          path,
          "Action must be an object.",
          "ERROR",
          action,
        ),
      );
      return;
    }

    validateNonEmptyString(action.actionId, `${path}.actionId`, issues);
    validateNonEmptyString(
      action.candidateId,
      `${path}.candidateId`,
      issues,
    );

    if (!DECISION_CANDIDATE_TYPES.includes(action.type)) {
      issues.push(
        issue(
          "INVALID_ACTION_TYPE",
          `${path}.type`,
          "Action type is unsupported.",
          "ERROR",
          action.type,
        ),
      );
    }

    validatePositiveInteger(action.sequence, `${path}.sequence`, issues);
    validateUnitInterval(
      action.confidence,
      `${path}.confidence`,
      issues,
    );

    if (!Array.isArray(action.dependsOnActionIds)) {
      issues.push(
        issue(
          "INVALID_ACTION_DEPENDENCIES",
          `${path}.dependsOnActionIds`,
          "dependsOnActionIds must be an array.",
          "ERROR",
          action.dependsOnActionIds,
        ),
      );
    } else {
      validateUniqueStrings(
        action.dependsOnActionIds,
        `${path}.dependsOnActionIds`,
        issues,
      );
      if (action.dependsOnActionIds.includes(action.actionId)) {
        issues.push(
          issue(
            "SELF_DEPENDENT_ACTION",
            `${path}.dependsOnActionIds`,
            "An action cannot depend on itself.",
            "ERROR",
            action.actionId,
          ),
        );
      }
    }

    if (
      action.rollback.supported &&
      action.rollback.actionType === undefined
    ) {
      issues.push(
        issue(
          "INCOMPLETE_ROLLBACK",
          `${path}.rollback`,
          "A supported rollback must define actionType.",
          "ERROR",
          action.rollback,
        ),
      );
    }
  }

  private validateActionGraph(
    actions: readonly DecisionAction[],
    actionIds: ReadonlySet<string>,
    issues: DecisionValidationIssue[],
  ): void {
    const sequenceIds = new Set<number>();

    actions.forEach((action, index) => {
      if (sequenceIds.has(action.sequence)) {
        issues.push(
          issue(
            "DUPLICATE_ACTION_SEQUENCE",
            `actions[${index}].sequence`,
            `Duplicate action sequence '${action.sequence}'.`,
            "WARNING",
            action.sequence,
          ),
        );
      }
      sequenceIds.add(action.sequence);

      action.dependsOnActionIds.forEach((dependencyId, dependencyIndex) => {
        if (!actionIds.has(dependencyId)) {
          issues.push(
            issue(
              "UNKNOWN_ACTION_DEPENDENCY",
              `actions[${index}].dependsOnActionIds[${dependencyIndex}]`,
              `Unknown action dependency '${dependencyId}'.`,
              "ERROR",
              dependencyId,
            ),
          );
        }
      });
    });

    const graph = new Map<string, readonly string[]>(
      actions.map((action) => [
        action.actionId,
        action.dependsOnActionIds,
      ]),
    );

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (actionId: string): boolean => {
      if (visiting.has(actionId)) return true;
      if (visited.has(actionId)) return false;

      visiting.add(actionId);
      for (const dependencyId of graph.get(actionId) ?? []) {
        if (visit(dependencyId)) return true;
      }
      visiting.delete(actionId);
      visited.add(actionId);
      return false;
    };

    for (const actionId of graph.keys()) {
      if (visit(actionId)) {
        issues.push(
          issue(
            "CYCLIC_ACTION_DEPENDENCY",
            "actions",
            "Action dependencies contain a cycle.",
            "ERROR",
            actionId,
          ),
        );
        break;
      }
    }
  }

  private validatePlanMetrics(
    metrics: DecisionExecutionPlan["metrics"],
    issues: DecisionValidationIssue[],
  ): void {
    if (!isObject(metrics)) {
      issues.push(
        issue(
          "INVALID_PLAN_METRICS",
          "metrics",
          "metrics must be an object.",
          "ERROR",
          metrics,
        ),
      );
      return;
    }

    validateUnitInterval(
      metrics.expectedTurnover,
      "metrics.expectedTurnover",
      issues,
    );
    validateUnitInterval(
      Math.max(0, metrics.expectedRiskDelta),
      "Math.max(0, metrics.expectedRiskDelta)",
      issues,
    );
    validateUnitInterval(
      Math.abs(metrics.expectedCapitalChange),
      "Math.abs(metrics.expectedCapitalChange)",
      issues,
    );
    validateUnitInterval(
      metrics.confidence,
      "metrics.confidence",
      issues,
    );
    validateNonNegative(
      metrics.expectedCost,
      "metrics.expectedCost",
      issues,
    );
  }

  private validateTemporalOrder(
    requestedAt: string,
    startedAt: string,
    completedAt: string,
    issues: DecisionValidationIssue[],
  ): void {
    const requested = parseTimestamp(requestedAt);
    const started = parseTimestamp(startedAt);
    const completed = parseTimestamp(completedAt);

    if (
      requested !== undefined &&
      started !== undefined &&
      started + this.timestampSkewToleranceMs < requested
    ) {
      issues.push(
        issue(
          "START_PRECEDES_REQUEST",
          "startedAt",
          "startedAt cannot precede requestedAt.",
          "ERROR",
          startedAt,
        ),
      );
    }

    if (
      started !== undefined &&
      completed !== undefined &&
      completed + this.timestampSkewToleranceMs < started
    ) {
      issues.push(
        issue(
          "COMPLETION_PRECEDES_START",
          "completedAt",
          "completedAt cannot precede startedAt.",
          "ERROR",
          completedAt,
        ),
      );
    }
  }
}

export function createAiDecisionIntelligenceValidator(
  options: AiDecisionIntelligenceValidatorOptions = {},
): AiDecisionIntelligenceValidator {
  return new AiDecisionIntelligenceValidator(options);
}

function validateActionTypeList(
  values: readonly string[],
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (!Array.isArray(values)) {
    issues.push(
      issue(
        "INVALID_ACTION_TYPE_LIST",
        path,
        `${path} must be an array.`,
        "ERROR",
        values,
      ),
    );
    return;
  }

  validateUniqueStrings(values, path, issues);

  values.forEach((value, index) => {
    if (
      value === "NO_ACTION" ||
      !DECISION_CANDIDATE_TYPES.includes(
        value as (typeof DECISION_CANDIDATE_TYPES)[number],
      )
    ) {
      issues.push(
        issue(
          "INVALID_ACTION_TYPE",
          `${path}[${index}]`,
          "Unsupported executable action type.",
          "ERROR",
          value,
        ),
      );
    }
  });
}

function validateUniqueStrings(
  values: readonly string[],
  path: string,
  issues: DecisionValidationIssue[],
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    validateNonEmptyString(value, `${path}[${index}]`, issues);
    if (seen.has(value)) {
      issues.push(
        issue(
          "DUPLICATE_VALUE",
          `${path}[${index}]`,
          `Duplicate value '${value}'.`,
          "ERROR",
          value,
        ),
      );
    }
    seen.add(value);
  });
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(
      issue(
        "INVALID_NON_EMPTY_STRING",
        path,
        `${path || "value"} must be a non-empty string.`,
        "ERROR",
        value,
      ),
    );
  }
}

function validateTimestamp(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    issues.push(
      issue(
        "INVALID_TIMESTAMP",
        path,
        `${path} must be a valid timestamp.`,
        "ERROR",
        value,
      ),
    );
  }
}

function validateFinite(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(
      issue(
        "INVALID_FINITE_NUMBER",
        path,
        `${path} must be a finite number.`,
        "ERROR",
        value,
      ),
    );
  }
}

function validateNonNegative(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  validateFinite(value, path, issues);
  if (typeof value === "number" && Number.isFinite(value) && value < 0) {
    issues.push(
      issue(
        "NEGATIVE_NUMBER",
        path,
        `${path} must be non-negative.`,
        "ERROR",
        value,
      ),
    );
  }
}

function validatePositive(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  validateFinite(value, path, issues);
  if (typeof value === "number" && Number.isFinite(value) && value <= 0) {
    issues.push(
      issue(
        "NON_POSITIVE_NUMBER",
        path,
        `${path} must be greater than zero.`,
        "ERROR",
        value,
      ),
    );
  }
}

function validatePositiveInteger(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    issues.push(
      issue(
        "INVALID_POSITIVE_INTEGER",
        path,
        `${path} must be a positive integer.`,
        "ERROR",
        value,
      ),
    );
  }
}

function validateUnitInterval(
  value: unknown,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    issues.push(
      issue(
        "INVALID_UNIT_INTERVAL",
        path,
        `${path} must be between 0 and 1 inclusive.`,
        "ERROR",
        value,
      ),
    );
  }
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isObject(value);
}

function issue(
  code: string,
  path: string,
  message: string,
  severity: "ERROR" | "WARNING",
  receivedValue?: unknown,
): DecisionValidationIssue {
  return Object.freeze({
    code,
    path,
    message,
    severity,
    ...(receivedValue === undefined ? {} : { receivedValue }),
  });
}

function buildResult(
  issues: readonly DecisionValidationIssue[],
  rejectWarnings: boolean,
): DecisionValidationResult {
  const frozenIssues = Object.freeze(
    [...issues]
      .sort((left, right) => {
        const pathOrder = left.path.localeCompare(right.path);
        if (pathOrder !== 0) return pathOrder;
        const severityOrder =
          left.severity === right.severity
            ? 0
            : left.severity === "ERROR"
              ? -1
              : 1;
        if (severityOrder !== 0) return severityOrder;
        return left.code.localeCompare(right.code);
      })
      .map((value) => Object.freeze({ ...value })),
  );

  return Object.freeze({
    valid: !frozenIssues.some(
      (value) =>
        value.severity === "ERROR" ||
        (rejectWarnings && value.severity === "WARNING"),
    ),
    issues: frozenIssues,
  });
}

function invalidResult(
  issues: readonly DecisionValidationIssue[],
): DecisionValidationResult {
  return Object.freeze({
    valid: false,
    issues: Object.freeze(
      issues.map((value) => Object.freeze({ ...value })),
    ),
  });
}

function safeDivide(numerator: number, denominator: number): number {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && Math.abs(denominator) > EPSILON
    ? numerator / denominator
    : 0;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}