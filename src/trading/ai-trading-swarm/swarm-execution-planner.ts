/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-execution-planner.ts
 *
 * Deterministic and immutable execution-plan construction for approved
 * collective swarm decisions.
 */

import {
  type TradingSwarmCollectiveDecision,
  type TradingSwarmDecisionAction,
  type TradingSwarmExecutionMode,
  type TradingSwarmExecutionPlan,
  type TradingSwarmExecutionPlannerPort,
  type TradingSwarmExecutionPolicy,
  type TradingSwarmExecutionStatus,
  type TradingSwarmExecutionStep,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmMetadata,
  type TradingSwarmMission,
  type TradingSwarmNodeId,
  type TradingSwarmNodeState,
  type TradingSwarmPartition,
  type TradingSwarmPartitionId,
  type TradingSwarmPlanId,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmExecutionPlannerErrorCode =
  | "INVALID_MISSION"
  | "INVALID_DECISION"
  | "INVALID_TOPOLOGY"
  | "INVALID_POLICY"
  | "MISSION_MISMATCH"
  | "SWARM_MISMATCH"
  | "DUPLICATE_ACTION"
  | "INVALID_DEPENDENCY"
  | "CYCLIC_DEPENDENCY"
  | "INVALID_CONFIGURATION"
  | "PLANNING_FAILED";

export interface SwarmExecutionPlannerErrorDetails {
  readonly missionId?: string;
  readonly decisionId?: string;
  readonly actionId?: string;
  readonly nodeId?: string;
  readonly partitionId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmExecutionPlannerError extends Error {
  public readonly code: SwarmExecutionPlannerErrorCode;
  public readonly details: SwarmExecutionPlannerErrorDetails;

  public constructor(
    code: SwarmExecutionPlannerErrorCode,
    message: string,
    details: SwarmExecutionPlannerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmExecutionPlannerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmExecutionPlannerOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly defaultStepTimeoutMs?: number;
  readonly maximumStepTimeoutMs?: number;
  readonly defaultMaximumAttempts?: number;
  readonly maximumAttemptsLimit?: number;
  readonly defaultPlanValidityWindowMs?: number;
  readonly maximumPlanValidityWindowMs?: number;
  readonly requireHealthyAssignedNode?: boolean;
  readonly requireReadyAssignedNode?: boolean;
  readonly minimumNodeReadiness?: number;
  readonly minimumNodeReliability?: number;
  readonly rejectUnresolvedDependencies?: boolean;
  readonly rejectCyclicDependencies?: boolean;
  readonly metadata?: TradingSwarmMetadata;
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly defaultStepTimeoutMs: number;
  readonly maximumStepTimeoutMs: number;
  readonly defaultMaximumAttempts: number;
  readonly maximumAttemptsLimit: number;
  readonly defaultPlanValidityWindowMs: number;
  readonly maximumPlanValidityWindowMs: number;
  readonly requireHealthyAssignedNode: boolean;
  readonly requireReadyAssignedNode: boolean;
  readonly minimumNodeReadiness: number;
  readonly minimumNodeReliability: number;
  readonly rejectUnresolvedDependencies: boolean;
  readonly rejectCyclicDependencies: boolean;
  readonly metadata: TradingSwarmMetadata;
}

interface PlanningDenial {
  readonly code: string;
  readonly message: string;
}

interface ActionNodeAssignment {
  readonly action: TradingSwarmDecisionAction;
  readonly node: TradingSwarmNodeState;
  readonly partition?: TradingSwarmPartition;
}

/* ========================================================================== *
 * Planner
 * ========================================================================== */

export class SwarmExecutionPlanner
  implements TradingSwarmExecutionPlannerPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmExecutionPlannerOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public async plan(
    mission: TradingSwarmMission,
    decision: TradingSwarmCollectiveDecision,
    topology: TradingSwarmTopologySnapshot,
    policy: TradingSwarmExecutionPolicy,
  ): Promise<TradingSwarmExecutionPlan> {
    try {
      validateInputs(
        mission,
        decision,
        topology,
        policy,
      );

      const createdAtMs = resolveCreatedAt(
        mission,
        decision,
        topology,
      );

      const planId = createPlanId(
        mission,
        decision,
        topology,
        policy,
      );

      const denials = evaluatePlanningDenials(
        mission,
        decision,
        topology,
        policy,
        this.options,
      );

      if (denials.length > 0) {
        return this.createRejectedPlan(
          planId,
          mission,
          decision,
          policy,
          createdAtMs,
          denials,
        );
      }

      const orderedActions = orderActions(
        decision.actions,
        this.options,
      );

      const assignments = orderedActions.map(
        (action) =>
          assignAction(
            action,
            topology,
            policy,
            this.options,
          ),
      );

      const assignmentDenials =
        evaluateAssignmentDenials(
          assignments,
          policy,
          this.options,
        );

      if (assignmentDenials.length > 0) {
        return this.createRejectedPlan(
          planId,
          mission,
          decision,
          policy,
          createdAtMs,
          assignmentDenials,
        );
      }

      const steps = Object.freeze(
        assignments.map(
          (assignment, index) =>
            createExecutionStep(
              planId,
              assignment,
              index + 1,
              policy,
              this.options,
            ),
        ),
      );

      const rollbackRequired =
        resolveRollbackRequired(
          steps,
          policy,
        );

      const preconditions =
        buildPreconditions(
          mission,
          decision,
          topology,
          policy,
          steps,
        );

      const monitoringRequirements =
        buildMonitoringRequirements(
          policy,
          steps,
        );

      const restrictions = Object.freeze(
        uniqueSorted([
          ...decision.restrictions,
          ...decision.governance.restrictions,
          ...deriveExecutionRestrictions(
            policy,
            topology,
            steps,
          ),
        ]),
      );

      const expiresAtMs = resolveExpiresAt(
        mission,
        decision,
        createdAtMs,
        this.options,
      );

      const executionAuthorized =
        policy.enabled &&
        decision.governance.executionAuthorized &&
        decision.decision !== "REJECT" &&
        decision.decision !== "DEFER" &&
        decision.decision !== "HOLD" &&
        policy.mode !== "SIGNAL_ONLY" &&
        steps.length > 0;

      const status: TradingSwarmExecutionStatus =
        executionAuthorized
          ? "AUTHORIZED"
          : "NOT_STARTED";

      const base = {
        planId,
        decisionId: decision.decisionId,
        missionId: mission.missionId,
        mode: resolveExecutionMode(
          decision,
          policy,
        ),
        status,
        executionAuthorized,
        steps,
        preconditions,
        monitoringRequirements,
        rollbackRequired,
        restrictions,
        createdAtMs,
        ...(expiresAtMs === undefined
          ? {}
          : { expiresAtMs }),
      } satisfies Omit<
        TradingSwarmExecutionPlan,
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
        SwarmExecutionPlannerError
      ) {
        throw error;
      }

      throw new SwarmExecutionPlannerError(
        "PLANNING_FAILED",
        "Failed to create the deterministic swarm execution plan.",
        {
          missionId: mission?.missionId,
          decisionId: decision?.decisionId,
          cause: error,
        },
      );
    }
  }

  private createRejectedPlan(
    planId: TradingSwarmPlanId,
    mission: TradingSwarmMission,
    decision: TradingSwarmCollectiveDecision,
    policy: TradingSwarmExecutionPolicy,
    createdAtMs: TradingSwarmTimestamp,
    denials: readonly PlanningDenial[],
  ): TradingSwarmExecutionPlan {
    const restrictions = Object.freeze(
      uniqueSorted([
        ...decision.restrictions,
        ...decision.governance.restrictions,
        ...denials.map(
          (denial) =>
            `${denial.code}: ${denial.message}`,
        ),
      ]),
    );

    const base = {
      planId,
      decisionId: decision.decisionId,
      missionId: mission.missionId,
      mode: resolveExecutionMode(
        decision,
        policy,
      ),
      status: "REJECTED",
      executionAuthorized: false,
      steps: Object.freeze([]),
      preconditions: Object.freeze(
        uniqueSorted([
          "Execution planning must be re-evaluated after all denial conditions are resolved.",
        ]),
      ),
      monitoringRequirements:
        Object.freeze(
          uniqueSorted([
            "Record and monitor the rejected execution-plan decision.",
          ]),
        ),
      rollbackRequired: false,
      restrictions,
      createdAtMs,
    } satisfies Omit<
      TradingSwarmExecutionPlan,
      "deterministicFingerprint"
    >;

    return deepFreeze({
      ...base,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          base,
        ),
    });
  }
}

