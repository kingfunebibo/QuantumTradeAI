import assert from "node:assert/strict";

import {
  HistoricalCandle,
  historicalDatasetId,
  historicalPrice,
  historicalSequence,
  historicalTimestamp,
  historicalVolume,
} from "./historical-dataset.types";

import {
  DeterministicHistoricalDatasetChecksumService,
} from "./historical-dataset.checksum";

import {
  createHistoricalDatasetPartitionId,
  DeterministicHistoricalDatasetPartitioner,
  HistoricalDatasetPartitioningError,
} from "./historical-dataset.partitioning";

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

    isClosed: true,
  });
}

function createSequentialCandles(
  count: number,
  startTime = 1_704_067_200_000,
  intervalMilliseconds = 60_000,
): readonly HistoricalCandle[] {
  return Object.freeze(
    Array.from(
      { length: count },
      (_, index) =>
        createCandle({
          sequence: index,
          openTime:
            startTime +
            index * intervalMilliseconds,
          duration: intervalMilliseconds,
          open: 100 + index,
          high: 110 + index,
          low: 90 + index,
          close: 105 + index,
          volume: 10 + index,
        }),
    ),
  );
}

function assertThrowsPartitioningError(
  operation: () => unknown,
  expectedCode:
    HistoricalDatasetPartitioningError["code"],
): void {
  assert.throws(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof
          HistoricalDatasetPartitioningError,
        "Expected HistoricalDatasetPartitioningError.",
      );

      assert.equal(
        error.code,
        expectedCode,
      );

      return true;
    },
  );
}

function testNonePartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:none",
  );

  const candles =
    createSequentialCandles(5);

  const result = partitioner.partition({
    datasetId,
    candles,
    strategy: "NONE",
  });

  assert.equal(
    result.datasetId,
    datasetId,
  );

  assert.equal(
    result.strategy,
    "NONE",
  );

  assert.equal(
    result.partitionCount,
    1,
  );

  assert.equal(
    result.recordCount,
    5,
  );

  assert.equal(
    result.partitions.length,
    1,
  );

  const materialized =
    result.partitions[0];

  assert.ok(materialized);

  assert.equal(
    materialized.partition.ordinal,
    0,
  );

  assert.equal(
    materialized.partition.strategy,
    "NONE",
  );

  assert.equal(
    materialized.partition.recordCount,
    5,
  );

  assert.equal(
    materialized.partition.firstSequence,
    0,
  );

  assert.equal(
    materialized.partition.lastSequence,
    4,
  );

  assert.equal(
    materialized.partition.range.startTime,
    candles[0]!.openTime,
  );

  assert.equal(
    materialized.partition.range.endTime,
    candles[4]!.closeTime,
  );

  assert.deepEqual(
    materialized.candles,
    candles,
  );
}

function testRecordCountPartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:record-count",
  );

  const candles =
    createSequentialCandles(10);

  const result = partitioner.partition({
    datasetId,
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 3,
  });

  assert.equal(
    result.partitionCount,
    4,
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.recordCount,
        ),
    ),
    [3, 3, 3, 1],
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.firstSequence,
        ),
    ),
    [0, 3, 6, 9],
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.lastSequence,
        ),
    ),
    [2, 5, 8, 9],
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) => entry.partition.ordinal,
    ),
    [0, 1, 2, 3],
  );

  assert.deepEqual(
    result.partitions.flatMap(
      (entry) => entry.candles,
    ),
    candles,
  );
}

function testRecordCountLargerThanDataset(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles =
    createSequentialCandles(4);

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:large-limit",
    ),
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 100,
  });

  assert.equal(
    result.partitionCount,
    1,
  );

  assert.equal(
    result.partitions[0]?.partition
      .recordCount,
    4,
  );
}

function testDailyPartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:daily",
  );

  const candles = Object.freeze([
    createCandle({
      sequence: 0,
      openTime: Date.UTC(
        2024,
        0,
        1,
        23,
        58,
      ),
    }),

    createCandle({
      sequence: 1,
      openTime: Date.UTC(
        2024,
        0,
        1,
        23,
        59,
      ),
    }),

    createCandle({
      sequence: 2,
      openTime: Date.UTC(
        2024,
        0,
        2,
        0,
        0,
      ),
    }),

    createCandle({
      sequence: 3,
      openTime: Date.UTC(
        2024,
        0,
        2,
        0,
        1,
      ),
    }),
  ]);

  const result = partitioner.partition({
    datasetId,
    candles,
    strategy: "BY_DAY",
  });

  assert.equal(
    result.partitionCount,
    2,
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.recordCount,
        ),
    ),
    [2, 2],
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.firstSequence,
        ),
    ),
    [0, 2],
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.lastSequence,
        ),
    ),
    [1, 3],
  );
}

function testWeeklyPartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles = Object.freeze([
    createCandle({
      sequence: 0,
      openTime: Date.UTC(
        2024,
        0,
        7,
        23,
        59,
      ),
    }),

    createCandle({
      sequence: 1,
      openTime: Date.UTC(
        2024,
        0,
        8,
        0,
        0,
      ),
    }),

    createCandle({
      sequence: 2,
      openTime: Date.UTC(
        2024,
        0,
        8,
        0,
        1,
      ),
    }),
  ]);

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:weekly",
    ),
    candles,
    strategy: "BY_WEEK",
  });

  assert.equal(
    result.partitionCount,
    2,
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.recordCount,
        ),
    ),
    [1, 2],
  );
}

function testMonthlyPartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles = Object.freeze([
    createCandle({
      sequence: 0,
      openTime: Date.UTC(
        2024,
        0,
        31,
        23,
        59,
      ),
    }),

    createCandle({
      sequence: 1,
      openTime: Date.UTC(
        2024,
        1,
        1,
        0,
        0,
      ),
    }),

    createCandle({
      sequence: 2,
      openTime: Date.UTC(
        2024,
        1,
        1,
        0,
        1,
      ),
    }),
  ]);

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:monthly",
    ),
    candles,
    strategy: "BY_MONTH",
  });

  assert.equal(
    result.partitionCount,
    2,
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.recordCount,
        ),
    ),
    [1, 2],
  );
}

function testYearlyPartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles = Object.freeze([
    createCandle({
      sequence: 0,
      openTime: Date.UTC(
        2023,
        11,
        31,
        23,
        59,
      ),
    }),

    createCandle({
      sequence: 1,
      openTime: Date.UTC(
        2024,
        0,
        1,
        0,
        0,
      ),
    }),

    createCandle({
      sequence: 2,
      openTime: Date.UTC(
        2024,
        0,
        1,
        0,
        1,
      ),
    }),
  ]);

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:yearly",
    ),
    candles,
    strategy: "BY_YEAR",
  });

  assert.equal(
    result.partitionCount,
    2,
  );

  assert.deepEqual(
    result.partitions.map(
      (entry) =>
        Number(
          entry.partition.recordCount,
        ),
    ),
    [1, 2],
  );
}

function testDeterministicPartitionIds(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:ids",
  );

  const candles =
    createSequentialCandles(4);

  const first = partitioner.partition({
    datasetId,
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 2,
  });

  const second = partitioner.partition({
    datasetId,
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 2,
  });

  assert.deepEqual(
    first.partitions.map(
      (entry) =>
        String(entry.partition.id),
    ),
    second.partitions.map(
      (entry) =>
        String(entry.partition.id),
    ),
  );

  const firstPartition =
    first.partitions[0]!.partition;

  assert.equal(
    firstPartition.id,
    createHistoricalDatasetPartitionId(
      datasetId,
      "BY_RECORD_COUNT",
      0,
      firstPartition.range.startTime,
      firstPartition.range.endTime,
    ),
  );

  assert.ok(
    String(firstPartition.id).includes(
      ":partition:by_record_count:000000:",
    ),
  );
}

