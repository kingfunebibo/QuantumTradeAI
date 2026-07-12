import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
} from "./strategy.types";

export interface TradingStrategy {
  readonly definition: StrategyDefinition;

  evaluate(
    context: StrategyContext,
  ): StrategyResult;
}