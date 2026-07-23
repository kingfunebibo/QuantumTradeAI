/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/ai-trading-swarm-orchestrator.ts
 *
 * Production-grade deterministic orchestration of the complete trading-swarm
 * decision pipeline. All externally visible values are deeply immutable,
 * identifiers and fingerprints are deterministic, and failures are converted
 * into replay-safe outcomes rather than leaking partial mutable state.
 */

import {
  AI_TRADING_SWARM_SCHEMA_VERSION,
  type AiTradingSwarmDependencies,
  type AiTradingSwarmExecutionOutcome,
  type AiTradingSwarmOrchestratorPort,
  type AiTradingSwarmRunFailure,
  type AiTradingSwarmRunRequest,
  type AiTradingSwarmRunResult,
  type TradingSwarmAuditTrace,
  type TradingSwarmAuthority,
  type TradingSwarmCheckpoint,
  type TradingSwarmCollectiveDecision,
  type TradingSwarmDecisionExplanation,
  type TradingSwarmEvent,
  type TradingSwarmExecutionPlan,
  type TradingSwarmExecutionState,
  type TradingSwarmFailure,
  type TradingSwarmIdentity,
  type TradingSwarmLearningObservation,
  type TradingSwarmLifecycleState,
  type TradingSwarmManagerSnapshot,
  type TradingSwarmMission,
  type TradingSwarmMissionStatus,
  type TradingSwarmMissionSummary,
  type TradingSwarmNodeContribution,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeTrustScore,
  type TradingSwarmPipelineStage,
  type TradingSwarmStageTiming,
  type TradingSwarmTaskAssignment,
  type TradingSwarmTelemetry,
  type TradingSwarmTimestamp,
  type TradingSwarmTrustUpdate,
  isExecutableTradingSwarmDecision,
} from "./ai-trading-swarm-contracts";

import type {
  MultiAgentValidationResult,
} from "../ai-multi-agent-intelligence/ai-multi-agent-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type AiTradingSwarmOrchestratorErrorCode =
  | "INVALID_DEPENDENCIES"
  | "INVALID_OPTIONS"
  | "RUN_ALREADY_ACTIVE"
  | "REQUEST_VALIDATION_FAILED"
  | "CONFIGURATION_VALIDATION_FAILED"
  | "CONCURRENCY_LIMIT_REACHED"
  | "PIPELINE_STAGE_FAILED"
  | "MISSION_VALIDATION_FAILED"
  | "DECISION_VALIDATION_FAILED"
  | "EXECUTION_COORDINATOR_REQUIRED"
  | "CHECKPOINT_FAILED"
  | "PERSISTENCE_FAILED"
  | "PUBLICATION_FAILED"
  | "SNAPSHOT_FAILED";

export interface AiTradingSwarmOrchestratorErrorDetails {
  readonly requestId?: string;
  readonly runId?: string;
  readonly missionId?: string;
  readonly stage?: TradingSwarmPipelineStage;
  readonly cause?: unknown;
}

export class AiTradingSwarmOrchestratorError extends Error {
  public readonly code: AiTradingSwarmOrchestratorErrorCode;
  public readonly details: AiTradingSwarmOrchestratorErrorDetails;

