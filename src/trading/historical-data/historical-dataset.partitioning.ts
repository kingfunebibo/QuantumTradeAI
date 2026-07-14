import {
  HistoricalCandle,
  HistoricalChecksumAlgorithm,
  HistoricalDatasetId,
  HistoricalDatasetPartition,
  HistoricalPartitionId,
  HistoricalPartitionStrategy,
  HistoricalTimestamp,
  historicalCount,
  historicalPartitionId,
} from "./historical-dataset.types";

import {
  HistoricalDatasetChecksumService,
} from "./historical-dataset.checksum";

/**
 * Historical dataset partitioning error codes.
 */
export const HISTORICAL_DATASET_PARTITIONING_ERROR_CODES = [
  "EMPTY_DATASET",
  "INVALID_RECORD_LIMIT",
  "INVALID_CALCULATION_TIMESTAMP",
  "UNSUPPORTED_STRATEGY",
  "INVALID_CANDLE_ORDER",
  "INVALID_CANDLE_RANGE",
  "CHECKSUM_SERVICE_REQUIRED",
] as const;

export type HistoricalDatasetPartitioningErrorCode =
  (typeof HISTORICAL_DATASET_PARTITIONING_ERROR_CODES)[number];

/**
 * Error thrown by historical dataset partitioning operations.
 */
export class HistoricalDatasetPartitioningError extends Error {
  public readonly code: HistoricalDatasetPartitioningErrorCode;
  public readonly datasetId?: HistoricalDatasetId;

