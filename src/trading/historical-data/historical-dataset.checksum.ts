import { createHash } from "node:crypto";

import {
  HistoricalCandle,
  HistoricalChecksumAlgorithm,
  HistoricalCount,
  HistoricalDatasetChecksum,
  HistoricalDatasetId,
  HistoricalDatasetPartition,
  HistoricalDatasetStreamRecord,
  HistoricalTimestamp,
  historicalChecksumValue,
  historicalCount,
} from "./historical-dataset.types";

/**
 * Checksum subsystem error codes.
 */
export const HISTORICAL_DATASET_CHECKSUM_ERROR_CODES = [
  "INVALID_ALGORITHM",
  "INVALID_CALCULATION_TIMESTAMP",
  "INVALID_RECORD",
  "INVALID_PARTITION",
  "EMPTY_DATASET",
  "CHECKSUM_MISMATCH",
] as const;

export type HistoricalDatasetChecksumErrorCode =
  (typeof HISTORICAL_DATASET_CHECKSUM_ERROR_CODES)[number];

/**
 * Error thrown by checksum generation and verification operations.
 */
export class HistoricalDatasetChecksumError extends Error {
  public readonly code: HistoricalDatasetChecksumErrorCode;
  public readonly datasetId?: HistoricalDatasetId;

  public constructor(
    code: HistoricalDatasetChecksumErrorCode,
    message: string,
    datasetId?: HistoricalDatasetId,
  ) {
    super(message);

    this.name = "HistoricalDatasetChecksumError";
    this.code = code;
    this.datasetId = datasetId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Input used to calculate a checksum over a complete candle collection.
 */
export interface CalculateHistoricalDatasetChecksumInput {
  readonly datasetId: HistoricalDatasetId;
  readonly candles: readonly HistoricalCandle[];
  readonly algorithm: HistoricalChecksumAlgorithm;
  readonly calculatedAt: HistoricalTimestamp;

  /**
   * When true, empty candle collections are allowed.
   *
   * The resulting checksum is the cryptographic digest of an empty canonical
   * dataset payload.
   */
  readonly allowEmpty?: boolean;
}

/**
 * Input used to calculate a checksum for a dataset partition.
 */
export interface CalculateHistoricalPartitionChecksumInput {
  readonly partition: HistoricalDatasetPartition;
  readonly candles: readonly HistoricalCandle[];
  readonly algorithm: HistoricalChecksumAlgorithm;
  readonly calculatedAt: HistoricalTimestamp;
}

/**
 * Input used to calculate a checksum from streamed records.
 */
export interface CalculateHistoricalStreamChecksumInput {
  readonly datasetId: HistoricalDatasetId;
  readonly records: AsyncIterable<HistoricalDatasetStreamRecord>;
  readonly algorithm: HistoricalChecksumAlgorithm;
  readonly calculatedAt: HistoricalTimestamp;

  readonly allowEmpty?: boolean;
}

/**
 * Input used to verify a previously calculated checksum.
 */
export interface VerifyHistoricalDatasetChecksumInput {
  readonly datasetId: HistoricalDatasetId;
  readonly candles: readonly HistoricalCandle[];
  readonly expectedChecksum: HistoricalDatasetChecksum;
}

/**
 * Result returned by checksum verification.
 */
export interface HistoricalDatasetChecksumVerificationResult {
  readonly valid: boolean;
  readonly expected: HistoricalDatasetChecksum;
  readonly actual: HistoricalDatasetChecksum;
}

/**
 * Stateless deterministic checksum service.
 */
export interface HistoricalDatasetChecksumService {
  calculate(
    input: CalculateHistoricalDatasetChecksumInput,
  ): HistoricalDatasetChecksum;

  calculatePartition(
    input: CalculateHistoricalPartitionChecksumInput,
  ): HistoricalDatasetChecksum;

  calculateStream(
    input: CalculateHistoricalStreamChecksumInput,
  ): Promise<HistoricalDatasetChecksum>;

  verify(
    input: VerifyHistoricalDatasetChecksumInput,
  ): HistoricalDatasetChecksumVerificationResult;
}

/**
 * Node cryptography-backed deterministic checksum implementation.
 *
 * Determinism guarantees:
 *
 * - Candle fields are serialized in a fixed order.
 * - Records are processed in the exact order supplied.
 * - Numbers use a canonical finite-number representation.
 * - Optional fields are represented explicitly.
 * - No environment-specific whitespace or locale formatting is used.
 * - Calculation timestamp is metadata only and is excluded from the digest.
 */
export class DeterministicHistoricalDatasetChecksumService
  implements HistoricalDatasetChecksumService
{
  public calculate(
    input: CalculateHistoricalDatasetChecksumInput,
  ): HistoricalDatasetChecksum {
    validateChecksumAlgorithm(input.algorithm);

    validateCalculationTimestamp(
      input.calculatedAt,
    );

    if (
      input.candles.length === 0 &&
      input.allowEmpty !== true
    ) {
      throw new HistoricalDatasetChecksumError(
        "EMPTY_DATASET",
        `Cannot calculate checksum for empty dataset "${input.datasetId}".`,
        input.datasetId,
      );
    }

    const hash = createChecksumHash(input.algorithm);

    writeDatasetHeader(
      hash,
      input.datasetId,
    );

    for (
      let index = 0;
      index < input.candles.length;
      index += 1
    ) {
      const candle = input.candles[index];

      if (candle === undefined) {
        throw new HistoricalDatasetChecksumError(
          "INVALID_RECORD",
          `Dataset "${input.datasetId}" contains a missing candle at index ${index}.`,
          input.datasetId,
        );
      }

      validateHistoricalCandle(
        candle,
        input.datasetId,
        index,
      );

      writeCanonicalCandle(
        hash,
        candle,
        index,
      );
    }

    return createChecksumResult(
      input.algorithm,
      hash.digest("hex"),
      input.calculatedAt,
      input.candles.length,
    );
  }

  public calculatePartition(
    input: CalculateHistoricalPartitionChecksumInput,
  ): HistoricalDatasetChecksum {
    validateHistoricalPartition(
      input.partition,
      input.candles,
    );

    return this.calculate({
      datasetId: input.partition.datasetId,
      candles: input.candles,
      algorithm: input.algorithm,
      calculatedAt: input.calculatedAt,
      allowEmpty:
        Number(input.partition.recordCount) === 0,
    });
  }

  public async calculateStream(
    input: CalculateHistoricalStreamChecksumInput,
  ): Promise<HistoricalDatasetChecksum> {
    validateChecksumAlgorithm(input.algorithm);

    validateCalculationTimestamp(
      input.calculatedAt,
    );

    const hash = createChecksumHash(input.algorithm);

    writeDatasetHeader(
      hash,
      input.datasetId,
    );

    let recordCount = 0;

    for await (const record of input.records) {
      if (record.datasetId !== input.datasetId) {
        throw new HistoricalDatasetChecksumError(
          "INVALID_RECORD",
          [
            `Stream record at index ${recordCount} belongs to dataset`,
            `"${record.datasetId}" instead of "${input.datasetId}".`,
          ].join(" "),
          input.datasetId,
        );
      }

      validateHistoricalCandle(
        record.candle,
        input.datasetId,
        recordCount,
      );

      writeCanonicalCandle(
        hash,
        record.candle,
        recordCount,
      );

      recordCount += 1;
    }

    if (
      recordCount === 0 &&
      input.allowEmpty !== true
    ) {
      throw new HistoricalDatasetChecksumError(
        "EMPTY_DATASET",
        `Cannot calculate checksum for empty dataset stream "${input.datasetId}".`,
        input.datasetId,
      );
    }

    return createChecksumResult(
      input.algorithm,
      hash.digest("hex"),
      input.calculatedAt,
      recordCount,
    );
  }

  public verify(
    input: VerifyHistoricalDatasetChecksumInput,
  ): HistoricalDatasetChecksumVerificationResult {
    const actual = this.calculate({
      datasetId: input.datasetId,
      candles: input.candles,
      algorithm:
        input.expectedChecksum.algorithm,
      calculatedAt:
        input.expectedChecksum.calculatedAt,
      allowEmpty:
        Number(
          input.expectedChecksum.recordCount,
        ) === 0,
    });

    const valid =
      actual.algorithm ===
        input.expectedChecksum.algorithm &&
      actual.value ===
        input.expectedChecksum.value &&
      actual.recordCount ===
        input.expectedChecksum.recordCount;

    return Object.freeze({
      valid,
      expected: cloneHistoricalDatasetChecksum(
        input.expectedChecksum,
      ),
      actual,
    });
  }
}

/**
 * Produces a checksum and throws when verification fails.
 */
export function assertHistoricalDatasetChecksum(
  service: HistoricalDatasetChecksumService,
  input: VerifyHistoricalDatasetChecksumInput,
): HistoricalDatasetChecksumVerificationResult {
  const result = service.verify(input);

  if (!result.valid) {
    throw new HistoricalDatasetChecksumError(
      "CHECKSUM_MISMATCH",
      [
        `Historical dataset checksum mismatch for "${input.datasetId}".`,
        `Expected ${result.expected.algorithm}:${result.expected.value},`,
        `received ${result.actual.algorithm}:${result.actual.value}.`,
      ].join(" "),
      input.datasetId,
    );
  }

  return result;
}

/**
 * Creates a canonical string representation for one candle.
 *
 * This function is exported so future storage and import components can use
 * the exact same canonical representation.
 */
export function serializeHistoricalCandleForChecksum(
  candle: HistoricalCandle,
  index: number,
): string {
  return [
    "record",
    canonicalInteger(index),
    canonicalInteger(candle.sequence),
    canonicalInteger(candle.openTime),
    canonicalInteger(candle.closeTime),
    canonicalNumber(candle.open),
    canonicalNumber(candle.high),
    canonicalNumber(candle.low),
    canonicalNumber(candle.close),
    canonicalNumber(candle.volume),
    canonicalOptionalNumber(
      candle.quoteVolume,
    ),
    canonicalOptionalInteger(
      candle.tradeCount,
    ),
    canonicalOptionalNumber(
      candle.takerBuyBaseVolume,
    ),
    canonicalOptionalNumber(
      candle.takerBuyQuoteVolume,
    ),
    candle.isClosed ? "1" : "0",
  ].join("|");
}

/**
 * Creates a canonical checksum header.
 */
export function serializeHistoricalDatasetChecksumHeader(
  datasetId: HistoricalDatasetId,
): string {
  return [
    "quantumtradeai",
    "historical-dataset",
    "checksum",
    "v1",
    encodeCanonicalString(String(datasetId)),
  ].join("|");
}

function createChecksumHash(
  algorithm: HistoricalChecksumAlgorithm,
): ReturnType<typeof createHash> {
  return createHash(
    algorithm.toLowerCase(),
  );
}

function writeDatasetHeader(
  hash: ReturnType<typeof createHash>,
  datasetId: HistoricalDatasetId,
): void {
  hash.update(
    serializeHistoricalDatasetChecksumHeader(
      datasetId,
    ),
    "utf8",
  );

  hash.update("\n", "utf8");
}

function writeCanonicalCandle(
  hash: ReturnType<typeof createHash>,
  candle: HistoricalCandle,
  index: number,
): void {
  hash.update(
    serializeHistoricalCandleForChecksum(
      candle,
      index,
    ),
    "utf8",
  );

  hash.update("\n", "utf8");
}

function createChecksumResult(
  algorithm: HistoricalChecksumAlgorithm,
  digest: string,
  calculatedAt: HistoricalTimestamp,
  recordCount: number,
): HistoricalDatasetChecksum {
  return Object.freeze({
    algorithm,
    value: historicalChecksumValue(digest),
    calculatedAt,
    recordCount: historicalCount(recordCount),
  });
}

function validateChecksumAlgorithm(
  algorithm: HistoricalChecksumAlgorithm,
): void {
  if (
    algorithm !== "SHA256" &&
    algorithm !== "SHA384" &&
    algorithm !== "SHA512"
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_ALGORITHM",
      `Unsupported historical dataset checksum algorithm: ${String(
        algorithm,
      )}.`,
    );
  }
}

function validateCalculationTimestamp(
  calculatedAt: HistoricalTimestamp,
): void {
  if (
    !Number.isSafeInteger(calculatedAt) ||
    calculatedAt < 0
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_CALCULATION_TIMESTAMP",
      "Checksum calculation timestamp must be a non-negative safe integer.",
    );
  }
}

