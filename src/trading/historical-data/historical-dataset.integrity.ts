import {
  HistoricalCandle,
  HistoricalDataset,
  HistoricalDatasetChecksum,
  HistoricalDatasetId,
  HistoricalTimeframe,
  HistoricalTimestamp,
  getHistoricalTimeframeMilliseconds,
  historicalCount,
} from "./historical-dataset.types";

import {
  HistoricalDatasetChecksumService,
} from "./historical-dataset.checksum";

/**
 * Integrity validation issue severity.
 */
export const HISTORICAL_DATASET_INTEGRITY_SEVERITIES = [
  "ERROR",
  "WARNING",
  "INFO",
] as const;

export type HistoricalDatasetIntegritySeverity =
  (typeof HISTORICAL_DATASET_INTEGRITY_SEVERITIES)[number];

/**
 * Integrity validation issue codes.
 */
export const HISTORICAL_DATASET_INTEGRITY_ISSUE_CODES = [
  "EMPTY_DATASET",
  "RECORD_COUNT_MISMATCH",
  "DATASET_RANGE_MISMATCH",
  "OPEN_TIME_OUT_OF_ORDER",
  "CLOSE_TIME_OUT_OF_ORDER",
  "SEQUENCE_OUT_OF_ORDER",
  "SEQUENCE_GAP",
  "DUPLICATE_OPEN_TIME",
  "DUPLICATE_SEQUENCE",
  "TIME_GAP",
  "TIME_OVERLAP",
  "INVALID_CANDLE_DURATION",
  "INVALID_CANDLE_RANGE",
  "CHECKSUM_MISSING",
  "CHECKSUM_MISMATCH",
  "UNSUPPORTED_CALENDAR_TIMEFRAME",
] as const;

export type HistoricalDatasetIntegrityIssueCode =
  (typeof HISTORICAL_DATASET_INTEGRITY_ISSUE_CODES)[number];

/**
 * Immutable integrity issue.
 */
export interface HistoricalDatasetIntegrityIssue {
  readonly code: HistoricalDatasetIntegrityIssueCode;
  readonly severity: HistoricalDatasetIntegritySeverity;

  readonly message: string;

  readonly datasetId: HistoricalDatasetId;

  readonly recordIndex?: number;
  readonly previousRecordIndex?: number;

  readonly timestamp?: HistoricalTimestamp;
  readonly expectedTimestamp?: HistoricalTimestamp;

  readonly sequence?: number;
  readonly expectedSequence?: number;
}

/**
 * Dataset integrity validation options.
 */
export interface HistoricalDatasetIntegrityValidationOptions {
  /**
   * When true, empty datasets produce an error.
   *
   * Default: true.
   */
  readonly requireRecords?: boolean;

  /**
   * Validates metadata record count against the supplied candle count.
   *
   * Default: true.
   */
  readonly validateRecordCount?: boolean;

  /**
   * Validates metadata start/end range against the supplied candles.
   *
   * Default: true.
   */
  readonly validateDatasetRange?: boolean;

  /**
   * Validates candle ordering by open time.
   *
   * Default: true.
   */
  readonly validateOrdering?: boolean;

  /**
   * Validates strictly increasing candle sequences.
   *
   * Default: true.
   */
  readonly validateSequences?: boolean;

  /**
   * Detects duplicate candle opening timestamps.
   *
   * Default: true.
   */
  readonly detectDuplicateOpenTimes?: boolean;

  /**
   * Detects duplicate sequence values.
   *
   * Default: true.
   */
  readonly detectDuplicateSequences?: boolean;

  /**
   * Detects missing timeframe intervals.
   *
   * Default: true.
   */
  readonly detectGaps?: boolean;

  /**
   * Detects overlapping candle ranges.
   *
   * Default: true.
   */
  readonly detectOverlaps?: boolean;

  /**
   * Validates fixed timeframe candle duration.
   *
   * Default: true.
   */
  readonly validateCandleDuration?: boolean;

  /**
   * Verifies the dataset checksum when present.
   *
   * Default: true.
   */
  readonly verifyChecksum?: boolean;

  /**
   * Requires a checksum to exist.
   *
   * Default: false.
   */
  readonly requireChecksum?: boolean;