  public constructor(
    code: AiTradingSwarmOrchestratorErrorCode,
    message: string,
    details: AiTradingSwarmOrchestratorErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "AiTradingSwarmOrchestratorError";
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}

export interface AiTradingSwarmOrchestratorOptions {
  readonly swarm: TradingSwarmIdentity;
  readonly authority: TradingSwarmAuthority;
  readonly initialLifecycleState?: TradingSwarmLifecycleState;
  readonly retainRecentDecisions?: number;
  readonly retainFailures?: number;
  readonly persistSnapshots?: boolean;
  readonly checkpointEverySuccessfulRun?: boolean;
  readonly failRunOnCheckpointError?: boolean;
  readonly failRunOnPublicationError?: boolean;
  readonly failRunOnPersistenceError?: boolean;
}

const DEFAULT_RETAIN_RECENT_DECISIONS = 100;
const DEFAULT_RETAIN_FAILURES = 100;

/* ========================================================================== *
 * Internal state
 * ========================================================================== */

interface MutableManagerState {
  lifecycleState: TradingSwarmLifecycleState;
  readonly recentDecisions: TradingSwarmCollectiveDecision[];
  readonly nodeTrustScores: Map<string, TradingSwarmNodeTrustScore>;
  readonly failures: TradingSwarmFailure[];
  latestCheckpointId?: string;
  activeRunCount: number;
  completedRunCount: number;
  failedRunCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  completedExecutionCount: number;
  failedExecutionCount: number;
  totalMissionConfidence: number;
}

interface PipelineContext {
  readonly request: AiTradingSwarmRunRequest;
  readonly runId: string;
  readonly startedAtMs: TradingSwarmTimestamp;
  readonly validation: MultiAgentValidationResult<AiTradingSwarmRunRequest>;
  readonly completedStages: TradingSwarmPipelineStage[];
  readonly stageTimings: TradingSwarmStageTiming[];
  readonly nodeIds: Set<string>;
  readonly partitionIds: Set<string>;
  readonly taskIds: Set<string>;
  readonly localRunIds: Set<string>;
  readonly ballotIds: Set<string>;
  readonly eventIds: Set<string>;
  readonly checkpointIds: Set<string>;
  readonly warnings: string[];
  readonly errors: string[];
  missionId?: string;
}

interface PipelineExecutionResult {
  readonly mission: TradingSwarmMission;
  readonly topology: ReturnType<AiTradingSwarmDependencies["registry"]["topology"]>;
  readonly election?: Awaited<
    ReturnType<AiTradingSwarmDependencies["leaderElection"]["elect"]>
  >;
  readonly assignments: readonly TradingSwarmTaskAssignment[];
  readonly localRuns: Awaited<
    ReturnType<
      AiTradingSwarmDependencies["localCollectiveExecutor"]["execute"]
    >
  >[];
  readonly contributions: readonly TradingSwarmNodeContribution[];
  readonly candidates: ReturnType<
    AiTradingSwarmDependencies["candidateAssembler"]["assemble"]
  >;
  readonly consensus: Awaited<
    ReturnType<AiTradingSwarmDependencies["consensusEngine"]["form"]>
  >;
  readonly riskAssessment: ReturnType<
    AiTradingSwarmDependencies["riskEngine"]["assess"]
  >;
  readonly governance: ReturnType<
    AiTradingSwarmDependencies["governanceEngine"]["evaluate"]
  >;
  readonly decision: TradingSwarmCollectiveDecision;
  readonly executionPlan?: TradingSwarmExecutionPlan;
  readonly executionState?: TradingSwarmExecutionState;
  readonly explanation: TradingSwarmDecisionExplanation;
  readonly trustUpdates: readonly TradingSwarmTrustUpdate[];
  readonly checkpoint?: TradingSwarmCheckpoint;
}

/* ========================================================================== *
 * Orchestrator
 * ========================================================================== */

export class AiTradingSwarmOrchestrator
  implements AiTradingSwarmOrchestratorPort
{
  private readonly dependencies: AiTradingSwarmDependencies;
  private readonly options: Required<
    Omit<
      AiTradingSwarmOrchestratorOptions,
      "swarm" | "authority"
    >
  > &
    Pick<AiTradingSwarmOrchestratorOptions, "swarm" | "authority">;

  private readonly activeRequestIds = new Set<string>();
  private readonly state: MutableManagerState;

  public constructor(
    dependencies: AiTradingSwarmDependencies,
    options: AiTradingSwarmOrchestratorOptions,
  ) {
    assertDependencies(dependencies);
    this.options = normalizeOptions(options);
    this.dependencies = dependencies;
    this.state = {
      lifecycleState: this.options.initialLifecycleState,
      recentDecisions: [],
      nodeTrustScores: new Map(),
      failures: [],
      activeRunCount: 0,
      completedRunCount: 0,
      failedRunCount: 0,
      completedTaskCount: 0,
      failedTaskCount: 0,
      completedExecutionCount: 0,
      failedExecutionCount: 0,
      totalMissionConfidence: 0,
    };
  }

  public async run(
    request: AiTradingSwarmRunRequest,
  ): Promise<AiTradingSwarmExecutionOutcome> {
    const validation =
      this.dependencies.validator.validateRequest(request);

    const runId = this.dependencies.idGenerator.generate(
      "swarm-run",
      stableSeed({
        requestId: request.requestId,
        swarmId: request.swarmId,
        objective: request.objective,
        requestedAtMs: request.requestedAtMs,
      }),
    );

    const startedAtMs = this.dependencies.clock.now();
    const context = createPipelineContext(
      request,
      runId,
      startedAtMs,
      validation,
    );

    if (this.activeRequestIds.has(request.requestId)) {
      return this.failureOutcome(
        context,
        "REJECTED",
        createRunFailure(
          "RUN_ALREADY_ACTIVE",
          `A run is already active for request ${request.requestId}.`,
          "VALIDATION",
          false,
          false,
        ),
      );
    }

    if (!validation.valid) {
      return this.failureOutcome(
        context,
        "REJECTED",
        createRunFailure(
          "REQUEST_VALIDATION_FAILED",
          summarizeValidationFailure(
            "Trading swarm run request validation failed.",
            validation,
          ),
          "VALIDATION",
          false,
          true,
        ),
      );
    }

    const configurationValidation =
      this.dependencies.validator.validateConfiguration(
        request.configuration,
      );

    if (!configurationValidation.valid) {
      return this.failureOutcome(
        context,
        "REJECTED",
        createRunFailure(
          "CONFIGURATION_VALIDATION_FAILED",
          summarizeValidationFailure(
            "Trading swarm configuration validation failed.",
            configurationValidation,
          ),
          "VALIDATION",
          false,
          true,
        ),
      );
    }

    if (
      this.state.activeRunCount >=
      request.configuration.maximumConcurrentMissions
    ) {
      return this.failureOutcome(
        context,
        "DEFERRED",
        createRunFailure(
          "CONCURRENCY_LIMIT_REACHED",
          "The configured maximum number of concurrent swarm missions has been reached.",
          "VALIDATION",
          true,
          false,
        ),
      );
    }

    this.activeRequestIds.add(request.requestId);
    this.state.activeRunCount += 1;
    this.state.lifecycleState = "ACTIVE";

    this.dependencies.logger?.info(
      "AI trading swarm run started.",
      deepFreeze({
        requestId: request.requestId,
        runId,
        swarmId: request.swarmId,
        objective: request.objective,
      }),
    );

    try {
      await this.completeStage(context, "VALIDATION", startedAtMs);

      const result = await this.executePipeline(context);
      const completedAtMs = this.dependencies.clock.now();
      const completedMission = withMissionStatus(
        result.mission,
        determineSuccessfulMissionStatus(context),
      );

      const trace = this.buildTrace(context, completedAtMs);
      const runResult: AiTradingSwarmRunResult = deepFreeze({
        runId,
        requestId: request.requestId,
        swarmId: request.swarmId,
        mission: completedMission,
        status: completedMission.status as Extract<
          TradingSwarmMissionStatus,
          "COMPLETED" | "COMPLETED_WITH_WARNINGS"
        >,
        validation,
        topology: result.topology,
        ...(result.election === undefined
          ? {}
          : { election: result.election }),
        assignments: result.assignments,
        localRuns: result.localRuns,
        contributions: result.contributions,
        candidates: result.candidates,
        consensus: result.consensus,
        riskAssessment: result.riskAssessment,
        governance: result.governance,
        decision: result.decision,
        ...(result.executionState === undefined
          ? {}
          : { executionState: result.executionState }),
        explanation: result.explanation,
        trustUpdates: result.trustUpdates,
        failures: Object.freeze([]),
        ...(result.checkpoint === undefined
          ? {}
          : { checkpoint: result.checkpoint }),
        trace,
        startedAtMs,
        completedAtMs,
        deterministicFingerprint:
          this.dependencies.fingerprintGenerator.fingerprint({
            runId,
            requestId: request.requestId,
            missionId: completedMission.missionId,
            status: completedMission.status,
            decisionFingerprint:
              result.decision.deterministicFingerprint,
            topologyFingerprint:
              result.topology.deterministicFingerprint,
            traceFingerprint: trace.deterministicFingerprint,
            completedAtMs,
          }),
      });

      await this.persistSuccessfulRun(runResult);
      this.recordSuccessfulRun(runResult);

      this.dependencies.logger?.info(
        "AI trading swarm run completed.",
        deepFreeze({
          requestId: request.requestId,
          runId,
          missionId: completedMission.missionId,
          status: runResult.status,
          decision: runResult.decision.decision,
        }),
      );

      return runResult;
    } catch (cause) {
      const failure = this.normalizeFailure(cause, context);
      this.recordFailure(failure);

      this.dependencies.logger?.error(
        "AI trading swarm run failed.",
        deepFreeze({
          requestId: request.requestId,
          runId,
          missionId: context.missionId,
          stage: failure.stage,
          code: failure.code,
          message: failure.message,
        }),
      );

      return this.failureOutcome(
        context,
        mapFailureStatus(failure),
        failure,
      );
    } finally {
      this.activeRequestIds.delete(request.requestId);
      this.state.activeRunCount = Math.max(
        0,
        this.state.activeRunCount - 1,
      );

      if (this.state.activeRunCount === 0) {
        this.state.lifecycleState =
          this.state.failedRunCount > 0 ? "READY" : "READY";
      }
    }
  }

  public snapshot(): TradingSwarmManagerSnapshot {
    const capturedAtMs = this.dependencies.clock.now();
    const topology = deepFreeze(this.dependencies.registry.topology());
    const nodes = this.dependencies.registry.listNodes();
    const activeMissions = summarizeActiveMissions(
      topology,
      this.activeRequestIds.size,
    );

    const telemetry = this.createTelemetry(
      topology,
      nodes,
      capturedAtMs,
    );

    const snapshotWithoutFingerprint = {
      schemaVersion: AI_TRADING_SWARM_SCHEMA_VERSION,
      swarm: this.options.swarm,
      lifecycleState: this.state.lifecycleState,
      authority: this.options.authority,
      topology,
      activeMissions,
      recentDecisions: Object.freeze([
        ...this.state.recentDecisions,
      ]),
      nodeTrustScores: Object.freeze(
        [...this.state.nodeTrustScores.values()].sort(
          (left, right) =>
            left.nodeId.localeCompare(right.nodeId),
        ),
      ),
      failures: Object.freeze([...this.state.failures]),
      migrations: Object.freeze([]),
      optimizationRecommendations: Object.freeze([]),
      telemetry,
      ...(this.state.latestCheckpointId === undefined
        ? {}
        : {
            latestCheckpointId:
              this.state.latestCheckpointId,
          }),
      capturedAtMs,
    };

    return deepFreeze({
      ...snapshotWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          snapshotWithoutFingerprint,
        ),
    });
  }

