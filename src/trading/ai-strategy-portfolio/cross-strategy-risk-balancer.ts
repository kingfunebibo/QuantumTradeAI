/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/cross-strategy-risk-balancer.ts
 *
 * Purpose:
 * Applies deterministic cross-strategy portfolio risk constraints to a target
 * allocation without mutating the upstream allocation result.
 */

import type {
  StrategyMetadata,
  UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import type {
  AiStrategyAllocationResult,
  AiStrategyCandidate,
  AiStrategyCandidateId,
  AiStrategyCorrelationMatrix,
  AiStrategyFamily,
  AiStrategyIntelligenceType,
  AiStrategyRiskBalancerPort,
  AiStrategyRiskBudget,
  AiStrategyRiskContribution,
  AiStrategyRiskLevel,
  AiStrategyTargetAllocation,
} from "./ai-strategy-portfolio-contracts";

const EPSILON = 1e-12;
const HIGH_RISK_LEVELS: ReadonlySet<AiStrategyRiskLevel> = new Set([
  "HIGH",
  "VERY_HIGH",
]);

interface MutableAllocation {
  readonly original: AiStrategyTargetAllocation;
  readonly candidate: AiStrategyCandidate;
  weight: number;
}

interface ConstraintOutcome {
  readonly changed: boolean;
  readonly warning?: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function nonNegative(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeMetadata(value: Record<string, unknown>): StrategyMetadata {
  return Object.freeze(value) as unknown as StrategyMetadata;
}

function deterministicSort<
  T extends {
    readonly original: AiStrategyTargetAllocation;
    readonly weight: number;
  },
>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) => {
    const byWeight = right.weight - left.weight;
    if (Math.abs(byWeight) > EPSILON) {
      return byWeight;
    }

    return left.original.candidateId.localeCompare(right.original.candidateId);
  });
}

function createCandidateMap(
  candidates: readonly AiStrategyCandidate[],
): ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate> {
  const map = new Map<AiStrategyCandidateId, AiStrategyCandidate>();

  for (const candidate of candidates) {
    const candidateId = candidate.identity.candidateId;
    if (map.has(candidateId)) {
      throw new Error(`Duplicate strategy candidate: ${candidateId}.`);
    }
    map.set(candidateId, candidate);
  }

  return map;
}

function validateInputs(
  allocation: AiStrategyAllocationResult,
  candidates: readonly AiStrategyCandidate[],
  matrix: AiStrategyCorrelationMatrix,
  riskBudget: AiStrategyRiskBudget,
): void {
  if (allocation.portfolioId !== riskBudget.portfolioId) {
    throw new Error(
      `Allocation portfolio ${allocation.portfolioId} does not match risk budget portfolio ${riskBudget.portfolioId}.`,
    );
  }

  if (!Number.isFinite(riskBudget.totalCapital) || riskBudget.totalCapital < 0) {
    throw new Error("Risk budget totalCapital must be a finite non-negative number.");
  }

  if (!Number.isFinite(riskBudget.deployableCapital) || riskBudget.deployableCapital < 0) {
    throw new Error("Risk budget deployableCapital must be a finite non-negative number.");
  }

  if (riskBudget.deployableCapital - riskBudget.totalCapital > EPSILON) {
    throw new Error("Risk budget deployableCapital cannot exceed totalCapital.");
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.identity.candidateId));
  for (const target of allocation.allocations) {
    if (!candidateIds.has(target.candidateId)) {
      throw new Error(`Allocation references unknown candidate ${target.candidateId}.`);
    }
  }

  if (matrix.values.length !== matrix.candidateIds.length) {
    throw new Error("Correlation matrix row count must match candidateIds length.");
  }

  for (const row of matrix.values) {
    if (row.length !== matrix.candidateIds.length) {
      throw new Error("Correlation matrix must be square.");
    }
  }
}

function buildMutableAllocations(
  allocation: AiStrategyAllocationResult,
  candidates: readonly AiStrategyCandidate[],
): MutableAllocation[] {
  const candidateMap = createCandidateMap(candidates);

  return allocation.allocations.map((target) => {
    const candidate = candidateMap.get(target.candidateId);
    if (candidate === undefined) {
      throw new Error(`Allocation references unknown candidate ${target.candidateId}.`);
    }

    return {
      original: target,
      candidate,
      weight: nonNegative(target.targetWeight),
    };
  });
}

