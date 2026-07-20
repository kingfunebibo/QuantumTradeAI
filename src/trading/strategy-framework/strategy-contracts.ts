/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-contracts.ts
 *
 * Purpose:
 * Defines the immutable, deterministic contracts used by the professional
 * trading strategy framework.
 */

/* ============================================================================
 * Primitive aliases
 * ============================================================================
 */

export type UnixTimestampMilliseconds = number;

export type StrategyId = string;
export type StrategyInstanceId = string;
export type StrategyVersion = string;
export type StrategyEvaluationId = string;
export type StrategySignalId = string;
export type StrategyOrderIntentId = string;
export type StrategyCorrelationId = string;
export type StrategyFactoryId = string;
export type ExchangeId = string;
export type SymbolCode = string;
export type AssetCode = string;
export type Timeframe = string;
export type IndicatorId = string;
export type FeatureId = string;

/* ============================================================================
 * Constants
 * ============================================================================
 */

export const INITIAL_STRATEGY_STATE_VERSION = 0;

export const STRATEGY_CONFIDENCE_MINIMUM = 0;
export const STRATEGY_CONFIDENCE_MAXIMUM = 1;

export const STRATEGY_SCORE_MINIMUM = -1;
export const STRATEGY_SCORE_MAXIMUM = 1;

/* ============================================================================
 * Metadata and serializable values
 * ============================================================================
 */

export type StrategyPrimitiveValue =
  | string
  | number
  | boolean
  | null;

export interface StrategySerializableArray
  extends ReadonlyArray<StrategySerializableValue> {}

export interface StrategySerializableObject {
  readonly [key: string]: StrategySerializableValue;
}

export type StrategySerializableValue =
  | StrategyPrimitiveValue
  | StrategySerializableArray
  | StrategySerializableObject;

export type StrategyMetadata = Readonly<
  Record<string, StrategySerializableValue>
>;

export const EMPTY_STRATEGY_METADATA: StrategyMetadata =
  Object.freeze({});

/* ============================================================================
 * Enumerations
 * ============================================================================
 */

export type StrategyEnvironment =
  | "BACKTEST"
  | "PAPER"
  | "SANDBOX"
  | "LIVE";

export type StrategyTradingMode =
  | "MANUAL_ASSISTED"
  | "SEMI_AUTOMATIC"
  | "AUTOMATIC"
  | "SIGNAL_ONLY";

export type StrategyMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURE"
  | "OPTION";

export type StrategyDirection =
  | "LONG"
  | "SHORT"
  | "FLAT";

export type StrategySignalAction =
  | "BUY"
  | "SELL"
  | "HOLD"
  | "CLOSE"
  | "REDUCE"
  | "REVERSE";

export type StrategyOrderSide =
  | "BUY"
  | "SELL";

export type StrategyOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP_MARKET"
  | "STOP_LIMIT"
  | "TAKE_PROFIT_MARKET"
  | "TAKE_PROFIT_LIMIT";

export type StrategyTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK"
  | "GTX"
  | "DAY";

export type StrategyLifecycleState =
  | "CREATED"
  | "INITIALIZING"
  | "READY"
  | "RUNNING"
  | "PAUSED"
  | "STOPPING"
  | "STOPPED"
  | "FAILED"
  | "DISPOSED";

export type StrategyDeterminismMode =
  | "STRICT"
  | "SEEDED"
  | "NON_DETERMINISTIC";

export type StrategyCapability =
  | "RULE_BASED"
  | "INDICATOR_DRIVEN"
  | "MULTI_TIMEFRAME"
  | "MULTI_SYMBOL"
  | "MULTI_EXCHANGE"
  | "SPOT_TRADING"
  | "MARGIN_TRADING"
  | "FUTURES_TRADING"
  | "OPTIONS_TRADING"
  | "POSITION_SIZING"
  | "STOP_LOSS"
  | "TAKE_PROFIT"
  | "TRAILING_STOP"
  | "PYRAMIDING"
  | "POSITION_REVERSAL"
  | "EXTERNAL_SIGNALS"
  | "AI_FEATURES"
  | "AI_INFERENCE"
  | "PORTFOLIO_AWARE"
  | "RISK_AWARE"
  | "STATEFUL"
  | "BACKTESTABLE";

