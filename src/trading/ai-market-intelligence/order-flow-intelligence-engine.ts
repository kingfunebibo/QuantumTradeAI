/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/order-flow-intelligence-engine.ts
 *
 * Deterministic, immutable order-flow intelligence.
 */

import {
  ConfidenceScore,
  FeatureValueType,
  MarketFeature,
  MarketFeatureVector,
  MarketIntelligenceInput,
  NormalizedScore,
  OrderFlowBias,
  OrderFlowConfiguration,
  OrderFlowIntelligence,
  OrderFlowIntelligenceEngine,
  OrderFlowMetric,
  ParticipantActivity,
  Probability,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;

interface TradeStatistics {
  readonly totalCount: number;
  readonly classifiedCount: number;
  readonly buyCount: number;
  readonly sellCount: number;
  readonly totalNotional: number;
  readonly buyNotional: number;
  readonly sellNotional: number;
  readonly blockTradeCount: number;
  readonly blockBuyNotional: number;
  readonly blockSellNotional: number;
  readonly cumulativeVolumeDelta: number;
  readonly aggressiveBuyRatio: number;
  readonly aggressiveSellRatio: number;
  readonly averageTradeNotional: number;
  readonly blockTradeRatio: number;
  readonly notionalConcentration: number;
  readonly recentFlowAcceleration: number;
}

interface OrderBookStatistics {
  readonly bidNotional: number;
  readonly askNotional: number;
  readonly totalNotional: number;
  readonly bidAskImbalance: number;
  readonly spreadBps: number;
  readonly bidLevelCount: number;
  readonly askLevelCount: number;
}

interface DerivedScores {
  readonly buyPressure: number;
  readonly sellPressure: number;
  readonly absorptionScore: number;
  readonly exhaustionScore: number;
  readonly institutionalFootprintScore: number;
  readonly reversalProbability: number;
  readonly continuationProbability: number;
  readonly confidence: number;
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

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** ROUNDING_DECIMALS;
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

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function featureMap(
  vector: MarketFeatureVector,
): ReadonlyMap<string, MarketFeature> {
  return new Map(
    vector.features.map((feature) => [
      feature.definition.featureName,
      feature,
    ]),
  );
}

function scalarFeature(
  features: ReadonlyMap<string, MarketFeature>,
  names: readonly string[],
  fallback = 0,
): number {
  for (const name of names) {
    const feature = features.get(name);

    if (
      feature !== undefined &&
      !feature.isMissing &&
      feature.value.type === FeatureValueType.SCALAR &&
      Number.isFinite(feature.value.value)
    ) {
      return feature.value.value;
    }
  }

  return fallback;
}

function normalizeSigned(value: number, scale: number): number {
  return clamp(safeDivide(value, Math.max(scale, EPSILON)), -1, 1);
}

function latestOrderBook(input: MarketIntelligenceInput) {
  return [...(input.orderBooks ?? [])]
    .sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    )
    .at(-1);
}

function levelNotional(
  levels: readonly {
    readonly price: number;
    readonly quantity: number;
  }[],
  depthLevels: number,
): number {
  return levels
    .slice(0, depthLevels)
    .reduce(
      (total, level) =>
        total + Number(level.price) * Number(level.quantity),
      0,
    );
}

function calculateOrderBookStatistics(
  input: MarketIntelligenceInput,
  configuration: OrderFlowConfiguration,
  features: ReadonlyMap<string, MarketFeature>,
): OrderBookStatistics {
  const book = latestOrderBook(input);

  const bidNotional =
    book === undefined
      ? Math.max(
          0,
          scalarFeature(features, ["liquidity.bid_depth"]),
        )
      : levelNotional(
          book.bids,
          configuration.orderBookDepthLevels,
        );

  const askNotional =
    book === undefined
      ? Math.max(
          0,
          scalarFeature(features, ["liquidity.ask_depth"]),
        )
      : levelNotional(
          book.asks,
          configuration.orderBookDepthLevels,
        );

  const totalNotional = bidNotional + askNotional;
  const bidAskImbalance =
    totalNotional > 0
      ? (bidNotional - askNotional) / totalNotional
      : clamp(
          scalarFeature(features, [
            "liquidity.depth_imbalance",
            "microstructure.order_book_imbalance",
          ]),
          -1,
          1,
        );

  return deepFreeze({
    bidNotional: round(bidNotional),
    askNotional: round(askNotional),
    totalNotional: round(totalNotional),
    bidAskImbalance: round(
      clamp(bidAskImbalance, -1, 1),
    ),
    spreadBps: round(
      Math.max(
        0,
        book?.spreadBps === undefined
          ? scalarFeature(features, [
              "liquidity.spread_bps",
              "microstructure.spread_bps",
            ])
          : Number(book.spreadBps),
      ),
    ),
    bidLevelCount:
      book?.bids.slice(
        0,
        configuration.orderBookDepthLevels,
      ).length ?? 0,
    askLevelCount:
      book?.asks.slice(
        0,
        configuration.orderBookDepthLevels,
      ).length ?? 0,
  });
}

function calculateTradeStatistics(
  input: MarketIntelligenceInput,
  configuration: OrderFlowConfiguration,
): TradeStatistics {
  const trades = [...(input.trades ?? [])]
    .sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs) ||
        left.tradeId.localeCompare(right.tradeId),
    )
    .slice(-configuration.tradeLookbackCount);

  let buyCount = 0;
  let sellCount = 0;
  let buyNotional = 0;
  let sellNotional = 0;
  let totalNotional = 0;
  let blockTradeCount = 0;
  let blockBuyNotional = 0;
  let blockSellNotional = 0;

  const notionals: number[] = [];
  const signedNotionals: number[] = [];

  for (const trade of trades) {
    const notional = Math.max(0, Number(trade.notional));
    totalNotional += notional;
    notionals.push(notional);

    const isBlock =
      trade.isBlockTrade === true ||
      notional >=
        Number(configuration.blockTradeNotionalThreshold);

    if (isBlock) {
      blockTradeCount += 1;
    }

    if (trade.aggressorSide === "BUY") {
      buyCount += 1;
      buyNotional += notional;
      signedNotionals.push(notional);

      if (isBlock) {
        blockBuyNotional += notional;
      }
    } else if (trade.aggressorSide === "SELL") {
      sellCount += 1;
      sellNotional += notional;
      signedNotionals.push(-notional);

      if (isBlock) {
        blockSellNotional += notional;
      }
    }
  }

  const classifiedCount = buyCount + sellCount;
  const classifiedNotional = buyNotional + sellNotional;
  const midpoint = Math.floor(signedNotionals.length / 2);
  const earlierDelta = signedNotionals
    .slice(0, midpoint)
    .reduce((total, value) => total + value, 0);
  const recentDelta = signedNotionals
    .slice(midpoint)
    .reduce((total, value) => total + value, 0);
  const earlierNotional = signedNotionals
    .slice(0, midpoint)
    .reduce((total, value) => total + Math.abs(value), 0);
  const recentNotional = signedNotionals
    .slice(midpoint)
    .reduce((total, value) => total + Math.abs(value), 0);

  const earlierNormalized = safeDivide(
    earlierDelta,
    earlierNotional,
  );
  const recentNormalized = safeDivide(
    recentDelta,
    recentNotional,
  );

  const sortedNotionals = [...notionals].sort(
    (left, right) => right - left,
  );
  const topCount = Math.max(
    1,
    Math.ceil(sortedNotionals.length * 0.1),
  );
  const topNotional = sortedNotionals
    .slice(0, topCount)
    .reduce((total, value) => total + value, 0);

  return deepFreeze({
    totalCount: trades.length,
    classifiedCount,
    buyCount,
    sellCount,
    totalNotional: round(totalNotional),
    buyNotional: round(buyNotional),
    sellNotional: round(sellNotional),
    blockTradeCount,
    blockBuyNotional: round(blockBuyNotional),
    blockSellNotional: round(blockSellNotional),
    cumulativeVolumeDelta: round(
      buyNotional - sellNotional,
    ),
    aggressiveBuyRatio: round(
      safeDivide(buyNotional, classifiedNotional, 0.5),
    ),
    aggressiveSellRatio: round(
      safeDivide(sellNotional, classifiedNotional, 0.5),
    ),
    averageTradeNotional: round(
      safeDivide(totalNotional, trades.length),
    ),
    blockTradeRatio: round(
      safeDivide(blockTradeCount, trades.length),
    ),
    notionalConcentration: round(
      safeDivide(topNotional, totalNotional),
    ),
    recentFlowAcceleration: round(
      clamp(recentNormalized - earlierNormalized, -1, 1),
    ),
  });
}

