/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-execution-planner.ts
 *
 * Purpose:
 * Deterministic, immutable, allocation-aware execution-plan construction for
 * approved institutional arbitrage opportunities.
 */

import {
  type ArbitrageCapitalAllocation,
  type ArbitrageDecision,
  type ArbitrageExecutionPlan,
  type ArbitrageExecutionStatus,
  type ArbitrageId,
  type ArbitrageLeg,
  type ArbitrageMetadata,
  type ArbitrageTimestamp,
  type ArbitrageTransferRequirement,
  type InstitutionalArbitrageExecutionPlanner,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";
import {
  validateArbitrageCapitalAllocation,
  validateArbitrageDecision,
  validateArbitrageExecutionPlan,
  assertInstitutionalArbitrageOpportunity,
  type ArbitrageValidationResult,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;

export interface ArbitrageExecutionPlannerOptions {
  /** Monetary and quantity precision used by deterministic scaling. */
  readonly decimalPlaces?: number;

  /** Validate domain inputs and the generated execution plan. */
  readonly validateInputs?: boolean;

  /** Optional hard ceiling applied to every generated plan. */
  readonly maximumExecutionDurationMs?: number;

  /** Additional deterministic safety margin added to estimated duration. */
  readonly executionSafetyMarginMs?: number;

  /** Minimum lifetime required for a newly created plan. */
  readonly minimumPlanLifetimeMs?: number;

  /** Force rollback/compensation when a multi-leg plan partially fails. */
  readonly rollbackRequiredOnPartialFailure?: boolean;

  /**
   * Scale opportunity legs and transfers to the approved allocation. When
   * false, the source opportunity sizing is preserved.
   */
  readonly scaleToApprovedCapital?: boolean;
}

export interface ArbitrageExecutionPlanDiagnostics {
  readonly plan: ArbitrageExecutionPlan;
  readonly capitalScaleFactor: number;
  readonly estimatedExecutionDurationMs: number;
  readonly effectiveMaximumExecutionDurationMs: number;
  readonly planLifetimeMs: number;
  readonly scaledLegCount: number;
  readonly scaledTransferCount: number;
  readonly observations: readonly string[];
}

export type ArbitrageExecutionPlannerErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_OPTION"
  | "INVALID_DECISION"
  | "INVALID_ALLOCATION"
  | "INCONSISTENT_INPUT"
  | "EXPIRED_OPPORTUNITY"
  | "INSUFFICIENT_PLAN_LIFETIME"
  | "INVALID_GENERATED_PLAN";

export class ArbitrageExecutionPlannerError extends Error {
  public readonly code: ArbitrageExecutionPlannerErrorCode;
  public readonly validationIssues?: ArbitrageValidationResult["issues"];

  public constructor(
    code: ArbitrageExecutionPlannerErrorCode,
    message: string,
    validationIssues?: ArbitrageValidationResult["issues"],
  ) {
    super(message);
    this.name = "ArbitrageExecutionPlannerError";
    this.code = code;
    this.validationIssues = validationIssues;
  }
}

interface ResolvedOptions {
  readonly decimalPlaces: number;
  readonly validateInputs: boolean;
  readonly maximumExecutionDurationMs?: number;
  readonly executionSafetyMarginMs: number;
  readonly minimumPlanLifetimeMs: number;
  readonly rollbackRequiredOnPartialFailure: boolean;
  readonly scaleToApprovedCapital: boolean;
}

const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  validateInputs: true,
  maximumExecutionDurationMs: undefined,
  executionSafetyMarginMs: 250,
  minimumPlanLifetimeMs: 1,
  rollbackRequiredOnPartialFailure: true,
  scaleToApprovedCapital: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if ((!isRecord(value) && !Array.isArray(value)) || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(value)) {
    if ((isRecord(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ArbitrageExecutionPlannerError(
      "INVALID_TIMESTAMP",
      `${name} must be a non-negative safe integer timestamp.`,
    );
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ArbitrageExecutionPlannerError(
      "INVALID_OPTION",
      `${name} must be a finite non-negative number.`,
    );
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ArbitrageExecutionPlannerError(
      "INVALID_OPTION",
      `${name} must be a finite positive number.`,
    );
  }
}

function roundDeterministically(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) {
    throw new ArbitrageExecutionPlannerError(
      "INVALID_ARGUMENT",
      "Cannot round a non-finite value.",
    );
  }

  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function deterministicHash(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createPlanId(
  opportunityId: ArbitrageId,
  decisionId: ArbitrageId,
  allocationId: ArbitrageId,
  createdAt: ArbitrageTimestamp,
): ArbitrageId {
  const fingerprint = deterministicHash(
    `${opportunityId}|${decisionId}|${allocationId}|${createdAt}`,
  );

  return `arb-plan-${createdAt}-${fingerprint}`;
}

function assertValidation(
  result: ArbitrageValidationResult,
  code: ArbitrageExecutionPlannerErrorCode,
  message: string,
): void {
  if (!result.valid) {
    throw new ArbitrageExecutionPlannerError(code, message, result.issues);
  }
}

function sumFeeComponents(leg: ArbitrageLeg): number {
  return leg.feeEstimate.totalFee;
}

function scaleFeeEstimate(
  leg: ArbitrageLeg,
  scaleFactor: number,
  decimalPlaces: number,
): ArbitrageLeg["feeEstimate"] {
  const scale = (value: number): number =>
    roundDeterministically(value * scaleFactor, decimalPlaces);

  return Object.freeze({
    tradingFee: scale(leg.feeEstimate.tradingFee),
    fundingFee: scale(leg.feeEstimate.fundingFee),
    borrowingFee: scale(leg.feeEstimate.borrowingFee),
    withdrawalFee: scale(leg.feeEstimate.withdrawalFee),
    depositFee: scale(leg.feeEstimate.depositFee),
    networkFee: scale(leg.feeEstimate.networkFee),
    bridgeFee: scale(leg.feeEstimate.bridgeFee),
    gasFee: scale(leg.feeEstimate.gasFee),
    protocolFee: scale(leg.feeEstimate.protocolFee),
    otherFee: scale(leg.feeEstimate.otherFee),
    totalFee: scale(sumFeeComponents(leg)),
    reportingAsset: leg.feeEstimate.reportingAsset,
  });
}

function scaleLeg(
  leg: ArbitrageLeg,
  scaleFactor: number,
  decimalPlaces: number,
): ArbitrageLeg {
  const scale = (value: number): number =>
    roundDeterministically(value * scaleFactor, decimalPlaces);

  const requestedQuantity = scale(leg.liquidity.requestedQuantity);
  const executableQuantity = scale(leg.liquidity.executableQuantity);
  const requestedNotional = scale(leg.liquidity.requestedNotional);
  const executableNotional = scale(leg.liquidity.executableNotional);

  return deepFreeze({
    ...leg,
    inputQuantity: scale(leg.inputQuantity),
    expectedOutputQuantity: scale(leg.expectedOutputQuantity),
    minimumOutputQuantity:
      leg.minimumOutputQuantity === undefined
        ? undefined
        : scale(leg.minimumOutputQuantity),
    feeEstimate: scaleFeeEstimate(leg, scaleFactor, decimalPlaces),
    slippageEstimate: Object.freeze({
      ...leg.slippageEstimate,
      expectedSlippageValue: scale(
        leg.slippageEstimate.expectedSlippageValue,
      ),
      stressedSlippageValue: scale(
        leg.slippageEstimate.stressedSlippageValue,
      ),
    }),
    liquidity: Object.freeze({
      ...leg.liquidity,
      requestedQuantity,
      executableQuantity,
      requestedNotional,
      executableNotional,
      sufficient:
        leg.liquidity.sufficient && executableQuantity >= requestedQuantity,
    }),
    dependencyLegIds: Object.freeze([...leg.dependencyLegIds]),
    metadata: deepFreeze({ ...leg.metadata }),
  });
}

function scaleTransfer(
  transfer: ArbitrageTransferRequirement,
  scaleFactor: number,
  decimalPlaces: number,
): ArbitrageTransferRequirement {
  return deepFreeze({
    ...transfer,
    quantity: roundDeterministically(
      transfer.quantity * scaleFactor,
      decimalPlaces,
    ),
    expectedFee: roundDeterministically(
      transfer.expectedFee * scaleFactor,
      decimalPlaces,
    ),
    metadata: deepFreeze({ ...transfer.metadata }),
  });
}

function sortLegs(legs: readonly ArbitrageLeg[]): readonly ArbitrageLeg[] {
  return Object.freeze(
    [...legs].sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }

      return left.legId.localeCompare(right.legId);
    }),
  );
}

function sortTransfers(
  transfers: readonly ArbitrageTransferRequirement[],
): readonly ArbitrageTransferRequirement[] {
  return Object.freeze(
    [...transfers].sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }

      return left.transferId.localeCompare(right.transferId);
    }),
  );
}

