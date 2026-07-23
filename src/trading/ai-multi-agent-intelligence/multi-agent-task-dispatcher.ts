/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-task-dispatcher.ts
 *
 * Deterministic, dependency-aware task dispatch and observation collection.
 */

import {
  type MultiAgentCapability,
  type MultiAgentId,
  type MultiAgentKnowledgeId,
  type MultiAgentObservation,
  type MultiAgentObservationType,
  type MultiAgentRegistration,
  type MultiAgentSystemContext,
  type MultiAgentTask,
  type MultiAgentTaskDispatcherPort,
  type MultiAgentTaskId,
  type MultiAgentTaskStatus,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentTaskDispatcherErrorCode =
  | "INVALID_DISPATCH_REQUEST"
  | "DUPLICATE_TASK_ID"
  | "TASK_AGENT_NOT_FOUND"
  | "TASK_HANDLER_NOT_FOUND"
  | "TASK_AGENT_MISMATCH"
  | "TASK_CAPABILITY_MISMATCH"
  | "TASK_DEPENDENCY_NOT_FOUND"
  | "TASK_DEPENDENCY_CYCLE"
  | "TASK_DEPENDENCY_FAILED"
  | "TASK_DEADLINE_EXCEEDED"
  | "TASK_EXECUTION_FAILED"
  | "INVALID_OBSERVATION"
  | "DUPLICATE_OBSERVATION_ID"
  | "DISPATCH_ABORTED";

export interface MultiAgentTaskDispatcherErrorDetails {
  readonly taskId?: MultiAgentTaskId;
  readonly agentId?: MultiAgentId;
  readonly dependencyTaskId?: MultiAgentTaskId;
  readonly requiredCapability?: MultiAgentCapability;
  readonly observationId?: MultiAgentKnowledgeId;
  readonly cause?: unknown;
}

export class MultiAgentTaskDispatcherError extends Error {
  public readonly code: MultiAgentTaskDispatcherErrorCode;
  public readonly details: MultiAgentTaskDispatcherErrorDetails;

  public constructor(
    code: MultiAgentTaskDispatcherErrorCode,
    message: string,
    details: MultiAgentTaskDispatcherErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentTaskDispatcherError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentTaskExecutionRequest {
  readonly task: MultiAgentTask;
  readonly agent: MultiAgentRegistration;
  readonly context: MultiAgentSystemContext;
  readonly dependencyObservations: readonly MultiAgentObservation[];
  readonly dispatchedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentTaskExecutionResult {
  readonly taskId: MultiAgentTaskId;
  readonly status: Extract<
    MultiAgentTaskStatus,
    "COMPLETED" | "REJECTED" | "FAILED" | "CANCELLED" | "TIMED_OUT"
  >;
  readonly observations: readonly MultiAgentObservation[];
  readonly completedAtMs: MultiAgentTimestamp;
  readonly warnings?: readonly string[];
  readonly deterministicFingerprint: string;
}

export interface MultiAgentTaskAgentHandler {
  readonly agentId: MultiAgentId;
  readonly deterministic: boolean;
  readonly replaySafe: boolean;
  readonly supportedCapabilities?: readonly MultiAgentCapability[];

  execute(
    request: MultiAgentTaskExecutionRequest,
  ): Promise<MultiAgentTaskExecutionResult> | MultiAgentTaskExecutionResult;
}

export interface MultiAgentTaskDispatcherClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentTaskDispatcherOptions {
  readonly handlers?: readonly MultiAgentTaskAgentHandler[];
  readonly clock?: MultiAgentTaskDispatcherClock;
  readonly maximumConcurrentTasks?: number;
  readonly failFast?: boolean;
  readonly requireDeterministicHandlers?: boolean;
  readonly requireReplaySafeHandlers?: boolean;
  readonly validateAgentCapabilities?: boolean;
  readonly enforceDeadlines?: boolean;
  readonly allowRejectedDependencies?: boolean;
  readonly fingerprintFactory?: (value: unknown) => string;
}

export interface MultiAgentTaskDispatchRecord {
  readonly taskId: MultiAgentTaskId;
  readonly agentId: MultiAgentId;
  readonly status: MultiAgentTaskStatus;
  readonly startedAtMs: MultiAgentTimestamp;
  readonly completedAtMs: MultiAgentTimestamp;
  readonly observationIds: readonly MultiAgentKnowledgeId[];
  readonly warnings: readonly string[];
  readonly deterministicFingerprint: string;
}

export interface MultiAgentTaskDispatchSnapshot {
  readonly records: readonly MultiAgentTaskDispatchRecord[];
  readonly completedTaskIds: readonly MultiAgentTaskId[];
  readonly failedTaskIds: readonly MultiAgentTaskId[];
  readonly generatedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly clock: MultiAgentTaskDispatcherClock;
  readonly maximumConcurrentTasks: number;
  readonly failFast: boolean;
  readonly requireDeterministicHandlers: boolean;
  readonly requireReplaySafeHandlers: boolean;
  readonly validateAgentCapabilities: boolean;
  readonly enforceDeadlines: boolean;
  readonly allowRejectedDependencies: boolean;
  readonly fingerprintFactory: (value: unknown) => string;
}

interface TaskNode {
  readonly task: MultiAgentTask;
  readonly dependencies: readonly MultiAgentTaskId[];
  readonly dependents: readonly MultiAgentTaskId[];
}

interface DispatchState {
  readonly resultsByTaskId: Map<MultiAgentTaskId, MultiAgentTaskExecutionResult>;
  readonly observationsByTaskId: Map<
    MultiAgentTaskId,
    readonly MultiAgentObservation[]
  >;
  readonly recordsByTaskId: Map<MultiAgentTaskId, MultiAgentTaskDispatchRecord>;
  readonly observationIds: Set<MultiAgentKnowledgeId>;
  aborted: boolean;
}

const DEFAULT_OPTIONS = Object.freeze({
  maximumConcurrentTasks: 4,
  failFast: true,
  requireDeterministicHandlers: true,
  requireReplaySafeHandlers: true,
  validateAgentCapabilities: true,
  enforceDeadlines: true,
  allowRejectedDependencies: false,
});

const TASK_TYPE_TO_OBSERVATION_TYPE: Readonly<
  Partial<Record<MultiAgentTask["type"], MultiAgentObservationType>>
> = Object.freeze({
  ANALYZE_CONTEXT: "SYSTEM_STATE",
  ASSESS_MARKET: "MARKET_STATE",
  ASSESS_RISK: "RISK_STATE",
  ASSESS_PORTFOLIO: "PORTFOLIO_STATE",
  ASSESS_STRATEGY: "STRATEGY_STATE",
  ASSESS_ARBITRAGE: "ARBITRAGE_STATE",
  EVALUATE_GOVERNANCE: "GOVERNANCE_STATE",
  BUILD_EXECUTION_PLAN: "EXECUTION_STATE",
});

export class MultiAgentTaskDispatcher implements MultiAgentTaskDispatcherPort {
  private readonly handlers = new Map<
    MultiAgentId,
    MultiAgentTaskAgentHandler
  >();

  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentTaskDispatchSnapshot;

  public constructor(options: MultiAgentTaskDispatcherOptions = {}) {
    this.options = normalizeOptions(options);

    for (const handler of options.handlers ?? []) {
      this.registerHandler(handler);
    }

    this.lastSnapshotValue = deepFreeze({
      records: Object.freeze([]),
      completedTaskIds: Object.freeze([]),
      failedTaskIds: Object.freeze([]),
      deterministicFingerprint: this.options.fingerprintFactory({
        records: [],
        completedTaskIds: [],
        failedTaskIds: [],
      }),
    });
  }

  public registerHandler(handler: MultiAgentTaskAgentHandler): void {
    validateHandler(handler, this.options);

    if (this.handlers.has(handler.agentId)) {
      throw new MultiAgentTaskDispatcherError(
        "INVALID_DISPATCH_REQUEST",
        `A task handler is already registered for agent "${handler.agentId}".`,
        { agentId: handler.agentId },
      );
    }

    this.handlers.set(handler.agentId, handler);
  }

  public replaceHandler(handler: MultiAgentTaskAgentHandler): void {
    validateHandler(handler, this.options);
    this.handlers.set(handler.agentId, handler);
  }

  public unregisterHandler(agentId: MultiAgentId): void {
    this.handlers.delete(agentId);
  }

  public getHandler(
    agentId: MultiAgentId,
  ): MultiAgentTaskAgentHandler | undefined {
    return this.handlers.get(agentId);
  }

  public listHandlers(): readonly MultiAgentTaskAgentHandler[] {
    return Object.freeze(
      [...this.handlers.values()].sort((left, right) =>
        left.agentId.localeCompare(right.agentId),
      ),
    );
  }

  public snapshot(): MultiAgentTaskDispatchSnapshot {
    return this.lastSnapshotValue;
  }

  public async dispatch(
    tasks: readonly MultiAgentTask[],
    agents: readonly MultiAgentRegistration[],
    context: MultiAgentSystemContext,
  ): Promise<readonly MultiAgentObservation[]> {
    validateDispatchInputs(tasks, agents);

    if (tasks.length === 0) {
      this.lastSnapshotValue = deepFreeze({
        records: Object.freeze([]),
        completedTaskIds: Object.freeze([]),
        failedTaskIds: Object.freeze([]),
        generatedAtMs: this.options.clock.now(),
        deterministicFingerprint: this.options.fingerprintFactory({
          tasks: [],
          observations: [],
        }),
      });

      return Object.freeze([]);
    }

    const agentById = new Map<MultiAgentId, MultiAgentRegistration>();
    for (const agent of agents) {
      agentById.set(agent.identity.agentId, agent);
    }

    const graph = buildTaskGraph(tasks);
    validateAcyclicGraph(graph);

    for (const task of tasks) {
      validateTaskDispatchability(
        task,
        agentById.get(task.assignedAgentId),
        this.handlers.get(task.assignedAgentId),
        this.options,
      );
    }

    const state: DispatchState = {
      resultsByTaskId: new Map(),
      observationsByTaskId: new Map(),
      recordsByTaskId: new Map(),
      observationIds: new Set(),
      aborted: false,
    };

    const pending = new Set(tasks.map((task) => task.taskId));
    const running = new Map<MultiAgentTaskId, Promise<void>>();

    while (pending.size > 0 || running.size > 0) {
      if (state.aborted) {
        throw new MultiAgentTaskDispatcherError(
          "DISPATCH_ABORTED",
          "Task dispatch was aborted after a task failure.",
        );
      }

      const ready = [...pending]
        .map((taskId) => graph.get(taskId))
        .filter((node): node is TaskNode => node !== undefined)
        .filter((node) =>
          node.dependencies.every((dependencyTaskId) =>
            state.resultsByTaskId.has(dependencyTaskId),
          ),
        )
        .sort(compareTaskNodes);

      let scheduled = false;

      for (const node of ready) {
        if (running.size >= this.options.maximumConcurrentTasks) {
          break;
        }

        pending.delete(node.task.taskId);
        scheduled = true;

        const execution = this.executeNode(
          node,
          graph,
          agentById,
          context,
          state,
        )
          .catch((error: unknown) => {
            if (this.options.failFast) {
              state.aborted = true;
            }

            if (error instanceof MultiAgentTaskDispatcherError) {
              throw error;
            }

            throw new MultiAgentTaskDispatcherError(
              "TASK_EXECUTION_FAILED",
              `Task "${node.task.taskId}" failed during dispatch.`,
              {
                taskId: node.task.taskId,
                agentId: node.task.assignedAgentId,
                cause: error,
              },
            );
          })
          .finally(() => {
            running.delete(node.task.taskId);
          });

        running.set(node.task.taskId, execution);
      }

      if (running.size === 0 && pending.size > 0 && !scheduled) {
        const blockedTaskId = [...pending].sort()[0];
        throw new MultiAgentTaskDispatcherError(
          "TASK_DEPENDENCY_FAILED",
          `No pending task can be scheduled; task "${blockedTaskId}" is blocked.`,
          { taskId: blockedTaskId },
        );
      }

      if (running.size > 0) {
        await Promise.race(running.values());
      }
    }

    const observations = tasks
      .flatMap((task) => state.observationsByTaskId.get(task.taskId) ?? [])
      .sort(compareObservations);

    const records = tasks
      .map((task) => state.recordsByTaskId.get(task.taskId))
      .filter(
        (record): record is MultiAgentTaskDispatchRecord =>
          record !== undefined,
      );

    const completedTaskIds = records
      .filter((record) => record.status === "COMPLETED")
      .map((record) => record.taskId);

    const failedTaskIds = records
      .filter((record) =>
        record.status === "FAILED" ||
        record.status === "REJECTED" ||
        record.status === "CANCELLED" ||
        record.status === "TIMED_OUT",
      )
      .map((record) => record.taskId);

    this.lastSnapshotValue = deepFreeze({
      records: Object.freeze(records),
      completedTaskIds: Object.freeze(completedTaskIds),
      failedTaskIds: Object.freeze(failedTaskIds),
      generatedAtMs: this.options.clock.now(),
      deterministicFingerprint: this.options.fingerprintFactory({
        records,
        completedTaskIds,
        failedTaskIds,
        observations,
      }),
    });

    return deepFreeze(Object.freeze(observations));
  }

  private async executeNode(
    node: TaskNode,
    graph: ReadonlyMap<MultiAgentTaskId, TaskNode>,
    agentById: ReadonlyMap<MultiAgentId, MultiAgentRegistration>,
    context: MultiAgentSystemContext,
    state: DispatchState,
  ): Promise<void> {
    const task = node.task;
    const agent = agentById.get(task.assignedAgentId);
    const handler = this.handlers.get(task.assignedAgentId);

    if (agent === undefined) {
      throw new MultiAgentTaskDispatcherError(
        "TASK_AGENT_NOT_FOUND",
        `Assigned agent "${task.assignedAgentId}" was not supplied.`,
        { taskId: task.taskId, agentId: task.assignedAgentId },
      );
    }

    if (handler === undefined) {
      throw new MultiAgentTaskDispatcherError(
        "TASK_HANDLER_NOT_FOUND",
        `No task handler is registered for agent "${task.assignedAgentId}".`,
        { taskId: task.taskId, agentId: task.assignedAgentId },
      );
    }

    const dependencyResults = node.dependencies.map((dependencyTaskId) => {
      const result = state.resultsByTaskId.get(dependencyTaskId);

      if (result === undefined) {
        throw new MultiAgentTaskDispatcherError(
          "TASK_DEPENDENCY_NOT_FOUND",
          `Dependency result "${dependencyTaskId}" is unavailable.`,
          {
            taskId: task.taskId,
            dependencyTaskId,
          },
        );
      }

      return result;
    });

    const failedDependency = dependencyResults.find(
      (result) =>
        result.status !== "COMPLETED" &&
        !(this.options.allowRejectedDependencies &&
          result.status === "REJECTED"),
    );

    if (failedDependency !== undefined) {
      throw new MultiAgentTaskDispatcherError(
        "TASK_DEPENDENCY_FAILED",
        `Task "${task.taskId}" depends on unsuccessful task "${failedDependency.taskId}".`,
        {
          taskId: task.taskId,
          dependencyTaskId: failedDependency.taskId,
        },
      );
    }

    const startedAtMs = this.options.clock.now();

    if (
      this.options.enforceDeadlines &&
      task.deadlineAtMs !== undefined &&
      startedAtMs > task.deadlineAtMs
    ) {
      const timedOutResult: MultiAgentTaskExecutionResult = deepFreeze({
        taskId: task.taskId,
        status: "TIMED_OUT",
        observations: Object.freeze([]),
        completedAtMs: startedAtMs,
        warnings: Object.freeze(["Task deadline elapsed before execution."]),
        deterministicFingerprint: this.options.fingerprintFactory({
          taskId: task.taskId,
          status: "TIMED_OUT",
          startedAtMs,
        }),
      });

      state.resultsByTaskId.set(task.taskId, timedOutResult);
      state.observationsByTaskId.set(task.taskId, Object.freeze([]));
      state.recordsByTaskId.set(
        task.taskId,
        buildRecord(task, startedAtMs, timedOutResult, this.options),
      );

      if (this.options.failFast) {
        state.aborted = true;
      }

      return;
    }

    const dependencyObservations = Object.freeze(
      node.dependencies
        .flatMap(
          (dependencyTaskId) =>
            state.observationsByTaskId.get(dependencyTaskId) ?? [],
        )
        .sort(compareObservations),
    );

    const deterministicFingerprint = this.options.fingerprintFactory({
      task,
      agentId: agent.identity.agentId,
      contextFingerprint: context.deterministicFingerprint,
      dependencyObservationIds: dependencyObservations.map(
        (observation) => observation.observationId,
      ),
    });

    let result: MultiAgentTaskExecutionResult;

    try {
      result = await handler.execute(
        deepFreeze({
          task,
          agent,
          context,
          dependencyObservations,
          dispatchedAtMs: startedAtMs,
          deterministicFingerprint,
        }),
      );
    } catch (error: unknown) {
      throw new MultiAgentTaskDispatcherError(
        "TASK_EXECUTION_FAILED",
        `Handler for agent "${agent.identity.agentId}" failed task "${task.taskId}".`,
        {
          taskId: task.taskId,
          agentId: agent.identity.agentId,
          cause: error,
        },
      );
    }

    validateExecutionResult(result, task, agent);

    if (
      this.options.enforceDeadlines &&
      task.deadlineAtMs !== undefined &&
      result.completedAtMs > task.deadlineAtMs &&
      result.status === "COMPLETED"
    ) {
      result = deepFreeze({
        ...result,
        status: "TIMED_OUT",
        observations: Object.freeze([]),
        warnings: Object.freeze([
          ...(result.warnings ?? []),
          "Task completed after its deadline and was converted to TIMED_OUT.",
        ]),
        deterministicFingerprint: this.options.fingerprintFactory({
          originalFingerprint: result.deterministicFingerprint,
          status: "TIMED_OUT",
          deadlineAtMs: task.deadlineAtMs,
          completedAtMs: result.completedAtMs,
        }),
      });
    }

    const observations = validateAndFreezeObservations(
      result.observations,
      task,
      agent,
      state.observationIds,
    );

    const normalizedResult = deepFreeze({
      ...result,
      observations:
        result.status === "COMPLETED"
          ? observations
          : Object.freeze([]),
      warnings: Object.freeze([...(result.warnings ?? [])].sort()),
    });

    state.resultsByTaskId.set(task.taskId, normalizedResult);
    state.observationsByTaskId.set(
      task.taskId,
      normalizedResult.observations,
    );
    state.recordsByTaskId.set(
      task.taskId,
      buildRecord(task, startedAtMs, normalizedResult, this.options),
    );

    if (
      normalizedResult.status !== "COMPLETED" &&
      this.options.failFast
    ) {
      state.aborted = true;
    }

    void graph;
  }
}

export function createMultiAgentTaskDispatcher(
  options: MultiAgentTaskDispatcherOptions = {},
): MultiAgentTaskDispatcher {
  return new MultiAgentTaskDispatcher(options);
}

function validateDispatchInputs(
  tasks: readonly MultiAgentTask[],
  agents: readonly MultiAgentRegistration[],
): void {
  if (!Array.isArray(tasks)) {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_DISPATCH_REQUEST",
      "tasks must be an array.",
    );
  }

  if (!Array.isArray(agents)) {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_DISPATCH_REQUEST",
      "agents must be an array.",
    );
  }

  const taskIds = new Set<MultiAgentTaskId>();
  for (const task of tasks) {
    if (taskIds.has(task.taskId)) {
      throw new MultiAgentTaskDispatcherError(
        "DUPLICATE_TASK_ID",
        `Duplicate task id "${task.taskId}".`,
        { taskId: task.taskId },
      );
    }

    taskIds.add(task.taskId);

    if (
      task.status !== "ASSIGNED" &&
      task.status !== "CREATED"
    ) {
      throw new MultiAgentTaskDispatcherError(
        "INVALID_DISPATCH_REQUEST",
        `Task "${task.taskId}" must be CREATED or ASSIGNED before dispatch.`,
        { taskId: task.taskId },
      );
    }
  }
}

function validateTaskDispatchability(
  task: MultiAgentTask,
  agent: MultiAgentRegistration | undefined,
  handler: MultiAgentTaskAgentHandler | undefined,
  options: NormalizedOptions,
): void {
  if (agent === undefined) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_AGENT_NOT_FOUND",
      `Assigned agent "${task.assignedAgentId}" was not supplied.`,
      { taskId: task.taskId, agentId: task.assignedAgentId },
    );
  }

  if (handler === undefined) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_HANDLER_NOT_FOUND",
      `No task handler is registered for agent "${task.assignedAgentId}".`,
      { taskId: task.taskId, agentId: task.assignedAgentId },
    );
  }

  if (handler.agentId !== task.assignedAgentId) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_AGENT_MISMATCH",
      `Handler agent "${handler.agentId}" does not match task assignment "${task.assignedAgentId}".`,
      {
        taskId: task.taskId,
        agentId: handler.agentId,
      },
    );
  }

  if (options.validateAgentCapabilities) {
    const enabledCapabilities = new Set(
      agent.capabilities
        .filter((capability) => capability.enabled)
        .map((capability) => capability.capability),
    );

    for (const capability of task.requiredCapabilities) {
      if (!enabledCapabilities.has(capability)) {
        throw new MultiAgentTaskDispatcherError(
          "TASK_CAPABILITY_MISMATCH",
          `Agent "${agent.identity.agentId}" lacks required capability "${capability}".`,
          {
            taskId: task.taskId,
            agentId: agent.identity.agentId,
            requiredCapability: capability,
          },
        );
      }

      if (
        handler.supportedCapabilities !== undefined &&
        !handler.supportedCapabilities.includes(capability)
      ) {
        throw new MultiAgentTaskDispatcherError(
          "TASK_CAPABILITY_MISMATCH",
          `Handler for agent "${agent.identity.agentId}" does not support capability "${capability}".`,
          {
            taskId: task.taskId,
            agentId: agent.identity.agentId,
            requiredCapability: capability,
          },
        );
      }
    }
  }
}

