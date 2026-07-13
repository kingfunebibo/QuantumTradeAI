import type {
  StrategyResult,
  TradingSignal,
} from "../strategies";

export type ActionableSignal =
  | "BUY"
  | "SELL";

export interface SignalEngineOptions {
  minimumConfidence?: number;
  duplicateWindowMs?: number;
}

export interface TradeSignal {
  id: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  action: ActionableSignal;
  confidence: number;
  reason: string;
  price: number;
  candleTimestamp: number;
  generatedAt: number;
  metadata: Record<string, unknown>;
}

export interface SignalDecision {
  accepted: boolean;
  reason: string;
  signal?: TradeSignal;
}

export interface SignalInput {
  strategyResult: StrategyResult;
  symbol: string;
  timeframe: string;
  price: number;
  candleTimestamp: number;
}

export interface SignalFingerprint {
  strategyId: string;
  symbol: string;
  timeframe: string;
  action: TradingSignal;
  candleTimestamp: number;
}