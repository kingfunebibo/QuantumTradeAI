/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-decision-engine.ts
 *
 * Purpose:
 * Deterministic, immutable, policy-aware decision generation for ranked
 * institutional arbitrage opportunities and capital allocations.
 */

import {
  type ArbitrageCapitalAllocation,
  type ArbitrageDecision,
  type ArbitrageDecisionAction,
  type ArbitrageEvaluationPolicy,
  type ArbitrageId,
  type ArbitrageManualApproval,
  type ArbitrageMetadata,
  type ArbitrageRankedOpportunity,
  type ArbitrageRejectionCode,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageDecisionEngine,
} from "./institutional-arbitrage-contracts";
import {
  assertArbitrageEvaluationPolicy,
  assertInstitutionalArbitrageOpportunity,
  validateArbitrageCapitalAllocation,
  validateArbitrageDecision,
  validateArbitrageRiskAssessment,
  type ArbitrageValidationResult,
} from "./institutional-arbitrage-validator";

const DEFAULT_APPROVAL_DURATION_MS = 5 * 60 * 1_000;

export interface ArbitrageDecisionEngineOptions {
  /** Validate policy, opportunities, assessments, allocations, and outputs. */
  readonly validateInputs?: boolean;

  /** Lifetime of generated manual-approval requests. */
  readonly manualApprovalDurationMs?: number;

  /** Emit DEFER instead of REJECT when an executable opportunity has no allocation. */
  readonly deferWhenAllocationMissing?: boolean;

  /** Emit PUBLISH_SIGNAL for signal-only opportunities that pass policy and risk. */
  readonly publishApprovedSignalOnlyOpportunities?: boolean;

  /** Publish rejected signal-only opportunities when the policy permits it. */
  readonly publishRejectedSignalOnlyOpportunities?: boolean;

  /** Require stablecoin opportunities to enter a manual approval workflow. */
  readonly requireManualApprovalForStablecoin?: boolean;

  /** Include risk-assessment rejection codes in every rejected decision. */
  readonly inheritRiskRejectionCodes?: boolean;
}

export interface ArbitrageDecisionEngineRequest {
  readonly rankedOpportunities: readonly ArbitrageRankedOpportunity[];
  readonly allocations: readonly ArbitrageCapitalAllocation[];
  readonly policy: ArbitrageEvaluationPolicy;
  readonly decidedAt: ArbitrageTimestamp;
}

export interface ArbitrageDecisionEngineDiagnostics {
  readonly decisions: readonly ArbitrageDecision[];
  readonly executeCount: number;
  readonly approvalCount: number;
  readonly signalCount: number;
  readonly deferCount: number;
  readonly rejectCount: number;
  readonly cancelCount: number;
  readonly allocatedOpportunityCount: number;
  readonly unallocatedOpportunityIds: readonly ArbitrageId[];
  readonly observations: readonly string[];
}

export type ArbitrageDecisionEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_OPTION"
  | "INVALID_RANKING"
  | "DUPLICATE_OPPORTUNITY"
  | "DUPLICATE_ALLOCATION"
  | "INVALID_ALLOCATION"
  | "INCONSISTENT_ALLOCATION"
  | "INVALID_GENERATED_DECISION";

export class ArbitrageDecisionEngineError extends Error {
  public readonly code: ArbitrageDecisionEngineErrorCode;
  public readonly validationIssues?: ArbitrageValidationResult["issues"];

  public constructor(
    code: ArbitrageDecisionEngineErrorCode,
    message: string,
    validationIssues?: ArbitrageValidationResult["issues"],
  ) {
    super(message);
    this.name = "ArbitrageDecisionEngineError";
    this.code = code;
    this.validationIssues = validationIssues;
  }
}

interface ResolvedOptions {
  readonly validateInputs: boolean;
  readonly manualApprovalDurationMs: number;
  readonly deferWhenAllocationMissing: boolean;
  readonly publishApprovedSignalOnlyOpportunities: boolean;
  readonly publishRejectedSignalOnlyOpportunities: boolean;
  readonly requireManualApprovalForStablecoin: boolean;
  readonly inheritRiskRejectionCodes: boolean;
}

