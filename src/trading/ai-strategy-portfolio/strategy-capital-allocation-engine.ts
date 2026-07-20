/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-capital-allocation-engine.ts
 *
 * Purpose:
 * Deterministically converts ranked, diversified, regime-aware strategy
 * candidates into an immutable target capital allocation while enforcing
 * portfolio, risk-budget, candidate, concentration, turnover, and cash-reserve
 * constraints.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_BASIS_POINTS_PER_UNIT,
  AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
  type AiStrategyAllocationConstraint,
  type AiStrategyAllocationMethod,
  type AiStrategyAllocationRequest,
  type AiStrategyAllocationResult,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyCapitalAllocationEnginePort,
  type AiStrategyCurrentAllocation,
  type AiStrategyDiversificationAssessment,
  type AiStrategyRankingEntry,
  type AiStrategyRegimeFitness,
  type AiStrategyRiskContribution,
  type AiStrategyScore,
  type AiStrategyTargetAllocation,
} from "./ai-strategy-portfolio-contracts";

export interface StrategyCapitalAllocationEngineOptions {
  readonly numericalPrecision?: number;
  readonly minimumPositiveDenominator?: number;
  readonly defaultVolatilityEstimate?: number;
  readonly defaultDrawdownEstimate?: number;
  readonly highRiskPenalty?: number;
  readonly veryHighRiskPenalty?: number;
  readonly deterministicFallbackFloor?: number;
  readonly rejectUnknownCandidates?: boolean;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly numericalPrecision: number;
  readonly minimumPositiveDenominator: number;
  readonly defaultVolatilityEstimate: number;
  readonly defaultDrawdownEstimate: number;
  readonly highRiskPenalty: number;
  readonly veryHighRiskPenalty: number;
  readonly deterministicFallbackFloor: number;
  readonly rejectUnknownCandidates: boolean;
  readonly metadata: StrategyMetadata;
}