/* ========================================================================== *
 * Planning authorization
 * ========================================================================== */

function evaluatePlanningDenials(
  mission: TradingSwarmMission,
  decision: TradingSwarmCollectiveDecision,
  topology: TradingSwarmTopologySnapshot,
  policy: TradingSwarmExecutionPolicy,
  options: NormalizedOptions,
): readonly PlanningDenial[] {
  const denials: PlanningDenial[] = [];

  if (!policy.enabled) {
    denials.push({
      code: "EXECUTION_POLICY_DISABLED",
      message:
        "The swarm execution policy is disabled.",
    });
  }

  if (
    policy.requireExecutionPlan === false
  ) {
    denials.push({
      code: "EXECUTION_PLAN_NOT_REQUIRED",
      message:
        "The supplied policy does not authorize creation of an execution plan.",
    });
  }

  if (
    policy.requireGovernanceApproval &&
    !decision.governance.executionAuthorized
  ) {
    denials.push({
      code: "GOVERNANCE_NOT_AUTHORIZED",
      message:
        "Governance has not authorized autonomous execution.",
    });
  }

  if (
    decision.governance.operatorApprovalRequired
  ) {
    denials.push({
      code: "OPERATOR_APPROVAL_REQUIRED",
      message:
        "Operator approval is required before execution planning.",
    });
  }

  if (
    decision.decision === "REJECT" ||
    decision.decision === "DEFER" ||
    decision.decision === "HOLD"
  ) {
    denials.push({
      code: "NON_EXECUTABLE_DECISION",
      message: `Collective decision "${decision.decision}" is not executable.`,
    });
  }

  if (
    decision.decision === "SIGNAL_ONLY" ||
    policy.mode === "SIGNAL_ONLY"
  ) {
    denials.push({
      code: "SIGNAL_ONLY_MODE",
      message:
        "Signal-only decisions and policies cannot create executable steps.",
    });
  }

  if (decision.actions.length === 0) {
    denials.push({
      code: "NO_EXECUTION_ACTIONS",
      message:
        "The collective decision contains no execution actions.",
    });
  }

  if (
    decision.actions.length >
    policy.maximumActionsPerDecision
  ) {
    denials.push({
      code: "ACTION_LIMIT_EXCEEDED",
      message:
        `Decision action count ${decision.actions.length} exceeds policy maximum ${policy.maximumActionsPerDecision}.`,
    });
  }

  if (
    mission.constraints.maximumExecutionActions !==
      undefined &&
    decision.actions.length >
      mission.constraints.maximumExecutionActions
  ) {
    denials.push({
      code: "MISSION_ACTION_LIMIT_EXCEEDED",
      message:
        `Decision action count ${decision.actions.length} exceeds mission maximum ${mission.constraints.maximumExecutionActions}.`,
    });
  }

  const totalNotional =
    calculateTotalNotional(decision.actions);

  if (
    totalNotional >
    policy.maximumTotalNotional
  ) {
    denials.push({
      code: "NOTIONAL_LIMIT_EXCEEDED",
      message:
        `Total action notional ${totalNotional} exceeds policy maximum ${policy.maximumTotalNotional}.`,
    });
  }

  if (
    mission.constraints.maximumCapitalAtRisk !==
      undefined &&
    totalNotional >
      mission.constraints.maximumCapitalAtRisk
  ) {
    denials.push({
      code: "MISSION_CAPITAL_LIMIT_EXCEEDED",
      message:
        `Total action notional ${totalNotional} exceeds mission capital-at-risk limit ${mission.constraints.maximumCapitalAtRisk}.`,
    });
  }

  if (
    mission.constraints.prohibitedActions !==
      undefined &&
    mission.constraints.prohibitedActions.length >
      0
  ) {
    const prohibited =
      deriveProhibitedDecisionActions(
        mission.constraints.prohibitedActions,
        decision.actions,
      );

    if (prohibited.length > 0) {
      denials.push({
        code: "PROHIBITED_ACTION",
        message:
          `Decision contains prohibited action types: ${prohibited.join(", ")}.`,
      });
    }
  }

  if (
    policy.prohibitExecutionOnWarnings &&
    topology.nodes.some(
      (node) =>
        node.health.warnings.length > 0,
    )
  ) {
    denials.push({
      code: "TOPOLOGY_WARNINGS_PRESENT",
      message:
        "Execution is prohibited while topology node warnings are present.",
    });
  }

  if (
    policy.prohibitExecutionWhenDegraded &&
    topology.nodes.some(
      (node) =>
        node.health.lifecycleState ===
          "DEGRADED" ||
        node.health.availability ===
          "UNAVAILABLE" ||
        !node.health.healthy,
    )
  ) {
    denials.push({
      code: "TOPOLOGY_DEGRADED",
      message:
        "Execution is prohibited while the topology is degraded.",
    });
  }

  if (
    decision.validUntilMs !== undefined &&
    Number(decision.validUntilMs) <
      Number(topology.capturedAtMs)
  ) {
    denials.push({
      code: "DECISION_EXPIRED",
      message:
        "The collective decision expired before the topology snapshot was captured.",
    });
  }

  if (
    mission.deadlineAtMs !== undefined &&
    Number(mission.deadlineAtMs) <
      Number(topology.capturedAtMs)
  ) {
    denials.push({
      code: "MISSION_DEADLINE_EXPIRED",
      message:
        "The mission deadline expired before execution planning.",
    });
  }

  if (
    options.rejectUnresolvedDependencies
  ) {
    const unresolved =
      findUnresolvedDependencies(
        decision.actions,
      );

    if (unresolved.length > 0) {
      denials.push({
        code: "UNRESOLVED_DEPENDENCIES",
        message:
          `Unresolved action dependencies: ${unresolved.join(", ")}.`,
      });
    }
  }

  if (
    options.rejectCyclicDependencies &&
    hasDependencyCycle(decision.actions)
  ) {
    denials.push({
      code: "CYCLIC_DEPENDENCY",
      message:
        "Execution actions contain a cyclic dependency graph.",
    });
  }

  return Object.freeze(
    denials
      .map((denial) =>
        deepFreeze(denial),
      )
      .sort((left, right) =>
        left.code.localeCompare(right.code),
      ),
  );
}

