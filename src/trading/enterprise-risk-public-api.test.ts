/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk-public-api.test.ts
 *
 * Purpose:
 * Verifies that the newly added enterprise-risk runtime components are
 * exposed through the enterprise-risk public module entry point.
 */

import * as EnterpriseRisk from "./enterprise-risk";

interface RuntimeExportExpectation {
  readonly name: string;
  readonly expectedType: "function";
}

const EXPECTED_RUNTIME_EXPORTS:
  readonly RuntimeExportExpectation[] =
  Object.freeze([
    Object.freeze({
      name: "DefaultEnterpriseRiskEventDispatcher",
      expectedType: "function",
    }),
    Object.freeze({
      name: "createEnterpriseRiskEventDispatcher",
      expectedType: "function",
    }),
    Object.freeze({
      name: "DefaultEnterpriseRiskPortfolioAggregator",
      expectedType: "function",
    }),
    Object.freeze({
      name: "createEnterpriseRiskPortfolioAggregator",
      expectedType: "function",
    }),
    Object.freeze({
      name: "InMemoryEnterpriseRiskAuditLog",
      expectedType: "function",
    }),
    Object.freeze({
      name: "createEnterpriseRiskAuditLog",
      expectedType: "function",
    }),
    Object.freeze({
      name: "DefaultEnterpriseRiskAuditSubscriber",
      expectedType: "function",
    }),
    Object.freeze({
      name: "createEnterpriseRiskAuditSubscriber",
      expectedType: "function",
    }),
  ]);

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getRuntimeExport(
  name: string,
): unknown {
  return (
    EnterpriseRisk as Readonly<
      Record<string, unknown>
    >
  )[name];
}

function verifyRuntimeExports(): void {
  for (
    const expectation of
    EXPECTED_RUNTIME_EXPORTS
  ) {
    const exportedValue =
      getRuntimeExport(expectation.name);

    assertCondition(
      typeof exportedValue ===
        expectation.expectedType,
      [
        "Expected enterprise-risk export",
        `"${expectation.name}"`,
        "to be available as a",
        `${expectation.expectedType}.`,
      ].join(" "),
    );
  }
}

function verifyFactoriesConstructInstances(): void {
  const auditLog =
    EnterpriseRisk.createEnterpriseRiskAuditLog({
      maximumRecords: 100,
    });

  assertCondition(
    auditLog instanceof
      EnterpriseRisk
        .InMemoryEnterpriseRiskAuditLog,
    "Audit-log factory returned an unexpected instance.",
  );

  const aggregator =
    EnterpriseRisk
      .createEnterpriseRiskPortfolioAggregator();

  assertCondition(
    aggregator instanceof
      EnterpriseRisk
        .DefaultEnterpriseRiskPortfolioAggregator,
    "Portfolio-aggregator factory returned an unexpected instance.",
  );

  const auditSubscriber =
    EnterpriseRisk
      .createEnterpriseRiskAuditSubscriber(
        auditLog,
      );

  assertCondition(
    auditSubscriber instanceof
      EnterpriseRisk
        .DefaultEnterpriseRiskAuditSubscriber,
    "Audit-subscriber factory returned an unexpected instance.",
  );
}

function run(): void {
  verifyRuntimeExports();
  verifyFactoriesConstructInstances();

  console.log(
    "All enterprise-risk public API tests passed successfully.",
  );
}

run();