import {
  SignalEngine,
} from "./signals";

import {
  EmaCrossoverStrategy,
  StrategyRegistry,
} from "./strategies";

import type {
  SignalDecision,
  SignalEngineOptions,
} from "./signals";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
  TradingStrategy,
} from "./strategies";

export class TradingService {
  private readonly strategyRegistry:
    StrategyRegistry;

  private readonly signalEngine:
    SignalEngine;

  constructor(
    strategyRegistry =
      new StrategyRegistry(),
    signalEngineOptions:
      SignalEngineOptions = {},
  ) {
    this.strategyRegistry =
      strategyRegistry;

    this.signalEngine =
      new SignalEngine(
        signalEngineOptions,
      );

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

  evaluateAndGenerateSignal(
    strategyId: string,
    context: StrategyContext,
  ): SignalDecision {
    if (context.candles.length === 0) {
      throw new Error(
        "Cannot generate a signal without candle data.",
      );
    }

    const strategyResult =
      this.evaluateStrategy(
        strategyId,
        context,
      );

    const latestCandle =
      context.candles[
        context.candles.length - 1
      ];

    return this.signalEngine.process({
      strategyResult,
      symbol: context.symbol,
      timeframe: context.timeframe,
      price: latestCandle.close,
      candleTimestamp:
        latestCandle.timestamp,
    });
  }

  clearSignalHistory(): void {
    this.signalEngine.clear();
  }

  getProcessedSignalCount(): number {
    return this.signalEngine
      .getProcessedCount();
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