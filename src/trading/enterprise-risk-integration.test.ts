/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk-integration.test.ts
 *
 * Purpose:
 * End-to-end deterministic integration test for the Milestone 27 enterprise
 * risk runtime. Verifies event dispatch, filtered subscriptions, automatic
 * audit capture, decision auditing, portfolio aggregation, ordering,
 * immutability, and cross-component interoperability.
 */

import {
  createEnterpriseRiskAuditLog,
  createEnterpriseRiskAuditSubscriber,
  createEnterpriseRiskEventDispatcher,
  createEnterpriseRiskPortfolioAggregator,
  type EnterpriseRiskDecision,
  type EnterpriseRiskDispatcherEventType,
  type EnterpriseRiskEvent,
  type EnterpriseRiskSnapshot,
} from "./enterprise-risk";

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message} Expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

interface SnapshotInput {
  readonly snapshotId: string;
  readonly portfolioId: string;
  readonly generatedAt: number;
  readonly reportingCurrency: string;
  readonly totalEquity: number;
  readonly cashBalance: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly longExposure: number;
  readonly shortExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly dailyPnl: number;
  readonly weeklyPnl: number;
  readonly monthlyPnl: number;
  readonly openPositionCount: number;
  readonly overallSeverity:
    | "INFO"
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL";
  readonly tradingAllowed: boolean;
}

function createSnapshot(
  input: SnapshotInput,
): EnterpriseRiskSnapshot {
  return {
    snapshotId: input.snapshotId,
    portfolioId: input.portfolioId,
    reportingCurrency:
      input.reportingCurrency,
    portfolio: {
      portfolioId: input.portfolioId,
      reportingCurrency:
        input.reportingCurrency,
      observedAt: input.generatedAt,
      totalEquity: input.totalEquity,
      cashBalance: input.cashBalance,
      grossExposure: input.grossExposure,
      netExposure: input.netExposure,
      longExposure: input.longExposure,
      shortExposure: input.shortExposure,
      realizedPnl: input.realizedPnl,
      unrealizedPnl: input.unrealizedPnl,
      dailyPnl: input.dailyPnl,
      weeklyPnl: input.weeklyPnl,
      monthlyPnl: input.monthlyPnl,
      peakEquity: input.totalEquity,
      currentDrawdown: 0,
      currentDrawdownPercentage: 0,
      consecutiveLosses: 0,
      openPositionCount:
        input.openPositionCount,
      positions: [],
      accounts: [],
    },
    exposures: {
      grossExposure: input.grossExposure,
      netExposure: input.netExposure,
      longExposure: input.longExposure,
      shortExposure: input.shortExposure,
      spotExposure: input.grossExposure,
      marginExposure: 0,
      derivativesExposure: 0,
      leveragedExposure: 0,
      concentrationExposure: 0,
      currencyExposures: [],
    },
    performance: {},
    activeViolations: [],
    activeWarnings: [],
    circuitBreakers: [],
    overallSeverity:
      input.overallSeverity,
    tradingAllowed:
      input.tradingAllowed,
    generatedAt:
      input.generatedAt,
    metadata: {
      integrationTest: true,
    },
  } as unknown as EnterpriseRiskSnapshot;
}

function createEvent(
  eventId: string,
  eventType:
    EnterpriseRiskDispatcherEventType,
  occurredAt: number,
  portfolioId: string,
  severity:
    | "INFO"
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL",
): EnterpriseRiskEvent {
  return {
    eventId,
    eventType,
    severity,
    message:
      `Integration event ${eventId}`,
    occurredAt,
    portfolioId,
    metadata: {
      integrationTest: true,
    },
  } as EnterpriseRiskEvent;
}

function createDecision():
  EnterpriseRiskDecision {
  return {
    decisionId:
      "decision-integration-001",
    evaluatedAt: 2_500,
  } as EnterpriseRiskDecision;
}

