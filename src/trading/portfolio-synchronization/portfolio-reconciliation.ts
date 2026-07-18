/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 11: Portfolio Reconciliation Engine
 *
 * Deterministically compares an expected portfolio snapshot with an observed
 * exchange-derived portfolio snapshot and produces immutable reconciliation
 * differences, severity classifications, aggregate statistics, and a final
 * reconciliation decision.
 */

import type {
  LivePortfolio,
  LivePortfolioMetadata,
  LivePortfolioPosition,
} from "./live-portfolio";

export type PortfolioReconciliationStatus =
  | "MATCHED"
  | "MATCHED_WITH_TOLERANCE"
  | "MISMATCHED"
  | "CRITICAL_MISMATCH";

export type PortfolioReconciliationSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export type PortfolioReconciliationDifferenceType =
  | "PORTFOLIO_ID_MISMATCH"
  | "REPORTING_CURRENCY_MISMATCH"
  | "MISSING_POSITION"
  | "UNEXPECTED_POSITION"
  | "POSITION_SIDE_MISMATCH"
  | "POSITION_QUANTITY_MISMATCH"
  | "POSITION_SIGNED_QUANTITY_MISMATCH"
  | "POSITION_ENTRY_PRICE_MISMATCH"
  | "POSITION_MARK_PRICE_MISMATCH"
  | "POSITION_ENTRY_NOTIONAL_MISMATCH"
  | "POSITION_MARK_NOTIONAL_MISMATCH"
  | "POSITION_INITIAL_MARGIN_MISMATCH"
  | "POSITION_MAINTENANCE_MARGIN_MISMATCH"
  | "POSITION_COLLATERAL_MISMATCH"
  | "POSITION_UNREALIZED_PNL_MISMATCH"
  | "POSITION_REALIZED_PNL_MISMATCH"
  | "POSITION_NET_PNL_MISMATCH"
  | "POSITION_METADATA_MISMATCH"
  | "EXCHANGE_ACCOUNTS_MISMATCH"
  | "BALANCES_MISMATCH"
  | "OPEN_ORDER_EXPOSURES_MISMATCH"
  | "COLLATERAL_MISMATCH"
  | "MARGIN_SUMMARY_MISMATCH"
  | "EXPOSURE_SUMMARY_MISMATCH"
  | "PNL_SUMMARY_MISMATCH"
  | "VALUATION_MISMATCH"
  | "SYNCHRONIZATION_STATE_MISMATCH"
  | "VERSION_MISMATCH"
  | "METADATA_MISMATCH";

export interface PortfolioReconciliationTolerance {
  readonly quantity: number;
  readonly price: number;
  readonly notional: number;
  readonly margin: number;
  readonly pnl: number;
  readonly ratio: number;
}

export interface PortfolioReconciliationPolicy {
  readonly tolerance: PortfolioReconciliationTolerance;

  readonly failOnUnexpectedPosition: boolean;
  readonly failOnMissingPosition: boolean;

  readonly criticalDifferenceCount: number;
  readonly maximumWarningCount: number;

  readonly compareMetadata: boolean;
  readonly compareSynchronizationState: boolean;
  readonly compareVersion: boolean;
}

export interface PortfolioReconciliationDifference {
  readonly differenceId: string;

  readonly type: PortfolioReconciliationDifferenceType;
  readonly severity: PortfolioReconciliationSeverity;

  readonly entityType:
    | "PORTFOLIO"
    | "POSITION"
    | "EXCHANGE_ACCOUNTS"
    | "BALANCES"
    | "OPEN_ORDERS"
    | "COLLATERAL"
    | "MARGIN"
    | "EXPOSURE"
    | "PNL"
    | "VALUATION"
    | "SYNCHRONIZATION"
    | "METADATA";

  readonly entityKey: string;
  readonly field: string;

  readonly expectedValue: unknown;
  readonly observedValue: unknown;

  readonly absoluteDifference: number | null;
  readonly tolerance: number | null;

  readonly withinTolerance: boolean;
  readonly message: string;

  readonly metadata: LivePortfolioMetadata;
}

export interface PositionReconciliationResult {
  readonly positionKey: string;

  readonly expectedPosition: LivePortfolioPosition | null;
  readonly observedPosition: LivePortfolioPosition | null;

  readonly differences: readonly PortfolioReconciliationDifference[];

