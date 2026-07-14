import {
  HistoricalCandle,
  HistoricalChecksumAlgorithm,
  HistoricalDataset,
  HistoricalDatasetId,
  HistoricalDatasetPartition,
  HistoricalDatasetVersion,
  HistoricalTimestamp,
  historicalCount,
} from "./historical-dataset.types";

import {
  createHistoricalDataset,
  HistoricalDatasetDomainError,
  transitionHistoricalDatasetStatus,
} from "./historical-dataset";

import {
  HistoricalDatasetRepository,
  HistoricalDatasetRepositoryError,
} from "./historical-dataset.repository";

import {
  HistoricalDatasetIndex,
  HistoricalDatasetIndexError,
} from "./historical-dataset.index";

import {
  HistoricalDatasetChecksumService,
} from "./historical-dataset.checksum";

import {
  HistoricalDatasetIntegrityReport,
  HistoricalDatasetIntegrityValidationOptions,
  HistoricalDatasetIntegrityValidator,
} from "./historical-dataset.integrity";

import {
  HistoricalDatasetPartitioner,
  HistoricalDatasetPartitioningResult,
} from "./historical-dataset.partitioning";

/**
 * Historical import lifecycle stages.
 */
export const HISTORICAL_DATA_IMPORT_STAGES = [
  "INITIALIZING",
  "READING",
  "VALIDATING",
  "CHECKSUM",
  "PARTITIONING",
  "PERSISTING",
  "INDEXING",
  "COMPLETED",
  "FAILED",
] as const;

export type HistoricalDataImportStage =
  (typeof HISTORICAL_DATA_IMPORT_STAGES)[number];

/**
 * Historical import outcomes.
 */
export const HISTORICAL_DATA_IMPORT_OUTCOMES = [
  "COMPLETED",
  "REJECTED",
  "FAILED",
] as const;

export type HistoricalDataImportOutcome =
  (typeof HISTORICAL_DATA_IMPORT_OUTCOMES)[number];

/**
 * Import diagnostic severity.
 */
export const HISTORICAL_DATA_IMPORT_DIAGNOSTIC_SEVERITIES = [
  "ERROR",
  "WARNING",
  "INFO",
] as const;

export type HistoricalDataImportDiagnosticSeverity =
  (typeof HISTORICAL_DATA_IMPORT_DIAGNOSTIC_SEVERITIES)[number];

/**
 * Historical import error and diagnostic codes.
 */
export const HISTORICAL_DATA_IMPORT_ERROR_CODES = [
  "EMPTY_IMPORT",
  "INVALID_CONFIGURATION",
  "INVALID_RECORD",
  "MAXIMUM_RECORDS_EXCEEDED",
  "DATASET_ALREADY_EXISTS",
  "DATASET_VALIDATION_FAILED",
  "CHECKSUM_FAILED",
  "PARTITIONING_FAILED",
  "PERSISTENCE_FAILED",
  "INDEXING_FAILED",
  "SOURCE_FAILED",
  "IMPORT_FAILED",
] as const;

export type HistoricalDataImportErrorCode =
  (typeof HISTORICAL_DATA_IMPORT_ERROR_CODES)[number];

/**
 * Typed historical-data import error.
 */
export class HistoricalDataImportError extends Error {
  public readonly code: HistoricalDataImportErrorCode;
  public readonly datasetId?: HistoricalDatasetId;
  public readonly stage?: HistoricalDataImportStage;
  public readonly cause?: unknown;

