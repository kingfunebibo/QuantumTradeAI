/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-intelligence-explainability-engine.ts
 *
 * Deterministic, immutable market-intelligence explainability.
 */

import {
  AnomalySeverity,
  CounterfactualExplanation,
  ExplainabilityConfiguration,
  ExplainabilityRecordId,
  ExplanationAudience,
  ExplanationFactor,
  ExplanationFactorDirection,
  FeatureCategory,
  LiquidityPrediction,
  MarketAnomaly,
  MarketCorrelationIntelligence,
  MarketDirection,
  MarketFeature,
  MarketFeatureVector,
  MarketIntelligenceExplainabilityEngine,
  MarketIntelligenceExplanation,
  MarketIntelligenceInput,
  MarketRegime,
  MarketRegimeIntelligence,
  NormalizedScore,
  OrderFlowBias,
  OrderFlowIntelligence,
  PriceMovementPrediction,
  UnifiedPredictionConfidence,
  VolatilityForecast,
} from "./ai-market-intelligence-contracts";

const ROUNDING_DECIMALS = 12;
const EPSILON = 1e-12;

interface FactorCandidate {
  readonly name: string;
  readonly category: FeatureCategory;
  readonly contribution: number;
  readonly importance: number;
  readonly observedValue?: number | string | boolean;
  readonly baselineValue?: number | string | boolean;
  readonly explanation: string;
  readonly uncertainty: boolean;
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

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) /
        values.length;
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

function explanationId(
  input: MarketIntelligenceInput,
  configuration: ExplainabilityConfiguration,
): ExplainabilityRecordId {
  const seed = [
    String(input.market.symbol),
    String(input.timeframe),
    Number(input.analysisTimeMs),
    String(configuration.audience),
    String(configuration.modelVersion),
  ].join(":");

  return `market-intelligence-explanation-${deterministicHash(
    seed,
  )}` as ExplainabilityRecordId;
}

function regimeContribution(
  regime: MarketRegimeIntelligence,
): number {
  const strength = Number(regime.regimeStrength);

  switch (regime.primaryRegime) {
    case MarketRegime.STRONG_BULL_TREND:
      return strength;
    case MarketRegime.BULL_TREND:
      return strength * 0.8;
    case MarketRegime.WEAK_BULL_TREND:
      return strength * 0.45;
    case MarketRegime.BREAKOUT:
      return strength * 0.7;
    case MarketRegime.STRONG_BEAR_TREND:
      return -strength;
    case MarketRegime.BEAR_TREND:
      return -strength * 0.8;
    case MarketRegime.WEAK_BEAR_TREND:
      return -strength * 0.45;
    case MarketRegime.BREAKDOWN:
      return -strength * 0.7;
    case MarketRegime.LIQUIDITY_STRESS:
    case MarketRegime.DISLOCATION:
      return -strength * 0.25;
    default:
      return 0;
  }
}

function orderFlowContribution(
  orderFlow: OrderFlowIntelligence,
): number {
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

function predictionContribution(
  prediction: PriceMovementPrediction,
): number {
  switch (prediction.direction) {
    case MarketDirection.STRONGLY_BULLISH:
      return 1;
    case MarketDirection.BULLISH:
      return 0.75;
    case MarketDirection.SLIGHTLY_BULLISH:
      return 0.4;
    case MarketDirection.STRONGLY_BEARISH:
      return -1;
    case MarketDirection.BEARISH:
      return -0.75;
    case MarketDirection.SLIGHTLY_BEARISH:
      return -0.4;
    default:
      return 0;
  }
}

function anomalyWeight(severity: AnomalySeverity): number {
  switch (severity) {
    case AnomalySeverity.CRITICAL:
      return 1;
    case AnomalySeverity.HIGH:
      return 0.8;
    case AnomalySeverity.MODERATE:
      return 0.55;
    case AnomalySeverity.LOW:
      return 0.3;
    default:
      return 0.15;
  }
}

function featureObservedValue(
  feature: MarketFeature,
): number | string | boolean | undefined {
  const value = feature.value as unknown;

  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "value" in value
  ) {
    const inner = (value as { readonly value?: unknown }).value;

    if (
      typeof inner === "number" ||
      typeof inner === "string" ||
      typeof inner === "boolean"
    ) {
      return inner;
    }
  }

  return undefined;
}

