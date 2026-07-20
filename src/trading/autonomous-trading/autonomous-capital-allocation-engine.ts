/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 5: Autonomous capital allocation engine.
 *
 * Responsibilities:
 * - allocate portfolio capital across multiple autonomous strategies
 * - preserve required reserves and cash buffers
 * - enforce strategy minimums, maximums, and concentration caps
 * - combine performance, stability, and risk into deterministic weights
 * - support partial allocation when capital is constrained
 * - generate immutable rebalance decisions
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousCapitalAllocationDecision,
  type AutonomousCapitalAllocationRequest,
  type AutonomousStrategyAllocation,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousCapitalAllocationEngineOptions {
  readonly performanceWeight?: number;
  readonly stabilityWeight?: number;
  readonly riskWeight?: number;
  readonly requestedCapitalWeight?: number;
  readonly currentAllocationWeight?: number;
  readonly minimumScore?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedCapitalAllocationEngineOptions {
  readonly performanceWeight: number;
  readonly stabilityWeight: number;
  readonly riskWeight: number;
  readonly requestedCapitalWeight: number;
  readonly currentAllocationWeight: number;
  readonly minimumScore: number;
  readonly numericalTolerance: number;
}

interface ScoredCandidate {
  readonly index: number;
  readonly strategyId: string;
  readonly requestedCapital: number;
  readonly minimumCapital: number;
  readonly maximumCapital: number;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly riskScore: number;
  readonly currentAllocation: number;
  readonly rawScore: number;
  readonly normalizedScore: number;
  readonly approved: boolean;
  readonly rejectionReason?: string;
}

interface MutableAllocation {
  readonly candidate: ScoredCandidate;
  allocatedCapital: number;
}

const DEFAULT_OPTIONS: Readonly<ResolvedCapitalAllocationEngineOptions> =
  Object.freeze({
    performanceWeight: 0.35,
    stabilityWeight: 0.20,
    riskWeight: 0.25,
    requestedCapitalWeight: 0.10,
    currentAllocationWeight: 0.10,
    minimumScore: 0,
    numericalTolerance: 1e-8,
  });

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const copy: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(copy);
}

function freezeAllocation(
  allocation: AutonomousStrategyAllocation,
): AutonomousStrategyAllocation {
  return Object.freeze({
    ...allocation,
    metadata: freezeMetadata(allocation.metadata),
  });
}

function freezeDecision(
  decision: AutonomousCapitalAllocationDecision,
): AutonomousCapitalAllocationDecision {
  return Object.freeze({
    ...decision,
    allocations: Object.freeze(decision.allocations.map(freezeAllocation)),
    metadata: freezeMetadata(decision.metadata),
  });
}

export class AutonomousCapitalAllocationEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedCapitalAllocationEngineOptions;
  private decisionSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousCapitalAllocationEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const resolved: ResolvedCapitalAllocationEngineOptions = {
      performanceWeight:
        options.performanceWeight ?? DEFAULT_OPTIONS.performanceWeight,
      stabilityWeight:
        options.stabilityWeight ?? DEFAULT_OPTIONS.stabilityWeight,
      riskWeight:
        options.riskWeight ?? DEFAULT_OPTIONS.riskWeight,
      requestedCapitalWeight:
        options.requestedCapitalWeight ??
        DEFAULT_OPTIONS.requestedCapitalWeight,
      currentAllocationWeight:
        options.currentAllocationWeight ??
        DEFAULT_OPTIONS.currentAllocationWeight,
      minimumScore:
        options.minimumScore ?? DEFAULT_OPTIONS.minimumScore,
      numericalTolerance:
        options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
    };

    for (const [name, value] of [
      ["performanceWeight", resolved.performanceWeight],
      ["stabilityWeight", resolved.stabilityWeight],
      ["riskWeight", resolved.riskWeight],
      ["requestedCapitalWeight", resolved.requestedCapitalWeight],
      ["currentAllocationWeight", resolved.currentAllocationWeight],
      ["minimumScore", resolved.minimumScore],
    ] as const) {
      assertNonNegativeFinite(value, name);
    }

    assertPositiveFinite(
      resolved.numericalTolerance,
      "numericalTolerance",
    );

    const totalWeight =
      resolved.performanceWeight +
      resolved.stabilityWeight +
      resolved.riskWeight +
      resolved.requestedCapitalWeight +
      resolved.currentAllocationWeight;

    if (totalWeight <= 0) {
      throw new RangeError(
        "At least one capital-allocation scoring weight must be positive.",
      );
    }

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public allocate(
    request: AutonomousCapitalAllocationRequest,
  ): AutonomousCapitalAllocationDecision {
    const validation =
      this.validator.validateCapitalAllocationRequest(request);
    this.validator.assertValid(
      validation,
      "Capital allocation request is invalid.",
    );

    const decidedAt = this.clock.now();
    assertNonNegativeFinite(decidedAt, "clock.now()");

    const constraints = request.constraints;
    const reserveCapital = Math.max(
      constraints.reserveCapital,
      constraints.minimumCashBuffer,
    );

    const allocatableByReserve = Math.max(
      0,
      constraints.totalCapital - reserveCapital,
    );

    const allocatableCapital = Math.min(
      allocatableByReserve,
      constraints.maximumAllocatedCapital,
    );

    const scoredCandidates = this.scoreCandidates(
      request,
      allocatableCapital,
    );

    const approvedCandidates = scoredCandidates.filter(
      (candidate) => candidate.approved,
    );

    const mutableAllocations: MutableAllocation[] =
      approvedCandidates.map((candidate) => ({
        candidate,
        allocatedCapital: 0,
      }));

    this.assignMinimumAllocations(
      mutableAllocations,
      allocatableCapital,
      constraints.allowPartialAllocation,
    );

    this.distributeRemainingCapital(
      mutableAllocations,
      allocatableCapital,
      constraints.maximumStrategyConcentration,
    );

    this.enforceCorrelatedExposureCap(
      mutableAllocations,
      constraints.maximumCorrelatedExposure,
    );

    this.normalizeNumericalResidual(
      mutableAllocations,
      allocatableCapital,
    );

    const allocations = this.buildAllocations(
      scoredCandidates,
      mutableAllocations,
      allocatableCapital,
    );

    const totalAllocatedCapital = allocations.reduce(
      (sum, allocation) => sum + allocation.allocatedCapital,
      0,
    );

    const unallocatedCapital = Math.max(
      0,
      constraints.totalCapital -
        reserveCapital -
        totalAllocatedCapital,
    );

    const concentration = this.calculateConcentration(
      allocations,
      totalAllocatedCapital,
    );

    const decision = freezeDecision({
      decisionId: this.idFactory.create(
        "capital-allocation-decision",
        decidedAt,
        this.decisionSequence++,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      totalAllocatedCapital,
      reserveCapital,
      unallocatedCapital,
      concentration,
      allocations,
      decidedAt,
      reason: this.buildDecisionReason(
        request,
        totalAllocatedCapital,
        allocatableCapital,
        approvedCandidates.length,
      ),
      metadata: freezeMetadata({
        candidateCount: request.candidates.length,
        approvedCandidateCount: approvedCandidates.length,
        allocatableCapital,
        allocationMethod: "DETERMINISTIC_WEIGHTED_WATERFALL",
      }),
    });

    const decisionValidation =
      this.validator.validateCapitalAllocationDecision(decision);
    this.validator.assertValid(
      decisionValidation,
      "Generated capital allocation decision is invalid.",
    );

    return decision;
  }

  private scoreCandidates(
    request: AutonomousCapitalAllocationRequest,
    allocatableCapital: number,
  ): readonly ScoredCandidate[] {
    const requestedMaximum = Math.max(
      ...request.candidates.map((candidate) => candidate.requestedCapital),
      1,
    );

    const currentMaximum = Math.max(
      ...request.candidates.map((candidate) => candidate.currentAllocation),
      1,
    );

    const raw = request.candidates.map((candidate, index) => {
      const performanceScore = clamp(
        candidate.performance.recentPerformanceScore,
        0,
        1,
      );
      const stabilityScore = clamp(
        candidate.performance.stabilityScore,
        0,
        1,
      );
      const inverseRiskScore = 1 - clamp(candidate.riskScore, 0, 1);
      const requestedScore = clamp(
        safeRatio(candidate.requestedCapital, requestedMaximum),
        0,
        1,
      );
      const currentScore = clamp(
        safeRatio(candidate.currentAllocation, currentMaximum),
        0,
        1,
      );

      const rawScore =
        performanceScore * this.options.performanceWeight +
        stabilityScore * this.options.stabilityWeight +
        inverseRiskScore * this.options.riskWeight +
        requestedScore * this.options.requestedCapitalWeight +
        currentScore * this.options.currentAllocationWeight;

      const effectiveMaximum = Math.min(
        candidate.maximumCapital,
        candidate.maximumWeight * allocatableCapital,
        candidate.requestedCapital,
      );

      let rejectionReason: string | undefined;
      if (rawScore < this.options.minimumScore) {
        rejectionReason =
          "Candidate score is below the minimum allocation score.";
      } else if (effectiveMaximum <= this.options.numericalTolerance) {
        rejectionReason =
          "Candidate has no allocatable capacity after limits.";
      } else if (
        candidate.minimumCapital > effectiveMaximum &&
        !request.constraints.allowPartialAllocation
      ) {
        rejectionReason =
          "Candidate minimum capital exceeds its effective maximum.";
      }

      return {
        index,
        strategyId: candidate.strategyId,
        requestedCapital: candidate.requestedCapital,
        minimumCapital: candidate.minimumCapital,
        maximumCapital: effectiveMaximum,
        minimumWeight: candidate.minimumWeight,
        maximumWeight: candidate.maximumWeight,
        riskScore: candidate.riskScore,
        currentAllocation: candidate.currentAllocation,
        rawScore,
        normalizedScore: 0,
        approved: rejectionReason === undefined,
        rejectionReason,
      };
    });

    const approvedScoreTotal = raw
      .filter((candidate) => candidate.approved)
      .reduce((sum, candidate) => sum + candidate.rawScore, 0);

    return Object.freeze(
      raw.map((candidate) =>
        Object.freeze({
          ...candidate,
          normalizedScore:
            candidate.approved && approvedScoreTotal > 0
              ? candidate.rawScore / approvedScoreTotal
              : 0,
        }),
      ),
    );
  }

  private assignMinimumAllocations(
    allocations: MutableAllocation[],
    allocatableCapital: number,
    allowPartialAllocation: boolean,
  ): void {
    if (allocations.length === 0 || allocatableCapital <= 0) {
      return;
    }

    const ordered = [...allocations].sort((left, right) => {
      const scoreDifference =
        right.candidate.normalizedScore -
        left.candidate.normalizedScore;

      if (Math.abs(scoreDifference) > this.options.numericalTolerance) {
        return scoreDifference;
      }

      return left.candidate.strategyId.localeCompare(
        right.candidate.strategyId,
      );
    });

    let remaining = allocatableCapital;

    for (const allocation of ordered) {
      if (remaining <= this.options.numericalTolerance) {
        break;
      }

      const candidate = allocation.candidate;
      const minimumByWeight =
        candidate.minimumWeight * allocatableCapital;
      const desiredMinimum = Math.min(
        candidate.maximumCapital,
        Math.max(candidate.minimumCapital, minimumByWeight),
      );

      if (desiredMinimum <= remaining) {
        allocation.allocatedCapital = desiredMinimum;
        remaining -= desiredMinimum;
        continue;
      }

      if (allowPartialAllocation) {
        allocation.allocatedCapital = Math.min(
          remaining,
          candidate.maximumCapital,
        );
        remaining -= allocation.allocatedCapital;
      }
    }
  }

  private distributeRemainingCapital(
    allocations: MutableAllocation[],
    allocatableCapital: number,
    maximumStrategyConcentration: number,
  ): void {
    if (allocations.length === 0 || allocatableCapital <= 0) {
      return;
    }

    let remaining =
      allocatableCapital -
      allocations.reduce(
        (sum, allocation) => sum + allocation.allocatedCapital,
        0,
      );

    let iteration = 0;
    const maximumIterations = allocations.length * 8 + 32;

    while (
      remaining > this.options.numericalTolerance &&
      iteration < maximumIterations
    ) {
      iteration += 1;

      const eligible = allocations.filter((allocation) => {
        const concentrationCap =
          maximumStrategyConcentration * allocatableCapital;
        const hardCap = Math.min(
          allocation.candidate.maximumCapital,
          concentrationCap,
        );

        return (
          allocation.allocatedCapital + this.options.numericalTolerance <
          hardCap
        );
      });

      if (eligible.length === 0) {
        break;
      }

      const totalScore = eligible.reduce(
        (sum, allocation) =>
          sum + Math.max(allocation.candidate.normalizedScore, 0),
        0,
      );

      let distributedThisIteration = 0;

      for (const allocation of eligible) {
        const concentrationCap =
          maximumStrategyConcentration * allocatableCapital;
        const hardCap = Math.min(
          allocation.candidate.maximumCapital,
          concentrationCap,
        );

        const availableCapacity = Math.max(
          0,
          hardCap - allocation.allocatedCapital,
        );

        const share =
          totalScore > 0
            ? allocation.candidate.normalizedScore / totalScore
            : 1 / eligible.length;

        const proposed = remaining * share;
        const granted = Math.min(proposed, availableCapacity);

        allocation.allocatedCapital += granted;
        distributedThisIteration += granted;
      }

      if (distributedThisIteration <= this.options.numericalTolerance) {
        break;
      }

      remaining -= distributedThisIteration;
    }
  }

  private enforceCorrelatedExposureCap(
    allocations: MutableAllocation[],
    maximumCorrelatedExposure: number,
  ): void {
    if (
      maximumCorrelatedExposure <= 0 ||
      allocations.length === 0
    ) {
      return;
    }

    const total = allocations.reduce(
      (sum, allocation) => sum + allocation.allocatedCapital,
      0,
    );

    if (
      total <= maximumCorrelatedExposure +
        this.options.numericalTolerance
    ) {
      return;
    }

    const scale = maximumCorrelatedExposure / total;
    for (const allocation of allocations) {
      allocation.allocatedCapital *= scale;
    }
  }

  private normalizeNumericalResidual(
    allocations: MutableAllocation[],
    allocatableCapital: number,
  ): void {
    if (allocations.length === 0) {
      return;
    }

    const total = allocations.reduce(
      (sum, allocation) => sum + allocation.allocatedCapital,
      0,
    );

    const excess = total - allocatableCapital;
    if (excess <= this.options.numericalTolerance) {
      return;
    }

    const ordered = [...allocations].sort(
      (left, right) =>
        left.candidate.normalizedScore -
        right.candidate.normalizedScore,
    );

    let remainingExcess = excess;

    for (const allocation of ordered) {
      if (remainingExcess <= this.options.numericalTolerance) {
        break;
      }

      const reduction = Math.min(
        allocation.allocatedCapital,
        remainingExcess,
      );
      allocation.allocatedCapital -= reduction;
      remainingExcess -= reduction;
    }
  }

  private buildAllocations(
    scoredCandidates: readonly ScoredCandidate[],
    mutableAllocations: readonly MutableAllocation[],
    allocatableCapital: number,
  ): readonly AutonomousStrategyAllocation[] {
    const allocatedByStrategy = new Map(
      mutableAllocations.map((allocation) => [
        allocation.candidate.strategyId,
        allocation.allocatedCapital,
      ]),
    );

    return Object.freeze(
      scoredCandidates
        .map((candidate) => {
          const allocatedCapital =
            allocatedByStrategy.get(candidate.strategyId) ?? 0;

          const allocationWeight =
            allocatableCapital > 0
              ? allocatedCapital / allocatableCapital
              : 0;

          const approved =
            candidate.approved &&
            allocatedCapital > this.options.numericalTolerance;

          let reason: string;
          if (!candidate.approved) {
            reason =
              candidate.rejectionReason ??
              "Candidate was rejected by allocation scoring.";
          } else if (!approved) {
            reason =
              "Candidate was eligible but no capital remained after constraints.";
          } else if (
            allocatedCapital + this.options.numericalTolerance <
            candidate.requestedCapital
          ) {
            reason =
              "Candidate received a constrained partial allocation.";
          } else {
            reason =
              "Candidate received its requested allocation.";
          }

          return freezeAllocation({
            strategyId: candidate.strategyId,
            requestedCapital: candidate.requestedCapital,
            allocatedCapital,
            allocationWeight: clamp(allocationWeight, 0, 1),
            previousAllocation: candidate.currentAllocation,
            allocationChange:
              allocatedCapital - candidate.currentAllocation,
            approved,
            reason,
            metadata: freezeMetadata({
              rawScore: candidate.rawScore,
              normalizedScore: candidate.normalizedScore,
              riskScore: candidate.riskScore,
              effectiveMaximumCapital: candidate.maximumCapital,
            }),
          });
        })
        .sort((left, right) =>
          left.strategyId.localeCompare(right.strategyId),
        ),
    );
  }

  private calculateConcentration(
    allocations: readonly AutonomousStrategyAllocation[],
    totalAllocatedCapital: number,
  ): number {
    if (totalAllocatedCapital <= 0) {
      return 0;
    }

    return allocations.reduce((maximum, allocation) => {
      const weight =
        allocation.allocatedCapital / totalAllocatedCapital;
      return Math.max(maximum, weight);
    }, 0);
  }

  private buildDecisionReason(
    request: AutonomousCapitalAllocationRequest,
    totalAllocatedCapital: number,
    allocatableCapital: number,
    approvedCandidateCount: number,
  ): string {
    if (approvedCandidateCount === 0) {
      return "No strategy candidates passed allocation constraints.";
    }

    if (totalAllocatedCapital <= this.options.numericalTolerance) {
      return "No capital was allocated after reserve and strategy constraints.";
    }

    if (
      totalAllocatedCapital + this.options.numericalTolerance <
      allocatableCapital
    ) {
      return (
        "Capital was partially allocated because strategy limits, " +
        "concentration limits, or requested amounts constrained deployment."
      );
    }

    if (
      totalAllocatedCapital >
      request.constraints.totalCapital + this.options.numericalTolerance
    ) {
      return "Allocation was normalized to remain within total capital.";
    }

    return (
      "Available capital was allocated deterministically using performance, " +
      "stability, risk, requested-capital, and current-allocation weights."
    );
  }
}

export function createAutonomousCapitalAllocationEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousCapitalAllocationEngineOptions = {},
): AutonomousCapitalAllocationEngine {
  return new AutonomousCapitalAllocationEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}