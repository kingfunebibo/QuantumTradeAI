import assert from "node:assert/strict";

import {
  CrossChainArbitrageEngineError,
  DeterministicCrossChainArbitrageEngine,
} from "./cross-chain-arbitrage/cross-chain-arbitrage-engine";
import type {
  DeterministicCrossChainBridgeQuoteAggregator,
} from "./cross-chain-arbitrage/bridge-quote-aggregator";
import type {
  DeterministicCrossChainArbitrageOpportunityDetector,
} from "./cross-chain-arbitrage/cross-chain-opportunity-detector";
import type {
  DeterministicCrossChainExecutionPlanBuilder,
} from "./cross-chain-arbitrage/cross-chain-execution-plan-builder";
import type {
  DeterministicCrossChainSettlementVerifier,
} from "./cross-chain-arbitrage/cross-chain-settlement-verifier";
import type {
  DeterministicCrossChainRecoveryPlanner,
} from "./cross-chain-arbitrage/cross-chain-recovery-planner";

function createEngine():
  DeterministicCrossChainArbitrageEngine {
  return new DeterministicCrossChainArbitrageEngine({
    quoteAggregator:
      {} as DeterministicCrossChainBridgeQuoteAggregator,
    opportunityDetector:
      {} as DeterministicCrossChainArbitrageOpportunityDetector,
    executionPlanBuilder:
      {} as DeterministicCrossChainExecutionPlanBuilder,
    settlementVerifier:
      {} as DeterministicCrossChainSettlementVerifier,
    recoveryPlanner:
      {} as DeterministicCrossChainRecoveryPlanner,
    sessionIdFactory: (createdAt) =>
      `test-session:${createdAt}`,
  });
}

function testSessionCreationIsDeterministic(): void {
  const firstEngine = createEngine();
  const secondEngine = createEngine();

  const first = firstEngine.createSession({
    createdAt: 1_000,
    metadata: {
      environment: "test",
      deterministicSeed: "milestone-26",
    },
  });

  const second = secondEngine.createSession({
    createdAt: 1_000,
    metadata: {
      environment: "test",
      deterministicSeed: "milestone-26",
    },
  });

  assert.deepEqual(first, second);
  assert.equal(
    first.sessionId,
    "test-session:1000",
  );
  assert.equal(first.status, "CREATED");
  assert.equal(first.createdAt, 1_000);
  assert.equal(first.updatedAt, 1_000);
  assert.equal(first.version, 0);
  assert.equal(first.quoteAggregation, null);
  assert.equal(first.opportunityDetection, null);
  assert.equal(first.executionPlan, null);
  assert.equal(first.executionRuntime, null);
  assert.equal(first.settlement, null);
  assert.equal(first.recoveryPlan, null);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.metadata));
}

function testExplicitSessionIdIsPreserved(): void {
  const engine = createEngine();

  const session = engine.createSession({
    sessionId: "cross-chain-session-explicit",
    createdAt: 2_000,
  });

  assert.equal(
    session.sessionId,
    "cross-chain-session-explicit",
  );
}

function testSnapshotWithoutExecutionRuntime(): void {
  const engine = createEngine();

  const session = engine.createSession({
    createdAt: 3_000,
  });

  const snapshot = engine.snapshot();

  assert.deepEqual(snapshot.session, session);
  assert.equal(
    snapshot.executionRuntimeSnapshot,
    null,
  );
  assert.ok(Object.isFrozen(snapshot));
}

function testCloseTransitionsSession(): void {
  const engine = createEngine();

  engine.createSession({
    createdAt: 4_000,
  });

  const closed = engine.close(4_500);

  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.updatedAt, 4_500);
  assert.equal(closed.version, 1);
  assert.equal(
    closed.sessionId,
    "test-session:4000",
  );
  assert.ok(Object.isFrozen(closed));
}

function testSessionCanBeRecreatedAfterClose(): void {
  const engine = createEngine();

  engine.createSession({
    createdAt: 5_000,
  });

  engine.close(5_100);

  const recreated = engine.createSession({
    createdAt: 6_000,
  });

  assert.equal(
    recreated.sessionId,
    "test-session:6000",
  );
  assert.equal(recreated.status, "CREATED");
  assert.equal(recreated.version, 0);
  assert.equal(recreated.createdAt, 6_000);
  assert.equal(recreated.updatedAt, 6_000);
}

function testRejectsNegativeCreationTimestamp(): void {
  const engine = createEngine();

  assert.throws(
    () =>
      engine.createSession({
        createdAt: -1,
      }),
    (error: unknown) => {
      assert.ok(
        error instanceof
          CrossChainArbitrageEngineError,
      );
      assert.equal(
        error.code,
        "INVALID_TIMESTAMP",
      );

      return true;
    },
  );
}

function testRejectsEmptyExplicitSessionId(): void {
  const engine = createEngine();

  assert.throws(
    () =>
      engine.createSession({
        sessionId: "   ",
        createdAt: 7_000,
      }),
    (error: unknown) => {
      assert.ok(
        error instanceof
          CrossChainArbitrageEngineError,
      );
      assert.equal(
        error.code,
        "INVALID_IDENTIFIER",
      );

      return true;
    },
  );
}

function testRejectsSnapshotBeforeSessionCreation(): void {
  const engine = createEngine();

  assert.throws(
    () => engine.snapshot(),
    (error: unknown) => {
      assert.ok(
        error instanceof
          CrossChainArbitrageEngineError,
      );
      assert.equal(
        error.code,
        "SESSION_NOT_CREATED",
      );

      return true;
    },
  );
}

function testRejectsNonMonotonicCloseTimestamp(): void {
  const engine = createEngine();

  engine.createSession({
    createdAt: 8_000,
  });

  assert.throws(
    () => engine.close(7_999),
    (error: unknown) => {
      assert.ok(
        error instanceof
          CrossChainArbitrageEngineError,
      );
      assert.equal(
        error.code,
        "NON_MONOTONIC_TIMESTAMP",
      );

      return true;
    },
  );
}

function testClosedSessionRejectsQuoteAggregation(): void {
  const engine = createEngine();

  engine.createSession({
    createdAt: 9_000,
  });

  engine.close(9_100);

  assert.throws(
    () =>
      engine.aggregateQuotes(
        {} as Parameters<
          DeterministicCrossChainArbitrageEngine["aggregateQuotes"]
        >[0],
      ),
    (error: unknown) => {
      assert.ok(
        error instanceof
          CrossChainArbitrageEngineError,
      );
      assert.equal(
        error.code,
        "SESSION_CLOSED",
      );

      return true;
    },
  );
}

function run(): void {
  testSessionCreationIsDeterministic();
  testExplicitSessionIdIsPreserved();
  testSnapshotWithoutExecutionRuntime();
  testCloseTransitionsSession();
  testSessionCanBeRecreatedAfterClose();
  testRejectsNegativeCreationTimestamp();
  testRejectsEmptyExplicitSessionId();
  testRejectsSnapshotBeforeSessionCreation();
  testRejectsNonMonotonicCloseTimestamp();
  testClosedSessionRejectsQuoteAggregation();

  console.log(
    "All cross-chain arbitrage engine deterministic session tests passed successfully.",
  );
}

run();