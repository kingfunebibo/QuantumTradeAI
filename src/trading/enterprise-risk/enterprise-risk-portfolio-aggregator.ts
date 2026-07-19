/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-portfolio-aggregator.ts
 *
 * Purpose:
 * Deterministically aggregate multiple enterprise-risk snapshots into a
 * consolidated portfolio-level risk summary suitable for monitoring,
 * reporting, dashboards, and downstream control decisions.
 */

import {
  EnterpriseRiskCircuitBreaker,
  EnterpriseRiskSeverity,
  EnterpriseRiskSnapshot,
  EnterpriseRiskViolation,
  EnterpriseRiskWarning,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskPortfolioAggregation {
  readonly portfolioIds: readonly string[];
  readonly reportingCurrencies:
    readonly string[];
  readonly snapshotCount: number;
  readonly totalEquity: number;
  readonly totalCashBalance: number;
  readonly totalGrossExposure: number;
  readonly totalNetExposure: number;
  readonly totalLongExposure: number;
  readonly totalShortExposure: number;
  readonly totalRealizedPnl: number;
  readonly totalUnrealizedPnl: number;
  readonly totalDailyPnl: number;
  readonly totalWeeklyPnl: number;
  readonly totalMonthlyPnl: number;
  readonly totalOpenPositionCount: number;
  readonly activeViolations:
    readonly EnterpriseRiskViolation[];
  readonly activeWarnings:
    readonly EnterpriseRiskWarning[];
  readonly circuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[];
  readonly overallSeverity:
    EnterpriseRiskSeverity;
  readonly tradingAllowed: boolean;
  readonly latestGeneratedAt: number;
}

export interface EnterpriseRiskPortfolioAggregator {
  aggregate(
    snapshots: readonly EnterpriseRiskSnapshot[],
  ): EnterpriseRiskPortfolioAggregation;
}

const SEVERITY_RANK:
  Readonly<Record<
    EnterpriseRiskSeverity,
    number
  >> = Object.freeze({
    INFO: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  });

function assertSnapshotArray(
  snapshots: unknown,
): asserts snapshots is
  readonly EnterpriseRiskSnapshot[] {
  if (!Array.isArray(snapshots)) {
    throw new EnterpriseRiskValidationError(
      "snapshots",
      "must be an array.",
    );
  }

  if (snapshots.length === 0) {
    throw new EnterpriseRiskValidationError(
      "snapshots",
      "must contain at least one snapshot.",
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a finite number.",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-empty string.",
    );
  }
}

function validateSnapshot(
  snapshot: EnterpriseRiskSnapshot,
  index: number,
): void {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  ) {
    throw new EnterpriseRiskValidationError(
      `snapshots[${index}]`,
      "must be a non-null object.",
    );
  }

  assertNonEmptyString(
    snapshot.snapshotId,
    `snapshots[${index}].snapshotId`,
  );

  assertNonEmptyString(
    snapshot.portfolioId,
    `snapshots[${index}].portfolioId`,
  );

  assertNonEmptyString(
    snapshot.reportingCurrency,
    `snapshots[${index}].reportingCurrency`,
  );

  assertFiniteNumber(
    snapshot.generatedAt,
    `snapshots[${index}].generatedAt`,
  );

  const numericPortfolioFields:
    readonly [
      keyof EnterpriseRiskSnapshot["portfolio"],
      string,
    ][] = [
      ["totalEquity", "totalEquity"],
      ["cashBalance", "cashBalance"],
      ["grossExposure", "grossExposure"],
      ["netExposure", "netExposure"],
      ["longExposure", "longExposure"],
      ["shortExposure", "shortExposure"],
      ["realizedPnl", "realizedPnl"],
      ["unrealizedPnl", "unrealizedPnl"],
      ["dailyPnl", "dailyPnl"],
      ["weeklyPnl", "weeklyPnl"],
      ["monthlyPnl", "monthlyPnl"],
      ["openPositionCount", "openPositionCount"],
    ];

  for (
    const [property, label] of
    numericPortfolioFields
  ) {
    assertFiniteNumber(
      snapshot.portfolio[property],
      `snapshots[${index}].portfolio.${label}`,
    );
  }

  if (
    !Array.isArray(
      snapshot.activeViolations,
    )
  ) {
    throw new EnterpriseRiskValidationError(
      `snapshots[${index}].activeViolations`,
      "must be an array.",
    );
  }

  if (
    !Array.isArray(
      snapshot.activeWarnings,
    )
  ) {
    throw new EnterpriseRiskValidationError(
      `snapshots[${index}].activeWarnings`,
      "must be an array.",
    );
  }

  if (
    !Array.isArray(
      snapshot.circuitBreakers,
    )
  ) {
    throw new EnterpriseRiskValidationError(
      `snapshots[${index}].circuitBreakers`,
      "must be an array.",
    );
  }
}