/* ========================================================================== *
 * Action ordering and assignment
 * ========================================================================== */

function orderActions(
  actions: readonly TradingSwarmDecisionAction[],
  options: NormalizedOptions,
): readonly TradingSwarmDecisionAction[] {
  const byId = new Map(
    actions.map((action) => [
      action.actionId,
      action,
    ]),
  );

  const unresolved =
    findUnresolvedDependencies(actions);

  if (
    unresolved.length > 0 &&
    options.rejectUnresolvedDependencies
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_DEPENDENCY",
      `Unresolved dependencies: ${unresolved.join(", ")}.`,
    );
  }

  const indegree = new Map<string, number>();
  const dependents =
    new Map<string, string[]>();

  for (const action of actions) {
    indegree.set(action.actionId, 0);
    dependents.set(action.actionId, []);
  }

  for (const action of actions) {
    for (const dependencyId of action.dependencies) {
      if (!byId.has(dependencyId)) {
        continue;
      }

      indegree.set(
        action.actionId,
        (indegree.get(action.actionId) ?? 0) +
          1,
      );

      dependents
        .get(dependencyId)
        ?.push(action.actionId);
    }
  }

  const ready = actions
    .filter(
      (action) =>
        (indegree.get(action.actionId) ?? 0) ===
        0,
    )
    .sort(compareActions);

  const ordered: TradingSwarmDecisionAction[] =
    [];

  while (ready.length > 0) {
    const current = ready.shift();

    if (current === undefined) {
      break;
    }

    ordered.push(current);

    const children = [
      ...(dependents.get(current.actionId) ??
        []),
    ].sort();

    for (const childId of children) {
      const next =
        (indegree.get(childId) ?? 0) - 1;

      indegree.set(childId, next);

      if (next === 0) {
        const child = byId.get(childId);

        if (child !== undefined) {
          ready.push(child);
          ready.sort(compareActions);
        }
      }
    }
  }

  if (ordered.length !== actions.length) {
    if (options.rejectCyclicDependencies) {
      throw new SwarmExecutionPlannerError(
        "CYCLIC_DEPENDENCY",
        "Execution actions contain a cyclic dependency graph.",
      );
    }

    const remaining = actions
      .filter(
        (action) =>
          !ordered.some(
            (item) =>
              item.actionId === action.actionId,
          ),
      )
      .sort(compareActions);

    ordered.push(...remaining);
  }

  return Object.freeze(ordered);
}