  private async executePipeline(
    context: PipelineContext,
  ): Promise<PipelineExecutionResult> {
    const { request } = context;
    const configuration = request.configuration;

    const builtContext = await this.stage(
      context,
      "CONTEXT_BUILDING",
      () => this.dependencies.contextBuilder.build(request),
    );

    const topology = await this.stage(
      context,
      "TOPOLOGY_ASSESSMENT",
      () => deepFreeze(this.dependencies.registry.topology()),
    );

    const nodes = deepFreeze(
      this.dependencies.registry
        .listNodes()
        .filter(
          (node) =>
            !request.excludedNodeIds?.includes(
              node.identity.nodeId,
            ),
        )
        .sort((left, right) =>
          left.identity.nodeId.localeCompare(
            right.identity.nodeId,
          ),
        ),
    );

    for (const node of nodes) {
      context.nodeIds.add(node.identity.nodeId);
    }

    const health = deepFreeze(
      nodes
        .map((node) =>
          this.dependencies.registry.health(
            node.identity.nodeId,
          ),
        )
        .filter(isDefined)
        .sort((left, right) =>
          left.nodeId.localeCompare(right.nodeId),
        ),
    );

    const previousTrust = deepFreeze(
      this.dependencies.trustEngine.assess(
        nodes,
        Object.freeze([]),
        configuration.learning,
      ),
    );

    this.replaceTrustScores(previousTrust);

    const election = configuration.election.enabled
      ? await this.stage(
          context,
          "LEADER_ELECTION",
          () =>
            this.dependencies.leaderElection.elect(
              topology,
              topology.leaderNodeId === undefined
                ? "INITIAL_FORMATION"
                : "TERM_EXPIRED",
              configuration.election,
            ),
        )
      : undefined;

    const partitions = await this.stage(
      context,
      "PARTITION_PLANNING",
      () =>
        deepFreeze(
          this.dependencies.partitionManager.plan(
            request,
            topology,
            nodes,
            configuration.partitioning,
          ),
        ),
    );

    for (const partition of partitions) {
      context.partitionIds.add(partition.partitionId);
    }

    const leases = configuration.partitioning.enabled
      ? deepFreeze(
          this.dependencies.partitionManager.assign(
            partitions,
            nodes,
            health,
            previousTrust,
            configuration.partitioning,
          ),
        )
      : Object.freeze([]);

    const mission = await this.stage(
      context,
      "MISSION_PLANNING",
      () =>
        deepFreeze(
          this.dependencies.missionPlanner.plan(
            request,
            builtContext,
            topology,
          ),
        ),
    );

    context.missionId = mission.missionId;

    const missionValidation =
      this.dependencies.validator.validateMission(mission);

    if (!missionValidation.valid) {
      throw new AiTradingSwarmOrchestratorError(
        "MISSION_VALIDATION_FAILED",
        summarizeValidationFailure(
          "Trading swarm mission validation failed.",
          missionValidation,
        ),
        {
          requestId: request.requestId,
          runId: context.runId,
          missionId: mission.missionId,
          stage: "MISSION_PLANNING",
        },
      );
    }

    const tasks = deepFreeze(
      this.dependencies.taskPlanner.create(
        mission,
        topology,
        partitions,
      ),
    );

    for (const task of tasks) {
      context.taskIds.add(task.taskId);
    }

    const assignments = await this.stage(
      context,
      "TASK_ASSIGNMENT",
      () =>
        deepFreeze(
          this.dependencies.taskAllocator.assign(
            tasks,
            nodes,
            health,
            leases,
            previousTrust,
          ),
        ),
    );

    const localRuns = await this.stage(
      context,
      "LOCAL_MULTI_AGENT_EXECUTION",
      async () => {
        const orderedAssignments = [...assignments].sort(
          compareAssignments,
        );
        const runs = [];

        for (const assignment of orderedAssignments) {
          const run =
            await this.dependencies.localCollectiveExecutor.execute(
              assignment,
              mission,
              builtContext,
            );
          context.localRunIds.add(
            extractLocalRunId(run),
          );
          runs.push(deepFreeze(run));
        }

        return deepFreeze(runs);
      },
    );

    const contributions = await this.stage(
      context,
      "CONTRIBUTION_COLLECTION",
      () =>
        deepFreeze(
          this.dependencies.contributionAggregator.aggregate(
            mission,
            assignments,
            localRuns,
          ),
        ),
    );

    const candidates = await this.stage(
      context,
      "CANDIDATE_ASSEMBLY",
      () =>
        deepFreeze(
          this.dependencies.candidateAssembler.assemble(
            mission,
            contributions,
          ),
        ),
    );

    const consensus = await this.stage(
      context,
      "DISTRIBUTED_CONSENSUS",
      () =>
        this.dependencies.consensusEngine.form(
          mission,
          candidates,
          contributions,
          nodes,
          previousTrust,
          configuration.consensus,
        ),
    );

    for (const ballot of consensus.ballots) {
      context.ballotIds.add(ballot.ballotId);
    }

    const riskAssessment = await this.stage(
      context,
      "RISK_ASSESSMENT",
      () =>
        deepFreeze(
          this.dependencies.riskEngine.assess(
            mission,
            consensus,
            candidates,
            topology,
            configuration.safety,
          ),
        ),
    );

    const governance = await this.stage(
      context,
      "GOVERNANCE",
      () =>
        deepFreeze(
          this.dependencies.governanceEngine.evaluate(
            mission,
            consensus,
            riskAssessment,
            configuration.governanceRules,
            configuration.safety,
          ),
        ),
    );

    const decision = await this.stage(
      context,
      "DECISION_ASSEMBLY",
      () =>
        deepFreeze(
          this.dependencies.decisionAssembler.assemble(
            mission,
            candidates,
            consensus,
            governance,
          ),
        ),
    );

    const decisionValidation =
      this.dependencies.validator.validateDecision(decision);

    if (!decisionValidation.valid) {
      throw new AiTradingSwarmOrchestratorError(
        "DECISION_VALIDATION_FAILED",
        summarizeValidationFailure(
          "Trading swarm collective decision validation failed.",
          decisionValidation,
        ),
        {
          requestId: request.requestId,
          runId: context.runId,
          missionId: mission.missionId,
          stage: "DECISION_ASSEMBLY",
        },
      );
    }

    let executionPlan: TradingSwarmExecutionPlan | undefined;
    let executionState: TradingSwarmExecutionState | undefined;

    if (
      configuration.execution.enabled &&
      isExecutableTradingSwarmDecision(decision.decision)
    ) {
      executionPlan = await this.stage(
        context,
        "EXECUTION_PLANNING",
        () =>
          this.dependencies.executionPlanner.plan(
            mission,
            decision,
            topology,
            configuration.execution,
          ),
      );

      if (
        configuration.execution.mode !== "SIGNAL_ONLY" &&
        configuration.execution.mode !== "SIMULATION"
      ) {
        if (
          this.dependencies.executionCoordinator ===
          undefined
        ) {
          throw new AiTradingSwarmOrchestratorError(
            "EXECUTION_COORDINATOR_REQUIRED",
            "An execution coordinator is required for non-signal, non-simulation execution modes.",
            {
              requestId: request.requestId,
              runId: context.runId,
              missionId: mission.missionId,
              stage: "EXECUTION",
            },
          );
        }

        executionState = await this.stage(
          context,
          "EXECUTION",
          () =>
            this.dependencies.executionCoordinator!.execute(
              executionPlan!,
              topology,
            ),
        );
      }
    }

    const learningObservations =
      createLearningObservations(
        mission,
        contributions,
        executionState,
        this.dependencies.clock.now(),
      );

    const trustUpdates = configuration.learning.enabled
      ? await this.stage(
          context,
          "LEARNING",
          () =>
            deepFreeze(
              this.dependencies.trustEngine.update(
                previousTrust,
                learningObservations,
                configuration.learning,
              ),
            ),
        )
      : Object.freeze([]);

    this.applyTrustUpdates(trustUpdates);

    let checkpoint: TradingSwarmCheckpoint | undefined;

    if (
      this.options.checkpointEverySuccessfulRun ||
      configuration.recovery.enabled
    ) {
      checkpoint = await this.stage(
        context,
        "CHECKPOINTING",
        async () => {
          const value = this.createCheckpoint(
            context,
            topology,
            mission,
            tasks,
            decision,
            executionState,
          );

          try {
            await this.dependencies.checkpointStore.save(
              value,
            );
          } catch (cause) {
            if (this.options.failRunOnCheckpointError) {
              throw new AiTradingSwarmOrchestratorError(
                "CHECKPOINT_FAILED",
                "Failed to persist the trading swarm checkpoint.",
                {
                  requestId: request.requestId,
                  runId: context.runId,
                  missionId: mission.missionId,
                  stage: "CHECKPOINTING",
                  cause,
                },
              );
            }

            context.warnings.push(
              `Checkpoint persistence failed: ${causeMessage(
                cause,
              )}`,
            );
          }

          context.checkpointIds.add(value.checkpointId);
          this.state.latestCheckpointId =
            value.checkpointId;
          return value;
        },
      );
    }

    const explanation = await this.stage(
      context,
      "EXPLAINABILITY",
      () =>
        deepFreeze(
          this.dependencies.explainabilityEngine.explain(
            mission,
            {
              topology,
              contributions,
              candidates,
              consensus,
              governance,
              decision,
              ...(executionState === undefined
                ? {}
                : { executionState }),
            },
          ),
        ),
    );

    if (
      configuration.publishEvents &&
      this.dependencies.publisher !== undefined
    ) {
      await this.stage(
        context,
        "PUBLICATION",
        async () => {
          const event = this.createDecisionEvent(
            context,
            topology,
            mission,
            decision,
          );

          try {
            await this.dependencies.publisher!.publish(
              event,
            );
            context.eventIds.add(event.eventId);
          } catch (cause) {
            if (
              this.options.failRunOnPublicationError
            ) {
              throw new AiTradingSwarmOrchestratorError(
                "PUBLICATION_FAILED",
                "Failed to publish the trading swarm decision event.",
                {
                  requestId: request.requestId,
                  runId: context.runId,
                  missionId: mission.missionId,
                  stage: "PUBLICATION",
                  cause,
                },
              );
            }

            context.warnings.push(
              `Event publication failed: ${causeMessage(
                cause,
              )}`,
            );
          }
        },
      );
    }

    return deepFreeze({
      mission,
      topology,
      ...(election === undefined ? {} : { election }),
      assignments,
      localRuns,
      contributions,
      candidates,
      consensus,
      riskAssessment,
      governance,
      decision,
      ...(executionPlan === undefined
        ? {}
        : { executionPlan }),
      ...(executionState === undefined
        ? {}
        : { executionState }),
      explanation,
      trustUpdates,
      ...(checkpoint === undefined
        ? {}
        : { checkpoint }),
    });
  }

