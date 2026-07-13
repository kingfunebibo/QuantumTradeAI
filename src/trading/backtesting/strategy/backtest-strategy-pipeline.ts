import type {
  StrategyDefinition,
  StrategyResult,
} from "../../strategies";

import { StrategyRegistry } from "../../strategies";

import type { Candle } from "../../trading.types";

import type { BacktestSession } from "../session";

import type {
  BacktestStrategyEvaluation,
  BacktestStrategyPipeline,
  BacktestStrategyPipelineOptions,
} from "./backtest-strategy-pipeline.types";

export class DeterministicBacktestStrategyPipeline
  implements BacktestStrategyPipeline
{
  private readonly strategyId: string;
  private readonly maximumHistory: number | null;
  private readonly strategyDefinition: StrategyDefinition;

  private readonly history: Candle[] = [];

  private lastEvaluatedIndex: number | null = null;
  private evaluationCount = 0;

  public constructor(
    private readonly registry: StrategyRegistry,
    options: BacktestStrategyPipelineOptions,
  ) {
    this.validateRegistry(registry);
    this.validateOptions(options);

    this.strategyId = options.strategyId.trim();
    this.maximumHistory =
      options.maximumHistory ?? null;

    this.strategyDefinition = Object.freeze({
      ...this.registry.get(this.strategyId).definition,
    });

    this.validateMaximumHistoryAgainstStrategy();
  }

  public evaluate(
    session: BacktestSession,
  ): BacktestStrategyEvaluation {
    this.validateSession(session);

    const currentCandle =
      session.getCurrentCandle();

    const simulationTime =
      session.getSimulationTime();

    const progress = session.getProgress();

    if (currentCandle === null) {
      throw new Error(
        "Strategy pipeline cannot evaluate before the " +
          "backtest session has a current candle.",
      );
    }

    if (simulationTime === null) {
      throw new Error(
        "Strategy pipeline cannot evaluate without a " +
          "simulation timestamp.",
      );
    }

    if (progress.currentIndex === null) {
      throw new Error(
        "Strategy pipeline cannot evaluate without a " +
          "current candle index.",
      );
    }

    this.validateEvaluationIndex(
      progress.currentIndex,
    );

    this.appendCandle(
      this.convertCandle(currentCandle),
    );

    const result = this.registry.evaluate(
      this.strategyId,
      {
        symbol: currentCandle.symbol,
        timeframe: currentCandle.timeframe,
        candles: this.copyHistory(),
        evaluatedAt: simulationTime,
      },
    );

    this.validateStrategyResult(
      result,
      simulationTime,
    );

    this.lastEvaluatedIndex =
      progress.currentIndex;

    this.evaluationCount += 1;

    this.updateSession(
      session,
      result,
      progress.currentIndex,
      simulationTime,
    );

    return Object.freeze({
      strategyId: this.strategyId,
      candleIndex: progress.currentIndex,
      evaluatedAt: simulationTime,
      historyLength: this.history.length,
      result: this.freezeStrategyResult(result),
    });
  }

  public getHistory(): readonly Candle[] {
    return Object.freeze(
      this.history.map((candle) =>
        Object.freeze({
          ...candle,
        }),
      ),
    );
  }

  public getEvaluationCount(): number {
    return this.evaluationCount;
  }

  public reset(): void {
    this.history.splice(0, this.history.length);
    this.lastEvaluatedIndex = null;
    this.evaluationCount = 0;
  }

  private appendCandle(candle: Candle): void {
    const previousCandle =
      this.history[this.history.length - 1];

    if (
      previousCandle !== undefined &&
      candle.timestamp <= previousCandle.timestamp
    ) {
      throw new Error(
        "Strategy pipeline candle timestamps must be " +
          "strictly increasing.",
      );
    }

    this.history.push(
      Object.freeze({
        ...candle,
      }),
    );

    if (
      this.maximumHistory !== null &&
      this.history.length > this.maximumHistory
    ) {
      const excess =
        this.history.length -
        this.maximumHistory;

      this.history.splice(0, excess);
    }
  }

  private convertCandle(
    candle: {
      readonly openTime: number;
      readonly open: number;
      readonly high: number;
      readonly low: number;
      readonly close: number;
      readonly volume: number;
    },
  ): Candle {
    return {
      timestamp: candle.openTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    };
  }

  private copyHistory(): Candle[] {
    return this.history.map((candle) => ({
      ...candle,
    }));
  }

  private updateSession(
    session: BacktestSession,
    result: StrategyResult,
    candleIndex: number,
    simulationTime: number,
  ): void {
    session.setRuntimeState(
      "strategy.lastStrategyId",
      result.strategyId,
    );

    session.setRuntimeState(
      "strategy.lastSignal",
      result.signal,
    );

    session.setRuntimeState(
      "strategy.lastConfidence",
      result.confidence,
    );

    session.setRuntimeState(
      "strategy.lastReason",
      result.reason,
    );

    session.setRuntimeState(
      "strategy.lastEvaluatedAt",
      result.timestamp,
    );

    session.incrementMetric(
      "strategy.evaluations",
    );

    if (result.signal !== "HOLD") {
      session.incrementMetric(
        "strategy.actionableResults",
      );
    }

    session.recordEvent(
      "STRATEGY_EVALUATED",
      {
        strategyId: result.strategyId,
        signal: result.signal,
        confidence: result.confidence,
        reason: result.reason,
        evaluatedAt: simulationTime,
        candleIndex,
        historyLength: this.history.length,
      },
    );
  }

  private validateEvaluationIndex(
    currentIndex: number,
  ): void {
    const expectedIndex =
      this.lastEvaluatedIndex === null
        ? 0
        : this.lastEvaluatedIndex + 1;

    if (currentIndex !== expectedIndex) {
      throw new Error(
        "Strategy pipeline evaluations must be sequential. " +
          `Expected candle index ${expectedIndex}, ` +
          `received ${currentIndex}.`,
      );
    }
  }

  private validateStrategyResult(
    result: StrategyResult,
    expectedTimestamp: number,
  ): void {
    if (
      result === null ||
      typeof result !== "object"
    ) {
      throw new Error(
        "Strategy evaluation must return an object.",
      );
    }

    if (result.strategyId !== this.strategyId) {
      throw new Error(
        `Strategy result ID "${result.strategyId}" does not ` +
          `match configured strategy "${this.strategyId}".`,
      );
    }

    if (
      result.signal !== "BUY" &&
      result.signal !== "SELL" &&
      result.signal !== "HOLD"
    ) {
      throw new Error(
        `Strategy returned unsupported signal ` +
          `"${String(result.signal)}".`,
      );
    }

    if (
      !Number.isFinite(result.confidence) ||
      result.confidence < 0 ||
      result.confidence > 1
    ) {
      throw new Error(
        "Strategy confidence must be a finite number " +
          "between 0 and 1.",
      );
    }

    if (
      typeof result.reason !== "string" ||
      result.reason.trim().length === 0
    ) {
      throw new Error(
        "Strategy result reason must be non-empty.",
      );
    }

    if (result.timestamp !== expectedTimestamp) {
      throw new Error(
        "Strategy result timestamp must match the " +
          "deterministic simulation timestamp.",
      );
    }
  }

  private freezeStrategyResult(
    result: StrategyResult,
  ): StrategyResult {
    const metadata =
      result.metadata === undefined
        ? undefined
        : Object.freeze({
            ...result.metadata,
          });

    return Object.freeze({
      strategyId: result.strategyId,
      signal: result.signal,
      confidence: result.confidence,
      reason: result.reason,
      timestamp: result.timestamp,
      metadata,
    });
  }

  private validateRegistry(
    registry: StrategyRegistry,
  ): void {
    if (
      registry === null ||
      typeof registry !== "object" ||
      typeof registry.get !== "function" ||
      typeof registry.evaluate !== "function"
    ) {
      throw new Error(
        "Strategy pipeline requires a valid StrategyRegistry.",
      );
    }
  }

  private validateOptions(
    options: BacktestStrategyPipelineOptions,
  ): void {
    if (
      options === null ||
      typeof options !== "object"
    ) {
      throw new Error(
        "Strategy pipeline options must be an object.",
      );
    }

    if (
      typeof options.strategyId !== "string" ||
      options.strategyId.trim().length === 0
    ) {
      throw new Error(
        "Strategy pipeline strategyId must be non-empty.",
      );
    }

    if (
      options.maximumHistory !== undefined &&
      (!Number.isSafeInteger(
        options.maximumHistory,
      ) ||
        options.maximumHistory <= 0)
    ) {
      throw new Error(
        "Strategy pipeline maximumHistory must be a " +
          "positive safe integer.",
      );
    }
  }

  private validateMaximumHistoryAgainstStrategy(): void {
    if (
      this.maximumHistory !== null &&
      this.maximumHistory <
        this.strategyDefinition.minimumCandles
    ) {
      throw new Error(
        `Strategy pipeline maximumHistory must be at least ` +
          `${this.strategyDefinition.minimumCandles} candles ` +
          `for strategy "${this.strategyId}".`,
      );
    }
  }

  private validateSession(
    session: BacktestSession,
  ): void {
    if (
      session === null ||
      typeof session !== "object" ||
      typeof session.getCurrentCandle !== "function" ||
      typeof session.getSimulationTime !== "function" ||
      typeof session.getProgress !== "function"
    ) {
      throw new Error(
        "Strategy pipeline requires a valid backtest session.",
      );
    }
  }
}