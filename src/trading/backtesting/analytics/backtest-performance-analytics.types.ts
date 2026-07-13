import type {
  BacktestEquityPoint,
} from "../equity";

/**
 * One deterministic period-to-period return derived from
 * consecutive equity-curve observations.
 */
export interface BacktestPeriodReturn {
  readonly sequence: number;

  readonly fromPointSequence: number;
  readonly toPointSequence: number;

  readonly fromTimestamp: number;
  readonly toTimestamp: number;

  readonly fromCandleIndex: number;
  readonly toCandleIndex: number;

  readonly startingEquity: number;
  readonly endingEquity: number;

  readonly absoluteReturn: number;
  readonly returnRate: number;
}

/**
 * Deterministic summary of the equity-return distribution.
 */
export interface BacktestReturnStatistics {
  readonly observations: number;

  readonly positiveReturns: number;
  readonly negativeReturns: number;
  readonly zeroReturns: number;

  readonly cumulativeReturn: number;
  readonly arithmeticMeanReturn: number;
  readonly geometricMeanReturn: number;

  readonly minimumReturn: number;
  readonly maximumReturn: number;

  readonly variance: number;
  readonly standardDeviation: number;

  readonly downsideVariance: number;
  readonly downsideDeviation: number;
}

/**
 * Deterministic drawdown interval derived from the equity
 * curve.
 */
export interface BacktestDrawdownPeriod {
  readonly sequence: number;

  readonly peakPointSequence: number;
  readonly troughPointSequence: number;
  readonly recoveryPointSequence?: number;

  readonly peakTimestamp: number;
  readonly troughTimestamp: number;
  readonly recoveryTimestamp?: number;

  readonly peakCandleIndex: number;
  readonly troughCandleIndex: number;
  readonly recoveryCandleIndex?: number;

  readonly peakEquity: number;
  readonly troughEquity: number;

  readonly drawdownAmount: number;
  readonly drawdownRate: number;

  readonly durationObservations: number;
  readonly recovered: boolean;
}

/**
 * Aggregate drawdown statistics.
 */
export interface BacktestDrawdownStatistics {
  readonly periods: number;
  readonly recoveredPeriods: number;
  readonly activePeriods: number;

  readonly maximumDrawdownAmount: number;
  readonly maximumDrawdownRate: number;

  readonly averageDrawdownAmount: number;
  readonly averageDrawdownRate: number;

  readonly longestDrawdownObservations: number;

  readonly currentDrawdownAmount: number;
  readonly currentDrawdownRate: number;
}

/**
 * Configuration for annualized performance calculations.
 *
 * periodsPerYear determines the annualization factor for
 * Sharpe, Sortino, volatility and related metrics.
 */
export interface BacktestPerformanceAnalyticsOptions {
  readonly periodsPerYear?: number;
  readonly riskFreeRate?: number;
  readonly minimumAcceptableReturn?: number;
}

/**
 * Fully normalized analytics configuration.
 */
export interface NormalizedBacktestPerformanceAnalyticsOptions {
  readonly periodsPerYear: number;
  readonly riskFreeRate: number;
  readonly minimumAcceptableReturn: number;
}

/**
 * Deterministic performance ratios derived from the equity
 * curve.
 */
export interface BacktestPerformanceRatios {
  readonly annualizedReturn: number;
  readonly annualizedVolatility: number;

  readonly sharpeRatio: number | null;
  readonly sortinoRatio: number | null;
  readonly calmarRatio: number | null;

  readonly recoveryFactor: number | null;
}

/**
 * High-level deterministic portfolio performance summary.
 */
export interface BacktestPerformanceSummary {
  readonly initialEquity: number;
  readonly finalEquity: number;

  readonly absoluteReturn: number;
  readonly totalReturnRate: number;

  readonly peakEquity: number;
  readonly minimumEquity: number;

  readonly profitablePeriods: number;
  readonly losingPeriods: number;
  readonly unchangedPeriods: number;

  readonly returnStatistics: BacktestReturnStatistics;
  readonly drawdownStatistics: BacktestDrawdownStatistics;
  readonly ratios: BacktestPerformanceRatios;
}

/**
 * Complete immutable analytics result.
 */
export interface BacktestPerformanceReport {
  readonly generatedAt: number;

  readonly configuration:
    NormalizedBacktestPerformanceAnalyticsOptions;

  readonly equityPoints:
    readonly BacktestEquityPoint[];

  readonly periodReturns:
    readonly BacktestPeriodReturn[];

  readonly drawdownPeriods:
    readonly BacktestDrawdownPeriod[];

  readonly summary:
    BacktestPerformanceSummary;
}

/**
 * Read-only analytics query contract.
 */
export interface BacktestPerformanceAnalyticsReader {
  getReport(): BacktestPerformanceReport | undefined;

  getPeriodReturns():
    readonly BacktestPeriodReturn[];

  getDrawdownPeriods():
    readonly BacktestDrawdownPeriod[];

  getSummary():
    BacktestPerformanceSummary | undefined;
}

/**
 * Deterministic performance analytics engine contract.
 */
export interface BacktestPerformanceAnalyticsEngine
  extends BacktestPerformanceAnalyticsReader {
  analyze(
    equityPoints: readonly BacktestEquityPoint[],
    generatedAt: number,
  ): BacktestPerformanceReport;

  reset(): void;
}