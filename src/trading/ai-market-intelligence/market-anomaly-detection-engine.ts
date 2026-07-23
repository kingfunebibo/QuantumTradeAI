/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-anomaly-detection-engine.ts
 *
 * Deterministic, immutable, threshold-driven market anomaly detection.
 */

import {
  AnomalyDetectionConfiguration,
  AnomalyDetectionThreshold,
  AnomalyEvidence,
  AnomalySeverity,
  AnomalyType,
  ConfidenceScore,
  FeatureValueType,
  IntelligenceActionability,
  LiquidityPrediction,
  MarketAnomaly,
  MarketAnomalyDetectionEngine,
  MarketAnomalyId,
  MarketCorrelationIntelligence,
  MarketFeature,
  MarketFeatureVector,
  MarketIdentity,
  MarketIntelligenceInput,
  MarketRegimeIntelligence,
  OrderFlowIntelligence,
  Probability,
  VolatilityForecast,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;

interface DetectionSignal {
  readonly type: AnomalyType;
  readonly score: number;
  readonly probability: number;
  readonly confidence: number;
  readonly startedAtMs?: number;
  readonly affectedMarkets: readonly MarketIdentity[];
  readonly evidence: readonly AnomalyEvidence[];
  readonly summary: string;
}

interface CandleStatistics {
  readonly count: number;
  readonly latestReturn: number;
  readonly previousReturn: number;
  readonly cumulativeReturn: number;
  readonly meanReturn: number;
  readonly returnStandardDeviation: number;
  readonly latestVolume: number;
  readonly meanVolume: number;
  readonly volumeStandardDeviation: number;
  readonly volumeZScore: number;
  readonly returnZScore: number;
  readonly latestClose: number;
  readonly latestHigh: number;
  readonly latestLow: number;
  readonly latestOpenTimeMs?: number;
}

interface OrderBookStatistics {
  readonly spreadBps: number;
  readonly bidNotional: number;
  readonly askNotional: number;
  readonly totalNotional: number;
  readonly imbalance: number;
  readonly topLevelConcentration: number;
}

interface TradeStatistics {
  readonly count: number;
  readonly totalNotional: number;
  readonly buyNotional: number;
  readonly sellNotional: number;
  readonly unknownNotional: number;
  readonly averageNotional: number;
  readonly notionalConcentration: number;
  readonly repeatedSizeRatio: number;
  readonly directionalImbalance: number;
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

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) /
        values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((total, value) => {
      const deviation = value - average;
      return total + deviation * deviation;
    }, 0) /
    (values.length - 1);

  return Math.sqrt(Math.max(0, variance));
}

function zScore(
  value: number,
  average: number,
  deviation: number,
): number {
  return deviation <= EPSILON ? 0 : (value - average) / deviation;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function deterministicHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
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

function qualityScore(input: MarketIntelligenceInput): number {
  const quality = input.qualityAssessment;

  return clamp(
    (
      Number(quality.completenessScore) +
      Number(quality.freshnessScore) +
      Number(quality.consistencyScore) +
      Number(quality.orderingScore)
    ) / 4,
    0,
    1,
  );
}

function candleStatistics(
  input: MarketIntelligenceInput,
): CandleStatistics {
  const candles = [...input.candles]
    .filter(
      (candle) =>
        candle.isClosed &&
        Number(candle.close) > 0 &&
        Number.isFinite(Number(candle.close)),
    )
    .sort(
      (left, right) =>
        Number(left.closeTimeMs) - Number(right.closeTimeMs),
    );

  const returns: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const previous = Number(candles[index - 1].close);
    const current = Number(candles[index].close);

    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }

  const volumes = candles.map((candle) =>
    Math.max(0, Number(candle.quoteVolume ?? candle.volume)),
  );
  const latest = candles.at(-1);
  const historicalReturns = returns.slice(0, -1);
  const historicalVolumes = volumes.slice(0, -1);
  const latestReturn = returns.at(-1) ?? 0;
  const previousReturn = returns.at(-2) ?? 0;
  const meanReturn = mean(historicalReturns);
  const returnStandardDeviation = standardDeviation(
    historicalReturns,
  );
  const latestVolume = volumes.at(-1) ?? 0;
  const meanVolume = mean(historicalVolumes);
  const volumeStandardDeviation = standardDeviation(
    historicalVolumes,
  );

  return deepFreeze({
    count: candles.length,
    latestReturn: round(latestReturn),
    previousReturn: round(previousReturn),
    cumulativeReturn: round(
      candles.length < 2
        ? 0
        : Math.log(
            Number(candles.at(-1)?.close ?? 1) /
              Number(candles[0].close),
          ),
    ),
    meanReturn: round(meanReturn),
    returnStandardDeviation: round(returnStandardDeviation),
    latestVolume: round(latestVolume),
    meanVolume: round(meanVolume),
    volumeStandardDeviation: round(volumeStandardDeviation),
    volumeZScore: round(
      zScore(
        latestVolume,
        meanVolume,
        volumeStandardDeviation,
      ),
    ),
    returnZScore: round(
      zScore(
        latestReturn,
        meanReturn,
        returnStandardDeviation,
      ),
    ),
    latestClose: Number(latest?.close ?? 0),
    latestHigh: Number(latest?.high ?? 0),
    latestLow: Number(latest?.low ?? 0),
    latestOpenTimeMs:
      latest === undefined ? undefined : Number(latest.openTimeMs),
  });
}

