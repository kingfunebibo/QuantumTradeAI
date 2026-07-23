/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-local-collective-executor.ts
 *
 * Deterministic integration between an assigned swarm task and the embedded
 * Milestone 38 multi-agent intelligence orchestrator.
 */

import {
  DEFAULT_MULTI_AGENT_CONFIGURATION,
  type AiMultiAgentIntelligenceOrchestratorPort,
  type MultiAgentConfiguration,
  type MultiAgentExecutionOutcome,
  type MultiAgentId,
  type MultiAgentMetadata,
  type MultiAgentRole,
  type MultiAgentRunRequest,
  type MultiAgentTimestamp,
} from "../ai-multi-agent-intelligence/ai-multi-agent-contracts";

import {
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmLocalCollectiveExecutorPort,
  type TradingSwarmLocalCollectiveRun,
  type TradingSwarmMission,
  type TradingSwarmPartitionLease,
  type TradingSwarmTask,
  type TradingSwarmTaskAssignment,
  type TradingSwarmTimestamp,
  type TradingSwarmContext,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors, dependency ports, and options
 * ========================================================================== */

export type SwarmLocalCollectiveExecutorErrorCode =
  | "INVALID_ASSIGNMENT"
  | "INVALID_MISSION"
  | "INVALID_CONTEXT"
  | "ASSIGNMENT_MISSION_MISMATCH"
  | "ASSIGNMENT_NODE_MISMATCH"
  | "ASSIGNMENT_NOT_ACTIVE"
  | "ASSIGNMENT_EXPIRED"
  | "LEASE_REQUIRED"
  | "LEASE_PARTITION_MISMATCH"
  | "LEASE_OWNER_MISMATCH"
  | "LEASE_EXPIRED"
  | "NO_ELIGIBLE_LOCAL_AGENT"
  | "INVALID_MULTI_AGENT_REQUEST"
  | "MULTI_AGENT_EXECUTION_FAILED"
  | "MULTI_AGENT_OUTCOME_MISMATCH"
  | "INVALID_MULTI_AGENT_TIMING"
  | "LOCAL_RUN_VALIDATION_FAILED";

export interface SwarmLocalCollectiveExecutorErrorDetails {
  readonly missionId?: string;
  readonly taskId?: string;
  readonly nodeId?: string;
  readonly partitionId?: string;
  readonly requestId?: string;
  readonly outcomeRunId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmLocalCollectiveExecutorError extends Error {
  public readonly code: SwarmLocalCollectiveExecutorErrorCode;
  public readonly details: SwarmLocalCollectiveExecutorErrorDetails;

  public constructor(
    code: SwarmLocalCollectiveExecutorErrorCode,
    message: string,
    details: SwarmLocalCollectiveExecutorErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmLocalCollectiveExecutorError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmLocalCollectiveExecutorClock {
  now(): TradingSwarmTimestamp;
}

export interface SwarmLocalCollectiveRequestFactory {
  create(
    assignment: TradingSwarmTaskAssignment,
    mission: TradingSwarmMission,
    context: TradingSwarmContext,
    requestedAtMs: TradingSwarmTimestamp,
    configuration: MultiAgentConfiguration,
  ): MultiAgentRunRequest;
}

export interface SwarmLocalCollectiveExecutorDependencies {
  readonly orchestrator: AiMultiAgentIntelligenceOrchestratorPort;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly clock?: SwarmLocalCollectiveExecutorClock;
  readonly requestFactory?: SwarmLocalCollectiveRequestFactory;
}

export interface SwarmLocalCollectiveExecutorOptions {
  readonly configuration?: MultiAgentConfiguration;
  readonly requireAssignedTaskStatus?: boolean;
  readonly requirePartitionLease?: boolean;
  readonly enforceLeaseExpiry?: boolean;
  readonly enforceTaskDeadline?: boolean;
  readonly requireDeterministicNode?: boolean;
  readonly requireReplaySafeNode?: boolean;
  readonly requireDeterministicAgents?: boolean;
  readonly requireReplaySafeAgents?: boolean;
  readonly rejectTerminalFailureOutcome?: boolean;
  readonly useOutcomeTiming?: boolean;
  readonly maximumClockRegressionMs?: number;
}

interface NormalizedDependencies {
  readonly orchestrator: AiMultiAgentIntelligenceOrchestratorPort;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly clock: SwarmLocalCollectiveExecutorClock | undefined;
  readonly requestFactory: SwarmLocalCollectiveRequestFactory;
}

interface NormalizedOptions {
  readonly configuration: MultiAgentConfiguration;
  readonly requireAssignedTaskStatus: boolean;
  readonly requirePartitionLease: boolean;
  readonly enforceLeaseExpiry: boolean;
  readonly enforceTaskDeadline: boolean;
  readonly requireDeterministicNode: boolean;
  readonly requireReplaySafeNode: boolean;
  readonly requireDeterministicAgents: boolean;
  readonly requireReplaySafeAgents: boolean;
  readonly rejectTerminalFailureOutcome: boolean;
  readonly useOutcomeTiming: boolean;
  readonly maximumClockRegressionMs: number;
}

/* ========================================================================== *
 * Executor
 * ========================================================================== */

export class SwarmLocalCollectiveExecutor
  implements TradingSwarmLocalCollectiveExecutorPort
{
  private readonly dependencies: NormalizedDependencies;
  private readonly options: NormalizedOptions;

  public constructor(
    dependencies: SwarmLocalCollectiveExecutorDependencies,
    options: SwarmLocalCollectiveExecutorOptions = {},
  ) {
    this.dependencies = normalizeDependencies(dependencies);
    this.options = normalizeOptions(options);
  }

  public async execute(
    assignment: TradingSwarmTaskAssignment,
    mission: TradingSwarmMission,
    context: TradingSwarmContext,
  ): Promise<TradingSwarmLocalCollectiveRun> {
    try {
      const referenceTime = this.resolveReferenceTime(assignment);

      this.validateExecutionInput(
        assignment,
        mission,
        context,
        referenceTime,
      );

      const request = this.dependencies.requestFactory.create(
        assignment,
        mission,
        context,
        referenceTime,
        this.options.configuration,
      );

      this.validateRequest(
        request,
        assignment,
        mission,
        context,
      );

      const outcome = await this.executeOrchestrator(
        request,
        assignment,
      );

      this.validateOutcome(
        outcome,
        request,
        assignment,
      );

      if (
        this.options.rejectTerminalFailureOutcome &&
        isTerminalFailureOutcome(outcome)
      ) {
        throw new SwarmLocalCollectiveExecutorError(
          "MULTI_AGENT_EXECUTION_FAILED",
          `The local multi-agent run ended with status "${outcome.status}".`,
          {
            missionId: mission.missionId,
            taskId: assignment.task.taskId,
            nodeId: assignment.node.identity.nodeId,
            requestId: request.requestId,
            outcomeRunId: outcome.runId,
          },
        );
      }

      const timing = this.resolveRunTiming(
        assignment,
        outcome,
        referenceTime,
      );

      const selectedAgentIds = extractSelectedAgentIds(
        outcome,
        request.preferredAgentIds ?? [],
      );

      const runBase = {
        nodeId: assignment.node.identity.nodeId,
        missionId: mission.missionId,
        taskId: assignment.task.taskId,
        request: deepFreeze(request),
        outcome: deepFreeze(outcome),
        selectedAgentIds,
        startedAtMs: timing.startedAtMs,
        completedAtMs: timing.completedAtMs,
      } satisfies Omit<
        TradingSwarmLocalCollectiveRun,
        "deterministicFingerprint"
      >;

      const run = deepFreeze<TradingSwarmLocalCollectiveRun>({
        ...runBase,
        deterministicFingerprint:
          this.dependencies.fingerprintGenerator.fingerprint(
            localRunFingerprintInput(runBase),
          ),
      });

      validateLocalRun(run);

      return run;
    } catch (error) {
      if (
        error instanceof
        SwarmLocalCollectiveExecutorError
      ) {
        throw error;
      }

      throw new SwarmLocalCollectiveExecutorError(
        "LOCAL_RUN_VALIDATION_FAILED",
        "Failed to execute the assigned local multi-agent collective.",
        {
          missionId: mission?.missionId,
          taskId: assignment?.task?.taskId,
          nodeId: assignment?.node?.identity?.nodeId,
          cause: error,
        },
      );
    }
  }

  private resolveReferenceTime(
    assignment: TradingSwarmTaskAssignment,
  ): TradingSwarmTimestamp {
    if (this.dependencies.clock !== undefined) {
      return this.dependencies.clock.now();
    }

    return assignment.assignedAtMs;
  }

  private validateExecutionInput(
    assignment: TradingSwarmTaskAssignment,
    mission: TradingSwarmMission,
    context: TradingSwarmContext,
    referenceTime: TradingSwarmTimestamp,
  ): void {
    if (assignment === undefined || assignment === null) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_ASSIGNMENT",
        "A task assignment is required.",
      );
    }

    if (mission === undefined || mission === null) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_MISSION",
        "A swarm mission is required.",
      );
    }

    if (context === undefined || context === null) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_CONTEXT",
        "A swarm context is required.",
      );
    }

    const task = assignment.task;
    const nodeId = assignment.node.identity.nodeId;

    assertNonEmptyText(task.taskId, "assignment.task.taskId");
    assertNonEmptyText(task.missionId, "assignment.task.missionId");
    assertNonEmptyText(task.runId, "assignment.task.runId");
    assertNonEmptyText(nodeId, "assignment.node.identity.nodeId");
    assertTimestamp(referenceTime, "referenceTime");

    if (
      task.missionId !== mission.missionId ||
      task.runId !== mission.runId
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "ASSIGNMENT_MISSION_MISMATCH",
        "The assigned task does not belong to the supplied mission.",
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    if (
      task.assignedNodeId !== undefined &&
      task.assignedNodeId !== nodeId
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "ASSIGNMENT_NODE_MISMATCH",
        "The task assignedNodeId does not match the assignment node.",
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    if (
      this.options.requireAssignedTaskStatus &&
      task.status !== "ASSIGNED"
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "ASSIGNMENT_NOT_ACTIVE",
        `Task "${task.taskId}" must be in ASSIGNED status before execution.`,
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    if (
      this.options.enforceTaskDeadline &&
      task.deadlineAtMs !== undefined &&
      referenceTime > task.deadlineAtMs
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "ASSIGNMENT_EXPIRED",
        `Task "${task.taskId}" is past its deadline.`,
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    if (
      this.options.requireDeterministicNode &&
      !assignment.node.deterministic
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_ASSIGNMENT",
        `Assigned node "${nodeId}" is not deterministic.`,
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    if (
      this.options.requireReplaySafeNode &&
      !assignment.node.replaySafe
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_ASSIGNMENT",
        `Assigned node "${nodeId}" is not replay-safe.`,
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    if (
      context.topology.swarmId !== mission.swarmId ||
      mission.context.topology.swarmId !== mission.swarmId
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_CONTEXT",
        "The mission and execution context do not belong to the same swarm.",
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }

    this.validateLease(
      task,
      assignment.lease,
      nodeId,
      referenceTime,
    );

    const eligibleAgents = selectEligibleAgents(
      assignment,
      this.options,
    );

    if (eligibleAgents.length === 0) {
      throw new SwarmLocalCollectiveExecutorError(
        "NO_ELIGIBLE_LOCAL_AGENT",
        `Node "${nodeId}" has no eligible local multi-agent registrations.`,
        {
          missionId: mission.missionId,
          taskId: task.taskId,
          nodeId,
        },
      );
    }
  }

  private validateLease(
    task: TradingSwarmTask,
    lease: TradingSwarmPartitionLease | undefined,
    nodeId: string,
    referenceTime: TradingSwarmTimestamp,
  ): void {
    if (task.partitionId === undefined) {
      return;
    }

    if (
      lease === undefined &&
      this.options.requirePartitionLease
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "LEASE_REQUIRED",
        `Task "${task.taskId}" requires an active partition lease.`,
        {
          taskId: task.taskId,
          nodeId,
          partitionId: task.partitionId,
        },
      );
    }

    if (lease === undefined) {
      return;
    }

    if (lease.partitionId !== task.partitionId) {
      throw new SwarmLocalCollectiveExecutorError(
        "LEASE_PARTITION_MISMATCH",
        "The assignment lease does not match the task partition.",
        {
          taskId: task.taskId,
          nodeId,
          partitionId: task.partitionId,
        },
      );
    }

    if (lease.ownerNodeId !== nodeId) {
      throw new SwarmLocalCollectiveExecutorError(
        "LEASE_OWNER_MISMATCH",
        "The assignment node does not own the supplied partition lease.",
        {
          taskId: task.taskId,
          nodeId,
          partitionId: task.partitionId,
        },
      );
    }

    if (
      this.options.enforceLeaseExpiry &&
      referenceTime > lease.expiresAtMs
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "LEASE_EXPIRED",
        `The lease for partition "${lease.partitionId}" has expired.`,
        {
          taskId: task.taskId,
          nodeId,
          partitionId: task.partitionId,
        },
      );
    }
  }

  private validateRequest(
    request: MultiAgentRunRequest,
    assignment: TradingSwarmTaskAssignment,
    mission: TradingSwarmMission,
    context: TradingSwarmContext,
  ): void {
    if (request === undefined || request === null) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_MULTI_AGENT_REQUEST",
        "The request factory returned no multi-agent request.",
        {
          missionId: mission.missionId,
          taskId: assignment.task.taskId,
          nodeId: assignment.node.identity.nodeId,
        },
      );
    }

    assertNonEmptyText(request.requestId, "request.requestId");
    assertTimestamp(request.requestedAtMs, "request.requestedAtMs");

    if (
      request.context.deterministicFingerprint !==
      context.multiAgentContext.deterministicFingerprint
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_MULTI_AGENT_REQUEST",
        "The generated request does not use the supplied multi-agent context.",
        {
          missionId: mission.missionId,
          taskId: assignment.task.taskId,
          nodeId: assignment.node.identity.nodeId,
          requestId: request.requestId,
        },
      );
    }

    const localAgentIds = new Set(
      assignment.node.agents.map(
        (agent) => agent.identity.agentId,
      ),
    );

    for (const agentId of request.preferredAgentIds ?? []) {
      if (!localAgentIds.has(agentId)) {
        throw new SwarmLocalCollectiveExecutorError(
          "INVALID_MULTI_AGENT_REQUEST",
          `Preferred agent "${agentId}" is not registered on the assigned node.`,
          {
            missionId: mission.missionId,
            taskId: assignment.task.taskId,
            nodeId: assignment.node.identity.nodeId,
            requestId: request.requestId,
          },
        );
      }
    }
  }

  private async executeOrchestrator(
    request: MultiAgentRunRequest,
    assignment: TradingSwarmTaskAssignment,
  ): Promise<MultiAgentExecutionOutcome> {
    try {
      return await this.dependencies.orchestrator.run(request);
    } catch (error) {
      throw new SwarmLocalCollectiveExecutorError(
        "MULTI_AGENT_EXECUTION_FAILED",
        "The embedded multi-agent orchestrator threw during execution.",
        {
          missionId: assignment.task.missionId,
          taskId: assignment.task.taskId,
          nodeId: assignment.node.identity.nodeId,
          requestId: request.requestId,
          cause: error,
        },
      );
    }
  }

  private validateOutcome(
    outcome: MultiAgentExecutionOutcome,
    request: MultiAgentRunRequest,
    assignment: TradingSwarmTaskAssignment,
  ): void {
    if (outcome === undefined || outcome === null) {
      throw new SwarmLocalCollectiveExecutorError(
        "MULTI_AGENT_EXECUTION_FAILED",
        "The embedded multi-agent orchestrator returned no outcome.",
        {
          missionId: assignment.task.missionId,
          taskId: assignment.task.taskId,
          nodeId: assignment.node.identity.nodeId,
          requestId: request.requestId,
        },
      );
    }

    if (outcome.requestId !== request.requestId) {
      throw new SwarmLocalCollectiveExecutorError(
        "MULTI_AGENT_OUTCOME_MISMATCH",
        "The multi-agent outcome requestId does not match the submitted request.",
        {
          missionId: assignment.task.missionId,
          taskId: assignment.task.taskId,
          nodeId: assignment.node.identity.nodeId,
          requestId: request.requestId,
          outcomeRunId: outcome.runId,
        },
      );
    }

    assertNonEmptyText(outcome.runId, "outcome.runId");
    assertNonEmptyText(
      outcome.deterministicFingerprint,
      "outcome.deterministicFingerprint",
    );

    if ("selectedAgents" in outcome) {
      const localAgentIds = new Set(
        assignment.node.agents.map(
          (agent) => agent.identity.agentId,
        ),
      );

      for (const agent of outcome.selectedAgents) {
        if (!localAgentIds.has(agent.identity.agentId)) {
          throw new SwarmLocalCollectiveExecutorError(
            "MULTI_AGENT_OUTCOME_MISMATCH",
            `Outcome agent "${agent.identity.agentId}" is not local to the assigned node.`,
            {
              missionId: assignment.task.missionId,
              taskId: assignment.task.taskId,
              nodeId: assignment.node.identity.nodeId,
              requestId: request.requestId,
              outcomeRunId: outcome.runId,
            },
          );
        }
      }
    }
  }

  private resolveRunTiming(
    assignment: TradingSwarmTaskAssignment,
    outcome: MultiAgentExecutionOutcome,
    referenceTime: TradingSwarmTimestamp,
  ): Readonly<{
    startedAtMs: TradingSwarmTimestamp;
    completedAtMs: TradingSwarmTimestamp;
  }> {
    let startedAtMs = referenceTime;
    let completedAtMs = referenceTime;

    if (
      this.options.useOutcomeTiming &&
      "startedAtMs" in outcome &&
      "completedAtMs" in outcome
    ) {
      startedAtMs = outcome.startedAtMs as TradingSwarmTimestamp;
      completedAtMs = outcome.completedAtMs as TradingSwarmTimestamp;
    } else if (this.dependencies.clock !== undefined) {
      completedAtMs = this.dependencies.clock.now();
    }

    assertTimestamp(startedAtMs, "startedAtMs");
    assertTimestamp(completedAtMs, "completedAtMs");

    if (
      completedAtMs + this.options.maximumClockRegressionMs <
      startedAtMs
    ) {
      throw new SwarmLocalCollectiveExecutorError(
        "INVALID_MULTI_AGENT_TIMING",
        "The local collective completion time precedes its start time.",
        {
          missionId: assignment.task.missionId,
          taskId: assignment.task.taskId,
          nodeId: assignment.node.identity.nodeId,
          outcomeRunId: outcome.runId,
        },
      );
    }

    if (completedAtMs < startedAtMs) {
      completedAtMs = startedAtMs;
    }

    return Object.freeze({
      startedAtMs,
      completedAtMs,
    });
  }
}

