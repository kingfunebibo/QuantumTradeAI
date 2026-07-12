import { calculateEMA } from "../indicators";

import type { TradingStrategy } from "./strategy.interface";

import type {
  StrategyContext,
  StrategyDefinition,
  StrategyResult,
  TradingSignal,
} from "./strategy.types";

export interface EmaCrossoverStrategyOptions {
  fastPeriod?: number;
  slowPeriod?: number;
}

export class EmaCrossoverStrategy
  implements TradingStrategy
{
  readonly definition: StrategyDefinition;

  private readonly fastPeriod: number;
  private readonly slowPeriod: number;

  constructor(
    options: EmaCrossoverStrategyOptions = {},
  ) {
    this.fastPeriod =
      options.fastPeriod ?? 9;

    this.slowPeriod =
      options.slowPeriod ?? 21;

    this.validatePeriods();

    this.definition = {
      id: "ema-crossover",
      name: "EMA Crossover",
      description:
        "Generates BUY and SELL signals when the fast EMA crosses the slow EMA.",
      minimumCandles:
        this.slowPeriod + 1,
    };
  }

  evaluate(
    context: StrategyContext,
  ): StrategyResult {
    this.validateContext(context);

    const timestamp =
      context.evaluatedAt ?? Date.now();

    const metadata = {
      symbol: context.symbol,
      timeframe: context.timeframe,
      fastPeriod: this.fastPeriod,
      slowPeriod: this.slowPeriod,
    };

    if (
      context.candles.length <
      this.definition.minimumCandles
    ) {
      return {
        strategyId: this.definition.id,
        signal: "HOLD",
        confidence: 0,
        reason:
          `Insufficient candle history. ` +
          `Required ${this.definition.minimumCandles}, ` +
          `received ${context.candles.length}.`,
        timestamp,
        metadata,
      };
    }

    const closes = context.candles.map(
      (candle) => candle.close,
    );

    const fastEma = calculateEMA(
      closes,
      this.fastPeriod,
    );

    const slowEma = calculateEMA(
      closes,
      this.slowPeriod,
    );

    if (
      fastEma.length < 2 ||
      slowEma.length < 2
    ) {
      return {
        strategyId: this.definition.id,
        signal: "HOLD",
        confidence: 0,
        reason:
          "EMA values are not fully initialized.",
        timestamp,
        metadata,
      };
    }

    const previousFast =
      fastEma[fastEma.length - 2];

    const currentFast =
      fastEma[fastEma.length - 1];

    const previousSlow =
      slowEma[slowEma.length - 2];

    const currentSlow =
      slowEma[slowEma.length - 1];

    const signal = this.determineSignal(
      previousFast,
      currentFast,
      previousSlow,
      currentSlow,
    );

    const confidence =
      signal === "HOLD"
        ? 0
        : this.calculateConfidence(
            currentFast,
            currentSlow,
          );

    return {
      strategyId: this.definition.id,
      signal,
      confidence,
      reason: this.createReason(
        signal,
        previousFast,
        currentFast,
        previousSlow,
        currentSlow,
      ),
      timestamp,
      metadata: {
        ...metadata,
        previousFastEma: previousFast,
        currentFastEma: currentFast,
        previousSlowEma: previousSlow,
        currentSlowEma: currentSlow,
      },
    };
  }

  private validatePeriods(): void {
    if (
      !Number.isInteger(this.fastPeriod) ||
      this.fastPeriod <= 0
    ) {
      throw new Error(
        "EMA crossover fast period must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(this.slowPeriod) ||
      this.slowPeriod <= 0
    ) {
      throw new Error(
        "EMA crossover slow period must be a positive integer.",
      );
    }

    if (
      this.fastPeriod >= this.slowPeriod
    ) {
      throw new Error(
        "EMA crossover fast period must be less than the slow period.",
      );
    }
  }

  private validateContext(
    context: StrategyContext,
  ): void {
    if (!context.symbol.trim()) {
      throw new Error(
        "Strategy symbol cannot be empty.",
      );
    }

    if (!context.timeframe.trim()) {
      throw new Error(
        "Strategy timeframe cannot be empty.",
      );
    }

    if (
      context.evaluatedAt !== undefined &&
      !Number.isFinite(context.evaluatedAt)
    ) {
      throw new Error(
        "Strategy evaluation timestamp must be finite.",
      );
    }

    for (
      let index = 0;
      index < context.candles.length;
      index += 1
    ) {
      const candle =
        context.candles[index];

      if (
        !Number.isFinite(candle.timestamp) ||
        !Number.isFinite(candle.open) ||
        !Number.isFinite(candle.high) ||
        !Number.isFinite(candle.low) ||
        !Number.isFinite(candle.close) ||
        !Number.isFinite(candle.volume)
      ) {
        throw new Error(
          `Strategy candle at index ${index} contains a non-finite value.`,
        );
      }

      if (candle.high < candle.low) {
        throw new Error(
          `Strategy candle high must be greater than or equal to low at index ${index}.`,
        );
      }

      if (
        candle.open < candle.low ||
        candle.open > candle.high
      ) {
        throw new Error(
          `Strategy candle open must be between high and low at index ${index}.`,
        );
      }

      if (
        candle.close < candle.low ||
        candle.close > candle.high
      ) {
        throw new Error(
          `Strategy candle close must be between high and low at index ${index}.`,
        );
      }

      if (candle.volume < 0) {
        throw new Error(
          `Strategy candle volume cannot be negative at index ${index}.`,
        );
      }

      if (
        index > 0 &&
        candle.timestamp <=
          context.candles[index - 1].timestamp
      ) {
        throw new Error(
          "Strategy candles must be ordered by ascending timestamp.",
        );
      }
    }
  }

  private determineSignal(
    previousFast: number,
    currentFast: number,
    previousSlow: number,
    currentSlow: number,
  ): TradingSignal {
    const bullishCrossover =
      previousFast <= previousSlow &&
      currentFast > currentSlow;

    if (bullishCrossover) {
      return "BUY";
    }

    const bearishCrossover =
      previousFast >= previousSlow &&
      currentFast < currentSlow;

    if (bearishCrossover) {
      return "SELL";
    }

    return "HOLD";
  }

  private calculateConfidence(
    currentFast: number,
    currentSlow: number,
  ): number {
    if (currentSlow === 0) {
      return 0;
    }

    const relativeSpread =
      Math.abs(
        currentFast - currentSlow,
      ) / Math.abs(currentSlow);

    return Math.min(
      1,
      relativeSpread * 100,
    );
  }

  private createReason(
    signal: TradingSignal,
    previousFast: number,
    currentFast: number,
    previousSlow: number,
    currentSlow: number,
  ): string {
    if (signal === "BUY") {
      return (
        `Fast EMA (${this.fastPeriod}) crossed ` +
        `above slow EMA (${this.slowPeriod}).`
      );
    }

    if (signal === "SELL") {
      return (
        `Fast EMA (${this.fastPeriod}) crossed ` +
        `below slow EMA (${this.slowPeriod}).`
      );
    }

    return (
      "No EMA crossover detected. " +
      `Previous fast/slow: ${previousFast}/${previousSlow}. ` +
      `Current fast/slow: ${currentFast}/${currentSlow}.`
    );
  }
}