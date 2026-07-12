import type { Candle } from "../trading.types";

export type TradingSignal =
  | "BUY"
  | "SELL"
  | "HOLD";

export interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  evaluatedAt?: number;
}

export interface StrategyResult {
  strategyId: string;
  signal: TradingSignal;
  confidence: number;
  reason: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  minimumCandles: number;
}