export type StrategyValidationSeverity =
  | "ERROR"
  | "WARNING";

export type StrategyParameterType =
  | "STRING"
  | "NUMBER"
  | "INTEGER"
  | "BOOLEAN"
  | "ENUM"
  | "STRING_ARRAY"
  | "NUMBER_ARRAY"
  | "OBJECT";

export type StrategyStateMutationOperation =
  | "SET"
  | "DELETE"
  | "CLEAR"
  | "INCREMENT"
  | "APPEND"
  | "MERGE";

export type StrategyTriggerType =
  | "CANDLE_CLOSED"
  | "TICKER_UPDATED"
  | "ORDER_BOOK_UPDATED"
  | "TRADE_RECEIVED"
  | "FUNDING_RATE_UPDATED"
  | "OPEN_INTEREST_UPDATED"
  | "POSITION_UPDATED"
  | "PORTFOLIO_UPDATED"
  | "RISK_UPDATED"
  | "EXTERNAL_SIGNAL"
  | "AI_INFERENCE"
  | "SCHEDULED"
  | "MANUAL"
  | "RECOVERY";

export type StrategyDecisionStatus =
  | "NO_ACTION"
  | "SIGNAL_GENERATED"
  | "ORDER_INTENT_GENERATED"
  | "REJECTED"
  | "SKIPPED"
  | "FAILED";

/* ============================================================================
 * Result and error contracts
 * ============================================================================
 */

export interface StrategyError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly metadata: StrategyMetadata;
}

export type StrategyResult<T> =
  | Readonly<{
      ok: true;
      value: T;
      metadata: StrategyMetadata;
    }>
  | Readonly<{
      ok: false;
      error: StrategyError;
      metadata: StrategyMetadata;
    }>;

/* ============================================================================
 * Instrument contracts
 * ============================================================================
 */

