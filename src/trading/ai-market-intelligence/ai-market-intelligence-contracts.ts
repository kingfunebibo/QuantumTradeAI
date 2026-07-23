/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * Foundational immutable contracts for the AI market-intelligence subsystem.
 *
 * Design goals:
 * - deterministic and replay-safe
 * - immutable by default
 * - explicit temporal and provenance semantics
 * - normalized confidence and probability values in [0, 1]
 * - no dependency on runtime-specific implementations
 */

export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type TimestampMs = Brand<number, "TimestampMs">;
export type SequenceNumber = Brand<number, "SequenceNumber">;
export type MarketIntelligenceRequestId = Brand<
  string,
  "MarketIntelligenceRequestId"
>;
export type MarketIntelligenceRunId = Brand<string, "MarketIntelligenceRunId">;
export type MarketIntelligenceReportId = Brand<
  string,
  "MarketIntelligenceReportId"
>;
export type MarketFeatureVectorId = Brand<string, "MarketFeatureVectorId">;
export type MarketPredictionId = Brand<string, "MarketPredictionId">;
export type MarketAnomalyId = Brand<string, "MarketAnomalyId">;
export type ExplainabilityRecordId = Brand<string, "ExplainabilityRecordId">;
export type CorrelationMatrixId = Brand<string, "CorrelationMatrixId">;
export type ModelVersion = Brand<string, "ModelVersion">;
export type DatasetVersion = Brand<string, "DatasetVersion">;
export type SymbolId = Brand<string, "SymbolId">;
export type VenueId = Brand<string, "VenueId">;
export type AssetId = Brand<string, "AssetId">;
export type StrategyId = Brand<string, "StrategyId">;
export type DecimalString = Brand<string, "DecimalString">;

export type NormalizedScore = Brand<number, "NormalizedScore">;
export type Probability = Brand<number, "Probability">;
export type ConfidenceScore = Brand<number, "ConfidenceScore">;
export type CorrelationCoefficient = Brand<number, "CorrelationCoefficient">;
export type Percentage = Brand<number, "Percentage">;
export type BasisPoints = Brand<number, "BasisPoints">;
export type Price = Brand<number, "Price">;
export type Quantity = Brand<number, "Quantity">;
export type Notional = Brand<number, "Notional">;
export type DurationMs = Brand<number, "DurationMs">;

export const AI_MARKET_INTELLIGENCE_SCHEMA_VERSION = "1.0.0" as const;

export type AiMarketIntelligenceSchemaVersion =
  typeof AI_MARKET_INTELLIGENCE_SCHEMA_VERSION;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | Readonly<{ readonly [key: string]: JsonValue }>;

export type ReadonlyRecord<TKey extends string, TValue> = Readonly<
  Record<TKey, TValue>
>;

export type NonEmptyReadonlyArray<TValue> = readonly [
  TValue,
  ...readonly TValue[],
];

export enum MarketIntelligencePipelineStage {
  VALIDATION = "VALIDATION",
  FEATURE_EXTRACTION = "FEATURE_EXTRACTION",
  REGIME_INTELLIGENCE = "REGIME_INTELLIGENCE",
  VOLATILITY_FORECASTING = "VOLATILITY_FORECASTING",
  LIQUIDITY_PREDICTION = "LIQUIDITY_PREDICTION",
  ORDER_FLOW_INTELLIGENCE = "ORDER_FLOW_INTELLIGENCE",
  CORRELATION_INTELLIGENCE = "CORRELATION_INTELLIGENCE",
  ANOMALY_DETECTION = "ANOMALY_DETECTION",
  PRICE_MOVEMENT_PREDICTION = "PRICE_MOVEMENT_PREDICTION",
  CONFIDENCE_AGGREGATION = "CONFIDENCE_AGGREGATION",
  EXPLAINABILITY = "EXPLAINABILITY",
  REPORT_ASSEMBLY = "REPORT_ASSEMBLY",
  PUBLICATION = "PUBLICATION",
}

export enum MarketIntelligenceRunStatus {
  CREATED = "CREATED",
  VALIDATING = "VALIDATING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  COMPLETED_WITH_WARNINGS = "COMPLETED_WITH_WARNINGS",
  REJECTED = "REJECTED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum MarketDataQuality {
  EXCELLENT = "EXCELLENT",
  GOOD = "GOOD",
  DEGRADED = "DEGRADED",
  POOR = "POOR",
  UNUSABLE = "UNUSABLE",
}

export enum MarketDataSourceType {
  CANDLES = "CANDLES",
  TRADES = "TRADES",
  ORDER_BOOK = "ORDER_BOOK",
  TICKER = "TICKER",
  FUNDING_RATE = "FUNDING_RATE",
  OPEN_INTEREST = "OPEN_INTEREST",
  LIQUIDATIONS = "LIQUIDATIONS",
  INDEX_PRICE = "INDEX_PRICE",
  MARK_PRICE = "MARK_PRICE",
  MARKET_BREADTH = "MARKET_BREADTH",
  ON_CHAIN = "ON_CHAIN",
  SENTIMENT = "SENTIMENT",
  DERIVED = "DERIVED",
}

export enum MarketVenueType {
  CENTRALIZED_EXCHANGE = "CENTRALIZED_EXCHANGE",
  DECENTRALIZED_EXCHANGE = "DECENTRALIZED_EXCHANGE",
  OTC = "OTC",
  AGGREGATED = "AGGREGATED",
  SYNTHETIC = "SYNTHETIC",
}

export enum MarketInstrumentType {
  SPOT = "SPOT",
  MARGIN = "MARGIN",
  PERPETUAL = "PERPETUAL",
  FUTURE = "FUTURE",
  OPTION = "OPTION",
  INDEX = "INDEX",
  SYNTHETIC = "SYNTHETIC",
}

export enum MarketTimeframe {
  TICK = "TICK",
  ONE_SECOND = "ONE_SECOND",
  FIVE_SECONDS = "FIVE_SECONDS",
  FIFTEEN_SECONDS = "FIFTEEN_SECONDS",
  ONE_MINUTE = "ONE_MINUTE",
  THREE_MINUTES = "THREE_MINUTES",
  FIVE_MINUTES = "FIVE_MINUTES",
  FIFTEEN_MINUTES = "FIFTEEN_MINUTES",
  THIRTY_MINUTES = "THIRTY_MINUTES",
  ONE_HOUR = "ONE_HOUR",
  FOUR_HOURS = "FOUR_HOURS",
  ONE_DAY = "ONE_DAY",
  ONE_WEEK = "ONE_WEEK",
}

