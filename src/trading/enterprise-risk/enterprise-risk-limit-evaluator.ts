/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-limit-evaluator.ts
 *
 * Purpose:
 * Evaluates applicable enterprise-risk limits against a validated risk
 * evaluation request.
 *
 * Design goals:
 * - Deterministic
 * - Immutable
 * - Strongly typed
 * - Exchange-neutral
 * - Strategy-neutral
 * - Spot and derivatives compatible
 * - Multi-exchange compatible
 * - Multi-chain compatible
 * - Suitable for pre-trade and continuous portfolio evaluation
 */

import {
  EnterpriseRiskCircuitBreakerScope,
  EnterpriseRiskEvaluationRequest,
  EnterpriseRiskIdentifier,
  EnterpriseRiskIdentifierGenerator,
  EnterpriseRiskLimit,
  EnterpriseRiskLimitType,
  EnterpriseRiskMetric,
  EnterpriseRiskRestriction,
  EnterpriseRiskSeverity,
  EnterpriseRiskTimestamp,
  EnterpriseRiskViolation,
  EnterpriseRiskViolationCode,
  EnterpriseRiskWarning,
} from "./enterprise-risk-contracts";
import {
  EnterpriseRiskValidationError,
  validateEnterpriseRiskEvaluationRequest,
} from "./enterprise-risk-validator";

export interface EnterpriseRiskLimitEvaluationContext {
  readonly request: EnterpriseRiskEvaluationRequest;
  readonly evaluatedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskLimitEvaluationResult {
  readonly violations: readonly EnterpriseRiskViolation[];
  readonly warnings: readonly EnterpriseRiskWarning[];
  readonly restrictions: readonly EnterpriseRiskRestriction[];
  readonly metrics: readonly EnterpriseRiskMetric[];
  readonly highestSeverity: EnterpriseRiskSeverity;
  readonly evaluatedLimitCount: number;
  readonly skippedLimitCount: number;
}

export interface EnterpriseRiskLimitEvaluator {
  evaluate(
    context: EnterpriseRiskLimitEvaluationContext,
  ): EnterpriseRiskLimitEvaluationResult;
}

export interface EnterpriseRiskLimitEvaluatorOptions {
  /**
   * Optional deterministic identifier generator.
   *
   * When omitted, identifiers are derived from the request, limit, and
   * evaluation timestamp.
   */
  readonly identifierGenerator?: EnterpriseRiskIdentifierGenerator;

  /**
   * Numeric comparison tolerance.
   */
  readonly numericTolerance?: number;

  /**
   * Whether warning-threshold breaches should produce restrictions.
   */
  readonly restrictOnWarning?: boolean;
}

interface NormalizedEnterpriseRiskLimitEvaluatorOptions {
  readonly identifierGenerator?: EnterpriseRiskIdentifierGenerator;
  readonly numericTolerance: number;
  readonly restrictOnWarning: boolean;
}

interface EnterpriseRiskLimitMeasurement {
  readonly supported: boolean;
  readonly actualValue?: number;
  readonly unit: EnterpriseRiskMetric["unit"];
  readonly currency?: string;
  readonly violationCode: EnterpriseRiskViolationCode;
  readonly messageLabel: string;
  readonly maximumLimit: boolean;
}

interface MutableEvaluationState {
  readonly violations: EnterpriseRiskViolation[];
  readonly warnings: EnterpriseRiskWarning[];
  readonly restrictions: EnterpriseRiskRestriction[];
  readonly metrics: EnterpriseRiskMetric[];
  evaluatedLimitCount: number;
  skippedLimitCount: number;
}

const DEFAULT_NUMERIC_TOLERANCE = 1e-8;

const SEVERITY_ORDER: Readonly<
  Record<EnterpriseRiskSeverity, number>
> = Object.freeze({
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
});

function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative integer.",
    );
  }
}

function assertPositiveFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a finite number greater than zero.",
    );
  }
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a boolean.",
    );
  }
}

function isIdentifierGenerator(
  value: unknown,
): value is EnterpriseRiskIdentifierGenerator {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  return (
    "generate" in value &&
    typeof value.generate === "function"
  );
}

function normalizeOptions(
  options?: EnterpriseRiskLimitEvaluatorOptions,
): NormalizedEnterpriseRiskLimitEvaluatorOptions {
  if (
    options !== undefined &&
    (typeof options !== "object" ||
      options === null ||
      Array.isArray(options))
  ) {
    throw new EnterpriseRiskValidationError(
      "options",
      "must be a non-null object.",
    );
  }

  const numericTolerance =
    options?.numericTolerance ?? DEFAULT_NUMERIC_TOLERANCE;

  const restrictOnWarning =
    options?.restrictOnWarning ?? false;

  const identifierGenerator =
    options?.identifierGenerator;

  assertPositiveFiniteNumber(
    numericTolerance,
    "options.numericTolerance",
  );

  assertBoolean(
    restrictOnWarning,
    "options.restrictOnWarning",
  );

  if (
    identifierGenerator !== undefined &&
    !isIdentifierGenerator(identifierGenerator)
  ) {
    throw new EnterpriseRiskValidationError(
      "options.identifierGenerator.generate",
      "must be a function.",
    );
  }

  return Object.freeze({
    identifierGenerator,
    numericTolerance,
    restrictOnWarning,
  });
}