function orderBookStatistics(
  input: MarketIntelligenceInput,
): OrderBookStatistics {
  const book = [...(input.orderBooks ?? [])]
    .sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    )
    .at(-1);

  if (book === undefined) {
    return deepFreeze({
      spreadBps: 0,
      bidNotional: 0,
      askNotional: 0,
      totalNotional: 0,
      imbalance: 0,
      topLevelConcentration: 0,
    });
  }

  const bidNotionals = book.bids.map(
    (level) => Number(level.price) * Number(level.quantity),
  );
  const askNotionals = book.asks.map(
    (level) => Number(level.price) * Number(level.quantity),
  );
  const bidNotional = bidNotionals.reduce(
    (total, value) => total + value,
    0,
  );
  const askNotional = askNotionals.reduce(
    (total, value) => total + value,
    0,
  );
  const totalNotional = bidNotional + askNotional;
  const topNotional =
    (bidNotionals[0] ?? 0) + (askNotionals[0] ?? 0);

  return deepFreeze({
    spreadBps: round(Number(book.spreadBps ?? 0)),
    bidNotional: round(bidNotional),
    askNotional: round(askNotional),
    totalNotional: round(totalNotional),
    imbalance: round(
      safeDivide(
        bidNotional - askNotional,
        totalNotional,
      ),
    ),
    topLevelConcentration: round(
      safeDivide(topNotional, totalNotional),
    ),
  });
}

function tradeStatistics(
  input: MarketIntelligenceInput,
): TradeStatistics {
  const trades = [...(input.trades ?? [])].sort(
    (left, right) =>
      Number(left.eventTimeMs) - Number(right.eventTimeMs) ||
      left.tradeId.localeCompare(right.tradeId),
  );

  let buyNotional = 0;
  let sellNotional = 0;
  let unknownNotional = 0;
  const notionals: number[] = [];
  const sizeFrequency = new Map<string, number>();

  for (const trade of trades) {
    const notional = Math.max(0, Number(trade.notional));
    notionals.push(notional);

    if (trade.aggressorSide === "BUY") {
      buyNotional += notional;
    } else if (trade.aggressorSide === "SELL") {
      sellNotional += notional;
    } else {
      unknownNotional += notional;
    }

    const roundedSize = notional.toFixed(4);
    sizeFrequency.set(
      roundedSize,
      (sizeFrequency.get(roundedSize) ?? 0) + 1,
    );
  }

  const totalNotional = notionals.reduce(
    (total, value) => total + value,
    0,
  );
  const sorted = [...notionals].sort(
    (left, right) => right - left,
  );
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));
  const topNotional = sorted
    .slice(0, topCount)
    .reduce((total, value) => total + value, 0);
  const repeatedCount = [...sizeFrequency.values()].reduce(
    (total, count) => total + (count > 1 ? count : 0),
    0,
  );

  return deepFreeze({
    count: trades.length,
    totalNotional: round(totalNotional),
    buyNotional: round(buyNotional),
    sellNotional: round(sellNotional),
    unknownNotional: round(unknownNotional),
    averageNotional: round(
      safeDivide(totalNotional, trades.length),
    ),
    notionalConcentration: round(
      safeDivide(topNotional, totalNotional),
    ),
    repeatedSizeRatio: round(
      safeDivide(repeatedCount, trades.length),
    ),
    directionalImbalance: round(
      safeDivide(
        buyNotional - sellNotional,
        buyNotional + sellNotional,
      ),
    ),
  });
}

function evidence(
  metric: string,
  observedValue: number | string | boolean,
  description: string,
  expectedValue?: number | string | boolean,
  deviationScore?: number,
): AnomalyEvidence {
  return deepFreeze({
    metric,
    observedValue:
      typeof observedValue === "number"
        ? round(observedValue)
        : observedValue,
    expectedValue:
      typeof expectedValue === "number"
        ? round(expectedValue)
        : expectedValue,
    deviationScore:
      deviationScore === undefined
        ? undefined
        : round(deviationScore),
    description,
  });
}

function signalConfidence(
  sourceConfidence: number,
  inputQuality: number,
  sampleCoverage: number,
): number {
  return clamp(
    sourceConfidence * 0.45 +
      inputQuality * 0.35 +
      sampleCoverage * 0.2,
    0,
    1,
  );
}

function scoreProbability(score: number): number {
  return clamp(sigmoid((score - 1) * 2.2), 0, 1);
}

function pushSignal(
  signals: DetectionSignal[],
  signal: DetectionSignal | undefined,
): void {
  if (signal !== undefined && Number.isFinite(signal.score)) {
    signals.push(deepFreeze(signal));
  }
}

