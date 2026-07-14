/**
 * QuantumTradeAI
 * Deterministic Backtest Reporting
 *
 * File:
 * backtest-report.types.ts
 *
 * Purpose:
 * Defines the immutable, versioned schema used by deterministic
 * backtest reports and report exporters.
 *
 * This file intentionally contains no runtime behavior.
 */

/**
 * Current report schema version.
 *
 * The literal type ensures that reports using an unsupported schema version
 * cannot accidentally be treated as current reports.
 */
export const BACKTEST_REPORT_SCHEMA_VERSION = "1.0.0" as const;

export type BacktestReportSchemaVersion =
  typeof BACKTEST_REPORT_SCHEMA_VERSION;

/**
 * Machine-readable report format.
 */
export type BacktestReportFormat = "QUANTUM_TRADE_AI_BACKTEST_REPORT";

/**
 * Supported serialized report output formats.
 */
export type BacktestReportExportFormat = "JSON";

/**
 * Lifecycle status of the backtest represented by the report.
 */
export type BacktestReportStatus =
  | "CREATED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/**
 * Direction represented by an exported trade.
 */
export type BacktestReportTradeDirection = "LONG" | "SHORT";

/**
 * Final outcome of an exported trade.
 */
export type BacktestReportTradeOutcome =
  | "WIN"
  | "LOSS"
  | "BREAKEVEN";

/**
 * Event severity used by report consumers and dashboards.
 */
export type BacktestReportEventSeverity =
  | "DEBUG"
  | "INFO"
  | "WARNING"
  | "ERROR";

/**
 * High-level event category.
 */
export type BacktestReportEventCategory =
  | "SESSION"
  | "REPLAY"
  | "STRATEGY"
  | "SIGNAL"
  | "RISK"
  | "EXECUTION"
  | "PORTFOLIO"
  | "POSITION"
  | "ANALYTICS"
  | "REPORTING"
  | "SYSTEM";

/**
 * Primitive values that may safely appear in deterministic metadata.
 */
export type BacktestReportPrimitive =
  | string
  | number
  | boolean
  | null;

/**
 * Recursively serializable deterministic JSON value.
 *
 * Undefined, Date, bigint, functions, symbols, Map, and Set are excluded
 * intentionally because they do not have stable native JSON representations.
 */
export type BacktestReportJsonValue =
  | BacktestReportPrimitive
  | readonly BacktestReportJsonValue[]
  | {
      readonly [key: string]: BacktestReportJsonValue;
    };

/**
 * Report identity.
 *
 * Every field must be derived deterministically from the backtest session
 * or explicitly supplied by the caller.
 */
export interface BacktestReportIdentity {
  readonly reportId: string;
  readonly backtestId: string;
  readonly sessionId: string;
  readonly strategyId: string;
}

/**
 * Report producer information.
 */
export interface BacktestReportProducer {
  readonly application: "QuantumTradeAI";
  readonly component: "BACKTEST_REPORTING";
  readonly applicationVersion: string;
}

/**
 * Top-level report metadata.
 */
export interface BacktestReportMetadata {
  readonly schemaVersion: BacktestReportSchemaVersion;
  readonly format: BacktestReportFormat;
  readonly exportFormat: BacktestReportExportFormat;
  readonly producer: BacktestReportProducer;
  readonly status: BacktestReportStatus;

  /**
   * ISO-8601 timestamp supplied by the deterministic backtest clock.
   */
  readonly generatedAt: string;

  /**
   * Optional user-defined labels and machine-readable report attributes.
   */
  readonly labels: Readonly<Record<string, string>>;
  readonly attributes: Readonly<
    Record<string, BacktestReportJsonValue>
  >;
}

/**
 * Snapshot of the configuration that governed the backtest.
 */
export interface BacktestConfigurationSnapshot {
  readonly symbols: readonly string[];
  readonly timeframe: string;

  readonly startTime: string;
  readonly endTime: string;

  readonly initialCapital: number;
  readonly baseCurrency: string;

  readonly strategyId: string;
  readonly strategyName: string;
  readonly strategyParameters: Readonly<
    Record<string, BacktestReportJsonValue>
  >;

  readonly riskConfiguration: Readonly<
    Record<string, BacktestReportJsonValue>
  >;

  readonly executionConfiguration: Readonly<
    Record<string, BacktestReportJsonValue>
  >;

