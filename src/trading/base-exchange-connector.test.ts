/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Deterministic BaseExchangeConnector tests.
 *
 * Run with:
 * npx tsx src/trading/base-exchange-connector.test.ts
 */

import assert from "node:assert/strict";

import {
  BaseExchangeConnector,
  BaseExchangeConnectorError,
  isBaseExchangeConnectorError,
  validateBaseExchangeConnectorConfig,
  validateBaseExchangeConnectorDependencies,
  type BaseExchangeConnectorClock,
  type BaseExchangeConnectorConnectHookContext,
  type BaseExchangeConnectorDisconnectHookContext,
  type BaseExchangeConnectorInitializeHookContext,
  type ExchangeConnectorCapabilities,
  type ExchangeConnectorHealthSnapshot,
  type ExchangeConnectorMetadata,
} from "./exchange-connectivity";

const INITIAL_TIMESTAMP = 1_700_000_000_000;

/**
 * Deterministic manually controlled clock.
 */
class ManualConnectorClock implements BaseExchangeConnectorClock {
  public constructor(private currentTime: number) {}

  public now(): number {
    return this.currentTime;
  }

  public set(timestamp: number): void {
    this.currentTime = timestamp;
  }

  public advance(milliseconds: number): void {
    this.currentTime += milliseconds;
  }
}

interface TestConnectorFailureConfig {
  readonly initialize?: boolean;
  readonly connect?: boolean;
  readonly disconnect?: boolean;
  readonly destroy?: boolean;
}

/**
 * Concrete deterministic connector used only by this test suite.
 */
class TestExchangeConnector extends BaseExchangeConnector {
  public initializeHookCalls = 0;
  public connectHookCalls = 0;
  public disconnectHookCalls = 0;
  public destroyHookCalls = 0;

  public lastInitializeContext?: BaseExchangeConnectorInitializeHookContext;
  public lastConnectContext?: BaseExchangeConnectorConnectHookContext;
  public lastDisconnectContext?: BaseExchangeConnectorDisconnectHookContext;
  public lastDestroyContext?: BaseExchangeConnectorDisconnectHookContext;

  public constructor(
    metadata: ExchangeConnectorMetadata,
    clock: BaseExchangeConnectorClock,
    private readonly failures: TestConnectorFailureConfig = {},
  ) {
    super(
      {
        metadata,
        initialState: "CREATED",
        initialHealthStatus: "UNKNOWN",
      },
      {
        clock,
      },
    );
  }

  public exposeMarkHealthy(
    checkedAt: number,
    latencyMs?: number,
  ): ExchangeConnectorHealthSnapshot {
    return this.markHealthy(checkedAt, latencyMs);
  }

  public exposeMarkDegraded(
    code: string,
    message: string,
    checkedAt: number,
  ): ExchangeConnectorHealthSnapshot {
    return this.markDegraded(
      code,
      message,
      checkedAt,
    );
  }

  public exposeMarkUnhealthy(
    code: string,
    message: string,
    checkedAt: number,
  ): ExchangeConnectorHealthSnapshot {
    return this.markUnhealthy(
      code,
      message,
      checkedAt,
    );
  }

  protected async onInitialize(
    context: BaseExchangeConnectorInitializeHookContext,
  ): Promise<void> {
    this.initializeHookCalls += 1;
    this.lastInitializeContext = context;

    if (this.failures.initialize) {
      throw new Error("Deterministic initialization failure.");
    }
  }

  protected async onConnect(
    context: BaseExchangeConnectorConnectHookContext,
  ): Promise<void> {
    this.connectHookCalls += 1;
    this.lastConnectContext = context;

    if (this.failures.connect) {
      throw new Error("Deterministic connection failure.");
    }
  }

  protected async onDisconnect(
    context: BaseExchangeConnectorDisconnectHookContext,
  ): Promise<void> {
    this.disconnectHookCalls += 1;
    this.lastDisconnectContext = context;

    if (this.failures.disconnect) {
      throw new Error("Deterministic disconnection failure.");
    }
  }

  protected async onDestroy(
    context: BaseExchangeConnectorDisconnectHookContext,
  ): Promise<void> {
    this.destroyHookCalls += 1;
    this.lastDestroyContext = context;

    if (this.failures.destroy) {
      throw new Error("Deterministic destruction failure.");
    }
  }
}

