/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File:
 * src/trading/ai-portfolio-manager/ai-portfolio-contracts.ts
 *
 * Purpose:
 * Defines the complete domain-contract foundation for portfolio analysis,
 * portfolio optimization, risk budgeting, capital allocation, drift
 * detection, rebalancing, and explainable portfolio decisions.
 *
 * This module intentionally has no runtime dependencies so that it remains
 * deterministic, portable, and safe to consume throughout the trading
 * platform.
 */

/* ============================================================================
 * Shared primitives
 * ========================================================================== */

export type PortfolioIdentifier = string;
export type PortfolioSnapshotIdentifier = string;
export type PortfolioDecisionIdentifier = string;
export type PortfolioOptimizationIdentifier = string;
export type PortfolioAllocationIdentifier = string;
export type PortfolioRebalanceIdentifier = string;
export type PortfolioExplanationIdentifier = string;
export type StrategyIdentifier = string;
export type BotIdentifier = string;
export type ExchangeIdentifier = string;
export type AccountIdentifier = string;
export type PositionIdentifier = string;
export type AssetSymbol = string;
export type MarketSymbol = string;
export type CurrencyCode = string;
export type Timestamp = string;
export type DecimalString = string;

export type PortfolioMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[];

export type PortfolioMetadata = Readonly<
  Record<string, PortfolioMetadataValue>
>;

export type NumericMatrix = readonly (readonly number[])[];

export interface NumericRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface TimestampRange {
  readonly from: Timestamp;
  readonly to: Timestamp;
}

/* ============================================================================
 * Enumerations
 * ========================================================================== */

export enum PortfolioManagerMode {
  ADVISORY = "ADVISORY",
  PAPER = "PAPER",
  APPROVAL_REQUIRED = "APPROVAL_REQUIRED",
  SEMI_AUTOMATIC = "SEMI_AUTOMATIC",
  FULLY_AUTOMATIC = "FULLY_AUTOMATIC",
  EMERGENCY_SAFE = "EMERGENCY_SAFE",
}

export enum PortfolioMarketType {
  SPOT = "SPOT",
  MARGIN = "MARGIN",
  FUTURES = "FUTURES",
  PERPETUAL = "PERPETUAL",
  OPTIONS = "OPTIONS",
  DEX = "DEX",
  CROSS_CHAIN = "CROSS_CHAIN",
}

export enum PortfolioPositionSide {
  LONG = "LONG",
  SHORT = "SHORT",
  FLAT = "FLAT",
}

export enum PortfolioAssetClass {
  CRYPTOCURRENCY = "CRYPTOCURRENCY",
  STABLECOIN = "STABLECOIN",
  FIAT = "FIAT",
  DERIVATIVE = "DERIVATIVE",
  LIQUIDITY_POSITION = "LIQUIDITY_POSITION",
  OTHER = "OTHER",
}

export enum PortfolioHealthStatus {
  EXCELLENT = "EXCELLENT",
  HEALTHY = "HEALTHY",
  WATCH = "WATCH",
  DEGRADED = "DEGRADED",
  CRITICAL = "CRITICAL",
  UNKNOWN = "UNKNOWN",
}

export enum PortfolioRiskLevel {
  VERY_LOW = "VERY_LOW",
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  VERY_HIGH = "VERY_HIGH",
  CRITICAL = "CRITICAL",
}

export enum PortfolioOptimizationObjective {
  MAXIMIZE_RETURN = "MAXIMIZE_RETURN",
  MINIMIZE_VOLATILITY = "MINIMIZE_VOLATILITY",
  MAXIMIZE_SHARPE_RATIO = "MAXIMIZE_SHARPE_RATIO",
  MAXIMIZE_SORTINO_RATIO = "MAXIMIZE_SORTINO_RATIO",
  MINIMIZE_DRAWDOWN = "MINIMIZE_DRAWDOWN",
  RISK_PARITY = "RISK_PARITY",
  VOLATILITY_TARGETING = "VOLATILITY_TARGETING",
  CAPITAL_PRESERVATION = "CAPITAL_PRESERVATION",
  BALANCED_GROWTH = "BALANCED_GROWTH",
  CUSTOM = "CUSTOM",
}

export enum PortfolioOptimizationMethod {
  EQUAL_WEIGHT = "EQUAL_WEIGHT",
  MARKET_CAP_WEIGHTED = "MARKET_CAP_WEIGHTED",
  RISK_PARITY = "RISK_PARITY",
  INVERSE_VOLATILITY = "INVERSE_VOLATILITY",
  MEAN_VARIANCE = "MEAN_VARIANCE",
  MINIMUM_VARIANCE = "MINIMUM_VARIANCE",
  MAXIMUM_DIVERSIFICATION = "MAXIMUM_DIVERSIFICATION",
  HIERARCHICAL_RISK_PARITY = "HIERARCHICAL_RISK_PARITY",
  VOLATILITY_TARGETING = "VOLATILITY_TARGETING",
  DRAWDOWN_AWARE = "DRAWDOWN_AWARE",
  AI_ASSISTED = "AI_ASSISTED",
}

