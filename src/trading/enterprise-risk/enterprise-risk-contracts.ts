/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-contracts.ts
 *
 * Purpose:
 * Defines the shared domain contracts used by the enterprise risk subsystem.
 *
 * Design goals:
 * - Deterministic
 * - Immutable
 * - Exchange-neutral
 * - Strategy-neutral
 * - Spot and derivatives compatible
 * - Multi-exchange compatible
 * - Multi-chain compatible
 * - Suitable for real-time and historical risk evaluation
 */

export type EnterpriseRiskIdentifier = string;

export type EnterpriseRiskTimestamp = number;

export type EnterpriseRiskMetadataValue =
  | string
  | number
  | boolean
  | null;

export type EnterpriseRiskMetadata = Readonly<
  Record<string, EnterpriseRiskMetadataValue>
>;

export type EnterpriseRiskSeverity =
  | "INFO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type EnterpriseRiskDecisionStatus =
  | "APPROVED"
  | "APPROVED_WITH_RESTRICTIONS"
  | "REJECTED"
  | "HALTED"
  | "SKIPPED";

export type EnterpriseRiskEvaluationMode =
  | "PRE_TRADE"
  | "POST_TRADE"
  | "CONTINUOUS"
  | "PORTFOLIO_REVIEW"
  | "STRESS_TEST"
  | "SIMULATION";

export type EnterpriseRiskMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURE"
  | "OPTION"
  | "DEX_SPOT"
  | "DEX_LIQUIDITY"
  | "CROSS_CHAIN";

export type EnterpriseRiskPositionSide =
  | "LONG"
  | "SHORT"
  | "FLAT";

export type EnterpriseRiskOrderSide =
  | "BUY"
  | "SELL";

export type EnterpriseRiskOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_LIMIT"
  | "TRAILING_STOP"
  | "UNKNOWN";

export type EnterpriseRiskMarginMode =
  | "NONE"
  | "ISOLATED"
  | "CROSS"
  | "PORTFOLIO";

export type EnterpriseRiskLiquidityLevel =
  | "VERY_LOW"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH"
  | "UNKNOWN";

export type EnterpriseRiskVolatilityLevel =
  | "VERY_LOW"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "EXTREME"
  | "UNKNOWN";

export type EnterpriseRiskCircuitBreakerScope =
  | "GLOBAL"
  | "PORTFOLIO"
  | "ACCOUNT"
  | "EXCHANGE"
  | "CHAIN"
  | "ASSET"
  | "SYMBOL"
  | "STRATEGY"
  | "BOT";

export type EnterpriseRiskCircuitBreakerStatus =
  | "ARMED"
  | "TRIGGERED"
  | "RECOVERING"
  | "DISABLED";

export type EnterpriseRiskLimitType =
  | "MAX_ORDER_NOTIONAL"
  | "MAX_POSITION_NOTIONAL"
  | "MAX_PORTFOLIO_GROSS_EXPOSURE"
  | "MAX_PORTFOLIO_NET_EXPOSURE"
  | "MAX_ASSET_EXPOSURE"
  | "MAX_EXCHANGE_EXPOSURE"
  | "MAX_CHAIN_EXPOSURE"
  | "MAX_STRATEGY_EXPOSURE"
  | "MAX_WALLET_EXPOSURE"
  | "MAX_OPEN_POSITIONS"
  | "MAX_LEVERAGE"
  | "MAX_MARGIN_UTILIZATION"
  | "MAX_DAILY_LOSS"
  | "MAX_WEEKLY_LOSS"
  | "MAX_MONTHLY_LOSS"
  | "MAX_DRAWDOWN"
  | "MAX_CONSECUTIVE_LOSSES"
  | "MAX_TRADES_PER_PERIOD"
  | "MAX_SLIPPAGE_BPS"
  | "MIN_LIQUIDITY"
  | "MIN_RISK_REWARD_RATIO"
  | "MAX_VALUE_AT_RISK"
  | "MAX_CONDITIONAL_VALUE_AT_RISK"
  | "MIN_LIQUIDATION_DISTANCE_BPS"
  | "MAX_CORRELATION"
  | "MAX_CONCENTRATION";

