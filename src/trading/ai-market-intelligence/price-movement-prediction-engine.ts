/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/price-movement-prediction-engine.ts
 *
 * Deterministic, immutable multi-horizon price-movement prediction.
 */

import {
  AnomalySeverity,
  DirectionProbabilityDistribution,
  ExplanationFactorDirection,
  ForecastDriver,
  IntelligenceActionability,
  LiquidityPrediction,
  MarketAnomaly,
  MarketCorrelationIntelligence,
  MarketDirection,
  MarketFeatureVector,
  MarketIntelligenceInput,
  MarketPredictionId,
  MarketRegime,
  MarketRegimeIntelligence,
  OrderFlowBias,
  OrderFlowIntelligence,
  Percentage,
  PredictionWindow,
  Price,
  PriceMovementPrediction,
  PriceMovementPredictionEngine,
  PricePredictionConfiguration,
  PriceTarget,
  Probability,
  ConfidenceScore,
  VolatilityForecast,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;

interface ReturnStatistics {
  readonly latestPrice: number;
  readonly latestReturn: number;
  readonly shortMomentum: number;
  readonly mediumMomentum: number;
  readonly longMomentum: number;
  readonly realizedVolatility: number;
  readonly downsideVolatility: number;
  readonly sampleSize: number;
}

interface PredictionSignals {
  readonly directionalScore: number;
  readonly expectedReturn: number;
  readonly uncertainty: number;
  readonly continuationProbability: number;
  readonly reversalProbability: number;
  readonly confidence: number;
  readonly drivers: readonly ForecastDriver[];
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

function rootMeanSquare(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.sqrt(
    mean(values.map((value) => value * value)),
  );
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

function calculateReturns(
  input: MarketIntelligenceInput,
): ReturnStatistics {
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

  if (candles.length === 0) {
    return deepFreeze({
      latestPrice: 0,
      latestReturn: 0,
      shortMomentum: 0,
      mediumMomentum: 0,
      longMomentum: 0,
      realizedVolatility: 0,
      downsideVolatility: 0,
      sampleSize: 0,
    });
  }

  const returns: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const previous = Number(candles[index - 1].close);
    const current = Number(candles[index].close);

    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }

  const momentum = (lookback: number): number => {
    if (candles.length < 2) {
      return 0;
    }

    const end = Number(candles.at(-1)?.close ?? 0);
    const startIndex = Math.max(0, candles.length - 1 - lookback);
    const start = Number(candles[startIndex].close);

    return start > 0 && end > 0
      ? Math.log(end / start)
      : 0;
  };

  const negativeReturns = returns.filter((value) => value < 0);

  return deepFreeze({
    latestPrice: round(Number(candles.at(-1)?.close ?? 0)),
    latestReturn: round(returns.at(-1) ?? 0),
    shortMomentum: round(momentum(5)),
    mediumMomentum: round(momentum(20)),
    longMomentum: round(momentum(60)),
    realizedVolatility: round(standardDeviation(returns)),
    downsideVolatility: round(rootMeanSquare(negativeReturns)),
    sampleSize: returns.length,
  });
}

function horizonScale(
  window: PredictionWindow,
  configuration: PricePredictionConfiguration,
): number {
  const durations = configuration.horizons
    .map((candidate) => Number(candidate.durationMs))
    .filter((duration) => duration > 0)
    .sort((left, right) => left - right);

  const baseline = durations[0] ?? Number(window.durationMs);

  return clamp(
    Math.sqrt(
      safeDivide(
        Number(window.durationMs),
        Math.max(baseline, 1),
        1,
      ),
    ),
    0.5,
    8,
  );
}

function regimeSignal(regime: MarketRegimeIntelligence): number {
  const strength = Number(regime.regimeStrength);

  switch (regime.primaryRegime) {
    case MarketRegime.STRONG_BULL_TREND:
      return 1 * strength;
    case MarketRegime.BULL_TREND:
      return 0.8 * strength;
    case MarketRegime.WEAK_BULL_TREND:
      return 0.45 * strength;
    case MarketRegime.BREAKOUT:
      return 0.7 * strength;
    case MarketRegime.STRONG_BEAR_TREND:
      return -1 * strength;
    case MarketRegime.BEAR_TREND:
      return -0.8 * strength;
    case MarketRegime.WEAK_BEAR_TREND:
      return -0.45 * strength;
    case MarketRegime.BREAKDOWN:
      return -0.7 * strength;
    case MarketRegime.MEAN_REVERTING:
    case MarketRegime.RANGE_BOUND:
    case MarketRegime.VOLATILITY_CONTRACTION:
      return 0;
    case MarketRegime.LIQUIDITY_STRESS:
    case MarketRegime.DISLOCATION:
      return -0.2 * strength;
    default:
      return 0;
  }
}

function orderFlowSignal(orderFlow: OrderFlowIntelligence): number {
  switch (orderFlow.bias) {
    case OrderFlowBias.EXTREME_BUY:
      return 1;
    case OrderFlowBias.STRONG_BUY:
      return 0.8;
    case OrderFlowBias.BUY:
      return 0.5;
    case OrderFlowBias.EXTREME_SELL:
      return -1;
    case OrderFlowBias.STRONG_SELL:
      return -0.8;
    case OrderFlowBias.SELL:
      return -0.5;
    default:
      return clamp(
        Number(orderFlow.buyPressure) -
          Number(orderFlow.sellPressure),
        -1,
        1,
      );
  }
}

function anomalyPenalty(
  anomalies: readonly MarketAnomaly[],
): number {
  const severityWeight = (
    severity: AnomalySeverity,
  ): number => {
    switch (severity) {
      case AnomalySeverity.CRITICAL:
        return 1;
      case AnomalySeverity.HIGH:
        return 0.75;
      case AnomalySeverity.MODERATE:
        return 0.5;
      case AnomalySeverity.LOW:
        return 0.25;
      default:
        return 0.1;
    }
  };

  return clamp(
    anomalies.reduce(
      (total, anomaly) =>
        total +
        severityWeight(anomaly.severity) *
          Number(anomaly.probability) *
          Number(anomaly.confidence),
      0,
    ) / Math.max(anomalies.length, 1),
    0,
    1,
  );
}

function volatilityForWindow(
  window: PredictionWindow,
  forecasts: readonly VolatilityForecast[],
  fallback: number,
): Readonly<{
  volatility: number;
  confidence: number;
  expansionProbability: number;
}> {
  const exact = forecasts.find(
    (forecast) =>
      forecast.window.horizon === window.horizon &&
      Number(forecast.window.durationMs) ===
        Number(window.durationMs),
  );
  const selected =
    exact ??
    [...forecasts].sort(
      (left, right) =>
        Math.abs(
          Number(left.window.durationMs) -
            Number(window.durationMs),
        ) -
        Math.abs(
          Number(right.window.durationMs) -
            Number(window.durationMs),
        ),
    )[0];

  return deepFreeze({
    volatility: Math.max(
      0,
      Number(
        selected?.forecastRealizedVolatility ?? fallback,
      ),
    ),
    confidence: clamp(
      Number(selected?.confidence ?? 0.35),
      0,
      1,
    ),
    expansionProbability: clamp(
      Number(selected?.expansionProbability ?? 0),
      0,
      1,
    ),
  });
}

function liquidityForWindow(
  window: PredictionWindow,
  predictions: readonly LiquidityPrediction[],
): Readonly<{
  confidence: number;
  deterioration: number;
  fillProbability: number;
  impactBps: number;
}> {
  const exact = predictions.find(
    (prediction) =>
      prediction.window.horizon === window.horizon &&
      Number(prediction.window.durationMs) ===
        Number(window.durationMs),
  );
  const selected =
    exact ??
    [...predictions].sort(
      (left, right) =>
        Math.abs(
          Number(left.window.durationMs) -
            Number(window.durationMs),
        ) -
        Math.abs(
          Number(right.window.durationMs) -
            Number(window.durationMs),
        ),
    )[0];

  return deepFreeze({
    confidence: clamp(
      Number(selected?.confidence ?? 0.35),
      0,
      1,
    ),
    deterioration: clamp(
      Number(selected?.deteriorationProbability ?? 0),
      0,
      1,
    ),
    fillProbability: clamp(
      Number(selected?.predictedFillProbability ?? 0.5),
      0,
      1,
    ),
    impactBps: Math.max(
      0,
      Number(selected?.predictedMarketImpactBps ?? 0),
    ),
  });
}

function directionProbabilities(
  score: number,
  uncertainty: number,
  neutralBand: number,
): DirectionProbabilityDistribution {
  const boundedScore = clamp(score, -1, 1);
  const directionalStrength = Math.abs(boundedScore);
  const uncertaintyPenalty = clamp(uncertainty, 0, 1);
  const neutralBase = clamp(
    1 -
      directionalStrength *
        (1 - uncertaintyPenalty * 0.65),
    neutralBand,
    0.9,
  );
  const directionalMass = 1 - neutralBase;
  const bullishShare = clamp(
    0.5 + boundedScore / 2,
    0,
    1,
  );
  const bullish = directionalMass * bullishShare;
  const bearish = directionalMass * (1 - bullishShare);
  const total = bearish + neutralBase + bullish;

  return deepFreeze({
    bearish: round(bearish / total) as Probability,
    neutral: round(neutralBase / total) as Probability,
    bullish: round(bullish / total) as Probability,
  });
}

function classifyDirection(
  probabilities: DirectionProbabilityDistribution,
  expectedReturn: number,
  configuration: PricePredictionConfiguration,
): MarketDirection {
  const neutralBand = Math.abs(
    Number(configuration.neutralReturnBandPercentage),
  );
  const bullish = Number(probabilities.bullish);
  const bearish = Number(probabilities.bearish);
  const strongThreshold = Number(
    configuration.strongDirectionThreshold,
  );

  if (Math.abs(expectedReturn) <= neutralBand) {
    return MarketDirection.NEUTRAL;
  }

  if (bullish >= strongThreshold) {
    return MarketDirection.STRONGLY_BULLISH;
  }

  if (bearish >= strongThreshold) {
    return MarketDirection.STRONGLY_BEARISH;
  }

  if (bullish > bearish) {
    return bullish >= 0.55
      ? MarketDirection.BULLISH
      : MarketDirection.SLIGHTLY_BULLISH;
  }

  return bearish >= 0.55
    ? MarketDirection.BEARISH
    : MarketDirection.SLIGHTLY_BEARISH;
}

function actionability(
  direction: MarketDirection,
  confidence: number,
  anomalyRisk: number,
  configuration: PricePredictionConfiguration,
): IntelligenceActionability {
  if (confidence < Number(configuration.minimumConfidence)) {
    return IntelligenceActionability.NOT_ACTIONABLE;
  }

  if (anomalyRisk >= 0.7) {
    return IntelligenceActionability.RISK_REDUCTION;
  }

  if (direction === MarketDirection.NEUTRAL) {
    return IntelligenceActionability.MONITOR;
  }

  if (
    direction === MarketDirection.STRONGLY_BULLISH ||
    direction === MarketDirection.STRONGLY_BEARISH
  ) {
    return IntelligenceActionability.TRADE_CANDIDATE;
  }

  return IntelligenceActionability.STRATEGY_ADJUSTMENT;
}

function createDriver(
  name: string,
  contribution: number,
  observedValue: number | string | boolean,
  description: string,
): ForecastDriver {
  return deepFreeze({
    name,
    direction:
      contribution > 0
        ? ExplanationFactorDirection.SUPPORTING
        : contribution < 0
          ? ExplanationFactorDirection.OPPOSING
          : ExplanationFactorDirection.NEUTRAL,
    contribution: round(contribution),
    observedValue,
    description,
  });
}

function buildSignals(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  anomalies: readonly MarketAnomaly[],
  window: PredictionWindow,
  configuration: PricePredictionConfiguration,
  returns: ReturnStatistics,
): PredictionSignals {
  const scale = horizonScale(window, configuration);
  const regimeValue = regimeSignal(regime);
  const orderFlowValue = orderFlowSignal(orderFlow);
  const momentumValue = clamp(
    returns.shortMomentum * 12 * 0.45 +
      returns.mediumMomentum * 6 * 0.35 +
      returns.longMomentum * 3 * 0.2,
    -1,
    1,
  );
  const correlationValue = clamp(
    Number(correlations.averageMarketCorrelation) *
      (1 - Number(correlations.systemicRiskScore)),
    -1,
    1,
  );
  const volatility = volatilityForWindow(
    window,
    volatilityForecasts,
    returns.realizedVolatility,
  );
  const liquidity = liquidityForWindow(
    window,
    liquidityPredictions,
  );
  const anomalyRisk = anomalyPenalty(anomalies);
  const meanReversionAdjustment =
    regime.primaryRegime === MarketRegime.MEAN_REVERTING
      ? -Math.sign(momentumValue) *
        Math.min(Math.abs(momentumValue), 0.4)
      : 0;

  const directionalScore = clamp(
    regimeValue * 0.3 +
      momentumValue * 0.25 +
      orderFlowValue * 0.25 +
      correlationValue * 0.1 +
      meanReversionAdjustment * 0.1,
    -1,
    1,
  );

  const baseMagnitude =
    Math.abs(directionalScore) *
      Math.max(
        Number(
          configuration.neutralReturnBandPercentage,
        ),
        volatility.volatility * scale,
        Math.abs(returns.latestReturn) * scale,
      );
  const directionSign =
    Math.abs(directionalScore) <= EPSILON
      ? 0
      : Math.sign(directionalScore);
  const expectedReturn =
    directionSign *
    baseMagnitude *
    (1 - liquidity.deterioration * 0.25) *
    (1 - anomalyRisk * 0.35);

  const disagreement =
    Math.abs(regimeValue - orderFlowValue) / 2;
  const uncertainty = clamp(
    volatility.expansionProbability * 0.3 +
      liquidity.deterioration * 0.25 +
      anomalyRisk * 0.25 +
      disagreement * 0.2,
    0,
    1,
  );

  const continuationProbability = clamp(
    Number(orderFlow.continuationProbability) * 0.4 +
      Number(regime.persistenceProbability) * 0.35 +
      (1 - uncertainty) * 0.25,
    0,
    1,
  );
  const reversalProbability = clamp(
    Number(orderFlow.reversalProbability) * 0.45 +
      Number(regime.transitionProbability) * 0.3 +
      anomalyRisk * 0.25,
    0,
    1,
  );

  const sourceConfidence = mean([
    Number(regime.confidence),
    Number(orderFlow.confidence),
    Number(correlations.confidence),
    volatility.confidence,
    liquidity.confidence,
    Number(featureVector.qualityScore),
    qualityScore(input),
  ]);
  const confidence = clamp(
    sourceConfidence *
      (1 - uncertainty * 0.55) *
      clamp(returns.sampleSize / 30, 0.35, 1),
    0,
    1,
  );

  const drivers = deepFreeze(
    [
      createDriver(
        "market_regime",
        regimeValue * 0.3,
        regime.primaryRegime,
        "Primary market regime contribution to directional conviction.",
      ),
      createDriver(
        "historical_momentum",
        momentumValue * 0.25,
        momentumValue,
        "Multi-lookback historical return momentum.",
      ),
      createDriver(
        "order_flow",
        orderFlowValue * 0.25,
        orderFlow.bias,
        "Directional pressure inferred from order-flow intelligence.",
      ),
      createDriver(
        "market_correlation",
        correlationValue * 0.1,
        Number(correlations.averageMarketCorrelation),
        "Broader market relationship adjusted for systemic concentration.",
      ),
      createDriver(
        "liquidity_risk",
        -liquidity.deterioration * 0.15,
        liquidity.deterioration,
        "Liquidity deterioration reduces directional reliability and executable magnitude.",
      ),
      createDriver(
        "anomaly_risk",
        -anomalyRisk * 0.2,
        anomalyRisk,
        "Active anomalies reduce prediction reliability.",
      ),
    ].sort(
      (left, right) =>
        Math.abs(right.contribution) -
          Math.abs(left.contribution) ||
        left.name.localeCompare(right.name),
    ),
  );

  return deepFreeze({
    directionalScore: round(directionalScore),
    expectedReturn: round(expectedReturn),
    uncertainty: round(uncertainty),
    continuationProbability: round(
      continuationProbability,
    ),
    reversalProbability: round(reversalProbability),
    confidence: round(confidence),
    drivers,
  });
}

function priceTarget(
  latestPrice: number,
  expectedReturn: number,
  uncertainty: number,
  forecastVolatility: number,
  scale: number,
  includePriceTargets: boolean,
): PriceTarget {
  if (latestPrice <= 0) {
    return deepFreeze({
      expectedPrice: 0 as Price,
      lowerPrice: 0 as Price,
      upperPrice: 0 as Price,
      expectedReturnPercentage: 0 as Percentage,
      lowerReturnPercentage: 0 as Percentage,
      upperReturnPercentage: 0 as Percentage,
    });
  }

  if (!includePriceTargets) {
    return deepFreeze({
      expectedPrice: round(latestPrice) as Price,
      lowerPrice: round(latestPrice) as Price,
      upperPrice: round(latestPrice) as Price,
      expectedReturnPercentage: 0 as Percentage,
      lowerReturnPercentage: 0 as Percentage,
      upperReturnPercentage: 0 as Percentage,
    });
  }

  const uncertaintyBand = Math.max(
    forecastVolatility * scale * (1 + uncertainty),
    Math.abs(expectedReturn) * 0.35,
  );
  const lowerReturn = expectedReturn - uncertaintyBand;
  const upperReturn = expectedReturn + uncertaintyBand;

  return deepFreeze({
    expectedPrice: round(
      latestPrice * Math.exp(expectedReturn),
    ) as Price,
    lowerPrice: round(
      latestPrice * Math.exp(lowerReturn),
    ) as Price,
    upperPrice: round(
      latestPrice * Math.exp(upperReturn),
    ) as Price,
    expectedReturnPercentage:
      round(expectedReturn) as Percentage,
    lowerReturnPercentage:
      round(lowerReturn) as Percentage,
    upperReturnPercentage:
      round(upperReturn) as Percentage,
  });
}

function invalidationPrice(
  latestPrice: number,
  direction: MarketDirection,
  target: PriceTarget,
  configuration: PricePredictionConfiguration,
): Price | undefined {
  if (
    !configuration.includeInvalidationPrice ||
    latestPrice <= 0 ||
    direction === MarketDirection.NEUTRAL
  ) {
    return undefined;
  }

  const bullish =
    direction === MarketDirection.SLIGHTLY_BULLISH ||
    direction === MarketDirection.BULLISH ||
    direction === MarketDirection.STRONGLY_BULLISH;

  return round(
    bullish
      ? Math.min(
          latestPrice,
          Number(target.lowerPrice),
        )
      : Math.max(
          latestPrice,
          Number(target.upperPrice),
        ),
  ) as Price;
}

function predictionId(
  input: MarketIntelligenceInput,
  window: PredictionWindow,
  configuration: PricePredictionConfiguration,
): MarketPredictionId {
  const seed = [
    String(input.market.symbol),
    window.horizon,
    Number(window.durationMs),
    Number(window.startTimeMs),
    Number(window.endTimeMs),
    String(configuration.modelVersion),
  ].join(":");

  return `price-prediction-${deterministicHash(
    seed,
  )}` as MarketPredictionId;
}

function validateConfiguration(
  configuration: PricePredictionConfiguration,
): void {
  if (configuration.horizons.length === 0) {
    throw new Error(
      "Price prediction configuration requires at least one horizon.",
    );
  }

  if (
    Number(configuration.minimumConfidence) < 0 ||
    Number(configuration.minimumConfidence) > 1
  ) {
    throw new Error(
      "Price prediction minimumConfidence must be within [0, 1].",
    );
  }

  if (
    Number(configuration.strongDirectionThreshold) < 0.5 ||
    Number(configuration.strongDirectionThreshold) > 1
  ) {
    throw new Error(
      "Price prediction strongDirectionThreshold must be within [0.5, 1].",
    );
  }

  if (
    !Number.isFinite(
      Number(configuration.neutralReturnBandPercentage),
    ) ||
    Number(configuration.neutralReturnBandPercentage) < 0
  ) {
    throw new Error(
      "Price prediction neutralReturnBandPercentage must be non-negative.",
    );
  }

  const seen = new Set<string>();

  for (const window of configuration.horizons) {
    if (
      Number(window.durationMs) <= 0 ||
      Number(window.endTimeMs) <
        Number(window.startTimeMs)
    ) {
      throw new Error(
        "Every price-prediction horizon must have a positive duration and valid time range.",
      );
    }

    const key = `${window.horizon}:${Number(
      window.durationMs,
    )}`;

    if (seen.has(key)) {
      throw new Error(
        `Duplicate price-prediction horizon ${key}.`,
      );
    }

    seen.add(key);
  }
}

export class DefaultPriceMovementPredictionEngine
  implements PriceMovementPredictionEngine
{
  public predict(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    anomalies: readonly MarketAnomaly[],
    configuration: PricePredictionConfiguration,
  ): readonly PriceMovementPrediction[] {
    validateConfiguration(configuration);

    if (!configuration.enabled) {
      return deepFreeze([]);
    }

    const returns = calculateReturns(input);

    const predictions = configuration.horizons.map(
      (window): PriceMovementPrediction => {
        const signals = buildSignals(
          input,
          featureVector,
          regime,
          volatilityForecasts,
          liquidityPredictions,
          orderFlow,
          correlations,
          anomalies,
          window,
          configuration,
          returns,
        );
        const probabilities = directionProbabilities(
          signals.directionalScore,
          signals.uncertainty,
          clamp(
            Number(
              configuration.neutralReturnBandPercentage,
            ) * 10,
            0.05,
            0.75,
          ),
        );
        const direction = classifyDirection(
          probabilities,
          signals.expectedReturn,
          configuration,
        );
        const volatility = volatilityForWindow(
          window,
          volatilityForecasts,
          returns.realizedVolatility,
        );
        const scale = horizonScale(window, configuration);
        const target = priceTarget(
          returns.latestPrice,
          signals.expectedReturn,
          signals.uncertainty,
          volatility.volatility,
          scale,
          configuration.includePriceTargets,
        );
        const anomalyRisk = anomalyPenalty(anomalies);

        return deepFreeze({
          predictionId: predictionId(
            input,
            window,
            configuration,
          ),
          market: input.market,
          window: deepFreeze({ ...window }),
          direction,
          directionProbabilities: probabilities,
          target,
          expectedMagnitudePercentage: round(
            Math.abs(signals.expectedReturn),
          ) as Percentage,
          continuationProbability: signals
            .continuationProbability as Probability,
          reversalProbability:
            signals.reversalProbability as Probability,
          invalidationPrice: invalidationPrice(
            returns.latestPrice,
            direction,
            target,
            configuration,
          ),
          confidence: signals.confidence as ConfidenceScore,
          actionability: actionability(
            direction,
            signals.confidence,
            anomalyRisk,
            configuration,
          ),
          drivers: signals.drivers,
          modelVersion: configuration.modelVersion,
          generatedAtMs: input.analysisTimeMs,
        });
      },
    );

    return deepFreeze(
      predictions.sort(
        (left, right) =>
          Number(left.window.durationMs) -
            Number(right.window.durationMs) ||
          left.window.horizon.localeCompare(
            right.window.horizon,
          ),
      ),
    );
  }
}

export function createPriceMovementPredictionEngine(): PriceMovementPredictionEngine {
  return new DefaultPriceMovementPredictionEngine();
}

export function predictPriceMovements(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  anomalies: readonly MarketAnomaly[],
  configuration: PricePredictionConfiguration,
): readonly PriceMovementPrediction[] {
  return new DefaultPriceMovementPredictionEngine().predict(
    input,
    featureVector,
    regime,
    volatilityForecasts,
    liquidityPredictions,
    orderFlow,
    correlations,
    anomalies,
    configuration,
  );
}