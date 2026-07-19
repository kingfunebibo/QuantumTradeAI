/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-exposure-calculator.ts
 *
 * Purpose:
 * Calculates deterministic portfolio exposure across assets, exchanges,
 * chains, strategies, and wallets.
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
 * - Suitable for real-time and historical risk evaluation
 */

import {
  EnterpriseRiskExposure,
  EnterpriseRiskExposureSnapshot,
  EnterpriseRiskPortfolioSnapshot,
  EnterpriseRiskPositionSnapshot,
  EnterpriseRiskTimestamp,
} from "./enterprise-risk-contracts";
import {
  EnterpriseRiskValidationError,
  validateEnterpriseRiskEvaluationRequest,
} from "./enterprise-risk-validator";

export interface EnterpriseRiskExposureCalculatorOptions {
  /**
   * Identifier used when a position has no exchange association.
   */
  readonly unassignedExchangeKey?: string;

  /**
   * Identifier used when a position has no chain association.
   */
  readonly unassignedChainKey?: string;

  /**
   * Identifier used when a position has no strategy association.
   */
  readonly unassignedStrategyKey?: string;

  /**
   * Identifier used when a position has no wallet association.
   */
  readonly unassignedWalletKey?: string;

  /**
   * Numeric tolerance used when reconciling calculated and supplied
   * portfolio exposure totals.
   */
  readonly numericTolerance?: number;

  /**
   * When enabled, calculated aggregate exposure must reconcile with the
   * exposure totals supplied by the portfolio snapshot.
   */
  readonly enforcePortfolioReconciliation?: boolean;
}

export interface EnterpriseRiskExposureCalculationInput {
  readonly portfolio: EnterpriseRiskPortfolioSnapshot;
  readonly calculatedAt?: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskExposureCalculator {
  calculate(
    input: EnterpriseRiskExposureCalculationInput,
  ): EnterpriseRiskExposureSnapshot;
}

interface NormalizedEnterpriseRiskExposureCalculatorOptions {
  readonly unassignedExchangeKey: string;
  readonly unassignedChainKey: string;
  readonly unassignedStrategyKey: string;
  readonly unassignedWalletKey: string;
  readonly numericTolerance: number;
  readonly enforcePortfolioReconciliation: boolean;
}

interface MutableExposureAccumulator {
  readonly values: Map<string, number>;
}

const DEFAULT_UNASSIGNED_EXCHANGE_KEY = "UNASSIGNED_EXCHANGE";
const DEFAULT_UNASSIGNED_CHAIN_KEY = "UNASSIGNED_CHAIN";
const DEFAULT_UNASSIGNED_STRATEGY_KEY = "UNASSIGNED_STRATEGY";
const DEFAULT_UNASSIGNED_WALLET_KEY = "UNASSIGNED_WALLET";
const DEFAULT_NUMERIC_TOLERANCE = 1e-8;

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

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a string.",
    );
  }

  if (value.trim().length === 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must not be empty.",
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a finite number.",
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (!Number.isInteger(value) || value < 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative integer.",
    );
  }
}