function runIntegratedWorkflow(): void {
  const auditLog =
    createEnterpriseRiskAuditLog({
      maximumRecords: 100,
    });

  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  const auditSubscriber =
    createEnterpriseRiskAuditSubscriber(
      auditLog,
      {
        subscriberId:
          "enterprise-risk-integration-audit",
      },
    );

  dispatcher.subscribe(
    auditSubscriber,
  );

  const filteredDeliveries: string[] = [];

  dispatcher.subscribe({
    id: "critical-event-observer",
    eventTypes: [
      "LIMIT_BREACHED",
      "CIRCUIT_BREAKER_TRIGGERED",
    ],
    handle: (event) => {
      filteredDeliveries.push(
        event.eventId,
      );
    },
  });

  const events = [
    createEvent(
      "event-risk-evaluated",
      "RISK_EVALUATED",
      1_000,
      "portfolio-a",
      "INFO",
    ),
    createEvent(
      "event-limit-breached",
      "LIMIT_BREACHED",
      2_000,
      "portfolio-b",
      "HIGH",
    ),
    createEvent(
      "event-breaker-triggered",
      "CIRCUIT_BREAKER_TRIGGERED",
      3_000,
      "portfolio-b",
      "CRITICAL",
    ),
  ] as const;

  for (const event of events) {
    dispatcher.publish(event);
  }

  auditLog.appendDecision(
    createDecision(),
    {
      portfolioId: "portfolio-b",
      accountId: "account-b",
      strategyId: "strategy-b",
      botId: "bot-b",
    },
  );

  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  const aggregation =
    aggregator.aggregate([
      createSnapshot({
        snapshotId: "snapshot-a",
        portfolioId: "portfolio-a",
        generatedAt: 1_500,
        reportingCurrency: "USD",
        totalEquity: 100_000,
        cashBalance: 40_000,
        grossExposure: 60_000,
        netExposure: 40_000,
        longExposure: 50_000,
        shortExposure: 10_000,
        realizedPnl: 2_000,
        unrealizedPnl: 1_000,
        dailyPnl: 500,
        weeklyPnl: 1_500,
        monthlyPnl: 3_000,
        openPositionCount: 3,
        overallSeverity: "LOW",
        tradingAllowed: true,
      }),
      createSnapshot({
        snapshotId: "snapshot-b",
        portfolioId: "portfolio-b",
        generatedAt: 3_500,
        reportingCurrency: "USD",
        totalEquity: 50_000,
        cashBalance: 10_000,
        grossExposure: 40_000,
        netExposure: -10_000,
        longExposure: 15_000,
        shortExposure: 25_000,
        realizedPnl: -1_000,
        unrealizedPnl: -500,
        dailyPnl: -750,
        weeklyPnl: -1_250,
        monthlyPnl: -2_000,
        openPositionCount: 2,
        overallSeverity: "CRITICAL",
        tradingAllowed: false,
      }),
    ]);

  assertEqual(
    auditLog.count(),
    4,
    "Three dispatched events and one decision should be audited.",
  );

  const allRecords =
    auditLog.query();

  assertEqual(
    allRecords
      .map((record) => record.recordId)
      .join(","),
    [
      "event-risk-evaluated",
      "event-limit-breached",
      "decision-integration-001",
      "event-breaker-triggered",
    ].join(","),
    "Audit records should be returned in deterministic chronological order.",
  );

  const portfolioBRecords =
    auditLog.query({
      portfolioId: "portfolio-b",
    });

  assertEqual(
    portfolioBRecords.length,
    3,
    "Portfolio filtering should return its two events and one decision.",
  );

  const eventRecords =
    auditLog.query({
      recordType: "EVENT",
    });

  assertEqual(
    eventRecords.length,
    3,
    "All dispatched events should be captured by the audit subscriber.",
  );

  assertEqual(
    filteredDeliveries.join(","),
    [
      "event-limit-breached",
      "event-breaker-triggered",
    ].join(","),
    "The filtered observer should receive only high-control event types.",
  );

  assertEqual(
    aggregation.snapshotCount,
    2,
    "Both portfolio snapshots should be aggregated.",
  );

  assertEqual(
    aggregation.totalEquity,
    150_000,
    "Enterprise equity should be consolidated.",
  );

  assertEqual(
    aggregation.totalCashBalance,
    50_000,
    "Enterprise cash should be consolidated.",
  );

  assertEqual(
    aggregation.totalGrossExposure,
    100_000,
    "Enterprise gross exposure should be consolidated.",
  );

  assertEqual(
    aggregation.totalNetExposure,
    30_000,
    "Enterprise net exposure should be consolidated.",
  );

  assertEqual(
    aggregation.totalOpenPositionCount,
    5,
    "Open positions should be consolidated.",
  );

  assertEqual(
    aggregation.overallSeverity,
    "CRITICAL",
    "The enterprise aggregation should select the highest severity.",
  );

  assertEqual(
    aggregation.tradingAllowed,
    false,
    "A blocked portfolio should block enterprise-level trading.",
  );

  assertEqual(
    aggregation.latestGeneratedAt,
    3_500,
    "The latest snapshot timestamp should be retained.",
  );

  assertCondition(
    Object.isFrozen(aggregation),
    "The portfolio aggregation should be immutable.",
  );

  assertCondition(
    Object.isFrozen(allRecords),
    "The audit query result should be immutable.",
  );

  assertCondition(
    allRecords.every((record) =>
      Object.isFrozen(record),
    ),
    "Every audit record should be immutable.",
  );

  dispatcher.unsubscribe(
    auditSubscriber.id,
  );

  dispatcher.publish(
    createEvent(
      "event-after-unsubscribe",
      "RISK_EVALUATED",
      4_000,
      "portfolio-a",
      "INFO",
    ),
  );

  assertEqual(
    auditLog.count(),
    4,
    "Unsubscribed audit capture should not receive later events.",
  );
}

function run(): void {
  runIntegratedWorkflow();

  console.log(
    "All enterprise-risk integration tests passed successfully.",
  );
}

run();