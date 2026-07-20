/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 2: AI portfolio validator.
 */

import {
  AIPortfolioErrorCode,
  type AIPortfolioErrorDetails,
  type AIPortfolioManagerConfiguration,
  type AIPortfolioManagerRequest,
  type AssetReturnSeries,
  type PortfolioAllocationPolicy,
  type PortfolioAllocationTarget,
  type PortfolioConstraint,
  type PortfolioCorrelationMatrix,
  type PortfolioCovarianceMatrix,
  type PortfolioMetadata,
  type PortfolioOptimizationAsset,
  type PortfolioRebalancePlan,
  type PortfolioRiskBudget,
  type PortfolioSnapshot,
} from "./ai-portfolio-contracts";

export interface AIPortfolioValidationIssue {
  readonly code: AIPortfolioErrorCode;
  readonly field: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly targetId?: string;
  readonly metadata?: PortfolioMetadata;
}

export interface AIPortfolioValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AIPortfolioValidationIssue[];
}

export interface AIPortfolioValidatorClock {
  now(): number;
}

export interface AIPortfolioValidatorOptions {
  readonly monetaryTolerance?: number;
  readonly weightTolerance?: number;
  readonly rejectDuplicateIdentifiers?: boolean;
  readonly requireOrderedReturnSeries?: boolean;
  readonly requirePositiveEquity?: boolean;
  readonly rejectFutureSnapshots?: boolean;
  readonly futureTimestampToleranceMilliseconds?: number;
}

interface ResolvedOptions {
  readonly monetaryTolerance: number;
  readonly weightTolerance: number;
  readonly rejectDuplicateIdentifiers: boolean;
  readonly requireOrderedReturnSeries: boolean;
  readonly requirePositiveEquity: boolean;
  readonly rejectFutureSnapshots: boolean;
  readonly futureTimestampToleranceMilliseconds: number;
}

const SYSTEM_CLOCK: AIPortfolioValidatorClock = Object.freeze({
  now: (): number => Date.now(),
});

const EMPTY_ISSUES: readonly AIPortfolioValidationIssue[] = Object.freeze([]);

export class AIPortfolioValidationError extends Error {
  public readonly code: AIPortfolioErrorCode;
  public readonly field: string;
  public readonly retryable: boolean;
  public readonly targetId?: string;
  public readonly metadata?: PortfolioMetadata;

  public constructor(issue: AIPortfolioValidationIssue) {
    super(issue.message);
    this.name = "AIPortfolioValidationError";
    this.code = issue.code;
    this.field = issue.field;
    this.retryable = issue.retryable;
    this.targetId = issue.targetId;
    this.metadata = issue.metadata;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toDetails(): AIPortfolioErrorDetails {
    return Object.freeze({
      code: this.code,
      message: this.message,
      field: this.field,
      targetId: this.targetId,
      retryable: this.retryable,
      metadata: this.metadata,
    });
  }
}

function resolveOptions(
  options: AIPortfolioValidatorOptions | undefined,
): ResolvedOptions {
  const resolved: ResolvedOptions = {
    monetaryTolerance: options?.monetaryTolerance ?? 1e-8,
    weightTolerance: options?.weightTolerance ?? 1e-8,
    rejectDuplicateIdentifiers:
      options?.rejectDuplicateIdentifiers ?? true,
    requireOrderedReturnSeries:
      options?.requireOrderedReturnSeries ?? true,
    requirePositiveEquity:
      options?.requirePositiveEquity ?? true,
    rejectFutureSnapshots:
      options?.rejectFutureSnapshots ?? true,
    futureTimestampToleranceMilliseconds:
      options?.futureTimestampToleranceMilliseconds ?? 1_000,
  };

  assertNonNegativeFinite(
    resolved.monetaryTolerance,
    "options.monetaryTolerance",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertNonNegativeFinite(
    resolved.weightTolerance,
    "options.weightTolerance",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertNonNegativeFinite(
    resolved.futureTimestampToleranceMilliseconds,
    "options.futureTimestampToleranceMilliseconds",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );

  return Object.freeze(resolved);
}

function fail(
  code: AIPortfolioErrorCode,
  field: string,
  message: string,
  retryable = false,
  targetId?: string,
  metadata?: PortfolioMetadata,
): never {
  throw new AIPortfolioValidationError(
    Object.freeze({
      code,
      field,
      message,
      retryable,
      targetId,
      metadata,
    }),
  );
}

function assertObject(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    fail(code, field, `${field} must be an object.`);
  }
}

function assertArray(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(code, field, `${field} must be an array.`);
  }
}

function assertBoolean(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    fail(code, field, `${field} must be a boolean.`);
  }
}

function assertString(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(code, field, `${field} must be a non-empty string.`);
  }
}

function assertOptionalString(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): void {
  if (value !== undefined) {
    assertString(value, field, code);
  }
}

function assertFinite(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(code, field, `${field} must be a finite number.`);
  }
}

