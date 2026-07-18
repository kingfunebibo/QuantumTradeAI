/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 9: Margin & Collateral Engine
 *
 * Calculates deterministic account- and portfolio-level collateral,
 * margin utilization, leverage, available margin, maintenance coverage,
 * liquidation-buffer metrics, and margin health classifications.
 */

import type {
  LivePortfolio,
  LivePortfolioCollateral,
  LivePortfolioMarginMode,
  LivePortfolioMetadata,
  LivePortfolioPosition,
} from "./live-portfolio";

export type MarginHealthStatus =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "LIQUIDATION_RISK"
  | "INSUFFICIENT_DATA";

export interface MarginCollateralPolicy {
  readonly warningMarginUtilizationRatio: number;
  readonly criticalMarginUtilizationRatio: number;
  readonly liquidationRiskMarginUtilizationRatio: number;

  readonly warningMaintenanceCoverageRatio: number;
  readonly criticalMaintenanceCoverageRatio: number;
  readonly liquidationRiskMaintenanceCoverageRatio: number;

  readonly minimumCollateralValue: number;
  readonly quantityTolerance: number;
}

export interface MarginCollateralAccountKey {
  readonly exchangeId: string;
  readonly accountId: string;
}

export interface MarginCollateralPositionContribution {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly marginMode: LivePortfolioMarginMode;

  readonly grossNotional: number;
  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly isolatedMargin: number;
  readonly allocatedCollateral: number;

  readonly unrealizedPnl: number;
  readonly liquidationPrice: number | null;
  readonly markPrice: number | null;

  readonly metadata: LivePortfolioMetadata;
}

export interface MarginCollateralAssetContribution {
  readonly exchangeId: string;
  readonly accountId: string;

  readonly asset: string;

  readonly totalQuantity: number;
  readonly availableQuantity: number;
  readonly lockedQuantity: number;

  readonly collateralPrice: number | null;
  readonly collateralValue: number | null;
  readonly collateralWeight: number;
  readonly weightedCollateralValue: number | null;

  readonly initialMarginContribution: number;
  readonly maintenanceMarginContribution: number;

  readonly capturedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface MarginCollateralAccountResult {
  readonly exchangeId: string;
  readonly accountId: string;

  readonly collateralAssetCount: number;
  readonly positionCount: number;

  readonly grossCollateralValue: number;
  readonly weightedCollateralValue: number;
  readonly effectiveCollateralValue: number;

  readonly collateralInitialMarginContribution: number;
  readonly collateralMaintenanceMarginContribution: number;

  readonly positionInitialMarginRequirement: number;
  readonly positionMaintenanceMarginRequirement: number;

  readonly initialMarginRequirement: number;
  readonly maintenanceMarginRequirement: number;
  readonly isolatedMargin: number;
  readonly allocatedCollateral: number;

  readonly unrealizedPnl: number;
  readonly adjustedEquity: number;
  readonly availableMargin: number;

  readonly grossPositionNotional: number;
  readonly netLeverage: number | null;

  readonly marginUtilizationRatio: number | null;
  readonly maintenanceCoverageRatio: number | null;
  readonly freeCollateralRatio: number | null;

  readonly healthStatus: MarginHealthStatus;

  readonly collateral: readonly MarginCollateralAssetContribution[];
  readonly positions: readonly MarginCollateralPositionContribution[];

  readonly metadata: LivePortfolioMetadata;
}

export interface MarginCollateralTotals {
  readonly accountCount: number;
  readonly healthyAccountCount: number;
  readonly warningAccountCount: number;
  readonly criticalAccountCount: number;
  readonly liquidationRiskAccountCount: number;
  readonly insufficientDataAccountCount: number;

  readonly grossCollateralValue: number;
  readonly weightedCollateralValue: number;
  readonly effectiveCollateralValue: number;

  readonly collateralInitialMarginContribution: number;
  readonly collateralMaintenanceMarginContribution: number;

  readonly positionInitialMarginRequirement: number;
  readonly positionMaintenanceMarginRequirement: number;

  readonly initialMarginRequirement: number;
  readonly maintenanceMarginRequirement: number;
  readonly isolatedMargin: number;
  readonly allocatedCollateral: number;

