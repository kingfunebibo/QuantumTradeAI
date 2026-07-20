/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * Central deterministic orchestration service for portfolio validation,
 * analysis, risk budgeting, optimization, allocation, drift detection,
 * rebalance planning, decision control, and explainability.
 */

import {
  AIPortfolioErrorCode,
  PortfolioAllocationTargetType,
  PortfolioDataQualityStatus,
  PortfolioDecisionStatus,
  PortfolioHealthStatus,
  PortfolioManagerMode,
  PortfolioRebalanceReason,
  PortfolioRecommendationPriority,
  PortfolioRiskLevel,
  type AIPortfolioManager as AIPortfolioManagerContract,
  type AIPortfolioManagerDecision,
  type AIPortfolioManagerRequest,
  type AssetReturnSeries,
  type PortfolioAllocationTarget,
  type PortfolioCapitalAllocationRequest,
  type PortfolioCapitalAllocationResult,
  type PortfolioCapitalAllocator,
  type PortfolioCorrelationEngine,
  type PortfolioCorrelationMatrix,
  type PortfolioCovarianceMatrix,
  type PortfolioCovariancePair,
  type PortfolioDataQualityIssue,
  type PortfolioDataQualityReport,
  type PortfolioDecisionExplanation,
  type PortfolioDiversificationMetrics,
  type PortfolioDriftDetector,
  type PortfolioDriftReport,
  type PortfolioExplainabilityEngine,
  type PortfolioHealthComponent,
  type PortfolioHealthIssue,
  type PortfolioHealthRecommendation,
  type PortfolioHealthReport,
  type PortfolioMetadata,
  type PortfolioOptimizationAsset,
  type PortfolioOptimizationRequest,
  type PortfolioOptimizationResult,
  type PortfolioOptimizer,
  type PortfolioPerformanceMetrics,
  type PortfolioRebalancePlan,
  type PortfolioRebalanceRequest,
  type PortfolioRebalancingEngine,
  type PortfolioRiskBudgetEngine,
  type PortfolioRiskBudgetResult,
  type Timestamp,
} from "./ai-portfolio-contracts";
import {
  AIPortfolioStateAnalyzer,
  type PortfolioStateAnalysis,
} from "./ai-portfolio-state-analyzer";
import {
  AIPortfolioValidationError,
  AIPortfolioValidator,
  type AIPortfolioValidatorOptions,
} from "./ai-portfolio-validator";
import { AIPortfolioCapitalAllocationEngine } from "./capital-allocation-engine";
import { AIPortfolioCorrelationEngine } from "./portfolio-correlation-engine";
import { AIPortfolioDriftDetector } from "./portfolio-drift-detector";
import { AIPortfolioExplainabilityEngine } from "./portfolio-explainability-engine";
import { AIPortfolioOptimizationEngine } from "./portfolio-optimization-engine";
import { AIPortfolioRebalancePlanner } from "./rebalance-planner";
import { AIPortfolioRiskBudgetAllocator } from "./risk-budget-allocator";

export interface AIPortfolioManagerClock {
  now(): number;
}

export interface AIPortfolioManagerDependencies {
  readonly validator?: AIPortfolioValidator;
  readonly stateAnalyzer?: AIPortfolioStateAnalyzer;
  readonly correlationEngine?: PortfolioCorrelationEngine;
  readonly riskBudgetEngine?: PortfolioRiskBudgetEngine;
  readonly optimizer?: PortfolioOptimizer;
  readonly capitalAllocator?: PortfolioCapitalAllocator;
  readonly driftDetector?: PortfolioDriftDetector;
  readonly rebalancingEngine?: PortfolioRebalancingEngine;
  readonly explainabilityEngine?: PortfolioExplainabilityEngine;
}

