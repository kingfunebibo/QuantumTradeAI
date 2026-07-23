/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-decision-assembler.ts
 *
 * Deterministic, immutable assembly of final collective multi-agent decisions.
 */

import {
  type MultiAgentApprovalRequirement,
  type MultiAgentCollectiveConfidence,
  type MultiAgentCollectiveDecision,
  type MultiAgentConfidence,
  type MultiAgentConsensusResult,
  type MultiAgentConstraint,
  type MultiAgentDecision,
  type MultiAgentDecisionAction,
  type MultiAgentDecisionAssemblerPort,
  type MultiAgentDecisionId,
  type MultiAgentDissentRecord,
  type MultiAgentGovernanceAssessment,
  type MultiAgentId,
  type MultiAgentMetadata,
  type MultiAgentOperatorEscalation,
  type MultiAgentPriority,
  type MultiAgentProposal,
  type MultiAgentProposalAction,
  type MultiAgentProposalId,
  type MultiAgentRiskFinding,
  type MultiAgentRunId,
  type MultiAgentRunRequest,
  type MultiAgentSessionId,
  type MultiAgentTimestamp,
  type MultiAgentUtilityAssessment,
} from "./ai-multi-agent-contracts";

export type MultiAgentDecisionAssemblerErrorCode =
  | "INVALID_DECISION_INPUT"
  | "DUPLICATE_PROPOSAL"
  | "UNKNOWN_SELECTED_PROPOSAL"
  | "INCONSISTENT_RUN_ID"
  | "INCONSISTENT_SESSION_ID"
  | "INVALID_GOVERNANCE_STATE"
  | "DECISION_ASSEMBLY_FAILED";

export interface MultiAgentDecisionAssemblerErrorDetails {
  readonly proposalId?: MultiAgentProposalId;
  readonly decisionId?: MultiAgentDecisionId;
  readonly cause?: unknown;
}

export class MultiAgentDecisionAssemblerError extends Error {
  public readonly code: MultiAgentDecisionAssemblerErrorCode;
  public readonly details: MultiAgentDecisionAssemblerErrorDetails;

