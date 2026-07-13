import type { StrategyResult } from "../../strategies";
import type { Candle } from "../../trading.types";

import type { BacktestSession } from "../session";

export interface BacktestStrategyPipelineOptions {
  readonly strategyId: string;

  /**
   * Maximum number of candles retained in strategy history.
   *
   * When omitted, all processed candles are retained.
   */
  readonly maximumHistory?: number;
}

export interface BacktestStrategyEvaluation {
  readonly strategyId: string;
  readonly candleIndex: number;
  readonly evaluatedAt: number;
  readonly historyLength: number;
  readonly result: StrategyResult;
}

export interface BacktestStrategyPipeline {
  evaluate(
    session: BacktestSession,
  ): BacktestStrategyEvaluation;

  getHistory(): readonly Candle[];

  getEvaluationCount(): number;

  reset(): void;
}