  readonly matched: boolean;
  readonly matchedWithinTolerance: boolean;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioReconciliationStatistics {
  readonly expectedPositionCount: number;
  readonly observedPositionCount: number;

  readonly matchedPositionCount: number;
  readonly toleranceMatchedPositionCount: number;

  readonly missingPositionCount: number;
  readonly unexpectedPositionCount: number;
  readonly mismatchedPositionCount: number;

  readonly totalDifferenceCount: number;
  readonly informationCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly criticalCount: number;

  readonly exactMatch: boolean;
  readonly toleranceMatch: boolean;
}

export interface PortfolioReconciliationRequest {
  readonly expected: LivePortfolio;
  readonly observed: LivePortfolio;

  readonly reconciledAt: number;
  readonly sequence: number;

  readonly policy?: PortfolioReconciliationPolicy;
  readonly metadata?: LivePortfolioMetadata;
}

export interface PortfolioReconciliationResult {
  readonly portfolioId: string;
  readonly reportingCurrency: string;

  readonly status: PortfolioReconciliationStatus;

  readonly positionResults: readonly PositionReconciliationResult[];
  readonly differences: readonly PortfolioReconciliationDifference[];

  readonly statistics: PortfolioReconciliationStatistics;

  readonly reconciledAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioReconciliationEngine {
  reconcile(
    request: PortfolioReconciliationRequest,
  ): PortfolioReconciliationResult;
}

interface DifferenceInput {
  readonly type: PortfolioReconciliationDifferenceType;
  readonly severity: PortfolioReconciliationSeverity;

  readonly entityType:
    PortfolioReconciliationDifference["entityType"];

  readonly entityKey: string;
  readonly field: string;

  readonly expectedValue: unknown;
  readonly observedValue: unknown;

  readonly absoluteDifference?: number | null;
  readonly tolerance?: number | null;
  readonly withinTolerance?: boolean;

  readonly message: string;
  readonly metadata?: LivePortfolioMetadata;
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${field} must be an object.`);
  }
}

function assertNonEmptyString(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${field} must be a non-empty string.`,
    );
  }
}

function assertFiniteNumber(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${field} must be a finite number.`,
    );
  }
}

function assertNonNegativeFiniteNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive integer.`,
    );
  }
}

function normalizeIdentifier(
  value: string,
  field: string,
): string {
  assertNonEmptyString(
    value,
    field,
  );

  return value.trim();
}

function normalizeCurrency(
  value: string,
  field: string,
): string {
  return normalizeIdentifier(
    value,
    field,
  ).toUpperCase();
}

function freezeMetadata(
  metadata: LivePortfolioMetadata | undefined,
): LivePortfolioMetadata {
  if (metadata === undefined) {
    return Object.freeze({});
  }

  const result: Record<
    string,
    string | number | boolean | null
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    assertNonEmptyString(
      key,
      "metadata key",
    );

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        `metadata.${key} contains an unsupported value.`,
      );
    }

    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        `metadata.${key} must be finite.`,
      );
    }

    result[key] = value;
  }

  return Object.freeze(result);
}

function resolvePolicy(
  policy: PortfolioReconciliationPolicy | undefined,
): PortfolioReconciliationPolicy {
  const resolved =
    policy ?? createDefaultPortfolioReconciliationPolicy();

  assertObject(
    resolved,
    "policy",
  );

  assertObject(
    resolved.tolerance,
    "policy.tolerance",
  );

  assertNonNegativeFiniteNumber(
    resolved.tolerance.quantity,
    "policy.tolerance.quantity",
  );

  assertNonNegativeFiniteNumber(
    resolved.tolerance.price,
    "policy.tolerance.price",
  );

  assertNonNegativeFiniteNumber(
    resolved.tolerance.notional,
    "policy.tolerance.notional",
  );

  assertNonNegativeFiniteNumber(
    resolved.tolerance.margin,
    "policy.tolerance.margin",
  );

  assertNonNegativeFiniteNumber(
    resolved.tolerance.pnl,
    "policy.tolerance.pnl",
  );

  assertNonNegativeFiniteNumber(
    resolved.tolerance.ratio,
    "policy.tolerance.ratio",
  );

  assertNonNegativeFiniteNumber(
    resolved.criticalDifferenceCount,
    "policy.criticalDifferenceCount",
  );

  assertNonNegativeFiniteNumber(
    resolved.maximumWarningCount,
    "policy.maximumWarningCount",
  );

  return Object.freeze({
    tolerance: Object.freeze({
      quantity:
        resolved.tolerance.quantity,

      price:
        resolved.tolerance.price,

      notional:
        resolved.tolerance.notional,

      margin:
        resolved.tolerance.margin,

      pnl:
        resolved.tolerance.pnl,

      ratio:
        resolved.tolerance.ratio,
    }),

    failOnUnexpectedPosition:
      resolved.failOnUnexpectedPosition,

    failOnMissingPosition:
      resolved.failOnMissingPosition,

    criticalDifferenceCount:
      resolved.criticalDifferenceCount,

    maximumWarningCount:
      resolved.maximumWarningCount,

    compareMetadata:
      resolved.compareMetadata,

    compareSynchronizationState:
      resolved.compareSynchronizationState,

    compareVersion:
      resolved.compareVersion,
  });
}

