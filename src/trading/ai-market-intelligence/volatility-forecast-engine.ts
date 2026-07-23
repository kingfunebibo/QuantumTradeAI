/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/volatility-forecast-engine.ts
 *
 * Deterministic, immutable multi-horizon volatility forecasting.
 */

import {
  ConfidenceScore,
  ExplanationFactorDirection,
  FeatureValueType,
  ForecastDriver,
  ForecastInterval,
  MarketFeature,
  MarketFeatureVector,
  MarketPredictionId,
  MarketRegime,
  MarketRegimeIntelligence,
  ModelVersion,
  NormalizedScore,
  Percentage,
  PredictionWindow,
  Probability,
  VolatilityForecast,
  VolatilityForecastConfiguration,
  VolatilityForecastEngine,
  VolatilityState,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;
const MINIMUM_VOLATILITY = 0.000001;
const DEFAULT_BASE_HORIZON_MS = 60_000;

interface VolatilityInputs {
  readonly realizedVolatility: number;
  readonly annualizedVolatility: number;
  readonly atrVolatility: number;
  readonly rangeVolatility: number;
  readonly downsideVolatility: number;
  readonly upsideVolatility: number;
  readonly relativeVolume: number;
  readonly volumeZScore: number;
  readonly trendStrength: number;
  readonly trendSlope: number;
  readonly momentum: number;
  readonly spreadBps: number;
  readonly orderFlowDelta: number;
  readonly liquidationImbalance: number;
  readonly featureQuality: number;
  readonly availableFeatureRatio: number;
}

interface ForecastComputation {
  readonly forecastVolatility: number;
  readonly annualizedForecastVolatility: number;
  readonly expansionProbability: number;
  readonly contractionProbability: number;
  readonly confidence: number;
  readonly interval: ForecastInterval;
  readonly forecastState: VolatilityState;
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

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function scalarFeatureValue(
  feature: MarketFeature | undefined,
  fallback = 0,
): number {
  if (
    feature === undefined ||
    feature.isMissing ||
    feature.value.type !== FeatureValueType.SCALAR
  ) {
    return fallback;
  }

  return Number.isFinite(feature.value.value)
    ? feature.value.value
    : fallback;
}

function featureMap(
  featureVector: MarketFeatureVector,
): ReadonlyMap<string, MarketFeature> {
  return new Map(
    featureVector.features.map((feature) => [
      feature.definition.featureName,
      feature,
    ]),
  );
}

function findScalar(
  features: ReadonlyMap<string, MarketFeature>,
  names: readonly string[],
  fallback = 0,
): number {
  for (const name of names) {
    const feature = features.get(name);

    if (
      feature !== undefined &&
      !feature.isMissing &&
      feature.value.type === FeatureValueType.SCALAR
    ) {
      return scalarFeatureValue(feature, fallback);
    }
  }

  return fallback;
}

function inferInputs(
  featureVector: MarketFeatureVector,
): VolatilityInputs {
  const features = featureMap(featureVector);
  const availableFeatureCount = featureVector.features.filter(
    (feature) => !feature.isMissing,
  ).length;

  const realizedVolatility = Math.max(
    MINIMUM_VOLATILITY,
    findScalar(features, ["volatility.realized"], MINIMUM_VOLATILITY),
  );
  const annualizedVolatility = Math.max(
    0,
    findScalar(features, ["volatility.annualized"]),
  );
  const atrVolatility = Math.max(
    0,
    findScalar(features, ["volatility.atr"]),
  );
  const rangeVolatility = Math.max(
    0,
    findScalar(features, ["volatility.range"]),
  );

  return deepFreeze({
    realizedVolatility,
    annualizedVolatility,
    atrVolatility,
    rangeVolatility,
    downsideVolatility: Math.max(
      0,
      findScalar(features, ["volatility.downside"]),
    ),
    upsideVolatility: Math.max(
      0,
      findScalar(features, ["volatility.upside"]),
    ),
    relativeVolume: Math.max(
      0,
      findScalar(features, ["volume.relative"], 1),
    ),
    volumeZScore: findScalar(features, ["volume.z_score"]),
    trendStrength: clamp(
      findScalar(features, ["trend.strength"]),
      0,
      1,
    ),
    trendSlope: findScalar(features, [
      "trend.slope",
      "trend.sma_ratio",
    ]),
    momentum: findScalar(features, [
      "momentum.rate_of_change",
      "momentum.acceleration",
      "return.simple",
      "return.log",
    ]),
    spreadBps: Math.max(
      0,
      findScalar(features, [
        "liquidity.spread_bps",
        "microstructure.spread_bps",
      ]),
    ),
    orderFlowDelta: clamp(
      findScalar(features, [
        "order_flow.normalized_delta",
        "order_flow.delta",
      ]),
      -1,
      1,
    ),
    liquidationImbalance: clamp(
      findScalar(features, [
        "derivatives.liquidation_imbalance",
      ]),
      -1,
      1,
    ),
    featureQuality: clamp(Number(featureVector.qualityScore), 0, 1),
    availableFeatureRatio:
      featureVector.featureCount === 0
        ? 0
        : availableFeatureCount / featureVector.featureCount,
  });
}

function regimeProbability(
  regime: MarketRegimeIntelligence,
  target: MarketRegime,
): number {
  return Number(
    regime.regimeProbabilities.find(
      (item) => item.regime === target,
    )?.probability ?? 0,
  );
}

function expansionRegimeScore(
  regime: MarketRegimeIntelligence,
): number {
  return clamp(
    regimeProbability(
      regime,
      MarketRegime.VOLATILITY_EXPANSION,
    ) *
      1.0 +
      regimeProbability(regime, MarketRegime.BREAKOUT) * 0.75 +
      regimeProbability(regime, MarketRegime.BREAKDOWN) * 0.75 +
      regimeProbability(regime, MarketRegime.DISLOCATION) * 0.9 +
      regimeProbability(
        regime,
        MarketRegime.LIQUIDITY_STRESS,
      ) *
        0.55 +
      regimeProbability(
        regime,
        MarketRegime.STRONG_BULL_TREND,
      ) *
        0.25 +
      regimeProbability(
        regime,
        MarketRegime.STRONG_BEAR_TREND,
      ) *
        0.25,
    0,
    1,
  );
}

function contractionRegimeScore(
  regime: MarketRegimeIntelligence,
): number {
  return clamp(
    regimeProbability(
      regime,
      MarketRegime.VOLATILITY_CONTRACTION,
    ) *
      1.0 +
      regimeProbability(regime, MarketRegime.RANGE_BOUND) * 0.55 +
      regimeProbability(
        regime,
        MarketRegime.MEAN_REVERTING,
      ) *
        0.4,
    0,
    1,
  );
}

function volatilityState(
  volatility: number,
  changePercentage: number,
): VolatilityState {
  if (changePercentage >= 0.25) {
    return VolatilityState.EXPANDING;
  }

  if (changePercentage <= -0.2) {
    return VolatilityState.CONTRACTING;
  }

  if (volatility < 0.003) {
    return VolatilityState.EXTREMELY_LOW;
  }

  if (volatility < 0.008) {
    return VolatilityState.LOW;
  }

  if (volatility < 0.025) {
    return VolatilityState.NORMAL;
  }

  if (volatility < 0.06) {
    return VolatilityState.HIGH;
  }

  return VolatilityState.EXTREMELY_HIGH;
}

function horizonScale(window: PredictionWindow): number {
  return Math.max(
    1,
    Number(window.durationMs) / DEFAULT_BASE_HORIZON_MS,
  );
}

function annualizationPeriods(window: PredictionWindow): number {
  const duration = Math.max(1, Number(window.durationMs));
  return Math.max(1, (365 * 24 * 60 * 60 * 1000) / duration);
}

function buildDrivers(
  inputs: VolatilityInputs,
  regime: MarketRegimeIntelligence,
  expansionProbability: number,
  contractionProbability: number,
): readonly ForecastDriver[] {
  const volumeContribution = clamp(
    (inputs.relativeVolume - 1) / 2 +
      inputs.volumeZScore * 0.08,
    -1,
    1,
  );
  const regimeContribution =
    expansionRegimeScore(regime) -
    contractionRegimeScore(regime);
  const microstructureContribution = clamp(
    inputs.spreadBps / 100 +
      Math.abs(inputs.orderFlowDelta) * 0.25 +
      Math.abs(inputs.liquidationImbalance) * 0.2,
    0,
    1,
  );
  const momentumContribution = clamp(
    Math.abs(inputs.momentum) * 10 +
      Math.abs(inputs.trendSlope) * 10,
    0,
    1,
  );

  return deepFreeze([
    {
      name: "realized_volatility",
      direction: ExplanationFactorDirection.SUPPORTING,
      contribution: round(
        clamp(inputs.realizedVolatility / 0.05, 0, 1),
      ),
      observedValue: round(inputs.realizedVolatility),
      description:
        "Current realized volatility anchors the forecast level.",
    },
    {
      name: "regime_volatility_bias",
      direction:
        regimeContribution > 0.05
          ? ExplanationFactorDirection.SUPPORTING
          : regimeContribution < -0.05
            ? ExplanationFactorDirection.OPPOSING
            : ExplanationFactorDirection.NEUTRAL,
      contribution: round(regimeContribution),
      observedValue: regime.primaryRegime,
      description:
        "Regime probabilities shift the forecast toward expansion or contraction.",
    },
    {
      name: "relative_volume",
      direction:
        volumeContribution > 0.05
          ? ExplanationFactorDirection.SUPPORTING
          : volumeContribution < -0.05
            ? ExplanationFactorDirection.OPPOSING
            : ExplanationFactorDirection.NEUTRAL,
      contribution: round(volumeContribution),
      observedValue: round(inputs.relativeVolume),
      description:
        "Volume expansion tends to support higher future volatility.",
    },
    {
      name: "microstructure_stress",
      direction:
        microstructureContribution > 0.15
          ? ExplanationFactorDirection.SUPPORTING
          : ExplanationFactorDirection.NEUTRAL,
      contribution: round(microstructureContribution),
      observedValue: round(inputs.spreadBps),
      description:
        "Spread, order-flow, and liquidation imbalances increase short-horizon volatility risk.",
    },
    {
      name: "directional_impulse",
      direction:
        momentumContribution > 0.15
          ? ExplanationFactorDirection.SUPPORTING
          : ExplanationFactorDirection.NEUTRAL,
      contribution: round(momentumContribution),
      observedValue: round(inputs.momentum),
      description:
        "Large trend and momentum impulses can amplify realized volatility.",
    },
    {
      name: "forecast_balance",
      direction:
        expansionProbability > contractionProbability
          ? ExplanationFactorDirection.SUPPORTING
          : expansionProbability < contractionProbability
            ? ExplanationFactorDirection.OPPOSING
            : ExplanationFactorDirection.NEUTRAL,
      contribution: round(
        expansionProbability - contractionProbability,
      ),
      observedValue: round(expansionProbability),
      description:
        "Net expansion probability summarizes the directional volatility forecast.",
    },
  ]);
}

function computeForecast(
  inputs: VolatilityInputs,
  regime: MarketRegimeIntelligence,
  window: PredictionWindow,
  configuration: VolatilityForecastConfiguration,
): ForecastComputation {
  const horizon = horizonScale(window);
  const horizonDamping = 1 / Math.sqrt(horizon);
  const baseProxy = Math.max(
    MINIMUM_VOLATILITY,
    inputs.realizedVolatility * 0.55 +
      inputs.atrVolatility * 0.25 +
      inputs.rangeVolatility * 0.2,
  );

  const volumeSignal = clamp(
    (inputs.relativeVolume - 1) * 0.35 +
      inputs.volumeZScore * 0.05,
    -0.5,
    1,
  );
  const stressSignal = clamp(
    inputs.spreadBps / 100 +
      Math.abs(inputs.orderFlowDelta) * 0.2 +
      Math.abs(inputs.liquidationImbalance) * 0.15,
    0,
    1,
  );
  const directionalSignal = clamp(
    Math.abs(inputs.momentum) * 5 +
      Math.abs(inputs.trendSlope) * 5 +
      inputs.trendStrength * 0.2,
    0,
    1,
  );
  const regimeExpansion = expansionRegimeScore(regime);
  const regimeContraction = contractionRegimeScore(regime);
  const transitionRisk = Number(regime.transitionProbability);

  const netExpansionSignal = clamp(
    regimeExpansion * 0.42 +
      Math.max(0, volumeSignal) * 0.18 +
      stressSignal * 0.18 +
      directionalSignal * 0.12 +
      transitionRisk * 0.1,
    0,
    1,
  );
  const netContractionSignal = clamp(
    regimeContraction * 0.55 +
      Math.max(0, -volumeSignal) * 0.2 +
      (1 - directionalSignal) * 0.1 +
      Number(regime.persistenceProbability) * 0.15,
    0,
    1,
  );

  const expansionProbability = clamp(
    sigmoid(
      (netExpansionSignal - netContractionSignal) * 3 +
        0.15 * horizonDamping,
    ),
    0,
    1,
  );
  const contractionProbability = clamp(
    sigmoid(
      (netContractionSignal - netExpansionSignal) * 3 -
        0.15 * horizonDamping,
    ),
    0,
    1,
  );

  const netChange = clamp(
    (expansionProbability - contractionProbability) *
      (0.28 + 0.12 * horizonDamping) +
      volumeSignal * 0.08 * horizonDamping +
      stressSignal * 0.08 * horizonDamping,
    -0.65,
    1.5,
  );

  const meanReversionWeight = clamp(
    1 - horizonDamping,
    0,
    0.8,
  );
  const longRunProxy = Math.max(
    MINIMUM_VOLATILITY,
    inputs.annualizedVolatility > 0
      ? inputs.annualizedVolatility /
          Math.sqrt(annualizationPeriods(window))
      : baseProxy,
  );

  const directionalForecast = baseProxy * (1 + netChange);
  const forecastVolatility = Math.max(
    MINIMUM_VOLATILITY,
    directionalForecast * (1 - meanReversionWeight) +
      longRunProxy * meanReversionWeight,
  );

  const confidence = clamp(
    inputs.featureQuality * 0.45 +
      inputs.availableFeatureRatio * 0.2 +
      Number(regime.confidence) * 0.25 +
      Math.abs(
        expansionProbability - contractionProbability,
      ) *
        0.1,
    0,
    1,
  );

  const intervalWidth = clamp(
    (1 - confidence) * 0.8 +
      transitionRisk * 0.3 +
      Math.log1p(horizon) * 0.08,
    0.08,
    1.5,
  );
  const lowerBound = Math.max(
    0,
    forecastVolatility * (1 - intervalWidth),
  );
  const upperBound =
    forecastVolatility * (1 + intervalWidth);

  const changePercentage = safeDivide(
    forecastVolatility - inputs.realizedVolatility,
    inputs.realizedVolatility,
  );

  return deepFreeze({
    forecastVolatility: round(forecastVolatility),
    annualizedForecastVolatility: round(
      forecastVolatility *
        Math.sqrt(annualizationPeriods(window)),
    ),
    expansionProbability: round(expansionProbability),
    contractionProbability: round(contractionProbability),
    confidence: round(confidence),
    interval: {
      lowerBound: round(lowerBound),
      expectedValue: round(forecastVolatility),
      upperBound: round(upperBound),
      confidenceLevel: configuration.confidenceLevel,
    },
    forecastState: volatilityState(
      forecastVolatility,
      changePercentage,
    ),
    drivers: buildDrivers(
      inputs,
      regime,
      expansionProbability,
      contractionProbability,
    ),
  });
}

function predictionId(
  featureVector: MarketFeatureVector,
  window: PredictionWindow,
  modelVersion: ModelVersion,
): MarketPredictionId {
  const raw = [
    "volatility",
    featureVector.deterministicFingerprint,
    window.horizon,
    String(window.durationMs),
    String(window.startTimeMs),
    String(window.endTimeMs),
    String(modelVersion),
  ].join("|");

  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");

  for (let index = 0; index < raw.length; index += 1) {
    hash ^= BigInt(raw.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return `volatility-prediction-${hash
    .toString(16)
    .padStart(16, "0")}` as MarketPredictionId;
}

function validateConfiguration(
  configuration: VolatilityForecastConfiguration,
): void {
  const confidenceValues = [
    Number(configuration.confidenceLevel),
    Number(configuration.minimumConfidence),
  ];

  if (
    confidenceValues.some(
      (value) =>
        !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    throw new Error(
      "Volatility forecast confidence values must be within [0, 1].",
    );
  }

  if (configuration.horizons.length === 0) {
    throw new Error(
      "Volatility forecasting requires at least one horizon.",
    );
  }

  for (const window of configuration.horizons) {
    if (Number(window.durationMs) <= 0) {
      throw new Error(
        `Volatility forecast horizon ${window.horizon} must have a positive duration.`,
      );
    }

    if (
      Number(window.endTimeMs) <= Number(window.startTimeMs)
    ) {
      throw new Error(
        `Volatility forecast horizon ${window.horizon} has an invalid time range.`,
      );
    }
  }
}

export class DefaultVolatilityForecastEngine
  implements VolatilityForecastEngine
{
  public forecast(
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    configuration: VolatilityForecastConfiguration,
  ): readonly VolatilityForecast[] {
    validateConfiguration(configuration);

    if (!configuration.enabled) {
      return deepFreeze([]);
    }

    const inputs = inferInputs(featureVector);
    const currentState = volatilityState(
      inputs.realizedVolatility,
      0,
    );

    const forecasts = [...configuration.horizons]
      .sort(
        (left, right) =>
          Number(left.durationMs) - Number(right.durationMs) ||
          String(left.horizon).localeCompare(
            String(right.horizon),
          ),
      )
      .map((window): VolatilityForecast => {
        const computed = computeForecast(
          inputs,
          regime,
          window,
          configuration,
        );
        const changePercentage = safeDivide(
          computed.forecastVolatility -
            inputs.realizedVolatility,
          inputs.realizedVolatility,
        );

        return deepFreeze({
          predictionId: predictionId(
            featureVector,
            window,
            configuration.modelVersion,
          ),
          window,
          currentState,
          forecastState: computed.forecastState,
          currentRealizedVolatility: round(
            inputs.realizedVolatility,
          ) as Percentage,
          forecastRealizedVolatility: round(
            computed.forecastVolatility,
          ) as Percentage,
          ...(configuration.annualizeResults
            ? {
                annualizedForecastVolatility: round(
                  computed.annualizedForecastVolatility,
                ) as Percentage,
              }
            : {}),
          changePercentage: round(
            changePercentage,
          ) as Percentage,
          expansionProbability: round(
            computed.expansionProbability,
          ) as Probability,
          contractionProbability: round(
            computed.contractionProbability,
          ) as Probability,
          interval: computed.interval,
          confidence: round(
            computed.confidence,
          ) as ConfidenceScore,
          drivers: computed.drivers,
          modelVersion: configuration.modelVersion,
          generatedAtMs: featureVector.generatedAtMs,
        });
      });

    return deepFreeze(forecasts);
  }
}

export function createVolatilityForecastEngine(): VolatilityForecastEngine {
  return new DefaultVolatilityForecastEngine();
}

export function forecastMarketVolatility(
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  configuration: VolatilityForecastConfiguration,
): readonly VolatilityForecast[] {
  return new DefaultVolatilityForecastEngine().forecast(
    featureVector,
    regime,
    configuration,
  );
}