const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  validateInputs: true,
  manualApprovalDurationMs: DEFAULT_APPROVAL_DURATION_MS,
  deferWhenAllocationMissing: true,
  publishApprovedSignalOnlyOpportunities: true,
  publishRejectedSignalOnlyOpportunities: false,
  requireManualApprovalForStablecoin: true,
  inheritRiskRejectionCodes: true,
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTimestamp(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ArbitrageDecisionEngineError(
      "INVALID_TIMESTAMP",
      `${path} must be a non-negative safe integer timestamp.`,
    );
  }
}

function assertPositiveDuration(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ArbitrageDecisionEngineError(
      "INVALID_OPTION",
      `${path} must be a positive safe integer.`,
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((entry) => deepFreeze(entry));
    return Object.freeze(value) as T;
  }

  if (isRecord(value)) {
    Object.values(value).forEach((entry) => deepFreeze(entry));
    return Object.freeze(value) as T;
  }

  return value;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

function createDecisionId(
  opportunityId: ArbitrageId,
  action: ArbitrageDecisionAction,
  decidedAt: ArbitrageTimestamp,
): ArbitrageId {
  return `arb-decision-${stableHash(`${opportunityId}|${action}|${decidedAt}`)}`;
}

function createApprovalId(
  opportunityId: ArbitrageId,
  decidedAt: ArbitrageTimestamp,
): ArbitrageId {
  return `arb-approval-${stableHash(`${opportunityId}|${decidedAt}`)}`;
}

function freezeMetadata(metadata: ArbitrageMetadata): ArbitrageMetadata {
  return deepFreeze({ ...metadata });
}

function normalizeRejectionCodes(
  codes: readonly ArbitrageRejectionCode[],
): readonly ArbitrageRejectionCode[] {
  return Object.freeze([...new Set(codes)].sort((left, right) => left.localeCompare(right)));
}

function validateResult(
  result: ArbitrageValidationResult,
  code: ArbitrageDecisionEngineErrorCode,
  message: string,
): void {
  if (!result.valid) {
    throw new ArbitrageDecisionEngineError(code, message, result.issues);
  }
}

function resolveOptions(
  options?: ArbitrageDecisionEngineOptions,
): ResolvedOptions {
  const resolved: ResolvedOptions = Object.freeze({
    validateInputs: options?.validateInputs ?? DEFAULT_OPTIONS.validateInputs,
    manualApprovalDurationMs:
      options?.manualApprovalDurationMs ?? DEFAULT_OPTIONS.manualApprovalDurationMs,
    deferWhenAllocationMissing:
      options?.deferWhenAllocationMissing ??
      DEFAULT_OPTIONS.deferWhenAllocationMissing,
    publishApprovedSignalOnlyOpportunities:
      options?.publishApprovedSignalOnlyOpportunities ??
      DEFAULT_OPTIONS.publishApprovedSignalOnlyOpportunities,
    publishRejectedSignalOnlyOpportunities:
      options?.publishRejectedSignalOnlyOpportunities ??
      DEFAULT_OPTIONS.publishRejectedSignalOnlyOpportunities,
    requireManualApprovalForStablecoin:
      options?.requireManualApprovalForStablecoin ??
      DEFAULT_OPTIONS.requireManualApprovalForStablecoin,
    inheritRiskRejectionCodes:
      options?.inheritRiskRejectionCodes ??
      DEFAULT_OPTIONS.inheritRiskRejectionCodes,
  });

  assertPositiveDuration(
    resolved.manualApprovalDurationMs,
    "options.manualApprovalDurationMs",
  );

  return resolved;
}

function buildAllocationIndex(
  allocations: readonly ArbitrageCapitalAllocation[],
  validateInputs: boolean,
): ReadonlyMap<ArbitrageId, ArbitrageCapitalAllocation> {
  const index = new Map<ArbitrageId, ArbitrageCapitalAllocation>();

  allocations.forEach((allocation, allocationIndex) => {
    if (validateInputs) {
      validateResult(
        validateArbitrageCapitalAllocation(allocation),
        "INVALID_ALLOCATION",
        `allocations[${allocationIndex}] is invalid.`,
      );
    }

    if (index.has(allocation.opportunityId)) {
      throw new ArbitrageDecisionEngineError(
        "DUPLICATE_ALLOCATION",
        `Multiple allocations exist for opportunity ${allocation.opportunityId}.`,
      );
    }

    index.set(allocation.opportunityId, allocation);
  });

  return index;
}

function assertRankings(
  rankedOpportunities: readonly ArbitrageRankedOpportunity[],
  decidedAt: ArbitrageTimestamp,
  validateInputs: boolean,
): void {
  const opportunityIds = new Set<ArbitrageId>();
  const ranks = new Set<number>();

  rankedOpportunities.forEach((ranked, index) => {
    if (!Number.isSafeInteger(ranked.rank) || ranked.rank <= 0) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_RANKING",
        `rankedOpportunities[${index}].rank must be a positive safe integer.`,
      );
    }

    if (ranks.has(ranked.rank)) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_RANKING",
        `Duplicate rank ${ranked.rank} was supplied.`,
      );
    }
    ranks.add(ranked.rank);

    if (opportunityIds.has(ranked.opportunity.opportunityId)) {
      throw new ArbitrageDecisionEngineError(
        "DUPLICATE_OPPORTUNITY",
        `Opportunity ${ranked.opportunity.opportunityId} appears more than once.`,
      );
    }
    opportunityIds.add(ranked.opportunity.opportunityId);

    if (ranked.riskAssessment.opportunityId !== ranked.opportunity.opportunityId) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_RANKING",
        `Risk assessment does not belong to opportunity ${ranked.opportunity.opportunityId}.`,
      );
    }

    if (validateInputs) {
      assertInstitutionalArbitrageOpportunity(ranked.opportunity, decidedAt);
      validateResult(
        validateArbitrageRiskAssessment(ranked.riskAssessment),
        "INVALID_RANKING",
        `Risk assessment for ${ranked.opportunity.opportunityId} is invalid.`,
      );
    }
  });

  const sortedRanks = [...ranks].sort((left, right) => left - right);
  sortedRanks.forEach((rank, index) => {
    if (rank !== index + 1) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_RANKING",
        "Ranks must form a contiguous sequence starting at one.",
      );
    }
  });
}

