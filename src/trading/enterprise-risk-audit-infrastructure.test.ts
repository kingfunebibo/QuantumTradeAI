/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk-audit-infrastructure.test.ts
 *
 * Purpose:
 * Deterministic tests for the enterprise-risk audit log and audit subscriber.
 */

import {
  createEnterpriseRiskAuditLog,
  createEnterpriseRiskAuditSubscriber,
  type EnterpriseRiskDecision,
  type EnterpriseRiskEvent,
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

function createDecision(
  decisionId: string,
  evaluatedAt: number,
): EnterpriseRiskDecision {
  return {
    decisionId,
    evaluatedAt,
  } as EnterpriseRiskDecision;
}

function createEvent(
  eventId: string,
  occurredAt: number,
  portfolioId: string,
): EnterpriseRiskEvent {
  return {
    eventId,
    occurredAt,
    portfolioId,
  } as EnterpriseRiskEvent;
}

function testDecisionStorageAndLookup(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  const decision =
    createDecision(
      "decision-001",
      1_000,
    );

  auditLog.appendDecision(
    decision,
    {
      portfolioId: "portfolio-a",
      accountId: "account-a",
      strategyId: "strategy-a",
      botId: "bot-a",
    },
  );

  assertEqual(
    auditLog.count(),
    1,
    "The audit log should contain one record.",
  );

  const record =
    auditLog.getById("decision-001");

  assertCondition(
    record !== undefined,
    "The decision record should be retrievable by ID.",
  );

  assertEqual(
    record.recordType,
    "DECISION",
    "The stored record should be a decision.",
  );

  assertEqual(
    record.portfolioId,
    "portfolio-a",
    "The portfolio scope should be preserved.",
  );
}

function testChronologicalOrdering(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  auditLog.appendEvent(
    createEvent(
      "event-c",
      3_000,
      "portfolio-a",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-a",
      1_000,
      "portfolio-a",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-b",
      2_000,
      "portfolio-a",
    ),
  );

  const records = auditLog.query();

  assertEqual(
    records[0]?.recordId,
    "event-a",
    "The earliest record should appear first.",
  );

  assertEqual(
    records[1]?.recordId,
    "event-b",
    "The middle record should appear second.",
  );

  assertEqual(
    records[2]?.recordId,
    "event-c",
    "The latest record should appear last.",
  );
}

function testFilteringAndLimits(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  auditLog.appendEvent(
    createEvent(
      "event-a1",
      1_000,
      "portfolio-a",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-b1",
      2_000,
      "portfolio-b",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-a2",
      3_000,
      "portfolio-a",
    ),
  );

  const filtered = auditLog.query({
    recordType: "EVENT",
    portfolioId: "portfolio-a",
    fromTimestamp: 1_500,
    limit: 1,
  });

  assertEqual(
    filtered.length,
    1,
    "The query limit should be applied.",
  );

  assertEqual(
    filtered[0]?.recordId,
    "event-a2",
    "The query should return the matching portfolio and time range.",
  );
}

function testBoundedRetention(): void {
  const auditLog =
    createEnterpriseRiskAuditLog({
      maximumRecords: 2,
    });

  auditLog.appendEvent(
    createEvent(
      "event-001",
      1_000,
      "portfolio-a",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-002",
      2_000,
      "portfolio-a",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-003",
      3_000,
      "portfolio-a",
    ),
  );

  assertEqual(
    auditLog.count(),
    2,
    "The maximum retention size should be enforced.",
  );

  assertCondition(
    auditLog.getById("event-001") ===
      undefined,
    "The oldest record should be evicted.",
  );

  assertCondition(
    auditLog.getById("event-003") !==
      undefined,
    "The newest record should be retained.",
  );
}

function testDuplicateReplacement(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  auditLog.appendEvent(
    createEvent(
      "event-replaced",
      1_000,
      "portfolio-a",
    ),
  );

  auditLog.appendEvent(
    createEvent(
      "event-replaced",
      2_000,
      "portfolio-b",
    ),
  );

  assertEqual(
    auditLog.count(),
    1,
    "A duplicate record ID should replace the existing record.",
  );

  const record =
    auditLog.getById(
      "event-replaced",
    );

  assertEqual(
    record?.portfolioId,
    "portfolio-b",
    "The replacement record should be retained.",
  );

  assertEqual(
    record?.occurredAt,
    2_000,
    "The replacement timestamp should be retained.",
  );
}

function testReturnedRecordsAreImmutable(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  auditLog.appendEvent(
    createEvent(
      "event-immutable",
      1_000,
      "portfolio-a",
    ),
  );

  const records = auditLog.query();
  const record = records[0];

  assertCondition(
    Object.isFrozen(records),
    "The returned record collection should be frozen.",
  );

  assertCondition(
    record !== undefined &&
      Object.isFrozen(record),
    "Each returned audit record should be frozen.",
  );

  assertCondition(
    record !== undefined &&
      record.recordType === "EVENT" &&
      Object.isFrozen(record.event),
    "The embedded event should be frozen.",
  );
}

function testAuditSubscriberCapture(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  const subscriber =
    createEnterpriseRiskAuditSubscriber(
      auditLog,
      {
        subscriberId:
          "test-audit-subscriber",
      },
    );

  assertEqual(
    subscriber.id,
    "test-audit-subscriber",
    "The configured subscriber ID should be retained.",
  );

  subscriber.handle(
    createEvent(
      "subscriber-event",
      4_000,
      "portfolio-subscriber",
    ),
  );

  const record =
    auditLog.getById(
      "subscriber-event",
    );

  assertCondition(
    record !== undefined,
    "The subscriber should append received events to the audit log.",
  );

  assertEqual(
    record.portfolioId,
    "portfolio-subscriber",
    "The subscriber should preserve event scope.",
  );
}

function testClear(): void {
  const auditLog =
    createEnterpriseRiskAuditLog();

  auditLog.appendEvent(
    createEvent(
      "event-clear",
      1_000,
      "portfolio-a",
    ),
  );

  auditLog.clear();

  assertEqual(
    auditLog.count(),
    0,
    "Clearing the audit log should remove every record.",
  );
}

function run(): void {
  testDecisionStorageAndLookup();
  testChronologicalOrdering();
  testFilteringAndLimits();
  testBoundedRetention();
  testDuplicateReplacement();
  testReturnedRecordsAreImmutable();
  testAuditSubscriberCapture();
  testClear();

  console.log(
    "All enterprise-risk audit infrastructure tests passed successfully.",
  );
}

run();