function createMutableState(): MutableEvaluationState {
  return {
    violations: [],
    warnings: [],
    restrictions: [],
    metrics: [],
    evaluatedLimitCount: 0,
    skippedLimitCount: 0,
  };
}

function sanitizeIdentifierPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createIdentifier(
  prefix: string,
  requestId: string,
  limitId: string,
  evaluatedAt: number,
  identifierGenerator?: EnterpriseRiskIdentifierGenerator,
): EnterpriseRiskIdentifier {
  if (identifierGenerator !== undefined) {
    return identifierGenerator.generate(prefix);
  }

  const normalizedRequestId =
    sanitizeIdentifierPart(requestId) || "request";

  const normalizedLimitId =
    sanitizeIdentifierPart(limitId) || "limit";

  return [
    prefix,
    normalizedRequestId,
    normalizedLimitId,
    evaluatedAt.toString(10),
  ].join(":");
}

function isApproximatelyGreaterThan(
  actualValue: number,
  threshold: number,
  tolerance: number,
): boolean {
  const comparisonTolerance = Math.max(
    tolerance,
    Math.abs(actualValue) * tolerance,
    Math.abs(threshold) * tolerance,
  );

  return actualValue - threshold > comparisonTolerance;
}

function isApproximatelyLessThan(
  actualValue: number,
  threshold: number,
  tolerance: number,
): boolean {
  const comparisonTolerance = Math.max(
    tolerance,
    Math.abs(actualValue) * tolerance,
    Math.abs(threshold) * tolerance,
  );

  return threshold - actualValue > comparisonTolerance;
}

function isLimitBreached(
  measurement: EnterpriseRiskLimitMeasurement,
  threshold: number,
  tolerance: number,
): boolean {
  if (measurement.actualValue === undefined) {
    return false;
  }

  return measurement.maximumLimit
    ? isApproximatelyGreaterThan(
        measurement.actualValue,
        threshold,
        tolerance,
      )
    : isApproximatelyLessThan(
        measurement.actualValue,
        threshold,
        tolerance,
      );
}

function findExposureValue(
  entries: readonly {
    readonly key: string;
    readonly value: number;
  }[],
  key: string | undefined,
): number | undefined {
  if (key === undefined) {
    return undefined;
  }

  const normalizedKey = key.trim().toUpperCase();

  const matchingEntry = entries.find(
    (entry) =>
      entry.key.trim().toUpperCase() === normalizedKey,
  );

  return matchingEntry?.value;
}

function calculateMaximumPositionNotional(
  request: EnterpriseRiskEvaluationRequest,
): number {
  return request.portfolioSnapshot.positions.reduce(
    (maximum, position) =>
      Math.max(maximum, Math.abs(position.notionalValue)),
    0,
  );
}

function calculateMaximumLeverage(
  request: EnterpriseRiskEvaluationRequest,
): number {
  const portfolioMaximum =
    request.portfolioSnapshot.positions.reduce(
      (maximum, position) =>
        Math.max(maximum, position.leverage),
      0,
    );

  return Math.max(
    portfolioMaximum,
    request.orderIntent?.leverage ?? 0,
  );
}

function calculateMaximumMarginUtilization(
  request: EnterpriseRiskEvaluationRequest,
): number {
  return request.portfolioSnapshot.accounts.reduce(
    (maximum, account) =>
      Math.max(maximum, account.marginUtilization),
    0,
  );
}

function calculateMinimumLiquidationDistanceBps(
  request: EnterpriseRiskEvaluationRequest,
): number | undefined {
  const distances = request.portfolioSnapshot.positions
    .filter(
      (position) =>
        position.side !== "FLAT" &&
        position.liquidationPrice !== undefined &&
        position.markPrice > 0,
    )
    .map((position) => {
      const liquidationPrice = position.liquidationPrice;

      if (liquidationPrice === undefined) {
        return Number.POSITIVE_INFINITY;
      }

      return (
        (Math.abs(
          position.markPrice - liquidationPrice,
        ) /
          position.markPrice) *
        10_000
      );
    })
    .filter((distance) => Number.isFinite(distance));

  if (distances.length === 0) {
    return undefined;
  }

  return Math.min(...distances);
}

