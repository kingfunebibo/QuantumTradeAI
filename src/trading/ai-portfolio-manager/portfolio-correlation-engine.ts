/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 6: Deterministic portfolio correlation engine.
 *
 * Builds a stable Pearson correlation matrix from aligned asset return
 * observations. The implementation is deterministic, immutable, and rejects
 * malformed or insufficient input instead of silently fabricating results.
 */

import {
  type AssetReturnSeries,
  type AssetSymbol,
  type PortfolioCorrelationEngine,
  type PortfolioCorrelationMatrix,
  type PortfolioCorrelationPair,
  type PortfolioMetadata,
  type PortfolioReturnObservation,
  type Timestamp,
} from "./ai-portfolio-contracts";

export interface PortfolioCorrelationClock {
  now(): number;
}

export interface PortfolioCorrelationEngineOptions {
  /**
   * Minimum number of aligned observations required for each asset pair.
   */
  readonly minimumObservationCount?: number;

  /**
   * Numerical tolerance used for zero-variance and range comparisons.
   */
  readonly tolerance?: number;

  /**
   * Sort assets lexicographically before constructing the matrix.
   */
  readonly sortAssets?: boolean;

  /**
   * Reject duplicate asset series instead of merging them.
   */
  readonly rejectDuplicateAssets?: boolean;

  /**
   * Reject duplicate timestamps within an asset return series.
   */
  readonly rejectDuplicateTimestamps?: boolean;

  /**
   * Require every asset pair to have at least minimumObservationCount aligned
   * observations. When false, insufficient pairs receive zero correlation.
   */
  readonly requireSufficientPairData?: boolean;