function testPartitionChecksums(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const checksumService =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:partition:checksums",
  );

  const candles =
    createSequentialCandles(5);

  const result = partitioner.partition({
    datasetId,
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 2,

    checksum: {
      algorithm: "SHA256",
      calculatedAt:
        historicalTimestamp(
          1_704_100_000_000,
        ),
      service: checksumService,
    },
  });

  assert.equal(
    result.partitionCount,
    3,
  );

  for (const entry of result.partitions) {
    assert.ok(
      entry.partition.checksum,
    );

    assert.equal(
      entry.partition.checksum
        .algorithm,
      "SHA256",
    );

    assert.equal(
      entry.partition.checksum
        .recordCount,
      entry.candles.length,
    );

    const independentlyCalculated =
      checksumService.calculatePartition({
        partition: {
          ...entry.partition,
          checksum: undefined,
        },
        candles: entry.candles,
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(
            1_704_100_000_000,
          ),
      });

    assert.equal(
      entry.partition.checksum.value,
      independentlyCalculated.value,
    );
  }
}

function testImmutability(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:immutability",
    ),
    candles:
      createSequentialCandles(3),
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 2,
  });

  assert.equal(
    Object.isFrozen(result),
    true,
  );

  assert.equal(
    Object.isFrozen(
      result.partitions,
    ),
    true,
  );

  const first =
    result.partitions[0];

  assert.ok(first);

  assert.equal(
    Object.isFrozen(first),
    true,
  );

  assert.equal(
    Object.isFrozen(
      first.partition,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      first.partition.range,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      first.candles,
    ),
    true,
  );

  assert.throws(() => {
    (
      result.partitions as unknown as
        unknown[]
    ).push({});
  }, TypeError);

  assert.throws(() => {
    (
      first.partition as unknown as {
        ordinal: number;
      }
    ).ordinal = 99;
  }, TypeError);

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

function testEmptyDatasetValidation(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:empty",
  );

  assertThrowsPartitioningError(
    () => {
      partitioner.partition({
        datasetId,
        candles: [],
        strategy: "NONE",
      });
    },
    "EMPTY_DATASET",
  );

  const allowed = partitioner.partition({
    datasetId,
    candles: [],
    strategy: "NONE",
    allowEmpty: true,
  });

  assert.equal(
    allowed.partitionCount,
    0,
  );

  assert.equal(
    allowed.recordCount,
    0,
  );

  assert.deepEqual(
    allowed.partitions,
    [],
  );
}

function testInvalidRecordLimit(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:invalid-limit",
  );

  const candles =
    createSequentialCandles(3);

  for (const limit of [
    undefined,
    0,
    -1,
    1.5,
    Number.NaN,
  ]) {
    assertThrowsPartitioningError(
      () => {
        partitioner.partition({
          datasetId,
          candles,
          strategy: "BY_RECORD_COUNT",
          ...(limit === undefined
            ? {}
            : {
                maximumRecordsPerPartition:
                  limit,
              }),
        });
      },
      "INVALID_RECORD_LIMIT",
    );
  }
}

function testInvalidCandleOrdering(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:invalid-order",
  );

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_060_000,
    }),

    createCandle({
      sequence: 1,
      openTime: 1_000_000,
    }),
  ];

  assertThrowsPartitioningError(
    () => {
      partitioner.partition({
        datasetId,
        candles,
        strategy: "BY_DAY",
      });
    },
    "INVALID_CANDLE_ORDER",
  );
}

function testInvalidSequenceOrdering(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:invalid-sequence",
  );

  const candles = [
    createCandle({
      sequence: 1,
      openTime: 1_000_000,
    }),

    createCandle({
      sequence: 1,
      openTime: 1_060_000,
    }),
  ];

  assertThrowsPartitioningError(
    () => {
      partitioner.partition({
        datasetId,
        candles,
        strategy: "NONE",
      });
    },
    "INVALID_CANDLE_ORDER",
  );
}

