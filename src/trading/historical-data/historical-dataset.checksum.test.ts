import assert from "node:assert/strict";

import {
  HistoricalCandle,
  HistoricalDatasetPartition,
  HistoricalDatasetStreamRecord,
  historicalCount,
  historicalDatasetId,
  historicalPartitionId,
  historicalPrice,
  historicalSequence,
  historicalTimestamp,
  historicalVolume,
} from "./historical-dataset.types";

import {
  assertHistoricalDatasetChecksum,
  DeterministicHistoricalDatasetChecksumService,
  HistoricalDatasetChecksumError,
  serializeHistoricalCandleForChecksum,
  serializeHistoricalDatasetChecksumHeader,
} from "./historical-dataset.checksum";

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
    quoteVolume?: number;
    tradeCount?: number;
    takerBuyBaseVolume?: number;
    takerBuyQuoteVolume?: number;
    isClosed?: boolean;
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

    ...(options.quoteVolume === undefined
      ? {}
      : {
          quoteVolume: historicalVolume(
            options.quoteVolume,
          ),
        }),

    ...(options.tradeCount === undefined
      ? {}
      : {
          tradeCount: historicalCount(
            options.tradeCount,
          ),
        }),

    ...(options.takerBuyBaseVolume === undefined
      ? {}
      : {
          takerBuyBaseVolume:
            historicalVolume(
              options.takerBuyBaseVolume,
            ),
        }),

    ...(options.takerBuyQuoteVolume === undefined
      ? {}
      : {
          takerBuyQuoteVolume:
            historicalVolume(
              options.takerBuyQuoteVolume,
            ),
        }),

    isClosed: options.isClosed ?? true,
  });
}

function createCandles(): readonly HistoricalCandle[] {
  return Object.freeze([
    createCandle({
      sequence: 0,
      openTime: 1_704_067_200_000,
      open: 42_000,
      high: 42_500,
      low: 41_900,
      close: 42_300,
      volume: 12.5,
      quoteVolume: 528_750,
      tradeCount: 1_250,
      takerBuyBaseVolume: 7.1,
      takerBuyQuoteVolume: 300_330,
    }),

    createCandle({
      sequence: 1,
      openTime: 1_704_067_260_000,
      open: 42_300,
      high: 42_700,
      low: 42_100,
      close: 42_600,
      volume: 18.25,
      quoteVolume: 777_450,
      tradeCount: 1_780,
      takerBuyBaseVolume: 9.4,
      takerBuyQuoteVolume: 400_440,
    }),

    createCandle({
      sequence: 2,
      openTime: 1_704_067_320_000,
      open: 42_600,
      high: 42_900,
      low: 42_400,
      close: 42_750,
      volume: 9.75,
      quoteVolume: 416_812.5,
      tradeCount: 980,
      takerBuyBaseVolume: 5.2,
      takerBuyQuoteVolume: 222_300,
    }),
  ]);
}

function assertThrowsChecksumError(
  operation: () => unknown,
  expectedCode: HistoricalDatasetChecksumError["code"],
): void {
  assert.throws(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof
          HistoricalDatasetChecksumError,
        "Expected HistoricalDatasetChecksumError.",
      );

      assert.equal(error.code, expectedCode);

      return true;
    },
  );
}

async function assertRejectsChecksumError(
  operation: () => Promise<unknown>,
  expectedCode: HistoricalDatasetChecksumError["code"],
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof
          HistoricalDatasetChecksumError,
        "Expected HistoricalDatasetChecksumError.",
      );

      assert.equal(error.code, expectedCode);

      return true;
    },
  );
}

function testCanonicalSerialization(): void {
  const candle = createCandle({
    sequence: 4,
    openTime: 1_000,
    duration: 60_000,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    quoteVolume: 1_050,
    tradeCount: 50,
    takerBuyBaseVolume: 6,
    takerBuyQuoteVolume: 630,
    isClosed: true,
  });

  const serialized =
    serializeHistoricalCandleForChecksum(
      candle,
      7,
    );

  assert.equal(
    serialized,
    [
      "record",
      "7",
      "4",
      "1000",
      "60999",
      "100",
      "110",
      "90",
      "105",
      "10",
      "1050",
      "50",
      "6",
      "630",
      "1",
    ].join("|"),
  );

  const datasetId = historicalDatasetId(
    "dataset:checksum:serialization",
  );

  assert.equal(
    serializeHistoricalDatasetChecksumHeader(
      datasetId,
    ),
    [
      "quantumtradeai",
      "historical-dataset",
      "checksum",
      "v1",
      "30:dataset:checksum:serialization",
    ].join("|"),
  );
}