function scaleGroupToLimit(
  allocations: readonly MutableAllocation[],
  predicate: (allocation: MutableAllocation) => boolean,
  limit: number,
): ConstraintOutcome {
  const boundedLimit = clamp(limit, 0, 1);
  const group = allocations.filter(predicate);
  const groupWeight = group.reduce((sum, allocation) => sum + allocation.weight, 0);

  if (groupWeight <= boundedLimit + EPSILON || groupWeight <= EPSILON) {
    return { changed: false };
  }

  const scale = boundedLimit / groupWeight;
  for (const allocation of group) {
    allocation.weight *= scale;
  }

  return { changed: true };
}

function enforceMaximumStrategyWeight(
  allocations: readonly MutableAllocation[],
  maximumStrategyWeight: number,
): ConstraintOutcome {
  const limit = clamp(maximumStrategyWeight, 0, 1);
  let changed = false;

  for (const allocation of allocations) {
    if (allocation.weight > limit + EPSILON) {
      allocation.weight = limit;
      changed = true;
    }
  }

  return {
    changed,
    warning: changed
      ? `One or more strategy weights were capped at ${(limit * 100).toFixed(2)}%.`
      : undefined,
  };
}

function enforceFamilyLimits(
  allocations: readonly MutableAllocation[],
  maximumFamilyWeight: number,
): ConstraintOutcome {
  const families = new Set<AiStrategyFamily>(
    allocations.map((allocation) => allocation.candidate.classification.family),
  );
  let changed = false;

  for (const family of [...families].sort()) {
    const outcome = scaleGroupToLimit(
      allocations,
      (allocation) => allocation.candidate.classification.family === family,
      maximumFamilyWeight,
    );
    changed = changed || outcome.changed;
  }

  return {
    changed,
    warning: changed
      ? `Strategy-family exposure was reduced to respect the maximum family weight.`
      : undefined,
  };
}

function enforceIntelligenceTypeLimits(
  allocations: readonly MutableAllocation[],
  maximumIntelligenceTypeWeight: number,
): ConstraintOutcome {
  const types = new Set<AiStrategyIntelligenceType>(
    allocations.map((allocation) => allocation.candidate.classification.intelligenceType),
  );
  let changed = false;

  for (const intelligenceType of [...types].sort()) {
    const outcome = scaleGroupToLimit(
      allocations,
      (allocation) =>
        allocation.candidate.classification.intelligenceType === intelligenceType,
      maximumIntelligenceTypeWeight,
    );
    changed = changed || outcome.changed;
  }

  return {
    changed,
    warning: changed
      ? `Intelligence-type exposure was reduced to respect the configured maximum.`
      : undefined,
  };
}

function enforceHighRiskLimit(
  allocations: readonly MutableAllocation[],
  maximumHighRiskWeight: number,
): ConstraintOutcome {
  const outcome = scaleGroupToLimit(
    allocations,
    (allocation) => HIGH_RISK_LEVELS.has(allocation.candidate.classification.riskLevel),
    maximumHighRiskWeight,
  );

  return {
    changed: outcome.changed,
    warning: outcome.changed
      ? `High-risk strategy exposure was reduced to the configured portfolio limit.`
      : undefined,
  };
}

function matrixIndex(
  matrix: AiStrategyCorrelationMatrix,
): ReadonlyMap<AiStrategyCandidateId, number> {
  return new Map(matrix.candidateIds.map((candidateId, index) => [candidateId, index]));
}

function correlation(
  matrix: AiStrategyCorrelationMatrix,
  index: ReadonlyMap<AiStrategyCandidateId, number>,
  left: AiStrategyCandidateId,
  right: AiStrategyCandidateId,
): number {
  if (left === right) {
    return 1;
  }

  const leftIndex = index.get(left);
  const rightIndex = index.get(right);
  if (leftIndex === undefined || rightIndex === undefined) {
    return 0;
  }

  return clamp(matrix.values[leftIndex]?.[rightIndex] ?? 0, -1, 1);
}

function applyCorrelationPenalty(
  allocations: readonly MutableAllocation[],
  matrix: AiStrategyCorrelationMatrix,
): ConstraintOutcome {
  if (allocations.length <= 1) {
    return { changed: false };
  }

  const index = matrixIndex(matrix);
  const penalties = new Map<AiStrategyCandidateId, number>();

  for (const allocation of allocations) {
    let weightedCorrelation = 0;
    let comparisonWeight = 0;

    for (const other of allocations) {
      if (other.original.candidateId === allocation.original.candidateId) {
        continue;
      }

      const positiveCorrelation = Math.max(
        0,
        correlation(
          matrix,
          index,
          allocation.original.candidateId,
          other.original.candidateId,
        ),
      );
      weightedCorrelation += positiveCorrelation * other.weight;
      comparisonWeight += other.weight;
    }

    const averagePositiveCorrelation =
      comparisonWeight > EPSILON ? weightedCorrelation / comparisonWeight : 0;
    penalties.set(allocation.original.candidateId, clamp(averagePositiveCorrelation, 0, 1));
  }

  let changed = false;
  for (const allocation of allocations) {
    const penalty = penalties.get(allocation.original.candidateId) ?? 0;
    const scale = 1 - 0.25 * penalty;
    const nextWeight = allocation.weight * scale;
    changed = changed || Math.abs(nextWeight - allocation.weight) > EPSILON;
    allocation.weight = nextWeight;
  }

  return {
    changed,
    warning: changed
      ? "Positive cross-strategy correlation reduced concentrated risk exposure."
      : undefined,
  };
}

