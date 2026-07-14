import {
  HistoricalCandle,
  HistoricalDataset,
  HistoricalDatasetId,
  HistoricalDatasetPartition,
  HistoricalDatasetVersion,
  HistoricalPartitionId,
  HistoricalTimestamp,
  LoadedHistoricalDataset,
  historicalCount,
} from "./historical-dataset.types";

import {
  HistoricalDatasetRepository,
} from "./historical-dataset.repository";

/**
 * Errors produced by dataset loading and record-storage operations.
 */
export const HISTORICAL_DATASET_LOADER_ERROR_CODES = [
  "DATASET_NOT_FOUND",
  "DATASET_NOT_READY",
  "PARTITION_NOT_FOUND",
  "INVALID_RANGE",
  "INVALID_BATCH_SIZE",
  "RECORD_COUNT_MISMATCH",
  "RECORDS_NOT_FOUND",
  "RECORDS_ALREADY_EXIST",
  "INVALID_RECORD_ORDER",
  "INVALID_RECORD_DATASET",
  "STORAGE_FAILURE",
] as const;

export type HistoricalDatasetLoaderErrorCode =
  (typeof HISTORICAL_DATASET_LOADER_ERROR_CODES)[number];

/**
 * Typed loader and record-store error.
 */
export class HistoricalDatasetLoaderError extends Error {
  public readonly code: HistoricalDatasetLoaderErrorCode;
  public readonly datasetId?: HistoricalDatasetId;
  public readonly version?: HistoricalDatasetVersion;
  public readonly partitionId?: HistoricalPartitionId;
  public readonly cause?: unknown;