function validateHandler(
  handler: MultiAgentTaskAgentHandler,
  options: NormalizedOptions,
): void {
  if (
    typeof handler.agentId !== "string" ||
    handler.agentId.trim().length === 0
  ) {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_DISPATCH_REQUEST",
      "Handler agentId must be a non-empty string.",
    );
  }

  if (typeof handler.execute !== "function") {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_DISPATCH_REQUEST",
      `Handler "${handler.agentId}" must define execute().`,
      { agentId: handler.agentId },
    );
  }

  if (options.requireDeterministicHandlers && !handler.deterministic) {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_DISPATCH_REQUEST",
      `Handler "${handler.agentId}" must be deterministic.`,
      { agentId: handler.agentId },
    );
  }

  if (options.requireReplaySafeHandlers && !handler.replaySafe) {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_DISPATCH_REQUEST",
      `Handler "${handler.agentId}" must be replay-safe.`,
      { agentId: handler.agentId },
    );
  }
}

function buildTaskGraph(
  tasks: readonly MultiAgentTask[],
): ReadonlyMap<MultiAgentTaskId, TaskNode> {
  const taskById = new Map<MultiAgentTaskId, MultiAgentTask>();
  const dependents = new Map<MultiAgentTaskId, MultiAgentTaskId[]>();

  for (const task of tasks) {
    taskById.set(task.taskId, task);
    dependents.set(task.taskId, []);
  }

  for (const task of tasks) {
    for (const dependencyTaskId of task.dependencies) {
      if (!taskById.has(dependencyTaskId)) {
        throw new MultiAgentTaskDispatcherError(
          "TASK_DEPENDENCY_NOT_FOUND",
          `Task "${task.taskId}" references missing dependency "${dependencyTaskId}".`,
          {
            taskId: task.taskId,
            dependencyTaskId,
          },
        );
      }

      if (dependencyTaskId === task.taskId) {
        throw new MultiAgentTaskDispatcherError(
          "TASK_DEPENDENCY_CYCLE",
          `Task "${task.taskId}" cannot depend on itself.`,
          { taskId: task.taskId },
        );
      }

      dependents.get(dependencyTaskId)?.push(task.taskId);
    }
  }

  return new Map(
    tasks.map((task) => [
      task.taskId,
      deepFreeze({
        task,
        dependencies: Object.freeze([...task.dependencies].sort()),
        dependents: Object.freeze(
          [...(dependents.get(task.taskId) ?? [])].sort(),
        ),
      }),
    ]),
  );
}

