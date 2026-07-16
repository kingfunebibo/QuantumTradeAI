import assert from "node:assert/strict";

import {
  CONNECTOR_SELECTION_POLICY_TYPES,
  ConnectorSelectionPolicyError,
  HealthSelectionPolicy,
  LifecycleSelectionPolicy,
  PreferredSelectionPolicy,
  PrioritySelectionPolicy,
  RegistrationOrderSelectionPolicy,
  WeightedConnectorSelectionPolicy,
  createConnectorSelectionPolicy,
  isConnectorSelectionPolicyType,
  type ConnectorSelectionPolicyErrorCode,
} from "./exchange-connectivity/management/connector-selection-policy";

import {
  createExchangeCapabilityProfile,
} from "./exchange-connectivity/management/exchange-capability-registry";

import {
  createConnectorHealthSnapshot,
  createInitialConnectorLifecycleSnapshot,
  type ConnectorHealthStatus,
  type ConnectorLifecycleState,
} from "./exchange-connectivity/management/connector-lifecycle.types";

import type {
  ExchangeDiscoveryCandidate,
} from "./exchange-connectivity/management/exchange-discovery";

import type {
  ExchangeRegistryEntry,
} from "./exchange-connectivity/management/exchange-registry";

import type {
  UnifiedExchange,
  UnifiedExchangeHealthReport,
  UnifiedExchangeMarketDataApi,
} from "./exchange-connectivity/management/unified-exchange-interface";

class TestUnifiedExchange
  implements UnifiedExchange
{
  public readonly capabilities;

  public readonly marketData:
    UnifiedExchangeMarketDataApi;

  public constructor(
    public readonly exchangeId: string,
  ) {
    this.capabilities =
      createExchangeCapabilityProfile({
        exchangeId,
        marketTypes: ["SPOT"],
        marketData: ["TICKER"],
      });

    this.marketData = {
      getTicker: async () => {
        throw new Error("Not used.");
      },
      getOrderBook: async () => {
        throw new Error("Not used.");
      },
      getCandles: async () => {
        throw new Error("Not used.");
      },
      getInstruments: async () => {
        throw new Error("Not used.");
      },
    };
  }

  public async initialize(): Promise<void> {}

  public async start(): Promise<void> {}

  public async stop(): Promise<void> {}

  public async dispose(): Promise<void> {}

  public async getHealth(): Promise<{
    readonly status: "HEALTHY";
  }> {
    return {
      status: "HEALTHY",
    };
  }

  public async inspectHealth():
    Promise<UnifiedExchangeHealthReport> {
    return Object.freeze({
      exchangeId: this.exchangeId,
      status: "HEALTHY",
      observedAt: 1,
    });
  }
}

function createCandidate(
  exchangeId: string,
  registrationSequence: number,
  options: Readonly<{
    priority?: number;
    preferenceIndex?: number;
    healthStatus?: ConnectorHealthStatus;
    lifecycleState?: ConnectorLifecycleState;
  }> = {},
): ExchangeDiscoveryCandidate<TestUnifiedExchange> {
  const connector =
    new TestUnifiedExchange(exchangeId);

  const registryEntry:
    ExchangeRegistryEntry<TestUnifiedExchange> =
    Object.freeze({
      exchangeId,
      connector,
      metadata: Object.freeze({}),
      registrationSequence,
    });

  const lifecycleSnapshot =
    Object.freeze({
      ...createInitialConnectorLifecycleSnapshot(
        exchangeId,
        1,
      ),
      state:
        options.lifecycleState ??
        "RUNNING",
      health:
        createConnectorHealthSnapshot({
          status:
            options.healthStatus ??
            "HEALTHY",
          observedAt: 2,
        }),
    });

  return Object.freeze({
    exchangeId,
    connector,
    registryEntry,
    capabilityProfile:
      connector.capabilities,
    lifecycleSnapshot,
    priority:
      options.priority ?? 0,
    ...(options.preferenceIndex ===
      undefined
      ? {}
      : {
          preferenceIndex:
            options.preferenceIndex,
        }),
    registrationSequence,
    reasons: Object.freeze([
      "REGISTERED",
      "CAPABILITIES_MATCHED",
      "LIFECYCLE_ELIGIBLE",
      "HEALTH_ELIGIBLE",
    ] as const),
  });
}

function assertPolicyError(
  operation: () => unknown,
  expectedCode:
    ConnectorSelectionPolicyErrorCode,
): ConnectorSelectionPolicyError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof
      ConnectorSelectionPolicyError,
    `Expected ConnectorSelectionPolicyError but received ${
      capturedError instanceof Error
        ? capturedError.constructor.name
        : typeof capturedError
    }.`,
  );

  assert.equal(
    capturedError.code,
    expectedCode,
  );

  return capturedError;
}

