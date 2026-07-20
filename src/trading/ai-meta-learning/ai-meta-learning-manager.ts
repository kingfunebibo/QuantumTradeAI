/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 13:
 * src/trading/ai-meta-learning/ai-meta-learning-manager.ts
 *
 * Deterministic production-grade orchestrator for the autonomous meta-learning
 * subsystem.
 */

import {
  type AiMetaLearningManagerPort,
  type MetaLearningActionPlan,
  type MetaLearningDecision,
  type MetaLearningEvent,
  type MetaLearningEventPublisher,
  type MetaLearningExecutionOutcome,
  type MetaLearningLifecycleChange,
  type MetaLearningLogger,
  type MetaLearningManagerDependencies,
  type MetaLearningManagerSnapshot,
  type MetaLearningPersistencePort,
  type MetaLearningRunFailure,
  type MetaLearningRunRequest,
  type MetaLearningRunResult,
  type MetaLearningRunStatus,
  type MetaLearningSafetyPolicy,
  type MetaLearningValidationResult,
  type StrategyDescriptor,
  type StrategyEvolutionAction,
  type StrategyEvolutionCandidate,
  type StrategyLifecycleState,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;
const EMPTY_VALIDATION: MetaLearningValidationResult = Object.freeze({
  valid: true,
  issues: Object.freeze([]),
});

interface MutableManagerState {
  totalRuns: number;
  completedRuns: number;
  rejectedRuns: number;
  failedRuns: number;
  lastRunId?: string;
  lastCompletedAt?: string;
  activeStrategyCount: number;
  candidateStrategyCount: number;
  probationStrategyCount: number;
  retiredStrategyCount: number;
  learnedPatternCount: number;
  learnedRegimeProfileCount: number;
  cumulativePromotions: number;
  cumulativeRetirements: number;
  cumulativeEvolutionCandidates: number;
}

export interface AiMetaLearningManagerOptions {
  readonly persistOutcomes?: boolean;
  readonly persistSnapshots?: boolean;
  readonly publishEvents?: boolean;
  readonly failOnEventPublisherError?: boolean;
  readonly failOnPersistenceError?: boolean;
  readonly includeStageMetadata?: boolean;
}

export class AiMetaLearningManagerError extends Error {
  public readonly code: string;
  public readonly stage: MetaLearningRunStatus;
  public readonly causeValue?: unknown;

  public constructor(
    message: string,
    code = "AI_META_LEARNING_MANAGER_ERROR",
    stage: MetaLearningRunStatus = "FAILED",
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "AiMetaLearningManagerError";
    this.code = code;
    this.stage = stage;
    this.causeValue = causeValue;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AiMetaLearningManager implements AiMetaLearningManagerPort {
  private readonly dependencies: MetaLearningManagerDependencies;
  private readonly logger?: MetaLearningLogger;
  private readonly eventPublisher?: MetaLearningEventPublisher;
  private readonly persistence?: MetaLearningPersistencePort;
  private readonly persistOutcomes: boolean;
  private readonly persistSnapshots: boolean;
  private readonly publishEvents: boolean;
  private readonly failOnEventPublisherError: boolean;
  private readonly failOnPersistenceError: boolean;
  private readonly includeStageMetadata: boolean;
  private readonly state: MutableManagerState;

  public constructor(
    dependencies: MetaLearningManagerDependencies,
    options: AiMetaLearningManagerOptions = {},
  ) {
    assertDependencies(dependencies);
    this.dependencies = dependencies;
    this.logger = dependencies.logger;
    this.eventPublisher = dependencies.eventPublisher;
    this.persistence = dependencies.persistence;
    this.persistOutcomes = options.persistOutcomes ?? true;
    this.persistSnapshots = options.persistSnapshots ?? true;
    this.publishEvents = options.publishEvents ?? true;
    this.failOnEventPublisherError = options.failOnEventPublisherError ?? false;
    this.failOnPersistenceError = options.failOnPersistenceError ?? false;
    this.includeStageMetadata = options.includeStageMetadata ?? true;
    this.state = {
      totalRuns: 0,
      completedRuns: 0,
      rejectedRuns: 0,
      failedRuns: 0,
      activeStrategyCount: 0,
      candidateStrategyCount: 0,
      probationStrategyCount: 0,
      retiredStrategyCount: 0,
      learnedPatternCount: 0,
      learnedRegimeProfileCount: 0,
      cumulativePromotions: 0,
      cumulativeRetirements: 0,
      cumulativeEvolutionCandidates: 0,
    };
  }

  public execute(request: MetaLearningRunRequest): MetaLearningExecutionOutcome {
    const startedAt = safeNow(this.dependencies.clock);
    const runId = safeNextId(this.dependencies, "meta-learning-run");
    const requestIdentity = readRequestIdentity(request);
    let stage: MetaLearningRunStatus = "CREATED";

    this.state.totalRuns += 1;
    this.state.lastRunId = runId;

    this.log("info", "Meta-learning run started.", {
      runId,
      requestId: requestIdentity.requestId,
      portfolioId: requestIdentity.portfolioId,
    });

    try {
      this.emitEvent(
        runId,
        requestIdentity.requestId,
        requestIdentity.portfolioId,
        "RUN_STARTED",
        { startedAt },
      );

      const requestValidation = this.dependencies.validator.validateRequest(request);
      if (!requestValidation.valid) {
        return this.rejectRun(
          runId,
          requestIdentity.requestId,
          requestIdentity.portfolioId,
          startedAt,
          requestValidation,
          request,
        );
      }

      stage = "VALIDATED";
      this.emitEvent(runId, request.requestId, request.portfolioId, "RUN_VALIDATED", {
        issueCount: requestValidation.issues.length,
      });

      const generatedAt = safeNow(this.dependencies.clock);

      stage = "EXTRACTING_FEATURES";
      const featureExtraction = this.dependencies.featureExtractor.extract({
        requestId: request.requestId,
        timestamp: generatedAt,
        dataset: request.dataset,
        normalize: request.configuration.featureNormalizationEnabled,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "FEATURES_EXTRACTED", {
        featureVectorCount: featureExtraction.featureVectors.length,
        rejectedObservationCount: featureExtraction.rejectedObservationIds.length,
      });

      stage = "MINING_PATTERNS";
      const patternMining = this.dependencies.patternMiner.mine({
        requestId: request.requestId,
        generatedAt,
        featureVectors: featureExtraction.featureVectors,
        observations: request.dataset.performanceObservations,
        minimumSupport: request.configuration.patternMinimumSupport,
        minimumConfidence: request.configuration.patternMinimumConfidence,
        minimumSampleSize: request.configuration.minimumObservationSampleSize,
        maximumPatterns: request.configuration.maximumPatterns,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "PATTERNS_MINED", {
        patternCount: patternMining.patterns.length,
        rejectedPatternCount: patternMining.rejectedPatternCount,
      });

      stage = "LEARNING_REGIMES";
      const regimeLearning = this.dependencies.regimeLearningEngine.learn({
        requestId: request.requestId,
        generatedAt,
        marketContexts: request.dataset.marketContexts,
        featureVectors: featureExtraction.featureVectors,
        observations: request.dataset.performanceObservations,
        knownPatterns: patternMining.patterns,
        minimumSampleSize: request.configuration.minimumObservationSampleSize,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "REGIMES_LEARNED", {
        profileCount: regimeLearning.profiles.length,
        unknownContextCount: regimeLearning.unknownContextIds.length,
      });

      const strategyLearning = this.dependencies.strategyLearningEngine.learn({
        requestId: request.requestId,
        generatedAt,
        objective: request.configuration.objective,
        descriptors: request.dataset.descriptors,
        observations: request.dataset.performanceObservations,
        featureVectors: featureExtraction.featureVectors,
        regimeProfiles: regimeLearning.profiles,
        patterns: patternMining.patterns,
        minimumSampleSize: request.configuration.minimumObservationSampleSize,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "STRATEGIES_SCORED", {
        scoreCount: strategyLearning.scores.length,
        bestStrategyCount: strategyLearning.bestStrategyIds.length,
        underperformingStrategyCount:
          strategyLearning.underperformingStrategyIds.length,
      });

      stage = "LEARNING_WEIGHTS";
      const weightLearning = this.dependencies.adaptiveWeightLearningEngine.learn({
        requestId: request.requestId,
        generatedAt,
        currentWeights: request.currentStrategyWeights,
        learningScores: strategyLearning.scores,
        riskObservations: request.dataset.riskObservations,
        regimeProfiles: regimeLearning.profiles,
        activeRegime: request.activeRegime,
        activeRegimeConfidence: request.activeRegimeConfidence,
        constraints: request.configuration.weightConstraints,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "WEIGHTS_LEARNED", {
        strategyWeightCount: weightLearning.weights.length,
        expectedTurnover: weightLearning.expectedTurnover,
        confidence: weightLearning.confidence,
      });

      stage = "APPLYING_FEEDBACK";
      const reinforcementFeedback =
        this.dependencies.reinforcementFeedbackEngine.apply({
          requestId: request.requestId,
          generatedAt,
          observations: request.dataset.performanceObservations,
          learningScores: strategyLearning.scores,
          previousStates: request.previousReinforcementStates,
          rewardDecay: request.configuration.rewardDecay,
          positiveThreshold: request.configuration.positiveRewardThreshold,
          negativeThreshold: request.configuration.negativeRewardThreshold,
        });
      this.emitEvent(runId, request.requestId, request.portfolioId, "FEEDBACK_APPLIED", {
        eventCount: reinforcementFeedback.events.length,
        stateCount: reinforcementFeedback.states.length,
      });

      stage = "EVOLVING_STRATEGIES";
      const strategyEvolution = this.dependencies.strategyEvolutionEngine.evolve({
        requestId: request.requestId,
        generatedAt,
        descriptors: request.dataset.descriptors,
        learningScores: strategyLearning.scores,
        patterns: patternMining.patterns,
        regimeProfiles: regimeLearning.profiles,
        reinforcementStates: reinforcementFeedback.states,
        constraints: request.configuration.evolutionConstraints,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "STRATEGIES_EVOLVED", {
        candidateCount: strategyEvolution.candidates.length,
        unchangedStrategyCount: strategyEvolution.unchangedStrategyIds.length,
      });

      stage = "EVALUATING_LIFECYCLE";
      const promotion = this.dependencies.strategyPromotionEngine.evaluate({
        requestId: request.requestId,
        generatedAt,
        descriptors: request.dataset.descriptors,
        learningScores: strategyLearning.scores,
        reinforcementStates: reinforcementFeedback.states,
        policy: request.configuration.promotionPolicy,
      });
      const retirement = this.dependencies.strategyRetirementEngine.evaluate({
        requestId: request.requestId,
        generatedAt,
        descriptors: request.dataset.descriptors,
        observations: request.dataset.performanceObservations,
        learningScores: strategyLearning.scores,
        reinforcementStates: reinforcementFeedback.states,
        regimeProfiles: regimeLearning.profiles,
        policy: request.configuration.retirementPolicy,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "LIFECYCLE_EVALUATED", {
        promotedStrategyCount: promotion.promotedStrategyIds.length,
        retiredStrategyCount: retirement.retiredStrategyIds.length,
        probationStrategyCount: retirement.probationStrategyIds.length,
      });

      stage = "EXPLAINING";
      const explainability = this.dependencies.explainabilityEngine.explain({
        requestId: request.requestId,
        generatedAt,
        learningResult: strategyLearning,
        weightLearningResult: weightLearning,
        feedbackResult: reinforcementFeedback,
        evolutionResult: strategyEvolution,
        promotionResult: promotion,
        retirementResult: retirement,
        patterns: patternMining.patterns,
        regimeProfiles: regimeLearning.profiles,
      });
      this.emitEvent(runId, request.requestId, request.portfolioId, "EXPLANATION_GENERATED", {
        strategyExplanationCount: explainability.strategyExplanations.length,
        confidence: explainability.confidence,
      });

      const actionPlan = buildActionPlan(
        generatedAt,
        request.dataset.descriptors,
        request.currentStrategyWeights,
        weightLearning.weights,
        strategyEvolution.candidates,
        promotion.assessments,
        retirement.assessments,
        request.configuration.safetyPolicy,
        weightLearning.expectedTurnover,
        weightLearning.confidence,
      );

      const completedAt = safeNow(this.dependencies.clock);
      const warnings = uniqueSorted([
        ...featureExtraction.warnings,
        ...patternMining.warnings,
        ...regimeLearning.warnings,
        ...strategyLearning.warnings,
        ...weightLearning.warnings,
        ...reinforcementFeedback.warnings,
        ...strategyEvolution.warnings,
        ...promotion.warnings,
        ...retirement.warnings,
        ...explainability.warnings,
        ...requestValidation.issues
          .filter((issue) => issue.severity === "WARNING")
          .map((issue) => `${issue.code}: ${issue.message}`),
      ]);

      const provisionalResult = freezeRunResult({
        runId,
        requestId: request.requestId,
        portfolioId: request.portfolioId,
        status: "COMPLETED",
        decision: actionPlan.decision,
        startedAt,
        completedAt,
        featureExtraction,
        patternMining,
        regimeLearning,
        strategyLearning,
        weightLearning,
        reinforcementFeedback,
        strategyEvolution,
        promotion,
        retirement,
        explainability,
        actionPlan,
        validation: EMPTY_VALIDATION,
        warnings,
        metadata: freezeRecord({
          ...request.metadata,
          ...(request.correlationId === undefined
            ? {}
            : { correlationId: request.correlationId }),
          sourceDatasetId: request.dataset.datasetId,
          sourceVersion: request.dataset.sourceVersion,
          dryRun: request.configuration.safetyPolicy.dryRun,
          ...(this.includeStageMetadata
            ? { completedStage: "COMPLETED", generatedAt }
            : {}),
        }),
      });

      const resultValidation =
        this.dependencies.validator.validateResult(provisionalResult);
      if (!resultValidation.valid) {
        throw new AiMetaLearningManagerError(
          "The generated meta-learning result failed validation.",
          "INVALID_META_LEARNING_RESULT",
          "COMPLETED",
          resultValidation,
        );
      }

      const result = freezeRunResult({
        ...provisionalResult,
        validation: resultValidation,
      });

      this.updateCompletedState(result, request.dataset.descriptors);
      this.emitEvent(runId, request.requestId, request.portfolioId, "RUN_COMPLETED", {
        decision: result.decision,
        warningCount: result.warnings.length,
      });
      this.persist(result);

      this.log("info", "Meta-learning run completed.", {
        runId,
        requestId: request.requestId,
        decision: result.decision,
      });
      return result;
    } catch (error: unknown) {
      return this.failRun(
        runId,
        requestIdentity.requestId,
        requestIdentity.portfolioId,
        startedAt,
        stage,
        error,
        request,
      );
    }
  }

  public snapshot(): MetaLearningManagerSnapshot {
    return freezeSnapshot({
      generatedAt: safeNow(this.dependencies.clock),
      totalRuns: this.state.totalRuns,
      completedRuns: this.state.completedRuns,
      rejectedRuns: this.state.rejectedRuns,
      failedRuns: this.state.failedRuns,
      ...(this.state.lastRunId === undefined
        ? {}
        : { lastRunId: this.state.lastRunId }),
      ...(this.state.lastCompletedAt === undefined
        ? {}
        : { lastCompletedAt: this.state.lastCompletedAt }),
      activeStrategyCount: this.state.activeStrategyCount,
      candidateStrategyCount: this.state.candidateStrategyCount,
      probationStrategyCount: this.state.probationStrategyCount,
      retiredStrategyCount: this.state.retiredStrategyCount,
      learnedPatternCount: this.state.learnedPatternCount,
      learnedRegimeProfileCount: this.state.learnedRegimeProfileCount,
      cumulativePromotions: this.state.cumulativePromotions,
      cumulativeRetirements: this.state.cumulativeRetirements,
      cumulativeEvolutionCandidates: this.state.cumulativeEvolutionCandidates,
    });
  }

  private rejectRun(
    runId: string,
    requestId: string,
    portfolioId: string,
    startedAt: string,
    validation: MetaLearningValidationResult,
    request: MetaLearningRunRequest,
  ): MetaLearningRunFailure {
    const failure = freezeFailure({
      runId,
      requestId,
      portfolioId,
      status: "REJECTED",
      startedAt,
      completedAt: safeNow(this.dependencies.clock),
      stage: "VALIDATED",
      errorCode: "META_LEARNING_REQUEST_REJECTED",
      message: summarizeValidation(validation),
      validation,
      recoverable: true,
      metadata: failureMetadata(request, "VALIDATED"),
    });
    this.state.rejectedRuns += 1;
    this.emitEvent(runId, requestId, portfolioId, "RUN_REJECTED", {
      issueCount: validation.issues.length,
    });
    this.persist(failure);
    this.log("warn", "Meta-learning run rejected.", {
      runId,
      requestId,
      issueCount: validation.issues.length,
    });
    return failure;
  }

  private failRun(
    runId: string,
    requestId: string,
    portfolioId: string,
    startedAt: string,
    stage: MetaLearningRunStatus,
    error: unknown,
    request: MetaLearningRunRequest,
  ): MetaLearningRunFailure {
    const normalized = normalizeError(error, stage);
    const validation = extractValidation(error);
    const failure = freezeFailure({
      runId,
      requestId,
      portfolioId,
      status: "FAILED",
      startedAt,
      completedAt: safeNow(this.dependencies.clock),
      stage: normalized.stage,
      errorCode: normalized.code,
      message: normalized.message,
      ...(validation === undefined ? {} : { validation }),
      recoverable: isRecoverable(normalized.code, normalized.stage),
      metadata: failureMetadata(request, normalized.stage),
    });
    this.state.failedRuns += 1;
    this.emitEvent(runId, requestId, portfolioId, "RUN_FAILED", {
      stage: failure.stage,
      errorCode: failure.errorCode,
    });
    this.persist(failure);
    this.log("error", "Meta-learning run failed.", {
      runId,
      requestId,
      stage: failure.stage,
      errorCode: failure.errorCode,
      message: failure.message,
    });
    return failure;
  }

  private updateCompletedState(
    result: MetaLearningRunResult,
    descriptors: readonly StrategyDescriptor[],
  ): void {
    this.state.completedRuns += 1;
    this.state.lastCompletedAt = result.completedAt;
    this.state.activeStrategyCount = descriptors.filter(
      (item) => item.lifecycleState === "ACTIVE",
    ).length;
    this.state.candidateStrategyCount = descriptors.filter(
      (item) => item.lifecycleState === "CANDIDATE",
    ).length;
    this.state.probationStrategyCount = result.retirement.probationStrategyIds.length;
    this.state.retiredStrategyCount = descriptors.filter(
      (item) => item.lifecycleState === "RETIRED",
    ).length + result.retirement.retiredStrategyIds.length;
    this.state.learnedPatternCount = result.patternMining.patterns.length;
    this.state.learnedRegimeProfileCount = result.regimeLearning.profiles.length;
    this.state.cumulativePromotions += result.promotion.promotedStrategyIds.length;
    this.state.cumulativeRetirements += result.retirement.retiredStrategyIds.length;
    this.state.cumulativeEvolutionCandidates +=
      result.strategyEvolution.candidates.length;
  }

  private emitEvent(
    runId: string,
    requestId: string,
    portfolioId: string,
    type: MetaLearningEvent["type"],
    payload: Readonly<Record<string, unknown>>,
  ): void {
    if (!this.publishEvents || this.eventPublisher === undefined) {
      return;
    }
    const event: MetaLearningEvent = Object.freeze({
      eventId: safeNextId(this.dependencies, "meta-learning-event"),
      runId,
      requestId,
      portfolioId,
      timestamp: safeNow(this.dependencies.clock),
      type,
      payload: freezeRecord(payload),
    });
    try {
      this.eventPublisher.publish(event);
    } catch (error: unknown) {
      this.log("error", "Meta-learning event publication failed.", {
        runId,
        type,
        error: errorMessage(error),
      });
      if (this.failOnEventPublisherError) {
        throw new AiMetaLearningManagerError(
          `Failed to publish event '${type}'.`,
          "META_LEARNING_EVENT_PUBLICATION_FAILED",
          eventStage(type),
          error,
        );
      }
    }
  }

  private persist(outcome: MetaLearningExecutionOutcome): void {
    if (this.persistence === undefined) {
      return;
    }
    try {
      if (this.persistOutcomes) {
        this.persistence.saveOutcome(outcome);
      }
      if (this.persistSnapshots) {
        this.persistence.saveSnapshot(this.snapshot());
      }
    } catch (error: unknown) {
      this.log("error", "Meta-learning persistence failed.", {
        runId: outcome.runId,
        error: errorMessage(error),
      });
      if (this.failOnPersistenceError) {
        throw new AiMetaLearningManagerError(
          "Failed to persist the meta-learning outcome.",
          "META_LEARNING_PERSISTENCE_FAILED",
          "stage" in outcome ? outcome.stage : "COMPLETED",
          error,
        );
      }
    }
  }

  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    try {
      this.logger?.[level](message, context);
    } catch {
      // Logging is observational and must not alter deterministic outcomes.
    }
  }
}

export function createAiMetaLearningManager(
  dependencies: MetaLearningManagerDependencies,
  options: AiMetaLearningManagerOptions = {},
): AiMetaLearningManager {
  return new AiMetaLearningManager(dependencies, options);
}

function buildActionPlan(
  generatedAt: string,
  descriptors: readonly StrategyDescriptor[],
  currentWeights: Readonly<Record<string, number>>,
  learnedWeights: readonly {
    readonly strategyId: string;
    readonly boundedWeight: number;
    readonly confidence: number;
  }[],
  evolutionCandidates: readonly StrategyEvolutionCandidate[],
  promotionAssessments: readonly {
    readonly strategyId: string;
    readonly currentState: StrategyLifecycleState;
    readonly proposedState: StrategyLifecycleState;
    readonly decision: string;
    readonly confidence: number;
    readonly reasons: readonly string[];
  }[],
  retirementAssessments: readonly {
    readonly strategyId: string;
    readonly currentState: StrategyLifecycleState;
    readonly proposedState: StrategyLifecycleState;
    readonly decision: string;
    readonly confidence: number;
    readonly reasons: readonly string[];
  }[],
  policy: MetaLearningSafetyPolicy,
  expectedTurnover: number,
  weightConfidence: number,
): MetaLearningActionPlan {
  const blockedActions: string[] = [];
  const requiredApprovals: string[] = [];
  const lifecycleChanges: MetaLearningLifecycleChange[] = [];
  const descriptorById = new Map(descriptors.map((item) => [item.strategyId, item]));

  for (const assessment of [...promotionAssessments].sort(compareStrategyId)) {
    if (assessment.decision !== "PROMOTE") continue;
    const requiresApproval = policy.requireHumanApprovalForPromotion;
    lifecycleChanges.push(
      freezeLifecycleChange({
        strategyId: assessment.strategyId,
        previousState: assessment.currentState,
        proposedState: assessment.proposedState,
        action: "PROMOTE",
        requiresApproval,
        reason: assessment.reasons[0] ?? "Promotion criteria passed.",
      }),
    );
    if (requiresApproval) {
      requiredApprovals.push(`PROMOTION:${assessment.strategyId}`);
    }
  }

  for (const assessment of [...retirementAssessments].sort(compareStrategyId)) {
    if (
      assessment.decision !== "RETIRE" &&
      assessment.decision !== "PLACE_ON_PROBATION"
    ) {
      continue;
    }
    const action: StrategyEvolutionAction =
      assessment.decision === "RETIRE" ? "RETIRE" : "DEMOTE";
    const requiresApproval =
      assessment.decision === "RETIRE" && policy.requireHumanApprovalForRetirement;
    lifecycleChanges.push(
      freezeLifecycleChange({
        strategyId: assessment.strategyId,
        previousState: assessment.currentState,
        proposedState: assessment.proposedState,
        action,
        requiresApproval,
        reason: assessment.reasons[0] ?? "Lifecycle risk criteria were met.",
      }),
    );
    if (requiresApproval) {
      requiredApprovals.push(`RETIREMENT:${assessment.strategyId}`);
    }
  }

  const safeEvolutionCandidates: StrategyEvolutionCandidate[] = [];
  for (const candidate of [...evolutionCandidates].sort(compareCandidates)) {
    if (candidate.expectedRiskChange > policy.maximumAllowedRiskIncrease + EPSILON) {
      blockedActions.push(
        `EVOLUTION:${candidate.candidateId}:expected risk change exceeds policy limit.`,
      );
      continue;
    }
    if (candidate.confidence + EPSILON < policy.minimumDecisionConfidence) {
      blockedActions.push(
        `EVOLUTION:${candidate.candidateId}:confidence is below policy minimum.`,
      );
      continue;
    }
    safeEvolutionCandidates.push(candidate);
    if (policy.requireHumanApprovalForEvolution) {
      requiredApprovals.push(`EVOLUTION:${candidate.candidateId}`);
    }
  }

  const proposedWeights: Record<string, number> = {};
  for (const strategyId of Object.keys(currentWeights).sort()) {
    proposedWeights[strategyId] = finiteOrZero(currentWeights[strategyId]);
  }
  for (const item of [...learnedWeights].sort(compareStrategyId)) {
    proposedWeights[item.strategyId] = finiteOrZero(item.boundedWeight);
  }

  if (expectedTurnover > policy.maximumPortfolioTurnover + EPSILON) {
    blockedActions.push("REWEIGHT:expected portfolio turnover exceeds policy limit.");
    for (const strategyId of Object.keys(proposedWeights)) {
      proposedWeights[strategyId] = finiteOrZero(currentWeights[strategyId]);
    }
  }

  if (policy.preserveAtLeastOneActiveStrategy) {
    const activeIds = descriptors
      .filter((item) => item.lifecycleState === "ACTIVE")
      .map((item) => item.strategyId);
    const retiringActiveIds = new Set(
      lifecycleChanges
        .filter((item) => item.action === "RETIRE")
        .map((item) => item.strategyId),
    );
    if (activeIds.length > 0 && activeIds.every((id) => retiringActiveIds.has(id))) {
      const retained = [...activeIds].sort()[0];
      const index = lifecycleChanges.findIndex(
        (item) => item.strategyId === retained && item.action === "RETIRE",
      );
      if (index >= 0) lifecycleChanges.splice(index, 1);
      blockedActions.push(
        `RETIREMENT:${retained}:blocked to preserve at least one active strategy.`,
      );
    }
  }

  const changeCount =
    lifecycleChanges.length + safeEvolutionCandidates.length + countWeightChanges(currentWeights, proposedWeights);
  if (changeCount > policy.maximumStrategiesChangedPerRun) {
    blockedActions.push(
      `CHANGE_LIMIT:${changeCount} proposed changes exceed the maximum of ${policy.maximumStrategiesChangedPerRun}.`,
    );
  }

  const confidenceValues = [
    clamp01(weightConfidence),
    ...promotionAssessments
      .filter((item) => item.decision === "PROMOTE")
      .map((item) => clamp01(item.confidence)),
    ...retirementAssessments
      .filter((item) => item.decision === "RETIRE" || item.decision === "PLACE_ON_PROBATION")
      .map((item) => clamp01(item.confidence)),
    ...safeEvolutionCandidates.map((item) => clamp01(item.confidence)),
  ];
  const confidence = average(confidenceValues);
  const expectedRiskChange = safeEvolutionCandidates.reduce(
    (maximum, item) => Math.max(maximum, finiteOrZero(item.expectedRiskChange)),
    0,
  );

  let decision: MetaLearningDecision = "HOLD";
  const hasActions =
    lifecycleChanges.length > 0 ||
    safeEvolutionCandidates.length > 0 ||
    countWeightChanges(currentWeights, proposedWeights) > 0;
  if (!policy.enabled) {
    decision = "HOLD";
    blockedActions.push("SAFETY_POLICY:meta-learning actions are disabled.");
  } else if (confidence + EPSILON < policy.minimumDecisionConfidence) {
    decision = "DEFER";
    blockedActions.push("CONFIDENCE:combined action confidence is below policy minimum.");
  } else if (changeCount > policy.maximumStrategiesChangedPerRun) {
    decision = "DEFER";
  } else if (blockedActions.length > 0 && !hasActions) {
    decision = "REJECT";
  } else if (requiredApprovals.length > 0 || policy.dryRun) {
    decision = hasActions ? "DEFER" : "HOLD";
    if (policy.dryRun && hasActions) requiredApprovals.push("DRY_RUN_REVIEW");
  } else if (hasActions) {
    decision = "APPLY";
  }

  void descriptorById;
  return Object.freeze({
    decision,
    generatedAt,
    proposedWeights: freezeNumberRecord(proposedWeights),
    lifecycleChanges: Object.freeze([...lifecycleChanges].sort(compareLifecycleChanges)),
    evolutionCandidates: Object.freeze([...safeEvolutionCandidates]),
    blockedActions: Object.freeze(uniqueSorted(blockedActions)),
    requiredApprovals: Object.freeze(uniqueSorted(requiredApprovals)),
    expectedPortfolioTurnover: round(expectedTurnover),
    expectedRiskChange: round(expectedRiskChange),
    confidence: round(confidence),
  });
}

function assertDependencies(dependencies: MetaLearningManagerDependencies): void {
  if (dependencies === null || typeof dependencies !== "object") {
    throw new AiMetaLearningManagerError(
      "Meta-learning manager dependencies must be an object.",
      "INVALID_META_LEARNING_MANAGER_DEPENDENCIES",
    );
  }
  const requiredMethods: readonly [string, unknown, string][] = [
    ["clock", dependencies.clock, "now"],
    ["idGenerator", dependencies.idGenerator, "next"],
    ["validator", dependencies.validator, "validateRequest"],
    ["featureExtractor", dependencies.featureExtractor, "extract"],
    ["patternMiner", dependencies.patternMiner, "mine"],
    ["regimeLearningEngine", dependencies.regimeLearningEngine, "learn"],
    ["strategyLearningEngine", dependencies.strategyLearningEngine, "learn"],
    ["adaptiveWeightLearningEngine", dependencies.adaptiveWeightLearningEngine, "learn"],
    ["reinforcementFeedbackEngine", dependencies.reinforcementFeedbackEngine, "apply"],
    ["strategyEvolutionEngine", dependencies.strategyEvolutionEngine, "evolve"],
    ["strategyPromotionEngine", dependencies.strategyPromotionEngine, "evaluate"],
    ["strategyRetirementEngine", dependencies.strategyRetirementEngine, "evaluate"],
    ["explainabilityEngine", dependencies.explainabilityEngine, "explain"],
  ];
  for (const [name, value, method] of requiredMethods) {
    if (
      value === null ||
      typeof value !== "object" ||
      typeof (value as Record<string, unknown>)[method] !== "function"
    ) {
      throw new AiMetaLearningManagerError(
        `dependencies.${name}.${method} must be a function.`,
        "INVALID_META_LEARNING_MANAGER_DEPENDENCY",
      );
    }
  }
  if (typeof dependencies.validator.validateResult !== "function") {
    throw new AiMetaLearningManagerError(
      "dependencies.validator.validateResult must be a function.",
      "INVALID_META_LEARNING_MANAGER_DEPENDENCY",
    );
  }
}

function readRequestIdentity(request: MetaLearningRunRequest): {
  readonly requestId: string;
  readonly portfolioId: string;
} {
  const candidate = request as unknown as Record<string, unknown>;
  return {
    requestId:
      typeof candidate?.requestId === "string" && candidate.requestId.trim() !== ""
        ? candidate.requestId
        : "unknown-request",
    portfolioId:
      typeof candidate?.portfolioId === "string" && candidate.portfolioId.trim() !== ""
        ? candidate.portfolioId
        : "unknown-portfolio",
  };
}

function safeNow(clock: { now(): string }): string {
  const value = clock.now();
  if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(Date.parse(value))) {
    throw new AiMetaLearningManagerError(
      "Meta-learning clock returned an invalid timestamp.",
      "INVALID_META_LEARNING_CLOCK_TIMESTAMP",
      "FAILED",
    );
  }
  return value;
}

function safeNextId(
  dependencies: Pick<MetaLearningManagerDependencies, "idGenerator">,
  prefix: string,
): string {
  const value = dependencies.idGenerator.next(prefix);
  if (typeof value !== "string" || value.trim() === "") {
    throw new AiMetaLearningManagerError(
      `Meta-learning id generator returned an invalid id for prefix '${prefix}'.`,
      "INVALID_META_LEARNING_GENERATED_ID",
      "FAILED",
    );
  }
  return value;
}

function normalizeError(
  error: unknown,
  fallbackStage: MetaLearningRunStatus,
): AiMetaLearningManagerError {
  if (error instanceof AiMetaLearningManagerError) return error;
  const record = isRecord(error) ? error : undefined;
  const code =
    typeof record?.code === "string" && record.code.trim() !== ""
      ? record.code
      : "META_LEARNING_EXECUTION_FAILED";
  return new AiMetaLearningManagerError(
    errorMessage(error),
    code,
    fallbackStage,
    error,
  );
}

function extractValidation(error: unknown): MetaLearningValidationResult | undefined {
  if (!isRecord(error)) return undefined;
  const validation = error.validation;
  if (!isRecord(validation) || typeof validation.valid !== "boolean" || !Array.isArray(validation.issues)) {
    return undefined;
  }
  return validation as unknown as MetaLearningValidationResult;
}

function isRecoverable(code: string, stage: MetaLearningRunStatus): boolean {
  if (stage === "FAILED") return false;
  return !code.includes("DEPENDENCY") && !code.includes("CLOCK") && !code.includes("GENERATED_ID");
}

function failureMetadata(
  request: MetaLearningRunRequest,
  stage: MetaLearningRunStatus,
): Readonly<Record<string, unknown>> {
  const record: Record<string, unknown> = isRecord(request)
    ? (request as unknown as Record<string, unknown>)
    : {};
  const metadata = isRecord(record["metadata"])
    ? (record["metadata"] as Record<string, unknown>)
    : {};
  return freezeRecord({
    ...metadata,
    stage,
    ...(typeof record["correlationId"] === "string"
      ? { correlationId: record["correlationId"] }
      : {}),
  });
}

function summarizeValidation(validation: MetaLearningValidationResult): string {
  const errors = validation.issues.filter((issue) => issue.severity === "ERROR");
  if (errors.length === 0) return "Meta-learning request was rejected by validation policy.";
  const first = errors[0];
  return `Meta-learning request validation failed with ${errors.length} error(s). First error: ${first.code} at ${first.path}: ${first.message}`;
}

function eventStage(type: MetaLearningEvent["type"]): MetaLearningRunStatus {
  const map: Record<MetaLearningEvent["type"], MetaLearningRunStatus> = {
    RUN_STARTED: "CREATED",
    RUN_VALIDATED: "VALIDATED",
    FEATURES_EXTRACTED: "EXTRACTING_FEATURES",
    PATTERNS_MINED: "MINING_PATTERNS",
    REGIMES_LEARNED: "LEARNING_REGIMES",
    STRATEGIES_SCORED: "LEARNING_REGIMES",
    WEIGHTS_LEARNED: "LEARNING_WEIGHTS",
    FEEDBACK_APPLIED: "APPLYING_FEEDBACK",
    STRATEGIES_EVOLVED: "EVOLVING_STRATEGIES",
    LIFECYCLE_EVALUATED: "EVALUATING_LIFECYCLE",
    EXPLANATION_GENERATED: "EXPLAINING",
    RUN_COMPLETED: "COMPLETED",
    RUN_REJECTED: "REJECTED",
    RUN_FAILED: "FAILED",
  };
  return map[type];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  if (typeof error === "string" && error.trim() !== "") return error;
  return "An unknown meta-learning execution error occurred.";
}

function freezeRunResult(result: MetaLearningRunResult): MetaLearningRunResult {
  return Object.freeze({
    ...result,
    warnings: Object.freeze([...result.warnings]),
    metadata: freezeRecord(result.metadata),
  });
}

function freezeFailure(failure: MetaLearningRunFailure): MetaLearningRunFailure {
  return Object.freeze({
    ...failure,
    metadata: freezeRecord(failure.metadata),
  });
}

function freezeSnapshot(snapshot: MetaLearningManagerSnapshot): MetaLearningManagerSnapshot {
  return Object.freeze({ ...snapshot });
}

function freezeLifecycleChange(
  change: MetaLearningLifecycleChange,
): MetaLearningLifecycleChange {
  return Object.freeze({ ...change });
}

function freezeRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...value });
}

function freezeNumberRecord(
  value: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.freeze({ ...value });
}

function compareStrategyId(
  left: { readonly strategyId: string },
  right: { readonly strategyId: string },
): number {
  return left.strategyId.localeCompare(right.strategyId);
}

function compareCandidates(
  left: StrategyEvolutionCandidate,
  right: StrategyEvolutionCandidate,
): number {
  return (
    right.confidence - left.confidence ||
    right.expectedImprovement - left.expectedImprovement ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

function compareLifecycleChanges(
  left: MetaLearningLifecycleChange,
  right: MetaLearningLifecycleChange,
): number {
  return left.strategyId.localeCompare(right.strategyId) || left.action.localeCompare(right.action);
}

function countWeightChanges(
  current: Readonly<Record<string, number>>,
  proposed: Readonly<Record<string, number>>,
): number {
  const keys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
  let count = 0;
  for (const key of keys) {
    if (Math.abs(finiteOrZero(current[key]) - finiteOrZero(proposed[key])) > EPSILON) count += 1;
  }
  return count;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ""))].sort();
}

function average(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return clamp01(finite.reduce((total, value) => total + value, 0) / finite.length);
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number, precision = 12): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}