function createCapabilities(): ExchangeConnectorCapabilities {
  return Object.freeze({
    marketTypes: Object.freeze(["SPOT"] as const),

    supportsPublicRest: true,
    supportsPrivateRest: true,
    supportsPublicWebSocket: true,
    supportsPrivateWebSocket: true,

    supportsMarketData: true,
    supportsOrderPlacement: true,
    supportsOrderCancellation: true,
    supportsOrderAmendment: false,
    supportsOpenOrders: true,
    supportsOrderHistory: true,
    supportsTradeHistory: true,
    supportsBalances: true,
    supportsPositions: false,

    supportsClientOrderId: true,
    supportsBatchOrders: false,
    supportsServerTime: true,
    supportsSandbox: true,
  });
}

function createMetadata(
  connectorId = "test-exchange",
): ExchangeConnectorMetadata {
  return Object.freeze({
    id: connectorId,
    exchangeName: "Test Exchange",
    displayName: "Test Exchange Connector",
    implementationVersion: "1.0.0",
    environment: "TEST",
    capabilities: createCapabilities(),
  });
}

function createConnector(
  clock: ManualConnectorClock,
  failures: TestConnectorFailureConfig = {},
): TestExchangeConnector {
  return new TestExchangeConnector(
    createMetadata(),
    clock,
    failures,
  );
}

function testConstructionAndImmutableSnapshots(): void {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  const metadata = connector.getMetadata();
  const state = connector.getState();
  const health = connector.getHealth();

  assert.equal(metadata.id, "test-exchange");
  assert.equal(metadata.exchangeName, "Test Exchange");
  assert.equal(metadata.environment, "TEST");

  assert.equal(state.connectorId, "test-exchange");
  assert.equal(state.state, "CREATED");
  assert.equal(state.revision, 1);
  assert.equal(state.changedAt, INITIAL_TIMESTAMP);

  assert.equal(health.connectorId, "test-exchange");
  assert.equal(health.status, "UNKNOWN");
  assert.equal(health.checkedAt, INITIAL_TIMESTAMP);

  assert.equal(Object.isFrozen(metadata), true);
  assert.equal(Object.isFrozen(metadata.capabilities), true);
  assert.equal(
    Object.isFrozen(metadata.capabilities.marketTypes),
    true,
  );
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(health), true);
}

async function testInitialization(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);

  const result = await connector.initialize({
    requestedAt: INITIAL_TIMESTAMP + 50,
  });

  assert.equal(result.connectorId, "test-exchange");
  assert.equal(result.previousState, "CREATED");
  assert.equal(result.currentState, "INITIALIZED");
  assert.equal(result.changed, true);
  assert.equal(result.completedAt, INITIAL_TIMESTAMP + 100);

  assert.equal(connector.initializeHookCalls, 1);

  assert.equal(
    connector.lastInitializeContext?.requestedAt,
    INITIAL_TIMESTAMP + 50,
  );

  assert.equal(
    connector.lastInitializeContext?.startedAt,
    INITIAL_TIMESTAMP + 100,
  );

  const state = connector.getState();

  assert.equal(state.state, "INITIALIZED");

  // CREATED -> INITIALIZING -> INITIALIZED
  assert.equal(state.revision, 3);
  assert.equal(state.changedAt, INITIAL_TIMESTAMP + 100);
}

async function testIdempotentInitialization(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  const revisionBefore = connector.getState().revision;

  clock.advance(100);

  const result = await connector.initialize();

  assert.equal(result.changed, false);
  assert.equal(result.previousState, "INITIALIZED");
  assert.equal(result.currentState, "INITIALIZED");
  assert.equal(result.revision, revisionBefore);

  assert.equal(connector.initializeHookCalls, 1);
}

async function testForceInitialization(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);

  const result = await connector.initialize({
    force: true,
  });

  assert.equal(result.changed, false);
  assert.equal(result.currentState, "INITIALIZED");

  assert.equal(connector.initializeHookCalls, 2);

  const state = connector.getState();

  // Forced initialization transitions:
  // INITIALIZED -> INITIALIZING -> INITIALIZED
  assert.equal(state.revision, 5);
}

async function testConnectionAndAutomaticHealth(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(200);

  const result = await connector.connect({
    requestedAt: INITIAL_TIMESTAMP + 250,
    timeoutMs: 5_000,
    includePrivateChannels: true,
  });

  assert.equal(result.previousState, "INITIALIZED");
  assert.equal(result.currentState, "CONNECTED");
  assert.equal(result.changed, true);

  assert.equal(connector.connectHookCalls, 1);

  assert.equal(
    connector.lastConnectContext?.options.timeoutMs,
    5_000,
  );

  assert.equal(
    connector.lastConnectContext?.options
      .includePrivateChannels,
    true,
  );

  const state = connector.getState();
  const health = connector.getHealth();

  assert.equal(state.state, "CONNECTED");

  // CREATED -> INITIALIZING -> INITIALIZED
  // -> CONNECTING -> CONNECTED
  assert.equal(state.revision, 5);

  assert.equal(health.status, "HEALTHY");
  assert.equal(
    health.checkedAt,
    INITIAL_TIMESTAMP + 300,
  );
  assert.equal(
    health.lastSuccessfulCommunicationAt,
    INITIAL_TIMESTAMP + 300,
  );
}

