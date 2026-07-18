/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 5: Portfolio Aggregation Engine
 *
 * Aggregates normalized exchange-account portfolio state into one immutable,
 * deterministic live portfolio.
 */

import type {
  LivePortfolio,
  LivePortfolioAssetBalance,
  LivePortfolioCollateral,
  LivePortfolioExchangeAccount,
  LivePortfolioMetadata,
  LivePortfolioOpenOrderExposure,
  LivePortfolioPosition,
  LivePortfolioSynchronizationState,
} from "./live-portfolio";

import {
  replaceLivePortfolioState,
} from "./live-portfolio";

import type {
  ExchangeAccountSynchronizationResult,
  NormalizedExchangePortfolioState,
  PortfolioAggregationEngine,
  PortfolioAggregationRequest,
  PortfolioAggregationResult,
} from "./portfolio-synchronization-contracts";

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

function createBalanceKey(
  balance: LivePortfolioAssetBalance,
): string {
  return [
    balance.exchangeId,
    balance.accountId,
    balance.asset,
  ].join("\u0000");
}

function createPositionKey(
  position: LivePortfolioPosition,
): string {
  return [
    position.exchangeId,
    position.accountId,
    position.positionId,
  ].join("\u0000");
}

function createOpenOrderExposureKey(
  exposure: LivePortfolioOpenOrderExposure,
): string {
  return [
    exposure.exchangeId,
    exposure.accountId,
    exposure.orderId,
  ].join("\u0000");
}

function createCollateralKey(
  collateral: LivePortfolioCollateral,
): string {
  return [
    collateral.exchangeId,
    collateral.accountId,
    collateral.asset,
  ].join("\u0000");
}

function assertUniqueKeys<T>(
  values: readonly T[],
  keySelector: (value: T) => string,
  entityName: string,
): void {
  const observed = new Set<string>();

  for (const value of values) {
    const key = keySelector(value);

    if (observed.has(key)) {
      throw new Error(
        `Duplicate ${entityName} detected for key "${key}".`,
      );
    }

    observed.add(key);
  }
}

function sortExchangeAccounts(
  accounts: readonly LivePortfolioExchangeAccount[],
): readonly LivePortfolioExchangeAccount[] {
  return Object.freeze(
    [...accounts].sort((left, right) => {
      const exchangeComparison =
        left.exchangeId.localeCompare(right.exchangeId);

      if (exchangeComparison !== 0) {
        return exchangeComparison;
      }

      return left.accountId.localeCompare(right.accountId);
    }),
  );
}

function sortBalances(
  balances: readonly LivePortfolioAssetBalance[],
): readonly LivePortfolioAssetBalance[] {
  return Object.freeze(
    [...balances].sort((left, right) => {
      const exchangeComparison =
        left.exchangeId.localeCompare(right.exchangeId);

      if (exchangeComparison !== 0) {
        return exchangeComparison;
      }

      const accountComparison =
        left.accountId.localeCompare(right.accountId);

      if (accountComparison !== 0) {
        return accountComparison;
      }

      return left.asset.localeCompare(right.asset);
    }),
  );
}

function sortPositions(
  positions: readonly LivePortfolioPosition[],
): readonly LivePortfolioPosition[] {
  return Object.freeze(
    [...positions].sort((left, right) => {
      const exchangeComparison =
        left.exchangeId.localeCompare(right.exchangeId);

      if (exchangeComparison !== 0) {
        return exchangeComparison;
      }

      const accountComparison =
        left.accountId.localeCompare(right.accountId);

      if (accountComparison !== 0) {
        return accountComparison;
      }

      const symbolComparison =
        left.symbol.localeCompare(right.symbol);

      if (symbolComparison !== 0) {
        return symbolComparison;
      }

      const sideComparison =
        left.side.localeCompare(right.side);

      if (sideComparison !== 0) {
        return sideComparison;
      }

      return left.positionId.localeCompare(right.positionId);
    }),
  );
}