function policyRejectionCodes(
  ranked: ArbitrageRankedOpportunity,
  policy: ArbitrageEvaluationPolicy,
  decidedAt: ArbitrageTimestamp,
): readonly ArbitrageRejectionCode[] {
  const opportunity = ranked.opportunity;
  const codes: ArbitrageRejectionCode[] = [];

  if (opportunity.expiresAt <= decidedAt) codes.push("OPPORTUNITY_EXPIRED");
  if (opportunity.profitEstimate.grossProfit < policy.minimumGrossProfit) {
    codes.push("INSUFFICIENT_GROSS_EDGE");
  }
  if (opportunity.profitEstimate.expectedNetProfit < policy.minimumNetProfit) {
    codes.push("INSUFFICIENT_NET_PROFIT");
  }
  if (
    opportunity.profitEstimate.netReturnPercentage < policy.minimumNetReturnPercentage
  ) {
    codes.push("INSUFFICIENT_RETURN");
  }
  if (opportunity.confidence < policy.minimumConfidence) {
    codes.push("INSUFFICIENT_CONFIDENCE");
  }
  if (ranked.riskAssessment.overallRiskScore > policy.maximumRiskScore) {
    codes.push("RISK_LIMIT_EXCEEDED");
  }
  if (!ranked.riskAssessment.approved) {
    codes.push("EXECUTION_POLICY_REJECTED");
  }

  return normalizeRejectionCodes(codes);
}

function createApproval(
  opportunityId: ArbitrageId,
  decidedAt: ArbitrageTimestamp,
  opportunityExpiresAt: ArbitrageTimestamp,
  durationMs: number,
  reason: string,
): ArbitrageManualApproval {
  const expiresAt = Math.min(opportunityExpiresAt, decidedAt + durationMs);

  return deepFreeze({
    approvalId: createApprovalId(opportunityId, decidedAt),
    opportunityId,
    status: "PENDING",
    requestedAt: decidedAt,
    expiresAt,
    reason,
    metadata: freezeMetadata({
      source: "ARBITRAGE_DECISION_ENGINE",
      deterministic: true,
    }),
  });
}

