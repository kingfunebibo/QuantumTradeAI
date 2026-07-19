import {
  EnterpriseRiskAccountReference,
  EnterpriseRiskCircuitBreaker,
  EnterpriseRiskConfiguration,
  EnterpriseRiskCorrelationSnapshot,
  EnterpriseRiskEvaluationRequest,
  EnterpriseRiskExposure,
  EnterpriseRiskExposureSnapshot,
  EnterpriseRiskLimit,
  EnterpriseRiskLiquiditySnapshot,
  EnterpriseRiskMarketReference,
  EnterpriseRiskMarketSnapshot,
  EnterpriseRiskOrderIntent,
  EnterpriseRiskPolicy,
  EnterpriseRiskPortfolioSnapshot,
  EnterpriseRiskPositionSnapshot,
  EnterpriseRiskStressScenario,
  EnterpriseRiskValueAtRiskSnapshot,
} from "./enterprise-risk-contracts";

export class EnterpriseRiskValidationError extends Error {
  public readonly field: string;

  public constructor(field: string, message: string) {
    super(`${field}: ${message}`);

    this.name = "EnterpriseRiskValidationError";
    this.field = field;

    Object.setPrototypeOf(this, EnterpriseRiskValidationError.prototype);
  }
}

function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertString(
  value: unknown,
  field: string,
  allowEmpty = false,
): asserts value is string {
  if (typeof value !== "string") {
    throw new EnterpriseRiskValidationError(field, "must be a string.");
  }

  if (!allowEmpty && value.trim().length === 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must not be empty.",
    );
  }
}

function assertOptionalString(
  value: unknown,
  field: string,
): asserts value is string | undefined {
  if (value !== undefined) {
    assertString(value, field);
  }
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new EnterpriseRiskValidationError(field, "must be a boolean.");
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

function assertNonNegativeNumber(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value < 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be greater than or equal to zero.",
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

function assertInteger(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (!Number.isInteger(value)) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be an integer.",
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  assertInteger(value, field);

  if (value < 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be greater than or equal to zero.",
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  assertInteger(value, field);

  if (value <= 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be greater than zero.",
    );
  }
}

function assertTimestamp(
  value: unknown,
  field: string,
): asserts value is number {
  assertNonNegativeInteger(value, field);
}

function assertOptionalFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number | undefined {
  if (value !== undefined) {
    assertFiniteNumber(value, field);
  }
}

function assertOptionalNonNegativeNumber(
  value: unknown,
  field: string,
): asserts value is number | undefined {
  if (value !== undefined) {
    assertNonNegativeNumber(value, field);
  }
}

function assertOptionalPositiveNumber(
  value: unknown,
  field: string,
): asserts value is number | undefined {
  if (value !== undefined) {
    assertPositiveNumber(value, field);
  }
}

function assertOptionalTimestamp(
  value: unknown,
  field: string,
): asserts value is number | undefined {
  if (value !== undefined) {
    assertTimestamp(value, field);
  }
}

function assertArray(
  value: unknown,
  field: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new EnterpriseRiskValidationError(field, "must be an array.");
  }
}

function assertEnumValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  field: string,
): asserts value is T {
  if (
    typeof value !== "string" ||
    !allowedValues.includes(value as T)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      `must be one of: ${allowedValues.join(", ")}.`,
    );
  }
}

function assertUniqueStrings(
  values: readonly string[],
  field: string,
): void {
  const uniqueValues = new Set(values);

  if (uniqueValues.size !== values.length) {
    throw new EnterpriseRiskValidationError(
      field,
      "must not contain duplicate values.",
    );
  }
}

function validateOptionalMetadata(
  metadata: unknown,
  field: string,
): void {
  if (metadata === undefined) {
    return;
  }

  assertRecord(metadata, field);

  for (const [key, value] of Object.entries(metadata)) {
    assertString(key, `${field}.key`);

    const isValid =
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean";

    if (!isValid) {
      throw new EnterpriseRiskValidationError(
        `${field}.${key}`,
        "must be a string, number, boolean, or null.",
      );
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new EnterpriseRiskValidationError(
        `${field}.${key}`,
        "must be a finite number.",
      );
    }
  }
}

const MARKET_TYPES = [
  "SPOT",
  "MARGIN",
  "PERPETUAL",
  "FUTURE",
  "OPTION",
  "DEX_SPOT",
  "DEX_LIQUIDITY",
  "CROSS_CHAIN",
] as const;

const POSITION_SIDES = ["LONG", "SHORT", "FLAT"] as const;

const ORDER_SIDES = ["BUY", "SELL"] as const;

const ORDER_TYPES = [
  "MARKET",
  "LIMIT",
  "STOP",
  "STOP_LIMIT",
  "TAKE_PROFIT",
  "TAKE_PROFIT_LIMIT",
  "TRAILING_STOP",
  "UNKNOWN",
] as const;

const MARGIN_MODES = [
  "NONE",
  "ISOLATED",
  "CROSS",
  "PORTFOLIO",
] as const;

const LIQUIDITY_LEVELS = [
  "VERY_LOW",
  "LOW",
  "MODERATE",
  "HIGH",
  "VERY_HIGH",
  "UNKNOWN",
] as const;

const VOLATILITY_LEVELS = [
  "VERY_LOW",
  "LOW",
  "MODERATE",
  "HIGH",
  "EXTREME",
  "UNKNOWN",
] as const;

const EVALUATION_MODES = [
  "PRE_TRADE",
  "POST_TRADE",
  "CONTINUOUS",
  "PORTFOLIO_REVIEW",
  "STRESS_TEST",
  "SIMULATION",
] as const;