  private async stage<TValue>(
    context: PipelineContext,
    stage: TradingSwarmPipelineStage,
    operation: () => TValue | Promise<TValue>,
  ): Promise<TValue> {
    const startedAtMs = this.dependencies.clock.now();

    try {
      const value = await operation();
      await this.completeStage(
        context,
        stage,
        startedAtMs,
      );
      return value;
    } catch (cause) {
      context.errors.push(
        `${stage}: ${causeMessage(cause)}`,
      );

      if (
        cause instanceof
        AiTradingSwarmOrchestratorError
      ) {
        throw cause;
      }

      throw new AiTradingSwarmOrchestratorError(
        "PIPELINE_STAGE_FAILED",
        `Trading swarm pipeline stage ${stage} failed.`,
        {
          requestId: context.request.requestId,
          runId: context.runId,
          missionId: context.missionId,
          stage,
          cause,
        },
      );
    }
  }

  private async completeStage(
    context: PipelineContext,
    stage: TradingSwarmPipelineStage,
    startedAtMs: TradingSwarmTimestamp,
  ): Promise<void> {
    const completedAtMs = this.dependencies.clock.now();
    context.completedStages.push(stage);
    context.stageTimings.push(
      deepFreeze({
        stage,
        startedAtMs,
        completedAtMs,
        durationMs: Math.max(
          0,
          Number(completedAtMs) -
            Number(startedAtMs),
        ),
      }),
    );
  }

