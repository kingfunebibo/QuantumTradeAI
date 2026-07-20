/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/ai-strategy-portfolio-manager.ts
 *
 * Purpose:
 * Coordinates the complete deterministic strategy-portfolio decision pipeline.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  type AiStrategyAllocationRequest,
  type AiStrategyAllocationResult,
  type AiStrategyAutonomousManagerPolicy,
  type AiStrategyAutonomousManagerSnapshot,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyCapitalAllocationEnginePort,
  type AiStrategyCorrelationMatrix,
  type AiStrategyDecisionStatus,
  type AiStrategyDiversificationEnginePort,
  type AiStrategyDiversificationResult,
  type AiStrategyEnsembleAssessment,
  type AiStrategyEnsembleDefinition,
  type AiStrategyEnsembleManagerPort,
  type AiStrategyIntelligenceType,
  type AiStrategyPortfolioDecision,
  type AiStrategyPortfolioExplainabilityPort,
  type AiStrategyPortfolioId,
  type AiStrategyPortfolioManagerPort,
  type AiStrategyPortfolioRunId,
  type AiStrategyPortfolioRunRequest,
  type AiStrategyPortfolioState,
  type AiStrategyPortfolioValidatorPort,
  type AiStrategyRankingEnginePort,
  type AiStrategyRankingResult,
  type AiStrategyRegimeFitness,
  type AiStrategyRegimeSelectorPort,
  type AiStrategyRiskBalancerPort,
  type AiStrategyRiskBudget,
  type AiStrategyRiskBudgetConstraint,
  type AiStrategyRotationEnginePort,
  type AiStrategyRotationPlan,
  type AiStrategyScoreEnginePort,
  type AiStrategyScoreResult,
} from "./ai-strategy-portfolio-contracts";
import { AiStrategyPortfolioValidator } from "./ai-strategy-portfolio-validator";
import { RegimeStrategySelector } from "./regime-strategy-selector";
import { StrategyScoreEngine } from "./strategy-score-engine";
import { StrategyRankingEngine } from "./strategy-ranking-engine";
import { StrategyDiversificationEngine } from "./strategy-diversification-engine";
import { StrategyCapitalAllocationEngine } from "./strategy-capital-allocation-engine";
import { StrategyRotationEngine } from "./strategy-rotation-engine";
import { CrossStrategyRiskBalancer } from "./cross-strategy-risk-balancer";
import { StrategyEnsembleManager } from "./strategy-ensemble-manager";
import { StrategyPortfolioExplainabilityEngine } from "./strategy-portfolio-explainability-engine";

const EPSILON = 1e-12;
const DEFAULT_MAXIMUM_DECISION_HISTORY = 1_000;
const DEFAULT_MAXIMUM_RUN_DURATION_MILLISECONDS = 60_000;
const DEFAULT_MAXIMUM_HIGH_RISK_WEIGHT = 0.25;
const DEFAULT_MINIMUM_CASH_RESERVE_WEIGHT = 0;

export type AiStrategyPortfolioManagerClock = () => UnixTimestampMilliseconds;

export type AiStrategyPortfolioManagerIdFactory = (
  prefix: string,
  request: AiStrategyPortfolioRunRequest,
) => string;

export interface AiStrategyRiskBudgetFactoryContext {
  readonly request: AiStrategyPortfolioRunRequest;
  readonly regimeFitness: readonly AiStrategyRegimeFitness[];
  readonly scoring: AiStrategyScoreResult;
  readonly ranking: AiStrategyRankingResult;
  readonly diversification: AiStrategyDiversificationResult;
  readonly correlationMatrix: AiStrategyCorrelationMatrix;
}

export interface AiStrategyRiskBudgetFactory {
  create(context: AiStrategyRiskBudgetFactoryContext): AiStrategyRiskBudget;
}

