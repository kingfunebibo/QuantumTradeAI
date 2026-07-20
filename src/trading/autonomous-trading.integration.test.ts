/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * Deterministic autonomous-trading subsystem integration test.
 *
 * Responsibilities:
 * - verify the complete Milestone 31 public export surface
 * - wire every autonomous-trading engine with shared deterministic dependencies
 * - validate explainability and audit-record generation end to end
 * - validate immutable histories, queries, metrics, and snapshots
 */

import assert from "node:assert/strict";

import {
  AutonomousCapitalAllocationEngine,
  AutonomousConsensusDecisionEngine,
  AutonomousExplainabilityEngine,
  AutonomousLearningEngine,
  AutonomousOrderIntentFactory,
  AutonomousPerformanceMonitor,
  AutonomousPositionSizingEngine,
  AutonomousRecoveryEngine,
  AutonomousSignalArbitrationEngine,
  AutonomousStrategyLifecycleManager,
  AutonomousStrategyScheduler,
  AutonomousTradeApprovalEngine,
  AutonomousTradingContractValidator,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
} from "./autonomous-trading";

class DeterministicClock implements AutonomousTradingClock {
  public constructor(private currentTime: number) {}

  public now(): number {
    return this.currentTime;
  }

  public advance(milliseconds: number): void {
    assert.ok(
      Number.isFinite(milliseconds) && milliseconds >= 0,
      "milliseconds must be a non-negative finite number",
    );

    this.currentTime += milliseconds;
  }
}

class DeterministicIdFactory implements AutonomousTradingIdFactory {
  public create(prefix: string, timestamp: number, sequence: number): string {
    return `${prefix}-${timestamp}-${sequence}`;
  }
}

function assertFrozen(value: object, message: string): void {
  assert.equal(Object.isFrozen(value), true, message);
}

