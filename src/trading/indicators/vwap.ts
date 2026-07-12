import { VWAP } from "technicalindicators";

/**
 * Calculate cumulative Volume-Weighted Average Price.
 *
 * The calculation runs across the complete supplied dataset.
 * Callers should provide candles from the intended session
 * or calculation window.
 */
export function calculateVWAP(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
): number[] {
  if (
    high.length !== low.length ||
    high.length !== close.length ||
    high.length !== volume.length
  ) {
    throw new Error(
      "VWAP high, low, close, and volume arrays must have equal lengths.",
    );
  }

  if (high.length === 0) {
    return [];
  }

  for (let index = 0; index < high.length; index += 1) {
    const highValue = high[index];
    const lowValue = low[index];
    const closeValue = close[index];
    const volumeValue = volume[index];

    if (
      !Number.isFinite(highValue) ||
      !Number.isFinite(lowValue) ||
      !Number.isFinite(closeValue) ||
      !Number.isFinite(volumeValue)
    ) {
      throw new Error(
        "VWAP input values must be finite numbers.",
      );
    }

    if (highValue < lowValue) {
      throw new Error(
        `VWAP high value must be greater than or equal to low value at index ${index}.`,
      );
    }

    if (
      closeValue < lowValue ||
      closeValue > highValue
    ) {
      throw new Error(
        `VWAP close value must be between the high and low values at index ${index}.`,
      );
    }

    if (volumeValue <= 0) {
      throw new Error(
        `VWAP volume must be greater than zero at index ${index}.`,
      );
    }
  }

  const results = VWAP.calculate({
    high,
    low,
    close,
    volume,
  });

  if (
    results.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      "VWAP calculation returned a non-finite value.",
    );
  }

  return results;
}