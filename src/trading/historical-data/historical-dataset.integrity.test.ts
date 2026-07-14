import assert from "node:assert/strict";

import {
  createHistoricalDataset,
} from "./historical-dataset";

import {
  CreateHistoricalDatasetInput,
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
  DeterministicHistoricalDatasetChecksumService,
} from "./historical-dataset.checksum";

import {
  DeterministicHistoricalDatasetIntegrityValidator,
  HistoricalDatasetIntegrityIssueCode,
} from "./historical-dataset.integrity";

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
    sequence: historicalSequence(options.sequence),

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

function createValidCandles(): readonly HistoricalCandle[] {
  return Object.freeze([
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
    createCandle({
      sequence: 1,
      openTime: 1_060_000,
    }),
    createCandle({
      sequence: 2,
      openTime: 1_120_000,
    }),
  ]);
}

function createDatasetInput(
  options: Readonly<{
    id?: string;
    timeframe?: "1m" | "1M";
    recordCount?: number;
    startTime?: number;
    endTime?: number;
  }> = {},
): CreateHistoricalDatasetInput {
  const candles = createValidCandles();

  return {
    id: historicalDatasetId(
      options.id ?? "dataset:integrity",
    ),

    version: historicalDatasetVersion(1),

    source: historicalDataSource("binance"),
    origin: "EXCHANGE_API",
    marketType: "SPOT",

    symbol: historicalMarketSymbol("BTCUSDT"),
    timeframe: options.timeframe ?? "1m",

    range: {
      startTime: historicalTimestamp(
        options.startTime ??
          Number(candles[0]!.openTime),
      ),

      endTime: historicalTimestamp(
        options.endTime ??
          Number(
            candles[candles.length - 1]!
              .closeTime,
          ),
      ),
    },

    recordCount: historicalCount(
      options.recordCount ??
        candles.length,
    ),

    createdAt: historicalTimestamp(
      2_000_000,
    ),

    encoding: "JSON_LINES",
    partitionStrategy: "BY_DAY",
  };
}

function createDataset(
  options: Parameters<
    typeof createDatasetInput
  >[0] = {},
): HistoricalDataset {
  return createHistoricalDataset(
    createDatasetInput(options),
  );
}

function getIssueCodes(
  report: ReturnType<
    DeterministicHistoricalDatasetIntegrityValidator["validate"]
  >,
): readonly HistoricalDatasetIntegrityIssueCode[] {
  return report.issues.map(
    (issue) => issue.code,
  );
}

function testValidDataset(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const dataset = createDataset();
  const candles = createValidCandles();

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.equal(report.valid, true);
  assert.equal(report.actualRecordCount, 3);
  assert.equal(report.expectedRecordCount, 3);
  assert.equal(report.issues.length, 0);

  assert.deepEqual(report.summary, {
    totalIssues: 0,
    errors: 0,
    warnings: 0,
    informational: 0,
    duplicateOpenTimes: 0,
    duplicateSequences: 0,
    timeGaps: 0,
    sequenceGaps: 0,
    overlaps: 0,
  });

  assert.equal(Object.isFrozen(report), true);
  assert.equal(
    Object.isFrozen(report.issues),
    true,
  );
  assert.equal(
    Object.isFrozen(report.summary),
    true,
  );
}

function testEmptyDataset(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const dataset = createDataset({
    recordCount: 0,
  });

  const report = validator.validate(
    dataset,
    [],
  );

  assert.equal(report.valid, false);
  assert.deepEqual(
    getIssueCodes(report),
    ["EMPTY_DATASET"],
  );

  const allowed = validator.validate(
    dataset,
    [],
    {
      requireRecords: false,
    },
  );

  assert.equal(allowed.valid, true);
  assert.equal(allowed.issues.length, 0);
}

function testRecordCountMismatch(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const dataset = createDataset({
    recordCount: 99,
  });

  const report = validator.validate(
    dataset,
    createValidCandles(),
  );

  assert.equal(report.valid, false);
  assert.ok(
    getIssueCodes(report).includes(
      "RECORD_COUNT_MISMATCH",
    ),
  );

  const ignored = validator.validate(
    dataset,
    createValidCandles(),
    {
      validateRecordCount: false,
    },
  );

  assert.equal(
    getIssueCodes(ignored).includes(
      "RECORD_COUNT_MISMATCH",
    ),
    false,
  );
}

function testDatasetRangeMismatch(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const dataset = createDataset({
    startTime: 900_000,
    endTime: 1_500_000,
  });

  const report = validator.validate(
    dataset,
    createValidCandles(),
  );

  assert.ok(
    getIssueCodes(report).includes(
      "DATASET_RANGE_MISMATCH",
    ),
  );

  const ignored = validator.validate(
    dataset,
    createValidCandles(),
    {
      validateDatasetRange: false,
    },
  );

  assert.equal(
    getIssueCodes(ignored).includes(
      "DATASET_RANGE_MISMATCH",
    ),
    false,
  );
}

