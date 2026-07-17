import assert from "node:assert/strict";

import {
  DeterministicMultiExchangeCoordinatorClock,
} from "./multi-exchange-coordination/coordinator-clock";
import type {
  CoordinatorCapability,
  CoordinatorExchangeCandidate,
  CoordinatorExchangeCapabilities,
  CoordinatorExchangeHealth,
  CoordinatorMarketType,
  CoordinatorOrderType,
  CoordinatorSymbolReference,
  CoordinatorTimeInForce,
  MultiExchangeCoordinatorOrderRequest,
} from "./multi-exchange-coordination/coordinator-contracts";
import {
  CoordinatorExchangeAllocationPolicy,
} from "./multi-exchange-coordination/exchange-allocation-policy";
import {
  CoordinatorExchangeCapabilityMatcher,
} from "./multi-exchange-coordination/exchange-capability-matcher";
import {
  CoordinatorExchangeCandidateBuilder,
  InMemoryCoordinatorExchangeDescriptorRegistry,
  type CoordinatorExchangeDescriptor,
} from "./multi-exchange-coordination/exchange-candidate-builder";
import {
  CoordinatorExchangeCandidateRanker,
} from "./multi-exchange-coordination/exchange-candidate-ranker";
import {
  CoordinatorExchangeExecutionPlanBuilder,
  DeterministicCoordinatorExecutionPlanIdGenerator,
} from "./multi-exchange-coordination/exchange-execution-plan";
import {
  CoordinatorExchangeSelectionPolicy,
} from "./multi-exchange-coordination/exchange-selection-policy";
import {
  CoordinatorSymbolCompatibilityMatcher,
  InMemoryCoordinatorSymbolCompatibilityRegistry,
} from "./multi-exchange-coordination/symbol-compatibility";

const REQUEST_ID = "coord-request-001";
const OBSERVED_AT = 1_000_000;

const DEFAULT_CAPABILITIES = Object.freeze([
  "SPOT_TRADING",
  "MARKET_ORDER",
  "LIMIT_ORDER",
  "STOP_ORDER",
  "STOP_LIMIT_ORDER",
  "POST_ONLY_ORDER",
  "CLIENT_ORDER_ID",
  "REPLACE_ORDER",
] as const satisfies readonly CoordinatorCapability[]);

const DEFAULT_MARKET_TYPES = Object.freeze([
  "SPOT",
] as const satisfies readonly CoordinatorMarketType[]);

const DEFAULT_ORDER_TYPES = Object.freeze([
  "MARKET",
  "LIMIT",
  "STOP",
  "STOP_LIMIT",
] as const satisfies readonly CoordinatorOrderType[]);

const DEFAULT_TIME_IN_FORCE = Object.freeze([
  "GTC",
  "IOC",
  "FOK",
] as const satisfies readonly CoordinatorTimeInForce[]);

function createRequest(
  overrides: Partial<MultiExchangeCoordinatorOrderRequest> = {},
): MultiExchangeCoordinatorOrderRequest {
  const request: MultiExchangeCoordinatorOrderRequest = {
    requestId: REQUEST_ID,
    correlationId: "correlation-001",
    causationId: null,
    executionMode: "SINGLE",
    accountId: "primary-account",
    symbol: "BTC-USDT",
    marketType: "SPOT",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 3,
    price: 50_000,
    stopPrice: null,
    timeInForce: "GTC",
    reduceOnly: false,
    postOnly: false,
    preferredExchangeId: null,
    eligibleExchangeIds: null,
    excludedExchangeIds: Object.freeze([]),
    clientOrderId: "client-order-001",
    createdAt: OBSERVED_AT,
    expiresAt: null,
    metadata: Object.freeze({}),
    ...overrides,
  };

  return Object.freeze(request);
}

