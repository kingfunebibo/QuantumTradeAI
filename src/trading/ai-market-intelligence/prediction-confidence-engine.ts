/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/prediction-confidence-engine.ts
 *
 * Deterministic, immutable prediction-confidence aggregation.
 */

import {
  AnomalySeverity,
  ConfidenceAggregationConfiguration,
  ConfidenceComponent,
  ConfidenceQuality,
  ConfidenceScore,
  LiquidityPrediction,
  MarketAnomaly,
  MarketCorrelationIntelligence,
  MarketDirection,
  MarketIntelligenceInput,
  MarketRegimeIntelligence,
  NormalizedScore,
  OrderFlowBias,
  OrderFlowIntelligence,
  PredictionAgreement,
  PredictionConfidenceEngine,
  PriceMovementPrediction,
  UnifiedPredictionConfidence,
  VolatilityForecast,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;

const COMPONENT_DATA_QUALITY = "data_quality";
const COMPONENT_REGIME = "regime";
const COMPONENT_VOLATILITY = "volatility";
const COMPONENT_LIQUIDITY = "liquidity";
const COMPONENT_ORDER_FLOW = "order_flow";
const COMPONENT_CORRELATION = "correlation";
const COMPONENT_PRICE_PREDICTION = "price_prediction";

interface RawComponent {
  readonly name: string;
  readonly confidence: number;
  readonly qualityAdjustment: number;
  readonly directionalSignal?: number;
  readonly excluded: boolean;
  readonly exclusionReason?: string;
}

interface AgreementAnalysis {
  readonly agreementScore: number;
  readonly conflictingComponents: readonly string[];
  readonly supportingComponents: readonly string[];
  readonly adjustmentByComponent: ReadonlyMap<string, number>;
  readonly conflictDescription?: string;
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

function weightedMean(
  entries: readonly Readonly<{
    value: number;
    weight: number;
  }>[],
): number {
  const totalWeight = entries.reduce(
    (total, entry) => total + Math.max(0, entry.weight),
    0,
  );

  if (totalWeight <= EPSILON) {
    return 0;
  }

  return (
    entries.reduce(
      (total, entry) =>
        total +
        entry.value * Math.max(0, entry.weight),
      0,
    ) / totalWeight
  );
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

function dataQualityScore(input: MarketIntelligenceInput): number {
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

function regimeDirectionalSignal(
  regime: MarketRegimeIntelligence,
): number {
  const name = String(regime.primaryRegime);

  if (
    name.includes("BULL") ||
    name === "BREAKOUT"
  ) {
    return Number(regime.regimeStrength);
  }

  if (
    name.includes("BEAR") ||
    name === "BREAKDOWN"
  ) {
    return -Number(regime.regimeStrength);
  }

  return 0;
}

function orderFlowDirectionalSignal(
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

function directionSignal(direction: MarketDirection): number {
  switch (direction) {
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

function averageForecastConfidence(
  forecasts: readonly VolatilityForecast[],
): number {
  return clamp(
    mean(
      forecasts.map((forecast) =>
        Number(forecast.confidence),
      ),
    ),
    0,
    1,
  );
}

function volatilityQualityAdjustment(
  forecasts: readonly VolatilityForecast[],
): number {
  if (forecasts.length === 0) {
    return -0.35;
  }

  const confidenceDispersion = standardDeviation(
    forecasts.map((forecast) =>
      Number(forecast.confidence),
    ),
  );
  const expansionRisk = mean(
    forecasts.map((forecast) =>
      Number(forecast.expansionProbability),
    ),
  );

  return clamp(
    0.1 -
      confidenceDispersion * 0.4 -
      expansionRisk * 0.15,
    -0.5,
    0.2,
  );
}

function averageLiquidityConfidence(
  predictions: readonly LiquidityPrediction[],
): number {
  return clamp(
    mean(
      predictions.map((prediction) =>
        Number(prediction.confidence),
      ),
    ),
    0,
    1,
  );
}

function liquidityQualityAdjustment(
  predictions: readonly LiquidityPrediction[],
): number {
  if (predictions.length === 0) {
    return -0.35;
  }

  const deterioration = mean(
    predictions.map((prediction) =>
      Number(prediction.deteriorationProbability),
    ),
  );
  const fillProbability = mean(
    predictions.map((prediction) =>
      Number(prediction.predictedFillProbability),
    ),
  );

  return clamp(
    fillProbability * 0.15 -
      deterioration * 0.3,
    -0.5,
    0.2,
  );
}

function averagePredictionConfidence(
  predictions: readonly PriceMovementPrediction[],
): number {
  return clamp(
    mean(
      predictions.map((prediction) =>
        Number(prediction.confidence),
      ),
    ),
    0,
    1,
  );
}

function pricePredictionDirectionalSignal(
  predictions: readonly PriceMovementPrediction[],
): number | undefined {
  if (predictions.length === 0) {
    return undefined;
  }

  return clamp(
    weightedMean(
      predictions.map((prediction) => ({
        value: directionSignal(prediction.direction),
        weight: Math.max(
          Number(prediction.confidence),
          EPSILON,
        ),
      })),
    ),
    -1,
    1,
  );
}

function anomalySeverityWeight(
  severity: AnomalySeverity,
): number {
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
      return 0.1;
  }
}

function anomalyRisk(anomalies: readonly MarketAnomaly[]): number {
  if (anomalies.length === 0) {
    return 0;
  }

  return clamp(
    anomalies.reduce(
      (total, anomaly) =>
        total +
        anomalySeverityWeight(anomaly.severity) *
          Number(anomaly.probability) *
          Number(anomaly.confidence),
      0,
    ) / anomalies.length,
    0,
    1,
  );
}

function componentWeight(
  configuration: ConfidenceAggregationConfiguration,
  componentName: string,
): number {
  const configured = Number(
    configuration.componentWeights[componentName] ?? 0,
  );

  return Number.isFinite(configured)
    ? Math.max(0, configured)
    : 0;
}

function buildRawComponents(
  input: MarketIntelligenceInput,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  pricePredictions: readonly PriceMovementPrediction[],
  configuration: ConfidenceAggregationConfiguration,
): readonly RawComponent[] {
  const dataQuality = dataQualityScore(input);
  const minimumDataQuality = Number(
    configuration.minimumDataQuality,
  );
  const dataExcluded = dataQuality < minimumDataQuality;

  const components: RawComponent[] = [
    {
      name: COMPONENT_DATA_QUALITY,
      confidence: dataQuality,
      qualityAdjustment: dataExcluded ? -0.5 : 0,
      excluded: false,
    },
    {
      name: COMPONENT_REGIME,
      confidence: Number(regime.confidence),
      qualityAdjustment:
        Number(regime.persistenceProbability) * 0.1 -
        Number(regime.transitionProbability) * 0.2,
      directionalSignal: regimeDirectionalSignal(regime),
      excluded: dataExcluded,
      exclusionReason: dataExcluded
        ? "Input data quality is below the configured minimum."
        : undefined,
    },
    {
      name: COMPONENT_VOLATILITY,
      confidence: averageForecastConfidence(
        volatilityForecasts,
      ),
      qualityAdjustment:
        volatilityQualityAdjustment(volatilityForecasts),
      excluded:
        dataExcluded || volatilityForecasts.length === 0,
      exclusionReason:
        volatilityForecasts.length === 0
          ? "No volatility forecasts were available."
          : dataExcluded
            ? "Input data quality is below the configured minimum."
            : undefined,
    },
    {
      name: COMPONENT_LIQUIDITY,
      confidence: averageLiquidityConfidence(
        liquidityPredictions,
      ),
      qualityAdjustment:
        liquidityQualityAdjustment(liquidityPredictions),
      excluded:
        dataExcluded || liquidityPredictions.length === 0,
      exclusionReason:
        liquidityPredictions.length === 0
          ? "No liquidity predictions were available."
          : dataExcluded
            ? "Input data quality is below the configured minimum."
            : undefined,
    },
    {
      name: COMPONENT_ORDER_FLOW,
      confidence: Number(orderFlow.confidence),
      qualityAdjustment:
        Number(orderFlow.institutionalFootprintScore) * 0.05,
      directionalSignal:
        orderFlowDirectionalSignal(orderFlow),
      excluded: dataExcluded,
      exclusionReason: dataExcluded
        ? "Input data quality is below the configured minimum."
        : undefined,
    },
    {
      name: COMPONENT_CORRELATION,
      confidence: Number(correlations.confidence),
      qualityAdjustment:
        Number(correlations.diversificationScore) * 0.05 -
        Number(correlations.systemicRiskScore) * 0.1,
      excluded: dataExcluded,
      exclusionReason: dataExcluded
        ? "Input data quality is below the configured minimum."
        : undefined,
    },
    {
      name: COMPONENT_PRICE_PREDICTION,
      confidence:
        averagePredictionConfidence(pricePredictions),
      qualityAdjustment:
        pricePredictions.length === 0 ? -0.4 : 0,
      directionalSignal:
        pricePredictionDirectionalSignal(pricePredictions),
      excluded:
        dataExcluded || pricePredictions.length === 0,
      exclusionReason:
        pricePredictions.length === 0
          ? "No price predictions were available."
          : dataExcluded
            ? "Input data quality is below the configured minimum."
            : undefined,
    },
  ];

  return deepFreeze(components);
}

function analyzeAgreement(
  components: readonly RawComponent[],
): AgreementAnalysis {
  const directional = components.filter(
    (
      component,
    ): component is RawComponent & {
      readonly directionalSignal: number;
    } =>
      !component.excluded &&
      component.directionalSignal !== undefined &&
      Math.abs(component.directionalSignal) > 0.05,
  );

  if (directional.length === 0) {
    return deepFreeze({
      agreementScore: 1,
      conflictingComponents: [],
      supportingComponents: [],
      adjustmentByComponent: new Map<string, number>(),
    });
  }

  const consensus = weightedMean(
    directional.map((component) => ({
      value: component.directionalSignal,
      weight: Math.max(component.confidence, EPSILON),
    })),
  );
  const consensusSign =
    Math.abs(consensus) <= 0.05
      ? 0
      : Math.sign(consensus);

  const supporting: string[] = [];
  const conflicting: string[] = [];
  const adjustments = new Map<string, number>();
  let weightedAgreement = 0;
  let totalWeight = 0;

  for (const component of directional) {
    const signalSign = Math.sign(component.directionalSignal);
    const aligned =
      consensusSign === 0 || signalSign === consensusSign;
    const strength = Math.abs(component.directionalSignal);
    const weight = Math.max(component.confidence, EPSILON);

    if (aligned) {
      supporting.push(component.name);
      adjustments.set(
        component.name,
        clamp(0.05 + strength * 0.1, 0, 0.15),
      );
      weightedAgreement += weight;
    } else {
      conflicting.push(component.name);
      adjustments.set(
        component.name,
        clamp(-0.1 - strength * 0.15, -0.25, 0),
      );
    }

    totalWeight += weight;
  }

  const agreementScore = clamp(
    safeDivide(weightedAgreement, totalWeight, 1),
    0,
    1,
  );

  return deepFreeze({
    agreementScore,
    conflictingComponents: [...conflicting].sort(),
    supportingComponents: [...supporting].sort(),
    adjustmentByComponent: adjustments,
    conflictDescription:
      conflicting.length === 0
        ? undefined
        : `Directional disagreement detected across: ${[
            ...conflicting,
          ]
            .sort()
            .join(", ")}.`,
  });
}

function normalizedWeights(
  components: readonly RawComponent[],
  configuration: ConfidenceAggregationConfiguration,
): ReadonlyMap<string, number> {
  const eligible = components.filter(
    (component) => !component.excluded,
  );
  const configuredTotal = eligible.reduce(
    (total, component) =>
      total +
      componentWeight(configuration, component.name),
    0,
  );
  const fallbackWeight =
    eligible.length === 0 ? 0 : 1 / eligible.length;
  const weights = new Map<string, number>();

  for (const component of components) {
    if (component.excluded) {
      weights.set(component.name, 0);
      continue;
    }

    const configured = componentWeight(
      configuration,
      component.name,
    );

    weights.set(
      component.name,
      configuredTotal > EPSILON
        ? configured / configuredTotal
        : fallbackWeight,
    );
  }

  return weights;
}

function materializeComponents(
  rawComponents: readonly RawComponent[],
  weights: ReadonlyMap<string, number>,
  agreement: AgreementAnalysis,
): readonly ConfidenceComponent[] {
  return deepFreeze(
    rawComponents
      .map((component): ConfidenceComponent => {
        const weight = weights.get(component.name) ?? 0;
        const agreementAdjustment =
          agreement.adjustmentByComponent.get(
            component.name,
          ) ?? 0;
        const adjustedConfidence = clamp(
          component.confidence +
            component.qualityAdjustment +
            agreementAdjustment,
          0,
          1,
        );

        return deepFreeze({
          componentName: component.name,
          rawConfidence: round(
            clamp(component.confidence, 0, 1),
          ) as ConfidenceScore,
          effectiveWeight: round(
            weight,
          ) as NormalizedScore,
          qualityAdjustment: round(
            component.qualityAdjustment,
          ),
          agreementAdjustment: round(
            agreementAdjustment,
          ),
          finalContribution: round(
            component.excluded
              ? 0
              : adjustedConfidence * weight,
          ),
          excluded: component.excluded,
          exclusionReason: component.exclusionReason,
        });
      })
      .sort((left, right) =>
        left.componentName.localeCompare(
          right.componentName,
        ),
      ),
  );
}

function confidenceQuality(
  confidence: number,
): ConfidenceQuality {
  if (confidence >= 0.85) {
    return ConfidenceQuality.VERY_HIGH;
  }

  if (confidence >= 0.7) {
    return ConfidenceQuality.HIGH;
  }

  if (confidence >= 0.5) {
    return ConfidenceQuality.MODERATE;
  }

  if (confidence >= 0.3) {
    return ConfidenceQuality.LOW;
  }

  return ConfidenceQuality.VERY_LOW;
}

function calibrationScore(
  confidence: number,
  agreement: number,
  dataQuality: number,
  publishableThreshold: number,
): number {
  const publishability =
    confidence >= publishableThreshold
      ? 1
      : clamp(
          safeDivide(
            confidence,
            Math.max(publishableThreshold, EPSILON),
          ),
          0,
          1,
        );

  return clamp(
    confidence * 0.45 +
      agreement * 0.25 +
      dataQuality * 0.2 +
      publishability * 0.1,
    0,
    1,
  );
}

function validateConfiguration(
  configuration: ConfidenceAggregationConfiguration,
): void {
  if (
    Number(configuration.minimumDataQuality) < 0 ||
    Number(configuration.minimumDataQuality) > 1
  ) {
    throw new Error(
      "Confidence minimumDataQuality must be within [0, 1].",
    );
  }

  if (
    Number(configuration.minimumPublishableConfidence) < 0 ||
    Number(configuration.minimumPublishableConfidence) > 1
  ) {
    throw new Error(
      "Confidence minimumPublishableConfidence must be within [0, 1].",
    );
  }

  for (const [name, weight] of Object.entries(
    configuration.componentWeights,
  )) {
    if (!Number.isFinite(Number(weight)) || Number(weight) < 0) {
      throw new Error(
        `Confidence component weight '${name}' must be finite and non-negative.`,
      );
    }
  }

  for (const [name, value] of [
    ["disagreementPenalty", configuration.disagreementPenalty],
    ["anomalyPenalty", configuration.anomalyPenalty],
    [
      "regimeInstabilityPenalty",
      configuration.regimeInstabilityPenalty,
    ],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Confidence ${name} must be finite and non-negative.`,
      );
    }
  }
}

export class DefaultPredictionConfidenceEngine
  implements PredictionConfidenceEngine
{
  public aggregate(
    input: MarketIntelligenceInput,
    regime: MarketRegimeIntelligence,
    volatilityForecasts: readonly VolatilityForecast[],
    liquidityPredictions: readonly LiquidityPrediction[],
    orderFlow: OrderFlowIntelligence,
    correlations: MarketCorrelationIntelligence,
    anomalies: readonly MarketAnomaly[],
    pricePredictions: readonly PriceMovementPrediction[],
    configuration: ConfidenceAggregationConfiguration,
  ): UnifiedPredictionConfidence {
    validateConfiguration(configuration);

    const dataQuality = dataQualityScore(input);
    const rawComponents = buildRawComponents(
      input,
      regime,
      volatilityForecasts,
      liquidityPredictions,
      orderFlow,
      correlations,
      pricePredictions,
      configuration,
    );
    const agreementAnalysis =
      analyzeAgreement(rawComponents);
    const weights = normalizedWeights(
      rawComponents,
      configuration,
    );
    const components = materializeComponents(
      rawComponents,
      weights,
      agreementAnalysis,
    );
    const baseConfidence = clamp(
      components.reduce(
        (total, component) =>
          total + component.finalContribution,
        0,
      ),
      0,
      1,
    );

    const dataQualityAdjustment =
      dataQuality <
      Number(configuration.minimumDataQuality)
        ? -(
            Number(configuration.minimumDataQuality) -
            dataQuality
          )
        : (dataQuality -
            Number(configuration.minimumDataQuality)) *
          0.1;

    const regimeInstability = clamp(
      Number(regime.transitionProbability) *
        (1 - Number(regime.persistenceProbability)),
      0,
      1,
    );
    const regimeStabilityAdjustment =
      -regimeInstability *
      configuration.regimeInstabilityPenalty;

    const activeAnomalyRisk = anomalyRisk(anomalies);
    const anomalyAdjustment =
      -activeAnomalyRisk *
      configuration.anomalyPenalty;

    const disagreementAdjustment =
      -(1 - agreementAnalysis.agreementScore) *
      configuration.disagreementPenalty;

    const confidence = clamp(
      baseConfidence +
        dataQualityAdjustment +
        regimeStabilityAdjustment +
        anomalyAdjustment +
        disagreementAdjustment,
      0,
      1,
    );

    const agreement: PredictionAgreement = deepFreeze({
      agreementScore: round(
        agreementAnalysis.agreementScore,
      ) as NormalizedScore,
      conflictingComponents: deepFreeze([
        ...agreementAnalysis.conflictingComponents,
      ]),
      supportingComponents: deepFreeze([
        ...agreementAnalysis.supportingComponents,
      ]),
      conflictDescription:
        agreementAnalysis.conflictDescription,
    });

    return deepFreeze({
      confidence: round(confidence) as ConfidenceScore,
      quality: confidenceQuality(confidence),
      dataQualityAdjustment: round(
        dataQualityAdjustment,
      ),
      regimeStabilityAdjustment: round(
        regimeStabilityAdjustment,
      ),
      anomalyAdjustment: round(anomalyAdjustment),
      agreement,
      components,
      calibrationScore: round(
        calibrationScore(
          confidence,
          agreementAnalysis.agreementScore,
          dataQuality,
          Number(
            configuration.minimumPublishableConfidence,
          ),
        ),
      ) as NormalizedScore,
      generatedAtMs: input.analysisTimeMs,
    });
  }
}

export function createPredictionConfidenceEngine(): PredictionConfidenceEngine {
  return new DefaultPredictionConfidenceEngine();
}

export function aggregatePredictionConfidence(
  input: MarketIntelligenceInput,
  regime: MarketRegimeIntelligence,
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: OrderFlowIntelligence,
  correlations: MarketCorrelationIntelligence,
  anomalies: readonly MarketAnomaly[],
  pricePredictions: readonly PriceMovementPrediction[],
  configuration: ConfidenceAggregationConfiguration,
): UnifiedPredictionConfidence {
  return new DefaultPredictionConfidenceEngine().aggregate(
    input,
    regime,
    volatilityForecasts,
    liquidityPredictions,
    orderFlow,
    correlations,
    anomalies,
    pricePredictions,
    configuration,
  );
}