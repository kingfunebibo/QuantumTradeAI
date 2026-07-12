import { EMA } from "technicalindicators";

/**
 * Calculate the Exponential Moving Average.
 */
export function calculateEMA(
  values: number[],
  period: number,
): number[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(
      "EMA period must be a positive integer.",
    );
  }

  if (values.length < period) {
    return [];
  }

  return EMA.calculate({
    values,
    period,
  });
}