/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-regime-intelligence-engine.ts
 *
 * Deterministic, immutable market-regime inference from a feature vector.
 */

import {
  ConfidenceScore,
  DurationMs,
  FeatureCategory,
  FeatureValueType,
  MarketFeature,
  MarketFeatureVector,
  MarketRegime,
  MarketRegimeIntelligence,
  MarketRegimeIntelligenceEngine,
  ModelInferenceMode,
  NormalizedScore,
  Probability,
  RegimeEvidence,
  RegimeIntelligenceConfiguration,
  RegimeProbability,
  RegimeTransitionState,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;
const DEFAULT_EXPECTED_REGIME_DURATION_MS = 3_600_000;

type RegimeScoreMap = Map<MarketRegime, number>;

interface FeatureSnapshot {
  readonly priceReturn: number;
  readonly logReturn: number;
  readonly trendSlope: number;
  readonly trendStrength: number;
  readonly trendEfficiency: number;
  readonly momentum: number;
  readonly rsi: number;
  readonly realizedVolatility: number;
  readonly annualizedVolatility: number;
  readonly atr: number;
  readonly volatilityRange: number;
  readonly relativeVolume: number;
  readonly volumeZScore: number;
  readonly spreadBps: number;
  readonly depthImbalance: number;
  readonly liquidityDepth: number;
  readonly orderFlowDelta: number;
  readonly buyRatio: number;
  readonly fundingRate: number;
  readonly openInterestChange: number;
  readonly liquidationImbalance: number;
  readonly breadthAdvanceDeclineRatio: number;
  readonly breadthAdvancingRatio: number;
  readonly referenceCorrelation: number;
  readonly crossVenueDeviation: number;
  readonly availableFeatureRatio: number;
  readonly featureQuality: number;
}

interface ScoredRegime {
  readonly regime: MarketRegime;
  readonly rawScore: number;
  readonly probability: number;
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

function normalizeSigned(value: number, scale: number): number {
  if (!Number.isFinite(value) || scale <= 0) {
    return 0;
  }

  return Math.tanh(value / scale);
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

function categoricalFeatureValue(
  feature: MarketFeature | undefined,
): string | undefined {
  if (
    feature === undefined ||
    feature.isMissing ||
    feature.value.type !== FeatureValueType.CATEGORICAL
  ) {
    return undefined;
  }

  return feature.value.value;
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

function findCategorical(
  features: ReadonlyMap<string, MarketFeature>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = categoricalFeatureValue(features.get(name));

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function inferSnapshot(
  featureVector: MarketFeatureVector,
): FeatureSnapshot {
  const features = featureMap(featureVector);
  const availableFeatureCount = featureVector.features.filter(
    (feature) => !feature.isMissing,
  ).length;

  const explicitDirection = findCategorical(features, [
    "trend.direction",
  ]);

  let trendSlope = findScalar(features, [
    "trend.slope",
    "trend.normalized_slope",
  ]);

  if (Math.abs(trendSlope) <= EPSILON) {
    trendSlope = findScalar(features, [
      "trend.sma_ratio",
      "momentum.rate_of_change",
      "return.simple",
      "return.period",
      "return.log",
    ]);
  }

  if (explicitDirection === "UP" && trendSlope <= 0) {
    trendSlope = Math.abs(trendSlope || 0.001);
  } else if (explicitDirection === "DOWN" && trendSlope >= 0) {
    trendSlope = -Math.abs(trendSlope || 0.001);
  }

  return deepFreeze({
    priceReturn: findScalar(features, [
      "return.simple",
      "return.period",
      "return.cumulative",
    ]),
    logReturn: findScalar(features, ["return.log"]),
    trendSlope,
    trendStrength: clamp(
      findScalar(features, ["trend.strength"]),
      0,
      1,
    ),
    trendEfficiency: clamp(
      findScalar(features, ["trend.efficiency_ratio"]),
      0,
      1,
    ),
    momentum: findScalar(features, [
      "momentum.rate_of_change",
      "momentum.raw",
      "momentum.acceleration",
    ]),
    rsi: clamp(findScalar(features, ["momentum.rsi"], 0.5), 0, 1),
    realizedVolatility: Math.max(
      0,
      findScalar(features, ["volatility.realized"]),
    ),
    annualizedVolatility: Math.max(
      0,
      findScalar(features, ["volatility.annualized"]),
    ),
    atr: Math.max(0, findScalar(features, ["volatility.atr"])),
    volatilityRange: Math.max(
      0,
      findScalar(features, ["volatility.range"]),
    ),
    relativeVolume: Math.max(
      0,
      findScalar(features, ["volume.relative"], 1),
    ),
    volumeZScore: findScalar(features, ["volume.z_score"]),
    spreadBps: Math.max(
      0,
      findScalar(features, [
        "liquidity.spread_bps",
        "microstructure.spread_bps",
      ]),
    ),
    depthImbalance: clamp(
      findScalar(features, [
        "liquidity.depth_imbalance",
        "microstructure.order_book_imbalance",
      ]),
      -1,
      1,
    ),
    liquidityDepth: Math.max(
      0,
      findScalar(features, [
        "liquidity.total_depth",
        "liquidity.bid_depth",
      ]),
    ),
    orderFlowDelta: clamp(
      findScalar(features, [
        "order_flow.normalized_delta",
        "order_flow.delta",
        "order_flow.cumulative_volume_delta",
      ]),
      -1,
      1,
    ),
    buyRatio: clamp(
      findScalar(features, ["order_flow.buy_ratio"], 0.5),
      0,
      1,
    ),
    fundingRate: findScalar(features, [
      "derivatives.funding_rate",
      "derivatives.predicted_funding_rate",
    ]),
    openInterestChange: findScalar(features, [
      "derivatives.open_interest_change",
    ]),
    liquidationImbalance: clamp(
      findScalar(features, [
        "derivatives.liquidation_imbalance",
      ]),
      -1,
      1,
    ),
    breadthAdvanceDeclineRatio: Math.max(
      0,
      findScalar(features, [
        "market_breadth.advance_decline_ratio",
      ], 1),
    ),
    breadthAdvancingRatio: clamp(
      findScalar(features, [
        "market_breadth.advancing_ratio",
      ], 0.5),
      0,
      1,
    ),
    referenceCorrelation: clamp(
      findScalar(features, [
        "correlation.reference",
        "correlation.absolute_reference",
      ]),
      -1,
      1,
    ),
    crossVenueDeviation: findScalar(features, [
      "cross_venue.price_deviation",
    ]),
    availableFeatureRatio:
      featureVector.featureCount === 0
        ? 0
        : availableFeatureCount / featureVector.featureCount,
    featureQuality: clamp(Number(featureVector.qualityScore), 0, 1),
  });
}

function initializeScores(
  enabledRegimes: readonly MarketRegime[],
): RegimeScoreMap {
  const scores: RegimeScoreMap = new Map();

  for (const regime of enabledRegimes) {
    scores.set(regime, 0);
  }

  return scores;
}

function addScore(
  scores: RegimeScoreMap,
  regime: MarketRegime,
  contribution: number,
): void {
  if (!scores.has(regime) || !Number.isFinite(contribution)) {
    return;
  }

  scores.set(regime, (scores.get(regime) ?? 0) + contribution);
}

function positive(value: number): number {
  return Math.max(0, value);
}

function negativeMagnitude(value: number): number {
  return Math.max(0, -value);
}

function scoreRegimes(
  snapshot: FeatureSnapshot,
  enabledRegimes: readonly MarketRegime[],
): RegimeScoreMap {
  const scores = initializeScores(enabledRegimes);

  const normalizedTrend = normalizeSigned(snapshot.trendSlope, 0.01);
  const normalizedMomentum = normalizeSigned(
    snapshot.momentum || snapshot.priceReturn || snapshot.logReturn,
    0.02,
  );
  const bullishFlow = clamp(
    snapshot.orderFlowDelta * 0.6 +
      (snapshot.buyRatio - 0.5) * 0.8 +
      snapshot.depthImbalance * 0.4,
    -1,
    1,
  );
  const breadthBias = clamp(
    (snapshot.breadthAdvancingRatio - 0.5) * 2 +
      normalizeSigned(
        snapshot.breadthAdvanceDeclineRatio - 1,
        1,
      ) *
        0.5,
    -1,
    1,
  );
  const directionComposite = clamp(
    normalizedTrend * 0.38 +
      normalizedMomentum * 0.25 +
      bullishFlow * 0.2 +
      breadthBias * 0.12 +
      normalizeSigned(snapshot.openInterestChange, 0.05) * 0.05,
    -1,
    1,
  );

  const trendStrength = clamp(
    snapshot.trendStrength * 0.55 +
      snapshot.trendEfficiency * 0.25 +
      Math.abs(directionComposite) * 0.2,
    0,
    1,
  );

  const volatilityLevel = clamp(
    sigmoid(
      (Math.max(
        snapshot.realizedVolatility,
        snapshot.atr,
        snapshot.volatilityRange,
      ) -
        0.015) /
        0.0075,
    ),
    0,
    1,
  );

  const volumeExpansion = clamp(
    sigmoid((snapshot.relativeVolume - 1.1) / 0.35),
    0,
    1,
  );
  const volumeContraction = clamp(
    sigmoid((0.85 - snapshot.relativeVolume) / 0.25),
    0,
    1,
  );
  const spreadStress = clamp(
    sigmoid((snapshot.spreadBps - 20) / 10),
    0,
    1,
  );
  const dislocationStress = clamp(
    sigmoid((snapshot.spreadBps - 75) / 20) +
      Math.min(1, Math.abs(snapshot.crossVenueDeviation) / 0.02) * 0.35,
    0,
    1,
  );

  const bullish = positive(directionComposite);
  const bearish = negativeMagnitude(directionComposite);
  const directionalBreakout = clamp(
    volumeExpansion * 0.35 +
      volatilityLevel * 0.25 +
      trendStrength * 0.25 +
      Math.abs(snapshot.orderFlowDelta) * 0.15,
    0,
    1,
  );

  addScore(
    scores,
    MarketRegime.STRONG_BULL_TREND,
    bullish * trendStrength * 1.35 +
      positive(snapshot.openInterestChange) * 0.15 +
      positive(snapshot.fundingRate) * 0.05,
  );
  addScore(
    scores,
    MarketRegime.BULL_TREND,
    bullish * (0.65 + trendStrength * 0.55),
  );
  addScore(
    scores,
    MarketRegime.WEAK_BULL_TREND,
    bullish * (1 - trendStrength) * 0.95 +
      positive(snapshot.rsi - 0.5) * 0.2,
  );

  addScore(
    scores,
    MarketRegime.STRONG_BEAR_TREND,
    bearish * trendStrength * 1.35 +
      negativeMagnitude(snapshot.openInterestChange) * 0.15 +
      negativeMagnitude(snapshot.fundingRate) * 0.05,
  );
  addScore(
    scores,
    MarketRegime.BEAR_TREND,
    bearish * (0.65 + trendStrength * 0.55),
  );
  addScore(
    scores,
    MarketRegime.WEAK_BEAR_TREND,
    bearish * (1 - trendStrength) * 0.95 +
      positive(0.5 - snapshot.rsi) * 0.2,
  );

  const neutrality = 1 - Math.abs(directionComposite);
  const lowTrend = 1 - trendStrength;

  addScore(
    scores,
    MarketRegime.RANGE_BOUND,
    neutrality * 0.75 +
      lowTrend * 0.5 +
      volumeContraction * 0.15,
  );
  addScore(
    scores,
    MarketRegime.MEAN_REVERTING,
    neutrality * 0.45 +
      lowTrend * 0.35 +
      snapshot.trendEfficiency < 0.35 ? 0.2 : 0,
  );

  addScore(
    scores,
    MarketRegime.BREAKOUT,
    bullish * directionalBreakout * 1.3 +
      positive(snapshot.depthImbalance) * 0.15,
  );
  addScore(
    scores,
    MarketRegime.BREAKDOWN,
    bearish * directionalBreakout * 1.3 +
      negativeMagnitude(snapshot.depthImbalance) * 0.15,
  );

  addScore(
    scores,
    MarketRegime.VOLATILITY_EXPANSION,
    volatilityLevel * 0.65 +
      volumeExpansion * 0.35 +
      Math.abs(snapshot.volumeZScore) * 0.05,
  );
  addScore(
    scores,
    MarketRegime.VOLATILITY_CONTRACTION,
    (1 - volatilityLevel) * 0.55 +
      volumeContraction * 0.4 +
      neutrality * 0.15,
  );

  addScore(
    scores,
    MarketRegime.LIQUIDITY_STRESS,
    spreadStress * 0.75 +
      (1 - snapshot.availableFeatureRatio) * 0.1 +
      Math.abs(snapshot.liquidationImbalance) * 0.15,
  );
  addScore(
    scores,
    MarketRegime.DISLOCATION,
    dislocationStress * 0.8 +
      Math.abs(snapshot.crossVenueDeviation) * 8 +
      Math.abs(snapshot.liquidationImbalance) * 0.2,
  );

  const ambiguity = clamp(
    neutrality * 0.35 +
      (1 - snapshot.featureQuality) * 0.3 +
      (1 - snapshot.availableFeatureRatio) * 0.2 +
      (1 - Math.abs(snapshot.referenceCorrelation)) * 0.05,
    0,
    1,
  );
  addScore(
    scores,
    MarketRegime.TRANSITION,
    ambiguity * 0.65 +
      Math.abs(snapshot.orderFlowDelta - normalizedTrend) * 0.25 +
      Math.abs(snapshot.depthImbalance - bullishFlow) * 0.1,
  );
  addScore(
    scores,
    MarketRegime.UNKNOWN,
    (1 - snapshot.featureQuality) * 0.55 +
      (1 - snapshot.availableFeatureRatio) * 0.45,
  );

  for (const [regime, score] of scores) {
    scores.set(regime, Math.max(0, round(score)));
  }

  return scores;
}

function softmaxScores(scores: RegimeScoreMap): readonly ScoredRegime[] {
  const entries = [...scores.entries()];

  if (entries.length === 0) {
    return [];
  }

  const maximum = Math.max(...entries.map(([, score]) => score));
  const exponentials = entries.map(([regime, score]) => ({
    regime,
    rawScore: score,
    exponential: Math.exp((score - maximum) * 3),
  }));
  const total = exponentials.reduce(
    (sum, item) => sum + item.exponential,
    0,
  );

  return deepFreeze(
    exponentials
      .map((item) => ({
        regime: item.regime,
        rawScore: round(item.rawScore),
        probability: round(
          safeDivide(item.exponential, total, 1 / entries.length),
        ),
      }))
      .sort(
        (left, right) =>
          right.probability - left.probability ||
          left.regime.localeCompare(right.regime),
      ),
  );
}

function normalizeProbabilities(
  scored: readonly ScoredRegime[],
): readonly ScoredRegime[] {
  if (scored.length === 0) {
    return scored;
  }

  const total = scored.reduce(
    (sum, item) => sum + item.probability,
    0,
  );

  if (total <= EPSILON) {
    const equal = 1 / scored.length;
    return deepFreeze(
      scored.map((item) => ({
        ...item,
        probability: round(equal),
      })),
    );
  }

  const normalized = scored.map((item) => ({
    ...item,
    probability: round(item.probability / total),
  }));

  const normalizedTotal = normalized.reduce(
    (sum, item) => sum + item.probability,
    0,
  );
  const correction = 1 - normalizedTotal;

  if (Math.abs(correction) > EPSILON) {
    normalized[0] = {
      ...normalized[0]!,
      probability: round(normalized[0]!.probability + correction),
    };
  }

  return deepFreeze(normalized);
}

function transitionState(
  primary: ScoredRegime,
  secondary: ScoredRegime | undefined,
  confidence: number,
  configuration: RegimeIntelligenceConfiguration,
): RegimeTransitionState {
  const gap =
    secondary === undefined
      ? primary.probability
      : primary.probability - secondary.probability;
  const transitionProbability = clamp(
    1 - primary.probability + (secondary?.probability ?? 0) * 0.35,
    0,
    1,
  );

  if (
    primary.regime === MarketRegime.TRANSITION ||
    primary.regime === MarketRegime.UNKNOWN
  ) {
    return RegimeTransitionState.UNCERTAIN;
  }

  if (
    transitionProbability >= Number(configuration.transitionThreshold)
  ) {
    return gap < 0.08
      ? RegimeTransitionState.REVERSING
      : RegimeTransitionState.EMERGING;
  }

  if (confidence < Number(configuration.minimumConfidence)) {
    return RegimeTransitionState.WEAKENING;
  }

  if (
    primary.probability >=
    Number(configuration.persistenceThreshold)
  ) {
    return RegimeTransitionState.CONFIRMED;
  }

  return RegimeTransitionState.STABLE;
}

function evidence(
  snapshot: FeatureSnapshot,
  primaryRegime: MarketRegime,
): readonly RegimeEvidence[] {
  const items: RegimeEvidence[] = [
    {
      featureName: "trend.slope",
      observedValue: round(snapshot.trendSlope),
      contribution: round(
        normalizeSigned(snapshot.trendSlope, 0.01),
      ),
      description:
        "Normalized trend slope contributes directional evidence.",
    },
    {
      featureName: "trend.strength",
      observedValue: round(snapshot.trendStrength),
      contribution: round(snapshot.trendStrength),
      description:
        "Trend strength determines whether directional evidence is weak or persistent.",
    },
    {
      featureName: "trend.efficiency_ratio",
      observedValue: round(snapshot.trendEfficiency),
      contribution: round(snapshot.trendEfficiency),
      description:
        "Efficiency ratio distinguishes directional movement from noisy range behavior.",
    },
    {
      featureName: "volatility.realized",
      observedValue: round(snapshot.realizedVolatility),
      contribution: round(
        sigmoid((snapshot.realizedVolatility - 0.015) / 0.0075),
      ),
      description:
        "Realized volatility supports expansion, contraction, and breakout classifications.",
    },
    {
      featureName: "volume.relative",
      observedValue: round(snapshot.relativeVolume),
      contribution: round(
        clamp((snapshot.relativeVolume - 1) / 2, -1, 1),
      ),
      description:
        "Relative volume confirms or weakens directional and breakout regimes.",
    },
    {
      featureName: "liquidity.spread_bps",
      observedValue: round(snapshot.spreadBps),
      contribution: round(
        sigmoid((snapshot.spreadBps - 20) / 10),
      ),
      description:
        "Wide spreads increase liquidity-stress and dislocation evidence.",
    },
    {
      featureName: "order_flow.normalized_delta",
      observedValue: round(snapshot.orderFlowDelta),
      contribution: round(snapshot.orderFlowDelta),
      description:
        "Aggressive order flow contributes directional confirmation.",
    },
    {
      featureName: "market_feature_vector.quality",
      observedValue: round(snapshot.featureQuality),
      contribution: round(snapshot.featureQuality),
      description:
        "Feature-vector quality scales regime confidence and unknown-state risk.",
    },
    {
      featureName: "market_regime.primary",
      observedValue: primaryRegime,
      contribution: 1,
      description:
        "Primary regime selected from the normalized deterministic score distribution.",
    },
  ];

  return deepFreeze(items);
}

function expectedDuration(
  persistenceProbability: number,
  minimumDurationMs: number,
): DurationMs {
  const base = Math.max(
    minimumDurationMs,
    DEFAULT_EXPECTED_REGIME_DURATION_MS,
  );
  const multiplier = 0.5 + persistenceProbability * 2.5;

  return Math.round(base * multiplier) as DurationMs;
}

function validateConfiguration(
  configuration: RegimeIntelligenceConfiguration,
): void {
  const unitIntervalValues = [
    Number(configuration.minimumConfidence),
    Number(configuration.transitionThreshold),
    Number(configuration.persistenceThreshold),
  ];

  if (
    unitIntervalValues.some(
      (value) =>
        !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    throw new Error(
      "Regime intelligence confidence and probability thresholds must be within [0, 1].",
    );
  }

  if (Number(configuration.minimumRegimeDurationMs) < 0) {
    throw new Error(
      "minimumRegimeDurationMs cannot be negative.",
    );
  }

  if (configuration.enabledRegimes.length === 0) {
    throw new Error(
      "At least one market regime must be enabled.",
    );
  }

  const duplicates = configuration.enabledRegimes.filter(
    (regime, index, regimes) =>
      regimes.indexOf(regime) !== index,
  );

  if (duplicates.length > 0) {
    throw new Error(
      `enabledRegimes contains duplicates: ${[
        ...new Set(duplicates),
      ].join(", ")}.`,
    );
  }
}

function validateInferenceMode(mode: ModelInferenceMode): void {
  switch (mode) {
    case ModelInferenceMode.DETERMINISTIC_RULES:
    case ModelInferenceMode.STATISTICAL:
    case ModelInferenceMode.ENSEMBLE:
    case ModelInferenceMode.HYBRID:
      return;

    case ModelInferenceMode.MACHINE_LEARNING:
      throw new Error(
        "MACHINE_LEARNING inference requires an injected model and is not supported by the deterministic default engine.",
      );

    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export class DefaultMarketRegimeIntelligenceEngine
  implements MarketRegimeIntelligenceEngine
{
  public analyze(
    featureVector: MarketFeatureVector,
    configuration: RegimeIntelligenceConfiguration,
  ): MarketRegimeIntelligence {
    validateConfiguration(configuration);
    validateInferenceMode(configuration.inferenceMode);

    const snapshot = inferSnapshot(featureVector);
    const rawScores = scoreRegimes(
      snapshot,
      configuration.enabledRegimes,
    );
    const ranked = normalizeProbabilities(
      softmaxScores(rawScores),
    );

    if (ranked.length === 0) {
      throw new Error(
        "Regime intelligence could not produce a probability distribution.",
      );
    }

    const primary = ranked[0]!;
    const secondary = ranked[1];
    const probabilityGap =
      primary.probability - (secondary?.probability ?? 0);
    const concentration = clamp(
      primary.probability * 0.7 +
        probabilityGap * 0.3,
      0,
      1,
    );
    const dataReliability = clamp(
      snapshot.featureQuality * 0.65 +
        snapshot.availableFeatureRatio * 0.35,
      0,
      1,
    );
    const confidence = clamp(
      concentration * 0.7 + dataReliability * 0.3,
      0,
      1,
    );
    const regimeStrength = clamp(
      primary.rawScore / Math.max(primary.rawScore + 1, 1),
      0,
      1,
    );
    const persistenceProbability = clamp(
      primary.probability * 0.55 +
        regimeStrength * 0.3 +
        snapshot.trendEfficiency * 0.15,
      0,
      1,
    );
    const transitionProbability = clamp(
      1 -
        primary.probability +
        (secondary?.probability ?? 0) * 0.35 +
        (1 - dataReliability) * 0.15,
      0,
      1,
    );

    const regimeProbabilities: readonly RegimeProbability[] =
      deepFreeze(
        ranked.map((item) => ({
          regime: item.regime,
          probability: round(
            item.probability,
          ) as Probability,
        })),
      );

    return deepFreeze({
      primaryRegime: primary.regime,
      ...(secondary === undefined
        ? {}
        : { secondaryRegime: secondary.regime }),
      transitionState: transitionState(
        primary,
        secondary,
        confidence,
        configuration,
      ),
      regimeProbabilities,
      confidence: round(confidence) as ConfidenceScore,
      regimeStrength: round(
        regimeStrength,
      ) as NormalizedScore,
      persistenceProbability: round(
        persistenceProbability,
      ) as Probability,
      transitionProbability: round(
        transitionProbability,
      ) as Probability,
      expectedDurationMs: expectedDuration(
        persistenceProbability,
        Number(configuration.minimumRegimeDurationMs),
      ),
      detectedAtMs: featureVector.generatedAtMs,
      evidence: evidence(snapshot, primary.regime),
      modelVersion: configuration.modelVersion,
    });
  }
}

export function createMarketRegimeIntelligenceEngine(): MarketRegimeIntelligenceEngine {
  return new DefaultMarketRegimeIntelligenceEngine();
}

export function analyzeMarketRegime(
  featureVector: MarketFeatureVector,
  configuration: RegimeIntelligenceConfiguration,
): MarketRegimeIntelligence {
  return new DefaultMarketRegimeIntelligenceEngine().analyze(
    featureVector,
    configuration,
  );
}