function validateHistoricalCandle(
  candle: HistoricalCandle,
  datasetId: HistoricalDatasetId,
  index: number,
): void {
  if (
    !Number.isSafeInteger(candle.sequence) ||
    candle.sequence < 0
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      "sequence must be a non-negative safe integer",
    );
  }

  if (
    !Number.isSafeInteger(candle.openTime) ||
    candle.openTime < 0
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      "open time must be a non-negative safe integer",
    );
  }

  if (
    !Number.isSafeInteger(candle.closeTime) ||
    candle.closeTime < 0
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      "close time must be a non-negative safe integer",
    );
  }

  if (candle.closeTime < candle.openTime) {
    throwInvalidRecord(
      datasetId,
      index,
      "close time must not precede open time",
    );
  }

  validateFiniteNonNegativeNumber(
    candle.open,
    datasetId,
    index,
    "open",
  );

  validateFiniteNonNegativeNumber(
    candle.high,
    datasetId,
    index,
    "high",
  );

  validateFiniteNonNegativeNumber(
    candle.low,
    datasetId,
    index,
    "low",
  );

  validateFiniteNonNegativeNumber(
    candle.close,
    datasetId,
    index,
    "close",
  );

  validateFiniteNonNegativeNumber(
    candle.volume,
    datasetId,
    index,
    "volume",
  );

  if (candle.high < candle.low) {
    throwInvalidRecord(
      datasetId,
      index,
      "high must not be below low",
    );
  }

  if (
    candle.open < candle.low ||
    candle.open > candle.high
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      "open must be within the low/high range",
    );
  }

  if (
    candle.close < candle.low ||
    candle.close > candle.high
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      "close must be within the low/high range",
    );
  }

  validateOptionalFiniteNonNegativeNumber(
    candle.quoteVolume,
    datasetId,
    index,
    "quote volume",
  );

  if (
    candle.tradeCount !== undefined &&
    (
      !Number.isSafeInteger(
        candle.tradeCount,
      ) ||
      candle.tradeCount < 0
    )
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      "trade count must be a non-negative safe integer",
    );
  }

  validateOptionalFiniteNonNegativeNumber(
    candle.takerBuyBaseVolume,
    datasetId,
    index,
    "taker-buy base volume",
  );

  validateOptionalFiniteNonNegativeNumber(
    candle.takerBuyQuoteVolume,
    datasetId,
    index,
    "taker-buy quote volume",
  );

  if (typeof candle.isClosed !== "boolean") {
    throwInvalidRecord(
      datasetId,
      index,
      "isClosed must be boolean",
    );
  }
}

