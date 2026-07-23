/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/market-correlation-intelligence-engine.ts
 *
 * Deterministic and immutable cross-market correlation intelligence.
 */

import {
  AnomalySeverity,
  ConfidenceScore,
  CorrelationBreakdown,
  CorrelationCluster,
  CorrelationCoefficient,
  CorrelationIntelligenceConfiguration,
  CorrelationMatrixId,
  CorrelationPair,
  CorrelationRegime,
  MarketCandle,
  MarketCorrelationIntelligence,
  MarketCorrelationIntelligenceEngine,
  MarketIntelligenceInput,
  NormalizedScore,
  ReferenceMarketInput,
  SymbolId,
  TimeRange,
  TimestampMs,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;

interface ReturnObservation {
  readonly closeTimeMs: number;
  readonly returnValue: number;
}

interface AlignedSeries {
  readonly left: readonly number[];
  readonly right: readonly number[];
}

interface CorrelationEstimate {
  readonly coefficient: number;
  readonly sampleSize: number;
  readonly significanceScore: number;
}

interface PairComputation {
  readonly pair: CorrelationPair;
  readonly historicalCoefficient: number;
  readonly currentCoefficient: number;
  readonly absoluteCoefficient: number;
}

interface ClusterAccumulator {
  readonly symbols: Set<SymbolId>;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  if (value instanceof Set || value instanceof Map) {
    return Object.freeze(value);
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

function averageQuality(
  assessment: ReferenceMarketInput["qualityAssessment"] |
    MarketIntelligenceInput["qualityAssessment"],
): number {
  return clamp(
    (
      Number(assessment.completenessScore) +
      Number(assessment.freshnessScore) +
      Number(assessment.consistencyScore) +
      Number(assessment.orderingScore)
    ) / 4,
    0,
    1,
  );
}

function sortedClosedCandles(
  candles: readonly MarketCandle[],
): readonly MarketCandle[] {
  return [...candles]
    .filter(
      (candle) =>
        candle.isClosed &&
        Number.isFinite(Number(candle.close)) &&
        Number(candle.close) > 0,
    )
    .sort(
      (left, right) =>
        Number(left.closeTimeMs) - Number(right.closeTimeMs) ||
        Number(left.openTimeMs) - Number(right.openTimeMs),
    );
}

function calculateReturns(
  candles: readonly MarketCandle[],
): readonly ReturnObservation[] {
  const sorted = sortedClosedCandles(candles);
  const observations: ReturnObservation[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Number(sorted[index - 1].close);
    const current = Number(sorted[index].close);

    if (
      previous <= 0 ||
      current <= 0 ||
      !Number.isFinite(previous) ||
      !Number.isFinite(current)
    ) {
      continue;
    }

    const returnValue = Math.log(current / previous);

    if (!Number.isFinite(returnValue)) {
      continue;
    }

    observations.push(
      deepFreeze({
        closeTimeMs: Number(sorted[index].closeTimeMs),
        returnValue: round(returnValue),
      }),
    );
  }

  return deepFreeze(observations);
}

function alignReturns(
  left: readonly ReturnObservation[],
  right: readonly ReturnObservation[],
): AlignedSeries {
  const rightByTime = new Map<number, number>(
    right.map((observation) => [
      observation.closeTimeMs,
      observation.returnValue,
    ]),
  );

  const alignedLeft: number[] = [];
  const alignedRight: number[] = [];

  for (const observation of left) {
    const rightValue = rightByTime.get(observation.closeTimeMs);

    if (rightValue === undefined) {
      continue;
    }

    alignedLeft.push(observation.returnValue);
    alignedRight.push(rightValue);
  }

  return deepFreeze({
    left: deepFreeze(alignedLeft),
    right: deepFreeze(alignedRight),
  });
}

function pearsonCorrelation(
  left: readonly number[],
  right: readonly number[],
): number {
  const count = Math.min(left.length, right.length);

  if (count < 2) {
    return 0;
  }

  const leftValues = left.slice(0, count);
  const rightValues = right.slice(0, count);
  const leftMean = mean(leftValues);
  const rightMean = mean(rightValues);

  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < count; index += 1) {
    const leftDeviation = leftValues[index] - leftMean;
    const rightDeviation = rightValues[index] - rightMean;

    covariance += leftDeviation * rightDeviation;
    leftVariance += leftDeviation * leftDeviation;
    rightVariance += rightDeviation * rightDeviation;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);

  if (denominator <= EPSILON) {
    return 0;
  }

  return clamp(covariance / denominator, -1, 1);
}

function significanceScore(
  coefficient: number,
  sampleSize: number,
  minimumObservations: number,
): number {
  if (sampleSize < 3) {
    return 0;
  }

  const sampleCoverage = clamp(
    safeDivide(sampleSize, Math.max(minimumObservations, 1)),
    0,
    1,
  );
  const magnitude = Math.abs(coefficient);
  const adjustedMagnitude = clamp(
    magnitude * Math.sqrt(Math.max(0, sampleSize - 2)),
    0,
    1,
  );

  return clamp(
    sampleCoverage * 0.55 + adjustedMagnitude * 0.45,
    0,
    1,
  );
}

function estimateCorrelation(
  series: AlignedSeries,
  minimumObservations: number,
): CorrelationEstimate {
  const sampleSize = Math.min(
    series.left.length,
    series.right.length,
  );

  if (sampleSize < minimumObservations) {
    return deepFreeze({
      coefficient: 0,
      sampleSize,
      significanceScore: 0,
    });
  }

  const coefficient = pearsonCorrelation(
    series.left,
    series.right,
  );

  return deepFreeze({
    coefficient: round(coefficient),
    sampleSize,
    significanceScore: round(
      significanceScore(
        coefficient,
        sampleSize,
        minimumObservations,
      ),
    ),
  });
}

function rollingCorrelation(
  series: AlignedSeries,
  windowSize: number,
  minimumObservations: number,
): CorrelationEstimate {
  const count = Math.min(
    series.left.length,
    series.right.length,
  );
  const effectiveWindow = Math.min(windowSize, count);

  if (effectiveWindow < minimumObservations) {
    return deepFreeze({
      coefficient: 0,
      sampleSize: effectiveWindow,
      significanceScore: 0,
    });
  }

  return estimateCorrelation(
    deepFreeze({
      left: series.left.slice(count - effectiveWindow),
      right: series.right.slice(count - effectiveWindow),
    }),
    minimumObservations,
  );
}

function correlationStability(
  series: AlignedSeries,
  rollingWindowSize: number,
  minimumObservations: number,
): number {
  const count = Math.min(
    series.left.length,
    series.right.length,
  );

  if (count < minimumObservations) {
    return 0;
  }

  const windowSize = Math.max(
    minimumObservations,
    Math.min(rollingWindowSize, count),
  );

  if (count < windowSize * 2) {
    const full = pearsonCorrelation(
      series.left,
      series.right,
    );
    const rolling = pearsonCorrelation(
      series.left.slice(count - windowSize),
      series.right.slice(count - windowSize),
    );

    return clamp(1 - Math.abs(full - rolling) / 2, 0, 1);
  }

  const coefficients: number[] = [];

  for (
    let end = windowSize;
    end <= count;
    end += windowSize
  ) {
    const start = end - windowSize;
    coefficients.push(
      pearsonCorrelation(
        series.left.slice(start, end),
        series.right.slice(start, end),
      ),
    );
  }

  if (coefficients.length < 2) {
    return 1;
  }

  return clamp(
    1 - standardDeviation(coefficients) / 1.25,
    0,
    1,
  );
}

function classifyRegime(
  coefficient: number,
  stability: number,
): CorrelationRegime {
  if (stability < 0.35) {
    return CorrelationRegime.UNSTABLE;
  }

  if (coefficient <= -0.75) {
    return CorrelationRegime.STRONGLY_NEGATIVE;
  }

  if (coefficient <= -0.45) {
    return CorrelationRegime.NEGATIVE;
  }

  if (coefficient <= -0.15) {
    return CorrelationRegime.WEAKLY_NEGATIVE;
  }

  if (coefficient < 0.15) {
    return CorrelationRegime.UNCORRELATED;
  }

  if (coefficient < 0.45) {
    return CorrelationRegime.WEAKLY_POSITIVE;
  }

  if (coefficient < 0.75) {
    return CorrelationRegime.POSITIVE;
  }

  return CorrelationRegime.STRONGLY_POSITIVE;
}

function breakdownSeverity(
  deviation: number,
  threshold: number,
): AnomalySeverity {
  const ratio = safeDivide(
    deviation,
    Math.max(threshold, EPSILON),
  );

  if (ratio >= 4) {
    return AnomalySeverity.CRITICAL;
  }

  if (ratio >= 3) {
    return AnomalySeverity.HIGH;
  }

  if (ratio >= 2) {
    return AnomalySeverity.MODERATE;
  }

  if (ratio >= 1) {
    return AnomalySeverity.LOW;
  }

  return AnomalySeverity.INFORMATIONAL;
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

function matrixId(
  primary: MarketIntelligenceInput,
  universe: readonly ReferenceMarketInput[],
  configuration: CorrelationIntelligenceConfiguration,
): CorrelationMatrixId {
  const symbols = universe
    .map((reference) => String(reference.market.symbol))
    .sort()
    .join("|");

  const seed = [
    String(primary.market.symbol),
    symbols,
    Number(primary.observationWindow.startTimeMs),
    Number(primary.observationWindow.endTimeMs),
    configuration.minimumObservations,
    configuration.rollingWindowSize,
    String(configuration.modelVersion),
  ].join(":");

  return `correlation-matrix-${deterministicHash(
    seed,
  )}` as CorrelationMatrixId;
}

function pairKey(
  left: SymbolId,
  right: SymbolId,
): string {
  return [String(left), String(right)].sort().join("::");
}

function normalizeUniverse(
  primary: MarketIntelligenceInput,
  universe: readonly ReferenceMarketInput[],
): readonly ReferenceMarketInput[] {
  const primarySymbol = String(primary.market.symbol);
  const bySymbol = new Map<string, ReferenceMarketInput>();

  for (const reference of universe) {
    const symbol = String(reference.market.symbol);

    if (symbol === primarySymbol || bySymbol.has(symbol)) {
      continue;
    }

    bySymbol.set(symbol, reference);
  }

  return deepFreeze(
    [...bySymbol.values()].sort((left, right) =>
      String(left.market.symbol).localeCompare(
        String(right.market.symbol),
      ),
    ),
  );
}

function computePair(
  primary: MarketIntelligenceInput,
  reference: ReferenceMarketInput,
  primaryReturns: readonly ReturnObservation[],
  configuration: CorrelationIntelligenceConfiguration,
): PairComputation {
  const referenceReturns = calculateReturns(reference.candles);
  const aligned = alignReturns(primaryReturns, referenceReturns);
  const historical = estimateCorrelation(
    aligned,
    configuration.minimumObservations,
  );
  const rolling = rollingCorrelation(
    aligned,
    configuration.rollingWindowSize,
    configuration.minimumObservations,
  );
  const stability = correlationStability(
    aligned,
    configuration.rollingWindowSize,
    configuration.minimumObservations,
  );
  const effectiveCoefficient =
    rolling.sampleSize >= configuration.minimumObservations
      ? rolling.coefficient
      : historical.coefficient;
  const significance = Math.min(
    historical.significanceScore,
    rolling.sampleSize >= configuration.minimumObservations
      ? rolling.significanceScore
      : historical.significanceScore,
  );

  const pair: CorrelationPair = deepFreeze({
    leftSymbol: primary.market.symbol,
    rightSymbol: reference.market.symbol,
    coefficient:
      historical.coefficient as CorrelationCoefficient,
    rollingCoefficient:
      rolling.sampleSize >= configuration.minimumObservations
        ? (rolling.coefficient as CorrelationCoefficient)
        : undefined,
    regime: classifyRegime(effectiveCoefficient, stability),
    stabilityScore: round(stability) as NormalizedScore,
    significanceScore:
      round(significance) as NormalizedScore,
    sampleSize: historical.sampleSize,
  });

  return deepFreeze({
    pair,
    historicalCoefficient: historical.coefficient,
    currentCoefficient: effectiveCoefficient,
    absoluteCoefficient: Math.abs(effectiveCoefficient),
  });
}

function buildBreakdowns(
  computations: readonly PairComputation[],
  primary: MarketIntelligenceInput,
  configuration: CorrelationIntelligenceConfiguration,
): readonly CorrelationBreakdown[] {
  return deepFreeze(
    computations
      .filter(
        ({ pair, historicalCoefficient, currentCoefficient }) =>
          pair.sampleSize >= configuration.minimumObservations &&
          pair.rollingCoefficient !== undefined &&
          Math.abs(
            currentCoefficient - historicalCoefficient,
          ) >= configuration.breakdownDeviationThreshold,
      )
      .map(
        ({
          pair,
          historicalCoefficient,
          currentCoefficient,
        }): CorrelationBreakdown => {
          const deviation = Math.abs(
            currentCoefficient - historicalCoefficient,
          );

          return deepFreeze({
            leftSymbol: pair.leftSymbol,
            rightSymbol: pair.rightSymbol,
            historicalCorrelation:
              round(
                historicalCoefficient,
              ) as CorrelationCoefficient,
            currentCorrelation:
              round(currentCoefficient) as CorrelationCoefficient,
            deviation: round(deviation),
            severity: breakdownSeverity(
              deviation,
              configuration.breakdownDeviationThreshold,
            ),
            detectedAtMs: primary.analysisTimeMs,
          });
        },
      )
      .sort(
        (left, right) =>
          right.deviation - left.deviation ||
          String(left.rightSymbol).localeCompare(
            String(right.rightSymbol),
          ),
      ),
  );
}

function connectedComponents(
  symbols: readonly SymbolId[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): readonly (readonly SymbolId[])[] {
  const symbolByText = new Map(
    symbols.map((symbol) => [String(symbol), symbol]),
  );
  const visited = new Set<string>();
  const components: SymbolId[][] = [];

  for (const symbol of [...symbols].sort((left, right) =>
    String(left).localeCompare(String(right)),
  )) {
    const key = String(symbol);

    if (visited.has(key)) {
      continue;
    }

    const stack = [key];
    const component: SymbolId[] = [];
    visited.add(key);

    while (stack.length > 0) {
      const current = stack.pop();

      if (current === undefined) {
        continue;
      }

      const typed = symbolByText.get(current);

      if (typed !== undefined) {
        component.push(typed);
      }

      const neighbours = [
        ...(adjacency.get(current) ?? new Set<string>()),
      ].sort().reverse();

      for (const neighbour of neighbours) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
    }

    if (component.length >= 2) {
      components.push(
        component.sort((left, right) =>
          String(left).localeCompare(String(right)),
        ),
      );
    }
  }

  return deepFreeze(components);
}

function buildClusters(
  primary: MarketIntelligenceInput,
  computations: readonly PairComputation[],
  configuration: CorrelationIntelligenceConfiguration,
): readonly CorrelationCluster[] {
  const qualifying = computations.filter(
    ({ pair, currentCoefficient }) =>
      pair.significanceScore >=
        configuration.significanceThreshold &&
      currentCoefficient >= Number(configuration.clusterThreshold),
  );

  if (qualifying.length === 0) {
    return deepFreeze([]);
  }

  const primarySymbol = primary.market.symbol;
  const allSymbols = new Set<SymbolId>([primarySymbol]);
  const adjacency = new Map<string, Set<string>>();

  const connect = (left: SymbolId, right: SymbolId): void => {
    const leftKey = String(left);
    const rightKey = String(right);

    const leftSet = adjacency.get(leftKey) ?? new Set<string>();
    const rightSet = adjacency.get(rightKey) ?? new Set<string>();

    leftSet.add(rightKey);
    rightSet.add(leftKey);

    adjacency.set(leftKey, leftSet);
    adjacency.set(rightKey, rightSet);
  };

  for (const computation of qualifying) {
    allSymbols.add(computation.pair.rightSymbol);
    connect(
      computation.pair.leftSymbol,
      computation.pair.rightSymbol,
    );
  }

  const coefficientByPair = new Map<string, number>();

  for (const computation of computations) {
    coefficientByPair.set(
      pairKey(
        computation.pair.leftSymbol,
        computation.pair.rightSymbol,
      ),
      computation.currentCoefficient,
    );
  }

  return deepFreeze(
    connectedComponents([...allSymbols], adjacency).map(
      (symbols, index): CorrelationCluster => {
        const correlations: number[] = [];

        for (
          let leftIndex = 0;
          leftIndex < symbols.length;
          leftIndex += 1
        ) {
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < symbols.length;
            rightIndex += 1
          ) {
            const coefficient = coefficientByPair.get(
              pairKey(
                symbols[leftIndex],
                symbols[rightIndex],
              ),
            );

            if (coefficient !== undefined) {
              correlations.push(coefficient);
            }
          }
        }

        const averageInternalCorrelation =
          correlations.length === 0
            ? Number(configuration.clusterThreshold)
            : mean(correlations);
        const sizeScore = clamp(symbols.length / 8, 0, 1);
        const systemicImportance = clamp(
          Math.abs(averageInternalCorrelation) * 0.7 +
            sizeScore * 0.3,
          0,
          1,
        );
        const clusterSeed = symbols
          .map(String)
          .sort()
          .join("|");

        return deepFreeze({
          clusterId: `correlation-cluster-${index + 1}-${deterministicHash(
            clusterSeed,
          ).slice(0, 8)}`,
          symbols: deepFreeze([...symbols]),
          averageInternalCorrelation:
            round(
              averageInternalCorrelation,
            ) as CorrelationCoefficient,
          systemicImportanceScore:
            round(systemicImportance) as NormalizedScore,
          description:
            `Cluster of ${symbols.length} markets with average internal correlation ${round(
              averageInternalCorrelation,
            )}.`,
        });
      },
    ),
  );
}

function aggregateScores(
  computations: readonly PairComputation[],
  breakdowns: readonly CorrelationBreakdown[],
  primary: MarketIntelligenceInput,
  universe: readonly ReferenceMarketInput[],
  configuration: CorrelationIntelligenceConfiguration,
): Readonly<{
  averageMarketCorrelation: number;
  concentrationScore: number;
  diversificationScore: number;
  systemicRiskScore: number;
  confidence: number;
}> {
  const significant = computations.filter(
    ({ pair }) =>
      Number(pair.significanceScore) >=
      Number(configuration.significanceThreshold),
  );
  const usable =
    significant.length > 0 ? significant : computations;

  const averageMarketCorrelation =
    usable.length === 0
      ? 0
      : mean(
          usable.map(
            (computation) => computation.currentCoefficient,
          ),
        );
  const averageAbsoluteCorrelation =
    usable.length === 0
      ? 0
      : mean(
          usable.map(
            (computation) => computation.absoluteCoefficient,
          ),
        );
  const positiveConcentration =
    usable.length === 0
      ? 0
      : mean(
          usable.map((computation) =>
            Math.max(0, computation.currentCoefficient),
          ),
        );

  const concentrationScore = clamp(
    positiveConcentration * 0.75 +
      averageAbsoluteCorrelation * 0.25,
    0,
    1,
  );
  const diversificationScore = clamp(
    1 - averageAbsoluteCorrelation,
    0,
    1,
  );
  const criticality = breakdowns.reduce(
    (total, breakdown) => {
      switch (breakdown.severity) {
        case AnomalySeverity.CRITICAL:
          return total + 1;
        case AnomalySeverity.HIGH:
          return total + 0.75;
        case AnomalySeverity.MODERATE:
          return total + 0.5;
        case AnomalySeverity.LOW:
          return total + 0.25;
        default:
          return total + 0.1;
      }
    },
    0,
  );
  const breakdownRisk = clamp(
    safeDivide(
      criticality,
      Math.max(computations.length, 1),
    ),
    0,
    1,
  );
  const systemicRiskScore = clamp(
    concentrationScore * 0.65 + breakdownRisk * 0.35,
    0,
    1,
  );

  const observationCoverage =
    computations.length === 0
      ? 0
      : mean(
          computations.map(({ pair }) =>
            clamp(
              safeDivide(
                pair.sampleSize,
                configuration.minimumObservations,
              ),
              0,
              1,
            ),
          ),
        );
  const significanceCoverage =
    computations.length === 0
      ? 0
      : mean(
          computations.map(({ pair }) =>
            Number(pair.significanceScore),
          ),
        );
  const universeCoverage = clamp(
    safeDivide(computations.length, universe.length),
    0,
    1,
  );
  const qualityValues = [
    averageQuality(primary.qualityAssessment),
    ...universe.map((reference) =>
      averageQuality(reference.qualityAssessment),
    ),
  ];
  const dataQuality = mean(qualityValues);

  const confidence = clamp(
    observationCoverage * 0.3 +
      significanceCoverage * 0.25 +
      universeCoverage * 0.15 +
      dataQuality * 0.3,
    0,
    1,
  );

  return deepFreeze({
    averageMarketCorrelation: round(
      averageMarketCorrelation,
    ),
    concentrationScore: round(concentrationScore),
    diversificationScore: round(diversificationScore),
    systemicRiskScore: round(systemicRiskScore),
    confidence: round(confidence),
  });
}

function validateConfiguration(
  configuration: CorrelationIntelligenceConfiguration,
): void {
  if (
    !Number.isSafeInteger(configuration.minimumObservations) ||
    configuration.minimumObservations <= 1
  ) {
    throw new Error(
      "Correlation minimumObservations must be a safe integer greater than one.",
    );
  }

  if (
    !Number.isSafeInteger(configuration.rollingWindowSize) ||
    configuration.rollingWindowSize <= 1
  ) {
    throw new Error(
      "Correlation rollingWindowSize must be a safe integer greater than one.",
    );
  }

  if (
    configuration.rollingWindowSize <
    configuration.minimumObservations
  ) {
    throw new Error(
      "Correlation rollingWindowSize cannot be smaller than minimumObservations.",
    );
  }

  if (
    !Number.isFinite(
      configuration.breakdownDeviationThreshold,
    ) ||
    configuration.breakdownDeviationThreshold < 0
  ) {
    throw new Error(
      "Correlation breakdownDeviationThreshold must be non-negative.",
    );
  }

  if (
    Number(configuration.clusterThreshold) < -1 ||
    Number(configuration.clusterThreshold) > 1
  ) {
    throw new Error(
      "Correlation clusterThreshold must be within [-1, 1].",
    );
  }

  if (
    Number(configuration.significanceThreshold) < 0 ||
    Number(configuration.significanceThreshold) > 1
  ) {
    throw new Error(
      "Correlation significanceThreshold must be within [0, 1].",
    );
  }
}

function disabledResult(
  primary: MarketIntelligenceInput,
  universe: readonly ReferenceMarketInput[],
  configuration: CorrelationIntelligenceConfiguration,
): MarketCorrelationIntelligence {
  return deepFreeze({
    matrixId: matrixId(primary, universe, configuration),
    generatedAtMs: primary.analysisTimeMs,
    window: deepFreeze({
      startTimeMs: primary.observationWindow.startTimeMs,
      endTimeMs: primary.observationWindow.endTimeMs,
    }),
    pairs: deepFreeze([]),
    clusters: deepFreeze([]),
    breakdowns: deepFreeze([]),
    averageMarketCorrelation: 0 as CorrelationCoefficient,
    concentrationScore: 0 as NormalizedScore,
    diversificationScore: 1 as NormalizedScore,
    systemicRiskScore: 0 as NormalizedScore,
    confidence: 0 as ConfidenceScore,
    modelVersion: configuration.modelVersion,
  });
}

export class DefaultMarketCorrelationIntelligenceEngine
  implements MarketCorrelationIntelligenceEngine
{
  public analyze(
    primary: MarketIntelligenceInput,
    universe: readonly ReferenceMarketInput[],
    configuration: CorrelationIntelligenceConfiguration,
  ): MarketCorrelationIntelligence {
    validateConfiguration(configuration);

    const normalizedUniverse = normalizeUniverse(
      primary,
      universe,
    );

    if (!configuration.enabled) {
      return disabledResult(
        primary,
        normalizedUniverse,
        configuration,
      );
    }

    const primaryReturns = calculateReturns(primary.candles);
    const computations = normalizedUniverse.map((reference) =>
      computePair(
        primary,
        reference,
        primaryReturns,
        configuration,
      ),
    );

    const pairs = deepFreeze(
      computations
        .map((computation) => computation.pair)
        .sort((left, right) =>
          String(left.rightSymbol).localeCompare(
            String(right.rightSymbol),
          ),
        ),
    );

    const breakdowns = buildBreakdowns(
      computations,
      primary,
      configuration,
    );
    const clusters = buildClusters(
      primary,
      computations,
      configuration,
    );
    const scores = aggregateScores(
      computations,
      breakdowns,
      primary,
      normalizedUniverse,
      configuration,
    );

    const window: TimeRange = deepFreeze({
      startTimeMs: primary.observationWindow.startTimeMs,
      endTimeMs: primary.observationWindow.endTimeMs,
    });

    return deepFreeze({
      matrixId: matrixId(
        primary,
        normalizedUniverse,
        configuration,
      ),
      generatedAtMs: primary.analysisTimeMs,
      window,
      pairs,
      clusters,
      breakdowns,
      averageMarketCorrelation:
        scores.averageMarketCorrelation as CorrelationCoefficient,
      concentrationScore:
        scores.concentrationScore as NormalizedScore,
      diversificationScore:
        scores.diversificationScore as NormalizedScore,
      systemicRiskScore:
        scores.systemicRiskScore as NormalizedScore,
      confidence: scores.confidence as ConfidenceScore,
      modelVersion: configuration.modelVersion,
    });
  }
}

export function createMarketCorrelationIntelligenceEngine(): MarketCorrelationIntelligenceEngine {
  return new DefaultMarketCorrelationIntelligenceEngine();
}

export function analyzeMarketCorrelations(
  primary: MarketIntelligenceInput,
  universe: readonly ReferenceMarketInput[],
  configuration: CorrelationIntelligenceConfiguration,
): MarketCorrelationIntelligence {
  return new DefaultMarketCorrelationIntelligenceEngine().analyze(
    primary,
    universe,
    configuration,
  );
}