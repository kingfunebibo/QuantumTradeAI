/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk-portfolio-aggregator.test.ts
 *
 * Purpose:
 * Deterministic tests for enterprise-risk portfolio aggregation.
 */

import {
  createEnterpriseRiskPortfolioAggregator,
  EnterpriseRiskValidationError,
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
  readonly reportingCurrency?: string;
  readonly generatedAt: number;
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
  readonly warningCode?: string;
  readonly warningMessage?: string;
  readonly violationCode?: string;
  readonly violationMessage?: string;
  readonly circuitBreakerId?: string;
}

function createSnapshot(
  input: SnapshotInput,
): EnterpriseRiskSnapshot {
  const activeWarnings =
    input.warningCode === undefined
      ? []
      : [
          {
            id: `warning-${input.snapshotId}`,
            code: input.warningCode,
            severity: input.overallSeverity,
            message:
              input.warningMessage ??
              "Shared warning",
            occurredAt: input.generatedAt,
          },
        ];

  const activeViolations =
    input.violationCode === undefined
      ? []
      : [
          {
            id: `violation-${input.snapshotId}`,
            code: input.violationCode,
            severity: input.overallSeverity,
            message:
              input.violationMessage ??
              "Shared violation",
            occurredAt: input.generatedAt,
          },
        ];

  const circuitBreakers =
    input.circuitBreakerId === undefined
      ? []
      : [
          {
            id: input.circuitBreakerId,
            scope: "PORTFOLIO",
            status: "TRIGGERED",
            manuallyTriggered: false,
          },
        ];

  return {
    snapshotId: input.snapshotId,
    portfolioId: input.portfolioId,
    reportingCurrency:
      input.reportingCurrency ?? "USD",
    portfolio: {
      portfolioId: input.portfolioId,
      reportingCurrency:
        input.reportingCurrency ?? "USD",
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
      spotExposure: 0,
      marginExposure: 0,
      derivativesExposure: 0,
      leveragedExposure: 0,
      concentrationExposure: 0,
      currencyExposures: [],
    },
    performance: {},
    activeWarnings,
    activeViolations,
    circuitBreakers,
    overallSeverity:
      input.overallSeverity,
    tradingAllowed:
      input.tradingAllowed,
    generatedAt:
      input.generatedAt,
    metadata: {},
  } as unknown as EnterpriseRiskSnapshot;
}

function testAggregateTotals(): void {
  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  const result = aggregator.aggregate([
    createSnapshot({
      snapshotId: "snapshot-a",
      portfolioId: "portfolio-a",
      generatedAt: 1_000,
      totalEquity: 100_000,
      cashBalance: 30_000,
      grossExposure: 70_000,
      netExposure: 50_000,
      longExposure: 60_000,
      shortExposure: 10_000,
      realizedPnl: 2_000,
      unrealizedPnl: 1_000,
      dailyPnl: 500,
      weeklyPnl: 1_500,
      monthlyPnl: 3_000,
      openPositionCount: 4,
      overallSeverity: "LOW",
      tradingAllowed: true,
    }),
    createSnapshot({
      snapshotId: "snapshot-b",
      portfolioId: "portfolio-b",
      generatedAt: 2_000,
      totalEquity: 50_000,
      cashBalance: 20_000,
      grossExposure: 30_000,
      netExposure: -5_000,
      longExposure: 12_500,
      shortExposure: 17_500,
      realizedPnl: -500,
      unrealizedPnl: 750,
      dailyPnl: -100,
      weeklyPnl: 400,
      monthlyPnl: 900,
      openPositionCount: 2,
      overallSeverity: "MEDIUM",
      tradingAllowed: true,
    }),
  ]);

  assertEqual(result.snapshotCount, 2, "Snapshot count should be preserved.");
  assertEqual(result.totalEquity, 150_000, "Total equity should be summed.");
  assertEqual(result.totalCashBalance, 50_000, "Cash balance should be summed.");
  assertEqual(result.totalGrossExposure, 100_000, "Gross exposure should be summed.");
  assertEqual(result.totalNetExposure, 45_000, "Net exposure should be summed.");
  assertEqual(result.totalLongExposure, 72_500, "Long exposure should be summed.");
  assertEqual(result.totalShortExposure, 27_500, "Short exposure should be summed.");
  assertEqual(result.totalRealizedPnl, 1_500, "Realized PnL should be summed.");
  assertEqual(result.totalUnrealizedPnl, 1_750, "Unrealized PnL should be summed.");
  assertEqual(result.totalDailyPnl, 400, "Daily PnL should be summed.");
  assertEqual(result.totalWeeklyPnl, 1_900, "Weekly PnL should be summed.");
  assertEqual(result.totalMonthlyPnl, 3_900, "Monthly PnL should be summed.");
  assertEqual(result.totalOpenPositionCount, 6, "Open positions should be summed.");
  assertEqual(result.latestGeneratedAt, 2_000, "Latest timestamp should be selected.");
}

