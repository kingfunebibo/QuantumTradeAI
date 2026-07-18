/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 7: Real-Time Unrealized PnL Engine
 *
 * Calculates deterministic unrealized profit and loss for normalized live
 * positions using caller-supplied market prices. The engine never reads the
 * system clock and never generates random identifiers.
 */

import type {
  LivePortfolioInstrumentType,
  LivePortfolioMetadata,
  LivePortfolioPositionSide,
} from "./live-portfolio";

import type {
  PositionSnapshot,
  PositionSnapshotEntry,
} from "./position-snapshot";

export type UnrealizedPnlPriceSource =
  | "MARK"
  | "INDEX"
  | "LAST"
  | "EXPLICIT";

export type UnrealizedPnlPositionStatus =
  | "CALCULATED"
  | "UNCHANGED"
  | "MISSING_PRICE"
  | "STALE_PRICE"
  | "ZERO_QUANTITY";

export interface UnrealizedPnlMarketPrice {
  readonly exchangeId: string | null;
  readonly symbol: string;

  readonly price: number;
  readonly source: UnrealizedPnlPriceSource;

  readonly capturedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface UnrealizedPnlCalculationPolicy {
  /**
   * Maximum allowed market-price age relative to calculatedAt.
   */
  readonly maximumPriceAgeMs: number;

  /**
   * Whether a price associated with a particular exchange may be used for a
   * position belonging to another exchange.
   */
  readonly allowCrossExchangePrices: boolean;

  /**
   * Whether the position snapshot mark price may be used when no explicit
   * market-price record is supplied.
   */
  readonly allowSnapshotMarkPriceFallback: boolean;

  /**
   * Whether the position snapshot index price may be used when neither an
   * explicit price nor a mark price is available.
   */
  readonly allowSnapshotIndexPriceFallback: boolean;

  /**
   * When true, stale prices cause an exception instead of producing a
   * STALE_PRICE result.
   */
  readonly rejectStalePrices: boolean;

  /**
   * When true, missing prices cause an exception instead of producing a
   * MISSING_PRICE result.
   */
  readonly rejectMissingPrices: boolean;
}

export interface UnrealizedPnlCalculationRequest {
  readonly portfolioId: string;
  readonly synchronizationId: string;

  readonly positionSnapshot: PositionSnapshot;
  readonly marketPrices: readonly UnrealizedPnlMarketPrice[];

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly policy?: UnrealizedPnlCalculationPolicy;
  readonly metadata?: LivePortfolioMetadata;
}

export interface PositionUnrealizedPnlResult {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly instrumentType: LivePortfolioInstrumentType;
  readonly side: LivePortfolioPositionSide;

  readonly quantity: number;
  readonly signedQuantity: number;

  readonly averageEntryPrice: number;
  readonly valuationPrice: number | null;
  readonly valuationPriceSource: UnrealizedPnlPriceSource | null;

  readonly contractMultiplier: number;

  readonly entryNotional: number;
  readonly valuationNotional: number | null;

  readonly previousUnrealizedPnl: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlChange: number;

  readonly returnOnEntryNotional: number | null;
  readonly returnOnAllocatedCollateral: number | null;

  readonly priceCapturedAt: number | null;
  readonly priceAgeMs: number | null;

  readonly status: UnrealizedPnlPositionStatus;

  readonly calculatedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

export interface UnrealizedPnlTotals {
  readonly positionCount: number;
  readonly calculatedPositionCount: number;
  readonly unchangedPositionCount: number;
  readonly missingPricePositionCount: number;
  readonly stalePricePositionCount: number;
  readonly zeroQuantityPositionCount: number;

  readonly longUnrealizedPnl: number;
  readonly shortUnrealizedPnl: number;
  readonly totalUnrealizedPnl: number;
  readonly totalPreviousUnrealizedPnl: number;
  readonly totalUnrealizedPnlChange: number;

  readonly grossEntryNotional: number;
  readonly grossValuationNotional: number;

  readonly winningPositionCount: number;
  readonly losingPositionCount: number;
  readonly flatPositionCount: number;