  public constructor(
    code: HistoricalDatasetLoaderErrorCode,
    message: string,
    options: Readonly<{
      datasetId?: HistoricalDatasetId;
      version?: HistoricalDatasetVersion;
      partitionId?: HistoricalPartitionId;
      cause?: unknown;
    }> = {},
  ) {
    super(message);

    this.name = "HistoricalDatasetLoaderError";
    this.code = code;
    this.datasetId = options.datasetId;
    this.version = options.version;
    this.partitionId = options.partitionId;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Identity of one historical dataset revision.
 */
export interface HistoricalDatasetRevisionKey {
  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;
}

/**
 * Inclusive candle-open-time range.
 */
export interface HistoricalDatasetLoadRange {
  readonly startTime?: HistoricalTimestamp;
  readonly endTime?: HistoricalTimestamp;
}

/**
 * Input for saving candle records.
 */
export interface SaveHistoricalDatasetRecordsInput
  extends HistoricalDatasetRevisionKey {
  readonly candles: readonly HistoricalCandle[];

  /**
   * Reject saving when records already exist.
   *
   * Default: true.
   */
  readonly rejectExisting?: boolean;
}

/**
 * Input for reading candle records.
 */
export interface ReadHistoricalDatasetRecordsInput
  extends HistoricalDatasetRevisionKey {
  readonly range?: HistoricalDatasetLoadRange;
}

/**
 * Input for deleting candle records.
 */
export interface DeleteHistoricalDatasetRecordsInput
  extends HistoricalDatasetRevisionKey {}

/**
 * Result returned after saving candle records.
 */
export interface SaveHistoricalDatasetRecordsResult {
  readonly created: boolean;
  readonly recordCount: number;
}

/**
 * Candle persistence abstraction.
 *
 * HistoricalDatasetRepository stores dataset metadata. This abstraction stores
 * the potentially large candle payload separately.
 */
export interface HistoricalDatasetRecordStore {
  save(
    input: SaveHistoricalDatasetRecordsInput,
  ): Promise<SaveHistoricalDatasetRecordsResult>;

  read(
    input: ReadHistoricalDatasetRecordsInput,
  ): Promise<readonly HistoricalCandle[]>;

  stream(
    input: ReadHistoricalDatasetRecordsInput,
  ): AsyncIterable<HistoricalCandle>;

  exists(
    input: HistoricalDatasetRevisionKey,
  ): Promise<boolean>;

  count(
    input: HistoricalDatasetRevisionKey,
  ): Promise<number>;

  delete(
    input: DeleteHistoricalDatasetRecordsInput,
  ): Promise<boolean>;

  clear(): Promise<void>;
}

/**
 * Base dataset loading input.
 */
export interface HistoricalDatasetLoadInput {
  readonly datasetId: HistoricalDatasetId;

  /**
   * When omitted, the latest available version is loaded.
   */
  readonly version?: HistoricalDatasetVersion;

  /**
   * Only READY datasets can be loaded by default.
   */
  readonly allowNonReady?: boolean;

  /**
   * Optional inclusive filter on candle opening time.
   */
  readonly range?: HistoricalDatasetLoadRange;

  /**
   * Validate a full load against dataset metadata record count.
   *
   * This check is skipped for range-filtered loads.
   *
   * Default: true.
   */
  readonly validateRecordCount?: boolean;
}

/**
 * Partition loading input.
 */
export interface HistoricalDatasetPartitionLoadInput
  extends HistoricalDatasetLoadInput {
  readonly partitionId: HistoricalPartitionId;
}

/**
 * Batch-streaming input.
 */
export interface HistoricalDatasetBatchStreamInput
  extends HistoricalDatasetLoadInput {
  readonly batchSize: number;
}

/**
 * Loaded dataset partition.
 */
export interface LoadedHistoricalDatasetPartition {
  readonly dataset: HistoricalDataset;
  readonly partition: HistoricalDatasetPartition;
  readonly candles: readonly HistoricalCandle[];
}

/**
 * Immutable streamed candle batch.
 */
export interface HistoricalDatasetCandleBatch {
  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;

  readonly batchIndex: number;
  readonly firstRecordIndex: number;
  readonly lastRecordIndex: number;

  readonly candles: readonly HistoricalCandle[];
}

/**
 * Dataset loader abstraction.
 */
export interface HistoricalDatasetLoader {
  load(
    input: HistoricalDatasetLoadInput,
  ): Promise<LoadedHistoricalDataset>;

  loadPartition(
    input: HistoricalDatasetPartitionLoadInput,
  ): Promise<LoadedHistoricalDatasetPartition>;

  stream(
    input: HistoricalDatasetLoadInput,
  ): AsyncIterable<HistoricalCandle>;

  streamBatches(
    input: HistoricalDatasetBatchStreamInput,
  ): AsyncIterable<HistoricalDatasetCandleBatch>;
}

/**
 * Deterministic historical dataset loader.
 */
export class DeterministicHistoricalDatasetLoader
  implements HistoricalDatasetLoader
{
  private readonly repository:
    HistoricalDatasetRepository;

  private readonly recordStore:
    HistoricalDatasetRecordStore;

  public constructor(
    dependencies: Readonly<{
      repository: HistoricalDatasetRepository;
      recordStore: HistoricalDatasetRecordStore;
    }>,
  ) {
    this.repository = dependencies.repository;
    this.recordStore = dependencies.recordStore;
  }

  /**
   * Loads and materializes a complete dataset or filtered range.
   */
  public async load(
    input: HistoricalDatasetLoadInput,
  ): Promise<LoadedHistoricalDataset> {
    validateLoadRange(input.range);

    const dataset =
      await this.resolveDataset(input);

    let candles: readonly HistoricalCandle[];

    try {
      candles = await this.recordStore.read({
        datasetId: dataset.id,
        version: dataset.version,

        ...(input.range === undefined
          ? {}
          : {
              range: input.range,
            }),
      });
    } catch (error: unknown) {
      throw normalizeStorageFailure(
        error,
        dataset.id,
        dataset.version,
      );
    }

    const normalizedCandles =
      normalizeLoadedCandles(
        dataset,
        candles,
      );

    validateLoadedRecordCount(
      dataset,
      normalizedCandles,
      input.range,
      input.validateRecordCount ?? true,
    );

    return Object.freeze({
      dataset,
      candles: normalizedCandles,
    });
  }

  /**
   * Loads one declared dataset partition.
   */
  public async loadPartition(
    input: HistoricalDatasetPartitionLoadInput,
  ): Promise<LoadedHistoricalDatasetPartition> {
    validateLoadRange(input.range);

    const dataset =
      await this.resolveDataset(input);

    const partition =
      dataset.storage.partitions.find(
        (candidate) =>
          candidate.id ===
          input.partitionId,
      );

    if (partition === undefined) {
      throw new HistoricalDatasetLoaderError(
        "PARTITION_NOT_FOUND",
        [
          `Partition "${input.partitionId}" was not found in`,
          `historical dataset "${dataset.id}" version ${dataset.version}.`,
        ].join(" "),
        {
          datasetId: dataset.id,
          version: dataset.version,
          partitionId:
            input.partitionId,
        },
      );
    }

    const partitionRange: HistoricalDatasetLoadRange = {
      startTime:
        partition.range.startTime,
      endTime:
        partition.range.endTime,
    };

    const intersection =
      intersectLoadRanges(
        input.range,
        partitionRange,
      );

    /*
     * A caller-supplied range may be completely outside the partition.
     * Return a valid empty result rather than issuing an ambiguous store read.
     */
    if (intersection === undefined) {
      return Object.freeze({
        dataset,
        partition:
          cloneHistoricalDatasetPartition(
            partition,
          ),
        candles: Object.freeze([]),
      });
    }

    let candles: readonly HistoricalCandle[];

    try {
      candles = await this.recordStore.read({
        datasetId: dataset.id,
        version: dataset.version,
        range: intersection,
      });
    } catch (error: unknown) {
      throw normalizeStorageFailure(
        error,
        dataset.id,
        dataset.version,
        partition.id,
      );
    }

    const partitionCandles =
      normalizeLoadedCandles(
        dataset,
        candles.filter(
          (candle) =>
            Number(candle.sequence) >=
              Number(
                partition.firstSequence,
              ) &&
            Number(candle.sequence) <=
              Number(
                partition.lastSequence,
              ),
        ),
      );

    if (
      input.range === undefined &&
      input.validateRecordCount !== false &&
      partitionCandles.length !==
        Number(partition.recordCount)
    ) {
      throw new HistoricalDatasetLoaderError(
        "RECORD_COUNT_MISMATCH",
        [
          `Partition "${partition.id}" declares`,
          `${partition.recordCount} records but loaded`,
          `${partitionCandles.length}.`,
        ].join(" "),
        {
          datasetId: dataset.id,
          version: dataset.version,
          partitionId:
            partition.id,
        },
      );
    }

    return Object.freeze({
      dataset,
      partition:
        cloneHistoricalDatasetPartition(
          partition,
        ),
      candles: partitionCandles,
    });
  }

  /**
   * Streams candles without materializing the complete payload.
   */
  public async *stream(
    input: HistoricalDatasetLoadInput,
  ): AsyncIterable<HistoricalCandle> {
    validateLoadRange(input.range);

    const dataset =
      await this.resolveDataset(input);

    let recordCount = 0;

    let previous:
      | HistoricalCandle
      | undefined;

    try {
      for await (
        const storedRecord of this.recordStore.stream({
          datasetId: dataset.id,
          version: dataset.version,

          ...(input.range === undefined
            ? {}
            : {
                range: input.range,
              }),
        })
      ) {
        const candle =
          cloneAndFreezeHistoricalCandle(
            storedRecord,
          );

        validateBasicCandle(
          dataset.id,
          dataset.version,
          candle,
          recordCount,
        );

        validateCandleBelongsToDatasetRange(
          dataset,
          candle,
        );

        if (previous !== undefined) {
          validateAdjacentCandleOrder(
            dataset,
            previous,
            candle,
            recordCount,
          );
        }

        previous = candle;
        recordCount += 1;

        yield candle;
      }
    } catch (error: unknown) {
      if (
        error instanceof
        HistoricalDatasetLoaderError
      ) {
        throw error;
      }

      throw normalizeStorageFailure(
        error,
        dataset.id,
        dataset.version,
      );
    }

    if (
      input.range === undefined &&
      input.validateRecordCount !== false &&
      recordCount !==
        Number(dataset.metadata.recordCount)
    ) {
      throw new HistoricalDatasetLoaderError(
        "RECORD_COUNT_MISMATCH",
        [
          `Historical dataset "${dataset.id}" declares`,
          `${dataset.metadata.recordCount} records but streamed`,
          `${recordCount}.`,
        ].join(" "),
        {
          datasetId: dataset.id,
          version: dataset.version,
        },
      );
    }
  }

  /**
   * Streams immutable candle batches.
   */
  public async *streamBatches(
    input: HistoricalDatasetBatchStreamInput,
  ): AsyncIterable<HistoricalDatasetCandleBatch> {
    if (
      !Number.isSafeInteger(
        input.batchSize,
      ) ||
      input.batchSize <= 0
    ) {
      throw new HistoricalDatasetLoaderError(
        "INVALID_BATCH_SIZE",
        "Historical dataset stream batch size must be a positive safe integer.",
        {
          datasetId:
            input.datasetId,
          version:
            input.version,
        },
      );
    }

    /*
     * Resolve the actual revision first so batch metadata always contains a
     * valid version, including when the caller requests the latest version.
     */
    const dataset =
      await this.resolveDataset(input);

    let batch: HistoricalCandle[] = [];
    let batchIndex = 0;
    let totalRecordIndex = 0;

    for await (
      const candle of this.stream({
        datasetId: dataset.id,
        version: dataset.version,

        ...(input.allowNonReady ===
        undefined
          ? {}
          : {
              allowNonReady:
                input.allowNonReady,
            }),

        ...(input.range === undefined
          ? {}
          : {
              range: input.range,
            }),

        ...(input.validateRecordCount ===
        undefined
          ? {}
          : {
              validateRecordCount:
                input.validateRecordCount,
            }),
      })
    ) {
      batch.push(candle);

      if (
        batch.length === input.batchSize
      ) {
        yield createCandleBatch({
          datasetId: dataset.id,
          version: dataset.version,
          batch,
          batchIndex,
          totalRecordIndex,
        });

        totalRecordIndex +=
          batch.length;

        batchIndex += 1;
        batch = [];
      }
    }

    if (batch.length > 0) {
      yield createCandleBatch({
        datasetId: dataset.id,
        version: dataset.version,
        batch,
        batchIndex,
        totalRecordIndex,
      });
    }
  }

  /**
   * Resolves the requested dataset revision and enforces its loadable status.
   */
  private async resolveDataset(
    input: HistoricalDatasetLoadInput,
  ): Promise<HistoricalDataset> {
    const dataset =
      await this.repository.findById({
        id: input.datasetId,

        ...(input.version === undefined
          ? {}
          : {
              version: input.version,
            }),
      });

    if (dataset === undefined) {
      throw new HistoricalDatasetLoaderError(
        "DATASET_NOT_FOUND",
        input.version === undefined
          ? `Historical dataset "${input.datasetId}" was not found.`
          : [
              `Historical dataset "${input.datasetId}"`,
              `version ${input.version} was not found.`,
            ].join(" "),
        {
          datasetId:
            input.datasetId,
          version:
            input.version,
        },
      );
    }

    if (
      dataset.status !== "READY" &&
      input.allowNonReady !== true
    ) {
      throw new HistoricalDatasetLoaderError(
        "DATASET_NOT_READY",
        [
          `Historical dataset "${dataset.id}" version ${dataset.version}`,
          `has status ${dataset.status}; READY is required for loading.`,
        ].join(" "),
        {
          datasetId: dataset.id,
          version: dataset.version,
        },
      );
    }

    return dataset;
  }
}

/**
 * Deterministic in-memory candle record store.
 *
 * Suitable for tests, development, and deterministic local backtesting.
 */
export class InMemoryHistoricalDatasetRecordStore
  implements HistoricalDatasetRecordStore
{
  private readonly recordsByDataset =
    new Map<
      string,
      readonly HistoricalCandle[]
    >();

  /**
   * Saves one immutable dataset revision payload.
   */
  public async save(
    input: SaveHistoricalDatasetRecordsInput,
  ): Promise<SaveHistoricalDatasetRecordsResult> {
    const key =
      createHistoricalDatasetRecordStoreKey(
        input.datasetId,
        input.version,
      );

    const existing =
      this.recordsByDataset.get(key);

    if (
      existing !== undefined &&
      input.rejectExisting !== false
    ) {
      throw new HistoricalDatasetLoaderError(
        "RECORDS_ALREADY_EXIST",
        [
          "Records already exist for historical dataset",
          `"${input.datasetId}" version ${input.version}.`,
        ].join(" "),
        {
          datasetId:
            input.datasetId,
          version:
            input.version,
        },
      );
    }

    validateStoredCandleOrdering(
      input.datasetId,
      input.version,
      input.candles,
    );

    const storedRecords = Object.freeze(
      input.candles.map(
        cloneAndFreezeHistoricalCandle,
      ),
    );

    this.recordsByDataset.set(
      key,
      storedRecords,
    );

    return Object.freeze({
      created:
        existing === undefined,
      recordCount:
        storedRecords.length,
    });
  }

  /**
   * Reads and materializes records.
   */
  public async read(
    input: ReadHistoricalDatasetRecordsInput,
  ): Promise<readonly HistoricalCandle[]> {
    validateLoadRange(input.range);

    const records =
      this.recordsByDataset.get(
        createHistoricalDatasetRecordStoreKey(
          input.datasetId,
          input.version,
        ),
      );

    if (records === undefined) {
      throw new HistoricalDatasetLoaderError(
        "RECORDS_NOT_FOUND",
        [
          "Records were not found for historical dataset",
          `"${input.datasetId}" version ${input.version}.`,
        ].join(" "),
        {
          datasetId:
            input.datasetId,
          version:
            input.version,
        },
      );
    }

    return Object.freeze(
      records
        .filter((record) =>
          matchesLoadRange(
            record,
            input.range,
          ),
        )
        .map(
          cloneAndFreezeHistoricalCandle,
        ),
    );
  }

  /**
   * Streams stored records.
   */
  public async *stream(
    input: ReadHistoricalDatasetRecordsInput,
  ): AsyncIterable<HistoricalCandle> {
    validateLoadRange(input.range);

    const records =
      this.recordsByDataset.get(
        createHistoricalDatasetRecordStoreKey(
          input.datasetId,
          input.version,
        ),
      );

    if (records === undefined) {
      throw new HistoricalDatasetLoaderError(
        "RECORDS_NOT_FOUND",
        [
          "Records were not found for historical dataset",
          `"${input.datasetId}" version ${input.version}.`,
        ].join(" "),
        {
          datasetId:
            input.datasetId,
          version:
            input.version,
        },
      );
    }

    for (const record of records) {
      if (
        matchesLoadRange(
          record,
          input.range,
        )
      ) {
        yield cloneAndFreezeHistoricalCandle(
          record,
        );
      }
    }
  }

  /**
   * Determines whether one revision payload exists.
   */
  public async exists(
    input: HistoricalDatasetRevisionKey,
  ): Promise<boolean> {
    return this.recordsByDataset.has(
      createHistoricalDatasetRecordStoreKey(
        input.datasetId,
        input.version,
      ),
    );
  }

  /**
   * Returns the stored candle count for one revision.
   */
  public async count(
    input: HistoricalDatasetRevisionKey,
  ): Promise<number> {
    return (
      this.recordsByDataset.get(
        createHistoricalDatasetRecordStoreKey(
          input.datasetId,
          input.version,
        ),
      )?.length ?? 0
    );
  }

  /**
   * Deletes one dataset revision payload.
   */
  public async delete(
    input: DeleteHistoricalDatasetRecordsInput,
  ): Promise<boolean> {
    return this.recordsByDataset.delete(
      createHistoricalDatasetRecordStoreKey(
        input.datasetId,
        input.version,
      ),
    );
  }

  /**
   * Removes every stored payload.
   */
  public async clear(): Promise<void> {
    this.recordsByDataset.clear();
  }
}

/**
 * Creates the canonical record-store key.
 */
export function createHistoricalDatasetRecordStoreKey(
  datasetId: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
): string {
  return `${datasetId}::v${version}`;
}

/**
 * Clones, validates, and freezes loaded records.
 */
function normalizeLoadedCandles(
  dataset: HistoricalDataset,
  candles: readonly HistoricalCandle[],
): readonly HistoricalCandle[] {
  const cloned = candles.map(
    cloneAndFreezeHistoricalCandle,
  );

  validateStoredCandleOrdering(
    dataset.id,
    dataset.version,
    cloned,
  );

  for (const candle of cloned) {
    validateCandleBelongsToDatasetRange(
      dataset,
      candle,
    );
  }

  return Object.freeze(cloned);
}

/**
 * Validates full-load record count.
 */
function validateLoadedRecordCount(
  dataset: HistoricalDataset,
  candles: readonly HistoricalCandle[],
  range: HistoricalDatasetLoadRange | undefined,
  validateRecordCount: boolean,
): void {
  if (
    !validateRecordCount ||
    range !== undefined
  ) {
    return;
  }

  if (
    candles.length !==
    Number(dataset.metadata.recordCount)
  ) {
    throw new HistoricalDatasetLoaderError(
      "RECORD_COUNT_MISMATCH",
      [
        `Historical dataset "${dataset.id}" declares`,
        `${dataset.metadata.recordCount} records but loaded`,
        `${candles.length}.`,
      ].join(" "),
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }
}

/**
 * Validates complete record ordering.
 */
function validateStoredCandleOrdering(
  datasetId: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
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

    validateBasicCandle(
      datasetId,
      version,
      current,
      index,
    );

    if (index === 0) {
      continue;
    }

    const previous =
      candles[index - 1];

    if (previous === undefined) {
      continue;
    }

    validateAdjacentCandleOrder(
      {
        id: datasetId,
        version,
      },
      previous,
      current,
      index,
    );
  }
}

/**
 * Validates ordering between adjacent candles.
 */
function validateAdjacentCandleOrder(
  dataset: Pick<
    HistoricalDataset,
    "id" | "version"
  >,
  previous: HistoricalCandle,
  current: HistoricalCandle,
  currentIndex: number,
): void {
  if (
    Number(current.openTime) <=
    Number(previous.openTime)
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_ORDER",
      [
        `Historical dataset "${dataset.id}" version ${dataset.version}`,
        `has non-increasing open time at record index ${currentIndex}.`,
      ].join(" "),
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }

  if (
    Number(current.sequence) <=
    Number(previous.sequence)
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_ORDER",
      [
        `Historical dataset "${dataset.id}" version ${dataset.version}`,
        `has non-increasing sequence at record index ${currentIndex}.`,
      ].join(" "),
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }
}

/**
 * Validates required candle identity and time fields.
 */
function validateBasicCandle(
  datasetId: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
  candle: HistoricalCandle,
  index: number,
): void {
  if (
    !Number.isSafeInteger(
      candle.sequence,
    ) ||
    candle.sequence < 0 ||
    !Number.isSafeInteger(
      candle.openTime,
    ) ||
    candle.openTime < 0 ||
    !Number.isSafeInteger(
      candle.closeTime,
    ) ||
    candle.closeTime <
      candle.openTime
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_DATASET",
      [
        `Historical dataset "${datasetId}" version ${version}`,
        `contains an invalid candle at index ${index}.`,
      ].join(" "),
      {
        datasetId,
        version,
      },
    );
  }

  validateFiniteNonNegativeValue(
    datasetId,
    version,
    index,
    "open",
    candle.open,
  );

  validateFiniteNonNegativeValue(
    datasetId,
    version,
    index,
    "high",
    candle.high,
  );

  validateFiniteNonNegativeValue(
    datasetId,
    version,
    index,
    "low",
    candle.low,
  );

  validateFiniteNonNegativeValue(
    datasetId,
    version,
    index,
    "close",
    candle.close,
  );

  validateFiniteNonNegativeValue(
    datasetId,
    version,
    index,
    "volume",
    candle.volume,
  );

  if (
    candle.high < candle.low ||
    candle.open < candle.low ||
    candle.open > candle.high ||
    candle.close < candle.low ||
    candle.close > candle.high
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_DATASET",
      [
        `Historical dataset "${datasetId}" version ${version}`,
        `contains invalid OHLC values at candle index ${index}.`,
      ].join(" "),
      {
        datasetId,
        version,
      },
    );
  }

