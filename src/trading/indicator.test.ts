import {
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateStochastic,
  calculateVWAP,
} from "./indicators";

import type { Candle } from "./trading.types";

const closes = [
  100, 102, 103, 104, 106, 107, 108, 109, 110, 111,
  110, 112, 114, 113, 115, 116, 117, 118, 117, 119,
  120, 121, 123, 122, 124, 125, 126, 127, 128, 129,
  130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
];

const candles: Candle[] = closes.map(
  (close, index) => ({
    timestamp: Date.now() + index * 60_000,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100 + index,
  }),
);

const highs = candles.map(
  (candle) => candle.high,
);

const lows = candles.map(
  (candle) => candle.low,
);

const candleCloses = candles.map(
  (candle) => candle.close,
);

const volumes = candles.map(
  (candle) => candle.volume,
);

const sma = calculateSMA(
  closes,
  5,
);

const ema = calculateEMA(
  closes,
  5,
);

const rsi = calculateRSI(
  closes,
  14,
);

const macd = calculateMACD(
  closes,
);

const atr = calculateATR(
  highs,
  lows,
  candleCloses,
  14,
);

const bollingerBands = calculateBollingerBands(
  closes,
  20,
  2,
);

const stochastic = calculateStochastic(
  highs,
  lows,
  candleCloses,
  14,
  3,
);

const vwap = calculateVWAP(
  highs,
  lows,
  candleCloses,
  volumes,
);

console.log("SMA:", sma);
console.log("EMA:", ema);
console.log("RSI:", rsi);
console.log("MACD:", macd);
console.log("ATR:", atr);
console.log("Bollinger Bands:", bollingerBands);
console.log("Stochastic:", stochastic);
console.log("VWAP:", vwap);

if (sma.length === 0) {
  throw new Error(
    "SMA calculation returned no results.",
  );
}

if (ema.length === 0) {
  throw new Error(
    "EMA calculation returned no results.",
  );
}

if (rsi.length === 0) {
  throw new Error(
    "RSI calculation returned no results.",
  );
}

if (macd.length === 0) {
  throw new Error(
    "MACD calculation returned no results.",
  );
}

if (atr.length === 0) {
  throw new Error(
    "ATR calculation returned no results.",
  );
}

if (
  atr.some((value) => !Number.isFinite(value))
) {
  throw new Error(
    "ATR calculation returned a non-finite value.",
  );
}

if (bollingerBands.length === 0) {
  throw new Error(
    "Bollinger Bands calculation returned no results.",
  );
}

for (const bands of bollingerBands) {
  if (
    !Number.isFinite(bands.upper) ||
    !Number.isFinite(bands.middle) ||
    !Number.isFinite(bands.lower) ||
    !Number.isFinite(bands.bandwidth) ||
    !Number.isFinite(bands.percentB)
  ) {
    throw new Error(
      "Bollinger Bands calculation returned a non-finite value.",
    );
  }

  if (bands.upper < bands.middle) {
    throw new Error(
      "Bollinger Bands upper band is below the middle band.",
    );
  }

  if (bands.middle < bands.lower) {
    throw new Error(
      "Bollinger Bands middle band is below the lower band.",
    );
  }
}

const expectedBollingerResultCount =
  closes.length - 20 + 1;

if (
  bollingerBands.length !==
  expectedBollingerResultCount
) {
  throw new Error(
    `Expected ${expectedBollingerResultCount} Bollinger Bands results, but received ${bollingerBands.length}.`,
  );
}

if (stochastic.length === 0) {
  throw new Error(
    "Stochastic calculation returned no results.",
  );
}

for (const value of stochastic) {
  if (
    !Number.isFinite(value.k) ||
    !Number.isFinite(value.d)
  ) {
    throw new Error(
      "Stochastic calculation returned a non-finite value.",
    );
  }

  if (value.k < 0 || value.k > 100) {
    throw new Error(
      `Stochastic %K value is outside the expected 0-100 range: ${value.k}.`,
    );
  }

  if (value.d < 0 || value.d > 100) {
    throw new Error(
      `Stochastic %D value is outside the expected 0-100 range: ${value.d}.`,
    );
  }
}

if (vwap.length === 0) {
  throw new Error(
    "VWAP calculation returned no results.",
  );
}

if (vwap.length !== candles.length) {
  throw new Error(
    `Expected ${candles.length} VWAP results, but received ${vwap.length}.`,
  );
}

if (
  vwap.some((value) => !Number.isFinite(value))
) {
  throw new Error(
    "VWAP calculation returned a non-finite value.",
  );
}

for (let index = 0; index < vwap.length; index += 1) {
  const pricesUntilIndex = candles
    .slice(0, index + 1)
    .flatMap((candle) => [
      candle.high,
      candle.low,
      candle.close,
    ]);

  const minimumPrice = Math.min(
    ...pricesUntilIndex,
  );

  const maximumPrice = Math.max(
    ...pricesUntilIndex,
  );

  if (
    vwap[index] < minimumPrice ||
    vwap[index] > maximumPrice
  ) {
    throw new Error(
      `VWAP value at index ${index} is outside the cumulative price range.`,
    );
  }
}

console.log(
  "All indicator tests passed successfully.",
);