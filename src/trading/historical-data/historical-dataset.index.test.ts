import assert from "node:assert/strict";

import {
  createHistoricalDataset,
  transitionHistoricalDatasetStatus,
} from "./historical-dataset";

import {
  CreateHistoricalDatasetInput,
  HistoricalDataset,
  historicalCount,
  historicalDataSource,
  historicalDatasetId,
  historicalDatasetVersion,
  historicalMarketSymbol,
  historicalTimestamp,
} from "./historical-dataset.types";

import {
  HistoricalDatasetIndexError,
  InMemoryHistoricalDatasetIndex,
  createHistoricalDatasetIndexEntry,
  createHistoricalDatasetIndexEntryKey,
} from "./historical-dataset.index";

function createDatasetInput(
  options: Readonly<{
    id: string;
    version: number;
    source?: string;
    symbol?: string;
    timeframe?: "1m" | "5m" | "1h";
    startTime?: number;
    endTime?: number;
    createdAt?: number;
    recordCount?: number;
  }>,
): CreateHistoricalDatasetInput {
  const startTime =
    options.startTime ?? 1_704_067_200_000;

  const endTime =
    options.endTime ?? startTime + 59 * 60_000;

  return {
    id: historicalDatasetId(options.id),
    version: historicalDatasetVersion(
      options.version,
    ),

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
      options.createdAt ?? endTime + 1_000,
    ),

    encoding: "JSON_LINES",
    partitionStrategy: "BY_DAY",
  };
}

function createDataset(
  options: Parameters<typeof createDatasetInput>[0],
): HistoricalDataset {
  return createHistoricalDataset(
    createDatasetInput(options),
  );
}

function assertThrowsIndexError(
  operation: () => unknown,
  expectedCode: HistoricalDatasetIndexError["code"],
): void {
  assert.throws(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof HistoricalDatasetIndexError,
        "Expected HistoricalDatasetIndexError.",
      );

      assert.equal(error.code, expectedCode);

      return true;
    },
  );
}

function testEntryCreation(): void {
  const dataset = createDataset({
    id: "dataset:index-entry",
    version: 2,
  });

  const entry =
    createHistoricalDatasetIndexEntry(dataset);

  assert.equal(
    entry.key,
    "dataset:index-entry::v2",
  );

  assert.equal(entry.datasetId, dataset.id);
  assert.equal(entry.version, dataset.version);
  assert.equal(
    entry.source,
    dataset.metadata.source,
  );

  assert.equal(
    entry.marketType,
    dataset.metadata.marketType,
  );

  assert.equal(
    entry.symbol,
    dataset.metadata.symbol,
  );

  assert.equal(
    entry.timeframe,
    dataset.metadata.timeframe,
  );

  assert.equal(entry.status, dataset.status);

  assert.equal(
    entry.startTime,
    dataset.metadata.range.startTime,
  );

  assert.equal(
    entry.endTime,
    dataset.metadata.range.endTime,
  );

  assert.equal(
    Object.isFrozen(entry),
    true,
  );

  assert.equal(
    createHistoricalDatasetIndexEntryKey(
      dataset.id,
      dataset.version,
    ),
    entry.key,
  );
}

function testAddFindAndHas(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const dataset = createDataset({
    id: "dataset:add-find",
    version: 1,
  });

  index.add(dataset);

  assert.equal(index.count(), 1);

  assert.equal(
    index.has({
      datasetId: dataset.id,
      version: dataset.version,
    }),
    true,
  );

  const found = index.find({
    datasetId: dataset.id,
    version: dataset.version,
  });

  assert.ok(found);
  assert.equal(found.datasetId, dataset.id);
  assert.equal(found.version, dataset.version);
  assert.equal(found.status, "CREATED");

  assert.equal(Object.isFrozen(found), true);

  const missing = index.find({
    datasetId: historicalDatasetId(
      "dataset:missing",
    ),
    version: historicalDatasetVersion(1),
  });

  assert.equal(missing, undefined);
}

function testDuplicateProtection(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const dataset = createDataset({
    id: "dataset:duplicate",
    version: 1,
  });

  index.add(dataset);

  assertThrowsIndexError(
    () => {
      index.add(dataset);
    },
    "ENTRY_ALREADY_EXISTS",
  );

  assert.equal(index.count(), 1);
}

