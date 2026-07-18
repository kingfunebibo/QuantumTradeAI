/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 1: Live Portfolio Domain Model
 *
 * This module defines the immutable core domain model used by the live
 * portfolio synchronization subsystem.
 *
 * Design guarantees:
 *
 * - Immutable domain objects
 * - Deterministic calculations
 * - Zero randomness
 * - No dependency on wall-clock time
 * - No exchange-specific implementation details
 * - Explicit account, asset, position, margin, exposure, and PnL models
 */

export type LivePortfolioAccountType =
  | "SPOT"
  | "MARGIN"
  | "CROSS_MARGIN"
  | "ISOLATED_MARGIN"
  | "FUTURES"
  | "PERPETUAL"
  | "OPTIONS"
  | "UNIFIED";

export type LivePortfolioPositionSide = "LONG" | "SHORT";

export type LivePortfolioPositionMode =
  | "ONE_WAY"
  | "HEDGE"
  | "NET";

export type LivePortfolioMarginMode =
  | "NONE"
  | "CROSS"
  | "ISOLATED"
  | "PORTFOLIO";

export type LivePortfolioSynchronizationStatus =
  | "UNINITIALIZED"
  | "INITIALIZING"
  | "SYNCHRONIZING"
  | "SYNCHRONIZED"
  | "DEGRADED"
  | "STALE"
  | "FAILED";

export type LivePortfolioHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export type LivePortfolioAssetClassification =
  | "BASE"
  | "QUOTE"
  | "COLLATERAL"
  | "SETTLEMENT"
  | "FEE"
  | "OTHER";

export type LivePortfolioInstrumentType =
  | "SPOT"
  | "MARGIN"
  | "FUTURE"
  | "PERPETUAL"
  | "OPTION"
  | "OTHER";

export type LivePortfolioMetadataValue =
  | string
  | number
  | boolean
  | null;

export type LivePortfolioMetadata = Readonly<
  Record<string, LivePortfolioMetadataValue>
>;

export interface LivePortfolioIdentity {
  readonly portfolioId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly reportingCurrency: string;
}

export interface LivePortfolioExchangeAccount {
  readonly exchangeId: string;
  readonly accountId: string;
  readonly accountType: LivePortfolioAccountType;
  readonly enabled: boolean;
  readonly synchronizationStatus: LivePortfolioSynchronizationStatus;
  readonly healthStatus: LivePortfolioHealthStatus;
  readonly lastSuccessfulSynchronizationAt: number | null;
  readonly lastSynchronizationAttemptAt: number | null;
  readonly lastFailureAt: number | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly metadata: LivePortfolioMetadata;
}

export interface LivePortfolioAssetBalance {
  readonly exchangeId: string;
  readonly accountId: string;
  readonly asset: string;
  readonly classification: LivePortfolioAssetClassification;

  /**
   * Total quantity reported for the asset.
   *
   * total = free + locked + borrowed adjustments where applicable,
   * according to the normalized exchange balance model.
   */
  readonly total: number;

  /**
   * Quantity available for trading or withdrawal.
   */
  readonly available: number;

  /**
   * Quantity reserved by open orders or exchange restrictions.
   */
  readonly locked: number;

  /**
   * Quantity borrowed from the exchange.
   */
  readonly borrowed: number;

  /**
   * Accrued borrowing interest.
   */
  readonly interest: number;

  /**
   * Net economic quantity after liabilities.
   */
  readonly net: number;

  /**
   * Mark or conversion price in the portfolio reporting currency.
   */
  readonly reportingPrice: number | null;

  /**
   * Gross asset value in the portfolio reporting currency.
   */
  readonly grossReportingValue: number | null;

  /**
   * Liability value in the portfolio reporting currency.
   */
  readonly liabilityReportingValue: number | null;

  /**
   * Net asset value in the portfolio reporting currency.
   */
  readonly netReportingValue: number | null;

  readonly capturedAt: number;
  readonly updatedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

export interface LivePortfolioPosition {
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
   * Absolute open position quantity.
   */
  readonly quantity: number;