/* ========================================================================== *
 * Default request factory
 * ========================================================================== */

export class DefaultSwarmLocalCollectiveRequestFactory
  implements SwarmLocalCollectiveRequestFactory
{
  public create(
    assignment: TradingSwarmTaskAssignment,
    mission: TradingSwarmMission,
    context: TradingSwarmContext,
    requestedAtMs: TradingSwarmTimestamp,
    configuration: MultiAgentConfiguration,
  ): MultiAgentRunRequest {
    const eligibleAgents = selectEligibleAgents(
      assignment,
      {
        requireDeterministicAgents:
          configuration.requireDeterministicAgents,
        requireReplaySafeAgents: true,
      },
    );

    const preferredAgentIds = Object.freeze(
      eligibleAgents
        .map((agent) => agent.identity.agentId)
        .sort((left, right) => left.localeCompare(right)),
    );

    const requiredRoles = deriveRequiredRoles(
      assignment.task,
      eligibleAgents.map((agent) => agent.identity.role),
    );

    const metadata: MultiAgentMetadata = deepFreeze({
      swarmId: mission.swarmId,
      swarmMissionId: mission.missionId,
      swarmRunId: mission.runId,
      swarmTaskId: assignment.task.taskId,
      swarmTaskType: assignment.task.type,
      swarmNodeId: assignment.node.identity.nodeId,
      swarmPartitionId: assignment.task.partitionId ?? null,
      swarmAssignmentFingerprint:
        assignment.deterministicFingerprint,
      swarmMissionFingerprint:
        mission.deterministicFingerprint,
      swarmContextFingerprint:
        context.deterministicFingerprint,
      taskInputFingerprint:
        assignment.task.inputFingerprint,
      taskPriority: assignment.task.priority,
    });

    const request: MultiAgentRunRequest = {
      requestId: createRequestId(
        assignment,
        mission,
      ),
      requestedAtMs: requestedAtMs as MultiAgentTimestamp,
      ...(mission.portfolioId === undefined
        ? {}
        : { portfolioId: mission.portfolioId }),
      objective: mapMissionObjective(
        mission.objective,
        assignment.task.type,
      ),
      context: context.multiAgentContext,
      configuration,
      preferredAgentIds,
      excludedAgentIds: Object.freeze([]),
      ...(requiredRoles.length === 0
        ? {}
        : { requiredRoles }),
      metadata,
    };

    return deepFreeze(request);
  }
}

