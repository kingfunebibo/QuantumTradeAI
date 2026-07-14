import assert from "node:assert/strict";

import {
  createHistoricalDataset,
  transitionHistoricalDatasetStatus,
} from "./historical-dataset";

import {
  CreateHistoricalDatasetInput,
  HistoricalDataset,
  HistoricalDatasetId,
  HistoricalDatasetVersion,
  historicalCount,
  historicalDataSource,
  historicalDatasetId,
  historicalDatasetVersion,
  historicalMarketSymbol,
  historicalTimestamp,
} from "./historical-dataset.types";

import {
  HistoricalDatasetRepositoryError,
} from "./historical-dataset.repository";

import {
  InMemoryHistoricalDatasetRepository,
} from "./in-memory-historical-dataset.repository";

function createDatasetInput(
  options: Readonly<{
    id: string;
    version: number;
    source?: string;
    symbol?: string;
    timeframe?: "1m" | "5m" | "1h";
    startTime?: number;
    endTime?: number;
    recordCount?: number;
    createdAt?: number;
  }>,
): CreateHistoricalDatasetInput {
  const startTime =
    options.startTime ?? 1_704_067_200_000;

  const endTime =
    options.endTime ?? startTime + 59 * 60_000;

  return {
    id: historicalDatasetId(options.id),
    version: historicalDatasetVersion(options.version),

    source: historicalDataSource(
      options.source ?? "binance",
    ),

    origin: "EXCHANGE_API",
    marketType: "SPOT",

    symbol: historicalMarketSymbol(
      options.symbol ?? "BTCUSDT",
    ),

    timeframe: options.timeframe ?? "1m",

    range: {
      startTime: historicalTimestamp(startTime),
      endTime: historicalTimestamp(endTime),
    },

    recordCount: historicalCount(
      options.recordCount ?? 60,
    ),

    createdAt: historicalTimestamp(
      options.createdAt ??
        endTime + 1_000,
    ),

    encoding: "JSON_LINES",
    partitionStrategy: "BY_DAY",

    description: `${options.id} version ${options.version}`,
  };
}

function createDataset(
  options: Parameters<typeof createDatasetInput>[0],
): HistoricalDataset {
  return createHistoricalDataset(
    createDatasetInput(options),
  );
}

async function assertRejectsRepositoryError(
  operation: () => Promise<unknown>,
  expectedCode: HistoricalDatasetRepositoryError["code"],
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof HistoricalDatasetRepositoryError,
        "Expected HistoricalDatasetRepositoryError.",
      );

      assert.equal(error.code, expectedCode);

      return true;
    },
  );
}

async function testSaveAndFindById(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const dataset = createDataset({
    id: "dataset:binance:BTCUSDT:1m",
    version: 1,
  });

  const result = await repository.save({
    dataset,
  });

  assert.equal(result.created, true);
  assert.deepEqual(result.dataset, dataset);
  assert.notEqual(result.dataset, dataset);

  assert.equal(await repository.count(), 1);

  const found = await repository.findById({
    id: dataset.id,
    version: dataset.version,
  });

  assert.ok(found);
  assert.deepEqual(found, dataset);
  assert.notEqual(found, dataset);

  assert.equal(Object.isFrozen(found), true);
  assert.equal(Object.isFrozen(found.metadata), true);
  assert.equal(Object.isFrozen(found.storage), true);

  const missing = await repository.findById({
    id: historicalDatasetId("missing"),
  });

  assert.equal(missing, undefined);
}

async function testReplacement(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const original = createDataset({
    id: "dataset:replacement",
    version: 1,
  });

  await repository.save({
    dataset: original,
  });

  const importing =
    transitionHistoricalDatasetStatus({
      dataset: original,
      nextStatus: "IMPORTING",
      updatedAt: historicalTimestamp(
        Number(original.metadata.updatedAt) + 1,
      ),
    });

  const result = await repository.save({
    dataset: importing,
  });

  assert.equal(result.created, false);
  assert.equal(result.dataset.status, "IMPORTING");
  assert.equal(await repository.count(), 1);

  const found = await repository.findById({
    id: original.id,
    version: original.version,
  });

  assert.ok(found);
  assert.equal(found.status, "IMPORTING");
}