function stableSerialize(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableSerialize)
      .join(",")}]`;
  }

  const record =
    value as Record<string, unknown>;

  const keys =
    Object.keys(record).sort();

  return `{${keys
    .map(
      key =>
        `${JSON.stringify(key)}:${stableSerialize(
          record[key],
        )}`,
    )
    .join(",")}}`;
}

function valuesEqual(
  expected: unknown,
  observed: unknown,
): boolean {
  return (
    stableSerialize(expected) ===
    stableSerialize(observed)
  );
}

function calculateAbsoluteDifference(
  expected: number | null,
  observed: number | null,
): number | null {
  if (
    expected === null ||
    observed === null
  ) {
    return null;
  }

  assertFiniteNumber(
    expected,
    "expected",
  );

  assertFiniteNumber(
    observed,
    "observed",
  );

  return Math.abs(
    expected -
    observed,
  );
}

function numericValuesMatch(
  expected: number | null,
  observed: number | null,
  tolerance: number,
): {
  readonly exact: boolean;
  readonly withinTolerance: boolean;
  readonly absoluteDifference: number | null;
} {
  if (
    expected === null ||
    observed === null
  ) {
    return Object.freeze({
      exact:
        expected === observed,

      withinTolerance:
        expected === observed,

      absoluteDifference:
        null,
    });
  }

  const absoluteDifference =
    calculateAbsoluteDifference(
      expected,
      observed,
    );

  if (absoluteDifference === null) {
    return Object.freeze({
      exact: false,
      withinTolerance: false,
      absoluteDifference: null,
    });
  }

  return Object.freeze({
    exact:
      absoluteDifference === 0,

    withinTolerance:
      absoluteDifference <=
      tolerance,

    absoluteDifference,
  });
}

function createDifferenceId(
  sequence: number,
  index: number,
): string {
  return `portfolio-reconciliation:${sequence}:${String(
    index + 1,
  ).padStart(6, "0")}`;
}

function createDifference(
  sequence: number,
  index: number,
  input: DifferenceInput,
): PortfolioReconciliationDifference {
  return Object.freeze({
    differenceId:
      createDifferenceId(
        sequence,
        index,
      ),

    type:
      input.type,

    severity:
      input.severity,

    entityType:
      input.entityType,

    entityKey:
      input.entityKey,

    field:
      input.field,

    expectedValue:
      input.expectedValue,

    observedValue:
      input.observedValue,

    absoluteDifference:
      input.absoluteDifference ??
      null,

    tolerance:
      input.tolerance ??
      null,

    withinTolerance:
      input.withinTolerance ??
      false,

    message:
      input.message,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

function createPositionKey(
  position: LivePortfolioPosition,
): string {
  return [
    normalizeIdentifier(
      position.exchangeId,
      "position.exchangeId",
    ),
    normalizeIdentifier(
      position.accountId,
      "position.accountId",
    ),
    normalizeIdentifier(
      position.symbol,
      "position.symbol",
    ).toUpperCase(),
    position.instrumentType,
    position.positionMode,
    position.side,
  ].join(":");
}

function indexPositions(
  positions: readonly LivePortfolioPosition[],
): ReadonlyMap<string, LivePortfolioPosition> {
  const result =
    new Map<
      string,
      LivePortfolioPosition
    >();

  for (const position of positions) {
    const key =
      createPositionKey(
        position,
      );

    if (result.has(key)) {
      throw new Error(
        `Duplicate portfolio position key "${key}".`,
      );
    }

    result.set(
      key,
      position,
    );
  }

  return result;
}

function addNumericDifference(
  differences: DifferenceInput[],
  input: {
    readonly type: PortfolioReconciliationDifferenceType;
    readonly entityKey: string;
    readonly field: string;

    readonly expected: number | null;
    readonly observed: number | null;

    readonly tolerance: number;
    readonly message: string;
  },
): void {
  const comparison =
    numericValuesMatch(
      input.expected,
      input.observed,
      input.tolerance,
    );

  if (comparison.exact) {
    return;
  }

  differences.push({
    type:
      input.type,

    severity:
      comparison.withinTolerance
        ? "WARNING"
        : "ERROR",

    entityType:
      "POSITION",

    entityKey:
      input.entityKey,

    field:
      input.field,

    expectedValue:
      input.expected,

    observedValue:
      input.observed,

    absoluteDifference:
      comparison.absoluteDifference,

    tolerance:
      input.tolerance,

    withinTolerance:
      comparison.withinTolerance,

    message:
      input.message,
  });
}

function reconcileExistingPosition(
  positionKey: string,
  expected: LivePortfolioPosition,
  observed: LivePortfolioPosition,
  policy: PortfolioReconciliationPolicy,
): readonly DifferenceInput[] {
  const differences:
    DifferenceInput[] = [];

  if (expected.side !== observed.side) {
    differences.push({
      type:
        "POSITION_SIDE_MISMATCH",

      severity:
        "CRITICAL",

      entityType:
        "POSITION",

      entityKey:
        positionKey,

      field:
        "side",

      expectedValue:
        expected.side,

      observedValue:
        observed.side,

      message:
        `Position ${positionKey} has a side mismatch.`,
    });
  }

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_QUANTITY_MISMATCH",

      entityKey:
        positionKey,

      field:
        "quantity",

      expected:
        expected.quantity,

      observed:
        observed.quantity,

      tolerance:
        policy.tolerance.quantity,

      message:
        `Position ${positionKey} quantity differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_SIGNED_QUANTITY_MISMATCH",

      entityKey:
        positionKey,

      field:
        "signedQuantity",

      expected:
        expected.signedQuantity,

      observed:
        observed.signedQuantity,

      tolerance:
        policy.tolerance.quantity,

      message:
        `Position ${positionKey} signed quantity differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_ENTRY_PRICE_MISMATCH",

      entityKey:
        positionKey,

      field:
        "averageEntryPrice",

      expected:
        expected.averageEntryPrice,

      observed:
        observed.averageEntryPrice,

      tolerance:
        policy.tolerance.price,

      message:
        `Position ${positionKey} average entry price differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_MARK_PRICE_MISMATCH",

      entityKey:
        positionKey,

      field:
        "markPrice",

      expected:
        expected.markPrice,

      observed:
        observed.markPrice,

      tolerance:
        policy.tolerance.price,

      message:
        `Position ${positionKey} mark price differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_ENTRY_NOTIONAL_MISMATCH",

      entityKey:
        positionKey,

      field:
        "entryNotional",

      expected:
        expected.entryNotional,

      observed:
        observed.entryNotional,

      tolerance:
        policy.tolerance.notional,

      message:
        `Position ${positionKey} entry notional differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_MARK_NOTIONAL_MISMATCH",

      entityKey:
        positionKey,

      field:
        "markNotional",

      expected:
        expected.markNotional,

      observed:
        observed.markNotional,

      tolerance:
        policy.tolerance.notional,

      message:
        `Position ${positionKey} mark notional differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_INITIAL_MARGIN_MISMATCH",

      entityKey:
        positionKey,

      field:
        "initialMargin",

      expected:
        expected.initialMargin,

      observed:
        observed.initialMargin,

      tolerance:
        policy.tolerance.margin,

      message:
        `Position ${positionKey} initial margin differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_MAINTENANCE_MARGIN_MISMATCH",

      entityKey:
        positionKey,

      field:
        "maintenanceMargin",

      expected:
        expected.maintenanceMargin,

      observed:
        observed.maintenanceMargin,

      tolerance:
        policy.tolerance.margin,

      message:
        `Position ${positionKey} maintenance margin differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_COLLATERAL_MISMATCH",

      entityKey:
        positionKey,

      field:
        "collateralAllocated",

      expected:
        expected.collateralAllocated,

      observed:
        observed.collateralAllocated,

      tolerance:
        policy.tolerance.margin,

      message:
        `Position ${positionKey} allocated collateral differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_UNREALIZED_PNL_MISMATCH",

      entityKey:
        positionKey,

      field:
        "unrealizedPnl",

      expected:
        expected.unrealizedPnl,

      observed:
        observed.unrealizedPnl,

      tolerance:
        policy.tolerance.pnl,

      message:
        `Position ${positionKey} unrealized PnL differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_REALIZED_PNL_MISMATCH",

      entityKey:
        positionKey,

      field:
        "realizedPnl",

      expected:
        expected.realizedPnl,

      observed:
        observed.realizedPnl,

      tolerance:
        policy.tolerance.pnl,

      message:
        `Position ${positionKey} realized PnL differs.`,
    },
  );

  addNumericDifference(
    differences,
    {
      type:
        "POSITION_NET_PNL_MISMATCH",

      entityKey:
        positionKey,

      field:
        "netPnl",

      expected:
        expected.netPnl,

      observed:
        observed.netPnl,

      tolerance:
        policy.tolerance.pnl,

      message:
        `Position ${positionKey} net PnL differs.`,
    },
  );

  if (
    policy.compareMetadata &&
    !valuesEqual(
      expected.metadata,
      observed.metadata,
    )
  ) {
    differences.push({
      type:
        "POSITION_METADATA_MISMATCH",

      severity:
        "INFO",

      entityType:
        "POSITION",

      entityKey:
        positionKey,

      field:
        "metadata",

      expectedValue:
        expected.metadata,

      observedValue:
        observed.metadata,

      message:
        `Position ${positionKey} metadata differs.`,
    });
  }

  return Object.freeze(
    differences,
  );
}

function createStructuralDifference(
  type: PortfolioReconciliationDifferenceType,
  entityType: PortfolioReconciliationDifference["entityType"],
  entityKey: string,
  field: string,
  expectedValue: unknown,
  observedValue: unknown,
  severity: PortfolioReconciliationSeverity,
  message: string,
): DifferenceInput {
  return {
    type,
    severity,
    entityType,
    entityKey,
    field,
    expectedValue,
    observedValue,
    withinTolerance: false,
    message,
  };
}

function reconcilePortfolioStructures(
  expected: LivePortfolio,
  observed: LivePortfolio,
  policy: PortfolioReconciliationPolicy,
): readonly DifferenceInput[] {
  const differences:
    DifferenceInput[] = [];

  if (
    !valuesEqual(
      expected.exchangeAccounts,
      observed.exchangeAccounts,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "EXCHANGE_ACCOUNTS_MISMATCH",
        "EXCHANGE_ACCOUNTS",
        expected.identity.portfolioId,
        "exchangeAccounts",
        expected.exchangeAccounts,
        observed.exchangeAccounts,
        "ERROR",
        "Exchange account collections differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.balances,
      observed.balances,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "BALANCES_MISMATCH",
        "BALANCES",
        expected.identity.portfolioId,
        "balances",
        expected.balances,
        observed.balances,
        "ERROR",
        "Portfolio balance collections differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.openOrderExposures,
      observed.openOrderExposures,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "OPEN_ORDER_EXPOSURES_MISMATCH",
        "OPEN_ORDERS",
        expected.identity.portfolioId,
        "openOrderExposures",
        expected.openOrderExposures,
        observed.openOrderExposures,
        "WARNING",
        "Open-order exposure collections differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.collateral,
      observed.collateral,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "COLLATERAL_MISMATCH",
        "COLLATERAL",
        expected.identity.portfolioId,
        "collateral",
        expected.collateral,
        observed.collateral,
        "ERROR",
        "Collateral collections differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.margin,
      observed.margin,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "MARGIN_SUMMARY_MISMATCH",
        "MARGIN",
        expected.identity.portfolioId,
        "margin",
        expected.margin,
        observed.margin,
        "ERROR",
        "Portfolio margin summaries differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.exposure,
      observed.exposure,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "EXPOSURE_SUMMARY_MISMATCH",
        "EXPOSURE",
        expected.identity.portfolioId,
        "exposure",
        expected.exposure,
        observed.exposure,
        "ERROR",
        "Portfolio exposure summaries differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.pnl,
      observed.pnl,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "PNL_SUMMARY_MISMATCH",
        "PNL",
        expected.identity.portfolioId,
        "pnl",
        expected.pnl,
        observed.pnl,
        "ERROR",
        "Portfolio PnL summaries differ.",
      ),
    );
  }

  if (
    !valuesEqual(
      expected.valuation,
      observed.valuation,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "VALUATION_MISMATCH",
        "VALUATION",
        expected.identity.portfolioId,
        "valuation",
        expected.valuation,
        observed.valuation,
        "ERROR",
        "Portfolio valuations differ.",
      ),
    );
  }

  if (
    policy.compareSynchronizationState &&
    !valuesEqual(
      expected.synchronization,
      observed.synchronization,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "SYNCHRONIZATION_STATE_MISMATCH",
        "SYNCHRONIZATION",
        expected.identity.portfolioId,
        "synchronization",
        expected.synchronization,
        observed.synchronization,
        "WARNING",
        "Portfolio synchronization states differ.",
      ),
    );
  }

  if (
    policy.compareVersion &&
    expected.version !==
      observed.version
  ) {
    differences.push(
      createStructuralDifference(
        "VERSION_MISMATCH",
        "PORTFOLIO",
        expected.identity.portfolioId,
        "version",
        expected.version,
        observed.version,
        "WARNING",
        "Portfolio versions differ.",
      ),
    );
  }

  if (
    policy.compareMetadata &&
    !valuesEqual(
      expected.metadata,
      observed.metadata,
    )
  ) {
    differences.push(
      createStructuralDifference(
        "METADATA_MISMATCH",
        "METADATA",
        expected.identity.portfolioId,
        "metadata",
        expected.metadata,
        observed.metadata,
        "INFO",
        "Portfolio metadata differs.",
      ),
    );
  }

  return Object.freeze(
    differences,
  );
}

function determineStatus(
  statistics: PortfolioReconciliationStatistics,
  policy: PortfolioReconciliationPolicy,
): PortfolioReconciliationStatus {
  if (
    statistics.criticalCount >=
      policy.criticalDifferenceCount &&
    statistics.criticalCount > 0
  ) {
    return "CRITICAL_MISMATCH";
  }

  if (
    statistics.errorCount > 0 ||
    statistics.warningCount >
      policy.maximumWarningCount
  ) {
    return "MISMATCHED";
  }

  if (statistics.warningCount > 0) {
    return "MATCHED_WITH_TOLERANCE";
  }

  return "MATCHED";
}

function calculateStatistics(
  expectedPositionCount: number,
  observedPositionCount: number,
  positionResults: readonly PositionReconciliationResult[],
  differences: readonly PortfolioReconciliationDifference[],
): PortfolioReconciliationStatistics {
  let matchedPositionCount = 0;
  let toleranceMatchedPositionCount = 0;

  let missingPositionCount = 0;
  let unexpectedPositionCount = 0;
  let mismatchedPositionCount = 0;

  let informationCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let criticalCount = 0;

  for (const result of positionResults) {
    if (
      result.expectedPosition === null
    ) {
      unexpectedPositionCount += 1;
      continue;
    }

    if (
      result.observedPosition === null
    ) {
      missingPositionCount += 1;
      continue;
    }

    if (result.matched) {
      matchedPositionCount += 1;
    } else if (
      result.matchedWithinTolerance
    ) {
      toleranceMatchedPositionCount += 1;
    } else {
      mismatchedPositionCount += 1;
    }
  }

  for (const difference of differences) {
    switch (difference.severity) {
      case "INFO":
        informationCount += 1;
        break;

      case "WARNING":
        warningCount += 1;
        break;

      case "ERROR":
        errorCount += 1;
        break;

      case "CRITICAL":
        criticalCount += 1;
        break;
    }
  }

  const exactMatch =
    differences.length === 0;

  const toleranceMatch =
    errorCount === 0 &&
    criticalCount === 0;

  return Object.freeze({
    expectedPositionCount,
    observedPositionCount,

    matchedPositionCount,
    toleranceMatchedPositionCount,

    missingPositionCount,
    unexpectedPositionCount,
    mismatchedPositionCount,

    totalDifferenceCount:
      differences.length,

    informationCount,
    warningCount,
    errorCount,
    criticalCount,

    exactMatch,
    toleranceMatch,
  });
}

export class DeterministicPortfolioReconciliationEngine
implements PortfolioReconciliationEngine {
  public reconcile(
    request: PortfolioReconciliationRequest,
  ): PortfolioReconciliationResult {
    assertObject(
      request,
      "request",
    );

    assertObject(
      request.expected,
      "request.expected",
    );

    assertObject(
      request.observed,
      "request.observed",
    );

    assertNonNegativeFiniteNumber(
      request.reconciledAt,
      "request.reconciledAt",
    );

    assertPositiveInteger(
      request.sequence,
      "request.sequence",
    );

    const policy =
      resolvePolicy(
        request.policy,
      );

    const expectedPortfolioId =
      normalizeIdentifier(
        request.expected.identity.portfolioId,
        "request.expected.identity.portfolioId",
      );

    const observedPortfolioId =
      normalizeIdentifier(
        request.observed.identity.portfolioId,
        "request.observed.identity.portfolioId",
      );

    const expectedCurrency =
      normalizeCurrency(
        request.expected.identity.reportingCurrency,
        "request.expected.identity.reportingCurrency",
      );

    const observedCurrency =
      normalizeCurrency(
        request.observed.identity.reportingCurrency,
        "request.observed.identity.reportingCurrency",
      );

    const rawDifferences:
      DifferenceInput[] = [];

    if (
      expectedPortfolioId !==
      observedPortfolioId
    ) {
      rawDifferences.push({
        type:
          "PORTFOLIO_ID_MISMATCH",

        severity:
          "CRITICAL",

        entityType:
          "PORTFOLIO",

        entityKey:
          expectedPortfolioId,

        field:
          "identity.portfolioId",

        expectedValue:
          expectedPortfolioId,

        observedValue:
          observedPortfolioId,

        message:
          "Expected and observed portfolio identifiers differ.",
      });
    }

    if (
      expectedCurrency !==
      observedCurrency
    ) {
      rawDifferences.push({
        type:
          "REPORTING_CURRENCY_MISMATCH",

        severity:
          "CRITICAL",

        entityType:
          "PORTFOLIO",

        entityKey:
          expectedPortfolioId,

        field:
          "identity.reportingCurrency",

        expectedValue:
          expectedCurrency,

        observedValue:
          observedCurrency,

        message:
          "Expected and observed reporting currencies differ.",
      });
    }

    const expectedPositions =
      indexPositions(
        request.expected.positions,
      );

    const observedPositions =
      indexPositions(
        request.observed.positions,
      );

    const positionKeys =
      Array.from(
        new Set([
          ...expectedPositions.keys(),
          ...observedPositions.keys(),
        ]),
      ).sort();

    const mutablePositionResults:
      Array<{
        readonly positionKey: string;
        readonly expectedPosition: LivePortfolioPosition | null;
        readonly observedPosition: LivePortfolioPosition | null;
        readonly rawDifferences: readonly DifferenceInput[];
      }> = [];

    for (const positionKey of positionKeys) {
      const expectedPosition =
        expectedPositions.get(
          positionKey,
        ) ?? null;

      const observedPosition =
        observedPositions.get(
          positionKey,
        ) ?? null;

      if (
        expectedPosition === null &&
        observedPosition !== null
      ) {
        const difference:
          DifferenceInput = {
            type:
              "UNEXPECTED_POSITION",

            severity:
              policy.failOnUnexpectedPosition
                ? "ERROR"
                : "WARNING",

            entityType:
              "POSITION",

            entityKey:
              positionKey,

            field:
              "position",

            expectedValue:
              null,

            observedValue:
              observedPosition,

            message:
              `Observed position ${positionKey} was not expected.`,
          };

        rawDifferences.push(
          difference,
        );

        mutablePositionResults.push({
          positionKey,
          expectedPosition,
          observedPosition,
          rawDifferences:
            Object.freeze([
              difference,
            ]),
        });

        continue;
      }

      if (
        expectedPosition !== null &&
        observedPosition === null
      ) {
        const difference:
          DifferenceInput = {
            type:
              "MISSING_POSITION",

            severity:
              policy.failOnMissingPosition
                ? "ERROR"
                : "WARNING",

            entityType:
              "POSITION",

            entityKey:
              positionKey,

            field:
              "position",

            expectedValue:
              expectedPosition,

            observedValue:
              null,

            message:
              `Expected position ${positionKey} was not observed.`,
          };

        rawDifferences.push(
          difference,
        );

        mutablePositionResults.push({
          positionKey,
          expectedPosition,
          observedPosition,
          rawDifferences:
            Object.freeze([
              difference,
            ]),
        });

        continue;
      }

      if (
        expectedPosition === null ||
        observedPosition === null
      ) {
        throw new Error(
          `Invalid reconciliation state for position "${positionKey}".`,
        );
      }

      const differences =
        reconcileExistingPosition(
          positionKey,
          expectedPosition,
          observedPosition,
          policy,
        );

      rawDifferences.push(
        ...differences,
      );

      mutablePositionResults.push({
        positionKey,
        expectedPosition,
        observedPosition,
        rawDifferences:
          differences,
      });
    }

    const structuralDifferences =
      reconcilePortfolioStructures(
        request.expected,
        request.observed,
        policy,
      );

    rawDifferences.push(
      ...structuralDifferences,
    );

    const differences =
      Object.freeze(
        rawDifferences.map(
          (difference, index) =>
            createDifference(
              request.sequence,
              index,
              difference,
            ),
        ),
      );

    let differenceOffset = 0;

    const positionResults =
      Object.freeze(
        mutablePositionResults.map(
          result => {
            const count =
              result.rawDifferences.length;

            const positionDifferences =
              Object.freeze(
                differences.slice(
                  differenceOffset,
                  differenceOffset + count,
                ),
              );

            differenceOffset +=
              count;

            const hasError =
              positionDifferences.some(
                difference =>
                  difference.severity ===
                    "ERROR" ||
                  difference.severity ===
                    "CRITICAL",
              );

            const hasWarning =
              positionDifferences.some(
                difference =>
                  difference.severity ===
                  "WARNING",
              );

            return Object.freeze({
              positionKey:
                result.positionKey,

              expectedPosition:
                result.expectedPosition,

              observedPosition:
                result.observedPosition,

              differences:
                positionDifferences,

              matched:
                positionDifferences.length === 0,

              matchedWithinTolerance:
                !hasError &&
                hasWarning,

              metadata:
                freezeMetadata({
                  differenceCount:
                    positionDifferences.length,

                  matched:
                    positionDifferences.length ===
                    0,

                  matchedWithinTolerance:
                    !hasError &&
                    hasWarning,
                }),
            });
          },
        ),
      );

    const statistics =
      calculateStatistics(
        request.expected.positions.length,
        request.observed.positions.length,
        positionResults,
        differences,
      );

    const status =
      determineStatus(
        statistics,
        policy,
      );

    return Object.freeze({
      portfolioId:
        expectedPortfolioId,

      reportingCurrency:
        expectedCurrency,

      status,

      positionResults,
      differences,
      statistics,

      reconciledAt:
        request.reconciledAt,

      sequence:
        request.sequence,

      metadata:
        freezeMetadata({
          ...request.metadata,

          expectedPortfolioVersion:
            request.expected.version,

          observedPortfolioVersion:
            request.observed.version,

          expectedPositionCount:
            statistics.expectedPositionCount,

          observedPositionCount:
            statistics.observedPositionCount,

          totalDifferenceCount:
            statistics.totalDifferenceCount,

          warningCount:
            statistics.warningCount,

          errorCount:
            statistics.errorCount,

          criticalCount:
            statistics.criticalCount,

          status,
        }),
    });
  }
}

export function createPortfolioReconciliationEngine():
DeterministicPortfolioReconciliationEngine {
  return new DeterministicPortfolioReconciliationEngine();
}

export function createDefaultPortfolioReconciliationPolicy():
PortfolioReconciliationPolicy {
  return Object.freeze({
    tolerance: Object.freeze({
      quantity: 1e-10,
      price: 1e-8,
      notional: 1e-6,
      margin: 1e-6,
      pnl: 1e-6,
      ratio: 1e-10,
    }),

    failOnUnexpectedPosition: true,
    failOnMissingPosition: true,

    criticalDifferenceCount: 1,
    maximumWarningCount: 100,

    compareMetadata: false,
    compareSynchronizationState: false,
    compareVersion: false,
  });
}

export function findPortfolioReconciliationDifference(
  result: PortfolioReconciliationResult,
  differenceId: string,
): PortfolioReconciliationDifference | null {
  assertObject(
    result,
    "result",
  );

  const normalizedDifferenceId =
    normalizeIdentifier(
      differenceId,
      "differenceId",
    );

  return (
    result.differences.find(
      difference =>
        difference.differenceId ===
        normalizedDifferenceId,
    ) ??
    null
  );
}

export function findPositionReconciliationResult(
  result: PortfolioReconciliationResult,
  positionKey: string,
): PositionReconciliationResult | null {
  assertObject(
    result,
    "result",
  );

  const normalizedPositionKey =
    normalizeIdentifier(
      positionKey,
      "positionKey",
    );

  return (
    result.positionResults.find(
      position =>
        position.positionKey ===
        normalizedPositionKey,
    ) ??
    null
  );
}