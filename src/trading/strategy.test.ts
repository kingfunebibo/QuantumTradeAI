import {
  EmaCrossoverStrategy,
  StrategyRegistry,
} from "./strategies";

import type { Candle } from "./trading.types";

function createCandles(
  closes: number[],
): Candle[] {
  const startTimestamp =
    Date.now() -
    closes.length * 60_000;

  return closes.map(
    (close, index) => ({
      timestamp:
        startTimestamp +
        index * 60_000,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + index,
    }),
  );
}

const registry = new StrategyRegistry();

const strategy =
  new EmaCrossoverStrategy({
    fastPeriod: 3,
    slowPeriod: 5,
  });

registry.register(strategy);

const registeredStrategies =
  registry.list();

console.log(
  "Registered strategies:",
  registeredStrategies,
);

if (registeredStrategies.length !== 1) {
  throw new Error(
    "Expected exactly one registered strategy.",
  );
}

if (!registry.has("ema-crossover")) {
  throw new Error(
    "EMA crossover strategy was not registered.",
  );
}

const insufficientResult =
  registry.evaluate(
    "ema-crossover",
    {
      symbol: "BTCUSDT",
      timeframe: "1m",
      candles: createCandles([
        100,
        101,
        102,
      ]),
    },
  );

console.log(
  "Insufficient-data result:",
  insufficientResult,
);

if (insufficientResult.signal !== "HOLD") {
  throw new Error(
    "Insufficient history must return HOLD.",
  );
}

const bullishCandles = createCandles([
  110,
  108,
  106,
  104,
  102,
  100,
  99,
  98,
  99,
  101,
  90,
  105,
]);

const bullishResult =
  registry.evaluate(
    "ema-crossover",
    {
      symbol: "BTCUSDT",
      timeframe: "1m",
      candles: bullishCandles,
    },
  );

console.log(
  "Bullish evaluation:",
  bullishResult,
);

const bearishCandles = createCandles([
  90,
  92,
  94,
  96,
  98,
  100,
  101,
  102,
  101,
  99,
  99,
  88,
]);

const bearishResult =
  registry.evaluate(
    "ema-crossover",
    {
      symbol: "ETHUSDT",
      timeframe: "1m",
      candles: bearishCandles,
    },
  );

console.log(
  "Bearish evaluation:",
  bearishResult,
);

for (const result of [
  insufficientResult,
  bullishResult,
  bearishResult,
]) {
  if (
    !Number.isFinite(result.confidence) ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    throw new Error(
      "Strategy confidence must be between 0 and 1.",
    );
  }

  if (
    !Number.isFinite(result.timestamp)
  ) {
    throw new Error(
      "Strategy timestamp must be finite.",
    );
  }

  if (!result.reason.trim()) {
    throw new Error(
      "Strategy result must include a reason.",
    );
  }
}

if (bullishResult.signal !== "BUY") {
  throw new Error(
    `Expected BUY signal, received ${bullishResult.signal}.`,
  );
}

if (bearishResult.signal !== "SELL") {
  throw new Error(
    `Expected SELL signal, received ${bearishResult.signal}.`,
  );
}

let duplicateRegistrationRejected =
  false;

try {
  registry.register(strategy);
} catch {
  duplicateRegistrationRejected = true;
}

if (!duplicateRegistrationRejected) {
  throw new Error(
    "Duplicate strategy registration should be rejected.",
  );
}

let unknownStrategyRejected = false;

try {
  registry.evaluate(
    "unknown-strategy",
    {
      symbol: "BTCUSDT",
      timeframe: "1m",
      candles: bullishCandles,
    },
  );
} catch {
  unknownStrategyRejected = true;
}

if (!unknownStrategyRejected) {
  throw new Error(
    "Unknown strategy evaluation should be rejected.",
  );
}

console.log(
  "All strategy tests passed successfully.",
);