function testSeverityAndTradingPermission(): void {
  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  const result = aggregator.aggregate([
    createSnapshot({
      snapshotId: "snapshot-low",
      portfolioId: "portfolio-low",
      generatedAt: 1_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "LOW",
      tradingAllowed: true,
    }),
    createSnapshot({
      snapshotId: "snapshot-critical",
      portfolioId: "portfolio-critical",
      generatedAt: 2_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "CRITICAL",
      tradingAllowed: false,
    }),
  ]);

  assertEqual(result.overallSeverity, "CRITICAL", "The highest severity should win.");
  assertEqual(result.tradingAllowed, false, "Any blocked snapshot should block trading.");
}

function testDeterministicPortfolioOrdering(): void {
  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  const result = aggregator.aggregate([
    createSnapshot({
      snapshotId: "snapshot-c",
      portfolioId: "portfolio-c",
      reportingCurrency: "EUR",
      generatedAt: 3_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "INFO",
      tradingAllowed: true,
    }),
    createSnapshot({
      snapshotId: "snapshot-a",
      portfolioId: "portfolio-a",
      reportingCurrency: "USD",
      generatedAt: 1_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "INFO",
      tradingAllowed: true,
    }),
    createSnapshot({
      snapshotId: "snapshot-b",
      portfolioId: "portfolio-b",
      reportingCurrency: "GBP",
      generatedAt: 2_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "INFO",
      tradingAllowed: true,
    }),
  ]);

  assertEqual(result.portfolioIds[0], "portfolio-a", "Portfolio IDs should be sorted.");
  assertEqual(result.portfolioIds[1], "portfolio-b", "Portfolio IDs should be sorted.");
  assertEqual(result.portfolioIds[2], "portfolio-c", "Portfolio IDs should be sorted.");
  assertEqual(result.reportingCurrencies[0], "EUR", "Currencies should be sorted.");
  assertEqual(result.reportingCurrencies[1], "GBP", "Currencies should be sorted.");
  assertEqual(result.reportingCurrencies[2], "USD", "Currencies should be sorted.");
}

function testRiskArtifactDeduplication(): void {
  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  const result = aggregator.aggregate([
    createSnapshot({
      snapshotId: "snapshot-a",
      portfolioId: "portfolio-a",
      generatedAt: 1_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "HIGH",
      tradingAllowed: false,
      warningCode: "WARN_SHARED",
      warningMessage: "Shared warning",
      violationCode: "VIOLATION_SHARED",
      violationMessage: "Shared violation",
      circuitBreakerId: "breaker-shared",
    }),
    createSnapshot({
      snapshotId: "snapshot-b",
      portfolioId: "portfolio-b",
      generatedAt: 2_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "HIGH",
      tradingAllowed: false,
      warningCode: "WARN_SHARED",
      warningMessage: "Shared warning",
      violationCode: "VIOLATION_SHARED",
      violationMessage: "Shared violation",
      circuitBreakerId: "breaker-shared",
    }),
  ]);

  assertEqual(result.activeWarnings.length, 1, "Warnings should be deduplicated.");
  assertEqual(result.activeViolations.length, 1, "Violations should be deduplicated.");
  assertEqual(result.circuitBreakers.length, 1, "Circuit breakers should be deduplicated.");
}

function testImmutableResult(): void {
  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  const result = aggregator.aggregate([
    createSnapshot({
      snapshotId: "snapshot-immutable",
      portfolioId: "portfolio-immutable",
      generatedAt: 1_000,
      totalEquity: 1,
      cashBalance: 1,
      grossExposure: 0,
      netExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      openPositionCount: 0,
      overallSeverity: "INFO",
      tradingAllowed: true,
      warningCode: "IMMUTABLE_WARNING",
    }),
  ]);

  assertCondition(Object.isFrozen(result), "The aggregation result should be frozen.");
  assertCondition(Object.isFrozen(result.portfolioIds), "Portfolio IDs should be frozen.");
  assertCondition(Object.isFrozen(result.activeWarnings), "Warnings should be frozen.");
  assertCondition(
    result.activeWarnings[0] === undefined ||
      Object.isFrozen(result.activeWarnings[0]),
    "Warning entries should be frozen.",
  );
}

function testEmptyAggregationRejected(): void {
  const aggregator =
    createEnterpriseRiskPortfolioAggregator();

  let thrown: unknown;

  try {
    aggregator.aggregate([]);
  } catch (error) {
    thrown = error;
  }

  assertCondition(
    thrown instanceof EnterpriseRiskValidationError,
    "An empty snapshot array should be rejected.",
  );
}

function run(): void {
  testAggregateTotals();
  testSeverityAndTradingPermission();
  testDeterministicPortfolioOrdering();
  testRiskArtifactDeduplication();
  testImmutableResult();
  testEmptyAggregationRejected();

  console.log(
    "All enterprise-risk portfolio aggregator tests passed successfully.",
  );
}

run();