  /**
   * Optional checksum service.
   *
   * Required when checksum verification is enabled and the dataset contains a
   * checksum.
   */
  readonly checksumService?: HistoricalDatasetChecksumService;
}

/**
 * Immutable integrity validation summary.
 */
export interface HistoricalDatasetIntegritySummary {
  readonly totalIssues: number;
  readonly errors: number;
  readonly warnings: number;
  readonly informational: number;

  readonly duplicateOpenTimes: number;
  readonly duplicateSequences: number;

  readonly timeGaps: number;
  readonly sequenceGaps: number;
  readonly overlaps: number;
}

/**
 * Immutable integrity validation report.
 */
export interface HistoricalDatasetIntegrityReport {
  readonly datasetId: HistoricalDatasetId;
  readonly valid: boolean;

  readonly timeframe: HistoricalTimeframe;

  readonly actualRecordCount: number;
  readonly expectedRecordCount: number;

  readonly issues: readonly HistoricalDatasetIntegrityIssue[];
  readonly summary: HistoricalDatasetIntegritySummary;

  readonly checksum?: Readonly<{
    readonly expected: HistoricalDatasetChecksum;
    readonly actual: HistoricalDatasetChecksum;
    readonly valid: boolean;
  }>;
}

/**
 * Dataset integrity validator abstraction.
 */
export interface HistoricalDatasetIntegrityValidator {
  validate(
    dataset: HistoricalDataset,
    candles: readonly HistoricalCandle[],
    options?: HistoricalDatasetIntegrityValidationOptions,
  ): HistoricalDatasetIntegrityReport;
}

/**
 * Deterministic integrity validator.
 */
export class DeterministicHistoricalDatasetIntegrityValidator
  implements HistoricalDatasetIntegrityValidator
{
  public validate(
    dataset: HistoricalDataset,
    candles: readonly HistoricalCandle[],
    options: HistoricalDatasetIntegrityValidationOptions = {},
  ): HistoricalDatasetIntegrityReport {
    const normalizedOptions =
      normalizeIntegrityValidationOptions(options);

    const issues: HistoricalDatasetIntegrityIssue[] = [];

    const expectedRecordCount =
      Number(dataset.metadata.recordCount);

    if (
      normalizedOptions.requireRecords &&
      candles.length === 0
    ) {
      issues.push(
        createIssue({
          code: "EMPTY_DATASET",
          severity: "ERROR",
          message: `Historical dataset "${dataset.id}" contains no candles.`,
          datasetId: dataset.id,
        }),
      );
    }

    if (
      normalizedOptions.validateRecordCount &&
      expectedRecordCount !== candles.length
    ) {
      issues.push(
        createIssue({
          code: "RECORD_COUNT_MISMATCH",
          severity: "ERROR",
          message: [
            `Historical dataset "${dataset.id}" declares`,
            `${expectedRecordCount} records but received`,
            `${candles.length} candles.`,
          ].join(" "),
          datasetId: dataset.id,
        }),
      );
    }

    if (candles.length > 0) {
      this.validateCandles(
        dataset,
        candles,
        normalizedOptions,
        issues,
      );

      if (normalizedOptions.validateDatasetRange) {
        validateDatasetRange(
          dataset,
          candles,
          issues,
        );
      }
    }

    const checksumResult =
      validateDatasetChecksum(
        dataset,
        candles,
        normalizedOptions,
        issues,
      );

    const summary =
      createIntegritySummary(issues);

    return Object.freeze({
      datasetId: dataset.id,
      valid: summary.errors === 0,

      timeframe: dataset.metadata.timeframe,

      actualRecordCount: candles.length,
      expectedRecordCount,

      issues: Object.freeze(
        issues.map(cloneIssue),
      ),

      summary,

      ...(checksumResult === undefined
        ? {}
        : {
            checksum: checksumResult,
          }),
    });
  }

  private validateCandles(
    dataset: HistoricalDataset,
    candles: readonly HistoricalCandle[],
    options: NormalizedIntegrityValidationOptions,
    issues: HistoricalDatasetIntegrityIssue[],
  ): void {
    const timeframeMilliseconds =
      getHistoricalTimeframeMilliseconds(
        dataset.metadata.timeframe,
      );

    if (
      timeframeMilliseconds === undefined &&
      (
        options.detectGaps ||
        options.validateCandleDuration
      )
    ) {
      issues.push(
        createIssue({
          code: "UNSUPPORTED_CALENDAR_TIMEFRAME",
          severity: "INFO",
          message: [
            `Historical dataset "${dataset.id}" uses calendar timeframe`,
            `"${dataset.metadata.timeframe}". Fixed-duration gap and`,
            "candle-duration validation were skipped.",
          ].join(" "),
          datasetId: dataset.id,
        }),
      );
    }

    const openTimeIndexes = new Map<number, number>();
    const sequenceIndexes = new Map<number, number>();

    for (
      let index = 0;
      index < candles.length;
      index += 1
    ) {
      const candle = candles[index];

      if (candle === undefined) {
        continue;
      }

      validateCandleRange(
        dataset.id,
        candle,
        index,
        issues,
      );

      if (options.detectDuplicateOpenTimes) {
        detectDuplicateOpenTime(
          dataset.id,
          candle,
          index,
          openTimeIndexes,
          issues,
        );
      }

      if (options.detectDuplicateSequences) {
        detectDuplicateSequence(
          dataset.id,
          candle,
          index,
          sequenceIndexes,
          issues,
        );
      }

      if (
        options.validateCandleDuration &&
        timeframeMilliseconds !== undefined
      ) {
        validateCandleDuration(
          dataset.id,
          candle,
          index,
          timeframeMilliseconds,
          issues,
        );
      }

      if (index === 0) {
        continue;
      }

      const previousCandle =
        candles[index - 1];

      if (previousCandle === undefined) {
        continue;
      }

      if (options.validateOrdering) {
        validateOrdering(
          dataset.id,
          previousCandle,
          candle,
          index - 1,
          index,
          issues,
        );
      }

      if (options.validateSequences) {
        validateSequenceProgression(
          dataset.id,
          previousCandle,
          candle,
          index - 1,
          index,
          issues,
        );
      }

      if (options.detectOverlaps) {
        detectTimeOverlap(
          dataset.id,
          previousCandle,
          candle,
          index - 1,
          index,
          issues,
        );
      }

      if (
        options.detectGaps &&
        timeframeMilliseconds !== undefined
      ) {
        detectTimeGap(
          dataset.id,
          previousCandle,
          candle,
          index - 1,
          index,
          timeframeMilliseconds,
          issues,
        );
      }
    }
  }
}