function detectPriceMovement(
  input: MarketIntelligenceInput,
  candles: CandleStatistics,
  inputQuality: number,
): readonly DetectionSignal[] {
  const signals: DetectionSignal[] = [];
  const sampleCoverage = clamp(candles.count / 50, 0, 1);
  const baseConfidence = signalConfidence(
    0.9,
    inputQuality,
    sampleCoverage,
  );

  if (candles.latestReturn > 0) {
    const score = Math.max(
      Math.abs(candles.returnZScore),
      Math.abs(candles.latestReturn) * 100,
    );

    pushSignal(signals, {
      type: AnomalyType.PRICE_SPIKE,
      score,
      probability: scoreProbability(score),
      confidence: baseConfidence,
      startedAtMs: candles.latestOpenTimeMs,
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "latest_log_return",
          candles.latestReturn,
          "Latest closed candle produced an unusually positive return.",
          candles.meanReturn,
          Math.abs(candles.returnZScore),
        ),
      ],
      summary: "Unusually sharp positive price movement detected.",
    });
  }

  if (candles.latestReturn < 0) {
    const score = Math.max(
      Math.abs(candles.returnZScore),
      Math.abs(candles.latestReturn) * 100,
    );

    pushSignal(signals, {
      type: AnomalyType.PRICE_CRASH,
      score,
      probability: scoreProbability(score),
      confidence: baseConfidence,
      startedAtMs: candles.latestOpenTimeMs,
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "latest_log_return",
          candles.latestReturn,
          "Latest closed candle produced an unusually negative return.",
          candles.meanReturn,
          Math.abs(candles.returnZScore),
        ),
      ],
      summary: "Unusually sharp negative price movement detected.",
    });
  }

  const flashCrashScore =
    candles.latestReturn < 0
      ? Math.abs(candles.returnZScore) * 0.55 +
        Math.abs(candles.latestReturn) * 100 * 0.3 +
        Math.max(0, -candles.previousReturn) * 100 * 0.15
      : 0;

  pushSignal(
    signals,
    flashCrashScore <= 0
      ? undefined
      : {
          type: AnomalyType.FLASH_CRASH_INDICATOR,
          score: flashCrashScore,
          probability: scoreProbability(flashCrashScore),
          confidence: baseConfidence,
          startedAtMs: candles.latestOpenTimeMs,
          affectedMarkets: [input.market],
          evidence: [
            evidence(
              "return_z_score",
              candles.returnZScore,
              "Abrupt downside return exceeded recent statistical behavior.",
              0,
              Math.abs(candles.returnZScore),
            ),
            evidence(
              "latest_low",
              candles.latestLow,
              "Latest candle low used to characterize the downside excursion.",
            ),
          ],
          summary:
            "Rapid downside move exhibits flash-crash characteristics.",
        },
  );

  return deepFreeze(signals);
}

function detectVolume(
  input: MarketIntelligenceInput,
  candles: CandleStatistics,
  trades: TradeStatistics,
  inputQuality: number,
): readonly DetectionSignal[] {
  const signals: DetectionSignal[] = [];
  const sampleCoverage = clamp(candles.count / 50, 0, 1);
  const confidence = signalConfidence(
    trades.count > 0 ? 0.95 : 0.8,
    inputQuality,
    sampleCoverage,
  );

  if (candles.volumeZScore > 0) {
    pushSignal(signals, {
      type: AnomalyType.VOLUME_SPIKE,
      score: candles.volumeZScore,
      probability: scoreProbability(candles.volumeZScore),
      confidence,
      startedAtMs: candles.latestOpenTimeMs,
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "volume_z_score",
          candles.volumeZScore,
          "Latest volume is elevated relative to the historical sample.",
          0,
          Math.abs(candles.volumeZScore),
        ),
        evidence(
          "trade_notional_concentration",
          trades.notionalConcentration,
          "Concentration of traded notional in the largest observations.",
        ),
      ],
      summary: "Unusually elevated trading volume detected.",
    });
  }

  if (candles.volumeZScore < 0) {
    const collapseScore = Math.abs(candles.volumeZScore);

    pushSignal(signals, {
      type: AnomalyType.VOLUME_COLLAPSE,
      score: collapseScore,
      probability: scoreProbability(collapseScore),
      confidence,
      startedAtMs: candles.latestOpenTimeMs,
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "volume_z_score",
          candles.volumeZScore,
          "Latest volume is depressed relative to the historical sample.",
          0,
          collapseScore,
        ),
      ],
      summary: "Unusually low trading participation detected.",
    });
  }

  return deepFreeze(signals);
}