function assertPositiveNumber(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value <= 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be greater than zero.",
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

function normalizeKey(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOptions(
  options:
    | EnterpriseRiskExposureCalculatorOptions
    | undefined,
): NormalizedEnterpriseRiskExposureCalculatorOptions {
  if (options !== undefined) {
    assertRecord(options, "options");
  }

  const unassignedExchangeKey =
    options?.unassignedExchangeKey ??
    DEFAULT_UNASSIGNED_EXCHANGE_KEY;

  const unassignedChainKey =
    options?.unassignedChainKey ??
    DEFAULT_UNASSIGNED_CHAIN_KEY;

  const unassignedStrategyKey =
    options?.unassignedStrategyKey ??
    DEFAULT_UNASSIGNED_STRATEGY_KEY;

  const unassignedWalletKey =
    options?.unassignedWalletKey ??
    DEFAULT_UNASSIGNED_WALLET_KEY;

  const numericTolerance =
    options?.numericTolerance ??
    DEFAULT_NUMERIC_TOLERANCE;

  const enforcePortfolioReconciliation =
    options?.enforcePortfolioReconciliation ?? true;

  assertNonEmptyString(
    unassignedExchangeKey,
    "options.unassignedExchangeKey",
  );

  assertNonEmptyString(
    unassignedChainKey,
    "options.unassignedChainKey",
  );

  assertNonEmptyString(
    unassignedStrategyKey,
    "options.unassignedStrategyKey",
  );

  assertNonEmptyString(
    unassignedWalletKey,
    "options.unassignedWalletKey",
  );

  assertPositiveNumber(
    numericTolerance,
    "options.numericTolerance",
  );

  assertBoolean(
    enforcePortfolioReconciliation,
    "options.enforcePortfolioReconciliation",
  );

  return Object.freeze({
    unassignedExchangeKey: normalizeKey(unassignedExchangeKey),
    unassignedChainKey: normalizeKey(unassignedChainKey),
    unassignedStrategyKey: normalizeKey(unassignedStrategyKey),
    unassignedWalletKey: normalizeKey(unassignedWalletKey),
    numericTolerance,
    enforcePortfolioReconciliation,
  });
}

function validateCalculationInput(
  input: EnterpriseRiskExposureCalculationInput,
): void {
  assertRecord(input, "input");
  assertRecord(input.portfolio, "input.portfolio");

  if (input.calculatedAt !== undefined) {
    assertNonNegativeInteger(
      input.calculatedAt,
      "input.calculatedAt",
    );
  }

  if (
    input.calculatedAt !== undefined &&
    input.calculatedAt < input.portfolio.observedAt
  ) {
    throw new EnterpriseRiskValidationError(
      "input.calculatedAt",
      "must not be earlier than portfolio.observedAt.",
    );
  }
}

/**
 * Reuses the enterprise-risk request validator to validate a portfolio
 * snapshot without duplicating the complete portfolio validation rules.
 */
function validatePortfolio(
  portfolio: EnterpriseRiskPortfolioSnapshot,
): void {
  validateEnterpriseRiskEvaluationRequest({
    requestId: "__exposure_calculation_validation__",
    evaluationMode: "PORTFOLIO_REVIEW",
    requestedAt: portfolio.observedAt,
    account: {
      portfolioId: portfolio.portfolioId,
      accountId:
        portfolio.accounts[0]?.accountId ??
        "__portfolio_level_account__",
    },
    portfolioSnapshot: portfolio,
    policies: Object.freeze([]),
    circuitBreakers: Object.freeze([]),
  });
}

function createAccumulator(): MutableExposureAccumulator {
  return {
    values: new Map<string, number>(),
  };
}

function addExposure(
  accumulator: MutableExposureAccumulator,
  key: string,
  notionalValue: number,
): void {
  const normalizedKey = normalizeKey(key);
  const existingValue =
    accumulator.values.get(normalizedKey) ?? 0;

  accumulator.values.set(
    normalizedKey,
    existingValue + notionalValue,
  );
}

function getPositionGrossNotional(
  position: EnterpriseRiskPositionSnapshot,
): number {
  if (position.side === "FLAT") {
    return 0;
  }

  return Math.abs(position.notionalValue);
}

function getPositionSignedNotional(
  position: EnterpriseRiskPositionSnapshot,
): number {
  const grossNotional = getPositionGrossNotional(position);

  if (position.side === "SHORT") {
    return -grossNotional;
  }

  if (position.side === "LONG") {
    return grossNotional;
  }

  return 0;
}

function getPercentageOfEquity(
  value: number,
  totalEquity: number,
): number {
  if (totalEquity <= 0) {
    return value === 0 ? 0 : Number.MAX_VALUE;
  }

  const percentage = Math.abs(value) / totalEquity;

  if (!Number.isFinite(percentage)) {
    return Number.MAX_VALUE;
  }

  return percentage;
}

function convertAccumulatorToExposures(
  accumulator: MutableExposureAccumulator,
  totalEquity: number,
): readonly EnterpriseRiskExposure[] {
  const exposures = Array.from(
    accumulator.values.entries(),
  )
    .filter(([, value]) => value !== 0)
    .sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    )
    .map(
      ([key, value]): EnterpriseRiskExposure =>
        Object.freeze({
          key,
          value,
          percentageOfEquity: getPercentageOfEquity(
            value,
            totalEquity,
          ),
        }),
    );

  return Object.freeze(exposures);
}

function calculateTolerance(
  expected: number,
  actual: number,
  numericTolerance: number,
): number {
  return Math.max(
    numericTolerance,
    Math.abs(expected) * numericTolerance,
    Math.abs(actual) * numericTolerance,
  );
}

function assertApproximatelyEqual(
  expected: number,
  actual: number,
  field: string,
  numericTolerance: number,
): void {
  const tolerance = calculateTolerance(
    expected,
    actual,
    numericTolerance,
  );

  if (Math.abs(expected - actual) > tolerance) {
    throw new EnterpriseRiskValidationError(
      field,
      `does not reconcile with calculated exposure. ` +
        `Expected ${expected}, calculated ${actual}.`,
    );
  }
}

function reconcilePortfolioExposure(
  portfolio: EnterpriseRiskPortfolioSnapshot,
  grossExposure: number,
  netExposure: number,
  longExposure: number,
  shortExposure: number,
  numericTolerance: number,
): void {
  assertApproximatelyEqual(
    portfolio.grossExposure,
    grossExposure,
    "portfolio.grossExposure",
    numericTolerance,
  );

  assertApproximatelyEqual(
    portfolio.netExposure,
    netExposure,
    "portfolio.netExposure",
    numericTolerance,
  );

  assertApproximatelyEqual(
    portfolio.longExposure,
    longExposure,
    "portfolio.longExposure",
    numericTolerance,
  );

  assertApproximatelyEqual(
    portfolio.shortExposure,
    shortExposure,
    "portfolio.shortExposure",
    numericTolerance,
  );
}

function resolveCalculatedAt(
  input: EnterpriseRiskExposureCalculationInput,
): EnterpriseRiskTimestamp {
  return input.calculatedAt ?? input.portfolio.observedAt;
}

export class DeterministicEnterpriseRiskExposureCalculator
  implements EnterpriseRiskExposureCalculator
{
  private readonly options: NormalizedEnterpriseRiskExposureCalculatorOptions;

  public constructor(
    options?: EnterpriseRiskExposureCalculatorOptions,
  ) {
    this.options = normalizeOptions(options);
  }

  public calculate(
    input: EnterpriseRiskExposureCalculationInput,
  ): EnterpriseRiskExposureSnapshot {
    validateCalculationInput(input);
    validatePortfolio(input.portfolio);

    const assetAccumulator = createAccumulator();
    const exchangeAccumulator = createAccumulator();
    const chainAccumulator = createAccumulator();
    const strategyAccumulator = createAccumulator();
    const walletAccumulator = createAccumulator();

    let longExposure = 0;
    let shortExposure = 0;
    let netExposure = 0;

    for (const position of input.portfolio.positions) {
      const grossNotional =
        getPositionGrossNotional(position);

      if (grossNotional === 0) {
        continue;
      }

      const signedNotional =
        getPositionSignedNotional(position);

      if (position.side === "LONG") {
        longExposure += grossNotional;
      } else if (position.side === "SHORT") {
        shortExposure += grossNotional;
      }

      netExposure += signedNotional;

      addExposure(
        assetAccumulator,
        position.baseAsset,
        grossNotional,
      );

      addExposure(
        exchangeAccumulator,
        position.exchangeId ??
          this.options.unassignedExchangeKey,
        grossNotional,
      );

      addExposure(
        chainAccumulator,
        position.chainId ??
          this.options.unassignedChainKey,
        grossNotional,
      );

      addExposure(
        strategyAccumulator,
        position.strategyId ??
          this.options.unassignedStrategyKey,
        grossNotional,
      );

      addExposure(
        walletAccumulator,
        position.walletId ??
          this.options.unassignedWalletKey,
        grossNotional,
      );
    }

    const grossExposure = longExposure + shortExposure;

    if (this.options.enforcePortfolioReconciliation) {
      reconcilePortfolioExposure(
        input.portfolio,
        grossExposure,
        netExposure,
        longExposure,
        shortExposure,
        this.options.numericTolerance,
      );
    }

    return Object.freeze({
      grossExposure,
      netExposure,
      longExposure,
      shortExposure,
      assetExposures: convertAccumulatorToExposures(
        assetAccumulator,
        input.portfolio.totalEquity,
      ),
      exchangeExposures: convertAccumulatorToExposures(
        exchangeAccumulator,
        input.portfolio.totalEquity,
      ),
      chainExposures: convertAccumulatorToExposures(
        chainAccumulator,
        input.portfolio.totalEquity,
      ),
      strategyExposures: convertAccumulatorToExposures(
        strategyAccumulator,
        input.portfolio.totalEquity,
      ),
      walletExposures: convertAccumulatorToExposures(
        walletAccumulator,
        input.portfolio.totalEquity,
      ),
      calculatedAt: resolveCalculatedAt(input),
    });
  }
}

export function calculateEnterpriseRiskExposure(
  input: EnterpriseRiskExposureCalculationInput,
  options?: EnterpriseRiskExposureCalculatorOptions,
): EnterpriseRiskExposureSnapshot {
  const calculator =
    new DeterministicEnterpriseRiskExposureCalculator(options);

  return calculator.calculate(input);
}