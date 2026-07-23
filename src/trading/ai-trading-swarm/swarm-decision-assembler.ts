/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-decision-assembler.ts
 *
 * Deterministic, immutable assembly of the final swarm collective decision.
 */

import {
  type TradingSwarmCollectiveConfidence,
  type TradingSwarmCollectiveDecision,
  type TradingSwarmConsensusResult,
  type TradingSwarmDecision,
  type TradingSwarmDecisionAction,
  type TradingSwarmDecisionAssemblerPort,
  type TradingSwarmDecisionCandidate,
  type TradingSwarmDissentRecord,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmGovernanceAssessment,
  type TradingSwarmMetadata,
  type TradingSwarmMission,
  type TradingSwarmOperatorEscalation,
  type TradingSwarmRiskSeverity,
  type TradingSwarmTimestamp,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmDecisionAssemblerErrorCode =
  | "INVALID_MISSION"
  | "INVALID_CANDIDATES"
  | "INVALID_CONSENSUS"
  | "INVALID_GOVERNANCE"
  | "MISSION_MISMATCH"
  | "DUPLICATE_CANDIDATE"
  | "SELECTED_CANDIDATE_NOT_FOUND"
  | "SELECTED_CANDIDATE_MISMATCH"
  | "ASSEMBLY_FAILED";

export interface SwarmDecisionAssemblerErrorDetails {
  readonly missionId?: string;
  readonly candidateId?: string;
  readonly consensusId?: string;
  readonly governanceAssessmentId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmDecisionAssemblerError extends Error {
  public readonly code: SwarmDecisionAssemblerErrorCode;
  public readonly details: SwarmDecisionAssemblerErrorDetails;

  public constructor(
    code: SwarmDecisionAssemblerErrorCode,
    message: string,
    details: SwarmDecisionAssemblerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmDecisionAssemblerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmDecisionAssemblerOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly failClosedOnMissingCandidate?: boolean;
  readonly suppressActionsWhenUnauthorized?: boolean;
  readonly suppressActionsForNonExecutableDecision?: boolean;
  readonly defaultValidityWindowMs?: number;
  readonly maximumValidityWindowMs?: number;
  readonly escalationValidityWindowMs?: number;
  readonly metadata?: TradingSwarmMetadata;
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly failClosedOnMissingCandidate: boolean;
  readonly suppressActionsWhenUnauthorized: boolean;
  readonly suppressActionsForNonExecutableDecision: boolean;
  readonly defaultValidityWindowMs: number;
  readonly maximumValidityWindowMs: number;
  readonly escalationValidityWindowMs: number;
  readonly metadata: TradingSwarmMetadata;
}

interface AssemblyResolution {
  readonly candidate?: TradingSwarmDecisionCandidate;
  readonly decision: TradingSwarmDecision;
  readonly actions: readonly TradingSwarmDecisionAction[];
  readonly expectedUtility: number;
  readonly estimatedRisk: number;
  readonly restrictions: readonly string[];
  readonly operatorEscalation?: TradingSwarmOperatorEscalation;
}

/* ========================================================================== *
 * Constants
 * ========================================================================== */

const EXECUTABLE_DECISIONS = Object.freeze([
  "EXECUTE",
  "EXECUTE_WITH_RESTRICTIONS",
] as const);

const NON_ACTION_DECISIONS = Object.freeze([
  "SIGNAL_ONLY",
  "HOLD",
  "DEFER",
  "REJECT",
] as const);

const SYSTEM_CONTROL_ACTION_TYPES = Object.freeze([
  "REPARTITION_SWARM",
  "MIGRATE_WORKLOAD",
] as const);

/* ========================================================================== *
 * Assembler
 * ========================================================================== */

export class SwarmDecisionAssembler
  implements TradingSwarmDecisionAssemblerPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmDecisionAssemblerOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public assemble(
    mission: TradingSwarmMission,
    candidates: readonly TradingSwarmDecisionCandidate[],
    consensus: TradingSwarmConsensusResult,
    governance: TradingSwarmGovernanceAssessment,
  ): TradingSwarmCollectiveDecision {
    try {
      validateInputs(
        mission,
        candidates,
        consensus,
        governance,
      );

      const candidate = resolveSelectedCandidate(
        candidates,
        consensus.selectedCandidateId,
      );

      if (
        consensus.selectedCandidateId !== undefined &&
        candidate === undefined &&
        !this.options.failClosedOnMissingCandidate
      ) {
        throw new SwarmDecisionAssemblerError(
          "SELECTED_CANDIDATE_NOT_FOUND",
          `Selected candidate "${consensus.selectedCandidateId}" was not found.`,
          {
            missionId: mission.missionId,
            candidateId: consensus.selectedCandidateId,
            consensusId: consensus.consensusId,
            governanceAssessmentId:
              governance.assessmentId,
          },
        );
      }

      const decidedAtMs = resolveDecidedAt(
        mission,
        candidate,
        consensus,
        governance,
      );

      const resolution = this.resolveAssembly(
        mission,
        candidate,
        consensus,
        governance,
        decidedAtMs,
      );

      const collectiveConfidence =
        assembleCollectiveConfidence(
          consensus.collectiveConfidence,
          governance,
          resolution.estimatedRisk,
        );

      const validUntilMs = resolveValidUntil(
        mission,
        decidedAtMs,
        resolution.decision,
        this.options,
      );

      const metadata = assembleMetadata(
        mission,
        candidate,
        consensus,
        governance,
        this.options.metadata,
      );

      const base = {
        decisionId: createDecisionId(
          mission,
          candidate,
          consensus,
          governance,
          resolution,
          collectiveConfidence,
          validUntilMs,
        ),
        missionId: mission.missionId,
        runId: mission.runId,
        decision: resolution.decision,
        ...(candidate === undefined
          ? {}
          : {
              selectedCandidateId:
                candidate.candidateId,
            }),
        actions: resolution.actions,
        consensus,
        governance,
        collectiveConfidence,
        expectedUtility:
          resolution.expectedUtility,
        estimatedRisk:
          resolution.estimatedRisk,
        restrictions:
          resolution.restrictions,
        dissent: freezeDissent(
          consensus.dissent,
        ),
        ...(resolution.operatorEscalation ===
        undefined
          ? {}
          : {
              operatorEscalation:
                resolution.operatorEscalation,
            }),
        decidedAtMs,
        ...(validUntilMs === undefined
          ? {}
          : { validUntilMs }),
        metadata,
      } satisfies Omit<
        TradingSwarmCollectiveDecision,
        "deterministicFingerprint"
      >;

      return deepFreeze({
        ...base,
        deterministicFingerprint:
          this.options.fingerprintGenerator.fingerprint(
            base,
          ),
      });
    } catch (error) {
      if (
        error instanceof
        SwarmDecisionAssemblerError
      ) {
        throw error;
      }

      throw new SwarmDecisionAssemblerError(
        "ASSEMBLY_FAILED",
        "Failed to assemble the deterministic swarm collective decision.",
        {
          missionId: mission?.missionId,
          consensusId: consensus?.consensusId,
          governanceAssessmentId:
            governance?.assessmentId,
          cause: error,
        },
      );
    }
  }

  private resolveAssembly(
    mission: TradingSwarmMission,
    candidate:
      | TradingSwarmDecisionCandidate
      | undefined,
    consensus: TradingSwarmConsensusResult,
    governance: TradingSwarmGovernanceAssessment,
    decidedAtMs: TradingSwarmTimestamp,
  ): AssemblyResolution {
    const decision = resolveCollectiveDecision(
      candidate,
      consensus,
      governance,
    );

    const restrictions = Object.freeze(
      uniqueSorted([
        ...(candidate?.restrictions ?? []),
        ...governance.riskAssessment.restrictions,
        ...governance.restrictions,
        ...governance.ruleResults.flatMap(
          (result) => result.restrictions,
        ),
        ...deriveDecisionRestrictions(
          decision,
          candidate,
          consensus,
          governance,
        ),
      ]),
    );

    const actions = this.resolveActions(
      candidate?.actions ?? [],
      decision,
      governance,
      restrictions,
    );

    const expectedUtility =
      candidate === undefined
        ? 0
        : normalizeUtility(
            candidate.expectedUtility,
            decision,
            governance,
          );

    const estimatedRisk =
      clamp01(
        Math.max(
          candidate?.estimatedRisk ?? 0,
          governance.riskAssessment.overallRisk,
        ),
      );

    const operatorEscalation =
      createOperatorEscalation(
        mission,
        consensus,
        governance,
        estimatedRisk,
        decidedAtMs,
        this.options.escalationValidityWindowMs,
      );

    return deepFreeze({
      candidate,
      decision,
      actions,
      expectedUtility,
      estimatedRisk,
      restrictions,
      ...(operatorEscalation === undefined
        ? {}
        : { operatorEscalation }),
    });
  }

  private resolveActions(
    candidateActions:
      readonly TradingSwarmDecisionAction[],
    decision: TradingSwarmDecision,
    governance: TradingSwarmGovernanceAssessment,
    collectiveRestrictions: readonly string[],
  ): readonly TradingSwarmDecisionAction[] {
    if (
      this.options.suppressActionsWhenUnauthorized &&
      !governance.executionAuthorized
    ) {
      return Object.freeze([]);
    }

    if (
      this.options
        .suppressActionsForNonExecutableDecision &&
      NON_ACTION_DECISIONS.includes(
        decision as
          (typeof NON_ACTION_DECISIONS)[number],
      )
    ) {
      return Object.freeze([]);
    }

    const allowSystemControlOnly =
      decision === "PAUSE_SYSTEM" ||
      decision === "RECOVER_SYSTEM";

    const filtered = candidateActions
      .filter((action) =>
        allowSystemControlOnly
          ? SYSTEM_CONTROL_ACTION_TYPES.includes(
              action.type as
                (typeof SYSTEM_CONTROL_ACTION_TYPES)[number],
            ) ||
            action.type === "NO_ACTION"
          : action.type !== "NO_ACTION",
      )
      .map((action) =>
        deepFreeze({
          ...action,
          dependencies: Object.freeze(
            uniqueSorted(action.dependencies),
          ),
          restrictions: Object.freeze(
            uniqueSorted([
              ...action.restrictions,
              ...collectiveRestrictions,
            ]),
          ),
          ...(action.metadata === undefined
            ? {}
            : {
                metadata: deepFreeze(
                  action.metadata,
                ),
              }),
        }),
      )
      .sort(compareActions);

    return Object.freeze(filtered);
  }
}

/* ========================================================================== *
 * Decision mapping
 * ========================================================================== */

function resolveCollectiveDecision(
  candidate:
    | TradingSwarmDecisionCandidate
    | undefined,
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
): TradingSwarmDecision {
  switch (governance.decision) {
    case "REJECTED":
      return "REJECT";

    case "DEFERRED":
      return "DEFER";

    case "REQUIRES_OPERATOR_APPROVAL":
      return "DEFER";

    case "APPROVED_WITH_RESTRICTIONS":
      if (
        candidate === undefined ||
        !governance.executionAuthorized
      ) {
        return "SIGNAL_ONLY";
      }

      if (
        candidate.decision === "PAUSE_SYSTEM" ||
        candidate.decision === "RECOVER_SYSTEM"
      ) {
        return candidate.decision;
      }

      return EXECUTABLE_DECISIONS.includes(
        candidate.decision as
          (typeof EXECUTABLE_DECISIONS)[number],
      )
        ? "EXECUTE_WITH_RESTRICTIONS"
        : candidate.decision;

    case "APPROVED":
      if (candidate === undefined) {
        return fallbackDecisionForConsensus(
          consensus,
        );
      }

      if (
        !governance.executionAuthorized &&
        EXECUTABLE_DECISIONS.includes(
          candidate.decision as
            (typeof EXECUTABLE_DECISIONS)[number],
        )
      ) {
        return "SIGNAL_ONLY";
      }

      return candidate.decision;
  }
}

function fallbackDecisionForConsensus(
  consensus: TradingSwarmConsensusResult,
): TradingSwarmDecision {
  switch (consensus.status) {
    case "REJECTED":
    case "VETOED":
      return "REJECT";

    case "NO_QUORUM":
    case "DEADLOCKED":
    case "DEFERRED":
      return "DEFER";

    case "CONSENSUS_REACHED":
    case "CONSENSUS_WITH_RESTRICTIONS":
      return "HOLD";
  }
}

function deriveDecisionRestrictions(
  decision: TradingSwarmDecision,
  candidate:
    | TradingSwarmDecisionCandidate
    | undefined,
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
): readonly string[] {
  const restrictions: string[] = [];

  if (candidate === undefined) {
    restrictions.push(
      "No selected candidate is available.",
    );
  }

  if (!consensus.quorumSatisfied) {
    restrictions.push(
      "Consensus quorum is not satisfied.",
    );
  }

  if (consensus.vetoCount > 0) {
    restrictions.push(
      "One or more consensus vetoes remain unresolved.",
    );
  }

  if (
    consensus.unresolvedConflictIds.length > 0
  ) {
    restrictions.push(
      "Consensus conflicts remain unresolved.",
    );
  }

  if (
    consensus.dissent.some(
      (record) => record.material,
    )
  ) {
    restrictions.push(
      "Material dissent remains attached to the decision.",
    );
  }

  if (!governance.executionAuthorized) {
    restrictions.push(
      "Autonomous execution is not authorized.",
    );
  }

  if (
    governance.operatorApprovalRequired
  ) {
    restrictions.push(
      "Operator approval is required.",
    );
  }

  if (
    decision === "EXECUTE_WITH_RESTRICTIONS"
  ) {
    restrictions.push(
      "Execution must comply with all collective restrictions.",
    );
  }

  if (
    decision === "SIGNAL_ONLY"
  ) {
    restrictions.push(
      "Decision is informational and must not execute autonomously.",
    );
  }

  if (decision === "DEFER") {
    restrictions.push(
      "Decision is deferred pending resolution or approval.",
    );
  }

  if (decision === "REJECT") {
    restrictions.push(
      "Decision is rejected and must not execute.",
    );
  }

  return Object.freeze(
    uniqueSorted(restrictions),
  );
}

/* ========================================================================== *
 * Confidence, utility, risk, and escalation
 * ========================================================================== */

function assembleCollectiveConfidence(
  source: TradingSwarmCollectiveConfidence,
  governance: TradingSwarmGovernanceAssessment,
  estimatedRisk: number,
): TradingSwarmCollectiveConfidence {
  const governanceAdjustment =
    resolveGovernanceAdjustment(governance);

  const systemicRiskAdjustment =
    clampAdjustment(
      source.systemicRiskAdjustment -
        estimatedRisk * 0.15,
    );

  const finalConfidence = clamp01(
    source.rawConfidence +
      source.nodeReliabilityAdjustment +
      source.partitionCoverageAdjustment +
      source.dissentAdjustment +
      systemicRiskAdjustment +
      governanceAdjustment,
  );

  return deepFreeze({
    rawConfidence: clamp01(
      source.rawConfidence,
    ),
    nodeReliabilityAdjustment:
      clampAdjustment(
        source.nodeReliabilityAdjustment,
      ),
    partitionCoverageAdjustment:
      clampAdjustment(
        source.partitionCoverageAdjustment,
      ),
    dissentAdjustment:
      clampAdjustment(
        source.dissentAdjustment,
      ),
    systemicRiskAdjustment,
    governanceAdjustment,
    finalConfidence,
  });
}

function resolveGovernanceAdjustment(
  governance: TradingSwarmGovernanceAssessment,
): number {
  switch (governance.decision) {
    case "APPROVED":
      return 0;

    case "APPROVED_WITH_RESTRICTIONS":
      return -0.05;

    case "REQUIRES_OPERATOR_APPROVAL":
      return -0.15;

    case "DEFERRED":
      return -0.25;

    case "REJECTED":
      return -0.5;
  }
}

function normalizeUtility(
  utility: number,
  decision: TradingSwarmDecision,
  governance: TradingSwarmGovernanceAssessment,
): number {
  if (
    decision === "REJECT" ||
    decision === "DEFER" ||
    decision === "HOLD"
  ) {
    return 0;
  }

  if (
    decision === "SIGNAL_ONLY"
  ) {
    return finiteOrZero(utility) * 0.5;
  }

  if (
    governance.decision ===
    "APPROVED_WITH_RESTRICTIONS"
  ) {
    return finiteOrZero(utility) * 0.9;
  }

  return finiteOrZero(utility);
}

function createOperatorEscalation(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
  estimatedRisk: number,
  createdAtMs: TradingSwarmTimestamp,
  validityWindowMs: number,
):
  | TradingSwarmOperatorEscalation
  | undefined {
  const required =
    governance.operatorApprovalRequired ||
    governance.decision ===
      "REQUIRES_OPERATOR_APPROVAL";

  if (!required) {
    return undefined;
  }

  const reason = resolveEscalationReason(
    consensus,
    governance,
    estimatedRisk,
  );

  const severity = resolveEscalationSeverity(
    consensus,
    governance,
    estimatedRisk,
  );

  const requestedActions = uniqueSorted([
    "Review the collective decision.",
    "Review all blocking governance and risk findings.",
    "Approve, reject, or request a revised swarm decision.",
    ...(consensus.unresolvedConflictIds.length >
    0
      ? [
          "Resolve outstanding consensus conflicts.",
        ]
      : []),
    ...(consensus.dissent.some(
      (record) => record.material,
    )
      ? ["Review material dissent records."]
      : []),
  ]);

  const summary = buildEscalationSummary(
    consensus,
    governance,
    estimatedRisk,
  );

  const base = {
    missionId: mission.missionId,
    reason,
    severity,
    summary,
    requestedActions,
    createdAtMs,
    expiresAtMs: toTradingSwarmTimestamp(
      Number(createdAtMs) + validityWindowMs,
    ),
  } satisfies Omit<
    TradingSwarmOperatorEscalation,
    "escalationId"
  >;

  return deepFreeze({
    escalationId:
      `swarm-operator-escalation-${stableHash(
        stableStringify(base),
      )}`,
    ...base,
  });
}

function resolveEscalationReason(
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
  estimatedRisk: number,
): TradingSwarmOperatorEscalation["reason"] {
  if (estimatedRisk >= 0.8) {
    return "HIGH_RISK";
  }

  if (consensus.status === "NO_QUORUM") {
    return "NO_QUORUM";
  }

  if (consensus.status === "DEADLOCKED") {
    return "DEADLOCK";
  }

  if (
    consensus.dissent.some(
      (record) => record.material,
    )
  ) {
    return "CRITICAL_DISSENT";
  }

  if (
    governance.operatorApprovalRequired &&
    !governance.executionAuthorized
  ) {
    return "EXECUTION_AUTHORITY_REQUIRED";
  }

  if (
    governance.ruleResults.some(
      (result) =>
        !result.passed && result.blocking,
    )
  ) {
    return "POLICY_REQUIREMENT";
  }

  return "MANUAL_REVIEW";
}

function resolveEscalationSeverity(
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
  estimatedRisk: number,
): TradingSwarmRiskSeverity {
  if (
    estimatedRisk >= 0.9 ||
    governance.riskAssessment.findings.some(
      (finding) =>
        finding.severity === "CRITICAL",
    )
  ) {
    return "CRITICAL";
  }

  if (
    estimatedRisk >= 0.7 ||
    consensus.status === "VETOED" ||
    governance.ruleResults.some(
      (result) =>
        !result.passed && result.blocking,
    )
  ) {
    return "HIGH";
  }

  if (
    estimatedRisk >= 0.4 ||
    consensus.dissent.some(
      (record) => record.material,
    )
  ) {
    return "MODERATE";
  }

  return "LOW";
}

function buildEscalationSummary(
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
  estimatedRisk: number,
): string {
  const failedRuleCount =
    governance.ruleResults.filter(
      (result) => !result.passed,
    ).length;

  const materialDissentCount =
    consensus.dissent.filter(
      (record) => record.material,
    ).length;

  return [
    "Swarm decision requires operator review.",
    `Governance decision: ${governance.decision}.`,
    `Consensus status: ${consensus.status}.`,
    `Estimated risk: ${estimatedRisk.toFixed(6)}.`,
    `Failed governance rules: ${failedRuleCount}.`,
    `Material dissent records: ${materialDissentCount}.`,
  ].join(" ");
}

/* ========================================================================== *
 * Time and metadata
 * ========================================================================== */

function resolveDecidedAt(
  mission: TradingSwarmMission,
  candidate:
    | TradingSwarmDecisionCandidate
    | undefined,
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
): TradingSwarmTimestamp {
  return toTradingSwarmTimestamp(
    Math.max(
      Number(mission.createdAtMs),
      Number(candidate?.createdAtMs ?? 0),
      Number(consensus.formedAtMs),
      Number(governance.assessedAtMs),
    ),
  );
}

function resolveValidUntil(
  mission: TradingSwarmMission,
  decidedAtMs: TradingSwarmTimestamp,
  decision: TradingSwarmDecision,
  options: NormalizedOptions,
): TradingSwarmTimestamp | undefined {
  if (
    decision === "REJECT" ||
    decision === "HOLD"
  ) {
    return undefined;
  }

  const candidateExpiry =
    toTradingSwarmTimestamp(
      Number(decidedAtMs) +
        Math.min(
          options.defaultValidityWindowMs,
          options.maximumValidityWindowMs,
        ),
    );

  if (mission.deadlineAtMs === undefined) {
    return candidateExpiry;
  }

  return toTradingSwarmTimestamp(
    Math.min(
      Number(candidateExpiry),
      Number(mission.deadlineAtMs),
    ),
  );
}

function assembleMetadata(
  mission: TradingSwarmMission,
  candidate:
    | TradingSwarmDecisionCandidate
    | undefined,
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
  configured: TradingSwarmMetadata,
): TradingSwarmMetadata {
  return deepFreeze({
    ...configured,
    assembler: "SwarmDecisionAssembler",
    assemblerVersion: "1.0.0",
    swarmId: mission.swarmId,
    objective: mission.objective,
    consensusId: consensus.consensusId,
    consensusStatus: consensus.status,
    governanceAssessmentId:
      governance.assessmentId,
    governanceDecision:
      governance.decision,
    riskAssessmentId:
      governance.riskAssessment.assessmentId,
    ...(candidate === undefined
      ? {}
      : {
          proposedByNodeId:
            candidate.proposedByNodeId,
          sourceDecisionIds:
            Object.freeze(
              [...candidate.sourceDecisionIds].sort(),
            ),
        }),
  });
}

/* ========================================================================== *
 * Validation
 * ========================================================================== */

function validateInputs(
  mission: TradingSwarmMission,
  candidates: readonly TradingSwarmDecisionCandidate[],
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
): void {
  if (
    mission === undefined ||
    mission === null ||
    typeof mission.missionId !== "string" ||
    mission.missionId.trim().length === 0 ||
    typeof mission.runId !== "string" ||
    mission.runId.trim().length === 0
  ) {
    throw new SwarmDecisionAssemblerError(
      "INVALID_MISSION",
      "A valid mission with missionId and runId is required.",
    );
  }

  if (!Array.isArray(candidates)) {
    throw new SwarmDecisionAssemblerError(
      "INVALID_CANDIDATES",
      "candidates must be an array.",
      { missionId: mission.missionId },
    );
  }

  const candidateIds = new Set<string>();

  for (const candidate of candidates) {
    if (
      typeof candidate.candidateId !==
        "string" ||
      candidate.candidateId.trim().length === 0
    ) {
      throw new SwarmDecisionAssemblerError(
        "INVALID_CANDIDATES",
        "Each candidate must have a non-empty candidateId.",
        { missionId: mission.missionId },
      );
    }

    if (
      candidate.missionId !==
      mission.missionId
    ) {
      throw new SwarmDecisionAssemblerError(
        "SELECTED_CANDIDATE_MISMATCH",
        `Candidate "${candidate.candidateId}" belongs to another mission.`,
        {
          missionId: mission.missionId,
          candidateId:
            candidate.candidateId,
        },
      );
    }

    if (
      candidateIds.has(
        candidate.candidateId,
      )
    ) {
      throw new SwarmDecisionAssemblerError(
        "DUPLICATE_CANDIDATE",
        `Duplicate candidate "${candidate.candidateId}".`,
        {
          missionId: mission.missionId,
          candidateId:
            candidate.candidateId,
        },
      );
    }

    candidateIds.add(
      candidate.candidateId,
    );
  }

  if (
    consensus === undefined ||
    consensus === null ||
    typeof consensus.consensusId !==
      "string" ||
    consensus.consensusId.trim().length === 0
  ) {
    throw new SwarmDecisionAssemblerError(
      "INVALID_CONSENSUS",
      "A valid consensus result is required.",
      { missionId: mission.missionId },
    );
  }

  if (
    consensus.missionId !==
    mission.missionId
  ) {
    throw new SwarmDecisionAssemblerError(
      "MISSION_MISMATCH",
      "Consensus belongs to another mission.",
      {
        missionId: mission.missionId,
        consensusId:
          consensus.consensusId,
      },
    );
  }

  if (
    governance === undefined ||
    governance === null ||
    typeof governance.assessmentId !==
      "string" ||
    governance.assessmentId.trim().length ===
      0
  ) {
    throw new SwarmDecisionAssemblerError(
      "INVALID_GOVERNANCE",
      "A valid governance assessment is required.",
      {
        missionId: mission.missionId,
        consensusId:
          consensus.consensusId,
      },
    );
  }

  if (
    governance.missionId !==
    mission.missionId
  ) {
    throw new SwarmDecisionAssemblerError(
      "MISSION_MISMATCH",
      "Governance assessment belongs to another mission.",
      {
        missionId: mission.missionId,
        consensusId:
          consensus.consensusId,
        governanceAssessmentId:
          governance.assessmentId,
      },
    );
  }

  if (
    consensus.selectedCandidateId !==
      undefined &&
    !candidateIds.has(
      consensus.selectedCandidateId,
    )
  ) {
    throw new SwarmDecisionAssemblerError(
      "SELECTED_CANDIDATE_NOT_FOUND",
      `Selected candidate "${consensus.selectedCandidateId}" was not supplied.`,
      {
        missionId: mission.missionId,
        candidateId:
          consensus.selectedCandidateId,
        consensusId:
          consensus.consensusId,
      },
    );
  }
}

function resolveSelectedCandidate(
  candidates: readonly TradingSwarmDecisionCandidate[],
  selectedCandidateId: string | undefined,
):
  | TradingSwarmDecisionCandidate
  | undefined {
  if (selectedCandidateId === undefined) {
    return undefined;
  }

  return candidates.find(
    (candidate) =>
      candidate.candidateId ===
      selectedCandidateId,
  );
}

/* ========================================================================== *
 * Identity and ordering
 * ========================================================================== */

function createDecisionId(
  mission: TradingSwarmMission,
  candidate:
    | TradingSwarmDecisionCandidate
    | undefined,
  consensus: TradingSwarmConsensusResult,
  governance: TradingSwarmGovernanceAssessment,
  resolution: AssemblyResolution,
  confidence: TradingSwarmCollectiveConfidence,
  validUntilMs: TradingSwarmTimestamp | undefined,
): string {
  return `swarm-collective-decision-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      runId: mission.runId,
      missionFingerprint:
        mission.deterministicFingerprint,
      candidateId:
        candidate?.candidateId ?? null,
      candidateFingerprint:
        candidate?.deterministicFingerprint ??
        null,
      consensusId: consensus.consensusId,
      consensusFingerprint:
        consensus.deterministicFingerprint,
      governanceAssessmentId:
        governance.assessmentId,
      governanceFingerprint:
        governance.deterministicFingerprint,
      decision: resolution.decision,
      actionIds:
        resolution.actions.map(
          (action) => action.actionId,
        ),
      expectedUtility:
        resolution.expectedUtility,
      estimatedRisk:
        resolution.estimatedRisk,
      restrictions:
        resolution.restrictions,
      confidence,
      validUntilMs:
        validUntilMs ?? null,
    }),
  )}`;
}

function compareActions(
  left: TradingSwarmDecisionAction,
  right: TradingSwarmDecisionAction,
): number {
  const priorityComparison =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityComparison !== 0) {
    return priorityComparison;
  }

  const dependencyComparison =
    left.dependencies.length -
    right.dependencies.length;

  if (dependencyComparison !== 0) {
    return dependencyComparison;
  }

  return left.actionId.localeCompare(
    right.actionId,
  );
}

function priorityRank(
  priority: string,
): number {
  switch (priority) {
    case "BACKGROUND":
      return 0;
    case "LOW":
      return 1;
    case "NORMAL":
      return 2;
    case "HIGH":
      return 3;
    case "VERY_HIGH":
      return 4;
    case "CRITICAL":
      return 5;
    case "EMERGENCY":
      return 6;
    default:
      return 0;
  }
}

/* ========================================================================== *
 * Configuration and factory
 * ========================================================================== */

function normalizeOptions(
  options: SwarmDecisionAssemblerOptions = {},
): NormalizedOptions {
  const defaultValidityWindowMs =
    normalizePositiveInteger(
      options.defaultValidityWindowMs,
      60_000,
      "defaultValidityWindowMs",
    );

  const maximumValidityWindowMs =
    normalizePositiveInteger(
      options.maximumValidityWindowMs,
      300_000,
      "maximumValidityWindowMs",
    );

  const escalationValidityWindowMs =
    normalizePositiveInteger(
      options.escalationValidityWindowMs,
      900_000,
      "escalationValidityWindowMs",
    );

  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmDecisionFingerprintGenerator(),
    failClosedOnMissingCandidate:
      options.failClosedOnMissingCandidate ??
      true,
    suppressActionsWhenUnauthorized:
      options.suppressActionsWhenUnauthorized ??
      true,
    suppressActionsForNonExecutableDecision:
      options
        .suppressActionsForNonExecutableDecision ??
      true,
    defaultValidityWindowMs,
    maximumValidityWindowMs,
    escalationValidityWindowMs,
    metadata: deepFreeze(
      options.metadata ??
        Object.freeze({}),
    ),
  });
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback;

  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0
  ) {
    throw new SwarmDecisionAssemblerError(
      "ASSEMBLY_FAILED",
      `${field} must be a positive safe integer.`,
      { field },
    );
  }

  return resolved;
}

