import assert from "node:assert/strict";

import {
  DeterministicExecutionRuntime,
  ExecutionEngine,
} from "./execution";

import {
  DeterministicPositionRuntime,
  PortfolioManager,
  PositionManager,
} from "./portfolio";

import type {
  ApprovedTrade,
} from "./risk";

function createApprovedTrade(
  overrides:
    Partial<ApprovedTrade> = {},
): ApprovedTrade {
  return {
    signalId:
      "BACKTEST-SIGNAL-1",
    strategyId:
      "deterministic-test",
    symbol:
      "BTCUSDT",
    timeframe:
      "1m",
    side:
      "BUY",
    entryPrice:
      100,
    stopLossPrice:
      95,
    quantity:
      10,
    leverage:
      2,
    positionNotional:
      1_000,
    marginRequired:
      500,
    riskAmount:
      50,
    riskPerUnit:
      5,
    accountRiskAfterTrade:
      50,
    approvedAt:
      1_000,
    metadata: {},
    ...overrides,
  };
}

function createInfrastructure(): {
  readonly executionRuntime:
    DeterministicExecutionRuntime;

  readonly positionRuntime:
    DeterministicPositionRuntime;

  readonly executionEngine:
    ExecutionEngine;

  readonly portfolioManager:
    PortfolioManager;
} {
  const executionRuntime =
    new DeterministicExecutionRuntime({
      initialTimestamp: 0,
      orderIdPrefix:
        "TEST-ORDER",
      fillIdPrefix:
        "TEST-FILL",
    });

  const positionRuntime =
    new DeterministicPositionRuntime({
      initialTimestamp: 0,
      positionIdPrefix:
        "TEST-POSITION",
      closedTradeIdPrefix:
        "TEST-CLOSED-TRADE",
    });

  const executionEngine =
    new ExecutionEngine(
      {
        slippageRate: 0,
        tradingFeeRate: 0,
      },
      executionRuntime,
    );

  const positionManager =
    new PositionManager(
      positionRuntime,
    );

  const portfolioManager =
    new PortfolioManager(
      {
        initialBalance:
          10_000,
      },
      positionManager,
    );

  return {
    executionRuntime,
    positionRuntime,
    executionEngine,
    portfolioManager,
  };
}