  private createCheckpoint(
    context: PipelineContext,
    topology: ReturnType<
      AiTradingSwarmDependencies["registry"]["topology"]
    >,
    mission: TradingSwarmMission,
    tasks: readonly ReturnType<
      AiTradingSwarmDependencies["taskPlanner"]["create"]
    >[number][],
    decision: TradingSwarmCollectiveDecision,
    executionState: TradingSwarmExecutionState | undefined,
  ): TradingSwarmCheckpoint {
    const createdAtMs = this.dependencies.clock.now();
    const checkpointId =
      this.dependencies.idGenerator.generate(
        "swarm-checkpoint",
        stableSeed({
          runId: context.runId,
          missionId: mission.missionId,
          topologyVersion: topology.topologyVersion,
          term: topology.term,
          epoch: topology.epoch,
          createdAtMs,
        }),
      );

    const valueWithoutFingerprint = {
      checkpointId,
      swarmId: context.request.swarmId,
      term: topology.term,
      epoch: topology.epoch,
      topology,
      activeMissions: Object.freeze([
        withMissionStatus(mission, "COMPLETED"),
      ]),
      tasks: Object.freeze([...tasks]),
      decisions: Object.freeze([decision]),
      executionStates:
        executionState === undefined
          ? Object.freeze([])
          : Object.freeze([executionState]),
      multiAgentMemory: Object.freeze([]),
      createdAtMs,
    };

    return deepFreeze({
      ...valueWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          valueWithoutFingerprint,
        ),
    });
  }

  private createDecisionEvent(
    context: PipelineContext,
    topology: ReturnType<
      AiTradingSwarmDependencies["registry"]["topology"]
    >,
    mission: TradingSwarmMission,
    decision: TradingSwarmCollectiveDecision,
  ): TradingSwarmEvent {
    const occurredAtMs = this.dependencies.clock.now();
    const eventId =
      this.dependencies.idGenerator.generate(
        "swarm-event",
        stableSeed({
          runId: context.runId,
          missionId: mission.missionId,
          decisionId: decision.decisionId,
          occurredAtMs,
        }),
      );

    const valueWithoutFingerprint = {
      eventId,
      topic: "DECISION_COMPLETED" as const,
      swarmId: context.request.swarmId,
      runId: context.runId,
      missionId: mission.missionId,
      occurredAtMs,
      sequence: context.eventIds.size + 1,
      term: topology.term,
      epoch: topology.epoch,
      payload: {
        decisionId: decision.decisionId,
        decision: decision.decision,
        confidence:
          decision.collectiveConfidence
            .finalConfidence,
        estimatedRisk: decision.estimatedRisk,
        actionCount: decision.actions.length,
      },
      correlationId: context.request.requestId,
    };

    return deepFreeze({
      ...valueWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          valueWithoutFingerprint,
        ),
    });
  }

  private buildTrace(
    context: PipelineContext,
    completedAtMs?: TradingSwarmTimestamp,
  ): TradingSwarmAuditTrace {
    const createdAtMs = context.startedAtMs;
    const traceId =
      this.dependencies.idGenerator.generate(
        "swarm-trace",
        stableSeed({
          runId: context.runId,
          requestId: context.request.requestId,
          missionId: context.missionId,
          createdAtMs,
        }),
      );

    const valueWithoutFingerprint = {
      traceId,
      runId: context.runId,
      missionId:
        context.missionId ??
        this.dependencies.idGenerator.generate(
          "swarm-mission",
          stableSeed({
            runId: context.runId,
            requestId: context.request.requestId,
          }),
        ),
      createdAtMs,
      ...(completedAtMs === undefined
        ? {}
        : { completedAtMs }),
      completedStages: Object.freeze([
        ...context.completedStages,
      ]),
      stageTimings: Object.freeze([
        ...context.stageTimings,
      ]),
      nodeIds: sorted(context.nodeIds),
      partitionIds: sorted(context.partitionIds),
      taskIds: sorted(context.taskIds),
      localRunIds: sorted(context.localRunIds),
      ballotIds: sorted(context.ballotIds),
      eventIds: sorted(context.eventIds),
      checkpointIds: sorted(context.checkpointIds),
      warnings: Object.freeze([...context.warnings]),
      errors: Object.freeze([...context.errors]),
    };

    return deepFreeze({
      ...valueWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          valueWithoutFingerprint,
        ),
    });
  }

  private failureOutcome(
    context: PipelineContext,
    status: Extract<
      TradingSwarmMissionStatus,
      | "DEFERRED"
      | "REJECTED"
      | "FAILED"
      | "CANCELLED"
      | "TIMED_OUT"
    >,
    failure: AiTradingSwarmRunFailure,
  ): AiTradingSwarmExecutionOutcome {
    const completedAtMs = this.dependencies.clock.now();
    const trace = this.buildTrace(
      context,
      completedAtMs,
    );

    this.state.failedRunCount += 1;

    const valueWithoutFingerprint = {
      runId: context.runId,
      requestId: context.request.requestId,
      swarmId: context.request.swarmId,
      ...(context.missionId === undefined
        ? {}
        : { missionId: context.missionId }),
      status,
      failure,
      validation: context.validation,
      trace,
    };

    return deepFreeze({
      ...valueWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          valueWithoutFingerprint,
        ),
    });
  }

  private normalizeFailure(
    cause: unknown,
    context: PipelineContext,
  ): AiTradingSwarmRunFailure {
    if (
      cause instanceof
      AiTradingSwarmOrchestratorError
    ) {
      return createRunFailure(
        cause.code,
        cause.message,
        cause.details.stage,
        isRetryableCode(cause.code),
        isFatalCode(cause.code),
        cause.details.cause,
      );
    }

    return createRunFailure(
      "UNEXPECTED_ORCHESTRATION_FAILURE",
      "An unexpected trading swarm orchestration failure occurred.",
      lastStage(context),
      false,
      true,
      cause,
    );
  }

  private async persistSuccessfulRun(
    result: AiTradingSwarmRunResult,
  ): Promise<void> {
    if (this.dependencies.persistence === undefined) {
      return;
    }

    try {
      await this.dependencies.persistence.saveRun(
        result,
      );

      if (this.options.persistSnapshots) {
        await this.dependencies.persistence.saveSnapshot(
          this.snapshot(),
        );
      }
    } catch (cause) {
      if (this.options.failRunOnPersistenceError) {
        throw new AiTradingSwarmOrchestratorError(
          "PERSISTENCE_FAILED",
          "Failed to persist the completed trading swarm run.",
          {
            requestId: result.requestId,
            runId: result.runId,
            missionId: result.mission.missionId,
            stage: "PUBLICATION",
            cause,
          },
        );
      }

      this.dependencies.logger?.warn(
        "Trading swarm run persistence failed.",
        deepFreeze({
          requestId: result.requestId,
          runId: result.runId,
          cause: causeMessage(cause),
        }),
      );
    }
  }

  private recordSuccessfulRun(
    result: AiTradingSwarmRunResult,
  ): void {
    this.state.completedRunCount += 1;
    this.state.completedTaskCount +=
      result.assignments.length;
    this.state.totalMissionConfidence +=
      result.decision.collectiveConfidence
        .finalConfidence;

    if (result.executionState !== undefined) {
      if (
        result.executionState.status === "COMPLETED"
      ) {
        this.state.completedExecutionCount += 1;
      } else if (
        result.executionState.status === "FAILED" ||
        result.executionState.status === "REJECTED" ||
        result.executionState.status === "CANCELLED"
      ) {
        this.state.failedExecutionCount += 1;
      }
    }

    this.state.recentDecisions.push(
      result.decision,
    );
    trimFromStart(
      this.state.recentDecisions,
      this.options.retainRecentDecisions,
    );
  }

  private recordFailure(
    failure: AiTradingSwarmRunFailure,
  ): void {
    const detectedAtMs =
      this.dependencies.clock.now();

    const value: TradingSwarmFailure = deepFreeze({
      failureId:
        this.dependencies.idGenerator.generate(
          "swarm-failure",
          stableSeed({
            code: failure.code,
            message: failure.message,
            stage: failure.stage,
            detectedAtMs,
          }),
        ),
      type: mapFailureType(failure),
      code: failure.code,
      message: failure.message,
      ...(failure.nodeId === undefined
        ? {}
        : { nodeId: failure.nodeId }),
      ...(failure.partitionId === undefined
        ? {}
        : { partitionId: failure.partitionId }),
      retryable: failure.retryable,
      fatal: failure.fatal,
      detectedAtMs,
      ...(failure.metadata === undefined
        ? {}
        : { metadata: failure.metadata }),
    });

    this.state.failures.push(value);
    trimFromStart(
      this.state.failures,
      this.options.retainFailures,
    );
  }

  private replaceTrustScores(
    scores: readonly TradingSwarmNodeTrustScore[],
  ): void {
    this.state.nodeTrustScores.clear();

    for (const score of scores) {
      this.state.nodeTrustScores.set(
        score.nodeId,
        deepFreeze(score),
      );
    }
  }

  private applyTrustUpdates(
    updates: readonly TradingSwarmTrustUpdate[],
  ): void {
    for (const update of updates) {
      this.state.nodeTrustScores.set(
        update.nodeId,
        deepFreeze(update.current),
      );
    }
  }

  private createTelemetry(
    topology: ReturnType<
      AiTradingSwarmDependencies["registry"]["topology"]
    >,
    nodes: readonly TradingSwarmNodeRegistration[],
    capturedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmTelemetry {
    const health = nodes
      .map((node) =>
        this.dependencies.registry.health(
          node.identity.nodeId,
        ),
      )
      .filter(isDefined);

    const healthyNodeCount = health.filter(
      (item) => item.healthy,
    ).length;
    const activeNodeCount = health.filter(
      (item) =>
        item.lifecycleState === "ACTIVE" ||
        item.lifecycleState === "READY",
    ).length;
    const degradedNodeCount = health.filter(
      (item) =>
        item.lifecycleState === "DEGRADED",
    ).length;
    const activePartitionCount =
      topology.partitions.filter(
        (partition) =>
          partition.state === "ACTIVE",
      ).length;
    const migratingPartitionCount =
      topology.partitions.filter(
        (partition) =>
          partition.state === "MIGRATING",
      ).length;

    const totalRuns =
      this.state.completedRunCount +
      this.state.failedRunCount;
    const totalTasks =
      this.state.completedTaskCount +
      this.state.failedTaskCount;
    const totalExecutions =
      this.state.completedExecutionCount +
      this.state.failedExecutionCount;

    const valueWithoutFingerprint = {
      swarmId: this.options.swarm.swarmId,
      capturedAtMs,
      registeredNodeCount: nodes.length,
      healthyNodeCount,
      activeNodeCount,
      degradedNodeCount,
      activeMissionCount: this.state.activeRunCount,
      activeTaskCount: health.reduce(
        (sum, item) =>
          sum + item.activeTaskCount,
        0,
      ),
      activePartitionCount,
      migratingPartitionCount,
      averageNodeReliability: average(
        health.map(
          (item) => item.reliabilityScore,
        ),
      ),
      averageSynchronizationScore: average(
        health.map(
          (item) => item.synchronizationScore,
        ),
      ),
      averageConsensusParticipation: average(
        health.map(
          (item) =>
            item.consensusParticipationScore,
        ),
      ),
      averageMissionConfidence:
        this.state.completedRunCount === 0
          ? 0
          : clamp01(
              this.state.totalMissionConfidence /
                this.state.completedRunCount,
            ),
      missionSuccessRate:
        totalRuns === 0
          ? 0
          : clamp01(
              this.state.completedRunCount /
                totalRuns,
            ),
      taskSuccessRate:
        totalTasks === 0
          ? 0
          : clamp01(
              this.state.completedTaskCount /
                totalTasks,
            ),
      executionSuccessRate:
        totalExecutions === 0
          ? 0
          : clamp01(
              this.state.completedExecutionCount /
                totalExecutions,
            ),
    };

    return deepFreeze({
      ...valueWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          valueWithoutFingerprint,
        ),
    });
  }
}

