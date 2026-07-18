/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 3: Exchange Balance Snapshot Model
 *
 * Provides the immutable, deterministic balance snapshot model used to
 * normalize, validate, compare, and aggregate exchange account balances.
 */

import type {
  LivePortfolioAssetClassification,
  LivePortfolioMetadata,
} from "./live-portfolio";

export interface ExchangeBalanceSnapshotEntry {
  readonly exchangeId: string;
  readonly accountId: string;
  readonly asset: string;
  readonly classification: LivePortfolioAssetClassification;

  readonly total: number;
  readonly available: number;
  readonly locked: number;
  readonly borrowed: number;
  readonly interest: number;
  readonly net: number;

  readonly reportingPrice: number | null;
  readonly grossReportingValue: number | null;
  readonly liabilityReportingValue: number | null;
  readonly netReportingValue: number | null;

  readonly capturedAt: number;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface ExchangeBalanceSnapshotTotals {
  readonly grossReportingValue: number;
  readonly liabilityReportingValue: number;
  readonly netReportingValue: number;
  readonly assetCount: number;
}

export interface ExchangeBalanceSnapshot {
  readonly snapshotId: string;
  readonly synchronizationId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly reportingCurrency: string;

  readonly balances: readonly ExchangeBalanceSnapshotEntry[];
  readonly totals: ExchangeBalanceSnapshotTotals;

  readonly capturedAt: number;
  readonly receivedAt: number;
  readonly sequence: number;

  readonly isPartial: boolean;
  readonly missingAssets: readonly string[];

  readonly metadata: LivePortfolioMetadata;
}

export interface CreateExchangeBalanceSnapshotEntryInput {
  readonly exchangeId: string;
  readonly accountId: string;
  readonly asset: string;

  readonly classification?: LivePortfolioAssetClassification;

  readonly total: number;
  readonly available: number;
  readonly locked: number;
  readonly borrowed?: number;
  readonly interest?: number;

  readonly reportingPrice?: number | null;

  readonly capturedAt: number;
  readonly updatedAt?: number;

  readonly metadata?: LivePortfolioMetadata;
}

export interface CreateExchangeBalanceSnapshotInput {
  readonly snapshotId: string;
  readonly synchronizationId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly reportingCurrency: string;

  readonly balances:
    readonly CreateExchangeBalanceSnapshotEntryInput[];

  readonly capturedAt: number;
  readonly receivedAt: number;
  readonly sequence: number;

  readonly isPartial?: boolean;
  readonly missingAssets?: readonly string[];

  readonly metadata?: LivePortfolioMetadata;
}

export interface ExchangeBalanceSnapshotDifference {
  readonly asset: string;
  readonly type: ExchangeBalanceSnapshotDifferenceType;

  readonly previous:
    ExchangeBalanceSnapshotEntry | null;

  readonly current:
    ExchangeBalanceSnapshotEntry | null;
}

export type ExchangeBalanceSnapshotDifferenceType =
  | "ADDED"
  | "REMOVED"
  | "CHANGED";

export interface ExchangeBalanceSnapshotComparison {
  readonly previousSnapshotId: string;
  readonly currentSnapshotId: string;

