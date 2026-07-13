import {
  ExecutionEngine,
} from "./execution";

import {
  RiskManager,
} from "./risk";

import {
  SignalEngine,
} from "./signals";

import {
  EmaCrossoverStrategy,
  StrategyRegistry,
} from "./strategies";

import type {
  ExecutionEngineOptions,
  ExecutionReport,
  ExecutionRequest,
} from "./execution";

import type {
  RiskDecision,
  RiskManagerOptions,
  RiskRequest,
} from "./risk";

import type {
  SignalDecision,
  SignalEngineOptions,
  TradeSignal,
} from "./signals";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
  TradingStrategy,
} from "./strategies";

export interface TradingServiceOptions {
  signalEngine?: SignalEngineOptions;
  riskManager?: RiskManagerOptions;
  executionEngine?: ExecutionEngineOptions;
}

export class TradingService {
  private readonly strategyRegistry:
    StrategyRegistry;

  private readonly signalEngine:
    SignalEngine;

  private readonly riskManager:
    RiskManager;

  private readonly executionEngine:
    ExecutionEngine;

  constructor(
    strategyRegistry =
      new StrategyRegistry(),
    options: TradingServiceOptions = {},
  ) {
    this.strategyRegistry =
      strategyRegistry;

    this.signalEngine =
      new SignalEngine(
        options.signalEngine,
      );

    this.riskManager =
      new RiskManager(
        options.riskManager,
      );

    this.executionEngine =
      new ExecutionEngine(
        options.executionEngine,
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

  evaluateRisk(
    request: RiskRequest,
  ): RiskDecision {
    return this.riskManager.evaluate(
      request,
    );
  }

  evaluateSignalRisk(
    signal: TradeSignal,
    request: Omit<
      RiskRequest,
      "signal"
    >,
  ): RiskDecision {
    return this.riskManager.evaluate({
      ...request,
      signal,
    });
  }

  executeApprovedTrade(
    request: ExecutionRequest,
  ): ExecutionReport {
    return this.executionEngine
      .executeMarketOrder(request);
  }

  getExecutionEngine(): ExecutionEngine {
    return this.executionEngine;
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