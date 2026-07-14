import assert from "node:assert/strict";

import {
  createHistoricalDataset,
  transitionHistoricalDatasetStatus,
} from "./historical-dataset";

import {
  HistoricalCandle,
  HistoricalDataset,
  HistoricalDatasetPartition,
  historicalCount,
  historicalDataSource,
  historicalDatasetId,
  historicalDatasetVersion,
  historicalMarketSymbol,
  historicalPartitionId,
  historicalPrice,
  historicalSequence,
  historicalTimestamp,
  historicalVolume,
} from "./historical-dataset.types";

import {
  InMemoryHistoricalDatasetRepository,
} from "./in-memory-historical-dataset.repository";

import {
  DeterministicHistoricalDatasetLoader,
  HistoricalDatasetLoaderError,
  InMemoryHistoricalDatasetRecordStore,
  createHistoricalDatasetRecordStoreKey,
} from "./historical-dataset.loader";

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
  const duration =
    options.duration ?? 60_000;

  const open =
    options.open ?? 100;

  const high =
    options.high ?? open + 10;

  const low =
    options.low ?? open - 10;

  const close =
    options.close ?? open + 5;

  return Object.freeze({
    sequence: historicalSequence(
      options.sequence,
    ),

    openTime: historicalTimestamp(
      options.openTime,
    ),

    closeTime: historicalTimestamp(
      options.openTime +
        duration -
        1,
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
        close,
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
            startTime +
            index * 60_000,

          open: 100 + index,
          high: 110 + index,
          low: 90 + index,
          close: 105 + index,
          volume: 10 + index,
        }),
    ),
  );
}

function createPartitions(
  datasetId: ReturnType<
    typeof historicalDatasetId
  >,
  candles: readonly HistoricalCandle[],
  maximumRecordsPerPartition = 2,
): readonly HistoricalDatasetPartition[] {
  const partitions:
    HistoricalDatasetPartition[] = [];

  for (
    let startIndex = 0;
    startIndex < candles.length;
    startIndex +=
      maximumRecordsPerPartition
  ) {
    const partitionCandles =
      candles.slice(
        startIndex,
        startIndex +
          maximumRecordsPerPartition,
      );

    const first =
      partitionCandles[0];

    const last =
      partitionCandles[
        partitionCandles.length - 1
      ];

    assert.ok(first);
    assert.ok(last);

    partitions.push(
      Object.freeze({
        id: historicalPartitionId(
          [
            String(datasetId),
            "partition",
            String(partitions.length),
          ].join(":"),
        ),

        datasetId,

        ordinal:
          partitions.length,

        strategy:
          "BY_RECORD_COUNT",

        range: Object.freeze({
          startTime:
            first.openTime,

          endTime:
            last.closeTime,
        }),

        firstSequence:
          first.sequence,

        lastSequence:
          last.sequence,

        recordCount:
          historicalCount(
            partitionCandles.length,
          ),
      }),
    );
  }

  return Object.freeze(partitions);
}