  readonly portfolioConfiguration: Readonly<
    Record<string, BacktestReportJsonValue>
  >;

  readonly additionalConfiguration: Readonly<
    Record<string, BacktestReportJsonValue>
  >;
}

/**
 * Immutable session state captured at report generation time.
 */
export interface BacktestSessionSnapshot {
  readonly sessionId: string;
  readonly status: BacktestReportStatus;

  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly failedAt: string | null;

  readonly failureCode: string | null;
  readonly failureMessage: string | null;

  readonly currentTimestamp: string | null;
  readonly processedCandleCount: number;
  readonly processedEventCount: number;
}

/**
 * Backtest replay and processing progress.
 */
export interface BacktestProgressSnapshot {
  readonly totalCandles: number;
  readonly processedCandles: number;
  readonly remainingCandles: number;

  readonly progressPercentage: number;

  readonly firstCandleTimestamp: string | null;
  readonly lastProcessedCandleTimestamp: string | null;
  readonly finalCandleTimestamp: string | null;

  readonly generatedSignalCount: number;
  readonly approvedRiskDecisionCount: number;
  readonly rejectedRiskDecisionCount: number;
  readonly skippedRiskDecisionCount: number;
  readonly executionCount: number;
  readonly completedTradeCount: number;
}

/**
 * Portfolio-level metrics available to dashboards without requiring the
 * consumer to inspect the complete analytics payload.
 */
export interface BacktestMetricsSnapshot {
  readonly initialEquity: number;
  readonly finalEquity: number;
  readonly peakEquity: number;
  readonly lowestEquity: number;

  readonly netProfit: number;
  readonly netReturn: number;
  readonly netReturnPercentage: number;

  readonly maximumDrawdown: number;
  readonly maximumDrawdownPercentage: number;

  readonly totalTrades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly breakevenTrades: number;

  readonly winRate: number;
  readonly lossRate: number;

  readonly grossProfit: number;
  readonly grossLoss: number;

  readonly profitFactor: number | null;
  readonly expectancy: number;
  readonly payoffRatio: number | null;

  readonly sharpeRatio: number | null;
  readonly sortinoRatio: number | null;
  readonly calmarRatio: number | null;
  readonly recoveryFactor: number | null;

  readonly totalFees: number;
  readonly totalSlippage: number;
}

/**
 * Deterministic event exported from the backtest session.
 */
export interface BacktestReportEventSnapshot {
  readonly sequence: number;
  readonly eventId: string;
  readonly timestamp: string;

  readonly category: BacktestReportEventCategory;
  readonly severity: BacktestReportEventSeverity;
  readonly eventType: string;

  readonly symbol: string | null;
  readonly message: string;

  readonly data: Readonly<
    Record<string, BacktestReportJsonValue>
  >;
}

/**
 * One exported equity-curve observation.
 */
export interface BacktestEquityCurvePoint {
  readonly sequence: number;
  readonly timestamp: string;

  readonly cash: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly fees: number;

  readonly grossExposure: number;
  readonly netExposure: number;

  readonly equity: number;
  readonly peakEquity: number;

  readonly drawdown: number;
  readonly drawdownPercentage: number;
}

/**
 * Period-return observation used by risk-adjusted performance analytics.
 */
export interface BacktestPeriodReturnSnapshot {
  readonly sequence: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;

  readonly startingEquity: number;
  readonly endingEquity: number;

  readonly absoluteReturn: number;
  readonly percentageReturn: number;
}

/**
 * Immutable exported performance analytics.
 *
 * The complete source analytics object may be added to `details`, while
 * frequently consumed institutional metrics remain explicitly typed.
 */
export interface BacktestPerformanceAnalyticsSnapshot {
  readonly totalReturn: number;
  readonly totalReturnPercentage: number;

  readonly annualizedReturn: number | null;
  readonly annualizedVolatility: number | null;

  readonly maximumDrawdown: number;
  readonly maximumDrawdownPercentage: number;

  readonly sharpeRatio: number | null;
  readonly sortinoRatio: number | null;
  readonly calmarRatio: number | null;
  readonly recoveryFactor: number | null;

  readonly periodReturns: readonly BacktestPeriodReturnSnapshot[];

  readonly details: Readonly<
    Record<string, BacktestReportJsonValue>
  >;
}

