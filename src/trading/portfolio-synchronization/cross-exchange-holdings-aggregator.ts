/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 6: Cross-Exchange Holdings Aggregator
 *
 * Aggregates identical assets held across multiple exchange accounts into
 * deterministic cross-exchange holdings while preserving account-level
 * provenance, liabilities, valuation coverage, and concentration metrics.
 */

import type {
  LivePortfolio,
  LivePortfolioAssetBalance,
  LivePortfolioAssetClassification,
  LivePortfolioMetadata,
} from "./live-portfolio";

export interface CrossExchangeHoldingSource {
  readonly exchangeId: string;
  readonly accountId: string;
  readonly asset: string;

  readonly classification: LivePortfolioAssetClassification;

  readonly totalQuantity: number;
  readonly availableQuantity: number;
  readonly lockedQuantity: number;
  readonly borrowedQuantity: number;
  readonly interestQuantity: number;
  readonly netQuantity: number;

  readonly reportingPrice: number | null;
  readonly grossReportingValue: number | null;
  readonly liabilityReportingValue: number | null;
  readonly netReportingValue: number | null;

  readonly updatedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

export interface CrossExchangeHolding {
  readonly asset: string;
  readonly classification: LivePortfolioAssetClassification;

  readonly totalQuantity: number;
  readonly availableQuantity: number;
  readonly lockedQuantity: number;
  readonly borrowedQuantity: number;
  readonly interestQuantity: number;
  readonly netQuantity: number;

  readonly grossReportingValue: number;
  readonly liabilityReportingValue: number;
  readonly netReportingValue: number;

  readonly valuedSourceCount: number;
  readonly unvaluedSourceCount: number;
  readonly sourceCount: number;
  readonly exchangeCount: number;
  readonly accountCount: number;

  readonly valuationCoverageRatio: number;
  readonly portfolioConcentrationRatio: number | null;

  readonly sources: readonly CrossExchangeHoldingSource[];

  readonly firstUpdatedAt: number;
  readonly lastUpdatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface CrossExchangeHoldingsTotals {
  readonly assetCount: number;
  readonly sourceCount: number;
  readonly exchangeCount: number;
  readonly accountCount: number;

  readonly grossReportingValue: number;
  readonly liabilityReportingValue: number;
  readonly netReportingValue: number;

  readonly valuedSourceCount: number;
  readonly unvaluedSourceCount: number;
  readonly valuationCoverageRatio: number;
}

export interface CrossExchangeHoldingsAggregation {
  readonly portfolioId: string;
  readonly reportingCurrency: string;

  readonly holdings: readonly CrossExchangeHolding[];
  readonly totals: CrossExchangeHoldingsTotals;

