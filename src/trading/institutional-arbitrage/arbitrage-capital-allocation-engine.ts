/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-capital-allocation-engine.ts
 *
 * Purpose:
 * Deterministic, immutable, policy-aware capital allocation for ranked
 * institutional arbitrage opportunities.
 */

import {
  type ArbitrageCapitalAllocation,
  type ArbitrageDecimal,
  type ArbitrageEvaluationPolicy,
  type ArbitrageId,
  type ArbitrageRankedOpportunity,
  type ArbitrageScanContext,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageCapitalAllocator,
} from "./institutional-arbitrage-contracts";
import {
  assertArbitrageEvaluationPolicy,
  validateArbitrageRiskAssessment,
  assertInstitutionalArbitrageOpportunity,
  validateArbitrageCapitalAllocation,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;
const PERCENTAGE_SCALE = 100;

export type ArbitrageCapitalAllocationStrategy =
  | "RANK_PRIORITY"
  | "SCORE_WEIGHTED";

export interface ArbitrageCapitalAllocationEngineOptions {
  /** Number of decimal places used for deterministic monetary rounding. */
  readonly decimalPlaces?: number;

  /**
   * Allocation mode. RANK_PRIORITY allocates in rank order. SCORE_WEIGHTED
   * divides capital proportionally and then redistributes deterministic
   * remainders in rank order.
   */
  readonly strategy?: ArbitrageCapitalAllocationStrategy;

  /** Validate all domain inputs and generated allocations. */
  readonly validateInputs?: boolean;

  /**
   * Reservation lifetime. The actual expiry never exceeds the opportunity's
   * own expiry timestamp.
   */
  readonly reservationDurationMs?: number;

  /** Capital retained at portfolio level and therefore unavailable. */
  readonly portfolioReservePercentage?: number;

  /** Minimum approved allocation emitted by the engine. */
  readonly minimumAllocation?: ArbitrageDecimal;

  /**
   * Optional diversification ceiling per arbitrage type, expressed as a
   * percentage of deployable portfolio capital.
   */
  readonly maximumAllocationPerTypePercentage?: number;

  /**
   * Signal-only opportunities are normally excluded because they are not
   * executable decisions. This option permits reservations for downstream
   * manual workflows when explicitly enabled.
   */
  readonly includeSignalOnlyOpportunities?: boolean;
}

export interface ArbitrageCapitalAllocationDiagnostics {
  readonly allocations: readonly ArbitrageCapitalAllocation[];
  readonly deployableCapital: ArbitrageDecimal;
  readonly allocatedCapital: ArbitrageDecimal;
  readonly remainingCapital: ArbitrageDecimal;
  readonly portfolioReserveCapital: ArbitrageDecimal;
  readonly consideredOpportunityCount: number;
  readonly allocatedOpportunityCount: number;
  readonly skippedOpportunityIds: readonly ArbitrageId[];
  readonly observations: readonly string[];
}

export type ArbitrageCapitalAllocationErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_DECIMAL_PLACES"
  | "INVALID_OPTION"
  | "DUPLICATE_OPPORTUNITY"
  | "INVALID_RANKING";

export class ArbitrageCapitalAllocationError extends Error {
  public readonly code: ArbitrageCapitalAllocationErrorCode;

  public constructor(
    code: ArbitrageCapitalAllocationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArbitrageCapitalAllocationError";
    this.code = code;
  }
}

interface ResolvedOptions {
  readonly decimalPlaces: number;
  readonly strategy: ArbitrageCapitalAllocationStrategy;
  readonly validateInputs: boolean;
  readonly reservationDurationMs: number;
  readonly portfolioReservePercentage: number;
  readonly minimumAllocation: ArbitrageDecimal;
  readonly maximumAllocationPerTypePercentage: number;
  readonly includeSignalOnlyOpportunities: boolean;
}

interface EligibleOpportunity {
  readonly ranked: ArbitrageRankedOpportunity;
  readonly requestedCapital: ArbitrageDecimal;
  readonly maximumAllocation: ArbitrageDecimal;
  readonly weight: number;
}

interface MutableAllocationState {
  readonly candidate: EligibleOpportunity;
  approvedCapital: ArbitrageDecimal;
}

const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  strategy: "RANK_PRIORITY",
  validateInputs: true,
  reservationDurationMs: 30_000,
  portfolioReservePercentage: 0,
  minimumAllocation: 0,
  maximumAllocationPerTypePercentage: 100,
  includeSignalOnlyOpportunities: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  if (Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(value)) {
    if (
      (isRecord(nested) || Array.isArray(nested)) &&
      !Object.isFrozen(nested)
    ) {
      deepFreeze(nested);
    }
  }

  return value;
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_ARGUMENT",
      `${name} must be a finite non-negative number.`,
    );
  }
}

