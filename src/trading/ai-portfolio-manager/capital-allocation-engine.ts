/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 8: Deterministic capital allocation engine.
 */

import {
  PortfolioAllocationAction,
  type PortfolioAllocationTarget,
  type PortfolioCapitalAllocation,
  type PortfolioCapitalAllocationRequest,
  type PortfolioCapitalAllocationResult,
  type PortfolioCapitalAllocator,
  type PortfolioMetadata,
  type Timestamp,
} from "./ai-portfolio-contracts";

export interface CapitalAllocationClock {
  now(): number;
}

export interface CapitalAllocationEngineOptions {
  readonly numericalTolerance?: number;
  readonly resultTimeToLiveMilliseconds?: number;
  readonly preserveDisabledTargetCapital?: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedOptions {
  readonly numericalTolerance: number;
  readonly resultTimeToLiveMilliseconds?: number;
  readonly preserveDisabledTargetCapital: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface NormalizedTarget {
  readonly source: PortfolioAllocationTarget;
  readonly currentCapital: number;
  readonly currentWeight: number;
  readonly minimumCapital: number;
  readonly maximumCapital: number;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly score: number;
}

const SYSTEM_CLOCK: CapitalAllocationClock = Object.freeze({
  now: (): number => Date.now(),
});

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function resolveOptions(
  options: CapitalAllocationEngineOptions | undefined,
): ResolvedOptions {
  const numericalTolerance = options?.numericalTolerance ?? 1e-10;
  assertFinite(numericalTolerance, "options.numericalTolerance");

  if (numericalTolerance <= 0) {
    throw new RangeError(
      "options.numericalTolerance must be greater than zero.",
    );
  }

  if (options?.resultTimeToLiveMilliseconds !== undefined) {
    assertFinite(
      options.resultTimeToLiveMilliseconds,
      "options.resultTimeToLiveMilliseconds",
    );

    if (options.resultTimeToLiveMilliseconds <= 0) {
      throw new RangeError(
        "options.resultTimeToLiveMilliseconds must be greater than zero.",
      );
    }
  }

  return Object.freeze({
    numericalTolerance,
    resultTimeToLiveMilliseconds:
      options?.resultTimeToLiveMilliseconds,
    preserveDisabledTargetCapital:
      options?.preserveDisabledTargetCapital ?? true,
    metadata: cloneMetadata(options?.metadata),
  });
}

function normalizeTimestamp(
  timestamp: Timestamp,
  field: string,
): Timestamp {
  assertNonEmpty(timestamp, field);
  const milliseconds = Date.parse(timestamp);

  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${field} must be a valid timestamp.`);
  }

  return new Date(milliseconds).toISOString();
}

function optionalNonNegative(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  assertFinite(value, field);

  if (value < 0) {
    throw new RangeError(`${field} must be non-negative.`);
  }

  return value;
}

function optionalWeight(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  assertFinite(value, field);

  if (value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1.`);
  }

  return value;
}

function targetMaximumWeight(
  target: PortfolioAllocationTarget,
  request: PortfolioCapitalAllocationRequest,
): number {
  const policyMaximum =
    target.targetType === ("ASSET" as typeof target.targetType)
      ? request.policy.maximumSingleAssetWeight
      : target.targetType === ("STRATEGY" as typeof target.targetType)
        ? request.policy.maximumSingleStrategyWeight
        : target.targetType === ("BOT" as typeof target.targetType)
          ? request.policy.maximumSingleBotWeight
          : target.targetType === ("EXCHANGE" as typeof target.targetType)
            ? request.policy.maximumSingleExchangeWeight
            : 1;

  return Math.min(target.maximumWeight ?? policyMaximum, policyMaximum);
}