function validateAcyclicGraph(
  graph: ReadonlyMap<MultiAgentTaskId, TaskNode>,
): void {
  const permanent = new Set<MultiAgentTaskId>();
  const temporary = new Set<MultiAgentTaskId>();

  const visit = (taskId: MultiAgentTaskId): void => {
    if (permanent.has(taskId)) {
      return;
    }

    if (temporary.has(taskId)) {
      throw new MultiAgentTaskDispatcherError(
        "TASK_DEPENDENCY_CYCLE",
        `Cyclic task dependency detected at "${taskId}".`,
        { taskId },
      );
    }

    temporary.add(taskId);

    const node = graph.get(taskId);
    for (const dependencyTaskId of node?.dependencies ?? []) {
      visit(dependencyTaskId);
    }

    temporary.delete(taskId);
    permanent.add(taskId);
  };

  for (const taskId of [...graph.keys()].sort()) {
    visit(taskId);
  }
}

function validateExecutionResult(
  result: MultiAgentTaskExecutionResult,
  task: MultiAgentTask,
  agent: MultiAgentRegistration,
): void {
  if (result.taskId !== task.taskId) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_AGENT_MISMATCH",
      `Handler result taskId "${result.taskId}" does not match "${task.taskId}".`,
      {
        taskId: task.taskId,
        agentId: agent.identity.agentId,
      },
    );
  }

  if (
    result.status !== "COMPLETED" &&
    result.status !== "REJECTED" &&
    result.status !== "FAILED" &&
    result.status !== "CANCELLED" &&
    result.status !== "TIMED_OUT"
  ) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_EXECUTION_FAILED",
      `Task "${task.taskId}" returned unsupported terminal status "${String(
        result.status,
      )}".`,
      { taskId: task.taskId, agentId: agent.identity.agentId },
    );
  }

  if (
    !Number.isSafeInteger(result.completedAtMs) ||
    result.completedAtMs < 0
  ) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_EXECUTION_FAILED",
      `Task "${task.taskId}" returned an invalid completedAtMs.`,
      { taskId: task.taskId, agentId: agent.identity.agentId },
    );
  }

  if (
    typeof result.deterministicFingerprint !== "string" ||
    result.deterministicFingerprint.trim().length === 0
  ) {
    throw new MultiAgentTaskDispatcherError(
      "TASK_EXECUTION_FAILED",
      `Task "${task.taskId}" returned an invalid deterministic fingerprint.`,
      { taskId: task.taskId, agentId: agent.identity.agentId },
    );
  }
}

