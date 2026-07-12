import { RSI } from "technicalindicators";

/**
 * Calculate the Relative Strength Index.
 */
export function calculateRSI(
  values: number[],
  period = 14,
): number[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(
      "RSI period must be a positive integer.",
    );
  }

  if (values.length <= period) {
    return [];
  }

  return RSI.calculate({
    values,
    period,
  });
}