function calculateEstimatedExecutionDurationMs(
  legs: readonly ArbitrageLeg[],
  transfers: readonly ArbitrageTransferRequirement[],
): number {
  const legDuration = legs.reduce(
    (maximum, leg) =>
      Math.max(maximum, leg.latency.expectedTotalLatencyMs),
    0,
  );

  const transferDuration = transfers.reduce(
    (total, transfer) => total + transfer.expectedDurationMs,
    0,
  );

  return Math.max(1, Math.ceil(legDuration + transferDuration));
}

function determineStatus(allocation: ArbitrageCapitalAllocation): ArbitrageExecutionStatus {
  return allocation.reservedCapital > 0 ? "CAPITAL_RESERVED" : "PREPARING";
}

function buildMetadata(
  opportunity: InstitutionalArbitrageOpportunity,
  decision: ArbitrageDecision,
  allocation: ArbitrageCapitalAllocation,
  scaleFactor: number,
  estimatedDurationMs: number,
): ArbitrageMetadata {
  return deepFreeze({
    planner: "ArbitrageExecutionPlanner",
    plannerVersion: 1,
    opportunityType: opportunity.type,
    automationMode: opportunity.automationMode,
    allocationId: allocation.allocationId,
    capitalScaleFactor: scaleFactor,
    estimatedExecutionDurationMs: estimatedDurationMs,
    decisionAction: decision.action,
    sourceOpportunityVersion: opportunity.version,
  });
}