  if (
    candle.quoteVolume !== undefined
  ) {
    validateFiniteNonNegativeValue(
      datasetId,
      version,
      index,
      "quoteVolume",
      candle.quoteVolume,
    );
  }

  if (
    candle.takerBuyBaseVolume !==
    undefined
  ) {
    validateFiniteNonNegativeValue(
      datasetId,
      version,
      index,
      "takerBuyBaseVolume",
      candle.takerBuyBaseVolume,
    );
  }

  if (
    candle.takerBuyQuoteVolume !==
    undefined
  ) {
    validateFiniteNonNegativeValue(
      datasetId,
      version,
      index,
      "takerBuyQuoteVolume",
      candle.takerBuyQuoteVolume,
    );
  }

  if (
    candle.tradeCount !== undefined &&
    (
      !Number.isSafeInteger(
        candle.tradeCount,
      ) ||
      candle.tradeCount < 0
    )
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_DATASET",
      [
        `Historical dataset "${datasetId}" version ${version}`,
        `contains an invalid trade count at candle index ${index}.`,
      ].join(" "),
      {
        datasetId,
        version,
      },
    );
  }

  if (
    typeof candle.isClosed !==
    "boolean"
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_DATASET",
      [
        `Historical dataset "${datasetId}" version ${version}`,
        `contains an invalid isClosed value at candle index ${index}.`,
      ].join(" "),
      {
        datasetId,
        version,
      },
    );
  }
}