export interface AiStrategyPortfolioManagerDependencies {
  readonly validator?: AiStrategyPortfolioValidatorPort;
  readonly regimeSelector?: AiStrategyRegimeSelectorPort;
  readonly scoreEngine?: AiStrategyScoreEnginePort;
  readonly rankingEngine?: AiStrategyRankingEnginePort;
  readonly diversificationEngine?: AiStrategyDiversificationEnginePort;
  readonly allocationEngine?: AiStrategyCapitalAllocationEnginePort;
  readonly rotationEngine?: AiStrategyRotationEnginePort;
  readonly riskBalancer?: AiStrategyRiskBalancerPort;
  readonly ensembleManager?: AiStrategyEnsembleManagerPort;
  readonly explainabilityEngine?: AiStrategyPortfolioExplainabilityPort;
  readonly riskBudgetFactory?: AiStrategyRiskBudgetFactory;
}

export interface AiStrategyPortfolioManagerOptions {
  readonly policy?: Partial<AiStrategyAutonomousManagerPolicy>;
  readonly dependencies?: AiStrategyPortfolioManagerDependencies;
  readonly clock?: AiStrategyPortfolioManagerClock;
  readonly idFactory?: AiStrategyPortfolioManagerIdFactory;
  readonly maximumHighRiskWeight?: number;
  readonly minimumCashReserveWeight?: number;
  readonly metadata?: StrategyMetadata;
}

export class AiStrategyPortfolioManagerError extends Error {
  public readonly code: string;
  public readonly runId?: AiStrategyPortfolioRunId;
  public readonly cause?: unknown;