function testDuplicateOpenTime(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
    createCandle({
      sequence: 1,
      openTime: 1_000_000,
    }),
  ];

  const dataset = createDataset({
    recordCount: 2,
    startTime:
      Number(candles[0]!.openTime),
    endTime:
      Number(candles[1]!.closeTime),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.ok(
    getIssueCodes(report).includes(
      "DUPLICATE_OPEN_TIME",
    ),
  );

  assert.equal(
    report.summary.duplicateOpenTimes,
    1,
  );
}

function testDuplicateSequence(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
    createCandle({
      sequence: 0,
      openTime: 1_060_000,
    }),
  ];

  const dataset = createDataset({
    recordCount: 2,
    startTime:
      Number(candles[0]!.openTime),
    endTime:
      Number(candles[1]!.closeTime),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  const codes = getIssueCodes(report);

  assert.ok(
    codes.includes(
      "DUPLICATE_SEQUENCE",
    ),
  );

  assert.ok(
    codes.includes(
      "SEQUENCE_OUT_OF_ORDER",
    ),
  );

  assert.equal(
    report.summary.duplicateSequences,
    1,
  );
}

function testTimeGap(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
    createCandle({
      sequence: 1,
      openTime: 1_120_000,
    }),
  ];

  const dataset = createDataset({
    recordCount: 2,
    startTime:
      Number(candles[0]!.openTime),
    endTime:
      Number(candles[1]!.closeTime),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.ok(
    getIssueCodes(report).includes(
      "TIME_GAP",
    ),
  );

  assert.equal(report.summary.timeGaps, 1);

  const ignored = validator.validate(
    dataset,
    candles,
    {
      detectGaps: false,
    },
  );

  assert.equal(
    getIssueCodes(ignored).includes(
      "TIME_GAP",
    ),
    false,
  );
}

function testSequenceGap(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

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

  const dataset = createDataset({
    recordCount: 2,
    startTime:
      Number(candles[0]!.openTime),
    endTime:
      Number(candles[1]!.closeTime),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.ok(
    getIssueCodes(report).includes(
      "SEQUENCE_GAP",
    ),
  );

  assert.equal(
    report.summary.sequenceGaps,
    1,
  );
}

function testTimeOverlap(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
      duration: 60_000,
    }),
    createCandle({
      sequence: 1,
      openTime: 1_050_000,
      duration: 60_000,
    }),
  ];

  const dataset = createDataset({
    recordCount: 2,
    startTime:
      Number(candles[0]!.openTime),
    endTime:
      Number(candles[1]!.closeTime),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.ok(
    getIssueCodes(report).includes(
      "TIME_OVERLAP",
    ),
  );

  assert.equal(report.summary.overlaps, 1);
}

function testOrderingValidation(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

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

  /*
   * The candles are intentionally supplied out of order.
   *
   * The dataset metadata range itself must remain valid so the domain
   * factory can create the aggregate. Therefore, use the minimum opening
   * time and maximum closing time instead of using the array boundaries.
   */
  const dataset = createDataset({
    recordCount: 2,

    startTime: Math.min(
      ...candles.map((candle) =>
        Number(candle.openTime),
      ),
    ),

    endTime: Math.max(
      ...candles.map((candle) =>
        Number(candle.closeTime),
      ),
    ),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  const codes = getIssueCodes(report);

  assert.ok(
    codes.includes(
      "OPEN_TIME_OUT_OF_ORDER",
    ),
  );

  assert.ok(
    codes.includes(
      "CLOSE_TIME_OUT_OF_ORDER",
    ),
  );

  assert.equal(report.valid, false);
}

function testInvalidCandleDuration(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
      duration: 30_000,
    }),
  ];

  const dataset = createDataset({
    recordCount: 1,
    startTime:
      Number(candles[0]!.openTime),
    endTime:
      Number(candles[0]!.closeTime),
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.ok(
    getIssueCodes(report).includes(
      "INVALID_CANDLE_DURATION",
    ),
  );
}

function testInvalidCandleRange(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const valid = createCandle({
    sequence: 0,
    openTime: 1_000_000,
  });

  const invalid = {
    ...valid,
    high: historicalPrice(80),
  } satisfies HistoricalCandle;

  const dataset = createDataset({
    recordCount: 1,
    startTime:
      Number(invalid.openTime),
    endTime:
      Number(invalid.closeTime),
  });

  const report = validator.validate(
    dataset,
    [invalid],
  );

  assert.ok(
    getIssueCodes(report).includes(
      "INVALID_CANDLE_RANGE",
    ),
  );
}

function testCalendarTimeframe(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candle = createCandle({
    sequence: 0,
    openTime: 1_000_000,
  });

  const dataset = createDataset({
    timeframe: "1M",
    recordCount: 1,
    startTime:
      Number(candle.openTime),
    endTime:
      Number(candle.closeTime),
  });

  const report = validator.validate(
    dataset,
    [candle],
  );

  assert.equal(report.valid, true);

  assert.ok(
    getIssueCodes(report).includes(
      "UNSUPPORTED_CALENDAR_TIMEFRAME",
    ),
  );

  assert.equal(
    report.summary.informational,
    1,
  );
}

function testChecksumVerification(): void {
  const checksumService =
    new DeterministicHistoricalDatasetChecksumService();

  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = createValidCandles();
  const baseDataset = createDataset();

  const checksum = checksumService.calculate({
    datasetId: baseDataset.id,
    candles,
    algorithm: "SHA256",
    calculatedAt: historicalTimestamp(
      3_000_000,
    ),
  });

  const datasetWithChecksum = {
    ...baseDataset,
    checksum,
  } satisfies HistoricalDataset;

  const validReport = validator.validate(
    datasetWithChecksum,
    candles,
    {
      checksumService,
    },
  );

  assert.equal(validReport.valid, true);
  assert.ok(validReport.checksum);
  assert.equal(
    validReport.checksum.valid,
    true,
  );

  const mutatedCandles = [
    candles[0]!,
    {
      ...candles[1]!,
      volume: historicalVolume(999),
    },
    candles[2]!,
  ];

  const invalidReport = validator.validate(
    datasetWithChecksum,
    mutatedCandles,
    {
      checksumService,
    },
  );

  assert.equal(invalidReport.valid, false);

  assert.ok(
    getIssueCodes(invalidReport).includes(
      "CHECKSUM_MISMATCH",
    ),
  );

  assert.ok(invalidReport.checksum);
  assert.equal(
    invalidReport.checksum.valid,
    false,
  );
}

function testChecksumRequired(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const report = validator.validate(
    createDataset(),
    createValidCandles(),
    {
      requireChecksum: true,
    },
  );

  assert.equal(report.valid, false);

  assert.ok(
    getIssueCodes(report).includes(
      "CHECKSUM_MISSING",
    ),
  );
}

function testMissingChecksumService(): void {
  const checksumService =
    new DeterministicHistoricalDatasetChecksumService();

  const candles = createValidCandles();
  const baseDataset = createDataset();

  const checksum = checksumService.calculate({
    datasetId: baseDataset.id,
    candles,
    algorithm: "SHA256",
    calculatedAt:
      historicalTimestamp(3_000_000),
  });

  const datasetWithChecksum = {
    ...baseDataset,
    checksum,
  } satisfies HistoricalDataset;

  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  assert.throws(
    () => {
      validator.validate(
        datasetWithChecksum,
        candles,
      );
    },
    TypeError,
  );

  const skipped = validator.validate(
    datasetWithChecksum,
    candles,
    {
      verifyChecksum: false,
    },
  );

  assert.equal(skipped.valid, true);
  assert.equal(skipped.checksum, undefined);
}

function testMultipleIssuesSummary(): void {
  const validator =
    new DeterministicHistoricalDatasetIntegrityValidator();

  const candles = [
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
    createCandle({
      sequence: 0,
      openTime: 1_000_000,
    }),
    createCandle({
      sequence: 4,
      openTime: 1_180_000,
    }),
  ];

  const dataset = createDataset({
    recordCount: 99,
    startTime: 900_000,
    endTime: 2_000_000,
  });

  const report = validator.validate(
    dataset,
    candles,
  );

  assert.equal(report.valid, false);
  assert.ok(report.summary.errors > 0);
  assert.equal(
    report.summary.totalIssues,
    report.issues.length,
  );

  assert.equal(
    report.summary.duplicateOpenTimes,
    1,
  );

  assert.equal(
    report.summary.duplicateSequences,
    1,
  );

  assert.equal(
    report.summary.sequenceGaps,
    1,
  );

  assert.equal(
    report.summary.timeGaps,
    1,
  );
}

function runIntegrityTests(): void {
  console.log(
    "Running historical dataset integrity tests...",
  );

  testValidDataset();
  testEmptyDataset();
  testRecordCountMismatch();
  testDatasetRangeMismatch();
  testDuplicateOpenTime();
  testDuplicateSequence();
  testTimeGap();
  testSequenceGap();
  testTimeOverlap();
  testOrderingValidation();
  testInvalidCandleDuration();
  testInvalidCandleRange();
  testCalendarTimeframe();
  testChecksumVerification();
  testChecksumRequired();
  testMissingChecksumService();
  testMultipleIssuesSummary();

  console.log(
    "All historical dataset integrity tests passed successfully.",
  );
}

runIntegrityTests();