/**
 * Validates a numeric candle value.
 */
function validateFiniteNonNegativeValue(
  datasetId: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
  index: number,
  fieldName: string,
  value: number,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_DATASET",
      [
        `Historical dataset "${datasetId}" version ${version}`,
        `contains an invalid ${fieldName} value at candle index ${index}.`,
      ].join(" "),
      {
        datasetId,
        version,
      },
    );
  }
}

/**
 * Validates that a candle is contained by dataset metadata.
 */
function validateCandleBelongsToDatasetRange(
  dataset: HistoricalDataset,
  candle: HistoricalCandle,
): void {
  if (
    Number(candle.openTime) <
      Number(
        dataset.metadata.range
          .startTime,
      ) ||
    Number(candle.closeTime) >
      Number(
        dataset.metadata.range.endTime,
      )
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RECORD_DATASET",
      [
        `Historical dataset "${dataset.id}" version ${dataset.version}`,
        "contains a candle outside its declared metadata range.",
      ].join(" "),
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }
}

/**
 * Validates a load range.
 */
function validateLoadRange(
  range:
    | HistoricalDatasetLoadRange
    | undefined,
): void {
  if (range === undefined) {
    return;
  }

  if (
    range.startTime !== undefined &&
    (
      !Number.isSafeInteger(
        range.startTime,
      ) ||
      range.startTime < 0
    )
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RANGE",
      "Historical dataset load start time must be a non-negative safe integer.",
    );
  }

  if (
    range.endTime !== undefined &&
    (
      !Number.isSafeInteger(
        range.endTime,
      ) ||
      range.endTime < 0
    )
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RANGE",
      "Historical dataset load end time must be a non-negative safe integer.",
    );
  }

  if (
    range.startTime !== undefined &&
    range.endTime !== undefined &&
    Number(range.startTime) >
      Number(range.endTime)
  ) {
    throw new HistoricalDatasetLoaderError(
      "INVALID_RANGE",
      "Historical dataset load start time must not be after its end time.",
    );
  }
}

