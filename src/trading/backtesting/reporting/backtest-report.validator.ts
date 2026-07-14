import {
  BACKTEST_REPORT_SCHEMA_VERSION,
  BacktestReport,
  BacktestReportEnvelope,
  BacktestReportJsonValue,
} from "./backtest-report.types";

export interface BacktestReportValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly value?: unknown;
}

export interface BacktestReportValidationSuccess {
  readonly valid: true;
  readonly issues: readonly [];
}

export interface BacktestReportValidationFailure {
  readonly valid: false;
  readonly issues: readonly BacktestReportValidationIssue[];
}

export type BacktestReportValidationResult =
  | BacktestReportValidationSuccess
  | BacktestReportValidationFailure;

export class BacktestReportValidationError extends Error {
  public readonly issues: readonly BacktestReportValidationIssue[];

  public constructor(issues: readonly BacktestReportValidationIssue[]) {
    super(
      `Backtest report validation failed with ${issues.length} issue${
        issues.length === 1 ? "" : "s"
      }.`,
    );

    this.name = "BacktestReportValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

type UnknownRecord = Record<string, unknown>;

const REPORT_STATUSES = [
  "CREATED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

const EVENT_CATEGORIES = [
  "SESSION",
  "REPLAY",
  "STRATEGY",
  "SIGNAL",
  "RISK",
  "EXECUTION",
  "PORTFOLIO",
  "POSITION",
  "ANALYTICS",
  "REPORTING",
  "SYSTEM",
] as const;

const EVENT_SEVERITIES = ["DEBUG", "INFO", "WARNING", "ERROR"] as const;

export class BacktestReportValidator {
  public validateEnvelope(
    envelope: BacktestReportEnvelope,
  ): BacktestReportValidationResult {
    const issues: BacktestReportValidationIssue[] = [];

    if (!this.requireObject(envelope, "$", issues)) {
      return this.toResult(issues);
    }

    this.requireExact(
      envelope.schemaVersion,
      BACKTEST_REPORT_SCHEMA_VERSION,
      "$.schemaVersion",
      issues,
    );

    this.validateReportInternal(envelope.report, "$.report", issues);

    if (
      this.isObject(envelope.report) &&
      this.isObject(envelope.report.metadata) &&
      envelope.schemaVersion !== envelope.report.metadata.schemaVersion
    ) {
      this.addIssue(
        issues,
        "$.schemaVersion",
        "SCHEMA_VERSION_MISMATCH",
        "Envelope schemaVersion must match report metadata schemaVersion.",
        envelope.schemaVersion,
      );
    }

    return this.toResult(issues);
  }

  public validateReport(report: BacktestReport): BacktestReportValidationResult {
    const issues: BacktestReportValidationIssue[] = [];
    this.validateReportInternal(report, "$", issues);
    return this.toResult(issues);
  }

  public assertValidEnvelope(envelope: BacktestReportEnvelope): void {
    const result = this.validateEnvelope(envelope);

    if (!result.valid) {
      throw new BacktestReportValidationError(result.issues);
    }
  }

  public assertValidReport(report: BacktestReport): void {
    const result = this.validateReport(report);

    if (!result.valid) {
      throw new BacktestReportValidationError(result.issues);
    }
  }

  private validateReportInternal(
    report: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(report, path, issues)) {
      return;
    }

    this.validateIdentity(report.identity, `${path}.identity`, issues);
    this.validateMetadata(report.metadata, `${path}.metadata`, issues);
    this.validateConfiguration(
      report.configuration,
      `${path}.configuration`,
      issues,
    );
    this.validateSession(report.session, `${path}.session`, issues);
    this.validateProgress(report.progress, `${path}.progress`, issues);
    this.validateMetrics(report.metrics, `${path}.metrics`, issues);
    this.validateEvents(report.events, `${path}.events`, issues);
    this.validateEquityCurve(
      report.equityCurve,
      `${path}.equityCurve`,
      issues,
    );
    this.validatePerformanceAnalytics(
      report.performanceAnalytics,
      `${path}.performanceAnalytics`,
      issues,
    );
    this.validateTrades(report.trades, `${path}.trades`, issues);
    this.validateTradeAnalytics(
      report.tradeAnalytics,
      `${path}.tradeAnalytics`,
      issues,
    );
    this.validateDashboardSummary(
      report.dashboardSummary,
      `${path}.dashboardSummary`,
      issues,
    );

    this.validateConsistency(report, path, issues);
  }

  private validateIdentity(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    this.requireNonEmptyString(value.reportId, `${path}.reportId`, issues);
    this.requireNonEmptyString(value.backtestId, `${path}.backtestId`, issues);
    this.requireNonEmptyString(value.sessionId, `${path}.sessionId`, issues);
    this.requireNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
  }

  private validateMetadata(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    this.requireExact(
      value.schemaVersion,
      BACKTEST_REPORT_SCHEMA_VERSION,
      `${path}.schemaVersion`,
      issues,
    );
    this.requireExact(
      value.format,
      "QUANTUM_TRADE_AI_BACKTEST_REPORT",
      `${path}.format`,
      issues,
    );
    this.requireExact(value.exportFormat, "JSON", `${path}.exportFormat`, issues);
    this.requireEnum(value.status, REPORT_STATUSES, `${path}.status`, issues);
    this.requireIsoTimestamp(
      value.generatedAt,
      `${path}.generatedAt`,
      issues,
    );

    if (this.requireObject(value.producer, `${path}.producer`, issues)) {
      this.requireExact(
        value.producer.application,
        "QuantumTradeAI",
        `${path}.producer.application`,
        issues,
      );
      this.requireExact(
        value.producer.component,
        "BACKTEST_REPORTING",
        `${path}.producer.component`,
        issues,
      );
      this.requireNonEmptyString(
        value.producer.applicationVersion,
        `${path}.producer.applicationVersion`,
        issues,
      );
    }

    this.requireStringRecord(value.labels, `${path}.labels`, issues);
    this.requireJsonRecord(value.attributes, `${path}.attributes`, issues);
  }

  private validateConfiguration(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    this.requireNonEmptyStringArray(value.symbols, `${path}.symbols`, issues);
    this.requireUniqueStrings(value.symbols, `${path}.symbols`, issues);
    this.requireNonEmptyString(value.timeframe, `${path}.timeframe`, issues);

    this.requireIsoTimestamp(value.startTime, `${path}.startTime`, issues);
    this.requireIsoTimestamp(value.endTime, `${path}.endTime`, issues);
    this.requireTimestampOrder(
      value.startTime,
      value.endTime,
      `${path}.startTime`,
      `${path}.endTime`,
      issues,
    );

    this.requireNonNegativeFiniteNumber(
      value.initialCapital,
      `${path}.initialCapital`,
      issues,
    );
    this.requireNonEmptyString(
      value.baseCurrency,
      `${path}.baseCurrency`,
      issues,
    );
    this.requireNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.requireNonEmptyString(
      value.strategyName,
      `${path}.strategyName`,
      issues,
    );

    this.requireJsonRecord(
      value.strategyParameters,
      `${path}.strategyParameters`,
      issues,
    );
    this.requireJsonRecord(
      value.riskConfiguration,
      `${path}.riskConfiguration`,
      issues,
    );
    this.requireJsonRecord(
      value.executionConfiguration,
      `${path}.executionConfiguration`,
      issues,
    );
    this.requireJsonRecord(
      value.portfolioConfiguration,
      `${path}.portfolioConfiguration`,
      issues,
    );
    this.requireJsonRecord(
      value.additionalConfiguration,
      `${path}.additionalConfiguration`,
      issues,
    );
  }

  private validateSession(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    this.requireNonEmptyString(value.sessionId, `${path}.sessionId`, issues);
    this.requireEnum(value.status, REPORT_STATUSES, `${path}.status`, issues);
    this.requireIsoTimestamp(value.createdAt, `${path}.createdAt`, issues);
    this.requireNullableIsoTimestamp(
      value.startedAt,
      `${path}.startedAt`,
      issues,
    );
    this.requireNullableIsoTimestamp(
      value.completedAt,
      `${path}.completedAt`,
      issues,
    );
    this.requireNullableIsoTimestamp(
      value.failedAt,
      `${path}.failedAt`,
      issues,
    );
    this.requireNullableIsoTimestamp(
      value.currentTimestamp,
      `${path}.currentTimestamp`,
      issues,
    );
    this.requireNullableString(
      value.failureCode,
      `${path}.failureCode`,
      issues,
    );
    this.requireNullableString(
      value.failureMessage,
      `${path}.failureMessage`,
      issues,
    );
    this.requireNonNegativeInteger(
      value.processedCandleCount,
      `${path}.processedCandleCount`,
      issues,
    );
    this.requireNonNegativeInteger(
      value.processedEventCount,
      `${path}.processedEventCount`,
      issues,
    );

    this.requireOptionalTimestampOrder(
      value.createdAt,
      value.startedAt,
      `${path}.createdAt`,
      `${path}.startedAt`,
      issues,
    );
    this.requireOptionalTimestampOrder(
      value.startedAt,
      value.completedAt,
      `${path}.startedAt`,
      `${path}.completedAt`,
      issues,
    );
    this.requireOptionalTimestampOrder(
      value.startedAt,
      value.failedAt,
      `${path}.startedAt`,
      `${path}.failedAt`,
      issues,
    );

    if (value.status === "COMPLETED" && value.completedAt === null) {
      this.addIssue(
        issues,
        `${path}.completedAt`,
        "COMPLETED_TIMESTAMP_REQUIRED",
        "Completed sessions must include completedAt.",
        value.completedAt,
      );
    }

    if (value.status === "FAILED") {
      if (value.failedAt === null) {
        this.addIssue(
          issues,
          `${path}.failedAt`,
          "FAILED_TIMESTAMP_REQUIRED",
          "Failed sessions must include failedAt.",
          value.failedAt,
        );
      }

      if (
        typeof value.failureMessage !== "string" ||
        value.failureMessage.trim() === ""
      ) {
        this.addIssue(
          issues,
          `${path}.failureMessage`,
          "FAILURE_MESSAGE_REQUIRED",
          "Failed sessions must include a failure message.",
          value.failureMessage,
        );
      }
    }
  }

  private validateProgress(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    const integerFields = [
      "totalCandles",
      "processedCandles",
      "remainingCandles",
      "generatedSignalCount",
      "approvedRiskDecisionCount",
      "rejectedRiskDecisionCount",
      "skippedRiskDecisionCount",
      "executionCount",
      "completedTradeCount",
    ] as const;

    for (const field of integerFields) {
      this.requireNonNegativeInteger(value[field], `${path}.${field}`, issues);
    }

    this.requirePercentage(
      value.progressPercentage,
      `${path}.progressPercentage`,
      issues,
    );

    this.requireNullableIsoTimestamp(
      value.firstCandleTimestamp,
      `${path}.firstCandleTimestamp`,
      issues,
    );
    this.requireNullableIsoTimestamp(
      value.lastProcessedCandleTimestamp,
      `${path}.lastProcessedCandleTimestamp`,
      issues,
    );
    this.requireNullableIsoTimestamp(
      value.finalCandleTimestamp,
      `${path}.finalCandleTimestamp`,
      issues,
    );

    if (
      this.isNonNegativeInteger(value.totalCandles) &&
      this.isNonNegativeInteger(value.processedCandles) &&
      value.processedCandles > value.totalCandles
    ) {
      this.addIssue(
        issues,
        `${path}.processedCandles`,
        "PROCESSED_EXCEEDS_TOTAL",
        "processedCandles cannot exceed totalCandles.",
        value.processedCandles,
      );
    }

    if (
      this.isNonNegativeInteger(value.totalCandles) &&
      this.isNonNegativeInteger(value.processedCandles) &&
      this.isNonNegativeInteger(value.remainingCandles) &&
      value.processedCandles + value.remainingCandles !== value.totalCandles
    ) {
      this.addIssue(
        issues,
        `${path}.remainingCandles`,
        "CANDLE_COUNT_MISMATCH",
        "processedCandles plus remainingCandles must equal totalCandles.",
        value.remainingCandles,
      );
    }
  }

  private validateMetrics(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    const nullableMetrics = new Set([
      "profitFactor",
      "payoffRatio",
      "sharpeRatio",
      "sortinoRatio",
      "calmarRatio",
      "recoveryFactor",
    ]);

    for (const [key, fieldValue] of Object.entries(value)) {
      if (nullableMetrics.has(key)) {
        this.requireNullableFiniteNumber(
          fieldValue,
          `${path}.${key}`,
          issues,
        );
      } else {
        this.requireFiniteNumber(fieldValue, `${path}.${key}`, issues);
      }
    }

    this.validateTradeCounts(value, path, issues);
    this.requirePercentage(value.winRate, `${path}.winRate`, issues);
    this.requirePercentage(value.lossRate, `${path}.lossRate`, issues);
  }

  private validateEvents(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireArray(value, path, issues)) {
      return;
    }

    const sequences = new Set<number>();
    const ids = new Set<string>();
    let previousSequence: number | null = null;

    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (!this.requireObject(item, itemPath, issues)) {
        return;
      }

      this.requireNonNegativeInteger(
        item.sequence,
        `${itemPath}.sequence`,
        issues,
      );
      this.requireNonEmptyString(item.eventId, `${itemPath}.eventId`, issues);
      this.requireIsoTimestamp(item.timestamp, `${itemPath}.timestamp`, issues);
      this.requireEnum(
        item.category,
        EVENT_CATEGORIES,
        `${itemPath}.category`,
        issues,
      );
      this.requireEnum(
        item.severity,
        EVENT_SEVERITIES,
        `${itemPath}.severity`,
        issues,
      );
      this.requireNonEmptyString(
        item.eventType,
        `${itemPath}.eventType`,
        issues,
      );
      this.requireNullableString(item.symbol, `${itemPath}.symbol`, issues);
      this.requireNonEmptyString(item.message, `${itemPath}.message`, issues);
      this.requireJsonRecord(item.data, `${itemPath}.data`, issues);

      if (typeof item.sequence === "number" && Number.isInteger(item.sequence)) {
        if (sequences.has(item.sequence)) {
          this.addIssue(
            issues,
            `${itemPath}.sequence`,
            "DUPLICATE_EVENT_SEQUENCE",
            "Event sequence must be unique.",
            item.sequence,
          );
        }

        if (
          previousSequence !== null &&
          previousSequence >= item.sequence
        ) {
          this.addIssue(
            issues,
            `${itemPath}.sequence`,
            "EVENT_SEQUENCE_NOT_ASCENDING",
            "Event sequences must be strictly ascending.",
            item.sequence,
          );
        }

        sequences.add(item.sequence);
        previousSequence = item.sequence;
      }

      if (typeof item.eventId === "string") {
        if (ids.has(item.eventId)) {
          this.addIssue(
            issues,
            `${itemPath}.eventId`,
            "DUPLICATE_EVENT_ID",
            "Event IDs must be unique.",
            item.eventId,
          );
        }

        ids.add(item.eventId);
      }
    });
  }

  private validateEquityCurve(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireArray(value, path, issues)) {
      return;
    }

    const sequences = new Set<number>();
    let previousSequence: number | null = null;
    let previousTimestamp: string | null = null;

    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (!this.requireObject(item, itemPath, issues)) {
        return;
      }

      this.requireNonNegativeInteger(
        item.sequence,
        `${itemPath}.sequence`,
        issues,
      );
      this.requireIsoTimestamp(item.timestamp, `${itemPath}.timestamp`, issues);

      for (const [key, fieldValue] of Object.entries(item)) {
        if (key !== "sequence" && key !== "timestamp") {
          this.requireFiniteNumber(fieldValue, `${itemPath}.${key}`, issues);
        }
      }

      if (typeof item.sequence === "number" && Number.isInteger(item.sequence)) {
        if (sequences.has(item.sequence)) {
          this.addIssue(
            issues,
            `${itemPath}.sequence`,
            "DUPLICATE_EQUITY_SEQUENCE",
            "Equity curve sequence must be unique.",
            item.sequence,
          );
        }

        if (
          previousSequence !== null &&
          previousSequence >= item.sequence
        ) {
          this.addIssue(
            issues,
            `${itemPath}.sequence`,
            "EQUITY_SEQUENCE_NOT_ASCENDING",
            "Equity curve sequences must be strictly ascending.",
            item.sequence,
          );
        }

        sequences.add(item.sequence);
        previousSequence = item.sequence;
      }

      if (
        previousTimestamp !== null &&
        typeof item.timestamp === "string"
      ) {
        this.requireTimestampOrder(
          previousTimestamp,
          item.timestamp,
          `${path}[${index - 1}].timestamp`,
          `${itemPath}.timestamp`,
          issues,
          true,
        );
      }

      if (typeof item.timestamp === "string") {
        previousTimestamp = item.timestamp;
      }
    });
  }

  private validatePerformanceAnalytics(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    const nullableFields = [
      "annualizedReturn",
      "annualizedVolatility",
      "sharpeRatio",
      "sortinoRatio",
      "calmarRatio",
      "recoveryFactor",
    ];

    for (const [key, fieldValue] of Object.entries(value)) {
      if (key === "periodReturns" || key === "details") {
        continue;
      }

      if (nullableFields.includes(key)) {
        this.requireNullableFiniteNumber(
          fieldValue,
          `${path}.${key}`,
          issues,
        );
      } else {
        this.requireFiniteNumber(fieldValue, `${path}.${key}`, issues);
      }
    }

    this.requireJsonRecord(value.details, `${path}.details`, issues);

    if (!this.requireArray(value.periodReturns, `${path}.periodReturns`, issues)) {
      return;
    }

    value.periodReturns.forEach((item, index) => {
      const itemPath = `${path}.periodReturns[${index}]`;

      if (!this.requireObject(item, itemPath, issues)) {
        return;
      }

      this.requireNonNegativeInteger(
        item.sequence,
        `${itemPath}.sequence`,
        issues,
      );
      this.requireIsoTimestamp(
        item.startTimestamp,
        `${itemPath}.startTimestamp`,
        issues,
      );
      this.requireIsoTimestamp(
        item.endTimestamp,
        `${itemPath}.endTimestamp`,
        issues,
      );
      this.requireTimestampOrder(
        item.startTimestamp,
        item.endTimestamp,
        `${itemPath}.startTimestamp`,
        `${itemPath}.endTimestamp`,
        issues,
      );

      for (const key of [
        "startingEquity",
        "endingEquity",
        "absoluteReturn",
        "percentageReturn",
      ]) {
        this.requireFiniteNumber(item[key], `${itemPath}.${key}`, issues);
      }
    });
  }

  private validateTrades(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireArray(value, path, issues)) {
      return;
    }

    const sequences = new Set<number>();
    const ids = new Set<string>();
    let previousSequence: number | null = null;

    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (!this.requireObject(item, itemPath, issues)) {
        return;
      }

      this.requireNonNegativeInteger(
        item.sequence,
        `${itemPath}.sequence`,
        issues,
      );
      this.requireNonEmptyString(item.tradeId, `${itemPath}.tradeId`, issues);
      this.requireNonEmptyString(item.symbol, `${itemPath}.symbol`, issues);
      this.requireEnum(
        item.direction,
        ["LONG", "SHORT"],
        `${itemPath}.direction`,
        issues,
      );
      this.requireEnum(
        item.outcome,
        ["WIN", "LOSS", "BREAKEVEN"],
        `${itemPath}.outcome`,
        issues,
      );
      this.requireIsoTimestamp(item.openedAt, `${itemPath}.openedAt`, issues);
      this.requireIsoTimestamp(item.closedAt, `${itemPath}.closedAt`, issues);
      this.requireTimestampOrder(
        item.openedAt,
        item.closedAt,
        `${itemPath}.openedAt`,
        `${itemPath}.closedAt`,
        issues,
      );

      const numericFields = [
        "durationMilliseconds",
        "entryPrice",
        "exitPrice",
        "quantity",
        "notionalValue",
        "grossPnl",
        "netPnl",
        "returnPercentage",
        "entryFee",
        "exitFee",
        "totalFees",
        "entrySlippage",
        "exitSlippage",
        "totalSlippage",
      ];

      for (const key of numericFields) {
        this.requireFiniteNumber(item[key], `${itemPath}.${key}`, issues);
      }

      for (const key of [
        "signalId",
        "riskDecisionId",
        "entryExecutionId",
        "exitExecutionId",
      ]) {
        this.requireNullableString(item[key], `${itemPath}.${key}`, issues);
      }

      this.requireJsonRecord(item.metadata, `${itemPath}.metadata`, issues);

      if (typeof item.sequence === "number" && Number.isInteger(item.sequence)) {
        if (sequences.has(item.sequence)) {
          this.addIssue(
            issues,
            `${itemPath}.sequence`,
            "DUPLICATE_TRADE_SEQUENCE",
            "Trade sequence must be unique.",
            item.sequence,
          );
        }

        if (
          previousSequence !== null &&
          previousSequence >= item.sequence
        ) {
          this.addIssue(
            issues,
            `${itemPath}.sequence`,
            "TRADE_SEQUENCE_NOT_ASCENDING",
            "Trade sequences must be strictly ascending.",
            item.sequence,
          );
        }

        sequences.add(item.sequence);
        previousSequence = item.sequence;
      }

      if (typeof item.tradeId === "string") {
        if (ids.has(item.tradeId)) {
          this.addIssue(
            issues,
            `${itemPath}.tradeId`,
            "DUPLICATE_TRADE_ID",
            "Trade IDs must be unique.",
            item.tradeId,
          );
        }

        ids.add(item.tradeId);
      }
    });
  }

  private validateTradeAnalytics(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    for (const [key, fieldValue] of Object.entries(value)) {
      if (
        key === "symbolAnalytics" ||
        key === "directionAnalytics" ||
        key === "details"
      ) {
        this.requireJsonRecord(fieldValue, `${path}.${key}`, issues);
      } else if (key === "profitFactor" || key === "payoffRatio") {
        this.requireNullableFiniteNumber(
          fieldValue,
          `${path}.${key}`,
          issues,
        );
      } else {
        this.requireFiniteNumber(fieldValue, `${path}.${key}`, issues);
      }
    }

    this.validateTradeCounts(value, path, issues);
    this.requirePercentage(value.winRate, `${path}.winRate`, issues);
    this.requirePercentage(value.lossRate, `${path}.lossRate`, issues);

    if (
      this.isNonNegativeInteger(value.longTrades) &&
      this.isNonNegativeInteger(value.shortTrades) &&
      this.isNonNegativeInteger(value.totalTrades) &&
      value.longTrades + value.shortTrades !== value.totalTrades
    ) {
      this.addIssue(
        issues,
        `${path}.longTrades`,
        "DIRECTION_TRADE_COUNT_MISMATCH",
        "longTrades plus shortTrades must equal totalTrades.",
        value.longTrades,
      );
    }
  }

  private validateDashboardSummary(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    for (const key of [
      "reportId",
      "backtestId",
      "sessionId",
      "strategyId",
      "strategyName",
      "timeframe",
    ]) {
      this.requireNonEmptyString(value[key], `${path}.${key}`, issues);
    }

    this.requireNonEmptyStringArray(value.symbols, `${path}.symbols`, issues);
    this.requireEnum(value.status, REPORT_STATUSES, `${path}.status`, issues);
    this.requireIsoTimestamp(value.startTime, `${path}.startTime`, issues);
    this.requireIsoTimestamp(value.endTime, `${path}.endTime`, issues);
    this.requireIsoTimestamp(
      value.generatedAt,
      `${path}.generatedAt`,
      issues,
    );
    this.requireTimestampOrder(
      value.startTime,
      value.endTime,
      `${path}.startTime`,
      `${path}.endTime`,
      issues,
    );

    for (const key of [
      "initialEquity",
      "finalEquity",
      "netProfit",
      "netReturnPercentage",
      "maximumDrawdownPercentage",
      "totalTrades",
      "winRate",
    ]) {
      this.requireFiniteNumber(value[key], `${path}.${key}`, issues);
    }

    for (const key of ["profitFactor", "sharpeRatio", "sortinoRatio"]) {
      this.requireNullableFiniteNumber(
        value[key],
        `${path}.${key}`,
        issues,
      );
    }

    this.requireNonNegativeInteger(
      value.totalTrades,
      `${path}.totalTrades`,
      issues,
    );
    this.requirePercentage(value.winRate, `${path}.winRate`, issues);
  }

  private validateConsistency(
    report: UnknownRecord,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (
      !this.isObject(report.identity) ||
      !this.isObject(report.metadata) ||
      !this.isObject(report.configuration) ||
      !this.isObject(report.session) ||
      !this.isObject(report.progress) ||
      !this.isObject(report.metrics) ||
      !this.isObject(report.tradeAnalytics) ||
      !this.isObject(report.dashboardSummary) ||
      !Array.isArray(report.trades)
    ) {
      return;
    }

    const checks: ReadonlyArray<{
      left: unknown;
      right: unknown;
      path: string;
      code: string;
      message: string;
    }> = [
      {
        left: report.identity.sessionId,
        right: report.session.sessionId,
        path: `${path}.identity.sessionId`,
        code: "SESSION_ID_MISMATCH",
        message: "Identity sessionId must match session sessionId.",
      },
      {
        left: report.identity.strategyId,
        right: report.configuration.strategyId,
        path: `${path}.identity.strategyId`,
        code: "STRATEGY_ID_MISMATCH",
        message: "Identity strategyId must match configuration strategyId.",
      },
      {
        left: report.metadata.status,
        right: report.session.status,
        path: `${path}.metadata.status`,
        code: "STATUS_MISMATCH",
        message: "Metadata status must match session status.",
      },
      {
        left: report.progress.processedCandles,
        right: report.session.processedCandleCount,
        path: `${path}.progress.processedCandles`,
        code: "PROCESSED_CANDLE_COUNT_MISMATCH",
        message:
          "Progress processedCandles must match session processedCandleCount.",
      },
      {
        left: report.progress.completedTradeCount,
        right: report.trades.length,
        path: `${path}.progress.completedTradeCount`,
        code: "COMPLETED_TRADE_COUNT_MISMATCH",
        message:
          "Progress completedTradeCount must match exported trade count.",
      },
      {
        left: report.metrics.totalTrades,
        right: report.trades.length,
        path: `${path}.metrics.totalTrades`,
        code: "METRIC_TRADE_COUNT_MISMATCH",
        message: "Metrics totalTrades must match exported trade count.",
      },
      {
        left: report.tradeAnalytics.totalTrades,
        right: report.trades.length,
        path: `${path}.tradeAnalytics.totalTrades`,
        code: "ANALYTICS_TRADE_COUNT_MISMATCH",
        message: "Trade analytics totalTrades must match exported trade count.",
      },
      {
        left: report.dashboardSummary.reportId,
        right: report.identity.reportId,
        path: `${path}.dashboardSummary.reportId`,
        code: "SUMMARY_REPORT_ID_MISMATCH",
        message: "Dashboard reportId must match identity reportId.",
      },
      {
        left: report.dashboardSummary.backtestId,
        right: report.identity.backtestId,
        path: `${path}.dashboardSummary.backtestId`,
        code: "SUMMARY_BACKTEST_ID_MISMATCH",
        message: "Dashboard backtestId must match identity backtestId.",
      },
      {
        left: report.dashboardSummary.sessionId,
        right: report.identity.sessionId,
        path: `${path}.dashboardSummary.sessionId`,
        code: "SUMMARY_SESSION_ID_MISMATCH",
        message: "Dashboard sessionId must match identity sessionId.",
      },
      {
        left: report.dashboardSummary.strategyId,
        right: report.identity.strategyId,
        path: `${path}.dashboardSummary.strategyId`,
        code: "SUMMARY_STRATEGY_ID_MISMATCH",
        message: "Dashboard strategyId must match identity strategyId.",
      },
      {
        left: report.dashboardSummary.generatedAt,
        right: report.metadata.generatedAt,
        path: `${path}.dashboardSummary.generatedAt`,
        code: "SUMMARY_GENERATED_AT_MISMATCH",
        message: "Dashboard generatedAt must match metadata generatedAt.",
      },
      {
        left: report.dashboardSummary.totalTrades,
        right: report.metrics.totalTrades,
        path: `${path}.dashboardSummary.totalTrades`,
        code: "SUMMARY_TRADE_COUNT_MISMATCH",
        message: "Dashboard totalTrades must match metrics totalTrades.",
      },
    ];

    for (const check of checks) {
      if (check.left !== check.right) {
        this.addIssue(
          issues,
          check.path,
          check.code,
          check.message,
          check.left,
        );
      }
    }
  }

  private validateTradeCounts(
    value: UnknownRecord,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    for (const key of [
      "totalTrades",
      "winningTrades",
      "losingTrades",
      "breakevenTrades",
    ]) {
      this.requireNonNegativeInteger(value[key], `${path}.${key}`, issues);
    }

    if (
      this.isNonNegativeInteger(value.totalTrades) &&
      this.isNonNegativeInteger(value.winningTrades) &&
      this.isNonNegativeInteger(value.losingTrades) &&
      this.isNonNegativeInteger(value.breakevenTrades) &&
      value.winningTrades + value.losingTrades + value.breakevenTrades !==
        value.totalTrades
    ) {
      this.addIssue(
        issues,
        `${path}.totalTrades`,
        "TRADE_COUNT_MISMATCH",
        "winningTrades, losingTrades, and breakevenTrades must sum to totalTrades.",
        value.totalTrades,
      );
    }
  }

  private requireObject(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): value is UnknownRecord {
    if (!this.isObject(value)) {
      this.addIssue(
        issues,
        path,
        "EXPECTED_OBJECT",
        "Value must be a non-null object.",
        value,
      );
      return false;
    }

    return true;
  }

  private requireArray(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): value is unknown[] {
    if (!Array.isArray(value)) {
      this.addIssue(
        issues,
        path,
        "EXPECTED_ARRAY",
        "Value must be an array.",
        value,
      );
      return false;
    }

    return true;
  }

  private requireNonEmptyString(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (typeof value !== "string" || value.trim() === "") {
      this.addIssue(
        issues,
        path,
        "EXPECTED_NON_EMPTY_STRING",
        "Value must be a non-empty string.",
        value,
      );
    }
  }

  private requireNullableString(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (value !== null && typeof value !== "string") {
      this.addIssue(
        issues,
        path,
        "EXPECTED_NULLABLE_STRING",
        "Value must be a string or null.",
        value,
      );
    }
  }

  private requireFiniteNumber(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.addIssue(
        issues,
        path,
        "EXPECTED_FINITE_NUMBER",
        "Value must be a finite number.",
        value,
      );
    }
  }

  private requireNullableFiniteNumber(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      this.addIssue(
        issues,
        path,
        "EXPECTED_NULLABLE_FINITE_NUMBER",
        "Value must be a finite number or null.",
        value,
      );
    }
  }

  private requireNonNegativeFiniteNumber(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    this.requireFiniteNumber(value, path, issues);

    if (typeof value === "number" && Number.isFinite(value) && value < 0) {
      this.addIssue(
        issues,
        path,
        "EXPECTED_NON_NEGATIVE_NUMBER",
        "Value must be greater than or equal to zero.",
        value,
      );
    }
  }

  private requireNonNegativeInteger(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.isNonNegativeInteger(value)) {
      this.addIssue(
        issues,
        path,
        "EXPECTED_NON_NEGATIVE_INTEGER",
        "Value must be a non-negative integer.",
        value,
      );
    }
  }

  private requirePercentage(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    this.requireFiniteNumber(value, path, issues);

    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (value < 0 || value > 100)
    ) {
      this.addIssue(
        issues,
        path,
        "PERCENTAGE_OUT_OF_RANGE",
        "Percentage must be between 0 and 100.",
        value,
      );
    }
  }

  private requireIsoTimestamp(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (typeof value !== "string" || !this.isCanonicalIsoTimestamp(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_ISO_TIMESTAMP",
        "Value must be a canonical ISO-8601 timestamp.",
        value,
      );
    }
  }

  private requireNullableIsoTimestamp(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (value !== null) {
      this.requireIsoTimestamp(value, path, issues);
    }
  }

  private requireTimestampOrder(
    start: unknown,
    end: unknown,
    startPath: string,
    endPath: string,
    issues: BacktestReportValidationIssue[],
    allowEqual = false,
  ): void {
    if (
      typeof start !== "string" ||
      typeof end !== "string" ||
      !this.isCanonicalIsoTimestamp(start) ||
      !this.isCanonicalIsoTimestamp(end)
    ) {
      return;
    }

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    const invalid = allowEqual ? startMs > endMs : startMs >= endMs;

    if (invalid) {
      this.addIssue(
        issues,
        endPath,
        "INVALID_TIMESTAMP_ORDER",
        allowEqual
          ? `${endPath} must not be earlier than ${startPath}.`
          : `${endPath} must be later than ${startPath}.`,
        end,
      );
    }
  }

  private requireOptionalTimestampOrder(
    start: unknown,
    end: unknown,
    startPath: string,
    endPath: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (start !== null && end !== null) {
      this.requireTimestampOrder(
        start,
        end,
        startPath,
        endPath,
        issues,
        true,
      );
    }
  }

  private requireEnum(
    value: unknown,
    allowed: readonly string[],
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (typeof value !== "string" || !allowed.includes(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_ENUM_VALUE",
        `Value must be one of: ${allowed.join(", ")}.`,
        value,
      );
    }
  }

  private requireExact(
    value: unknown,
    expected: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (value !== expected) {
      this.addIssue(
        issues,
        path,
        "UNEXPECTED_VALUE",
        `Value must equal ${String(expected)}.`,
        value,
      );
    }
  }

  private requireStringRecord(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (typeof nestedValue !== "string") {
        this.addIssue(
          issues,
          `${path}.${key}`,
          "EXPECTED_STRING",
          "Record values must be strings.",
          nestedValue,
        );
      }
    }
  }

  private requireJsonRecord(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireObject(value, path, issues)) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      this.requireJsonValue(nestedValue, `${path}.${key}`, issues);
    }
  }

  private requireJsonValue(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): value is BacktestReportJsonValue {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return true;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        this.addIssue(
          issues,
          path,
          "NON_FINITE_JSON_NUMBER",
          "JSON numeric values must be finite.",
          value,
        );
        return false;
      }

      return true;
    }

    if (Array.isArray(value)) {
      let valid = true;

      value.forEach((item, index) => {
        if (!this.requireJsonValue(item, `${path}[${index}]`, issues)) {
          valid = false;
        }
      });

      return valid;
    }

    if (this.isObject(value)) {
      let valid = true;

      for (const [key, nestedValue] of Object.entries(value)) {
        if (!this.requireJsonValue(nestedValue, `${path}.${key}`, issues)) {
          valid = false;
        }
      }

      return valid;
    }

    this.addIssue(
      issues,
      path,
      "INVALID_JSON_VALUE",
      "Value is not deterministically JSON serializable.",
      value,
    );

    return false;
  }

  private requireNonEmptyStringArray(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!this.requireArray(value, path, issues)) {
      return;
    }

    if (value.length === 0) {
      this.addIssue(
        issues,
        path,
        "EMPTY_ARRAY",
        "Array must contain at least one item.",
        value,
      );
    }

    value.forEach((item, index) => {
      this.requireNonEmptyString(item, `${path}[${index}]`, issues);
    });
  }

  private requireUniqueStrings(
    value: unknown,
    path: string,
    issues: BacktestReportValidationIssue[],
  ): void {
    if (!Array.isArray(value)) {
      return;
    }

    const seen = new Set<string>();

    value.forEach((item, index) => {
      if (typeof item !== "string") {
        return;
      }

      if (seen.has(item)) {
        this.addIssue(
          issues,
          `${path}[${index}]`,
          "DUPLICATE_VALUE",
          "Duplicate string values are not allowed.",
          item,
        );
      }

      seen.add(item);
    });
  }

  private isObject(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0
    );
  }

  private isCanonicalIsoTimestamp(value: string): boolean {
    const timestamp = Date.parse(value);

    if (!Number.isFinite(timestamp)) {
      return false;
    }

    return new Date(timestamp).toISOString() === value;
  }

  private addIssue(
    issues: BacktestReportValidationIssue[],
    path: string,
    code: string,
    message: string,
    value?: unknown,
  ): void {
    issues.push(
      Object.freeze({
        path,
        code,
        message,
        ...(value === undefined ? {} : { value }),
      }),
    );
  }

  private toResult(
    issues: readonly BacktestReportValidationIssue[],
  ): BacktestReportValidationResult {
    if (issues.length === 0) {
      const success: BacktestReportValidationSuccess = {
        valid: true,
        issues: [],
      };

      return Object.freeze(success);
    }

    const failure: BacktestReportValidationFailure = {
      valid: false,
      issues: Object.freeze([...issues]),
    };

    return Object.freeze(failure);
  }
}