  public constructor(
    code: HistoricalDataImportErrorCode,
    message: string,
    options: Readonly<{
      datasetId?: HistoricalDatasetId;
      stage?: HistoricalDataImportStage;
      cause?: unknown;
    }> = {},
  ) {
    super(message);

    this.name = "HistoricalDataImportError";
    this.code = code;
    this.datasetId = options.datasetId;
    this.stage = options.stage;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Immutable import diagnostic.
 */
export interface HistoricalDataImportDiagnostic {
  readonly code: HistoricalDataImportErrorCode;
  readonly severity: HistoricalDataImportDiagnosticSeverity;
  readonly message: string;

  readonly stage: HistoricalDataImportStage;
  readonly datasetId: HistoricalDatasetId;

  readonly recordIndex?: number;
}

/**
 * Immutable import progress event.
 */
export interface HistoricalDataImportProgress {
  readonly datasetId: HistoricalDatasetId;
  readonly stage: HistoricalDataImportStage;

  readonly recordsRead: number;
  readonly totalRecords?: number;

  readonly progressPercentage?: number;
  readonly message: string;
}

/**
 * Progress listener.
 */
export type HistoricalDataImportProgressListener = (
  progress: HistoricalDataImportProgress,
) => void | Promise<void>;

/**
 * Supported historical import sources.
 */
export type HistoricalDataImportSource =
  | readonly HistoricalCandle[]
  | Iterable<HistoricalCandle>
  | AsyncIterable<HistoricalCandle>;

/**
 * Dataset definition supplied to the importer.
 *
 * The importer derives the record count and dataset range from the records.
 */
export interface HistoricalDataImportDatasetDefinition {
  readonly id: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;

  readonly source:
    HistoricalDataset["metadata"]["source"];

  readonly origin:
    HistoricalDataset["metadata"]["origin"];

  readonly marketType:
    HistoricalDataset["metadata"]["marketType"];

  readonly symbol:
    HistoricalDataset["metadata"]["symbol"];

  readonly timeframe:
    HistoricalDataset["metadata"]["timeframe"];

  readonly encoding:
    HistoricalDataset["storage"]["encoding"];

  readonly partitionStrategy:
    HistoricalDataset["storage"]["partitionStrategy"];

  readonly createdAt: HistoricalTimestamp;

  readonly externalReference?: string;
  readonly description?: string;

  readonly attributes?:
    HistoricalDataset["metadata"]["attributes"];
}

/**
 * Historical import configuration.
 */
export interface HistoricalDataImportOptions {
  /**
   * Reject an import when no records are supplied.
   *
   * Default: true.
   */
  readonly requireRecords?: boolean;

  /**
   * Maximum number of accepted records.
   *
   * Default: 10,000,000.
   */
  readonly maximumRecords?: number;

  /**
   * Reject the import when the same dataset revision already exists.
   *
   * Default: true.
   */
  readonly rejectExistingDataset?: boolean;

  /**
   * Generate a complete dataset checksum.
   *
   * Default: true.
   */
  readonly generateChecksum?: boolean;

  /**
   * Checksum algorithm.
   *
   * Default: SHA256.
   */
  readonly checksumAlgorithm?: HistoricalChecksumAlgorithm;

  /**
   * Generate a checksum for each partition.
   *
   * Default: true.
   */
  readonly generatePartitionChecksums?: boolean;

  /**
   * Required when partitionStrategy is BY_RECORD_COUNT.
   */
  readonly maximumRecordsPerPartition?: number;

  /**
   * Additional integrity validation configuration.
   */
  readonly integrity?: HistoricalDatasetIntegrityValidationOptions;

  /**
   * Persist rejected dataset metadata.
   *
   * Default: true.
   */
  readonly persistRejectedDataset?: boolean;

  /**
   * Add completed or rejected datasets to the dataset index.
   *
   * Default: true.
   */
  readonly updateIndex?: boolean;

  /**
   * Optional progress listener.
   */
  readonly onProgress?: HistoricalDataImportProgressListener;
}

/**
 * Historical import request.
 */
export interface HistoricalDataImportRequest {
  readonly definition: HistoricalDataImportDatasetDefinition;
  readonly records: HistoricalDataImportSource;

  /**
   * Deterministic timestamp used for lifecycle transitions and checksums.
   */
  readonly importedAt: HistoricalTimestamp;

  readonly options?: HistoricalDataImportOptions;
}

/**
 * Immutable import statistics.
 */
export interface HistoricalDataImportStatistics {
  readonly recordsRead: number;
  readonly recordsAccepted: number;
  readonly recordsRejected: number;

  readonly partitionCount: number;

  readonly startedAt: HistoricalTimestamp;
  readonly completedAt: HistoricalTimestamp;
}

/**
 * Immutable import result.
 */
export interface HistoricalDataImportResult {
  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;

  readonly outcome: HistoricalDataImportOutcome;
  readonly finalStage: HistoricalDataImportStage;

  readonly dataset?: HistoricalDataset;
  readonly candles: readonly HistoricalCandle[];

  readonly partitions:
    readonly HistoricalDatasetPartition[];

  readonly integrityReport?:
    HistoricalDatasetIntegrityReport;

  readonly diagnostics:
    readonly HistoricalDataImportDiagnostic[];

  readonly statistics:
    HistoricalDataImportStatistics;
}

/**
 * Importer dependencies.
 */
export interface HistoricalDataImporterDependencies {
  readonly repository: HistoricalDatasetRepository;
  readonly index: HistoricalDatasetIndex;

  readonly checksumService:
    HistoricalDatasetChecksumService;

  readonly integrityValidator:
    HistoricalDatasetIntegrityValidator;

  readonly partitioner:
    HistoricalDatasetPartitioner;
}

/**
 * Historical importer abstraction.
 */
export interface HistoricalDataImporter {
  import(
    request: HistoricalDataImportRequest,
  ): Promise<HistoricalDataImportResult>;
}

/**
 * Deterministic production historical-data import pipeline.
 */
export class DeterministicHistoricalDataImporter
  implements HistoricalDataImporter
{
  private readonly repository:
    HistoricalDatasetRepository;

  private readonly index:
    HistoricalDatasetIndex;

  private readonly checksumService:
    HistoricalDatasetChecksumService;

  private readonly integrityValidator:
    HistoricalDatasetIntegrityValidator;

  private readonly partitioner:
    HistoricalDatasetPartitioner;

  public constructor(
    dependencies: HistoricalDataImporterDependencies,
  ) {
    this.repository = dependencies.repository;
    this.index = dependencies.index;
    this.checksumService =
      dependencies.checksumService;
    this.integrityValidator =
      dependencies.integrityValidator;
    this.partitioner =
      dependencies.partitioner;
  }

  public async import(
    request: HistoricalDataImportRequest,
  ): Promise<HistoricalDataImportResult> {
    const options =
      normalizeImportOptions(request.options);

    const diagnostics:
      HistoricalDataImportDiagnostic[] = [];

    const startedAt = request.importedAt;

    let stage: HistoricalDataImportStage =
      "INITIALIZING";

    let dataset: HistoricalDataset | undefined;

    let candles: readonly HistoricalCandle[] =
      Object.freeze([]);

    let partitioningResult:
      | HistoricalDatasetPartitioningResult
      | undefined;

    let integrityReport:
      | HistoricalDatasetIntegrityReport
      | undefined;

    try {
      /*
       * Validation is inside the try block so invalid configuration is
       * returned as a structured FAILED import result instead of rejecting
       * the import promise.
       */
      validateImportRequest(
        request,
        options,
      );

      await emitProgress(
        request,
        stage,
        0,
        undefined,
        "Initializing historical dataset import.",
      );

      const exists =
        await this.repository.exists({
          id: request.definition.id,
          version:
            request.definition.version,
        });

      if (
        exists &&
        options.rejectExistingDataset
      ) {
        throw new HistoricalDataImportError(
          "DATASET_ALREADY_EXISTS",
          [
            `Historical dataset "${request.definition.id}"`,
            `version ${request.definition.version} already exists.`,
          ].join(" "),
          {
            datasetId:
              request.definition.id,
            stage,
          },
        );
      }

      stage = "READING";

      await emitProgress(
        request,
        stage,
        0,
        getKnownRecordCount(
          request.records,
        ),
        "Reading historical candle records.",
      );

      candles =
        await materializeImportRecords(
          request,
          options,
        );

      if (
        candles.length === 0 &&
        options.requireRecords
      ) {
        throw new HistoricalDataImportError(
          "EMPTY_IMPORT",
          `Historical dataset "${request.definition.id}" contains no records.`,
          {
            datasetId:
              request.definition.id,
            stage,
          },
        );
      }

      const range =
        deriveDatasetRange(
          request.definition.id,
          candles,
          request.importedAt,
        );

      dataset = createHistoricalDataset({
        id: request.definition.id,

        version:
          request.definition.version,

        source:
          request.definition.source,

        origin:
          request.definition.origin,

        marketType:
          request.definition.marketType,

        symbol:
          request.definition.symbol,

        timeframe:
          request.definition.timeframe,

        range,

        recordCount:
          historicalCount(candles.length),

        createdAt:
          request.definition.createdAt,

        encoding:
          request.definition.encoding,

        partitionStrategy:
          request.definition
            .partitionStrategy,

        ...(request.definition
          .externalReference === undefined
          ? {}
          : {
              externalReference:
                request.definition
                  .externalReference,
            }),

        ...(request.definition
          .description === undefined
          ? {}
          : {
              description:
                request.definition
                  .description,
            }),

        ...(request.definition
          .attributes === undefined
          ? {}
          : {
              attributes:
                request.definition
                  .attributes,
            }),
      });

      dataset =
        transitionHistoricalDatasetStatus({
          dataset,
          nextStatus: "IMPORTING",
          updatedAt: request.importedAt,
        });

      stage = "VALIDATING";

      await emitProgress(
        request,
        stage,
        candles.length,
        candles.length,
        "Validating historical dataset integrity.",
      );

      dataset =
        transitionHistoricalDatasetStatus({
          dataset,
          nextStatus: "VALIDATING",
          updatedAt: request.importedAt,
        });

      integrityReport =
        this.integrityValidator.validate(
          dataset,
          candles,
          {
            ...options.integrity,

            /*
             * Keep the import and integrity policies consistent.
             *
             * When requireRecords is false, an empty import must not be
             * independently rejected by the integrity validator.
             */
            requireRecords:
              options.requireRecords,

            /*
             * The checksum is generated after structural validation.
             */
            verifyChecksum: false,
            requireChecksum: false,
          },
        );

      if (!integrityReport.valid) {
        appendIntegrityDiagnostics(
          diagnostics,
          dataset.id,
          integrityReport,
        );

        dataset =
          transitionHistoricalDatasetStatus({
            dataset,
            nextStatus: "REJECTED",
            updatedAt:
              request.importedAt,
          });

        if (
          options.persistRejectedDataset
        ) {
          stage = "PERSISTING";

          await emitProgress(
            request,
            stage,
            candles.length,
            candles.length,
            "Persisting rejected historical dataset metadata.",
          );

          await this.repository.save({
            dataset,
          });
        }

        if (options.updateIndex) {
          stage = "INDEXING";

          await emitProgress(
            request,
            stage,
            candles.length,
            candles.length,
            "Indexing rejected historical dataset.",
          );

          this.index.replace(dataset);
        }

        await emitProgress(
          request,
          "COMPLETED",
          candles.length,
          candles.length,
          "Historical dataset import completed with rejection.",
        );

        return createImportResult({
          request,
          outcome: "REJECTED",
          finalStage: "COMPLETED",
          dataset,
          candles,
          partitions: [],
          integrityReport,
          diagnostics,
          startedAt,
        });
      }

      if (options.generateChecksum) {
        stage = "CHECKSUM";

        await emitProgress(
          request,
          stage,
          candles.length,
          candles.length,
          "Calculating historical dataset checksum.",
        );

        const checksum =
          this.checksumService.calculate({
            datasetId: dataset.id,
            candles,

            algorithm:
              options.checksumAlgorithm,

            calculatedAt:
              request.importedAt,

            allowEmpty:
              !options.requireRecords,
          });

        dataset = Object.freeze({
          ...dataset,
          checksum,
        });
      }

      stage = "PARTITIONING";

      await emitProgress(
        request,
        stage,
        candles.length,
        candles.length,
        "Partitioning historical dataset.",
      );

      partitioningResult =
        this.partitioner.partition({
          datasetId: dataset.id,
          candles,

          strategy:
            dataset.storage
              .partitionStrategy,

          ...(options
            .maximumRecordsPerPartition ===
          undefined
            ? {}
            : {
                maximumRecordsPerPartition:
                  options
                    .maximumRecordsPerPartition,
              }),

          allowEmpty:
            !options.requireRecords,

          ...(options
            .generatePartitionChecksums
            ? {
                checksum: {
                  algorithm:
                    options
                      .checksumAlgorithm,

                  calculatedAt:
                    request.importedAt,

                  service:
                    this.checksumService,
                },
              }
            : {}),
        });

      const partitions =
        partitioningResult.partitions.map(
          (entry) => entry.partition,
        );

      dataset = Object.freeze({
        ...dataset,

        storage: Object.freeze({
          ...dataset.storage,

          partitions:
            Object.freeze(partitions),
        }),
      });

      dataset =
        transitionHistoricalDatasetStatus({
          dataset,
          nextStatus: "READY",
          updatedAt: request.importedAt,
        });

      stage = "PERSISTING";

      await emitProgress(
        request,
        stage,
        candles.length,
        candles.length,
        "Persisting historical dataset.",
      );

      const saveResult =
        await this.repository.save({
          dataset,
        });

      dataset = saveResult.dataset;

      if (options.updateIndex) {
        stage = "INDEXING";

        await emitProgress(
          request,
          stage,
          candles.length,
          candles.length,
          "Indexing historical dataset.",
        );

        this.index.replace(dataset);
      }

      stage = "COMPLETED";

      await emitProgress(
        request,
        stage,
        candles.length,
        candles.length,
        "Historical dataset import completed.",
      );

      return createImportResult({
        request,
        outcome: "COMPLETED",
        finalStage: stage,
        dataset,
        candles,
        partitions,
        integrityReport,
        diagnostics,
        startedAt,
      });
    } catch (error: unknown) {
      /*
       * Preserve the stage in which the failure occurred before changing the
       * externally reported final stage to FAILED.
       */
      const failureStage = stage;

      stage = "FAILED";

      const normalizedError =
        normalizeImportFailure(
          error,
          request.definition.id,
          failureStage,
        );

      diagnostics.push(
        createDiagnostic({
          code: normalizedError.code,
          severity: "ERROR",
          message:
            normalizedError.message,

          stage:
            normalizedError.stage ??
            failureStage,

          datasetId:
            request.definition.id,
        }),
      );

      await safelyEmitFailureProgress(
        request,
        candles.length,
        normalizedError.message,
      );

      return createImportResult({
        request,
        outcome: "FAILED",
        finalStage: stage,

        ...(dataset === undefined
          ? {}
          : {
              dataset,
            }),

        candles,

        partitions:
          partitioningResult?.partitions.map(
            (entry) =>
              entry.partition,
          ) ?? [],

        ...(integrityReport === undefined
          ? {}
          : {
              integrityReport,
            }),

        diagnostics,
        startedAt,
      });
    }
  }
}

/**
 * Fully normalized internal import configuration.
 */
interface NormalizedHistoricalDataImportOptions {
  readonly requireRecords: boolean;
  readonly maximumRecords: number;
  readonly rejectExistingDataset: boolean;

  readonly generateChecksum: boolean;

  readonly checksumAlgorithm:
    HistoricalChecksumAlgorithm;

  readonly generatePartitionChecksums: boolean;

  readonly maximumRecordsPerPartition?: number;

  readonly integrity:
    HistoricalDatasetIntegrityValidationOptions;

  readonly persistRejectedDataset: boolean;
  readonly updateIndex: boolean;

  readonly onProgress?:
    HistoricalDataImportProgressListener;
}

/**
 * Applies deterministic import option defaults.
 */
function normalizeImportOptions(
  options:
    | HistoricalDataImportOptions
    | undefined,
): NormalizedHistoricalDataImportOptions {
  return Object.freeze({
    requireRecords:
      options?.requireRecords ?? true,

    maximumRecords:
      options?.maximumRecords ??
      10_000_000,

    rejectExistingDataset:
      options?.rejectExistingDataset ??
      true,

    generateChecksum:
      options?.generateChecksum ?? true,

    checksumAlgorithm:
      options?.checksumAlgorithm ??
      "SHA256",

    generatePartitionChecksums:
      options
        ?.generatePartitionChecksums ??
      true,

    ...(options
      ?.maximumRecordsPerPartition ===
    undefined
      ? {}
      : {
          maximumRecordsPerPartition:
            options
              .maximumRecordsPerPartition,
        }),

    integrity:
      Object.freeze({
        ...(options?.integrity ?? {}),
      }),

    persistRejectedDataset:
      options
        ?.persistRejectedDataset ??
      true,

    updateIndex:
      options?.updateIndex ?? true,

    ...(options?.onProgress === undefined
      ? {}
      : {
          onProgress:
            options.onProgress,
        }),
  });
}

/**
 * Validates importer configuration.
 */
function validateImportRequest(
  request: HistoricalDataImportRequest,
  options: NormalizedHistoricalDataImportOptions,
): void {
  if (
    !Number.isSafeInteger(
      request.importedAt,
    ) ||
    request.importedAt < 0
  ) {
    throw new HistoricalDataImportError(
      "INVALID_CONFIGURATION",
      "Import timestamp must be a non-negative safe integer.",
      {
        datasetId:
          request.definition.id,
        stage: "INITIALIZING",
      },
    );
  }

  if (
    !Number.isSafeInteger(
      request.definition.createdAt,
    ) ||
    request.definition.createdAt < 0
  ) {
    throw new HistoricalDataImportError(
      "INVALID_CONFIGURATION",
      "Dataset creation timestamp must be a non-negative safe integer.",
      {
        datasetId:
          request.definition.id,
        stage: "INITIALIZING",
      },
    );
  }

  if (
    request.definition.createdAt >
    request.importedAt
  ) {
    throw new HistoricalDataImportError(
      "INVALID_CONFIGURATION",
      "Dataset creation timestamp must not be later than the import timestamp.",
      {
        datasetId:
          request.definition.id,
        stage: "INITIALIZING",
      },
    );
  }

  if (
    !Number.isSafeInteger(
      options.maximumRecords,
    ) ||
    options.maximumRecords <= 0
  ) {
    throw new HistoricalDataImportError(
      "INVALID_CONFIGURATION",
      "maximumRecords must be a positive safe integer.",
      {
        datasetId:
          request.definition.id,
        stage: "INITIALIZING",
      },
    );
  }

  if (
    request.definition
      .partitionStrategy ===
      "BY_RECORD_COUNT" &&
    (
      options
        .maximumRecordsPerPartition ===
        undefined ||
      !Number.isSafeInteger(
        options
          .maximumRecordsPerPartition,
      ) ||
      options
        .maximumRecordsPerPartition <= 0
    )
  ) {
    throw new HistoricalDataImportError(
      "INVALID_CONFIGURATION",
      [
        "maximumRecordsPerPartition must be a positive safe integer",
        "when using BY_RECORD_COUNT partitioning.",
      ].join(" "),
      {
        datasetId:
          request.definition.id,
        stage: "INITIALIZING",
      },
    );
  }
}

/**
 * Reads, validates, clones, and freezes all supplied import records.
 */
async function materializeImportRecords(
  request: HistoricalDataImportRequest,
  options: NormalizedHistoricalDataImportOptions,
): Promise<readonly HistoricalCandle[]> {
  const candles: HistoricalCandle[] = [];

  let index = 0;

  const total = getKnownRecordCount(
    request.records,
  );

  try {
    for await (
      const candle of toAsyncIterable(
        request.records,
      )
    ) {
      if (
        index >= options.maximumRecords
      ) {
        throw new HistoricalDataImportError(
          "MAXIMUM_RECORDS_EXCEEDED",
          [
            `Historical dataset "${request.definition.id}" exceeded`,
            `the maximum import size of ${options.maximumRecords} records.`,
          ].join(" "),
          {
            datasetId:
              request.definition.id,
            stage: "READING",
          },
        );
      }

      validateImportedCandle(
        request.definition.id,
        candle,
        index,
      );

      candles.push(
        cloneAndFreezeCandle(candle),
      );

      index += 1;

      await emitProgress(
        request,
        "READING",
        index,
        total,
        `Read historical candle ${index}.`,
      );
    }
  } catch (error: unknown) {
    if (
      error instanceof
      HistoricalDataImportError
    ) {
      throw error;
    }

    throw new HistoricalDataImportError(
      "SOURCE_FAILED",
      `Historical dataset source failed while reading record ${index}.`,
      {
        datasetId:
          request.definition.id,
        stage: "READING",
        cause: error,
      },
    );
  }

  return Object.freeze(candles);
}

/**
 * Converts synchronous or asynchronous import sources into one async stream.
 */
async function* toAsyncIterable(
  source: HistoricalDataImportSource,
): AsyncGenerator<
  HistoricalCandle,
  void,
  undefined
> {
  if (
    isAsyncIterable<HistoricalCandle>(
      source,
    )
  ) {
    for await (const item of source) {
      yield item;
    }

    return;
  }

  for (const item of source) {
    yield item;
  }
}

/**
 * Async iterable type guard.
 */
function isAsyncIterable<T>(
  value: unknown,
): value is AsyncIterable<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  );
}