/**
 * Determines whether one candle matches a load range.
 */
function matchesLoadRange(
  candle: HistoricalCandle,
  range:
    | HistoricalDatasetLoadRange
    | undefined,
): boolean {
  if (range === undefined) {
    return true;
  }

  if (
    range.startTime !== undefined &&
    Number(candle.openTime) <
      Number(range.startTime)
  ) {
    return false;
  }

  if (
    range.endTime !== undefined &&
    Number(candle.openTime) >
      Number(range.endTime)
  ) {
    return false;
  }

  return true;
}

/**
 * Intersects two optional inclusive ranges.
 *
 * Returns undefined when the ranges do not overlap.
 */
function intersectLoadRanges(
  first:
    | HistoricalDatasetLoadRange
    | undefined,
  second: HistoricalDatasetLoadRange,
): HistoricalDatasetLoadRange | undefined {
  validateLoadRange(first);
  validateLoadRange(second);

  const firstStart =
    first?.startTime === undefined
      ? Number.NEGATIVE_INFINITY
      : Number(first.startTime);

  const firstEnd =
    first?.endTime === undefined
      ? Number.POSITIVE_INFINITY
      : Number(first.endTime);

  const secondStart =
    second.startTime === undefined
      ? Number.NEGATIVE_INFINITY
      : Number(second.startTime);

  const secondEnd =
    second.endTime === undefined
      ? Number.POSITIVE_INFINITY
      : Number(second.endTime);

  const start =
    Math.max(
      firstStart,
      secondStart,
    );

  const end =
    Math.min(
      firstEnd,
      secondEnd,
    );

  if (start > end) {
    return undefined;
  }

  return Object.freeze({
    ...(Number.isFinite(start)
      ? {
          startTime:
            start as HistoricalTimestamp,
        }
      : {}),

    ...(Number.isFinite(end)
      ? {
          endTime:
            end as HistoricalTimestamp,
        }
      : {}),
  });
}

