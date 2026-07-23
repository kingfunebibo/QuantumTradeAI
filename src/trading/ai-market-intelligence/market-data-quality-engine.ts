/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-data-quality-engine.ts
 *
 * Deterministic, immutable market-data quality assessment.
 */

import {
  DurationMs,
  MarketCandle,
  MarketDataProvenance,
  MarketDataQuality,
  MarketDataQualityAssessment,
  MarketIntelligenceInput,
  NormalizedScore,
  OrderBookSnapshot,
  Percentage,
  TimestampMs,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const DEFAULT_ROUNDING_DECIMALS = 12;

export interface MarketDataQualityEngineConfiguration {
  readonly maximumAgeMs: DurationMs;
  readonly futureTimestampToleranceMs: DurationMs;
  readonly expectedCandleCount?: number;
  readonly minimumCandleCount: number;
  readonly minimumTradeCount: number;
  readonly minimumOrderBookCount: number;
  readonly maximumDuplicateRate: Percentage;
  readonly maximumMissingValueRate: Percentage;
  readonly maximumOrderingViolationRate: Percentage;
  readonly maximumConsistencyViolationRate: Percentage;
  readonly excellentScoreThreshold: NormalizedScore;
  readonly goodScoreThreshold: NormalizedScore;
  readonly degradedScoreThreshold: NormalizedScore;
  readonly poorScoreThreshold: NormalizedScore;
  readonly completenessWeight: number;
  readonly freshnessWeight: number;
  readonly consistencyWeight: number;
  readonly orderingWeight: number;
  readonly rejectFutureData: boolean;
  readonly compareSuppliedAssessment: boolean;
  readonly suppliedAssessmentTolerance: NormalizedScore;
  readonly deterministicRoundingDecimals: number;
}

export type MarketDataQualityAssessableInput = Omit<
  MarketIntelligenceInput,
  "qualityAssessment"
> & {
  readonly qualityAssessment?: MarketDataQualityAssessment;
};

export interface MarketDataQualityDiagnostics {
  readonly assessment: MarketDataQualityAssessment;
  readonly observationCount: number;
  readonly duplicateCount: number;
  readonly missingValueCount: number;
  readonly checkedValueCount: number;
  readonly orderingViolationCount: number;
  readonly orderingComparisonCount: number;
  readonly consistencyViolationCount: number;
  readonly consistencyCheckCount: number;
  readonly latestEventTimeMs?: TimestampMs;
  readonly oldestEventTimeMs?: TimestampMs;
  readonly futureObservationCount: number;
  readonly suppliedAssessmentDifference?: number;
  readonly warnings: readonly string[];
}

export interface MarketDataQualityEngine {
  assess(
    input: MarketDataQualityAssessableInput,
    analysisTimeMs?: TimestampMs,
  ): MarketDataQualityAssessment;

  diagnose(
    input: MarketDataQualityAssessableInput,
    analysisTimeMs?: TimestampMs,
  ): MarketDataQualityDiagnostics;
}

interface MutableCounters {
  observationCount: number;
  duplicateCount: number;
  missingValueCount: number;
  checkedValueCount: number;
  orderingViolationCount: number;
  orderingComparisonCount: number;
  consistencyViolationCount: number;
  consistencyCheckCount: number;
  futureObservationCount: number;
}

interface TimedObservation {
  readonly key: string;
  readonly eventTimeMs: number;
  readonly sequenceNumber?: number;
  readonly provenance: MarketDataProvenance;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalized(
  value: number,
  decimals: number,
): NormalizedScore {
  return round(clamp(value, 0, 1), decimals) as NormalizedScore;
}

function percentage(value: number, decimals: number): Percentage {
  return round(clamp(value, 0, 1), decimals) as Percentage;
}

function duration(value: number): DurationMs {
  return Math.max(0, Math.round(value)) as DurationMs;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function countNumber(
  value: unknown,
  counters: MutableCounters,
  options: {
    readonly required?: boolean;
    readonly minimum?: number;
    readonly strictlyPositive?: boolean;
  } = {},
): boolean {
  counters.checkedValueCount += 1;

  if (!isFiniteNumber(value)) {
    if (options.required !== false) {
      counters.missingValueCount += 1;
    }
    return false;
  }

  if (
    (options.minimum !== undefined && value < options.minimum) ||
    (options.strictlyPositive === true && value <= 0)
  ) {
    counters.consistencyViolationCount += 1;
    counters.consistencyCheckCount += 1;
    return false;
  }

  if (
    options.minimum !== undefined ||
    options.strictlyPositive === true
  ) {
    counters.consistencyCheckCount += 1;
  }

  return true;
}

function provenanceKey(provenance: MarketDataProvenance): string {
  return [
    provenance.sourceId,
    provenance.sourceType,
    String(provenance.venueId ?? ""),
    String(provenance.datasetVersion ?? ""),
    String(provenance.eventTimeMs),
    String(provenance.sequenceNumber ?? ""),
    String(provenance.checksum ?? ""),
  ].join("|");
}

function candleKey(candle: MarketCandle): string {
  return [
    "CANDLE",
    String(candle.openTimeMs),
    String(candle.closeTimeMs),
    String(candle.open),
    String(candle.high),
    String(candle.low),
    String(candle.close),
    String(candle.volume),
    provenanceKey(candle.provenance),
  ].join("|");
}

function orderBookKey(book: OrderBookSnapshot): string {
  const bids = book.bids
    .map((level) => `${String(level.price)}:${String(level.quantity)}`)
    .join(",");
  const asks = book.asks
    .map((level) => `${String(level.price)}:${String(level.quantity)}`)
    .join(",");

  return [
    "BOOK",
    String(book.eventTimeMs),
    String(book.sequenceNumber ?? ""),
    bids,
    asks,
    provenanceKey(book.provenance),
  ].join("|");
}

function classifyQuality(
  overallScore: number,
  configuration: MarketDataQualityEngineConfiguration,
): MarketDataQuality {
  if (overallScore >= Number(configuration.excellentScoreThreshold)) {
    return MarketDataQuality.EXCELLENT;
  }

  if (overallScore >= Number(configuration.goodScoreThreshold)) {
    return MarketDataQuality.GOOD;
  }

  if (overallScore >= Number(configuration.degradedScoreThreshold)) {
    return MarketDataQuality.DEGRADED;
  }

  if (overallScore >= Number(configuration.poorScoreThreshold)) {
    return MarketDataQuality.POOR;
  }

  return MarketDataQuality.UNUSABLE;
}

function validateConfiguration(
  configuration: MarketDataQualityEngineConfiguration,
): void {
  const thresholdValues = [
    Number(configuration.excellentScoreThreshold),
    Number(configuration.goodScoreThreshold),
    Number(configuration.degradedScoreThreshold),
    Number(configuration.poorScoreThreshold),
  ];

  if (
    thresholdValues.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    throw new Error("Market-data quality thresholds must be within [0, 1].");
  }

  if (
    !(
      thresholdValues[0]! >= thresholdValues[1]! &&
      thresholdValues[1]! >= thresholdValues[2]! &&
      thresholdValues[2]! >= thresholdValues[3]!
    )
  ) {
    throw new Error(
      "Market-data quality thresholds must be monotonically descending.",
    );
  }

  const weights = [
    configuration.completenessWeight,
    configuration.freshnessWeight,
    configuration.consistencyWeight,
    configuration.orderingWeight,
  ];

  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Market-data quality weights must be finite and non-negative.");
  }

  if (weights.reduce((total, weight) => total + weight, 0) <= EPSILON) {
    throw new Error("At least one market-data quality weight must be positive.");
  }

  if (
    Number(configuration.maximumAgeMs) < 0 ||
    Number(configuration.futureTimestampToleranceMs) < 0
  ) {
    throw new Error("Market-data quality durations cannot be negative.");
  }

  if (
    configuration.minimumCandleCount < 0 ||
    configuration.minimumTradeCount < 0 ||
    configuration.minimumOrderBookCount < 0
  ) {
    throw new Error("Minimum observation counts cannot be negative.");
  }
}

function collectTimedObservations(
  input: MarketDataQualityAssessableInput,
): readonly TimedObservation[] {
  const observations: TimedObservation[] = [];

  for (const candle of input.candles) {
    observations.push({
      key: candleKey(candle),
      eventTimeMs: Number(candle.closeTimeMs),
      sequenceNumber:
        candle.provenance.sequenceNumber === undefined
          ? undefined
          : Number(candle.provenance.sequenceNumber),
      provenance: candle.provenance,
    });
  }

  for (const trade of input.trades ?? []) {
    observations.push({
      key: [
        "TRADE",
        trade.tradeId,
        String(trade.eventTimeMs),
        String(trade.price),
        String(trade.quantity),
        provenanceKey(trade.provenance),
      ].join("|"),
      eventTimeMs: Number(trade.eventTimeMs),
      sequenceNumber:
        trade.provenance.sequenceNumber === undefined
          ? undefined
          : Number(trade.provenance.sequenceNumber),
      provenance: trade.provenance,
    });
  }

  for (const book of input.orderBooks ?? []) {
    observations.push({
      key: orderBookKey(book),
      eventTimeMs: Number(book.eventTimeMs),
      sequenceNumber:
        book.sequenceNumber === undefined
          ? book.provenance.sequenceNumber === undefined
            ? undefined
            : Number(book.provenance.sequenceNumber)
          : Number(book.sequenceNumber),
      provenance: book.provenance,
    });
  }

  for (const item of input.fundingRates ?? []) {
    observations.push({
      key: [
        "FUNDING",
        String(item.eventTimeMs),
        String(item.fundingRate),
        provenanceKey(item.provenance),
      ].join("|"),
      eventTimeMs: Number(item.eventTimeMs),
      sequenceNumber:
        item.provenance.sequenceNumber === undefined
          ? undefined
          : Number(item.provenance.sequenceNumber),
      provenance: item.provenance,
    });
  }

  for (const item of input.openInterest ?? []) {
    observations.push({
      key: [
        "OPEN_INTEREST",
        String(item.eventTimeMs),
        String(item.openInterest),
        provenanceKey(item.provenance),
      ].join("|"),
      eventTimeMs: Number(item.eventTimeMs),
      sequenceNumber:
        item.provenance.sequenceNumber === undefined
          ? undefined
          : Number(item.provenance.sequenceNumber),
      provenance: item.provenance,
    });
  }

  for (const item of input.liquidations ?? []) {
    observations.push({
      key: [
        "LIQUIDATION",
        String(item.eventTimeMs),
        String(item.longLiquidationNotional),
        String(item.shortLiquidationNotional),
        provenanceKey(item.provenance),
      ].join("|"),
      eventTimeMs: Number(item.eventTimeMs),
      sequenceNumber:
        item.provenance.sequenceNumber === undefined
          ? undefined
          : Number(item.provenance.sequenceNumber),
      provenance: item.provenance,
    });
  }

  for (const item of input.marketBreadth ?? []) {
    observations.push({
      key: [
        "BREADTH",
        String(item.eventTimeMs),
        String(item.advancingAssets),
        String(item.decliningAssets),
        String(item.unchangedAssets),
        provenanceKey(item.provenance),
      ].join("|"),
      eventTimeMs: Number(item.eventTimeMs),
      sequenceNumber:
        item.provenance.sequenceNumber === undefined
          ? undefined
          : Number(item.provenance.sequenceNumber),
      provenance: item.provenance,
    });
  }

  return observations;
}

function assessCandles(
  candles: readonly MarketCandle[],
  counters: MutableCounters,
): void {
  let previousOpenTime: number | undefined;
  let previousCloseTime: number | undefined;

  for (const candle of candles) {
    const openTime = Number(candle.openTimeMs);
    const closeTime = Number(candle.closeTimeMs);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volume = Number(candle.volume);

    countNumber(openTime, counters, { minimum: 0 });
    countNumber(closeTime, counters, { minimum: 0 });
    countNumber(open, counters, { strictlyPositive: true });
    countNumber(high, counters, { strictlyPositive: true });
    countNumber(low, counters, { strictlyPositive: true });
    countNumber(close, counters, { strictlyPositive: true });
    countNumber(volume, counters, { minimum: 0 });

    if (candle.quoteVolume !== undefined) {
      countNumber(Number(candle.quoteVolume), counters, { minimum: 0 });
    }

    if (candle.tradeCount !== undefined) {
      countNumber(candle.tradeCount, counters, { minimum: 0 });
    }

    counters.consistencyCheckCount += 5;

    if (closeTime < openTime) {
      counters.consistencyViolationCount += 1;
    }

    if (high < low) {
      counters.consistencyViolationCount += 1;
    }

    if (high < Math.max(open, close)) {
      counters.consistencyViolationCount += 1;
    }

    if (low > Math.min(open, close)) {
      counters.consistencyViolationCount += 1;
    }

    if (volume < 0) {
      counters.consistencyViolationCount += 1;
    }

    if (previousOpenTime !== undefined) {
      counters.orderingComparisonCount += 1;
      if (openTime < previousOpenTime) {
        counters.orderingViolationCount += 1;
      }
    }

    if (previousCloseTime !== undefined) {
      counters.orderingComparisonCount += 1;
      if (closeTime < previousCloseTime) {
        counters.orderingViolationCount += 1;
      }
    }

    previousOpenTime = openTime;
    previousCloseTime = closeTime;
  }
}

function assessTrades(
  input: MarketDataQualityAssessableInput,
  counters: MutableCounters,
): void {
  let previousEventTime: number | undefined;

  for (const trade of input.trades ?? []) {
    const eventTime = Number(trade.eventTimeMs);

    countNumber(eventTime, counters, { minimum: 0 });
    countNumber(Number(trade.price), counters, { strictlyPositive: true });
    countNumber(Number(trade.quantity), counters, { strictlyPositive: true });
    countNumber(Number(trade.notional), counters, { minimum: 0 });

    counters.consistencyCheckCount += 1;
    if (
      Math.abs(
        Number(trade.notional) -
          Number(trade.price) * Number(trade.quantity),
      ) >
      Math.max(1e-8, Math.abs(Number(trade.notional)) * 1e-6)
    ) {
      counters.consistencyViolationCount += 1;
    }

    if (previousEventTime !== undefined) {
      counters.orderingComparisonCount += 1;
      if (eventTime < previousEventTime) {
        counters.orderingViolationCount += 1;
      }
    }

    previousEventTime = eventTime;
  }
}

function isSortedDescending(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index]! > values[index - 1]!) {
      return false;
    }
  }

  return true;
}