function testCanonicalPolicyTypes(): void {
  assert.deepEqual(
    CONNECTOR_SELECTION_POLICY_TYPES,
    [
      "REGISTRATION_ORDER",
      "PRIORITY",
      "PREFERRED",
      "HEALTH",
      "LIFECYCLE",
      "WEIGHTED",
    ],
  );
}

function testPolicyTypeGuard(): void {
  assert.equal(
    isConnectorSelectionPolicyType(
      "PRIORITY",
    ),
    true,
  );

  assert.equal(
    isConnectorSelectionPolicyType(
      "WEIGHTED",
    ),
    true,
  );

  assert.equal(
    isConnectorSelectionPolicyType(
      "RANDOM",
    ),
    false,
  );

  assert.equal(
    isConnectorSelectionPolicyType(
      null,
    ),
    false,
  );
}

function testRegistrationOrderPolicy(): void {
  const policy =
    new RegistrationOrderSelectionPolicy<TestUnifiedExchange>();

  const result =
    policy.evaluate([
      createCandidate(
        "bybit",
        3,
      ),
      createCandidate(
        "okx",
        1,
      ),
      createCandidate(
        "binance",
        2,
      ),
    ]);

  assert.equal(
    result.policyType,
    "REGISTRATION_ORDER",
  );

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  assert.equal(
    result.selectedExchangeId,
    "okx",
  );

  assert.ok(
    Object.isFrozen(result),
  );

  assert.ok(
    Object.isFrozen(
      result.candidates,
    ),
  );

  assert.ok(
    Object.isFrozen(
      result.scores,
    ),
  );
}

function testPriorityPolicy(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  const result =
    policy.evaluate([
      createCandidate(
        "okx",
        1,
        {
          priority: 10,
        },
      ),
      createCandidate(
        "binance",
        2,
        {
          priority: 50,
        },
      ),
      createCandidate(
        "bybit",
        3,
        {
          priority: 50,
        },
      ),
    ]);

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "bybit",
      "okx",
    ],
  );

  assert.deepEqual(
    result.scores.map(
      (score) => [
        score.exchangeId,
        score.totalScore,
      ],
    ),
    [
      [
        "binance",
        50,
      ],
      [
        "bybit",
        50,
      ],
      [
        "okx",
        10,
      ],
    ],
  );
}

function testPreferredPolicy(): void {
  const policy =
    new PreferredSelectionPolicy<TestUnifiedExchange>();

  const result =
    policy.evaluate([
      createCandidate(
        "okx",
        1,
      ),
      createCandidate(
        "binance",
        2,
        {
          preferenceIndex: 1,
        },
      ),
      createCandidate(
        "bybit",
        3,
        {
          preferenceIndex: 0,
        },
      ),
    ]);

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "bybit",
      "binance",
      "okx",
    ],
  );

  assert.equal(
    result.scores[0]
      ?.preferenceScore,
    1_000,
  );

  assert.equal(
    result.scores[1]
      ?.preferenceScore,
    999,
  );

  assert.equal(
    result.scores[2]
      ?.preferenceScore,
    0,
  );
}

function testHealthPolicy(): void {
  const policy =
    new HealthSelectionPolicy<TestUnifiedExchange>();

  const result =
    policy.evaluate([
      createCandidate(
        "okx",
        1,
        {
          healthStatus:
            "DEGRADED",
        },
      ),
      createCandidate(
        "binance",
        2,
        {
          healthStatus:
            "HEALTHY",
        },
      ),
      createCandidate(
        "bybit",
        3,
        {
          healthStatus:
            "UNHEALTHY",
        },
      ),
    ]);

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "okx",
      "bybit",
    ],
  );

  assert.deepEqual(
    result.scores.map(
      (score) =>
        score.healthScore,
    ),
    [
      4,
      3,
      1,
    ],
  );
}

function testLifecyclePolicy(): void {
  const policy =
    new LifecycleSelectionPolicy<TestUnifiedExchange>();

  const result =
    policy.evaluate([
      createCandidate(
        "okx",
        1,
        {
          lifecycleState:
            "DEGRADED",
        },
      ),
      createCandidate(
        "binance",
        2,
        {
          lifecycleState:
            "RUNNING",
        },
      ),
      createCandidate(
        "bybit",
        3,
        {
          lifecycleState:
            "STOPPED",
        },
      ),
    ]);

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "okx",
      "bybit",
    ],
  );

  assert.deepEqual(
    result.scores.map(
      (score) =>
        score.lifecycleScore,
    ),
    [
      10,
      9,
      6,
    ],
  );
}