function testDeterministicCalculation(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:deterministic",
  );

  const candles = createCandles();

  const first = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(5_000),
  });

  const second = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(5_000),
  });

  assert.deepEqual(first, second);
  assert.equal(first.algorithm, "SHA256");
  assert.equal(first.recordCount, 3);
  assert.equal(first.calculatedAt, 5_000);

  assert.equal(
    String(first.value).length,
    64,
  );

  assert.equal(Object.isFrozen(first), true);
}

function testCalculationTimestampExcludedFromDigest(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:timestamp",
  );

  const candles = createCandles();

  const first = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1_000),
  });

  const second = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(2_000),
  });

  assert.equal(first.value, second.value);
  assert.notEqual(
    first.calculatedAt,
    second.calculatedAt,
  );
}

function testSupportedAlgorithms(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:algorithms",
  );

  const candles = createCandles();

  const sha256 = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  const sha384 = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA384",
    calculatedAt: historicalTimestamp(1),
  });

  const sha512 = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA512",
    calculatedAt: historicalTimestamp(1),
  });

  assert.equal(
    String(sha256.value).length,
    64,
  );

  assert.equal(
    String(sha384.value).length,
    96,
  );

  assert.equal(
    String(sha512.value).length,
    128,
  );

  assert.notEqual(sha256.value, sha384.value);
  assert.notEqual(sha384.value, sha512.value);
}