function normalizeTargets(
  request: PortfolioCapitalAllocationRequest,
): readonly NormalizedTarget[] {
  if (!Array.isArray(request.targets) || request.targets.length === 0) {
    throw new RangeError(
      "request.targets must contain at least one allocation target.",
    );
  }

  const seen = new Set<string>();

  return Object.freeze(
    request.targets
      .map((target, index): NormalizedTarget => {
        const field = `request.targets[${index}]`;
        assertNonEmpty(target.targetId, `${field}.targetId`);
        assertFinite(target.currentCapital, `${field}.currentCapital`);
        assertFinite(target.currentWeight, `${field}.currentWeight`);

        if (target.currentCapital < 0) {
          throw new RangeError(
            `${field}.currentCapital must be non-negative.`,
          );
        }

        if (target.currentWeight < 0 || target.currentWeight > 1) {
          throw new RangeError(
            `${field}.currentWeight must be between 0 and 1.`,
          );
        }

        const key = `${String(target.targetType)}:${target.targetId}`;
        if (seen.has(key)) {
          throw new Error(`request.targets contains duplicate target ${key}.`);
        }
        seen.add(key);

        const minimumCapital = optionalNonNegative(
          target.minimumCapital,
          0,
          `${field}.minimumCapital`,
        );
        const maximumCapital = optionalNonNegative(
          target.maximumCapital,
          Number.POSITIVE_INFINITY,
          `${field}.maximumCapital`,
        );
        const minimumWeight = optionalWeight(
          target.minimumWeight,
          0,
          `${field}.minimumWeight`,
        );
        const maximumWeight = optionalWeight(
          targetMaximumWeight(target, request),
          1,
          `${field}.maximumWeight`,
        );

        if (minimumCapital > maximumCapital) {
          throw new RangeError(
            `${field}.minimumCapital cannot exceed maximumCapital.`,
          );
        }

        if (minimumWeight > maximumWeight) {
          throw new RangeError(
            `${field}.minimumWeight cannot exceed maximumWeight.`,
          );
        }

        const performance = target.performanceScore ?? 0.5;
        const health = target.healthScore ?? 0.5;
        const liquidity = target.liquidityScore ?? 0.5;
        const expectedReturn = target.expectedReturn ?? 0;
        const expectedRisk = Math.max(target.expectedRisk ?? 0, 0);

        for (const [name, value] of [
          [`${field}.performanceScore`, performance],
          [`${field}.healthScore`, health],
          [`${field}.liquidityScore`, liquidity],
          [`${field}.expectedReturn`, expectedReturn],
          [`${field}.expectedRisk`, expectedRisk],
        ] as const) {
          assertFinite(value, name);
        }

        const score =
          Math.max(0, performance) * 0.25 +
          Math.max(0, health) * 0.25 +
          Math.max(0, liquidity) * 0.20 +
          Math.max(0, expectedReturn) * 0.30 -
          expectedRisk * 0.30;

        return Object.freeze({
          source: target,
          currentCapital: target.currentCapital,
          currentWeight: target.currentWeight,
          minimumCapital,
          maximumCapital,
          minimumWeight,
          maximumWeight,
          score: Math.max(score, 0),
        });
      })
      .sort((left, right) => {
        const typeComparison = String(left.source.targetType).localeCompare(
          String(right.source.targetType),
        );

        return typeComparison !== 0
          ? typeComparison
          : left.source.targetId.localeCompare(right.source.targetId);
      }),
  );
}

function resolveAction(
  capitalChange: number,
  previousCapital: number,
  allocatedCapital: number,
  tolerance: number,
): PortfolioAllocationAction {
  const values = PortfolioAllocationAction as unknown as Record<
    string,
    PortfolioAllocationAction
  >;

  const candidates =
    allocatedCapital <= tolerance && previousCapital > tolerance
      ? ["REMOVE", "DEALLOCATE", "EXIT", "CLOSE", "REDUCE"]
      : previousCapital <= tolerance && allocatedCapital > tolerance
        ? ["ADD", "ALLOCATE", "ENTER", "OPEN", "INCREASE"]
        : capitalChange > tolerance
          ? ["INCREASE", "ADD", "ALLOCATE"]
          : capitalChange < -tolerance
            ? ["DECREASE", "REDUCE", "DEALLOCATE"]
            : ["HOLD", "MAINTAIN", "UNCHANGED", "NO_CHANGE"];

  for (const candidate of candidates) {
    const value = values[candidate];
    if (value !== undefined) {
      return value;
    }
  }

  const fallback = Object.values(values)[0];
  if (fallback === undefined) {
    throw new Error("PortfolioAllocationAction does not define any values.");
  }

  return fallback;
}

function optimizationWeightByTarget(
  request: PortfolioCapitalAllocationRequest,
): ReadonlyMap<string, number> {
  const weights = new Map<string, number>();

  for (const weight of request.optimizationResult?.weights ?? []) {
    weights.set(weight.asset, weight.optimizedWeight);
  }

  return weights;
}