/**
 * Returns the total count when the import source is an array.
 */
function getKnownRecordCount(
  source: HistoricalDataImportSource,
): number | undefined {
  if (Array.isArray(source)) {
    return source.length;
  }

  return undefined;
}

/**
 * Validates a single imported candle.
 */
function validateImportedCandle(
  datasetId: HistoricalDatasetId,
  candle: HistoricalCandle,
  index: number,
): void {
  if (
    candle === null ||
    typeof candle !== "object"
  ) {
    throw invalidRecord(
      datasetId,
      index,
      "record must be an object",
    );
  }

  if (
    !Number.isSafeInteger(
      candle.sequence,
    ) ||
    candle.sequence < 0
  ) {
    throw invalidRecord(
      datasetId,
      index,
      "sequence must be a non-negative safe integer",
    );
  }

  if (
    !Number.isSafeInteger(
      candle.openTime,
    ) ||
    candle.openTime < 0
  ) {
    throw invalidRecord(
      datasetId,
      index,
      "openTime must be a non-negative safe integer",
    );
  }

  if (
    !Number.isSafeInteger(
      candle.closeTime,
    ) ||
    candle.closeTime <
      candle.openTime
  ) {
    throw invalidRecord(
      datasetId,
      index,
      "closeTime must be a safe integer not earlier than openTime",
    );
  }

  validateImportedNumber(
    datasetId,
    index,
    "open",
    candle.open,
  );

  validateImportedNumber(
    datasetId,
    index,
    "high",
    candle.high,
  );

  validateImportedNumber(
    datasetId,
    index,
    "low",
    candle.low,
  );

  validateImportedNumber(
    datasetId,
    index,
    "close",
    candle.close,
  );

  validateImportedNumber(
    datasetId,
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
    throw invalidRecord(
      datasetId,
      index,
      "OHLC values form an invalid price range",
    );
  }

  validateOptionalImportedNumber(
    datasetId,
    index,
    "quoteVolume",
    candle.quoteVolume,
  );

  validateOptionalImportedNumber(
    datasetId,
    index,
    "takerBuyBaseVolume",
    candle.takerBuyBaseVolume,
  );

  validateOptionalImportedNumber(
    datasetId,
    index,
    "takerBuyQuoteVolume",
    candle.takerBuyQuoteVolume,
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
    throw invalidRecord(
      datasetId,
      index,
      "tradeCount must be a non-negative safe integer",
    );
  }

  if (
    typeof candle.isClosed !==
    "boolean"
  ) {
    throw invalidRecord(
      datasetId,
      index,
      "isClosed must be boolean",
    );
  }
}

