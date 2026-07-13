import type {
  BacktestEquityPoint,
} from "../equity";

import type {
  BacktestDrawdownPeriod,
  BacktestDrawdownStatistics,
  BacktestPerformanceAnalyticsEngine,
  BacktestPerformanceAnalyticsOptions,
  BacktestPerformanceRatios,
  BacktestPerformanceReport,
  BacktestPerformanceSummary,
  BacktestPeriodReturn,
  BacktestReturnStatistics,
  NormalizedBacktestPerformanceAnalyticsOptions,
} from "./backtest-performance-analytics.types";

export class DeterministicBacktestPerformanceAnalytics
  implements BacktestPerformanceAnalyticsEngine
{
  private readonly configuration:
    NormalizedBacktestPerformanceAnalyticsOptions;

  private report:
    BacktestPerformanceReport | undefined;

  public constructor(
    options:
      BacktestPerformanceAnalyticsOptions = {},
  ) {
    this.configuration =
      this.normalizeOptions(options);
  }

  public analyze(
    equityPoints: readonly BacktestEquityPoint[],
    generatedAt: number,
  ): BacktestPerformanceReport {
    this.validateGeneratedAt(generatedAt);
    this.validateEquityPoints(equityPoints);

    const clonedPoints =
      this.cloneEquityPoints(equityPoints);

    const periodReturns =
      this.calculatePeriodReturns(clonedPoints);

    const returnStatistics =
      this.calculateReturnStatistics(
        clonedPoints,
        periodReturns,
      );

    const drawdownPeriods =
      this.calculateDrawdownPeriods(clonedPoints);

    const drawdownStatistics =
      this.calculateDrawdownStatistics(
        clonedPoints,
        drawdownPeriods,
      );

    const ratios =
      this.calculatePerformanceRatios(
        clonedPoints,
        returnStatistics,
        drawdownStatistics,
      );

    const summary =
      this.createSummary(
        clonedPoints,
        returnStatistics,
        drawdownStatistics,
        ratios,
      );

    this.report = Object.freeze({
      generatedAt,
      configuration: this.configuration,
      equityPoints: clonedPoints,
      periodReturns,
      drawdownPeriods,
      summary,
    });

    return this.report;
  }

  public getReport():
    BacktestPerformanceReport | undefined {
    return this.report;
  }

  public getPeriodReturns():
    readonly BacktestPeriodReturn[] {
    return (
      this.report?.periodReturns ??
      Object.freeze([])
    );
  }

  public getDrawdownPeriods():
    readonly BacktestDrawdownPeriod[] {
    return (
      this.report?.drawdownPeriods ??
      Object.freeze([])
    );
  }

  public getSummary():
    BacktestPerformanceSummary | undefined {
    return this.report?.summary;
  }

  public reset(): void {
    this.report = undefined;
  }

  private calculatePeriodReturns(
    points: readonly BacktestEquityPoint[],
  ): readonly BacktestPeriodReturn[] {
    const returns: BacktestPeriodReturn[] = [];

    for (
      let index = 1;
      index < points.length;
      index += 1
    ) {
      const previous = points[index - 1];
      const current = points[index];

      if (
        previous === undefined ||
        current === undefined
      ) {
        throw new Error(
          "Backtest equity points are unexpectedly incomplete.",
        );
      }

      const absoluteReturn =
        current.equity - previous.equity;

      const returnRate =
        previous.equity === 0
          ? 0
          : absoluteReturn / previous.equity;

      returns.push(
        Object.freeze({
          sequence: returns.length + 1,

          fromPointSequence:
            previous.sequence,

          toPointSequence:
            current.sequence,

          fromTimestamp:
            previous.timestamp,

          toTimestamp:
            current.timestamp,

          fromCandleIndex:
            previous.candleIndex,

          toCandleIndex:
            current.candleIndex,

          startingEquity:
            previous.equity,

          endingEquity:
            current.equity,

          absoluteReturn,
          returnRate,
        }),
      );
    }

    return Object.freeze(returns);
  }

  private calculateReturnStatistics(
    points: readonly BacktestEquityPoint[],
    periodReturns:
      readonly BacktestPeriodReturn[],
  ): BacktestReturnStatistics {
    if (periodReturns.length === 0) {
      return Object.freeze({
        observations: 0,

        positiveReturns: 0,
        negativeReturns: 0,
        zeroReturns: 0,

        cumulativeReturn: 0,
        arithmeticMeanReturn: 0,
        geometricMeanReturn: 0,

        minimumReturn: 0,
        maximumReturn: 0,

        variance: 0,
        standardDeviation: 0,

        downsideVariance: 0,
        downsideDeviation: 0,
      });
    }

    const values =
      periodReturns.map(
        (period) => period.returnRate,
      );

    const positiveReturns =
      values.filter(
        (value) => value > 0,
      ).length;

    const negativeReturns =
      values.filter(
        (value) => value < 0,
      ).length;

    const zeroReturns =
      values.length -
      positiveReturns -
      negativeReturns;

    const sum =
      values.reduce(
        (total, value) =>
          total + value,
        0,
      );

    const arithmeticMeanReturn =
      sum / values.length;

    const minimumReturn =
      Math.min(...values);

    const maximumReturn =
      Math.max(...values);

    const variance =
      values.reduce(
        (total, value) => {
          const difference =
            value -
            arithmeticMeanReturn;

          return (
            total +
            difference * difference
          );
        },
        0,
      ) / values.length;

    const standardDeviation =
      Math.sqrt(variance);

    const downsideDifferences =
      values.map((value) =>
        Math.min(
          value -
            this.configuration
              .minimumAcceptableReturn,
          0,
        ),
      );

    const downsideVariance =
      downsideDifferences.reduce(
        (total, value) =>
          total + value * value,
        0,
      ) / values.length;

    const downsideDeviation =
      Math.sqrt(downsideVariance);

    const firstPoint = points[0];
    const lastPoint =
      points.at(-1);

    if (
      firstPoint === undefined ||
      lastPoint === undefined
    ) {
      throw new Error(
        "Backtest equity points are unexpectedly empty.",
      );
    }

    const cumulativeReturn =
      firstPoint.equity === 0
        ? 0
        : (
            lastPoint.equity -
            firstPoint.equity
          ) / firstPoint.equity;

    const geometricGrowth =
      values.reduce(
        (product, value) =>
          product * (1 + value),
        1,
      );

    const geometricMeanReturn =
      geometricGrowth <= 0
        ? -1
        : Math.pow(
            geometricGrowth,
            1 / values.length,
          ) - 1;

    return Object.freeze({
      observations:
        values.length,

      positiveReturns,
      negativeReturns,
      zeroReturns,

      cumulativeReturn,
      arithmeticMeanReturn,
      geometricMeanReturn,

      minimumReturn,
      maximumReturn,

      variance,
      standardDeviation,

      downsideVariance,
      downsideDeviation,
    });
  }

  private calculateDrawdownPeriods(
    points: readonly BacktestEquityPoint[],
  ): readonly BacktestDrawdownPeriod[] {
    if (points.length === 0) {
      return Object.freeze([]);
    }

    const periods: BacktestDrawdownPeriod[] = [];

    let peakPoint = points[0];

    let activePeak:
      BacktestEquityPoint | undefined;

    let troughPoint:
      BacktestEquityPoint | undefined;

    for (
      let index = 1;
      index < points.length;
      index += 1
    ) {
      const point = points[index];

      if (
        point === undefined ||
        peakPoint === undefined
      ) {
        throw new Error(
          "Backtest equity points are unexpectedly incomplete.",
        );
      }

      if (point.equity >= peakPoint.equity) {
        if (
          activePeak !== undefined &&
          troughPoint !== undefined
        ) {
          periods.push(
            this.createDrawdownPeriod(
              periods.length + 1,
              activePeak,
              troughPoint,
              point,
            ),
          );
        }

        peakPoint = point;
        activePeak = undefined;
        troughPoint = undefined;

        continue;
      }

      if (activePeak === undefined) {
        activePeak = peakPoint;
        troughPoint = point;
        continue;
      }

      if (
        troughPoint === undefined ||
        point.equity < troughPoint.equity
      ) {
        troughPoint = point;
      }
    }

    if (
      activePeak !== undefined &&
      troughPoint !== undefined
    ) {
      periods.push(
        this.createDrawdownPeriod(
          periods.length + 1,
          activePeak,
          troughPoint,
        ),
      );
    }

    return Object.freeze(periods);
  }

  private createDrawdownPeriod(
    sequence: number,
    peakPoint: BacktestEquityPoint,
    troughPoint: BacktestEquityPoint,
    recoveryPoint?: BacktestEquityPoint,
  ): BacktestDrawdownPeriod {
    const drawdownAmount =
      peakPoint.equity -
      troughPoint.equity;

    const drawdownRate =
      peakPoint.equity === 0
        ? 0
        : drawdownAmount /
          peakPoint.equity;

    const endingSequence =
      recoveryPoint?.sequence ??
      troughPoint.sequence;

    return Object.freeze({
      sequence,

      peakPointSequence:
        peakPoint.sequence,

      troughPointSequence:
        troughPoint.sequence,

      recoveryPointSequence:
        recoveryPoint?.sequence,

      peakTimestamp:
        peakPoint.timestamp,

      troughTimestamp:
        troughPoint.timestamp,

      recoveryTimestamp:
        recoveryPoint?.timestamp,

      peakCandleIndex:
        peakPoint.candleIndex,

      troughCandleIndex:
        troughPoint.candleIndex,

      recoveryCandleIndex:
        recoveryPoint?.candleIndex,

      peakEquity:
        peakPoint.equity,

      troughEquity:
        troughPoint.equity,

      drawdownAmount,
      drawdownRate,

      durationObservations:
        endingSequence -
        peakPoint.sequence,

      recovered:
        recoveryPoint !== undefined,
    });
  }

  private calculateDrawdownStatistics(
    points: readonly BacktestEquityPoint[],
    periods:
      readonly BacktestDrawdownPeriod[],
  ): BacktestDrawdownStatistics {
    if (periods.length === 0) {
      return Object.freeze({
        periods: 0,
        recoveredPeriods: 0,
        activePeriods: 0,

        maximumDrawdownAmount: 0,
        maximumDrawdownRate: 0,

        averageDrawdownAmount: 0,
        averageDrawdownRate: 0,

        longestDrawdownObservations: 0,

        currentDrawdownAmount: 0,
        currentDrawdownRate: 0,
      });
    }

    const maximumDrawdownAmount =
      Math.max(
        ...periods.map(
          (period) =>
            period.drawdownAmount,
        ),
      );

    const maximumDrawdownRate =
      Math.max(
        ...periods.map(
          (period) =>
            period.drawdownRate,
        ),
      );

    const averageDrawdownAmount =
      periods.reduce(
        (total, period) =>
          total +
          period.drawdownAmount,
        0,
      ) / periods.length;

    const averageDrawdownRate =
      periods.reduce(
        (total, period) =>
          total +
          period.drawdownRate,
        0,
      ) / periods.length;

    const longestDrawdownObservations =
      Math.max(
        ...periods.map(
          (period) =>
            period.durationObservations,
        ),
      );

    const recoveredPeriods =
      periods.filter(
        (period) =>
          period.recovered,
      ).length;

    const activePeriods =
      periods.length -
      recoveredPeriods;

    const latestPoint =
      points.at(-1);

    if (latestPoint === undefined) {
      throw new Error(
        "Backtest equity points are unexpectedly empty.",
      );
    }

    const currentPeak =
      points.reduce(
        (highest, point) =>
          point.equity >
          highest.equity
            ? point
            : highest,
        points[0],
      );

    if (currentPeak === undefined) {
      throw new Error(
        "Backtest equity peak could not be determined.",
      );
    }

    const currentDrawdownAmount =
      currentPeak.equity -
      latestPoint.equity;

    const currentDrawdownRate =
      currentPeak.equity === 0
        ? 0
        : currentDrawdownAmount /
          currentPeak.equity;

    return Object.freeze({
      periods:
        periods.length,

      recoveredPeriods,
      activePeriods,

      maximumDrawdownAmount,
      maximumDrawdownRate,

      averageDrawdownAmount,
      averageDrawdownRate,

      longestDrawdownObservations,

      currentDrawdownAmount,
      currentDrawdownRate,
    });
  }

  private calculatePerformanceRatios(
    points: readonly BacktestEquityPoint[],
    returnStatistics:
      BacktestReturnStatistics,
    drawdownStatistics:
      BacktestDrawdownStatistics,
  ): BacktestPerformanceRatios {
    const periods =
      returnStatistics.observations;

    if (periods === 0) {
      return Object.freeze({
        annualizedReturn: 0,
        annualizedVolatility: 0,
        sharpeRatio: null,
        sortinoRatio: null,
        calmarRatio: null,
        recoveryFactor: null,
      });
    }

    const annualizedReturn =
      Math.pow(
        1 +
          returnStatistics
            .geometricMeanReturn,
        this.configuration
          .periodsPerYear,
      ) - 1;

    const annualizedVolatility =
      returnStatistics
        .standardDeviation *
      Math.sqrt(
        this.configuration
          .periodsPerYear,
      );

    const periodicRiskFreeRate =
      this.configuration
        .riskFreeRate /
      this.configuration
        .periodsPerYear;

    const excessPeriodicReturn =
      returnStatistics
        .arithmeticMeanReturn -
      periodicRiskFreeRate;

    const sharpeRatio =
      returnStatistics
        .standardDeviation === 0
        ? null
        : (
            excessPeriodicReturn /
            returnStatistics
              .standardDeviation
          ) *
          Math.sqrt(
            this.configuration
              .periodsPerYear,
          );

    const sortinoRatio =
      returnStatistics
        .downsideDeviation === 0
        ? null
        : (
            returnStatistics
              .arithmeticMeanReturn -
            this.configuration
              .minimumAcceptableReturn
          ) /
          returnStatistics
            .downsideDeviation *
          Math.sqrt(
            this.configuration
              .periodsPerYear,
          );

    const calmarRatio =
      drawdownStatistics
        .maximumDrawdownRate === 0
        ? null
        : annualizedReturn /
          drawdownStatistics
            .maximumDrawdownRate;

    const firstPoint = points[0];
    const lastPoint =
      points.at(-1);

    if (
      firstPoint === undefined ||
      lastPoint === undefined
    ) {
      throw new Error(
        "Backtest equity points are unexpectedly empty.",
      );
    }

    const absoluteReturn =
      lastPoint.equity -
      firstPoint.equity;

    const recoveryFactor =
      drawdownStatistics
        .maximumDrawdownAmount === 0
        ? null
        : absoluteReturn /
          drawdownStatistics
            .maximumDrawdownAmount;

    return Object.freeze({
      annualizedReturn,
      annualizedVolatility,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      recoveryFactor,
    });
  }

  private createSummary(
    points: readonly BacktestEquityPoint[],
    returnStatistics:
      BacktestReturnStatistics,
    drawdownStatistics:
      BacktestDrawdownStatistics,
    ratios:
      BacktestPerformanceRatios,
  ): BacktestPerformanceSummary {
    const firstPoint = points[0];
    const lastPoint =
      points.at(-1);

    if (
      firstPoint === undefined ||
      lastPoint === undefined
    ) {
      throw new Error(
        "Backtest equity points are unexpectedly empty.",
      );
    }

    const peakEquity =
      Math.max(
        ...points.map(
          (point) =>
            point.equity,
        ),
      );

    const minimumEquity =
      Math.min(
        ...points.map(
          (point) =>
            point.equity,
        ),
      );

    const absoluteReturn =
      lastPoint.equity -
      firstPoint.equity;

    const totalReturnRate =
      firstPoint.equity === 0
        ? 0
        : absoluteReturn /
          firstPoint.equity;

    return Object.freeze({
      initialEquity:
        firstPoint.equity,

      finalEquity:
        lastPoint.equity,

      absoluteReturn,
      totalReturnRate,

      peakEquity,
      minimumEquity,

      profitablePeriods:
        returnStatistics
          .positiveReturns,

      losingPeriods:
        returnStatistics
          .negativeReturns,

      unchangedPeriods:
        returnStatistics
          .zeroReturns,

      returnStatistics,
      drawdownStatistics,
      ratios,
    });
  }

  private validateEquityPoints(
    points: readonly BacktestEquityPoint[],
  ): void {
    if (!Array.isArray(points)) {
      throw new Error(
        "Backtest performance analytics equity points must be an array.",
      );
    }

    if (points.length === 0) {
      throw new Error(
        "Backtest performance analytics requires at least one equity point.",
      );
    }

    let previousSequence = 0;
    let previousTimestamp:
      number | null = null;

    let previousCandleIndex:
      number | null = null;

    for (const point of points) {
      if (
        point === null ||
        typeof point !== "object"
      ) {
        throw new Error(
          "Backtest performance analytics equity point must be an object.",
        );
      }

      if (
        !Number.isSafeInteger(
          point.sequence,
        ) ||
        point.sequence !==
          previousSequence + 1
      ) {
        throw new Error(
          "Backtest performance analytics equity point sequence must be contiguous.",
        );
      }

      if (
        !Number.isSafeInteger(
          point.timestamp,
        ) ||
        point.timestamp < 0
      ) {
        throw new Error(
          "Backtest performance analytics equity timestamp must be a non-negative safe integer.",
        );
      }

      if (
        previousTimestamp !== null &&
        point.timestamp <
          previousTimestamp
      ) {
        throw new Error(
          "Backtest performance analytics equity timestamps cannot move backwards.",
        );
      }

      if (
        !Number.isSafeInteger(
          point.candleIndex,
        ) ||
        point.candleIndex < -1
      ) {
        throw new Error(
          "Backtest performance analytics candle index is invalid.",
        );
      }

      if (
        previousCandleIndex !== null &&
        point.candleIndex <
          previousCandleIndex
      ) {
        throw new Error(
          "Backtest performance analytics candle order cannot move backwards.",
        );
      }

      this.assertFiniteNumber(
        point.equity,
        "Backtest equity",
      );

      if (point.equity < 0) {
        throw new Error(
          "Backtest performance analytics equity cannot be negative.",
        );
      }

      previousSequence =
        point.sequence;

      previousTimestamp =
        point.timestamp;

      previousCandleIndex =
        point.candleIndex;
    }
  }

  private cloneEquityPoints(
    points: readonly BacktestEquityPoint[],
  ): readonly BacktestEquityPoint[] {
    return Object.freeze(
      points.map((point) =>
        Object.freeze({
          ...point,
          portfolioSnapshot:
            Object.freeze({
              ...point.portfolioSnapshot,
            }),
        }),
      ),
    );
  }

  private normalizeOptions(
    options:
      BacktestPerformanceAnalyticsOptions,
  ): NormalizedBacktestPerformanceAnalyticsOptions {
    if (
      options === null ||
      typeof options !== "object"
    ) {
      throw new Error(
        "Backtest performance analytics options must be an object.",
      );
    }

    const periodsPerYear =
      options.periodsPerYear ??
      252;

    const riskFreeRate =
      options.riskFreeRate ??
      0;

    const minimumAcceptableReturn =
      options.minimumAcceptableReturn ??
      0;

    if (
      !Number.isSafeInteger(
        periodsPerYear,
      ) ||
      periodsPerYear <= 0
    ) {
      throw new Error(
        "Backtest analytics periods per year must be a positive safe integer.",
      );
    }

    this.assertFiniteNumber(
      riskFreeRate,
      "Backtest analytics risk-free rate",
    );

    this.assertFiniteNumber(
      minimumAcceptableReturn,
      "Backtest analytics minimum acceptable return",
    );

    return Object.freeze({
      periodsPerYear,
      riskFreeRate,
      minimumAcceptableReturn,
    });
  }

  private validateGeneratedAt(
    generatedAt: number,
  ): void {
    if (
      !Number.isSafeInteger(
        generatedAt,
      ) ||
      generatedAt < 0
    ) {
      throw new Error(
        "Backtest analytics generatedAt must be a non-negative safe integer.",
      );
    }
  }

  private assertFiniteNumber(
    value: number,
    label: string,
  ): void {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${label} must be a finite number.`,
      );
    }
  }
}