async function run(): Promise<void> {
  const clock = new DeterministicClock(1_750_000_000_000);
  const idFactory = new DeterministicIdFactory();
  const validator = new AutonomousTradingContractValidator();

  const lifecycleManager = new AutonomousStrategyLifecycleManager(
    clock,
    idFactory,
    validator,
  );

  const scheduler = new AutonomousStrategyScheduler(
    lifecycleManager,
    clock,
    idFactory,
    validator,
  );

  const capitalAllocationEngine = new AutonomousCapitalAllocationEngine(
    clock,
    idFactory,
    validator,
  );

  const signalArbitrationEngine = new AutonomousSignalArbitrationEngine(
    clock,
    idFactory,
    validator,
  );

  const consensusDecisionEngine = new AutonomousConsensusDecisionEngine(
    clock,
    idFactory,
    validator,
  );

  const tradeApprovalEngine = new AutonomousTradeApprovalEngine(
    clock,
    idFactory,
    validator,
  );

  const positionSizingEngine = new AutonomousPositionSizingEngine(
    clock,
    idFactory,
    validator,
  );

  const orderIntentFactory = new AutonomousOrderIntentFactory(
    clock,
    idFactory,
    validator,
  );

  const performanceMonitor = new AutonomousPerformanceMonitor(
    clock,
    idFactory,
    validator,
  );

  const recoveryEngine = new AutonomousRecoveryEngine(
    lifecycleManager,
    clock,
    idFactory,
    validator,
  );

  const learningEngine = new AutonomousLearningEngine(
    clock,
    idFactory,
    validator,
  );

  const explainabilityEngine = new AutonomousExplainabilityEngine(
    clock,
    idFactory,
    validator,
    {
      maximumExplanationEntries: 100,
      maximumAuditEntries: 100,
      normalizeFactorContributions: true,
      inferRationaleFromFactors: true,
      deduplicateTextEntries: true,
      criticalWarningThreshold: 2,
    },
  );

  assert.equal(typeof lifecycleManager.register, "function");
  assert.equal(typeof scheduler.evaluate, "function");
  assert.equal(typeof capitalAllocationEngine.allocate, "function");
  assert.equal(typeof signalArbitrationEngine.arbitrate, "function");
  assert.equal(typeof consensusDecisionEngine.decide, "function");
  assert.equal(typeof tradeApprovalEngine.approve, "function");
  assert.equal(typeof positionSizingEngine.size, "function");
  assert.equal(typeof orderIntentFactory.create, "function");
  assert.equal(typeof performanceMonitor.capture, "function");
  assert.equal(typeof recoveryEngine.decide, "function");
  assert.equal(typeof learningEngine.ingest, "function");
  assert.equal(typeof explainabilityEngine.explainAndAudit, "function");

  const explanation = explainabilityEngine.explain({
    correlationId: "correlation-integration-001",
    decisionId: "decision-integration-001",
    decisionType: "ORCHESTRATION",
    outcome: "ORDER_INTENT_CREATED",
    summary:
      "Autonomous orchestration selected the strongest eligible signal and produced a bounded order intent.",
    rationale: [
      "Signal arbitration selected the highest-scoring eligible strategy signal.",
      "Consensus approval exceeded the configured participation and approval thresholds.",
      "Risk approval and adaptive position sizing remained within portfolio limits.",
    ],
    factors: [
      {
        factorId: "signal-confidence",
        name: "Signal confidence",
        value: 0.91,
        weight: 0.35,
        contribution: 0.3185,
        description: "Normalized confidence emitted by the selected strategy.",
        metadata: Object.freeze({ source: "AI_STRATEGY_ENGINE" }),
      },
      {
        factorId: "consensus-approval",
        name: "Consensus approval ratio",
        value: 0.88,
        weight: 0.30,
        contribution: 0.264,
        description: "Weighted approval ratio across consensus participants.",
        metadata: Object.freeze({ source: "CONSENSUS_ENGINE" }),
      },
      {
        factorId: "risk-compatibility",
        name: "Risk compatibility",
        value: 0.95,
        weight: 0.25,
        contribution: 0.2375,
        description: "Compatibility with portfolio and strategy risk limits.",
        metadata: Object.freeze({ source: "RISK_ENGINE" }),
      },
      {
        factorId: "liquidity-quality",
        name: "Liquidity quality",
        value: 0.82,
        weight: 0.10,
        contribution: 0.082,
        description: "Expected execution quality for the selected instrument.",
        metadata: Object.freeze({ source: "MARKET_DATA" }),
      },
    ],
    warnings: [
      "Execution remains subject to exchange availability and final pre-trade checks.",
    ],
    strategyId: "strategy-ai-momentum-001",
    signalId: "signal-integration-001",
    instrument: "BTC-USDT",
    actor: "AUTONOMOUS_TRADING_ORCHESTRATOR",
    metadata: Object.freeze({
      environment: "INTEGRATION_TEST",
      terminalStage: "ORDER_INTENT_CREATED",
    }),
  });

  assert.equal(explanation.correlationId, "correlation-integration-001");
  assert.equal(explanation.decisionId, "decision-integration-001");
  assert.equal(explanation.decisionType, "ORCHESTRATION");
  assert.equal(explanation.factors.length, 4);
  assert.equal(explanation.warnings.length, 1);
  assert.ok(explanation.rationale.length >= 3);
  assertFrozen(explanation, "explanation must be immutable");
  assertFrozen(explanation.factors, "explanation factors must be immutable");
  assertFrozen(explanation.rationale, "explanation rationale must be immutable");
  assertFrozen(explanation.warnings, "explanation warnings must be immutable");

  clock.advance(25);

  const auditRecord = explainabilityEngine.createAuditRecord({
    correlationId: explanation.correlationId,
    entityType: "DECISION",
    entityId: explanation.decisionId,
    action: "AUTONOMOUS_ORCHESTRATION_COMPLETED",
    actor: "AUTONOMOUS_TRADING_ORCHESTRATOR",
    previousState: Object.freeze({ stage: "POSITION_SIZED" }),
    currentState: Object.freeze({
      stage: "ORDER_INTENT_CREATED",
      approved: true,
    }),
    explanation,
    metadata: Object.freeze({ environment: "INTEGRATION_TEST" }),
  });

  assert.equal(auditRecord.correlationId, explanation.correlationId);
  assert.equal(auditRecord.entityType, "DECISION");
  assert.equal(auditRecord.entityId, explanation.decisionId);
  assert.equal(auditRecord.explanation?.explanationId, explanation.explanationId);
  assertFrozen(auditRecord, "audit record must be immutable");

  clock.advance(25);

  const combined = explainabilityEngine.explainAndAudit(
    {
      correlationId: "correlation-integration-002",
      decisionId: "order-intent-integration-001",
      decisionType: "ORDER_INTENT",
      outcome: "CREATED",
      factors: [
        {
          name: "Approved quantity",
          value: 0.01,
          weight: 1,
          contribution: 1,
        },
      ],
      strategyId: "strategy-ai-momentum-001",
      signalId: "signal-integration-002",
      instrument: "BTC-USDT",
    },
    {
      entityType: "ORDER_INTENT",
      entityId: "order-intent-integration-001",
      action: "ORDER_INTENT_CREATED",
      actor: "AUTONOMOUS_ORDER_INTENT_FACTORY",
      currentState: Object.freeze({
        side: "BUY",
        orderType: "LIMIT",
        quantity: 0.01,
        limitPrice: 100_000,
      }),
    },
  );

  assert.equal(combined.explanation.decisionType, "ORDER_INTENT");
  assert.equal(combined.auditRecord.entityType, "ORDER_INTENT");
  assert.equal(
    combined.auditRecord.explanation?.explanationId,
    combined.explanation.explanationId,
  );

  const storedExplanation = explainabilityEngine.getExplanation(
    explanation.explanationId,
  );
  assert.equal(storedExplanation?.decisionId, explanation.decisionId);

  const latestForDecision =
    explainabilityEngine.getLatestExplanationForDecision(
      explanation.decisionId,
    );
  assert.equal(latestForDecision?.explanationId, explanation.explanationId);

  const orchestrationExplanations =
    explainabilityEngine.queryExplanations({
      correlationId: "correlation-integration-001",
      decisionType: "ORCHESTRATION",
      strategyId: "strategy-ai-momentum-001",
      limit: 10,
    });

  assert.equal(orchestrationExplanations.length, 1);
  assert.equal(
    orchestrationExplanations[0]?.explanationId,
    explanation.explanationId,
  );

  const decisionAuditRecords = explainabilityEngine.queryAuditRecords({
    correlationId: "correlation-integration-001",
    entityType: "DECISION",
    action: "AUTONOMOUS_ORCHESTRATION_COMPLETED",
    limit: 10,
  });

  assert.equal(decisionAuditRecords.length, 1);
  assert.equal(decisionAuditRecords[0]?.recordId, auditRecord.recordId);

  const metrics = explainabilityEngine.getMetrics();
  assert.equal(metrics.explanationCount, 2);
  assert.equal(metrics.auditRecordCount, 2);
  assert.equal(metrics.factorCount, 5);
  assert.equal(metrics.warningCount, 1);
  assert.equal(metrics.explanationsByType.ORCHESTRATION, 1);
  assert.equal(metrics.explanationsByType.ORDER_INTENT, 1);
  assert.equal(metrics.auditRecordsByEntityType.DECISION, 1);
  assert.equal(metrics.auditRecordsByEntityType.ORDER_INTENT, 1);
  assertFrozen(metrics, "metrics must be immutable");

  const snapshot = explainabilityEngine.snapshot();
  assert.equal(snapshot.explanations.length, 2);
  assert.equal(snapshot.auditRecords.length, 2);
  assert.equal(snapshot.metrics.explanationCount, 2);
  assert.equal(snapshot.capturedAt, clock.now());
  assertFrozen(snapshot, "snapshot must be immutable");
  assertFrozen(snapshot.explanations, "snapshot explanations must be immutable");
  assertFrozen(snapshot.auditRecords, "snapshot audit records must be immutable");

  explainabilityEngine.clearHistory();

  const clearedSnapshot = explainabilityEngine.snapshot();
  const cumulativeMetrics = explainabilityEngine.getMetrics();

  assert.equal(clearedSnapshot.explanations.length, 0);
  assert.equal(clearedSnapshot.auditRecords.length, 0);
  assert.equal(cumulativeMetrics.explanationCount, 2);
  assert.equal(cumulativeMetrics.auditRecordCount, 2);
  assert.equal(cumulativeMetrics.factorCount, 5);
  assert.equal(cumulativeMetrics.warningCount, 1);

  console.log(
    "All autonomous trading Milestone 31 integration tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});