function resolveTradesPerPeriod(
  request: EnterpriseRiskEvaluationRequest,
  limit: EnterpriseRiskLimit,
): number | undefined {
  const performance = request.performanceSnapshot;

  if (performance === undefined) {
    return undefined;
  }

  const timeWindowMs = limit.timeWindowMs;

  if (timeWindowMs === undefined) {
    return performance.tradesToday;
  }

  const oneDayMs = 24 * 60 * 60 * 1_000;
  const sevenDaysMs = 7 * oneDayMs;

  if (timeWindowMs <= oneDayMs) {
    return performance.tradesToday;
  }

  if (timeWindowMs <= sevenDaysMs) {
    return performance.tradesThisWeek;
  }

  return performance.tradesThisMonth;
}

function resolveScopedExposure(
  request: EnterpriseRiskEvaluationRequest,
  limit: EnterpriseRiskLimit,
): number | undefined {
  const exposure = request.exposureSnapshot;

  if (exposure === undefined) {
    return undefined;
  }

  switch (limit.type) {
    case "MAX_ASSET_EXPOSURE":
      return findExposureValue(
        exposure.assetExposures,
        limit.scopeId ?? request.market?.baseAsset,
      );

    case "MAX_EXCHANGE_EXPOSURE":
      return findExposureValue(
        exposure.exchangeExposures,
        limit.scopeId ?? request.market?.exchangeId,
      );

    case "MAX_CHAIN_EXPOSURE":
      return findExposureValue(
        exposure.chainExposures,
        limit.scopeId ?? request.market?.chainId,
      );

    case "MAX_STRATEGY_EXPOSURE":
      return findExposureValue(
        exposure.strategyExposures,
        limit.scopeId ?? request.account.strategyId,
      );

    case "MAX_WALLET_EXPOSURE":
      return findExposureValue(
        exposure.walletExposures,
        limit.scopeId ?? request.account.walletId,
      );

    default:
      return undefined;
  }
}

function createUnsupportedMeasurement(
  violationCode: EnterpriseRiskViolationCode,
  messageLabel: string,
  maximumLimit: boolean,
  unit: EnterpriseRiskMetric["unit"] = "AMOUNT",
): EnterpriseRiskLimitMeasurement {
  return Object.freeze({
    supported: false,
    unit,
    violationCode,
    messageLabel,
    maximumLimit,
  });
}

