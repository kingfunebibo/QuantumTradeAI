/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 11:
 * src/trading/ai-decision-intelligence/ai-decision-intelligence-manager.ts
 *
 * Deterministic, immutable orchestration manager for the complete decision-
 * intelligence pipeline. The manager validates inputs, aggregates decision
 * context, builds and scores candidates, resolves conflicts, optimizes a plan,
 * applies governance, generates explainability, validates the final result,
 * publishes lifecycle events, persists outcomes, optionally executes approved
 * plans, and maintains an immutable operational snapshot.
 */

import {
  type AiDecisionIntelligenceManagerPort,
  type DecisionConfidenceAssessment,
  type DecisionConfidenceBand,
  type DecisionExecutionPlan,
  type DecisionIntelligenceDecision,
  type DecisionIntelligenceEvent,
  type DecisionIntelligenceExecutionOutcome,
  type DecisionIntelligenceId,
  type DecisionIntelligenceManagerDependencies,
  type DecisionIntelligenceManagerSnapshot,
  type DecisionIntelligenceRunFailure,
  type DecisionIntelligenceRunRequest,
  type DecisionIntelligenceRunResult,
  type DecisionIntelligenceRunStatus,
  type DecisionMetadata,
  type DecisionPlanExecutionResult,
  type DecisionValidationIssue,
  type DecisionValidationResult,
  type ScoredDecisionCandidate,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;
const SCORE_PRECISION = 12;

export interface AiDecisionIntelligenceManagerOptions {
  /**
   * Execute an eligible approved plan when a plan executor is configured.
   * Defaults to true. DRY_RUN plans are never dispatched.
   */
  readonly executeApprovedPlans?: boolean;

  /**
   * Treat event-publisher, persistence and snapshot-persistence failures as
   * pipeline failures. Defaults to false so observability infrastructure cannot
   * invalidate a deterministic decision that was already produced.
   */
  readonly failOnAuxiliaryError?: boolean;

  /**
   * Include validation warnings in successful run warnings. Defaults to true.
   */
  readonly includeValidationWarnings?: boolean;
}

export class AiDecisionIntelligenceManagerError extends Error {
  public readonly code: string;
  public readonly stage: DecisionIntelligenceRunStatus;
  public readonly retryable: boolean;
  public readonly causeValue?: unknown;

  public constructor(
    message: string,
    code = "AI_DECISION_INTELLIGENCE_MANAGER_ERROR",
    stage: DecisionIntelligenceRunStatus = "FAILED",
    retryable = false,
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "AiDecisionIntelligenceManagerError";
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
    this.causeValue = causeValue;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface MutableManagerStatistics {
  totalRuns: number;
  completedRuns: number;
  deferredRuns: number;
  rejectedRuns: number;
  failedRuns: number;
  executeDecisions: number;
  restrictedExecuteDecisions: number;
  holdDecisions: number;
  confidenceTotal: number;
  candidateCountTotal: number;
  selectedCandidateCountTotal: number;
  expectedTurnoverTotal: number;
  successfulOutcomeCount: number;
  lastRunAt?: string;
  lastCompletedRunAt?: string;
  lastDecision?: DecisionIntelligenceDecision;
  lastPlanId?: DecisionIntelligenceId;
}

interface RunState {
  readonly runId: DecisionIntelligenceId;
  readonly request: DecisionIntelligenceRunRequest;
  readonly startedAt: string;
  stage: DecisionIntelligenceRunStatus;
  readonly warnings: string[];
}

interface NormalizedError {
  readonly code: string;
  readonly message: string;
  readonly stage: DecisionIntelligenceRunStatus;
  readonly retryable: boolean;
  readonly causeName?: string;
}

export class AiDecisionIntelligenceManager
  implements AiDecisionIntelligenceManagerPort
{
  private readonly dependencies: DecisionIntelligenceManagerDependencies;
  private readonly executeApprovedPlans: boolean;
  private readonly failOnAuxiliaryError: boolean;
  private readonly includeValidationWarnings: boolean;
  private readonly statistics: MutableManagerStatistics;

  public constructor(
    dependencies: DecisionIntelligenceManagerDependencies,
    options: AiDecisionIntelligenceManagerOptions = {},
  ) {
    assertDependencies(dependencies);

    this.dependencies = dependencies;
    this.executeApprovedPlans = options.executeApprovedPlans ?? true;
    this.failOnAuxiliaryError = options.failOnAuxiliaryError ?? false;
    this.includeValidationWarnings =
      options.includeValidationWarnings ?? true;
    this.statistics = createStatistics();
  }

  public execute(
    request: DecisionIntelligenceRunRequest,
  ): DecisionIntelligenceExecutionOutcome {
    const startedAt = this.now();
    const runId = this.nextId("decision-run");
    const state: RunState = {
      runId,
      request,
      startedAt,
      stage: "CREATED",
      warnings: [],
    };

    this.statistics.totalRuns += 1;
    this.statistics.lastRunAt = startedAt;

    try {
      this.logInfo("AI decision-intelligence run started.", {
        runId,
        requestId: safeString(request?.requestId),
        portfolioId: safeString(request?.portfolioId),
      });
      this.publishLifecycleEvent(state, "RUN_STARTED", {
        startedAt,
        correlationId: request?.correlationId,
      });

      state.stage = "VALIDATING";
      const requestValidation = this.dependencies.validator.validateRequest(
        request,
      );
      this.collectValidationWarnings(requestValidation, state.warnings);

      if (!requestValidation.valid) {
        return this.rejectRun(state, requestValidation);
      }

      this.publishLifecycleEvent(state, "REQUEST_VALIDATED", {
        issueCount: requestValidation.issues.length,
        warningCount: countIssues(requestValidation.issues, "WARNING"),
      });

      state.stage = "ASSESSING_CONTEXT";
      const contextAssessment = this.dependencies.contextAssessor.assess(request);
      state.warnings.push(...contextAssessment.warnings);
      this.publishLifecycleEvent(state, "CONTEXT_ASSESSED", {
        assessmentId: contextAssessment.assessmentId,
        blockingConditionCount: contextAssessment.blockingConditions.length,
        eligibleStrategyCount: contextAssessment.eligibleStrategyIds.length,
        evidenceQualityScore: contextAssessment.evidenceQualityScore,
        systemReadinessScore: contextAssessment.systemReadinessScore,
      });

      state.stage = "BUILDING_CANDIDATES";
      const candidateBuild = this.dependencies.candidateBuilder.build({
        request,
        context: contextAssessment,
        generatedAt: this.now(),
      });
      state.warnings.push(...candidateBuild.warnings);
      this.publishLifecycleEvent(state, "CANDIDATES_BUILT", {
        candidateCount: candidateBuild.candidates.length,
        rejectedCandidateCount: candidateBuild.rejectedCandidateCount,
      });

      state.stage = "SCORING_CANDIDATES";
      const candidateScoring = this.dependencies.candidateScoringEngine.score({
        requestId: request.requestId,
        generatedAt: this.now(),
        candidates: candidateBuild.candidates,
        weights: request.configuration.scoringWeights,
        minimumCandidateScore: request.configuration.minimumCandidateScore,
      });
      state.warnings.push(...candidateScoring.warnings);
      this.publishLifecycleEvent(state, "CANDIDATES_SCORED", {
        candidateCount: candidateScoring.candidates.length,
        eligibleCandidateCount: candidateScoring.eligibleCandidateIds.length,
        rejectedCandidateCount: candidateScoring.rejectedCandidateIds.length,
      });

      state.stage = "RESOLVING_CONFLICTS";
      const conflictResolution = this.dependencies.conflictResolver.resolve({
        requestId: request.requestId,
        generatedAt: this.now(),
        candidates: candidateScoring.candidates,
        tolerance: request.configuration.conflictResolutionTolerance,
      });
      state.warnings.push(...conflictResolution.warnings);
      this.publishLifecycleEvent(state, "CONFLICTS_RESOLVED", {
        conflictCount: conflictResolution.conflicts.length,
        remainingCandidateCount: conflictResolution.remainingCandidates.length,
        rejectedCandidateCount: conflictResolution.rejectedCandidateIds.length,
      });

      state.stage = "OPTIMIZING_PLAN";
      const executionPlan = this.dependencies.planOptimizer.optimize({
        runId,
        request,
        context: contextAssessment,
        candidates: conflictResolution.remainingCandidates,
        conflicts: conflictResolution.conflicts,
        generatedAt: this.now(),
      });

      const planValidation = this.dependencies.validator.validatePlan(
        executionPlan,
      );
      this.collectValidationWarnings(planValidation, state.warnings);
      if (!planValidation.valid) {
        throw validationError(
          "Generated execution plan failed validation.",
          "INVALID_GENERATED_EXECUTION_PLAN",
          "OPTIMIZING_PLAN",
          planValidation,
        );
      }

      state.warnings.push(...executionPlan.warnings);
      this.publishLifecycleEvent(state, "PLAN_OPTIMIZED", {
        planId: executionPlan.planId,
        decision: executionPlan.decision,
        actionCount: executionPlan.actions.length,
        selectedCandidateCount:
          executionPlan.metrics.selectedCandidateCount,
        expectedNetUtility: executionPlan.metrics.expectedNetUtility,
        expectedRiskDelta: executionPlan.metrics.expectedRiskDelta,
        expectedTurnover: executionPlan.metrics.expectedTurnover,
      });

      state.stage = "EVALUATING_GOVERNANCE";
      const governance = this.dependencies.governanceEngine.evaluate({
        request,
        context: contextAssessment,
        plan: executionPlan,
        generatedAt: this.now(),
      });
      state.warnings.push(...governance.warnings);
      this.publishLifecycleEvent(state, "GOVERNANCE_EVALUATED", {
        governanceAssessmentId: governance.assessmentId,
        governanceDecision: governance.decision,
        approvalRequirement: governance.approvalRequirement,
        approvedActionCount: governance.approvedActionIds.length,
        restrictedActionCount: governance.restrictedActionIds.length,
        rejectedActionCount: governance.rejectedActionIds.length,
      });

      const finalDecision = determineFinalDecision(
        executionPlan,
        governance.decision,
      );
      const effectivePlan = withDecision(executionPlan, finalDecision);

      state.stage = "EXPLAINING";
      const explanation = this.dependencies.explainabilityEngine.explain({
        request,
        context: contextAssessment,
        candidates: candidateScoring.candidates,
        plan: effectivePlan,
        governance,
        generatedAt: this.now(),
      });
      state.warnings.push(...explanation.warnings);
      this.publishLifecycleEvent(state, "EXPLANATION_GENERATED", {
        explanationId: explanation.explanationId,
        level: explanation.level,
        confidence: explanation.confidence,
      });

      const confidence = buildRunConfidence(
        candidateScoring.candidates,
        effectivePlan,
        contextAssessment.evidenceQualityScore,
        contextAssessment.regimeConfidence,
        explanation.confidence,
      );
      const completedAt = this.now();
      const status = finalDecision === "DEFER" || finalDecision === "HOLD"
        ? "DEFERRED"
        : "COMPLETED";

      const result: DecisionIntelligenceRunResult = deepFreeze({
        runId,
        requestId: request.requestId,
        portfolioId: request.portfolioId,
        ...(request.correlationId === undefined
          ? {}
          : { correlationId: request.correlationId }),
        status,
        decision: finalDecision,
        requestedAt: request.requestedAt,
        startedAt,
        completedAt,
        contextAssessment,
        candidates: candidateScoring.candidates,
        selectedCandidateIds: effectivePlan.actions.map(
          (action) => action.candidateId,
        ),
        executionPlan: effectivePlan,
        governance,
        explanation,
        confidence,
        warnings: uniqueStrings(state.warnings),
        metadata: {
          deterministicSeed: request.configuration.deterministicSeed,
          candidateBuildRejectedCount: candidateBuild.rejectedCandidateCount,
          scoringRejectedCandidateIds:
            candidateScoring.rejectedCandidateIds,
          conflictRejectedCandidateIds:
            conflictResolution.rejectedCandidateIds,
          conflictCount: conflictResolution.conflicts.length,
          governanceDecision: governance.decision,
          approvalRequirement: governance.approvalRequirement,
        },
      });

      const resultValidation = this.dependencies.validator.validateResult(result);
      this.collectValidationWarnings(resultValidation, state.warnings);
      if (!resultValidation.valid) {
        throw validationError(
          "Completed decision-intelligence result failed validation.",
          "INVALID_DECISION_INTELLIGENCE_RESULT",
          "EXPLAINING",
          resultValidation,
        );
      }

      state.stage = status;
      this.recordSuccessfulResult(result);
      this.persistOutcome(result, state);
      this.publishLifecycleEvent(
        state,
        status === "COMPLETED" ? "RUN_COMPLETED" : "RUN_DEFERRED",
        {
          decision: result.decision,
          planId: result.executionPlan.planId,
          confidence: result.confidence.score,
          candidateCount: result.candidates.length,
          selectedCandidateCount: result.selectedCandidateIds.length,
        },
      );

      this.executePlanWhenEligible(result, state);
      this.persistSnapshot(state);

      this.logInfo("AI decision-intelligence run finished.", {
        runId,
        status: result.status,
        decision: result.decision,
        planId: result.executionPlan.planId,
      });

      return result;
    } catch (error: unknown) {
      return this.failRun(state, error);
    }
  }

  public snapshot(): DecisionIntelligenceManagerSnapshot {
    const successfulCount = this.statistics.successfulOutcomeCount;
    const generatedAt = this.now();

    return deepFreeze({
      snapshotId: this.nextId("decision-manager-snapshot"),
      generatedAt,
      totalRuns: this.statistics.totalRuns,
      completedRuns: this.statistics.completedRuns,
      deferredRuns: this.statistics.deferredRuns,
      rejectedRuns: this.statistics.rejectedRuns,
      failedRuns: this.statistics.failedRuns,
      executeDecisions: this.statistics.executeDecisions,
      restrictedExecuteDecisions:
        this.statistics.restrictedExecuteDecisions,
      holdDecisions: this.statistics.holdDecisions,
      averageConfidence: round(
        safeDivide(this.statistics.confidenceTotal, successfulCount),
      ),
      averageCandidateCount: round(
        safeDivide(this.statistics.candidateCountTotal, successfulCount),
      ),
      averageSelectedCandidateCount: round(
        safeDivide(
          this.statistics.selectedCandidateCountTotal,
          successfulCount,
        ),
      ),
      averageExpectedTurnover: round(
        safeDivide(this.statistics.expectedTurnoverTotal, successfulCount),
      ),
      ...(this.statistics.lastRunAt === undefined
        ? {}
        : { lastRunAt: this.statistics.lastRunAt }),
      ...(this.statistics.lastCompletedRunAt === undefined
        ? {}
        : { lastCompletedRunAt: this.statistics.lastCompletedRunAt }),
      ...(this.statistics.lastDecision === undefined
        ? {}
        : { lastDecision: this.statistics.lastDecision }),
      ...(this.statistics.lastPlanId === undefined
        ? {}
        : { lastPlanId: this.statistics.lastPlanId }),
    });
  }

  private rejectRun(
    state: RunState,
    validation: DecisionValidationResult,
  ): DecisionIntelligenceRunFailure {
    state.stage = "REJECTED";
    const completedAt = this.now();
    const messages = validation.issues
      .filter((entry) => entry.severity === "ERROR")
      .map((entry) => `${entry.path || "request"}: ${entry.message}`);

    const outcome: DecisionIntelligenceRunFailure = deepFreeze({
      runId: state.runId,
      requestId: safeString(state.request?.requestId, "UNKNOWN_REQUEST"),
      portfolioId: safeString(
        state.request?.portfolioId,
        "UNKNOWN_PORTFOLIO",
      ),
      ...(state.request?.correlationId === undefined
        ? {}
        : { correlationId: state.request.correlationId }),
      status: "REJECTED",
      stage: "VALIDATING",
      requestedAt: safeTimestamp(
        state.request?.requestedAt,
        state.startedAt,
      ),
      startedAt: state.startedAt,
      completedAt,
      errorCode: "DECISION_REQUEST_VALIDATION_FAILED",
      message: messages.length > 0
        ? messages.join(" | ")
        : "Decision-intelligence request validation failed.",
      validation,
      retryable: false,
      warnings: uniqueStrings([
        ...state.warnings,
        ...validation.issues
          .filter((entry) => entry.severity === "WARNING")
          .map((entry) => entry.message),
      ]),
      metadata: {
        validationIssueCount: validation.issues.length,
        validationErrorCount: countIssues(validation.issues, "ERROR"),
        validationWarningCount: countIssues(validation.issues, "WARNING"),
      },
    });

    this.statistics.rejectedRuns += 1;
    this.persistOutcome(outcome, state);
    this.publishLifecycleEvent(state, "RUN_REJECTED", {
      errorCode: outcome.errorCode,
      issueCount: validation.issues.length,
    });
    this.persistSnapshot(state);
    this.logWarn("AI decision-intelligence request rejected.", {
      runId: state.runId,
      errorCode: outcome.errorCode,
      issueCount: validation.issues.length,
    });

    return outcome;
  }

  private failRun(
    state: RunState,
    error: unknown,
  ): DecisionIntelligenceRunFailure {
    const normalized = normalizeError(error, state.stage);
    const completedAt = this.safeNow(state.startedAt);
    state.stage = "FAILED";

    const outcome: DecisionIntelligenceRunFailure = deepFreeze({
      runId: state.runId,
      requestId: safeString(state.request?.requestId, "UNKNOWN_REQUEST"),
      portfolioId: safeString(
        state.request?.portfolioId,
        "UNKNOWN_PORTFOLIO",
      ),
      ...(state.request?.correlationId === undefined
        ? {}
        : { correlationId: state.request.correlationId }),
      status: "FAILED",
      stage: normalized.stage,
      requestedAt: safeTimestamp(
        state.request?.requestedAt,
        state.startedAt,
      ),
      startedAt: state.startedAt,
      completedAt,
      errorCode: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      warnings: uniqueStrings(state.warnings),
      metadata: {
        failedStage: normalized.stage,
        causeName: normalized.causeName,
      },
    });

    this.statistics.failedRuns += 1;
    this.bestEffortPersistOutcome(outcome);
    this.bestEffortPublishEvent(state, "RUN_FAILED", {
      errorCode: outcome.errorCode,
      failedStage: outcome.stage,
      retryable: outcome.retryable,
    });
    this.bestEffortPersistSnapshot();
    this.logError("AI decision-intelligence run failed.", {
      runId: state.runId,
      errorCode: outcome.errorCode,
      failedStage: outcome.stage,
      retryable: outcome.retryable,
      message: outcome.message,
    });

    return outcome;
  }

  private executePlanWhenEligible(
    result: DecisionIntelligenceRunResult,
    state: RunState,
  ): void {
    const executor = this.dependencies.planExecutor;
    if (
      !this.executeApprovedPlans ||
      executor === undefined ||
      result.executionPlan.executionMode === "DRY_RUN" ||
      (result.decision !== "EXECUTE" &&
        result.decision !== "EXECUTE_WITH_RESTRICTIONS") ||
      (result.governance.decision !== "APPROVED" &&
        result.governance.decision !== "APPROVED_WITH_RESTRICTIONS")
    ) {
      return;
    }

    this.publishLifecycleEvent(state, "PLAN_EXECUTION_STARTED", {
      planId: result.executionPlan.planId,
      actionCount: result.executionPlan.actions.length,
      executionMode: result.executionPlan.executionMode,
    });

    try {
      const executionResult = executor.execute(result.executionPlan);
      this.persistExecutionResult(executionResult, state);

      const failed = executionResult.status === "FAILED";
      this.publishLifecycleEvent(
        state,
        failed ? "PLAN_EXECUTION_FAILED" : "PLAN_EXECUTION_COMPLETED",
        executionResultPayload(executionResult),
      );

      if (failed) {
        this.logWarn("Decision execution plan completed with failure.", {
          runId: state.runId,
          planId: executionResult.planId,
          executionId: executionResult.executionId,
          failedActionCount: executionResult.failedActionIds.length,
        });
      }
    } catch (error: unknown) {
      const normalized = normalizeError(error, "COMPLETED");
      this.bestEffortPublishEvent(state, "PLAN_EXECUTION_FAILED", {
        planId: result.executionPlan.planId,
        errorCode: normalized.code,
        message: normalized.message,
      });
      this.logError("Decision execution plan dispatch failed.", {
        runId: state.runId,
        planId: result.executionPlan.planId,
        errorCode: normalized.code,
        message: normalized.message,
      });

      if (this.failOnAuxiliaryError) {
        throw new AiDecisionIntelligenceManagerError(
          normalized.message,
          normalized.code,
          "COMPLETED",
          normalized.retryable,
          error,
        );
      }
    }
  }

  private recordSuccessfulResult(result: DecisionIntelligenceRunResult): void {
    if (result.status === "COMPLETED") {
      this.statistics.completedRuns += 1;
      this.statistics.lastCompletedRunAt = result.completedAt;
    } else {
      this.statistics.deferredRuns += 1;
    }

    switch (result.decision) {
      case "EXECUTE":
        this.statistics.executeDecisions += 1;
        break;
      case "EXECUTE_WITH_RESTRICTIONS":
        this.statistics.restrictedExecuteDecisions += 1;
        break;
      case "HOLD":
      case "DEFER":
      case "REJECT":
        this.statistics.holdDecisions += 1;
        break;
    }

    this.statistics.successfulOutcomeCount += 1;
    this.statistics.confidenceTotal += result.confidence.score;
    this.statistics.candidateCountTotal += result.candidates.length;
    this.statistics.selectedCandidateCountTotal +=
      result.selectedCandidateIds.length;
    this.statistics.expectedTurnoverTotal +=
      result.executionPlan.metrics.expectedTurnover;
    this.statistics.lastDecision = result.decision;
    this.statistics.lastPlanId = result.executionPlan.planId;
  }

  private collectValidationWarnings(
    validation: DecisionValidationResult,
    warnings: string[],
  ): void {
    if (!this.includeValidationWarnings) return;

    for (const entry of validation.issues) {
      if (entry.severity === "WARNING") {
        warnings.push(
          entry.path.length > 0
            ? `${entry.path}: ${entry.message}`
            : entry.message,
        );
      }
    }
  }

  private publishLifecycleEvent(
    state: RunState,
    type: DecisionIntelligenceEvent["type"],
    payload: DecisionMetadata,
  ): void {
    const publisher = this.dependencies.eventPublisher;
    if (publisher === undefined) return;

    const event: DecisionIntelligenceEvent = deepFreeze({
      eventId: this.nextId("decision-event"),
      runId: state.runId,
      requestId: safeString(state.request?.requestId, "UNKNOWN_REQUEST"),
      portfolioId: safeString(
        state.request?.portfolioId,
        "UNKNOWN_PORTFOLIO",
      ),
      timestamp: this.now(),
      type,
      payload,
    });

    try {
      publisher.publish(event);
    } catch (error: unknown) {
      this.logAuxiliaryFailure("event publication", error, {
        runId: state.runId,
        eventType: type,
      });
      if (this.failOnAuxiliaryError) throw error;
    }
  }

  private persistOutcome(
    outcome: DecisionIntelligenceExecutionOutcome,
    state: RunState,
  ): void {
    const persistence = this.dependencies.persistence;
    if (persistence === undefined) return;

    try {
      persistence.saveOutcome(outcome);
    } catch (error: unknown) {
      this.logAuxiliaryFailure("outcome persistence", error, {
        runId: state.runId,
        status: outcome.status,
      });
      if (this.failOnAuxiliaryError) throw error;
    }
  }

  private persistExecutionResult(
    result: DecisionPlanExecutionResult,
    state: RunState,
  ): void {
    const saveExecutionResult =
      this.dependencies.persistence?.saveExecutionResult;
    if (saveExecutionResult === undefined) return;

    try {
      saveExecutionResult.call(this.dependencies.persistence, result);
    } catch (error: unknown) {
      this.logAuxiliaryFailure("execution-result persistence", error, {
        runId: state.runId,
        executionId: result.executionId,
      });
      if (this.failOnAuxiliaryError) throw error;
    }
  }

  private persistSnapshot(state: RunState): void {
    const persistence = this.dependencies.persistence;
    if (persistence === undefined) return;

    try {
      persistence.saveSnapshot(this.snapshot());
    } catch (error: unknown) {
      this.logAuxiliaryFailure("snapshot persistence", error, {
        runId: state.runId,
      });
      if (this.failOnAuxiliaryError) throw error;
    }
  }

  private bestEffortPublishEvent(
    state: RunState,
    type: DecisionIntelligenceEvent["type"],
    payload: DecisionMetadata,
  ): void {
    try {
      this.publishLifecycleEvent(state, type, payload);
    } catch {
      // Failure reporting must never recursively fail the manager.
    }
  }

  private bestEffortPersistOutcome(
    outcome: DecisionIntelligenceExecutionOutcome,
  ): void {
    try {
      this.dependencies.persistence?.saveOutcome(outcome);
    } catch {
      // Failure reporting must never recursively fail the manager.
    }
  }

  private bestEffortPersistSnapshot(): void {
    try {
      this.dependencies.persistence?.saveSnapshot(this.snapshot());
    } catch {
      // Failure reporting must never recursively fail the manager.
    }
  }

  private logAuxiliaryFailure(
    operation: string,
    error: unknown,
    context: DecisionMetadata,
  ): void {
    const normalized = normalizeError(error, "FAILED");
    this.logError(`Decision-intelligence ${operation} failed.`, {
      ...context,
      errorCode: normalized.code,
      message: normalized.message,
    });
  }

  private now(): string {
    const value = this.dependencies.clock.now();
    if (!isTimestamp(value)) {
      throw new AiDecisionIntelligenceManagerError(
        "Decision clock returned an invalid timestamp.",
        "INVALID_CLOCK_TIMESTAMP",
        "FAILED",
        false,
        value,
      );
    }
    return value;
  }

  private safeNow(fallback: string): string {
    try {
      return this.now();
    } catch {
      return fallback;
    }
  }

  private nextId(prefix: string): DecisionIntelligenceId {
    const value = this.dependencies.idGenerator.next(prefix);
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new AiDecisionIntelligenceManagerError(
        `Decision ID generator returned an invalid identifier for ${prefix}.`,
        "INVALID_GENERATED_ID",
        "FAILED",
        false,
        value,
      );
    }
    return value;
  }

  private logInfo(message: string, context?: DecisionMetadata): void {
    try {
      this.dependencies.logger?.info(message, context);
    } catch {
      // Logging cannot affect deterministic decision production.
    }
  }

  private logWarn(message: string, context?: DecisionMetadata): void {
    try {
      this.dependencies.logger?.warn(message, context);
    } catch {
      // Logging cannot affect deterministic decision production.
    }
  }

  private logError(message: string, context?: DecisionMetadata): void {
    try {
      this.dependencies.logger?.error(message, context);
    } catch {
      // Logging cannot affect deterministic decision production.
    }
  }
}

function assertDependencies(
  dependencies: DecisionIntelligenceManagerDependencies,
): void {
  if (dependencies === null || typeof dependencies !== "object") {
    throw new AiDecisionIntelligenceManagerError(
      "Decision-intelligence manager dependencies are required.",
      "MISSING_MANAGER_DEPENDENCIES",
    );
  }

  const requiredMethods: readonly [string, unknown, string][] = [
    ["clock", dependencies.clock, "now"],
    ["idGenerator", dependencies.idGenerator, "next"],
    ["validator", dependencies.validator, "validateRequest"],
    ["contextAssessor", dependencies.contextAssessor, "assess"],
    ["candidateBuilder", dependencies.candidateBuilder, "build"],
    [
      "candidateScoringEngine",
      dependencies.candidateScoringEngine,
      "score",
    ],
    ["conflictResolver", dependencies.conflictResolver, "resolve"],
    ["planOptimizer", dependencies.planOptimizer, "optimize"],
    ["governanceEngine", dependencies.governanceEngine, "evaluate"],
    ["explainabilityEngine", dependencies.explainabilityEngine, "explain"],
  ];

  for (const [name, value, method] of requiredMethods) {
    if (
      value === null ||
      typeof value !== "object" ||
      typeof (value as Record<string, unknown>)[method] !== "function"
    ) {
      throw new AiDecisionIntelligenceManagerError(
        `${name}.${method} must be configured.`,
        "INVALID_MANAGER_DEPENDENCY",
      );
    }
  }
}

function determineFinalDecision(
  plan: DecisionExecutionPlan,
  governanceDecision:
    | "APPROVED"
    | "APPROVED_WITH_RESTRICTIONS"
    | "PENDING_APPROVAL"
    | "DEFERRED"
    | "REJECTED",
): DecisionIntelligenceDecision {
  switch (governanceDecision) {
    case "APPROVED":
      return plan.decision;
    case "APPROVED_WITH_RESTRICTIONS":
      return plan.decision === "HOLD" || plan.decision === "DEFER"
        ? plan.decision
        : "EXECUTE_WITH_RESTRICTIONS";
    case "PENDING_APPROVAL":
    case "DEFERRED":
      return "DEFER";
    case "REJECTED":
      return "REJECT";
  }
}

function withDecision(
  plan: DecisionExecutionPlan,
  decision: DecisionIntelligenceDecision,
): DecisionExecutionPlan {
  if (plan.decision === decision) return plan;
  return deepFreeze({ ...plan, decision });
}

function buildRunConfidence(
  candidates: readonly ScoredDecisionCandidate[],
  plan: DecisionExecutionPlan,
  contextDataQuality: number,
  contextRegimeConfidence: number,
  explanationConfidence: number,
): DecisionConfidenceAssessment {
  const selectedIds = new Set(
    plan.actions.map((action) => action.candidateId),
  );
  const selected = candidates.filter((candidate) =>
    selectedIds.has(candidate.candidateId),
  );
  const basis = selected.length > 0 ? selected : candidates;

  const evidenceCoverage = average(
    basis.map((candidate) => candidate.confidence.evidenceCoverage),
    contextDataQuality,
  );
  const evidenceConsistency = average(
    basis.map((candidate) => candidate.confidence.evidenceConsistency),
    plan.metrics.confidence,
  );
  const modelAgreement = average(
    basis.map((candidate) => candidate.confidence.modelAgreement),
    explanationConfidence,
  );
  const dataQuality = unit(
    average(
      basis.map((candidate) => candidate.confidence.dataQuality),
      contextDataQuality,
    ),
  );
  const regimeCertainty = unit(
    average(
      basis.map((candidate) => candidate.confidence.regimeCertainty),
      contextRegimeConfidence,
    ),
  );
  const riskCertainty = average(
    basis.map((candidate) => candidate.confidence.riskCertainty),
    plan.metrics.confidence,
  );
  const candidateConfidence = average(
    basis.map((candidate) => candidate.confidence.score),
    plan.metrics.confidence,
  );
  const uncertainty = average(
    basis.map((candidate) => candidate.confidence.uncertainty),
    1 - candidateConfidence,
  );
  const score = unit(
    weightedAverage([
      [candidateConfidence, 0.24],
      [plan.metrics.confidence, 0.18],
      [explanationConfidence, 0.12],
      [evidenceCoverage, 0.09],
      [evidenceConsistency, 0.09],
      [modelAgreement, 0.08],
      [dataQuality, 0.08],
      [regimeCertainty, 0.05],
      [riskCertainty, 0.07],
    ]) *
      (1 - unit(uncertainty) * 0.25),
  );

  const reasons = uniqueStrings([
    `Plan confidence is ${formatScore(plan.metrics.confidence)}.`,
    `Evidence coverage is ${formatScore(evidenceCoverage)}.`,
    `Evidence consistency is ${formatScore(evidenceConsistency)}.`,
    `Data quality is ${formatScore(dataQuality)}.`,
    `Regime certainty is ${formatScore(regimeCertainty)}.`,
    `Risk certainty is ${formatScore(riskCertainty)}.`,
    ...(basis.length === 0
      ? ["No actionable candidate contributed to confidence."]
      : []),
  ]);

  return deepFreeze({
    score: round(score),
    band: confidenceBand(score),
    evidenceCoverage: round(unit(evidenceCoverage)),
    evidenceConsistency: round(unit(evidenceConsistency)),
    modelAgreement: round(unit(modelAgreement)),
    dataQuality: round(dataQuality),
    regimeCertainty: round(regimeCertainty),
    riskCertainty: round(unit(riskCertainty)),
    uncertainty: round(unit(uncertainty)),
    reasons,
  });
}

function confidenceBand(score: number): DecisionConfidenceBand {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  if (score >= 0.3) return "LOW";
  return "VERY_LOW";
}

function validationError(
  message: string,
  code: string,
  stage: DecisionIntelligenceRunStatus,
  validation: DecisionValidationResult,
): AiDecisionIntelligenceManagerError {
  const issueSummary = validation.issues
    .map((entry) => `${entry.path || "result"}: ${entry.message}`)
    .join(" | ");

  return new AiDecisionIntelligenceManagerError(
    issueSummary.length > 0 ? `${message} ${issueSummary}` : message,
    code,
    stage,
    false,
    validation,
  );
}

function normalizeError(
  error: unknown,
  fallbackStage: DecisionIntelligenceRunStatus,
): NormalizedError {
  if (error instanceof AiDecisionIntelligenceManagerError) {
    return {
      code: error.code,
      message: error.message,
      stage: error.stage,
      retryable: error.retryable,
      causeName: error.name,
    };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      readonly code?: unknown;
      readonly retryable?: unknown;
      readonly stage?: unknown;
    };
    return {
      code:
        typeof candidate.code === "string" && candidate.code.length > 0
          ? candidate.code
          : "DECISION_INTELLIGENCE_PIPELINE_FAILED",
      message: error.message || "Decision-intelligence pipeline failed.",
      stage: isRunStatus(candidate.stage)
        ? candidate.stage
        : fallbackStage,
      retryable:
        typeof candidate.retryable === "boolean"
          ? candidate.retryable
          : false,
      causeName: error.name,
    };
  }

  return {
    code: "DECISION_INTELLIGENCE_PIPELINE_FAILED",
    message:
      typeof error === "string" && error.length > 0
        ? error
        : "Decision-intelligence pipeline failed with an unknown error.",
    stage: fallbackStage,
    retryable: false,
    causeName: typeof error,
  };
}

function executionResultPayload(
  result: DecisionPlanExecutionResult,
): DecisionMetadata {
  return {
    executionId: result.executionId,
    planId: result.planId,
    status: result.status,
    completedActionCount: result.completedActionIds.length,
    failedActionCount: result.failedActionIds.length,
    skippedActionCount: result.skippedActionIds.length,
    rolledBackActionCount: result.rolledBackActionIds.length,
    warningCount: result.warnings.length,
  };
}

function createStatistics(): MutableManagerStatistics {
  return {
    totalRuns: 0,
    completedRuns: 0,
    deferredRuns: 0,
    rejectedRuns: 0,
    failedRuns: 0,
    executeDecisions: 0,
    restrictedExecuteDecisions: 0,
    holdDecisions: 0,
    confidenceTotal: 0,
    candidateCountTotal: 0,
    selectedCandidateCountTotal: 0,
    expectedTurnoverTotal: 0,
    successfulOutcomeCount: 0,
  };
}

function countIssues(
  issues: readonly DecisionValidationIssue[],
  severity: DecisionValidationIssue["severity"],
): number {
  return issues.reduce(
    (count, entry) => count + (entry.severity === severity ? 1 : 0),
    0,
  );
}

function isRunStatus(value: unknown): value is DecisionIntelligenceRunStatus {
  return typeof value === "string" && new Set<string>([
    "CREATED",
    "VALIDATING",
    "ASSESSING_CONTEXT",
    "BUILDING_CANDIDATES",
    "SCORING_CANDIDATES",
    "RESOLVING_CONFLICTS",
    "OPTIMIZING_PLAN",
    "EVALUATING_GOVERNANCE",
    "EXPLAINING",
    "COMPLETED",
    "DEFERRED",
    "REJECTED",
    "FAILED",
  ]).has(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function safeTimestamp(value: unknown, fallback: string): string {
  return isTimestamp(value) ? value : fallback;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function average(values: readonly number[], fallback: number): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return unit(fallback);
  return unit(
    finite.reduce((sum, value) => sum + unit(value), 0) / finite.length,
  );
}

function weightedAverage(
  entries: readonly (readonly [number, number])[],
): number {
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const [value, weight] of entries) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    weightedTotal += unit(value) * weight;
    weightTotal += weight;
  }
  return weightTotal <= EPSILON ? 0 : weightedTotal / weightTotal;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  return Math.abs(denominator) <= EPSILON ? 0 : numerator / denominator;
}

function unit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number, precision = SCORE_PRECISION): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatScore(value: number): string {
  return round(unit(value), 4).toFixed(4);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.filter((value) => value.trim().length > 0))],
  );
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}