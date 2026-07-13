import {
  RiskManager,
} from "./risk";

import type {
  TradeSignal,
} from "./signals";

function createSignal(
  overrides: Partial<TradeSignal> = {},
): TradeSignal {
  return {
    id: "signal-1",
    strategyId: "ema-crossover",
    symbol: "BTCUSDT",
    timeframe: "1m",
    action: "BUY",
    confidence: 0.8,
    reason:
      "Fast EMA crossed above slow EMA.",
    price: 100,
    candleTimestamp: 1_000,
    generatedAt: Date.now(),
    metadata: {},
    ...overrides,
  };
}

const manager = new RiskManager({
  riskPerTrade: 0.01,
  maximumAccountRisk: 0.05,
  maximumLeverage: 3,
  maximumPositionNotional: 10_000,
  minimumPositionNotional: 5,
  minimumQuantity: 0.001,
  quantityStep: 0.001,
});

const approvedDecision =
  manager.evaluate({
    signal: createSignal(),
    account: {
      balance: 10_000,
      availableEquity: 10_000,
      openRisk: 0,
    },
    stopLossPrice: 95,
    leverage: 2,
  });

console.log(
  "Approved risk decision:",
  approvedDecision,
);

if (
  !approvedDecision.approved ||
  !approvedDecision.trade
) {
  throw new Error(
    "Expected the risk manager to approve the trade.",
  );
}

if (
  approvedDecision.trade.quantity !== 20
) {
  throw new Error(
    `Expected quantity 20, received ${approvedDecision.trade.quantity}.`,
  );
}

if (
  approvedDecision.trade.riskAmount !==
  100
) {
  throw new Error(
    `Expected risk amount 100, received ${approvedDecision.trade.riskAmount}.`,
  );
}

if (
  approvedDecision.trade.positionNotional !==
  2_000
) {
  throw new Error(
    "Unexpected position notional.",
  );
}

if (
  approvedDecision.trade.marginRequired !==
  1_000
) {
  throw new Error(
    "Unexpected margin requirement.",
  );
}

const invalidBuyStopDecision =
  manager.evaluate({
    signal: createSignal(),
    account: {
      balance: 10_000,
      availableEquity: 10_000,
      openRisk: 0,
    },
    stopLossPrice: 105,
  });

console.log(
  "Invalid BUY stop decision:",
  invalidBuyStopDecision,
);

if (invalidBuyStopDecision.approved) {
  throw new Error(
    "BUY trades with a stop above entry must be rejected.",
  );
}

const invalidSellStopDecision =
  manager.evaluate({
    signal: createSignal({
      id: "signal-2",
      action: "SELL",
    }),
    account: {
      balance: 10_000,
      availableEquity: 10_000,
      openRisk: 0,
    },
    stopLossPrice: 95,
  });

console.log(
  "Invalid SELL stop decision:",
  invalidSellStopDecision,
);

if (invalidSellStopDecision.approved) {
  throw new Error(
    "SELL trades with a stop below entry must be rejected.",
  );
}

const maximumRiskDecision =
  manager.evaluate({
    signal: createSignal({
      id: "signal-3",
    }),
    account: {
      balance: 10_000,
      availableEquity: 10_000,
      openRisk: 500,
    },
    stopLossPrice: 95,
  });

console.log(
  "Maximum-risk decision:",
  maximumRiskDecision,
);

if (maximumRiskDecision.approved) {
  throw new Error(
    "Trades must be rejected when no account risk capacity remains.",
  );
}

const excessiveLeverageDecision =
  manager.evaluate({
    signal: createSignal({
      id: "signal-4",
    }),
    account: {
      balance: 10_000,
      availableEquity: 10_000,
      openRisk: 0,
    },
    stopLossPrice: 95,
    leverage: 5,
  });

console.log(
  "Excessive-leverage decision:",
  excessiveLeverageDecision,
);

if (excessiveLeverageDecision.approved) {
  throw new Error(
    "Excessive leverage must be rejected.",
  );
}

const insufficientEquityDecision =
  manager.evaluate({
    signal: createSignal({
      id: "signal-5",
      price: 1_000,
    }),
    account: {
      balance: 10_000,
      availableEquity: 100,
      openRisk: 0,
    },
    stopLossPrice: 995,
    leverage: 1,
  });

console.log(
  "Insufficient-equity decision:",
  insufficientEquityDecision,
);

if (insufficientEquityDecision.approved) {
  throw new Error(
    "Trades requiring more margin than available equity must be rejected.",
  );
}

const sellApprovedDecision =
  manager.evaluate({
    signal: createSignal({
      id: "signal-6",
      action: "SELL",
      price: 100,
    }),
    account: {
      balance: 10_000,
      availableEquity: 10_000,
      openRisk: 0,
    },
    stopLossPrice: 105,
    leverage: 2,
  });

console.log(
  "Approved SELL decision:",
  sellApprovedDecision,
);

if (
  !sellApprovedDecision.approved ||
  sellApprovedDecision.trade?.side !==
    "SELL"
) {
  throw new Error(
    "Expected a valid SELL trade to be approved.",
  );
}

let invalidBalanceRejected = false;

try {
  manager.evaluate({
    signal: createSignal({
      id: "signal-7",
    }),
    account: {
      balance: 0,
      availableEquity: 0,
      openRisk: 0,
    },
    stopLossPrice: 95,
  });
} catch {
  invalidBalanceRejected = true;
}

if (!invalidBalanceRejected) {
  throw new Error(
    "Invalid account balances must be rejected.",
  );
}

console.log(
  "All risk tests passed successfully.",
);