function resolveMeasurement(
  request: EnterpriseRiskEvaluationRequest,
  limit: EnterpriseRiskLimit,
): EnterpriseRiskLimitMeasurement {
  switch (limit.type) {
    case "MAX_ORDER_NOTIONAL":
      return Object.freeze({
        supported: request.orderIntent !== undefined,
        actualValue: request.orderIntent?.estimatedNotional,
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "ORDER_NOTIONAL_EXCEEDED",
        messageLabel: "Order notional",
        maximumLimit: true,
      });

    case "MAX_POSITION_NOTIONAL":
      return Object.freeze({
        supported: true,
        actualValue: calculateMaximumPositionNotional(
          request,
        ),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "POSITION_NOTIONAL_EXCEEDED",
        messageLabel: "Maximum position notional",
        maximumLimit: true,
      });

    case "MAX_PORTFOLIO_GROSS_EXPOSURE":
      return Object.freeze({
        supported: true,
        actualValue:
          request.exposureSnapshot?.grossExposure ??
          request.portfolioSnapshot.grossExposure,
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode:
          "PORTFOLIO_GROSS_EXPOSURE_EXCEEDED",
        messageLabel: "Portfolio gross exposure",
        maximumLimit: true,
      });

    case "MAX_PORTFOLIO_NET_EXPOSURE":
      return Object.freeze({
        supported: true,
        actualValue: Math.abs(
          request.exposureSnapshot?.netExposure ??
            request.portfolioSnapshot.netExposure,
        ),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode:
          "PORTFOLIO_NET_EXPOSURE_EXCEEDED",
        messageLabel: "Portfolio absolute net exposure",
        maximumLimit: true,
      });

    case "MAX_ASSET_EXPOSURE":
      return Object.freeze({
        supported:
          resolveScopedExposure(request, limit) !== undefined,
        actualValue: resolveScopedExposure(request, limit),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "ASSET_EXPOSURE_EXCEEDED",
        messageLabel: "Asset exposure",
        maximumLimit: true,
      });

    case "MAX_EXCHANGE_EXPOSURE":
      return Object.freeze({
        supported:
          resolveScopedExposure(request, limit) !== undefined,
        actualValue: resolveScopedExposure(request, limit),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "EXCHANGE_EXPOSURE_EXCEEDED",
        messageLabel: "Exchange exposure",
        maximumLimit: true,
      });

    case "MAX_CHAIN_EXPOSURE":
      return Object.freeze({
        supported:
          resolveScopedExposure(request, limit) !== undefined,
        actualValue: resolveScopedExposure(request, limit),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "CHAIN_EXPOSURE_EXCEEDED",
        messageLabel: "Chain exposure",
        maximumLimit: true,
      });

    case "MAX_STRATEGY_EXPOSURE":
      return Object.freeze({
        supported:
          resolveScopedExposure(request, limit) !== undefined,
        actualValue: resolveScopedExposure(request, limit),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "STRATEGY_EXPOSURE_EXCEEDED",
        messageLabel: "Strategy exposure",
        maximumLimit: true,
      });

    case "MAX_WALLET_EXPOSURE":
      return Object.freeze({
        supported:
          resolveScopedExposure(request, limit) !== undefined,
        actualValue: resolveScopedExposure(request, limit),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "WALLET_EXPOSURE_EXCEEDED",
        messageLabel: "Wallet exposure",
        maximumLimit: true,
      });

    case "MAX_OPEN_POSITIONS":
      return Object.freeze({
        supported: true,
        actualValue:
          request.portfolioSnapshot.openPositionCount,
        unit: "COUNT",
        violationCode:
          "OPEN_POSITION_LIMIT_EXCEEDED",
        messageLabel: "Open position count",
        maximumLimit: true,
      });

    case "MAX_LEVERAGE":
      return Object.freeze({
        supported: true,
        actualValue: calculateMaximumLeverage(request),
        unit: "RATIO",
        violationCode: "LEVERAGE_LIMIT_EXCEEDED",
        messageLabel: "Maximum leverage",
        maximumLimit: true,
      });

    case "MAX_MARGIN_UTILIZATION":
      return Object.freeze({
        supported:
          request.portfolioSnapshot.accounts.length > 0,
        actualValue:
          request.portfolioSnapshot.accounts.length > 0
            ? calculateMaximumMarginUtilization(request)
            : undefined,
        unit: "PERCENTAGE",
        violationCode:
          "MARGIN_UTILIZATION_EXCEEDED",
        messageLabel: "Maximum margin utilization",
        maximumLimit: true,
      });

    case "MAX_DAILY_LOSS":
      return Object.freeze({
        supported: true,
        actualValue: Math.max(
          0,
          -(
            request.performanceSnapshot?.dailyPnl ??
            request.portfolioSnapshot.dailyPnl
          ),
        ),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "DAILY_LOSS_LIMIT_EXCEEDED",
        messageLabel: "Daily loss",
        maximumLimit: true,
      });

    case "MAX_WEEKLY_LOSS":
      return Object.freeze({
        supported: true,
        actualValue: Math.max(
          0,
          -(
            request.performanceSnapshot?.weeklyPnl ??
            request.portfolioSnapshot.weeklyPnl
          ),
        ),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "WEEKLY_LOSS_LIMIT_EXCEEDED",
        messageLabel: "Weekly loss",
        maximumLimit: true,
      });

    case "MAX_MONTHLY_LOSS":
      return Object.freeze({
        supported: true,
        actualValue: Math.max(
          0,
          -(
            request.performanceSnapshot?.monthlyPnl ??
            request.portfolioSnapshot.monthlyPnl
          ),
        ),
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode:
          "MONTHLY_LOSS_LIMIT_EXCEEDED",
        messageLabel: "Monthly loss",
        maximumLimit: true,
      });

    case "MAX_DRAWDOWN":
      return Object.freeze({
        supported: true,
        actualValue:
          request.performanceSnapshot?.currentDrawdown ??
          request.portfolioSnapshot.currentDrawdown,
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "DRAWDOWN_LIMIT_EXCEEDED",
        messageLabel: "Current drawdown",
        maximumLimit: true,
      });

    case "MAX_CONSECUTIVE_LOSSES":
      return Object.freeze({
        supported: true,
        actualValue:
          request.performanceSnapshot?.consecutiveLosses ??
          request.portfolioSnapshot.consecutiveLosses,
        unit: "COUNT",
        violationCode:
          "CONSECUTIVE_LOSS_LIMIT_EXCEEDED",
        messageLabel: "Consecutive losses",
        maximumLimit: true,
      });

    case "MAX_TRADES_PER_PERIOD":
      return Object.freeze({
        supported:
          resolveTradesPerPeriod(request, limit) !==
          undefined,
        actualValue: resolveTradesPerPeriod(
          request,
          limit,
        ),
        unit: "COUNT",
        violationCode:
          "TRADE_FREQUENCY_LIMIT_EXCEEDED",
        messageLabel: "Trades in configured period",
        maximumLimit: true,
      });

    case "MAX_SLIPPAGE_BPS":
      return Object.freeze({
        supported:
          request.orderIntent?.expectedSlippageBps !==
            undefined ||
          request.liquiditySnapshot
            ?.expectedSlippageBps !== undefined,
        actualValue:
          request.orderIntent?.expectedSlippageBps ??
          request.liquiditySnapshot
            ?.expectedSlippageBps,
        unit: "BASIS_POINTS",
        violationCode: "SLIPPAGE_LIMIT_EXCEEDED",
        messageLabel: "Expected slippage",
        maximumLimit: true,
      });

    case "MIN_LIQUIDITY": {
      const liquidity =
        request.orderIntent?.side === "SELL"
          ? request.liquiditySnapshot?.bidLiquidity ??
            request.marketSnapshot
              ?.availableBidLiquidity
          : request.liquiditySnapshot?.askLiquidity ??
            request.marketSnapshot
              ?.availableAskLiquidity;

      return Object.freeze({
        supported: liquidity !== undefined,
        actualValue: liquidity,
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "INSUFFICIENT_LIQUIDITY",
        messageLabel: "Available execution liquidity",
        maximumLimit: false,
      });
    }

    case "MIN_RISK_REWARD_RATIO":
      return createUnsupportedMeasurement(
        "RISK_REWARD_RATIO_TOO_LOW",
        "Risk-reward ratio",
        false,
        "RATIO",
      );

    case "MAX_VALUE_AT_RISK":
      return Object.freeze({
        supported:
          request.valueAtRiskSnapshot !== undefined,
        actualValue:
          request.valueAtRiskSnapshot?.valueAtRisk,
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.valueAtRiskSnapshot
            ?.reportingCurrency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode: "VALUE_AT_RISK_EXCEEDED",
        messageLabel: "Value at risk",
        maximumLimit: true,
      });

    case "MAX_CONDITIONAL_VALUE_AT_RISK":
      return Object.freeze({
        supported:
          request.valueAtRiskSnapshot !== undefined,
        actualValue:
          request.valueAtRiskSnapshot
            ?.conditionalValueAtRisk,
        unit: "AMOUNT",
        currency:
          limit.currency ??
          request.valueAtRiskSnapshot
            ?.reportingCurrency ??
          request.portfolioSnapshot.reportingCurrency,
        violationCode:
          "CONDITIONAL_VALUE_AT_RISK_EXCEEDED",
        messageLabel: "Conditional value at risk",
        maximumLimit: true,
      });

    case "MIN_LIQUIDATION_DISTANCE_BPS": {
      const distance =
        calculateMinimumLiquidationDistanceBps(request);

      return Object.freeze({
        supported: distance !== undefined,
        actualValue: distance,
        unit: "BASIS_POINTS",
        violationCode:
          "LIQUIDATION_DISTANCE_TOO_LOW",
        messageLabel:
          "Minimum liquidation distance",
        maximumLimit: false,
      });
    }

    case "MAX_CORRELATION":
      return Object.freeze({
        supported:
          request.correlationSnapshot !== undefined,
        actualValue:
          request.correlationSnapshot
            ?.maximumObservedCorrelation,
        unit: "RATIO",
        violationCode:
          "CORRELATION_LIMIT_EXCEEDED",
        messageLabel:
          "Maximum observed correlation",
        maximumLimit: true,
      });

    case "MAX_CONCENTRATION": {
      const totalEquity =
        request.portfolioSnapshot.totalEquity;

      const maximumAssetExposure =
        request.exposureSnapshot?.assetExposures.reduce(
          (maximum, exposure) =>
            Math.max(
              maximum,
              exposure.percentageOfEquity,
            ),
          0,
        );

      const fallbackMaximum =
        totalEquity > 0
          ? request.portfolioSnapshot.positions.reduce(
              (maximum, position) =>
                Math.max(
                  maximum,
                  Math.abs(position.notionalValue) /
                    totalEquity,
                ),
              0,
            )
          : undefined;

      const actualValue =
        maximumAssetExposure ?? fallbackMaximum;

      return Object.freeze({
        supported: actualValue !== undefined,
        actualValue,
        unit: "RATIO",
        violationCode:
          "CONCENTRATION_LIMIT_EXCEEDED",
        messageLabel:
          "Maximum portfolio concentration",
        maximumLimit: true,
      });
    }
  }
}