export enum PortfolioAllocationTargetType {
  ASSET = "ASSET",
  STRATEGY = "STRATEGY",
  BOT = "BOT",
  EXCHANGE = "EXCHANGE",
  ACCOUNT = "ACCOUNT",
  MARKET_TYPE = "MARKET_TYPE",
  STABLECOIN_RESERVE = "STABLECOIN_RESERVE",
  CASH_RESERVE = "CASH_RESERVE",
  HEDGE = "HEDGE",
}

export enum PortfolioAllocationAction {
  INCREASE = "INCREASE",
  DECREASE = "DECREASE",
  MAINTAIN = "MAINTAIN",
  OPEN = "OPEN",
  CLOSE = "CLOSE",
  PAUSE = "PAUSE",
  RESUME = "RESUME",
  RESERVE = "RESERVE",
  RELEASE = "RELEASE",
}

export enum PortfolioRebalanceReason {
  PERIODIC = "PERIODIC",
  ALLOCATION_DRIFT = "ALLOCATION_DRIFT",
  RISK_LIMIT = "RISK_LIMIT",
  MARKET_REGIME_CHANGE = "MARKET_REGIME_CHANGE",
  VOLATILITY_CHANGE = "VOLATILITY_CHANGE",
  CORRELATION_CHANGE = "CORRELATION_CHANGE",
  STRATEGY_DEGRADATION = "STRATEGY_DEGRADATION",
  STRATEGY_IMPROVEMENT = "STRATEGY_IMPROVEMENT",
  DRAWDOWN_PROTECTION = "DRAWDOWN_PROTECTION",
  CAPITAL_DEPOSIT = "CAPITAL_DEPOSIT",
  CAPITAL_WITHDRAWAL = "CAPITAL_WITHDRAWAL",
  EMERGENCY = "EMERGENCY",
  MANUAL = "MANUAL",
}

export enum PortfolioRebalanceStatus {
  PROPOSED = "PROPOSED",
  VALIDATED = "VALIDATED",
  APPROVAL_REQUIRED = "APPROVAL_REQUIRED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  QUEUED = "QUEUED",
  EXECUTING = "EXECUTING",
  PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
}

export enum PortfolioDecisionStatus {
  GENERATED = "GENERATED",
  VALIDATED = "VALIDATED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  DEFERRED = "DEFERRED",
  EXECUTED = "EXECUTED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

export enum PortfolioConstraintType {
  MINIMUM_WEIGHT = "MINIMUM_WEIGHT",
  MAXIMUM_WEIGHT = "MAXIMUM_WEIGHT",
  MINIMUM_CAPITAL = "MINIMUM_CAPITAL",
  MAXIMUM_CAPITAL = "MAXIMUM_CAPITAL",
  MINIMUM_RESERVE = "MINIMUM_RESERVE",
  MAXIMUM_EXPOSURE = "MAXIMUM_EXPOSURE",
  MAXIMUM_CORRELATION = "MAXIMUM_CORRELATION",
  MAXIMUM_VOLATILITY = "MAXIMUM_VOLATILITY",
  MAXIMUM_DRAWDOWN = "MAXIMUM_DRAWDOWN",
  MAXIMUM_LEVERAGE = "MAXIMUM_LEVERAGE",
  MAXIMUM_TURNOVER = "MAXIMUM_TURNOVER",
  MINIMUM_LIQUIDITY = "MINIMUM_LIQUIDITY",
  ALLOWED_TARGET = "ALLOWED_TARGET",
  BLOCKED_TARGET = "BLOCKED_TARGET",
  CUSTOM = "CUSTOM",
}

export enum PortfolioConstraintSeverity {
  INFORMATIONAL = "INFORMATIONAL",
  WARNING = "WARNING",
  HARD = "HARD",
  CRITICAL = "CRITICAL",
}

export enum PortfolioDriftSeverity {
  NONE = "NONE",
  MINOR = "MINOR",
  MODERATE = "MODERATE",
  MAJOR = "MAJOR",
  CRITICAL = "CRITICAL",
}

export enum PortfolioRiskBudgetType {
  PORTFOLIO = "PORTFOLIO",
  ASSET = "ASSET",
  STRATEGY = "STRATEGY",
  BOT = "BOT",
  EXCHANGE = "EXCHANGE",
  ACCOUNT = "ACCOUNT",
  MARKET_TYPE = "MARKET_TYPE",
}

export enum PortfolioExplanationFactorType {
  RETURN = "RETURN",
  RISK = "RISK",
  VOLATILITY = "VOLATILITY",
  CORRELATION = "CORRELATION",
  LIQUIDITY = "LIQUIDITY",
  DRAWDOWN = "DRAWDOWN",
  REGIME = "REGIME",
  STRATEGY_PERFORMANCE = "STRATEGY_PERFORMANCE",
  EXECUTION_COST = "EXECUTION_COST",
  CAPITAL_AVAILABILITY = "CAPITAL_AVAILABILITY",
  CONSTRAINT = "CONSTRAINT",
  DIVERSIFICATION = "DIVERSIFICATION",
  MANUAL_POLICY = "MANUAL_POLICY",
  OTHER = "OTHER",
}

export enum PortfolioRecommendationPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
  CRITICAL = "CRITICAL",
}