function testDatasetIdentityAffectsChecksum(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const candles = createCandles();

  const first = service.calculate({
    datasetId: historicalDatasetId(
      "dataset:checksum:a",
    ),
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  const second = service.calculate({
    datasetId: historicalDatasetId(
      "dataset:checksum:b",
    ),
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  assert.notEqual(first.value, second.value);
}

function testOrderingSensitivity(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:ordering",
  );

  const candles = createCandles();

  const ordered = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  const reordered = service.calculate({
    datasetId,
    candles: [
      candles[1]!,
      candles[0]!,
      candles[2]!,
    ],
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  assert.notEqual(
    ordered.value,
    reordered.value,
  );
}

function testMutationDetection(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:mutation",
  );

  const candles = createCandles();

  const original = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  const mutatedCandle: HistoricalCandle = {
    ...candles[1]!,
    close: historicalPrice(42_601),
  };

  const mutated = service.calculate({
    datasetId,
    candles: [
      candles[0]!,
      mutatedCandle,
      candles[2]!,
    ],
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  assert.notEqual(
    original.value,
    mutated.value,
  );
}

function testOptionalFieldsAffectChecksum(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:optional-fields",
  );

  const withOptionalFields = [
    createCandle({
      sequence: 0,
      openTime: 1_000,
      quoteVolume: 1_000,
      tradeCount: 100,
      takerBuyBaseVolume: 5,
      takerBuyQuoteVolume: 500,
    }),
  ];

  const withoutOptionalFields = [
    createCandle({
      sequence: 0,
      openTime: 1_000,
    }),
  ];

  const first = service.calculate({
    datasetId,
    candles: withOptionalFields,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  const second = service.calculate({
    datasetId,
    candles: withoutOptionalFields,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  assert.notEqual(first.value, second.value);
}

function testNegativeZeroCanonicalization(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:negative-zero",
  );

  const positiveZeroCandle = createCandle({
    sequence: 0,
    openTime: 1_000,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  });

  const negativeZeroCandle = {
    ...positiveZeroCandle,
    open: -0,
    high: -0,
    low: -0,
    close: -0,
    volume: -0,
  } as HistoricalCandle;

  const positive = service.calculate({
    datasetId,
    candles: [positiveZeroCandle],
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  const negative = service.calculate({
    datasetId,
    candles: [negativeZeroCandle],
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
  });

  assert.equal(positive.value, negative.value);
}

function testEmptyDatasetHandling(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:empty",
  );

  assertThrowsChecksumError(
    () => {
      service.calculate({
        datasetId,
        candles: [],
        algorithm: "SHA256",
        calculatedAt: historicalTimestamp(1),
      });
    },
    "EMPTY_DATASET",
  );

  const allowed = service.calculate({
    datasetId,
    candles: [],
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(1),
    allowEmpty: true,
  });

  assert.equal(allowed.recordCount, 0);
  assert.equal(
    String(allowed.value).length,
    64,
  );
}

function testVerification(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:verification",
  );

  const candles = createCandles();

  const expected = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(5_000),
  });

  const validResult = service.verify({
    datasetId,
    candles,
    expectedChecksum: expected,
  });

  assert.equal(validResult.valid, true);
  assert.deepEqual(
    validResult.actual,
    expected,
  );

  assert.equal(
    Object.isFrozen(validResult),
    true,
  );

  const changedCandles = [
    candles[0]!,
    {
      ...candles[1]!,
      volume: historicalVolume(999),
    },
    candles[2]!,
  ];

  const invalidResult = service.verify({
    datasetId,
    candles: changedCandles,
    expectedChecksum: expected,
  });

  assert.equal(invalidResult.valid, false);
  assert.notEqual(
    invalidResult.actual.value,
    expected.value,
  );

  assertThrowsChecksumError(
    () => {
      assertHistoricalDatasetChecksum(
        service,
        {
          datasetId,
          candles: changedCandles,
          expectedChecksum: expected,
        },
      );
    },
    "CHECKSUM_MISMATCH",
  );

  const asserted =
    assertHistoricalDatasetChecksum(
      service,
      {
        datasetId,
        candles,
        expectedChecksum: expected,
      },
    );

  assert.equal(asserted.valid, true);
}

function testPartitionChecksum(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:partition",
  );

  const candles = createCandles();

  const partition: HistoricalDatasetPartition =
    Object.freeze({
      id: historicalPartitionId(
        "partition:0",
      ),

      datasetId,
      ordinal: 0,
      strategy: "BY_RECORD_COUNT",

      range: Object.freeze({
        startTime: candles[0]!.openTime,
        endTime:
          candles[candles.length - 1]!
            .closeTime,
      }),

      firstSequence:
        candles[0]!.sequence,

      lastSequence:
        candles[candles.length - 1]!
          .sequence,

      recordCount: historicalCount(
        candles.length,
      ),
    });

  const checksum =
    service.calculatePartition({
      partition,
      candles,
      algorithm: "SHA256",
      calculatedAt:
        historicalTimestamp(10_000),
    });

  const fullChecksum = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA256",
    calculatedAt:
      historicalTimestamp(10_000),
  });

  assert.deepEqual(
    checksum,
    fullChecksum,
  );
}

function testInvalidPartition(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:invalid-partition",
  );

  const candles = createCandles();

  const partition: HistoricalDatasetPartition = {
    id: historicalPartitionId(
      "partition:invalid",
    ),

    datasetId,
    ordinal: 0,
    strategy: "BY_RECORD_COUNT",

    range: {
      startTime: candles[0]!.openTime,
      endTime:
        candles[candles.length - 1]!
          .closeTime,
    },

    firstSequence:
      candles[0]!.sequence,

    lastSequence:
      candles[candles.length - 1]!
        .sequence,

    recordCount: historicalCount(999),
  };

  assertThrowsChecksumError(
    () => {
      service.calculatePartition({
        partition,
        candles,
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "INVALID_PARTITION",
  );
}

async function* createStream(
  datasetId: ReturnType<
    typeof historicalDatasetId
  >,
  candles: readonly HistoricalCandle[],
): AsyncGenerator<
  HistoricalDatasetStreamRecord,
  void,
  undefined
> {
  for (const candle of candles) {
    yield Object.freeze({
      datasetId,
      candle,
    });
  }
}

async function testStreamingChecksum(): Promise<void> {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:stream",
  );

  const candles = createCandles();

  const materialized = service.calculate({
    datasetId,
    candles,
    algorithm: "SHA512",
    calculatedAt:
      historicalTimestamp(20_000),
  });

  const streamed =
    await service.calculateStream({
      datasetId,
      records: createStream(
        datasetId,
        candles,
      ),
      algorithm: "SHA512",
      calculatedAt:
        historicalTimestamp(20_000),
    });

  assert.deepEqual(streamed, materialized);
}

async function testInvalidStreamDataset(): Promise<void> {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:stream:expected",
  );

  const wrongDatasetId = historicalDatasetId(
    "dataset:checksum:stream:wrong",
  );

  async function* invalidStream(): AsyncGenerator<
    HistoricalDatasetStreamRecord,
    void,
    undefined
  > {
    yield {
      datasetId: wrongDatasetId,
      candle: createCandle({
        sequence: 0,
        openTime: 1_000,
      }),
    };
  }

  await assertRejectsChecksumError(
    async () => {
      await service.calculateStream({
        datasetId,
        records: invalidStream(),
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "INVALID_RECORD",
  );
}

async function testEmptyStream(): Promise<void> {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:empty-stream",
  );

  async function* emptyStream(): AsyncGenerator<
    HistoricalDatasetStreamRecord,
    void,
    undefined
  > {
    return;
  }

  await assertRejectsChecksumError(
    async () => {
      await service.calculateStream({
        datasetId,
        records: emptyStream(),
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "EMPTY_DATASET",
  );

  const allowed =
    await service.calculateStream({
      datasetId,
      records: emptyStream(),
      algorithm: "SHA256",
      calculatedAt:
        historicalTimestamp(1),
      allowEmpty: true,
    });

  assert.equal(allowed.recordCount, 0);
}

function testInvalidCandles(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  const datasetId = historicalDatasetId(
    "dataset:checksum:invalid-candles",
  );

  const baseCandle = createCandle({
    sequence: 0,
    openTime: 1_000,
  });

  const invalidHigh = {
    ...baseCandle,
    high: historicalPrice(80),
  } satisfies HistoricalCandle;

  assertThrowsChecksumError(
    () => {
      service.calculate({
        datasetId,
        candles: [invalidHigh],
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "INVALID_RECORD",
  );

  const invalidCloseTime = {
    ...baseCandle,
    closeTime: historicalTimestamp(999),
  } satisfies HistoricalCandle;

  assertThrowsChecksumError(
    () => {
      service.calculate({
        datasetId,
        candles: [invalidCloseTime],
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "INVALID_RECORD",
  );

  const invalidTradeCount = {
    ...baseCandle,
    tradeCount: -1,
  } as HistoricalCandle;

  assertThrowsChecksumError(
    () => {
      service.calculate({
        datasetId,
        candles: [invalidTradeCount],
        algorithm: "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "INVALID_RECORD",
  );
}

function testInvalidAlgorithm(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  assertThrowsChecksumError(
    () => {
      service.calculate({
        datasetId: historicalDatasetId(
          "dataset:checksum:invalid-algorithm",
        ),
        candles: createCandles(),
        algorithm: "MD5" as "SHA256",
        calculatedAt:
          historicalTimestamp(1),
      });
    },
    "INVALID_ALGORITHM",
  );
}

function testInvalidCalculationTimestamp(): void {
  const service =
    new DeterministicHistoricalDatasetChecksumService();

  assertThrowsChecksumError(
    () => {
      service.calculate({
        datasetId: historicalDatasetId(
          "dataset:checksum:invalid-time",
        ),
        candles: createCandles(),
        algorithm: "SHA256",
        calculatedAt:
          -1 as ReturnType<
            typeof historicalTimestamp
          >,
      });
    },
    "INVALID_CALCULATION_TIMESTAMP",
  );
}

async function runHistoricalDatasetChecksumTests(): Promise<void> {
  console.log(
    "Running historical dataset checksum tests...",
  );

  testCanonicalSerialization();
  testDeterministicCalculation();
  testCalculationTimestampExcludedFromDigest();
  testSupportedAlgorithms();
  testDatasetIdentityAffectsChecksum();
  testOrderingSensitivity();
  testMutationDetection();
  testOptionalFieldsAffectChecksum();
  testNegativeZeroCanonicalization();
  testEmptyDatasetHandling();
  testVerification();
  testPartitionChecksum();
  testInvalidPartition();

  await testStreamingChecksum();
  await testInvalidStreamDataset();
  await testEmptyStream();

  testInvalidCandles();
  testInvalidAlgorithm();
  testInvalidCalculationTimestamp();

  console.log(
    "All historical dataset checksum tests passed successfully.",
  );
}

void runHistoricalDatasetChecksumTests();