async function testVersionManagement(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const id = "dataset:versions";

  const versionOne = createDataset({
    id,
    version: 1,
  });

  const versionThree = createDataset({
    id,
    version: 3,
    createdAt: 1_704_071_200_000,
  });

  const versionTwo = createDataset({
    id,
    version: 2,
    createdAt: 1_704_071_100_000,
  });

  await repository.save({ dataset: versionOne });
  await repository.save({ dataset: versionThree });
  await repository.save({ dataset: versionTwo });

  assert.equal(await repository.count(), 3);

  const latest = await repository.findById({
    id: versionOne.id,
  });

  assert.ok(latest);
  assert.equal(latest.version, 3);

  const versions = await repository.findVersions({
    id: versionOne.id,
  });

  assert.deepEqual(
    versions.versions.map(Number),
    [1, 2, 3],
  );

  assert.deepEqual(
    versions.datasets.map((dataset) =>
      Number(dataset.version),
    ),
    [1, 2, 3],
  );

  assert.equal(
    Object.isFrozen(versions.versions),
    true,
  );

  assert.equal(
    Object.isFrozen(versions.datasets),
    true,
  );
}

async function testLogicalIndexLookup(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const versionOne = createDataset({
    id: "dataset:index:v1",
    version: 1,
    source: "BINANCE",
    symbol: "BTC/USDT",
    timeframe: "1m",
  });

  const versionTwo = createDataset({
    id: "dataset:index:v2",
    version: 2,
    source: "BINANCE",
    symbol: "BTC-USDT",
    timeframe: "1m",
    createdAt: 1_704_071_200_000,
  });

  const differentTimeframe = createDataset({
    id: "dataset:index:5m",
    version: 5,
    source: "BINANCE",
    symbol: "BTCUSDT",
    timeframe: "5m",
  });

  await repository.save({ dataset: versionOne });
  await repository.save({ dataset: versionTwo });
  await repository.save({
    dataset: differentTimeframe,
  });

  const latest = await repository.findByIndex({
    key: {
      source: historicalDataSource("binance"),
      marketType: "SPOT",
      symbol: historicalMarketSymbol("BTCUSDT"),
      timeframe: "1m",
    },
  });

  assert.ok(latest);
  assert.equal(latest.version, 2);

  const exactVersion = await repository.findByIndex({
    key: {
      source: historicalDataSource("binance"),
      marketType: "SPOT",
      symbol: historicalMarketSymbol("BTCUSDT"),
      timeframe: "1m",
      version: historicalDatasetVersion(1),
    },
  });

  assert.ok(exactVersion);
  assert.equal(exactVersion.version, 1);

  const missing = await repository.findByIndex({
    key: {
      source: historicalDataSource("okx"),
      marketType: "SPOT",
      symbol: historicalMarketSymbol("BTCUSDT"),
      timeframe: "1m",
    },
  });

  assert.equal(missing, undefined);
}

async function testQueryFiltering(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const bitcoinOneMinute = createDataset({
    id: "dataset:btc:1m",
    version: 1,
    source: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
    startTime: 1_704_067_200_000,
    endTime: 1_704_070_740_000,
  });

  const ethereumFiveMinute = createDataset({
    id: "dataset:eth:5m",
    version: 1,
    source: "okx",
    symbol: "ETHUSDT",
    timeframe: "5m",
    startTime: 1_704_153_600_000,
    endTime: 1_704_157_200_000,
  });

  const solanaHourly = createDataset({
    id: "dataset:sol:1h",
    version: 2,
    source: "bybit",
    symbol: "SOLUSDT",
    timeframe: "1h",
    startTime: 1_704_240_000_000,
    endTime: 1_704_326_400_000,
  });

  const importingEthereum =
    transitionHistoricalDatasetStatus({
      dataset: ethereumFiveMinute,
      nextStatus: "IMPORTING",
      updatedAt: historicalTimestamp(
        Number(
          ethereumFiveMinute.metadata.updatedAt,
        ) + 1,
      ),
    });

  await repository.save({
    dataset: bitcoinOneMinute,
  });

  await repository.save({
    dataset: importingEthereum,
  });

  await repository.save({
    dataset: solanaHourly,
  });

  const bySource = await repository.query({
    query: {
      sources: [
        historicalDataSource("binance"),
      ],
    },
  });

  assert.equal(bySource.total, 1);
  assert.equal(
    bySource.items[0]?.metadata.symbol,
    "BTCUSDT",
  );

  const byStatus = await repository.query({
    query: {
      statuses: ["IMPORTING"],
    },
  });

  assert.equal(byStatus.total, 1);
  assert.equal(
    byStatus.items[0]?.metadata.symbol,
    "ETHUSDT",
  );

  const byTimeframe = await repository.query({
    query: {
      timeframes: ["1h"],
    },
  });

  assert.equal(byTimeframe.total, 1);
  assert.equal(
    byTimeframe.items[0]?.metadata.symbol,
    "SOLUSDT",
  );

  const overlapping = await repository.query({
    query: {
      overlappingRange: {
        startTime: historicalTimestamp(
          1_704_070_700_000,
        ),
        endTime: historicalTimestamp(
          1_704_070_800_000,
        ),
      },
    },
  });

  assert.equal(overlapping.total, 1);
  assert.equal(
    overlapping.items[0]?.id,
    bitcoinOneMinute.id,
  );

  const versionTwo = await repository.query({
    query: {
      version: historicalDatasetVersion(2),
    },
  });

  assert.equal(versionTwo.total, 1);
  assert.equal(
    versionTwo.items[0]?.id,
    solanaHourly.id,
  );
}