function testReplacement(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const created = createDataset({
    id: "dataset:replace",
    version: 1,
  });

  index.add(created);

  const importing =
    transitionHistoricalDatasetStatus({
      dataset: created,
      nextStatus: "IMPORTING",
      updatedAt: historicalTimestamp(
        Number(created.metadata.updatedAt) + 1,
      ),
    });

  index.replace(importing);

  assert.equal(index.count(), 1);

  const found = index.find({
    datasetId: importing.id,
    version: importing.version,
  });

  assert.ok(found);
  assert.equal(found.status, "IMPORTING");
  assert.equal(
    found.updatedAt,
    importing.metadata.updatedAt,
  );

  const createdResults = index.query({
    statuses: ["CREATED"],
  });

  assert.equal(createdResults.total, 0);

  const importingResults = index.query({
    statuses: ["IMPORTING"],
  });

  assert.equal(importingResults.total, 1);
}

function testSecondaryIndexQueries(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const bitcoin = createDataset({
    id: "dataset:btc",
    version: 1,
    source: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
  });

  const ethereum = createDataset({
    id: "dataset:eth",
    version: 2,
    source: "okx",
    symbol: "ETHUSDT",
    timeframe: "5m",
    createdAt: 1_704_071_100_000,
  });

  const solana = createDataset({
    id: "dataset:sol",
    version: 3,
    source: "bybit",
    symbol: "SOLUSDT",
    timeframe: "1h",
    createdAt: 1_704_071_200_000,
  });

  index.add(bitcoin);
  index.add(ethereum);
  index.add(solana);

  const sourceResults = index.query({
    sources: [
      historicalDataSource("okx"),
    ],
  });

  assert.equal(sourceResults.total, 1);
  assert.equal(
    sourceResults.items[0]?.datasetId,
    ethereum.id,
  );

  const symbolResults = index.query({
    symbols: [
      historicalMarketSymbol("SOLUSDT"),
    ],
  });

  assert.equal(symbolResults.total, 1);
  assert.equal(
    symbolResults.items[0]?.datasetId,
    solana.id,
  );

  const timeframeResults = index.query({
    timeframes: ["1m", "5m"],
  });

  assert.equal(timeframeResults.total, 2);

  assert.deepEqual(
    timeframeResults.items.map(
      (entry) => String(entry.datasetId),
    ),
    [
      "dataset:btc",
      "dataset:eth",
    ],
  );

  const versionResults = index.query({
    versions: [
      historicalDatasetVersion(2),
      historicalDatasetVersion(3),
    ],
  });

  assert.equal(versionResults.total, 2);

  const marketResults = index.query({
    marketTypes: ["SPOT"],
  });

  assert.equal(marketResults.total, 3);
}

function testCombinedQueries(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const matching = createDataset({
    id: "dataset:combined:matching",
    version: 1,
    source: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
  });

  const wrongSymbol = createDataset({
    id: "dataset:combined:symbol",
    version: 1,
    source: "binance",
    symbol: "ETHUSDT",
    timeframe: "1m",
  });

  const wrongSource = createDataset({
    id: "dataset:combined:source",
    version: 1,
    source: "okx",
    symbol: "BTCUSDT",
    timeframe: "1m",
  });

  index.add(matching);
  index.add(wrongSymbol);
  index.add(wrongSource);

  const results = index.query({
    sources: [
      historicalDataSource("binance"),
    ],

    symbols: [
      historicalMarketSymbol("BTCUSDT"),
    ],

    timeframes: ["1m"],
    statuses: ["CREATED"],
  });

  assert.equal(results.total, 1);
  assert.equal(
    results.items[0]?.datasetId,
    matching.id,
  );
}