  public constructor(
    code: MultiAgentDecisionAssemblerErrorCode,
    message: string,
    details: MultiAgentDecisionAssemblerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentDecisionAssemblerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentDecisionAssemblerClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentDecisionAssemblerOptions {
  readonly clock?: MultiAgentDecisionAssemblerClock;
  readonly decisionIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentDecisionId;
  readonly fingerprintFactory?: (value: unknown) => string;
  readonly defaultRunIdFactory?: (
    request: MultiAgentRunRequest,
  ) => MultiAgentRunId;
  readonly defaultSessionIdFactory?: (
    request: MultiAgentRunRequest,
  ) => MultiAgentSessionId;
  readonly escalationTtlMs?: number;
  readonly minimumActionConfidence?: MultiAgentConfidence;
  readonly rejectUnapprovedActions?: boolean;
  readonly includeNonSelectedProposalRisks?: boolean;
  readonly includeNonSelectedProposalConstraints?: boolean;
}

export interface MultiAgentDecisionAssemblerSnapshot {
  readonly decisionId?: MultiAgentDecisionId;
  readonly decision: MultiAgentDecision;
  readonly selectedProposalId?: MultiAgentProposalId;
  readonly actionCount: number;
  readonly approvedActionCount: number;
  readonly restrictionCount: number;
  readonly riskCount: number;
  readonly constraintCount: number;
  readonly dissentCount: number;
  readonly escalationRequired: boolean;
  readonly decidedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentDecisionAssemblerClock;
  readonly decisionIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentDecisionId;
  readonly fingerprintFactory: (value: unknown) => string;
  readonly defaultRunIdFactory: (
    request: MultiAgentRunRequest,
  ) => MultiAgentRunId;
  readonly defaultSessionIdFactory: (
    request: MultiAgentRunRequest,
  ) => MultiAgentSessionId;
  readonly escalationTtlMs: number;
  readonly minimumActionConfidence: MultiAgentConfidence;
  readonly rejectUnapprovedActions: boolean;
  readonly includeNonSelectedProposalRisks: boolean;
  readonly includeNonSelectedProposalConstraints: boolean;
}

interface AssemblyState {
  readonly selectedProposal: MultiAgentProposal | undefined;
  readonly decision: MultiAgentDecision;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly actions: readonly MultiAgentDecisionAction[];
  readonly risks: readonly MultiAgentRiskFinding[];
  readonly constraints: readonly MultiAgentConstraint[];
  readonly restrictions: readonly string[];
  readonly dissent: readonly MultiAgentDissentRecord[];
  readonly operatorEscalation?: MultiAgentOperatorEscalation;
  readonly validUntilMs?: MultiAgentTimestamp;
  readonly metadata: MultiAgentMetadata;
}

const EXECUTABLE_ACTIONS = new Set<
  MultiAgentProposalAction["type"]
>([
  "OPEN_POSITION",
  "INCREASE_POSITION",
  "REDUCE_POSITION",
  "CLOSE_POSITION",
  "HEDGE_POSITION",
  "REBALANCE_PORTFOLIO",
  "ACTIVATE_STRATEGY",
  "DEACTIVATE_STRATEGY",
  "ROTATE_STRATEGY",
  "CHANGE_STRATEGY_WEIGHT",
  "EXECUTE_ARBITRAGE",
  "PAUSE_TRADING",
  "RESUME_TRADING",
  "CUSTOM",
]);

const NON_EXECUTING_ACTIONS = new Set<
  MultiAgentProposalAction["type"]
>([
  "NO_ACTION",
  "MONITOR",
  "RESEARCH",
  "PUBLISH_SIGNAL",
  "ESCALATE_TO_OPERATOR",
]);

export class MultiAgentDecisionAssembler
  implements MultiAgentDecisionAssemblerPort
{
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentDecisionAssemblerSnapshot;

  public constructor(
    options: MultiAgentDecisionAssemblerOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      decision: "DEFER",
      actionCount: 0,
      approvedActionCount: 0,
      restrictionCount: 0,
      riskCount: 0,
      constraintCount: 0,
      dissentCount: 0,
      escalationRequired: false,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          decision: "DEFER",
          actionCount: 0,
        }),
    });
  }

  public snapshot(): MultiAgentDecisionAssemblerSnapshot {
    return this.lastSnapshotValue;
  }

  public assemble(
    request: MultiAgentRunRequest,
    proposals: readonly MultiAgentProposal[],
    consensus: MultiAgentConsensusResult,
    governance: MultiAgentGovernanceAssessment,
  ): MultiAgentCollectiveDecision {
    validateInputs(
      request,
      proposals,
      consensus,
      governance,
    );

    try {
      const decidedAtMs = this.options.clock.now();
      const orderedProposals = [...proposals].sort(
        (left, right) =>
          left.proposalId.localeCompare(
            right.proposalId,
          ),
      );
      const selectedProposal =
        resolveSelectedProposal(
          orderedProposals,
          consensus,
        );
      const decision = deriveDecision(
        selectedProposal,
        consensus,
        governance,
      );
      const runId = resolveRunId(
        request,
        orderedProposals,
        selectedProposal,
        this.options,
      );
      const sessionId = resolveSessionId(
        request,
        orderedProposals,
        selectedProposal,
        this.options,
      );
      const restrictions =
        assembleRestrictions(
          request,
          selectedProposal,
          consensus,
          governance,
          decision,
        );
      const actions = assembleActions(
        selectedProposal,
        consensus,
        governance,
        decision,
        restrictions,
        this.options,
      );
      const risks = assembleRisks(
        orderedProposals,
        selectedProposal,
        consensus,
        this.options,
      );
      const constraints = assembleConstraints(
        request,
        orderedProposals,
        selectedProposal,
        this.options,
      );
      const dissent = Object.freeze(
        [...consensus.dissent].sort(
          compareDissent,
        ),
      );
      const operatorEscalation =
        assembleOperatorEscalation(
          selectedProposal,
          consensus,
          governance,
          risks,
          decision,
          decidedAtMs,
          this.options.escalationTtlMs,
        );
      const validUntilMs =
        deriveValidUntilMs(
          selectedProposal,
          decidedAtMs,
        );
      const metadata = assembleMetadata(
        request,
        proposals,
        consensus,
        governance,
        actions,
        decision,
      );

      const state: AssemblyState = {
        selectedProposal,
        decision,
        runId,
        sessionId,
        actions,
        risks,
        constraints,
        restrictions,
        dissent,
        operatorEscalation,
        validUntilMs,
        metadata,
      };

      const decisionId =
        this.options.decisionIdFactory(
          "decision",
          this.options.fingerprintFactory({
            requestId: request.requestId,
            runId,
            sessionId,
            decision,
            selectedProposalId:
              selectedProposal?.proposalId,
            consensusId: consensus.consensusId,
            governance,
            actions,
            restrictions,
            decidedAtMs,
            validUntilMs,
          }),
        );

      const collectiveDecision:
        MultiAgentCollectiveDecision =
        deepFreeze({
          decisionId,
          runId,
          sessionId,
          decision: state.decision,
          selectedProposal:
            state.selectedProposal,
          consensus,
          governance,
          actions: state.actions,
          collectiveConfidence:
            consensus.collectiveConfidence,
          expectedUtility:
            deriveExpectedUtility(
              selectedProposal,
            ),
          risks: state.risks,
          constraints: state.constraints,
          restrictions: state.restrictions,
          dissent: state.dissent,
          operatorEscalation:
            state.operatorEscalation,
          decidedAtMs,
          validUntilMs: state.validUntilMs,
          deterministicFingerprint:
            this.options.fingerprintFactory({
              decisionId,
              runId,
              sessionId,
              decision: state.decision,
              selectedProposalFingerprint:
                state.selectedProposal
                  ?.deterministicFingerprint,
              consensusFingerprint:
                consensus.deterministicFingerprint,
              governance,
              actions: state.actions,
              collectiveConfidence:
                consensus.collectiveConfidence,
              expectedUtility:
                deriveExpectedUtility(
                  selectedProposal,
                ),
              risks: state.risks,
              constraints: state.constraints,
              restrictions: state.restrictions,
              dissent: state.dissent,
              operatorEscalation:
                state.operatorEscalation,
              decidedAtMs,
              validUntilMs: state.validUntilMs,
              metadata: state.metadata,
            }),
          metadata: state.metadata,
        });

      this.lastSnapshotValue = deepFreeze({
        decisionId,
        decision,
        selectedProposalId:
          selectedProposal?.proposalId,
        actionCount: actions.length,
        approvedActionCount: actions.filter(
          (action) => action.approved,
        ).length,
        restrictionCount:
          restrictions.length,
        riskCount: risks.length,
        constraintCount:
          constraints.length,
        dissentCount: dissent.length,
        escalationRequired:
          operatorEscalation?.required ??
          false,
        decidedAtMs,
        deterministicFingerprint:
          this.options.fingerprintFactory({
            decisionId,
            decision,
            selectedProposalId:
              selectedProposal?.proposalId,
            actionIds: actions.map(
              (action) => action.actionId,
            ),
            restrictionCount:
              restrictions.length,
            riskCount: risks.length,
            constraintCount:
              constraints.length,
            dissentCount: dissent.length,
            escalationRequired:
              operatorEscalation?.required ??
              false,
            decidedAtMs,
          }),
      });

      return collectiveDecision;
    } catch (cause) {
      if (
        cause instanceof
        MultiAgentDecisionAssemblerError
      ) {
        throw cause;
      }

      throw new MultiAgentDecisionAssemblerError(
        "DECISION_ASSEMBLY_FAILED",
        "Failed to assemble the collective multi-agent decision.",
        { cause },
      );
    }
  }
}