  /**
   * Signed quantity:
   *
   * - LONG positions are positive
   * - SHORT positions are negative
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

export interface LivePortfolioOpenOrderExposure {
  readonly orderId: string;
  readonly clientOrderId: string | null;
  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly side: "BUY" | "SELL";
  readonly orderType: string;

  readonly originalQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;

  readonly limitPrice: number | null;
  readonly estimatedPrice: number | null;
  readonly remainingNotional: number | null;

  readonly reduceOnly: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface LivePortfolioCollateral {
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

export interface LivePortfolioMarginSummary {
  readonly totalCollateralValue: number;
  readonly weightedCollateralValue: number;

  readonly initialMarginRequirement: number;
  readonly maintenanceMarginRequirement: number;
  readonly marginUsed: number;
  readonly availableMargin: number;

  readonly marginBalance: number;
  readonly excessMargin: number;

  readonly marginUtilizationRatio: number;
  readonly maintenanceMarginRatio: number | null;

  readonly liquidationBuffer: number;
  readonly liquidationBufferRatio: number | null;

  readonly capturedAt: number;
}

export interface LivePortfolioExposureSummary {
  readonly grossLongExposure: number;
  readonly grossShortExposure: number;
  readonly grossExposure: number;
  readonly netExposure: number;

  readonly spotExposure: number;
  readonly derivativeExposure: number;
  readonly openOrderExposure: number;

  readonly leveragedExposure: number;
  readonly unleveragedExposure: number;

  readonly exposureToEquityRatio: number | null;
  readonly longShortRatio: number | null;

  readonly capturedAt: number;
}

export interface LivePortfolioPnlSummary {
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly fundingPnl: number;
  readonly feePnl: number;
  readonly interestPnl: number;
  readonly netPnl: number;

  readonly capturedAt: number;
}

export interface LivePortfolioValuation {
  readonly reportingCurrency: string;

  readonly grossAssetValue: number;
  readonly totalLiabilityValue: number;
  readonly netAssetValue: number;

  readonly cashValue: number;
  readonly collateralValue: number;
  readonly positionValue: number;

  readonly equity: number;
  readonly availableEquity: number;

  readonly capturedAt: number;
}

export interface LivePortfolioSynchronizationState {
  readonly status: LivePortfolioSynchronizationStatus;

  readonly expectedExchangeAccountCount: number;
  readonly synchronizedExchangeAccountCount: number;
  readonly failedExchangeAccountCount: number;
  readonly staleExchangeAccountCount: number;

  readonly synchronizationStartedAt: number | null;
  readonly synchronizationCompletedAt: number | null;

  readonly lastSuccessfulSynchronizationAt: number | null;
  readonly nextSynchronizationAt: number | null;

  readonly version: number;
}

export interface LivePortfolio {
  readonly identity: LivePortfolioIdentity;

  readonly exchangeAccounts: readonly LivePortfolioExchangeAccount[];
  readonly balances: readonly LivePortfolioAssetBalance[];
  readonly positions: readonly LivePortfolioPosition[];
  readonly openOrderExposures: readonly LivePortfolioOpenOrderExposure[];
  readonly collateral: readonly LivePortfolioCollateral[];

  readonly margin: LivePortfolioMarginSummary;
  readonly exposure: LivePortfolioExposureSummary;
  readonly pnl: LivePortfolioPnlSummary;
  readonly valuation: LivePortfolioValuation;
  readonly synchronization: LivePortfolioSynchronizationState;

  readonly createdAt: number;
  readonly updatedAt: number;
  readonly version: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface CreateLivePortfolioInput {
  readonly portfolioId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly reportingCurrency: string;
  readonly createdAt: number;
  readonly metadata?: LivePortfolioMetadata;
}

export interface ReplaceLivePortfolioStateInput {
  readonly portfolio: LivePortfolio;

  readonly exchangeAccounts?: readonly LivePortfolioExchangeAccount[];
  readonly balances?: readonly LivePortfolioAssetBalance[];
  readonly positions?: readonly LivePortfolioPosition[];
  readonly openOrderExposures?: readonly LivePortfolioOpenOrderExposure[];
  readonly collateral?: readonly LivePortfolioCollateral[];

  readonly margin?: LivePortfolioMarginSummary;
  readonly exposure?: LivePortfolioExposureSummary;
  readonly pnl?: LivePortfolioPnlSummary;
  readonly valuation?: LivePortfolioValuation;
  readonly synchronization?: LivePortfolioSynchronizationState;

  readonly updatedAt: number;
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

function normalizeAsset(
  value: string,
  field: string,
): string {
  return normalizeIdentifier(value, field).toUpperCase();
}

export function createEmptyLivePortfolioMetadata():
LivePortfolioMetadata {
  return Object.freeze({});
}

export function freezeLivePortfolioMetadata(
  metadata: LivePortfolioMetadata | undefined,
): LivePortfolioMetadata {
  if (metadata === undefined) {
    return createEmptyLivePortfolioMetadata();
  }

  const clonedMetadata: Record<
    string,
    LivePortfolioMetadataValue
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

    clonedMetadata[key] = value;
  }

  return Object.freeze(clonedMetadata);
}

export function createEmptyLivePortfolioMarginSummary(
  capturedAt: number,
): LivePortfolioMarginSummary {
  assertNonNegativeFiniteNumber(
    capturedAt,
    "capturedAt",
  );

  return Object.freeze({
    totalCollateralValue: 0,
    weightedCollateralValue: 0,
    initialMarginRequirement: 0,
    maintenanceMarginRequirement: 0,
    marginUsed: 0,
    availableMargin: 0,
    marginBalance: 0,
    excessMargin: 0,
    marginUtilizationRatio: 0,
    maintenanceMarginRatio: null,
    liquidationBuffer: 0,
    liquidationBufferRatio: null,
    capturedAt,
  });
}

export function createEmptyLivePortfolioExposureSummary(
  capturedAt: number,
): LivePortfolioExposureSummary {
  assertNonNegativeFiniteNumber(
    capturedAt,
    "capturedAt",
  );

  return Object.freeze({
    grossLongExposure: 0,
    grossShortExposure: 0,
    grossExposure: 0,
    netExposure: 0,
    spotExposure: 0,
    derivativeExposure: 0,
    openOrderExposure: 0,
    leveragedExposure: 0,
    unleveragedExposure: 0,
    exposureToEquityRatio: null,
    longShortRatio: null,
    capturedAt,
  });
}

export function createEmptyLivePortfolioPnlSummary(
  capturedAt: number,
): LivePortfolioPnlSummary {
  assertNonNegativeFiniteNumber(
    capturedAt,
    "capturedAt",
  );

  return Object.freeze({
    unrealizedPnl: 0,
    realizedPnl: 0,
    fundingPnl: 0,
    feePnl: 0,
    interestPnl: 0,
    netPnl: 0,
    capturedAt,
  });
}

export function createEmptyLivePortfolioValuation(
  reportingCurrency: string,
  capturedAt: number,
): LivePortfolioValuation {
  const normalizedReportingCurrency = normalizeAsset(
    reportingCurrency,
    "reportingCurrency",
  );

  assertNonNegativeFiniteNumber(
    capturedAt,
    "capturedAt",
  );

  return Object.freeze({
    reportingCurrency: normalizedReportingCurrency,
    grossAssetValue: 0,
    totalLiabilityValue: 0,
    netAssetValue: 0,
    cashValue: 0,
    collateralValue: 0,
    positionValue: 0,
    equity: 0,
    availableEquity: 0,
    capturedAt,
  });
}

export function createInitialLivePortfolioSynchronizationState():
LivePortfolioSynchronizationState {
  return Object.freeze({
    status: "UNINITIALIZED",
    expectedExchangeAccountCount: 0,
    synchronizedExchangeAccountCount: 0,
    failedExchangeAccountCount: 0,
    staleExchangeAccountCount: 0,
    synchronizationStartedAt: null,
    synchronizationCompletedAt: null,
    lastSuccessfulSynchronizationAt: null,
    nextSynchronizationAt: null,
    version: 1,
  });
}

function freezeLivePortfolioIdentity(
  identity: LivePortfolioIdentity,
): LivePortfolioIdentity {
  assertObject(identity, "identity");

  return Object.freeze({
    portfolioId: normalizeIdentifier(
      identity.portfolioId,
      "identity.portfolioId",
    ),
    ownerId: normalizeIdentifier(
      identity.ownerId,
      "identity.ownerId",
    ),
    name: normalizeIdentifier(
      identity.name,
      "identity.name",
    ),
    reportingCurrency: normalizeAsset(
      identity.reportingCurrency,
      "identity.reportingCurrency",
    ),
  });
}

function freezeExchangeAccount(
  account: LivePortfolioExchangeAccount,
): LivePortfolioExchangeAccount {
  assertObject(account, "exchangeAccount");

  assertNonNegativeFiniteNumber(
    account.lastSuccessfulSynchronizationAt ?? 0,
    "exchangeAccount.lastSuccessfulSynchronizationAt",
  );

  assertNonNegativeFiniteNumber(
    account.lastSynchronizationAttemptAt ?? 0,
    "exchangeAccount.lastSynchronizationAttemptAt",
  );

  assertNonNegativeFiniteNumber(
    account.lastFailureAt ?? 0,
    "exchangeAccount.lastFailureAt",
  );

  return Object.freeze({
    ...account,
    exchangeId: normalizeIdentifier(
      account.exchangeId,
      "exchangeAccount.exchangeId",
    ),
    accountId: normalizeIdentifier(
      account.accountId,
      "exchangeAccount.accountId",
    ),
    failureCode:
      account.failureCode === null
        ? null
        : normalizeIdentifier(
            account.failureCode,
            "exchangeAccount.failureCode",
          ),
    failureMessage:
      account.failureMessage === null
        ? null
        : normalizeIdentifier(
            account.failureMessage,
            "exchangeAccount.failureMessage",
          ),
    metadata: freezeLivePortfolioMetadata(
      account.metadata,
    ),
  });
}

function freezeAssetBalance(
  balance: LivePortfolioAssetBalance,
): LivePortfolioAssetBalance {
  assertObject(balance, "balance");

  assertNonNegativeFiniteNumber(
    balance.total,
    "balance.total",
  );
  assertNonNegativeFiniteNumber(
    balance.available,
    "balance.available",
  );
  assertNonNegativeFiniteNumber(
    balance.locked,
    "balance.locked",
  );
  assertNonNegativeFiniteNumber(
    balance.borrowed,
    "balance.borrowed",
  );
  assertNonNegativeFiniteNumber(
    balance.interest,
    "balance.interest",
  );
  assertFiniteNumber(
    balance.net,
    "balance.net",
  );

  if (balance.reportingPrice !== null) {
    assertNonNegativeFiniteNumber(
      balance.reportingPrice,
      "balance.reportingPrice",
    );
  }

  if (balance.grossReportingValue !== null) {
    assertNonNegativeFiniteNumber(
      balance.grossReportingValue,
      "balance.grossReportingValue",
    );
  }

  if (balance.liabilityReportingValue !== null) {
    assertNonNegativeFiniteNumber(
      balance.liabilityReportingValue,
      "balance.liabilityReportingValue",
    );
  }

  if (balance.netReportingValue !== null) {
    assertFiniteNumber(
      balance.netReportingValue,
      "balance.netReportingValue",
    );
  }

  assertNonNegativeFiniteNumber(
    balance.capturedAt,
    "balance.capturedAt",
  );
  assertNonNegativeFiniteNumber(
    balance.updatedAt,
    "balance.updatedAt",
  );

  if (balance.updatedAt < balance.capturedAt) {
    throw new Error(
      "balance.updatedAt cannot be earlier than balance.capturedAt.",
    );
  }

  return Object.freeze({
    ...balance,
    exchangeId: normalizeIdentifier(
      balance.exchangeId,
      "balance.exchangeId",
    ),
    accountId: normalizeIdentifier(
      balance.accountId,
      "balance.accountId",
    ),
    asset: normalizeAsset(
      balance.asset,
      "balance.asset",
    ),
    metadata: freezeLivePortfolioMetadata(
      balance.metadata,
    ),
  });
}

function freezePosition(
  position: LivePortfolioPosition,
): LivePortfolioPosition {
  assertObject(position, "position");

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
    position.leverage,
    "position.leverage",
  );
  assertNonNegativeFiniteNumber(
    position.entryNotional,
    "position.entryNotional",
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

  if (position.updatedAt < position.capturedAt) {
    throw new Error(
      "position.updatedAt cannot be earlier than position.capturedAt.",
    );
  }

  const expectedSignedQuantity =
    position.side === "LONG"
      ? position.quantity
      : -position.quantity;

  if (
    Math.abs(
      position.signedQuantity - expectedSignedQuantity,
    ) > Number.EPSILON
  ) {
    throw new Error(
      "position.signedQuantity must match position.side and position.quantity.",
    );
  }

  return Object.freeze({
    ...position,
    positionId: normalizeIdentifier(
      position.positionId,
      "position.positionId",
    ),
    exchangeId: normalizeIdentifier(
      position.exchangeId,
      "position.exchangeId",
    ),
    accountId: normalizeIdentifier(
      position.accountId,
      "position.accountId",
    ),
    symbol: normalizeIdentifier(
      position.symbol,
      "position.symbol",
    ).toUpperCase(),
    exchangeSymbol:
      position.exchangeSymbol === null
        ? null
        : normalizeIdentifier(
            position.exchangeSymbol,
            "position.exchangeSymbol",
          ),
    metadata: freezeLivePortfolioMetadata(
      position.metadata,
    ),
  });
}

function freezeOpenOrderExposure(
  exposure: LivePortfolioOpenOrderExposure,
): LivePortfolioOpenOrderExposure {
  assertObject(exposure, "openOrderExposure");

  assertNonNegativeFiniteNumber(
    exposure.originalQuantity,
    "openOrderExposure.originalQuantity",
  );
  assertNonNegativeFiniteNumber(
    exposure.filledQuantity,
    "openOrderExposure.filledQuantity",
  );
  assertNonNegativeFiniteNumber(
    exposure.remainingQuantity,
    "openOrderExposure.remainingQuantity",
  );
  assertNonNegativeFiniteNumber(
    exposure.createdAt,
    "openOrderExposure.createdAt",
  );
  assertNonNegativeFiniteNumber(
    exposure.updatedAt,
    "openOrderExposure.updatedAt",
  );

  if (
    exposure.filledQuantity >
    exposure.originalQuantity
  ) {
    throw new Error(
      "openOrderExposure.filledQuantity cannot exceed originalQuantity.",
    );
  }

  if (
    exposure.remainingQuantity >
    exposure.originalQuantity
  ) {
    throw new Error(
      "openOrderExposure.remainingQuantity cannot exceed originalQuantity.",
    );
  }

  return Object.freeze({
    ...exposure,
    orderId: normalizeIdentifier(
      exposure.orderId,
      "openOrderExposure.orderId",
    ),
    clientOrderId:
      exposure.clientOrderId === null
        ? null
        : normalizeIdentifier(
            exposure.clientOrderId,
            "openOrderExposure.clientOrderId",
          ),
    exchangeId: normalizeIdentifier(
      exposure.exchangeId,
      "openOrderExposure.exchangeId",
    ),
    accountId: normalizeIdentifier(
      exposure.accountId,
      "openOrderExposure.accountId",
    ),
    symbol: normalizeIdentifier(
      exposure.symbol,
      "openOrderExposure.symbol",
    ).toUpperCase(),
    exchangeSymbol:
      exposure.exchangeSymbol === null
        ? null
        : normalizeIdentifier(
            exposure.exchangeSymbol,
            "openOrderExposure.exchangeSymbol",
          ),
    orderType: normalizeIdentifier(
      exposure.orderType,
      "openOrderExposure.orderType",
    ).toUpperCase(),
    metadata: freezeLivePortfolioMetadata(
      exposure.metadata,
    ),
  });
}

function freezeCollateral(
  collateral: LivePortfolioCollateral,
): LivePortfolioCollateral {
  assertObject(collateral, "collateral");

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
  assertNonNegativeFiniteNumber(
    collateral.collateralWeight,
    "collateral.collateralWeight",
  );
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

  if (collateral.collateralWeight > 1) {
    throw new Error(
      "collateral.collateralWeight cannot exceed 1.",
    );
  }

  return Object.freeze({
    ...collateral,
    exchangeId: normalizeIdentifier(
      collateral.exchangeId,
      "collateral.exchangeId",
    ),
    accountId: normalizeIdentifier(
      collateral.accountId,
      "collateral.accountId",
    ),
    asset: normalizeAsset(
      collateral.asset,
      "collateral.asset",
    ),
    metadata: freezeLivePortfolioMetadata(
      collateral.metadata,
    ),
  });
}

function freezeMarginSummary(
  margin: LivePortfolioMarginSummary,
): LivePortfolioMarginSummary {
  return Object.freeze({
    ...margin,
  });
}

function freezeExposureSummary(
  exposure: LivePortfolioExposureSummary,
): LivePortfolioExposureSummary {
  return Object.freeze({
    ...exposure,
  });
}

function freezePnlSummary(
  pnl: LivePortfolioPnlSummary,
): LivePortfolioPnlSummary {
  return Object.freeze({
    ...pnl,
  });
}

function freezeValuation(
  valuation: LivePortfolioValuation,
): LivePortfolioValuation {
  return Object.freeze({
    ...valuation,
    reportingCurrency: normalizeAsset(
      valuation.reportingCurrency,
      "valuation.reportingCurrency",
    ),
  });
}

function freezeSynchronizationState(
  synchronization:
  LivePortfolioSynchronizationState,
): LivePortfolioSynchronizationState {
  assertPositiveInteger(
    synchronization.version,
    "synchronization.version",
  );

  return Object.freeze({
    ...synchronization,
  });
}

export function createLivePortfolio(
  input: CreateLivePortfolioInput,
): LivePortfolio {
  assertObject(input, "input");

  assertNonNegativeFiniteNumber(
    input.createdAt,
    "input.createdAt",
  );

  const identity = freezeLivePortfolioIdentity({
    portfolioId: input.portfolioId,
    ownerId: input.ownerId,
    name: input.name,
    reportingCurrency: input.reportingCurrency,
  });

  return Object.freeze({
    identity,
    exchangeAccounts: Object.freeze([]),
    balances: Object.freeze([]),
    positions: Object.freeze([]),
    openOrderExposures: Object.freeze([]),
    collateral: Object.freeze([]),

    margin:
      createEmptyLivePortfolioMarginSummary(
        input.createdAt,
      ),

    exposure:
      createEmptyLivePortfolioExposureSummary(
        input.createdAt,
      ),

    pnl:
      createEmptyLivePortfolioPnlSummary(
        input.createdAt,
      ),

    valuation:
      createEmptyLivePortfolioValuation(
        identity.reportingCurrency,
        input.createdAt,
      ),

    synchronization:
      createInitialLivePortfolioSynchronizationState(),

    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    version: 1,

    metadata: freezeLivePortfolioMetadata(
      input.metadata,
    ),
  });
}

export function cloneLivePortfolio(
  portfolio: LivePortfolio,
): LivePortfolio {
  assertObject(portfolio, "portfolio");

  assertPositiveInteger(
    portfolio.version,
    "portfolio.version",
  );

  return Object.freeze({
    identity:
      freezeLivePortfolioIdentity(
        portfolio.identity,
      ),

    exchangeAccounts: Object.freeze(
      portfolio.exchangeAccounts.map(
        freezeExchangeAccount,
      ),
    ),

    balances: Object.freeze(
      portfolio.balances.map(
        freezeAssetBalance,
      ),
    ),

    positions: Object.freeze(
      portfolio.positions.map(
        freezePosition,
      ),
    ),

    openOrderExposures: Object.freeze(
      portfolio.openOrderExposures.map(
        freezeOpenOrderExposure,
      ),
    ),

    collateral: Object.freeze(
      portfolio.collateral.map(
        freezeCollateral,
      ),
    ),

    margin:
      freezeMarginSummary(
        portfolio.margin,
      ),

    exposure:
      freezeExposureSummary(
        portfolio.exposure,
      ),

    pnl:
      freezePnlSummary(
        portfolio.pnl,
      ),

    valuation:
      freezeValuation(
        portfolio.valuation,
      ),

    synchronization:
      freezeSynchronizationState(
        portfolio.synchronization,
      ),

    createdAt: portfolio.createdAt,
    updatedAt: portfolio.updatedAt,
    version: portfolio.version,

    metadata:
      freezeLivePortfolioMetadata(
        portfolio.metadata,
      ),
  });
}

export function replaceLivePortfolioState(
  input: ReplaceLivePortfolioStateInput,
): LivePortfolio {
  assertObject(input, "input");

  const currentPortfolio =
    cloneLivePortfolio(input.portfolio);

  assertNonNegativeFiniteNumber(
    input.updatedAt,
    "input.updatedAt",
  );

  if (
    input.updatedAt <
    currentPortfolio.updatedAt
  ) {
    throw new Error(
      "input.updatedAt cannot be earlier than portfolio.updatedAt.",
    );
  }

  return cloneLivePortfolio({
    ...currentPortfolio,

    exchangeAccounts:
      input.exchangeAccounts ??
      currentPortfolio.exchangeAccounts,

    balances:
      input.balances ??
      currentPortfolio.balances,

    positions:
      input.positions ??
      currentPortfolio.positions,

    openOrderExposures:
      input.openOrderExposures ??
      currentPortfolio.openOrderExposures,

    collateral:
      input.collateral ??
      currentPortfolio.collateral,

    margin:
      input.margin ??
      currentPortfolio.margin,

    exposure:
      input.exposure ??
      currentPortfolio.exposure,

    pnl:
      input.pnl ??
      currentPortfolio.pnl,

    valuation:
      input.valuation ??
      currentPortfolio.valuation,

    synchronization:
      input.synchronization ??
      currentPortfolio.synchronization,

    updatedAt: input.updatedAt,
    version: currentPortfolio.version + 1,

    metadata:
      input.metadata ??
      currentPortfolio.metadata,
  });
}

export function calculateLivePortfolioSignedQuantity(
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

export function calculateLivePortfolioNetAssetQuantity(
  total: number,
  borrowed: number,
  interest: number,
): number {
  assertNonNegativeFiniteNumber(
    total,
    "total",
  );
  assertNonNegativeFiniteNumber(
    borrowed,
    "borrowed",
  );
  assertNonNegativeFiniteNumber(
    interest,
    "interest",
  );

  return total - borrowed - interest;
}

export function calculateLivePortfolioNotional(
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
  assertNonNegativeFiniteNumber(
    contractMultiplier,
    "contractMultiplier",
  );

  return (
    quantity *
    price *
    contractMultiplier
  );
}

export function calculateLivePortfolioUnrealizedPnl(
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
  assertNonNegativeFiniteNumber(
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

export function calculateLivePortfolioRatio(
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

export class LivePortfolioFactory {
  public create(
    input: CreateLivePortfolioInput,
  ): LivePortfolio {
    return createLivePortfolio(input);
  }

  public clone(
    portfolio: LivePortfolio,
  ): LivePortfolio {
    return cloneLivePortfolio(portfolio);
  }

  public replace(
    input: ReplaceLivePortfolioStateInput,
  ): LivePortfolio {
    return replaceLivePortfolioState(input);
  }
}

export function createLivePortfolioFactory():
LivePortfolioFactory {
  return new LivePortfolioFactory();
}