/* ========================================================================== *
 * Factory
 * ========================================================================== */

export function createAiTradingSwarmOrchestrator(
  dependencies: AiTradingSwarmDependencies,
  options: AiTradingSwarmOrchestratorOptions,
): AiTradingSwarmOrchestrator {
  return new AiTradingSwarmOrchestrator(
    dependencies,
    options,
  );
}

/* ========================================================================== *
 * Pure helpers
 * ========================================================================== */

function createPipelineContext(
  request: AiTradingSwarmRunRequest,
  runId: string,
  startedAtMs: TradingSwarmTimestamp,
  validation: MultiAgentValidationResult<AiTradingSwarmRunRequest>,
): PipelineContext {
  return {
    request,
    runId,
    startedAtMs,
    validation,
    completedStages: [],
    stageTimings: [],
    nodeIds: new Set(),
    partitionIds: new Set(),
    taskIds: new Set(),
    localRunIds: new Set(),
    ballotIds: new Set(),
    eventIds: new Set(),
    checkpointIds: new Set(),
    warnings: [],
    errors: [],
  };
}

function normalizeOptions(
  options: AiTradingSwarmOrchestratorOptions,
): AiTradingSwarmOrchestrator["options"] {
  if (
    options === null ||
    typeof options !== "object"
  ) {
    throw new AiTradingSwarmOrchestratorError(
      "INVALID_OPTIONS",
      "Orchestrator options are required.",
    );
  }

  const retainRecentDecisions =
    options.retainRecentDecisions ??
    DEFAULT_RETAIN_RECENT_DECISIONS;
  const retainFailures =
    options.retainFailures ??
    DEFAULT_RETAIN_FAILURES;

  assertPositiveInteger(
    retainRecentDecisions,
    "retainRecentDecisions",
  );
  assertPositiveInteger(
    retainFailures,
    "retainFailures",
  );

  return deepFreeze({
    swarm: options.swarm,
    authority: options.authority,
    initialLifecycleState:
      options.initialLifecycleState ?? "READY",
    retainRecentDecisions,
    retainFailures,
    persistSnapshots:
      options.persistSnapshots ?? true,
    checkpointEverySuccessfulRun:
      options.checkpointEverySuccessfulRun ?? true,
    failRunOnCheckpointError:
      options.failRunOnCheckpointError ?? true,
    failRunOnPublicationError:
      options.failRunOnPublicationError ?? false,
    failRunOnPersistenceError:
      options.failRunOnPersistenceError ?? true,
  });
}