function createDataset(
  options: Readonly<{
    id?: string;
    version?: number;
    candles?: readonly HistoricalCandle[];
    status?:
      | "CREATED"
      | "IMPORTING"
      | "VALIDATING"
      | "READY"
      | "REJECTED"
      | "ARCHIVED";
    includePartitions?: boolean;
    declaredRecordCount?: number;
  }> = {},
): HistoricalDataset {
  const candles =
    options.candles ??
    createSequentialCandles(5);

  const id =
    historicalDatasetId(
      options.id ??
        "dataset:loader",
    );

  const first = candles[0];
  const last =
    candles[candles.length - 1];

  const fallbackTimestamp =
    historicalTimestamp(
      1_704_100_000_000,
    );

  const created =
    createHistoricalDataset({
      id,

      version:
        historicalDatasetVersion(
          options.version ?? 1,
        ),

      source:
        historicalDataSource(
          "binance",
        ),

      origin:
        "EXCHANGE_API",

      marketType:
        "SPOT",

      symbol:
        historicalMarketSymbol(
          "BTCUSDT",
        ),

      timeframe:
        "1m",

      range: {
        startTime:
          first?.openTime ??
          fallbackTimestamp,

        endTime:
          last?.closeTime ??
          fallbackTimestamp,
      },

      recordCount:
        historicalCount(
          options
            .declaredRecordCount ??
            candles.length,
        ),

      createdAt:
        historicalTimestamp(
          1_704_100_000_000,
        ),

      encoding:
        "JSON_LINES",

      partitionStrategy:
        options.includePartitions ===
        false
          ? "NONE"
          : "BY_RECORD_COUNT",
    });

  const partitions =
    options.includePartitions === false
      ? Object.freeze(
          [] as HistoricalDatasetPartition[],
        )
      : createPartitions(
          id,
          candles,
        );

  let dataset: HistoricalDataset =
    Object.freeze({
      ...created,

      storage:
        Object.freeze({
          ...created.storage,
          partitions,
        }),
    });

  const targetStatus =
    options.status ?? "READY";

  if (targetStatus === "CREATED") {
    return dataset;
  }

  dataset =
    transitionHistoricalDatasetStatus({
      dataset,
      nextStatus:
        "IMPORTING",

      updatedAt:
        historicalTimestamp(
          1_704_100_000_001,
        ),
    });

  if (targetStatus === "IMPORTING") {
    return dataset;
  }

  dataset =
    transitionHistoricalDatasetStatus({
      dataset,
      nextStatus:
        "VALIDATING",

      updatedAt:
        historicalTimestamp(
          1_704_100_000_002,
        ),
    });

  if (targetStatus === "VALIDATING") {
    return dataset;
  }

  if (targetStatus === "REJECTED") {
    return transitionHistoricalDatasetStatus({
      dataset,
      nextStatus:
        "REJECTED",

      updatedAt:
        historicalTimestamp(
          1_704_100_000_003,
        ),
    });
  }

  dataset =
    transitionHistoricalDatasetStatus({
      dataset,
      nextStatus:
        "READY",

      updatedAt:
        historicalTimestamp(
          1_704_100_000_003,
        ),
    });

  if (targetStatus === "READY") {
    return dataset;
  }

  return transitionHistoricalDatasetStatus({
    dataset,
    nextStatus:
      "ARCHIVED",

    updatedAt:
      historicalTimestamp(
        1_704_100_000_004,
      ),
    });
}

function createInfrastructure(): Readonly<{
  repository:
    InMemoryHistoricalDatasetRepository;

  recordStore:
    InMemoryHistoricalDatasetRecordStore;

  loader:
    DeterministicHistoricalDatasetLoader;
}> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const recordStore =
    new InMemoryHistoricalDatasetRecordStore();

  const loader =
    new DeterministicHistoricalDatasetLoader({
      repository,
      recordStore,
    });

  return Object.freeze({
    repository,
    recordStore,
    loader,
  });
}

async function persistDatasetAndRecords(
  repository:
    InMemoryHistoricalDatasetRepository,
  recordStore:
    InMemoryHistoricalDatasetRecordStore,
  dataset: HistoricalDataset,
  candles: readonly HistoricalCandle[],
): Promise<void> {
  await repository.save({
    dataset,
  });

  await recordStore.save({
    datasetId:
      dataset.id,

    version:
      dataset.version,

    candles,
  });
}

async function assertRejectsLoaderError(
  operation: () => Promise<unknown>,
  expectedCode:
    HistoricalDatasetLoaderError["code"],
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof
          HistoricalDatasetLoaderError,
        "Expected HistoricalDatasetLoaderError.",
      );

      assert.equal(
        error.code,
        expectedCode,
      );

      return true;
    },
  );
}

async function collectAsync<T>(
  source: AsyncIterable<T>,
): Promise<readonly T[]> {
  const values: T[] = [];

  for await (const value of source) {
    values.push(value);
  }

  return Object.freeze(values);
}