function detectLiquidityAndMicrostructure(
  input: MarketIntelligenceInput,
  books: OrderBookStatistics,
  trades: TradeStatistics,
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  inputQuality: number,
): readonly DetectionSignal[] {
  const signals: DetectionSignal[] = [];
  const latestLiquidity = [...liquidityPredictions]
    .sort(
      (left, right) =>
        Number(left.generatedAtMs) - Number(right.generatedAtMs),
    )
    .at(-1);
  const sourceConfidence = Math.max(
    Number(latestLiquidity?.confidence ?? 0),
    Number(orderFlow.confidence),
    books.totalNotional > 0 ? 0.7 : 0,
  );
  const confidence = signalConfidence(
    sourceConfidence,
    inputQuality,
    books.totalNotional > 0 ? 1 : 0.25,
  );

  const spreadScore = Math.max(
    books.spreadBps,
    Number(latestLiquidity?.predictedSpreadBps ?? 0),
  );

  pushSignal(
    signals,
    spreadScore <= 0
      ? undefined
      : {
          type: AnomalyType.SPREAD_WIDENING,
          score: spreadScore,
          probability: scoreProbability(spreadScore),
          confidence,
          affectedMarkets: [input.market],
          evidence: [
            evidence(
              "spread_bps",
              spreadScore,
              "Observed or predicted bid-ask spread is elevated.",
              0,
              spreadScore,
            ),
          ],
          summary: "Bid-ask spread widening detected.",
        },
  );

  const deterioration = Number(
    latestLiquidity?.deteriorationProbability ?? 0,
  );
  const depthDeficit = clamp(
    1 -
      safeDivide(
        Number(
          latestLiquidity?.predictedBidDepth ?? books.bidNotional,
        ) +
          Number(
            latestLiquidity?.predictedAskDepth ??
              books.askNotional,
          ),
        Math.max(books.totalNotional, 1),
        1,
      ),
    0,
    1,
  );
  const withdrawalScore =
    deterioration * 2 + depthDeficit + spreadScore / 100;

  pushSignal(
    signals,
    withdrawalScore <= 0
      ? undefined
      : {
          type: AnomalyType.LIQUIDITY_WITHDRAWAL,
          score: withdrawalScore,
          probability: clamp(
            deterioration * 0.7 +
              scoreProbability(withdrawalScore) * 0.3,
            0,
            1,
          ),
          confidence,
          affectedMarkets: [input.market],
          evidence: [
            evidence(
              "liquidity_deterioration_probability",
              deterioration,
              "Forecast probability of worsening liquidity.",
              0,
              withdrawalScore,
            ),
            evidence(
              "predicted_market_impact_bps",
              Number(
                latestLiquidity?.predictedMarketImpactBps ?? 0,
              ),
              "Predicted market impact under current liquidity conditions.",
            ),
          ],
          summary: "Available market liquidity appears to be withdrawing.",
        },
  );

  const imbalanceScore = Math.max(
    Math.abs(books.imbalance),
    Math.abs(Number(orderFlow.bidAskImbalance)),
    Math.abs(
      Number(orderFlow.buyPressure) -
        Number(orderFlow.sellPressure),
    ),
  );

  pushSignal(signals, {
    type: AnomalyType.ORDER_BOOK_IMBALANCE,
    score: imbalanceScore * 4,
    probability: clamp(imbalanceScore, 0, 1),
    confidence,
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "order_book_imbalance",
        books.imbalance,
        "Displayed bid and ask liquidity are asymmetrically distributed.",
        0,
        imbalanceScore,
      ),
      evidence(
        "order_flow_bias",
        orderFlow.bias,
        "Order-flow intelligence bias accompanying the imbalance.",
      ),
    ],
    summary: "Material order-book and order-flow imbalance detected.",
  });

  const spoofingScore =
    books.topLevelConcentration * 1.5 +
    Number(orderFlow.absorptionScore) * 0.8 +
    Math.abs(books.imbalance) * 0.7;

  pushSignal(signals, {
    type: AnomalyType.SPOOFING_INDICATOR,
    score: spoofingScore,
    probability: scoreProbability(spoofingScore),
    confidence: confidence * 0.75,
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "top_level_concentration",
        books.topLevelConcentration,
        "A large share of displayed depth is concentrated at the best levels.",
      ),
      evidence(
        "absorption_score",
        Number(orderFlow.absorptionScore),
        "Aggressive flow is being absorbed without equivalent price movement.",
      ),
    ],
    summary:
      "Displayed liquidity concentration exhibits potential spoofing characteristics.",
  });

  const layeringScore =
    books.topLevelConcentration * 0.8 +
    Math.abs(books.imbalance) * 0.8 +
    Number(orderFlow.institutionalFootprintScore) * 0.4;

  pushSignal(signals, {
    type: AnomalyType.LAYERING_INDICATOR,
    score: layeringScore,
    probability: scoreProbability(layeringScore),
    confidence: confidence * 0.7,
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "depth_imbalance",
        books.imbalance,
        "Asymmetric displayed depth may indicate layered liquidity.",
      ),
      evidence(
        "institutional_footprint_score",
        Number(orderFlow.institutionalFootprintScore),
        "Large-participant footprint contributes to the layering indicator.",
      ),
    ],
    summary:
      "Order-book structure exhibits potential layering characteristics.",
  });

  const washScore =
    trades.repeatedSizeRatio * 1.3 +
    trades.notionalConcentration * 0.8 +
    (1 - Math.abs(trades.directionalImbalance)) * 0.4;

  pushSignal(signals, {
    type: AnomalyType.WASH_TRADING_INDICATOR,
    score: washScore,
    probability: scoreProbability(washScore),
    confidence: signalConfidence(
      trades.count > 20 ? 0.75 : 0.45,
      inputQuality,
      clamp(trades.count / 100, 0, 1),
    ),
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "repeated_size_ratio",
        trades.repeatedSizeRatio,
        "Repeated trade sizes may indicate non-organic activity.",
      ),
      evidence(
        "directional_imbalance",
        trades.directionalImbalance,
        "Low net directional imbalance can accompany circular trading.",
      ),
    ],
    summary:
      "Trade-size repetition and balanced flow exhibit potential wash-trading characteristics.",
  });

  return deepFreeze(signals);
}