/* ========================================================================== *
 * Factory and deterministic dependencies
 * ========================================================================== */

export function createSwarmLocalCollectiveExecutor(
  dependencies: SwarmLocalCollectiveExecutorDependencies,
  options: SwarmLocalCollectiveExecutorOptions = {},
): SwarmLocalCollectiveExecutor {
  return new SwarmLocalCollectiveExecutor(
    dependencies,
    options,
  );
}

export class StableSwarmLocalCollectiveFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-local-run-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

export class FixedSwarmLocalCollectiveClock
  implements SwarmLocalCollectiveExecutorClock
{
  public constructor(
    private readonly timestamp: TradingSwarmTimestamp,
  ) {
    assertTimestamp(timestamp, "timestamp");
  }

  public now(): TradingSwarmTimestamp {
    return this.timestamp;
  }
}

/* ========================================================================== *
 * Agent selection and objective mapping
 * ========================================================================== */

function selectEligibleAgents(
  assignment: TradingSwarmTaskAssignment,
  options: Pick<
    NormalizedOptions,
    | "requireDeterministicAgents"
    | "requireReplaySafeAgents"
  >,
): readonly TradingSwarmTaskAssignment["node"]["agents"][number][] {
  return Object.freeze(
    assignment.node.agents
      .filter((agent) => {
        if (
          options.requireDeterministicAgents &&
          !agent.deterministic
        ) {
          return false;
        }

        if (
          options.requireReplaySafeAgents &&
          !agent.replaySafe
        ) {
          return false;
        }

        return true;
      })
      .sort((left, right) =>
        left.identity.agentId.localeCompare(
          right.identity.agentId,
        ),
      ),
  );
}

