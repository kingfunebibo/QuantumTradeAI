import assert from "node:assert/strict";

import {
  HistoricalCandle,
  HistoricalDataset,
  historicalCount,
  historicalDataSource,
  historicalDatasetId,
  historicalDatasetVersion,
  historicalMarketSymbol,
  historicalPrice,
  historicalSequence,
  historicalTimestamp,
  historicalVolume,
} from "./historical-dataset.types";

import {
  InMemoryHistoricalDatasetRepository,
} from "./in-memory-historical-dataset.repository";

import {
  InMemoryHistoricalDatasetIndex,
} from "./historical-dataset.index";

import {
  DeterministicHistoricalDatasetChecksumService,
} from "./historical-dataset.checksum";

import {
  DeterministicHistoricalDatasetIntegrityValidator,
} from "./historical-dataset.integrity";

import {
  DeterministicHistoricalDatasetPartitioner,
} from "./historical-dataset.partitioning";

import {
  DeterministicHistoricalDataImporter,
  HistoricalDataImportProgress,
  HistoricalDataImportRequest,
} from "./historical-data.importer";

function createCandle(
  options: Readonly<{
    sequence: number;
    openTime: number;
    duration?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  }>,
): HistoricalCandle {
  const duration = options.duration ?? 60_000;
  const open = options.open ?? 100;
  const high = options.high ?? 110;
  const low = options.low ?? 90;
  const close = options.close ?? 105;

  return Object.freeze({
    sequence: historicalSequence(
      options.sequence,
    ),

    openTime: historicalTimestamp(
      options.openTime,
    ),

    closeTime: historicalTimestamp(
      options.openTime + duration - 1,
    ),

    open: historicalPrice(open),
    high: historicalPrice(high),
    low: historicalPrice(low),
    close: historicalPrice(close),

    volume: historicalVolume(
      options.volume ?? 10,
    ),

    quoteVolume: historicalVolume(
      (options.volume ?? 10) *
        (options.close ?? 105),
    ),

    tradeCount: historicalCount(
      100 + options.sequence,
    ),

    isClosed: true,
  });
}

function createSequentialCandles(
  count: number,
  startTime = 1_704_067_200_000,
): readonly HistoricalCandle[] {
  return Object.freeze(
    Array.from(
      { length: count },
      (_, index) =>
        createCandle({
          sequence: index,
          openTime:
            startTime + index * 60_000,
          open: 100 + index,
          high: 110 + index,
          low: 90 + index,
          close: 105 + index,
          volume: 10 + index,
        }),
    ),
  );
}

function createImporter(): Readonly<{
  importer: DeterministicHistoricalDataImporter;
  repository: InMemoryHistoricalDatasetRepository;
  index: InMemoryHistoricalDatasetIndex;
}> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const index =
    new InMemoryHistoricalDatasetIndex();

  const checksumService =
    new DeterministicHistoricalDatasetChecksumService();

  const integrityValidator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const importer =
    new DeterministicHistoricalDataImporter({
      repository,
      index,
      checksumService,
      integrityValidator,
      partitioner,
    });

  return Object.freeze({
    importer,
    repository,
    index,
  });
}

function createImportRequest(
  options: Readonly<{
    id?: string;
    version?: number;
    records?: HistoricalDataImportRequest["records"];
    partitionStrategy?:
      HistoricalDataset["storage"]["partitionStrategy"];
    importedAt?: number;
    maximumRecordsPerPartition?: number;
    onProgress?: (
      progress: HistoricalDataImportProgress,
    ) => void | Promise<void>;
  }> = {},
): HistoricalDataImportRequest {
  return {
    definition: {
      id: historicalDatasetId(
        options.id ?? "dataset:import",
      ),

      version: historicalDatasetVersion(
        options.version ?? 1,
      ),

      source: historicalDataSource(
        "binance",
      ),

      origin: "EXCHANGE_API",
      marketType: "SPOT",

      symbol: historicalMarketSymbol(
        "BTCUSDT",
      ),

      timeframe: "1m",

      encoding: "JSON_LINES",

      partitionStrategy:
        options.partitionStrategy ??
        "BY_RECORD_COUNT",

      createdAt: historicalTimestamp(
        1_704_100_000_000,
      ),

      externalReference:
        "binance-btcusdt-1m",

      description:
        "BTCUSDT one-minute candles",

      attributes: {
        environment: "test",
        verified: true,
      },
    },

    records:
      options.records ??
      createSequentialCandles(5),

    importedAt: historicalTimestamp(
      options.importedAt ??
        1_704_100_000_100,
    ),

    options: {
      maximumRecordsPerPartition:
        options.maximumRecordsPerPartition ??
        2,

      ...(options.onProgress === undefined
        ? {}
        : {
            onProgress:
              options.onProgress,
          }),
    },
  };
}

