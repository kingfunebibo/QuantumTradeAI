import { ATR } from "technicalindicators";

/**
 * Calculate Average True Range (ATR).
 */
export function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
): number[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(
      "ATR period must be a positive integer.",
    );
  }

  if (
    high.length !== low.length ||
    high.length !== close.length
  ) {
    throw new Error(
      "ATR high, low, and close arrays must have equal lengths.",
    );
  }

  if (high.length < period + 1) {
    return [];
  }

  for (let index = 0; index < high.length; index += 1) {
    const highValue = high[index];
    const lowValue = low[index];
    const closeValue = close[index];

    if (
      !Number.isFinite(highValue) ||
      !Number.isFinite(lowValue) ||
      !Number.isFinite(closeValue)
    ) {
      throw new Error(
        "ATR input values must be finite numbers.",
      );
    }

    if (highValue < lowValue) {
      throw new Error(
        `ATR high value must be greater than or equal to low value at index ${index}.`,
      );
    }
  }

  return ATR.calculate({
    high,
    low,
    close,
    period,
  });
}