function detectManipulation(
  input: MarketIntelligenceInput,
  candles: CandleStatistics,
  trades: TradeStatistics,
  orderFlow: OrderFlowIntelligence,
  inputQuality: number,
): DetectionSignal {
  const directionalAlignment =
    Math.sign(candles.latestReturn) ===
    Math.sign(trades.directionalImbalance)
      ? 1
      : 0;
  const score =
    Math.abs(candles.returnZScore) * 0.35 +
    Math.max(0, candles.volumeZScore) * 0.25 +
    trades.notionalConcentration * 1.2 +
    Math.abs(trades.directionalImbalance) * 0.8 +
    directionalAlignment * 0.4;

  return deepFreeze({
    type: AnomalyType.PUMP_AND_DUMP_INDICATOR,
    score,
    probability: scoreProbability(score),
    confidence: signalConfidence(
      Number(orderFlow.confidence),
      inputQuality,
      clamp(candles.count / 50, 0, 1),
    ),
    startedAtMs: candles.latestOpenTimeMs,
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "return_z_score",
        candles.returnZScore,
        "Abnormal price movement contributes to the manipulation indicator.",
      ),
      evidence(
        "volume_z_score",
        candles.volumeZScore,
        "Abnormal volume contributes to the manipulation indicator.",
      ),
      evidence(
        "trade_notional_concentration",
        trades.notionalConcentration,
        "Concentrated notional may indicate coordinated activity.",
      ),
    ],
    summary:
      "Combined price, volume, and trade concentration exhibit pump-and-dump characteristics.",
  });
}

function detectDerivatives(
  input: MarketIntelligenceInput,
  inputQuality: number,
): readonly DetectionSignal[] {
  const signals: DetectionSignal[] = [];
  const latestFunding = [...(input.fundingRates ?? [])]
    .sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    )
    .at(-1);
  const latestOpenInterest = [...(input.openInterest ?? [])]
    .sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    )
    .at(-1);
  const latestLiquidation = [...(input.liquidations ?? [])]
    .sort(
      (left, right) =>
        Number(left.eventTimeMs) - Number(right.eventTimeMs),
    )
    .at(-1);

  if (latestFunding !== undefined) {
    const fundingRate = Number(
      latestFunding.annualizedFundingRate ??
        latestFunding.fundingRate,
    );
    const score = Math.abs(fundingRate) * 100;

    pushSignal(signals, {
      type: AnomalyType.FUNDING_DISLOCATION,
      score,
      probability: scoreProbability(score),
      confidence: signalConfidence(0.9, inputQuality, 1),
      startedAtMs: Number(latestFunding.eventTimeMs),
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "funding_rate",
          fundingRate,
          "Absolute funding rate is elevated relative to neutral financing.",
          0,
          score,
        ),
      ],
      summary: "Derivative funding-rate dislocation detected.",
    });
  }

  if (latestOpenInterest !== undefined) {
    const change = Math.abs(
      Number(latestOpenInterest.changePercentage ?? 0),
    );
    const score = change * 100;

    pushSignal(signals, {
      type: AnomalyType.OPEN_INTEREST_SHOCK,
      score,
      probability: scoreProbability(score),
      confidence: signalConfidence(0.9, inputQuality, 1),
      startedAtMs: Number(latestOpenInterest.eventTimeMs),
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "open_interest_change_percentage",
          Number(latestOpenInterest.changePercentage ?? 0),
          "Open interest changed abruptly.",
          0,
          score,
        ),
      ],
      summary: "Abrupt open-interest change detected.",
    });
  }

  if (latestLiquidation !== undefined) {
    const longNotional = Number(
      latestLiquidation.longLiquidationNotional,
    );
    const shortNotional = Number(
      latestLiquidation.shortLiquidationNotional,
    );
    const total = longNotional + shortNotional;
    const directionalConcentration = Math.abs(
      safeDivide(longNotional - shortNotional, total),
    );
    const score =
      Math.log10(Math.max(total, 1)) * 0.35 +
      directionalConcentration * 1.5;

    pushSignal(signals, {
      type: AnomalyType.LIQUIDATION_CASCADE,
      score,
      probability: scoreProbability(score),
      confidence: signalConfidence(0.95, inputQuality, 1),
      startedAtMs: Number(latestLiquidation.eventTimeMs),
      affectedMarkets: [input.market],
      evidence: [
        evidence(
          "total_liquidation_notional",
          total,
          "Combined long and short liquidation notional.",
        ),
        evidence(
          "liquidation_directional_concentration",
          directionalConcentration,
          "Concentration of liquidations on one side of the market.",
        ),
      ],
      summary: "Liquidation activity exhibits cascade characteristics.",
    });
  }

  return deepFreeze(signals);
}