function assertDependencies(
  dependencies: AiTradingSwarmDependencies,
): void {
  if (
    dependencies === null ||
    typeof dependencies !== "object"
  ) {
    throw new AiTradingSwarmOrchestratorError(
      "INVALID_DEPENDENCIES",
      "Trading swarm dependencies are required.",
    );
  }

  const required = [
    "registry",
    "contextBuilder",
    "leaderElection",
    "partitionManager",
    "missionPlanner",
    "taskPlanner",
    "taskAllocator",
    "localCollectiveExecutor",
    "contributionAggregator",
    "candidateAssembler",
    "consensusEngine",
    "riskEngine",
    "governanceEngine",
    "decisionAssembler",
    "executionPlanner",
    "recoveryManager",
    "checkpointStore",
    "trustEngine",
    "explainabilityEngine",
    "validator",
    "clock",
    "idGenerator",
    "fingerprintGenerator",
  ] as const;

  for (const key of required) {
    if (dependencies[key] === undefined) {
      throw new AiTradingSwarmOrchestratorError(
        "INVALID_DEPENDENCIES",
        `Missing required trading swarm dependency: ${key}.`,
      );
    }
  }
}

function createRunFailure(
  code: string,
  message: string,
  stage: TradingSwarmPipelineStage | undefined,
  retryable: boolean,
  fatal: boolean,
  cause?: unknown,
): AiTradingSwarmRunFailure {
  return deepFreeze({
    code,
    message,
    ...(stage === undefined ? {} : { stage }),
    retryable,
    fatal,
    ...(cause === undefined
      ? {}
      : { cause: causeMessage(cause) }),
  });
}

function determineSuccessfulMissionStatus(
  context: PipelineContext,
): Extract<
  TradingSwarmMissionStatus,
  "COMPLETED" | "COMPLETED_WITH_WARNINGS"
> {
  return context.warnings.length === 0
    ? "COMPLETED"
    : "COMPLETED_WITH_WARNINGS";
}

function mapFailureStatus(
  failure: AiTradingSwarmRunFailure,
): Extract<
  TradingSwarmMissionStatus,
  | "DEFERRED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
> {
  if (
    failure.code === "CONCURRENCY_LIMIT_REACHED"
  ) {
    return "DEFERRED";
  }

  if (
    failure.code.includes("VALIDATION") ||
    failure.code ===
      "EXECUTION_COORDINATOR_REQUIRED"
  ) {
    return "REJECTED";
  }

  if (failure.code.includes("TIMEOUT")) {
    return "TIMED_OUT";
  }

  if (failure.code.includes("CANCEL")) {
    return "CANCELLED";
  }

  return "FAILED";
}