  public constructor(
    code: string,
    message: string,
    runId?: AiStrategyPortfolioRunId,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AiStrategyPortfolioManagerError";
    this.code = code;
    this.runId = runId;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface NormalizedManagerPolicy extends AiStrategyAutonomousManagerPolicy {
  readonly metadata: StrategyMetadata;
}

interface NormalizedOptions {
  readonly policy: NormalizedManagerPolicy;
  readonly clock: AiStrategyPortfolioManagerClock;
  readonly idFactory: AiStrategyPortfolioManagerIdFactory;
  readonly maximumHighRiskWeight: number;
  readonly minimumCashReserveWeight: number;
  readonly metadata: StrategyMetadata;
}

interface PipelineResult {
  readonly regimeFitness: readonly AiStrategyRegimeFitness[];
  readonly scoring: AiStrategyScoreResult;
  readonly ranking: AiStrategyRankingResult;
  readonly correlationMatrix: AiStrategyCorrelationMatrix;
  readonly diversification: AiStrategyDiversificationResult;
  readonly allocation: AiStrategyAllocationResult;
  readonly rotationPlan: AiStrategyRotationPlan;
  readonly ensembles: readonly AiStrategyEnsembleDefinition[];
  readonly ensembleAssessments: readonly AiStrategyEnsembleAssessment[];
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite number greater than or equal to zero.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function freezeMetadata(...sources: readonly StrategyMetadata[]): StrategyMetadata {
  return Object.freeze(Object.assign({}, ...sources));
}

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function stableUnique(values: readonly string[]): readonly string[] {
  return freezeArray(
    [...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
}

function defaultIdFactory(
  prefix: string,
  request: AiStrategyPortfolioRunRequest,
): string {
  return `${prefix}:${request.configuration.portfolioId}:${request.runId}:${request.timestamp}`;
}

function normalizePolicy(
  policy: Partial<AiStrategyAutonomousManagerPolicy> | undefined,
  metadata: StrategyMetadata,
): NormalizedManagerPolicy {
  const normalized: NormalizedManagerPolicy = Object.freeze({
    enabled: policy?.enabled ?? true,
    minimumRunIntervalMilliseconds:
      policy?.minimumRunIntervalMilliseconds ?? 0,
    maximumRunDurationMilliseconds:
      policy?.maximumRunDurationMilliseconds ??
      DEFAULT_MAXIMUM_RUN_DURATION_MILLISECONDS,
    continueOnCandidateFailure: policy?.continueOnCandidateFailure ?? false,
    continueOnExplainabilityFailure:
      policy?.continueOnExplainabilityFailure ?? false,
    rejectConcurrentRuns: policy?.rejectConcurrentRuns ?? true,
    maximumDecisionHistory:
      policy?.maximumDecisionHistory ?? DEFAULT_MAXIMUM_DECISION_HISTORY,
    metadata: freezeMetadata(metadata, policy?.metadata ?? EMPTY_STRATEGY_METADATA),
  });

  assertFiniteNonNegative(
    normalized.minimumRunIntervalMilliseconds,
    "policy.minimumRunIntervalMilliseconds",
  );
  assertFiniteNonNegative(
    normalized.maximumRunDurationMilliseconds,
    "policy.maximumRunDurationMilliseconds",
  );
  if (
    !Number.isInteger(normalized.maximumDecisionHistory) ||
    normalized.maximumDecisionHistory < 0
  ) {
    throw new Error("policy.maximumDecisionHistory must be a non-negative integer.");
  }

  return normalized;
}

function normalizeOptions(options: AiStrategyPortfolioManagerOptions): NormalizedOptions {
  const metadata = freezeMetadata(
    EMPTY_STRATEGY_METADATA,
    options.metadata ?? EMPTY_STRATEGY_METADATA,
  );
  const maximumHighRiskWeight =
    options.maximumHighRiskWeight ?? DEFAULT_MAXIMUM_HIGH_RISK_WEIGHT;
  const minimumCashReserveWeight =
    options.minimumCashReserveWeight ?? DEFAULT_MINIMUM_CASH_RESERVE_WEIGHT;
  assertUnitInterval(maximumHighRiskWeight, "maximumHighRiskWeight");
  assertUnitInterval(minimumCashReserveWeight, "minimumCashReserveWeight");

  return Object.freeze({
    policy: normalizePolicy(options.policy, metadata),
    clock: options.clock ?? Date.now,
    idFactory: options.idFactory ?? defaultIdFactory,
    maximumHighRiskWeight,
    minimumCashReserveWeight,
    metadata,
  });
}

function isDeterministicIntelligence(type: AiStrategyIntelligenceType): boolean {
  return (
    type === "DETERMINISTIC_RULE_BASED" ||
    type === "DETERMINISTIC_ARBITRAGE"
  );
}

function immutableCurrentAllocation(
  allocation: AiStrategyAllocationResult["allocations"][number],
  metadata: StrategyMetadata,
) {
  return Object.freeze({
    candidateId: allocation.candidateId,
    weight: allocation.targetWeight,
    capital: allocation.targetCapital,
    active: allocation.targetWeight > EPSILON,
    metadata: freezeMetadata(metadata, allocation.metadata),
  });
}

function buildNextState(
  request: AiStrategyPortfolioRunRequest,
  decisionId: string,
  allocation: AiStrategyAllocationResult,
  ranking: AiStrategyRankingResult,
  completedAt: UnixTimestampMilliseconds,
): AiStrategyPortfolioState {
  const activeCandidateIds = allocation.allocations
    .filter((item) => item.targetWeight > EPSILON)
    .map((item) => item.candidateId);
  const activeSet = new Set(activeCandidateIds);
  const reserveCandidateIds = ranking.reserveCandidateIds.filter(
    (candidateId) => !activeSet.has(candidateId),
  );
  const knownCandidateIds = new Set(
    request.candidates.map((candidate) => candidate.identity.candidateId),
  );
  const suspendedCandidateIds = request.state.suspendedCandidateIds.filter((id) =>
    knownCandidateIds.has(id),
  );

  return Object.freeze({
    portfolioId: request.configuration.portfolioId,
    version: request.state.version + (request.dryRun ? 0 : 1),
    timestamp: completedAt,
    activeCandidateIds: stableUnique(activeCandidateIds),
    reserveCandidateIds: stableUnique(reserveCandidateIds),
    suspendedCandidateIds: stableUnique(suspendedCandidateIds),
    allocations: freezeArray(
      allocation.allocations
        .map((item) => immutableCurrentAllocation(item, request.metadata))
        .sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    ),
    lastRunId: request.runId,
    lastDecisionId: decisionId,
    lastRotationAt:
      allocation.expectedTurnover > EPSILON
        ? completedAt
        : request.state.lastRotationAt,
    lastRegime: request.regime.primaryRegime,
    metadata: freezeMetadata(request.state.metadata, request.metadata, {
      dryRun: request.dryRun ?? false,
    }),
  });
}

function classifyDecision(
  request: AiStrategyPortfolioRunRequest,
  allocation: AiStrategyAllocationResult,
  rotationPlan: AiStrategyRotationPlan,
): {
  readonly status: AiStrategyDecisionStatus;
  readonly approvalRequired: boolean;
  readonly executable: boolean;
  readonly warnings: readonly string[];
} {
  const warnings = [...allocation.warnings, ...rotationPlan.warnings];
  const riskBlocked =
    !request.risk.tradingAllowed ||
    request.risk.killSwitchActive ||
    request.risk.circuitBreakerActive;
  const approvalRequired =
    rotationPlan.requiresApproval ||
    request.configuration.safetyPolicy.requireRiskApproval ||
    request.configuration.operatingMode === "MANUAL" ||
    request.configuration.operatingMode === "AI_ADVISORY" ||
    request.configuration.operatingMode === "SEMI_AUTONOMOUS";

  if (riskBlocked) {
    warnings.push("Execution is blocked by the supplied strategy risk snapshot.");
    return Object.freeze({
      status: "REJECTED",
      approvalRequired: true,
      executable: false,
      warnings: stableUnique(warnings),
    });
  }

  if (!request.configuration.enabled) {
    warnings.push("The strategy portfolio configuration is disabled.");
    return Object.freeze({
      status: "DEFERRED",
      approvalRequired: false,
      executable: false,
      warnings: stableUnique(warnings),
    });
  }

  if (request.dryRun) {
    warnings.push("Dry-run mode prevents execution and state mutation.");
    return Object.freeze({
      status: "PROPOSED",
      approvalRequired,
      executable: false,
      warnings: stableUnique(warnings),
    });
  }

  return Object.freeze({
    status: approvalRequired ? "PROPOSED" : "APPROVED",
    approvalRequired,
    executable: !approvalRequired,
    warnings: stableUnique(warnings),
  });
}

class DefaultRiskBudgetFactory implements AiStrategyRiskBudgetFactory {
  public constructor(
    private readonly idFactory: AiStrategyPortfolioManagerIdFactory,
    private readonly maximumHighRiskWeight: number,
    private readonly minimumCashReserveWeight: number,
    private readonly metadata: StrategyMetadata,
  ) {}

  public create(context: AiStrategyRiskBudgetFactoryContext): AiStrategyRiskBudget {
    const { request } = context;
    const configuration = request.configuration;
    const allocationPolicy = configuration.allocationPolicy;
    const riskLimits = request.risk.limits;
    const minimumCashReserveWeight = allocationPolicy.allowCashReserve
      ? this.minimumCashReserveWeight
      : 0;
    const reservedCapital = configuration.totalCapital * minimumCashReserveWeight;
    const constraints: AiStrategyRiskBudgetConstraint = Object.freeze({
      maximumStrategyWeight: allocationPolicy.maximumAllocationWeight,
      maximumFamilyWeight: configuration.diversificationPolicy.maximumFamilyWeight,
      maximumIntelligenceTypeWeight: Math.max(
        configuration.safetyPolicy.maximumAiNativeWeight,
        configuration.safetyPolicy.maximumAiAssistedWeight,
        configuration.safetyPolicy.maximumNonDeterministicWeight,
      ),
      maximumHighRiskWeight: this.maximumHighRiskWeight,
      minimumCashReserveWeight,
      maximumPortfolioDrawdown: riskLimits.maximumDrawdown,
      maximumTurnover: configuration.rotationPolicy.maximumRotationTurnover,
      metadata: freezeMetadata(this.metadata, request.metadata, {
        component: "ai-strategy-portfolio-manager-risk-budget",
      }),
    });

    return Object.freeze({
      riskBudgetId: this.idFactory("strategy-risk-budget", request),
      portfolioId: configuration.portfolioId,
      timestamp: request.timestamp,
      totalCapital: configuration.totalCapital,
      deployableCapital: Math.max(0, configuration.totalCapital - reservedCapital),
      reservedCapital,
      constraints,
      risk: request.risk,
      metadata: freezeMetadata(this.metadata, request.metadata),
    });
  }
}

export class AiStrategyPortfolioManager implements AiStrategyPortfolioManagerPort {
  private readonly options: NormalizedOptions;
  private readonly validator: AiStrategyPortfolioValidatorPort;
  private readonly regimeSelector: AiStrategyRegimeSelectorPort;
  private readonly scoreEngine: AiStrategyScoreEnginePort;
  private readonly rankingEngine: AiStrategyRankingEnginePort;
  private readonly diversificationEngine: AiStrategyDiversificationEnginePort;
  private readonly allocationEngine: AiStrategyCapitalAllocationEnginePort;
  private readonly rotationEngine: AiStrategyRotationEnginePort;
  private readonly riskBalancer: AiStrategyRiskBalancerPort;
  private readonly ensembleManager: AiStrategyEnsembleManagerPort;
  private readonly explainabilityEngine: AiStrategyPortfolioExplainabilityPort;
  private readonly riskBudgetFactory: AiStrategyRiskBudgetFactory;
  private readonly activeRunIds = new Set<AiStrategyPortfolioRunId>();
  private readonly decisionHistory: AiStrategyPortfolioDecision[] = [];
  private readonly lastRunAtByPortfolio = new Map<AiStrategyPortfolioId, number>();
  private totalRuns = 0;
  private successfulRuns = 0;
  private rejectedRuns = 0;
  private failedRuns = 0;

  public constructor(options: AiStrategyPortfolioManagerOptions = {}) {
    this.options = normalizeOptions(options);
    const dependencies = options.dependencies ?? {};
    this.validator = dependencies.validator ?? new AiStrategyPortfolioValidator({
      clock: this.options.clock,
    });
    this.regimeSelector = dependencies.regimeSelector ?? new RegimeStrategySelector();
    this.scoreEngine = dependencies.scoreEngine ?? new StrategyScoreEngine();
    this.rankingEngine = dependencies.rankingEngine ?? new StrategyRankingEngine();
    this.diversificationEngine =
      dependencies.diversificationEngine ?? new StrategyDiversificationEngine();
    this.allocationEngine =
      dependencies.allocationEngine ?? new StrategyCapitalAllocationEngine();
    this.rotationEngine = dependencies.rotationEngine ?? new StrategyRotationEngine();
    this.riskBalancer = dependencies.riskBalancer ?? new CrossStrategyRiskBalancer();
    this.ensembleManager = dependencies.ensembleManager ?? new StrategyEnsembleManager();
    this.explainabilityEngine =
      dependencies.explainabilityEngine ?? new StrategyPortfolioExplainabilityEngine();
    this.riskBudgetFactory =
      dependencies.riskBudgetFactory ??
      new DefaultRiskBudgetFactory(
        this.options.idFactory,
        this.options.maximumHighRiskWeight,
        this.options.minimumCashReserveWeight,
        this.options.metadata,
      );
  }

  public async run(
    request: AiStrategyPortfolioRunRequest,
  ): Promise<AiStrategyPortfolioDecision> {
    this.totalRuns += 1;
    this.guardRun(request);
    this.activeRunIds.add(request.runId);
    const startedAt = request.timestamp;

    try {
      const validation = this.validator.validateRunRequest(request);
      if (!validation.valid) {
        this.rejectedRuns += 1;
        throw new AiStrategyPortfolioManagerError(
          "INVALID_RUN_REQUEST",
          validation.issues
            .filter((issue) => issue.severity === "ERROR")
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join(" | ") || "The strategy portfolio run request is invalid.",
          request.runId,
        );
      }

      const candidates = this.filterCandidates(request);
      const pipeline = this.executePipeline(request, candidates);
      const decision = this.createDecision(request, candidates, pipeline, startedAt);
      this.recordDecision(decision);
      this.lastRunAtByPortfolio.set(request.configuration.portfolioId, request.timestamp);

      if (decision.status === "REJECTED") {
        this.rejectedRuns += 1;
      } else {
        this.successfulRuns += 1;
      }
      return decision;
    } catch (error: unknown) {
      if (!(error instanceof AiStrategyPortfolioManagerError)) {
        this.failedRuns += 1;
      }
      throw error instanceof AiStrategyPortfolioManagerError
        ? error
        : new AiStrategyPortfolioManagerError(
            "PIPELINE_FAILURE",
            error instanceof Error ? error.message : "Unknown portfolio manager failure.",
            request.runId,
            error,
          );
    } finally {
      this.activeRunIds.delete(request.runId);
    }
  }

  public snapshot(): AiStrategyAutonomousManagerSnapshot {
    const history = freezeArray(this.decisionHistory);
    return Object.freeze({
      activeRunIds: freezeArray([...this.activeRunIds].sort()),
      totalRuns: this.totalRuns,
      successfulRuns: this.successfulRuns,
      rejectedRuns: this.rejectedRuns,
      failedRuns: this.failedRuns,
      latestDecision: history.at(-1),
      decisionHistory: history,
      metadata: freezeMetadata(this.options.metadata, this.options.policy.metadata),
    });
  }

  private guardRun(request: AiStrategyPortfolioRunRequest): void {
    if (!this.options.policy.enabled) {
      throw new AiStrategyPortfolioManagerError(
        "MANAGER_DISABLED",
        "The AI strategy portfolio manager is disabled.",
        request.runId,
      );
    }
    if (this.activeRunIds.has(request.runId)) {
      throw new AiStrategyPortfolioManagerError(
        "DUPLICATE_RUN_ID",
        `Run ${request.runId} is already active.`,
        request.runId,
      );
    }
    if (this.options.policy.rejectConcurrentRuns && this.activeRunIds.size > 0) {
      throw new AiStrategyPortfolioManagerError(
        "CONCURRENT_RUN_REJECTED",
        "A strategy portfolio run is already active.",
        request.runId,
      );
    }
    const lastRunAt = this.lastRunAtByPortfolio.get(request.configuration.portfolioId);
    if (
      lastRunAt !== undefined &&
      !request.forceRebalance &&
      request.timestamp - lastRunAt < this.options.policy.minimumRunIntervalMilliseconds
    ) {
      throw new AiStrategyPortfolioManagerError(
        "RUN_INTERVAL_NOT_ELAPSED",
        "The minimum interval between portfolio runs has not elapsed.",
        request.runId,
      );
    }
  }

  private filterCandidates(
    request: AiStrategyPortfolioRunRequest,
  ): readonly AiStrategyCandidate[] {
    const candidates: AiStrategyCandidate[] = [];
    const failures: string[] = [];

    for (const candidate of [...request.candidates].sort((a, b) =>
      a.identity.candidateId.localeCompare(b.identity.candidateId),
    )) {
      const report = new AiStrategyPortfolioValidator({
        clock: () => request.timestamp,
      }).validateCandidate(candidate, request.timestamp);
      if (report.valid) {
        candidates.push(candidate);
      } else {
        failures.push(candidate.identity.candidateId);
      }
    }

    if (failures.length > 0 && !this.options.policy.continueOnCandidateFailure) {
      throw new AiStrategyPortfolioManagerError(
        "CANDIDATE_VALIDATION_FAILED",
        `Candidate validation failed for: ${failures.join(", ")}.`,
        request.runId,
      );
    }
    return freezeArray(candidates);
  }

  private executePipeline(
    request: AiStrategyPortfolioRunRequest,
    candidates: readonly AiStrategyCandidate[],
  ): PipelineResult {
    const regimeFitness = this.regimeSelector.assess(
      candidates,
      request.regime,
      request.timestamp,
    );
    const scoring = this.scoreEngine.score(
      Object.freeze({
        runId: request.runId,
        timestamp: request.timestamp,
        candidates,
        regime: request.regime,
        risk: request.risk,
        policy: request.configuration.scorePolicy,
        metadata: freezeMetadata(request.metadata, {
          performanceAttributionId:
            request.performanceAttribution?.attributionId ?? "",
        }),
      }),
    );
    const ranking = this.rankingEngine.rank(
      request.runId,
      request.timestamp,
      candidates,
      scoring.scores,
      regimeFitness,
      request.configuration.rankingPolicy,
    );
    const diversificationResult = this.diversificationEngine.analyze(
      request.timestamp,
      candidates,
      ranking,
      request.returnObservations,
      request.configuration.diversificationPolicy,
    );
    const riskBudget = this.riskBudgetFactory.create(
      Object.freeze({
        request,
        regimeFitness,
        scoring,
        ranking,
        diversification: diversificationResult.diversification,
        correlationMatrix: diversificationResult.correlationMatrix,
      }),
    );
    const allocationRequest: AiStrategyAllocationRequest = Object.freeze({
      allocationId: this.options.idFactory("strategy-allocation", request),
      runId: request.runId,
      portfolioId: request.configuration.portfolioId,
      timestamp: request.timestamp,
      totalCapital: request.configuration.totalCapital,
      candidates,
      scores: scoring.scores,
      ranking,
      diversification: diversificationResult.diversification,
      regimeFitness,
      currentAllocations: request.state.allocations,
      riskBudget,
      policy: request.configuration.allocationPolicy,
      metadata: freezeMetadata(this.options.metadata, request.metadata),
    });
    const preliminaryAllocation = this.allocationEngine.allocate(allocationRequest);
    const allocation = this.enforceSafetyAllocation(
      request,
      candidates,
      this.riskBalancer.balance(
        preliminaryAllocation,
        candidates,
        diversificationResult.correlationMatrix,
        riskBudget,
      ),
    );
    const rotationPlan = this.rotationEngine.plan(
      request.runId,
      request.configuration.portfolioId,
      request.timestamp,
      allocation,
      candidates,
      request.configuration.rotationPolicy,
      request.forceRebalance ?? false,
    );
    const ensembleResult = this.ensembleManager.build(
      request.configuration.portfolioId,
      request.timestamp,
      candidates,
      allocation,
      diversificationResult.correlationMatrix,
      request.regime,
    );

    return Object.freeze({
      regimeFitness,
      scoring,
      ranking,
      correlationMatrix: diversificationResult.correlationMatrix,
      diversification: diversificationResult.diversification,
      allocation,
      rotationPlan,
      ensembles: ensembleResult.ensembles,
      ensembleAssessments: ensembleResult.assessments,
    });
  }

  private enforceSafetyAllocation(
    request: AiStrategyPortfolioRunRequest,
    candidates: readonly AiStrategyCandidate[],
    allocation: AiStrategyAllocationResult,
  ): AiStrategyAllocationResult {
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.identity.candidateId, candidate]),
    );
    let aiNativeWeight = 0;
    let aiAssistedWeight = 0;
    let nonDeterministicWeight = 0;
    let deterministicWeight = 0;

    for (const item of allocation.allocations) {
      const intelligenceType = candidateById.get(item.candidateId)?.classification.intelligenceType;
      if (intelligenceType === undefined) continue;
      if (intelligenceType === "AI_NATIVE") aiNativeWeight += item.targetWeight;
      if (intelligenceType === "AI_ASSISTED") aiAssistedWeight += item.targetWeight;
      if (isDeterministicIntelligence(intelligenceType)) {
        deterministicWeight += item.targetWeight;
      } else {
        nonDeterministicWeight += item.targetWeight;
      }
    }

    const safety = request.configuration.safetyPolicy;
    const violations: string[] = [];
    if (aiNativeWeight > safety.maximumAiNativeWeight + EPSILON) {
      violations.push("AI-native allocation exceeds the configured safety limit.");
    }
    if (aiAssistedWeight > safety.maximumAiAssistedWeight + EPSILON) {
      violations.push("AI-assisted allocation exceeds the configured safety limit.");
    }
    if (nonDeterministicWeight > safety.maximumNonDeterministicWeight + EPSILON) {
      violations.push("Non-deterministic allocation exceeds the configured safety limit.");
    }
    if (safety.requireDeterministicFallback && deterministicWeight <= EPSILON) {
      violations.push("The allocation does not preserve a deterministic fallback strategy.");
    }

    if (violations.length === 0) return allocation;
    return Object.freeze({
      ...allocation,
      warnings: stableUnique([...allocation.warnings, ...violations]),
      metadata: freezeMetadata(allocation.metadata, {
        safetyPolicyViolation: true,
      }),
    });
  }

  private createDecision(
    request: AiStrategyPortfolioRunRequest,
    candidates: readonly AiStrategyCandidate[],
    pipeline: PipelineResult,
    startedAt: UnixTimestampMilliseconds,
  ): AiStrategyPortfolioDecision {
    const completedAt = Math.max(startedAt, this.options.clock());
    const durationMilliseconds = Math.max(0, completedAt - startedAt);
    if (durationMilliseconds > this.options.policy.maximumRunDurationMilliseconds) {
      throw new AiStrategyPortfolioManagerError(
        "MAXIMUM_RUN_DURATION_EXCEEDED",
        "The portfolio run exceeded the configured maximum duration.",
        request.runId,
      );
    }
    const decisionId = this.options.idFactory("strategy-portfolio-decision", request);
    let explanation;
    const explanationWarnings: string[] = [];
    try {
      explanation = this.explainabilityEngine.explain(
        decisionId,
        request.configuration.portfolioId,
        completedAt,
        candidates,
        pipeline.scoring,
        pipeline.ranking,
        pipeline.allocation,
        pipeline.rotationPlan,
      );
    } catch (error: unknown) {
      if (!this.options.policy.continueOnExplainabilityFailure) throw error;
      explanationWarnings.push(
        `Explainability engine failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      explanation = Object.freeze({
        explanationId: this.options.idFactory("strategy-explanation-fallback", request),
        decisionId,
        portfolioId: request.configuration.portfolioId,
        createdAt: completedAt,
        summary: "A deterministic fallback explanation was generated.",
        rationale: freezeArray(explanationWarnings),
        factors: freezeArray([]),
        warnings: freezeArray([]),
        selectedCandidateIds: pipeline.ranking.selectedCandidateIds,
        rejectedCandidateIds: pipeline.scoring.rejectedCandidateIds,
        deterministicFallbackCandidateIds: freezeArray(
          candidates
            .filter((candidate) =>
              isDeterministicIntelligence(candidate.classification.intelligenceType),
            )
            .map((candidate) => candidate.identity.candidateId)
            .sort(),
        ),
        confidence: 0,
        metadata: freezeMetadata(request.metadata, { fallback: true }),
      });
    }

    const classification = classifyDecision(
      request,
      pipeline.allocation,
      pipeline.rotationPlan,
    );
    const nextState = buildNextState(
      request,
      decisionId,
      pipeline.allocation,
      pipeline.ranking,
      completedAt,
    );

    return Object.freeze({
      decisionId,
      runId: request.runId,
      correlationId: request.correlationId,
      portfolioId: request.configuration.portfolioId,
      status: classification.status,
      operatingMode: request.configuration.operatingMode,
      startedAt,
      completedAt,
      durationMilliseconds,
      regime: request.regime,
      scoring: pipeline.scoring,
      ranking: pipeline.ranking,
      correlationMatrix: pipeline.correlationMatrix,
      diversification: pipeline.diversification,
      allocation: pipeline.allocation,
      rotationPlan: pipeline.rotationPlan,
      ensembles: pipeline.ensembles,
      ensembleAssessments: pipeline.ensembleAssessments,
      explanation,
      nextState,
      approvalRequired: classification.approvalRequired,
      executable: classification.executable,
      warnings: stableUnique([...classification.warnings, ...explanationWarnings]),
      errors: freezeArray([]),
      metadata: freezeMetadata(this.options.metadata, request.metadata, {
        candidateCount: candidates.length,
        performanceAttributionId:
          request.performanceAttribution?.attributionId ?? "",
      }),
    });
  }

  private recordDecision(decision: AiStrategyPortfolioDecision): void {
    if (this.options.policy.maximumDecisionHistory === 0) return;
    this.decisionHistory.push(decision);
    const overflow =
      this.decisionHistory.length - this.options.policy.maximumDecisionHistory;
    if (overflow > 0) this.decisionHistory.splice(0, overflow);
  }
}

export function createAiStrategyPortfolioManager(
  options: AiStrategyPortfolioManagerOptions = {},
): AiStrategyPortfolioManager {
  return new AiStrategyPortfolioManager(options);
}