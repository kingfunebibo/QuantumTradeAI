import { DeterministicBacktestClock } from "./backtest-clock";
import {
  BacktestClock,
  CandleReplayHandler,
  CandleReplayResult,
  HistoricalCandle,
  HistoricalCandleReplayOptions,
} from "./backtesting.types";

const DEFAULT_OPTIONS: Required<HistoricalCandleReplayOptions> = {
  requireSingleMarket: true,
};

export class HistoricalCandleReplay {
  private readonly options: Required<HistoricalCandleReplayOptions>;

  public constructor(
    private readonly clock: BacktestClock =
      new DeterministicBacktestClock(),
    options: HistoricalCandleReplayOptions = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  public async replay(
    candles: readonly HistoricalCandle[],
    handler: CandleReplayHandler,
  ): Promise<CandleReplayResult> {
    if (typeof handler !== "function") {
      throw new Error("A candle replay handler is required.");
    }

    const orderedCandles = this.prepareCandles(candles);

    this.clock.reset();

    if (orderedCandles.length === 0) {
      return {
        processedCandles: 0,
        firstOpenTime: null,
        lastCloseTime: null,
        finalSimulationTime: null,
      };
    }

    for (let index = 0; index < orderedCandles.length; index += 1) {
      const candle = orderedCandles[index];

      this.clock.advanceTo(candle.closeTime);

      await handler({
        candle,
        index,
        totalCandles: orderedCandles.length,
        previousCandle:
          index > 0 ? orderedCandles[index - 1] : undefined,
        isFirst: index === 0,
        isLast: index === orderedCandles.length - 1,
        simulationTime: candle.closeTime,
      });
    }

    const firstCandle = orderedCandles[0];
    const lastCandle = orderedCandles[orderedCandles.length - 1];

    return {
      processedCandles: orderedCandles.length,
      firstOpenTime: firstCandle.openTime,
      lastCloseTime: lastCandle.closeTime,
      finalSimulationTime: this.clock.now(),
    };
  }

  public prepareCandles(
    candles: readonly HistoricalCandle[],
  ): readonly HistoricalCandle[] {
    if (!Array.isArray(candles)) {
      throw new Error("Historical candles must be provided as an array.");
    }

    const copiedCandles = candles.map((candle, index) => {
      this.validateCandle(candle, index);

      return Object.freeze({
        ...candle,
      });
    });

    const orderedCandles = copiedCandles.sort(
      (left, right) =>
        left.openTime - right.openTime ||
        left.closeTime - right.closeTime ||
        left.symbol.localeCompare(right.symbol) ||
        left.timeframe.localeCompare(right.timeframe),
    );

    this.validateSeries(orderedCandles);

    return Object.freeze(orderedCandles);
  }

  private validateSeries(
    candles: readonly HistoricalCandle[],
  ): void {
    if (candles.length === 0) {
      return;
    }

    const firstCandle = candles[0];
    const seenMarketTimestamps = new Set<string>();

    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index];

      if (
        this.options.requireSingleMarket &&
        (candle.symbol !== firstCandle.symbol ||
          candle.timeframe !== firstCandle.timeframe)
      ) {
        throw new Error(
          `Historical replay contains multiple markets. Expected ` +
            `${firstCandle.symbol}:${firstCandle.timeframe}, received ` +
            `${candle.symbol}:${candle.timeframe} at index ${index}.`,
        );
      }

      const identity = this.createCandleIdentity(candle);

      if (seenMarketTimestamps.has(identity)) {
        throw new Error(
          `Duplicate historical candle detected for ${identity}.`,
        );
      }

      seenMarketTimestamps.add(identity);

      const previousCandle =
        index > 0 ? candles[index - 1] : undefined;

      if (
        previousCandle !== undefined &&
        this.options.requireSingleMarket &&
        candle.openTime <= previousCandle.openTime
      ) {
        throw new Error(
          `Historical candle open times must be strictly increasing. ` +
            `Received ${candle.openTime} after ` +
            `${previousCandle.openTime}.`,
        );
      }

      if (
        previousCandle !== undefined &&
        this.options.requireSingleMarket &&
        candle.closeTime <= previousCandle.closeTime
      ) {
        throw new Error(
          `Historical candle close times must be strictly increasing. ` +
            `Received ${candle.closeTime} after ` +
            `${previousCandle.closeTime}.`,
        );
      }
    }
  }

  private validateCandle(
    candle: HistoricalCandle,
    index: number,
  ): void {
    if (candle === null || typeof candle !== "object") {
      throw new Error(
        `Historical candle at index ${index} must be an object.`,
      );
    }

    this.assertNonEmptyString(candle.symbol, "symbol", index);
    this.assertNonEmptyString(candle.timeframe, "timeframe", index);

    this.assertTimestamp(candle.openTime, "openTime", index);
    this.assertTimestamp(candle.closeTime, "closeTime", index);

    if (candle.closeTime <= candle.openTime) {
      throw new Error(
        `Historical candle at index ${index} must have closeTime ` +
          `greater than openTime.`,
      );
    }

    this.assertPositiveNumber(candle.open, "open", index);
    this.assertPositiveNumber(candle.high, "high", index);
    this.assertPositiveNumber(candle.low, "low", index);
    this.assertPositiveNumber(candle.close, "close", index);
    this.assertNonNegativeNumber(candle.volume, "volume", index);

    if (candle.high < candle.low) {
      throw new Error(
        `Historical candle at index ${index} has high below low.`,
      );
    }

    const highestBodyPrice = Math.max(candle.open, candle.close);
    const lowestBodyPrice = Math.min(candle.open, candle.close);

    if (candle.high < highestBodyPrice) {
      throw new Error(
        `Historical candle at index ${index} has high below its ` +
          `open or close price.`,
      );
    }

    if (candle.low > lowestBodyPrice) {
      throw new Error(
        `Historical candle at index ${index} has low above its ` +
          `open or close price.`,
      );
    }
  }

  private createCandleIdentity(
    candle: HistoricalCandle,
  ): string {
    return [
      candle.symbol,
      candle.timeframe,
      candle.openTime,
    ].join(":");
  }

  private assertNonEmptyString(
    value: string,
    field: string,
    index: number,
  ): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(
        `Historical candle ${field} at index ${index} ` +
          `must be a non-empty string.`,
      );
    }
  }

  private assertTimestamp(
    value: number,
    field: string,
    index: number,
  ): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `Historical candle ${field} at index ${index} must be a ` +
          `non-negative safe integer.`,
      );
    }
  }

  private assertPositiveNumber(
    value: number,
    field: string,
    index: number,
  ): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `Historical candle ${field} at index ${index} must be a ` +
          `positive finite number.`,
      );
    }
  }

  private assertNonNegativeNumber(
    value: number,
    field: string,
    index: number,
  ): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Historical candle ${field} at index ${index} must be a ` +
          `non-negative finite number.`,
      );
    }
  }
}