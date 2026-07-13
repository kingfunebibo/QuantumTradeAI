import {
  SignalEngine,
} from "./signals";

import type {
  StrategyResult,
} from "./strategies";

function createStrategyResult(
  overrides: Partial<StrategyResult> = {},
): StrategyResult {
  return {
    strategyId: "ema-crossover",
    signal: "BUY",
    confidence: 0.8,
    reason:
      "Fast EMA crossed above slow EMA.",
    timestamp: Date.now(),
    metadata: {
      fastPeriod: 3,
      slowPeriod: 5,
    },
    ...overrides,
  };
}

const engine = new SignalEngine({
  minimumConfidence: 0.5,
  duplicateWindowMs: 60_000,
});

const acceptedDecision =
  engine.process({
    strategyResult:
      createStrategyResult(),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 105,
    candleTimestamp: 1_000,
  });

console.log(
  "Accepted decision:",
  acceptedDecision,
);

if (
  !acceptedDecision.accepted ||
  !acceptedDecision.signal
) {
  throw new Error(
    "Expected the BUY signal to be accepted.",
  );
}

if (
  acceptedDecision.signal.action !==
  "BUY"
) {
  throw new Error(
    "Expected an actionable BUY signal.",
  );
}

if (
  acceptedDecision.signal.price !==
  105
) {
  throw new Error(
    "Signal price was not preserved.",
  );
}

if (
  acceptedDecision.signal.symbol !==
  "BTCUSDT"
) {
  throw new Error(
    "Signal symbol was not preserved.",
  );
}

if (
  !acceptedDecision.signal.id.trim()
) {
  throw new Error(
    "Signal ID must not be empty.",
  );
}

const duplicateDecision =
  engine.process({
    strategyResult:
      createStrategyResult(),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 105,
    candleTimestamp: 1_000,
  });

console.log(
  "Duplicate decision:",
  duplicateDecision,
);

if (duplicateDecision.accepted) {
  throw new Error(
    "Duplicate signals must be rejected.",
  );
}

const lowConfidenceDecision =
  engine.process({
    strategyResult:
      createStrategyResult({
        confidence: 0.2,
      }),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 106,
    candleTimestamp: 2_000,
  });

console.log(
  "Low-confidence decision:",
  lowConfidenceDecision,
);

if (lowConfidenceDecision.accepted) {
  throw new Error(
    "Low-confidence signals must be rejected.",
  );
}

const holdDecision =
  engine.process({
    strategyResult:
      createStrategyResult({
        signal: "HOLD",
        confidence: 0,
        reason:
          "No crossover detected.",
      }),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 106,
    candleTimestamp: 3_000,
  });

console.log(
  "HOLD decision:",
  holdDecision,
);

if (holdDecision.accepted) {
  throw new Error(
    "HOLD results must not create trade signals.",
  );
}

const sellDecision =
  engine.process({
    strategyResult:
      createStrategyResult({
        signal: "SELL",
        confidence: 0.9,
        reason:
          "Fast EMA crossed below slow EMA.",
      }),
    symbol: "ETHUSDT",
    timeframe: "5m",
    price: 88,
    candleTimestamp: 4_000,
  });

console.log(
  "SELL decision:",
  sellDecision,
);

if (
  !sellDecision.accepted ||
  sellDecision.signal?.action !==
    "SELL"
) {
  throw new Error(
    "Expected the SELL signal to be accepted.",
  );
}

if (
  engine.getProcessedCount() !== 2
) {
  throw new Error(
    `Expected 2 processed signals, received ${engine.getProcessedCount()}.`,
  );
}

engine.clear();

if (
  engine.getProcessedCount() !== 0
) {
  throw new Error(
    "Signal history should be empty after clearing.",
  );
}

let invalidConfidenceRejected =
  false;

try {
  engine.process({
    strategyResult:
      createStrategyResult({
        confidence: 1.5,
      }),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 100,
    candleTimestamp: 5_000,
  });
} catch {
  invalidConfidenceRejected = true;
}

if (!invalidConfidenceRejected) {
  throw new Error(
    "Invalid confidence values must be rejected.",
  );
}

let invalidPriceRejected = false;

try {
  engine.process({
    strategyResult:
      createStrategyResult(),
    symbol: "BTCUSDT",
    timeframe: "1m",
    price: 0,
    candleTimestamp: 6_000,
  });
} catch {
  invalidPriceRejected = true;
}

if (!invalidPriceRejected) {
  throw new Error(
    "Invalid signal prices must be rejected.",
  );
}

console.log(
  "All signal tests passed successfully.",
);