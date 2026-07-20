import {
  type MetaLearningEvent,
  type MetaLearningExecutionOutcome,
  type MetaLearningManagerDependencies,
  type MetaLearningManagerSnapshot,
  type MetaLearningRunRequest,
  type MetaLearningRunResult,
  type MetaLearningValidationResult,
} from "./ai-meta-learning-contracts";
import { AiMetaLearningManager } from "./ai-meta-learning-manager";

const assert = {
  equal(actual: unknown, expected: unknown, message?: string): void {
    if (!Object.is(actual, expected)) {
      fail(message ?? `Expected ${String(expected)}, received ${String(actual)}.`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, message?: string): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      fail(message ?? `Expected ${expectedJson}, received ${actualJson}.`);
    }
  },
  ok(value: unknown, message?: string): void {
    if (!value) fail(message ?? "Expected value to be truthy.");
  },
  match(value: string, expression: RegExp, message?: string): void {
    if (!expression.test(value)) {
      fail(message ?? `Expected '${value}' to match ${String(expression)}.`);
    }
  },
};

function fail(message: string): never {
  throw new Error(message);
}

const VALID: MetaLearningValidationResult = Object.freeze({
  valid: true,
  issues: Object.freeze([]),
});

const REJECTED: MetaLearningValidationResult = Object.freeze({
  valid: false,
  issues: Object.freeze([
    Object.freeze({
      code: "INVALID_REQUEST",
      severity: "ERROR" as const,
      path: "requestId",
      message: "The request is invalid.",
    }),
  ]),
});

interface Harness {
  readonly dependencies: MetaLearningManagerDependencies;
  readonly events: MetaLearningEvent[];
  readonly outcomes: MetaLearningExecutionOutcome[];
  readonly snapshots: MetaLearningManagerSnapshot[];
  readonly calls: string[];
  requestValidation: MetaLearningValidationResult;
  resultValidation: MetaLearningValidationResult;
  failureStage?: string;
}