export function createSwarmDecisionAssembler(
  options: SwarmDecisionAssemblerOptions = {},
): SwarmDecisionAssembler {
  return new SwarmDecisionAssembler(options);
}

export class StableSwarmDecisionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(
    value: unknown,
  ): string {
    return `swarm-decision-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Immutable deterministic utilities
 * ========================================================================== */

function freezeDissent(
  dissent: readonly TradingSwarmDissentRecord[],
): readonly TradingSwarmDissentRecord[] {
  return Object.freeze(
    dissent
      .map((record) =>
        deepFreeze({
          ...record,
        }),
      )
      .sort((left, right) => {
        if (
          left.material !== right.material
        ) {
          return left.material ? -1 : 1;
        }

        const nodeComparison =
          left.nodeId.localeCompare(
            right.nodeId,
          );

        if (nodeComparison !== 0) {
          return nodeComparison;
        }

        return left.choice.localeCompare(
          right.choice,
        );
      }),
  );
}

function uniqueSorted(
  values: readonly string[],
): readonly string[] {
  return Object.freeze(
    [
      ...new Set(
        values
          .filter(
            (value) =>
              typeof value === "string",
          )
          .map((value) => value.trim())
          .filter(
            (value) => value.length > 0,
          ),
      ),
    ].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function toTradingSwarmTimestamp(
  value: number,
): TradingSwarmTimestamp {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new SwarmDecisionAssemblerError(
      "ASSEMBLY_FAILED",
      "Derived timestamp must be a non-negative finite number.",
      { field: "timestamp" },
    );
  }

  return value as TradingSwarmTimestamp;
}

function finiteOrZero(
  value: number,
): number {
  return Number.isFinite(value)
    ? value
    : 0;
}

function clamp01(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, value),
  );
}

function clampAdjustment(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(-1, value),
  );
}

function deepFreeze<TValue>(
  value: TValue,
): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key);
      deepFreeze(item);
    }
  } else if (value instanceof Set) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (
      const key of Object.keys(value as object)
    ) {
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}

function stableStringify(
  value: unknown,
): string {
  return JSON.stringify(
    normalizeForStableJson(value),
  );
}

function normalizeForStableJson(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeForStableJson,
    );
  }

  if (value instanceof Set) {
    return [...value]
      .map(normalizeForStableJson)
      .sort(compareNormalized);
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(
          String(right),
        ),
      )
      .map(([key, item]) => [
        normalizeForStableJson(key),
        normalizeForStableJson(item),
      ]);
  }

  if (typeof value === "object") {
    const normalized:
      Record<string, unknown> = {};

    for (
      const key of Object.keys(value).sort()
    ) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      normalized[key] =
        normalizeForStableJson(item);
    }

    return normalized;
  }

  return String(value);
}

function compareNormalized(
  left: unknown,
  right: unknown,
): number {
  return JSON.stringify(left).localeCompare(
    JSON.stringify(right),
  );
}

function stableHash(
  value: string,
): string {
  let hash = 0x811c9dc5;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(
      hash,
      0x01000193,
    );
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

// End of swarm-decision-assembler.ts