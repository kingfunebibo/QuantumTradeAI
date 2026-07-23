/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/liquidity-prediction-engine.ts
 */

import {
  BasisPoints,
  ConfidenceScore,
  ExplanationFactorDirection,
  FeatureValueType,
  ForecastDriver,
  LiquidityPrediction,
  LiquidityPredictionConfiguration,
  LiquidityPredictionEngine,
  LiquidityState,
  MarketFeature,
  MarketFeatureVector,
  MarketIntelligenceInput,
  MarketPredictionId,
  MarketRegime,
  MarketRegimeIntelligence,
  ModelVersion,
  Notional,
  PredictionWindow,
  Probability,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const BASE_HORIZON_MS = 60_000;
const ROUNDING_DECIMALS = 12;

interface LiquidityInputs {
  readonly bidDepth: number;
  readonly askDepth: number;
  readonly totalDepth: number;
  readonly spreadBps: number;
  readonly depthImbalance: number;
  readonly relativeVolume: number;
  readonly realizedVolatility: number;
  readonly orderFlowDelta: number;
  readonly liquidationImbalance: number;
  readonly qualityScore: number;
  readonly featureCoverage: number;
}

interface WindowPrediction {
  readonly state: LiquidityState;
  readonly bidDepth: number;
  readonly askDepth: number;
  readonly spreadBps: number;
  readonly marketImpactBps: number;
  readonly fillProbability: number;
  readonly deteriorationProbability: number;
  readonly improvementProbability: number;
  readonly confidence: number;
  readonly drivers: readonly ForecastDriver[];
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
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
  const factor = 10 ** ROUNDING_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  return Math.abs(denominator) <= EPSILON ? fallback : numerator / denominator;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function featureMap(vector: MarketFeatureVector): ReadonlyMap<string, MarketFeature> {
  return new Map(
    vector.features.map((feature) => [feature.definition.featureName, feature]),
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

function calculateDepth(
  levels: readonly { readonly price: number; readonly quantity: number }[],
  depthLevels: number,
): number {
  return levels
    .slice(0, depthLevels)
    .reduce(
      (total, level) => total + Number(level.price) * Number(level.quantity),
      0,
    );
}

function latestOrderBook(input: MarketIntelligenceInput) {
  let latest = input.orderBooks?.[0];

  for (const snapshot of input.orderBooks ?? []) {
    if (
      latest === undefined ||
      Number(snapshot.eventTimeMs) > Number(latest.eventTimeMs)
    ) {
      latest = snapshot;
    }
  }

  return latest;
}

function inferInputs(
  input: MarketIntelligenceInput,
  vector: MarketFeatureVector,
  configuration: LiquidityPredictionConfiguration,
): LiquidityInputs {
  const features = featureMap(vector);
  const orderBook = latestOrderBook(input);

  const bookBidDepth = orderBook
    ? calculateDepth(orderBook.bids, configuration.depthLevels)
    : 0;
  const bookAskDepth = orderBook
    ? calculateDepth(orderBook.asks, configuration.depthLevels)
    : 0;

  const bidDepth = Math.max(
    0,
    bookBidDepth || scalarFeature(features, ["liquidity.bid_depth"]),
  );
  const askDepth = Math.max(
    0,
    bookAskDepth || scalarFeature(features, ["liquidity.ask_depth"]),
  );
  const totalDepth = bidDepth + askDepth;

  const spreadBps = Math.max(
    0,
    orderBook?.spreadBps !== undefined
      ? Number(orderBook.spreadBps)
      : scalarFeature(features, [
          "liquidity.spread_bps",
          "microstructure.spread_bps",
        ]),
  );

  const availableFeatures = vector.features.filter(
    (feature) => !feature.isMissing,
  ).length;

  return deepFreeze({
    bidDepth,
    askDepth,
    totalDepth,
    spreadBps,
    depthImbalance: clamp(
      totalDepth > 0
        ? (bidDepth - askDepth) / totalDepth
        : scalarFeature(features, [
            "liquidity.depth_imbalance",
            "microstructure.order_book_imbalance",
          ]),
      -1,
      1,
    ),
    relativeVolume: Math.max(
      0,
      scalarFeature(features, ["volume.relative"], 1),
    ),
    realizedVolatility: Math.max(
      0,
      scalarFeature(features, ["volatility.realized"]),
    ),
    orderFlowDelta: clamp(
      scalarFeature(features, [
        "order_flow.normalized_delta",
        "order_flow.delta",
      ]),
      -1,
      1,
    ),
    liquidationImbalance: clamp(
      scalarFeature(features, ["derivatives.liquidation_imbalance"]),
      -1,
      1,
    ),
    qualityScore: clamp(Number(vector.qualityScore), 0, 1),
    featureCoverage:
      vector.featureCount === 0
        ? 0
        : availableFeatures / vector.featureCount,
  });
}

function regimeProbability(
  intelligence: MarketRegimeIntelligence,
  target: MarketRegime,
): number {
  return Number(
    intelligence.regimeProbabilities.find(
      (probability) => probability.regime === target,
    )?.probability ?? 0,
  );
}

function stressScore(intelligence: MarketRegimeIntelligence): number {
  return clamp(
    regimeProbability(intelligence, MarketRegime.LIQUIDITY_STRESS) +
      regimeProbability(intelligence, MarketRegime.DISLOCATION) * 0.9 +
      regimeProbability(
        intelligence,
        MarketRegime.VOLATILITY_EXPANSION,
      ) * 0.45 +
      regimeProbability(intelligence, MarketRegime.BREAKOUT) * 0.2 +
      regimeProbability(intelligence, MarketRegime.BREAKDOWN) * 0.2,
    0,
    1,
  );
}

function recoveryScore(intelligence: MarketRegimeIntelligence): number {
  return clamp(
    regimeProbability(
      intelligence,
      MarketRegime.VOLATILITY_CONTRACTION,
    ) * 0.75 +
      regimeProbability(intelligence, MarketRegime.RANGE_BOUND) * 0.55 +
      regimeProbability(intelligence, MarketRegime.MEAN_REVERTING) * 0.4,
    0,
    1,
  );
}

function classifyLiquidity(
  totalDepth: number,
  spreadBps: number,
  targetNotional: number,
  maximumSpreadBps: number,
): LiquidityState {
  const coverage = safeDivide(totalDepth, Math.max(targetNotional, 1));

  if (spreadBps >= maximumSpreadBps * 2 || coverage < 0.5) {
    return LiquidityState.DISLOCATED;
  }

  if (spreadBps >= maximumSpreadBps || coverage < 1) {
    return LiquidityState.STRESSED;
  }

  if (coverage >= 20 && spreadBps <= maximumSpreadBps * 0.2) {
    return LiquidityState.DEEP;
  }

  if (coverage >= 8 && spreadBps <= maximumSpreadBps * 0.5) {
    return LiquidityState.HEALTHY;
  }

  if (coverage >= 2) {
    return LiquidityState.NORMAL;
  }

  return LiquidityState.THIN;
}

function estimateMarketImpactBps(
  targetNotional: number,
  totalDepth: number,
  spreadBps: number,
  imbalance: number,
): number {
  const participation = safeDivide(
    targetNotional,
    Math.max(totalDepth, 1),
    1,
  );
  const imbalancePenalty = 1 + Math.abs(imbalance) * 0.75;

  return Math.max(
    spreadBps / 2,
    spreadBps / 2 +
      Math.sqrt(Math.max(0, participation)) * 100 * imbalancePenalty,
  );
}

function estimateFillProbability(
  targetNotional: number,
  bidDepth: number,
  askDepth: number,
  impactBps: number,
  maximumImpactBps: number,
): number {
  const executableDepth = Math.min(bidDepth, askDepth);
  const depthCoverage = safeDivide(
    executableDepth,
    Math.max(targetNotional, 1),
  );
  const depthScore = clamp(depthCoverage / 2, 0, 1);
  const impactScore = clamp(
    1 - safeDivide(impactBps, Math.max(maximumImpactBps, EPSILON)),
    0,
    1,
  );

  return clamp(depthScore * 0.7 + impactScore * 0.3, 0, 1);
}

function buildDrivers(
  inputs: LiquidityInputs,
  regime: MarketRegimeIntelligence,
  deteriorationProbability: number,
  improvementProbability: number,
): readonly ForecastDriver[] {
  const spreadStress = clamp(inputs.spreadBps / 100, 0, 1);
  const volatilityStress = clamp(inputs.realizedVolatility / 0.05, 0, 1);
  const flowStress = clamp(
    Math.abs(inputs.orderFlowDelta) * 0.65 +
      Math.abs(inputs.liquidationImbalance) * 0.35,
    0,
    1,
  );
  const depthScore = clamp(
    Math.log10(Math.max(1, inputs.totalDepth)) / 8,
    0,
    1,
  );
  const regimeBalance = recoveryScore(regime) - stressScore(regime);

  return deepFreeze([
    {
      name: "available_depth",
      direction:
        depthScore >= 0.5
          ? ExplanationFactorDirection.SUPPORTING
          : ExplanationFactorDirection.OPPOSING,
      contribution: round(depthScore * 2 - 1),
      observedValue: round(inputs.totalDepth),
      description:
        "Displayed executable notional depth determines fill capacity.",
    },
    {
      name: "current_spread",
      direction:
        spreadStress > 0.2
          ? ExplanationFactorDirection.OPPOSING
          : ExplanationFactorDirection.NEUTRAL,
      contribution: round(-spreadStress),
      observedValue: round(inputs.spreadBps),
      description:
        "Wider spreads increase expected market impact and reduce liquidity quality.",
    },
    {
      name: "volatility_stress",
      direction:
        volatilityStress > 0.2
          ? ExplanationFactorDirection.OPPOSING
          : ExplanationFactorDirection.NEUTRAL,
      contribution: round(-volatilityStress),
      observedValue: round(inputs.realizedVolatility),
      description:
        "Elevated realized volatility can widen spreads and reduce displayed depth.",
    },
    {
      name: "order_flow_stress",
      direction:
        flowStress > 0.15
          ? ExplanationFactorDirection.OPPOSING
          : ExplanationFactorDirection.NEUTRAL,
      contribution: round(-flowStress),
      observedValue: round(inputs.orderFlowDelta),
      description:
        "One-sided aggressive flow and liquidation pressure weaken liquidity.",
    },
    {
      name: "regime_liquidity_bias",
      direction:
        regimeBalance > 0
          ? ExplanationFactorDirection.SUPPORTING
          : regimeBalance < 0
            ? ExplanationFactorDirection.OPPOSING
            : ExplanationFactorDirection.NEUTRAL,
      contribution: round(regimeBalance),
      observedValue: regime.primaryRegime,
      description:
        "Regime probabilities shift the outlook toward liquidity recovery or stress.",
    },
    {
      name: "forecast_balance",
      direction:
        improvementProbability > deteriorationProbability
          ? ExplanationFactorDirection.SUPPORTING
          : ExplanationFactorDirection.OPPOSING,
      contribution: round(
        improvementProbability - deteriorationProbability,
      ),
      observedValue: round(deteriorationProbability),
      description:
        "The probability balance summarizes projected market-quality direction.",
    },
  ]);
}

function predictWindow(
  inputs: LiquidityInputs,
  regime: MarketRegimeIntelligence,
  window: PredictionWindow,
  configuration: LiquidityPredictionConfiguration,
): WindowPrediction {
  const horizonScale = Math.max(
    1,
    Number(window.durationMs) / BASE_HORIZON_MS,
  );
  const horizonDamping = 1 / Math.sqrt(horizonScale);
  const volatilityStress = clamp(inputs.realizedVolatility / 0.05, 0, 1);
  const spreadStress = clamp(
    safeDivide(
      inputs.spreadBps,
      Math.max(Number(configuration.maximumAcceptableSpreadBps), EPSILON),
    ),
    0,
    2,
  );
  const flowStress = clamp(
    Math.abs(inputs.orderFlowDelta) * 0.6 +
      Math.abs(inputs.liquidationImbalance) * 0.4,
    0,
    1,
  );
  const replenishment = clamp(
    Math.max(0, inputs.relativeVolume - 0.75) / 1.5 +
      (1 - Math.abs(inputs.depthImbalance)) * 0.2,
    0,
    1,
  );

  const deteriorationSignal = clamp(
    stressScore(regime) * 0.35 +
      volatilityStress * 0.22 +
      spreadStress * 0.18 +
      flowStress * 0.18 +
      Number(regime.transitionProbability) * 0.07,
    0,
    1,
  );
  const improvementSignal = clamp(
    recoveryScore(regime) * 0.4 +
      replenishment * 0.32 +
      (1 - volatilityStress) * 0.15 +
      Number(regime.persistenceProbability) * 0.08 +
      inputs.qualityScore * 0.05,
    0,
    1,
  );

  const deteriorationProbability = clamp(
    sigmoid(
      (deteriorationSignal - improvementSignal) * 3 +
        0.1 * horizonDamping,
    ),
    0,
    1,
  );
  const improvementProbability = clamp(
    sigmoid(
      (improvementSignal - deteriorationSignal) * 3 -
        0.1 * horizonDamping,
    ),
    0,
    1,
  );

  const netImprovement = improvementProbability - deteriorationProbability;
  const depthMultiplier = clamp(
    1 +
      netImprovement * (0.35 + 0.15 * horizonDamping) +
      (replenishment - 0.5) * 0.08,
    0.1,
    2.25,
  );
  const spreadMultiplier = clamp(
    1 -
      netImprovement * (0.5 + 0.2 * horizonDamping) +
      volatilityStress * 0.12 +
      flowStress * 0.08,
    0.25,
    3,
  );

  const predictedTotalDepth = inputs.totalDepth * depthMultiplier;
  const predictedImbalance = clamp(
    inputs.depthImbalance * (0.65 + 0.2 * horizonDamping) +
      inputs.orderFlowDelta * 0.15,
    -1,
    1,
  );
  const predictedBidShare = clamp((1 + predictedImbalance) / 2, 0, 1);
  const predictedBidDepth = predictedTotalDepth * predictedBidShare;
  const predictedAskDepth = predictedTotalDepth - predictedBidDepth;
  const predictedSpreadBps = inputs.spreadBps * spreadMultiplier;
  const predictedMarketImpactBps = estimateMarketImpactBps(
    Number(configuration.targetNotional),
    predictedTotalDepth,
    predictedSpreadBps,
    predictedImbalance,
  );
  const predictedFillProbability = estimateFillProbability(
    Number(configuration.targetNotional),
    predictedBidDepth,
    predictedAskDepth,
    predictedMarketImpactBps,
    Number(configuration.maximumAcceptableImpactBps),
  );
  const confidence = clamp(
    inputs.qualityScore * 0.45 +
      inputs.featureCoverage * 0.2 +
      Number(regime.confidence) * 0.25 +
      Math.abs(netImprovement) * 0.1,
    0,
    1,
  );

  return deepFreeze({
    state: classifyLiquidity(
      predictedTotalDepth,
      predictedSpreadBps,
      Number(configuration.targetNotional),
      Number(configuration.maximumAcceptableSpreadBps),
    ),
    bidDepth: round(predictedBidDepth),
    askDepth: round(predictedAskDepth),
    spreadBps: round(predictedSpreadBps),
    marketImpactBps: round(predictedMarketImpactBps),
    fillProbability: round(predictedFillProbability),
    deteriorationProbability: round(deteriorationProbability),
    improvementProbability: round(improvementProbability),
    confidence: round(confidence),
    drivers: buildDrivers(
      inputs,
      regime,
      deteriorationProbability,
      improvementProbability,
    ),
  });
}

function createPredictionId(
  vector: MarketFeatureVector,
  window: PredictionWindow,
  modelVersion: ModelVersion,
): MarketPredictionId {
  const seed = [
    "liquidity",
    vector.deterministicFingerprint,
    window.horizon,
    String(window.durationMs),
    String(window.startTimeMs),
    String(window.endTimeMs),
    String(modelVersion),
  ].join("|");

  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= BigInt(seed.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return `liquidity-prediction-${hash
    .toString(16)
    .padStart(16, "0")}` as MarketPredictionId;
}

function validateConfiguration(
  configuration: LiquidityPredictionConfiguration,
): void {
  if (configuration.horizons.length === 0) {
    throw new Error("Liquidity prediction requires at least one horizon.");
  }

  if (!Number.isInteger(configuration.depthLevels) || configuration.depthLevels <= 0) {
    throw new Error("Liquidity prediction depthLevels must be a positive integer.");
  }

  if (Number(configuration.targetNotional) <= 0) {
    throw new Error("Liquidity prediction targetNotional must be positive.");
  }

  if (
    Number(configuration.minimumFillProbability) < 0 ||
    Number(configuration.minimumFillProbability) > 1
  ) {
    throw new Error("minimumFillProbability must be within [0, 1].");
  }

  if (
    Number(configuration.maximumAcceptableSpreadBps) < 0 ||
    Number(configuration.maximumAcceptableImpactBps) < 0
  ) {
    throw new Error("Maximum acceptable spread and impact cannot be negative.");
  }

  for (const window of configuration.horizons) {
    if (Number(window.durationMs) <= 0) {
      throw new Error(
        `Liquidity prediction horizon ${window.horizon} must have a positive duration.`,
      );
    }

    if (Number(window.endTimeMs) <= Number(window.startTimeMs)) {
      throw new Error(
        `Liquidity prediction horizon ${window.horizon} has an invalid time range.`,
      );
    }
  }
}

export class DefaultLiquidityPredictionEngine
  implements LiquidityPredictionEngine
{
  public predict(
    input: MarketIntelligenceInput,
    featureVector: MarketFeatureVector,
    regime: MarketRegimeIntelligence,
    configuration: LiquidityPredictionConfiguration,
  ): readonly LiquidityPrediction[] {
    validateConfiguration(configuration);

    if (!configuration.enabled) {
      return deepFreeze([]);
    }

    const inputs = inferInputs(input, featureVector, configuration);
    const currentState = classifyLiquidity(
      inputs.totalDepth,
      inputs.spreadBps,
      Number(configuration.targetNotional),
      Number(configuration.maximumAcceptableSpreadBps),
    );

    const predictions = [...configuration.horizons]
      .sort(
        (left, right) =>
          Number(left.durationMs) - Number(right.durationMs) ||
          String(left.horizon).localeCompare(String(right.horizon)),
      )
      .map((window): LiquidityPrediction => {
        const predicted = predictWindow(
          inputs,
          regime,
          window,
          configuration,
        );

        return deepFreeze({
          predictionId: createPredictionId(
            featureVector,
            window,
            configuration.modelVersion,
          ),
          window,
          currentState,
          predictedState: predicted.state,
          predictedBidDepth: predicted.bidDepth as Notional,
          predictedAskDepth: predicted.askDepth as Notional,
          predictedSpreadBps: predicted.spreadBps as BasisPoints,
          predictedMarketImpactBps:
            predicted.marketImpactBps as BasisPoints,
          predictedFillProbability:
            predicted.fillProbability as Probability,
          deteriorationProbability:
            predicted.deteriorationProbability as Probability,
          improvementProbability:
            predicted.improvementProbability as Probability,
          confidence: predicted.confidence as ConfidenceScore,
          drivers: predicted.drivers,
          modelVersion: configuration.modelVersion,
          generatedAtMs: featureVector.generatedAtMs,
        });
      });

    return deepFreeze(predictions);
  }
}

export function createLiquidityPredictionEngine(): LiquidityPredictionEngine {
  return new DefaultLiquidityPredictionEngine();
}

export function predictMarketLiquidity(
  input: MarketIntelligenceInput,
  featureVector: MarketFeatureVector,
  regime: MarketRegimeIntelligence,
  configuration: LiquidityPredictionConfiguration,
): readonly LiquidityPrediction[] {
  return new DefaultLiquidityPredictionEngine().predict(
    input,
    featureVector,
    regime,
    configuration,
  );
}