export function createMultiAgentDecisionAssembler(
  options: MultiAgentDecisionAssemblerOptions = {},
): MultiAgentDecisionAssembler {
  return new MultiAgentDecisionAssembler(options);
}

function resolveSelectedProposal(
  proposals: readonly MultiAgentProposal[],
  consensus: MultiAgentConsensusResult,
): MultiAgentProposal | undefined {
  if (
    consensus.selectedProposalId === undefined
  ) {
    return undefined;
  }

  const selected = proposals.find(
    (proposal) =>
      proposal.proposalId ===
      consensus.selectedProposalId,
  );

  if (selected === undefined) {
    throw new MultiAgentDecisionAssemblerError(
      "UNKNOWN_SELECTED_PROPOSAL",
      `Consensus selected unknown proposal "${consensus.selectedProposalId}".`,
      {
        proposalId:
          consensus.selectedProposalId,
      },
    );
  }

  return selected;
}

function deriveDecision(
  selectedProposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
): MultiAgentDecision {
  switch (governance.decision) {
    case "REJECTED":
      return "REJECT";
    case "ESCALATED":
      return "ESCALATE";
    case "DEFERRED":
      return "DEFER";
    case "APPROVED":
    case "APPROVED_WITH_RESTRICTIONS":
      break;
  }

  if (selectedProposal === undefined) {
    return "HOLD";
  }

  if (
    consensus.status === "VETOED" ||
    consensus.status === "QUORUM_NOT_MET"
  ) {
    return "REJECT";
  }

  if (
    consensus.status === "ESCALATED"
  ) {
    return "ESCALATE";
  }

  if (
    consensus.status === "DEADLOCKED"
  ) {
    return "DEFER";
  }

  const actionTypes = new Set(
    selectedProposal.actions.map(
      (action) => action.type,
    ),
  );
  const executable = [...actionTypes].some(
    (type) => EXECUTABLE_ACTIONS.has(type),
  );
  const monitorOnly =
    actionTypes.size > 0 &&
    [...actionTypes].every(
      (type) =>
        NON_EXECUTING_ACTIONS.has(type),
    );
  const restricted =
    governance.decision ===
      "APPROVED_WITH_RESTRICTIONS" ||
    governance.restrictions.length > 0 ||
    consensus.resolvedConflicts.some(
      (conflict) =>
        conflict.restrictions.length > 0 ||
        conflict.resolution ===
          "APPLY_RESTRICTIONS" ||
        conflict.resolution ===
          "REDUCE_SCOPE",
    );

  if (executable) {
    return restricted
      ? "EXECUTE_WITH_RESTRICTIONS"
      : "EXECUTE";
  }

  if (monitorOnly) {
    return actionTypes.has("MONITOR") ||
      actionTypes.has("PUBLISH_SIGNAL")
      ? "MONITOR"
      : "HOLD";
  }

  return selectedProposal.actions.length === 0
    ? "HOLD"
    : "MONITOR";
}