function createCapabilities(
  exchangeId: string,
  overrides: Partial<CoordinatorExchangeCapabilities> = {},
): CoordinatorExchangeCapabilities {
  const capabilities: CoordinatorExchangeCapabilities = {
    exchangeId,
    capabilities: DEFAULT_CAPABILITIES,
    marketTypes: DEFAULT_MARKET_TYPES,
    supportedOrderTypes: DEFAULT_ORDER_TYPES,
    supportedTimeInForce: DEFAULT_TIME_IN_FORCE,
    supportsReduceOnly: false,
    supportsPostOnly: true,
    supportsClientOrderId: true,
    supportsOrderReplacement: true,
    ...overrides,
  };

  return Object.freeze(capabilities);
}

function createHealth(
  exchangeId: string,
  latencyMilliseconds: number,
  overrides: Partial<CoordinatorExchangeHealth> = {},
): CoordinatorExchangeHealth {
  const health: CoordinatorExchangeHealth = {
    exchangeId,
    status: "HEALTHY",
    availability: "AVAILABLE",
    observedAt: OBSERVED_AT,
    lastSuccessfulRequestAt: OBSERVED_AT,
    lastFailedRequestAt: null,
    consecutiveFailures: 0,
    latencyMilliseconds,
    errorRate: 0,
    reason: null,
    ...overrides,
  };

  return Object.freeze(health);
}

function createSymbol(
  exchangeSymbol: string,
): CoordinatorSymbolReference {
  return Object.freeze({
    requestedSymbol: "BTC-USDT",
    normalizedSymbol: "BTC-USDT",
    exchangeSymbol,
  });
}

function createCandidate(
  exchangeId: string,
  options: {
    readonly priority: number;
    readonly weight: number;
    readonly preferred: boolean;
    readonly latencyMilliseconds: number;
  },
): CoordinatorExchangeCandidate {
  const candidate: CoordinatorExchangeCandidate = {
    exchangeId,
    accountId: `${exchangeId.toLowerCase()}-account`,
    priority: options.priority,
    weight: options.weight,
    preferred: options.preferred,
    capabilities: createCapabilities(exchangeId),
    health: createHealth(
      exchangeId,
      options.latencyMilliseconds,
    ),
    symbol: createSymbol(
      exchangeId === "OKX"
        ? "BTC-USDT"
        : "BTCUSDT",
    ),
    selectionScore: 0,
    selectionReasons: Object.freeze([]),
  };

  return Object.freeze(candidate);
}

function createDescriptor(
  candidate: CoordinatorExchangeCandidate,
): CoordinatorExchangeDescriptor {
  const {
    symbol: _symbol,
    ...descriptor
  } = candidate;

  return Object.freeze(descriptor);
}