function assignAction(
  action: TradingSwarmDecisionAction,
  topology: TradingSwarmTopologySnapshot,
  policy: TradingSwarmExecutionPolicy,
  options: NormalizedOptions,
): ActionNodeAssignment {
  const partition =
    action.partitionId === undefined
      ? undefined
      : topology.partitions.find(
          (item) =>
            item.partitionId ===
            action.partitionId,
        );

  const explicitlyAssigned =
    action.assignedNodeId === undefined
      ? undefined
      : topology.nodes.find(
          (node) =>
            node.registration.identity.nodeId ===
            action.assignedNodeId,
        );

  if (explicitlyAssigned !== undefined) {
    return deepFreeze({
      action,
      node: explicitlyAssigned,
      ...(partition === undefined
        ? {}
        : { partition }),
    });
  }

  const partitionOwner =
    partition?.ownerNodeId === undefined
      ? undefined
      : topology.nodes.find(
          (node) =>
            node.registration.identity.nodeId ===
            partition.ownerNodeId,
        );

  if (
    partitionOwner !== undefined &&
    nodeCanExecuteAction(
      partitionOwner,
      action,
      policy,
      options,
    )
  ) {
    return deepFreeze({
      action,
      node: partitionOwner,
      partition,
    });
  }

  const candidates = topology.nodes
    .filter((node) =>
      nodeCanExecuteAction(
        node,
        action,
        policy,
        options,
      ),
    )
    .sort((left, right) =>
      compareExecutionNodes(
        left,
        right,
        topology.leaderNodeId,
        action,
      ),
    );

  const selected = candidates[0];

  if (selected === undefined) {
    throw new SwarmExecutionPlannerError(
      "PLANNING_FAILED",
      `No eligible execution node is available for action "${action.actionId}".`,
      {
        actionId: action.actionId,
        partitionId:
          action.partitionId,
      },
    );
  }

  return deepFreeze({
    action,
    node: selected,
    ...(partition === undefined
      ? {}
      : { partition }),
  });
}

function nodeCanExecuteAction(
  node: TradingSwarmNodeState,
  action: TradingSwarmDecisionAction,
  policy: TradingSwarmExecutionPolicy,
  options: NormalizedOptions,
): boolean {
  const authority =
    node.registration.authority;

  if (
    options.requireHealthyAssignedNode &&
    !node.health.healthy
  ) {
    return false;
  }

  if (
    options.requireReadyAssignedNode &&
    node.health.lifecycleState !== "READY" &&
    node.health.lifecycleState !== "ACTIVE"
  ) {
    return false;
  }

  if (
    node.health.availability !== "AVAILABLE" &&
    node.health.availability !== "BUSY"
  ) {
    return false;
  }

  if (
    node.health.readinessScore <
      options.minimumNodeReadiness ||
    node.health.reliabilityScore <
      options.minimumNodeReliability
  ) {
    return false;
  }

  if (
    !authority.mayExecuteTrades &&
    isTradingAction(action.type)
  ) {
    return false;
  }

  if (
    !authority.mayRepartition &&
    action.type === "REPARTITION_SWARM"
  ) {
    return false;
  }

  if (
    !authority.mayMigrateNodes &&
    action.type === "MIGRATE_WORKLOAD"
  ) {
    return false;
  }

  if (
    action.notional !== undefined &&
    authority.maximumCapitalAuthority !==
      undefined &&
    action.notional >
      authority.maximumCapitalAuthority
  ) {
    return false;
  }

  if (
    node.health.activeTaskCount >=
    node.registration.capacity
      .maximumConcurrentTasks
  ) {
    return false;
  }

  if (
    policy.prohibitExecutionOnWarnings &&
    node.health.warnings.length > 0
  ) {
    return false;
  }

  return true;
}

function compareExecutionNodes(
  left: TradingSwarmNodeState,
  right: TradingSwarmNodeState,
  leaderNodeId: TradingSwarmNodeId | undefined,
  action: TradingSwarmDecisionAction,
): number {
  const leftScore = executionNodeScore(
    left,
    leaderNodeId,
    action,
  );

  const rightScore = executionNodeScore(
    right,
    leaderNodeId,
    action,
  );

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return left.registration.identity.nodeId.localeCompare(
    right.registration.identity.nodeId,
  );
}

function executionNodeScore(
  node: TradingSwarmNodeState,
  leaderNodeId: TradingSwarmNodeId | undefined,
  action: TradingSwarmDecisionAction,
): number {
  const roleScore = (() => {
    switch (node.registration.identity.role) {
      case "EXECUTOR":
        return 1;
      case "COORDINATOR":
        return 0.8;
      case "LEADER":
        return 0.75;
      case "WORKER":
        return 0.7;
      case "SUPERVISOR":
        return 0.6;
      case "GOVERNOR":
        return 0.45;
      case "ARBITER":
        return 0.4;
      case "REPLICA":
        return 0.35;
      case "OBSERVER":
        return 0.1;
    }
  })();

  const assignmentBonus =
    action.assignedNodeId ===
    node.registration.identity.nodeId
      ? 1
      : 0;

  const leaderBonus =
    leaderNodeId ===
    node.registration.identity.nodeId
      ? 0.05
      : 0;

  const loadPenalty =
    node.registration.capacity
      .maximumConcurrentTasks <= 0
      ? 1
      : node.health.activeTaskCount /
        node.registration.capacity
          .maximumConcurrentTasks;

  return (
    roleScore * 0.2 +
    node.health.readinessScore * 0.2 +
    node.health.reliabilityScore * 0.25 +
    node.health.synchronizationScore * 0.1 +
    node.health.dataFreshnessScore * 0.1 +
    node.health.throughputScore * 0.1 +
    assignmentBonus * 0.1 +
    leaderBonus -
    loadPenalty * 0.05
  );
}

/* ========================================================================== *
 * Step construction and rollback
 * ========================================================================== */

