import { SMA } from "technicalindicators";

/**
 * Calculate the Simple Moving Average.
 */
export function calculateSMA(
  values: number[],
  period: number,
): number[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(
      "SMA period must be a positive integer.",
    );
  }

  if (values.length < period) {
    return [];
  }

  return SMA.calculate({
    values,
    period,
  });
}