function deriveRequiredRoles(
  task: TradingSwarmTask,
  availableRoles: readonly MultiAgentRole[],
): readonly MultiAgentRole[] {
  const candidates = taskTypeRoles(task.type);
  const available = new Set(availableRoles);

  return Object.freeze(
    candidates
      .filter((role) => available.has(role))
      .sort((left, right) => left.localeCompare(right)),
  );
}

function taskTypeRoles(
  taskType: TradingSwarmTask["type"],
): readonly MultiAgentRole[] {
  switch (taskType) {
    case "BUILD_GLOBAL_CONTEXT":
    case "ANALYZE_PARTITION":
      return Object.freeze([
        "MARKET_INTELLIGENCE_AGENT",
        "REGIME_ANALYSIS_AGENT",
      ]);
    case "RUN_MULTI_AGENT_COLLECTIVE":
    case "FORM_LOCAL_DECISION":
    case "FORM_GLOBAL_CONSENSUS":
      return Object.freeze([
        "CONSENSUS_COORDINATOR_AGENT",
        "CONFLICT_ARBITER_AGENT",
      ]);
    case "DISCOVER_OPPORTUNITIES":
      return Object.freeze([
        "ARBITRAGE_AGENT",
        "MARKET_INTELLIGENCE_AGENT",
      ]);
    case "ASSESS_SYSTEMIC_RISK":
      return Object.freeze(["RISK_AGENT"]);
    case "ASSESS_LIQUIDITY":
      return Object.freeze([
        "LIQUIDITY_AGENT",
        "ORDER_FLOW_AGENT",
      ]);
    case "ASSESS_PORTFOLIO":
      return Object.freeze([
        "PORTFOLIO_CONSTRUCTION_AGENT",
        "STRATEGY_PORTFOLIO_AGENT",
      ]);
    case "ASSESS_STRATEGIES":
      return Object.freeze([
        "STRATEGY_SELECTION_AGENT",
        "STRATEGY_PORTFOLIO_AGENT",
      ]);
    case "EVALUATE_GOVERNANCE":
      return Object.freeze([
        "GOVERNANCE_AGENT",
      ]);
    case "PLAN_DISTRIBUTED_EXECUTION":
    case "EXECUTE_ACTION":
    case "MONITOR_EXECUTION":
    case "ROLLBACK_ACTION":
      return Object.freeze([
        "EXECUTION_AGENT",
        "RISK_AGENT",
      ]);
    case "LEARN_FROM_OUTCOME":
      return Object.freeze([
        "META_LEARNING_AGENT",
        "REINFORCEMENT_AGENT",
      ]);
    case "REPLICATE_STATE":
    case "CHECKPOINT_STATE":
    case "RECOVER_PARTITION":
      return Object.freeze([]);
  }
}