function sortOpenOrderExposures(
  exposures: readonly LivePortfolioOpenOrderExposure[],
): readonly LivePortfolioOpenOrderExposure[] {
  return Object.freeze(
    [...exposures].sort((left, right) => {
      const exchangeComparison =
        left.exchangeId.localeCompare(right.exchangeId);

      if (exchangeComparison !== 0) {
        return exchangeComparison;
      }

      const accountComparison =
        left.accountId.localeCompare(right.accountId);

      if (accountComparison !== 0) {
        return accountComparison;
      }

      const symbolComparison =
        left.symbol.localeCompare(right.symbol);

      if (symbolComparison !== 0) {
        return symbolComparison;
      }

      return left.orderId.localeCompare(right.orderId);
    }),
  );
}

function sortCollateral(
  collateral: readonly LivePortfolioCollateral[],
): readonly LivePortfolioCollateral[] {
  return Object.freeze(
    [...collateral].sort((left, right) => {
      const exchangeComparison =
        left.exchangeId.localeCompare(right.exchangeId);

      if (exchangeComparison !== 0) {
        return exchangeComparison;
      }

      const accountComparison =
        left.accountId.localeCompare(right.accountId);

      if (accountComparison !== 0) {
        return accountComparison;
      }

      return left.asset.localeCompare(right.asset);
    }),
  );
}

function assertNormalizedStateMatchesContext(
  state: NormalizedExchangePortfolioState,
  portfolioId: string,
): void {
  assertObject(state, "synchronizedAccount");

  assertNonEmptyString(
    state.exchangeAccount.exchangeId,
    "synchronizedAccount.exchangeAccount.exchangeId",
  );

  assertNonEmptyString(
    state.exchangeAccount.accountId,
    "synchronizedAccount.exchangeAccount.accountId",
  );

  assertNonEmptyString(
    state.sourceSnapshotId,
    "synchronizedAccount.sourceSnapshotId",
  );

  assertNonNegativeFiniteNumber(
    state.capturedAt,
    "synchronizedAccount.capturedAt",
  );

  assertNonNegativeFiniteNumber(
    state.normalizedAt,
    "synchronizedAccount.normalizedAt",
  );

  if (state.normalizedAt < state.capturedAt) {
    throw new Error(
      "synchronizedAccount.normalizedAt cannot be earlier than capturedAt.",
    );
  }

  const exchangeId =
    state.exchangeAccount.exchangeId;

  const accountId =
    state.exchangeAccount.accountId;

  for (const balance of state.balances) {
    if (
      balance.exchangeId !== exchangeId ||
      balance.accountId !== accountId
    ) {
      throw new Error(
        `Balance account mismatch while aggregating portfolio "${portfolioId}".`,
      );
    }
  }

  for (const position of state.positions) {
    if (
      position.exchangeId !== exchangeId ||
      position.accountId !== accountId
    ) {
      throw new Error(
        `Position account mismatch while aggregating portfolio "${portfolioId}".`,
      );
    }
  }

  for (const exposure of state.openOrderExposures) {
    if (
      exposure.exchangeId !== exchangeId ||
      exposure.accountId !== accountId
    ) {
      throw new Error(
        `Open-order exposure account mismatch while aggregating portfolio "${portfolioId}".`,
      );
    }
  }

  for (const collateral of state.collateral) {
    if (
      collateral.exchangeId !== exchangeId ||
      collateral.accountId !== accountId
    ) {
      throw new Error(
        `Collateral account mismatch while aggregating portfolio "${portfolioId}".`,
      );
    }
  }
}

function validateFailedResult(
  result: ExchangeAccountSynchronizationResult,
  portfolioId: string,
): void {
  assertObject(result, "failedAccount");

  if (result.portfolioId !== portfolioId) {
    throw new Error(
      "failedAccount.portfolioId does not match the aggregation portfolio.",
    );
  }

  if (
    result.status !== "FAILED" &&
    result.status !== "SKIPPED"
  ) {
    throw new Error(
      "failedAccounts may only contain FAILED or SKIPPED results.",
    );
  }

  if (
    result.status === "FAILED" &&
    result.failure === null
  ) {
    throw new Error(
      "A FAILED synchronization result must contain a failure.",
    );
  }
}