function testWeightedPolicy(): void {
  const policy =
    new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
      exchangeWeights: [
        {
          exchangeId: "bybit",
          weight: 100,
        },
      ],
      priorityWeight: 2,
      preferenceWeight: 1,
      healthWeight: 10,
      lifecycleWeight: 5,
      registrationWeight: 1,
    });

  const result =
    policy.evaluate([
      createCandidate(
        "okx",
        1,
        {
          priority: 20,
          preferenceIndex: 0,
          healthStatus:
            "HEALTHY",
          lifecycleState:
            "RUNNING",
        },
      ),
      createCandidate(
        "binance",
        2,
        {
          priority: 30,
          healthStatus:
            "HEALTHY",
          lifecycleState:
            "RUNNING",
        },
      ),
      createCandidate(
        "bybit",
        3,
        {
          priority: 0,
          healthStatus:
            "DEGRADED",
          lifecycleState:
            "DEGRADED",
        },
      ),
    ]);

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "bybit",
      "binance",
    ],
  );

  const okxScore =
    result.scores.find(
      (score) =>
        score.exchangeId === "okx",
    );

  const bybitScore =
    result.scores.find(
      (score) =>
        score.exchangeId === "bybit",
    );

  assert.ok(
    okxScore !== undefined,
  );

  assert.ok(
    bybitScore !== undefined,
  );

  assert.equal(
    okxScore.priorityScore,
    40,
  );

  assert.equal(
    okxScore.preferenceScore,
    1_000,
  );

  assert.equal(
    okxScore.healthScore,
    40,
  );

  assert.equal(
    okxScore.lifecycleScore,
    50,
  );

  assert.equal(
    bybitScore.exchangeWeightScore,
    100,
  );

  assert.ok(
    Object.isFrozen(
      result.scores,
    ),
  );

  assert.ok(
    result.scores.every(
      (score) =>
        Object.isFrozen(score),
    ),
  );
}

function testWeightedTieBreaker(): void {
  const policy =
    new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
      priorityWeight: 0,
      preferenceWeight: 0,
      healthWeight: 0,
      lifecycleWeight: 0,
      registrationWeight: 0,
    });

  const result =
    policy.evaluate([
      createCandidate(
        "bybit",
        3,
      ),
      createCandidate(
        "okx",
        1,
      ),
      createCandidate(
        "binance",
        2,
      ),
    ]);

  assert.deepEqual(
    result.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );
}

function testEmptyCandidateList(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  const result =
    policy.evaluate([]);

  assert.deepEqual(
    result.candidates,
    [],
  );

  assert.deepEqual(
    result.scores,
    [],
  );

  assert.equal(
    result.selectedCandidate,
    undefined,
  );

  assert.equal(
    result.selectedExchangeId,
    undefined,
  );
}

function testPolicyFactory(): void {
  assert.ok(
    createConnectorSelectionPolicy<TestUnifiedExchange>(
      "REGISTRATION_ORDER",
    ) instanceof
      RegistrationOrderSelectionPolicy,
  );

  assert.ok(
    createConnectorSelectionPolicy<TestUnifiedExchange>(
      "PRIORITY",
    ) instanceof
      PrioritySelectionPolicy,
  );

  assert.ok(
    createConnectorSelectionPolicy<TestUnifiedExchange>(
      "PREFERRED",
    ) instanceof
      PreferredSelectionPolicy,
  );

  assert.ok(
    createConnectorSelectionPolicy<TestUnifiedExchange>(
      "HEALTH",
    ) instanceof
      HealthSelectionPolicy,
  );

  assert.ok(
    createConnectorSelectionPolicy<TestUnifiedExchange>(
      "LIFECYCLE",
    ) instanceof
      LifecycleSelectionPolicy,
  );

  assert.ok(
    createConnectorSelectionPolicy<TestUnifiedExchange>(
      "WEIGHTED",
      {
        priorityWeight: 2,
      },
    ) instanceof
      WeightedConnectorSelectionPolicy,
  );

  assertPolicyError(
    () =>
      createConnectorSelectionPolicy<TestUnifiedExchange>(
        "RANDOM" as never,
      ),
    "INVALID_POLICY_TYPE",
  );
}

function testInvalidCandidateArray(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  assertPolicyError(
    () =>
      policy.evaluate(
        null as unknown as readonly ExchangeDiscoveryCandidate<TestUnifiedExchange>[],
      ),
    "INVALID_POLICY",
  );
}