  public constructor(
    code: HistoricalDatasetPartitioningErrorCode,
    message: string,
    datasetId?: HistoricalDatasetId,
  ) {
    super(message);

    this.name = "HistoricalDatasetPartitioningError";
    this.code = code;
    this.datasetId = datasetId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Partitioning input.
 */
export interface PartitionHistoricalDatasetInput {
  readonly datasetId: HistoricalDatasetId;
  readonly candles: readonly HistoricalCandle[];

  readonly strategy: HistoricalPartitionStrategy;

  /**
   * Required for BY_RECORD_COUNT.
   */
  readonly maximumRecordsPerPartition?: number;

  /**
   * Optional checksum configuration.
   */
  readonly checksum?: Readonly<{
    readonly algorithm: HistoricalChecksumAlgorithm;
    readonly calculatedAt: HistoricalTimestamp;
    readonly service: HistoricalDatasetChecksumService;
  }>;

  /**
   * Whether an empty dataset may produce zero partitions.
   *
   * Default: false.
   */
  readonly allowEmpty?: boolean;
}

/**
 * Materialized partition containing metadata and its immutable candle slice.
 */
export interface MaterializedHistoricalDatasetPartition {
  readonly partition: HistoricalDatasetPartition;
  readonly candles: readonly HistoricalCandle[];
}

/**
 * Immutable partitioning result.
 */
export interface HistoricalDatasetPartitioningResult {
  readonly datasetId: HistoricalDatasetId;
  readonly strategy: HistoricalPartitionStrategy;

  readonly partitionCount: number;
  readonly recordCount: number;

  readonly partitions:
    readonly MaterializedHistoricalDatasetPartition[];
}

/**
 * Historical dataset partitioning abstraction.
 */
export interface HistoricalDatasetPartitioner {
  partition(
    input: PartitionHistoricalDatasetInput,
  ): HistoricalDatasetPartitioningResult;
}

/**
 * Deterministic historical dataset partitioner.
 */
export class DeterministicHistoricalDatasetPartitioner
  implements HistoricalDatasetPartitioner
{
  public partition(
    input: PartitionHistoricalDatasetInput,
  ): HistoricalDatasetPartitioningResult {
    validatePartitioningInput(input);

    if (input.candles.length === 0) {
      return Object.freeze({
        datasetId: input.datasetId,
        strategy: input.strategy,
        partitionCount: 0,
        recordCount: 0,
        partitions: Object.freeze([]),
      });
    }

    validateCandleOrdering(
      input.datasetId,
      input.candles,
    );

    const groups = createPartitionGroups(input);

    const partitions =
      groups.map((candles, ordinal) =>
        createMaterializedPartition(
          input,
          candles,
          ordinal,
        ),
      );

    return Object.freeze({
      datasetId: input.datasetId,
      strategy: input.strategy,
      partitionCount: partitions.length,
      recordCount: input.candles.length,
      partitions: Object.freeze(partitions),
    });
  }
}

function createPartitionGroups(
  input: PartitionHistoricalDatasetInput,
): readonly (readonly HistoricalCandle[])[] {
  switch (input.strategy) {
    case "NONE":
      return Object.freeze([
        Object.freeze([...input.candles]),
      ]);

    case "BY_RECORD_COUNT":
      return partitionByRecordCount(
        input.candles,
        input.maximumRecordsPerPartition!,
      );

    case "BY_DAY":
      return partitionByCalendarPeriod(
        input.candles,
        createUtcDayKey,
      );

    case "BY_WEEK":
      return partitionByCalendarPeriod(
        input.candles,
        createUtcWeekKey,
      );

    case "BY_MONTH":
      return partitionByCalendarPeriod(
        input.candles,
        createUtcMonthKey,
      );

    case "BY_YEAR":
      return partitionByCalendarPeriod(
        input.candles,
        createUtcYearKey,
      );

    default:
      return assertNever(input.strategy);
  }
}

function partitionByRecordCount(
  candles: readonly HistoricalCandle[],
  maximumRecordsPerPartition: number,
): readonly (readonly HistoricalCandle[])[] {
  const groups: HistoricalCandle[][] = [];

  for (
    let startIndex = 0;
    startIndex < candles.length;
    startIndex += maximumRecordsPerPartition
  ) {
    groups.push(
      candles.slice(
        startIndex,
        startIndex + maximumRecordsPerPartition,
      ),
    );
  }

  return Object.freeze(
    groups.map((group) =>
      Object.freeze([...group]),
    ),
  );
}

function partitionByCalendarPeriod(
  candles: readonly HistoricalCandle[],
  createKey: (timestamp: number) => string,
): readonly (readonly HistoricalCandle[])[] {
  const groups: HistoricalCandle[][] = [];

  let activeKey: string | undefined;
  let activeGroup: HistoricalCandle[] = [];

  for (const candle of candles) {
    const key = createKey(
      Number(candle.openTime),
    );

    if (
      activeKey !== undefined &&
      key !== activeKey
    ) {
      groups.push(activeGroup);
      activeGroup = [];
    }

    activeKey = key;
    activeGroup.push(candle);
  }

  if (activeGroup.length > 0) {
    groups.push(activeGroup);
  }

  return Object.freeze(
    groups.map((group) =>
      Object.freeze([...group]),
    ),
  );
}

function createMaterializedPartition(
  input: PartitionHistoricalDatasetInput,
  candles: readonly HistoricalCandle[],
  ordinal: number,
): MaterializedHistoricalDatasetPartition {
  const firstCandle = candles[0];
  const lastCandle =
    candles[candles.length - 1];

  if (
    firstCandle === undefined ||
    lastCandle === undefined
  ) {
    throw new HistoricalDatasetPartitioningError(
      "EMPTY_DATASET",
      `Cannot create empty partition ${ordinal} for dataset "${input.datasetId}".`,
      input.datasetId,
    );
  }

  const id =
    createHistoricalDatasetPartitionId(
      input.datasetId,
      input.strategy,
      ordinal,
      firstCandle.openTime,
      lastCandle.closeTime,
    );

  const basePartition: HistoricalDatasetPartition = {
    id,
    datasetId: input.datasetId,
    ordinal,
    strategy: input.strategy,

    range: Object.freeze({
      startTime: firstCandle.openTime,
      endTime: lastCandle.closeTime,
    }),

    firstSequence: firstCandle.sequence,
    lastSequence: lastCandle.sequence,

    recordCount: historicalCount(
      candles.length,
    ),
  };

  const partition =
    input.checksum === undefined
      ? basePartition
      : {
          ...basePartition,

          checksum:
            input.checksum.service.calculatePartition({
              partition: basePartition,
              candles,
              algorithm:
                input.checksum.algorithm,
              calculatedAt:
                input.checksum.calculatedAt,
            }),
        };

  return Object.freeze({
    partition: freezePartition(partition),
    candles: Object.freeze([...candles]),
  });
}

/**
 * Creates a deterministic partition identifier.
 */
export function createHistoricalDatasetPartitionId(
  datasetId: HistoricalDatasetId,
  strategy: HistoricalPartitionStrategy,
  ordinal: number,
  startTime: HistoricalTimestamp,
  endTime: HistoricalTimestamp,
): HistoricalPartitionId {
  if (
    !Number.isSafeInteger(ordinal) ||
    ordinal < 0
  ) {
    throw new HistoricalDatasetPartitioningError(
      "INVALID_RECORD_LIMIT",
      "Partition ordinal must be a non-negative safe integer.",
      datasetId,
    );
  }

  return historicalPartitionId(
    [
      String(datasetId),
      "partition",
      strategy.toLowerCase(),
      String(ordinal).padStart(6, "0"),
      String(startTime),
      String(endTime),
    ].join(":"),
  );
}

function validatePartitioningInput(
  input: PartitionHistoricalDatasetInput,
): void {
  if (
    input.candles.length === 0 &&
    input.allowEmpty !== true
  ) {
    throw new HistoricalDatasetPartitioningError(
      "EMPTY_DATASET",
      `Cannot partition empty historical dataset "${input.datasetId}".`,
      input.datasetId,
    );
  }

  if (input.strategy === "BY_RECORD_COUNT") {
    const limit =
      input.maximumRecordsPerPartition;

    if (
      limit === undefined ||
      !Number.isSafeInteger(limit) ||
      limit <= 0
    ) {
      throw new HistoricalDatasetPartitioningError(
        "INVALID_RECORD_LIMIT",
        "maximumRecordsPerPartition must be a positive safe integer for BY_RECORD_COUNT partitioning.",
        input.datasetId,
      );
    }
  }

  if (input.checksum !== undefined) {
    if (
      !Number.isSafeInteger(
        input.checksum.calculatedAt,
      ) ||
      input.checksum.calculatedAt < 0
    ) {
      throw new HistoricalDatasetPartitioningError(
        "INVALID_CALCULATION_TIMESTAMP",
        "Partition checksum timestamp must be a non-negative safe integer.",
        input.datasetId,
      );
    }

    if (input.checksum.service === undefined) {
      throw new HistoricalDatasetPartitioningError(
        "CHECKSUM_SERVICE_REQUIRED",
        "A checksum service is required when partition checksum generation is enabled.",
        input.datasetId,
      );
    }
  }
}

function validateCandleOrdering(
  datasetId: HistoricalDatasetId,
  candles: readonly HistoricalCandle[],
): void {
  for (
    let index = 0;
    index < candles.length;
    index += 1
  ) {
    const current = candles[index];

    if (current === undefined) {
      continue;
    }

    if (
      current.closeTime <
      current.openTime
    ) {
      throw new HistoricalDatasetPartitioningError(
        "INVALID_CANDLE_RANGE",
        `Dataset "${datasetId}" candle at index ${index} has an invalid time range.`,
        datasetId,
      );
    }

    if (index === 0) {
      continue;
    }

    const previous =
      candles[index - 1];

    if (previous === undefined) {
      continue;
    }

    if (
      current.openTime <
      previous.openTime
    ) {
      throw new HistoricalDatasetPartitioningError(
        "INVALID_CANDLE_ORDER",
        [
          `Dataset "${datasetId}" candles are not ordered.`,
          `Candle at index ${index} opens before`,
          `candle at index ${index - 1}.`,
        ].join(" "),
        datasetId,
      );
    }

    if (
      Number(current.sequence) <=
      Number(previous.sequence)
    ) {
      throw new HistoricalDatasetPartitioningError(
        "INVALID_CANDLE_ORDER",
        [
          `Dataset "${datasetId}" candle sequence at index`,
          `${index} must be greater than the sequence`,
          `at index ${index - 1}.`,
        ].join(" "),
        datasetId,
      );
    }
  }
}

function createUtcDayKey(
  timestamp: number,
): string {
  const date = createValidDate(timestamp);

  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join("-");
}

function createUtcMonthKey(
  timestamp: number,
): string {
  const date = createValidDate(timestamp);

  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
  ].join("-");
}

function createUtcYearKey(
  timestamp: number,
): string {
  return String(
    createValidDate(timestamp).getUTCFullYear(),
  );
}

/**
 * Produces an ISO-style UTC week key.
 *
 * Week starts Monday.
 */
function createUtcWeekKey(
  timestamp: number,
): string {
  const sourceDate = createValidDate(timestamp);

  const date = new Date(
    Date.UTC(
      sourceDate.getUTCFullYear(),
      sourceDate.getUTCMonth(),
      sourceDate.getUTCDate(),
    ),
  );

  const day =
    date.getUTCDay() === 0
      ? 7
      : date.getUTCDay();

  date.setUTCDate(
    date.getUTCDate() + 4 - day,
  );

  const weekYear =
    date.getUTCFullYear();

  const yearStart = new Date(
    Date.UTC(weekYear, 0, 1),
  );

  const weekNumber = Math.ceil(
    (
      (
        date.getTime() -
        yearStart.getTime()
      ) /
        86_400_000 +
      1
    ) / 7,
  );

  return `${weekYear}-W${padDatePart(
    weekNumber,
  )}`;
}

function createValidDate(
  timestamp: number,
): Date {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new HistoricalDatasetPartitioningError(
      "INVALID_CANDLE_RANGE",
      `Invalid historical candle timestamp: ${String(
        timestamp,
      )}.`,
    );
  }