async function testIdempotentConnection(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);
  await connector.connect();

  const revisionBefore = connector.getState().revision;

  clock.advance(100);

  const result = await connector.connect();

  assert.equal(result.changed, false);
  assert.equal(result.currentState, "CONNECTED");
  assert.equal(result.revision, revisionBefore);

  assert.equal(connector.connectHookCalls, 1);
}

async function testInvalidTransition(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  await assert.rejects(
    async () => connector.connect(),
    (error: unknown) => {
      assert.equal(
        isBaseExchangeConnectorError(error),
        true,
      );

      assert.ok(
        error instanceof BaseExchangeConnectorError,
      );

      assert.equal(
        error.code,
        "INVALID_LIFECYCLE_TRANSITION",
      );

      assert.equal(error.retryable, false);

      return true;
    },
  );

  assert.equal(connector.getState().state, "CREATED");
  assert.equal(connector.connectHookCalls, 0);
}

async function testDisconnect(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);
  await connector.connect();

  clock.advance(100);

  const result = await connector.disconnect({
    graceful: true,
    timeoutMs: 5_000,
    reason: "Deterministic shutdown.",
  });

  assert.equal(result.previousState, "CONNECTED");
  assert.equal(result.currentState, "DISCONNECTED");
  assert.equal(result.changed, true);

  assert.equal(connector.disconnectHookCalls, 1);

  assert.equal(
    connector.lastDisconnectContext?.options.graceful,
    true,
  );

  assert.equal(
    connector.lastDisconnectContext?.options.reason,
    "Deterministic shutdown.",
  );

  const state = connector.getState();
  const health = connector.getHealth();

  assert.equal(state.state, "DISCONNECTED");
  assert.equal(state.reason, "Deterministic shutdown.");

  assert.equal(health.status, "UNKNOWN");
  assert.equal(
    health.lastSuccessfulCommunicationAt,
    INITIAL_TIMESTAMP + 200,
  );
}

async function testIdempotentDisconnect(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);
  await connector.disconnect();

  const revisionBefore = connector.getState().revision;

  clock.advance(100);

  const result = await connector.disconnect();

  assert.equal(result.changed, false);
  assert.equal(result.currentState, "DISCONNECTED");
  assert.equal(result.revision, revisionBefore);

  assert.equal(connector.disconnectHookCalls, 1);
}

async function testDestroyConnectedConnector(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);
  await connector.connect();

  clock.advance(100);

  const result = await connector.destroy({
    graceful: true,
    timeoutMs: 5_000,
    reason: "Connector no longer required.",
  });

  assert.equal(result.currentState, "DESTROYED");
  assert.equal(result.changed, true);

  assert.equal(connector.disconnectHookCalls, 1);
  assert.equal(connector.destroyHookCalls, 1);

  assert.equal(connector.getState().state, "DESTROYED");
  assert.equal(connector.getHealth().status, "UNKNOWN");
}

async function testIdempotentDestroy(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);

  await connector.destroy();

  const revisionBefore = connector.getState().revision;

  clock.advance(100);

  const result = await connector.destroy();

  assert.equal(result.changed, false);
  assert.equal(result.currentState, "DESTROYED");
  assert.equal(result.revision, revisionBefore);

  assert.equal(connector.destroyHookCalls, 1);
}

async function testDestroyedConnectorCannotReconnect(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.destroy();

  await assert.rejects(
    async () => connector.initialize(),
    (error: unknown) => {
      assert.ok(
        error instanceof BaseExchangeConnectorError,
      );

      assert.equal(error.code, "CONNECTOR_DESTROYED");

      return true;
    },
  );

  assert.equal(connector.getState().state, "DESTROYED");
}

async function testInitializationHookFailure(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock, {
    initialize: true,
  });

  clock.advance(100);

  await assert.rejects(
    async () => connector.initialize(),
    (error: unknown) => {
      assert.ok(
        error instanceof BaseExchangeConnectorError,
      );

      assert.equal(error.code, "LIFECYCLE_HOOK_FAILED");
      assert.equal(error.retryable, true);

      assert.equal(
        error.details.causeMessage,
        "Deterministic initialization failure.",
      );

      return true;
    },
  );

  const state = connector.getState();
  const health = connector.getHealth();

  assert.equal(state.state, "FAILED");
  assert.equal(health.status, "UNHEALTHY");

  assert.equal(
    health.code,
    "CONNECTOR_LIFECYCLE_FAILURE",
  );

  assert.equal(
    health.message,
    "Deterministic initialization failure.",
  );
}