export enum PredictionHorizon {
  IMMEDIATE = "IMMEDIATE",
  ULTRA_SHORT = "ULTRA_SHORT",
  SHORT = "SHORT",
  MEDIUM = "MEDIUM",
  LONG = "LONG",
  CUSTOM = "CUSTOM",
}

export enum MarketDirection {
  STRONGLY_BEARISH = "STRONGLY_BEARISH",
  BEARISH = "BEARISH",
  SLIGHTLY_BEARISH = "SLIGHTLY_BEARISH",
  NEUTRAL = "NEUTRAL",
  SLIGHTLY_BULLISH = "SLIGHTLY_BULLISH",
  BULLISH = "BULLISH",
  STRONGLY_BULLISH = "STRONGLY_BULLISH",
}

export enum MarketRegime {
  STRONG_BULL_TREND = "STRONG_BULL_TREND",
  BULL_TREND = "BULL_TREND",
  WEAK_BULL_TREND = "WEAK_BULL_TREND",
  STRONG_BEAR_TREND = "STRONG_BEAR_TREND",
  BEAR_TREND = "BEAR_TREND",
  WEAK_BEAR_TREND = "WEAK_BEAR_TREND",
  RANGE_BOUND = "RANGE_BOUND",
  MEAN_REVERTING = "MEAN_REVERTING",
  BREAKOUT = "BREAKOUT",
  BREAKDOWN = "BREAKDOWN",
  VOLATILITY_EXPANSION = "VOLATILITY_EXPANSION",
  VOLATILITY_CONTRACTION = "VOLATILITY_CONTRACTION",
  LIQUIDITY_STRESS = "LIQUIDITY_STRESS",
  DISLOCATION = "DISLOCATION",
  TRANSITION = "TRANSITION",
  UNKNOWN = "UNKNOWN",
}

export enum RegimeTransitionState {
  STABLE = "STABLE",
  EMERGING = "EMERGING",
  CONFIRMED = "CONFIRMED",
  WEAKENING = "WEAKENING",
  REVERSING = "REVERSING",
  UNCERTAIN = "UNCERTAIN",
}

export enum VolatilityState {
  EXTREMELY_LOW = "EXTREMELY_LOW",
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
  EXTREMELY_HIGH = "EXTREMELY_HIGH",
  EXPANDING = "EXPANDING",
  CONTRACTING = "CONTRACTING",
}

export enum LiquidityState {
  DEEP = "DEEP",
  HEALTHY = "HEALTHY",
  NORMAL = "NORMAL",
  THIN = "THIN",
  STRESSED = "STRESSED",
  DISLOCATED = "DISLOCATED",
}

export enum OrderFlowBias {
  EXTREME_SELL = "EXTREME_SELL",
  STRONG_SELL = "STRONG_SELL",
  SELL = "SELL",
  BALANCED = "BALANCED",
  BUY = "BUY",
  STRONG_BUY = "STRONG_BUY",
  EXTREME_BUY = "EXTREME_BUY",
}

export enum ParticipantActivity {
  RETAIL_DOMINATED = "RETAIL_DOMINATED",
  MIXED = "MIXED",
  INSTITUTIONAL_ACCUMULATION = "INSTITUTIONAL_ACCUMULATION",
  INSTITUTIONAL_DISTRIBUTION = "INSTITUTIONAL_DISTRIBUTION",
  MARKET_MAKER_DOMINATED = "MARKET_MAKER_DOMINATED",
  LIQUIDATION_DRIVEN = "LIQUIDATION_DRIVEN",
  UNKNOWN = "UNKNOWN",
}

export enum AnomalyType {
  PRICE_SPIKE = "PRICE_SPIKE",
  PRICE_CRASH = "PRICE_CRASH",
  VOLUME_SPIKE = "VOLUME_SPIKE",
  VOLUME_COLLAPSE = "VOLUME_COLLAPSE",
  SPREAD_WIDENING = "SPREAD_WIDENING",
  LIQUIDITY_WITHDRAWAL = "LIQUIDITY_WITHDRAWAL",
  ORDER_BOOK_IMBALANCE = "ORDER_BOOK_IMBALANCE",
  SPOOFING_INDICATOR = "SPOOFING_INDICATOR",
  LAYERING_INDICATOR = "LAYERING_INDICATOR",
  WASH_TRADING_INDICATOR = "WASH_TRADING_INDICATOR",
  PUMP_AND_DUMP_INDICATOR = "PUMP_AND_DUMP_INDICATOR",
  FLASH_CRASH_INDICATOR = "FLASH_CRASH_INDICATOR",
  CROSS_VENUE_DISLOCATION = "CROSS_VENUE_DISLOCATION",
  FUNDING_DISLOCATION = "FUNDING_DISLOCATION",
  OPEN_INTEREST_SHOCK = "OPEN_INTEREST_SHOCK",
  LIQUIDATION_CASCADE = "LIQUIDATION_CASCADE",
  CORRELATION_BREAKDOWN = "CORRELATION_BREAKDOWN",
  DATA_QUALITY_ANOMALY = "DATA_QUALITY_ANOMALY",
  STATISTICAL_OUTLIER = "STATISTICAL_OUTLIER",
}

