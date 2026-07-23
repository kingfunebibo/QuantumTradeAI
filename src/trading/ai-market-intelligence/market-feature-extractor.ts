/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-feature-extractor.ts
 *
 * Deterministic, immutable market feature extraction.
 */

import {
  AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
  FeatureCategory,
  FeatureNormalizationMethod,
  FeatureValueType,
  MarketDataProvenance,
  MarketDataSourceType,
  MarketFeature,
  MarketFeatureExtractor,
  MarketFeatureValue,
  MarketFeatureVector,
  MarketFeatureVectorId,
  MarketIntelligenceInput,
  NormalizedScore,
  Percentage,
  ScalarFeatureValue,
  TimestampMs,
  VectorFeatureValue,
  BooleanFeatureValue,
  CategoricalFeatureValue,
  FeatureDefinition,
  FeatureExtractionConfiguration,
  JsonValue,
  MarketCandle,
  MarketTrade,
  OrderBookSnapshot,
  ReferenceMarketInput,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const DEFAULT_ROUNDING_DECIMALS = 12;
const EMPTY_PROVENANCE: readonly MarketDataProvenance[] = Object.freeze([]);

type NumericSeries = readonly number[];

interface ComputedFeature {
  readonly value?: MarketFeatureValue;
  readonly qualityScore: number;
  readonly missingReason?: string;
  readonly provenance: readonly MarketDataProvenance[];
}

interface FeatureComputationContext {
  readonly input: MarketIntelligenceInput;
  readonly candles: readonly MarketCandle[];
  readonly trades: readonly MarketTrade[];
  readonly orderBooks: readonly OrderBookSnapshot[];
  readonly references: readonly ReferenceMarketInput[];
  readonly closes: NumericSeries;
  readonly opens: NumericSeries;
  readonly highs: NumericSeries;
  readonly lows: NumericSeries;
  readonly volumes: NumericSeries;
  readonly quoteVolumes: NumericSeries;
  readonly returns: NumericSeries;
  readonly logReturns: NumericSeries;
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

function toNormalized(value: number): NormalizedScore {
  return clamp(value, 0, 1) as NormalizedScore;
}

function round(value: number, decimals = DEFAULT_ROUNDING_DECIMALS): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function mean(values: NumericSeries): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: NumericSeries): number {
  return values.reduce((total, value) => total + value, 0);
}

function variance(values: NumericSeries): number {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  return (
    values.reduce((total, value) => {
      const difference = value - average;
      return total + difference * difference;
    }, 0) /
    (values.length - 1)
  );
}

function standardDeviation(values: NumericSeries): number {
  return Math.sqrt(Math.max(0, variance(values)));
}

function median(values: NumericSeries): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function medianAbsoluteDeviation(values: NumericSeries): number {
  if (values.length === 0) {
    return 0;
  }

  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function safeDivide(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  return Math.abs(denominator) <= EPSILON
    ? fallback
    : numerator / denominator;
}

function tail<TValue>(
  values: readonly TValue[],
  count: number,
): readonly TValue[] {
  const safeCount = Math.max(0, Math.floor(count));
  return values.slice(Math.max(0, values.length - safeCount));
}

function simpleReturns(values: NumericSeries): NumericSeries {
  const result: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    result.push(safeDivide(current - previous, previous));
  }

  return result;
}

function logarithmicReturns(values: NumericSeries): NumericSeries {
  const result: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;

    if (previous > 0 && current > 0) {
      result.push(Math.log(current / previous));
    }
  }

  return result;
}

function covariance(left: NumericSeries, right: NumericSeries): number {
  const length = Math.min(left.length, right.length);
  if (length < 2) {
    return 0;
  }

  const leftValues = tail(left, length);
  const rightValues = tail(right, length);
  const leftMean = mean(leftValues);
  const rightMean = mean(rightValues);

  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total +=
      (leftValues[index]! - leftMean) *
      (rightValues[index]! - rightMean);
  }

  return total / (length - 1);
}

function correlation(left: NumericSeries, right: NumericSeries): number {
  const length = Math.min(left.length, right.length);
  if (length < 2) {
    return 0;
  }

  const leftValues = tail(left, length);
  const rightValues = tail(right, length);
  const denominator =
    standardDeviation(leftValues) * standardDeviation(rightValues);

  return clamp(safeDivide(covariance(leftValues, rightValues), denominator), -1, 1);
}

function linearSlope(values: NumericSeries): number {
  if (values.length < 2) {
    return 0;
  }

  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < values.length; index += 1) {
    const xDifference = index - xMean;
    numerator += xDifference * (values[index]! - yMean);
    denominator += xDifference * xDifference;
  }

  return safeDivide(numerator, denominator);
}

