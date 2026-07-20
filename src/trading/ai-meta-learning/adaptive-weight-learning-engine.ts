/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 7:
 * src/trading/ai-meta-learning/adaptive-weight-learning-engine.ts
 *
 * Deterministic production-grade adaptive strategy weight learning engine.
 */

import {
  type AdaptiveStrategyWeight,
  type AdaptiveWeightLearningConstraints,
  type AdaptiveWeightLearningEnginePort,
  type AdaptiveWeightLearningRequest,
  type AdaptiveWeightLearningResult,
  type LearnedRegimeProfile,
  type RegimeLearningEvidence,
  type StrategyLearningScore,
  type StrategyRiskObservation,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;

interface StrategyWeightContext {
  readonly strategyId: string;
  readonly previousWeight: number;
  readonly learningScore?: StrategyLearningScore;
  readonly riskObservation?: StrategyRiskObservation;
  readonly regimeEvidence?: RegimeLearningEvidence;
  readonly rawPreference: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

interface PreliminaryWeight {
  readonly strategyId: string;
  readonly previousWeight: number;
  readonly proposedWeight: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface AdaptiveWeightLearningEngineOptions {
  readonly performanceWeight?: number;
  readonly riskAdjustedWeight?: number;
  readonly stabilityWeight?: number;
  readonly regimeWeight?: number;
  readonly confidenceWeight?: number;
  readonly riskPenaltyWeight?: number;
  readonly breachPenalty?: number;
}

export class AdaptiveWeightLearningEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "ADAPTIVE_WEIGHT_LEARNING_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "AdaptiveWeightLearningEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AdaptiveWeightLearningEngine
  implements AdaptiveWeightLearningEnginePort
{
  private readonly performanceWeight: number;
  private readonly riskAdjustedWeight: number;
  private readonly stabilityWeight: number;
  private readonly regimeWeight: number;
  private readonly confidenceWeight: number;
  private readonly riskPenaltyWeight: number;
  private readonly breachPenalty: number;

  public constructor(
    options: AdaptiveWeightLearningEngineOptions = {},
  ) {
    this.performanceWeight = nonNegative(
      options.performanceWeight ?? 0.28,
    );
    this.riskAdjustedWeight = nonNegative(
      options.riskAdjustedWeight ?? 0.22,
    );
    this.stabilityWeight = nonNegative(
      options.stabilityWeight ?? 0.15,
    );
    this.regimeWeight = nonNegative(
      options.regimeWeight ?? 0.15,
    );
    this.confidenceWeight = nonNegative(
      options.confidenceWeight ?? 0.1,
    );
    this.riskPenaltyWeight = nonNegative(
      options.riskPenaltyWeight ?? 0.1,
    );
    this.breachPenalty = clamp01(
      options.breachPenalty ?? 0.2,
    );
  }

  public learn(
    request: AdaptiveWeightLearningRequest,
  ): AdaptiveWeightLearningResult {
    this.assertRequest(request);

    const warnings: string[] = [];
    const strategyIds = this.collectStrategyIds(request);

    if (strategyIds.length === 0) {
      return freezeResult({
        requestId: request.requestId,
        generatedAt: request.generatedAt,
        weights: [],
        reserveWeight: round(
          clamp(
            request.constraints.reserveWeight,
            0,
            1,
          ),
        ),
        totalAllocatedWeight: 0,
        expectedTurnover: 0,
        confidence: 0,
        warnings: [
          "No strategies were available for adaptive weight learning.",
        ],
      });
    }

    const activeProfile = request.regimeProfiles.find(
      (profile) => profile.regime === request.activeRegime,
    );

    if (!activeProfile) {
      warnings.push(
        `No learned regime profile was available for active regime '${request.activeRegime}'.`,
      );
    }

    const contexts = strategyIds.map((strategyId) =>
      this.buildStrategyContext(
        request,
        strategyId,
        activeProfile,
        warnings,
      ),
    );

    const targetAllocation = clamp(
      1 - request.constraints.reserveWeight,
      0,
      1,
    );

    const preliminary = this.calculatePreliminaryWeights(
      contexts,
      targetAllocation,
      request.constraints,
    );

    const turnoverBounded = this.applyTurnoverLimit(
      preliminary,
      request.constraints.maximumPortfolioTurnover,
    );

    const normalized = request.constraints.normalizeToOne
      ? this.normalizeWeights(
          turnoverBounded,
          targetAllocation,
          request.constraints,
          warnings,
        )
      : turnoverBounded;

    const finalWeights = normalized
      .map((item) =>
        freezeAdaptiveWeight({
          strategyId: item.strategyId,
          previousWeight: round(item.previousWeight),
          proposedWeight: round(item.proposedWeight),
          boundedWeight: round(
            clamp(
              item.proposedWeight,
              request.constraints.minimumStrategyWeight,
              request.constraints.maximumStrategyWeight,
            ),
          ),
          delta: round(
            clamp(
              item.proposedWeight,
              request.constraints.minimumStrategyWeight,
              request.constraints.maximumStrategyWeight,
            ) - item.previousWeight,
          ),
          confidence: round(item.confidence),
          reasons: item.reasons,
        }),
      )
      .sort((left, right) =>
        left.strategyId.localeCompare(right.strategyId),
      );

    const totalAllocatedWeight = sum(
      finalWeights.map((item) => item.boundedWeight),
    );

    const expectedTurnover =
      0.5 *
      sum(
        finalWeights.map((item) =>
          Math.abs(item.boundedWeight - item.previousWeight),
        ),
      );

    const confidence = weightedAverage(
      finalWeights.map((item) => ({
        value: item.confidence,
        weight: Math.max(EPSILON, item.boundedWeight),
      })),
    );

    if (
      expectedTurnover >
      request.constraints.maximumPortfolioTurnover + EPSILON
    ) {
      warnings.push(
        "Final expected turnover exceeds the configured maximum due to hard minimum or maximum weight constraints.",
      );
    }

    if (
      request.constraints.normalizeToOne &&
      Math.abs(totalAllocatedWeight - targetAllocation) > 1e-8
    ) {
      warnings.push(
        "Final strategy weights could not be normalized exactly to the allocatable target because of active bounds.",
      );
    }

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      weights: finalWeights,
      reserveWeight: round(
        request.constraints.reserveWeight,
      ),
      totalAllocatedWeight: round(totalAllocatedWeight),
      expectedTurnover: round(expectedTurnover),
      confidence: round(confidence),
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private collectStrategyIds(
    request: AdaptiveWeightLearningRequest,
  ): readonly string[] {
    return Object.freeze(
      Array.from(
        new Set([
          ...Object.keys(request.currentWeights),
          ...request.learningScores.map(
            (score) => score.strategyId,
          ),
          ...request.riskObservations.map(
            (observation) => observation.strategyId,
          ),
          ...request.regimeProfiles.flatMap((profile) =>
            profile.strategyEvidence.map(
              (evidence) => evidence.strategyId,
            ),
          ),
        ]),
      ).sort(),
    );
  }

  private buildStrategyContext(
    request: AdaptiveWeightLearningRequest,
    strategyId: string,
    activeProfile: LearnedRegimeProfile | undefined,
    warnings: string[],
  ): StrategyWeightContext {
    const previousWeight =
      request.currentWeights[strategyId] ?? 0;

    const learningScore = request.learningScores.find(
      (score) => score.strategyId === strategyId,
    );

    const riskObservation =
      this.latestRiskObservation(
        request.riskObservations,
        strategyId,
      );

    const regimeEvidence =
      activeProfile?.strategyEvidence.find(
        (evidence) => evidence.strategyId === strategyId,
      );

    const reasons: string[] = [];

    if (!learningScore) {
      warnings.push(
        `Strategy '${strategyId}' has no learning score; neutral learning evidence was used.`,
      );
    }

    if (!riskObservation) {
      warnings.push(
        `Strategy '${strategyId}' has no risk observation; neutral risk evidence was used.`,
      );
    }

    if (!regimeEvidence) {
      reasons.push(
        `No direct evidence was available for active regime '${request.activeRegime}'.`,
      );
    }

    const normalizedScore =
      learningScore?.normalizedScore ?? 0.5;
    const riskAdjustedScore =
      learningScore?.riskAdjustedScore ?? 0.5;
    const stabilityScore =
      learningScore?.stabilityScore ?? 0.5;
    const learningConfidence =
      learningScore?.confidence ?? 0.5;

    const regimeScore =
      regimeEvidence?.score ?? 0.5;
    const regimeConfidence =
      regimeEvidence?.confidence ?? 0.5;

    const aggregateRisk = riskObservation
      ? this.aggregateRisk(riskObservation)
      : 0.5;

    const remainingRiskBudget =
      riskObservation?.remainingRiskBudget ?? 0.5;

    const breachPenalty =
      riskObservation &&
      riskObservation.breachedLimits.length > 0
        ? this.breachPenalty
        : 0;

    const weightedSignal =
      normalizedScore * this.performanceWeight +
      riskAdjustedScore * this.riskAdjustedWeight +
      stabilityScore * this.stabilityWeight +
      regimeScore *
        request.activeRegimeConfidence *
        this.regimeWeight +
      learningConfidence * this.confidenceWeight +
      (1 - aggregateRisk) * this.riskPenaltyWeight;

    const totalPositiveWeight =
      this.performanceWeight +
      this.riskAdjustedWeight +
      this.stabilityWeight +
      this.regimeWeight +
      this.confidenceWeight +
      this.riskPenaltyWeight;

    let rawPreference = safeDivide(
      weightedSignal,
      totalPositiveWeight,
    );

    rawPreference *=
      0.75 + 0.25 * clamp01(remainingRiskBudget);
    rawPreference = clamp01(
      rawPreference - breachPenalty,
    );

    const confidence = clamp01(
      learningConfidence * 0.45 +
        regimeConfidence *
          request.activeRegimeConfidence *
          0.3 +
        (riskObservation ? 0.8 : 0.4) * 0.25,
    );

    if (normalizedScore >= 0.7) {
      reasons.push(
        "Strong normalized strategy-learning score supports a larger allocation.",
      );
    } else if (normalizedScore <= 0.3) {
      reasons.push(
        "Weak normalized strategy-learning score supports a smaller allocation.",
      );
    }

    if (riskAdjustedScore >= 0.7) {
      reasons.push(
        "Strong risk-adjusted performance supports additional capital.",
      );
    } else if (riskAdjustedScore <= 0.3) {
      reasons.push(
        "Weak risk-adjusted performance constrains capital allocation.",
      );
    }

    if (regimeScore >= 0.7) {
      reasons.push(
        `The strategy is preferred in active regime '${request.activeRegime}'.`,
      );
    } else if (regimeScore <= 0.3) {
      reasons.push(
        `The strategy is poorly matched to active regime '${request.activeRegime}'.`,
      );
    }

    if (aggregateRisk >= 0.7) {
      reasons.push(
        "Elevated aggregate risk reduces the proposed strategy weight.",
      );
    }

    if (
      riskObservation &&
      riskObservation.breachedLimits.length > 0
    ) {
      reasons.push(
        `Risk-limit breaches reduced the allocation: ${riskObservation.breachedLimits.join(", ")}.`,
      );
    }

    if (remainingRiskBudget <= 0.2) {
      reasons.push(
        "Limited remaining risk budget restricts further allocation.",
      );
    }

    if (reasons.length === 0) {
      reasons.push(
        "Balanced performance, risk, and regime evidence supports a neutral allocation.",
      );
    }

    return Object.freeze({
      strategyId,
      previousWeight,
      learningScore,
      riskObservation,
      regimeEvidence,
      rawPreference,
      confidence,
      reasons: Object.freeze(Array.from(new Set(reasons))),
    });
  }

  private calculatePreliminaryWeights(
    contexts: readonly StrategyWeightContext[],
    targetAllocation: number,
    constraints: AdaptiveWeightLearningConstraints,
  ): readonly PreliminaryWeight[] {
    const preferenceTotal = sum(
      contexts.map((context) => context.rawPreference),
    );

    const equalWeight =
      contexts.length === 0
        ? 0
        : targetAllocation / contexts.length;

    return Object.freeze(
      contexts.map((context) => {
        const unconstrainedTarget =
          preferenceTotal <= EPSILON
            ? equalWeight
            : targetAllocation *
              safeDivide(
                context.rawPreference,
                preferenceTotal,
              );

        const maximumIncrease =
          context.previousWeight +
          constraints.maximumWeightChange;
        const maximumDecrease =
          context.previousWeight -
          constraints.maximumWeightChange;

        const boundedByChange = clamp(
          unconstrainedTarget,
          maximumDecrease,
          maximumIncrease,
        );

        const boundedByWeight = clamp(
          boundedByChange,
          constraints.minimumStrategyWeight,
          constraints.maximumStrategyWeight,
        );

        const reasons = [...context.reasons];

        if (
          Math.abs(
            boundedByChange - unconstrainedTarget,
          ) > EPSILON
        ) {
          reasons.push(
            "The maximum per-run weight-change constraint limited the proposal.",
          );
        }

        if (
          Math.abs(
            boundedByWeight - boundedByChange,
          ) > EPSILON
        ) {
          reasons.push(
            "The strategy weight was clipped to the configured minimum or maximum bound.",
          );
        }

        return Object.freeze({
          strategyId: context.strategyId,
          previousWeight: context.previousWeight,
          proposedWeight: boundedByWeight,
          confidence: context.confidence,
          reasons: Object.freeze(
            Array.from(new Set(reasons)),
          ),
        });
      }),
    );
  }

  private applyTurnoverLimit(
    weights: readonly PreliminaryWeight[],
    maximumPortfolioTurnover: number,
  ): readonly PreliminaryWeight[] {
    const currentTurnover =
      0.5 *
      sum(
        weights.map((item) =>
          Math.abs(
            item.proposedWeight - item.previousWeight,
          ),
        ),
      );

    if (
      currentTurnover <= maximumPortfolioTurnover + EPSILON ||
      currentTurnover <= EPSILON
    ) {
      return weights;
    }

    const scalingFactor = clamp01(
      safeDivide(
        maximumPortfolioTurnover,
        currentTurnover,
      ),
    );

    return Object.freeze(
      weights.map((item) => {
        const proposedWeight =
          item.previousWeight +
          (item.proposedWeight - item.previousWeight) *
            scalingFactor;

        return Object.freeze({
          ...item,
          proposedWeight,
          reasons: Object.freeze(
            Array.from(
              new Set([
                ...item.reasons,
                "The portfolio-turnover constraint proportionally reduced the proposed change.",
              ]),
            ),
          ),
        });
      }),
    );
  }

  private normalizeWeights(
    weights: readonly PreliminaryWeight[],
    targetAllocation: number,
    constraints: AdaptiveWeightLearningConstraints,
    warnings: string[],
  ): readonly PreliminaryWeight[] {
    const mutable = weights.map((item) => ({
      ...item,
      reasons: [...item.reasons],
    }));

    const minimumTotal =
      constraints.minimumStrategyWeight *
      mutable.length;
    const maximumTotal =
      constraints.maximumStrategyWeight *
      mutable.length;

    if (targetAllocation < minimumTotal - EPSILON) {
      warnings.push(
        "The allocatable target is below the sum of minimum strategy weights.",
      );
    }

    if (targetAllocation > maximumTotal + EPSILON) {
      warnings.push(
        "The allocatable target exceeds the sum of maximum strategy weights.",
      );
    }

    const feasibleTarget = clamp(
      targetAllocation,
      minimumTotal,
      maximumTotal,
    );

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const total = sum(
        mutable.map((item) => item.proposedWeight),
      );
      const difference = feasibleTarget - total;

      if (Math.abs(difference) <= 1e-10) {
        break;
      }

      const candidates = mutable.filter((item) =>
        difference > 0
          ? item.proposedWeight <
            constraints.maximumStrategyWeight - EPSILON
          : item.proposedWeight >
            constraints.minimumStrategyWeight + EPSILON,
      );

      if (candidates.length === 0) {
        break;
      }

      const capacities = candidates.map((item) =>
        difference > 0
          ? constraints.maximumStrategyWeight -
            item.proposedWeight
          : item.proposedWeight -
            constraints.minimumStrategyWeight,
      );

      const totalCapacity = sum(capacities);

      if (totalCapacity <= EPSILON) {
        break;
      }

      for (let index = 0; index < candidates.length; index += 1) {
        const item = candidates[index];
        const capacity = capacities[index];
        const share =
          difference *
          safeDivide(capacity, totalCapacity);

        item.proposedWeight = clamp(
          item.proposedWeight + share,
          constraints.minimumStrategyWeight,
          constraints.maximumStrategyWeight,
        );

        if (
          !item.reasons.includes(
            "Weights were normalized across eligible strategies.",
          )
        ) {
          item.reasons.push(
            "Weights were normalized across eligible strategies.",
          );
        }
      }
    }

    return Object.freeze(
      mutable.map((item) =>
        Object.freeze({
          strategyId: item.strategyId,
          previousWeight: item.previousWeight,
          proposedWeight: item.proposedWeight,
          confidence: item.confidence,
          reasons: Object.freeze(
            Array.from(new Set(item.reasons)),
          ),
        }),
      ),
    );
  }

  private latestRiskObservation(
    observations: readonly StrategyRiskObservation[],
    strategyId: string,
  ): StrategyRiskObservation | undefined {
    return observations
      .filter(
        (observation) =>
          observation.strategyId === strategyId,
      )
      .sort(
        (left, right) =>
          Date.parse(right.timestamp) -
          Date.parse(left.timestamp),
      )[0];
  }

  private aggregateRisk(
    observation: StrategyRiskObservation,
  ): number {
    const componentRisk = average([
      observation.riskScore,
      observation.concentrationRisk,
      observation.correlationRisk,
      observation.liquidityRisk,
      observation.leverageRisk,
      observation.volatilityRisk,
      observation.drawdownRisk,
      observation.tailRisk,
      observation.operationalRisk,
    ]);

    const budgetPenalty =
      1 - clamp01(observation.remainingRiskBudget);

    const breachRisk =
      observation.breachedLimits.length === 0
        ? 0
        : clamp01(
            0.5 +
              observation.breachedLimits.length * 0.1,
          );

    return clamp01(
      componentRisk * 0.65 +
        budgetPenalty * 0.2 +
        breachRisk * 0.15,
    );
  }

  private assertRequest(
    request: AdaptiveWeightLearningRequest,
  ): void {
    if (request === null || typeof request !== "object") {
      throw new AdaptiveWeightLearningEngineError(
        "Adaptive weight learning request must be an object.",
        "INVALID_ADAPTIVE_WEIGHT_REQUEST",
      );
    }

    if (
      typeof request.requestId !== "string" ||
      request.requestId.trim().length === 0
    ) {
      throw new AdaptiveWeightLearningEngineError(
        "requestId must be a non-empty string.",
        "INVALID_ADAPTIVE_WEIGHT_REQUEST_ID",
      );
    }

    if (
      typeof request.generatedAt !== "string" ||
      !Number.isFinite(Date.parse(request.generatedAt))
    ) {
      throw new AdaptiveWeightLearningEngineError(
        "generatedAt must be a valid timestamp.",
        "INVALID_ADAPTIVE_WEIGHT_TIMESTAMP",
      );
    }

    if (
      request.currentWeights === null ||
      typeof request.currentWeights !== "object" ||
      Array.isArray(request.currentWeights)
    ) {
      throw new AdaptiveWeightLearningEngineError(
        "currentWeights must be an object.",
        "INVALID_CURRENT_WEIGHTS",
      );
    }

    if (!Array.isArray(request.learningScores)) {
      throw new AdaptiveWeightLearningEngineError(
        "learningScores must be an array.",
        "INVALID_LEARNING_SCORES",
      );
    }

    if (!Array.isArray(request.riskObservations)) {
      throw new AdaptiveWeightLearningEngineError(
        "riskObservations must be an array.",
        "INVALID_RISK_OBSERVATIONS",
      );
    }

    if (!Array.isArray(request.regimeProfiles)) {
      throw new AdaptiveWeightLearningEngineError(
        "regimeProfiles must be an array.",
        "INVALID_REGIME_PROFILES",
      );
    }

    assertUnitInterval(
      request.activeRegimeConfidence,
      "activeRegimeConfidence",
    );

    this.assertConstraints(request.constraints);

    for (const [strategyId, weight] of Object.entries(
      request.currentWeights,
    )) {
      if (strategyId.trim().length === 0) {
        throw new AdaptiveWeightLearningEngineError(
          "currentWeights contains an empty strategy identifier.",
          "INVALID_WEIGHT_STRATEGY_ID",
        );
      }

      if (!Number.isFinite(weight) || weight < 0) {
        throw new AdaptiveWeightLearningEngineError(
          `Current weight for strategy '${strategyId}' must be a finite non-negative number.`,
          "INVALID_CURRENT_WEIGHT_VALUE",
        );
      }
    }

    const learningScoreIds = request.learningScores.map(
      (score) => score.strategyId,
    );

    if (
      new Set(learningScoreIds).size !==
      learningScoreIds.length
    ) {
      throw new AdaptiveWeightLearningEngineError(
        "learningScores contain duplicate strategyId values.",
        "DUPLICATE_LEARNING_SCORE_STRATEGY",
      );
    }
  }

  private assertConstraints(
    constraints: AdaptiveWeightLearningConstraints,
  ): void {
    if (
      constraints === null ||
      typeof constraints !== "object"
    ) {
      throw new AdaptiveWeightLearningEngineError(
        "constraints must be an object.",
        "INVALID_ADAPTIVE_WEIGHT_CONSTRAINTS",
      );
    }

    assertUnitInterval(
      constraints.minimumStrategyWeight,
      "minimumStrategyWeight",
    );
    assertUnitInterval(
      constraints.maximumStrategyWeight,
      "maximumStrategyWeight",
    );
    assertUnitInterval(
      constraints.maximumWeightChange,
      "maximumWeightChange",
    );
    assertUnitInterval(
      constraints.maximumPortfolioTurnover,
      "maximumPortfolioTurnover",
    );
    assertUnitInterval(
      constraints.reserveWeight,
      "reserveWeight",
    );

    if (
      constraints.minimumStrategyWeight >
      constraints.maximumStrategyWeight
    ) {
      throw new AdaptiveWeightLearningEngineError(
        "minimumStrategyWeight cannot exceed maximumStrategyWeight.",
        "INVALID_STRATEGY_WEIGHT_RANGE",
      );
    }
  }
}

export function createAdaptiveWeightLearningEngine(
  options: AdaptiveWeightLearningEngineOptions = {},
): AdaptiveWeightLearningEngine {
  return new AdaptiveWeightLearningEngine(options);
}

function freezeAdaptiveWeight(
  value: AdaptiveStrategyWeight,
): AdaptiveStrategyWeight {
  return Object.freeze({
    ...value,
    reasons: Object.freeze([...value.reasons]),
  });
}

function freezeResult(
  result: AdaptiveWeightLearningResult,
): AdaptiveWeightLearningResult {
  return Object.freeze({
    ...result,
    weights: Object.freeze([...result.weights]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function weightedAverage(
  values: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
): number {
  let numerator = 0;
  let denominator = 0;

  for (const item of values) {
    if (
      !Number.isFinite(item.value) ||
      !Number.isFinite(item.weight) ||
      item.weight <= 0
    ) {
      continue;
    }

    numerator += item.value * item.weight;
    denominator += item.weight;
  }

  return safeDivide(numerator, denominator);
}

function average(values: readonly number[]): number {
  return safeDivide(
    sum(
      values.map((value) =>
        Number.isFinite(value) ? value : 0,
      ),
    ),
    values.length,
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
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

function assertUnitInterval(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new AdaptiveWeightLearningEngineError(
      `${fieldName} must be a finite number between 0 and 1.`,
      "INVALID_ADAPTIVE_WEIGHT_RANGE",
    );
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 12): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}