function createHarness(): Harness {
  let clockTick = 0;
  let idTick = 0;
  const events: MetaLearningEvent[] = [];
  const outcomes: MetaLearningExecutionOutcome[] = [];
  const snapshots: MetaLearningManagerSnapshot[] = [];
  const calls: string[] = [];

  const harness = {
    events,
    outcomes,
    snapshots,
    calls,
    requestValidation: VALID,
    resultValidation: VALID,
    failureStage: undefined,
  } as Harness;

  const failIfRequested = (stage: string): void => {
    calls.push(stage);
    if (harness.failureStage === stage) {
      throw new Error(`Synthetic ${stage} failure.`);
    }
  };

  const dependencies: MetaLearningManagerDependencies = {
    clock: {
      now: () => {
        const value = new Date(Date.UTC(2026, 6, 21, 12, 0, clockTick));
        clockTick += 1;
        return value.toISOString();
      },
    },
    idGenerator: {
      next: (prefix: string) => `${prefix}-${String(++idTick).padStart(4, "0")}`,
    },
    validator: {
      validateRequest: () => {
        calls.push("validateRequest");
        return harness.requestValidation;
      },
      validateResult: () => {
        calls.push("validateResult");
        return harness.resultValidation;
      },
    },
    featureExtractor: {
      extract: () => {
        failIfRequested("featureExtractor");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          featureVectors: Object.freeze([]),
          rejectedObservationIds: Object.freeze([]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    patternMiner: {
      mine: () => {
        failIfRequested("patternMiner");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          patterns: Object.freeze([]),
          rejectedPatternCount: 0,
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    regimeLearningEngine: {
      learn: () => {
        failIfRequested("regimeLearningEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          profiles: Object.freeze([]),
          evidence: Object.freeze([]),
          unknownContextIds: Object.freeze([]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    strategyLearningEngine: {
      learn: () => {
        failIfRequested("strategyLearningEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          objective: "BALANCED",
          scores: Object.freeze([]),
          bestStrategyIds: Object.freeze([]),
          underperformingStrategyIds: Object.freeze([]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    adaptiveWeightLearningEngine: {
      learn: () => {
        failIfRequested("adaptiveWeightLearningEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          weights: Object.freeze([
            Object.freeze({
              strategyId: "strategy-alpha",
              previousWeight: 0.6,
              rawWeight: 0.55,
              boundedWeight: 0.55,
              confidence: 0.9,
              reasons: Object.freeze(["Stable evidence."]),
            }),
            Object.freeze({
              strategyId: "strategy-beta",
              previousWeight: 0.4,
              rawWeight: 0.45,
              boundedWeight: 0.45,
              confidence: 0.9,
              reasons: Object.freeze(["Improved evidence."]),
            }),
          ]),
          expectedTurnover: 0.1,
          reserveWeight: 0,
          confidence: 0.9,
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    reinforcementFeedbackEngine: {
      apply: () => {
        failIfRequested("reinforcementFeedbackEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          events: Object.freeze([]),
          states: Object.freeze([]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    strategyEvolutionEngine: {
      evolve: () => {
        failIfRequested("strategyEvolutionEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          candidates: Object.freeze([]),
          unchangedStrategyIds: Object.freeze([
            "strategy-alpha",
            "strategy-beta",
          ]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    strategyPromotionEngine: {
      evaluate: () => {
        failIfRequested("strategyPromotionEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          assessments: Object.freeze([]),
          promotedStrategyIds: Object.freeze([]),
          deferredStrategyIds: Object.freeze([]),
          rejectedStrategyIds: Object.freeze([]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    strategyRetirementEngine: {
      evaluate: () => {
        failIfRequested("strategyRetirementEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          assessments: Object.freeze([]),
          retiredStrategyIds: Object.freeze([]),
          probationStrategyIds: Object.freeze([]),
          retainedStrategyIds: Object.freeze([
            "strategy-alpha",
            "strategy-beta",
          ]),
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    explainabilityEngine: {
      explain: () => {
        failIfRequested("explainabilityEngine");
        return Object.freeze({
          requestId: "request-001",
          generatedAt: "2026-07-21T12:00:00.000Z",
          decision: "APPLY",
          summary: "Deterministic integration-test explanation.",
          strategyExplanations: Object.freeze([]),
          portfolioRisks: Object.freeze([]),
          appliedSafeguards: Object.freeze([]),
          confidence: 0.9,
          warnings: Object.freeze([]),
        }) as never;
      },
    },
    eventPublisher: {
      publish: (event: MetaLearningEvent) => {
        events.push(event);
      },
    },
    persistence: {
      saveOutcome: (outcome: MetaLearningExecutionOutcome) => {
        outcomes.push(outcome);
      },
      saveSnapshot: (snapshot: MetaLearningManagerSnapshot) => {
        snapshots.push(snapshot);
      },
    },
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };

  Object.defineProperty(harness, "dependencies", {
    value: dependencies,
    enumerable: true,
  });

  return harness;
}

function createRequest(): MetaLearningRunRequest {
  return Object.freeze({
    requestId: "request-001",
    portfolioId: "portfolio-main",
    requestedAt: "2026-07-21T11:59:00.000Z",
    activeRegime: "TRENDING_UP",
    activeRegimeConfidence: 0.9,
    currentStrategyWeights: Object.freeze({
      "strategy-alpha": 0.6,
      "strategy-beta": 0.4,
    }),
    previousReinforcementStates: Object.freeze([]),
    dataset: Object.freeze({
      datasetId: "dataset-001",
      sourceVersion: "1.0.0",
      generatedAt: "2026-07-21T11:58:00.000Z",
      descriptors: Object.freeze([
        Object.freeze({
          strategyId: "strategy-alpha",
          name: "Strategy Alpha",
          version: "1.0.0",
          lifecycleState: "ACTIVE",
          enabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-07-20T00:00:00.000Z",
          tags: Object.freeze(["trend"]),
          supportedRegimes: Object.freeze(["TRENDING_UP"]),
          parameters: Object.freeze({}),
          parameterDefinitions: Object.freeze([]),
          metadata: Object.freeze({}),
        }),
        Object.freeze({
          strategyId: "strategy-beta",
          name: "Strategy Beta",
          version: "1.0.0",
          lifecycleState: "CANDIDATE",
          enabled: true,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-07-20T00:00:00.000Z",
          tags: Object.freeze(["mean-reversion"]),
          supportedRegimes: Object.freeze(["RANGING"]),
          parameters: Object.freeze({}),
          parameterDefinitions: Object.freeze([]),
          metadata: Object.freeze({}),
        }),
      ]),
      performanceObservations: Object.freeze([]),
      riskObservations: Object.freeze([]),
      marketContexts: Object.freeze([]),
      metadata: Object.freeze({}),
    }),
    configuration: Object.freeze({
      objective: "BALANCED",
      minimumObservationSampleSize: 1,
      maximumHistoricalObservations: 1_000,
      featureNormalizationEnabled: true,
      patternMinimumSupport: 0.1,
      patternMinimumConfidence: 0.5,
      maximumPatterns: 100,
      rewardDecay: 0.9,
      positiveRewardThreshold: 0.2,
      negativeRewardThreshold: -0.2,
      weightConstraints: Object.freeze({
        minimumStrategyWeight: 0,
        maximumStrategyWeight: 1,
        maximumWeightChange: 0.2,
        maximumPortfolioTurnover: 0.25,
        reserveWeight: 0,
        normalizeToOne: true,
      }),
      evolutionConstraints: Object.freeze({
        enabled: true,
        maximumCandidatesPerRun: 10,
        maximumMutationsPerStrategy: 3,
        maximumParameterChangeRate: 0.2,
        minimumParentConfidence: 0.5,
        minimumCandidateConfidence: 0.5,
        allowCloning: true,
        allowMutation: true,
        allowCrossover: true,
        requireValidationBeforePromotion: true,
      }),
      promotionPolicy: Object.freeze({}),
      retirementPolicy: Object.freeze({}),
      safetyPolicy: Object.freeze({
        enabled: true,
        dryRun: false,
        requireHumanApprovalForPromotion: false,
        requireHumanApprovalForRetirement: false,
        requireHumanApprovalForEvolution: false,
        minimumDecisionConfidence: 0.5,
        maximumStrategiesChangedPerRun: 10,
        maximumPortfolioTurnover: 0.25,
        maximumAllowedRiskIncrease: 0.1,
        rejectOnValidationWarning: false,
        preserveAtLeastOneActiveStrategy: true,
      }),
    }),
    correlationId: "correlation-001",
    metadata: Object.freeze({ environment: "integration-test" }),
  }) as unknown as MetaLearningRunRequest;
}

function testSuccessfulRun(): void {
  const harness = createHarness();
  const manager = new AiMetaLearningManager(harness.dependencies);
  const outcome = manager.execute(createRequest());

  assert.equal(outcome.status, "COMPLETED");
  assert.equal("decision" in outcome ? outcome.decision : undefined, "APPLY");
  assert.equal(outcome.requestId, "request-001");
  assert.equal(outcome.portfolioId, "portfolio-main");
  assert.ok(Object.isFrozen(outcome));

  if (!("actionPlan" in outcome)) {
    fail(`Expected completed result but received ${outcome.status}.`);
  }
  const result = outcome as MetaLearningRunResult;

  assert.deepEqual(result.actionPlan.proposedWeights, {
    "strategy-alpha": 0.55,
    "strategy-beta": 0.45,
  });
  assert.equal(result.actionPlan.expectedPortfolioTurnover, 0.1);
  assert.equal(result.actionPlan.confidence, 0.9);
  assert.equal(result.actionPlan.lifecycleChanges.length, 0);
  assert.equal(result.actionPlan.evolutionCandidates.length, 0);
  assert.ok(Object.isFrozen(result.actionPlan));
  assert.ok(Object.isFrozen(result.actionPlan.proposedWeights));

  const expectedCalls = [
    "validateRequest",
    "featureExtractor",
    "patternMiner",
    "regimeLearningEngine",
    "strategyLearningEngine",
    "adaptiveWeightLearningEngine",
    "reinforcementFeedbackEngine",
    "strategyEvolutionEngine",
    "strategyPromotionEngine",
    "strategyRetirementEngine",
    "explainabilityEngine",
    "validateResult",
  ];
  assert.deepEqual(harness.calls, expectedCalls);

  assert.deepEqual(
    harness.events.map((event) => event.type),
    [
      "RUN_STARTED",
      "RUN_VALIDATED",
      "FEATURES_EXTRACTED",
      "PATTERNS_MINED",
      "REGIMES_LEARNED",
      "STRATEGIES_SCORED",
      "WEIGHTS_LEARNED",
      "FEEDBACK_APPLIED",
      "STRATEGIES_EVOLVED",
      "LIFECYCLE_EVALUATED",
      "EXPLANATION_GENERATED",
      "RUN_COMPLETED",
    ],
  );
  assert.equal(harness.outcomes.length, 1);
  assert.equal(harness.snapshots.length, 1);

  const snapshot = manager.snapshot();
  assert.equal(snapshot.totalRuns, 1);
  assert.equal(snapshot.completedRuns, 1);
  assert.equal(snapshot.rejectedRuns, 0);
  assert.equal(snapshot.failedRuns, 0);
  assert.equal(snapshot.activeStrategyCount, 1);
  assert.equal(snapshot.candidateStrategyCount, 1);
  assert.equal(snapshot.learnedPatternCount, 0);
  assert.equal(snapshot.learnedRegimeProfileCount, 0);
  assert.ok(Object.isFrozen(snapshot));
}

function testRejectedRun(): void {
  const harness = createHarness();
  harness.requestValidation = REJECTED;
  const manager = new AiMetaLearningManager(harness.dependencies);
  const outcome = manager.execute(createRequest());

  assert.equal(outcome.status, "REJECTED");
  assert.equal("stage" in outcome ? outcome.stage : undefined, "VALIDATED");
  assert.equal(
    "errorCode" in outcome ? outcome.errorCode : undefined,
    "META_LEARNING_REQUEST_REJECTED",
  );
  assert.deepEqual(harness.calls, ["validateRequest"]);
  assert.deepEqual(
    harness.events.map((event) => event.type),
    ["RUN_STARTED", "RUN_REJECTED"],
  );
  assert.equal(harness.outcomes.length, 1);
  assert.equal(harness.snapshots.length, 1);

  const snapshot = manager.snapshot();
  assert.equal(snapshot.totalRuns, 1);
  assert.equal(snapshot.completedRuns, 0);
  assert.equal(snapshot.rejectedRuns, 1);
  assert.equal(snapshot.failedRuns, 0);
}

function testEngineFailure(): void {
  const harness = createHarness();
  harness.failureStage = "patternMiner";
  const manager = new AiMetaLearningManager(harness.dependencies);
  const outcome = manager.execute(createRequest());

  assert.equal(outcome.status, "FAILED");
  assert.equal("stage" in outcome ? outcome.stage : undefined, "MINING_PATTERNS");
  assert.match(
    "message" in outcome ? outcome.message : "",
    /Synthetic patternMiner failure/u,
  );
  assert.deepEqual(harness.calls, [
    "validateRequest",
    "featureExtractor",
    "patternMiner",
  ]);
  assert.deepEqual(
    harness.events.map((event) => event.type),
    [
      "RUN_STARTED",
      "RUN_VALIDATED",
      "FEATURES_EXTRACTED",
      "RUN_FAILED",
    ],
  );

  const snapshot = manager.snapshot();
  assert.equal(snapshot.totalRuns, 1);
  assert.equal(snapshot.completedRuns, 0);
  assert.equal(snapshot.rejectedRuns, 0);
  assert.equal(snapshot.failedRuns, 1);
}

function testInvalidGeneratedResult(): void {
  const harness = createHarness();
  harness.resultValidation = Object.freeze({
    valid: false,
    issues: Object.freeze([
      Object.freeze({
        code: "INVALID_RESULT",
        severity: "ERROR" as const,
        path: "actionPlan",
        message: "Generated result is invalid.",
      }),
    ]),
  });
  const manager = new AiMetaLearningManager(harness.dependencies);
  const outcome = manager.execute(createRequest());

  assert.equal(outcome.status, "FAILED");
  assert.equal("stage" in outcome ? outcome.stage : undefined, "COMPLETED");
  assert.equal(
    "errorCode" in outcome ? outcome.errorCode : undefined,
    "INVALID_META_LEARNING_RESULT",
  );
}

function run(): void {
  testSuccessfulRun();
  testRejectedRun();
  testEngineFailure();
  testInvalidGeneratedResult();
  console.log("All AI meta-learning integration tests passed successfully.");
}

run();