function testCapabilityMatching(): void {
  const matcher =
    new CoordinatorExchangeCapabilityMatcher();

  const request = createRequest();

  const matchingResult = matcher.match(
    request,
    createCapabilities("BINANCE"),
  );

  assert.equal(matchingResult.matched, true);
  assert.equal(
    matchingResult.missingCapabilities.length,
    0,
  );
  assert.equal(
    matchingResult.mismatches.length,
    0,
  );

  assert.deepEqual(
    matchingResult.requiredCapabilities,
    [
      "LIMIT_ORDER",
      "SPOT_TRADING",
      "CLIENT_ORDER_ID",
    ],
  );

  const limitedCapabilities = Object.freeze([
    "SPOT_TRADING",
    "LIMIT_ORDER",
    "CLIENT_ORDER_ID",
  ] as const satisfies readonly CoordinatorCapability[]);

  const incompatibleResult = matcher.match(
    createRequest({
      postOnly: true,
    }),
    createCapabilities("LIMITED", {
      capabilities: limitedCapabilities,
      supportsPostOnly: false,
    }),
  );

  assert.equal(
    incompatibleResult.matched,
    false,
  );

  assert.equal(
    incompatibleResult.mismatches.some(
      (mismatch) =>
        mismatch.code ===
        "POST_ONLY_UNSUPPORTED",
    ),
    true,
  );

  assert.equal(
    incompatibleResult.missingCapabilities.includes(
      "POST_ONLY_ORDER",
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(matchingResult),
    true,
  );

  assert.equal(
    Object.isFrozen(
      matchingResult.requiredCapabilities,
    ),
    true,
  );
}

function testSymbolCompatibility(): void {
  const registry =
    new InMemoryCoordinatorSymbolCompatibilityRegistry([
      {
        exchangeId: "BINANCE",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTCUSDT",
        supported: true,
      },
      {
        exchangeId: "OKX",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTC-USDT",
        supported: true,
      },
      {
        exchangeId: "UNSUPPORTED",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTC-USDT",
        supported: false,
      },
    ]);

  const matcher =
    new CoordinatorSymbolCompatibilityMatcher(
      registry,
    );

  const binanceResult = matcher.match(
    createRequest(),
    "BINANCE",
  );

  assert.equal(
    binanceResult.compatible,
    true,
  );

  assert.equal(
    binanceResult.status,
    "COMPATIBLE",
  );

  assert.equal(
    binanceResult.symbol?.exchangeSymbol,
    "BTCUSDT",
  );

  const missingResult = matcher.match(
    createRequest(),
    "BYBIT",
  );

  assert.equal(
    missingResult.compatible,
    false,
  );

  assert.equal(
    missingResult.status,
    "UNSUPPORTED",
  );

  const unsupportedResult = matcher.match(
    createRequest(),
    "UNSUPPORTED",
  );

  assert.equal(
    unsupportedResult.compatible,
    false,
  );

  assert.equal(
    registry.unregister(
      "UNSUPPORTED",
      "BTC-USDT",
    ),
    true,
  );

  assert.equal(
    registry.resolve(
      "UNSUPPORTED",
      "BTC-USDT",
    ),
    null,
  );
}

function createPhaseTwoDependencies(): {
  readonly builder:
    CoordinatorExchangeCandidateBuilder;
  readonly ranker:
    CoordinatorExchangeCandidateRanker;
  readonly selectionPolicy:
    CoordinatorExchangeSelectionPolicy;
} {
  const binance = createCandidate("BINANCE", {
    priority: 1,
    weight: 70,
    preferred: true,
    latencyMilliseconds: 35,
  });

  const okx = createCandidate("OKX", {
    priority: 2,
    weight: 30,
    preferred: false,
    latencyMilliseconds: 55,
  });

  const bybit = createCandidate("BYBIT", {
    priority: 3,
    weight: 20,
    preferred: false,
    latencyMilliseconds: 80,
  });

  const unavailable = createCandidate(
    "UNAVAILABLE",
    {
      priority: 4,
      weight: 10,
      preferred: false,
      latencyMilliseconds: 100,
    },
  );

  const descriptorRegistry =
    new InMemoryCoordinatorExchangeDescriptorRegistry([
      createDescriptor(binance),
      createDescriptor(okx),
      createDescriptor(bybit),
      Object.freeze({
        ...createDescriptor(unavailable),
        health: createHealth(
          "UNAVAILABLE",
          100,
          {
            status: "UNHEALTHY",
            availability: "UNAVAILABLE",
          },
        ),
      }),
    ]);

  const symbolRegistry =
    new InMemoryCoordinatorSymbolCompatibilityRegistry([
      {
        exchangeId: "BINANCE",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTCUSDT",
        supported: true,
      },
      {
        exchangeId: "OKX",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTC-USDT",
        supported: true,
      },
      {
        exchangeId: "BYBIT",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTCUSDT",
        supported: true,
      },
      {
        exchangeId: "UNAVAILABLE",
        requestedSymbol: "BTC-USDT",
        normalizedSymbol: "BTC-USDT",
        exchangeSymbol: "BTCUSDT",
        supported: true,
      },
    ]);

  const capabilityMatcher =
    new CoordinatorExchangeCapabilityMatcher();

  const symbolMatcher =
    new CoordinatorSymbolCompatibilityMatcher(
      symbolRegistry,
    );

  const builder =
    new CoordinatorExchangeCandidateBuilder(
      descriptorRegistry,
      capabilityMatcher,
      symbolMatcher,
    );

  const ranker =
    new CoordinatorExchangeCandidateRanker();

  const selectionPolicy =
    new CoordinatorExchangeSelectionPolicy(
      builder,
      ranker,
    );

  return {
    builder,
    ranker,
    selectionPolicy,
  };
}

function testCandidateBuildingAndRanking(): void {
  const {
    builder,
    ranker,
  } = createPhaseTwoDependencies();

  const buildResult = builder.build(
    createRequest(),
  );

  assert.equal(
    buildResult.candidates.length,
    3,
  );

  assert.equal(
    buildResult.rejections.length,
    1,
  );

  assert.equal(
    buildResult.rejections[0]?.exchangeId,
    "UNAVAILABLE",
  );

  assert.equal(
    buildResult.rejections[0]?.reasons.some(
      (reason) =>
        reason.includes("not healthy"),
    ),
    true,
  );

  const ranking = ranker.rank(
    buildResult.candidates,
  );

  assert.deepEqual(
    ranking.map(
      (rankedCandidate) =>
        rankedCandidate.candidate.exchangeId,
    ),
    ["BINANCE", "OKX", "BYBIT"],
  );

  assert.deepEqual(
    ranking.map(
      (rankedCandidate) =>
        rankedCandidate.rank,
    ),
    [1, 2, 3],
  );

  assert.equal(
    ranking[0]!.score.totalScore >
      ranking[1]!.score.totalScore,
    true,
  );

  assert.equal(
    Object.isFrozen(ranking),
    true,
  );

  assert.equal(
    Object.isFrozen(ranking[0]),
    true,
  );
}

function testSelectionPolicy(): void {
  const {
    selectionPolicy,
  } = createPhaseTwoDependencies();

  const result = selectionPolicy.select(
    createRequest(),
    {
      maximumSelectedExchanges: 2,
      minimumRequiredExchanges: 2,
    },
  );

  assert.equal(
    result.status,
    "SELECTED",
  );

  assert.equal(
    result.selected.length,
    2,
  );

  assert.deepEqual(
    result.selected.map(
      (selected) => selected.exchangeId,
    ),
    ["BINANCE", "OKX"],
  );

  assert.deepEqual(
    result.selected.map(
      (selected) =>
        selected.selectionIndex,
    ),
    [0, 1],
  );

  const primary =
    selectionPolicy.selectPrimary(
      createRequest(),
    );

  assert.equal(
    primary?.exchangeId,
    "BINANCE",
  );

  const excludedResult =
    selectionPolicy.select(
      createRequest(),
      {
        excludedExchangeIds: Object.freeze([
          "BINANCE",
          "OKX",
          "BYBIT",
        ]),
      },
    );

  assert.equal(
    excludedResult.status,
    "NO_COMPATIBLE_EXCHANGE",
  );

  assert.equal(
    excludedResult.selected.length,
    0,
  );

  const insufficientResult =
    selectionPolicy.select(
      createRequest(),
      {
        allowedExchangeIds:
          Object.freeze(["BINANCE"]),
        maximumSelectedExchanges: 2,
        minimumRequiredExchanges: 2,
      },
    );

  assert.equal(
    insufficientResult.status,
    "SELECTION_LIMIT_REACHED",
  );

  assert.equal(
    insufficientResult.selected.length,
    1,
  );
}

function testAllocationPolicy(): void {
  const {
    selectionPolicy,
  } = createPhaseTwoDependencies();

  const request = createRequest({
    quantity: 10,
  });

  const selection =
    selectionPolicy.select(
      request,
      {
        maximumSelectedExchanges: 2,
        minimumRequiredExchanges: 2,
      },
    );

  const allocationPolicy =
    new CoordinatorExchangeAllocationPolicy();

  const primaryOnly =
    allocationPolicy.allocate(
      request,
      selection,
      {
        strategy: "PRIMARY_ONLY",
      },
    );

  assert.equal(
    primaryOnly.status,
    "ALLOCATED",
  );

  assert.equal(
    primaryOnly.allocations.length,
    1,
  );

  assert.equal(
    primaryOnly.allocations[0]?.quantity,
    10,
  );

  assert.equal(
    primaryOnly.allocations[0]?.exchangeId,
    "BINANCE",
  );

  const equalSplit =
    allocationPolicy.allocate(
      request,
      selection,
      {
        strategy: "EQUAL_SPLIT",
        quantityPrecision: 8,
      },
    );

  assert.equal(
    equalSplit.status,
    "ALLOCATED",
  );

  assert.deepEqual(
    equalSplit.allocations.map(
      (allocation) =>
        allocation.quantity,
    ),
    [5, 5],
  );

  const weightedSplit =
    allocationPolicy.allocate(
      request,
      selection,
      {
        strategy: "WEIGHTED_SPLIT",
        quantityPrecision: 8,
      },
    );

  assert.equal(
    weightedSplit.status,
    "ALLOCATED",
  );

  assert.deepEqual(
    weightedSplit.allocations.map(
      (allocation) =>
        allocation.quantity,
    ),
    [7, 3],
  );

  assert.deepEqual(
    weightedSplit.allocations.map(
      (allocation) =>
        allocation.percentage,
    ),
    [70, 30],
  );

  const notAllocated =
    allocationPolicy.allocate(
      request,
      selection,
      {
        strategy: "EQUAL_SPLIT",
        minimumAllocationQuantity: 6,
      },
    );

  assert.equal(
    notAllocated.status,
    "NOT_ALLOCATED",
  );

  assert.equal(
    notAllocated.allocatedQuantity,
    0,
  );

  assert.equal(
    notAllocated.unallocatedQuantity,
    10,
  );
}

function testExecutionPlan(): void {
  const {
    selectionPolicy,
  } = createPhaseTwoDependencies();

  const request = createRequest({
    quantity: 10,
  });

  const selection =
    selectionPolicy.select(
      request,
      {
        maximumSelectedExchanges: 2,
        minimumRequiredExchanges: 2,
      },
    );

  const allocation =
    new CoordinatorExchangeAllocationPolicy().allocate(
      request,
      selection,
      {
        strategy: "WEIGHTED_SPLIT",
      },
    );

  const clock =
    new DeterministicMultiExchangeCoordinatorClock(
      2_000_000,
    );

  const idGenerator =
    new DeterministicCoordinatorExecutionPlanIdGenerator(
      "execution-plan",
    );

  const builder =
    new CoordinatorExchangeExecutionPlanBuilder(
      clock,
      idGenerator,
    );

  const plan = builder.build(
    request,
    selection,
    allocation,
  );

  assert.equal(
    plan.status,
    "READY",
  );

  assert.equal(
    plan.requestId,
    REQUEST_ID,
  );

  assert.equal(
    plan.requestedQuantity,
    10,
  );

  assert.equal(
    plan.plannedQuantity,
    10,
  );

  assert.equal(
    plan.unplannedQuantity,
    0,
  );

  assert.equal(
    plan.createdAt,
    2_000_000,
  );

  assert.equal(
    plan.planId,
    "execution-plan-coord-request-001-000000000001",
  );

  assert.equal(
    plan.instructions.length,
    2,
  );

  assert.deepEqual(
    plan.instructions.map(
      (instruction) =>
        instruction.exchangeId,
    ),
    ["BINANCE", "OKX"],
  );

  assert.deepEqual(
    plan.instructions.map(
      (instruction) =>
        instruction.quantity,
    ),
    [7, 3],
  );

  assert.deepEqual(
    plan.instructions.map(
      (instruction) =>
        instruction.clientOrderId,
    ),
    [
      "coordinated-client-order-001-binance-000",
      "coordinated-client-order-001-okx-001",
    ],
  );

  assert.equal(
    Object.isFrozen(plan),
    true,
  );

  assert.equal(
    Object.isFrozen(plan.instructions),
    true,
  );

  assert.equal(
    Object.isFrozen(plan.instructions[0]),
    true,
  );

  assert.equal(
    idGenerator.getCurrentSequence(),
    1,
  );
}

function run(): void {
  testCapabilityMatching();
  testSymbolCompatibility();
  testCandidateBuildingAndRanking();
  testSelectionPolicy();
  testAllocationPolicy();
  testExecutionPlan();

  console.log(
    "All Multi-Exchange Coordinator Phase 2 deterministic tests passed successfully.",
  );
}

try {
  run();
} catch (error: unknown) {
  console.error(
    "Multi-Exchange Coordinator Phase 2 deterministic tests failed.",
  );

  console.error(error);

  process.exitCode = 1;
}