function assertPercentage(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > PERCENTAGE_SCALE) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_OPTION",
      `${name} must be between 0 and 100 inclusive.`,
    );
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_TIMESTAMP",
      `${name} must be a non-negative safe integer timestamp.`,
    );
  }
}

function roundDeterministically(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_ARGUMENT",
      "Cannot round a non-finite value.",
    );
  }

  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function floorDeterministically(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_ARGUMENT",
      "Cannot floor a non-finite value.",
    );
  }

  const factor = 10 ** decimalPlaces;
  const floored = Math.floor((value + Number.EPSILON) * factor) / factor;
  return Object.is(floored, -0) ? 0 : floored;
}

function minimum(...values: readonly number[]): number {
  return Math.min(...values.filter((value) => Number.isFinite(value)));
}

function deterministicHash(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createAllocationId(
  opportunityId: ArbitrageId,
  portfolioId: string,
  allocatedAt: ArbitrageTimestamp,
): ArbitrageId {
  const fingerprint = deterministicHash(
    `${portfolioId}|${opportunityId}|${allocatedAt}`,
  );

  return `arb-allocation-${allocatedAt}-${fingerprint}`;
}

function compareRankedOpportunities(
  left: ArbitrageRankedOpportunity,
  right: ArbitrageRankedOpportunity,
): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  if (left.score.finalScore !== right.score.finalScore) {
    return right.score.finalScore - left.score.finalScore;
  }

  return left.opportunity.opportunityId.localeCompare(
    right.opportunity.opportunityId,
  );
}

function resolveOptions(
  options?: ArbitrageCapitalAllocationEngineOptions,
): ResolvedOptions {
  const resolved: ResolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isInteger(resolved.decimalPlaces) ||
    resolved.decimalPlaces < 0 ||
    resolved.decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_DECIMAL_PLACES",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }

  if (
    resolved.strategy !== "RANK_PRIORITY" &&
    resolved.strategy !== "SCORE_WEIGHTED"
  ) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_OPTION",
      `Unsupported allocation strategy: ${String(resolved.strategy)}.`,
    );
  }

  if (
    !Number.isSafeInteger(resolved.reservationDurationMs) ||
    resolved.reservationDurationMs <= 0
  ) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_OPTION",
      "reservationDurationMs must be a positive safe integer.",
    );
  }

  assertPercentage(
    resolved.portfolioReservePercentage,
    "portfolioReservePercentage",
  );
  assertPercentage(
    resolved.maximumAllocationPerTypePercentage,
    "maximumAllocationPerTypePercentage",
  );
  assertFiniteNonNegative(resolved.minimumAllocation, "minimumAllocation");

  return deepFreeze(resolved);
}