function testInvalidCandidateShape(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  assertPolicyError(
    () =>
      policy.evaluate([
        null as never,
      ]),
    "INVALID_CANDIDATE",
  );
}

function testInvalidCandidateExchangeId(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  const candidate =
    createCandidate(
      "okx",
      1,
    );

  const invalidCandidate = {
    ...candidate,
    exchangeId: "",
  } as ExchangeDiscoveryCandidate<TestUnifiedExchange>;

  assertPolicyError(
    () =>
      policy.evaluate([
        invalidCandidate,
      ]),
    "INVALID_EXCHANGE_ID",
  );
}

function testInvalidRegistrationSequence(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  const candidate =
    createCandidate(
      "okx",
      1,
    );

  const invalidCandidate = {
    ...candidate,
    registrationSequence: 0,
  } as ExchangeDiscoveryCandidate<TestUnifiedExchange>;

  assertPolicyError(
    () =>
      policy.evaluate([
        invalidCandidate,
      ]),
    "INVALID_CANDIDATE",
  );
}

function testInvalidPriority(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  const candidate =
    createCandidate(
      "okx",
      1,
    );

  const invalidCandidate = {
    ...candidate,
    priority: Number.NaN,
  } as ExchangeDiscoveryCandidate<TestUnifiedExchange>;

  assertPolicyError(
    () =>
      policy.evaluate([
        invalidCandidate,
      ]),
    "INVALID_CANDIDATE",
  );
}

function testDuplicateCandidates(): void {
  const policy =
    new PrioritySelectionPolicy<TestUnifiedExchange>();

  const first =
    createCandidate(
      "okx",
      1,
    );

  const second =
    createCandidate(
      "okx",
      2,
    );

  const error =
    assertPolicyError(
      () =>
        policy.evaluate([
          first,
          second,
        ]),
      "INVALID_CANDIDATE",
    );

  assert.equal(
    error.exchangeId,
    "okx",
  );
}

function testInvalidWeightValues(): void {
  for (
    const value of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertPolicyError(
      () =>
        new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
          priorityWeight: value,
        }),
      "INVALID_WEIGHT",
    );
  }
}

function testInvalidExchangeWeightArray(): void {
  assertPolicyError(
    () =>
      new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
        exchangeWeights:
          "okx" as unknown as readonly [],
      }),
    "INVALID_POLICY",
  );

  assertPolicyError(
    () =>
      new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
        exchangeWeights: [
          null as never,
        ],
      }),
    "INVALID_POLICY",
  );
}

function testInvalidExchangeWeightId(): void {
  assertPolicyError(
    () =>
      new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
        exchangeWeights: [
          {
            exchangeId: "   ",
            weight: 10,
          },
        ],
      }),
    "INVALID_EXCHANGE_ID",
  );
}

function testDuplicateExchangeWeights(): void {
  const error =
    assertPolicyError(
      () =>
        new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
          exchangeWeights: [
            {
              exchangeId: "OKX",
              weight: 10,
            },
            {
              exchangeId: " okx ",
              weight: 20,
            },
          ],
        }),
      "DUPLICATE_EXCHANGE_WEIGHT",
    );

  assert.equal(
    error.exchangeId,
    "okx",
  );
}

function testInvalidExchangeWeightValue(): void {
  assertPolicyError(
    () =>
      new WeightedConnectorSelectionPolicy<TestUnifiedExchange>({
        exchangeWeights: [
          {
            exchangeId: "okx",
            weight: -1,
          },
        ],
      }),
    "INVALID_WEIGHT",
  );
}

function runConnectorSelectionPolicyTests(): void {
  testCanonicalPolicyTypes();
  testPolicyTypeGuard();
  testRegistrationOrderPolicy();
  testPriorityPolicy();
  testPreferredPolicy();
  testHealthPolicy();
  testLifecyclePolicy();
  testWeightedPolicy();
  testWeightedTieBreaker();
  testEmptyCandidateList();
  testPolicyFactory();
  testInvalidCandidateArray();
  testInvalidCandidateShape();
  testInvalidCandidateExchangeId();
  testInvalidRegistrationSequence();
  testInvalidPriority();
  testDuplicateCandidates();
  testInvalidWeightValues();
  testInvalidExchangeWeightArray();
  testInvalidExchangeWeightId();
  testDuplicateExchangeWeights();
  testInvalidExchangeWeightValue();

  console.log(
    "All deterministic connector selection policy tests passed successfully.",
  );
}

runConnectorSelectionPolicyTests();