function featureCandidates(
  featureVector: MarketFeatureVector,
): readonly FactorCandidate[] {
  const available = featureVector.features.filter(
    (feature) => !feature.isMissing,
  );

  return deepFreeze(
    available
      .map((feature): FactorCandidate | undefined => {
        const observed = featureObservedValue(feature);

        if (observed === undefined) {
          return undefined;
        }

        const definition = feature.definition;
        const importance = clamp(
          Number(feature.qualityScore),
          0,
          1,
        );
        const contribution =
          typeof observed === "number"
            ? clamp(observed, -1, 1) * importance * 0.2
            : 0;

        return {
          name: String(definition.featureName),
          category: definition.category,
          contribution,
          importance,
          observedValue: observed,
          explanation: `Observed feature '${String(
            definition.featureName,
          )}' contributed according to its normalized value and quality.`,
          uncertainty:
            Number(feature.qualityScore) < 0.6,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is FactorCandidate =>
          candidate !== undefined,
      )
      .sort(
        (left, right) =>
          Math.abs(right.contribution) -
            Math.abs(left.contribution) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, 8),
  );
}

function buildCandidates(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  anomalies: readonly MarketAnomaly[],
  pricePredictions: readonly PriceMovementPrediction[],
  confidence: UnifiedPredictionConfidence,
): readonly FactorCandidate[] {
  const candidates: FactorCandidate[] = [];

  const regimeValue = regimeContribution(regime);
  candidates.push({
    name: "market_regime",
    category: FeatureCategory.TREND,
    contribution: regimeValue,
    importance: clamp(
      Number(regime.confidence) *
        Number(regime.regimeStrength),
      0,
      1,
    ),
    observedValue: regime.primaryRegime,
    baselineValue: MarketRegime.RANGE_BOUND,
    explanation: `The primary regime is ${regime.primaryRegime} with ${round(
      Number(regime.confidence),
    )} confidence and ${round(
      Number(regime.regimeStrength),
    )} strength.`,
    uncertainty:
      Number(regime.transitionProbability) >
      Number(regime.persistenceProbability),
  });

  const orderFlowValue = orderFlowContribution(orderFlow);
  candidates.push({
    name: "order_flow_bias",
    category: FeatureCategory.ORDER_FLOW,
    contribution: orderFlowValue,
    importance: clamp(Number(orderFlow.confidence), 0, 1),
    observedValue: orderFlow.bias,
    baselineValue: OrderFlowBias.BALANCED,
    explanation: `Order flow is ${orderFlow.bias}; buy pressure is ${round(
      Number(orderFlow.buyPressure),
    )} and sell pressure is ${round(
      Number(orderFlow.sellPressure),
    )}.`,
    uncertainty: Number(orderFlow.confidence) < 0.6,
  });

  if (volatilityForecasts.length > 0) {
    const averageChange = mean(
      volatilityForecasts.map((forecast) =>
        Number(forecast.changePercentage),
      ),
    );
    const averageExpansion = mean(
      volatilityForecasts.map((forecast) =>
        Number(forecast.expansionProbability),
      ),
    );
    const averageConfidence = mean(
      volatilityForecasts.map((forecast) =>
        Number(forecast.confidence),
      ),
    );

    candidates.push({
      name: "volatility_outlook",
      category: FeatureCategory.VOLATILITY,
      contribution:
        -clamp(
          averageExpansion * 0.7 +
            Math.max(0, averageChange) * 0.3,
          0,
          1,
        ),
      importance: clamp(averageConfidence, 0, 1),
      observedValue: round(averageChange),
      baselineValue: 0,
      explanation: `Average forecast volatility change is ${round(
        averageChange,
      )}, with expansion probability ${round(
        averageExpansion,
      )}.`,
      uncertainty: averageConfidence < 0.6,
    });
  }

  if (liquidityPredictions.length > 0) {
    const deterioration = mean(
      liquidityPredictions.map((prediction) =>
        Number(prediction.deteriorationProbability),
      ),
    );
    const fillProbability = mean(
      liquidityPredictions.map((prediction) =>
        Number(prediction.predictedFillProbability),
      ),
    );
    const liquidityContribution = clamp(
      fillProbability - deterioration,
      -1,
      1,
    );

    candidates.push({
      name: "liquidity_outlook",
      category: FeatureCategory.LIQUIDITY,
      contribution: liquidityContribution,
      importance: clamp(
        mean(
          liquidityPredictions.map((prediction) =>
            Number(prediction.confidence),
          ),
        ),
        0,
        1,
      ),
      observedValue: round(fillProbability),
      baselineValue: 0.5,
      explanation: `Average predicted fill probability is ${round(
        fillProbability,
      )}, while deterioration probability is ${round(
        deterioration,
      )}.`,
      uncertainty:
        mean(
          liquidityPredictions.map((prediction) =>
            Number(prediction.confidence),
          ),
        ) < 0.6,
    });
  }

  candidates.push({
    name: "market_correlation",
    category: FeatureCategory.CORRELATION,
    contribution: clamp(
      Number(correlations.averageMarketCorrelation) *
        (1 - Number(correlations.systemicRiskScore)),
      -1,
      1,
    ),
    importance: clamp(Number(correlations.confidence), 0, 1),
    observedValue: round(
      Number(correlations.averageMarketCorrelation),
    ),
    baselineValue: 0,
    explanation: `Average market correlation is ${round(
      Number(correlations.averageMarketCorrelation),
    )}; systemic risk is ${round(
      Number(correlations.systemicRiskScore),
    )}.`,
    uncertainty:
      Number(correlations.confidence) < 0.6 ||
      correlations.breakdowns.length > 0,
  });

  for (const anomaly of anomalies) {
    const risk =
      anomalyWeight(anomaly.severity) *
      Number(anomaly.probability) *
      Number(anomaly.confidence);

    candidates.push({
      name: `anomaly_${String(anomaly.type).toLowerCase()}`,
      category: FeatureCategory.ANOMALY,
      contribution: -clamp(risk, 0, 1),
      importance: clamp(risk, 0, 1),
      observedValue: anomaly.active,
      baselineValue: false,
      explanation: anomaly.summary,
      uncertainty:
        Number(anomaly.confidence) < 0.6 ||
        Number(anomaly.probability) < 0.6,
    });
  }

  for (const prediction of pricePredictions) {
    const contribution =
      predictionContribution(prediction) *
      Number(prediction.confidence);

    candidates.push({
      name: `price_prediction_${String(
        prediction.window.horizon,
      ).toLowerCase()}`,
      category: FeatureCategory.PRICE,
      contribution,
      importance: clamp(
        Number(prediction.confidence),
        0,
        1,
      ),
      observedValue: prediction.direction,
      baselineValue: MarketDirection.NEUTRAL,
      explanation: `${prediction.window.horizon} prediction is ${prediction.direction} with expected magnitude ${round(
        Number(prediction.expectedMagnitudePercentage),
      )}.`,
      uncertainty:
        Number(prediction.confidence) < 0.6 ||
        Number(prediction.directionProbabilities.neutral) >
          Math.max(
            Number(
              prediction.directionProbabilities.bullish,
            ),
            Number(
              prediction.directionProbabilities.bearish,
            ),
          ),
    });
  }

  candidates.push({
    name: "unified_confidence",
    category: FeatureCategory.CUSTOM,
    contribution:
      Number(confidence.confidence) >= 0.5
        ? Number(confidence.confidence) * 0.25
        : -(
            0.5 - Number(confidence.confidence)
          ),
    importance: clamp(
      Number(confidence.calibrationScore),
      0,
      1,
    ),
    observedValue: round(Number(confidence.confidence)),
    baselineValue: 0.5,
    explanation: `Unified confidence is ${round(
      Number(confidence.confidence),
    )}, classified as ${confidence.quality}.`,
    uncertainty:
      Number(confidence.confidence) < 0.5 ||
      confidence.agreement.conflictingComponents.length > 0,
  });

  candidates.push(...featureCandidates(featureVector));

  return deepFreeze(
    candidates.sort(
      (left, right) =>
        Math.abs(right.contribution) *
          right.importance -
          Math.abs(left.contribution) *
            left.importance ||
        left.name.localeCompare(right.name),
    ),
  );
}

function factorDirection(
  contribution: number,
): ExplanationFactorDirection {
  if (contribution > EPSILON) {
    return ExplanationFactorDirection.SUPPORTING;
  }

  if (contribution < -EPSILON) {
    return ExplanationFactorDirection.OPPOSING;
  }

  return ExplanationFactorDirection.NEUTRAL;
}

function rankFactors(
  candidates: readonly FactorCandidate[],
  predicate: (candidate: FactorCandidate) => boolean,
  maximum: number,
): readonly ExplanationFactor[] {
  return deepFreeze(
    candidates
      .filter(predicate)
      .slice(0, Math.max(0, maximum))
      .map(
        (candidate, index): ExplanationFactor =>
          deepFreeze({
            rank: index + 1,
            name: candidate.name,
            category: candidate.category,
            direction: factorDirection(
              candidate.contribution,
            ),
            importance: round(
              clamp(candidate.importance, 0, 1),
            ) as NormalizedScore,
            observedValue: candidate.observedValue,
            baselineValue: candidate.baselineValue,
            contribution: round(candidate.contribution),
            explanation: candidate.explanation,
          }),
      ),
  );
}

function buildCounterfactuals(
  candidates: readonly FactorCandidate[],
  maximum: number,
): readonly CounterfactualExplanation[] {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.observedValue !== undefined &&
      candidate.baselineValue !== undefined &&
      Math.abs(candidate.contribution) > EPSILON,
  );

  return deepFreeze(
    eligible
      .slice(0, Math.max(0, maximum))
      .map(
        (candidate): CounterfactualExplanation =>
          deepFreeze({
            changedFactor: candidate.name,
            originalValue: candidate.observedValue as
              | number
              | string
              | boolean,
            counterfactualValue:
              candidate.baselineValue as
                | number
                | string
                | boolean,
            expectedOutcomeChange:
              candidate.contribution > 0
                ? "Directional conviction and/or confidence would weaken toward a neutral baseline."
                : "Risk pressure would ease and the intelligence outlook would become less defensive.",
          }),
      ),
  );
}

function dominantPrediction(
  predictions: readonly PriceMovementPrediction[],
): PriceMovementPrediction | undefined {
  return [...predictions].sort(
    (left, right) =>
      Number(right.confidence) -
        Number(left.confidence) ||
      Number(left.window.durationMs) -
        Number(right.window.durationMs),
  )[0];
}

function audiencePrefix(audience: ExplanationAudience): string {
  switch (audience) {
    case ExplanationAudience.TRADER:
      return "Trading view";
    case ExplanationAudience.RISK_MANAGER:
      return "Risk view";
    case ExplanationAudience.PORTFOLIO_MANAGER:
      return "Portfolio view";
    case ExplanationAudience.AUDITOR:
      return "Audit view";
    default:
      return "System view";
  }
}

function headline(
  input: MarketIntelligenceInput,
  regime: MarketRegimeIntelligence,
  prediction: PriceMovementPrediction | undefined,
  confidence: UnifiedPredictionConfidence,
): string {
  const direction =
    prediction?.direction ?? MarketDirection.NEUTRAL;

  return `${String(input.market.symbol)}: ${direction} outlook under ${regime.primaryRegime} regime (${confidence.quality} confidence)`;
}

function summary(
  configuration: ExplainabilityConfiguration,
  regime: MarketRegimeIntelligence,
  prediction: PriceMovementPrediction | undefined,
  confidence: UnifiedPredictionConfidence,
  primaryFactors: readonly ExplanationFactor[],
  opposingFactors: readonly ExplanationFactor[],
): string {
  const primary =
    primaryFactors[0]?.name ?? "no dominant supporting factor";
  const opposing =
    opposingFactors[0]?.name ?? "no dominant opposing factor";
  const direction =
    prediction?.direction ?? MarketDirection.NEUTRAL;

  return `${audiencePrefix(
    configuration.audience,
  )}: the current outlook is ${direction} in a ${
    regime.primaryRegime
  } regime. The strongest supporting factor is ${primary}; the strongest opposing factor is ${opposing}. Unified confidence is ${round(
    Number(confidence.confidence),
  )}, with agreement score ${round(
    Number(confidence.agreement.agreementScore),
  )}.`;
}

function limitations(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  anomalies: readonly MarketAnomaly[],
  pricePredictions: readonly PriceMovementPrediction[],
  confidence: UnifiedPredictionConfidence,
  configuration: ExplainabilityConfiguration,
): readonly string[] {
  if (!configuration.includeLimitations) {
    return deepFreeze([]);
  }

  const values: string[] = [];

  if (featureVector.missingFeatureCount > 0) {
    values.push(
      `${featureVector.missingFeatureCount} feature(s) were unavailable or missing.`,
    );
  }

  if (Number(featureVector.qualityScore) < 0.7) {
    values.push(
      "Feature-vector quality is below the preferred high-confidence threshold.",
    );
  }

  if (volatilityForecasts.length === 0) {
    values.push(
      "No volatility forecast was available for this explanation.",
    );
  }

  if (liquidityPredictions.length === 0) {
    values.push(
      "No liquidity prediction was available for this explanation.",
    );
  }

  if (pricePredictions.length === 0) {
    values.push(
      "No price-movement prediction was available.",
    );
  }

  if (anomalies.some((anomaly) => anomaly.active)) {
    values.push(
      "Active market anomalies may make historical relationships unreliable.",
    );
  }

  if (
    confidence.agreement.conflictingComponents.length > 0
  ) {
    values.push(
      `Conflicting components: ${confidence.agreement.conflictingComponents.join(
        ", ",
      )}.`,
    );
  }

  if (input.candles.length < 30) {
    values.push(
      "The candle sample is limited and may reduce statistical reliability.",
    );
  }

  if (values.length === 0) {
    values.push(
      "Predictions remain probabilistic and may change when new market data arrives.",
    );
  }

  return deepFreeze([...new Set(values)].sort());
}

function validateConfiguration(
  configuration: ExplainabilityConfiguration,
): void {
  for (const [name, value] of [
    [
      "maximumPrimaryFactors",
      configuration.maximumPrimaryFactors,
    ],
    [
      "maximumOpposingFactors",
      configuration.maximumOpposingFactors,
    ],
    [
      "maximumCounterfactuals",
      configuration.maximumCounterfactuals,
    ],
  ] as const) {
    if (
      !Number.isInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `Explainability ${name} must be a non-negative integer.`,
      );
    }
  }
}