interface NormalizedIntegrityValidationOptions {
  readonly requireRecords: boolean;
  readonly validateRecordCount: boolean;
  readonly validateDatasetRange: boolean;
  readonly validateOrdering: boolean;
  readonly validateSequences: boolean;
  readonly detectDuplicateOpenTimes: boolean;
  readonly detectDuplicateSequences: boolean;
  readonly detectGaps: boolean;
  readonly detectOverlaps: boolean;
  readonly validateCandleDuration: boolean;
  readonly verifyChecksum: boolean;
  readonly requireChecksum: boolean;
  readonly checksumService?: HistoricalDatasetChecksumService;
}

function normalizeIntegrityValidationOptions(
  options: HistoricalDatasetIntegrityValidationOptions,
): NormalizedIntegrityValidationOptions {
  return Object.freeze({
    requireRecords:
      options.requireRecords ?? true,

    validateRecordCount:
      options.validateRecordCount ?? true,

    validateDatasetRange:
      options.validateDatasetRange ?? true,

    validateOrdering:
      options.validateOrdering ?? true,

    validateSequences:
      options.validateSequences ?? true,

    detectDuplicateOpenTimes:
      options.detectDuplicateOpenTimes ?? true,

    detectDuplicateSequences:
      options.detectDuplicateSequences ?? true,

    detectGaps:
      options.detectGaps ?? true,

    detectOverlaps:
      options.detectOverlaps ?? true,

    validateCandleDuration:
      options.validateCandleDuration ?? true,

    verifyChecksum:
      options.verifyChecksum ?? true,

    requireChecksum:
      options.requireChecksum ?? false,

    ...(options.checksumService === undefined
      ? {}
      : {
          checksumService:
            options.checksumService,
        }),
  });
}