function assertNonNegativeFinite(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is number {
  assertFinite(value, field, code);
  if (value < 0) {
    fail(code, field, `${field} must be greater than or equal to zero.`);
  }
}

function assertPositiveFinite(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is number {
  assertFinite(value, field, code);
  if (value <= 0) {
    fail(code, field, `${field} must be greater than zero.`);
  }
}

function assertOptionalFinite(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): void {
  if (value !== undefined) {
    assertFinite(value, field, code);
  }
}

function assertOptionalNonNegativeFinite(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): void {
  if (value !== undefined) {
    assertNonNegativeFinite(value, field, code);
  }
}

function assertUnit(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is number {
  assertFinite(value, field, code);
  if (value < 0 || value > 1) {
    fail(code, field, `${field} must be between 0 and 1 inclusive.`);
  }
}

function assertOptionalUnit(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): void {
  if (value !== undefined) {
    assertUnit(value, field, code);
  }
}

function assertInteger(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is number {
  assertNonNegativeFinite(value, field, code);
  if (!Number.isInteger(value)) {
    fail(code, field, `${field} must be an integer.`);
  }
}

function assertTimestamp(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): asserts value is string {
  assertString(value, field, code);
  if (!Number.isFinite(Date.parse(value))) {
    fail(code, field, `${field} must be a valid ISO-8601 timestamp.`);
  }
}

function assertOptionalTimestamp(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): void {
  if (value !== undefined) {
    assertTimestamp(value, field, code);
  }
}

function timestampMs(
  value: string,
  field: string,
  code: AIPortfolioErrorCode,
): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    fail(code, field, `${field} must be a valid ISO-8601 timestamp.`);
  }
  return parsed;
}

function assertMetadata(
  value: unknown,
  field: string,
  code: AIPortfolioErrorCode,
): void {
  if (value === undefined) {
    return;
  }

  assertObject(value, field, code);

  for (const [key, entry] of Object.entries(value)) {
    if (key.trim().length === 0) {
      fail(code, field, `${field} contains an empty metadata key.`);
    }

    const validateEntry = (item: unknown, itemField: string): void => {
      if (
        item !== null &&
        typeof item !== "string" &&
        typeof item !== "boolean" &&
        typeof item !== "number"
      ) {
        fail(code, itemField, `${itemField} contains an unsupported value.`);
      }
      if (typeof item === "number" && !Number.isFinite(item)) {
        fail(code, itemField, `${itemField} must be finite.`);
      }
    };

    if (Array.isArray(entry)) {
      entry.forEach((item, index) =>
        validateEntry(item, `${field}.${key}[${index}]`),
      );
    } else {
      validateEntry(entry, `${field}.${key}`);
    }
  }
}

function assertUnique(
  values: readonly string[],
  field: string,
  code: AIPortfolioErrorCode,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      fail(
        code,
        `${field}[${index}]`,
        `${field} contains duplicate value "${value}".`,
        false,
        value,
      );
    }
    seen.add(value);
  });
}