async function testDeterministicSorting(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const datasets = [
    createDataset({
      id: "dataset:sort:c",
      version: 1,
      createdAt: 3_000,
      recordCount: 30,
    }),

    createDataset({
      id: "dataset:sort:a",
      version: 2,
      createdAt: 1_000,
      recordCount: 10,
    }),

    createDataset({
      id: "dataset:sort:b",
      version: 3,
      createdAt: 2_000,
      recordCount: 20,
    }),
  ];

  for (const dataset of datasets) {
    await repository.save({ dataset });
  }

  const createdAscending =
    await repository.query({
      sort: [
        {
          field: "CREATED_AT",
          direction: "ASC",
        },
      ],
    });

  assert.deepEqual(
    createdAscending.items.map((dataset) =>
      String(dataset.id),
    ),
    [
      "dataset:sort:a",
      "dataset:sort:b",
      "dataset:sort:c",
    ],
  );

  const recordsDescending =
    await repository.query({
      sort: [
        {
          field: "RECORD_COUNT",
          direction: "DESC",
        },
      ],
    });

  assert.deepEqual(
    recordsDescending.items.map(
      (dataset) =>
        Number(dataset.metadata.recordCount),
    ),
    [30, 20, 10],
  );

  const versionsDescending =
    await repository.query({
      sort: [
        {
          field: "VERSION",
          direction: "DESC",
        },
      ],
    });

  assert.deepEqual(
    versionsDescending.items.map((dataset) =>
      Number(dataset.version),
    ),
    [3, 2, 1],
  );
}

async function testPagination(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  for (let index = 1; index <= 5; index += 1) {
    await repository.save({
      dataset: createDataset({
        id: `dataset:page:${index}`,
        version: 1,
        createdAt: index * 1_000,
      }),
    });
  }

  const firstPage = await repository.query({
    query: {
      limit: 2,
      offset: 0,
    },
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
  });

  assert.equal(firstPage.total, 5);
  assert.equal(firstPage.limit, 2);
  assert.equal(firstPage.offset, 0);
  assert.equal(firstPage.hasMore, true);

  assert.deepEqual(
    firstPage.items.map((dataset) =>
      String(dataset.id),
    ),
    [
      "dataset:page:1",
      "dataset:page:2",
    ],
  );

  const secondPage = await repository.query({
    query: {
      limit: 2,
      offset: 2,
    },
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
  });

  assert.equal(secondPage.total, 5);
  assert.equal(secondPage.hasMore, true);

  assert.deepEqual(
    secondPage.items.map((dataset) =>
      String(dataset.id),
    ),
    [
      "dataset:page:3",
      "dataset:page:4",
    ],
  );

  const finalPage = await repository.query({
    query: {
      limit: 2,
      offset: 4,
    },
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
  });

  assert.equal(finalPage.items.length, 1);
  assert.equal(finalPage.hasMore, false);

  assert.equal(
    finalPage.items[0]?.id,
    historicalDatasetId("dataset:page:5"),
  );
}

async function testExistsAndDelete(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const versionOne = createDataset({
    id: "dataset:delete",
    version: 1,
  });

  const versionTwo = createDataset({
    id: "dataset:delete",
    version: 2,
  });

  await repository.save({ dataset: versionOne });
  await repository.save({ dataset: versionTwo });

  assert.equal(
    await repository.exists({
      id: versionOne.id,
    }),
    true,
  );

  assert.equal(
    await repository.exists({
      id: versionOne.id,
      version: versionOne.version,
    }),
    true,
  );

  const deleted = await repository.delete({
    id: versionOne.id,
    version: versionOne.version,
  });

  assert.equal(deleted.deleted, true);
  assert.ok(deleted.dataset);
  assert.equal(deleted.dataset.version, 1);

  assert.equal(
    await repository.exists({
      id: versionOne.id,
      version: versionOne.version,
    }),
    false,
  );

  assert.equal(
    await repository.exists({
      id: versionTwo.id,
    }),
    true,
  );

  const missingDelete = await repository.delete({
    id: versionOne.id,
    version: historicalDatasetVersion(99),
  });

  assert.equal(missingDelete.deleted, false);
  assert.equal(missingDelete.dataset, undefined);

  const versions = await repository.findVersions({
    id: versionOne.id,
  });

  assert.deepEqual(
    versions.versions.map(Number),
    [2],
  );
}