function isSortedAscending(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index]! < values[index - 1]!) {
      return false;
    }
  }

  return true;
}

function assessOrderBooks(
  input: MarketDataQualityAssessableInput,
  counters: MutableCounters,
): void {
  let previousEventTime: number | undefined;
  let previousSequence: number | undefined;

  for (const book of input.orderBooks ?? []) {
    const eventTime = Number(book.eventTimeMs);
    countNumber(eventTime, counters, { minimum: 0 });

    const bidPrices = book.bids.map((level) => Number(level.price));
    const askPrices = book.asks.map((level) => Number(level.price));

    for (const level of [...book.bids, ...book.asks]) {
      countNumber(Number(level.price), counters, { strictlyPositive: true });
      countNumber(Number(level.quantity), counters, { minimum: 0 });

      if (level.orderCount !== undefined) {
        countNumber(level.orderCount, counters, { minimum: 0 });
      }
    }

    counters.consistencyCheckCount += 4;

    if (!isSortedDescending(bidPrices)) {
      counters.consistencyViolationCount += 1;
    }

    if (!isSortedAscending(askPrices)) {
      counters.consistencyViolationCount += 1;
    }

    const bestBid =
      book.bestBid === undefined
        ? bidPrices[0]
        : Number(book.bestBid);
    const bestAsk =
      book.bestAsk === undefined
        ? askPrices[0]
        : Number(book.bestAsk);

    if (
      bestBid !== undefined &&
      bestAsk !== undefined &&
      bestBid >= bestAsk
    ) {
      counters.consistencyViolationCount += 1;
    }

    if (
      book.spread !== undefined &&
      bestBid !== undefined &&
      bestAsk !== undefined &&
      Math.abs(Number(book.spread) - (bestAsk - bestBid)) >
        Math.max(1e-8, Math.abs(Number(book.spread)) * 1e-6)
    ) {
      counters.consistencyViolationCount += 1;
    }

    if (previousEventTime !== undefined) {
      counters.orderingComparisonCount += 1;
      if (eventTime < previousEventTime) {
        counters.orderingViolationCount += 1;
      }
    }

    const sequence =
      book.sequenceNumber === undefined
        ? undefined
        : Number(book.sequenceNumber);

    if (sequence !== undefined && previousSequence !== undefined) {
      counters.orderingComparisonCount += 1;
      if (sequence <= previousSequence) {
        counters.orderingViolationCount += 1;
      }
    }

    previousEventTime = eventTime;
    previousSequence = sequence;
  }
}