async function testSuccessfulArrayImport(): Promise<void> {
  const {
    importer,
    repository,
    index,
  } = createImporter();

  const request = createImportRequest();

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    result.finalStage,
    "COMPLETED",
  );

  assert.ok(result.dataset);

  assert.equal(
    result.dataset.status,
    "READY",
  );

  assert.equal(
    result.dataset.metadata.recordCount,
    5,
  );

  assert.equal(
    result.candles.length,
    5,
  );

  assert.equal(
    result.partitions.length,
    3,
  );

  assert.deepEqual(
    result.partitions.map(
      (partition) =>
        Number(partition.recordCount),
    ),
    [2, 2, 1],
  );

  assert.ok(
    result.dataset.checksum,
  );

  assert.equal(
    result.dataset.checksum.algorithm,
    "SHA256",
  );

  assert.equal(
    result.dataset.checksum.recordCount,
    5,
  );

  assert.equal(
    result.partitions.every(
      (partition) =>
        partition.checksum !== undefined,
    ),
    true,
  );

  assert.ok(result.integrityReport);

  assert.equal(
    result.integrityReport.valid,
    true,
  );

  assert.equal(
    result.diagnostics.length,
    0,
  );

  assert.deepEqual(
    result.statistics,
    {
      recordsRead: 5,
      recordsAccepted: 5,
      recordsRejected: 0,
      partitionCount: 3,
      startedAt:
        request.importedAt,
      completedAt:
        request.importedAt,
    },
  );

  assert.equal(
    await repository.count(),
    1,
  );

  const persisted =
    await repository.findById({
      id: request.definition.id,
      version:
        request.definition.version,
    });

  assert.ok(persisted);

  assert.equal(
    persisted.status,
    "READY",
  );

  assert.equal(
    persisted.storage.partitions.length,
    3,
  );

  assert.equal(
    index.has({
      datasetId:
        request.definition.id,
      version:
        request.definition.version,
    }),
    true,
  );
}

async function testStreamingImport(): Promise<void> {
  const { importer } = createImporter();

  const candles =
    createSequentialCandles(4);

  async function* stream(): AsyncGenerator<
    HistoricalCandle,
    void,
    undefined
  > {
    for (const candle of candles) {
      yield candle;
    }
  }

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:stream-import",
        records: stream(),
      }),
    );

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.deepEqual(
    result.candles,
    candles,
  );

  assert.equal(
    result.statistics.recordsRead,
    4,
  );
}

async function testIterableImport(): Promise<void> {
  const { importer } = createImporter();

  const candles =
    createSequentialCandles(3);

  const iterable: Iterable<HistoricalCandle> = {
    *[Symbol.iterator]() {
      yield* candles;
    },
  };

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:iterable-import",
        records: iterable,
      }),
    );

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    result.candles.length,
    3,
  );
}