function assembleActions(
  selectedProposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
  decision: MultiAgentDecision,
  globalRestrictions: readonly string[],
  options: NormalizedOptions,
): readonly MultiAgentDecisionAction[] {
  if (selectedProposal === undefined) {
    return Object.freeze([]);
  }

  const contributors =
    deriveContributingAgentIds(
      selectedProposal,
      consensus,
    );
  const executableDecision =
    decision === "EXECUTE" ||
    decision ===
      "EXECUTE_WITH_RESTRICTIONS" ||
    decision === "MONITOR" ||
    decision === "HOLD";
  const governanceAllows =
    governance.decision === "APPROVED" ||
    governance.decision ===
      "APPROVED_WITH_RESTRICTIONS";

  const actions = selectedProposal.actions
    .map((action) => {
      const actionRestrictions =
        deriveActionRestrictions(
          action,
          selectedProposal,
          consensus,
          governance,
          globalRestrictions,
        );
      const confidence =
        deriveActionConfidence(
          action,
          selectedProposal,
          consensus.collectiveConfidence,
          actionRestrictions.length,
        );
      const blockedByType =
        decision === "MONITOR" ||
        decision === "HOLD"
          ? EXECUTABLE_ACTIONS.has(action.type)
          : false;
      const approved =
        executableDecision &&
        governanceAllows &&
        !blockedByType &&
        confidence >=
          options.minimumActionConfidence &&
        !actionViolatesHardConstraint(
          action,
          selectedProposal.constraints,
        );

      return deepFreeze({
        actionId: action.actionId,
        sourceProposalId:
          selectedProposal.proposalId,
        action,
        approved,
        restrictions: Object.freeze(
          actionRestrictions,
        ),
        contributingAgentIds:
          contributors,
        confidence:
          confidence as MultiAgentConfidence,
      });
    })
    .filter(
      (action) =>
        !options.rejectUnapprovedActions ||
        action.approved,
    )
    .sort((left, right) =>
      left.actionId.localeCompare(
        right.actionId,
      ),
    );

  return Object.freeze(actions);
}

function deriveActionRestrictions(
  action: MultiAgentProposalAction,
  proposal: MultiAgentProposal,
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
  globalRestrictions: readonly string[],
): string[] {
  const actionSpecific = proposal.constraints
    .filter(
      (constraint) =>
        !constraint.satisfied &&
        constraintAppliesToAction(
          constraint,
          action,
        ),
    )
    .map(
      (constraint) =>
        constraint.failureReason ??
        `Satisfy constraint "${constraint.name}".`,
    );
  const conflictRestrictions =
    consensus.resolvedConflicts
      .filter(
        (conflict) =>
          conflict.proposalIds.includes(
            proposal.proposalId,
          ),
      )
      .flatMap(
        (conflict) => conflict.restrictions,
      );
  const riskRestrictions = proposal.risks
    .filter(
      (risk) =>
        risk.severity === "HIGH" ||
        risk.severity === "CRITICAL",
    )
    .map(
      (risk) =>
        risk.mitigation ??
        `Mitigate risk "${risk.name}".`,
    );

  return uniqueSorted([
    ...globalRestrictions,
    ...governance.restrictions,
    ...actionSpecific,
    ...conflictRestrictions,
    ...riskRestrictions,
  ]);
}

function deriveActionConfidence(
  action: MultiAgentProposalAction,
  proposal: MultiAgentProposal,
  collectiveConfidence:
    MultiAgentCollectiveConfidence,
  restrictionCount: number,
): number {
  const riskPenalty =
    proposal.risks
      .filter((risk) =>
        actionReferencesEvidence(
          action,
          risk.evidenceIds,
        ),
      )
      .reduce(
        (sum, risk) =>
          sum +
          risk.probability *
            risk.impact *
            severityValue(risk.severity),
        0,
      ) /
    Math.max(1, proposal.risks.length);
  const urgencyPenalty =
    action.urgency === "IMMEDIATE"
      ? 0.03
      : 0;
  const restrictionPenalty =
    Math.min(0.2, restrictionCount * 0.01);

  return clamp01(
    proposal.confidence * 0.4 +
      collectiveConfidence.finalConfidence *
        0.6 -
      riskPenalty * 0.2 -
      urgencyPenalty -
      restrictionPenalty,
  );
}

function deriveContributingAgentIds(
  proposal: MultiAgentProposal,
  consensus: MultiAgentConsensusResult,
): readonly MultiAgentId[] {
  return Object.freeze(
    uniqueSorted([
      proposal.proposedByAgentId,
      ...consensus.votes
        .filter(
          (vote) =>
            vote.proposalId ===
              proposal.proposalId &&
            (vote.choice === "APPROVE" ||
              vote.choice ===
                "APPROVE_WITH_RESTRICTIONS"),
        )
        .map((vote) => vote.agentId),
      ...consensus.resolvedConflicts
        .filter((conflict) =>
          conflict.proposalIds.includes(
            proposal.proposalId,
          ),
        )
        .flatMap(
          (conflict) => conflict.agentIds,
        ),
    ]),
  );
}

