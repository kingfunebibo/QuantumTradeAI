/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 4: Deterministic market regime detector.
 *
 * The detector consumes immutable feature snapshots and market context,
 * calculates normalized regime probabilities, records transitions, and
 * retains bounded point-in-time detection history.
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiFeatureContribution,
  type AiFeatureSnapshot,
  type AiFeatureValue,
  type AiModelReference,
  type AiStrategyInstrument,
  type AiStrategyMarketContext,
  type AiStrategyMetadata,
  type AiStrategyTimeframe,
  type AiStrategyTimestamp,
  type MarketRegime,
  type MarketRegimeDetection,
  type MarketRegimeProbability,
} from "./ai-strategy-contracts";
import {
  type AiContractValidationIssue,
  AiStrategyContractValidator,
  AiStrategyValidationError,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface MarketRegimeFeatureMapping {
  readonly trendScore: readonly string[];
  readonly momentumScore: readonly string[];
  readonly volatilityScore: readonly string[];
  readonly liquidityScore: readonly string[];
  readonly meanReversionScore: readonly string[];
  readonly breakoutScore: readonly string[];
}

export interface MarketRegimeThresholds {
  readonly strongTrend: number;
  readonly trend: number;
  readonly weakTrend: number;
  readonly highVolatility: number;
  readonly lowVolatility: number;
  readonly liquidityStress: number;
  readonly meanReversion: number;
  readonly breakout: number;
  readonly minimumConfidence: number;
  readonly transitionMinimumConfidence: number;
  readonly transitionMinimumProbabilityDelta: number;
}

export interface MarketRegimeWeights {
  readonly trend: number;
  readonly momentum: number;
  readonly volatility: number;
  readonly liquidity: number;
  readonly meanReversion: number;
  readonly breakout: number;
}

export interface MarketRegimeDetectorOptions {
  readonly model?: AiModelReference;
  readonly featureMapping?: Partial<MarketRegimeFeatureMapping>;
  readonly thresholds?: Partial<MarketRegimeThresholds>;
  readonly weights?: Partial<MarketRegimeWeights>;
  readonly defaultValidityMs?: number;
  readonly maximumHistoryEntries?: number;
  readonly requireValidFeatureSnapshot?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
}

export interface MarketRegimeDetectionRequest {
  readonly marketContext: AiStrategyMarketContext;
  readonly featureSnapshot: AiFeatureSnapshot;
  readonly detectedAt?: AiStrategyTimestamp;
  readonly validityMs?: number;
  readonly metadata?: AiStrategyMetadata;
}

export interface MarketRegimeScoreCard {
  readonly trend: number;
  readonly momentum: number;
  readonly volatility: number;
  readonly liquidity: number;
  readonly meanReversion: number;
  readonly breakout: number;
  readonly compositeTrend: number;
}

export interface MarketRegimeTransition {
  readonly transitionId: string;
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly detectedAt: AiStrategyTimestamp;
  readonly previousRegime: MarketRegime;
  readonly nextRegime: MarketRegime;
  readonly previousConfidence: number;
  readonly nextConfidence: number;
  readonly probabilityDelta: number;
  readonly confirmed: boolean;
  readonly metadata: AiStrategyMetadata;
}

export interface MarketRegimeHistoryQuery {
  readonly exchangeId?: string;
  readonly normalizedSymbol?: string;
  readonly timeframe?: AiStrategyTimeframe;
  readonly regime?: MarketRegime;
  readonly fromDetectedAt?: AiStrategyTimestamp;
  readonly toDetectedAt?: AiStrategyTimestamp;
  readonly includeExpired?: boolean;
  readonly limit?: number;
  readonly asOf?: AiStrategyTimestamp;
}

export interface MarketRegimeDetectorSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly detectionCount: number;
  readonly transitionCount: number;
  readonly detections: readonly MarketRegimeDetection[];
  readonly transitions: readonly MarketRegimeTransition[];
  readonly metadata: AiStrategyMetadata;
}

export interface MarketRegimeDetector {
  detect(request: MarketRegimeDetectionRequest): MarketRegimeDetection;

  getLatest(
    instrument: AiStrategyInstrument,
    timeframe: AiStrategyTimeframe,
    asOf?: AiStrategyTimestamp,
  ): MarketRegimeDetection | undefined;

  queryHistory(
    query?: MarketRegimeHistoryQuery,
  ): readonly MarketRegimeDetection[];

  queryTransitions(
    query?: MarketRegimeHistoryQuery,
  ): readonly MarketRegimeTransition[];

  clearHistory(): void;

  snapshot(): MarketRegimeDetectorSnapshot;
}

