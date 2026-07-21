/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 3:
 * src/trading/ai-decision-intelligence/decision-context-aggregator.ts
 *
 * Deterministically aggregates portfolio, market, strategy, risk, system-health,
 * governance and meta-learning evidence into a single immutable context assessment.
 */

import type { MarketRegime, StrategyRiskObservation } from "../ai-meta-learning/ai-meta-learning-contracts";
import type {
  DecisionContextAssessment,
  DecisionContextAssessorPort,
  DecisionIntelligenceId,
  DecisionIntelligenceRunRequest,
  DecisionMarketContext,
  DecisionStrategyId,
  StrategyDecisionState,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;
const UNKNOWN_REGIME: MarketRegime = "UNKNOWN";

export interface DecisionContextAggregatorOptions {
  readonly minimumEligibleStrategyHealth?: number;
  readonly minimumEligibleStrategyConfidence?: number;
  readonly minimumEligibleRegimeAlignment?: number;
  readonly minimumMarketDataQuality?: number;
  readonly minimumSystemReadiness?: number;
  readonly maximumPortfolioRiskScore?: number;
  readonly maximumContextAgeMs?: number;
  readonly includeObserveOnlyStrategies?: boolean;
  readonly includeShadowStrategies?: boolean;
  readonly strictSystemHealth?: boolean;
}

export interface DecisionContextAggregationDiagnostics {
  readonly portfolioScoreInputs: readonly number[];
  readonly opportunityScoreInputs: readonly number[];
  readonly marketRiskScoreInputs: readonly number[];
  readonly strategyScoreInputs: readonly number[];
  readonly executionScoreInputs: readonly number[];
  readonly systemScoreInputs: readonly number[];
  readonly evidenceScoreInputs: readonly number[];
  readonly regimeWeights: Readonly<Record<string, number>>;
}

export class DecisionContextAggregationError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "DECISION_CONTEXT_AGGREGATION_ERROR",
  ) {
    super(message);
    this.name = "DecisionContextAggregationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DecisionContextAggregator implements DecisionContextAssessorPort {
  private readonly minimumEligibleStrategyHealth: number;
  private readonly minimumEligibleStrategyConfidence: number;
  private readonly minimumEligibleRegimeAlignment: number;
  private readonly minimumMarketDataQuality: number;
  private readonly minimumSystemReadiness: number;
  private readonly maximumPortfolioRiskScore: number;
  private readonly maximumContextAgeMs: number;
  private readonly includeObserveOnlyStrategies: boolean;
  private readonly includeShadowStrategies: boolean;
  private readonly strictSystemHealth: boolean;

  public constructor(options: DecisionContextAggregatorOptions = {}) {
    this.minimumEligibleStrategyHealth = unit(
      options.minimumEligibleStrategyHealth ?? 0.45,
    );
    this.minimumEligibleStrategyConfidence = unit(
      options.minimumEligibleStrategyConfidence ?? 0.4,
    );
    this.minimumEligibleRegimeAlignment = unit(
      options.minimumEligibleRegimeAlignment ?? 0.35,
    );
    this.minimumMarketDataQuality = unit(
      options.minimumMarketDataQuality ?? 0.55,
    );
    this.minimumSystemReadiness = unit(
      options.minimumSystemReadiness ?? 0.65,
    );
    this.maximumPortfolioRiskScore = unit(
      options.maximumPortfolioRiskScore ?? 0.85,
    );
    this.maximumContextAgeMs = positive(
      options.maximumContextAgeMs ?? 5 * 60 * 1000,
    );
    this.includeObserveOnlyStrategies =
      options.includeObserveOnlyStrategies ?? false;
    this.includeShadowStrategies = options.includeShadowStrategies ?? true;
    this.strictSystemHealth = options.strictSystemHealth ?? true;
  }

  public assess(
    request: DecisionIntelligenceRunRequest,
  ): DecisionContextAssessment {
    this.assertRequestShape(request);

    const generatedAt = request.requestedAt;
    const activeRegime = this.determineActiveRegime(request.marketContexts);
    const portfolioHealthScore = this.calculatePortfolioHealth(request);
    const marketOpportunityScore = this.calculateMarketOpportunity(
      request.marketContexts,
    );
    const marketRiskScore = this.calculateMarketRisk(
      request.marketContexts,
      request.riskObservations,
      request.portfolio.portfolioRiskScore,
    );
    const regimeConfidence = this.calculateRegimeConfidence(
      request.marketContexts,
      activeRegime,
    );
    const strategyHealthScore = this.calculateStrategyHealth(
      request.strategyStates,
    );
    const executionReadinessScore = this.calculateExecutionReadiness(request);
    const systemReadinessScore = this.calculateSystemReadiness(request);
    const evidenceQualityScore = this.calculateEvidenceQuality(request);

    const eligibility = this.partitionStrategies(
      request.strategyStates,
      request.riskObservations,
      activeRegime,
      request,
    );

    const blockingConditions = this.buildBlockingConditions(
      request,
      portfolioHealthScore,
      marketRiskScore,
      executionReadinessScore,
      systemReadinessScore,
      evidenceQualityScore,
      eligibility.eligibleStrategyIds,
    );

    const warnings = this.buildWarnings(
      request,
      activeRegime,
      regimeConfidence,
      marketOpportunityScore,
      marketRiskScore,
      eligibility,
    );

    return deepFreeze({
      assessmentId: deterministicId(
        "context-assessment",
        request.requestId,
        request.portfolioId,
        generatedAt,
      ),
      generatedAt,
      portfolioHealthScore: roundScore(portfolioHealthScore),
      marketOpportunityScore: roundScore(marketOpportunityScore),
      marketRiskScore: roundScore(marketRiskScore),
      regimeConfidence: roundScore(regimeConfidence),
      strategyHealthScore: roundScore(strategyHealthScore),
      executionReadinessScore: roundScore(executionReadinessScore),
      systemReadinessScore: roundScore(systemReadinessScore),
      evidenceQualityScore: roundScore(evidenceQualityScore),
      activeRegime,
      eligibleStrategyIds: eligibility.eligibleStrategyIds,
      ineligibleStrategyIds: eligibility.ineligibleStrategyIds,
      blockingConditions,
      warnings,
    });
  }

  public aggregate(
    request: DecisionIntelligenceRunRequest,
  ): DecisionContextAssessment {
    return this.assess(request);
  }

  private assertRequestShape(request: DecisionIntelligenceRunRequest): void {
    if (request === null || typeof request !== "object") {
      throw new DecisionContextAggregationError(
        "Decision-intelligence request must be an object.",
        "INVALID_DECISION_REQUEST",
      );
    }

    if (!request.requestId || !request.portfolioId || !request.requestedAt) {
      throw new DecisionContextAggregationError(
        "requestId, portfolioId and requestedAt are required.",
        "INCOMPLETE_DECISION_REQUEST",
      );
    }

    if (request.portfolio.portfolioId !== request.portfolioId) {
      throw new DecisionContextAggregationError(
        "Portfolio snapshot does not belong to the requested portfolio.",
        "PORTFOLIO_ID_MISMATCH",
      );
    }
  }

  private calculatePortfolioHealth(
    request: DecisionIntelligenceRunRequest,
  ): number {
    const portfolio = request.portfolio;
    const equityCoverage = portfolio.totalEquity > EPSILON
      ? unit(portfolio.availableCapital / portfolio.totalEquity)
      : 0;
    const reserveCoverage = portfolio.totalEquity > EPSILON
      ? unit(portfolio.reservedCapital / portfolio.totalEquity)
      : 0;
    const deploymentBalance = portfolio.totalEquity > EPSILON
      ? 1 - unit(Math.abs(portfolio.deployedCapital - portfolio.availableCapital) /
          portfolio.totalEquity)
      : 0;
    const drawdownHealth = 1 - unit(Math.abs(portfolio.currentDrawdown));
    const maximumDrawdownHealth = 1 - unit(Math.abs(portfolio.maximumDrawdown));
    const riskHealth = 1 - unit(portfolio.portfolioRiskScore);
    const riskBudgetHealth = unit(portfolio.remainingRiskBudget);
    const leverageHealth = 1 - unit(portfolio.leverage / 10);
    const exposureHealth = portfolio.totalEquity > EPSILON
      ? 1 - unit(Math.abs(portfolio.netExposure) / portfolio.totalEquity)
      : 0;

    return weightedAverage([
      [equityCoverage, 0.12],
      [reserveCoverage, 0.06],
      [deploymentBalance, 0.08],
      [drawdownHealth, 0.17],
      [maximumDrawdownHealth, 0.12],
      [riskHealth, 0.2],
      [riskBudgetHealth, 0.15],
      [leverageHealth, 0.05],
      [exposureHealth, 0.05],
    ]);
  }

  private calculateMarketOpportunity(
    contexts: readonly DecisionMarketContext[],
  ): number {
    if (contexts.length === 0) return 0;

    const values = contexts.map((context) => {
      const trendOpportunity = unit(Math.abs(context.trendStrength));
      const momentumOpportunity = unit(Math.abs(context.momentumScore));
      const meanReversionOpportunity = unit(Math.abs(context.meanReversionScore));
      const volatilitySuitability = 1 - unit(Math.abs(context.volatilityScore - 0.55));
      const riskPenalty = unit(
        (context.stressScore + context.correlationStressScore) / 2,
      );

      return weightedAverage([
        [trendOpportunity, 0.22],
        [momentumOpportunity, 0.18],
        [meanReversionOpportunity, 0.14],
        [volatilitySuitability, 0.08],
        [unit(context.liquidityScore), 0.14],
        [unit(context.executionQualityScore), 0.1],
        [unit(context.dataQualityScore), 0.1],
        [1 - riskPenalty, 0.04],
      ]);
    });

    return average(values);
  }

  private calculateMarketRisk(
    contexts: readonly DecisionMarketContext[],
    observations: readonly StrategyRiskObservation[],
    portfolioRiskScore: number,
  ): number {
    const contextRisk = contexts.length === 0
      ? 0.5
      : average(
          contexts.map((context) =>
            weightedAverage([
              [unit(context.stressScore), 0.28],
              [unit(context.correlationStressScore), 0.22],
              [unit(context.volatilityScore), 0.2],
              [1 - unit(context.liquidityScore), 0.12],
              [1 - unit(context.executionQualityScore), 0.08],
              [1 - unit(context.dataQualityScore), 0.1],
            ]),
          ),
        );

    const strategyRisk = observations.length === 0
      ? unit(portfolioRiskScore)
      : average(
          observations.map((observation) =>
            weightedAverage([
              [unit(observation.riskScore), 0.3],
              [unit(observation.concentrationRisk), 0.12],
              [unit(observation.correlationRisk), 0.12],
              [unit(observation.liquidityRisk), 0.09],
              [unit(observation.leverageRisk), 0.09],
              [unit(observation.volatilityRisk), 0.09],
              [unit(observation.drawdownRisk), 0.08],
              [unit(observation.tailRisk), 0.07],
              [unit(observation.operationalRisk), 0.04],
            ]),
          ),
        );

    return weightedAverage([
      [unit(portfolioRiskScore), 0.38],
      [contextRisk, 0.34],
      [strategyRisk, 0.28],
    ]);
  }

  private calculateRegimeConfidence(
    contexts: readonly DecisionMarketContext[],
    activeRegime: MarketRegime,
  ): number {
    if (contexts.length === 0 || activeRegime === UNKNOWN_REGIME) return 0;

    const matching = contexts.filter(
      (context) => context.regime === activeRegime,
    );
    if (matching.length === 0) return 0;

    const confidence = weightedAverage(
      matching.map((context) => [
        unit(context.regimeConfidence),
        Math.max(EPSILON, unit(context.dataQualityScore)),
      ] as const),
    );
    const consensus = matching.length / contexts.length;

    return weightedAverage([
      [confidence, 0.75],
      [consensus, 0.25],
    ]);
  }

  private calculateStrategyHealth(
    states: readonly StrategyDecisionState[],
  ): number {
    if (states.length === 0) return 0;

    const weighted = states.map((state) => {
      const score = weightedAverage([
        [unit(state.healthScore), 0.28],
        [unit(state.performanceScore), 0.19],
        [unit(state.stabilityScore), 0.18],
        [unit(state.regimeAlignmentScore), 0.15],
        [unit(state.executionQualityScore), 0.1],
        [unit(state.confidence), 0.1],
      ]);
      return [score, Math.max(0.05, unit(state.currentWeight))] as const;
    });

    return weightedAverage(weighted);
  }

  private calculateExecutionReadiness(
    request: DecisionIntelligenceRunRequest,
  ): number {
    const marketExecution = request.marketContexts.length === 0
      ? 0
      : average(
          request.marketContexts.map((context) =>
            weightedAverage([
              [unit(context.executionQualityScore), 0.55],
              [unit(context.liquidityScore), 0.3],
              [unit(context.dataQualityScore), 0.15],
            ]),
          ),
        );

    const strategyExecution = request.strategyStates.length === 0
      ? 0
      : average(
          request.strategyStates.map((state) =>
            weightedAverage([
              [unit(state.executionQualityScore), 0.55],
              [unit(state.healthScore), 0.25],
              [unit(state.confidence), 0.2],
            ]),
          ),
        );

    const engineHealth = request.systemHealth.executionEngineHealthy ? 1 : 0;

    return weightedAverage([
      [marketExecution, 0.4],
      [strategyExecution, 0.35],
      [engineHealth, 0.25],
    ]);
  }

  private calculateSystemReadiness(
    request: DecisionIntelligenceRunRequest,
  ): number {
    const health = request.systemHealth;
    const components = [
      health.marketDataHealthy,
      health.riskEngineHealthy,
      health.executionEngineHealthy,
      health.persistenceHealthy,
      health.metaLearningHealthy,
    ];
    const binaryAvailability = components.filter(Boolean).length / components.length;
    const degradationPenalty = unit(health.degradedComponents.length / 5) * 0.25;
    const unavailablePenalty = unit(health.unavailableComponents.length / 5) * 0.5;

    return unit(
      weightedAverage([
        [unit(health.overallHealthScore), 0.55],
        [binaryAvailability, 0.45],
      ]) - degradationPenalty - unavailablePenalty,
    );
  }

  private calculateEvidenceQuality(
    request: DecisionIntelligenceRunRequest,
  ): number {
    const requestedAt = timestampMs(request.requestedAt);
    const portfolioFreshness = freshnessScore(
      requestedAt,
      timestampMs(request.portfolio.capturedAt),
      this.maximumContextAgeMs,
    );
    const marketFreshness = request.marketContexts.length === 0
      ? 0
      : average(
          request.marketContexts.map((context) =>
            freshnessScore(
              requestedAt,
              timestampMs(context.capturedAt),
              this.maximumContextAgeMs,
            ),
          ),
        );
    const marketQuality = request.marketContexts.length === 0
      ? 0
      : average(
          request.marketContexts.map((context) =>
            unit(context.dataQualityScore),
          ),
        );
    const riskCoverage = request.strategyStates.length === 0
      ? 1
      : unit(request.riskObservations.length / request.strategyStates.length);
    const metaLearningQuality = this.calculateMetaLearningEvidenceQuality(request);

    return weightedAverage([
      [portfolioFreshness, 0.2],
      [marketFreshness, 0.2],
      [marketQuality, 0.28],
      [riskCoverage, 0.17],
      [metaLearningQuality, 0.15],
    ]);
  }

  private calculateMetaLearningEvidenceQuality(
    request: DecisionIntelligenceRunRequest,
  ): number {
    const input = request.metaLearning;
    if (input === undefined) return 0.5;

    const evidenceCount =
      input.strategyLearningScores.length +
      input.adaptiveWeights.length +
      input.learnedRegimeProfiles.length +
      input.reinforcementStates.length +
      input.evolutionCandidates.length +
      input.lifecycleChanges.length;
    const coverage = request.strategyStates.length === 0
      ? (evidenceCount > 0 ? 1 : 0.5)
      : unit(evidenceCount / Math.max(1, request.strategyStates.length * 3));
    const warningPenalty = unit(input.warnings.length / 10) * 0.25;

    return unit(coverage - warningPenalty);
  }

  private determineActiveRegime(
    contexts: readonly DecisionMarketContext[],
  ): MarketRegime {
    if (contexts.length === 0) return UNKNOWN_REGIME;

    const weights = new Map<MarketRegime, number>();
    for (const context of contexts) {
      const quality = unit(context.dataQualityScore);
      const confidence = unit(context.regimeConfidence);
      const weight = Math.max(EPSILON, quality * confidence);
      weights.set(context.regime, (weights.get(context.regime) ?? 0) + weight);
    }

    return [...weights.entries()]
      .sort((left, right) => {
        const byWeight = right[1] - left[1];
        return Math.abs(byWeight) > EPSILON
          ? byWeight
          : left[0].localeCompare(right[0]);
      })[0]?.[0] ?? UNKNOWN_REGIME;
  }

  private partitionStrategies(
    states: readonly StrategyDecisionState[],
    riskObservations: readonly StrategyRiskObservation[],
    activeRegime: MarketRegime,
    request: DecisionIntelligenceRunRequest,
  ): {
    readonly eligibleStrategyIds: readonly DecisionStrategyId[];
    readonly ineligibleStrategyIds: readonly DecisionStrategyId[];
    readonly reasons: Readonly<Record<string, readonly string[]>>;
  } {
    const risks = new Map(
      riskObservations.map((observation) => [observation.strategyId, observation]),
    );
    const eligible: DecisionStrategyId[] = [];
    const ineligible: DecisionStrategyId[] = [];
    const reasons: Record<string, readonly string[]> = {};

    for (const state of [...states].sort((a, b) =>
      a.strategy.strategyId.localeCompare(b.strategy.strategyId),
    )) {
      const strategyId = state.strategy.strategyId;
      const failures: string[] = [];
      const risk = risks.get(strategyId);

      if (!this.isOperatingModeEligible(state)) {
        failures.push(`Operating mode ${state.operatingMode} is not eligible.`);
      }
      if (!this.isOrchestrationStateEligible(state)) {
        failures.push(`Orchestration state ${state.orchestrationState} is not eligible.`);
      }
      if (state.healthScore < this.minimumEligibleStrategyHealth) {
        failures.push("Strategy health is below the eligibility threshold.");
      }
      if (state.confidence < this.minimumEligibleStrategyConfidence) {
        failures.push("Strategy confidence is below the eligibility threshold.");
      }
      if (state.regimeAlignmentScore < this.minimumEligibleRegimeAlignment) {
        failures.push("Regime alignment is below the eligibility threshold.");
      }
      if (
        activeRegime !== UNKNOWN_REGIME &&
        state.strategy.supportedRegimes.length > 0 &&
        !state.strategy.supportedRegimes.includes(activeRegime)
      ) {
        failures.push(`Strategy does not support active regime ${activeRegime}.`);
      }
      if (risk !== undefined && risk.breachedLimits.length > 0) {
        failures.push("Strategy has breached risk limits.");
      }
      if (risk !== undefined && risk.remainingRiskBudget <= EPSILON) {
        failures.push("Strategy has no remaining risk budget.");
      }
      if (request.systemHealth.unavailableComponents.length > 0 && this.strictSystemHealth) {
        failures.push("Required system components are unavailable.");
      }

      reasons[strategyId] = Object.freeze(failures);
      if (failures.length === 0) eligible.push(strategyId);
      else ineligible.push(strategyId);
    }

    return deepFreeze({
      eligibleStrategyIds: eligible,
      ineligibleStrategyIds: ineligible,
      reasons,
    });
  }

  private isOperatingModeEligible(state: StrategyDecisionState): boolean {
    switch (state.operatingMode) {
      case "DISABLED":
        return false;
      case "OBSERVE_ONLY":
        return this.includeObserveOnlyStrategies;
      case "SHADOW":
        return this.includeShadowStrategies;
      default:
        return true;
    }
  }

  private isOrchestrationStateEligible(state: StrategyDecisionState): boolean {
    return ![
      "STOPPING",
      "STOPPED",
      "QUARANTINED",
      "FAILED",
    ].includes(state.orchestrationState);
  }

  private buildBlockingConditions(
    request: DecisionIntelligenceRunRequest,
    portfolioHealthScore: number,
    marketRiskScore: number,
    executionReadinessScore: number,
    systemReadinessScore: number,
    evidenceQualityScore: number,
    eligibleStrategyIds: readonly DecisionStrategyId[],
  ): readonly string[] {
    const conditions: string[] = [];

    if (request.portfolio.totalEquity <= 0) {
      conditions.push("Portfolio equity is not positive.");
    }
    if (request.portfolio.portfolioRiskScore > this.maximumPortfolioRiskScore) {
      conditions.push("Portfolio risk score exceeds the configured maximum.");
    }
    if (request.portfolio.remainingRiskBudget <= EPSILON) {
      conditions.push("Portfolio has no remaining risk budget.");
    }
    if (marketRiskScore >= 0.9) {
      conditions.push("Aggregate market risk is critically high.");
    }
    if (portfolioHealthScore < 0.25) {
      conditions.push("Portfolio health is critically low.");
    }
    if (executionReadinessScore < 0.35) {
      conditions.push("Execution readiness is critically low.");
    }
    if (systemReadinessScore < this.minimumSystemReadiness) {
      conditions.push("System readiness is below the minimum threshold.");
    }
    if (evidenceQualityScore < this.minimumMarketDataQuality) {
      conditions.push("Decision evidence quality is below the minimum threshold.");
    }
    if (eligibleStrategyIds.length === 0 && request.strategyStates.length > 0) {
      conditions.push("No strategy is eligible for autonomous orchestration.");
    }
    if (!request.systemHealth.riskEngineHealthy) {
      conditions.push("Risk engine is unhealthy.");
    }
    if (!request.systemHealth.executionEngineHealthy) {
      conditions.push("Execution engine is unhealthy.");
    }
    if (!request.systemHealth.marketDataHealthy) {
      conditions.push("Market-data subsystem is unhealthy.");
    }

    return Object.freeze(uniqueSorted(conditions));
  }

  private buildWarnings(
    request: DecisionIntelligenceRunRequest,
    activeRegime: MarketRegime,
    regimeConfidence: number,
    marketOpportunityScore: number,
    marketRiskScore: number,
    eligibility: {
      readonly eligibleStrategyIds: readonly DecisionStrategyId[];
      readonly ineligibleStrategyIds: readonly DecisionStrategyId[];
      readonly reasons: Readonly<Record<string, readonly string[]>>;
    },
  ): readonly string[] {
    const warnings: string[] = [];

    if (request.marketContexts.length === 0) {
      warnings.push("No market contexts were supplied.");
    }
    if (activeRegime === UNKNOWN_REGIME) {
      warnings.push("The active market regime is unknown.");
    }
    if (regimeConfidence < 0.5) {
      warnings.push("Market-regime confidence is low.");
    }
    if (marketRiskScore > marketOpportunityScore) {
      warnings.push("Aggregate market risk exceeds aggregate opportunity.");
    }
    if (request.riskObservations.length < request.strategyStates.length) {
      warnings.push("Risk observations do not cover every strategy state.");
    }
    if (request.metaLearning === undefined) {
      warnings.push("Meta-learning evidence was not supplied.");
    } else {
      warnings.push(...request.metaLearning.warnings.map((value) =>
        `Meta-learning: ${value}`,
      ));
    }
    warnings.push(...request.systemHealth.warnings.map((value) =>
      `System health: ${value}`,
    ));

    for (const strategyId of eligibility.ineligibleStrategyIds) {
      for (const reason of eligibility.reasons[strategyId] ?? []) {
        warnings.push(`Strategy ${strategyId}: ${reason}`);
      }
    }

    return Object.freeze(uniqueSorted(warnings));
  }
}