function mapMissionObjective(
  objective: TradingSwarmMission["objective"],
  taskType: TradingSwarmTask["type"],
): MultiAgentRunRequest["objective"] {
  if (
    taskType === "EXECUTE_ACTION" ||
    taskType === "MONITOR_EXECUTION" ||
    taskType === "ROLLBACK_ACTION" ||
    taskType === "PLAN_DISTRIBUTED_EXECUTION"
  ) {
    return "EXECUTION_REVIEW";
  }

  switch (objective) {
    case "GLOBAL_MARKET_ASSESSMENT":
    case "REGIME_TRANSITION_RESPONSE":
    case "LIQUIDITY_COORDINATION":
      return "MARKET_ASSESSMENT";
    case "DISTRIBUTED_TRADE_DECISION":
      return "TRADE_DECISION";
    case "CROSS_MARKET_STRATEGY_SELECTION":
    case "AUTONOMOUS_SWARM_OPTIMIZATION":
      return "STRATEGY_ORCHESTRATION";
    case "DISTRIBUTED_PORTFOLIO_REBALANCE":
      return "PORTFOLIO_REBALANCE";
    case "SYSTEMIC_RISK_RESPONSE":
    case "DISASTER_RECOVERY":
      return "RISK_RESPONSE";
    case "DISTRIBUTED_ARBITRAGE_DISCOVERY":
    case "CROSS_EXCHANGE_EXECUTION":
      return "ARBITRAGE_DECISION";
    case "FULL_SWARM_DECISION":
      return "FULL_COLLABORATIVE_DECISION";
  }
}