function isScopeApplicable(
  request: EnterpriseRiskEvaluationRequest,
  limit: EnterpriseRiskLimit,
): boolean {
  if (!limit.enabled) {
    return false;
  }

  if (limit.scope === "GLOBAL") {
    return true;
  }

  if (limit.scope === "PORTFOLIO") {
    return (
      limit.scopeId === undefined ||
      limit.scopeId === request.account.portfolioId
    );
  }

  if (limit.scopeId === undefined) {
    return false;
  }

  switch (limit.scope) {
    case "ACCOUNT":
      return (
        limit.scopeId === request.account.accountId
      );

    case "EXCHANGE":
      return (
        limit.scopeId === request.market?.exchangeId ||
        request.portfolioSnapshot.positions.some(
          (position) =>
            position.exchangeId === limit.scopeId,
        )
      );

    case "CHAIN":
      return (
        limit.scopeId === request.market?.chainId ||
        request.portfolioSnapshot.positions.some(
          (position) =>
            position.chainId === limit.scopeId,
        )
      );

    case "ASSET":
      return (
        limit.scopeId === request.market?.baseAsset ||
        request.portfolioSnapshot.positions.some(
          (position) =>
            position.baseAsset === limit.scopeId,
        )
      );

    case "SYMBOL":
      return (
        limit.scopeId === request.market?.symbol ||
        request.portfolioSnapshot.positions.some(
          (position) =>
            position.symbol === limit.scopeId,
        )
      );

    case "STRATEGY":
      return (
        limit.scopeId ===
          request.account.strategyId ||
        request.portfolioSnapshot.positions.some(
          (position) =>
            position.strategyId === limit.scopeId,
        )
      );

    case "BOT":
      return (
        limit.scopeId === request.account.botId ||
        request.portfolioSnapshot.positions.some(
          (position) =>
            position.botId === limit.scopeId,
        )
      );
  }
}