export enum PortfolioDataQualityStatus {
  VALID = "VALID",
  PARTIAL = "PARTIAL",
  STALE = "STALE",
  INVALID = "INVALID",
  UNAVAILABLE = "UNAVAILABLE",
}

/* ============================================================================
 * Portfolio holdings, positions, balances, and snapshots
 * ========================================================================== */

export interface PortfolioAssetReference {
  readonly asset: AssetSymbol;
  readonly assetClass: PortfolioAssetClass;
  readonly quoteCurrency: CurrencyCode;
}

export interface PortfolioBalance {
  readonly asset: AssetSymbol;
  readonly total: number;
  readonly available: number;
  readonly reserved: number;
  readonly borrowed?: number;
  readonly interestAccrued?: number;
  readonly valuationPrice: number;
  readonly valuationCurrency: CurrencyCode;
  readonly marketValue: number;
  readonly exchangeId?: ExchangeIdentifier;
  readonly accountId?: AccountIdentifier;
  readonly updatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioPosition {
  readonly positionId: PositionIdentifier;
  readonly marketSymbol: MarketSymbol;
  readonly baseAsset: AssetSymbol;
  readonly quoteAsset: AssetSymbol;
  readonly marketType: PortfolioMarketType;
  readonly side: PortfolioPositionSide;
  readonly quantity: number;
  readonly averageEntryPrice: number;
  readonly markPrice: number;
  readonly marketValue: number;
  readonly notionalValue: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly leverage?: number;
  readonly marginUsed?: number;
  readonly liquidationPrice?: number;
  readonly exchangeId: ExchangeIdentifier;
  readonly accountId?: AccountIdentifier;
  readonly strategyId?: StrategyIdentifier;
  readonly botId?: BotIdentifier;
  readonly openedAt?: Timestamp;
  readonly updatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioStrategyExposure {
  readonly strategyId: StrategyIdentifier;
  readonly allocatedCapital: number;
  readonly utilizedCapital: number;
  readonly reservedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly drawdown: number;
  readonly activePositions: number;
  readonly activeBots: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioBotExposure {
  readonly botId: BotIdentifier;
  readonly strategyId?: StrategyIdentifier;
  readonly allocatedCapital: number;
  readonly utilizedCapital: number;
  readonly reservedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly drawdown: number;
  readonly activePositions: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioExchangeExposure {
  readonly exchangeId: ExchangeIdentifier;
  readonly accountId?: AccountIdentifier;
  readonly totalCapital: number;
  readonly availableCapital: number;
  readonly reservedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly openPositions: number;
  readonly healthScore?: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioSnapshot {
  readonly snapshotId: PortfolioSnapshotIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly baseCurrency: CurrencyCode;
  readonly totalEquity: number;
  readonly availableCapital: number;
  readonly reservedCapital: number;
  readonly investedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly longExposure: number;
  readonly shortExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly dailyPnl?: number;
  readonly leverage?: number;
  readonly marginUtilization?: number;
  readonly balances: readonly PortfolioBalance[];
  readonly positions: readonly PortfolioPosition[];
  readonly strategyExposures: readonly PortfolioStrategyExposure[];
  readonly botExposures: readonly PortfolioBotExposure[];
  readonly exchangeExposures: readonly PortfolioExchangeExposure[];
  readonly capturedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Historical observations and performance
 * ========================================================================== */

export interface PortfolioReturnObservation {
  readonly timestamp: Timestamp;
  readonly returnValue: number;
  readonly equity?: number;
}

export interface AssetReturnSeries {
  readonly asset: AssetSymbol;
  readonly observations: readonly PortfolioReturnObservation[];
}

export interface PortfolioPerformanceMetrics {
  readonly totalReturn: number;
  readonly annualizedReturn?: number;
  readonly realizedReturn: number;
  readonly unrealizedReturn: number;
  readonly volatility: number;
  readonly downsideVolatility?: number;
  readonly sharpeRatio?: number;
  readonly sortinoRatio?: number;
  readonly calmarRatio?: number;
  readonly maximumDrawdown: number;
  readonly currentDrawdown: number;
  readonly winRate?: number;
  readonly profitFactor?: number;
  readonly valueAtRisk?: number;
  readonly conditionalValueAtRisk?: number;
  readonly beta?: number;
  readonly alpha?: number;
  readonly turnover?: number;
  readonly period?: TimestampRange;
}

export interface PortfolioAssetPerformance {
  readonly asset: AssetSymbol;
  readonly marketValue: number;
  readonly weight: number;
  readonly returnContribution: number;
  readonly riskContribution: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly volatility?: number;
  readonly maximumDrawdown?: number;
}

export interface PortfolioStrategyPerformance {
  readonly strategyId: StrategyIdentifier;
  readonly capitalWeight: number;
  readonly returnContribution: number;
  readonly riskContribution: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly volatility?: number;
  readonly maximumDrawdown?: number;
  readonly sharpeRatio?: number;
  readonly winRate?: number;
  readonly profitFactor?: number;
}

/* ============================================================================
 * Correlation and covariance
 * ========================================================================== */

export interface PortfolioCorrelationPair {
  readonly leftAsset: AssetSymbol;
  readonly rightAsset: AssetSymbol;
  readonly correlation: number;
  readonly observationCount: number;
}

export interface PortfolioCorrelationMatrix {
  readonly assets: readonly AssetSymbol[];
  readonly values: NumericMatrix;
  readonly pairs: readonly PortfolioCorrelationPair[];
  readonly observationCount: number;
  readonly generatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioCovariancePair {
  readonly leftAsset: AssetSymbol;
  readonly rightAsset: AssetSymbol;
  readonly covariance: number;
  readonly observationCount: number;
}

export interface PortfolioCovarianceMatrix {
  readonly assets: readonly AssetSymbol[];
  readonly values: NumericMatrix;
  readonly pairs: readonly PortfolioCovariancePair[];
  readonly observationCount: number;
  readonly generatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioDiversificationMetrics {
  readonly diversificationRatio: number;
  readonly effectiveAssetCount: number;
  readonly concentrationIndex: number;
  readonly averageCorrelation: number;
  readonly maximumPairCorrelation: number;
  readonly minimumPairCorrelation: number;
  readonly highlyCorrelatedPairs: readonly PortfolioCorrelationPair[];
}

/* ============================================================================
 * Portfolio health
 * ========================================================================== */

export interface PortfolioHealthComponent {
  readonly name: string;
  readonly score: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly status: PortfolioHealthStatus;
  readonly reasons: readonly string[];
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioHealthIssue {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly riskLevel: PortfolioRiskLevel;
  readonly affectedTargets: readonly string[];
  readonly recommendedAction?: string;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioHealthRecommendation {
  readonly recommendationId: string;
  readonly priority: PortfolioRecommendationPriority;
  readonly title: string;
  readonly description: string;
  readonly expectedBenefit?: string;
  readonly estimatedRiskReduction?: number;
  readonly estimatedReturnImpact?: number;
  readonly affectedTargets: readonly string[];
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioHealthReport {
  readonly portfolioId: PortfolioIdentifier;
  readonly snapshotId: PortfolioSnapshotIdentifier;
  readonly overallScore: number;
  readonly status: PortfolioHealthStatus;
  readonly riskLevel: PortfolioRiskLevel;
  readonly components: readonly PortfolioHealthComponent[];
  readonly issues: readonly PortfolioHealthIssue[];
  readonly recommendations: readonly PortfolioHealthRecommendation[];
  readonly performance: PortfolioPerformanceMetrics;
  readonly diversification: PortfolioDiversificationMetrics;
  readonly generatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Constraints and policies
 * ========================================================================== */

export interface PortfolioConstraint {
  readonly constraintId: string;
  readonly type: PortfolioConstraintType;
  readonly severity: PortfolioConstraintSeverity;
  readonly targetType?: PortfolioAllocationTargetType;
  readonly targetId?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enabled: boolean;
  readonly description?: string;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioAllocationPolicy {
  readonly policyId: string;
  readonly portfolioId: PortfolioIdentifier;
  readonly baseCurrency: CurrencyCode;
  readonly minimumCashReserveWeight: number;
  readonly maximumInvestedWeight: number;
  readonly maximumSingleAssetWeight: number;
  readonly maximumSingleStrategyWeight: number;
  readonly maximumSingleBotWeight: number;
  readonly maximumSingleExchangeWeight: number;
  readonly maximumStablecoinWeight?: number;
  readonly targetVolatility?: number;
  readonly maximumPortfolioVolatility?: number;
  readonly maximumDrawdown?: number;
  readonly maximumTurnover?: number;
  readonly maximumLeverage?: number;
  readonly constraints: readonly PortfolioConstraint[];
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Risk budgets
 * ========================================================================== */

export interface PortfolioRiskBudgetTarget {
  readonly type: PortfolioRiskBudgetType;
  readonly targetId: string;
  readonly targetRiskWeight: number;
  readonly maximumRiskWeight: number;
  readonly currentRiskWeight?: number;
  readonly riskAmount?: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioRiskBudget {
  readonly portfolioId: PortfolioIdentifier;
  readonly totalRiskBudget: number;
  readonly volatilityBudget?: number;
  readonly drawdownBudget?: number;
  readonly valueAtRiskBudget?: number;
  readonly conditionalValueAtRiskBudget?: number;
  readonly targets: readonly PortfolioRiskBudgetTarget[];
  readonly generatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioRiskContribution {
  readonly targetType: PortfolioRiskBudgetType;
  readonly targetId: string;
  readonly absoluteContribution: number;
  readonly percentageContribution: number;
  readonly marginalContribution?: number;
  readonly exceedsBudget: boolean;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioRiskBudgetResult {
  readonly budget: PortfolioRiskBudget;
  readonly contributions: readonly PortfolioRiskContribution[];
  readonly totalMeasuredRisk: number;
  readonly budgetUtilization: number;
  readonly withinBudget: boolean;
  readonly violations: readonly string[];
  readonly generatedAt: Timestamp;
}

/* ============================================================================
 * Optimization inputs and outputs
 * ========================================================================== */

export interface PortfolioOptimizationAsset {
  readonly asset: AssetSymbol;
  readonly currentWeight: number;
  readonly currentValue: number;
  readonly expectedReturn?: number;
  readonly expectedVolatility?: number;
  readonly liquidityScore?: number;
  readonly minimumWeight?: number;
  readonly maximumWeight?: number;
  readonly transactionCostRate?: number;
  readonly enabled: boolean;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioOptimizationPreferences {
  readonly objective: PortfolioOptimizationObjective;
  readonly method: PortfolioOptimizationMethod;
  readonly riskAversion?: number;
  readonly returnPreference?: number;
  readonly diversificationPreference?: number;
  readonly turnoverPenalty?: number;
  readonly transactionCostPenalty?: number;
  readonly drawdownPenalty?: number;
  readonly targetReturn?: number;
  readonly targetVolatility?: number;
  readonly targetCashWeight?: number;
  readonly allowShortPositions?: boolean;
  readonly allowLeverage?: boolean;
  readonly maximumIterations?: number;
  readonly convergenceTolerance?: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioOptimizationRequest {
  readonly optimizationId: PortfolioOptimizationIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly snapshot: PortfolioSnapshot;
  readonly assets: readonly PortfolioOptimizationAsset[];
  readonly returnSeries: readonly AssetReturnSeries[];
  readonly correlationMatrix?: PortfolioCorrelationMatrix;
  readonly covarianceMatrix?: PortfolioCovarianceMatrix;
  readonly riskBudget?: PortfolioRiskBudget;
  readonly policy: PortfolioAllocationPolicy;
  readonly preferences: PortfolioOptimizationPreferences;
  readonly requestedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioOptimizedWeight {
  readonly asset: AssetSymbol;
  readonly previousWeight: number;
  readonly optimizedWeight: number;
  readonly weightChange: number;
  readonly previousValue: number;
  readonly optimizedValue: number;
  readonly valueChange: number;
  readonly expectedReturnContribution?: number;
  readonly expectedRiskContribution?: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioOptimizationDiagnostics {
  readonly iterations: number;
  readonly converged: boolean;
  readonly objectiveValue?: number;
  readonly constraintViolations: readonly string[];
  readonly warnings: readonly string[];
  readonly processingTimeMilliseconds?: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioOptimizationResult {
  readonly optimizationId: PortfolioOptimizationIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly objective: PortfolioOptimizationObjective;
  readonly method: PortfolioOptimizationMethod;
  readonly weights: readonly PortfolioOptimizedWeight[];
  readonly expectedReturn?: number;
  readonly expectedVolatility?: number;
  readonly expectedSharpeRatio?: number;
  readonly expectedMaximumDrawdown?: number;
  readonly expectedTurnover: number;
  readonly estimatedTransactionCost: number;
  readonly cashWeight: number;
  readonly investedWeight: number;
  readonly diagnostics: PortfolioOptimizationDiagnostics;
  readonly generatedAt: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Capital allocation
 * ========================================================================== */

export interface PortfolioAllocationTarget {
  readonly targetType: PortfolioAllocationTargetType;
  readonly targetId: string;
  readonly currentCapital: number;
  readonly currentWeight: number;
  readonly minimumCapital?: number;
  readonly maximumCapital?: number;
  readonly minimumWeight?: number;
  readonly maximumWeight?: number;
  readonly expectedReturn?: number;
  readonly expectedRisk?: number;
  readonly performanceScore?: number;
  readonly healthScore?: number;
  readonly liquidityScore?: number;
  readonly enabled: boolean;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioCapitalAllocationRequest {
  readonly allocationId: PortfolioAllocationIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly snapshot: PortfolioSnapshot;
  readonly availableCapital: number;
  readonly targets: readonly PortfolioAllocationTarget[];
  readonly policy: PortfolioAllocationPolicy;
  readonly riskBudget?: PortfolioRiskBudget;
  readonly optimizationResult?: PortfolioOptimizationResult;
  readonly requestedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioCapitalAllocation {
  readonly targetType: PortfolioAllocationTargetType;
  readonly targetId: string;
  readonly previousCapital: number;
  readonly allocatedCapital: number;
  readonly capitalChange: number;
  readonly previousWeight: number;
  readonly allocatedWeight: number;
  readonly weightChange: number;
  readonly action: PortfolioAllocationAction;
  readonly reasons: readonly string[];
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioCapitalAllocationResult {
  readonly allocationId: PortfolioAllocationIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly totalCapital: number;
  readonly allocatedCapital: number;
  readonly reservedCapital: number;
  readonly unallocatedCapital: number;
  readonly allocations: readonly PortfolioCapitalAllocation[];
  readonly constraintsSatisfied: boolean;
  readonly violations: readonly string[];
  readonly warnings: readonly string[];
  readonly generatedAt: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Portfolio drift
 * ========================================================================== */

export interface PortfolioDriftTarget {
  readonly targetType: PortfolioAllocationTargetType;
  readonly targetId: string;
  readonly targetWeight: number;
  readonly actualWeight: number;
  readonly absoluteDrift: number;
  readonly relativeDrift?: number;
  readonly threshold: number;
  readonly exceedsThreshold: boolean;
  readonly severity: PortfolioDriftSeverity;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioDriftReport {
  readonly portfolioId: PortfolioIdentifier;
  readonly snapshotId: PortfolioSnapshotIdentifier;
  readonly totalAbsoluteDrift: number;
  readonly maximumTargetDrift: number;
  readonly averageTargetDrift: number;
  readonly severity: PortfolioDriftSeverity;
  readonly rebalanceRequired: boolean;
  readonly targets: readonly PortfolioDriftTarget[];
  readonly detectedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Rebalancing
 * ========================================================================== */

export interface PortfolioRebalanceTrade {
  readonly tradeId: string;
  readonly marketSymbol: MarketSymbol;
  readonly baseAsset: AssetSymbol;
  readonly quoteAsset: AssetSymbol;
  readonly marketType: PortfolioMarketType;
  readonly side: PortfolioPositionSide;
  readonly exchangeId?: ExchangeIdentifier;
  readonly accountId?: AccountIdentifier;
  readonly quantity?: number;
  readonly notionalValue: number;
  readonly estimatedPrice?: number;
  readonly estimatedFee?: number;
  readonly estimatedSlippage?: number;
  readonly priority: number;
  readonly reasons: readonly string[];
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioRebalanceRequest {
  readonly rebalanceId: PortfolioRebalanceIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly snapshot: PortfolioSnapshot;
  readonly reason: PortfolioRebalanceReason;
  readonly allocationResult: PortfolioCapitalAllocationResult;
  readonly driftReport?: PortfolioDriftReport;
  readonly optimizationResult?: PortfolioOptimizationResult;
  readonly maximumTurnover?: number;
  readonly maximumTransactionCost?: number;
  readonly approvalRequired: boolean;
  readonly requestedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioRebalancePlan {
  readonly rebalanceId: PortfolioRebalanceIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly reason: PortfolioRebalanceReason;
  readonly status: PortfolioRebalanceStatus;
  readonly trades: readonly PortfolioRebalanceTrade[];
  readonly totalBuyNotional: number;
  readonly totalSellNotional: number;
  readonly estimatedTurnover: number;
  readonly estimatedFees: number;
  readonly estimatedSlippage: number;
  readonly estimatedTotalCost: number;
  readonly expectedRiskReduction?: number;
  readonly expectedReturnImpact?: number;
  readonly approvalRequired: boolean;
  readonly validUntil?: Timestamp;
  readonly generatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioRebalanceExecutionResult {
  readonly rebalanceId: PortfolioRebalanceIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly status: PortfolioRebalanceStatus;
  readonly completedTradeIds: readonly string[];
  readonly failedTradeIds: readonly string[];
  readonly skippedTradeIds: readonly string[];
  readonly actualBuyNotional: number;
  readonly actualSellNotional: number;
  readonly actualFees: number;
  readonly actualSlippage: number;
  readonly startedAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly failureReason?: string;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Explainability
 * ========================================================================== */

export interface PortfolioExplanationFactor {
  readonly factorType: PortfolioExplanationFactorType;
  readonly name: string;
  readonly description: string;
  readonly impact: number;
  readonly supporting: boolean;
  readonly affectedTargets: readonly string[];
  readonly evidence?: PortfolioMetadata;
}

export interface PortfolioDecisionExplanation {
  readonly explanationId: PortfolioExplanationIdentifier;
  readonly portfolioId: PortfolioIdentifier;
  readonly decisionId: PortfolioDecisionIdentifier;
  readonly summary: string;
  readonly primaryReasons: readonly string[];
  readonly supportingFactors: readonly PortfolioExplanationFactor[];
  readonly conflictingFactors: readonly PortfolioExplanationFactor[];
  readonly constraintsApplied: readonly string[];
  readonly expectedBenefits: readonly string[];
  readonly risks: readonly string[];
  readonly invalidationConditions: readonly string[];
  readonly confidence: number;
  readonly modelVersion?: string;
  readonly generatedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Data quality
 * ========================================================================== */

export interface PortfolioDataQualityIssue {
  readonly source: string;
  readonly field?: string;
  readonly status: PortfolioDataQualityStatus;
  readonly description: string;
  readonly observedAt?: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioDataQualityReport {
  readonly status: PortfolioDataQualityStatus;
  readonly completenessScore: number;
  readonly freshnessScore: number;
  readonly consistencyScore: number;
  readonly issues: readonly PortfolioDataQualityIssue[];
  readonly evaluatedAt: Timestamp;
}

/* ============================================================================
 * Unified manager request and decision
 * ========================================================================== */

export interface AIPortfolioManagerConfiguration {
  readonly portfolioId: PortfolioIdentifier;
  readonly mode: PortfolioManagerMode;
  readonly enabled: boolean;
  readonly optimizationPreferences: PortfolioOptimizationPreferences;
  readonly allocationPolicy: PortfolioAllocationPolicy;
  readonly rebalanceDriftThreshold: number;
  readonly minimumRebalanceIntervalMilliseconds: number;
  readonly maximumDecisionAgeMilliseconds: number;
  readonly requireFreshMarketData: boolean;
  readonly requireRiskBudget: boolean;
  readonly requireExplanation: boolean;
  readonly allowAutomaticRebalancing: boolean;
  readonly metadata?: PortfolioMetadata;
}

export interface AIPortfolioManagerRequest {
  readonly requestId: string;
  readonly portfolioId: PortfolioIdentifier;
  readonly snapshot: PortfolioSnapshot;
  readonly configuration: AIPortfolioManagerConfiguration;
  readonly returnSeries: readonly AssetReturnSeries[];
  readonly allocationTargets: readonly PortfolioAllocationTarget[];
  readonly riskBudget?: PortfolioRiskBudget;
  readonly previousOptimization?: PortfolioOptimizationResult;
  readonly previousAllocation?: PortfolioCapitalAllocationResult;
  readonly requestedAt: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

export interface AIPortfolioManagerDecision {
  readonly decisionId: PortfolioDecisionIdentifier;
  readonly requestId: string;
  readonly portfolioId: PortfolioIdentifier;
  readonly status: PortfolioDecisionStatus;
  readonly mode: PortfolioManagerMode;
  readonly healthReport: PortfolioHealthReport;
  readonly correlationMatrix?: PortfolioCorrelationMatrix;
  readonly covarianceMatrix?: PortfolioCovarianceMatrix;
  readonly riskBudgetResult?: PortfolioRiskBudgetResult;
  readonly optimizationResult?: PortfolioOptimizationResult;
  readonly allocationResult?: PortfolioCapitalAllocationResult;
  readonly driftReport?: PortfolioDriftReport;
  readonly rebalancePlan?: PortfolioRebalancePlan;
  readonly explanation?: PortfolioDecisionExplanation;
  readonly dataQuality: PortfolioDataQualityReport;
  readonly approvedForExecution: boolean;
  readonly approvalRequired: boolean;
  readonly rejectionReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly generatedAt: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Service contracts
 * ========================================================================== */

export interface PortfolioHealthAnalyzer {
  analyze(
    snapshot: PortfolioSnapshot,
    performance: PortfolioPerformanceMetrics,
    correlationMatrix?: PortfolioCorrelationMatrix,
  ): PortfolioHealthReport;
}

export interface PortfolioCorrelationEngine {
  calculate(
    returnSeries: readonly AssetReturnSeries[],
    generatedAt?: Timestamp,
  ): PortfolioCorrelationMatrix;
}

export interface PortfolioCovarianceMatrixBuilder {
  build(
    returnSeries: readonly AssetReturnSeries[],
    generatedAt?: Timestamp,
  ): PortfolioCovarianceMatrix;
}

export interface PortfolioOptimizer {
  optimize(
    request: PortfolioOptimizationRequest,
  ): PortfolioOptimizationResult;
}

export interface PortfolioCapitalAllocator {
  allocate(
    request: PortfolioCapitalAllocationRequest,
  ): PortfolioCapitalAllocationResult;
}

export interface PortfolioRiskBudgetEngine {
  evaluate(
    snapshot: PortfolioSnapshot,
    riskBudget: PortfolioRiskBudget,
    covarianceMatrix?: PortfolioCovarianceMatrix,
  ): PortfolioRiskBudgetResult;
}

export interface PortfolioDriftDetector {
  detect(
    portfolioId: PortfolioIdentifier,
    snapshotId: PortfolioSnapshotIdentifier,
    targets: readonly PortfolioAllocationTarget[],
    detectedAt?: Timestamp,
  ): PortfolioDriftReport;
}

export interface PortfolioRebalancingEngine {
  createPlan(request: PortfolioRebalanceRequest): PortfolioRebalancePlan;
}

export interface PortfolioExplainabilityEngine {
  explain(
    decision: Omit<AIPortfolioManagerDecision, "explanation">,
  ): PortfolioDecisionExplanation;
}

export interface AIPortfolioManager {
  evaluate(request: AIPortfolioManagerRequest): AIPortfolioManagerDecision;
}

/* ============================================================================
 * Event contracts
 * ========================================================================== */

export enum AIPortfolioEventType {
  EVALUATION_STARTED = "EVALUATION_STARTED",
  HEALTH_ANALYZED = "HEALTH_ANALYZED",
  CORRELATION_CALCULATED = "CORRELATION_CALCULATED",
  COVARIANCE_CALCULATED = "COVARIANCE_CALCULATED",
  RISK_BUDGET_EVALUATED = "RISK_BUDGET_EVALUATED",
  OPTIMIZATION_COMPLETED = "OPTIMIZATION_COMPLETED",
  CAPITAL_ALLOCATED = "CAPITAL_ALLOCATED",
  DRIFT_DETECTED = "DRIFT_DETECTED",
  REBALANCE_PROPOSED = "REBALANCE_PROPOSED",
  DECISION_APPROVED = "DECISION_APPROVED",
  DECISION_REJECTED = "DECISION_REJECTED",
  DECISION_EXPIRED = "DECISION_EXPIRED",
  EXECUTION_STARTED = "EXECUTION_STARTED",
  EXECUTION_COMPLETED = "EXECUTION_COMPLETED",
  EXECUTION_FAILED = "EXECUTION_FAILED",
}

export interface AIPortfolioEvent<TPayload = PortfolioMetadata> {
  readonly eventId: string;
  readonly eventType: AIPortfolioEventType;
  readonly portfolioId: PortfolioIdentifier;
  readonly decisionId?: PortfolioDecisionIdentifier;
  readonly occurredAt: Timestamp;
  readonly payload: TPayload;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Error contracts
 * ========================================================================== */

export enum AIPortfolioErrorCode {
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_CONFIGURATION = "INVALID_CONFIGURATION",
  INVALID_SNAPSHOT = "INVALID_SNAPSHOT",
  INVALID_RETURN_SERIES = "INVALID_RETURN_SERIES",
  INVALID_POLICY = "INVALID_POLICY",
  INVALID_RISK_BUDGET = "INVALID_RISK_BUDGET",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  STALE_DATA = "STALE_DATA",
  OPTIMIZATION_FAILED = "OPTIMIZATION_FAILED",
  ALLOCATION_FAILED = "ALLOCATION_FAILED",
  RISK_BUDGET_EXCEEDED = "RISK_BUDGET_EXCEEDED",
  CONSTRAINT_VIOLATION = "CONSTRAINT_VIOLATION",
  REBALANCE_FAILED = "REBALANCE_FAILED",
  EXPLANATION_FAILED = "EXPLANATION_FAILED",
  DECISION_EXPIRED = "DECISION_EXPIRED",
  EXECUTION_NOT_ALLOWED = "EXECUTION_NOT_ALLOWED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export interface AIPortfolioErrorDetails {
  readonly code: AIPortfolioErrorCode;
  readonly message: string;
  readonly field?: string;
  readonly targetId?: string;
  readonly retryable: boolean;
  readonly metadata?: PortfolioMetadata;
}

/* ============================================================================
 * Default constants
 * ========================================================================== */

export const DEFAULT_PORTFOLIO_HEALTH_SCORE_RANGE: NumericRange =
  Object.freeze({
    minimum: 0,
    maximum: 100,
  });

export const DEFAULT_PORTFOLIO_CONFIDENCE_RANGE: NumericRange =
  Object.freeze({
    minimum: 0,
    maximum: 1,
  });

export const DEFAULT_PORTFOLIO_WEIGHT_RANGE: NumericRange = Object.freeze({
  minimum: 0,
  maximum: 1,
});

export const DEFAULT_CORRELATION_RANGE: NumericRange = Object.freeze({
  minimum: -1,
  maximum: 1,
});

export const DEFAULT_REBALANCE_DRIFT_THRESHOLD = 0.05;
export const DEFAULT_MINIMUM_REBALANCE_INTERVAL_MILLISECONDS =
  60 * 60 * 1_000;
export const DEFAULT_MAXIMUM_DECISION_AGE_MILLISECONDS = 5 * 60 * 1_000;
export const DEFAULT_MINIMUM_CASH_RESERVE_WEIGHT = 0.05;
export const DEFAULT_MAXIMUM_INVESTED_WEIGHT = 0.95;
export const DEFAULT_MAXIMUM_SINGLE_ASSET_WEIGHT = 0.25;
export const DEFAULT_MAXIMUM_SINGLE_STRATEGY_WEIGHT = 0.35;
export const DEFAULT_MAXIMUM_SINGLE_BOT_WEIGHT = 0.25;
export const DEFAULT_MAXIMUM_SINGLE_EXCHANGE_WEIGHT = 0.5;