  /**
   * Metadata copied into the generated correlation matrix.
   */
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedPortfolioCorrelationEngineOptions {
  readonly minimumObservationCount: number;
  readonly tolerance: number;
  readonly sortAssets: boolean;
  readonly rejectDuplicateAssets: boolean;
  readonly rejectDuplicateTimestamps: boolean;
  readonly requireSufficientPairData: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface NormalizedReturnSeries {
  readonly asset: AssetSymbol;
  readonly observationsByTimestamp: ReadonlyMap<Timestamp, number>;
  readonly observationCount: number;
}

interface PairCalculation {
  readonly correlation: number;
  readonly observationCount: number;
}

const SYSTEM_CLOCK: PortfolioCorrelationClock = Object.freeze({
  now: (): number => Date.now(),
});

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function resolveOptions(
  options: PortfolioCorrelationEngineOptions | undefined,
): ResolvedPortfolioCorrelationEngineOptions {
  const resolved: ResolvedPortfolioCorrelationEngineOptions = {
    minimumObservationCount: options?.minimumObservationCount ?? 2,
    tolerance: options?.tolerance ?? 1e-12,
    sortAssets: options?.sortAssets ?? true,
    rejectDuplicateAssets: options?.rejectDuplicateAssets ?? true,
    rejectDuplicateTimestamps:
      options?.rejectDuplicateTimestamps ?? true,
    requireSufficientPairData:
      options?.requireSufficientPairData ?? true,
    metadata: cloneMetadata(options?.metadata),
  };

  if (
    !Number.isInteger(resolved.minimumObservationCount) ||
    resolved.minimumObservationCount < 2
  ) {
    throw new RangeError(
      "options.minimumObservationCount must be an integer greater than or equal to 2.",
    );
  }

  assertFiniteNumber(resolved.tolerance, "options.tolerance");

  if (resolved.tolerance < 0) {
    throw new RangeError(
      "options.tolerance must be greater than or equal to zero.",
    );
  }

  return Object.freeze(resolved);
}

function normalizeTimestamp(
  timestamp: Timestamp,
  field: string,
): Timestamp {
  assertNonEmptyString(timestamp, field);

  const milliseconds = Date.parse(timestamp);

  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${field} must be a valid timestamp.`);
  }

  return new Date(milliseconds).toISOString();
}

function validateObservation(
  observation: PortfolioReturnObservation,
  field: string,
): void {
  normalizeTimestamp(observation.timestamp, `${field}.timestamp`);
  assertFiniteNumber(observation.returnValue, `${field}.returnValue`);

  if (observation.equity !== undefined) {
    assertFiniteNumber(observation.equity, `${field}.equity`);
  }
}

function normalizeSeries(
  series: AssetReturnSeries,
  index: number,
  options: ResolvedPortfolioCorrelationEngineOptions,
): NormalizedReturnSeries {
  const field = `returnSeries[${index}]`;

  assertNonEmptyString(series.asset, `${field}.asset`);

  if (!Array.isArray(series.observations)) {
    throw new TypeError(`${field}.observations must be an array.`);
  }

  const observationsByTimestamp = new Map<Timestamp, number>();

  series.observations.forEach((observation, observationIndex) => {
    const observationField =
      `${field}.observations[${observationIndex}]`;

    validateObservation(observation, observationField);

    const timestamp = normalizeTimestamp(
      observation.timestamp,
      `${observationField}.timestamp`,
    );

    if (
      options.rejectDuplicateTimestamps &&
      observationsByTimestamp.has(timestamp)
    ) {
      throw new Error(
        `${field} contains duplicate timestamp ${timestamp}.`,
      );
    }

    observationsByTimestamp.set(
      timestamp,
      observation.returnValue,
    );
  });

  return Object.freeze({
    asset: series.asset,
    observationsByTimestamp,
    observationCount: observationsByTimestamp.size,
  });
}

function normalizeReturnSeries(
  returnSeries: readonly AssetReturnSeries[],
  options: ResolvedPortfolioCorrelationEngineOptions,
): readonly NormalizedReturnSeries[] {
  if (!Array.isArray(returnSeries)) {
    throw new TypeError("returnSeries must be an array.");
  }

  if (returnSeries.length === 0) {
    throw new RangeError(
      "returnSeries must contain at least one asset series.",
    );
  }

  const normalized = returnSeries.map((series, index) =>
    normalizeSeries(series, index, options),
  );

  const seenAssets = new Set<string>();

  for (const series of normalized) {
    if (
      options.rejectDuplicateAssets &&
      seenAssets.has(series.asset)
    ) {
      throw new Error(
        `returnSeries contains duplicate asset ${series.asset}.`,
      );
    }

    seenAssets.add(series.asset);
  }

  if (options.sortAssets) {
    normalized.sort((left, right) =>
      left.asset.localeCompare(right.asset),
    );
  }

  return Object.freeze(normalized);
}

function clampCorrelation(
  value: number,
  tolerance: number,
): number {
  if (value > 1 && value <= 1 + tolerance) {
    return 1;
  }

  if (value < -1 && value >= -1 - tolerance) {
    return -1;
  }

  return Math.max(-1, Math.min(1, value));
}

function round(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number(value.toPrecision(15));
}

function calculatePearsonCorrelation(
  left: NormalizedReturnSeries,
  right: NormalizedReturnSeries,
  options: ResolvedPortfolioCorrelationEngineOptions,
): PairCalculation {
  if (left.asset === right.asset) {
    const count = left.observationCount;

    if (
      options.requireSufficientPairData &&
      count < options.minimumObservationCount
    ) {
      throw new RangeError(
        `Asset ${left.asset} has ${count} observations; at least ` +
          `${options.minimumObservationCount} are required.`,
      );
    }

    return Object.freeze({
      correlation: count === 0 ? 0 : 1,
      observationCount: count,
    });
  }

  const leftValues: number[] = [];
  const rightValues: number[] = [];

  const iterateLeft =
    left.observationsByTimestamp.size <=
    right.observationsByTimestamp.size;

  const source = iterateLeft
    ? left.observationsByTimestamp
    : right.observationsByTimestamp;
  const target = iterateLeft
    ? right.observationsByTimestamp
    : left.observationsByTimestamp;

  for (const [timestamp, sourceValue] of source) {
    const targetValue = target.get(timestamp);

    if (targetValue === undefined) {
      continue;
    }

    if (iterateLeft) {
      leftValues.push(sourceValue);
      rightValues.push(targetValue);
    } else {
      leftValues.push(targetValue);
      rightValues.push(sourceValue);
    }
  }

  const count = leftValues.length;

  if (count < options.minimumObservationCount) {
    if (options.requireSufficientPairData) {
      throw new RangeError(
        `Assets ${left.asset} and ${right.asset} have only ${count} ` +
          `aligned observations; at least ` +
          `${options.minimumObservationCount} are required.`,
      );
    }

    return Object.freeze({
      correlation: 0,
      observationCount: count,
    });
  }

  let leftMean = 0;
  let rightMean = 0;

  for (let index = 0; index < count; index += 1) {
    leftMean += leftValues[index] ?? 0;
    rightMean += rightValues[index] ?? 0;
  }

  leftMean /= count;
  rightMean /= count;

  let covarianceNumerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < count; index += 1) {
    const leftDeviation =
      (leftValues[index] ?? 0) - leftMean;
    const rightDeviation =
      (rightValues[index] ?? 0) - rightMean;

    covarianceNumerator += leftDeviation * rightDeviation;
    leftVariance += leftDeviation * leftDeviation;
    rightVariance += rightDeviation * rightDeviation;
  }

  if (
    leftVariance <= options.tolerance ||
    rightVariance <= options.tolerance
  ) {
    return Object.freeze({
      correlation: 0,
      observationCount: count,
    });
  }

  const denominator = Math.sqrt(
    leftVariance * rightVariance,
  );
  const rawCorrelation =
    covarianceNumerator / denominator;

  assertFiniteNumber(
    rawCorrelation,
    `correlation(${left.asset}, ${right.asset})`,
  );

  return Object.freeze({
    correlation: round(
      clampCorrelation(rawCorrelation, options.tolerance),
    ),
    observationCount: count,
  });
}

function resolveGeneratedAt(
  generatedAt: Timestamp | undefined,
  clock: PortfolioCorrelationClock,
): Timestamp {
  if (generatedAt !== undefined) {
    return normalizeTimestamp(generatedAt, "generatedAt");
  }

  const milliseconds = clock.now();
  assertFiniteNumber(milliseconds, "clock.now()");

  return new Date(milliseconds).toISOString();
}

function matrixObservationCount(
  pairCounts: readonly number[],
): number {
  if (pairCounts.length === 0) {
    return 0;
  }

  return Math.min(...pairCounts);
}

export function calculatePortfolioCorrelationMatrix(
  returnSeries: readonly AssetReturnSeries[],
  generatedAt?: Timestamp,
  options?: PortfolioCorrelationEngineOptions,
  clock: PortfolioCorrelationClock = SYSTEM_CLOCK,
): PortfolioCorrelationMatrix {
  if (typeof clock?.now !== "function") {
    throw new TypeError(
      "clock must provide a now() function.",
    );
  }

  const resolved = resolveOptions(options);
  const normalized = normalizeReturnSeries(
    returnSeries,
    resolved,
  );
  const assets = Object.freeze(
    normalized.map((series) => series.asset),
  );

  const values: number[][] = Array.from(
    { length: normalized.length },
    () => Array<number>(normalized.length).fill(0),
  );
  const pairs: PortfolioCorrelationPair[] = [];
  const pairObservationCounts: number[] = [];

  for (
    let leftIndex = 0;
    leftIndex < normalized.length;
    leftIndex += 1
  ) {
    const left = normalized[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex;
      rightIndex < normalized.length;
      rightIndex += 1
    ) {
      const right = normalized[rightIndex];

      if (right === undefined) {
        continue;
      }

      const calculation = calculatePearsonCorrelation(
        left,
        right,
        resolved,
      );

      values[leftIndex]![rightIndex] =
        calculation.correlation;
      values[rightIndex]![leftIndex] =
        calculation.correlation;

      if (leftIndex !== rightIndex) {
        pairs.push(
          Object.freeze({
            leftAsset: left.asset,
            rightAsset: right.asset,
            correlation: calculation.correlation,
            observationCount:
              calculation.observationCount,
          }),
        );
        pairObservationCounts.push(
          calculation.observationCount,
        );
      }
    }
  }

  const frozenValues = Object.freeze(
    values.map((row) => Object.freeze([...row])),
  );
  const frozenPairs = Object.freeze(
    pairs.sort((left, right) => {
      const leftDifference =
        left.leftAsset.localeCompare(right.leftAsset);

      if (leftDifference !== 0) {
        return leftDifference;
      }

      return left.rightAsset.localeCompare(
        right.rightAsset,
      );
    }),
  );
  const resolvedGeneratedAt = resolveGeneratedAt(
    generatedAt,
    clock,
  );

  const metadata: PortfolioMetadata = Object.freeze({
    ...(resolved.metadata ?? {}),
    method: "PEARSON",
    alignment: "TIMESTAMP_INTERSECTION",
    minimumObservationCount:
      resolved.minimumObservationCount,
    assetCount: assets.length,
    pairCount: frozenPairs.length,
    zeroVariancePolicy: "ZERO_CORRELATION",
  });

  return Object.freeze({
    assets,
    values: frozenValues,
    pairs: frozenPairs,
    observationCount:
      normalized.length === 1
        ? normalized[0]?.observationCount ?? 0
        : matrixObservationCount(pairObservationCounts),
    generatedAt: resolvedGeneratedAt,
    metadata,
  });
}

export class DeterministicPortfolioCorrelationEngine
  implements PortfolioCorrelationEngine
{
  private readonly options: PortfolioCorrelationEngineOptions;
  private readonly clock: PortfolioCorrelationClock;

  public constructor(
    options: PortfolioCorrelationEngineOptions =
      Object.freeze({}),
    clock: PortfolioCorrelationClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError(
        "clock must provide a now() function.",
      );
    }

    this.options = Object.freeze({
      ...options,
      metadata: cloneMetadata(options.metadata),
    });
    this.clock = clock;
  }

  public calculate(
    returnSeries: readonly AssetReturnSeries[],
    generatedAt?: Timestamp,
  ): PortfolioCorrelationMatrix {
    return calculatePortfolioCorrelationMatrix(
      returnSeries,
      generatedAt,
      this.options,
      this.clock,
    );
  }
}

/**
 * Conventional subsystem alias.
 */
export class AIPortfolioCorrelationEngine extends DeterministicPortfolioCorrelationEngine {}