function normalizeToDeployableWeight(
  allocations: readonly MutableAllocation[],
  maximumDeployableWeight: number,
): void {
  const target = clamp(maximumDeployableWeight, 0, 1);
  const total = allocations.reduce((sum, allocation) => sum + allocation.weight, 0);

  if (total <= target + EPSILON || total <= EPSILON) {
    return;
  }

  const scale = target / total;
  for (const allocation of allocations) {
    allocation.weight *= scale;
  }
}

function totalPortfolioWeight(allocations: readonly MutableAllocation[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.weight, 0);
}

function createRiskContribution(
  allocation: MutableAllocation,
  allAllocations: readonly MutableAllocation[],
  matrix: AiStrategyCorrelationMatrix,
  maximumStrategyWeight: number,
): AiStrategyRiskContribution {
  const index = matrixIndex(matrix);
  let covarianceProxy = 0;

  for (const other of allAllocations) {
    covarianceProxy +=
      other.weight *
      correlation(
        matrix,
        index,
        allocation.original.candidateId,
        other.original.candidateId,
      );
  }

  const totalWeight = totalPortfolioWeight(allAllocations);
  const marginalRiskContribution = Math.max(0, covarianceProxy);
  const totalRiskContribution =
    totalWeight > EPSILON
      ? allocation.weight * marginalRiskContribution / totalWeight
      : 0;
  const concentrationContribution = allocation.weight * allocation.weight;
  const withinBudget = allocation.weight <= maximumStrategyWeight + EPSILON;

  const reasons = [
    `Final weight ${(allocation.weight * 100).toFixed(4)}%.`,
    `Marginal correlation-risk proxy ${marginalRiskContribution.toFixed(6)}.`,
    withinBudget
      ? "Strategy weight is within its portfolio risk limit."
      : "Strategy weight exceeds its portfolio risk limit.",
  ];

  return Object.freeze({
    candidateId: allocation.original.candidateId,
    allocatedWeight: allocation.weight,
    marginalRiskContribution,
    totalRiskContribution,
    concentrationContribution,
    withinBudget,
    reasons: freezeArray(reasons),
    metadata: freezeMetadata({
      source: "cross-strategy-risk-balancer",
      riskLevel: allocation.candidate.classification.riskLevel,
      family: allocation.candidate.classification.family,
      intelligenceType: allocation.candidate.classification.intelligenceType,
    }),
  });
}

function createTargetAllocation(
  allocation: MutableAllocation,
  totalCapital: number,
): AiStrategyTargetAllocation {
  const targetWeight = nonNegative(allocation.weight);
  const targetCapital = totalCapital * targetWeight;
  const reasons = [
    ...allocation.original.reasons,
    "Cross-strategy risk balancing applied.",
  ];

  return Object.freeze({
    ...allocation.original,
    targetWeight,
    targetCapital,
    weightChange: targetWeight - allocation.original.currentWeight,
    capitalChange: targetCapital - allocation.original.currentCapital,
    reasons: freezeArray(reasons),
    metadata: freezeMetadata({
      source: "cross-strategy-risk-balancer",
      originalTargetWeight: allocation.original.targetWeight,
      originalTargetCapital: allocation.original.targetCapital,
      balancedTargetWeight: targetWeight,
      balancedTargetCapital: targetCapital,
    }),
  });
}

function calculateTurnover(allocations: readonly AiStrategyTargetAllocation[]): number {
  return allocations.reduce(
    (sum, allocation) => sum + Math.abs(allocation.weightChange),
    0,
  ) / 2;
}

function estimateVolatility(
  allocations: readonly MutableAllocation[],
  matrix: AiStrategyCorrelationMatrix,
): number | undefined {
  if (allocations.length === 0) {
    return undefined;
  }

  const index = matrixIndex(matrix);
  let variance = 0;

  for (const left of allocations) {
    for (const right of allocations) {
      variance +=
        left.weight *
        right.weight *
        correlation(
          matrix,
          index,
          left.original.candidateId,
          right.original.candidateId,
        );
    }
  }

  return Math.sqrt(Math.max(0, variance));
}