function deepCloneAndFreeze<T>(
  value: T,
): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) =>
        deepCloneAndFreeze(entry),
      ),
    ) as T;
  }

  const cloned: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    cloned[key] = deepCloneAndFreeze(entry);
  }

  return Object.freeze(cloned) as T;
}

function highestSeverity(
  severities:
    readonly EnterpriseRiskSeverity[],
): EnterpriseRiskSeverity {
  return severities.reduce(
    (highest, current) =>
      SEVERITY_RANK[current] >
      SEVERITY_RANK[highest]
        ? current
        : highest,
    "INFO",
  );
}

function deduplicateByKey<T>(
  entries: readonly T[],
  getKey: (entry: T) => string,
): readonly T[] {
  const unique = new Map<string, T>();

  for (const entry of entries) {
    const key = getKey(entry);

    if (!unique.has(key)) {
      unique.set(
        key,
        deepCloneAndFreeze(entry),
      );
    }
  }

  return Object.freeze(
    [...unique.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right),
      )
      .map(([, entry]) => entry),
  );
}

export class DefaultEnterpriseRiskPortfolioAggregator
  implements EnterpriseRiskPortfolioAggregator
{
  public aggregate(
    snapshots: readonly EnterpriseRiskSnapshot[],
  ): EnterpriseRiskPortfolioAggregation {
    assertSnapshotArray(snapshots);

    snapshots.forEach(
      (snapshot, index) =>
        validateSnapshot(snapshot, index),
    );

    const orderedSnapshots =
      [...snapshots].sort(
        (left, right) => {
          const portfolioComparison =
            left.portfolioId.localeCompare(
              right.portfolioId,
            );

          if (portfolioComparison !== 0) {
            return portfolioComparison;
          }

          return left.snapshotId.localeCompare(
            right.snapshotId,
          );
        },
      );

    const activeViolations =
      deduplicateByKey(
        orderedSnapshots.flatMap(
          (snapshot) =>
            snapshot.activeViolations,
        ),
        (violation) =>
          `${violation.code}:${violation.message}`,
      );

    const activeWarnings =
      deduplicateByKey(
        orderedSnapshots.flatMap(
          (snapshot) =>
            snapshot.activeWarnings,
        ),
        (warning) =>
          `${warning.code}:${warning.message}`,
      );

    const circuitBreakers =
      deduplicateByKey(
        orderedSnapshots.flatMap(
          (snapshot) =>
            snapshot.circuitBreakers,
        ),
        (circuitBreaker) =>
          circuitBreaker.id,
      );

    const result:
      EnterpriseRiskPortfolioAggregation = {
      portfolioIds: Object.freeze(
        [
          ...new Set(
            orderedSnapshots.map(
              (snapshot) =>
                snapshot.portfolioId,
            ),
          ),
        ],
      ),
      reportingCurrencies:
        Object.freeze(
          [
            ...new Set(
              orderedSnapshots.map(
                (snapshot) =>
                  snapshot.reportingCurrency,
              ),
            ),
          ].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      snapshotCount:
        orderedSnapshots.length,
      totalEquity:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.totalEquity,
          0,
        ),
      totalCashBalance:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.cashBalance,
          0,
        ),
      totalGrossExposure:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.grossExposure,
          0,
        ),
      totalNetExposure:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.netExposure,
          0,
        ),
      totalLongExposure:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.longExposure,
          0,
        ),
      totalShortExposure:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.shortExposure,
          0,
        ),
      totalRealizedPnl:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.realizedPnl,
          0,
        ),
      totalUnrealizedPnl:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.unrealizedPnl,
          0,
        ),
      totalDailyPnl:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.dailyPnl,
          0,
        ),
      totalWeeklyPnl:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.weeklyPnl,
          0,
        ),
      totalMonthlyPnl:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio.monthlyPnl,
          0,
        ),
      totalOpenPositionCount:
        orderedSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.portfolio
              .openPositionCount,
          0,
        ),
      activeViolations,
      activeWarnings,
      circuitBreakers,
      overallSeverity:
        highestSeverity(
          orderedSnapshots.map(
            (snapshot) =>
              snapshot.overallSeverity,
          ),
        ),
      tradingAllowed:
        orderedSnapshots.every(
          (snapshot) =>
            snapshot.tradingAllowed,
        ),
      latestGeneratedAt:
        Math.max(
          ...orderedSnapshots.map(
            (snapshot) =>
              snapshot.generatedAt,
          ),
        ),
    };

    return deepCloneAndFreeze(result);
  }
}

export function createEnterpriseRiskPortfolioAggregator():
  DefaultEnterpriseRiskPortfolioAggregator {
  return new DefaultEnterpriseRiskPortfolioAggregator();
}