async function testOptimisticConcurrency(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const dataset = createDataset({
    id: "dataset:concurrency",
    version: 1,
  });

  await repository.save({
    dataset,
  });

  const importing =
    transitionHistoricalDatasetStatus({
      dataset,
      nextStatus: "IMPORTING",
      updatedAt: historicalTimestamp(
        Number(dataset.metadata.updatedAt) + 1,
      ),
    });

  const successfulUpdate =
    await repository.save({
      dataset: importing,
      expectedVersion:
        historicalDatasetVersion(1),
    });

  assert.equal(successfulUpdate.created, false);
  assert.equal(
    successfulUpdate.dataset.status,
    "IMPORTING",
  );

  await assertRejectsRepositoryError(
    async () => {
      await repository.save({
        dataset: importing,
        expectedVersion:
          historicalDatasetVersion(2),
      });
    },
    "DATASET_VERSION_CONFLICT",
  );

  const missingRevision = createDataset({
    id: "dataset:missing-concurrency",
    version: 1,
  });

  await assertRejectsRepositoryError(
    async () => {
      await repository.save({
        dataset: missingRevision,
        expectedVersion:
          historicalDatasetVersion(1),
      });
    },
    "DATASET_VERSION_CONFLICT",
  );
}

async function testQueryValidation(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  await assertRejectsRepositoryError(
    async () => {
      await repository.query({
        query: {
          limit: 0,
        },
      });
    },
    "INVALID_PAGINATION",
  );

  await assertRejectsRepositoryError(
    async () => {
      await repository.query({
        query: {
          offset: -1,
        },
      });
    },
    "INVALID_PAGINATION",
  );

  await assertRejectsRepositoryError(
    async () => {
      await repository.query({
        query: {
          symbols: [],
        },
      });
    },
    "INVALID_QUERY",
  );

  await assertRejectsRepositoryError(
    async () => {
      await repository.query({
        sort: [
          {
            field: "VERSION",
            direction: "ASC",
          },
          {
            field: "VERSION",
            direction: "DESC",
          },
        ],
      });
    },
    "INVALID_QUERY",
  );
}

async function testClear(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const dataset = createDataset({
    id: "dataset:clear",
    version: 1,
  });

  await repository.save({ dataset });

  assert.equal(await repository.count(), 1);

  await repository.clear();

  assert.equal(await repository.count(), 0);

  assert.equal(
    await repository.exists({
      id: dataset.id,
    }),
    false,
  );

  const versions = await repository.findVersions({
    id: dataset.id,
  });

  assert.deepEqual(versions.versions, []);
  assert.deepEqual(versions.datasets, []);
}

async function testReadIsolation(): Promise<void> {
  const repository =
    new InMemoryHistoricalDatasetRepository();

  const dataset = createDataset({
    id: "dataset:isolation",
    version: 1,
  });

  await repository.save({ dataset });

  const firstRead = await repository.findById({
    id: dataset.id,
  });

  const secondRead = await repository.findById({
    id: dataset.id,
  });

  assert.ok(firstRead);
  assert.ok(secondRead);

  assert.deepEqual(firstRead, secondRead);
  assert.notEqual(firstRead, secondRead);
  assert.notEqual(
    firstRead.metadata,
    secondRead.metadata,
  );

  assert.throws(() => {
    (
      firstRead as unknown as {
        status: string;
      }
    ).status = "ARCHIVED";
  }, TypeError);

  const thirdRead = await repository.findById({
    id: dataset.id,
  });

  assert.ok(thirdRead);
  assert.equal(thirdRead.status, "CREATED");
}

async function runRepositoryTests(): Promise<void> {
  console.log(
    "Running in-memory historical dataset repository tests...",
  );

  await testSaveAndFindById();
  await testReplacement();
  await testVersionManagement();
  await testLogicalIndexLookup();
  await testQueryFiltering();
  await testDeterministicSorting();
  await testPagination();
  await testExistsAndDelete();
  await testOptimisticConcurrency();
  await testQueryValidation();
  await testClear();
  await testReadIsolation();

  console.log(
    "All in-memory historical dataset repository tests passed successfully.",
  );
}

void runRepositoryTests();