export type EnterpriseRiskViolationCode =
  | "INVALID_REQUEST"
  | "STALE_MARKET_DATA"
  | "STALE_PORTFOLIO_DATA"
  | "STALE_ACCOUNT_DATA"
  | "MISSING_MARKET_DATA"
  | "MISSING_PORTFOLIO_DATA"
  | "MISSING_ACCOUNT_DATA"
  | "ORDER_NOTIONAL_EXCEEDED"
  | "POSITION_NOTIONAL_EXCEEDED"
  | "PORTFOLIO_GROSS_EXPOSURE_EXCEEDED"
  | "PORTFOLIO_NET_EXPOSURE_EXCEEDED"
  | "ASSET_EXPOSURE_EXCEEDED"
  | "EXCHANGE_EXPOSURE_EXCEEDED"
  | "CHAIN_EXPOSURE_EXCEEDED"
  | "STRATEGY_EXPOSURE_EXCEEDED"
  | "WALLET_EXPOSURE_EXCEEDED"
  | "OPEN_POSITION_LIMIT_EXCEEDED"
  | "LEVERAGE_LIMIT_EXCEEDED"
  | "MARGIN_UTILIZATION_EXCEEDED"
  | "DAILY_LOSS_LIMIT_EXCEEDED"
  | "WEEKLY_LOSS_LIMIT_EXCEEDED"
  | "MONTHLY_LOSS_LIMIT_EXCEEDED"
  | "DRAWDOWN_LIMIT_EXCEEDED"
  | "CONSECUTIVE_LOSS_LIMIT_EXCEEDED"
  | "TRADE_FREQUENCY_LIMIT_EXCEEDED"
  | "SLIPPAGE_LIMIT_EXCEEDED"
  | "INSUFFICIENT_LIQUIDITY"
  | "RISK_REWARD_RATIO_TOO_LOW"
  | "VALUE_AT_RISK_EXCEEDED"
  | "CONDITIONAL_VALUE_AT_RISK_EXCEEDED"
  | "LIQUIDATION_DISTANCE_TOO_LOW"
  | "CORRELATION_LIMIT_EXCEEDED"
  | "CONCENTRATION_LIMIT_EXCEEDED"
  | "CIRCUIT_BREAKER_TRIGGERED"
  | "GLOBAL_KILL_SWITCH_ACTIVE"
  | "EXCHANGE_UNHEALTHY"
  | "CHAIN_UNHEALTHY"
  | "STRATEGY_HALTED"
  | "BOT_HALTED"
  | "ACCOUNT_RESTRICTED"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "INSUFFICIENT_AVAILABLE_MARGIN"
  | "UNSUPPORTED_MARKET"
  | "UNSUPPORTED_ASSET"
  | "UNSUPPORTED_EXCHANGE"
  | "UNSUPPORTED_CHAIN"
  | "CUSTOM_POLICY_VIOLATION";

export interface EnterpriseRiskMoney {
  readonly amount: number;
  readonly currency: string;
}

export interface EnterpriseRiskPrice {
  readonly value: number;
  readonly quoteCurrency: string;
}

export interface EnterpriseRiskPercentage {
  readonly value: number;
}

export interface EnterpriseRiskBasisPoints {
  readonly value: number;
}

