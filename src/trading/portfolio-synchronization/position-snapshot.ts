/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 4: Position Snapshot Model
 *
 * Provides immutable and deterministic position snapshots for normalized
 * exchange positions, portfolio aggregation, reconciliation, exposure,
 * margin, and profit-and-loss calculations.
 */

import type {
  LivePortfolioInstrumentType,
  LivePortfolioMarginMode,
  LivePortfolioMetadata,
  LivePortfolioPositionMode,
  LivePortfolioPositionSide,
} from "./live-portfolio";

export interface PositionSnapshotEntry {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly instrumentType: LivePortfolioInstrumentType;
  readonly side: LivePortfolioPositionSide;
  readonly positionMode: LivePortfolioPositionMode;
  readonly marginMode: LivePortfolioMarginMode;

  /**
   * Absolute position quantity.
   */
  readonly quantity: number;

  /**
   * Signed position quantity.
   *
   * LONG positions are positive.
   * SHORT positions are negative.
   */
  readonly signedQuantity: number;

  readonly averageEntryPrice: number;
  readonly markPrice: number | null;
  readonly indexPrice: number | null;
  readonly liquidationPrice: number | null;

  readonly contractMultiplier: number;
  readonly leverage: number;

  readonly entryNotional: number;
  readonly markNotional: number | null;

  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly isolatedMargin: number | null;
  readonly collateralAllocated: number;

  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly fundingPnl: number;
  readonly feePnl: number;
  readonly netPnl: number;

  readonly returnOnEquity: number | null;
  readonly marginRatio: number | null;

  readonly openedAt: number | null;
  readonly capturedAt: number;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface PositionSnapshotTotals {
  readonly positionCount: number;

  readonly longPositionCount: number;
  readonly shortPositionCount: number;

  readonly grossLongNotional: number;
  readonly grossShortNotional: number;
  readonly grossNotional: number;
  readonly netNotional: number;

  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly collateralAllocated: number;

  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly fundingPnl: number;
  readonly feePnl: number;
  readonly netPnl: number;
}

export interface PositionSnapshot {
  readonly snapshotId: string;
  readonly synchronizationId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly reportingCurrency: string;

  readonly positions: readonly PositionSnapshotEntry[];
  readonly totals: PositionSnapshotTotals;

  readonly capturedAt: number;
  readonly receivedAt: number;
  readonly sequence: number;

  readonly isPartial: boolean;
  readonly missingPositionIds: readonly string[];

  readonly metadata: LivePortfolioMetadata;
}

export interface CreatePositionSnapshotEntryInput {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly exchangeSymbol?: string | null;

  readonly instrumentType: LivePortfolioInstrumentType;
  readonly side: LivePortfolioPositionSide;
  readonly positionMode: LivePortfolioPositionMode;
  readonly marginMode: LivePortfolioMarginMode;

  readonly quantity: number;

  readonly averageEntryPrice: number;
  readonly markPrice?: number | null;
  readonly indexPrice?: number | null;
  readonly liquidationPrice?: number | null;

  readonly contractMultiplier?: number;
  readonly leverage?: number;

  readonly initialMargin?: number;
  readonly maintenanceMargin?: number;
  readonly isolatedMargin?: number | null;
  readonly collateralAllocated?: number;

  readonly realizedPnl?: number;
  readonly fundingPnl?: number;
  readonly feePnl?: number;

  readonly openedAt?: number | null;
  readonly capturedAt: number;
  readonly updatedAt?: number;

  readonly metadata?: LivePortfolioMetadata;
}

export interface CreatePositionSnapshotInput {
  readonly snapshotId: string;
  readonly synchronizationId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly reportingCurrency: string;

  readonly positions:
    readonly CreatePositionSnapshotEntryInput[];

  readonly capturedAt: number;
  readonly receivedAt: number;
  readonly sequence: number;

  readonly isPartial?: boolean;
  readonly missingPositionIds?: readonly string[];