function validateDatasetRange(
  dataset: HistoricalDataset,
  candles: readonly HistoricalCandle[],
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const firstCandle = candles[0];
  const lastCandle =
    candles[candles.length - 1];

  if (
    firstCandle === undefined ||
    lastCandle === undefined
  ) {
    return;
  }

  if (
    firstCandle.openTime !==
      dataset.metadata.range.startTime ||
    lastCandle.closeTime !==
      dataset.metadata.range.endTime
  ) {
    issues.push(
      createIssue({
        code: "DATASET_RANGE_MISMATCH",
        severity: "ERROR",
        message: [
          `Historical dataset "${dataset.id}" metadata range`,
          `${dataset.metadata.range.startTime}-${dataset.metadata.range.endTime}`,
          "does not match candle range",
          `${firstCandle.openTime}-${lastCandle.closeTime}.`,
        ].join(" "),
        datasetId: dataset.id,
      }),
    );
  }
}

function validateCandleRange(
  datasetId: HistoricalDatasetId,
  candle: HistoricalCandle,
  index: number,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const valid =
    candle.closeTime >= candle.openTime &&
    candle.high >= candle.low &&
    candle.open >= candle.low &&
    candle.open <= candle.high &&
    candle.close >= candle.low &&
    candle.close <= candle.high;

  if (valid) {
    return;
  }

  issues.push(
    createIssue({
      code: "INVALID_CANDLE_RANGE",
      severity: "ERROR",
      message: `Historical dataset "${datasetId}" contains an invalid candle at index ${index}.`,
      datasetId,
      recordIndex: index,
      timestamp: candle.openTime,
      sequence: Number(candle.sequence),
    }),
  );
}

function validateOrdering(
  datasetId: HistoricalDatasetId,
  previous: HistoricalCandle,
  current: HistoricalCandle,
  previousIndex: number,
  currentIndex: number,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  if (current.openTime < previous.openTime) {
    issues.push(
      createIssue({
        code: "OPEN_TIME_OUT_OF_ORDER",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" candle at index`,
          `${currentIndex} opens before candle at index`,
          `${previousIndex}.`,
        ].join(" "),
        datasetId,
        recordIndex: currentIndex,
        previousRecordIndex: previousIndex,
        timestamp: current.openTime,
        expectedTimestamp: previous.openTime,
      }),
    );
  }

  if (current.closeTime < previous.closeTime) {
    issues.push(
      createIssue({
        code: "CLOSE_TIME_OUT_OF_ORDER",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" candle at index`,
          `${currentIndex} closes before candle at index`,
          `${previousIndex}.`,
        ].join(" "),
        datasetId,
        recordIndex: currentIndex,
        previousRecordIndex: previousIndex,
        timestamp: current.closeTime,
        expectedTimestamp: previous.closeTime,
      }),
    );
  }
}

function validateSequenceProgression(
  datasetId: HistoricalDatasetId,
  previous: HistoricalCandle,
  current: HistoricalCandle,
  previousIndex: number,
  currentIndex: number,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const previousSequence =
    Number(previous.sequence);

  const currentSequence =
    Number(current.sequence);

  const expectedSequence =
    previousSequence + 1;

  if (currentSequence <= previousSequence) {
    issues.push(
      createIssue({
        code: "SEQUENCE_OUT_OF_ORDER",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" sequence`,
          `${currentSequence} at index ${currentIndex}`,
          `does not follow sequence ${previousSequence}`,
          `at index ${previousIndex}.`,
        ].join(" "),
        datasetId,
        recordIndex: currentIndex,
        previousRecordIndex: previousIndex,
        sequence: currentSequence,
        expectedSequence,
      }),
    );

    return;
  }

  if (currentSequence !== expectedSequence) {
    issues.push(
      createIssue({
        code: "SEQUENCE_GAP",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" expected sequence`,
          `${expectedSequence} at index ${currentIndex}`,
          `but received ${currentSequence}.`,
        ].join(" "),
        datasetId,
        recordIndex: currentIndex,
        previousRecordIndex: previousIndex,
        sequence: currentSequence,
        expectedSequence,
      }),
    );
  }
}