function testRangeQueries(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const first = createDataset({
    id: "dataset:range:first",
    version: 1,
    startTime: 1_000,
    endTime: 1_999,
    createdAt: 5_000,
  });

  const second = createDataset({
    id: "dataset:range:second",
    version: 1,
    startTime: 2_000,
    endTime: 2_999,
    createdAt: 5_001,
  });

  const third = createDataset({
    id: "dataset:range:third",
    version: 1,
    startTime: 3_000,
    endTime: 3_999,
    createdAt: 5_002,
  });

  index.add(first);
  index.add(second);
  index.add(third);

  const overlapBoundary = index.query({
    overlappingRange: {
      startTime: historicalTimestamp(1_999),
      endTime: historicalTimestamp(2_000),
    },
  });

  assert.equal(overlapBoundary.total, 2);

  assert.deepEqual(
    overlapBoundary.items.map(
      (entry) => String(entry.datasetId),
    ),
    [
      "dataset:range:first",
      "dataset:range:second",
    ],
  );

  const middleOnly = index.query({
    overlappingRange: {
      startTime: historicalTimestamp(2_100),
      endTime: historicalTimestamp(2_200),
    },
  });

  assert.equal(middleOnly.total, 1);
  assert.equal(
    middleOnly.items[0]?.datasetId,
    second.id,
  );

  const noOverlap = index.query({
    overlappingRange: {
      startTime: historicalTimestamp(10_000),
      endTime: historicalTimestamp(11_000),
    },
  });

  assert.equal(noOverlap.total, 0);
}

function testDeterministicSorting(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const entries = [
    createDataset({
      id: "dataset:sort:c",
      version: 3,
      startTime: 3_000,
      endTime: 3_999,
      createdAt: 30_000,
    }),

    createDataset({
      id: "dataset:sort:a",
      version: 1,
      startTime: 1_000,
      endTime: 1_999,
      createdAt: 10_000,
    }),

    createDataset({
      id: "dataset:sort:b",
      version: 2,
      startTime: 2_000,
      endTime: 2_999,
      createdAt: 20_000,
    }),
  ];

  for (const dataset of entries) {
    index.add(dataset);
  }

  const byVersionDescending = index.query({
    sort: [
      {
        field: "VERSION",
        direction: "DESC",
      },
    ],
  });

  assert.deepEqual(
    byVersionDescending.items.map(
      (entry) => Number(entry.version),
    ),
    [3, 2, 1],
  );

  const byStartAscending = index.query({
    sort: [
      {
        field: "START_TIME",
        direction: "ASC",
      },
    ],
  });

  assert.deepEqual(
    byStartAscending.items.map(
      (entry) => Number(entry.startTime),
    ),
    [1_000, 2_000, 3_000],
  );

  const byCreatedDescending = index.query({
    sort: [
      {
        field: "CREATED_AT",
        direction: "DESC",
      },
    ],
  });

  assert.deepEqual(
    byCreatedDescending.items.map(
      (entry) => String(entry.datasetId),
    ),
    [
      "dataset:sort:c",
      "dataset:sort:b",
      "dataset:sort:a",
    ],
  );
}

function testStableTieBreaking(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const commonCreatedAt = 10_000;

  const second = createDataset({
    id: "dataset:tie:b",
    version: 1,
    createdAt: commonCreatedAt,
  });

  const first = createDataset({
    id: "dataset:tie:a",
    version: 1,
    createdAt: commonCreatedAt,
  });

  index.add(second);
  index.add(first);

  const result = index.query({
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
  });

  assert.deepEqual(
    result.items.map(
      (entry) => String(entry.datasetId),
    ),
    [
      "dataset:tie:a",
      "dataset:tie:b",
    ],
  );
}

function testPagination(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  for (let value = 1; value <= 5; value += 1) {
    index.add(
      createDataset({
        id: `dataset:page:${value}`,
        version: 1,
        createdAt: value * 1_000,
      }),
    );
  }

  const firstPage = index.query({
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
    limit: 2,
    offset: 0,
  });

  assert.equal(firstPage.total, 5);
  assert.equal(firstPage.limit, 2);
  assert.equal(firstPage.offset, 0);
  assert.equal(firstPage.hasMore, true);

  assert.deepEqual(
    firstPage.items.map(
      (entry) => String(entry.datasetId),
    ),
    [
      "dataset:page:1",
      "dataset:page:2",
    ],
  );

  const secondPage = index.query({
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
    limit: 2,
    offset: 2,
  });

  assert.equal(secondPage.total, 5);
  assert.equal(secondPage.hasMore, true);

  assert.deepEqual(
    secondPage.items.map(
      (entry) => String(entry.datasetId),
    ),
    [
      "dataset:page:3",
      "dataset:page:4",
    ],
  );

  const finalPage = index.query({
    sort: [
      {
        field: "CREATED_AT",
        direction: "ASC",
      },
    ],
    limit: 2,
    offset: 4,
  });

  assert.equal(finalPage.items.length, 1);
  assert.equal(finalPage.hasMore, false);
  assert.equal(
    finalPage.items[0]?.datasetId,
    historicalDatasetId("dataset:page:5"),
  );
}