export class DefaultMarketIntelligenceExplainabilityEngine
  implements MarketIntelligenceExplainabilityEngine
{
  public explain(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    anomalies: readonly MarketAnomaly[],
    pricePredictions: readonly PriceMovementPrediction[],
    confidence: UnifiedPredictionConfidence,
    configuration: ExplainabilityConfiguration,
  ): MarketIntelligenceExplanation {
    validateConfiguration(configuration);

    const dominant = dominantPrediction(pricePredictions);

    if (!configuration.enabled) {
      return deepFreeze({
        id: explanationId(input, configuration),
        audience: configuration.audience,
        headline: "Market-intelligence explanation disabled",
        summary:
          "Explainability is disabled by configuration.",
        primaryFactors: [],
        opposingFactors: [],
        uncertaintyFactors: [],
        counterfactuals: [],
        limitations: configuration.includeLimitations
          ? ["Explainability output was disabled."]
          : [],
        generatedAtMs: input.analysisTimeMs,
        modelVersion: configuration.modelVersion,
      });
    }

    const candidates = buildCandidates(
      input,
      featureVector,
      regime,
      volatilityForecasts,
      liquidityPredictions,
      orderFlow,
      correlations,
      anomalies,
      pricePredictions,
      confidence,
    );

    const primaryFactors = rankFactors(
      candidates,
      (candidate) =>
        candidate.contribution > EPSILON &&
        !candidate.uncertainty,
      configuration.maximumPrimaryFactors,
    );
    const opposingFactors = rankFactors(
      candidates,
      (candidate) =>
        candidate.contribution < -EPSILON &&
        !candidate.uncertainty,
      configuration.maximumOpposingFactors,
    );
    const uncertaintyFactors = rankFactors(
      candidates,
      (candidate) => candidate.uncertainty,
      Math.max(
        configuration.maximumPrimaryFactors,
        configuration.maximumOpposingFactors,
      ),
    );
    const counterfactuals = buildCounterfactuals(
      candidates,
      configuration.maximumCounterfactuals,
    );

    return deepFreeze({
      id: explanationId(input, configuration),
      audience: configuration.audience,
      headline: headline(
        input,
        regime,
        dominant,
        confidence,
      ),
      summary: summary(
        configuration,
        regime,
        dominant,
        confidence,
        primaryFactors,
        opposingFactors,
      ),
      primaryFactors,
      opposingFactors,
      uncertaintyFactors,
      counterfactuals,
      limitations: limitations(
        input,
        featureVector,
        volatilityForecasts,
        liquidityPredictions,
        anomalies,
        pricePredictions,
        confidence,
        configuration,
      ),
      generatedAtMs: input.analysisTimeMs,
      modelVersion: configuration.modelVersion,
    });
  }
}

export function createMarketIntelligenceExplainabilityEngine(): MarketIntelligenceExplainabilityEngine {
  return new DefaultMarketIntelligenceExplainabilityEngine();
}

export function explainMarketIntelligence(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  anomalies: readonly MarketAnomaly[],
  pricePredictions: readonly PriceMovementPrediction[],
  confidence: UnifiedPredictionConfidence,
  configuration: ExplainabilityConfiguration,
): MarketIntelligenceExplanation {
  return new DefaultMarketIntelligenceExplainabilityEngine().explain(
    input,
    featureVector,
    regime,
    volatilityForecasts,
    liquidityPredictions,
    orderFlow,
    correlations,
    anomalies,
    pricePredictions,
    confidence,
    configuration,
  );
}