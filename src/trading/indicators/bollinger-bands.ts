import { BollingerBands } from "technicalindicators";

export interface BollingerBandsValue {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
}

/**
 * Calculate Bollinger Bands.
 */
export function calculateBollingerBands(
  values: number[],
  period = 20,
  standardDeviation = 2,
): BollingerBandsValue[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(
      "Bollinger Bands period must be a positive integer.",
    );
  }

  if (
    !Number.isFinite(standardDeviation) ||
    standardDeviation <= 0
  ) {
    throw new Error(
      "Bollinger Bands standard deviation must be a positive finite number.",
    );
  }

  if (
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      "Bollinger Bands input values must be finite numbers.",
    );
  }

  if (values.length < period) {
    return [];
  }

  const results = BollingerBands.calculate({
    values,
    period,
    stdDev: standardDeviation,
  });

  return results.map((result, index) => {
    const sourceIndex = index + period - 1;
    const currentValue = values[sourceIndex];

    const bandwidth =
      result.middle === 0
        ? 0
        : (result.upper - result.lower) /
          result.middle;

    const bandRange =
      result.upper - result.lower;

    const percentB =
      bandRange === 0
        ? 0
        : (currentValue - result.lower) /
          bandRange;

    return {
      upper: result.upper,
      middle: result.middle,
      lower: result.lower,
      bandwidth,
      percentB,
    };
  });
}