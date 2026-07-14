import assert from "node:assert/strict";

import {
  BACKTEST_REPORT_SCHEMA_VERSION,
  BacktestReport,
  BacktestReportValidationError,
  DeterministicBacktestReportExportError,
  DeterministicBacktestReportExporter,
  DeterministicJsonSerializationError,
  DeterministicJsonSerializer,
  ImmutableBacktestReportModel,
} from "./backtesting/reporting";

function createValidReport(
  overrides: Partial<BacktestReport> = {},
): BacktestReport {
  const report: BacktestReport = {
    identity: {
      reportId: "report-001",
      backtestId: "backtest-001",
      sessionId: "session-001",
      strategyId: "strategy-ema-cross",
    },

    metadata: {
      schemaVersion: BACKTEST_REPORT_SCHEMA_VERSION,
      format: "QUANTUM_TRADE_AI_BACKTEST_REPORT",
      exportFormat: "JSON",
      producer: {
        application: "QuantumTradeAI",
        component: "BACKTEST_REPORTING",
        applicationVersion: "1.0.0",
      },
      status: "COMPLETED",
      generatedAt: "2026-07-14T20:00:00.000Z",
      labels: {
        environment: "test",
      },
      attributes: {
        deterministic: true,
        seed: 42,
      },
    },

    configuration: {
      symbols: ["BTCUSDT"],
      timeframe: "1h",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-02T00:00:00.000Z",
      initialCapital: 10_000,
      baseCurrency: "USDT",
      strategyId: "strategy-ema-cross",
      strategyName: "EMA Crossover",
      strategyParameters: {
        fastPeriod: 9,
        slowPeriod: 21,
      },
      riskConfiguration: {
        riskPerTrade: 0.01,
      },
      executionConfiguration: {
        tradingFeeRate: 0.001,
      },
      portfolioConfiguration: {
        allowShort: false,
      },
      additionalConfiguration: {},
    },

    session: {
      sessionId: "session-001",
      status: "COMPLETED",
      createdAt: "2026-07-14T19:00:00.000Z",
      startedAt: "2026-07-14T19:00:01.000Z",
      completedAt: "2026-07-14T20:00:00.000Z",
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      currentTimestamp: "2026-01-02T00:00:00.000Z",
      processedCandleCount: 2,
      processedEventCount: 2,
    },

    progress: {
      totalCandles: 2,
      processedCandles: 2,
      remainingCandles: 0,
      progressPercentage: 100,
      firstCandleTimestamp: "2026-01-01T00:00:00.000Z",
      lastProcessedCandleTimestamp: "2026-01-02T00:00:00.000Z",
      finalCandleTimestamp: "2026-01-02T00:00:00.000Z",
      generatedSignalCount: 1,
      approvedRiskDecisionCount: 1,
      rejectedRiskDecisionCount: 0,
      skippedRiskDecisionCount: 0,
      executionCount: 2,
      completedTradeCount: 1,
    },

    metrics: {
      initialEquity: 10_000,
      finalEquity: 10_099.7,
      peakEquity: 10_099.7,
      lowestEquity: 10_000,
      netProfit: 99.7,
      netReturn: 0.00997,
      netReturnPercentage: 0.997,
      maximumDrawdown: 0,
      maximumDrawdownPercentage: 0,
      totalTrades: 1,
      winningTrades: 1,
      losingTrades: 0,
      breakevenTrades: 0,
      winRate: 100,
      lossRate: 0,
      grossProfit: 100,
      grossLoss: 0,
      profitFactor: null,
      expectancy: 99.7,
      payoffRatio: null,
      sharpeRatio: 1.25,
      sortinoRatio: 1.5,
      calmarRatio: null,
      recoveryFactor: null,
      totalFees: 0.3,
      totalSlippage: 0,
    },

    events: [
      {
        sequence: 0,
        eventId: "event-001",
        timestamp: "2026-01-01T00:00:00.000Z",
        category: "SESSION",
        severity: "INFO",
        eventType: "BACKTEST_STARTED",
        symbol: null,
        message: "Backtest started.",
        data: {
          sessionId: "session-001",
        },
      },
      {
        sequence: 1,
        eventId: "event-002",
        timestamp: "2026-01-02T00:00:00.000Z",
        category: "SESSION",
        severity: "INFO",
        eventType: "BACKTEST_COMPLETED",
        symbol: null,
        message: "Backtest completed.",
        data: {
          tradeCount: 1,
        },
      },
    ],

    equityCurve: [
      {
        sequence: 0,
        timestamp: "2026-01-01T00:00:00.000Z",
        cash: 10_000,
        realizedPnl: 0,
        unrealizedPnl: 0,
        fees: 0,
        grossExposure: 0,
        netExposure: 0,
        equity: 10_000,
        peakEquity: 10_000,
        drawdown: 0,
        drawdownPercentage: 0,
      },
      {
        sequence: 1,
        timestamp: "2026-01-02T00:00:00.000Z",
        cash: 10_099.7,
        realizedPnl: 100,
        unrealizedPnl: 0,
        fees: 0.3,
        grossExposure: 0,
        netExposure: 0,
        equity: 10_099.7,
        peakEquity: 10_099.7,
        drawdown: 0,
        drawdownPercentage: 0,
      },
    ],

    performanceAnalytics: {
      totalReturn: 99.7,
      totalReturnPercentage: 0.997,
      annualizedReturn: null,
      annualizedVolatility: null,
      maximumDrawdown: 0,
      maximumDrawdownPercentage: 0,
      sharpeRatio: 1.25,
      sortinoRatio: 1.5,
      calmarRatio: null,
      recoveryFactor: null,
      periodReturns: [
        {
          sequence: 0,
          startTimestamp: "2026-01-01T00:00:00.000Z",
          endTimestamp: "2026-01-02T00:00:00.000Z",
          startingEquity: 10_000,
          endingEquity: 10_099.7,
          absoluteReturn: 99.7,
          percentageReturn: 0.997,
        },
      ],
      details: {
        returnCount: 1,
      },
    },

    trades: [
      {
        sequence: 0,
        tradeId: "trade-001",
        symbol: "BTCUSDT",
        direction: "LONG",
        outcome: "WIN",
        openedAt: "2026-01-01T01:00:00.000Z",
        closedAt: "2026-01-01T02:00:00.000Z",
        durationMilliseconds: 3_600_000,
        entryPrice: 100,
        exitPrice: 101,
        quantity: 100,
        notionalValue: 10_000,
        grossPnl: 100,
        netPnl: 99.7,
        returnPercentage: 0.997,
        entryFee: 0.1,
        exitFee: 0.2,
        totalFees: 0.3,
        entrySlippage: 0,
        exitSlippage: 0,
        totalSlippage: 0,
        signalId: "signal-001",
        riskDecisionId: "risk-001",
        entryExecutionId: "execution-entry-001",
        exitExecutionId: "execution-exit-001",
        metadata: {
          strategy: "EMA Crossover",
        },
      },
    ],

    tradeAnalytics: {
      totalTrades: 1,
      winningTrades: 1,
      losingTrades: 0,
      breakevenTrades: 0,
      longTrades: 1,
      shortTrades: 0,
      winRate: 100,
      lossRate: 0,
      grossProfit: 100,
      grossLoss: 0,
      netProfit: 99.7,
      averageWinningTrade: 99.7,
      averageLosingTrade: 0,
      largestWinningTrade: 99.7,
      largestLosingTrade: 0,
      profitFactor: null,
      expectancy: 99.7,
      payoffRatio: null,
      averageTradeDurationMilliseconds: 3_600_000,
      longestTradeDurationMilliseconds: 3_600_000,
      shortestTradeDurationMilliseconds: 3_600_000,
      maximumConsecutiveWins: 1,
      maximumConsecutiveLosses: 0,
      symbolAnalytics: {
        BTCUSDT: {
          totalTrades: 1,
          netProfit: 99.7,
        },
      },
      directionAnalytics: {
        LONG: {
          totalTrades: 1,
          netProfit: 99.7,
        },
      },
      details: {
        analyzedTradeCount: 1,
      },
    },

    dashboardSummary: {
      reportId: "report-001",
      backtestId: "backtest-001",
      sessionId: "session-001",
      strategyId: "strategy-ema-cross",
      strategyName: "EMA Crossover",
      symbols: ["BTCUSDT"],
      timeframe: "1h",
      status: "COMPLETED",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-02T00:00:00.000Z",
      generatedAt: "2026-07-14T20:00:00.000Z",
      initialEquity: 10_000,
      finalEquity: 10_099.7,
      netProfit: 99.7,
      netReturnPercentage: 0.997,
      maximumDrawdownPercentage: 0,
      totalTrades: 1,
      winRate: 100,
      profitFactor: null,
      sharpeRatio: 1.25,
      sortinoRatio: 1.5,
    },
  };

  return {
    ...report,
    ...overrides,
  };
}