/**
 * Creates an immutable stream batch.
 */
function createCandleBatch(
  options: Readonly<{
    datasetId: HistoricalDatasetId;
    version: HistoricalDatasetVersion;
    batch: readonly HistoricalCandle[];
    batchIndex: number;
    totalRecordIndex: number;
  }>,
): HistoricalDatasetCandleBatch {
  return Object.freeze({
    datasetId:
      options.datasetId,

    version:
      options.version,

    batchIndex:
      options.batchIndex,

    firstRecordIndex:
      options.totalRecordIndex,

    lastRecordIndex:
      options.totalRecordIndex +
      options.batch.length -
      1,

    candles: Object.freeze(
      options.batch.map(
        cloneAndFreezeHistoricalCandle,
      ),
    ),
  });
}

/**
 * Creates an immutable defensive candle copy.
 */
function cloneAndFreezeHistoricalCandle(
  candle: HistoricalCandle,
): HistoricalCandle {
  return Object.freeze({
    sequence: candle.sequence,

    openTime: candle.openTime,
    closeTime: candle.closeTime,

    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,

    volume: candle.volume,

    ...(candle.quoteVolume === undefined
      ? {}
      : {
          quoteVolume:
            candle.quoteVolume,
        }),

    ...(candle.tradeCount === undefined
      ? {}
      : {
          tradeCount:
            candle.tradeCount,
        }),

    ...(candle
      .takerBuyBaseVolume === undefined
      ? {}
      : {
          takerBuyBaseVolume:
            candle
              .takerBuyBaseVolume,
        }),

    ...(candle
      .takerBuyQuoteVolume === undefined
      ? {}
      : {
          takerBuyQuoteVolume:
            candle
              .takerBuyQuoteVolume,
        }),

    isClosed: candle.isClosed,
  });
}