async function testRecordStoreSaveAndRead(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const datasetId =
    historicalDatasetId(
      "dataset:record-store",
    );

  const version =
    historicalDatasetVersion(1);

  const candles =
    createSequentialCandles(4);

  const result =
    await store.save({
      datasetId,
      version,
      candles,
    });

  assert.equal(
    result.created,
    true,
  );

  assert.equal(
    result.recordCount,
    4,
  );

  assert.equal(
    Object.isFrozen(result),
    true,
  );

  assert.equal(
    await store.exists({
      datasetId,
      version,
    }),
    true,
  );

  assert.equal(
    await store.count({
      datasetId,
      version,
    }),
    4,
  );

  const loaded =
    await store.read({
      datasetId,
      version,
    });

  assert.deepEqual(
    loaded,
    candles,
  );

  assert.notEqual(
    loaded,
    candles,
  );

  assert.equal(
    Object.isFrozen(loaded),
    true,
  );

  assert.equal(
    Object.isFrozen(loaded[0]),
    true,
  );
}

async function testRecordStoreReplacement(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const datasetId =
    historicalDatasetId(
      "dataset:record-replacement",
    );

  const version =
    historicalDatasetVersion(1);

  await store.save({
    datasetId,
    version,
    candles:
      createSequentialCandles(3),
  });

  await assertRejectsLoaderError(
    async () => {
      await store.save({
        datasetId,
        version,
        candles:
          createSequentialCandles(2),
      });
    },
    "RECORDS_ALREADY_EXIST",
  );

  const replacement =
    await store.save({
      datasetId,
      version,
      candles:
        createSequentialCandles(2),
      rejectExisting: false,
    });

  assert.equal(
    replacement.created,
    false,
  );

  assert.equal(
    await store.count({
      datasetId,
      version,
    }),
    2,
  );
}

async function testRecordStoreRangeRead(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const datasetId =
    historicalDatasetId(
      "dataset:record-range",
    );

  const version =
    historicalDatasetVersion(1);

  const candles =
    createSequentialCandles(5);

  await store.save({
    datasetId,
    version,
    candles,
  });

  const loaded =
    await store.read({
      datasetId,
      version,

      range: {
        startTime:
          candles[1]!.openTime,

        endTime:
          candles[3]!.openTime,
      },
    });

  assert.deepEqual(
    loaded.map(
      (candle) =>
        Number(
          candle.sequence,
        ),
    ),
    [1, 2, 3],
  );
}

async function testRecordStoreStream(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const datasetId =
    historicalDatasetId(
      "dataset:record-stream",
    );

  const version =
    historicalDatasetVersion(1);

  const candles =
    createSequentialCandles(3);

  await store.save({
    datasetId,
    version,
    candles,
  });

  const streamed =
    await collectAsync(
      store.stream({
        datasetId,
        version,
      }),
    );

  assert.deepEqual(
    streamed,
    candles,
  );

  assert.equal(
    Object.isFrozen(
      streamed[0],
    ),
    true,
  );
}

async function testRecordStoreDeleteAndClear(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const firstId =
    historicalDatasetId(
      "dataset:record-delete:1",
    );

  const secondId =
    historicalDatasetId(
      "dataset:record-delete:2",
    );

  const version =
    historicalDatasetVersion(1);

  await store.save({
    datasetId:
      firstId,

    version,

    candles:
      createSequentialCandles(2),
  });

  await store.save({
    datasetId:
      secondId,

    version,

    candles:
      createSequentialCandles(2),
  });

  assert.equal(
    await store.delete({
      datasetId:
        firstId,

      version,
    }),
    true,
  );

  assert.equal(
    await store.exists({
      datasetId:
        firstId,

      version,
    }),
    false,
  );

  assert.equal(
    await store.delete({
      datasetId:
        firstId,

      version,
    }),
    false,
  );

  await store.clear();

  assert.equal(
    await store.exists({
      datasetId:
        secondId,

      version,
    }),
    false,
  );
}