function validateAndFreezeObservations(
  observations: readonly MultiAgentObservation[],
  task: MultiAgentTask,
  agent: MultiAgentRegistration,
  observationIds: Set<MultiAgentKnowledgeId>,
): readonly MultiAgentObservation[] {
  if (!Array.isArray(observations)) {
    throw new MultiAgentTaskDispatcherError(
      "INVALID_OBSERVATION",
      `Task "${task.taskId}" observations must be an array.`,
      { taskId: task.taskId, agentId: agent.identity.agentId },
    );
  }

  const expectedType = TASK_TYPE_TO_OBSERVATION_TYPE[task.type];
  const normalized = [...observations].sort(compareObservations);

  for (const observation of normalized) {
    if (
      typeof observation.observationId !== "string" ||
      observation.observationId.trim().length === 0
    ) {
      throw new MultiAgentTaskDispatcherError(
        "INVALID_OBSERVATION",
        `Task "${task.taskId}" returned an invalid observation id.`,
        { taskId: task.taskId, agentId: agent.identity.agentId },
      );
    }

    if (observationIds.has(observation.observationId)) {
      throw new MultiAgentTaskDispatcherError(
        "DUPLICATE_OBSERVATION_ID",
        `Duplicate observation id "${observation.observationId}".`,
        {
          taskId: task.taskId,
          agentId: agent.identity.agentId,
          observationId: observation.observationId,
        },
      );
    }

    if (observation.agentId !== task.assignedAgentId) {
      throw new MultiAgentTaskDispatcherError(
        "INVALID_OBSERVATION",
        `Observation "${observation.observationId}" was produced by unexpected agent "${observation.agentId}".`,
        {
          taskId: task.taskId,
          agentId: observation.agentId,
          observationId: observation.observationId,
        },
      );
    }

    if (
      typeof observation.summary !== "string" ||
      observation.summary.trim().length === 0
    ) {
      throw new MultiAgentTaskDispatcherError(
        "INVALID_OBSERVATION",
        `Observation "${observation.observationId}" has an empty summary.`,
        {
          taskId: task.taskId,
          agentId: observation.agentId,
          observationId: observation.observationId,
        },
      );
    }

    if (
      expectedType !== undefined &&
      observation.type !== expectedType
    ) {
      throw new MultiAgentTaskDispatcherError(
        "INVALID_OBSERVATION",
        `Observation "${observation.observationId}" has type "${observation.type}", expected "${expectedType}".`,
        {
          taskId: task.taskId,
          agentId: observation.agentId,
          observationId: observation.observationId,
        },
      );
    }

    observationIds.add(observation.observationId);
    deepFreeze(observation);
  }

  return Object.freeze(normalized);
}