function buildDecisionMetadata(
  ranked: ArbitrageRankedOpportunity,
  allocation: ArbitrageCapitalAllocation | undefined,
  policyCodes: readonly ArbitrageRejectionCode[],
): ArbitrageMetadata {
  return freezeMetadata({
    engine: "ARBITRAGE_DECISION_ENGINE",
    deterministic: true,
    rank: ranked.rank,
    finalScore: ranked.score.finalScore,
    riskApproved: ranked.riskAssessment.approved,
    riskScore: ranked.riskAssessment.overallRiskScore,
    hasCapitalAllocation: allocation !== undefined,
    policyRejectionCodes: [...policyCodes],
  });
}

function cloneAllocation(
  allocation: ArbitrageCapitalAllocation,
): ArbitrageCapitalAllocation {
  return deepFreeze({
    ...allocation,
    metadata: freezeMetadata(allocation.metadata),
  });
}

function cloneRiskAssessment(
  ranked: ArbitrageRankedOpportunity,
): ArbitrageRankedOpportunity["riskAssessment"] {
  return deepFreeze({
    ...ranked.riskAssessment,
    findings: ranked.riskAssessment.findings.map((finding) =>
      deepFreeze({
        ...finding,
        affectedLegIds: Object.freeze([...finding.affectedLegIds]),
        metadata: freezeMetadata(finding.metadata),
      }),
    ),
    rejectionCodes: Object.freeze([...ranked.riskAssessment.rejectionCodes]),
    metadata: freezeMetadata(ranked.riskAssessment.metadata),
  });
}

function createDecision(
  ranked: ArbitrageRankedOpportunity,
  action: ArbitrageDecisionAction,
  decidedAt: ArbitrageTimestamp,
  reason: string,
  rejectionCodes: readonly ArbitrageRejectionCode[],
  allocation: ArbitrageCapitalAllocation | undefined,
  approval: ArbitrageManualApproval | undefined,
  policyCodes: readonly ArbitrageRejectionCode[],
): ArbitrageDecision {
  const decision: ArbitrageDecision = deepFreeze({
    decisionId: createDecisionId(
      ranked.opportunity.opportunityId,
      action,
      decidedAt,
    ),
    opportunityId: ranked.opportunity.opportunityId,
    action,
    automationMode: ranked.opportunity.automationMode,
    decidedAt,
    score: deepFreeze({ ...ranked.score }),
    riskAssessment: cloneRiskAssessment(ranked),
    ...(allocation === undefined
      ? {}
      : { capitalAllocation: cloneAllocation(allocation) }),
    ...(approval === undefined ? {} : { approval }),
    rejectionCodes: normalizeRejectionCodes(rejectionCodes),
    reason,
    correlationId: ranked.opportunity.correlationId,
    traceId: ranked.opportunity.traceId,
    metadata: buildDecisionMetadata(ranked, allocation, policyCodes),
  });

  validateResult(
    validateArbitrageDecision(decision),
    "INVALID_GENERATED_DECISION",
    `Generated decision for ${ranked.opportunity.opportunityId} is invalid.`,
  );

  return decision;
}