const RISK_SEVERITIES = [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

const CIRCUIT_BREAKER_SCOPES = [
  "GLOBAL",
  "PORTFOLIO",
  "ACCOUNT",
  "EXCHANGE",
  "CHAIN",
  "ASSET",
  "SYMBOL",
  "STRATEGY",
  "BOT",
] as const;

const CIRCUIT_BREAKER_STATUSES = [
  "ARMED",
  "TRIGGERED",
  "RECOVERING",
  "DISABLED",
] as const;

const RISK_LIMIT_TYPES = [
  "MAX_ORDER_NOTIONAL",
  "MAX_POSITION_NOTIONAL",
  "MAX_PORTFOLIO_GROSS_EXPOSURE",
  "MAX_PORTFOLIO_NET_EXPOSURE",
  "MAX_ASSET_EXPOSURE",
  "MAX_EXCHANGE_EXPOSURE",
  "MAX_CHAIN_EXPOSURE",
  "MAX_STRATEGY_EXPOSURE",
  "MAX_WALLET_EXPOSURE",
  "MAX_OPEN_POSITIONS",
  "MAX_LEVERAGE",
  "MAX_MARGIN_UTILIZATION",
  "MAX_DAILY_LOSS",
  "MAX_WEEKLY_LOSS",
  "MAX_MONTHLY_LOSS",
  "MAX_DRAWDOWN",
  "MAX_CONSECUTIVE_LOSSES",
  "MAX_TRADES_PER_PERIOD",
  "MAX_SLIPPAGE_BPS",
  "MIN_LIQUIDITY",
  "MIN_RISK_REWARD_RATIO",
  "MAX_VALUE_AT_RISK",
  "MAX_CONDITIONAL_VALUE_AT_RISK",
  "MIN_LIQUIDATION_DISTANCE_BPS",
  "MAX_CORRELATION",
  "MAX_CONCENTRATION",
] as const;

const VALUE_AT_RISK_METHODOLOGIES = [
  "HISTORICAL",
  "PARAMETRIC",
  "MONTE_CARLO",
] as const;

function validateMarketReference(
  market: EnterpriseRiskMarketReference,
  field: string,
): void {
  assertRecord(market, field);

  assertOptionalString(market.exchangeId, `${field}.exchangeId`);
  assertOptionalString(market.chainId, `${field}.chainId`);
  assertOptionalString(market.venueId, `${field}.venueId`);
  assertString(market.symbol, `${field}.symbol`);
  assertString(market.baseAsset, `${field}.baseAsset`);
  assertString(market.quoteAsset, `${field}.quoteAsset`);
  assertEnumValue(
    market.marketType,
    MARKET_TYPES,
    `${field}.marketType`,
  );

  if (
    market.marketType.startsWith("DEX") &&
    market.chainId === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.chainId`,
      "is required for DEX markets.",
    );
  }

  if (
    market.marketType !== "DEX_SPOT" &&
    market.marketType !== "DEX_LIQUIDITY" &&
    market.marketType !== "CROSS_CHAIN" &&
    market.exchangeId === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.exchangeId`,
      "is required for centralized exchange markets.",
    );
  }
}

function validateAccountReference(
  account: EnterpriseRiskAccountReference,
  field: string,
): void {
  assertRecord(account, field);

  assertOptionalString(account.userId, `${field}.userId`);
  assertOptionalString(account.workspaceId, `${field}.workspaceId`);
  assertString(account.portfolioId, `${field}.portfolioId`);
  assertOptionalString(account.accountId, `${field}.accountId`);
  assertOptionalString(account.walletId, `${field}.walletId`);
  assertOptionalString(account.botId, `${field}.botId`);
  assertOptionalString(account.strategyId, `${field}.strategyId`);

  if (
    account.accountId === undefined &&
    account.walletId === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must identify at least one exchange account or wallet.",
    );
  }
}

function validateOrderIntent(
  orderIntent: EnterpriseRiskOrderIntent,
  field: string,
): void {
  assertRecord(orderIntent, field);

  assertOptionalString(orderIntent.orderId, `${field}.orderId`);
  assertOptionalString(
    orderIntent.clientOrderId,
    `${field}.clientOrderId`,
  );

  assertEnumValue(
    orderIntent.side,
    ORDER_SIDES,
    `${field}.side`,
  );

  assertEnumValue(
    orderIntent.type,
    ORDER_TYPES,
    `${field}.type`,
  );

  assertPositiveNumber(orderIntent.quantity, `${field}.quantity`);
  assertOptionalPositiveNumber(orderIntent.price, `${field}.price`);
  assertOptionalPositiveNumber(
    orderIntent.stopPrice,
    `${field}.stopPrice`,
  );
  assertPositiveNumber(
    orderIntent.estimatedNotional,
    `${field}.estimatedNotional`,
  );

  if (orderIntent.reduceOnly !== undefined) {
    assertBoolean(orderIntent.reduceOnly, `${field}.reduceOnly`);
  }

  if (orderIntent.postOnly !== undefined) {
    assertBoolean(orderIntent.postOnly, `${field}.postOnly`);
  }

  assertOptionalPositiveNumber(
    orderIntent.leverage,
    `${field}.leverage`,
  );

  if (orderIntent.marginMode !== undefined) {
    assertEnumValue(
      orderIntent.marginMode,
      MARGIN_MODES,
      `${field}.marginMode`,
    );
  }

  assertOptionalNonNegativeNumber(
    orderIntent.expectedSlippageBps,
    `${field}.expectedSlippageBps`,
  );

  assertOptionalNonNegativeNumber(
    orderIntent.expectedFeeAmount,
    `${field}.expectedFeeAmount`,
  );

  assertOptionalString(
    orderIntent.expectedFeeCurrency,
    `${field}.expectedFeeCurrency`,
  );

  if (
    orderIntent.type === "LIMIT" &&
    orderIntent.price === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.price`,
      "is required for limit orders.",
    );
  }

  if (
    (orderIntent.type === "STOP" ||
      orderIntent.type === "STOP_LIMIT" ||
      orderIntent.type === "TAKE_PROFIT" ||
      orderIntent.type === "TAKE_PROFIT_LIMIT") &&
    orderIntent.stopPrice === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.stopPrice`,
      `is required for ${orderIntent.type} orders.`,
    );
  }

  if (
    (orderIntent.type === "STOP_LIMIT" ||
      orderIntent.type === "TAKE_PROFIT_LIMIT") &&
    orderIntent.price === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.price`,
      `is required for ${orderIntent.type} orders.`,
    );
  }

  if (
    orderIntent.expectedFeeAmount !== undefined &&
    orderIntent.expectedFeeCurrency === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.expectedFeeCurrency`,
      "is required when expectedFeeAmount is provided.",
    );
  }
}