function createSynchronizationState(
  currentPortfolio: LivePortfolio,
  synchronizedAccounts:
    readonly NormalizedExchangePortfolioState[],
  failedAccounts:
    readonly ExchangeAccountSynchronizationResult[],
  aggregatedAt: number,
): LivePortfolioSynchronizationState {
  const synchronizedAccountCount =
    synchronizedAccounts.length;

  const failedAccountCount =
    failedAccounts.filter(
      result => result.status === "FAILED",
    ).length;

  const staleAccountCount =
    synchronizedAccounts.filter(
      state =>
        state.exchangeAccount.synchronizationStatus === "STALE",
    ).length;

  const expectedExchangeAccountCount =
    synchronizedAccountCount +
    failedAccounts.length;

  let status: LivePortfolioSynchronizationState["status"];

  if (
    expectedExchangeAccountCount > 0 &&
    synchronizedAccountCount === 0 &&
    failedAccountCount > 0
  ) {
    status = "FAILED";
  } else if (
    failedAccountCount > 0 ||
    staleAccountCount > 0
  ) {
    status = "DEGRADED";
  } else {
    status = "SYNCHRONIZED";
  }

  return Object.freeze({
    status,

    expectedExchangeAccountCount,
    synchronizedExchangeAccountCount:
      synchronizedAccountCount,
    failedExchangeAccountCount:
      failedAccountCount,
    staleExchangeAccountCount:
      staleAccountCount,

    synchronizationStartedAt:
      currentPortfolio.synchronization.synchronizationStartedAt,

    synchronizationCompletedAt:
      aggregatedAt,

    lastSuccessfulSynchronizationAt:
      synchronizedAccountCount > 0
        ? aggregatedAt
        : currentPortfolio.synchronization
            .lastSuccessfulSynchronizationAt,

    nextSynchronizationAt:
      currentPortfolio.synchronization.nextSynchronizationAt,

    version:
      currentPortfolio.synchronization.version + 1,
  });
}

function aggregateExchangeAccounts(
  states: readonly NormalizedExchangePortfolioState[],
): readonly LivePortfolioExchangeAccount[] {
  const accounts =
    states.map(state => state.exchangeAccount);

  assertUniqueKeys(
    accounts,
    account =>
      createAccountKey(
        account.exchangeId,
        account.accountId,
      ),
    "exchange account",
  );

  return sortExchangeAccounts(accounts);
}

function aggregateBalances(
  states: readonly NormalizedExchangePortfolioState[],
): readonly LivePortfolioAssetBalance[] {
  const balances =
    states.flatMap(state => [...state.balances]);

  assertUniqueKeys(
    balances,
    createBalanceKey,
    "balance",
  );

  return sortBalances(balances);
}

function aggregatePositions(
  states: readonly NormalizedExchangePortfolioState[],
): readonly LivePortfolioPosition[] {
  const positions =
    states.flatMap(state => [...state.positions]);

  assertUniqueKeys(
    positions,
    createPositionKey,
    "position",
  );

  return sortPositions(positions);
}

function aggregateOpenOrderExposures(
  states: readonly NormalizedExchangePortfolioState[],
): readonly LivePortfolioOpenOrderExposure[] {
  const exposures =
    states.flatMap(
      state => [...state.openOrderExposures],
    );

  assertUniqueKeys(
    exposures,
    createOpenOrderExposureKey,
    "open-order exposure",
  );

  return sortOpenOrderExposures(exposures);
}

function aggregateCollateral(
  states: readonly NormalizedExchangePortfolioState[],
): readonly LivePortfolioCollateral[] {
  const collateral =
    states.flatMap(state => [...state.collateral]);

  assertUniqueKeys(
    collateral,
    createCollateralKey,
    "collateral",
  );

  return sortCollateral(collateral);
}

function createAggregationMetadata(
  synchronizedAccountCount: number,
  failedAccountCount: number,
  staleAccountCount: number,
): LivePortfolioMetadata {
  return freezeMetadata({
    synchronizedAccountCount,
    failedAccountCount,
    staleAccountCount,
  });
}