function testInvalidCandleRange(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const datasetId = historicalDatasetId(
    "dataset:partition:invalid-range",
  );

  const valid = createCandle({
    sequence: 0,
    openTime: 1_000_000,
  });

  const invalid = {
    ...valid,
    closeTime: historicalTimestamp(
      999_999,
    ),
  } satisfies HistoricalCandle;

  assertThrowsPartitioningError(
    () => {
      partitioner.partition({
        datasetId,
        candles: [invalid],
        strategy: "NONE",
      });
    },
    "INVALID_CANDLE_RANGE",
  );
}

function testInvalidChecksumTimestamp(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const checksumService =
    new DeterministicHistoricalDatasetChecksumService();

  assertThrowsPartitioningError(
    () => {
      partitioner.partition({
        datasetId: historicalDatasetId(
          "dataset:partition:checksum-time",
        ),

        candles:
          createSequentialCandles(2),

        strategy: "NONE",

        checksum: {
          algorithm: "SHA256",
          calculatedAt:
            -1 as ReturnType<
              typeof historicalTimestamp
            >,
          service: checksumService,
        },
      });
    },
    "INVALID_CALCULATION_TIMESTAMP",
  );
}

function testLargeDatasetPartitioning(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles =
    createSequentialCandles(10_000);

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:large",
    ),

    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 1_000,
  });

  assert.equal(
    result.recordCount,
    10_000,
  );

  assert.equal(
    result.partitionCount,
    10,
  );

  assert.equal(
    result.partitions.every(
      (entry) =>
        Number(
          entry.partition.recordCount,
        ) === 1_000,
    ),
    true,
  );

  assert.equal(
    result.partitions[0]?.partition
      .firstSequence,
    0,
  );

  assert.equal(
    result.partitions[9]?.partition
      .lastSequence,
    9_999,
  );

  assert.deepEqual(
    result.partitions.flatMap(
      (entry) => entry.candles,
    ),
    candles,
  );
}

function testPartitionBoundaryContinuity(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles =
    createSequentialCandles(7);

  const result = partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:continuity",
    ),
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 2,
  });

  for (
    let index = 1;
    index < result.partitions.length;
    index += 1
  ) {
    const previous =
      result.partitions[index - 1];

    const current =
      result.partitions[index];

    assert.ok(previous);
    assert.ok(current);

    assert.equal(
      Number(
        current.partition.firstSequence,
      ),
      Number(
        previous.partition.lastSequence,
      ) + 1,
    );

    assert.equal(
      Number(
        current.partition.range.startTime,
      ),
      Number(
        previous.partition.range.endTime,
      ) + 1,
    );
  }
}

function testInputArrayNotMutated(): void {
  const partitioner =
    new DeterministicHistoricalDatasetPartitioner();

  const candles = [
    ...createSequentialCandles(4),
  ];

  const snapshot = [...candles];

  partitioner.partition({
    datasetId: historicalDatasetId(
      "dataset:partition:no-mutation",
    ),
    candles,
    strategy: "BY_RECORD_COUNT",
    maximumRecordsPerPartition: 2,
  });

  assert.deepEqual(
    candles,
    snapshot,
  );
}

function runPartitioningTests(): void {
  console.log(
    "Running historical dataset partitioning tests...",
  );

  testNonePartitioning();
  testRecordCountPartitioning();
  testRecordCountLargerThanDataset();

  testDailyPartitioning();
  testWeeklyPartitioning();
  testMonthlyPartitioning();
  testYearlyPartitioning();

  testDeterministicPartitionIds();
  testPartitionChecksums();
  testImmutability();

  testEmptyDatasetValidation();
  testInvalidRecordLimit();
  testInvalidCandleOrdering();
  testInvalidSequenceOrdering();
  testInvalidCandleRange();
  testInvalidChecksumTimestamp();

  testLargeDatasetPartitioning();
  testPartitionBoundaryContinuity();
  testInputArrayNotMutated();

  console.log(
    "All historical dataset partitioning tests passed successfully.",
  );
}

runPartitioningTests();