const ALL_REGIMES: readonly MarketRegime[] = Object.freeze([
  "STRONG_BULL",
  "BULL",
  "WEAK_BULL",
  "RANGE",
  "WEAK_BEAR",
  "BEAR",
  "STRONG_BEAR",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "LIQUIDITY_STRESS",
  "TRENDING",
  "MEAN_REVERTING",
  "BREAKOUT",
  "UNKNOWN",
]);

const DEFAULT_MODEL: AiModelReference = Object.freeze({
  providerId: "quantumtradeai",
  modelId: "deterministic-market-regime-detector",
  modelVersion: "1.0.0",
});

const DEFAULT_FEATURE_MAPPING: MarketRegimeFeatureMapping = Object.freeze({
  trendScore: Object.freeze([
    "trend_score",
    "ema_trend_score",
    "moving_average_trend",
    "price_trend",
    "adx_direction",
  ]),
  momentumScore: Object.freeze([
    "momentum_score",
    "rsi_normalized",
    "macd_score",
    "rate_of_change",
    "price_momentum",
  ]),
  volatilityScore: Object.freeze([
    "volatility_score",
    "atr_normalized",
    "realized_volatility",
    "bollinger_bandwidth",
    "volatility_percentile",
  ]),
  liquidityScore: Object.freeze([
    "liquidity_score",
    "order_book_liquidity",
    "market_depth_score",
    "inverse_spread_score",
    "volume_liquidity_score",
  ]),
  meanReversionScore: Object.freeze([
    "mean_reversion_score",
    "reversion_probability",
    "zscore_reversion",
    "range_score",
  ]),
  breakoutScore: Object.freeze([
    "breakout_score",
    "breakout_probability",
    "range_expansion_score",
    "volume_breakout_score",
  ]),
});

const DEFAULT_THRESHOLDS: MarketRegimeThresholds = Object.freeze({
  strongTrend: 0.75,
  trend: 0.5,
  weakTrend: 0.2,
  highVolatility: 0.7,
  lowVolatility: 0.25,
  liquidityStress: 0.25,
  meanReversion: 0.65,
  breakout: 0.7,
  minimumConfidence: 0.35,
  transitionMinimumConfidence: 0.5,
  transitionMinimumProbabilityDelta: 0.1,
});

const DEFAULT_WEIGHTS: MarketRegimeWeights = Object.freeze({
  trend: 0.3,
  momentum: 0.2,
  volatility: 0.15,
  liquidity: 0.15,
  meanReversion: 0.1,
  breakout: 0.1,
});

const DEFAULT_VALIDITY_MS = 300_000;
const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 10_000;
const SCORE_EPSILON = 1e-12;

interface ResolvedOptions {
  readonly model: AiModelReference;
  readonly featureMapping: MarketRegimeFeatureMapping;
  readonly thresholds: MarketRegimeThresholds;
  readonly weights: MarketRegimeWeights;
  readonly defaultValidityMs: number;
  readonly maximumHistoryEntries: number;
  readonly requireValidFeatureSnapshot: boolean;
  readonly clock: () => AiStrategyTimestamp;
  readonly idFactory: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator: AiStrategyContractValidator;
}

interface NumericFeature {
  readonly featureId: string;
  readonly value: number;
}

interface ProbabilityCandidate {
  readonly regime: MarketRegime;
  readonly rawScore: number;
}

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function defaultIdFactory(
  prefix: string,
  timestamp: AiStrategyTimestamp,
  sequence: number,
): string {
  return `${prefix}-${timestamp}-${sequence}`;
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value >= -1 && value <= 1) {
    return value;
  }

  return Math.tanh(value);
}

function normalizeUnsigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value >= 0 && value <= 1) {
    return value;
  }

  if (value >= -1 && value < 0) {
    return Math.abs(value);
  }

  return clamp(Math.abs(Math.tanh(value)), 0, 1);
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const output: Record<
    string,
    string | number | boolean | null | readonly (
      | string
      | number
      | boolean
      | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    output[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(output);
}

function cloneInstrument(
  instrument: AiStrategyInstrument,
): AiStrategyInstrument {
  return Object.freeze({
    ...instrument,
    metadata: cloneMetadata(instrument.metadata),
  });
}

function cloneModel(model: AiModelReference): AiModelReference {
  return Object.freeze({ ...model });
}

function cloneContribution(
  contribution: AiFeatureContribution,
): AiFeatureContribution {
  return Object.freeze({
    ...contribution,
    metadata: cloneMetadata(contribution.metadata),
  });
}

function cloneProbability(
  probability: MarketRegimeProbability,
): MarketRegimeProbability {
  return Object.freeze({ ...probability });
}

function cloneDetection(
  detection: MarketRegimeDetection,
): MarketRegimeDetection {
  return Object.freeze({
    ...detection,
    instrument: cloneInstrument(detection.instrument),
    probabilities: Object.freeze(
      detection.probabilities.map(cloneProbability),
    ),
    supportingFeatures: Object.freeze(
      detection.supportingFeatures.map(cloneContribution),
    ),
    model: cloneModel(detection.model),
    metadata: cloneMetadata(detection.metadata),
  });
}

function cloneTransition(
  transition: MarketRegimeTransition,
): MarketRegimeTransition {
  return Object.freeze({
    ...transition,
    instrument: cloneInstrument(transition.instrument),
    metadata: cloneMetadata(transition.metadata),
  });
}

function instrumentKey(
  instrument: AiStrategyInstrument,
  timeframe: AiStrategyTimeframe,
): string {
  return [
    instrument.exchangeId,
    instrument.normalizedSymbol,
    instrument.marketType,
    timeframe,
  ].join("::");
}

function compareDetections(
  left: MarketRegimeDetection,
  right: MarketRegimeDetection,
): number {
  if (left.detectedAt !== right.detectedAt) {
    return left.detectedAt - right.detectedAt;
  }

  return left.detectionId.localeCompare(right.detectionId);
}

function compareTransitions(
  left: MarketRegimeTransition,
  right: MarketRegimeTransition,
): number {
  if (left.detectedAt !== right.detectedAt) {
    return left.detectedAt - right.detectedAt;
  }

  return left.transitionId.localeCompare(right.transitionId);
}

function mergeFeatureMapping(
  mapping: Partial<MarketRegimeFeatureMapping> | undefined,
): MarketRegimeFeatureMapping {
  return Object.freeze({
    trendScore: Object.freeze([
      ...(mapping?.trendScore ?? DEFAULT_FEATURE_MAPPING.trendScore),
    ]),
    momentumScore: Object.freeze([
      ...(mapping?.momentumScore ?? DEFAULT_FEATURE_MAPPING.momentumScore),
    ]),
    volatilityScore: Object.freeze([
      ...(mapping?.volatilityScore ??
        DEFAULT_FEATURE_MAPPING.volatilityScore),
    ]),
    liquidityScore: Object.freeze([
      ...(mapping?.liquidityScore ?? DEFAULT_FEATURE_MAPPING.liquidityScore),
    ]),
    meanReversionScore: Object.freeze([
      ...(mapping?.meanReversionScore ??
        DEFAULT_FEATURE_MAPPING.meanReversionScore),
    ]),
    breakoutScore: Object.freeze([
      ...(mapping?.breakoutScore ?? DEFAULT_FEATURE_MAPPING.breakoutScore),
    ]),
  });
}

function validateThresholds(thresholds: MarketRegimeThresholds): void {
  for (const [key, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(
        `thresholds.${key} must be a finite number between 0 and 1.`,
      );
    }
  }

  if (
    thresholds.strongTrend < thresholds.trend ||
    thresholds.trend < thresholds.weakTrend
  ) {
    throw new RangeError(
      "Trend thresholds must satisfy strongTrend >= trend >= weakTrend.",
    );
  }

  if (thresholds.lowVolatility > thresholds.highVolatility) {
    throw new RangeError(
      "lowVolatility cannot exceed highVolatility.",
    );
  }
}

function normalizeWeights(
  weights: MarketRegimeWeights,
): MarketRegimeWeights {
  for (const [key, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `weights.${key} must be a non-negative finite number.`,
      );
    }
  }

  const total =
    weights.trend +
    weights.momentum +
    weights.volatility +
    weights.liquidity +
    weights.meanReversion +
    weights.breakout;

  if (total <= SCORE_EPSILON) {
    throw new RangeError("At least one regime weight must be positive.");
  }

  return Object.freeze({
    trend: weights.trend / total,
    momentum: weights.momentum / total,
    volatility: weights.volatility / total,
    liquidity: weights.liquidity / total,
    meanReversion: weights.meanReversion / total,
    breakout: weights.breakout / total,
  });
}