  readonly differences:
    readonly ExchangeBalanceSnapshotDifference[];

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
  metadata:
    | LivePortfolioMetadata
    | undefined,
): LivePortfolioMetadata {
  if (metadata === undefined) {
    return Object.freeze({});
  }

  const result: Record<
    string,
    string | number | boolean | null
  > = {};

  for (
    const [key, value]
    of Object.entries(metadata)
  ) {
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

function calculateNetQuantity(
  total: number,
  borrowed: number,
  interest: number,
): number {
  return total - borrowed - interest;
}

function calculateReportingValues(
  total: number,
  borrowed: number,
  interest: number,
  reportingPrice: number | null,
): Readonly<{
  grossReportingValue: number | null;
  liabilityReportingValue: number | null;
  netReportingValue: number | null;
}> {
  if (reportingPrice === null) {
    return Object.freeze({
      grossReportingValue: null,
      liabilityReportingValue: null,
      netReportingValue: null,
    });
  }

  const grossReportingValue =
    total * reportingPrice;

  const liabilityReportingValue =
    (borrowed + interest) *
    reportingPrice;

  const netReportingValue =
    grossReportingValue -
    liabilityReportingValue;

  return Object.freeze({
    grossReportingValue,
    liabilityReportingValue,
    netReportingValue,
  });
}

export function createExchangeBalanceSnapshotEntry(
  input: CreateExchangeBalanceSnapshotEntryInput,
): ExchangeBalanceSnapshotEntry {
  assertObject(input, "input");

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

  const asset =
    normalizeAsset(
      input.asset,
      "input.asset",
    );

  assertNonNegativeFiniteNumber(
    input.total,
    "input.total",
  );

  assertNonNegativeFiniteNumber(
    input.available,
    "input.available",
  );

  assertNonNegativeFiniteNumber(
    input.locked,
    "input.locked",
  );

  const borrowed =
    input.borrowed ?? 0;

  const interest =
    input.interest ?? 0;

  assertNonNegativeFiniteNumber(
    borrowed,
    "input.borrowed",
  );

  assertNonNegativeFiniteNumber(
    interest,
    "input.interest",
  );

  if (
    input.available >
    input.total
  ) {
    throw new Error(
      "input.available cannot exceed input.total.",
    );
  }

  if (
    input.locked >
    input.total
  ) {
    throw new Error(
      "input.locked cannot exceed input.total.",
    );
  }

  if (
    input.available +
      input.locked >
    input.total
  ) {
    throw new Error(
      "input.available plus input.locked cannot exceed input.total.",
    );
  }

  const reportingPrice =
    input.reportingPrice ?? null;

  if (
    reportingPrice !== null
  ) {
    assertNonNegativeFiniteNumber(
      reportingPrice,
      "input.reportingPrice",
    );
  }

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

  const net =
    calculateNetQuantity(
      input.total,
      borrowed,
      interest,
    );

  assertFiniteNumber(
    net,
    "calculated net",
  );

  const reportingValues =
    calculateReportingValues(
      input.total,
      borrowed,
      interest,
      reportingPrice,
    );

  return Object.freeze({
    exchangeId,
    accountId,
    asset,

    classification:
      input.classification ??
      "OTHER",

    total: input.total,
    available:
      input.available,
    locked:
      input.locked,
    borrowed,
    interest,
    net,

    reportingPrice,

    grossReportingValue:
      reportingValues
        .grossReportingValue,

    liabilityReportingValue:
      reportingValues
        .liabilityReportingValue,

    netReportingValue:
      reportingValues
        .netReportingValue,

    capturedAt:
      input.capturedAt,

    updatedAt,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

export function calculateExchangeBalanceSnapshotTotals(
  balances:
    readonly ExchangeBalanceSnapshotEntry[],
): ExchangeBalanceSnapshotTotals {
  let grossReportingValue = 0;
  let liabilityReportingValue = 0;
  let netReportingValue = 0;

  for (
    const balance
    of balances
  ) {
    if (
      balance.grossReportingValue !== null
    ) {
      grossReportingValue +=
        balance.grossReportingValue;
    }

    if (
      balance.liabilityReportingValue !== null
    ) {
      liabilityReportingValue +=
        balance.liabilityReportingValue;
    }

    if (
      balance.netReportingValue !== null
    ) {
      netReportingValue +=
        balance.netReportingValue;
    }
  }

  return Object.freeze({
    grossReportingValue,
    liabilityReportingValue,
    netReportingValue,
    assetCount:
      balances.length,
  });
}

function assertNoDuplicateAssets(
  balances:
    readonly ExchangeBalanceSnapshotEntry[],
): void {
  const observedAssets =
    new Set<string>();

  for (
    const balance
    of balances
  ) {
    if (
      observedAssets.has(
        balance.asset,
      )
    ) {
      throw new Error(
        `Duplicate balance asset detected: ${balance.asset}.`,
      );
    }

    observedAssets.add(
      balance.asset,
    );
  }
}

function freezeMissingAssets(
  assets:
    readonly string[]
    | undefined,
): readonly string[] {
  if (assets === undefined) {
    return Object.freeze([]);
  }

  const normalized =
    assets.map(
      (asset, index) =>
        normalizeAsset(
          asset,
          `missingAssets[${index}]`,
        ),
    );

  const unique =
    Array.from(
      new Set(normalized),
    ).sort();

  return Object.freeze(unique);
}

export function createExchangeBalanceSnapshot(
  input: CreateExchangeBalanceSnapshotInput,
): ExchangeBalanceSnapshot {
  assertObject(input, "input");

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
    normalizeAsset(
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
      input.balances,
    )
  ) {
    throw new Error(
      "input.balances must be an array.",
    );
  }

  const balances =
    input.balances.map(
      (
        balance,
        index,
      ) => {
        const created =
          createExchangeBalanceSnapshotEntry({
            ...balance,

            exchangeId:
              balance.exchangeId ||
              exchangeId,

            accountId:
              balance.accountId ||
              accountId,
          });

        if (
          created.exchangeId !==
          exchangeId
        ) {
          throw new Error(
            `input.balances[${index}].exchangeId does not match input.exchangeId.`,
          );
        }

        if (
          created.accountId !==
          accountId
        ) {
          throw new Error(
            `input.balances[${index}].accountId does not match input.accountId.`,
          );
        }

        if (
          created.capturedAt >
          input.receivedAt
        ) {
          throw new Error(
            `input.balances[${index}].capturedAt cannot be later than input.receivedAt.`,
          );
        }

        return created;
      },
    );

  assertNoDuplicateAssets(
    balances,
  );

  const sortedBalances =
    [...balances].sort(
      (
        left,
        right,
      ) =>
        left.asset.localeCompare(
          right.asset,
        ),
    );

  const frozenBalances =
    Object.freeze(
      sortedBalances,
    );

  const missingAssets =
    freezeMissingAssets(
      input.missingAssets,
    );

  const isPartial =
    input.isPartial ??
    false;

  if (
    !isPartial &&
    missingAssets.length > 0
  ) {
    throw new Error(
      "A non-partial snapshot cannot contain missingAssets.",
    );
  }

  return Object.freeze({
    snapshotId,
    synchronizationId,

    exchangeId,
    accountId,

    reportingCurrency,

    balances:
      frozenBalances,

    totals:
      calculateExchangeBalanceSnapshotTotals(
        frozenBalances,
      ),

    capturedAt:
      input.capturedAt,

    receivedAt:
      input.receivedAt,

    sequence:
      input.sequence,

    isPartial,

    missingAssets,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

export function cloneExchangeBalanceSnapshotEntry(
  entry: ExchangeBalanceSnapshotEntry,
): ExchangeBalanceSnapshotEntry {
  assertObject(
    entry,
    "entry",
  );

  return createExchangeBalanceSnapshotEntry({
    exchangeId:
      entry.exchangeId,

    accountId:
      entry.accountId,

    asset:
      entry.asset,

    classification:
      entry.classification,

    total:
      entry.total,

    available:
      entry.available,

    locked:
      entry.locked,

    borrowed:
      entry.borrowed,

    interest:
      entry.interest,

    reportingPrice:
      entry.reportingPrice,

    capturedAt:
      entry.capturedAt,

    updatedAt:
      entry.updatedAt,

    metadata:
      entry.metadata,
  });
}

export function cloneExchangeBalanceSnapshot(
  snapshot: ExchangeBalanceSnapshot,
): ExchangeBalanceSnapshot {
  assertObject(
    snapshot,
    "snapshot",
  );

  return createExchangeBalanceSnapshot({
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

    balances:
      snapshot.balances.map(
        cloneExchangeBalanceSnapshotEntry,
      ),

    capturedAt:
      snapshot.capturedAt,

    receivedAt:
      snapshot.receivedAt,

    sequence:
      snapshot.sequence,

    isPartial:
      snapshot.isPartial,

    missingAssets:
      snapshot.missingAssets,

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

export function areExchangeBalanceSnapshotEntriesEqual(
  left: ExchangeBalanceSnapshotEntry,
  right: ExchangeBalanceSnapshotEntry,
): boolean {
  return (
    left.exchangeId ===
      right.exchangeId &&
    left.accountId ===
      right.accountId &&
    left.asset ===
      right.asset &&
    left.classification ===
      right.classification &&
    left.total ===
      right.total &&
    left.available ===
      right.available &&
    left.locked ===
      right.locked &&
    left.borrowed ===
      right.borrowed &&
    left.interest ===
      right.interest &&
    left.net ===
      right.net &&
    areNullableNumbersEqual(
      left.reportingPrice,
      right.reportingPrice,
    ) &&
    areNullableNumbersEqual(
      left.grossReportingValue,
      right.grossReportingValue,
    ) &&
    areNullableNumbersEqual(
      left.liabilityReportingValue,
      right.liabilityReportingValue,
    ) &&
    areNullableNumbersEqual(
      left.netReportingValue,
      right.netReportingValue,
    )
  );
}

export function compareExchangeBalanceSnapshots(
  previous:
    ExchangeBalanceSnapshot,
  current:
    ExchangeBalanceSnapshot,
): ExchangeBalanceSnapshotComparison {
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

  const previousByAsset =
    new Map(
      previous.balances.map(
        balance => [
          balance.asset,
          balance,
        ] as const,
      ),
    );

  const currentByAsset =
    new Map(
      current.balances.map(
        balance => [
          balance.asset,
          balance,
        ] as const,
      ),
    );

  const assets =
    Array.from(
      new Set([
        ...previousByAsset.keys(),
        ...currentByAsset.keys(),
      ]),
    ).sort();

  const differences:
    ExchangeBalanceSnapshotDifference[] = [];

  for (
    const asset
    of assets
  ) {
    const previousBalance =
      previousByAsset.get(asset) ??
      null;

    const currentBalance =
      currentByAsset.get(asset) ??
      null;

    if (
      previousBalance === null &&
      currentBalance !== null
    ) {
      differences.push(
        Object.freeze({
          asset,
          type: "ADDED",
          previous: null,
          current:
            currentBalance,
        }),
      );

      continue;
    }

    if (
      previousBalance !== null &&
      currentBalance === null
    ) {
      differences.push(
        Object.freeze({
          asset,
          type: "REMOVED",
          previous:
            previousBalance,
          current: null,
        }),
      );

      continue;
    }

    if (
      previousBalance !== null &&
      currentBalance !== null &&
      !areExchangeBalanceSnapshotEntriesEqual(
        previousBalance,
        currentBalance,
      )
    ) {
      differences.push(
        Object.freeze({
          asset,
          type: "CHANGED",
          previous:
            previousBalance,
          current:
            currentBalance,
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

export function findExchangeBalanceSnapshotEntry(
  snapshot: ExchangeBalanceSnapshot,
  asset: string,
): ExchangeBalanceSnapshotEntry | null {
  const normalizedAsset =
    normalizeAsset(
      asset,
      "asset",
    );

  return (
    snapshot.balances.find(
      balance =>
        balance.asset ===
        normalizedAsset,
    ) ??
    null
  );
}

export class ExchangeBalanceSnapshotFactory {
  public createEntry(
    input: CreateExchangeBalanceSnapshotEntryInput,
  ): ExchangeBalanceSnapshotEntry {
    return createExchangeBalanceSnapshotEntry(
      input,
    );
  }

  public create(
    input: CreateExchangeBalanceSnapshotInput,
  ): ExchangeBalanceSnapshot {
    return createExchangeBalanceSnapshot(
      input,
    );
  }

  public clone(
    snapshot: ExchangeBalanceSnapshot,
  ): ExchangeBalanceSnapshot {
    return cloneExchangeBalanceSnapshot(
      snapshot,
    );
  }

  public compare(
    previous: ExchangeBalanceSnapshot,
    current: ExchangeBalanceSnapshot,
  ): ExchangeBalanceSnapshotComparison {
    return compareExchangeBalanceSnapshots(
      previous,
      current,
    );
  }
}

export function createExchangeBalanceSnapshotFactory():
ExchangeBalanceSnapshotFactory {
  return new ExchangeBalanceSnapshotFactory();
}