function collectApplicableLimits(
  request: EnterpriseRiskEvaluationRequest,
): readonly EnterpriseRiskLimit[] {
  const uniqueLimits = new Map<
    EnterpriseRiskIdentifier,
    EnterpriseRiskLimit
  >();

  const sortedPolicies = [...request.policies].sort(
    (left, right) => left.id.localeCompare(right.id),
  );

  for (const policy of sortedPolicies) {
    if (!policy.enabled) {
      continue;
    }

    if (
      policy.portfolioId !== undefined &&
      policy.portfolioId !==
        request.account.portfolioId
    ) {
      continue;
    }

    if (
      policy.accountId !== undefined &&
      policy.accountId !== request.account.accountId
    ) {
      continue;
    }

    if (
      policy.strategyId !== undefined &&
      policy.strategyId !==
        request.account.strategyId
    ) {
      continue;
    }

    if (
      policy.botId !== undefined &&
      policy.botId !== request.account.botId
    ) {
      continue;
    }

    for (const limit of policy.limits) {
      if (
        isScopeApplicable(request, limit) &&
        !uniqueLimits.has(limit.id)
      ) {
        uniqueLimits.set(limit.id, limit);
      }
    }
  }

  return Object.freeze(
    [...uniqueLimits.values()].sort(
      (left, right) =>
        left.id.localeCompare(right.id),
    ),
  );
}

function createMetric(
  limit: EnterpriseRiskLimit,
  measurement: EnterpriseRiskLimitMeasurement,
): EnterpriseRiskMetric | undefined {
  if (measurement.actualValue === undefined) {
    return undefined;
  }

  return Object.freeze({
    name:
      `enterprise_risk.` +
      limit.type.toLowerCase(),
    value: measurement.actualValue,
    unit: measurement.unit,
    currency: measurement.currency,
    metadata: Object.freeze({
      limitId: limit.id,
      scope: limit.scope,
      scopeId: limit.scopeId ?? null,
      threshold: limit.threshold,
    }),
  });
}

function createViolation(
  context: EnterpriseRiskLimitEvaluationContext,
  limit: EnterpriseRiskLimit,
  measurement: EnterpriseRiskLimitMeasurement,
  options: NormalizedEnterpriseRiskLimitEvaluatorOptions,
): EnterpriseRiskViolation {
  const actualValue = measurement.actualValue;

  return Object.freeze({
    id: createIdentifier(
      "risk-violation",
      context.request.requestId,
      limit.id,
      context.evaluatedAt,
      options.identifierGenerator,
    ),
    code: measurement.violationCode,
    severity: limit.severity,
    message:
      `${measurement.messageLabel} breached limit ` +
      `${limit.id}. Actual value: ${actualValue}; ` +
      `threshold: ${limit.threshold}.`,
    limitId: limit.id,
    actualValue,
    thresholdValue: limit.threshold,
    currency: measurement.currency,
    scope: limit.scope,
    scopeId: limit.scopeId,
    occurredAt: context.evaluatedAt,
    metadata: Object.freeze({
      limitType: limit.type,
      maximumLimit: measurement.maximumLimit,
    }),
  });
}