function testValidationAndImmutability(): void {
  const sourceReport = createValidReport();
  const model = new ImmutableBacktestReportModel({
    report: sourceReport,
  });

  assert.equal(model.isValid(), true);
  assert.equal(model.isDeeplyFrozen(), true);
  assert.equal(model.reportId, "report-001");
  assert.equal(model.schemaVersion, BACKTEST_REPORT_SCHEMA_VERSION);

  assert.notEqual(model.report, sourceReport);
  assert.notEqual(model.report.identity, sourceReport.identity);
  assert.notEqual(model.report.trades, sourceReport.trades);

  (
  sourceReport.identity as {
    reportId: string;
  }
).reportId = "mutated-source-report";

  assert.equal(model.report.identity.reportId, "report-001");

  assert.throws(() => {
    (model.report.identity as { reportId: string }).reportId =
      "mutated-frozen-report";
  }, TypeError);

  assert.equal(model.report.identity.reportId, "report-001");
}

function testInvalidReportValidation(): void {
  const invalidReport = createValidReport({
    progress: {
      ...createValidReport().progress,
      processedCandles: 3,
      remainingCandles: 0,
    },
  });

  assert.throws(
    () =>
      new ImmutableBacktestReportModel({
        report: invalidReport,
      }),
    BacktestReportValidationError,
  );
}

