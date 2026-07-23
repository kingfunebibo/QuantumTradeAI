/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/
 * ai-multi-agent-intelligence-orchestrator.ts
 *
 * Deterministic production orchestrator for the complete collaborative
 * multi-agent decision pipeline.
 */

import {
  AI_MULTI_AGENT_SCHEMA_VERSION,
  type AiMultiAgentIntelligenceDependencies,
  type AiMultiAgentIntelligenceOrchestratorPort,
  type MultiAgentAuditTrace,
  type MultiAgentCalibrationObservation,
  type MultiAgentCapability,
  type MultiAgentCollectiveDecision,
  type MultiAgentExecutionOutcome,
  type MultiAgentHealthSnapshot,
  type MultiAgentId,
  type MultiAgentManagerSnapshot,
  type MultiAgentMemoryRecord,
  type MultiAgentPipelineStage,
  type MultiAgentPublicationTopic,
  type MultiAgentRegistration,
  type MultiAgentRunFailure,
  type MultiAgentRunId,
  type MultiAgentRunRequest,
  type MultiAgentRunResult,
  type MultiAgentRunStatus,
  type MultiAgentSequence,
  type MultiAgentStageTiming,
  type MultiAgentTask,
  type MultiAgentTaskType,
  type MultiAgentTerminalReason,
  type MultiAgentTimestamp,
  type MultiAgentTrustScore,
  type MultiAgentValidationResult,
} from "./ai-multi-agent-contracts";

interface MutableRunState {
  readonly runId: MultiAgentRunId;
  readonly sessionId: string;
  readonly startedAtMs: import("./ai-multi-agent-contracts").MultiAgentTimestamp;
  readonly traceId: string;
  sequence: number;
  completedStages: MultiAgentPipelineStage[];
  stageTimings: MultiAgentStageTiming[];
  taskIds: string[];
  proposalIds: string[];
  reviewIds: string[];
  voteIds: string[];
  conflictIds: string[];
  warnings: string[];
  errors: string[];
}

interface OrchestratorCounters {
  totalRuns: number;
  completedRuns: number;
  rejectedRuns: number;
  failedRuns: number;
  confidenceTotal: number;
  participationTotal: number;
}

const EMPTY_LOGGER = Object.freeze({
  debug: (_message: string): void => undefined,
  info: (_message: string): void => undefined,
  warn: (_message: string): void => undefined,
  error: (_message: string): void => undefined,
});

const OBJECTIVE_TASK_TYPE: Readonly<
  Record<MultiAgentRunRequest["objective"], MultiAgentTaskType>
> = Object.freeze({
  MARKET_ASSESSMENT: "ASSESS_MARKET",
  TRADE_DECISION: "ANALYZE_CONTEXT",
  STRATEGY_ORCHESTRATION: "ASSESS_STRATEGY",
  PORTFOLIO_REBALANCE: "ASSESS_PORTFOLIO",
  RISK_RESPONSE: "ASSESS_RISK",
  ARBITRAGE_DECISION: "ASSESS_ARBITRAGE",
  EXECUTION_REVIEW: "ANALYZE_CONTEXT",
  FULL_COLLABORATIVE_DECISION: "ANALYZE_CONTEXT",
});

const OBJECTIVE_CAPABILITIES: Readonly<
  Record<
    MultiAgentRunRequest["objective"],
    readonly MultiAgentCapability[]
  >
> = Object.freeze({
  MARKET_ASSESSMENT: Object.freeze([
    "OBSERVE_MARKET_INTELLIGENCE",
    "ASSESS_MARKET_REGIME",
  ] satisfies readonly MultiAgentCapability[]),
  TRADE_DECISION: Object.freeze([
    "OBSERVE_MARKET_INTELLIGENCE",
    "PROPOSE_DECISION",
  ] satisfies readonly MultiAgentCapability[]),
  STRATEGY_ORCHESTRATION: Object.freeze([
    "ASSESS_STRATEGY",
    "SELECT_STRATEGIES",
  ] satisfies readonly MultiAgentCapability[]),
  PORTFOLIO_REBALANCE: Object.freeze([
    "ASSESS_PORTFOLIO",
    "ASSESS_RISK",
  ] satisfies readonly MultiAgentCapability[]),
  RISK_RESPONSE: Object.freeze([
    "ASSESS_RISK",
  ] satisfies readonly MultiAgentCapability[]),
  ARBITRAGE_DECISION: Object.freeze([
    "ASSESS_ARBITRAGE",
    "ASSESS_LIQUIDITY",
  ] satisfies readonly MultiAgentCapability[]),
  EXECUTION_REVIEW: Object.freeze([
    "REVIEW_PROPOSAL",
    "ASSESS_RISK",
  ] satisfies readonly MultiAgentCapability[]),
  FULL_COLLABORATIVE_DECISION: Object.freeze([
    "OBSERVE_MARKET_INTELLIGENCE",
    "ASSESS_RISK",
    "PROPOSE_DECISION",
  ] satisfies readonly MultiAgentCapability[]),
});

