/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 10: Exposure Calculator
 *
 * Provides deterministic portfolio exposure calculations across positions,
 * exchanges, accounts, symbols, and instrument types.
 */

import type {
  LivePortfolio,
  LivePortfolioInstrumentType,
  LivePortfolioMetadata,
  LivePortfolioPosition,
  LivePortfolioPositionSide,
} from "./live-portfolio";

export type ExposureHealthStatus =
  | "NORMAL"
  | "ELEVATED"
  | "HIGH"
  | "CRITICAL"
  | "INSUFFICIENT_DATA";

export interface ExposureCalculationPolicy {
  readonly elevatedGrossExposureRatio: number;
  readonly highGrossExposureRatio: number;
  readonly criticalGrossExposureRatio: number;

  readonly elevatedNetExposureRatio: number;
  readonly highNetExposureRatio: number;
  readonly criticalNetExposureRatio: number;

  readonly elevatedConcentrationRatio: number;
  readonly highConcentrationRatio: number;
  readonly criticalConcentrationRatio: number;

  readonly quantityTolerance: number;
}

export interface PositionExposureContribution {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly instrumentType: LivePortfolioInstrumentType;
  readonly side: LivePortfolioPositionSide;

  readonly quantity: number;
  readonly signedQuantity: number;

  readonly valuationPrice: number | null;
  readonly valuationNotional: number;

  readonly signedExposure: number;
  readonly absoluteExposure: number;

  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly collateralAllocated: number;

  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly fundingPnl: number;
  readonly feePnl: number;
  readonly netPnl: number;