  readonly unrealizedPnl: number;
  readonly adjustedEquity: number;
  readonly availableMargin: number;

  readonly grossPositionNotional: number;
  readonly netLeverage: number | null;

  readonly marginUtilizationRatio: number | null;
  readonly maintenanceCoverageRatio: number | null;
  readonly freeCollateralRatio: number | null;

  readonly healthStatus: MarginHealthStatus;
}

export interface MarginCollateralCalculationRequest {
  readonly portfolio: LivePortfolio;

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly policy?: MarginCollateralPolicy;
  readonly metadata?: LivePortfolioMetadata;
}

export interface MarginCollateralCalculationResult {
  readonly portfolioId: string;
  readonly reportingCurrency: string;

  readonly accounts: readonly MarginCollateralAccountResult[];
  readonly totals: MarginCollateralTotals;

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface MarginCollateralEngine {
  calculate(
    request: MarginCollateralCalculationRequest,
  ): MarginCollateralCalculationResult;
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

function normalizeAsset(
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

function createAccountKey(
  exchangeId: string,
  accountId: string,
): string {
  return `${exchangeId}\u0000${accountId}`;
}

function calculateRatio(
  numerator: number,
  denominator: number,
): number | null {
  assertFiniteNumber(
    numerator,
    "numerator",
  );

  assertFiniteNumber(
    denominator,
    "denominator",
  );

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function resolvePolicy(
  policy: MarginCollateralPolicy | undefined,
): MarginCollateralPolicy {
  const resolved =
    policy ?? {
      warningMarginUtilizationRatio: 0.7,
      criticalMarginUtilizationRatio: 0.85,
      liquidationRiskMarginUtilizationRatio: 0.95,

      warningMaintenanceCoverageRatio: 2,
      criticalMaintenanceCoverageRatio: 1.25,
      liquidationRiskMaintenanceCoverageRatio: 1,

      minimumCollateralValue: 0,
      quantityTolerance: 1e-12,
    };

  assertObject(
    resolved,
    "policy",
  );

  assertNonNegativeFiniteNumber(
    resolved.warningMarginUtilizationRatio,
    "policy.warningMarginUtilizationRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.criticalMarginUtilizationRatio,
    "policy.criticalMarginUtilizationRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.liquidationRiskMarginUtilizationRatio,
    "policy.liquidationRiskMarginUtilizationRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.warningMaintenanceCoverageRatio,
    "policy.warningMaintenanceCoverageRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.criticalMaintenanceCoverageRatio,
    "policy.criticalMaintenanceCoverageRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.liquidationRiskMaintenanceCoverageRatio,
    "policy.liquidationRiskMaintenanceCoverageRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.minimumCollateralValue,
    "policy.minimumCollateralValue",
  );

  assertNonNegativeFiniteNumber(
    resolved.quantityTolerance,
    "policy.quantityTolerance",
  );

  if (
    resolved.warningMarginUtilizationRatio >
    resolved.criticalMarginUtilizationRatio
  ) {
    throw new Error(
      "policy.warningMarginUtilizationRatio cannot exceed criticalMarginUtilizationRatio.",
    );
  }

  if (
    resolved.criticalMarginUtilizationRatio >
    resolved.liquidationRiskMarginUtilizationRatio
  ) {
    throw new Error(
      "policy.criticalMarginUtilizationRatio cannot exceed liquidationRiskMarginUtilizationRatio.",
    );
  }

  if (
    resolved.warningMaintenanceCoverageRatio <
    resolved.criticalMaintenanceCoverageRatio
  ) {
    throw new Error(
      "policy.warningMaintenanceCoverageRatio cannot be below criticalMaintenanceCoverageRatio.",
    );
  }

  if (
    resolved.criticalMaintenanceCoverageRatio <
    resolved.liquidationRiskMaintenanceCoverageRatio
  ) {
    throw new Error(
      "policy.criticalMaintenanceCoverageRatio cannot be below liquidationRiskMaintenanceCoverageRatio.",
    );
  }

  return Object.freeze({
    warningMarginUtilizationRatio:
      resolved.warningMarginUtilizationRatio,

    criticalMarginUtilizationRatio:
      resolved.criticalMarginUtilizationRatio,

    liquidationRiskMarginUtilizationRatio:
      resolved.liquidationRiskMarginUtilizationRatio,

    warningMaintenanceCoverageRatio:
      resolved.warningMaintenanceCoverageRatio,

    criticalMaintenanceCoverageRatio:
      resolved.criticalMaintenanceCoverageRatio,

    liquidationRiskMaintenanceCoverageRatio:
      resolved.liquidationRiskMaintenanceCoverageRatio,

    minimumCollateralValue:
      resolved.minimumCollateralValue,

    quantityTolerance:
      resolved.quantityTolerance,
  });
}

function classifyHealth(
  effectiveCollateralValue: number,
  marginUtilizationRatio: number | null,
  maintenanceCoverageRatio: number | null,
  hasMarginRequirement: boolean,
  policy: MarginCollateralPolicy,
): MarginHealthStatus {
  if (
    effectiveCollateralValue <
    policy.minimumCollateralValue
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (!hasMarginRequirement) {
    return "HEALTHY";
  }

  if (
    marginUtilizationRatio === null ||
    maintenanceCoverageRatio === null
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (
    marginUtilizationRatio >=
      policy.liquidationRiskMarginUtilizationRatio ||
    maintenanceCoverageRatio <=
      policy.liquidationRiskMaintenanceCoverageRatio
  ) {
    return "LIQUIDATION_RISK";
  }

  if (
    marginUtilizationRatio >=
      policy.criticalMarginUtilizationRatio ||
    maintenanceCoverageRatio <=
      policy.criticalMaintenanceCoverageRatio
  ) {
    return "CRITICAL";
  }

  if (
    marginUtilizationRatio >=
      policy.warningMarginUtilizationRatio ||
    maintenanceCoverageRatio <=
      policy.warningMaintenanceCoverageRatio
  ) {
    return "WARNING";
  }

  return "HEALTHY";
}

function createCollateralContribution(
  collateral: LivePortfolioCollateral,
): MarginCollateralAssetContribution {
  assertNonEmptyString(
    collateral.exchangeId,
    "collateral.exchangeId",
  );

  assertNonEmptyString(
    collateral.accountId,
    "collateral.accountId",
  );

  assertNonEmptyString(
    collateral.asset,
    "collateral.asset",
  );

  assertNonNegativeFiniteNumber(
    collateral.totalQuantity,
    "collateral.totalQuantity",
  );

  assertNonNegativeFiniteNumber(
    collateral.availableQuantity,
    "collateral.availableQuantity",
  );

  assertNonNegativeFiniteNumber(
    collateral.lockedQuantity,
    "collateral.lockedQuantity",
  );

  if (collateral.collateralPrice !== null) {
    assertNonNegativeFiniteNumber(
      collateral.collateralPrice,
      "collateral.collateralPrice",
    );
  }

  if (collateral.collateralValue !== null) {
    assertNonNegativeFiniteNumber(
      collateral.collateralValue,
      "collateral.collateralValue",
    );
  }

  assertNonNegativeFiniteNumber(
    collateral.collateralWeight,
    "collateral.collateralWeight",
  );

  if (
    collateral.weightedCollateralValue !== null
  ) {
    assertNonNegativeFiniteNumber(
      collateral.weightedCollateralValue,
      "collateral.weightedCollateralValue",
    );
  }

  assertNonNegativeFiniteNumber(
    collateral.initialMarginContribution,
    "collateral.initialMarginContribution",
  );

  assertNonNegativeFiniteNumber(
    collateral.maintenanceMarginContribution,
    "collateral.maintenanceMarginContribution",
  );

  assertNonNegativeFiniteNumber(
    collateral.capturedAt,
    "collateral.capturedAt",
  );

  if (
    collateral.availableQuantity +
      collateral.lockedQuantity >
    collateral.totalQuantity +
      Number.EPSILON
  ) {
    throw new Error(
      "collateral available and locked quantities cannot exceed total quantity.",
    );
  }

  return Object.freeze({
    exchangeId:
      normalizeIdentifier(
        collateral.exchangeId,
        "collateral.exchangeId",
      ),

    accountId:
      normalizeIdentifier(
        collateral.accountId,
        "collateral.accountId",
      ),

    asset:
      normalizeAsset(
        collateral.asset,
        "collateral.asset",
      ),

    totalQuantity:
      collateral.totalQuantity,

    availableQuantity:
      collateral.availableQuantity,

    lockedQuantity:
      collateral.lockedQuantity,

    collateralPrice:
      collateral.collateralPrice,

    collateralValue:
      collateral.collateralValue,

    collateralWeight:
      collateral.collateralWeight,

    weightedCollateralValue:
      collateral.weightedCollateralValue,

    initialMarginContribution:
      collateral.initialMarginContribution,

    maintenanceMarginContribution:
      collateral.maintenanceMarginContribution,

    capturedAt:
      collateral.capturedAt,

    metadata:
      freezeMetadata(
        collateral.metadata,
      ),
  });
}

function createPositionContribution(
  position: LivePortfolioPosition,
): MarginCollateralPositionContribution {
  const grossNotional =
    Math.abs(
      position.markNotional ??
      position.entryNotional,
    );

  return Object.freeze({
    positionId:
      position.positionId,

    exchangeId:
      position.exchangeId,

    accountId:
      position.accountId,

    symbol:
      position.symbol,

    marginMode:
      position.marginMode,

    grossNotional,

    initialMargin:
      position.initialMargin,

    maintenanceMargin:
      position.maintenanceMargin,

    isolatedMargin:
      position.isolatedMargin ?? 0,

    allocatedCollateral:
      position.collateralAllocated,

    unrealizedPnl:
      position.unrealizedPnl,

    liquidationPrice:
      position.liquidationPrice,

    markPrice:
      position.markPrice,

    metadata:
      freezeMetadata(
        position.metadata,
      ),
  });
}

function buildAccountResult(
  exchangeId: string,
  accountId: string,
  collateral: readonly MarginCollateralAssetContribution[],
  positions: readonly MarginCollateralPositionContribution[],
  policy: MarginCollateralPolicy,
): MarginCollateralAccountResult {
  let grossCollateralValue = 0;
  let weightedCollateralValue = 0;
  let valuedCollateralAssetCount = 0;

  let collateralInitialMarginContribution = 0;
  let collateralMaintenanceMarginContribution = 0;

  let positionInitialMarginRequirement = 0;
  let positionMaintenanceMarginRequirement = 0;

  let isolatedMargin = 0;
  let allocatedCollateral = 0;

  let unrealizedPnl = 0;
  let grossPositionNotional = 0;

  for (const item of collateral) {
    if (item.collateralValue !== null) {
      grossCollateralValue +=
        item.collateralValue;
    }

    if (
      item.weightedCollateralValue !== null
    ) {
      weightedCollateralValue +=
        item.weightedCollateralValue;

      valuedCollateralAssetCount += 1;
    }

    collateralInitialMarginContribution +=
      item.initialMarginContribution;

    collateralMaintenanceMarginContribution +=
      item.maintenanceMarginContribution;
  }

  for (const position of positions) {
    positionInitialMarginRequirement +=
      position.initialMargin;

    positionMaintenanceMarginRequirement +=
      position.maintenanceMargin;

    isolatedMargin +=
      position.isolatedMargin;

    allocatedCollateral +=
      position.allocatedCollateral;

    unrealizedPnl +=
      position.unrealizedPnl;

    grossPositionNotional +=
      position.grossNotional;
  }

  const effectiveCollateralValue =
    weightedCollateralValue;

  const initialMarginRequirement =
    Math.max(
      positionInitialMarginRequirement,
      collateralInitialMarginContribution,
    );

  const maintenanceMarginRequirement =
    Math.max(
      positionMaintenanceMarginRequirement,
      collateralMaintenanceMarginContribution,
    );

  const adjustedEquity =
    effectiveCollateralValue +
    unrealizedPnl;

  const availableMargin =
    adjustedEquity -
    initialMarginRequirement;

  const netLeverage =
    calculateRatio(
      grossPositionNotional,
      adjustedEquity,
    );

  const marginUtilizationRatio =
    calculateRatio(
      initialMarginRequirement,
      adjustedEquity,
    );

  const maintenanceCoverageRatio =
    maintenanceMarginRequirement === 0
      ? positions.length === 0
        ? null
        : Number.POSITIVE_INFINITY
      : calculateRatio(
          adjustedEquity,
          maintenanceMarginRequirement,
        );

  const freeCollateralRatio =
    calculateRatio(
      availableMargin,
      adjustedEquity,
    );

  const hasMarginRequirement =
    initialMarginRequirement >
      policy.quantityTolerance ||
    maintenanceMarginRequirement >
      policy.quantityTolerance;

  const healthStatus =
    classifyHealth(
      effectiveCollateralValue,
      marginUtilizationRatio,
      maintenanceCoverageRatio,
      hasMarginRequirement,
      policy,
    );

  return Object.freeze({
    exchangeId,
    accountId,

    collateralAssetCount:
      collateral.length,

    positionCount:
      positions.length,

    grossCollateralValue,
    weightedCollateralValue,
    effectiveCollateralValue,

    collateralInitialMarginContribution,
    collateralMaintenanceMarginContribution,

    positionInitialMarginRequirement,
    positionMaintenanceMarginRequirement,

    initialMarginRequirement,
    maintenanceMarginRequirement,
    isolatedMargin,
    allocatedCollateral,

    unrealizedPnl,
    adjustedEquity,
    availableMargin,

    grossPositionNotional,
    netLeverage,

    marginUtilizationRatio,
    maintenanceCoverageRatio,
    freeCollateralRatio,

    healthStatus,

    collateral:
      Object.freeze(
        [...collateral],
      ),

    positions:
      Object.freeze(
        [...positions],
      ),

    metadata:
      freezeMetadata({
        collateralAssetCount:
          collateral.length,

        valuedCollateralAssetCount,

        positionCount:
          positions.length,

        healthStatus,
      }),
  });
}

function sortAccountResults(
  accounts: readonly MarginCollateralAccountResult[],
): readonly MarginCollateralAccountResult[] {
  return Object.freeze(
    [...accounts].sort(
      (left, right) => {
        const exchangeComparison =
          left.exchangeId.localeCompare(
            right.exchangeId,
          );

        if (exchangeComparison !== 0) {
          return exchangeComparison;
        }

        return left.accountId.localeCompare(
          right.accountId,
        );
      },
    ),
  );
}

function calculateTotals(
  accounts: readonly MarginCollateralAccountResult[],
  policy: MarginCollateralPolicy,
): MarginCollateralTotals {
  let healthyAccountCount = 0;
  let warningAccountCount = 0;
  let criticalAccountCount = 0;
  let liquidationRiskAccountCount = 0;
  let insufficientDataAccountCount = 0;

  let grossCollateralValue = 0;
  let weightedCollateralValue = 0;
  let effectiveCollateralValue = 0;

  let collateralInitialMarginContribution = 0;
  let collateralMaintenanceMarginContribution = 0;

  let positionInitialMarginRequirement = 0;
  let positionMaintenanceMarginRequirement = 0;

  let initialMarginRequirement = 0;
  let maintenanceMarginRequirement = 0;
  let isolatedMargin = 0;
  let allocatedCollateral = 0;

  let unrealizedPnl = 0;
  let adjustedEquity = 0;
  let availableMargin = 0;

  let grossPositionNotional = 0;

  for (const account of accounts) {
    switch (account.healthStatus) {
      case "HEALTHY":
        healthyAccountCount += 1;
        break;

      case "WARNING":
        warningAccountCount += 1;
        break;

      case "CRITICAL":
        criticalAccountCount += 1;
        break;

      case "LIQUIDATION_RISK":
        liquidationRiskAccountCount += 1;
        break;

      case "INSUFFICIENT_DATA":
        insufficientDataAccountCount += 1;
        break;
    }

    grossCollateralValue +=
      account.grossCollateralValue;

    weightedCollateralValue +=
      account.weightedCollateralValue;

    effectiveCollateralValue +=
      account.effectiveCollateralValue;

    collateralInitialMarginContribution +=
      account.collateralInitialMarginContribution;

    collateralMaintenanceMarginContribution +=
      account.collateralMaintenanceMarginContribution;

    positionInitialMarginRequirement +=
      account.positionInitialMarginRequirement;

    positionMaintenanceMarginRequirement +=
      account.positionMaintenanceMarginRequirement;

    initialMarginRequirement +=
      account.initialMarginRequirement;

    maintenanceMarginRequirement +=
      account.maintenanceMarginRequirement;

    isolatedMargin +=
      account.isolatedMargin;

    allocatedCollateral +=
      account.allocatedCollateral;

    unrealizedPnl +=
      account.unrealizedPnl;

    adjustedEquity +=
      account.adjustedEquity;

    availableMargin +=
      account.availableMargin;

    grossPositionNotional +=
      account.grossPositionNotional;
  }

  const netLeverage =
    calculateRatio(
      grossPositionNotional,
      adjustedEquity,
    );

  const marginUtilizationRatio =
    calculateRatio(
      initialMarginRequirement,
      adjustedEquity,
    );

  const maintenanceCoverageRatio =
    maintenanceMarginRequirement === 0
      ? accounts.length === 0
        ? null
        : Number.POSITIVE_INFINITY
      : calculateRatio(
          adjustedEquity,
          maintenanceMarginRequirement,
        );

  const freeCollateralRatio =
    calculateRatio(
      availableMargin,
      adjustedEquity,
    );

  const hasMarginRequirement =
    initialMarginRequirement >
      policy.quantityTolerance ||
    maintenanceMarginRequirement >
      policy.quantityTolerance;

  const healthStatus =
    classifyHealth(
      effectiveCollateralValue,
      marginUtilizationRatio,
      maintenanceCoverageRatio,
      hasMarginRequirement,
      policy,
    );

  return Object.freeze({
    accountCount:
      accounts.length,

    healthyAccountCount,
    warningAccountCount,
    criticalAccountCount,
    liquidationRiskAccountCount,
    insufficientDataAccountCount,

    grossCollateralValue,
    weightedCollateralValue,
    effectiveCollateralValue,

    collateralInitialMarginContribution,
    collateralMaintenanceMarginContribution,

    positionInitialMarginRequirement,
    positionMaintenanceMarginRequirement,

    initialMarginRequirement,
    maintenanceMarginRequirement,
    isolatedMargin,
    allocatedCollateral,

    unrealizedPnl,
    adjustedEquity,
    availableMargin,

    grossPositionNotional,
    netLeverage,

    marginUtilizationRatio,
    maintenanceCoverageRatio,
    freeCollateralRatio,

    healthStatus,
  });
}

export class DeterministicMarginCollateralEngine
implements MarginCollateralEngine {
  public calculate(
    request: MarginCollateralCalculationRequest,
  ): MarginCollateralCalculationResult {
    assertObject(
      request,
      "request",
    );

    assertObject(
      request.portfolio,
      "request.portfolio",
    );

    assertObject(
      request.portfolio.identity,
      "request.portfolio.identity",
    );

    const portfolioId =
      normalizeIdentifier(
        request.portfolio.identity.portfolioId,
        "request.portfolio.identity.portfolioId",
      );

    const reportingCurrency =
      normalizeAsset(
        request.portfolio.identity.reportingCurrency,
        "request.portfolio.identity.reportingCurrency",
      );

    assertNonNegativeFiniteNumber(
      request.calculatedAt,
      "request.calculatedAt",
    );

    assertPositiveInteger(
      request.sequence,
      "request.sequence",
    );

    if (
      request.calculatedAt <
      request.portfolio.updatedAt
    ) {
      throw new Error(
        "request.calculatedAt cannot be earlier than portfolio.updatedAt.",
      );
    }

    const policy =
      resolvePolicy(
        request.policy,
      );

    const collateralByAccount =
      new Map<
        string,
        MarginCollateralAssetContribution[]
      >();

    const positionsByAccount =
      new Map<
        string,
        MarginCollateralPositionContribution[]
      >();

    const accountKeys =
      new Set<string>();

    for (
      const collateral
      of request.portfolio.collateral
    ) {
      const contribution =
        createCollateralContribution(
          collateral,
        );

      const key =
        createAccountKey(
          contribution.exchangeId,
          contribution.accountId,
        );

      accountKeys.add(key);

      const values =
        collateralByAccount.get(key) ??
        [];

      values.push(
        contribution,
      );

      collateralByAccount.set(
        key,
        values,
      );
    }

    for (
      const position
      of request.portfolio.positions
    ) {
      const contribution =
        createPositionContribution(
          position,
        );

      const key =
        createAccountKey(
          contribution.exchangeId,
          contribution.accountId,
        );

      accountKeys.add(key);

      const values =
        positionsByAccount.get(key) ??
        [];

      values.push(
        contribution,
      );

      positionsByAccount.set(
        key,
        values,
      );
    }

    for (
      const account
      of request.portfolio.exchangeAccounts
    ) {
      accountKeys.add(
        createAccountKey(
          account.exchangeId,
          account.accountId,
        ),
      );
    }

    const accounts =
      sortAccountResults(
        Array.from(accountKeys)
          .sort()
          .map(key => {
            const separatorIndex =
              key.indexOf("\u0000");

            if (separatorIndex < 0) {
              throw new Error(
                `Invalid account key "${key}".`,
              );
            }

            const exchangeId =
              key.slice(
                0,
                separatorIndex,
              );

            const accountId =
              key.slice(
                separatorIndex + 1,
              );

            const collateral =
              collateralByAccount.get(key) ??
              [];

            const positions =
              positionsByAccount.get(key) ??
              [];

            return buildAccountResult(
              exchangeId,
              accountId,
              Object.freeze(
                [...collateral].sort(
                  (left, right) =>
                    left.asset.localeCompare(
                      right.asset,
                    ),
                ),
              ),
              Object.freeze(
                [...positions].sort(
                  (left, right) => {
                    const symbolComparison =
                      left.symbol.localeCompare(
                        right.symbol,
                      );

                    if (
                      symbolComparison !== 0
                    ) {
                      return symbolComparison;
                    }

                    return left.positionId.localeCompare(
                      right.positionId,
                    );
                  },
                ),
              ),
              policy,
            );
          }),
      );

    const totals =
      calculateTotals(
        accounts,
        policy,
      );

    return Object.freeze({
      portfolioId,
      reportingCurrency,

      accounts,
      totals,

      calculatedAt:
        request.calculatedAt,

      sequence:
        request.sequence,

      metadata:
        freezeMetadata({
          ...request.metadata,

          portfolioVersion:
            request.portfolio
              .synchronization.version,

          accountCount:
            totals.accountCount,

          grossCollateralValue:
            totals.grossCollateralValue,

          weightedCollateralValue:
            totals.weightedCollateralValue,

          effectiveCollateralValue:
            totals.effectiveCollateralValue,

          initialMarginRequirement:
            totals.initialMarginRequirement,

          maintenanceMarginRequirement:
            totals.maintenanceMarginRequirement,

          marginUtilizationRatio:
            totals.marginUtilizationRatio,

          healthStatus:
            totals.healthStatus,
        }),
    });
  }
}

export function createMarginCollateralEngine():
DeterministicMarginCollateralEngine {
  return new DeterministicMarginCollateralEngine();
}

export function createDefaultMarginCollateralPolicy():
MarginCollateralPolicy {
  return Object.freeze({
    warningMarginUtilizationRatio: 0.7,
    criticalMarginUtilizationRatio: 0.85,
    liquidationRiskMarginUtilizationRatio: 0.95,

    warningMaintenanceCoverageRatio: 2,
    criticalMaintenanceCoverageRatio: 1.25,
    liquidationRiskMaintenanceCoverageRatio: 1,

    minimumCollateralValue: 0,
    quantityTolerance: 1e-12,
  });
}

export function findMarginCollateralAccountResult(
  result: MarginCollateralCalculationResult,
  exchangeId: string,
  accountId: string,
): MarginCollateralAccountResult | null {
  assertObject(
    result,
    "result",
  );

  const normalizedExchangeId =
    normalizeIdentifier(
      exchangeId,
      "exchangeId",
    );

  const normalizedAccountId =
    normalizeIdentifier(
      accountId,
      "accountId",
    );

  return (
    result.accounts.find(
      account =>
        account.exchangeId ===
          normalizedExchangeId &&
        account.accountId ===
          normalizedAccountId,
    ) ??
    null
  );
}