/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/in-memory-enterprise-risk-snapshot-provider.ts
 *
 * Purpose:
 * Deterministic in-memory implementation of EnterpriseRiskSnapshotProvider
 * with immutable storage, defensive cloning, stable retrieval ordering,
 * explicit replacement, removal, and clearing operations.
 */

import {
  EnterpriseRiskSnapshot,
  EnterpriseRiskSnapshotProvider,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface MutableEnterpriseRiskSnapshotProvider
  extends EnterpriseRiskSnapshotProvider {
  save(snapshot: EnterpriseRiskSnapshot): void;
  remove(portfolioId: string): boolean;
  clear(): void;
  getAll(): readonly EnterpriseRiskSnapshot[];
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

function assertNonNegativeFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative finite number.",
    );
  }
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertArray(
  value: unknown,
  field: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new EnterpriseRiskValidationError(
      field,
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
    const clonedArray = value.map((entry) =>
      deepCloneAndFreeze(entry),
    );

    return Object.freeze(clonedArray) as T;
  }

  const clonedObject: Record<string, unknown> = {};

  for (const [
    key,
    entry,
  ] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    clonedObject[key] =
      deepCloneAndFreeze(entry);
  }

  return Object.freeze(clonedObject) as T;
}

function validateSnapshot(
  snapshot: EnterpriseRiskSnapshot,
): void {
  assertObject(snapshot, "snapshot");

  assertNonEmptyString(
    snapshot.snapshotId,
    "snapshot.snapshotId",
  );

  assertNonEmptyString(
    snapshot.portfolioId,
    "snapshot.portfolioId",
  );

  assertNonEmptyString(
    snapshot.reportingCurrency,
    "snapshot.reportingCurrency",
  );

  assertObject(
    snapshot.portfolio,
    "snapshot.portfolio",
  );

  assertObject(
    snapshot.exposures,
    "snapshot.exposures",
  );

  assertObject(
    snapshot.performance,
    "snapshot.performance",
  );

  if (snapshot.valueAtRisk !== undefined) {
    assertObject(
      snapshot.valueAtRisk,
      "snapshot.valueAtRisk",
    );
  }

  if (snapshot.correlations !== undefined) {
    assertObject(
      snapshot.correlations,
      "snapshot.correlations",
    );
  }

  assertArray(
    snapshot.activeViolations,
    "snapshot.activeViolations",
  );

  assertArray(
    snapshot.activeWarnings,
    "snapshot.activeWarnings",
  );

  assertArray(
    snapshot.circuitBreakers,
    "snapshot.circuitBreakers",
  );

  if (typeof snapshot.tradingAllowed !== "boolean") {
    throw new EnterpriseRiskValidationError(
      "snapshot.tradingAllowed",
      "must be a boolean.",
    );
  }

  assertNonNegativeFiniteNumber(
    snapshot.generatedAt,
    "snapshot.generatedAt",
  );
}

export class InMemoryEnterpriseRiskSnapshotProvider
  implements MutableEnterpriseRiskSnapshotProvider
{
  private readonly snapshots =
    new Map<string, EnterpriseRiskSnapshot>();

  public constructor(
    initialSnapshots:
      readonly EnterpriseRiskSnapshot[] = [],
  ) {
    assertArray(
      initialSnapshots,
      "initialSnapshots",
    );

    for (const snapshot of initialSnapshots) {
      this.save(snapshot);
    }
  }

  public getSnapshot(
    portfolioId: string,
  ): EnterpriseRiskSnapshot | undefined {
    assertNonEmptyString(
      portfolioId,
      "portfolioId",
    );

    const snapshot =
      this.snapshots.get(portfolioId);

    return snapshot === undefined
      ? undefined
      : deepCloneAndFreeze(snapshot);
  }

  public save(
    snapshot: EnterpriseRiskSnapshot,
  ): void {
    validateSnapshot(snapshot);

    this.snapshots.set(
      snapshot.portfolioId,
      deepCloneAndFreeze(snapshot),
    );
  }

  public remove(
    portfolioId: string,
  ): boolean {
    assertNonEmptyString(
      portfolioId,
      "portfolioId",
    );

    return this.snapshots.delete(portfolioId);
  }

  public clear(): void {
    this.snapshots.clear();
  }

  public getAll():
    readonly EnterpriseRiskSnapshot[] {
    const snapshots =
      [...this.snapshots.values()]
        .sort((left, right) =>
          left.portfolioId.localeCompare(
            right.portfolioId,
          ),
        )
        .map((snapshot) =>
          deepCloneAndFreeze(snapshot),
        );

    return Object.freeze(snapshots);
  }
}

export function createInMemoryEnterpriseRiskSnapshotProvider(
  initialSnapshots:
    readonly EnterpriseRiskSnapshot[] = [],
): InMemoryEnterpriseRiskSnapshotProvider {
  return new InMemoryEnterpriseRiskSnapshotProvider(
    initialSnapshots,
  );
}