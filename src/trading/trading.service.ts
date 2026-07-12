import {
  EmaCrossoverStrategy,
  StrategyRegistry,
} from "./strategies";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
  TradingStrategy,
} from "./strategies";

export class TradingService {
  private readonly strategyRegistry:
    StrategyRegistry;

  constructor(
    strategyRegistry = new StrategyRegistry(),
  ) {
    this.strategyRegistry =
      strategyRegistry;

    this.registerDefaultStrategies();
  }

  registerStrategy(
    strategy: TradingStrategy,
  ): void {
    this.strategyRegistry.register(
      strategy,
    );
  }

  hasStrategy(
    strategyId: string,
  ): boolean {
    return this.strategyRegistry.has(
      strategyId,
    );
  }

  listStrategies(): StrategyDefinition[] {
    return this.strategyRegistry.list();
  }

  evaluateStrategy(
    strategyId: string,
    context: StrategyContext,
  ): StrategyResult {
    return this.strategyRegistry.evaluate(
      strategyId,
      context,
    );
  }

  private registerDefaultStrategies(): void {
    const emaCrossoverStrategy =
      new EmaCrossoverStrategy();

    if (
      !this.strategyRegistry.has(
        emaCrossoverStrategy.definition.id,
      )
    ) {
      this.strategyRegistry.register(
        emaCrossoverStrategy,
      );
    }
  }
}