/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-context-builder.ts
 *
 * Builds a deterministic, immutable, execution-neutral market context from
 * validated raw market observations and a quality assessment.
 */

import {
  BasisPoints,
  ConfidenceScore,
  DurationMs,
  JsonValue,
  LiquidityState,
  MarketDataQuality,
  MarketDataQualityAssessment,
  MarketIdentity,
  MarketInstrumentType,
  MarketIntelligenceInput,
  MarketTimeframe,
  NormalizedScore,
  Notional,
  OrderBookSnapshot,
  Percentage,
  Price,
  Quantity,
  ReferenceMarketInput,
  SymbolId,
  TimeRange,
  TimestampMs,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const DEFAULT_ROUNDING_DECIMALS = 12;

export type MarketContextId = string;

export enum MarketSession {
  ASIA = "ASIA",
  EUROPE = "EUROPE",
  AMERICAS = "AMERICAS",
  WEEKEND = "WEEKEND",
}

export enum MarketTrendDirection {
  STRONG_DOWN = "STRONG_DOWN",
  DOWN = "DOWN",
  FLAT = "FLAT",
  UP = "UP",
  STRONG_UP = "STRONG_UP",
}

export enum MarketVolatilityCondition {
  EXTREMELY_LOW = "EXTREMELY_LOW",
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
  EXTREMELY_HIGH = "EXTREMELY_HIGH",
}

export interface MarketPriceContext {
  readonly lastPrice: Price;
  readonly previousClose?: Price;
  readonly sessionOpen?: Price;
  readonly sessionHigh?: Price;
  readonly sessionLow?: Price;
  readonly bestBid?: Price;
  readonly bestAsk?: Price;
  readonly midPrice?: Price;
  readonly spread?: Price;
  readonly spreadBps?: BasisPoints;
  readonly simpleReturn: Percentage;
  readonly logarithmicReturn: Percentage;
  readonly distanceFromSessionOpen: Percentage;
  readonly positionInObservedRange: NormalizedScore;
}

export interface MarketVolumeContext {
  readonly latestBaseVolume: Quantity;
  readonly latestQuoteVolume: Notional;
  readonly totalBaseVolume: Quantity;
  readonly totalQuoteVolume: Notional;
  readonly averageBaseVolume: Quantity;
  readonly relativeVolume: number;
  readonly tradeCount: number;
  readonly aggressiveBuyNotional: Notional;
  readonly aggressiveSellNotional: Notional;
  readonly aggressiveBuyRatio: NormalizedScore;
  readonly aggressiveSellRatio: NormalizedScore;
  readonly cumulativeVolumeDelta: Notional;
}

export interface MarketLiquidityContext {
  readonly state: LiquidityState;
  readonly bidDepth: Notional;
  readonly askDepth: Notional;
  readonly totalDepth: Notional;
  readonly depthImbalance: number;
  readonly spreadBps: BasisPoints;
  readonly topOfBookBidQuantity: Quantity;
  readonly topOfBookAskQuantity: Quantity;
  readonly microPrice?: Price;
  readonly healthScore: NormalizedScore;
}

export interface MarketVolatilityContext {
  readonly realizedVolatility: Percentage;
  readonly annualizedVolatility: Percentage;
  readonly averageTrueRange: Price;
  readonly normalizedAverageTrueRange: Percentage;
  readonly downsideVolatility: Percentage;
  readonly upsideVolatility: Percentage;
  readonly condition: MarketVolatilityCondition;
  readonly expansionScore: NormalizedScore;
}

export interface MarketTrendContext {
  readonly direction: MarketTrendDirection;
  readonly slope: number;
  readonly normalizedSlope: number;
  readonly strength: NormalizedScore;
  readonly efficiencyRatio: NormalizedScore;
  readonly shortMovingAverage: Price;
  readonly longMovingAverage: Price;
  readonly movingAverageSpread: Percentage;
  readonly momentum: Percentage;
}

export interface MarketDerivativesContext {
  readonly fundingRate?: Percentage;
  readonly predictedFundingRate?: Percentage;
  readonly annualizedFundingRate?: Percentage;
  readonly nextFundingTimeMs?: TimestampMs;
  readonly openInterest?: Quantity;
  readonly openInterestNotional?: Notional;
  readonly openInterestChange?: Percentage;
  readonly longLiquidationNotional: Notional;
  readonly shortLiquidationNotional: Notional;
  readonly liquidationImbalance: number;
}

export interface MarketBreadthContext {
  readonly available: boolean;
  readonly advancingAssets: number;
  readonly decliningAssets: number;
  readonly unchangedAssets: number;
  readonly advanceDeclineRatio: number;
  readonly advancingRatio: NormalizedScore;
  readonly decliningRatio: NormalizedScore;
  readonly aboveMovingAverageRatio?: NormalizedScore;
  readonly newHighLowSpread?: number;
}

export interface ReferenceMarketContext {
  readonly symbol: SymbolId;
  readonly timeframe: MarketTimeframe;
  readonly latestPrice?: Price;
  readonly periodReturn: Percentage;
  readonly correlation: number;
  readonly relativeStrength: number;
  readonly quality: MarketDataQuality;
  readonly qualityScore: NormalizedScore;
}

export interface MarketTemporalContext {
  readonly analysisTimeMs: TimestampMs;
  readonly utcHour: number;
  readonly utcDayOfWeek: number;
  readonly session: MarketSession;
  readonly isWeekend: boolean;
  readonly observationAgeMs: DurationMs;
  readonly observationDurationMs: DurationMs;
}

export interface MarketContextSummary {
  readonly priceAvailable: boolean;
  readonly orderBookAvailable: boolean;
  readonly tradesAvailable: boolean;
  readonly derivativesAvailable: boolean;
  readonly breadthAvailable: boolean;
  readonly referenceMarketCount: number;
  readonly quality: MarketDataQuality;
  readonly confidence: ConfidenceScore;
  readonly warnings: readonly string[];
}

export interface MarketContextSnapshot {
  readonly id: MarketContextId;
  readonly market: MarketIdentity;
  readonly timeframe: MarketTimeframe;
  readonly generatedAtMs: TimestampMs;
  readonly observationWindow: TimeRange;
  readonly price: MarketPriceContext;
  readonly volume: MarketVolumeContext;
  readonly liquidity: MarketLiquidityContext;
  readonly volatility: MarketVolatilityContext;
  readonly trend: MarketTrendContext;
  readonly derivatives: MarketDerivativesContext;
  readonly breadth: MarketBreadthContext;
  readonly references: readonly ReferenceMarketContext[];
  readonly temporal: MarketTemporalContext;
  readonly qualityAssessment: MarketDataQualityAssessment;
  readonly summary: MarketContextSummary;
  readonly deterministicFingerprint: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface MarketContextBuilderConfiguration {
  readonly shortTrendLookback: number;
  readonly longTrendLookback: number;
  readonly volatilityLookback: number;
  readonly liquidityDepthLevels: number;
  readonly annualizationPeriods: number;
  readonly deepLiquidityNotionalThreshold: Notional;
  readonly healthyLiquidityNotionalThreshold: Notional;
  readonly thinLiquidityNotionalThreshold: Notional;
  readonly stressedSpreadBpsThreshold: BasisPoints;
  readonly dislocatedSpreadBpsThreshold: BasisPoints;
  readonly lowVolatilityThreshold: Percentage;
  readonly highVolatilityThreshold: Percentage;
  readonly extremeVolatilityThreshold: Percentage;
  readonly minimumContextConfidence: ConfidenceScore;
  readonly requireClosedCandles: boolean;
  readonly includeReferenceMarkets: boolean;
  readonly deterministicRoundingDecimals: number;
}

export interface MarketContextBuilder {
  build(
    input: MarketIntelligenceInput,
    qualityAssessment?: MarketDataQualityAssessment,
  ): MarketContextSnapshot;
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

function safeDivide(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  return Math.abs(denominator) <= EPSILON
    ? fallback
    : numerator / denominator;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) /
        values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((total, value) => {
      const difference = value - average;
      return total + difference * difference;
    }, 0) /
    (values.length - 1);

  return Math.sqrt(Math.max(0, variance));
}

function tail<TValue>(
  values: readonly TValue[],
  count: number,
): readonly TValue[] {
  return values.slice(
    Math.max(0, values.length - Math.max(0, Math.floor(count))),
  );
}

function simpleReturns(values: readonly number[]): readonly number[] {
  const result: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    result.push(safeDivide(current - previous, previous));
  }

  return result;
}

function logReturns(values: readonly number[]): readonly number[] {
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

function covariance(
  left: readonly number[],
  right: readonly number[],
): number {
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

function correlation(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);

  if (length < 2) {
    return 0;
  }

  const leftValues = tail(left, length);
  const rightValues = tail(right, length);
  const denominator =
    standardDeviation(leftValues) *
    standardDeviation(rightValues);

  return clamp(
    safeDivide(covariance(leftValues, rightValues), denominator),
    -1,
    1,
  );
}

function linearSlope(values: readonly number[]): number {
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

function efficiencyRatio(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const direction = Math.abs(
    values[values.length - 1]! - values[0]!,
  );
  let path = 0;

  for (let index = 1; index < values.length; index += 1) {
    path += Math.abs(values[index]! - values[index - 1]!);
  }

  return clamp(safeDivide(direction, path), 0, 1);
}

function trueRanges(
  candles: MarketIntelligenceInput["candles"],
): readonly number[] {
  const result: number[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    const previousClose =
      index === 0
        ? Number(candle.open)
        : Number(candles[index - 1]!.close);

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

function liquidityDepth(
  book: OrderBookSnapshot,
  side: "BID" | "ASK",
  levels: number,
): number {
  const selected =
    side === "BID"
      ? book.bids.slice(0, levels)
      : book.asks.slice(0, levels);

  return selected.reduce(
    (total, level) =>
      total + Number(level.price) * Number(level.quantity),
    0,
  );
}

function weightedQualityScore(
  assessment: MarketDataQualityAssessment,
): number {
  return clamp(
    Number(assessment.completenessScore) * 0.3 +
      Number(assessment.freshnessScore) * 0.25 +
      Number(assessment.consistencyScore) * 0.25 +
      Number(assessment.orderingScore) * 0.2,
    0,
    1,
  );
}

function determineSession(timestamp: number): MarketSession {
  const date = new Date(timestamp);
  const day = date.getUTCDay();

  if (day === 0 || day === 6) {
    return MarketSession.WEEKEND;
  }

  const hour = date.getUTCHours();

  if (hour < 8) {
    return MarketSession.ASIA;
  }

  if (hour < 16) {
    return MarketSession.EUROPE;
  }

  return MarketSession.AMERICAS;
}

function determineTrendDirection(
  normalizedSlope: number,
  strength: number,
): MarketTrendDirection {
  if (strength < 0.1 || Math.abs(normalizedSlope) <= EPSILON) {
    return MarketTrendDirection.FLAT;
  }

  if (normalizedSlope > 0) {
    return strength >= 0.65
      ? MarketTrendDirection.STRONG_UP
      : MarketTrendDirection.UP;
  }

  return strength >= 0.65
    ? MarketTrendDirection.STRONG_DOWN
    : MarketTrendDirection.DOWN;
}

function determineVolatilityCondition(
  realized: number,
  configuration: MarketContextBuilderConfiguration,
): MarketVolatilityCondition {
  if (realized >= Number(configuration.extremeVolatilityThreshold)) {
    return MarketVolatilityCondition.EXTREMELY_HIGH;
  }

  if (realized >= Number(configuration.highVolatilityThreshold)) {
    return MarketVolatilityCondition.HIGH;
  }

  if (realized <= Number(configuration.lowVolatilityThreshold) * 0.5) {
    return MarketVolatilityCondition.EXTREMELY_LOW;
  }

  if (realized <= Number(configuration.lowVolatilityThreshold)) {
    return MarketVolatilityCondition.LOW;
  }

  return MarketVolatilityCondition.NORMAL;
}

function determineLiquidityState(
  totalDepth: number,
  spreadBps: number,
  configuration: MarketContextBuilderConfiguration,
): LiquidityState {
  if (
    spreadBps >=
    Number(configuration.dislocatedSpreadBpsThreshold)
  ) {
    return LiquidityState.DISLOCATED;
  }

  if (
    spreadBps >= Number(configuration.stressedSpreadBpsThreshold) ||
    totalDepth < Number(configuration.thinLiquidityNotionalThreshold)
  ) {
    return LiquidityState.STRESSED;
  }

  if (
    totalDepth >= Number(configuration.deepLiquidityNotionalThreshold)
  ) {
    return LiquidityState.DEEP;
  }

  if (
    totalDepth >=
    Number(configuration.healthyLiquidityNotionalThreshold)
  ) {
    return LiquidityState.HEALTHY;
  }

  if (
    totalDepth >= Number(configuration.thinLiquidityNotionalThreshold)
  ) {
    return LiquidityState.NORMAL;
  }

  return LiquidityState.THIN;
}

function stableSerialize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as Readonly<Record<string, JsonValue>>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerialize(
          record[key] ?? null,
        )}`,
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

function createContextId(fingerprint: string): MarketContextId {
  return `market-context-${fingerprint}`;
}

function validateConfiguration(
  configuration: MarketContextBuilderConfiguration,
): void {
  const positiveIntegers = [
    configuration.shortTrendLookback,
    configuration.longTrendLookback,
    configuration.volatilityLookback,
    configuration.liquidityDepthLevels,
    configuration.annualizationPeriods,
  ];

  if (
    positiveIntegers.some(
      (value) => !Number.isInteger(value) || value <= 0,
    )
  ) {
    throw new Error(
      "Market-context lookbacks, depth, and annualization periods must be positive integers.",
    );
  }

  if (
    configuration.shortTrendLookback >
    configuration.longTrendLookback
  ) {
    throw new Error(
      "shortTrendLookback cannot exceed longTrendLookback.",
    );
  }

  if (
    Number(configuration.deepLiquidityNotionalThreshold) <
      Number(configuration.healthyLiquidityNotionalThreshold) ||
    Number(configuration.healthyLiquidityNotionalThreshold) <
      Number(configuration.thinLiquidityNotionalThreshold)
  ) {
    throw new Error(
      "Liquidity notional thresholds must descend from deep to healthy to thin.",
    );
  }

  if (
    Number(configuration.dislocatedSpreadBpsThreshold) <
    Number(configuration.stressedSpreadBpsThreshold)
  ) {
    throw new Error(
      "Dislocated spread threshold cannot be below stressed threshold.",
    );
  }
}

function buildReferenceContext(
  reference: ReferenceMarketInput,
  primaryReturns: readonly number[],
  primaryPeriodReturn: number,
  decimals: number,
): ReferenceMarketContext {
  const closes = reference.candles.map((candle) =>
    Number(candle.close),
  );
  const returns = logReturns(closes);
  const latestPrice = closes.at(-1);
  const firstPrice = closes[0];
  const periodReturn =
    latestPrice === undefined || firstPrice === undefined
      ? 0
      : safeDivide(latestPrice - firstPrice, firstPrice);
  const qualityScore = weightedQualityScore(
    reference.qualityAssessment,
  );

  return deepFreeze({
    symbol: reference.market.symbol,
    timeframe: reference.timeframe,
    ...(latestPrice === undefined
      ? {}
      : { latestPrice: round(latestPrice, decimals) as Price }),
    periodReturn: round(periodReturn, decimals) as Percentage,
    correlation: round(
      correlation(primaryReturns, returns),
      decimals,
    ),
    relativeStrength: round(
      periodReturn - primaryPeriodReturn,
      decimals,
    ),
    quality: reference.qualityAssessment.quality,
    qualityScore: round(
      qualityScore,
      decimals,
    ) as NormalizedScore,
  });
}

export const DEFAULT_MARKET_CONTEXT_BUILDER_CONFIGURATION: MarketContextBuilderConfiguration =
  deepFreeze({
    shortTrendLookback: 10,
    longTrendLookback: 30,
    volatilityLookback: 20,
    liquidityDepthLevels: 10,
    annualizationPeriods: 365,
    deepLiquidityNotionalThreshold: 10_000_000 as Notional,
    healthyLiquidityNotionalThreshold: 1_000_000 as Notional,
    thinLiquidityNotionalThreshold: 100_000 as Notional,
    stressedSpreadBpsThreshold: 25 as BasisPoints,
    dislocatedSpreadBpsThreshold: 100 as BasisPoints,
    lowVolatilityThreshold: 0.005 as Percentage,
    highVolatilityThreshold: 0.03 as Percentage,
    extremeVolatilityThreshold: 0.08 as Percentage,
    minimumContextConfidence: 0.5 as ConfidenceScore,
    requireClosedCandles: true,
    includeReferenceMarkets: true,
    deterministicRoundingDecimals: DEFAULT_ROUNDING_DECIMALS,
  });

export class DefaultMarketContextBuilder
  implements MarketContextBuilder
{
  private readonly configuration: MarketContextBuilderConfiguration;

  public constructor(
    configuration: MarketContextBuilderConfiguration =
      DEFAULT_MARKET_CONTEXT_BUILDER_CONFIGURATION,
  ) {
    validateConfiguration(configuration);
    this.configuration = deepFreeze({ ...configuration });
  }

  public build(
    input: MarketIntelligenceInput,
    qualityAssessment: MarketDataQualityAssessment =
      input.qualityAssessment,
  ): MarketContextSnapshot {
    const decimals =
      this.configuration.deterministicRoundingDecimals;

    const sortedCandles = [...input.candles]
      .filter(
        (candle) =>
          !this.configuration.requireClosedCandles ||
          candle.isClosed,
      )
      .sort(
        (left, right) =>
          Number(left.openTimeMs) - Number(right.openTimeMs),
      );

    if (sortedCandles.length === 0) {
      throw new Error(
        "Market context requires at least one eligible candle.",
      );
    }

    const closes = sortedCandles.map((candle) =>
      Number(candle.close),
    );
    const latestCandle = sortedCandles.at(-1)!;
    const previousCandle =
      sortedCandles.length > 1
        ? sortedCandles[sortedCandles.length - 2]
        : undefined;
    const lastPrice = Number(latestCandle.close);
    const previousClose =
      previousCandle === undefined
        ? undefined
        : Number(previousCandle.close);
    const sessionOpen = Number(sortedCandles[0]!.open);
    const sessionHigh = Math.max(
      ...sortedCandles.map((candle) => Number(candle.high)),
    );
    const sessionLow = Math.min(
      ...sortedCandles.map((candle) => Number(candle.low)),
    );

    const books = [...(input.orderBooks ?? [])].sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    );
    const latestBook = books.at(-1);
    const bestBid =
      latestBook === undefined
        ? undefined
        : latestBook.bestBid === undefined
          ? latestBook.bids[0]?.price
          : latestBook.bestBid;
    const bestAsk =
      latestBook === undefined
        ? undefined
        : latestBook.bestAsk === undefined
          ? latestBook.asks[0]?.price
          : latestBook.bestAsk;
    const midPrice =
      latestBook === undefined
        ? undefined
        : latestBook.midPrice ??
          (bestBid !== undefined && bestAsk !== undefined
            ? (((Number(bestBid) + Number(bestAsk)) / 2) as Price)
            : undefined);
    const spread =
      latestBook === undefined
        ? undefined
        : latestBook.spread ??
          (bestBid !== undefined && bestAsk !== undefined
            ? ((Number(bestAsk) - Number(bestBid)) as Price)
            : undefined);
    const spreadBps =
      latestBook === undefined
        ? 0
        : latestBook.spreadBps === undefined
          ? safeDivide(
              Number(spread ?? 0),
              Number(midPrice ?? lastPrice),
            ) * 10_000
          : Number(latestBook.spreadBps);

    const trades = [...(input.trades ?? [])].sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    );
    const aggressiveBuyNotional = sum(
      trades
        .filter((trade) => trade.aggressorSide === "BUY")
        .map((trade) => Number(trade.notional)),
    );
    const aggressiveSellNotional = sum(
      trades
        .filter((trade) => trade.aggressorSide === "SELL")
        .map((trade) => Number(trade.notional)),
    );
    const aggressiveTotal =
      aggressiveBuyNotional + aggressiveSellNotional;

    const volumes = sortedCandles.map((candle) =>
      Number(candle.volume),
    );
    const quoteVolumes = sortedCandles.map((candle) =>
      Number(candle.quoteVolume ?? 0),
    );
    const latestBaseVolume = volumes.at(-1) ?? 0;
    const latestQuoteVolume = quoteVolumes.at(-1) ?? 0;
    const averageBaseVolume = mean(volumes);

    const bidDepth =
      latestBook === undefined
        ? 0
        : liquidityDepth(
            latestBook,
            "BID",
            this.configuration.liquidityDepthLevels,
          );
    const askDepth =
      latestBook === undefined
        ? 0
        : liquidityDepth(
            latestBook,
            "ASK",
            this.configuration.liquidityDepthLevels,
          );
    const totalDepth = bidDepth + askDepth;
    const depthImbalance = safeDivide(
      bidDepth - askDepth,
      totalDepth,
    );
    const bestBidQuantity = Number(
      latestBook?.bids[0]?.quantity ?? 0,
    );
    const bestAskQuantity = Number(
      latestBook?.asks[0]?.quantity ?? 0,
    );
    const microPrice =
      bestBid === undefined || bestAsk === undefined
        ? undefined
        : safeDivide(
            Number(bestAsk) * bestBidQuantity +
              Number(bestBid) * bestAskQuantity,
            bestBidQuantity + bestAskQuantity,
            Number(midPrice ?? lastPrice),
          );

    const liquidityState = determineLiquidityState(
      totalDepth,
      spreadBps,
      this.configuration,
    );
    const depthScore = clamp(
      safeDivide(
        totalDepth,
        Number(
          this.configuration.healthyLiquidityNotionalThreshold,
        ),
      ),
      0,
      1,
    );
    const spreadScore = clamp(
      1 -
        safeDivide(
          spreadBps,
          Number(
            this.configuration.dislocatedSpreadBpsThreshold,
          ),
        ),
      0,
      1,
    );
    const liquidityHealth = clamp(
      depthScore * 0.65 + spreadScore * 0.35,
      0,
      1,
    );

    const selectedReturns = tail(
      logReturns(closes),
      this.configuration.volatilityLookback,
    );
    const realizedVolatility =
      standardDeviation(selectedReturns);
    const annualizedVolatility =
      realizedVolatility *
      Math.sqrt(this.configuration.annualizationPeriods);
    const selectedCandles = tail(
      sortedCandles,
      this.configuration.volatilityLookback,
    );
    const atr = mean(trueRanges(selectedCandles));
    const downsideVolatility = standardDeviation(
      selectedReturns.filter((value) => value < 0),
    );
    const upsideVolatility = standardDeviation(
      selectedReturns.filter((value) => value > 0),
    );
    const firstHalf = selectedReturns.slice(
      0,
      Math.floor(selectedReturns.length / 2),
    );
    const secondHalf = selectedReturns.slice(
      Math.floor(selectedReturns.length / 2),
    );
    const expansionScore = clamp(
      safeDivide(
        standardDeviation(secondHalf) -
          standardDeviation(firstHalf),
        Math.max(standardDeviation(firstHalf), EPSILON),
      ) *
        0.5 +
        0.5,
      0,
      1,
    );

    const shortValues = tail(
      closes,
      this.configuration.shortTrendLookback,
    );
    const longValues = tail(
      closes,
      this.configuration.longTrendLookback,
    );
    const shortMovingAverage = mean(shortValues);
    const longMovingAverage = mean(longValues);
    const slope = linearSlope(longValues);
    const normalizedSlope = safeDivide(
      slope,
      Math.abs(longMovingAverage),
    );
    const efficiency = efficiencyRatio(longValues);
    const trendStrength = clamp(
      Math.abs(normalizedSlope) *
        longValues.length *
        efficiency,
      0,
      1,
    );
    const momentum = safeDivide(
      lastPrice - longValues[0]!,
      longValues[0]!,
    );

    const funding = input.fundingRates?.at(-1);
    const openInterest = input.openInterest?.at(-1);
    const liquidation = input.liquidations?.at(-1);
    const longLiquidationNotional = Number(
      liquidation?.longLiquidationNotional ?? 0,
    );
    const shortLiquidationNotional = Number(
      liquidation?.shortLiquidationNotional ?? 0,
    );

    const breadth = input.marketBreadth?.at(-1);
    const breadthTotal =
      breadth === undefined
        ? 0
        : breadth.advancingAssets +
          breadth.decliningAssets +
          breadth.unchangedAssets;

    const primaryReturns = logReturns(closes);
    const firstClose = closes[0]!;
    const primaryPeriodReturn = safeDivide(
      lastPrice - firstClose,
      firstClose,
    );
    const references = this.configuration.includeReferenceMarkets
      ? [...(input.referenceMarkets ?? [])]
          .sort((left, right) =>
            String(left.market.symbol).localeCompare(
              String(right.market.symbol),
            ),
          )
          .map((reference) =>
            buildReferenceContext(
              reference,
              primaryReturns,
              primaryPeriodReturn,
              decimals,
            ),
          )
      : [];

    const latestObservationTime = Math.max(
      Number(latestCandle.closeTimeMs),
      Number(latestBook?.eventTimeMs ?? 0),
      Number(trades.at(-1)?.eventTimeMs ?? 0),
      Number(funding?.eventTimeMs ?? 0),
      Number(openInterest?.eventTimeMs ?? 0),
      Number(liquidation?.eventTimeMs ?? 0),
      Number(breadth?.eventTimeMs ?? 0),
    );

    const date = new Date(Number(input.analysisTimeMs));
    const qualityScore = weightedQualityScore(qualityAssessment);
    const availabilityScore =
      [
        true,
        latestBook !== undefined,
        trades.length > 0,
        funding !== undefined ||
          openInterest !== undefined ||
          liquidation !== undefined,
        breadth !== undefined,
      ].filter(Boolean).length / 5;
    const confidence = clamp(
      qualityScore * 0.8 + availabilityScore * 0.2,
      0,
      1,
    );

    const warnings = [...qualityAssessment.warnings];

    if (latestBook === undefined) {
      warnings.push(
        "Order-book context is unavailable; liquidity context uses neutral zero-depth values.",
      );
    }

    if (trades.length === 0) {
      warnings.push(
        "Trade context is unavailable; order-flow volume values are neutral.",
      );
    }

    if (
      input.market.instrumentType !== MarketInstrumentType.SPOT &&
      funding === undefined &&
      openInterest === undefined
    ) {
      warnings.push(
        "Derivative market context has no funding-rate or open-interest observations.",
      );
    }

    if (
      confidence <
      Number(this.configuration.minimumContextConfidence)
    ) {
      warnings.push(
        `Context confidence ${round(
          confidence,
          decimals,
        )} is below configured minimum ${Number(
          this.configuration.minimumContextConfidence,
        )}.`,
      );
    }

    const fingerprintPayload: JsonValue = {
      market: {
        symbol: String(input.market.symbol),
        venueId: String(input.market.venueId),
        instrumentType: input.market.instrumentType,
      },
      timeframe: input.timeframe,
      analysisTimeMs: Number(input.analysisTimeMs),
      observationWindow: {
        startTimeMs: Number(input.observationWindow.startTimeMs),
        endTimeMs: Number(input.observationWindow.endTimeMs),
      },
      price: {
        lastPrice: round(lastPrice, decimals),
        spreadBps: round(spreadBps, decimals),
        simpleReturn: round(
          previousClose === undefined
            ? 0
            : safeDivide(
                lastPrice - previousClose,
                previousClose,
              ),
          decimals,
        ),
      },
      volume: {
        totalBaseVolume: round(sum(volumes), decimals),
        relativeVolume: round(
          safeDivide(latestBaseVolume, averageBaseVolume, 1),
          decimals,
        ),
        cumulativeVolumeDelta: round(
          aggressiveBuyNotional - aggressiveSellNotional,
          decimals,
        ),
      },
      liquidity: {
        totalDepth: round(totalDepth, decimals),
        state: liquidityState,
        healthScore: round(liquidityHealth, decimals),
      },
      volatility: {
        realized: round(realizedVolatility, decimals),
        annualized: round(annualizedVolatility, decimals),
      },
      trend: {
        normalizedSlope: round(normalizedSlope, decimals),
        strength: round(trendStrength, decimals),
      },
      quality: {
        classification: qualityAssessment.quality,
        score: round(qualityScore, decimals),
      },
      references: references.map((reference) => ({
        symbol: String(reference.symbol),
        correlation: reference.correlation,
        relativeStrength: reference.relativeStrength,
      })),
    };

    const deterministicFingerprint = fnv1a64(
      stableSerialize(fingerprintPayload),
    );

    return deepFreeze({
      id: createContextId(deterministicFingerprint),
      market: input.market,
      timeframe: input.timeframe,
      generatedAtMs: input.analysisTimeMs,
      observationWindow: input.observationWindow,
      price: {
        lastPrice: round(lastPrice, decimals) as Price,
        ...(previousClose === undefined
          ? {}
          : {
              previousClose: round(
                previousClose,
                decimals,
              ) as Price,
            }),
        sessionOpen: round(sessionOpen, decimals) as Price,
        sessionHigh: round(sessionHigh, decimals) as Price,
        sessionLow: round(sessionLow, decimals) as Price,
        ...(bestBid === undefined
          ? {}
          : {
              bestBid: round(
                Number(bestBid),
                decimals,
              ) as Price,
            }),
        ...(bestAsk === undefined
          ? {}
          : {
              bestAsk: round(
                Number(bestAsk),
                decimals,
              ) as Price,
            }),
        ...(midPrice === undefined
          ? {}
          : {
              midPrice: round(
                Number(midPrice),
                decimals,
              ) as Price,
            }),
        ...(spread === undefined
          ? {}
          : {
              spread: round(
                Number(spread),
                decimals,
              ) as Price,
            }),
        ...(latestBook === undefined
          ? {}
          : {
              spreadBps: round(
                spreadBps,
                decimals,
              ) as BasisPoints,
            }),
        simpleReturn: round(
          previousClose === undefined
            ? 0
            : safeDivide(
                lastPrice - previousClose,
                previousClose,
              ),
          decimals,
        ) as Percentage,
        logarithmicReturn: round(
          previousClose !== undefined &&
            previousClose > 0 &&
            lastPrice > 0
            ? Math.log(lastPrice / previousClose)
            : 0,
          decimals,
        ) as Percentage,
        distanceFromSessionOpen: round(
          safeDivide(
            lastPrice - sessionOpen,
            sessionOpen,
          ),
          decimals,
        ) as Percentage,
        positionInObservedRange: round(
          safeDivide(
            lastPrice - sessionLow,
            sessionHigh - sessionLow,
            0.5,
          ),
          decimals,
        ) as NormalizedScore,
      },
      volume: {
        latestBaseVolume: round(
          latestBaseVolume,
          decimals,
        ) as Quantity,
        latestQuoteVolume: round(
          latestQuoteVolume,
          decimals,
        ) as Notional,
        totalBaseVolume: round(
          sum(volumes),
          decimals,
        ) as Quantity,
        totalQuoteVolume: round(
          sum(quoteVolumes),
          decimals,
        ) as Notional,
        averageBaseVolume: round(
          averageBaseVolume,
          decimals,
        ) as Quantity,
        relativeVolume: round(
          safeDivide(
            latestBaseVolume,
            averageBaseVolume,
            1,
          ),
          decimals,
        ),
        tradeCount: trades.length,
        aggressiveBuyNotional: round(
          aggressiveBuyNotional,
          decimals,
        ) as Notional,
        aggressiveSellNotional: round(
          aggressiveSellNotional,
          decimals,
        ) as Notional,
        aggressiveBuyRatio: round(
          safeDivide(
            aggressiveBuyNotional,
            aggressiveTotal,
            0.5,
          ),
          decimals,
        ) as NormalizedScore,
        aggressiveSellRatio: round(
          safeDivide(
            aggressiveSellNotional,
            aggressiveTotal,
            0.5,
          ),
          decimals,
        ) as NormalizedScore,
        cumulativeVolumeDelta: round(
          aggressiveBuyNotional - aggressiveSellNotional,
          decimals,
        ) as Notional,
      },
      liquidity: {
        state: liquidityState,
        bidDepth: round(bidDepth, decimals) as Notional,
        askDepth: round(askDepth, decimals) as Notional,
        totalDepth: round(totalDepth, decimals) as Notional,
        depthImbalance: round(depthImbalance, decimals),
        spreadBps: round(
          spreadBps,
          decimals,
        ) as BasisPoints,
        topOfBookBidQuantity: round(
          bestBidQuantity,
          decimals,
        ) as Quantity,
        topOfBookAskQuantity: round(
          bestAskQuantity,
          decimals,
        ) as Quantity,
        ...(microPrice === undefined
          ? {}
          : {
              microPrice: round(
                microPrice,
                decimals,
              ) as Price,
            }),
        healthScore: round(
          liquidityHealth,
          decimals,
        ) as NormalizedScore,
      },
      volatility: {
        realizedVolatility: round(
          realizedVolatility,
          decimals,
        ) as Percentage,
        annualizedVolatility: round(
          annualizedVolatility,
          decimals,
        ) as Percentage,
        averageTrueRange: round(atr, decimals) as Price,
        normalizedAverageTrueRange: round(
          safeDivide(atr, lastPrice),
          decimals,
        ) as Percentage,
        downsideVolatility: round(
          downsideVolatility,
          decimals,
        ) as Percentage,
        upsideVolatility: round(
          upsideVolatility,
          decimals,
        ) as Percentage,
        condition: determineVolatilityCondition(
          realizedVolatility,
          this.configuration,
        ),
        expansionScore: round(
          expansionScore,
          decimals,
        ) as NormalizedScore,
      },
      trend: {
        direction: determineTrendDirection(
          normalizedSlope,
          trendStrength,
        ),
        slope: round(slope, decimals),
        normalizedSlope: round(
          normalizedSlope,
          decimals,
        ),
        strength: round(
          trendStrength,
          decimals,
        ) as NormalizedScore,
        efficiencyRatio: round(
          efficiency,
          decimals,
        ) as NormalizedScore,
        shortMovingAverage: round(
          shortMovingAverage,
          decimals,
        ) as Price,
        longMovingAverage: round(
          longMovingAverage,
          decimals,
        ) as Price,
        movingAverageSpread: round(
          safeDivide(
            shortMovingAverage - longMovingAverage,
            longMovingAverage,
          ),
          decimals,
        ) as Percentage,
        momentum: round(momentum, decimals) as Percentage,
      },
      derivatives: {
        ...(funding === undefined
          ? {}
          : {
              fundingRate: round(
                Number(funding.fundingRate),
                decimals,
              ) as Percentage,
              ...(funding.predictedFundingRate === undefined
                ? {}
                : {
                    predictedFundingRate: round(
                      Number(funding.predictedFundingRate),
                      decimals,
                    ) as Percentage,
                  }),
              ...(funding.annualizedFundingRate === undefined
                ? {}
                : {
                    annualizedFundingRate: round(
                      Number(funding.annualizedFundingRate),
                      decimals,
                    ) as Percentage,
                  }),
              ...(funding.nextFundingTimeMs === undefined
                ? {}
                : {
                    nextFundingTimeMs:
                      funding.nextFundingTimeMs,
                  }),
            }),
        ...(openInterest === undefined
          ? {}
          : {
              openInterest: round(
                Number(openInterest.openInterest),
                decimals,
              ) as Quantity,
              ...(openInterest.openInterestNotional === undefined
                ? {}
                : {
                    openInterestNotional: round(
                      Number(openInterest.openInterestNotional),
                      decimals,
                    ) as Notional,
                  }),
              ...(openInterest.changePercentage === undefined
                ? {}
                : {
                    openInterestChange: round(
                      Number(openInterest.changePercentage),
                      decimals,
                    ) as Percentage,
                  }),
            }),
        longLiquidationNotional: round(
          longLiquidationNotional,
          decimals,
        ) as Notional,
        shortLiquidationNotional: round(
          shortLiquidationNotional,
          decimals,
        ) as Notional,
        liquidationImbalance: round(
          safeDivide(
            longLiquidationNotional -
              shortLiquidationNotional,
            longLiquidationNotional +
              shortLiquidationNotional,
          ),
          decimals,
        ),
      },
      breadth: {
        available: breadth !== undefined,
        advancingAssets: breadth?.advancingAssets ?? 0,
        decliningAssets: breadth?.decliningAssets ?? 0,
        unchangedAssets: breadth?.unchangedAssets ?? 0,
        advanceDeclineRatio: round(
          breadth?.advanceDeclineRatio ??
            safeDivide(
              breadth?.advancingAssets ?? 0,
              breadth?.decliningAssets ?? 0,
            ),
          decimals,
        ),
        advancingRatio: round(
          safeDivide(
            breadth?.advancingAssets ?? 0,
            breadthTotal,
          ),
          decimals,
        ) as NormalizedScore,
        decliningRatio: round(
          safeDivide(
            breadth?.decliningAssets ?? 0,
            breadthTotal,
          ),
          decimals,
        ) as NormalizedScore,
        ...(breadth?.aboveMovingAverageRatio === undefined
          ? {}
          : {
              aboveMovingAverageRatio:
                breadth.aboveMovingAverageRatio,
            }),
        ...(breadth?.newHighRatio === undefined &&
        breadth?.newLowRatio === undefined
          ? {}
          : {
              newHighLowSpread: round(
                Number(breadth?.newHighRatio ?? 0) -
                  Number(breadth?.newLowRatio ?? 0),
                decimals,
              ),
            }),
      },
      references: deepFreeze(references),
      temporal: {
        analysisTimeMs: input.analysisTimeMs,
        utcHour: date.getUTCHours(),
        utcDayOfWeek: date.getUTCDay(),
        session: determineSession(
          Number(input.analysisTimeMs),
        ),
        isWeekend:
          date.getUTCDay() === 0 ||
          date.getUTCDay() === 6,
        observationAgeMs: Math.max(
          0,
          Math.round(
            Number(input.analysisTimeMs) -
              latestObservationTime,
          ),
        ) as DurationMs,
        observationDurationMs: Math.max(
          0,
          Math.round(
            Number(input.observationWindow.endTimeMs) -
              Number(input.observationWindow.startTimeMs),
          ),
        ) as DurationMs,
      },
      qualityAssessment,
      summary: {
        priceAvailable: true,
        orderBookAvailable: latestBook !== undefined,
        tradesAvailable: trades.length > 0,
        derivativesAvailable:
          funding !== undefined ||
          openInterest !== undefined ||
          liquidation !== undefined,
        breadthAvailable: breadth !== undefined,
        referenceMarketCount: references.length,
        quality: qualityAssessment.quality,
        confidence: round(
          confidence,
          decimals,
        ) as ConfidenceScore,
        warnings: deepFreeze(warnings),
      },
      deterministicFingerprint,
      metadata: deepFreeze({
        builderVersion: "1.0.0",
        shortTrendLookback:
          this.configuration.shortTrendLookback,
        longTrendLookback:
          this.configuration.longTrendLookback,
        volatilityLookback:
          this.configuration.volatilityLookback,
        liquidityDepthLevels:
          this.configuration.liquidityDepthLevels,
        candleCount: sortedCandles.length,
        tradeCount: trades.length,
        orderBookCount: books.length,
      }),
    });
  }
}

export function createMarketContextBuilder(
  configuration: MarketContextBuilderConfiguration =
    DEFAULT_MARKET_CONTEXT_BUILDER_CONFIGURATION,
): MarketContextBuilder {
  return new DefaultMarketContextBuilder(configuration);
}

export function buildMarketContext(
  input: MarketIntelligenceInput,
  qualityAssessment: MarketDataQualityAssessment =
    input.qualityAssessment,
  configuration: MarketContextBuilderConfiguration =
    DEFAULT_MARKET_CONTEXT_BUILDER_CONFIGURATION,
): MarketContextSnapshot {
  return new DefaultMarketContextBuilder(configuration).build(
    input,
    qualityAssessment,
  );
}