function validateHistoricalPartition(
  partition: HistoricalDatasetPartition,
  candles: readonly HistoricalCandle[],
): void {
  if (
    !Number.isSafeInteger(partition.ordinal) ||
    partition.ordinal < 0
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      `Partition "${partition.id}" has an invalid ordinal.`,
      partition.datasetId,
    );
  }

  if (
    partition.range.startTime >
    partition.range.endTime
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      `Partition "${partition.id}" has an invalid time range.`,
      partition.datasetId,
    );
  }

  if (
    partition.firstSequence >
    partition.lastSequence
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      `Partition "${partition.id}" has an invalid sequence range.`,
      partition.datasetId,
    );
  }

  if (
    Number(partition.recordCount) !==
    candles.length
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      [
        `Partition "${partition.id}" declares`,
        `${partition.recordCount} records but received`,
        `${candles.length} candles.`,
      ].join(" "),
      partition.datasetId,
    );
  }

  if (candles.length === 0) {
    return;
  }

  const firstCandle = candles[0];
  const lastCandle =
    candles[candles.length - 1];

  if (
    firstCandle === undefined ||
    lastCandle === undefined
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      `Partition "${partition.id}" contains invalid candle boundaries.`,
      partition.datasetId,
    );
  }

  if (
    firstCandle.sequence !==
      partition.firstSequence ||
    lastCandle.sequence !==
      partition.lastSequence
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      `Partition "${partition.id}" sequence boundaries do not match its candles.`,
      partition.datasetId,
    );
  }

  if (
    firstCandle.openTime <
      partition.range.startTime ||
    lastCandle.closeTime >
      partition.range.endTime
  ) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_PARTITION",
      `Partition "${partition.id}" candle range exceeds its declared time range.`,
      partition.datasetId,
    );
  }
}