function calculateAllocations(
  request: PortfolioCapitalAllocationRequest,
  targets: readonly NormalizedTarget[],
  totalCapital: number,
  allocatableCapital: number,
  options: ResolvedOptions,
): readonly number[] {
  const optimizationWeights = optimizationWeightByTarget(request);

  const allocations = targets.map((target) => {
    if (!target.source.enabled) {
      return options.preserveDisabledTargetCapital
        ? Math.min(target.currentCapital, target.maximumCapital)
        : 0;
    }

    const optimizedWeight = optimizationWeights.get(target.source.targetId);
    const baseWeight =
      optimizedWeight ??
      Math.max(target.currentWeight, target.minimumWeight);

    return Math.min(
      target.maximumCapital,
      Math.max(
        target.minimumCapital,
        Math.min(target.maximumWeight, baseWeight) * totalCapital,
      ),
    );
  });

  let remaining = allocatableCapital - allocations.reduce(
    (total, allocation) => total + allocation,
    0,
  );

  if (remaining > options.numericalTolerance) {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const candidates = targets
        .map((target, index) => ({
          index,
          room: target.source.enabled
            ? Math.max(
                0,
                Math.min(
                  target.maximumCapital,
                  target.maximumWeight * totalCapital,
                ) - allocations[index]!,
              )
            : 0,
          score: target.score,
        }))
        .filter((candidate) => candidate.room > options.numericalTolerance);

      if (candidates.length === 0) {
        break;
      }

      const scoreTotal = candidates.reduce(
        (total, candidate) => total + candidate.score,
        0,
      );

      let distributed = 0;

      for (const candidate of candidates) {
        const share =
          scoreTotal > options.numericalTolerance
            ? remaining * (candidate.score / scoreTotal)
            : remaining / candidates.length;
        const amount = Math.min(candidate.room, share);
        allocations[candidate.index] =
          allocations[candidate.index]! + amount;
        distributed += amount;
      }

      remaining -= distributed;

      if (distributed <= options.numericalTolerance) {
        break;
      }
    }
  }

  if (remaining < -options.numericalTolerance) {
    let excess = -remaining;

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const candidates = targets
        .map((target, index) => ({
          index,
          reducible: Math.max(
            0,
            allocations[index]! -
              Math.max(
                target.minimumCapital,
                target.minimumWeight * totalCapital,
              ),
          ),
        }))
        .filter(
          (candidate) =>
            candidate.reducible > options.numericalTolerance,
        );

      if (candidates.length === 0) {
        break;
      }

      const reducibleTotal = candidates.reduce(
        (total, candidate) => total + candidate.reducible,
        0,
      );

      let reduced = 0;

      for (const candidate of candidates) {
        const amount = Math.min(
          candidate.reducible,
          excess * (candidate.reducible / reducibleTotal),
        );
        allocations[candidate.index] =
          allocations[candidate.index]! - amount;
        reduced += amount;
      }

      excess -= reduced;

      if (reduced <= options.numericalTolerance) {
        break;
      }
    }
  }

  return Object.freeze(allocations);
}