export class DeterministicPortfolioAggregationEngine
implements PortfolioAggregationEngine {
  public aggregate(
    request: PortfolioAggregationRequest,
  ): PortfolioAggregationResult {
    assertObject(request, "request");
    assertObject(
      request.currentPortfolio,
      "request.currentPortfolio",
    );
    assertObject(
      request.context,
      "request.context",
    );

    const portfolioId =
      normalizeIdentifier(
        request.context.portfolioId,
        "request.context.portfolioId",
      );

    const synchronizationId =
      normalizeIdentifier(
        request.context.synchronizationId,
        "request.context.synchronizationId",
      );

    assertNonNegativeFiniteNumber(
      request.context.requestedAt,
      "request.context.requestedAt",
    );

    assertNonNegativeFiniteNumber(
      request.context.effectiveAt,
      "request.context.effectiveAt",
    );

    if (
      request.currentPortfolio.identity.portfolioId !==
      portfolioId
    ) {
      throw new Error(
        "request.currentPortfolio does not match request.context.portfolioId.",
      );
    }

    if (
      request.context.effectiveAt <
      request.currentPortfolio.updatedAt
    ) {
      throw new Error(
        "request.context.effectiveAt cannot be earlier than currentPortfolio.updatedAt.",
      );
    }

    if (
      !Array.isArray(request.synchronizedAccounts)
    ) {
      throw new Error(
        "request.synchronizedAccounts must be an array.",
      );
    }

    if (!Array.isArray(request.failedAccounts)) {
      throw new Error(
        "request.failedAccounts must be an array.",
      );
    }

    for (
      const state of request.synchronizedAccounts
    ) {
      assertNormalizedStateMatchesContext(
        state,
        portfolioId,
      );
    }

    for (
      const result of request.failedAccounts
    ) {
      validateFailedResult(
        result,
        portfolioId,
      );

      if (
        result.synchronizationId !==
        synchronizationId
      ) {
        throw new Error(
          "failedAccount.synchronizationId does not match request.context.synchronizationId.",
        );
      }
    }

    const accountKeys =
      request.synchronizedAccounts.map(
        state =>
          createAccountKey(
            state.exchangeAccount.exchangeId,
            state.exchangeAccount.accountId,
          ),
      );

    const failedAccountKeys =
      request.failedAccounts.map(
        result =>
          createAccountKey(
            result.exchangeId,
            result.accountId,
          ),
      );

    const allAccountKeys = [
      ...accountKeys,
      ...failedAccountKeys,
    ];

    if (
      new Set(allAccountKeys).size !==
      allAccountKeys.length
    ) {
      throw new Error(
        "An exchange account cannot appear in both synchronizedAccounts and failedAccounts.",
      );
    }

    const exchangeAccounts =
      aggregateExchangeAccounts(
        request.synchronizedAccounts,
      );

    const balances =
      aggregateBalances(
        request.synchronizedAccounts,
      );

    const positions =
      aggregatePositions(
        request.synchronizedAccounts,
      );

    const openOrderExposures =
      aggregateOpenOrderExposures(
        request.synchronizedAccounts,
      );

    const collateral =
      aggregateCollateral(
        request.synchronizedAccounts,
      );

    const synchronization =
      createSynchronizationState(
        request.currentPortfolio,
        request.synchronizedAccounts,
        request.failedAccounts,
        request.context.effectiveAt,
      );

    const portfolio =
      replaceLivePortfolioState({
        portfolio:
          request.currentPortfolio,

        exchangeAccounts,
        balances,
        positions,
        openOrderExposures,
        collateral,
        synchronization,

        updatedAt:
          request.context.effectiveAt,

        metadata:
          freezeMetadata({
            ...request.currentPortfolio.metadata,
            ...request.context.metadata,

            lastSynchronizationId:
              synchronizationId,

            lastAggregationSequence:
              request.context.sequence,

            synchronizedAccountCount:
              synchronization
                .synchronizedExchangeAccountCount,

            failedAccountCount:
              synchronization
                .failedExchangeAccountCount,

            staleAccountCount:
              synchronization
                .staleExchangeAccountCount,
          }),
      });

    const metadata =
      createAggregationMetadata(
        synchronization
          .synchronizedExchangeAccountCount,

        synchronization
          .failedExchangeAccountCount,

        synchronization
          .staleExchangeAccountCount,
      );

    return Object.freeze({
      portfolio,

      synchronizedAccountCount:
        synchronization
          .synchronizedExchangeAccountCount,

      failedAccountCount:
        synchronization
          .failedExchangeAccountCount,

      staleAccountCount:
        synchronization
          .staleExchangeAccountCount,

      aggregatedAt:
        request.context.effectiveAt,

      metadata,
    });
  }
}

export function createPortfolioAggregationEngine():
DeterministicPortfolioAggregationEngine {
  return new DeterministicPortfolioAggregationEngine();
}