  readonly metadata?: LivePortfolioMetadata;
}

export type PositionSnapshotDifferenceType =
  | "OPENED"
  | "CLOSED"
  | "CHANGED";

export interface PositionSnapshotDifference {
  readonly positionId: string;
  readonly type: PositionSnapshotDifferenceType;

  readonly previous: PositionSnapshotEntry | null;
  readonly current: PositionSnapshotEntry | null;
}

export interface PositionSnapshotComparison {
  readonly previousSnapshotId: string;
  readonly currentSnapshotId: string;

  readonly differences: readonly PositionSnapshotDifference[];
  readonly changed: boolean;
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
    throw new Error(
      `${field} must be a positive integer.`,
    );
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
        `metadata.${key} must be a finite number.`,
      );
    }

    result[key] = value;
  }

  return Object.freeze(result);
}

function assertNullableNonNegativeFiniteNumber(
  value: number | null,
  field: string,
): void {
  if (value !== null) {
    assertNonNegativeFiniteNumber(
      value,
      field,
    );
  }
}

function assertNullableFiniteNumber(
  value: number | null,
  field: string,
): void {
  if (value !== null) {
    assertFiniteNumber(
      value,
      field,
    );
  }
}

export function calculatePositionSignedQuantity(
  side: LivePortfolioPositionSide,
  quantity: number,
): number {
  assertNonNegativeFiniteNumber(
    quantity,
    "quantity",
  );

  return side === "LONG"
    ? quantity
    : -quantity;
}

export function calculatePositionNotional(
  quantity: number,
  price: number,
  contractMultiplier = 1,
): number {
  assertNonNegativeFiniteNumber(
    quantity,
    "quantity",
  );

  assertNonNegativeFiniteNumber(
    price,
    "price",
  );

  assertPositiveFiniteNumber(
    contractMultiplier,
    "contractMultiplier",
  );

  return (
    quantity *
    price *
    contractMultiplier
  );
}

export function calculatePositionUnrealizedPnl(
  side: LivePortfolioPositionSide,
  quantity: number,
  averageEntryPrice: number,
  markPrice: number,
  contractMultiplier = 1,
): number {
  assertNonNegativeFiniteNumber(
    quantity,
    "quantity",
  );

  assertNonNegativeFiniteNumber(
    averageEntryPrice,
    "averageEntryPrice",
  );

  assertNonNegativeFiniteNumber(
    markPrice,
    "markPrice",
  );

  assertPositiveFiniteNumber(
    contractMultiplier,
    "contractMultiplier",
  );

  const priceDifference =
    side === "LONG"
      ? markPrice - averageEntryPrice
      : averageEntryPrice - markPrice;

  return (
    priceDifference *
    quantity *
    contractMultiplier
  );
}

export function calculatePositionNetPnl(
  unrealizedPnl: number,
  realizedPnl: number,
  fundingPnl: number,
  feePnl: number,
): number {
  assertFiniteNumber(
    unrealizedPnl,
    "unrealizedPnl",
  );

  assertFiniteNumber(
    realizedPnl,
    "realizedPnl",
  );

  assertFiniteNumber(
    fundingPnl,
    "fundingPnl",
  );

  assertFiniteNumber(
    feePnl,
    "feePnl",
  );

  return (
    unrealizedPnl +
    realizedPnl +
    fundingPnl +
    feePnl
  );
}