/**
 * Creates an immutable defensive partition copy.
 */
function cloneHistoricalDatasetPartition(
  partition: HistoricalDatasetPartition,
): HistoricalDatasetPartition {
  return Object.freeze({
    id: partition.id,

    datasetId:
      partition.datasetId,

    ordinal:
      partition.ordinal,

    strategy:
      partition.strategy,

    range: Object.freeze({
      startTime:
        partition.range.startTime,

      endTime:
        partition.range.endTime,
    }),

    firstSequence:
      partition.firstSequence,

    lastSequence:
      partition.lastSequence,

    recordCount:
      historicalCount(
        Number(
          partition.recordCount,
        ),
      ),

    ...(partition.location === undefined
      ? {}
      : {
          location:
            partition.location,
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
              partition.checksum
                .calculatedAt,

            recordCount:
              partition.checksum
                .recordCount,
          }),
        }),
  });
}

/**
 * Converts record-store errors into loader errors.
 */
function normalizeStorageFailure(
  error: unknown,
  datasetId: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
  partitionId?: HistoricalPartitionId,
): HistoricalDatasetLoaderError {
  if (
    error instanceof
    HistoricalDatasetLoaderError
  ) {
    return error;
  }

  return new HistoricalDatasetLoaderError(
    "STORAGE_FAILURE",
    error instanceof Error
      ? error.message
      : [
          "Unknown historical dataset storage failure:",
          `${String(error)}.`,
        ].join(" "),
    {
      datasetId,
      version,

      ...(partitionId === undefined
        ? {}
        : {
            partitionId,
          }),

      cause: error,
    },
  );
}