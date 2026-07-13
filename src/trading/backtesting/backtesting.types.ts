export interface HistoricalCandle {
  readonly symbol: string;
  readonly timeframe: string;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface CandleReplayContext {
  readonly candle: HistoricalCandle;
  readonly index: number;
  readonly totalCandles: number;
  readonly previousCandle?: HistoricalCandle;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly simulationTime: number;
}

export type CandleReplayHandler = (
  context: CandleReplayContext,
) => void | Promise<void>;

export interface CandleReplayResult {
  readonly processedCandles: number;
  readonly firstOpenTime: number | null;
  readonly lastCloseTime: number | null;
  readonly finalSimulationTime: number | null;
}

export interface HistoricalCandleReplayOptions {
  /**
   * Require every candle to belong to the same symbol and timeframe.
   *
   * Enabled by default because a single replay stream should represent
   * one deterministic market series.
   */
  readonly requireSingleMarket?: boolean;
}

export interface BacktestClock {
  now(): number | null;
  advanceTo(timestamp: number): void;
  reset(): void;
}