function runSimulation() {
  const {
    executionRuntime,
    positionRuntime,
    executionEngine,
    portfolioManager,
  } = createInfrastructure();

  executionRuntime.advanceTo(
    1_000,
  );

  positionRuntime.advanceTo(
    1_000,
  );

  const buyReport =
    executionEngine.executeMarketOrder({
      trade:
        createApprovedTrade(),
      marketPrice:
        100,
    });

  assert.equal(
    buyReport.accepted,
    true,
  );

  if (
    !buyReport.accepted ||
    buyReport.fill === undefined
  ) {
    throw new Error(
      "Expected deterministic BUY execution.",
    );
  }

  const openUpdate =
    portfolioManager.processExecution(
      buyReport,
    );

  assert.equal(
    buyReport.order.id,
    "TEST-ORDER-1",
  );

  assert.equal(
    buyReport.fill.id,
    "TEST-FILL-1",
  );

  assert.equal(
    buyReport.order.createdAt,
    1_000,
  );

  assert.equal(
    buyReport.order.updatedAt,
    1_000,
  );

  assert.equal(
    buyReport.fill.filledAt,
    1_000,
  );

  assert.equal(
    openUpdate.action,
    "OPENED",
  );

  assert.equal(
    openUpdate.position?.id,
    "TEST-POSITION-1",
  );

  assert.equal(
    openUpdate.position?.openedAt,
    1_000,
  );

  positionRuntime.advanceTo(
    1_500,
  );

  const markedPosition =
    portfolioManager.updateMarketPrice(
      "BTCUSDT",
      110,
    );

  assert.equal(
    markedPosition.updatedAt,
    1_500,
  );

  assert.equal(
    markedPosition.unrealizedPnl,
    100,
  );

  executionRuntime.advanceTo(
    2_000,
  );

  positionRuntime.advanceTo(
    2_000,
  );

  const sellReport =
    executionEngine.executeMarketOrder({
      trade:
        createApprovedTrade({
          signalId:
            "BACKTEST-SIGNAL-2",
          side:
            "SELL",
          entryPrice:
            110,
          stopLossPrice:
            115,
          approvedAt:
            2_000,
        }),
      marketPrice:
        110,
    });

  assert.equal(
    sellReport.accepted,
    true,
  );

  if (
    !sellReport.accepted ||
    sellReport.fill === undefined
  ) {
    throw new Error(
      "Expected deterministic SELL execution.",
    );
  }

  const closeUpdate =
    portfolioManager.processExecution(
      sellReport,
    );

  assert.equal(
    sellReport.order.id,
    "TEST-ORDER-2",
  );

  assert.equal(
    sellReport.fill.id,
    "TEST-FILL-2",
  );

  assert.equal(
    sellReport.fill.filledAt,
    2_000,
  );

  assert.equal(
    closeUpdate.action,
    "CLOSED",
  );

  assert.equal(
    closeUpdate.closedTrade?.id,
    "TEST-CLOSED-TRADE-1",
  );

  assert.equal(
    closeUpdate.closedTrade?.closedAt,
    2_000,
  );

  assert.equal(
    closeUpdate.grossRealizedPnl,
    100,
  );

  const snapshot =
    portfolioManager.getSnapshot();

  assert.equal(
    snapshot.realizedPnl,
    100,
  );

  assert.equal(
    snapshot.openPositionCount,
    0,
  );

  assert.equal(
    snapshot.closedTradeCount,
    1,
  );

  return {
    buyReport,
    openUpdate,
    markedPosition,
    sellReport,
    closeUpdate,
    snapshot,
  };
}

function testIdenticalRuns(): void {
  assert.deepEqual(
    runSimulation(),
    runSimulation(),
  );
}

function testResetReproducibility(): void {
  const {
    executionRuntime,
    positionRuntime,
    executionEngine,
    portfolioManager,
  } = createInfrastructure();

  function executeOpeningTrade() {
    executionRuntime.advanceTo(
      1_000,
    );

    positionRuntime.advanceTo(
      1_000,
    );

    const report =
      executionEngine.executeMarketOrder({
        trade:
          createApprovedTrade(),
        marketPrice:
          100,
      });

    if (
      !report.accepted ||
      report.fill === undefined
    ) {
      throw new Error(
        "Expected opening execution.",
      );
    }

    const update =
      portfolioManager.processExecution(
        report,
      );

    return {
      report,
      update,
    };
  }

  const first =
    executeOpeningTrade();

  executionEngine.clear();
  portfolioManager.clear();

  const second =
    executeOpeningTrade();

  assert.deepEqual(
    second,
    first,
  );

  assert.equal(
    second.report.order.id,
    "TEST-ORDER-1",
  );

  assert.equal(
    second.report.fill?.id,
    "TEST-FILL-1",
  );

  assert.equal(
    second.update.position?.id,
    "TEST-POSITION-1",
  );
}

function testBackwardTimeRejected(): void {
  const executionRuntime =
    new DeterministicExecutionRuntime({
      initialTimestamp:
        1_000,
    });

  const positionRuntime =
    new DeterministicPositionRuntime({
      initialTimestamp:
        1_000,
    });

  assert.throws(
    () =>
      executionRuntime.advanceTo(
        999,
      ),
    /cannot move backwards/,
  );

  assert.throws(
    () =>
      positionRuntime.advanceTo(
        999,
      ),
    /cannot move backwards/,
  );
}

function run(): void {
  testIdenticalRuns();
  testResetReproducibility();
  testBackwardTimeRejected();

  console.log(
    "All deterministic execution infrastructure tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Deterministic execution infrastructure tests failed.",
  );

  if (error instanceof Error) {
    console.error(
      error.stack,
    );
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}