  readonly aggregatedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

export interface CrossExchangeHoldingsAggregationRequest {
  readonly portfolio: LivePortfolio;
  readonly aggregatedAt: number;
  readonly metadata?: LivePortfolioMetadata;
}

export interface CrossExchangeHoldingsAggregator {
  aggregate(
    request: CrossExchangeHoldingsAggregationRequest,
  ): CrossExchangeHoldingsAggregation;
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
    assertNonEmptyString(key, "metadata key");

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

function createAccountKey(
  exchangeId: string,
  accountId: string,
): string {
  return `${exchangeId}\u0000${accountId}`;
}

function createSourceKey(
  balance: LivePortfolioAssetBalance,
): string {
  return [
    balance.exchangeId,
    balance.accountId,
    balance.asset,
  ].join("\u0000");
}

function assertBalance(
  balance: LivePortfolioAssetBalance,
  index: number,
): void {
  assertObject(
    balance,
    `portfolio.balances[${index}]`,
  );

  assertNonEmptyString(
    balance.exchangeId,
    `portfolio.balances[${index}].exchangeId`,
  );

  assertNonEmptyString(
    balance.accountId,
    `portfolio.balances[${index}].accountId`,
  );

  assertNonEmptyString(
    balance.asset,
    `portfolio.balances[${index}].asset`,
  );

  assertNonNegativeFiniteNumber(
    balance.total,
    `portfolio.balances[${index}].total`,
  );

  assertNonNegativeFiniteNumber(
    balance.available,
    `portfolio.balances[${index}].available`,
  );

  assertNonNegativeFiniteNumber(
    balance.locked,
    `portfolio.balances[${index}].locked`,
  );

  assertNonNegativeFiniteNumber(
    balance.borrowed,
    `portfolio.balances[${index}].borrowed`,
  );

  assertNonNegativeFiniteNumber(
    balance.interest,
    `portfolio.balances[${index}].interest`,
  );

  assertFiniteNumber(
    balance.net,
    `portfolio.balances[${index}].net`,
  );

  if (
    balance.reportingPrice !== null
  ) {
    assertNonNegativeFiniteNumber(
      balance.reportingPrice,
      `portfolio.balances[${index}].reportingPrice`,
    );
  }

  if (
    balance.grossReportingValue !== null
  ) {
    assertNonNegativeFiniteNumber(
      balance.grossReportingValue,
      `portfolio.balances[${index}].grossReportingValue`,
    );
  }

  if (
    balance.liabilityReportingValue !== null
  ) {
    assertNonNegativeFiniteNumber(
      balance.liabilityReportingValue,
      `portfolio.balances[${index}].liabilityReportingValue`,
    );
  }

  if (
    balance.netReportingValue !== null
  ) {
    assertFiniteNumber(
      balance.netReportingValue,
      `portfolio.balances[${index}].netReportingValue`,
    );
  }

  assertNonNegativeFiniteNumber(
    balance.updatedAt,
    `portfolio.balances[${index}].updatedAt`,
  );
}

function createSource(
  balance: LivePortfolioAssetBalance,
): CrossExchangeHoldingSource {
  return Object.freeze({
    exchangeId:
      balance.exchangeId,

    accountId:
      balance.accountId,

    asset:
      normalizeAsset(
        balance.asset,
        "balance.asset",
      ),

    classification:
      balance.classification,

    totalQuantity:
      balance.total,

    availableQuantity:
      balance.available,

    lockedQuantity:
      balance.locked,

    borrowedQuantity:
      balance.borrowed,

    interestQuantity:
      balance.interest,

    netQuantity:
      balance.net,

    reportingPrice:
      balance.reportingPrice,

    grossReportingValue:
      balance.grossReportingValue,

    liabilityReportingValue:
      balance.liabilityReportingValue,

    netReportingValue:
      balance.netReportingValue,

    updatedAt:
      balance.updatedAt,

    metadata:
      freezeMetadata(
        balance.metadata,
      ),
  });
}

function sortSources(
  sources: readonly CrossExchangeHoldingSource[],
): readonly CrossExchangeHoldingSource[] {
  return Object.freeze(
    [...sources].sort((left, right) => {
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
    }),
  );
}

function calculateCoverageRatio(
  valuedCount: number,
  totalCount: number,
): number {
  if (totalCount === 0) {
    return 1;
  }

  return valuedCount / totalCount;
}

function resolveClassification(
  asset: string,
  sources: readonly CrossExchangeHoldingSource[],
): LivePortfolioAssetClassification {
  if (sources.length === 0) {
    throw new Error(
      `Cannot resolve classification for asset "${asset}" without sources.`,
    );
  }

  const classifications =
    Array.from(
      new Set(
        sources.map(
          source => source.classification,
        ),
      ),
    );

  if (classifications.length > 1) {
    throw new Error(
      `Conflicting classifications detected for asset "${asset}".`,
    );
  }

  return classifications[0];
}

function buildHolding(
  asset: string,
  sources: readonly CrossExchangeHoldingSource[],
  totalPortfolioNetValue: number,
): CrossExchangeHolding {
  const sortedSources =
    sortSources(sources);

  let totalQuantity = 0;
  let availableQuantity = 0;
  let lockedQuantity = 0;
  let borrowedQuantity = 0;
  let interestQuantity = 0;
  let netQuantity = 0;

  let grossReportingValue = 0;
  let liabilityReportingValue = 0;
  let netReportingValue = 0;

  let valuedSourceCount = 0;
  let unvaluedSourceCount = 0;

  let firstUpdatedAt =
    Number.POSITIVE_INFINITY;

  let lastUpdatedAt = 0;

  const exchangeIds =
    new Set<string>();

  const accountKeys =
    new Set<string>();

  for (const source of sortedSources) {
    totalQuantity +=
      source.totalQuantity;

    availableQuantity +=
      source.availableQuantity;

    lockedQuantity +=
      source.lockedQuantity;

    borrowedQuantity +=
      source.borrowedQuantity;

    interestQuantity +=
      source.interestQuantity;

    netQuantity +=
      source.netQuantity;

    const isFullyValued =
      source.grossReportingValue !== null &&
      source.liabilityReportingValue !== null &&
      source.netReportingValue !== null;

    if (isFullyValued) {
      grossReportingValue +=
        source.grossReportingValue ?? 0;

      liabilityReportingValue +=
        source.liabilityReportingValue ?? 0;

      netReportingValue +=
        source.netReportingValue ?? 0;

      valuedSourceCount += 1;
    } else {
      unvaluedSourceCount += 1;
    }

    firstUpdatedAt =
      Math.min(
        firstUpdatedAt,
        source.updatedAt,
      );

    lastUpdatedAt =
      Math.max(
        lastUpdatedAt,
        source.updatedAt,
      );

    exchangeIds.add(
      source.exchangeId,
    );

    accountKeys.add(
      createAccountKey(
        source.exchangeId,
        source.accountId,
      ),
    );
  }

  const sourceCount =
    sortedSources.length;

  const portfolioConcentrationRatio =
    totalPortfolioNetValue > 0
      ? netReportingValue /
        totalPortfolioNetValue
      : null;

  return Object.freeze({
    asset,

    classification:
      resolveClassification(
        asset,
        sortedSources,
      ),

    totalQuantity,
    availableQuantity,
    lockedQuantity,
    borrowedQuantity,
    interestQuantity,
    netQuantity,

    grossReportingValue,
    liabilityReportingValue,
    netReportingValue,

    valuedSourceCount,
    unvaluedSourceCount,
    sourceCount,

    exchangeCount:
      exchangeIds.size,

    accountCount:
      accountKeys.size,

    valuationCoverageRatio:
      calculateCoverageRatio(
        valuedSourceCount,
        sourceCount,
      ),

    portfolioConcentrationRatio,

    sources:
      sortedSources,

    firstUpdatedAt:
      firstUpdatedAt ===
      Number.POSITIVE_INFINITY
        ? 0
        : firstUpdatedAt,

    lastUpdatedAt,

    metadata:
      freezeMetadata({
        sourceCount,
        exchangeCount:
          exchangeIds.size,
        accountCount:
          accountKeys.size,
        valuedSourceCount,
        unvaluedSourceCount,
      }),
  });
}

function calculatePortfolioNetValue(
  balances: readonly LivePortfolioAssetBalance[],
): number {
  let total = 0;

  for (const balance of balances) {
    if (
      balance.netReportingValue !== null
    ) {
      total +=
        balance.netReportingValue;
    }
  }

  return total;
}

function buildTotals(
  holdings: readonly CrossExchangeHolding[],
): CrossExchangeHoldingsTotals {
  let sourceCount = 0;
  let grossReportingValue = 0;
  let liabilityReportingValue = 0;
  let netReportingValue = 0;
  let valuedSourceCount = 0;
  let unvaluedSourceCount = 0;

  const exchangeIds =
    new Set<string>();

  const accountKeys =
    new Set<string>();

  for (const holding of holdings) {
    sourceCount +=
      holding.sourceCount;

    grossReportingValue +=
      holding.grossReportingValue;

    liabilityReportingValue +=
      holding.liabilityReportingValue;

    netReportingValue +=
      holding.netReportingValue;

    valuedSourceCount +=
      holding.valuedSourceCount;

    unvaluedSourceCount +=
      holding.unvaluedSourceCount;

    for (const source of holding.sources) {
      exchangeIds.add(
        source.exchangeId,
      );

      accountKeys.add(
        createAccountKey(
          source.exchangeId,
          source.accountId,
        ),
      );
    }
  }

  return Object.freeze({
    assetCount:
      holdings.length,

    sourceCount,

    exchangeCount:
      exchangeIds.size,

    accountCount:
      accountKeys.size,

    grossReportingValue,
    liabilityReportingValue,
    netReportingValue,

    valuedSourceCount,
    unvaluedSourceCount,

    valuationCoverageRatio:
      calculateCoverageRatio(
        valuedSourceCount,
        sourceCount,
      ),
  });
}

export class DeterministicCrossExchangeHoldingsAggregator
implements CrossExchangeHoldingsAggregator {
  public aggregate(
    request: CrossExchangeHoldingsAggregationRequest,
  ): CrossExchangeHoldingsAggregation {
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
      request.aggregatedAt,
      "request.aggregatedAt",
    );

    if (
      request.aggregatedAt <
      request.portfolio.updatedAt
    ) {
      throw new Error(
        "request.aggregatedAt cannot be earlier than portfolio.updatedAt.",
      );
    }

    if (
      !Array.isArray(
        request.portfolio.balances,
      )
    ) {
      throw new Error(
        "request.portfolio.balances must be an array.",
      );
    }

    const sourceKeys =
      new Set<string>();

    const sourcesByAsset =
      new Map<
        string,
        CrossExchangeHoldingSource[]
      >();

    request.portfolio.balances.forEach(
      (balance, index) => {
        assertBalance(
          balance,
          index,
        );

        const sourceKey =
          createSourceKey(
            balance,
          );

        if (
          sourceKeys.has(
            sourceKey,
          )
        ) {
          throw new Error(
            `Duplicate portfolio balance source detected for key "${sourceKey}".`,
          );
        }

        sourceKeys.add(
          sourceKey,
        );

        const asset =
          normalizeAsset(
            balance.asset,
            `portfolio.balances[${index}].asset`,
          );

        const sources =
          sourcesByAsset.get(asset) ??
          [];

        sources.push(
          createSource(
            balance,
          ),
        );

        sourcesByAsset.set(
          asset,
          sources,
        );
      },
    );

    const totalPortfolioNetValue =
      calculatePortfolioNetValue(
        request.portfolio.balances,
      );

    const holdings =
      Object.freeze(
        Array.from(
          sourcesByAsset.entries(),
        )
          .sort(
            ([leftAsset], [rightAsset]) =>
              leftAsset.localeCompare(
                rightAsset,
              ),
          )
          .map(
            ([asset, sources]) =>
              buildHolding(
                asset,
                sources,
                totalPortfolioNetValue,
              ),
          ),
      );

    const totals =
      buildTotals(
        holdings,
      );

    return Object.freeze({
      portfolioId,
      reportingCurrency,

      holdings,
      totals,

      aggregatedAt:
        request.aggregatedAt,

      metadata:
        freezeMetadata({
          ...request.metadata,

          portfolioVersion:
            request.portfolio
              .synchronization.version,

          assetCount:
            totals.assetCount,

          sourceCount:
            totals.sourceCount,

          exchangeCount:
            totals.exchangeCount,

          accountCount:
            totals.accountCount,

          valuationCoverageRatio:
            totals.valuationCoverageRatio,
        }),
    });
  }
}

export function createCrossExchangeHoldingsAggregator():
DeterministicCrossExchangeHoldingsAggregator {
  return new DeterministicCrossExchangeHoldingsAggregator();
}

export function findCrossExchangeHolding(
  aggregation: CrossExchangeHoldingsAggregation,
  asset: string,
): CrossExchangeHolding | null {
  assertObject(
    aggregation,
    "aggregation",
  );

  const normalizedAsset =
    normalizeAsset(
      asset,
      "asset",
    );

  return (
    aggregation.holdings.find(
      holding =>
        holding.asset ===
        normalizedAsset,
    ) ??
    null
  );
}

export function findCrossExchangeHoldingSourcesByExchange(
  holding: CrossExchangeHolding,
  exchangeId: string,
): readonly CrossExchangeHoldingSource[] {
  assertObject(
    holding,
    "holding",
  );

  const normalizedExchangeId =
    normalizeIdentifier(
      exchangeId,
      "exchangeId",
    );

  return Object.freeze(
    holding.sources.filter(
      source =>
        source.exchangeId ===
        normalizedExchangeId,
    ),
  );
}