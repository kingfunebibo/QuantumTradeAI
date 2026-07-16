import assert from "node:assert/strict";

import {
  AutomaticFailoverError,
  AutomaticFailoverManager,
  calculateCooldownDuration,
  createAutomaticFailoverDecision,
  type AutomaticFailoverClock,
  type AutomaticFailoverErrorCode,
} from "./exchange-connectivity/management/automatic-failover";

import {
  createExchangeCapabilityProfile,
} from "./exchange-connectivity/management/exchange-capability-registry";

import {
  createConnectorHealthSnapshot,
  createInitialConnectorLifecycleSnapshot,
} from "./exchange-connectivity/management/connector-lifecycle.types";

import type {
  ExchangeDiscoveryCandidate,
} from "./exchange-connectivity/management/exchange-discovery";

import type {
  ExchangeRegistryEntry,
} from "./exchange-connectivity/management/exchange-registry";

import type {
  ExchangeRouterAttempt,
} from "./exchange-connectivity/management/exchange-router.types";

import type {
  UnifiedExchange,
  UnifiedExchangeHealthReport,
  UnifiedExchangeMarketDataApi,
} from "./exchange-connectivity/management/unified-exchange-interface";

/**
 * Deterministic mutable clock used by failover tests.
 */
class DeterministicFailoverClock
  implements AutomaticFailoverClock
{
  public constructor(
    private current = 1_000,
  ) {}

  public now(): number {
    return this.current;
  }

  public set(value: number): void {
    this.current = value;
  }

  public advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}

/**
 * Minimal unified exchange test double.
 */
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
      state: "RUNNING" as const,
      health:
        createConnectorHealthSnapshot({
          status: "HEALTHY",
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
    priority: 0,
    registrationSequence,
    reasons: Object.freeze([
      "REGISTERED",
      "CAPABILITIES_MATCHED",
      "LIFECYCLE_ELIGIBLE",
      "HEALTH_ELIGIBLE",
    ] as const),
  });
}

function createAttempt(
  overrides: Partial<ExchangeRouterAttempt> = {},
): ExchangeRouterAttempt {
  return Object.freeze({
    attemptNumber: 1,
    exchangeAttemptNumber: 1,
    exchangeId: "okx",
    operation: "CUSTOM",
    startedAt: 100,
    completedAt: 101,
    outcome: "FAILED",
    retryable: true,
    errorCode: "NETWORK_ERROR",
    errorMessage: "Temporary failure.",
    ...overrides,
  });
}