function testRemoval(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const dataset = createDataset({
    id: "dataset:remove",
    version: 1,
    source: "binance",
    symbol: "BTCUSDT",
  });

  index.add(dataset);

  const removed = index.remove({
    datasetId: dataset.id,
    version: dataset.version,
  });

  assert.ok(removed);
  assert.equal(removed.datasetId, dataset.id);
  assert.equal(index.count(), 0);

  assert.equal(
    index.has({
      datasetId: dataset.id,
      version: dataset.version,
    }),
    false,
  );

  const sourceResults = index.query({
    sources: [
      historicalDataSource("binance"),
    ],
  });

  assert.equal(sourceResults.total, 0);

  const missingRemoval = index.remove({
    datasetId: dataset.id,
    version: dataset.version,
  });

  assert.equal(missingRemoval, undefined);
}

function testClear(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  index.add(
    createDataset({
      id: "dataset:clear:1",
      version: 1,
    }),
  );

  index.add(
    createDataset({
      id: "dataset:clear:2",
      version: 1,
    }),
  );

  assert.equal(index.count(), 2);

  index.clear();

  assert.equal(index.count(), 0);
  assert.equal(index.query().total, 0);
}

function testReadIsolation(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  const dataset = createDataset({
    id: "dataset:isolation",
    version: 1,
  });

  index.add(dataset);

  const firstRead = index.find({
    datasetId: dataset.id,
    version: dataset.version,
  });

  const secondRead = index.find({
    datasetId: dataset.id,
    version: dataset.version,
  });

  assert.ok(firstRead);
  assert.ok(secondRead);

  assert.deepEqual(firstRead, secondRead);
  assert.notEqual(firstRead, secondRead);

  assert.equal(Object.isFrozen(firstRead), true);

  assert.throws(() => {
    (
      firstRead as unknown as {
        status: string;
      }
    ).status = "ARCHIVED";
  }, TypeError);

  const thirdRead = index.find({
    datasetId: dataset.id,
    version: dataset.version,
  });

  assert.ok(thirdRead);
  assert.equal(thirdRead.status, "CREATED");
}

function testInvalidSourceDataset(): void {
  const validDataset = createDataset({
    id: "dataset:invalid-source",
    version: 1,
  });

  const invalidDataset = {
    ...validDataset,
    metadata: {
      ...validDataset.metadata,
      datasetId: historicalDatasetId(
        "dataset:different",
      ),
    },
  } satisfies HistoricalDataset;

  const index =
    new InMemoryHistoricalDatasetIndex();

  assertThrowsIndexError(
    () => {
      index.add(invalidDataset);
    },
    "INVALID_ENTRY",
  );
}

function testQueryValidation(): void {
  const index =
    new InMemoryHistoricalDatasetIndex();

  assertThrowsIndexError(
    () => {
      index.query({
        limit: 0,
      });
    },
    "INVALID_QUERY",
  );

  assertThrowsIndexError(
    () => {
      index.query({
        offset: -1,
      });
    },
    "INVALID_QUERY",
  );

  assertThrowsIndexError(
    () => {
      index.query({
        symbols: [],
      });
    },
    "INVALID_QUERY",
  );

  assertThrowsIndexError(
    () => {
      index.query({
        overlappingRange: {
          startTime: historicalTimestamp(2_000),
          endTime: historicalTimestamp(1_000),
        },
      });
    },
    "INVALID_QUERY",
  );

  assertThrowsIndexError(
    () => {
      index.query({
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

function runHistoricalDatasetIndexTests(): void {
  console.log(
    "Running historical dataset index tests...",
  );

  testEntryCreation();
  testAddFindAndHas();
  testDuplicateProtection();
  testReplacement();
  testSecondaryIndexQueries();
  testCombinedQueries();
  testRangeQueries();
  testDeterministicSorting();
  testStableTieBreaking();
  testPagination();
  testRemoval();
  testClear();
  testReadIsolation();
  testInvalidSourceDataset();
  testQueryValidation();

  console.log(
    "All historical dataset index tests passed successfully.",
  );
}

runHistoricalDatasetIndexTests();