function validateConstraint(
  constraint: PortfolioConstraint,
  field: string,
): void {
  assertObject(constraint, field, AIPortfolioErrorCode.INVALID_POLICY);
  assertString(
    constraint.constraintId,
    `${field}.constraintId`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertString(
    constraint.type,
    `${field}.type`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertString(
    constraint.severity,
    `${field}.severity`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalString(
    constraint.targetType,
    `${field}.targetType`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalString(
    constraint.targetId,
    `${field}.targetId`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalFinite(
    constraint.minimum,
    `${field}.minimum`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalFinite(
    constraint.maximum,
    `${field}.maximum`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertBoolean(
    constraint.enabled,
    `${field}.enabled`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertMetadata(
    constraint.metadata,
    `${field}.metadata`,
    AIPortfolioErrorCode.INVALID_POLICY,
  );

  if (
    constraint.minimum !== undefined &&
    constraint.maximum !== undefined &&
    constraint.maximum < constraint.minimum
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_POLICY,
      `${field}.maximum`,
      `${field}.maximum cannot be lower than minimum.`,
    );
  }
}

export function validatePortfolioAllocationPolicy(
  policy: PortfolioAllocationPolicy,
  expectedPortfolioId?: string,
  options?: AIPortfolioValidatorOptions,
): PortfolioAllocationPolicy {
  const resolved = resolveOptions(options);

  assertObject(policy, "policy", AIPortfolioErrorCode.INVALID_POLICY);
  assertString(
    policy.policyId,
    "policy.policyId",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertString(
    policy.portfolioId,
    "policy.portfolioId",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertString(
    policy.baseCurrency,
    "policy.baseCurrency",
    AIPortfolioErrorCode.INVALID_POLICY,
  );

  assertUnit(
    policy.minimumCashReserveWeight,
    "policy.minimumCashReserveWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertUnit(
    policy.maximumInvestedWeight,
    "policy.maximumInvestedWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertUnit(
    policy.maximumSingleAssetWeight,
    "policy.maximumSingleAssetWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertUnit(
    policy.maximumSingleStrategyWeight,
    "policy.maximumSingleStrategyWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertUnit(
    policy.maximumSingleBotWeight,
    "policy.maximumSingleBotWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertUnit(
    policy.maximumSingleExchangeWeight,
    "policy.maximumSingleExchangeWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );

  assertOptionalUnit(
    policy.maximumStablecoinWeight,
    "policy.maximumStablecoinWeight",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalNonNegativeFinite(
    policy.targetVolatility,
    "policy.targetVolatility",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalNonNegativeFinite(
    policy.maximumPortfolioVolatility,
    "policy.maximumPortfolioVolatility",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalNonNegativeFinite(
    policy.maximumDrawdown,
    "policy.maximumDrawdown",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalNonNegativeFinite(
    policy.maximumTurnover,
    "policy.maximumTurnover",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  assertOptionalNonNegativeFinite(
    policy.maximumLeverage,
    "policy.maximumLeverage",
    AIPortfolioErrorCode.INVALID_POLICY,
  );

  assertArray(
    policy.constraints,
    "policy.constraints",
    AIPortfolioErrorCode.INVALID_POLICY,
  );
  policy.constraints.forEach((constraint, index) =>
    validateConstraint(constraint, `policy.constraints[${index}]`),
  );

  if (
    expectedPortfolioId !== undefined &&
    policy.portfolioId !== expectedPortfolioId
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_POLICY,
      "policy.portfolioId",
      "policy.portfolioId must match the expected portfolio.",
    );
  }

  if (
    policy.minimumCashReserveWeight + policy.maximumInvestedWeight >
    1 + resolved.weightTolerance
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_POLICY,
      "policy.maximumInvestedWeight",
      "minimumCashReserveWeight plus maximumInvestedWeight cannot exceed 1.",
    );
  }

  if (resolved.rejectDuplicateIdentifiers) {
    assertUnique(
      policy.constraints.map((constraint) => constraint.constraintId),
      "policy.constraints.constraintId",
      AIPortfolioErrorCode.INVALID_POLICY,
    );
  }

  assertMetadata(
    policy.metadata,
    "policy.metadata",
    AIPortfolioErrorCode.INVALID_POLICY,
  );

  return policy;
}

export function validatePortfolioSnapshot(
  snapshot: PortfolioSnapshot,
  options?: AIPortfolioValidatorOptions,
  clock: AIPortfolioValidatorClock = SYSTEM_CLOCK,
): PortfolioSnapshot {
  const resolved = resolveOptions(options);

  assertObject(
    snapshot,
    "snapshot",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertString(
    snapshot.snapshotId,
    "snapshot.snapshotId",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertString(
    snapshot.portfolioId,
    "snapshot.portfolioId",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertString(
    snapshot.baseCurrency,
    "snapshot.baseCurrency",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );

  if (resolved.requirePositiveEquity) {
    assertPositiveFinite(
      snapshot.totalEquity,
      "snapshot.totalEquity",
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    );
  } else {
    assertNonNegativeFinite(
      snapshot.totalEquity,
      "snapshot.totalEquity",
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    );
  }

  [
    ["availableCapital", snapshot.availableCapital],
    ["reservedCapital", snapshot.reservedCapital],
    ["investedCapital", snapshot.investedCapital],
    ["grossExposure", snapshot.grossExposure],
    ["longExposure", snapshot.longExposure],
    ["shortExposure", snapshot.shortExposure],
  ].forEach(([name, value]) =>
    assertNonNegativeFinite(
      value,
      `snapshot.${String(name)}`,
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    ),
  );

  [
    ["netExposure", snapshot.netExposure],
    ["realizedPnl", snapshot.realizedPnl],
    ["unrealizedPnl", snapshot.unrealizedPnl],
  ].forEach(([name, value]) =>
    assertFinite(
      value,
      `snapshot.${String(name)}`,
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    ),
  );

  assertOptionalFinite(
    snapshot.dailyPnl,
    "snapshot.dailyPnl",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertOptionalNonNegativeFinite(
    snapshot.leverage,
    "snapshot.leverage",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertOptionalUnit(
    snapshot.marginUtilization,
    "snapshot.marginUtilization",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );

  assertArray(
    snapshot.balances,
    "snapshot.balances",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertArray(
    snapshot.positions,
    "snapshot.positions",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertArray(
    snapshot.strategyExposures,
    "snapshot.strategyExposures",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertArray(
    snapshot.botExposures,
    "snapshot.botExposures",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );
  assertArray(
    snapshot.exchangeExposures,
    "snapshot.exchangeExposures",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );

  snapshot.balances.forEach((balance, index) => {
    const field = `snapshot.balances[${index}]`;
    assertString(balance.asset, `${field}.asset`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(balance.total, `${field}.total`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(balance.available, `${field}.available`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(balance.reserved, `${field}.reserved`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(balance.valuationPrice, `${field}.valuationPrice`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(balance.valuationCurrency, `${field}.valuationCurrency`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertFinite(balance.marketValue, `${field}.marketValue`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertTimestamp(balance.updatedAt, `${field}.updatedAt`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertMetadata(balance.metadata, `${field}.metadata`, AIPortfolioErrorCode.INVALID_SNAPSHOT);

    if (balance.available > balance.total || balance.reserved > balance.total) {
      fail(
        AIPortfolioErrorCode.INVALID_SNAPSHOT,
        field,
        `${field} contains available or reserved capital greater than total.`,
      );
    }
  });

  snapshot.positions.forEach((position, index) => {
    const field = `snapshot.positions[${index}]`;
    assertString(position.positionId, `${field}.positionId`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(position.marketSymbol, `${field}.marketSymbol`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(position.baseAsset, `${field}.baseAsset`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(position.quoteAsset, `${field}.quoteAsset`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(position.marketType, `${field}.marketType`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(position.side, `${field}.side`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(position.quantity, `${field}.quantity`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(position.averageEntryPrice, `${field}.averageEntryPrice`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(position.markPrice, `${field}.markPrice`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertFinite(position.marketValue, `${field}.marketValue`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertNonNegativeFinite(position.notionalValue, `${field}.notionalValue`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertFinite(position.realizedPnl, `${field}.realizedPnl`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertFinite(position.unrealizedPnl, `${field}.unrealizedPnl`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertString(position.exchangeId, `${field}.exchangeId`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertOptionalTimestamp(position.openedAt, `${field}.openedAt`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertTimestamp(position.updatedAt, `${field}.updatedAt`, AIPortfolioErrorCode.INVALID_SNAPSHOT);
    assertMetadata(position.metadata, `${field}.metadata`, AIPortfolioErrorCode.INVALID_SNAPSHOT);

    if (
      position.openedAt !== undefined &&
      timestampMs(position.updatedAt, `${field}.updatedAt`, AIPortfolioErrorCode.INVALID_SNAPSHOT) <
        timestampMs(position.openedAt, `${field}.openedAt`, AIPortfolioErrorCode.INVALID_SNAPSHOT)
    ) {
      fail(
        AIPortfolioErrorCode.INVALID_SNAPSHOT,
        `${field}.updatedAt`,
        `${field}.updatedAt cannot be earlier than openedAt.`,
      );
    }
  });

  assertTimestamp(
    snapshot.capturedAt,
    "snapshot.capturedAt",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );

  if (
    resolved.rejectFutureSnapshots &&
    timestampMs(
      snapshot.capturedAt,
      "snapshot.capturedAt",
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    ) >
      clock.now() + resolved.futureTimestampToleranceMilliseconds
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
      "snapshot.capturedAt",
      "snapshot.capturedAt cannot be in the future.",
      true,
    );
  }

  if (snapshot.availableCapital > snapshot.totalEquity) {
    fail(
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
      "snapshot.availableCapital",
      "snapshot.availableCapital cannot exceed totalEquity.",
    );
  }

  if (
    Math.abs(
      snapshot.grossExposure -
        (snapshot.longExposure + snapshot.shortExposure),
    ) > resolved.monetaryTolerance
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
      "snapshot.grossExposure",
      "snapshot.grossExposure must equal longExposure plus shortExposure.",
    );
  }

  if (resolved.rejectDuplicateIdentifiers) {
    assertUnique(
      snapshot.positions.map((position) => position.positionId),
      "snapshot.positions.positionId",
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    );
    assertUnique(
      snapshot.strategyExposures.map((exposure) => exposure.strategyId),
      "snapshot.strategyExposures.strategyId",
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    );
    assertUnique(
      snapshot.botExposures.map((exposure) => exposure.botId),
      "snapshot.botExposures.botId",
      AIPortfolioErrorCode.INVALID_SNAPSHOT,
    );
  }

  assertMetadata(
    snapshot.metadata,
    "snapshot.metadata",
    AIPortfolioErrorCode.INVALID_SNAPSHOT,
  );

  return snapshot;
}

export function validateAssetReturnSeries(
  seriesList: readonly AssetReturnSeries[],
  options?: AIPortfolioValidatorOptions,
): readonly AssetReturnSeries[] {
  const resolved = resolveOptions(options);

  assertArray(
    seriesList,
    "returnSeries",
    AIPortfolioErrorCode.INVALID_RETURN_SERIES,
  );

  seriesList.forEach((series, seriesIndex) => {
    const field = `returnSeries[${seriesIndex}]`;
    assertString(
      series.asset,
      `${field}.asset`,
      AIPortfolioErrorCode.INVALID_RETURN_SERIES,
    );
    assertArray(
      series.observations,
      `${field}.observations`,
      AIPortfolioErrorCode.INVALID_RETURN_SERIES,
    );

    if (series.observations.length === 0) {
      fail(
        AIPortfolioErrorCode.INSUFFICIENT_DATA,
        `${field}.observations`,
        `${field}.observations must not be empty.`,
        true,
        series.asset,
      );
    }

    let previousTimestampMilliseconds: number | undefined;

    series.observations.forEach((observation, observationIndex) => {
      const observationField =
        `${field}.observations[${observationIndex}]`;

      assertTimestamp(
        observation.timestamp,
        `${observationField}.timestamp`,
        AIPortfolioErrorCode.INVALID_RETURN_SERIES,
      );
      assertFinite(
        observation.returnValue,
        `${observationField}.returnValue`,
        AIPortfolioErrorCode.INVALID_RETURN_SERIES,
      );
      assertOptionalNonNegativeFinite(
        observation.equity,
        `${observationField}.equity`,
        AIPortfolioErrorCode.INVALID_RETURN_SERIES,
      );

      const currentTimestampMilliseconds = timestampMs(
        observation.timestamp,
        `${observationField}.timestamp`,
        AIPortfolioErrorCode.INVALID_RETURN_SERIES,
      );

      if (
        resolved.requireOrderedReturnSeries &&
        previousTimestampMilliseconds !== undefined &&
        currentTimestampMilliseconds <= previousTimestampMilliseconds
      ) {
        fail(
          AIPortfolioErrorCode.INVALID_RETURN_SERIES,
          `${observationField}.timestamp`,
          `${field}.observations must use strictly increasing timestamps.`,
          false,
          series.asset,
        );
      }

      previousTimestampMilliseconds = currentTimestampMilliseconds;
    });
  });

  if (resolved.rejectDuplicateIdentifiers) {
    assertUnique(
      seriesList.map((series) => series.asset),
      "returnSeries.asset",
      AIPortfolioErrorCode.INVALID_RETURN_SERIES,
    );
  }

  return seriesList;
}

function validateAllocationTarget(
  target: PortfolioAllocationTarget,
  field: string,
): void {
  assertObject(target, field, AIPortfolioErrorCode.INVALID_REQUEST);
  assertString(target.targetType, `${field}.targetType`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertString(target.targetId, `${field}.targetId`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertNonNegativeFinite(target.currentCapital, `${field}.currentCapital`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertUnit(target.currentWeight, `${field}.currentWeight`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalNonNegativeFinite(target.minimumCapital, `${field}.minimumCapital`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalNonNegativeFinite(target.maximumCapital, `${field}.maximumCapital`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalUnit(target.minimumWeight, `${field}.minimumWeight`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalUnit(target.maximumWeight, `${field}.maximumWeight`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalFinite(target.expectedReturn, `${field}.expectedReturn`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalNonNegativeFinite(target.expectedRisk, `${field}.expectedRisk`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalUnit(target.performanceScore, `${field}.performanceScore`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertOptionalUnit(target.liquidityScore, `${field}.liquidityScore`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertBoolean(target.enabled, `${field}.enabled`, AIPortfolioErrorCode.INVALID_REQUEST);
  assertMetadata(target.metadata, `${field}.metadata`, AIPortfolioErrorCode.INVALID_REQUEST);

  if (
    target.minimumCapital !== undefined &&
    target.maximumCapital !== undefined &&
    target.maximumCapital < target.minimumCapital
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      `${field}.maximumCapital`,
      `${field}.maximumCapital cannot be lower than minimumCapital.`,
    );
  }

  if (
    target.minimumWeight !== undefined &&
    target.maximumWeight !== undefined &&
    target.maximumWeight < target.minimumWeight
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      `${field}.maximumWeight`,
      `${field}.maximumWeight cannot be lower than minimumWeight.`,
    );
  }
}

export function validatePortfolioRiskBudget(
  budget: PortfolioRiskBudget,
  expectedPortfolioId?: string,
  options?: AIPortfolioValidatorOptions,
): PortfolioRiskBudget {
  const resolved = resolveOptions(options);

  assertObject(
    budget,
    "riskBudget",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertString(
    budget.portfolioId,
    "riskBudget.portfolioId",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertNonNegativeFinite(
    budget.totalRiskBudget,
    "riskBudget.totalRiskBudget",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertOptionalNonNegativeFinite(
    budget.volatilityBudget,
    "riskBudget.volatilityBudget",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertOptionalNonNegativeFinite(
    budget.drawdownBudget,
    "riskBudget.drawdownBudget",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertOptionalNonNegativeFinite(
    budget.valueAtRiskBudget,
    "riskBudget.valueAtRiskBudget",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertOptionalNonNegativeFinite(
    budget.conditionalValueAtRiskBudget,
    "riskBudget.conditionalValueAtRiskBudget",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );
  assertArray(
    budget.targets,
    "riskBudget.targets",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );

  budget.targets.forEach((target, index) => {
    const field = `riskBudget.targets[${index}]`;
    assertString(target.type, `${field}.type`, AIPortfolioErrorCode.INVALID_RISK_BUDGET);
    assertString(target.targetId, `${field}.targetId`, AIPortfolioErrorCode.INVALID_RISK_BUDGET);
    assertUnit(target.targetRiskWeight, `${field}.targetRiskWeight`, AIPortfolioErrorCode.INVALID_RISK_BUDGET);
    assertUnit(target.maximumRiskWeight, `${field}.maximumRiskWeight`, AIPortfolioErrorCode.INVALID_RISK_BUDGET);
    assertOptionalUnit(target.currentRiskWeight, `${field}.currentRiskWeight`, AIPortfolioErrorCode.INVALID_RISK_BUDGET);
    assertOptionalNonNegativeFinite(target.riskAmount, `${field}.riskAmount`, AIPortfolioErrorCode.INVALID_RISK_BUDGET);

    if (target.targetRiskWeight > target.maximumRiskWeight) {
      fail(
        AIPortfolioErrorCode.INVALID_RISK_BUDGET,
        `${field}.targetRiskWeight`,
        `${field}.targetRiskWeight cannot exceed maximumRiskWeight.`,
      );
    }
  });

  assertTimestamp(
    budget.generatedAt,
    "riskBudget.generatedAt",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );

  if (
    expectedPortfolioId !== undefined &&
    budget.portfolioId !== expectedPortfolioId
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_RISK_BUDGET,
      "riskBudget.portfolioId",
      "riskBudget.portfolioId must match the expected portfolio.",
    );
  }

  if (
    budget.targets.reduce(
      (sum, target) => sum + target.targetRiskWeight,
      0,
    ) >
    1 + resolved.weightTolerance
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_RISK_BUDGET,
      "riskBudget.targets",
      "The sum of targetRiskWeight values cannot exceed 1.",
    );
  }

  if (resolved.rejectDuplicateIdentifiers) {
    assertUnique(
      budget.targets.map(
        (target) => `${target.type}:${target.targetId}`,
      ),
      "riskBudget.targets",
      AIPortfolioErrorCode.INVALID_RISK_BUDGET,
    );
  }

  assertMetadata(
    budget.metadata,
    "riskBudget.metadata",
    AIPortfolioErrorCode.INVALID_RISK_BUDGET,
  );

  return budget;
}

export function validatePortfolioCorrelationMatrix(
  matrix: PortfolioCorrelationMatrix,
  options?: AIPortfolioValidatorOptions,
): PortfolioCorrelationMatrix {
  const resolved = resolveOptions(options);

  assertObject(
    matrix,
    "correlationMatrix",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertArray(
    matrix.assets,
    "correlationMatrix.assets",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertArray(
    matrix.values,
    "correlationMatrix.values",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  matrix.assets.forEach((asset, index) =>
    assertString(
      asset,
      `correlationMatrix.assets[${index}]`,
      AIPortfolioErrorCode.INVALID_REQUEST,
    ),
  );

  if (matrix.values.length !== matrix.assets.length) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      "correlationMatrix.values",
      "correlationMatrix must be square.",
    );
  }

  matrix.values.forEach((row, rowIndex) => {
    if (row.length !== matrix.assets.length) {
      fail(
        AIPortfolioErrorCode.INVALID_REQUEST,
        `correlationMatrix.values[${rowIndex}]`,
        "correlationMatrix must be square.",
      );
    }

    row.forEach((value, columnIndex) => {
      assertFinite(
        value,
        `correlationMatrix.values[${rowIndex}][${columnIndex}]`,
        AIPortfolioErrorCode.INVALID_REQUEST,
      );

      if (value < -1 || value > 1) {
        fail(
          AIPortfolioErrorCode.INVALID_REQUEST,
          `correlationMatrix.values[${rowIndex}][${columnIndex}]`,
          "Correlation values must be between -1 and 1.",
        );
      }

      if (
        rowIndex === columnIndex &&
        Math.abs(value - 1) > resolved.weightTolerance
      ) {
        fail(
          AIPortfolioErrorCode.INVALID_REQUEST,
          `correlationMatrix.values[${rowIndex}][${columnIndex}]`,
          "Correlation diagonal values must equal 1.",
        );
      }
    });
  });

  assertInteger(
    matrix.observationCount,
    "correlationMatrix.observationCount",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertTimestamp(
    matrix.generatedAt,
    "correlationMatrix.generatedAt",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  return matrix;
}

export function validatePortfolioCovarianceMatrix(
  matrix: PortfolioCovarianceMatrix,
  options?: AIPortfolioValidatorOptions,
): PortfolioCovarianceMatrix {
  const resolved = resolveOptions(options);

  assertObject(
    matrix,
    "covarianceMatrix",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertArray(
    matrix.assets,
    "covarianceMatrix.assets",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertArray(
    matrix.values,
    "covarianceMatrix.values",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  if (matrix.values.length !== matrix.assets.length) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      "covarianceMatrix.values",
      "covarianceMatrix must be square.",
    );
  }

  matrix.values.forEach((row, rowIndex) => {
    if (row.length !== matrix.assets.length) {
      fail(
        AIPortfolioErrorCode.INVALID_REQUEST,
        `covarianceMatrix.values[${rowIndex}]`,
        "covarianceMatrix must be square.",
      );
    }

    row.forEach((value, columnIndex) => {
      assertFinite(
        value,
        `covarianceMatrix.values[${rowIndex}][${columnIndex}]`,
        AIPortfolioErrorCode.INVALID_REQUEST,
      );

      if (rowIndex === columnIndex && value < 0) {
        fail(
          AIPortfolioErrorCode.INVALID_REQUEST,
          `covarianceMatrix.values[${rowIndex}][${columnIndex}]`,
          "Covariance diagonal values cannot be negative.",
        );
      }

      const mirror = matrix.values[columnIndex]?.[rowIndex];
      if (
        mirror !== undefined &&
        Math.abs(value - mirror) > resolved.monetaryTolerance
      ) {
        fail(
          AIPortfolioErrorCode.INVALID_REQUEST,
          `covarianceMatrix.values[${rowIndex}][${columnIndex}]`,
          "covarianceMatrix must be symmetric.",
        );
      }
    });
  });

  assertInteger(
    matrix.observationCount,
    "covarianceMatrix.observationCount",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertTimestamp(
    matrix.generatedAt,
    "covarianceMatrix.generatedAt",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  return matrix;
}

export function validateAIPortfolioManagerConfiguration(
  configuration: AIPortfolioManagerConfiguration,
  expectedPortfolioId?: string,
  options?: AIPortfolioValidatorOptions,
): AIPortfolioManagerConfiguration {
  resolveOptions(options);

  assertObject(
    configuration,
    "configuration",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertString(
    configuration.portfolioId,
    "configuration.portfolioId",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertString(
    configuration.mode,
    "configuration.mode",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertBoolean(
    configuration.enabled,
    "configuration.enabled",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );

  assertString(
    configuration.optimizationPreferences.objective,
    "configuration.optimizationPreferences.objective",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertString(
    configuration.optimizationPreferences.method,
    "configuration.optimizationPreferences.method",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertOptionalNonNegativeFinite(
    configuration.optimizationPreferences.riskAversion,
    "configuration.optimizationPreferences.riskAversion",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertOptionalUnit(
    configuration.optimizationPreferences.targetCashWeight,
    "configuration.optimizationPreferences.targetCashWeight",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );

  validatePortfolioAllocationPolicy(
    configuration.allocationPolicy,
    configuration.portfolioId,
    options,
  );

  assertUnit(
    configuration.rebalanceDriftThreshold,
    "configuration.rebalanceDriftThreshold",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertNonNegativeFinite(
    configuration.minimumRebalanceIntervalMilliseconds,
    "configuration.minimumRebalanceIntervalMilliseconds",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertPositiveFinite(
    configuration.maximumDecisionAgeMilliseconds,
    "configuration.maximumDecisionAgeMilliseconds",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );

  assertBoolean(
    configuration.requireFreshMarketData,
    "configuration.requireFreshMarketData",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertBoolean(
    configuration.requireRiskBudget,
    "configuration.requireRiskBudget",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertBoolean(
    configuration.requireExplanation,
    "configuration.requireExplanation",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );
  assertBoolean(
    configuration.allowAutomaticRebalancing,
    "configuration.allowAutomaticRebalancing",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );

  if (
    expectedPortfolioId !== undefined &&
    configuration.portfolioId !== expectedPortfolioId
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_CONFIGURATION,
      "configuration.portfolioId",
      "configuration.portfolioId must match request.portfolioId.",
    );
  }

  assertMetadata(
    configuration.metadata,
    "configuration.metadata",
    AIPortfolioErrorCode.INVALID_CONFIGURATION,
  );

  return configuration;
}

export function validateAIPortfolioManagerRequest(
  request: AIPortfolioManagerRequest,
  options?: AIPortfolioValidatorOptions,
  clock: AIPortfolioValidatorClock = SYSTEM_CLOCK,
): AIPortfolioManagerRequest {
  const resolved = resolveOptions(options);

  assertObject(
    request,
    "request",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertString(
    request.requestId,
    "request.requestId",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  assertString(
    request.portfolioId,
    "request.portfolioId",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  validatePortfolioSnapshot(request.snapshot, options, clock);

  if (request.snapshot.portfolioId !== request.portfolioId) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      "request.snapshot.portfolioId",
      "request.snapshot.portfolioId must match request.portfolioId.",
    );
  }

  validateAIPortfolioManagerConfiguration(
    request.configuration,
    request.portfolioId,
    options,
  );

  validateAssetReturnSeries(request.returnSeries, options);

  assertArray(
    request.allocationTargets,
    "request.allocationTargets",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  request.allocationTargets.forEach((target, index) =>
    validateAllocationTarget(
      target,
      `request.allocationTargets[${index}]`,
    ),
  );

  if (resolved.rejectDuplicateIdentifiers) {
    assertUnique(
      request.allocationTargets.map(
        (target) => `${target.targetType}:${target.targetId}`,
      ),
      "request.allocationTargets",
      AIPortfolioErrorCode.INVALID_REQUEST,
    );
  }

  if (
    request.configuration.requireRiskBudget &&
    request.riskBudget === undefined
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_RISK_BUDGET,
      "request.riskBudget",
      "request.riskBudget is required by configuration.",
    );
  }

  if (request.riskBudget !== undefined) {
    validatePortfolioRiskBudget(
      request.riskBudget,
      request.portfolioId,
      options,
    );
  }

  assertTimestamp(
    request.requestedAt,
    "request.requestedAt",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  const requestedAtMilliseconds = timestampMs(
    request.requestedAt,
    "request.requestedAt",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );
  const capturedAtMilliseconds = timestampMs(
    request.snapshot.capturedAt,
    "request.snapshot.capturedAt",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  if (
    requestedAtMilliseconds >
    clock.now() + resolved.futureTimestampToleranceMilliseconds
  ) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      "request.requestedAt",
      "request.requestedAt cannot be in the future.",
      true,
    );
  }

  if (capturedAtMilliseconds > requestedAtMilliseconds) {
    fail(
      AIPortfolioErrorCode.INVALID_REQUEST,
      "request.snapshot.capturedAt",
      "snapshot.capturedAt cannot be later than request.requestedAt.",
      true,
    );
  }

  if (
    request.configuration.requireFreshMarketData &&
    requestedAtMilliseconds - capturedAtMilliseconds >
      request.configuration.maximumDecisionAgeMilliseconds
  ) {
    fail(
      AIPortfolioErrorCode.STALE_DATA,
      "request.snapshot.capturedAt",
      "The portfolio snapshot is stale.",
      true,
    );
  }

  const assetsWithReturns = new Set(
    request.returnSeries.map((series) => series.asset),
  );

  request.allocationTargets.forEach((target, index) => {
    if (
      target.targetType === "ASSET" &&
      target.enabled &&
      !assetsWithReturns.has(target.targetId)
    ) {
      fail(
        AIPortfolioErrorCode.INSUFFICIENT_DATA,
        `request.allocationTargets[${index}].targetId`,
        `No return series is available for asset "${target.targetId}".`,
        true,
        target.targetId,
      );
    }
  });

  assertMetadata(
    request.metadata,
    "request.metadata",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  return request;
}

export function inspectAIPortfolioManagerRequest(
  request: unknown,
  options?: AIPortfolioValidatorOptions,
  clock: AIPortfolioValidatorClock = SYSTEM_CLOCK,
): AIPortfolioValidationResult {
  try {
    validateAIPortfolioManagerRequest(
      request as AIPortfolioManagerRequest,
      options,
      clock,
    );

    return Object.freeze({
      valid: true,
      issues: EMPTY_ISSUES,
    });
  } catch (error) {
    if (error instanceof AIPortfolioValidationError) {
      return Object.freeze({
        valid: false,
        issues: Object.freeze([
          Object.freeze({
            code: error.code,
            field: error.field,
            message: error.message,
            retryable: error.retryable,
            targetId: error.targetId,
            metadata: error.metadata,
          }),
        ]),
      });
    }

    throw error;
  }
}

export class AIPortfolioValidator {
  private readonly options: AIPortfolioValidatorOptions;
  private readonly clock: AIPortfolioValidatorClock;

  public constructor(
    options: AIPortfolioValidatorOptions = Object.freeze({}),
    clock: AIPortfolioValidatorClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      fail(
        AIPortfolioErrorCode.INVALID_CONFIGURATION,
        "clock",
        "clock must provide a now() function.",
      );
    }

    this.options = Object.freeze({ ...options });
    this.clock = clock;
  }

  public validateConfiguration(
    configuration: AIPortfolioManagerConfiguration,
    expectedPortfolioId?: string,
  ): AIPortfolioManagerConfiguration {
    return validateAIPortfolioManagerConfiguration(
      configuration,
      expectedPortfolioId,
      this.options,
    );
  }

  public validateSnapshot(
    snapshot: PortfolioSnapshot,
  ): PortfolioSnapshot {
    return validatePortfolioSnapshot(
      snapshot,
      this.options,
      this.clock,
    );
  }

  public validateReturnSeries(
    returnSeries: readonly AssetReturnSeries[],
  ): readonly AssetReturnSeries[] {
    return validateAssetReturnSeries(returnSeries, this.options);
  }

  public validatePolicy(
    policy: PortfolioAllocationPolicy,
    expectedPortfolioId?: string,
  ): PortfolioAllocationPolicy {
    return validatePortfolioAllocationPolicy(
      policy,
      expectedPortfolioId,
      this.options,
    );
  }

  public validateRiskBudget(
    budget: PortfolioRiskBudget,
    expectedPortfolioId?: string,
  ): PortfolioRiskBudget {
    return validatePortfolioRiskBudget(
      budget,
      expectedPortfolioId,
      this.options,
    );
  }

  public validateCorrelationMatrix(
    matrix: PortfolioCorrelationMatrix,
  ): PortfolioCorrelationMatrix {
    return validatePortfolioCorrelationMatrix(matrix, this.options);
  }

  public validateCovarianceMatrix(
    matrix: PortfolioCovarianceMatrix,
  ): PortfolioCovarianceMatrix {
    return validatePortfolioCovarianceMatrix(matrix, this.options);
  }

  public validate(
    request: AIPortfolioManagerRequest,
  ): AIPortfolioManagerRequest {
    return validateAIPortfolioManagerRequest(
      request,
      this.options,
      this.clock,
    );
  }

  public inspect(request: unknown): AIPortfolioValidationResult {
    return inspectAIPortfolioManagerRequest(
      request,
      this.options,
      this.clock,
    );
  }
}

export function assertOptimizationAssets(
  assets: readonly PortfolioOptimizationAsset[],
  options?: AIPortfolioValidatorOptions,
): readonly PortfolioOptimizationAsset[] {
  const resolved = resolveOptions(options);

  assertArray(
    assets,
    "assets",
    AIPortfolioErrorCode.INVALID_REQUEST,
  );

  assets.forEach((asset, index) => {
    const field = `assets[${index}]`;
    assertString(asset.asset, `${field}.asset`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertUnit(asset.currentWeight, `${field}.currentWeight`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertNonNegativeFinite(asset.currentValue, `${field}.currentValue`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertOptionalFinite(asset.expectedReturn, `${field}.expectedReturn`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertOptionalNonNegativeFinite(asset.expectedVolatility, `${field}.expectedVolatility`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertOptionalUnit(asset.liquidityScore, `${field}.liquidityScore`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertOptionalUnit(asset.minimumWeight, `${field}.minimumWeight`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertOptionalUnit(asset.maximumWeight, `${field}.maximumWeight`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertOptionalNonNegativeFinite(asset.transactionCostRate, `${field}.transactionCostRate`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertBoolean(asset.enabled, `${field}.enabled`, AIPortfolioErrorCode.INVALID_REQUEST);
    assertMetadata(asset.metadata, `${field}.metadata`, AIPortfolioErrorCode.INVALID_REQUEST);

    if (
      asset.minimumWeight !== undefined &&
      asset.maximumWeight !== undefined &&
      asset.maximumWeight < asset.minimumWeight
    ) {
      fail(
        AIPortfolioErrorCode.INVALID_REQUEST,
        `${field}.maximumWeight`,
        `${field}.maximumWeight cannot be lower than minimumWeight.`,
      );
    }
  });

  if (resolved.rejectDuplicateIdentifiers) {
    assertUnique(
      assets.map((asset) => asset.asset),
      "assets.asset",
      AIPortfolioErrorCode.INVALID_REQUEST,
    );
  }

  return assets;
}

export function assertRebalancePlan(
  plan: PortfolioRebalancePlan,
  expectedPortfolioId?: string,
): PortfolioRebalancePlan {
  assertObject(
    plan,
    "rebalancePlan",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertString(
    plan.rebalanceId,
    "rebalancePlan.rebalanceId",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertString(
    plan.portfolioId,
    "rebalancePlan.portfolioId",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertString(
    plan.reason,
    "rebalancePlan.reason",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertString(
    plan.status,
    "rebalancePlan.status",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertArray(
    plan.trades,
    "rebalancePlan.trades",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );

  assertNonNegativeFinite(
    plan.totalBuyNotional,
    "rebalancePlan.totalBuyNotional",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertNonNegativeFinite(
    plan.totalSellNotional,
    "rebalancePlan.totalSellNotional",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertNonNegativeFinite(
    plan.estimatedTurnover,
    "rebalancePlan.estimatedTurnover",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertNonNegativeFinite(
    plan.estimatedFees,
    "rebalancePlan.estimatedFees",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertNonNegativeFinite(
    plan.estimatedSlippage,
    "rebalancePlan.estimatedSlippage",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertNonNegativeFinite(
    plan.estimatedTotalCost,
    "rebalancePlan.estimatedTotalCost",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );

  assertBoolean(
    plan.approvalRequired,
    "rebalancePlan.approvalRequired",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertTimestamp(
    plan.generatedAt,
    "rebalancePlan.generatedAt",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );
  assertOptionalTimestamp(
    plan.validUntil,
    "rebalancePlan.validUntil",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );

  if (
    plan.validUntil !== undefined &&
    timestampMs(
      plan.validUntil,
      "rebalancePlan.validUntil",
      AIPortfolioErrorCode.REBALANCE_FAILED,
    ) <
      timestampMs(
        plan.generatedAt,
        "rebalancePlan.generatedAt",
        AIPortfolioErrorCode.REBALANCE_FAILED,
      )
  ) {
    fail(
      AIPortfolioErrorCode.REBALANCE_FAILED,
      "rebalancePlan.validUntil",
      "rebalancePlan.validUntil cannot be earlier than generatedAt.",
    );
  }

  if (
    expectedPortfolioId !== undefined &&
    plan.portfolioId !== expectedPortfolioId
  ) {
    fail(
      AIPortfolioErrorCode.REBALANCE_FAILED,
      "rebalancePlan.portfolioId",
      "rebalancePlan.portfolioId must match the expected portfolio.",
    );
  }

  assertMetadata(
    plan.metadata,
    "rebalancePlan.metadata",
    AIPortfolioErrorCode.REBALANCE_FAILED,
  );

  return plan;
}