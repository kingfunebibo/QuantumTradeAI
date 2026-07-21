import assert from "node:assert/strict";

import {
  AiDecisionIntelligenceManager,
  type DecisionIntelligenceEvent,
  type DecisionIntelligenceExecutionOutcome,
  type DecisionIntelligenceManagerDependencies,
  type DecisionIntelligenceManagerSnapshot,
  type DecisionIntelligenceRunRequest,
  type DecisionPlanExecutionResult,
  type DecisionValidationResult,
} from "./ai-decision-intelligence";

const VALID: DecisionValidationResult = Object.freeze({ valid: true, issues: Object.freeze([]) });

function createClock() {
  let value = Date.parse("2026-07-21T08:00:00.000Z");
  return {
    now(): string {
      const current = new Date(value).toISOString();
      value += 1_000;
      return current;
    },
  };
}

function createIdGenerator() {
  const counters = new Map<string, number>();
  return {
    next(prefix: string): string {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}-${String(next).padStart(4, "0")}`;
    },
  };
}

function createRequest(requestId = "request-001"): DecisionIntelligenceRunRequest {
  return {
    requestId,
    portfolioId: "portfolio-001",
    requestedAt: "2026-07-21T08:00:00.000Z",
    correlationId: "correlation-001",
    portfolio: {},
    marketContexts: [],
    strategyStates: [],
    riskObservations: [],
    systemHealth: {},
    constraints: [],
    configuration: {
      executionMode: "SIMULATED",
      explainabilityLevel: "STANDARD",
      scoringWeights: {},
      optimizationConstraints: {},
      safetyPolicy: {},
      governancePolicy: {},
      minimumCandidateScore: 0.5,
      conflictResolutionTolerance: 0.01,
      evidenceFreshnessHalfLifeMs: 60_000,
      includeNoActionCandidate: true,
      preferStablePlans: true,
      deterministicSeed: "integration-seed",
    },
    operatorDirectives: [],
    metadata: { suite: "milestone-35-integration" },
  } as unknown as DecisionIntelligenceRunRequest;
}

function createSuccessfulDependencies(
  events: DecisionIntelligenceEvent[],
  outcomes: DecisionIntelligenceExecutionOutcome[],
  snapshots: DecisionIntelligenceManagerSnapshot[],
  executions: DecisionPlanExecutionResult[],
): DecisionIntelligenceManagerDependencies {
  return {
    clock: createClock(),
    idGenerator: createIdGenerator(),
    validator: {
      validateRequest: () => VALID,
      validatePlan: () => VALID,
      validateResult: () => VALID,
    },
    contextAssessor: {
      assess: () => ({
        assessmentId: "assessment-001",
        generatedAt: "2026-07-21T08:00:02.000Z",
        portfolioHealthScore: 0.9,
        marketOpportunityScore: 0.8,
        marketRiskScore: 0.2,
        regimeConfidence: 0.88,
        strategyHealthScore: 0.86,
        executionReadinessScore: 0.95,
        systemReadinessScore: 0.96,
        evidenceQualityScore: 0.92,
        activeRegime: "TRENDING_BULLISH",
        eligibleStrategyIds: ["strategy-001"],
        ineligibleStrategyIds: [],
        blockingConditions: [],
        warnings: [],
      } as never),
    },
    candidateBuilder: {
      build: ({ request, generatedAt }) => ({
        requestId: request.requestId,
        generatedAt,
        candidates: [{ candidateId: "candidate-001" }] as never,
        rejectedCandidateCount: 0,
        warnings: [],
      }),
    },
    candidateScoringEngine: {
      score: ({ requestId, generatedAt }) => ({
        requestId,
        generatedAt,
        candidates: [{
          candidateId: "candidate-001",
          confidence: 0.9,
          finalScore: 0.91,
          rank: 1,
          eligible: true,
          rejectionReasons: [],
        }] as never,
        eligibleCandidateIds: ["candidate-001"],
        rejectedCandidateIds: [],
        warnings: [],
      }),
    },
    conflictResolver: {
      resolve: ({ requestId, generatedAt, candidates }) => ({
        requestId,
        generatedAt,
        conflicts: [],
        remainingCandidates: candidates,
        rejectedCandidateIds: [],
        warnings: [],
      }),
    },
    planOptimizer: {
      optimize: ({ runId, request, generatedAt }) => ({
        planId: "plan-001",
        runId,
        requestId: request.requestId,
        portfolioId: request.portfolioId,
        createdAt: generatedAt,
        executionMode: "SIMULATED",
        decision: "EXECUTE",
        actions: [{
          actionId: "action-001",
          candidateId: "candidate-001",
          type: "ADJUST_STRATEGY_WEIGHT",
        }],
        targetStrategyWeights: { "strategy-001": 0.75 },
        targetOperatingModes: { "strategy-001": "ACTIVE" },
        metrics: {
          candidateCount: 1,
          selectedCandidateCount: 1,
          rejectedCandidateCount: 0,
          actionCount: 1,
          expectedGrossUtility: 0.91,
          expectedNetUtility: 0.87,
          expectedCost: 0.04,
          expectedRiskDelta: -0.03,
          expectedTurnover: 0.12,
          expectedCapitalChange: 0.12,
          expectedReserveWeight: 0.25,
          diversificationScore: 0.82,
          regimeAlignmentScore: 0.9,
          stabilityScore: 0.88,
          confidence: 0.9,
        },
        conflicts: [],
        safeguards: ["DRY_RUN_ONLY"],
        warnings: [],
        metadata: {},
      } as never),
    },
    governanceEngine: {
      evaluate: ({ generatedAt }) => ({
        assessmentId: "governance-001",
        evaluatedAt: generatedAt,
        decision: "APPROVED",
        approvalRequirement: "NONE",
        approvedActionIds: ["action-001"],
        restrictedActionIds: [],
        rejectedActionIds: [],
        requiredApproverRoles: [],
        ruleEvaluations: [],
        restrictions: [],
        reasons: ["All deterministic governance checks passed."],
        warnings: [],
      }),
    },
    explainabilityEngine: {
      explain: ({ generatedAt, plan }) => ({
        explanationId: "explanation-001",
        generatedAt,
        level: "STANDARD",
        decision: plan.decision,
        summary: "Execute the highest-utility eligible candidate.",
        portfolioNarrative: "The plan improves expected utility while reducing risk.",
        strategyExplanations: [],
        primaryFactors: [],
        conflictsResolved: [],
        governanceNarrative: "Governance approved all actions.",
        uncertaintyNarrative: "Residual uncertainty is low.",
        alternativesConsidered: ["HOLD"],
        safeguards: plan.safeguards,
        confidence: 0.9,
        warnings: [],
      }),
    },
    planExecutor: {
      execute: (plan) => {
        const result = {
          executionId: "execution-001",
          planId: plan.planId,
          portfolioId: plan.portfolioId,
          status: "COMPLETED",
          startedAt: "2026-07-21T08:00:20.000Z",
          completedAt: "2026-07-21T08:00:21.000Z",
          actionResults: [],
          completedActionIds: ["action-001"],
          failedActionIds: [],
          skippedActionIds: [],
          rolledBackActionIds: [],
          warnings: [],
          metadata: {},
        } as unknown as DecisionPlanExecutionResult;
        executions.push(result);
        return result;
      },
    },
    eventPublisher: { publish: (event) => events.push(event) },
    persistence: {
      saveOutcome: (outcome) => outcomes.push(outcome),
      saveSnapshot: (snapshot) => snapshots.push(snapshot),
      saveExecutionResult: (result) => executions.push(result),
    },
  };
}

function assertSuccessfulRun(): void {
  const events: DecisionIntelligenceEvent[] = [];
  const outcomes: DecisionIntelligenceExecutionOutcome[] = [];
  const snapshots: DecisionIntelligenceManagerSnapshot[] = [];
  const executions: DecisionPlanExecutionResult[] = [];
  const manager = new AiDecisionIntelligenceManager(
    createSuccessfulDependencies(events, outcomes, snapshots, executions),
    { executeApprovedPlans: true },
  );

  const result = manager.execute(createRequest());
  assert.equal(result.status, "COMPLETED");
  assert.ok("decision" in result);
  if (!("decision" in result)) throw new Error("Expected successful run result.");

  assert.equal(result.decision, "EXECUTE");
  assert.equal(result.executionPlan.planId, "plan-001");
  assert.deepEqual(result.selectedCandidateIds, ["candidate-001"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.governance.decision, "APPROVED");
  assert.equal(result.explanation.confidence, 0.9);
  assert.equal(outcomes.length, 1);
  assert.ok(snapshots.length >= 1);
  assert.equal(executions.length, 2, "Executor result should be produced and persisted.");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.executionPlan));

  const eventTypes = events.map((event) => event.type);
  assert.deepEqual(eventTypes.slice(0, 10), [
    "RUN_STARTED",
    "REQUEST_VALIDATED",
    "CONTEXT_ASSESSED",
    "CANDIDATES_BUILT",
    "CANDIDATES_SCORED",
    "CONFLICTS_RESOLVED",
    "PLAN_OPTIMIZED",
    "GOVERNANCE_EVALUATED",
    "EXPLANATION_GENERATED",
    "RUN_COMPLETED",
  ]);
  assert.ok(eventTypes.includes("PLAN_EXECUTION_STARTED"));
  assert.ok(eventTypes.includes("PLAN_EXECUTION_COMPLETED"));

  const snapshot = manager.snapshot();
  assert.equal(snapshot.totalRuns, 1);
  assert.equal(snapshot.completedRuns, 1);
  assert.equal(snapshot.failedRuns, 0);
  assert.equal(snapshot.executeDecisions, 1);
  assert.equal(snapshot.lastDecision, "EXECUTE");
  assert.equal(snapshot.lastPlanId, "plan-001");
  assert.ok(Object.isFrozen(snapshot));
}

function assertRejectedRun(): void {
  const events: DecisionIntelligenceEvent[] = [];
  const outcomes: DecisionIntelligenceExecutionOutcome[] = [];
  const snapshots: DecisionIntelligenceManagerSnapshot[] = [];
  const executions: DecisionPlanExecutionResult[] = [];
  const dependencies = createSuccessfulDependencies(events, outcomes, snapshots, executions);
  const rejectedValidation: DecisionValidationResult = {
    valid: false,
    issues: [{
      code: "INVALID_REQUEST",
      path: "requestId",
      message: "requestId is invalid.",
      severity: "ERROR",
    }],
  };
  const manager = new AiDecisionIntelligenceManager({
    ...dependencies,
    validator: {
      ...dependencies.validator,
      validateRequest: () => rejectedValidation,
    },
  });

  const result = manager.execute(createRequest("request-invalid"));
  assert.equal(result.status, "REJECTED");
  assert.ok("errorCode" in result);
  if (!("errorCode" in result)) throw new Error("Expected rejected run result.");

  assert.equal(result.errorCode, "DECISION_REQUEST_VALIDATION_FAILED");
  assert.equal(result.stage, "VALIDATING");
  assert.equal(outcomes.length, 1);
  assert.equal(executions.length, 0);
  assert.deepEqual(events.map((event) => event.type), ["RUN_STARTED", "RUN_REJECTED"]);

  const snapshot = manager.snapshot();
  assert.equal(snapshot.totalRuns, 1);
  assert.equal(snapshot.rejectedRuns, 1);
  assert.equal(snapshot.completedRuns, 0);
}

assertSuccessfulRun();
assertRejectedRun();

console.log("All AI decision intelligence integration tests passed successfully.");