function deriveScores(
  trades: TradeStatistics,
  book: OrderBookStatistics,
  vector: MarketFeatureVector,
  features: ReadonlyMap<string, MarketFeature>,
): DerivedScores {
  const featureDelta = clamp(
    scalarFeature(features, [
      "order_flow.normalized_delta",
      "order_flow.delta",
    ]),
    -1,
    1,
  );
  const tradeDelta = normalizeSigned(
    trades.cumulativeVolumeDelta,
    trades.buyNotional + trades.sellNotional,
  );
  const compositeDelta = clamp(
    tradeDelta * 0.65 +
      featureDelta * 0.2 +
      book.bidAskImbalance * 0.15,
    -1,
    1,
  );

  const buyPressure = clamp(
    0.5 +
      compositeDelta * 0.38 +
      Math.max(0, book.bidAskImbalance) * 0.12,
    0,
    1,
  );
  const sellPressure = clamp(
    0.5 -
      compositeDelta * 0.38 +
      Math.max(0, -book.bidAskImbalance) * 0.12,
    0,
    1,
  );

  const priceChange = scalarFeature(features, [
    "return.simple",
    "return.log",
    "momentum.rate_of_change",
  ]);
  const volatility = Math.max(
    0,
    scalarFeature(features, ["volatility.realized"]),
  );
  const relativeVolume = Math.max(
    0,
    scalarFeature(features, ["volume.relative"], 1),
  );

  const directionalConflict =
    Math.sign(compositeDelta) !== 0 &&
    Math.sign(priceChange) !== 0 &&
    Math.sign(compositeDelta) !== Math.sign(priceChange)
      ? Math.min(
          1,
          Math.abs(compositeDelta) +
            Math.abs(priceChange) * 5,
        )
      : 0;

  const absorptionScore = clamp(
    directionalConflict * 0.55 +
      trades.blockTradeRatio * 0.2 +
      trades.notionalConcentration * 0.15 +
      Math.min(1, relativeVolume / 3) * 0.1,
    0,
    1,
  );

  const exhaustionScore = clamp(
    Math.max(0, -Math.sign(compositeDelta) *
      trades.recentFlowAcceleration) *
      0.45 +
      Math.max(0, volatility / 0.05) * 0.2 +
      Math.abs(compositeDelta) * 0.15 +
      Math.max(0, 1 - relativeVolume) * 0.2,
    0,
    1,
  );

  const institutionalFootprintScore = clamp(
    trades.blockTradeRatio * 0.3 +
      trades.notionalConcentration * 0.25 +
      clamp(
        safeDivide(
          trades.averageTradeNotional,
          Math.max(trades.totalNotional * 0.01, 1),
        ),
        0,
        1,
      ) *
        0.2 +
      Math.abs(book.bidAskImbalance) * 0.1 +
      Math.min(1, relativeVolume / 3) * 0.15,
    0,
    1,
  );

  const reversalProbability = clamp(
    sigmoid(
      (absorptionScore * 0.4 +
        exhaustionScore * 0.4 +
        directionalConflict * 0.2 -
        0.5) *
        4,
    ),
    0,
    1,
  );

  const continuationProbability = clamp(
    sigmoid(
      (Math.abs(compositeDelta) * 0.45 +
        Math.max(
          0,
          Math.sign(compositeDelta) *
            trades.recentFlowAcceleration,
        ) *
          0.25 +
        (1 - exhaustionScore) * 0.2 +
        (1 - directionalConflict) * 0.1 -
        0.5) *
        4,
    ),
    0,
    1,
  );

  const tradeCoverage = clamp(
    safeDivide(trades.totalCount, 50),
    0,
    1,
  );
  const bookCoverage =
    book.totalNotional > 0 ? 1 : 0;
  const confidence = clamp(
    Number(vector.qualityScore) * 0.5 +
      tradeCoverage * 0.3 +
      bookCoverage * 0.15 +
      (trades.classifiedCount > 0 ? 0.05 : 0),
    0,
    1,
  );

  return deepFreeze({
    buyPressure: round(buyPressure),
    sellPressure: round(sellPressure),
    absorptionScore: round(absorptionScore),
    exhaustionScore: round(exhaustionScore),
    institutionalFootprintScore: round(
      institutionalFootprintScore,
    ),
    reversalProbability: round(reversalProbability),
    continuationProbability: round(
      continuationProbability,
    ),
    confidence: round(confidence),
  });
}