async function testRecordStoreMissingRecords(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const datasetId =
    historicalDatasetId(
      "dataset:missing-records",
    );

  const version =
    historicalDatasetVersion(1);

  await assertRejectsLoaderError(
    async () => {
      await store.read({
        datasetId,
        version,
      });
    },
    "RECORDS_NOT_FOUND",
  );

  await assertRejectsLoaderError(
    async () => {
      await collectAsync(
        store.stream({
          datasetId,
          version,
        }),
      );
    },
    "RECORDS_NOT_FOUND",
  );
}

async function testRecordStoreOrderingValidation(): Promise<void> {
  const store =
    new InMemoryHistoricalDatasetRecordStore();

  const datasetId =
    historicalDatasetId(
      "dataset:invalid-order",
    );

  const version =
    historicalDatasetVersion(1);

  const outOfOrder = [
    createCandle({
      sequence: 0,
      openTime: 1_060_000,
    }),

    createCandle({
      sequence: 1,
      openTime: 1_000_000,
    }),
  ];

  await assertRejectsLoaderError(
    async () => {
      await store.save({
        datasetId,
        version,
        candles:
          outOfOrder,
      });
    },
    "INVALID_RECORD_ORDER",
  );

  const duplicateSequence = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),

    createCandle({
      sequence: 0,
      openTime: 1_060_000,
    }),
  ];

  await assertRejectsLoaderError(
    async () => {
      await store.save({
        datasetId,
        version,
        candles:
          duplicateSequence,
      });
    },
    "INVALID_RECORD_ORDER",
  );
}

async function testCanonicalStoreKey(): Promise<void> {
  const key =
    createHistoricalDatasetRecordStoreKey(
      historicalDatasetId(
        "dataset:key",
      ),
      historicalDatasetVersion(3),
    );

  assert.equal(
    key,
    "dataset:key::v3",
  );
}

async function testLoadCompleteDataset(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:load-complete",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const loaded =
    await loader.load({
      datasetId:
        dataset.id,

      version:
        dataset.version,
    });

  assert.deepEqual(
    loaded.dataset,
    dataset,
  );

  assert.deepEqual(
    loaded.candles,
    candles,
  );

  assert.equal(
    Object.isFrozen(loaded),
    true,
  );

  assert.equal(
    Object.isFrozen(
      loaded.candles,
    ),
    true,
  );

  assert.notEqual(
    loaded.candles,
    candles,
  );
}