function assessSupplementarySnapshots(
  input: MarketDataQualityAssessableInput,
  counters: MutableCounters,
): void {
  for (const item of input.fundingRates ?? []) {
    countNumber(Number(item.eventTimeMs), counters, { minimum: 0 });
    countNumber(Number(item.fundingRate), counters);

    if (item.predictedFundingRate !== undefined) {
      countNumber(Number(item.predictedFundingRate), counters);
    }

    if (item.annualizedFundingRate !== undefined) {
      countNumber(Number(item.annualizedFundingRate), counters);
    }
  }

  for (const item of input.openInterest ?? []) {
    countNumber(Number(item.eventTimeMs), counters, { minimum: 0 });
    countNumber(Number(item.openInterest), counters, { minimum: 0 });

    if (item.openInterestNotional !== undefined) {
      countNumber(Number(item.openInterestNotional), counters, {
        minimum: 0,
      });
    }

    if (item.changePercentage !== undefined) {
      countNumber(Number(item.changePercentage), counters);
    }
  }

  for (const item of input.liquidations ?? []) {
    countNumber(Number(item.eventTimeMs), counters, { minimum: 0 });
    countNumber(Number(item.longLiquidationQuantity), counters, {
      minimum: 0,
    });
    countNumber(Number(item.shortLiquidationQuantity), counters, {
      minimum: 0,
    });
    countNumber(Number(item.longLiquidationNotional), counters, {
      minimum: 0,
    });
    countNumber(Number(item.shortLiquidationNotional), counters, {
      minimum: 0,
    });
  }

  for (const item of input.marketBreadth ?? []) {
    countNumber(Number(item.eventTimeMs), counters, { minimum: 0 });
    countNumber(item.advancingAssets, counters, { minimum: 0 });
    countNumber(item.decliningAssets, counters, { minimum: 0 });
    countNumber(item.unchangedAssets, counters, { minimum: 0 });

    if (item.advanceDeclineRatio !== undefined) {
      countNumber(item.advanceDeclineRatio, counters, { minimum: 0 });
    }
  }
}