function assembleRestrictions(
  request: MultiAgentRunRequest,
  selectedProposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
  decision: MultiAgentDecision,
): readonly string[] {
  const requestRestrictions =
    request.constraints
      ?.filter(
        (constraint) => !constraint.satisfied,
      )
      .map(
        (constraint) =>
          constraint.failureReason ??
          `Satisfy request constraint "${constraint.name}".`,
      ) ?? [];
  const proposalRestrictions =
    selectedProposal?.constraints
      .filter(
        (constraint) => !constraint.satisfied,
      )
      .map(
        (constraint) =>
          constraint.failureReason ??
          `Satisfy proposal constraint "${constraint.name}".`,
      ) ?? [];
  const voteRestrictions =
    selectedProposal === undefined
      ? []
      : consensus.votes
          .filter(
            (vote) =>
              vote.proposalId ===
                selectedProposal.proposalId &&
              (vote.choice ===
                "APPROVE_WITH_RESTRICTIONS" ||
                vote.choice === "DEFER"),
          )
          .flatMap(
            (vote) => vote.restrictions,
          );
  const conflictRestrictions =
    selectedProposal === undefined
      ? []
      : consensus.resolvedConflicts
          .filter((conflict) =>
            conflict.proposalIds.includes(
              selectedProposal.proposalId,
            ),
          )
          .flatMap(
            (conflict) =>
              conflict.restrictions,
          );
  const dissentRestrictions =
    consensus.dissent
      .filter((item) => item.material)
      .flatMap((item) =>
        item.unresolvedRisks.map(
          (risk) =>
            risk.mitigation ??
            `Resolve dissent risk "${risk.name}".`,
        ),
      );
  const terminalRestrictions =
    decision === "REJECT"
      ? [
          "Execution is prohibited for this decision.",
        ]
      : decision === "DEFER"
        ? [
            "Execution is blocked until the decision is re-evaluated.",
          ]
        : decision === "ESCALATE"
          ? [
              "Execution requires operator or authorized supervisor approval.",
            ]
          : [];

  return Object.freeze(
    uniqueSorted([
      ...governance.restrictions,
      ...requestRestrictions,
      ...proposalRestrictions,
      ...voteRestrictions,
      ...conflictRestrictions,
      ...dissentRestrictions,
      ...terminalRestrictions,
    ]),
  );
}

function assembleRisks(
  proposals: readonly MultiAgentProposal[],
  selectedProposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  options: NormalizedOptions,
): readonly MultiAgentRiskFinding[] {
  const sourceRisks =
    selectedProposal === undefined
      ? options.includeNonSelectedProposalRisks
        ? proposals.flatMap(
            (proposal) => proposal.risks,
          )
        : []
      : [
          ...selectedProposal.risks,
          ...(options.includeNonSelectedProposalRisks
            ? proposals
                .filter(
                  (proposal) =>
                    proposal.proposalId !==
                    selectedProposal.proposalId,
                )
                .flatMap(
                  (proposal) =>
                    proposal.risks,
                )
            : []),
        ];
  const dissentRisks =
    consensus.dissent.flatMap(
      (item) => item.unresolvedRisks,
    );

  return Object.freeze(
    deduplicateRisks([
      ...sourceRisks,
      ...dissentRisks,
    ]),
  );
}

function assembleConstraints(
  request: MultiAgentRunRequest,
  proposals: readonly MultiAgentProposal[],
  selectedProposal: MultiAgentProposal | undefined,
  options: NormalizedOptions,
): readonly MultiAgentConstraint[] {
  const requestConstraints =
    request.constraints ?? [];
  const proposalConstraints =
    selectedProposal === undefined
      ? options.includeNonSelectedProposalConstraints
        ? proposals.flatMap(
            (proposal) =>
              proposal.constraints,
          )
        : []
      : [
          ...selectedProposal.constraints,
          ...(options.includeNonSelectedProposalConstraints
            ? proposals
                .filter(
                  (proposal) =>
                    proposal.proposalId !==
                    selectedProposal.proposalId,
                )
                .flatMap(
                  (proposal) =>
                    proposal.constraints,
                )
            : []),
        ];

  return Object.freeze(
    deduplicateConstraints([
      ...requestConstraints,
      ...proposalConstraints,
    ]),
  );
}