function detectDuplicateOpenTime(
  datasetId: HistoricalDatasetId,
  candle: HistoricalCandle,
  index: number,
  seen: Map<number, number>,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const timestamp =
    Number(candle.openTime);

  const previousIndex =
    seen.get(timestamp);

  if (previousIndex !== undefined) {
    issues.push(
      createIssue({
        code: "DUPLICATE_OPEN_TIME",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" contains duplicate`,
          `open time ${timestamp} at indexes`,
          `${previousIndex} and ${index}.`,
        ].join(" "),
        datasetId,
        recordIndex: index,
        previousRecordIndex: previousIndex,
        timestamp: candle.openTime,
      }),
    );

    return;
  }

  seen.set(timestamp, index);
}

function detectDuplicateSequence(
  datasetId: HistoricalDatasetId,
  candle: HistoricalCandle,
  index: number,
  seen: Map<number, number>,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const sequence =
    Number(candle.sequence);

  const previousIndex =
    seen.get(sequence);

  if (previousIndex !== undefined) {
    issues.push(
      createIssue({
        code: "DUPLICATE_SEQUENCE",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" contains duplicate`,
          `sequence ${sequence} at indexes`,
          `${previousIndex} and ${index}.`,
        ].join(" "),
        datasetId,
        recordIndex: index,
        previousRecordIndex: previousIndex,
        sequence,
      }),
    );

    return;
  }

  seen.set(sequence, index);
}

function detectTimeGap(
  datasetId: HistoricalDatasetId,
  previous: HistoricalCandle,
  current: HistoricalCandle,
  previousIndex: number,
  currentIndex: number,
  timeframeMilliseconds: number,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const expectedOpenTime =
    Number(previous.openTime) +
    timeframeMilliseconds;

  if (
    Number(current.openTime) >
    expectedOpenTime
  ) {
    issues.push(
      createIssue({
        code: "TIME_GAP",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" has a time gap`,
          `between indexes ${previousIndex} and ${currentIndex}.`,
          `Expected open time ${expectedOpenTime},`,
          `received ${current.openTime}.`,
        ].join(" "),
        datasetId,
        recordIndex: currentIndex,
        previousRecordIndex: previousIndex,
        timestamp: current.openTime,
        expectedTimestamp:
          expectedOpenTime as HistoricalTimestamp,
      }),
    );
  }
}

function detectTimeOverlap(
  datasetId: HistoricalDatasetId,
  previous: HistoricalCandle,
  current: HistoricalCandle,
  previousIndex: number,
  currentIndex: number,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  if (
    current.openTime <= previous.closeTime
  ) {
    issues.push(
      createIssue({
        code: "TIME_OVERLAP",
        severity: "ERROR",
        message: [
          `Historical dataset "${datasetId}" contains overlapping`,
          `candles at indexes ${previousIndex} and ${currentIndex}.`,
        ].join(" "),
        datasetId,
        recordIndex: currentIndex,
        previousRecordIndex: previousIndex,
        timestamp: current.openTime,
        expectedTimestamp:
          (
            Number(previous.closeTime) + 1
          ) as HistoricalTimestamp,
      }),
    );
  }
}

function validateCandleDuration(
  datasetId: HistoricalDatasetId,
  candle: HistoricalCandle,
  index: number,
  timeframeMilliseconds: number,
  issues: HistoricalDatasetIntegrityIssue[],
): void {
  const actualDuration =
    Number(candle.closeTime) -
    Number(candle.openTime) +
    1;

  if (
    actualDuration === timeframeMilliseconds
  ) {
    return;
  }

  issues.push(
    createIssue({
      code: "INVALID_CANDLE_DURATION",
      severity: "ERROR",
      message: [
        `Historical dataset "${datasetId}" candle at index`,
        `${index} has duration ${actualDuration}ms;`,
        `expected ${timeframeMilliseconds}ms.`,
      ].join(" "),
      datasetId,
      recordIndex: index,
      timestamp: candle.openTime,
    }),
  );
}