function calculateCompleteness(
  input: MarketDataQualityAssessableInput,
  counters: MutableCounters,
  configuration: MarketDataQualityEngineConfiguration,
): number {
  const expectedCandles = Math.max(
    configuration.minimumCandleCount,
    configuration.expectedCandleCount ?? input.candles.length,
  );

  const candleCoverage =
    expectedCandles === 0
      ? 1
      : clamp(input.candles.length / expectedCandles, 0, 1);

  const tradeCoverage =
    configuration.minimumTradeCount === 0
      ? 1
      : clamp(
          (input.trades?.length ?? 0) /
            configuration.minimumTradeCount,
          0,
          1,
        );

  const orderBookCoverage =
    configuration.minimumOrderBookCount === 0
      ? 1
      : clamp(
          (input.orderBooks?.length ?? 0) /
            configuration.minimumOrderBookCount,
          0,
          1,
        );

  const valueCoverage =
    counters.checkedValueCount === 0
      ? 0
      : 1 -
        counters.missingValueCount / counters.checkedValueCount;

  return clamp(
    candleCoverage * 0.45 +
      tradeCoverage * 0.15 +
      orderBookCoverage * 0.15 +
      valueCoverage * 0.25,
    0,
    1,
  );
}

function calculateFreshness(
  latestEventTimeMs: number | undefined,
  analysisTimeMs: number,
  configuration: MarketDataQualityEngineConfiguration,
): {
  readonly score: number;
  readonly staleByMs: number;
} {
  if (latestEventTimeMs === undefined) {
    return {
      score: 0,
      staleByMs: Number(configuration.maximumAgeMs),
    };
  }

  const age = analysisTimeMs - latestEventTimeMs;

  if (age < 0) {
    const futureBy = Math.abs(age);
    const tolerated =
      futureBy <= Number(configuration.futureTimestampToleranceMs);

    return {
      score:
        tolerated || !configuration.rejectFutureData
          ? 1
          : 0,
      staleByMs: 0,
    };
  }

  const maximumAge = Number(configuration.maximumAgeMs);

  if (maximumAge <= 0) {
    return {
      score: age <= 0 ? 1 : 0,
      staleByMs: Math.max(0, age),
    };
  }

  return {
    score: clamp(1 - age / maximumAge, 0, 1),
    staleByMs: Math.max(0, age - maximumAge),
  };
}

