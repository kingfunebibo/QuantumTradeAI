import type {
  ClosedTrade,
  PositionSide,
} from "../../portfolio";

/**
 * Classification assigned to a closed trade from its
 * net realized PnL.
 */
export type BacktestTradeOutcome =
  | "WIN"
  | "LOSS"
  | "BREAKEVEN";

/**
 * Immutable normalized trade record used by the analytics
 * layer.
 */
export interface BacktestAnalyzedTrade {
  readonly sequence: number;

  readonly id: string;
  readonly positionId: string;
  readonly orderId: string;

  readonly symbol: string;
  readonly side: PositionSide;

  readonly quantity: number;
  readonly entryPrice: number;
  readonly exitPrice: number;

  readonly grossRealizedPnl: number;
  readonly entryFee: number;
  readonly exitFee: number;
  readonly totalFees: number;
  readonly netRealizedPnl: number;

  readonly openedAt: number;
  readonly closedAt: number;
  readonly duration: number;

  readonly outcome: BacktestTradeOutcome;

  readonly sourceTrade: ClosedTrade;
}

/**
 * Aggregate trade outcome counts and rates.
 */
export interface BacktestTradeOutcomeStatistics {
  readonly totalTrades: number;

  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly breakevenTrades: number;

  readonly winRate: number;
  readonly lossRate: number;
  readonly breakevenRate: number;
}

/**
 * Aggregate profit and loss statistics.
 */
export interface BacktestTradeProfitStatistics {
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly netProfit: number;

  readonly averageTrade: number;
  readonly averageWin: number;
  readonly averageLoss: number;

  readonly largestWin: number;
  readonly largestLoss: number;

  readonly profitFactor: number | null;
  readonly payoffRatio: number | null;

  readonly expectancy: number;
  readonly expectancyRatio: number | null;
}

/**
 * Trade duration statistics in the same timestamp unit used
 * by ClosedTrade.openedAt and ClosedTrade.closedAt.
 */
export interface BacktestTradeDurationStatistics {
  readonly totalDuration: number;
  readonly averageDuration: number;
  readonly minimumDuration: number;
  readonly maximumDuration: number;

  readonly averageWinningDuration: number;
  readonly averageLosingDuration: number;
  readonly averageBreakevenDuration: number;
}

/**
 * Consecutive trade outcome statistics.
 */
export interface BacktestTradeStreakStatistics {
  readonly maximumConsecutiveWins: number;
  readonly maximumConsecutiveLosses: number;
  readonly maximumConsecutiveBreakevenTrades: number;

  readonly currentWinningStreak: number;
  readonly currentLosingStreak: number;
  readonly currentBreakevenStreak: number;
}

/**
 * Directional trade distribution.
 */
export interface BacktestTradeSideStatistics {
  readonly longTrades: number;
  readonly shortTrades: number;

  readonly longWinningTrades: number;
  readonly longLosingTrades: number;
  readonly longBreakevenTrades: number;

  readonly shortWinningTrades: number;
  readonly shortLosingTrades: number;
  readonly shortBreakevenTrades: number;

  readonly longNetProfit: number;
  readonly shortNetProfit: number;
}

/**
 * Per-symbol trade statistics.
 */
export interface BacktestSymbolTradeStatistics {
  readonly symbol: string;

  readonly totalTrades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly breakevenTrades: number;

  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly netProfit: number;

  readonly winRate: number;
  readonly profitFactor: number | null;
}

/**
 * Complete deterministic trade-performance summary.
 */
export interface BacktestTradePerformanceSummary {
  readonly outcomes: BacktestTradeOutcomeStatistics;
  readonly profit: BacktestTradeProfitStatistics;
  readonly duration: BacktestTradeDurationStatistics;
  readonly streaks: BacktestTradeStreakStatistics;
  readonly sides: BacktestTradeSideStatistics;

  readonly symbols:
    readonly BacktestSymbolTradeStatistics[];
}

/**
 * Complete immutable trade analytics report.
 */
export interface BacktestTradeAnalyticsReport {
  readonly generatedAt: number;

  readonly trades:
    readonly BacktestAnalyzedTrade[];

  readonly summary:
    BacktestTradePerformanceSummary;
}

/**
 * Read-only trade analytics query contract.
 */
export interface BacktestTradeAnalyticsReader {
  getReport():
    BacktestTradeAnalyticsReport | undefined;

  getTrades():
    readonly BacktestAnalyzedTrade[];

  getSummary():
    BacktestTradePerformanceSummary | undefined;
}

/**
 * Deterministic closed-trade analytics engine contract.
 */
export interface BacktestTradeAnalyticsEngine
  extends BacktestTradeAnalyticsReader {
  analyze(
    trades: readonly ClosedTrade[],
    generatedAt: number,
  ): BacktestTradeAnalyticsReport;

  reset(): void;
}