export interface StrategyInstrument {
  readonly exchangeId: ExchangeId;
  readonly symbol: SymbolCode;
  readonly normalizedSymbol: SymbolCode;
  readonly baseAsset: AssetCode;
  readonly quoteAsset: AssetCode;
  readonly settlementAsset?: AssetCode;
  readonly marketType: StrategyMarketType;
  readonly contractSize?: number;
  readonly pricePrecision?: number;
  readonly quantityPrecision?: number;
  readonly minimumQuantity?: number;
  readonly maximumQuantity?: number;
  readonly minimumNotional?: number;
  readonly tickSize?: number;
  readonly stepSize?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyMarketSubscription {
  readonly instrument: StrategyInstrument;
  readonly timeframes: readonly Timeframe[];
  readonly indicatorIds: readonly IndicatorId[];
  readonly minimumCandleHistory: number;
  readonly requiresTicker: boolean;
  readonly requiresOrderBook: boolean;
  readonly requiresTrades: boolean;
  readonly requiresFundingRate: boolean;
  readonly requiresOpenInterest: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyUniverse {
  readonly exchanges: readonly ExchangeId[];
  readonly instruments: readonly StrategyInstrument[];
  readonly subscriptions: readonly StrategyMarketSubscription[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Market-data contracts
 * ============================================================================
 */

export interface StrategyCandle {
  readonly openTime: UnixTimestampMilliseconds;
  readonly closeTime: UnixTimestampMilliseconds;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly quoteVolume?: number;
  readonly tradeCount?: number;
  readonly closed: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyTicker {
  readonly timestamp: UnixTimestampMilliseconds;
  readonly bidPrice?: number;
  readonly bidQuantity?: number;
  readonly askPrice?: number;
  readonly askQuantity?: number;
  readonly lastPrice: number;
  readonly lastQuantity?: number;
  readonly markPrice?: number;
  readonly indexPrice?: number;
  readonly openPrice24h?: number;
  readonly highPrice24h?: number;
  readonly lowPrice24h?: number;
  readonly volume24h?: number;
  readonly quoteVolume24h?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyOrderBookLevel {
  readonly price: number;
  readonly quantity: number;
  readonly orderCount?: number;
}

export interface StrategyOrderBook {
  readonly timestamp: UnixTimestampMilliseconds;
  readonly sequence?: number;
  readonly bids: readonly StrategyOrderBookLevel[];
  readonly asks: readonly StrategyOrderBookLevel[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyMarketTrade {
  readonly tradeId: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly price: number;
  readonly quantity: number;
  readonly aggressorSide?: StrategyOrderSide;
  readonly metadata: StrategyMetadata;
}

export interface StrategyDerivativeSnapshot {
  readonly timestamp: UnixTimestampMilliseconds;
  readonly fundingRate?: number;
  readonly nextFundingTime?: UnixTimestampMilliseconds;
  readonly openInterest?: number;
  readonly markPrice?: number;
  readonly indexPrice?: number;
  readonly basis?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyMarketSnapshot {
  readonly instrument: StrategyInstrument;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly timeframe?: Timeframe;
  readonly candles: readonly StrategyCandle[];
  readonly ticker?: StrategyTicker;
  readonly orderBook?: StrategyOrderBook;
  readonly recentTrades: readonly StrategyMarketTrade[];
  readonly derivatives?: StrategyDerivativeSnapshot;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Feature and AI contracts
 * ============================================================================
 */

export interface StrategyFeatureValue {
  readonly featureId: FeatureId;
  readonly value: StrategySerializableValue;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly source: string;
  readonly confidence?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyFeatureSet {
  readonly instrument: StrategyInstrument;
  readonly timeframe?: Timeframe;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly features: Readonly<Record<FeatureId, StrategyFeatureValue>>;
  readonly metadata: StrategyMetadata;
}

export interface StrategyExternalSignal {
  readonly externalSignalId: string;
  readonly providerId: string;
  readonly instrument: StrategyInstrument;
  readonly action: StrategySignalAction;
  readonly confidence: number;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly validUntil?: UnixTimestampMilliseconds;
  readonly payload: StrategyMetadata;
  readonly metadata: StrategyMetadata;
}

export interface StrategyAiInference {
  readonly inferenceId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly instrument: StrategyInstrument;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly prediction: StrategySerializableValue;
  readonly confidence?: number;
  readonly featureContributions?: Readonly<Record<string, number>>;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Portfolio contracts
 * ============================================================================
 */

export interface StrategyBalanceSnapshot {
  readonly exchangeId: ExchangeId;
  readonly asset: AssetCode;
  readonly total: number;
  readonly available: number;
  readonly reserved: number;
  readonly borrowed?: number;
  readonly interest?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPositionSnapshot {
  readonly positionId: string;
  readonly instrument: StrategyInstrument;
  readonly direction: StrategyDirection;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly markPrice?: number;
  readonly liquidationPrice?: number;
  readonly leverage?: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly marginUsed?: number;
  readonly openedAt?: UnixTimestampMilliseconds;
  readonly updatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPortfolioSnapshot {
  readonly portfolioId: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly reportingCurrency: AssetCode;
  readonly totalEquity: number;
  readonly availableEquity: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly balances: readonly StrategyBalanceSnapshot[];
  readonly positions: readonly StrategyPositionSnapshot[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Risk contracts
 * ============================================================================
 */

export interface StrategyRiskLimits {
  readonly maximumPositionNotional?: number;
  readonly maximumPortfolioExposure?: number;
  readonly maximumSymbolExposure?: number;
  readonly maximumExchangeExposure?: number;
  readonly maximumLeverage?: number;
  readonly maximumOpenPositions?: number;
  readonly maximumOpenOrders?: number;
  readonly maximumDailyLoss?: number;
  readonly maximumDrawdown?: number;
  readonly maximumOrderNotional?: number;
  readonly minimumRiskRewardRatio?: number;
  readonly maximumSignalAgeMilliseconds?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyRiskSnapshot {
  readonly timestamp: UnixTimestampMilliseconds;
  readonly tradingAllowed: boolean;
  readonly circuitBreakerActive: boolean;
  readonly killSwitchActive: boolean;
  readonly currentDailyPnl?: number;
  readonly currentDrawdown?: number;
  readonly portfolioExposure?: number;
  readonly symbolExposure?: number;
  readonly exchangeExposure?: number;
  readonly limits: StrategyRiskLimits;
  readonly restrictions: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Strategy state contracts
 * ============================================================================
 */

export type StrategyStateValue = StrategySerializableValue;

export interface StrategyStateSnapshot {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly version: number;
  readonly updatedAt: UnixTimestampMilliseconds;
  readonly checksum?: string;
  readonly values: Readonly<Record<string, StrategyStateValue>>;
  readonly metadata: StrategyMetadata;
}

export interface StrategyStateMutation {
  readonly operation: StrategyStateMutationOperation;
  readonly path: string;
  readonly value?: StrategyStateValue;
  readonly expectedCurrentValue?: StrategyStateValue;
  readonly metadata: StrategyMetadata;
}

export interface StrategyStateUpdate {
  readonly expectedVersion: number;
  readonly mutations: readonly StrategyStateMutation[];
  readonly replaceState?: Readonly<Record<string, StrategyStateValue>>;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Signal contracts
 * ============================================================================
 */

export interface StrategySignalEvidence {
  readonly sourceId: string;
  readonly description: string;
  readonly weight?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategySignalValidity {
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly validFrom: UnixTimestampMilliseconds;
  readonly validUntil?: UnixTimestampMilliseconds;
  readonly maximumExecutionDelayMilliseconds?: number;
}

export interface StrategySignal {
  readonly signalId: StrategySignalId;
  readonly evaluationId: StrategyEvaluationId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly correlationId: StrategyCorrelationId;
  readonly instrument: StrategyInstrument;
  readonly action: StrategySignalAction;
  readonly direction: StrategyDirection;
  readonly confidence: number;
  readonly score?: number;
  readonly referencePrice: number;
  readonly targetPrice?: number;
  readonly stopLossPrice?: number;
  readonly takeProfitPrice?: number;
  readonly suggestedQuantity?: number;
  readonly suggestedNotional?: number;
  readonly suggestedRiskAmount?: number;
  readonly suggestedLeverage?: number;
  readonly reason: string;
  readonly evidence: readonly StrategySignalEvidence[];
  readonly validity: StrategySignalValidity;
  readonly tags: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Position-sizing contracts
 * ============================================================================
 */

export interface StrategyPositionSizingRequest {
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly signal: StrategySignal;
  readonly portfolio: StrategyPortfolioSnapshot;
  readonly risk: StrategyRiskSnapshot;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPositionSizingDecision {
  readonly approved: boolean;
  readonly quantity?: number;
  readonly notional?: number;
  readonly riskAmount?: number;
  readonly leverage?: number;
  readonly reason: string;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Order-intent contracts
 * ============================================================================
 */

export interface StrategyOrderProtection {
  readonly stopLossPrice?: number;
  readonly takeProfitPrice?: number;
  readonly trailingStopDistance?: number;
  readonly trailingStopActivationPrice?: number;
  readonly breakEvenTriggerPrice?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyOrderIntent {
  readonly orderIntentId: StrategyOrderIntentId;
  readonly signalId?: StrategySignalId;
  readonly evaluationId: StrategyEvaluationId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly correlationId: StrategyCorrelationId;
  readonly instrument: StrategyInstrument;
  readonly side: StrategyOrderSide;
  readonly orderType: StrategyOrderType;
  readonly timeInForce: StrategyTimeInForce;
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly leverage?: number;
  readonly reduceOnly: boolean;
  readonly closePosition: boolean;
  readonly postOnly: boolean;
  readonly clientOrderId?: string;
  readonly protection?: StrategyOrderProtection;
  readonly expiresAt?: UnixTimestampMilliseconds;
  readonly reason: string;
  readonly tags: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Manifest and parameter contracts
 * ============================================================================
 */

export interface StrategyAuthor {
  readonly name: string;
  readonly organization?: string;
  readonly email?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyParameterDescriptor {
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly type: StrategyParameterType;
  readonly required: boolean;
  readonly sensitive: boolean;
  readonly mutableAtRuntime: boolean;
  readonly defaultValue?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly allowedValues?: readonly unknown[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyManifest {
  readonly strategyId: StrategyId;
  readonly name: string;
  readonly description: string;
  readonly version: StrategyVersion;
  readonly author: StrategyAuthor;
  readonly capabilities: readonly StrategyCapability[];
  readonly supportedMarketTypes: readonly StrategyMarketType[];
  readonly supportedTradingModes: readonly StrategyTradingMode[];
  readonly supportedEnvironments: readonly StrategyEnvironment[];
  readonly determinismMode: StrategyDeterminismMode;
  readonly parameterSchema: readonly StrategyParameterDescriptor[];
  readonly minimumEvaluationIntervalMilliseconds?: number;
  readonly maximumEvaluationDurationMilliseconds?: number;
  readonly createdAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyExecutionPreferences {
  readonly allowMarketOrders: boolean;
  readonly allowLimitOrders: boolean;
  readonly allowStopOrders: boolean;
  readonly allowPartialFills: boolean;
  readonly allowOrderReplacement: boolean;
  readonly allowOrderCancellation: boolean;
  readonly allowPositionReversal: boolean;
  readonly allowPyramiding: boolean;
  readonly maximumEntriesPerPosition?: number;
  readonly maximumConcurrentPositions?: number;
  readonly slippageToleranceBps?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyConfiguration {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
  readonly enabled: boolean;
  readonly environment: StrategyEnvironment;
  readonly tradingMode: StrategyTradingMode;
  readonly universe: StrategyUniverse;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly executionPreferences: StrategyExecutionPreferences;
  readonly riskOverrides?: StrategyRiskLimits;
  readonly deterministicSeed?: string;
  readonly tags: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Lifecycle contracts
 * ============================================================================
 */

export interface StrategyLifecycleContext {
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly configuration: StrategyConfiguration;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly correlationId: StrategyCorrelationId;
  readonly metadata: StrategyMetadata;
}

export interface StrategyInitializationContext
  extends StrategyLifecycleContext {
  readonly existingState?: StrategyStateSnapshot;
}

export interface StrategyStartContext
  extends StrategyLifecycleContext {
  readonly state: StrategyStateSnapshot;
}

export interface StrategyPauseContext
  extends StrategyLifecycleContext {
  readonly state: StrategyStateSnapshot;
  readonly reason: string;
}

export interface StrategyResumeContext
  extends StrategyLifecycleContext {
  readonly state: StrategyStateSnapshot;
}

export interface StrategyStopContext
  extends StrategyLifecycleContext {
  readonly state: StrategyStateSnapshot;
  readonly reason: string;
}

export interface StrategyDisposeContext
  extends StrategyLifecycleContext {
  readonly state?: StrategyStateSnapshot;
}

/* ============================================================================
 * Evaluation contracts
 * ============================================================================
 */

export interface StrategyEvaluationTrigger {
  readonly type: StrategyTriggerType;
  readonly sourceId?: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyEvaluationContext {
  readonly evaluationId: StrategyEvaluationId;
  readonly correlationId: StrategyCorrelationId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly strategyVersion: StrategyVersion;
  readonly environment: StrategyEnvironment;
  readonly tradingMode: StrategyTradingMode;
  readonly evaluationTime: UnixTimestampMilliseconds;
  readonly trigger: StrategyEvaluationTrigger;
  readonly market: StrategyMarketSnapshot;
  readonly relatedMarkets: readonly StrategyMarketSnapshot[];
  readonly features: StrategyFeatureSet;
  readonly relatedFeatureSets: readonly StrategyFeatureSet[];
  readonly portfolio: StrategyPortfolioSnapshot;
  readonly risk: StrategyRiskSnapshot;
  readonly position?: StrategyPositionSnapshot;
  readonly relatedPositions: readonly StrategyPositionSnapshot[];
  readonly state: StrategyStateSnapshot;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly externalSignals?: readonly StrategyExternalSignal[];
  readonly aiInferences?: readonly StrategyAiInference[];
  readonly deterministicSeed?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyDiagnostic {
  readonly code: string;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyEvaluationDecision {
  readonly status: StrategyDecisionStatus;
  readonly signals: readonly StrategySignal[];
  readonly orderIntents: readonly StrategyOrderIntent[];
  readonly stateUpdate?: StrategyStateUpdate;
  readonly diagnostics: readonly StrategyDiagnostic[];
  readonly reason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyEvaluationResult {
  readonly evaluationId: StrategyEvaluationId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly startedAt: UnixTimestampMilliseconds;
  readonly completedAt: UnixTimestampMilliseconds;
  readonly durationMilliseconds: number;
  readonly decision: StrategyEvaluationDecision;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Performance contracts
 * ============================================================================
 */

export interface StrategyPerformanceSnapshot {
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly totalEvaluations: number;
  readonly totalSignals: number;
  readonly totalOrderIntents: number;
  readonly totalTrades?: number;
  readonly winningTrades?: number;
  readonly losingTrades?: number;
  readonly realizedPnl?: number;
  readonly unrealizedPnl?: number;
  readonly winRate?: number;
  readonly profitFactor?: number;
  readonly sharpeRatio?: number;
  readonly sortinoRatio?: number;
  readonly maximumDrawdown?: number;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Validation contracts
 * ============================================================================
 */

export interface StrategyValidationIssue {
  readonly severity: StrategyValidationSeverity;
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyValidationReport {
  readonly valid: boolean;
  readonly issues: readonly StrategyValidationIssue[];
  readonly validatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyContractValidator {
  validateManifest(
    manifest: StrategyManifest,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport;

  validateConfiguration(
    configuration: StrategyConfiguration,
    manifest: StrategyManifest,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport;

  validateEvaluationContext(
    context: StrategyEvaluationContext,
  ): StrategyValidationReport;

  validateSignal(
    signal: StrategySignal,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport;

  validateOrderIntent(
    orderIntent: StrategyOrderIntent,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport;

  validateStateUpdate(
    stateUpdate: StrategyStateUpdate,
    currentState: StrategyStateSnapshot,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport;
}

/* ============================================================================
 * Strategy runtime interfaces
 * ============================================================================
 */

export interface TradingStrategy {
  readonly manifest: StrategyManifest;

  initialize(
    context: StrategyInitializationContext,
  ): Promise<StrategyResult<StrategyStateSnapshot>>;

  start(
    context: StrategyStartContext,
  ): Promise<StrategyResult<void>>;

  evaluate(
    context: StrategyEvaluationContext,
  ): Promise<StrategyResult<StrategyEvaluationResult>>;

  pause(
    context: StrategyPauseContext,
  ): Promise<StrategyResult<void>>;

  resume(
    context: StrategyResumeContext,
  ): Promise<StrategyResult<void>>;

  stop(
    context: StrategyStopContext,
  ): Promise<StrategyResult<void>>;

  dispose(
    context: StrategyDisposeContext,
  ): Promise<StrategyResult<void>>;
}

export interface StrategyFactory {
  readonly factoryId: StrategyFactoryId;
  readonly manifest: StrategyManifest;

  create(
    configuration: StrategyConfiguration,
  ): TradingStrategy;
}

export interface StrategyRegistry {
  register(factory: StrategyFactory): void;
  unregister(strategyId: StrategyId): boolean;
  has(strategyId: StrategyId): boolean;
  get(strategyId: StrategyId): StrategyFactory | undefined;
  list(): readonly StrategyFactory[];
}

export interface StrategyRuntime {
  initialize(
    configuration: StrategyConfiguration,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<StrategyStateSnapshot>>;

  evaluate(
    context: StrategyEvaluationContext,
  ): Promise<StrategyResult<StrategyEvaluationResult>>;

  pause(
    strategyInstanceId: StrategyInstanceId,
    reason: string,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>>;

  resume(
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>>;

  stop(
    strategyInstanceId: StrategyInstanceId,
    reason: string,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>>;
}

/* ============================================================================
 * Runtime event contracts
 * ============================================================================
 */

export type StrategyRuntimeEventType =
  | "REGISTERED"
  | "INITIALIZED"
  | "STARTED"
  | "EVALUATION_STARTED"
  | "EVALUATION_COMPLETED"
  | "SIGNAL_GENERATED"
  | "ORDER_INTENT_GENERATED"
  | "STATE_UPDATED"
  | "PAUSED"
  | "RESUMED"
  | "STOPPED"
  | "FAILED"
  | "DISPOSED";

export interface StrategyRuntimeEvent {
  readonly eventId: string;
  readonly type: StrategyRuntimeEventType;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId?: StrategyInstanceId;
  readonly correlationId?: StrategyCorrelationId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly payload: StrategyMetadata;
  readonly metadata: StrategyMetadata;
}

export interface StrategyRuntimeEventListener {
  onEvent(event: StrategyRuntimeEvent): void | Promise<void>;
}