function createExecutionStep(
  planId: TradingSwarmPlanId,
  assignment: ActionNodeAssignment,
  sequence: number,
  policy: TradingSwarmExecutionPolicy,
  options: NormalizedOptions,
): TradingSwarmExecutionStep {
  const assignedNodeId =
    assignment.node.registration.identity.nodeId;

  const action = deepFreeze({
    ...assignment.action,
    assignedNodeId,
    dependencies: Object.freeze(
      uniqueSorted(
        assignment.action.dependencies,
      ),
    ),
    restrictions: Object.freeze(
      uniqueSorted(
        assignment.action.restrictions,
      ),
    ),
    ...(assignment.action.metadata ===
    undefined
      ? {}
      : {
          metadata: deepFreeze(
            assignment.action.metadata,
          ),
        }),
  });

  const rollbackAction =
    createRollbackAction(
      action,
      assignedNodeId,
      policy,
    );

  const timeoutMs =
    resolveStepTimeout(
      action,
      options,
    );

  const maximumAttempts =
    resolveMaximumAttempts(
      action,
      options,
    );

  const base = {
    stepId: `${planId}-step-${String(
      sequence,
    ).padStart(4, "0")}-${stableHash(
      action.actionId,
    )}`,
    planId,
    sequence,
    action,
    assignedNodeId,
    ...(assignment.partition === undefined
      ? action.partitionId === undefined
        ? {}
        : {
            partitionId:
              action.partitionId,
          }
      : {
          partitionId:
            assignment.partition.partitionId,
        }),
    timeoutMs,
    maximumAttempts,
    ...(rollbackAction === undefined
      ? {}
      : { rollbackAction }),
  } satisfies Omit<
    TradingSwarmExecutionStep,
    "deterministicFingerprint"
  >;

  return deepFreeze({
    ...base,
    deterministicFingerprint:
      `swarm-execution-step-fp-${stableHash(
        stableStringify(base),
      )}`,
  });
}

function createRollbackAction(
  action: TradingSwarmDecisionAction,
  assignedNodeId: TradingSwarmNodeId,
  policy: TradingSwarmExecutionPolicy,
):
  | TradingSwarmDecisionAction
  | undefined {
  const rollbackType =
    resolveRollbackActionType(action.type);

  if (
    rollbackType === undefined &&
    !policy.requireRollbackActions
  ) {
    return undefined;
  }

  const type = rollbackType ?? "NO_ACTION";

  return deepFreeze({
    actionId: `${action.actionId}-rollback`,
    type,
    assignedNodeId,
    ...(action.partitionId === undefined
      ? {}
      : {
          partitionId:
            action.partitionId,
        }),
    ...(action.marketId === undefined
      ? {}
      : { marketId: action.marketId }),
    ...(action.strategyId === undefined
      ? {}
      : {
          strategyId:
            action.strategyId,
        }),
    ...(action.quantity === undefined
      ? {}
      : {
          quantity:
            action.quantity,
        }),
    ...(action.notional === undefined
      ? {}
      : {
          notional:
            action.notional,
        }),
    priority: action.priority,
    dependencies: Object.freeze([]),
    restrictions: Object.freeze(
      uniqueSorted([
        ...action.restrictions,
        `Rollback for action ${action.actionId}.`,
      ]),
    ),
    metadata: deepFreeze({
      rollbackForActionId: action.actionId,
      generatedBy:
        "SwarmExecutionPlanner",
    }),
  });
}

function resolveRollbackActionType(
  type: TradingSwarmDecisionAction["type"],
):
  | TradingSwarmDecisionAction["type"]
  | undefined {
  switch (type) {
    case "PLACE_ORDER":
      return "CANCEL_ORDER";
    case "ALLOCATE_CAPITAL":
      return "REDUCE_EXPOSURE";
    case "ROTATE_STRATEGY":
      return "ROTATE_STRATEGY";
    case "PAUSE_STRATEGY":
      return "RESUME_STRATEGY";
    case "RESUME_STRATEGY":
      return "PAUSE_STRATEGY";
    case "REBALANCE_PORTFOLIO":
      return "REBALANCE_PORTFOLIO";
    case "EXECUTE_ARBITRAGE":
      return "CLOSE_POSITION";
    case "HEDGE_RISK":
      return "CLOSE_POSITION";
    case "REPARTITION_SWARM":
      return "REPARTITION_SWARM";
    case "MIGRATE_WORKLOAD":
      return "MIGRATE_WORKLOAD";
    case "REPLACE_ORDER":
      return "CANCEL_ORDER";
    case "REDUCE_EXPOSURE":
    case "CLOSE_POSITION":
    case "CANCEL_ORDER":
    case "NO_ACTION":
      return undefined;
  }
}

function resolveRollbackRequired(
  steps: readonly TradingSwarmExecutionStep[],
  policy: TradingSwarmExecutionPolicy,
): boolean {
  return (
    policy.requireRollbackActions ||
    steps.some(
      (step) =>
        step.rollbackAction !== undefined,
    )
  );
}

function resolveStepTimeout(
  action: TradingSwarmDecisionAction,
  options: NormalizedOptions,
): number {
  const multiplier = (() => {
    switch (action.type) {
      case "PLACE_ORDER":
      case "CANCEL_ORDER":
      case "REPLACE_ORDER":
        return 1;
      case "ALLOCATE_CAPITAL":
      case "REDUCE_EXPOSURE":
      case "CLOSE_POSITION":
      case "HEDGE_RISK":
        return 1.5;
      case "ROTATE_STRATEGY":
      case "PAUSE_STRATEGY":
      case "RESUME_STRATEGY":
        return 1.25;
      case "REBALANCE_PORTFOLIO":
      case "EXECUTE_ARBITRAGE":
        return 2;
      case "REPARTITION_SWARM":
      case "MIGRATE_WORKLOAD":
        return 3;
      case "NO_ACTION":
        return 1;
    }
  })();

  return Math.min(
    options.maximumStepTimeoutMs,
    Math.max(
      1,
      Math.round(
        options.defaultStepTimeoutMs *
          multiplier,
      ),
    ),
  );
}

function resolveMaximumAttempts(
  action: TradingSwarmDecisionAction,
  options: NormalizedOptions,
): number {
  const attempts =
    action.type === "PLACE_ORDER" ||
    action.type === "EXECUTE_ARBITRAGE"
      ? Math.min(
          2,
          options.defaultMaximumAttempts,
        )
      : options.defaultMaximumAttempts;

  return Math.min(
    options.maximumAttemptsLimit,
    Math.max(1, attempts),
  );
}