export interface AiMultiAgentIntelligenceOrchestratorOptions {
  readonly managerId?: MultiAgentId;
  readonly maximumRecentDecisions?: number;
  readonly maximumActiveRuns?: number;
}

export class AiMultiAgentIntelligenceOrchestrator
  implements AiMultiAgentIntelligenceOrchestratorPort
{
  private readonly managerId: MultiAgentId;
  private readonly maximumRecentDecisions: number;
  private readonly maximumActiveRuns: number;
  private readonly activeRunIds = new Set<MultiAgentRunId>();
  private readonly recentDecisions: MultiAgentCollectiveDecision[] = [];
  private readonly counters: OrchestratorCounters = {
    totalRuns: 0,
    completedRuns: 0,
    rejectedRuns: 0,
    failedRuns: 0,
    confidenceTotal: 0,
    participationTotal: 0,
  };
  private trustScores: readonly MultiAgentTrustScore[] = Object.freeze([]);

  public constructor(
    private readonly dependencies: AiMultiAgentIntelligenceDependencies,
    options: AiMultiAgentIntelligenceOrchestratorOptions = {},
  ) {
    validateDependencies(dependencies);

    this.managerId =
      options.managerId ??
      dependencies.idGenerator.generate(
        "multi-agent-manager",
        AI_MULTI_AGENT_SCHEMA_VERSION,
      );
    this.maximumRecentDecisions =
      options.maximumRecentDecisions ?? 100;
    this.maximumActiveRuns = options.maximumActiveRuns ?? 32;

    assertPositiveSafeInteger(
      this.maximumRecentDecisions,
      "maximumRecentDecisions",
    );
    assertPositiveSafeInteger(
      this.maximumActiveRuns,
      "maximumActiveRuns",
    );
  }

  public async run(
    request: MultiAgentRunRequest,
  ): Promise<MultiAgentExecutionOutcome> {
    const startedAtMs = this.dependencies.clock.now();
    const runId = this.dependencies.idGenerator.generate(
      "multi-agent-run",
      stableSeed([
        request.requestId,
        request.requestedAtMs,
        request.objective,
      ]),
    );
    const sessionId = this.dependencies.idGenerator.generate(
      "multi-agent-session",
      stableSeed([request.requestId, runId]),
    );
    const traceId = this.dependencies.idGenerator.generate(
      "multi-agent-trace",
      stableSeed([runId, sessionId]),
    );

    const state: MutableRunState = {
      runId,
      sessionId,
      startedAtMs,
      traceId,
      sequence: 0,
      completedStages: [],
      stageTimings: [],
      taskIds: [],
      proposalIds: [],
      reviewIds: [],
      voteIds: [],
      conflictIds: [],
      warnings: [],
      errors: [],
    };

    this.counters.totalRuns += 1;

    if (this.activeRunIds.size >= this.maximumActiveRuns) {
      return this.rejectBeforeActivation(
        request,
        state,
        "MAXIMUM_ACTIVE_RUNS_EXCEEDED",
        "The multi-agent orchestrator has reached its active-run capacity.",
      );
    }

    this.activeRunIds.add(runId);

    const logger = this.dependencies.logger ?? EMPTY_LOGGER;
    logger.info("Multi-agent run started.", {
      runId,
      requestId: request.requestId,
      objective: request.objective,
    });

    try {
      await this.publish(
        "RUN_STARTED",
        state,
        request.requestId,
        Object.freeze({
          requestId: request.requestId,
          objective: request.objective,
        }),
        request.configuration.publishEvents,
      );

      const validation = await this.executeStage(
        state,
        "VALIDATION",
        () => this.dependencies.validator.validateRequest(request),
      );

      if (!validation.valid || validation.value === undefined) {
        return await this.rejectInvalidRequest(
          request,
          validation,
          state,
        );
      }

      const validatedRequest = validation.value;

      const context = await this.executeStage(
        state,
        "CONTEXT_BUILDING",
        () => this.dependencies.contextBuilder.build(validatedRequest),
      );

      const registrations = this.sortedRegistrations(
        this.dependencies.registry.list(),
      );
      const health = registrations
        .map((registration) =>
          this.dependencies.registry.health(registration.identity.agentId),
        )
        .filter(
          (
            snapshot,
          ): snapshot is MultiAgentHealthSnapshot =>
            snapshot !== undefined,
        )
        .sort(compareHealth);

      this.trustScores = this.dependencies.trustEngine.assess(
        registrations,
        Object.freeze([]),
        validatedRequest.configuration.trust,
      );

      const selectedAgents = await this.executeStage(
        state,
        "AGENT_SELECTION",
        () =>
          this.dependencies.selector.select(
            validatedRequest,
            registrations,
            health,
            this.trustScores,
          ),
      );

      if (
        selectedAgents.length <
        validatedRequest.configuration.agentSelection.minimumAgents
      ) {
        return await this.completeTerminalFailure(
          validatedRequest,
          validation,
          state,
          "REJECTED",
          "INSUFFICIENT_AGENT_QUORUM",
          {
            code: "INSUFFICIENT_AGENT_QUORUM",
            message:
              "Agent selection did not satisfy the configured minimum quorum.",
            stage: "AGENT_SELECTION",
            retryable: true,
          },
          selectedAgents,
        );
      }

      await this.publish(
        "AGENTS_SELECTED",
        state,
        request.requestId,
        Object.freeze({
          selectedAgentIds: Object.freeze(
            selectedAgents.map((agent) => agent.identity.agentId),
          ),
        }),
        validatedRequest.configuration.publishEvents,
      );

      const tasks = this.createTasks(
        validatedRequest,
        selectedAgents,
        state,
      );

      const observations = await this.executeStage(
        state,
        "TASK_DISPATCH",
        () =>
          this.dependencies.taskDispatcher.dispatch(
            tasks,
            selectedAgents,
            context,
          ),
      );

      await this.publish(
        "OBSERVATIONS_COMPLETED",
        state,
        request.requestId,
        Object.freeze({
          observationCount: observations.length,
        }),
        validatedRequest.configuration.publishEvents,
      );

      const proposals = await this.executeStage(
        state,
        "PROPOSAL_GENERATION",
        () =>
          this.dependencies.proposalEngine.propose(
            validatedRequest,
            selectedAgents,
            observations,
          ),
      );
      state.proposalIds.push(
        ...proposals.map((proposal) => proposal.proposalId),
      );

      const reviews = await this.executeStage(
        state,
        "PEER_REVIEW",
        () =>
          this.dependencies.peerReviewEngine.review(
            proposals,
            selectedAgents,
            context,
          ),
      );
      state.reviewIds.push(
        ...reviews.map((review) => review.reviewId),
      );

      const debate =
        validatedRequest.configuration.debate.enabled &&
        proposals.length > 1
          ? await this.executeStage(
              state,
              "DEBATE",
              () =>
                this.dependencies.debateEngine.debate(
                  proposals,
                  reviews,
                  selectedAgents,
                  validatedRequest.configuration.debate,
                ),
            )
          : undefined;

      if (debate !== undefined) {
        await this.publish(
          "DEBATE_COMPLETED",
          state,
          request.requestId,
          Object.freeze({
            sessionId: debate.sessionId,
            roundCount: debate.roundsCompleted,
          }),
          validatedRequest.configuration.publishEvents,
        );
      }

      const conflicts = await this.executeStage(
        state,
        "CONFLICT_RESOLUTION",
        () =>
          this.dependencies.conflictResolver.detect(
            proposals,
            reviews,
          ),
      );
      state.conflictIds.push(
        ...conflicts.map((conflict) => conflict.conflictId),
      );

      const resolvedConflicts =
        conflicts.length === 0
          ? Object.freeze([])
          : await this.dependencies.conflictResolver.resolve(
              conflicts,
              proposals,
              debate,
              selectedAgents,
            );

      const consensus = await this.executeStage(
        state,
        "CONSENSUS_FORMATION",
        () =>
          this.dependencies.consensusEngine.form(
            proposals,
            reviews,
            resolvedConflicts,
            selectedAgents,
            this.trustScores,
            validatedRequest.configuration.consensus,
          ),
      );
      state.voteIds.push(
        ...consensus.votes.map((vote) => vote.voteId),
      );

      await this.publish(
        "CONSENSUS_FORMED",
        state,
        request.requestId,
        Object.freeze({
          consensusId: consensus.consensusId,
          status: consensus.status,
          selectedProposalId:
            consensus.selectedProposalId ?? null,
        }),
        validatedRequest.configuration.publishEvents,
      );

      const selectedProposal = proposals.find(
        (proposal) =>
          proposal.proposalId === consensus.selectedProposalId,
      );

      const governance = await this.executeStage(
        state,
        "GOVERNANCE",
        () =>
          this.dependencies.governanceEngine.evaluate(
            validatedRequest,
            selectedProposal,
            consensus,
            validatedRequest.configuration.governanceRules,
            validatedRequest.configuration.safety,
          ),
      );

      await this.publish(
        "GOVERNANCE_EVALUATED",
        state,
        request.requestId,
        Object.freeze({
          decision: governance.decision,
          approvalRequirement:
            governance.approvalRequirement,
        }),
        validatedRequest.configuration.publishEvents,
      );

      let decision = await this.executeStage(
        state,
        "DECISION_ASSEMBLY",
        () =>
          this.dependencies.decisionAssembler.assemble(
            validatedRequest,
            proposals,
            consensus,
            governance,
          ),
      );

      const decisionValidation =
        this.dependencies.validator.validateDecision(decision);

      if (!decisionValidation.valid) {
        throw new Error(
          `Decision validation failed: ${decisionValidation.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        );
      }

      const executionHandoff = await this.executeStage(
        state,
        "EXECUTION_PLANNING",
        () =>
          this.dependencies.executionPlanner.plan(
            validatedRequest,
            decision,
            validatedRequest.configuration.execution,
          ),
      );

      decision = deepFreeze({
        ...decision,
        executionHandoff,
      });

      const explanation = await this.executeStage(
        state,
        "EXPLAINABILITY",
        () =>
          this.dependencies.explainabilityEngine.explain(
            validatedRequest,
            {
              agents: selectedAgents,
              observations,
              proposals,
              reviews,
              ...(debate === undefined ? {} : { debate }),
              consensus,
              decision,
            },
            validatedRequest.configuration.explainability,
          ),
      );

      const calibrationObservations =
        this.createCalibrationObservations(
          state,
          selectedAgents,
          consensus.collectiveConfidence.finalConfidence,
        );

      const trustUpdates = this.dependencies.trustEngine.update(
        this.trustScores,
        calibrationObservations,
        validatedRequest.configuration.trust,
      );
      this.trustScores = Object.freeze(
        trustUpdates.map((update) => update.current),
      );

      this.writeOutcomeMemory(
        validatedRequest,
        state,
        decision,
        selectedAgents,
      );

      const completedAtMs = this.dependencies.clock.now();
      const status: MultiAgentRunStatus =
        state.warnings.length > 0
          ? "COMPLETED_WITH_WARNINGS"
          : "COMPLETED";
      const terminalReason: MultiAgentTerminalReason =
        state.warnings.length > 0
          ? "SUCCESS_WITH_WARNINGS"
          : "SUCCESS";

      const trace = this.completeTrace(state, completedAtMs);
      const resultWithoutFingerprint = {
        runId,
        requestId: validatedRequest.requestId,
        sessionId,
        status,
        terminalReason,
        validation,
        selectedAgents: Object.freeze([...selectedAgents]),
        observations: Object.freeze([...observations]),
        proposals: Object.freeze([...proposals]),
        reviews: Object.freeze([...reviews]),
        ...(debate === undefined ? {} : { debate }),
        conflicts: Object.freeze([...conflicts]),
        consensus,
        decision,
        explanation,
        trustUpdates: Object.freeze([...trustUpdates]),
        failures: Object.freeze([]),
        trace,
        startedAtMs,
        completedAtMs,
      };

      const result: MultiAgentRunResult = deepFreeze({
        ...resultWithoutFingerprint,
        deterministicFingerprint:
          this.dependencies.fingerprintGenerator.fingerprint(
            resultWithoutFingerprint,
          ),
      });

      await this.publish(
        "DECISION_COMPLETED",
        state,
        request.requestId,
        Object.freeze({
          decisionId: decision.decisionId,
          status,
        }),
        validatedRequest.configuration.publishEvents,
      );

      if (executionHandoff.executionAuthorized) {
        await this.publish(
          "EXECUTION_HANDOFF",
          state,
          request.requestId,
          Object.freeze({
            planId: executionHandoff.planId,
            actionCount: executionHandoff.actions.length,
          }),
          validatedRequest.configuration.publishEvents,
        );
      }

      await this.dependencies.persistence?.saveRun(result);

      this.recordSuccessfulResult(result);
      await this.persistSnapshot();

      logger.info("Multi-agent run completed.", {
        runId,
        status,
        decisionId: decision.decisionId,
      });

      return result;
    } catch (error: unknown) {
      logger.error("Multi-agent run failed.", {
        runId,
        error: errorMessage(error),
      });

      return await this.handleUnexpectedFailure(
        request,
        state,
        error,
      );
    } finally {
      this.activeRunIds.delete(runId);
    }
  }

  public snapshot(): MultiAgentManagerSnapshot {
    const capturedAtMs = this.dependencies.clock.now();
    const registrations = this.sortedRegistrations(
      this.dependencies.registry.list(),
    );
    const health = registrations
      .map((registration) =>
        this.dependencies.registry.health(registration.identity.agentId),
      )
      .filter(
        (
          value,
        ): value is MultiAgentHealthSnapshot =>
          value !== undefined,
      )
      .sort(compareHealth);
    const memory = [...this.dependencies.memory.read()].sort(
      compareMemory,
    );
    const averageCollectiveConfidence =
      this.counters.completedRuns === 0
        ? 0
        : clamp01(
            this.counters.confidenceTotal /
              this.counters.completedRuns,
          );
    const averageConsensusParticipation =
      this.counters.completedRuns === 0
        ? 0
        : clamp01(
            this.counters.participationTotal /
              this.counters.completedRuns,
          );

    const snapshotWithoutFingerprint = {
      schemaVersion: AI_MULTI_AGENT_SCHEMA_VERSION,
      managerId: this.managerId,
      capturedAtMs,
      registrations: Object.freeze(registrations),
      health: Object.freeze(health),
      trustScores: Object.freeze([...this.trustScores]),
      activeRunIds: Object.freeze(
        [...this.activeRunIds].sort(compareText),
      ),
      recentDecisions: Object.freeze(
        [...this.recentDecisions].sort(
          (left, right) =>
            right.decidedAtMs - left.decidedAtMs ||
            compareText(left.decisionId, right.decisionId),
        ),
      ),
      memory: Object.freeze(memory),
      totalRuns: this.counters.totalRuns,
      completedRuns: this.counters.completedRuns,
      rejectedRuns: this.counters.rejectedRuns,
      failedRuns: this.counters.failedRuns,
      averageCollectiveConfidence,
      averageConsensusParticipation,
    };

    return deepFreeze({
      ...snapshotWithoutFingerprint,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          snapshotWithoutFingerprint,
        ),
    });
  }

  private async executeStage<T>(
    state: MutableRunState,
    stage: MultiAgentPipelineStage,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    const startedAtMs = this.dependencies.clock.now();

    try {
      const result = await operation();
      const completedAtMs = this.dependencies.clock.now();

      state.completedStages.push(stage);
      state.stageTimings.push(
        Object.freeze({
          stage,
          startedAtMs,
          completedAtMs,
          durationMs: Math.max(0, completedAtMs - startedAtMs),
        }),
      );

      return result;
    } catch (error: unknown) {
      state.errors.push(`${stage}: ${errorMessage(error)}`);
      throw error;
    }
  }

  private createTasks(
    request: MultiAgentRunRequest,
    agents: readonly MultiAgentRegistration[],
    state: MutableRunState,
  ): readonly MultiAgentTask[] {
    const createdAtMs = this.dependencies.clock.now();
    const taskType = OBJECTIVE_TASK_TYPE[request.objective];
    const requiredCapabilities =
      OBJECTIVE_CAPABILITIES[request.objective];

    const tasks = agents.map((agent, index) => {
      const taskId = this.dependencies.idGenerator.generate(
        "multi-agent-task",
        stableSeed([
          state.runId,
          agent.identity.agentId,
          taskType,
          index,
        ]),
      );
      state.taskIds.push(taskId);

      const taskWithoutFingerprint = {
        taskId,
        runId: state.runId,
        sessionId: state.sessionId,
        type: taskType,
        status: "ASSIGNED" as const,
        assignedAgentId: agent.identity.agentId,
        priority:
          request.objective === "RISK_RESPONSE"
            ? ("VERY_HIGH" as const)
            : ("HIGH" as const),
        createdAtMs,
        deadlineAtMs: (
          createdAtMs +
          request.configuration.maximumAgentTaskDurationMs
        ) as import("./ai-multi-agent-contracts").MultiAgentTimestamp,
        requiredCapabilities: Object.freeze(
          requiredCapabilities.filter((capability) =>
            agent.capabilities.some(
              (declaration) =>
                declaration.enabled &&
                declaration.capability === capability,
            ),
          ),
        ),
        dependencies: Object.freeze([]),
        metadata: Object.freeze({
          objective: request.objective,
          requestId: request.requestId,
        }),
      };

      return deepFreeze({
        ...taskWithoutFingerprint,
        inputFingerprint:
          this.dependencies.fingerprintGenerator.fingerprint(
            taskWithoutFingerprint,
          ),
      });
    });

    return Object.freeze(tasks);
  }

  private createCalibrationObservations(
    state: MutableRunState,
    agents: readonly MultiAgentRegistration[],
    collectiveConfidence: number,
  ): readonly MultiAgentCalibrationObservation[] {
    const observedAtMs = this.dependencies.clock.now();

    return Object.freeze(
      agents.map((agent) =>
        Object.freeze({
          agentId: agent.identity.agentId,
          runId: state.runId,
          predictedConfidence: collectiveConfidence,
          realizedCorrectness: collectiveConfidence,
          utilityContribution: collectiveConfidence,
          riskContribution: clamp01(1 - collectiveConfidence),
          observedAtMs,
        }),
      ),
    );
  }

  private writeOutcomeMemory(
    request: MultiAgentRunRequest,
    state: MutableRunState,
    decision: MultiAgentCollectiveDecision,
    agents: readonly MultiAgentRegistration[],
  ): void {
    const now = this.dependencies.clock.now();
    const records: MultiAgentMemoryRecord[] = agents.map(
      (agent) => {
        const value = Object.freeze({
          requestId: request.requestId,
          objective: request.objective,
          decisionId: decision.decisionId,
          decision: decision.decision,
          confidence:
            decision.collectiveConfidence.finalConfidence,
        });
        const base = {
          memoryId: this.dependencies.idGenerator.generate(
            "multi-agent-memory",
            stableSeed([
              state.runId,
              agent.identity.agentId,
              decision.decisionId,
            ]),
          ),
          agentId: agent.identity.agentId,
          category: "OUTCOME" as const,
          key: `${request.objective}:${decision.decisionId}`,
          value,
          confidence:
            decision.collectiveConfidence.finalConfidence,
          createdAtMs: now,
          lastUpdatedAtMs: now,
          sourceRunIds: Object.freeze([state.runId]),
        };

        return deepFreeze({
          ...base,
          deterministicFingerprint:
            this.dependencies.fingerprintGenerator.fingerprint(base),
        });
      },
    );

    this.dependencies.memory.write(Object.freeze(records));
  }

  private async rejectInvalidRequest(
    request: MultiAgentRunRequest,
    validation: MultiAgentValidationResult<MultiAgentRunRequest>,
    state: MutableRunState,
  ): Promise<MultiAgentExecutionOutcome> {
    return await this.completeTerminalFailure(
      request,
      validation,
      state,
      "REJECTED",
      "INVALID_REQUEST",
      {
        code: "INVALID_MULTI_AGENT_REQUEST",
        message: validation.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; "),
        stage: "VALIDATION",
        retryable: false,
      },
      Object.freeze([]),
    );
  }

  private async rejectBeforeActivation(
    request: MultiAgentRunRequest,
    state: MutableRunState,
    code: string,
    message: string,
  ): Promise<MultiAgentExecutionOutcome> {
    const validation =
      this.dependencies.validator.validateRequest(request);

    return await this.completeTerminalFailure(
      request,
      validation,
      state,
      "REJECTED",
      "OPERATOR_DEFERRAL",
      {
        code,
        message,
        retryable: true,
      },
      Object.freeze([]),
    );
  }

  private async completeTerminalFailure(
    request: MultiAgentRunRequest,
    validation: MultiAgentValidationResult<MultiAgentRunRequest>,
    state: MutableRunState,
    status: "FAILED" | "REJECTED" | "CANCELLED",
    terminalReason: MultiAgentTerminalReason,
    failure: MultiAgentRunFailure,
    selectedAgents: readonly MultiAgentRegistration[],
  ): Promise<MultiAgentExecutionOutcome> {
    const completedAtMs = this.dependencies.clock.now();
    state.errors.push(failure.message);
    const trace = this.completeTrace(state, completedAtMs);

    const resultBase = {
      runId: state.runId,
      requestId: request.requestId,
      sessionId: state.sessionId,
      status,
      failure: deepFreeze({
        ...failure,
        metadata: Object.freeze({
          ...(failure.metadata ?? {}),
          terminalReason,
          selectedAgentCount: selectedAgents.length,
        }),
      }),
      validation,
      trace,
    };

    const outcome: MultiAgentExecutionOutcome = deepFreeze({
      ...resultBase,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          resultBase,
        ),
    });

    if (status === "REJECTED") {
      this.counters.rejectedRuns += 1;
    } else {
      this.counters.failedRuns += 1;
    }

    await this.publish(
      "RUN_FAILED",
      state,
      request.requestId,
      Object.freeze({
        code: failure.code,
        status,
        terminalReason,
      }),
      request.configuration.publishEvents,
    );

    await this.persistSnapshot();
    return outcome;
  }

  private async handleUnexpectedFailure(
    request: MultiAgentRunRequest,
    state: MutableRunState,
    error: unknown,
  ): Promise<MultiAgentExecutionOutcome> {
    const validation =
      this.dependencies.validator.validateRequest(request);

    return await this.completeTerminalFailure(
      request,
      validation,
      state,
      "FAILED",
      "INTERNAL_ERROR",
      {
        code: "MULTI_AGENT_RUN_FAILED",
        message: errorMessage(error),
        retryable: false,
        cause:
          error instanceof Error ? error.stack : undefined,
      },
      Object.freeze([]),
    );
  }

  private completeTrace(
    state: MutableRunState,
    completedAtMs: MultiAgentTimestamp,
  ): MultiAgentAuditTrace {
    const traceBase = {
      traceId: state.traceId,
      runId: state.runId,
      sessionId: state.sessionId,
      createdAtMs: state.startedAtMs,
      completedAtMs,
      completedStages: Object.freeze([
        ...state.completedStages,
      ]),
      stageTimings: Object.freeze([...state.stageTimings]),
      taskIds: Object.freeze([...state.taskIds]),
      messageIds: Object.freeze([]),
      proposalIds: Object.freeze([...state.proposalIds]),
      reviewIds: Object.freeze([...state.reviewIds]),
      voteIds: Object.freeze([...state.voteIds]),
      conflictIds: Object.freeze([...state.conflictIds]),
      warnings: Object.freeze([...state.warnings]),
      errors: Object.freeze([...state.errors]),
    };

    return deepFreeze({
      ...traceBase,
      deterministicFingerprint:
        this.dependencies.fingerprintGenerator.fingerprint(
          traceBase,
        ),
    });
  }

  private async publish(
    topic: MultiAgentPublicationTopic,
    state: MutableRunState,
    correlationId: string,
    payload: Readonly<Record<string, unknown>>,
    enabled: boolean,
  ): Promise<void> {
    if (!enabled || this.dependencies.publisher === undefined) {
      return;
    }

    state.sequence += 1;
    const occurredAtMs = this.dependencies.clock.now();
    const eventId = this.dependencies.idGenerator.generate(
      "multi-agent-event",
      stableSeed([
        state.runId,
        topic,
        state.sequence,
        occurredAtMs,
      ]),
    );
    const eventBase = {
      eventId,
      topic,
      runId: state.runId,
      sessionId: state.sessionId,
      occurredAtMs,
      sequence: state.sequence as MultiAgentSequence,
      payload: toJsonValue(payload),
      correlationId,
    };

    await this.dependencies.publisher.publish(
      deepFreeze({
        ...eventBase,
        deterministicFingerprint:
          this.dependencies.fingerprintGenerator.fingerprint(
            eventBase,
          ),
      }),
    );
  }

  private recordSuccessfulResult(
    result: MultiAgentRunResult,
  ): void {
    this.counters.completedRuns += 1;

    if (result.consensus !== undefined) {
      this.counters.confidenceTotal +=
        result.consensus.collectiveConfidence.finalConfidence;
      this.counters.participationTotal +=
        result.consensus.participationRatio;
    }

    if (result.decision !== undefined) {
      this.recentDecisions.push(result.decision);
      this.recentDecisions.sort(
        (left, right) =>
          right.decidedAtMs - left.decidedAtMs ||
          compareText(left.decisionId, right.decisionId),
      );

      if (
        this.recentDecisions.length >
        this.maximumRecentDecisions
      ) {
        this.recentDecisions.length =
          this.maximumRecentDecisions;
      }
    }
  }

  private async persistSnapshot(): Promise<void> {
    if (this.dependencies.persistence === undefined) {
      return;
    }

    await this.dependencies.persistence.saveSnapshot(
      this.snapshot(),
    );
  }

  private sortedRegistrations(
    registrations: readonly MultiAgentRegistration[],
  ): MultiAgentRegistration[] {
    return [...registrations].sort(
      (left, right) =>
        compareText(left.identity.role, right.identity.role) ||
        compareText(left.identity.agentId, right.identity.agentId),
    );
  }
}

export function createAiMultiAgentIntelligenceOrchestrator(
  dependencies: AiMultiAgentIntelligenceDependencies,
  options: AiMultiAgentIntelligenceOrchestratorOptions = {},
): AiMultiAgentIntelligenceOrchestrator {
  return new AiMultiAgentIntelligenceOrchestrator(
    dependencies,
    options,
  );
}

function validateDependencies(
  dependencies: AiMultiAgentIntelligenceDependencies,
): void {
  const required: readonly [
    keyof AiMultiAgentIntelligenceDependencies,
    unknown,
  ][] = Object.freeze([
    ["registry", dependencies.registry],
    ["contextBuilder", dependencies.contextBuilder],
    ["selector", dependencies.selector],
    ["taskDispatcher", dependencies.taskDispatcher],
    ["proposalEngine", dependencies.proposalEngine],
    ["peerReviewEngine", dependencies.peerReviewEngine],
    ["debateEngine", dependencies.debateEngine],
    ["conflictResolver", dependencies.conflictResolver],
    ["consensusEngine", dependencies.consensusEngine],
    ["governanceEngine", dependencies.governanceEngine],
    ["decisionAssembler", dependencies.decisionAssembler],
    ["executionPlanner", dependencies.executionPlanner],
    ["explainabilityEngine", dependencies.explainabilityEngine],
    ["trustEngine", dependencies.trustEngine],
    ["memory", dependencies.memory],
    ["validator", dependencies.validator],
    ["clock", dependencies.clock],
    ["idGenerator", dependencies.idGenerator],
    ["fingerprintGenerator", dependencies.fingerprintGenerator],
  ]);

  for (const [name, value] of required) {
    if (value === null || value === undefined) {
      throw new TypeError(
        `AiMultiAgentIntelligenceDependencies.${String(
          name,
        )} is required.`,
      );
    }
  }
}

function compareHealth(
  left: MultiAgentHealthSnapshot,
  right: MultiAgentHealthSnapshot,
): number {
  return compareText(left.agentId, right.agentId);
}

function compareMemory(
  left: MultiAgentMemoryRecord,
  right: MultiAgentMemoryRecord,
): number {
  return (
    right.lastUpdatedAtMs - left.lastUpdatedAtMs ||
    compareText(left.memoryId, right.memoryId)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableSeed(values: readonly unknown[]): string {
  return values
    .map((value) =>
      typeof value === "string"
        ? value
        : JSON.stringify(value),
    )
    .join("|");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string"
    ? error
    : JSON.stringify(error);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function assertPositiveSafeInteger(
  value: number,
  field: string,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      `${field} must be a positive safe integer.`,
    );
  }
}

function toJsonValue(
  value: unknown,
): import("./ai-multi-agent-contracts").MultiAgentJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => toJsonValue(item)));
  }

  if (typeof value === "object") {
    const result: Record<
      string,
      import("./ai-multi-agent-contracts").MultiAgentJsonValue
    > = {};

    for (const key of Object.keys(
      value as Record<string, unknown>,
    ).sort(compareText)) {
      result[key] = toJsonValue(
        (value as Record<string, unknown>)[key],
      );
    }

    return Object.freeze(result);
  }

  return String(value);
}

function deepFreeze<T>(
  value: T,
  seen: Set<object> = new Set<object>(),
): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;

  if (seen.has(objectValue)) {
    return value;
  }

  seen.add(objectValue);

  for (const key of Reflect.ownKeys(objectValue)) {
    const child = (value as Record<PropertyKey, unknown>)[key];

    if (
      child !== null &&
      (typeof child === "object" ||
        typeof child === "function")
    ) {
      deepFreeze(child, seen);
    }
  }

  return Object.freeze(value);
}