/* ========================================================================== *
 * Outcome and run helpers
 * ========================================================================== */

function isTerminalFailureOutcome(
  outcome: MultiAgentExecutionOutcome,
): boolean {
  return (
    outcome.status === "FAILED" ||
    outcome.status === "REJECTED" ||
    outcome.status === "CANCELLED"
  );
}

function extractSelectedAgentIds(
  outcome: MultiAgentExecutionOutcome,
  fallbackIds: readonly MultiAgentId[],
): readonly MultiAgentId[] {
  if ("selectedAgents" in outcome) {
    return Object.freeze(
      outcome.selectedAgents
        .map((agent) => agent.identity.agentId)
        .sort((left, right) => left.localeCompare(right)),
    );
  }

  return Object.freeze(
    [...fallbackIds].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function localRunFingerprintInput(
  run: Omit<
    TradingSwarmLocalCollectiveRun,
    "deterministicFingerprint"
  >,
): unknown {
  return {
    nodeId: run.nodeId,
    missionId: run.missionId,
    taskId: run.taskId,
    requestId: run.request.requestId,
    requestedAtMs: run.request.requestedAtMs,
    requestObjective: run.request.objective,
    preferredAgentIds:
      run.request.preferredAgentIds ?? [],
    outcomeRunId: run.outcome.runId,
    outcomeStatus: run.outcome.status,
    outcomeFingerprint:
      run.outcome.deterministicFingerprint,
    selectedAgentIds: run.selectedAgentIds,
    startedAtMs: run.startedAtMs,
    completedAtMs: run.completedAtMs,
  };
}

function validateLocalRun(
  run: TradingSwarmLocalCollectiveRun,
): void {
  assertNonEmptyText(run.nodeId, "run.nodeId");
  assertNonEmptyText(run.missionId, "run.missionId");
  assertNonEmptyText(run.taskId, "run.taskId");
  assertNonEmptyText(
    run.deterministicFingerprint,
    "run.deterministicFingerprint",
  );
  assertTimestamp(run.startedAtMs, "run.startedAtMs");
  assertTimestamp(run.completedAtMs, "run.completedAtMs");

  if (run.completedAtMs < run.startedAtMs) {
    throw new SwarmLocalCollectiveExecutorError(
      "INVALID_MULTI_AGENT_TIMING",
      "The completed local run precedes its start time.",
      {
        missionId: run.missionId,
        taskId: run.taskId,
        nodeId: run.nodeId,
        outcomeRunId: run.outcome.runId,
      },
    );
  }

  if (run.outcome.requestId !== run.request.requestId) {
    throw new SwarmLocalCollectiveExecutorError(
      "MULTI_AGENT_OUTCOME_MISMATCH",
      "The completed local run contains mismatched request identifiers.",
      {
        missionId: run.missionId,
        taskId: run.taskId,
        nodeId: run.nodeId,
        requestId: run.request.requestId,
        outcomeRunId: run.outcome.runId,
      },
    );
  }
}

/* ========================================================================== *
 * Normalization and request identity
 * ========================================================================== */

function normalizeDependencies(
  dependencies: SwarmLocalCollectiveExecutorDependencies,
): NormalizedDependencies {
  if (
    dependencies === undefined ||
    dependencies === null ||
    dependencies.orchestrator === undefined
  ) {
    throw new SwarmLocalCollectiveExecutorError(
      "INVALID_ASSIGNMENT",
      "An AI multi-agent intelligence orchestrator dependency is required.",
    );
  }

  return Object.freeze({
    orchestrator: dependencies.orchestrator,
    fingerprintGenerator:
      dependencies.fingerprintGenerator ??
      new StableSwarmLocalCollectiveFingerprintGenerator(),
    clock: dependencies.clock,
    requestFactory:
      dependencies.requestFactory ??
      new DefaultSwarmLocalCollectiveRequestFactory(),
  });
}

function normalizeOptions(
  options: SwarmLocalCollectiveExecutorOptions,
): NormalizedOptions {
  const maximumClockRegressionMs =
    options.maximumClockRegressionMs ?? 0;

  if (
    !Number.isSafeInteger(maximumClockRegressionMs) ||
    maximumClockRegressionMs < 0
  ) {
    throw new SwarmLocalCollectiveExecutorError(
      "INVALID_MULTI_AGENT_TIMING",
      "maximumClockRegressionMs must be a non-negative safe integer.",
      { field: "maximumClockRegressionMs" },
    );
  }

  return Object.freeze({
    configuration: deepFreeze(
      options.configuration ??
        DEFAULT_MULTI_AGENT_CONFIGURATION,
    ),
    requireAssignedTaskStatus:
      options.requireAssignedTaskStatus ?? true,
    requirePartitionLease:
      options.requirePartitionLease ?? true,
    enforceLeaseExpiry:
      options.enforceLeaseExpiry ?? true,
    enforceTaskDeadline:
      options.enforceTaskDeadline ?? true,
    requireDeterministicNode:
      options.requireDeterministicNode ?? true,
    requireReplaySafeNode:
      options.requireReplaySafeNode ?? true,
    requireDeterministicAgents:
      options.requireDeterministicAgents ?? true,
    requireReplaySafeAgents:
      options.requireReplaySafeAgents ?? true,
    rejectTerminalFailureOutcome:
      options.rejectTerminalFailureOutcome ?? false,
    useOutcomeTiming:
      options.useOutcomeTiming ?? true,
    maximumClockRegressionMs,
  });
}

function createRequestId(
  assignment: TradingSwarmTaskAssignment,
  mission: TradingSwarmMission,
): string {
  return `multi-agent-request-${stableHash(
    stableStringify({
      swarmId: mission.swarmId,
      missionId: mission.missionId,
      runId: mission.runId,
      taskId: assignment.task.taskId,
      taskInputFingerprint:
        assignment.task.inputFingerprint,
      nodeId: assignment.node.identity.nodeId,
      assignmentFingerprint:
        assignment.deterministicFingerprint,
    }),
  )}`;
}

/* ========================================================================== *
 * Generic deterministic utilities
 * ========================================================================== */

function assertNonEmptyText(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new SwarmLocalCollectiveExecutorError(
      "LOCAL_RUN_VALIDATION_FAILED",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertTimestamp(
  value: number,
  field: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new SwarmLocalCollectiveExecutorError(
      "INVALID_MULTI_AGENT_TIMING",
      `${field} must be a non-negative safe integer timestamp.`,
      { field },
    );
  }
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
    for (const key of Object.keys(value as object)) {
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}

function stableStringify(value: unknown): string {
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
    return value.map(normalizeForStableJson);
  }

  if (value instanceof Set) {
    return [...value]
      .map(normalizeForStableJson)
      .sort(compareNormalizedValues);
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(String(right)),
      )
      .map(([key, item]) => [
        normalizeForStableJson(key),
        normalizeForStableJson(item),
      ]);
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      output[key] = normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}

function compareNormalizedValues(
  left: unknown,
  right: unknown,
): number {
  return JSON.stringify(left).localeCompare(
    JSON.stringify(right),
  );
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

// End of swarm-local-collective-executor.ts