/* ========================================================================== *
 * Preconditions, monitoring, and restrictions
 * ========================================================================== */

function buildPreconditions(
  mission: TradingSwarmMission,
  decision: TradingSwarmCollectiveDecision,
  topology: TradingSwarmTopologySnapshot,
  policy: TradingSwarmExecutionPolicy,
  steps: readonly TradingSwarmExecutionStep[],
): readonly string[] {
  return Object.freeze(
    uniqueSorted([
      "The collective decision must remain valid at dispatch time.",
      "The execution policy must remain enabled.",
      "Every assigned node must remain healthy, synchronized, and authorized.",
      "Every action dependency must complete successfully before its dependent step starts.",
      "All governance restrictions must be enforced.",
      `Topology version ${topology.topologyVersion} and epoch ${topology.epoch} must remain compatible with execution.`,
      ...(policy.requireGovernanceApproval
        ? [
            "Governance execution authorization must remain active.",
          ]
        : []),
      ...(mission.deadlineAtMs === undefined
        ? []
        : [
            "Execution must complete before the mission deadline.",
          ]),
      ...(decision.validUntilMs === undefined
        ? []
        : [
            "Execution must start before the collective decision expires.",
          ]),
      ...(steps.some(
        (step) =>
          step.partitionId !== undefined,
      )
        ? [
            "Partition ownership and fencing leases must remain valid.",
          ]
        : []),
    ]),
  );
}

function buildMonitoringRequirements(
  policy: TradingSwarmExecutionPolicy,
  steps: readonly TradingSwarmExecutionStep[],
): readonly string[] {
  return Object.freeze(
    uniqueSorted([
      "Record each step transition and deterministic result.",
      "Monitor assigned-node health and synchronization.",
      "Monitor execution latency, retries, failures, and timeouts.",
      "Monitor aggregate notional and capital-at-risk consumption.",
      "Monitor governance restrictions throughout execution.",
      "Stop dispatch when the plan expires or authorization is withdrawn.",
      ...(policy.requireRollbackActions
        ? [
            "Continuously validate rollback readiness for all reversible steps.",
          ]
        : []),
      ...(steps.some(
        (step) =>
          step.action.type ===
            "PLACE_ORDER" ||
          step.action.type ===
            "REPLACE_ORDER" ||
          step.action.type ===
            "EXECUTE_ARBITRAGE",
      )
        ? [
            "Monitor order acknowledgements, fills, slippage, and exchange reconciliation.",
          ]
        : []),
      ...(steps.some(
        (step) =>
          step.partitionId !== undefined,
      )
        ? [
            "Monitor partition lease ownership, epoch, and fencing-token validity.",
          ]
        : []),
    ]),
  );
}

function deriveExecutionRestrictions(
  policy: TradingSwarmExecutionPolicy,
  topology: TradingSwarmTopologySnapshot,
  steps: readonly TradingSwarmExecutionStep[],
): readonly string[] {
  return Object.freeze(
    uniqueSorted([
      `Maximum concurrent execution steps: ${policy.maximumConcurrentExecutionSteps}.`,
      `Maximum actions per decision: ${policy.maximumActionsPerDecision}.`,
      `Maximum total notional: ${policy.maximumTotalNotional}.`,
      `Execution mode: ${policy.mode}.`,
      `Topology version: ${topology.topologyVersion}.`,
      ...(policy.prohibitExecutionOnWarnings
        ? [
            "Execution must stop when material node warnings are detected.",
          ]
        : []),
      ...(policy.prohibitExecutionWhenDegraded
        ? [
            "Execution must stop when the topology becomes degraded.",
          ]
        : []),
      ...(steps.length >
      policy.maximumConcurrentExecutionSteps
        ? [
            "Steps must be dispatched in bounded concurrent batches.",
          ]
        : []),
    ]),
  );
}

/* ========================================================================== *
 * Assignment denial checks
 * ========================================================================== */

function evaluateAssignmentDenials(
  assignments: readonly ActionNodeAssignment[],
  policy: TradingSwarmExecutionPolicy,
  options: NormalizedOptions,
): readonly PlanningDenial[] {
  const denials: PlanningDenial[] = [];

  for (const assignment of assignments) {
    const node = assignment.node;
    const action = assignment.action;

    if (
      options.requireHealthyAssignedNode &&
      !node.health.healthy
    ) {
      denials.push({
        code: "ASSIGNED_NODE_UNHEALTHY",
        message:
          `Node "${node.registration.identity.nodeId}" is unhealthy for action "${action.actionId}".`,
      });
    }

    if (
      options.requireReadyAssignedNode &&
      node.health.lifecycleState !== "READY" &&
      node.health.lifecycleState !== "ACTIVE"
    ) {
      denials.push({
        code: "ASSIGNED_NODE_NOT_READY",
        message:
          `Node "${node.registration.identity.nodeId}" is not ready for action "${action.actionId}".`,
      });
    }

    if (
      policy.prohibitExecutionOnWarnings &&
      node.health.warnings.length > 0
    ) {
      denials.push({
        code: "ASSIGNED_NODE_WARNINGS",
        message:
          `Node "${node.registration.identity.nodeId}" has execution-blocking warnings.`,
      });
    }

    if (
      assignment.partition !== undefined &&
      assignment.partition.state !==
        "ACTIVE"
    ) {
      denials.push({
        code: "PARTITION_NOT_ACTIVE",
        message:
          `Partition "${assignment.partition.partitionId}" is not active.`,
      });
    }
  }

  return Object.freeze(
    denials
      .map((denial) =>
        deepFreeze(denial),
      )
      .sort((left, right) =>
        left.code.localeCompare(right.code),
      ),
  );
}

/* ========================================================================== *
 * Mode, time, and identity
 * ========================================================================== */