  readonly capturedAt: number;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface ExposureBreakdownEntry {
  readonly key: string;

  readonly positionCount: number;
  readonly longPositionCount: number;
  readonly shortPositionCount: number;

  readonly longExposure: number;
  readonly shortExposure: number;

  readonly grossExposure: number;
  readonly netExposure: number;
  readonly absoluteNetExposure: number;

  readonly grossExposureRatio: number | null;
  readonly netExposureRatio: number | null;

  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly collateralAllocated: number;

  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly netPnl: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface ExposureConcentration {
  readonly largestExchangeId: string | null;
  readonly largestExchangeExposure: number;
  readonly largestExchangeRatio: number | null;

  readonly largestAccountKey: string | null;
  readonly largestAccountExposure: number;
  readonly largestAccountRatio: number | null;

  readonly largestSymbol: string | null;
  readonly largestSymbolExposure: number;
  readonly largestSymbolRatio: number | null;

  readonly largestInstrumentType: string | null;
  readonly largestInstrumentTypeExposure: number;
  readonly largestInstrumentTypeRatio: number | null;

  readonly maximumConcentrationRatio: number | null;
}

export interface ExposureTotals {
  readonly positionCount: number;
  readonly valuedPositionCount: number;
  readonly unvaluedPositionCount: number;

  readonly longPositionCount: number;
  readonly shortPositionCount: number;

  readonly longExposure: number;
  readonly shortExposure: number;

  readonly grossExposure: number;
  readonly netExposure: number;
  readonly absoluteNetExposure: number;

  readonly effectiveEquity: number;

  readonly grossExposureRatio: number | null;
  readonly netExposureRatio: number | null;
  readonly absoluteNetExposureRatio: number | null;

  readonly longExposureRatio: number | null;
  readonly shortExposureRatio: number | null;

  readonly directionalBiasRatio: number | null;
  readonly valuationCoverageRatio: number;

  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly collateralAllocated: number;

  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly fundingPnl: number;
  readonly feePnl: number;
  readonly netPnl: number;

  readonly healthStatus: ExposureHealthStatus;
}

export interface ExposureCalculationRequest {
  readonly portfolio: LivePortfolio;

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly policy?: ExposureCalculationPolicy;
  readonly metadata?: LivePortfolioMetadata;
}

export interface ExposureCalculationResult {
  readonly portfolioId: string;
  readonly reportingCurrency: string;

  readonly positions: readonly PositionExposureContribution[];

  readonly byExchange: readonly ExposureBreakdownEntry[];
  readonly byAccount: readonly ExposureBreakdownEntry[];
  readonly bySymbol: readonly ExposureBreakdownEntry[];
  readonly byInstrumentType: readonly ExposureBreakdownEntry[];

  readonly concentration: ExposureConcentration;
  readonly totals: ExposureTotals;

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface ExposureCalculator {
  calculate(
    request: ExposureCalculationRequest,
  ): ExposureCalculationResult;
}

interface MutableExposureBreakdown {
  readonly key: string;

  positionCount: number;
  longPositionCount: number;
  shortPositionCount: number;

  longExposure: number;
  shortExposure: number;

  grossExposure: number;
  netExposure: number;

  initialMargin: number;
  maintenanceMargin: number;
  collateralAllocated: number;

  unrealizedPnl: number;
  realizedPnl: number;
  netPnl: number;
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

function normalizeSymbol(
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
  policy: ExposureCalculationPolicy | undefined,
): ExposureCalculationPolicy {
  const resolved =
    policy ?? createDefaultExposureCalculationPolicy();

  assertObject(
    resolved,
    "policy",
  );

  assertNonNegativeFiniteNumber(
    resolved.elevatedGrossExposureRatio,
    "policy.elevatedGrossExposureRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.highGrossExposureRatio,
    "policy.highGrossExposureRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.criticalGrossExposureRatio,
    "policy.criticalGrossExposureRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.elevatedNetExposureRatio,
    "policy.elevatedNetExposureRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.highNetExposureRatio,
    "policy.highNetExposureRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.criticalNetExposureRatio,
    "policy.criticalNetExposureRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.elevatedConcentrationRatio,
    "policy.elevatedConcentrationRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.highConcentrationRatio,
    "policy.highConcentrationRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.criticalConcentrationRatio,
    "policy.criticalConcentrationRatio",
  );

  assertNonNegativeFiniteNumber(
    resolved.quantityTolerance,
    "policy.quantityTolerance",
  );

  if (
    resolved.elevatedGrossExposureRatio >
    resolved.highGrossExposureRatio
  ) {
    throw new Error(
      "policy.elevatedGrossExposureRatio cannot exceed highGrossExposureRatio.",
    );
  }

  if (
    resolved.highGrossExposureRatio >
    resolved.criticalGrossExposureRatio
  ) {
    throw new Error(
      "policy.highGrossExposureRatio cannot exceed criticalGrossExposureRatio.",
    );
  }

  if (
    resolved.elevatedNetExposureRatio >
    resolved.highNetExposureRatio
  ) {
    throw new Error(
      "policy.elevatedNetExposureRatio cannot exceed highNetExposureRatio.",
    );
  }

  if (
    resolved.highNetExposureRatio >
    resolved.criticalNetExposureRatio
  ) {
    throw new Error(
      "policy.highNetExposureRatio cannot exceed criticalNetExposureRatio.",
    );
  }

  if (
    resolved.elevatedConcentrationRatio >
    resolved.highConcentrationRatio
  ) {
    throw new Error(
      "policy.elevatedConcentrationRatio cannot exceed highConcentrationRatio.",
    );
  }

  if (
    resolved.highConcentrationRatio >
    resolved.criticalConcentrationRatio
  ) {
    throw new Error(
      "policy.highConcentrationRatio cannot exceed criticalConcentrationRatio.",
    );
  }

  return Object.freeze({
    elevatedGrossExposureRatio:
      resolved.elevatedGrossExposureRatio,

    highGrossExposureRatio:
      resolved.highGrossExposureRatio,

    criticalGrossExposureRatio:
      resolved.criticalGrossExposureRatio,

    elevatedNetExposureRatio:
      resolved.elevatedNetExposureRatio,

    highNetExposureRatio:
      resolved.highNetExposureRatio,

    criticalNetExposureRatio:
      resolved.criticalNetExposureRatio,

    elevatedConcentrationRatio:
      resolved.elevatedConcentrationRatio,

    highConcentrationRatio:
      resolved.highConcentrationRatio,

    criticalConcentrationRatio:
      resolved.criticalConcentrationRatio,

    quantityTolerance:
      resolved.quantityTolerance,
  });
}

function resolveValuationPrice(
  position: LivePortfolioPosition,
): number | null {
  if (
    position.markPrice !== null &&
    position.markPrice > 0
  ) {
    return position.markPrice;
  }

  if (
    position.indexPrice !== null &&
    position.indexPrice > 0
  ) {
    return position.indexPrice;
  }

  if (position.averageEntryPrice > 0) {
    return position.averageEntryPrice;
  }

  return null;
}

function resolveValuationNotional(
  position: LivePortfolioPosition,
  valuationPrice: number | null,
): number {
  if (
    position.markNotional !== null &&
    Number.isFinite(position.markNotional)
  ) {
    return Math.abs(
      position.markNotional,
    );
  }

  if (valuationPrice !== null) {
    return Math.abs(
      position.quantity *
      valuationPrice *
      position.contractMultiplier,
    );
  }

  return Math.abs(
    position.entryNotional,
  );
}

function resolveSignedExposure(
  side: LivePortfolioPositionSide,
  valuationNotional: number,
): number {
  if (side === "LONG") {
    return valuationNotional;
  }

  if (side === "SHORT") {
    return -valuationNotional;
  }

  return 0;
}

function createPositionContribution(
  position: LivePortfolioPosition,
): PositionExposureContribution {
  const positionId =
    normalizeIdentifier(
      position.positionId,
      "position.positionId",
    );

  const exchangeId =
    normalizeIdentifier(
      position.exchangeId,
      "position.exchangeId",
    );

  const accountId =
    normalizeIdentifier(
      position.accountId,
      "position.accountId",
    );

  const symbol =
    normalizeSymbol(
      position.symbol,
      "position.symbol",
    );

  assertNonNegativeFiniteNumber(
    position.quantity,
    "position.quantity",
  );

  assertFiniteNumber(
    position.signedQuantity,
    "position.signedQuantity",
  );

  assertNonNegativeFiniteNumber(
    position.averageEntryPrice,
    "position.averageEntryPrice",
  );

  assertNonNegativeFiniteNumber(
    position.contractMultiplier,
    "position.contractMultiplier",
  );

  assertNonNegativeFiniteNumber(
    position.initialMargin,
    "position.initialMargin",
  );

  assertNonNegativeFiniteNumber(
    position.maintenanceMargin,
    "position.maintenanceMargin",
  );

  assertNonNegativeFiniteNumber(
    position.collateralAllocated,
    "position.collateralAllocated",
  );

  assertFiniteNumber(
    position.unrealizedPnl,
    "position.unrealizedPnl",
  );

  assertFiniteNumber(
    position.realizedPnl,
    "position.realizedPnl",
  );

  assertFiniteNumber(
    position.fundingPnl,
    "position.fundingPnl",
  );

  assertFiniteNumber(
    position.feePnl,
    "position.feePnl",
  );

  assertFiniteNumber(
    position.netPnl,
    "position.netPnl",
  );

  assertNonNegativeFiniteNumber(
    position.capturedAt,
    "position.capturedAt",
  );

  assertNonNegativeFiniteNumber(
    position.updatedAt,
    "position.updatedAt",
  );

  if (
    position.markPrice !== null
  ) {
    assertNonNegativeFiniteNumber(
      position.markPrice,
      "position.markPrice",
    );
  }

  if (
    position.indexPrice !== null
  ) {
    assertNonNegativeFiniteNumber(
      position.indexPrice,
      "position.indexPrice",
    );
  }

  if (
    position.markNotional !== null
  ) {
    assertFiniteNumber(
      position.markNotional,
      "position.markNotional",
    );
  }

  const valuationPrice =
    resolveValuationPrice(
      position,
    );

  const valuationNotional =
    resolveValuationNotional(
      position,
      valuationPrice,
    );

  const signedExposure =
    resolveSignedExposure(
      position.side,
      valuationNotional,
    );

  return Object.freeze({
    positionId,

    exchangeId,
    accountId,

    symbol,

    exchangeSymbol:
      position.exchangeSymbol === null
        ? null
        : normalizeSymbol(
            position.exchangeSymbol,
            "position.exchangeSymbol",
          ),

    instrumentType:
      position.instrumentType,

    side:
      position.side,

    quantity:
      position.quantity,

    signedQuantity:
      position.signedQuantity,

    valuationPrice,
    valuationNotional,

    signedExposure,

    absoluteExposure:
      Math.abs(
        signedExposure,
      ),

    initialMargin:
      position.initialMargin,

    maintenanceMargin:
      position.maintenanceMargin,

    collateralAllocated:
      position.collateralAllocated,

    unrealizedPnl:
      position.unrealizedPnl,

    realizedPnl:
      position.realizedPnl,

    fundingPnl:
      position.fundingPnl,

    feePnl:
      position.feePnl,

    netPnl:
      position.netPnl,

    capturedAt:
      position.capturedAt,

    updatedAt:
      position.updatedAt,

    metadata:
      freezeMetadata(
        position.metadata,
      ),
  });
}

function createMutableBreakdown(
  key: string,
): MutableExposureBreakdown {
  return {
    key,

    positionCount: 0,
    longPositionCount: 0,
    shortPositionCount: 0,

    longExposure: 0,
    shortExposure: 0,

    grossExposure: 0,
    netExposure: 0,

    initialMargin: 0,
    maintenanceMargin: 0,
    collateralAllocated: 0,

    unrealizedPnl: 0,
    realizedPnl: 0,
    netPnl: 0,
  };
}

function addContribution(
  map: Map<string, MutableExposureBreakdown>,
  key: string,
  contribution: PositionExposureContribution,
): void {
  const entry =
    map.get(key) ??
    createMutableBreakdown(key);

  entry.positionCount += 1;

  if (contribution.side === "LONG") {
    entry.longPositionCount += 1;
    entry.longExposure +=
      contribution.absoluteExposure;
  } else if (contribution.side === "SHORT") {
    entry.shortPositionCount += 1;
    entry.shortExposure +=
      contribution.absoluteExposure;
  }

  entry.grossExposure +=
    contribution.absoluteExposure;

  entry.netExposure +=
    contribution.signedExposure;

  entry.initialMargin +=
    contribution.initialMargin;

  entry.maintenanceMargin +=
    contribution.maintenanceMargin;

  entry.collateralAllocated +=
    contribution.collateralAllocated;

  entry.unrealizedPnl +=
    contribution.unrealizedPnl;

  entry.realizedPnl +=
    contribution.realizedPnl;

  entry.netPnl +=
    contribution.netPnl;

  map.set(
    key,
    entry,
  );
}

function freezeBreakdowns(
  map: ReadonlyMap<string, MutableExposureBreakdown>,
  portfolioGrossExposure: number,
): readonly ExposureBreakdownEntry[] {
  return Object.freeze(
    Array.from(
      map.values(),
    )
      .sort(
        (left, right) =>
          left.key.localeCompare(
            right.key,
          ),
      )
      .map(entry => {
        const grossExposureRatio =
          calculateRatio(
            entry.grossExposure,
            portfolioGrossExposure,
          );

        const netExposureRatio =
          calculateRatio(
            entry.netExposure,
            portfolioGrossExposure,
          );

        return Object.freeze({
          key:
            entry.key,

          positionCount:
            entry.positionCount,

          longPositionCount:
            entry.longPositionCount,

          shortPositionCount:
            entry.shortPositionCount,

          longExposure:
            entry.longExposure,

          shortExposure:
            entry.shortExposure,

          grossExposure:
            entry.grossExposure,

          netExposure:
            entry.netExposure,

          absoluteNetExposure:
            Math.abs(
              entry.netExposure,
            ),

          grossExposureRatio,
          netExposureRatio,

          initialMargin:
            entry.initialMargin,

          maintenanceMargin:
            entry.maintenanceMargin,

          collateralAllocated:
            entry.collateralAllocated,

          unrealizedPnl:
            entry.unrealizedPnl,

          realizedPnl:
            entry.realizedPnl,

          netPnl:
            entry.netPnl,

          metadata:
            freezeMetadata({
              positionCount:
                entry.positionCount,

              longPositionCount:
                entry.longPositionCount,

              shortPositionCount:
                entry.shortPositionCount,
            }),
        });
      }),
  );
}

function findLargestEntry(
  entries: readonly ExposureBreakdownEntry[],
): ExposureBreakdownEntry | null {
  if (entries.length === 0) {
    return null;
  }

  return [...entries].sort(
    (left, right) => {
      if (
        left.grossExposure !==
        right.grossExposure
      ) {
        return (
          right.grossExposure -
          left.grossExposure
        );
      }

      return left.key.localeCompare(
        right.key,
      );
    },
  )[0] ?? null;
}

function createConcentration(
  byExchange: readonly ExposureBreakdownEntry[],
  byAccount: readonly ExposureBreakdownEntry[],
  bySymbol: readonly ExposureBreakdownEntry[],
  byInstrumentType: readonly ExposureBreakdownEntry[],
): ExposureConcentration {
  const largestExchange =
    findLargestEntry(
      byExchange,
    );

  const largestAccount =
    findLargestEntry(
      byAccount,
    );

  const largestSymbol =
    findLargestEntry(
      bySymbol,
    );

  const largestInstrumentType =
    findLargestEntry(
      byInstrumentType,
    );

  const ratios =
    [
      largestExchange?.grossExposureRatio ?? null,
      largestAccount?.grossExposureRatio ?? null,
      largestSymbol?.grossExposureRatio ?? null,
      largestInstrumentType?.grossExposureRatio ?? null,
    ].filter(
      (value): value is number =>
        value !== null,
    );

  return Object.freeze({
    largestExchangeId:
      largestExchange?.key ?? null,

    largestExchangeExposure:
      largestExchange?.grossExposure ?? 0,

    largestExchangeRatio:
      largestExchange?.grossExposureRatio ?? null,

    largestAccountKey:
      largestAccount?.key ?? null,

    largestAccountExposure:
      largestAccount?.grossExposure ?? 0,

    largestAccountRatio:
      largestAccount?.grossExposureRatio ?? null,

    largestSymbol:
      largestSymbol?.key ?? null,

    largestSymbolExposure:
      largestSymbol?.grossExposure ?? 0,

    largestSymbolRatio:
      largestSymbol?.grossExposureRatio ?? null,

    largestInstrumentType:
      largestInstrumentType?.key ?? null,

    largestInstrumentTypeExposure:
      largestInstrumentType?.grossExposure ?? 0,

    largestInstrumentTypeRatio:
      largestInstrumentType?.grossExposureRatio ?? null,

    maximumConcentrationRatio:
      ratios.length === 0
        ? null
        : Math.max(
            ...ratios,
          ),
  });
}

function classifyExposureHealth(
  grossExposureRatio: number | null,
  absoluteNetExposureRatio: number | null,
  maximumConcentrationRatio: number | null,
  policy: ExposureCalculationPolicy,
): ExposureHealthStatus {
  if (
    grossExposureRatio === null ||
    absoluteNetExposureRatio === null
  ) {
    return "INSUFFICIENT_DATA";
  }

  if (
    grossExposureRatio >=
      policy.criticalGrossExposureRatio ||
    absoluteNetExposureRatio >=
      policy.criticalNetExposureRatio ||
    (
      maximumConcentrationRatio !== null &&
      maximumConcentrationRatio >=
        policy.criticalConcentrationRatio
    )
  ) {
    return "CRITICAL";
  }

  if (
    grossExposureRatio >=
      policy.highGrossExposureRatio ||
    absoluteNetExposureRatio >=
      policy.highNetExposureRatio ||
    (
      maximumConcentrationRatio !== null &&
      maximumConcentrationRatio >=
        policy.highConcentrationRatio
    )
  ) {
    return "HIGH";
  }

  if (
    grossExposureRatio >=
      policy.elevatedGrossExposureRatio ||
    absoluteNetExposureRatio >=
      policy.elevatedNetExposureRatio ||
    (
      maximumConcentrationRatio !== null &&
      maximumConcentrationRatio >=
        policy.elevatedConcentrationRatio
    )
  ) {
    return "ELEVATED";
  }

  return "NORMAL";
}

function resolveEffectiveEquity(
  portfolio: LivePortfolio,
): number {
  assertFiniteNumber(
    portfolio.margin.marginBalance,
    "portfolio.margin.marginBalance",
  );

  return portfolio.margin.marginBalance;
}

function calculateTotals(
  positions: readonly PositionExposureContribution[],
  effectiveEquity: number,
  concentration: ExposureConcentration,
  policy: ExposureCalculationPolicy,
): ExposureTotals {
  let valuedPositionCount = 0;
  let unvaluedPositionCount = 0;

  let longPositionCount = 0;
  let shortPositionCount = 0;

  let longExposure = 0;
  let shortExposure = 0;

  let initialMargin = 0;
  let maintenanceMargin = 0;
  let collateralAllocated = 0;

  let unrealizedPnl = 0;
  let realizedPnl = 0;
  let fundingPnl = 0;
  let feePnl = 0;
  let netPnl = 0;

  for (const position of positions) {
    if (position.valuationPrice === null) {
      unvaluedPositionCount += 1;
    } else {
      valuedPositionCount += 1;
    }

    if (position.side === "LONG") {
      longPositionCount += 1;
      longExposure +=
        position.absoluteExposure;
    } else if (position.side === "SHORT") {
      shortPositionCount += 1;
      shortExposure +=
        position.absoluteExposure;
    }

    initialMargin +=
      position.initialMargin;

    maintenanceMargin +=
      position.maintenanceMargin;

    collateralAllocated +=
      position.collateralAllocated;

    unrealizedPnl +=
      position.unrealizedPnl;

    realizedPnl +=
      position.realizedPnl;

    fundingPnl +=
      position.fundingPnl;

    feePnl +=
      position.feePnl;

    netPnl +=
      position.netPnl;
  }

  const grossExposure =
    longExposure +
    shortExposure;

  const netExposure =
    longExposure -
    shortExposure;

  const absoluteNetExposure =
    Math.abs(
      netExposure,
    );

  const grossExposureRatio =
    calculateRatio(
      grossExposure,
      effectiveEquity,
    );

  const netExposureRatio =
    calculateRatio(
      netExposure,
      effectiveEquity,
    );

  const absoluteNetExposureRatio =
    calculateRatio(
      absoluteNetExposure,
      effectiveEquity,
    );

  const longExposureRatio =
    calculateRatio(
      longExposure,
      effectiveEquity,
    );

  const shortExposureRatio =
    calculateRatio(
      shortExposure,
      effectiveEquity,
    );

  const directionalBiasRatio =
    calculateRatio(
      netExposure,
      grossExposure,
    );

  const valuationCoverageRatio =
    positions.length === 0
      ? 1
      : valuedPositionCount /
        positions.length;

  return Object.freeze({
    positionCount:
      positions.length,

    valuedPositionCount,
    unvaluedPositionCount,

    longPositionCount,
    shortPositionCount,

    longExposure,
    shortExposure,

    grossExposure,
    netExposure,
    absoluteNetExposure,

    effectiveEquity,

    grossExposureRatio,
    netExposureRatio,
    absoluteNetExposureRatio,

    longExposureRatio,
    shortExposureRatio,

    directionalBiasRatio,
    valuationCoverageRatio,

    initialMargin,
    maintenanceMargin,
    collateralAllocated,

    unrealizedPnl,
    realizedPnl,
    fundingPnl,
    feePnl,
    netPnl,

    healthStatus:
      classifyExposureHealth(
        grossExposureRatio,
        absoluteNetExposureRatio,
        concentration.maximumConcentrationRatio,
        policy,
      ),
  });
}

function sortPositionContributions(
  positions: readonly PositionExposureContribution[],
): readonly PositionExposureContribution[] {
  return Object.freeze(
    [...positions].sort(
      (left, right) => {
        const exchangeComparison =
          left.exchangeId.localeCompare(
            right.exchangeId,
          );

        if (exchangeComparison !== 0) {
          return exchangeComparison;
        }

        const accountComparison =
          left.accountId.localeCompare(
            right.accountId,
          );

        if (accountComparison !== 0) {
          return accountComparison;
        }

        const symbolComparison =
          left.symbol.localeCompare(
            right.symbol,
          );

        if (symbolComparison !== 0) {
          return symbolComparison;
        }

        return left.positionId.localeCompare(
          right.positionId,
        );
      },
    ),
  );
}

export class DeterministicExposureCalculator
implements ExposureCalculator {
  public calculate(
    request: ExposureCalculationRequest,
  ): ExposureCalculationResult {
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
      normalizeSymbol(
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

    const positions =
      sortPositionContributions(
        request.portfolio.positions
          .filter(
            position =>
              position.quantity >
              policy.quantityTolerance,
          )
          .map(
            createPositionContribution,
          ),
      );

    const byExchangeMap =
      new Map<
        string,
        MutableExposureBreakdown
      >();

    const byAccountMap =
      new Map<
        string,
        MutableExposureBreakdown
      >();

    const bySymbolMap =
      new Map<
        string,
        MutableExposureBreakdown
      >();

    const byInstrumentTypeMap =
      new Map<
        string,
        MutableExposureBreakdown
      >();

    let portfolioGrossExposure = 0;

    for (const position of positions) {
      portfolioGrossExposure +=
        position.absoluteExposure;

      addContribution(
        byExchangeMap,
        position.exchangeId,
        position,
      );

      addContribution(
        byAccountMap,
        `${position.exchangeId}:${position.accountId}`,
        position,
      );

      addContribution(
        bySymbolMap,
        position.symbol,
        position,
      );

      addContribution(
        byInstrumentTypeMap,
        position.instrumentType,
        position,
      );
    }

    const byExchange =
      freezeBreakdowns(
        byExchangeMap,
        portfolioGrossExposure,
      );

    const byAccount =
      freezeBreakdowns(
        byAccountMap,
        portfolioGrossExposure,
      );

    const bySymbol =
      freezeBreakdowns(
        bySymbolMap,
        portfolioGrossExposure,
      );

    const byInstrumentType =
      freezeBreakdowns(
        byInstrumentTypeMap,
        portfolioGrossExposure,
      );

    const concentration =
      createConcentration(
        byExchange,
        byAccount,
        bySymbol,
        byInstrumentType,
      );

    const effectiveEquity =
      resolveEffectiveEquity(
        request.portfolio,
      );

    const totals =
      calculateTotals(
        positions,
        effectiveEquity,
        concentration,
        policy,
      );

    return Object.freeze({
      portfolioId,
      reportingCurrency,

      positions,

      byExchange,
      byAccount,
      bySymbol,
      byInstrumentType,

      concentration,
      totals,

      calculatedAt:
        request.calculatedAt,

      sequence:
        request.sequence,

      metadata:
        freezeMetadata({
          ...request.metadata,

          portfolioVersion:
            request.portfolio.version,

          positionCount:
            totals.positionCount,

          valuedPositionCount:
            totals.valuedPositionCount,

          unvaluedPositionCount:
            totals.unvaluedPositionCount,

          grossExposure:
            totals.grossExposure,

          netExposure:
            totals.netExposure,

          effectiveEquity:
            totals.effectiveEquity,

          valuationCoverageRatio:
            totals.valuationCoverageRatio,

          maximumConcentrationRatio:
            concentration.maximumConcentrationRatio,

          healthStatus:
            totals.healthStatus,
        }),
    });
  }
}

export function createExposureCalculator():
DeterministicExposureCalculator {
  return new DeterministicExposureCalculator();
}

export function createDefaultExposureCalculationPolicy():
ExposureCalculationPolicy {
  return Object.freeze({
    elevatedGrossExposureRatio: 1.5,
    highGrossExposureRatio: 2.5,
    criticalGrossExposureRatio: 4,

    elevatedNetExposureRatio: 0.75,
    highNetExposureRatio: 1.25,
    criticalNetExposureRatio: 2,

    elevatedConcentrationRatio: 0.35,
    highConcentrationRatio: 0.5,
    criticalConcentrationRatio: 0.7,

    quantityTolerance: 1e-12,
  });
}

export function findExposureByExchange(
  result: ExposureCalculationResult,
  exchangeId: string,
): ExposureBreakdownEntry | null {
  assertObject(
    result,
    "result",
  );

  const normalizedExchangeId =
    normalizeIdentifier(
      exchangeId,
      "exchangeId",
    );

  return (
    result.byExchange.find(
      entry =>
        entry.key ===
        normalizedExchangeId,
    ) ??
    null
  );
}

export function findExposureByAccount(
  result: ExposureCalculationResult,
  exchangeId: string,
  accountId: string,
): ExposureBreakdownEntry | null {
  assertObject(
    result,
    "result",
  );

  const key =
    `${normalizeIdentifier(
      exchangeId,
      "exchangeId",
    )}:${normalizeIdentifier(
      accountId,
      "accountId",
    )}`;

  return (
    result.byAccount.find(
      entry =>
        entry.key === key,
    ) ??
    null
  );
}

export function findExposureBySymbol(
  result: ExposureCalculationResult,
  symbol: string,
): ExposureBreakdownEntry | null {
  assertObject(
    result,
    "result",
  );

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
      "symbol",
    );

  return (
    result.bySymbol.find(
      entry =>
        entry.key ===
        normalizedSymbol,
    ) ??
    null
  );
}

export function findExposureByInstrumentType(
  result: ExposureCalculationResult,
  instrumentType: LivePortfolioInstrumentType,
): ExposureBreakdownEntry | null {
  assertObject(
    result,
    "result",
  );

  return (
    result.byInstrumentType.find(
      entry =>
        entry.key ===
        instrumentType,
    ) ??
    null
  );
}