function classifyBias(
  buyPressure: number,
  sellPressure: number,
): OrderFlowBias {
  const net = buyPressure - sellPressure;

  if (net >= 0.7) {
    return OrderFlowBias.EXTREME_BUY;
  }

  if (net >= 0.4) {
    return OrderFlowBias.STRONG_BUY;
  }

  if (net >= 0.15) {
    return OrderFlowBias.BUY;
  }

  if (net <= -0.7) {
    return OrderFlowBias.EXTREME_SELL;
  }

  if (net <= -0.4) {
    return OrderFlowBias.STRONG_SELL;
  }

  if (net <= -0.15) {
    return OrderFlowBias.SELL;
  }

  return OrderFlowBias.BALANCED;
}

function classifyParticipantActivity(
  trades: TradeStatistics,
  book: OrderBookStatistics,
  scores: DerivedScores,
  configuration: OrderFlowConfiguration,
  features: ReadonlyMap<string, MarketFeature>,
): ParticipantActivity {
  const liquidationImbalance = Math.abs(
    scalarFeature(features, [
      "derivatives.liquidation_imbalance",
    ]),
  );

  if (liquidationImbalance >= 0.6) {
    return ParticipantActivity.LIQUIDATION_DRIVEN;
  }

  if (
    scores.institutionalFootprintScore >=
    Number(configuration.institutionalFootprintThreshold)
  ) {
    return trades.blockBuyNotional >=
      trades.blockSellNotional
      ? ParticipantActivity.INSTITUTIONAL_ACCUMULATION
      : ParticipantActivity.INSTITUTIONAL_DISTRIBUTION;
  }

  if (
    trades.totalCount === 0 &&
    book.totalNotional === 0
  ) {
    return ParticipantActivity.UNKNOWN;
  }

  if (
    Math.abs(book.bidAskImbalance) <= 0.1 &&
    Math.abs(
      trades.aggressiveBuyRatio -
        trades.aggressiveSellRatio,
    ) <= 0.1 &&
    book.totalNotional > 0
  ) {
    return ParticipantActivity.MARKET_MAKER_DOMINATED;
  }

  if (
    trades.blockTradeRatio < 0.05 &&
    trades.notionalConcentration < 0.25
  ) {
    return ParticipantActivity.RETAIL_DOMINATED;
  }

  return ParticipantActivity.MIXED;
}