function resolveExecutionMode(
  decision: TradingSwarmCollectiveDecision,
  policy: TradingSwarmExecutionPolicy,
): TradingSwarmExecutionMode {
  if (
    decision.decision === "SIGNAL_ONLY"
  ) {
    return "SIGNAL_ONLY";
  }

  return policy.mode;
}

function resolveCreatedAt(
  mission: TradingSwarmMission,
  decision: TradingSwarmCollectiveDecision,
  topology: TradingSwarmTopologySnapshot,
): TradingSwarmTimestamp {
  return toTradingSwarmTimestamp(
    Math.max(
      Number(mission.createdAtMs),
      Number(decision.decidedAtMs),
      Number(topology.capturedAtMs),
      Number(
        decision.governance.assessedAtMs,
      ),
    ),
  );
}

function resolveExpiresAt(
  mission: TradingSwarmMission,
  decision: TradingSwarmCollectiveDecision,
  createdAtMs: TradingSwarmTimestamp,
  options: NormalizedOptions,
): TradingSwarmTimestamp | undefined {
  const defaultExpiry =
    Number(createdAtMs) +
    Math.min(
      options.defaultPlanValidityWindowMs,
      options.maximumPlanValidityWindowMs,
    );

  const bounds = [
    defaultExpiry,
    ...(mission.deadlineAtMs === undefined
      ? []
      : [Number(mission.deadlineAtMs)]),
    ...(decision.validUntilMs === undefined
      ? []
      : [Number(decision.validUntilMs)]),
  ];

  return toTradingSwarmTimestamp(
    Math.min(...bounds),
  );
}

function createPlanId(
  mission: TradingSwarmMission,
  decision: TradingSwarmCollectiveDecision,
  topology: TradingSwarmTopologySnapshot,
  policy: TradingSwarmExecutionPolicy,
): TradingSwarmPlanId {
  return `swarm-execution-plan-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint:
        mission.deterministicFingerprint,
      decisionId: decision.decisionId,
      decisionFingerprint:
        decision.deterministicFingerprint,
      topologyFingerprint:
        topology.deterministicFingerprint,
      topologyVersion:
        topology.topologyVersion,
      epoch: topology.epoch,
      policy,
    }),
  )}`;
}

/* ========================================================================== *
 * Validation
 * ========================================================================== */

function validateInputs(
  mission: TradingSwarmMission,
  decision: TradingSwarmCollectiveDecision,
  topology: TradingSwarmTopologySnapshot,
  policy: TradingSwarmExecutionPolicy,
): void {
  if (
    mission === undefined ||
    mission === null ||
    typeof mission.missionId !== "string" ||
    mission.missionId.trim().length === 0
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_MISSION",
      "A valid mission is required.",
    );
  }

  if (
    decision === undefined ||
    decision === null ||
    typeof decision.decisionId !==
      "string" ||
    decision.decisionId.trim().length === 0
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_DECISION",
      "A valid collective decision is required.",
      { missionId: mission.missionId },
    );
  }

  if (
    decision.missionId !== mission.missionId ||
    decision.runId !== mission.runId
  ) {
    throw new SwarmExecutionPlannerError(
      "MISSION_MISMATCH",
      "Collective decision does not belong to the supplied mission and run.",
      {
        missionId: mission.missionId,
        decisionId:
          decision.decisionId,
      },
    );
  }

  if (
    topology === undefined ||
    topology === null ||
    typeof topology.swarmId !== "string" ||
    topology.swarmId.trim().length === 0 ||
    !Array.isArray(topology.nodes) ||
    !Array.isArray(topology.partitions)
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_TOPOLOGY",
      "A valid topology snapshot is required.",
      {
        missionId: mission.missionId,
        decisionId:
          decision.decisionId,
      },
    );
  }

  if (
    topology.swarmId !== mission.swarmId
  ) {
    throw new SwarmExecutionPlannerError(
      "SWARM_MISMATCH",
      "Topology snapshot belongs to another swarm.",
      {
        missionId: mission.missionId,
        decisionId:
          decision.decisionId,
      },
    );
  }

  if (
    policy === undefined ||
    policy === null ||
    !Number.isSafeInteger(
      policy.maximumConcurrentExecutionSteps,
    ) ||
    policy.maximumConcurrentExecutionSteps <=
      0 ||
    !Number.isSafeInteger(
      policy.maximumActionsPerDecision,
    ) ||
    policy.maximumActionsPerDecision <= 0 ||
    !Number.isFinite(
      policy.maximumTotalNotional,
    ) ||
    policy.maximumTotalNotional < 0
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_POLICY",
      "Execution policy limits must be valid and non-negative.",
      {
        missionId: mission.missionId,
        decisionId:
          decision.decisionId,
      },
    );
  }

  const actionIds = new Set<string>();

  for (const action of decision.actions) {
    if (
      typeof action.actionId !== "string" ||
      action.actionId.trim().length === 0
    ) {
      throw new SwarmExecutionPlannerError(
        "INVALID_DECISION",
        "Every decision action must have a non-empty actionId.",
        {
          missionId: mission.missionId,
          decisionId:
            decision.decisionId,
        },
      );
    }

    if (actionIds.has(action.actionId)) {
      throw new SwarmExecutionPlannerError(
        "DUPLICATE_ACTION",
        `Duplicate action "${action.actionId}".`,
        {
          missionId: mission.missionId,
          decisionId:
            decision.decisionId,
          actionId: action.actionId,
        },
      );
    }

    actionIds.add(action.actionId);
  }
}

/* ========================================================================== *
 * Dependency and policy helpers
 * ========================================================================== */

function findUnresolvedDependencies(
  actions: readonly TradingSwarmDecisionAction[],
): readonly string[] {
  const actionIds = new Set(
    actions.map((action) => action.actionId),
  );

  return Object.freeze(
    uniqueSorted(
      actions.flatMap((action) =>
        action.dependencies
          .filter(
            (dependencyId) =>
              !actionIds.has(dependencyId),
          )
          .map(
            (dependencyId) =>
              `${action.actionId}->${dependencyId}`,
          ),
      ),
    ),
  );
}

