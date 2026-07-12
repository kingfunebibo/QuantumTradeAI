import { Stochastic } from "technicalindicators";

export interface StochasticValue {
  k: number;
  d: number;
}

/**
 * Calculate the Stochastic Oscillator.
 *
 * Only fully initialized results containing both %K and %D
 * are returned.
 */
export function calculateStochastic(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
  signalPeriod = 3,
): StochasticValue[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(
      "Stochastic period must be a positive integer.",
    );
  }

  if (
    !Number.isInteger(signalPeriod) ||
    signalPeriod <= 0
  ) {
    throw new Error(
      "Stochastic signal period must be a positive integer.",
    );
  }

  if (
    high.length !== low.length ||
    high.length !== close.length
  ) {
    throw new Error(
      "Stochastic high, low, and close arrays must have equal lengths.",
    );
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
        "Stochastic input values must be finite numbers.",
      );
    }

    if (highValue < lowValue) {
      throw new Error(
        `Stochastic high value must be greater than or equal to low value at index ${index}.`,
      );
    }

    if (
      closeValue < lowValue ||
      closeValue > highValue
    ) {
      throw new Error(
        `Stochastic close value must be between the high and low values at index ${index}.`,
      );
    }
  }

  const minimumLength =
    period + signalPeriod - 1;

  if (high.length < minimumLength) {
    return [];
  }

  const results = Stochastic.calculate({
    high,
    low,
    close,
    period,
    signalPeriod,
  });

  return results
    .filter(
      (
        result,
      ): result is {
        k: number;
        d: number;
      } =>
        Number.isFinite(result.k) &&
        Number.isFinite(result.d),
    )
    .map((result) => ({
      k: result.k,
      d: result.d,
    }));
}