function mapFailureType(
  failure: AiTradingSwarmRunFailure,
): TradingSwarmFailure["type"] {
  switch (failure.stage) {
    case "LEADER_ELECTION":
      return "LEADER_FAILURE";
    case "PARTITION_PLANNING":
      return "PARTITION_FAILURE";
    case "DISTRIBUTED_CONSENSUS":
      return "CONSENSUS_FAILURE";
    case "LOCAL_MULTI_AGENT_EXECUTION":
    case "TASK_ASSIGNMENT":
      return "TASK_FAILURE";
    case "EXECUTION_PLANNING":
    case "EXECUTION":
      return "EXECUTION_FAILURE";
    case "CHECKPOINTING":
      return "PERSISTENCE_FAILURE";
    case "GOVERNANCE":
      return "GOVERNANCE_FAILURE";
    default:
      return "UNKNOWN";
  }
}

function createLearningObservations(
  mission: TradingSwarmMission,
  contributions: readonly TradingSwarmNodeContribution[],
  executionState: TradingSwarmExecutionState | undefined,
  observedAtMs: TradingSwarmTimestamp,
): readonly TradingSwarmLearningObservation[] {
  const executionQuality =
    executionState === undefined
      ? 1
      : executionState.status === "COMPLETED"
        ? 1
        : executionState.status ===
            "PARTIALLY_COMPLETED"
          ? 0.5
          : 0;

  return deepFreeze(
    [...contributions]
      .sort((left, right) =>
        left.nodeId.localeCompare(right.nodeId),
      )
      .map((contribution) => ({
        nodeId: contribution.nodeId,
        missionId: mission.missionId,
        predictedConfidence:
          contribution.confidence,
        realizedCorrectness:
          contribution.observations.every(
            (observation) =>
              observation.errors.length === 0,
          )
            ? 1
            : 0,
        utilityContribution:
          contribution.utilityContribution,
        riskContribution:
          contribution.riskContribution,
        executionQuality,
        collaborationQuality:
          contribution.reliabilityScore,
        observedAtMs,
      })),
  );
}

function summarizeActiveMissions(
  topology: ReturnType<
    AiTradingSwarmDependencies["registry"]["topology"]
  >,
  activeRunCount: number,
): readonly TradingSwarmMissionSummary[] {
  if (activeRunCount === 0) {
    return Object.freeze([]);
  }

  const summary: TradingSwarmMissionSummary =
    deepFreeze({
      missionId: `active:${topology.swarmId}`,
      objective: "FULL_SWARM_DECISION",
      status: "RUNNING",
      priority: "NORMAL",
      participatingNodeIds: Object.freeze(
        topology.nodes
          .map(
            (node) =>
              node.registration.identity.nodeId,
          )
          .sort((left, right) =>
            left.localeCompare(right),
          ),
      ),
      completedTaskCount: 0,
      failedTaskCount: 0,
      progress: 0,
    });

  return Object.freeze([summary]);
}

function withMissionStatus(
  mission: TradingSwarmMission,
  status: TradingSwarmMissionStatus,
): TradingSwarmMission {
  return deepFreeze({
    ...mission,
    status,
  });
}

function compareAssignments(
  left: TradingSwarmTaskAssignment,
  right: TradingSwarmTaskAssignment,
): number {
  return (
    left.task.taskId.localeCompare(
      right.task.taskId,
    ) ||
    left.node.identity.nodeId.localeCompare(
      right.node.identity.nodeId,
    )
  );
}

function extractLocalRunId(
  run: Awaited<
    ReturnType<
      AiTradingSwarmDependencies["localCollectiveExecutor"]["execute"]
    >
  >,
): string {
  const outcome = run.outcome as unknown as {
    readonly runId?: string;
  };

  return (
    outcome.runId ??
    `${run.nodeId}:${run.taskId}:${run.startedAtMs}`
  );
}

function summarizeValidationFailure<TValue>(
  prefix: string,
  validation: MultiAgentValidationResult<TValue>,
): string {
  const messages = validation.issues
    .slice(0, 5)
    .map(
      (issue) =>
        `${issue.code}@${issue.path}: ${issue.message}`,
    );

  return messages.length === 0
    ? prefix
    : `${prefix} ${messages.join(" | ")}`;
}

function lastStage(
  context: PipelineContext,
): TradingSwarmPipelineStage | undefined {
  return context.completedStages[
    context.completedStages.length - 1
  ];
}

function isRetryableCode(
  code: AiTradingSwarmOrchestratorErrorCode,
): boolean {
  return (
    code === "CONCURRENCY_LIMIT_REACHED" ||
    code === "PIPELINE_STAGE_FAILED" ||
    code === "CHECKPOINT_FAILED" ||
    code === "PERSISTENCE_FAILED" ||
    code === "PUBLICATION_FAILED"
  );
}

function isFatalCode(
  code: AiTradingSwarmOrchestratorErrorCode,
): boolean {
  return (
    code === "INVALID_DEPENDENCIES" ||
    code === "INVALID_OPTIONS" ||
    code === "REQUEST_VALIDATION_FAILED" ||
    code ===
      "CONFIGURATION_VALIDATION_FAILED" ||
    code === "MISSION_VALIDATION_FAILED" ||
    code === "DECISION_VALIDATION_FAILED"
  );
}

function causeMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === "string") {
    return cause;
  }

  try {
    return JSON.stringify(
      normalizeForStableJson(cause),
    );
  } catch {
    return String(cause);
  }
}

function stableSeed(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value));
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
      .sort(compareNormalized);
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
      const item = (
        value as Record<string, unknown>
      )[key];

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

function compareNormalized(
  left: unknown,
  right: unknown,
): number {
  return JSON.stringify(left).localeCompare(
    JSON.stringify(right),
  );
}

function sorted(
  values: ReadonlySet<string>,
): readonly string[] {
  return Object.freeze(
    [...values].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0;
  }

  return clamp01(
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length,
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function trimFromStart<TValue>(
  values: TValue[],
  maximum: number,
): void {
  if (values.length > maximum) {
    values.splice(0, values.length - maximum);
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
    throw new AiTradingSwarmOrchestratorError(
      "INVALID_OPTIONS",
      `${field} must be a positive integer.`,
    );
  }
}

function isDefined<TValue>(
  value: TValue | undefined,
): value is TValue {
  return value !== undefined;
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

// End of ai-trading-swarm-orchestrator.ts