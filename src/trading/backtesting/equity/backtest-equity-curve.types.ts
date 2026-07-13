import type {
  PortfolioSnapshot,
} from "../../portfolio";

/**
 * The reason an equity-curve observation was recorded.
 *
 * INITIAL
 *   The starting state before candle processing begins.
 *
 * CANDLE
 *   A normal mark-to-market observation for a replayed candle.
 *
 * EXECUTION
 *   An observation produced immediately after an accepted execution.
 *
 * FINAL
 *   The final portfolio state at the end of the simulation.
 */
export type BacktestEquityPointReason =
  | "INITIAL"
  | "CANDLE"
  | "EXECUTION"
  | "FINAL";

/**
 * Immutable mark prices used to value open positions.
 *
 * Keys are normalized trading symbols such as BTCUSDT.
 * Values must be positive finite market prices.
 */
export type BacktestMarkPrices = Readonly<
  Record<string, number>
>;

/**
 * Input used to record one deterministic portfolio observation.
 */
export interface BacktestEquityObservation {
  readonly candleIndex: number;
  readonly timestamp: number;
  readonly reason: BacktestEquityPointReason;
  readonly portfolioSnapshot: PortfolioSnapshot;
}

/**
 * One immutable point in the backtest equity curve.
 *
 * Portfolio values are copied from the production
 * PortfolioManager snapshot at a deterministic simulation
 * timestamp.
 */
export interface BacktestEquityPoint {
  readonly sequence: number;
  readonly candleIndex: number;
  readonly timestamp: number;
  readonly reason: BacktestEquityPointReason;

  readonly startingCapital: number;
  readonly cashBalance: number;
  readonly equity: number;

  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
  readonly totalFees: number;

  readonly absoluteReturn: number;
  readonly returnRate: number;

  readonly peakEquity: number;
  readonly drawdownAmount: number;
  readonly drawdownRate: number;

  readonly openPositionCount: number;
  readonly closedTradeCount: number;

  readonly portfolioSnapshot: PortfolioSnapshot;
}

/**
 * Running deterministic equity-curve statistics.
 *
 * More advanced performance statistics such as Sharpe,
 * Sortino and profit factor will be implemented in a later
 * analytics milestone.
 */
export interface BacktestEquityCurveMetrics {
  readonly observations: number;

  readonly initialEquity: number;
  readonly currentEquity: number;
  readonly peakEquity: number;
  readonly minimumEquity: number;

  readonly absoluteReturn: number;
  readonly returnRate: number;

  readonly currentDrawdownAmount: number;
  readonly currentDrawdownRate: number;

  readonly maximumDrawdownAmount: number;
  readonly maximumDrawdownRate: number;

  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
  readonly totalFees: number;

  readonly profitableObservations: number;
  readonly losingObservations: number;
  readonly unchangedObservations: number;
}

/**
 * Read-only equity-curve query contract.
 */
export interface BacktestEquityCurveReader {
  getPoints(): readonly BacktestEquityPoint[];

  getLatestPoint(): BacktestEquityPoint | undefined;

  getMetrics(): BacktestEquityCurveMetrics;
}

/**
 * Deterministic equity-curve recorder contract.
 */
export interface BacktestEquityCurveRecorder
  extends BacktestEquityCurveReader {
  record(
    observation: BacktestEquityObservation,
  ): BacktestEquityPoint;

  reset(): void;
}

/**
 * Minimal production portfolio contract required by the
 * equity pipeline.
 *
 * This keeps the backtesting layer dependent on an interface
 * rather than directly coupled to PortfolioManager.
 */
export interface BacktestPortfolioValuationSource {
  updateMarketPrice(
    symbol: string,
    marketPrice: number,
  ): void;

  getSnapshot(): PortfolioSnapshot;
}

/**
 * Input for marking the portfolio at the close of one
 * historical candle.
 */
export interface BacktestPortfolioMarkRequest {
  readonly candleIndex: number;
  readonly timestamp: number;
  readonly symbol: string;
  readonly marketPrice: number;
  readonly reason?: Extract<
    BacktestEquityPointReason,
    "CANDLE" | "FINAL"
  >;
}

/**
 * Result of one portfolio mark-to-market operation.
 */
export interface BacktestPortfolioMarkResult {
  readonly candleIndex: number;
  readonly timestamp: number;
  readonly symbol: string;
  readonly marketPrice: number;
  readonly portfolioSnapshot: PortfolioSnapshot;
  readonly equityPoint: BacktestEquityPoint;
}

/**
 * Aggregate metrics maintained by the portfolio-equity
 * integration pipeline.
 */
export interface BacktestPortfolioEquityMetrics {
  readonly marks: number;
  readonly executionObservations: number;
  readonly candleObservations: number;
  readonly finalObservations: number;

  readonly currentEquity: number;
  readonly peakEquity: number;
  readonly totalPnl: number;
  readonly returnRate: number;
  readonly maximumDrawdownAmount: number;
  readonly maximumDrawdownRate: number;
}