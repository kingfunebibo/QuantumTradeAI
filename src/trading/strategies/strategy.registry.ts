import type { TradingStrategy } from "./strategy.interface";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
} from "./strategy.types";

export class StrategyRegistry {
  private readonly strategies =
    new Map<string, TradingStrategy>();

  register(strategy: TradingStrategy): void {
    const strategyId =
      strategy.definition.id.trim();

    if (!strategyId) {
      throw new Error(
        "Strategy ID cannot be empty.",
      );
    }

    if (this.strategies.has(strategyId)) {
      throw new Error(
        `Strategy "${strategyId}" is already registered.`,
      );
    }

    this.strategies.set(
      strategyId,
      strategy,
    );
  }

  has(strategyId: string): boolean {
    return this.strategies.has(
      strategyId.trim(),
    );
  }

  get(strategyId: string): TradingStrategy {
    const normalizedStrategyId =
      strategyId.trim();

    const strategy =
      this.strategies.get(
        normalizedStrategyId,
      );

    if (!strategy) {
      throw new Error(
        `Strategy "${normalizedStrategyId}" is not registered.`,
      );
    }

    return strategy;
  }

  list(): StrategyDefinition[] {
    return Array.from(
      this.strategies.values(),
    ).map((strategy) => ({
      ...strategy.definition,
    }));
  }

  evaluate(
    strategyId: string,
    context: StrategyContext,
  ): StrategyResult {
    return this.get(
      strategyId,
    ).evaluate(context);
  }
}