function createWarning(
  context: EnterpriseRiskLimitEvaluationContext,
  limit: EnterpriseRiskLimit,
  measurement: EnterpriseRiskLimitMeasurement,
  options: NormalizedEnterpriseRiskLimitEvaluatorOptions,
): EnterpriseRiskWarning {
  const warningThreshold = limit.warningThreshold;

  if (warningThreshold === undefined) {
    throw new EnterpriseRiskValidationError(
      "limit.warningThreshold",
      "is required to create a warning.",
    );
  }

  return Object.freeze({
    id: createIdentifier(
      "risk-warning",
      context.request.requestId,
      limit.id,
      context.evaluatedAt,
      options.identifierGenerator,
    ),
    code: measurement.violationCode,
    severity: limit.severity,
    message:
      `${measurement.messageLabel} reached warning level for ` +
      `${limit.id}. Actual value: ` +
      `${measurement.actualValue}; warning threshold: ` +
      `${warningThreshold}.`,
    actualValue: measurement.actualValue,
    thresholdValue: warningThreshold,
    occurredAt: context.evaluatedAt,
    metadata: Object.freeze({
      limitId: limit.id,
      limitType: limit.type,
      scope: limit.scope,
      scopeId: limit.scopeId ?? null,
    }),
  });
}

function createRestriction(
  request: EnterpriseRiskEvaluationRequest,
  limit: EnterpriseRiskLimit,
): EnterpriseRiskRestriction | undefined {
  switch (limit.type) {
    case "MAX_ORDER_NOTIONAL":
      return Object.freeze({
        type: "REDUCE_NOTIONAL",
        description:
          `Order notional must not exceed ` +
          `${limit.threshold}.`,
        maximumNotional: limit.threshold,
        metadata: Object.freeze({
          limitId: limit.id,
        }),
      });

    case "MAX_POSITION_NOTIONAL":
    case "MAX_ASSET_EXPOSURE":
    case "MAX_EXCHANGE_EXPOSURE":
    case "MAX_CHAIN_EXPOSURE":
    case "MAX_STRATEGY_EXPOSURE":
    case "MAX_WALLET_EXPOSURE":
    case "MAX_PORTFOLIO_GROSS_EXPOSURE":
    case "MAX_PORTFOLIO_NET_EXPOSURE":
    case "MAX_CONCENTRATION":
      return Object.freeze({
        type: "REDUCE_NOTIONAL",
        description:
          "Exposure must be reduced to comply with " +
          `limit ${limit.id}.`,
        maximumNotional: limit.threshold,
        metadata: Object.freeze({
          limitId: limit.id,
          limitType: limit.type,
        }),
      });

    case "MAX_LEVERAGE":
      return Object.freeze({
        type: "REDUCE_LEVERAGE",
        description:
          `Leverage must not exceed ` +
          `${limit.threshold}.`,
        maximumLeverage: limit.threshold,
        metadata: Object.freeze({
          limitId: limit.id,
        }),
      });

    case "MAX_SLIPPAGE_BPS":
    case "MIN_LIQUIDITY":
      return Object.freeze({
        type: "REQUIRE_LIMIT_ORDER",
        description:
          "A limit order is required because the active " +
          "liquidity or slippage risk threshold has " +
          "been reached.",
        metadata: Object.freeze({
          limitId: limit.id,
        }),
      });

    case "MAX_MARGIN_UTILIZATION":
    case "MIN_LIQUIDATION_DISTANCE_BPS":
      return Object.freeze({
        type: "REQUIRE_REDUCE_ONLY",
        description:
          "Only exposure-reducing orders are permitted " +
          "while this margin-risk limit remains active.",
        metadata: Object.freeze({
          limitId: limit.id,
        }),
      });

    case "MAX_DAILY_LOSS":
    case "MAX_WEEKLY_LOSS":
    case "MAX_MONTHLY_LOSS":
    case "MAX_DRAWDOWN":
    case "MAX_CONSECUTIVE_LOSSES":
    case "MAX_TRADES_PER_PERIOD":
    case "MAX_VALUE_AT_RISK":
    case "MAX_CONDITIONAL_VALUE_AT_RISK":
    case "MAX_CORRELATION":
      return Object.freeze({
        type: "REQUIRE_MANUAL_APPROVAL",
        description:
          "Manual approval is required because limit " +
          `${limit.id} has been reached.`,
        metadata: Object.freeze({
          limitId: limit.id,
          portfolioId:
            request.account.portfolioId,
        }),
      });

    case "MIN_RISK_REWARD_RATIO":
      return Object.freeze({
        type: "REQUIRE_STOP_LOSS",
        description:
          "A valid stop-loss is required to establish " +
          "an acceptable risk-reward ratio.",
        metadata: Object.freeze({
          limitId: limit.id,
        }),
      });

    case "MAX_OPEN_POSITIONS":
      return Object.freeze({
        type: "REQUIRE_REDUCE_ONLY",
        description:
          "No additional exposure may be opened until " +
          "the number of open positions is reduced.",
        metadata: Object.freeze({
          limitId: limit.id,
        }),
      });
  }
}

