/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 5: Deterministic portfolio risk-budget allocator and evaluator.
 *
 * Evaluates measured portfolio risk against configured portfolio, asset,
 * strategy, bot, exchange, account, and market-type risk budgets.
 */

import {
  PortfolioRiskBudgetType,
  type PortfolioCovarianceMatrix,
  type PortfolioMetadata,
  type PortfolioPosition,
  type PortfolioRiskBudget,
  type PortfolioRiskBudgetEngine,
  type PortfolioRiskBudgetResult,
  type PortfolioRiskBudgetTarget,
  type PortfolioRiskContribution,
  type PortfolioSnapshot,
  type Timestamp,
} from "./ai-portfolio-contracts";

export interface RiskBudgetAllocatorClock {
  now(): number;
}

export interface RiskBudgetAllocatorOptions {
  /**
   * Numerical tolerance used for budget and zero comparisons.
   */
  readonly tolerance?: number;

  /**
   * Annualization factor used when covariance values represent periodic
   * returns. The default assumes daily covariance observations.
   */
  readonly annualizationFactor?: number;

  /**
   * When true, asset covariance risk is preferred when a compatible covariance
   * matrix is supplied. Otherwise exposure-based risk proxies are used.
   */
  readonly useCovarianceRisk?: boolean;

  /**
   * Reject risk-budget targets that repeat the same type and target ID.
   */
  readonly rejectDuplicateTargets?: boolean;

  /**
   * When true, risk targets with no measured exposure are still returned with
   * zero contribution.
   */
  readonly includeZeroContributions?: boolean;