export class ArbitrageDecisionEngine
  implements InstitutionalArbitrageDecisionEngine
{
  private readonly options: ResolvedOptions;

  public constructor(options?: ArbitrageDecisionEngineOptions) {
    this.options = resolveOptions(options);
  }

  public decide(
    rankedOpportunities: readonly ArbitrageRankedOpportunity[],
    allocations: readonly ArbitrageCapitalAllocation[],
    policy: ArbitrageEvaluationPolicy,
    decidedAt: ArbitrageTimestamp,
  ): readonly ArbitrageDecision[] {
    return this.decideWithDiagnostics({
      rankedOpportunities,
      allocations,
      policy,
      decidedAt,
    }).decisions;
  }

  public decideWithDiagnostics(
    request: ArbitrageDecisionEngineRequest,
  ): ArbitrageDecisionEngineDiagnostics {
    if (!isRecord(request)) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_ARGUMENT",
        "request must be an object.",
      );
    }

    assertTimestamp(request.decidedAt, "request.decidedAt");

    if (!Array.isArray(request.rankedOpportunities)) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_ARGUMENT",
        "request.rankedOpportunities must be an array.",
      );
    }
    if (!Array.isArray(request.allocations)) {
      throw new ArbitrageDecisionEngineError(
        "INVALID_ARGUMENT",
        "request.allocations must be an array.",
      );
    }

    if (this.options.validateInputs) {
      assertArbitrageEvaluationPolicy(request.policy);
    }

    assertRankings(
      request.rankedOpportunities,
      request.decidedAt,
      this.options.validateInputs,
    );

    const allocationIndex = buildAllocationIndex(
      request.allocations,
      this.options.validateInputs,
    );
    const rankedIds = new Set(
      request.rankedOpportunities.map(
        (ranked) => ranked.opportunity.opportunityId,
      ),
    );

    request.allocations.forEach((allocation) => {
      if (!rankedIds.has(allocation.opportunityId)) {
        throw new ArbitrageDecisionEngineError(
          "INCONSISTENT_ALLOCATION",
          `Allocation ${allocation.allocationId} references an unranked opportunity.`,
        );
      }
    });

    const observations: string[] = [];
    const unallocatedOpportunityIds: ArbitrageId[] = [];
    const decisions = [...request.rankedOpportunities]
      .sort((left, right) => left.rank - right.rank)
      .map((ranked) => {
        const opportunity = ranked.opportunity;
        const allocation = allocationIndex.get(opportunity.opportunityId);
        const policyCodes = policyRejectionCodes(
          ranked,
          request.policy,
          request.decidedAt,
        );
        const inheritedRiskCodes = this.options.inheritRiskRejectionCodes
          ? ranked.riskAssessment.rejectionCodes
          : [];
        const rejectionCodes = normalizeRejectionCodes([
          ...policyCodes,
          ...inheritedRiskCodes,
        ]);

        if (allocation !== undefined) {
          if (allocation.reservationExpiresAt <= request.decidedAt) {
            return createDecision(
              ranked,
              "REJECT",
              request.decidedAt,
              "The capital reservation expired before the decision was created.",
              [...rejectionCodes, "CONFLICTING_CAPITAL_RESERVATION"],
              undefined,
              undefined,
              policyCodes,
            );
          }

          if (allocation.approvedCapital > ranked.riskAssessment.maximumApprovedCapital) {
            throw new ArbitrageDecisionEngineError(
              "INCONSISTENT_ALLOCATION",
              `Allocation for ${opportunity.opportunityId} exceeds risk-approved capital.`,
            );
          }
        } else {
          unallocatedOpportunityIds.push(opportunity.opportunityId);
        }

        if (opportunity.automationMode === "SIGNAL_ONLY") {
          const publishRejected =
            rejectionCodes.length > 0 &&
            request.policy.publishRejectedSignals &&
            this.options.publishRejectedSignalOnlyOpportunities;
          const publishApproved =
            rejectionCodes.length === 0 &&
            this.options.publishApprovedSignalOnlyOpportunities;

          if (publishRejected || publishApproved) {
            return createDecision(
              ranked,
              "PUBLISH_SIGNAL",
              request.decidedAt,
              publishRejected
                ? "Signal published for visibility despite execution-policy rejection."
                : "Signal-only opportunity passed decision policy and is ready for publication.",
              rejectionCodes,
              allocation,
              undefined,
              policyCodes,
            );
          }

          return createDecision(
            ranked,
            "REJECT",
            request.decidedAt,
            "Signal-only opportunity did not satisfy signal publication policy.",
            rejectionCodes.length > 0
              ? rejectionCodes
              : ["EXECUTION_POLICY_REJECTED"],
            undefined,
            undefined,
            policyCodes,
          );
        }

        if (rejectionCodes.length > 0) {
          return createDecision(
            ranked,
            "REJECT",
            request.decidedAt,
            "Opportunity failed profitability, confidence, expiry, or risk policy.",
            rejectionCodes,
            undefined,
            undefined,
            policyCodes,
          );
        }

        const requiresStablecoinApproval =
          opportunity.type === "STABLECOIN" &&
          (request.policy.requireManualApprovalForStablecoin ||
            this.options.requireManualApprovalForStablecoin);
        const requiresSemiAutomatedApproval =
          opportunity.automationMode === "SEMI_AUTOMATED";

        if (requiresStablecoinApproval || requiresSemiAutomatedApproval) {
          if (allocation === undefined) {
            return createDecision(
              ranked,
              this.options.deferWhenAllocationMissing ? "DEFER" : "REJECT",
              request.decidedAt,
              "Manual approval cannot be requested until capital is reserved.",
              this.options.deferWhenAllocationMissing
                ? []
                : ["INSUFFICIENT_CAPITAL"],
              undefined,
              undefined,
              policyCodes,
            );
          }

          const reason =
            opportunity.type === "STABLECOIN"
              ? "Stablecoin arbitrage requires manual approval under the active safety policy."
              : "Semi-automated arbitrage requires manual approval before execution.";
          const approval = createApproval(
            opportunity.opportunityId,
            request.decidedAt,
            Math.min(opportunity.expiresAt, allocation.reservationExpiresAt),
            this.options.manualApprovalDurationMs,
            reason,
          );

          if (approval.expiresAt <= request.decidedAt) {
            return createDecision(
              ranked,
              "REJECT",
              request.decidedAt,
              "Insufficient opportunity lifetime remains for manual approval.",
              ["MANUAL_APPROVAL_EXPIRED"],
              undefined,
              undefined,
              policyCodes,
            );
          }

          return createDecision(
            ranked,
            "REQUEST_APPROVAL",
            request.decidedAt,
            reason,
            [],
            allocation,
            approval,
            policyCodes,
          );
        }

        if (allocation === undefined || allocation.approvedCapital <= 0) {
          return createDecision(
            ranked,
            this.options.deferWhenAllocationMissing ? "DEFER" : "REJECT",
            request.decidedAt,
            this.options.deferWhenAllocationMissing
              ? "Opportunity passed policy but no executable capital reservation is available."
              : "Opportunity cannot execute without approved capital.",
            this.options.deferWhenAllocationMissing
              ? []
              : ["INSUFFICIENT_CAPITAL"],
            undefined,
            undefined,
            policyCodes,
          );
        }

        return createDecision(
          ranked,
          "EXECUTE",
          request.decidedAt,
          "Fully automated opportunity passed policy, risk, and capital-allocation gates.",
          [],
          allocation,
          undefined,
          policyCodes,
        );
      });

    const counts = decisions.reduce(
      (aggregate, decision) => {
        aggregate[decision.action] += 1;
        return aggregate;
      },
      {
        EXECUTE: 0,
        REQUEST_APPROVAL: 0,
        PUBLISH_SIGNAL: 0,
        DEFER: 0,
        REJECT: 0,
        CANCEL: 0,
      } satisfies Record<ArbitrageDecisionAction, number>,
    );

    observations.push(
      `Evaluated ${decisions.length} ranked arbitrage opportunities deterministically.`,
    );
    observations.push(
      `${request.allocations.length} opportunity allocations were supplied.`,
    );
    if (unallocatedOpportunityIds.length > 0) {
      observations.push(
        `${unallocatedOpportunityIds.length} ranked opportunities had no capital allocation.`,
      );
    }

    return deepFreeze({
      decisions,
      executeCount: counts.EXECUTE,
      approvalCount: counts.REQUEST_APPROVAL,
      signalCount: counts.PUBLISH_SIGNAL,
      deferCount: counts.DEFER,
      rejectCount: counts.REJECT,
      cancelCount: counts.CANCEL,
      allocatedOpportunityCount: allocationIndex.size,
      unallocatedOpportunityIds,
      observations,
    });
  }
}

export function createArbitrageDecisionEngine(
  options?: ArbitrageDecisionEngineOptions,
): ArbitrageDecisionEngine {
  return new ArbitrageDecisionEngine(options);
}