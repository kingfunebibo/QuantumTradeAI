/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-execution-planner.ts
 *
 * Deterministic and immutable execution-handoff planning for collective
 * multi-agent decisions.
 */

import {
  type MultiAgentApprovalRequirement,
  type MultiAgentCollectiveDecision,
  type MultiAgentDecisionAction,
  type MultiAgentExecutionHandoff,
  type MultiAgentExecutionPlannerPort,
  type MultiAgentExecutionPolicy,
  type MultiAgentMetadata,
  type MultiAgentPlanId,
  type MultiAgentProposalAction,
  type MultiAgentRunRequest,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentExecutionPlannerErrorCode =
  | "INVALID_EXECUTION_INPUT"
  | "INVALID_EXECUTION_POLICY"
  | "DECISION_REQUEST_MISMATCH"
  | "EXPIRED_DECISION"
  | "EXECUTION_PLAN_REQUIRED"
  | "ROLLBACK_PLAN_REQUIRED"
  | "DECISION_INTELLIGENCE_HANDOFF_REQUIRED"
  | "EXECUTION_PLANNING_FAILED";

export interface MultiAgentExecutionPlannerErrorDetails {
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly actionId?: string;
  readonly cause?: unknown;
}

export class MultiAgentExecutionPlannerError extends Error {
  public readonly code: MultiAgentExecutionPlannerErrorCode;
  public readonly details: MultiAgentExecutionPlannerErrorDetails;

  public constructor(
    code: MultiAgentExecutionPlannerErrorCode,
    message: string,
    details: MultiAgentExecutionPlannerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentExecutionPlannerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentExecutionPlannerClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentExecutionPlannerOptions {
  readonly clock?: MultiAgentExecutionPlannerClock;
  readonly planIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentPlanId;
  readonly fingerprintFactory?: (value: unknown) => string;
  readonly failOnExpiredDecision?: boolean;
  readonly includeRejectedActions?: boolean;
  readonly blockOnUnresolvedMaterialDissent?: boolean;
  readonly blockOnCriticalRisk?: boolean;
  readonly maximumTotalNotional?: number;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentExecutionPlannerSnapshot {
  readonly planId?: MultiAgentPlanId;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly executionAuthorized: boolean;
  readonly approvalRequirement: MultiAgentApprovalRequirement;
  readonly inputActionCount: number;
  readonly handoffActionCount: number;
  readonly approvedActionCount: number;
  readonly blockedActionCount: number;
  readonly restrictionCount: number;
  readonly generatedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentExecutionPlannerClock;
  readonly planIdFactory: (
    prefix: string,
    seed: string,
  ) => MultiAgentPlanId;
  readonly fingerprintFactory: (value: unknown) => string;
  readonly failOnExpiredDecision: boolean;
  readonly includeRejectedActions: boolean;
  readonly blockOnUnresolvedMaterialDissent: boolean;
  readonly blockOnCriticalRisk: boolean;
  readonly maximumTotalNotional?: number;
  readonly metadata?: MultiAgentMetadata;
}

interface PlannedAction {
  readonly source: MultiAgentDecisionAction;
  readonly action: MultiAgentDecisionAction;
  readonly permittedByMode: boolean;
  readonly permittedByDecision: boolean;
  readonly permittedByGovernance: boolean;
  readonly permittedByRisk: boolean;
  readonly permittedByPolicy: boolean;
  readonly blockedReasons: readonly string[];
}

const EXECUTABLE_DECISIONS = new Set([
  "EXECUTE",
  "EXECUTE_WITH_RESTRICTIONS",
]);

const NON_EXECUTING_ACTION_TYPES = new Set([
  "NO_ACTION",
  "MONITOR",
  "RESEARCH",
  "PUBLISH_SIGNAL",
  "ESCALATE_TO_OPERATOR",
]);

const EXECUTION_ACTION_TYPES = new Set([
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

export class MultiAgentExecutionPlanner
  implements MultiAgentExecutionPlannerPort
{
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentExecutionPlannerSnapshot;

  public constructor(
    options: MultiAgentExecutionPlannerOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      executionAuthorized: false,
      approvalRequirement: "NONE",
      inputActionCount: 0,
      handoffActionCount: 0,
      approvedActionCount: 0,
      blockedActionCount: 0,
      restrictionCount: 0,
      deterministicFingerprint:
        this.options.fingerprintFactory({
          executionAuthorized: false,
          approvalRequirement: "NONE",
          inputActionCount: 0,
        }),
    });
  }

  public snapshot(): MultiAgentExecutionPlannerSnapshot {
    return this.lastSnapshotValue;
  }

  public async plan(
    request: MultiAgentRunRequest,
    decision: MultiAgentCollectiveDecision,
    policy: MultiAgentExecutionPolicy,
  ): Promise<MultiAgentExecutionHandoff> {
    validateInputs(request, decision, policy);

    try {
      const generatedAtMs = this.options.clock.now();

      if (
        decision.validUntilMs !== undefined &&
        decision.validUntilMs < generatedAtMs &&
        this.options.failOnExpiredDecision
      ) {
        throw new MultiAgentExecutionPlannerError(
          "EXPIRED_DECISION",
          `Decision "${decision.decisionId}" expired before execution planning.`,
          {
            requestId: request.requestId,
            decisionId: decision.decisionId,
          },
        );
      }

      const requestMismatchRestrictions =
        deriveRequestMismatchRestrictions(request, decision);
      const policyRestrictions =
        derivePolicyRestrictions(policy);
      const decisionRestrictions =
        deriveDecisionRestrictions(decision, generatedAtMs);
      const riskRestrictions =
        deriveRiskRestrictions(decision, this.options);
      const warningRestrictions =
        deriveWarningRestrictions(decision, policy);
      const notionalRestrictions =
        deriveNotionalRestrictions(
          decision.actions,
          this.options.maximumTotalNotional,
        );

      const globalRestrictions = uniqueSorted([
        ...decision.restrictions,
        ...decision.governance.restrictions,
        ...requestMismatchRestrictions,
        ...policyRestrictions,
        ...decisionRestrictions,
        ...riskRestrictions,
        ...warningRestrictions,
        ...notionalRestrictions,
      ]);

      const plannedActions = planActions(
        decision,
        policy,
        globalRestrictions,
        this.options,
      );

      const limitedActions = enforceActionLimit(
        plannedActions,
        policy.maximumActionsPerDecision,
      );

      const handoffActions = Object.freeze(
        limitedActions
          .filter(
            (item) =>
              this.options.includeRejectedActions ||
              item.action.approved,
          )
          .map((item) => item.action),
      );

      const approvalRequirement =
        deriveApprovalRequirement(
          decision,
          handoffActions,
          policy,
        );

      const executionAuthorized =
        deriveExecutionAuthorization(
          request,
          decision,
          policy,
          handoffActions,
          globalRestrictions,
          approvalRequirement,
          this.options,
          generatedAtMs,
        );

      const downstream =
        selectDownstreamHandoffs(
          request,
          decision,
          handoffActions,
          executionAuthorized,
        );

      validateRequiredHandoffs(
        request,
        decision,
        policy,
        downstream,
        executionAuthorized,
      );

      const planId = this.options.planIdFactory(
        "execution-plan",
        this.options.fingerprintFactory({
          requestId: request.requestId,
          decisionId: decision.decisionId,
          decisionFingerprint:
            decision.deterministicFingerprint,
          actionFingerprints: handoffActions.map(
            actionFingerprintInput,
          ),
          executionAuthorized,
          approvalRequirement,
          restrictions: globalRestrictions,
          generatedAtMs,
        }),
      );

      const handoff: MultiAgentExecutionHandoff =
        deepFreeze({
          planId,
          decisionIntelligenceRequest:
            downstream.decisionIntelligenceRequest,
          decisionExecutionPlan:
            downstream.decisionExecutionPlan,
          strategyPortfolioRequest:
            downstream.strategyPortfolioRequest,
          arbitrageRequest:
            downstream.arbitrageRequest,
          actions: handoffActions,
          executionAuthorized,
          approvalRequirement,
          restrictions: Object.freeze(
            globalRestrictions,
          ),
          generatedAtMs,
          deterministicFingerprint:
            this.options.fingerprintFactory({
              planId,
              requestId: request.requestId,
              decisionId: decision.decisionId,
              decision:
                decision.decision,
              decisionIntelligenceRequest:
                downstream.decisionIntelligenceRequest,
              decisionExecutionPlan:
                downstream.decisionExecutionPlan,
              strategyPortfolioRequest:
                downstream.strategyPortfolioRequest,
              arbitrageRequest:
                downstream.arbitrageRequest,
              actions: handoffActions.map(
                actionFingerprintInput,
              ),
              executionAuthorized,
              approvalRequirement,
              restrictions:
                globalRestrictions,
              generatedAtMs,
              metadata:
                this.options.metadata,
            }),
        });

      this.lastSnapshotValue = deepFreeze({
        planId,
        requestId: request.requestId,
        decisionId: decision.decisionId,
        executionAuthorized,
        approvalRequirement,
        inputActionCount:
          decision.actions.length,
        handoffActionCount:
          handoffActions.length,
        approvedActionCount:
          handoffActions.filter(
            (action) => action.approved,
          ).length,
        blockedActionCount:
          plannedActions.filter(
            (item) => !item.action.approved,
          ).length,
        restrictionCount:
          globalRestrictions.length,
        generatedAtMs,
        deterministicFingerprint:
          this.options.fingerprintFactory({
            planId,
            executionAuthorized,
            approvalRequirement,
            inputActionCount:
              decision.actions.length,
            handoffActionCount:
              handoffActions.length,
            approvedActionCount:
              handoffActions.filter(
                (action) => action.approved,
              ).length,
            blockedActionCount:
              plannedActions.filter(
                (item) => !item.action.approved,
              ).length,
            restrictionCount:
              globalRestrictions.length,
            generatedAtMs,
          }),
      });

      return handoff;
    } catch (cause) {
      if (
        cause instanceof
        MultiAgentExecutionPlannerError
      ) {
        throw cause;
      }

      throw new MultiAgentExecutionPlannerError(
        "EXECUTION_PLANNING_FAILED",
        "Failed to build the multi-agent execution handoff.",
        {
          requestId: request.requestId,
          decisionId: decision.decisionId,
          cause,
        },
      );
    }
  }
}

export function createMultiAgentExecutionPlanner(
  options: MultiAgentExecutionPlannerOptions = {},
): MultiAgentExecutionPlanner {
  return new MultiAgentExecutionPlanner(options);
}

function planActions(
  decision: MultiAgentCollectiveDecision,
  policy: MultiAgentExecutionPolicy,
  globalRestrictions: readonly string[],
  options: NormalizedOptions,
): readonly PlannedAction[] {
  const criticalRiskPresent =
    decision.risks.some(
      (risk) =>
        risk.severity === "CRITICAL",
    );
  const materialDissentPresent =
    decision.dissent.some(
      (dissent) => dissent.material,
    );

  return Object.freeze(
    [...decision.actions]
      .sort((left, right) =>
        compareActions(left, right),
      )
      .map((source) => {
        const modeRestrictions =
          deriveModeRestrictions(
            source.action,
            policy,
          );
        const actionRestrictions =
          uniqueSorted([
            ...globalRestrictions,
            ...source.restrictions,
            ...modeRestrictions,
          ]);

        const permittedByMode =
          modeRestrictions.length === 0;
        const permittedByDecision =
          isActionPermittedByDecision(
            source.action,
            decision.decision,
          );
        const permittedByGovernance =
          decision.governance.decision ===
            "APPROVED" ||
          decision.governance.decision ===
            "APPROVED_WITH_RESTRICTIONS";
        const permittedByRisk =
          !(
            options.blockOnCriticalRisk &&
            criticalRiskPresent &&
            isExecutableAction(
              source.action,
            )
          );
        const permittedByDissent =
          !(
            options.blockOnUnresolvedMaterialDissent &&
            materialDissentPresent &&
            isExecutableAction(
              source.action,
            )
          );
        const permittedByPolicy =
          policy.enabled ||
          isNonExecutingAction(
            source.action,
          );
        const approved =
          source.approved &&
          permittedByMode &&
          permittedByDecision &&
          permittedByGovernance &&
          permittedByRisk &&
          permittedByDissent &&
          permittedByPolicy;

        const blockedReasons =
          uniqueSorted([
            ...(!source.approved
              ? [
                  "The collective decision did not approve this action.",
                ]
              : []),
            ...(!permittedByMode
              ? modeRestrictions
              : []),
            ...(!permittedByDecision
              ? [
                  `Decision state "${decision.decision}" does not authorize this action.`,
                ]
              : []),
            ...(!permittedByGovernance
              ? [
                  `Governance state "${decision.governance.decision}" does not authorize execution.`,
                ]
              : []),
            ...(!permittedByRisk
              ? [
                  "Execution is blocked because a critical unresolved risk is present.",
                ]
              : []),
            ...(!permittedByDissent
              ? [
                  "Execution is blocked because material dissent remains unresolved.",
                ]
              : []),
            ...(!permittedByPolicy
              ? [
                  "Execution policy is disabled.",
                ]
              : []),
          ]);

        return deepFreeze({
          source,
          permittedByMode,
          permittedByDecision,
          permittedByGovernance,
          permittedByRisk:
            permittedByRisk &&
            permittedByDissent,
          permittedByPolicy,
          blockedReasons,
          action: deepFreeze({
            ...source,
            approved,
            restrictions:
              Object.freeze(
                uniqueSorted([
                  ...actionRestrictions,
                  ...blockedReasons,
                ]),
              ),
          }),
        });
      }),
  );
}

function enforceActionLimit(
  plannedActions: readonly PlannedAction[],
  maximumActions: number,
): readonly PlannedAction[] {
  if (
    maximumActions === 0 ||
    plannedActions.length <= maximumActions
  ) {
    return plannedActions;
  }

  const selectedIds = new Set(
    [...plannedActions]
      .sort((left, right) =>
        compareActions(
          left.action,
          right.action,
        ),
      )
      .slice(0, maximumActions)
      .map(
        (item) => item.action.actionId,
      ),
  );

  return Object.freeze(
    plannedActions.map((item) => {
      if (
        selectedIds.has(
          item.action.actionId,
        )
      ) {
        return item;
      }

      const reason =
        `Action limit of ${maximumActions} was reached.`;

      return deepFreeze({
        ...item,
        permittedByPolicy: false,
        blockedReasons: Object.freeze(
          uniqueSorted([
            ...item.blockedReasons,
            reason,
          ]),
        ),
        action: deepFreeze({
          ...item.action,
          approved: false,
          restrictions: Object.freeze(
            uniqueSorted([
              ...item.action.restrictions,
              reason,
            ]),
          ),
        }),
      });
    }),
  );
}

function deriveExecutionAuthorization(
  request: MultiAgentRunRequest,
  decision: MultiAgentCollectiveDecision,
  policy: MultiAgentExecutionPolicy,
  actions: readonly MultiAgentDecisionAction[],
  restrictions: readonly string[],
  approvalRequirement: MultiAgentApprovalRequirement,
  options: NormalizedOptions,
  generatedAtMs: MultiAgentTimestamp,
): boolean {
  if (!policy.enabled) {
    return false;
  }

  if (
    !EXECUTABLE_DECISIONS.has(
      decision.decision,
    )
  ) {
    return false;
  }

  if (
    decision.validUntilMs !== undefined &&
    decision.validUntilMs <
      generatedAtMs
  ) {
    return false;
  }

  if (
    request.requestId.length === 0 ||
    decision.decisionId.length === 0
  ) {
    return false;
  }

  if (
    approvalRequirement ===
    "HUMAN_APPROVAL"
  ) {
    return false;
  }

  if (
    decision.operatorEscalation
      ?.required === true
  ) {
    return false;
  }

  if (
    policy.prohibitExecutionOnWarnings &&
    restrictions.length > 0
  ) {
    return false;
  }

  if (
    options.blockOnCriticalRisk &&
    decision.risks.some(
      (risk) =>
        risk.severity === "CRITICAL",
    )
  ) {
    return false;
  }

  if (
    options.blockOnUnresolvedMaterialDissent &&
    decision.dissent.some(
      (dissent) => dissent.material,
    )
  ) {
    return false;
  }

  return actions.some(
    (action) =>
      action.approved &&
      isExecutableAction(action.action),
  );
}

function deriveApprovalRequirement(
  decision: MultiAgentCollectiveDecision,
  actions: readonly MultiAgentDecisionAction[],
  policy: MultiAgentExecutionPolicy,
): MultiAgentApprovalRequirement {
  const governanceRequirement =
    decision.governance
      .approvalRequirement;

  if (
    governanceRequirement !== "NONE"
  ) {
    return governanceRequirement;
  }

  if (
    decision.operatorEscalation
      ?.required === true
  ) {
    return "HUMAN_APPROVAL";
  }

  if (
    actions.some(
      (action) =>
        action.action.executionMode ===
          "SEMI_AUTOMATED" &&
        action.approved,
    )
  ) {
    return policy.allowSemiAutomatedExecution
      ? "HUMAN_APPROVAL"
      : "GOVERNANCE_APPROVAL";
  }

  if (
    decision.decision ===
    "EXECUTE_WITH_RESTRICTIONS"
  ) {
    return "GOVERNANCE_APPROVAL";
  }

  return "NONE";
}

function selectDownstreamHandoffs(
  request: MultiAgentRunRequest,
  decision: MultiAgentCollectiveDecision,
  actions: readonly MultiAgentDecisionAction[],
  executionAuthorized: boolean,
): {
  readonly decisionIntelligenceRequest:
    MultiAgentExecutionHandoff["decisionIntelligenceRequest"];
  readonly decisionExecutionPlan:
    MultiAgentExecutionHandoff["decisionExecutionPlan"];
  readonly strategyPortfolioRequest:
    MultiAgentExecutionHandoff["strategyPortfolioRequest"];
  readonly arbitrageRequest:
    MultiAgentExecutionHandoff["arbitrageRequest"];
} {
  const approvedActions = actions.filter(
    (action) => action.approved,
  );
  const hasStrategyAction =
    approvedActions.some(
      (action) =>
        isStrategyAction(
          action.action,
        ),
    );
  const hasArbitrageAction =
    approvedActions.some(
      (action) =>
        action.action.type ===
          "EXECUTE_ARBITRAGE",
    );
  const hasTradeOrRiskAction =
    approvedActions.some(
      (action) =>
        isTradeOrRiskAction(
          action.action,
        ),
    );

  return deepFreeze({
    decisionIntelligenceRequest:
      hasTradeOrRiskAction ||
      request.configuration.execution
        .requireDecisionIntelligenceHandoff
        ? request.context
            .decisionIntelligence.request
        : undefined,
    decisionExecutionPlan:
      executionAuthorized &&
      hasTradeOrRiskAction
        ? request.context
            .decisionIntelligence
            .existingExecutionPlan
        : undefined,
    strategyPortfolioRequest:
      hasStrategyAction
        ? request.context.strategyPortfolio
            .request
        : undefined,
    arbitrageRequest:
      hasArbitrageAction
        ? request.context.arbitrage.request
        : undefined,
  });
}

function validateRequiredHandoffs(
  request: MultiAgentRunRequest,
  decision: MultiAgentCollectiveDecision,
  policy: MultiAgentExecutionPolicy,
  downstream: ReturnType<
    typeof selectDownstreamHandoffs
  >,
  executionAuthorized: boolean,
): void {
  if (
    policy.requireDecisionIntelligenceHandoff &&
    downstream.decisionIntelligenceRequest ===
      undefined
  ) {
    throw new MultiAgentExecutionPlannerError(
      "DECISION_INTELLIGENCE_HANDOFF_REQUIRED",
      "Execution policy requires a Decision Intelligence handoff, but the request context does not contain one.",
      {
        requestId: request.requestId,
        decisionId: decision.decisionId,
      },
    );
  }

  if (
    executionAuthorized &&
    policy.requireExecutionPlan &&
    downstream.decisionExecutionPlan ===
      undefined
  ) {
    throw new MultiAgentExecutionPlannerError(
      "EXECUTION_PLAN_REQUIRED",
      "Execution policy requires an existing Decision Intelligence execution plan.",
      {
        requestId: request.requestId,
        decisionId: decision.decisionId,
      },
    );
  }

  if (
    executionAuthorized &&
    policy.requireRollbackPlan &&
    !hasRollbackPlan(
      downstream.decisionExecutionPlan,
      decision,
    )
  ) {
    throw new MultiAgentExecutionPlannerError(
      "ROLLBACK_PLAN_REQUIRED",
      "Execution policy requires a rollback plan, but no rollback evidence was found.",
      {
        requestId: request.requestId,
        decisionId: decision.decisionId,
      },
    );
  }
}

function hasRollbackPlan(
  executionPlan:
    MultiAgentExecutionHandoff["decisionExecutionPlan"],
  decision: MultiAgentCollectiveDecision,
): boolean {
  if (executionPlan === undefined) {
    return false;
  }

  const planRecord = asRecord(executionPlan);

  if (planRecord !== undefined) {
    const candidates = [
      planRecord["rollbackPlan"],
      planRecord["rollback"],
      planRecord["contingencyPlan"],
      planRecord["recoveryPlan"],
    ];

    if (
      candidates.some(
        (value) =>
          value !== undefined &&
          value !== null,
      )
    ) {
      return true;
    }
  }

  const metadata = asRecord(
    decision.metadata,
  );

  return (
    metadata?.["rollbackPlanAvailable"] ===
      true ||
    metadata?.["hasRollbackPlan"] === true
  );
}

function deriveModeRestrictions(
  action: MultiAgentProposalAction,
  policy: MultiAgentExecutionPolicy,
): readonly string[] {
  switch (
    action.executionMode ?? "SIGNAL_ONLY"
  ) {
    case "SIGNAL_ONLY":
      return policy.allowSignalOnly
        ? Object.freeze([])
        : Object.freeze([
            "Signal-only actions are prohibited by execution policy.",
          ]);
    case "PAPER":
      return policy.allowPaperExecution
        ? Object.freeze([])
        : Object.freeze([
            "Paper execution is prohibited by execution policy.",
          ]);
    case "SEMI_AUTOMATED":
      return policy.allowSemiAutomatedExecution
        ? Object.freeze([])
        : Object.freeze([
            "Semi-automated execution is prohibited by execution policy.",
          ]);
    case "FULLY_AUTOMATED":
      return policy.allowFullyAutomatedExecution
        ? Object.freeze([])
        : Object.freeze([
            "Fully automated execution is prohibited by execution policy.",
          ]);
  }
}

function deriveRequestMismatchRestrictions(
  request: MultiAgentRunRequest,
  decision: MultiAgentCollectiveDecision,
): readonly string[] {
  const proposal =
    decision.selectedProposal;

  if (proposal === undefined) {
    return Object.freeze([]);
  }

  const restrictions: string[] = [];

  if (
    proposal.runId !== decision.runId
  ) {
    restrictions.push(
      "Selected proposal run ID does not match the collective decision run ID.",
    );
  }

  if (
    proposal.sessionId !==
    decision.sessionId
  ) {
    restrictions.push(
      "Selected proposal session ID does not match the collective decision session ID.",
    );
  }

  if (
    request.portfolioId !== undefined &&
    proposal.actions.some(
      (action) =>
        action.portfolioId !== undefined &&
        action.portfolioId !==
          request.portfolioId,
    )
  ) {
    restrictions.push(
      "One or more proposal actions target a portfolio different from the requested portfolio.",
    );
  }

  return Object.freeze(
    uniqueSorted(restrictions),
  );
}

function derivePolicyRestrictions(
  policy: MultiAgentExecutionPolicy,
): readonly string[] {
  const restrictions: string[] = [];

  if (!policy.enabled) {
    restrictions.push(
      "Execution planning policy is disabled.",
    );
  }

  if (
    policy.maximumActionsPerDecision === 0
  ) {
    restrictions.push(
      "Execution policy permits no actions for this decision.",
    );
  }

  return Object.freeze(restrictions);
}

function deriveDecisionRestrictions(
  decision: MultiAgentCollectiveDecision,
  generatedAtMs: MultiAgentTimestamp,
): readonly string[] {
  const restrictions: string[] = [];

  if (
    !EXECUTABLE_DECISIONS.has(
      decision.decision,
    )
  ) {
    restrictions.push(
      `Collective decision state "${decision.decision}" does not authorize execution.`,
    );
  }

  if (
    decision.validUntilMs !== undefined &&
    decision.validUntilMs <
      generatedAtMs
  ) {
    restrictions.push(
      "The collective decision has expired.",
    );
  }

  if (
    decision.operatorEscalation
      ?.required === true
  ) {
    restrictions.push(
      "Operator escalation must be resolved before execution.",
    );
  }

  return Object.freeze(restrictions);
}

function deriveRiskRestrictions(
  decision: MultiAgentCollectiveDecision,
  options: NormalizedOptions,
): readonly string[] {
  const restrictions: string[] = [];

  if (
    options.blockOnCriticalRisk &&
    decision.risks.some(
      (risk) =>
        risk.severity === "CRITICAL",
    )
  ) {
    restrictions.push(
      "A critical unresolved risk blocks execution.",
    );
  }

  if (
    options.blockOnUnresolvedMaterialDissent &&
    decision.dissent.some(
      (dissent) => dissent.material,
    )
  ) {
    restrictions.push(
      "Material dissent must be resolved before execution.",
    );
  }

  return Object.freeze(restrictions);
}

function deriveWarningRestrictions(
  decision: MultiAgentCollectiveDecision,
  policy: MultiAgentExecutionPolicy,
): readonly string[] {
  if (!policy.prohibitExecutionOnWarnings) {
    return Object.freeze([]);
  }

  const warnings = [
    ...decision.governance.ruleEvaluations
      .filter(
        (evaluation) =>
          !evaluation.passed &&
          evaluation.severity !==
            "CRITICAL",
      )
      .map(
        (evaluation) =>
          `Governance warning: ${evaluation.message}`,
      ),
    ...decision.risks
      .filter(
        (risk) =>
          risk.severity === "HIGH" ||
          risk.severity === "MODERATE",
      )
      .map(
        (risk) =>
          `Risk warning: ${risk.name}`,
      ),
  ];

  return Object.freeze(
    uniqueSorted(warnings),
  );
}

function deriveNotionalRestrictions(
  actions: readonly MultiAgentDecisionAction[],
  maximumTotalNotional: number | undefined,
): readonly string[] {
  if (
    maximumTotalNotional === undefined
  ) {
    return Object.freeze([]);
  }

  const totalNotional = actions.reduce(
    (sum, action) =>
      sum +
      Math.max(
        0,
        action.action.notional ?? 0,
      ),
    0,
  );

  return totalNotional >
    maximumTotalNotional
    ? Object.freeze([
        `Total action notional ${totalNotional} exceeds planner maximum ${maximumTotalNotional}.`,
      ])
    : Object.freeze([]);
}

function isActionPermittedByDecision(
  action: MultiAgentProposalAction,
  decision:
    MultiAgentCollectiveDecision["decision"],
): boolean {
  if (
    EXECUTABLE_DECISIONS.has(decision)
  ) {
    return true;
  }

  if (
    decision === "MONITOR" ||
    decision === "HOLD"
  ) {
    return isNonExecutingAction(action);
  }

  return false;
}

function isExecutableAction(
  action: MultiAgentProposalAction,
): boolean {
  return EXECUTION_ACTION_TYPES.has(
    action.type,
  );
}

function isNonExecutingAction(
  action: MultiAgentProposalAction,
): boolean {
  return NON_EXECUTING_ACTION_TYPES.has(
    action.type,
  );
}

function isStrategyAction(
  action: MultiAgentProposalAction,
): boolean {
  return (
    action.type ===
      "ACTIVATE_STRATEGY" ||
    action.type ===
      "DEACTIVATE_STRATEGY" ||
    action.type ===
      "ROTATE_STRATEGY" ||
    action.type ===
      "CHANGE_STRATEGY_WEIGHT"
  );
}

function isTradeOrRiskAction(
  action: MultiAgentProposalAction,
): boolean {
  return (
    action.type ===
      "OPEN_POSITION" ||
    action.type ===
      "INCREASE_POSITION" ||
    action.type ===
      "REDUCE_POSITION" ||
    action.type ===
      "CLOSE_POSITION" ||
    action.type ===
      "HEDGE_POSITION" ||
    action.type ===
      "REBALANCE_PORTFOLIO" ||
    action.type ===
      "PAUSE_TRADING" ||
    action.type ===
      "RESUME_TRADING" ||
    action.type === "CUSTOM"
  );
}

function compareActions(
  left: MultiAgentDecisionAction,
  right: MultiAgentDecisionAction,
): number {
  const approvalDifference =
    Number(right.approved) -
    Number(left.approved);

  if (approvalDifference !== 0) {
    return approvalDifference;
  }

  const priorityDifference =
    priorityRank(
      right.action.priority,
    ) -
    priorityRank(
      left.action.priority,
    );

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const urgencyDifference =
    urgencyRank(right.action.urgency) -
    urgencyRank(left.action.urgency);

  if (urgencyDifference !== 0) {
    return urgencyDifference;
  }

  const confidenceDifference =
    right.confidence - left.confidence;

  return confidenceDifference !== 0
    ? confidenceDifference
    : left.actionId.localeCompare(
        right.actionId,
      );
}

function priorityRank(
  priority:
    MultiAgentProposalAction["priority"],
): number {
  switch (priority) {
    case "INFORMATIONAL":
      return 0;
    case "LOW":
      return 1;
    case "MEDIUM":
      return 2;
    case "HIGH":
      return 3;
    case "VERY_HIGH":
      return 4;
    case "CRITICAL":
      return 5;
    default:
      return 0;
  }
}

function urgencyRank(
  urgency:
    MultiAgentProposalAction["urgency"],
): number {
  switch (urgency) {
    case "INFORMATIONAL":
      return 1;
    case "LOW":
      return 2;
    case "NORMAL":
      return 3;
    case "HIGH":
      return 4;
    case "IMMEDIATE":
      return 5;
    default:
      return assertNever(urgency);
  }
}

function assertNever(value: never): never {
  throw new MultiAgentExecutionPlannerError(
    "INVALID_EXECUTION_INPUT",
    `Unsupported execution-planner enum value: ${String(value)}.`,
  );
}

function actionFingerprintInput(
  action: MultiAgentDecisionAction,
): unknown {
  return {
    actionId: action.actionId,
    sourceProposalId:
      action.sourceProposalId,
    action: action.action,
    approved: action.approved,
    restrictions: action.restrictions,
    contributingAgentIds:
      action.contributingAgentIds,
    confidence: action.confidence,
  };
}

function validateInputs(
  request: MultiAgentRunRequest,
  decision: MultiAgentCollectiveDecision,
  policy: MultiAgentExecutionPolicy,
): void {
  if (
    request === null ||
    typeof request !== "object" ||
    decision === null ||
    typeof decision !== "object" ||
    policy === null ||
    typeof policy !== "object"
  ) {
    throw new MultiAgentExecutionPlannerError(
      "INVALID_EXECUTION_INPUT",
      "Request, collective decision, and execution policy are required.",
    );
  }

  if (
    request.requestId.trim().length === 0 ||
    decision.decisionId.trim().length ===
      0
  ) {
    throw new MultiAgentExecutionPlannerError(
      "INVALID_EXECUTION_INPUT",
      "Request ID and decision ID must be non-empty.",
      {
        requestId: request.requestId,
        decisionId: decision.decisionId,
      },
    );
  }

  if (
    !Number.isInteger(
      policy.maximumActionsPerDecision,
    ) ||
    policy.maximumActionsPerDecision < 0
  ) {
    throw new MultiAgentExecutionPlannerError(
      "INVALID_EXECUTION_POLICY",
      "maximumActionsPerDecision must be a non-negative integer.",
      {
        requestId: request.requestId,
        decisionId: decision.decisionId,
      },
    );
  }
}

function normalizeOptions(
  options: MultiAgentExecutionPlannerOptions,
): NormalizedOptions {
  const maximumTotalNotional =
    options.maximumTotalNotional;

  if (
    maximumTotalNotional !== undefined &&
    (!Number.isFinite(
      maximumTotalNotional,
    ) ||
      maximumTotalNotional < 0)
  ) {
    throw new RangeError(
      "maximumTotalNotional must be a non-negative finite number.",
    );
  }

  return Object.freeze({
    clock: options.clock ?? {
      now: () =>
        Date.now() as MultiAgentTimestamp,
    },
    planIdFactory:
      options.planIdFactory ??
      defaultPlanIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ??
      defaultFingerprintFactory,
    failOnExpiredDecision:
      options.failOnExpiredDecision ??
      false,
    includeRejectedActions:
      options.includeRejectedActions ??
      true,
    blockOnUnresolvedMaterialDissent:
      options.blockOnUnresolvedMaterialDissent ??
      true,
    blockOnCriticalRisk:
      options.blockOnCriticalRisk ?? true,
    maximumTotalNotional,
    metadata: options.metadata,
  });
}

function defaultPlanIdFactory(
  prefix: string,
  seed: string,
): MultiAgentPlanId {
  return `${prefix}-${fnv1a64(seed)}`;
}

function defaultFingerprintFactory(
  value: unknown,
): string {
  return `fnv1a64:${fnv1a64(
    canonicalStringify(value),
  )}`;
}

function uniqueSorted(
  values: readonly string[],
): string[] {
  return [...new Set(values)]
    .filter(
      (value) => value.length > 0,
    )
    .sort((left, right) =>
      left.localeCompare(right),
    );
}

function asRecord(
  value: unknown,
):
  | Readonly<Record<string, unknown>>
  | undefined {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Readonly<
        Record<string, unknown>
      >)
    : undefined;
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
    const codePoint =
      value.codePointAt(index);

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

    return Object.is(value, -0)
      ? 0
      : value;
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
          [
            String(key),
            canonicalize(item),
          ] as const,
      )
      .sort(([left], [right]) =>
        left.localeCompare(right),
      );
  }

  if (value instanceof Set) {
    return [...value.values()]
      .map((item) =>
        canonicalize(item),
      )
      .sort((left, right) =>
        JSON.stringify(
          left,
        ).localeCompare(
          JSON.stringify(right),
        ),
      );
  }

  if (typeof value === "object") {
    const record =
      value as Readonly<
        Record<string, unknown>
      >;
    const result: Record<
      string,
      unknown
    > = {};

    for (
      const key of Object.keys(
        record,
      ).sort()
    ) {
      const item = record[key];

      if (item !== undefined) {
        result[key] =
          canonicalize(item);
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
    for (
      const key of Object.keys(
        value as object,
      )
    ) {
      deepFreeze(
        (
          value as Record<
            string,
            unknown
          >
        )[key],
      );
    }
  }

  return Object.freeze(value);
}