  readonly valuationCoverageRatio: number;
}

export interface UnrealizedPnlCalculationResult {
  readonly portfolioId: string;
  readonly synchronizationId: string;

  readonly exchangeId: string;
  readonly accountId: string;
  readonly reportingCurrency: string;

  readonly positions: readonly PositionUnrealizedPnlResult[];
  readonly totals: UnrealizedPnlTotals;

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface RealTimeUnrealizedPnlEngine {
  calculate(
    request: UnrealizedPnlCalculationRequest,
  ): UnrealizedPnlCalculationResult;
}

interface ResolvedValuationPrice {
  readonly price: number;
  readonly source: UnrealizedPnlPriceSource;
  readonly capturedAt: number;
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
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertFiniteNumber(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
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

function assertPositiveFiniteNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive finite number.`,
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
    throw new Error(`${field} must be a positive integer.`);
  }
}

function normalizeIdentifier(
  value: string,
  field: string,
): string {
  assertNonEmptyString(value, field);

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

function createPriceKey(
  exchangeId: string | null,
  symbol: string,
): string {
  return `${exchangeId ?? "*"}\u0000${symbol}`;
}

function createExactPriceKey(
  exchangeId: string,
  symbol: string,
): string {
  return createPriceKey(
    exchangeId,
    symbol,
  );
}

function createGlobalPriceKey(
  symbol: string,
): string {
  return createPriceKey(
    null,
    symbol,
  );
}

function validateMarketPrice(
  marketPrice: UnrealizedPnlMarketPrice,
  index: number,
): UnrealizedPnlMarketPrice {
  assertObject(
    marketPrice,
    `marketPrices[${index}]`,
  );

  const exchangeId =
    marketPrice.exchangeId === null
      ? null
      : normalizeIdentifier(
          marketPrice.exchangeId,
          `marketPrices[${index}].exchangeId`,
        );

  const symbol =
    normalizeSymbol(
      marketPrice.symbol,
      `marketPrices[${index}].symbol`,
    );

  assertPositiveFiniteNumber(
    marketPrice.price,
    `marketPrices[${index}].price`,
  );

  assertNonNegativeFiniteNumber(
    marketPrice.capturedAt,
    `marketPrices[${index}].capturedAt`,
  );

  assertPositiveInteger(
    marketPrice.sequence,
    `marketPrices[${index}].sequence`,
  );

  return Object.freeze({
    exchangeId,
    symbol,

    price:
      marketPrice.price,

    source:
      marketPrice.source,

    capturedAt:
      marketPrice.capturedAt,

    sequence:
      marketPrice.sequence,

    metadata:
      freezeMetadata(
        marketPrice.metadata,
      ),
  });
}

function buildMarketPriceMap(
  marketPrices: readonly UnrealizedPnlMarketPrice[],
): ReadonlyMap<string, UnrealizedPnlMarketPrice> {
  const result =
    new Map<string, UnrealizedPnlMarketPrice>();

  marketPrices.forEach(
    (marketPrice, index) => {
      const normalized =
        validateMarketPrice(
          marketPrice,
          index,
        );

      const key =
        createPriceKey(
          normalized.exchangeId,
          normalized.symbol,
        );

      const existing =
        result.get(key);

      if (
        existing !== undefined &&
        existing.sequence === normalized.sequence
      ) {
        throw new Error(
          `Duplicate market-price sequence detected for key "${key}".`,
        );
      }

      if (
        existing === undefined ||
        normalized.sequence > existing.sequence
      ) {
        result.set(
          key,
          normalized,
        );
      }
    },
  );

  return result;
}

function resolvePolicy(
  policy:
    UnrealizedPnlCalculationPolicy | undefined,
): UnrealizedPnlCalculationPolicy {
  const resolved =
    policy ?? {
      maximumPriceAgeMs: 30_000,
      allowCrossExchangePrices: false,
      allowSnapshotMarkPriceFallback: true,
      allowSnapshotIndexPriceFallback: true,
      rejectStalePrices: false,
      rejectMissingPrices: false,
    };

  assertObject(
    resolved,
    "policy",
  );

  assertNonNegativeFiniteNumber(
    resolved.maximumPriceAgeMs,
    "policy.maximumPriceAgeMs",
  );

  return Object.freeze({
    maximumPriceAgeMs:
      resolved.maximumPriceAgeMs,

    allowCrossExchangePrices:
      resolved.allowCrossExchangePrices,

    allowSnapshotMarkPriceFallback:
      resolved.allowSnapshotMarkPriceFallback,

    allowSnapshotIndexPriceFallback:
      resolved.allowSnapshotIndexPriceFallback,

    rejectStalePrices:
      resolved.rejectStalePrices,

    rejectMissingPrices:
      resolved.rejectMissingPrices,
  });
}

function resolveValuationPrice(
  position: PositionSnapshotEntry,
  priceMap: ReadonlyMap<string, UnrealizedPnlMarketPrice>,
  policy: UnrealizedPnlCalculationPolicy,
): ResolvedValuationPrice | null {
  const exactPrice =
    priceMap.get(
      createExactPriceKey(
        position.exchangeId,
        position.symbol,
      ),
    );

  if (exactPrice !== undefined) {
    return Object.freeze({
      price:
        exactPrice.price,

      source:
        exactPrice.source,

      capturedAt:
        exactPrice.capturedAt,
    });
  }

  if (policy.allowCrossExchangePrices) {
    const globalPrice =
      priceMap.get(
        createGlobalPriceKey(
          position.symbol,
        ),
      );

    if (globalPrice !== undefined) {
      return Object.freeze({
        price:
          globalPrice.price,

        source:
          globalPrice.source,

        capturedAt:
          globalPrice.capturedAt,
      });
    }
  }

  if (
    policy.allowSnapshotMarkPriceFallback &&
    position.markPrice !== null
  ) {
    return Object.freeze({
      price:
        position.markPrice,

      source:
        "MARK",

      capturedAt:
        position.capturedAt,
    });
  }

  if (
    policy.allowSnapshotIndexPriceFallback &&
    position.indexPrice !== null
  ) {
    return Object.freeze({
      price:
        position.indexPrice,

      source:
        "INDEX",

      capturedAt:
        position.capturedAt,
    });
  }

  return null;
}

function calculateUnrealizedPnl(
  position: PositionSnapshotEntry,
  valuationPrice: number,
): number {
  const priceDifference =
    position.side === "LONG"
      ? valuationPrice -
        position.averageEntryPrice
      : position.averageEntryPrice -
        valuationPrice;

  return (
    priceDifference *
    position.quantity *
    position.contractMultiplier
  );
}

function calculateValuationNotional(
  position: PositionSnapshotEntry,
  valuationPrice: number,
): number {
  return (
    position.quantity *
    valuationPrice *
    position.contractMultiplier
  );
}

function createMissingPriceResult(
  position: PositionSnapshotEntry,
  calculatedAt: number,
): PositionUnrealizedPnlResult {
  return Object.freeze({
    positionId:
      position.positionId,

    exchangeId:
      position.exchangeId,

    accountId:
      position.accountId,

    symbol:
      position.symbol,

    instrumentType:
      position.instrumentType,

    side:
      position.side,

    quantity:
      position.quantity,

    signedQuantity:
      position.signedQuantity,

    averageEntryPrice:
      position.averageEntryPrice,

    valuationPrice:
      null,

    valuationPriceSource:
      null,

    contractMultiplier:
      position.contractMultiplier,

    entryNotional:
      position.entryNotional,

    valuationNotional:
      null,

    previousUnrealizedPnl:
      position.unrealizedPnl,

    unrealizedPnl:
      position.unrealizedPnl,

    unrealizedPnlChange:
      0,

    returnOnEntryNotional:
      calculateRatio(
        position.unrealizedPnl,
        position.entryNotional,
      ),

    returnOnAllocatedCollateral:
      calculateRatio(
        position.unrealizedPnl,
        position.collateralAllocated,
      ),

    priceCapturedAt:
      null,

    priceAgeMs:
      null,

    status:
      "MISSING_PRICE",

    calculatedAt,

    metadata:
      freezeMetadata({
        reason:
          "No eligible valuation price was available.",
      }),
  });
}

function createZeroQuantityResult(
  position: PositionSnapshotEntry,
  calculatedAt: number,
): PositionUnrealizedPnlResult {
  return Object.freeze({
    positionId:
      position.positionId,

    exchangeId:
      position.exchangeId,

    accountId:
      position.accountId,

    symbol:
      position.symbol,

    instrumentType:
      position.instrumentType,

    side:
      position.side,

    quantity:
      position.quantity,

    signedQuantity:
      position.signedQuantity,

    averageEntryPrice:
      position.averageEntryPrice,

    valuationPrice:
      position.markPrice,

    valuationPriceSource:
      position.markPrice === null
        ? null
        : "MARK",

    contractMultiplier:
      position.contractMultiplier,

    entryNotional:
      position.entryNotional,

    valuationNotional:
      position.markPrice === null
        ? null
        : 0,

    previousUnrealizedPnl:
      position.unrealizedPnl,

    unrealizedPnl:
      0,

    unrealizedPnlChange:
      -position.unrealizedPnl,

    returnOnEntryNotional:
      null,

    returnOnAllocatedCollateral:
      null,

    priceCapturedAt:
      position.markPrice === null
        ? null
        : position.capturedAt,

    priceAgeMs:
      position.markPrice === null
        ? null
        : Math.max(
            0,
            calculatedAt -
              position.capturedAt,
          ),

    status:
      "ZERO_QUANTITY",

    calculatedAt,

    metadata:
      freezeMetadata({
        reason:
          "Position quantity is zero.",
      }),
  });
}

function calculatePositionResult(
  position: PositionSnapshotEntry,
  priceMap: ReadonlyMap<string, UnrealizedPnlMarketPrice>,
  policy: UnrealizedPnlCalculationPolicy,
  calculatedAt: number,
): PositionUnrealizedPnlResult {
  if (position.quantity === 0) {
    return createZeroQuantityResult(
      position,
      calculatedAt,
    );
  }

  const resolvedPrice =
    resolveValuationPrice(
      position,
      priceMap,
      policy,
    );

  if (resolvedPrice === null) {
    if (policy.rejectMissingPrices) {
      throw new Error(
        `No valuation price is available for position "${position.positionId}".`,
      );
    }

    return createMissingPriceResult(
      position,
      calculatedAt,
    );
  }

  if (
    resolvedPrice.capturedAt >
    calculatedAt
  ) {
    throw new Error(
      `Valuation price for position "${position.positionId}" was captured after calculatedAt.`,
    );
  }

  const priceAgeMs =
    calculatedAt -
    resolvedPrice.capturedAt;

  const isStale =
    priceAgeMs >
    policy.maximumPriceAgeMs;

  if (
    isStale &&
    policy.rejectStalePrices
  ) {
    throw new Error(
      `Valuation price for position "${position.positionId}" is stale.`,
    );
  }

  const unrealizedPnl =
    calculateUnrealizedPnl(
      position,
      resolvedPrice.price,
    );

  const valuationNotional =
    calculateValuationNotional(
      position,
      resolvedPrice.price,
    );

  const unrealizedPnlChange =
    unrealizedPnl -
    position.unrealizedPnl;

  const status:
    UnrealizedPnlPositionStatus =
      isStale
        ? "STALE_PRICE"
        : Math.abs(
              unrealizedPnlChange,
            ) <= Number.EPSILON
          ? "UNCHANGED"
          : "CALCULATED";

  return Object.freeze({
    positionId:
      position.positionId,

    exchangeId:
      position.exchangeId,

    accountId:
      position.accountId,

    symbol:
      position.symbol,

    instrumentType:
      position.instrumentType,

    side:
      position.side,

    quantity:
      position.quantity,

    signedQuantity:
      position.signedQuantity,

    averageEntryPrice:
      position.averageEntryPrice,

    valuationPrice:
      resolvedPrice.price,

    valuationPriceSource:
      resolvedPrice.source,

    contractMultiplier:
      position.contractMultiplier,

    entryNotional:
      position.entryNotional,

    valuationNotional,

    previousUnrealizedPnl:
      position.unrealizedPnl,

    unrealizedPnl,

    unrealizedPnlChange,

    returnOnEntryNotional:
      calculateRatio(
        unrealizedPnl,
        position.entryNotional,
      ),

    returnOnAllocatedCollateral:
      calculateRatio(
        unrealizedPnl,
        position.collateralAllocated,
      ),

    priceCapturedAt:
      resolvedPrice.capturedAt,

    priceAgeMs,

    status,

    calculatedAt,

    metadata:
      freezeMetadata({
        valuationPriceSource:
          resolvedPrice.source,

        stale:
          isStale,
      }),
  });
}

function sortPositionResults(
  positions: readonly PositionUnrealizedPnlResult[],
): readonly PositionUnrealizedPnlResult[] {
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

function calculateTotals(
  positions: readonly PositionUnrealizedPnlResult[],
): UnrealizedPnlTotals {
  let calculatedPositionCount = 0;
  let unchangedPositionCount = 0;
  let missingPricePositionCount = 0;
  let stalePricePositionCount = 0;
  let zeroQuantityPositionCount = 0;

  let longUnrealizedPnl = 0;
  let shortUnrealizedPnl = 0;

  let totalUnrealizedPnl = 0;
  let totalPreviousUnrealizedPnl = 0;
  let totalUnrealizedPnlChange = 0;

  let grossEntryNotional = 0;
  let grossValuationNotional = 0;

  let winningPositionCount = 0;
  let losingPositionCount = 0;
  let flatPositionCount = 0;

  let valuedPositionCount = 0;

  for (const position of positions) {
    switch (position.status) {
      case "CALCULATED":
        calculatedPositionCount += 1;
        valuedPositionCount += 1;
        break;

      case "UNCHANGED":
        unchangedPositionCount += 1;
        valuedPositionCount += 1;
        break;

      case "MISSING_PRICE":
        missingPricePositionCount += 1;
        break;

      case "STALE_PRICE":
        stalePricePositionCount += 1;
        valuedPositionCount += 1;
        break;

      case "ZERO_QUANTITY":
        zeroQuantityPositionCount += 1;
        valuedPositionCount += 1;
        break;
    }

    if (position.side === "LONG") {
      longUnrealizedPnl +=
        position.unrealizedPnl;
    } else {
      shortUnrealizedPnl +=
        position.unrealizedPnl;
    }

    totalUnrealizedPnl +=
      position.unrealizedPnl;

    totalPreviousUnrealizedPnl +=
      position.previousUnrealizedPnl;

    totalUnrealizedPnlChange +=
      position.unrealizedPnlChange;

    grossEntryNotional +=
      Math.abs(
        position.entryNotional,
      );

    if (
      position.valuationNotional !== null
    ) {
      grossValuationNotional +=
        Math.abs(
          position.valuationNotional,
        );
    }

    if (position.unrealizedPnl > 0) {
      winningPositionCount += 1;
    } else if (
      position.unrealizedPnl < 0
    ) {
      losingPositionCount += 1;
    } else {
      flatPositionCount += 1;
    }
  }

  return Object.freeze({
    positionCount:
      positions.length,

    calculatedPositionCount,
    unchangedPositionCount,
    missingPricePositionCount,
    stalePricePositionCount,
    zeroQuantityPositionCount,

    longUnrealizedPnl,
    shortUnrealizedPnl,
    totalUnrealizedPnl,
    totalPreviousUnrealizedPnl,
    totalUnrealizedPnlChange,

    grossEntryNotional,
    grossValuationNotional,

    winningPositionCount,
    losingPositionCount,
    flatPositionCount,

    valuationCoverageRatio:
      positions.length === 0
        ? 1
        : valuedPositionCount /
          positions.length,
  });
}

export class DeterministicRealTimeUnrealizedPnlEngine
implements RealTimeUnrealizedPnlEngine {
  public calculate(
    request: UnrealizedPnlCalculationRequest,
  ): UnrealizedPnlCalculationResult {
    assertObject(
      request,
      "request",
    );

    const portfolioId =
      normalizeIdentifier(
        request.portfolioId,
        "request.portfolioId",
      );

    const synchronizationId =
      normalizeIdentifier(
        request.synchronizationId,
        "request.synchronizationId",
      );

    assertObject(
      request.positionSnapshot,
      "request.positionSnapshot",
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
      request.positionSnapshot.synchronizationId !==
      synchronizationId
    ) {
      throw new Error(
        "request.positionSnapshot.synchronizationId does not match request.synchronizationId.",
      );
    }

    if (
      request.calculatedAt <
      request.positionSnapshot.receivedAt
    ) {
      throw new Error(
        "request.calculatedAt cannot be earlier than positionSnapshot.receivedAt.",
      );
    }

    if (
      !Array.isArray(
        request.marketPrices,
      )
    ) {
      throw new Error(
        "request.marketPrices must be an array.",
      );
    }

    const policy =
      resolvePolicy(
        request.policy,
      );

    const priceMap =
      buildMarketPriceMap(
        request.marketPrices,
      );

    const positions =
      sortPositionResults(
        request.positionSnapshot.positions.map(
          position =>
            calculatePositionResult(
              position,
              priceMap,
              policy,
              request.calculatedAt,
            ),
        ),
      );

    const totals =
      calculateTotals(
        positions,
      );

    return Object.freeze({
      portfolioId,
      synchronizationId,

      exchangeId:
        request.positionSnapshot.exchangeId,

      accountId:
        request.positionSnapshot.accountId,

      reportingCurrency:
        request.positionSnapshot.reportingCurrency,

      positions,
      totals,

      calculatedAt:
        request.calculatedAt,

      sequence:
        request.sequence,

      metadata:
        freezeMetadata({
          ...request.metadata,

          positionSnapshotId:
            request.positionSnapshot.snapshotId,

          positionSnapshotSequence:
            request.positionSnapshot.sequence,

          positionCount:
            totals.positionCount,

          calculatedPositionCount:
            totals.calculatedPositionCount,

          missingPricePositionCount:
            totals.missingPricePositionCount,

          stalePricePositionCount:
            totals.stalePricePositionCount,

          valuationCoverageRatio:
            totals.valuationCoverageRatio,
        }),
    });
  }
}

export function createRealTimeUnrealizedPnlEngine():
DeterministicRealTimeUnrealizedPnlEngine {
  return new DeterministicRealTimeUnrealizedPnlEngine();
}

export function createDefaultUnrealizedPnlCalculationPolicy():
UnrealizedPnlCalculationPolicy {
  return Object.freeze({
    maximumPriceAgeMs: 30_000,
    allowCrossExchangePrices: false,
    allowSnapshotMarkPriceFallback: true,
    allowSnapshotIndexPriceFallback: true,
    rejectStalePrices: false,
    rejectMissingPrices: false,
  });
}

export function findPositionUnrealizedPnlResult(
  result: UnrealizedPnlCalculationResult,
  positionId: string,
): PositionUnrealizedPnlResult | null {
  assertObject(
    result,
    "result",
  );

  const normalizedPositionId =
    normalizeIdentifier(
      positionId,
      "positionId",
    );

  return (
    result.positions.find(
      position =>
        position.positionId ===
        normalizedPositionId,
    ) ??
    null
  );
}

export function findUnrealizedPnlResultsBySymbol(
  result: UnrealizedPnlCalculationResult,
  symbol: string,
): readonly PositionUnrealizedPnlResult[] {
  assertObject(
    result,
    "result",
  );

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
      "symbol",
    );

  return Object.freeze(
    result.positions.filter(
      position =>
        position.symbol ===
        normalizedSymbol,
    ),
  );
}