function validateMarketSnapshot(
  snapshot: EnterpriseRiskMarketSnapshot,
  field: string,
): void {
  assertRecord(snapshot, field);

  validateMarketReference(snapshot.market, `${field}.market`);
  assertTimestamp(snapshot.observedAt, `${field}.observedAt`);
  assertPositiveNumber(snapshot.lastPrice, `${field}.lastPrice`);
  assertOptionalPositiveNumber(snapshot.markPrice, `${field}.markPrice`);
  assertOptionalPositiveNumber(
    snapshot.indexPrice,
    `${field}.indexPrice`,
  );
  assertOptionalPositiveNumber(snapshot.bidPrice, `${field}.bidPrice`);
  assertOptionalPositiveNumber(snapshot.askPrice, `${field}.askPrice`);
  assertOptionalNonNegativeNumber(
    snapshot.spreadBps,
    `${field}.spreadBps`,
  );
  assertOptionalNonNegativeNumber(
    snapshot.availableBidLiquidity,
    `${field}.availableBidLiquidity`,
  );
  assertOptionalNonNegativeNumber(
    snapshot.availableAskLiquidity,
    `${field}.availableAskLiquidity`,
  );
  assertOptionalNonNegativeNumber(
    snapshot.twentyFourHourVolume,
    `${field}.twentyFourHourVolume`,
  );
  assertOptionalNonNegativeNumber(
    snapshot.volatility,
    `${field}.volatility`,
  );

  if (snapshot.volatilityLevel !== undefined) {
    assertEnumValue(
      snapshot.volatilityLevel,
      VOLATILITY_LEVELS,
      `${field}.volatilityLevel`,
    );
  }

  if (snapshot.liquidityLevel !== undefined) {
    assertEnumValue(
      snapshot.liquidityLevel,
      LIQUIDITY_LEVELS,
      `${field}.liquidityLevel`,
    );
  }

  assertOptionalFiniteNumber(
    snapshot.fundingRate,
    `${field}.fundingRate`,
  );
  assertOptionalNonNegativeNumber(
    snapshot.openInterest,
    `${field}.openInterest`,
  );

  validateOptionalMetadata(snapshot.metadata, `${field}.metadata`);

  if (
    snapshot.bidPrice !== undefined &&
    snapshot.askPrice !== undefined &&
    snapshot.bidPrice > snapshot.askPrice
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "bidPrice must not exceed askPrice.",
    );
  }
}

function validatePositionSnapshot(
  position: EnterpriseRiskPositionSnapshot,
  field: string,
): void {
  assertRecord(position, field);

  assertString(position.positionId, `${field}.positionId`);
  assertString(position.portfolioId, `${field}.portfolioId`);
  assertOptionalString(position.accountId, `${field}.accountId`);
  assertOptionalString(position.walletId, `${field}.walletId`);
  assertOptionalString(position.exchangeId, `${field}.exchangeId`);
  assertOptionalString(position.chainId, `${field}.chainId`);
  assertOptionalString(position.strategyId, `${field}.strategyId`);
  assertOptionalString(position.botId, `${field}.botId`);
  assertString(position.symbol, `${field}.symbol`);
  assertString(position.baseAsset, `${field}.baseAsset`);
  assertString(position.quoteAsset, `${field}.quoteAsset`);

  assertEnumValue(
    position.marketType,
    MARKET_TYPES,
    `${field}.marketType`,
  );

  assertEnumValue(
    position.side,
    POSITION_SIDES,
    `${field}.side`,
  );

  assertNonNegativeNumber(position.quantity, `${field}.quantity`);
  assertPositiveNumber(position.entryPrice, `${field}.entryPrice`);
  assertPositiveNumber(position.markPrice, `${field}.markPrice`);
  assertNonNegativeNumber(
    position.notionalValue,
    `${field}.notionalValue`,
  );
  assertNonNegativeNumber(position.leverage, `${field}.leverage`);

  assertEnumValue(
    position.marginMode,
    MARGIN_MODES,
    `${field}.marginMode`,
  );

  assertOptionalNonNegativeNumber(
    position.initialMargin,
    `${field}.initialMargin`,
  );
  assertOptionalNonNegativeNumber(
    position.maintenanceMargin,
    `${field}.maintenanceMargin`,
  );
  assertOptionalPositiveNumber(
    position.liquidationPrice,
    `${field}.liquidationPrice`,
  );

  assertFiniteNumber(
    position.unrealizedPnl,
    `${field}.unrealizedPnl`,
  );
  assertFiniteNumber(position.realizedPnl, `${field}.realizedPnl`);
  assertTimestamp(position.openedAt, `${field}.openedAt`);
  assertTimestamp(position.updatedAt, `${field}.updatedAt`);

  validateOptionalMetadata(position.metadata, `${field}.metadata`);

  if (position.updatedAt < position.openedAt) {
    throw new EnterpriseRiskValidationError(
      `${field}.updatedAt`,
      "must not be earlier than openedAt.",
    );
  }

  if (position.side === "FLAT" && position.quantity !== 0) {
    throw new EnterpriseRiskValidationError(
      `${field}.quantity`,
      "must be zero when side is FLAT.",
    );
  }

  if (
    position.side !== "FLAT" &&
    position.quantity === 0
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.quantity`,
      "must be greater than zero for an open position.",
    );
  }

  if (
    position.marketType === "SPOT" &&
    position.leverage > 1
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.leverage`,
      "must not exceed 1 for spot positions.",
    );
  }
}