function assembleOperatorEscalation(
  selectedProposal: MultiAgentProposal | undefined,
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
  risks: readonly MultiAgentRiskFinding[],
  decision: MultiAgentDecision,
  createdAtMs: MultiAgentTimestamp,
  ttlMs: number,
): MultiAgentOperatorEscalation | undefined {
  const required =
    decision === "ESCALATE" ||
    governance.approvalRequirement ===
      "HUMAN_APPROVAL" ||
    consensus.status === "ESCALATED";
  const explicitlyRequested =
    selectedProposal?.actions.some(
      (action) =>
        action.type ===
        "ESCALATE_TO_OPERATOR",
    ) ?? false;

  if (!required && !explicitlyRequested) {
    return undefined;
  }

  const unresolvedRisks = Object.freeze(
    risks.filter(
      (risk) =>
        risk.severity === "HIGH" ||
        risk.severity === "CRITICAL",
    ),
  );
  const unresolvedConflict =
    consensus.resolvedConflicts.some(
      (conflict) =>
        conflict.resolution ===
          "UNRESOLVED" ||
        conflict.resolution === "DEFER" ||
        conflict.resolution === "ESCALATE",
    );
  const requestedAction =
    unresolvedConflict
      ? "RESOLVE_CONFLICT"
      : governance.approvalRequirement ===
          "HUMAN_APPROVAL"
        ? "APPROVE"
        : "REVIEW";
  const reason = [
    decision === "ESCALATE"
      ? "The assembled decision requires escalation."
      : "",
    governance.decision === "ESCALATED"
      ? "Governance escalated the decision."
      : "",
    consensus.status === "ESCALATED"
      ? "Consensus deadlock was escalated."
      : "",
    unresolvedConflict
      ? "One or more conflicts require operator resolution."
      : "",
    unresolvedRisks.length > 0
      ? `${unresolvedRisks.length} high-severity unresolved risk(s) remain.`
      : "",
  ]
    .filter((item) => item.length > 0)
    .join(" ");

  return deepFreeze({
    required: true,
    reason:
      reason ||
      "Operator review was explicitly requested.",
    priority: escalationPriority(
      decision,
      unresolvedRisks,
      unresolvedConflict,
    ),
    requestedAction,
    relatedProposalIds:
      selectedProposal === undefined
        ? Object.freeze([])
        : Object.freeze([
            selectedProposal.proposalId,
          ]),
    unresolvedRisks,
    createdAtMs,
    expiresAtMs:
      ttlMs === 0
        ? undefined
        : (createdAtMs +
            ttlMs) as MultiAgentTimestamp,
  });
}

function assembleMetadata(
  request: MultiAgentRunRequest,
  proposals: readonly MultiAgentProposal[],
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
  actions: readonly MultiAgentDecisionAction[],
  decision: MultiAgentDecision,
): MultiAgentMetadata {
  return deepFreeze({
    requestId: request.requestId,
    objective: request.objective,
    proposalCount: proposals.length,
    consensusId: consensus.consensusId,
    consensusStatus: consensus.status,
    consensusMethod: consensus.method,
    governanceDecision:
      governance.decision,
    approvalRequirement:
      governance.approvalRequirement,
    actionCount: actions.length,
    approvedActionCount: actions.filter(
      (action) => action.approved,
    ).length,
    decision,
  });
}

function deriveExpectedUtility(
  selectedProposal: MultiAgentProposal | undefined,
): MultiAgentUtilityAssessment {
  if (selectedProposal !== undefined) {
    return selectedProposal.expectedUtility;
  }

  return deepFreeze({
    expectedReturnUtility: 0,
    riskAdjustedUtility: 0,
    portfolioUtility: 0,
    strategyUtility: 0,
    arbitrageUtility: 0,
    executionUtility: 0,
    learningUtility: 0,
    operationalUtility: 0,
    totalUtility: 0,
  });
}

function deriveValidUntilMs(
  proposal: MultiAgentProposal | undefined,
  decidedAtMs: MultiAgentTimestamp,
): MultiAgentTimestamp | undefined {
  if (proposal?.validUntilMs === undefined) {
    return undefined;
  }

  return proposal.validUntilMs >= decidedAtMs
    ? proposal.validUntilMs
    : decidedAtMs;
}

function resolveRunId(
  request: MultiAgentRunRequest,
  proposals: readonly MultiAgentProposal[],
  selectedProposal: MultiAgentProposal | undefined,
  options: NormalizedOptions,
): MultiAgentRunId {
  if (selectedProposal !== undefined) {
    return selectedProposal.runId;
  }

  const runIds = uniqueSorted(
    proposals.map((proposal) => proposal.runId),
  );

  if (runIds.length > 1) {
    throw new MultiAgentDecisionAssemblerError(
      "INCONSISTENT_RUN_ID",
      "Proposals contain inconsistent run IDs.",
    );
  }

  return (
    runIds[0] ??
    options.defaultRunIdFactory(request)
  );
}

function resolveSessionId(
  request: MultiAgentRunRequest,
  proposals: readonly MultiAgentProposal[],
  selectedProposal: MultiAgentProposal | undefined,
  options: NormalizedOptions,
): MultiAgentSessionId {
  if (selectedProposal !== undefined) {
    return selectedProposal.sessionId;
  }

  const sessionIds = uniqueSorted(
    proposals.map(
      (proposal) => proposal.sessionId,
    ),
  );

  if (sessionIds.length > 1) {
    throw new MultiAgentDecisionAssemblerError(
      "INCONSISTENT_SESSION_ID",
      "Proposals contain inconsistent session IDs.",
    );
  }

  return (
    sessionIds[0] ??
    options.defaultSessionIdFactory(request)
  );
}