export function calculatePositionRatio(
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

export function createPositionSnapshotEntry(
  input: CreatePositionSnapshotEntryInput,
): PositionSnapshotEntry {
  assertObject(
    input,
    "input",
  );

  const positionId =
    normalizeIdentifier(
      input.positionId,
      "input.positionId",
    );

  const exchangeId =
    normalizeIdentifier(
      input.exchangeId,
      "input.exchangeId",
    );

  const accountId =
    normalizeIdentifier(
      input.accountId,
      "input.accountId",
    );

  const symbol =
    normalizeSymbol(
      input.symbol,
      "input.symbol",
    );

  const exchangeSymbol =
    input.exchangeSymbol === undefined ||
    input.exchangeSymbol === null
      ? null
      : normalizeIdentifier(
          input.exchangeSymbol,
          "input.exchangeSymbol",
        );

  assertNonNegativeFiniteNumber(
    input.quantity,
    "input.quantity",
  );

  assertNonNegativeFiniteNumber(
    input.averageEntryPrice,
    "input.averageEntryPrice",
  );

  const markPrice =
    input.markPrice ?? null;

  const indexPrice =
    input.indexPrice ?? null;

  const liquidationPrice =
    input.liquidationPrice ?? null;

  assertNullableNonNegativeFiniteNumber(
    markPrice,
    "input.markPrice",
  );

  assertNullableNonNegativeFiniteNumber(
    indexPrice,
    "input.indexPrice",
  );

  assertNullableNonNegativeFiniteNumber(
    liquidationPrice,
    "input.liquidationPrice",
  );

  const contractMultiplier =
    input.contractMultiplier ?? 1;

  const leverage =
    input.leverage ?? 1;

  assertPositiveFiniteNumber(
    contractMultiplier,
    "input.contractMultiplier",
  );

  assertPositiveFiniteNumber(
    leverage,
    "input.leverage",
  );

  const initialMargin =
    input.initialMargin ?? 0;

  const maintenanceMargin =
    input.maintenanceMargin ?? 0;

  const isolatedMargin =
    input.isolatedMargin ?? null;

  const collateralAllocated =
    input.collateralAllocated ?? 0;

  assertNonNegativeFiniteNumber(
    initialMargin,
    "input.initialMargin",
  );

  assertNonNegativeFiniteNumber(
    maintenanceMargin,
    "input.maintenanceMargin",
  );

  assertNullableNonNegativeFiniteNumber(
    isolatedMargin,
    "input.isolatedMargin",
  );

  assertNonNegativeFiniteNumber(
    collateralAllocated,
    "input.collateralAllocated",
  );

  const realizedPnl =
    input.realizedPnl ?? 0;

  const fundingPnl =
    input.fundingPnl ?? 0;

  const feePnl =
    input.feePnl ?? 0;

  assertFiniteNumber(
    realizedPnl,
    "input.realizedPnl",
  );

  assertFiniteNumber(
    fundingPnl,
    "input.fundingPnl",
  );

  assertFiniteNumber(
    feePnl,
    "input.feePnl",
  );

  const openedAt =
    input.openedAt ?? null;

  assertNullableNonNegativeFiniteNumber(
    openedAt,
    "input.openedAt",
  );

  assertNonNegativeFiniteNumber(
    input.capturedAt,
    "input.capturedAt",
  );

  const updatedAt =
    input.updatedAt ??
    input.capturedAt;

  assertNonNegativeFiniteNumber(
    updatedAt,
    "input.updatedAt",
  );

  if (
    updatedAt <
    input.capturedAt
  ) {
    throw new Error(
      "input.updatedAt cannot be earlier than input.capturedAt.",
    );
  }

  if (
    openedAt !== null &&
    openedAt > updatedAt
  ) {
    throw new Error(
      "input.openedAt cannot be later than input.updatedAt.",
    );
  }

  if (
    input.quantity > 0 &&
    input.averageEntryPrice === 0
  ) {
    throw new Error(
      "input.averageEntryPrice must be greater than zero for an open position.",
    );
  }

  if (
    input.marginMode !== "ISOLATED" &&
    isolatedMargin !== null
  ) {
    throw new Error(
      "input.isolatedMargin must be null unless marginMode is ISOLATED.",
    );
  }

  const signedQuantity =
    calculatePositionSignedQuantity(
      input.side,
      input.quantity,
    );

  const entryNotional =
    calculatePositionNotional(
      input.quantity,
      input.averageEntryPrice,
      contractMultiplier,
    );

  const markNotional =
    markPrice === null
      ? null
      : calculatePositionNotional(
          input.quantity,
          markPrice,
          contractMultiplier,
        );

  const unrealizedPnl =
    markPrice === null
      ? 0
      : calculatePositionUnrealizedPnl(
          input.side,
          input.quantity,
          input.averageEntryPrice,
          markPrice,
          contractMultiplier,
        );

  const netPnl =
    calculatePositionNetPnl(
      unrealizedPnl,
      realizedPnl,
      fundingPnl,
      feePnl,
    );

  const returnOnEquity =
    calculatePositionRatio(
      netPnl,
      collateralAllocated > 0
        ? collateralAllocated
        : initialMargin,
    );

  const marginRatio =
    calculatePositionRatio(
      maintenanceMargin,
      collateralAllocated > 0
        ? collateralAllocated
        : initialMargin,
    );

  return Object.freeze({
    positionId,

    exchangeId,
    accountId,

    symbol,
    exchangeSymbol,

    instrumentType:
      input.instrumentType,

    side:
      input.side,

    positionMode:
      input.positionMode,

    marginMode:
      input.marginMode,

    quantity:
      input.quantity,

    signedQuantity,

    averageEntryPrice:
      input.averageEntryPrice,

    markPrice,
    indexPrice,
    liquidationPrice,

    contractMultiplier,
    leverage,

    entryNotional,
    markNotional,

    initialMargin,
    maintenanceMargin,
    isolatedMargin,
    collateralAllocated,

    unrealizedPnl,
    realizedPnl,
    fundingPnl,
    feePnl,
    netPnl,

    returnOnEquity,
    marginRatio,

    openedAt,

    capturedAt:
      input.capturedAt,

    updatedAt,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

function assertNoDuplicatePositionIds(
  positions: readonly PositionSnapshotEntry[],
): void {
  const observed =
    new Set<string>();

  for (const position of positions) {
    if (
      observed.has(
        position.positionId,
      )
    ) {
      throw new Error(
        `Duplicate positionId detected: ${position.positionId}.`,
      );
    }

    observed.add(
      position.positionId,
    );
  }
}

function freezeMissingPositionIds(
  positionIds:
    readonly string[] | undefined,
): readonly string[] {
  if (positionIds === undefined) {
    return Object.freeze([]);
  }

  const normalized =
    positionIds.map(
      (positionId, index) =>
        normalizeIdentifier(
          positionId,
          `missingPositionIds[${index}]`,
        ),
    );

  return Object.freeze(
    Array.from(
      new Set(normalized),
    ).sort(),
  );
}

export function calculatePositionSnapshotTotals(
  positions: readonly PositionSnapshotEntry[],
): PositionSnapshotTotals {
  let longPositionCount = 0;
  let shortPositionCount = 0;

  let grossLongNotional = 0;
  let grossShortNotional = 0;

  let initialMargin = 0;
  let maintenanceMargin = 0;
  let collateralAllocated = 0;

  let unrealizedPnl = 0;
  let realizedPnl = 0;
  let fundingPnl = 0;
  let feePnl = 0;
  let netPnl = 0;

  for (const position of positions) {
    const effectiveNotional =
      position.markNotional ??
      position.entryNotional;

    if (position.side === "LONG") {
      longPositionCount += 1;
      grossLongNotional +=
        effectiveNotional;
    } else {
      shortPositionCount += 1;
      grossShortNotional +=
        effectiveNotional;
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

  return Object.freeze({
    positionCount:
      positions.length,

    longPositionCount,
    shortPositionCount,

    grossLongNotional,
    grossShortNotional,

    grossNotional:
      grossLongNotional +
      grossShortNotional,

    netNotional:
      grossLongNotional -
      grossShortNotional,

    initialMargin,
    maintenanceMargin,
    collateralAllocated,

    unrealizedPnl,
    realizedPnl,
    fundingPnl,
    feePnl,
    netPnl,
  });
}

export function createPositionSnapshot(
  input: CreatePositionSnapshotInput,
): PositionSnapshot {
  assertObject(
    input,
    "input",
  );

  const snapshotId =
    normalizeIdentifier(
      input.snapshotId,
      "input.snapshotId",
    );

  const synchronizationId =
    normalizeIdentifier(
      input.synchronizationId,
      "input.synchronizationId",
    );

  const exchangeId =
    normalizeIdentifier(
      input.exchangeId,
      "input.exchangeId",
    );

  const accountId =
    normalizeIdentifier(
      input.accountId,
      "input.accountId",
    );

  const reportingCurrency =
    normalizeSymbol(
      input.reportingCurrency,
      "input.reportingCurrency",
    );

  assertNonNegativeFiniteNumber(
    input.capturedAt,
    "input.capturedAt",
  );

  assertNonNegativeFiniteNumber(
    input.receivedAt,
    "input.receivedAt",
  );

  if (
    input.receivedAt <
    input.capturedAt
  ) {
    throw new Error(
      "input.receivedAt cannot be earlier than input.capturedAt.",
    );
  }

  assertPositiveInteger(
    input.sequence,
    "input.sequence",
  );

  if (
    !Array.isArray(
      input.positions,
    )
  ) {
    throw new Error(
      "input.positions must be an array.",
    );
  }

  const positions =
    input.positions.map(
      (
        position,
        index,
      ) => {
        const created =
          createPositionSnapshotEntry({
            ...position,

            exchangeId:
              position.exchangeId ||
              exchangeId,

            accountId:
              position.accountId ||
              accountId,
          });

        if (
          created.exchangeId !==
          exchangeId
        ) {
          throw new Error(
            `input.positions[${index}].exchangeId does not match input.exchangeId.`,
          );
        }

        if (
          created.accountId !==
          accountId
        ) {
          throw new Error(
            `input.positions[${index}].accountId does not match input.accountId.`,
          );
        }

        if (
          created.capturedAt >
          input.receivedAt
        ) {
          throw new Error(
            `input.positions[${index}].capturedAt cannot be later than input.receivedAt.`,
          );
        }

        return created;
      },
    );

  assertNoDuplicatePositionIds(
    positions,
  );

  const frozenPositions =
    Object.freeze(
      [...positions].sort(
        (
          left,
          right,
        ) => {
          const symbolComparison =
            left.symbol.localeCompare(
              right.symbol,
            );

          if (
            symbolComparison !== 0
          ) {
            return symbolComparison;
          }

          const sideComparison =
            left.side.localeCompare(
              right.side,
            );

          if (
            sideComparison !== 0
          ) {
            return sideComparison;
          }

          return left.positionId.localeCompare(
            right.positionId,
          );
        },
      ),
    );

  const missingPositionIds =
    freezeMissingPositionIds(
      input.missingPositionIds,
    );

  const isPartial =
    input.isPartial ?? false;

  if (
    !isPartial &&
    missingPositionIds.length > 0
  ) {
    throw new Error(
      "A non-partial snapshot cannot contain missingPositionIds.",
    );
  }

  return Object.freeze({
    snapshotId,
    synchronizationId,

    exchangeId,
    accountId,

    reportingCurrency,

    positions:
      frozenPositions,

    totals:
      calculatePositionSnapshotTotals(
        frozenPositions,
      ),

    capturedAt:
      input.capturedAt,

    receivedAt:
      input.receivedAt,

    sequence:
      input.sequence,

    isPartial,

    missingPositionIds,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

export function clonePositionSnapshotEntry(
  entry: PositionSnapshotEntry,
): PositionSnapshotEntry {
  assertObject(
    entry,
    "entry",
  );

  return createPositionSnapshotEntry({
    positionId:
      entry.positionId,

    exchangeId:
      entry.exchangeId,

    accountId:
      entry.accountId,

    symbol:
      entry.symbol,

    exchangeSymbol:
      entry.exchangeSymbol,

    instrumentType:
      entry.instrumentType,

    side:
      entry.side,

    positionMode:
      entry.positionMode,

    marginMode:
      entry.marginMode,

    quantity:
      entry.quantity,

    averageEntryPrice:
      entry.averageEntryPrice,

    markPrice:
      entry.markPrice,

    indexPrice:
      entry.indexPrice,

    liquidationPrice:
      entry.liquidationPrice,

    contractMultiplier:
      entry.contractMultiplier,

    leverage:
      entry.leverage,

    initialMargin:
      entry.initialMargin,

    maintenanceMargin:
      entry.maintenanceMargin,

    isolatedMargin:
      entry.isolatedMargin,

    collateralAllocated:
      entry.collateralAllocated,

    realizedPnl:
      entry.realizedPnl,

    fundingPnl:
      entry.fundingPnl,

    feePnl:
      entry.feePnl,

    openedAt:
      entry.openedAt,

    capturedAt:
      entry.capturedAt,

    updatedAt:
      entry.updatedAt,

    metadata:
      entry.metadata,
  });
}

export function clonePositionSnapshot(
  snapshot: PositionSnapshot,
): PositionSnapshot {
  assertObject(
    snapshot,
    "snapshot",
  );

  return createPositionSnapshot({
    snapshotId:
      snapshot.snapshotId,

    synchronizationId:
      snapshot.synchronizationId,

    exchangeId:
      snapshot.exchangeId,

    accountId:
      snapshot.accountId,

    reportingCurrency:
      snapshot.reportingCurrency,

    positions:
      snapshot.positions.map(
        clonePositionSnapshotEntry,
      ),

    capturedAt:
      snapshot.capturedAt,

    receivedAt:
      snapshot.receivedAt,

    sequence:
      snapshot.sequence,

    isPartial:
      snapshot.isPartial,

    missingPositionIds:
      snapshot.missingPositionIds,

    metadata:
      snapshot.metadata,
  });
}

function areNullableNumbersEqual(
  left: number | null,
  right: number | null,
): boolean {
  if (
    left === null ||
    right === null
  ) {
    return left === right;
  }

  return (
    Math.abs(
      left - right,
    ) <= Number.EPSILON
  );
}

export function arePositionSnapshotEntriesEqual(
  left: PositionSnapshotEntry,
  right: PositionSnapshotEntry,
): boolean {
  return (
    left.positionId ===
      right.positionId &&
    left.exchangeId ===
      right.exchangeId &&
    left.accountId ===
      right.accountId &&
    left.symbol ===
      right.symbol &&
    left.exchangeSymbol ===
      right.exchangeSymbol &&
    left.instrumentType ===
      right.instrumentType &&
    left.side ===
      right.side &&
    left.positionMode ===
      right.positionMode &&
    left.marginMode ===
      right.marginMode &&
    left.quantity ===
      right.quantity &&
    left.signedQuantity ===
      right.signedQuantity &&
    left.averageEntryPrice ===
      right.averageEntryPrice &&
    areNullableNumbersEqual(
      left.markPrice,
      right.markPrice,
    ) &&
    areNullableNumbersEqual(
      left.indexPrice,
      right.indexPrice,
    ) &&
    areNullableNumbersEqual(
      left.liquidationPrice,
      right.liquidationPrice,
    ) &&
    left.contractMultiplier ===
      right.contractMultiplier &&
    left.leverage ===
      right.leverage &&
    left.entryNotional ===
      right.entryNotional &&
    areNullableNumbersEqual(
      left.markNotional,
      right.markNotional,
    ) &&
    left.initialMargin ===
      right.initialMargin &&
    left.maintenanceMargin ===
      right.maintenanceMargin &&
    areNullableNumbersEqual(
      left.isolatedMargin,
      right.isolatedMargin,
    ) &&
    left.collateralAllocated ===
      right.collateralAllocated &&
    left.unrealizedPnl ===
      right.unrealizedPnl &&
    left.realizedPnl ===
      right.realizedPnl &&
    left.fundingPnl ===
      right.fundingPnl &&
    left.feePnl ===
      right.feePnl &&
    left.netPnl ===
      right.netPnl
  );
}

export function comparePositionSnapshots(
  previous: PositionSnapshot,
  current: PositionSnapshot,
): PositionSnapshotComparison {
  assertObject(
    previous,
    "previous",
  );

  assertObject(
    current,
    "current",
  );

  if (
    previous.exchangeId !==
    current.exchangeId
  ) {
    throw new Error(
      "Snapshots must belong to the same exchange.",
    );
  }

  if (
    previous.accountId !==
    current.accountId
  ) {
    throw new Error(
      "Snapshots must belong to the same account.",
    );
  }

  const previousByPositionId =
    new Map(
      previous.positions.map(
        position => [
          position.positionId,
          position,
        ] as const,
      ),
    );

  const currentByPositionId =
    new Map(
      current.positions.map(
        position => [
          position.positionId,
          position,
        ] as const,
      ),
    );

  const positionIds =
    Array.from(
      new Set([
        ...previousByPositionId.keys(),
        ...currentByPositionId.keys(),
      ]),
    ).sort();

  const differences:
    PositionSnapshotDifference[] = [];

  for (
    const positionId
    of positionIds
  ) {
    const previousPosition =
      previousByPositionId.get(
        positionId,
      ) ?? null;

    const currentPosition =
      currentByPositionId.get(
        positionId,
      ) ?? null;

    if (
      previousPosition === null &&
      currentPosition !== null
    ) {
      differences.push(
        Object.freeze({
          positionId,
          type: "OPENED",
          previous: null,
          current:
            currentPosition,
        }),
      );

      continue;
    }

    if (
      previousPosition !== null &&
      currentPosition === null
    ) {
      differences.push(
        Object.freeze({
          positionId,
          type: "CLOSED",
          previous:
            previousPosition,
          current: null,
        }),
      );

      continue;
    }

    if (
      previousPosition !== null &&
      currentPosition !== null &&
      !arePositionSnapshotEntriesEqual(
        previousPosition,
        currentPosition,
      )
    ) {
      differences.push(
        Object.freeze({
          positionId,
          type: "CHANGED",
          previous:
            previousPosition,
          current:
            currentPosition,
        }),
      );
    }
  }

  const frozenDifferences =
    Object.freeze(
      differences,
    );

  return Object.freeze({
    previousSnapshotId:
      previous.snapshotId,

    currentSnapshotId:
      current.snapshotId,

    differences:
      frozenDifferences,

    changed:
      frozenDifferences.length > 0,
  });
}

export function findPositionSnapshotEntry(
  snapshot: PositionSnapshot,
  positionId: string,
): PositionSnapshotEntry | null {
  const normalizedPositionId =
    normalizeIdentifier(
      positionId,
      "positionId",
    );

  return (
    snapshot.positions.find(
      position =>
        position.positionId ===
        normalizedPositionId,
    ) ??
    null
  );
}

export function findPositionSnapshotEntriesBySymbol(
  snapshot: PositionSnapshot,
  symbol: string,
): readonly PositionSnapshotEntry[] {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
      "symbol",
    );

  return Object.freeze(
    snapshot.positions.filter(
      position =>
        position.symbol ===
        normalizedSymbol,
    ),
  );
}

export class PositionSnapshotFactory {
  public createEntry(
    input: CreatePositionSnapshotEntryInput,
  ): PositionSnapshotEntry {
    return createPositionSnapshotEntry(
      input,
    );
  }

  public create(
    input: CreatePositionSnapshotInput,
  ): PositionSnapshot {
    return createPositionSnapshot(
      input,
    );
  }

  public clone(
    snapshot: PositionSnapshot,
  ): PositionSnapshot {
    return clonePositionSnapshot(
      snapshot,
    );
  }

  public compare(
    previous: PositionSnapshot,
    current: PositionSnapshot,
  ): PositionSnapshotComparison {
    return comparePositionSnapshots(
      previous,
      current,
    );
  }
}

export function createPositionSnapshotFactory():
PositionSnapshotFactory {
  return new PositionSnapshotFactory();
}