function metric(
  name: string,
  value: number,
  normalizedValue: number,
  interpretation: string,
): OrderFlowMetric {
  return deepFreeze({
    name,
    value: round(value),
    normalizedValue: round(
      clamp(normalizedValue, -1, 1),
    ),
    interpretation,
  });
}

function buildMetrics(
  trades: TradeStatistics,
  book: OrderBookStatistics,
  scores: DerivedScores,
): readonly OrderFlowMetric[] {
  return deepFreeze([
    metric(
      "cumulative_volume_delta",
      trades.cumulativeVolumeDelta,
      normalizeSigned(
        trades.cumulativeVolumeDelta,
        trades.buyNotional + trades.sellNotional,
      ),
      trades.cumulativeVolumeDelta > 0
        ? "Net aggressive buying dominated the observation window."
        : trades.cumulativeVolumeDelta < 0
          ? "Net aggressive selling dominated the observation window."
          : "Aggressive buying and selling were balanced.",
    ),
    metric(
      "aggressive_buy_ratio",
      trades.aggressiveBuyRatio,
      trades.aggressiveBuyRatio * 2 - 1,
      "Share of classified traded notional initiated by buyers.",
    ),
    metric(
      "aggressive_sell_ratio",
      trades.aggressiveSellRatio,
      trades.aggressiveSellRatio * 2 - 1,
      "Share of classified traded notional initiated by sellers.",
    ),
    metric(
      "bid_ask_imbalance",
      book.bidAskImbalance,
      book.bidAskImbalance,
      "Relative imbalance between displayed bid and ask notional.",
    ),
    metric(
      "block_trade_ratio",
      trades.blockTradeRatio,
      trades.blockTradeRatio * 2 - 1,
      "Fraction of observed trades meeting the configured block threshold.",
    ),
    metric(
      "notional_concentration",
      trades.notionalConcentration,
      trades.notionalConcentration * 2 - 1,
      "Concentration of traded notional in the largest observations.",
    ),
    metric(
      "flow_acceleration",
      trades.recentFlowAcceleration,
      trades.recentFlowAcceleration,
      "Change in signed order-flow intensity between earlier and recent trades.",
    ),
    metric(
      "absorption_score",
      scores.absorptionScore,
      scores.absorptionScore * 2 - 1,
      "Evidence that aggressive flow is being absorbed without equivalent price movement.",
    ),
    metric(
      "exhaustion_score",
      scores.exhaustionScore,
      scores.exhaustionScore * 2 - 1,
      "Evidence that the current directional flow is weakening.",
    ),
    metric(
      "institutional_footprint_score",
      scores.institutionalFootprintScore,
      scores.institutionalFootprintScore * 2 - 1,
      "Composite evidence of large, concentrated, and block-sized activity.",
    ),
  ]);
}