function validateRankedInputs(
  opportunities: readonly ArbitrageRankedOpportunity[],
): void {
  const opportunityIds = new Set<ArbitrageId>();
  const ranks = new Set<number>();

  for (const ranked of opportunities) {
    if (opportunityIds.has(ranked.opportunity.opportunityId)) {
      throw new ArbitrageCapitalAllocationError(
        "DUPLICATE_OPPORTUNITY",
        `Duplicate opportunityId: ${ranked.opportunity.opportunityId}.`,
      );
    }

    if (!Number.isSafeInteger(ranked.rank) || ranked.rank < 1) {
      throw new ArbitrageCapitalAllocationError(
        "INVALID_RANKING",
        `Rank for ${ranked.opportunity.opportunityId} must be a positive safe integer.`,
      );
    }

    if (ranks.has(ranked.rank)) {
      throw new ArbitrageCapitalAllocationError(
        "INVALID_RANKING",
        `Duplicate rank: ${ranked.rank}.`,
      );
    }

    if (!Number.isFinite(ranked.score.finalScore)) {
      throw new ArbitrageCapitalAllocationError(
        "INVALID_RANKING",
        `Final score for ${ranked.opportunity.opportunityId} must be finite.`,
      );
    }

    opportunityIds.add(ranked.opportunity.opportunityId);
    ranks.add(ranked.rank);
  }
}

function calculatePortfolioCap(
  context: ArbitrageScanContext,
  policy: ArbitrageEvaluationPolicy,
  deployableCapital: number,
  decimalPlaces: number,
): number {
  const policyPortfolioCap = floorDeterministically(
    context.availableCapital *
      (policy.maximumPortfolioAllocationPercentage / PERCENTAGE_SCALE),
    decimalPlaces,
  );

  return floorDeterministically(
    minimum(deployableCapital, policyPortfolioCap),
    decimalPlaces,
  );
}

function buildEligibleOpportunities(
  rankedOpportunities: readonly ArbitrageRankedOpportunity[],
  context: ArbitrageScanContext,
  policy: ArbitrageEvaluationPolicy,
  allocatedAt: ArbitrageTimestamp,
  portfolioCapitalCap: number,
  options: ResolvedOptions,
): {
  readonly eligible: readonly EligibleOpportunity[];
  readonly skippedOpportunityIds: readonly ArbitrageId[];
} {
  const skippedOpportunityIds: ArbitrageId[] = [];
  const eligible: EligibleOpportunity[] = [];
  const typeAllocationCap = floorDeterministically(
    portfolioCapitalCap *
      (options.maximumAllocationPerTypePercentage / PERCENTAGE_SCALE),
    options.decimalPlaces,
  );

  for (const ranked of [...rankedOpportunities].sort(compareRankedOpportunities)) {
    const opportunity = ranked.opportunity;
    const assessment = ranked.riskAssessment;

    const executableAutomationMode =
      opportunity.automationMode !== "SIGNAL_ONLY" ||
      options.includeSignalOnlyOpportunities;

    const eligibleStatus =
      opportunity.status === "DISCOVERED" ||
      opportunity.status === "VALIDATED" ||
      opportunity.status === "RANKED" ||
      opportunity.status === "APPROVED";

    const timestampsValid =
      allocatedAt >= opportunity.validFrom &&
      allocatedAt < opportunity.expiresAt;

    const portfolioMatches = opportunity.portfolioId === context.portfolioId;
    const reportingAssetMatches =
      opportunity.reportingAsset === context.reportingAsset;

    if (
      !assessment.approved ||
      assessment.opportunityId !== opportunity.opportunityId ||
      !executableAutomationMode ||
      !eligibleStatus ||
      !timestampsValid ||
      !portfolioMatches ||
      !reportingAssetMatches
    ) {
      skippedOpportunityIds.push(opportunity.opportunityId);
      continue;
    }

    const maximumAllocation = floorDeterministically(
      minimum(
        opportunity.requestedCapital,
        opportunity.maximumCapital,
        assessment.maximumApprovedCapital,
        policy.maximumCapitalPerOpportunity,
        typeAllocationCap,
        portfolioCapitalCap,
      ),
      options.decimalPlaces,
    );

    if (
      maximumAllocation <= 0 ||
      maximumAllocation < options.minimumAllocation
    ) {
      skippedOpportunityIds.push(opportunity.opportunityId);
      continue;
    }

    eligible.push(
      deepFreeze({
        ranked,
        requestedCapital: opportunity.requestedCapital,
        maximumAllocation,
        weight: Math.max(0, ranked.score.riskAdjustedScore),
      }),
    );
  }

  return deepFreeze({
    eligible,
    skippedOpportunityIds,
  });
}