function hasDependencyCycle(
  actions: readonly TradingSwarmDecisionAction[],
): boolean {
  const byId = new Map(
    actions.map((action) => [
      action.actionId,
      action,
    ]),
  );

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (actionId: string): boolean => {
    if (visiting.has(actionId)) {
      return true;
    }

    if (visited.has(actionId)) {
      return false;
    }

    visiting.add(actionId);

    const action = byId.get(actionId);

    if (action !== undefined) {
      for (const dependencyId of action.dependencies) {
        if (
          byId.has(dependencyId) &&
          visit(dependencyId)
        ) {
          return true;
        }
      }
    }

    visiting.delete(actionId);
    visited.add(actionId);

    return false;
  };

  return actions.some((action) =>
    visit(action.actionId),
  );
}

function calculateTotalNotional(
  actions: readonly TradingSwarmDecisionAction[],
): number {
  return actions.reduce(
    (total, action) =>
      total +
      (action.notional !== undefined &&
      Number.isFinite(action.notional)
        ? Math.abs(action.notional)
        : 0),
    0,
  );
}

function deriveProhibitedDecisionActions(
  prohibited:
    readonly string[],
  actions: readonly TradingSwarmDecisionAction[],
): readonly string[] {
  const mapped = new Set<string>();

  for (const action of actions) {
    const category =
      mapDecisionActionToActionType(
        action.type,
      );

    if (prohibited.includes(category)) {
      mapped.add(action.type);
    }
  }

  return Object.freeze([...mapped].sort());
}

function mapDecisionActionToActionType(
  type: TradingSwarmDecisionAction["type"],
): string {
  switch (type) {
    case "REPARTITION_SWARM":
      return "REPARTITION";
    case "MIGRATE_WORKLOAD":
      return "MIGRATE";
    case "CANCEL_ORDER":
      return "CANCEL";
    case "NO_ACTION":
      return "OBSERVE";
    default:
      return "EXECUTE";
  }
}

function isTradingAction(
  type: TradingSwarmDecisionAction["type"],
): boolean {
  return (
    type !== "REPARTITION_SWARM" &&
    type !== "MIGRATE_WORKLOAD" &&
    type !== "NO_ACTION"
  );
}

function compareActions(
  left: TradingSwarmDecisionAction,
  right: TradingSwarmDecisionAction,
): number {
  const priorityDifference =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityDifference !== 0) {
    return priorityDifference;
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
  options: SwarmExecutionPlannerOptions = {},
): NormalizedOptions {
  const defaultStepTimeoutMs =
    normalizePositiveSafeInteger(
      options.defaultStepTimeoutMs,
      30_000,
      "defaultStepTimeoutMs",
    );

  const maximumStepTimeoutMs =
    normalizePositiveSafeInteger(
      options.maximumStepTimeoutMs,
      300_000,
      "maximumStepTimeoutMs",
    );

  const defaultMaximumAttempts =
    normalizePositiveSafeInteger(
      options.defaultMaximumAttempts,
      3,
      "defaultMaximumAttempts",
    );

  const maximumAttemptsLimit =
    normalizePositiveSafeInteger(
      options.maximumAttemptsLimit,
      10,
      "maximumAttemptsLimit",
    );

  const defaultPlanValidityWindowMs =
    normalizePositiveSafeInteger(
      options.defaultPlanValidityWindowMs,
      120_000,
      "defaultPlanValidityWindowMs",
    );

  const maximumPlanValidityWindowMs =
    normalizePositiveSafeInteger(
      options.maximumPlanValidityWindowMs,
      600_000,
      "maximumPlanValidityWindowMs",
    );

  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmExecutionFingerprintGenerator(),
    defaultStepTimeoutMs,
    maximumStepTimeoutMs,
    defaultMaximumAttempts,
    maximumAttemptsLimit,
    defaultPlanValidityWindowMs,
    maximumPlanValidityWindowMs,
    requireHealthyAssignedNode:
      options.requireHealthyAssignedNode ??
      true,
    requireReadyAssignedNode:
      options.requireReadyAssignedNode ??
      true,
    minimumNodeReadiness: normalizeScore(
      options.minimumNodeReadiness,
      0.5,
      "minimumNodeReadiness",
    ),
    minimumNodeReliability: normalizeScore(
      options.minimumNodeReliability,
      0.5,
      "minimumNodeReliability",
    ),
    rejectUnresolvedDependencies:
      options.rejectUnresolvedDependencies ??
      true,
    rejectCyclicDependencies:
      options.rejectCyclicDependencies ??
      true,
    metadata: deepFreeze(
      options.metadata ??
        Object.freeze({}),
    ),
  });
}

function normalizePositiveSafeInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback;

  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_CONFIGURATION",
      `${field} must be a positive safe integer.`,
      { field },
    );
  }

  return resolved;
}

function normalizeScore(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback;

  if (
    !Number.isFinite(resolved) ||
    resolved < 0 ||
    resolved > 1
  ) {
    throw new SwarmExecutionPlannerError(
      "INVALID_CONFIGURATION",
      `${field} must be between 0 and 1.`,
      { field },
    );
  }

  return resolved;
}

export function createSwarmExecutionPlanner(
  options: SwarmExecutionPlannerOptions = {},
): SwarmExecutionPlanner {
  return new SwarmExecutionPlanner(options);
}

export class StableSwarmExecutionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(
    value: unknown,
  ): string {
    return `swarm-execution-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Deterministic immutable utilities
 * ========================================================================== */

function toTradingSwarmTimestamp(
  value: number,
): TradingSwarmTimestamp {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new SwarmExecutionPlannerError(
      "PLANNING_FAILED",
      "Derived timestamp must be a non-negative finite number.",
      { field: "timestamp" },
    );
  }

  return value as TradingSwarmTimestamp;
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
    for (const key of Object.keys(value)) {
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

// End of swarm-execution-planner.ts