async function testConnectionHookFailure(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock, {
    connect: true,
  });

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);

  await assert.rejects(
    async () => connector.connect(),
    (error: unknown) => {
      assert.ok(
        error instanceof BaseExchangeConnectorError,
      );

      assert.equal(error.code, "LIFECYCLE_HOOK_FAILED");
      assert.equal(error.retryable, true);

      return true;
    },
  );

  assert.equal(connector.getState().state, "FAILED");
  assert.equal(connector.getHealth().status, "UNHEALTHY");
}

function testProtectedHealthHelpers(): void {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  assert.throws(
    () =>
      connector.exposeMarkHealthy(
        INITIAL_TIMESTAMP + 10,
        20,
      ),
    (error: unknown) => {
      assert.ok(
        error instanceof BaseExchangeConnectorError,
      );

      assert.equal(
        error.code,
        "HEALTHY_CONNECTOR_NOT_CONNECTED",
      );

      return true;
    },
  );
}

async function testHealthUpdatesWhileConnected(): Promise<void> {
  const clock = new ManualConnectorClock(
    INITIAL_TIMESTAMP,
  );

  const connector = createConnector(clock);

  clock.advance(100);
  await connector.initialize();

  clock.advance(100);
  await connector.connect();

  const healthy = connector.exposeMarkHealthy(
    INITIAL_TIMESTAMP + 250,
    25,
  );

  assert.equal(healthy.status, "HEALTHY");
  assert.equal(healthy.latencyMs, 25);

  const degraded = connector.exposeMarkDegraded(
    "HIGH_LATENCY",
    "Exchange latency is above threshold.",
    INITIAL_TIMESTAMP + 300,
  );

  assert.equal(degraded.status, "DEGRADED");
  assert.equal(degraded.code, "HIGH_LATENCY");
  assert.equal(
    degraded.lastFailureAt,
    INITIAL_TIMESTAMP + 300,
  );

  const unhealthy = connector.exposeMarkUnhealthy(
    "EXCHANGE_UNAVAILABLE",
    "Exchange endpoint is unavailable.",
    INITIAL_TIMESTAMP + 350,
  );

  assert.equal(unhealthy.status, "UNHEALTHY");
  assert.equal(
    unhealthy.code,
    "EXCHANGE_UNAVAILABLE",
  );
}

function testConfigurationValidation(): void {
  assert.doesNotThrow(() =>
    validateBaseExchangeConnectorConfig({
      metadata: createMetadata(),
      initialState: "CREATED",
      initialHealthStatus: "UNKNOWN",
    }),
  );

  assert.throws(
    () =>
      validateBaseExchangeConnectorConfig({
        metadata: {
          ...createMetadata(),
          id: "",
        },
      }),
    BaseExchangeConnectorError,
  );

  assert.throws(
    () =>
      validateBaseExchangeConnectorConfig({
        metadata: createMetadata(),
        initialState: "CONNECTED",
      }),
    BaseExchangeConnectorError,
  );

  assert.doesNotThrow(() =>
    validateBaseExchangeConnectorDependencies({
      clock: {
        now: () => INITIAL_TIMESTAMP,
      },
    }),
  );

  assert.throws(
    () =>
      validateBaseExchangeConnectorDependencies({
        clock: undefined as unknown as BaseExchangeConnectorClock,
      }),
    BaseExchangeConnectorError,
  );
}

async function runTests(): Promise<void> {
  testConstructionAndImmutableSnapshots();
  testConfigurationValidation();
  testProtectedHealthHelpers();

  await testInitialization();
  await testIdempotentInitialization();
  await testForceInitialization();
  await testConnectionAndAutomaticHealth();
  await testIdempotentConnection();
  await testInvalidTransition();
  await testDisconnect();
  await testIdempotentDisconnect();
  await testDestroyConnectedConnector();
  await testIdempotentDestroy();
  await testDestroyedConnectorCannotReconnect();
  await testInitializationHookFailure();
  await testConnectionHookFailure();
  await testHealthUpdatesWhileConnected();

  console.log(
    "All base exchange connector tests passed successfully.",
  );
}

runTests().catch((error: unknown) => {
  console.error(
    "Base exchange connector tests failed.",
    error,
  );

  process.exitCode = 1;
});