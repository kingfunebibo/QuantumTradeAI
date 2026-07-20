/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File:
 * src/trading/ai-meta-learning/strategy-feature-extractor.ts
 *
 * Deterministic production-grade strategy feature extraction.
 *
 * Responsibilities:
 * - Transform strategy descriptors, performance observations, risk data, and
 *   market context into immutable learning feature vectors.
 * - Support optional feature inclusion/exclusion filters.
 * - Normalize numeric values deterministically.
 * - Report incomplete observations without mutating caller-owned inputs.
 */

import {
  type ExtractedFeature,
  type FeatureExtractionRequest,
  type FeatureExtractionResult,
  type MarketContextSnapshot,
  type StrategyDescriptor,
  type StrategyFeatureExtractorPort,
  type StrategyFeatureVector,
  type StrategyPerformanceObservation,
  type StrategyRiskObservation,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;

interface NumericFeatureDefinition {
  readonly name: string;
  readonly source: string;
  readonly value: number;
  readonly importanceHint: number;
}

interface ExtractionContext {
  readonly descriptor: StrategyDescriptor;
  readonly observation: StrategyPerformanceObservation;
  readonly risk?: StrategyRiskObservation;
  readonly market?: MarketContextSnapshot;
}

export interface StrategyFeatureExtractorOptions {
  readonly minimumQualityScore?: number;
  readonly includeDescriptorFeatures?: boolean;
  readonly includePerformanceFeatures?: boolean;
  readonly includeRiskFeatures?: boolean;
  readonly includeMarketFeatures?: boolean;
}

export class StrategyFeatureExtractorError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "STRATEGY_FEATURE_EXTRACTOR_ERROR",
  ) {
    super(message);
    this.name = "StrategyFeatureExtractorError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StrategyFeatureExtractor
  implements StrategyFeatureExtractorPort
{
  private readonly minimumQualityScore: number;
  private readonly includeDescriptorFeatures: boolean;
  private readonly includePerformanceFeatures: boolean;
  private readonly includeRiskFeatures: boolean;
  private readonly includeMarketFeatures: boolean;

  public constructor(options: StrategyFeatureExtractorOptions = {}) {
    this.minimumQualityScore = clamp01(
      options.minimumQualityScore ?? 0,
    );
    this.includeDescriptorFeatures =
      options.includeDescriptorFeatures ?? true;
    this.includePerformanceFeatures =
      options.includePerformanceFeatures ?? true;
    this.includeRiskFeatures =
      options.includeRiskFeatures ?? true;
    this.includeMarketFeatures =
      options.includeMarketFeatures ?? true;
  }

  public extract(
    request: FeatureExtractionRequest,
  ): FeatureExtractionResult {
    this.assertRequest(request);

    const descriptorById = new Map(
      request.dataset.descriptors.map((item) => [
        item.strategyId,
        item,
      ]),
    );

    const riskByStrategy = this.indexLatestRiskObservations(
      request.dataset.riskObservations,
    );
    const marketIndex = this.indexMarketContexts(
      request.dataset.marketContexts,
    );

    const featureVectors: StrategyFeatureVector[] = [];
    const rejectedObservationIds: string[] = [];
    const warnings: string[] = [];

    for (const observation of request.dataset.performanceObservations) {
      const descriptor = descriptorById.get(observation.strategyId);

      if (!descriptor) {
        rejectedObservationIds.push(observation.observationId);
        warnings.push(
          `Observation '${observation.observationId}' references unknown strategy '${observation.strategyId}'.`,
        );
        continue;
      }

      const context: ExtractionContext = {
        descriptor,
        observation,
        risk: riskByStrategy.get(observation.strategyId),
        market: this.resolveMarketContext(
          observation,
          marketIndex,
        ),
      };

      const vector = this.extractVector(request, context);

      if (vector.qualityScore < this.minimumQualityScore) {
        rejectedObservationIds.push(observation.observationId);
        warnings.push(
          `Observation '${observation.observationId}' produced feature quality ${vector.qualityScore}, below minimum ${this.minimumQualityScore}.`,
        );
        continue;
      }

      featureVectors.push(vector);
    }

    const sortedVectors = featureVectors.sort((left, right) => {
      if (left.strategyId !== right.strategyId) {
        return left.strategyId.localeCompare(right.strategyId);
      }

      return (left.observationId ?? "").localeCompare(
        right.observationId ?? "",
      );
    });

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.timestamp,
      featureVectors: sortedVectors,
      rejectedObservationIds: rejectedObservationIds.sort(),
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private extractVector(
    request: FeatureExtractionRequest,
    context: ExtractionContext,
  ): StrategyFeatureVector {
    const numericDefinitions: NumericFeatureDefinition[] = [];
    const categoricalFeatures: ExtractedFeature[] = [];
    const booleanFeatures: ExtractedFeature[] = [];
    const missingFeatureNames: string[] = [];

    if (this.includeDescriptorFeatures) {
      this.addDescriptorFeatures(
        context.descriptor,
        numericDefinitions,
        categoricalFeatures,
        booleanFeatures,
      );
    }

    if (this.includePerformanceFeatures) {
      this.addPerformanceFeatures(
        context.observation,
        numericDefinitions,
      );
    }

    if (this.includeRiskFeatures) {
      if (context.risk) {
        this.addRiskFeatures(context.risk, numericDefinitions);
      } else {
        missingFeatureNames.push(
          "risk.riskScore",
          "risk.correlationRisk",
          "risk.liquidityRisk",
          "risk.drawdownRisk",
          "risk.tailRisk",
        );
      }
    }

    if (this.includeMarketFeatures) {
      if (context.market) {
        this.addMarketFeatures(
          context.market,
          numericDefinitions,
          categoricalFeatures,
        );
      } else {
        missingFeatureNames.push(
          "market.regimeConfidence",
          "market.realizedVolatility",
          "market.liquidityScore",
          "market.momentumScore",
          "market.stressScore",
        );
      }
    }

    const allowedNames = request.includedFeatureNames
      ? new Set(request.includedFeatureNames)
      : undefined;
    const excludedNames = new Set(
      request.excludedFeatureNames ?? [],
    );

    const selectedNumeric = numericDefinitions.filter((item) =>
      this.isFeatureSelected(item.name, allowedNames, excludedNames),
    );
    const selectedCategorical = categoricalFeatures.filter((item) =>
      this.isFeatureSelected(item.name, allowedNames, excludedNames),
    );
    const selectedBoolean = booleanFeatures.filter((item) =>
      this.isFeatureSelected(item.name, allowedNames, excludedNames),
    );

    const normalizedNumeric = request.normalize
      ? this.normalizeNumericFeatures(selectedNumeric)
      : selectedNumeric.map((item) =>
          freezeFeature({
            name: item.name,
            valueType: "NUMBER",
            numericValue: round(item.value),
            importanceHint: item.importanceHint,
            source: item.source,
          }),
        );

    const features = [
      ...normalizedNumeric,
      ...selectedCategorical,
      ...selectedBoolean,
    ].sort((left, right) => left.name.localeCompare(right.name));

    const requiredFeatureCount =
      numericDefinitions.length +
      categoricalFeatures.length +
      booleanFeatures.length;
    const availableFeatureCount =
      requiredFeatureCount - missingFeatureNames.length;

    const qualityScore =
      requiredFeatureCount === 0
        ? 0
        : clamp01(availableFeatureCount / requiredFeatureCount);

    return freezeVector({
      featureVectorId: buildFeatureVectorId(
        request.requestId,
        context.observation.observationId,
      ),
      strategyId: context.descriptor.strategyId,
      observationId: context.observation.observationId,
      regime: context.observation.regime,
      generatedAt: request.timestamp,
      features,
      qualityScore: round(qualityScore),
      missingFeatureNames: Array.from(
        new Set(missingFeatureNames),
      ).sort(),
    });
  }

  private addDescriptorFeatures(
    descriptor: StrategyDescriptor,
    numeric: NumericFeatureDefinition[],
    categorical: ExtractedFeature[],
    boolean: ExtractedFeature[],
  ): void {
    numeric.push(
      {
        name: "descriptor.parameterCount",
        source: "strategy-descriptor",
        value: descriptor.parameters.length,
        importanceHint: 0.3,
      },
      {
        name: "descriptor.symbolCount",
        source: "strategy-descriptor",
        value: descriptor.symbols.length,
        importanceHint: 0.2,
      },
      {
        name: "descriptor.timeframeCount",
        source: "strategy-descriptor",
        value: descriptor.timeframes.length,
        importanceHint: 0.2,
      },
      {
        name: "descriptor.supportedRegimeCount",
        source: "strategy-descriptor",
        value: descriptor.supportedRegimes.length,
        importanceHint: 0.4,
      },
      {
        name: "descriptor.mutableParameterRatio",
        source: "strategy-descriptor",
        value: safeDivide(
          descriptor.parameters.filter((item) => item.mutable).length,
          descriptor.parameters.length,
        ),
        importanceHint: 0.5,
      },
    );

    categorical.push(
      freezeFeature({
        name: "descriptor.strategyFamily",
        valueType: "CATEGORY",
        categoryValue: descriptor.strategyFamily,
        source: "strategy-descriptor",
        importanceHint: 0.5,
      }),
      freezeFeature({
        name: "descriptor.lifecycleState",
        valueType: "CATEGORY",
        categoryValue: descriptor.lifecycleState,
        source: "strategy-descriptor",
        importanceHint: 0.6,
      }),
    );

    boolean.push(
      freezeFeature({
        name: "descriptor.isActive",
        valueType: "BOOLEAN",
        booleanValue: descriptor.lifecycleState === "ACTIVE",
        source: "strategy-descriptor",
        importanceHint: 0.5,
      }),
      freezeFeature({
        name: "descriptor.isEvolvable",
        valueType: "BOOLEAN",
        booleanValue: descriptor.parameters.some(
          (item) => item.mutable,
        ),
        source: "strategy-descriptor",
        importanceHint: 0.6,
      }),
    );
  }

  private addPerformanceFeatures(
    observation: StrategyPerformanceObservation,
    numeric: NumericFeatureDefinition[],
  ): void {
    const entries: readonly NumericFeatureDefinition[] = [
      {
        name: "performance.sampleSize",
        source: "performance-observation",
        value: observation.sampleSize,
        importanceHint: 0.8,
      },
      {
        name: "performance.trades",
        source: "performance-observation",
        value: observation.trades,
        importanceHint: 0.7,
      },
      {
        name: "performance.returnRate",
        source: "performance-observation",
        value: observation.returnRate,
        importanceHint: 1,
      },
      {
        name: "performance.volatility",
        source: "performance-observation",
        value: observation.volatility,
        importanceHint: 0.9,
      },
      {
        name: "performance.maximumDrawdown",
        source: "performance-observation",
        value: observation.maximumDrawdown,
        importanceHint: 1,
      },
      {
        name: "performance.averageDrawdown",
        source: "performance-observation",
        value: observation.averageDrawdown,
        importanceHint: 0.8,
      },
      {
        name: "performance.sharpeRatio",
        source: "performance-observation",
        value: observation.sharpeRatio,
        importanceHint: 1,
      },
      {
        name: "performance.sortinoRatio",
        source: "performance-observation",
        value: observation.sortinoRatio,
        importanceHint: 1,
      },
      {
        name: "performance.calmarRatio",
        source: "performance-observation",
        value: observation.calmarRatio,
        importanceHint: 0.9,
      },
      {
        name: "performance.profitFactor",
        source: "performance-observation",
        value: observation.profitFactor,
        importanceHint: 0.9,
      },
      {
        name: "performance.winRate",
        source: "performance-observation",
        value: observation.winRate,
        importanceHint: 0.8,
      },
      {
        name: "performance.expectancy",
        source: "performance-observation",
        value: observation.expectancy,
        importanceHint: 0.9,
      },
      {
        name: "performance.averageTradeReturn",
        source: "performance-observation",
        value: observation.averageTradeReturn,
        importanceHint: 0.8,
      },
      {
        name: "performance.tailLoss",
        source: "performance-observation",
        value: observation.tailLoss,
        importanceHint: 0.9,
      },
      {
        name: "performance.valueAtRisk",
        source: "performance-observation",
        value: observation.valueAtRisk,
        importanceHint: 0.8,
      },
      {
        name: "performance.conditionalValueAtRisk",
        source: "performance-observation",
        value: observation.conditionalValueAtRisk,
        importanceHint: 0.9,
      },
      {
        name: "performance.turnover",
        source: "performance-observation",
        value: observation.turnover,
        importanceHint: 0.5,
      },
      {
        name: "performance.executionCost",
        source: "performance-observation",
        value: observation.executionCost,
        importanceHint: 0.7,
      },
      {
        name: "performance.slippageCost",
        source: "performance-observation",
        value: observation.slippageCost,
        importanceHint: 0.7,
      },
      {
        name: "performance.profitableTradeRatio",
        source: "performance-observation",
        value: safeDivide(
          observation.winningTrades,
          observation.trades,
        ),
        importanceHint: 0.8,
      },
      {
        name: "performance.lossTradeRatio",
        source: "performance-observation",
        value: safeDivide(
          observation.losingTrades,
          observation.trades,
        ),
        importanceHint: 0.7,
      },
    ];

    numeric.push(...entries);
  }

  private addRiskFeatures(
    observation: StrategyRiskObservation,
    numeric: NumericFeatureDefinition[],
  ): void {
    numeric.push(
      {
        name: "risk.riskScore",
        source: "risk-observation",
        value: observation.riskScore,
        importanceHint: 1,
      },
      {
        name: "risk.concentrationRisk",
        source: "risk-observation",
        value: observation.concentrationRisk,
        importanceHint: 0.8,
      },
      {
        name: "risk.correlationRisk",
        source: "risk-observation",
        value: observation.correlationRisk,
        importanceHint: 0.9,
      },
      {
        name: "risk.liquidityRisk",
        source: "risk-observation",
        value: observation.liquidityRisk,
        importanceHint: 0.9,
      },
      {
        name: "risk.leverageRisk",
        source: "risk-observation",
        value: observation.leverageRisk,
        importanceHint: 0.9,
      },
      {
        name: "risk.volatilityRisk",
        source: "risk-observation",
        value: observation.volatilityRisk,
        importanceHint: 0.8,
      },
      {
        name: "risk.drawdownRisk",
        source: "risk-observation",
        value: observation.drawdownRisk,
        importanceHint: 1,
      },
      {
        name: "risk.tailRisk",
        source: "risk-observation",
        value: observation.tailRisk,
        importanceHint: 1,
      },
      {
        name: "risk.operationalRisk",
        source: "risk-observation",
        value: observation.operationalRisk,
        importanceHint: 0.6,
      },
      {
        name: "risk.remainingRiskBudget",
        source: "risk-observation",
        value: observation.remainingRiskBudget,
        importanceHint: 0.7,
      },
      {
        name: "risk.breachedLimitCount",
        source: "risk-observation",
        value: observation.breachedLimits.length,
        importanceHint: 0.8,
      },
    );
  }

  private addMarketFeatures(
    snapshot: MarketContextSnapshot,
    numeric: NumericFeatureDefinition[],
    categorical: ExtractedFeature[],
  ): void {
    numeric.push(
      {
        name: "market.regimeConfidence",
        source: "market-context",
        value: snapshot.regimeConfidence,
        importanceHint: 0.9,
      },
      {
        name: "market.trendStrength",
        source: "market-context",
        value: snapshot.trendStrength,
        importanceHint: 0.8,
      },
      {
        name: "market.realizedVolatility",
        source: "market-context",
        value: snapshot.realizedVolatility,
        importanceHint: 0.9,
      },
      {
        name: "market.impliedVolatility",
        source: "market-context",
        value: snapshot.impliedVolatility ?? 0,
        importanceHint: 0.7,
      },
      {
        name: "market.liquidityScore",
        source: "market-context",
        value: snapshot.liquidityScore,
        importanceHint: 0.8,
      },
      {
        name: "market.spreadRate",
        source: "market-context",
        value: snapshot.spreadRate,
        importanceHint: 0.7,
      },
      {
        name: "market.marketDepthScore",
        source: "market-context",
        value: snapshot.marketDepthScore,
        importanceHint: 0.7,
      },
      {
        name: "market.momentumScore",
        source: "market-context",
        value: snapshot.momentumScore,
        importanceHint: 0.8,
      },
      {
        name: "market.meanReversionScore",
        source: "market-context",
        value: snapshot.meanReversionScore,
        importanceHint: 0.8,
      },
      {
        name: "market.riskOnScore",
        source: "market-context",
        value: snapshot.riskOnScore,
        importanceHint: 0.8,
      },
      {
        name: "market.stressScore",
        source: "market-context",
        value: snapshot.stressScore,
        importanceHint: 0.9,
      },
    );

    for (const [name, value] of Object.entries(snapshot.features)) {
      numeric.push({
        name: `market.custom.${name}`,
        source: "market-context",
        value,
        importanceHint: 0.5,
      });
    }

    categorical.push(
      freezeFeature({
        name: "market.regime",
        valueType: "CATEGORY",
        categoryValue: snapshot.regime,
        source: "market-context",
        importanceHint: 1,
      }),
      freezeFeature({
        name: "market.symbol",
        valueType: "CATEGORY",
        categoryValue: snapshot.symbol,
        source: "market-context",
        importanceHint: 0.3,
      }),
      freezeFeature({
        name: "market.timeframe",
        valueType: "CATEGORY",
        categoryValue: snapshot.timeframe,
        source: "market-context",
        importanceHint: 0.3,
      }),
    );
  }

  private normalizeNumericFeatures(
    definitions: readonly NumericFeatureDefinition[],
  ): readonly ExtractedFeature[] {
    const grouped = new Map<string, NumericFeatureDefinition[]>();

    for (const item of definitions) {
      const existing = grouped.get(item.source) ?? [];
      existing.push(item);
      grouped.set(item.source, existing);
    }

    const features: ExtractedFeature[] = [];

    for (const group of grouped.values()) {
      const values = group.map((item) => item.value);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const range = maximum - minimum;

      for (const item of group) {
        const normalizedValue =
          Math.abs(range) <= EPSILON
            ? normalizeStandaloneValue(item.value)
            : clamp01((item.value - minimum) / range);

        features.push(
          freezeFeature({
            name: item.name,
            valueType: "NUMBER",
            numericValue: round(item.value),
            normalizedValue: round(normalizedValue),
            importanceHint: item.importanceHint,
            source: item.source,
          }),
        );
      }
    }

    return Object.freeze(
      features.sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    );
  }

  private indexLatestRiskObservations(
    observations: readonly StrategyRiskObservation[],
  ): ReadonlyMap<string, StrategyRiskObservation> {
    const index = new Map<string, StrategyRiskObservation>();

    for (const observation of observations) {
      const existing = index.get(observation.strategyId);

      if (
        !existing ||
        Date.parse(observation.timestamp) >
          Date.parse(existing.timestamp)
      ) {
        index.set(observation.strategyId, observation);
      }
    }

    return index;
  }

  private indexMarketContexts(
    snapshots: readonly MarketContextSnapshot[],
  ): ReadonlyMap<string, readonly MarketContextSnapshot[]> {
    const mutable = new Map<string, MarketContextSnapshot[]>();

    for (const snapshot of snapshots) {
      const key = marketKey(snapshot.symbol, snapshot.timeframe);
      const existing = mutable.get(key) ?? [];
      existing.push(snapshot);
      mutable.set(key, existing);
    }

    const result = new Map<string, readonly MarketContextSnapshot[]>();

    for (const [key, values] of mutable.entries()) {
      result.set(
        key,
        Object.freeze(
          [...values].sort(
            (left, right) =>
              Date.parse(left.timestamp) -
              Date.parse(right.timestamp),
          ),
        ),
      );
    }

    return result;
  }

  private resolveMarketContext(
    observation: StrategyPerformanceObservation,
    index: ReadonlyMap<string, readonly MarketContextSnapshot[]>,
  ): MarketContextSnapshot | undefined {
    if (!observation.symbol || !observation.timeframe) {
      return undefined;
    }

    const candidates = index.get(
      marketKey(observation.symbol, observation.timeframe),
    );

    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    const observationTime = Date.parse(observation.endedAt);

    let selected: MarketContextSnapshot | undefined;

    for (const candidate of candidates) {
      const candidateTime = Date.parse(candidate.timestamp);

      if (
        Number.isFinite(candidateTime) &&
        candidateTime <= observationTime
      ) {
        selected = candidate;
      }
    }

    return selected ?? candidates[candidates.length - 1];
  }

  private isFeatureSelected(
    name: string,
    included: ReadonlySet<string> | undefined,
    excluded: ReadonlySet<string>,
  ): boolean {
    if (excluded.has(name)) {
      return false;
    }

    return included ? included.has(name) : true;
  }

  private assertRequest(request: FeatureExtractionRequest): void {
    if (request === null || typeof request !== "object") {
      throw new StrategyFeatureExtractorError(
        "Feature extraction request must be an object.",
        "INVALID_FEATURE_EXTRACTION_REQUEST",
      );
    }

    if (
      typeof request.requestId !== "string" ||
      request.requestId.trim().length === 0
    ) {
      throw new StrategyFeatureExtractorError(
        "requestId must be a non-empty string.",
        "INVALID_FEATURE_EXTRACTION_REQUEST_ID",
      );
    }

    if (
      typeof request.timestamp !== "string" ||
      request.timestamp.trim().length === 0
    ) {
      throw new StrategyFeatureExtractorError(
        "timestamp must be a non-empty string.",
        "INVALID_FEATURE_EXTRACTION_TIMESTAMP",
      );
    }

    if (
      request.dataset === null ||
      typeof request.dataset !== "object"
    ) {
      throw new StrategyFeatureExtractorError(
        "dataset must be an object.",
        "INVALID_FEATURE_EXTRACTION_DATASET",
      );
    }

    if (!Array.isArray(request.dataset.descriptors)) {
      throw new StrategyFeatureExtractorError(
        "dataset.descriptors must be an array.",
        "INVALID_FEATURE_EXTRACTION_DESCRIPTORS",
      );
    }

    if (
      !Array.isArray(request.dataset.performanceObservations)
    ) {
      throw new StrategyFeatureExtractorError(
        "dataset.performanceObservations must be an array.",
        "INVALID_FEATURE_EXTRACTION_OBSERVATIONS",
      );
    }

    if (!Array.isArray(request.dataset.riskObservations)) {
      throw new StrategyFeatureExtractorError(
        "dataset.riskObservations must be an array.",
        "INVALID_FEATURE_EXTRACTION_RISK_OBSERVATIONS",
      );
    }

    if (!Array.isArray(request.dataset.marketContexts)) {
      throw new StrategyFeatureExtractorError(
        "dataset.marketContexts must be an array.",
        "INVALID_FEATURE_EXTRACTION_MARKET_CONTEXTS",
      );
    }

    if (typeof request.normalize !== "boolean") {
      throw new StrategyFeatureExtractorError(
        "normalize must be a boolean.",
        "INVALID_FEATURE_EXTRACTION_NORMALIZE",
      );
    }
  }
}

export function createStrategyFeatureExtractor(
  options: StrategyFeatureExtractorOptions = {},
): StrategyFeatureExtractor {
  return new StrategyFeatureExtractor(options);
}

function buildFeatureVectorId(
  requestId: string,
  observationId: string,
): string {
  return `${requestId}:feature-vector:${observationId}`;
}

function marketKey(symbol: string, timeframe: string): string {
  return `${symbol.trim().toUpperCase()}::${timeframe.trim().toUpperCase()}`;
}

function freezeFeature(
  feature: ExtractedFeature,
): ExtractedFeature {
  return Object.freeze({
    ...feature,
    ...(feature.vectorValue
      ? { vectorValue: Object.freeze([...feature.vectorValue]) }
      : {}),
  });
}

function freezeVector(
  vector: StrategyFeatureVector,
): StrategyFeatureVector {
  return Object.freeze({
    ...vector,
    features: Object.freeze([...vector.features]),
    missingFeatureNames: Object.freeze([
      ...vector.missingFeatureNames,
    ]),
  });
}

function freezeResult(
  result: FeatureExtractionResult,
): FeatureExtractionResult {
  return Object.freeze({
    ...result,
    featureVectors: Object.freeze([...result.featureVectors]),
    rejectedObservationIds: Object.freeze([
      ...result.rejectedObservationIds,
    ]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function normalizeStandaloneValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return clamp01((Math.tanh(value) + 1) / 2);
}

function safeDivide(
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    Math.abs(denominator) <= EPSILON
  ) {
    return 0;
  }

  return numerator / denominator;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function round(value: number, precision = 12): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}