/**
 * Validates a required numeric candle field.
 */
function validateImportedNumber(
  datasetId: HistoricalDatasetId,
  index: number,
  fieldName: string,
  value: number,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw invalidRecord(
      datasetId,
      index,
      `${fieldName} must be a finite non-negative number`,
    );
  }
}

/**
 * Validates an optional numeric candle field.
 */
function validateOptionalImportedNumber(
  datasetId: HistoricalDatasetId,
  index: number,
  fieldName: string,
  value: number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  validateImportedNumber(
    datasetId,
    index,
    fieldName,
    value,
  );
}

/**
 * Creates a typed invalid-record error.
 */
function invalidRecord(
  datasetId: HistoricalDatasetId,
  index: number,
  reason: string,
): HistoricalDataImportError {
  return new HistoricalDataImportError(
    "INVALID_RECORD",
    `Historical dataset "${datasetId}" record at index ${index}: ${reason}.`,
    {
      datasetId,
      stage: "READING",
    },
  );
}

/**
 * Derives the inclusive dataset range from the supplied records.
 */
function deriveDatasetRange(
  datasetId: HistoricalDatasetId,
  candles: readonly HistoricalCandle[],
  fallbackTimestamp: HistoricalTimestamp,
): Readonly<{
  startTime: HistoricalTimestamp;
  endTime: HistoricalTimestamp;
}> {
  if (candles.length === 0) {
    return Object.freeze({
      startTime: fallbackTimestamp,
      endTime: fallbackTimestamp,
    });
  }

  const first = candles[0];

  const last =
    candles[candles.length - 1];

  if (
    first === undefined ||
    last === undefined
  ) {
    throw new HistoricalDataImportError(
      "INVALID_RECORD",
      `Could not derive dataset range for "${datasetId}".`,
      {
        datasetId,
        stage: "READING",
      },
    );
  }

  return Object.freeze({
    startTime: first.openTime,
    endTime: last.closeTime,
  });
}