function allocateByRank(
  candidates: readonly EligibleOpportunity[],
  totalCapital: number,
  maximumConcurrentExecutions: number,
  decimalPlaces: number,
): readonly MutableAllocationState[] {
  let remainingCapital = totalCapital;
  const allocations: MutableAllocationState[] = [];
  const allocatedByType = new Map<string, number>();

  for (const candidate of candidates) {
    if (
      allocations.length >= maximumConcurrentExecutions ||
      remainingCapital <= 0
    ) {
      break;
    }

    const type = candidate.ranked.opportunity.type;
    const currentTypeAllocation = allocatedByType.get(type) ?? 0;
    const typeLimit = candidate.maximumAllocation;
    const typeRemaining = Math.max(0, typeLimit - currentTypeAllocation);

    const approvedCapital = floorDeterministically(
      minimum(
        candidate.maximumAllocation,
        typeRemaining,
        remainingCapital,
      ),
      decimalPlaces,
    );

    if (approvedCapital <= 0) {
      continue;
    }

    allocations.push({ candidate, approvedCapital });
    allocatedByType.set(
      type,
      roundDeterministically(
        currentTypeAllocation + approvedCapital,
        decimalPlaces,
      ),
    );
    remainingCapital = roundDeterministically(
      remainingCapital - approvedCapital,
      decimalPlaces,
    );
  }

  return allocations;
}

function allocateByScore(
  candidates: readonly EligibleOpportunity[],
  totalCapital: number,
  maximumConcurrentExecutions: number,
  decimalPlaces: number,
): readonly MutableAllocationState[] {
  const selected = candidates.slice(0, maximumConcurrentExecutions);

  if (selected.length === 0 || totalCapital <= 0) {
    return [];
  }

  const positiveWeightTotal = selected.reduce(
    (sum, candidate) => sum + candidate.weight,
    0,
  );
  const equalWeight = positiveWeightTotal <= 0;
  const denominator = equalWeight ? selected.length : positiveWeightTotal;

  const allocations: MutableAllocationState[] = selected.map((candidate) => {
    const numerator = equalWeight ? 1 : candidate.weight;
    const proportionalCapital = floorDeterministically(
      totalCapital * (numerator / denominator),
      decimalPlaces,
    );

    return {
      candidate,
      approvedCapital: floorDeterministically(
        minimum(proportionalCapital, candidate.maximumAllocation),
        decimalPlaces,
      ),
    };
  });

  let allocated = roundDeterministically(
    allocations.reduce((sum, state) => sum + state.approvedCapital, 0),
    decimalPlaces,
  );
  let remaining = roundDeterministically(totalCapital - allocated, decimalPlaces);
  const unit = 1 / 10 ** decimalPlaces;

  // Deterministic water-filling. Each pass follows canonical rank order.
  while (remaining >= unit) {
    let distributedInPass = false;

    for (const state of allocations) {
      const headroom = roundDeterministically(
        state.candidate.maximumAllocation - state.approvedCapital,
        decimalPlaces,
      );

      if (headroom < unit || remaining < unit) {
        continue;
      }

      const increment = floorDeterministically(
        minimum(headroom, remaining),
        decimalPlaces,
      );

      if (increment <= 0) {
        continue;
      }

      state.approvedCapital = roundDeterministically(
        state.approvedCapital + increment,
        decimalPlaces,
      );
      remaining = roundDeterministically(remaining - increment, decimalPlaces);
      distributedInPass = true;
    }

    if (!distributedInPass) {
      break;
    }
  }

  allocated = roundDeterministically(
    allocations.reduce((sum, state) => sum + state.approvedCapital, 0),
    decimalPlaces,
  );

  if (allocated > totalCapital) {
    throw new ArbitrageCapitalAllocationError(
      "INVALID_ARGUMENT",
      "Internal allocation invariant violated: allocated capital exceeds the portfolio cap.",
    );
  }

  return allocations;
}