export enum AnomalySeverity {
  INFORMATIONAL = "INFORMATIONAL",
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum CorrelationRegime {
  STRONGLY_NEGATIVE = "STRONGLY_NEGATIVE",
  NEGATIVE = "NEGATIVE",
  WEAKLY_NEGATIVE = "WEAKLY_NEGATIVE",
  UNCORRELATED = "UNCORRELATED",
  WEAKLY_POSITIVE = "WEAKLY_POSITIVE",
  POSITIVE = "POSITIVE",
  STRONGLY_POSITIVE = "STRONGLY_POSITIVE",
  UNSTABLE = "UNSTABLE",
}

export enum FeatureCategory {
  PRICE = "PRICE",
  RETURN = "RETURN",
  MOMENTUM = "MOMENTUM",
  TREND = "TREND",
  VOLATILITY = "VOLATILITY",
  VOLUME = "VOLUME",
  LIQUIDITY = "LIQUIDITY",
  ORDER_FLOW = "ORDER_FLOW",
  MICROSTRUCTURE = "MICROSTRUCTURE",
  DERIVATIVES = "DERIVATIVES",
  CORRELATION = "CORRELATION",
  MARKET_BREADTH = "MARKET_BREADTH",
  ANOMALY = "ANOMALY",
  TEMPORAL = "TEMPORAL",
  CROSS_VENUE = "CROSS_VENUE",
  CUSTOM = "CUSTOM",
}

export enum FeatureValueType {
  SCALAR = "SCALAR",
  VECTOR = "VECTOR",
  BOOLEAN = "BOOLEAN",
  CATEGORICAL = "CATEGORICAL",
}

export enum FeatureNormalizationMethod {
  NONE = "NONE",
  MIN_MAX = "MIN_MAX",
  Z_SCORE = "Z_SCORE",
  ROBUST_Z_SCORE = "ROBUST_Z_SCORE",
  LOG = "LOG",
  LOG_RETURN = "LOG_RETURN",
  RANK = "RANK",
  UNIT_VECTOR = "UNIT_VECTOR",
}

export enum ModelInferenceMode {
  DETERMINISTIC_RULES = "DETERMINISTIC_RULES",
  STATISTICAL = "STATISTICAL",
  MACHINE_LEARNING = "MACHINE_LEARNING",
  ENSEMBLE = "ENSEMBLE",
  HYBRID = "HYBRID",
}

export enum ConfidenceQuality {
  VERY_LOW = "VERY_LOW",
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  VERY_HIGH = "VERY_HIGH",
}

export enum IntelligenceActionability {
  NOT_ACTIONABLE = "NOT_ACTIONABLE",
  MONITOR = "MONITOR",
  RESEARCH = "RESEARCH",
  RISK_REDUCTION = "RISK_REDUCTION",
  STRATEGY_ADJUSTMENT = "STRATEGY_ADJUSTMENT",
  TRADE_CANDIDATE = "TRADE_CANDIDATE",
}

export enum IntelligencePublicationTopic {
  MARKET_INTELLIGENCE_REPORT = "MARKET_INTELLIGENCE_REPORT",
  REGIME_CHANGE = "REGIME_CHANGE",
  VOLATILITY_WARNING = "VOLATILITY_WARNING",
  LIQUIDITY_WARNING = "LIQUIDITY_WARNING",
  ORDER_FLOW_SHIFT = "ORDER_FLOW_SHIFT",
  CORRELATION_BREAKDOWN = "CORRELATION_BREAKDOWN",
  MARKET_ANOMALY = "MARKET_ANOMALY",
  PRICE_PREDICTION = "PRICE_PREDICTION",
  RISK_ALERT = "RISK_ALERT",
}

export enum ValidationSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

export enum ExplanationFactorDirection {
  SUPPORTING = "SUPPORTING",
  OPPOSING = "OPPOSING",
  NEUTRAL = "NEUTRAL",
}

export enum ExplanationAudience {
  SYSTEM = "SYSTEM",
  TRADER = "TRADER",
  RISK_MANAGER = "RISK_MANAGER",
  PORTFOLIO_MANAGER = "PORTFOLIO_MANAGER",
  AUDITOR = "AUDITOR",
}

export interface MarketIdentity {
  readonly symbol: SymbolId;
  readonly baseAsset: AssetId;
  readonly quoteAsset: AssetId;
  readonly venueId: VenueId;
  readonly venueType: MarketVenueType;
  readonly instrumentType: MarketInstrumentType;
}

export interface TimeRange {
  readonly startTimeMs: TimestampMs;
  readonly endTimeMs: TimestampMs;
}

export interface PredictionWindow {
  readonly horizon: PredictionHorizon;
  readonly durationMs: DurationMs;
  readonly startTimeMs: TimestampMs;
  readonly endTimeMs: TimestampMs;
}

export interface MarketDataProvenance {
  readonly sourceId: string;
  readonly sourceType: MarketDataSourceType;
  readonly venueId?: VenueId;
  readonly datasetVersion?: DatasetVersion;
  readonly receivedAtMs: TimestampMs;
  readonly eventTimeMs: TimestampMs;
  readonly sequenceNumber?: SequenceNumber;
  readonly checksum?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface MarketDataQualityAssessment {
  readonly quality: MarketDataQuality;
  readonly completenessScore: NormalizedScore;
  readonly freshnessScore: NormalizedScore;
  readonly consistencyScore: NormalizedScore;
  readonly orderingScore: NormalizedScore;
  readonly duplicateRate: Percentage;
  readonly missingValueRate: Percentage;
  readonly staleByMs: DurationMs;
  readonly warnings: readonly string[];
}

export interface MarketCandle {
  readonly openTimeMs: TimestampMs;
  readonly closeTimeMs: TimestampMs;
  readonly open: Price;
  readonly high: Price;
  readonly low: Price;
  readonly close: Price;
  readonly volume: Quantity;
  readonly quoteVolume?: Notional;
  readonly tradeCount?: number;
  readonly takerBuyBaseVolume?: Quantity;
  readonly takerBuyQuoteVolume?: Notional;
  readonly isClosed: boolean;
  readonly provenance: MarketDataProvenance;
}

export interface MarketTrade {
  readonly tradeId: string;
  readonly eventTimeMs: TimestampMs;
  readonly price: Price;
  readonly quantity: Quantity;
  readonly notional: Notional;
  readonly aggressorSide: "BUY" | "SELL" | "UNKNOWN";
  readonly isBlockTrade?: boolean;
  readonly provenance: MarketDataProvenance;
}

export interface OrderBookLevel {
  readonly price: Price;
  readonly quantity: Quantity;
  readonly orderCount?: number;
}

export interface OrderBookSnapshot {
  readonly eventTimeMs: TimestampMs;
  readonly sequenceNumber?: SequenceNumber;
  readonly bids: readonly OrderBookLevel[];
  readonly asks: readonly OrderBookLevel[];
  readonly bestBid?: Price;
  readonly bestAsk?: Price;
  readonly midPrice?: Price;
  readonly spread?: Price;
  readonly spreadBps?: BasisPoints;
  readonly provenance: MarketDataProvenance;
}

export interface FundingRateSnapshot {
  readonly eventTimeMs: TimestampMs;
  readonly fundingRate: Percentage;
  readonly predictedFundingRate?: Percentage;
  readonly nextFundingTimeMs?: TimestampMs;
  readonly annualizedFundingRate?: Percentage;
  readonly provenance: MarketDataProvenance;
}

export interface OpenInterestSnapshot {
  readonly eventTimeMs: TimestampMs;
  readonly openInterest: Quantity;
  readonly openInterestNotional?: Notional;
  readonly changePercentage?: Percentage;
  readonly provenance: MarketDataProvenance;
}

export interface LiquidationSnapshot {
  readonly eventTimeMs: TimestampMs;
  readonly longLiquidationQuantity: Quantity;
  readonly shortLiquidationQuantity: Quantity;
  readonly longLiquidationNotional: Notional;
  readonly shortLiquidationNotional: Notional;
  readonly provenance: MarketDataProvenance;
}

export interface MarketBreadthSnapshot {
  readonly eventTimeMs: TimestampMs;
  readonly advancingAssets: number;
  readonly decliningAssets: number;
  readonly unchangedAssets: number;
  readonly advanceDeclineRatio?: number;
  readonly aboveMovingAverageRatio?: NormalizedScore;
  readonly newHighRatio?: NormalizedScore;
  readonly newLowRatio?: NormalizedScore;
  readonly provenance: MarketDataProvenance;
}

export interface MarketIntelligenceInput {
  readonly market: MarketIdentity;
  readonly timeframe: MarketTimeframe;
  readonly analysisTimeMs: TimestampMs;
  readonly observationWindow: TimeRange;
  readonly candles: readonly MarketCandle[];
  readonly trades?: readonly MarketTrade[];
  readonly orderBooks?: readonly OrderBookSnapshot[];
  readonly fundingRates?: readonly FundingRateSnapshot[];
  readonly openInterest?: readonly OpenInterestSnapshot[];
  readonly liquidations?: readonly LiquidationSnapshot[];
  readonly marketBreadth?: readonly MarketBreadthSnapshot[];
  readonly referenceMarkets?: readonly ReferenceMarketInput[];
  readonly qualityAssessment: MarketDataQualityAssessment;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface ReferenceMarketInput {
  readonly market: MarketIdentity;
  readonly timeframe: MarketTimeframe;
  readonly candles: readonly MarketCandle[];
  readonly qualityAssessment: MarketDataQualityAssessment;
}

export interface FeatureDefinition {
  readonly featureName: string;
  readonly category: FeatureCategory;
  readonly valueType: FeatureValueType;
  readonly normalization: FeatureNormalizationMethod;
  readonly description: string;
  readonly lookbackPeriods: number;
  readonly deterministic: boolean;
  readonly requiredSources: readonly MarketDataSourceType[];
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface ScalarFeatureValue {
  readonly type: FeatureValueType.SCALAR;
  readonly value: number;
}

export interface VectorFeatureValue {
  readonly type: FeatureValueType.VECTOR;
  readonly values: readonly number[];
}

export interface BooleanFeatureValue {
  readonly type: FeatureValueType.BOOLEAN;
  readonly value: boolean;
}

export interface CategoricalFeatureValue {
  readonly type: FeatureValueType.CATEGORICAL;
  readonly value: string;
}

export type MarketFeatureValue =
  | ScalarFeatureValue
  | VectorFeatureValue
  | BooleanFeatureValue
  | CategoricalFeatureValue;

export interface MarketFeature {
  readonly definition: FeatureDefinition;
  readonly value: MarketFeatureValue;
  readonly observedAtMs: TimestampMs;
  readonly qualityScore: NormalizedScore;
  readonly isMissing: boolean;
  readonly missingReason?: string;
  readonly provenance: readonly MarketDataProvenance[];
}

export interface MarketFeatureVector {
  readonly id: MarketFeatureVectorId;
  readonly schemaVersion: AiMarketIntelligenceSchemaVersion;
  readonly market: MarketIdentity;
  readonly timeframe: MarketTimeframe;
  readonly generatedAtMs: TimestampMs;
  readonly observationWindow: TimeRange;
  readonly features: readonly MarketFeature[];
  readonly featureCount: number;
  readonly missingFeatureCount: number;
  readonly qualityScore: NormalizedScore;
  readonly deterministicFingerprint: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface RegimeProbability {
  readonly regime: MarketRegime;
  readonly probability: Probability;
}

export interface RegimeEvidence {
  readonly featureName: string;
  readonly observedValue: number | string | boolean;
  readonly contribution: number;
  readonly description: string;
}

export interface MarketRegimeIntelligence {
  readonly primaryRegime: MarketRegime;
  readonly secondaryRegime?: MarketRegime;
  readonly transitionState: RegimeTransitionState;
  readonly regimeProbabilities: readonly RegimeProbability[];
  readonly confidence: ConfidenceScore;
  readonly regimeStrength: NormalizedScore;
  readonly persistenceProbability: Probability;
  readonly transitionProbability: Probability;
  readonly expectedDurationMs?: DurationMs;
  readonly detectedAtMs: TimestampMs;
  readonly evidence: readonly RegimeEvidence[];
  readonly modelVersion: ModelVersion;
}

export interface ForecastInterval {
  readonly lowerBound: number;
  readonly expectedValue: number;
  readonly upperBound: number;
  readonly confidenceLevel: Probability;
}

export interface VolatilityForecast {
  readonly predictionId: MarketPredictionId;
  readonly window: PredictionWindow;
  readonly currentState: VolatilityState;
  readonly forecastState: VolatilityState;
  readonly currentRealizedVolatility: Percentage;
  readonly forecastRealizedVolatility: Percentage;
  readonly annualizedForecastVolatility?: Percentage;
  readonly changePercentage: Percentage;
  readonly expansionProbability: Probability;
  readonly contractionProbability: Probability;
  readonly interval: ForecastInterval;
  readonly confidence: ConfidenceScore;
  readonly drivers: readonly ForecastDriver[];
  readonly modelVersion: ModelVersion;
  readonly generatedAtMs: TimestampMs;
}

export interface LiquidityPrediction {
  readonly predictionId: MarketPredictionId;
  readonly window: PredictionWindow;
  readonly currentState: LiquidityState;
  readonly predictedState: LiquidityState;
  readonly predictedBidDepth: Notional;
  readonly predictedAskDepth: Notional;
  readonly predictedSpreadBps: BasisPoints;
  readonly predictedMarketImpactBps: BasisPoints;
  readonly predictedFillProbability: Probability;
  readonly deteriorationProbability: Probability;
  readonly improvementProbability: Probability;
  readonly confidence: ConfidenceScore;
  readonly drivers: readonly ForecastDriver[];
  readonly modelVersion: ModelVersion;
  readonly generatedAtMs: TimestampMs;
}

export interface ForecastDriver {
  readonly name: string;
  readonly direction: ExplanationFactorDirection;
  readonly contribution: number;
  readonly observedValue?: number | string | boolean;
  readonly description: string;
}

export interface OrderFlowMetric {
  readonly name: string;
  readonly value: number;
  readonly normalizedValue: number;
  readonly interpretation: string;
}

export interface OrderFlowIntelligence {
  readonly bias: OrderFlowBias;
  readonly participantActivity: ParticipantActivity;
  readonly buyPressure: NormalizedScore;
  readonly sellPressure: NormalizedScore;
  readonly aggressiveBuyRatio: NormalizedScore;
  readonly aggressiveSellRatio: NormalizedScore;
  readonly bidAskImbalance: number;
  readonly cumulativeVolumeDelta: number;
  readonly absorptionScore: NormalizedScore;
  readonly exhaustionScore: NormalizedScore;
  readonly institutionalFootprintScore: NormalizedScore;
  readonly reversalProbability: Probability;
  readonly continuationProbability: Probability;
  readonly confidence: ConfidenceScore;
  readonly metrics: readonly OrderFlowMetric[];
  readonly generatedAtMs: TimestampMs;
  readonly modelVersion: ModelVersion;
}

export interface CorrelationPair {
  readonly leftSymbol: SymbolId;
  readonly rightSymbol: SymbolId;
  readonly coefficient: CorrelationCoefficient;
  readonly rollingCoefficient?: CorrelationCoefficient;
  readonly regime: CorrelationRegime;
  readonly stabilityScore: NormalizedScore;
  readonly significanceScore: NormalizedScore;
  readonly sampleSize: number;
}

export interface CorrelationCluster {
  readonly clusterId: string;
  readonly symbols: readonly SymbolId[];
  readonly averageInternalCorrelation: CorrelationCoefficient;
  readonly systemicImportanceScore: NormalizedScore;
  readonly description?: string;
}

export interface CorrelationBreakdown {
  readonly leftSymbol: SymbolId;
  readonly rightSymbol: SymbolId;
  readonly historicalCorrelation: CorrelationCoefficient;
  readonly currentCorrelation: CorrelationCoefficient;
  readonly deviation: number;
  readonly severity: AnomalySeverity;
  readonly detectedAtMs: TimestampMs;
}

export interface MarketCorrelationIntelligence {
  readonly matrixId: CorrelationMatrixId;
  readonly generatedAtMs: TimestampMs;
  readonly window: TimeRange;
  readonly pairs: readonly CorrelationPair[];
  readonly clusters: readonly CorrelationCluster[];
  readonly breakdowns: readonly CorrelationBreakdown[];
  readonly averageMarketCorrelation: CorrelationCoefficient;
  readonly concentrationScore: NormalizedScore;
  readonly diversificationScore: NormalizedScore;
  readonly systemicRiskScore: NormalizedScore;
  readonly confidence: ConfidenceScore;
  readonly modelVersion: ModelVersion;
}

export interface AnomalyEvidence {
  readonly metric: string;
  readonly observedValue: number | string | boolean;
  readonly expectedValue?: number | string | boolean;
  readonly deviationScore?: number;
  readonly description: string;
}

export interface MarketAnomaly {
  readonly id: MarketAnomalyId;
  readonly type: AnomalyType;
  readonly severity: AnomalySeverity;
  readonly detectedAtMs: TimestampMs;
  readonly startedAtMs?: TimestampMs;
  readonly endedAtMs?: TimestampMs;
  readonly active: boolean;
  readonly probability: Probability;
  readonly confidence: ConfidenceScore;
  readonly affectedMarkets: readonly MarketIdentity[];
  readonly evidence: readonly AnomalyEvidence[];
  readonly recommendedAction: IntelligenceActionability;
  readonly summary: string;
  readonly modelVersion: ModelVersion;
}

export interface DirectionProbabilityDistribution {
  readonly bearish: Probability;
  readonly neutral: Probability;
  readonly bullish: Probability;
}

export interface PriceTarget {
  readonly expectedPrice: Price;
  readonly lowerPrice: Price;
  readonly upperPrice: Price;
  readonly expectedReturnPercentage: Percentage;
  readonly lowerReturnPercentage: Percentage;
  readonly upperReturnPercentage: Percentage;
}

export interface PriceMovementPrediction {
  readonly predictionId: MarketPredictionId;
  readonly market: MarketIdentity;
  readonly window: PredictionWindow;
  readonly direction: MarketDirection;
  readonly directionProbabilities: DirectionProbabilityDistribution;
  readonly target: PriceTarget;
  readonly expectedMagnitudePercentage: Percentage;
  readonly continuationProbability: Probability;
  readonly reversalProbability: Probability;
  readonly invalidationPrice?: Price;
  readonly confidence: ConfidenceScore;
  readonly actionability: IntelligenceActionability;
  readonly drivers: readonly ForecastDriver[];
  readonly modelVersion: ModelVersion;
  readonly generatedAtMs: TimestampMs;
}

export interface ConfidenceComponent {
  readonly componentName: string;
  readonly rawConfidence: ConfidenceScore;
  readonly effectiveWeight: NormalizedScore;
  readonly qualityAdjustment: number;
  readonly agreementAdjustment: number;
  readonly finalContribution: number;
  readonly excluded: boolean;
  readonly exclusionReason?: string;
}

export interface PredictionAgreement {
  readonly agreementScore: NormalizedScore;
  readonly conflictingComponents: readonly string[];
  readonly supportingComponents: readonly string[];
  readonly conflictDescription?: string;
}

export interface UnifiedPredictionConfidence {
  readonly confidence: ConfidenceScore;
  readonly quality: ConfidenceQuality;
  readonly dataQualityAdjustment: number;
  readonly regimeStabilityAdjustment: number;
  readonly anomalyAdjustment: number;
  readonly agreement: PredictionAgreement;
  readonly components: readonly ConfidenceComponent[];
  readonly calibrationScore: NormalizedScore;
  readonly generatedAtMs: TimestampMs;
}

export interface ExplanationFactor {
  readonly rank: number;
  readonly name: string;
  readonly category: FeatureCategory;
  readonly direction: ExplanationFactorDirection;
  readonly importance: NormalizedScore;
  readonly observedValue?: number | string | boolean;
  readonly baselineValue?: number | string | boolean;
  readonly contribution: number;
  readonly explanation: string;
}

export interface CounterfactualExplanation {
  readonly changedFactor: string;
  readonly originalValue: number | string | boolean;
  readonly counterfactualValue: number | string | boolean;
  readonly expectedOutcomeChange: string;
}

export interface MarketIntelligenceExplanation {
  readonly id: ExplainabilityRecordId;
  readonly audience: ExplanationAudience;
  readonly headline: string;
  readonly summary: string;
  readonly primaryFactors: readonly ExplanationFactor[];
  readonly opposingFactors: readonly ExplanationFactor[];
  readonly uncertaintyFactors: readonly ExplanationFactor[];
  readonly counterfactuals: readonly CounterfactualExplanation[];
  readonly limitations: readonly string[];
  readonly generatedAtMs: TimestampMs;
  readonly modelVersion: ModelVersion;
}

export interface MarketRiskSignal {
  readonly name: string;
  readonly severity: AnomalySeverity;
  readonly probability: Probability;
  readonly confidence: ConfidenceScore;
  readonly description: string;
  readonly recommendedAction: IntelligenceActionability;
}

export interface MarketIntelligenceSummary {
  readonly direction: MarketDirection;
  readonly regime: MarketRegime;
  readonly volatilityState: VolatilityState;
  readonly liquidityState: LiquidityState;
  readonly orderFlowBias: OrderFlowBias;
  readonly overallConfidence: ConfidenceScore;
  readonly actionability: IntelligenceActionability;
  readonly riskLevel: AnomalySeverity;
  readonly headline: string;
}

export interface MarketIntelligenceReport {
  readonly id: MarketIntelligenceReportId;
  readonly requestId: MarketIntelligenceRequestId;
  readonly runId: MarketIntelligenceRunId;
  readonly schemaVersion: AiMarketIntelligenceSchemaVersion;
  readonly generatedAtMs: TimestampMs;
  readonly market: MarketIdentity;
  readonly timeframe: MarketTimeframe;
  readonly observationWindow: TimeRange;
  readonly predictionWindows: readonly PredictionWindow[];
  readonly featureVector: MarketFeatureVector;
  readonly regime: MarketRegimeIntelligence;
  readonly volatilityForecasts: readonly VolatilityForecast[];
  readonly liquidityPredictions: readonly LiquidityPrediction[];
  readonly orderFlow: OrderFlowIntelligence;
  readonly correlations: MarketCorrelationIntelligence;
  readonly anomalies: readonly MarketAnomaly[];
  readonly pricePredictions: readonly PriceMovementPrediction[];
  readonly confidence: UnifiedPredictionConfidence;
  readonly explanation: MarketIntelligenceExplanation;
  readonly riskSignals: readonly MarketRiskSignal[];
  readonly summary: MarketIntelligenceSummary;
  readonly dataQuality: MarketDataQualityAssessment;
  readonly warnings: readonly string[];
  readonly deterministicFingerprint: string;
  readonly modelVersions: Readonly<Record<string, ModelVersion>>;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly severity: ValidationSeverity;
  readonly message: string;
  readonly actualValue?: JsonValue;
  readonly expected?: string;
}

export interface ValidationResult<TValue> {
  readonly valid: boolean;
  readonly value?: TValue;
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface StageTiming {
  readonly stage: MarketIntelligencePipelineStage;
  readonly startedAtMs: TimestampMs;
  readonly completedAtMs: TimestampMs;
  readonly durationMs: DurationMs;
}

export interface StageExecutionResult<TValue> {
  readonly stage: MarketIntelligencePipelineStage;
  readonly success: boolean;
  readonly output?: TValue;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly timing: StageTiming;
  readonly deterministicFingerprint?: string;
}

export interface MarketIntelligenceRunTrace {
  readonly runId: MarketIntelligenceRunId;
  readonly requestId: MarketIntelligenceRequestId;
  readonly status: MarketIntelligenceRunStatus;
  readonly createdAtMs: TimestampMs;
  readonly startedAtMs?: TimestampMs;
  readonly completedAtMs?: TimestampMs;
  readonly stageTimings: readonly StageTiming[];
  readonly completedStages: readonly MarketIntelligencePipelineStage[];
  readonly failedStage?: MarketIntelligencePipelineStage;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly deterministicFingerprint?: string;
}

export interface FeatureExtractionConfiguration {
  readonly enabledCategories: readonly FeatureCategory[];
  readonly definitions: readonly FeatureDefinition[];
  readonly rejectMissingRequiredFeatures: boolean;
  readonly maximumMissingFeatureRatio: Percentage;
  readonly minimumFeatureQuality: NormalizedScore;
  readonly includeRawFeatures: boolean;
}

export interface RegimeIntelligenceConfiguration {
  readonly inferenceMode: ModelInferenceMode;
  readonly minimumConfidence: ConfidenceScore;
  readonly transitionThreshold: Probability;
  readonly persistenceThreshold: Probability;
  readonly minimumRegimeDurationMs: DurationMs;
  readonly enabledRegimes: readonly MarketRegime[];
  readonly modelVersion: ModelVersion;
}

export interface VolatilityForecastConfiguration {
  readonly enabled: boolean;
  readonly horizons: readonly PredictionWindow[];
  readonly confidenceLevel: Probability;
  readonly minimumConfidence: ConfidenceScore;
  readonly annualizeResults: boolean;
  readonly modelVersion: ModelVersion;
}

export interface LiquidityPredictionConfiguration {
  readonly enabled: boolean;
  readonly horizons: readonly PredictionWindow[];
  readonly targetNotional: Notional;
  readonly depthLevels: number;
  readonly minimumFillProbability: Probability;
  readonly maximumAcceptableSpreadBps: BasisPoints;
  readonly maximumAcceptableImpactBps: BasisPoints;
  readonly modelVersion: ModelVersion;
}

export interface OrderFlowConfiguration {
  readonly enabled: boolean;
  readonly tradeLookbackCount: number;
  readonly orderBookDepthLevels: number;
  readonly blockTradeNotionalThreshold: Notional;
  readonly institutionalFootprintThreshold: NormalizedScore;
  readonly reversalProbabilityThreshold: Probability;
  readonly modelVersion: ModelVersion;
}

export interface CorrelationIntelligenceConfiguration {
  readonly enabled: boolean;
  readonly minimumObservations: number;
  readonly rollingWindowSize: number;
  readonly breakdownDeviationThreshold: number;
  readonly clusterThreshold: CorrelationCoefficient;
  readonly significanceThreshold: NormalizedScore;
  readonly modelVersion: ModelVersion;
}

export interface AnomalyDetectionThreshold {
  readonly type: AnomalyType;
  readonly enabled: boolean;
  readonly warningThreshold: number;
  readonly criticalThreshold: number;
  readonly minimumProbability: Probability;
  readonly minimumConfidence: ConfidenceScore;
}

export interface AnomalyDetectionConfiguration {
  readonly enabled: boolean;
  readonly thresholds: readonly AnomalyDetectionThreshold[];
  readonly retainResolvedAnomalies: boolean;
  readonly maximumActiveAnomalies: number;
  readonly modelVersion: ModelVersion;
}

export interface PricePredictionConfiguration {
  readonly enabled: boolean;
  readonly horizons: readonly PredictionWindow[];
  readonly minimumConfidence: ConfidenceScore;
  readonly neutralReturnBandPercentage: Percentage;
  readonly strongDirectionThreshold: Probability;
  readonly includePriceTargets: boolean;
  readonly includeInvalidationPrice: boolean;
  readonly modelVersion: ModelVersion;
}

export interface ConfidenceAggregationConfiguration {
  readonly componentWeights: Readonly<Record<string, NormalizedScore>>;
  readonly minimumDataQuality: NormalizedScore;
  readonly disagreementPenalty: number;
  readonly anomalyPenalty: number;
  readonly regimeInstabilityPenalty: number;
  readonly minimumPublishableConfidence: ConfidenceScore;
  readonly calibrationVersion: ModelVersion;
}

export interface ExplainabilityConfiguration {
  readonly enabled: boolean;
  readonly audience: ExplanationAudience;
  readonly maximumPrimaryFactors: number;
  readonly maximumOpposingFactors: number;
  readonly maximumCounterfactuals: number;
  readonly includeLimitations: boolean;
  readonly modelVersion: ModelVersion;
}

export interface PublicationConfiguration {
  readonly enabled: boolean;
  readonly topics: readonly IntelligencePublicationTopic[];
  readonly publishOnlyActionableReports: boolean;
  readonly minimumConfidence: ConfidenceScore;
  readonly publishWarnings: boolean;
}

export interface AiMarketIntelligenceConfiguration {
  readonly schemaVersion: AiMarketIntelligenceSchemaVersion;
  readonly featureExtraction: FeatureExtractionConfiguration;
  readonly regimeIntelligence: RegimeIntelligenceConfiguration;
  readonly volatilityForecasting: VolatilityForecastConfiguration;
  readonly liquidityPrediction: LiquidityPredictionConfiguration;
  readonly orderFlow: OrderFlowConfiguration;
  readonly correlationIntelligence: CorrelationIntelligenceConfiguration;
  readonly anomalyDetection: AnomalyDetectionConfiguration;
  readonly pricePrediction: PricePredictionConfiguration;
  readonly confidenceAggregation: ConfidenceAggregationConfiguration;
  readonly explainability: ExplainabilityConfiguration;
  readonly publication: PublicationConfiguration;
  readonly failFast: boolean;
  readonly requireDeterministicFingerprint: boolean;
  readonly maximumInputAgeMs: DurationMs;
  readonly maximumPipelineDurationMs: DurationMs;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface MarketIntelligenceRequest {
  readonly requestId: MarketIntelligenceRequestId;
  readonly requestedAtMs: TimestampMs;
  readonly input: MarketIntelligenceInput;
  readonly predictionWindows: NonEmptyReadonlyArray<PredictionWindow>;
  readonly configuration: AiMarketIntelligenceConfiguration;
  readonly correlationUniverse?: readonly ReferenceMarketInput[];
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface MarketIntelligenceResponse {
  readonly requestId: MarketIntelligenceRequestId;
  readonly runId: MarketIntelligenceRunId;
  readonly status: MarketIntelligenceRunStatus;
  readonly report?: MarketIntelligenceReport;
  readonly trace: MarketIntelligenceRunTrace;
  readonly validation: ValidationResult<MarketIntelligenceRequest>;
}

export interface MarketIntelligencePublication {
  readonly publicationId: string;
  readonly topic: IntelligencePublicationTopic;
  readonly publishedAtMs: TimestampMs;
  readonly reportId: MarketIntelligenceReportId;
  readonly runId: MarketIntelligenceRunId;
  readonly market: MarketIdentity;
  readonly confidence: ConfidenceScore;
  readonly actionability: IntelligenceActionability;
  readonly payload: JsonValue;
  readonly deterministicFingerprint: string;
}

export interface DeterministicClock {
  now(): TimestampMs;
}

export interface DeterministicIdGenerator {
  generate(prefix: string, seed: string): string;
}

export interface DeterministicFingerprintGenerator {
  fingerprint(value: JsonValue): string;
}

export interface AiMarketIntelligenceValidator {
  validateRequest(
    request: MarketIntelligenceRequest,
  ): ValidationResult<MarketIntelligenceRequest>;

  validateConfiguration(
    configuration: AiMarketIntelligenceConfiguration,
  ): ValidationResult<AiMarketIntelligenceConfiguration>;

  validateInput(
    input: MarketIntelligenceInput,
  ): ValidationResult<MarketIntelligenceInput>;

  validateFeatureVector(
    featureVector: MarketFeatureVector,
  ): ValidationResult<MarketFeatureVector>;

  validateReport(
    report: MarketIntelligenceReport,
  ): ValidationResult<MarketIntelligenceReport>;
}

export interface MarketFeatureExtractor {
  extract(
    input: MarketIntelligenceInput,
    configuration: FeatureExtractionConfiguration,
  ): MarketFeatureVector;
}

export interface MarketRegimeIntelligenceEngine {
  analyze(
    featureVector: MarketFeatureVector,
    configuration: RegimeIntelligenceConfiguration,
  ): MarketRegimeIntelligence;
}

export interface VolatilityForecastEngine {
  forecast(
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    configuration: VolatilityForecastConfiguration,
  ): readonly VolatilityForecast[];
}

export interface LiquidityPredictionEngine {
  predict(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    configuration: LiquidityPredictionConfiguration,
  ): readonly LiquidityPrediction[];
}

export interface OrderFlowIntelligenceEngine {
  analyze(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    configuration: OrderFlowConfiguration,
  ): OrderFlowIntelligence;
}

export interface MarketCorrelationIntelligenceEngine {
  analyze(
    primary: MarketIntelligenceInput,
    universe: readonly ReferenceMarketInput[],
    configuration: CorrelationIntelligenceConfiguration,
  ): MarketCorrelationIntelligence;
}

export interface MarketAnomalyDetectionEngine {
  detect(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    configuration: AnomalyDetectionConfiguration,
  ): readonly MarketAnomaly[];
}

export interface PriceMovementPredictionEngine {
  predict(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    anomalies: readonly MarketAnomaly[],
    configuration: PricePredictionConfiguration,
  ): readonly PriceMovementPrediction[];
}

export interface PredictionConfidenceEngine {
  aggregate(
    input: MarketIntelligenceInput,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    anomalies: readonly MarketAnomaly[],
    pricePredictions: readonly PriceMovementPrediction[],
    configuration: ConfidenceAggregationConfiguration,
  ): UnifiedPredictionConfidence;
}

export interface MarketIntelligenceExplainabilityEngine {
  explain(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    anomalies: readonly MarketAnomaly[],
    pricePredictions: readonly PriceMovementPrediction[],
    confidence: UnifiedPredictionConfidence,
    configuration: ExplainabilityConfiguration,
  ): MarketIntelligenceExplanation;
}

export interface MarketIntelligencePublisher {
  publish(
    publication: MarketIntelligencePublication,
  ): void | Promise<void>;
}

export interface MarketIntelligenceStageObserver {
  onStageStarted?(
    runId: MarketIntelligenceRunId,
    stage: MarketIntelligencePipelineStage,
    startedAtMs: TimestampMs,
  ): void | Promise<void>;

  onStageCompleted?<TValue>(
    runId: MarketIntelligenceRunId,
    result: StageExecutionResult<TValue>,
  ): void | Promise<void>;

  onStageFailed?(
    runId: MarketIntelligenceRunId,
    stage: MarketIntelligencePipelineStage,
    error: Error,
    failedAtMs: TimestampMs,
  ): void | Promise<void>;
}

export interface AiMarketIntelligenceOrchestratorDependencies {
  readonly validator: AiMarketIntelligenceValidator;
  readonly featureExtractor: MarketFeatureExtractor;
  readonly regimeEngine: MarketRegimeIntelligenceEngine;
  readonly volatilityEngine: VolatilityForecastEngine;
  readonly liquidityEngine: LiquidityPredictionEngine;
  readonly orderFlowEngine: OrderFlowIntelligenceEngine;
  readonly correlationEngine: MarketCorrelationIntelligenceEngine;
  readonly anomalyEngine: MarketAnomalyDetectionEngine;
  readonly pricePredictionEngine: PriceMovementPredictionEngine;
  readonly confidenceEngine: PredictionConfidenceEngine;
  readonly explainabilityEngine: MarketIntelligenceExplainabilityEngine;
  readonly publisher?: MarketIntelligencePublisher;
  readonly stageObserver?: MarketIntelligenceStageObserver;
  readonly clock: DeterministicClock;
  readonly idGenerator: DeterministicIdGenerator;
  readonly fingerprintGenerator: DeterministicFingerprintGenerator;
}

export interface AiMarketIntelligenceOrchestrator {
  analyze(
    request: MarketIntelligenceRequest,
  ): Promise<MarketIntelligenceResponse>;
}

export interface MarketIntelligenceErrorContext {
  readonly requestId?: MarketIntelligenceRequestId;
  readonly runId?: MarketIntelligenceRunId;
  readonly stage?: MarketIntelligencePipelineStage;
  readonly path?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
}

export class MarketIntelligenceError extends Error {
  public readonly code: string;
  public readonly context: MarketIntelligenceErrorContext;

  public constructor(
    code: string,
    message: string,
    context: MarketIntelligenceErrorContext = {},
  ) {
    super(message);
    this.name = "MarketIntelligenceError";
    this.code = code;
    this.context = Object.freeze({ ...context });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MarketIntelligenceValidationError extends MarketIntelligenceError {
  public readonly issues: readonly ValidationIssue[];

  public constructor(
    message: string,
    issues: readonly ValidationIssue[],
    context: MarketIntelligenceErrorContext = {},
  ) {
    super("AI_MARKET_INTELLIGENCE_VALIDATION_FAILED", message, context);
    this.name = "MarketIntelligenceValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class MarketIntelligenceStageError extends MarketIntelligenceError {
  public readonly stage: MarketIntelligencePipelineStage;
  public readonly cause?: Error;

  public constructor(
    stage: MarketIntelligencePipelineStage,
    message: string,
    cause?: Error,
    context: MarketIntelligenceErrorContext = {},
  ) {
    super(
      "AI_MARKET_INTELLIGENCE_STAGE_FAILED",
      message,
      Object.freeze({ ...context, stage }),
    );
    this.name = "MarketIntelligenceStageError";
    this.stage = stage;
    this.cause = cause;
  }
}

export const DEFAULT_COMPONENT_CONFIDENCE_WEIGHTS = Object.freeze({
  regime: 0.18 as NormalizedScore,
  volatility: 0.14 as NormalizedScore,
  liquidity: 0.12 as NormalizedScore,
  orderFlow: 0.16 as NormalizedScore,
  correlation: 0.10 as NormalizedScore,
  anomaly: 0.10 as NormalizedScore,
  pricePrediction: 0.20 as NormalizedScore,
}) satisfies Readonly<Record<string, NormalizedScore>>;

export const MARKET_INTELLIGENCE_PIPELINE_ORDER =
  Object.freeze<readonly MarketIntelligencePipelineStage[]>([
    MarketIntelligencePipelineStage.VALIDATION,
    MarketIntelligencePipelineStage.FEATURE_EXTRACTION,
    MarketIntelligencePipelineStage.REGIME_INTELLIGENCE,
    MarketIntelligencePipelineStage.VOLATILITY_FORECASTING,
    MarketIntelligencePipelineStage.LIQUIDITY_PREDICTION,
    MarketIntelligencePipelineStage.ORDER_FLOW_INTELLIGENCE,
    MarketIntelligencePipelineStage.CORRELATION_INTELLIGENCE,
    MarketIntelligencePipelineStage.ANOMALY_DETECTION,
    MarketIntelligencePipelineStage.PRICE_MOVEMENT_PREDICTION,
    MarketIntelligencePipelineStage.CONFIDENCE_AGGREGATION,
    MarketIntelligencePipelineStage.EXPLAINABILITY,
    MarketIntelligencePipelineStage.REPORT_ASSEMBLY,
    MarketIntelligencePipelineStage.PUBLICATION,
  ]);

export function isTerminalMarketIntelligenceStatus(
  status: MarketIntelligenceRunStatus,
): boolean {
  return (
    status === MarketIntelligenceRunStatus.COMPLETED ||
    status === MarketIntelligenceRunStatus.COMPLETED_WITH_WARNINGS ||
    status === MarketIntelligenceRunStatus.REJECTED ||
    status === MarketIntelligenceRunStatus.FAILED ||
    status === MarketIntelligenceRunStatus.CANCELLED
  );
}

export function isNormalizedNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isProbability(value: number): value is Probability {
  return isNormalizedNumber(value);
}

export function isConfidenceScore(value: number): value is ConfidenceScore {
  return isNormalizedNumber(value);
}

export function isCorrelationCoefficient(
  value: number,
): value is CorrelationCoefficient {
  return Number.isFinite(value) && value >= -1 && value <= 1;
}

export function confidenceQualityFromScore(
  confidence: number,
): ConfidenceQuality {
  if (confidence < 0.2) {
    return ConfidenceQuality.VERY_LOW;
  }

  if (confidence < 0.4) {
    return ConfidenceQuality.LOW;
  }

  if (confidence < 0.6) {
    return ConfidenceQuality.MODERATE;
  }

  if (confidence < 0.8) {
    return ConfidenceQuality.HIGH;
  }

  return ConfidenceQuality.VERY_HIGH;
}