function validatePortfolioSnapshot(
  portfolio: EnterpriseRiskPortfolioSnapshot,
  field: string,
): void {
  assertRecord(portfolio, field);

  assertString(portfolio.portfolioId, `${field}.portfolioId`);
  assertString(
    portfolio.reportingCurrency,
    `${field}.reportingCurrency`,
  );

  assertNonNegativeNumber(
    portfolio.totalEquity,
    `${field}.totalEquity`,
  );
  assertNonNegativeNumber(
    portfolio.cashBalance,
    `${field}.cashBalance`,
  );
  assertNonNegativeNumber(
    portfolio.grossExposure,
    `${field}.grossExposure`,
  );
  assertFiniteNumber(
    portfolio.netExposure,
    `${field}.netExposure`,
  );
  assertNonNegativeNumber(
    portfolio.longExposure,
    `${field}.longExposure`,
  );
  assertNonNegativeNumber(
    portfolio.shortExposure,
    `${field}.shortExposure`,
  );
  assertFiniteNumber(
    portfolio.realizedPnl,
    `${field}.realizedPnl`,
  );
  assertFiniteNumber(
    portfolio.unrealizedPnl,
    `${field}.unrealizedPnl`,
  );
  assertFiniteNumber(portfolio.dailyPnl, `${field}.dailyPnl`);
  assertFiniteNumber(portfolio.weeklyPnl, `${field}.weeklyPnl`);
  assertFiniteNumber(portfolio.monthlyPnl, `${field}.monthlyPnl`);
  assertNonNegativeNumber(
    portfolio.peakEquity,
    `${field}.peakEquity`,
  );
  assertNonNegativeNumber(
    portfolio.currentDrawdown,
    `${field}.currentDrawdown`,
  );
  assertNonNegativeNumber(
    portfolio.currentDrawdownPercentage,
    `${field}.currentDrawdownPercentage`,
  );
  assertNonNegativeInteger(
    portfolio.consecutiveLosses,
    `${field}.consecutiveLosses`,
  );
  assertNonNegativeInteger(
    portfolio.openPositionCount,
    `${field}.openPositionCount`,
  );

  assertArray(portfolio.positions, `${field}.positions`);

  portfolio.positions.forEach((position, index) => {
    validatePositionSnapshot(
      position,
      `${field}.positions[${index}]`,
    );

    if (position.portfolioId !== portfolio.portfolioId) {
      throw new EnterpriseRiskValidationError(
        `${field}.positions[${index}].portfolioId`,
        "must match the containing portfolioId.",
      );
    }
  });

  const positionIds = portfolio.positions.map(
    (position) => position.positionId,
  );

  assertUniqueStrings(positionIds, `${field}.positions.positionId`);

  assertArray(portfolio.accounts, `${field}.accounts`);

  portfolio.accounts.forEach((account, accountIndex) => {
    assertRecord(account, `${field}.accounts[${accountIndex}]`);
    assertString(
      account.accountId,
      `${field}.accounts[${accountIndex}].accountId`,
    );
    assertString(
      account.portfolioId,
      `${field}.accounts[${accountIndex}].portfolioId`,
    );

    if (account.portfolioId !== portfolio.portfolioId) {
      throw new EnterpriseRiskValidationError(
        `${field}.accounts[${accountIndex}].portfolioId`,
        "must match the containing portfolioId.",
      );
    }

    assertOptionalString(
      account.exchangeId,
      `${field}.accounts[${accountIndex}].exchangeId`,
    );
    assertOptionalString(
      account.walletId,
      `${field}.accounts[${accountIndex}].walletId`,
    );
    assertOptionalString(
      account.chainId,
      `${field}.accounts[${accountIndex}].chainId`,
    );
    assertString(
      account.reportingCurrency,
      `${field}.accounts[${accountIndex}].reportingCurrency`,
    );
    assertNonNegativeNumber(
      account.equity,
      `${field}.accounts[${accountIndex}].equity`,
    );
    assertNonNegativeNumber(
      account.availableBalance,
      `${field}.accounts[${accountIndex}].availableBalance`,
    );
    assertNonNegativeNumber(
      account.usedMargin,
      `${field}.accounts[${accountIndex}].usedMargin`,
    );
    assertNonNegativeNumber(
      account.availableMargin,
      `${field}.accounts[${accountIndex}].availableMargin`,
    );
    assertNonNegativeNumber(
      account.maintenanceMargin,
      `${field}.accounts[${accountIndex}].maintenanceMargin`,
    );
    assertNonNegativeNumber(
      account.marginUtilization,
      `${field}.accounts[${accountIndex}].marginUtilization`,
    );
    assertFiniteNumber(
      account.realizedPnl,
      `${field}.accounts[${accountIndex}].realizedPnl`,
    );
    assertFiniteNumber(
      account.unrealizedPnl,
      `${field}.accounts[${accountIndex}].unrealizedPnl`,
    );
    assertTimestamp(
      account.observedAt,
      `${field}.accounts[${accountIndex}].observedAt`,
    );

    assertArray(
      account.balances,
      `${field}.accounts[${accountIndex}].balances`,
    );

    account.balances.forEach((balance, balanceIndex) => {
      const balanceField =
        `${field}.accounts[${accountIndex}].balances[${balanceIndex}]`;

      assertRecord(balance, balanceField);
      assertString(balance.asset, `${balanceField}.asset`);
      assertNonNegativeNumber(balance.total, `${balanceField}.total`);
      assertNonNegativeNumber(
        balance.available,
        `${balanceField}.available`,
      );
      assertNonNegativeNumber(
        balance.locked,
        `${balanceField}.locked`,
      );
      assertOptionalNonNegativeNumber(
        balance.borrowed,
        `${balanceField}.borrowed`,
      );
      assertOptionalNonNegativeNumber(
        balance.interest,
        `${balanceField}.interest`,
      );
      assertNonNegativeNumber(
        balance.valueInReportingCurrency,
        `${balanceField}.valueInReportingCurrency`,
      );

      const balanceTolerance = Math.max(
        1e-8,
        Math.abs(balance.total) * 1e-8,
      );

      if (
        balance.available + balance.locked >
        balance.total + balanceTolerance
      ) {
        throw new EnterpriseRiskValidationError(
          balanceField,
          "available plus locked must not exceed total.",
        );
      }
    });

    validateOptionalMetadata(
      account.metadata,
      `${field}.accounts[${accountIndex}].metadata`,
    );
  });

  const accountIds = portfolio.accounts.map(
    (account) => account.accountId,
  );

  assertUniqueStrings(accountIds, `${field}.accounts.accountId`);

  assertTimestamp(portfolio.observedAt, `${field}.observedAt`);
  validateOptionalMetadata(portfolio.metadata, `${field}.metadata`);

  if (
    portfolio.openPositionCount !==
    portfolio.positions.filter(
      (position) => position.side !== "FLAT",
    ).length
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.openPositionCount`,
      "must match the number of non-flat positions.",
    );
  }

  const expectedGrossExposure =
    portfolio.longExposure + portfolio.shortExposure;

  const grossTolerance = Math.max(
    1e-8,
    expectedGrossExposure * 1e-8,
  );

  if (
    Math.abs(
      portfolio.grossExposure - expectedGrossExposure,
    ) > grossTolerance
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.grossExposure`,
      "must equal longExposure plus shortExposure.",
    );
  }

  const expectedNetExposure =
    portfolio.longExposure - portfolio.shortExposure;

  const netTolerance = Math.max(
    1e-8,
    Math.abs(expectedNetExposure) * 1e-8,
  );

  if (
    Math.abs(
      portfolio.netExposure - expectedNetExposure,
    ) > netTolerance
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.netExposure`,
      "must equal longExposure minus shortExposure.",
    );
  }

  if (
    portfolio.peakEquity > 0 &&
    portfolio.totalEquity > portfolio.peakEquity
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.peakEquity`,
      "must be greater than or equal to totalEquity.",
    );
  }
}