export class ArbitrageCapitalAllocationEngine
  implements InstitutionalArbitrageCapitalAllocator
{
  private readonly options: ResolvedOptions;

  public constructor(options?: ArbitrageCapitalAllocationEngineOptions) {
    this.options = resolveOptions(options);
  }

  public allocate(
    opportunities: readonly ArbitrageRankedOpportunity[],
    context: ArbitrageScanContext,
    policy: ArbitrageEvaluationPolicy,
    allocatedAt: ArbitrageTimestamp,
  ): readonly ArbitrageCapitalAllocation[] {
    return this.allocateWithDiagnostics(
      opportunities,
      context,
      policy,
      allocatedAt,
    ).allocations;
  }

  public allocateWithDiagnostics(
    opportunities: readonly ArbitrageRankedOpportunity[],
    context: ArbitrageScanContext,
    policy: ArbitrageEvaluationPolicy,
    allocatedAt: ArbitrageTimestamp,
  ): ArbitrageCapitalAllocationDiagnostics {
    if (!Array.isArray(opportunities)) {
      throw new ArbitrageCapitalAllocationError(
        "INVALID_ARGUMENT",
        "opportunities must be an array.",
      );
    }

    assertTimestamp(allocatedAt, "allocatedAt");
    assertFiniteNonNegative(context.availableCapital, "context.availableCapital");

    validateRankedInputs(opportunities);

    if (this.options.validateInputs) {
      assertArbitrageEvaluationPolicy(policy);

      for (const ranked of opportunities) {
        assertInstitutionalArbitrageOpportunity(
          ranked.opportunity,
          allocatedAt,
        );
        const riskValidation = validateArbitrageRiskAssessment(
          ranked.riskAssessment,
        );

        if (!riskValidation.valid) {
          throw new ArbitrageCapitalAllocationError(
            "INVALID_ARGUMENT",
            `Invalid risk assessment for ${ranked.opportunity.opportunityId}: ${riskValidation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          );
        }
      }
    }

    const portfolioReserveCapital = floorDeterministically(
      context.availableCapital *
        (this.options.portfolioReservePercentage / PERCENTAGE_SCALE),
      this.options.decimalPlaces,
    );
    const deployableCapital = floorDeterministically(
      Math.max(0, context.availableCapital - portfolioReserveCapital),
      this.options.decimalPlaces,
    );
    const portfolioCapitalCap = calculatePortfolioCap(
      context,
      policy,
      deployableCapital,
      this.options.decimalPlaces,
    );

    const { eligible, skippedOpportunityIds } = buildEligibleOpportunities(
      opportunities,
      context,
      policy,
      allocatedAt,
      portfolioCapitalCap,
      this.options,
    );

    const rawStates =
      this.options.strategy === "SCORE_WEIGHTED"
        ? allocateByScore(
            eligible,
            portfolioCapitalCap,
            policy.maximumConcurrentExecutions,
            this.options.decimalPlaces,
          )
        : allocateByRank(
            eligible,
            portfolioCapitalCap,
            policy.maximumConcurrentExecutions,
            this.options.decimalPlaces,
          );

    const allocations = rawStates
      .filter(
        (state) =>
          state.approvedCapital > 0 &&
          state.approvedCapital >= this.options.minimumAllocation,
      )
      .map((state): ArbitrageCapitalAllocation => {
        const opportunity = state.candidate.ranked.opportunity;
        const approvedCapital = roundDeterministically(
          state.approvedCapital,
          this.options.decimalPlaces,
        );
        const allocationPercentage =
          context.availableCapital <= 0
            ? 0
            : roundDeterministically(
                (approvedCapital / context.availableCapital) * PERCENTAGE_SCALE,
                this.options.decimalPlaces,
              );
        const reservationExpiresAt = Math.min(
          opportunity.expiresAt,
          allocatedAt + this.options.reservationDurationMs,
        );

        const allocation = deepFreeze<ArbitrageCapitalAllocation>({
          allocationId: createAllocationId(
            opportunity.opportunityId,
            context.portfolioId,
            allocatedAt,
          ),
          opportunityId: opportunity.opportunityId,
          portfolioId: context.portfolioId,
          requestedCapital: opportunity.requestedCapital,
          approvedCapital,
          reservedCapital: approvedCapital,
          reportingAsset: context.reportingAsset,
          allocationPercentage,
          reservationExpiresAt,
          metadata: {
            engine: "ArbitrageCapitalAllocationEngine",
            allocationVersion: 1,
            allocationStrategy: this.options.strategy,
            rank: state.candidate.ranked.rank,
            finalScore: state.candidate.ranked.score.finalScore,
            riskAdjustedScore:
              state.candidate.ranked.score.riskAdjustedScore,
            riskScore:
              state.candidate.ranked.riskAssessment.overallRiskScore,
            maximumApprovedCapital:
              state.candidate.ranked.riskAssessment.maximumApprovedCapital,
            portfolioCapitalCap,
            allocatedAt,
          },
        });

        if (this.options.validateInputs) {
          const validation = validateArbitrageCapitalAllocation(allocation);

          if (!validation.valid) {
            throw new ArbitrageCapitalAllocationError(
              "INVALID_ARGUMENT",
              `Generated allocation ${allocation.allocationId} failed validation: ${validation.issues
                .map((issue) => `${issue.path}: ${issue.message}`)
                .join("; ")}`,
            );
          }
        }

        return allocation;
      });

    const allocatedCapital = roundDeterministically(
      allocations.reduce(
        (sum, allocation) => sum + allocation.approvedCapital,
        0,
      ),
      this.options.decimalPlaces,
    );
    const remainingCapital = roundDeterministically(
      Math.max(0, context.availableCapital - allocatedCapital),
      this.options.decimalPlaces,
    );
    const allocatedIds = new Set(
      allocations.map((allocation) => allocation.opportunityId),
    );
    const allSkippedIds = [
      ...skippedOpportunityIds,
      ...eligible
        .filter(
          (candidate) =>
            !allocatedIds.has(candidate.ranked.opportunity.opportunityId),
        )
        .map((candidate) => candidate.ranked.opportunity.opportunityId),
    ].filter((id, index, values) => values.indexOf(id) === index);

    return deepFreeze({
      allocations,
      deployableCapital,
      allocatedCapital,
      remainingCapital,
      portfolioReserveCapital,
      consideredOpportunityCount: opportunities.length,
      allocatedOpportunityCount: allocations.length,
      skippedOpportunityIds: allSkippedIds,
      observations: [
        `Allocation strategy: ${this.options.strategy}.`,
        `Available capital: ${context.availableCapital} ${context.reportingAsset}.`,
        `Deployable capital: ${deployableCapital} ${context.reportingAsset}.`,
        `Policy portfolio cap: ${portfolioCapitalCap} ${context.reportingAsset}.`,
        `Allocated capital: ${allocatedCapital} ${context.reportingAsset}.`,
        `Allocated opportunities: ${allocations.length}.`,
        `Skipped opportunities: ${allSkippedIds.length}.`,
      ],
    });
  }
}

export function createArbitrageCapitalAllocationEngine(
  options?: ArbitrageCapitalAllocationEngineOptions,
): ArbitrageCapitalAllocationEngine {
  return new ArbitrageCapitalAllocationEngine(options);
}

export function allocateArbitrageCapital(
  opportunities: readonly ArbitrageRankedOpportunity[],
  context: ArbitrageScanContext,
  policy: ArbitrageEvaluationPolicy,
  allocatedAt: ArbitrageTimestamp,
  options?: ArbitrageCapitalAllocationEngineOptions,
): readonly ArbitrageCapitalAllocation[] {
  return createArbitrageCapitalAllocationEngine(options).allocate(
    opportunities,
    context,
    policy,
    allocatedAt,
  );
}