function compareSuppliedAssessment(
  supplied: MarketDataQualityAssessment | undefined,
  computed: MarketDataQualityAssessment,
): number | undefined {
  if (supplied === undefined) {
    return undefined;
  }

  const differences = [
    Math.abs(
      Number(supplied.completenessScore) -
        Number(computed.completenessScore),
    ),
    Math.abs(
      Number(supplied.freshnessScore) -
        Number(computed.freshnessScore),
    ),
    Math.abs(
      Number(supplied.consistencyScore) -
        Number(computed.consistencyScore),
    ),
    Math.abs(
      Number(supplied.orderingScore) -
        Number(computed.orderingScore),
    ),
    Math.abs(
      Number(supplied.duplicateRate) -
        Number(computed.duplicateRate),
    ),
    Math.abs(
      Number(supplied.missingValueRate) -
        Number(computed.missingValueRate),
    ),
  ];

  return Math.max(...differences);
}

export const DEFAULT_MARKET_DATA_QUALITY_ENGINE_CONFIGURATION: MarketDataQualityEngineConfiguration =
  deepFreeze({
    maximumAgeMs: 60_000 as DurationMs,
    futureTimestampToleranceMs: 1_000 as DurationMs,
    minimumCandleCount: 2,
    minimumTradeCount: 0,
    minimumOrderBookCount: 0,
    maximumDuplicateRate: 0.01 as Percentage,
    maximumMissingValueRate: 0.05 as Percentage,
    maximumOrderingViolationRate: 0.01 as Percentage,
    maximumConsistencyViolationRate: 0.01 as Percentage,
    excellentScoreThreshold: 0.95 as NormalizedScore,
    goodScoreThreshold: 0.8 as NormalizedScore,
    degradedScoreThreshold: 0.6 as NormalizedScore,
    poorScoreThreshold: 0.35 as NormalizedScore,
    completenessWeight: 0.3,
    freshnessWeight: 0.25,
    consistencyWeight: 0.25,
    orderingWeight: 0.2,
    rejectFutureData: true,
    compareSuppliedAssessment: true,
    suppliedAssessmentTolerance: 0.1 as NormalizedScore,
    deterministicRoundingDecimals: DEFAULT_ROUNDING_DECIMALS,
  });