async function testProgressEvents(): Promise<void> {
  const { importer } = createImporter();

  const progressEvents:
    HistoricalDataImportProgress[] = [];

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:progress",
        onProgress: (progress) => {
          progressEvents.push(progress);
        },
      }),
    );

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.ok(
    progressEvents.length > 0,
  );

  assert.equal(
    progressEvents[0]?.stage,
    "INITIALIZING",
  );

  assert.equal(
    progressEvents[
      progressEvents.length - 1
    ]?.stage,
    "COMPLETED",
  );

  const stages =
    progressEvents.map(
      (progress) => progress.stage,
    );

  assert.ok(
    stages.includes("READING"),
  );

  assert.ok(
    stages.includes("VALIDATING"),
  );

  assert.ok(
    stages.includes("CHECKSUM"),
  );

  assert.ok(
    stages.includes("PARTITIONING"),
  );

  assert.ok(
    stages.includes("PERSISTING"),
  );

  assert.ok(
    stages.includes("INDEXING"),
  );

  const completed =
    progressEvents[
      progressEvents.length - 1
    ];

  assert.ok(completed);

  assert.equal(
    completed.progressPercentage,
    100,
  );

  assert.equal(
    Object.isFrozen(completed),
    true,
  );
}

async function testRejectedDataset(): Promise<void> {
  const {
    importer,
    repository,
    index,
  } = createImporter();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),

    createCandle({
      sequence: 3,
      openTime: 1_060_000,
    }),
  ];

  const request = createImportRequest({
    id: "dataset:rejected",
    records: candles,
  });

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "REJECTED",
  );

  assert.equal(
    result.finalStage,
    "COMPLETED",
  );

  assert.ok(result.dataset);

  assert.equal(
    result.dataset.status,
    "REJECTED",
  );

  assert.ok(result.integrityReport);

  assert.equal(
    result.integrityReport.valid,
    false,
  );

  assert.equal(
    result.diagnostics.length > 0,
    true,
  );

  assert.equal(
    result.statistics.recordsAccepted,
    0,
  );

  assert.equal(
    result.statistics.recordsRejected,
    2,
  );

  const persisted =
    await repository.findById({
      id: request.definition.id,
      version:
        request.definition.version,
    });

  assert.ok(persisted);

  assert.equal(
    persisted.status,
    "REJECTED",
  );

  assert.equal(
    index.has({
      datasetId:
        request.definition.id,
      version:
        request.definition.version,
    }),
    true,
  );
}

async function testRejectedDatasetNotPersisted(): Promise<void> {
  const {
    importer,
    repository,
    index,
  } = createImporter();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),

    createCandle({
      sequence: 4,
      openTime: 1_060_000,
    }),
  ];

  const request = {
    ...createImportRequest({
      id: "dataset:rejected-not-persisted",
      records: candles,
    }),

    options: {
      maximumRecordsPerPartition: 2,
      persistRejectedDataset: false,
      updateIndex: false,
    },
  } satisfies HistoricalDataImportRequest;

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "REJECTED",
  );

  assert.equal(
    await repository.count(),
    0,
  );

  assert.equal(
    index.count(),
    0,
  );
}

async function testDuplicateProtection(): Promise<void> {
  const {
    importer,
    repository,
  } = createImporter();

  const request = createImportRequest({
    id: "dataset:duplicate-import",
  });

  const first =
    await importer.import(request);

  assert.equal(
    first.outcome,
    "COMPLETED",
  );

  const second =
    await importer.import(request);

  assert.equal(
    second.outcome,
    "FAILED",
  );

  assert.equal(
    second.finalStage,
    "FAILED",
  );

  assert.equal(
    second.diagnostics.length,
    1,
  );

  assert.equal(
    second.diagnostics[0]?.code,
    "DATASET_ALREADY_EXISTS",
  );

  assert.equal(
    await repository.count(),
    1,
  );
}

async function testExistingDatasetReplacementAllowed(): Promise<void> {
  const {
    importer,
    repository,
  } = createImporter();

  const request = createImportRequest({
    id: "dataset:replacement-import",
  });

  const first =
    await importer.import(request);

  assert.equal(
    first.outcome,
    "COMPLETED",
  );

  const secondRequest = {
    ...request,

    records:
      createSequentialCandles(3),

    options: {
      maximumRecordsPerPartition: 2,
      rejectExistingDataset: false,
    },
  } satisfies HistoricalDataImportRequest;

  const second =
    await importer.import(
      secondRequest,
    );

  assert.equal(
    second.outcome,
    "COMPLETED",
  );

  assert.equal(
    second.dataset?.metadata.recordCount,
    3,
  );

  assert.equal(
    await repository.count(),
    1,
  );
}