interface CandidateContext {
  readonly candidate: AiStrategyCandidate;
  readonly score: AiStrategyScore;
  readonly ranking: AiStrategyRankingEntry;
  readonly diversification?: AiStrategyDiversificationAssessment;
  readonly regimeFitness?: AiStrategyRegimeFitness;
  readonly current: AiStrategyCurrentAllocation;
  readonly constraint?: AiStrategyAllocationConstraint;
  readonly baseSignal: number;
  readonly volatilityEstimate: number;
  readonly drawdownEstimate: number;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

interface MutableAllocation {
  readonly context: CandidateContext;
  minimumWeight: number;
  maximumWeight: number;
  locked: boolean;
  weight: number;
  reasons: string[];
}

const EPSILON = 1e-12;
const DEFAULT_PRECISION = 12;
const DEFAULT_MINIMUM_DENOMINATOR = 1e-9;
const DEFAULT_VOLATILITY_ESTIMATE = 0.2;
const DEFAULT_DRAWDOWN_ESTIMATE = 0.15;
const DEFAULT_HIGH_RISK_PENALTY = 0.75;
const DEFAULT_VERY_HIGH_RISK_PENALTY = 0.5;
const DEFAULT_DETERMINISTIC_FALLBACK_FLOOR = 0.02;

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertNonNegative(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to zero.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (
    value < AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM ||
    value > AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM
  ) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeOptions(
  options: StrategyCapitalAllocationEngineOptions = {},
): NormalizedOptions {
  const normalized: NormalizedOptions = Object.freeze({
    numericalPrecision: options.numericalPrecision ?? DEFAULT_PRECISION,
    minimumPositiveDenominator:
      options.minimumPositiveDenominator ?? DEFAULT_MINIMUM_DENOMINATOR,
    defaultVolatilityEstimate:
      options.defaultVolatilityEstimate ?? DEFAULT_VOLATILITY_ESTIMATE,
    defaultDrawdownEstimate:
      options.defaultDrawdownEstimate ?? DEFAULT_DRAWDOWN_ESTIMATE,
    highRiskPenalty: options.highRiskPenalty ?? DEFAULT_HIGH_RISK_PENALTY,
    veryHighRiskPenalty:
      options.veryHighRiskPenalty ?? DEFAULT_VERY_HIGH_RISK_PENALTY,
    deterministicFallbackFloor:
      options.deterministicFallbackFloor ??
      DEFAULT_DETERMINISTIC_FALLBACK_FLOOR,
    rejectUnknownCandidates: options.rejectUnknownCandidates ?? true,
    metadata: options.metadata ?? EMPTY_STRATEGY_METADATA,
  });

  if (
    !Number.isInteger(normalized.numericalPrecision) ||
    normalized.numericalPrecision < 0 ||
    normalized.numericalPrecision > 15
  ) {
    throw new Error("numericalPrecision must be an integer between 0 and 15.");
  }
  assertNonNegative(
    normalized.minimumPositiveDenominator,
    "minimumPositiveDenominator",
  );
  assertNonNegative(
    normalized.defaultVolatilityEstimate,
    "defaultVolatilityEstimate",
  );
  assertNonNegative(
    normalized.defaultDrawdownEstimate,
    "defaultDrawdownEstimate",
  );
  assertUnitInterval(normalized.highRiskPenalty, "highRiskPenalty");
  assertUnitInterval(normalized.veryHighRiskPenalty, "veryHighRiskPenalty");
  assertUnitInterval(
    normalized.deterministicFallbackFloor,
    "deterministicFallbackFloor",
  );

  return normalized;
}

function round(value: number, precision: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compareCandidateIds(
  left: AiStrategyCandidateId,
  right: AiStrategyCandidateId,
): number {
  return left.localeCompare(right, "en", {
    sensitivity: "variant",
    numeric: false,
  });
}

function asReadonlyArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function freezeMetadata(value: object): StrategyMetadata {
  return Object.freeze(value) as unknown as StrategyMetadata;
}

function createEmptyCurrentAllocation(
  candidateId: AiStrategyCandidateId,
): AiStrategyCurrentAllocation {
  return Object.freeze({
    candidateId,
    weight: 0,
    capital: 0,
    active: false,
    metadata: EMPTY_STRATEGY_METADATA,
  });
}

function validateRequest(request: AiStrategyAllocationRequest): void {
  if (!request.allocationId.trim()) {
    throw new Error("allocationId cannot be empty.");
  }
  if (!request.runId.trim()) {
    throw new Error("runId cannot be empty.");
  }
  if (!request.portfolioId.trim()) {
    throw new Error("portfolioId cannot be empty.");
  }
  assertNonNegative(request.timestamp, "timestamp");
  assertNonNegative(request.totalCapital, "totalCapital");
  assertNonNegative(request.riskBudget.totalCapital, "riskBudget.totalCapital");
  assertNonNegative(
    request.riskBudget.deployableCapital,
    "riskBudget.deployableCapital",
  );
  assertNonNegative(
    request.riskBudget.reservedCapital,
    "riskBudget.reservedCapital",
  );

  const policy = request.policy;
  assertNonNegative(policy.rebalanceThresholdBps, "rebalanceThresholdBps");
  assertUnitInterval(policy.minimumAllocationWeight, "minimumAllocationWeight");
  assertUnitInterval(policy.maximumAllocationWeight, "maximumAllocationWeight");
  if (policy.minimumAllocationWeight > policy.maximumAllocationWeight) {
    throw new Error(
      "minimumAllocationWeight cannot exceed maximumAllocationWeight.",
    );
  }
  assertNonNegative(policy.scoreExponent, "scoreExponent");
  assertNonNegative(policy.confidenceWeight, "confidenceWeight");
  assertNonNegative(policy.regimeFitnessWeight, "regimeFitnessWeight");
  assertNonNegative(policy.diversificationWeight, "diversificationWeight");
  assertNonNegative(policy.turnoverPenaltyWeight, "turnoverPenaltyWeight");

  const risk = request.riskBudget.constraints;
  assertUnitInterval(risk.maximumStrategyWeight, "maximumStrategyWeight");
  assertUnitInterval(risk.maximumFamilyWeight, "maximumFamilyWeight");
  assertUnitInterval(
    risk.maximumIntelligenceTypeWeight,
    "maximumIntelligenceTypeWeight",
  );
  assertUnitInterval(risk.maximumHighRiskWeight, "maximumHighRiskWeight");
  assertUnitInterval(risk.minimumCashReserveWeight, "minimumCashReserveWeight");
  if (risk.maximumTurnover !== undefined) {
    assertUnitInterval(risk.maximumTurnover, "maximumTurnover");
  }

  const candidateIds = new Set<string>();
  for (const candidate of request.candidates) {
    const id = candidate.identity.candidateId;
    if (candidateIds.has(id)) {
      throw new Error(`Duplicate candidateId: ${id}.`);
    }
    candidateIds.add(id);
  }

  const constraintIds = new Set<string>();
  for (const constraint of policy.constraints) {
    if (constraintIds.has(constraint.candidateId)) {
      throw new Error(
        `Duplicate allocation constraint for ${constraint.candidateId}.`,
      );
    }
    constraintIds.add(constraint.candidateId);
    assertUnitInterval(
      constraint.minimumWeight,
      `constraint(${constraint.candidateId}).minimumWeight`,
    );
    assertUnitInterval(
      constraint.maximumWeight,
      `constraint(${constraint.candidateId}).maximumWeight`,
    );
    if (constraint.minimumWeight > constraint.maximumWeight) {
      throw new Error(
        `Constraint minimumWeight exceeds maximumWeight for ${constraint.candidateId}.`,
      );
    }
    if (constraint.lockedWeight !== undefined) {
      assertUnitInterval(
        constraint.lockedWeight,
        `constraint(${constraint.candidateId}).lockedWeight`,
      );
      if (
        constraint.lockedWeight < constraint.minimumWeight - EPSILON ||
        constraint.lockedWeight > constraint.maximumWeight + EPSILON
      ) {
        throw new Error(
          `lockedWeight is outside the candidate constraint range for ${constraint.candidateId}.`,
        );
      }
    }
    if (constraint.minimumCapital !== undefined) {
      assertNonNegative(
        constraint.minimumCapital,
        `constraint(${constraint.candidateId}).minimumCapital`,
      );
    }
    if (constraint.maximumCapital !== undefined) {
      assertNonNegative(
        constraint.maximumCapital,
        `constraint(${constraint.candidateId}).maximumCapital`,
      );
    }
  }
}

function mapByCandidateId<T extends { readonly candidateId: string }>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const value of values) {
    map.set(value.candidateId, value);
  }
  return map;
}

function getRiskPenalty(
  candidate: AiStrategyCandidate,
  options: NormalizedOptions,
): number {
  switch (candidate.classification.riskLevel) {
    case "VERY_HIGH":
      return options.veryHighRiskPenalty;
    case "HIGH":
      return options.highRiskPenalty;
    case "VERY_LOW":
      return 1.05;
    default:
      return 1;
  }
}

function estimateVolatility(
  fitness: AiStrategyRegimeFitness | undefined,
  options: NormalizedOptions,
): number {
  const value = fitness?.expectedVolatility;
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.abs(value)
    : options.defaultVolatilityEstimate;
}

function estimateDrawdown(
  candidate: AiStrategyCandidate,
  fitness: AiStrategyRegimeFitness | undefined,
  options: NormalizedOptions,
): number {
  const fitnessValue = fitness?.expectedDrawdown;
  if (
    fitnessValue !== undefined &&
    Number.isFinite(fitnessValue) &&
    Math.abs(fitnessValue) > 0
  ) {
    return Math.abs(fitnessValue);
  }
  const observed = candidate.performance.maximumDrawdown;
  if (observed !== undefined && Number.isFinite(observed)) {
    return Math.abs(observed);
  }
  return options.defaultDrawdownEstimate;
}

function computeBaseSignal(
  request: AiStrategyAllocationRequest,
  candidate: AiStrategyCandidate,
  score: AiStrategyScore,
  ranking: AiStrategyRankingEntry,
  diversification: AiStrategyDiversificationAssessment | undefined,
  fitness: AiStrategyRegimeFitness | undefined,
  current: AiStrategyCurrentAllocation,
  options: NormalizedOptions,
): number {
  const policy = request.policy;
  const scoreValue = Math.pow(clampUnit(ranking.adjustedScore), policy.scoreExponent);
  const confidenceFactor =
    1 + policy.confidenceWeight * (clampUnit(score.confidence) - 0.5);
  const regimeFactor =
    1 +
    policy.regimeFitnessWeight *
      ((fitness === undefined ? 0.5 : clampUnit(fitness.fitnessScore)) - 0.5);
  const diversificationFactor =
    1 +
    policy.diversificationWeight *
      ((diversification === undefined
        ? 0.5
        : clampUnit(diversification.diversificationScore)) -
        0.5);
  const turnoverFactor = Math.max(
    0,
    1 - policy.turnoverPenaltyWeight * Math.abs(current.weight),
  );
  const riskPenalty = getRiskPenalty(candidate, options);

  const raw =
    scoreValue *
    confidenceFactor *
    regimeFactor *
    diversificationFactor *
    turnoverFactor *
    riskPenalty;

  return Math.max(0, raw);
}

function isDeterministicFallback(candidate: AiStrategyCandidate): boolean {
  return (
    candidate.classification.intelligenceType === "DETERMINISTIC_RULE_BASED" ||
    candidate.classification.intelligenceType === "DETERMINISTIC_ARBITRAGE"
  );
}

function createContexts(
  request: AiStrategyAllocationRequest,
  options: NormalizedOptions,
): readonly CandidateContext[] {
  const candidateMap = new Map(
    request.candidates.map((candidate) => [candidate.identity.candidateId, candidate]),
  );
  const scoreMap = mapByCandidateId(request.scores);
  const rankingMap = mapByCandidateId(request.ranking.entries);
  const diversificationMap = mapByCandidateId(
    request.diversification.assessments,
  );
  const fitnessMap = mapByCandidateId(request.regimeFitness);
  const currentMap = mapByCandidateId(request.currentAllocations);
  const constraintMap = mapByCandidateId(request.policy.constraints);

  const requestedIds = new Set(request.ranking.selectedCandidateIds);
  for (const id of request.diversification.selectedCandidateIds) {
    requestedIds.add(id);
  }

  const contexts: CandidateContext[] = [];
  for (const candidateId of [...requestedIds].sort(compareCandidateIds)) {
    const candidate = candidateMap.get(candidateId);
    const score = scoreMap.get(candidateId);
    const ranking = rankingMap.get(candidateId);

    if (!candidate || !score || !ranking) {
      if (options.rejectUnknownCandidates) {
        throw new Error(
          `Selected candidate ${candidateId} is missing candidate, score, or ranking data.`,
        );
      }
      continue;
    }

    const diversification = diversificationMap.get(candidateId);
    const fitness = fitnessMap.get(candidateId);
    const current = currentMap.get(candidateId) ?? createEmptyCurrentAllocation(candidateId);
    const constraint = constraintMap.get(candidateId);
    const reasons: string[] = [];

    const eligible =
      score.eligible &&
      ranking.selected &&
      (diversification?.compatible ?? true) &&
      (constraint?.enabled ?? true) &&
      candidate.status !== "DISABLED" &&
      candidate.status !== "SUSPENDED" &&
      candidate.status !== "INELIGIBLE";

    if (!score.eligible) reasons.push("Candidate score is ineligible.");
    if (!ranking.selected) reasons.push("Candidate is not selected by ranking.");
    if (diversification?.compatible === false) {
      reasons.push("Candidate is incompatible with diversification constraints.");
    }
    if (constraint?.enabled === false) {
      reasons.push("Candidate allocation constraint is disabled.");
    }
    if (!eligible) {
      contexts.push(
        Object.freeze({
          candidate,
          score,
          ranking,
          diversification,
          regimeFitness: fitness,
          current,
          constraint,
          baseSignal: 0,
          volatilityEstimate: estimateVolatility(fitness, options),
          drawdownEstimate: estimateDrawdown(candidate, fitness, options),
          eligible: false,
          reasons: asReadonlyArray(reasons),
        }),
      );
      continue;
    }

    const baseSignal = computeBaseSignal(
      request,
      candidate,
      score,
      ranking,
      diversification,
      fitness,
      current,
      options,
    );
    reasons.push(`Eligible with deterministic allocation signal ${baseSignal}.`);

    contexts.push(
      Object.freeze({
        candidate,
        score,
        ranking,
        diversification,
        regimeFitness: fitness,
        current,
        constraint,
        baseSignal,
        volatilityEstimate: estimateVolatility(fitness, options),
        drawdownEstimate: estimateDrawdown(candidate, fitness, options),
        eligible: true,
        reasons: asReadonlyArray(reasons),
      }),
    );
  }

  return asReadonlyArray(contexts);
}

function initialMethodSignal(
  method: AiStrategyAllocationMethod,
  context: CandidateContext,
  minimumDenominator: number,
): number {
  switch (method) {
    case "EQUAL_WEIGHT":
      return context.eligible ? 1 : 0;
    case "RISK_PARITY":
      return context.eligible
        ? 1 / Math.max(minimumDenominator, context.volatilityEstimate)
        : 0;
    case "VOLATILITY_TARGET":
      return context.eligible
        ? context.baseSignal /
            Math.max(minimumDenominator, context.volatilityEstimate)
        : 0;
    case "MAXIMUM_DIVERSIFICATION":
      return context.eligible
        ? context.baseSignal *
            (context.diversification?.diversificationScore ?? 0.5)
        : 0;
    case "REGIME_WEIGHTED":
      return context.eligible
        ? context.baseSignal * (context.regimeFitness?.fitnessScore ?? 0.5)
        : 0;
    case "CONSTRAINED_OPTIMIZATION":
      return context.eligible
        ? context.baseSignal /
            Math.max(
              minimumDenominator,
              context.volatilityEstimate + context.drawdownEstimate,
            )
        : 0;
    case "HYBRID": {
      if (!context.eligible) return 0;
      const riskAdjusted =
        context.baseSignal /
        Math.max(
          minimumDenominator,
          context.volatilityEstimate + 0.5 * context.drawdownEstimate,
        );
      const regime = context.regimeFitness?.fitnessScore ?? 0.5;
      const diversification =
        context.diversification?.diversificationScore ?? 0.5;
      return riskAdjusted * (0.5 + 0.25 * regime + 0.25 * diversification);
    }
    case "SCORE_PROPORTIONAL":
    default:
      return context.eligible ? context.baseSignal : 0;
  }
}

function deriveBounds(
  request: AiStrategyAllocationRequest,
  context: CandidateContext,
  deployableCapital: number,
): { readonly minimum: number; readonly maximum: number; readonly locked: boolean } {
  const policy = request.policy;
  const risk = request.riskBudget.constraints;
  const constraint = context.constraint;

  let minimum = Math.max(
    0,
    policy.minimumAllocationWeight,
    constraint?.minimumWeight ?? 0,
  );
  let maximum = Math.min(
    1,
    policy.maximumAllocationWeight,
    risk.maximumStrategyWeight,
    constraint?.maximumWeight ?? 1,
  );

  if (context.candidate.compatibility.minimumCapital !== undefined && deployableCapital > 0) {
    minimum = Math.max(
      minimum,
      context.candidate.compatibility.minimumCapital / deployableCapital,
    );
  }
  if (context.candidate.compatibility.maximumCapital !== undefined && deployableCapital > 0) {
    maximum = Math.min(
      maximum,
      context.candidate.compatibility.maximumCapital / deployableCapital,
    );
  }
  if (constraint?.minimumCapital !== undefined && deployableCapital > 0) {
    minimum = Math.max(minimum, constraint.minimumCapital / deployableCapital);
  }
  if (constraint?.maximumCapital !== undefined && deployableCapital > 0) {
    maximum = Math.min(maximum, constraint.maximumCapital / deployableCapital);
  }

  minimum = clampUnit(minimum);
  maximum = clampUnit(maximum);
  if (minimum > maximum + EPSILON) {
    throw new Error(
      `Infeasible allocation bounds for ${context.candidate.identity.candidateId}.`,
    );
  }

  if (constraint?.lockedWeight !== undefined) {
    const lockedWeight = clampUnit(constraint.lockedWeight);
    return Object.freeze({
      minimum: lockedWeight,
      maximum: lockedWeight,
      locked: true,
    });
  }

  return Object.freeze({ minimum, maximum, locked: false });
}

function distributeWeights(
  request: AiStrategyAllocationRequest,
  contexts: readonly CandidateContext[],
  deployableWeight: number,
  deployableCapital: number,
  options: NormalizedOptions,
): MutableAllocation[] {
  const items: MutableAllocation[] = contexts
    .filter((context) => context.eligible)
    .map((context) => {
      const bounds = deriveBounds(request, context, deployableCapital);
      return {
        context,
        minimumWeight: bounds.minimum,
        maximumWeight: bounds.maximum,
        locked: bounds.locked,
        weight: bounds.minimum,
        reasons: [...context.reasons],
      };
    })
    .sort((left, right) =>
      compareCandidateIds(
        left.context.candidate.identity.candidateId,
        right.context.candidate.identity.candidateId,
      ),
    );

  const minimumTotal = items.reduce((sum, item) => sum + item.minimumWeight, 0);
  if (minimumTotal > deployableWeight + EPSILON) {
    throw new Error(
      `Minimum strategy weights ${minimumTotal} exceed deployable weight ${deployableWeight}.`,
    );
  }

  let remaining = Math.max(0, deployableWeight - minimumTotal);
  let active = items.filter(
    (item) => !item.locked && item.maximumWeight - item.weight > EPSILON,
  );

  for (let pass = 0; pass < items.length + 4 && remaining > EPSILON; pass += 1) {
    if (active.length === 0) break;

    const signals = active.map((item) =>
      Math.max(
        0,
        initialMethodSignal(
          request.policy.method,
          item.context,
          options.minimumPositiveDenominator,
        ),
      ),
    );
    const signalTotal = signals.reduce((sum, value) => sum + value, 0);
    const equal = signalTotal <= options.minimumPositiveDenominator;
    let used = 0;

    for (let index = 0; index < active.length; index += 1) {
      const item = active[index];
      const share = equal ? 1 / active.length : signals[index] / signalTotal;
      const proposed = remaining * share;
      const capacity = Math.max(0, item.maximumWeight - item.weight);
      const addition = Math.min(capacity, proposed);
      item.weight += addition;
      used += addition;
    }

    remaining = Math.max(0, remaining - used);
    active = active.filter(
      (item) => item.maximumWeight - item.weight > EPSILON,
    );
    if (used <= EPSILON) break;
  }

  if (remaining > EPSILON && request.policy.fullyInvested) {
    throw new Error(
      `Unable to fully invest portfolio; ${remaining} weight remains unallocated under constraints.`,
    );
  }

  return items;
}

function applyFamilyLimits(
  request: AiStrategyAllocationRequest,
  items: MutableAllocation[],
): void {
  const maximum = request.riskBudget.constraints.maximumFamilyWeight;
  const byFamily = new Map<string, MutableAllocation[]>();
  for (const item of items) {
    const family = item.context.candidate.classification.family;
    const group = byFamily.get(family) ?? [];
    group.push(item);
    byFamily.set(family, group);
  }

  for (const [family, group] of byFamily) {
    const total = group.reduce((sum, item) => sum + item.weight, 0);
    if (total <= maximum + EPSILON) continue;
    const scale = maximum / total;
    for (const item of group) {
      if (item.locked) continue;
      const next = Math.max(item.minimumWeight, item.weight * scale);
      if (next < item.weight - EPSILON) {
        item.reasons.push(`Reduced to satisfy family limit for ${family}.`);
        item.weight = next;
      }
    }
  }
}

function applyIntelligenceTypeLimits(
  request: AiStrategyAllocationRequest,
  items: MutableAllocation[],
): void {
  const maximum =
    request.riskBudget.constraints.maximumIntelligenceTypeWeight;
  const groups = new Map<string, MutableAllocation[]>();
  for (const item of items) {
    const type = item.context.candidate.classification.intelligenceType;
    const group = groups.get(type) ?? [];
    group.push(item);
    groups.set(type, group);
  }

  for (const [type, group] of groups) {
    const total = group.reduce((sum, item) => sum + item.weight, 0);
    if (total <= maximum + EPSILON) continue;
    const scale = maximum / total;
    for (const item of group) {
      if (item.locked) continue;
      const next = Math.max(item.minimumWeight, item.weight * scale);
      if (next < item.weight - EPSILON) {
        item.reasons.push(
          `Reduced to satisfy intelligence-type limit for ${type}.`,
        );
        item.weight = next;
      }
    }
  }
}

function applyHighRiskLimit(
  request: AiStrategyAllocationRequest,
  items: MutableAllocation[],
): void {
  const maximum = request.riskBudget.constraints.maximumHighRiskWeight;
  const highRisk = items.filter((item) => {
    const level = item.context.candidate.classification.riskLevel;
    return level === "HIGH" || level === "VERY_HIGH";
  });
  const total = highRisk.reduce((sum, item) => sum + item.weight, 0);
  if (total <= maximum + EPSILON) return;
  const scale = maximum / total;
  for (const item of highRisk) {
    if (item.locked) continue;
    const next = Math.max(item.minimumWeight, item.weight * scale);
    if (next < item.weight - EPSILON) {
      item.reasons.push("Reduced to satisfy aggregate high-risk limit.");
      item.weight = next;
    }
  }
}

function ensureDeterministicFallback(
  request: AiStrategyAllocationRequest,
  items: MutableAllocation[],
  options: NormalizedOptions,
): void {
  const deterministic = items.filter((item) =>
    isDeterministicFallback(item.context.candidate),
  );
  if (deterministic.length === 0) return;
  if (deterministic.some((item) => item.weight > EPSILON)) return;

  const target = [...deterministic].sort((left, right) => {
    const scoreDiff = right.context.ranking.adjustedScore - left.context.ranking.adjustedScore;
    return Math.abs(scoreDiff) > EPSILON
      ? scoreDiff
      : compareCandidateIds(
          left.context.candidate.identity.candidateId,
          right.context.candidate.identity.candidateId,
        );
  })[0];

  const donor = [...items]
    .filter((item) => item !== target && !item.locked)
    .sort((left, right) => right.weight - left.weight)[0];
  if (!target || !donor) return;

  const transfer = Math.min(
    options.deterministicFallbackFloor,
    donor.weight - donor.minimumWeight,
    target.maximumWeight - target.weight,
  );
  if (transfer > EPSILON) {
    donor.weight -= transfer;
    target.weight += transfer;
    donor.reasons.push("Weight transferred to preserve deterministic fallback.");
    target.reasons.push("Promoted as deterministic portfolio fallback.");
  }
}

function calculateTurnover(items: readonly MutableAllocation[]): number {
  return (
    items.reduce(
      (sum, item) => sum + Math.abs(item.weight - item.context.current.weight),
      0,
    ) / 2
  );
}

function enforceTurnoverLimit(
  request: AiStrategyAllocationRequest,
  items: MutableAllocation[],
): void {
  const riskMaximum = request.riskBudget.constraints.maximumTurnover;
  const threshold = request.policy.rebalanceThresholdBps /
    AI_STRATEGY_PORTFOLIO_BASIS_POINTS_PER_UNIT;

  for (const item of items) {
    if (Math.abs(item.weight - item.context.current.weight) < threshold) {
      item.weight = clampUnit(item.context.current.weight);
      item.reasons.push("Retained current weight inside rebalance threshold.");
    }
  }

  if (riskMaximum === undefined) return;
  const turnover = calculateTurnover(items);
  if (turnover <= riskMaximum + EPSILON || turnover <= EPSILON) return;

  const scale = riskMaximum / turnover;
  for (const item of items) {
    if (item.locked) continue;
    const current = item.context.current.weight;
    item.weight = clampUnit(current + (item.weight - current) * scale);
    item.reasons.push("Weight change scaled to satisfy turnover limit.");
  }
}

function buildRiskContributions(
  items: readonly MutableAllocation[],
  precision: number,
): readonly AiStrategyRiskContribution[] {
  const raw = items.map((item) =>
    item.weight * Math.max(EPSILON, item.context.volatilityEstimate),
  );
  const total = raw.reduce((sum, value) => sum + value, 0);

  return asReadonlyArray(
    items.map((item, index) => {
      const candidateId = item.context.candidate.identity.candidateId;
      const contribution = total <= EPSILON ? 0 : raw[index] / total;
      return Object.freeze({
        candidateId,
        allocatedWeight: round(item.weight, precision),
        marginalRiskContribution: round(
          item.context.volatilityEstimate,
          precision,
        ),
        totalRiskContribution: round(contribution, precision),
        volatilityContribution: round(raw[index], precision),
        drawdownContribution: round(
          item.weight * item.context.drawdownEstimate,
          precision,
        ),
        concentrationContribution: round(item.weight ** 2, precision),
        withinBudget: item.weight <= item.maximumWeight + EPSILON,
        reasons: asReadonlyArray([
          `Risk contribution derived from allocation weight and volatility estimate.`,
        ]),
        metadata: freezeMetadata({
          volatilityEstimate: item.context.volatilityEstimate,
          drawdownEstimate: item.context.drawdownEstimate,
        }),
      });
    }),
  );
}

function buildTargetAllocations(
  request: AiStrategyAllocationRequest,
  contexts: readonly CandidateContext[],
  items: readonly MutableAllocation[],
  capitalBasis: number,
  precision: number,
): readonly AiStrategyTargetAllocation[] {
  const itemMap = new Map(
    items.map((item) => [item.context.candidate.identity.candidateId, item]),
  );

  return asReadonlyArray(
    contexts
      .map((context) => {
        const candidateId = context.candidate.identity.candidateId;
        const item = itemMap.get(candidateId);
        const targetWeight = round(item?.weight ?? 0, precision);
        const targetCapital = round(targetWeight * capitalBasis, precision);
        const currentWeight = round(context.current.weight, precision);
        const currentCapital = round(context.current.capital, precision);
        const reasons = [
          ...context.reasons,
          ...(item?.reasons ?? []),
          targetWeight > 0
            ? `Target weight assigned using ${request.policy.method}.`
            : "No target capital assigned.",
        ];

        return Object.freeze({
          candidateId,
          strategyId: context.candidate.identity.strategyId,
          strategyInstanceId: context.candidate.identity.strategyInstanceId,
          targetWeight,
          targetCapital,
          currentWeight,
          currentCapital,
          weightChange: round(targetWeight - currentWeight, precision),
          capitalChange: round(targetCapital - currentCapital, precision),
          score: round(context.score.compositeScore, precision),
          confidence: round(context.score.confidence, precision),
          riskContribution:
            item === undefined
              ? 0
              : round(
                  item.weight * item.context.volatilityEstimate,
                  precision,
                ),
          reasons: asReadonlyArray(reasons),
          metadata: freezeMetadata({
            adjustedScore: context.ranking.adjustedScore,
            baseSignal: context.baseSignal,
            volatilityEstimate: context.volatilityEstimate,
            drawdownEstimate: context.drawdownEstimate,
            eligible: context.eligible,
          }),
        });
      })
      .sort((left, right) => {
        const weightDiff = right.targetWeight - left.targetWeight;
        return Math.abs(weightDiff) > EPSILON
          ? weightDiff
          : compareCandidateIds(left.candidateId, right.candidateId);
      }),
  );
}

function expectedPortfolioVolatility(
  items: readonly MutableAllocation[],
): number {
  const variance = items.reduce(
    (sum, item) =>
      sum + (item.weight * item.context.volatilityEstimate) ** 2,
    0,
  );
  return Math.sqrt(Math.max(0, variance));
}

function expectedPortfolioDrawdown(
  items: readonly MutableAllocation[],
): number {
  return items.reduce(
    (sum, item) => sum + item.weight * item.context.drawdownEstimate,
    0,
  );
}

export class StrategyCapitalAllocationEngine
  implements AiStrategyCapitalAllocationEnginePort
{
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyCapitalAllocationEngineOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public allocate(request: AiStrategyAllocationRequest): AiStrategyAllocationResult {
    validateRequest(request);

    const minimumReserveWeight = Math.max(
      request.riskBudget.constraints.minimumCashReserveWeight,
      request.totalCapital <= EPSILON
        ? 1
        : request.riskBudget.reservedCapital / request.totalCapital,
    );
    const cashReserveWeightFloor = request.policy.allowCashReserve
      ? clampUnit(minimumReserveWeight)
      : 0;
    const deployableWeight = clampUnit(1 - cashReserveWeightFloor);
    const deployableCapital = Math.min(
      request.totalCapital * deployableWeight,
      request.riskBudget.deployableCapital,
    );

    const contexts = createContexts(request, this.options);
    const items = distributeWeights(
      request,
      contexts,
      deployableWeight,
      deployableCapital,
      this.options,
    );

    applyFamilyLimits(request, items);
    applyIntelligenceTypeLimits(request, items);
    applyHighRiskLimit(request, items);
    ensureDeterministicFallback(request, items, this.options);
    enforceTurnoverLimit(request, items);

    for (const item of items) {
      item.weight = round(clampUnit(item.weight), this.options.numericalPrecision);
    }

    const totalAllocatedWeight = round(
      items.reduce((sum, item) => sum + item.weight, 0),
      this.options.numericalPrecision,
    );
    if (totalAllocatedWeight > 1 + EPSILON) {
      throw new Error("Calculated allocation exceeds total portfolio weight.");
    }

    const cashReserveWeight = round(
      clampUnit(1 - totalAllocatedWeight),
      this.options.numericalPrecision,
    );
    if (!request.policy.allowCashReserve && cashReserveWeight > EPSILON) {
      if (request.policy.fullyInvested) {
        throw new Error(
          "Allocation left cash uninvested while cash reserve is disabled.",
        );
      }
    }

    const totalAllocatedCapital = round(
      totalAllocatedWeight * request.totalCapital,
      this.options.numericalPrecision,
    );
    const cashReserveCapital = round(
      request.totalCapital - totalAllocatedCapital,
      this.options.numericalPrecision,
    );
    const allocations = buildTargetAllocations(
      request,
      contexts,
      items,
      request.totalCapital,
      this.options.numericalPrecision,
    );
    const riskContributions = buildRiskContributions(
      items,
      this.options.numericalPrecision,
    );
    const expectedTurnover = round(
      calculateTurnover(items),
      this.options.numericalPrecision,
    );
    const expectedVolatility = round(
      expectedPortfolioVolatility(items),
      this.options.numericalPrecision,
    );
    const expectedDrawdown = round(
      expectedPortfolioDrawdown(items),
      this.options.numericalPrecision,
    );

    const warnings: string[] = [];
    if (contexts.length === 0) {
      warnings.push("No selected strategy candidates were available for allocation.");
    }
    if (items.length === 0 && request.totalCapital > 0) {
      warnings.push("No eligible strategy received capital.");
    }
    if (cashReserveWeight > cashReserveWeightFloor + EPSILON) {
      warnings.push(
        "Constraints prevented full deployment of the available capital budget.",
      );
    }
    if (
      request.riskBudget.constraints.volatilityTarget !== undefined &&
      expectedVolatility > request.riskBudget.constraints.volatilityTarget
    ) {
      warnings.push("Expected portfolio volatility exceeds the configured target.");
    }
    if (
      request.riskBudget.constraints.maximumPortfolioDrawdown !== undefined &&
      expectedDrawdown >
        Math.abs(request.riskBudget.constraints.maximumPortfolioDrawdown)
    ) {
      warnings.push("Expected portfolio drawdown exceeds the configured limit.");
    }

    return Object.freeze({
      allocationId: request.allocationId,
      runId: request.runId,
      portfolioId: request.portfolioId,
      timestamp: request.timestamp,
      method: request.policy.method,
      allocations,
      cashReserveWeight,
      cashReserveCapital,
      totalAllocatedWeight,
      totalAllocatedCapital,
      expectedTurnover,
      expectedPortfolioVolatility: expectedVolatility,
      expectedPortfolioDrawdown: expectedDrawdown,
      riskContributions,
      warnings: asReadonlyArray(warnings),
      metadata: freezeMetadata({
        candidateCount: request.candidates.length,
        selectedCandidateCount: contexts.length,
        allocatedCandidateCount: items.filter((item) => item.weight > EPSILON)
          .length,
        deployableWeight,
        deployableCapital,
        minimumCashReserveWeight: cashReserveWeightFloor,
        policyMethod: request.policy.method,
        numericalPrecision: this.options.numericalPrecision,
      }),
    });
  }
}

export function createStrategyCapitalAllocationEngine(
  options: StrategyCapitalAllocationEngineOptions = {},
): StrategyCapitalAllocationEngine {
  return new StrategyCapitalAllocationEngine(options);
}