  /**
   * Optional metadata copied into the generated budget and contribution
   * results.
   */
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedRiskBudgetAllocatorOptions {
  readonly tolerance: number;
  readonly annualizationFactor: number;
  readonly useCovarianceRisk: boolean;
  readonly rejectDuplicateTargets: boolean;
  readonly includeZeroContributions: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface MutableMeasuredRisk {
  absoluteRisk: number;
  marginalRisk?: number;
  metadata: Record<string, unknown>;
}

type RiskMeasureMap = Map<string, MutableMeasuredRisk>;

const SYSTEM_CLOCK: RiskBudgetAllocatorClock = Object.freeze({
  now: (): number => Date.now(),
});

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonNegativeNumber(value: number, field: string): void {
  assertFiniteNumber(value, field);

  if (value < 0) {
    throw new RangeError(
      `${field} must be greater than or equal to zero.`,
    );
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFiniteNumber(value, field);

  if (value < 0 || value > 1) {
    throw new RangeError(
      `${field} must be between 0 and 1 inclusive.`,
    );
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function round(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number(value.toPrecision(15));
}

function safeRatio(
  numerator: number,
  denominator: number,
  tolerance: number,
): number {
  if (Math.abs(denominator) <= tolerance) {
    return 0;
  }

  return numerator / denominator;
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function resolveOptions(
  options: RiskBudgetAllocatorOptions | undefined,
): ResolvedRiskBudgetAllocatorOptions {
  const resolved: ResolvedRiskBudgetAllocatorOptions = {
    tolerance: options?.tolerance ?? 1e-10,
    annualizationFactor: options?.annualizationFactor ?? 252,
    useCovarianceRisk: options?.useCovarianceRisk ?? true,
    rejectDuplicateTargets: options?.rejectDuplicateTargets ?? true,
    includeZeroContributions:
      options?.includeZeroContributions ?? true,
    metadata: cloneMetadata(options?.metadata),
  };

  assertNonNegativeNumber(resolved.tolerance, "options.tolerance");
  assertNonNegativeNumber(
    resolved.annualizationFactor,
    "options.annualizationFactor",
  );

  if (resolved.annualizationFactor <= 0) {
    throw new RangeError(
      "options.annualizationFactor must be greater than zero.",
    );
  }

  return Object.freeze(resolved);
}

function targetKey(
  type: PortfolioRiskBudgetType,
  targetId: string,
): string {
  return `${type}:${targetId}`;
}

function validateRiskBudget(
  riskBudget: PortfolioRiskBudget,
  options: ResolvedRiskBudgetAllocatorOptions,
): void {
  assertNonEmptyString(riskBudget.portfolioId, "riskBudget.portfolioId");
  assertNonNegativeNumber(
    riskBudget.totalRiskBudget,
    "riskBudget.totalRiskBudget",
  );

  if (riskBudget.volatilityBudget !== undefined) {
    assertNonNegativeNumber(
      riskBudget.volatilityBudget,
      "riskBudget.volatilityBudget",
    );
  }

  if (riskBudget.drawdownBudget !== undefined) {
    assertNonNegativeNumber(
      riskBudget.drawdownBudget,
      "riskBudget.drawdownBudget",
    );
  }

  if (riskBudget.valueAtRiskBudget !== undefined) {
    assertNonNegativeNumber(
      riskBudget.valueAtRiskBudget,
      "riskBudget.valueAtRiskBudget",
    );
  }

  if (riskBudget.conditionalValueAtRiskBudget !== undefined) {
    assertNonNegativeNumber(
      riskBudget.conditionalValueAtRiskBudget,
      "riskBudget.conditionalValueAtRiskBudget",
    );
  }

  if (!Array.isArray(riskBudget.targets)) {
    throw new TypeError("riskBudget.targets must be an array.");
  }

  const seen = new Set<string>();

  riskBudget.targets.forEach((target, index) => {
    const field = `riskBudget.targets[${index}]`;

    assertNonEmptyString(target.targetId, `${field}.targetId`);
    assertUnitInterval(
      target.targetRiskWeight,
      `${field}.targetRiskWeight`,
    );
    assertUnitInterval(
      target.maximumRiskWeight,
      `${field}.maximumRiskWeight`,
    );

    if (
      target.targetRiskWeight >
      target.maximumRiskWeight + options.tolerance
    ) {
      throw new RangeError(
        `${field}.targetRiskWeight cannot exceed maximumRiskWeight.`,
      );
    }

    if (target.currentRiskWeight !== undefined) {
      assertUnitInterval(
        target.currentRiskWeight,
        `${field}.currentRiskWeight`,
      );
    }

    if (target.riskAmount !== undefined) {
      assertNonNegativeNumber(
        target.riskAmount,
        `${field}.riskAmount`,
      );
    }

    if (options.rejectDuplicateTargets) {
      const key = targetKey(target.type, target.targetId);

      if (seen.has(key)) {
        throw new Error(`Duplicate risk-budget target: ${key}.`);
      }

      seen.add(key);
    }
  });

  const targetWeightSum = riskBudget.targets
    .filter((target) => target.type !== PortfolioRiskBudgetType.PORTFOLIO)
    .reduce((sum, target) => sum + target.targetRiskWeight, 0);

  if (targetWeightSum > 1 + options.tolerance) {
    throw new RangeError(
      "The sum of non-portfolio targetRiskWeight values cannot exceed 1.",
    );
  }
}

function validateCovarianceMatrix(
  covarianceMatrix: PortfolioCovarianceMatrix,
): void {
  if (!Array.isArray(covarianceMatrix.assets)) {
    throw new TypeError(
      "covarianceMatrix.assets must be an array.",
    );
  }

  if (!Array.isArray(covarianceMatrix.values)) {
    throw new TypeError(
      "covarianceMatrix.values must be a matrix.",
    );
  }

  const size = covarianceMatrix.assets.length;

  if (covarianceMatrix.values.length !== size) {
    throw new RangeError(
      "covarianceMatrix.values must contain one row per asset.",
    );
  }

  covarianceMatrix.values.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== size) {
      throw new RangeError(
        `covarianceMatrix.values[${rowIndex}] must contain ${size} values.`,
      );
    }

    row.forEach((value, columnIndex) => {
      assertFiniteNumber(
        value,
        `covarianceMatrix.values[${rowIndex}][${columnIndex}]`,
      );
    });
  });
}

function addRisk(
  map: RiskMeasureMap,
  key: string,
  amount: number,
  metadata: Record<string, unknown> = {},
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const current = map.get(key);

  if (current === undefined) {
    map.set(key, {
      absoluteRisk: amount,
      metadata: { ...metadata },
    });
    return;
  }

  current.absoluteRisk += amount;
  current.metadata = {
    ...current.metadata,
    ...metadata,
  };
}

function absolutePositionRisk(position: PortfolioPosition): number {
  const exposure = Math.abs(position.notionalValue);
  const leverage =
    position.leverage !== undefined && position.leverage > 0
      ? position.leverage
      : 1;
  const pnlStress =
    Math.abs(position.unrealizedPnl) +
    Math.abs(position.realizedPnl);

  return exposure * Math.sqrt(leverage) + pnlStress;
}

function buildExposureRiskMeasures(
  snapshot: PortfolioSnapshot,
): Map<PortfolioRiskBudgetType, RiskMeasureMap> {
  const result = new Map<PortfolioRiskBudgetType, RiskMeasureMap>();

  const getMap = (type: PortfolioRiskBudgetType): RiskMeasureMap => {
    const existing = result.get(type);

    if (existing !== undefined) {
      return existing;
    }

    const created = new Map<string, MutableMeasuredRisk>();
    result.set(type, created);
    return created;
  };

  const portfolioRisk =
    Math.abs(snapshot.grossExposure) +
    Math.abs(snapshot.unrealizedPnl) +
    Math.abs(snapshot.realizedPnl);

  addRisk(
    getMap(PortfolioRiskBudgetType.PORTFOLIO),
    snapshot.portfolioId,
    portfolioRisk,
    {
      source: "portfolio-exposure",
      grossExposure: snapshot.grossExposure,
    },
  );

  for (const position of snapshot.positions) {
    const amount = absolutePositionRisk(position);

    addRisk(
      getMap(PortfolioRiskBudgetType.ASSET),
      position.baseAsset,
      amount,
      {
        source: "positions",
      },
    );

    if (position.strategyId !== undefined) {
      addRisk(
        getMap(PortfolioRiskBudgetType.STRATEGY),
        position.strategyId,
        amount,
        {
          source: "positions",
        },
      );
    }

    if (position.botId !== undefined) {
      addRisk(
        getMap(PortfolioRiskBudgetType.BOT),
        position.botId,
        amount,
        {
          source: "positions",
        },
      );
    }

    addRisk(
      getMap(PortfolioRiskBudgetType.EXCHANGE),
      position.exchangeId,
      amount,
      {
        source: "positions",
      },
    );

    if (position.accountId !== undefined) {
      addRisk(
        getMap(PortfolioRiskBudgetType.ACCOUNT),
        position.accountId,
        amount,
        {
          source: "positions",
        },
      );
    }

    addRisk(
      getMap(PortfolioRiskBudgetType.MARKET_TYPE),
      String(position.marketType),
      amount,
      {
        source: "positions",
      },
    );
  }

  for (const exposure of snapshot.strategyExposures) {
    const amount =
      Math.abs(exposure.grossExposure) +
      Math.abs(exposure.unrealizedPnl) +
      Math.abs(exposure.realizedPnl);

    addRisk(
      getMap(PortfolioRiskBudgetType.STRATEGY),
      exposure.strategyId,
      amount,
      {
        source: "strategy-exposures",
        drawdown: exposure.drawdown,
      },
    );
  }

  for (const exposure of snapshot.botExposures) {
    const amount =
      Math.abs(exposure.grossExposure) +
      Math.abs(exposure.unrealizedPnl) +
      Math.abs(exposure.realizedPnl);

    addRisk(
      getMap(PortfolioRiskBudgetType.BOT),
      exposure.botId,
      amount,
      {
        source: "bot-exposures",
        drawdown: exposure.drawdown,
      },
    );
  }

  for (const exposure of snapshot.exchangeExposures) {
    const amount =
      Math.abs(exposure.grossExposure) +
      Math.abs(exposure.unrealizedPnl) +
      Math.abs(exposure.realizedPnl);

    addRisk(
      getMap(PortfolioRiskBudgetType.EXCHANGE),
      exposure.exchangeId,
      amount,
      {
        source: "exchange-exposures",
        healthScore: exposure.healthScore,
      },
    );

    if (exposure.accountId !== undefined) {
      addRisk(
        getMap(PortfolioRiskBudgetType.ACCOUNT),
        exposure.accountId,
        amount,
        {
          source: "exchange-exposures",
        },
      );
    }
  }

  return result;
}

function assetWeightsFromSnapshot(
  snapshot: PortfolioSnapshot,
  assets: readonly string[],
  tolerance: number,
): readonly number[] {
  const values = new Map<string, number>();

  for (const balance of snapshot.balances) {
    values.set(
      balance.asset,
      (values.get(balance.asset) ?? 0) +
        Math.abs(balance.marketValue),
    );
  }

  for (const position of snapshot.positions) {
    values.set(
      position.baseAsset,
      (values.get(position.baseAsset) ?? 0) +
        Math.abs(position.marketValue),
    );
  }

  const denominator =
    Math.abs(snapshot.totalEquity) > tolerance
      ? Math.abs(snapshot.totalEquity)
      : [...values.values()].reduce(
          (sum, value) => sum + value,
          0,
        );

  return Object.freeze(
    assets.map((asset) =>
      safeRatio(values.get(asset) ?? 0, denominator, tolerance),
    ),
  );
}

function applyCovarianceRisk(
  measures: Map<PortfolioRiskBudgetType, RiskMeasureMap>,
  snapshot: PortfolioSnapshot,
  covarianceMatrix: PortfolioCovarianceMatrix,
  options: ResolvedRiskBudgetAllocatorOptions,
): number | undefined {
  validateCovarianceMatrix(covarianceMatrix);

  if (covarianceMatrix.assets.length === 0) {
    return undefined;
  }

  const weights = assetWeightsFromSnapshot(
    snapshot,
    covarianceMatrix.assets,
    options.tolerance,
  );
  const covarianceTimesWeight = covarianceMatrix.values.map(
    (row) =>
      row.reduce(
        (sum, covariance, index) =>
          sum + covariance * (weights[index] ?? 0),
        0,
      ),
  );

  const variance = weights.reduce(
    (sum, weight, index) =>
      sum + weight * (covarianceTimesWeight[index] ?? 0),
    0,
  );

  if (!Number.isFinite(variance) || variance < -options.tolerance) {
    return undefined;
  }

  const boundedVariance = Math.max(0, variance);
  const portfolioVolatility =
    Math.sqrt(boundedVariance * options.annualizationFactor);
  const portfolioRiskAmount =
    portfolioVolatility * Math.abs(snapshot.totalEquity);

  const assetMap =
    measures.get(PortfolioRiskBudgetType.ASSET) ??
    new Map<string, MutableMeasuredRisk>();
  measures.set(PortfolioRiskBudgetType.ASSET, assetMap);

  covarianceMatrix.assets.forEach((asset, index) => {
    const weight = weights[index] ?? 0;
    const covarianceContribution =
      weight * (covarianceTimesWeight[index] ?? 0);
    const percentageContribution =
      boundedVariance <= options.tolerance
        ? 0
        : covarianceContribution / boundedVariance;
    const absoluteContribution =
      Math.max(0, percentageContribution) * portfolioRiskAmount;

    assetMap.set(asset, {
      absoluteRisk: absoluteContribution,
      marginalRisk:
        portfolioVolatility <= options.tolerance
          ? 0
          : (covarianceTimesWeight[index] ?? 0) /
            portfolioVolatility,
      metadata: {
        source: "covariance-matrix",
        weight: round(weight),
        covarianceContribution: round(covarianceContribution),
      },
    });
  });

  const portfolioMap =
    measures.get(PortfolioRiskBudgetType.PORTFOLIO) ??
    new Map<string, MutableMeasuredRisk>();
  measures.set(PortfolioRiskBudgetType.PORTFOLIO, portfolioMap);
  portfolioMap.set(snapshot.portfolioId, {
    absoluteRisk: portfolioRiskAmount,
    marginalRisk: portfolioVolatility,
    metadata: {
      source: "covariance-matrix",
      annualizedVolatility: round(portfolioVolatility),
      variance: round(boundedVariance),
    },
  });

  return portfolioRiskAmount;
}

function selectMeasuredRisk(
  measures: Map<PortfolioRiskBudgetType, RiskMeasureMap>,
  target: PortfolioRiskBudgetTarget,
): MutableMeasuredRisk | undefined {
  return measures.get(target.type)?.get(target.targetId);
}

function measuredPortfolioRisk(
  measures: Map<PortfolioRiskBudgetType, RiskMeasureMap>,
  snapshot: PortfolioSnapshot,
): number {
  const portfolioMap = measures.get(
    PortfolioRiskBudgetType.PORTFOLIO,
  );

  const direct = portfolioMap?.get(snapshot.portfolioId);

  if (direct !== undefined) {
    return direct.absoluteRisk;
  }

  return [...(portfolioMap?.values() ?? [])].reduce(
    (sum, item) => sum + item.absoluteRisk,
    0,
  );
}

function buildContribution(
  target: PortfolioRiskBudgetTarget,
  measurement: MutableMeasuredRisk | undefined,
  totalMeasuredRisk: number,
  options: ResolvedRiskBudgetAllocatorOptions,
): PortfolioRiskContribution {
  const absoluteContribution = measurement?.absoluteRisk ?? 0;
  const percentageContribution = safeRatio(
    absoluteContribution,
    totalMeasuredRisk,
    options.tolerance,
  );
  const exceedsBudget =
    percentageContribution >
      target.maximumRiskWeight + options.tolerance ||
    (target.riskAmount !== undefined &&
      absoluteContribution >
        target.riskAmount + options.tolerance);

  const metadata: PortfolioMetadata = Object.freeze({
    ...(target.metadata ?? {}),
    ...(measurement?.metadata ?? {}),
    targetRiskWeight: target.targetRiskWeight,
    maximumRiskWeight: target.maximumRiskWeight,
    ...(target.riskAmount === undefined
      ? {}
      : { configuredRiskAmount: target.riskAmount }),
    riskWeightDifference: round(
      percentageContribution - target.targetRiskWeight,
    ),
  });

  return Object.freeze({
    targetType: target.type,
    targetId: target.targetId,
    absoluteContribution: round(absoluteContribution),
    percentageContribution: round(percentageContribution),
    marginalContribution:
      measurement?.marginalRisk === undefined
        ? undefined
        : round(measurement.marginalRisk),
    exceedsBudget,
    metadata,
  });
}

function generatedAt(
  clock: RiskBudgetAllocatorClock,
): Timestamp {
  const milliseconds = clock.now();
  assertFiniteNumber(milliseconds, "clock.now()");

  return new Date(milliseconds).toISOString();
}

function buildViolations(
  riskBudget: PortfolioRiskBudget,
  contributions: readonly PortfolioRiskContribution[],
  totalMeasuredRisk: number,
  options: ResolvedRiskBudgetAllocatorOptions,
): readonly string[] {
  const violations: string[] = [];

  if (
    totalMeasuredRisk >
    riskBudget.totalRiskBudget + options.tolerance
  ) {
    violations.push(
      `Total measured risk ${round(totalMeasuredRisk)} exceeds the ` +
        `portfolio risk budget ${round(riskBudget.totalRiskBudget)}.`,
    );
  }

  for (const contribution of contributions) {
    if (!contribution.exceedsBudget) {
      continue;
    }

    const target = riskBudget.targets.find(
      (candidate) =>
        candidate.type === contribution.targetType &&
        candidate.targetId === contribution.targetId,
    );

    if (target === undefined) {
      continue;
    }

    if (
      contribution.percentageContribution >
      target.maximumRiskWeight + options.tolerance
    ) {
      violations.push(
        `${String(contribution.targetType)} target ` +
          `${contribution.targetId} contributes ` +
          `${round(contribution.percentageContribution)} of measured ` +
          `risk, exceeding its maximum risk weight ` +
          `${round(target.maximumRiskWeight)}.`,
      );
    }

    if (
      target.riskAmount !== undefined &&
      contribution.absoluteContribution >
        target.riskAmount + options.tolerance
    ) {
      violations.push(
        `${String(contribution.targetType)} target ` +
          `${contribution.targetId} contributes ` +
          `${round(contribution.absoluteContribution)} risk units, ` +
          `exceeding its configured amount ${round(target.riskAmount)}.`,
      );
    }
  }

  return Object.freeze(violations);
}

export function evaluatePortfolioRiskBudget(
  snapshot: PortfolioSnapshot,
  riskBudget: PortfolioRiskBudget,
  covarianceMatrix?: PortfolioCovarianceMatrix,
  options?: RiskBudgetAllocatorOptions,
  clock: RiskBudgetAllocatorClock = SYSTEM_CLOCK,
): PortfolioRiskBudgetResult {
  if (typeof clock?.now !== "function") {
    throw new TypeError("clock must provide a now() function.");
  }

  if (snapshot.portfolioId !== riskBudget.portfolioId) {
    throw new Error(
      "snapshot.portfolioId must match riskBudget.portfolioId.",
    );
  }

  const resolved = resolveOptions(options);
  validateRiskBudget(riskBudget, resolved);

  const measures = buildExposureRiskMeasures(snapshot);

  let covarianceMeasuredRisk: number | undefined;

  if (
    resolved.useCovarianceRisk &&
    covarianceMatrix !== undefined
  ) {
    covarianceMeasuredRisk = applyCovarianceRisk(
      measures,
      snapshot,
      covarianceMatrix,
      resolved,
    );
  }

  const totalMeasuredRisk =
    covarianceMeasuredRisk ??
    measuredPortfolioRisk(measures, snapshot);

  const contributions = riskBudget.targets
    .map((target) =>
      buildContribution(
        target,
        selectMeasuredRisk(measures, target),
        totalMeasuredRisk,
        resolved,
      ),
    )
    .filter(
      (contribution) =>
        resolved.includeZeroContributions ||
        contribution.absoluteContribution > resolved.tolerance,
    )
    .sort((left, right) => {
      const riskDifference =
        right.absoluteContribution - left.absoluteContribution;

      if (Math.abs(riskDifference) > resolved.tolerance) {
        return riskDifference;
      }

      const typeDifference = String(left.targetType).localeCompare(
        String(right.targetType),
      );

      if (typeDifference !== 0) {
        return typeDifference;
      }

      return left.targetId.localeCompare(right.targetId);
    });

  const frozenContributions = Object.freeze(contributions);
  const violations = buildViolations(
    riskBudget,
    frozenContributions,
    totalMeasuredRisk,
    resolved,
  );
  const budgetUtilization = safeRatio(
    totalMeasuredRisk,
    riskBudget.totalRiskBudget,
    resolved.tolerance,
  );
  const timestamp = generatedAt(clock);

  const normalizedBudget: PortfolioRiskBudget = Object.freeze({
    portfolioId: riskBudget.portfolioId,
    totalRiskBudget: riskBudget.totalRiskBudget,
    volatilityBudget: riskBudget.volatilityBudget,
    drawdownBudget: riskBudget.drawdownBudget,
    valueAtRiskBudget: riskBudget.valueAtRiskBudget,
    conditionalValueAtRiskBudget:
      riskBudget.conditionalValueAtRiskBudget,
    targets: Object.freeze(
      riskBudget.targets.map((target) =>
        Object.freeze({
          ...target,
          metadata: cloneMetadata(target.metadata),
        }),
      ),
    ),
    generatedAt: riskBudget.generatedAt,
    metadata: Object.freeze({
      ...(riskBudget.metadata ?? {}),
      ...(resolved.metadata ?? {}),
      measuredUsing:
        covarianceMeasuredRisk === undefined
          ? "exposure-proxy"
          : "covariance-matrix",
    }),
  });

  return Object.freeze({
    budget: normalizedBudget,
    contributions: frozenContributions,
    totalMeasuredRisk: round(totalMeasuredRisk),
    budgetUtilization: round(budgetUtilization),
    withinBudget: violations.length === 0,
    violations,
    generatedAt: timestamp,
  });
}

export class DeterministicRiskBudgetAllocator
  implements PortfolioRiskBudgetEngine
{
  private readonly options: RiskBudgetAllocatorOptions;
  private readonly clock: RiskBudgetAllocatorClock;

  public constructor(
    options: RiskBudgetAllocatorOptions = Object.freeze({}),
    clock: RiskBudgetAllocatorClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = Object.freeze({
      ...options,
      metadata: cloneMetadata(options.metadata),
    });
    this.clock = clock;
  }

  public evaluate(
    snapshot: PortfolioSnapshot,
    riskBudget: PortfolioRiskBudget,
    covarianceMatrix?: PortfolioCovarianceMatrix,
  ): PortfolioRiskBudgetResult {
    return evaluatePortfolioRiskBudget(
      snapshot,
      riskBudget,
      covarianceMatrix,
      this.options,
      this.clock,
    );
  }
}

/**
 * Conventional subsystem alias.
 */
export class AIPortfolioRiskBudgetAllocator extends DeterministicRiskBudgetAllocator {}