function validateExposureEntries(
  entries: readonly EnterpriseRiskExposure[],
  field: string,
): void {
  assertArray(entries, field);

  entries.forEach((entry, index) => {
    const entryField = `${field}[${index}]`;

    assertRecord(entry, entryField);
    assertString(entry.key, `${entryField}.key`);
    assertFiniteNumber(entry.value, `${entryField}.value`);
    assertNonNegativeNumber(
      entry.percentageOfEquity,
      `${entryField}.percentageOfEquity`,
    );
  });

  assertUniqueStrings(
    entries.map((entry) => entry.key),
    `${field}.key`,
  );
}

function validateExposureSnapshot(
  snapshot: EnterpriseRiskExposureSnapshot,
  field: string,
): void {
  assertRecord(snapshot, field);

  assertNonNegativeNumber(
    snapshot.grossExposure,
    `${field}.grossExposure`,
  );
  assertFiniteNumber(snapshot.netExposure, `${field}.netExposure`);
  assertNonNegativeNumber(
    snapshot.longExposure,
    `${field}.longExposure`,
  );
  assertNonNegativeNumber(
    snapshot.shortExposure,
    `${field}.shortExposure`,
  );

  validateExposureEntries(
    snapshot.assetExposures,
    `${field}.assetExposures`,
  );
  validateExposureEntries(
    snapshot.exchangeExposures,
    `${field}.exchangeExposures`,
  );
  validateExposureEntries(
    snapshot.chainExposures,
    `${field}.chainExposures`,
  );
  validateExposureEntries(
    snapshot.strategyExposures,
    `${field}.strategyExposures`,
  );
  validateExposureEntries(
    snapshot.walletExposures,
    `${field}.walletExposures`,
  );

  assertTimestamp(snapshot.calculatedAt, `${field}.calculatedAt`);
}

function validateValueAtRiskSnapshot(
  snapshot: EnterpriseRiskValueAtRiskSnapshot,
  field: string,
): void {
  assertRecord(snapshot, field);

  assertEnumValue(
    snapshot.methodology,
    VALUE_AT_RISK_METHODOLOGIES,
    `${field}.methodology`,
  );

  assertFiniteNumber(
    snapshot.confidenceLevel,
    `${field}.confidenceLevel`,
  );

  if (
    snapshot.confidenceLevel <= 0 ||
    snapshot.confidenceLevel >= 1
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.confidenceLevel`,
      "must be greater than zero and less than one.",
    );
  }

  assertPositiveInteger(snapshot.horizonDays, `${field}.horizonDays`);
  assertNonNegativeNumber(
    snapshot.valueAtRisk,
    `${field}.valueAtRisk`,
  );
  assertNonNegativeNumber(
    snapshot.conditionalValueAtRisk,
    `${field}.conditionalValueAtRisk`,
  );
  assertString(
    snapshot.reportingCurrency,
    `${field}.reportingCurrency`,
  );
  assertPositiveInteger(snapshot.sampleSize, `${field}.sampleSize`);
  assertTimestamp(snapshot.calculatedAt, `${field}.calculatedAt`);
  validateOptionalMetadata(snapshot.metadata, `${field}.metadata`);

  if (
    snapshot.conditionalValueAtRisk <
    snapshot.valueAtRisk
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.conditionalValueAtRisk`,
      "must be greater than or equal to valueAtRisk.",
    );
  }
}

function validateCorrelationSnapshot(
  snapshot: EnterpriseRiskCorrelationSnapshot,
  field: string,
): void {
  assertRecord(snapshot, field);
  assertArray(snapshot.entries, `${field}.entries`);

  snapshot.entries.forEach((entry, index) => {
    const entryField = `${field}.entries[${index}]`;

    assertRecord(entry, entryField);
    assertString(entry.leftAsset, `${entryField}.leftAsset`);
    assertString(entry.rightAsset, `${entryField}.rightAsset`);
    assertFiniteNumber(entry.correlation, `${entryField}.correlation`);

    if (
      entry.correlation < -1 ||
      entry.correlation > 1
    ) {
      throw new EnterpriseRiskValidationError(
        `${entryField}.correlation`,
        "must be between -1 and 1.",
      );
    }

    if (entry.leftAsset === entry.rightAsset) {
      throw new EnterpriseRiskValidationError(
        entryField,
        "must reference two different assets.",
      );
    }
  });

  assertNonNegativeNumber(
    snapshot.maximumObservedCorrelation,
    `${field}.maximumObservedCorrelation`,
  );

  if (snapshot.maximumObservedCorrelation > 1) {
    throw new EnterpriseRiskValidationError(
      `${field}.maximumObservedCorrelation`,
      "must not exceed 1.",
    );
  }

  const maximumAbsoluteCorrelation = snapshot.entries.reduce(
    (maximum, entry) =>
      Math.max(maximum, Math.abs(entry.correlation)),
    0,
  );

  const tolerance = 1e-12;

  if (
    Math.abs(
      snapshot.maximumObservedCorrelation -
        maximumAbsoluteCorrelation,
    ) > tolerance
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.maximumObservedCorrelation`,
      "must match the maximum absolute correlation in entries.",
    );
  }

  assertTimestamp(snapshot.calculatedAt, `${field}.calculatedAt`);
}

function validateLiquiditySnapshot(
  snapshot: EnterpriseRiskLiquiditySnapshot,
  field: string,
): void {
  assertRecord(snapshot, field);

  assertString(snapshot.symbol, `${field}.symbol`);
  assertOptionalString(snapshot.exchangeId, `${field}.exchangeId`);
  assertOptionalString(snapshot.chainId, `${field}.chainId`);
  assertNonNegativeNumber(
    snapshot.bidLiquidity,
    `${field}.bidLiquidity`,
  );
  assertNonNegativeNumber(
    snapshot.askLiquidity,
    `${field}.askLiquidity`,
  );
  assertNonNegativeNumber(
    snapshot.spreadBps,
    `${field}.spreadBps`,
  );
  assertNonNegativeNumber(
    snapshot.expectedSlippageBps,
    `${field}.expectedSlippageBps`,
  );

  assertEnumValue(
    snapshot.liquidityLevel,
    LIQUIDITY_LEVELS,
    `${field}.liquidityLevel`,
  );

  assertTimestamp(snapshot.observedAt, `${field}.observedAt`);
}

function validateLimit(
  limit: EnterpriseRiskLimit,
  field: string,
): void {
  assertRecord(limit, field);

  assertString(limit.id, `${field}.id`);
  assertEnumValue(limit.type, RISK_LIMIT_TYPES, `${field}.type`);
  assertEnumValue(
    limit.scope,
    CIRCUIT_BREAKER_SCOPES,
    `${field}.scope`,
  );
  assertOptionalString(limit.scopeId, `${field}.scopeId`);
  assertBoolean(limit.enabled, `${field}.enabled`);
  assertNonNegativeNumber(limit.threshold, `${field}.threshold`);
  assertOptionalNonNegativeNumber(
    limit.warningThreshold,
    `${field}.warningThreshold`,
  );
  assertOptionalString(limit.currency, `${field}.currency`);

  if (limit.timeWindowMs !== undefined) {
    assertPositiveInteger(
      limit.timeWindowMs,
      `${field}.timeWindowMs`,
    );
  }

  assertEnumValue(
    limit.severity,
    RISK_SEVERITIES,
    `${field}.severity`,
  );

  validateOptionalMetadata(limit.metadata, `${field}.metadata`);

  if (
    limit.scope !== "GLOBAL" &&
    limit.scope !== "PORTFOLIO" &&
    limit.scopeId === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.scopeId`,
      `is required for ${limit.scope} limits.`,
    );
  }

  if (
    limit.warningThreshold !== undefined &&
    limit.type.startsWith("MAX_") &&
    limit.warningThreshold > limit.threshold
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.warningThreshold`,
      "must not exceed threshold for maximum limits.",
    );
  }

  if (
    limit.warningThreshold !== undefined &&
    limit.type.startsWith("MIN_") &&
    limit.warningThreshold < limit.threshold
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.warningThreshold`,
      "must not be lower than threshold for minimum limits.",
    );
  }
}