export function createDecisionContextAggregator(
  options: DecisionContextAggregatorOptions = {},
): DecisionContextAggregator {
  return new DecisionContextAggregator(options);
}

export function assessDecisionContext(
  request: DecisionIntelligenceRunRequest,
  options: DecisionContextAggregatorOptions = {},
): DecisionContextAssessment {
  return createDecisionContextAggregator(options).assess(request);
}

function freshnessScore(
  referenceTime: number,
  observedTime: number,
  maximumAgeMs: number,
): number {
  if (!Number.isFinite(referenceTime) || !Number.isFinite(observedTime)) return 0;
  const age = Math.max(0, referenceTime - observedTime);
  return unit(1 - age / Math.max(1, maximumAgeMs));
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function deterministicId(
  namespace: string,
  ...parts: readonly string[]
): DecisionIntelligenceId {
  const input = [namespace, ...parts].join("|");
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + index;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }

  return `${namespace}-${unsignedHex(hashA)}${unsignedHex(hashB)}`;
}

function unsignedHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return unit(values.reduce((sum, value) => sum + finite(value), 0) / values.length);
}

function weightedAverage(
  values: readonly (readonly [number, number])[],
): number {
  let numerator = 0;
  let denominator = 0;

  for (const [value, weight] of values) {
    const safeWeight = Math.max(0, finite(weight));
    numerator += unit(value) * safeWeight;
    denominator += safeWeight;
  }

  return denominator <= EPSILON ? 0 : unit(numerator / denominator);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function unit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function roundScore(value: number): number {
  return Math.round(unit(value) * 1_000_000) / 1_000_000;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
    .sort((left, right) => left.localeCompare(right));
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