  return date;
}

function padDatePart(
  value: number,
): string {
  return String(value).padStart(2, "0");
}

function freezePartition(
  partition: HistoricalDatasetPartition,
): HistoricalDatasetPartition {
  return Object.freeze({
    id: partition.id,
    datasetId: partition.datasetId,

    ordinal: partition.ordinal,
    strategy: partition.strategy,

    range: Object.freeze({
      startTime: partition.range.startTime,
      endTime: partition.range.endTime,
    }),

    firstSequence:
      partition.firstSequence,

    lastSequence:
      partition.lastSequence,

    recordCount:
      partition.recordCount,

    ...(partition.location === undefined
      ? {}
      : {
          location: partition.location,
        }),

    ...(partition.checksum === undefined
      ? {}
      : {
          checksum: Object.freeze({
            algorithm:
              partition.checksum.algorithm,

            value:
              partition.checksum.value,

            calculatedAt:
              partition.checksum.calculatedAt,

            recordCount:
              partition.checksum.recordCount,
          }),
        }),
  });
}

function assertNever(
  strategy: never,
): never {
  throw new HistoricalDatasetPartitioningError(
    "UNSUPPORTED_STRATEGY",
    `Unsupported historical dataset partition strategy: ${String(
      strategy,
    )}.`,
  );
}