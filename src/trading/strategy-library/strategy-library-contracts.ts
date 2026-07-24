/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-contracts.ts
 *
 * Purpose:
 * Defines the immutable contracts used to classify, discover, document,
 * validate, compare, and distribute production trading strategies.
 *
 * This module intentionally does not replace the professional strategy
 * framework. Strategy execution, lifecycle management, registration,
 * backtesting, AI integration, and runtime behavior remain owned by
 * src/trading/strategy-framework.
 */

import type {
  StrategyCapability,
  StrategyDeterminismMode,
  StrategyEnvironment,
  StrategyId,
  StrategyManifest,
  StrategyMarketType,
  StrategyMetadata,
  StrategyTradingMode,
  StrategyVersion,
  UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

/* ============================================================================
 * Schema identity
 * ============================================================================
 */

export const STRATEGY_LIBRARY_SCHEMA_VERSION = "1.0.0" as const;

export type StrategyLibrarySchemaVersion =
  typeof STRATEGY_LIBRARY_SCHEMA_VERSION;

/* ============================================================================
 * Primitive aliases
 * ============================================================================
 */

export type StrategyLibraryEntryId = string;

export type StrategyLibraryCollectionId = string;

export type StrategyLibraryReleaseId = string;

export type StrategyLibraryProviderId = string;

export type StrategyLibraryDocumentationId = string;

export type StrategyLibraryRiskProfileId = string;

export type StrategyLibraryCompatibilityProfileId = string;

export type StrategyLibraryTag = string;

/* ============================================================================
 * Strategy classification
 * ============================================================================
 */

export type StrategyLibraryFamily =
  | "TREND_FOLLOWING"
  | "MOMENTUM"
  | "MEAN_REVERSION"
  | "BREAKOUT"
  | "VOLATILITY"
  | "VOLUME"
  | "SWING"
  | "SCALPING"
  | "GRID"
  | "DOLLAR_COST_AVERAGING"
  | "MARKET_MAKING"
  | "ARBITRAGE"
  | "PAIR_TRADING"
  | "STATISTICAL_ARBITRAGE"
  | "PORTFOLIO_ROTATION"
  | "MULTI_STRATEGY"
  | "AI_DRIVEN"
  | "HYBRID"
  | "OTHER";

export type StrategyLibraryComplexity =
  | "BEGINNER"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "INSTITUTIONAL";

export type StrategyLibraryHoldingPeriod =
  | "ULTRA_SHORT_TERM"
  | "INTRADAY"
  | "SWING"
  | "POSITION"
  | "LONG_TERM"
  | "VARIABLE";

export type StrategyLibraryFrequency =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH"
  | "EVENT_DRIVEN";

export type StrategyLibraryDirectionality =
  | "LONG_ONLY"
  | "SHORT_ONLY"
  | "LONG_SHORT"
  | "MARKET_NEUTRAL"
  | "DYNAMIC";

export type StrategyLibraryCapitalStyle =
  | "SINGLE_POSITION"
  | "MULTI_POSITION"
  | "LADDERED"
  | "PERIODIC_ALLOCATION"
  | "PORTFOLIO_WEIGHTED"
  | "INVENTORY_BASED"
  | "DYNAMIC";

export type StrategyLibraryIntelligenceType =
  | "DETERMINISTIC"
  | "RULE_BASED"
  | "STATISTICAL"
  | "MACHINE_LEARNING"
  | "REINFORCEMENT_LEARNING"
  | "MULTI_AGENT"
  | "HYBRID";

export type StrategyLibraryOperationalStatus =
  | "DRAFT"
  | "EXPERIMENTAL"
  | "BACKTEST_READY"
  | "PAPER_READY"
  | "LIVE_READY"
  | "DEPRECATED"
  | "RETIRED";

export type StrategyLibraryVerificationStatus =
  | "UNVERIFIED"
  | "VALIDATED"
  | "BACKTESTED"
  | "PAPER_VERIFIED"
  | "LIVE_VERIFIED"
  | "CERTIFIED";

export type StrategyLibraryAvailability =
  | "INTERNAL"
  | "PRIVATE"
  | "PUBLIC"
  | "MARKETPLACE"
  | "ENTERPRISE";

/* ============================================================================
 * Market conditions and regimes
 * ============================================================================
 */

export type StrategyLibraryMarketRegime =
  | "STRONG_UPTREND"
  | "UPTREND"
  | "WEAK_UPTREND"
  | "RANGE_BOUND"
  | "WEAK_DOWNTREND"
  | "DOWNTREND"
  | "STRONG_DOWNTREND"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "VOLATILITY_EXPANSION"
  | "VOLATILITY_CONTRACTION"
  | "HIGH_LIQUIDITY"
  | "LOW_LIQUIDITY"
  | "RISK_ON"
  | "RISK_OFF"
  | "UNKNOWN";

export type StrategyLibraryRegimeCompatibility =
  | "PREFERRED"
  | "SUPPORTED"
  | "NEUTRAL"
  | "DISCOURAGED"
  | "UNSUPPORTED";

export interface StrategyLibraryRegimeProfile {
  readonly regime: StrategyLibraryMarketRegime;
  readonly compatibility: StrategyLibraryRegimeCompatibility;
  readonly score: number;
  readonly rationale: string;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Risk classification
 * ============================================================================
 */

export type StrategyLibraryRiskLevel =
  | "VERY_LOW"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH";

export type StrategyLibraryRiskDimension =
  | "MARKET"
  | "VOLATILITY"
  | "LIQUIDITY"
  | "LEVERAGE"
  | "CONCENTRATION"
  | "GAP"
  | "EXECUTION"
  | "MODEL"
  | "OPERATIONAL"
  | "COUNTERPARTY"
  | "SMART_CONTRACT"
  | "INVENTORY";

export interface StrategyLibraryRiskDimensionAssessment {
  readonly dimension: StrategyLibraryRiskDimension;
  readonly level: StrategyLibraryRiskLevel;
  readonly score: number;
  readonly explanation: string;
  readonly mitigations: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryRiskProfile {
  readonly riskProfileId: StrategyLibraryRiskProfileId;
  readonly overallRiskLevel: StrategyLibraryRiskLevel;
  readonly overallRiskScore: number;
  readonly maximumRecommendedLeverage: number;
  readonly maximumRecommendedCapitalFraction: number;
  readonly requiresStopLoss: boolean;
  readonly supportsTrailingStop: boolean;
  readonly supportsPositionScaling: boolean;
  readonly supportsPartialExit: boolean;
  readonly dimensions: readonly StrategyLibraryRiskDimensionAssessment[];
  readonly warnings: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Data and indicator requirements
 * ============================================================================
 */

export type StrategyLibraryDataRequirementType =
  | "CANDLES"
  | "TRADES"
  | "TICKER"
  | "ORDER_BOOK"
  | "FUNDING_RATE"
  | "OPEN_INTEREST"
  | "LIQUIDATIONS"
  | "MARK_INDEX_PRICE"
  | "ON_CHAIN"
  | "SENTIMENT"
  | "NEWS"
  | "EXTERNAL_FEATURES";

export interface StrategyLibraryDataRequirement {
  readonly type: StrategyLibraryDataRequirementType;
  readonly required: boolean;
  readonly minimumHistory: number;
  readonly maximumAgeMilliseconds?: number;
  readonly minimumUpdateFrequencyMilliseconds?: number;
  readonly description: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryIndicatorRequirement {
  readonly indicatorId: string;
  readonly displayName: string;
  readonly required: boolean;
  readonly minimumHistory: number;
  readonly parameterNames: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Compatibility
 * ============================================================================
 */

export interface StrategyLibraryTimeframeCompatibility {
  readonly timeframe: string;
  readonly supported: boolean;
  readonly preferred: boolean;
  readonly minimumHistory: number;
  readonly explanation?: string;
}

export interface StrategyLibraryCompatibilityProfile {
  readonly compatibilityProfileId: StrategyLibraryCompatibilityProfileId;
  readonly marketTypes: readonly StrategyMarketType[];
  readonly tradingModes: readonly StrategyTradingMode[];
  readonly environments: readonly StrategyEnvironment[];
  readonly timeframes: readonly StrategyLibraryTimeframeCompatibility[];
  readonly minimumCapital?: number;
  readonly maximumCapital?: number;
  readonly supportsFractionalQuantity: boolean;
  readonly supportsLeverage: boolean;
  readonly supportsHedgeMode: boolean;
  readonly supportsOneWayMode: boolean;
  readonly requiresShortSelling: boolean;
  readonly requiredCapabilities: readonly StrategyCapability[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Operational characteristics
 * ============================================================================
 */

export interface StrategyLibraryOperationalProfile {
  readonly holdingPeriod: StrategyLibraryHoldingPeriod;
  readonly frequency: StrategyLibraryFrequency;
  readonly directionality: StrategyLibraryDirectionality;
  readonly capitalStyle: StrategyLibraryCapitalStyle;
  readonly intelligenceType: StrategyLibraryIntelligenceType;
  readonly determinismMode: StrategyDeterminismMode;
  readonly expectedMinimumSignalsPerDay?: number;
  readonly expectedMaximumSignalsPerDay?: number;
  readonly requiresContinuousOperation: boolean;
  readonly requiresPersistentState: boolean;
  readonly supportsWarmStart: boolean;
  readonly supportsDeterministicReplay: boolean;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Documentation and explainability
 * ============================================================================
 */

export interface StrategyLibraryDocumentationReference {
  readonly documentationId: StrategyLibraryDocumentationId;
  readonly title: string;
  readonly description: string;
  readonly uri?: string;
  readonly contentType:
    | "OVERVIEW"
    | "PARAMETERS"
    | "RISK"
    | "BACKTESTING"
    | "LIVE_TRADING"
    | "EXAMPLE"
    | "RESEARCH"
    | "CHANGELOG";
  readonly required: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryExplanationTemplate {
  readonly templateId: string;
  readonly title: string;
  readonly summary: string;
  readonly signalExplanationTemplate: string;
  readonly holdExplanationTemplate: string;
  readonly riskExplanationTemplate: string;
  readonly parameterExplanationTemplate: string;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Performance expectations
 * ============================================================================
 */

export interface StrategyLibraryPerformanceExpectation {
  readonly metric:
    | "RETURN"
    | "VOLATILITY"
    | "SHARPE_RATIO"
    | "SORTINO_RATIO"
    | "MAXIMUM_DRAWDOWN"
    | "WIN_RATE"
    | "PROFIT_FACTOR"
    | "TURNOVER"
    | "TRADE_COUNT"
    | "AVERAGE_HOLDING_PERIOD";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly target?: number;
  readonly unit: string;
  readonly informationalOnly: boolean;
  readonly explanation: string;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Strategy library entry
 * ============================================================================
 */

export interface StrategyLibraryEntry {
  readonly entryId: StrategyLibraryEntryId;
  readonly schemaVersion: StrategyLibrarySchemaVersion;
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
  readonly manifest: StrategyManifest;

  readonly family: StrategyLibraryFamily;
  readonly secondaryFamilies: readonly StrategyLibraryFamily[];
  readonly complexity: StrategyLibraryComplexity;
  readonly status: StrategyLibraryOperationalStatus;
  readonly verificationStatus: StrategyLibraryVerificationStatus;
  readonly availability: StrategyLibraryAvailability;

  readonly tags: readonly StrategyLibraryTag[];
  readonly aliases: readonly string[];
  readonly searchKeywords: readonly string[];

  readonly operationalProfile: StrategyLibraryOperationalProfile;
  readonly riskProfile: StrategyLibraryRiskProfile;
  readonly compatibilityProfile: StrategyLibraryCompatibilityProfile;

  readonly regimeProfiles: readonly StrategyLibraryRegimeProfile[];
  readonly dataRequirements: readonly StrategyLibraryDataRequirement[];
  readonly indicatorRequirements: readonly StrategyLibraryIndicatorRequirement[];
  readonly performanceExpectations:
    readonly StrategyLibraryPerformanceExpectation[];

  readonly documentation:
    readonly StrategyLibraryDocumentationReference[];
  readonly explanationTemplate?: StrategyLibraryExplanationTemplate;

  readonly introducedAt: UnixTimestampMilliseconds;
  readonly updatedAt: UnixTimestampMilliseconds;
  readonly deprecatedAt?: UnixTimestampMilliseconds;
  readonly retirementAt?: UnixTimestampMilliseconds;

  readonly replacementStrategyId?: StrategyId;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Collections
 * ============================================================================
 */

export type StrategyLibraryCollectionType =
  | "FAMILY"
  | "MARKET_TYPE"
  | "TRADING_MODE"
  | "RISK_LEVEL"
  | "REGIME"
  | "EXPERIENCE_LEVEL"
  | "CURATED"
  | "CUSTOM";

export interface StrategyLibraryCollectionMember {
  readonly entryId: StrategyLibraryEntryId;
  readonly strategyId: StrategyId;
  readonly position: number;
  readonly featured: boolean;
  readonly reason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryCollection {
  readonly collectionId: StrategyLibraryCollectionId;
  readonly name: string;
  readonly description: string;
  readonly type: StrategyLibraryCollectionType;
  readonly members: readonly StrategyLibraryCollectionMember[];
  readonly tags: readonly StrategyLibraryTag[];
  readonly createdAt: UnixTimestampMilliseconds;
  readonly updatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Releases
 * ============================================================================
 */

export type StrategyLibraryReleaseStatus =
  | "PLANNED"
  | "CANDIDATE"
  | "PUBLISHED"
  | "WITHDRAWN"
  | "SUPERSEDED";

export interface StrategyLibraryReleaseEntry {
  readonly entryId: StrategyLibraryEntryId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
  readonly checksum?: string;
  readonly notes?: string;
}

export interface StrategyLibraryRelease {
  readonly releaseId: StrategyLibraryReleaseId;
  readonly version: string;
  readonly status: StrategyLibraryReleaseStatus;
  readonly entries: readonly StrategyLibraryReleaseEntry[];
  readonly createdAt: UnixTimestampMilliseconds;
  readonly publishedAt?: UnixTimestampMilliseconds;
  readonly supersededAt?: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Query contracts
 * ============================================================================
 */

export type StrategyLibrarySortField =
  | "NAME"
  | "STRATEGY_ID"
  | "FAMILY"
  | "COMPLEXITY"
  | "RISK"
  | "STATUS"
  | "VERIFICATION"
  | "CREATED_AT"
  | "UPDATED_AT";

export type StrategyLibrarySortDirection =
  | "ASCENDING"
  | "DESCENDING";

export interface StrategyLibraryQuery {
  readonly text?: string;
  readonly strategyIds?: readonly StrategyId[];
  readonly families?: readonly StrategyLibraryFamily[];
  readonly complexities?: readonly StrategyLibraryComplexity[];
  readonly riskLevels?: readonly StrategyLibraryRiskLevel[];
  readonly statuses?: readonly StrategyLibraryOperationalStatus[];
  readonly verificationStatuses?:
    readonly StrategyLibraryVerificationStatus[];
  readonly marketTypes?: readonly StrategyMarketType[];
  readonly tradingModes?: readonly StrategyTradingMode[];
  readonly environments?: readonly StrategyEnvironment[];
  readonly capabilities?: readonly StrategyCapability[];
  readonly regimes?: readonly StrategyLibraryMarketRegime[];
  readonly tags?: readonly StrategyLibraryTag[];
  readonly intelligenceTypes?:
    readonly StrategyLibraryIntelligenceType[];
  readonly includeDeprecated?: boolean;
  readonly includeRetired?: boolean;
  readonly sortBy?: StrategyLibrarySortField;
  readonly sortDirection?: StrategyLibrarySortDirection;
  readonly offset?: number;
  readonly limit?: number;
}

export interface StrategyLibraryQueryResult {
  readonly query: StrategyLibraryQuery;
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly entries: readonly StrategyLibraryEntry[];
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Validation contracts
 * ============================================================================
 */

export type StrategyLibraryValidationSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR";

export type StrategyLibraryValidationCode =
  | "INVALID_SCHEMA_VERSION"
  | "EMPTY_IDENTIFIER"
  | "INVALID_IDENTIFIER"
  | "DUPLICATE_VALUE"
  | "INVALID_TIMESTAMP"
  | "INVALID_TIMESTAMP_ORDER"
  | "INVALID_SCORE"
  | "INVALID_RANGE"
  | "INVALID_MANIFEST"
  | "MANIFEST_ID_MISMATCH"
  | "MANIFEST_VERSION_MISMATCH"
  | "UNSUPPORTED_CAPABILITY"
  | "UNSUPPORTED_MARKET_TYPE"
  | "UNSUPPORTED_TRADING_MODE"
  | "UNSUPPORTED_ENVIRONMENT"
  | "INVALID_RISK_PROFILE"
  | "INVALID_COMPATIBILITY_PROFILE"
  | "INVALID_OPERATIONAL_PROFILE"
  | "INVALID_REGIME_PROFILE"
  | "INVALID_DATA_REQUIREMENT"
  | "INVALID_INDICATOR_REQUIREMENT"
  | "INVALID_PERFORMANCE_EXPECTATION"
  | "INVALID_DOCUMENTATION_REFERENCE"
  | "INVALID_EXPLANATION_TEMPLATE"
  | "INVALID_COLLECTION"
  | "INVALID_RELEASE"
  | "DEPRECATED_WITHOUT_TIMESTAMP"
  | "RETIRED_WITHOUT_TIMESTAMP"
  | "REPLACEMENT_EQUALS_STRATEGY"
  | "UNKNOWN";

export interface StrategyLibraryValidationIssue {
  readonly path: string;
  readonly code: StrategyLibraryValidationCode;
  readonly severity: StrategyLibraryValidationSeverity;
  readonly message: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryValidationReport {
  readonly valid: boolean;
  readonly issues: readonly StrategyLibraryValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly validatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Registry snapshots and statistics
 * ============================================================================
 */

export interface StrategyLibraryStatistics {
  readonly totalEntries: number;
  readonly activeEntries: number;
  readonly deprecatedEntries: number;
  readonly retiredEntries: number;
  readonly liveReadyEntries: number;
  readonly certifiedEntries: number;
  readonly familyCounts:
    Readonly<Partial<Record<StrategyLibraryFamily, number>>>;
  readonly riskLevelCounts:
    Readonly<Partial<Record<StrategyLibraryRiskLevel, number>>>;
  readonly verificationCounts:
    Readonly<
      Partial<Record<StrategyLibraryVerificationStatus, number>>
    >;
}

export interface StrategyLibrarySnapshot {
  readonly schemaVersion: StrategyLibrarySchemaVersion;
  readonly capturedAt: UnixTimestampMilliseconds;
  readonly entries: readonly StrategyLibraryEntry[];
  readonly collections: readonly StrategyLibraryCollection[];
  readonly releases: readonly StrategyLibraryRelease[];
  readonly statistics: StrategyLibraryStatistics;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Provider contracts
 * ============================================================================
 */

export interface StrategyLibraryProvider {
  readonly providerId: StrategyLibraryProviderId;

  listEntries():
    | readonly StrategyLibraryEntry[]
    | Promise<readonly StrategyLibraryEntry[]>;

  listCollections?():
    | readonly StrategyLibraryCollection[]
    | Promise<readonly StrategyLibraryCollection[]>;

  listReleases?():
    | readonly StrategyLibraryRelease[]
    | Promise<readonly StrategyLibraryRelease[]>;
}

/* ============================================================================
 * Port contracts
 * ============================================================================
 */

export interface StrategyLibraryValidatorPort {
  validateEntry(
    entry: StrategyLibraryEntry,
  ): StrategyLibraryValidationReport;

  validateCollection(
    collection: StrategyLibraryCollection,
  ): StrategyLibraryValidationReport;

  validateRelease(
    release: StrategyLibraryRelease,
  ): StrategyLibraryValidationReport;

  assertValid(
    report: StrategyLibraryValidationReport,
    message?: string,
  ): void;
}

export interface StrategyLibraryRegistryPort {
  register(entry: StrategyLibraryEntry): void;

  registerMany(
    entries: readonly StrategyLibraryEntry[],
  ): void;

  unregister(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): boolean;

  has(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): boolean;

  get(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): StrategyLibraryEntry | undefined;

  list(): readonly StrategyLibraryEntry[];

  query(
    query?: StrategyLibraryQuery,
  ): StrategyLibraryQueryResult;

  snapshot(): StrategyLibrarySnapshot;
}

/* ============================================================================
 * Constants
 * ============================================================================
 */

export const STRATEGY_LIBRARY_SCORE_MINIMUM = 0 as const;

export const STRATEGY_LIBRARY_SCORE_MAXIMUM = 1 as const;

export const STRATEGY_LIBRARY_DEFAULT_QUERY_LIMIT = 100 as const;

export const STRATEGY_LIBRARY_MAXIMUM_QUERY_LIMIT = 1_000 as const;

export const EMPTY_STRATEGY_LIBRARY_TAGS:
  readonly StrategyLibraryTag[] =
  Object.freeze([]);

export const EMPTY_STRATEGY_LIBRARY_ENTRIES:
  readonly StrategyLibraryEntry[] =
  Object.freeze([]);

export const EMPTY_STRATEGY_LIBRARY_COLLECTIONS:
  readonly StrategyLibraryCollection[] =
  Object.freeze([]);

export const EMPTY_STRATEGY_LIBRARY_RELEASES:
  readonly StrategyLibraryRelease[] =
  Object.freeze([]);