function buildRecord(
  task: MultiAgentTask,
  startedAtMs: MultiAgentTimestamp,
  result: MultiAgentTaskExecutionResult,
  options: NormalizedOptions,
): MultiAgentTaskDispatchRecord {
  const observationIds = Object.freeze(
    result.observations.map((observation) => observation.observationId),
  );
  const warnings = Object.freeze([...(result.warnings ?? [])].sort());

  return deepFreeze({
    taskId: task.taskId,
    agentId: task.assignedAgentId,
    status: result.status,
    startedAtMs,
    completedAtMs: result.completedAtMs,
    observationIds,
    warnings,
    deterministicFingerprint: options.fingerprintFactory({
      taskId: task.taskId,
      agentId: task.assignedAgentId,
      status: result.status,
      startedAtMs,
      completedAtMs: result.completedAtMs,
      observationIds,
      warnings,
      resultFingerprint: result.deterministicFingerprint,
    }),
  });
}

function compareTaskNodes(left: TaskNode, right: TaskNode): number {
  const leftDeadline =
    left.task.deadlineAtMs ?? (Number.MAX_SAFE_INTEGER as MultiAgentTimestamp);
  const rightDeadline =
    right.task.deadlineAtMs ?? (Number.MAX_SAFE_INTEGER as MultiAgentTimestamp);

  if (leftDeadline !== rightDeadline) {
    return leftDeadline - rightDeadline;
  }

  return left.task.taskId.localeCompare(right.task.taskId);
}