export class CrossStrategyRiskBalancer implements AiStrategyRiskBalancerPort {
  public balance(
    allocation: AiStrategyAllocationResult,
    candidates: readonly AiStrategyCandidate[],
    correlationMatrix: AiStrategyCorrelationMatrix,
    riskBudget: AiStrategyRiskBudget,
  ): AiStrategyAllocationResult {
    validateInputs(allocation, candidates, correlationMatrix, riskBudget);

    const mutable = buildMutableAllocations(allocation, candidates);
    const warnings = [...allocation.warnings];
    const constraints = riskBudget.constraints;

    const outcomes: readonly ConstraintOutcome[] = [
      enforceMaximumStrategyWeight(mutable, constraints.maximumStrategyWeight),
      enforceFamilyLimits(mutable, constraints.maximumFamilyWeight),
      enforceIntelligenceTypeLimits(
        mutable,
        constraints.maximumIntelligenceTypeWeight,
      ),
      enforceHighRiskLimit(mutable, constraints.maximumHighRiskWeight),
      applyCorrelationPenalty(mutable, correlationMatrix),
    ];

    for (const outcome of outcomes) {
      if (outcome.warning !== undefined && !warnings.includes(outcome.warning)) {
        warnings.push(outcome.warning);
      }
    }

    const deployableWeightFromCapital =
      riskBudget.totalCapital > EPSILON
        ? riskBudget.deployableCapital / riskBudget.totalCapital
        : 0;
    const maximumDeployableWeight = Math.min(
      clamp(deployableWeightFromCapital, 0, 1),
      1 - clamp(constraints.minimumCashReserveWeight, 0, 1),
    );

    normalizeToDeployableWeight(mutable, maximumDeployableWeight);

    const sortedMutable = deterministicSort(mutable);
    const targets = freezeArray(
      sortedMutable.map((item) => createTargetAllocation(item, riskBudget.totalCapital)),
    );
    const totalAllocatedWeight = targets.reduce(
      (sum, target) => sum + target.targetWeight,
      0,
    );
    const totalAllocatedCapital = targets.reduce(
      (sum, target) => sum + target.targetCapital,
      0,
    );
    const cashReserveWeight = clamp(1 - totalAllocatedWeight, 0, 1);
    const cashReserveCapital = Math.max(
      riskBudget.reservedCapital,
      riskBudget.totalCapital - totalAllocatedCapital,
    );

    const riskContributions = freezeArray(
      sortedMutable.map((item) =>
        createRiskContribution(
          item,
          sortedMutable,
          correlationMatrix,
          constraints.maximumStrategyWeight,
        ),
      ),
    );

    const expectedPortfolioVolatility = estimateVolatility(
      sortedMutable,
      correlationMatrix,
    );
    const expectedPortfolioDrawdown =
      constraints.maximumPortfolioDrawdown === undefined
        ? allocation.expectedPortfolioDrawdown
        : Math.min(
            allocation.expectedPortfolioDrawdown ?? constraints.maximumPortfolioDrawdown,
            constraints.maximumPortfolioDrawdown,
          );

    const timestamp: UnixTimestampMilliseconds = Math.max(
      allocation.timestamp,
      riskBudget.timestamp,
      correlationMatrix.timestamp,
    );

    return Object.freeze({
      ...allocation,
      timestamp,
      allocations: targets,
      cashReserveWeight,
      cashReserveCapital,
      totalAllocatedWeight,
      totalAllocatedCapital,
      expectedTurnover: calculateTurnover(targets),
      expectedPortfolioVolatility,
      expectedPortfolioDrawdown,
      riskContributions,
      warnings: freezeArray(warnings),
      metadata: freezeMetadata({
        source: "cross-strategy-risk-balancer",
        riskBudgetId: riskBudget.riskBudgetId,
        originalAllocatedWeight: allocation.totalAllocatedWeight,
        balancedAllocatedWeight: totalAllocatedWeight,
        originalCashReserveWeight: allocation.cashReserveWeight,
        balancedCashReserveWeight: cashReserveWeight,
        maximumDeployableWeight,
        candidateCount: targets.length,
        correlationLookbackObservations: correlationMatrix.lookbackObservations,
      }),
    });
  }
}

export function createCrossStrategyRiskBalancer(): AiStrategyRiskBalancerPort {
  return new CrossStrategyRiskBalancer();
}