export interface AIPortfolioManagerOptions {
  readonly validatorOptions?: AIPortfolioValidatorOptions;
  readonly covarianceMinimumObservations?: number;
  readonly staleReturnSeriesAgeMilliseconds?: number;
  readonly minimumReturnSeriesCompleteness?: number;
  readonly failClosedOnComponentError?: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedOptions {
  readonly covarianceMinimumObservations: number;
  readonly staleReturnSeriesAgeMilliseconds: number;
  readonly minimumReturnSeriesCompleteness: number;
  readonly failClosedOnComponentError: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface ReturnStatistics {
  readonly asset: string;
  readonly observations: number;
  readonly meanReturn: number;
  readonly volatility: number;
  readonly downsideVolatility: number;
  readonly totalReturn: number;
}

const SYSTEM_CLOCK: AIPortfolioManagerClock = Object.freeze({
  now: (): number => Date.now(),
});

function round(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number(value.toPrecision(15));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function resolveOptions(
  options: AIPortfolioManagerOptions | undefined,
): ResolvedOptions {
  const resolved: ResolvedOptions = {
    covarianceMinimumObservations:
      options?.covarianceMinimumObservations ?? 2,
    staleReturnSeriesAgeMilliseconds:
      options?.staleReturnSeriesAgeMilliseconds ?? 24 * 60 * 60 * 1_000,
    minimumReturnSeriesCompleteness:
      options?.minimumReturnSeriesCompleteness ?? 0.7,
    failClosedOnComponentError:
      options?.failClosedOnComponentError ?? true,
    metadata: cloneMetadata(options?.metadata),
  };

  if (
    !Number.isInteger(resolved.covarianceMinimumObservations) ||
    resolved.covarianceMinimumObservations < 2
  ) {
    throw new RangeError(
      "options.covarianceMinimumObservations must be an integer greater than or equal to 2.",
    );
  }

  assertFiniteNumber(
    resolved.staleReturnSeriesAgeMilliseconds,
    "options.staleReturnSeriesAgeMilliseconds",
  );
  if (resolved.staleReturnSeriesAgeMilliseconds < 0) {
    throw new RangeError(
      "options.staleReturnSeriesAgeMilliseconds must be greater than or equal to zero.",
    );
  }

  assertFiniteNumber(
    resolved.minimumReturnSeriesCompleteness,
    "options.minimumReturnSeriesCompleteness",
  );
  if (
    resolved.minimumReturnSeriesCompleteness < 0 ||
    resolved.minimumReturnSeriesCompleteness > 1
  ) {
    throw new RangeError(
      "options.minimumReturnSeriesCompleteness must be between 0 and 1 inclusive.",
    );
  }

  return Object.freeze(resolved);
}

function deterministicId(
  prefix: string,
  request: AIPortfolioManagerRequest,
): string {
  return [
    prefix,
    request.portfolioId,
    request.requestId,
    request.snapshot.snapshotId,
    request.requestedAt,
  ]
    .join(":")
    .replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function timestampFromClock(clock: AIPortfolioManagerClock): Timestamp {
  const value = clock.now();
  assertFiniteNumber(value, "clock.now()");
  return new Date(value).toISOString();
}

function calculateReturnStatistics(
  series: AssetReturnSeries,
): ReturnStatistics {
  const values = series.observations.map((observation) => observation.returnValue);
  const count = values.length;

  if (count === 0) {
    return Object.freeze({
      asset: series.asset,
      observations: 0,
      meanReturn: 0,
      volatility: 0,
      downsideVolatility: 0,
      totalReturn: 0,
    });
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    count < 2
      ? 0
      : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        (count - 1);
  const downsideValues = values.filter((value) => value < 0);
  const downsideVariance =
    downsideValues.length < 2
      ? 0
      : downsideValues.reduce((sum, value) => sum + value ** 2, 0) /
        downsideValues.length;
  const compounded = values.reduce((factor, value) => factor * (1 + value), 1) - 1;

  return Object.freeze({
    asset: series.asset,
    observations: count,
    meanReturn: round(mean),
    volatility: round(Math.sqrt(Math.max(0, variance))),
    downsideVolatility: round(Math.sqrt(Math.max(0, downsideVariance))),
    totalReturn: round(compounded),
  });
}

function calculatePortfolioPerformance(
  request: AIPortfolioManagerRequest,
  state: PortfolioStateAnalysis,
): PortfolioPerformanceMetrics {
  const statistics = request.returnSeries.map(calculateReturnStatistics);
  const assetWeights = new Map(
    state.assets.map((asset) => [asset.asset, asset.portfolioWeight] as const),
  );

  let weightedMean = 0;
  let weightedVolatilitySquared = 0;
  let weightedDownsideSquared = 0;
  let weightedTotalReturn = 0;

  for (const item of statistics) {
    const weight = assetWeights.get(item.asset) ?? 0;
    weightedMean += item.meanReturn * weight;
    weightedVolatilitySquared += item.volatility ** 2 * weight ** 2;
    weightedDownsideSquared += item.downsideVolatility ** 2 * weight ** 2;
    weightedTotalReturn += item.totalReturn * weight;
  }

  const volatility = Math.sqrt(Math.max(0, weightedVolatilitySquared));
  const downsideVolatility = Math.sqrt(Math.max(0, weightedDownsideSquared));
  const equity = Math.abs(request.snapshot.totalEquity);
  const realizedReturn = equity > 0 ? request.snapshot.realizedPnl / equity : 0;
  const unrealizedReturn = equity > 0 ? request.snapshot.unrealizedPnl / equity : 0;
  const currentDrawdown = Math.max(0, -Math.min(0, state.performance.pnlToEquityRatio));

  return Object.freeze({
    totalReturn: round(weightedTotalReturn),
    realizedReturn: round(realizedReturn),
    unrealizedReturn: round(unrealizedReturn),
    volatility: round(volatility),
    downsideVolatility: round(downsideVolatility),
    sharpeRatio: volatility > 0 ? round(weightedMean / volatility) : 0,
    sortinoRatio:
      downsideVolatility > 0 ? round(weightedMean / downsideVolatility) : 0,
    maximumDrawdown: round(currentDrawdown),
    currentDrawdown: round(currentDrawdown),
  });
}

function matrixPairKey(left: string, right: string): string {
  return left <= right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function alignSeries(
  left: AssetReturnSeries,
  right: AssetReturnSeries,
): readonly (readonly [number, number])[] {
  const rightByTimestamp = new Map(
    right.observations.map((observation) => [
      observation.timestamp,
      observation.returnValue,
    ] as const),
  );

  return Object.freeze(
    left.observations
      .filter((observation) => rightByTimestamp.has(observation.timestamp))
      .map((observation) =>
        Object.freeze([
          observation.returnValue,
          rightByTimestamp.get(observation.timestamp) ?? 0,
        ]) as readonly [number, number],
      ),
  );
}

function covariance(values: readonly (readonly [number, number])[]): number {
  if (values.length < 2) {
    return 0;
  }

  const leftMean = values.reduce((sum, item) => sum + item[0], 0) / values.length;
  const rightMean = values.reduce((sum, item) => sum + item[1], 0) / values.length;

  return values.reduce(
    (sum, item) => sum + (item[0] - leftMean) * (item[1] - rightMean),
    0,
  ) / (values.length - 1);
}

function buildCovarianceMatrix(
  returnSeries: readonly AssetReturnSeries[],
  generatedAt: Timestamp,
  minimumObservations: number,
): PortfolioCovarianceMatrix | undefined {
  if (returnSeries.length === 0) {
    return undefined;
  }

  const normalized = [...returnSeries].sort((left, right) =>
    left.asset.localeCompare(right.asset),
  );
  const values: number[][] = normalized.map(() => normalized.map(() => 0));
  const pairs: PortfolioCovariancePair[] = [];
  const counts = new Map<string, number>();

  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < normalized.length; rightIndex += 1) {
      const left = normalized[leftIndex];
      const right = normalized[rightIndex];
      if (left === undefined || right === undefined) {
        continue;
      }

      const aligned = alignSeries(left, right);
      const calculated =
        aligned.length >= minimumObservations ? covariance(aligned) : 0;
      const roundedValue = round(calculated);
      values[leftIndex]![rightIndex] = roundedValue;
      values[rightIndex]![leftIndex] = roundedValue;
      counts.set(matrixPairKey(left.asset, right.asset), aligned.length);

      pairs.push(
        Object.freeze({
          leftAsset: left.asset,
          rightAsset: right.asset,
          covariance: roundedValue,
          observationCount: aligned.length,
        }),
      );
    }
  }

  const observationCount =
    counts.size === 0 ? 0 : Math.min(...counts.values());

  return Object.freeze({
    assets: Object.freeze(normalized.map((item) => item.asset)),
    values: Object.freeze(values.map((row) => Object.freeze([...row]))),
    pairs: Object.freeze(pairs),
    observationCount,
    generatedAt,
    metadata: Object.freeze({ minimumObservations }),
  });
}

function buildDiversificationMetrics(
  state: PortfolioStateAnalysis,
  correlationMatrix: PortfolioCorrelationMatrix | undefined,
): PortfolioDiversificationMetrics {
  const weights = state.assets.map((asset) => asset.portfolioWeight);
  const concentrationIndex = weights.reduce((sum, weight) => sum + weight ** 2, 0);
  const effectiveAssetCount = concentrationIndex > 0 ? 1 / concentrationIndex : 0;
  const pairs = correlationMatrix?.pairs.filter(
    (pair) => pair.leftAsset !== pair.rightAsset,
  ) ?? [];
  const correlations = pairs.map((pair) => pair.correlation);
  const averageCorrelation =
    correlations.length === 0
      ? 0
      : correlations.reduce((sum, value) => sum + value, 0) /
        correlations.length;
  const maximumPairCorrelation =
    correlations.length === 0 ? 0 : Math.max(...correlations);
  const minimumPairCorrelation =
    correlations.length === 0 ? 0 : Math.min(...correlations);
  const weightedVolatility = Math.sqrt(
    weights.reduce((sum, weight) => sum + weight ** 2, 0),
  );

  return Object.freeze({
    diversificationRatio:
      weightedVolatility > 0 ? round(1 / weightedVolatility) : 0,
    effectiveAssetCount: round(effectiveAssetCount),
    concentrationIndex: round(concentrationIndex),
    averageCorrelation: round(averageCorrelation),
    maximumPairCorrelation: round(maximumPairCorrelation),
    minimumPairCorrelation: round(minimumPairCorrelation),
    highlyCorrelatedPairs: Object.freeze(
      pairs.filter((pair) => Math.abs(pair.correlation) >= 0.8),
    ),
  });
}

function healthStatus(score: number): PortfolioHealthStatus {
  if (score >= 90) return PortfolioHealthStatus.EXCELLENT;
  if (score >= 75) return PortfolioHealthStatus.HEALTHY;
  if (score >= 60) return PortfolioHealthStatus.WATCH;
  if (score >= 40) return PortfolioHealthStatus.DEGRADED;
  return PortfolioHealthStatus.CRITICAL;
}

function riskLevel(score: number): PortfolioRiskLevel {
  if (score >= 90) return PortfolioRiskLevel.VERY_LOW;
  if (score >= 75) return PortfolioRiskLevel.LOW;
  if (score >= 60) return PortfolioRiskLevel.MODERATE;
  if (score >= 40) return PortfolioRiskLevel.HIGH;
  if (score >= 20) return PortfolioRiskLevel.VERY_HIGH;
  return PortfolioRiskLevel.CRITICAL;
}

function healthComponent(
  name: string,
  score: number,
  weight: number,
  reasons: readonly string[],
): PortfolioHealthComponent {
  const normalizedScore = clamp(score, 0, 100);
  return Object.freeze({
    name,
    score: round(normalizedScore),
    weight,
    weightedScore: round(normalizedScore * weight),
    status: healthStatus(normalizedScore),
    reasons: freezeStrings(reasons),
  });
}

function buildHealthReport(
  request: AIPortfolioManagerRequest,
  state: PortfolioStateAnalysis,
  performance: PortfolioPerformanceMetrics,
  correlationMatrix: PortfolioCorrelationMatrix | undefined,
  generatedAt: Timestamp,
): PortfolioHealthReport {
  const diversification = buildDiversificationMetrics(state, correlationMatrix);
  const liquidityScore = clamp(state.capital.availableWeight * 300, 0, 100);
  const concentrationScore = clamp(
    100 - state.concentration.largestAssetWeight * 100,
    0,
    100,
  );
  const exposureScore = clamp(
    100 - Math.max(0, state.exposure.leverage - 1) * 35,
    0,
    100,
  );
  const performanceScore = clamp(
    70 + state.performance.pnlToEquityRatio * 300 - performance.currentDrawdown * 200,
    0,
    100,
  );
  const operationalScore = clamp(
    100 - state.warnings.length * 12.5,
    0,
    100,
  );

  const components = Object.freeze([
    healthComponent("liquidity", liquidityScore, 0.2, [
      `Available capital weight is ${round(state.capital.availableWeight)}.`,
    ]),
    healthComponent("concentration", concentrationScore, 0.25, [
      `Largest asset weight is ${round(state.concentration.largestAssetWeight)}.`,
    ]),
    healthComponent("exposure", exposureScore, 0.2, [
      `Effective leverage is ${round(state.exposure.leverage)}.`,
    ]),
    healthComponent("performance", performanceScore, 0.2, [
      `Portfolio return is ${round(performance.totalReturn)}.`,
    ]),
    healthComponent("operations", operationalScore, 0.15, state.warnings),
  ]);

  const overallScore = round(
    components.reduce((sum, component) => sum + component.weightedScore, 0),
  );
  const issues: PortfolioHealthIssue[] = [];
  const recommendations: PortfolioHealthRecommendation[] = [];

  if (state.concentration.largestAssetWeight > request.configuration.allocationPolicy.maximumSingleAssetWeight) {
    issues.push(Object.freeze({
      code: "ASSET_CONCENTRATION_LIMIT",
      title: "Single-asset concentration exceeds policy",
      description: "The largest asset weight exceeds the configured maximum single-asset allocation.",
      riskLevel: PortfolioRiskLevel.HIGH,
      affectedTargets: Object.freeze(
        state.concentration.largestAsset === undefined
          ? []
          : [state.concentration.largestAsset],
      ),
      recommendedAction: "Reduce the overweight asset and redistribute capital.",
    }));
  }

  if (state.capital.availableWeight < request.configuration.allocationPolicy.minimumCashReserveWeight) {
    issues.push(Object.freeze({
      code: "CASH_RESERVE_DEFICIT",
      title: "Cash reserve is below policy",
      description: "Available capital is below the configured minimum reserve weight.",
      riskLevel: PortfolioRiskLevel.HIGH,
      affectedTargets: Object.freeze([request.portfolioId]),
      recommendedAction: "Release capital or reduce invested exposure.",
    }));
  }

  if (issues.length > 0) {
    recommendations.push(Object.freeze({
      recommendationId: deterministicId("health-recommendation", request),
      priority: issues.some((issue) => issue.riskLevel === PortfolioRiskLevel.CRITICAL)
        ? PortfolioRecommendationPriority.CRITICAL
        : PortfolioRecommendationPriority.HIGH,
      title: "Restore portfolio policy compliance",
      description: "Rebalance the portfolio to address the identified concentration, liquidity, and exposure issues.",
      expectedBenefit: "Improved portfolio resilience and policy compliance.",
      affectedTargets: Object.freeze(
        [...new Set(issues.flatMap((issue) => issue.affectedTargets))].sort(),
      ),
    }));
  }

  return Object.freeze({
    portfolioId: request.portfolioId,
    snapshotId: request.snapshot.snapshotId,
    overallScore,
    status: healthStatus(overallScore),
    riskLevel: riskLevel(overallScore),
    components,
    issues: Object.freeze(issues),
    recommendations: Object.freeze(recommendations),
    performance,
    diversification,
    generatedAt,
    metadata: Object.freeze({
      stateAnalysisId: state.analysisId,
      warningCount: state.warnings.length,
    }),
  });
}

function buildDataQualityReport(
  request: AIPortfolioManagerRequest,
  nowMilliseconds: number,
  options: ResolvedOptions,
): PortfolioDataQualityReport {
  const issues: PortfolioDataQualityIssue[] = [];
  const targetAssets = new Set(
    request.allocationTargets
      .filter((target) => target.targetType === PortfolioAllocationTargetType.ASSET)
      .map((target) => target.targetId),
  );
  const seriesAssets = new Set(request.returnSeries.map((series) => series.asset));
  const coveredAssets = [...targetAssets].filter((asset) => seriesAssets.has(asset)).length;
  const completenessScore =
    targetAssets.size === 0 ? 1 : coveredAssets / targetAssets.size;

  if (completenessScore < options.minimumReturnSeriesCompleteness) {
    issues.push(Object.freeze({
      source: "returnSeries",
      status: PortfolioDataQualityStatus.PARTIAL,
      description: "Historical return coverage is below the configured completeness threshold.",
      observedAt: request.requestedAt,
      metadata: Object.freeze({
        coveredAssets,
        targetAssets: targetAssets.size,
      }),
    }));
  }

  let freshestTimestamp = 0;
  for (const series of request.returnSeries) {
    for (const observation of series.observations) {
      freshestTimestamp = Math.max(freshestTimestamp, Date.parse(observation.timestamp));
    }
  }
  const age = freshestTimestamp > 0 ? Math.max(0, nowMilliseconds - freshestTimestamp) : Number.POSITIVE_INFINITY;
  const freshnessScore = Number.isFinite(age)
    ? clamp(1 - age / Math.max(1, options.staleReturnSeriesAgeMilliseconds), 0, 1)
    : 0;

  if (!Number.isFinite(age) || age > options.staleReturnSeriesAgeMilliseconds) {
    issues.push(Object.freeze({
      source: "returnSeries",
      status: PortfolioDataQualityStatus.STALE,
      description: "Historical return observations are stale or unavailable.",
      observedAt: request.requestedAt,
    }));
  }

  const duplicateAssets = request.returnSeries.length - seriesAssets.size;
  const consistencyScore = duplicateAssets === 0 ? 1 : clamp(1 - duplicateAssets / request.returnSeries.length, 0, 1);

  if (duplicateAssets > 0) {
    issues.push(Object.freeze({
      source: "returnSeries",
      status: PortfolioDataQualityStatus.INVALID,
      description: "Duplicate asset return series were supplied.",
      observedAt: request.requestedAt,
      metadata: Object.freeze({ duplicateAssets }),
    }));
  }

  const status = issues.some((issue) => issue.status === PortfolioDataQualityStatus.INVALID)
    ? PortfolioDataQualityStatus.INVALID
    : issues.some((issue) => issue.status === PortfolioDataQualityStatus.STALE)
      ? PortfolioDataQualityStatus.STALE
      : issues.length > 0
        ? PortfolioDataQualityStatus.PARTIAL
        : PortfolioDataQualityStatus.VALID;

  return Object.freeze({
    status,
    completenessScore: round(completenessScore),
    freshnessScore: round(freshnessScore),
    consistencyScore: round(consistencyScore),
    issues: Object.freeze(issues),
    evaluatedAt: new Date(nowMilliseconds).toISOString(),
  });
}

function buildOptimizationAssets(
  request: AIPortfolioManagerRequest,
  state: PortfolioStateAnalysis,
): readonly PortfolioOptimizationAsset[] {
  const statistics = new Map(
    request.returnSeries.map((series) => [
      series.asset,
      calculateReturnStatistics(series),
    ] as const),
  );
  const targetByAsset = new Map(
    request.allocationTargets
      .filter((target) => target.targetType === PortfolioAllocationTargetType.ASSET)
      .map((target) => [target.targetId, target] as const),
  );
  const assetNames = new Set([
    ...state.assets.map((asset) => asset.asset),
    ...targetByAsset.keys(),
  ]);

  return Object.freeze(
    [...assetNames]
      .sort((left, right) => left.localeCompare(right))
      .map((asset): PortfolioOptimizationAsset => {
        const stateAsset = state.assets.find((item) => item.asset === asset);
        const target = targetByAsset.get(asset);
        const stats = statistics.get(asset);

        return Object.freeze({
          asset,
          currentWeight: stateAsset?.portfolioWeight ?? target?.currentWeight ?? 0,
          currentValue: stateAsset?.absoluteNetValue ?? target?.currentCapital ?? 0,
          expectedReturn: stats?.meanReturn,
          expectedVolatility: stats?.volatility,
          liquidityScore: target?.liquidityScore,
          minimumWeight: target?.minimumWeight,
          maximumWeight: target?.maximumWeight,
          enabled: target?.enabled ?? true,
          metadata: Object.freeze({
            source: target === undefined ? "portfolio-state" : "allocation-target",
          }),
        });
      }),
  );
}

function buildDriftTargets(
  originalTargets: readonly PortfolioAllocationTarget[],
  allocationResult: PortfolioCapitalAllocationResult,
): readonly PortfolioAllocationTarget[] {
  const allocatedByTarget = new Map(
    allocationResult.allocations.map((allocation) => [
      `${allocation.targetType}:${allocation.targetId}`,
      allocation,
    ] as const),
  );

  return Object.freeze(
    originalTargets.map((target) => {
      const allocated = allocatedByTarget.get(`${target.targetType}:${target.targetId}`);
      const targetWeight = allocated?.allocatedWeight ?? target.currentWeight;

      return Object.freeze({
        ...target,
        minimumWeight: targetWeight,
        maximumWeight: targetWeight,
        metadata: Object.freeze({
          ...(target.metadata ?? {}),
          driftTargetSource: "capital-allocation-result",
        }),
      });
    }),
  );
}

function requiresApproval(mode: PortfolioManagerMode): boolean {
  return mode === PortfolioManagerMode.APPROVAL_REQUIRED ||
    mode === PortfolioManagerMode.SEMI_AUTOMATIC;
}

function executionAllowed(mode: PortfolioManagerMode): boolean {
  return mode === PortfolioManagerMode.PAPER ||
    mode === PortfolioManagerMode.SEMI_AUTOMATIC ||
    mode === PortfolioManagerMode.FULLY_AUTOMATIC ||
    mode === PortfolioManagerMode.EMERGENCY_SAFE;
}

function buildRejectedStatus(
  approvalRequired: boolean,
): PortfolioDecisionStatus {
  return approvalRequired
    ? PortfolioDecisionStatus.DEFERRED
    : PortfolioDecisionStatus.REJECTED;
}

export class DeterministicAIPortfolioManager
  implements AIPortfolioManagerContract
{
  private readonly options: ResolvedOptions;
  private readonly clock: AIPortfolioManagerClock;
  private readonly validator: AIPortfolioValidator;
  private readonly stateAnalyzer: AIPortfolioStateAnalyzer;
  private readonly correlationEngine: PortfolioCorrelationEngine;
  private readonly riskBudgetEngine: PortfolioRiskBudgetEngine;
  private readonly optimizer: PortfolioOptimizer;
  private readonly capitalAllocator: PortfolioCapitalAllocator;
  private readonly driftDetector: PortfolioDriftDetector;
  private readonly rebalancingEngine: PortfolioRebalancingEngine;
  private readonly explainabilityEngine: PortfolioExplainabilityEngine;

  public constructor(
    options: AIPortfolioManagerOptions = Object.freeze({}),
    dependencies: AIPortfolioManagerDependencies = Object.freeze({}),
    clock: AIPortfolioManagerClock = SYSTEM_CLOCK,
  ) {
    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = resolveOptions(options);
    this.clock = clock;
    this.validator = dependencies.validator ?? new AIPortfolioValidator(options.validatorOptions);
    this.stateAnalyzer = dependencies.stateAnalyzer ?? new AIPortfolioStateAnalyzer();
    this.correlationEngine = dependencies.correlationEngine ?? new AIPortfolioCorrelationEngine();
    this.riskBudgetEngine = dependencies.riskBudgetEngine ?? new AIPortfolioRiskBudgetAllocator();
    this.optimizer = dependencies.optimizer ?? new AIPortfolioOptimizationEngine();
    this.capitalAllocator = dependencies.capitalAllocator ?? new AIPortfolioCapitalAllocationEngine();
    this.driftDetector = dependencies.driftDetector ?? new AIPortfolioDriftDetector();
    this.rebalancingEngine = dependencies.rebalancingEngine ?? new AIPortfolioRebalancePlanner();
    this.explainabilityEngine = dependencies.explainabilityEngine ?? new AIPortfolioExplainabilityEngine();
  }

  public evaluate(
    request: AIPortfolioManagerRequest,
  ): AIPortfolioManagerDecision {
    const validated = this.validator.validate(request);
    const nowMilliseconds = this.clock.now();
    assertFiniteNumber(nowMilliseconds, "clock.now()");
    const generatedAt = new Date(nowMilliseconds).toISOString();
    const decisionId = deterministicId("portfolio-decision", validated);
    const warnings: string[] = [];
    const rejectionReasons: string[] = [];

    const state = this.stateAnalyzer.analyze(validated.snapshot);
    warnings.push(...state.warnings);

    const dataQuality = buildDataQualityReport(
      validated,
      nowMilliseconds,
      this.options,
    );

    let correlationMatrix: PortfolioCorrelationMatrix | undefined;
    let covarianceMatrix: PortfolioCovarianceMatrix | undefined;
    let riskBudgetResult: PortfolioRiskBudgetResult | undefined;
    let optimizationResult: PortfolioOptimizationResult | undefined;
    let allocationResult: PortfolioCapitalAllocationResult | undefined;
    let driftReport: PortfolioDriftReport | undefined;
    let rebalancePlan: PortfolioRebalancePlan | undefined;

    try {
      if (validated.returnSeries.length > 0) {
        correlationMatrix = this.correlationEngine.calculate(
          validated.returnSeries,
          generatedAt,
        );
        this.validator.validateCorrelationMatrix(correlationMatrix);
        covarianceMatrix = buildCovarianceMatrix(
          validated.returnSeries,
          generatedAt,
          this.options.covarianceMinimumObservations,
        );
        if (covarianceMatrix !== undefined) {
          this.validator.validateCovarianceMatrix(covarianceMatrix);
        }
      }

      if (validated.configuration.requireFreshMarketData &&
          dataQuality.status !== PortfolioDataQualityStatus.VALID) {
        rejectionReasons.push(
          "Fresh and complete market data is required by configuration.",
        );
      }

      if (validated.configuration.requireRiskBudget && validated.riskBudget === undefined) {
        rejectionReasons.push("A risk budget is required by configuration.");
      }

      if (validated.riskBudget !== undefined) {
        riskBudgetResult = this.riskBudgetEngine.evaluate(
          validated.snapshot,
          validated.riskBudget,
          covarianceMatrix,
        );
        if (!riskBudgetResult.withinBudget) {
          rejectionReasons.push(...riskBudgetResult.violations);
        }
      }

      if (validated.configuration.enabled) {
        const optimizationRequest: PortfolioOptimizationRequest = Object.freeze({
          optimizationId: deterministicId("portfolio-optimization", validated),
          portfolioId: validated.portfolioId,
          snapshot: validated.snapshot,
          assets: buildOptimizationAssets(validated, state),
          returnSeries: validated.returnSeries,
          correlationMatrix,
          covarianceMatrix,
          riskBudget: validated.riskBudget,
          policy: validated.configuration.allocationPolicy,
          preferences: validated.configuration.optimizationPreferences,
          requestedAt: validated.requestedAt,
          metadata: Object.freeze({
            requestId: validated.requestId,
            decisionId,
          }),
        });
        optimizationResult = this.optimizer.optimize(optimizationRequest);
        warnings.push(...optimizationResult.diagnostics.warnings);
        if (!optimizationResult.diagnostics.converged) {
          rejectionReasons.push("Portfolio optimization did not converge.");
        }
        rejectionReasons.push(...optimizationResult.diagnostics.constraintViolations);

        const allocationRequest: PortfolioCapitalAllocationRequest = Object.freeze({
          allocationId: deterministicId("portfolio-allocation", validated),
          portfolioId: validated.portfolioId,
          snapshot: validated.snapshot,
          availableCapital: validated.snapshot.totalEquity,
          targets: validated.allocationTargets,
          policy: validated.configuration.allocationPolicy,
          riskBudget: validated.riskBudget,
          optimizationResult,
          requestedAt: validated.requestedAt,
          metadata: Object.freeze({
            requestId: validated.requestId,
            decisionId,
          }),
        });
        allocationResult = this.capitalAllocator.allocate(allocationRequest);
        warnings.push(...allocationResult.warnings);
        if (!allocationResult.constraintsSatisfied) {
          rejectionReasons.push(...allocationResult.violations);
        }

        driftReport = this.driftDetector.detect(
          validated.portfolioId,
          validated.snapshot.snapshotId,
          buildDriftTargets(validated.allocationTargets, allocationResult),
          generatedAt,
        );

        if (driftReport.rebalanceRequired) {
          const approvalRequired = requiresApproval(validated.configuration.mode);
          const rebalanceRequest: PortfolioRebalanceRequest = Object.freeze({
            rebalanceId: deterministicId("portfolio-rebalance", validated),
            portfolioId: validated.portfolioId,
            snapshot: validated.snapshot,
            reason: PortfolioRebalanceReason.ALLOCATION_DRIFT,
            allocationResult,
            driftReport,
            optimizationResult,
            maximumTurnover: validated.configuration.allocationPolicy.maximumTurnover,
            approvalRequired,
            requestedAt: validated.requestedAt,
            metadata: Object.freeze({
              requestId: validated.requestId,
              decisionId,
            }),
          });
          rebalancePlan = this.rebalancingEngine.createPlan(rebalanceRequest);
        }
      } else {
        rejectionReasons.push("AI portfolio manager is disabled by configuration.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rejectionReasons.push(`Portfolio orchestration failed: ${message}`);
      if (!this.options.failClosedOnComponentError) {
        warnings.push(`Non-fatal component error: ${message}`);
      }
    }

    const performance = calculatePortfolioPerformance(validated, state);
    const healthReport = buildHealthReport(
      validated,
      state,
      performance,
      correlationMatrix,
      generatedAt,
    );

    if (healthReport.riskLevel === PortfolioRiskLevel.CRITICAL) {
      rejectionReasons.push("Portfolio health risk is critical.");
    }

    const approvalRequired = requiresApproval(validated.configuration.mode);
    const hasBlockingRejection = rejectionReasons.length > 0;
    const approvedForExecution =
      validated.configuration.enabled &&
      !hasBlockingRejection &&
      executionAllowed(validated.configuration.mode) &&
      (!approvalRequired || validated.configuration.mode === PortfolioManagerMode.SEMI_AUTOMATIC) &&
      (rebalancePlan === undefined || validated.configuration.allowAutomaticRebalancing);
    const status = hasBlockingRejection
      ? buildRejectedStatus(approvalRequired)
      : approvalRequired
        ? PortfolioDecisionStatus.DEFERRED
        : PortfolioDecisionStatus.VALIDATED;
    const expiresAt = new Date(
      nowMilliseconds + validated.configuration.maximumDecisionAgeMilliseconds,
    ).toISOString();

    const baseDecision: Omit<AIPortfolioManagerDecision, "explanation"> = Object.freeze({
      decisionId,
      requestId: validated.requestId,
      portfolioId: validated.portfolioId,
      status,
      mode: validated.configuration.mode,
      healthReport,
      correlationMatrix,
      covarianceMatrix,
      riskBudgetResult,
      optimizationResult,
      allocationResult,
      driftReport,
      rebalancePlan,
      dataQuality,
      approvedForExecution,
      approvalRequired,
      rejectionReasons: Object.freeze([...new Set(rejectionReasons)]),
      warnings: Object.freeze([...new Set(warnings)]),
      generatedAt,
      expiresAt,
      metadata: Object.freeze({
        ...(this.options.metadata ?? {}),
        ...(validated.metadata ?? {}),
        stateAnalysisId: state.analysisId,
        configurationMode: validated.configuration.mode,
        ...(hasBlockingRejection
          ? { errorCode: AIPortfolioErrorCode.CONSTRAINT_VIOLATION }
          : {}),
      }),
    });

    let explanation: PortfolioDecisionExplanation | undefined;
    if (validated.configuration.requireExplanation) {
      try {
        explanation = this.explainabilityEngine.explain(baseDecision);
      } catch (error) {
        if (this.options.failClosedOnComponentError) {
          const issue = Object.freeze({
            code: AIPortfolioErrorCode.EXPLANATION_FAILED,
            field: "explanation",
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          });
          throw new AIPortfolioValidationError(issue);
        }
      }
    }

    return Object.freeze({
      ...baseDecision,
      explanation,
    });
  }
}

/** Conventional public subsystem name. */
export class AIPortfolioManager extends DeterministicAIPortfolioManager {}

export function evaluateAIPortfolio(
  request: AIPortfolioManagerRequest,
  options?: AIPortfolioManagerOptions,
  dependencies?: AIPortfolioManagerDependencies,
  clock?: AIPortfolioManagerClock,
): AIPortfolioManagerDecision {
  return new DeterministicAIPortfolioManager(
    options,
    dependencies,
    clock,
  ).evaluate(request);
}