function compareObservations(
  left: MultiAgentObservation,
  right: MultiAgentObservation,
): number {
  if (left.observedAtMs !== right.observedAtMs) {
    return left.observedAtMs - right.observedAtMs;
  }

  const agentDifference = left.agentId.localeCompare(right.agentId);
  if (agentDifference !== 0) {
    return agentDifference;
  }

  return left.observationId.localeCompare(right.observationId);
}

function normalizeOptions(
  options: MultiAgentTaskDispatcherOptions,
): NormalizedOptions {
  const maximumConcurrentTasks =
    options.maximumConcurrentTasks ??
    DEFAULT_OPTIONS.maximumConcurrentTasks;

  if (
    !Number.isInteger(maximumConcurrentTasks) ||
    maximumConcurrentTasks <= 0
  ) {
    throw new RangeError(
      "maximumConcurrentTasks must be a positive integer.",
    );
  }

  return Object.freeze({
    clock: options.clock ?? createSystemClock(),
    maximumConcurrentTasks,
    failFast: options.failFast ?? DEFAULT_OPTIONS.failFast,
    requireDeterministicHandlers:
      options.requireDeterministicHandlers ??
      DEFAULT_OPTIONS.requireDeterministicHandlers,
    requireReplaySafeHandlers:
      options.requireReplaySafeHandlers ??
      DEFAULT_OPTIONS.requireReplaySafeHandlers,
    validateAgentCapabilities:
      options.validateAgentCapabilities ??
      DEFAULT_OPTIONS.validateAgentCapabilities,
    enforceDeadlines:
      options.enforceDeadlines ?? DEFAULT_OPTIONS.enforceDeadlines,
    allowRejectedDependencies:
      options.allowRejectedDependencies ??
      DEFAULT_OPTIONS.allowRejectedDependencies,
    fingerprintFactory:
      options.fingerprintFactory ?? defaultFingerprintFactory,
  });
}

function createSystemClock(): MultiAgentTaskDispatcherClock {
  return Object.freeze({
    now: () => Date.now() as MultiAgentTimestamp,
  });
}

function defaultFingerprintFactory(value: unknown): string {
  return `fnv1a64:${fnv1a64(canonicalStringify(value))}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
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

  return hash.toString(16).padStart(16, "0");
}

function canonicalStringify(value: unknown): string {
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
      throw new TypeError("Cannot fingerprint a non-finite number.");
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, item]) => [String(key), canonicalize(item)] as const)
      .sort(([left], [right]) => left.localeCompare(right));
  }

  if (value instanceof Set) {
    return [...value.values()]
      .map((item) => canonicalize(item))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }

  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
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

  throw new TypeError(`Unsupported fingerprint value type: ${typeof value}.`);
}

function deepFreeze<TValue>(value: TValue): TValue {
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
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return Object.freeze(value);
}