function detectCorrelation(
  input: MarketIntelligenceInput,
  correlations: MarketCorrelationIntelligence,
): readonly DetectionSignal[] {
  return deepFreeze(
    correlations.breakdowns.map((breakdown) => {
      const affectedMarkets = [
        input.market,
        ...(input.referenceMarkets ?? [])
          .filter(
            (reference) =>
              reference.market.symbol === breakdown.rightSymbol,
          )
          .map((reference) => reference.market),
      ];

      return deepFreeze({
        type: AnomalyType.CORRELATION_BREAKDOWN,
        score: breakdown.deviation,
        probability: clamp(
          breakdown.deviation / 2 +
            Number(correlations.confidence) * 0.5,
          0,
          1,
        ),
        confidence: Number(correlations.confidence),
        startedAtMs: Number(breakdown.detectedAtMs),
        affectedMarkets,
        evidence: [
          evidence(
            "historical_correlation",
            Number(breakdown.historicalCorrelation),
            "Historical relationship used as the comparison baseline.",
          ),
          evidence(
            "current_correlation",
            Number(breakdown.currentCorrelation),
            "Current rolling relationship deviates from the baseline.",
            Number(breakdown.historicalCorrelation),
            breakdown.deviation,
          ),
        ],
        summary: `Correlation breakdown detected between ${String(
          breakdown.leftSymbol,
        )} and ${String(breakdown.rightSymbol)}.`,
      });
    }),
  );
}

function detectDataQuality(
  input: MarketIntelligenceInput,
  vector: MarketFeatureVector,
): DetectionSignal {
  const quality = qualityScore(input);
  const missingRate = safeDivide(
    vector.missingFeatureCount,
    Math.max(vector.featureCount, 1),
  );
  const warningRate = clamp(
    input.qualityAssessment.warnings.length / 10,
    0,
    1,
  );
  const score =
    (1 - quality) * 2 +
    missingRate +
    Number(input.qualityAssessment.missingValueRate) +
    Number(input.qualityAssessment.duplicateRate) +
    warningRate;

  return deepFreeze({
    type: AnomalyType.DATA_QUALITY_ANOMALY,
    score,
    probability: clamp(1 - quality + missingRate * 0.5, 0, 1),
    confidence: 1,
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "data_quality_score",
        quality,
        "Composite input data-quality score.",
        1,
        1 - quality,
      ),
      evidence(
        "missing_feature_rate",
        missingRate,
        "Share of extracted features marked as missing.",
        0,
        missingRate,
      ),
      evidence(
        "quality_warning_count",
        input.qualityAssessment.warnings.length,
        "Number of warnings attached to the input quality assessment.",
      ),
    ],
    summary: "Input data quality may impair market intelligence reliability.",
  });
}

function detectStatisticalOutlier(
  input: MarketIntelligenceInput,
  vector: MarketFeatureVector,
  candles: CandleStatistics,
  features: ReadonlyMap<string, MarketFeature>,
): DetectionSignal {
  const featureOutlier = Math.max(
    Math.abs(
      scalarFeature(features, [
        "statistical.z_score",
        "price.z_score",
        "return.z_score",
      ]),
    ),
    0,
  );
  const score = Math.max(
    Math.abs(candles.returnZScore),
    Math.abs(candles.volumeZScore),
    featureOutlier,
  );

  return deepFreeze({
    type: AnomalyType.STATISTICAL_OUTLIER,
    score,
    probability: scoreProbability(score),
    confidence: clamp(
      Number(vector.qualityScore) *
        clamp(candles.count / 30, 0, 1),
      0,
      1,
    ),
    startedAtMs: candles.latestOpenTimeMs,
    affectedMarkets: [input.market],
    evidence: [
      evidence(
        "maximum_observed_z_score",
        score,
        "Maximum absolute statistical deviation across price, volume, and extracted features.",
        0,
        score,
      ),
    ],
    summary: "Statistically unusual market observation detected.",
  });
}

function detectCrossVenueDislocation(
  input: MarketIntelligenceInput,
  candles: CandleStatistics,
): DetectionSignal | undefined {
  const references = input.referenceMarkets ?? [];

  if (references.length === 0 || candles.latestClose <= 0) {
    return undefined;
  }

  let maximumDeviation = 0;
  let mostDeviant: MarketIdentity | undefined;
  let referencePrice = 0;

  for (const reference of references) {
    const latest = [...reference.candles]
      .filter((candle) => candle.isClosed)
      .sort(
        (left, right) =>
          Number(left.closeTimeMs) - Number(right.closeTimeMs),
      )
      .at(-1);

    if (latest === undefined || Number(latest.close) <= 0) {
      continue;
    }

    const deviation = Math.abs(
      candles.latestClose / Number(latest.close) - 1,
    );

    if (deviation > maximumDeviation) {
      maximumDeviation = deviation;
      mostDeviant = reference.market;
      referencePrice = Number(latest.close);
    }
  }

  if (mostDeviant === undefined) {
    return undefined;
  }

  const score = maximumDeviation * 100;

  return deepFreeze({
    type: AnomalyType.CROSS_VENUE_DISLOCATION,
    score,
    probability: scoreProbability(score),
    confidence: clamp(
      (
        qualityScore(input) +
        averageReferenceQuality(input)
      ) / 2,
      0,
      1,
    ),
    affectedMarkets: [input.market, mostDeviant],
    evidence: [
      evidence(
        "primary_close",
        candles.latestClose,
        "Latest primary-market close.",
      ),
      evidence(
        "reference_close",
        referencePrice,
        "Latest comparison-market close.",
      ),
      evidence(
        "relative_price_deviation",
        maximumDeviation,
        "Relative price deviation between primary and comparison markets.",
        0,
        score,
      ),
    ],
    summary: `Cross-market price dislocation detected against ${String(
      mostDeviant.symbol,
    )}.`,
  });
}