export function allocatePortfolioCapital(
  request: PortfolioCapitalAllocationRequest,
  options?: CapitalAllocationEngineOptions,
  clock: CapitalAllocationClock = SYSTEM_CLOCK,
): PortfolioCapitalAllocationResult {
  if (typeof clock?.now !== "function") {
    throw new TypeError("clock must provide a now() function.");
  }

  const resolved = resolveOptions(options);

  assertNonEmpty(request.allocationId, "request.allocationId");
  assertNonEmpty(request.portfolioId, "request.portfolioId");
  normalizeTimestamp(request.requestedAt, "request.requestedAt");

  if (request.snapshot.portfolioId !== request.portfolioId) {
    throw new Error(
      "request.snapshot.portfolioId must match request.portfolioId.",
    );
  }

  if (request.policy.portfolioId !== request.portfolioId) {
    throw new Error(
      "request.policy.portfolioId must match request.portfolioId.",
    );
  }

  assertFinite(request.availableCapital, "request.availableCapital");
  assertFinite(request.snapshot.totalEquity, "request.snapshot.totalEquity");

  if (request.availableCapital < 0) {
    throw new RangeError(
      "request.availableCapital must be non-negative.",
    );
  }

  if (request.snapshot.totalEquity < 0) {
    throw new RangeError(
      "request.snapshot.totalEquity must be non-negative.",
    );
  }

  const totalCapital = request.snapshot.totalEquity;
  const reserveWeight = request.policy.minimumCashReserveWeight;

  if (reserveWeight < 0 || reserveWeight > 1) {
    throw new RangeError(
      "request.policy.minimumCashReserveWeight must be between 0 and 1.",
    );
  }

  const reservedCapital = Math.max(
    totalCapital * reserveWeight,
    request.snapshot.reservedCapital,
  );
  const maximumInvestedCapital = Math.min(
    totalCapital * request.policy.maximumInvestedWeight,
    Math.max(0, totalCapital - reservedCapital),
  );
  const allocatableCapital = Math.min(
    request.availableCapital,
    maximumInvestedCapital,
  );

  const targets = normalizeTargets(request);
  const allocatedValues = calculateAllocations(
    request,
    targets,
    totalCapital,
    allocatableCapital,
    resolved,
  );

  const violations: string[] = [];
  const warnings: string[] = [];

  const allocations: readonly PortfolioCapitalAllocation[] = Object.freeze(
    targets.map((target, index) => {
      const allocatedCapital = allocatedValues[index]!;
      const allocatedWeight =
        totalCapital > resolved.numericalTolerance
          ? allocatedCapital / totalCapital
          : 0;
      const capitalChange =
        allocatedCapital - target.currentCapital;
      const weightChange =
        allocatedWeight - target.currentWeight;
      const reasons: string[] = [];

      if (!target.source.enabled) {
        reasons.push("Target is disabled.");
      } else if (
        request.optimizationResult?.weights.some(
          (weight) => weight.asset === target.source.targetId,
        )
      ) {
        reasons.push(
          "Allocation follows the portfolio optimization result.",
        );
      } else {
        reasons.push(
          "Allocation was derived from policy limits and target quality scores.",
        );
      }

      if (
        allocatedCapital <
        target.minimumCapital - resolved.numericalTolerance
      ) {
        violations.push(
          `${target.source.targetId} allocation is below minimumCapital.`,
        );
      }

      if (
        allocatedCapital >
        target.maximumCapital + resolved.numericalTolerance
      ) {
        violations.push(
          `${target.source.targetId} allocation exceeds maximumCapital.`,
        );
      }

      if (
        allocatedWeight <
        target.minimumWeight - resolved.numericalTolerance
      ) {
        violations.push(
          `${target.source.targetId} allocation is below minimumWeight.`,
        );
      }

      if (
        allocatedWeight >
        target.maximumWeight + resolved.numericalTolerance
      ) {
        violations.push(
          `${target.source.targetId} allocation exceeds maximumWeight.`,
        );
      }

      return Object.freeze({
        targetType: target.source.targetType,
        targetId: target.source.targetId,
        previousCapital: target.currentCapital,
        allocatedCapital,
        capitalChange,
        previousWeight: target.currentWeight,
        allocatedWeight,
        weightChange,
        action: resolveAction(
          capitalChange,
          target.currentCapital,
          allocatedCapital,
          resolved.numericalTolerance,
        ),
        reasons: Object.freeze(reasons),
        metadata: Object.freeze({
          score: target.score,
          enabled: target.source.enabled,
          minimumCapital: target.minimumCapital,
          ...(Number.isFinite(target.maximumCapital)
            ? { maximumCapital: target.maximumCapital }
            : {}),
          minimumWeight: target.minimumWeight,
          maximumWeight: target.maximumWeight,
        }),
      });
    }),
  );

  const allocatedCapital = allocations.reduce(
    (total, allocation) => total + allocation.allocatedCapital,
    0,
  );
  const unallocatedCapital = Math.max(
    0,
    request.availableCapital - allocatedCapital,
  );

  if (
    allocatedCapital >
    allocatableCapital + resolved.numericalTolerance
  ) {
    violations.push(
      "Total allocated capital exceeds the policy-constrained allocatable capital.",
    );
  }

  if (
    request.optimizationResult === undefined
  ) {
    warnings.push(
      "No portfolio optimization result was supplied; allocation used policy and target scoring.",
    );
  }

  const generatedAt = new Date(clock.now()).toISOString();
  const expiresAt =
    resolved.resultTimeToLiveMilliseconds === undefined
      ? undefined
      : new Date(
          Date.parse(generatedAt) +
            resolved.resultTimeToLiveMilliseconds,
        ).toISOString();

  return Object.freeze({
    allocationId: request.allocationId,
    portfolioId: request.portfolioId,
    totalCapital,
    allocatedCapital,
    reservedCapital,
    unallocatedCapital,
    allocations,
    constraintsSatisfied: violations.length === 0,
    violations: Object.freeze(violations),
    warnings: Object.freeze(warnings),
    generatedAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    metadata: Object.freeze({
      ...(resolved.metadata ?? {}),
      ...(request.metadata ?? {}),
      policyId: request.policy.policyId,
      snapshotId: request.snapshot.snapshotId,
      targetCount: targets.length,
      allocatableCapital,
    }),
  });
}

export class DeterministicCapitalAllocationEngine
  implements PortfolioCapitalAllocator
{
  private readonly options: CapitalAllocationEngineOptions;
  private readonly clock: CapitalAllocationClock;

  public constructor(
    options: CapitalAllocationEngineOptions = Object.freeze({}),
    clock: CapitalAllocationClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = Object.freeze({
      ...options,
      metadata: cloneMetadata(options.metadata),
    });
    this.clock = clock;
  }

  public allocate(
    request: PortfolioCapitalAllocationRequest,
  ): PortfolioCapitalAllocationResult {
    return allocatePortfolioCapital(
      request,
      this.options,
      this.clock,
    );
  }
}

export class AIPortfolioCapitalAllocationEngine extends DeterministicCapitalAllocationEngine {}