async function testLoadLatestVersion(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const versionOneCandles =
    createSequentialCandles(2);

  const versionTwoCandles =
    createSequentialCandles(
      3,
      1_704_153_600_000,
    );

  const versionOne =
    createDataset({
      id:
        "dataset:latest",
      version: 1,
      candles:
        versionOneCandles,
    });

  const versionTwo =
    createDataset({
      id:
        "dataset:latest",
      version: 2,
      candles:
        versionTwoCandles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    versionOne,
    versionOneCandles,
  );

  await persistDatasetAndRecords(
    repository,
    recordStore,
    versionTwo,
    versionTwoCandles,
  );

  const loaded =
    await loader.load({
      datasetId:
        versionOne.id,
    });

  assert.equal(
    loaded.dataset.version,
    historicalDatasetVersion(2),
  );

  assert.deepEqual(
    loaded.candles,
    versionTwoCandles,
  );
}

async function testLoadSpecificVersion(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const versionOneCandles =
    createSequentialCandles(2);

  const versionTwoCandles =
    createSequentialCandles(
      4,
      1_704_153_600_000,
    );

  const versionOne =
    createDataset({
      id:
        "dataset:specific-version",
      version: 1,
      candles:
        versionOneCandles,
    });

  const versionTwo =
    createDataset({
      id:
        "dataset:specific-version",
      version: 2,
      candles:
        versionTwoCandles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    versionOne,
    versionOneCandles,
  );

  await persistDatasetAndRecords(
    repository,
    recordStore,
    versionTwo,
    versionTwoCandles,
  );

  const loaded =
    await loader.load({
      datasetId:
        versionOne.id,

      version:
        versionOne.version,
    });

  assert.equal(
    loaded.dataset.version,
    historicalDatasetVersion(1),
  );

  assert.deepEqual(
    loaded.candles,
    versionOneCandles,
  );
}

async function testDatasetNotFound(): Promise<void> {
  const { loader } =
    createInfrastructure();

  await assertRejectsLoaderError(
    async () => {
      await loader.load({
        datasetId:
          historicalDatasetId(
            "dataset:not-found",
          ),
      });
    },
    "DATASET_NOT_FOUND",
  );
}

async function testReadyStatusEnforcement(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(2);

  const dataset =
    createDataset({
      id:
        "dataset:not-ready",
      candles,
      status:
        "REJECTED",
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  await assertRejectsLoaderError(
    async () => {
      await loader.load({
        datasetId:
          dataset.id,

        version:
          dataset.version,
      });
    },
    "DATASET_NOT_READY",
  );

  const allowed =
    await loader.load({
      datasetId:
        dataset.id,

      version:
        dataset.version,

      allowNonReady:
        true,
    });

  assert.equal(
    allowed.dataset.status,
    "REJECTED",
  );
}

async function testRangeFilteredLoad(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:range-load",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const loaded =
    await loader.load({
      datasetId:
        dataset.id,

      range: {
        startTime:
          candles[1]!.openTime,

        endTime:
          candles[3]!.openTime,
      },
    });

  assert.deepEqual(
    loaded.candles.map(
      (candle) =>
        Number(
          candle.sequence,
        ),
    ),
    [1, 2, 3],
  );
}

async function testInvalidLoadRange(): Promise<void> {
  const { loader } =
    createInfrastructure();

  await assertRejectsLoaderError(
    async () => {
      await loader.load({
        datasetId:
          historicalDatasetId(
            "dataset:invalid-range",
          ),

        range: {
          startTime:
            historicalTimestamp(
              2_000,
            ),

          endTime:
            historicalTimestamp(
              1_000,
            ),
        },
      });
    },
    "INVALID_RANGE",
  );
}

async function testRecordCountMismatch(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(3);

  const dataset =
    createDataset({
      id:
        "dataset:count-mismatch",
      candles,
      declaredRecordCount:
        5,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  await assertRejectsLoaderError(
    async () => {
      await loader.load({
        datasetId:
          dataset.id,
      });
    },
    "RECORD_COUNT_MISMATCH",
  );

  const allowed =
    await loader.load({
      datasetId:
        dataset.id,

      validateRecordCount:
        false,
    });

  assert.equal(
    allowed.candles.length,
    3,
  );
}

async function testPartitionLoading(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:partition-load",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const partition =
    dataset.storage
      .partitions[1];

  assert.ok(partition);

  const loaded =
    await loader.loadPartition({
      datasetId:
        dataset.id,

      version:
        dataset.version,

      partitionId:
        partition.id,
    });

  assert.equal(
    loaded.partition.id,
    partition.id,
  );

  assert.deepEqual(
    loaded.candles.map(
      (candle) =>
        Number(
          candle.sequence,
        ),
    ),
    [2, 3],
  );

  assert.equal(
    Object.isFrozen(
      loaded.partition,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      loaded.partition.range,
    ),
    true,
  );
}

async function testPartitionRangeFiltering(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:partition-range",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const partition =
    dataset.storage
      .partitions[1];

  assert.ok(partition);

  const loaded =
    await loader.loadPartition({
      datasetId:
        dataset.id,

      partitionId:
        partition.id,

      range: {
        startTime:
          candles[3]!.openTime,

        endTime:
          candles[3]!.openTime,
      },
    });

  assert.deepEqual(
    loaded.candles.map(
      (candle) =>
        Number(
          candle.sequence,
        ),
    ),
    [3],
  );
}

async function testPartitionOutsideRequestedRange(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:partition-outside",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const partition =
    dataset.storage
      .partitions[0];

  assert.ok(partition);

  const loaded =
    await loader.loadPartition({
      datasetId:
        dataset.id,

      partitionId:
        partition.id,

      range: {
        startTime:
          historicalTimestamp(
            Number(
              partition.range.endTime,
            ) + 1_000_000,
          ),

        endTime:
          historicalTimestamp(
            Number(
              partition.range.endTime,
            ) + 2_000_000,
          ),
      },
    });

  assert.deepEqual(
    loaded.candles,
    [],
  );
}

async function testPartitionNotFound(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(2);

  const dataset =
    createDataset({
      id:
        "dataset:partition-missing",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  await assertRejectsLoaderError(
    async () => {
      await loader.loadPartition({
        datasetId:
          dataset.id,

        partitionId:
          historicalPartitionId(
            "partition:missing",
          ),
      });
    },
    "PARTITION_NOT_FOUND",
  );
}

async function testPartitionCountMismatch(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(4);

  const baseDataset =
    createDataset({
      id:
        "dataset:partition-count-mismatch",
      candles,
    });

  const firstPartition =
    baseDataset.storage
      .partitions[0];

  assert.ok(firstPartition);

  const invalidDataset = {
    ...baseDataset,

    storage: Object.freeze({
      ...baseDataset.storage,

      partitions:
        Object.freeze([
          Object.freeze({
            ...firstPartition,

            recordCount:
              historicalCount(99),
          }),

          ...baseDataset.storage
            .partitions.slice(1),
        ]),
    }),
  } satisfies HistoricalDataset;

  await persistDatasetAndRecords(
    repository,
    recordStore,
    invalidDataset,
    candles,
  );

  await assertRejectsLoaderError(
    async () => {
      await loader.loadPartition({
        datasetId:
          invalidDataset.id,

        partitionId:
          firstPartition.id,
      });
    },
    "RECORD_COUNT_MISMATCH",
  );
}

async function testCandleStreaming(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:candle-stream",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const streamed =
    await collectAsync(
      loader.stream({
        datasetId:
          dataset.id,
      }),
    );

  assert.deepEqual(
    streamed,
    candles,
  );

  assert.equal(
    Object.isFrozen(
      streamed[0],
    ),
    true,
  );
}

async function testRangeStreaming(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:range-stream",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const streamed =
    await collectAsync(
      loader.stream({
        datasetId:
          dataset.id,

        range: {
          startTime:
            candles[2]!.openTime,

          endTime:
            candles[4]!.openTime,
        },
      }),
    );

  assert.deepEqual(
    streamed.map(
      (candle) =>
        Number(
          candle.sequence,
        ),
    ),
    [2, 3, 4],
  );
}

async function testBatchStreaming(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(5);

  const dataset =
    createDataset({
      id:
        "dataset:batch-stream",
      version: 2,
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const batches =
    await collectAsync(
      loader.streamBatches({
        datasetId:
          dataset.id,

        batchSize:
          2,
      }),
    );

  assert.equal(
    batches.length,
    3,
  );

  assert.deepEqual(
    batches.map(
      (batch) =>
        batch.candles.length,
    ),
    [2, 2, 1],
  );

  assert.deepEqual(
    batches.map(
      (batch) =>
        batch.batchIndex,
    ),
    [0, 1, 2],
  );

  assert.deepEqual(
    batches.map(
      (batch) => [
        batch.firstRecordIndex,
        batch.lastRecordIndex,
      ],
    ),
    [
      [0, 1],
      [2, 3],
      [4, 4],
    ],
  );

  assert.equal(
    batches.every(
      (batch) =>
        Number(batch.version) === 2,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      batches[0],
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      batches[0]?.candles,
    ),
    true,
  );
}

async function testInvalidBatchSize(): Promise<void> {
  const {
    loader,
  } = createInfrastructure();

  for (const batchSize of [
    0,
    -1,
    1.5,
    Number.NaN,
  ]) {
    await assertRejectsLoaderError(
      async () => {
        await collectAsync(
          loader.streamBatches({
            datasetId:
              historicalDatasetId(
                "dataset:invalid-batch",
              ),

            batchSize,
          }),
        );
      },
      "INVALID_BATCH_SIZE",
    );
  }
}

async function testLoaderMissingRecordPayload(): Promise<void> {
  const {
    repository,
    loader,
  } = createInfrastructure();

  const dataset =
    createDataset({
      id:
        "dataset:no-record-payload",
      candles:
        createSequentialCandles(2),
    });

  await repository.save({
    dataset,
  });

  await assertRejectsLoaderError(
    async () => {
      await loader.load({
        datasetId:
          dataset.id,
      });
    },
    "RECORDS_NOT_FOUND",
  );
}

async function testRecordOutsideDatasetRange(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const declaredCandles =
    createSequentialCandles(2);

  const dataset =
    createDataset({
      id:
        "dataset:outside-range",
      candles:
        declaredCandles,
      declaredRecordCount:
        2,
    });

  const outsideRecords = [
    declaredCandles[0]!,

    createCandle({
      sequence: 1,

      openTime:
        Number(
          dataset.metadata.range.endTime,
        ) +
        60_000,
    }),
  ];

  await repository.save({
    dataset,
  });

  await recordStore.save({
    datasetId:
      dataset.id,

    version:
      dataset.version,

    candles:
      outsideRecords,
  });

  await assertRejectsLoaderError(
    async () => {
      await loader.load({
        datasetId:
          dataset.id,
      });
    },
    "INVALID_RECORD_DATASET",
  );
}

async function testLoadedReadIsolation(): Promise<void> {
  const {
    repository,
    recordStore,
    loader,
  } = createInfrastructure();

  const candles =
    createSequentialCandles(2);

  const dataset =
    createDataset({
      id:
        "dataset:read-isolation",
      candles,
    });

  await persistDatasetAndRecords(
    repository,
    recordStore,
    dataset,
    candles,
  );

  const first =
    await loader.load({
      datasetId:
        dataset.id,
    });

  const second =
    await loader.load({
      datasetId:
        dataset.id,
    });

  assert.deepEqual(
    first,
    second,
  );

  assert.notEqual(
    first,
    second,
  );

  assert.notEqual(
    first.candles,
    second.candles,
  );

  assert.notEqual(
    first.candles[0],
    second.candles[0],
  );

  assert.throws(() => {
    (
      first.candles as unknown as
        HistoricalCandle[]
    ).push(
      createCandle({
        sequence: 99,
        openTime: 99_000,
      }),
    );
  }, TypeError);
}

async function runHistoricalDatasetLoaderTests(): Promise<void> {
  console.log(
    "Running historical dataset loader tests...",
  );

  await testRecordStoreSaveAndRead();
  await testRecordStoreReplacement();
  await testRecordStoreRangeRead();
  await testRecordStoreStream();
  await testRecordStoreDeleteAndClear();
  await testRecordStoreMissingRecords();
  await testRecordStoreOrderingValidation();
  await testCanonicalStoreKey();

  await testLoadCompleteDataset();
  await testLoadLatestVersion();
  await testLoadSpecificVersion();
  await testDatasetNotFound();
  await testReadyStatusEnforcement();
  await testRangeFilteredLoad();
  await testInvalidLoadRange();
  await testRecordCountMismatch();

  await testPartitionLoading();
  await testPartitionRangeFiltering();
  await testPartitionOutsideRequestedRange();
  await testPartitionNotFound();
  await testPartitionCountMismatch();

  await testCandleStreaming();
  await testRangeStreaming();
  await testBatchStreaming();
  await testInvalidBatchSize();

  await testLoaderMissingRecordPayload();
  await testRecordOutsideDatasetRange();
  await testLoadedReadIsolation();

  console.log(
    "All historical dataset loader tests passed successfully.",
  );
}

void runHistoricalDatasetLoaderTests();