export class ArbitrageExecutionPlanner
  implements InstitutionalArbitrageExecutionPlanner
{
  private readonly options: ResolvedOptions;

  public constructor(options: ArbitrageExecutionPlannerOptions = {}) {
    const decimalPlaces = options.decimalPlaces ?? DEFAULT_OPTIONS.decimalPlaces;

    if (
      !Number.isSafeInteger(decimalPlaces) ||
      decimalPlaces < 0 ||
      decimalPlaces > MAX_DECIMAL_PLACES
    ) {
      throw new ArbitrageExecutionPlannerError(
        "INVALID_OPTION",
        `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
      );
    }

    const executionSafetyMarginMs =
      options.executionSafetyMarginMs ?? DEFAULT_OPTIONS.executionSafetyMarginMs;
    const minimumPlanLifetimeMs =
      options.minimumPlanLifetimeMs ?? DEFAULT_OPTIONS.minimumPlanLifetimeMs;

    assertNonNegativeFinite(
      executionSafetyMarginMs,
      "executionSafetyMarginMs",
    );
    assertPositiveFinite(minimumPlanLifetimeMs, "minimumPlanLifetimeMs");

    if (options.maximumExecutionDurationMs !== undefined) {
      assertPositiveFinite(
        options.maximumExecutionDurationMs,
        "maximumExecutionDurationMs",
      );
    }

    this.options = Object.freeze({
      decimalPlaces,
      validateInputs: options.validateInputs ?? DEFAULT_OPTIONS.validateInputs,
      maximumExecutionDurationMs: options.maximumExecutionDurationMs,
      executionSafetyMarginMs,
      minimumPlanLifetimeMs,
      rollbackRequiredOnPartialFailure:
        options.rollbackRequiredOnPartialFailure ??
        DEFAULT_OPTIONS.rollbackRequiredOnPartialFailure,
      scaleToApprovedCapital:
        options.scaleToApprovedCapital ?? DEFAULT_OPTIONS.scaleToApprovedCapital,
    });
  }

  public createPlan(
    opportunity: InstitutionalArbitrageOpportunity,
    decision: ArbitrageDecision,
    allocation: ArbitrageCapitalAllocation,
    createdAt: ArbitrageTimestamp,
  ): ArbitrageExecutionPlan {
    return this.createPlanWithDiagnostics(
      opportunity,
      decision,
      allocation,
      createdAt,
    ).plan;
  }

  public createPlanWithDiagnostics(
    opportunity: InstitutionalArbitrageOpportunity,
    decision: ArbitrageDecision,
    allocation: ArbitrageCapitalAllocation,
    createdAt: ArbitrageTimestamp,
  ): ArbitrageExecutionPlanDiagnostics {
    assertTimestamp(createdAt, "createdAt");

    if (this.options.validateInputs) {
      assertInstitutionalArbitrageOpportunity(opportunity, createdAt);
      assertValidation(
        validateArbitrageDecision(decision),
        "INVALID_DECISION",
        "Invalid arbitrage decision.",
      );
      assertValidation(
        validateArbitrageCapitalAllocation(allocation),
        "INVALID_ALLOCATION",
        "Invalid arbitrage capital allocation.",
      );
    }

    this.assertConsistency(opportunity, decision, allocation, createdAt);

    const denominator =
      opportunity.requestedCapital > 0
        ? opportunity.requestedCapital
        : opportunity.maximumCapital;
    const rawScaleFactor =
      this.options.scaleToApprovedCapital && denominator > 0
        ? allocation.approvedCapital / denominator
        : 1;
    const capitalScaleFactor = roundDeterministically(
      Math.min(1, Math.max(0, rawScaleFactor)),
      this.options.decimalPlaces,
    );

    const legs = sortLegs(
      opportunity.legs.map((leg) =>
        scaleLeg(leg, capitalScaleFactor, this.options.decimalPlaces),
      ),
    );
    const transfers = sortTransfers(
      opportunity.transfers.map((transfer) =>
        scaleTransfer(
          transfer,
          capitalScaleFactor,
          this.options.decimalPlaces,
        ),
      ),
    );

    const estimatedExecutionDurationMs =
      calculateEstimatedExecutionDurationMs(legs, transfers);
    const requestedMaximumDuration = Math.max(
      1,
      Math.ceil(
        estimatedExecutionDurationMs + this.options.executionSafetyMarginMs,
      ),
    );
    const effectiveMaximumExecutionDurationMs =
      this.options.maximumExecutionDurationMs === undefined
        ? requestedMaximumDuration
        : Math.min(
            requestedMaximumDuration,
            Math.floor(this.options.maximumExecutionDurationMs),
          );

    const expiresAt = Math.min(
      opportunity.expiresAt,
      allocation.reservationExpiresAt,
    );
    const planLifetimeMs = expiresAt - createdAt;

    if (planLifetimeMs < this.options.minimumPlanLifetimeMs) {
      throw new ArbitrageExecutionPlannerError(
        "INSUFFICIENT_PLAN_LIFETIME",
        "The opportunity or capital reservation expires before the minimum plan lifetime is satisfied.",
      );
    }

    if (effectiveMaximumExecutionDurationMs > planLifetimeMs) {
      throw new ArbitrageExecutionPlannerError(
        "INSUFFICIENT_PLAN_LIFETIME",
        "The available plan lifetime is shorter than the maximum execution duration.",
      );
    }

    const plan: ArbitrageExecutionPlan = deepFreeze({
      planId: createPlanId(
        opportunity.opportunityId,
        decision.decisionId,
        allocation.allocationId,
        createdAt,
      ),
      opportunityId: opportunity.opportunityId,
      decisionId: decision.decisionId,
      status: determineStatus(allocation),
      legs,
      transfers,
      capitalAllocation: deepFreeze({
        ...allocation,
        metadata: deepFreeze({ ...allocation.metadata }),
      }),
      createdAt,
      expiresAt,
      maximumExecutionDurationMs: effectiveMaximumExecutionDurationMs,
      rollbackRequiredOnPartialFailure:
        this.options.rollbackRequiredOnPartialFailure && legs.length > 1,
      correlationId: opportunity.correlationId,
      traceId: opportunity.traceId,
      metadata: buildMetadata(
        opportunity,
        decision,
        allocation,
        capitalScaleFactor,
        estimatedExecutionDurationMs,
      ),
    });

    if (this.options.validateInputs) {
      assertValidation(
        validateArbitrageExecutionPlan(plan),
        "INVALID_GENERATED_PLAN",
        "The generated arbitrage execution plan is invalid.",
      );
    }

    const observations: string[] = [];

    if (capitalScaleFactor < 1) {
      observations.push(
        `Execution sizing was scaled to ${(capitalScaleFactor * 100).toFixed(4)}% of the requested opportunity capital.`,
      );
    }

    if (transfers.length > 0) {
      observations.push(
        `The plan includes ${transfers.length} deterministic transfer requirement(s).`,
      );
    }

    if (plan.rollbackRequiredOnPartialFailure) {
      observations.push(
        "Rollback or compensation is required after a partial multi-leg failure.",
      );
    }

    return deepFreeze({
      plan,
      capitalScaleFactor,
      estimatedExecutionDurationMs,
      effectiveMaximumExecutionDurationMs,
      planLifetimeMs,
      scaledLegCount: legs.length,
      scaledTransferCount: transfers.length,
      observations: Object.freeze(observations),
    });
  }

  private assertConsistency(
    opportunity: InstitutionalArbitrageOpportunity,
    decision: ArbitrageDecision,
    allocation: ArbitrageCapitalAllocation,
    createdAt: ArbitrageTimestamp,
  ): void {
    if (createdAt >= opportunity.expiresAt) {
      throw new ArbitrageExecutionPlannerError(
        "EXPIRED_OPPORTUNITY",
        "Cannot create an execution plan for an expired opportunity.",
      );
    }

    if (createdAt < opportunity.validFrom) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Cannot create an execution plan before the opportunity validFrom timestamp.",
      );
    }

    if (decision.opportunityId !== opportunity.opportunityId) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Decision opportunityId must match the supplied opportunity.",
      );
    }

    if (allocation.opportunityId !== opportunity.opportunityId) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Allocation opportunityId must match the supplied opportunity.",
      );
    }

    if (allocation.portfolioId !== opportunity.portfolioId) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Allocation portfolioId must match the opportunity portfolioId.",
      );
    }

    if (allocation.reportingAsset !== opportunity.reportingAsset) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Allocation reportingAsset must match the opportunity reportingAsset.",
      );
    }

    if (decision.action !== "EXECUTE") {
      throw new ArbitrageExecutionPlannerError(
        "INVALID_DECISION",
        "Only EXECUTE decisions can produce execution plans.",
      );
    }

    if (decision.automationMode !== opportunity.automationMode) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Decision automationMode must match the opportunity automationMode.",
      );
    }

    if (
      decision.capitalAllocation !== undefined &&
      decision.capitalAllocation.allocationId !== allocation.allocationId
    ) {
      throw new ArbitrageExecutionPlannerError(
        "INCONSISTENT_INPUT",
        "Decision capital allocation must match the supplied allocation.",
      );
    }

    if (!decision.riskAssessment.approved) {
      throw new ArbitrageExecutionPlannerError(
        "INVALID_DECISION",
        "Execution planning requires an approved risk assessment.",
      );
    }

    if (allocation.approvedCapital <= 0 || allocation.reservedCapital <= 0) {
      throw new ArbitrageExecutionPlannerError(
        "INVALID_ALLOCATION",
        "Execution planning requires positive approved and reserved capital.",
      );
    }

    if (allocation.reservedCapital < allocation.approvedCapital) {
      throw new ArbitrageExecutionPlannerError(
        "INVALID_ALLOCATION",
        "Reserved capital cannot be less than approved capital.",
      );
    }

    if (createdAt >= allocation.reservationExpiresAt) {
      throw new ArbitrageExecutionPlannerError(
        "INVALID_ALLOCATION",
        "The supplied capital reservation has expired.",
      );
    }
  }
}

export function createArbitrageExecutionPlanner(
  options?: ArbitrageExecutionPlannerOptions,
): ArbitrageExecutionPlanner {
  return new ArbitrageExecutionPlanner(options);
}