function validatePolicy(
  policy: EnterpriseRiskPolicy,
  field: string,
): void {
  assertRecord(policy, field);

  assertString(policy.id, `${field}.id`);
  assertString(policy.name, `${field}.name`);
  assertOptionalString(policy.description, `${field}.description`);
  assertPositiveInteger(policy.version, `${field}.version`);
  assertBoolean(policy.enabled, `${field}.enabled`);
  assertOptionalString(policy.portfolioId, `${field}.portfolioId`);
  assertOptionalString(policy.accountId, `${field}.accountId`);
  assertOptionalString(policy.strategyId, `${field}.strategyId`);
  assertOptionalString(policy.botId, `${field}.botId`);
  assertArray(policy.limits, `${field}.limits`);

  policy.limits.forEach((limit, index) => {
    validateLimit(limit, `${field}.limits[${index}]`);
  });

  assertUniqueStrings(
    policy.limits.map((limit) => limit.id),
    `${field}.limits.id`,
  );

  assertTimestamp(policy.createdAt, `${field}.createdAt`);
  assertTimestamp(policy.updatedAt, `${field}.updatedAt`);
  validateOptionalMetadata(policy.metadata, `${field}.metadata`);

  if (policy.updatedAt < policy.createdAt) {
    throw new EnterpriseRiskValidationError(
      `${field}.updatedAt`,
      "must not be earlier than createdAt.",
    );
  }
}