function validateConfiguration(
  configuration: OrderFlowConfiguration,
): void {
  if (configuration.tradeLookbackCount <= 0) {
    throw new Error(
      "Order-flow tradeLookbackCount must be positive.",
    );
  }

  if (configuration.orderBookDepthLevels <= 0) {
    throw new Error(
      "Order-flow orderBookDepthLevels must be positive.",
    );
  }

  if (
    Number(configuration.blockTradeNotionalThreshold) < 0
  ) {
    throw new Error(
      "Order-flow blockTradeNotionalThreshold cannot be negative.",
    );
  }

  const normalizedValues = [
    Number(configuration.institutionalFootprintThreshold),
    Number(configuration.reversalProbabilityThreshold),
  ];

  if (
    normalizedValues.some(
      (value) =>
        !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    throw new Error(
      "Order-flow probability and score thresholds must be within [0, 1].",
    );
  }
}

export class DefaultOrderFlowIntelligenceEngine
  implements OrderFlowIntelligenceEngine
{
  public analyze(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    configuration: OrderFlowConfiguration,
  ): OrderFlowIntelligence {
    validateConfiguration(configuration);

    if (!configuration.enabled) {
      return deepFreeze({
        bias: OrderFlowBias.BALANCED,
        participantActivity: ParticipantActivity.UNKNOWN,
        buyPressure: 0.5 as NormalizedScore,
        sellPressure: 0.5 as NormalizedScore,
        aggressiveBuyRatio: 0.5 as NormalizedScore,
        aggressiveSellRatio: 0.5 as NormalizedScore,
        bidAskImbalance: 0,
        cumulativeVolumeDelta: 0,
        absorptionScore: 0 as NormalizedScore,
        exhaustionScore: 0 as NormalizedScore,
        institutionalFootprintScore: 0 as NormalizedScore,
        reversalProbability: 0 as Probability,
        continuationProbability: 0 as Probability,
        confidence: 0 as ConfidenceScore,
        metrics: deepFreeze([]),
        generatedAtMs: featureVector.generatedAtMs,
        modelVersion: configuration.modelVersion,
      });
    }

    const features = featureMap(featureVector);
    const trades = calculateTradeStatistics(
      input,
      configuration,
    );
    const book = calculateOrderBookStatistics(
      input,
      configuration,
      features,
    );
    const scores = deriveScores(
      trades,
      book,
      featureVector,
      features,
    );

    const buyPressure = scores.buyPressure;
    const sellPressure = scores.sellPressure;

    return deepFreeze({
      bias: classifyBias(buyPressure, sellPressure),
      participantActivity: classifyParticipantActivity(
        trades,
        book,
        scores,
        configuration,
        features,
      ),
      buyPressure: buyPressure as NormalizedScore,
      sellPressure: sellPressure as NormalizedScore,
      aggressiveBuyRatio:
        trades.aggressiveBuyRatio as NormalizedScore,
      aggressiveSellRatio:
        trades.aggressiveSellRatio as NormalizedScore,
      bidAskImbalance: book.bidAskImbalance,
      cumulativeVolumeDelta:
        trades.cumulativeVolumeDelta,
      absorptionScore:
        scores.absorptionScore as NormalizedScore,
      exhaustionScore:
        scores.exhaustionScore as NormalizedScore,
      institutionalFootprintScore:
        scores.institutionalFootprintScore as NormalizedScore,
      reversalProbability:
        scores.reversalProbability as Probability,
      continuationProbability:
        scores.continuationProbability as Probability,
      confidence: scores.confidence as ConfidenceScore,
      metrics: buildMetrics(trades, book, scores),
      generatedAtMs: featureVector.generatedAtMs,
      modelVersion: configuration.modelVersion,
    });
  }
}

export function createOrderFlowIntelligenceEngine(): OrderFlowIntelligenceEngine {
  return new DefaultOrderFlowIntelligenceEngine();
}

export function analyzeOrderFlow(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  configuration: OrderFlowConfiguration,
): OrderFlowIntelligence {
  return new DefaultOrderFlowIntelligenceEngine().analyze(
    input,
    featureVector,
    configuration,
  );
}