function deduplicateRisks(
  risks: readonly MultiAgentRiskFinding[],
): MultiAgentRiskFinding[] {
  const byKey = new Map<
    string,
    MultiAgentRiskFinding
  >();

  for (const risk of risks) {
    const key = `${risk.code}|${risk.name}`;
    const existing = byKey.get(key);

    if (
      existing === undefined ||
      riskStrength(risk) >
        riskStrength(existing)
    ) {
      byKey.set(key, risk);
    }
  }

  return [...byKey.values()].sort(
    (left, right) =>
      riskStrength(right) -
        riskStrength(left) ||
      left.code.localeCompare(right.code),
  );
}

function deduplicateConstraints(
  constraints: readonly MultiAgentConstraint[],
): MultiAgentConstraint[] {
  const byId = new Map<
    string,
    MultiAgentConstraint
  >();

  for (const constraint of constraints) {
    const existing = byId.get(
      constraint.constraintId,
    );

    if (
      existing === undefined ||
      (!constraint.satisfied &&
        existing.satisfied) ||
      (constraint.hard && !existing.hard)
    ) {
      byId.set(
        constraint.constraintId,
        constraint,
      );
    }
  }

  return [...byId.values()].sort(
    (left, right) => {
      if (left.hard !== right.hard) {
        return left.hard ? -1 : 1;
      }

      if (
        left.satisfied !== right.satisfied
      ) {
        return left.satisfied ? 1 : -1;
      }

      return left.constraintId.localeCompare(
        right.constraintId,
      );
    },
  );
}

function constraintAppliesToAction(
  constraint: MultiAgentConstraint,
  action: MultiAgentProposalAction,
): boolean {
  const metadata = asRecord(
    constraint.metadata,
  );

  if (metadata === undefined) {
    return true;
  }

  const actionIds =
    readStringArray(metadata["actionIds"]);
  const actionTypes =
    readStringArray(metadata["actionTypes"]);

  return (
    (actionIds.length === 0 ||
      actionIds.includes(action.actionId)) &&
    (actionTypes.length === 0 ||
      actionTypes.includes(action.type))
  );
}

function actionViolatesHardConstraint(
  action: MultiAgentProposalAction,
  constraints: readonly MultiAgentConstraint[],
): boolean {
  return constraints.some(
    (constraint) =>
      constraint.hard &&
      !constraint.satisfied &&
      constraintAppliesToAction(
        constraint,
        action,
      ),
  );
}

function actionReferencesEvidence(
  action: MultiAgentProposalAction,
  evidenceIds: readonly string[],
): boolean {
  const metadata = asRecord(action.parameters);
  const actionEvidenceIds =
    metadata === undefined
      ? []
      : readStringArray(
          metadata["evidenceIds"],
        );

  return (
    actionEvidenceIds.length === 0 ||
    actionEvidenceIds.some((id) =>
      evidenceIds.includes(id),
    )
  );
}

function escalationPriority(
  decision: MultiAgentDecision,
  risks: readonly MultiAgentRiskFinding[],
  unresolvedConflict: boolean,
): MultiAgentPriority {
  if (
    decision === "ESCALATE" &&
    risks.some(
      (risk) =>
        risk.severity === "CRITICAL",
    )
  ) {
    return "CRITICAL";
  }

  if (
    unresolvedConflict ||
    risks.some(
      (risk) => risk.severity === "HIGH",
    )
  ) {
    return "VERY_HIGH";
  }

  return "HIGH";
}

function riskStrength(
  risk: MultiAgentRiskFinding,
): number {
  return (
    severityValue(risk.severity) *
    risk.probability *
    risk.impact *
    risk.confidence
  );
}

function severityValue(
  severity: MultiAgentRiskFinding["severity"],
): number {
  switch (severity) {
    case "INFORMATIONAL":
      return 0.1;
    case "LOW":
      return 0.25;
    case "MODERATE":
      return 0.5;
    case "HIGH":
      return 0.75;
    case "CRITICAL":
      return 1;
  }
}

function compareDissent(
  left: MultiAgentDissentRecord,
  right: MultiAgentDissentRecord,
): number {
  if (left.material !== right.material) {
    return left.material ? -1 : 1;
  }

  const proposalDifference =
    left.proposalId.localeCompare(
      right.proposalId,
    );

  return proposalDifference !== 0
    ? proposalDifference
    : left.agentId.localeCompare(
        right.agentId,
      );
}