function assertFailoverError(
  operation: () => unknown,
  expectedCode: AutomaticFailoverErrorCode,
): AutomaticFailoverError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof AutomaticFailoverError,
    `Expected AutomaticFailoverError but received ${
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

function testInitialSnapshot(): void {
  const clock =
    new DeterministicFailoverClock();

  const manager =
    new AutomaticFailoverManager(
      {},
      clock,
    );

  const snapshot =
    manager.inspect(" OKX ");

  assert.deepEqual(
    snapshot,
    {
      exchangeId: "okx",
      state: "AVAILABLE",
      consecutiveFailures: 0,
      totalFailures: 0,
      consecutiveRecoverySuccesses: 0,
      cooldownCycle: 0,
      manuallyDisabled: false,
    },
  );

  assert.ok(
    Object.isFrozen(snapshot),
  );
}

function testFailureThreshold(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 2,
        cooldownMs: 100,
        maximumCooldownMs: 1_000,
      },
      clock,
    );

  const first =
    manager.recordFailure(
      "okx",
      {
        retryable: true,
        errorCode:
          "NETWORK_ERROR",
        errorMessage:
          "Failure one.",
        observedAt: 1_000,
      },
    );

  assert.equal(
    first.enteredCooldown,
    false,
  );

  assert.equal(
    first.currentSnapshot.state,
    "AVAILABLE",
  );

  assert.equal(
    first.currentSnapshot
      .consecutiveFailures,
    1,
  );

  const second =
    manager.recordFailure(
      "okx",
      {
        retryable: true,
        errorCode:
          "TIMEOUT",
        errorMessage:
          "Failure two.",
        observedAt: 1_010,
      },
    );

  assert.equal(
    second.enteredCooldown,
    true,
  );

  assert.equal(
    second.currentSnapshot.state,
    "COOLDOWN",
  );

  assert.equal(
    second.currentSnapshot
      .consecutiveFailures,
    2,
  );

  assert.equal(
    second.currentSnapshot
      .totalFailures,
    2,
  );

  assert.equal(
    second.currentSnapshot
      .cooldownCycle,
    1,
  );

  assert.equal(
    second.currentSnapshot
      .cooldownStartedAt,
    1_010,
  );

  assert.equal(
    second.currentSnapshot
      .cooldownUntil,
    1_110,
  );

  assert.equal(
    second.currentSnapshot
      .lastErrorCode,
    "TIMEOUT",
  );
}

function testCooldownBackoff(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
        cooldownBackoffMultiplier: 2,
        maximumCooldownMs: 250,
        recoverySuccessThreshold: 1,
      },
      clock,
    );

  const first =
    manager.recordFailure(
      "okx",
      {
        observedAt: 1_000,
      },
    );

  assert.equal(
    first.currentSnapshot
      .cooldownUntil,
    1_100,
  );

  clock.set(1_100);

  const recovering =
    manager.inspect("okx");

  assert.equal(
    recovering.state,
    "RECOVERING",
  );

  manager.recordSuccess(
    "okx",
    1_101,
  );

  const second =
    manager.recordFailure(
      "okx",
      {
        observedAt: 1_200,
      },
    );

  assert.equal(
    second.currentSnapshot
      .cooldownCycle,
    2,
  );

  assert.equal(
    second.currentSnapshot
      .cooldownUntil,
    1_400,
  );

  clock.set(1_400);
  manager.inspect("okx");
  manager.recordSuccess(
    "okx",
    1_401,
  );

  const third =
    manager.recordFailure(
      "okx",
      {
        observedAt: 1_500,
      },
    );

  assert.equal(
    third.currentSnapshot
      .cooldownCycle,
    3,
  );

  assert.equal(
    third.currentSnapshot
      .cooldownUntil,
    1_750,
  );
}

function testCooldownTransitionToRecovery(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  assert.equal(
    manager.isAvailable(
      "okx",
      1_050,
    ),
    false,
  );

  assert.equal(
    manager.inspect("okx").state,
    "COOLDOWN",
  );

  clock.set(1_100);

  const recovering =
    manager.inspect("okx");

  assert.equal(
    recovering.state,
    "RECOVERING",
  );

  assert.equal(
    recovering.cooldownUntil,
    undefined,
  );

  assert.equal(
    manager.isAvailable(
      "okx",
      1_100,
    ),
    false,
  );
}

function testRecoveryThreshold(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
        recoverySuccessThreshold: 2,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  manager.beginRecovery(
    "okx",
    1_100,
  );

  const firstSuccess =
    manager.recordSuccess(
      "okx",
      1_101,
    );

  assert.equal(
    firstSuccess.recovered,
    false,
  );

  assert.equal(
    firstSuccess.currentSnapshot.state,
    "RECOVERING",
  );

  assert.equal(
    firstSuccess.currentSnapshot
      .consecutiveRecoverySuccesses,
    1,
  );

  const secondSuccess =
    manager.recordSuccess(
      "okx",
      1_102,
    );

  assert.equal(
    secondSuccess.recovered,
    true,
  );

  assert.equal(
    secondSuccess.currentSnapshot.state,
    "AVAILABLE",
  );

  assert.equal(
    secondSuccess.currentSnapshot
      .consecutiveRecoverySuccesses,
    0,
  );

  assert.equal(
    manager.isAvailable(
      "okx",
      1_102,
    ),
    true,
  );
}

function testFailureDuringRecovery(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
        recoverySuccessThreshold: 2,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  manager.beginRecovery(
    "okx",
    1_100,
  );

  manager.recordSuccess(
    "okx",
    1_101,
  );

  const failure =
    manager.recordFailure(
      "okx",
      {
        observedAt: 1_102,
      },
    );

  assert.equal(
    failure.enteredCooldown,
    true,
  );

  assert.equal(
    failure.currentSnapshot.state,
    "COOLDOWN",
  );

  assert.equal(
    failure.currentSnapshot
      .consecutiveRecoverySuccesses,
    0,
  );
}

function testNonRetryableFailureConfiguration(): void {
  const clock =
    new DeterministicFailoverClock();

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        countNonRetryableFailures: false,
      },
      clock,
    );

  const result =
    manager.recordFailure(
      "okx",
      {
        retryable: false,
        observedAt: 1_000,
      },
    );

  assert.equal(
    result.enteredCooldown,
    false,
  );

  assert.equal(
    result.currentSnapshot.state,
    "AVAILABLE",
  );

  assert.equal(
    result.currentSnapshot
      .consecutiveFailures,
    0,
  );

  assert.equal(
    result.currentSnapshot
      .totalFailures,
    0,
  );
}

function testRouterAttemptRecording(): void {
  const clock =
    new DeterministicFailoverClock();

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
      },
      clock,
    );

  const failed =
    manager.recordAttempt(
      createAttempt(),
    );

  assert.equal(
    failed.enteredCooldown,
    true,
  );

  assert.equal(
    failed.currentSnapshot.state,
    "COOLDOWN",
  );

  manager.beginRecovery(
    "okx",
    200,
  );

  const succeeded =
    manager.recordAttempt(
      createAttempt({
        completedAt: 201,
        outcome: "SUCCEEDED",
        retryable: false,
        errorCode: undefined,
        errorMessage: undefined,
      }),
    );

  assert.equal(
    succeeded.recovered,
    true,
  );

  assert.equal(
    succeeded.currentSnapshot.state,
    "AVAILABLE",
  );

  const skipped =
    manager.recordAttempt(
      createAttempt({
        exchangeId: "binance",
        outcome: "SKIPPED",
        completedAt: 300,
        retryable: false,
        skipReason: "NOT_SELECTED",
      }),
    );

  assert.equal(
    skipped.currentSnapshot.state,
    "AVAILABLE",
  );

  assert.equal(
    skipped.currentSnapshot
      .totalFailures,
    0,
  );
}

function testManualDisableAndEnable(): void {
  const clock =
    new DeterministicFailoverClock();

  const manager =
    new AutomaticFailoverManager(
      {},
      clock,
    );

  const disabled =
    manager.disable("OKX");

  assert.equal(
    disabled.state,
    "DISABLED",
  );

  assert.equal(
    disabled.manuallyDisabled,
    true,
  );

  assert.equal(
    manager.isAvailable(
      "okx",
      1_000,
    ),
    false,
  );

  assertFailoverError(
    () =>
      manager.recordFailure(
        "okx",
        {
          observedAt: 1_001,
        },
      ),
    "EXCHANGE_DISABLED",
  );

  assertFailoverError(
    () =>
      manager.recordSuccess(
        "okx",
        1_001,
      ),
    "EXCHANGE_DISABLED",
  );

  assertFailoverError(
    () =>
      manager.beginRecovery(
        "okx",
        1_001,
      ),
    "EXCHANGE_DISABLED",
  );

  const enabled =
    manager.enable("okx");

  assert.equal(
    enabled.state,
    "AVAILABLE",
  );

  assert.equal(
    enabled.manuallyDisabled,
    false,
  );

  assert.equal(
    manager.isAvailable(
      "okx",
      1_001,
    ),
    true,
  );
}

function testExcludedExchangeIds(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  manager.disable("bybit");

  manager.beginRecovery(
    "binance",
    1_000,
  );

  assert.deepEqual(
    manager.getExcludedExchangeIds(
      1_050,
    ),
    [
      "binance",
      "bybit",
      "okx",
    ],
  );

  assert.ok(
    Object.isFrozen(
      manager.getExcludedExchangeIds(
        1_050,
      ),
    ),
  );
}

function testFailoverDecision(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  const candidates = [
    createCandidate("okx", 1),
    createCandidate("binance", 2),
    createCandidate("bybit", 3),
  ];

  const decision =
    createAutomaticFailoverDecision(
      candidates,
      manager,
      1_050,
    );

  assert.equal(
    decision.selectedExchangeId,
    "binance",
  );

  assert.deepEqual(
    decision.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "binance",
      "bybit",
    ],
  );

  assert.deepEqual(
    decision.excludedExchangeIds,
    [
      "okx",
    ],
  );

  assert.equal(
    decision.decidedAt,
    1_050,
  );

  assert.ok(
    Object.isFrozen(decision),
  );

  assert.ok(
    Object.isFrozen(
      decision.candidates,
    ),
  );
}

function testNoFailoverCandidate(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  manager.disable("binance");

  const decision =
    createAutomaticFailoverDecision(
      [
        createCandidate("okx", 1),
        createCandidate("binance", 2),
      ],
      manager,
      1_050,
    );

  assert.equal(
    decision.selectedCandidate,
    undefined,
  );

  assert.equal(
    decision.selectedExchangeId,
    undefined,
  );

  assert.deepEqual(
    decision.candidates,
    [],
  );

  assert.equal(
    decision.reason,
    "No failover candidate is currently eligible.",
  );
}

function testSnapshotAndOrdering(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {},
      clock,
    );

  manager.inspect("bybit");
  manager.inspect("okx");
  manager.inspect("binance");

  const snapshots =
    manager.inspectAll();

  assert.deepEqual(
    snapshots.map(
      (snapshot) =>
        snapshot.exchangeId,
    ),
    [
      "binance",
      "bybit",
      "okx",
    ],
  );

  assert.ok(
    Object.isFrozen(snapshots),
  );

  const snapshot =
    manager.snapshot();

  assert.equal(
    snapshot.version,
    0,
  );

  assert.deepEqual(
    snapshot.exchanges.map(
      (exchange) =>
        exchange.exchangeId,
    ),
    [
      "binance",
      "bybit",
      "okx",
    ],
  );

  assert.ok(
    Object.isFrozen(snapshot),
  );
}

function testReset(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  const reset =
    manager.reset("okx");

  assert.deepEqual(
    reset,
    {
      exchangeId: "okx",
      state: "AVAILABLE",
      consecutiveFailures: 0,
      totalFailures: 0,
      consecutiveRecoverySuccesses: 0,
      cooldownCycle: 0,
      manuallyDisabled: false,
    },
  );
}

function testResetAll(): void {
  const clock =
    new DeterministicFailoverClock(
      1_000,
    );

  const manager =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
      },
      clock,
    );

  manager.recordFailure(
    "okx",
    {
      observedAt: 1_000,
    },
  );

  manager.disable("bybit");

  const reset =
    manager.resetAll();

  assert.deepEqual(
    reset.map(
      (snapshot) => [
        snapshot.exchangeId,
        snapshot.state,
      ],
    ),
    [
      [
        "bybit",
        "AVAILABLE",
      ],
      [
        "okx",
        "AVAILABLE",
      ],
    ],
  );

  assert.ok(
    Object.isFrozen(reset),
  );
}

function testCooldownCalculation(): void {
  assert.equal(
    calculateCooldownDuration(
      100,
      2,
      1_000,
      1,
    ),
    100,
  );

  assert.equal(
    calculateCooldownDuration(
      100,
      2,
      1_000,
      2,
    ),
    200,
  );

  assert.equal(
    calculateCooldownDuration(
      100,
      2,
      1_000,
      4,
    ),
    800,
  );

  assert.equal(
    calculateCooldownDuration(
      100,
      2,
      1_000,
      10,
    ),
    1_000,
  );
}

function testInvalidConfiguration(): void {
  assertFailoverError(
    () =>
      new AutomaticFailoverManager({
        failureThreshold: 0,
      }),
    "INVALID_CONFIGURATION",
  );

  assertFailoverError(
    () =>
      new AutomaticFailoverManager({
        cooldownMs: -1,
      }),
    "INVALID_CONFIGURATION",
  );

  assertFailoverError(
    () =>
      new AutomaticFailoverManager({
        cooldownBackoffMultiplier:
          0,
      }),
    "INVALID_CONFIGURATION",
  );

  assertFailoverError(
    () =>
      new AutomaticFailoverManager({
        cooldownMs: 100,
        maximumCooldownMs: 50,
      }),
    "INVALID_CONFIGURATION",
  );

  assertFailoverError(
    () =>
      new AutomaticFailoverManager({
        recoverySuccessThreshold: 0,
      }),
    "INVALID_CONFIGURATION",
  );
}

function testInvalidExchangeId(): void {
  const manager =
    new AutomaticFailoverManager();

  assertFailoverError(
    () =>
      manager.inspect(
        "invalid/exchange",
      ),
    "INVALID_EXCHANGE_ID",
  );
}

function testInvalidTimestamp(): void {
  const manager =
    new AutomaticFailoverManager();

  assertFailoverError(
    () =>
      manager.recordFailure(
        "okx",
        {
          observedAt:
            Number.NaN,
        },
      ),
    "INVALID_TIMESTAMP",
  );

  assertFailoverError(
    () =>
      manager.recordSuccess(
        "okx",
        -1,
      ),
    "INVALID_TIMESTAMP",
  );

  assertFailoverError(
    () =>
      manager.isAvailable(
        "okx",
        Number.POSITIVE_INFINITY,
      ),
    "INVALID_TIMESTAMP",
  );
}

function testInvalidAttempt(): void {
  const manager =
    new AutomaticFailoverManager();

  assertFailoverError(
    () =>
      manager.recordAttempt(
        null as unknown as ExchangeRouterAttempt,
      ),
    "INVALID_ATTEMPT",
  );

  assertFailoverError(
    () =>
      manager.recordAttempt(
        createAttempt({
          completedAt:
            Number.NaN,
        }),
      ),
    "INVALID_TIMESTAMP",
  );
}

function testInvalidClock(): void {
  const manager =
    new AutomaticFailoverManager(
      {},
      {
        now(): number {
          return Number.NaN;
        },
      },
    );

  assertFailoverError(
    () =>
      manager.inspect("okx"),
    "INVALID_TIMESTAMP",
  );
}

function testInvalidDecisionCandidates(): void {
  const manager =
    new AutomaticFailoverManager();

  assertFailoverError(
    () =>
      createAutomaticFailoverDecision(
        null as unknown as readonly ExchangeDiscoveryCandidate<TestUnifiedExchange>[],
        manager,
        1_000,
      ),
    "INVALID_CONFIGURATION",
  );
}

function runAutomaticFailoverTests(): void {
  testInitialSnapshot();
  testFailureThreshold();
  testCooldownBackoff();
  testCooldownTransitionToRecovery();
  testRecoveryThreshold();
  testFailureDuringRecovery();
  testNonRetryableFailureConfiguration();
  testRouterAttemptRecording();
  testManualDisableAndEnable();
  testExcludedExchangeIds();
  testFailoverDecision();
  testNoFailoverCandidate();
  testSnapshotAndOrdering();
  testReset();
  testResetAll();
  testCooldownCalculation();
  testInvalidConfiguration();
  testInvalidExchangeId();
  testInvalidTimestamp();
  testInvalidAttempt();
  testInvalidClock();
  testInvalidDecisionCandidates();

  console.log(
    "All deterministic automatic failover tests passed successfully.",
  );
}

runAutomaticFailoverTests();