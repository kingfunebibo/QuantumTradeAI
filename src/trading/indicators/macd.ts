import { MACD } from "technicalindicators";

export interface MACDValue {
  MACD: number;
  signal: number;
  histogram: number;
}

/**
 * Calculate Moving Average Convergence Divergence.
 */
export function calculateMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDValue[] {
  if (
    !Number.isInteger(fastPeriod) ||
    !Number.isInteger(slowPeriod) ||
    !Number.isInteger(signalPeriod) ||
    fastPeriod <= 0 ||
    slowPeriod <= 0 ||
    signalPeriod <= 0
  ) {
    throw new Error(
      "MACD periods must be positive integers.",
    );
  }

  if (fastPeriod >= slowPeriod) {
    throw new Error(
      "MACD fast period must be less than the slow period.",
    );
  }

  if (values.length < slowPeriod) {
    return [];
  }

  const results = MACD.calculate({
    values,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  return results.map((result) => ({
    MACD: result.MACD ?? 0,
    signal: result.signal ?? 0,
    histogram: result.histogram ?? 0,
  }));
}