function calculateRsi(values: NumericSeries, period: number): number {
  if (values.length < 2) {
    return 50;
  }

  const changes = simpleReturns(values);
  const selected = tail(changes, Math.max(1, period));
  let gains = 0;
  let losses = 0;

  for (const change of selected) {
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses <= EPSILON) {
    return gains <= EPSILON ? 50 : 100;
  }

  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function calculateTrueRanges(candles: readonly MarketCandle[]): NumericSeries {
  const result: number[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    const previousClose =
      index === 0 ? Number(candle.open) : Number(candles[index - 1]!.close);

    result.push(
      Math.max(
        Number(candle.high) - Number(candle.low),
        Math.abs(Number(candle.high) - previousClose),
        Math.abs(Number(candle.low) - previousClose),
      ),
    );
  }

  return result;
}

function calculateEfficiencyRatio(values: NumericSeries, period: number): number {
  const selected = tail(values, Math.max(2, period + 1));
  if (selected.length < 2) {
    return 0;
  }

  const direction = Math.abs(selected[selected.length - 1]! - selected[0]!);
  let path = 0;

  for (let index = 1; index < selected.length; index += 1) {
    path += Math.abs(selected[index]! - selected[index - 1]!);
  }

  return clamp(safeDivide(direction, path), 0, 1);
}

function numericParameter(
  definition: FeatureDefinition,
  key: string,
  fallback: number,
): number {
  const value = definition.parameters?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function stringParameter(
  definition: FeatureDefinition,
  key: string,
  fallback: string,
): string {
  const value = definition.parameters?.[key];
  return typeof value === "string" ? value : fallback;
}

function scalar(value: number): ScalarFeatureValue {
  return deepFreeze({
    type: FeatureValueType.SCALAR,
    value: round(value),
  });
}

function vector(values: NumericSeries): VectorFeatureValue {
  return deepFreeze({
    type: FeatureValueType.VECTOR,
    values: values.map((value) => round(value)),
  });
}

function booleanValue(value: boolean): BooleanFeatureValue {
  return deepFreeze({
    type: FeatureValueType.BOOLEAN,
    value,
  });
}

function categorical(value: string): CategoricalFeatureValue {
  return deepFreeze({
    type: FeatureValueType.CATEGORICAL,
    value,
  });
}

function normalizeScalar(
  value: number,
  method: FeatureNormalizationMethod,
  series: NumericSeries,
): number {
  switch (method) {
    case FeatureNormalizationMethod.NONE:
      return value;

    case FeatureNormalizationMethod.MIN_MAX: {
      const minimum = series.length > 0 ? Math.min(...series) : value;
      const maximum = series.length > 0 ? Math.max(...series) : value;
      return safeDivide(value - minimum, maximum - minimum);
    }

    case FeatureNormalizationMethod.Z_SCORE: {
      const deviation = standardDeviation(series);
      return safeDivide(value - mean(series), deviation);
    }

    case FeatureNormalizationMethod.ROBUST_Z_SCORE: {
      const deviation = medianAbsoluteDeviation(series);
      return safeDivide(value - median(series), deviation * 1.4826);
    }

    case FeatureNormalizationMethod.LOG:
      return value > 0 ? Math.log(value) : 0;

    case FeatureNormalizationMethod.LOG_RETURN: {
      const previous =
        series.length > 1 ? series[series.length - 2]! : value;
      return value > 0 && previous > 0 ? Math.log(value / previous) : 0;
    }

    case FeatureNormalizationMethod.RANK: {
      if (series.length === 0) {
        return 0.5;
      }

      const lessOrEqual = series.filter((item) => item <= value).length;
      return lessOrEqual / series.length;
    }

    case FeatureNormalizationMethod.UNIT_VECTOR:
      return safeDivide(value, Math.sqrt(sum(series.map((item) => item * item))));

    default: {
      const exhaustive: never = method;
      return exhaustive;
    }
  }
}

function applyNormalization(
  computed: MarketFeatureValue,
  definition: FeatureDefinition,
  series: NumericSeries,
): MarketFeatureValue {
  if (definition.normalization === FeatureNormalizationMethod.NONE) {
    return computed;
  }

  if (computed.type === FeatureValueType.SCALAR) {
    return scalar(
      normalizeScalar(computed.value, definition.normalization, series),
    );
  }

  if (computed.type === FeatureValueType.VECTOR) {
    if (definition.normalization === FeatureNormalizationMethod.UNIT_VECTOR) {
      const magnitude = Math.sqrt(
        sum(computed.values.map((value) => value * value)),
      );
      return vector(
        computed.values.map((value) => safeDivide(value, magnitude)),
      );
    }

    return vector(
      computed.values.map((value) =>
        normalizeScalar(value, definition.normalization, computed.values),
      ),
    );
  }

  return computed;
}

function sourceAvailable(
  input: MarketIntelligenceInput,
  source: MarketDataSourceType,
): boolean {
  switch (source) {
    case MarketDataSourceType.CANDLES:
      return input.candles.length > 0;
    case MarketDataSourceType.TRADES:
      return (input.trades?.length ?? 0) > 0;
    case MarketDataSourceType.ORDER_BOOK:
      return (input.orderBooks?.length ?? 0) > 0;
    case MarketDataSourceType.FUNDING_RATE:
      return (input.fundingRates?.length ?? 0) > 0;
    case MarketDataSourceType.OPEN_INTEREST:
      return (input.openInterest?.length ?? 0) > 0;
    case MarketDataSourceType.LIQUIDATIONS:
      return (input.liquidations?.length ?? 0) > 0;
    case MarketDataSourceType.MARKET_BREADTH:
      return (input.marketBreadth?.length ?? 0) > 0;
    case MarketDataSourceType.DERIVED:
      return input.candles.length > 0;
    case MarketDataSourceType.TICKER:
    case MarketDataSourceType.INDEX_PRICE:
    case MarketDataSourceType.MARK_PRICE:
    case MarketDataSourceType.ON_CHAIN:
    case MarketDataSourceType.SENTIMENT:
      return false;
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

function provenanceForSources(
  context: FeatureComputationContext,
  sources: readonly MarketDataSourceType[],
): readonly MarketDataProvenance[] {
  const collected: MarketDataProvenance[] = [];

  const add = (provenance: MarketDataProvenance | undefined): void => {
    if (provenance === undefined) {
      return;
    }

    if (
      !collected.some(
        (item) =>
          item.sourceId === provenance.sourceId &&
          Number(item.eventTimeMs) === Number(provenance.eventTimeMs) &&
          item.checksum === provenance.checksum,
      )
    ) {
      collected.push(provenance);
    }
  };

  for (const source of sources) {
    switch (source) {
      case MarketDataSourceType.CANDLES:
      case MarketDataSourceType.DERIVED:
        for (const candle of tail(context.candles, 3)) add(candle.provenance);
        break;
      case MarketDataSourceType.TRADES:
        for (const trade of tail(context.trades, 10)) add(trade.provenance);
        break;
      case MarketDataSourceType.ORDER_BOOK:
        for (const book of tail(context.orderBooks, 3)) add(book.provenance);
        break;
      case MarketDataSourceType.FUNDING_RATE:
        for (const item of tail(context.input.fundingRates ?? [], 3)) {
          add(item.provenance);
        }
        break;
      case MarketDataSourceType.OPEN_INTEREST:
        for (const item of tail(context.input.openInterest ?? [], 3)) {
          add(item.provenance);
        }
        break;
      case MarketDataSourceType.LIQUIDATIONS:
        for (const item of tail(context.input.liquidations ?? [], 3)) {
          add(item.provenance);
        }
        break;
      case MarketDataSourceType.MARKET_BREADTH:
        for (const item of tail(context.input.marketBreadth ?? [], 3)) {
          add(item.provenance);
        }
        break;
      case MarketDataSourceType.TICKER:
      case MarketDataSourceType.INDEX_PRICE:
      case MarketDataSourceType.MARK_PRICE:
      case MarketDataSourceType.ON_CHAIN:
      case MarketDataSourceType.SENTIMENT:
        break;
      default: {
        const exhaustive: never = source;
        return exhaustive;
      }
    }
  }

  return deepFreeze(collected);
}

function qualityForFeature(
  input: MarketIntelligenceInput,
  definition: FeatureDefinition,
  missing: boolean,
): number {
  if (missing) {
    return 0;
  }

  const quality = input.qualityAssessment;
  const sourceCoverage =
    definition.requiredSources.length === 0
      ? 1
      : definition.requiredSources.filter((source) =>
          sourceAvailable(input, source),
        ).length / definition.requiredSources.length;

  const score =
    Number(quality.completenessScore) * 0.35 +
    Number(quality.freshnessScore) * 0.25 +
    Number(quality.consistencyScore) * 0.25 +
    Number(quality.orderingScore) * 0.15;

  return clamp(score * sourceCoverage, 0, 1);
}

function buildContext(input: MarketIntelligenceInput): FeatureComputationContext {
  const candles = [...input.candles].sort(
    (left, right) => Number(left.openTimeMs) - Number(right.openTimeMs),
  );
  const trades = [...(input.trades ?? [])].sort(
    (left, right) => Number(left.eventTimeMs) - Number(right.eventTimeMs),
  );
  const orderBooks = [...(input.orderBooks ?? [])].sort(
    (left, right) => Number(left.eventTimeMs) - Number(right.eventTimeMs),
  );
  const references = [...(input.referenceMarkets ?? [])];

  const closes = candles.map((candle) => Number(candle.close));
  const opens = candles.map((candle) => Number(candle.open));
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const volumes = candles.map((candle) => Number(candle.volume));
  const quoteVolumes = candles.map((candle) =>
    candle.quoteVolume === undefined ? 0 : Number(candle.quoteVolume),
  );

  return {
    input,
    candles,
    trades,
    orderBooks,
    references,
    closes,
    opens,
    highs,
    lows,
    volumes,
    quoteVolumes,
    returns: simpleReturns(closes),
    logReturns: logarithmicReturns(closes),
  };
}

function computePriceFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(1, definition.lookbackPeriods);
  const closes = tail(context.closes, lookback);
  const latest = closes.at(-1);

  if (latest === undefined) {
    return {
      qualityScore: 0,
      missingReason: "No candle close prices are available.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  switch (definition.featureName) {
    case "price.close":
    case "price.last":
      return {
        value: scalar(latest),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "price.open":
      return {
        value: scalar(context.opens.at(-1) ?? latest),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "price.high":
      return {
        value: scalar(Math.max(...tail(context.highs, lookback))),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "price.low":
      return {
        value: scalar(Math.min(...tail(context.lows, lookback))),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "price.typical": {
      const high = context.highs.at(-1) ?? latest;
      const low = context.lows.at(-1) ?? latest;
      return {
        value: scalar((high + low + latest) / 3),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };
    }

    case "price.range":
      return {
        value: scalar(
          Math.max(...tail(context.highs, lookback)) -
            Math.min(...tail(context.lows, lookback)),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "price.position_in_range": {
      const high = Math.max(...tail(context.highs, lookback));
      const low = Math.min(...tail(context.lows, lookback));
      return {
        value: scalar(safeDivide(latest - low, high - low, 0.5)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };
    }

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported price feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeReturnFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(1, definition.lookbackPeriods);
  const selectedReturns = tail(context.returns, lookback);
  const selectedLogReturns = tail(context.logReturns, lookback);

  if (context.closes.length < 2) {
    return {
      qualityScore: 0,
      missingReason: "At least two candle close prices are required.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const current = context.closes.at(-1)!;
  const start =
    context.closes[Math.max(0, context.closes.length - lookback - 1)]!;

  switch (definition.featureName) {
    case "return.simple":
    case "return.period":
      return {
        value: scalar(safeDivide(current - start, start)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "return.log":
      return {
        value: scalar(current > 0 && start > 0 ? Math.log(current / start) : 0),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "return.mean":
      return {
        value: scalar(mean(selectedReturns)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "return.cumulative":
      return {
        value: scalar(
          selectedReturns.reduce(
            (accumulator, value) => accumulator * (1 + value),
            1,
          ) - 1,
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "return.vector":
      return {
        value: vector(selectedReturns),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "return.log_vector":
      return {
        value: vector(selectedLogReturns),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported return feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeTrendFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(2, definition.lookbackPeriods);
  const values = tail(context.closes, lookback);

  if (values.length < 2) {
    return {
      qualityScore: 0,
      missingReason: "Insufficient candles for trend extraction.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const latest = values.at(-1)!;
  const average = mean(values);
  const slope = linearSlope(values);
  const normalizedSlope = safeDivide(slope, Math.abs(average));

  switch (definition.featureName) {
    case "trend.sma":
      return {
        value: scalar(average),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "trend.sma_ratio":
      return {
        value: scalar(safeDivide(latest, average, 1) - 1),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "trend.slope":
      return {
        value: scalar(normalizedSlope),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "trend.strength":
      return {
        value: scalar(
          clamp(
            Math.abs(normalizedSlope) *
              lookback *
              calculateEfficiencyRatio(values, lookback),
            0,
            1,
          ),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "trend.efficiency_ratio":
      return {
        value: scalar(calculateEfficiencyRatio(values, lookback)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "trend.direction":
      return {
        value: categorical(
          normalizedSlope > EPSILON
            ? "UP"
            : normalizedSlope < -EPSILON
              ? "DOWN"
              : "FLAT",
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported trend feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeMomentumFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(2, definition.lookbackPeriods);
  const values = tail(context.closes, lookback + 1);

  if (values.length < 2) {
    return {
      qualityScore: 0,
      missingReason: "Insufficient candles for momentum extraction.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const latest = values.at(-1)!;
  const start = values[0]!;

  switch (definition.featureName) {
    case "momentum.raw":
      return {
        value: scalar(latest - start),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "momentum.rate_of_change":
      return {
        value: scalar(safeDivide(latest - start, start)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "momentum.rsi":
      return {
        value: scalar(calculateRsi(context.closes, lookback) / 100),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "momentum.acceleration": {
      const selected = tail(context.returns, lookback);
      const midpoint = Math.max(1, Math.floor(selected.length / 2));
      const early = selected.slice(0, midpoint);
      const late = selected.slice(midpoint);
      return {
        value: scalar(mean(late) - mean(early)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };
    }

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported momentum feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeVolatilityFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(2, definition.lookbackPeriods);
  const selectedReturns = tail(context.logReturns, lookback);
  const selectedCandles = tail(context.candles, lookback);

  if (selectedReturns.length < 1) {
    return {
      qualityScore: 0,
      missingReason: "Insufficient returns for volatility extraction.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  switch (definition.featureName) {
    case "volatility.realized":
      return {
        value: scalar(standardDeviation(selectedReturns)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volatility.annualized": {
      const periods = numericParameter(definition, "annualizationPeriods", 365);
      return {
        value: scalar(standardDeviation(selectedReturns) * Math.sqrt(periods)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };
    }

    case "volatility.atr": {
      const ranges = calculateTrueRanges(selectedCandles);
      const latestClose = context.closes.at(-1) ?? 0;
      return {
        value: scalar(safeDivide(mean(ranges), latestClose)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };
    }

    case "volatility.downside":
      return {
        value: scalar(
          standardDeviation(selectedReturns.filter((value) => value < 0)),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volatility.upside":
      return {
        value: scalar(
          standardDeviation(selectedReturns.filter((value) => value > 0)),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volatility.range":
      return {
        value: scalar(
          mean(
            selectedCandles.map((candle) =>
              safeDivide(
                Number(candle.high) - Number(candle.low),
                Number(candle.close),
              ),
            ),
          ),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported volatility feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeVolumeFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(1, definition.lookbackPeriods);
  const volumes = tail(context.volumes, lookback);
  const latest = volumes.at(-1);

  if (latest === undefined) {
    return {
      qualityScore: 0,
      missingReason: "No candle volume is available.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  switch (definition.featureName) {
    case "volume.current":
      return {
        value: scalar(latest),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volume.mean":
      return {
        value: scalar(mean(volumes)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volume.relative":
      return {
        value: scalar(safeDivide(latest, mean(volumes), 1)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volume.z_score":
      return {
        value: scalar(
          safeDivide(latest - mean(volumes), standardDeviation(volumes)),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volume.quote":
      return {
        value: scalar(context.quoteVolumes.at(-1) ?? 0),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "volume.trend":
      return {
        value: scalar(
          safeDivide(linearSlope(volumes), Math.abs(mean(volumes))),
        ),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported volume feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function latestOrderBook(
  context: FeatureComputationContext,
): OrderBookSnapshot | undefined {
  return context.orderBooks.at(-1);
}

function orderBookDepth(
  book: OrderBookSnapshot,
  side: "BID" | "ASK",
  levels: number,
): number {
  const selected = tail(
    side === "BID" ? book.bids.slice(0, levels) : book.asks.slice(0, levels),
    levels,
  );

  return selected.reduce(
    (total, level) => total + Number(level.price) * Number(level.quantity),
    0,
  );
}

function computeLiquidityOrMicrostructureFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const book = latestOrderBook(context);
  if (book === undefined) {
    return {
      qualityScore: 0,
      missingReason: "No order-book snapshot is available.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const levels = Math.max(
    1,
    Math.floor(numericParameter(definition, "depthLevels", 10)),
  );
  const bestBid =
    book.bestBid === undefined
      ? Number(book.bids[0]?.price ?? 0)
      : Number(book.bestBid);
  const bestAsk =
    book.bestAsk === undefined
      ? Number(book.asks[0]?.price ?? 0)
      : Number(book.bestAsk);
  const midpoint =
    book.midPrice === undefined
      ? (bestBid + bestAsk) / 2
      : Number(book.midPrice);
  const spread =
    book.spread === undefined ? bestAsk - bestBid : Number(book.spread);
  const spreadBps =
    book.spreadBps === undefined
      ? safeDivide(spread, midpoint) * 10_000
      : Number(book.spreadBps);
  const bidDepth = orderBookDepth(book, "BID", levels);
  const askDepth = orderBookDepth(book, "ASK", levels);
  const totalDepth = bidDepth + askDepth;
  const imbalance = safeDivide(bidDepth - askDepth, totalDepth);

  switch (definition.featureName) {
    case "liquidity.bid_depth":
      return {
        value: scalar(bidDepth),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "liquidity.ask_depth":
      return {
        value: scalar(askDepth),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "liquidity.total_depth":
      return {
        value: scalar(totalDepth),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "liquidity.depth_imbalance":
    case "microstructure.order_book_imbalance":
      return {
        value: scalar(imbalance),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "liquidity.spread":
    case "microstructure.spread":
      return {
        value: scalar(spread),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "liquidity.spread_bps":
    case "microstructure.spread_bps":
      return {
        value: scalar(spreadBps),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "microstructure.mid_price":
      return {
        value: scalar(midpoint),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };

    case "microstructure.microprice": {
      const bestBidQuantity = Number(book.bids[0]?.quantity ?? 0);
      const bestAskQuantity = Number(book.asks[0]?.quantity ?? 0);
      const microprice = safeDivide(
        bestAsk * bestBidQuantity + bestBid * bestAskQuantity,
        bestBidQuantity + bestAskQuantity,
        midpoint,
      );
      return {
        value: scalar(microprice),
        qualityScore: 1,
        provenance: deepFreeze([book.provenance]),
      };
    }

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported ${definition.category.toLowerCase()} feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeOrderFlowFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const lookback = Math.max(1, definition.lookbackPeriods);
  const trades = tail(context.trades, lookback);

  if (trades.length === 0) {
    return {
      qualityScore: 0,
      missingReason: "No trade observations are available.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const buyTrades = trades.filter((trade) => trade.aggressorSide === "BUY");
  const sellTrades = trades.filter((trade) => trade.aggressorSide === "SELL");
  const buyNotional = sum(buyTrades.map((trade) => Number(trade.notional)));
  const sellNotional = sum(sellTrades.map((trade) => Number(trade.notional)));
  const totalNotional = buyNotional + sellNotional;
  const delta = buyNotional - sellNotional;

  switch (definition.featureName) {
    case "order_flow.buy_ratio":
      return {
        value: scalar(safeDivide(buyNotional, totalNotional, 0.5)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "order_flow.sell_ratio":
      return {
        value: scalar(safeDivide(sellNotional, totalNotional, 0.5)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "order_flow.delta":
    case "order_flow.cumulative_volume_delta":
      return {
        value: scalar(delta),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "order_flow.normalized_delta":
      return {
        value: scalar(safeDivide(delta, totalNotional)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    case "order_flow.block_trade_ratio": {
      const threshold = numericParameter(
        definition,
        "blockTradeNotionalThreshold",
        100_000,
      );
      const blockNotional = sum(
        trades
          .filter(
            (trade) =>
              trade.isBlockTrade === true ||
              Number(trade.notional) >= threshold,
          )
          .map((trade) => Number(trade.notional)),
      );

      return {
        value: scalar(safeDivide(blockNotional, totalNotional)),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };
    }

    case "order_flow.trade_count":
      return {
        value: scalar(trades.length),
        qualityScore: 1,
        provenance: provenanceForSources(context, definition.requiredSources),
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported order-flow feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeDerivativesFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const funding = context.input.fundingRates?.at(-1);
  const openInterest = context.input.openInterest?.at(-1);
  const liquidation = context.input.liquidations?.at(-1);

  switch (definition.featureName) {
    case "derivatives.funding_rate":
      return funding === undefined
        ? {
            qualityScore: 0,
            missingReason: "No funding-rate snapshot is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(Number(funding.fundingRate)),
            qualityScore: 1,
            provenance: deepFreeze([funding.provenance]),
          };

    case "derivatives.predicted_funding_rate":
      return funding?.predictedFundingRate === undefined
        ? {
            qualityScore: 0,
            missingReason: "No predicted funding rate is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(Number(funding.predictedFundingRate)),
            qualityScore: 1,
            provenance: deepFreeze([funding.provenance]),
          };

    case "derivatives.annualized_funding_rate":
      return funding?.annualizedFundingRate === undefined
        ? {
            qualityScore: 0,
            missingReason: "No annualized funding rate is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(Number(funding.annualizedFundingRate)),
            qualityScore: 1,
            provenance: deepFreeze([funding.provenance]),
          };

    case "derivatives.open_interest":
      return openInterest === undefined
        ? {
            qualityScore: 0,
            missingReason: "No open-interest snapshot is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(Number(openInterest.openInterest)),
            qualityScore: 1,
            provenance: deepFreeze([openInterest.provenance]),
          };

    case "derivatives.open_interest_change":
      return openInterest?.changePercentage === undefined
        ? {
            qualityScore: 0,
            missingReason: "No open-interest change is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(Number(openInterest.changePercentage)),
            qualityScore: 1,
            provenance: deepFreeze([openInterest.provenance]),
          };

    case "derivatives.liquidation_imbalance":
      return liquidation === undefined
        ? {
            qualityScore: 0,
            missingReason: "No liquidation snapshot is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(
              safeDivide(
                Number(liquidation.longLiquidationNotional) -
                  Number(liquidation.shortLiquidationNotional),
                Number(liquidation.longLiquidationNotional) +
                  Number(liquidation.shortLiquidationNotional),
              ),
            ),
            qualityScore: 1,
            provenance: deepFreeze([liquidation.provenance]),
          };

    case "derivatives.total_liquidation_notional":
      return liquidation === undefined
        ? {
            qualityScore: 0,
            missingReason: "No liquidation snapshot is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(
              Number(liquidation.longLiquidationNotional) +
                Number(liquidation.shortLiquidationNotional),
            ),
            qualityScore: 1,
            provenance: deepFreeze([liquidation.provenance]),
          };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported derivatives feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeBreadthFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const breadth = context.input.marketBreadth?.at(-1);

  if (breadth === undefined) {
    return {
      qualityScore: 0,
      missingReason: "No market-breadth snapshot is available.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const total =
    breadth.advancingAssets +
    breadth.decliningAssets +
    breadth.unchangedAssets;

  switch (definition.featureName) {
    case "market_breadth.advance_decline_ratio":
      return {
        value: scalar(
          breadth.advanceDeclineRatio ??
            safeDivide(breadth.advancingAssets, breadth.decliningAssets),
        ),
        qualityScore: 1,
        provenance: deepFreeze([breadth.provenance]),
      };

    case "market_breadth.advancing_ratio":
      return {
        value: scalar(safeDivide(breadth.advancingAssets, total)),
        qualityScore: 1,
        provenance: deepFreeze([breadth.provenance]),
      };

    case "market_breadth.declining_ratio":
      return {
        value: scalar(safeDivide(breadth.decliningAssets, total)),
        qualityScore: 1,
        provenance: deepFreeze([breadth.provenance]),
      };

    case "market_breadth.above_moving_average_ratio":
      return breadth.aboveMovingAverageRatio === undefined
        ? {
            qualityScore: 0,
            missingReason: "No above-moving-average ratio is available.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(Number(breadth.aboveMovingAverageRatio)),
            qualityScore: 1,
            provenance: deepFreeze([breadth.provenance]),
          };

    case "market_breadth.new_high_low_spread":
      return {
        value: scalar(
          Number(breadth.newHighRatio ?? 0) -
            Number(breadth.newLowRatio ?? 0),
        ),
        qualityScore: 1,
        provenance: deepFreeze([breadth.provenance]),
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported market-breadth feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeTemporalFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const timestamp = Number(context.input.analysisTimeMs);
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();

  switch (definition.featureName) {
    case "temporal.hour_utc":
      return {
        value: scalar(hour),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.day_of_week_utc":
      return {
        value: scalar(day),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.hour_sin":
      return {
        value: scalar(Math.sin((2 * Math.PI * hour) / 24)),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.hour_cos":
      return {
        value: scalar(Math.cos((2 * Math.PI * hour) / 24)),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.day_sin":
      return {
        value: scalar(Math.sin((2 * Math.PI * day) / 7)),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.day_cos":
      return {
        value: scalar(Math.cos((2 * Math.PI * day) / 7)),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.is_weekend":
      return {
        value: booleanValue(day === 0 || day === 6),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    case "temporal.session":
      return {
        value: categorical(
          hour < 8 ? "ASIA" : hour < 16 ? "EUROPE" : "AMERICAS",
        ),
        qualityScore: 1,
        provenance: EMPTY_PROVENANCE,
      };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported temporal feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeCorrelationOrCrossVenueFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  if (context.references.length === 0) {
    return {
      qualityScore: 0,
      missingReason: "No reference markets are available.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const targetSymbol = stringParameter(definition, "referenceSymbol", "");
  const reference =
    context.references.find(
      (item) => String(item.market.symbol) === targetSymbol,
    ) ?? context.references[0];

  if (reference === undefined || reference.candles.length < 2) {
    return {
      qualityScore: 0,
      missingReason: "Reference market has insufficient candles.",
      provenance: EMPTY_PROVENANCE,
    };
  }

  const referenceCloses = reference.candles.map((candle) =>
    Number(candle.close),
  );
  const referenceReturns = logarithmicReturns(referenceCloses);
  const primaryReturns = context.logReturns;
  const coefficient = correlation(primaryReturns, referenceReturns);
  const primaryClose = context.closes.at(-1);
  const referenceClose = referenceCloses.at(-1);

  switch (definition.featureName) {
    case "correlation.reference":
      return {
        value: scalar(coefficient),
        qualityScore: 1,
        provenance: deepFreeze(
          tail(reference.candles, 3).map((candle) => candle.provenance),
        ),
      };

    case "correlation.absolute_reference":
      return {
        value: scalar(Math.abs(coefficient)),
        qualityScore: 1,
        provenance: deepFreeze(
          tail(reference.candles, 3).map((candle) => candle.provenance),
        ),
      };

    case "cross_venue.price_deviation":
      return primaryClose === undefined || referenceClose === undefined
        ? {
            qualityScore: 0,
            missingReason: "Primary or reference close price is missing.",
            provenance: EMPTY_PROVENANCE,
          }
        : {
            value: scalar(
              safeDivide(primaryClose - referenceClose, referenceClose),
            ),
            qualityScore: 1,
            provenance: deepFreeze(
              tail(reference.candles, 1).map((candle) => candle.provenance),
            ),
          };

    default:
      return {
        qualityScore: 0,
        missingReason: `Unsupported ${definition.category.toLowerCase()} feature: ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
  }
}

function computeFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): ComputedFeature {
  const missingSources = definition.requiredSources.filter(
    (source) => !sourceAvailable(context.input, source),
  );

  if (missingSources.length > 0) {
    return {
      qualityScore: 0,
      missingReason: `Missing required sources: ${missingSources.join(", ")}.`,
      provenance: EMPTY_PROVENANCE,
    };
  }

  switch (definition.category) {
    case FeatureCategory.PRICE:
      return computePriceFeature(definition, context);
    case FeatureCategory.RETURN:
      return computeReturnFeature(definition, context);
    case FeatureCategory.TREND:
      return computeTrendFeature(definition, context);
    case FeatureCategory.MOMENTUM:
      return computeMomentumFeature(definition, context);
    case FeatureCategory.VOLATILITY:
      return computeVolatilityFeature(definition, context);
    case FeatureCategory.VOLUME:
      return computeVolumeFeature(definition, context);
    case FeatureCategory.LIQUIDITY:
    case FeatureCategory.MICROSTRUCTURE:
      return computeLiquidityOrMicrostructureFeature(definition, context);
    case FeatureCategory.ORDER_FLOW:
      return computeOrderFlowFeature(definition, context);
    case FeatureCategory.DERIVATIVES:
      return computeDerivativesFeature(definition, context);
    case FeatureCategory.MARKET_BREADTH:
      return computeBreadthFeature(definition, context);
    case FeatureCategory.TEMPORAL:
      return computeTemporalFeature(definition, context);
    case FeatureCategory.CORRELATION:
    case FeatureCategory.CROSS_VENUE:
      return computeCorrelationOrCrossVenueFeature(definition, context);
    case FeatureCategory.ANOMALY:
    case FeatureCategory.CUSTOM:
      return {
        qualityScore: 0,
        missingReason: `No deterministic built-in computation exists for ${definition.featureName}.`,
        provenance: EMPTY_PROVENANCE,
      };
    default: {
      const exhaustive: never = definition.category;
      return exhaustive;
    }
  }
}

function stableSerialize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerialize(record[key] ?? null)}`,
    )
    .join(",")}}`;
}

function fnv1a64(input: string): string {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function featureValueToJson(value: MarketFeatureValue): JsonValue {
  switch (value.type) {
    case FeatureValueType.SCALAR:
      return { type: value.type, value: value.value };
    case FeatureValueType.VECTOR:
      return { type: value.type, values: value.values };
    case FeatureValueType.BOOLEAN:
      return { type: value.type, value: value.value };
    case FeatureValueType.CATEGORICAL:
      return { type: value.type, value: value.value };
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function fingerprintPayload(
  input: MarketIntelligenceInput,
  features: readonly MarketFeature[],
): JsonValue {
  return {
    schemaVersion: AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
    market: {
      symbol: String(input.market.symbol),
      baseAsset: String(input.market.baseAsset),
      quoteAsset: String(input.market.quoteAsset),
      venueId: String(input.market.venueId),
      venueType: input.market.venueType,
      instrumentType: input.market.instrumentType,
    },
    timeframe: input.timeframe,
    analysisTimeMs: Number(input.analysisTimeMs),
    observationWindow: {
      startTimeMs: Number(input.observationWindow.startTimeMs),
      endTimeMs: Number(input.observationWindow.endTimeMs),
    },
    features: features.map((feature) => ({
      featureName: feature.definition.featureName,
      category: feature.definition.category,
      valueType: feature.definition.valueType,
      value: featureValueToJson(feature.value),
      observedAtMs: Number(feature.observedAtMs),
      qualityScore: Number(feature.qualityScore),
      isMissing: feature.isMissing,
      missingReason: feature.missingReason ?? null,
    })),
  };
}

function createFeatureVectorId(fingerprint: string): MarketFeatureVectorId {
  return `market-feature-vector-${fingerprint}` as MarketFeatureVectorId;
}

function validateFeatureValueType(
  definition: FeatureDefinition,
  value: MarketFeatureValue,
): MarketFeatureValue {
  if (definition.valueType !== value.type) {
    throw new Error(
      `Feature ${definition.featureName} expected ${definition.valueType} but produced ${value.type}.`,
    );
  }

  return value;
}

function missingValueForDefinition(
  definition: FeatureDefinition,
): MarketFeatureValue {
  switch (definition.valueType) {
    case FeatureValueType.SCALAR:
      return scalar(0);
    case FeatureValueType.VECTOR:
      return vector([]);
    case FeatureValueType.BOOLEAN:
      return booleanValue(false);
    case FeatureValueType.CATEGORICAL:
      return categorical("MISSING");
    default: {
      const exhaustive: never = definition.valueType;
      return exhaustive;
    }
  }
}

function buildMarketFeature(
  definition: FeatureDefinition,
  context: FeatureComputationContext,
): MarketFeature {
  const computed = computeFeature(definition, context);
  const isMissing = computed.value === undefined;
  const rawValue = computed.value ?? missingValueForDefinition(definition);
  const normalizationSeries =
    definition.category === FeatureCategory.VOLUME
      ? context.volumes
      : definition.category === FeatureCategory.RETURN ||
          definition.category === FeatureCategory.VOLATILITY
        ? context.logReturns
        : context.closes;
  const normalizedValue = applyNormalization(
    rawValue,
    definition,
    normalizationSeries,
  );

  validateFeatureValueType(definition, normalizedValue);

  return deepFreeze({
    definition: deepFreeze({ ...definition }),
    value: normalizedValue,
    observedAtMs: context.input.analysisTimeMs,
    qualityScore: toNormalized(
      qualityForFeature(context.input, definition, isMissing) *
        computed.qualityScore,
    ),
    isMissing,
    ...(computed.missingReason === undefined
      ? {}
      : { missingReason: computed.missingReason }),
    provenance: computed.provenance,
  });
}

export const DEFAULT_MARKET_FEATURE_DEFINITIONS: readonly FeatureDefinition[] =
  deepFreeze([
    {
      featureName: "price.close",
      category: FeatureCategory.PRICE,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Latest closed-candle price.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "return.log",
      category: FeatureCategory.RETURN,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Logarithmic return over the configured lookback.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "trend.sma_ratio",
      category: FeatureCategory.TREND,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Distance of the latest close from its simple moving average.",
      lookbackPeriods: 20,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "trend.strength",
      category: FeatureCategory.TREND,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Normalized deterministic trend-strength estimate.",
      lookbackPeriods: 20,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "momentum.rsi",
      category: FeatureCategory.MOMENTUM,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Relative-strength momentum normalized to [0, 1].",
      lookbackPeriods: 14,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "volatility.realized",
      category: FeatureCategory.VOLATILITY,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Sample standard deviation of logarithmic returns.",
      lookbackPeriods: 20,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "volatility.atr",
      category: FeatureCategory.VOLATILITY,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Average true range normalized by the latest close.",
      lookbackPeriods: 14,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "volume.relative",
      category: FeatureCategory.VOLUME,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Latest volume relative to lookback mean volume.",
      lookbackPeriods: 20,
      deterministic: true,
      requiredSources: [MarketDataSourceType.CANDLES],
    },
    {
      featureName: "liquidity.spread_bps",
      category: FeatureCategory.LIQUIDITY,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Latest top-of-book spread in basis points.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [MarketDataSourceType.ORDER_BOOK],
    },
    {
      featureName: "liquidity.depth_imbalance",
      category: FeatureCategory.LIQUIDITY,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Bid-versus-ask notional depth imbalance.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [MarketDataSourceType.ORDER_BOOK],
      parameters: { depthLevels: 10 },
    },
    {
      featureName: "order_flow.normalized_delta",
      category: FeatureCategory.ORDER_FLOW,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Aggressive buy-minus-sell notional normalized by total notional.",
      lookbackPeriods: 100,
      deterministic: true,
      requiredSources: [MarketDataSourceType.TRADES],
    },
    {
      featureName: "derivatives.funding_rate",
      category: FeatureCategory.DERIVATIVES,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Latest observed funding rate.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [MarketDataSourceType.FUNDING_RATE],
    },
    {
      featureName: "derivatives.open_interest_change",
      category: FeatureCategory.DERIVATIVES,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Latest open-interest percentage change.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [MarketDataSourceType.OPEN_INTEREST],
    },
    {
      featureName: "temporal.hour_sin",
      category: FeatureCategory.TEMPORAL,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Cyclical sine encoding of UTC hour.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [],
    },
    {
      featureName: "temporal.hour_cos",
      category: FeatureCategory.TEMPORAL,
      valueType: FeatureValueType.SCALAR,
      normalization: FeatureNormalizationMethod.NONE,
      description: "Cyclical cosine encoding of UTC hour.",
      lookbackPeriods: 1,
      deterministic: true,
      requiredSources: [],
    },
  ]);

export const DEFAULT_FEATURE_EXTRACTION_CONFIGURATION: FeatureExtractionConfiguration =
  deepFreeze({
    enabledCategories: Object.values(FeatureCategory),
    definitions: DEFAULT_MARKET_FEATURE_DEFINITIONS,
    rejectMissingRequiredFeatures: false,
    maximumMissingFeatureRatio: 0.5 as Percentage,
    minimumFeatureQuality: 0.5 as NormalizedScore,
    includeRawFeatures: true,
  });

export class DefaultMarketFeatureExtractor implements MarketFeatureExtractor {
  public extract(
    input: MarketIntelligenceInput,
    configuration: FeatureExtractionConfiguration,
  ): MarketFeatureVector {
    const context = buildContext(input);

    const definitions = configuration.definitions
      .filter((definition) =>
        configuration.enabledCategories.includes(definition.category),
      )
      .slice()
      .sort((left, right) =>
        left.featureName.localeCompare(right.featureName),
      );

    const duplicateNames = definitions
      .map((definition) => definition.featureName)
      .filter(
        (name, index, names) => names.indexOf(name) !== index,
      );

    if (duplicateNames.length > 0) {
      throw new Error(
        `Feature definitions contain duplicate names: ${[
          ...new Set(duplicateNames),
        ].join(", ")}.`,
      );
    }

    const features = definitions.map((definition) =>
      buildMarketFeature(definition, context),
    );
    const missingFeatureCount = features.filter(
      (feature) => feature.isMissing,
    ).length;
    const missingRatio =
      features.length === 0 ? 0 : missingFeatureCount / features.length;

    if (
      configuration.rejectMissingRequiredFeatures &&
      missingFeatureCount > 0
    ) {
      const names = features
        .filter((feature) => feature.isMissing)
        .map((feature) => feature.definition.featureName);

      throw new Error(
        `Required market features are missing: ${names.join(", ")}.`,
      );
    }

    if (missingRatio > Number(configuration.maximumMissingFeatureRatio)) {
      throw new Error(
        `Missing feature ratio ${round(missingRatio)} exceeds configured maximum ${Number(
          configuration.maximumMissingFeatureRatio,
        )}.`,
      );
    }

    const availableFeatures = features.filter(
      (feature) => !feature.isMissing,
    );
    const qualityScore =
      availableFeatures.length === 0
        ? 0
        : mean(
            availableFeatures.map((feature) =>
              Number(feature.qualityScore),
            ),
          );

    if (
      availableFeatures.length > 0 &&
      qualityScore < Number(configuration.minimumFeatureQuality)
    ) {
      throw new Error(
        `Feature-vector quality ${round(qualityScore)} is below configured minimum ${Number(
          configuration.minimumFeatureQuality,
        )}.`,
      );
    }

    const payload = fingerprintPayload(input, features);
    const deterministicFingerprint = fnv1a64(stableSerialize(payload));

    const vectorValue: MarketFeatureVector = {
      id: createFeatureVectorId(deterministicFingerprint),
      schemaVersion: AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
      market: input.market,
      timeframe: input.timeframe,
      generatedAtMs: input.analysisTimeMs as TimestampMs,
      observationWindow: input.observationWindow,
      features: deepFreeze(features),
      featureCount: features.length,
      missingFeatureCount,
      qualityScore: toNormalized(qualityScore),
      deterministicFingerprint,
      metadata: deepFreeze({
        extractionAlgorithm: "DETERMINISTIC_BUILT_IN_V1",
        definitionCount: definitions.length,
        availableFeatureCount: availableFeatures.length,
        missingFeatureRatio: round(missingRatio),
        includeRawFeatures: configuration.includeRawFeatures,
      }),
    };

    return deepFreeze(vectorValue);
  }
}

export function createMarketFeatureExtractor(): MarketFeatureExtractor {
  return new DefaultMarketFeatureExtractor();
}

export function extractMarketFeatures(
  input: MarketIntelligenceInput,
  configuration: FeatureExtractionConfiguration =
    DEFAULT_FEATURE_EXTRACTION_CONFIGURATION,
): MarketFeatureVector {
  return new DefaultMarketFeatureExtractor().extract(input, configuration);
}