function validateInputs(
  request: MultiAgentRunRequest,
  proposals: readonly MultiAgentProposal[],
  consensus: MultiAgentConsensusResult,
  governance: MultiAgentGovernanceAssessment,
): void {
  if (
    request === null ||
    typeof request !== "object" ||
    !Array.isArray(proposals) ||
    consensus === null ||
    typeof consensus !== "object" ||
    governance === null ||
    typeof governance !== "object"
  ) {
    throw new MultiAgentDecisionAssemblerError(
      "INVALID_DECISION_INPUT",
      "Request, proposals, consensus, and governance are required.",
    );
  }

  const proposalIds =
    new Set<MultiAgentProposalId>();

  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposalId)) {
      throw new MultiAgentDecisionAssemblerError(
        "DUPLICATE_PROPOSAL",
        `Duplicate proposal "${proposal.proposalId}".`,
        {
          proposalId: proposal.proposalId,
        },
      );
    }

    proposalIds.add(proposal.proposalId);
  }

  if (
    consensus.selectedProposalId !== undefined &&
    !proposalIds.has(
      consensus.selectedProposalId,
    )
  ) {
    throw new MultiAgentDecisionAssemblerError(
      "UNKNOWN_SELECTED_PROPOSAL",
      `Consensus selected unknown proposal "${consensus.selectedProposalId}".`,
      {
        proposalId:
          consensus.selectedProposalId,
      },
    );
  }

  if (
    governance.decision === "APPROVED" &&
    consensus.selectedProposalId === undefined
  ) {
    throw new MultiAgentDecisionAssemblerError(
      "INVALID_GOVERNANCE_STATE",
      "Governance cannot approve without a selected proposal.",
    );
  }

  if (
    governance.approvalRequirement ===
      "HUMAN_APPROVAL" &&
    governance.decision === "APPROVED"
  ) {
    throw new MultiAgentDecisionAssemblerError(
      "INVALID_GOVERNANCE_STATE",
      "Human approval requirement cannot accompany an unqualified APPROVED governance state.",
    );
  }
}

function normalizeOptions(
  options: MultiAgentDecisionAssemblerOptions,
): NormalizedOptions {
  const minimumActionConfidence =
    options.minimumActionConfidence ??
    (0 as MultiAgentConfidence);
  const escalationTtlMs =
    options.escalationTtlMs ?? 300_000;

  if (
    !Number.isFinite(
      minimumActionConfidence,
    ) ||
    minimumActionConfidence < 0 ||
    minimumActionConfidence > 1
  ) {
    throw new RangeError(
      "minimumActionConfidence must be between 0 and 1.",
    );
  }

  if (
    !Number.isFinite(escalationTtlMs) ||
    escalationTtlMs < 0
  ) {
    throw new RangeError(
      "escalationTtlMs must be a non-negative finite number.",
    );
  }

  return Object.freeze({
    clock: options.clock ?? {
      now: () => Date.now() as MultiAgentTimestamp,
    },
    decisionIdFactory:
      options.decisionIdFactory ??
      defaultDecisionIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
    defaultRunIdFactory:
      options.defaultRunIdFactory ??
      ((request) =>
        `run-${fnv1a64(
          `${request.requestId}|${request.requestedAtMs}`,
        )}`),
    defaultSessionIdFactory:
      options.defaultSessionIdFactory ??
      ((request) =>
        `session-${fnv1a64(
          `${request.requestId}|${request.objective}`,
        )}`),
    escalationTtlMs,
    minimumActionConfidence,
    rejectUnapprovedActions:
      options.rejectUnapprovedActions ??
      false,
    includeNonSelectedProposalRisks:
      options.includeNonSelectedProposalRisks ??
      false,
    includeNonSelectedProposalConstraints:
      options.includeNonSelectedProposalConstraints ??
      false,
  });
}

function defaultDecisionIdFactory(
  prefix: string,
  seed: string,
): MultiAgentDecisionId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultFingerprintFactory(
  value: unknown,
): string {
  return `fnv1a64:${fnv1a64(
    canonicalStringify(value),
  )}`;
}

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): TValue[] {
  return [...new Set(values)].sort(
    (left, right) =>
      left.localeCompare(right),
  );
}

function asRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Readonly<
        Record<string, unknown>
      >)
    : undefined;
}

function readStringArray(
  value: unknown,
): readonly string[] {
  return Array.isArray(value) &&
    value.every(
      (item) => typeof item === "string",
    )
    ? value
    : [];
}

function clamp01(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      continue;
    }

    hash ^= BigInt(codePoint);
    hash = (hash * prime) & mask;

    if (codePoint > 0xffff) {
      index += 1;
    }
  }

  return hash
    .toString(16)
    .padStart(16, "0");
}

function canonicalStringify(
  value: unknown,
): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Cannot canonicalize a non-finite number.",
      );
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      canonicalize(item),
    );
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .map(
        ([key, item]) =>
          [String(key), canonicalize(item)] as const,
      )
      .sort(([left], [right]) =>
        left.localeCompare(right),
      );
  }

  if (value instanceof Set) {
    return [...value.values()]
      .map((item) => canonicalize(item))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(
          JSON.stringify(right),
        ),
      );
  }

  if (typeof value === "object") {
    const record =
      value as Readonly<Record<string, unknown>>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      const item = record[key];

      if (item !== undefined) {
        result[key] = canonicalize(item);
      }
    }

    return result;
  }

  if (value === undefined) {
    return null;
  }

  throw new TypeError(
    `Unsupported canonical value type: ${typeof value}.`,
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
  } else {
    for (const key of Object.keys(value as object)) {
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}