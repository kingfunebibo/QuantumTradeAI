import type {
  SignalDecision,
  TradeSignal,
} from "../../signals";

import type { BacktestSession } from "../session";

import type {
  BacktestStrategyEvaluation,
} from "../strategy";

export interface BacktestSignalEvaluation {
  readonly candleIndex: number;
  readonly evaluatedAt: number;
  readonly strategyId: string;
  readonly strategySignal:
    | "BUY"
    | "SELL"
    | "HOLD";
  readonly accepted: boolean;
  readonly reason: string;
  readonly signal?: TradeSignal;
}

export interface BacktestSignalPipeline {
  evaluate(
    session: BacktestSession,
    strategyEvaluation: BacktestStrategyEvaluation,
  ): BacktestSignalEvaluation;

  getEvaluationCount(): number;

  getAcceptedCount(): number;

  getRejectedCount(): number;

  getLastDecision(): SignalDecision | null;

  reset(): void;
}