export interface EnterpriseRiskTimeWindow {
  readonly startedAt: EnterpriseRiskTimestamp;
  readonly endedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskMarketReference {
  readonly exchangeId?: string;
  readonly chainId?: string;
  readonly venueId?: string;
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly marketType: EnterpriseRiskMarketType;
}

export interface EnterpriseRiskAccountReference {
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly portfolioId: string;
  readonly accountId?: string;
  readonly walletId?: string;
  readonly botId?: string;
  readonly strategyId?: string;
}

export interface EnterpriseRiskOrderIntent {
  readonly orderId?: string;
  readonly clientOrderId?: string;
  readonly side: EnterpriseRiskOrderSide;
  readonly type: EnterpriseRiskOrderType;
  readonly quantity: number;
  readonly price?: number;
  readonly stopPrice?: number;
  readonly estimatedNotional: number;
  readonly reduceOnly?: boolean;
  readonly postOnly?: boolean;
  readonly leverage?: number;
  readonly marginMode?: EnterpriseRiskMarginMode;
  readonly expectedSlippageBps?: number;
  readonly expectedFeeAmount?: number;
  readonly expectedFeeCurrency?: string;
}

export interface EnterpriseRiskMarketSnapshot {
  readonly market: EnterpriseRiskMarketReference;
  readonly observedAt: EnterpriseRiskTimestamp;
  readonly lastPrice: number;
  readonly markPrice?: number;
  readonly indexPrice?: number;
  readonly bidPrice?: number;
  readonly askPrice?: number;
  readonly spreadBps?: number;
  readonly availableBidLiquidity?: number;
  readonly availableAskLiquidity?: number;
  readonly twentyFourHourVolume?: number;
  readonly volatility?: number;
  readonly volatilityLevel?: EnterpriseRiskVolatilityLevel;
  readonly liquidityLevel?: EnterpriseRiskLiquidityLevel;
  readonly fundingRate?: number;
  readonly openInterest?: number;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskPositionSnapshot {
  readonly positionId: string;
  readonly portfolioId: string;
  readonly accountId?: string;
  readonly walletId?: string;
  readonly exchangeId?: string;
  readonly chainId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly marketType: EnterpriseRiskMarketType;
  readonly side: EnterpriseRiskPositionSide;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  readonly notionalValue: number;
  readonly leverage: number;
  readonly marginMode: EnterpriseRiskMarginMode;
  readonly initialMargin?: number;
  readonly maintenanceMargin?: number;
  readonly liquidationPrice?: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly openedAt: EnterpriseRiskTimestamp;
  readonly updatedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskBalanceSnapshot {
  readonly asset: string;
  readonly total: number;
  readonly available: number;
  readonly locked: number;
  readonly borrowed?: number;
  readonly interest?: number;
  readonly valueInReportingCurrency: number;
}

export interface EnterpriseRiskAccountSnapshot {
  readonly accountId: string;
  readonly portfolioId: string;
  readonly exchangeId?: string;
  readonly walletId?: string;
  readonly chainId?: string;
  readonly reportingCurrency: string;
  readonly equity: number;
  readonly availableBalance: number;
  readonly usedMargin: number;
  readonly availableMargin: number;
  readonly maintenanceMargin: number;
  readonly marginUtilization: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly balances: readonly EnterpriseRiskBalanceSnapshot[];
  readonly observedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskPortfolioSnapshot {
  readonly portfolioId: string;
  readonly reportingCurrency: string;
  readonly totalEquity: number;
  readonly cashBalance: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly longExposure: number;
  readonly shortExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly dailyPnl: number;
  readonly weeklyPnl: number;
  readonly monthlyPnl: number;
  readonly peakEquity: number;
  readonly currentDrawdown: number;
  readonly currentDrawdownPercentage: number;
  readonly consecutiveLosses: number;
  readonly openPositionCount: number;
  readonly positions: readonly EnterpriseRiskPositionSnapshot[];
  readonly accounts: readonly EnterpriseRiskAccountSnapshot[];
  readonly observedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskExposure {
  readonly key: string;
  readonly value: number;
  readonly percentageOfEquity: number;
}

export interface EnterpriseRiskExposureSnapshot {
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly longExposure: number;
  readonly shortExposure: number;
  readonly assetExposures: readonly EnterpriseRiskExposure[];
  readonly exchangeExposures: readonly EnterpriseRiskExposure[];
  readonly chainExposures: readonly EnterpriseRiskExposure[];
  readonly strategyExposures: readonly EnterpriseRiskExposure[];
  readonly walletExposures: readonly EnterpriseRiskExposure[];
  readonly calculatedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskPerformanceSnapshot {
  readonly portfolioId: string;
  readonly reportingCurrency: string;
  readonly dailyPnl: number;
  readonly weeklyPnl: number;
  readonly monthlyPnl: number;
  readonly totalPnl: number;
  readonly dailyReturn: number;
  readonly weeklyReturn: number;
  readonly monthlyReturn: number;
  readonly currentDrawdown: number;
  readonly maximumDrawdown: number;
  readonly consecutiveLosses: number;
  readonly tradesToday: number;
  readonly tradesThisWeek: number;
  readonly tradesThisMonth: number;
  readonly calculatedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskValueAtRiskSnapshot {
  readonly methodology:
    | "HISTORICAL"
    | "PARAMETRIC"
    | "MONTE_CARLO";
  readonly confidenceLevel: number;
  readonly horizonDays: number;
  readonly valueAtRisk: number;
  readonly conditionalValueAtRisk: number;
  readonly reportingCurrency: string;
  readonly sampleSize: number;
  readonly calculatedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCorrelationEntry {
  readonly leftAsset: string;
  readonly rightAsset: string;
  readonly correlation: number;
}

export interface EnterpriseRiskCorrelationSnapshot {
  readonly entries: readonly EnterpriseRiskCorrelationEntry[];
  readonly maximumObservedCorrelation: number;
  readonly calculatedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskLiquiditySnapshot {
  readonly symbol: string;
  readonly exchangeId?: string;
  readonly chainId?: string;
  readonly bidLiquidity: number;
  readonly askLiquidity: number;
  readonly spreadBps: number;
  readonly expectedSlippageBps: number;
  readonly liquidityLevel: EnterpriseRiskLiquidityLevel;
  readonly observedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskLimit {
  readonly id: EnterpriseRiskIdentifier;
  readonly type: EnterpriseRiskLimitType;
  readonly scope: EnterpriseRiskCircuitBreakerScope;
  readonly scopeId?: string;
  readonly enabled: boolean;
  readonly threshold: number;
  readonly warningThreshold?: number;
  readonly currency?: string;
  readonly timeWindowMs?: number;
  readonly severity: EnterpriseRiskSeverity;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskPolicy {
  readonly id: EnterpriseRiskIdentifier;
  readonly name: string;
  readonly description?: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly portfolioId?: string;
  readonly accountId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly limits: readonly EnterpriseRiskLimit[];
  readonly createdAt: EnterpriseRiskTimestamp;
  readonly updatedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCircuitBreaker {
  readonly id: EnterpriseRiskIdentifier;
  readonly scope: EnterpriseRiskCircuitBreakerScope;
  readonly scopeId?: string;
  readonly status: EnterpriseRiskCircuitBreakerStatus;
  readonly reason?: string;
  readonly triggeredAt?: EnterpriseRiskTimestamp;
  readonly recoveryEligibleAt?: EnterpriseRiskTimestamp;
  readonly manuallyTriggered: boolean;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskViolation {
  readonly id: EnterpriseRiskIdentifier;
  readonly code: EnterpriseRiskViolationCode;
  readonly severity: EnterpriseRiskSeverity;
  readonly message: string;
  readonly limitId?: EnterpriseRiskIdentifier;
  readonly actualValue?: number;
  readonly thresholdValue?: number;
  readonly currency?: string;
  readonly scope?: EnterpriseRiskCircuitBreakerScope;
  readonly scopeId?: string;
  readonly occurredAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskWarning {
  readonly id: EnterpriseRiskIdentifier;
  readonly code: EnterpriseRiskViolationCode;
  readonly severity: EnterpriseRiskSeverity;
  readonly message: string;
  readonly actualValue?: number;
  readonly thresholdValue?: number;
  readonly occurredAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskRestriction {
  readonly type:
    | "REDUCE_QUANTITY"
    | "REDUCE_NOTIONAL"
    | "REDUCE_LEVERAGE"
    | "REQUIRE_LIMIT_ORDER"
    | "REQUIRE_REDUCE_ONLY"
    | "REQUIRE_STOP_LOSS"
    | "REQUIRE_TAKE_PROFIT"
    | "REQUIRE_MANUAL_APPROVAL"
    | "RESTRICT_EXCHANGE"
    | "RESTRICT_CHAIN"
    | "RESTRICT_SYMBOL"
    | "CUSTOM";
  readonly description: string;
  readonly maximumQuantity?: number;
  readonly maximumNotional?: number;
  readonly maximumLeverage?: number;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskEvaluationRequest {
  readonly requestId: EnterpriseRiskIdentifier;
  readonly evaluationMode: EnterpriseRiskEvaluationMode;
  readonly requestedAt: EnterpriseRiskTimestamp;
  readonly account: EnterpriseRiskAccountReference;
  readonly market?: EnterpriseRiskMarketReference;
  readonly orderIntent?: EnterpriseRiskOrderIntent;
  readonly marketSnapshot?: EnterpriseRiskMarketSnapshot;
  readonly portfolioSnapshot: EnterpriseRiskPortfolioSnapshot;
  readonly exposureSnapshot?: EnterpriseRiskExposureSnapshot;
  readonly performanceSnapshot?: EnterpriseRiskPerformanceSnapshot;
  readonly valueAtRiskSnapshot?: EnterpriseRiskValueAtRiskSnapshot;
  readonly correlationSnapshot?: EnterpriseRiskCorrelationSnapshot;
  readonly liquiditySnapshot?: EnterpriseRiskLiquiditySnapshot;
  readonly policies: readonly EnterpriseRiskPolicy[];
  readonly circuitBreakers: readonly EnterpriseRiskCircuitBreaker[];
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskMetric {
  readonly name: string;
  readonly value: number;
  readonly unit:
    | "AMOUNT"
    | "PERCENTAGE"
    | "BASIS_POINTS"
    | "COUNT"
    | "RATIO"
    | "MILLISECONDS";
  readonly currency?: string;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskDecision {
  readonly decisionId: EnterpriseRiskIdentifier;
  readonly requestId: EnterpriseRiskIdentifier;
  readonly status: EnterpriseRiskDecisionStatus;
  readonly severity: EnterpriseRiskSeverity;
  readonly approved: boolean;
  readonly evaluatedAt: EnterpriseRiskTimestamp;
  readonly expiresAt?: EnterpriseRiskTimestamp;
  readonly violations: readonly EnterpriseRiskViolation[];
  readonly warnings: readonly EnterpriseRiskWarning[];
  readonly restrictions: readonly EnterpriseRiskRestriction[];
  readonly metrics: readonly EnterpriseRiskMetric[];
  readonly triggeredCircuitBreakers: readonly EnterpriseRiskCircuitBreaker[];
  readonly reason: string;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskSnapshot {
  readonly snapshotId: EnterpriseRiskIdentifier;
  readonly portfolioId: string;
  readonly reportingCurrency: string;
  readonly portfolio: EnterpriseRiskPortfolioSnapshot;
  readonly exposures: EnterpriseRiskExposureSnapshot;
  readonly performance: EnterpriseRiskPerformanceSnapshot;
  readonly valueAtRisk?: EnterpriseRiskValueAtRiskSnapshot;
  readonly correlations?: EnterpriseRiskCorrelationSnapshot;
  readonly activeViolations: readonly EnterpriseRiskViolation[];
  readonly activeWarnings: readonly EnterpriseRiskWarning[];
  readonly circuitBreakers: readonly EnterpriseRiskCircuitBreaker[];
  readonly overallSeverity: EnterpriseRiskSeverity;
  readonly tradingAllowed: boolean;
  readonly generatedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskEvent {
  readonly eventId: EnterpriseRiskIdentifier;
  readonly eventType:
    | "RISK_EVALUATED"
    | "LIMIT_WARNING"
    | "LIMIT_BREACHED"
    | "CIRCUIT_BREAKER_ARMED"
    | "CIRCUIT_BREAKER_TRIGGERED"
    | "CIRCUIT_BREAKER_RECOVERING"
    | "CIRCUIT_BREAKER_RESET"
    | "GLOBAL_KILL_SWITCH_ENABLED"
    | "GLOBAL_KILL_SWITCH_DISABLED"
    | "TRADING_RESTRICTED"
    | "TRADING_RESUMED"
    | "POSITION_REDUCTION_REQUESTED"
    | "EMERGENCY_EXIT_REQUESTED";
  readonly severity: EnterpriseRiskSeverity;
  readonly portfolioId?: string;
  readonly accountId?: string;
  readonly strategyId?: string;
  readonly botId?: string;
  readonly exchangeId?: string;
  readonly chainId?: string;
  readonly symbol?: string;
  readonly message: string;
  readonly occurredAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskStressScenario {
  readonly scenarioId: EnterpriseRiskIdentifier;
  readonly name: string;
  readonly description?: string;
  readonly assetPriceShocks: Readonly<Record<string, number>>;
  readonly volatilityMultiplier?: number;
  readonly liquidityMultiplier?: number;
  readonly correlationMultiplier?: number;
  readonly exchangeOutages?: readonly string[];
  readonly chainOutages?: readonly string[];
  readonly stablecoinDepegs?: Readonly<Record<string, number>>;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskStressResult {
  readonly resultId: EnterpriseRiskIdentifier;
  readonly scenarioId: EnterpriseRiskIdentifier;
  readonly portfolioId: string;
  readonly estimatedPnlImpact: number;
  readonly estimatedEquityAfterScenario: number;
  readonly estimatedDrawdown: number;
  readonly estimatedDrawdownPercentage: number;
  readonly positionsAtRisk: readonly string[];
  readonly breachedLimits: readonly EnterpriseRiskViolation[];
  readonly liquidationRisks: readonly string[];
  readonly calculatedAt: EnterpriseRiskTimestamp;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskConfiguration {
  readonly reportingCurrency: string;
  readonly maximumMarketDataAgeMs: number;
  readonly maximumPortfolioDataAgeMs: number;
  readonly maximumAccountDataAgeMs: number;
  readonly decisionValidityMs: number;
  readonly rejectOnMissingMarketData: boolean;
  readonly rejectOnMissingValueAtRisk: boolean;
  readonly rejectOnMissingCorrelationData: boolean;
  readonly triggerCircuitBreakerOnCriticalViolation: boolean;
  readonly triggerGlobalHaltOnCriticalPortfolioViolation: boolean;
  readonly allowRestrictedApproval: boolean;
  readonly metadata?: EnterpriseRiskMetadata;
}

export const DEFAULT_ENTERPRISE_RISK_CONFIGURATION: EnterpriseRiskConfiguration =
  Object.freeze({
    reportingCurrency: "USD",
    maximumMarketDataAgeMs: 5_000,
    maximumPortfolioDataAgeMs: 10_000,
    maximumAccountDataAgeMs: 10_000,
    decisionValidityMs: 5_000,
    rejectOnMissingMarketData: true,
    rejectOnMissingValueAtRisk: false,
    rejectOnMissingCorrelationData: false,
    triggerCircuitBreakerOnCriticalViolation: true,
    triggerGlobalHaltOnCriticalPortfolioViolation: true,
    allowRestrictedApproval: true,
  });

export interface EnterpriseRiskClock {
  now(): EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskIdentifierGenerator {
  generate(prefix: string): EnterpriseRiskIdentifier;
}

export interface EnterpriseRiskEvaluator {
  evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): EnterpriseRiskDecision;
}

export interface EnterpriseRiskAsyncEvaluator {
  evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): Promise<EnterpriseRiskDecision>;
}

export interface EnterpriseRiskSnapshotProvider {
  getSnapshot(portfolioId: string): EnterpriseRiskSnapshot | undefined;
}

export interface EnterpriseRiskPolicyRepository {
  getById(policyId: string): EnterpriseRiskPolicy | undefined;

  getApplicablePolicies(
    account: EnterpriseRiskAccountReference,
  ): readonly EnterpriseRiskPolicy[];

  save(policy: EnterpriseRiskPolicy): void;

  remove(policyId: string): boolean;
}

export interface EnterpriseRiskCircuitBreakerRepository {
  getById(
    circuitBreakerId: string,
  ): EnterpriseRiskCircuitBreaker | undefined;

  getActive(): readonly EnterpriseRiskCircuitBreaker[];

  getApplicable(
    account: EnterpriseRiskAccountReference,
    market?: EnterpriseRiskMarketReference,
  ): readonly EnterpriseRiskCircuitBreaker[];

  save(circuitBreaker: EnterpriseRiskCircuitBreaker): void;

  remove(circuitBreakerId: string): boolean;
}

export interface EnterpriseRiskEventPublisher {
  publish(event: EnterpriseRiskEvent): void;
}

export interface EnterpriseRiskStressTester {
  evaluate(
    portfolio: EnterpriseRiskPortfolioSnapshot,
    scenario: EnterpriseRiskStressScenario,
  ): EnterpriseRiskStressResult;
}