async function testEmptyImportFailure(): Promise<void> {
  const {
    importer,
    repository,
  } = createImporter();

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:empty-import",
        records: [],
      }),
    );

  assert.equal(
    result.outcome,
    "FAILED",
  );

  assert.equal(
    result.diagnostics[0]?.code,
    "EMPTY_IMPORT",
  );

  assert.equal(
    await repository.count(),
    0,
  );
}

async function testAllowedEmptyImport(): Promise<void> {
  const {
    importer,
    repository,
  } = createImporter();

  const request = {
    ...createImportRequest({
      id: "dataset:allowed-empty",
      records: [],
      partitionStrategy: "NONE",
    }),

    options: {
      requireRecords: false,
      generateChecksum: true,
      generatePartitionChecksums: true,
      updateIndex: true,
    },
  } satisfies HistoricalDataImportRequest;

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.ok(result.dataset);

  assert.equal(
    result.dataset.status,
    "READY",
  );

  assert.equal(
    result.dataset.metadata.recordCount,
    0,
  );

  assert.equal(
    result.partitions.length,
    0,
  );

  assert.ok(
    result.dataset.checksum,
  );

  assert.equal(
    result.dataset.checksum.recordCount,
    0,
  );

  assert.equal(
    await repository.count(),
    1,
  );
}

async function testMaximumRecordsExceeded(): Promise<void> {
  const { importer } = createImporter();

  const request = {
    ...createImportRequest({
      id: "dataset:max-records",
      records:
        createSequentialCandles(5),
    }),

    options: {
      maximumRecords: 3,
      maximumRecordsPerPartition: 2,
    },
  } satisfies HistoricalDataImportRequest;

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "FAILED",
  );

  assert.equal(
    result.diagnostics[0]?.code,
    "MAXIMUM_RECORDS_EXCEEDED",
  );

  assert.equal(
    result.candles.length,
    0,
  );
}

async function testInvalidRecordFailure(): Promise<void> {
  const { importer } = createImporter();

  const valid = createCandle({
    sequence: 0,
    openTime: 1_000_000,
  });

  const invalid = {
    ...valid,
    high: historicalPrice(80),
  } satisfies HistoricalCandle;

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:invalid-record",
        records: [invalid],
      }),
    );

  assert.equal(
    result.outcome,
    "FAILED",
  );

  assert.equal(
    result.diagnostics[0]?.code,
    "INVALID_RECORD",
  );
}

async function testSourceFailure(): Promise<void> {
  const { importer } = createImporter();

  async function* failingSource(): AsyncGenerator<
    HistoricalCandle,
    void,
    undefined
  > {
    yield createCandle({
      sequence: 0,
      openTime: 1_000_000,
    });

    throw new Error(
      "Synthetic source failure",
    );
  }

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:source-failure",
        records: failingSource(),
      }),
    );

  assert.equal(
    result.outcome,
    "FAILED",
  );

  assert.equal(
    result.diagnostics[0]?.code,
    "SOURCE_FAILED",
  );
}

async function testProgressFailureDoesNotMaskImportFailure(): Promise<void> {
  const { importer } = createImporter();

  const request = {
    ...createImportRequest({
      id: "dataset:progress-failure",
      records: [],
    }),

    options: {
      maximumRecordsPerPartition: 2,

      onProgress: (
        progress:
          HistoricalDataImportProgress,
      ) => {
        if (progress.stage === "FAILED") {
          throw new Error(
            "Progress listener failure",
          );
        }
      },
    },
  } satisfies HistoricalDataImportRequest;

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "FAILED",
  );

  assert.equal(
    result.diagnostics[0]?.code,
    "EMPTY_IMPORT",
  );
}

async function testChecksumDisabled(): Promise<void> {
  const { importer } = createImporter();

  const request = {
    ...createImportRequest({
      id: "dataset:no-checksum",
    }),

    options: {
      maximumRecordsPerPartition: 2,
      generateChecksum: false,
      generatePartitionChecksums: false,
    },
  } satisfies HistoricalDataImportRequest;

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    result.dataset?.checksum,
    undefined,
  );

  assert.equal(
    result.partitions.every(
      (partition) =>
        partition.checksum === undefined,
    ),
    true,
  );
}