/**
 * Immutable exported trade record.
 */
export interface BacktestTradeSnapshot {
  readonly sequence: number;
  readonly tradeId: string;
  readonly symbol: string;

  readonly direction: BacktestReportTradeDirection;
  readonly outcome: BacktestReportTradeOutcome;

  readonly openedAt: string;
  readonly closedAt: string;
  readonly durationMilliseconds: number;

  readonly entryPrice: number;
  readonly exitPrice: number;

  readonly quantity: number;
  readonly notionalValue: number;

  readonly grossPnl: number;
  readonly netPnl: number;
  readonly returnPercentage: number;

  readonly entryFee: number;
  readonly exitFee: number;
  readonly totalFees: number;

  readonly entrySlippage: number;
  readonly exitSlippage: number;
  readonly totalSlippage: number;

  readonly signalId: string | null;
  readonly riskDecisionId: string | null;
  readonly entryExecutionId: string | null;
  readonly exitExecutionId: string | null;

  readonly metadata: Readonly<
    Record<string, BacktestReportJsonValue>
  >;
}

/**
 * Trade analytics exported from Milestone 9.
 */
export interface BacktestTradeAnalyticsSnapshot {
  readonly totalTrades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly breakevenTrades: number;

  readonly longTrades: number;
  readonly shortTrades: number;

  readonly winRate: number;
  readonly lossRate: number;

  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly netProfit: number;

  readonly averageWinningTrade: number;
  readonly averageLosingTrade: number;
  readonly largestWinningTrade: number;
  readonly largestLosingTrade: number;

  readonly profitFactor: number | null;
  readonly expectancy: number;
  readonly payoffRatio: number | null;

  readonly averageTradeDurationMilliseconds: number;
  readonly longestTradeDurationMilliseconds: number;
  readonly shortestTradeDurationMilliseconds: number;

  readonly maximumConsecutiveWins: number;
  readonly maximumConsecutiveLosses: number;

  readonly symbolAnalytics: Readonly<
    Record<string, BacktestReportJsonValue>
  >;

  readonly directionAnalytics: Readonly<
    Record<string, BacktestReportJsonValue>
  >;

  readonly details: Readonly<
    Record<string, BacktestReportJsonValue>
  >;
}

/**
 * Compact summary intended for dashboard cards, API listings,
 * report indexes, and result comparison tables.
 */
export interface BacktestDashboardSummary {
  readonly reportId: string;
  readonly backtestId: string;
  readonly sessionId: string;

  readonly strategyId: string;
  readonly strategyName: string;

  readonly symbols: readonly string[];
  readonly timeframe: string;

  readonly status: BacktestReportStatus;

  readonly startTime: string;
  readonly endTime: string;
  readonly generatedAt: string;

  readonly initialEquity: number;
  readonly finalEquity: number;

  readonly netProfit: number;
  readonly netReturnPercentage: number;

  readonly maximumDrawdownPercentage: number;

  readonly totalTrades: number;
  readonly winRate: number;
  readonly profitFactor: number | null;

  readonly sharpeRatio: number | null;
  readonly sortinoRatio: number | null;
}

/**
 * Versioned immutable backtest report.
 *
 * All arrays and nested records are readonly so consumers cannot mutate
 * a report after construction.
 */
export interface BacktestReport {
  readonly identity: BacktestReportIdentity;
  readonly metadata: BacktestReportMetadata;

  readonly configuration: BacktestConfigurationSnapshot;
  readonly session: BacktestSessionSnapshot;
  readonly progress: BacktestProgressSnapshot;
  readonly metrics: BacktestMetricsSnapshot;

  readonly events: readonly BacktestReportEventSnapshot[];
  readonly equityCurve: readonly BacktestEquityCurvePoint[];
  readonly performanceAnalytics: BacktestPerformanceAnalyticsSnapshot;
  readonly trades: readonly BacktestTradeSnapshot[];
  readonly tradeAnalytics: BacktestTradeAnalyticsSnapshot;

  readonly dashboardSummary: BacktestDashboardSummary;
}

/**
 * Serializable top-level report envelope.
 *
 * The envelope allows future schema migrations without changing the identity
 * of the report payload itself.
 */
export interface BacktestReportEnvelope {
  readonly schemaVersion: BacktestReportSchemaVersion;
  readonly report: BacktestReport;
}