function validateCircuitBreaker(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  field: string,
): void {
  assertRecord(circuitBreaker, field);

  assertString(circuitBreaker.id, `${field}.id`);
  assertEnumValue(
    circuitBreaker.scope,
    CIRCUIT_BREAKER_SCOPES,
    `${field}.scope`,
  );
  assertOptionalString(
    circuitBreaker.scopeId,
    `${field}.scopeId`,
  );
  assertEnumValue(
    circuitBreaker.status,
    CIRCUIT_BREAKER_STATUSES,
    `${field}.status`,
  );
  assertOptionalString(
    circuitBreaker.reason,
    `${field}.reason`,
  );
  assertOptionalTimestamp(
    circuitBreaker.triggeredAt,
    `${field}.triggeredAt`,
  );
  assertOptionalTimestamp(
    circuitBreaker.recoveryEligibleAt,
    `${field}.recoveryEligibleAt`,
  );
  assertBoolean(
    circuitBreaker.manuallyTriggered,
    `${field}.manuallyTriggered`,
  );

  validateOptionalMetadata(
    circuitBreaker.metadata,
    `${field}.metadata`,
  );

  if (
    circuitBreaker.scope !== "GLOBAL" &&
    circuitBreaker.scopeId === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.scopeId`,
      `is required for ${circuitBreaker.scope} circuit breakers.`,
    );
  }

  if (
    circuitBreaker.status === "TRIGGERED" &&
    circuitBreaker.triggeredAt === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.triggeredAt`,
      "is required when status is TRIGGERED.",
    );
  }

  if (
    circuitBreaker.recoveryEligibleAt !== undefined &&
    circuitBreaker.triggeredAt !== undefined &&
    circuitBreaker.recoveryEligibleAt <
      circuitBreaker.triggeredAt
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.recoveryEligibleAt`,
      "must not be earlier than triggeredAt.",
    );
  }
}

function validateStressScenario(
  scenario: EnterpriseRiskStressScenario,
  field: string,
): void {
  assertRecord(scenario, field);

  assertString(scenario.scenarioId, `${field}.scenarioId`);
  assertString(scenario.name, `${field}.name`);
  assertOptionalString(scenario.description, `${field}.description`);

  assertRecord(
    scenario.assetPriceShocks,
    `${field}.assetPriceShocks`,
  );

  for (const [asset, shock] of Object.entries(
    scenario.assetPriceShocks,
  )) {
    assertString(asset, `${field}.assetPriceShocks.asset`);
    assertFiniteNumber(
      shock,
      `${field}.assetPriceShocks.${asset}`,
    );

    if (shock < -1) {
      throw new EnterpriseRiskValidationError(
        `${field}.assetPriceShocks.${asset}`,
        "must not be less than -1.",
      );
    }
  }

  assertOptionalPositiveNumber(
    scenario.volatilityMultiplier,
    `${field}.volatilityMultiplier`,
  );
  assertOptionalPositiveNumber(
    scenario.liquidityMultiplier,
    `${field}.liquidityMultiplier`,
  );
  assertOptionalPositiveNumber(
    scenario.correlationMultiplier,
    `${field}.correlationMultiplier`,
  );

  if (scenario.exchangeOutages !== undefined) {
    assertArray(
      scenario.exchangeOutages,
      `${field}.exchangeOutages`,
    );

    scenario.exchangeOutages.forEach((exchangeId, index) => {
      assertString(
        exchangeId,
        `${field}.exchangeOutages[${index}]`,
      );
    });

    assertUniqueStrings(
      scenario.exchangeOutages,
      `${field}.exchangeOutages`,
    );
  }

  if (scenario.chainOutages !== undefined) {
    assertArray(
      scenario.chainOutages,
      `${field}.chainOutages`,
    );

    scenario.chainOutages.forEach((chainId, index) => {
      assertString(
        chainId,
        `${field}.chainOutages[${index}]`,
      );
    });

    assertUniqueStrings(
      scenario.chainOutages,
      `${field}.chainOutages`,
    );
  }

  if (scenario.stablecoinDepegs !== undefined) {
    assertRecord(
      scenario.stablecoinDepegs,
      `${field}.stablecoinDepegs`,
    );

    for (const [asset, price] of Object.entries(
      scenario.stablecoinDepegs,
    )) {
      assertString(asset, `${field}.stablecoinDepegs.asset`);
      assertPositiveNumber(
        price,
        `${field}.stablecoinDepegs.${asset}`,
      );
    }
  }

  validateOptionalMetadata(scenario.metadata, `${field}.metadata`);
}

export function validateEnterpriseRiskConfiguration(
  configuration: EnterpriseRiskConfiguration,
): void {
  assertRecord(configuration, "configuration");

  assertString(
    configuration.reportingCurrency,
    "configuration.reportingCurrency",
  );

  assertPositiveInteger(
    configuration.maximumMarketDataAgeMs,
    "configuration.maximumMarketDataAgeMs",
  );

  assertPositiveInteger(
    configuration.maximumPortfolioDataAgeMs,
    "configuration.maximumPortfolioDataAgeMs",
  );

  assertPositiveInteger(
    configuration.maximumAccountDataAgeMs,
    "configuration.maximumAccountDataAgeMs",
  );

  assertPositiveInteger(
    configuration.decisionValidityMs,
    "configuration.decisionValidityMs",
  );

  assertBoolean(
    configuration.rejectOnMissingMarketData,
    "configuration.rejectOnMissingMarketData",
  );

  assertBoolean(
    configuration.rejectOnMissingValueAtRisk,
    "configuration.rejectOnMissingValueAtRisk",
  );

  assertBoolean(
    configuration.rejectOnMissingCorrelationData,
    "configuration.rejectOnMissingCorrelationData",
  );

  assertBoolean(
    configuration.triggerCircuitBreakerOnCriticalViolation,
    "configuration.triggerCircuitBreakerOnCriticalViolation",
  );

  assertBoolean(
    configuration.triggerGlobalHaltOnCriticalPortfolioViolation,
    "configuration.triggerGlobalHaltOnCriticalPortfolioViolation",
  );

  assertBoolean(
    configuration.allowRestrictedApproval,
    "configuration.allowRestrictedApproval",
  );

  validateOptionalMetadata(
    configuration.metadata,
    "configuration.metadata",
  );
}

export function validateEnterpriseRiskEvaluationRequest(
  request: EnterpriseRiskEvaluationRequest,
  configuration?: EnterpriseRiskConfiguration,
): void {
  assertRecord(request, "request");

  assertString(request.requestId, "request.requestId");

  assertEnumValue(
    request.evaluationMode,
    EVALUATION_MODES,
    "request.evaluationMode",
  );

  assertTimestamp(request.requestedAt, "request.requestedAt");

  validateAccountReference(request.account, "request.account");

  if (request.market !== undefined) {
    validateMarketReference(request.market, "request.market");
  }

  if (request.orderIntent !== undefined) {
    validateOrderIntent(request.orderIntent, "request.orderIntent");
  }

  if (request.marketSnapshot !== undefined) {
    validateMarketSnapshot(
      request.marketSnapshot,
      "request.marketSnapshot",
    );
  }

  validatePortfolioSnapshot(
    request.portfolioSnapshot,
    "request.portfolioSnapshot",
  );

  if (
    request.account.portfolioId !==
    request.portfolioSnapshot.portfolioId
  ) {
    throw new EnterpriseRiskValidationError(
      "request.account.portfolioId",
      "must match request.portfolioSnapshot.portfolioId.",
    );
  }

  if (request.exposureSnapshot !== undefined) {
    validateExposureSnapshot(
      request.exposureSnapshot,
      "request.exposureSnapshot",
    );
  }

  if (request.performanceSnapshot !== undefined) {
    assertRecord(
      request.performanceSnapshot,
      "request.performanceSnapshot",
    );

    assertString(
      request.performanceSnapshot.portfolioId,
      "request.performanceSnapshot.portfolioId",
    );

    if (
      request.performanceSnapshot.portfolioId !==
      request.portfolioSnapshot.portfolioId
    ) {
      throw new EnterpriseRiskValidationError(
        "request.performanceSnapshot.portfolioId",
        "must match request.portfolioSnapshot.portfolioId.",
      );
    }

    assertString(
      request.performanceSnapshot.reportingCurrency,
      "request.performanceSnapshot.reportingCurrency",
    );
    assertFiniteNumber(
      request.performanceSnapshot.dailyPnl,
      "request.performanceSnapshot.dailyPnl",
    );
    assertFiniteNumber(
      request.performanceSnapshot.weeklyPnl,
      "request.performanceSnapshot.weeklyPnl",
    );
    assertFiniteNumber(
      request.performanceSnapshot.monthlyPnl,
      "request.performanceSnapshot.monthlyPnl",
    );
    assertFiniteNumber(
      request.performanceSnapshot.totalPnl,
      "request.performanceSnapshot.totalPnl",
    );
    assertFiniteNumber(
      request.performanceSnapshot.dailyReturn,
      "request.performanceSnapshot.dailyReturn",
    );
    assertFiniteNumber(
      request.performanceSnapshot.weeklyReturn,
      "request.performanceSnapshot.weeklyReturn",
    );
    assertFiniteNumber(
      request.performanceSnapshot.monthlyReturn,
      "request.performanceSnapshot.monthlyReturn",
    );
    assertNonNegativeNumber(
      request.performanceSnapshot.currentDrawdown,
      "request.performanceSnapshot.currentDrawdown",
    );
    assertNonNegativeNumber(
      request.performanceSnapshot.maximumDrawdown,
      "request.performanceSnapshot.maximumDrawdown",
    );
    assertNonNegativeInteger(
      request.performanceSnapshot.consecutiveLosses,
      "request.performanceSnapshot.consecutiveLosses",
    );
    assertNonNegativeInteger(
      request.performanceSnapshot.tradesToday,
      "request.performanceSnapshot.tradesToday",
    );
    assertNonNegativeInteger(
      request.performanceSnapshot.tradesThisWeek,
      "request.performanceSnapshot.tradesThisWeek",
    );
    assertNonNegativeInteger(
      request.performanceSnapshot.tradesThisMonth,
      "request.performanceSnapshot.tradesThisMonth",
    );
    assertTimestamp(
      request.performanceSnapshot.calculatedAt,
      "request.performanceSnapshot.calculatedAt",
    );

    if (
      request.performanceSnapshot.currentDrawdown >
      request.performanceSnapshot.maximumDrawdown
    ) {
      throw new EnterpriseRiskValidationError(
        "request.performanceSnapshot.currentDrawdown",
        "must not exceed maximumDrawdown.",
      );
    }
  }

  if (request.valueAtRiskSnapshot !== undefined) {
    validateValueAtRiskSnapshot(
      request.valueAtRiskSnapshot,
      "request.valueAtRiskSnapshot",
    );
  }

  if (request.correlationSnapshot !== undefined) {
    validateCorrelationSnapshot(
      request.correlationSnapshot,
      "request.correlationSnapshot",
    );
  }

  if (request.liquiditySnapshot !== undefined) {
    validateLiquiditySnapshot(
      request.liquiditySnapshot,
      "request.liquiditySnapshot",
    );
  }

  assertArray(request.policies, "request.policies");

  request.policies.forEach((policy, index) => {
    validatePolicy(policy, `request.policies[${index}]`);
  });

  assertUniqueStrings(
    request.policies.map((policy) => policy.id),
    "request.policies.id",
  );

  assertArray(request.circuitBreakers, "request.circuitBreakers");

  request.circuitBreakers.forEach((circuitBreaker, index) => {
    validateCircuitBreaker(
      circuitBreaker,
      `request.circuitBreakers[${index}]`,
    );
  });

  assertUniqueStrings(
    request.circuitBreakers.map(
      (circuitBreaker) => circuitBreaker.id,
    ),
    "request.circuitBreakers.id",
  );

  validateOptionalMetadata(request.metadata, "request.metadata");

  if (
    request.evaluationMode === "PRE_TRADE" &&
    request.orderIntent === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      "request.orderIntent",
      "is required for PRE_TRADE evaluations.",
    );
  }

  if (
    request.orderIntent !== undefined &&
    request.market === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      "request.market",
      "is required when orderIntent is provided.",
    );
  }

  if (
    request.marketSnapshot !== undefined &&
    request.market !== undefined
  ) {
    if (
      request.marketSnapshot.market.symbol !==
      request.market.symbol
    ) {
      throw new EnterpriseRiskValidationError(
        "request.marketSnapshot.market.symbol",
        "must match request.market.symbol.",
      );
    }

    if (
      request.marketSnapshot.market.marketType !==
      request.market.marketType
    ) {
      throw new EnterpriseRiskValidationError(
        "request.marketSnapshot.market.marketType",
        "must match request.market.marketType.",
      );
    }
  }

  if (configuration !== undefined) {
    validateEnterpriseRiskConfiguration(configuration);

    if (
      request.requestedAt <
      request.portfolioSnapshot.observedAt
    ) {
      throw new EnterpriseRiskValidationError(
        "request.requestedAt",
        "must not be earlier than portfolioSnapshot.observedAt.",
      );
    }

    const portfolioAge =
      request.requestedAt -
      request.portfolioSnapshot.observedAt;

    if (
      portfolioAge >
      configuration.maximumPortfolioDataAgeMs
    ) {
      throw new EnterpriseRiskValidationError(
        "request.portfolioSnapshot.observedAt",
        "portfolio data is stale.",
      );
    }

    if (request.marketSnapshot !== undefined) {
      if (
        request.requestedAt <
        request.marketSnapshot.observedAt
      ) {
        throw new EnterpriseRiskValidationError(
          "request.requestedAt",
          "must not be earlier than marketSnapshot.observedAt.",
        );
      }

      const marketAge =
        request.requestedAt -
        request.marketSnapshot.observedAt;

      if (
        marketAge >
        configuration.maximumMarketDataAgeMs
      ) {
        throw new EnterpriseRiskValidationError(
          "request.marketSnapshot.observedAt",
          "market data is stale.",
        );
      }
    }

    if (
      configuration.rejectOnMissingMarketData &&
      request.orderIntent !== undefined &&
      request.marketSnapshot === undefined
    ) {
      throw new EnterpriseRiskValidationError(
        "request.marketSnapshot",
        "is required by the active risk configuration.",
      );
    }

    if (
      configuration.rejectOnMissingValueAtRisk &&
      request.valueAtRiskSnapshot === undefined
    ) {
      throw new EnterpriseRiskValidationError(
        "request.valueAtRiskSnapshot",
        "is required by the active risk configuration.",
      );
    }

    if (
      configuration.rejectOnMissingCorrelationData &&
      request.correlationSnapshot === undefined
    ) {
      throw new EnterpriseRiskValidationError(
        "request.correlationSnapshot",
        "is required by the active risk configuration.",
      );
    }
  }
}

export function validateEnterpriseRiskStressScenario(
  scenario: EnterpriseRiskStressScenario,
): void {
  validateStressScenario(scenario, "scenario");
}

export const EnterpriseRiskValidator = Object.freeze({
  validateConfiguration: validateEnterpriseRiskConfiguration,
  validateEvaluationRequest:
    validateEnterpriseRiskEvaluationRequest,
  validateStressScenario: validateEnterpriseRiskStressScenario,
});