function validateFiniteNonNegativeNumber(
  value: number,
  datasetId: HistoricalDatasetId,
  index: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throwInvalidRecord(
      datasetId,
      index,
      `${fieldName} must be a finite non-negative number`,
    );
  }
}

function validateOptionalFiniteNonNegativeNumber(
  value: number | undefined,
  datasetId: HistoricalDatasetId,
  index: number,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }

  validateFiniteNonNegativeNumber(
    value,
    datasetId,
    index,
    fieldName,
  );
}

function throwInvalidRecord(
  datasetId: HistoricalDatasetId,
  index: number,
  reason: string,
): never {
  throw new HistoricalDatasetChecksumError(
    "INVALID_RECORD",
    `Dataset "${datasetId}" candle at index ${index}: ${reason}.`,
    datasetId,
  );
}

function canonicalInteger(
  value: number,
): string {
  if (!Number.isSafeInteger(value)) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_RECORD",
      `Cannot serialize non-integer checksum value: ${String(
        value,
      )}.`,
    );
  }

  return String(value);
}

function canonicalNumber(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    throw new HistoricalDatasetChecksumError(
      "INVALID_RECORD",
      `Cannot serialize non-finite checksum value: ${String(
        value,
      )}.`,
    );
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  return String(value);
}

function canonicalOptionalNumber(
  value: number | undefined,
): string {
  return value === undefined
    ? "undefined"
    : canonicalNumber(value);
}

function canonicalOptionalInteger(
  value: number | undefined,
): string {
  return value === undefined
    ? "undefined"
    : canonicalInteger(value);
}

function encodeCanonicalString(
  value: string,
): string {
  return `${Buffer.byteLength(
    value,
    "utf8",
  )}:${value}`;
}

function cloneHistoricalDatasetChecksum(
  checksum: HistoricalDatasetChecksum,
): HistoricalDatasetChecksum {
  return Object.freeze({
    algorithm: checksum.algorithm,
    value: checksum.value,
    calculatedAt: checksum.calculatedAt,
    recordCount: checksum.recordCount,
  });
}