function testDeterministicSerialization(): void {
  const serializer = new DeterministicJsonSerializer({
    indentation: 0,
    validateBeforeSerialize: false,
  });

  const first = serializer.serializeJsonValue({
    z: 1,
    a: {
      c: 3,
      b: 2,
    },
    values: [3, 2, 1],
  });

  const second = serializer.serializeJsonValue({
    values: [3, 2, 1],
    a: {
      b: 2,
      c: 3,
    },
    z: 1,
  });

  assert.equal(first, second);
  assert.equal(
    first,
    '{"a":{"b":2,"c":3},"values":[3,2,1],"z":1}',
  );

  assert.equal(
    serializer.serializeJsonValue({
      value: -0,
    }),
    '{"value":0}',
  );

  assert.throws(
    () =>
      serializer.serializeJsonValue({
        value: Number.NaN,
      }),
    DeterministicJsonSerializationError,
  );
}

function testExporter(): void {
  const report = createValidReport();

  const exporter = new DeterministicBacktestReportExporter({
    report,
    serializerOptions: {
      indentation: 2,
      trailingNewline: true,
    },
  });

  const firstExport = exporter.export();
  const secondExport = exporter.export();

  assert.deepEqual(firstExport, secondExport);
  assert.equal(firstExport.reportId, "report-001");
  assert.equal(firstExport.backtestId, "backtest-001");
  assert.equal(firstExport.sessionId, "session-001");
  assert.equal(firstExport.schemaVersion, BACKTEST_REPORT_SCHEMA_VERSION);
  assert.equal(firstExport.mimeType, "application/json");
  assert.equal(firstExport.encoding, "utf-8");
  assert.equal(firstExport.content.endsWith("\n"), true);
  assert.equal(
    firstExport.byteLength,
    Buffer.byteLength(firstExport.content, "utf8"),
  );
  assert.equal(
    firstExport.fileName,
    "quantumtradeai-backtest-report-backtest-001-session-001-2026-07-14_20-00-00Z.json",
  );

  const parsed = JSON.parse(firstExport.content) as {
    schemaVersion: string;
    report: BacktestReport;
  };

  assert.equal(parsed.schemaVersion, BACKTEST_REPORT_SCHEMA_VERSION);
  assert.equal(parsed.report.identity.reportId, "report-001");

  const customExport = exporter.export({
    fileName: "Institutional Backtest Result.JSON",
  });

  assert.equal(
    customExport.fileName,
    "institutional-backtest-result.json",
  );
}

function testResetAndRollback(): void {
  const exporter = new DeterministicBacktestReportExporter({
    report: createValidReport(),
  });

  const replacement = createValidReport({
    identity: {
      reportId: "report-002",
      backtestId: "backtest-002",
      sessionId: "session-002",
      strategyId: "strategy-ema-cross",
    },
    session: {
      ...createValidReport().session,
      sessionId: "session-002",
    },
    dashboardSummary: {
      ...createValidReport().dashboardSummary,
      reportId: "report-002",
      backtestId: "backtest-002",
      sessionId: "session-002",
    },
  });

  exporter.reset(replacement);

  assert.equal(exporter.report.identity.reportId, "report-002");
  assert.equal(exporter.report.identity.backtestId, "backtest-002");
  assert.equal(exporter.report.identity.sessionId, "session-002");

  const invalidReplacement = createValidReport({
    identity: {
      reportId: "report-invalid",
      backtestId: "backtest-invalid",
      sessionId: "session-invalid",
      strategyId: "strategy-ema-cross",
    },
  });

  assert.throws(() => exporter.reset(invalidReplacement));

  assert.equal(exporter.report.identity.reportId, "report-002");
  assert.equal(exporter.report.identity.backtestId, "backtest-002");
  assert.equal(exporter.report.identity.sessionId, "session-002");
}

function testExporterErrorWrapping(): void {
  const exporter = new DeterministicBacktestReportExporter({
    report: createValidReport(),
  });

  assert.throws(
    () =>
      exporter.export({
        fileName: "   ",
      }),
    DeterministicBacktestReportExportError,
  );
}

function run(): void {
  testValidationAndImmutability();
  testInvalidReportValidation();
  testDeterministicSerialization();
  testExporter();
  testResetAndRollback();
  testExporterErrorWrapping();

  console.log(
    "All deterministic backtest reporting tests passed successfully.",
  );
}

run();