/**
 * Creates an immutable defensive copy of one candle.
 */
function cloneAndFreezeCandle(
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

    ...(candle.quoteVolume ===
    undefined
      ? {}
      : {
          quoteVolume:
            candle.quoteVolume,
        }),

    ...(candle.tradeCount ===
    undefined
      ? {}
      : {
          tradeCount:
            candle.tradeCount,
        }),

    ...(candle
      .takerBuyBaseVolume ===
    undefined
      ? {}
      : {
          takerBuyBaseVolume:
            candle
              .takerBuyBaseVolume,
        }),

    ...(candle
      .takerBuyQuoteVolume ===
    undefined
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
 * Converts integrity issues into importer diagnostics.
 */
function appendIntegrityDiagnostics(
  diagnostics:
    HistoricalDataImportDiagnostic[],
  datasetId: HistoricalDatasetId,
  report: HistoricalDatasetIntegrityReport,
): void {
  for (const issue of report.issues) {
    diagnostics.push(
      createDiagnostic({
        code:
          "DATASET_VALIDATION_FAILED",

        severity:
          issue.severity === "INFO"
            ? "INFO"
            : issue.severity,

        message: [
          `${issue.code}:`,
          issue.message,
        ].join(" "),

        stage: "VALIDATING",
        datasetId,

        ...(issue.recordIndex ===
        undefined
          ? {}
          : {
              recordIndex:
                issue.recordIndex,
            }),
      }),
    );
  }
}

/**
 * Creates an immutable import diagnostic.
 */
function createDiagnostic(
  diagnostic:
    HistoricalDataImportDiagnostic,
): HistoricalDataImportDiagnostic {
  return Object.freeze({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    stage: diagnostic.stage,
    datasetId:
      diagnostic.datasetId,

    ...(diagnostic.recordIndex ===
    undefined
      ? {}
      : {
          recordIndex:
            diagnostic.recordIndex,
        }),
  });
}

/**
 * Sends an immutable progress event to the configured listener.
 */
async function emitProgress(
  request: HistoricalDataImportRequest,
  stage: HistoricalDataImportStage,
  recordsRead: number,
  totalRecords: number | undefined,
  message: string,
): Promise<void> {
  const listener =
    request.options?.onProgress;

  if (listener === undefined) {
    return;
  }

  const progressPercentage =
    totalRecords === undefined
      ? undefined
      : totalRecords === 0
        ? 100
        : Math.min(
            100,
            (
              recordsRead /
              totalRecords
            ) * 100,
          );

  await listener(
    Object.freeze({
      datasetId:
        request.definition.id,

      stage,
      recordsRead,

      ...(totalRecords === undefined
        ? {}
        : {
            totalRecords,
          }),

      ...(progressPercentage ===
      undefined
        ? {}
        : {
            progressPercentage,
          }),

      message,
    }),
  );
}

/**
 * Sends failure progress without allowing listener failures to hide the
 * original import failure.
 */
async function safelyEmitFailureProgress(
  request: HistoricalDataImportRequest,
  recordsRead: number,
  message: string,
): Promise<void> {
  try {
    await emitProgress(
      request,
      "FAILED",
      recordsRead,
      getKnownRecordCount(
        request.records,
      ),
      message,
    );
  } catch {
    /*
     * Progress listeners must never mask the original import failure.
     */
  }
}

/**
 * Internal result factory input.
 */
interface CreateImportResultInput {
  readonly request:
    HistoricalDataImportRequest;

  readonly outcome:
    HistoricalDataImportOutcome;

  readonly finalStage:
    HistoricalDataImportStage;

  readonly dataset?: HistoricalDataset;

  readonly candles:
    readonly HistoricalCandle[];

  readonly partitions:
    readonly HistoricalDatasetPartition[];

  readonly integrityReport?:
    HistoricalDatasetIntegrityReport;

  readonly diagnostics:
    readonly HistoricalDataImportDiagnostic[];

  readonly startedAt:
    HistoricalTimestamp;
}

/**
 * Creates an immutable import result.
 */
function createImportResult(
  input: CreateImportResultInput,
): HistoricalDataImportResult {
  const completedAt =
    input.request.importedAt;

  return Object.freeze({
    datasetId:
      input.request.definition.id,

    version:
      input.request.definition.version,

    outcome: input.outcome,
    finalStage: input.finalStage,

    ...(input.dataset === undefined
      ? {}
      : {
          dataset: input.dataset,
        }),

    candles: Object.freeze(
      [...input.candles],
    ),

    partitions: Object.freeze(
      [...input.partitions],
    ),

    ...(input.integrityReport ===
    undefined
      ? {}
      : {
          integrityReport:
            input.integrityReport,
        }),

    diagnostics: Object.freeze(
      input.diagnostics.map(
        createDiagnostic,
      ),
    ),

    statistics: Object.freeze({
      recordsRead:
        input.candles.length,

      recordsAccepted:
        input.outcome === "COMPLETED"
          ? input.candles.length
          : 0,

      recordsRejected:
        input.outcome === "COMPLETED"
          ? 0
          : input.candles.length,

      partitionCount:
        input.partitions.length,

      startedAt: input.startedAt,
      completedAt,
    }),
  });
}

/**
 * Normalizes errors from all import subsystems.
 */
function normalizeImportFailure(
  error: unknown,
  datasetId: HistoricalDatasetId,
  fallbackStage:
    HistoricalDataImportStage,
): HistoricalDataImportError {
  if (
    error instanceof
    HistoricalDataImportError
  ) {
    return error;
  }

  if (
    error instanceof
    HistoricalDatasetDomainError
  ) {
    return new HistoricalDataImportError(
      "IMPORT_FAILED",
      error.message,
      {
        datasetId,
        stage: fallbackStage,
        cause: error,
      },
    );
  }

  if (
    error instanceof
    HistoricalDatasetRepositoryError
  ) {
    return new HistoricalDataImportError(
      "PERSISTENCE_FAILED",
      error.message,
      {
        datasetId,
        stage: "PERSISTING",
        cause: error,
      },
    );
  }

  if (
    error instanceof
    HistoricalDatasetIndexError
  ) {
    return new HistoricalDataImportError(
      "INDEXING_FAILED",
      error.message,
      {
        datasetId,
        stage: "INDEXING",
        cause: error,
      },
    );
  }

  if (error instanceof Error) {
    return new HistoricalDataImportError(
      mapFailureCodeForStage(
        fallbackStage,
      ),
      error.message,
      {
        datasetId,
        stage: fallbackStage,
        cause: error,
      },
    );
  }

  return new HistoricalDataImportError(
    mapFailureCodeForStage(
      fallbackStage,
    ),
    `Unknown historical data import failure: ${String(
      error,
    )}.`,
    {
      datasetId,
      stage: fallbackStage,
      cause: error,
    },
  );
}

/**
 * Maps a pipeline stage to its corresponding import failure code.
 */
function mapFailureCodeForStage(
  stage: HistoricalDataImportStage,
): HistoricalDataImportErrorCode {
  switch (stage) {
    case "READING":
      return "SOURCE_FAILED";

    case "CHECKSUM":
      return "CHECKSUM_FAILED";

    case "PARTITIONING":
      return "PARTITIONING_FAILED";

    case "PERSISTING":
      return "PERSISTENCE_FAILED";

    case "INDEXING":
      return "INDEXING_FAILED";

    default:
      return "IMPORT_FAILED";
  }
}