function averageReferenceQuality(
  input: MarketIntelligenceInput,
): number {
  const references = input.referenceMarkets ?? [];

  if (references.length === 0) {
    return 0;
  }

  return mean(
    references.map((reference) => {
      const quality = reference.qualityAssessment;

      return clamp(
        (
          Number(quality.completenessScore) +
          Number(quality.freshnessScore) +
          Number(quality.consistencyScore) +
          Number(quality.orderingScore)
        ) / 4,
        0,
        1,
      );
    }),
  );
}

function thresholdMap(
  configuration: AnomalyDetectionConfiguration,
): ReadonlyMap<AnomalyType, AnomalyDetectionThreshold> {
  return new Map(
    configuration.thresholds.map((threshold) => [
      threshold.type,
      threshold,
    ]),
  );
}

function severityFor(
  score: number,
  threshold: AnomalyDetectionThreshold,
): AnomalySeverity {
  if (score >= threshold.criticalThreshold * 2) {
    return AnomalySeverity.CRITICAL;
  }

  if (score >= threshold.criticalThreshold) {
    return AnomalySeverity.HIGH;
  }

  if (
    score >=
    threshold.warningThreshold +
      (threshold.criticalThreshold -
        threshold.warningThreshold) *
        0.5
  ) {
    return AnomalySeverity.MODERATE;
  }

  if (score >= threshold.warningThreshold) {
    return AnomalySeverity.LOW;
  }

  return AnomalySeverity.INFORMATIONAL;
}

function actionFor(
  type: AnomalyType,
  severity: AnomalySeverity,
): IntelligenceActionability {
  if (
    severity === AnomalySeverity.CRITICAL ||
    severity === AnomalySeverity.HIGH
  ) {
    return IntelligenceActionability.RISK_REDUCTION;
  }

  if (
    type === AnomalyType.DATA_QUALITY_ANOMALY ||
    type === AnomalyType.SPOOFING_INDICATOR ||
    type === AnomalyType.LAYERING_INDICATOR ||
    type === AnomalyType.WASH_TRADING_INDICATOR ||
    type === AnomalyType.PUMP_AND_DUMP_INDICATOR
  ) {
    return IntelligenceActionability.RESEARCH;
  }

  if (severity === AnomalySeverity.MODERATE) {
    return IntelligenceActionability.STRATEGY_ADJUSTMENT;
  }

  return IntelligenceActionability.MONITOR;
}

function anomalyId(
  input: MarketIntelligenceInput,
  signal: DetectionSignal,
  modelVersion: string,
): MarketAnomalyId {
  const seed = [
    String(input.market.symbol),
    signal.type,
    Number(input.analysisTimeMs),
    round(signal.score),
    modelVersion,
  ].join(":");

  return `market-anomaly-${deterministicHash(
    seed,
  )}` as MarketAnomalyId;
}

function materializeAnomaly(
  input: MarketIntelligenceInput,
  signal: DetectionSignal,
  threshold: AnomalyDetectionThreshold,
  configuration: AnomalyDetectionConfiguration,
): MarketAnomaly | undefined {
  if (
    !threshold.enabled ||
    signal.score < threshold.warningThreshold ||
    signal.probability < Number(threshold.minimumProbability) ||
    signal.confidence < Number(threshold.minimumConfidence)
  ) {
    return undefined;
  }

  const severity = severityFor(signal.score, threshold);

  return deepFreeze({
    id: anomalyId(
      input,
      signal,
      String(configuration.modelVersion),
    ),
    type: signal.type,
    severity,
    detectedAtMs: input.analysisTimeMs,
    startedAtMs:
      signal.startedAtMs === undefined
        ? undefined
        : (signal.startedAtMs as MarketAnomaly["startedAtMs"]),
    active: true,
    probability: round(
      clamp(signal.probability, 0, 1),
    ) as Probability,
    confidence: round(
      clamp(signal.confidence, 0, 1),
    ) as ConfidenceScore,
    affectedMarkets: deepFreeze([
      ...signal.affectedMarkets,
    ]),
    evidence: deepFreeze([...signal.evidence]),
    recommendedAction: actionFor(signal.type, severity),
    summary: signal.summary,
    modelVersion: configuration.modelVersion,
  });
}

function severityRank(severity: AnomalySeverity): number {
  switch (severity) {
    case AnomalySeverity.CRITICAL:
      return 5;
    case AnomalySeverity.HIGH:
      return 4;
    case AnomalySeverity.MODERATE:
      return 3;
    case AnomalySeverity.LOW:
      return 2;
    default:
      return 1;
  }
}