export class DeterministicMarketRegimeDetector
  implements MarketRegimeDetector
{
  private readonly options: ResolvedOptions;

  private readonly detections: MarketRegimeDetection[] = [];

  private readonly transitions: MarketRegimeTransition[] = [];

  private readonly latestByInstrument = new Map<
    string,
    MarketRegimeDetection
  >();

  private sequence = 0;

  public constructor(options: MarketRegimeDetectorOptions = {}) {
    const thresholds = Object.freeze({
      ...DEFAULT_THRESHOLDS,
      ...options.thresholds,
    });
    validateThresholds(thresholds);

    const weights = normalizeWeights({
      ...DEFAULT_WEIGHTS,
      ...options.weights,
    });

    const defaultValidityMs =
      options.defaultValidityMs ?? DEFAULT_VALIDITY_MS;
    const maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;

    assertFiniteNonNegative(defaultValidityMs, "defaultValidityMs");
    assertPositiveInteger(
      maximumHistoryEntries,
      "maximumHistoryEntries",
    );

    this.options = Object.freeze({
      model: cloneModel(options.model ?? DEFAULT_MODEL),
      featureMapping: mergeFeatureMapping(options.featureMapping),
      thresholds,
      weights,
      defaultValidityMs,
      maximumHistoryEntries,
      requireValidFeatureSnapshot:
        options.requireValidFeatureSnapshot ?? true,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
    });
  }

  public detect(
    request: MarketRegimeDetectionRequest,
  ): MarketRegimeDetection {
    const marketValidation =
      this.options.validator.validateMarketContext(
        request.marketContext,
      );
    this.options.validator.assertValid(
      marketValidation,
      "Market regime context validation failed.",
    );

    const snapshotValidation =
      this.options.validator.validateFeatureSnapshot(
        request.featureSnapshot,
      );
    this.options.validator.assertValid(
      snapshotValidation,
      "Market regime feature snapshot validation failed.",
    );

    if (
      this.options.requireValidFeatureSnapshot &&
      !request.featureSnapshot.valid
    ) {
      throw new AiStrategyValidationError(
        "Market regime detection requires a valid feature snapshot.",
        Object.freeze([
          Object.freeze({
            path: "request.featureSnapshot.valid",
            code: "INVALID_FEATURE_SNAPSHOT",
            message:
              "The supplied feature snapshot is marked invalid.",
            severity: "ERROR" as const,
          }),
        ]),
      );
    }

    const detectedAt =
      request.detectedAt ?? this.options.clock();
    const validityMs =
      request.validityMs ?? this.options.defaultValidityMs;

    assertFiniteNonNegative(detectedAt, "request.detectedAt");
    assertFiniteNonNegative(validityMs, "request.validityMs");

    if (request.featureSnapshot.createdAt > detectedAt) {
      throw new RangeError(
        "featureSnapshot.createdAt cannot be later than detectedAt.",
      );
    }

    const numericFeatures = this.extractNumericFeatures(
      request.featureSnapshot,
      request.marketContext,
    );
    const scoreCard = this.calculateScoreCard(numericFeatures);
    const candidates = this.calculateCandidates(scoreCard);
    const probabilities = this.normalizeProbabilities(candidates);
    const primary = probabilities[0] ?? {
      regime: "UNKNOWN" as const,
      probability: 1,
    };

    const confidence =
      primary.probability >=
      this.options.thresholds.minimumConfidence
        ? primary.probability
        : 0;

    const primaryRegime =
      confidence === 0 ? "UNKNOWN" : primary.regime;

    const supportingFeatures = this.createSupportingFeatures(
      numericFeatures,
      scoreCard,
    );

    const detection = cloneDetection({
      detectionId: this.nextId("market-regime", detectedAt),
      instrument: request.marketContext.instrument,
      timeframe: request.marketContext.timeframe,
      detectedAt,
      validUntil: detectedAt + validityMs,
      primaryRegime,
      confidence:
        primaryRegime === "UNKNOWN"
          ? Math.max(
              probabilities.find(
                (entry) => entry.regime === "UNKNOWN",
              )?.probability ?? 0,
              1 - primary.probability,
            )
          : confidence,
      probabilities,
      supportingFeatures,
      model: this.options.model,
      metadata: cloneMetadata(request.metadata),
    });

    const validation =
      this.options.validator.validateRegimeDetection(detection);
    this.options.validator.assertValid(
      validation,
      "Generated market regime detection is invalid.",
    );

    this.recordDetection(detection);
    return detection;
  }

  public getLatest(
    instrument: AiStrategyInstrument,
    timeframe: AiStrategyTimeframe,
    asOf = this.options.clock(),
  ): MarketRegimeDetection | undefined {
    assertFiniteNonNegative(asOf, "asOf");

    const detection = this.latestByInstrument.get(
      instrumentKey(instrument, timeframe),
    );

    if (
      detection === undefined ||
      detection.detectedAt > asOf ||
      detection.validUntil < asOf
    ) {
      return undefined;
    }

    return detection;
  }

  public queryHistory(
    query: MarketRegimeHistoryQuery = {},
  ): readonly MarketRegimeDetection[] {
    this.validateQuery(query);

    const asOf = query.asOf ?? this.options.clock();
    const includeExpired = query.includeExpired ?? true;
    const limit = query.limit ?? this.options.maximumHistoryEntries;

    return Object.freeze(
      this.detections
        .filter((detection) => {
          if (
            query.exchangeId !== undefined &&
            detection.instrument.exchangeId !== query.exchangeId
          ) {
            return false;
          }

          if (
            query.normalizedSymbol !== undefined &&
            detection.instrument.normalizedSymbol !==
              query.normalizedSymbol
          ) {
            return false;
          }

          if (
            query.timeframe !== undefined &&
            detection.timeframe !== query.timeframe
          ) {
            return false;
          }

          if (
            query.regime !== undefined &&
            detection.primaryRegime !== query.regime
          ) {
            return false;
          }

          if (
            query.fromDetectedAt !== undefined &&
            detection.detectedAt < query.fromDetectedAt
          ) {
            return false;
          }

          if (
            query.toDetectedAt !== undefined &&
            detection.detectedAt > query.toDetectedAt
          ) {
            return false;
          }

          if (!includeExpired && detection.validUntil < asOf) {
            return false;
          }

          return true;
        })
        .sort(compareDetections)
        .slice(-limit),
    );
  }

  public queryTransitions(
    query: MarketRegimeHistoryQuery = {},
  ): readonly MarketRegimeTransition[] {
    this.validateQuery(query);
    const limit = query.limit ?? this.options.maximumHistoryEntries;

    return Object.freeze(
      this.transitions
        .filter((transition) => {
          if (
            query.exchangeId !== undefined &&
            transition.instrument.exchangeId !== query.exchangeId
          ) {
            return false;
          }

          if (
            query.normalizedSymbol !== undefined &&
            transition.instrument.normalizedSymbol !==
              query.normalizedSymbol
          ) {
            return false;
          }

          if (
            query.timeframe !== undefined &&
            transition.timeframe !== query.timeframe
          ) {
            return false;
          }

          if (
            query.regime !== undefined &&
            transition.nextRegime !== query.regime
          ) {
            return false;
          }

          if (
            query.fromDetectedAt !== undefined &&
            transition.detectedAt < query.fromDetectedAt
          ) {
            return false;
          }

          if (
            query.toDetectedAt !== undefined &&
            transition.detectedAt > query.toDetectedAt
          ) {
            return false;
          }

          return true;
        })
        .sort(compareTransitions)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.detections.length = 0;
    this.transitions.length = 0;
    this.latestByInstrument.clear();
  }

  public snapshot(): MarketRegimeDetectorSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      detectionCount: this.detections.length,
      transitionCount: this.transitions.length,
      detections: Object.freeze([...this.detections]),
      transitions: Object.freeze([...this.transitions]),
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private extractNumericFeatures(
    snapshot: AiFeatureSnapshot,
    marketContext: AiStrategyMarketContext,
  ): ReadonlyMap<string, NumericFeature> {
    const features = new Map<string, NumericFeature>();

    for (const vector of snapshot.vectors) {
      if (
        vector.instrument.exchangeId !==
          marketContext.instrument.exchangeId ||
        vector.instrument.normalizedSymbol !==
          marketContext.instrument.normalizedSymbol ||
        vector.timeframe !== marketContext.timeframe
      ) {
        continue;
      }

      for (const [featureId, value] of Object.entries(
        vector.values,
      )) {
        const numeric = this.toNumericFeature(value);
        if (numeric === undefined) {
          continue;
        }

        features.set(featureId, {
          featureId,
          value: numeric,
        });
      }
    }

    this.addMarketContextFeatures(features, marketContext);
    return features;
  }

  private toNumericFeature(
    value: AiFeatureValue,
  ): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }

    return undefined;
  }

  private addMarketContextFeatures(
    features: Map<string, NumericFeature>,
    context: AiStrategyMarketContext,
  ): void {
    if (
      Number.isFinite(context.bestBid) &&
      Number.isFinite(context.bestAsk) &&
      (context.bestAsk as number) > 0
    ) {
      const midpoint =
        ((context.bestBid as number) +
          (context.bestAsk as number)) /
        2;
      const spread =
        midpoint > 0
          ? ((context.bestAsk as number) -
              (context.bestBid as number)) /
            midpoint
          : 0;

      features.set("bid_ask_spread_ratio", {
        featureId: "bid_ask_spread_ratio",
        value: spread,
      });
      features.set("inverse_spread_score", {
        featureId: "inverse_spread_score",
        value: clamp(1 - spread * 100, 0, 1),
      });
    }

    if (Number.isFinite(context.fundingRate)) {
      features.set("funding_rate", {
        featureId: "funding_rate",
        value: context.fundingRate as number,
      });
    }

    if (Number.isFinite(context.volume)) {
      features.set("market_volume", {
        featureId: "market_volume",
        value: context.volume as number,
      });
    }

    if (Number.isFinite(context.openInterest)) {
      features.set("open_interest", {
        featureId: "open_interest",
        value: context.openInterest as number,
      });
    }
  }

  private calculateScoreCard(
    features: ReadonlyMap<string, NumericFeature>,
  ): MarketRegimeScoreCard {
    const trend = this.aggregateSigned(
      features,
      this.options.featureMapping.trendScore,
    );
    const momentum = this.aggregateSigned(
      features,
      this.options.featureMapping.momentumScore,
    );
    const volatility = this.aggregateUnsigned(
      features,
      this.options.featureMapping.volatilityScore,
    );
    const liquidity = this.aggregateUnsigned(
      features,
      this.options.featureMapping.liquidityScore,
    );
    const meanReversion = this.aggregateUnsigned(
      features,
      this.options.featureMapping.meanReversionScore,
    );
    const breakout = this.aggregateUnsigned(
      features,
      this.options.featureMapping.breakoutScore,
    );

    const directionalWeight =
      this.options.weights.trend +
      this.options.weights.momentum;
    const compositeTrend =
      directionalWeight <= SCORE_EPSILON
        ? 0
        : (trend * this.options.weights.trend +
            momentum * this.options.weights.momentum) /
          directionalWeight;

    return Object.freeze({
      trend,
      momentum,
      volatility,
      liquidity,
      meanReversion,
      breakout,
      compositeTrend: clamp(compositeTrend, -1, 1),
    });
  }

  private aggregateSigned(
    features: ReadonlyMap<string, NumericFeature>,
    featureIds: readonly string[],
  ): number {
    const values = featureIds
      .map((featureId) => features.get(featureId)?.value)
      .filter((value): value is number => value !== undefined)
      .map(normalizeSigned);

    if (values.length === 0) {
      return 0;
    }

    return clamp(
      values.reduce((sum, value) => sum + value, 0) /
        values.length,
      -1,
      1,
    );
  }

  private aggregateUnsigned(
    features: ReadonlyMap<string, NumericFeature>,
    featureIds: readonly string[],
  ): number {
    const values = featureIds
      .map((featureId) => features.get(featureId)?.value)
      .filter((value): value is number => value !== undefined)
      .map(normalizeUnsigned);

    if (values.length === 0) {
      return 0;
    }

    return clamp(
      values.reduce((sum, value) => sum + value, 0) /
        values.length,
      0,
      1,
    );
  }

  private calculateCandidates(
    scores: MarketRegimeScoreCard,
  ): readonly ProbabilityCandidate[] {
    const t = this.options.thresholds;
    const direction = scores.compositeTrend;
    const magnitude = Math.abs(direction);
    const candidates: ProbabilityCandidate[] = [];

    const trendRegime = this.directionalRegime(direction);
    const directionalStrength =
      trendRegime === "STRONG_BULL" ||
      trendRegime === "STRONG_BEAR"
        ? magnitude
        : trendRegime === "BULL" || trendRegime === "BEAR"
          ? magnitude * 0.9
          : trendRegime === "WEAK_BULL" ||
              trendRegime === "WEAK_BEAR"
            ? magnitude * 0.8
            : Math.max(0.2, 1 - magnitude);

    candidates.push({
      regime: trendRegime,
      rawScore:
        directionalStrength *
        (this.options.weights.trend +
          this.options.weights.momentum),
    });

    candidates.push({
      regime: "TRENDING",
      rawScore:
        magnitude *
        (this.options.weights.trend +
          this.options.weights.momentum),
    });

    candidates.push({
      regime: "HIGH_VOLATILITY",
      rawScore:
        scores.volatility >= t.highVolatility
          ? scores.volatility *
            this.options.weights.volatility
          : 0,
    });

    candidates.push({
      regime: "LOW_VOLATILITY",
      rawScore:
        scores.volatility <= t.lowVolatility
          ? (1 - scores.volatility) *
            this.options.weights.volatility
          : 0,
    });

    candidates.push({
      regime: "LIQUIDITY_STRESS",
      rawScore:
        scores.liquidity <= t.liquidityStress
          ? (1 - scores.liquidity) *
            this.options.weights.liquidity
          : 0,
    });

    candidates.push({
      regime: "MEAN_REVERTING",
      rawScore:
        scores.meanReversion >= t.meanReversion
          ? scores.meanReversion *
            this.options.weights.meanReversion
          : 0,
    });

    candidates.push({
      regime: "BREAKOUT",
      rawScore:
        scores.breakout >= t.breakout
          ? scores.breakout *
            this.options.weights.breakout
          : 0,
    });

    candidates.push({
      regime: "RANGE",
      rawScore:
        magnitude < t.weakTrend
          ? (1 - magnitude) *
            (1 - scores.breakout) *
            Math.max(scores.meanReversion, 0.25)
          : 0,
    });

    const knownScore = candidates.reduce(
      (sum, candidate) => sum + candidate.rawScore,
      0,
    );

    candidates.push({
      regime: "UNKNOWN",
      rawScore:
        knownScore <= SCORE_EPSILON
          ? 1
          : Math.max(0.01, 0.15 - knownScore * 0.05),
    });

    return Object.freeze(candidates);
  }

  private directionalRegime(
    compositeTrend: number,
  ): MarketRegime {
    const magnitude = Math.abs(compositeTrend);
    const thresholds = this.options.thresholds;

    if (magnitude >= thresholds.strongTrend) {
      return compositeTrend >= 0
        ? "STRONG_BULL"
        : "STRONG_BEAR";
    }

    if (magnitude >= thresholds.trend) {
      return compositeTrend >= 0 ? "BULL" : "BEAR";
    }

    if (magnitude >= thresholds.weakTrend) {
      return compositeTrend >= 0
        ? "WEAK_BULL"
        : "WEAK_BEAR";
    }

    return "RANGE";
  }

  private normalizeProbabilities(
    candidates: readonly ProbabilityCandidate[],
  ): readonly MarketRegimeProbability[] {
    const scoreByRegime = new Map<MarketRegime, number>();

    for (const regime of ALL_REGIMES) {
      scoreByRegime.set(regime, 0);
    }

    for (const candidate of candidates) {
      scoreByRegime.set(
        candidate.regime,
        (scoreByRegime.get(candidate.regime) ?? 0) +
          Math.max(0, candidate.rawScore),
      );
    }

    const total = [...scoreByRegime.values()].reduce(
      (sum, value) => sum + value,
      0,
    );

    if (total <= SCORE_EPSILON) {
      return Object.freeze(
        ALL_REGIMES.map((regime) =>
          Object.freeze({
            regime,
            probability:
              regime === "UNKNOWN" ? 1 : 0,
          }),
        ),
      );
    }

    return Object.freeze(
      [...scoreByRegime.entries()]
        .map(([regime, score]) =>
          Object.freeze({
            regime,
            probability: score / total,
          }),
        )
        .sort((left, right) => {
          if (left.probability !== right.probability) {
            return right.probability - left.probability;
          }

          return left.regime.localeCompare(right.regime);
        }),
    );
  }

  private createSupportingFeatures(
    features: ReadonlyMap<string, NumericFeature>,
    scores: MarketRegimeScoreCard,
  ): readonly AiFeatureContribution[] {
    const contributions: AiFeatureContribution[] = [];
    const configured = new Set<string>([
      ...this.options.featureMapping.trendScore,
      ...this.options.featureMapping.momentumScore,
      ...this.options.featureMapping.volatilityScore,
      ...this.options.featureMapping.liquidityScore,
      ...this.options.featureMapping.meanReversionScore,
      ...this.options.featureMapping.breakoutScore,
    ]);

    for (const featureId of configured) {
      const feature = features.get(featureId);
      if (feature === undefined) {
        continue;
      }

      const contribution = this.featureContribution(
        featureId,
        feature.value,
      );
      contributions.push({
        featureId,
        contribution,
        direction:
          contribution > 0
            ? "POSITIVE"
            : contribution < 0
              ? "NEGATIVE"
              : "NEUTRAL",
        metadata: EMPTY_AI_STRATEGY_METADATA,
      });
    }

    contributions.push(
      {
        featureId: "composite_trend",
        contribution: scores.compositeTrend,
        direction:
          scores.compositeTrend > 0
            ? "POSITIVE"
            : scores.compositeTrend < 0
              ? "NEGATIVE"
              : "NEUTRAL",
        metadata: EMPTY_AI_STRATEGY_METADATA,
      },
      {
        featureId: "composite_volatility",
        contribution: scores.volatility,
        direction: "POSITIVE",
        metadata: EMPTY_AI_STRATEGY_METADATA,
      },
      {
        featureId: "composite_liquidity",
        contribution: scores.liquidity,
        direction: "POSITIVE",
        metadata: EMPTY_AI_STRATEGY_METADATA,
      },
    );

    return Object.freeze(
      contributions
        .sort(
          (left, right) =>
            Math.abs(right.contribution) -
              Math.abs(left.contribution) ||
            left.featureId.localeCompare(right.featureId),
        )
        .map((contribution, index) =>
          cloneContribution({
            ...contribution,
            rank: index + 1,
          }),
        ),
    );
  }

  private featureContribution(
    featureId: string,
    value: number,
  ): number {
    if (
      this.options.featureMapping.volatilityScore.includes(
        featureId,
      ) ||
      this.options.featureMapping.liquidityScore.includes(
        featureId,
      ) ||
      this.options.featureMapping.meanReversionScore.includes(
        featureId,
      ) ||
      this.options.featureMapping.breakoutScore.includes(
        featureId,
      )
    ) {
      return normalizeUnsigned(value);
    }

    return normalizeSigned(value);
  }

  private recordDetection(
    detection: MarketRegimeDetection,
  ): void {
    const key = instrumentKey(
      detection.instrument,
      detection.timeframe,
    );
    const previous = this.latestByInstrument.get(key);

    this.detections.push(detection);
    this.detections.sort(compareDetections);
    this.latestByInstrument.set(key, detection);

    if (
      previous !== undefined &&
      previous.primaryRegime !== detection.primaryRegime
    ) {
      const previousProbability =
        previous.probabilities.find(
          (entry) =>
            entry.regime === detection.primaryRegime,
        )?.probability ?? 0;
      const nextProbability =
        detection.probabilities.find(
          (entry) =>
            entry.regime === detection.primaryRegime,
        )?.probability ?? detection.confidence;
      const probabilityDelta = Math.max(
        0,
        nextProbability - previousProbability,
      );

      const transition = cloneTransition({
        transitionId: this.nextId(
          "regime-transition",
          detection.detectedAt,
        ),
        instrument: detection.instrument,
        timeframe: detection.timeframe,
        detectedAt: detection.detectedAt,
        previousRegime: previous.primaryRegime,
        nextRegime: detection.primaryRegime,
        previousConfidence: previous.confidence,
        nextConfidence: detection.confidence,
        probabilityDelta,
        confirmed:
          detection.confidence >=
            this.options.thresholds
              .transitionMinimumConfidence &&
          probabilityDelta >=
            this.options.thresholds
              .transitionMinimumProbabilityDelta,
        metadata: EMPTY_AI_STRATEGY_METADATA,
      });

      this.transitions.push(transition);
      this.transitions.sort(compareTransitions);
    }

    this.trimHistory();
  }

  private trimHistory(): void {
    while (
      this.detections.length >
      this.options.maximumHistoryEntries
    ) {
      this.detections.shift();
    }

    while (
      this.transitions.length >
      this.options.maximumHistoryEntries
    ) {
      this.transitions.shift();
    }

    this.rebuildLatestIndex();
  }

  private rebuildLatestIndex(): void {
    this.latestByInstrument.clear();

    for (const detection of this.detections) {
      this.latestByInstrument.set(
        instrumentKey(
          detection.instrument,
          detection.timeframe,
        ),
        detection,
      );
    }
  }

  private validateQuery(
    query: MarketRegimeHistoryQuery,
  ): void {
    if (
      query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit <= 0)
    ) {
      throw new RangeError(
        "query.limit must be a positive integer.",
      );
    }

    if (
      query.fromDetectedAt !== undefined &&
      query.toDetectedAt !== undefined &&
      query.fromDetectedAt > query.toDetectedAt
    ) {
      throw new RangeError(
        "query.fromDetectedAt cannot exceed query.toDetectedAt.",
      );
    }

    if (query.asOf !== undefined) {
      assertFiniteNonNegative(query.asOf, "query.asOf");
    }
  }

  private nextId(
    prefix: string,
    timestamp: AiStrategyTimestamp,
  ): string {
    this.sequence += 1;
    return this.options.idFactory(
      prefix,
      timestamp,
      this.sequence,
    );
  }
}

export function createDeterministicMarketRegimeDetector(
  options: MarketRegimeDetectorOptions = {},
): DeterministicMarketRegimeDetector {
  return new DeterministicMarketRegimeDetector(options);
}

export function validateMarketRegimeDetection(
  detection: MarketRegimeDetection,
  validator: AiStrategyContractValidator =
    createAiStrategyContractValidator(),
): readonly AiContractValidationIssue[] {
  return validator.validateRegimeDetection(detection).issues;
}