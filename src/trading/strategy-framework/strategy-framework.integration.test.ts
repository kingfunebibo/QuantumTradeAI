/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * End-to-end deterministic integration test.
 *
 * Run:
 *   npx tsx src/trading/strategy-framework/strategy-framework.integration.test.ts
 */

import {
  EMPTY_STRATEGY_METADATA,
  InMemoryStrategyStateManager,
  StrategyAiAdapter,
  StrategyPerformanceTracker,
  createStrategyContractValidator,
  type StrategyAiProvider,
  type StrategyInstrument,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function run(): Promise<void> {
  const instrument: StrategyInstrument = Object.freeze({
    exchangeId: "binance",
    symbol: "BTCUSDT",
    normalizedSymbol: "BTC/USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    marketType: "SPOT",
    metadata: EMPTY_STRATEGY_METADATA,
  });

  // Contract validator is constructible through the framework barrel.
  const validator = createStrategyContractValidator();
  assert(validator !== undefined, "contract validator must be created");

  // State lifecycle: create -> mutate -> inspect history.
  const stateManager = new InMemoryStrategyStateManager();
  const initialState = stateManager.create({
    strategyInstanceId: "strategy-instance-001",
    timestamp: 1_000,
    values: Object.freeze({
      evaluationCount: 0,
      enabled: true,
    }),
  });

  assert(initialState.version === 0, "initial state version must be zero");

  const updatedState = stateManager.apply({
    strategyInstanceId: "strategy-instance-001",
    timestamp: 2_000,
    update: Object.freeze({
      expectedVersion: 0,
      mutations: Object.freeze([
        Object.freeze({
          operation: "INCREMENT" as const,
          path: "evaluationCount",
          value: 1,
          metadata: EMPTY_STRATEGY_METADATA,
        }),
      ]),
      metadata: EMPTY_STRATEGY_METADATA,
    }),
  });

  assert(updatedState.version === 1, "updated state version must be one");
  assert(
    updatedState.values.evaluationCount === 1,
    "state mutation must be applied",
  );
  assert(
    stateManager.history({
      strategyInstanceId: "strategy-instance-001",
    }).length === 2,
    "state history must retain both snapshots",
  );

  // Performance lifecycle: initialize -> activity -> trade -> equity.
  const performance = new StrategyPerformanceTracker({
    initialEquity: 10_000,
  });

  performance.initialize(
    "integration-strategy",
    "strategy-instance-001",
    1_000,
  );

  performance.recordActivity(
    "integration-strategy",
    "strategy-instance-001",
    {
      evaluations: 1,
      signals: 1,
      orderIntents: 1,
    },
    2_000,
  );

  performance.recordTrade({
    tradeId: "trade-001",
    strategyId: "integration-strategy",
    strategyInstanceId: "strategy-instance-001",
    openedAt: 2_000,
    closedAt: 3_000,
    realizedPnl: 125,
    fees: 5,
  });

  performance.recordEquity({
    strategyId: "integration-strategy",
    strategyInstanceId: "strategy-instance-001",
    timestamp: 3_000,
    equity: 10_120,
    unrealizedPnl: 0,
  });

  const performanceSnapshot = performance.snapshot(
    "integration-strategy",
    "strategy-instance-001",
    3_000,
  );

  assert(
    performanceSnapshot.totalEvaluations === 1,
    "evaluation counter must be tracked",
  );
  assert(
    performanceSnapshot.totalTrades === 1,
    "trade counter must be tracked",
  );
  assert(
    performanceSnapshot.realizedPnl === 120,
    "realized PnL must include fees",
  );

  // AI lifecycle: register provider -> discover model -> infer -> snapshot.
  let currentTime = 5_000;
  const aiAdapter = new StrategyAiAdapter({
    clock: () => currentTime++,
  });

  const provider: StrategyAiProvider = {
    providerId: "deterministic-test-provider",

    listModels: () =>
      Object.freeze([
        Object.freeze({
          providerId: "deterministic-test-provider",
          modelId: "direction-model",
          modelVersion: "1.0.0",
          displayName: "Deterministic Direction Model",
          deterministic: true,
          supportsSeed: true,
          metadata: EMPTY_STRATEGY_METADATA,
        }),
      ]),

    infer: async () =>
      Object.freeze({
        prediction: Object.freeze({
          direction: "LONG",
          score: 0.91,
        }),
        confidence: 0.91,
        featureContributions: Object.freeze({
          momentum: 0.6,
          trend: 0.4,
        }),
        generatedAt: 5_100,
        modelVersion: "1.0.0",
        metadata: EMPTY_STRATEGY_METADATA,
      }),
  };

  aiAdapter.registerProvider(provider);

  const models = await aiAdapter.listModels();
  assert(models.length === 1, "registered AI model must be discoverable");

  const inference = await aiAdapter.infer({
    requestId: "ai-request-001",
    correlationId: "correlation-001",
    providerId: provider.providerId,
    modelId: "direction-model",
    modelVersion: "1.0.0",
    timestamp: 5_000,
    deterministicSeed: "integration-seed",
    input: Object.freeze({
      instrument: Object.freeze({
        ...instrument,
        metadata: Object.freeze({}),
      }),
      features: Object.freeze({
        momentum: 0.8,
        trend: 0.7,
      }),
    }),
    metadata: EMPTY_STRATEGY_METADATA,
  });

  assert(inference.status === "SUCCEEDED", "AI inference must succeed");
  assert(
    inference.inference?.confidence === 0.91,
    "AI confidence must be preserved",
  );
  assert(
    aiAdapter.snapshot().history.length === 1,
    "AI inference history must be recorded",
  );

  // Public export surface smoke check.
  assert(
    Object.isFrozen(EMPTY_STRATEGY_METADATA),
    "shared empty metadata must remain immutable",
  );

  console.log(
    "All professional trading strategy framework integration tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(error);
  throw error;
});