function validateConfiguration(
  configuration: AnomalyDetectionConfiguration,
): void {
  if (
    !Number.isSafeInteger(configuration.maximumActiveAnomalies) ||
    configuration.maximumActiveAnomalies <= 0
  ) {
    throw new Error(
      "Anomaly maximumActiveAnomalies must be a positive safe integer.",
    );
  }

  const seen = new Set<AnomalyType>();

  for (const threshold of configuration.thresholds) {
    if (seen.has(threshold.type)) {
      throw new Error(
        `Duplicate anomaly threshold for ${threshold.type}.`,
      );
    }

    seen.add(threshold.type);

    if (
      !Number.isFinite(threshold.warningThreshold) ||
      !Number.isFinite(threshold.criticalThreshold) ||
      threshold.warningThreshold < 0 ||
      threshold.criticalThreshold <
        threshold.warningThreshold
    ) {
      throw new Error(
        `Invalid anomaly thresholds for ${threshold.type}.`,
      );
    }

    if (
      Number(threshold.minimumProbability) < 0 ||
      Number(threshold.minimumProbability) > 1 ||
      Number(threshold.minimumConfidence) < 0 ||
      Number(threshold.minimumConfidence) > 1
    ) {
      throw new Error(
        `Probability and confidence thresholds for ${threshold.type} must be within [0, 1].`,
      );
    }
  }
}

export class DefaultMarketAnomalyDetectionEngine
  implements MarketAnomalyDetectionEngine
{
  public detect(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    configuration: AnomalyDetectionConfiguration,
  ): readonly MarketAnomaly[] {
    validateConfiguration(configuration);

    if (!configuration.enabled) {
      return deepFreeze([]);
    }

    const thresholds = thresholdMap(configuration);
    const inputQuality = qualityScore(input);
    const candles = candleStatistics(input);
    const books = orderBookStatistics(input);
    const trades = tradeStatistics(input);
    const features = featureMap(featureVector);
    const signals: DetectionSignal[] = [];

    signals.push(
      ...detectPriceMovement(input, candles, inputQuality),
      ...detectVolume(
        input,
        candles,
        trades,
        inputQuality,
      ),
      ...detectLiquidityAndMicrostructure(
        input,
        books,
        trades,
        liquidityPredictions,
        orderFlow,
        inputQuality,
      ),
      detectManipulation(
        input,
        candles,
        trades,
        orderFlow,
        inputQuality,
      ),
      ...detectDerivatives(input, inputQuality),
      ...detectCorrelation(input, correlations),
      detectDataQuality(input, featureVector),
      detectStatisticalOutlier(
        input,
        featureVector,
        candles,
        features,
      ),
    );

    const crossVenue = detectCrossVenueDislocation(
      input,
      candles,
    );

    if (crossVenue !== undefined) {
      signals.push(crossVenue);
    }

    const volatilityExpansion = Math.max(
      0,
      ...volatilityForecasts.map(
        (forecast) =>
          Number(forecast.expansionProbability) *
          Math.max(
            0,
            Number(forecast.changePercentage) * 100,
          ),
      ),
    );

    if (volatilityExpansion > 0) {
      signals.push(
        deepFreeze({
          type: AnomalyType.STATISTICAL_OUTLIER,
          score: volatilityExpansion,
          probability: clamp(
            Math.max(
              ...volatilityForecasts.map((forecast) =>
                Number(forecast.expansionProbability),
              ),
            ),
            0,
            1,
          ),
          confidence: clamp(
            Math.max(
              ...volatilityForecasts.map((forecast) =>
                Number(forecast.confidence),
              ),
            ) *
              Number(regime.confidence),
            0,
            1,
          ),
          affectedMarkets: [input.market],
          evidence: [
            evidence(
              "volatility_expansion_score",
              volatilityExpansion,
              "Forecast volatility expansion contributes to statistical anomaly risk.",
            ),
          ],
          summary:
            "Forecast volatility expansion exceeds ordinary conditions.",
        }),
      );
    }

    const anomalies = signals
      .map((signal) => {
        const threshold = thresholds.get(signal.type);

        return threshold === undefined
          ? undefined
          : materializeAnomaly(
              input,
              signal,
              threshold,
              configuration,
            );
      })
      .filter(
        (anomaly): anomaly is MarketAnomaly =>
          anomaly !== undefined,
      )
      .sort(
        (left, right) =>
          severityRank(right.severity) -
            severityRank(left.severity) ||
          Number(right.probability) -
            Number(left.probability) ||
          Number(right.confidence) -
            Number(left.confidence) ||
          left.type.localeCompare(right.type),
      )
      .slice(0, configuration.maximumActiveAnomalies);

    return deepFreeze(anomalies);
  }
}

export function createMarketAnomalyDetectionEngine(): MarketAnomalyDetectionEngine {
  return new DefaultMarketAnomalyDetectionEngine();
}

export function detectMarketAnomalies(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  configuration: AnomalyDetectionConfiguration,
): readonly MarketAnomaly[] {
  return new DefaultMarketAnomalyDetectionEngine().detect(
    input,
    featureVector,
    regime,
    volatilityForecasts,
    liquidityPredictions,
    orderFlow,
    correlations,
    configuration,
  );
}