/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 7: Deterministic portfolio optimization engine.
 *
 * Uses projected iterative optimization with deterministic initialization,
 * bounded weights, cash reserve enforcement, turnover/cost penalties, optional
 * expected-return and covariance inputs, and immutable results.
 */

import {
  type AssetSymbol,
  type PortfolioCovarianceMatrix,
  type PortfolioMetadata,
  type PortfolioOptimizationAsset,
  type PortfolioOptimizationDiagnostics,
  type PortfolioOptimizationRequest,
  type PortfolioOptimizationResult,
  type PortfolioOptimizedWeight,
  type PortfolioOptimizer,
  type Timestamp,
} from "./ai-portfolio-contracts";

export interface PortfolioOptimizationClock {
  now(): number;
}

export interface PortfolioOptimizationEngineOptions {
  readonly defaultMaximumIterations?: number;
  readonly defaultConvergenceTolerance?: number;
  readonly learningRate?: number;
  readonly minimumLearningRate?: number;
  readonly numericalTolerance?: number;
  readonly resultTimeToLiveMilliseconds?: number;
  readonly includeProcessingTime?: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedOptions {
  readonly defaultMaximumIterations: number;
  readonly defaultConvergenceTolerance: number;
  readonly learningRate: number;
  readonly minimumLearningRate: number;
  readonly numericalTolerance: number;
  readonly resultTimeToLiveMilliseconds?: number;
  readonly includeProcessingTime: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface NormalizedAsset {
  readonly source: PortfolioOptimizationAsset;
  readonly asset: AssetSymbol;
  readonly currentWeight: number;
  readonly currentValue: number;
  readonly expectedReturn: number;
  readonly expectedVolatility?: number;
  readonly liquidityScore: number;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly transactionCostRate: number;
}

interface OptimizationContext {
  readonly request: PortfolioOptimizationRequest;
  readonly assets: readonly NormalizedAsset[];
  readonly covariance?: readonly (readonly number[])[];
  readonly totalEquity: number;
  readonly targetInvestedWeight: number;
  readonly maximumIterations: number;
  readonly convergenceTolerance: number;
  readonly riskAversion: number;
  readonly returnPreference: number;
  readonly diversificationPreference: number;
  readonly turnoverPenalty: number;
  readonly transactionCostPenalty: number;
  readonly drawdownPenalty: number;
  readonly targetReturn?: number;
  readonly targetVolatility?: number;
  readonly allowShortPositions: boolean;
  readonly allowLeverage: boolean;
}

interface ObjectiveEvaluation {
  readonly value: number;
  readonly expectedReturn: number;
  readonly variance?: number;
  readonly volatility?: number;
  readonly turnover: number;
  readonly transactionCost: number;
  readonly concentration: number;
}

const SYSTEM_CLOCK: PortfolioOptimizationClock = Object.freeze({
  now: (): number => Date.now(),
});

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function assertWeight(value: number, field: string): void {
  assertFinite(value, field);
  if (value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1.`);
  }
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function resolveOptions(
  options: PortfolioOptimizationEngineOptions | undefined,
): ResolvedOptions {
  const resolved: ResolvedOptions = Object.freeze({
    defaultMaximumIterations:
      options?.defaultMaximumIterations ?? 500,
    defaultConvergenceTolerance:
      options?.defaultConvergenceTolerance ?? 1e-9,
    learningRate: options?.learningRate ?? 0.05,
    minimumLearningRate: options?.minimumLearningRate ?? 1e-8,
    numericalTolerance: options?.numericalTolerance ?? 1e-12,
    resultTimeToLiveMilliseconds:
      options?.resultTimeToLiveMilliseconds,
    includeProcessingTime: options?.includeProcessingTime ?? false,
    metadata: cloneMetadata(options?.metadata),
  });

  if (
    !Number.isInteger(resolved.defaultMaximumIterations) ||
    resolved.defaultMaximumIterations <= 0
  ) {
    throw new RangeError(
      "options.defaultMaximumIterations must be a positive integer.",
    );
  }

  for (const [field, value] of [
    [
      "options.defaultConvergenceTolerance",
      resolved.defaultConvergenceTolerance,
    ],
    ["options.learningRate", resolved.learningRate],
    ["options.minimumLearningRate", resolved.minimumLearningRate],
    ["options.numericalTolerance", resolved.numericalTolerance],
  ] as const) {
    assertFinite(value, field);
    if (value <= 0) {
      throw new RangeError(`${field} must be greater than zero.`);
    }
  }

  if (
    resolved.resultTimeToLiveMilliseconds !== undefined
  ) {
    assertFinite(
      resolved.resultTimeToLiveMilliseconds,
      "options.resultTimeToLiveMilliseconds",
    );
    if (resolved.resultTimeToLiveMilliseconds <= 0) {
      throw new RangeError(
        "options.resultTimeToLiveMilliseconds must be greater than zero.",
      );
    }
  }

  return resolved;
}

function normalizeTimestamp(
  value: Timestamp,
  field: string,
): Timestamp {
  assertNonEmpty(value, field);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${field} must be a valid timestamp.`);
  }
  return new Date(milliseconds).toISOString();
}

function optionalNonNegative(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  assertFinite(value, field);
  if (value < 0) {
    throw new RangeError(`${field} must be non-negative.`);
  }
  return value;
}

function normalizeAssets(
  request: PortfolioOptimizationRequest,
): readonly NormalizedAsset[] {
  if (!Array.isArray(request.assets) || request.assets.length === 0) {
    throw new RangeError(
      "request.assets must contain at least one asset.",
    );
  }

  const seen = new Set<string>();
  const assets = request.assets
    .filter((asset) => asset.enabled)
    .map((asset, index): NormalizedAsset => {
      const field = `request.assets[${index}]`;
      assertNonEmpty(asset.asset, `${field}.asset`);

      if (seen.has(asset.asset)) {
        throw new Error(
          `request.assets contains duplicate asset ${asset.asset}.`,
        );
      }
      seen.add(asset.asset);

      assertFinite(asset.currentWeight, `${field}.currentWeight`);
      assertFinite(asset.currentValue, `${field}.currentValue`);

      const allowShort =
        request.preferences.allowShortPositions ?? false;
      const minimumWeight =
        asset.minimumWeight ?? (allowShort ? -1 : 0);
      const maximumWeight = Math.min(
        asset.maximumWeight ??
          request.policy.maximumSingleAssetWeight,
        request.policy.maximumSingleAssetWeight,
      );

      assertFinite(minimumWeight, `${field}.minimumWeight`);
      assertFinite(maximumWeight, `${field}.maximumWeight`);

      if (!allowShort && minimumWeight < 0) {
        throw new RangeError(
          `${field}.minimumWeight cannot be negative when short positions are disabled.`,
        );
      }

      if (minimumWeight > maximumWeight) {
        throw new RangeError(
          `${field}.minimumWeight cannot exceed maximumWeight.`,
        );
      }

      const expectedReturn = optionalNonNegative(
        asset.expectedReturn,
        0,
        `${field}.expectedReturn`,
      );
      const liquidityScore =
        asset.liquidityScore === undefined
          ? 1
          : asset.liquidityScore;
      assertFinite(liquidityScore, `${field}.liquidityScore`);

      const transactionCostRate = optionalNonNegative(
        asset.transactionCostRate,
        0,
        `${field}.transactionCostRate`,
      );

      if (asset.expectedVolatility !== undefined) {
        optionalNonNegative(
          asset.expectedVolatility,
          0,
          `${field}.expectedVolatility`,
        );
      }

      return Object.freeze({
        source: asset,
        asset: asset.asset,
        currentWeight: asset.currentWeight,
        currentValue: asset.currentValue,
        expectedReturn,
        expectedVolatility: asset.expectedVolatility,
        liquidityScore,
        minimumWeight,
        maximumWeight,
        transactionCostRate,
      });
    })
    .sort((left, right) =>
      left.asset.localeCompare(right.asset),
    );

  if (assets.length === 0) {
    throw new RangeError(
      "request.assets must contain at least one enabled asset.",
    );
  }

  return Object.freeze(assets);
}

function normalizeCovariance(
  matrix: PortfolioCovarianceMatrix | undefined,
  assets: readonly NormalizedAsset[],
): readonly (readonly number[])[] | undefined {
  if (matrix === undefined) {
    return undefined;
  }

  const indexByAsset = new Map<string, number>();
  matrix.assets.forEach((asset, index) => {
    indexByAsset.set(asset, index);
  });

  const result = assets.map((left, leftIndex) =>
    Object.freeze(
      assets.map((right, rightIndex) => {
        const sourceLeft = indexByAsset.get(left.asset);
        const sourceRight = indexByAsset.get(right.asset);

        if (
          sourceLeft === undefined ||
          sourceRight === undefined
        ) {
          return leftIndex === rightIndex
            ? (left.expectedVolatility ?? 0) ** 2
            : 0;
        }

        const value =
          matrix.values[sourceLeft]?.[sourceRight];

        if (value === undefined) {
          throw new RangeError(
            "request.covarianceMatrix.values does not match its asset dimensions.",
          );
        }

        assertFinite(
          value,
          `request.covarianceMatrix.values[${sourceLeft}][${sourceRight}]`,
        );
        return value;
      }),
    ),
  );

  return Object.freeze(result);
}

function buildContext(
  request: PortfolioOptimizationRequest,
): OptimizationContext {
  assertNonEmpty(
    request.optimizationId,
    "request.optimizationId",
  );
  assertNonEmpty(request.portfolioId, "request.portfolioId");
  normalizeTimestamp(request.requestedAt, "request.requestedAt");

  if (request.snapshot.portfolioId !== request.portfolioId) {
    throw new Error(
      "request.snapshot.portfolioId must match request.portfolioId.",
    );
  }

  if (request.policy.portfolioId !== request.portfolioId) {
    throw new Error(
      "request.policy.portfolioId must match request.portfolioId.",
    );
  }

  const totalEquity = request.snapshot.totalEquity;
  assertFinite(totalEquity, "request.snapshot.totalEquity");
  if (totalEquity < 0) {
    throw new RangeError(
      "request.snapshot.totalEquity must be non-negative.",
    );
  }

  assertWeight(
    request.policy.minimumCashReserveWeight,
    "request.policy.minimumCashReserveWeight",
  );
  assertWeight(
    request.policy.maximumInvestedWeight,
    "request.policy.maximumInvestedWeight",
  );
  assertWeight(
    request.policy.maximumSingleAssetWeight,
    "request.policy.maximumSingleAssetWeight",
  );

  const preferences = request.preferences;
  const targetCashWeight =
    preferences.targetCashWeight ??
    request.policy.minimumCashReserveWeight;
  assertWeight(
    targetCashWeight,
    "request.preferences.targetCashWeight",
  );

  const allowLeverage =
    preferences.allowLeverage ?? false;
  const maximumInvestedByCash = 1 - targetCashWeight;
  const targetInvestedWeight = allowLeverage
    ? Math.max(
        maximumInvestedByCash,
        Math.min(
          request.policy.maximumLeverage ?? 1,
          request.policy.maximumInvestedWeight,
        ),
      )
    : Math.min(
        maximumInvestedByCash,
        request.policy.maximumInvestedWeight,
        1,
      );

  const assets = normalizeAssets(request);

  const maximumIterations =
    preferences.maximumIterations ?? 500;
  if (
    !Number.isInteger(maximumIterations) ||
    maximumIterations <= 0
  ) {
    throw new RangeError(
      "request.preferences.maximumIterations must be a positive integer.",
    );
  }

  const convergenceTolerance =
    preferences.convergenceTolerance ?? 1e-9;
  assertFinite(
    convergenceTolerance,
    "request.preferences.convergenceTolerance",
  );
  if (convergenceTolerance <= 0) {
    throw new RangeError(
      "request.preferences.convergenceTolerance must be greater than zero.",
    );
  }

  const targetReturn = preferences.targetReturn;
  if (targetReturn !== undefined) {
    assertFinite(
      targetReturn,
      "request.preferences.targetReturn",
    );
  }

  const targetVolatility = preferences.targetVolatility;
  if (targetVolatility !== undefined) {
    optionalNonNegative(
      targetVolatility,
      0,
      "request.preferences.targetVolatility",
    );
  }

  return Object.freeze({
    request,
    assets,
    covariance: normalizeCovariance(
      request.covarianceMatrix,
      assets,
    ),
    totalEquity,
    targetInvestedWeight,
    maximumIterations,
    convergenceTolerance,
    riskAversion: optionalNonNegative(
      preferences.riskAversion,
      1,
      "request.preferences.riskAversion",
    ),
    returnPreference: optionalNonNegative(
      preferences.returnPreference,
      1,
      "request.preferences.returnPreference",
    ),
    diversificationPreference: optionalNonNegative(
      preferences.diversificationPreference,
      0.1,
      "request.preferences.diversificationPreference",
    ),
    turnoverPenalty: optionalNonNegative(
      preferences.turnoverPenalty,
      0.1,
      "request.preferences.turnoverPenalty",
    ),
    transactionCostPenalty: optionalNonNegative(
      preferences.transactionCostPenalty,
      1,
      "request.preferences.transactionCostPenalty",
    ),
    drawdownPenalty: optionalNonNegative(
      preferences.drawdownPenalty,
      0,
      "request.preferences.drawdownPenalty",
    ),
    targetReturn,
    targetVolatility,
    allowShortPositions:
      preferences.allowShortPositions ?? false,
    allowLeverage,
  });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function projectWeights(
  source: readonly number[],
  assets: readonly NormalizedAsset[],
  targetSum: number,
  tolerance: number,
): number[] {
  const weights = source.map((value, index) => {
    const asset = assets[index]!;
    return Math.min(
      asset.maximumWeight,
      Math.max(asset.minimumWeight, value),
    );
  });

  const minimumSum = sum(
    assets.map((asset) => asset.minimumWeight),
  );
  const maximumSum = sum(
    assets.map((asset) => asset.maximumWeight),
  );
  const feasibleTarget = Math.min(
    maximumSum,
    Math.max(minimumSum, targetSum),
  );

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const difference = feasibleTarget - sum(weights);
    if (Math.abs(difference) <= tolerance) {
      break;
    }

    const candidates = weights
      .map((weight, index) => ({
        index,
        room:
          difference > 0
            ? assets[index]!.maximumWeight - weight
            : weight - assets[index]!.minimumWeight,
      }))
      .filter((candidate) => candidate.room > tolerance);

    if (candidates.length === 0) {
      break;
    }

    const adjustment = difference / candidates.length;

    for (const candidate of candidates) {
      const asset = assets[candidate.index]!;
      weights[candidate.index] = Math.min(
        asset.maximumWeight,
        Math.max(
          asset.minimumWeight,
          weights[candidate.index]! + adjustment,
        ),
      );
    }
  }

  return weights;
}

function portfolioVariance(
  weights: readonly number[],
  covariance: readonly (readonly number[])[] | undefined,
  assets: readonly NormalizedAsset[],
): number | undefined {
  if (covariance !== undefined) {
    let variance = 0;
    for (let row = 0; row < weights.length; row += 1) {
      for (
        let column = 0;
        column < weights.length;
        column += 1
      ) {
        variance +=
          weights[row]! *
          weights[column]! *
          covariance[row]![column]!;
      }
    }
    return Math.max(0, variance);
  }

  if (
    assets.every(
      (asset) => asset.expectedVolatility !== undefined,
    )
  ) {
    return assets.reduce(
      (total, asset, index) =>
        total +
        (weights[index]! * (asset.expectedVolatility ?? 0)) **
          2,
      0,
    );
  }

  return undefined;
}

function evaluateObjective(
  weights: readonly number[],
  context: OptimizationContext,
): ObjectiveEvaluation {
  const expectedReturn = context.assets.reduce(
    (total, asset, index) =>
      total + weights[index]! * asset.expectedReturn,
    0,
  );
  const variance = portfolioVariance(
    weights,
    context.covariance,
    context.assets,
  );
  const volatility =
    variance === undefined ? undefined : Math.sqrt(variance);
  const turnover =
    context.assets.reduce(
      (total, asset, index) =>
        total +
        Math.abs(weights[index]! - asset.currentWeight),
      0,
    ) / 2;
  const transactionCost =
    context.assets.reduce(
      (total, asset, index) =>
        total +
        Math.abs(weights[index]! - asset.currentWeight) *
          asset.transactionCostRate,
      0,
    );
  const concentration = weights.reduce(
    (total, weight) => total + weight * weight,
    0,
  );

  let value =
    context.returnPreference * expectedReturn -
    context.riskAversion * (variance ?? 0) -
    context.diversificationPreference * concentration -
    context.turnoverPenalty * turnover -
    context.transactionCostPenalty * transactionCost;

  if (
    context.targetReturn !== undefined &&
    expectedReturn < context.targetReturn
  ) {
    value -=
      (context.targetReturn - expectedReturn) ** 2 *
      context.returnPreference *
      10;
  }

  if (
    context.targetVolatility !== undefined &&
    volatility !== undefined &&
    volatility > context.targetVolatility
  ) {
    value -=
      (volatility - context.targetVolatility) ** 2 *
      context.riskAversion *
      10;
  }

  return Object.freeze({
    value,
    expectedReturn,
    variance,
    volatility,
    turnover,
    transactionCost,
    concentration,
  });
}

function numericalGradient(
  weights: readonly number[],
  context: OptimizationContext,
): number[] {
  const epsilon = 1e-6;
  return weights.map((weight, index) => {
    const plus = [...weights];
    const minus = [...weights];
    plus[index] = weight + epsilon;
    minus[index] = weight - epsilon;
    return (
      (evaluateObjective(plus, context).value -
        evaluateObjective(minus, context).value) /
      (2 * epsilon)
    );
  });
}

function constraintViolations(
  weights: readonly number[],
  context: OptimizationContext,
): string[] {
  const violations: string[] = [];
  const investedWeight = sum(weights);
  const cashWeight = 1 - investedWeight;

  context.assets.forEach((asset, index) => {
    const weight = weights[index]!;
    if (
      weight <
      asset.minimumWeight - context.convergenceTolerance
    ) {
      violations.push(
        `${asset.asset} weight is below its minimum.`,
      );
    }
    if (
      weight >
      asset.maximumWeight + context.convergenceTolerance
    ) {
      violations.push(
        `${asset.asset} weight exceeds its maximum.`,
      );
    }
  });

  if (
    investedWeight >
    context.request.policy.maximumInvestedWeight +
      context.convergenceTolerance
  ) {
    violations.push(
      "Invested weight exceeds policy maximumInvestedWeight.",
    );
  }

  if (
    cashWeight <
    context.request.policy.minimumCashReserveWeight -
      context.convergenceTolerance
  ) {
    violations.push(
      "Cash weight is below policy minimumCashReserveWeight.",
    );
  }

  const evaluation = evaluateObjective(weights, context);

  if (
    context.request.policy.maximumTurnover !== undefined &&
    evaluation.turnover >
      context.request.policy.maximumTurnover +
        context.convergenceTolerance
  ) {
    violations.push(
      "Expected turnover exceeds policy maximumTurnover.",
    );
  }

  if (
    context.request.policy.maximumPortfolioVolatility !==
      undefined &&
    evaluation.volatility !== undefined &&
    evaluation.volatility >
      context.request.policy.maximumPortfolioVolatility +
        context.convergenceTolerance
  ) {
    violations.push(
      "Expected volatility exceeds policy maximumPortfolioVolatility.",
    );
  }

  return violations;
}

function optimizeWeights(
  context: OptimizationContext,
  options: ResolvedOptions,
): {
  readonly weights: readonly number[];
  readonly iterations: number;
  readonly converged: boolean;
  readonly evaluation: ObjectiveEvaluation;
} {
  let weights = projectWeights(
    context.assets.map((asset) => asset.currentWeight),
    context.assets,
    context.targetInvestedWeight,
    options.numericalTolerance,
  );

  let evaluation = evaluateObjective(weights, context);
  let learningRate = options.learningRate;
  let converged = false;
  let iterations = 0;

  for (
    iterations = 1;
    iterations <= context.maximumIterations;
    iterations += 1
  ) {
    const gradient = numericalGradient(weights, context);
    const candidate = projectWeights(
      weights.map(
        (weight, index) =>
          weight + learningRate * gradient[index]!,
      ),
      context.assets,
      context.targetInvestedWeight,
      options.numericalTolerance,
    );
    const candidateEvaluation = evaluateObjective(
      candidate,
      context,
    );

    if (candidateEvaluation.value + options.numericalTolerance <
        evaluation.value) {
      learningRate /= 2;
      if (learningRate < options.minimumLearningRate) {
        break;
      }
      continue;
    }

    const maximumChange = Math.max(
      ...candidate.map((value, index) =>
        Math.abs(value - weights[index]!),
      ),
    );

    weights = candidate;
    evaluation = candidateEvaluation;

    if (maximumChange <= context.convergenceTolerance) {
      converged = true;
      break;
    }
  }

  return Object.freeze({
    weights: Object.freeze([...weights]),
    iterations: Math.min(iterations, context.maximumIterations),
    converged,
    evaluation,
  });
}

function buildOptimizedWeights(
  context: OptimizationContext,
  weights: readonly number[],
): readonly PortfolioOptimizedWeight[] {
  return Object.freeze(
    context.assets.map((asset, index) => {
      const optimizedWeight = weights[index]!;
      const optimizedValue =
        optimizedWeight * context.totalEquity;
      const expectedRiskContribution =
        asset.expectedVolatility === undefined
          ? undefined
          : optimizedWeight * asset.expectedVolatility;

      return Object.freeze({
        asset: asset.asset,
        previousWeight: asset.currentWeight,
        optimizedWeight,
        weightChange:
          optimizedWeight - asset.currentWeight,
        previousValue: asset.currentValue,
        optimizedValue,
        valueChange: optimizedValue - asset.currentValue,
        expectedReturnContribution:
          optimizedWeight * asset.expectedReturn,
        ...(expectedRiskContribution === undefined
          ? {}
          : { expectedRiskContribution }),
        metadata: Object.freeze({
          liquidityScore: asset.liquidityScore,
          minimumWeight: asset.minimumWeight,
          maximumWeight: asset.maximumWeight,
          transactionCostRate: asset.transactionCostRate,
        }),
      });
    }),
  );
}

export function optimizePortfolio(
  request: PortfolioOptimizationRequest,
  options?: PortfolioOptimizationEngineOptions,
  clock: PortfolioOptimizationClock = SYSTEM_CLOCK,
): PortfolioOptimizationResult {
  if (typeof clock?.now !== "function") {
    throw new TypeError(
      "clock must provide a now() function.",
    );
  }

  const resolved = resolveOptions(options);
  const startedAt = clock.now();
  assertFinite(startedAt, "clock.now()");

  const context = buildContext(request);
  const optimized = optimizeWeights(context, resolved);
  const generatedAt = new Date(clock.now()).toISOString();
  const investedWeight = sum(optimized.weights);
  const cashWeight = Math.max(0, 1 - investedWeight);
  const violations = constraintViolations(
    optimized.weights,
    context,
  );
  const warnings: string[] = [];

  if (context.covariance === undefined) {
    warnings.push(
      "Covariance matrix was unavailable; diagonal volatility fallback or zero risk was used.",
    );
  }

  if (!optimized.converged) {
    warnings.push(
      "Optimizer stopped before convergence tolerance was reached.",
    );
  }

  const diagnostics: PortfolioOptimizationDiagnostics =
    Object.freeze({
      iterations: optimized.iterations,
      converged: optimized.converged,
      objectiveValue: optimized.evaluation.value,
      constraintViolations: Object.freeze(violations),
      warnings: Object.freeze(warnings),
      ...(resolved.includeProcessingTime
        ? {
            processingTimeMilliseconds: Math.max(
              0,
              clock.now() - startedAt,
            ),
          }
        : {}),
      metadata: Object.freeze({
        algorithm: "DETERMINISTIC_PROJECTED_GRADIENT",
        assetCount: context.assets.length,
        targetInvestedWeight: context.targetInvestedWeight,
        covarianceAvailable:
          context.covariance !== undefined,
      }),
    });

  const expectedVolatility =
    optimized.evaluation.volatility;
  const expectedSharpeRatio =
    expectedVolatility !== undefined &&
    expectedVolatility > resolved.numericalTolerance
      ? optimized.evaluation.expectedReturn /
        expectedVolatility
      : undefined;
  const expiresAt =
    resolved.resultTimeToLiveMilliseconds === undefined
      ? undefined
      : new Date(
          Date.parse(generatedAt) +
            resolved.resultTimeToLiveMilliseconds,
        ).toISOString();

  return Object.freeze({
    optimizationId: request.optimizationId,
    portfolioId: request.portfolioId,
    objective: request.preferences.objective,
    method: request.preferences.method,
    weights: buildOptimizedWeights(
      context,
      optimized.weights,
    ),
    expectedReturn: optimized.evaluation.expectedReturn,
    ...(expectedVolatility === undefined
      ? {}
      : { expectedVolatility }),
    ...(expectedSharpeRatio === undefined
      ? {}
      : { expectedSharpeRatio }),
    expectedTurnover: optimized.evaluation.turnover,
    estimatedTransactionCost:
      optimized.evaluation.transactionCost *
      context.totalEquity,
    cashWeight,
    investedWeight,
    diagnostics,
    generatedAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    metadata: Object.freeze({
      ...(resolved.metadata ?? {}),
      ...(request.metadata ?? {}),
      policyId: request.policy.policyId,
      snapshotId: request.snapshot.snapshotId,
      totalEquity: context.totalEquity,
    }),
  });
}

export class DeterministicPortfolioOptimizationEngine
  implements PortfolioOptimizer
{
  private readonly options: PortfolioOptimizationEngineOptions;
  private readonly clock: PortfolioOptimizationClock;

  public constructor(
    options: PortfolioOptimizationEngineOptions =
      Object.freeze({}),
    clock: PortfolioOptimizationClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError(
        "clock must provide a now() function.",
      );
    }

    this.options = Object.freeze({
      ...options,
      metadata: cloneMetadata(options.metadata),
    });
    this.clock = clock;
  }

  public optimize(
    request: PortfolioOptimizationRequest,
  ): PortfolioOptimizationResult {
    return optimizePortfolio(
      request,
      this.options,
      this.clock,
    );
  }
}

export class AIPortfolioOptimizationEngine extends DeterministicPortfolioOptimizationEngine {}