async function testIndexUpdateDisabled(): Promise<void> {
  const {
    importer,
    repository,
    index,
  } = createImporter();

  const request = {
    ...createImportRequest({
      id: "dataset:no-index",
    }),

    options: {
      maximumRecordsPerPartition: 2,
      updateIndex: false,
    },
  } satisfies HistoricalDataImportRequest;

  const result =
    await importer.import(request);

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    await repository.count(),
    1,
  );

  assert.equal(
    index.count(),
    0,
  );
}

async function testInvalidConfiguration(): Promise<void> {
  const { importer } = createImporter();

  const missingPartitionLimit = {
    ...createImportRequest({
      id: "dataset:missing-partition-limit",
    }),

    options: {},
  } satisfies HistoricalDataImportRequest;

  const first =
    await importer.import(
      missingPartitionLimit,
    );

  assert.equal(
    first.outcome,
    "FAILED",
  );

  assert.equal(
    first.diagnostics[0]?.code,
    "INVALID_CONFIGURATION",
  );

  const invalidMaximumRecords = {
    ...createImportRequest({
      id: "dataset:invalid-maximum-records",
    }),

    options: {
      maximumRecords: 0,
      maximumRecordsPerPartition: 2,
    },
  } satisfies HistoricalDataImportRequest;

  const second =
    await importer.import(
      invalidMaximumRecords,
    );

  assert.equal(
    second.outcome,
    "FAILED",
  );

  assert.equal(
    second.diagnostics[0]?.code,
    "INVALID_CONFIGURATION",
  );
}

async function testResultImmutability(): Promise<void> {
  const { importer } = createImporter();

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:result-immutability",
      }),
    );

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  assert.equal(
    Object.isFrozen(result),
    true,
  );

  assert.equal(
    Object.isFrozen(result.candles),
    true,
  );

  assert.equal(
    Object.isFrozen(result.partitions),
    true,
  );

  assert.equal(
    Object.isFrozen(result.diagnostics),
    true,
  );

  assert.equal(
    Object.isFrozen(result.statistics),
    true,
  );

  assert.throws(() => {
    (
      result.candles as unknown as
        HistoricalCandle[]
    ).push(
      createCandle({
        sequence: 99,
        openTime: 99_000,
      }),
    );
  }, TypeError);

  assert.throws(() => {
    (
      result.statistics as unknown as {
        recordsRead: number;
      }
    ).recordsRead = 999;
  }, TypeError);
}

async function testInputRecordIsolation(): Promise<void> {
  const { importer } = createImporter();

  const mutableRecord = {
    ...createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
  };

  const result =
    await importer.import(
      createImportRequest({
        id: "dataset:input-isolation",
        records: [mutableRecord],
      }),
    );

  assert.equal(
    result.outcome,
    "COMPLETED",
  );

  mutableRecord.close =
    historicalPrice(101);

  assert.equal(
    result.candles[0]?.close,
    105,
  );

  assert.equal(
    Object.isFrozen(
      result.candles[0],
    ),
    true,
  );
}

async function runHistoricalDataImporterTests(): Promise<void> {
  console.log(
    "Running historical data importer tests...",
  );

  await testSuccessfulArrayImport();
  await testStreamingImport();
  await testIterableImport();
  await testProgressEvents();

  await testRejectedDataset();
  await testRejectedDatasetNotPersisted();

  await testDuplicateProtection();
  await testExistingDatasetReplacementAllowed();

  await testEmptyImportFailure();
  await testAllowedEmptyImport();

  await testMaximumRecordsExceeded();
  await testInvalidRecordFailure();
  await testSourceFailure();

  await testProgressFailureDoesNotMaskImportFailure();

  await testChecksumDisabled();
  await testIndexUpdateDisabled();

  await testInvalidConfiguration();

  await testResultImmutability();
  await testInputRecordIsolation();

  console.log(
    "All historical data importer tests passed successfully.",
  );
}

void runHistoricalDataImporterTests();