export class DefaultMarketDataQualityEngine
  implements MarketDataQualityEngine
{
  private readonly configuration: MarketDataQualityEngineConfiguration;

  public constructor(
    configuration: MarketDataQualityEngineConfiguration =
      DEFAULT_MARKET_DATA_QUALITY_ENGINE_CONFIGURATION,
  ) {
    validateConfiguration(configuration);
    this.configuration = deepFreeze({ ...configuration });
  }

  public assess(
    input: MarketDataQualityAssessableInput,
    analysisTimeMs: TimestampMs = input.analysisTimeMs,
  ): MarketDataQualityAssessment {
    return this.diagnose(input, analysisTimeMs).assessment;
  }

  public diagnose(
    input: MarketDataQualityAssessableInput,
    analysisTimeMs: TimestampMs = input.analysisTimeMs,
  ): MarketDataQualityDiagnostics {
    const counters: MutableCounters = {
      observationCount: 0,
      duplicateCount: 0,
      missingValueCount: 0,
      checkedValueCount: 0,
      orderingViolationCount: 0,
      orderingComparisonCount: 0,
      consistencyViolationCount: 0,
      consistencyCheckCount: 0,
      futureObservationCount: 0,
    };

    assessCandles(input.candles, counters);
    assessTrades(input, counters);
    assessOrderBooks(input, counters);
    assessSupplementarySnapshots(input, counters);

    const observations = collectTimedObservations(input);
    counters.observationCount = observations.length;

    const seen = new Set<string>();
    for (const observation of observations) {
      if (seen.has(observation.key)) {
        counters.duplicateCount += 1;
      } else {
        seen.add(observation.key);
      }

      if (
        observation.eventTimeMs >
        Number(analysisTimeMs) +
          Number(this.configuration.futureTimestampToleranceMs)
      ) {
        counters.futureObservationCount += 1;
      }

      counters.checkedValueCount += 2;
      if (!Number.isFinite(observation.eventTimeMs)) {
        counters.missingValueCount += 1;
      }

      const receivedAt = Number(observation.provenance.receivedAtMs);
      if (!Number.isFinite(receivedAt)) {
        counters.missingValueCount += 1;
      }

      counters.consistencyCheckCount += 1;
      if (
        Number.isFinite(receivedAt) &&
        Number.isFinite(observation.eventTimeMs) &&
        receivedAt < observation.eventTimeMs
      ) {
        counters.consistencyViolationCount += 1;
      }
    }

    const eventTimes = observations
      .map((observation) => observation.eventTimeMs)
      .filter(Number.isFinite);

    const latestEventTimeMs =
      eventTimes.length === 0 ? undefined : Math.max(...eventTimes);
    const oldestEventTimeMs =
      eventTimes.length === 0 ? undefined : Math.min(...eventTimes);

    const duplicateRate =
      counters.observationCount === 0
        ? 0
        : counters.duplicateCount / counters.observationCount;
    const missingValueRate =
      counters.checkedValueCount === 0
        ? 1
        : counters.missingValueCount / counters.checkedValueCount;
    const orderingViolationRate =
      counters.orderingComparisonCount === 0
        ? 0
        : counters.orderingViolationCount /
          counters.orderingComparisonCount;
    const consistencyViolationRate =
      counters.consistencyCheckCount === 0
        ? 0
        : counters.consistencyViolationCount /
          counters.consistencyCheckCount;

    const completenessScore = calculateCompleteness(
      input,
      counters,
      this.configuration,
    );
    const freshness = calculateFreshness(
      latestEventTimeMs,
      Number(analysisTimeMs),
      this.configuration,
    );

    const duplicatePenalty = clamp(
      duplicateRate /
        Math.max(
          Number(this.configuration.maximumDuplicateRate),
          EPSILON,
        ),
      0,
      1,
    );
    const missingPenalty = clamp(
      missingValueRate /
        Math.max(
          Number(this.configuration.maximumMissingValueRate),
          EPSILON,
        ),
      0,
      1,
    );
    const consistencyPenalty = clamp(
      consistencyViolationRate /
        Math.max(
          Number(
            this.configuration.maximumConsistencyViolationRate,
          ),
          EPSILON,
        ),
      0,
      1,
    );
    const orderingPenalty = clamp(
      orderingViolationRate /
        Math.max(
          Number(this.configuration.maximumOrderingViolationRate),
          EPSILON,
        ),
      0,
      1,
    );

    const consistencyScore = clamp(
      1 -
        consistencyPenalty * 0.6 -
        duplicatePenalty * 0.2 -
        missingPenalty * 0.2,
      0,
      1,
    );
    const orderingScore = clamp(1 - orderingPenalty, 0, 1);

    const weightTotal =
      this.configuration.completenessWeight +
      this.configuration.freshnessWeight +
      this.configuration.consistencyWeight +
      this.configuration.orderingWeight;

    const overallScore =
      (completenessScore *
        this.configuration.completenessWeight +
        freshness.score * this.configuration.freshnessWeight +
        consistencyScore *
          this.configuration.consistencyWeight +
        orderingScore * this.configuration.orderingWeight) /
      weightTotal;

    const warnings: string[] = [];

    if (input.candles.length < this.configuration.minimumCandleCount) {
      warnings.push(
        `Candle count ${input.candles.length} is below minimum ${this.configuration.minimumCandleCount}.`,
      );
    }

    if (
      (input.trades?.length ?? 0) <
      this.configuration.minimumTradeCount
    ) {
      warnings.push(
        `Trade count ${input.trades?.length ?? 0} is below minimum ${this.configuration.minimumTradeCount}.`,
      );
    }

    if (
      (input.orderBooks?.length ?? 0) <
      this.configuration.minimumOrderBookCount
    ) {
      warnings.push(
        `Order-book count ${input.orderBooks?.length ?? 0} is below minimum ${this.configuration.minimumOrderBookCount}.`,
      );
    }

    if (
      duplicateRate >
      Number(this.configuration.maximumDuplicateRate)
    ) {
      warnings.push(
        `Duplicate rate ${round(
          duplicateRate,
          this.configuration.deterministicRoundingDecimals,
        )} exceeds maximum ${Number(
          this.configuration.maximumDuplicateRate,
        )}.`,
      );
    }

    if (
      missingValueRate >
      Number(this.configuration.maximumMissingValueRate)
    ) {
      warnings.push(
        `Missing-value rate ${round(
          missingValueRate,
          this.configuration.deterministicRoundingDecimals,
        )} exceeds maximum ${Number(
          this.configuration.maximumMissingValueRate,
        )}.`,
      );
    }

    if (
      orderingViolationRate >
      Number(this.configuration.maximumOrderingViolationRate)
    ) {
      warnings.push(
        `Ordering-violation rate ${round(
          orderingViolationRate,
          this.configuration.deterministicRoundingDecimals,
        )} exceeds maximum ${Number(
          this.configuration.maximumOrderingViolationRate,
        )}.`,
      );
    }

    if (
      consistencyViolationRate >
      Number(
        this.configuration.maximumConsistencyViolationRate,
      )
    ) {
      warnings.push(
        `Consistency-violation rate ${round(
          consistencyViolationRate,
          this.configuration.deterministicRoundingDecimals,
        )} exceeds maximum ${Number(
          this.configuration.maximumConsistencyViolationRate,
        )}.`,
      );
    }

    if (freshness.staleByMs > 0) {
      warnings.push(
        `Latest market observation is stale by ${freshness.staleByMs} ms.`,
      );
    }

    if (counters.futureObservationCount > 0) {
      warnings.push(
        `${counters.futureObservationCount} observations are beyond the configured future-time tolerance.`,
      );
    }

    const initialAssessment: MarketDataQualityAssessment = {
      quality: classifyQuality(overallScore, this.configuration),
      completenessScore: normalized(
        completenessScore,
        this.configuration.deterministicRoundingDecimals,
      ),
      freshnessScore: normalized(
        freshness.score,
        this.configuration.deterministicRoundingDecimals,
      ),
      consistencyScore: normalized(
        consistencyScore,
        this.configuration.deterministicRoundingDecimals,
      ),
      orderingScore: normalized(
        orderingScore,
        this.configuration.deterministicRoundingDecimals,
      ),
      duplicateRate: percentage(
        duplicateRate,
        this.configuration.deterministicRoundingDecimals,
      ),
      missingValueRate: percentage(
        missingValueRate,
        this.configuration.deterministicRoundingDecimals,
      ),
      staleByMs: duration(freshness.staleByMs),
      warnings: deepFreeze([...warnings]),
    };

    const suppliedAssessmentDifference =
      this.configuration.compareSuppliedAssessment
        ? compareSuppliedAssessment(
            input.qualityAssessment,
            initialAssessment,
          )
        : undefined;

    if (
      suppliedAssessmentDifference !== undefined &&
      suppliedAssessmentDifference >
        Number(this.configuration.suppliedAssessmentTolerance)
    ) {
      warnings.push(
        `Supplied quality assessment differs from deterministic assessment by ${round(
          suppliedAssessmentDifference,
          this.configuration.deterministicRoundingDecimals,
        )}.`,
      );
    }

    const assessment: MarketDataQualityAssessment = deepFreeze({
      ...initialAssessment,
      warnings: deepFreeze([...warnings]),
    });

    return deepFreeze({
      assessment,
      observationCount: counters.observationCount,
      duplicateCount: counters.duplicateCount,
      missingValueCount: counters.missingValueCount,
      checkedValueCount: counters.checkedValueCount,
      orderingViolationCount: counters.orderingViolationCount,
      orderingComparisonCount: counters.orderingComparisonCount,
      consistencyViolationCount: counters.consistencyViolationCount,
      consistencyCheckCount: counters.consistencyCheckCount,
      ...(latestEventTimeMs === undefined
        ? {}
        : { latestEventTimeMs: latestEventTimeMs as TimestampMs }),
      ...(oldestEventTimeMs === undefined
        ? {}
        : { oldestEventTimeMs: oldestEventTimeMs as TimestampMs }),
      futureObservationCount: counters.futureObservationCount,
      ...(suppliedAssessmentDifference === undefined
        ? {}
        : {
            suppliedAssessmentDifference: round(
              suppliedAssessmentDifference,
              this.configuration.deterministicRoundingDecimals,
            ),
          }),
      warnings: deepFreeze([...warnings]),
    });
  }
}

export function createMarketDataQualityEngine(
  configuration: MarketDataQualityEngineConfiguration =
    DEFAULT_MARKET_DATA_QUALITY_ENGINE_CONFIGURATION,
): MarketDataQualityEngine {
  return new DefaultMarketDataQualityEngine(configuration);
}

export function assessMarketDataQuality(
  input: MarketDataQualityAssessableInput,
  analysisTimeMs: TimestampMs = input.analysisTimeMs,
  configuration: MarketDataQualityEngineConfiguration =
    DEFAULT_MARKET_DATA_QUALITY_ENGINE_CONFIGURATION,
): MarketDataQualityAssessment {
  return new DefaultMarketDataQualityEngine(configuration).assess(
    input,
    analysisTimeMs,
  );
}

export function diagnoseMarketDataQuality(
  input: MarketDataQualityAssessableInput,
  analysisTimeMs: TimestampMs = input.analysisTimeMs,
  configuration: MarketDataQualityEngineConfiguration =
    DEFAULT_MARKET_DATA_QUALITY_ENGINE_CONFIGURATION,
): MarketDataQualityDiagnostics {
  return new DefaultMarketDataQualityEngine(configuration).diagnose(
    input,
    analysisTimeMs,
  );
}