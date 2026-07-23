/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-task-planner.ts
 *
 * Deterministic, immutable, partition-aware task planning for trading-swarm
 * missions. Produces a stable directed acyclic task graph with objective-aware
 * capabilities, priorities, deadlines, retry limits, and input fingerprints.
 */

import {
  type TradingSwarmCapability,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmIdGenerator,
  type TradingSwarmMetadata,
  type TradingSwarmMission,
  type TradingSwarmPartition,
  type TradingSwarmPartitionId,
  type TradingSwarmPriority,
  type TradingSwarmTask,
  type TradingSwarmTaskDependency,
  type TradingSwarmTaskId,
  type TradingSwarmTaskPlannerPort,
  type TradingSwarmTaskType,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmTaskPlannerErrorCode =
  | "INVALID_MISSION"
  | "INVALID_TOPOLOGY"
  | "INVALID_PARTITIONS"
  | "SWARM_MISMATCH"
  | "MISSION_PARTITION_MISSING"
  | "INVALID_TASK_DURATION"
  | "INVALID_RETRY_CONFIGURATION"
  | "CYCLIC_DEPENDENCY"
  | "DUPLICATE_TASK_ID"
  | "TASK_PLANNING_FAILED";

export interface SwarmTaskPlannerErrorDetails {
  readonly missionId?: string;
  readonly runId?: string;
  readonly swarmId?: string;
  readonly partitionId?: string;
  readonly field?: string;
  readonly taskId?: string;
  readonly cause?: unknown;
}

export class SwarmTaskPlannerError extends Error {
  public readonly code: SwarmTaskPlannerErrorCode;
  public readonly details: SwarmTaskPlannerErrorDetails;

  public constructor(
    code: SwarmTaskPlannerErrorCode,
    message: string,
    details: SwarmTaskPlannerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmTaskPlannerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmTaskPlannerOptions {
  readonly idGenerator?: TradingSwarmIdGenerator;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly maximumAttempts?: number;
  readonly recoveryMaximumAttempts?: number;
  readonly defaultTaskDurationMs?: number;
  readonly minimumTaskDurationMs?: number;
  readonly includeContextBuildTask?: boolean;
  readonly includeCheckpointTask?: boolean;
  readonly includeLearningTask?: boolean;
  readonly includeRecoveryTasks?: boolean;
  readonly includeRollbackTask?: boolean;
  readonly createPartitionTasksForAllMissionPartitions?: boolean;
}

interface NormalizedOptions {
  readonly idGenerator: TradingSwarmIdGenerator;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly maximumAttempts: number;
  readonly recoveryMaximumAttempts: number;
  readonly defaultTaskDurationMs: number;
  readonly minimumTaskDurationMs: number;
  readonly includeContextBuildTask: boolean;
  readonly includeCheckpointTask: boolean;
  readonly includeLearningTask: boolean;
  readonly includeRecoveryTasks: boolean;
  readonly includeRollbackTask: boolean;
  readonly createPartitionTasksForAllMissionPartitions: boolean;
}

interface TaskBlueprint {
  readonly key: string;
  readonly type: TradingSwarmTaskType;
  readonly priority: TradingSwarmPriority;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly dependencyKeys: readonly string[];
  readonly optionalDependencyKeys?: readonly string[];
  readonly maximumAttempts?: number;
  readonly durationMs?: number;
  readonly metadata?: TradingSwarmMetadata;
}

/* ========================================================================== *
 * Planner
 * ========================================================================== */

export class SwarmTaskPlanner
  implements TradingSwarmTaskPlannerPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmTaskPlannerOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public create(
    mission: TradingSwarmMission,
    topology: TradingSwarmTopologySnapshot,
    partitions: readonly TradingSwarmPartition[],
  ): readonly TradingSwarmTask[] {
    try {
      this.validateInputs(
        mission,
        topology,
        partitions,
      );

      const selectedPartitions =
        this.selectMissionPartitions(
          mission,
          partitions,
        );

      const blueprints = this.createBlueprints(
        mission,
        topology,
        selectedPartitions,
      );

      validateBlueprintGraph(blueprints);

      const taskIdsByKey = new Map<
        string,
        TradingSwarmTaskId
      >();

      for (const blueprint of blueprints) {
        taskIdsByKey.set(
          blueprint.key,
          this.options.idGenerator.generate(
            "swarm-task",
            stableStringify({
              missionId: mission.missionId,
              runId: mission.runId,
              key: blueprint.key,
              type: blueprint.type,
              partitionId: blueprint.partitionId,
            }),
          ),
        );
      }

      const tasks = blueprints.map(
        (blueprint) =>
          this.materializeTask(
            mission,
            topology,
            blueprint,
            taskIdsByKey,
          ),
      );

      validateTaskGraph(tasks);

      return Object.freeze(
        tasks.sort(compareTasks),
      );
    } catch (error) {
      if (error instanceof SwarmTaskPlannerError) {
        throw error;
      }

      throw new SwarmTaskPlannerError(
        "TASK_PLANNING_FAILED",
        "Failed to create a deterministic swarm task graph.",
        {
          missionId: mission?.missionId,
          runId: mission?.runId,
          swarmId: mission?.swarmId,
          cause: error,
        },
      );
    }
  }

  private validateInputs(
    mission: TradingSwarmMission,
    topology: TradingSwarmTopologySnapshot,
    partitions: readonly TradingSwarmPartition[],
  ): void {
    if (mission === undefined || mission === null) {
      throw new SwarmTaskPlannerError(
        "INVALID_MISSION",
        "A trading-swarm mission is required.",
      );
    }

    assertNonEmptyText(
      mission.missionId,
      "mission.missionId",
    );
    assertNonEmptyText(
      mission.runId,
      "mission.runId",
    );
    assertNonEmptyText(
      mission.swarmId,
      "mission.swarmId",
    );
    assertTimestamp(
      mission.createdAtMs,
      "mission.createdAtMs",
    );

    if (
      topology === undefined ||
      topology === null
    ) {
      throw new SwarmTaskPlannerError(
        "INVALID_TOPOLOGY",
        "A topology snapshot is required.",
        { missionId: mission.missionId },
      );
    }

    if (
      mission.swarmId !== topology.swarmId ||
      mission.context.topology.swarmId !==
        topology.swarmId
    ) {
      throw new SwarmTaskPlannerError(
        "SWARM_MISMATCH",
        "Mission, mission context, and topology must belong to the same swarm.",
        {
          missionId: mission.missionId,
          swarmId: mission.swarmId,
        },
      );
    }

    const seenPartitionIds = new Set<string>();

    for (const partition of partitions) {
      if (
        partition.swarmId !== mission.swarmId
      ) {
        throw new SwarmTaskPlannerError(
          "SWARM_MISMATCH",
          `Partition "${partition.partitionId}" belongs to another swarm.`,
          {
            missionId: mission.missionId,
            partitionId:
              partition.partitionId,
          },
        );
      }

      if (
        seenPartitionIds.has(
          partition.partitionId,
        )
      ) {
        throw new SwarmTaskPlannerError(
          "INVALID_PARTITIONS",
          `Duplicate partition "${partition.partitionId}".`,
          {
            missionId: mission.missionId,
            partitionId:
              partition.partitionId,
          },
        );
      }

      seenPartitionIds.add(
        partition.partitionId,
      );
    }

    if (
      mission.deadlineAtMs !== undefined &&
      mission.deadlineAtMs <=
        mission.createdAtMs
    ) {
      throw new SwarmTaskPlannerError(
        "INVALID_TASK_DURATION",
        "Mission deadline must be later than mission creation time.",
        { missionId: mission.missionId },
      );
    }
  }

  private selectMissionPartitions(
    mission: TradingSwarmMission,
    partitions: readonly TradingSwarmPartition[],
  ): readonly TradingSwarmPartition[] {
    const byId = new Map(
      partitions.map((partition) => [
        partition.partitionId,
        partition,
      ]),
    );

    const selected: TradingSwarmPartition[] = [];

    for (const partitionId of mission.partitionIds) {
      const partition = byId.get(partitionId);

      if (partition === undefined) {
        throw new SwarmTaskPlannerError(
          "MISSION_PARTITION_MISSING",
          `Mission partition "${partitionId}" was not supplied to the task planner.`,
          {
            missionId: mission.missionId,
            partitionId,
          },
        );
      }

      selected.push(partition);
    }

    if (
      this.options
        .createPartitionTasksForAllMissionPartitions
    ) {
      return Object.freeze(
        selected.sort(comparePartitions),
      );
    }

    return Object.freeze(
      selected
        .filter(
          (partition) =>
            partition.state !== "RETIRED" &&
            partition.state !== "QUARANTINED",
        )
        .sort(comparePartitions),
    );
  }

  private createBlueprints(
    mission: TradingSwarmMission,
    topology: TradingSwarmTopologySnapshot,
    partitions: readonly TradingSwarmPartition[],
  ): readonly TaskBlueprint[] {
    const blueprints: TaskBlueprint[] = [];
    const contextKey = "context:global";

    if (this.options.includeContextBuildTask) {
      blueprints.push({
        key: contextKey,
        type: "BUILD_GLOBAL_CONTEXT",
        priority: mission.priority,
        requiredCapabilities: Object.freeze([
          "COORDINATE_MULTI_AGENT_RUNS",
        ]),
        dependencyKeys: Object.freeze([]),
        metadata: deepFreeze({
          missionObjective: mission.objective,
          topology:
            topology.topology,
          coordinationMode:
            topology.coordinationMode,
        }),
      });
    }

    const partitionDecisionKeys: string[] = [];

    for (const partition of partitions) {
      const analyzeKey =
        `partition:${partition.partitionId}:analyze`;
      const localDecisionKey =
        `partition:${partition.partitionId}:decision`;

      const baseDependencies =
        this.options.includeContextBuildTask
          ? Object.freeze([contextKey])
          : Object.freeze([]);

      blueprints.push({
        key: analyzeKey,
        type: partitionAnalysisTaskType(
          mission,
          partition,
        ),
        priority: higherPriority(
          mission.priority,
          partition.priority,
        ),
        partitionId: partition.partitionId,
        requiredCapabilities:
          mergeCapabilities(
            partition.requiredCapabilities,
            partitionTaskCapabilities(
              mission,
              partition,
            ),
          ),
        dependencyKeys: baseDependencies,
        metadata: deepFreeze({
          partitionType: partition.type,
          partitionKey: partition.key,
          partitionVersion:
            partition.version,
          partitionState:
            partition.state,
          partitionWeight:
            partition.weight,
        }),
      });

      blueprints.push({
        key: localDecisionKey,
        type: "FORM_LOCAL_DECISION",
        priority: higherPriority(
          mission.priority,
          partition.priority,
        ),
        partitionId: partition.partitionId,
        requiredCapabilities:
          mergeCapabilities(
            partition.requiredCapabilities,
            [
              "COORDINATE_MULTI_AGENT_RUNS",
            ],
          ),
        dependencyKeys: Object.freeze([
          analyzeKey,
        ]),
        metadata: deepFreeze({
          partitionType: partition.type,
          partitionKey: partition.key,
        }),
      });

      partitionDecisionKeys.push(
        localDecisionKey,
      );
    }

    const collectiveKey = "collective:run";

    blueprints.push({
      key: collectiveKey,
      type: "RUN_MULTI_AGENT_COLLECTIVE",
      priority: mission.priority,
      requiredCapabilities: Object.freeze([
        "COORDINATE_MULTI_AGENT_RUNS",
      ]),
      dependencyKeys:
        partitionDecisionKeys.length > 0
          ? Object.freeze([
              ...partitionDecisionKeys,
            ])
          : this.options.includeContextBuildTask
            ? Object.freeze([contextKey])
            : Object.freeze([]),
      metadata: deepFreeze({
        partitionCount: partitions.length,
        objective: mission.objective,
      }),
    });

    const consensusKey = "consensus:global";

    blueprints.push({
      key: consensusKey,
      type: "FORM_GLOBAL_CONSENSUS",
      priority: mission.priority,
      requiredCapabilities: Object.freeze([
        "FORM_DISTRIBUTED_CONSENSUS",
      ]),
      dependencyKeys: Object.freeze([
        collectiveKey,
      ]),
      metadata: deepFreeze({
        objective: mission.objective,
        coordinationMode:
          topology.coordinationMode,
      }),
    });

    const governanceKey = "governance:evaluate";

    blueprints.push({
      key: governanceKey,
      type: "EVALUATE_GOVERNANCE",
      priority: mission.priority,
      requiredCapabilities: Object.freeze([
        "AUTHORIZE_EXECUTION",
      ]),
      dependencyKeys: Object.freeze([
        consensusKey,
      ]),
      metadata: deepFreeze({
        prohibitedActionCount:
          mission.constraints
            .prohibitedActions?.length ?? 0,
        maximumRiskScore:
          mission.constraints
            .maximumRiskScore ?? null,
      }),
    });

    const terminalDependencies: string[] = [
      governanceKey,
    ];

    if (requiresExecutionTasks(mission)) {
      const planExecutionKey =
        "execution:plan";
      const executeKey = "execution:execute";
      const monitorKey = "execution:monitor";

      blueprints.push({
        key: planExecutionKey,
        type: "PLAN_DISTRIBUTED_EXECUTION",
        priority: higherPriority(
          mission.priority,
          "VERY_HIGH",
        ),
        requiredCapabilities: Object.freeze([
          "PLAN_DISTRIBUTED_EXECUTION",
        ]),
        dependencyKeys: Object.freeze([
          governanceKey,
        ]),
        metadata: deepFreeze({
          maximumExecutionActions:
            mission.constraints
              .maximumExecutionActions ?? null,
          maximumCapitalAtRisk:
            mission.constraints
              .maximumCapitalAtRisk ?? null,
        }),
      });

      blueprints.push({
        key: executeKey,
        type: "EXECUTE_ACTION",
        priority: higherPriority(
          mission.priority,
          "VERY_HIGH",
        ),
        requiredCapabilities: Object.freeze([
          "AUTHORIZE_EXECUTION",
          "EXECUTE_TRADES",
        ]),
        dependencyKeys: Object.freeze([
          planExecutionKey,
        ]),
        metadata: deepFreeze({
          portfolioId:
            mission.portfolioId ?? null,
          objective: mission.objective,
        }),
      });

      blueprints.push({
        key: monitorKey,
        type: "MONITOR_EXECUTION",
        priority: higherPriority(
          mission.priority,
          "HIGH",
        ),
        requiredCapabilities: Object.freeze([
          "MONITOR_EXECUTION",
        ]),
        dependencyKeys: Object.freeze([
          executeKey,
        ]),
        metadata: deepFreeze({
          executionMonitoring: true,
        }),
      });

      terminalDependencies.splice(
        0,
        terminalDependencies.length,
        monitorKey,
      );

      if (this.options.includeRollbackTask) {
        const rollbackKey =
          "execution:rollback";

        blueprints.push({
          key: rollbackKey,
          type: "ROLLBACK_ACTION",
          priority: "CRITICAL",
          requiredCapabilities:
            Object.freeze([
              "ROLLBACK_EXECUTION",
            ]),
          dependencyKeys: Object.freeze([
            executeKey,
          ]),
          optionalDependencyKeys:
            Object.freeze([monitorKey]),
          metadata: deepFreeze({
            contingencyTask: true,
          }),
        });

        terminalDependencies.push(
          rollbackKey,
        );
      }
    }

    if (this.options.includeCheckpointTask) {
      const checkpointKey =
        "state:checkpoint";

      blueprints.push({
        key: checkpointKey,
        type: "CHECKPOINT_STATE",
        priority: lowerPriority(
          mission.priority,
          "NORMAL",
        ),
        requiredCapabilities: Object.freeze([
          "PERSIST_CHECKPOINTS",
          "REPLICATE_STATE",
        ]),
        dependencyKeys: Object.freeze([
          ...terminalDependencies,
        ]),
        metadata: deepFreeze({
          partitionCount: partitions.length,
          topologyFingerprint:
            topology.deterministicFingerprint,
        }),
      });

      terminalDependencies.splice(
        0,
        terminalDependencies.length,
        checkpointKey,
      );
    }

    if (
      this.options.includeRecoveryTasks &&
      mission.objective ===
        "DISASTER_RECOVERY"
    ) {
      for (const partition of partitions) {
        const recoverKey =
          `partition:${partition.partitionId}:recover`;

        blueprints.push({
          key: recoverKey,
          type: "RECOVER_PARTITION",
          priority: "EMERGENCY",
          partitionId:
            partition.partitionId,
          requiredCapabilities:
            Object.freeze([
              "RECOVER_FAILED_NODES",
              "REPLICATE_STATE",
            ]),
          dependencyKeys:
            this.options.includeContextBuildTask
              ? Object.freeze([contextKey])
              : Object.freeze([]),
          maximumAttempts:
            this.options
              .recoveryMaximumAttempts,
          metadata: deepFreeze({
            partitionType:
              partition.type,
            partitionState:
              partition.state,
            recoveryTask: true,
          }),
        });

        terminalDependencies.push(
          recoverKey,
        );
      }
    }

    if (this.options.includeLearningTask) {
      blueprints.push({
        key: "learning:outcome",
        type: "LEARN_FROM_OUTCOME",
        priority: "LOW",
        requiredCapabilities: Object.freeze([
          "LEARN_FROM_OUTCOMES",
        ]),
        dependencyKeys: Object.freeze(
          uniqueSorted(
            terminalDependencies,
          ),
        ),
        metadata: deepFreeze({
          objective: mission.objective,
          missionFingerprint:
            mission.deterministicFingerprint,
        }),
      });
    }

    return Object.freeze(
      blueprints.sort(
        compareBlueprints,
      ),
    );
  }

  private materializeTask(
    mission: TradingSwarmMission,
    topology: TradingSwarmTopologySnapshot,
    blueprint: TaskBlueprint,
    taskIdsByKey: ReadonlyMap<
      string,
      TradingSwarmTaskId
    >,
  ): TradingSwarmTask {
    const taskId = taskIdsByKey.get(
      blueprint.key,
    );

    if (taskId === undefined) {
      throw new SwarmTaskPlannerError(
        "TASK_PLANNING_FAILED",
        `No task identifier exists for blueprint "${blueprint.key}".`,
        { missionId: mission.missionId },
      );
    }

    const dependencies =
      createDependencies(
        blueprint,
        taskIdsByKey,
      );

    const maximumAttempts =
      blueprint.maximumAttempts ??
      this.options.maximumAttempts;

    assertPositiveInteger(
      maximumAttempts,
      "maximumAttempts",
    );

    const durationMs =
      blueprint.durationMs ??
      this.options.defaultTaskDurationMs;

    const deadlineAtMs =
      resolveTaskDeadline(
        mission,
        durationMs,
        this.options.minimumTaskDurationMs,
      );

    const inputDescriptor = {
      missionId: mission.missionId,
      runId: mission.runId,
      missionFingerprint:
        mission.deterministicFingerprint,
      contextFingerprint:
        mission.context
          .deterministicFingerprint,
      topologyFingerprint:
        topology.deterministicFingerprint,
      taskKey: blueprint.key,
      type: blueprint.type,
      partitionId:
        blueprint.partitionId ?? null,
      requiredCapabilities:
        blueprint.requiredCapabilities,
      dependencies,
      metadata:
        blueprint.metadata ?? null,
    };

    const task: TradingSwarmTask = {
      taskId,
      missionId: mission.missionId,
      runId: mission.runId,
      type: blueprint.type,
      status: "CREATED",
      priority: blueprint.priority,
      ...(blueprint.partitionId === undefined
        ? {}
        : {
            partitionId:
              blueprint.partitionId,
          }),
      requiredCapabilities:
        uniqueSorted(
          blueprint.requiredCapabilities,
        ),
      dependencies,
      attempt: 0,
      maximumAttempts,
      createdAtMs: mission.createdAtMs,
      ...(deadlineAtMs === undefined
        ? {}
        : { deadlineAtMs }),
      inputFingerprint:
        this.options
          .fingerprintGenerator
          .fingerprint(inputDescriptor),
      ...(blueprint.metadata === undefined
        ? {}
        : {
            metadata: deepFreeze({
              ...blueprint.metadata,
              taskKey: blueprint.key,
            }),
          }),
    };

    return deepFreeze(task);
  }
}

/* ========================================================================== *
 * Factory and deterministic generators
 * ========================================================================== */

export function createSwarmTaskPlanner(
  options: SwarmTaskPlannerOptions = {},
): SwarmTaskPlanner {
  return new SwarmTaskPlanner(options);
}

export class StableSwarmTaskIdGenerator
  implements TradingSwarmIdGenerator
{
  public generate(
    prefix: string,
    seed: string,
  ): string {
    return `${prefix}-${stableHash(seed)}`;
  }
}

export class StableSwarmTaskFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-task-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Blueprint creation helpers
 * ========================================================================== */

function partitionAnalysisTaskType(
  mission: TradingSwarmMission,
  partition: TradingSwarmPartition,
): TradingSwarmTaskType {
  switch (partition.type) {
    case "RISK_DOMAIN":
      return "ASSESS_SYSTEMIC_RISK";
    case "PORTFOLIO":
      return "ASSESS_PORTFOLIO";
    case "STRATEGY":
      return "ASSESS_STRATEGIES";
    case "EXCHANGE":
      return "ASSESS_LIQUIDITY";
    case "MARKET":
    case "ASSET_CLASS":
    case "TIMEFRAME":
      return mission.objective ===
        "DISTRIBUTED_ARBITRAGE_DISCOVERY"
        ? "DISCOVER_OPPORTUNITIES"
        : "ANALYZE_PARTITION";
    case "MISSION":
    case "CUSTOM":
      return mission.objective ===
        "DISTRIBUTED_ARBITRAGE_DISCOVERY"
        ? "DISCOVER_OPPORTUNITIES"
        : "ANALYZE_PARTITION";
  }
}

function partitionTaskCapabilities(
  mission: TradingSwarmMission,
  partition: TradingSwarmPartition,
): readonly TradingSwarmCapability[] {
  switch (partition.type) {
    case "MARKET":
    case "ASSET_CLASS":
    case "TIMEFRAME":
      return mission.objective ===
        "DISTRIBUTED_ARBITRAGE_DISCOVERY"
        ? Object.freeze([
            "DISTRIBUTE_MARKET_ANALYSIS",
            "DISTRIBUTE_ARBITRAGE_ANALYSIS",
          ])
        : Object.freeze([
            "DISTRIBUTE_MARKET_ANALYSIS",
          ]);
    case "STRATEGY":
      return Object.freeze([
        "DISTRIBUTE_STRATEGY_ANALYSIS",
      ]);
    case "PORTFOLIO":
      return Object.freeze([
        "DISTRIBUTE_PORTFOLIO_ANALYSIS",
      ]);
    case "RISK_DOMAIN":
      return Object.freeze([
        "DISTRIBUTE_RISK_ANALYSIS",
      ]);
    case "EXCHANGE":
      return Object.freeze([
        "DISTRIBUTE_MARKET_ANALYSIS",
      ]);
    case "MISSION":
    case "CUSTOM":
      return objectiveCapabilities(
        mission.objective,
      );
  }
}

function objectiveCapabilities(
  objective: TradingSwarmMission["objective"],
): readonly TradingSwarmCapability[] {
  switch (objective) {
    case "GLOBAL_MARKET_ASSESSMENT":
    case "REGIME_TRANSITION_RESPONSE":
      return Object.freeze([
        "DISTRIBUTE_MARKET_ANALYSIS",
      ]);
    case "DISTRIBUTED_TRADE_DECISION":
    case "FULL_SWARM_DECISION":
      return Object.freeze([
        "COORDINATE_MULTI_AGENT_RUNS",
        "FORM_DISTRIBUTED_CONSENSUS",
      ]);
    case "CROSS_MARKET_STRATEGY_SELECTION":
      return Object.freeze([
        "DISTRIBUTE_STRATEGY_ANALYSIS",
      ]);
    case "DISTRIBUTED_PORTFOLIO_REBALANCE":
      return Object.freeze([
        "DISTRIBUTE_PORTFOLIO_ANALYSIS",
      ]);
    case "SYSTEMIC_RISK_RESPONSE":
      return Object.freeze([
        "DISTRIBUTE_RISK_ANALYSIS",
      ]);
    case "DISTRIBUTED_ARBITRAGE_DISCOVERY":
      return Object.freeze([
        "DISTRIBUTE_ARBITRAGE_ANALYSIS",
      ]);
    case "CROSS_EXCHANGE_EXECUTION":
      return Object.freeze([
        "PLAN_DISTRIBUTED_EXECUTION",
        "EXECUTE_TRADES",
      ]);
    case "LIQUIDITY_COORDINATION":
      return Object.freeze([
        "DISTRIBUTE_MARKET_ANALYSIS",
        "PLAN_DISTRIBUTED_EXECUTION",
      ]);
    case "AUTONOMOUS_SWARM_OPTIMIZATION":
      return Object.freeze([
        "BALANCE_WORKLOAD",
        "LEARN_FROM_OUTCOMES",
      ]);
    case "DISASTER_RECOVERY":
      return Object.freeze([
        "RECOVER_FAILED_NODES",
        "REPLICATE_STATE",
      ]);
  }
}

function requiresExecutionTasks(
  mission: TradingSwarmMission,
): boolean {
  switch (mission.objective) {
    case "DISTRIBUTED_TRADE_DECISION":
    case "DISTRIBUTED_PORTFOLIO_REBALANCE":
    case "CROSS_EXCHANGE_EXECUTION":
    case "LIQUIDITY_COORDINATION":
    case "FULL_SWARM_DECISION":
      return true;
    case "GLOBAL_MARKET_ASSESSMENT":
    case "CROSS_MARKET_STRATEGY_SELECTION":
    case "SYSTEMIC_RISK_RESPONSE":
    case "DISTRIBUTED_ARBITRAGE_DISCOVERY":
    case "REGIME_TRANSITION_RESPONSE":
    case "AUTONOMOUS_SWARM_OPTIMIZATION":
    case "DISASTER_RECOVERY":
      return false;
  }
}

/* ========================================================================== *
 * Dependency and graph validation
 * ========================================================================== */

function createDependencies(
  blueprint: TaskBlueprint,
  taskIdsByKey: ReadonlyMap<
    string,
    TradingSwarmTaskId
  >,
): readonly TradingSwarmTaskDependency[] {
  const dependencies: TradingSwarmTaskDependency[] =
    [];

  for (const key of uniqueSorted(
    blueprint.dependencyKeys,
  )) {
    const taskId = taskIdsByKey.get(key);

    if (taskId === undefined) {
      throw new SwarmTaskPlannerError(
        "TASK_PLANNING_FAILED",
        `Required dependency "${key}" does not exist.`,
      );
    }

    dependencies.push(
      deepFreeze({
        taskId,
        requiredStatus: "COMPLETED",
        optional: false,
      }),
    );
  }

  for (const key of uniqueSorted(
    blueprint.optionalDependencyKeys ?? [],
  )) {
    const taskId = taskIdsByKey.get(key);

    if (taskId === undefined) {
      throw new SwarmTaskPlannerError(
        "TASK_PLANNING_FAILED",
        `Optional dependency "${key}" does not exist.`,
      );
    }

    if (
      dependencies.some(
        (dependency) =>
          dependency.taskId === taskId,
      )
    ) {
      continue;
    }

    dependencies.push(
      deepFreeze({
        taskId,
        requiredStatus: "COMPLETED",
        optional: true,
      }),
    );
  }

  return Object.freeze(
    dependencies.sort((left, right) =>
      left.taskId.localeCompare(
        right.taskId,
      ),
    ),
  );
}

function validateBlueprintGraph(
  blueprints: readonly TaskBlueprint[],
): void {
  const byKey = new Map<
    string,
    TaskBlueprint
  >();

  for (const blueprint of blueprints) {
    if (byKey.has(blueprint.key)) {
      throw new SwarmTaskPlannerError(
        "DUPLICATE_TASK_ID",
        `Duplicate task blueprint key "${blueprint.key}".`,
      );
    }

    byKey.set(blueprint.key, blueprint);
  }

  for (const blueprint of blueprints) {
    for (const dependencyKey of [
      ...blueprint.dependencyKeys,
      ...(blueprint.optionalDependencyKeys ??
        []),
    ]) {
      if (!byKey.has(dependencyKey)) {
        throw new SwarmTaskPlannerError(
          "TASK_PLANNING_FAILED",
          `Task "${blueprint.key}" references unknown dependency "${dependencyKey}".`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }

    if (visiting.has(key)) {
      throw new SwarmTaskPlannerError(
        "CYCLIC_DEPENDENCY",
        `Task dependency cycle detected at "${key}".`,
      );
    }

    visiting.add(key);
    const blueprint = byKey.get(key);

    if (blueprint !== undefined) {
      for (const dependencyKey of [
        ...blueprint.dependencyKeys,
        ...(blueprint
          .optionalDependencyKeys ?? []),
      ]) {
        visit(dependencyKey);
      }
    }

    visiting.delete(key);
    visited.add(key);
  };

  for (const blueprint of blueprints) {
    visit(blueprint.key);
  }
}

function validateTaskGraph(
  tasks: readonly TradingSwarmTask[],
): void {
  const byId = new Map<
    TradingSwarmTaskId,
    TradingSwarmTask
  >();

  for (const task of tasks) {
    if (byId.has(task.taskId)) {
      throw new SwarmTaskPlannerError(
        "DUPLICATE_TASK_ID",
        `Duplicate task identifier "${task.taskId}".`,
        { taskId: task.taskId },
      );
    }

    byId.set(task.taskId, task);
  }

  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!byId.has(dependency.taskId)) {
        throw new SwarmTaskPlannerError(
          "TASK_PLANNING_FAILED",
          `Task "${task.taskId}" references unknown task "${dependency.taskId}".`,
          { taskId: task.taskId },
        );
      }

      if (dependency.taskId === task.taskId) {
        throw new SwarmTaskPlannerError(
          "CYCLIC_DEPENDENCY",
          `Task "${task.taskId}" depends on itself.`,
          { taskId: task.taskId },
        );
      }
    }
  }
}

/* ========================================================================== *
 * Deadline, ordering, and options
 * ========================================================================== */

function resolveTaskDeadline(
  mission: TradingSwarmMission,
  durationMs: number,
  minimumTaskDurationMs: number,
): TradingSwarmTimestamp | undefined {
  if (
    !Number.isFinite(durationMs) ||
    durationMs < minimumTaskDurationMs
  ) {
    throw new SwarmTaskPlannerError(
      "INVALID_TASK_DURATION",
      `Task duration must be at least ${minimumTaskDurationMs} milliseconds.`,
      { field: "durationMs" },
    );
  }

  const proposed =
    mission.createdAtMs +
    Math.floor(durationMs);

  if (!Number.isSafeInteger(proposed)) {
    throw new SwarmTaskPlannerError(
      "INVALID_TASK_DURATION",
      "Task deadline exceeds the safe timestamp range.",
    );
  }

  if (mission.deadlineAtMs === undefined) {
    return proposed as TradingSwarmTimestamp;
  }

  return Math.min(
    proposed,
    mission.deadlineAtMs,
  ) as TradingSwarmTimestamp;
}

function normalizeOptions(
  options: SwarmTaskPlannerOptions,
): NormalizedOptions {
  const maximumAttempts =
    options.maximumAttempts ?? 3;
  const recoveryMaximumAttempts =
    options.recoveryMaximumAttempts ?? 5;
  const defaultTaskDurationMs =
    options.defaultTaskDurationMs ?? 60_000;
  const minimumTaskDurationMs =
    options.minimumTaskDurationMs ?? 1;

  assertPositiveInteger(
    maximumAttempts,
    "maximumAttempts",
  );
  assertPositiveInteger(
    recoveryMaximumAttempts,
    "recoveryMaximumAttempts",
  );
  assertPositiveFinite(
    defaultTaskDurationMs,
    "defaultTaskDurationMs",
  );
  assertPositiveFinite(
    minimumTaskDurationMs,
    "minimumTaskDurationMs",
  );

  if (
    minimumTaskDurationMs >
    defaultTaskDurationMs
  ) {
    throw new SwarmTaskPlannerError(
      "INVALID_TASK_DURATION",
      "minimumTaskDurationMs cannot exceed defaultTaskDurationMs.",
    );
  }

  return Object.freeze({
    idGenerator:
      options.idGenerator ??
      new StableSwarmTaskIdGenerator(),
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmTaskFingerprintGenerator(),
    maximumAttempts,
    recoveryMaximumAttempts,
    defaultTaskDurationMs,
    minimumTaskDurationMs,
    includeContextBuildTask:
      options.includeContextBuildTask ??
      true,
    includeCheckpointTask:
      options.includeCheckpointTask ??
      true,
    includeLearningTask:
      options.includeLearningTask ??
      true,
    includeRecoveryTasks:
      options.includeRecoveryTasks ??
      true,
    includeRollbackTask:
      options.includeRollbackTask ??
      true,
    createPartitionTasksForAllMissionPartitions:
      options
        .createPartitionTasksForAllMissionPartitions ??
      false,
  });
}

function compareBlueprints(
  left: TaskBlueprint,
  right: TaskBlueprint,
): number {
  const dependencyOrder =
    left.dependencyKeys.length -
    right.dependencyKeys.length;

  if (dependencyOrder !== 0) {
    return dependencyOrder;
  }

  const priorityOrder =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const typeOrder =
    left.type.localeCompare(right.type);

  return typeOrder !== 0
    ? typeOrder
    : left.key.localeCompare(right.key);
}

function compareTasks(
  left: TradingSwarmTask,
  right: TradingSwarmTask,
): number {
  const dependencyOrder =
    left.dependencies.length -
    right.dependencies.length;

  if (dependencyOrder !== 0) {
    return dependencyOrder;
  }

  const priorityOrder =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const typeOrder =
    left.type.localeCompare(right.type);

  if (typeOrder !== 0) {
    return typeOrder;
  }

  return left.taskId.localeCompare(
    right.taskId,
  );
}

function comparePartitions(
  left: TradingSwarmPartition,
  right: TradingSwarmPartition,
): number {
  const priorityOrder =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const typeOrder =
    left.type.localeCompare(right.type);

  if (typeOrder !== 0) {
    return typeOrder;
  }

  return left.partitionId.localeCompare(
    right.partitionId,
  );
}

function higherPriority(
  left: TradingSwarmPriority,
  right: TradingSwarmPriority,
): TradingSwarmPriority {
  return priorityRank(right) >
    priorityRank(left)
    ? right
    : left;
}

function lowerPriority(
  left: TradingSwarmPriority,
  right: TradingSwarmPriority,
): TradingSwarmPriority {
  return priorityRank(right) <
    priorityRank(left)
    ? right
    : left;
}

function priorityRank(
  priority: TradingSwarmPriority,
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
  }
}

/* ========================================================================== *
 * Generic deterministic utilities
 * ========================================================================== */

function mergeCapabilities(
  left: readonly TradingSwarmCapability[],
  right: readonly TradingSwarmCapability[],
): readonly TradingSwarmCapability[] {
  return uniqueSorted([
    ...left,
    ...right,
  ]);
}

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): readonly TValue[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function assertNonEmptyText(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new SwarmTaskPlannerError(
      "INVALID_MISSION",
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
    throw new SwarmTaskPlannerError(
      "INVALID_MISSION",
      `${field} must be a non-negative safe integer timestamp.`,
      { field },
    );
  }
}

function assertPositiveInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new SwarmTaskPlannerError(
      "INVALID_RETRY_CONFIGURATION",
      `${field} must be a positive integer.`,
      { field },
    );
  }
}

function assertPositiveFinite(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new SwarmTaskPlannerError(
      "INVALID_TASK_DURATION",
      `${field} must be positive and finite.`,
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
    return value.map(
      normalizeForStableJson,
    );
  }

  if (typeof value === "object") {
    const output: Record<
      string,
      unknown
    > = {};

    for (const key of Object.keys(value).sort()) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      output[key] =
        normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}

function stableHash(value: string): string {
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

// End of swarm-task-planner.ts