function getHighestSeverity(
  violations: readonly EnterpriseRiskViolation[],
  warnings: readonly EnterpriseRiskWarning[],
): EnterpriseRiskSeverity {
  let highestSeverity: EnterpriseRiskSeverity = "INFO";

  for (const item of [...violations, ...warnings]) {
    if (
      SEVERITY_ORDER[item.severity] >
      SEVERITY_ORDER[highestSeverity]
    ) {
      highestSeverity = item.severity;
    }
  }

  return highestSeverity;
}

function freezeResult(
  state: MutableEvaluationState,
): EnterpriseRiskLimitEvaluationResult {
  const violations = Object.freeze(
    [...state.violations].sort(
      (left, right) =>
        left.id.localeCompare(right.id),
    ),
  );

  const warnings = Object.freeze(
    [...state.warnings].sort(
      (left, right) =>
        left.id.localeCompare(right.id),
    ),
  );

  const restrictions = Object.freeze([
    ...state.restrictions,
  ]);

  const metrics = Object.freeze(
    [...state.metrics].sort(
      (left, right) =>
        left.name.localeCompare(right.name),
    ),
  );

  return Object.freeze({
    violations,
    warnings,
    restrictions,
    metrics,
    highestSeverity: getHighestSeverity(
      violations,
      warnings,
    ),
    evaluatedLimitCount:
      state.evaluatedLimitCount,
    skippedLimitCount:
      state.skippedLimitCount,
  });
}

export class DeterministicEnterpriseRiskLimitEvaluator
  implements EnterpriseRiskLimitEvaluator
{
  private readonly options: NormalizedEnterpriseRiskLimitEvaluatorOptions;

  public constructor(
    options?: EnterpriseRiskLimitEvaluatorOptions,
  ) {
    this.options = normalizeOptions(options);
  }

  public evaluate(
    context: EnterpriseRiskLimitEvaluationContext,
  ): EnterpriseRiskLimitEvaluationResult {
    assertRecord(context, "context");

    assertNonNegativeInteger(
      context.evaluatedAt,
      "context.evaluatedAt",
    );

    validateEnterpriseRiskEvaluationRequest(
      context.request,
    );

    if (
      context.evaluatedAt <
      context.request.requestedAt
    ) {
      throw new EnterpriseRiskValidationError(
        "context.evaluatedAt",
        "must not be earlier than request.requestedAt.",
      );
    }

    const state = createMutableState();

    const limits = collectApplicableLimits(
      context.request,
    );

    for (const limit of limits) {
      const measurement = resolveMeasurement(
        context.request,
        limit,
      );

      if (
        !measurement.supported ||
        measurement.actualValue === undefined
      ) {
        state.skippedLimitCount += 1;
        continue;
      }

      state.evaluatedLimitCount += 1;

      const metric = createMetric(
        limit,
        measurement,
      );

      if (metric !== undefined) {
        state.metrics.push(metric);
      }

      if (
        isLimitBreached(
          measurement,
          limit.threshold,
          this.options.numericTolerance,
        )
      ) {
        state.violations.push(
          createViolation(
            context,
            limit,
            measurement,
            this.options,
          ),
        );

        const restriction = createRestriction(
          context.request,
          limit,
        );

        if (restriction !== undefined) {
          state.restrictions.push(restriction);
        }

        continue;
      }

      if (
        limit.warningThreshold !== undefined &&
        isLimitBreached(
          measurement,
          limit.warningThreshold,
          this.options.numericTolerance,
        )
      ) {
        state.warnings.push(
          createWarning(
            context,
            limit,
            measurement,
            this.options,
          ),
        );

        if (this.options.restrictOnWarning) {
          const restriction = createRestriction(
            context.request,
            limit,
          );

          if (restriction !== undefined) {
            state.restrictions.push(restriction);
          }
        }
      }
    }

    return freezeResult(state);
  }
}

export function evaluateEnterpriseRiskLimits(
  context: EnterpriseRiskLimitEvaluationContext,
  options?: EnterpriseRiskLimitEvaluatorOptions,
): EnterpriseRiskLimitEvaluationResult {
  const evaluator =
    new DeterministicEnterpriseRiskLimitEvaluator(
      options,
    );

  return evaluator.evaluate(context);
}

export function isEnterpriseRiskLimitTypeSupported(
  limitType: EnterpriseRiskLimitType,
): boolean {
  return limitType !== "MIN_RISK_REWARD_RATIO";
}

export function isEnterpriseRiskScopeSupported(
  scope: EnterpriseRiskCircuitBreakerScope,
): boolean {
  switch (scope) {
    case "GLOBAL":
    case "PORTFOLIO":
    case "ACCOUNT":
    case "EXCHANGE":
    case "CHAIN":
    case "ASSET":
    case "SYMBOL":
    case "STRATEGY":
    case "BOT":
      return true;
  }
}