function validateDatasetChecksum(
  dataset: HistoricalDataset,
  candles: readonly HistoricalCandle[],
  options: NormalizedIntegrityValidationOptions,
  issues: HistoricalDatasetIntegrityIssue[],
):
  | Readonly<{
      readonly expected: HistoricalDatasetChecksum;
      readonly actual: HistoricalDatasetChecksum;
      readonly valid: boolean;
    }>
  | undefined {
  if (dataset.checksum === undefined) {
    if (options.requireChecksum) {
      issues.push(
        createIssue({
          code: "CHECKSUM_MISSING",
          severity: "ERROR",
          message: `Historical dataset "${dataset.id}" does not contain a checksum.`,
          datasetId: dataset.id,
        }),
      );
    }

    return undefined;
  }

  if (!options.verifyChecksum) {
    return undefined;
  }

  if (options.checksumService === undefined) {
    throw new TypeError(
      "A checksum service is required when checksum verification is enabled.",
    );
  }

  const verification =
    options.checksumService.verify({
      datasetId: dataset.id,
      candles,
      expectedChecksum: dataset.checksum,
    });

  if (!verification.valid) {
    issues.push(
      createIssue({
        code: "CHECKSUM_MISMATCH",
        severity: "ERROR",
        message: [
          `Historical dataset "${dataset.id}" checksum mismatch.`,
          `Expected ${verification.expected.value},`,
          `received ${verification.actual.value}.`,
        ].join(" "),
        datasetId: dataset.id,
      }),
    );
  }

  return Object.freeze({
    expected:
      cloneChecksum(verification.expected),

    actual:
      cloneChecksum(verification.actual),

    valid: verification.valid,
  });
}

function createIntegritySummary(
  issues: readonly HistoricalDatasetIntegrityIssue[],
): HistoricalDatasetIntegritySummary {
  let errors = 0;
  let warnings = 0;
  let informational = 0;

  let duplicateOpenTimes = 0;
  let duplicateSequences = 0;

  let timeGaps = 0;
  let sequenceGaps = 0;
  let overlaps = 0;

  for (const issue of issues) {
    switch (issue.severity) {
      case "ERROR":
        errors += 1;
        break;

      case "WARNING":
        warnings += 1;
        break;

      case "INFO":
        informational += 1;
        break;
    }

    switch (issue.code) {
      case "DUPLICATE_OPEN_TIME":
        duplicateOpenTimes += 1;
        break;

      case "DUPLICATE_SEQUENCE":
        duplicateSequences += 1;
        break;

      case "TIME_GAP":
        timeGaps += 1;
        break;

      case "SEQUENCE_GAP":
        sequenceGaps += 1;
        break;

      case "TIME_OVERLAP":
        overlaps += 1;
        break;
    }
  }

  return Object.freeze({
    totalIssues: issues.length,
    errors,
    warnings,
    informational,

    duplicateOpenTimes,
    duplicateSequences,

    timeGaps,
    sequenceGaps,
    overlaps,
  });
}

function createIssue(
  issue: HistoricalDatasetIntegrityIssue,
): HistoricalDatasetIntegrityIssue {
  return Object.freeze({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    datasetId: issue.datasetId,

    ...(issue.recordIndex === undefined
      ? {}
      : {
          recordIndex: issue.recordIndex,
        }),

    ...(issue.previousRecordIndex === undefined
      ? {}
      : {
          previousRecordIndex:
            issue.previousRecordIndex,
        }),

    ...(issue.timestamp === undefined
      ? {}
      : {
          timestamp: issue.timestamp,
        }),

    ...(issue.expectedTimestamp === undefined
      ? {}
      : {
          expectedTimestamp:
            issue.expectedTimestamp,
        }),

    ...(issue.sequence === undefined
      ? {}
      : {
          sequence: issue.sequence,
        }),

    ...(issue.expectedSequence === undefined
      ? {}
      : {
          expectedSequence:
            issue.expectedSequence,
        }),
  });
}

function cloneIssue(
  issue: HistoricalDatasetIntegrityIssue,
): HistoricalDatasetIntegrityIssue {
  return createIssue(issue);
}

function cloneChecksum(
  checksum: HistoricalDatasetChecksum,
): HistoricalDatasetChecksum {
  return Object.freeze({
    algorithm: checksum.algorithm,
    value: checksum.value,
    calculatedAt: checksum.calculatedAt,
    recordCount: historicalCount(
      Number(checksum.recordCount),
    ),
  });
}